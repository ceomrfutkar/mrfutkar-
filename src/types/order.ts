export enum OrderStatus {
  PLACED = 'PLACED',
  CONFIRMED = 'CONFIRMED',
  ACCEPTED = 'ACCEPTED',
  PICKING = 'PICKING',
  PACKED = 'PACKED',
  READY_FOR_DISPATCH = 'READY_FOR_DISPATCH',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export type PaymentMethod = 'COD' | 'UPI' | 'ONLINE';

export enum PaymentStatus {
  PENDING = 'PENDING',
  AUTHORIZED = 'AUTHORIZED',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export interface DeliveryAddress {
  id: string;
  shopName: string;
  ownerName: string;
  fullAddress: string;
  addressLine1?: string;
  landmark?: string;
  city: string;
  pincode: string;
  phone: string;
  isDefault?: boolean;
  latitude?: number;
  longitude?: number;
}

export interface DeliveryAddressSnapshot {
  fullAddress: string;
  landmark?: string;
  city: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
  shopName?: string;
  ownerName?: string;
  phone?: string;
}

export interface OrderItem {
  productId: string;
  sku: string;
  productName: string;
  brandName: string;
  imageUrl: string;
  quantity: number;
  unit: string;
  packSize: string;
  caseQuantity: number;
  unitPrice: number; // Historical snapshot
  discount: number; // Total discount amount on item
  subtotal: number; // Final item subtotal
  totalPrice?: number; // Calculated or populated line total

  // Phase 2C Part 2: Immutable Order Price Snapshot
  pricingSource?: 'CUSTOMER_SLAB' | 'CUSTOMER_FIXED' | 'GLOBAL_SLAB' | 'DEFAULT';
  pricingId?: string;
  slabMinQuantity?: number;
  slabMaxQuantity?: number | null;
  serverValidatedUnitPrice?: number;
  serverValidatedDiscount?: number;
  serverValidatedSubtotal?: number;
}

export interface Order {
  orderId: string; // e.g. MF-20260922-000123
  retailerId: string;
  retailerName: string;
  shopName: string;
  items: OrderItem[];
  deliveryAddress: DeliveryAddress;
  deliveryAddressSnapshot?: DeliveryAddressSnapshot;
  warehouseId: string;
  warehouseName: string;
  subtotal: number;
  discount: number;
  schemeDiscount?: number;
  deliveryCharge: number;
  tax: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  orderNotes?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;

  // Future-ready logistics fields
  deliveryPartnerId?: string;
  deliveryPartnerName?: string;
  estimatedDeliveryTime?: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  delivery?: any;
  deliveryCompletion?: any;
  deliveryOtp?: any;

  // Legacy compat aliases for UI resilience
  id?: string;
  orderNumber?: string;
  status?: any;
  total?: number;
  savings?: number;
  expectedDelivery?: string;
}
