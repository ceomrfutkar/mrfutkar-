/**
 * MR FUTKAR — Super Admin Product Management Routes
 * Phase 3B-2A: Product Management Backend + Data Model + Security Foundation
 */
import express, { Request, Response } from 'express';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
} from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN, OPERATIONAL_WAREHOUSE_ID } from './firebaseAdmin';
import { logAdminAudit } from './adminAuth';
import {
  validateProductCreate,
  validateProductUpdate,
  normalizeSku,
  normalizeBarcode,
} from './adminProductValidation';
import { Product, ProductImageMetadata } from '../src/types/product';
import * as fs from 'fs';
import * as path from 'path';

export const adminProductRouter = express.Router();

const ALLOWED_QUERY_PARAMS = new Set([
  'search',
  'brandId',
  'categoryId',
  'active',
  'lowStock',
  'page',
  'pageSize',
]);

/**
 * Helper to ensure existing products have their SKU and Barcode index reservations
 */
let indexSyncAttempted = false;
async function ensureSkuBarcodeIndex() {
  if (indexSyncAttempted) return;
  indexSyncAttempted = true;
  try {
    const productsSnap = await getDocs(collection(db, 'products'));
    for (const d of productsSnap.docs) {
      const data = d.data();
      const skuVal = data.sku ? String(data.sku).trim().toUpperCase() : null;
      const barVal = data.barcode ? String(data.barcode).trim() : null;

      if (skuVal) {
        const skuRef = doc(db, 'productSkus', skuVal);
        const sSnap = await getDoc(skuRef);
        if (!sSnap.exists()) {
          await runTransaction(db, async txn => {
            txn.set(skuRef, {
              productId: d.id,
              sku: skuVal,
              createdAt: data.createdAt || new Date().toISOString(),
              _serverTxnToken: SERVER_TXN_TOKEN,
            });
          }).catch(() => {});
        }
      }

      if (barVal) {
        const barRef = doc(db, 'productBarcodes', barVal);
        const bSnap = await getDoc(barRef);
        if (!bSnap.exists()) {
          await runTransaction(db, async txn => {
            txn.set(barRef, {
              productId: d.id,
              barcode: barVal,
              createdAt: data.createdAt || new Date().toISOString(),
              _serverTxnToken: SERVER_TXN_TOKEN,
            });
          }).catch(() => {});
        }
      }
    }
  } catch (err: any) {
    console.warn('Note indexing SKUs/Barcodes:', err.message);
  }
}

/**
 * GET /api/admin/products
 * List products with bounded pagination, multi-criteria filtering, and search.
 * Strictly checks query parameters against allowed whitelist to prevent field-path injection.
 */
adminProductRouter.get('/', async (req: Request, res: Response) => {
  try {
    // 1. Validate query keys against whitelist (PROD-37)
    for (const key of Object.keys(req.query)) {
      if (!ALLOWED_QUERY_PARAMS.has(key)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_QUERY_PARAMETERS',
          message: `Query parameter '${key}' is not permitted. Allowed parameters: ${Array.from(ALLOWED_QUERY_PARAMS).join(', ')}`,
        });
      }
    }

    const {
      search,
      brandId,
      categoryId,
      active,
      lowStock,
      page = '1',
      pageSize = '25',
    } = req.query;

    // Validate and bound page & pageSize (PROD-36)
    const pageNum = parseInt(page as string, 10);
    const validPage = isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;

    const pageSizeNum = parseInt(pageSize as string, 10);
    // Hard limit between 1 and 100
    const validPageSize = isNaN(pageSizeNum) || pageSizeNum < 1
      ? 25
      : Math.min(100, Math.max(1, pageSizeNum));

    // Fetch catalogue products
    const snap = await getDocs(collection(db, 'products'));
    let products: any[] = snap.docs.map(d => ({
      productId: d.id,
      id: d.id,
      ...d.data(),
    }));

    // In-memory multi-attribute filtering
    if (active !== undefined) {
      const activeBool = String(active).toLowerCase() === 'true';
      products = products.filter(p => (p.isActive !== false) === activeBool);
    }

    if (brandId && typeof brandId === 'string' && brandId.trim()) {
      const bTarget = brandId.trim().toLowerCase();
      products = products.filter(p =>
        (p.brandId && p.brandId.toLowerCase() === bTarget) ||
        (p.brandName && p.brandName.toLowerCase() === bTarget) ||
        (p.brand && p.brand.toLowerCase() === bTarget)
      );
    }

    if (categoryId && typeof categoryId === 'string' && categoryId.trim()) {
      const cTarget = categoryId.trim().toLowerCase();
      products = products.filter(p =>
        (p.categoryId && p.categoryId.toLowerCase() === cTarget) ||
        (p.categoryName && p.categoryName.toLowerCase() === cTarget) ||
        (p.category && p.category.toLowerCase() === cTarget)
      );
    }

    if (lowStock !== undefined && String(lowStock).toLowerCase() === 'true') {
      products = products.filter(p => {
        const stock = Number(p.stockQuantity !== undefined ? p.stockQuantity : p.stock) || 0;
        const threshold = Number(p.lowStockThreshold) || 10;
        return stock <= threshold;
      });
    }

    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim().toLowerCase();
      products = products.filter(p => {
        const name = String(p.productName || p.name || '').toLowerCase();
        const sku = String(p.sku || '').toLowerCase();
        const barcode = String(p.barcode || '').toLowerCase();
        const brand = String(p.brandName || p.brand || '').toLowerCase();
        const category = String(p.categoryName || p.category || '').toLowerCase();
        return name.includes(term) || sku.includes(term) || barcode.includes(term) || brand.includes(term) || category.includes(term);
      });
    }

    // Sort by createdAt desc or productName asc
    products.sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      if (timeA !== timeB) return timeB - timeA;
      return (a.productName || '').localeCompare(b.productName || '');
    });

    const totalCount = products.length;
    const totalPages = Math.ceil(totalCount / validPageSize) || 1;
    const startIndex = (validPage - 1) * validPageSize;
    const paginatedProducts = products.slice(startIndex, startIndex + validPageSize);

    return res.status(200).json({
      success: true,
      totalCount,
      totalPages,
      page: validPage,
      pageSize: validPageSize,
      products: paginatedProducts,
    });
  } catch (err: any) {
    console.error('Error listing admin products:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to list products.',
    });
  }
});

