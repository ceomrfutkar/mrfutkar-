import React from 'react';
import { AdminWarehouseOrder, WarehouseQueueType, AgingBucket } from '../../../types/adminWarehouse';

interface AdminWarehouseQueuesProps {
  orders: AdminWarehouseOrder[];
  totalOrders: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
  activeQueue: WarehouseQueueType;
  selectedStatus: string;
  selectedAging: AgingBucket | 'ALL';
  searchTerm: string;
  queueCounts: { acceptance: number; picking: number; packing: number; dispatch: number; all: number };
  isLoading: boolean;
  onSelectQueue: (queue: WarehouseQueueType) => void;
  onStatusChange: (status: string) => void;
  onAgingChange: (aging: AgingBucket | 'ALL') => void;
  onSearchChange: (search: string) => void;
  onPageChange: (page: number) => void;
  onInspectOrder: (orderId: string) => void;
}

export const AdminWarehouseQueues: React.FC<AdminWarehouseQueuesProps> = ({
  orders,
  totalOrders,
  currentPage,
  pageSize,
  totalPages,
  activeQueue,
  selectedStatus,
  selectedAging,
  searchTerm,
  queueCounts,
  isLoading,
  onSelectQueue,
  onStatusChange,
  onAgingChange,
  onSearchChange,
  onPageChange,
  onInspectOrder,
}) => {
  const queueTabs: Array<{ id: WarehouseQueueType; label: string; count: number }> = [
    { id: 'all', label: 'All Warehouse Orders', count: queueCounts.all },
    { id: 'acceptance', label: '1. Acceptance Queue', count: queueCounts.acceptance },
    { id: 'picking', label: '2. Picking Queue', count: queueCounts.picking },
    { id: 'packing', label: '3. Packing Queue', count: queueCounts.packing },
    { id: 'dispatch', label: '4. Ready for Dispatch', count: queueCounts.dispatch },
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden mb-6">
      {/* Queue Segmented Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-2 bg-slate-950/60 border-b border-slate-800">
        {queueTabs.map(tab => {
          const isActive = activeQueue === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectQueue(tab.id)}
              type="button"
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] tabular-nums ${
                isActive ? 'bg-amber-500/30 text-amber-300' : 'bg-slate-800 text-slate-400'
              }`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex-1 min-w-[240px] max-w-md">
          <input
            type="text"
            placeholder="Search Order ID, Retailer, Phone, SKU, Item..."
            value={searchTerm}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={e => onStatusChange(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-amber-500 text-xs"
          >
            <option value="ALL">All Statuses</option>
            <option value="CONFIRMED">CONFIRMED (Awaiting)</option>
            <option value="ACCEPTED">ACCEPTED</option>
            <option value="PICKING">PICKING</option>
            <option value="PACKED">PACKED</option>
            <option value="READY_FOR_DISPATCH">READY_FOR_DISPATCH</option>
            <option value="DISPATCHED">DISPATCHED</option>
            <option value="DELIVERED">DELIVERED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>

          {/* Aging Filter */}
          <select
            value={selectedAging}
            onChange={e => onAgingChange(e.target.value as any)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-amber-500 text-xs"
          >
            <option value="ALL">All Age Ranges</option>
            <option value="0_2h">&lt; 2 Hours</option>
            <option value="2_6h">2 - 6 Hours</option>
            <option value="6_12h">6 - 12 Hours (SLA Alert)</option>
            <option value="12_24h">12 - 24 Hours</option>
            <option value="24h_plus">&gt; 24 Hours</option>
          </select>
        </div>
      </div>

      {/* Orders High-Density Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950/70 text-slate-400 uppercase text-[10px] border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">Order ID</th>
              <th className="px-4 py-3">Retailer & Store</th>
              <th className="px-4 py-3 text-center">Items</th>
              <th className="px-4 py-3 text-right">Grand Total</th>
              <th className="px-4 py-3">Stage Status</th>
              <th className="px-4 py-3">Order Age</th>
              <th className="px-4 py-3">Dispatch Readiness</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={8} className="px-4 py-4">
                    <div className="h-4 bg-slate-800/50 rounded w-full" />
                  </td>
                </tr>
              ))
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                  <div className="text-sm font-medium">No orders found in this warehouse queue.</div>
                  <div className="text-xs text-slate-600 mt-1">
                    Try adjusting search query or filters.
                  </div>
                </td>
              </tr>
            ) : (
              orders.map(o => (
                <tr
                  key={o.orderId}
                  className="hover:bg-slate-800/40 transition-colors"
                >
                  {/* Order ID */}
                  <td className="px-4 py-3 font-mono font-medium text-slate-100">
                    <button
                      onClick={() => onInspectOrder(o.orderId)}
                      type="button"
                      className="hover:text-amber-400 hover:underline cursor-pointer"
                    >
                      {o.orderId}
                    </button>
                    <div className="text-[10px] text-slate-500 font-sans">
                      {new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>

                  {/* Retailer & Store */}
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-200">{o.retailerName}</div>
                    <div className="text-[11px] text-slate-400 truncate max-w-[180px]">
                      {o.shopName || o.deliveryAddress?.city || 'Kirana Store'}
                    </div>
                  </td>

                  {/* Items */}
                  <td className="px-4 py-3 text-center font-mono tabular-nums text-slate-300">
                    {o.itemCount}
                  </td>

                  {/* Grand Total */}
                  <td className="px-4 py-3 text-right font-mono font-semibold text-slate-100 tabular-nums">
                    ₹{o.grandTotal.toFixed(2)}
                  </td>

                  {/* Stage Status */}
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${
                      o.orderStatus === 'CONFIRMED'
                        ? 'bg-amber-950/80 text-amber-400 border border-amber-500/30'
                        : o.orderStatus === 'ACCEPTED' || o.orderStatus === 'PICKING'
                        ? 'bg-blue-950/80 text-blue-400 border border-blue-500/30'
                        : o.orderStatus === 'PACKED'
                        ? 'bg-purple-950/80 text-purple-400 border border-purple-500/30'
                        : o.orderStatus === 'READY_FOR_DISPATCH'
                        ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30'
                        : o.orderStatus === 'DELIVERED'
                        ? 'bg-teal-950/80 text-teal-400 border border-teal-500/30'
                        : 'bg-slate-800 text-slate-300'
                    }`}>
                      {o.orderStatus}
                    </span>
                  </td>

                  {/* Order Age */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
                      <span className={o.isAgingAlert ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                        {o.orderAgeFormatted}
                      </span>
                      {o.isAgingAlert && (
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" title="SLA threshold exceeded (>6h)" />
                      )}
                    </div>
                  </td>

                  {/* Dispatch Readiness */}
                  <td className="px-4 py-3 text-[11px]">
                    {o.orderStatus === 'READY_FOR_DISPATCH' ? (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        ✓ Ready at Dock
                      </span>
                    ) : o.delivery?.assignedPartnerName ? (
                      <span className="text-slate-300">
                        Assigned: {o.delivery.assignedPartnerName}
                      </span>
                    ) : (
                      <span className="text-slate-500">Staging Pending</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onInspectOrder(o.orderId)}
                      type="button"
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-amber-400 font-medium rounded transition-colors text-[11px]"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
        <div>
          Showing <span className="font-mono text-slate-200 font-medium">{orders.length}</span> of{' '}
          <span className="font-mono text-slate-200 font-medium">{totalOrders}</span> orders
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1 || isLoading}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 rounded font-medium transition-colors"
            type="button"
          >
            Previous
          </button>
          <span className="font-mono text-slate-300 px-2 tabular-nums">
            {currentPage} / {totalPages || 1}
          </span>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages || isLoading}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 rounded font-medium transition-colors"
            type="button"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};
