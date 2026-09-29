import React from 'react';
import { useAdmin } from '../../context/AdminContext';
import { ShieldAlert, Loader2, ArrowLeft } from 'lucide-react';

interface AdminProtectedRouteProps {
  children: React.ReactNode;
  fallbackToLogin?: React.ReactNode;
  onExit?: () => void;
}

export const AdminProtectedRoute: React.FC<AdminProtectedRouteProps> = ({
  children,
  fallbackToLogin,
  onExit,
}) => {
  const { isLoading, isAuthenticated, isAuthorized, error, logout } = useAdmin();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-6 text-stone-200">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
          <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
        </div>
        <p className="text-sm font-semibold tracking-wide text-stone-400">Verifying Super Admin Authorization...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (fallbackToLogin) {
      return <>{fallbackToLogin}</>;
    }
    return (
      <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-6 text-center text-stone-200">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4">
          <ShieldAlert className="w-7 h-7 text-rose-500" />
        </div>
        <h2 className="text-xl font-black text-white tracking-tight mb-2">Authentication Required</h2>
        <p className="text-sm text-stone-400 max-w-sm mb-6">
          You must sign in with verified Super Admin credentials to access this administrative portal.
        </p>
        {onExit && (
          <button
            onClick={onExit}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-stone-300 bg-stone-900 hover:bg-stone-800 rounded-xl border border-stone-800 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Retailer Portal
          </button>
        )}
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-6 text-center text-stone-200">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4">
          <ShieldAlert className="w-7 h-7 text-rose-500" />
        </div>
        <h2 className="text-xl font-black text-white tracking-tight mb-2">Access Denied</h2>
        <p className="text-sm text-rose-400 font-medium max-w-sm mb-6">
          {error || 'Admin access is not authorized for this account.'}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => logout()}
            className="px-4 py-2 text-xs font-bold text-stone-300 bg-stone-900 hover:bg-stone-800 rounded-xl border border-stone-800 transition-all cursor-pointer"
          >
            Switch Account
          </button>
          {onExit && (
            <button
              onClick={onExit}
              className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-stone-950 bg-amber-500 hover:bg-amber-400 rounded-xl transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Store
            </button>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