/**
 * GET /api/admin/products/:productId
 * Retrieves a single product document by ID.
 */
adminProductRouter.get('/:productId', async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PRODUCT_DATA',
        message: 'Product ID is required.',
      });
    }

    const prodRef = doc(db, 'products', productId);
    const snap = await getDoc(prodRef);

    let productData: any = null;
    if (snap.exists()) {
      productData = {
        productId: snap.id,
        id: snap.id,
        ...snap.data(),
      };
    } else {
      const { fmcgProducts } = await import('../src/data/fmcgCatalogue');
      const found = fmcgProducts.find(p => p.productId === productId || p.id === productId);
      if (found) {
        productData = {
          ...found,
          id: found.productId,
          productId: found.productId,
        };
      }
    }

    if (!productData) {
      return res.status(404).json({
        success: false,
        error: 'PRODUCT_NOT_FOUND',
        message: `Product with ID '${productId}' was not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      product: productData,
    });
  } catch (err: any) {
    console.error('Error fetching admin product:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to retrieve product.',
    });
  }
});

/**
 * POST /api/admin/products
 * Creates a new product with server-side validation, SKU/barcode uniqueness check,
 * transactional race-condition guard, and audit logging.
 */
adminProductRouter.post('/', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser;
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';

  try {
    await ensureSkuBarcodeIndex();

    // 1. Server-side validation
    const validation = validateProductCreate(req.body);
    if (!validation.success || !validation.data) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PRODUCT_DATA',
        message: validation.errorSummary,
        errors: validation.errors,
      });
    }

    const data = validation.data;
    const normalizedSku = data.sku;
    const normalizedBarcode = data.barcode;

    // 2. Pre-check SKU and Barcode uniqueness against products collection
    const allProdSnap = await getDocs(collection(db, 'products'));
    for (const d of allProdSnap.docs) {
      const p = d.data();
      if (p.sku && String(p.sku).trim().toUpperCase() === normalizedSku) {
        return res.status(409).json({
          success: false,
          error: 'DUPLICATE_SKU',
          message: `Product with SKU '${normalizedSku}' already exists.`,
        });
      }
      if (normalizedBarcode && p.barcode && String(p.barcode).trim() === normalizedBarcode) {
        return res.status(409).json({
          success: false,
          error: 'DUPLICATE_BARCODE',
          message: `Product with barcode '${normalizedBarcode}' already exists.`,
        });
      }
    }

    // 3. Generate authoritative server product ID
    const newProdId = 'prod-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);
    const now = new Date().toISOString();

    // 4. Construct complete product document preserving all legacy and modern fields
    const newProduct: Product = {
      productId: newProdId,
      id: newProdId,
      sku: normalizedSku,
      barcode: normalizedBarcode || '',
      productName: data.productName,
      name: data.productName,
      shortName: data.productName,
      description: data.description,
      brandId: data.brandId,
      brandName: data.brandName,
      brand: data.brandName,
      categoryId: data.categoryId,
      categoryName: data.categoryName,
      category: data.categoryName,
      subcategoryId: data.subcategoryId || '',
      subcategoryName: data.subcategoryName || '',
      mrp: data.mrp,
      sellingPrice: data.sellingPrice,
      wholesalePrice: data.wholesalePrice,
      price: data.sellingPrice,
      discountPercent: data.mrp > 0 ? Math.round(((data.mrp - data.sellingPrice) / data.mrp) * 100) : 0,
      discountAmount: Math.max(0, data.mrp - data.sellingPrice),
      minimumOrderQuantity: data.minimumOrderQuantity,
      moq: data.minimumOrderQuantity,
      caseQuantity: data.caseQuantity,
      unit: data.unit,
      packSize: data.packSize,
      stockQuantity: data.stockQuantity,
      stock: data.stockQuantity,
      stockUnit: data.unit,
      isInStock: data.stockQuantity > 0,
      inStock: data.stockQuantity > 0,
      lowStockThreshold: data.lowStockThreshold,
      isActive: data.isActive,
      imageUrl: data.imageUrl,
      image: data.imageUrl,
      thumbnailUrl: data.imageUrl,
      mainImage: data.mainImage,
      images: data.images,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      warehouseName: 'MR FUTKAR — BRAHMPURI',
      createdAt: now,
      updatedAt: now,
      createdBy: adminUser.uid,
      updatedBy: adminUser.uid,
    };

    // 5. Transactional Execution: reserve SKU & Barcode documents and write Product
    const skuRef = doc(db, 'productSkus', normalizedSku);
    const barcodeRef = normalizedBarcode ? doc(db, 'productBarcodes', normalizedBarcode) : null;
    const prodRef = doc(db, 'products', newProdId);

    await runTransaction(db, async txn => {
      // Check SKU index
      const skuSnap = await txn.get(skuRef);
      if (skuSnap.exists()) {
        throw new Error('DUPLICATE_SKU');
      }

      // Check Barcode index if present
      if (barcodeRef) {
        const barSnap = await txn.get(barcodeRef);
        if (barSnap.exists()) {
          throw new Error('DUPLICATE_BARCODE');
        }
      }

      // Write SKU reservation
      txn.set(skuRef, {
        sku: normalizedSku,
        productId: newProdId,
        createdAt: now,
        _serverTxnToken: SERVER_TXN_TOKEN,
      });

      // Write Barcode reservation if present
      if (barcodeRef && normalizedBarcode) {
        txn.set(barcodeRef, {
          barcode: normalizedBarcode,
          productId: newProdId,
          createdAt: now,
          _serverTxnToken: SERVER_TXN_TOKEN,
        });
      }

      // Write Product document
      txn.set(prodRef, {
        ...newProduct,
        _serverTxnToken: SERVER_TXN_TOKEN,
        _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      });

      // If initial stock > 0, write initial stock movement record for audit compliance
      if (data.stockQuantity > 0) {
        const movRef = doc(collection(db, 'inventoryMovements'));
        txn.set(movRef, {
          movementId: movRef.id,
          warehouseId: OPERATIONAL_WAREHOUSE_ID,
          productId: newProdId,
          productName: data.productName,
          sku: normalizedSku,
          previousStock: 0,
          previousQuantity: 0,
          delta: data.stockQuantity,
          adjustmentQuantity: data.stockQuantity,
          newStock: data.stockQuantity,
          newQuantity: data.stockQuantity,
          reason: 'Initial stock intake',
          notes: `Initial stock intake upon product registration by Super Admin ${adminUser.name}`,
          performedBy: adminUser.uid,
          performedByRole: 'SUPER_ADMIN',
          userId: adminUser.uid,
          userName: adminUser.name,
          createdAt: now,
          timestamp: now,
          referenceType: 'STOCK_INTAKE',
          referenceId: newProdId,
          _serverTxnToken: SERVER_TXN_TOKEN,
        });
      }
    });

    // 6. Record Admin Audit Log
    await logAdminAudit({
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      action: 'PRODUCT_CREATED',
      targetType: 'PRODUCT',
      targetId: newProdId,
      req,
      metadata: {
        productId: newProdId,
        sku: normalizedSku,
        barcode: normalizedBarcode || null,
        productName: data.productName,
        mrp: data.mrp,
        wholesalePrice: data.wholesalePrice,
        stockQuantity: data.stockQuantity,
        isActive: data.isActive,
      },
    });

    return res.status(201).json({
      success: true,
      product: newProduct,
      message: 'Product created successfully.',
    });
  } catch (err: any) {
    if (err.message === 'DUPLICATE_SKU' || err.message?.includes('DUPLICATE_SKU')) {
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE_SKU',
        message: 'Product with this SKU already exists.',
      });
    }
    if (err.message === 'DUPLICATE_BARCODE' || err.message?.includes('DUPLICATE_BARCODE')) {
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE_BARCODE',
        message: 'Product with this barcode already exists.',
      });
    }
    console.error('Error creating product:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to create product.',
    });
  }
});

/**
 * PATCH /api/admin/products/:productId
 * Updates product metadata.
 * Guards against immutable fields (productId, createdBy, createdAt)
 * Guards against arbitrary stock quantity modification (must use warehouse inventory adjustment)
 * Verifies SKU/barcode uniqueness if altered
 */
async function handleProductUpdate(req: Request, res: Response) {
  const adminUser = (req as any).adminUser;
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const { productId } = req.params;

  try {
    await ensureSkuBarcodeIndex();

    const prodRef = doc(db, 'products', productId);
    const existingSnap = await getDoc(prodRef);

    if (!existingSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'PRODUCT_NOT_FOUND',
        message: `Product with ID '${productId}' was not found.`,
      });
    }

    const existing = existingSnap.data();

    // Validate update payload against existing document
    const validation = validateProductUpdate(req.body, existing);
    if (!validation.success || !validation.data) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PRODUCT_DATA',
        message: validation.errorSummary,
        errors: validation.errors,
      });
    }

    const patch = validation.data;
    const now = new Date().toISOString();
    const updatedFields: string[] = Object.keys(patch);

    // If SKU is changing, verify uniqueness
    if (patch.sku && patch.sku !== existing.sku) {
      const allProdSnap = await getDocs(collection(db, 'products'));
      for (const d of allProdSnap.docs) {
        if (d.id !== productId && d.data().sku && String(d.data().sku).trim().toUpperCase() === patch.sku) {
          return res.status(409).json({
            success: false,
            error: 'DUPLICATE_SKU',
            message: `Product with SKU '${patch.sku}' already exists.`,
          });
        }
      }
    }

    // If Barcode is changing, verify uniqueness
    if (patch.barcode && patch.barcode !== existing.barcode) {
      const allProdSnap = await getDocs(collection(db, 'products'));
      for (const d of allProdSnap.docs) {
        if (d.id !== productId && d.data().barcode && String(d.data().barcode).trim() === patch.barcode) {
          return res.status(409).json({
            success: false,
            error: 'DUPLICATE_BARCODE',
            message: `Product with barcode '${patch.barcode}' already exists.`,
          });
        }
      }
    }

    // Prepare updated fields preserving consistency across alias fields
    const updates: any = {
      ...patch,
      updatedAt: now,
      updatedBy: adminUser.uid,
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    };

    if (patch.productName !== undefined) {
      updates.name = patch.productName;
      updates.shortName = patch.productName;
    }
    if (patch.brandName !== undefined) updates.brand = patch.brandName;
    if (patch.categoryName !== undefined) updates.category = patch.categoryName;
    if (patch.sellingPrice !== undefined) {
      updates.price = patch.sellingPrice;
      updates.wholesalePrice = patch.sellingPrice;
    }
    if (patch.wholesalePrice !== undefined) {
      updates.sellingPrice = patch.wholesalePrice;
      updates.price = patch.wholesalePrice;
    }
    if (patch.mrp !== undefined || patch.sellingPrice !== undefined || patch.wholesalePrice !== undefined) {
      const curMrp = patch.mrp !== undefined ? patch.mrp : existing.mrp;
      const curPrice = patch.wholesalePrice !== undefined ? patch.wholesalePrice : (patch.sellingPrice !== undefined ? patch.sellingPrice : existing.sellingPrice);
      updates.discountPercent = curMrp > 0 ? Math.round(((curMrp - curPrice) / curMrp) * 100) : 0;
      updates.discountAmount = Math.max(0, curMrp - curPrice);
    }
    if (patch.minimumOrderQuantity !== undefined) updates.moq = patch.minimumOrderQuantity;
    if (patch.isActive !== undefined) updates.active = patch.isActive;

    // Transactional update including SKU and Barcode index sync
    await runTransaction(db, async txn => {
      // If SKU changed, update productSkus
      if (patch.sku && patch.sku !== existing.sku) {
        const newSkuRef = doc(db, 'productSkus', patch.sku);
        const newSkuSnap = await txn.get(newSkuRef);
        if (newSkuSnap.exists() && newSkuSnap.data().productId !== productId) {
          throw new Error('DUPLICATE_SKU');
        }
        txn.set(newSkuRef, {
          sku: patch.sku,
          productId,
          createdAt: now,
          _serverTxnToken: SERVER_TXN_TOKEN,
        });
      }

      // If barcode changed, update productBarcodes
      if (patch.barcode && patch.barcode !== existing.barcode) {
        const newBarRef = doc(db, 'productBarcodes', patch.barcode);
        const newBarSnap = await txn.get(newBarRef);
        if (newBarSnap.exists() && newBarSnap.data().productId !== productId) {
          throw new Error('DUPLICATE_BARCODE');
        }
        txn.set(newBarRef, {
          barcode: patch.barcode,
          productId,
          createdAt: now,
          _serverTxnToken: SERVER_TXN_TOKEN,
        });
      }

      txn.update(prodRef, updates);
    });

    // Record Admin audit log
    await logAdminAudit({
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      action: 'PRODUCT_UPDATED',
      targetType: 'PRODUCT',
      targetId: productId,
      req,
      metadata: {
        productId,
        updatedFields,
      },
    });

    const finalProduct = {
      ...existing,
      ...updates,
      productId,
      id: productId,
    };

    return res.status(200).json({
      success: true,
      product: finalProduct,
      message: 'Product updated successfully.',
    });
  } catch (err: any) {
    if (err.message === 'DUPLICATE_SKU') {
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE_SKU',
        message: 'Product with this SKU already exists.',
      });
    }
    if (err.message === 'DUPLICATE_BARCODE') {
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE_BARCODE',
        message: 'Product with this barcode already exists.',
      });
    }
    console.error('Error updating product:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to update product.',
    });
  }
}

adminProductRouter.patch('/:productId', handleProductUpdate);
adminProductRouter.put('/:productId', handleProductUpdate);

/**
 * POST /api/admin/products/:productId/activate
 * Idempotently activates a product.
 * Returns success without duplicate audit log if already active.
 */
adminProductRouter.post('/:productId/activate', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser;
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const { productId } = req.params;

  try {
    const prodRef = doc(db, 'products', productId);
    const snap = await getDoc(prodRef);

    if (!snap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'PRODUCT_NOT_FOUND',
        message: `Product with ID '${productId}' was not found.`,
      });
    }

    const data = snap.data();

    // Idempotency check: if already active, return 200 with zero state change
    if (data.isActive !== false && data.active !== false) {
      return res.status(200).json({
        success: true,
        productId,
        isActive: true,
        alreadyActive: true,
        message: 'Product is already active.',
      });
    }

    const now = new Date().toISOString();
    await runTransaction(db, async txn => {
      txn.update(prodRef, {
        isActive: true,
        active: true,
        updatedAt: now,
        updatedBy: adminUser.uid,
        _serverTxnToken: SERVER_TXN_TOKEN,
        _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      });
    });

    // Record Admin Audit Log
    await logAdminAudit({
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      action: 'PRODUCT_ACTIVATED',
      targetType: 'PRODUCT',
      targetId: productId,
      req,
      metadata: {
        productId,
        productName: data.productName,
        sku: data.sku,
        previousState: false,
        newState: true,
      },
    });

    return res.status(200).json({
      success: true,
      productId,
      isActive: true,
      message: 'Product activated successfully.',
    });
  } catch (err: any) {
    console.error('Error activating product:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to activate product.',
    });
  }
});

/**
 * POST /api/admin/products/:productId/deactivate
 * Idempotently deactivates a product.
 * Returns success without duplicate audit log if already inactive.
 */
adminProductRouter.post('/:productId/deactivate', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser;
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const { productId } = req.params;

  try {
    const prodRef = doc(db, 'products', productId);
    const snap = await getDoc(prodRef);

    if (!snap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'PRODUCT_NOT_FOUND',
        message: `Product with ID '${productId}' was not found.`,
      });
    }

    const data = snap.data();

    // Idempotency check: if already inactive, return 200 with zero state change
    if (data.isActive === false || data.active === false) {
      return res.status(200).json({
        success: true,
        productId,
        isActive: false,
        alreadyInactive: true,
        message: 'Product is already inactive.',
      });
    }

    const now = new Date().toISOString();
    await runTransaction(db, async txn => {
      txn.update(prodRef, {
        isActive: false,
        active: false,
        updatedAt: now,
        updatedBy: adminUser.uid,
        _serverTxnToken: SERVER_TXN_TOKEN,
        _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      });
    });

    // Record Admin Audit Log
    await logAdminAudit({
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      action: 'PRODUCT_DEACTIVATED',
      targetType: 'PRODUCT',
      targetId: productId,
      req,
      metadata: {
        productId,
        productName: data.productName,
        sku: data.sku,
        previousState: true,
        newState: false,
      },
    });

    return res.status(200).json({
      success: true,
      productId,
      isActive: false,
      message: 'Product deactivated successfully.',
    });
  } catch (err: any) {
    console.error('Error deactivating product:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to deactivate product.',
    });
  }
});

// ============================================================================
// PHASE 3B-2B: PRODUCT IMAGE MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * POST /api/admin/products/:productId/images
 * Upload and attach image to product.
 */
adminProductRouter.post('/:productId/images', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser;
  const { productId } = req.params;
  const { fileData, fileName = 'image.jpg', contentType, altText } = req.body || {};

  try {
    const prodRef = doc(db, 'products', productId);
    const prodSnap = await getDoc(prodRef);

    if (!prodSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'PRODUCT_NOT_FOUND',
        message: `Product with ID '${productId}' was not found.`,
      });
    }

    const product = prodSnap.data() as Product;
    const currentImages: ProductImageMetadata[] = Array.isArray(product.images) ? [...product.images] : [];

    // Max 5 images enforced (IMG-17, IMG-18)
    if (currentImages.length >= 5) {
      return res.status(400).json({
        success: false,
        error: 'MAX_IMAGES_EXCEEDED',
        message: 'Product cannot exceed the maximum limit of 5 images.',
      });
    }

    if (!fileData || typeof fileData !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'MISSING_IMAGE_DATA',
        message: 'fileData string (base64) is required.',
      });
    }

    // Determine MIME type
    let mime = (contentType || '').toLowerCase().trim();
    let base64Payload = fileData;
    if (fileData.startsWith('data:')) {
      const match = fileData.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        mime = match[1].toLowerCase().trim();
        base64Payload = match[2];
      }
    }

    const buffer = Buffer.from(base64Payload, 'base64');
    const sizeBytes = buffer.length;

    // Reject SVG (IMG-13)
    if (
      mime === 'image/svg+xml' ||
      mime.includes('svg') ||
      (fileName && fileName.toLowerCase().endsWith('.svg'))
    ) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_IMAGE_TYPE',
        message: 'SVG format is rejected for security reasons.',
      });
    }

    // Reject GIF (IMG-14)
    if (
      mime === 'image/gif' ||
      mime.includes('gif') ||
      (fileName && fileName.toLowerCase().endsWith('.gif'))
    ) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_IMAGE_TYPE',
        message: 'GIF animation format is rejected.',
      });
    }

    // Allowed MIME types: JPEG, PNG, WebP (IMG-10, IMG-11, IMG-12)
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(mime)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_IMAGE_TYPE',
        message: 'Only JPEG, PNG, and WebP formats are accepted.',
      });
    }

    // File size limit: >5MB rejected (IMG-15)
    if (sizeBytes > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        error: 'FILE_TOO_LARGE',
        message: 'Image exceeds maximum allowed size of 5MB.',
      });
    }

    let ext = 'jpg';
    if (mime.includes('png')) ext = 'png';
    else if (mime.includes('webp')) ext = 'webp';

    const imageId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const storagePath = `products/${productId}/${imageId}.${ext}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'products', productId);
    const localFilePath = path.join(uploadDir, `${imageId}.${ext}`);

    // Create directory and write file
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(localFilePath, buffer);
    const publicUrl = `/uploads/products/${productId}/${imageId}.${ext}`;

    // First image uploaded becomes primary (IMG-16); exactly one primary enforced (IMG-19)
    const isPrimary = currentImages.length === 0;

    const newImage: ProductImageMetadata = {
      imageId,
      url: publicUrl,
      storagePath,
      sortOrder: currentImages.length,
      isPrimary,
      altText: altText || product.productName,
      createdAt: new Date().toISOString(),
    };

    const updatedImages = [...currentImages, newImage];
    const now = new Date().toISOString();

    try {
      await runTransaction(db, async txn => {
        const updatePayload: any = {
          images: updatedImages,
          updatedAt: now,
          updatedBy: adminUser.uid,
          _serverTxnToken: SERVER_TXN_TOKEN,
          _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        };
        if (isPrimary) {
          updatePayload.imageUrl = publicUrl;
          updatePayload.thumbnailUrl = publicUrl;
          updatePayload.image = publicUrl;
          updatePayload.mainImage = publicUrl;
        }
        txn.update(prodRef, updatePayload);
      });
    } catch (txnErr) {
      // Clean up storage object on metadata failure to prevent orphans (IMG-26)
      try {
        if (fs.existsSync(localFilePath)) {
          fs.unlinkSync(localFilePath);
        }
      } catch {
        // ignore
      }
      throw txnErr;
    }

    // Immutable audit log (IMG-33)
    await logAdminAudit({
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      action: 'PRODUCT_IMAGE_UPLOADED',
      targetType: 'PRODUCT',
      targetId: productId,
      req,
      metadata: {
        productId,
        imageId,
        fileName,
        mime,
        sizeBytes,
        isPrimary,
        storagePath,
      },
    });

    return res.status(201).json({
      success: true,
      image: newImage,
      images: updatedImages,
      message: 'Product image uploaded successfully.',
    });
  } catch (err: any) {
    console.error('Error uploading image:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to upload product image.',
    });
  }
});

