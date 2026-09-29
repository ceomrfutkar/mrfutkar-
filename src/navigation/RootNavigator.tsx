import React from 'react';
import { useApp } from '../context/AppContext';
import HeaderBar from '../components/HeaderBar';
import BottomTabs from '../components/BottomTabs';
import SplashScreen from '../screens/SplashScreen';
import HomeScreen from '../screens/HomeScreen';
import CategoryScreen from '../screens/CategoryScreen';
import ProductListScreen from '../screens/ProductListScreen';
import ProductDetailScreen from '../screens/ProductDetailScreen';
import CartScreen from '../screens/CartScreen';
import OrdersScreen from '../screens/OrdersScreen';
import ProfileScreen from '../screens/ProfileScreen';
import CheckoutScreen from '../screens/CheckoutScreen';
import LoginScreen from '../screens/LoginScreen';
import ShopSetupScreen from '../screens/ShopSetupScreen';
import OrderSuccessScreen from '../screens/OrderSuccessScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import OrderTrackingScreen from '../screens/OrderTrackingScreen';
import ExpoCodeModal from '../components/ExpoCodeModal';
import { WarehouseHubApp } from '../components/warehouse/WarehouseHubApp';
import { WarehouseClient } from '../services/warehouseClient';
import { DeliveryPartnerApp } from '../components/delivery/DeliveryPartnerApp';
import { DeliveryClient } from '../services/deliveryClient';
import { AdminApp } from '../components/admin/AdminApp';
import { AdminClient } from '../services/adminClient';

