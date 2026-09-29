import React, { useState, useEffect } from 'react';
import { AdminProvider, useAdmin } from '../../context/AdminContext';
import { AdminLoginScreen } from '../../screens/admin/AdminLoginScreen';
import { AdminDashboardScreen } from '../../screens/admin/AdminDashboardScreen';
import { AdminProfileScreen } from '../../screens/admin/AdminProfileScreen';
import { AdminProductsScreen } from '../../screens/admin/AdminProductsScreen';
import { AdminPricingScreen } from '../../screens/admin/AdminPricingScreen';
import { AdminRetailersScreen } from '../../screens/admin/AdminRetailersScreen';
import { AdminRetailerDetailScreen } from '../../screens/admin/AdminRetailerDetailScreen';
import { AdminInventoryScreen } from '../../screens/admin/AdminInventoryScreen';
import { AdminInventoryDetailScreen } from '../../screens/admin/AdminInventoryDetailScreen';
import { AdminOrdersScreen } from '../../screens/admin/AdminOrdersScreen';
import { AdminOrderDetailScreen } from '../../screens/admin/AdminOrderDetailScreen';
import { AdminWarehouseScreen } from './warehouse/AdminWarehouseScreen';
import { AdminDeliveryPartnersScreen } from '../../screens/admin/AdminDeliveryPartnersScreen';
import { AdminDeliveryPartnerDetailScreen } from '../../screens/admin/AdminDeliveryPartnerDetailScreen';
import { AdminNotificationsScreen } from '../../screens/admin/AdminNotificationsScreen';
import { AdminReportsScreen } from '../../screens/admin/AdminReportsScreen';
import { AdminSettingsScreen } from '../../screens/admin/AdminSettingsScreen';
import { AdminUsersScreen } from '../../screens/admin/AdminUsersScreen';
import { AdminUserDetailScreen } from '../../screens/admin/AdminUserDetailScreen';
import { AdminAuditCenterScreen } from '../../screens/admin/AdminAuditCenterScreen';
import { AdminAccountingScreen } from '../../screens/admin/AdminAccountingScreen';
import { AdminInvoicesScreen } from '../../screens/admin/AdminInvoicesScreen';
import { AdminProtectedRoute } from './AdminProtectedRoute';
import { AdminLayout } from './AdminLayout';

interface AdminAppProps {
  onSwitchToRetailerApp: () => void;
}

