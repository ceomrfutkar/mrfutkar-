import React, { useState, useEffect, useCallback } from 'react';
import { AdminClient } from '../../services/adminClient';
import { AdminStatCard } from '../../components/admin/AdminStatCard';
import {
  AdminNotificationMetrics,
  AdminNotificationItem,
  AdminNotificationDetail,
  AdminNotificationTokenRow,
} from '../../types/admin';
import {
  Bell,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Smartphone,
  Sliders,
  Send,
  ExternalLink,
  RotateCcw,
  Eye,
  CheckCheck,
  User,
  ShoppingBag,
  Info,
} from 'lucide-react';

interface AdminNotificationsScreenProps {
  onNavigateToOrder?: (orderId: string) => void;
}

export const AdminNotificationsScreen: React.FC<AdminNotificationsScreenProps> = ({
  onNavigateToOrder,
}) => {
  // Active Tab
  const [activeTab, setActiveTab] = useState<'NOTIFICATIONS' | 'TOKENS' | 'PREFERENCES'>('NOTIFICATIONS');

  // Metrics
  const [metrics, setMetrics] = useState<AdminNotificationMetrics>({
    total: 0,
    today: 0,
    sent: 0,
    delivered: 0,
    failed: 0,
    noTokens: 0,
    skippedPreference: 0,
    unread: 0,
    retailerCount: 0,
    deliveryPartnerCount: 0,
    warehouseCount: 0,
    orderLinkedCount: 0,
    failedDeliveryCount: 0,
    successRate: 100,
    generatedAt: new Date().toISOString(),
  });

  // Notifications List State
  const [notifications, setNotifications] = useState<AdminNotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Search & Filter State
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [eventFilter, setEventFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [readFilter, setReadFilter] = useState<'ALL' | 'READ' | 'UNREAD'>('ALL');
  const [failedOnly, setFailedOnly] = useState(false);

  // Detail Modal State
  const [selectedNotifId, setSelectedNotifId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<AdminNotificationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Retry State
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryFeedback, setRetryFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Tokens Tab State
  const [tokens, setTokens] = useState<AdminNotificationTokenRow[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [tokenSearch, setTokenSearch] = useState('');

  // Preferences Tab State
  const [preferences, setPreferences] = useState<any[]>([]);
  const [loadingPrefs, setLoadingPrefs] = useState(false);
  const [prefSearch, setPrefSearch] = useState('');

  // Load Metrics
  const fetchMetrics = useCallback(async () => {
    try {
      const res = await AdminClient.getNotificationMetrics();
      if (res.success && res.metrics) {
        setMetrics(res.metrics);
      }
    } catch {
      // Non-blocking metric refresh failure
    }
  }, []);

  // Load Notifications
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const readParam = readFilter === 'ALL' ? undefined : readFilter === 'READ';
      const res = await AdminClient.getNotifications({
        page,
        pageSize,
        q: search.trim() || undefined,
        role: roleFilter,
        event: eventFilter,
        status: statusFilter,
        read: readParam,
        failedOnly,
      });

      if (res.success && res.notifications) {
        setNotifications(res.notifications);
        if (res.pagination) {
          setTotal(res.pagination.total);
          setTotalPages(res.pagination.totalPages);
        }
      } else {
        setError(res.message || 'Failed to retrieve notification records.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred while fetching notifications.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, roleFilter, eventFilter, statusFilter, readFilter, failedOnly]);

  // Load Tokens
  const fetchTokens = useCallback(async () => {
    setLoadingTokens(true);
    try {
      const res = await AdminClient.getNotificationTokens();
      if (res.success && res.tokens) {
        setTokens(res.tokens);
      }
    } catch {
      // Fail silently
    } finally {
      setLoadingTokens(false);
    }
  }, []);

  // Load Preferences
  const fetchPreferences = useCallback(async () => {
    setLoadingPrefs(true);
    try {
      const res = await AdminClient.getNotificationPreferences();
      if (res.success && Array.isArray(res.preferences)) {
        setPreferences(res.preferences);
      }
    } catch {
      // Fail silently
    } finally {
      setLoadingPrefs(false);
    }
  }, []);

  // Initial and reactive effects
  useEffect(() => {
    fetchMetrics();
    fetchNotifications();
  }, [fetchMetrics, fetchNotifications]);

  useEffect(() => {
    if (activeTab === 'TOKENS') {
      fetchTokens();
    } else if (activeTab === 'PREFERENCES') {
      fetchPreferences();
    }
  }, [activeTab, fetchTokens, fetchPreferences]);

  // View Notification Detail
  const handleOpenDetail = async (notifId: string) => {
    setSelectedNotifId(notifId);
    setLoadingDetail(true);
    setDetailError(null);
    setSelectedDetail(null);
    setRetryFeedback(null);

    try {
      const res = await AdminClient.getNotificationDetail(notifId);
      if (res.success && res.notification) {
        setSelectedDetail(res.notification);
      } else {
        setDetailError(res.message || 'Could not find notification details.');
      }
    } catch (err: any) {
      setDetailError(err.message || 'Failed to load details.');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Safe Push Notification Retry
  const handleRetryNotification = async (notifId: string) => {
    setRetryingId(notifId);
    setRetryFeedback(null);

    try {
      const res = await AdminClient.retryNotification(notifId);
      if (res.success) {
        setRetryFeedback({
          type: 'success',
          message: res.message || 'Notification push retried successfully.',
        });
        // Refresh detail view and list
        fetchMetrics();
        fetchNotifications();
        if (selectedNotifId === notifId) {
          handleOpenDetail(notifId);
        }
      } else {
        setRetryFeedback({
          type: 'error',
          message: res.message || 'Failed to retry notification push.',
        });
      }
    } catch (err: any) {
      setRetryFeedback({
        type: 'error',
        message: err.message || 'Network request failed during retry.',
      });
    } finally {
      setRetryingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Sent
          </span>
        );
      case 'DELIVERED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            <CheckCheck className="w-3.5 h-3.5 text-blue-600" />
            Delivered
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Failed
          </span>
        );
      case 'NO_TOKENS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <Smartphone className="w-3.5 h-3.5 text-amber-600" />
            No Tokens
          </span>
        );
      case 'SKIPPED_PREFERENCE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <Sliders className="w-3.5 h-3.5 text-slate-500" />
            Muted Pref
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
            {status}
          </span>
        );
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'RETAILER':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            Retailer
          </span>
        );
      case 'DELIVERY_PARTNER':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            Delivery Fleet
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            {role.replace('WAREHOUSE_', 'WH ')}
          </span>
        );
    }
  };

  // Filtered Tokens for Tokens Tab
  const filteredTokens = tokens.filter(tok => {
    if (!tokenSearch.trim()) return true;
    const q = tokenSearch.toLowerCase();
    return (
      tok.userId.toLowerCase().includes(q) ||
      tok.tokenId.toLowerCase().includes(q) ||
      tok.platform.toLowerCase().includes(q) ||
      tok.role.toLowerCase().includes(q)
    );
  });

  // Filtered Preferences for Preferences Tab
  const filteredPrefs = preferences.filter(pref => {
    if (!prefSearch.trim()) return true;
    const q = prefSearch.toLowerCase();
    return (
      (pref.name && pref.name.toLowerCase().includes(q)) ||
      (pref.shopName && pref.shopName.toLowerCase().includes(q)) ||
      (pref.userId && pref.userId.toLowerCase().includes(q)) ||
      (pref.phone && pref.phone.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#f5b024]/10 rounded-lg text-[#f5b024] border border-[#f5b024]/20">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                Notification Management Console
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Live Dispatch
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Authoritative push & in-app event observability, device token registry, and safe delivery retry
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchMetrics();
              if (activeTab === 'NOTIFICATIONS') fetchNotifications();
              else if (activeTab === 'TOKENS') fetchTokens();
              else fetchPreferences();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-xs transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Operational Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <AdminStatCard
          label="Total Notifications"
          value={metrics.total.toLocaleString()}
          icon={<Bell className="w-4 h-4 text-indigo-600" />}
          subValue={`${metrics.today} today`}
        />
        <AdminStatCard
          label="Sent / Dispatched"
          value={metrics.sent.toLocaleString()}
          icon={<Send className="w-4 h-4 text-emerald-600" />}
          subValue={`${metrics.delivered} confirmed`}
        />
        <AdminStatCard
          label="Failed Notifications"
          value={metrics.failed.toLocaleString()}
          icon={<AlertCircle className="w-4 h-4 text-rose-600" />}
          trend={metrics.failed > 0 ? { value: `${metrics.failed} errors`, isPositive: false } : { value: 'Zero errors', isPositive: true }}
        />
        <AdminStatCard
          label="Unreachable (No Tokens)"
          value={metrics.noTokens.toLocaleString()}
          icon={<Smartphone className="w-4 h-4 text-amber-600" />}
          subValue="No FCM registered"
        />
        <AdminStatCard
          label="Unread In-App"
          value={metrics.unread.toLocaleString()}
          icon={<Clock className="w-4 h-4 text-slate-600" />}
          subValue="Pending read"
        />
        <AdminStatCard
          label="Success Rate"
          value={`${metrics.successRate}%`}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          trend={{ value: `${metrics.successRate}%`, isPositive: metrics.successRate >= 95 }}
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('NOTIFICATIONS')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'NOTIFICATIONS'
              ? 'border-[#f5b024] text-slate-900 bg-amber-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          Notification Activity History
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 text-slate-700">
            {metrics.total}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('TOKENS')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'TOKENS'
              ? 'border-[#f5b024] text-slate-900 bg-amber-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          Device Push Tokens (Masked)
        </button>

        <button
          onClick={() => setActiveTab('PREFERENCES')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'PREFERENCES'
              ? 'border-[#f5b024] text-slate-900 bg-amber-50/40'
              : 'border-transparent text-slate-500 hover:text-slate-900'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          Recipient Notification Preferences
        </button>
      </div>

      {/* TAB 1: NOTIFICATIONS HISTORY */}
      {activeTab === 'NOTIFICATIONS' && (
        <div className="space-y-4">
          {/* Search & Filter Toolbar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
              {/* Search Bar */}
              <div className="lg:col-span-4 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by ID, User, Order, Title, Event..."
                  value={search}
                  onChange={e => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#f5b024] focus:border-transparent"
                />
              </div>

              {/* Recipient Role Filter */}
              <div className="lg:col-span-2">
                <select
                  value={roleFilter}
                  onChange={e => {
                    setRoleFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full py-2 px-3 text-xs rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-[#f5b024]"
                >
                  <option value="ALL">All Recipient Roles</option>
                  <option value="RETAILER">Retailers</option>
                  <option value="DELIVERY_PARTNER">Delivery Partners</option>
                  <option value="WAREHOUSE_STAFF">Warehouse Staff</option>
                  <option value="WAREHOUSE_MANAGER">Warehouse Managers</option>
                </select>
              </div>

              {/* Event Filter */}
              <div className="lg:col-span-2">
                <select
                  value={eventFilter}
                  onChange={e => {
                    setEventFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full py-2 px-3 text-xs rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-[#f5b024]"
                >
                  <option value="ALL">All Events</option>
                  <option value="ORDER_PLACED">ORDER_PLACED</option>
                  <option value="ORDER_CONFIRMED">ORDER_CONFIRMED</option>
                  <option value="ORDER_READY_FOR_DISPATCH">ORDER_READY_FOR_DISPATCH</option>
                  <option value="ORDER_ASSIGNED_TO_DELIVERY">ORDER_ASSIGNED_TO_DELIVERY</option>
                  <option value="ORDER_OUT_FOR_DELIVERY">ORDER_OUT_FOR_DELIVERY</option>
                  <option value="ORDER_DELIVERED">ORDER_DELIVERED</option>
                  <option value="ORDER_FAILED_DELIVERY">ORDER_FAILED_DELIVERY</option>
                  <option value="ORDER_CANCELLED">ORDER_CANCELLED</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="lg:col-span-2">
                <select
                  value={statusFilter}
                  onChange={e => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full py-2 px-3 text-xs rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-[#f5b024]"
                >
                  <option value="ALL">All Delivery Statuses</option>
                  <option value="SENT">Sent</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="FAILED">Failed</option>
                  <option value="NO_TOKENS">No Tokens</option>
                  <option value="SKIPPED_PREFERENCE">Skipped (Preference)</option>
                </select>
              </div>

              {/* Read Filter */}
              <div className="lg:col-span-2">
                <select
                  value={readFilter}
                  onChange={e => {
                    setReadFilter(e.target.value as any);
                    setPage(1);
                  }}
                  className="w-full py-2 px-3 text-xs rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-[#f5b024]"
                >
                  <option value="ALL">All Read States</option>
                  <option value="READ">Read</option>
                  <option value="UNREAD">Unread</option>
                </select>
              </div>
            </div>

            {/* Quick Filter Badges */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-medium">
                  <input
                    type="checkbox"
                    checked={failedOnly}
                    onChange={e => {
                      setFailedOnly(e.target.checked);
                      setPage(1);
                    }}
                    className="rounded text-[#f5b024] focus:ring-[#f5b024]"
                  />
                  <span>Show Failed Only</span>
                </label>
              </div>

              {(search || roleFilter !== 'ALL' || eventFilter !== 'ALL' || statusFilter !== 'ALL' || readFilter !== 'ALL' || failedOnly) && (
                <button
                  onClick={() => {
                    setSearch('');
                    setRoleFilter('ALL');
                    setEventFilter('ALL');
                    setStatusFilter('ALL');
                    setReadFilter('ALL');
                    setFailedOnly(false);
                    setPage(1);
                  }}
                  className="text-xs text-amber-700 hover:text-amber-900 font-medium hover:underline"
                >
                  Reset all filters
                </button>
              )}
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {loading ? (
              <div className="p-12 text-center">
                <div className="w-8 h-8 border-3 border-[#f5b024] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs text-slate-500 font-medium">Loading notifications from authoritative store...</p>
              </div>
            ) : error ? (
              <div className="p-8 text-center">
                <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-rose-900">{error}</p>
                <button
                  onClick={() => fetchNotifications()}
                  className="mt-3 px-3 py-1.5 text-xs font-semibold bg-rose-50 text-rose-700 rounded-lg hover:bg-rose-100"
                >
                  Try Again
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-12 text-center">
                <Bell className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-slate-800">No notifications found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  No notification records match the current filter criteria or search parameters.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold tracking-wider uppercase text-[10px]">
                      <th className="py-3 px-4">Notification ID</th>
                      <th className="py-3 px-4">Event & Type</th>
                      <th className="py-3 px-4">Recipient</th>
                      <th className="py-3 px-4">Order Linked</th>
                      <th className="py-3 px-4">Content Preview</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {notifications.map(item => (
                      <tr key={item.notificationId} className="hover:bg-slate-50/60 transition-colors">
                        {/* ID */}
                        <td className="py-3 px-4 font-mono font-medium text-slate-900">
                          <button
                            onClick={() => handleOpenDetail(item.notificationId)}
                            className="hover:text-amber-700 hover:underline flex items-center gap-1.5"
                          >
                            <span>{item.notificationId.length > 18 ? `${item.notificationId.substring(0, 18)}...` : item.notificationId}</span>
                          </button>
                        </td>

                        {/* Event */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{item.event}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{item.type}</div>
                        </td>

                        {/* Recipient */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {getRoleBadge(item.role)}
                          </div>
                          <div className="text-[11px] font-mono text-slate-600 truncate max-w-[130px]" title={item.userId}>
                            {item.userId}
                          </div>
                        </td>

                        {/* Linked Order */}
                        <td className="py-3 px-4 font-mono text-[11px]">
                          {item.orderId ? (
                            <button
                              onClick={() => onNavigateToOrder?.(item.orderId!)}
                              className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold hover:underline"
                            >
                              <ShoppingBag className="w-3 h-3" />
                              {item.orderNumber || item.orderId.substring(0, 10)}
                            </button>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Content */}
                        <td className="py-3 px-4 max-w-[240px]">
                          <div className="font-medium text-slate-900 truncate" title={item.title}>
                            {item.title}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate" title={item.body}>
                            {item.body}
                          </div>
                        </td>

                        {/* Delivery Status */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1 items-start">
                            {getStatusBadge(item.deliveryStatus)}
                            <span className={`text-[10px] font-medium ${item.read ? 'text-slate-400' : 'text-amber-700 font-semibold'}`}>
                              {item.read ? '✓ Read' : '● Unread'}
                            </span>
                          </div>
                        </td>

                        {/* Timestamp */}
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap text-[11px]">
                          <div>{new Date(item.createdAt).toLocaleDateString()}</div>
                          <div className="text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenDetail(item.notificationId)}
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                              title="View Notification Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {(item.deliveryStatus === 'FAILED' || item.deliveryStatus === 'NO_TOKENS') && (
                              <button
                                onClick={() => handleRetryNotification(item.notificationId)}
                                disabled={retryingId === item.notificationId}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-md transition-colors disabled:opacity-50"
                                title="Safely retry push delivery"
                              >
                                <RotateCcw className={`w-3 h-3 ${retryingId === item.notificationId ? 'animate-spin' : ''}`} />
                                Retry
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {!loading && notifications.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span>Showing page {page} of {totalPages} ({total} notifications total)</span>
                  <span className="text-slate-300">|</span>
                  <label className="flex items-center gap-1">
                    <span>Rows:</span>
                    <select
                      value={pageSize}
                      onChange={e => {
                        setPageSize(parseInt(e.target.value, 10));
                        setPage(1);
                      }}
                      className="py-1 px-2 border border-slate-300 rounded-md bg-white text-xs"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100 (Max)</option>
                    </select>
                  </label>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Previous Page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <span className="px-3 py-1 font-semibold text-slate-900 bg-white border border-slate-200 rounded-lg">
                    {page} / {totalPages}
                  </span>

                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Next Page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: DEVICE PUSH TOKENS */}
      {activeTab === 'TOKENS' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search user, device, platform..."
                value={tokenSearch}
                onChange={e => setTokenSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#f5b024]"
              />
            </div>

            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Strict Zero-Exposure Rule: All raw registration tokens masked server-side</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {loadingTokens ? (
              <div className="p-12 text-center">
                <div className="w-8 h-8 border-3 border-[#f5b024] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs text-slate-500 font-medium">Fetching registered device tokens...</p>
              </div>
            ) : filteredTokens.length === 0 ? (
              <div className="p-12 text-center">
                <Smartphone className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-slate-800">No device tokens registered</h3>
                <p className="text-xs text-slate-500 mt-1">Users will appear here once push notifications are enabled on their device.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold tracking-wider uppercase text-[10px]">
                      <th className="py-3 px-4">User ID</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Platform</th>
                      <th className="py-3 px-4">Device ID</th>
                      <th className="py-3 px-4">Masked FCM Token</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Last Seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTokens.map(tok => (
                      <tr key={tok.tokenId} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-mono font-medium text-slate-900">{tok.userId}</td>
                        <td className="py-3 px-4">{getRoleBadge(tok.role)}</td>
                        <td className="py-3 px-4 font-semibold text-slate-700 uppercase text-[11px]">{tok.platform}</td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600">{tok.deviceId}</td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-700 bg-slate-50/80 px-2 py-1 rounded">
                          {tok.tokenMasked}
                        </td>
                        <td className="py-3 px-4">
                          {tok.active ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                              <span className="w-2 h-2 rounded-full bg-slate-300" />
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px]">
                          {tok.lastSeenAt ? new Date(tok.lastSeenAt).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: USER PREFERENCES */}
      {activeTab === 'PREFERENCES' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search retailer name, shop, phone..."
                value={prefSearch}
                onChange={e => setPrefSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#f5b024]"
              />
            </div>
            <div className="text-xs text-slate-500">
              Read-only view of retailer opt-in / opt-out notification channels
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {loadingPrefs ? (
              <div className="p-12 text-center">
                <div className="w-8 h-8 border-3 border-[#f5b024] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs text-slate-500 font-medium">Fetching retailer preferences...</p>
              </div>
            ) : filteredPrefs.length === 0 ? (
              <div className="p-12 text-center">
                <Sliders className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-slate-800">No retailer records found</h3>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold tracking-wider uppercase text-[10px]">
                      <th className="py-3 px-4">Retailer</th>
                      <th className="py-3 px-4">Shop Name</th>
                      <th className="py-3 px-4">Phone</th>
                      <th className="py-3 px-4">Master Notifications</th>
                      <th className="py-3 px-4">Order Updates</th>
                      <th className="py-3 px-4">Delivery Updates</th>
                      <th className="py-3 px-4">Promotions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPrefs.map(pref => (
                      <tr key={pref.userId} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-semibold text-slate-900">{pref.name}</td>
                        <td className="py-3 px-4 text-slate-700">{pref.shopName || '—'}</td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600">{pref.phone || '—'}</td>
                        <td className="py-3 px-4">
                          {pref.notificationsEnabled !== false ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              Enabled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              Muted
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {pref.notificationPreferences?.orderUpdates !== false ? (
                            <span className="text-emerald-600 font-bold">✓ ON</span>
                          ) : (
                            <span className="text-slate-400 font-medium">✗ OFF</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {pref.notificationPreferences?.deliveryUpdates !== false ? (
                            <span className="text-emerald-600 font-bold">✓ ON</span>
                          ) : (
                            <span className="text-slate-400 font-medium">✗ OFF</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {pref.notificationPreferences?.promotionalNotifications ? (
                            <span className="text-emerald-600 font-bold">✓ ON</span>
                          ) : (
                            <span className="text-slate-400 font-medium">✗ OFF</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* NOTIFICATION DETAIL MODAL */}
      {selectedNotifId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#f5b024]/10 text-[#f5b024] rounded-lg">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Notification Event Detail</h3>
                  <p className="text-[11px] text-slate-500 font-mono">{selectedNotifId}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedNotifId(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
                aria-label="Close Modal"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {loadingDetail ? (
                <div className="py-12 text-center">
                  <div className="w-8 h-8 border-3 border-[#f5b024] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-xs text-slate-500 font-medium">Loading safe notification detail...</p>
                </div>
              ) : detailError ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-center">
                  <AlertCircle className="w-6 h-6 text-rose-500 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-rose-800">{detailError}</p>
                </div>
              ) : selectedDetail ? (
                <>
                  {/* Feedback Banner */}
                  {retryFeedback && (
                    <div
                      className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                        retryFeedback.type === 'success'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-rose-50 border-rose-200 text-rose-800'
                      }`}
                    >
                      {retryFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      <span>{retryFeedback.message}</span>
                    </div>
                  )}

                  {/* Status Banner */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Delivery Status</div>
                        <div className="mt-1">{getStatusBadge(selectedDetail.deliveryStatus)}</div>
                      </div>
                      <div className="h-8 w-px bg-slate-200 mx-2" />
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Read State</div>
                        <div className="mt-1 text-xs font-semibold text-slate-800">
                          {selectedDetail.read ? '✓ Marked as Read' : '● Unread by Recipient'}
                        </div>
                      </div>
                    </div>

                    {/* Retry Button */}
                    <button
                      onClick={() => handleRetryNotification(selectedDetail.notificationId)}
                      disabled={retryingId === selectedDetail.notificationId}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-900 bg-[#f5b024] hover:bg-[#e09e1b] rounded-lg shadow-xs transition-colors disabled:opacity-50"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 ${retryingId === selectedDetail.notificationId ? 'animate-spin' : ''}`} />
                      {retryingId === selectedDetail.notificationId ? 'Retrying...' : 'Safe Push Retry'}
                    </button>
                  </div>

                  {/* Notification Payload View */}
                  <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5 text-amber-600" />
                      Message Content
                    </div>
                    <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-1">
                      <div className="text-xs font-bold text-slate-900">{selectedDetail.title}</div>
                      <div className="text-xs text-slate-700 leading-relaxed">{selectedDetail.body}</div>
                    </div>
                    {selectedDetail.deepLink && (
                      <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                        <span>Deep link:</span>
                        <span className="text-indigo-600 font-semibold">{selectedDetail.deepLink}</span>
                      </div>
                    )}
                  </div>

                  {/* Event & Idempotency Key */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Event Type</span>
                      <div className="font-bold text-slate-900">{selectedDetail.event}</div>
                      <div className="text-[11px] text-slate-500">Category: {selectedDetail.type}</div>
                    </div>

                    <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Deterministic Idempotency Key</span>
                      <div className="font-mono text-[11px] text-slate-800 break-all">
                        {selectedDetail.notificationEventId || `${selectedDetail.orderId || 'general'}_${selectedDetail.event}`}
                      </div>
                    </div>
                  </div>

                  {/* Recipient Information */}
                  <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2">
                    <div className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-600" />
                      Recipient Metadata
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 text-[11px]">User ID:</span>
                        <div className="font-mono font-medium text-slate-800">{selectedDetail.userId}</div>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px]">Role:</span>
                        <div className="mt-0.5">{getRoleBadge(selectedDetail.role)}</div>
                      </div>
                      {selectedDetail.recipientDetails?.name && (
                        <div>
                          <span className="text-slate-400 text-[11px]">Name:</span>
                          <div className="font-semibold text-slate-800">{selectedDetail.recipientDetails.name}</div>
                        </div>
                      )}
                      {selectedDetail.recipientDetails?.shopName && (
                        <div>
                          <span className="text-slate-400 text-[11px]">Shop Name:</span>
                          <div className="text-slate-700">{selectedDetail.recipientDetails.shopName}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Linked Order */}
                  {selectedDetail.orderId && (
                    <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                          <ShoppingBag className="w-3.5 h-3.5 text-indigo-600" />
                          Linked Order Record
                        </div>
                        <button
                          onClick={() => {
                            setSelectedNotifId(null);
                            onNavigateToOrder?.(selectedDetail.orderId!);
                          }}
                          className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                        >
                          View Order Console <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-slate-400 text-[11px]">Order ID:</span>
                          <div className="font-mono text-slate-800">{selectedDetail.orderId}</div>
                        </div>
                        {selectedDetail.orderDetails?.orderStatus && (
                          <div>
                            <span className="text-slate-400 text-[11px]">Order Status:</span>
                            <div className="font-semibold text-slate-900">{selectedDetail.orderDetails.orderStatus}</div>
                          </div>
                        )}
                        {selectedDetail.orderDetails?.grandTotal !== undefined && (
                          <div>
                            <span className="text-slate-400 text-[11px]">Total Value:</span>
                            <div className="font-bold text-slate-900">₹{selectedDetail.orderDetails.grandTotal.toLocaleString()}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Failure / Error Details */}
                  {selectedDetail.errorDetails && (
                    <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                      <div className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 text-rose-600" />
                        Delivery Failure Reason
                      </div>
                      <p className="text-xs text-rose-700 font-mono break-all">{selectedDetail.errorDetails}</p>
                    </div>
                  )}

                  {/* Retry History Timeline */}
                  {selectedDetail.retryHistory && selectedDetail.retryHistory.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                        Administrative Retry Audit Trail ({selectedDetail.retryHistory.length})
                      </div>
                      <div className="divide-y divide-slate-100 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden text-xs">
                        {selectedDetail.retryHistory.map((h, i) => (
                          <div key={i} className="p-3 flex items-center justify-between">
                            <div>
                              <div className="font-semibold text-slate-800">
                                Status: {h.previousStatus} → <span className="text-emerald-700">{h.newStatus}</span>
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Retried by: {h.retriedBy}
                              </div>
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {new Date(h.retriedAt).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Privacy & Zero-Leakage Notice */}
                  <div className="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-xl flex items-start gap-2 text-[11px] text-emerald-900">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">Security & Privacy Invariants Verified:</span>
                      <p className="text-emerald-800 mt-0.5">
                        Delivery OTPs, hashes, private POD storage references, and raw FCM device registration tokens are strictly sanitized and never exposed to this administrative console.
                      </p>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Created: {selectedDetail ? new Date(selectedDetail.createdAt).toLocaleString() : '—'}
              </span>
              <button
                onClick={() => setSelectedNotifId(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