/**
 * PUT /api/admin/products/:productId/images/:imageId/primary
 * Set a specific image as the primary image (IMG-19, IMG-20)
 */
adminProductRouter.put('/:productId/images/:imageId/primary', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser;
  const { productId, imageId } = req.params;

  try {
    const prodRef = doc(db, 'products', productId);
    const prodSnap = await getDoc(prodRef);

    if (!prodSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'PRODUCT_NOT_FOUND',
        message: `Product with ID '${productId}' was not found.`,
      });
    }

    const product = prodSnap.data() as Product;
    const currentImages: ProductImageMetadata[] = Array.isArray(product.images) ? [...product.images] : [];

    const targetImg = currentImages.find(img => img.imageId === imageId);
    if (!targetImg) {
      return res.status(404).json({
        success: false,
        error: 'IMAGE_NOT_FOUND',
        message: `Image with ID '${imageId}' was not found on this product.`,
      });
    }

    // Exactly one primary enforced (IMG-19, IMG-20)
    const updatedImages = currentImages.map(img => ({
      ...img,
      isPrimary: img.imageId === imageId,
    }));

    const now = new Date().toISOString();
    await runTransaction(db, async txn => {
      txn.update(prodRef, {
        images: updatedImages,
        imageUrl: targetImg.url,
        thumbnailUrl: targetImg.url,
        image: targetImg.url,
        mainImage: targetImg.url,
        updatedAt: now,
        updatedBy: adminUser.uid,
        _serverTxnToken: SERVER_TXN_TOKEN,
        _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      });
    });

    // Immutable audit log (IMG-33)
    await logAdminAudit({
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      action: 'PRODUCT_IMAGE_SET_PRIMARY',
      targetType: 'PRODUCT',
      targetId: productId,
      req,
      metadata: {
        productId,
        imageId,
        primaryUrl: targetImg.url,
      },
    });

    return res.status(200).json({
      success: true,
      imageId,
      images: updatedImages,
      message: 'Primary image updated successfully.',
    });
  } catch (err: any) {
    console.error('Error setting primary image:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to set primary image.',
    });
  }
});

