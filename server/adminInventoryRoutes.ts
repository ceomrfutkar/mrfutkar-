import { Router, Request, Response } from 'express';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
} from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN, OPERATIONAL_WAREHOUSE_ID } from './firebaseAdmin';
import { logAdminAudit } from './adminAuth';
import { AdminUser } from '../src/types/admin';
import { StockStatus, InventoryItem, InventoryMovement, InventorySummary } from '../src/types/inventory';

export const adminInventoryRouter = Router();

/**
 * Computes canonical StockStatus according to system business rules:
 * - OUT_OF_STOCK: stock <= 0
 * - LOW_STOCK: stock > 0 && stock <= lowStockThreshold
 * - IN_STOCK: stock > lowStockThreshold
 */
export function computeStockStatus(stockQuantity: number, lowStockThreshold: number = 20): StockStatus {
  if (stockQuantity <= 0) return 'OUT_OF_STOCK';
  if (stockQuantity <= lowStockThreshold) return 'LOW_STOCK';
  return 'IN_STOCK';
}

/**
 * GET /api/admin/inventory
 * Server-authoritative inventory listing with search, filtering, and capped pagination.
 * Clients cannot supply arbitrary Firestore query fields.
 */
adminInventoryRouter.get('/', async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser as AdminUser;

    // 1. Pagination Validation (Strict cap: Max 100, Default 25)
    const rawPageSize = req.query.pageSize !== undefined ? Number(req.query.pageSize) : (req.query.limit !== undefined ? Number(req.query.limit) : 25);
    if (isNaN(rawPageSize) || rawPageSize <= 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PAGE_SIZE',
        message: 'Page size must be a positive integer.',
      });
    }
    if (rawPageSize > 100) {
      return res.status(400).json({
        success: false,
        error: 'PAGE_SIZE_EXCEEDED',
        message: 'Page size cannot exceed maximum limit of 100 items.',
      });
    }
    const pageSize = Math.min(Math.floor(rawPageSize), 100);

    const rawPage = req.query.page !== undefined ? Number(req.query.page) : 1;
    const page = isNaN(rawPage) || rawPage < 1 ? 1 : Math.floor(rawPage);

    // 2. Strict Filter Parameters (Arbitrary query params rejected from Firestore query engine)
    const searchTerm = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const rawStockStatus = typeof req.query.stockStatus === 'string' ? req.query.stockStatus.trim().toUpperCase() : 'ALL';
    const filterBrand = typeof req.query.brand === 'string' ? req.query.brand.trim().toLowerCase() : '';
    const filterCategory = typeof req.query.category === 'string' ? req.query.category.trim().toLowerCase() : '';

    const validStockStatuses = ['ALL', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'];
    if (!validStockStatuses.includes(rawStockStatus)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_FILTER',
        message: `stockStatus must be one of: ${validStockStatuses.join(', ')}`,
      });
    }

    // 3. Fetch products authoritatively
    const productsSnap = await getDocs(collection(db, 'products'));

    let totalStockUnits = 0;
    let inStockCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    const allMappedProducts: InventoryItem[] = [];

    productsSnap.docs.forEach(docSnap => {
      const p = docSnap.data();
      const stockQuantity = Number(p.stockQuantity) || 0;
      const lowStockThreshold = Number(p.lowStockThreshold) || 20;
      const status = computeStockStatus(stockQuantity, lowStockThreshold);

      totalStockUnits += Math.max(0, stockQuantity);
      if (status === 'IN_STOCK') inStockCount++;
      else if (status === 'LOW_STOCK') lowStockCount++;
      else if (status === 'OUT_OF_STOCK') outOfStockCount++;

      allMappedProducts.push({
        productId: p.productId || docSnap.id,
        sku: p.sku || `SKU-${docSnap.id}`,
        barcode: p.barcode || undefined,
        productName: p.productName || 'Product',
        brandName: p.brandName || '',
        category: p.category || '',
        stockQuantity,
        lowStockThreshold,
        stockStatus: status,
        mrp: Number(p.mrp) || 0,
        wholesalePrice: Number(p.wholesalePrice ?? p.price) || 0,
        unit: p.unit || 'Pack',
        packSize: p.packSize || undefined,
        caseQuantity: Number(p.caseQuantity) || 1,
        imageUrl: p.imageUrl || (Array.isArray(p.images) && p.images[0]?.url) || undefined,
        isActive: p.isActive !== false,
        updatedAt: p.updatedAt || p.createdAt || new Date().toISOString(),
      });
    });

    const summary: InventorySummary = {
      totalProducts: allMappedProducts.length,
      inStockCount,
      lowStockCount,
      outOfStockCount,
      totalStockUnits,
    };

    // 4. Apply Server-Side Filters
    let filtered = allMappedProducts;

    if (rawStockStatus !== 'ALL') {
      filtered = filtered.filter(item => item.stockStatus === rawStockStatus);
    }

    if (filterBrand) {
      filtered = filtered.filter(item => item.brandName.toLowerCase() === filterBrand);
    }

    if (filterCategory) {
      filtered = filtered.filter(item => item.category.toLowerCase() === filterCategory);
    }

    if (searchTerm) {
      filtered = filtered.filter(item => {
        const nameMatch = item.productName.toLowerCase().includes(searchTerm);
        const skuMatch = item.sku.toLowerCase().includes(searchTerm);
        const barcodeMatch = (item.barcode || '').toLowerCase().includes(searchTerm);
        const brandMatch = item.brandName.toLowerCase().includes(searchTerm);
        return nameMatch || skuMatch || barcodeMatch || brandMatch;
      });
    }

    // Sort: Lowest stock first, then by name
    filtered.sort((a, b) => a.stockQuantity - b.stockQuantity || a.productName.localeCompare(b.productName));

    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const startIndex = (page - 1) * pageSize;
    const paginatedProducts = filtered.slice(startIndex, startIndex + pageSize);

    // Audit log
    await logAdminAudit({
      action: 'INVENTORY_VIEWED',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'INVENTORY_CATALOGUE',
      targetId: 'ALL',
      metadata: { page, pageSize, search: searchTerm, stockStatus: rawStockStatus, brand: filterBrand, category: filterCategory },
      req,
    });

    return res.status(200).json({
      success: true,
      products: paginatedProducts,
      totalCount,
      page,
      pageSize,
      totalPages,
      summary,
    });
  } catch (err: any) {
    console.error('Error fetching admin inventory:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve inventory data.',
    });
  }
});

