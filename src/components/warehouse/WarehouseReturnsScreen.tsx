import React, { useState } from 'react';
import { useWarehouse } from '../../context/WarehouseContext';
import { ReturnStatus, InspectionStatus } from '../../types/warehouse';
import {
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  Building2,
  Package,
  Boxes,
  FileCheck,
  X,
} from 'lucide-react';

export const WarehouseReturnsScreen: React.FC = () => {
  const {
    returns,
    createReturn,
    updateReturn,
    orders,
    inventory,
    warehouseId,
    warehouseName,
    isLoading,
  } = useWarehouse();

  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [selectedReturnForInspect, setSelectedReturnForInspect] = useState<any | null>(null);

  // New return form state
  const [orderId, setOrderId] = useState<string>('');
  const [productId, setProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState<string>('Damaged during transit');

  // Inspection modal state
  const [inspectStatus, setInspectStatus] = useState<InspectionStatus>('PASSED');
  const [returnStatus, setReturnStatus] = useState<ReturnStatus>('ACCEPTED');
  const [restockItem, setRestockItem] = useState<boolean>(true);
  const [inspectionNotes, setInspectionNotes] = useState<string>('');

  const handleCreateReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId || !productId || quantity <= 0) {
      alert('Please fill all return request fields.');
      return;
    }

    const ord = orders.find(o => o.orderId === orderId);
    const prod = inventory.find(p => p.productId === productId);

    await createReturn({
      orderId,
      retailerId: ord?.retailerId || 'ret-01',
      retailerName: ord?.retailerName || 'Retailer Partner',
      shopName: ord?.shopName || 'Kirana Store',
      retailerMobile: ord?.deliveryAddress?.phone || '',
      productId,
      productName: prod?.productName || 'Product',
      sku: prod?.sku || `SKU-${productId}`,
      quantity,
      reason,
    });

    setCreateModalOpen(false);
    setOrderId('');
    setProductId('');
  };

  const handleInspectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReturnForInspect) return;

    await updateReturn(selectedReturnForInspect.returnId, {
      returnStatus,
      inspectionStatus: inspectStatus,
      inspectionNotes,
      restockItem: returnStatus === 'ACCEPTED' ? restockItem : false,
    });

    setSelectedReturnForInspect(null);
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-stone-900">Warehouse Returns & Inspection Bay</h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold border border-amber-300">
              {warehouseId}
            </span>
          </div>
          <p className="text-xs text-stone-500">
            Reverse logistics, quality inspection and authorized restocking for {warehouseName}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreateModalOpen(true)}
          className="flex items-center gap-1.5 text-xs bg-stone-900 hover:bg-stone-800 text-amber-400 font-bold px-3 py-2 rounded-lg transition-all shadow-xs cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Log Retailer Return Request</span>
        </button>
      </div>

      {/* Returns List */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 text-stone-600 font-bold border-b border-stone-200 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Return ID & Date</th>
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">Retailer</th>
                <th className="py-3 px-4">Product & Quantity</th>
                <th className="py-3 px-4">Return Reason</th>
                <th className="py-3 px-4 text-center">Inspection</th>
                <th className="py-3 px-4 text-center">Return Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-800">
              {returns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-stone-500">
                    No active return requests logged for {warehouseId}.
                  </td>
                </tr>
              ) : (
                returns.map(ret => (
                  <tr key={ret.returnId} className="hover:bg-stone-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-mono font-bold text-stone-900 block">{ret.returnId}</span>
                      <span className="text-[10px] text-stone-400">
                        {ret.createdAt ? new Date(ret.createdAt).toLocaleDateString() : '—'}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono font-semibold text-stone-800">{ret.orderId}</td>

                    <td className="py-3 px-4">
                      <span className="font-bold text-stone-900 block">{ret.shopName || ret.retailerName}</span>
                      <span className="text-[11px] text-stone-500">{ret.retailerMobile || '—'}</span>
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-bold text-stone-900 block">{ret.productName}</span>
                      <span className="text-[11px] text-stone-500 font-mono">
                        {ret.sku} • <strong className="text-stone-800">{ret.quantity} units</strong>
                      </span>
                    </td>

                    <td className="py-3 px-4 text-stone-600 max-w-[180px] truncate">{ret.reason}</td>

                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          ret.inspectionStatus === 'PASSED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : ret.inspectionStatus === 'DAMAGED'
                            ? 'bg-rose-100 text-rose-800'
                            : ret.inspectionStatus === 'FAILED'
                            ? 'bg-stone-200 text-stone-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {ret.inspectionStatus}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          ret.returnStatus === 'ACCEPTED' || ret.returnStatus === 'REFUNDED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : ret.returnStatus === 'REJECTED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {ret.returnStatus}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      {['REQUESTED', 'APPROVED', 'RECEIVED'].includes(ret.returnStatus) ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedReturnForInspect(ret);
                            setInspectStatus(ret.inspectionStatus || 'PASSED');
                            setReturnStatus('ACCEPTED');
                            setRestockItem(true);
                          }}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded text-xs transition-colors cursor-pointer"
                        >
                          Inspect & Restock
                        </button>
                      ) : (
                        <span className="text-[11px] text-stone-400">Completed</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Return Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-stone-950/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-2xl border border-stone-200 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <h3 className="text-sm font-bold text-stone-900">Log Retailer Return Request</h3>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="p-1 text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateReturnSubmit} className="space-y-3">
              <div>
                <label className="block font-bold text-stone-700 mb-1">Select Order ID</label>
                <select
                  value={orderId}
                  onChange={e => setOrderId(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 rounded-lg p-2 font-mono"
                  required
                >
                  <option value="">-- Choose Order --</option>
                  {orders.slice(0, 30).map(o => (
                    <option key={o.orderId} value={o.orderId}>
                      {o.orderId} ({o.shopName || o.retailerName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Select Product / SKU</label>
                <select
                  value={productId}
                  onChange={e => setProductId(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-300 rounded-lg p-2"
                  required
                >
                  <option value="">-- Choose Product --</option>
                  {inventory.map(p => (
                    <option key={p.productId} value={p.productId}>
                      {p.productName} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-stone-50 border border-stone-300 rounded-lg p-2 font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">Reason</label>
                  <select
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-300 rounded-lg p-2"
                  >
                    <option value="Damaged during transit">Damaged during transit</option>
                    <option value="Expired / Near Expiry">Expired / Near Expiry</option>
                    <option value="Wrong SKU delivered">Wrong SKU delivered</option>
                    <option value="Retailer refused package">Retailer refused package</option>
                    <option value="Quality defect">Quality defect</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-3 py-1.5 text-stone-600 hover:text-stone-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 bg-stone-900 text-amber-400 font-bold rounded-lg cursor-pointer"
                >
                  Create Return Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Return Modal */}
      {selectedReturnForInspect && (
        <div className="fixed inset-0 bg-stone-950/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-2xl border border-stone-200 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <div>
                <h3 className="text-sm font-bold text-stone-900">Quality Inspection & Restock Decision</h3>
                <p className="text-[11px] text-stone-500 font-mono">
                  {selectedReturnForInspect.returnId} • {selectedReturnForInspect.productName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReturnForInspect(null)}
                className="p-1 text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleInspectSubmit} className="space-y-3">
              <div>
                <label className="block font-bold text-stone-700 mb-1">Physical Inspection Result</label>
                <select
                  value={inspectStatus}
                  onChange={e => setInspectStatus(e.target.value as InspectionStatus)}
                  className="w-full bg-stone-50 border border-stone-300 rounded-lg p-2 font-semibold"
                >
                  <option value="PASSED">PASSED (Packaging intact, good condition)</option>
                  <option value="DAMAGED">DAMAGED (Seal broken, crushed)</option>
                  <option value="FAILED">FAILED (Non-returnable item)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Return Disposition Status</label>
                <select
                  value={returnStatus}
                  onChange={e => setReturnStatus(e.target.value as ReturnStatus)}
                  className="w-full bg-stone-50 border border-stone-300 rounded-lg p-2 font-semibold"
                >
                  <option value="ACCEPTED">ACCEPTED (Accept return from retailer)</option>
                  <option value="REJECTED">REJECTED (Reject return request)</option>
                  <option value="REFUNDED">REFUNDED (Issue credit note to retailer)</option>
                </select>
              </div>

              {returnStatus === 'ACCEPTED' && inspectStatus === 'PASSED' && (
                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg">
                  <label className="flex items-center gap-2 font-bold text-emerald-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={restockItem}
                      onChange={e => setRestockItem(e.target.checked)}
                      className="rounded text-emerald-600 w-4 h-4"
                    />
                    <span>Restock {selectedReturnForInspect.quantity} unit(s) into WH-BRAHMPURI-01 live inventory</span>
                  </label>
                  <p className="text-[11px] text-emerald-700 mt-1 pl-6">
                    Automatically writes an immutable "Return inward" stock movement log.
                  </p>
                </div>
              )}

              <div>
                <label className="block font-bold text-stone-700 mb-1">Inspection Notes</label>
                <textarea
                  value={inspectionNotes}
                  onChange={e => setInspectionNotes(e.target.value)}
                  placeholder="e.g. Verified batch number matches original shipment; outer seal intact..."
                  rows={2}
                  className="w-full bg-stone-50 border border-stone-300 rounded-lg p-2"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setSelectedReturnForInspect(null)}
                  className="px-3 py-1.5 text-stone-600 hover:text-stone-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 bg-stone-900 text-amber-400 font-bold rounded-lg cursor-pointer"
                >
                  Confirm Inspection & Process
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
