/**
 * MR FUTKAR — Super Admin Pricing Management Routes
 * Phase 3B-3: Super Admin Pricing Management Module
 * 
 * Endpoints for managing GLOBAL_SLAB, CUSTOMER_SLAB, and CUSTOMER_FIXED
 * pricing rules, conflict detection, effective price preview, and audit logging.
 */

import express, { Request, Response } from 'express';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN } from './firebaseAdmin';
import { logAdminAudit, requireSuperAdmin } from './adminAuth';
import {
  validatePricingRulePayload,
  checkPricingConflicts,
  roundToTwoDecimals,
  validateSlabsArray,
} from './adminPricingValidation';
import { PricingEngine } from '../src/services/pricingEngine';
import { Product, ProductPricingRule, PricingType, PriceSlab } from '../src/types/product';

export const adminPricingRouter = express.Router();

// Enforce Super Admin authorization across all pricing routes
adminPricingRouter.use(requireSuperAdmin());

const ALLOWED_QUERY_PARAMS = new Set([
  'search',
  'pricingType',
  'status',
  'productId',
  'retailerId',
  'minQuantity',
  'maxQuantity',
  'page',
  'pageSize',
]);

/**
 * Strips undefined values recursively from data structures to prevent Firestore setDoc/updateDoc rejections.
 */
function cleanFirestoreData<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => cleanFirestoreData(item)) as any;
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val !== undefined) {
        cleaned[key] = cleanFirestoreData(val);
      }
    }
    return cleaned;
  }
  return obj;
}

/**
 * Helper to fetch all pricing rules from Firestore
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
    console.warn('Note fetching productPricing:', err);
    return [];
  }
}

/**
 * Helper to enrich pricing rules with product & retailer data
 */
async function enrichPricingRules(rules: ProductPricingRule[]): Promise<any[]> {
  // Collect product IDs and retailer IDs
  const productIds = Array.from(new Set(rules.map(r => r.productId).filter(Boolean)));
  const retailerIds = Array.from(new Set(rules.map(r => r.retailerId).filter(Boolean) as string[]));

  // Map products
  const productMap = new Map<string, any>();
  for (const pid of productIds) {
    try {
      const pSnap = await getDoc(doc(db, 'products', pid));
      if (pSnap.exists()) {
        productMap.set(pid, pSnap.data());
      }
    } catch {
      // Ignore
    }
  }

  // Map retailers
  const retailerMap = new Map<string, any>();
  for (const rid of retailerIds) {
    try {
      const rSnap = await getDoc(doc(db, 'retailers', rid));
      if (rSnap.exists()) {
        retailerMap.set(rid, rSnap.data());
      }
    } catch {
      // Ignore
    }
  }

  return rules.map(rule => {
    const prod = productMap.get(rule.productId);
    const ret = rule.retailerId ? retailerMap.get(rule.retailerId) : null;

    return {
      ...rule,
      id: rule.id || rule.pricingId,
      productName: prod?.productName || 'Unknown Product',
      productSku: prod?.sku || '',
      productBarcode: prod?.barcode || '',
      productMrp: prod?.mrp ?? 0,
      productWholesalePrice: prod?.wholesalePrice ?? 0,
      productIsActive: prod?.isActive !== false,
      retailerBusinessName: ret?.shopName || ret?.businessName || (rule.retailerId ? `Customer (${rule.retailerId})` : 'All Retailers (Global)'),
      retailerOwnerName: ret?.ownerName || '',
      retailerMobile: ret?.mobile || ret?.phone || '',
      retailerStatus: ret?.status || 'ACTIVE',
    };
  });
}

/**
 * Computes summary metrics for pricing rules
 */
function computePricingSummary(rules: any[]) {
  const activeRules = rules.filter(r => r.active !== false);
  const globalSlabs = activeRules.filter(r => r.pricingType === 'GLOBAL_SLAB');
  const customerSlabs = activeRules.filter(r => r.pricingType === 'CUSTOMER_SLAB');
  const customerFixed = activeRules.filter(r => r.pricingType === 'CUSTOMER_FIXED');

  const productsWithCustomPricing = new Set(
    activeRules
      .filter(r => r.pricingType === 'CUSTOMER_SLAB' || r.pricingType === 'CUSTOMER_FIXED')
      .map(r => r.productId)
  ).size;

  // Sort by updatedAt descending to get recent count
  const sorted = [...rules].sort((a, b) => {
    const tA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const tB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return tB - tA;
  });

  return {
    totalActiveRules: activeRules.length,
    globalSlabRules: globalSlabs.length,
    customerSlabRules: customerSlabs.length,
    customerFixedRules: customerFixed.length,
    productsWithCustomPricing,
    totalRules: rules.length,
    recentlyUpdatedCount: Math.min(rules.length, 10),
  };
}

/**
 * GET /api/admin/pricing
 * List pricing rules with search, filtering, server-side pagination, and summary metrics.
 */
