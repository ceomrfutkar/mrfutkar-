import express, { Request, Response } from 'express';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../src/config/firebase';
import { resolveAuthUser } from './auth';
import {
  validatePriceSlabs,
  areDateRangesOverlapping,
  PricingEngine,
} from '../src/services/pricingEngine';
import { ProductPricingRule } from '../src/types/product';

export const pricingRouter = express.Router();

/**
 * Server-authoritative helper to fetch all pricing rules
 */
async function fetchAllPricingRules(): Promise<ProductPricingRule[]> {
  try {
    const snap = await getDocs(collection(db, 'productPricing'));
    return snap.docs.map(d => ({
      id: d.id,
      pricingId: d.id,
      ...(d.data() as any),
    }));
  } catch (err) {
    return [];
  }
}

/**
 * Middleware: Verify caller is Admin
 */
async function requireAdminRole(req: Request, res: Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  const authResult = await resolveAuthUser(authHeader);

  if (!authResult.valid || !authResult.user) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required for pricing management.',
    });
  }

  const role = authResult.user.role;
  const isAdmin =
    role === 'WAREHOUSE_ADMIN' ||
    role === 'WAREHOUSE_MANAGER' ||
    (role as string) === 'ADMIN' ||
    authResult.user.uid === 'wh-admin' ||
    authResult.user.uid === 'WH-ADMIN-01';

  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Only authorized administrators can configure pricing rules.',
    });
  }

  (req as any).user = authResult.user;
  next();
}

/**
 * GET /api/pricing/rules
 * Fetch pricing rules with tenant isolation
 * - Admin can query all rules or filter by productId/retailerId
 * - Retailers can ONLY query global rules or their own rules
 */
pricingRouter.get('/rules', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const authResult = await resolveAuthUser(authHeader);

    if (!authResult.valid || !authResult.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required to view pricing rules.',
      });
    }

    const user = authResult.user;
    const isAdmin =
      user.role === 'WAREHOUSE_ADMIN' ||
      user.role === 'WAREHOUSE_MANAGER' ||
      (user.role as string) === 'ADMIN' ||
      user.uid === 'wh-admin' ||
      user.uid === 'WH-ADMIN-01';

    const requestedRetailerId = req.query.retailerId as string | undefined;
    const productId = req.query.productId as string | undefined;

    // Security Isolation: If not admin, the user cannot query another retailer's pricing!
    if (!isAdmin && requestedRetailerId && requestedRetailerId !== user.uid) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN_RETAILER_MISMATCH',
        message: 'Retailers are forbidden from viewing negotiated pricing of other retailers.',
      });
    }

    const effectiveRetailerId = isAdmin ? requestedRetailerId : user.uid;

    let rules: ProductPricingRule[] = await fetchAllPricingRules();

    // Filter by product if requested
    if (productId) {
      rules = rules.filter(r => r.productId === productId);
    }

    // Filter by retailer identity
    if (effectiveRetailerId) {
      rules = rules.filter(
        r =>
          r.retailerId === effectiveRetailerId ||
          (!r.retailerId && (isAdmin || r.pricingType === 'GLOBAL_SLAB' || !r.pricingType))
      );
    } else if (!isAdmin) {
      // Non-admin without explicit retailerId can only view global rules
      rules = rules.filter(r => !r.retailerId || r.retailerId === '');
    }

    return res.status(200).json({
      success: true,
      rules,
    });
  } catch (err: any) {
    console.error('Error fetching pricing rules:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to fetch pricing rules.',
    });
  }
});

/**
 * GET /api/pricing/effective
 * Authoritative effective price calculation for an authenticated retailer.
 * Enforces tenant isolation: normal retailers can ONLY get their own effective price.
 */
