import React from 'react';
import { AdminWarehouseOrder } from '../../../types/adminWarehouse';

interface AdminWarehouseOrderDetailModalProps {
  order: AdminWarehouseOrder | null;
  isOpen: boolean;
  onClose: () => void;
  isLoading?: boolean;
}

export const AdminWarehouseOrderDetailModal: React.FC<AdminWarehouseOrderDetailModalProps> = ({
  order,
  isOpen,
  onClose,
  isLoading,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-slate-100 font-mono">
              {order?.orderId || 'Order Details'}
            </span>
            {order && (
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded bg-slate-800 text-slate-300 font-mono">
                {order.orderStatus}
              </span>
            )}
            {order?.isAgingAlert && (
              <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-rose-950/80 border border-rose-500/30 text-rose-400">
                Aging: {order.orderAgeFormatted}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800/80 transition-colors"
            type="button"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-300">
          {isLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-20 bg-slate-800/40 rounded-lg" />
              <div className="h-40 bg-slate-800/40 rounded-lg" />
              <div className="h-32 bg-slate-800/40 rounded-lg" />
            </div>
          ) : !order ? (
            <div className="text-center py-12 text-slate-500">No order data available.</div>
          ) : (
            <>
              {/* Order Info & Retailer Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-950/50 border border-slate-800/80 rounded-lg">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Retailer & Store</div>
                  <div className="text-sm font-semibold text-slate-100 mt-1">{order.retailerName}</div>
                  <div className="text-slate-400 mt-0.5">{order.shopName || 'Retail Kirana'}</div>
                  <div className="font-mono text-slate-400 mt-0.5">{order.retailerMobile || 'N/A'}</div>
                </div>

                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Warehouse Authority</div>
                  <div className="text-sm font-semibold text-slate-100 mt-1">{order.warehouseName}</div>
                  <div className="font-mono text-slate-400 mt-0.5">{order.warehouseId}</div>
                  <div className="text-slate-400 mt-0.5">Created: {new Date(order.createdAt).toLocaleString()}</div>
                </div>

                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Payment & Delivery</div>
                  <div className="text-sm font-semibold text-slate-100 mt-1">
                    {order.paymentMethod} · <span className="font-mono text-emerald-400">{order.paymentStatus}</span>
                  </div>
                  <div className="text-slate-400 mt-0.5">
                    {order.deliveryAddress?.addressLine1 || order.deliveryAddress?.city || 'Delhi NCR'}
                  </div>
                  <div className="font-mono text-slate-400 mt-0.5">
                    {order.deliveryAddress?.city} - {order.deliveryAddress?.pincode}
                  </div>
                </div>
              </div>

              {/* Warehouse Operations Pipeline Breakdown */}
              <div className="border border-slate-800 rounded-lg overflow-hidden">
                <div className="bg-slate-950/60 px-4 py-2.5 border-b border-slate-800 text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                  Warehouse Fulfillment Pipeline
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Picking State */}
                  <div className="p-3 bg-slate-950/40 border border-slate-800/60 rounded">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-slate-200">1. Picking Stage</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        order.picking?.status === 'COMPLETED'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                          : order.picking?.status === 'IN_PROGRESS'
                          ? 'bg-blue-950 text-blue-400 border border-blue-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {order.picking?.status || 'PENDING'}
                      </span>
                    </div>
                    <div className="text-slate-400 space-y-1">
                      <div>Picker: <strong className="text-slate-300">{order.picking?.pickedBy || 'Staff'}</strong></div>
                      {order.picking?.completedAt && (
                        <div>Completed: <span className="font-mono">{new Date(order.picking.completedAt).toLocaleTimeString()}</span></div>
                      )}
                    </div>
                  </div>

                  {/* Packing State */}
                  <div className="p-3 bg-slate-950/40 border border-slate-800/60 rounded">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-slate-200">2. Packing Stage</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        order.packing?.status === 'PACKED'
                          ? 'bg-purple-950 text-purple-400 border border-purple-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {order.packing?.status || 'PENDING'}
                      </span>
                    </div>
                    <div className="text-slate-400 space-y-1">
                      <div>Packer: <strong className="text-slate-300">{order.packing?.packedBy || 'Staff'}</strong></div>
                      <div>Packages: <strong className="text-slate-300 font-mono">{order.packing?.numberOfPackages || 1}</strong></div>
                      {order.packing?.boxType && <div>Box: <span className="text-slate-300">{order.packing.boxType}</span></div>}
                    </div>
                  </div>

                  {/* Dispatch Readiness */}
                  <div className="p-3 bg-slate-950/40 border border-slate-800/60 rounded">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-slate-200">3. Dispatch Dock</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        ['READY_FOR_DISPATCH', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(order.orderStatus)
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {['READY_FOR_DISPATCH', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(order.orderStatus)
                          ? 'READY'
                          : 'IN_PREP'}
                      </span>
                    </div>
                    <div className="text-slate-400 space-y-1">
                      <div>Partner: <strong className="text-slate-300">{order.delivery?.assignedPartnerName || order.dispatch?.assignedPartnerName || 'Unassigned'}</strong></div>
                      {order.dispatch?.vehicleNumber && <div>Vehicle: <span className="font-mono text-slate-300">{order.dispatch.vehicleNumber}</span></div>}
                      {order.delivery?.assignedPartnerMobile && <div>Mobile: <span className="font-mono text-slate-300">{order.delivery.assignedPartnerMobile}</span></div>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Items Table (Authoritative Historical Snapshot) */}
              <div className="border border-slate-800 rounded-lg overflow-hidden">
                <div className="bg-slate-950/60 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Order Items ({order.items.length})
                  </span>
                  <span className="text-[11px] text-slate-500">Historical Frozen Pricing Snapshot</span>
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-2.5">SKU / Item</th>
                      <th className="px-4 py-2.5 text-right">Qty</th>
                      <th className="px-4 py-2.5 text-right">Wholesale Price</th>
                      <th className="px-4 py-2.5 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {order.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-slate-200">{item.productName}</div>
                          <div className="font-mono text-[10px] text-slate-500">{item.sku}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-medium text-slate-200 tabular-nums">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-300 tabular-nums">
                          ₹{Number(item.unitPrice).toFixed(2)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-100 tabular-nums">
                          ₹{Number(item.totalPrice ?? item.subtotal ?? (item.quantity * item.unitPrice)).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals Summary */}
                <div className="bg-slate-950/50 p-4 border-t border-slate-800 space-y-1.5 text-right">
                  <div className="flex justify-end gap-6 text-slate-400">
                    <span>Subtotal:</span>
                    <span className="font-mono tabular-nums text-slate-200 w-24">₹{order.subtotal.toFixed(2)}</span>
                  </div>
                  {order.discountTotal && order.discountTotal > 0 ? (
                    <div className="flex justify-end gap-6 text-emerald-400">
                      <span>Discount:</span>
                      <span className="font-mono tabular-nums w-24">-₹{order.discountTotal.toFixed(2)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-end gap-6 text-slate-400">
                    <span>Delivery Fee:</span>
                    <span className="font-mono tabular-nums text-slate-200 w-24">₹{order.deliveryFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-end gap-6 text-slate-400">
                    <span>Taxes:</span>
                    <span className="font-mono tabular-nums text-slate-200 w-24">₹{order.taxTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-end gap-6 text-slate-100 font-bold text-sm pt-2 border-t border-slate-800">
                    <span>Grand Total:</span>
                    <span className="font-mono tabular-nums text-amber-400 w-24">₹{order.grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Status Transition History (Authoritative Audit Trail) */}
              {order.statusHistory && order.statusHistory.length > 0 && (
                <div className="border border-slate-800 rounded-lg overflow-hidden">
                  <div className="bg-slate-950/60 px-4 py-2.5 border-b border-slate-800 text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Authoritative Status Event Log
                  </div>
                  <div className="p-4 space-y-2">
                    {order.statusHistory.map((h, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-slate-950/40 rounded border border-slate-800/60">
                        <div className="flex items-center gap-3">
                          <span className="w-2 h-2 rounded-full bg-cyan-400" />
                          <span className="font-mono font-semibold text-slate-200">{h.status}</span>
                          {h.notes && <span className="text-slate-400 text-[11px]">({h.notes})</span>}
                        </div>
                        <div className="flex items-center gap-4 text-slate-500 font-mono text-[11px]">
                          <span>{h.updatedBy || 'Staff'}</span>
                          <span>{new Date(h.timestamp).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between text-xs text-slate-400">
          <div>
            MR FUTKAR Central Wholesale Hub — <span className="font-mono">WH-BRAHMPURI-01</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg transition-colors"
            type="button"
          >
            Close View
          </button>
        </div>
      </div>
    </div>
  );
};
