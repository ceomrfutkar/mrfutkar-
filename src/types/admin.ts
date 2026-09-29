export type AdminRole = 'SUPER_ADMIN';

export type AdminStatus = 'ACTIVE' | 'SUSPENDED' | 'DISABLED' | 'ARCHIVED';

export interface AdminUser {
  uid: string;
  name: string;
  mobile: string;
  email?: string;
  role: AdminRole;
  status: AdminStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  createdBy?: string;
  permissionsVersion?: number;
  isActive?: boolean;
  archivedAt?: string;
  archivedReason?: string;
}

export interface AdminSession {
  uid: string;
  name: string;
  mobile: string;
  email: string;
  role: AdminRole;
  status: AdminStatus;
  permissionsVersion: number;
  lastLoginAt?: string;
}

export interface AdminProfile {
  uid: string;
  name: string;
  mobile: string;
  email: string;
  role: AdminRole;
  status: AdminStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  createdBy?: string;
  permissionsVersion: number;
}

export type AdminAuditAction =
  | 'ADMIN_LOGIN_SUCCESS'
  | 'ADMIN_LOGIN_REJECTED'
  | 'ADMIN_LOGOUT'
  | 'ADMIN_ACCESS_DENIED'
  | 'ADMIN_DASHBOARD_VIEW'
  | 'PRODUCT_CREATED'
  | 'PRODUCT_UPDATED'
  | 'PRODUCT_ACTIVATED'
  | 'PRODUCT_DEACTIVATED'
  | 'PRODUCT_IMAGE_UPLOADED'
  | 'PRODUCT_IMAGE_SET_PRIMARY'
  | 'PRODUCT_IMAGES_REORDERED'
  | 'PRODUCT_IMAGE_DELETED'
  | 'PRODUCT_IMAGE_REPLACED'
  | 'PRICING_RULE_CREATED'
  | 'PRICING_RULE_UPDATED'
  | 'PRICING_RULE_ACTIVATED'
  | 'PRICING_RULE_DEACTIVATED'
  | 'PRICING_PREVIEW_EXECUTED'
  | 'RETAILER_VIEWED'
  | 'RETAILER_ACTIVATED'
  | 'RETAILER_DEACTIVATED'
  | 'RETAILER_ORDER_HISTORY_VIEWED'
  | 'INVENTORY_VIEWED'
  | 'INVENTORY_ADJUSTMENT_CREATED'
  | 'ORDER_STATUS_CHANGED'
  | 'DELIVERY_PARTNER_ASSIGNED'
  | 'ADMIN_WAREHOUSE_VIEW'
  | 'ADMIN_WAREHOUSE_ORDER_VIEW'
  | 'ADMIN_DELIVERY_PARTNER_VIEW'
  | 'DELIVERY_PARTNER_ACTIVATED'
  | 'DELIVERY_PARTNER_DEACTIVATED'
  | 'DELIVERY_PARTNER_SUSPENDED'
  | 'ADMIN_NOTIFICATION_VIEW'
  | 'ADMIN_NOTIFICATION_RETRY'
  | 'ADMIN_NOTIFICATION_SEARCH'
  | 'ADMIN_NOTIFICATION_PREFERENCE_CHANGED'
  | 'ADMIN_REPORT_VIEW'
  | 'ADMIN_REPORT_EXPORT'
  | 'ADMIN_SETTINGS_VIEW'
  | 'ADMIN_SETTINGS_UPDATED'
  | 'ADMIN_USER_VIEWED'
  | 'ADMIN_USER_CREATED'
  | 'ADMIN_USER_STATUS_UPDATED'
  | 'ADMIN_USER_ACTIVATED'
  | 'ADMIN_USER_DEACTIVATED'
  | 'ADMIN_USER_SUSPENDED'
  | 'ADMIN_USER_REACTIVATED'
  | 'ADMIN_USER_AUDIT_VIEWED'
  | 'ADMIN_AUDIT_VIEWED'
  | 'ADMIN_AUDIT_EXPORTED'
  | 'ACCOUNT_CREATED'
  | 'ACCOUNT_UPDATED'
  | 'ACCOUNT_ACTIVATED'
  | 'ACCOUNT_DEACTIVATED'
  | 'JOURNAL_CREATED'
  | 'JOURNAL_UPDATED'
  | 'JOURNAL_POSTED'
  | 'JOURNAL_REVERSED'
  | 'ACCOUNTING_PERIOD_OPENED'
  | 'ACCOUNTING_PERIOD_CLOSED'
  | 'GENERAL_LEDGER_VIEWED'
  | 'TRIAL_BALANCE_VIEWED'
  | 'SALES_INVOICE_CREATED'
  | 'SALES_INVOICE_UPDATED'
  | 'SALES_INVOICE_ISSUED'
  | 'SALES_INVOICE_CANCELLED'
  | 'PURCHASE_INVOICE_CREATED'
  | 'PURCHASE_INVOICE_UPDATED'
  | 'PURCHASE_INVOICE_POSTED'
  | 'PURCHASE_INVOICE_CANCELLED'
  | 'SALES_INVOICE_VIEWED'
  | 'PURCHASE_INVOICE_VIEWED'
  | 'SALES_INVOICE_ACCOUNTING_POSTED'
  | 'PURCHASE_INVOICE_ACCOUNTING_POSTED'
  | 'CREDIT_DEBIT_NOTE_CREATED'
  | 'CREDIT_DEBIT_NOTE_UPDATED'
  | 'CREDIT_DEBIT_NOTE_POSTED'
  | 'CREDIT_DEBIT_NOTE_ACCOUNTING_POSTED'
  | 'CREDIT_DEBIT_NOTE_VIEWED'
  | 'CUSTOMER_LEDGER_VIEWED'
  | 'SUPPLIER_LEDGER_VIEWED'
  | 'CUSTOMER_RECEIPT_CREATED'
  | 'CUSTOMER_RECEIPT_VIEWED'
  | 'CUSTOMER_RECEIPT_UPDATED'
  | 'CUSTOMER_RECEIPT_POSTED';

