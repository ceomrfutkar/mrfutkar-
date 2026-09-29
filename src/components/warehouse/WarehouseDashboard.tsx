import React from 'react';
import { useWarehouse } from '../../context/WarehouseContext';
import {
  PackageCheck,
  ShoppingBag,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  TrendingUp,
  AlertOctagon,
  Boxes,
  ArrowRight,
  RefreshCw,
  Building,
  CheckSquare,
  Package,
} from 'lucide-react';
import { WarehouseClient } from '../../services/warehouseClient';
import { CashBankBalanceCard } from '../accounting/CashBankBalanceCard';

export const WarehouseDashboard: React.FC = () => {
  const {
    metrics,
    warehouseId,
    warehouseName,
    branchName,
    setCurrentView,
    setStatusFilter,
    orders,
    selectOrder,
    refreshAll,
    isLoading,
  } = useWarehouse();

  const handleFilterStatus = (status: string, view: any = 'ORDERS') => {
    setStatusFilter(status);
    setCurrentView(view);
  };

  const recentOrders = orders.slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Hub Top Notice & Refresh */}
      <div className="bg-gradient-to-r from-stone-900 to-stone-850 text-white rounded-xl p-5 shadow-sm border border-stone-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs font-mono font-bold border border-amber-500/30">
              {warehouseId}
            </span>
            <h1 className="text-xl font-bold tracking-tight text-white">{warehouseName}</h1>
          </div>
          <p className="text-xs text-stone-300">
            Operational Central Fulfilment Hub • <strong className="text-amber-400">{branchName}</strong>. Merged
            coverage for Brahmpuri, Karawal Nagar, Yamuna Vihar & surrounding East Delhi Kirana retailers.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={isLoading}
          className="flex items-center gap-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold px-3 py-2 rounded-lg border border-stone-700 transition-all cursor-pointer disabled:opacity-50 shadow-xs self-end md:self-center"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
          <span>Refresh Live Metrics</span>
        </button>
      </div>

      {/* Phase 6 Part 4C-B: Authoritative Ledger-Backed Cash & Bank Balance Summary */}
      <CashBankBalanceCard
        fetchBalances={(bypassCache) => WarehouseClient.getAccountingBalances(bypassCache)}
        title="Warehouse Accounting Ledger Balances"
        subtitle="General Ledger Cash in Hand (A/C 1100) & Bank (A/C 1200) • Strictly Read-Only"
      />

      {/* Financial & Volume Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 border border-stone-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Today's Wholesale Sales</p>
            <p className="text-2xl font-black text-stone-900 mt-1">₹{(metrics?.todaysSalesAmount || 0).toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-stone-500 mt-0.5">{metrics?.todaysOrdersCount || 0} orders received today</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-stone-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Pending Fulfillment Value</p>
            <p className="text-2xl font-black text-amber-600 mt-1">₹{(metrics?.pendingFulfillmentValue || 0).toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-stone-500 mt-0.5">Orders in queue for packing/dispatch</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div
          onClick={() => setCurrentView('LOW_STOCK')}
          className="bg-white rounded-xl p-4 border border-stone-200/80 shadow-xs flex items-center justify-between cursor-pointer hover:border-rose-300 transition-all group"
        >
          <div>
            <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Low-Stock Alerts</p>
            <p className="text-2xl font-black text-rose-600 mt-1">{metrics?.lowStockAlertsCount || 0} SKUs</p>
            <p className="text-[11px] text-rose-500 font-medium mt-0.5 group-hover:underline">Immediate action recommended →</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertOctagon className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 9-Stage Order Lifecycle Metrics Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-stone-700">Live Order Fulfillment Stages</h2>
          <span className="text-xs text-stone-500 font-medium">Click any card to inspect filtered orders</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* New Orders */}
          <button
            type="button"
            onClick={() => handleFilterStatus('PLACED')}
            className="text-left bg-white p-3.5 rounded-xl border border-stone-200 hover:border-amber-400 hover:shadow-sm transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-700 uppercase">1. New Orders</span>
              <span className="w-2 h-2 rounded-full bg-amber-500" />
            </div>
            <p className="text-2xl font-black text-stone-900 mt-1">{metrics?.newOrdersCount || 0}</p>
            <p className="text-[10px] text-stone-500">PLACED status</p>
          </button>

          {/* Orders to Accept */}
          <button
            type="button"
            onClick={() => handleFilterStatus('CONFIRMED')}
            className="text-left bg-white p-3.5 rounded-xl border border-stone-200 hover:border-blue-400 hover:shadow-sm transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-blue-700 uppercase">2. To Accept</span>
              <span className="w-2 h-2 rounded-full bg-blue-500" />
            </div>
            <p className="text-2xl font-black text-stone-900 mt-1">{metrics?.ordersToAcceptCount || 0}</p>
            <p className="text-[10px] text-stone-500">CONFIRMED status</p>
          </button>

          {/* Picking in Progress */}
          <button
            type="button"
            onClick={() => handleFilterStatus('PICKING', 'PICKING')}
            className="text-left bg-white p-3.5 rounded-xl border border-stone-200 hover:border-indigo-400 hover:shadow-sm transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-indigo-700 uppercase">3. Picking</span>
              <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <p className="text-2xl font-black text-stone-900 mt-1">{metrics?.ordersBeingPickedCount || 0}</p>
            <p className="text-[10px] text-stone-500">Active pick runs</p>
          </button>

          {/* Orders Packed */}
          <button
            type="button"
            onClick={() => handleFilterStatus('PACKED', 'PACKING')}
            className="text-left bg-white p-3.5 rounded-xl border border-stone-200 hover:border-purple-400 hover:shadow-sm transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-purple-700 uppercase">4. Packed</span>
              <Package className="w-3.5 h-3.5 text-purple-600" />
            </div>
            <p className="text-2xl font-black text-stone-900 mt-1">{metrics?.ordersPackedCount || 0}</p>
            <p className="text-[10px] text-stone-500">Awaiting dispatch label</p>
          </button>

          {/* Ready for Dispatch */}
          <button
            type="button"
            onClick={() => handleFilterStatus('READY_FOR_DISPATCH', 'DISPATCH')}
            className="text-left bg-white p-3.5 rounded-xl border border-stone-200 hover:border-teal-400 hover:shadow-sm transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-teal-700 uppercase">5. Ready Bay</span>
              <PackageCheck className="w-3.5 h-3.5 text-teal-600" />
            </div>
            <p className="text-2xl font-black text-stone-900 mt-1">{metrics?.ordersReadyForDispatchCount || 0}</p>
            <p className="text-[10px] text-stone-500">Ready for loading</p>
          </button>

          {/* Dispatched */}
          <button
            type="button"
            onClick={() => handleFilterStatus('DISPATCHED', 'DISPATCH')}
            className="text-left bg-white p-3.5 rounded-xl border border-stone-200 hover:border-cyan-400 hover:shadow-sm transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-cyan-700 uppercase">6. Dispatched</span>
              <Truck className="w-3.5 h-3.5 text-cyan-600" />
            </div>
            <p className="text-2xl font-black text-stone-900 mt-1">{metrics?.dispatchedOrdersCount || 0}</p>
            <p className="text-[10px] text-stone-500">Out on delivery van</p>
          </button>

          {/* Delivered */}
          <button
            type="button"
            onClick={() => handleFilterStatus('DELIVERED')}
            className="text-left bg-white p-3.5 rounded-xl border border-stone-200 hover:border-emerald-400 hover:shadow-sm transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-700 uppercase">7. Delivered</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <p className="text-2xl font-black text-stone-900 mt-1">{metrics?.deliveredOrdersCount || 0}</p>
            <p className="text-[10px] text-stone-500">Completed shipments</p>
          </button>

          {/* Cancelled */}
          <button
            type="button"
            onClick={() => handleFilterStatus('CANCELLED')}
            className="text-left bg-white p-3.5 rounded-xl border border-stone-200 hover:border-stone-400 hover:shadow-sm transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-stone-600 uppercase">8. Cancelled</span>
              <XCircle className="w-3.5 h-3.5 text-stone-500" />
            </div>
            <p className="text-2xl font-black text-stone-700 mt-1">{metrics?.cancelledOrdersCount || 0}</p>
            <p className="text-[10px] text-stone-500">Stock restored</p>
          </button>
        </div>
      </div>

      {/* Quick Action Operations Bay */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setCurrentView('PICKING')}
          className="flex items-center justify-between p-3.5 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-all text-left shadow-xs cursor-pointer group"
        >
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Picking Workflow</span>
            </div>
            <p className="text-[11px] text-stone-300 mt-0.5">Fulfill item quantities by SKU</p>
          </div>
          <ArrowRight className="w-4 h-4 text-stone-400 group-hover:translate-x-0.5 transition-transform" />
        </button>

        <button
          type="button"
          onClick={() => setCurrentView('PACKING')}
          className="flex items-center justify-between p-3.5 bg-white border border-stone-200 rounded-xl hover:border-stone-400 transition-all text-left shadow-xs cursor-pointer group"
        >
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
              <Package className="w-3.5 h-3.5 text-amber-600" />
              <span>Packing & Labeling</span>
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5">Package verification & seal</p>
          </div>
          <ArrowRight className="w-4 h-4 text-stone-400 group-hover:translate-x-0.5 transition-transform" />
        </button>

        <button
          type="button"
          onClick={() => setCurrentView('INVENTORY')}
          className="flex items-center justify-between p-3.5 bg-white border border-stone-200 rounded-xl hover:border-stone-400 transition-all text-left shadow-xs cursor-pointer group"
        >
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
              <Boxes className="w-3.5 h-3.5 text-amber-600" />
              <span>Inventory & Stock Inward</span>
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5">Adjust physical counts with audit</p>
          </div>
          <ArrowRight className="w-4 h-4 text-stone-400 group-hover:translate-x-0.5 transition-transform" />
        </button>

        <button
          type="button"
          onClick={() => setCurrentView('DISPATCH')}
          className="flex items-center justify-between p-3.5 bg-white border border-stone-200 rounded-xl hover:border-stone-400 transition-all text-left shadow-xs cursor-pointer group"
        >
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
              <Truck className="w-3.5 h-3.5 text-amber-600" />
              <span>Dispatch Bay</span>
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5">Van loading & driver assignments</p>
          </div>
          <ArrowRight className="w-4 h-4 text-stone-400 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Recent Incoming Orders from WH-BRAHMPURI-01 */}
      <div className="bg-white rounded-xl border border-stone-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-stone-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-stone-900">Recent Incoming Wholesale Orders</h3>
            <p className="text-[11px] text-stone-500">Live feed from central warehouse inventory</p>
          </div>
          <button
            type="button"
            onClick={() => setCurrentView('ORDERS')}
            className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
          >
            <span>View All Orders ({orders.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="divide-y divide-stone-100 overflow-x-auto">
          {recentOrders.length === 0 ? (
            <div className="p-8 text-center text-stone-500 text-xs">No orders found for WH-BRAHMPURI-01.</div>
          ) : (
            recentOrders.map(order => (
              <div
                key={order.orderId}
                onClick={() => selectOrder(order.orderId)}
                className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-stone-50/80 transition-all cursor-pointer text-xs"
              >
                <div className="min-w-[140px]">
                  <p className="font-mono font-bold text-stone-900">{order.orderId}</p>
                  <p className="text-[11px] text-stone-400">
                    {order.createdAt ? new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </p>
                </div>

                <div className="flex-1 min-w-[180px]">
                  <p className="font-bold text-stone-800">{order.shopName || order.retailerName || 'Kirana Store'}</p>
                  <p className="text-[11px] text-stone-500">
                    {order.deliveryAddress?.city || 'Brahmpuri'} • {order.deliveryAddress?.phone || '—'}
                  </p>
                </div>

                <div className="text-right min-w-[90px]">
                  <p className="font-black text-stone-900">₹{(order.grandTotal || 0).toLocaleString('en-IN')}</p>
                  <p className="text-[11px] text-stone-500">{(order.items || []).length} SKUs</p>
                </div>

                <div className="min-w-[110px] text-center">
                  <span
                    className={`inline-block px-2.5 py-1 rounded-md text-[10px] font-bold uppercase ${
                      order.orderStatus === 'DELIVERED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : order.orderStatus === 'PLACED'
                        ? 'bg-amber-100 text-amber-800'
                        : order.orderStatus === 'PICKING'
                        ? 'bg-indigo-100 text-indigo-800'
                        : order.orderStatus === 'PACKED'
                        ? 'bg-purple-100 text-purple-800'
                        : order.orderStatus === 'CANCELLED'
                        ? 'bg-stone-100 text-stone-600'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {order.orderStatus}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
