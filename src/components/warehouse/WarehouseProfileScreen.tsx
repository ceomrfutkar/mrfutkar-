import React from 'react';
import { useWarehouse } from '../../context/WarehouseContext';
import {
  Building2,
  ShieldCheck,
  UserCheck,
  MapPin,
  Mail,
  Lock,
  Phone,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Store,
  Layers,
} from 'lucide-react';

interface WarehouseProfileScreenProps {
  onLogout?: () => void;
  onSwitchToRetailerApp?: () => void;
}

export const WarehouseProfileScreen: React.FC<WarehouseProfileScreenProps> = ({
  onLogout,
  onSwitchToRetailerApp,
}) => {
  const {
    warehouseId,
    warehouseName,
    branchName,
    currentUser,
    serviceAreas,
    logout,
  } = useWarehouse();

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      logout();
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'WAREHOUSE_ADMIN':
        return 'Hub In-charge (Administrator)';
      case 'WAREHOUSE_MANAGER':
        return 'Warehouse Inventory & Operations Manager';
      case 'WAREHOUSE_STAFF':
        return 'Picking, Packing & Dispatch Operations Staff';
      default:
        return role;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Profile Header */}
      <div className="bg-stone-900 text-white rounded-2xl p-6 border border-stone-800 shadow-md">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500 text-stone-950 flex items-center justify-center font-black text-2xl shadow-lg border border-amber-400">
              WH
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">{warehouseName}</h1>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {warehouseId}
                </span>
              </div>
              <p className="text-xs text-stone-300 mt-1 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-amber-400" />
                <span>{branchName}</span>
                <span className="text-stone-600">•</span>
                <span className="text-emerald-400 font-medium">Active Central Fulfillment Hub</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {onSwitchToRetailerApp && (
              <button
                type="button"
                onClick={onSwitchToRetailerApp}
                className="flex items-center gap-1.5 px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-bold transition-all border border-stone-700 cursor-pointer"
              >
                <Store className="w-3.5 h-3.5 text-amber-400" />
                <span>Retailer App</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-950/80 hover:bg-rose-900 text-rose-200 rounded-xl text-xs font-bold transition-all border border-rose-800/80 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Personnel & Identity Card */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-xs p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-amber-600" />
              <span>Authorized Personnel Profile</span>
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-bold border border-amber-200">
              SERVER AUTHORIZED
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">
                Full Name
              </span>
              <p className="text-sm font-bold text-stone-900 mt-0.5">{currentUser.name}</p>
            </div>

            <div>
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">
                Personnel Identifier
              </span>
              <p className="text-xs font-mono font-bold text-stone-700 mt-0.5">{currentUser.userId}</p>
            </div>

            <div>
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">
                Official Email
              </span>
              <p className="text-xs text-stone-600 mt-0.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-stone-400" />
                <span>{currentUser.email || 'staff@mrfutkar.in'}</span>
              </p>
            </div>

            <div>
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">
                Assigned Operational Role
              </span>
              <div className="mt-1 flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-stone-900 text-amber-400 font-mono text-xs font-bold inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {currentUser.role}
                </span>
                <span className="text-xs text-stone-500 font-medium">
                  {getRoleLabel(currentUser.role)}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-stone-100">
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">
                Access Authorization
              </span>
              <div className="mt-1 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Warehouse operational access (Strictly WH-BRAHMPURI-01 boundary)</span>
              </div>
              <p className="text-[10px] text-stone-400 mt-1 italic">
                Role and warehouse ID are immutable and enforced authoritatively by server RBAC.
              </p>
            </div>
          </div>
        </div>

        {/* Operational Hub & Service Areas Card */}
        <div className="bg-white rounded-2xl border border-stone-200 shadow-xs p-6 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-600" />
              <span>Central Fulfillment Hub Specs</span>
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-100 text-stone-800 font-bold border border-stone-200">
              WH-BRAHMPURI-01
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">
                Hub Facility Name
              </span>
              <p className="text-sm font-bold text-stone-900 mt-0.5">MR FUTKAR — BRAHMPURI</p>
            </div>

            <div>
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">
                Branch Designation
              </span>
              <p className="text-xs font-semibold text-stone-700 mt-0.5">Brahmpuri Branch</p>
            </div>

            <div>
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block">
                Warehouse ID
              </span>
              <p className="text-xs font-mono font-bold text-amber-900 bg-amber-50 px-2 py-1 rounded inline-block mt-0.5 border border-amber-200">
                WH-BRAHMPURI-01
              </p>
            </div>

            {/* Service Areas Section */}
            <div>
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block mb-1.5">
                Authorized Kirana Service Areas
              </span>
              <div className="grid grid-cols-2 gap-2">
                {serviceAreas.map(area => {
                  const isKarawal = area.toLowerCase().includes('karawal');
                  return (
                    <div
                      key={area}
                      className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                        isKarawal
                          ? 'bg-amber-50/70 border-amber-200 text-amber-950 font-bold'
                          : 'bg-stone-50 border-stone-200 text-stone-800 font-medium'
                      }`}
                    >
                      <MapPin
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isKarawal ? 'text-amber-600' : 'text-stone-400'
                        }`}
                      />
                      <span>{area}</span>
                    </div>
                  );
                })}
              </div>

              {/* Explicit Karawal Nagar Territory Note */}
              <div className="mt-3 p-3 bg-stone-50 rounded-xl border border-stone-200 text-[11px] text-stone-600 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-stone-800">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Territory Fulfillment Policy</span>
                </div>
                <p>
                  Karawal Nagar is strictly a delivery service corridor fulfilled exclusively by{' '}
                  <strong className="text-stone-900">WH-BRAHMPURI-01</strong>. It is not an independent warehouse, stock pool, or separate fulfillment hub.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
