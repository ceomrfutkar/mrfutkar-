import React, { useState, useEffect, useCallback } from 'react';
import { AdminClient } from '../../services/adminClient';
import { AdminStatCard } from '../../components/admin/AdminStatCard';
import {
  ReportDatePreset,
  ReportMetadata,
  ReportSummaryKpis,
  ReportSalesTrendPoint,
  ReportOrderStatusDistributionItem,
  ReportProductRow,
  ReportRetailerRow,
  ReportDeliveryPartnerRow,
  ReportWarehouseMetrics,
  ReportCodMetrics,
  ReportCancellationMetrics,
  ReportFailedDeliveryMetrics,
  ReportReturnMetrics,
} from '../../types/report';
import {
  TrendingUp,
  Package,
  Store,
  Warehouse,
  Truck,
  DollarSign,
  AlertOctagon,
  Download,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

export const AdminReportsScreen: React.FC = () => {
  // Preset & Date Range Filter
  const [preset, setPreset] = useState<ReportDatePreset>('LAST_30_DAYS');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [activeDateFrom, setActiveDateFrom] = useState('');
  const [activeDateTo, setActiveDateTo] = useState('');

  // Active Tab
  const [activeTab, setActiveTab] = useState<
    'SALES_ORDERS' | 'PRODUCTS' | 'RETAILERS' | 'WAREHOUSE' | 'DELIVERY' | 'COD' | 'CANCELLATIONS'
  >('SALES_ORDERS');

  // Metadata & Loading States
  const [metadata, setMetadata] = useState<ReportMetadata | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingTab, setLoadingTab] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Executive KPIs
  const [kpis, setKpis] = useState<ReportSummaryKpis | null>(null);

  // Sales & Orders Tab State
  const [salesTrends, setSalesTrends] = useState<ReportSalesTrendPoint[]>([]);
  const [salesKpis, setSalesKpis] = useState<any>(null);
  const [salesGroupBy, setSalesGroupBy] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [orderDistribution, setOrderDistribution] = useState<ReportOrderStatusDistributionItem[]>([]);
  const [dailyOrderTrends, setDailyOrderTrends] = useState<any[]>([]);

  // Products Tab State
  const [products, setProducts] = useState<ReportProductRow[]>([]);
  const [topProducts, setTopProducts] = useState<any>(null);
  const [prodSearch, setProdSearch] = useState('');
  const [prodPage, setProdPage] = useState(1);
  const [prodTotalPages, setProdTotalPages] = useState(1);
  const [prodSortBy, setProdSortBy] = useState('salesValue');

  // Retailers Tab State
  const [retailers, setRetailers] = useState<ReportRetailerRow[]>([]);
  const [topRetailers, setTopRetailers] = useState<any>(null);
  const [retSearch, setRetSearch] = useState('');
  const [retPage, setRetPage] = useState(1);
  const [retTotalPages, setRetTotalPages] = useState(1);
  const [retSortBy, setRetSortBy] = useState('totalSalesValue');

  // Warehouse Tab State
  const [warehouseMetrics, setWarehouseMetrics] = useState<ReportWarehouseMetrics | null>(null);

  // Delivery Tab State
  const [deliveryPartners, setDeliveryPartners] = useState<ReportDeliveryPartnerRow[]>([]);
  const [delSearch, setDelSearch] = useState('');
  const [delPage, setDelPage] = useState(1);
  const [delTotalPages, setDelTotalPages] = useState(1);

  // COD Tab State
  const [codMetrics, setCodMetrics] = useState<ReportCodMetrics | null>(null);

  // Cancellations & Returns Tab State
  const [cancellationMetrics, setCancellationMetrics] = useState<ReportCancellationMetrics | null>(null);
  const [failedMetrics, setFailedMetrics] = useState<ReportFailedDeliveryMetrics | null>(null);
  const [returnMetrics, setReturnMetrics] = useState<ReportReturnMetrics | null>(null);

  // Helper to format currency ₹
  const formatInr = (val?: number) => {
    if (val === undefined || val === null || isNaN(val)) return '₹0.00';
    return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // 1. Fetch Executive Summary KPIs
  const fetchSummary = useCallback(async () => {
    setLoadingSummary(true);
    setError(null);
    try {
      const params: any = { preset };
      if (preset === 'CUSTOM') {
        params.dateFrom = customDateFrom;
        params.dateTo = customDateTo;
      }

      const res = await AdminClient.getReportsSummary(params);
      if (res.success) {
        setKpis(res.kpis);
        setMetadata(res.metadata);
        setActiveDateFrom(res.metadata.dateFrom);
        setActiveDateTo(res.metadata.dateTo);
      } else {
        setError(res.message || 'Failed to load report summary.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching summary.');
    } finally {
      setLoadingSummary(false);
    }
  }, [preset, customDateFrom, customDateTo]);

  // 2. Fetch Active Tab Data
  const fetchTabData = useCallback(async () => {
    setLoadingTab(true);
    const params: any = { preset };
    if (preset === 'CUSTOM') {
      params.dateFrom = customDateFrom;
      params.dateTo = customDateTo;
    }

    try {
      if (activeTab === 'SALES_ORDERS') {
        const [salesRes, ordersRes] = await Promise.all([
          AdminClient.getReportsSales({ ...params, groupBy: salesGroupBy }),
          AdminClient.getReportsOrders(params),
        ]);
        if (salesRes.success) {
          setSalesTrends(salesRes.trends || []);
          setSalesKpis(salesRes.kpis);
        }
        if (ordersRes.success) {
          setOrderDistribution(ordersRes.distribution || []);
          setDailyOrderTrends(ordersRes.dailyTrends || []);
        }
      } else if (activeTab === 'PRODUCTS') {
        const res = await AdminClient.getReportsProducts({
          ...params,
          page: prodPage,
          pageSize: 25,
          search: prodSearch,
          sortBy: prodSortBy,
        });
        if (res.success) {
          setProducts(res.products || []);
          setTopProducts(res.topProducts);
          setProdTotalPages(res.pagination?.totalPages || 1);
        }
      } else if (activeTab === 'RETAILERS') {
        const res = await AdminClient.getReportsRetailers({
          ...params,
          page: retPage,
          pageSize: 25,
          search: retSearch,
          sortBy: retSortBy,
        });
        if (res.success) {
          setRetailers(res.retailers || []);
          setTopRetailers(res.topRetailers);
          setRetTotalPages(res.pagination?.totalPages || 1);
        }
      } else if (activeTab === 'WAREHOUSE') {
        const res = await AdminClient.getReportsWarehouse(params);
        if (res.success) {
          setWarehouseMetrics(res.warehouseMetrics);
        }
      } else if (activeTab === 'DELIVERY') {
        const res = await AdminClient.getReportsDelivery({
          ...params,
          page: delPage,
          pageSize: 25,
          search: delSearch,
        });
        if (res.success) {
          setDeliveryPartners(res.partners || []);
          setDelTotalPages(res.pagination?.totalPages || 1);
        }
      } else if (activeTab === 'COD') {
        const res = await AdminClient.getReportsCod(params);
        if (res.success) {
          setCodMetrics(res.codMetrics);
        }
      } else if (activeTab === 'CANCELLATIONS') {
        const [canRes, failRes, retRes] = await Promise.all([
          AdminClient.getReportsCancellations(params),
          AdminClient.getReportsFailedDeliveries(params),
          AdminClient.getReportsReturns(params),
        ]);
        if (canRes.success) setCancellationMetrics(canRes.cancellationMetrics);
        if (failRes.success) setFailedMetrics(failRes.failedMetrics);
        if (retRes.success) setReturnMetrics(retRes.returnMetrics);
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching tab data.');
    } finally {
      setLoadingTab(false);
    }
  }, [
    activeTab,
    preset,
    customDateFrom,
    customDateTo,
    salesGroupBy,
    prodPage,
    prodSearch,
    prodSortBy,
    retPage,
    retSearch,
    retSortBy,
    delPage,
    delSearch,
  ]);

  // Initial and change triggers
  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchTabData();
  }, [fetchTabData]);

  // Handle Export CSV
  const handleExportCsv = async () => {
    setExporting(true);
    let exportType = 'sales';
    if (activeTab === 'SALES_ORDERS') exportType = 'sales';
    else if (activeTab === 'PRODUCTS') exportType = 'products';
    else if (activeTab === 'RETAILERS') exportType = 'retailers';
    else if (activeTab === 'DELIVERY') exportType = 'delivery';
    else if (activeTab === 'COD') exportType = 'cod';
    else if (activeTab === 'CANCELLATIONS') exportType = 'cancellations';

    try {
      const res = await AdminClient.exportReportCsv({
        type: exportType,
        preset,
        dateFrom: preset === 'CUSTOM' ? customDateFrom : undefined,
        dateTo: preset === 'CUSTOM' ? customDateTo : undefined,
      });

      if (res.success && res.blob) {
        const url = window.URL.createObjectURL(res.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.filename || `mr_futkar_${exportType}_report.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        alert(res.error || 'Failed to export CSV report.');
      }
    } catch {
      alert('Error initiating CSV download.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header & Meta Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Reports & Business Analytics
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
              <ShieldCheck className="w-3.5 h-3.5" />
              SUPER ADMIN
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Server-authoritative enterprise reporting, financial reconciliation, and operational audit
          </p>
        </div>

        {/* Global Metadata Badges & Actions */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-medium border border-slate-200">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>IST (Asia/Kolkata)</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 font-medium border border-emerald-200">
            <span className="font-bold">₹</span>
            <span>INR Currency</span>
          </div>
          <button
            onClick={() => {
              fetchSummary();
              fetchTabData();
            }}
            disabled={loadingSummary || loadingTab}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-semibold border border-slate-300 transition-colors shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingSummary || loadingTab ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors shadow-2xs disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exporting ? 'Exporting...' : 'Export CSV'}</span>
          </button>
        </div>
      </div>

      {/* Date Range Selector Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1">
            <Calendar className="w-3.5 h-3.5" />
            Range:
          </span>
          {(
            [
              { key: 'TODAY', label: 'Today' },
              { key: 'YESTERDAY', label: 'Yesterday' },
              { key: 'LAST_7_DAYS', label: 'Last 7 Days' },
              { key: 'LAST_30_DAYS', label: 'Last 30 Days' },
              { key: 'THIS_MONTH', label: 'This Month' },
              { key: 'LAST_MONTH', label: 'Last Month' },
              { key: 'CUSTOM', label: 'Custom' },
            ] as const
          ).map(p => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                preset === p.key
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom Range Input */}
        {preset === 'CUSTOM' && (
          <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
            <div className="flex items-center gap-1 text-xs">
              <span className="text-slate-500">From:</span>
              <input
                type="date"
                value={customDateFrom}
                onChange={e => setCustomDateFrom(e.target.value)}
                className="px-2 py-1 rounded bg-white border border-slate-300 text-xs font-medium text-slate-800"
              />
            </div>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-slate-500">To:</span>
              <input
                type="date"
                value={customDateTo}
                onChange={e => setCustomDateTo(e.target.value)}
                className="px-2 py-1 rounded bg-white border border-slate-300 text-xs font-medium text-slate-800"
              />
            </div>
            <button
              onClick={() => {
                fetchSummary();
                fetchTabData();
              }}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded"
            >
              Apply
            </button>
          </div>
        )}

        {/* Active Bounds Display */}
        <div className="text-xs text-slate-500 flex items-center gap-1.5 ml-auto">
          <span>Active Window:</span>
          <span className="font-semibold text-slate-800">
            {activeDateFrom || '...'} to {activeDateTo || '...'}
          </span>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-center gap-3 text-sm">
          <AlertOctagon className="w-5 h-5 shrink-0 text-rose-600" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-xs underline font-semibold text-rose-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Executive Summary KPIs Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
        <AdminStatCard
          label="Gross Sales"
          value={formatInr(kpis?.grossSales)}
          subValue="Non-cancelled Orders"
          icon="💰"
          accentColor="#2563eb"
        />
        <AdminStatCard
          label="Delivered Sales"
          value={formatInr(kpis?.deliveredSales)}
          subValue={`${kpis?.deliveredOrders ?? 0} Orders Handed Over`}
          icon="✅"
          accentColor="#16a34a"
        />
        <AdminStatCard
          label="Total Orders"
          value={String(kpis?.totalOrders ?? 0)}
          subValue={`AOV: ${formatInr(kpis?.averageOrderValue)}`}
          icon="📦"
          accentColor="#9333ea"
        />
        <AdminStatCard
          label="Pending COD"
          value={formatInr(kpis?.pendingCod)}
          subValue="Awaiting reconciliation"
          icon="⏳"
          accentColor="#d97706"
        />
        <AdminStatCard
          label="Collected COD"
          value={formatInr(kpis?.collectedCod)}
          subValue="Cash verified in hand"
          icon="💵"
          accentColor="#16a34a"
        />
        <AdminStatCard
          label="Cancelled Value"
          value={formatInr(kpis?.cancelledValue)}
          subValue={`${kpis?.cancelledOrders ?? 0} Orders Cancelled`}
          icon="❌"
          accentColor="#dc2626"
        />
        <AdminStatCard
          label="Failed Deliveries"
          value={String(kpis?.failedDeliveries ?? 0)}
          subValue={formatInr(kpis?.failedDeliveryValue)}
          icon="⚠️"
          accentColor="#d97706"
        />
        <AdminStatCard
          label="Returns to Hub"
          value={String(kpis?.returnToWarehouseOrders ?? 0)}
          subValue={formatInr(kpis?.returnToWarehouseValue)}
          icon="↩️"
          accentColor="#9333ea"
        />
        <AdminStatCard
          label="Active Retailers"
          value={String(kpis?.activeRetailers ?? 0)}
          subValue="Platform registered"
          icon="🏪"
          accentColor="#2563eb"
        />
        <AdminStatCard
          label="Delivery Fleet"
          value={String(kpis?.activeDeliveryPartners ?? 0)}
          subValue="Active delivery partners"
          icon="🚚"
          accentColor="#16a34a"
        />
      </div>

      {/* Main Tab Navigation */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="flex border-b border-slate-200 overflow-x-auto scrollbar-none bg-slate-50/70 p-1.5 gap-1">
          {[
            { key: 'SALES_ORDERS', label: 'Sales & Orders', icon: TrendingUp },
            { key: 'PRODUCTS', label: 'Products & SKUs', icon: Package },
            { key: 'RETAILERS', label: 'Retailers', icon: Store },
            { key: 'WAREHOUSE', label: 'Warehouse Hub', icon: Warehouse },
            { key: 'DELIVERY', label: 'Delivery Fleet', icon: Truck },
            { key: 'COD', label: 'COD & Financials', icon: DollarSign },
            { key: 'CANCELLATIONS', label: 'Cancellations & Returns', icon: AlertOctagon },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Container */}
        <div className="p-5">
          {loadingTab ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-xs font-medium">Aggregating authoritative report metrics...</p>
            </div>
          ) : (
            <>
              {/* ============================================================== */}
              {/* TAB 1: SALES & ORDERS                                         */}
              {/* ============================================================== */}
              {activeTab === 'SALES_ORDERS' && (
                <div className="space-y-6">
                  {/* Sub-toolbar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Periodic Revenue & Order Trends</h3>
                      <p className="text-xs text-slate-500">
                        Historical gross sales and delivered orders volume over time
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-400">Group By:</span>
                      {(['daily', 'weekly', 'monthly'] as const).map(gb => (
                        <button
                          key={gb}
                          onClick={() => setSalesGroupBy(gb)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase ${
                            salesGroupBy === gb
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {gb}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Periodic Trend Visualizer */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Revenue Trend ({salesGroupBy})
                      </span>
                      {salesKpis?.peakSalesDay && (
                        <span className="text-xs text-slate-600 bg-white px-2.5 py-1 rounded-md border border-slate-200">
                          Peak Revenue Day: <strong className="text-blue-700">{salesKpis.peakSalesDay}</strong>
                        </span>
                      )}
                    </div>

                    {salesTrends.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 text-xs font-medium">
                        No order activity recorded in this date range.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {salesTrends.map(t => {
                          const maxGross = Math.max(...salesTrends.map(x => x.grossSales), 1);
                          const pct = Math.min(100, Math.round((t.grossSales / maxGross) * 100));
                          return (
                            <div key={t.period} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-slate-700">{t.label}</span>
                                <div className="flex items-center gap-3">
                                  <span className="text-slate-500">{t.ordersCount} orders</span>
                                  <span className="font-bold text-slate-900">{formatInr(t.grossSales)}</span>
                                </div>
                              </div>
                              <div className="w-full h-3.5 bg-slate-200/80 rounded-full overflow-hidden flex">
                                <div
                                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Canonical Order Status Distribution */}
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 mb-3">
                      Canonical Order Status Distribution
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {orderDistribution.map(item => (
                        <div
                          key={item.status}
                          className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800">{item.label}</span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                              {item.percentage}%
                            </span>
                          </div>
                          <div className="mt-3 flex items-baseline justify-between">
                            <span className="text-lg font-extrabold text-slate-900">{item.count}</span>
                            <span className="text-xs font-medium text-slate-500">
                              {formatInr(item.totalValue)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* TAB 2: PRODUCTS & SKUS                                        */}
              {/* ============================================================== */}
              {activeTab === 'PRODUCTS' && (
                <div className="space-y-6">
                  {/* Top Products Cards */}
                  {topProducts && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Top by Quantity */}
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                          🔥 Top Products by Volume
                        </span>
                        <div className="mt-3 space-y-2">
                          {topProducts.byQuantity?.slice(0, 3).map((p: any) => (
                            <div key={p.productId} className="flex items-center justify-between text-xs">
                              <span className="truncate max-w-[170px] font-medium text-slate-800">
                                {p.productName}
                              </span>
                              <span className="font-bold text-slate-900">{p.quantitySold} units</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Top by Sales */}
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                          💎 Top Products by Revenue
                        </span>
                        <div className="mt-3 space-y-2">
                          {topProducts.bySales?.slice(0, 3).map((p: any) => (
                            <div key={p.productId} className="flex items-center justify-between text-xs">
                              <span className="truncate max-w-[170px] font-medium text-slate-800">
                                {p.productName}
                              </span>
                              <span className="font-bold text-slate-900">{formatInr(p.salesValue)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Top by Frequency */}
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <span className="text-xs font-bold text-purple-700 uppercase tracking-wider">
                          📦 Most Frequently Ordered
                        </span>
                        <div className="mt-3 space-y-2">
                          {topProducts.byFrequency?.slice(0, 3).map((p: any) => (
                            <div key={p.productId} className="flex items-center justify-between text-xs">
                              <span className="truncate max-w-[170px] font-medium text-slate-800">
                                {p.productName}
                              </span>
                              <span className="font-bold text-slate-900">{p.orderCount} orders</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Search and Table Filter */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="relative w-full sm:w-80">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search product name or SKU..."
                        value={prodSearch}
                        onChange={e => {
                          setProdSearch(e.target.value);
                          setProdPage(1);
                        }}
                        className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex items-center gap-2 self-end text-xs">
                      <span className="text-slate-500">Sort By:</span>
                      <select
                        value={prodSortBy}
                        onChange={e => setProdSortBy(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700"
                      >
                        <option value="salesValue">Revenue (₹)</option>
                        <option value="quantitySold">Quantity Sold</option>
                        <option value="orderCount">Order Count</option>
                        <option value="currentStock">Current Stock</option>
                      </select>
                    </div>
                  </div>

                  {/* Products Data Table */}
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100/80 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3">Product / SKU</th>
                          <th className="px-4 py-3 text-right">Units Sold</th>
                          <th className="px-4 py-3 text-right">Avg Selling Price</th>
                          <th className="px-4 py-3 text-right">Total Revenue</th>
                          <th className="px-4 py-3 text-center">Orders</th>
                          <th className="px-4 py-3 text-center">Stock Level</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {products.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                              No products found matching criteria.
                            </td>
                          </tr>
                        ) : (
                          products.map(p => (
                            <tr key={p.productId} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3">
                                <div className="font-semibold text-slate-900">{p.productName}</div>
                                <div className="text-[11px] text-slate-400 font-mono">SKU: {p.sku}</div>
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-slate-800">
                                {p.quantitySold}
                              </td>
                              <td className="px-4 py-3 text-right text-slate-600">
                                {formatInr(p.averageSellingPrice)}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-emerald-700">
                                {formatInr(p.salesValue)}
                              </td>
                              <td className="px-4 py-3 text-center text-slate-600">{p.orderCount}</td>
                              <td className="px-4 py-3 text-center">
                                {p.isLowStock ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                    <AlertTriangle className="w-3 h-3" />
                                    Low Stock ({p.currentStock})
                                  </span>
                                ) : (
                                  <span className="text-slate-700 font-medium">
                                    {p.currentStock} in stock
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
                    <span>
                      Page {prodPage} of {prodTotalPages}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setProdPage(p => Math.max(1, p - 1))}
                        disabled={prodPage <= 1}
                        className="p-1 rounded bg-white border border-slate-300 disabled:opacity-40"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setProdPage(p => Math.min(prodTotalPages, p + 1))}
                        disabled={prodPage >= prodTotalPages}
                        className="p-1 rounded bg-white border border-slate-300 disabled:opacity-40"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* TAB 3: RETAILERS                                              */}
              {/* ============================================================== */}
              {activeTab === 'RETAILERS' && (
                <div className="space-y-6">
                  {/* Top Retailers Summary */}
                  {topRetailers && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                          🏪 Top Kiranas by Revenue
                        </span>
                        <div className="mt-3 space-y-2">
                          {topRetailers.bySales?.slice(0, 3).map((r: any) => (
                            <div key={r.retailerId} className="flex items-center justify-between text-xs">
                              <span className="truncate max-w-[200px] font-semibold text-slate-800">
                                {r.shopName}
                              </span>
                              <span className="font-bold text-slate-900">{formatInr(r.totalSalesValue)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                          📦 Top Kiranas by Order Frequency
                        </span>
                        <div className="mt-3 space-y-2">
                          {topRetailers.byOrders?.slice(0, 3).map((r: any) => (
                            <div key={r.retailerId} className="flex items-center justify-between text-xs">
                              <span className="truncate max-w-[200px] font-semibold text-slate-800">
                                {r.shopName}
                              </span>
                              <span className="font-bold text-slate-900">{r.orderCount} orders</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Search and Table */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="relative w-full sm:w-80">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search Kirana store or owner..."
                        value={retSearch}
                        onChange={e => {
                          setRetSearch(e.target.value);
                          setRetPage(1);
                        }}
                        className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex items-center gap-2 self-end text-xs">
                      <span className="text-slate-500">Sort By:</span>
                      <select
                        value={retSortBy}
                        onChange={e => setRetSortBy(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700"
                      >
                        <option value="totalSalesValue">Total Procurement (₹)</option>
                        <option value="orderCount">Order Count</option>
                        <option value="shopName">Shop Name</option>
                      </select>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100/80 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3">Kirana Store</th>
                          <th className="px-4 py-3">Owner & Contact</th>
                          <th className="px-4 py-3 text-center">Orders</th>
                          <th className="px-4 py-3 text-center">Delivered</th>
                          <th className="px-4 py-3 text-right">Total Procurement</th>
                          <th className="px-4 py-3 text-right">AOV</th>
                          <th className="px-4 py-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {retailers.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                              No retailers found.
                            </td>
                          </tr>
                        ) : (
                          retailers.map(r => (
                            <tr key={r.retailerId} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3">
                                <div className="font-bold text-slate-900">{r.shopName}</div>
                                <div className="text-[11px] text-slate-400 font-mono">{r.retailerId}</div>
                              </td>
                              <td className="px-4 py-3 text-slate-700">
                                <div>{r.ownerName}</div>
                                <div className="text-[11px] text-slate-400">{r.mobile}</div>
                              </td>
                              <td className="px-4 py-3 text-center font-semibold text-slate-800">
                                {r.orderCount}
                              </td>
                              <td className="px-4 py-3 text-center text-emerald-700 font-medium">
                                {r.deliveredOrderCount}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-blue-700">
                                {formatInr(r.totalSalesValue)}
                              </td>
                              <td className="px-4 py-3 text-right text-slate-600">
                                {formatInr(r.averageOrderValue)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    r.status === 'ACTIVE'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {r.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
                    <span>
                      Page {retPage} of {retTotalPages}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setRetPage(p => Math.max(1, p - 1))}
                        disabled={retPage <= 1}
                        className="p-1 rounded bg-white border border-slate-300 disabled:opacity-40"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setRetPage(p => Math.min(retTotalPages, p + 1))}
                        disabled={retPage >= retTotalPages}
                        className="p-1 rounded bg-white border border-slate-300 disabled:opacity-40"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* TAB 4: WAREHOUSE HUB                                          */}
              {/* ============================================================== */}
              {activeTab === 'WAREHOUSE' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Fulfillment Funnel — {warehouseMetrics?.warehouseName || 'MR FUTKAR — BRAHMPURI'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Fulfillment throughput and inventory movement audit
                    </p>
                  </div>

                  {/* Funnel Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      <span className="text-xs font-bold text-slate-500">Accepted</span>
                      <div className="text-xl font-black text-slate-900 mt-1">
                        {warehouseMetrics?.acceptedCount ?? 0}
                      </div>
                    </div>
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      <span className="text-xs font-bold text-slate-500">Picked</span>
                      <div className="text-xl font-black text-slate-900 mt-1">
                        {warehouseMetrics?.pickedCount ?? 0}
                      </div>
                    </div>
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      <span className="text-xs font-bold text-slate-500">Packed</span>
                      <div className="text-xl font-black text-slate-900 mt-1">
                        {warehouseMetrics?.packedCount ?? 0}
                      </div>
                    </div>
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      <span className="text-xs font-bold text-slate-500">Ready for Dispatch</span>
                      <div className="text-xl font-black text-slate-900 mt-1">
                        {warehouseMetrics?.readyForDispatchCount ?? 0}
                      </div>
                    </div>
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      <span className="text-xs font-bold text-emerald-700">Dispatched</span>
                      <div className="text-xl font-black text-emerald-700 mt-1">
                        {warehouseMetrics?.dispatchedCount ?? 0}
                      </div>
                    </div>
                    <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200">
                      <span className="text-xs font-bold text-amber-800">Pending in Hub</span>
                      <div className="text-xl font-black text-amber-800 mt-1">
                        {warehouseMetrics?.pendingOrdersCount ?? 0}
                      </div>
                    </div>
                  </div>

                  {/* Stock Adjustments Audit Section */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-bold text-slate-900">
                        Stock Movement Audit Trail ({warehouseMetrics?.stockAdjustmentsCount ?? 0} Adjustments)
                      </h4>
                    </div>
                    {warehouseMetrics?.movementReasonsBreakdown &&
                    Object.keys(warehouseMetrics.movementReasonsBreakdown).length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {Object.entries(warehouseMetrics.movementReasonsBreakdown).map(([reason, count]) => (
                          <div key={reason} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                              {reason}
                            </span>
                            <div className="text-lg font-bold text-slate-900 mt-1">{count} entries</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 py-4 text-center">
                        No inventory adjustments recorded in this window.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* TAB 5: DELIVERY FLEET                                         */}
              {/* ============================================================== */}
              {activeTab === 'DELIVERY' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Delivery Fleet Performance</h3>
                      <p className="text-xs text-slate-500">
                        Consignment handover success, delivery rates, and COD collection status
                      </p>
                    </div>
                    <div className="relative w-full sm:w-72">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search partner name..."
                        value={delSearch}
                        onChange={e => {
                          setDelSearch(e.target.value);
                          setDelPage(1);
                        }}
                        className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100/80 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3">Partner Name</th>
                          <th className="px-4 py-3 text-center">Assigned</th>
                          <th className="px-4 py-3 text-center">Delivered</th>
                          <th className="px-4 py-3 text-center">Failed</th>
                          <th className="px-4 py-3 text-center">Returned</th>
                          <th className="px-4 py-3 text-center">Success Rate</th>
                          <th className="px-4 py-3 text-right">Pending COD</th>
                          <th className="px-4 py-3 text-right">Collected COD</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {deliveryPartners.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                              No delivery partner activity found.
                            </td>
                          </tr>
                        ) : (
                          deliveryPartners.map(p => (
                            <tr key={p.partnerId} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3">
                                <div className="font-bold text-slate-900">{p.name}</div>
                                <div className="text-[11px] text-slate-400">
                                  {p.vehicleType || 'Fleet'} • {p.mobile}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center font-semibold text-slate-700">
                                {p.assignedCount}
                              </td>
                              <td className="px-4 py-3 text-center font-bold text-emerald-700">
                                {p.deliveredCount}
                              </td>
                              <td className="px-4 py-3 text-center font-bold text-amber-700">
                                {p.failedCount}
                              </td>
                              <td className="px-4 py-3 text-center text-purple-700 font-medium">
                                {p.returnedCount}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    p.successRate >= 90
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : p.successRate >= 75
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-rose-100 text-rose-800'
                                  }`}
                                >
                                  {p.successRate}%
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-amber-800">
                                {formatInr(p.codPending)}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-emerald-700">
                                {formatInr(p.codCollected)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
                    <span>
                      Page {delPage} of {delTotalPages}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setDelPage(p => Math.max(1, p - 1))}
                        disabled={delPage <= 1}
                        className="p-1 rounded bg-white border border-slate-300 disabled:opacity-40"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDelPage(p => Math.min(delTotalPages, p + 1))}
                        disabled={delPage >= delTotalPages}
                        className="p-1 rounded bg-white border border-slate-300 disabled:opacity-40"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* TAB 6: COD & FINANCIALS                                       */}
              {/* ============================================================== */}
              {activeTab === 'COD' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Cash on Delivery (COD) Reconciliation
                    </h3>
                    <p className="text-xs text-slate-500">
                      Audit trails for physical cash collected during Kirana drop-offs
                    </p>
                  </div>

                  {/* COD Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <span className="text-xs font-semibold text-slate-500 uppercase">
                        Total COD Orders
                      </span>
                      <div className="text-2xl font-black text-slate-900 mt-1">
                        {codMetrics?.totalCodOrders ?? 0}
                      </div>
                      <span className="text-xs text-slate-500 mt-1">
                        Value: {formatInr(codMetrics?.totalCodValue)}
                      </span>
                    </div>

                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                      <span className="text-xs font-semibold text-emerald-800 uppercase">
                        Collected COD
                      </span>
                      <div className="text-2xl font-black text-emerald-800 mt-1">
                        {formatInr(codMetrics?.collectedCodValue)}
                      </div>
                      <span className="text-xs text-emerald-700 mt-1">Handed over & verified</span>
                    </div>

                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                      <span className="text-xs font-semibold text-amber-800 uppercase">
                        Pending In Transit
                      </span>
                      <div className="text-2xl font-black text-amber-800 mt-1">
                        {formatInr(codMetrics?.pendingCodValue)}
                      </div>
                      <span className="text-xs text-amber-700 mt-1">With rider or awaiting delivery</span>
                    </div>

                    <div className="bg-rose-50 p-4 rounded-xl border border-rose-200">
                      <span className="text-xs font-semibold text-rose-800 uppercase">
                        Failed / Cancelled COD
                      </span>
                      <div className="text-2xl font-black text-rose-800 mt-1">
                        {formatInr(codMetrics?.failedCodValue)}
                      </div>
                      <span className="text-xs text-rose-700 mt-1">Undelivered consignments</span>
                    </div>
                  </div>

                  {/* Partner-wise COD breakdown */}
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 mb-3">Partner-wise COD Holdings</h4>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100/80 text-slate-600 font-semibold border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3">Delivery Partner</th>
                            <th className="px-4 py-3 text-center">COD Orders</th>
                            <th className="px-4 py-3 text-right">Pending Cash</th>
                            <th className="px-4 py-3 text-right">Collected Cash</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                          {!codMetrics?.partnerBreakdown || codMetrics.partnerBreakdown.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                                No COD partner holdings in this window.
                              </td>
                            </tr>
                          ) : (
                            codMetrics.partnerBreakdown.map(p => (
                              <tr key={p.partnerId} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3 font-semibold text-slate-800">{p.partnerName}</td>
                                <td className="px-4 py-3 text-center text-slate-600">{p.orderCount}</td>
                                <td className="px-4 py-3 text-right font-bold text-amber-700">
                                  {formatInr(p.pendingCod)}
                                </td>
                                <td className="px-4 py-3 text-right font-bold text-emerald-700">
                                  {formatInr(p.collectedCod)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* TAB 7: CANCELLATIONS & RETURNS                                */}
              {/* ============================================================== */}
              {activeTab === 'CANCELLATIONS' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Cancellations, Failures & Returns Root Causes
                    </h3>
                    <p className="text-xs text-slate-500">
                      Post-order failure inspection, return-to-warehouse tracking, and reason audits
                    </p>
                  </div>

                  {/* Summary Metric Strip */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-rose-50 p-4 rounded-xl border border-rose-200">
                      <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">
                        Cancellations
                      </span>
                      <div className="text-2xl font-black text-rose-900 mt-1">
                        {cancellationMetrics?.cancellationCount ?? 0}
                      </div>
                      <div className="flex items-center justify-between text-xs text-rose-700 mt-1">
                        <span>Rate: {cancellationMetrics?.cancellationRate ?? 0}%</span>
                        <span>{formatInr(cancellationMetrics?.cancellationValue)}</span>
                      </div>
                    </div>

                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                      <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">
                        Failed Deliveries
                      </span>
                      <div className="text-2xl font-black text-amber-900 mt-1">
                        {failedMetrics?.failedDeliveryCount ?? 0}
                      </div>
                      <div className="flex items-center justify-between text-xs text-amber-700 mt-1">
                        <span>Value: {formatInr(failedMetrics?.failedDeliveryValue)}</span>
                      </div>
                    </div>

                    <div className="bg-purple-50 p-4 rounded-xl border border-purple-200">
                      <span className="text-xs font-bold text-purple-800 uppercase tracking-wider">
                        Returns to Warehouse
                      </span>
                      <div className="text-2xl font-black text-purple-900 mt-1">
                        {returnMetrics?.returnCount ?? 0}
                      </div>
                      <div className="flex items-center justify-between text-xs text-purple-700 mt-1">
                        <span>Value: {formatInr(returnMetrics?.returnValue)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Root Cause Reason Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Cancellation Reasons */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                        Cancellation Reasons
                      </h4>
                      {cancellationMetrics?.reasonsBreakdown &&
                      Object.keys(cancellationMetrics.reasonsBreakdown).length > 0 ? (
                        <div className="space-y-2">
                          {Object.entries(cancellationMetrics.reasonsBreakdown).map(([reason, count]) => (
                            <div key={reason} className="flex items-center justify-between text-xs">
                              <span className="font-medium text-slate-700">{reason}</span>
                              <span className="font-bold text-slate-900 px-2 py-0.5 rounded-full bg-white border border-slate-200">
                                {count}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 py-4 text-center">No cancellations recorded.</p>
                      )}
                    </div>

                    {/* Delivery Failure Reasons */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                        Delivery Failure Reasons
                      </h4>
                      {failedMetrics?.reasonsBreakdown &&
                      Object.keys(failedMetrics.reasonsBreakdown).length > 0 ? (
                        <div className="space-y-2">
                          {Object.entries(failedMetrics.reasonsBreakdown).map(([reason, count]) => (
                            <div key={reason} className="flex items-center justify-between text-xs">
                              <span className="font-medium text-slate-700">{reason}</span>
                              <span className="font-bold text-slate-900 px-2 py-0.5 rounded-full bg-white border border-slate-200">
                                {count}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 py-4 text-center">No failed deliveries recorded.</p>
                      )}
                    </div>
                  </div>

                  {/* Return Consignment Log Table */}
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 mb-3">
                      Recent Return Consignments to WH-BRAHMPURI-01
                    </h4>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100/80 text-slate-600 font-semibold border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3">Order ID</th>
                            <th className="px-4 py-3">Date (IST)</th>
                            <th className="px-4 py-3">Kirana Store</th>
                            <th className="px-4 py-3">Return Reason</th>
                            <th className="px-4 py-3 text-right">Value</th>
                            <th className="px-4 py-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                          {!returnMetrics?.recentReturns || returnMetrics.recentReturns.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                                No return consignments staged in this period.
                              </td>
                            </tr>
                          ) : (
                            returnMetrics.recentReturns.map(ret => (
                              <tr key={ret.returnId} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3 font-mono font-bold text-slate-900">
                                  {ret.orderId}
                                </td>
                                <td className="px-4 py-3 text-slate-500">{ret.date}</td>
                                <td className="px-4 py-3 text-slate-700 font-medium">{ret.shopName}</td>
                                <td className="px-4 py-3 text-slate-600">{ret.reason}</td>
                                <td className="px-4 py-3 text-right font-bold text-purple-700">
                                  {formatInr(ret.value)}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                                    {ret.status}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
