export type OrderNotificationEventType =
  | 'ORDER_PLACED'
  | 'ORDER_CONFIRMED'
  | 'ORDER_ACCEPTED'
  | 'ORDER_PICKING'
  | 'ORDER_PACKED'
  | 'ORDER_READY_FOR_DISPATCH'
  | 'ORDER_ASSIGNED_TO_DELIVERY'
  | 'ORDER_ACCEPTED_BY_DELIVERY_PARTNER'
  | 'ORDER_PICKED_UP'
  | 'ORDER_OUT_FOR_DELIVERY'
  | 'ORDER_DELIVERED'
  | 'ORDER_FAILED_DELIVERY'
  | 'ORDER_RETURN_TO_WAREHOUSE'
  | 'ORDER_CANCELLED';

export type NotificationRecipientRole =
  | 'RETAILER'
  | 'WAREHOUSE_STAFF'
  | 'WAREHOUSE_MANAGER'
  | 'WAREHOUSE_ADMIN'
  | 'DELIVERY_PARTNER';

export type NotificationType =
  | 'ORDER'
  | 'DELIVERY'
  | 'WAREHOUSE'
  | 'ORDER_STATUS'
  | 'ACCOUNT'
  | 'SYSTEM';

export interface DeviceNotificationToken {
  tokenId: string;
  userId: string;
  role: NotificationRecipientRole;
  token: string;
  platform: 'web' | 'android' | 'ios';
  deviceId: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
  inactiveReason?: string;
}

export interface NotificationPreferences {
  orderUpdates: boolean;
  deliveryUpdates: boolean;
  promotionalNotifications: boolean;
}

export interface NotificationHistoryItem {
  notificationId: string;
  notificationEventId: string; // Deterministic idempotency key: e.g. `${orderId}_${event}`
  userId: string;
  retailerId?: string; // Kept for backward compatibility with retailer queries
  role: NotificationRecipientRole;
  type: NotificationType;
  event: OrderNotificationEventType;
  title: string;
  body: string;
  message?: string; // Backward compatibility
  orderId?: string;
  orderNumber?: string;
  read: boolean;
  isRead: boolean; // Backward compatibility
  createdAt: string;
  deepLink?: string;
  data?: Record<string, string>;
  deliveryStatus?: 'SENT' | 'FAILED' | 'NO_TOKENS' | 'SKIPPED_PREFERENCE';
  errorDetails?: string;
  _serverTxnToken?: string;
  _serverWriteNonce?: string;
}

export interface PushNotificationPayload {
  recipientUserId: string;
  role: NotificationRecipientRole;
  title: string;
  body: string;
  event: OrderNotificationEventType;
  type: NotificationType;
  orderId?: string;
  orderNumber?: string;
  deepLink?: string;
  data?: Record<string, string>;
  notificationEventId?: string;
}
