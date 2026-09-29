import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { NotificationItem, NotificationService } from '../services/notificationService';
import { Bell, CheckCheck, Clock, ExternalLink, Package, Truck, X } from 'lucide-react';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationModal({ isOpen, onClose }: NotificationModalProps) {
  const { profile, navigate } = useApp();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'default' | 'unsupported'>('default');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionStatus(Notification.permission);
    } else {
      setPermissionStatus('unsupported');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const userId = profile.retailerId || '';
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    // Initial fetch
    NotificationService.getNotifications(userId)
      .then(items => {
        setNotifications(items);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Real-time updates
    const unsubscribe = NotificationService.subscribeToNotifications(userId, items => {
      setNotifications(items);
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen, profile.retailerId]);

  if (!isOpen) return null;

  const handleNotificationClick = async (notif: NotificationItem) => {
    // 1. Mark as read
    if (!notif.isRead) {
      await NotificationService.markAsRead(notif.notificationId);
      setNotifications(prev =>
        prev.map(n => (n.notificationId === notif.notificationId ? { ...n, isRead: true, read: true } : n))
      );
    }

    // 2. Deep-link navigation
    onClose();
    if (notif.orderId) {
      navigate('OrderDetail', { orderId: notif.orderId });
    }
  };

  const handleRequestPermission = async () => {
    const res = await NotificationService.requestNotificationPermission();
    if (res === 'granted' || res === 'denied') {
      setPermissionStatus(res);
      if (res === 'granted') {
        await NotificationService.registerDeviceToken('fcm_web_token_' + Date.now());
      }
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-stone-200 animate-in fade-in slide-in-from-bottom-6 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-stone-900 text-white flex items-center justify-center shadow-xs">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-stone-900 text-base">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <p className="text-[11px] text-stone-500 font-semibold">
                Server-authoritative order updates
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Permission banner */}
        {permissionStatus !== 'granted' && (
          <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center justify-between text-xs">
            <span className="text-amber-800 font-medium text-[11px]">
              {permissionStatus === 'denied'
                ? 'Push notifications are muted in browser.'
                : 'Enable browser push for instant alerts.'}
            </span>
            {permissionStatus !== 'denied' && permissionStatus !== 'unsupported' && (
              <button
                type="button"
                onClick={handleRequestPermission}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] px-2.5 py-1 rounded-lg transition-all"
              >
                Enable
              </button>
            )}
          </div>
        )}

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 divide-y divide-stone-100">
          {loading ? (
            <div className="py-12 text-center text-stone-400 text-xs font-semibold">
              Loading updates...
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
                <CheckCheck className="w-6 h-6" />
              </div>
              <p className="font-bold text-stone-700 text-sm">You are all caught up!</p>
              <p className="text-stone-400 text-xs">No pending order or fulfillment notifications.</p>
            </div>
          ) : (
            notifications.map(item => (
              <div
                key={item.notificationId}
                onClick={() => handleNotificationClick(item)}
                className={`pt-2.5 first:pt-0 group flex items-start gap-3 p-2.5 rounded-2xl cursor-pointer transition-all ${
                  item.isRead ? 'hover:bg-stone-50' : 'bg-emerald-50/50 hover:bg-emerald-50 border border-emerald-100/60'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    item.type === 'DELIVERY'
                      ? 'bg-blue-100 text-blue-700'
                      : item.type === 'WAREHOUSE'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {item.type === 'DELIVERY' ? (
                    <Truck className="w-4 h-4" />
                  ) : (
                    <Package className="w-4 h-4" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <h4 className="font-black text-stone-900 text-xs truncate">
                      {item.title}
                    </h4>
                    {!item.isRead && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                    )}
                  </div>
                  <p className="text-stone-600 text-xs leading-snug mt-0.5 font-medium line-clamp-2">
                    {item.body || item.message}
                  </p>
                  <div className="flex items-center justify-between mt-1 text-[10px] text-stone-400 font-semibold">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {item.orderId && (
                      <span className="text-emerald-700 font-bold group-hover:underline flex items-center gap-0.5">
                        View Order <ExternalLink className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-stone-50 border-t border-stone-200 text-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold text-xs rounded-xl transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
