export interface ProductImageMetadata {
  imageId: string;
  url: string;
  storagePath: string;
  sortOrder: number;
  isPrimary: boolean;
  altText?: string;
  createdAt: string;
}

export interface PriceSlab {
  minQuantity: number;
  maxQuantity?: number | null;
  unitPrice?: number;
  slabPrice?: number;
  price?: number;
  discountPercent?: number;
  label?: string;
  active?: boolean;
  priority?: number;
}

export type PricingType = 'DEFAULT' | 'CUSTOMER_FIXED' | 'CUSTOMER_SLAB' | 'GLOBAL_SLAB';

export interface ProductPricingRule {
  id?: string;
  pricingId?: string;
  productId: string;
  retailerId?: string;
  pricingType: PricingType;
  slabs?: PriceSlab[];
  priceSlabs?: PriceSlab[];
  fixedPrice?: number;
  active: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Product {
  // Core Identifiers
  productId: string;
  sku: string;
  barcode: string;
  productName: string;
  shortName?: string;
  schemeDescription?: string;

  // Taxonomy
  brandId: string;
  brandName: string;
  categoryId: string;
  categoryName: string;
  subcategoryId?: string;
  subcategoryName?: string;

  // Media & Info
  description: string;
  imageUrl: string;
  thumbnailUrl?: string;
  mainImage?: string;
  images?: ProductImageMetadata[];

  // Base Pricing
  mrp: number;
  sellingPrice: number;
  wholesalePrice?: number;
  discountPercent: number;
  discountAmount: number;

  // B2B Wholesale Details
  minimumOrderQuantity: number;
  unit: string;
  packSize: string;
  caseQuantity: number;

  // Slabs & Volume Pricing
  priceSlabs?: PriceSlab[];

  // Inventory
  stockQuantity: number;
  stockUnit: string;
  isInStock: boolean;
  lowStockThreshold: number;

  // Business Flags
  isFeatured?: boolean;
  isHotSelling?: boolean;
  isTodaysDeal?: boolean;
  isRecommended?: boolean;
  isBuyAgainEligible?: boolean;
  isActive: boolean;

  // Timestamps & Audit
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  warehouseId?: string;
  warehouseName?: string;

  // --- Backward Compatibility Aliases for existing UI ---
  id: string; // alias to productId
  name: string; // alias to productName
  brand: string; // alias to brandName
  category: string; // alias to categoryName
  price: number; // alias to sellingPrice
  image: string; // alias to imageUrl
  moq?: number; // alias to minimumOrderQuantity
  stock?: number; // alias to stockQuantity
  inStock?: boolean; // alias to isInStock
  stockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock';
  marginPercent?: number; // alias to discountPercent
  popular?: boolean; // alias to isFeatured || isHotSelling
  deal?: boolean; // alias to isTodaysDeal
  hotSelling?: boolean; // alias to isHotSelling
  recommended?: boolean; // alias to isRecommended
  recentOrder?: boolean; // alias to isBuyAgainEligible
}

export interface Brand {
  brandId: string;
  brandName: string;
  logoUrl?: string;
  isActive: boolean;
  sortOrder: number;
}

export interface Category {
  categoryId: string;
  name: string;
  imageUrl?: string;
  parentCategoryId: string | null;
  sortOrder: number;
  isActive: boolean;
  subcategories?: Category[];
}

export interface CartItem {
  productId: string;
  productName: string;
  imageUrl: string;
  quantity: number;
  unit: string;
  packSize: string;
  caseQuantity: number;
  unitPrice: number;
  mrp: number;
  discount: number;
  subtotal: number;
  brandName: string;
  priceSlabs?: PriceSlab[];
  stockQuantity: number;
  minimumOrderQuantity: number;

  // Legacy field support for existing screens
  id: string;
  name: string;
  brand: string;
  price: number;
  image: string;
  qty: number;
}
