import React, { useState } from 'react';
import { AdminHeader } from './AdminHeader';
import { AdminSidebar } from './AdminSidebar';

interface AdminLayoutProps {
  currentView: 'DASHBOARD' | 'PROFILE' | 'PRODUCTS' | 'PRICING' | 'RETAILERS' | 'INVENTORY' | 'ORDERS' | 'WAREHOUSE' | 'DELIVERY_PARTNERS' | 'INVOICES' | 'ACCOUNTING' | 'NOTIFICATIONS' | 'REPORTS' | 'SETTINGS' | 'ADMIN_USERS' | 'AUDIT_LOGS';
  onNavigate: (view: 'DASHBOARD' | 'PROFILE' | 'PRODUCTS' | 'PRICING' | 'RETAILERS' | 'INVENTORY' | 'ORDERS' | 'WAREHOUSE' | 'DELIVERY_PARTNERS' | 'INVOICES' | 'ACCOUNTING' | 'NOTIFICATIONS' | 'REPORTS' | 'SETTINGS' | 'ADMIN_USERS' | 'AUDIT_LOGS') => void;
  onBackToRetailer?: () => void;
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentView,
  onNavigate,
  onBackToRetailer,
  children,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [placeholderNotice, setPlaceholderNotice] = useState<string | null>(null);

  const handlePlaceholderNotice = (moduleName: string) => {
    setPlaceholderNotice(`Coming in the next Admin module: ${moduleName}`);
    setTimeout(() => {
      setPlaceholderNotice(null);
    }, 3500);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Toast banner for placeholder modules */}
      {placeholderNotice && (
        <div className="fixed bottom-5 right-5 z-50 bg-[#0d1d25] text-[#f5b024] px-4 py-3 rounded-lg shadow-xl border border-amber-500/30 flex items-center gap-3 animate-slide-up text-xs font-semibold">
          <span>ℹ️</span>
          <span>{placeholderNotice}</span>
          <button
            onClick={() => setPlaceholderNotice(null)}
            className="ml-2 text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Admin Sidebar */}
      <AdminSidebar
        currentView={currentView}
        onNavigate={onNavigate}
        onPlaceholderNotice={handlePlaceholderNotice}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Wrapper with Sidebar Offset on Desktop */}
      <div className="lg:pl-64 flex flex-col flex-1 min-w-0">
        <AdminHeader
          onToggleSidebar={() => setSidebarOpen(prev => !prev)}
          onNavigateProfile={() => onNavigate('PROFILE')}
          onBackToRetailer={onBackToRetailer}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