/**
 * PUT /api/admin/products/:productId/images/reorder
 * Reorder images array based on provided imageIds array (IMG-21)
 */
adminProductRouter.put('/:productId/images/reorder', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser;
  const { productId } = req.params;
  const { imageIds } = req.body || {};

  if (!Array.isArray(imageIds)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_ORDER_PAYLOAD',
      message: 'imageIds array is required.',
    });
  }

  try {
    const prodRef = doc(db, 'products', productId);
    const prodSnap = await getDoc(prodRef);

    if (!prodSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'PRODUCT_NOT_FOUND',
        message: `Product with ID '${productId}' was not found.`,
      });
    }

    const product = prodSnap.data() as Product;
    const currentImages: ProductImageMetadata[] = Array.isArray(product.images) ? [...product.images] : [];

    // Reorder matching image objects
    const reordered: ProductImageMetadata[] = [];
    imageIds.forEach((id, index) => {
      const found = currentImages.find(img => img.imageId === id);
      if (found) {
        reordered.push({
          ...found,
          sortOrder: index,
        });
      }
    });

    // Add any not in imageIds
    currentImages.forEach(img => {
      if (!reordered.some(r => r.imageId === img.imageId)) {
        reordered.push({
          ...img,
          sortOrder: reordered.length,
        });
      }
    });

    const now = new Date().toISOString();
    await runTransaction(db, async txn => {
      txn.update(prodRef, {
        images: reordered,
        updatedAt: now,
        updatedBy: adminUser.uid,
        _serverTxnToken: SERVER_TXN_TOKEN,
        _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      });
    });

    // Immutable audit log (IMG-33)
    await logAdminAudit({
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      action: 'PRODUCT_IMAGES_REORDERED',
      targetType: 'PRODUCT',
      targetId: productId,
      req,
      metadata: {
        productId,
        reorderedIds: imageIds,
      },
    });

    return res.status(200).json({
      success: true,
      images: reordered,
      message: 'Product images reordered successfully.',
    });
  } catch (err: any) {
    console.error('Error reordering images:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to reorder images.',
    });
  }
});

