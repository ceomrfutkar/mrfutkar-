/**
 * MR FUTKAR — Super Admin Product Management Validation & Normalization Module
 * Phase 3B-2A: Product Management Backend + Data Model + Security Foundation
 */
import { ProductImageMetadata } from '../src/types/product';

export interface ValidatedProductInput {
  productName: string;
  sku: string;
  barcode?: string;
  description: string;
  brandId: string;
  brandName: string;
  categoryId: string;
  categoryName: string;
  subcategoryId?: string;
  subcategoryName?: string;
  mrp: number;
  wholesalePrice: number;
  sellingPrice: number;
  minimumOrderQuantity: number;
  caseQuantity: number;
  stockQuantity: number;
  lowStockThreshold: number;
  unit: string;
  packSize: string;
  isActive: boolean;
  imageUrl: string;
  mainImage: string;
  images: ProductImageMetadata[];
}

export interface ProductValidationError {
  field: string;
  message: string;
}

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ProductValidationError[];
  errorSummary?: string;
}

/**
 * Normalizes SKU: trims, converts to uppercase, validates characters
 */
export function normalizeSku(val: unknown): { valid: boolean; value?: string; error?: string } {
  if (typeof val !== 'string') {
    return { valid: false, error: 'SKU must be a string.' };
  }
  const normalized = val.trim().toUpperCase();
  if (normalized.length < 2 || normalized.length > 50) {
    return { valid: false, error: 'SKU must be between 2 and 50 characters in length.' };
  }
  if (!/^[A-Z0-9_\-\.\/]+$/.test(normalized)) {
    return { valid: false, error: 'SKU must contain only uppercase alphanumeric characters, hyphens, underscores, slashes, or dots.' };
  }
  return { valid: true, value: normalized };
}

/**
 * Normalizes Barcode: optional string, trimmed, alphanumeric with hyphens
 */
export function normalizeBarcode(val: unknown): { valid: boolean; value?: string; error?: string } {
  if (val === undefined || val === null || val === '') {
    return { valid: true, value: undefined };
  }
  if (typeof val !== 'string') {
    return { valid: false, error: 'Barcode must be a string if provided.' };
  }
  const normalized = val.trim();
  if (normalized.length < 4 || normalized.length > 50) {
    return { valid: false, error: 'Barcode must be between 4 and 50 characters in length.' };
  }
  if (!/^[A-Za-z0-9_\-]+$/.test(normalized)) {
    return { valid: false, error: 'Barcode must contain only alphanumeric characters, hyphens, or underscores.' };
  }
  return { valid: true, value: normalized };
}

/**
 * Basic sanitization of string descriptions to prevent HTML injection
 */
export function sanitizeText(val: unknown, maxLength: number = 2000): string {
  if (typeof val !== 'string') return '';
  return val
    .replace(/<[^>]*>?/gm, '') // Strip HTML tags
    .trim()
    .slice(0, maxLength);
}

/**
 * Validates product image metadata array according to Phase 3B-2A Section 18:
 * - max 5 images
 * - exactly one primary image if images.length > 0
 * - unique sortOrder
 * - secure storagePath
 */