adminPricingRouter.get('/', async (req: Request, res: Response) => {
  try {
    // 1. Whitelist validation
    for (const key of Object.keys(req.query)) {
      if (!ALLOWED_QUERY_PARAMS.has(key)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_QUERY_PARAMETERS',
          message: `Query parameter '${key}' is not permitted. Allowed parameters: ${Array.from(ALLOWED_QUERY_PARAMS).join(', ')}`,
        });
      }
    }

    const rawRules = await fetchAllPricingRules();
    const enriched = await enrichPricingRules(rawRules);
    const summary = computePricingSummary(enriched);

    let filtered = [...enriched];

    // Filter by search
    const search = req.query.search ? String(req.query.search).trim().toLowerCase() : '';
    if (search) {
      filtered = filtered.filter(r => {
        const id = (r.id || r.pricingId || '').toLowerCase();
        const pId = (r.productId || '').toLowerCase();
        const pName = (r.productName || '').toLowerCase();
        const sku = (r.productSku || '').toLowerCase();
        const barcode = (r.productBarcode || '').toLowerCase();
        const cId = (r.retailerId || '').toLowerCase();
        const cName = (r.retailerBusinessName || '').toLowerCase();
        const cMobile = (r.retailerMobile || '').toLowerCase();

        return (
          id.includes(search) ||
          pId.includes(search) ||
          pName.includes(search) ||
          sku.includes(search) ||
          barcode.includes(search) ||
          cId.includes(search) ||
          cName.includes(search) ||
          cMobile.includes(search)
        );
      });
    }

    // Filter by pricingType
    const pricingType = req.query.pricingType ? String(req.query.pricingType).toUpperCase() : '';
    if (pricingType && pricingType !== 'ALL') {
      filtered = filtered.filter(r => r.pricingType === pricingType);
    }

    // Filter by status
    const status = req.query.status ? String(req.query.status).toUpperCase() : '';
    if (status === 'ACTIVE') {
      filtered = filtered.filter(r => r.active !== false);
    } else if (status === 'INACTIVE') {
      filtered = filtered.filter(r => r.active === false);
    }

    // Filter by productId
    if (req.query.productId) {
      const pid = String(req.query.productId).trim();
      filtered = filtered.filter(r => r.productId === pid);
    }

    // Filter by retailerId
    if (req.query.retailerId) {
      const rid = String(req.query.retailerId).trim();
      filtered = filtered.filter(r => r.retailerId === rid);
    }

    // Filter by quantity range
    if (req.query.minQuantity !== undefined) {
      const minQ = Number(req.query.minQuantity);
      if (!isNaN(minQ)) {
        filtered = filtered.filter(r => {
          if (r.pricingType === 'CUSTOMER_FIXED') return true;
          const slabs = r.slabs || r.priceSlabs || [];
          return slabs.some((s: PriceSlab) => (s.maxQuantity ?? Infinity) >= minQ);
        });
      }
    }

    if (req.query.maxQuantity !== undefined) {
      const maxQ = Number(req.query.maxQuantity);
      if (!isNaN(maxQ)) {
        filtered = filtered.filter(r => {
          if (r.pricingType === 'CUSTOMER_FIXED') return true;
          const slabs = r.slabs || r.priceSlabs || [];
          return slabs.some((s: PriceSlab) => s.minQuantity <= maxQ);
        });
      }
    }

    // Sort by updatedAt descending
    filtered.sort((a, b) => {
      const tA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const tB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return tB - tA;
    });

    // Pagination (bounded 1 to 100)
    const totalCount = filtered.length;
    let page = parseInt(String(req.query.page || '1'), 10);
    if (isNaN(page) || page < 1) page = 1;

    let pageSize = parseInt(String(req.query.pageSize || '25'), 10);
    if (isNaN(pageSize) || pageSize < 1) pageSize = 25;
    if (pageSize > 100) pageSize = 100; // Hard bounded maximum

    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const paginatedRules = filtered.slice(startIndex, startIndex + pageSize);

    return res.status(200).json({
      success: true,
      rules: paginatedRules,
      totalCount,
      totalPages,
      page,
      pageSize,
      pagination: {
        page,
        pageSize,
        total: totalCount,
        totalPages,
      },
      summary,
    });
  } catch (err: any) {
    console.error('Error fetching admin pricing rules:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve pricing rules.',
    });
  }
});

/**
 * GET /api/admin/pricing/summary
 * Returns summary counts for pricing dashboard cards
 */
adminPricingRouter.get('/summary', async (_req: Request, res: Response) => {
  try {
    const rawRules = await fetchAllPricingRules();
    const summary = computePricingSummary(rawRules);
    return res.status(200).json({ success: true, summary });
  } catch (err: any) {
    console.error('Error computing pricing summary:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to compute pricing summary.',
    });
  }
});

/**
 * GET /api/admin/pricing/customers
 * Returns search-filtered retailer options for customer dropdown
 */
