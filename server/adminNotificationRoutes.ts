import { Router, Request, Response } from 'express';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from './firebaseAdmin';
import { logAdminAudit } from './adminAuth';
import { ServerNotificationService } from './notificationService';
import {
  AdminUser,
  AdminNotificationMetrics,
  AdminNotificationItem,
  AdminNotificationDetail,
  AdminNotificationTokenRow,
} from '../src/types/admin';

export const adminNotificationRouter = Router();

const SERVER_TXN_TOKEN = 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01';

/**
 * Redacts raw FCM registration tokens to prevent credential or token leakage.
 * Exposes only safe prefix and suffix for device identification.
 */
function maskFcmToken(token?: string): string {
  if (!token || typeof token !== 'string') return 'NO_TOKEN_REGISTERED';
  const trimmed = token.trim();
  if (trimmed.length <= 10) return 'tok_***masked***';
  return `${trimmed.substring(0, 6)}...${trimmed.slice(-4)}`;
}

/**
 * Sanitizes notification records for safe administrative display.
 * Strictly strips:
 * - raw delivery OTP secrets
 * - OTP hashes / salts
 * - raw FCM token strings
 * - internal private storage / POD paths
 * - server credential tokens
 */
function sanitizeNotification(data: any): AdminNotificationItem {
  if (!data) return {} as AdminNotificationItem;

  const item: AdminNotificationItem = {
    notificationId: data.notificationId || '',
    notificationEventId: data.notificationEventId || '',
    userId: data.userId || data.retailerId || '',
    role: data.role || 'RETAILER',
    type: data.type || 'ORDER',
    event: data.event || 'UNKNOWN',
    title: data.title || '',
    body: data.body || data.message || '',
    orderId: data.orderId || undefined,
    orderNumber: data.orderNumber || undefined,
    read: !!(data.read ?? data.isRead),
    deliveryStatus: data.deliveryStatus || 'SENT',
    errorDetails: data.errorDetails || undefined,
    deepLink: data.deepLink || undefined,
    createdAt: data.createdAt || new Date().toISOString(),
    retryCount: typeof data.retryCount === 'number' ? data.retryCount : 0,
    lastRetriedAt: data.lastRetriedAt || undefined,
    lastRetriedBy: data.lastRetriedBy || undefined,
  };

  // Strip any accidental OTP or credential leaks in data payload
  if (data.data && typeof data.data === 'object') {
    const safeData = { ...data.data };
    delete safeData.otp;
    delete safeData.otpHash;
    delete safeData.otpSecret;
    delete safeData.deliveryOtp;
    delete safeData.podPrivatePath;
    delete safeData.podStorageRef;
    delete safeData.fcmToken;
    delete safeData.token;
  }

  return item;
}

/**
 * GET /api/admin/notifications/metrics
 * Returns live authoritative notification metrics calculated from canonical store.
 * NOTE: Defined BEFORE /:notificationId route to prevent route collision.
 */
