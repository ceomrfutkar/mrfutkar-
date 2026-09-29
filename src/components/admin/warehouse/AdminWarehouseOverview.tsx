import React from 'react';
import { AdminWarehouseMetrics, AdminWarehouseHub } from '../../../types/adminWarehouse';

interface AdminWarehouseOverviewProps {
  metrics: AdminWarehouseMetrics | null;
  hub: AdminWarehouseHub | null;
  isLoading: boolean;
  onSelectQueue: (queue: 'acceptance' | 'picking' | 'packing' | 'dispatch' | 'all') => void;
  activeQueue: string;
}

export const AdminWarehouseOverview: React.FC<AdminWarehouseOverviewProps> = ({
  metrics,
  hub,
  isLoading,
  onSelectQueue,
  activeQueue,
}) => {
  if (isLoading && !metrics) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="h-24 bg-slate-900/60 border border-slate-800 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const m = metrics || {
    awaitingAcceptance: 0,
    currentlyPicking: 0,
    awaitingPacking: 0,
    packed: 0,
    readyForDispatch: 0,
    dispatched: 0,
    delivered: 0,
    totalPendingWarehouseOrders: 0,
    agingBreakdown: {
      aging_0_2h: 0,
      aging_2_6h: 0,
      aging_6_12h: 0,
      aging_12_24h: 0,
      aging_24h_plus: 0,
      agingBeyondThreshold: 0,
    },
    lowStockCount: 0,
    outOfStockCount: 0,
    lowStockProducts: [],
    todayThroughput: {
      acceptedToday: 0,
      pickedToday: 0,
      packedToday: 0,
      readyForDispatchToday: 0,
      deliveredToday: 0,
    },
    avgProcessingTimeMinutes: null,
  };

  const statCards = [
    {
      id: 'acceptance',
      label: 'Awaiting Acceptance',
      count: m.awaitingAcceptance,
      description: 'Confirmed wholesale orders',
      color: 'border-amber-500/40 text-amber-400 bg-amber-950/20',
      activeColor: 'ring-2 ring-amber-500 bg-amber-950/40',
      queue: 'acceptance' as const,
    },
    {
      id: 'picking',
      label: 'Picking Queue',
      count: m.currentlyPicking,
      description: 'In-progress item picking',
      color: 'border-blue-500/40 text-blue-400 bg-blue-950/20',
      activeColor: 'ring-2 ring-blue-500 bg-blue-950/40',
      queue: 'picking' as const,
    },
    {
      id: 'packing',
      label: 'Packing Queue',
      count: m.packed,
      description: 'Items packed in boxes',
      color: 'border-purple-500/40 text-purple-400 bg-purple-950/20',
      activeColor: 'ring-2 ring-purple-500 bg-purple-950/40',
      queue: 'packing' as const,
    },
    {
      id: 'dispatch',
      label: 'Ready for Dispatch',
      count: m.readyForDispatch,
      description: 'Staged at dispatch dock',
      color: 'border-emerald-500/40 text-emerald-400 bg-emerald-950/20',
      activeColor: 'ring-2 ring-emerald-500 bg-emerald-950/40',
      queue: 'dispatch' as const,
    },
    {
      id: 'total_pending',
      label: 'Total Pending',
      count: m.totalPendingWarehouseOrders,
      description: 'Active hub fulfillment',
      color: 'border-cyan-500/40 text-cyan-400 bg-cyan-950/20',
      activeColor: 'ring-2 ring-cyan-500 bg-cyan-950/40',
      queue: 'all' as const,
    },
    {
      id: 'low_stock',
      label: 'Low Stock Items',
      count: m.lowStockCount,
      description: 'Below threshold limit',
      color: 'border-orange-500/40 text-orange-400 bg-orange-950/20',
      activeColor: 'ring-2 ring-orange-500 bg-orange-950/40',
      queue: 'all' as const,
    },
    {
      id: 'out_of_stock',
      label: 'Out of Stock',
      count: m.outOfStockCount,
      description: 'Zero available units',
      color: 'border-rose-500/40 text-rose-400 bg-rose-950/20',
      activeColor: 'ring-2 ring-rose-500 bg-rose-950/40',
      queue: 'all' as const,
    },
  ];

  return (
    <div className="space-y-4 mb-6">
      {/* Hub Status Banner */}
      {hub && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-900/80 border border-slate-800 rounded-lg text-xs">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/70 border border-emerald-500/30 text-emerald-400 font-semibold tracking-wide uppercase text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {hub.status}
            </span>
            <div className="text-slate-300">
              <span className="font-semibold text-slate-100">{hub.warehouseName}</span>
              <span className="mx-2 text-slate-600">·</span>
              <span className="text-slate-400">{hub.branchName}</span>
              <span className="mx-2 text-slate-600">·</span>
              <span className="font-mono text-slate-400">{hub.warehouseId}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Hours: <strong className="text-slate-200">{hub.operatingHours}</strong></span>
            {m.avgProcessingTimeMinutes !== null && (
              <span>
                Avg Turnaround: <strong className="text-slate-200 font-mono tabular-nums">{m.avgProcessingTimeMinutes}m</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {/* 7-Card Operational Queue Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
        {statCards.map(card => {
          const isSelected = activeQueue === card.id;
          return (
            <button
              key={card.id}
              onClick={() => onSelectQueue(card.queue)}
              type="button"
              className={`p-3 text-left rounded-lg border transition-all duration-150 cursor-pointer ${
                card.color
              } ${isSelected ? card.activeColor : 'hover:border-slate-600 hover:bg-slate-900/90'}`}
            >
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider truncate">
                {card.label}
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums mt-1 text-slate-100">
                {card.count}
              </div>
              <div className="text-[11px] text-slate-400 truncate mt-0.5">
                {card.description}
              </div>
            </button>
          );
        })}
      </div>

      {/* Throughput and Aging Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Today's Fulfillment Throughput */}
        <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-lg">
          <div className="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-2 flex items-center justify-between">
            <span>Today's Warehouse Throughput</span>
            <span className="text-[11px] font-normal text-slate-400">Authoritative Event Timestamps</span>
          </div>
          <div className="grid grid-cols-5 gap-2 text-center text-xs">
            <div className="p-2 bg-slate-950/60 border border-slate-800/80 rounded">
              <div className="text-[10px] text-slate-400">Accepted</div>
              <div className="font-mono text-base font-bold text-amber-400 mt-0.5 tabular-nums">
                {m.todayThroughput.acceptedToday}
              </div>
            </div>
            <div className="p-2 bg-slate-950/60 border border-slate-800/80 rounded">
              <div className="text-[10px] text-slate-400">Picked</div>
              <div className="font-mono text-base font-bold text-blue-400 mt-0.5 tabular-nums">
                {m.todayThroughput.pickedToday}
              </div>
            </div>
            <div className="p-2 bg-slate-950/60 border border-slate-800/80 rounded">
              <div className="text-[10px] text-slate-400">Packed</div>
              <div className="font-mono text-base font-bold text-purple-400 mt-0.5 tabular-nums">
                {m.todayThroughput.packedToday}
              </div>
            </div>
            <div className="p-2 bg-slate-950/60 border border-slate-800/80 rounded">
              <div className="text-[10px] text-slate-400">Dispatch Ready</div>
              <div className="font-mono text-base font-bold text-emerald-400 mt-0.5 tabular-nums">
                {m.todayThroughput.readyForDispatchToday}
              </div>
            </div>
            <div className="p-2 bg-slate-950/60 border border-slate-800/80 rounded">
              <div className="text-[10px] text-slate-400">Delivered</div>
              <div className="font-mono text-base font-bold text-teal-400 mt-0.5 tabular-nums">
                {m.todayThroughput.deliveredToday}
              </div>
            </div>
          </div>
        </div>

        {/* Order Aging Distribution */}
        <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-lg">
          <div className="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-2 flex items-center justify-between">
            <span>Pending Orders Aging</span>
            {m.agingBreakdown.agingBeyondThreshold > 0 && (
              <span className="text-[11px] text-rose-400 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                {m.agingBreakdown.agingBeyondThreshold} over 6h SLA
              </span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-2 text-center text-xs">
            <div className="p-2 bg-slate-950/60 border border-slate-800/80 rounded">
              <div className="text-[10px] text-slate-400">&lt; 2h</div>
              <div className="font-mono text-base font-bold text-emerald-400 mt-0.5 tabular-nums">
                {m.agingBreakdown.aging_0_2h}
              </div>
            </div>
            <div className="p-2 bg-slate-950/60 border border-slate-800/80 rounded">
              <div className="text-[10px] text-slate-400">2h - 6h</div>
              <div className="font-mono text-base font-bold text-cyan-400 mt-0.5 tabular-nums">
                {m.agingBreakdown.aging_2_6h}
              </div>
            </div>
            <div className="p-2 bg-slate-950/60 border border-slate-800/80 rounded">
              <div className="text-[10px] text-slate-400">6h - 12h</div>
              <div className="font-mono text-base font-bold text-amber-400 mt-0.5 tabular-nums">
                {m.agingBreakdown.aging_6_12h}
              </div>
            </div>
            <div className="p-2 bg-slate-950/60 border border-slate-800/80 rounded">
              <div className="text-[10px] text-slate-400">12h - 24h</div>
              <div className="font-mono text-base font-bold text-orange-400 mt-0.5 tabular-nums">
                {m.agingBreakdown.aging_12_24h}
              </div>
            </div>
            <div className="p-2 bg-slate-950/60 border border-slate-800/80 rounded">
              <div className="text-[10px] text-slate-400">&gt; 24h</div>
              <div className="font-mono text-base font-bold text-rose-400 mt-0.5 tabular-nums">
                {m.agingBreakdown.aging_24h_plus}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
