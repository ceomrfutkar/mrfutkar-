import React from 'react';
import { WarehouseProvider, useWarehouse } from '../../context/WarehouseContext';
import { WarehouseNavbar } from './WarehouseNavbar';
import { WarehouseDashboard } from './WarehouseDashboard';
import { WarehouseOrdersList } from './WarehouseOrdersList';
import { WarehouseOrderDetail } from './WarehouseOrderDetail';
import { WarehousePickingScreen } from './WarehousePickingScreen';
import { WarehousePackingScreen } from './WarehousePackingScreen';
import { WarehouseInventoryScreen } from './WarehouseInventoryScreen';
import { WarehouseLowStockScreen } from './WarehouseLowStockScreen';
import { WarehouseDispatchScreen } from './WarehouseDispatchScreen';
import { WarehouseReturnsScreen } from './WarehouseReturnsScreen';
import { WarehouseAuditLogsScreen } from './WarehouseAuditLogsScreen';
import { WarehouseCodHandoverQueue } from './WarehouseCodHandoverQueue';
import { WarehouseSaleBillsScreen } from './WarehouseSaleBillsScreen';
import { WarehousePurchaseBillsScreen } from './WarehousePurchaseBillsScreen';
import { WarehouseProfileScreen } from './WarehouseProfileScreen';
import { WarehouseLoginScreen } from './WarehouseLoginScreen';
import { AlertCircle, Loader2 } from 'lucide-react';

interface WarehouseHubAppProps {
  onSwitchToRetailerApp: () => void;
}

const WarehouseContent: React.FC<WarehouseHubAppProps> = ({ onSwitchToRetailerApp }) => {
  const {
    currentView,
    isLoading,
    error,
    isAuthenticated,
    loginWithSession,
    logout,
  } = useWarehouse();

  // If not authenticated as authorized warehouse staff, enforce dedicated Warehouse Login Gate
  if (!isAuthenticated) {
    return (
      <WarehouseLoginScreen
        onLoginSuccess={session => loginWithSession(session)}
        onCancel={onSwitchToRetailerApp}
      />
    );
  }

  const renderView = () => {
    switch (currentView) {
      case 'DASHBOARD':
        return <WarehouseDashboard />;
      case 'ORDERS':
        return <WarehouseOrdersList />;
      case 'ORDER_DETAIL':
        return <WarehouseOrderDetail />;
      case 'PICKING':
        return <WarehousePickingScreen />;
      case 'PACKING':
        return <WarehousePackingScreen />;
      case 'INVENTORY':
      case 'STOCK_ADJUST':
        return <WarehouseInventoryScreen />;
      case 'LOW_STOCK':
        return <WarehouseLowStockScreen />;
      case 'DISPATCH':
        return <WarehouseDispatchScreen />;
      case 'RETURNS':
        return <WarehouseReturnsScreen />;
      case 'COD_HANDOVERS':
        return <WarehouseCodHandoverQueue />;
      case 'SALE_BILLS':
        return <WarehouseSaleBillsScreen />;
      case 'PURCHASE_BILLS':
        return <WarehousePurchaseBillsScreen />;
      case 'AUDIT_LOGS':
        return <WarehouseAuditLogsScreen />;
      case 'PROFILE':
        return (
          <WarehouseProfileScreen
            onLogout={logout}
            onSwitchToRetailerApp={onSwitchToRetailerApp}
          />
        );
      default:
        return <WarehouseDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 font-sans flex flex-col">
      <WarehouseNavbar onSwitchToRetailerApp={onSwitchToRetailerApp} />

      {/* Optional Global Error Toast */}
      {error && (
        <div className="bg-rose-600 text-white text-xs px-4 py-2 text-center flex items-center justify-center gap-2 font-medium">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 relative">
        {renderView()}
      </main>

      {/* Warehouse Hub Footer */}
      <footer className="bg-white border-t border-stone-200 py-3 text-center text-[11px] text-stone-500">
        MR FUTKAR Hub Operations System • WH-BRAHMPURI-01 (Brahmpuri Branch) • Unified Fulfillment Hub serving Brahmpuri & Karawal Nagar
      </footer>
    </div>
  );
};

export const WarehouseHubApp: React.FC<WarehouseHubAppProps> = ({ onSwitchToRetailerApp }) => {
  return (
    <WarehouseProvider>
      <WarehouseContent onSwitchToRetailerApp={onSwitchToRetailerApp} />
    </WarehouseProvider>
  );
};