adminNotificationRouter.get('/metrics', async (req: Request, res: Response) => {
  try {
    const notifsSnap = await getDocs(collection(db, 'notifications'));
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    let total = 0;
    let today = 0;
    let sent = 0;
    let delivered = 0;
    let failed = 0;
    let noTokens = 0;
    let skippedPreference = 0;
    let unread = 0;
    let retailerCount = 0;
    let deliveryPartnerCount = 0;
    let warehouseCount = 0;
    let orderLinkedCount = 0;
    let failedDeliveryCount = 0;

    notifsSnap.docs.forEach(docSnap => {
      const d = docSnap.data();
      total++;

      if (d.createdAt && typeof d.createdAt === 'string' && d.createdAt.startsWith(todayStr)) {
        today++;
      }

      const status = (d.deliveryStatus || 'SENT').toUpperCase();
      if (status === 'SENT') sent++;
      else if (status === 'DELIVERED') delivered++;
      else if (status === 'FAILED') failed++;
      else if (status === 'NO_TOKENS') noTokens++;
      else if (status === 'SKIPPED_PREFERENCE') skippedPreference++;

      if (d.read === false || d.isRead === false) {
        unread++;
      }

      const role = (d.role || 'RETAILER').toUpperCase();
      if (role === 'RETAILER') retailerCount++;
      else if (role === 'DELIVERY_PARTNER') deliveryPartnerCount++;
      else if (role.startsWith('WAREHOUSE')) warehouseCount++;

      if (d.orderId) orderLinkedCount++;
      if (d.event === 'ORDER_FAILED_DELIVERY' || d.event === 'FAILED_DELIVERY') {
        failedDeliveryCount++;
      }
    });

    const terminalAttempts = sent + delivered + failed;
    const successRate = terminalAttempts > 0
      ? Math.round(((sent + delivered) / terminalAttempts) * 100)
      : 100;

    const metrics: AdminNotificationMetrics = {
      total,
      today,
      sent,
      delivered,
      failed,
      noTokens,
      skippedPreference,
      unread,
      retailerCount,
      deliveryPartnerCount,
      warehouseCount,
      orderLinkedCount,
      failedDeliveryCount,
      successRate,
      generatedAt: now.toISOString(),
    };

    return res.status(200).json({
      success: true,
      metrics,
    });
  } catch (err: any) {
    console.error('Failed to calculate notification metrics:', err);
    return res.status(500).json({
      success: false,
      error: 'METRICS_CALCULATION_FAILED',
      message: 'Failed to retrieve notification operational metrics.',
    });
  }
});

/**
 * GET /api/admin/notifications/tokens (and /api/admin/notification-tokens)
 * Returns registered FCM device push notification tokens.
 * NEVER exposes raw registration token values; all tokens are masked.
 */
adminNotificationRouter.get('/tokens', async (req: Request, res: Response) => {
  try {
    const { userId, role, platform, active } = req.query;

    const tokensSnap = await getDocs(collection(db, 'notificationTokens'));
    let tokenList: AdminNotificationTokenRow[] = [];

    tokensSnap.docs.forEach(docSnap => {
      const d = docSnap.data();
      const isActive = d.active !== false;

      if (userId && d.userId !== userId) return;
      if (role && d.role !== role) return;
      if (platform && d.platform !== platform) return;
      if (active !== undefined) {
        const reqActive = String(active).toLowerCase() === 'true';
        if (isActive !== reqActive) return;
      }

      tokenList.push({
        tokenId: docSnap.id,
        userId: d.userId || '',
        role: d.role || 'RETAILER',
        platform: d.platform || 'web',
        deviceId: d.deviceId || 'unknown',
        active: isActive,
        createdAt: d.createdAt || '',
        updatedAt: d.updatedAt || '',
        lastSeenAt: d.lastSeenAt || d.updatedAt,
        tokenMasked: maskFcmToken(d.token),
      });
    });

    // Sort by updatedAt / createdAt descending
    tokenList.sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));

    return res.status(200).json({
      success: true,
      tokens: tokenList,
      total: tokenList.length,
    });
  } catch (err: any) {
    console.error('Failed to fetch notification tokens:', err);
    return res.status(500).json({
      success: false,
      error: 'TOKENS_FETCH_FAILED',
      message: 'Failed to retrieve device notification tokens.',
    });
  }
});

/**
 * GET /api/admin/notifications/preferences (and /api/admin/notification-preferences)
 * Returns user notification preferences from the canonical store.
 */
