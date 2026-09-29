import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { OrderStatus } from '../types/order';
import OrderStatusBadge from '../components/OrderStatusBadge';
import { DeliveryClient } from '../services/deliveryClient';
import {
  ArrowLeft,
  Truck,
  MapPin,
  Building2,
  Clock,
  CheckCircle2,
  Package,
  Boxes,
  Send,
  XCircle,
  FileText,
  KeyRound,
  ShieldCheck,
  Camera,
  PenTool,
  RotateCcw,
  Navigation,
  Copy,
  Check,
  Compass,
} from 'lucide-react';

const TRACKING_STEPS = [
  { status: OrderStatus.PLACED, label: 'Order Placed', desc: 'Received by MR FUTKAR Wholesale', icon: Clock },
  { status: OrderStatus.CONFIRMED, label: 'Confirmed', desc: 'Order verified & inventory allocated', icon: CheckCircle2 },
  { status: OrderStatus.ACCEPTED, label: 'Hub Accepted', desc: 'Central Dispatch Hub scheduled', icon: CheckCircle2 },
  { status: OrderStatus.PICKING, label: 'Warehouse Picking', desc: 'Items being picked from warehouse shelves', icon: Boxes },
  { status: OrderStatus.PACKED, label: 'Carton Packed', desc: 'Sealed with tamper-evident tape & labeled', icon: Package },
  { status: OrderStatus.READY_FOR_DISPATCH, label: 'Ready for Dispatch', desc: 'Loaded onto regional delivery vehicle', icon: Send },
  { status: OrderStatus.OUT_FOR_DELIVERY, label: 'Out for Delivery', desc: 'En route to your Kirana store', icon: Truck },
  { status: OrderStatus.DELIVERED, label: 'Delivered', desc: 'Delivered to retailer counter', icon: CheckCircle2 },
];