/**
 * Helper to resolve product doc by ID or SKU
 */
async function resolveProductDoc(productIdOrSku: string) {
  const directSnap = await getDoc(doc(db, 'products', productIdOrSku));
  if (directSnap.exists()) {
    return { docId: productIdOrSku, ref: doc(db, 'products', productIdOrSku), data: directSnap.data() };
  }

  const qByPid = query(collection(db, 'products'), where('productId', '==', productIdOrSku), limit(1));
  const snapByPid = await getDocs(qByPid);
  if (!snapByPid.empty) {
    return { docId: snapByPid.docs[0].id, ref: snapByPid.docs[0].ref, data: snapByPid.docs[0].data() };
  }

  const qBySku = query(collection(db, 'products'), where('sku', '==', productIdOrSku), limit(1));
  const snapBySku = await getDocs(qBySku);
  if (!snapBySku.empty) {
    return { docId: snapBySku.docs[0].id, ref: snapBySku.docs[0].ref, data: snapBySku.docs[0].data() };
  }

  return null;
}

/**
 * GET /api/admin/inventory/:productId
 * Product inventory detail view.
 */
adminInventoryRouter.get('/:productId', async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const resolved = await resolveProductDoc(productId);

    if (!resolved) {
      return res.status(404).json({
        success: false,
        error: 'PRODUCT_NOT_FOUND',
        message: `Product with identifier '${productId}' was not found.`,
      });
    }

    const p = resolved.data;
    const stockQuantity = Number(p.stockQuantity) || 0;
    const lowStockThreshold = Number(p.lowStockThreshold) || 20;

    const inventoryItem: InventoryItem = {
      productId: p.productId || resolved.docId,
      sku: p.sku || `SKU-${resolved.docId}`,
      barcode: p.barcode || undefined,
      productName: p.productName || 'Product',
      brandName: p.brandName || '',
      category: p.category || '',
      stockQuantity,
      lowStockThreshold,
      stockStatus: computeStockStatus(stockQuantity, lowStockThreshold),
      mrp: Number(p.mrp) || 0,
      wholesalePrice: Number(p.wholesalePrice ?? p.price) || 0,
      unit: p.unit || 'Pack',
      packSize: p.packSize || undefined,
      caseQuantity: Number(p.caseQuantity) || 1,
      imageUrl: p.imageUrl || (Array.isArray(p.images) && p.images[0]?.url) || undefined,
      isActive: p.isActive !== false,
      updatedAt: p.updatedAt || p.createdAt || new Date().toISOString(),
    };

    return res.status(200).json({
      success: true,
      product: inventoryItem,
    });
  } catch (err: any) {
    console.error('Error fetching inventory item:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve product inventory detail.',
    });
  }
});

