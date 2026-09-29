import React, { useState } from 'react';
import { useDelivery } from '../../context/DeliveryContext';
import {
  Package,
  Clock,
  MapPin,
  IndianRupee,
  ChevronRight,
  Filter,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Truck,
  RotateCw,
} from 'lucide-react';

export const DeliveryOrdersScreen: React.FC = () => {
  const { orders, selectOrder, refreshOrders, isLoading } = useDelivery();
  const [filter, setFilter] = useState<string>('ACTIVE');

  // Filter logic
  const filteredOrders = orders.filter(order => {
    const status = order.delivery?.assignmentStatus || order.status;
    if (filter === 'ACTIVE') {
      return ['ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(status);
    }
    if (filter === 'ALL') return true;
    return status === filter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ASSIGNED':
        return (
          <span className="px-2.5 py-1 rounded-md text-[10px] font-black bg-[#f5b024]/20 border border-[#f5b024]/40 text-amber-950 uppercase tracking-wide">
            ASSIGNED
          </span>
        );
      case 'ACCEPTED':
        return (
          <span className="px-2.5 py-1 rounded-md text-[10px] font-black bg-blue-100 border border-blue-300 text-blue-900 uppercase tracking-wide">
            ACCEPTED
          </span>
        );
      case 'PICKED_UP':
        return (
          <span className="px-2.5 py-1 rounded-md text-[10px] font-black bg-purple-100 border border-purple-300 text-purple-900 uppercase tracking-wide">
            PICKED UP
          </span>
        );
      case 'OUT_FOR_DELIVERY':
        return (
          <span className="px-2.5 py-1 rounded-md text-[10px] font-black bg-amber-100 border border-amber-300 text-amber-950 uppercase tracking-wide flex items-center gap-1">
            <Truck className="w-3 h-3 text-amber-700" />
            OUT FOR DELIVERY
          </span>
        );
      case 'DELIVERED':
        return (
          <span className="px-2.5 py-1 rounded-md text-[10px] font-black bg-emerald-100 border border-emerald-300 text-emerald-900 uppercase tracking-wide flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-700" />
            DELIVERED
          </span>
        );
      case 'FAILED_DELIVERY':
        return (
          <span className="px-2.5 py-1 rounded-md text-[10px] font-black bg-[#e72b2b]/15 border border-[#e72b2b]/30 text-[#e72b2b] uppercase tracking-wide flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            FAILED
          </span>
        );
      case 'RETURN_TO_WAREHOUSE':
        return (
          <span className="px-2.5 py-1 rounded-md text-[10px] font-black bg-stone-200 border border-stone-300 text-stone-800 uppercase tracking-wide flex items-center gap-1">
            <RotateCcw className="w-3 h-3" />
            RETURN INITIATED
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-stone-100 text-stone-700 uppercase">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Header & Filter Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
        <div>
          <h1 className="text-xl font-black text-stone-900 uppercase tracking-tight">
            Today's Assigned Deliveries
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Real-time consignment dispatch queue from WH-BRAHMPURI-01
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refreshOrders()}
            disabled={isLoading}
            className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors"
            title="Refresh Deliveries"
          >
            <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-amber-600' : ''}`} />
          </button>

          <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-xl text-xs font-bold overflow-x-auto">
            {['ACTIVE', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'ALL'].map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                  filter === f
                    ? 'bg-[#0d1d25] text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {f === 'ACTIVE' ? 'Active' : f === 'ASSIGNED' ? 'New' : f === 'OUT_FOR_DELIVERY' ? 'Out' : 'All'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
            <Package className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-stone-800 text-sm">No deliveries in this queue</h3>
          <p className="text-xs text-stone-500 max-w-xs mx-auto">
            When dispatch assigns wholesale consignments to your partner ID at WH-BRAHMPURI-01, they will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map(order => {
            const status = order.delivery?.assignmentStatus || order.status;
            const isCod = (order.paymentMethod || order.payment?.method) === 'COD';
            const totalAmount = Number(order.totalAmount || order.grandTotal || order.total || 0);
            const packageCount = order.items?.reduce((acc: number, it: any) => acc + (it.quantity || it.qty || 1), 0) || (order.items?.length ?? 1);
            const assignedTime = order.delivery?.assignedAt
              ? new Date(order.delivery.assignedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
              : 'Recently';

            return (
              <div
                key={order.orderId || order.id}
                onClick={() => selectOrder(order.orderId || order.id)}
                className="bg-white border border-stone-200 hover:border-[#f5b024] rounded-2xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer space-y-3"
              >
                {/* Top Row: Order ID & Status Badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-sm text-stone-950">
                      {order.orderId || order.id}
                    </span>
                    <span className="text-stone-400 text-xs">•</span>
                    <span className="text-[11px] text-stone-500 flex items-center gap-1 font-medium">
                      <Clock className="w-3 h-3 text-stone-400" />
                      {assignedTime}
                    </span>
                  </div>
                  <div>{getStatusBadge(status)}</div>
                </div>

                {/* Retailer & Address Details */}
                <div className="space-y-1">
                  <div className="font-black text-base text-stone-900">
                    {order.shopName || order.retailerName || 'Retailer Store'}
                  </div>
                  <div className="flex items-start gap-1.5 text-xs text-stone-600">
                    <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{order.deliveryAddress || order.address || 'Brahmpuri Service Corridor'}</span>
                  </div>
                  <div className="text-[11px] text-stone-500 font-semibold pl-5">
                    Delivery Area: <span className="text-stone-800">{order.deliveryArea || 'Brahmpuri'}</span>
                  </div>
                </div>

                {/* Bottom Row: Values, Payment & Action Cue */}
                <div className="pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="text-[10px] text-stone-400 uppercase font-bold">Consignment</div>
                      <div className="font-bold text-stone-800">
                        {packageCount} item{packageCount > 1 ? 's' : ''}
                      </div>
                    </div>

                    <div className="border-l border-stone-200 pl-3">
                      <div className="text-[10px] text-stone-400 uppercase font-bold">Total Value</div>
                      <div className="font-black text-stone-900 font-mono">
                        ₹{totalAmount.toLocaleString('en-IN')}
                      </div>
                    </div>

                    <div className="border-l border-stone-200 pl-3">
                      <div className="text-[10px] text-stone-400 uppercase font-bold">Payment</div>
                      <div className="font-bold text-stone-800">
                        {isCod ? (
                          <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded text-[10px] font-black">
                            COD
                          </span>
                        ) : (
                          <span className="text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] font-black">
                            PAID
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 font-bold text-xs text-[#0d1d25] group-hover:text-amber-600">
                    <span>Manage</span>
                    <ChevronRight className="w-4 h-4" />
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
