import React, { useState, useEffect, useCallback } from 'react';
import { AdminClient } from '../../services/adminClient';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminStatCard } from '../../components/admin/AdminStatCard';
import {
  Package,
  Search,
  RefreshCw,
  Eye,
  Truck,
  CheckCircle2,
  Clock,
  Boxes,
  Send,
  XCircle,
  Building2,
  ArrowRight,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Store,
  Phone,
} from 'lucide-react';

interface AdminOrdersScreenProps {
  onSelectOrder: (orderId: string) => void;
  onOpenWarehouse?: () => void;
  onOpenDelivery?: () => void;
}

export const AdminOrdersScreen: React.FC<AdminOrdersScreenProps> = ({
  onSelectOrder,
  onOpenWarehouse,
  onOpenDelivery,
}) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [metrics, setMetrics] = useState({
    totalOrders: 0,
    placed: 0,
    warehouse: 0,
    readyForDispatch: 0,
    outForDelivery: 0,
    delivered: 0,
    cancelled: 0,
    totalGmv: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await AdminClient.fetchOrders({
        page,
        pageSize,
        search: searchTerm,
        status: statusFilter,
      });

      if (res.success && res.orders) {
        setOrders(res.orders);
        setTotalPages(res.totalPages || 1);
        setTotalCount(res.totalCount || 0);
        if (res.metrics) {
          setMetrics(res.metrics);
        }
      } else {
        setError(res.message || 'Failed to fetch orders.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching orders.');
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, searchTerm, statusFilter]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleStatusFilterChange = (newStatus: string) => {
    setStatusFilter(newStatus);
    setPage(1);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadOrders();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PLACED':
        return {
          bg: 'bg-amber-100 text-amber-800 border-amber-300',
          dot: 'bg-amber-500',
          label: '1. ORDER PLACED',
          icon: Clock,
        };
      case 'CONFIRMED':
      case 'ACCEPTED':
        return {
          bg: 'bg-sky-100 text-sky-800 border-sky-300',
          dot: 'bg-sky-500',
          label: '2. WAREHOUSE QUEUE',
          icon: Building2,
        };
      case 'PICKING':
        return {
          bg: 'bg-indigo-100 text-indigo-800 border-indigo-300',
          dot: 'bg-indigo-500',
          label: '3. PICKING',
          icon: Boxes,
        };
      case 'PACKED':
        return {
          bg: 'bg-blue-100 text-blue-800 border-blue-300',
          dot: 'bg-blue-500',
          label: '4. PACKED',
          icon: Package,
        };
      case 'READY_FOR_DISPATCH':
        return {
          bg: 'bg-purple-100 text-purple-800 border-purple-300',
          dot: 'bg-purple-500',
          label: '5. READY FOR DISPATCH',
          icon: Send,
        };
      case 'OUT_FOR_DELIVERY':
        return {
          bg: 'bg-orange-100 text-orange-800 border-orange-300',
          dot: 'bg-orange-500',
          label: '6. OUT FOR DELIVERY',
          icon: Truck,
        };
      case 'DELIVERED':
        return {
          bg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          dot: 'bg-emerald-500',
          label: '7. DELIVERED',
          icon: CheckCircle2,
        };
      case 'CANCELLED':
        return {
          bg: 'bg-rose-100 text-rose-800 border-rose-300',
          dot: 'bg-rose-500',
          label: 'CANCELLED',
          icon: XCircle,
        };
      default:
        return {
          bg: 'bg-slate-100 text-slate-800 border-slate-300',
          dot: 'bg-slate-400',
          label: status,
          icon: Package,
        };
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <AdminPageHeader
        title="Admin Order Console"
        subtitle="End-to-end operational lifecycle: Retailer Order → Central Warehouse (Picking/Packing) → Delivery Partner → Store Delivery"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadOrders}
              className="p-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors"
              title="Refresh Orders"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#f5b024]' : ''}`} />
            </button>
          </div>
        }
      />

      {/* Operational Pipeline Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div
          onClick={() => handleStatusFilterChange('ALL')}
          className={`cursor-pointer transition-all ${
            statusFilter === 'ALL' ? 'ring-2 ring-slate-900 ring-offset-2' : ''
          }`}
        >
          <AdminStatCard
            label="Total Orders"
            value={metrics.totalOrders}
            icon="📦"
            subValue={`₹${metrics.totalGmv.toLocaleString('en-IN')} GMV`}
          />
        </div>

        <div
          onClick={() => handleStatusFilterChange('PLACED')}
          className={`cursor-pointer transition-all ${
            statusFilter === 'PLACED' ? 'ring-2 ring-amber-500 ring-offset-2' : ''
          }`}
        >
          <AdminStatCard
            label="1. Placed"
            value={metrics.placed}
            icon="⏳"
            subValue="New from Retailers"
          />
        </div>

        <div
          onClick={() => handleStatusFilterChange('WAREHOUSE')}
          className={`cursor-pointer transition-all ${
            statusFilter === 'WAREHOUSE' ? 'ring-2 ring-sky-500 ring-offset-2' : ''
          }`}
        >
          <AdminStatCard
            label="2. Warehouse"
            value={metrics.warehouse}
            icon="🏭"
            subValue="Picking & Packing"
          />
        </div>

        <div
          onClick={() => handleStatusFilterChange('READY_FOR_DISPATCH')}
          className={`cursor-pointer transition-all ${
            statusFilter === 'READY_FOR_DISPATCH' ? 'ring-2 ring-purple-500 ring-offset-2' : ''
          }`}
        >
          <AdminStatCard
            label="3. Ready Dispatch"
            value={metrics.readyForDispatch}
            icon="🚀"
            subValue="Staged for Fleet"
          />
        </div>

        <div
          onClick={() => handleStatusFilterChange('OUT_FOR_DELIVERY')}
          className={`cursor-pointer transition-all ${
            statusFilter === 'OUT_FOR_DELIVERY' ? 'ring-2 ring-orange-500 ring-offset-2' : ''
          }`}
        >
          <AdminStatCard
            label="4. Out for Delivery"
            value={metrics.outForDelivery}
            icon="🚚"
            subValue="Transit to Counter"
          />
        </div>

        <div
          onClick={() => handleStatusFilterChange('DELIVERED')}
          className={`cursor-pointer transition-all ${
            statusFilter === 'DELIVERED' ? 'ring-2 ring-emerald-500 ring-offset-2' : ''
          }`}
        >
          <AdminStatCard
            label="5. Delivered"
            value={metrics.delivered}
            icon="✅"
            subValue="Verified with OTP"
          />
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by Order ID, Retailer, Shop, Phone, SKU..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#f5b024] focus:border-[#f5b024]"
            />
          </form>

          {/* Quick status tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none text-xs font-semibold">
            {[
              { id: 'ALL', label: 'All Orders' },
              { id: 'PLACED', label: 'Placed' },
              { id: 'WAREHOUSE', label: 'In Warehouse' },
              { id: 'READY_FOR_DISPATCH', label: 'Ready Dispatch' },
              { id: 'OUT_FOR_DELIVERY', label: 'On Route' },
              { id: 'DELIVERED', label: 'Delivered' },
              { id: 'CANCELLED', label: 'Cancelled' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleStatusFilterChange(tab.id)}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-slate-900 text-white font-bold shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
          {error}
        </div>
      )}

      {/* Orders Table Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                <th className="py-3 px-4">Order ID & Date</th>
                <th className="py-3 px-4">Retailer & Kirana Store</th>
                <th className="py-3 px-4">Items</th>
                <th className="py-3 px-4">Amount & Payment</th>
                <th className="py-3 px-4">Workflow Pipeline</th>
                <th className="py-3 px-4">Logistics</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {isLoading && orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#f5b024]" />
                    Loading orders...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    No orders match the selected filters.
                  </td>
                </tr>
              ) : (
                orders.map(order => {
                  const badge = getStatusBadge(order.orderStatus);
                  const Icon = badge.icon;
                  const formattedDate = new Date(order.createdAt).toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr
                      key={order.orderId}
                      onClick={() => onSelectOrder(order.orderId)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      {/* Order ID & Date */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span>{order.orderId}</span>
                        </div>
                        <div className="text-[11px] font-sans font-normal text-slate-400">
                          {formattedDate}
                        </div>
                      </td>

                      {/* Retailer & Store */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 flex items-center gap-1">
                          <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{order.shopName}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <span>{order.retailerName}</span>
                          {order.phone && (
                            <span className="text-slate-400 flex items-center gap-0.5 ml-1">
                              • <Phone className="w-2.5 h-2.5 inline" /> {order.phone}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Items */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800">
                          {order.itemCount} line items ({order.itemsCountTotal} units)
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-xs">
                          {order.itemsPreview?.map((it: any) => `${it.productName} (x${it.quantity})`).join(', ')}
                        </div>
                      </td>

                      {/* Amount & Payment */}
                      <td className="py-3.5 px-4">
                        <div className="font-extrabold text-slate-900 text-sm">
                          ₹{order.grandTotal.toLocaleString('en-IN')}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                            {order.paymentMethod}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              order.paymentStatus === 'PAID'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {order.paymentStatus}
                          </span>
                        </div>
                      </td>

                      {/* Pipeline Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold border ${badge.bg}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          <Icon className="w-3 h-3" />
                          <span>{badge.label}</span>
                        </span>
                      </td>

                      {/* Logistics */}
                      <td className="py-3.5 px-4 text-[11px]">
                        <div className="font-semibold text-slate-800 flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          <span>WH-BRAHMPURI-01</span>
                        </div>
                        <div className="text-slate-500 flex items-center gap-1 mt-0.5">
                          <Truck className="w-3 h-3 text-slate-400" />
                          <span>{order.deliveryPartnerName || 'Unassigned'}</span>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            onSelectOrder(order.orderId);
                          }}
                          className="px-3 py-1.5 bg-[#0d1d25] text-[#f5b024] hover:bg-slate-800 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                        >
                          <span>Manage</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div>
            Showing <span className="font-bold">{orders.length}</span> of{' '}
            <span className="font-bold">{totalCount}</span> orders
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold px-2">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