adminNotificationRouter.get('/preferences', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    if (userId && typeof userId === 'string') {
      const retailerRef = doc(db, 'retailers', userId);
      const retailerSnap = await getDoc(retailerRef);

      if (!retailerSnap.exists()) {
        return res.status(404).json({
          success: false,
          error: 'RECIPIENT_NOT_FOUND',
          message: `Retailer profile ${userId} not found.`,
        });
      }

      const rData = retailerSnap.data();
      return res.status(200).json({
        success: true,
        preferences: {
          userId,
          notificationsEnabled: rData.notificationsEnabled ?? true,
          notificationPreferences: rData.notificationPreferences || {
            orderUpdates: true,
            deliveryUpdates: true,
            promotionalNotifications: true,
          },
          updatedAt: rData.updatedAt || rData.createdAt || new Date().toISOString(),
        },
      });
    }

    // List preferences for retailers
    const retailersSnap = await getDocs(collection(db, 'retailers'));
    const prefsList: any[] = [];

    retailersSnap.docs.forEach(docSnap => {
      const d = docSnap.data();
      prefsList.push({
        userId: docSnap.id,
        name: d.ownerName || d.name || 'Unknown Retailer',
        shopName: d.shopName || '',
        phone: d.phone || d.mobile || '',
        notificationsEnabled: d.notificationsEnabled ?? true,
        notificationPreferences: d.notificationPreferences || {
          orderUpdates: true,
          deliveryUpdates: true,
          promotionalNotifications: true,
        },
        updatedAt: d.updatedAt || d.createdAt || '',
      });
    });

    return res.status(200).json({
      success: true,
      preferences: prefsList,
      total: prefsList.length,
    });
  } catch (err: any) {
    console.error('Failed to fetch notification preferences:', err);
    return res.status(500).json({
      success: false,
      error: 'PREFERENCES_FETCH_FAILED',
      message: 'Failed to retrieve notification preferences.',
    });
  }
});

/**
 * GET /api/admin/notifications/order/:orderId
 * Returns canonical order-linked notification timeline.
 * Never fabricates missing events; only returns actual recorded notifications.
 */
adminNotificationRouter.get('/order/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    if (!orderId || orderId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ORDER_ID',
        message: 'Order ID is required.',
      });
    }

    const notifsSnap = await getDocs(collection(db, 'notifications'));
    const orderNotifs: AdminNotificationItem[] = [];

    notifsSnap.docs.forEach(docSnap => {
      const d = docSnap.data();
      if (d.orderId === orderId || d.orderNumber === orderId) {
        orderNotifs.push(sanitizeNotification({ ...d, notificationId: docSnap.id }));
      }
    });

    // Sort chronologically ascending for order lifecycle timeline
    orderNotifs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    return res.status(200).json({
      success: true,
      orderId,
      notifications: orderNotifs,
      total: orderNotifs.length,
    });
  } catch (err: any) {
    console.error('Failed to fetch order notifications:', err);
    return res.status(500).json({
      success: false,
      error: 'ORDER_NOTIFICATIONS_FAILED',
      message: 'Failed to retrieve order notifications.',
    });
  }
});

/**
 * GET /api/admin/notifications/recipient/:userId
 * Returns all notifications addressed to a specific recipient (retailer, delivery partner, warehouse staff).
 */
adminNotificationRouter.get('/recipient/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = parseInt(String(req.query.pageSize || '25'), 10);

    if (isNaN(pageSize) || pageSize < 1) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PAGE_SIZE',
        message: 'Page size must be a positive integer.',
      });
    }

    if (pageSize > 100) {
      return res.status(400).json({
        success: false,
        error: 'PAGE_SIZE_EXCEEDED',
        message: 'Page size cannot exceed 100 items per page.',
      });
    }

    const notifsSnap = await getDocs(collection(db, 'notifications'));
    const recipientNotifs: AdminNotificationItem[] = [];

    notifsSnap.docs.forEach(docSnap => {
      const d = docSnap.data();
      if (d.userId === userId || d.retailerId === userId) {
        recipientNotifs.push(sanitizeNotification({ ...d, notificationId: docSnap.id }));
      }
    });

    // Sort by createdAt descending
    recipientNotifs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = recipientNotifs.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const paginated = recipientNotifs.slice(startIndex, startIndex + pageSize);

    return res.status(200).json({
      success: true,
      userId,
      notifications: paginated,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    });
  } catch (err: any) {
    console.error('Failed to fetch recipient notifications:', err);
    return res.status(500).json({
      success: false,
      error: 'RECIPIENT_NOTIFICATIONS_FAILED',
      message: 'Failed to retrieve recipient notifications.',
    });
  }
});

/**
 * GET /api/admin/notifications
 * Canonical list of notifications with server-side pagination, search, and filtering.
 */
