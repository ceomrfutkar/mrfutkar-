import React from 'react';
import { AdminWarehouseActivity } from '../../../types/adminWarehouse';

interface AdminWarehouseActivitySectionProps {
  activities: AdminWarehouseActivity[];
  isLoading: boolean;
}

export const AdminWarehouseActivitySection: React.FC<AdminWarehouseActivitySectionProps> = ({
  activities,
  isLoading,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden mb-6">
      <div className="bg-slate-950/60 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
            Authoritative Warehouse Activity & Audit Trail
          </span>
          <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-300">
            Append-Only
          </span>
        </div>
        <span className="text-[11px] text-slate-500 font-mono">
          adminAuditLogs & Order History
        </span>
      </div>

      <div className="divide-y divide-slate-800/60 max-h-80 overflow-y-auto">
        {isLoading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="p-3 animate-pulse">
              <div className="h-4 bg-slate-800/40 rounded w-3/4 mb-1" />
              <div className="h-3 bg-slate-800/30 rounded w-1/3" />
            </div>
          ))
        ) : activities.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No recent warehouse activity recorded.
          </div>
        ) : (
          activities.map(act => (
            <div key={act.id} className="p-3 hover:bg-slate-800/30 transition-colors flex items-center justify-between gap-4 text-xs">
              <div className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                <div>
                  <div className="text-slate-200 font-medium">{act.description}</div>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                    {act.action} · Target: {act.targetId}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0 text-slate-400 font-mono text-[11px]">
                <div>{act.actor}</div>
                <div className="text-slate-500 text-[10px]">{new Date(act.timestamp).toLocaleTimeString()}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
