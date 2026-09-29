import React from 'react';
import { useWarehouse } from '../../context/WarehouseContext';
import {
  AlertTriangle,
  AlertOctagon,
  Boxes,
  Plus,
  ArrowRight,
  TrendingDown,
  Building2,
} from 'lucide-react';
import { WarehouseStockAdjustModal } from './WarehouseStockAdjustModal';

export const WarehouseLowStockScreen: React.FC = () => {
  const {
    inventory,
    openStockAdjustModal,
    selectedProductForAdjust,
    warehouseId,
    warehouseName,
  } = useWarehouse();

  // Filter products where currentStock <= lowStockThreshold or stock is 0
  const lowStockItems = inventory
    .filter(item => item.currentStock <= (item.lowStockThreshold || 20))
    .sort((a, b) => {
      // Out of stock first, then lowest stock
      if (a.currentStock === 0 && b.currentStock !== 0) return -1;
      if (b.currentStock === 0 && a.currentStock !== 0) return 1;
      return a.currentStock - b.currentStock;
    });

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="bg-rose-950 text-rose-100 p-5 rounded-xl border border-rose-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-5 h-5 text-rose-400" />
            <h2 className="text-base font-bold text-white">Central Hub Low Stock Alerts</h2>
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-rose-900 text-rose-300 border border-rose-700">
              {warehouseId}
            </span>
          </div>
          <p className="text-xs text-rose-300">
            {lowStockItems.length} SKUs are currently below minimum safety thresholds in {warehouseName}. Inward
            replenishments to prevent stockouts across Brahmpuri & Karawal Nagar retailer orders.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-rose-900/60 p-3 rounded-lg border border-rose-800 self-end md:self-center">
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-rose-300 block">Critical SKUs</span>
            <span className="text-lg font-black text-white font-mono">
              {lowStockItems.filter(i => i.currentStock === 0).length} Out of Stock
            </span>
          </div>
        </div>
      </div>

      {/* Items List */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 text-stone-600 font-bold border-b border-stone-200 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Urgency</th>
                <th className="py-3 px-4">Product & SKU</th>
                <th className="py-3 px-4 text-center">Current Stock</th>
                <th className="py-3 px-4 text-center">Safety Threshold</th>
                <th className="py-3 px-4 text-center">Reserved in Orders</th>
                <th className="py-3 px-4">Suggested Operational Action</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-800">
              {lowStockItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-500">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                      ✓
                    </div>
                    All products in {warehouseId} are currently well above safety thresholds.
                  </td>
                </tr>
              ) : (
                lowStockItems.map(item => {
                  const isZero = item.currentStock === 0;
                  const ratio = item.lowStockThreshold > 0 ? item.currentStock / item.lowStockThreshold : 0;

                  return (
                    <tr key={item.productId} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-3 px-4">
                        {isZero ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black bg-rose-600 text-white px-2 py-0.5 rounded">
                            CRITICAL (0)
                          </span>
                        ) : ratio < 0.5 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-500 text-stone-950 px-2 py-0.5 rounded">
                            URGENT (&lt;50%)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                            WARNING
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {item.imageUrl && (
                            <img
                              src={item.imageUrl}
                              alt=""
                              className="w-10 h-10 object-contain rounded border border-stone-200 bg-white"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <div>
                            <p className="font-bold text-stone-900">{item.productName}</p>
                            <p className="text-[10px] text-stone-500 font-mono">
                              {item.sku} • {item.brandName} • {item.category}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center font-black text-rose-600 font-mono text-sm">
                        {item.currentStock} {item.unit}
                      </td>

                      <td className="py-3 px-4 text-center font-mono text-stone-600 font-bold">
                        {item.lowStockThreshold} {item.unit}
                      </td>

                      <td className="py-3 px-4 text-center font-mono text-amber-700 font-bold">
                        {item.reservedStock} {item.unit}
                      </td>

                      <td className="py-3 px-4 text-stone-600">
                        {isZero ? (
                          <span className="text-rose-700 font-semibold">
                            Immediate Inward PO from {item.brandName} Master Distributor
                          </span>
                        ) : (
                          <span className="text-stone-700">
                            Create Purchase Inward order (Min {item.caseQuantity * 5} units)
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => openStockAdjustModal(item)}
                          className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-amber-400 font-bold text-xs rounded-lg transition-all cursor-pointer inline-flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Inward Stock</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedProductForAdjust && <WarehouseStockAdjustModal />}
    </div>
  );
};