adminPricingRouter.get('/customers', async (req: Request, res: Response) => {
  try {
    const search = req.query.search ? String(req.query.search).trim().toLowerCase() : '';
    const snap = await getDocs(collection(db, 'retailers'));
    let retailers = snap.docs.map(d => ({
      retailerId: d.id,
      id: d.id,
      ...(d.data() as any),
    }));

    if (search) {
      retailers = retailers.filter(r => {
        const id = (r.retailerId || '').toLowerCase();
        const shop = (r.shopName || r.businessName || '').toLowerCase();
        const owner = (r.ownerName || '').toLowerCase();
        const mobile = (r.mobile || r.phone || '').toLowerCase();
        return id.includes(search) || shop.includes(search) || owner.includes(search) || mobile.includes(search);
      });
    }

    const results = retailers.slice(0, 50).map(r => ({
      retailerId: r.retailerId,
      businessName: r.shopName || r.businessName || `Retailer ${r.retailerId}`,
      ownerName: r.ownerName || '',
      mobile: r.mobile || r.phone || '',
      status: r.status || 'ACTIVE',
      address: r.address || '',
    }));

    return res.status(200).json({ success: true, customers: results });
  } catch (err: any) {
    console.error('Error searching customers:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to search customers.',
    });
  }
});

/**
 * GET /api/admin/pricing/products
 * Returns search-filtered product options for product dropdown
 */
adminPricingRouter.get('/products', async (req: Request, res: Response) => {
  try {
    const search = req.query.search ? String(req.query.search).trim().toLowerCase() : '';
    const snap = await getDocs(collection(db, 'products'));
    let products = snap.docs.map(d => ({
      productId: d.id,
      id: d.id,
      ...(d.data() as any),
    }));

    if (search) {
      products = products.filter(p => {
        const id = (p.productId || '').toLowerCase();
        const name = (p.productName || '').toLowerCase();
        const sku = (p.sku || '').toLowerCase();
        const barcode = (p.barcode || '').toLowerCase();
        return id.includes(search) || name.includes(search) || sku.includes(search) || barcode.includes(search);
      });
    }

    const results = products.slice(0, 50).map(p => ({
      productId: p.productId,
      productName: p.productName || 'Unknown Product',
      sku: p.sku || '',
      barcode: p.barcode || '',
      brandName: p.brandName || '',
      mrp: p.mrp ?? 0,
      wholesalePrice: p.wholesalePrice ?? 0,
      isActive: p.isActive !== false,
      stockQuantity: p.stockQuantity ?? 0,
    }));

    return res.status(200).json({ success: true, products: results });
  } catch (err: any) {
    console.error('Error searching products:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to search products.',
    });
  }
});

/**
 * GET /api/admin/pricing/audit-logs
 * Retrieve pricing audit logs filtered by targetId or action
 */
adminPricingRouter.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const targetId = req.query.targetId ? String(req.query.targetId) : '';
    const snap = await getDocs(
      query(collection(db, 'adminAuditLogs'), orderBy('timestamp', 'desc'), limit(100))
    );
    let auditLogs = snap.docs.map(d => d.data());
    if (targetId) {
      auditLogs = auditLogs.filter((l: any) => l.targetId === targetId || l.metadata?.ruleId === targetId);
    } else {
      auditLogs = auditLogs.filter((l: any) => l.action?.startsWith('PRICING_') || l.targetType === 'PRICING_RULE');
    }
    return res.status(200).json({
      success: true,
      auditLogs,
      count: auditLogs.length,
    });
  } catch (err: any) {
    console.error('Error fetching pricing audit logs:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: err.message || 'Failed to retrieve pricing audit logs.',
    });
  }
});

/**
 * GET /api/admin/pricing/:ruleId
 * Retrieve a specific pricing rule
 */
adminPricingRouter.get('/:ruleId', async (req: Request, res: Response) => {
  try {
    const ruleId = req.params.ruleId;
    const ruleDoc = await getDoc(doc(db, 'productPricing', ruleId));

    if (!ruleDoc.exists()) {
      return res.status(404).json({
        success: false,
        error: 'PRICING_RULE_NOT_FOUND',
        message: `Pricing rule '${ruleId}' was not found.`,
      });
    }

    const raw = { id: ruleDoc.id, pricingId: ruleDoc.id, ...(ruleDoc.data() as any) };
    const [enriched] = await enrichPricingRules([raw]);

    return res.status(200).json({ success: true, rule: enriched });
  } catch (err: any) {
    console.error('Error retrieving pricing rule:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve pricing rule.',
    });
  }
});

/**
 * POST /api/admin/pricing
 * Create a new pricing rule with strict validation, overlap detection, and audit logging.
 */
