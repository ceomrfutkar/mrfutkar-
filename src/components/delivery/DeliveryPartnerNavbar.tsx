import React from 'react';
import { useDelivery } from '../../context/DeliveryContext';
import {
  Truck,
  Building2,
  UserCheck,
  Power,
  RotateCw,
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

interface DeliveryPartnerNavbarProps {
  onSwitchToRetailerApp?: () => void;
}

export const DeliveryPartnerNavbar: React.FC<DeliveryPartnerNavbarProps> = ({
  onSwitchToRetailerApp,
}) => {
  const {
    session,
    availabilityStatus,
    currentTab,
    setCurrentTab,
    refreshOrders,
    isLoading,
    logout,
  } = useDelivery();

  const getStatusBadge = () => {
    switch (availabilityStatus) {
      case 'AVAILABLE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[11px] font-bold tracking-wide uppercase">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            ONLINE
          </span>
        );
      case 'ON_DELIVERY':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[11px] font-bold tracking-wide uppercase">
            <Truck className="w-3 h-3 text-amber-400" />
            ON TRIP
          </span>
        );
      case 'PAUSED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-600/20 border border-amber-600/40 text-amber-300 text-[11px] font-bold tracking-wide uppercase">
            PAUSED
          </span>
        );
      case 'OFFLINE':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-stone-700/40 border border-stone-600/40 text-stone-300 text-[11px] font-bold tracking-wide uppercase">
            <span className="w-2 h-2 rounded-full bg-stone-500" />
            OFFLINE
          </span>
        );
    }
  };

  return (
    <header className="bg-[#0d1d25] border-b border-stone-800 text-white sticky top-0 z-40 shadow-lg">
      {/* Top Identity Bar */}
      <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between">
        {/* Left: Brand & Partner Badge */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#f5b024] text-[#0d1d25] flex items-center justify-center font-black shadow-md">
            <Truck className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-sm tracking-tight text-white uppercase">
                MR FUTKAR
              </span>
              <span className="bg-[#f5b024]/20 border border-[#f5b024]/40 text-[#f5b024] text-[10px] font-black px-1.5 py-0.5 rounded tracking-wider uppercase">
                DELIVERY
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-stone-300 font-medium mt-0.5">
              <UserCheck className="w-3.5 h-3.5 text-[#f5b024]" />
              <span className="truncate max-w-[140px] sm:max-w-xs font-semibold text-white">
                {session?.partnerName || 'Delivery Partner'}
              </span>
              <span className="text-stone-500 text-[10px] font-mono">
                ({session?.partnerId || 'DP-01'})
              </span>
            </div>
          </div>
        </div>

        {/* Right: Status Badge & Quick Controls */}
        <div className="flex items-center gap-2">
          {getStatusBadge()}

          <button
            type="button"
            onClick={() => refreshOrders()}
            disabled={isLoading}
            className="p-2 rounded-lg bg-stone-800/80 hover:bg-stone-700 text-stone-300 hover:text-white transition-colors border border-stone-700"
            title="Refresh Deliveries"
          >
            <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#f5b024]' : ''}`} />
          </button>

          {onSwitchToRetailerApp && (
            <button
              type="button"
              onClick={onSwitchToRetailerApp}
              className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-stone-800 text-stone-300 hover:text-white hover:bg-stone-700 border border-stone-700 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Retailer App</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-strip: Operational Warehouse Lock (WH-BRAHMPURI-01) */}
      <div className="bg-stone-900/90 border-t border-stone-800/80 px-4 py-1.5 text-[11px] text-stone-300 flex items-center justify-between">
        <div className="max-w-4xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-mono">
            <Building2 className="w-3.5 h-3.5 text-[#f5b024]" />
            <span className="font-bold text-white">MR FUTKAR — BRAHMPURI</span>
            <span className="text-[#f5b024] font-bold">(WH-BRAHMPURI-01)</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-stone-400">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>Server Authoritative Session</span>
          </div>
        </div>
      </div>
    </header>
  );
};
