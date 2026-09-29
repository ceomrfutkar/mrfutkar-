import React, { useState } from 'react';
import { useWarehouse } from '../../context/WarehouseContext';
import {
  History,
  Search,
  Filter,
  Building2,
  Boxes,
  RefreshCw,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

export const WarehouseAuditLogsScreen: React.FC = () => {
  const {
    movements,
    refreshMovements,
    warehouseId,
    warehouseName,
    isLoading,
  } = useWarehouse();

  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState('ALL');

  const reasons = Array.from(new Set(movements.map(m => m.reason))).filter(Boolean);

  let filteredMovements = movements;
  if (reasonFilter !== 'ALL') {
    filteredMovements = filteredMovements.filter(m => m.reason === reasonFilter);
  }
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    filteredMovements = filteredMovements.filter(
      m =>
        m.productName.toLowerCase().includes(q) ||
        m.sku.toLowerCase().includes(q) ||
        m.movementId.toLowerCase().includes(q) ||
        (m.notes || '').toLowerCase().includes(q) ||
        (m.userName || '').toLowerCase().includes(q)
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-stone-900">Immutable Stock Movement Audit Ledger</h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold border border-amber-300">
                {warehouseId}
              </span>
            </div>
            <p className="text-xs text-stone-500">
              Permanent append-only transaction logs for {warehouseName} ({filteredMovements.length} audit records)
            </p>
          </div>

          <button
            type="button"
            onClick={refreshMovements}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold px-3 py-1.5 rounded-lg border border-stone-300 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Audit Logs</span>
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-stone-100 text-xs">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-stone-400" />
            <input
              type="text"
              placeholder="Search product, SKU, movement ID, staff, notes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 text-stone-900"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5">
            <Filter className="w-3.5 h-3.5 text-stone-500" />
            <span className="text-stone-400 font-medium">Reason Code:</span>
            <select
              value={reasonFilter}
              onChange={e => setReasonFilter(e.target.value)}
              className="bg-transparent text-stone-800 font-semibold focus:outline-none cursor-pointer w-full"
            >
              <option value="ALL">All Adjustment Reasons</option>
              {reasons.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 text-stone-600 font-bold border-b border-stone-200 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Timestamp & ID</th>
                <th className="py-3 px-4">Product & SKU</th>
                <th className="py-3 px-4">Adjustment Reason</th>
                <th className="py-3 px-4 text-center">Previous</th>
                <th className="py-3 px-4 text-center">Delta</th>
                <th className="py-3 px-4 text-center">New Stock</th>
                <th className="py-3 px-4">Authorized Staff</th>
                <th className="py-3 px-4">Audit Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-800">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-stone-500">
                    No stock movements recorded yet.
                  </td>
                </tr>
              ) : (
                filteredMovements.map(m => {
                  const isPositive = m.adjustmentQuantity > 0;

                  return (
                    <tr key={m.movementId} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-stone-900 block text-[11px]">
                          {m.movementId.substring(0, 10)}...
                        </span>
                        <span className="text-[10px] text-stone-400">
                          {m.timestamp ? new Date(m.timestamp).toLocaleString() : '—'}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-bold text-stone-900 block">{m.productName}</span>
                        <span className="text-[10px] text-stone-500 font-mono">{m.sku}</span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="inline-block font-semibold text-stone-700 bg-stone-100 px-2 py-0.5 rounded text-[11px]">
                          {m.reason}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center font-mono text-stone-600 font-bold">
                        {m.previousQuantity}
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-black text-sm">
                        <span className={isPositive ? 'text-emerald-600' : 'text-rose-600'}>
                          {isPositive ? `+${m.adjustmentQuantity}` : m.adjustmentQuantity}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-black text-stone-900 text-sm">
                        {m.newQuantity}
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-semibold text-stone-900 block">{m.userName || 'Warehouse Staff'}</span>
                        <span className="text-[10px] text-stone-400 font-mono">{m.userId}</span>
                      </td>

                      <td className="py-3 px-4 text-stone-600 max-w-[200px] truncate text-[11px]">
                        {m.notes || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