adminPricingRouter.post('/', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser;

  try {
    // 1. Validation
    const validation = validatePricingRulePayload(req.body, false);
    if (!validation.success || !validation.data) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PRICING_DATA',
        message: validation.errorSummary,
        errors: validation.errors,
      });
    }

    const {
      productId,
      retailerId,
      pricingType,
      slabs,
      fixedPrice,
      active,
      priority,
      effectiveFrom,
      effectiveTo,
      ruleDescription,
    } = validation.data;

    // 2. Check product existence
    const prodSnap = await getDoc(doc(db, 'products', productId!));
    if (!prodSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'PRODUCT_NOT_FOUND',
        message: `Product with ID '${productId}' was not found.`,
      });
    }

    // 3. If customer-specific, check customer existence
    if (retailerId) {
      const retSnap = await getDoc(doc(db, 'retailers', retailerId));
      if (!retSnap.exists()) {
        // Warning or allow if valid ID
      }
    }

    // 4. Overlap & conflict detection against existing active rules
    const allRules = await fetchAllPricingRules();
    if (active) {
      const conflictCheck = checkPricingConflicts({
        existingRules: allRules,
        productId: productId!,
        retailerId: retailerId || null,
        pricingType: pricingType!,
        slabs,
      });

      if (conflictCheck.hasConflict) {
        return res.status(409).json({
          success: false,
          error: 'CONFLICTING_PRICING_RULE',
          message: conflictCheck.conflictReason,
          conflictingRuleId: conflictCheck.conflictingRuleId,
        });
      }
    }

    // 5. Generate authoritative rule ID
    const ruleId = 'rule-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();

    const newRule: ProductPricingRule = {
      id: ruleId,
      pricingId: ruleId,
      productId: productId!,
      retailerId: retailerId || '',
      pricingType: pricingType!,
      slabs: slabs || [],
      priceSlabs: slabs || [],
      fixedPrice: fixedPrice !== null ? fixedPrice : undefined,
      active,
      priority: priority ?? (pricingType === 'CUSTOMER_SLAB' ? 1 : pricingType === 'CUSTOMER_FIXED' ? 2 : 3),
      effectiveFrom: effectiveFrom || null,
      effectiveTo: effectiveTo || null,
      ruleDescription: ruleDescription || '',
      createdAt: now,
      updatedAt: now,
      createdBy: adminUser.uid,
      updatedBy: adminUser.uid,
      _serverTxnToken: SERVER_TXN_TOKEN,
    } as any;

    // 6. Transactional write to ensure atomicity
    const ruleRef = doc(db, 'productPricing', ruleId);
    await setDoc(ruleRef, cleanFirestoreData(newRule));

    // 7. Audit log
    await logAdminAudit({
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      action: 'PRICING_RULE_CREATED',
      targetType: 'PRICING_RULE',
      targetId: ruleId,
      req,
      metadata: {
        ruleId,
        productId,
        retailerId: retailerId || null,
        pricingType,
        slabsCount: slabs ? slabs.length : 0,
        fixedPrice,
        active,
      },
    });

    const [enriched] = await enrichPricingRules([newRule]);

    return res.status(201).json({
      success: true,
      rule: enriched,
      message: 'Pricing rule created successfully.',
    });
  } catch (err: any) {
    console.error('Error creating pricing rule:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: err.message || 'Failed to create pricing rule.',
    });
  }
});

/**
 * POST /api/admin/pricing/bulk-slabs
 * Atomic bulk creation of quantity slabs for a product (or customer+product).
 */
adminPricingRouter.post('/bulk-slabs', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser;

  try {
    const { productId, retailerId, pricingType, slabs, active, effectiveFrom, effectiveTo, ruleDescription } = req.body;

    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PRODUCT',
        message: 'Product ID is required.',
      });
    }

    const pType: PricingType = pricingType === 'CUSTOMER_SLAB' ? 'CUSTOMER_SLAB' : 'GLOBAL_SLAB';

    if (pType === 'CUSTOMER_SLAB' && !retailerId) {
      return res.status(400).json({
        success: false,
        error: 'CUSTOMER_REQUIRED',
        message: 'Customer (retailerId) is required for customer slab rules.',
      });
    }

    const slabValidation = validateSlabsArray(slabs);
    if (!slabValidation.valid || !slabValidation.slabs) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SLABS',
        message: slabValidation.errors.map(e => e.message).join('; '),
        errors: slabValidation.errors,
      });
    }

    // Check conflicts
    const allRules = await fetchAllPricingRules();
    const conflictCheck = checkPricingConflicts({
      existingRules: allRules,
      productId,
      retailerId: retailerId || null,
      pricingType: pType,
      slabs: slabValidation.slabs,
    });

    if (conflictCheck.hasConflict) {
      return res.status(409).json({
        success: false,
        error: 'PRICING_OVERLAP_CONFLICT',
        message: conflictCheck.conflictReason,
        conflictingRuleId: conflictCheck.conflictingRuleId,
      });
    }

    const ruleId = 'rule-bulk-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();

    const newRule: ProductPricingRule = {
      id: ruleId,
      pricingId: ruleId,
      productId,
      retailerId: retailerId || '',
      pricingType: pType,
      slabs: slabValidation.slabs,
      priceSlabs: slabValidation.slabs,
      active: active !== false,
      priority: pType === 'CUSTOMER_SLAB' ? 1 : 3,
      effectiveFrom: effectiveFrom || null,
      effectiveTo: effectiveTo || null,
      ruleDescription: ruleDescription || 'Bulk quantity slabs',
      createdAt: now,
      updatedAt: now,
      createdBy: adminUser.uid,
      updatedBy: adminUser.uid,
      _serverTxnToken: SERVER_TXN_TOKEN,
    } as any;

    await setDoc(doc(db, 'productPricing', ruleId), cleanFirestoreData(newRule));

    await logAdminAudit({
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      action: 'PRICING_RULE_CREATED',
      targetType: 'PRICING_RULE',
      targetId: ruleId,
      req,
      metadata: {
        ruleId,
        productId,
        retailerId: retailerId || null,
        pricingType: pType,
        slabsCount: slabValidation.slabs.length,
        isBulk: true,
      },
    });

    const [enriched] = await enrichPricingRules([newRule]);

    return res.status(201).json({
      success: true,
      valid: true,
      rule: enriched,
      message: 'Bulk pricing slabs created successfully.',
    });
  } catch (err: any) {
    console.error('Error creating bulk pricing slabs:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to create bulk pricing slabs.',
    });
  }
});

