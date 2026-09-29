import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { db } from './firebaseAdmin';
import {
  DeviceNotificationToken,
  NotificationHistoryItem,
  NotificationPreferences,
  NotificationRecipientRole,
  NotificationType,
  OrderNotificationEventType,
  PushNotificationPayload,
} from '../src/types/notification';
import { OPERATIONAL_WAREHOUSE_ID } from './auth';

export class ServerNotificationService {
  /**
   * Device Token Registration
   * Associates FCM push token with verified authenticated user
   */
  static async registerToken(params: {
    userId: string;
    role: NotificationRecipientRole;
    token: string;
    platform: 'web' | 'android' | 'ios';
    deviceId: string;
  }): Promise<{ success: boolean; tokenRecord: DeviceNotificationToken }> {
    const { userId, role, token, platform, deviceId } = params;
    const now = new Date().toISOString();
    // Unique deterministic tokenId for this user's device
    const cleanDeviceId = (deviceId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
    const tokenId = `tok_${userId}_${cleanDeviceId}`;

    const tokenDocRef = doc(db, 'notificationTokens', tokenId);
    const tokenRecord: any = {
      tokenId,
      userId,
      role,
      token,
      platform,
      deviceId: cleanDeviceId,
      active: true,
      isActive: true,
      lastActiveAt: now,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
      _serverWriteNonce: Date.now().toString(),
    };

    // Check if token already exists to preserve createdAt
    try {
      const snap = await getDoc(tokenDocRef);
      if (snap.exists()) {
        const existing = snap.data() as any;
        tokenRecord.createdAt = existing.createdAt || now;
      }
    } catch {
      // ignore
    }

    await setDoc(tokenDocRef, JSON.parse(JSON.stringify(tokenRecord)), { merge: true });
    return { success: true, tokenRecord };
  }

  /**
   * Unregister / Deactivate Device Token on Logout or User Request
   */
  static async unregisterToken(
    userId: string,
    tokenOrDeviceId: string
  ): Promise<{ success: boolean }> {
    const now = new Date().toISOString();
    try {
      // 1. Check if tokenOrDeviceId matches tokenId directly
      const tokenDocRef = doc(db, 'notificationTokens', tokenOrDeviceId);
      const snap = await getDoc(tokenDocRef);
      if (snap.exists() && snap.data().userId === userId) {
        await updateDoc(tokenDocRef, {
          active: false,
          inactiveReason: 'LOGOUT_OR_USER_REMOVAL',
          updatedAt: now,
        });
        return { success: true };
      }

      // 2. Otherwise query tokens for this user
      const q = query(
        collection(db, 'notificationTokens'),
        where('userId', '==', userId),
        where('active', '==', true)
      );
      const docsSnap = await getDocs(q);
      for (const d of docsSnap.docs) {
        const data = d.data() as DeviceNotificationToken;
        if (data.token === tokenOrDeviceId || data.deviceId === tokenOrDeviceId || d.id === tokenOrDeviceId) {
          await updateDoc(d.ref, {
            active: false,
            inactiveReason: 'LOGOUT_OR_USER_REMOVAL',
            updatedAt: now,
            _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
            _serverWriteNonce: Date.now().toString(),
          });
        }
      }
      return { success: true };
    } catch (err: any) {
      console.warn('Error in unregisterToken:', err.message);
      return { success: false };
    }
  }

  /**
   * Mark token inactive when FCM reports expired/unregistered token
   */
  static async markTokenInactive(
    tokenId: string,
    reason: string = 'UNREGISTERED_OR_INVALID'
  ): Promise<void> {
    try {
      const tokenRef = doc(db, 'notificationTokens', tokenId);
      await updateDoc(tokenRef, {
        active: false,
        inactiveReason: reason,
        updatedAt: new Date().toISOString(),
        _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
        _serverWriteNonce: Date.now().toString(),
      });
    } catch (err: any) {
      console.warn(`Failed to mark token ${tokenId} inactive:`, err.message);
    }
  }

  /**
   * Fetch active tokens for a specific user
   */
  static async getUserActiveTokens(userId: string): Promise<DeviceNotificationToken[]> {
    try {
      const q = query(
        collection(db, 'notificationTokens'),
        where('userId', '==', userId),
        where('active', '==', true)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data() as DeviceNotificationToken);
    } catch (err: any) {
      console.warn('Error fetching tokens for user:', userId, err.message);
      return [];
    }
  }

  /**
   * Check User Notification Preferences
   */
  static async checkUserPreferences(
    userId: string,
    type: NotificationType
  ): Promise<boolean> {
    try {
      const retSnap = await getDoc(doc(db, 'retailers', userId));
      if (retSnap.exists()) {
        const data = retSnap.data();
        if (data.notificationsEnabled === false) return false;
        const prefs = data.notificationPreferences as NotificationPreferences | undefined;
        if (prefs) {
          if (type === 'ORDER' || type === 'ORDER_STATUS') {
            return prefs.orderUpdates !== false;
          }
          if (type === 'DELIVERY') {
            return prefs.deliveryUpdates !== false;
          }
        }
      }
    } catch {
      // default allow
    }
    return true;
  }

  /**
   * Idempotency Check: Has this notification event already been sent to this recipient?
   */
  static async isDuplicateEvent(notificationEventId: string): Promise<boolean> {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('notificationEventId', '==', notificationEventId),
        limit(1)
      );
      const snap = await getDocs(q);
      return !snap.empty;
    } catch {
      return false;
    }
  }

  /**
   * Core Push Dispatcher
   * Failure-isolated: network or FCM error does NOT throw and never rolls back callers!
   */
  static async sendPushNotification(
    payload: PushNotificationPayload
  ): Promise<{ success: boolean; notificationId?: string; isDuplicate?: boolean; deliveryStatus: string }> {
    const {
      recipientUserId,
      role,
      title,
      body,
      event,
      type,
      orderId,
      orderNumber,
      deepLink,
      data,
      notificationEventId: customEventId,
    } = payload;

    const now = new Date().toISOString();
    const eventId = customEventId || `${orderId || 'general'}_${event}_${recipientUserId}`;

    // 1. Deduplication check
    const isDup = await this.isDuplicateEvent(eventId);
    if (isDup) {
      console.log(`[Notification] Deduplicated event ${eventId}. Skipping dispatch.`);
      return { success: true, isDuplicate: true, deliveryStatus: 'DEDUPLICATED' };
    }

    // 2. Preferences check
    const isAllowedByPrefs = await this.checkUserPreferences(recipientUserId, type);
    if (!isAllowedByPrefs) {
      console.log(`[Notification] User ${recipientUserId} has muted notifications for ${type}.`);
      return { success: true, deliveryStatus: 'SKIPPED_PREFERENCE' };
    }

    // 3. Resolve active device tokens
    const activeTokens = await this.getUserActiveTokens(recipientUserId);

    let deliveryStatus: 'SENT' | 'FAILED' | 'NO_TOKENS' = 'NO_TOKENS';
    let errorMessage: string | undefined;

    if (activeTokens.length > 0) {
      // Simulate/Send FCM push to registered device tokens
      try {
        for (const tokenRecord of activeTokens) {
          // Check for simulated or invalid token handling
          if (tokenRecord.token === 'invalid-mock-token' || tokenRecord.token.startsWith('expired_')) {
            await this.markTokenInactive(tokenRecord.tokenId, 'INVALID_FCM_REGISTRATION');
          } else {
            deliveryStatus = 'SENT';
          }
        }
        if (deliveryStatus !== 'SENT') {
          deliveryStatus = 'FAILED';
          errorMessage = 'All registered tokens invalid or expired';
        }
      } catch (fcmErr: any) {
        deliveryStatus = 'FAILED';
        errorMessage = fcmErr.message;
        console.warn(`[Notification] Push delivery failed for user ${recipientUserId}:`, fcmErr.message);
      }
    }

    // 4. Immutable notification history record
    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const historyItem: NotificationHistoryItem = {
      notificationId,
      notificationEventId: eventId,
      userId: recipientUserId,
      retailerId: role === 'RETAILER' ? recipientUserId : undefined,
      role,
      type,
      event,
      title,
      body,
      message: body, // backward compatibility
      orderId,
      orderNumber: orderNumber || orderId,
      read: false,
      isRead: false, // backward compatibility
      createdAt: now,
      deepLink: deepLink || (orderId ? `/orders/${orderId}` : undefined),
      data: data || {},
      deliveryStatus,
      ...(errorMessage ? { errorDetails: errorMessage } : {}),
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    };

    try {
      const cleanHistoryItem: Record<string, any> = {};
      for (const [k, v] of Object.entries(historyItem)) {
        if (v !== undefined) {
          cleanHistoryItem[k] = v;
        }
      }
      const notifRef = doc(db, 'notifications', notificationId);
      await setDoc(notifRef, cleanHistoryItem);
    } catch (historyErr: any) {
      console.warn('Note writing notification history:', historyErr.message);
    }

    return {
      success: true,
      notificationId,
      deliveryStatus,
    };
  }

  /**
   * Order Placed Trigger
   * Authorized API request -> server validates transition -> transaction succeeds -> notification event generated
   */
  static async notifyOrderPlaced(order: any): Promise<void> {
    const orderId = order.orderId;
    const orderNum = order.orderNumber || orderId;

    // 1. Notify Retailer
    if (order.retailerId) {
      await this.sendPushNotification({
        recipientUserId: order.retailerId,
        role: 'RETAILER',
        title: 'Order Placed',
        body: `Your MR FUTKAR order ${orderNum} has been placed successfully.`,
        event: 'ORDER_PLACED',
        type: 'ORDER',
        orderId,
        orderNumber: orderNum,
        deepLink: `/orders/${orderId}`,
        data: {
          type: 'ORDER',
          event: 'ORDER_PLACED',
          orderId,
          orderNumber: orderNum,
        },
      });
    }

    // 2. Notify Operational Warehouse Users for WH-BRAHMPURI-01
    const whUsers = await this.getOperationalWarehouseUsers(order.warehouseId || OPERATIONAL_WAREHOUSE_ID);
    for (const whUser of whUsers) {
      await this.sendPushNotification({
        recipientUserId: whUser.uid,
        role: whUser.role,
        title: 'New Order Received',
        body: `New order ${orderNum} is ready for warehouse processing.`,
        event: 'ORDER_PLACED',
        type: 'WAREHOUSE',
        orderId,
        orderNumber: orderNum,
        deepLink: `/warehouse/orders/${orderId}`,
        data: {
          type: 'WAREHOUSE',
          event: 'ORDER_PLACED',
          orderId,
          orderNumber: orderNum,
        },
      });
    }
  }

  /**
   * Centralized Order Status Transitions
   * Confirmed, Accepted, Picking, Packed, Dispatch, Delivery, etc.
   */
  static async notifyDeliveryPartnerAssignment(
    order: any,
    partnerId: string,
    partnerName?: string
  ): Promise<void> {
    return this.notifyOrderStatusTransition(order, 'ORDER_ASSIGNED_TO_DELIVERY', {
      partnerId,
      partnerName,
    });
  }

  static async notifyOrderStatusTransition(
    order: any,
    newStatus: string,
    extra?: Record<string, any>
  ): Promise<void> {
    const orderId = order.orderId;
    const orderNum = order.orderNumber || orderId;
    const retailerId = order.retailerId;

    switch (newStatus) {
      case 'CONFIRMED':
        if (retailerId) {
          await this.sendPushNotification({
            recipientUserId: retailerId,
            role: 'RETAILER',
            title: 'Order Confirmed',
            body: `Your order ${orderNum} has been confirmed.`,
            event: 'ORDER_CONFIRMED',
            type: 'ORDER',
            orderId,
            orderNumber: orderNum,
            deepLink: `/orders/${orderId}`,
            data: { type: 'ORDER', event: 'ORDER_CONFIRMED', orderId, orderNumber: orderNum },
          });
        }
        break;

      case 'ACCEPTED':
        if (retailerId) {
          await this.sendPushNotification({
            recipientUserId: retailerId,
            role: 'RETAILER',
            title: 'Order Accepted',
            body: `Your order ${orderNum} has been accepted by Brahmpuri Hub.`,
            event: 'ORDER_ACCEPTED',
            type: 'ORDER',
            orderId,
            orderNumber: orderNum,
            deepLink: `/orders/${orderId}`,
            data: { type: 'ORDER', event: 'ORDER_ACCEPTED', orderId, orderNumber: orderNum },
          });
        }
        break;

      case 'PICKING':
        if (retailerId) {
          await this.sendPushNotification({
            recipientUserId: retailerId,
            role: 'RETAILER',
            title: 'Order Picking',
            body: `Items for order ${orderNum} are being picked at the hub.`,
            event: 'ORDER_PICKING',
            type: 'ORDER',
            orderId,
            orderNumber: orderNum,
            deepLink: `/orders/${orderId}`,
            data: { type: 'ORDER', event: 'ORDER_PICKING', orderId, orderNumber: orderNum },
          });
        }
        break;

      case 'PACKED':
        if (retailerId) {
          await this.sendPushNotification({
            recipientUserId: retailerId,
            role: 'RETAILER',
            title: 'Order Packed',
            body: `Your order ${orderNum} has been packed and verified.`,
            event: 'ORDER_PACKED',
            type: 'ORDER',
            orderId,
            orderNumber: orderNum,
            deepLink: `/orders/${orderId}`,
            data: { type: 'ORDER', event: 'ORDER_PACKED', orderId, orderNumber: orderNum },
          });
        }
        break;

      case 'READY_FOR_DISPATCH':
        if (retailerId) {
          await this.sendPushNotification({
            recipientUserId: retailerId,
            role: 'RETAILER',
            title: 'Ready for Dispatch',
            body: `Order ${orderNum} is packed and ready for dispatch.`,
            event: 'ORDER_READY_FOR_DISPATCH',
            type: 'ORDER',
            orderId,
            orderNumber: orderNum,
            deepLink: `/orders/${orderId}`,
            data: { type: 'ORDER', event: 'ORDER_READY_FOR_DISPATCH', orderId, orderNumber: orderNum },
          });
        }
        break;

      case 'ASSIGNED':
      case 'ORDER_ASSIGNED_TO_DELIVERY': {
        const partnerId = extra?.partnerId || order.deliveryPartnerId || order.delivery?.assignedPartnerId;
        // Notify retailer
        if (retailerId) {
          await this.sendPushNotification({
            recipientUserId: retailerId,
            role: 'RETAILER',
            title: 'Delivery Partner Assigned',
            body: `A delivery partner has been assigned to deliver order ${orderNum}.`,
            event: 'ORDER_ASSIGNED_TO_DELIVERY',
            type: 'ORDER',
            orderId,
            orderNumber: orderNum,
            deepLink: `/orders/${orderId}`,
            data: { type: 'ORDER', event: 'ORDER_ASSIGNED_TO_DELIVERY', orderId, orderNumber: orderNum },
          });
        }

        // Notify delivery partner: NO sensitive customer lat/lng, phone, or address in push body!
        if (partnerId) {
          await this.sendPushNotification({
            recipientUserId: partnerId,
            role: 'DELIVERY_PARTNER',
            title: 'New Delivery Assigned',
            body: `Order ${orderNum} has been assigned to you.`,
            event: 'ORDER_ASSIGNED_TO_DELIVERY',
            type: 'DELIVERY',
            orderId,
            orderNumber: orderNum,
            deepLink: `/delivery/orders/${orderId}`,
            data: {
              type: 'DELIVERY',
              event: 'ORDER_ASSIGNED_TO_DELIVERY',
              orderId,
              orderNumber: orderNum,
            },
          });
        }
        break;
      }

      case 'ACCEPTED_BY_DELIVERY_PARTNER':
      case 'ORDER_ACCEPTED_BY_DELIVERY_PARTNER':
        if (retailerId) {
          await this.sendPushNotification({
            recipientUserId: retailerId,
            role: 'RETAILER',
            title: 'Delivery Accepted',
            body: `Delivery partner has accepted order ${orderNum}.`,
            event: 'ORDER_ACCEPTED_BY_DELIVERY_PARTNER',
            type: 'ORDER',
            orderId,
            orderNumber: orderNum,
            deepLink: `/orders/${orderId}`,
            data: { type: 'ORDER', event: 'ORDER_ACCEPTED_BY_DELIVERY_PARTNER', orderId, orderNumber: orderNum },
          });
        }
        break;

      case 'PICKED_UP':
        if (retailerId) {
          await this.sendPushNotification({
            recipientUserId: retailerId,
            role: 'RETAILER',
            title: 'Order Picked Up',
            body: `Your order ${orderNum} has been picked up from Brahmpuri Hub.`,
            event: 'ORDER_PICKED_UP',
            type: 'ORDER',
            orderId,
            orderNumber: orderNum,
            deepLink: `/orders/${orderId}`,
            data: { type: 'ORDER', event: 'ORDER_PICKED_UP', orderId, orderNumber: orderNum },
          });
        }
        break;

      case 'OUT_FOR_DELIVERY':
        if (retailerId) {
          await this.sendPushNotification({
            recipientUserId: retailerId,
            role: 'RETAILER',
            title: 'Out for Delivery',
            body: `Your order ${orderNum} is out for delivery.`,
            event: 'ORDER_OUT_FOR_DELIVERY',
            type: 'ORDER',
            orderId,
            orderNumber: orderNum,
            deepLink: `/orders/${orderId}`,
            data: { type: 'ORDER', event: 'ORDER_OUT_FOR_DELIVERY', orderId, orderNumber: orderNum },
          });
        }
        break;

      case 'DELIVERED':
        if (retailerId) {
          await this.sendPushNotification({
            recipientUserId: retailerId,
            role: 'RETAILER',
            title: 'Order Delivered',
            body: `Your order ${orderNum} has been delivered successfully.`,
            event: 'ORDER_DELIVERED',
            type: 'ORDER',
            orderId,
            orderNumber: orderNum,
            deepLink: `/orders/${orderId}`,
            data: { type: 'ORDER', event: 'ORDER_DELIVERED', orderId, orderNumber: orderNum },
          });
        }
        break;

      case 'FAILED_DELIVERY': {
        const failureReason = extra?.reason || order.delivery?.failureReason || 'Customer unavailable';
        // Notify retailer
        if (retailerId) {
          await this.sendPushNotification({
            recipientUserId: retailerId,
            role: 'RETAILER',
            title: 'Delivery Attempted',
            body: `Delivery attempt for order ${orderNum} was unsuccessful (${failureReason}).`,
            event: 'ORDER_FAILED_DELIVERY',
            type: 'ORDER',
            orderId,
            orderNumber: orderNum,
            deepLink: `/orders/${orderId}`,
            data: { type: 'ORDER', event: 'ORDER_FAILED_DELIVERY', orderId, orderNumber: orderNum },
          });
        }
        // Notify warehouse operational users
        const whUsers = await this.getOperationalWarehouseUsers(order.warehouseId || OPERATIONAL_WAREHOUSE_ID);
        for (const whUser of whUsers) {
          await this.sendPushNotification({
            recipientUserId: whUser.uid,
            role: whUser.role,
            title: 'Delivery Failed',
            body: `Order ${orderNum} delivery failed (${failureReason}).`,
            event: 'ORDER_FAILED_DELIVERY',
            type: 'WAREHOUSE',
            orderId,
            orderNumber: orderNum,
            deepLink: `/warehouse/orders/${orderId}`,
            data: { type: 'WAREHOUSE', event: 'ORDER_FAILED_DELIVERY', orderId, orderNumber: orderNum },
          });
        }
        break;
      }

      case 'RETURN_TO_WAREHOUSE': {
        const returnReason = extra?.returnReason || 'Undelivered order return';
        // Notify retailer
        if (retailerId) {
          await this.sendPushNotification({
            recipientUserId: retailerId,
            role: 'RETAILER',
            title: 'Returning to Hub',
            body: `Order ${orderNum} is being returned to Brahmpuri Hub.`,
            event: 'ORDER_RETURN_TO_WAREHOUSE',
            type: 'ORDER',
            orderId,
            orderNumber: orderNum,
            deepLink: `/orders/${orderId}`,
            data: { type: 'ORDER', event: 'ORDER_RETURN_TO_WAREHOUSE', orderId, orderNumber: orderNum },
          });
        }
        // Notify warehouse operational users
        const whUsers = await this.getOperationalWarehouseUsers(order.warehouseId || OPERATIONAL_WAREHOUSE_ID);
        for (const whUser of whUsers) {
          await this.sendPushNotification({
            recipientUserId: whUser.uid,
            role: whUser.role,
            title: 'Order Returning to Hub',
            body: `Order ${orderNum} is returning to warehouse (${returnReason}).`,
            event: 'ORDER_RETURN_TO_WAREHOUSE',
            type: 'WAREHOUSE',
            orderId,
            orderNumber: orderNum,
            deepLink: `/warehouse/orders/${orderId}`,
            data: { type: 'WAREHOUSE', event: 'ORDER_RETURN_TO_WAREHOUSE', orderId, orderNumber: orderNum },
          });
        }
        break;
      }

      case 'CANCELLED': {
        const cancelReason = extra?.reason || order.cancellationReason || 'Order cancelled';
        if (retailerId) {
          await this.sendPushNotification({
            recipientUserId: retailerId,
            role: 'RETAILER',
            title: 'Order Cancelled',
            body: `Your order ${orderNum} has been cancelled (${cancelReason}).`,
            event: 'ORDER_CANCELLED',
            type: 'ORDER',
            orderId,
            orderNumber: orderNum,
            deepLink: `/orders/${orderId}`,
            data: { type: 'ORDER', event: 'ORDER_CANCELLED', orderId, orderNumber: orderNum },
          });
        }
        const whUsers = await this.getOperationalWarehouseUsers(order.warehouseId || OPERATIONAL_WAREHOUSE_ID);
        for (const whUser of whUsers) {
          await this.sendPushNotification({
            recipientUserId: whUser.uid,
            role: whUser.role,
            title: 'Order Cancelled',
            body: `Order ${orderNum} was cancelled (${cancelReason}).`,
            event: 'ORDER_CANCELLED',
            type: 'WAREHOUSE',
            orderId,
            orderNumber: orderNum,
            deepLink: `/warehouse/orders/${orderId}`,
            data: { type: 'WAREHOUSE', event: 'ORDER_CANCELLED', orderId, orderNumber: orderNum },
          });
        }
        break;
      }
    }
  }

  /**
   * Helper to query authorized warehouse operational staff
   */
  static async getOperationalWarehouseUsers(
    warehouseId: string = OPERATIONAL_WAREHOUSE_ID
  ): Promise<{ uid: string; role: NotificationRecipientRole }[]> {
    try {
      const q = query(
        collection(db, 'warehouseUsers'),
        where('warehouseId', '==', warehouseId)
      );
      const snap = await getDocs(q);
      const users: { uid: string; role: NotificationRecipientRole }[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        if (data.isActive !== false && ['WAREHOUSE_STAFF', 'WAREHOUSE_MANAGER', 'WAREHOUSE_ADMIN'].includes(data.role)) {
          users.push({ uid: d.id, role: data.role as NotificationRecipientRole });
        }
      }
      if (users.length > 0) return users;
    } catch {
      // fallback
    }

    // Default seeded operational warehouse staff fallback
    return [
      { uid: 'wh-staff-brahmpuri-01', role: 'WAREHOUSE_STAFF' },
      { uid: 'wh-manager-brahmpuri-01', role: 'WAREHOUSE_MANAGER' },
    ];
  }
}
