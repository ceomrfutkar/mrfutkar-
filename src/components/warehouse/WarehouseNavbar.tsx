import React from 'react';
import { useWarehouse } from '../../context/WarehouseContext';
import {
  LayoutDashboard,
  ClipboardList,
  CheckSquare,
  Package,
  Boxes,
  AlertTriangle,
  Truck,
  RotateCcw,
  History,
  Store,
  ShieldCheck,
  Building2,
  MapPin,
  UserCheck,
  LogOut,
  IndianRupee,
  Receipt,
  FileSpreadsheet,
} from 'lucide-react';

interface WarehouseNavbarProps {
  onSwitchToRetailerApp: () => void;
}

export const WarehouseNavbar: React.FC<WarehouseNavbarProps> = ({ onSwitchToRetailerApp }) => {
  const {
    currentView,
    setCurrentView,
    currentUser,
    metrics,
    warehouseId,
    warehouseName,
    branchName,
    logout,
  } = useWarehouse();

  const navItems = [
    { id: 'DASHBOARD', label: 'Dashboard', icon: LayoutDashboard },
    {
      id: 'ORDERS',
      label: 'Orders',
      icon: ClipboardList,
      badge: metrics?.newOrdersCount ? metrics.newOrdersCount : undefined,
    },
    {
      id: 'PICKING',
      label: 'Picking',
      icon: CheckSquare,
      badge: metrics?.ordersBeingPickedCount ? metrics.ordersBeingPickedCount : undefined,
    },
    {
      id: 'PACKING',
      label: 'Packing',
      icon: Package,
      badge: metrics?.ordersPackedCount ? metrics.ordersPackedCount : undefined,
    },
    { id: 'INVENTORY', label: 'Inventory', icon: Boxes },
    {
      id: 'LOW_STOCK',
      label: 'Low Stock',
      icon: AlertTriangle,
      badge: metrics?.lowStockAlertsCount ? metrics.lowStockAlertsCount : undefined,
      badgeColor: 'bg-rose-500',
    },
    {
      id: 'DISPATCH',
      label: 'Dispatch Bay',
      icon: Truck,
      badge: metrics?.ordersReadyForDispatchCount ? metrics.ordersReadyForDispatchCount : undefined,
    },
    { id: 'RETURNS', label: 'Returns', icon: RotateCcw },
    { id: 'SALE_BILLS', label: 'Sale Bills', icon: Receipt },
    { id: 'PURCHASE_BILLS', label: 'Purchase Bills', icon: FileSpreadsheet },
    { id: 'COD_HANDOVERS', label: 'COD Handover', icon: IndianRupee },
    { id: 'AUDIT_LOGS', label: 'Stock Audit', icon: History },
    { id: 'PROFILE', label: 'Hub Profile', icon: UserCheck },
  ];

  return (
    <header className="bg-stone-900 text-stone-100 border-b border-stone-800 sticky top-0 z-40 shadow-md">
      {/* Top Bar: Hub Identity & Server-Authenticated Personnel */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-stone-800/80">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500 text-stone-950 flex items-center justify-center font-black text-lg shadow-sm">
            WH
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm tracking-tight text-white">{warehouseName}</span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                {warehouseId}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                OPERATIONAL HUB
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-stone-400 mt-0.5">
              <span className="flex items-center gap-1 font-medium text-stone-300">
                <Building2 className="w-3 h-3 text-amber-400" />
                {branchName}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-stone-400">
                <MapPin className="w-3 h-3 text-stone-400" />
                Territory: Brahmpuri & Karawal Nagar (Merged Central DC)
              </span>
            </div>
          </div>
        </div>

        {/* Server Authorized Identity & Controls */}
        <div className="flex items-center gap-2.5">
          {/* Server Authenticated Staff Badge (Read Only - Role Spoofing Removed) */}
          <div
            onClick={() => setCurrentView('PROFILE')}
            className="flex items-center gap-2 bg-stone-800/90 hover:bg-stone-800 px-3 py-1.5 rounded-xl border border-stone-700/80 text-xs shadow-inner cursor-pointer transition-colors"
            title="View Hub Profile & Access Credentials"
          >
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="flex flex-col text-left">
              <span className="text-white font-bold text-xs leading-none">{currentUser.name}</span>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">
                  {currentUser.role}
                </span>
                <span className="text-[9px] text-stone-500">•</span>
                <span className="text-[9px] text-stone-400 font-medium">{branchName}</span>
              </div>
            </div>
          </div>

          {/* Switch to Retailer App Button */}
          <button
            type="button"
            onClick={onSwitchToRetailerApp}
            className="flex items-center gap-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 px-3 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer"
            title="Switch to Kirana Retailer Ordering App"
          >
            <Store className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Retailer App</span>
          </button>

          {/* Hub Sign Out */}
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1 p-1.5 bg-stone-800 hover:bg-rose-950 hover:border-rose-800 text-stone-400 hover:text-rose-300 rounded-lg border border-stone-700 transition-all cursor-pointer"
            title="Sign Out of Warehouse Hub"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <nav className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-none text-xs font-medium">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentView(item.id as any)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-amber-500 text-stone-950 font-bold shadow-xs'
                    : 'text-stone-300 hover:text-white hover:bg-stone-800'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-stone-950' : 'text-stone-400'}`} />
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`ml-1 text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                      item.badgeColor || (isActive ? 'bg-stone-950 text-amber-400' : 'bg-amber-500 text-stone-950')
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