export function validateImageMetadata(imagesInput: unknown): { valid: boolean; images: ProductImageMetadata[]; error?: string } {
  if (imagesInput === undefined || imagesInput === null) {
    return { valid: true, images: [] };
  }

  if (!Array.isArray(imagesInput)) {
    return { valid: false, images: [], error: 'Images must be an array of image metadata.' };
  }

  if (imagesInput.length > 5) {
    return { valid: false, images: [], error: 'Maximum of 5 product images allowed.' };
  }

  if (imagesInput.length === 0) {
    return { valid: true, images: [] };
  }

  const validatedImages: ProductImageMetadata[] = [];
  const seenSortOrders = new Set<number>();
  let primaryCount = 0;

  for (let i = 0; i < imagesInput.length; i++) {
    const item = imagesInput[i];
    if (!item || typeof item !== 'object') {
      return { valid: false, images: [], error: `Image at index ${i} is invalid.` };
    }

    const imageId = typeof item.imageId === 'string' && item.imageId.trim()
      ? item.imageId.trim()
      : `IMG-${Date.now()}-${i}`;

    const url = typeof item.url === 'string' ? item.url.trim() : '';
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/') && !url.startsWith('data:image/'))) {
      return { valid: false, images: [], error: `Image at index ${i} has an invalid URL.` };
    }

    const storagePath = typeof item.storagePath === 'string' ? item.storagePath.trim() : `products/${imageId}.jpg`;
    if (!/^[a-zA-Z0-9_\-\.\/]+$/.test(storagePath)) {
      return { valid: false, images: [], error: `Image storage path contains invalid characters.` };
    }

    const sortOrder = Number.isInteger(item.sortOrder) && item.sortOrder >= 0 ? item.sortOrder : i;
    if (seenSortOrders.has(sortOrder)) {
      return { valid: false, images: [], error: `Duplicate image sortOrder ${sortOrder} detected.` };
    }
    seenSortOrders.add(sortOrder);

    const isPrimary = Boolean(item.isPrimary);
    if (isPrimary) {
      primaryCount++;
    }

    validatedImages.push({
      imageId,
      url,
      storagePath,
      sortOrder,
      isPrimary,
      altText: typeof item.altText === 'string' ? sanitizeText(item.altText, 200) : '',
      createdAt: item.createdAt && typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
    });
  }

  if (validatedImages.length > 0 && primaryCount !== 1) {
    return { valid: false, images: [], error: `Exactly one primary image is required (found ${primaryCount}).` };
  }

  return { valid: true, images: validatedImages };
}

/**
 * Validates complete product creation request body
 */
