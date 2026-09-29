import React, { useState } from 'react';
import { useDelivery } from '../../context/DeliveryContext';
import {
  User,
  Truck,
  Building2,
  Phone,
  ShieldCheck,
  CreditCard,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Save,
  Loader2,
  Lock,
} from 'lucide-react';

interface DeliveryPartnerProfileScreenProps {
  onLogout?: () => void;
  onSwitchToRetailerApp?: () => void;
}

export const DeliveryPartnerProfileScreen: React.FC<DeliveryPartnerProfileScreenProps> = ({
  onLogout,
  onSwitchToRetailerApp,
}) => {
  const {
    session,
    profile,
    availabilityStatus,
    updateProfile,
    logout,
    isSubmitting,
    error,
  } = useDelivery();

  const [alternateMobile, setAlternateMobile] = useState(profile?.alternateMobile || '');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg(null);
    const ok = await updateProfile({ alternateMobile: alternateMobile.trim() });
    if (ok) {
      setSuccessMsg('Alternate mobile updated successfully on server.');
    }
  };

  const handleLogout = async () => {
    await logout();
    if (onLogout) onLogout();
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
        <h1 className="text-xl font-black text-stone-900 uppercase tracking-tight">
          Delivery Partner Profile
        </h1>
        <p className="text-xs text-stone-500 mt-0.5">
          Authoritative fleet partner registration at WH-BRAHMPURI-01
        </p>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Primary Identity Card (Read-only server fields) */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#0d1d25] text-[#f5b024] flex items-center justify-center font-black shadow-md">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-black text-stone-900">
                {session?.partnerName || profile?.name || 'Mukesh Sharma'}
              </h2>
              <div className="flex items-center gap-2 text-xs font-mono text-stone-500 mt-0.5">
                <span>ID: {session?.partnerId || profile?.partnerId || 'DP-DELHI-01'}</span>
                <span>•</span>
                <span className="font-bold text-[#f5b024] uppercase">
                  {session?.role || 'DELIVERY_PARTNER'}
                </span>
              </div>
            </div>
          </div>

          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900 uppercase flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
            VERIFIED
          </span>
        </div>

        {/* Read-Only Protected Attributes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="bg-stone-50 p-3 rounded-xl border border-stone-100 space-y-1">
            <div className="text-[10px] text-stone-400 font-bold uppercase flex items-center gap-1">
              <Lock className="w-3 h-3" />
              <span>Registered Mobile (Primary)</span>
            </div>
            <div className="font-mono font-bold text-stone-900">
              +91 {session?.mobile || profile?.mobile || '9810012345'}
            </div>
          </div>

          <div className="bg-stone-50 p-3 rounded-xl border border-stone-100 space-y-1">
            <div className="text-[10px] text-stone-400 font-bold uppercase flex items-center gap-1">
              <Lock className="w-3 h-3" />
              <span>Assigned Warehouse</span>
            </div>
            <div className="font-bold text-stone-900 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-[#f5b024]" />
              <span>MR FUTKAR — BRAHMPURI</span>
            </div>
            <div className="text-[10px] text-stone-500 font-mono">WH-BRAHMPURI-01</div>
          </div>

          <div className="bg-stone-50 p-3 rounded-xl border border-stone-100 space-y-1">
            <div className="text-[10px] text-stone-400 font-bold uppercase flex items-center gap-1">
              <Lock className="w-3 h-3" />
              <span>Vehicle Registration</span>
            </div>
            <div className="font-mono font-bold text-stone-900 flex items-center gap-1">
              <Truck className="w-3.5 h-3.5 text-[#f5b024]" />
              <span>{profile?.vehicleNumber || 'DL-1L-AA-1234'}</span>
            </div>
            <div className="text-[10px] text-stone-500">
              Type: {profile?.vehicleType || 'TATA_ACE'}
            </div>
          </div>

          <div className="bg-stone-50 p-3 rounded-xl border border-stone-100 space-y-1">
            <div className="text-[10px] text-stone-400 font-bold uppercase flex items-center gap-1">
              <Lock className="w-3 h-3" />
              <span>Commercial Driving License</span>
            </div>
            <div className="font-mono font-bold text-stone-900">
              {profile?.licenseNumber || 'DL-1420110012345'}
            </div>
            <div className="text-[10px] text-emerald-600 font-bold">Commercial Transport Endorsed</div>
          </div>
        </div>
      </div>

      {/* Editable Contact Section (Authorized backend PATCH) */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-3">
        <h3 className="text-xs font-black text-stone-400 uppercase tracking-wider">
          Editable Operational Contact
        </h3>

        <form onSubmit={handleUpdateContact} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Alternate Mobile Number (For Emergency Hub Contact)
            </label>
            <div className="flex gap-2">
              <span className="inline-flex items-center px-3 rounded-xl border border-stone-200 bg-stone-50 text-stone-500 text-xs font-mono">
                +91
              </span>
              <input
                type="tel"
                maxLength={10}
                value={alternateMobile}
                onChange={e => setAlternateMobile(e.target.value.replace(/\D/g, ''))}
                placeholder="9810998877"
                className="flex-1 bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs text-stone-900 font-mono focus:outline-none focus:border-[#f5b024]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-[#0d1d25] hover:bg-stone-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5 text-[#f5b024]" />
            )}
            <span>Save Contact</span>
          </button>
        </form>
      </div>

      {/* Logout & App Switching */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm space-y-3">
        <h3 className="text-xs font-black text-stone-400 uppercase tracking-wider">
          Session & Access Control
        </h3>

        <div className="space-y-2">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-3 px-4 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-[#e72b2b] text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out from Delivery App</span>
          </button>

          {onSwitchToRetailerApp && (
            <button
              type="button"
              onClick={onSwitchToRetailerApp}
              className="w-full py-2.5 px-4 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>Switch to Retailer Portal</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
