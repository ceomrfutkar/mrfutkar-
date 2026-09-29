export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface InventoryItem {
  productId: string;
  sku: string;
  barcode?: string;
  productName: string;
  brandName: string;
  category: string;
  stockQuantity: number;
  lowStockThreshold: number;
  stockStatus: StockStatus;
  mrp: number;
  wholesalePrice: number;
  unit: string;
  packSize?: string;
  caseQuantity?: number;
  imageUrl?: string;
  isActive: boolean;
  updatedAt: string;
}

export interface InventoryMovement {
  movementId: string;
  productId: string;
  productName: string;
  sku: string;
  previousStock: number;
  delta: number;
  newStock: number;
  reason: string;
  notes?: string;
  referenceType: string;
  referenceId?: string;
  movementType?: string;
  performedBy: string;
  performedByRole: string;
  userName?: string;
  timestamp: string;
  createdAt: string;
  warehouseId: string;
}

export interface InventorySummary {
  totalProducts: number;
  inStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalStockUnits: number;
}

export interface InventoryListResponse {
  success: boolean;
  products: InventoryItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: InventorySummary;
}

export interface ManualStockAdjustPayload {
  productId?: string;
  adjustmentType: 'ADD' | 'REMOVE';
  quantity: number;
  reason: string;
  notes?: string;
  idempotencyKey?: string;
}
