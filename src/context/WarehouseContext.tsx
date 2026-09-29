import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  WarehouseRole,
  WarehouseUser,
  WarehouseDashboardMetrics,
  WarehouseOrder,
  WarehouseInventoryItem,
  StockMovementRecord,
  WarehouseReturnRecord,
  WarehouseOrderStatus,
  StockAdjustmentReason,
  ReturnStatus,
  InspectionStatus,
  WarehouseSession,
} from '../types/warehouse';
import { WarehouseClient } from '../services/warehouseClient';

export type WarehouseView =
  | 'DASHBOARD'
  | 'ORDERS'
  | 'ORDER_DETAIL'
  | 'PICKING'
  | 'PACKING'
  | 'INVENTORY'
  | 'STOCK_ADJUST'
  | 'LOW_STOCK'
  | 'DISPATCH'
  | 'RETURNS'
  | 'AUDIT_LOGS'
  | 'COD_HANDOVERS'
  | 'SALE_BILLS'
  | 'PURCHASE_BILLS'
  | 'PROFILE';

interface WarehouseContextType {
  // Operational Identity (Permanently locked to WH-BRAHMPURI-01)
  warehouseId: 'WH-BRAHMPURI-01';
  warehouseName: 'MR FUTKAR — BRAHMPURI';
  branchName: 'Brahmpuri Branch';
  serviceAreas: string[];

  // Authentication & Session State
  isAuthenticated: boolean;
  isAuthChecking: boolean;
  authError: string | null;
  loginWithSession: (session: WarehouseSession) => void;
  logout: () => void;

  // Current Staff User
  currentUser: WarehouseUser;

  // View Routing
  currentView: WarehouseView;
  setCurrentView: (view: WarehouseView) => void;
  selectedOrderId: string | null;
  selectOrder: (orderId: string | null, targetView?: WarehouseView) => void;
  selectedProductForAdjust: WarehouseInventoryItem | null;
  openStockAdjustModal: (item: WarehouseInventoryItem | null) => void;

  // Data State
  metrics: WarehouseDashboardMetrics | null;
  orders: WarehouseOrder[];
  selectedOrder: WarehouseOrder | null;
  inventory: WarehouseInventoryItem[];
  movements: StockMovementRecord[];
  returns: WarehouseReturnRecord[];
  isLoading: boolean;
  error: string | null;

  // Filter States
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  paymentStatusFilter: string;
  setPaymentStatusFilter: (p: string) => void;
  areaFilter: string;
  setAreaFilter: (a: string) => void;
  categoryFilter: string;
  setCategoryFilter: (c: string) => void;
  stockStatusFilter: string;
  setStockStatusFilter: (s: string) => void;

  // Actions
  refreshAll: () => Promise<void>;
  refreshMetrics: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  refreshInventory: () => Promise<void>;
  refreshMovements: () => Promise<void>;
  refreshReturns: () => Promise<void>;
  loadOrderDetail: (orderId: string) => Promise<WarehouseOrder | null>;
  transitionOrderStatus: (orderId: string, newStatus: WarehouseOrderStatus, reason?: string) => Promise<boolean>;
  savePickingProgress: (orderId: string, items: any, completePicking: boolean) => Promise<boolean>;
  savePackingInfo: (orderId: string, payload: any) => Promise<boolean>;
  adjustStock: (payload: {
    productId: string;
    reason: StockAdjustmentReason;
    adjustmentQuantity: number;
    notes?: string;
  }) => Promise<boolean>;
  createReturn: (payload: any) => Promise<boolean>;
  updateReturn: (returnId: string, payload: any) => Promise<boolean>;
  assignDeliveryPartner: (
    orderId: string,
    partnerId: string,
    moveToDispatched?: boolean
  ) => Promise<{ success: boolean; data?: any; error?: string }>;
}

const WarehouseContext = createContext<WarehouseContextType | undefined>(undefined);