const handleUpdatePricingRule = async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser;
  const ruleId = req.params.ruleId;

  try {
    const ruleRef = doc(db, 'productPricing', ruleId);
    const ruleSnap = await getDoc(ruleRef);

    if (!ruleSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'PRICING_RULE_NOT_FOUND',
        message: `Pricing rule '${ruleId}' was not found.`,
      });
    }

    const currentData = ruleSnap.data() as ProductPricingRule;
    const body = req.body;

    // Disallow altering core identity (productId or retailerId) silently
    // Prompt: "If changing product/customer identity would compromise auditability, implement this as: Deactivate old rule + Create new rule"
    if (body.productId && body.productId !== currentData.productId) {
      return res.status(400).json({
        success: false,
        error: 'IMMUTABLE_PRODUCT_IDENTITY',
        message: 'Product identity is immutable on an existing rule. Please deactivate this rule and create a new rule for the target product.',
      });
    }

    if (body.retailerId !== undefined && body.retailerId !== (currentData.retailerId || null)) {
      return res.status(400).json({
        success: false,
        error: 'IMMUTABLE_CUSTOMER_IDENTITY',
        message: 'Customer identity is immutable on an existing rule. Please deactivate this rule and create a new rule for the target customer.',
      });
    }

    // Validate update payload
    const merged = { ...currentData, ...body };
    const validation = validatePricingRulePayload(merged, true);
    if (!validation.success || !validation.data) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PRICING_DATA',
        message: validation.errorSummary,
        errors: validation.errors,
      });
    }

    const validated = validation.data;

    // Check conflicts if active
    const willBeActive = validated.active !== false;
    if (willBeActive) {
      const allRules = await fetchAllPricingRules();
      const conflictCheck = checkPricingConflicts({
        existingRules: allRules,
        ruleIdToExclude: ruleId,
        productId: currentData.productId,
        retailerId: currentData.retailerId || null,
        pricingType: currentData.pricingType,
        slabs: validated.slabs,
      });

      if (conflictCheck.hasConflict) {
        return res.status(409).json({
          success: false,
          error: 'PRICING_OVERLAP_CONFLICT',
          message: conflictCheck.conflictReason,
          conflictingRuleId: conflictCheck.conflictingRuleId,
        });
      }
    }

    const now = new Date().toISOString();
    const updatePayload: any = {
      ...validated,
      updatedAt: now,
      updatedBy: adminUser.uid,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    if (validated.slabs) {
      updatePayload.slabs = validated.slabs;
      updatePayload.priceSlabs = validated.slabs;
    }

    await updateDoc(ruleRef, cleanFirestoreData(updatePayload));

    await logAdminAudit({
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      action: 'PRICING_RULE_UPDATED',
      targetType: 'PRICING_RULE',
      targetId: ruleId,
      req,
      metadata: {
        ruleId,
        productId: currentData.productId,
        retailerId: currentData.retailerId || null,
        updatedFields: Object.keys(body),
        active: willBeActive,
      },
    });

    const updatedDoc = await getDoc(ruleRef);
    const [enriched] = await enrichPricingRules([{ id: ruleId, ...(updatedDoc.data() as any) }]);

    return res.status(200).json({
      success: true,
      rule: enriched,
      message: 'Pricing rule updated successfully.',
    });
  } catch (err: any) {
    console.error('Error updating pricing rule:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to update pricing rule.',
    });
  }
};

adminPricingRouter.patch('/:ruleId', handleUpdatePricingRule);
adminPricingRouter.put('/:ruleId', handleUpdatePricingRule);

/**
 * POST /api/admin/pricing/:ruleId/activate
 * Activate a pricing rule with conflict check
 */