export function validateProductCreate(body: any): ValidationResult<ValidatedProductInput> {
  const errors: ProductValidationError[] = [];

  if (!body || typeof body !== 'object') {
    return {
      success: false,
      errors: [{ field: 'body', message: 'Request body must be a valid JSON object.' }],
      errorSummary: 'Request body must be a valid JSON object.',
    };
  }

  // 1. Name / productName
  const rawName = body.productName || body.name;
  if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
    errors.push({ field: 'productName', message: 'Product name is required and cannot be empty.' });
  } else if (rawName.trim().length > 150) {
    errors.push({ field: 'productName', message: 'Product name must not exceed 150 characters.' });
  }
  const productName = (rawName || '').trim();

  // 2. SKU
  const skuCheck = normalizeSku(body.sku);
  if (!skuCheck.valid) {
    errors.push({ field: 'sku', message: skuCheck.error || 'Invalid SKU.' });
  }
  const sku = skuCheck.value || '';

  // 3. Barcode (optional)
  const barcodeCheck = normalizeBarcode(body.barcode);
  if (!barcodeCheck.valid) {
    errors.push({ field: 'barcode', message: barcodeCheck.error || 'Invalid barcode.' });
  }
  const barcode = barcodeCheck.value;

  // 4. MRP
  const rawMrp = Number(body.mrp);
  if (typeof body.mrp === 'undefined' || isNaN(rawMrp) || !Number.isFinite(rawMrp) || rawMrp <= 0) {
    errors.push({ field: 'mrp', message: 'MRP must be a finite positive number greater than 0.' });
  }

  // 5. Wholesale Price / Selling Price
  const rawWholesale = Number(body.wholesalePrice !== undefined ? body.wholesalePrice : (body.sellingPrice !== undefined ? body.sellingPrice : body.price));
  if (isNaN(rawWholesale) || !Number.isFinite(rawWholesale) || rawWholesale < 0) {
    errors.push({ field: 'wholesalePrice', message: 'Wholesale price must be a valid number greater than or equal to 0.' });
  } else if (!isNaN(rawMrp) && rawWholesale > rawMrp) {
    errors.push({ field: 'wholesalePrice', message: `Wholesale price (₹${rawWholesale}) cannot exceed MRP (₹${rawMrp}).` });
  }

  // 6. Minimum Order Quantity (MOQ)
  const rawMoq = Number(body.minimumOrderQuantity !== undefined ? body.minimumOrderQuantity : body.moq);
  const moq = isNaN(rawMoq) ? 1 : rawMoq;
  if (!Number.isInteger(moq) || moq < 1) {
    errors.push({ field: 'minimumOrderQuantity', message: 'Minimum Order Quantity (MOQ) must be a positive integer >= 1.' });
  }

  // 7. Case Quantity
  const rawCaseQty = Number(body.caseQuantity !== undefined ? body.caseQuantity : 1);
  if (!Number.isInteger(rawCaseQty) || rawCaseQty < 1) {
    errors.push({ field: 'caseQuantity', message: 'Case quantity must be an integer >= 1.' });
  }

  // 8. Stock Quantity
  const rawStock = Number(body.stockQuantity !== undefined ? body.stockQuantity : (body.stock !== undefined ? body.stock : 0));
  if (!Number.isInteger(rawStock) || rawStock < 0) {
    errors.push({ field: 'stockQuantity', message: 'Stock quantity must be a non-negative integer >= 0.' });
  }

  // 9. Low Stock Threshold
  const rawThreshold = Number(body.lowStockThreshold !== undefined ? body.lowStockThreshold : 10);
  if (!Number.isInteger(rawThreshold) || rawThreshold < 0) {
    errors.push({ field: 'lowStockThreshold', message: 'Low stock threshold must be a non-negative integer >= 0.' });
  }

  // 10. Taxonomy (Brand & Category)
  const brandName = (body.brandName || body.brand || '').trim();
  const brandId = (body.brandId || brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-')).trim();
  if (!brandName) {
    errors.push({ field: 'brandName', message: 'Brand name is required.' });
  }

  const categoryName = (body.categoryName || body.category || '').trim();
  const categoryId = (body.categoryId || categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-')).trim();
  if (!categoryName) {
    errors.push({ field: 'categoryName', message: 'Category name is required.' });
  }

  // 11. Unit & Pack Size
  const unit = (body.unit || 'Pack').trim();
  const packSize = (body.packSize || '1 unit').trim();

  // 12. Description
  const description = sanitizeText(body.description || '');

  // 13. Active flag
  const isActive = body.isActive !== undefined ? Boolean(body.isActive) : (body.active !== undefined ? Boolean(body.active) : true);

  // 14. Images & Media
  const imageValidation = validateImageMetadata(body.images);
  if (!imageValidation.valid) {
    errors.push({ field: 'images', message: imageValidation.error || 'Invalid images array.' });
  }
  const images = imageValidation.images;
  const primaryImg = images.find(img => img.isPrimary);
  const imageUrl = (primaryImg ? primaryImg.url : (body.imageUrl || body.image || '')).trim();

  if (errors.length > 0) {
    return {
      success: false,
      errors,
      errorSummary: errors.map(e => `${e.field}: ${e.message}`).join('; '),
    };
  }

  return {
    success: true,
    data: {
      productName,
      sku,
      barcode,
      description,
      brandId,
      brandName,
      categoryId,
      categoryName,
      subcategoryId: body.subcategoryId ? String(body.subcategoryId).trim() : undefined,
      subcategoryName: body.subcategoryName ? String(body.subcategoryName).trim() : undefined,
      mrp: rawMrp,
      wholesalePrice: rawWholesale,
      sellingPrice: rawWholesale,
      minimumOrderQuantity: moq,
      caseQuantity: rawCaseQty,
      stockQuantity: rawStock,
      lowStockThreshold: rawThreshold,
      unit,
      packSize,
      isActive,
      imageUrl,
      mainImage: imageUrl,
      images,
    },
  };
}

/**
 * Validates product update request body (PATCH /api/admin/products/:productId)
 * Rejects attempts to modify createdAt, createdBy, productId.
 * Rejects arbitrary stockQuantity manipulation (must use warehouse inventory adjustment).
 */
export function validateProductUpdate(
  body: any,
  existingProduct: any
): ValidationResult<Partial<ValidatedProductInput> & { stockQuantityAttempted?: boolean }> {
  const errors: ProductValidationError[] = [];

  if (!body || typeof body !== 'object') {
    return {
      success: false,
      errors: [{ field: 'body', message: 'Request body must be a valid JSON object.' }],
      errorSummary: 'Request body must be a valid JSON object.',
    };
  }

  // Guard against forbidden client overrides
  if (body.productId && body.productId !== existingProduct.productId) {
    errors.push({ field: 'productId', message: 'productId is immutable and cannot be changed.' });
  }
  if (body.createdBy && body.createdBy !== existingProduct.createdBy) {
    errors.push({ field: 'createdBy', message: 'createdBy is immutable and cannot be modified.' });
  }
  if (body.createdAt && body.createdAt !== existingProduct.createdAt) {
    errors.push({ field: 'createdAt', message: 'createdAt is immutable and cannot be modified.' });
  }

  // Inventory safety guard: Disallow arbitrary stock updates via PATCH /products/:productId
  if (body.stockQuantity !== undefined && Number(body.stockQuantity) !== Number(existingProduct.stockQuantity)) {
    return {
      success: false,
      errors: [{
        field: 'stockQuantity',
        message: 'Direct stock modifications are not permitted via product metadata update. Please use the warehouse inventory adjustment workflow.',
      }],
      errorSummary: 'Direct stock modifications are not permitted via product metadata update. Please use the warehouse inventory adjustment workflow.',
    };
  }

  const patchData: Partial<ValidatedProductInput> = {};

  // Name
  if (body.productName !== undefined || body.name !== undefined) {
    const rawName = body.productName !== undefined ? body.productName : body.name;
    if (typeof rawName !== 'string' || !rawName.trim()) {
      errors.push({ field: 'productName', message: 'Product name cannot be empty.' });
    } else if (rawName.trim().length > 150) {
      errors.push({ field: 'productName', message: 'Product name must not exceed 150 characters.' });
    } else {
      patchData.productName = rawName.trim();
    }
  }

  // SKU
  if (body.sku !== undefined) {
    const skuCheck = normalizeSku(body.sku);
    if (!skuCheck.valid) {
      errors.push({ field: 'sku', message: skuCheck.error || 'Invalid SKU.' });
    } else {
      patchData.sku = skuCheck.value;
    }
  }

  // Barcode
  if (body.barcode !== undefined) {
    const barcodeCheck = normalizeBarcode(body.barcode);
    if (!barcodeCheck.valid) {
      errors.push({ field: 'barcode', message: barcodeCheck.error || 'Invalid barcode.' });
    } else {
      patchData.barcode = barcodeCheck.value;
    }
  }

  // Pricing
  const targetMrp = body.mrp !== undefined ? Number(body.mrp) : Number(existingProduct.mrp);
  if (body.mrp !== undefined) {
    if (isNaN(targetMrp) || !Number.isFinite(targetMrp) || targetMrp <= 0) {
      errors.push({ field: 'mrp', message: 'MRP must be a finite positive number greater than 0.' });
    } else {
      patchData.mrp = targetMrp;
    }
  }

  const rawWholesale = body.wholesalePrice !== undefined
    ? Number(body.wholesalePrice)
    : (body.sellingPrice !== undefined ? Number(body.sellingPrice) : (body.price !== undefined ? Number(body.price) : undefined));

  if (rawWholesale !== undefined) {
    if (isNaN(rawWholesale) || !Number.isFinite(rawWholesale) || rawWholesale < 0) {
      errors.push({ field: 'wholesalePrice', message: 'Wholesale price must be a valid number greater than or equal to 0.' });
    } else if (!isNaN(targetMrp) && rawWholesale > targetMrp) {
      errors.push({ field: 'wholesalePrice', message: `Wholesale price (₹${rawWholesale}) cannot exceed MRP (₹${targetMrp}).` });
    } else {
      patchData.wholesalePrice = rawWholesale;
      patchData.sellingPrice = rawWholesale;
    }
  }

  // MOQ
  const rawMoq = body.minimumOrderQuantity !== undefined ? Number(body.minimumOrderQuantity) : (body.moq !== undefined ? Number(body.moq) : undefined);
  if (rawMoq !== undefined) {
    if (!Number.isInteger(rawMoq) || rawMoq < 1) {
      errors.push({ field: 'minimumOrderQuantity', message: 'Minimum Order Quantity (MOQ) must be an integer >= 1.' });
    } else {
      patchData.minimumOrderQuantity = rawMoq;
    }
  }

  // Case Quantity
  if (body.caseQuantity !== undefined) {
    const rawCase = Number(body.caseQuantity);
    if (!Number.isInteger(rawCase) || rawCase < 1) {
      errors.push({ field: 'caseQuantity', message: 'Case quantity must be an integer >= 1.' });
    } else {
      patchData.caseQuantity = rawCase;
    }
  }

  // Low Stock Threshold
  if (body.lowStockThreshold !== undefined) {
    const rawThreshold = Number(body.lowStockThreshold);
    if (!Number.isInteger(rawThreshold) || rawThreshold < 0) {
      errors.push({ field: 'lowStockThreshold', message: 'Low stock threshold must be a non-negative integer >= 0.' });
    } else {
      patchData.lowStockThreshold = rawThreshold;
    }
  }

  // Taxonomy
  if (body.brandName !== undefined || body.brand !== undefined) {
    const bName = (body.brandName || body.brand || '').trim();
    if (!bName) {
      errors.push({ field: 'brandName', message: 'Brand name cannot be empty.' });
    } else {
      patchData.brandName = bName;
      patchData.brandId = body.brandId ? String(body.brandId).trim() : bName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }
  }

  if (body.categoryName !== undefined || body.category !== undefined) {
    const cName = (body.categoryName || body.category || '').trim();
    if (!cName) {
      errors.push({ field: 'categoryName', message: 'Category name cannot be empty.' });
    } else {
      patchData.categoryName = cName;
      patchData.categoryId = body.categoryId ? String(body.categoryId).trim() : cName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }
  }

  if (body.subcategoryId !== undefined) patchData.subcategoryId = String(body.subcategoryId).trim();
  if (body.subcategoryName !== undefined) patchData.subcategoryName = String(body.subcategoryName).trim();
  if (body.unit !== undefined) patchData.unit = String(body.unit).trim();
  if (body.packSize !== undefined) patchData.packSize = String(body.packSize).trim();
  if (body.description !== undefined) patchData.description = sanitizeText(body.description);

  // Active
  if (body.isActive !== undefined) patchData.isActive = Boolean(body.isActive);
  else if (body.active !== undefined) patchData.isActive = Boolean(body.active);

  // Images
  if (body.images !== undefined) {
    const imgCheck = validateImageMetadata(body.images);
    if (!imgCheck.valid) {
      errors.push({ field: 'images', message: imgCheck.error || 'Invalid images metadata.' });
    } else {
      patchData.images = imgCheck.images;
      const primary = imgCheck.images.find(i => i.isPrimary);
      if (primary) {
        patchData.imageUrl = primary.url;
        patchData.mainImage = primary.url;
      }
    }
  } else if (body.imageUrl !== undefined || body.image !== undefined) {
    const directUrl = String(body.imageUrl || body.image || '').trim();
    patchData.imageUrl = directUrl;
    patchData.mainImage = directUrl;
  }

  if (errors.length > 0) {
    return {
      success: false,
      errors,
      errorSummary: errors.map(e => `${e.field}: ${e.message}`).join('; '),
    };
  }

  return {
    success: true,
    data: patchData,
  };
}