export type AuditCategory =
  | 'ALL'
  | 'SECURITY'
  | 'SETTINGS'
  | 'CATALOGUE'
  | 'PRICING'
  | 'RETAILER'
  | 'INVENTORY'
  | 'ORDERS'
  | 'DELIVERY'
  | 'WAREHOUSE'
  | 'NOTIFICATION'
  | 'REPORTS'
  | 'ADMIN_USERS'
  | 'ACCOUNTING'
  | 'INVOICES';

export type AuditSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface AdminAuditRecord {
  logId: string;
  adminUid: string;
  adminName: string;
  action: AdminAuditAction;
  category: AuditCategory;
  severity: AuditSeverity;
  targetType?: string;
  targetId?: string;
  timestamp: string;
  ipHashOrRequestFingerprint?: string;
  metadata?: Record<string, any>;
}

export interface AdminAuditMetrics {
  totalEvents: number;
  securityEvents: number;
  eventsToday: number;
  eventsPast7Days: number;
  distinctAdminsCount: number;
  categoryCounts: Record<string, number>;
  severityCounts: Record<string, number>;
}

export interface AdminAuditListResponse {
  success: boolean;
  logs: AdminAuditRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  metrics: AdminAuditMetrics;
}

export type AdminActivityStatus = 'ONLINE' | 'ACTIVE_TODAY' | 'RECENT' | 'INACTIVE';

export interface AdminUserRow {
  uid: string;
  name: string;
  mobile: string;
  email?: string;
  role: AdminRole;
  status: AdminStatus;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  createdBy?: string;
  permissionsVersion: number;
  activityStatus: AdminActivityStatus;
  statusReason?: string;
  statusUpdatedBy?: string;
}

export interface AdminUserListSummary {
  total: number;
  active: number;
  suspended: number;
  disabled: number;
}

export interface AdminUserListResponse {
  success: boolean;
  users: AdminUserRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: AdminUserListSummary;
}

export interface AdminUserDetail {
  admin: AdminUserRow;
  recentActivity: Array<{
    logId: string;
    action: string;
    timestamp: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, any>;
    ipHashOrRequestFingerprint?: string;
  }>;
  auditLogs: Array<{
    logId: string;
    action: string;
    timestamp: string;
    adminUid: string;
    adminName: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, any>;
    ipHashOrRequestFingerprint?: string;
  }>;
  activityMetrics: {
    totalAuditActions: number;
    lastActionTimestamp?: string;
  };
}

export interface CreateAdminPayload {
  name: string;
  email: string;
  mobile: string;
  role?: AdminRole;
  reason?: string;
}

export interface UpdateAdminStatusPayload {
  status: AdminStatus;
  reason: string;
}

export interface AdminDeliveryPartnerRow {
  partnerId: string;
  userId: string;
  name: string;
  mobile: string;
  alternateMobile?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  availabilityStatus: 'AVAILABLE' | 'ON_DELIVERY' | 'OFFLINE' | 'PAUSED';
  assignedWarehouseId: string;
  assignedWarehouseName: string;
  vehicleType: string;
  vehicleNumber: string;
  licenseNumber: string;
  serviceAreas?: string[];
  activeOrdersCount: number;
  deliveredTodayCount: number;
  failedDeliveriesCount: number;
  pendingCodAmount: number;
  pendingCodCount: number;
  createdAt: string;
  updatedAt: string;
  lastActiveAt?: string;
}

