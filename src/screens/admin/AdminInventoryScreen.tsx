import React, { useState, useEffect, useCallback } from 'react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminStatCard } from '../../components/admin/AdminStatCard';
import { AdminClient } from '../../services/adminClient';
import { InventoryItem, InventorySummary, StockStatus } from '../../types/inventory';

interface AdminInventoryScreenProps {
  onSelectProduct: (productId: string) => void;
}

export const AdminInventoryScreen: React.FC<AdminInventoryScreenProps> = ({ onSelectProduct }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<InventorySummary>({
    totalProducts: 0,
    inStockCount: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    totalStockUnits: 0,
  });

  // Query state
  const [search, setSearch] = useState('');
  const [stockStatus, setStockStatus] = useState<string>('ALL');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Quick Adjustment Modal State
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [selectedProductForAdjust, setSelectedProductForAdjust] = useState<InventoryItem | null>(null);
  const [adjustType, setAdjustType] = useState<'ADD' | 'REMOVE'>('ADD');
  const [adjustQuantity, setAdjustQuantity] = useState<number>(1);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await AdminClient.fetchInventory({
        page,
        pageSize,
        search,
        stockStatus: stockStatus === 'ALL' ? undefined : stockStatus,
        brand: brand || undefined,
        category: category || undefined,
      });

      if (res.success && res.products) {
        setProducts(res.products);
        setTotalCount(res.totalCount || 0);
        setTotalPages(res.totalPages || 1);
        if (res.summary) {
          setSummary(res.summary);
        }
      } else {
        setError(res.message || 'Failed to load inventory.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred loading inventory.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, stockStatus, brand, category]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const handleOpenAdjust = (p: InventoryItem) => {
    setSelectedProductForAdjust(p);
    setAdjustType('ADD');
    setAdjustQuantity(1);
    setAdjustReason('');
    setAdjustNotes('');
    setAdjustError(null);
    setAdjustModalOpen(true);
  };

  const handleExecuteAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForAdjust) return;

    if (!Number.isInteger(adjustQuantity) || adjustQuantity < 1) {
      setAdjustError('Quantity must be a positive integer (minimum 1).');
      return;
    }

    if (!adjustReason || adjustReason.trim().length < 5) {
      setAdjustError('Reason must be at least 5 characters long.');
      return;
    }

    if (adjustType === 'REMOVE' && adjustQuantity > selectedProductForAdjust.stockQuantity) {
      setAdjustError(`Cannot remove ${adjustQuantity} units. Current available stock is only ${selectedProductForAdjust.stockQuantity}.`);
      return;
    }

    setAdjustSubmitting(true);
    setAdjustError(null);

    try {
      const idempotencyKey = `ADJ-${selectedProductForAdjust.productId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const res = await AdminClient.adjustInventory({
        productId: selectedProductForAdjust.productId,
        adjustmentType: adjustType,
        quantity: adjustQuantity,
        reason: adjustReason.trim(),
        notes: adjustNotes.trim(),
        idempotencyKey,
      });

      if (res.success) {
        setToastMessage(`Stock successfully updated! New stock: ${res.newStock} units.`);
        setAdjustModalOpen(false);
        fetchInventory();
        setTimeout(() => setToastMessage(null), 4000);
      } else {
        setAdjustError(res.message || res.error || 'Failed to execute stock adjustment.');
      }
    } catch (err: any) {
      setAdjustError(err.message || 'Network error occurred while adjusting stock.');
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const previewNewStock = selectedProductForAdjust
    ? adjustType === 'ADD'
      ? selectedProductForAdjust.stockQuantity + (Number(adjustQuantity) || 0)
      : selectedProductForAdjust.stockQuantity - (Number(adjustQuantity) || 0)
    : 0;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Inventory Management"
        subtitle="Authoritative real-time stock control, low-stock monitoring, and audit-logged manual adjustments."
      />

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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
        <AdminStatCard
          label="Total Products"
          value={summary.totalProducts.toLocaleString()}
          icon="📦"
          subLabel="In wholesale catalogue"
        />
        <AdminStatCard
          label="In Stock"
          value={summary.inStockCount.toLocaleString()}
          icon="🟢"
          subLabel="Sufficient quantity"
        />
        <AdminStatCard
          label="Low Stock"
          value={summary.lowStockCount.toLocaleString()}
          icon="⚠️"
          subLabel="At or below threshold"
          trend={summary.lowStockCount > 0 ? { value: String(summary.lowStockCount), isPositive: false } : undefined}
        />
        <AdminStatCard
          label="Out of Stock"
          value={summary.outOfStockCount.toLocaleString()}
          icon="🔴"
          subLabel="0 units available"
          trend={summary.outOfStockCount > 0 ? { value: String(summary.outOfStockCount), isPositive: false } : undefined}
        />
        <AdminStatCard
          label="Total Stock Units"
          value={summary.totalStockUnits.toLocaleString()}
          icon="🏬"
          subLabel="Available Brahmpuri Hub"
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200 space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search by Product Name, SKU, Barcode, or Brand..."
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
            <span className="absolute left-3 top-2.5 text-slate-400">🔍</span>
          </div>

          {/* Stock Status Filter Buttons */}
          <div className="flex bg-slate-100 p-1 rounded-lg text-xs font-semibold">
            {['ALL', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'].map(status => (
              <button
                key={status}
                onClick={() => {
                  setStockStatus(status);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  stockStatus === status
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {status.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Secondary filters & Page Size */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-slate-500 font-medium">Quick Filters:</span>
            <input
              type="text"
              placeholder="Filter Brand..."
              value={brand}
              onChange={e => {
                setBrand(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1 border border-slate-200 rounded-md text-xs outline-none focus:border-amber-500"
            />
            <input
              type="text"
              placeholder="Filter Category..."
              value={category}
              onChange={e => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1 border border-slate-200 rounded-md text-xs outline-none focus:border-amber-500"
            />
            {(search || stockStatus !== 'ALL' || brand || category) && (
              <button
                onClick={() => {
                  setSearch('');
                  setStockStatus('ALL');
                  setBrand('');
                  setCategory('');
                  setPage(1);
                }}
                className="text-amber-600 hover:text-amber-700 font-semibold"
              >
                Clear Filters
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500">Show:</span>
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="border border-slate-200 rounded-md px-2 py-1 text-xs outline-none bg-white font-medium"
            >
              <option value="15">15</option>
              <option value="25">25 (Default)</option>
              <option value="50">50</option>
              <option value="100">100 (Max)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium">Loading authoritative inventory...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600 space-y-2">
            <p className="font-semibold text-sm">Failed to load inventory</p>
            <p className="text-xs text-rose-500">{error}</p>
            <button
              onClick={fetchInventory}
              className="mt-2 px-4 py-1.5 bg-rose-50 text-rose-700 text-xs font-semibold rounded-lg hover:bg-rose-100"
            >
              Retry
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <span className="text-3xl">📭</span>
            <p className="text-sm font-semibold text-slate-800">No inventory records found</p>
            <p className="text-xs text-slate-400">Try adjusting your search terms or filter criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Product Details</th>
                  <th className="py-3 px-4">SKU / Barcode</th>
                  <th className="py-3 px-4">Category & Brand</th>
                  <th className="py-3 px-4 text-center">Stock Status</th>
                  <th className="py-3 px-4 text-right">Available Stock</th>
                  <th className="py-3 px-4 text-right">Threshold</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {products.map(p => {
                  const isOutOfStock = p.stockStatus === 'OUT_OF_STOCK';
                  const isLowStock = p.stockStatus === 'LOW_STOCK';

                  return (
                    <tr key={p.productId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt={p.productName}
                              className="w-10 h-10 object-contain rounded-lg border border-slate-200 bg-white p-0.5 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 font-bold shrink-0">
                              📦
                            </div>
                          )}
                          <div className="min-w-0">
                            <button
                              onClick={() => onSelectProduct(p.productId)}
                              className="font-bold text-slate-900 hover:text-amber-600 transition-colors text-left line-clamp-1 cursor-pointer"
                            >
                              {p.productName}
                            </button>
                            <div className="text-[11px] text-slate-400">
                              {p.unit} {p.packSize ? `• ${p.packSize}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono text-slate-800 font-semibold">{p.sku}</div>
                        {p.barcode && <div className="text-[11px] text-slate-400 font-mono">{p.barcode}</div>}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-800">{p.brandName || '—'}</div>
                        <div className="text-[11px] text-slate-500">{p.category || '—'}</div>
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {isOutOfStock ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                            OUT OF STOCK
                          </span>
                        ) : isLowStock ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse"></span>
                            LOW STOCK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                            IN STOCK
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span
                          className={`font-mono text-sm font-bold ${
                            isOutOfStock
                              ? 'text-rose-600'
                              : isLowStock
                              ? 'text-amber-600'
                              : 'text-slate-900'
                          }`}
                        >
                          {p.stockQuantity.toLocaleString()}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-slate-400 whitespace-nowrap">
                        {p.lowStockThreshold}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenAdjust(p)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors shadow-xs"
                          >
                            Adjust
                          </button>
                          <button
                            onClick={() => onSelectProduct(p.productId)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                          >
                            Ledger
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!loading && products.length > 0 && (
          <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div>
              Showing <span className="font-semibold">{Math.min(totalCount, (page - 1) * pageSize + 1)}</span> to{' '}
              <span className="font-semibold">{Math.min(totalCount, page * pageSize)}</span> of{' '}
              <span className="font-semibold">{totalCount}</span> products
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 border border-slate-300 rounded-md font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <div className="px-3 py-1.5 font-bold text-slate-800">
                Page {page} of {totalPages}
              </div>
              <button
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 border border-slate-300 rounded-md font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual Stock Adjustment Modal */}
      {adjustModalOpen && selectedProductForAdjust && (
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
                <div className="font-bold text-slate-900">{selectedProductForAdjust.productName}</div>
                <div className="text-slate-500 font-mono mt-0.5">SKU: {selectedProductForAdjust.sku}</div>
              </div>
              <div className="text-right">
                <div className="text-slate-400">Current Stock</div>
                <div className="text-base font-bold font-mono text-slate-900">
                  {selectedProductForAdjust.stockQuantity} units
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
