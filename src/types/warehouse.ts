import { Order, OrderItem, PaymentMethod, PaymentStatus, DeliveryAddress } from './order';
import { DeliveryOrderSnapshot, DeliveryPaymentSnapshot } from './delivery';

export type WarehouseRole = 'WAREHOUSE_ADMIN' | 'WAREHOUSE_MANAGER' | 'WAREHOUSE_STAFF';

export interface WarehouseUser {
  userId: string;
  name: string;
  email: string;
  role: WarehouseRole;
  warehouseId: 'WH-BRAHMPURI-01';
  warehouseName: 'MR FUTKAR — BRAHMPURI';
  branchName: 'Brahmpuri Branch';
}

export interface WarehouseSession {
  uid: string;
  role: WarehouseRole;
  name: string;
  email: string;
  warehouseId: 'WH-BRAHMPURI-01';
  warehouseName: 'MR FUTKAR — BRAHMPURI';
  branchName: 'Brahmpuri Branch';
}

export type WarehouseOrderStatus =
  | 'PLACED'
  | 'CONFIRMED'
  | 'ACCEPTED'
  | 'PICKING'
  | 'PACKED'
  | 'READY_FOR_DISPATCH'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURN_REQUESTED'
  | 'RETURNED';

export interface PickingItemState {
  productId: string;
  requiredQty: number;
  pickedQty: number;
  isShort: boolean;
  notes?: string;
}

export interface OrderPickingState {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  startedAt?: string;
  completedAt?: string;
  pickedBy?: string;
  items: Record<string, PickingItemState>;
}

export interface OrderPackingState {
  status: 'NOT_STARTED' | 'PACKED';
  packedAt?: string;
  packedBy?: string;
  numberOfPackages: number;
  boxType?: string;
  packingNotes?: string;
}

export interface OrderDispatchState {
  deliveryArea: string;
  packageCount: number;
  assignedPartnerId?: string;
  assignedPartnerName?: string;
  vehicleNumber?: string;
  dispatchedAt?: string;
  deliveredAt?: string;
}

export interface WarehouseOrder extends Omit<Order, 'orderStatus'> {
  orderStatus: WarehouseOrderStatus;
  picking?: OrderPickingState;
  packing?: OrderPackingState;
  dispatch?: OrderDispatchState;
  delivery?: DeliveryOrderSnapshot;
  deliveryPayment?: DeliveryPaymentSnapshot;
}

export type StockStatus = 'IN STOCK' | 'LOW STOCK' | 'OUT OF STOCK';

export interface WarehouseInventoryItem {
  productId: string;
  sku: string;
  productName: string;
  brandName: string;
  category: string;
  imageUrl: string;
  currentStock: number;
  reservedStock: number;
  availableStock: number;
  minimumOrderQuantity: number;
  caseQuantity: number;
  lowStockThreshold: number;
  stockStatus: StockStatus;
  sellingPrice: number;
  mrp: number;
  warehouseId: 'WH-BRAHMPURI-01';
  warehouseName: 'MR FUTKAR — BRAHMPURI';
  unit: string;
  packSize: string;
  marginPercent?: number;
}

export type StockAdjustmentReason =
  | 'Stock increase'
  | 'Stock decrease'
  | 'Damage'
  | 'Expiry'
  | 'Physical count correction'
  | 'Purchase inward'
  | 'Return inward';

export const ALLOWED_ADJUSTMENT_REASONS: StockAdjustmentReason[] = [
  'Stock increase',
  'Stock decrease',
  'Damage',
  'Expiry',
  'Physical count correction',
  'Purchase inward',
  'Return inward',
];

export interface StockMovementRecord {
  movementId: string;
  productId: string;
  productName: string;
  sku: string;
  warehouseId: 'WH-BRAHMPURI-01';
  previousQuantity: number;
  adjustmentQuantity: number;
  newQuantity: number;
  reason: StockAdjustmentReason;
  notes?: string;
  userId: string;
  userName: string;
  timestamp: string;
}

export type ReturnStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'RECEIVED'
  | 'INSPECTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'REFUNDED';

export type InspectionStatus = 'PENDING' | 'PASSED' | 'FAILED' | 'DAMAGED';

export interface WarehouseReturnRecord {
  returnId: string;
  orderId: string;
  retailerId: string;
  retailerName: string;
  shopName: string;
  retailerMobile?: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  claimedItemPrice?: number;
  claimedTotalValue?: number;
  reason: string;
  description?: string;
  evidencePhotoUrls?: string[];
  evidenceStoragePaths?: string[];
  returnStatus: ReturnStatus;
  inspectionStatus: InspectionStatus;
  inspectionNotes?: string;
  warehouseId: 'WH-BRAHMPURI-01';
  warehouseName: 'MR FUTKAR — BRAHMPURI';
  claimSource?: 'RETAILER_PORTAL' | 'WAREHOUSE_MANUAL';
  submittedBy?: string;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseDashboardMetrics {
  todaysOrdersCount: number;
  newOrdersCount: number; // PLACED
  ordersToAcceptCount: number; // CONFIRMED
  ordersBeingPickedCount: number; // PICKING
  ordersPackedCount: number; // PACKED
  ordersReadyForDispatchCount: number; // READY_FOR_DISPATCH
  dispatchedOrdersCount: number; // DISPATCHED
  deliveredOrdersCount: number; // DELIVERED
  cancelledOrdersCount: number; // CANCELLED
  todaysSalesAmount: number;
  pendingFulfillmentValue: number;
  lowStockAlertsCount: number;
}
