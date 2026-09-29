import React from 'react';

interface AdminStatCardProps {
  label: string;
  value: string | number | null | undefined;
  subValue?: string;
  subLabel?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  isLoading?: boolean;
  error?: string | null;
  accentColor?: string;
}

export const AdminStatCard: React.FC<AdminStatCardProps> = ({
  label,
  value,
  subValue,
  subLabel,
  icon,
  trend,
  isLoading = false,
  error = null,
  accentColor = '#f5b024',
}) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm hover:shadow transition-shadow relative overflow-hidden flex flex-col justify-between">
      {/* Accent top stripe */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ backgroundColor: accentColor }}
      />

      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-xs font-semibold tracking-wider uppercase text-slate-500">
          {label}
        </span>
        {icon && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 bg-slate-50 border border-slate-100"
          >
            {icon}
          </div>
        )}
      </div>

      <div className="my-1">
        {isLoading ? (
          <div className="space-y-2 py-1">
            <div className="h-8 w-24 bg-slate-200 animate-pulse rounded" />
            <div className="h-3 w-16 bg-slate-100 animate-pulse rounded" />
          </div>
        ) : error ? (
          <div className="py-1">
            <span className="text-sm font-medium text-rose-600">--</span>
            <p className="text-xs text-rose-500 mt-1">{error}</p>
          </div>
        ) : (
          <div>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {value !== undefined && value !== null ? value : '--'}
            </div>
            {subValue && (
              <div className="text-xs text-slate-500 mt-1">
                {subValue} {subLabel && <span className="text-slate-400">({subLabel})</span>}
              </div>
            )}
          </div>
        )}
      </div>

      {trend && !isLoading && !error && (
        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center text-xs">
          <span
            className={`font-semibold mr-1.5 ${
              trend.isPositive ? 'text-emerald-600' : 'text-slate-500'
            }`}
          >
            {trend.value}
          </span>
          <span className="text-slate-400">vs yesterday</span>
        </div>
      )}
    </div>
  );
};
