import React, { useState, useEffect, useCallback } from 'react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminClient } from '../../services/adminClient';
import { InventoryItem, InventoryMovement } from '../../types/inventory';

interface AdminInventoryDetailScreenProps {
  productId: string;
  onBack: () => void;
}

export const AdminInventoryDetailScreen: React.FC<AdminInventoryDetailScreenProps> = ({
  productId,
  onBack,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<InventoryItem | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);

  // Adjustment Modal
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustType, setAdjustType] = useState<'ADD' | 'REMOVE'>('ADD');
  const [adjustQuantity, setAdjustQuantity] = useState<number>(1);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemRes, movRes] = await Promise.all([
        AdminClient.fetchInventoryItem(productId),
        AdminClient.fetchInventoryMovements(productId, 100),
      ]);

      if (itemRes.success && itemRes.product) {
        setProduct(itemRes.product);
      } else {
        setError(itemRes.message || 'Product not found.');
      }

      if (movRes.success && movRes.movements) {
        setMovements(movRes.movements);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load product inventory detail.');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExecuteAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;

    if (!Number.isInteger(adjustQuantity) || adjustQuantity < 1) {
      setAdjustError('Quantity must be a positive integer.');
      return;
    }

    if (!adjustReason || adjustReason.trim().length < 5) {
      setAdjustError('Reason must be at least 5 characters long.');
      return;
    }

    if (adjustType === 'REMOVE' && adjustQuantity > product.stockQuantity) {
      setAdjustError(`Cannot remove ${adjustQuantity} units. Current stock is ${product.stockQuantity}.`);
      return;
    }

    setAdjustSubmitting(true);
    setAdjustError(null);

    try {
      const idempotencyKey = `ADJ-${product.productId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const res = await AdminClient.adjustInventory({
        productId: product.productId,
        adjustmentType: adjustType,
        quantity: adjustQuantity,
        reason: adjustReason.trim(),
        notes: adjustNotes.trim(),
        idempotencyKey,
      });

      if (res.success) {
        setToastMessage(`Stock successfully adjusted! New stock: ${res.newStock} units.`);
        setAdjustModalOpen(false);
        loadData();
        setTimeout(() => setToastMessage(null), 4000);
      } else {
        setAdjustError(res.message || res.error || 'Failed to adjust stock.');
      }
    } catch (err: any) {
      setAdjustError(err.message || 'Network error occurred while adjusting stock.');
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const previewNewStock = product
    ? adjustType === 'ADD'
      ? product.stockQuantity + (Number(adjustQuantity) || 0)
      : product.stockQuantity - (Number(adjustQuantity) || 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header and Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
          >
            ← Back to Inventory
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {product ? product.productName : 'Product Inventory Ledger'}
            </h1>
            <p className="text-xs text-slate-500 font-mono">
              ID: {productId} {product?.sku ? `• SKU: ${product.sku}` : ''}
            </p>
          </div>
        </div>

        {product && (
          <button
            onClick={() => {
              setAdjustType('ADD');
              setAdjustQuantity(1);
              setAdjustReason('');
              setAdjustNotes('');
              setAdjustError(null);
              setAdjustModalOpen(true);
            }}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition-colors shadow-xs flex items-center justify-center gap-1.5"
          >
            <span>⚡</span> Manual Stock Adjust
          </button>
        )}
      </div>

      {/* Toast Banner */}
      {toastMessage && (
        <div className="bg-emerald-900/90 text-emerald-100 border border-emerald-500/50 p-4 rounded-xl flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <span className="text-xl">✅</span>
            <span className="font-semibold text-sm">{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-emerald-300 hover:text-white">✕</button>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium">Loading inventory details and movements...</p>
        </div>
      ) : error || !product ? (
        <div className="p-8 text-center text-rose-600 space-y-3 bg-white rounded-xl border border-rose-200">
          <p className="font-semibold text-sm">Failed to load product inventory</p>
          <p className="text-xs text-rose-500">{error || 'Product not found'}</p>
          <button
            onClick={onBack}
            className="px-4 py-1.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-200"
          >
            Return to Inventory List
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Key Product Metadata & Stock Status Card */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-4">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.productName}
                  className="w-16 h-16 object-contain rounded-xl border border-slate-200 p-1"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-2xl">
                  📦
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Brand / Category</div>
                <div className="text-sm font-bold text-slate-900 line-clamp-1">{product.brandName || '—'}</div>
                <div className="text-xs text-slate-500 line-clamp-1">{product.category || '—'}</div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Current Stock</div>
              <div className="text-2xl font-black font-mono text-slate-900 mt-1">
                {product.stockQuantity.toLocaleString()} <span className="text-xs font-normal text-slate-500">units</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1 font-mono">
                Threshold: {product.lowStockThreshold} units
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Stock Status</div>
              <div className="mt-2">
                {product.stockStatus === 'OUT_OF_STOCK' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    <span className="w-2 h-2 rounded-full bg-rose-600"></span>
                    OUT OF STOCK
                  </span>
                ) : product.stockStatus === 'LOW_STOCK' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse"></span>
                    LOW STOCK ALERT
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                    IN STOCK
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 mt-2">
                {product.isActive ? 'Active in wholesale catalogue' : 'Deactivated in catalogue'}
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Catalogue Pricing</div>
              <div className="text-base font-bold text-slate-900 mt-1">
                ₹{product.wholesalePrice.toFixed(2)}{' '}
                <span className="text-xs font-normal text-slate-500">wholesale</span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5 line-through">MRP: ₹{product.mrp.toFixed(2)}</div>
            </div>
          </div>

          {/* Stock Movement Ledger Table */}
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Authoritative Stock Ledger</h3>
                <p className="text-xs text-slate-500">
                  Immutable audit records of all order deductions, cancellations, and manual adjustments.
                </p>
              </div>
              <div className="text-xs font-mono font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-lg">
                {movements.length} total movements
              </div>
            </div>

            {movements.length === 0 ? (
              <div className="p-12 text-center text-slate-500 space-y-2">
                <span className="text-3xl">📜</span>
                <p className="text-sm font-semibold text-slate-800">No stock movements recorded yet</p>
                <p className="text-xs text-slate-400">
                  Any incoming orders or manual adjustments will create immutable ledger records.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Date / Time</th>
                      <th className="py-3 px-4">Event & Type</th>
                      <th className="py-3 px-4">Reason / Notes</th>
                      <th className="py-3 px-4 text-center">Change</th>
                      <th className="py-3 px-4 text-right">Previous → New</th>
                      <th className="py-3 px-4 text-right">Performed By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                    {movements.map(m => {
                      const isPositive = m.delta > 0;
                      return (
                        <tr key={m.movementId} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                            {m.createdAt ? new Date(m.createdAt).toLocaleString('en-IN') : '—'}
                          </td>

                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                                isPositive
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {m.movementType || (isPositive ? 'STOCK_IN' : 'STOCK_OUT')}
                            </span>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              {m.referenceType || 'MANUAL'}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-800">{m.reason}</div>
                            {m.notes && m.notes !== m.reason && (
                              <div className="text-[11px] text-slate-500 italic mt-0.5">{m.notes}</div>
                            )}
                          </td>

                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <span
                              className={`font-mono font-bold ${
                                isPositive ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {isPositive ? `+${m.delta}` : m.delta}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right whitespace-nowrap font-mono text-xs">
                            <span className="text-slate-400">{m.previousStock}</span>
                            <span className="text-slate-400 mx-1">→</span>
                            <span className="font-bold text-slate-900">{m.newStock}</span>
                          </td>

                          <td className="py-3 px-4 text-right whitespace-nowrap text-[11px]">
                            <div className="font-medium text-slate-800">{m.userName || m.performedBy}</div>
                            <div className="text-[10px] text-slate-400">{m.performedByRole}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Stock Adjustment Modal */}
      {adjustModalOpen && product && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Manual Stock Adjustment</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Updates inventory atomically and logs immutable ledger & audit entries.
                </p>
              </div>
              <button
                onClick={() => !adjustSubmitting && setAdjustModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
                disabled={adjustSubmitting}
              >
                ✕
              </button>
            </div>

            {/* Target Product Summary */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900">{product.productName}</div>
                <div className="text-slate-500 font-mono mt-0.5">SKU: {product.sku}</div>
              </div>
              <div className="text-right">
                <div className="text-slate-400">Current Stock</div>
                <div className="text-base font-bold font-mono text-slate-900">
                  {product.stockQuantity} units
                </div>
              </div>
            </div>

            {adjustError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                ⚠️ {adjustError}
              </div>
            )}

            <form onSubmit={handleExecuteAdjust} className="space-y-4">
              {/* Type Switcher */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Adjustment Action</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType('ADD')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                      adjustType === 'ADD'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span>➕</span> Stock In (ADD)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('REMOVE')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                      adjustType === 'REMOVE'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span>➖</span> Stock Out (REMOVE)
                  </button>
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Quantity (Units)</label>
                <input
                  type="number"
                  min="1"
                  max="1000000"
                  step="1"
                  required
                  value={adjustQuantity}
                  onChange={e => setAdjustQuantity(Math.floor(Number(e.target.value)))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                />
              </div>

              {/* Real-time Preview */}
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs flex items-center justify-between">
                <span className="text-amber-900 font-semibold">Projected New Stock:</span>
                <span
                  className={`font-mono font-bold text-sm ${
                    previewNewStock < 0 ? 'text-rose-600' : 'text-slate-900'
                  }`}
                >
                  {previewNewStock} units {previewNewStock < 0 && '(INVALID — NEGATIVE)'}
                </span>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Reason <span className="text-slate-400 font-normal">(Min 5 chars, required for audit)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Physical stock count reconciliation, supplier shipment received..."
                  required
                  minLength={5}
                  maxLength={500}
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Internal Notes <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional operational details or invoice references..."
                  value={adjustNotes}
                  onChange={e => setAdjustNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAdjustModalOpen(false)}
                  disabled={adjustSubmitting}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustSubmitting || previewNewStock < 0 || adjustReason.trim().length < 5}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {adjustSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                      <span>Adjusting...</span>
                    </>
                  ) : (
                    <span>Commit Adjustment</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