pricingRouter.get('/effective', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const authResult = await resolveAuthUser(authHeader);

    if (!authResult.valid || !authResult.user) {
      console.warn('pricing /effective auth failed:', authResult);
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        authError: authResult.error,
        message: 'Authentication required to determine authorized pricing.',
      });
    }

    const user = authResult.user;
    const isAdmin =
      user.role === 'WAREHOUSE_ADMIN' ||
      user.role === 'WAREHOUSE_MANAGER' ||
      (user.role as string) === 'ADMIN' ||
      user.uid === 'wh-admin' ||
      user.uid === 'WH-ADMIN-01';

    const productId = (req.query.productId as string) || (req.body?.productId as string);
    const qtyParsed = parseInt((req.query.quantity as string) || req.body?.quantity || '1', 10);
    const quantity = isNaN(qtyParsed) || qtyParsed < 1 ? 1 : qtyParsed;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PRODUCT_ID',
        message: 'productId parameter is required.',
      });
    }

    // Tenant isolation: normal retailers strictly get their own UID pricing
    const effectiveRetailerId = isAdmin ? (req.query.retailerId as string) || user.uid : user.uid;

    // Fetch product details
    let product: any = null;
    const prodSnap = await getDoc(doc(db, 'products', productId));
    if (prodSnap.exists()) {
      product = { id: prodSnap.id, productId: prodSnap.id, ...prodSnap.data() };
    } else {
      const { fmcgProducts } = await import('../src/data/fmcgCatalogue');
      product = fmcgProducts.find(p => p.productId === productId || p.id === productId);
    }

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'PRODUCT_NOT_FOUND',
        message: `Product ${productId} not found.`,
      });
    }

    // Fetch applicable active pricing rules
    let rules: ProductPricingRule[] = await fetchAllPricingRules();

    rules = rules.filter(
      r =>
        r.productId === productId &&
        r.active !== false &&
        (r.retailerId === effectiveRetailerId ||
          (!r.retailerId && (r.pricingType === 'GLOBAL_SLAB' || !r.pricingType)))
    );

    const pricing = PricingEngine.resolveProductPrice({
      product,
      quantity,
      retailerId: effectiveRetailerId,
      customerPricingRules: rules,
      now: new Date(),
    });

    return res.status(200).json({
      success: true,
      productId,
      quantity,
      retailerId: effectiveRetailerId,
      pricing,
    });
  } catch (err: any) {
    console.error('Error resolving effective price:', err.stack || err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to calculate effective price.',
      stack: err.stack,
    });
  }
});

/**
 * POST /api/pricing/rules
 * Create a new pricing rule (Admin only)
 * Enforces validation, slab constraints, and overlapping duplicate checks.
 */