export default function RootNavigator() {
  const { activeScreen, activeTab, isMobileFrame, toggleMobileFrame, navigate, isLoggedIn } = useApp();

  // Listen to /admin URL direct access
  React.useEffect(() => {
    if (window.location.pathname.startsWith('/admin') && activeScreen !== 'Admin') {
      navigate('Admin');
    }
  }, [activeScreen, navigate]);

  if (activeScreen === 'Admin') {
    return <AdminApp onSwitchToRetailerApp={() => navigate('Main')} />;
  }

  if (activeScreen === 'Warehouse') {
    return <WarehouseHubApp onSwitchToRetailerApp={() => navigate('Main')} />;
  }

  if (activeScreen === 'DeliveryPartner') {
    return <DeliveryPartnerApp onSwitchToRetailerApp={() => navigate('Main')} />;
  }

  // Gate launcher: Retailers and Unauthenticated users do NOT see the floating launcher
  const isAuthorizedWarehouse = !isLoggedIn && WarehouseClient.isAuthorized();

  const renderActiveScreen = () => {
    switch (activeScreen) {
      case 'Splash':
        return <SplashScreen />;
      case 'Login':
        return <LoginScreen />;
      case 'ShopSetup':
        return (
          <>
            <HeaderBar title="Retailer Registration" showBack showCart={false} />
            <div className="p-4">
              <ShopSetupScreen />
            </div>
          </>
        );
      case 'Products':
      case 'Catalogue':
        return (
          <>
            <HeaderBar title="MR FUTKAR Catalogue" showBack />
            <div className="p-4">
              <ProductListScreen />
            </div>
          </>
        );
      case 'ProductDetail':
        return (
          <>
            <HeaderBar title="Product Details" showBack />
            <div className="p-4">
              <ProductDetailScreen />
            </div>
          </>
        );
      case 'Cart':
        return (
          <>
            <HeaderBar title="Wholesale Cart" showBack showCart={false} />
            <div className="p-4">
              <CartScreen />
            </div>
          </>
        );
      case 'Checkout':
        return (
          <>
            <HeaderBar title="Checkout" showBack showCart={false} />
            <div className="p-4">
              <CheckoutScreen />
            </div>
          </>
        );
      case 'OrderSuccess':
        return (
          <>
            <HeaderBar title="Order Placed" showBack={false} showCart={false} />
            <div className="p-4">
              <OrderSuccessScreen />
            </div>
          </>
        );
      case 'OrderDetail':
        return (
          <>
            <HeaderBar title="Order Details" showBack showCart={true} />
            <div className="p-4">
              <OrderDetailScreen />
            </div>
          </>
        );
      case 'OrderTracking':
        return (
          <>
            <HeaderBar title="Live Order Tracking" showBack showCart={false} />
            <div className="p-4">
              <OrderTrackingScreen />
            </div>
          </>
        );
      case 'Main':
      default:
        return (
          <>
            <HeaderBar
              title={
                activeTab === 'Home'
                  ? 'MR FUTKAR'
                  : activeTab === 'Categories'
                  ? 'Categories'
                  : activeTab === 'Orders'
                  ? 'My Orders'
                  : activeTab === 'Cart'
                  ? 'Wholesale Cart'
                  : 'Retailer Profile'
              }
            />
            <main className="p-4">
              {activeTab === 'Home' && <HomeScreen />}
              {activeTab === 'Categories' && <CategoryScreen />}
              {activeTab === 'Orders' && <OrdersScreen />}
              {activeTab === 'Cart' && <CartScreen />}
              {activeTab === 'Profile' && <ProfileScreen />}
            </main>
            <BottomTabs />
          </>
        );
    }
  };

  return (
    <div className={`min-h-screen bg-stone-100 font-sans text-stone-900 flex flex-col items-center justify-start ${isMobileFrame ? 'py-4 sm:py-8' : ''}`}>
      {/* Container - Adaptive to Mobile Frame or Fullscreen */}
      <div
        className={`w-full bg-[#f8f8f8] min-h-screen relative flex flex-col transition-all duration-300 ${
          isMobileFrame
            ? 'max-w-[420px] rounded-[38px] shadow-2xl border-[8px] border-stone-850 overflow-hidden ring-1 ring-stone-900/10'
            : 'max-w-2xl shadow-sm border-x border-stone-200'
        }`}
      >
        {/* Mobile Device Status Bar simulation if in Mobile Frame mode */}
        {isMobileFrame && activeScreen !== 'Splash' && (
          <div className="bg-white px-6 pt-3 pb-1 flex items-center justify-between text-[11px] font-black text-stone-800 select-none border-b border-stone-100">
            <span>09:41</span>
            <div className="flex items-center gap-1 text-[10px]">
              <span>5G</span>
              <div className="w-4 h-2 border border-stone-800 rounded-xs p-0.5">
                <div className="w-full h-full bg-stone-800 rounded-2xs" />
              </div>
            </div>
          </div>
        )}

        {/* Screen Content */}
        <div className="flex-1 pb-10">{renderActiveScreen()}</div>
      </div>

      {/* Floating Utility Controls (Frame Toggle & Splash Replay & Warehouse Hub) */}
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
        {/* Strictly gated: Retailers & Unauthenticated users do NOT see the launcher */}
        {isAuthorizedWarehouse && (
          <button
            type="button"
            onClick={() => navigate('Warehouse')}
            className="bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black px-3.5 py-2 rounded-full shadow-lg transition-all flex items-center gap-1.5 border border-amber-600/30 cursor-pointer"
            title="Open Warehouse Operations Hub (WH-BRAHMPURI-01)"
          >
            <span>📦 Warehouse Hub</span>
          </button>
        )}
        {!isLoggedIn && DeliveryClient.isAuthorized() && (
          <button
            type="button"
            onClick={() => navigate('DeliveryPartner')}
            className="bg-[#0d1d25] hover:bg-stone-800 text-[#f5b024] text-xs font-black px-3.5 py-2 rounded-full shadow-lg transition-all flex items-center gap-1.5 border border-[#f5b024]/40 cursor-pointer"
            title="Open Delivery Partner Field App"
          >
            <span>🚚 Delivery Partner</span>
          </button>
        )}
        {!isLoggedIn && (
          <button
            type="button"
            onClick={() => navigate('Admin')}
            className="bg-stone-900 hover:bg-stone-850 text-amber-400 text-xs font-black px-3.5 py-2 rounded-full shadow-lg transition-all flex items-center gap-1.5 border border-amber-500/30 cursor-pointer"
            title="Open MR FUTKAR Super Admin Portal"
          >
            <span>🛡️ Admin</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('Splash')}
          className="bg-stone-900 text-amber-400 text-xs font-bold px-3 py-2 rounded-full shadow-lg border border-amber-400/20 hover:bg-stone-800 transition-all flex items-center gap-1.5 cursor-pointer"
          title="Replay Splash Screen"
        >
          <span>✨ Splash</span>
        </button>
        <button
          type="button"
          onClick={toggleMobileFrame}
          className="bg-white/90 backdrop-blur-md text-stone-800 text-xs font-bold px-3.5 py-2 rounded-full shadow-md border border-stone-200 hover:bg-white transition-all flex items-center gap-1.5"
        >
          <span>{isMobileFrame ? '📱 Fullscreen View' : '📱 Mobile Frame'}</span>
        </button>
      </div>

      {/* Mobile Export Architecture Modal */}
      <ExpoCodeModal />
    </div>
  );
}