const OPERATIONAL_WAREHOUSE_ID = 'WH-BRAHMPURI-01';
const OPERATIONAL_WAREHOUSE_NAME = 'MR FUTKAR — BRAHMPURI';
const OPERATIONAL_BRANCH_NAME = 'Brahmpuri Branch';
const SERVICE_AREAS = ['Brahmpuri', 'Karawal Nagar', 'Yamuna Vihar', 'Seelampur', 'Shahdara', 'Bhajanpura'];

export const WarehouseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Authentication & Session State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return WarehouseClient.isAuthorized();
  });
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Staff Role & Identity (strictly resolved from server session)
  const [currentUser, setCurrentUser] = useState<WarehouseUser>(() => {
    const existing = WarehouseClient.getCurrentSession();
    if (existing) {
      return {
        userId: existing.uid,
        name: existing.name,
        email: existing.email,
        role: existing.role,
        warehouseId: OPERATIONAL_WAREHOUSE_ID,
        warehouseName: OPERATIONAL_WAREHOUSE_NAME,
        branchName: OPERATIONAL_BRANCH_NAME,
      };
    }
    return {
      userId: '',
      name: '',
      email: '',
      role: 'WAREHOUSE_STAFF' as any,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      warehouseName: OPERATIONAL_WAREHOUSE_NAME,
      branchName: OPERATIONAL_BRANCH_NAME,
    };
  });

  const loginWithSession = (session: WarehouseSession) => {
    WarehouseClient.setCurrentSession(session);
    WarehouseClient.setActiveUserId(session.uid);
    setCurrentUser({
      userId: session.uid,
      name: session.name,
      email: session.email,
      role: session.role,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      warehouseName: OPERATIONAL_WAREHOUSE_NAME,
      branchName: OPERATIONAL_BRANCH_NAME,
    });
    setIsAuthenticated(true);
    setAuthError(null);
  };

  const logout = () => {
    WarehouseClient.clearSession();
    setIsAuthenticated(false);
    setMetrics(null);
    setOrders([]);
    setInventory([]);
    setMovements([]);
    setReturns([]);
    setCurrentView('DASHBOARD');
  };

  // View state
  const [currentView, setCurrentView] = useState<WarehouseView>('DASHBOARD');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<WarehouseOrder | null>(null);
  const [selectedProductForAdjust, setSelectedProductForAdjust] = useState<WarehouseInventoryItem | null>(null);

  // Data states
  const [metrics, setMetrics] = useState<WarehouseDashboardMetrics | null>(null);
  const [orders, setOrders] = useState<WarehouseOrder[]>([]);
  const [inventory, setInventory] = useState<WarehouseInventoryItem[]>([]);
  const [movements, setMovements] = useState<StockMovementRecord[]>([]);
  const [returns, setReturns] = useState<WarehouseReturnRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('ALL');
  const [areaFilter, setAreaFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [stockStatusFilter, setStockStatusFilter] = useState<string>('ALL');

  const selectOrder = (orderId: string | null, targetView: WarehouseView = 'ORDER_DETAIL') => {
    setSelectedOrderId(orderId);
    if (orderId) {
      loadOrderDetail(orderId);
      setCurrentView(targetView);
    } else {
      setSelectedOrder(null);
    }
  };

  const openStockAdjustModal = (item: WarehouseInventoryItem | null) => {
    setSelectedProductForAdjust(item);
  };

  // Refresh functions
  const refreshMetrics = useCallback(async () => {
    if (!WarehouseClient.isAuthorized()) return;
    try {
      const data = await WarehouseClient.getMetrics();
      setMetrics(data);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('401') || msg.includes('403') || msg.includes('UNAUTHORIZED') || msg.includes('access denied')) {
        setIsAuthenticated(false);
        setError('Warehouse session expired. Please authenticate with staff credentials.');
      }
      console.warn('Note loading warehouse metrics:', err.message || err);
    }
  }, []);

  const refreshOrders = useCallback(async () => {
    if (!WarehouseClient.isAuthorized()) return;
    try {
      const data = await WarehouseClient.getOrders({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        paymentStatus: paymentStatusFilter !== 'ALL' ? paymentStatusFilter : undefined,
        deliveryArea: areaFilter !== 'ALL' ? areaFilter : undefined,
        search: searchQuery.trim() || undefined,
      });
      setOrders(data);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('401') || msg.includes('403') || msg.includes('UNAUTHORIZED') || msg.includes('access denied')) {
        setIsAuthenticated(false);
        setError('Warehouse session expired. Please authenticate with staff credentials.');
      }
      console.warn('Note loading orders:', err.message || err);
    }
  }, [statusFilter, paymentStatusFilter, areaFilter, searchQuery]);

  const refreshInventory = useCallback(async () => {
    if (!WarehouseClient.isAuthorized()) return;
    try {
      const data = await WarehouseClient.getInventory({
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        stockStatus: stockStatusFilter !== 'ALL' ? stockStatusFilter : undefined,
        search: searchQuery.trim() || undefined,
      });
      setInventory(data);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('401') || msg.includes('403') || msg.includes('UNAUTHORIZED') || msg.includes('access denied')) {
        setIsAuthenticated(false);
        setError('Warehouse session expired. Please authenticate with staff credentials.');
      }
      console.warn('Note loading inventory:', err.message || err);
    }
  }, [categoryFilter, stockStatusFilter, searchQuery]);

  const refreshMovements = useCallback(async () => {
    if (!WarehouseClient.isAuthorized()) return;
    try {
      const data = await WarehouseClient.getInventoryMovements();
      setMovements(data);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('401') || msg.includes('403') || msg.includes('UNAUTHORIZED') || msg.includes('access denied')) {
        setIsAuthenticated(false);
        setError('Warehouse session expired. Please authenticate with staff credentials.');
      }
      console.warn('Note loading movements:', err.message || err);
    }
  }, []);

  const refreshReturns = useCallback(async () => {
    if (!WarehouseClient.isAuthorized()) return;
    try {
      const data = await WarehouseClient.getReturns();
      setReturns(data);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('401') || msg.includes('403') || msg.includes('UNAUTHORIZED') || msg.includes('access denied')) {
        setIsAuthenticated(false);
        setError('Warehouse session expired. Please authenticate with staff credentials.');
      }
      console.warn('Note loading returns:', err.message || err);
    }
  }, []);

  const loadOrderDetail = async (orderId: string): Promise<WarehouseOrder | null> => {
    if (!WarehouseClient.isAuthorized()) return null;
    try {
      setIsLoading(true);
      const data = await WarehouseClient.getOrderDetail(orderId);
      setSelectedOrder(data);
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const refreshAll = useCallback(async () => {
    if (!WarehouseClient.isAuthorized()) return;
    setIsLoading(true);
    setError(null);
    try {
      await Promise.all([
        refreshMetrics(),
        refreshOrders(),
        refreshInventory(),
        refreshMovements(),
        refreshReturns(),
      ]);
    } catch (err: any) {
      setError(err.message || 'Error syncing warehouse state');
    } finally {
      setIsLoading(false);
    }
  }, [refreshMetrics, refreshOrders, refreshInventory, refreshMovements, refreshReturns]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshAll();
    }
  }, [isAuthenticated, refreshAll]);

  // Order transition action
  const transitionOrderStatus = async (
    orderId: string,
    newStatus: WarehouseOrderStatus,
    reason?: string
  ): Promise<boolean> => {
    try {
      setIsLoading(true);
      await WarehouseClient.updateOrderStatus(
        orderId,
        newStatus,
        reason,
        currentUser.userId,
        currentUser.name
      );
      await Promise.all([refreshMetrics(), refreshOrders(), loadOrderDetail(orderId)]);
      return true;
    } catch (err: any) {
      setError(err.message);
      alert(`Status update rejected: ${err.message}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Picking progress action
  const savePickingProgress = async (
    orderId: string,
    items: any,
    completePicking: boolean
  ): Promise<boolean> => {
    try {
      setIsLoading(true);
      await WarehouseClient.updatePicking(
        orderId,
        items,
        completePicking,
        currentUser.userId,
        currentUser.name
      );
      await Promise.all([refreshMetrics(), refreshOrders(), loadOrderDetail(orderId)]);
      return true;
    } catch (err: any) {
      setError(err.message);
      alert(`Picking update failed: ${err.message}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Packing action
  const savePackingInfo = async (orderId: string, payload: any): Promise<boolean> => {
    try {
      setIsLoading(true);
      await WarehouseClient.updatePacking(orderId, {
        ...payload,
        userId: currentUser.userId,
        userName: currentUser.name,
      });
      await Promise.all([refreshMetrics(), refreshOrders(), loadOrderDetail(orderId)]);
      return true;
    } catch (err: any) {
      setError(err.message);
      alert(`Packing update failed: ${err.message}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Stock Adjustment action
  const adjustStock = async (payload: {
    productId: string;
    reason: StockAdjustmentReason;
    adjustmentQuantity: number;
    notes?: string;
  }): Promise<boolean> => {
    try {
      setIsLoading(true);
      await WarehouseClient.adjustStock({
        ...payload,
        userId: currentUser.userId,
        userName: currentUser.name,
      });
      await Promise.all([refreshInventory(), refreshMovements(), refreshMetrics()]);
      setSelectedProductForAdjust(null);
      return true;
    } catch (err: any) {
      setError(err.message);
      alert(`Stock adjustment failed: ${err.message}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Returns actions
  const createReturn = async (payload: any): Promise<boolean> => {
    try {
      setIsLoading(true);
      await WarehouseClient.createReturn(payload);
      await refreshReturns();
      return true;
    } catch (err: any) {
      setError(err.message);
      alert(`Return creation failed: ${err.message}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const updateReturn = async (returnId: string, payload: any): Promise<boolean> => {
    try {
      setIsLoading(true);
      await WarehouseClient.updateReturnStatus(returnId, {
        ...payload,
        userId: currentUser.userId,
        userName: currentUser.name,
      });
      await Promise.all([refreshReturns(), refreshInventory(), refreshMovements()]);
      return true;
    } catch (err: any) {
      setError(err.message);
      alert(`Return status update failed: ${err.message}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const assignDeliveryPartner = async (
    orderId: string,
    partnerId: string,
    moveToDispatched = false
  ): Promise<{ success: boolean; data?: any; error?: string }> => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await WarehouseClient.assignDeliveryPartner(orderId, partnerId, moveToDispatched);
      await refreshOrders();
      return { success: true, data: res.data };
    } catch (err: any) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <WarehouseContext.Provider
      value={{
        warehouseId: OPERATIONAL_WAREHOUSE_ID,
        warehouseName: OPERATIONAL_WAREHOUSE_NAME,
        branchName: OPERATIONAL_BRANCH_NAME,
        serviceAreas: SERVICE_AREAS,
        isAuthenticated,
        isAuthChecking,
        authError,
        loginWithSession,
        logout,
        currentUser,
        currentView,
        setCurrentView,
        selectedOrderId,
        selectOrder,
        selectedProductForAdjust,
        openStockAdjustModal,
        metrics,
        orders,
        selectedOrder,
        inventory,
        movements,
        returns,
        isLoading,
        error,
        searchQuery,
        setSearchQuery,
        statusFilter,
        setStatusFilter,
        paymentStatusFilter,
        setPaymentStatusFilter,
        areaFilter,
        setAreaFilter,
        categoryFilter,
        setCategoryFilter,
        stockStatusFilter,
        setStockStatusFilter,
        refreshAll,
        refreshMetrics,
        refreshOrders,
        refreshInventory,
        refreshMovements,
        refreshReturns,
        loadOrderDetail,
        transitionOrderStatus,
        savePickingProgress,
        savePackingInfo,
        adjustStock,
        createReturn,
        updateReturn,
        assignDeliveryPartner,
      }}
    >
      {children}
    </WarehouseContext.Provider>
  );
};

export const useWarehouse = () => {
  const context = useContext(WarehouseContext);
  if (!context) {
    throw new Error('useWarehouse must be used within a WarehouseProvider');
  }
  return context;
};
