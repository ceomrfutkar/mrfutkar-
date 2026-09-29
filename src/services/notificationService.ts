import {
  collection,
  doc,
  getDocs,
  updateDoc,
  query,
  where,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import {
  NotificationHistoryItem,
  NotificationPreferences,
  OrderNotificationEventType,
} from '../types/notification';

export interface NotificationItem {
  notificationId: string;
  retailerId?: string;
  userId?: string;
  title: string;
  body?: string;
  message?: string;
  type?: string;
  event?: OrderNotificationEventType;
  orderId?: string;
  orderNumber?: string;
  deepLink?: string;
  isRead: boolean;
  read?: boolean;
  createdAt: string;
  deliveryStatus?: string;
}

export class NotificationService {
  private static collectionName = 'notifications';
  private static foregroundListeners: Set<(notif: NotificationItem) => void> = new Set();

  /**
   * Register a listener for foreground notification alerts
   */
  static onForegroundNotification(callback: (notif: NotificationItem) => void): () => void {
    this.foregroundListeners.add(callback);
    return () => {
      this.foregroundListeners.delete(callback);
    };
  }

  /**
   * Emit an in-app foreground notification
   */
  static emitForegroundNotification(notif: NotificationItem): void {
    this.foregroundListeners.forEach(listener => {
      try {
        listener(notif);
      } catch (err) {
        console.warn('Error in foreground notification listener:', err);
      }
    });
  }

  /**
   * Fetch notifications for a given user/retailer
   */
  static async getNotifications(userId: string): Promise<NotificationItem[]> {
    try {
      // First try API route if token available
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      if (token) {
        const res = await fetch('/api/notifications', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.notifications) {
            return data.notifications.map((d: any) => ({
              notificationId: d.notificationId || d.id,
              userId: d.userId,
              retailerId: d.retailerId || d.userId,
              title: d.title || '',
              body: d.body || d.message || '',
              message: d.body || d.message || '',
              type: d.type || 'ORDER',
              event: d.event,
              orderId: d.orderId,
              orderNumber: d.orderNumber || d.orderId,
              deepLink: d.deepLink,
              isRead: Boolean(d.read ?? d.isRead),
              read: Boolean(d.read ?? d.isRead),
              createdAt: d.createdAt || new Date().toISOString(),
              deliveryStatus: d.deliveryStatus,
            }));
          }
        }
      }

      // Fallback to Firestore direct query (authorized by rules)
      const q = query(
        collection(db, this.collectionName),
        where('userId', '==', userId)
      );
      const snapshot = await getDocs(q);

      const items: NotificationItem[] = [];
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        items.push({
          notificationId: d.notificationId || docSnap.id,
          userId: d.userId,
          retailerId: d.retailerId || d.userId,
          title: d.title || '',
          body: d.body || d.message || '',
          message: d.body || d.message || '',
          type: d.type || 'ORDER',
          event: d.event,
          orderId: d.orderId,
          orderNumber: d.orderNumber || d.orderId,
          deepLink: d.deepLink,
          isRead: Boolean(d.read ?? d.isRead),
          read: Boolean(d.read ?? d.isRead),
          createdAt: d.createdAt || new Date().toISOString(),
          deliveryStatus: d.deliveryStatus,
        });
      });

      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return items;
    } catch (err) {
      console.warn('Failed to load notifications:', err);
      return [];
    }
  }

  /**
   * Mark a notification as read
   */
  static async markAsRead(notificationId: string): Promise<void> {
    try {
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      if (token) {
        await fetch(`/api/notifications/${notificationId}/read`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      } else {
        const docRef = doc(db, this.collectionName, notificationId);
        await updateDoc(docRef, { read: true, isRead: true });
      }
    } catch (err) {
      console.warn('Failed to mark notification as read:', err);
    }
  }

  /**
   * Real-time subscription to user notifications
   */
  static subscribeToNotifications(
    userId: string,
    onUpdate: (items: NotificationItem[]) => void
  ): Unsubscribe {
    try {
      const q = query(
        collection(db, this.collectionName),
        where('userId', '==', userId)
      );

      return onSnapshot(
        q,
        snapshot => {
          const items: NotificationItem[] = [];
          snapshot.forEach(docSnap => {
            const d = docSnap.data();
            items.push({
              notificationId: d.notificationId || docSnap.id,
              userId: d.userId,
              retailerId: d.retailerId || d.userId,
              title: d.title || '',
              body: d.body || d.message || '',
              message: d.body || d.message || '',
              type: d.type || 'ORDER',
              event: d.event,
              orderId: d.orderId,
              orderNumber: d.orderNumber || d.orderId,
              deepLink: d.deepLink,
              isRead: Boolean(d.read ?? d.isRead),
              read: Boolean(d.read ?? d.isRead),
              createdAt: d.createdAt || new Date().toISOString(),
              deliveryStatus: d.deliveryStatus,
            });
          });

          items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          onUpdate(items);
        },
        error => {
          console.warn('Error listening to notifications:', error);
        }
      );
    } catch (err) {
      return () => {};
    }
  }

  /**
   * Request Notification Permission
   * Graceful handling: does not block order flow if denied!
   */
  static async requestNotificationPermission(): Promise<'granted' | 'denied' | 'default' | 'unsupported'> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }

    try {
      const permission = await Notification.requestPermission();
      return permission;
    } catch (err) {
      console.warn('Error requesting notification permission:', err);
      return 'denied';
    }
  }

  /**
   * Register Device Token with Server
   */
  static async registerDeviceToken(token: string, platform: 'web' | 'android' | 'ios' = 'web'): Promise<boolean> {
    try {
      const idToken = await auth.currentUser?.getIdToken().catch(() => null);
      if (!idToken) return false;

      let deviceId = 'web-browser';
      if (typeof localStorage !== 'undefined') {
        let storedId = localStorage.getItem('mf_device_id');
        if (!storedId) {
          storedId = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          localStorage.setItem('mf_device_id', storedId);
        }
        deviceId = storedId;
      }

      const res = await fetch('/api/notifications/tokens/register', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          platform,
          deviceId,
        }),
      });

      return res.ok;
    } catch (err) {
      console.warn('Failed to register device token:', err);
      return false;
    }
  }

  /**
   * Unregister Device Token on logout
   */
  static async unregisterDeviceToken(): Promise<boolean> {
    try {
      const idToken = await auth.currentUser?.getIdToken().catch(() => null);
      if (!idToken) return false;

      const deviceId = typeof localStorage !== 'undefined' ? localStorage.getItem('mf_device_id') : null;
      if (!deviceId) return false;

      const res = await fetch('/api/notifications/tokens/unregister', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deviceId }),
      });

      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Update notification preferences
   */
  static async updatePreferences(preferences: Partial<NotificationPreferences>): Promise<boolean> {
    try {
      const idToken = await auth.currentUser?.getIdToken().catch(() => null);
      if (!idToken) return false;

      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preferences),
      });

      return res.ok;
    } catch {
      return false;
    }
  }
}
