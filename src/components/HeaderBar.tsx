import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { ArrowLeft, ShoppingCart, Smartphone, Monitor, Code2, Bell } from 'lucide-react';
import BrandLogo from './BrandLogo';
import NotificationModal from './NotificationModal';
import { NotificationService } from '../services/notificationService';

interface HeaderBarProps {
  title?: string;
  showBack?: boolean;
  showCart?: boolean;
}

export default function HeaderBar({ title, showBack, showCart = true }: HeaderBarProps) {
  const { goBack, cartCount, navigate, activeScreen, activeTab, isMobileFrame, toggleMobileFrame, setShowCodeModal, profile } = useApp();
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  useEffect(() => {
    const userId = profile.retailerId || '';
    if (!userId) return;
    const unsub = NotificationService.subscribeToNotifications(userId, items => {
      const unread = items.filter(n => !n.isRead).length;
      setUnreadNotifCount(unread);
    });
    return () => unsub();
  }, [profile.retailerId]);

  const isRootScreen = activeScreen === 'Main' || activeScreen === 'Login';
  const isHomeScreen = activeScreen === 'Main' && activeTab === 'Home';
  const shouldShowBack = showBack !== undefined ? showBack : !isRootScreen;

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-stone-200/80 px-4 py-2.5 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        {shouldShowBack && (
          <button
            type="button"
            onClick={goBack}
            className="p-1.5 -ml-1 rounded-xl text-stone-700 hover:bg-stone-100 active:scale-95 transition-all"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        
        {isHomeScreen ? (
          <BrandLogo variant="header" />
        ) : (
          <div>
            <h1 className="text-base sm:text-lg font-black text-stone-900 tracking-tight leading-tight">
              {title || 'MR FUTKAR Retailer'}
            </h1>
            {isRootScreen && (
              <p className="text-[10px] font-bold text-emerald-700 leading-none mt-0.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                When you grow ! We grow !!
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Toggle Mobile Phone vs Desktop Layout */}
        <button
          type="button"
          onClick={toggleMobileFrame}
          className="p-2 rounded-xl text-stone-600 hover:bg-stone-100 hover:text-stone-900 text-xs font-semibold flex items-center gap-1 transition-all"
          title={isMobileFrame ? 'Switch to Full Screen View' : 'Switch to Mobile Device Frame (390px)'}
        >
          {isMobileFrame ? (
            <>
              <Monitor className="w-4 h-4" />
              <span className="hidden sm:inline">Desktop</span>
            </>
          ) : (
            <>
              <Smartphone className="w-4 h-4" />
              <span className="hidden sm:inline">Mobile Frame</span>
            </>
          )}
        </button>

        {/* View Expo Starter Code Modal button */}
        <button
          type="button"
          onClick={() => setShowCodeModal(true)}
          className="p-2 rounded-xl text-stone-600 hover:bg-stone-100 hover:text-stone-900 text-xs font-semibold flex items-center gap-1 transition-all"
          title="Inspect Expo React Native Source Code"
        >
          <Code2 className="w-4 h-4" />
          <span className="hidden sm:inline">Expo Code</span>
        </button>

        {/* Notifications Bell */}
        <button
          type="button"
          onClick={() => setShowNotifications(true)}
          className="relative p-2 rounded-xl text-stone-600 hover:bg-stone-100 hover:text-stone-900 active:scale-95 transition-all flex items-center justify-center"
          aria-label="Notifications"
          title="Order & Operational Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadNotifCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-emerald-600 text-white text-[10px] font-black rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center shadow-xs border-2 border-white">
              {unreadNotifCount}
            </span>
          )}
        </button>

        {/* Cart Button */}
        {showCart && (
          <button
            type="button"
            onClick={() => navigate('Cart')}
            className="relative p-2 rounded-xl bg-stone-900 text-white hover:bg-stone-800 active:scale-95 transition-all flex items-center justify-center"
            aria-label="View Cart"
          >
            <ShoppingCart className="w-4 h-4" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white text-[11px] font-black rounded-full h-5 min-w-[20px] px-1 flex items-center justify-center shadow-xs border-2 border-white">
                {cartCount}
              </span>
            )}
          </button>
        )}
      </div>

      <NotificationModal
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
      />
    </header>
  );
}
