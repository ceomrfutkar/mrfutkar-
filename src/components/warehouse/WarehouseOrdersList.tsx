import React from 'react';
import { useWarehouse } from '../../context/WarehouseContext';
import {
  Search,
  Filter,
  Eye,
  CheckSquare,
  Package,
  Truck,
  MapPin,
  Calendar,
  CreditCard,
  Building2,
  RefreshCw,
} from 'lucide-react';

export const WarehouseOrdersList: React.FC = () => {
  const {
    orders,
    selectOrder,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    paymentStatusFilter,
    setPaymentStatusFilter,
    areaFilter,
    setAreaFilter,
    serviceAreas,
    refreshOrders,
    isLoading,
    warehouseId,
    warehouseName,
  } = useWarehouse();

  const statuses = [
    'ALL',
    'PLACED',
    'CONFIRMED',
    'ACCEPTED',
    'PICKING',
    'PACKED',
    'READY_FOR_DISPATCH',
    'DISPATCHED',
    'DELIVERED',
    'CANCELLED',
  ];

  return (
    <div className="space-y-4">
      {/* Top Header & Search Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-stone-900">Incoming Wholesale Orders</h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold border border-amber-300">
                {warehouseId}
              </span>
            </div>
            <p className="text-xs text-stone-500">
              Orders automatically routed to {warehouseName} ({orders.length} matching criteria)
            </p>
          </div>

          <div className="flex items-center gap-2 self-end md:self-center">
            <button
              type="button"
              onClick={refreshOrders}
              disabled={isLoading}
              className="flex items-center gap-1.5 text-xs bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold px-3 py-1.5 rounded-lg border border-stone-300 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-1 border-t border-stone-100 text-xs">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-stone-400" />
            <input
              type="text"
              placeholder="Search Order ID, Retailer, Mobile, SKU..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 text-stone-900"
            />
          </div>

          {/* Delivery Area Filter */}
          <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5">
            <MapPin className="w-3.5 h-3.5 text-stone-500" />
            <span className="text-stone-400 font-medium">Area:</span>
            <select
              value={areaFilter}
              onChange={e => setAreaFilter(e.target.value)}
              className="bg-transparent text-stone-800 font-semibold focus:outline-none cursor-pointer w-full"
            >
              <option value="ALL">All Territories</option>
              {serviceAreas.map(area => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Status Filter */}
          <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5">
            <CreditCard className="w-3.5 h-3.5 text-stone-500" />
            <span className="text-stone-400 font-medium">Payment:</span>
            <select
              value={paymentStatusFilter}
              onChange={e => setPaymentStatusFilter(e.target.value)}
              className="bg-transparent text-stone-800 font-semibold focus:outline-none cursor-pointer w-full"
            >
              <option value="ALL">All Payments</option>
              <option value="PENDING">PENDING (COD / Credit)</option>
              <option value="PAID">PAID</option>
              <option value="AUTHORIZED">AUTHORIZED</option>
            </select>
          </div>

          {/* Locked Warehouse Indicator */}
          <div className="flex items-center gap-1.5 bg-amber-50/70 border border-amber-200 rounded-lg px-2.5 py-1.5 text-amber-900 font-medium">
            <Building2 className="w-3.5 h-3.5 text-amber-700" />
            <span className="truncate">Hub: {warehouseName} (Locked)</span>
          </div>
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 scrollbar-none">
          {statuses.map(st => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === st
                  ? 'bg-stone-900 text-amber-400 shadow-xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-xl border border-stone-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 text-stone-600 font-bold border-b border-stone-200 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Order ID & Date</th>
                <th className="py-3 px-4">Retailer & Mobile</th>
                <th className="py-3 px-4">Delivery Area</th>
                <th className="py-3 px-4">SKUs & Qty</th>
                <th className="py-3 px-4">Order Value</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4">Order Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-700">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-stone-500">
                    No orders match your filter criteria in {warehouseId}.
                  </td>
                </tr>
              ) : (
                orders.map(order => {
                  const totalUnits = (order.items || []).reduce((sum: number, i: any) => sum + (Number(i.quantity) || 0), 0);
                  const isKarawal = (order.deliveryAddress?.fullAddress || '').toLowerCase().includes('karawal');

                  return (
                    <tr key={order.orderId} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-stone-900 block">{order.orderId}</span>
                        <span className="text-[10px] text-stone-500">
                          {order.createdAt ? new Date(order.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-bold text-stone-900 block">{order.shopName || order.retailerName}</span>
                        <span className="text-[11px] text-stone-500">{order.deliveryAddress?.phone || '—'}</span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1">
                          <span className="font-semibold text-stone-800">
                            {order.deliveryAddress?.city || 'Brahmpuri'}
                          </span>
                          {isKarawal && (
                            <span className="text-[9px] bg-sky-100 text-sky-800 px-1.5 py-0.2 rounded font-bold">
                              Karawal Ngr
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-stone-400 truncate max-w-[150px] block">
                          {order.deliveryAddress?.fullAddress || '—'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-bold text-stone-800">{(order.items || []).length} SKUs</span>
                        <span className="text-[11px] text-stone-500 block">{totalUnits} units</span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-black text-stone-900 block">₹{(order.grandTotal || 0).toLocaleString('en-IN')}</span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-stone-800 block text-[11px]">{order.paymentMethod}</span>
                        <span
                          className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            order.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {order.paymentStatus}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2.5 py-1 rounded text-[10px] font-bold uppercase ${
                            order.orderStatus === 'DELIVERED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : order.orderStatus === 'PLACED'
                              ? 'bg-amber-100 text-amber-800'
                              : order.orderStatus === 'PICKING'
                              ? 'bg-indigo-100 text-indigo-800'
                              : order.orderStatus === 'PACKED'
                              ? 'bg-purple-100 text-purple-800'
                              : order.orderStatus === 'READY_FOR_DISPATCH'
                              ? 'bg-teal-100 text-teal-800'
                              : order.orderStatus === 'DISPATCHED'
                              ? 'bg-cyan-100 text-cyan-800'
                              : order.orderStatus === 'CANCELLED'
                              ? 'bg-stone-100 text-stone-600'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {order.orderStatus}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => selectOrder(order.orderId)}
                            className="p-1.5 rounded-lg bg-stone-100 hover:bg-amber-500 hover:text-stone-950 text-stone-700 transition-all cursor-pointer"
                            title="Open Order Detail"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {['ACCEPTED', 'PICKING'].includes(order.orderStatus) && (
                            <button
                              type="button"
                              onClick={() => selectOrder(order.orderId, 'PICKING')}
                              className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] flex items-center gap-1 transition-all"
                            >
                              <CheckSquare className="w-3 h-3" />
                              <span>Pick</span>
                            </button>
                          )}

                          {order.orderStatus === 'PACKED' && (
                            <button
                              type="button"
                              onClick={() => selectOrder(order.orderId, 'PACKING')}
                              className="px-2 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white font-bold text-[10px] flex items-center gap-1 transition-all"
                            >
                              <Package className="w-3 h-3" />
                              <span>Pack</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
