import React from 'react';
import { useAdmin } from '../../context/AdminContext';
import { Shield, User, Phone, Mail, Clock, Calendar, CheckCircle2, LogOut, ArrowLeft, Key, Lock, AlertTriangle } from 'lucide-react';

interface AdminProfileScreenProps {
  onBack?: () => void;
}

export const AdminProfileScreen: React.FC<AdminProfileScreenProps> = ({ onBack }) => {
  const { session, profile, logout } = useAdmin();

  const activeData = profile || session;

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return 'N/A';
    try {
      return new Date(isoStr).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0e12] text-stone-100 flex flex-col">
      {/* Top Header */}
      <header className="bg-stone-900/50 backdrop-blur-md border-b border-stone-800/80 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black tracking-tight text-white">Super Admin Profile</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {activeData?.role || 'SUPER_ADMIN'}
              </span>
            </div>
            <p className="text-xs text-stone-400">MR FUTKAR Platform Security &amp; Authorization Registry</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-stone-300 hover:text-white bg-stone-800/80 hover:bg-stone-800 rounded-lg border border-stone-700 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          )}
          <button
            onClick={() => logout()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg border border-rose-500/30 transition-all cursor-pointer"
            title="Terminate Super Admin Session"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-6 max-w-4xl mx-auto w-full space-y-6">
        {/* Identity Overview Card */}
        <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-amber-600/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black text-xl shadow-inner">
                {activeData?.name?.charAt(0) || 'A'}
              </div>
              <div>
                <h2 className="text-lg font-black text-white">{activeData?.name || 'Akash Gupta'}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-xs text-amber-300/80">{activeData?.uid}</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 className="w-3 h-3" />
                    {activeData?.status || 'ACTIVE'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-start sm:items-end">
              <span className="text-[11px] uppercase tracking-wider font-bold text-stone-400">Permissions Version</span>
              <span className="font-mono text-xs text-stone-200 mt-0.5">v{activeData?.permissionsVersion || 1}.0-authoritative</span>
            </div>
          </div>
        </div>

        {/* Safe Operational Metadata Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-stone-900/60 border border-stone-800 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-400/90 flex items-center gap-2">
              <User className="w-4 h-4" />
              <span>Identity &amp; Contact</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
                  Full Name
                </label>
                <div className="text-sm font-semibold text-white bg-stone-950/60 px-3 py-2 rounded-lg border border-stone-800/80">
                  {activeData?.name || 'N/A'}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-stone-400" />
                  <span>Registered Mobile</span>
                </label>
                <div className="text-sm font-mono text-stone-200 bg-stone-950/60 px-3 py-2 rounded-lg border border-stone-800/80">
                  {activeData?.mobile || 'N/A'}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5 flex items-center gap-1">
                  <Mail className="w-3 h-3 text-stone-400" />
                  <span>Official Email</span>
                </label>
                <div className="text-sm font-mono text-stone-200 bg-stone-950/60 px-3 py-2 rounded-lg border border-stone-800/80">
                  {activeData?.email || 'ceo.mrfutkar@gmail.com'}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-stone-900/60 border border-stone-800 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-400/90 flex items-center gap-2">
              <Lock className="w-4 h-4" />
              <span>RBAC Governance &amp; Security</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
                  Assigned Operational Role
                </label>
                <div className="text-sm font-bold text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg border border-amber-500/20 flex items-center justify-between">
                  <span>{activeData?.role || 'SUPER_ADMIN'}</span>
                  <span className="text-[10px] text-stone-400 font-normal">Highest Tier</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5">
                  Account Status
                </label>
                <div className="text-sm font-bold text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-lg border border-emerald-500/20 flex items-center justify-between">
                  <span>{activeData?.status || 'ACTIVE'}</span>
                  <span className="text-[10px] text-stone-400 font-normal">Read-Only Control</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 block mb-0.5 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-stone-400" />
                  <span>Last Authenticated Session</span>
                </label>
                <div className="text-xs font-mono text-stone-300 bg-stone-950/60 px-3 py-2 rounded-lg border border-stone-800/80">
                  {formatDate(activeData?.lastLoginAt)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Security Immutability Notice */}
        <div className="p-4 rounded-xl bg-stone-900/40 border border-stone-800 flex items-start gap-3">
          <Key className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-stone-400 leading-relaxed">
            <strong className="text-stone-200">Server-Authoritative RBAC Notice:</strong> Administrative roles, status flags, and permissions are cryptographically verified server-side. Direct client-side tampering, role injection headers, or arbitrary Firestore document mutations are strictly rejected by security rules.
          </div>
        </div>

        {/* Phase 3A Controlled Placeholder for Future Dashboard */}
        <div className="p-6 rounded-2xl bg-gradient-to-b from-stone-900/70 to-stone-950 border border-stone-800 text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span>🛡️ Phase 3A Foundation Verified</span>
          </div>
          <h4 className="text-base font-bold text-white">MR FUTKAR Admin Panel</h4>
          <p className="text-xs text-stone-400 max-w-md mx-auto">
            Super Admin authentication, session authority, server-side RBAC guards, and immutable audit logs have been established. Business modules (Product &amp; Pricing Management) will be deployed in subsequent phases.
          </p>
        </div>
      </main>
    </div>
  );
};
