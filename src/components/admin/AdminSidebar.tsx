import React from 'react';

export type AdminNavKey =
  | 'dashboard'
  | 'orders'
  | 'products'
  | 'retailers'
  | 'pricing'
  | 'inventory'
  | 'warehouse'
  | 'delivery_partners'
  | 'invoices'
  | 'accounting'
  | 'notifications'
  | 'reports'
  | 'settings'
  | 'admin_users'
  | 'audit_logs'
  | 'profile';

interface AdminSidebarProps {
  currentView: 'DASHBOARD' | 'PROFILE' | 'PRODUCTS' | 'PRICING' | 'RETAILERS' | 'INVENTORY' | 'ORDERS' | 'WAREHOUSE' | 'DELIVERY_PARTNERS' | 'INVOICES' | 'ACCOUNTING' | 'NOTIFICATIONS' | 'REPORTS' | 'SETTINGS' | 'ADMIN_USERS' | 'AUDIT_LOGS';
  onNavigate: (view: 'DASHBOARD' | 'PROFILE' | 'PRODUCTS' | 'PRICING' | 'RETAILERS' | 'INVENTORY' | 'ORDERS' | 'WAREHOUSE' | 'DELIVERY_PARTNERS' | 'INVOICES' | 'ACCOUNTING' | 'NOTIFICATIONS' | 'REPORTS' | 'SETTINGS' | 'ADMIN_USERS' | 'AUDIT_LOGS') => void;
  onPlaceholderNotice: (moduleName: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

interface NavItemConfig {
  key: AdminNavKey;
  label: string;
  isPlaceholder?: boolean;
  icon: string;
}

export const NAV_ITEMS: NavItemConfig[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'orders', label: 'Orders', isPlaceholder: false, icon: '📦' },
  { key: 'products', label: 'Products', icon: '🏷️' },
  { key: 'retailers', label: 'Retailers', icon: '🏪' },
  { key: 'pricing', label: 'Pricing', icon: '💰' },
  { key: 'inventory', label: 'Inventory', icon: '🏬' },
  { key: 'warehouse', label: 'Warehouse', isPlaceholder: false, icon: '🏭' },
  { key: 'delivery_partners', label: 'Delivery Partners', isPlaceholder: false, icon: '🚚' },
  { key: 'invoices', label: 'Invoices', isPlaceholder: false, icon: '🧾' },
  { key: 'accounting', label: 'Accounting', isPlaceholder: false, icon: '💼' },
  { key: 'notifications', label: 'Notifications', isPlaceholder: false, icon: '🔔' },
  { key: 'reports', label: 'Reports', isPlaceholder: false, icon: '📈' },
  { key: 'settings', label: 'Settings', isPlaceholder: false, icon: '⚙️' },
  { key: 'admin_users', label: 'Admin Users', isPlaceholder: false, icon: '🛡️' },
  { key: 'audit_logs', label: 'Audit & Security', isPlaceholder: false, icon: '📜' },
  { key: 'profile', label: 'Profile', icon: '👤' },
];

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentView,
  onNavigate,
  onPlaceholderNotice,
  isOpen,
  onClose,
}) => {
  const handleClick = (item: NavItemConfig) => {
    if (item.key === 'dashboard') {
      onNavigate('DASHBOARD');
      onClose();
    } else if (item.key === 'orders') {
      onNavigate('ORDERS');
      onClose();
    } else if (item.key === 'warehouse') {
      onNavigate('WAREHOUSE');
      onClose();
    } else if (item.key === 'delivery_partners') {
      onNavigate('DELIVERY_PARTNERS');
      onClose();
    } else if (item.key === 'invoices') {
      onNavigate('INVOICES');
      onClose();
    } else if (item.key === 'accounting') {
      onNavigate('ACCOUNTING');
      onClose();
    } else if (item.key === 'notifications') {
      onNavigate('NOTIFICATIONS');
      onClose();
    } else if (item.key === 'reports') {
      onNavigate('REPORTS');
      onClose();
    } else if (item.key === 'profile') {
      onNavigate('PROFILE');
      onClose();
    } else if (item.key === 'products') {
      onNavigate('PRODUCTS');
      onClose();
    } else if (item.key === 'pricing') {
      onNavigate('PRICING');
      onClose();
    } else if (item.key === 'retailers') {
      onNavigate('RETAILERS');
      onClose();
    } else if (item.key === 'inventory') {
      onNavigate('INVENTORY');
      onClose();
    } else if (item.key === 'settings') {
      onNavigate('SETTINGS');
      onClose();
    } else if (item.key === 'admin_users') {
      onNavigate('ADMIN_USERS');
      onClose();
    } else if (item.key === 'audit_logs') {
      onNavigate('AUDIT_LOGS');
      onClose();
    } else {
      onPlaceholderNotice(item.label);
    }
  };

  return (
    <>
      {/* Mobile / Tablet Overlay backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 lg:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#0d1d25] text-slate-200 border-r border-slate-800 transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } flex flex-col justify-between`}
      >
        <div>
          {/* Logo Brand Header */}
          <div className="h-16 px-6 flex items-center justify-between border-b border-slate-800 bg-[#081318]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#f5b024] flex items-center justify-center text-slate-950 font-black text-sm">
                MF
              </div>
              <div>
                <div className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
                  MR FUTKAR
                  <span className="text-[10px] uppercase font-extrabold px-1 py-0.5 rounded bg-[#f5b024]/20 text-[#f5b024] border border-[#f5b024]/30">
                    B2B
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-medium">
                  Admin Command Console
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              aria-label="Close Sidebar"
            >
              ✕
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-140px)]">
            <div className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Operations & Management
            </div>

            {NAV_ITEMS.map(item => {
              const isActive =
                (item.key === 'dashboard' && currentView === 'DASHBOARD') ||
                (item.key === 'orders' && currentView === 'ORDERS') ||
                (item.key === 'warehouse' && currentView === 'WAREHOUSE') ||
                (item.key === 'delivery_partners' && currentView === 'DELIVERY_PARTNERS') ||
                (item.key === 'invoices' && currentView === 'INVOICES') ||
                (item.key === 'accounting' && currentView === 'ACCOUNTING') ||
                (item.key === 'profile' && currentView === 'PROFILE') ||
                (item.key === 'products' && currentView === 'PRODUCTS') ||
                (item.key === 'pricing' && currentView === 'PRICING') ||
                (item.key === 'retailers' && currentView === 'RETAILERS') ||
                (item.key === 'inventory' && currentView === 'INVENTORY') ||
                (item.key === 'notifications' && currentView === 'NOTIFICATIONS') ||
                (item.key === 'reports' && currentView === 'REPORTS') ||
                (item.key === 'settings' && currentView === 'SETTINGS') ||
                (item.key === 'admin_users' && currentView === 'ADMIN_USERS') ||
                (item.key === 'audit_logs' && currentView === 'AUDIT_LOGS');

              return (
                <button
                  key={item.key}
                  onClick={() => handleClick(item)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors text-left ${
                    isActive
                      ? 'bg-[#f5b024] text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm">{item.icon}</span>
                    <span>{item.label}</span>
                  </div>

                  {item.isPlaceholder && (
                    <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      Soon
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#081318]/60">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>MR FUTKAR v3.2</span>
            <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Live
            </span>
          </div>
        </div>
      </aside>
    </>
  );
};
