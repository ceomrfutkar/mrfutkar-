import React from 'react';
import { useAdmin } from '../../context/AdminContext';
import { AdminStatusBadge } from './AdminStatusBadge';

interface AdminHeaderProps {
  onToggleSidebar: () => void;
  onNavigateProfile: () => void;
  onBackToRetailer?: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  onToggleSidebar,
  onNavigateProfile,
  onBackToRetailer,
}) => {
  const { session, logout } = useAdmin();

  return (
    <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between shadow-2xs">
      {/* Left section: Hamburger & Title */}
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          onClick={onToggleSidebar}
          className="p-2 -ml-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 lg:hidden focus:outline-hidden"
          aria-label="Toggle Navigation Menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex items-center gap-2.5">
          <span className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
            MR FUTKAR
          </span>
          <span className="hidden sm:inline text-slate-300">|</span>
          <span className="text-xs sm:text-sm font-semibold text-slate-600">
            Admin Panel
          </span>
        </div>
      </div>

      {/* Right section: Admin identity, badge, Profile, Logout */}
      <div className="flex items-center gap-2 sm:gap-4">
        {session && (
          <div className="hidden md:flex flex-col text-right">
            <span className="text-xs font-bold text-slate-900 leading-tight">
              {session.name}
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              {session.mobile}
            </span>
          </div>
        )}

        <AdminStatusBadge status="SUPER_ADMIN" />

        <div className="h-6 w-px bg-slate-200 hidden sm:block" />

        <button
          onClick={onNavigateProfile}
          className="p-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center gap-1.5"
          title="Admin Profile"
        >
          <span>👤</span>
          <span className="hidden sm:inline">Profile</span>
        </button>

        <button
          onClick={logout}
          className="p-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors flex items-center gap-1.5"
          title="Sign Out"
        >
          <span>🚪</span>
          <span className="hidden sm:inline">Logout</span>
        </button>

        {onBackToRetailer && (
          <button
            onClick={onBackToRetailer}
            className="hidden xl:inline-flex items-center px-2.5 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded border border-slate-200 transition-colors"
          >
            Switch to Store
          </button>
        )}
      </div>
    </header>
  );
};