/**
 * DELETE /api/admin/products/:productId/images/:imageId
 * Delete an image.
 * If deleting primary image, promotes another image (IMG-22, IMG-23).
 * If deleting final image, leaves no primary (IMG-24).
 */
adminProductRouter.delete('/:productId/images/:imageId', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser;
  const { productId, imageId } = req.params;

  try {
    const prodRef = doc(db, 'products', productId);
    const prodSnap = await getDoc(prodRef);

    if (!prodSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'PRODUCT_NOT_FOUND',
        message: `Product with ID '${productId}' was not found.`,
      });
    }

    const product = prodSnap.data() as Product;
    const currentImages: ProductImageMetadata[] = Array.isArray(product.images) ? [...product.images] : [];

    const imgToDelete = currentImages.find(img => img.imageId === imageId);
    if (!imgToDelete) {
      return res.status(404).json({
        success: false,
        error: 'IMAGE_NOT_FOUND',
        message: `Image with ID '${imageId}' was not found.`,
      });
    }

    const remainingImages = currentImages.filter(img => img.imageId !== imageId);

    // If deleted image was primary, promote another image (IMG-23)
    let newPrimaryUrl = '';
    if (imgToDelete.isPrimary) {
      if (remainingImages.length > 0) {
        remainingImages[0].isPrimary = true;
        newPrimaryUrl = remainingImages[0].url;
      }
      // If remainingImages.length === 0, leaves no primary (IMG-24)
    } else {
      const existingPrimary = remainingImages.find(img => img.isPrimary);
      if (existingPrimary) {
        newPrimaryUrl = existingPrimary.url;
      } else if (remainingImages.length > 0) {
        remainingImages[0].isPrimary = true;
        newPrimaryUrl = remainingImages[0].url;
      }
    }

    // Re-index sortOrder
    remainingImages.forEach((img, idx) => {
      img.sortOrder = idx;
    });

    const now = new Date().toISOString();
    await runTransaction(db, async txn => {
      txn.update(prodRef, {
        images: remainingImages,
        imageUrl: newPrimaryUrl,
        thumbnailUrl: newPrimaryUrl,
        image: newPrimaryUrl,
        mainImage: newPrimaryUrl,
        updatedAt: now,
        updatedBy: adminUser.uid,
        _serverTxnToken: SERVER_TXN_TOKEN,
        _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      });
    });

    // Delete local storage file if exists
    try {
      if (imgToDelete.storagePath) {
        const fullLocalPath = path.join(process.cwd(), 'public', 'uploads', imgToDelete.storagePath.replace('products/', 'products/'));
        if (fs.existsSync(fullLocalPath)) {
          fs.unlinkSync(fullLocalPath);
        }
      }
    } catch {
      // non-blocking
    }

    // Immutable audit log (IMG-33)
    await logAdminAudit({
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      action: 'PRODUCT_IMAGE_DELETED',
      targetType: 'PRODUCT',
      targetId: productId,
      req,
      metadata: {
        productId,
        deletedImageId: imageId,
        wasPrimary: imgToDelete.isPrimary,
        remainingCount: remainingImages.length,
        newPrimaryUrl,
      },
    });

    return res.status(200).json({
      success: true,
      deletedImageId: imageId,
      images: remainingImages,
      primaryUrl: newPrimaryUrl,
      message: 'Product image deleted successfully.',
    });
  } catch (err: any) {
    console.error('Error deleting image:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to delete product image.',
    });
  }
});

