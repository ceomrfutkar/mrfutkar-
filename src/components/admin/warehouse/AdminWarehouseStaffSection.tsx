import React from 'react';
import { AdminWarehouseStaff } from '../../../types/adminWarehouse';

interface AdminWarehouseStaffSectionProps {
  staff: AdminWarehouseStaff[];
  isLoading: boolean;
}

export const AdminWarehouseStaffSection: React.FC<AdminWarehouseStaffSectionProps> = ({
  staff,
  isLoading,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden mb-6">
      <div className="bg-slate-950/60 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
            Warehouse Personnel & Staff Directory
          </span>
          <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-300">
            WH-BRAHMPURI-01
          </span>
        </div>
        <span className="text-[11px] text-slate-500 font-mono">
          Authoritative RBAC Registry (Read-only)
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950/40 text-slate-400 uppercase text-[10px] border-b border-slate-800">
            <tr>
              <th className="px-4 py-2.5">Staff Member</th>
              <th className="px-4 py-2.5">Assigned Role</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Operational Branch</th>
              <th className="px-4 py-2.5 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={5} className="px-4 py-3">
                    <div className="h-4 bg-slate-800/40 rounded w-full" />
                  </td>
                </tr>
              ))
            ) : staff.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No warehouse staff members registered for this facility.
                </td>
              </tr>
            ) : (
              staff.map(s => (
                <tr key={s.userId} className="hover:bg-slate-800/30">
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-slate-200">{s.name}</div>
                    <div className="font-mono text-[10px] text-slate-500">{s.userId}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                      s.role === 'WAREHOUSE_ADMIN'
                        ? 'bg-purple-950/80 text-purple-400 border border-purple-500/30'
                        : s.role === 'WAREHOUSE_MANAGER'
                        ? 'bg-blue-950/80 text-blue-400 border border-blue-500/30'
                        : 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {s.role}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-400">
                    {s.email || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">
                    {s.branchName}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                      s.isActive
                        ? 'bg-emerald-950/70 text-emerald-400'
                        : 'bg-rose-950/70 text-rose-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.isActive ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                      {s.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