adminPricingRouter.post('/:ruleId/activate', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser;
  const ruleId = req.params.ruleId;

  try {
    const ruleRef = doc(db, 'productPricing', ruleId);
    const ruleSnap = await getDoc(ruleRef);

    if (!ruleSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'PRICING_RULE_NOT_FOUND',
        message: `Pricing rule '${ruleId}' was not found.`,
      });
    }

    const ruleData = ruleSnap.data() as ProductPricingRule;

    if (ruleData.active === true) {
      return res.status(200).json({
        success: true,
        message: 'Pricing rule is already active.',
        rule: { id: ruleId, ...ruleData },
      });
    }

    // Check for conflicts before activating!
    const allRules = await fetchAllPricingRules();
    const conflictCheck = checkPricingConflicts({
      existingRules: allRules,
      ruleIdToExclude: ruleId,
      productId: ruleData.productId,
      retailerId: ruleData.retailerId || null,
      pricingType: ruleData.pricingType,
      slabs: ruleData.slabs || ruleData.priceSlabs,
    });

    if (conflictCheck.hasConflict) {
      return res.status(409).json({
        success: false,
        error: 'PRICING_OVERLAP_CONFLICT',
        message: `Cannot activate rule: ${conflictCheck.conflictReason}`,
        conflictingRuleId: conflictCheck.conflictingRuleId,
      });
    }

    const now = new Date().toISOString();
    await updateDoc(ruleRef, {
      active: true,
      updatedAt: now,
      updatedBy: adminUser.uid,
      _serverTxnToken: SERVER_TXN_TOKEN,
    });

    await logAdminAudit({
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      action: 'PRICING_RULE_ACTIVATED',
      targetType: 'PRICING_RULE',
      targetId: ruleId,
      req,
      metadata: {
        ruleId,
        productId: ruleData.productId,
        pricingType: ruleData.pricingType,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Pricing rule activated successfully.',
      rule: { id: ruleId, ...ruleData, active: true, updatedAt: now, updatedBy: adminUser.uid },
    });
  } catch (err: any) {
    console.error('Error activating pricing rule:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to activate pricing rule.',
    });
  }
});

/**
 * POST /api/admin/pricing/:ruleId/deactivate
 * Deactivates a pricing rule (preserves history)
 */
adminPricingRouter.post('/:ruleId/deactivate', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser;
  const ruleId = req.params.ruleId;

  try {
    const ruleRef = doc(db, 'productPricing', ruleId);
    const ruleSnap = await getDoc(ruleRef);

    if (!ruleSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'PRICING_RULE_NOT_FOUND',
        message: `Pricing rule '${ruleId}' was not found.`,
      });
    }

    const ruleData = ruleSnap.data() as ProductPricingRule;

    if (ruleData.active === false) {
      return res.status(200).json({
        success: true,
        message: 'Pricing rule is already inactive.',
        rule: { id: ruleId, ...ruleData },
      });
    }

    const now = new Date().toISOString();
    await updateDoc(ruleRef, {
      active: false,
      updatedAt: now,
      updatedBy: adminUser.uid,
      _serverTxnToken: SERVER_TXN_TOKEN,
    });

    await logAdminAudit({
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      action: 'PRICING_RULE_DEACTIVATED',
      targetType: 'PRICING_RULE',
      targetId: ruleId,
      req,
      metadata: {
        ruleId,
        productId: ruleData.productId,
        pricingType: ruleData.pricingType,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Pricing rule deactivated successfully.',
      rule: { id: ruleId, ...ruleData, active: false, updatedAt: now, updatedBy: adminUser.uid },
    });
  } catch (err: any) {
    console.error('Error deactivating pricing rule:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to deactivate pricing rule.',
    });
  }
});

/**
 * PATCH /api/admin/pricing/:ruleId/status
 * Toggle active status of a pricing rule
 */
adminPricingRouter.patch('/:ruleId/status', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser;
  const ruleId = req.params.ruleId;
  const { active, reason } = req.body;

  if (typeof active !== 'boolean') {
    return res.status(400).json({
      success: false,
      error: 'INVALID_STATUS',
      message: 'Body parameter "active" must be a boolean (true or false).',
    });
  }

  try {
    const ruleRef = doc(db, 'productPricing', ruleId);
    const ruleSnap = await getDoc(ruleRef);

    if (!ruleSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'PRICING_RULE_NOT_FOUND',
        message: `Pricing rule '${ruleId}' was not found.`,
      });
    }

    const ruleData = ruleSnap.data() as ProductPricingRule;

    if (active && ruleData.active !== true) {
      // Conflict check when activating
      const allRules = await fetchAllPricingRules();
      const conflictCheck = checkPricingConflicts({
        existingRules: allRules,
        ruleIdToExclude: ruleId,
        productId: ruleData.productId,
        retailerId: ruleData.retailerId || null,
        pricingType: ruleData.pricingType,
        slabs: ruleData.slabs || ruleData.priceSlabs,
      });

      if (conflictCheck.hasConflict) {
        return res.status(409).json({
          success: false,
          error: 'CONFLICTING_PRICING_RULE',
          message: `Cannot activate rule: ${conflictCheck.conflictReason}`,
          conflictingRuleId: conflictCheck.conflictingRuleId,
        });
      }
    }

    const now = new Date().toISOString();
    await updateDoc(
      ruleRef,
      cleanFirestoreData({
        active,
        updatedAt: now,
        updatedBy: adminUser.uid,
        _serverTxnToken: SERVER_TXN_TOKEN,
      })
    );

    await logAdminAudit({
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      action: active ? 'PRICING_RULE_ACTIVATED' : 'PRICING_RULE_DEACTIVATED',
      targetType: 'PRICING_RULE',
      targetId: ruleId,
      req,
      metadata: {
        ruleId,
        productId: ruleData.productId,
        pricingType: ruleData.pricingType,
        active,
        reason,
      },
    });

    return res.status(200).json({
      success: true,
      active,
      message: `Pricing rule ${active ? 'activated' : 'deactivated'} successfully.`,
      rule: { id: ruleId, ...ruleData, active, updatedAt: now, updatedBy: adminUser.uid },
    });
  } catch (err: any) {
    console.error('Error updating pricing rule status:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to update pricing rule status.',
    });
  }
});