/**
 * PUT /api/admin/products/:productId/images/:imageId/replace
 * Replace existing image content while preserving sortOrder and isPrimary (IMG-25)
 */
adminProductRouter.put('/:productId/images/:imageId/replace', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser;
  const { productId, imageId } = req.params;
  const { fileData, fileName = 'replacement.jpg', contentType, altText } = req.body || {};

  try {
    const prodRef = doc(db, 'products', productId);
    const prodSnap = await getDoc(prodRef);

    if (!prodSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'PRODUCT_NOT_FOUND',
        message: `Product with ID '${productId}' was not found.`,
      });
    }

    const product = prodSnap.data() as Product;
    const currentImages: ProductImageMetadata[] = Array.isArray(product.images) ? [...product.images] : [];

    const existingIndex = currentImages.findIndex(img => img.imageId === imageId);
    if (existingIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'IMAGE_NOT_FOUND',
        message: `Image with ID '${imageId}' was not found.`,
      });
    }

    const existingImg = currentImages[existingIndex];

    if (!fileData || typeof fileData !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'MISSING_IMAGE_DATA',
        message: 'fileData string is required for replacement.',
      });
    }

    // Determine MIME
    let mime = (contentType || '').toLowerCase().trim();
    let base64Payload = fileData;
    if (fileData.startsWith('data:')) {
      const match = fileData.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        mime = match[1].toLowerCase().trim();
        base64Payload = match[2];
      }
    }

    const buffer = Buffer.from(base64Payload, 'base64');
    const sizeBytes = buffer.length;

    // Reject SVG
    if (mime === 'image/svg+xml' || mime.includes('svg') || (fileName && fileName.toLowerCase().endsWith('.svg'))) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_IMAGE_TYPE',
        message: 'SVG format is rejected.',
      });
    }

    // Reject GIF
    if (mime === 'image/gif' || mime.includes('gif') || (fileName && fileName.toLowerCase().endsWith('.gif'))) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_IMAGE_TYPE',
        message: 'GIF animation format is rejected.',
      });
    }

    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(mime)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_IMAGE_TYPE',
        message: 'Only JPEG, PNG, and WebP formats are accepted.',
      });
    }

    if (sizeBytes > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        error: 'FILE_TOO_LARGE',
        message: 'Replacement image exceeds 5MB limit.',
      });
    }

    let ext = 'jpg';
    if (mime.includes('png')) ext = 'png';
    else if (mime.includes('webp')) ext = 'webp';

    const newStoragePath = `products/${productId}/${imageId}_v2.${ext}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'products', productId);
    const localFilePath = path.join(uploadDir, `${imageId}_v2.${ext}`);

    fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(localFilePath, buffer);
    const newPublicUrl = `/uploads/products/${productId}/${imageId}_v2.${ext}`;

    // Preserve isPrimary and sortOrder (IMG-25)
    const updatedImage: ProductImageMetadata = {
      ...existingImg,
      url: newPublicUrl,
      storagePath: newStoragePath,
      altText: altText || existingImg.altText,
    };

    const updatedImages = [...currentImages];
    updatedImages[existingIndex] = updatedImage;

    const now = new Date().toISOString();
    await runTransaction(db, async txn => {
      const updatePayload: any = {
        images: updatedImages,
        updatedAt: now,
        updatedBy: adminUser.uid,
        _serverTxnToken: SERVER_TXN_TOKEN,
        _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      };
      if (existingImg.isPrimary) {
        updatePayload.imageUrl = newPublicUrl;
        updatePayload.thumbnailUrl = newPublicUrl;
        updatePayload.image = newPublicUrl;
        updatePayload.mainImage = newPublicUrl;
      }
      txn.update(prodRef, updatePayload);
    });

    // Immutable audit log (IMG-33)
    await logAdminAudit({
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      action: 'PRODUCT_IMAGE_REPLACED',
      targetType: 'PRODUCT',
      targetId: productId,
      req,
      metadata: {
        productId,
        imageId,
        oldUrl: existingImg.url,
        newUrl: newPublicUrl,
        isPrimary: existingImg.isPrimary,
      },
    });

    return res.status(200).json({
      success: true,
      image: updatedImage,
      images: updatedImages,
      message: 'Product image replaced successfully.',
    });
  } catch (err: any) {
    console.error('Error replacing image:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to replace product image.',
    });
  }
});
