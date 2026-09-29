import React from 'react';

interface AdminStatusBadgeProps {
  status: string;
  className?: string;
}

export const AdminStatusBadge: React.FC<AdminStatusBadgeProps> = ({ status, className = '' }) => {
  const normalized = (status || '').toUpperCase();

  let colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';

  switch (normalized) {
    case 'SUPER_ADMIN':
    case 'ACTIVE':
    case 'DELIVERED':
    case 'PAID':
      colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      break;
    case 'CONFIRMED':
    case 'ACCEPTED':
    case 'PICKING':
    case 'PACKED':
    case 'READY_FOR_DISPATCH':
    case 'OUT_FOR_DELIVERY':
      colorClasses = 'bg-sky-50 text-sky-700 border-sky-200';
      break;
    case 'PLACED':
    case 'PENDING':
    case 'COD':
      colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
      break;
    case 'SUSPENDED':
    case 'DISABLED':
    case 'CANCELLED':
    case 'FAILED':
      colorClasses = 'bg-rose-50 text-rose-700 border-rose-200';
      break;
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${colorClasses} ${className}`}
    >
      {normalized.replace(/_/g, ' ')}
    </span>
  );
};
