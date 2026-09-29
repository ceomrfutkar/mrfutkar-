import React, { useState, useEffect } from 'react';
import { useWarehouse } from '../../context/WarehouseContext';
import { StockAdjustmentReason, ALLOWED_ADJUSTMENT_REASONS, WarehouseInventoryItem } from '../../types/warehouse';
import { AlertCircle, Boxes, Check, X, ShieldAlert } from 'lucide-react';

export const WarehouseStockAdjustModal: React.FC = () => {
  const {
    selectedProductForAdjust,
    openStockAdjustModal,
    adjustStock,
    inventory,
    currentUser,
    warehouseId,
    warehouseName,
    isLoading,
  } = useWarehouse();

  const [selectedProductId, setSelectedProductId] = useState<string>(selectedProductForAdjust?.productId || '');
  const [reason, setReason] = useState<StockAdjustmentReason>('Physical count correction');
  const [direction, setDirection] = useState<'ADD' | 'SUBTRACT'>('ADD');
  const [quantityInput, setQuantityInput] = useState<string>('1');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (selectedProductForAdjust) {
      setSelectedProductId(selectedProductForAdjust.productId);
    } else if (!selectedProductId && inventory.length > 0) {
      setSelectedProductId(inventory[0].productId);
    }
  }, [selectedProductForAdjust, inventory, selectedProductId]);

  if (!selectedProductForAdjust && !selectedProductId) {
    return null;
  }

  const activeProduct = inventory.find(i => i.productId === selectedProductId) || selectedProductForAdjust;
  const currentStock = activeProduct?.currentStock || 0;

  const parsedQty = Math.abs(parseInt(quantityInput) || 0);
  const delta = direction === 'ADD' ? parsedQty : -parsedQty;
  const calculatedNewStock = currentStock + delta;
  const isNegative = calculatedNewStock < 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProduct) return;
    if (parsedQty <= 0) {
      alert('Please enter a valid whole number quantity greater than 0.');
      return;
    }
    if (isNegative) {
      alert(`Insufficient stock! Cannot reduce stock below 0 (current: ${currentStock}, adjustment: ${delta}).`);
      return;
    }
    if (!notes.trim()) {
      alert('Detailed operational notes are required for this audit record.');
      return;
    }

    await adjustStock({
      productId: activeProduct.productId,
      reason,
      adjustmentQuantity: delta,
      notes: notes.trim(),
    });
  };

  return (
    <div className="fixed inset-0 bg-stone-950/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-white rounded-xl max-w-lg w-full p-5 shadow-2xl border border-stone-200 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-900 flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">Controlled Stock Adjustment</h3>
              <p className="text-[11px] text-stone-500 font-mono">
                Hub: {warehouseId} • Immutable Audit Trail
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openStockAdjustModal(null)}
            className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Product Selector */}
          <div>
            <label className="block font-bold text-stone-700 mb-1">Select Product / SKU</label>
            <select
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
              className="w-full bg-stone-50 border border-stone-300 rounded-lg p-2 text-stone-900 focus:bg-white focus:outline-none"
            >
              {inventory.map(item => (
                <option key={item.productId} value={item.productId}>
                  {item.productName} ({item.sku}) — Stock: {item.currentStock} {item.unit}
                </option>
              ))}
            </select>
          </div>

          {/* Current vs New Stock Visualizer */}
          {activeProduct && (
            <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 flex items-center justify-around text-center">
              <div>
                <span className="text-[10px] text-stone-500 uppercase font-bold block">Current Stock</span>
                <span className="text-base font-black text-stone-900 font-mono">
                  {currentStock} {activeProduct.unit}
                </span>
              </div>
              <div className="text-stone-400 font-bold">→</div>
              <div>
                <span className="text-[10px] text-stone-500 uppercase font-bold block">Adjustment</span>
                <span className={`text-base font-black font-mono ${delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {delta >= 0 ? `+${delta}` : delta} {activeProduct.unit}
                </span>
              </div>
              <div className="text-stone-400 font-bold">→</div>
              <div>
                <span className="text-[10px] text-stone-500 uppercase font-bold block">New Physical Stock</span>
                <span
                  className={`text-base font-black font-mono ${
                    isNegative ? 'text-rose-600' : 'text-stone-900'
                  }`}
                >
                  {calculatedNewStock} {activeProduct.unit}
                </span>
              </div>
            </div>
          )}

          {isNegative && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-2.5 rounded-lg flex items-center gap-2 text-xs">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
              <span>Stock cannot be negative. Please adjust the deduction quantity.</span>
            </div>
          )}

          {/* Reason Selection */}
          <div>
            <label className="block font-bold text-stone-700 mb-1">Adjustment Reason (Audit Code)</label>
            <select
              value={reason}
              onChange={e => {
                const r = e.target.value as StockAdjustmentReason;
                setReason(r);
                if (['Damage', 'Expiry', 'Stock decrease'].includes(r)) {
                  setDirection('SUBTRACT');
                } else if (['Stock increase', 'Purchase inward', 'Return inward'].includes(r)) {
                  setDirection('ADD');
                }
              }}
              className="w-full bg-stone-50 border border-stone-300 rounded-lg p-2 text-stone-900 focus:bg-white"
            >
              {ALLOWED_ADJUSTMENT_REASONS.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Direction & Quantity */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold text-stone-700 mb-1">Action Direction</label>
              <div className="flex gap-1 bg-stone-100 p-1 rounded-lg border border-stone-200">
                <button
                  type="button"
                  onClick={() => setDirection('ADD')}
                  className={`flex-1 py-1 rounded font-bold transition-all cursor-pointer ${
                    direction === 'ADD' ? 'bg-emerald-600 text-white shadow-xs' : 'text-stone-600'
                  }`}
                >
                  + Add Stock
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('SUBTRACT')}
                  className={`flex-1 py-1 rounded font-bold transition-all cursor-pointer ${
                    direction === 'SUBTRACT' ? 'bg-rose-600 text-white shadow-xs' : 'text-stone-600'
                  }`}
                >
                  - Deduct
                </button>
              </div>
            </div>

            <div>
              <label className="block font-bold text-stone-700 mb-1">Quantity (Units)</label>
              <input
                type="number"
                min={1}
                step={1}
                value={quantityInput}
                onChange={e => setQuantityInput(e.target.value)}
                className="w-full bg-stone-50 border border-stone-300 rounded-lg p-2 text-xs font-bold text-stone-900 focus:bg-white"
                required
              />
            </div>
          </div>

          {/* Notes (Audit mandatory) */}
          <div>
            <label className="block font-bold text-stone-700 mb-1">
              Audit Notes & Reference Details (Required)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. PO #BR-9901 inwards from ITC supplier / Damaged box during bin movement..."
              rows={2}
              className="w-full bg-stone-50 border border-stone-300 rounded-lg p-2 text-xs focus:bg-white"
              required
            />
          </div>

          {/* Staff ID & Auth attribution */}
          <div className="bg-stone-50 p-2.5 rounded-lg border border-stone-200 text-[11px] text-stone-500 flex items-center justify-between">
            <span>
              Authorized by: <strong className="text-stone-800">{currentUser.name}</strong>
            </span>
            <span className="font-mono text-stone-400">UID: {currentUser.userId}</span>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => openStockAdjustModal(null)}
              className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isNegative || isLoading}
              className="px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-amber-400 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Adjustment & Log Audit Record</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