const AdminContent: React.FC<AdminAppProps> = ({ onSwitchToRetailerApp }) => {
  const { isAuthenticated, isAuthorized } = useAdmin();
  const [currentView, setCurrentView] = useState<'DASHBOARD' | 'PROFILE' | 'PRODUCTS' | 'PRICING' | 'RETAILERS' | 'INVENTORY' | 'ORDERS' | 'WAREHOUSE' | 'DELIVERY_PARTNERS' | 'INVOICES' | 'ACCOUNTING' | 'NOTIFICATIONS' | 'REPORTS' | 'SETTINGS' | 'ADMIN_USERS' | 'AUDIT_LOGS'>('DASHBOARD');
  const [selectedRetailerId, setSelectedRetailerId] = useState<string | null>(null);
  const [selectedInventoryProductId, setSelectedInventoryProductId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedDeliveryPartnerId, setSelectedDeliveryPartnerId] = useState<string | null>(null);
  const [selectedAdminUid, setSelectedAdminUid] = useState<string | null>(null);

  // Sync URL route on mount & popstate
  useEffect(() => {
    const handleUrl = () => {
      const pathname = window.location.pathname;
      if (pathname.startsWith('/admin/audit')) {
        setCurrentView('AUDIT_LOGS');
        setSelectedAdminUid(null);
        setSelectedRetailerId(null);
        setSelectedInventoryProductId(null);
        setSelectedOrderId(null);
        setSelectedDeliveryPartnerId(null);
      } else if (pathname.startsWith('/admin/users')) {
        setCurrentView('ADMIN_USERS');
        const parts = pathname.split('/');
        if (parts.length >= 4 && parts[3]) {
          setSelectedAdminUid(parts[3]);
        } else {
          setSelectedAdminUid(null);
        }
        setSelectedRetailerId(null);
        setSelectedInventoryProductId(null);
        setSelectedOrderId(null);
        setSelectedDeliveryPartnerId(null);
      } else if (pathname.startsWith('/admin/settings')) {
        setCurrentView('SETTINGS');
        setSelectedAdminUid(null);
        setSelectedRetailerId(null);
        setSelectedInventoryProductId(null);
        setSelectedOrderId(null);
        setSelectedDeliveryPartnerId(null);
      } else if (pathname.startsWith('/admin/reports')) {
        setCurrentView('REPORTS');
        setSelectedRetailerId(null);
        setSelectedInventoryProductId(null);
        setSelectedOrderId(null);
        setSelectedDeliveryPartnerId(null);
      } else if (pathname.startsWith('/admin/notifications')) {
        setCurrentView('NOTIFICATIONS');
        setSelectedRetailerId(null);
        setSelectedInventoryProductId(null);
        setSelectedOrderId(null);
        setSelectedDeliveryPartnerId(null);
      } else if (pathname.startsWith('/admin/invoices')) {
        setCurrentView('INVOICES');
        setSelectedAdminUid(null);
        setSelectedRetailerId(null);
        setSelectedInventoryProductId(null);
        setSelectedOrderId(null);
        setSelectedDeliveryPartnerId(null);
      } else if (pathname.startsWith('/admin/accounting')) {
        setCurrentView('ACCOUNTING');
        setSelectedAdminUid(null);
        setSelectedRetailerId(null);
        setSelectedInventoryProductId(null);
        setSelectedOrderId(null);
        setSelectedDeliveryPartnerId(null);
      } else if (pathname.startsWith('/admin/orders')) {
        setCurrentView('ORDERS');
        const parts = pathname.split('/');
        if (parts.length >= 4 && parts[3]) {
          setSelectedOrderId(parts[3]);
        } else {
          setSelectedOrderId(null);
        }
      } else if (pathname.startsWith('/admin/delivery-partners')) {
        setCurrentView('DELIVERY_PARTNERS');
        const parts = pathname.split('/');
        if (parts.length >= 4 && parts[3]) {
          setSelectedDeliveryPartnerId(parts[3]);
        } else {
          setSelectedDeliveryPartnerId(null);
        }
      } else if (pathname.startsWith('/admin/warehouse')) {
        setCurrentView('WAREHOUSE');
        setSelectedRetailerId(null);
        setSelectedInventoryProductId(null);
        setSelectedOrderId(null);
        setSelectedDeliveryPartnerId(null);
      } else if (pathname.startsWith('/admin/inventory')) {
        setCurrentView('INVENTORY');
        const parts = pathname.split('/');
        if (parts.length >= 4 && parts[3]) {
          setSelectedInventoryProductId(parts[3]);
        } else {
          setSelectedInventoryProductId(null);
        }
      } else if (pathname.startsWith('/admin/retailers')) {
        setCurrentView('RETAILERS');
        const parts = pathname.split('/');
        if (parts.length >= 4 && parts[3]) {
          setSelectedRetailerId(parts[3]);
        } else {
          setSelectedRetailerId(null);
        }
      } else if (pathname === '/admin/pricing') {
        setCurrentView('PRICING');
        setSelectedRetailerId(null);
        setSelectedInventoryProductId(null);
        setSelectedOrderId(null);
        setSelectedDeliveryPartnerId(null);
      } else if (pathname === '/admin/products') {
        setCurrentView('PRODUCTS');
        setSelectedRetailerId(null);
        setSelectedInventoryProductId(null);
        setSelectedOrderId(null);
        setSelectedDeliveryPartnerId(null);
      } else if (pathname === '/admin/profile') {
        setCurrentView('PROFILE');
        setSelectedRetailerId(null);
        setSelectedInventoryProductId(null);
        setSelectedOrderId(null);
        setSelectedDeliveryPartnerId(null);
      } else if (pathname === '/admin') {
        setCurrentView('DASHBOARD');
        setSelectedRetailerId(null);
        setSelectedInventoryProductId(null);
        setSelectedOrderId(null);
        setSelectedDeliveryPartnerId(null);
      }
    };

    handleUrl();
    window.addEventListener('popstate', handleUrl);
    return () => window.removeEventListener('popstate', handleUrl);
  }, []);

  const handleNavigate = (view: 'DASHBOARD' | 'PROFILE' | 'PRODUCTS' | 'PRICING' | 'RETAILERS' | 'INVENTORY' | 'ORDERS' | 'WAREHOUSE' | 'DELIVERY_PARTNERS' | 'INVOICES' | 'ACCOUNTING' | 'NOTIFICATIONS' | 'REPORTS' | 'SETTINGS' | 'ADMIN_USERS' | 'AUDIT_LOGS') => {
    setCurrentView(view);
    setSelectedRetailerId(null);
    setSelectedInventoryProductId(null);
    setSelectedOrderId(null);
    setSelectedDeliveryPartnerId(null);
    setSelectedAdminUid(null);
    let targetUrl = '/admin';
    if (view === 'SETTINGS') targetUrl = '/admin/settings';
    else if (view === 'ADMIN_USERS') targetUrl = '/admin/users';
    else if (view === 'AUDIT_LOGS') targetUrl = '/admin/audit';
    else if (view === 'REPORTS') targetUrl = '/admin/reports';
    else if (view === 'INVOICES') targetUrl = '/admin/invoices';
    else if (view === 'ACCOUNTING') targetUrl = '/admin/accounting';
    else if (view === 'ORDERS') targetUrl = '/admin/orders';
    else if (view === 'DELIVERY_PARTNERS') targetUrl = '/admin/delivery-partners';
    else if (view === 'NOTIFICATIONS') targetUrl = '/admin/notifications';
    else if (view === 'WAREHOUSE') targetUrl = '/admin/warehouse';
    else if (view === 'PRODUCTS') targetUrl = '/admin/products';
    else if (view === 'PRICING') targetUrl = '/admin/pricing';
    else if (view === 'RETAILERS') targetUrl = '/admin/retailers';
    else if (view === 'INVENTORY') targetUrl = '/admin/inventory';
    else if (view === 'PROFILE') targetUrl = '/admin/profile';
    try {
      window.history.pushState(null, '', targetUrl);
    } catch {
      // Ignore
    }
  };

  const handleSelectAdmin = (adminUid: string) => {
    setSelectedAdminUid(adminUid);
    try {
      window.history.pushState(null, '', `/admin/users/${adminUid}`);
    } catch {
      // Ignore
    }
  };

  const handleBackToAdminUsersList = () => {
    setSelectedAdminUid(null);
    try {
      window.history.pushState(null, '', '/admin/users');
    } catch {
      // Ignore
    }
  };

  const handleSelectDeliveryPartner = (partnerId: string) => {
    setSelectedDeliveryPartnerId(partnerId);
    try {
      window.history.pushState(null, '', `/admin/delivery-partners/${partnerId}`);
    } catch {
      // Ignore
    }
  };

  const handleBackToDeliveryPartnersList = () => {
    setSelectedDeliveryPartnerId(null);
    try {
      window.history.pushState(null, '', '/admin/delivery-partners');
    } catch {
      // Ignore
    }
  };

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
    try {
      window.history.pushState(null, '', `/admin/orders/${orderId}`);
    } catch {
      // Ignore
    }
  };

  const handleBackToOrdersList = () => {
    setSelectedOrderId(null);
    try {
      window.history.pushState(null, '', '/admin/orders');
    } catch {
      // Ignore
    }
  };

  const handleSelectRetailer = (retailerId: string) => {
    setSelectedRetailerId(retailerId);
    try {
      window.history.pushState(null, '', `/admin/retailers/${retailerId}`);
    } catch {
      // Ignore
    }
  };

  const handleBackToRetailerList = () => {
    setSelectedRetailerId(null);
    try {
      window.history.pushState(null, '', '/admin/retailers');
    } catch {
      // Ignore
    }
  };

  const handleSelectInventoryProduct = (productId: string) => {
    setSelectedInventoryProductId(productId);
    try {
      window.history.pushState(null, '', `/admin/inventory/${productId}`);
    } catch {
      // Ignore
    }
  };

  const handleBackToInventoryList = () => {
    setSelectedInventoryProductId(null);
    try {
      window.history.pushState(null, '', '/admin/inventory');
    } catch {
      // Ignore
    }
  };

  if (!isAuthenticated || !isAuthorized) {
    return (
      <AdminLoginScreen
        onSuccess={() => handleNavigate('DASHBOARD')}
        onExit={onSwitchToRetailerApp}
      />
    );
  }

  return (
    <AdminProtectedRoute onExit={onSwitchToRetailerApp}>
      <AdminLayout
        currentView={currentView}
        onNavigate={handleNavigate}
        onBackToRetailer={onSwitchToRetailerApp}
      >
        {currentView === 'DASHBOARD' ? (
          <AdminDashboardScreen
            onNavigateToOrders={(orderId?: string) => {
              if (orderId) {
                handleSelectOrder(orderId);
              } else {
                handleNavigate('ORDERS');
              }
            }}
          />
        ) : currentView === 'ORDERS' ? (
          selectedOrderId ? (
            <AdminOrderDetailScreen
              orderId={selectedOrderId}
              onBack={handleBackToOrdersList}
            />
          ) : (
            <AdminOrdersScreen onSelectOrder={handleSelectOrder} />
          )
        ) : currentView === 'PRODUCTS' ? (
          <AdminProductsScreen />
        ) : currentView === 'PRICING' ? (
          <AdminPricingScreen />
        ) : currentView === 'RETAILERS' ? (
          selectedRetailerId ? (
            <AdminRetailerDetailScreen
              retailerId={selectedRetailerId}
              onBack={handleBackToRetailerList}
            />
          ) : (
            <AdminRetailersScreen onSelectRetailer={handleSelectRetailer} />
          )
        ) : currentView === 'DELIVERY_PARTNERS' ? (
          selectedDeliveryPartnerId ? (
            <AdminDeliveryPartnerDetailScreen
              partnerId={selectedDeliveryPartnerId}
              onBack={handleBackToDeliveryPartnersList}
              onNavigateToOrder={handleSelectOrder}
            />
          ) : (
            <AdminDeliveryPartnersScreen onSelectPartner={handleSelectDeliveryPartner} />
          )
        ) : currentView === 'INVOICES' ? (
          <AdminInvoicesScreen />
        ) : currentView === 'ACCOUNTING' ? (
          <AdminAccountingScreen />
        ) : currentView === 'NOTIFICATIONS' ? (
          <AdminNotificationsScreen
            onNavigateToOrder={(orderId: string) => {
              handleSelectOrder(orderId);
            }}
          />
        ) : currentView === 'REPORTS' ? (
          <AdminReportsScreen />
        ) : currentView === 'SETTINGS' ? (
          <AdminSettingsScreen />
        ) : currentView === 'ADMIN_USERS' ? (
          selectedAdminUid ? (
            <AdminUserDetailScreen
              uid={selectedAdminUid}
              onBack={handleBackToAdminUsersList}
            />
          ) : (
            <AdminUsersScreen onSelectAdmin={handleSelectAdmin} />
          )
        ) : currentView === 'AUDIT_LOGS' ? (
          <AdminAuditCenterScreen />
        ) : currentView === 'WAREHOUSE' ? (
          <AdminWarehouseScreen />
        ) : currentView === 'INVENTORY' ? (
          selectedInventoryProductId ? (
            <AdminInventoryDetailScreen
              productId={selectedInventoryProductId}
              onBack={handleBackToInventoryList}
            />
          ) : (
            <AdminInventoryScreen onSelectProduct={handleSelectInventoryProduct} />
          )
        ) : (
          <AdminProfileScreen onBack={() => handleNavigate('DASHBOARD')} />
        )}
      </AdminLayout>
    </AdminProtectedRoute>
  );
};

export const AdminApp: React.FC<AdminAppProps> = props => {
  return (
    <AdminProvider>
      <AdminContent {...props} />
    </AdminProvider>
  );
};
