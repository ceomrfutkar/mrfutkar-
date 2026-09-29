import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { OrderStatus } from '../types/order';
import OrderStatusBadge from '../components/OrderStatusBadge';
import {
  Package,
  Truck,
  RotateCcw,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Layers,
  ChevronRight,
  ShoppingBag,
} from 'lucide-react';

type OrderTab = 'ALL' | 'ACTIVE' | 'DELIVERED' | 'CANCELLED';

export default function OrdersScreen() {
  const { orders, navigate, repeatOrder, switchTab } = useApp();
  const [activeTab, setActiveTab] = useState<OrderTab>('ALL');
  const [isRepeatingId, setIsRepeatingId] = useState<string | null>(null);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const status = (order.orderStatus || order.status || '').toString().toUpperCase();

      if (activeTab === 'ALL') return true;
      if (activeTab === 'ACTIVE') {
        return (
          status !== 'DELIVERED' &&
          status !== 'CANCELLED'
        );
      }
      if (activeTab === 'DELIVERED') {
        return status === 'DELIVERED';
      }
      if (activeTab === 'CANCELLED') {
        return status === 'CANCELLED';
      }
      return true;
    });
  }, [orders, activeTab]);

  const handleOrderAgain = async (orderId: string) => {
    setIsRepeatingId(orderId);
    try {
      const res = await repeatOrder(orderId);
      setIsRepeatingId(null);
      if (res.unavailableItems.length > 0) {
        const outList = res.unavailableItems.map(x => x.productName).join(', ');
        alert(`Note: Out-of-stock items (${outList}) were skipped. Available items added at current rates.`);
      }
      navigate('Cart');
    } catch (e: any) {
      setIsRepeatingId(null);
      alert(e.message || 'Failed to repeat order');
    }
  };

  const getTabCount = (tab: OrderTab) => {
    if (tab === 'ALL') return orders.length;
    if (tab === 'ACTIVE') {
      return orders.filter(o => {
        const s = (o.orderStatus || o.status || '').toString().toUpperCase();
        return s !== 'DELIVERED' && s !== 'CANCELLED';
      }).length;
    }
    if (tab === 'DELIVERED') {
      return orders.filter(o => (o.orderStatus || o.status || '').toString().toUpperCase() === 'DELIVERED').length;
    }
    if (tab === 'CANCELLED') {
      return orders.filter(o => (o.orderStatus || o.status || '').toString().toUpperCase() === 'CANCELLED').length;
    }
    return 0;
  };

  return (
    <div id="orders-screen" className="space-y-4 pb-28 max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200/90 shadow-xs flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-stone-900 tracking-tight">
            Wholesale Orders
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Real-time status tracking & repeat order procurement
          </p>
        </div>
        <span className="text-xs font-bold text-stone-700 bg-stone-100 px-2.5 py-1 rounded-lg">
          {orders.length} Total
        </span>
      </div>

      {/* 4 Tabs: ALL, ACTIVE, DELIVERED, CANCELLED */}
      <div className="flex bg-stone-100/90 p-1 rounded-2xl gap-1 border border-stone-200 text-xs">
        {(['ALL', 'ACTIVE', 'DELIVERED', 'CANCELLED'] as OrderTab[]).map(tab => {
          const count = getTabCount(tab);
          const isSelected = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 px-1 text-center font-black rounded-xl transition-all flex items-center justify-center gap-1 ${
                isSelected
                  ? 'bg-[#0d1d25] text-amber-400 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <span>{tab}</span>
              <span
                className={`text-[10px] px-1 rounded-md font-mono ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-stone-200 text-stone-600'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 border border-stone-200 text-center space-y-3 shadow-xs">
          <div className="w-14 h-14 bg-stone-100 text-stone-400 rounded-2xl flex items-center justify-center mx-auto">
            <Package className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-bold text-stone-900">
            No orders found in {activeTab.toLowerCase()} tab
          </h3>
          <p className="text-xs text-stone-500 max-w-xs mx-auto">
            Place an order from the wholesale catalogue to track live dispatch status.
          </p>
          <button
            type="button"
            onClick={() => switchTab('Home')}
            className="bg-[#0d1d25] hover:bg-stone-800 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-xs"
          >
            Start Procurement
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map(order => {
            const orderKey = order.orderId || order.id || order.orderNumber || '';
            const itemsCount = order.items?.length || 0;
            const totalAmount = order.grandTotal ?? order.total ?? 0;
            const isRepeating = isRepeatingId === orderKey;
            const isCancelled = order.orderStatus === OrderStatus.CANCELLED;

            return (
              <div
                key={orderKey}
                className="bg-white rounded-2xl border border-stone-200 shadow-xs p-4 space-y-3 transition-all hover:border-stone-300"
              >
                {/* Top Row: Order ID, Date, Status Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-xs text-stone-900 bg-stone-100 px-2 py-0.5 rounded">
                        {order.orderId || order.orderNumber}
                      </span>
                      <OrderStatusBadge status={order.orderStatus || order.status} />
                    </div>
                    <p className="text-[11px] text-stone-500 mt-1 flex items-center gap-1 font-medium">
                      <Clock className="w-3 h-3 text-stone-400" />
                      <span>
                        {new Date(order.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-stone-400 block font-bold uppercase">Total Bill</span>
                    <span className="font-black text-sm text-stone-950">
                      ₹{totalAmount.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Middle Row: Product Preview & Items Count */}
                <div className="flex items-center justify-between bg-stone-50 rounded-xl p-2.5 text-xs text-stone-600 border border-stone-100">
                  <div className="flex items-center gap-2">
                    {/* Thumbnail previews */}
                    <div className="flex -space-x-2 overflow-hidden">
                      {order.items.slice(0, 3).map((item, idx) => (
                        <img
                          key={idx}
                          src={item.imageUrl || (item as any).image}
                          alt={item.productName || (item as any).name}
                          referrerPolicy="no-referrer"
                          className="w-7 h-7 rounded-lg object-cover bg-stone-200 border-2 border-white"
                        />
                      ))}
                    </div>
                    <span className="font-bold text-stone-800 text-[11px]">
                      {itemsCount} {itemsCount === 1 ? 'Product line' : 'Product lines'}
                    </span>
                  </div>

                  <div className="text-[11px] font-semibold text-stone-500">
                    {order.paymentMethod} • {order.warehouseName || 'MR FUTKAR — BRAHMPURI'}
                  </div>
                </div>

                {/* 3 Actions: VIEW ORDER, TRACK ORDER, ORDER AGAIN */}
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-stone-100 text-xs">
                  <button
                    type="button"
                    onClick={() => navigate('OrderDetail', { orderId: orderKey })}
                    className="bg-stone-100 hover:bg-stone-200 text-stone-900 font-bold py-2 rounded-xl transition-all flex items-center justify-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5 text-stone-600" />
                    <span>View Order</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('OrderTracking', { orderId: orderKey })}
                    className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold py-2 rounded-xl transition-all flex items-center justify-center gap-1"
                  >
                    <Truck className="w-3.5 h-3.5 text-amber-700" />
                    <span>Track Order</span>
                  </button>

                  <button
                    type="button"
                    disabled={isRepeating}
                    onClick={() => handleOrderAgain(orderKey)}
                    className="bg-[#0d1d25] hover:bg-stone-800 text-white font-black py-2 rounded-xl transition-all flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isRepeating ? 'Checking...' : 'Order Again'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
