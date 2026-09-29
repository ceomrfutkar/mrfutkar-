import React, { useState, useEffect, useCallback } from 'react';
import { AdminClient } from '../../../services/adminClient';
import {
  AdminWarehouseHub,
  AdminWarehouseMetrics,
  AdminWarehouseOrder,
  AdminWarehouseStaff,
  AdminWarehouseActivity,
  WarehouseQueueType,
  AgingBucket,
} from '../../../types/adminWarehouse';
import { AdminWarehouseOverview } from './AdminWarehouseOverview';
import { AdminWarehouseQueues } from './AdminWarehouseQueues';
import { AdminWarehouseOrderDetailModal } from './AdminWarehouseOrderDetailModal';
import { AdminWarehouseStaffSection } from './AdminWarehouseStaffSection';
import { AdminWarehouseActivitySection } from './AdminWarehouseActivitySection';

export const AdminWarehouseScreen: React.FC = () => {
  // Hub & Operational Data
  const [hub, setHub] = useState<AdminWarehouseHub | null>(null);
  const [metrics, setMetrics] = useState<AdminWarehouseMetrics | null>(null);
  const [staff, setStaff] = useState<AdminWarehouseStaff[]>([]);
  const [activities, setActivities] = useState<AdminWarehouseActivity[]>([]);

  // Orders Queue State
  const [orders, setOrders] = useState<AdminWarehouseOrder[]>([]);
  const [totalOrders, setTotalOrders] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize] = useState<number>(25);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [queueCounts, setQueueCounts] = useState({
    acceptance: 0,
    picking: 0,
    packing: 0,
    dispatch: 0,
    all: 0,
  });

  // Filters
  const [activeQueue, setActiveQueue] = useState<WarehouseQueueType>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedAging, setSelectedAging] = useState<AgingBucket | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Selected Order for Detail Modal
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<AdminWarehouseOrder | null>(null);
  const [isOrderDetailLoading, setIsOrderDetailLoading] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Loading & Error States
  const [isLoadingMetrics, setIsLoadingMetrics] = useState<boolean>(true);
  const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(true);
  const [isLoadingStaff, setIsLoadingStaff] = useState<boolean>(true);
  const [isLoadingActivity, setIsLoadingActivity] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Load Warehouse Hub Profile & Operational Metrics
  const loadHubAndMetrics = useCallback(async () => {
    setIsLoadingMetrics(true);
    try {
      const [hubRes, metricsRes] = await Promise.all([
        AdminClient.fetchWarehouseHub(),
        AdminClient.fetchWarehouseMetrics(),
      ]);

      if (hubRes.success && hubRes.warehouse) {
        setHub(hubRes.warehouse);
      }
      if (metricsRes.success && metricsRes.metrics) {
        setMetrics(metricsRes.metrics);
      }
    } catch (err: any) {
      console.error('Failed to load warehouse overview:', err);
    } finally {
      setIsLoadingMetrics(false);
    }
  }, []);

  // 2. Load Warehouse Orders Queue with Filters
  const loadOrders = useCallback(async () => {
    setIsLoadingOrders(true);
    setErrorMessage(null);
    try {
      const res = await AdminClient.fetchWarehouseOrders({
        queue: activeQueue,
        status: selectedStatus,
        aging: selectedAging,
        search: searchTerm,
        page: currentPage,
        pageSize,
      });

      if (res.success && res.orders) {
        setOrders(res.orders);
        if (res.pagination) {
          setTotalOrders(res.pagination.total);
          setTotalPages(res.pagination.totalPages);
        }
        if (res.queueCounts) {
          setQueueCounts(res.queueCounts);
        }
      } else {
        setErrorMessage(res.message || 'Failed to load warehouse orders queue.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error fetching warehouse orders.');
    } finally {
      setIsLoadingOrders(false);
    }
  }, [activeQueue, selectedStatus, selectedAging, searchTerm, currentPage, pageSize]);

  // 3. Load Staff and Activity
  const loadStaffAndActivity = useCallback(async () => {
    setIsLoadingStaff(true);
    setIsLoadingActivity(true);
    try {
      const [staffRes, actRes] = await Promise.all([
        AdminClient.fetchWarehouseStaff(),
        AdminClient.fetchWarehouseActivity(),
      ]);

      if (staffRes.success && staffRes.staff) {
        setStaff(staffRes.staff);
      }
      if (actRes.success && actRes.activity) {
        setActivities(actRes.activity);
      }
    } catch (err: any) {
      console.error('Failed to load warehouse staff/activity:', err);
    } finally {
      setIsLoadingStaff(false);
      setIsLoadingActivity(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadHubAndMetrics();
    loadStaffAndActivity();
  }, [loadHubAndMetrics, loadStaffAndActivity]);

  // Orders re-fetch when filters or pagination changes
  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Handle Inspect Order click
  const handleInspectOrder = async (orderId: string) => {
    setSelectedOrderId(orderId);
    setIsModalOpen(true);
    setIsOrderDetailLoading(true);
    try {
      const res = await AdminClient.fetchWarehouseOrderDetail(orderId);
      if (res.success && res.order) {
        setSelectedOrder(res.order);
      }
    } catch (err) {
      console.error('Error fetching order detail modal:', err);
    } finally {
      setIsOrderDetailLoading(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedOrderId(null);
    setSelectedOrder(null);
  };

  const handleRefresh = () => {
    loadHubAndMetrics();
    loadOrders();
    loadStaffAndActivity();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">
            Warehouse Operations Console
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Authoritative visibility over hub fulfillment, picking & packing queues, dispatch staging, and SLA aging.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            type="button"
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors flex items-center gap-2"
          >
            <span>↻</span>
            <span>Refresh Hub Data</span>
          </button>
        </div>
      </div>

      {/* Error alert if any */}
      {errorMessage && (
        <div className="p-3.5 bg-rose-950/80 border border-rose-500/40 rounded-lg text-rose-300 text-xs flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 font-bold ml-4">✕</button>
        </div>
      )}

      {/* 1. Overview & Metrics */}
      <AdminWarehouseOverview
        metrics={metrics}
        hub={hub}
        isLoading={isLoadingMetrics}
        onSelectQueue={q => {
          setActiveQueue(q);
          setCurrentPage(1);
        }}
        activeQueue={activeQueue}
      />

      {/* 2. Operational Queues & Data Grid */}
      <AdminWarehouseQueues
        orders={orders}
        totalOrders={totalOrders}
        currentPage={currentPage}
        pageSize={pageSize}
        totalPages={totalPages}
        activeQueue={activeQueue}
        selectedStatus={selectedStatus}
        selectedAging={selectedAging}
        searchTerm={searchTerm}
        queueCounts={queueCounts}
        isLoading={isLoadingOrders}
        onSelectQueue={q => {
          setActiveQueue(q);
          setCurrentPage(1);
        }}
        onStatusChange={s => {
          setSelectedStatus(s);
          setCurrentPage(1);
        }}
        onAgingChange={a => {
          setSelectedAging(a);
          setCurrentPage(1);
        }}
        onSearchChange={t => {
          setSearchTerm(t);
          setCurrentPage(1);
        }}
        onPageChange={p => setCurrentPage(p)}
        onInspectOrder={handleInspectOrder}
      />

      {/* 3. Bottom Grid: Staff Directory + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminWarehouseStaffSection
          staff={staff}
          isLoading={isLoadingStaff}
        />
        <AdminWarehouseActivitySection
          activities={activities}
          isLoading={isLoadingActivity}
        />
      </div>

      {/* Order Detail Modal */}
      <AdminWarehouseOrderDetailModal
        order={selectedOrder}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        isLoading={isOrderDetailLoading}
      />
    </div>
  );
};
