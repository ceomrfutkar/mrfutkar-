import React, { useState, useEffect, useCallback } from 'react';
import { AdminClient } from '../../services/adminClient';
import {
  AdminDeliveryPartnerRow,
  AdminDeliveryPartnerDetailWorkload,
  AdminDeliveryPartnerDetailHistory,
  AdminDeliveryPartnerDetailCod,
  AdminDeliveryPartnerPerformance,
} from '../../types/admin';
import {
  Truck,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Phone,
  Calendar,
  Clock,
  IndianRupee,
  ShieldCheck,
  Package,
  FileText,
  UserCheck,
  Power,
  Ban,
  Activity,
  History,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface AdminDeliveryPartnerDetailScreenProps {
  partnerId: string;
  onBack: () => void;
  onNavigateToOrder?: (orderId: string) => void;
}

export const AdminDeliveryPartnerDetailScreen: React.FC<AdminDeliveryPartnerDetailScreenProps> = ({
  partnerId,
  onBack,
  onNavigateToOrder,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [partner, setPartner] = useState<AdminDeliveryPartnerRow | null>(null);
  const [workload, setWorkload] = useState<AdminDeliveryPartnerDetailWorkload>({
    assignedCount: 0,
    acceptedCount: 0,
    pickedUpCount: 0,
    outForDeliveryCount: 0,
    totalActiveCount: 0,
    activeOrders: [],
  });
  const [historySummary, setHistorySummary] = useState<AdminDeliveryPartnerDetailHistory>({
    deliveredCount: 0,
    failedCount: 0,
    returnedCount: 0,
    totalCompletedCount: 0,
  });
  const [codSummary, setCodSummary] = useState<AdminDeliveryPartnerDetailCod>({
    pendingAmount: 0,
    pendingCount: 0,
    collectedAmount: 0,
    collectedCount: 0,
  });
  const [performance, setPerformance] = useState<AdminDeliveryPartnerPerformance>({
    completionRate: null,
    completionRateDisplay: 'Insufficient data',
    averageDeliveryDurationMinutes: null,
    averageDeliveryDurationDisplay: 'Insufficient data',
    averageAcceptanceDurationMinutes: null,
    averageAcceptanceDurationDisplay: 'Insufficient data',
    todayDeliveriesCount: 0,
    todayDeliveriesAmount: 0,
  });
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'ACTIVE_DELIVERIES' | 'DELIVERY_HISTORY' | 'PROFILE' | 'AUDIT_LOGS'>('ACTIVE_DELIVERIES');

  // History Tab Orders Pagination & Filter
  const [historyOrders, setHistoryOrders] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'ALL' | 'DELIVERED' | 'FAILED' | 'RETURNED'>('ALL');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);

  // Status Action Modal
  const [pendingAction, setPendingAction] = useState<'ACTIVATE' | 'DEACTIVATE' | 'SUSPEND' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Fetch Authoritative Partner Detail
  const fetchPartnerDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await AdminClient.getDeliveryPartner(partnerId);
      if (res.success && res.partner) {
        setPartner(res.partner);
        if (res.workload) setWorkload(res.workload);
        if (res.historySummary) setHistorySummary(res.historySummary);
        if (res.codSummary) setCodSummary(res.codSummary);
        if (res.performance) setPerformance(res.performance);
        if (Array.isArray(res.auditLogs)) setAuditLogs(res.auditLogs);
      } else {
        setError(res.message || `Delivery partner '${partnerId}' not found.`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load delivery partner profile.');
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  // Fetch Paginated Order History for History Tab
  const fetchOrderHistory = useCallback(async () => {
    if (activeTab !== 'DELIVERY_HISTORY') return;
    setHistoryLoading(true);
    try {
      const res = await AdminClient.getDeliveryPartnerOrders(partnerId, {
        page: historyPage,
        pageSize: 15,
        status: historyStatusFilter,
      });
      if (res.success && Array.isArray(res.orders)) {
        setHistoryOrders(res.orders);
        setHistoryTotal(res.total || 0);
        setHistoryTotalPages(res.totalPages || 1);
      }
    } catch (err) {
      console.warn('Error fetching order history for partner:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [partnerId, activeTab, historyPage, historyStatusFilter]);

  useEffect(() => {
    fetchPartnerDetail();
  }, [fetchPartnerDetail]);

  useEffect(() => {
    fetchOrderHistory();
  }, [fetchOrderHistory]);

  const handleExecuteStatusChange = async () => {
    if (!pendingAction || !partner) return;
    setSubmittingAction(true);
    setActionFeedback(null);

    try {
      let res: any;
      if (pendingAction === 'ACTIVATE') {
        res = await AdminClient.activateDeliveryPartner(partner.partnerId, actionReason.trim() || undefined);
      } else if (pendingAction === 'DEACTIVATE') {
        res = await AdminClient.deactivateDeliveryPartner(partner.partnerId, actionReason.trim() || undefined);
      } else if (pendingAction === 'SUSPEND') {
        res = await AdminClient.suspendDeliveryPartner(partner.partnerId, actionReason.trim() || undefined);
      }

      if (res?.success) {
        setActionFeedback({
          type: 'success',
          message: res.message || `Delivery partner ${pendingAction.toLowerCase()}d successfully.`,
        });
        setPendingAction(null);
        setActionReason('');
        await fetchPartnerDetail();
      } else {
        setActionFeedback({
          type: 'error',
          message: res?.message || `Failed to ${pendingAction.toLowerCase()} partner.`,
        });
      }
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: err.message || 'Status change failed.',
      });
    } finally {
      setSubmittingAction(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-[#f5b024]" />
        <span>Loading delivery partner profile...</span>
      </div>
    );
  }

  if (error || !partner) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Delivery Fleet
        </button>

        <div className="p-6 rounded-2xl bg-white border border-slate-200 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
          <h2 className="text-base font-bold text-slate-900">Partner Not Found</h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">{error || 'Unable to locate partner profile.'}</p>
          <button
            type="button"
            onClick={fetchPartnerDetail}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const isSuspended = partner.status === 'SUSPENDED';
  const isInactive = partner.status === 'INACTIVE';
  const isActive = partner.status === 'ACTIVE';

  return (
    <div className="space-y-6">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Delivery Fleet
        </button>

        <button
          type="button"
          onClick={fetchPartnerDetail}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Global Feedback Banner */}
      {actionFeedback && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between border ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
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

      {/* Main Partner Profile Header Card */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-[#f5b024] flex items-center justify-center text-xl font-black shrink-0">
              <Truck className="w-7 h-7" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  {partner.name}
                </h1>

                {/* Status Badge */}
                {isActive && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    ACTIVE
                  </span>
                )}
                {isInactive && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-stone-100 text-stone-600 border border-stone-300">
                    INACTIVE
                  </span>
                )}
                {isSuspended && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                    SUSPENDED
                  </span>
                )}

                {/* Availability Badge */}
                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
                  {partner.availabilityStatus}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1 font-medium">
                <span className="font-mono text-slate-700 font-bold">{partner.partnerId}</span>
                <span>•</span>
                <span className="flex items-center gap-1 text-slate-700">
                  <Phone className="w-3 h-3 text-slate-400" />
                  +91 {partner.mobile}
                </span>
                <span>•</span>
                <span>{partner.assignedWarehouseName}</span>
                <span>•</span>
                <span className="font-mono">{partner.vehicleNumber} ({partner.vehicleType})</span>
              </div>
            </div>
          </div>

          {/* Quick Action Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {(isInactive || isSuspended) && (
              <button
                type="button"
                onClick={() => setPendingAction('ACTIVATE')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors"
              >
                <UserCheck className="w-4 h-4" />
                <span>Activate Partner</span>
              </button>
            )}

            {isActive && (
              <button
                type="button"
                onClick={() => setPendingAction('DEACTIVATE')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-stone-700 hover:bg-stone-800 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors"
              >
                <Power className="w-4 h-4" />
                <span>Deactivate</span>
              </button>
            )}

            {!isSuspended && (
              <button
                type="button"
                onClick={() => setPendingAction('SUSPEND')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors"
              >
                <Ban className="w-4 h-4" />
                <span>Suspend Partner</span>
              </button>
            )}
          </div>
        </div>

        {/* Operational Workload Snapshot Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 pt-4 border-t border-slate-100 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Active Workload</div>
            <div className="text-lg font-black text-amber-600 mt-0.5">{workload.totalActiveCount}</div>
            <div className="text-[10px] text-slate-400">Assigned / In-transit</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Assigned</div>
            <div className="text-lg font-black text-slate-800 mt-0.5">{workload.assignedCount}</div>
            <div className="text-[10px] text-slate-400">Awaiting acceptance</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Out for Delivery</div>
            <div className="text-lg font-black text-amber-600 mt-0.5">{workload.outForDeliveryCount}</div>
            <div className="text-[10px] text-slate-400">Active on road</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Delivered Orders</div>
            <div className="text-lg font-black text-emerald-600 mt-0.5">{historySummary.deliveredCount}</div>
            <div className="text-[10px] text-slate-400">All-time completed</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Failed / Returned</div>
            <div className="text-lg font-black text-rose-600 mt-0.5">{historySummary.failedCount + historySummary.returnedCount}</div>
            <div className="text-[10px] text-slate-400">{historySummary.failedCount} failed, {historySummary.returnedCount} ret.</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Completion Rate</div>
            <div className="text-lg font-black text-slate-900 mt-0.5">{performance.completionRateDisplay}</div>
            <div className="text-[10px] text-slate-400">Delivered vs Failed</div>
          </div>

          <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Pending COD</div>
            <div className="text-lg font-black text-amber-900 mt-0.5">₹{codSummary.pendingAmount.toLocaleString('en-IN')}</div>
            <div className="text-[10px] text-amber-700">{codSummary.pendingCount} order(s)</div>
          </div>
        </div>
      </div>

      {/* Tabs Header */}
      <div className="flex border-b border-slate-200 bg-white px-4 rounded-xl shadow-xs overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('ACTIVE_DELIVERIES')}
          className={`px-4 py-3 text-xs font-bold flex items-center gap-2 border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
            activeTab === 'ACTIVE_DELIVERIES'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Active Deliveries</span>
          {workload.totalActiveCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-black">
              {workload.totalActiveCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('DELIVERY_HISTORY')}
          className={`px-4 py-3 text-xs font-bold flex items-center gap-2 border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
            activeTab === 'DELIVERY_HISTORY'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Delivery History</span>
          <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
            {historySummary.totalCompletedCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('PROFILE')}
          className={`px-4 py-3 text-xs font-bold flex items-center gap-2 border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
            activeTab === 'PROFILE'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Profile & Performance</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('AUDIT_LOGS')}
          className={`px-4 py-3 text-xs font-bold flex items-center gap-2 border-b-2 cursor-pointer transition-colors whitespace-nowrap ${
            activeTab === 'AUDIT_LOGS'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Audit Logs ({auditLogs.length})</span>
        </button>
      </div>

      {/* Tab 1: Active Deliveries */}
      {activeTab === 'ACTIVE_DELIVERIES' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Current Assigned & Active Deliveries</h2>
              <p className="text-xs text-slate-500">Live active orders in fulfillment state</p>
            </div>
            <span className="text-xs font-bold text-amber-600">
              {workload.totalActiveCount} Active Order(s)
            </span>
          </div>

          {workload.activeOrders.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
              <Package className="w-8 h-8 text-slate-300" />
              <p className="font-bold text-slate-700">No active deliveries currently assigned.</p>
              <p className="text-slate-400">Partner is currently available for dispatch from Brahmpuri Hub.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {workload.activeOrders.map((ord: any) => (
                <div key={ord.orderId} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">
                        {ord.orderNumber || ord.orderId}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-300">
                        {ord.delivery?.assignmentStatus || ord.orderStatus}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 font-mono">
                        {ord.paymentMethod || 'COD'}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 font-medium">
                      <span className="font-semibold text-slate-800">
                        {ord.shopName || ord.retailerName || 'Kirana Retailer'}
                      </span>
                      {ord.deliveryAddress?.city && (
                        <span> • {ord.deliveryAddress.city} ({ord.deliveryAddress?.pincode || '110053'})</span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center gap-3">
                      <span>Assigned: {new Date(ord.delivery?.assignedAt || ord.createdAt || Date.now()).toLocaleTimeString()}</span>
                      <span>Total: <strong className="text-slate-700 font-bold">₹{Number(ord.grandTotal || 0).toLocaleString('en-IN')}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {onNavigateToOrder && (
                      <button
                        type="button"
                        onClick={() => onNavigateToOrder(ord.orderId)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer shadow-xs"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Inspect Order</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Delivery History */}
      {activeTab === 'DELIVERY_HISTORY' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Historical Delivered & Completed Orders</h2>
              <p className="text-xs text-slate-500">Immutable past delivery performance records</p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={historyStatusFilter}
                onChange={e => {
                  setHistoryStatusFilter(e.target.value as any);
                  setHistoryPage(1);
                }}
                className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
              >
                <option value="ALL">All Past Orders</option>
                <option value="DELIVERED">Delivered Successfully</option>
                <option value="FAILED">Failed Deliveries</option>
                <option value="RETURNED">Returned to Warehouse</option>
              </select>
            </div>
          </div>

          {historyLoading ? (
            <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-[#f5b024]" />
              <span>Loading delivery history...</span>
            </div>
          ) : historyOrders.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
              <History className="w-8 h-8 text-slate-300" />
              <p className="font-bold text-slate-700">No historical orders match this filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Order ID</th>
                    <th className="py-3 px-4">Retailer Store</th>
                    <th className="py-3 px-4">Delivery Status</th>
                    <th className="py-3 px-4">Delivered / Finished At</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">COD Status</th>
                    <th className="py-3 px-4 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyOrders.map(ord => {
                    const isDelivered = ord.delivery?.assignmentStatus === 'DELIVERED' || ord.orderStatus === 'DELIVERED';
                    const isFailed = ord.delivery?.assignmentStatus === 'FAILED_DELIVERY' || ord.orderStatus === 'FAILED_DELIVERY';
                    const isReturned = ord.delivery?.assignmentStatus === 'RETURN_TO_WAREHOUSE' || ord.orderStatus === 'RETURNED';

                    return (
                      <tr key={ord.orderId} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          {ord.orderNumber || ord.orderId}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800">
                          {ord.shopName || ord.retailerName || 'Kirana Store'}
                        </td>
                        <td className="py-3 px-4">
                          {isDelivered && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              DELIVERED
                            </span>
                          )}
                          {isFailed && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              FAILED
                            </span>
                          )}
                          {isReturned && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                              RETURNED
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {ord.delivery?.deliveredAt ? new Date(ord.delivery.deliveredAt).toLocaleString() : (ord.deliveredAt ? new Date(ord.deliveredAt).toLocaleString() : '—')}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-800">
                          ₹{Number(ord.grandTotal || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4">
                          {ord.paymentMethod === 'COD' ? (
                            <span className="font-semibold text-amber-900">
                              {ord.deliveryPayment?.collectionStatus || 'COLLECTED'}
                            </span>
                          ) : (
                            <span className="text-slate-400">ONLINE</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {onNavigateToOrder && (
                            <button
                              type="button"
                              onClick={() => onNavigateToOrder(ord.orderId)}
                              className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                              title="View Order"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <span>Showing {historyOrders.length} of {historyTotal} records</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setHistoryPage(prev => Math.max(1, prev - 1))}
                disabled={historyPage <= 1}
                className="p-1 rounded border border-slate-300 bg-white disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-bold">Page {historyPage} of {historyTotalPages}</span>
              <button
                type="button"
                onClick={() => setHistoryPage(prev => Math.min(historyTotalPages, prev + 1))}
                disabled={historyPage >= historyTotalPages}
                className="p-1 rounded border border-slate-300 bg-white disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Profile & Performance */}
      {activeTab === 'PROFILE' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Fleet Partner Profile Information */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Fleet Partner Registration & Vehicle
            </h2>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Partner ID</span>
                <span className="font-mono font-bold text-slate-900">{partner.partnerId}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Mobile Phone</span>
                <span className="font-bold text-slate-900">+91 {partner.mobile}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Alternate Phone</span>
                <span className="text-slate-700">{partner.alternateMobile ? `+91 ${partner.alternateMobile}` : '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Assigned Warehouse</span>
                <span className="font-bold text-slate-900">{partner.assignedWarehouseName}</span>
                <span className="font-mono text-[10px] text-slate-400 block">{partner.assignedWarehouseId}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Vehicle Type</span>
                <span className="font-bold text-slate-900">{partner.vehicleType}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Vehicle Plate Number</span>
                <span className="font-mono font-bold text-slate-900">{partner.vehicleNumber}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Driving License</span>
                <span className="font-mono font-semibold text-slate-800">{partner.licenseNumber}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Service Areas</span>
                <span className="text-slate-700 font-semibold">{partner.serviceAreas?.join(', ') || 'Brahmpuri, Karawal Nagar'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Registered Date</span>
                <span className="text-slate-700">{new Date(partner.createdAt).toLocaleDateString()}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Last Active Timestamp</span>
                <span className="text-slate-700">{partner.lastActiveAt ? new Date(partner.lastActiveAt).toLocaleString() : '—'}</span>
              </div>
            </div>
          </div>

          {/* Performance Diagnostics */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Performance Diagnostics
            </h2>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800">Completion Rate</div>
                  <div className="text-[11px] text-slate-500">Delivered orders / total completed</div>
                </div>
                <div className="text-base font-black text-emerald-600">
                  {performance.completionRateDisplay}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800">Average Delivery Duration</div>
                  <div className="text-[11px] text-slate-500">Pickup to successful delivery completion</div>
                </div>
                <div className="text-base font-black text-slate-800">
                  {performance.averageDeliveryDurationDisplay}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800">Average Order Acceptance Time</div>
                  <div className="text-[11px] text-slate-500">Assignment dispatch to partner acceptance</div>
                </div>
                <div className="text-base font-black text-slate-800">
                  {performance.averageAcceptanceDurationDisplay}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800">Today's Delivered Volume</div>
                  <div className="text-[11px] text-slate-500">{performance.todayDeliveriesCount} order(s) today</div>
                </div>
                <div className="text-base font-black text-emerald-600">
                  ₹{performance.todayDeliveriesAmount.toLocaleString('en-IN')}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Audit Logs */}
      {activeTab === 'AUDIT_LOGS' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Immutable Audit Trail</h2>
              <p className="text-xs text-slate-500">Super Admin and Delivery Partner operational events</p>
            </div>
            <span className="text-xs font-mono text-slate-400">Total: {auditLogs.length}</span>
          </div>

          {auditLogs.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
              <FileText className="w-8 h-8 text-slate-300" />
              <p className="font-bold text-slate-700">No audit events recorded for this partner yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {auditLogs.map((log: any, idx: number) => (
                <div key={log.logId || idx} className="p-4 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold font-mono text-slate-900">
                        {log.action || log.eventType || 'AUDIT_EVENT'}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 font-mono">
                        {log.source || 'ADMIN'}
                      </span>
                    </div>
                    <div className="text-slate-500">
                      Performed by: <span className="font-semibold text-slate-700">{log.adminName || log.performedBy || log.adminUid || 'System'}</span>
                      {log.metadata?.reason && (
                        <span> • Reason: <em>"{log.metadata.reason}"</em></span>
                      )}
                    </div>
                  </div>

                  <div className="text-[11px] font-mono text-slate-400 shrink-0">
                    {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action Modal (Activate / Deactivate / Suspend) */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div
              className={`p-5 text-white ${
                pendingAction === 'ACTIVATE'
                  ? 'bg-emerald-600'
                  : pendingAction === 'DEACTIVATE'
                  ? 'bg-stone-700'
                  : 'bg-rose-600'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {pendingAction === 'ACTIVATE' && <UserCheck className="w-5 h-5" />}
                {pendingAction === 'DEACTIVATE' && <Power className="w-5 h-5" />}
                {pendingAction === 'SUSPEND' && <Ban className="w-5 h-5" />}
                <h3 className="text-base font-bold">
                  {pendingAction === 'ACTIVATE' && 'Activate Delivery Partner'}
                  {pendingAction === 'DEACTIVATE' && 'Deactivate Delivery Partner'}
                  {pendingAction === 'SUSPEND' && 'Suspend Delivery Partner'}
                </h3>
              </div>
              <p className="text-xs opacity-90 mt-1">
                {partner.name} ({partner.partnerId})
              </p>
            </div>

            <div className="p-5 space-y-4">
              {/* Safety Warning */}
              {(pendingAction === 'DEACTIVATE' || pendingAction === 'SUSPEND') && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                  <div className="font-bold flex items-center gap-1.5 mb-1">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    Safety Check: Active Deliveries
                  </div>
                  <p>
                    Partners with active deliveries ({workload.totalActiveCount} order(s)) cannot be {pendingAction.toLowerCase()}d. The server will reject the action if active orders exist.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Reason for {pendingAction.toLowerCase()} (optional, recorded in audit logs):
                </label>
                <textarea
                  rows={3}
                  value={actionReason}
                  onChange={e => setActionReason(e.target.value)}
                  placeholder={`Enter reason for partner ${pendingAction.toLowerCase()}...`}
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
                  onClick={handleExecuteStatusChange}
                  disabled={submittingAction}
                  className={`px-4 py-2 rounded-lg text-xs font-bold text-white shadow-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5 ${
                    pendingAction === 'ACTIVATE'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : pendingAction === 'DEACTIVATE'
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
                    <span>Confirm {pendingAction}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