/**
 * GET /api/admin/inventory/:productId/movements (alias /ledger)
 * Returns immutable stock movements from existing canonical inventoryMovements collection.
 */
async function handleGetMovements(req: Request, res: Response) {
  try {
    const { productId } = req.params;
    const resolved = await resolveProductDoc(productId);

    if (!resolved) {
      return res.status(404).json({
        success: false,
        error: 'PRODUCT_NOT_FOUND',
        message: `Product with identifier '${productId}' was not found.`,
      });
    }

    const canonicalDocId = resolved.docId;
    const targetPid = resolved.data.productId || canonicalDocId;

    const rawLimit = Number(req.query.limit) || 50;
    const maxLimit = Math.min(Math.max(1, rawLimit), 100);

    // Query inventoryMovements collection (canonical ledger)
    const movSnap = await getDocs(
      query(collection(db, 'inventoryMovements'), orderBy('createdAt', 'desc'), limit(500))
    );

    const movements: InventoryMovement[] = [];
    movSnap.docs.forEach(d => {
      const data = d.data();
      if (
        data.productId === canonicalDocId ||
        data.productId === targetPid ||
        data.productId === resolved.data.sku ||
        data.sku === resolved.data.sku
      ) {
        movements.push({
          movementId: data.movementId || d.id,
          productId: data.productId,
          productName: data.productName || resolved.data.productName,
          sku: data.sku || resolved.data.sku,
          previousStock: Number(data.previousStock ?? data.previousQuantity) || 0,
          delta: Number(data.delta ?? data.adjustmentQuantity) || 0,
          newStock: Number(data.newStock ?? data.newQuantity) || 0,
          reason: data.reason || 'Manual Adjustment',
          notes: data.notes || '',
          referenceType: data.referenceType || 'MANUAL_ADJUSTMENT',
          referenceId: data.referenceId || '',
          movementType: data.movementType || (Number(data.delta) > 0 ? 'STOCK_IN' : 'STOCK_OUT'),
          performedBy: data.performedBy || data.userId || 'ADMIN',
          performedByRole: data.performedByRole || 'SUPER_ADMIN',
          userName: data.userName || '',
          timestamp: data.timestamp || data.createdAt || '',
          createdAt: data.createdAt || data.timestamp || '',
          warehouseId: data.warehouseId || OPERATIONAL_WAREHOUSE_ID,
        });
      }
    });

    movements.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    return res.status(200).json({
      success: true,
      productId: canonicalDocId,
      totalCount: movements.length,
      movements: movements.slice(0, maxLimit),
    });
  } catch (err: any) {
    console.error('Error fetching inventory movements:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve stock movements ledger.',
    });
  }
}

adminInventoryRouter.get('/:productId/movements', handleGetMovements);
adminInventoryRouter.get('/:productId/ledger', handleGetMovements);

/**
 * POST /api/admin/inventory/adjust & POST /api/admin/inventory/:productId/adjust
 * Server-authoritative Atomic Manual Stock Adjustment
 *
 * Requirements:
 * - One Firestore transaction atomically performs:
 *   1. Read current stock
 *   2. Validate
 *   3. Calculate new stock
 *   4. Update stock in products doc
 *   5. Create inventoryMovements entry (immutable ledger)
 *   6. Create adminAuditLogs entry (immutable audit)
 * - Negative Stock Protection:
 *   If REMOVE > currentStock: REJECT (400), stock remains unchanged, no ledger or audit claiming success.
 * - Idempotency:
 *   If idempotencyKey supplied, multiple executions do not mutate stock twice.
 */
