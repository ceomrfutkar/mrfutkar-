import React from 'react';
import { useApp } from '../context/AppContext';
import {
  CheckCircle2,
  Package,
  Home,
  Truck,
  MapPin,
  CreditCard,
  Layers,
  ArrowRight,
} from 'lucide-react';
import BrandLogo from '../components/BrandLogo';

export default function OrderSuccessScreen() {
  const { lastPlacedOrder, switchTab, navigate, screenParams } = useApp();

  const orderId = screenParams?.orderId || lastPlacedOrder?.orderId || lastPlacedOrder?.orderNumber || 'MF-2026-ORDER';
  const total = lastPlacedOrder?.grandTotal ?? lastPlacedOrder?.total ?? 0;
  const productCount = lastPlacedOrder?.items?.length ?? 0;
  const address = lastPlacedOrder?.deliveryAddress;
  const addressText = typeof address === 'string'
    ? address
    : address
    ? `${address.shopName}, ${address.fullAddress}, ${address.city}`
    : 'Registered Shop Address';
  const paymentMethod = lastPlacedOrder?.paymentMethod || 'COD';
  const estimatedDelivery = lastPlacedOrder?.estimatedDeliveryTime || 'Today within 4 hours (Jaipur Central Hub)';

  return (
    <div id="order-success-screen" className="min-h-[85vh] flex flex-col items-center justify-center px-4 py-8 max-w-md mx-auto w-full text-center">
      {/* Brand Header */}
      <div className="w-full mb-4">
        <BrandLogo variant="card" showCorporate={true} />
      </div>

      {/* Confirmation Badge */}
      <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mb-3 shadow-inner">
        <CheckCircle2 className="w-10 h-10" />
      </div>

      <span className="text-[11px] font-black tracking-widest uppercase text-emerald-800 bg-emerald-50 px-3 py-1 rounded-md mb-2 border border-emerald-200">
        ✓ ORDER CONFIRMED & QUEUED
      </span>

      <h1 className="text-2xl font-black text-stone-950 tracking-tight">
        Wholesale Order Placed!
      </h1>
      <p className="text-stone-500 text-xs mt-1 max-w-xs">
        Your order has been transmitted directly to the central dispatch hub.
      </p>

      {/* Structured Order Information Card */}
      <div className="w-full bg-white rounded-2xl border border-stone-200 p-4 mt-6 text-left space-y-3 shadow-xs text-xs">
        <div className="flex justify-between items-center pb-2.5 border-b border-stone-100">
          <span className="text-stone-500 font-semibold">Order ID</span>
          <span className="font-mono font-black text-stone-900 bg-stone-100 px-2 py-0.5 rounded text-[11px]">
            {orderId}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-stone-500 font-semibold">Total Amount</span>
          <span className="font-black text-stone-950 text-base">₹{total.toFixed(2)}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-stone-500 font-semibold flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-stone-400" />
            <span>Number of Products</span>
          </span>
          <span className="font-bold text-stone-900">{productCount} FMCG Lines</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-stone-500 font-semibold flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-stone-400" />
            <span>Payment Method</span>
          </span>
          <span className="font-bold text-stone-900 uppercase">{paymentMethod}</span>
        </div>

        <div className="pt-2.5 border-t border-stone-100 flex items-start justify-between gap-3">
          <span className="text-stone-500 font-semibold flex items-center gap-1.5 shrink-0">
            <MapPin className="w-3.5 h-3.5 text-emerald-600" />
            <span>Delivery Destination</span>
          </span>
          <span className="text-stone-900 font-medium text-right text-[11px] truncate max-w-[200px]">
            {addressText}
          </span>
        </div>

        <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs">
          <span className="text-stone-500 font-semibold flex items-center gap-1.5">
            <Truck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Estimated Delivery</span>
          </span>
          <span className="font-bold text-emerald-700">{estimatedDelivery}</span>
        </div>
      </div>

      {/* Three Action Buttons: TRACK ORDER, CONTINUE SHOPPING, VIEW ORDERS */}
      <div className="w-full mt-6 space-y-2.5">
        <button
          type="button"
          onClick={() => navigate('OrderTracking', { orderId })}
          className="w-full bg-[#0d1d25] hover:bg-stone-800 text-white font-black text-xs py-3.5 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
        >
          <Truck className="w-4 h-4 text-amber-400" />
          <span>TRACK ORDER LIVE</span>
          <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
        </button>

        <button
          type="button"
          onClick={() => switchTab('Orders')}
          className="w-full bg-stone-100 hover:bg-stone-200 text-stone-900 font-bold text-xs py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2"
        >
          <Package className="w-4 h-4 text-stone-600" />
          <span>VIEW ALL ORDERS</span>
        </button>

        <button
          type="button"
          onClick={() => switchTab('Home')}
          className="w-full bg-transparent hover:bg-stone-50 text-stone-600 font-bold text-xs py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2"
        >
          <Home className="w-4 h-4 text-stone-400" />
          <span>CONTINUE SHOPPING</span>
        </button>
      </div>
    </div>
  );
}
