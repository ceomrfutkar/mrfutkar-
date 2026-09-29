import React, { useState, useEffect, useCallback } from 'react';
import { AdminClient } from '../../services/adminClient';
import { AdminStatCard } from '../../components/admin/AdminStatCard';
import { AdminCodHandoverQueue } from '../../components/admin/AdminCodHandoverQueue';
import { AdminDeliveryPartnerRow, AdminDeliveryPartnerSummaryStats } from '../../types/admin';
import {
  Truck,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Phone,
  IndianRupee,
  PackageCheck,
  Eye,
  Power,
  Ban,
  UserCheck,
} from 'lucide-react';

interface AdminDeliveryPartnersScreenProps {
  onSelectPartner: (partnerId: string) => void;
}

export const AdminDeliveryPartnersScreen: React.FC<AdminDeliveryPartnersScreenProps> = ({
  onSelectPartner,
}) => {
  const [partners, setPartners] = useState<AdminDeliveryPartnerRow[]>([]);
  const [summary, setSummary] = useState<AdminDeliveryPartnerSummaryStats>({
    totalPartners: 0,
    activePartners: 0,
    availablePartners: 0,
    onDeliveryPartners: 0,
    suspendedPartners: 0,
    inactivePartners: 0,
    totalActiveDeliveries: 0,
    totalDeliveredToday: 0,
    totalPendingCodAmount: 0,
    totalPendingCodCount: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeMainTab, setActiveMainTab] = useState<'FLEET' | 'COD_HANDOVERS'>('FLEET');

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'>('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState<'ALL' | 'AVAILABLE' | 'ON_DELIVERY' | 'OFFLINE' | 'PAUSED'>('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [hasActiveDelivery, setHasActiveDelivery] = useState(false);
  const [hasPendingCod, setHasPendingCod] = useState(false);

  // Action Modals State
  const [pendingAction, setPendingAction] = useState<{
    type: 'ACTIVATE' | 'DEACTIVATE' | 'SUSPEND';
    partner: AdminDeliveryPartnerRow;
  } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const fetchPartners = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await AdminClient.getDeliveryPartners({
        page,
        pageSize,
        search: search.trim() || undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        availabilityStatus: availabilityFilter !== 'ALL' ? availabilityFilter : undefined,
        warehouseId: warehouseFilter || undefined,
        hasActiveDelivery: hasActiveDelivery ? true : undefined,
        hasPendingCod: hasPendingCod ? true : undefined,
      });

      if (res.success && Array.isArray(res.partners)) {
        setPartners(res.partners);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
        if (res.summary) {
          setSummary(res.summary);
        }
      } else {
        setError(res.message || 'Failed to load delivery partners.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred while loading fleet partners.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, availabilityFilter, warehouseFilter, hasActiveDelivery, hasPendingCod]);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  // Execute Activation / Deactivation / Suspension
  const handleExecuteAction = async () => {
    if (!pendingAction) return;
    setSubmittingAction(true);
    setActionFeedback(null);

    const { type, partner } = pendingAction;
    try {
      let res: any;
      if (type === 'ACTIVATE') {
        res = await AdminClient.activateDeliveryPartner(partner.partnerId, actionReason.trim() || undefined);
      } else if (type === 'DEACTIVATE') {
        res = await AdminClient.deactivateDeliveryPartner(partner.partnerId, actionReason.trim() || undefined);
      } else if (type === 'SUSPEND') {
        res = await AdminClient.suspendDeliveryPartner(partner.partnerId, actionReason.trim() || undefined);
      }

      if (res?.success) {
        setActionFeedback({
          type: 'success',
          message: res.message || `Partner ${type.toLowerCase()}d successfully.`,
        });
        setPendingAction(null);
        setActionReason('');
        await fetchPartners();
      } else {
        setActionFeedback({
          type: 'error',
          message: res?.message || `Failed to ${type.toLowerCase()} partner.`,
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: err.message || 'Action failed due to network or server error.',
      });
    } finally {
      setSubmittingAction(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#f5b024]/15 text-[#f5b024] flex items-center justify-center font-bold">
              <Truck className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Delivery Partner Fleet
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Authoritative fleet operations, active workload tracking, COD reconciliation, and partner status management.
          </p>
        </div>

        <button
          onClick={() => fetchPartners()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Fleet
        </button>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveMainTab('FLEET')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeMainTab === 'FLEET'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          <span>Fleet Directory ({summary.totalPartners})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('COD_HANDOVERS')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeMainTab === 'COD_HANDOVERS'
              ? 'bg-purple-900 text-white'
              : 'text-purple-700 hover:bg-purple-50'
          }`}
        >
          <IndianRupee className="w-3.5 h-3.5" />
          <span>Admin COD Handover Queue</span>
        </button>
      </div>

      {activeMainTab === 'COD_HANDOVERS' ? (
        <AdminCodHandoverQueue />
      ) : (
        <>
          {/* Global Action Banner Toast */}
      {actionFeedback && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between shadow-sm border ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Fleet Overview Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <AdminStatCard
          label="Total Fleet"
          value={summary.totalPartners}
          subLabel="Registered partners"
          icon="🚚"
          accentColor="#0284c7"
        />
        <AdminStatCard
          label="Active Fleet"
          value={summary.activePartners}
          subLabel="Permitted for dispatch"
          icon="✅"
          accentColor="#10b981"
        />
        <AdminStatCard
          label="Available Now"
          value={summary.availablePartners}
          subLabel="Ready for assignment"
          icon="🟢"
          accentColor="#14b8a6"
        />
        <AdminStatCard
          label="On Delivery"
          value={summary.onDeliveryPartners}
          subLabel={`${summary.totalActiveDeliveries} active order(s)`}
          icon="📦"
          accentColor="#f59e0b"
        />
        <AdminStatCard
          label="Suspended / Inactive"
          value={summary.suspendedPartners + summary.inactivePartners}
          subLabel={`${summary.suspendedPartners} suspended`}
          icon="⛔"
          accentColor="#ef4444"
        />
        <AdminStatCard
          label="Pending COD"
          value={`₹${summary.totalPendingCodAmount.toLocaleString('en-IN')}`}
          subLabel={`${summary.totalPendingCodCount} order(s) pending`}
          icon="💰"
          accentColor="#d97706"
        />
      </div>

      {/* Search and Filters Section */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search partner name, ID, mobile, vehicle..."
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#f5b024]/50 focus:border-amber-500"
            />
          </div>

          {/* Account Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value as any);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#f5b024]/50"
            >
              <option value="ALL">All Account Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
              <option value="SUSPENDED">Suspended Only</option>
            </select>
          </div>

          {/* Availability Status Filter */}
          <div>
            <select
              value={availabilityFilter}
              onChange={e => {
                setAvailabilityFilter(e.target.value as any);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#f5b024]/50"
            >
              <option value="ALL">All Availabilities</option>
              <option value="AVAILABLE">Available</option>
              <option value="ON_DELIVERY">On Delivery</option>
              <option value="OFFLINE">Offline</option>
              <option value="PAUSED">Paused</option>
            </select>
          </div>

          {/* Warehouse Filter */}
          <div>
            <select
              value={warehouseFilter}
              onChange={e => {
                setWarehouseFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#f5b024]/50"
            >
              <option value="">All Warehouses</option>
              <option value="WH-BRAHMPURI-01">MR FUTKAR — Brahmpuri (WH-BRAHMPURI-01)</option>
            </select>
          </div>
        </div>

        {/* Quick Toggles */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
          <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={hasActiveDelivery}
              onChange={e => {
                setHasActiveDelivery(e.target.checked);
                setPage(1);
              }}
              className="w-4 h-4 rounded-sm border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            Has Active Delivery
          </label>

          <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={hasPendingCod}
              onChange={e => {
                setHasPendingCod(e.target.checked);
                setPage(1);
              }}
              className="w-4 h-4 rounded-sm border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            Has Pending COD
          </label>

          {(search || statusFilter !== 'ALL' || availabilityFilter !== 'ALL' || warehouseFilter || hasActiveDelivery || hasPendingCod) && (
            <button
              onClick={() => {
                setSearch('');
                setStatusFilter('ALL');
                setAvailabilityFilter('ALL');
                setWarehouseFilter('');
                setHasActiveDelivery(false);
                setHasPendingCod(false);
                setPage(1);
              }}
              className="text-xs text-amber-600 hover:text-amber-700 font-bold ml-auto cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Delivery Partners Table Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-[#f5b024]" />
            <span>Loading delivery fleet partners...</span>
          </div>
        ) : partners.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
            <Truck className="w-8 h-8 text-slate-300" />
            <p className="font-bold text-slate-700">No delivery partners found.</p>
            <p className="text-slate-400">Try adjusting your search criteria or filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Partner</th>
                  <th className="py-3 px-4">Mobile</th>
                  <th className="py-3 px-4">Warehouse</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Availability</th>
                  <th className="py-3 px-4 text-center">Active Orders</th>
                  <th className="py-3 px-4 text-center">Delivered Today</th>
                  <th className="py-3 px-4 text-right">Pending COD</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {partners.map(p => {
                  const isSuspended = p.status === 'SUSPENDED';
                  const isInactive = p.status === 'INACTIVE';
                  const isActive = p.status === 'ACTIVE';

                  return (
                    <tr key={p.partnerId} className="hover:bg-slate-50/70 transition-colors">
                      {/* Partner Name & Vehicle */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          {p.name}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <span className="font-mono text-slate-600">{p.partnerId}</span>
                          <span>•</span>
                          <span>{p.vehicleType}</span>
                          <span>•</span>
                          <span className="font-mono">{p.vehicleNumber}</span>
                        </div>
                      </td>

                      {/* Mobile */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>+91 {p.mobile}</span>
                        </div>
                        {p.alternateMobile && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Alt: +91 {p.alternateMobile}
                          </div>
                        )}
                      </td>

                      {/* Warehouse */}
                      <td className="py-3 px-4 text-slate-700">
                        <div className="font-semibold text-slate-800">
                          {p.assignedWarehouseName || 'MR FUTKAR — Brahmpuri'}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {p.assignedWarehouseId}
                        </div>
                      </td>

                      {/* Account Status */}
                      <td className="py-3 px-4">
                        {isActive && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            ACTIVE
                          </span>
                        )}
                        {isInactive && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-stone-100 text-stone-600 border border-stone-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-stone-400"></span>
                            INACTIVE
                          </span>
                        )}
                        {isSuspended && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                            SUSPENDED
                          </span>
                        )}
                      </td>

                      {/* Availability Status */}
                      <td className="py-3 px-4">
                        {p.availabilityStatus === 'AVAILABLE' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            AVAILABLE
                          </span>
                        )}
                        {p.availabilityStatus === 'ON_DELIVERY' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                            ON DELIVERY
                          </span>
                        )}
                        {p.availabilityStatus === 'OFFLINE' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300">
                            OFFLINE
                          </span>
                        )}
                        {p.availabilityStatus === 'PAUSED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            PAUSED
                          </span>
                        )}
                      </td>

                      {/* Active Orders Count */}
                      <td className="py-3 px-4 text-center">
                        {p.activeOrdersCount > 0 ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-200">
                            {p.activeOrdersCount}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">0</span>
                        )}
                      </td>

                      {/* Delivered Today Count */}
                      <td className="py-3 px-4 text-center">
                        {p.deliveredTodayCount > 0 ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
                            {p.deliveredTodayCount}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">0</span>
                        )}
                      </td>

                      {/* Pending COD */}
                      <td className="py-3 px-4 text-right">
                        {p.pendingCodAmount > 0 ? (
                          <div>
                            <div className="font-extrabold text-amber-900">
                              ₹{p.pendingCodAmount.toLocaleString('en-IN')}
                            </div>
                            <div className="text-[10px] text-amber-700">
                              {p.pendingCodCount} order(s)
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectPartner(p.partnerId)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold cursor-pointer transition-colors shadow-2xs"
                            title="View Partner Profile and History"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View</span>
                          </button>

                          {/* Activate Button */}
                          {(isInactive || isSuspended) && (
                            <button
                              type="button"
                              onClick={() => setPendingAction({ type: 'ACTIVATE', partner: p })}
                              className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-pointer transition-colors"
                              title="Activate Partner"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Deactivate Button */}
                          {isActive && (
                            <button
                              type="button"
                              onClick={() => setPendingAction({ type: 'DEACTIVATE', partner: p })}
                              className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 cursor-pointer transition-colors"
                              title="Deactivate Partner"
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Suspend Button */}
                          {!isSuspended && (
                            <button
                              type="button"
                              onClick={() => setPendingAction({ type: 'SUSPEND', partner: p })}
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer transition-colors"
                              title="Suspend Partner"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 font-medium">
          <div>
            Showing <span className="font-bold text-slate-900">{partners.length}</span> of{' '}
            <span className="font-bold text-slate-900">{total}</span> delivery partners
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500">Rows per page:</span>
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-semibold focus:outline-hidden"
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>

            <div className="flex items-center gap-1 ml-2">
              <button
                type="button"
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                aria-label="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-bold text-slate-800">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                aria-label="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Action Confirmation Modal (Activate / Deactivate / Suspend) */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div
              className={`p-5 text-white ${
                pendingAction.type === 'ACTIVATE'
                  ? 'bg-emerald-600'
                  : pendingAction.type === 'DEACTIVATE'
                  ? 'bg-stone-700'
                  : 'bg-rose-600'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {pendingAction.type === 'ACTIVATE' && <UserCheck className="w-5 h-5" />}
                {pendingAction.type === 'DEACTIVATE' && <Power className="w-5 h-5" />}
                {pendingAction.type === 'SUSPEND' && <ShieldAlert className="w-5 h-5" />}
                <h3 className="text-base font-bold">
                  {pendingAction.type === 'ACTIVATE' && 'Activate Delivery Partner'}
                  {pendingAction.type === 'DEACTIVATE' && 'Deactivate Delivery Partner'}
                  {pendingAction.type === 'SUSPEND' && 'Suspend Delivery Partner'}
                </h3>
              </div>
              <p className="text-xs opacity-90 mt-1">
                {pendingAction.partner.name} ({pendingAction.partner.partnerId})
              </p>
            </div>

            <div className="p-5 space-y-4">
              {/* Safety Notice for Deactivation/Suspension */}
              {(pendingAction.type === 'DEACTIVATE' || pendingAction.type === 'SUSPEND') && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                  <div className="font-bold flex items-center gap-1.5 mb-1">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    Safety Check: Active Deliveries
                  </div>
                  <p>
                    Partners with active assigned deliveries cannot be {pendingAction.type.toLowerCase()}d. The server will reject the operation if active orders remain.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Reason for {pendingAction.type.toLowerCase()} (optional, recorded in audit logs):
                </label>
                <textarea
                  rows={3}
                  value={actionReason}
                  onChange={e => setActionReason(e.target.value)}
                  placeholder={`Enter reason for partner ${pendingAction.type.toLowerCase()}...`}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#f5b024]/50"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setPendingAction(null);
                    setActionReason('');
                  }}
                  disabled={submittingAction}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteAction}
                  disabled={submittingAction}
                  className={`px-4 py-2 rounded-lg text-xs font-bold text-white shadow-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5 ${
                    pendingAction.type === 'ACTIVATE'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : pendingAction.type === 'DEACTIVATE'
                      ? 'bg-stone-700 hover:bg-stone-800'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {submittingAction ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <span>Confirm {pendingAction.type}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