pricingRouter.post('/rules', requireAdminRole, async (req: Request, res: Response) => {
  try {
    const {
      productId,
      retailerId,
      pricingType,
      slabs,
      fixedPrice,
      active = true,
      effectiveFrom,
      effectiveTo,
    } = req.body;

    // 1. Validate basic fields
    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PRODUCT_ID',
        message: 'productId is required and must be a string.',
      });
    }

    const validTypes = ['CUSTOMER_SLAB', 'CUSTOMER_FIXED', 'GLOBAL_SLAB', 'DEFAULT'];
    if (!pricingType || !validTypes.includes(pricingType)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PRICING_TYPE',
        message: `pricingType must be one of: ${validTypes.join(', ')}.`,
      });
    }

    // 2. Validate Customer-Specific requirements
    if (pricingType === 'CUSTOMER_FIXED' || pricingType === 'CUSTOMER_SLAB') {
      if (!retailerId || typeof retailerId !== 'string' || retailerId.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_RETAILER_ID',
          message: 'retailerId is strictly required for customer-specific pricing.',
        });
      }
    }

    // 3. Validate Type-Specific Data
    if (pricingType === 'CUSTOMER_FIXED') {
      if (typeof fixedPrice !== 'number' || !Number.isFinite(fixedPrice) || fixedPrice < 0) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_FIXED_PRICE',
          message: 'fixedPrice must be a valid non-negative number.',
        });
      }
    } else if (pricingType === 'CUSTOMER_SLAB' || pricingType === 'GLOBAL_SLAB') {
      if (!slabs || !Array.isArray(slabs) || slabs.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_SLABS',
          message: 'slabs array with at least one slab is required.',
        });
      }

      const slabValidation = validatePriceSlabs(slabs);
      if (!slabValidation.valid) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_SLABS',
          message: slabValidation.error || 'Invalid slab configuration or overlapping slabs detected.',
        });
      }
    }

    // 4. Overlap Validation against existing active rules
    const existingRulesSnap = await getDocs(
      query(
        collection(db, 'productPricing'),
        where('productId', '==', productId)
      )
    );

    const existingRules: ProductPricingRule[] = existingRulesSnap.docs.map(d => ({
      id: d.id,
      ...(d.data() as any),
    }));

    const activeConflicts = existingRules.filter(
      r =>
        r.active !== false &&
        r.pricingType === pricingType &&
        (pricingType === 'GLOBAL_SLAB' ? (!r.retailerId || r.retailerId === '') : r.retailerId === retailerId)
    );

    for (const conflict of activeConflicts) {
      if (areDateRangesOverlapping(conflict.effectiveFrom, conflict.effectiveTo, effectiveFrom, effectiveTo)) {
        return res.status(400).json({
          success: false,
          error: 'DUPLICATE_ACTIVE_PRICING',
          message: `An active ${pricingType} rule already exists with an overlapping effective date range for this product and retailer.`,
        });
      }
    }

    // 5. Create authoritative document
    const pricingId = `RULE-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const newRule: ProductPricingRule = {
      pricingId,
      productId,
      retailerId: retailerId ? String(retailerId).trim() : undefined,
      pricingType,
      fixedPrice: pricingType === 'CUSTOMER_FIXED' ? fixedPrice : undefined,
      slabs: (pricingType === 'CUSTOMER_SLAB' || pricingType === 'GLOBAL_SLAB') ? slabs : undefined,
      active: active !== false,
      effectiveFrom: effectiveFrom || null,
      effectiveTo: effectiveTo || null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await setDoc(doc(db, 'productPricing', pricingId), newRule);

    return res.status(201).json({
      success: true,
      pricingId,
      rule: newRule,
      message: 'Pricing rule configured successfully.',
    });
  } catch (err: any) {
    console.error('Error creating pricing rule:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to create pricing rule.',
    });
  }
});

/**
 * PUT /api/pricing/rules/:ruleId
 * Update an existing pricing rule (Admin only)
 */
pricingRouter.put('/rules/:ruleId', requireAdminRole, async (req: Request, res: Response) => {
  try {
    const { ruleId } = req.params;
    const ruleRef = doc(db, 'productPricing', ruleId);
    const existingSnap = await getDoc(ruleRef);

    if (!existingSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'RULE_NOT_FOUND',
        message: `Pricing rule ${ruleId} does not exist.`,
      });
    }

    const updates = { ...req.body, updatedAt: new Date().toISOString() };
    delete updates.id;
    delete updates.pricingId;

    if (updates.slabs) {
      const slabVal = validatePriceSlabs(updates.slabs);
      if (!slabVal.valid) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_SLABS',
          message: slabVal.error,
        });
      }
    }

    await updateDoc(ruleRef, updates);

    return res.status(200).json({
      success: true,
      ruleId,
      message: 'Pricing rule updated successfully.',
    });
  } catch (err: any) {
    console.error('Error updating pricing rule:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to update pricing rule.',
    });
  }
});

/**
 * DELETE /api/pricing/rules/:ruleId
 * Deactivate or remove a pricing rule (Admin only)
 */
pricingRouter.delete('/rules/:ruleId', requireAdminRole, async (req: Request, res: Response) => {
  try {
    const { ruleId } = req.params;
    const ruleRef = doc(db, 'productPricing', ruleId);
    const existingSnap = await getDoc(ruleRef);

    if (!existingSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'RULE_NOT_FOUND',
        message: `Pricing rule ${ruleId} does not exist.`,
      });
    }

    await deleteDoc(ruleRef);

    return res.status(200).json({
      success: true,
      ruleId,
      message: 'Pricing rule removed successfully.',
    });
  } catch (err: any) {
    console.error('Error deleting pricing rule:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to delete pricing rule.',
    });
  }
});