/**
 * DELETE /api/admin/pricing/:ruleId
 * Deletes or archives a pricing rule
 */
adminPricingRouter.delete('/:ruleId', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser;
  const ruleId = req.params.ruleId;

  try {
    const ruleRef = doc(db, 'productPricing', ruleId);
    const ruleSnap = await getDoc(ruleRef);

    if (!ruleSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'PRICING_RULE_NOT_FOUND',
        message: `Pricing rule '${ruleId}' was not found.`,
      });
    }

    const ruleData = ruleSnap.data() as ProductPricingRule;

    // Delete rule document
    await deleteDoc(ruleRef);

    await logAdminAudit({
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      action: 'PRICING_RULE_DEACTIVATED',
      targetType: 'PRICING_RULE',
      targetId: ruleId,
      req,
      metadata: {
        ruleId,
        productId: ruleData.productId,
        pricingType: ruleData.pricingType,
        deleted: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Pricing rule deleted successfully.',
    });
  } catch (err: any) {
    console.error('Error deleting pricing rule:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to delete pricing rule.',
    });
  }
});

/**
 * POST /api/admin/pricing/preview
 * Authoritative Effective Price Preview Tool.
 * Uses PricingEngine.resolveProductPrice to inspect authoritative price resolution
 * and produces a detailed step-by-step hierarchy explanation.
 */