async function handleManualAdjustment(req: Request, res: Response) {
  const adminUser = (req as any).adminUser as AdminUser;
  const targetProductId = (req.params.productId || req.body.productId || '').trim();

  if (!targetProductId) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_PRODUCT_ID',
      message: 'Product ID is required for stock adjustment.',
    });
  }

  // 1. Validate adjustmentType: ADD or REMOVE
  const rawType = String(req.body.adjustmentType || req.body.type || '').trim().toUpperCase();
  if (rawType !== 'ADD' && rawType !== 'REMOVE') {
    return res.status(400).json({
      success: false,
      error: 'INVALID_ADJUSTMENT_TYPE',
      message: "adjustmentType must be either 'ADD' or 'REMOVE'.",
    });
  }
  const adjustmentType = rawType as 'ADD' | 'REMOVE';

  // 2. Validate quantity: positive integer, >= 1, finite, reasonable bound
  const rawQty = req.body.quantity;
  const qty = Number(rawQty);
  if (!Number.isInteger(qty) || qty < 1 || !Number.isFinite(qty) || qty > 1000000) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_QUANTITY',
      message: 'Quantity must be a positive whole integer between 1 and 1,000,000.',
    });
  }

  // 3. Validate reason: required, length 5 to 500 characters
  const rawReason = req.body.reason;
  if (!rawReason || typeof rawReason !== 'string' || rawReason.trim().length < 5 || rawReason.trim().length > 500) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_REASON',
      message: 'A valid reason of between 5 and 500 characters is required for manual stock adjustment.',
    });
  }
  const reason = rawReason.trim();
  const notes = typeof req.body.notes === 'string' ? req.body.notes.trim().slice(0, 1000) : '';

  // 4. Resolve Target Product Document
  const resolved = await resolveProductDoc(targetProductId);
  if (!resolved) {
    return res.status(404).json({
      success: false,
      error: 'PRODUCT_NOT_FOUND',
      message: `Product '${targetProductId}' not found in catalogue.`,
    });
  }

  const prodRef = resolved.ref;
  const docId = resolved.docId;

  // 5. Idempotency Key Handling
  const rawIdempKey = req.body.idempotencyKey;
  const idempotencyKey = typeof rawIdempKey === 'string' && rawIdempKey.trim().length >= 3 ? rawIdempKey.trim() : null;

  if (idempotencyKey) {
    try {
      const idempDoc = await getDoc(doc(db, 'idempotencyKeys', idempotencyKey));
      if (idempDoc.exists()) {
        const idempData = idempDoc.data();
        return res.status(200).json({
          success: true,
          isIdempotentReplay: true,
          message: 'Stock adjustment already processed.',
          productId: idempData.productId || docId,
          previousStock: idempData.previousStock,
          newStock: idempData.newStock,
          delta: idempData.delta,
          movementId: idempData.movementId,
          auditLogId: idempData.auditLogId,
        });
      }
    } catch {
      // Non-blocking fallback
    }
  }

  // 6. Execute Single Atomic Transaction
  const now = new Date().toISOString();
  const delta = adjustmentType === 'ADD' ? qty : -qty;
  const movRef = doc(collection(db, 'inventoryMovements'));
  const auditRef = doc(collection(db, 'adminAuditLogs'));
  const idempRef = idempotencyKey ? doc(db, 'idempotencyKeys', idempotencyKey) : null;

  let resultPayload: any = null;

  try {
    await runTransaction(db, async txn => {
      // Check idempotency inside transaction
      if (idempRef) {
        const idempSnap = await txn.get(idempRef);
        if (idempSnap.exists()) {
          const cached = idempSnap.data();
          resultPayload = {
            isIdempotentReplay: true,
            productId: cached.productId,
            previousStock: cached.previousStock,
            newStock: cached.newStock,
            delta: cached.delta,
            movementId: cached.movementId,
          };
          return;
        }
      }

      // Step 1: Read current stock
      const pSnap = await txn.get(prodRef);
      if (!pSnap.exists()) {
        throw new Error('PRODUCT_NOT_FOUND');
      }

      const pData = pSnap.data();
      const prevStock = Number(pData.stockQuantity) || 0;
      const lowStockThreshold = Number(pData.lowStockThreshold) || 20;

      // Step 2 & 3: Validate and calculate new stock
      const newStock = prevStock + delta;

      // Negative stock protection
      if (newStock < 0) {
        throw new Error(`INSUFFICIENT_STOCK: Adjustment would result in negative stock. Current stock is ${prevStock}, requested removal is ${qty}.`);
      }

      // Step 4: Update product stock in products doc
      txn.update(prodRef, {
        stockQuantity: newStock,
        inStock: newStock > 0,
        isInStock: newStock > 0,
        updatedAt: now,
        _serverTxnToken: SERVER_TXN_TOKEN,
        _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      });

      // Step 5: Create inventory ledger entry in inventoryMovements
      const movementData: any = {
        movementId: movRef.id,
        warehouseId: OPERATIONAL_WAREHOUSE_ID,
        productId: docId,
        productName: pData.productName || 'Product',
        sku: pData.sku || `SKU-${docId}`,
        previousStock: prevStock,
        previousQuantity: prevStock,
        delta: delta,
        adjustmentQuantity: delta,
        newStock: newStock,
        newQuantity: newStock,
        reason: reason,
        notes: notes || reason,
        movementType: adjustmentType === 'ADD' ? 'STOCK_IN' : 'STOCK_OUT',
        referenceType: 'MANUAL_ADJUSTMENT',
        referenceId: `ADJ-${docId}-${Date.now()}`,
        performedBy: adminUser.uid,
        performedByRole: 'SUPER_ADMIN',
        userId: adminUser.uid,
        userName: adminUser.name,
        createdAt: now,
        timestamp: now,
        _serverTxnToken: SERVER_TXN_TOKEN,
      };
      txn.set(movRef, movementData);

      // Step 6: Create audit log in adminAuditLogs
      const auditLogData: any = {
        logId: auditRef.id,
        adminUid: adminUser.uid,
        adminName: adminUser.name,
        action: 'INVENTORY_ADJUSTMENT_CREATED',
        targetType: 'PRODUCT_INVENTORY',
        targetId: docId,
        timestamp: now,
        ipHashOrRequestFingerprint: 'INTERNAL_SERVER_DISPATCH',
        metadata: {
          productId: docId,
          sku: pData.sku,
          productName: pData.productName,
          adjustmentType,
          quantity: qty,
          delta,
          previousStock: prevStock,
          newStock,
          reason,
          notes,
          movementId: movRef.id,
          idempotencyKey: idempotencyKey || null,
        },
        _serverTxnToken: SERVER_TXN_TOKEN,
      };
      txn.set(auditRef, auditLogData);

      // Step 7: Record idempotency key if supplied
      if (idempRef && idempotencyKey) {
        txn.set(idempRef, {
          idempotencyKey,
          productId: docId,
          adjustmentType,
          quantity: qty,
          delta,
          previousStock: prevStock,
          newStock,
          movementId: movRef.id,
          auditLogId: auditRef.id,
          performedBy: adminUser.uid,
          createdAt: now,
          timestamp: now,
          _serverTxnToken: SERVER_TXN_TOKEN,
        });
      }

      resultPayload = {
        isIdempotentReplay: false,
        productId: docId,
        productName: pData.productName,
        sku: pData.sku,
        previousStock: prevStock,
        newStock,
        delta,
        stockStatus: computeStockStatus(newStock, lowStockThreshold),
        movementId: movRef.id,
        auditLogId: auditRef.id,
      };
    });

    return res.status(200).json({
      success: true,
      message: `Stock successfully adjusted for '${resultPayload.productName || docId}'.`,
      ...resultPayload,
    });
  } catch (err: any) {
    if (err.message === 'PRODUCT_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: 'PRODUCT_NOT_FOUND',
        message: 'Product could not be found.',
      });
    }
    if (err.message?.includes('INSUFFICIENT_STOCK')) {
      return res.status(400).json({
        success: false,
        error: 'INSUFFICIENT_STOCK',
        message: err.message,
      });
    }

    console.error('Error executing manual stock adjustment transaction:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to adjust stock. No changes were committed.',
      details: err.message,
    });
  }
}

adminInventoryRouter.post('/adjust', handleManualAdjustment);
adminInventoryRouter.post('/:productId/adjust', handleManualAdjustment);
