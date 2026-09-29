import React, { useState } from 'react';
import { useDelivery } from '../../context/DeliveryContext';
import {
  History,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Calendar,
  IndianRupee,
  ChevronRight,
  Package,
} from 'lucide-react';

export const DeliveryHistoryScreen: React.FC = () => {
  const { orders, selectOrder } = useDelivery();
  const [filter, setFilter] = useState<'ALL' | 'DELIVERED' | 'FAILED' | 'RETURNED'>('ALL');

  // Terminal history records
  const historyOrders = orders.filter(order => {
    const s = order.delivery?.assignmentStatus || order.status;
    const isTerminal = ['DELIVERED', 'FAILED_DELIVERY', 'RETURN_TO_WAREHOUSE'].includes(s);
    if (!isTerminal) return false;

    if (filter === 'ALL') return true;
    if (filter === 'DELIVERED') return s === 'DELIVERED';
    if (filter === 'FAILED') return s === 'FAILED_DELIVERY';
    if (filter === 'RETURNED') return s === 'RETURN_TO_WAREHOUSE';
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DELIVERED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-900 flex items-center gap-1 uppercase">
            <CheckCircle2 className="w-3 h-3 text-emerald-700" />
            DELIVERED
          </span>
        );
      case 'FAILED_DELIVERY':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-red-100 text-red-900 flex items-center gap-1 uppercase">
            <AlertTriangle className="w-3 h-3 text-red-700" />
            FAILED
          </span>
        );
      case 'RETURN_TO_WAREHOUSE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-stone-200 text-stone-900 flex items-center gap-1 uppercase">
            <RotateCcw className="w-3 h-3 text-stone-700" />
            RETURNED
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-stone-100 text-stone-700 uppercase">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Header & Filter Controls */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm space-y-3">
        <div>
          <h1 className="text-xl font-black text-stone-900 uppercase tracking-tight">
            Delivery History & Settlements
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Archived consignments and handovers fulfilled by your fleet ID
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-xl text-xs font-bold overflow-x-auto">
          {(['ALL', 'DELIVERED', 'FAILED', 'RETURNED'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`flex-1 py-1.5 px-3 rounded-lg whitespace-nowrap transition-all ${
                filter === f
                  ? 'bg-[#0d1d25] text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {f === 'ALL' ? 'All Completed' : f === 'DELIVERED' ? 'Delivered' : f === 'FAILED' ? 'Failed' : 'Returned'}
            </button>
          ))}
        </div>
      </div>

      {/* History List */}
      {historyOrders.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
            <History className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-stone-800 text-sm">No delivery history records</h3>
          <p className="text-xs text-stone-500 max-w-xs mx-auto">
            Completed, failed, and returned deliveries will be archived and viewable here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {historyOrders.map(order => {
            const status = order.delivery?.assignmentStatus || order.status;
            const isCod = (order.paymentMethod || order.payment?.method) === 'COD';
            const totalAmount = Number(order.totalAmount || order.grandTotal || order.total || 0);
            const dateStr = order.delivery?.deliveredAt || order.delivery?.failedAt || order.updatedAt || order.createdAt;

            return (
              <div
                key={order.orderId || order.id}
                onClick={() => selectOrder(order.orderId || order.id)}
                className="bg-white border border-stone-200 hover:border-[#f5b024] rounded-2xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-xs text-stone-900">
                      {order.orderId || order.id}
                    </span>
                    <span className="text-stone-300">•</span>
                    <span className="text-[11px] text-stone-500 flex items-center gap-1 font-medium">
                      <Calendar className="w-3 h-3 text-stone-400" />
                      {dateStr ? new Date(dateStr).toLocaleDateString('en-IN') : 'Recent'}
                    </span>
                  </div>
                  <div>{getStatusBadge(status)}</div>
                </div>

                <div className="flex justify-between items-end pt-1">
                  <div>
                    <div className="font-bold text-sm text-stone-900">
                      {order.shopName || order.retailerName || 'Retailer Shop'}
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5">
                      Area: <span className="font-semibold text-stone-700">{order.deliveryArea || 'Brahmpuri'}</span>
                    </div>
                    {(order.deliveryCompletion?.recipientName || order.delivery?.recipientName) && (
                      <div className="text-[11px] text-emerald-800 font-medium mt-1">
                        Received by: <span className="font-bold text-stone-800">{order.deliveryCompletion?.recipientName || order.delivery?.recipientName}</span>
                      </div>
                    )}
                  </div>

                  <div className="text-right">
                    <div className="text-xs font-mono font-black text-stone-900">
                      ₹{totalAmount.toLocaleString('en-IN')}
                    </div>
                    <div className="text-[10px] uppercase font-semibold mt-0.5">
                      {isCod ? (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">
                          COD ₹{Number(order.deliveryPayment?.amountCollected || order.deliveryCompletion?.codCollectedAmount || totalAmount).toLocaleString('en-IN')} COLLECTED
                        </span>
                      ) : (
                        <span className="text-stone-500">PAID (ONLINE)</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