export interface AdminDeliveryPartnerSummaryStats {
  totalPartners: number;
  activePartners: number;
  availablePartners: number;
  onDeliveryPartners: number;
  suspendedPartners: number;
  inactivePartners: number;
  totalActiveDeliveries: number;
  totalDeliveredToday: number;
  totalPendingCodAmount: number;
  totalPendingCodCount: number;
}

export interface AdminDeliveryPartnerDetailWorkload {
  assignedCount: number;
  acceptedCount: number;
  pickedUpCount: number;
  outForDeliveryCount: number;
  totalActiveCount: number;
  activeOrders: any[];
}

export interface AdminDeliveryPartnerDetailHistory {
  deliveredCount: number;
  failedCount: number;
  returnedCount: number;
  totalCompletedCount: number;
}

export interface AdminDeliveryPartnerDetailCod {
  pendingAmount: number;
  pendingCount: number;
  collectedAmount: number;
  collectedCount: number;
}

export interface AdminDeliveryPartnerPerformance {
  completionRate: number | null;
  completionRateDisplay: string;
  averageDeliveryDurationMinutes: number | null;
  averageDeliveryDurationDisplay: string;
  averageAcceptanceDurationMinutes: number | null;
  averageAcceptanceDurationDisplay: string;
  todayDeliveriesCount: number;
  todayDeliveriesAmount: number;
}

export interface AdminDeliveryPartnerDetail {
  partner: AdminDeliveryPartnerRow;
  workload: AdminDeliveryPartnerDetailWorkload;
  historySummary: AdminDeliveryPartnerDetailHistory;
  codSummary: AdminDeliveryPartnerDetailCod;
  performance: AdminDeliveryPartnerPerformance;
  auditLogs: any[];
}

export interface AdminAuditLog {
  logId: string;
  adminUid: string;
  adminName: string;
  action: AdminAuditAction;
  targetType?: string;
  targetId?: string;
  timestamp: string;
  ipHashOrRequestFingerprint?: string;
  metadata?: Record<string, any>;
}

export interface AdminDashboardMetrics {
  salesToday: number;
  ordersToday: number;
  pendingOrders: number;
  deliveredOrders: number;
  deliveredOrdersToday: number;
  activeRetailers: number;
  activeDeliveryPartners: number;
  lowStockProducts: number;
  codPending: number;
  codPendingCount: number;
}

export interface AdminRecentOrderItem {
  orderId: string;
  orderNumber: string;
  retailerId: string;
  retailerName: string;
  shopName: string;
  itemCount: number;
  itemsSummary: string;
  grandTotal: number;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  createdAt: string;
}

export interface AdminTopSellingProduct {
  productId: string;
  productName: string;
  sku: string;
  brandName?: string;
  unitsSold: number;
  salesValue: number;
}

export interface AdminDashboardData {
  salesToday: number;
  ordersToday: number;
  pendingOrders: number;
  deliveredOrdersToday: number;
  deliveredOrders: number;
  activeRetailers: number;
  activeDeliveryPartners: number;
  lowStockProducts: number;
  codPending: number;
  recentOrders: AdminRecentOrderItem[];
  topSellingProducts: AdminTopSellingProduct[];
  generatedAt: string;
}

export interface AdminNotificationMetrics {
  total: number;
  today: number;
  sent: number;
  delivered: number;
  failed: number;
  noTokens: number;
  skippedPreference: number;
  unread: number;
  retailerCount: number;
  deliveryPartnerCount: number;
  warehouseCount: number;
  orderLinkedCount: number;
  failedDeliveryCount: number;
  successRate: number;
  generatedAt: string;
}

export interface AdminNotificationItem {
  notificationId: string;
  notificationEventId: string;
  userId: string;
  recipientName?: string;
  recipientMobile?: string;
  role: string;
  type: string;
  event: string;
  title: string;
  body: string;
  orderId?: string;
  orderNumber?: string;
  read: boolean;
  deliveryStatus: string;
  errorDetails?: string;
  deepLink?: string;
  createdAt: string;
  retryCount?: number;
  lastRetriedAt?: string;
  lastRetriedBy?: string;
}

export interface AdminNotificationDetail extends AdminNotificationItem {
  retryHistory?: {
    retriedAt: string;
    retriedBy: string;
    previousStatus: string;
    newStatus: string;
  }[];
  recipientDetails?: {
    userId: string;
    name?: string;
    shopName?: string;
    phone?: string;
    role?: string;
    status?: string;
    warehouseId?: string;
  };
  orderDetails?: {
    orderId: string;
    orderNumber?: string;
    orderStatus?: string;
    grandTotal?: number;
    retailerId?: string;
  };
}

export interface AdminNotificationTokenRow {
  tokenId: string;
  userId: string;
  userName?: string;
  role: string;
  platform: string;
  deviceId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastSeenAt?: string;
  tokenMasked: string; // NEVER raw token
}

