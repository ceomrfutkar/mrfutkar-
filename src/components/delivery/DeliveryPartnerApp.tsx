import React, { useEffect } from 'react';
import { DeliveryProvider, useDelivery } from '../../context/DeliveryContext';
import { DeliveryPartnerNavbar } from './DeliveryPartnerNavbar';
import { DeliveryPartnerBottomNav } from './DeliveryPartnerBottomNav';
import { DeliveryPartnerLoginScreen } from './DeliveryPartnerLoginScreen';
import { DeliveryPartnerHomeScreen } from './DeliveryPartnerHomeScreen';
import { DeliveryOrdersScreen } from './DeliveryOrdersScreen';
import { DeliveryOrderDetailScreen } from './DeliveryOrderDetailScreen';
import { DeliveryHistoryScreen } from './DeliveryHistoryScreen';
import { DeliveryPartnerProfileScreen } from './DeliveryPartnerProfileScreen';
import { AlertCircle } from 'lucide-react';

interface DeliveryPartnerAppProps {
  onSwitchToRetailerApp?: () => void;
}

const DeliveryPartnerAppContent: React.FC<DeliveryPartnerAppProps> = ({ onSwitchToRetailerApp }) => {
  const {
    currentView,
    isAuthenticated,
    loginWithSession,
    logout,
    error,
    clearError,
    refreshSession,
  } = useDelivery();

  // On mount, verify session authoritatively if token exists
  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // If not authenticated as authorized Delivery Partner, show Login Gate
  if (!isAuthenticated) {
    return (
      <DeliveryPartnerLoginScreen
        onLoginSuccess={session => loginWithSession(session)}
        onCancel={onSwitchToRetailerApp}
      />
    );
  }

  const renderCurrentView = () => {
    switch (currentView) {
      case 'HOME':
        return <DeliveryPartnerHomeScreen />;
      case 'DELIVERIES':
        return <DeliveryOrdersScreen />;
      case 'ORDER_DETAIL':
        return <DeliveryOrderDetailScreen />;
      case 'HISTORY':
        return <DeliveryHistoryScreen />;
      case 'PROFILE':
        return (
          <DeliveryPartnerProfileScreen
            onLogout={logout}
            onSwitchToRetailerApp={onSwitchToRetailerApp}
          />
        );
      default:
        return <DeliveryPartnerHomeScreen />;
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 font-sans flex flex-col">
      {/* Dark Delivery Partner Header */}
      <DeliveryPartnerNavbar onSwitchToRetailerApp={onSwitchToRetailerApp} />

      {/* Global Error Notice */}
      {error && (
        <div className="bg-[#e72b2b] text-white text-xs px-4 py-2 flex items-center justify-between shadow-md z-50">
          <div className="flex items-center gap-2 max-w-4xl mx-auto w-full">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
          <button
            type="button"
            onClick={clearError}
            className="text-white hover:text-stone-200 text-xs font-bold px-2 py-0.5 rounded cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 relative">
        {renderCurrentView()}
      </main>

      {/* Touch-Friendly Bottom Navigation (Hidden when viewing order detail to prioritize action bar) */}
      {currentView !== 'ORDER_DETAIL' && <DeliveryPartnerBottomNav />}
    </div>
  );
};

export const DeliveryPartnerApp: React.FC<DeliveryPartnerAppProps> = (props) => {
  return (
    <DeliveryProvider>
      <DeliveryPartnerAppContent {...props} />
    </DeliveryProvider>
  );
};
