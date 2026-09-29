export type ReportDatePreset =
  | 'TODAY'
  | 'YESTERDAY'
  | 'LAST_7_DAYS'
  | 'LAST_30_DAYS'
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'CUSTOM';

export type ReportGroupBy = 'daily' | 'weekly' | 'monthly';

export interface ReportMetadata {
  currency: 'INR';
  timezone: 'Asia/Kolkata';
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
  generatedAt: string; // ISO 8601
  preset: ReportDatePreset;
}

export interface ReportSummaryKpis {
  grossSales: number;
  deliveredSales: number;
  cancelledValue: number;
  failedDeliveryValue: number;
  returnToWarehouseValue: number;
  totalOrders: number;
  averageOrderValue: number;
  deliveredOrders: number;
  cancelledOrders: number;
  failedDeliveries: number;
  returnToWarehouseOrders: number;
  pendingCod: number;
  collectedCod: number;
  activeRetailers: number;
  activeDeliveryPartners: number;
}

export interface ReportSalesTrendPoint {
  period: string; // e.g. "2026-03-24" or "2026-W12" or "2026-03"
  date: string;   // Start date of period
  label: string;  // Formatted human readable label
  grossSales: number;
  deliveredSales: number;
  ordersCount: number;
  deliveredCount: number;
  cancelledCount: number;
}

export interface ReportOrderStatusDistributionItem {
  status: string;
  label: string;
  count: number;
  percentage: number;
  totalValue: number;
}

export interface ReportProductRow {
  productId: string;
  sku: string;
  productName: string;
  quantitySold: number;
  unitsSold?: number;
  salesValue: number;
  orderCount: number;
  averageSellingPrice: number;
  currentStock: number;
  lowStockThreshold: number;
  isLowStock: boolean;
}

export interface ReportRetailerRow {
  retailerId: string;
  shopName: string;
  ownerName: string;
  mobile: string;
  orderCount: number;
  totalSalesValue: number;
  deliveredOrderCount: number;
  cancelledOrderCount: number;
  averageOrderValue: number;
  lastOrderDate?: string;
  status: string;
}

export interface ReportDeliveryPartnerRow {
  partnerId: string;
  name: string;
  mobile: string;
  vehicleType?: string;
  assignedCount: number;
  acceptedCount: number;
  pickedUpCount: number;
  outForDeliveryCount: number;
  deliveredCount: number;
  failedCount: number;
  returnedCount: number;
  codPending: number;
  codCollected: number;
  successRate: number; // percentage 0-100
}

export interface ReportWarehouseMetrics {
  warehouseId: string;
  warehouseName: string;
  acceptedCount: number;
  pickedCount: number;
  packedCount: number;
  readyForDispatchCount: number;
  dispatchedCount: number;
  pendingOrdersCount: number;
  stockAdjustmentsCount: number;
  movementReasonsBreakdown: Record<string, number>;
}

export interface ReportCodMetrics {
  totalCodOrders: number;
  totalCodValue: number;
  pendingCodValue: number;
  collectedCodValue: number;
  failedCodValue: number;
  partnerBreakdown: Array<{
    partnerId: string;
    partnerName: string;
    pendingCod: number;
    collectedCod: number;
    orderCount: number;
  }>;
  trend: Array<{
    date: string;
    collectedCod: number;
    pendingCod: number;
  }>;
}

export interface ReportCancellationMetrics {
  cancellationCount: number;
  cancellationValue: number;
  cancellationRate: number; // percentage 0-100
  reasonsBreakdown: Record<string, number>;
  trend: Array<{
    date: string;
    count: number;
    value: number;
  }>;
}

export interface ReportFailedDeliveryMetrics {
  failedDeliveryCount: number;
  failedDeliveryValue: number;
  reasonsBreakdown: Record<string, number>;
  partnerBreakdown: Array<{
    partnerId: string;
    partnerName: string;
    failedCount: number;
    failedValue: number;
  }>;
  trend: Array<{
    date: string;
    count: number;
    value: number;
  }>;
}

export interface ReportReturnMetrics {
  returnCount: number;
  returnValue: number;
  reasonsBreakdown: Record<string, number>;
  recentReturns: Array<{
    returnId: string;
    orderId: string;
    retailerId: string;
    shopName?: string;
    deliveryPartnerId?: string;
    status: string;
    date: string;
    value: number;
    reason: string;
  }>;
}

export type ReportExportType =
  | 'sales'
  | 'orders'
  | 'products'
  | 'retailers'
  | 'delivery'
  | 'warehouse'
  | 'cod'
  | 'cancellations'
  | 'failed-deliveries'
  | 'returns';
