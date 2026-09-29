import React, { useEffect, useState, useCallback } from 'react';
import { AdminClient } from '../../services/adminClient';
import { AdminDashboardData } from '../../types/admin';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminStatCard } from '../../components/admin/AdminStatCard';
import { AdminStatusBadge } from '../../components/admin/AdminStatusBadge';
import { CashBankBalanceCard } from '../../components/accounting/CashBankBalanceCard';

export const AdminDashboardScreen: React.FC<{ onNavigateToOrders?: (orderId?: string) => void }> = ({
  onNavigateToOrders,
}) => {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    const result = await AdminClient.fetchDashboard();

    if (result.success && result.data) {
      setData(result.data);
      setLastRefreshedAt(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } else {
      setData(null);
      setError(result.message || 'Unable to load dashboard data.');
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    fetchDashboardData(false);
  }, [fetchDashboardData]);

  const formatCurrency = (val: number | null | undefined): string => {
    if (val === undefined || val === null) return '--';
    return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (isoString: string): string => {
    if (!isoString) return '--';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page Header with Refresh Action */}
      <AdminPageHeader
        title="Operations Dashboard"
        subtitle="Real-time overview of orders, inventory, logistics, and retail partners"
        badge="Live Metrics"
        actions={
          <div className="flex items-center gap-3">
            {lastRefreshedAt && !error && (
              <span className="text-xs text-slate-400 hidden sm:inline">
                Updated {lastRefreshedAt}
              </span>
            )}
            <button
              onClick={() => fetchDashboardData(true)}
              disabled={isLoading || isRefreshing}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold text-slate-900 bg-[#f5b024] hover:bg-[#d49b42] transition-colors shadow-xs flex items-center gap-2 ${
                isRefreshing ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              <span className={isRefreshing ? 'animate-spin' : ''}>🔄</span>
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        }
      />

      {/* Error Banner with Retry */}
      {error && !isLoading && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-center space-y-3">
          <div className="text-2xl">⚠️</div>
          <h2 className="text-base font-bold text-rose-900">Unable to load dashboard data</h2>
          <p className="text-sm text-rose-600 max-w-md mx-auto">{error}</p>
          <button
            onClick={() => fetchDashboardData(false)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors inline-flex items-center gap-1.5 shadow-sm"
          >
            <span>🔄</span> Retry
          </button>
        </div>
      )}

      {/* Phase 6 Part 4C-B: Authoritative Ledger-Backed Cash & Bank Balance Summary */}
      <CashBankBalanceCard
        fetchBalances={(bypassCache) => AdminClient.getAccountingBalances(bypassCache)}
        title="Admin Central Accounting Ledger Balances"
        subtitle="General Ledger Cash in Hand (A/C 1100) & Bank Balance (A/C 1200) • Strictly Read-Only"
      />

      {/* 8 Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Today's Sales */}
        <AdminStatCard
          label="Today's Sales"
          value={isLoading ? undefined : data ? formatCurrency(data.salesToday) : '--'}
          subLabel="valid placed orders"
          subValue={data?.salesToday !== undefined ? `${data.ordersToday} orders` : undefined}
          icon="💰"
          isLoading={isLoading}
          error={error}
          accentColor="#059669"
        />

        {/* 2. Today's Orders */}
        <AdminStatCard
          label="Today's Orders"
          value={isLoading ? undefined : data?.ordersToday !== undefined ? data.ordersToday : '--'}
          subLabel="excluding cancellations"
          icon="📦"
          isLoading={isLoading}
          error={error}
          accentColor="#f5b024"
        />

        {/* 3. Pending Orders */}
        <AdminStatCard
          label="Pending Orders"
          value={isLoading ? undefined : data?.pendingOrders !== undefined ? data.pendingOrders : '--'}
          subLabel="in fulfillment pipeline"
          icon="⏳"
          isLoading={isLoading}
          error={error}
          accentColor="#d49b42"
        />

        {/* 4. Delivered Orders */}
        <AdminStatCard
          label="Delivered Orders"
          value={isLoading ? undefined : data?.deliveredOrdersToday !== undefined ? data.deliveredOrdersToday : '--'}
          subLabel="delivered today"
          subValue={data?.deliveredOrders !== undefined ? `${data.deliveredOrders} total` : undefined}
          icon="✅"
          isLoading={isLoading}
          error={error}
          accentColor="#059669"
        />

        {/* 5. Active Retailers */}
        <AdminStatCard
          label="Active Retailers"
          value={isLoading ? undefined : data?.activeRetailers !== undefined ? data.activeRetailers : '--'}
          subLabel="verified accounts"
          icon="🏪"
          isLoading={isLoading}
          error={error}
          accentColor="#0d1d25"
        />

        {/* 6. Active Delivery Partners */}
        <AdminStatCard
          label="Active Delivery Partners"
          value={isLoading ? undefined : data?.activeDeliveryPartners !== undefined ? data.activeDeliveryPartners : '--'}
          subLabel="on-duty fleet"
          icon="🚚"
          isLoading={isLoading}
          error={error}
          accentColor="#0284c7"
        />

        {/* 7. Low Stock Products */}
        <AdminStatCard
          label="Low Stock Products"
          value={isLoading ? undefined : data?.lowStockProducts !== undefined ? data.lowStockProducts : '--'}
          subLabel="at or below threshold"
          icon="⚠️"
          isLoading={isLoading}
          error={error}
          accentColor="#e72b2b"
        />

        {/* 8. COD Pending */}
        <AdminStatCard
          label="COD Pending"
          value={isLoading ? undefined : data ? formatCurrency(data.codPending) : '--'}
          subLabel="cash awaiting collection"
          icon="💵"
          isLoading={isLoading}
          error={error}
          accentColor="#d49b42"
        />
      </div>

      {/* Two Column Layout: Recent Orders & Top Selling Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders Section (2 Cols on Desktop) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Recent Orders</h2>
              <p className="text-xs text-slate-500 mt-0.5">Authoritative snapshot of the latest 10 wholesale orders</p>
            </div>
            <div className="flex items-center gap-2">
              {data?.recentOrders && data.recentOrders.length > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  Latest {data.recentOrders.length}
                </span>
              )}
              {onNavigateToOrders && (
                <button
                  type="button"
                  onClick={() => onNavigateToOrders()}
                  className="text-xs font-bold px-2.5 py-1 rounded bg-[#0d1d25] text-[#f5b024] hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  View All Orders →
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-10 bg-slate-100 animate-pulse rounded" />
                ))}
              </div>
            ) : !data || data.recentOrders.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <div className="text-3xl mb-2">📦</div>
                <div className="text-sm font-semibold text-slate-600">No orders yet.</div>
                <div className="text-xs mt-1">Wholesale orders placed by retailers will appear here.</div>
              </div>
            ) : (
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">Order Number</th>
                    <th className="px-4 py-3">Retailer</th>
                    <th className="px-4 py-3">Items</th>
                    <th className="px-4 py-3">Grand Total</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentOrders.map(order => (
                    <tr
                      key={order.orderId}
                      onClick={() => onNavigateToOrders?.(order.orderId)}
                      className={`transition-colors ${
                        onNavigateToOrders ? 'cursor-pointer hover:bg-amber-50/50' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      <td className="px-4 py-3 font-bold text-slate-900">
                        {order.orderNumber}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{order.shopName}</div>
                        <div className="text-[11px] text-slate-500">{order.retailerName}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={order.itemsSummary}>
                        <span className="font-semibold text-slate-800">{order.itemCount} items:</span>{' '}
                        <span className="text-[11px]">{order.itemsSummary || 'Standard package'}</span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900">
                        {formatCurrency(order.grandTotal)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{order.paymentMethod}</div>
                        <div className="text-[10px] text-slate-500">{order.paymentStatus}</div>
                      </td>
                      <td className="px-4 py-3">
                        <AdminStatusBadge status={order.orderStatus} />
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-[11px]">
                        {formatDate(order.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Top Selling Products Section (1 Col on Desktop) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-5 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">Top Selling Products</h2>
              <p className="text-xs text-slate-500 mt-0.5">Top products by quantity and sales volume</p>
            </div>

            <div className="overflow-x-auto">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-10 bg-slate-100 animate-pulse rounded" />
                  ))}
                </div>
              ) : !data || data.topSellingProducts.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <div className="text-3xl mb-2">🏷️</div>
                  <div className="text-sm font-semibold text-slate-600">No sales data available.</div>
                  <div className="text-xs mt-1">Product sales will update as orders are placed.</div>
                </div>
              ) : (
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3 text-right">Units</th>
                      <th className="px-4 py-3 text-right">Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.topSellingProducts.map(p => (
                      <tr key={p.productId} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 truncate max-w-[160px]" title={p.productName}>
                            {p.productName}
                          </div>
                          <div className="text-[10px] text-slate-400">SKU: {p.sku}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">
                          {p.unitsSold}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                          {formatCurrency(p.salesValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="p-4 bg-slate-50/70 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Server Aggregation</span>
            <span className="font-semibold text-slate-700">Today</span>
          </div>
        </div>
      </div>
    </div>
  );
};