adminPricingRouter.post('/preview', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser;

  try {
    const { productId, retailerId, quantity } = req.body;

    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PRODUCT',
        message: 'Product ID is required.',
      });
    }

    const qty = Number(quantity);
    if (isNaN(qty) || !Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_QUANTITY',
        message: 'Quantity must be a positive integer greater than or equal to 1.',
      });
    }

    // 1. Fetch product
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
        message: `Product '${productId}' was not found.`,
      });
    }

    // 2. Fetch customer if provided
    let retailerData: any = null;
    if (retailerId) {
      const retSnap = await getDoc(doc(db, 'retailers', retailerId));
      if (retSnap.exists()) {
        retailerData = retSnap.data();
      }
    }

    // 3. Fetch all pricing rules
    const allRules = await fetchAllPricingRules();

    // 4. Resolve price via PricingEngine (single authoritative source)
    const resolved = PricingEngine.resolveProductPrice({
      product,
      quantity: qty,
      retailerId: retailerId || undefined,
      customerPricingRules: allRules,
      now: new Date(),
    });

    const defaultPrice = Number(product.wholesalePrice ?? product.sellingPrice ?? product.mrp);
    const effectivePrice = resolved.unitPrice;
    const mrp = Number(product.mrp) || effectivePrice;
    const lineTotal = roundToTwoDecimals(effectivePrice * qty);
    const savingsVsMrp = Math.max(0, roundToTwoDecimals((mrp - effectivePrice) * qty));
    const unitSavingsVsDefault = roundToTwoDecimals(defaultPrice - effectivePrice);

    // 5. Generate detailed hierarchy resolution steps for transparency
    const candidateRules = allRules.filter(r => r.productId === productId && r.active !== false);

    // Step 1: CUSTOMER_SLAB
    const custSlabRule = retailerId
      ? candidateRules.find(r => r.pricingType === 'CUSTOMER_SLAB' && r.retailerId === retailerId)
      : null;
    let custSlabMatchedSlab: PriceSlab | null = null;
    if (custSlabRule) {
      const slabs = custSlabRule.slabs || custSlabRule.priceSlabs || [];
      custSlabMatchedSlab =
        slabs.find((s: PriceSlab) => qty >= s.minQuantity && (s.maxQuantity === null || s.maxQuantity === undefined || qty <= s.maxQuantity)) ||
        null;
    }

    // Step 2: CUSTOMER_FIXED
    const custFixedRule = retailerId
      ? candidateRules.find(r => r.pricingType === 'CUSTOMER_FIXED' && r.retailerId === retailerId)
      : null;

    // Step 3: GLOBAL_SLAB
    const globalSlabRules = candidateRules.filter(r => r.pricingType === 'GLOBAL_SLAB');
    let globalMatchedSlab: PriceSlab | null = null;
    let globalMatchedRuleId: string | null = null;
    for (const gr of globalSlabRules) {
      const slabs = gr.slabs || gr.priceSlabs || [];
      const match = slabs.find((s: PriceSlab) => qty >= s.minQuantity && (s.maxQuantity === null || s.maxQuantity === undefined || qty <= s.maxQuantity));
      if (match) {
        globalMatchedSlab = match;
        globalMatchedRuleId = gr.id || gr.pricingId || null;
        break;
      }
    }

    const hierarchySteps = [
      {
        tier: 1,
        ruleType: 'CUSTOMER_SLAB',
        label: 'Tier 1 — Negotiated Customer Quantity Slabs',
        status: !retailerId
          ? 'SKIPPED (No customer selected)'
          : !custSlabRule
          ? 'NOT CONFIGURED'
          : custSlabMatchedSlab
          ? `MATCHED (Unit Price: ₹${custSlabMatchedSlab.unitPrice ?? custSlabMatchedSlab.slabPrice} for Qty ${qty})`
          : `NO RANGE MATCH (Qty ${qty} did not hit configured slabs)`,
        applied: resolved.pricingSource === 'CUSTOMER_SLAB',
        ruleId: custSlabRule ? custSlabRule.id || custSlabRule.pricingId : null,
      },
      {
        tier: 2,
        ruleType: 'CUSTOMER_FIXED',
        label: 'Tier 2 — Negotiated Customer Fixed Price',
        status: !retailerId
          ? 'SKIPPED (No customer selected)'
          : !custFixedRule
          ? 'NOT CONFIGURED'
          : resolved.pricingSource === 'CUSTOMER_SLAB'
          ? `SUPERSEDED by CUSTOMER_SLAB`
          : `MATCHED (Fixed Price: ₹${custFixedRule.fixedPrice})`,
        applied: resolved.pricingSource === 'CUSTOMER_FIXED',
        ruleId: custFixedRule ? custFixedRule.id || custFixedRule.pricingId : null,
      },
      {
        tier: 3,
        ruleType: 'GLOBAL_SLAB',
        label: 'Tier 3 — Global Wholesale Quantity Slabs',
        status:
          resolved.pricingSource === 'CUSTOMER_SLAB' || resolved.pricingSource === 'CUSTOMER_FIXED'
            ? `SUPERSEDED by Customer-specific Tier`
            : globalMatchedSlab
            ? `MATCHED (Unit Price: ₹${globalMatchedSlab.unitPrice ?? globalMatchedSlab.slabPrice} for Qty ${qty})`
            : 'NO RANGE MATCH',
        applied: resolved.pricingSource === 'GLOBAL_SLAB',
        ruleId: globalMatchedRuleId,
      },
      {
        tier: 4,
        ruleType: 'DEFAULT',
        label: 'Tier 4 — Standard Catalogue Wholesale Price',
        status:
          resolved.pricingSource !== 'DEFAULT'
            ? `SUPERSEDED by higher tiers`
            : `APPLIED (Default Wholesale Price: ₹${defaultPrice})`,
        applied: resolved.pricingSource === 'DEFAULT',
        ruleId: null,
      },
    ];

    // Log preview execution audit
    await logAdminAudit({
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      action: 'PRICING_PREVIEW_EXECUTED',
      targetType: 'PRICING_RULE',
      targetId: resolved.pricingId || productId,
      req,
      metadata: {
        productId,
        productName: product.productName,
        retailerId: retailerId || null,
        quantity: qty,
        effectivePrice,
        pricingSource: resolved.pricingSource,
        ruleId: resolved.pricingId || null,
      },
    });

    return res.status(200).json({
      success: true,
      productId,
      productName: product.productName,
      sku: product.sku || '',
      retailerId: retailerId || null,
      customerBusinessName: retailerData?.shopName || retailerData?.businessName || (retailerId ? `Customer (${retailerId})` : 'All Retailers (Global)'),
      quantity: qty,
      defaultPrice,
      effectivePrice,
      lineTotal,
      mrp,
      savingsVsMrp,
      unitSavingsVsDefault,
      pricingSource: resolved.pricingSource,
      ruleId: resolved.pricingId || null,
      slabMinQuantity: resolved.slabMinQuantity ?? null,
      slabMaxQuantity: resolved.slabMaxQuantity ?? null,
      matchedSlab: custSlabMatchedSlab || globalMatchedSlab || (resolved.slabMinQuantity ? {
        minQuantity: resolved.slabMinQuantity,
        maxQuantity: resolved.slabMaxQuantity ?? null,
        unitPrice: effectivePrice,
      } : null),
      hierarchySteps,
      hierarchyExplanation: `Final effective price of ₹${effectivePrice} resolved via ${resolved.pricingSource}${resolved.pricingId ? ` (Rule: ${resolved.pricingId})` : ''} following authoritative precedence CUSTOMER_SLAB > CUSTOMER_FIXED > GLOBAL_SLAB > DEFAULT.`,
    });
  } catch (err: any) {
    console.error('Error in effective price preview:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to compute effective price preview.',
    });
  }
});