export default function OrderTrackingScreen() {
  const { orders, screenParams, goBack, navigate, refreshOrders } = useApp();

  const [copiedOtp, setCopiedOtp] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [localOtp, setLocalOtp] = useState<string | null>(null);

  const order = useMemo(() => {
    const targetId = screenParams?.orderId;
    if (targetId) {
      const found = orders.find(o => o.orderId === targetId || o.id === targetId || o.orderNumber === targetId);
      if (found) return found;
    }
    return orders[0];
  }, [orders, screenParams]);

  const orderId = order?.orderId || order?.id || order?.orderNumber;

  if (!order) {
    return (
      <div className="p-4 text-center min-h-[60vh] flex flex-col items-center justify-center">
        <p className="text-stone-500 text-xs">No order selected for tracking.</p>
        <button
          type="button"
          onClick={() => goBack()}
          className="mt-3 bg-[#0d1d25] text-white text-xs font-bold px-4 py-2 rounded-xl"
        >
          Go Back
        </button>
      </div>
    );
  }

  const currentStatus = order.orderStatus || OrderStatus.PLACED;
  const isCancelled = currentStatus === OrderStatus.CANCELLED;
  const isOutForDelivery = currentStatus === OrderStatus.OUT_FOR_DELIVERY;
  const isDelivered = currentStatus === OrderStatus.DELIVERED;

  const currentStepIndex = TRACKING_STEPS.findIndex(
    s => s.status.toString().toUpperCase() === currentStatus.toString().toUpperCase()
  );
  const activeIndex = currentStepIndex >= 0 ? currentStepIndex : 0;

  // Destination Snapshot extraction
  const destSnapshot = (order as any).deliveryAddressSnapshot || (typeof order.deliveryAddress === 'object' ? order.deliveryAddress : null);
  const shopName = destSnapshot?.shopName || order.shopName || 'Retailer Shop';
  const fullAddress = destSnapshot?.fullAddress || (typeof order.deliveryAddress === 'string' ? order.deliveryAddress : order.deliveryAddress?.fullAddress) || 'Shop Address';
  const landmark = destSnapshot?.landmark || (typeof order.deliveryAddress === 'object' ? order.deliveryAddress?.landmark : undefined);
  const city = destSnapshot?.city || (typeof order.deliveryAddress === 'object' ? order.deliveryAddress?.city : 'Jaipur');
  const pincode = destSnapshot?.pincode || (typeof order.deliveryAddress === 'object' ? order.deliveryAddress?.pincode : '302015');
  const latitude = typeof destSnapshot?.latitude === 'number' ? destSnapshot.latitude : (typeof order.deliveryAddress === 'object' && typeof order.deliveryAddress?.latitude === 'number' ? order.deliveryAddress.latitude : undefined);
  const longitude = typeof destSnapshot?.longitude === 'number' ? destSnapshot.longitude : (typeof order.deliveryAddress === 'object' && typeof order.deliveryAddress?.longitude === 'number' ? order.deliveryAddress.longitude : undefined);

  const hasCoordinates =
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180;

  // OTP details from order
  const deliveryOtp = localOtp || order.delivery?.deliveryOtp;
  const isOtpVerified = order.delivery?.otpVerified;

  const handleCopyOtp = () => {
    if (!deliveryOtp) return;
    navigator.clipboard?.writeText(deliveryOtp);
    setCopiedOtp(true);
    setTimeout(() => setCopiedOtp(false), 2000);
  };

  const handleRefreshOtp = async () => {
    if (!orderId) return;
    setIsRefreshing(true);
    try {
      const res = await DeliveryClient.generateDeliveryOtp(orderId);
      if (res?.otp) {
        setLocalOtp(res.otp);
      }
      if (refreshOrders) {
        await refreshOrders();
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div id="order-tracking-screen" className="space-y-4 pb-24 max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => goBack()}
            className="p-1.5 rounded-xl hover:bg-stone-100 text-stone-600 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-stone-900 tracking-tight">
                Order Tracking
              </h2>
              <OrderStatusBadge status={currentStatus} />
            </div>
            <p className="text-xs text-stone-500 font-mono mt-0.5">
              ID: {order.orderId || order.orderNumber}
            </p>
          </div>
        </div>
      </div>

      {/* RETAILER HANDOVER OTP BANNER (Shown when OUT_FOR_DELIVERY or pending delivery) */}
      {(isOutForDelivery || deliveryOtp) && !isDelivered && (
        <div className="bg-[#0d1d25] border-2 border-[#f5b024] rounded-2xl p-4 text-white shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#f5b024] text-stone-950 flex items-center justify-center">
                <KeyRound className="w-4 h-4 font-bold" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-[#f5b024] uppercase tracking-wider block">
                  Store Handover Code
                </span>
                <h3 className="text-sm font-black text-white">Your Delivery OTP</h3>
              </div>
            </div>

            {isOtpVerified ? (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-400 text-xs font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                VERIFIED
              </span>
            ) : (
              <span className="text-[10px] font-bold text-stone-400 bg-stone-800 px-2 py-0.5 rounded">
                Share upon arrival
              </span>
            )}
          </div>

          <div className="flex items-center justify-between bg-stone-900 border border-stone-800 rounded-xl p-3">
            <div>
              <div className="text-[10px] text-stone-400 uppercase font-semibold">6-Digit Code</div>
              <div className="font-mono text-2xl font-black text-[#f5b024] tracking-widest">
                {deliveryOtp || '------'}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyOtp}
                className="px-3 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-xs font-bold text-stone-200 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedOtp ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedOtp ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                type="button"
                onClick={handleRefreshOtp}
                disabled={isRefreshing}
                title="Generate new OTP"
                className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <p className="text-[11px] text-stone-300 leading-snug">
            Provide this code to the MR FUTKAR delivery partner at your counter once you inspect and verify your package count.
          </p>
        </div>
      )}

      {/* DELIVERY DESTINATION & CORRIDOR CARD (Static, no live map canvas or polling) */}
      {(isOutForDelivery || isDelivered) && (
        <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-stone-900 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-blue-600" />
              <span>Consignment Status & Destination</span>
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800">
              WH-BRAHMPURI-01
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-black text-stone-900">{shopName}</div>
                <div className="text-stone-600 leading-relaxed text-[11px]">{fullAddress}</div>
                {landmark && (
                  <div className="text-amber-800 font-semibold text-[11px]">Landmark: {landmark}</div>
                )}
                <div className="text-stone-500 font-mono text-[10px] mt-0.5">{city} — {pincode}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-stone-50 border border-stone-100 text-[11px]">
              <Compass className="w-3.5 h-3.5 text-stone-500 shrink-0" />
              {hasCoordinates ? (
                <span className="text-emerald-800 font-bold">
                  ✓ Saved Shop GPS Location Confirmed ({latitude.toFixed(4)}, {longitude.toFixed(4)})
                </span>
              ) : (
                <span className="text-stone-600">
                  Fixed Retailer Counter Address Verified
                </span>
              )}
            </div>

            {order.deliveryPartnerName && (
              <div className="flex items-center justify-between pt-1 border-t border-stone-100 text-[11px]">
                <span className="text-stone-500">Assigned Fleet Executive:</span>
                <span className="font-bold text-stone-900">{order.deliveryPartnerName}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Overview Card: Estimated Delivery & Hub */}
      <div className="bg-[#0d1d25] text-white rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[10px] font-bold text-[#f5b024] tracking-wider uppercase block">
              Estimated Delivery
            </span>
            <p className="text-sm font-black text-white mt-0.5">
              {order.estimatedDeliveryTime || 'Today within 4 hours (Brahmpuri Hub)'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-[#f5b024]">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 text-xs">
          <div>
            <span className="text-[10px] text-stone-400 block">Fulfillment Hub</span>
            <span className="font-bold text-stone-200 truncate block">
              WH-BRAHMPURI-01
            </span>
          </div>
          <div>
            <span className="text-[10px] text-stone-400 block">Assigned Partner</span>
            <span className="font-bold text-stone-200 truncate block">
              {order.deliveryPartnerName || 'Fleet Partner Assigned'}
            </span>
          </div>
        </div>
      </div>

      {/* PROOF OF DELIVERY CARD (When DELIVERED) */}
      {isDelivered && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-800">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h3 className="font-black text-sm text-emerald-950">Proof of Delivery (POD) Verified</h3>
            </div>
            <span className="px-2 py-0.5 rounded bg-emerald-200 text-emerald-900 text-[10px] font-black uppercase">
              Confirmed Handover
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 bg-white/80 p-3 rounded-xl border border-emerald-100">
            <div>
              <span className="text-[10px] text-stone-500 block">Received By</span>
              <span className="font-bold text-stone-900">
                {order.delivery?.recipientName || order.shopName || 'Retailer Owner'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-stone-500 block">Handover Time</span>
              <span className="font-bold text-stone-900">
                {order.delivery?.deliveredAt
                  ? new Date(order.delivery.deliveredAt).toLocaleTimeString('en-IN')
                  : 'Delivered'}
              </span>
            </div>
          </div>

          {/* Photo & Signature Previews if available */}
          {(order.delivery?.proofOfDelivery?.photoUrl || order.delivery?.proofOfDelivery?.signatureUrl) && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              {order.delivery.proofOfDelivery.photoUrl && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-stone-500 flex items-center gap-1">
                    <Camera className="w-3 h-3 text-stone-600" /> Package Photo
                  </span>
                  <img
                    src={order.delivery.proofOfDelivery.photoUrl}
                    alt="Proof of Delivery"
                    className="w-full h-24 object-cover rounded-lg border border-emerald-200 bg-black"
                  />
                </div>
              )}
              {order.delivery.proofOfDelivery.signatureUrl && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-stone-500 flex items-center gap-1">
                    <PenTool className="w-3 h-3 text-stone-600" /> Counter Signature
                  </span>
                  <img
                    src={order.delivery.proofOfDelivery.signatureUrl}
                    alt="Customer Signature"
                    className="w-full h-24 object-contain rounded-lg border border-emerald-200 bg-stone-900 p-1"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Visual Status Stepper */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-xs space-y-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-stone-900">
          Order Progress Timeline
        </h3>

        {isCancelled ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
            <XCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-black text-red-900 text-sm">This order has been cancelled</h4>
              <p className="text-xs text-red-700 mt-0.5">
                Reason: {order.cancellationReason || 'Requested by retailer'}
              </p>
              {order.cancelledAt && (
                <span className="text-[10px] text-red-500 mt-1 block">
                  Cancelled on: {new Date(order.cancelledAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-stone-200">
            {TRACKING_STEPS.map((step, idx) => {
              const isPast = idx < activeIndex;
              const isCurrent = idx === activeIndex;
              const StepIcon = step.icon;

              return (
                <div key={step.status} className="relative flex items-start gap-3.5">
                  {/* Step Marker */}
                  <div
                    className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2 transition-all ${
                      isPast
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : isCurrent
                        ? 'bg-amber-500 border-white shadow-md text-white ring-4 ring-amber-100 animate-bounce-short'
                        : 'bg-white border-stone-300 text-stone-400'
                    }`}
                  >
                    {isPast ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    )}
                  </div>

                  {/* Step Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between">
                      <h4
                        className={`text-xs font-black ${
                          isCurrent
                            ? 'text-amber-900 font-extrabold'
                            : isPast
                            ? 'text-stone-900'
                            : 'text-stone-400'
                        }`}
                      >
                        {step.label}
                      </h4>
                      {isCurrent && (
                        <span className="text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded">
                          Current Stage
                        </span>
                      )}
                    </div>
                    <p className={`text-[11px] mt-0.5 ${isCurrent ? 'text-stone-700' : 'text-stone-400'}`}>
                      {step.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Button to View Order Details */}
      <button
        type="button"
        onClick={() => navigate('OrderDetail', { orderId: order.orderId || order.id })}
        className="w-full bg-stone-100 hover:bg-stone-200 text-stone-900 font-bold text-xs py-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
      >
        <FileText className="w-4 h-4 text-stone-600" />
        <span>View Full Order Details & Items</span>
      </button>
    </div>
  );
}
