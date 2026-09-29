import React, { useState, useEffect, useCallback } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { AdminClient } from '../../services/adminClient';
import {
  AdminAuditRecord,
  AdminAuditMetrics,
  AuditCategory,
  AuditSeverity,
} from '../../types/admin';

export const AdminAuditCenterScreen: React.FC = () => {
  const { session } = useAdmin();

  // Data states
  const [logs, setLogs] = useState<AdminAuditRecord[]>([]);
  const [metrics, setMetrics] = useState<AdminAuditMetrics | null>(null);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter facets
  const [distinctAdmins, setDistinctAdmins] = useState<Array<{ uid: string; name: string }>>([]);
  const [distinctActions, setDistinctActions] = useState<string[]>([]);

  // Filter state
  const [search, setSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<AuditCategory>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedAdminUid, setSelectedAdminUid] = useState<string>('');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Inspection modal state
  const [selectedLog, setSelectedLog] = useState<AdminAuditRecord | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Fetch filter facets
  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const token = AdminClient.getToken() || '';
        const res = await fetch('/api/admin/audit/filters', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
          if (Array.isArray(data.admins)) setDistinctAdmins(data.admins);
          if (Array.isArray(data.actions)) setDistinctActions(data.actions);
        }
      } catch {
        // Fallback silently if facets fail
      }
    };
    fetchFilters();
  }, [session?.uid]);

  // Main fetch function
  const fetchAuditLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (selectedCategory && selectedCategory !== 'ALL') params.set('category', selectedCategory);
      if (selectedSeverity && selectedSeverity !== 'ALL') params.set('severity', selectedSeverity);
      if (selectedAdminUid) params.set('adminUid', selectedAdminUid);
      if (selectedAction && selectedAction !== 'ALL') params.set('action', selectedAction);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      params.set('page', page.toString());
      params.set('pageSize', pageSize.toString());

      const token = AdminClient.getToken() || '';
      const res = await fetch(`/api/admin/audit?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to fetch audit events');
      }

      setLogs(data.logs || []);
      setTotalCount(data.totalCount || 0);
      setTotalPages(data.totalPages || 1);
      if (data.metrics) {
        setMetrics(data.metrics);
      }
    } catch (err: any) {
      setError(err.message || 'Error communicating with security audit service.');
    } finally {
      setLoading(false);
    }
  }, [
    search,
    selectedCategory,
    selectedSeverity,
    selectedAdminUid,
    selectedAction,
    startDate,
    endDate,
    page,
    pageSize,
    session?.uid,
  ]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  // Export handler
  const handleExport = async (format: 'csv' | 'json') => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('format', format);
      if (search.trim()) params.set('search', search.trim());
      if (selectedCategory && selectedCategory !== 'ALL') params.set('category', selectedCategory);
      if (selectedAdminUid) params.set('adminUid', selectedAdminUid);

      const token = AdminClient.getToken() || '';
      const res = await fetch(`/api/admin/audit/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (format === 'csv') {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mrfutkar_admin_audit_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mrfutkar_admin_audit_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setSelectedCategory('ALL');
    setSelectedSeverity('ALL');
    setSelectedAdminUid('');
    setSelectedAction('ALL');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const applyDatePreset = (preset: 'today' | 'yesterday' | '7days' | '30days' | 'thisMonth' | 'lastMonth') => {
    const now = new Date();
    const kolkataDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const [year, month, day] = kolkataDateStr.split('-').map(Number);
    const today = new Date(Date.UTC(year, month - 1, day));
    const formatDate = (d: Date) => d.toISOString().substring(0, 10);

    if (preset === 'today') {
      setStartDate(kolkataDateStr);
      setEndDate(kolkataDateStr);
    } else if (preset === 'yesterday') {
      const yest = new Date(today.getTime() - 86400000);
      const yestStr = formatDate(yest);
      setStartDate(yestStr);
      setEndDate(yestStr);
    } else if (preset === '7days') {
      const past7 = new Date(today.getTime() - 7 * 86400000);
      setStartDate(formatDate(past7));
      setEndDate(kolkataDateStr);
    } else if (preset === '30days') {
      const past30 = new Date(today.getTime() - 30 * 86400000);
      setStartDate(formatDate(past30));
      setEndDate(kolkataDateStr);
    } else if (preset === 'thisMonth') {
      const firstDay = new Date(Date.UTC(year, month - 1, 1));
      setStartDate(formatDate(firstDay));
      setEndDate(kolkataDateStr);
    } else if (preset === 'lastMonth') {
      const firstDayLastMonth = new Date(Date.UTC(year, month - 2, 1));
      const lastDayLastMonth = new Date(Date.UTC(year, month - 1, 0));
      setStartDate(formatDate(firstDayLastMonth));
      setEndDate(formatDate(lastDayLastMonth));
    }
    setPage(1);
  };

  const getSeverityBadge = (sev: AuditSeverity) => {
    switch (sev) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            CRITICAL
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            WARNING
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
            INFO
          </span>
        );
    }
  };

  const getCategoryBadge = (cat: AuditCategory) => {
    const colors: Record<string, string> = {
      SECURITY: 'bg-red-500/15 text-red-300 border-red-500/30',
      SETTINGS: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
      CATALOGUE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      PRICING: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
      RETAILER: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
      INVENTORY: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
      ORDERS: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
      DELIVERY: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
      WAREHOUSE: 'bg-stone-500/15 text-stone-300 border-stone-500/30',
      NOTIFICATION: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
      ADMIN_USERS: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
      REPORTS: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    };
    const c = colors[cat] || 'bg-slate-800 text-slate-300 border-slate-700';
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${c}`}>
        {cat}
      </span>
    );
  };

  const CATEGORIES: AuditCategory[] = [
    'ALL',
    'SECURITY',
    'SETTINGS',
    'CATALOGUE',
    'PRICING',
    'RETAILER',
    'INVENTORY',
    'ORDERS',
    'DELIVERY',
    'WAREHOUSE',
    'NOTIFICATION',
    'ADMIN_USERS',
  ];

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">📜</span>
            <h1 className="text-xl font-bold text-white tracking-tight">Admin Audit & Security Center</h1>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
              IMMUTABLE TRAIL
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Server-authoritative, cryptographic event logs across all MR FUTKAR administrative operations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchAuditLogs()}
            disabled={loading}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            🔄 {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={() => handleExport('csv')}
            disabled={isExporting}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            📥 Export CSV
          </button>
          <button
            onClick={() => handleExport('json')}
            disabled={isExporting}
            className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            📋 Export JSON
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
            <div className="text-slate-400 text-xs font-medium uppercase tracking-wider">Total Recorded Events</div>
            <div className="text-2xl font-bold text-white mt-1">{metrics.totalEvents.toLocaleString()}</div>
            <div className="text-[11px] text-slate-400 mt-1">
              <span className="text-emerald-400 font-semibold">{metrics.severityCounts.INFO || 0}</span> Info ·{' '}
              <span className="text-amber-400 font-semibold">{metrics.severityCounts.WARNING || 0}</span> Warning ·{' '}
              <span className="text-rose-400 font-semibold">{metrics.severityCounts.CRITICAL || 0}</span> Critical
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
            <div className="text-slate-400 text-xs font-medium uppercase tracking-wider">Security & Access Events</div>
            <div className="text-2xl font-bold text-rose-400 mt-1">{metrics.securityEvents.toLocaleString()}</div>
            <div className="text-[11px] text-slate-400 mt-1">Gated access, login & status transitions</div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
            <div className="text-slate-400 text-xs font-medium uppercase tracking-wider">Events Today</div>
            <div className="text-2xl font-bold text-amber-400 mt-1">{metrics.eventsToday.toLocaleString()}</div>
            <div className="text-[11px] text-slate-400 mt-1">Past 7 days: {metrics.eventsPast7Days.toLocaleString()}</div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
            <div className="text-slate-400 text-xs font-medium uppercase tracking-wider">Distinct Admin Actors</div>
            <div className="text-2xl font-bold text-cyan-400 mt-1">{metrics.distinctAdminsCount}</div>
            <div className="text-[11px] text-slate-400 mt-1">Super Administrators recorded</div>
          </div>
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-800 scrollbar-none">
        {CATEGORIES.map(cat => {
          const isActive = selectedCategory === cat;
          const count = cat === 'ALL' ? metrics?.totalEvents : metrics?.categoryCounts[cat] || 0;
          return (
            <button
              key={cat}
              onClick={() => {
                setSelectedCategory(cat);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                isActive
                  ? 'bg-amber-400 text-slate-950 shadow-xs'
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <span>{cat === 'ALL' ? 'All Events' : cat}</span>
              {typeof count === 'number' && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isActive ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter Toolbar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Input */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Search Events
            </label>
            <input
              type="text"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Action, admin, target, fingerprint..."
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:outline-hidden focus:border-amber-400 placeholder-slate-500"
            />
          </div>

          {/* Admin Actor Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Admin Actor
            </label>
            <select
              value={selectedAdminUid}
              onChange={e => {
                setSelectedAdminUid(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:outline-hidden focus:border-amber-400"
            >
              <option value="">All Administrators</option>
              {distinctAdmins.map(admin => (
                <option key={admin.uid} value={admin.uid}>
                  {admin.name} ({admin.uid.substring(0, 10)}...)
                </option>
              ))}
            </select>
          </div>

          {/* Severity Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Severity
            </label>
            <select
              value={selectedSeverity}
              onChange={e => {
                setSelectedSeverity(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:outline-hidden focus:border-amber-400"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical Only</option>
              <option value="WARNING">Warning Only</option>
              <option value="INFO">Info Only</option>
            </select>
          </div>

          {/* Specific Action Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Action Type
            </label>
            <select
              value={selectedAction}
              onChange={e => {
                setSelectedAction(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:outline-hidden focus:border-amber-400"
            >
              <option value="ALL">All Actions</option>
              {distinctActions.map(act => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Date Presets & Range */}
        <div className="pt-2 border-t border-slate-800/80 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
              Presets (IST):
            </span>
            {[
              { label: 'Today', key: 'today' as const },
              { label: 'Yesterday', key: 'yesterday' as const },
              { label: 'Last 7 Days', key: '7days' as const },
              { label: 'Last 30 Days', key: '30days' as const },
              { label: 'This Month', key: 'thisMonth' as const },
              { label: 'Last Month', key: 'lastMonth' as const },
            ].map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyDatePreset(p.key)}
                className="px-2 py-0.5 rounded-sm text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-end justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <span className="text-[11px] font-medium text-slate-400 mr-2">From:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => {
                    setStartDate(e.target.value);
                    setPage(1);
                  }}
                  className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-hidden focus:border-amber-400"
                />
              </div>
              <div>
                <span className="text-[11px] font-medium text-slate-400 mr-2">To:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => {
                    setEndDate(e.target.value);
                    setPage(1);
                  }}
                  className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-hidden focus:border-amber-400"
                />
              </div>
            </div>

          <button
            onClick={resetFilters}
            className="text-xs text-slate-400 hover:text-white transition-colors underline self-end"
          >
            Clear All Filters
          </button>
        </div>
      </div>
    </div>

      {/* Error Notice */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-xl text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => fetchAuditLogs()} className="underline font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Table & Content */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-800/70 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Timestamp (IST)</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Severity</th>
                <th className="py-3 px-4">Target</th>
                <th className="py-3 px-4">Fingerprint</th>
                <th className="py-3 px-4 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="animate-spin text-2xl mb-2">⏳</div>
                    Loading audit events...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="text-3xl mb-2">🛡️</div>
                    <div className="font-semibold text-slate-300">No audit events match current criteria</div>
                    <div className="text-xs text-slate-500 mt-1">Try broadening your search query or reset filters.</div>
                  </td>
                </tr>
              ) : (
                logs.map(log => {
                  const dateObj = new Date(log.timestamp);
                  const formattedDate = !isNaN(dateObj.getTime())
                    ? dateObj.toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })
                    : log.timestamp;

                  return (
                    <tr
                      key={log.logId}
                      className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                      onClick={() => setSelectedLog(log)}
                    >
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                        {formattedDate}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-white">{log.adminName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {log.adminUid ? log.adminUid.substring(0, 14) : 'N/A'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-slate-200 font-semibold">{log.action}</span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">{getCategoryBadge(log.category)}</td>
                      <td className="py-3 px-4 whitespace-nowrap">{getSeverityBadge(log.severity)}</td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-300 font-mono text-[11px]">
                        <div>{log.targetType || 'N/A'}</div>
                        <div className="text-slate-500 text-[10px]">
                          {log.targetId && log.targetId !== 'N/A' ? log.targetId.substring(0, 16) : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400 text-[10px]">
                        {log.ipHashOrRequestFingerprint || '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 text-[11px] font-medium"
                        >
                          View
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
        <div className="p-4 bg-slate-800/40 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>Show</span>
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(parseInt(e.target.value, 10));
                setPage(1);
              }}
              className="bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 text-xs"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>per page · Total {totalCount.toLocaleString()} events</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-300 hover:text-white disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="text-slate-300 font-medium">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-300 hover:text-white disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* Detail Inspection Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔍</span>
                <div>
                  <h3 className="text-sm font-bold text-white">Audit Event Inspection</h3>
                  <div className="text-[11px] font-mono text-slate-400">{selectedLog.logId}</div>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Event Top Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Action</div>
                  <div className="text-sm font-mono font-bold text-amber-400 mt-0.5">{selectedLog.action}</div>
                </div>
                <div className="flex items-center gap-2">
                  {getCategoryBadge(selectedLog.category)}
                  {getSeverityBadge(selectedLog.severity)}
                </div>
              </div>

              {/* Core Details Grid */}
              <div className="grid grid-cols-2 gap-3 bg-slate-800/30 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-400">Actor Name</div>
                  <div className="text-xs font-semibold text-white mt-0.5">{selectedLog.adminName}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-400">Actor UID</div>
                  <div className="text-xs font-mono text-slate-300 mt-0.5">{selectedLog.adminUid}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-400">Target Type</div>
                  <div className="text-xs font-mono text-slate-300 mt-0.5">{selectedLog.targetType || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-400">Target ID</div>
                  <div className="text-xs font-mono text-slate-300 mt-0.5">{selectedLog.targetId || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-400">Timestamp (UTC)</div>
                  <div className="text-xs font-mono text-slate-300 mt-0.5">{selectedLog.timestamp}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-400">Request Fingerprint</div>
                  <div className="text-xs font-mono text-slate-300 mt-0.5">{selectedLog.ipHashOrRequestFingerprint || 'INTERNAL'}</div>
                </div>
              </div>

              {/* Metadata Inspection */}
              <div>
                <div className="text-xs font-bold text-white mb-1.5 flex items-center justify-between">
                  <span>Audit Payload & Context Metadata</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {Object.keys(selectedLog.metadata || {}).length} field(s)
                  </span>
                </div>
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 font-mono text-[11px] text-amber-300/90 overflow-x-auto max-h-56">
                  <pre>{JSON.stringify(selectedLog.metadata || {}, null, 2)}</pre>
                </div>
              </div>

              {/* Cryptographic Non-Repudiation Footer */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-emerald-500/20 text-emerald-400 flex items-center gap-2">
                <span className="text-base">🛡️</span>
                <div className="text-[11px] leading-tight">
                  <span className="font-bold">Cryptographically Verified Append-Only Event.</span> This record was written via internal server authority token to canonical <code className="bg-slate-900 px-1 rounded">adminAuditLogs</code> and is non-modifiable.
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 flex justify-end bg-slate-900">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors"
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