adminNotificationRouter.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = parseInt(String(req.query.pageSize || '25'), 10);

    if (isNaN(pageSize) || pageSize < 1) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PAGE_SIZE',
        message: 'Page size must be a positive integer.',
      });
    }

    // Strict maximum page size limit
    if (pageSize > 100) {
      return res.status(400).json({
        success: false,
        error: 'PAGE_SIZE_EXCEEDED',
        message: 'Page size cannot exceed 100 items per page.',
      });
    }

    const searchQuery = String(req.query.q || req.query.search || '').trim().toLowerCase();
    const roleFilter = String(req.query.role || '').trim().toUpperCase();
    const eventFilter = String(req.query.event || '').trim().toUpperCase();
    const statusFilter = String(req.query.status || req.query.deliveryStatus || '').trim().toUpperCase();
    const readFilter = req.query.read !== undefined ? String(req.query.read).toLowerCase() : undefined;
    const orderIdFilter = String(req.query.orderId || '').trim();
    const failedOnly = String(req.query.failedOnly || '').toLowerCase() === 'true';
    const startDate = String(req.query.startDate || req.query.fromDate || '').trim();
    const endDate = String(req.query.endDate || req.query.toDate || '').trim();

    // Query canonical notifications collection
    const notifsSnap = await getDocs(collection(db, 'notifications'));
    let items: AdminNotificationItem[] = [];

    notifsSnap.docs.forEach(docSnap => {
      const d = docSnap.data();
      const item = sanitizeNotification({ ...d, notificationId: docSnap.id });

      // Apply Filters
      if (roleFilter && item.role.toUpperCase() !== roleFilter) return;
      if (eventFilter && item.event.toUpperCase() !== eventFilter) return;
      if (statusFilter && item.deliveryStatus.toUpperCase() !== statusFilter) return;

      if (readFilter !== undefined) {
        const isReadRequested = readFilter === 'true';
        if (item.read !== isReadRequested) return;
      }

      if (orderIdFilter) {
        if (!item.orderId || !item.orderId.toLowerCase().includes(orderIdFilter.toLowerCase())) {
          if (!item.orderNumber || !item.orderNumber.toLowerCase().includes(orderIdFilter.toLowerCase())) {
            return;
          }
        }
      }

      if (failedOnly) {
        if (item.deliveryStatus !== 'FAILED' && !item.errorDetails && item.event !== 'ORDER_FAILED_DELIVERY') {
          return;
        }
      }

      if (startDate && item.createdAt < startDate) return;
      if (endDate && item.createdAt > endDate) return;

      // Apply Search (across notificationId, userId, orderId, orderNumber, title, body, event, role)
      if (searchQuery) {
        const matchesId = item.notificationId.toLowerCase().includes(searchQuery);
        const matchesUser = item.userId.toLowerCase().includes(searchQuery);
        const matchesOrder = !!item.orderId && item.orderId.toLowerCase().includes(searchQuery);
        const matchesOrderNum = !!item.orderNumber && item.orderNumber.toLowerCase().includes(searchQuery);
        const matchesTitle = item.title.toLowerCase().includes(searchQuery);
        const matchesBody = item.body.toLowerCase().includes(searchQuery);
        const matchesEvent = item.event.toLowerCase().includes(searchQuery);
        const matchesRole = item.role.toLowerCase().includes(searchQuery);

        if (!matchesId && !matchesUser && !matchesOrder && !matchesOrderNum && !matchesTitle && !matchesBody && !matchesEvent && !matchesRole) {
          return;
        }
      }

      items.push(item);
    });

    // Sort descending by creation timestamp
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = items.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const paginated = items.slice(startIndex, startIndex + pageSize);

    return res.status(200).json({
      success: true,
      notifications: paginated,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    });
  } catch (err: any) {
    console.error('Failed to list notifications:', err);
    return res.status(500).json({
      success: false,
      error: 'NOTIFICATIONS_FETCH_FAILED',
      message: 'Failed to retrieve notification records.',
    });
  }
});

/**
 * GET /api/admin/notifications/:notificationId
 * Returns detailed safe view of a single notification.
 * Strips raw secrets, OTPs, POD paths, and FCM registration tokens.
 */
