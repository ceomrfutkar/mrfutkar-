import express, { Request, Response } from 'express';
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
import { resolveAuthUser } from './auth';
import { ServerNotificationService } from './notificationService';
import {
  NotificationPreferences,
  NotificationRecipientRole,
} from '../src/types/notification';

export const notificationRouter = express.Router();

/**
 * Device Token Registration Handler (P1-01)
 * POST /api/notifications/tokens and POST /api/notifications/tokens/register
 * Registers an FCM push device token for the authenticated user.
 * Derives authenticated user identity and validates role, platform, deviceId.
 */
const handleTokenRegistration = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const authResult = await resolveAuthUser(authHeader);

  if (!authResult.valid || !authResult.user) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required to register device token.',
    });
  }

  const { token, platform, deviceId, userId, role: bodyRole } = req.body;

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'FCM device token is required.',
    });
  }

  // Cross-user token registration prevention
  const effectiveUserId = (userId && (authResult.user.role === 'WAREHOUSE_ADMIN' || userId === authResult.user.uid))
    ? userId
    : authResult.user.uid;

  const validPlatforms = ['web', 'android', 'ios'];
  const plat = validPlatforms.includes(platform) ? platform : 'web';
  const role: NotificationRecipientRole =
    (authResult.user.role as NotificationRecipientRole) || (bodyRole as NotificationRecipientRole) || 'RETAILER';

  try {
    const result = await ServerNotificationService.registerToken({
      userId: authResult.user.uid,
      role,
      token: token.trim(),
      platform: plat as any,
      deviceId: (deviceId || 'default-device').trim(),
    });

    return res.status(200).json({
      success: true,
      message: 'Device notification token registered successfully.',
      tokenRecord: result.tokenRecord,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'REGISTRATION_FAILED',
      message: err.message,
    });
  }
};

notificationRouter.post('/tokens', handleTokenRegistration);
notificationRouter.post('/tokens/register', handleTokenRegistration);

/**
 * POST /api/notifications/tokens/unregister
 * Deactivates device token on logout or user opt-out.
 */
notificationRouter.post('/tokens/unregister', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const authResult = await resolveAuthUser(authHeader);

  if (!authResult.valid || !authResult.user) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required to unregister device token.',
    });
  }

  const { token, deviceId, tokenId } = req.body;
  const target = token || deviceId || tokenId;

  if (!target || typeof target !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'MISSING_TARGET',
      message: 'token, deviceId, or tokenId is required to unregister.',
    });
  }

  try {
    await ServerNotificationService.unregisterToken(authResult.user.uid, target.trim());
    return res.status(200).json({
      success: true,
      message: 'Device token deactivated successfully.',
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'UNREGISTER_FAILED',
      message: err.message,
    });
  }
});

/**
 * GET /api/notifications
 * Returns notification history for the authenticated user only.
 */
notificationRouter.get('/', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const authResult = await resolveAuthUser(authHeader);

  if (!authResult.valid || !authResult.user) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required to access notification history.',
    });
  }

  const userId = authResult.user.uid;

  try {
    // Query notifications by userId
    const qUser = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      limit(50)
    );
    const snapUser = await getDocs(qUser);

    // Also query by retailerId for backward compatibility
    const qRetailer = query(
      collection(db, 'notifications'),
      where('retailerId', '==', userId),
      limit(50)
    );
    const snapRetailer = await getDocs(qRetailer);

    const itemsMap = new Map<string, any>();
    for (const d of snapUser.docs) {
      itemsMap.set(d.id, { notificationId: d.id, ...d.data() });
    }
    for (const d of snapRetailer.docs) {
      if (!itemsMap.has(d.id)) {
        itemsMap.set(d.id, { notificationId: d.id, ...d.data() });
      }
    }

    const notifications = Array.from(itemsMap.values()).sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    return res.status(200).json({
      success: true,
      count: notifications.length,
      notifications,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'FETCH_NOTIFICATIONS_FAILED',
      message: err.message,
    });
  }
});

/**
 * PATCH /api/notifications/:notificationId/read
 * Marks user's own notification as read.
 * Strict authorization: Cannot read or modify another user's notification.
 * Cannot modify content (title, body, event, etc.).
 */
notificationRouter.patch('/:notificationId/read', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const authResult = await resolveAuthUser(authHeader);

  if (!authResult.valid || !authResult.user) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required.',
    });
  }

  const { notificationId } = req.params;

  // Strict check: if request body attempts to tamper with content fields, reject!
  const forbiddenFields = ['title', 'body', 'message', 'event', 'type', 'orderId', 'orderNumber', 'userId', 'role', 'createdAt'];
  for (const field of forbiddenFields) {
    if (req.body[field] !== undefined) {
      return res.status(403).json({
        success: false,
        error: 'CONTENT_MODIFICATION_FORBIDDEN',
        message: `Notification content (${field}) cannot be client-modified. Only read status can be changed.`,
      });
    }
  }

  try {
    const notifRef = doc(db, 'notifications', notificationId);
    const snap = await getDoc(notifRef);

    if (!snap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Notification does not exist.',
      });
    }

    const data = snap.data();
    if (data.userId !== authResult.user.uid && data.retailerId !== authResult.user.uid) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'You are not authorized to update this notification.',
      });
    }

    await updateDoc(notifRef, {
      read: true,
      isRead: true,
      readAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
      notificationId,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: err.message,
    });
  }
});

/**
 * GET /api/notifications/preferences
 * Returns user notification preferences.
 */
notificationRouter.get('/preferences', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const authResult = await resolveAuthUser(authHeader);

  if (!authResult.valid || !authResult.user) {
    return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
  }

  try {
    const retSnap = await getDoc(doc(db, 'retailers', authResult.user.uid));
    const prefs: NotificationPreferences = {
      orderUpdates: true,
      deliveryUpdates: true,
      promotionalNotifications: false,
    };

    if (retSnap.exists()) {
      const data = retSnap.data();
      if (data.notificationsEnabled === false) {
        prefs.orderUpdates = false;
        prefs.deliveryUpdates = false;
      }
      if (data.notificationPreferences) {
        Object.assign(prefs, data.notificationPreferences);
      }
    }

    return res.status(200).json({
      success: true,
      preferences: prefs,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/notifications/preferences
 * Updates user notification preferences.
 */
notificationRouter.put('/preferences', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const authResult = await resolveAuthUser(authHeader);

  if (!authResult.valid || !authResult.user) {
    return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
  }

  const { orderUpdates, deliveryUpdates, promotionalNotifications } = req.body;

  try {
    const retRef = doc(db, 'retailers', authResult.user.uid);
    const snap = await getDoc(retRef);

    const updatedPrefs: NotificationPreferences = {
      orderUpdates: orderUpdates !== undefined ? Boolean(orderUpdates) : true,
      deliveryUpdates: deliveryUpdates !== undefined ? Boolean(deliveryUpdates) : true,
      promotionalNotifications: promotionalNotifications !== undefined ? Boolean(promotionalNotifications) : false,
    };

    if (snap.exists()) {
      await updateDoc(retRef, {
        notificationPreferences: updatedPrefs,
        notificationsEnabled: updatedPrefs.orderUpdates || updatedPrefs.deliveryUpdates,
        updatedAt: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      success: true,
      preferences: updatedPrefs,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
