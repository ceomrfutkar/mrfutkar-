import React, { useState, useEffect } from 'react';
import { useDelivery } from '../../context/DeliveryContext';
import { DeliveryClient } from '../../services/deliveryClient';
import {
  Truck,
  Building2,
  Power,
  Package,
  CheckCircle2,
  Clock,
  IndianRupee,
  AlertCircle,
  MapPin,
  ChevronRight,
  ShieldCheck,
  RotateCw,
  Loader2,
} from 'lucide-react';

import { DeliveryCodHandoverSection } from './DeliveryCodHandoverSection';

export const DeliveryPartnerHomeScreen: React.FC = () => {
  const {
    session,
    profile,
    availabilityStatus,
    setAvailability,
    orders,
    setCurrentTab,
    selectOrder,
    refreshOrders,
    isLoading,
    isSubmitting,
    error,
  } = useDelivery();

  // Metrics breakdown
  const assignedOrders = orders.filter(
    o => (o.delivery?.assignmentStatus || o.status) === 'ASSIGNED'
  );
  const inFlightOrders = orders.filter(o => {
    const s = o.delivery?.assignmentStatus || o.status;
    return s === 'ACCEPTED' || s === 'PICKED_UP' || s === 'OUT_FOR_DELIVERY';
  });
  const deliveredToday = orders.filter(
    o => (o.delivery?.assignmentStatus || o.status) === 'DELIVERED'
  );
  const [cashCustodyRupees, setCashCustodyRupees] = useState<number>(0);

  useEffect(() => {
    let isCancelled = false;
    DeliveryClient.getCashCustody()
      .then(res => {
        if (!isCancelled && res && typeof res.cashBalanceRupees === 'number') {
          setCashCustodyRupees(res.cashBalanceRupees);
        }
      })
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [orders]);

  const hasActiveTrips = inFlightOrders.length > 0;
  const isOnline = availabilityStatus === 'AVAILABLE' || availabilityStatus === 'ON_DELIVERY';

  const handleToggleAvailability = async () => {
    if (availabilityStatus === 'OFFLINE' || availabilityStatus === 'PAUSED') {
      await setAvailability('AVAILABLE');
    } else {
      if (hasActiveTrips || availabilityStatus === 'ON_DELIVERY') {
        alert('Cannot go OFFLINE while active orders or delivery trips are in progress.');
        return;
      }
      await setAvailability('OFFLINE');
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Top Welcome & Operational Status Card */}
      <div className="bg-[#0d1d25] border border-stone-800 rounded-2xl p-5 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-36 h-36 bg-[#f5b024]/5 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-widest text-[#f5b024] uppercase">
                DELIVERY PARTNER
              </span>
              <span className="text-stone-500">•</span>
              <span className="text-xs font-mono text-stone-300">
                {session?.partnerId || 'DP-DELHI-01'}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white mt-1">
              {session?.partnerName || profile?.name || 'Mukesh Sharma'}
            </h1>
            <div className="flex items-center gap-2 mt-2 text-xs text-stone-300">
              <Building2 className="w-3.5 h-3.5 text-[#f5b024]" />
              <span className="font-semibold text-white">MR FUTKAR — BRAHMPURI</span>
              <span className="text-[#f5b024] font-mono font-bold">(WH-BRAHMPURI-01)</span>
            </div>
          </div>

          {/* Vehicle / License Info */}
          <div className="bg-stone-900/90 border border-stone-800 rounded-xl p-3 text-xs space-y-1">
            <div className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">
              Assigned Vehicle
            </div>
            <div className="font-mono font-bold text-white flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-[#f5b024]" />
              <span>{profile?.vehicleNumber || 'DL-1L-AA-1234'}</span>
            </div>
            <div className="text-[10px] text-stone-400">
              Type: <span className="text-stone-200 uppercase">{profile?.vehicleType || 'TATA_ACE'}</span>
            </div>
          </div>
        </div>

        {/* Big Operational Availability Control */}
        <div className="mt-5 pt-4 border-t border-stone-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-3.5 h-3.5 rounded-full ${
                isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-stone-600'
              }`}
            />
            <div>
              <div className="text-[10px] text-stone-400 uppercase font-bold tracking-wider">
                Operational Duty Status
              </div>
              <div className="text-sm font-black tracking-tight text-white uppercase">
                {availabilityStatus === 'ON_DELIVERY'
                  ? 'ON DELIVERY TRIP'
                  : availabilityStatus === 'AVAILABLE'
                  ? 'ONLINE & AVAILABLE'
                  : 'OFFLINE'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleAvailability}
            disabled={isSubmitting || (hasActiveTrips && isOnline)}
            className={`min-h-[48px] px-6 py-3 rounded-xl font-black text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:opacity-50 ${
              isOnline
                ? 'bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 active:scale-[0.98]'
                : 'bg-[#f5b024] hover:bg-amber-400 text-[#0d1d25] active:scale-[0.98]'
            }`}
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Power className="w-4 h-4" />
            )}
            <span>{isOnline ? 'GO OFFLINE' : 'GO ONLINE'}</span>
          </button>
        </div>

        {hasActiveTrips && (
          <p className="text-[11px] text-amber-300/80 mt-2">
            * Delivery trip in progress. Offline toggle locked until active deliveries are completed or returned.
          </p>
        )}
      </div>

      {/* Operational Highlights Bento / Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => setCurrentTab('DELIVERIES')}
          className="bg-white border border-stone-200 rounded-xl p-3.5 shadow-sm hover:border-[#f5b024] transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">New Assigned</span>
            <Clock className="w-4 h-4 text-[#f5b024]" />
          </div>
          <div className="text-2xl font-black text-stone-900">{assignedOrders.length}</div>
          <div className="text-[10px] text-stone-400 mt-0.5">Awaiting pickup</div>
        </div>

        <div
          onClick={() => setCurrentTab('DELIVERIES')}
          className="bg-white border border-stone-200 rounded-xl p-3.5 shadow-sm hover:border-[#f5b024] transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">In Flight</span>
            <Truck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-stone-900">{inFlightOrders.length}</div>
          <div className="text-[10px] text-stone-400 mt-0.5">Picked up / Out</div>
        </div>

        <div
          onClick={() => setCurrentTab('HISTORY')}
          className="bg-white border border-stone-200 rounded-xl p-3.5 shadow-sm hover:border-[#f5b024] transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Delivered</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-stone-900">{deliveredToday.length}</div>
          <div className="text-[10px] text-stone-400 mt-0.5">Successful today</div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Cash in Custody</span>
            <IndianRupee className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-stone-900 font-mono">
            ₹{cashCustodyRupees.toLocaleString('en-IN')}
          </div>
          <div className="text-[10px] text-stone-400 mt-0.5">Physical cash for hub</div>
        </div>
      </div>

      {/* Immediate Active Action Section */}
      {inFlightOrders.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
              <h2 className="text-sm font-black text-amber-950 uppercase tracking-wide">
                Active In-Flight Consignment
              </h2>
            </div>
            <span className="text-xs font-bold text-amber-800 font-mono">
              {inFlightOrders[0].orderId}
            </span>
          </div>

          <div className="bg-white rounded-xl p-3 border border-amber-200/80 space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-sm font-bold text-stone-900">
                  {inFlightOrders[0].shopName || inFlightOrders[0].retailerName || 'Retailer Shop'}
                </div>
                <div className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                  <span className="truncate max-w-xs">{inFlightOrders[0].deliveryAddress || 'Brahmpuri Corridor'}</span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-900 uppercase">
                {inFlightOrders[0].delivery?.assignmentStatus || inFlightOrders[0].status}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-stone-100">
              <div className="text-xs font-mono font-bold text-stone-800">
                ₹{Number(inFlightOrders[0].totalAmount || inFlightOrders[0].grandTotal || 0).toLocaleString('en-IN')} • {(inFlightOrders[0].paymentMethod || inFlightOrders[0].payment?.method || 'COD').toUpperCase()}
              </div>

              <button
                type="button"
                onClick={() => selectOrder(inFlightOrders[0].orderId)}
                className="px-4 py-2 bg-[#0d1d25] hover:bg-stone-800 text-[#f5b024] text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer"
              >
                <span>Continue Action</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Assigned Orders Banner */}
      {assignedOrders.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-stone-900 uppercase tracking-wide">
              New Assigned Orders ({assignedOrders.length})
            </h2>
            <button
              type="button"
              onClick={() => setCurrentTab('DELIVERIES')}
              className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-0.5"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            {assignedOrders.slice(0, 3).map(order => (
              <div
                key={order.orderId}
                onClick={() => selectOrder(order.orderId)}
                className="p-3 rounded-xl border border-stone-200 hover:border-[#f5b024] transition-all flex items-center justify-between cursor-pointer bg-stone-50/50 hover:bg-white"
              >
                <div>
                  <div className="text-xs font-mono font-bold text-stone-900">{order.orderId}</div>
                  <div className="text-xs font-semibold text-stone-700 mt-0.5">
                    {order.shopName || order.retailerName || 'Retailer Shop'}
                  </div>
                  <div className="text-[10px] text-stone-500 mt-0.5">
                    Area: {order.deliveryArea || 'Brahmpuri Main'}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-black text-stone-900 font-mono">
                    ₹{Number(order.totalAmount || order.grandTotal || 0).toLocaleString('en-IN')}
                  </div>
                  <span className="inline-block mt-1 px-2 py-0.5 rounded text-[9px] font-bold bg-[#f5b024]/20 text-stone-900">
                    ASSIGNED
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase 6 Part 4B: Dedicated COD Cash Handover Section */}
      <DeliveryCodHandoverSection />

      {/* Single Warehouse Operating Anchor */}
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs text-stone-600 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-stone-500" />
          <span>Fulfillment Anchor: <strong className="text-stone-900">WH-BRAHMPURI-01</strong></span>
        </div>
        <span className="text-[11px] font-mono text-stone-500">MR FUTKAR — BRAHMPURI</span>
      </div>
    </div>
  );
};