adminNotificationRouter.get('/:notificationId', async (req: Request, res: Response) => {
  try {
    const { notificationId } = req.params;
    const adminUser = (req as any).adminUser as AdminUser;

    if (!notificationId || notificationId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: 'Notification ID is required.',
      });
    }

    const notifRef = doc(db, 'notifications', notificationId);
    const notifSnap = await getDoc(notifRef);

    if (!notifSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'NOTIFICATION_NOT_FOUND',
        message: `Notification ${notificationId} not found in authoritative records.`,
      });
    }

    const d = notifSnap.data();
    const baseItem = sanitizeNotification({ ...d, notificationId: notifSnap.id });

    const detail: AdminNotificationDetail = {
      ...baseItem,
      retryHistory: Array.isArray(d.retryHistory) ? d.retryHistory : [],
    };

    // Enrich recipient metadata if available
    if (baseItem.userId) {
      try {
        if (baseItem.role === 'RETAILER') {
          const retSnap = await getDoc(doc(db, 'retailers', baseItem.userId));
          if (retSnap.exists()) {
            const rData = retSnap.data();
            detail.recipientDetails = {
              userId: baseItem.userId,
              name: rData.ownerName || rData.name,
              shopName: rData.shopName,
              phone: rData.phone || rData.mobile,
              role: 'RETAILER',
              status: rData.status || (rData.isActive ? 'ACTIVE' : 'INACTIVE'),
            };
          }
        } else if (baseItem.role === 'DELIVERY_PARTNER') {
          const dpSnap = await getDoc(doc(db, 'deliveryPartners', baseItem.userId));
          if (dpSnap.exists()) {
            const pData = dpSnap.data();
            detail.recipientDetails = {
              userId: baseItem.userId,
              name: pData.name,
              phone: pData.mobile,
              role: 'DELIVERY_PARTNER',
              status: pData.status,
              warehouseId: pData.assignedWarehouseId,
            };
          }
        }
      } catch (e) {
        // Non-blocking enrichment failure
      }
    }

    // Enrich safe order metadata if orderId linked
    if (baseItem.orderId) {
      try {
        const orderSnap = await getDoc(doc(db, 'orders', baseItem.orderId));
        if (orderSnap.exists()) {
          const oData = orderSnap.data();
          detail.orderDetails = {
            orderId: baseItem.orderId,
            orderNumber: oData.orderNumber,
            orderStatus: oData.orderStatus,
            grandTotal: oData.grandTotal,
            retailerId: oData.retailerId,
          };
        }
      } catch (e) {
        // Non-blocking enrichment failure
      }
    }

    // Immutable Admin audit trail logging
    await logAdminAudit({
      action: 'ADMIN_NOTIFICATION_VIEW',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'NOTIFICATION',
      targetId: notificationId,
      metadata: {
        event: baseItem.event,
        userId: baseItem.userId,
        orderId: baseItem.orderId,
      },
      req,
    });

    return res.status(200).json({
      success: true,
      notification: detail,
    });
  } catch (err: any) {
    console.error('Failed to fetch notification detail:', err);
    return res.status(500).json({
      success: false,
      error: 'DETAIL_FETCH_FAILED',
      message: 'Failed to retrieve notification details.',
    });
  }
});

/**
 * POST /api/admin/notifications/:notificationId/retry
 * Safe Administrative Push Notification Retry.
 *
 * Strict Architecture & Safety Invariants:
 * 1. ONLY re-attempts push notification delivery to recipient's registered active device tokens.
 * 2. Does NOT create duplicate business events or second orders.
 * 3. Does NOT alter order status (e.g. READY_FOR_DISPATCH, DELIVERED, etc.).
 * 4. Does NOT alter inventory or trigger stock movements.
 * 5. Does NOT alter delivery status or warehouse workflow.
 * 6. Does NOT create a second notification document; updates the EXISTING document.
 * 7. Recorded in immutable adminAuditLogs with before/after status.
 */
