import React, { useState, useEffect } from 'react';
import { useDelivery } from '../../context/DeliveryContext';
import { DeliveryClient } from '../../services/deliveryClient';
import { CustomerLocationService } from '../../services/customerLocationService';
import {
  RejectModal,
  FailedModal,
  DeliveredModal,
} from './DeliveryModals';
import {
  ArrowLeft,
  Phone,
  MapPin,
  ExternalLink,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Package,
  IndianRupee,
  Truck,
  RotateCcw,
  ShieldCheck,
  Loader2,
  XCircle,
  Radio,
  Navigation,
  Camera,
  PenTool,
  KeyRound,
  Compass,
} from 'lucide-react';

export const DeliveryOrderDetailScreen: React.FC = () => {
  const {
    selectedOrder,
    clearSelectedOrder,
    acceptOrder,
    rejectOrder,
    pickupOrder,
    startDelivery,
    markDelivered,
    failDelivery,
    returnToWarehouse,
    profile: partnerProfile,
    isSubmitting,
    error,
  } = useDelivery();

  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isFailedModalOpen, setIsFailedModalOpen] = useState(false);
  const [isDeliveredModalOpen, setIsDeliveredModalOpen] = useState(false);

  if (!selectedOrder) {
    return (
      <div className="bg-white rounded-2xl p-8 text-center space-y-3">
        <p className="text-stone-500 text-sm">No order selected</p>
        <button
          type="button"
          onClick={clearSelectedOrder}
          className="px-4 py-2 bg-stone-900 text-white text-xs font-bold rounded-xl"
        >
          Back to Deliveries
        </button>
      </div>
    );
  }

  const order = selectedOrder;
  const status = order.delivery?.assignmentStatus || order.status;
  const isCod = (order.paymentMethod || order.payment?.method) === 'COD';
  const totalAmount = Number(order.totalAmount || order.grandTotal || order.total || 0);
  const isPaid = (order.paymentStatus || order.payment?.status) === 'PAID';
  const customerPhone = order.customerMobile || order.retailerMobile || order.phone || '9810012345';
  const items = order.items || [];

  // Phase 6 Part 3: Authoritative Fixed Shop Destination State
  const [authoritativeDestination, setAuthoritativeDestination] = useState<any | null>(
    (order as any).retailerShopDestination || null
  );

  useEffect(() => {
    let isCancelled = false;
    const targetOrderId = order.orderId || order.id;
    if (!targetOrderId) return;

    if ((order as any).retailerShopDestination) {
      setAuthoritativeDestination((order as any).retailerShopDestination);
    }

    DeliveryClient.getShopDestination(targetOrderId)
      .then((dest) => {
        if (!isCancelled && dest) {
          setAuthoritativeDestination(dest);
        }
      })
      .catch((err) => {
        // Fall back gracefully to order snapshot
        console.warn('Authoritative destination fetch note:', err?.message || err);
      });

    return () => {
      isCancelled = true;
    };
  }, [order.orderId, order.id, (order as any).retailerShopDestination]);

  // Delivery Destination: Prefer authoritative destination, fallback to order snapshot
  const destSnapshot = (order as any).deliveryAddressSnapshot || (typeof order.deliveryAddress === 'object' ? order.deliveryAddress : null);
  const shopName = authoritativeDestination?.shopName || destSnapshot?.shopName || order.shopName || order.retailerName || 'Retailer Shop';
  const ownerName = authoritativeDestination?.ownerName || destSnapshot?.ownerName || order.ownerName;
  const fullAddress = authoritativeDestination?.shopAddress || destSnapshot?.fullAddress || (typeof order.deliveryAddress === 'string' ? order.deliveryAddress : (order.address || 'Brahmpuri Service Area, North East Delhi'));
  const landmark = destSnapshot?.landmark || (typeof order.deliveryAddress === 'object' ? order.deliveryAddress?.landmark : undefined);
  const city = destSnapshot?.city || (typeof order.deliveryAddress === 'object' ? order.deliveryAddress?.city : 'Jaipur');
  const pincode = destSnapshot?.pincode || (typeof order.deliveryAddress === 'object' ? order.deliveryAddress?.pincode : '302015');

  // Resolved coordinates validation (Strict [-90, 90] lat, [-180, 180] lng, finite, non-NaN)
  const rawLat = typeof authoritativeDestination?.latitude === 'number'
    ? authoritativeDestination.latitude
    : (typeof destSnapshot?.latitude === 'number'
      ? destSnapshot.latitude
      : (typeof order.deliveryAddress === 'object' && typeof order.deliveryAddress?.latitude === 'number' ? order.deliveryAddress.latitude : undefined));
  
  const rawLng = typeof authoritativeDestination?.longitude === 'number'
    ? authoritativeDestination.longitude
    : (typeof destSnapshot?.longitude === 'number'
      ? destSnapshot.longitude
      : (typeof order.deliveryAddress === 'object' && typeof order.deliveryAddress?.longitude === 'number' ? order.deliveryAddress.longitude : undefined));

  const coordValidation = CustomerLocationService.validateCoordinates(rawLat, rawLng);
  const hasValidCoordinates = coordValidation.valid && typeof rawLat === 'number' && typeof rawLng === 'number';
  const latitude = hasValidCoordinates ? (rawLat as number) : undefined;
  const longitude = hasValidCoordinates ? (rawLng as number) : undefined;

  // External Navigation URL: coordinate-based external Google Maps navigation URL
  // Does NOT generate broken URL or text search URL when coordinates are missing or invalid
  const navigationUrl = (hasValidCoordinates && latitude !== undefined && longitude !== undefined)
    ? CustomerLocationService.buildExternalNavigationUrl(latitude, longitude)
    : null;

  const openGoogleMaps = () => {
    if (navigationUrl) {
      window.open(navigationUrl, '_blank', 'noopener,noreferrer');
    }
  };
  const handleNavigateToShop = openGoogleMaps;

  // Handlers for state changes
  const handleAccept = async () => {
    await acceptOrder(order.orderId || order.id);
  };

  const handleConfirmReject = async (reason: string) => {
    const success = await rejectOrder(order.orderId || order.id, reason);
    if (success) setIsRejectModalOpen(false);
  };

  const handlePickup = async () => {
    await pickupOrder(order.orderId || order.id);
  };

  const handleStartDelivery = async () => {
    await startDelivery(order.orderId || order.id);
  };

  const handleConfirmDelivered = async (details: any) => {
    const success = await markDelivered(order.orderId || order.id, details);
    if (success) setIsDeliveredModalOpen(false);
  };

  const handleConfirmFailed = async (reason: string, notes?: string) => {
    const success = await failDelivery(order.orderId || order.id, reason, notes);
    if (success) setIsFailedModalOpen(false);
  };

  const handleReturnToWarehouse = async () => {
    await returnToWarehouse(order.orderId || order.id, 'Handover to Brahmpuri hub stock clerk');
  };

  return (
    <div className="space-y-4 pb-28">
      {/* Top Bar with Back Button */}
      <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-stone-200 shadow-sm">
        <button
          type="button"
          onClick={clearSelectedOrder}
          className="inline-flex items-center gap-2 text-xs font-bold text-stone-700 hover:text-stone-950 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Deliveries</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="font-mono font-black text-sm text-stone-900">
            {order.orderId || order.id}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-md font-bold bg-stone-100 text-stone-700 uppercase">
            {status}
          </span>
        </div>
      </div>

      {/* Error Alert if any */}
      {error && (
        <div className="p-3 bg-[#e72b2b]/15 border border-[#e72b2b]/30 rounded-xl text-[#e72b2b] text-xs font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Pickup Warehouse Banner (for ACCEPTED & PICKED_UP) */}
      {(status === 'ACCEPTED' || status === 'ASSIGNED') && (
        <div className="bg-amber-500/10 border border-[#f5b024]/40 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#f5b024] text-[#0d1d25] flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-amber-900 uppercase tracking-wider">
                Pickup Warehouse Location
              </div>
              <div className="font-black text-stone-900 text-sm">MR FUTKAR — BRAHMPURI</div>
              <div className="text-xs font-mono text-stone-600">WH-BRAHMPURI-01 • Brahmpuri Branch</div>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded bg-[#f5b024]/20 text-stone-900 text-[10px] font-black uppercase">
            Fulfillment Hub
          </span>
        </div>
      )}

      {/* OUT_FOR_DELIVERY Status Banner & Live Tracking Map */}
      {status === 'OUT_FOR_DELIVERY' && (
        <div className="space-y-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                  Active Consignment
                </div>
                <div className="font-black text-emerald-950 text-sm">OUT FOR DELIVERY</div>
                <div className="text-xs text-emerald-700">
                  Departed WH-BRAHMPURI-01 at{' '}
                  {order.delivery?.outForDeliveryAt
                    ? new Date(order.delivery.outForDeliveryAt).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Transit in progress'}
                </div>
              </div>
            </div>
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
          </div>

          {/* Static Consignment Destination Card (No live tracking map or GPS canvas) */}
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                Destination Corridor
              </span>
              <span className="text-xs font-black text-stone-900">
                WH-BRAHMPURI-01 Hub
              </span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="text-xs space-y-0.5">
                <div className="font-black text-stone-900">{shopName}</div>
                <div className="text-stone-600 leading-snug">{fullAddress}</div>
                {landmark && (
                  <div className="text-amber-800 font-medium">Landmark: {landmark}</div>
                )}
                <div className="text-stone-500 font-mono text-[11px]">{city} — {pincode}</div>
              </div>
            </div>

            {hasValidCoordinates && navigationUrl ? (
              <button
                type="button"
                onClick={handleNavigateToShop}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#0d1d25] hover:bg-stone-800 text-white text-xs font-black flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.98] cursor-pointer"
              >
                <Navigation className="w-4 h-4 text-[#f5b024]" />
                <span>Navigate to Shop</span>
              </button>
            ) : (
              <div className="p-3 bg-stone-100 border border-stone-200 rounded-xl text-stone-600 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Shop location is not available.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FAILED_DELIVERY Status Banner */}
      {status === 'FAILED_DELIVERY' && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#e72b2b] text-white flex items-center justify-center font-bold">
              <XCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-red-900 uppercase tracking-wider">
                Delivery Failed
              </div>
              <div className="font-black text-red-950 text-sm">
                Reason: {order.delivery?.failureReason || 'Undelivered'}
              </div>
              <div className="text-xs text-red-700">
                Consignment must be returned to WH-BRAHMPURI-01.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RETURN_TO_WAREHOUSE Status Banner */}
      {status === 'RETURN_TO_WAREHOUSE' && (
        <div className="bg-stone-100 border border-stone-300 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-800 text-white flex items-center justify-center font-bold">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-stone-600 uppercase tracking-wider">
                Return Initiated
              </div>
              <div className="font-black text-stone-900 text-sm">RETURN TO WAREHOUSE</div>
              <div className="text-xs text-stone-600">
                Hand over goods to stock supervisor at WH-BRAHMPURI-01.
              </div>
            </div>
          </div>
          <span className="text-xs font-bold text-stone-700">Inward Pending</span>
        </div>
      )}

      {/* DELIVERED Status Banner & POD Card */}
      {status === 'DELIVERED' && (
        <div className="space-y-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                  Fulfillment Complete
                </div>
                <div className="font-black text-emerald-950 text-sm">DELIVERED & VERIFIED</div>
                <div className="text-xs text-emerald-700">
                  Handed to: {order.delivery?.recipientName || order.shopName || 'Shopkeeper'}
                  {order.delivery?.deliveredAt && ` • ${new Date(order.delivery.deliveredAt).toLocaleTimeString('en-IN')}`}
                </div>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded bg-emerald-200 text-emerald-900 text-[10px] font-black uppercase">
              {order.paymentStatus === 'PAID' ? 'PAID & SETTLED' : 'DELIVERED'}
            </span>
          </div>

          {/* Proof of Delivery Details Card */}
          <div className="bg-white border border-emerald-200 rounded-2xl p-4 space-y-3 text-xs shadow-xs">
            <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
              <div className="flex items-center gap-2 text-emerald-800 font-black">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Verified Proof of Delivery (POD)</span>
              </div>
              <span className="flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                <KeyRound className="w-3 h-3" /> OTP AUTHENTICATED
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-100">
                <span className="text-[10px] text-stone-500 uppercase font-semibold block">Receiver</span>
                <span className="font-bold text-stone-900">{order.delivery?.recipientName || 'Store Owner'}</span>
              </div>
              <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-100">
                <span className="text-[10px] text-stone-500 uppercase font-semibold block">Notes</span>
                <span className="font-medium text-stone-700">{order.delivery?.deliveryNotes || 'Completed'}</span>
              </div>
            </div>

            {/* Photo & Signature Previews */}
            {(order.delivery?.proofOfDelivery?.photoUrl || order.delivery?.proofOfDelivery?.signatureUrl) && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                {order.delivery.proofOfDelivery.photoUrl && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-stone-500 flex items-center gap-1">
                      <Camera className="w-3 h-3 text-stone-600" /> Package Photo
                    </span>
                    <img
                      src={order.delivery.proofOfDelivery.photoUrl}
                      alt="POD Photo"
                      className="w-full h-24 object-cover rounded-lg border border-stone-200 bg-black"
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
                      alt="POD Signature"
                      className="w-full h-24 object-contain rounded-lg border border-stone-200 bg-stone-900 p-1"
                    />
                  </div>
                )}
              </div>
            )}

            {/* COD Collection Record Card (Phase 6 Part 4A) */}
            {order.deliveryPayment && (
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-amber-200/60 pb-1.5">
                  <div className="flex items-center gap-1.5 font-black text-amber-900">
                    <IndianRupee className="w-3.5 h-3.5 text-amber-600" />
                    <span>COD Collection Record</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-200 text-amber-950 uppercase">
                    {order.deliveryPayment.collectionStatus || 'COLLECTED'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-[10px] text-stone-500 uppercase block font-semibold">Payment Mode</span>
                    <span className="font-bold text-stone-900">{order.deliveryPayment.method === 'UPI' ? 'UPI / QR Transfer' : 'Physical Cash'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-500 uppercase block font-semibold">Amount Collected</span>
                    <span className="font-mono font-bold text-stone-900">₹{Number(order.deliveryPayment.amountCollected || 0).toLocaleString('en-IN')}</span>
                  </div>
                  {order.deliveryPayment.codCollectionId && (
                    <div>
                      <span className="text-[10px] text-stone-500 uppercase block font-semibold">Collection ID</span>
                      <span className="font-mono text-stone-800 text-[10px]">{order.deliveryPayment.codCollectionId}</span>
                    </div>
                  )}
                  {order.deliveryPayment.referenceId && (
                    <div>
                      <span className="text-[10px] text-stone-500 uppercase block font-semibold">Reference ID</span>
                      <span className="font-mono text-stone-800 text-[10px]">{order.deliveryPayment.referenceId}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 1: ORDER INFORMATION (Read-only) */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-stone-100 pb-2">
          <h2 className="text-xs font-black text-stone-400 uppercase tracking-wider">
            Order Commercial Summary (Read-Only)
          </h2>
          <span className="text-[11px] font-mono text-stone-500">
            {order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN') : 'Today'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] text-stone-400 font-bold uppercase">Order ID</div>
            <div className="font-mono font-black text-stone-900 text-sm mt-0.5">
              {order.orderId || order.id}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-stone-400 font-bold uppercase">Grand Total</div>
            <div className="font-mono font-black text-stone-950 text-base mt-0.5">
              ₹{totalAmount.toLocaleString('en-IN')}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-stone-400 font-bold uppercase">Payment Method</div>
            <div className="font-black text-stone-800 text-xs mt-0.5 uppercase">
              {order.paymentMethod || order.payment?.method || 'COD'}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-stone-400 font-bold uppercase">Payment Status</div>
            <div className="mt-0.5">
              {isPaid ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 uppercase">
                  PAID
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-900 uppercase">
                  PENDING (COD)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: RETAILER & FIXED SHOP DESTINATION (Phase 6 Part 3) */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-stone-100 pb-2">
          <h2 className="text-xs font-black text-stone-400 uppercase tracking-wider">
            Retailer & Drop Location (Fixed Shop Destination)
          </h2>
          <span className="text-[11px] font-bold text-amber-600">
            {hasValidCoordinates ? '✓ Verified GPS Pin' : 'Address Only'}
          </span>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">SHOP</div>
            <div className="text-base font-black text-stone-900 mt-0.5">
              {shopName}
            </div>
            {ownerName && (
              <div className="text-xs text-stone-600 font-medium">
                Owner: {ownerName}
              </div>
            )}
          </div>

          <div>
            <div className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">ADDRESS</div>
            <div className="flex items-start gap-2 text-xs text-stone-700 bg-stone-50 p-2.5 rounded-xl border border-stone-200/80 mt-1">
              <MapPin className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="leading-relaxed font-medium">{fullAddress || 'No shop address provided.'}</div>
                {landmark && (
                  <div className="text-amber-800 font-semibold">Landmark: {landmark}</div>
                )}
                {(city || pincode) && (
                  <div className="text-stone-500 font-mono text-[11px]">{[city, pincode].filter(Boolean).join(' — ')}</div>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">LOCATION</div>
            {hasValidCoordinates && latitude !== undefined && longitude !== undefined && navigationUrl ? (
              <div className="space-y-2 mt-1">
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] font-mono text-emerald-800">
                  <Compass className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-semibold">Destination available: {latitude.toFixed(5)}, {longitude.toFixed(5)}</span>
                </div>
                <button
                  type="button"
                  onClick={openGoogleMaps}
                  className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#0d1d25] hover:bg-stone-800 text-white text-xs font-black flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                >
                  <Navigation className="w-4 h-4 text-[#f5b024]" />
                  <span>Navigate to Shop</span>
                </button>
              </div>
            ) : (
              <div className="p-3 bg-stone-100 border border-stone-200 rounded-xl text-stone-600 text-xs flex items-center gap-2 mt-1">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Shop location is not available.</span>
              </div>
            )}
          </div>

          {/* Quick Communication Action */}
          <div className="pt-1">
            <a
              href={`tel:${customerPhone}`}
              className="w-full min-h-[44px] py-2.5 px-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-900 border border-stone-300 text-xs font-black flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-[0.98]"
            >
              <Phone className="w-3.5 h-3.5 text-stone-800" />
              <span>CALL CUSTOMER</span>
            </a>
          </div>
        </div>
      </div>

      {/* SECTION 3: ITEM SUMMARY (Strictly Read-only) */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-stone-100 pb-2">
          <h2 className="text-xs font-black text-stone-400 uppercase tracking-wider">
            Consignment Items ({items.length})
          </h2>
          <span className="text-[10px] text-stone-400">Strictly Read-Only</span>
        </div>

        <div className="divide-y divide-stone-100">
          {items.map((item: any, idx: number) => {
            const qty = item.quantity || item.qty || 1;
            const unitPrice = item.unitPrice || item.price || 0;
            const lineTotal = item.lineTotal || (unitPrice * qty);

            return (
              <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-stone-900">
                    {item.productName || item.name || 'FMCG Product'}
                  </div>
                  <div className="text-[11px] text-stone-500 font-mono">
                    SKU: {item.sku || 'SKU-001'} {item.packSize ? `• ${item.packSize}` : ''}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-black text-stone-900">
                    Qty: {qty}
                  </div>
                  <div className="text-[11px] text-stone-500 font-mono">
                    ₹{lineTotal.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 4: STATE-AUTHORITATIVE OPERATIONAL ACTION BAR */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-stone-200 p-3 shadow-2xl safe-area-bottom">
        <div className="max-w-md mx-auto">
          {/* ASSIGNED ACTIONS: Accept or Reject */}
          {status === 'ASSIGNED' && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsRejectModalOpen(true)}
                disabled={isSubmitting}
                className="flex-1 min-h-[48px] py-3 rounded-xl border border-[#e72b2b] text-[#e72b2b] hover:bg-red-50 text-xs font-black uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>REJECT</span>
              </button>
              <button
                type="button"
                onClick={handleAccept}
                disabled={isSubmitting}
                className="flex-2 min-h-[48px] py-3 rounded-xl bg-[#0d1d25] hover:bg-stone-800 text-[#f5b024] text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-stone-900/20 active:scale-[0.98] cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#f5b024]" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-[#f5b024]" />
                )}
                <span>ACCEPT DELIVERY</span>
              </button>
            </div>
          )}

          {/* ACCEPTED ACTIONS: Confirm Pickup */}
          {status === 'ACCEPTED' && (
            <button
              type="button"
              onClick={handlePickup}
              disabled={isSubmitting}
              className="w-full min-h-[48px] py-3 rounded-xl bg-[#f5b024] hover:bg-amber-400 text-[#0d1d25] text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Package className="w-4 h-4" />
              )}
              <span>CONFIRM PICKUP FROM WH-BRAHMPURI-01</span>
            </button>
          )}

          {/* PICKED_UP ACTIONS: Start Delivery */}
          {status === 'PICKED_UP' && (
            <button
              type="button"
              onClick={handleStartDelivery}
              disabled={isSubmitting}
              className="w-full min-h-[48px] py-3 rounded-xl bg-[#0d1d25] hover:bg-stone-800 text-[#f5b024] text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#f5b024]" />
              ) : (
                <Truck className="w-4 h-4" />
              )}
              <span>START DELIVERY TRIP</span>
            </button>
          )}

          {/* OUT_FOR_DELIVERY ACTIONS: Mark Delivered or Delivery Failed */}
          {status === 'OUT_FOR_DELIVERY' && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsFailedModalOpen(true)}
                disabled={isSubmitting}
                className="flex-1 min-h-[48px] py-3 rounded-xl border border-[#e72b2b] text-[#e72b2b] hover:bg-red-50 text-xs font-black uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>DELIVERY FAILED</span>
              </button>
              <button
                type="button"
                onClick={() => setIsDeliveredModalOpen(true)}
                disabled={isSubmitting}
                className="flex-2 min-h-[48px] py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>MARK DELIVERED</span>
              </button>
            </div>
          )}

          {/* FAILED_DELIVERY ACTIONS: Return to Warehouse */}
          {status === 'FAILED_DELIVERY' && (
            <button
              type="button"
              onClick={handleReturnToWarehouse}
              disabled={isSubmitting}
              className="w-full min-h-[48px] py-3 rounded-xl bg-stone-900 hover:bg-stone-800 text-amber-400 text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              <span>RETURN TO WAREHOUSE (WH-BRAHMPURI-01)</span>
            </button>
          )}

          {/* TERMINAL STATUSES (DELIVERED / RETURN_TO_WAREHOUSE) */}
          {(status === 'DELIVERED' || status === 'RETURN_TO_WAREHOUSE') && (
            <div className="text-center py-2 text-xs font-bold text-stone-500">
              {status === 'DELIVERED' ? 'Delivery successfully completed' : 'Consignment staged for hub return'}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <RejectModal
        orderId={order.orderId || order.id}
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        onConfirm={handleConfirmReject}
        isLoading={isSubmitting}
      />

      <FailedModal
        orderId={order.orderId || order.id}
        isOpen={isFailedModalOpen}
        onClose={() => setIsFailedModalOpen(false)}
        onConfirm={handleConfirmFailed}
        isLoading={isSubmitting}
      />

      <DeliveredModal
        order={order}
        isOpen={isDeliveredModalOpen}
        onClose={() => setIsDeliveredModalOpen(false)}
        onConfirm={handleConfirmDelivered}
        isLoading={isSubmitting}
      />
    </div>
  );
};
