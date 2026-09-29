import React, { useState, useEffect, useCallback } from 'react';
import { AdminClient } from '../../services/adminClient';
import { AdminStatCard } from '../../components/admin/AdminStatCard';
import { AdminStatusBadge } from '../../components/admin/AdminStatusBadge';

interface RetailerRow {
  retailerId: string;
  businessName: string;
  shopName: string;
  ownerName: string;
  mobile: string;
  email?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
  isActive: boolean;
  address: string;
  landmark?: string;
  city: string;
  pincode: string;
  createdAt: string;
  totalOrders?: number;
  totalPurchase?: number;
  lastOrder?: string | null;
  registeredDate?: string;
}

interface AdminRetailersScreenProps {
  onSelectRetailer: (retailerId: string) => void;
}

export const AdminRetailersScreen: React.FC<AdminRetailersScreenProps> = ({ onSelectRetailer }) => {
  const [retailers, setRetailers] = useState<RetailerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [activityFilter, setActivityFilter] = useState<'ALL' | 'ORDERED_RECENTLY' | 'NO_RECENT_ORDER'>('ALL');
  const [cityFilter, setCityFilter] = useState('');
  const [pincodeFilter, setPincodeFilter] = useState('');

  // Mutation modal state
  const [pendingDeactivate, setPendingDeactivate] = useState<RetailerRow | null>(null);
  const [pendingActivate, setPendingActivate] = useState<RetailerRow | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Quick stats derived from loaded list
  const totalCount = total;
  const activeCount = retailers.filter(r => r.status === 'ACTIVE' && r.isActive).length;
  const inactiveCount = retailers.filter(r => r.status === 'INACTIVE' || !r.isActive).length;

  const fetchRetailers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await AdminClient.getRetailers({
        page,
        pageSize,
        search: search.trim() || undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        activity: activityFilter !== 'ALL' ? activityFilter : undefined,
        city: cityFilter.trim() || undefined,
        pincode: pincodeFilter.trim() || undefined,
      });

      if (res.success && Array.isArray(res.retailers)) {
        setRetailers(res.retailers);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
      } else {
        setError(res.message || 'Failed to load retailers.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading retailers.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, activityFilter, cityFilter, pincodeFilter]);

  useEffect(() => {
    fetchRetailers();
  }, [fetchRetailers]);

  // Handle deactivation
  const handleConfirmDeactivate = async () => {
    if (!pendingDeactivate) return;
    setSubmittingAction(true);
    try {
      const res = await AdminClient.deactivateRetailer(pendingDeactivate.retailerId, actionReason.trim() || undefined);
      if (res.success) {
        setActionMessage({
          text: `Retailer ${pendingDeactivate.businessName || pendingDeactivate.shopName} deactivated successfully.`,
          type: 'success',
        });
        setPendingDeactivate(null);
        setActionReason('');
        fetchRetailers();
      } else {
        setActionMessage({ text: res.message || 'Failed to deactivate retailer.', type: 'error' });
      }
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Error executing deactivation.', type: 'error' });
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle activation
  const handleConfirmActivate = async () => {
    if (!pendingActivate) return;
    setSubmittingAction(true);
    try {
      const res = await AdminClient.activateRetailer(pendingActivate.retailerId, actionReason.trim() || undefined);
      if (res.success) {
        setActionMessage({
          text: `Retailer ${pendingActivate.businessName || pendingActivate.shopName} activated successfully.`,
          type: 'success',
        });
        setPendingActivate(null);
        setActionReason('');
        fetchRetailers();
      } else {
        setActionMessage({ text: res.message || 'Failed to activate retailer.', type: 'error' });
      }
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Error executing activation.', type: 'error' });
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleClearFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setActivityFilter('ALL');
    setCityFilter('');
    setPincodeFilter('');
    setPage(1);
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return 'None';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return 'None';
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return 'None';
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm font-medium animate-slide-down ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="text-xs px-2 py-1 rounded hover:bg-black/5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Screen Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <span>🏪</span> Retailer Management / CRM
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Authoritative B2B kirana directory, accounts, purchasing summaries, and contract pricing.
          </p>
        </div>
        <button
          onClick={() => fetchRetailers()}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-xs transition-colors self-start sm:self-auto"
        >
          <span className="text-base">🔄</span> Refresh
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminStatCard
          label="Total Registered Retailers"
          value={totalCount}
          icon="🏪"
          subLabel="Master retailer collection"
        />
        <AdminStatCard
          label="Active Retailers"
          value={activeCount}
          icon="✅"
          subLabel="Authorized to place wholesale orders"
        />
        <AdminStatCard
          label="Inactive / Suspended"
          value={inactiveCount}
          icon="⏸️"
          subLabel="Blocked from placing orders"
        />
        <AdminStatCard
          label="Current Page / Total"
          value={`${page} / ${totalPages}`}
          icon="📄"
          subLabel={`${pageSize} records per page`}
        />
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Main Search */}
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Search Retailers
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                🔍
              </span>
              <input
                type="text"
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Business name, owner, phone, ID, area, pincode..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#f5b024] focus:border-transparent"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Account Status
            </label>
            <select
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value as any);
                setPage(1);
              }}
              className="w-full py-2 px-3 text-sm rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#f5b024] focus:border-transparent bg-white"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>
          </div>

          {/* Activity Filter */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Order Activity
            </label>
            <select
              value={activityFilter}
              onChange={e => {
                setActivityFilter(e.target.value as any);
                setPage(1);
              }}
              className="w-full py-2 px-3 text-sm rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#f5b024] focus:border-transparent bg-white"
            >
              <option value="ALL">All Activity</option>
              <option value="ORDERED_RECENTLY">Ordered Recently (30d)</option>
              <option value="NO_RECENT_ORDER">No Orders in 30d</option>
            </select>
          </div>
        </div>

        {/* Secondary filters row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              City
            </label>
            <input
              type="text"
              value={cityFilter}
              onChange={e => {
                setCityFilter(e.target.value);
                setPage(1);
              }}
              placeholder="Filter by city (e.g. Jaipur)"
              className="w-full py-1.5 px-3 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#f5b024]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Pincode
            </label>
            <input
              type="text"
              value={pincodeFilter}
              onChange={e => {
                setPincodeFilter(e.target.value);
                setPage(1);
              }}
              placeholder="e.g. 302002"
              className="w-full py-1.5 px-3 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#f5b024]"
            />
          </div>

          <div className="sm:col-span-1 lg:col-span-2 flex items-end justify-end gap-2">
            {(search || statusFilter !== 'ALL' || activityFilter !== 'ALL' || cityFilter || pincodeFilter) && (
              <button
                onClick={handleClearFilters}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                Clear All Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Retailer Table & Content */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <div className="inline-block w-8 h-8 border-4 border-[#f5b024] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm font-medium">Loading retailers from authoritative database...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">
            <span className="text-3xl block mb-2">⚠️</span>
            <p className="font-semibold">{error}</p>
            <button
              onClick={() => fetchRetailers()}
              className="mt-4 px-4 py-2 text-xs font-bold rounded-lg bg-slate-900 text-white hover:bg-slate-800"
            >
              Try Again
            </button>
          </div>
        ) : retailers.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <span className="text-4xl block mb-2">🏪</span>
            <h3 className="text-base font-bold text-slate-800">No Retailers Found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              No retailers matched your current search and filter criteria. Try adjusting the query or clearing filters.
            </p>
            <button
              onClick={handleClearFilters}
              className="mt-4 px-3.5 py-1.5 text-xs font-semibold text-[#0d1d25] bg-[#f5b024] rounded-lg hover:bg-amber-400 transition-colors"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px] tracking-wider">
                    <th className="py-3 px-4">Business / Shop</th>
                    <th className="py-3 px-4">Owner</th>
                    <th className="py-3 px-4">Mobile</th>
                    <th className="py-3 px-4">Area & Pincode</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Orders</th>
                    <th className="py-3 px-4 text-right">Total Purchase</th>
                    <th className="py-3 px-4">Last Order</th>
                    <th className="py-3 px-4">Registered</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {retailers.map(ret => {
                    const isActive = ret.status === 'ACTIVE' && ret.isActive;
                    return (
                      <tr
                        key={ret.retailerId}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">
                            {ret.businessName || ret.shopName || 'Retailer'}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {ret.retailerId}
                          </div>
                        </td>
                        <td className="py-3 px-4">{ret.ownerName || '—'}</td>
                        <td className="py-3 px-4 font-mono">{ret.mobile || '—'}</td>
                        <td className="py-3 px-4">
                          <div>{ret.city || 'Jaipur'}</div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {ret.pincode || '—'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <AdminStatusBadge status={isActive ? 'ACTIVE' : 'INACTIVE'} />
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold">
                          {ret.totalOrders ?? 0}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          ₹{(ret.totalPurchase ?? 0).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px]">
                          {formatDate(ret.lastOrder)}
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px]">
                          {formatDate(ret.registeredDate || ret.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1">
                          <button
                            onClick={() => onSelectRetailer(ret.retailerId)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-2xs"
                          >
                            View
                          </button>
                          {isActive ? (
                            <button
                              onClick={() => {
                                setPendingDeactivate(ret);
                                setActionReason('');
                              }}
                              className="px-2.5 py-1 text-xs font-semibold rounded-md border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setPendingActivate(ret);
                                setActionReason('');
                              }}
                              className="px-2.5 py-1 text-xs font-semibold rounded-md border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors"
                            >
                              Activate
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span>Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="py-1 px-2 text-xs rounded border border-slate-300 bg-white"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="text-slate-400">|</span>
                <span>
                  Showing {Math.min((page - 1) * pageSize + 1, total)} -{' '}
                  {Math.min(page * pageSize, total)} of {total} retailers
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                >
                  Previous
                </button>
                <span className="font-semibold text-slate-800">
                  {page} / {totalPages || 1}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="px-3 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Deactivate Modal */}
      {pendingDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xl shrink-0">
                ⚠️
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Deactivate Retailer Account
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Retailer: <span className="font-semibold text-slate-800">{pendingDeactivate.businessName || pendingDeactivate.shopName}</span> ({pendingDeactivate.retailerId})
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
              <p className="font-bold">Deactivate this retailer?</p>
              <p>The retailer will no longer be able to place new wholesale orders.</p>
              <p className="text-[11px] text-amber-700">Existing order history and address records remain preserved.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Deactivation Reason (Optional)
              </label>
              <input
                type="text"
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                placeholder="e.g. Account verification pending, Retailer requested"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={submittingAction}
                onClick={() => {
                  setPendingDeactivate(null);
                  setActionReason('');
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingAction}
                onClick={handleConfirmDeactivate}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-red-600 text-white hover:bg-red-700 shadow-sm disabled:opacity-50"
              >
                {submittingAction ? 'Deactivating...' : 'Confirm Deactivation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activate Modal */}
      {pendingActivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl shrink-0">
                ✅
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Activate Retailer Account
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Retailer: <span className="font-semibold text-slate-800">{pendingActivate.businessName || pendingActivate.shopName}</span> ({pendingActivate.retailerId})
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
              <p className="font-bold">Activate this retailer?</p>
              <p>The retailer will be granted immediate permission to place new wholesale orders.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Activation Note (Optional)
              </label>
              <input
                type="text"
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                placeholder="e.g. KYC verified, Account reactivated"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={submittingAction}
                onClick={() => {
                  setPendingActivate(null);
                  setActionReason('');
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingAction}
                onClick={handleConfirmActivate}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm disabled:opacity-50"
              >
                {submittingAction ? 'Activating...' : 'Confirm Activation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
