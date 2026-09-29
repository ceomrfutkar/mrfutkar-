import { WarehouseOrderStatus, OrderPickingState, OrderPackingState, OrderDispatchState } from './warehouse';
import { DeliveryOrderSnapshot } from './delivery';
import { DeliveryAddress, OrderItem } from './order';

export interface AdminWarehouseHub {
  warehouseId: 'WH-BRAHMPURI-01';
  warehouseName: string;
  branchName: string;
  location: {
    address: string;
    city: string;
    pincode: string;
    state: string;
  };
  status: 'OPERATIONAL' | 'MAINTENANCE' | 'OFFLINE';
  operatingHours: string;
  capabilities: string[];
}

export interface AdminWarehouseMetrics {
  awaitingAcceptance: number; // CONFIRMED
  currentlyPicking: number; // ACCEPTED, PICKING
  awaitingPacking: number; // PICKING (completed)
  packed: number; // PACKED
  readyForDispatch: number; // READY_FOR_DISPATCH
  dispatched: number; // DISPATCHED, OUT_FOR_DELIVERY
  delivered: number; // DELIVERED
  totalPendingWarehouseOrders: number;
  agingBreakdown: {
    aging_0_2h: number;
    aging_2_6h: number;
    aging_6_12h: number;
    aging_12_24h: number;
    aging_24h_plus: number;
    agingBeyondThreshold: number;
  };
  lowStockCount: number;
  outOfStockCount: number;
  lowStockProducts: Array<{
    productId: string;
    sku: string;
    productName: string;
    stockQuantity: number;
    lowStockThreshold: number;
    category?: string;
  }>;
  todayThroughput: {
    acceptedToday: number;
    pickedToday: number;
    packedToday: number;
    readyForDispatchToday: number;
    deliveredToday: number;
  };
  avgProcessingTimeMinutes: number | null;
}

export type WarehouseQueueType = 'acceptance' | 'picking' | 'packing' | 'dispatch' | 'all';

export type AgingBucket = '0_2h' | '2_6h' | '6_12h' | '12_24h' | '24h_plus';

export interface AdminWarehouseDeliveryAddress {
  addressLine1?: string;
  fullAddress?: string;
  city: string;
  state?: string;
  pincode: string;
  phone?: string;
  landmark?: string;
  shopName?: string;
  ownerName?: string;
}

export interface AdminWarehouseOrder {
  orderId: string;
  retailerId: string;
  retailerName: string;
  shopName: string;
  retailerMobile?: string;
  orderStatus: WarehouseOrderStatus;
  items: OrderItem[];
  itemCount: number;
  subtotal: number;
  discountTotal?: number;
  deliveryFee: number;
  taxTotal: number;
  grandTotal: number;
  paymentStatus: string;
  paymentMethod: string;
  deliveryAddress: AdminWarehouseDeliveryAddress;
  warehouseId: 'WH-BRAHMPURI-01';
  warehouseName: string;
  picking?: OrderPickingState;
  packing?: OrderPackingState;
  dispatch?: OrderDispatchState;
  delivery?: DeliveryOrderSnapshot;
  statusHistory?: Array<{
    status: string;
    timestamp: string;
    updatedBy?: string;
    notes?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  orderAgeMinutes: number;
  orderAgeFormatted: string;
  isAgingAlert: boolean;
}

export interface AdminWarehouseStaff {
  userId: string;
  name: string;
  email: string;
  role: 'WAREHOUSE_ADMIN' | 'WAREHOUSE_MANAGER' | 'WAREHOUSE_STAFF';
  warehouseId: 'WH-BRAHMPURI-01';
  warehouseName: string;
  branchName: string;
  isActive: boolean;
  updatedAt?: string;
}

export interface AdminWarehouseActivity {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  description: string;
  timestamp: string;
  actor: string;
  metadata?: Record<string, any>;
}