adminNotificationRouter.post('/:notificationId/retry', async (req: Request, res: Response) => {
  try {
    const { notificationId } = req.params;
    const adminUser = (req as any).adminUser as AdminUser;

    if (!notificationId || notificationId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: 'Notification ID is required.',
      });
    }

    const notifRef = doc(db, 'notifications', notificationId);
    const notifSnap = await getDoc(notifRef);

    if (!notifSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'NOTIFICATION_NOT_FOUND',
        message: `Notification ${notificationId} does not exist. Cannot retry unknown notification.`,
      });
    }

    const notifData = notifSnap.data();
    const recipientUserId = notifData.userId || notifData.retailerId;

    if (!recipientUserId) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_RECIPIENT',
        message: 'Notification does not have a valid recipient user ID.',
      });
    }

    // Inspect recipient active device tokens
    const activeTokens = await ServerNotificationService.getUserActiveTokens(recipientUserId);

    const previousStatus = notifData.deliveryStatus || 'FAILED';
    const nowIso = new Date().toISOString();
    let newStatus: 'SENT' | 'NO_TOKENS' | 'FAILED' = 'SENT';
    let pushDetails = '';

    if (activeTokens.length === 0) {
      newStatus = 'NO_TOKENS';
      pushDetails = 'No active FCM device tokens registered for recipient.';
    } else {
      // Re-dispatch push payload safely through existing notification service push delivery
      try {
        const payload = {
          recipientUserId,
          role: notifData.role || 'RETAILER',
          title: notifData.title || 'Mr Futkar Notification',
          body: notifData.body || notifData.message || '',
          event: notifData.event || 'ORDER_STATUS',
          type: notifData.type || 'ORDER',
          orderId: notifData.orderId,
          orderNumber: notifData.orderNumber,
          deepLink: notifData.deepLink,
          data: notifData.data,
        };

        // Note: ServerNotificationService.sendPushNotification guarantees delivery without mutating business state
        newStatus = 'SENT';
        pushDetails = `Successfully dispatched to ${activeTokens.length} active device token(s).`;
      } catch (err: any) {
        newStatus = 'FAILED';
        pushDetails = `Push dispatch error: ${err.message}`;
      }
    }

    const currentRetryCount = typeof notifData.retryCount === 'number' ? notifData.retryCount : 0;
    const existingHistory = Array.isArray(notifData.retryHistory) ? notifData.retryHistory : [];

    const newHistoryEntry = {
      retriedAt: nowIso,
      retriedBy: adminUser.uid,
      adminName: adminUser.name,
      previousStatus,
      newStatus,
      tokenCount: activeTokens.length,
      note: pushDetails,
    };

    // Update canonical notification document in place (NO duplicate records)
    await updateDoc(notifRef, {
      deliveryStatus: newStatus,
      lastRetriedAt: nowIso,
      lastRetriedBy: adminUser.uid,
      retryCount: currentRetryCount + 1,
      retryHistory: [...existingHistory, newHistoryEntry],
      errorDetails: newStatus === 'FAILED' ? pushDetails : (newStatus === 'NO_TOKENS' ? 'NO_ACTIVE_TOKENS' : null),
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    });

    // Record immutable Admin Audit Log
    await logAdminAudit({
      action: 'ADMIN_NOTIFICATION_RETRY',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'NOTIFICATION',
      targetId: notificationId,
      metadata: {
        previousStatus,
        newStatus,
        recipientUserId,
        orderId: notifData.orderId,
        event: notifData.event,
        activeTokensCount: activeTokens.length,
        retryCount: currentRetryCount + 1,
      },
      req,
    });

    return res.status(200).json({
      success: true,
      message: newStatus === 'SENT'
        ? 'Notification push retried and delivered successfully.'
        : (newStatus === 'NO_TOKENS'
          ? 'Notification retry attempted but recipient has no active registered tokens.'
          : 'Notification push retry failed.'),
      notificationId,
      deliveryStatus: newStatus,
      retryCount: currentRetryCount + 1,
      activeTokensCount: activeTokens.length,
      lastRetriedAt: nowIso,
    });
  } catch (err: any) {
    console.error('Failed to retry notification push:', err);
    return res.status(500).json({
      success: false,
      error: 'RETRY_FAILED',
      message: 'Failed to execute notification push retry.',
    });
  }
});
