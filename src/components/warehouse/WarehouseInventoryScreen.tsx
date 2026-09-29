import React from 'react';
import { useWarehouse } from '../../context/WarehouseContext';
import {
  Search,
  Plus,
  Boxes,
  AlertTriangle,
  History,
  Building2,
  RefreshCw,
  Edit,
} from 'lucide-react';
import { WarehouseStockAdjustModal } from './WarehouseStockAdjustModal';

export const WarehouseInventoryScreen: React.FC = () => {
  const {
    inventory,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    stockStatusFilter,
    setStockStatusFilter,
    selectedProductForAdjust,
    openStockAdjustModal,
    refreshInventory,
    setCurrentView,
    warehouseId,
    warehouseName,
    isLoading,
  } = useWarehouse();

  // Extract unique categories
  const categories = Array.from(new Set(inventory.map(i => i.category))).filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Top Header & Search Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-stone-900">Warehouse Inventory & Stock Ledger</h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold border border-amber-300">
                {warehouseId}
              </span>
            </div>
            <p className="text-xs text-stone-500">
              Live physical stock partition for {warehouseName} ({inventory.length} active SKUs)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openStockAdjustModal(inventory[0] || null)}
              className="flex items-center gap-1.5 text-xs bg-stone-900 hover:bg-stone-800 text-amber-400 font-bold px-3 py-2 rounded-lg transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Stock Adjustment / Inward</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentView('AUDIT_LOGS')}
              className="flex items-center gap-1.5 text-xs bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold px-3 py-2 rounded-lg border border-stone-300 transition-all cursor-pointer"
            >
              <History className="w-3.5 h-3.5" />
              <span>Stock Audit Trail</span>
            </button>
            <button
              type="button"
              onClick={refreshInventory}
              disabled={isLoading}
              className="p-2 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-lg border border-stone-300 transition-colors"
              title="Refresh Inventory"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-stone-100 text-xs">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-stone-400" />
            <input
              type="text"
              placeholder="Search product name, SKU, brand..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 text-stone-900"
            />
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5">
            <span className="text-stone-400 font-medium">Category:</span>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="bg-transparent text-stone-800 font-semibold focus:outline-none cursor-pointer w-full"
            >
              <option value="ALL">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Stock Status Filter */}
          <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5">
            <span className="text-stone-400 font-medium">Stock Status:</span>
            <select
              value={stockStatusFilter}
              onChange={e => setStockStatusFilter(e.target.value)}
              className="bg-transparent text-stone-800 font-semibold focus:outline-none cursor-pointer w-full"
            >
              <option value="ALL">All Stock Levels</option>
              <option value="IN STOCK">IN STOCK</option>
              <option value="LOW STOCK">LOW STOCK (&le; Threshold)</option>
              <option value="OUT OF STOCK">OUT OF STOCK (0 Units)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-xl border border-stone-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 text-stone-600 font-bold border-b border-stone-200 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Product & SKU</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-center">Physical Stock</th>
                <th className="py-3 px-4 text-center">Reserved</th>
                <th className="py-3 px-4 text-center">Available Stock</th>
                <th className="py-3 px-4 text-center">MOQ / Case</th>
                <th className="py-3 px-4">Wholesale Price</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-800">
              {inventory.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-stone-500">
                    No products found matching filters in {warehouseId}.
                  </td>
                </tr>
              ) : (
                inventory.map(item => (
                  <tr key={item.productId} className="hover:bg-stone-50/70 transition-colors">
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
                            {item.sku} • {item.brandName} • {item.packSize || item.unit}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-stone-600">{item.category}</td>

                    <td className="py-3 px-4 text-center font-black text-stone-900 text-sm font-mono">
                      {item.currentStock}
                    </td>

                    <td className="py-3 px-4 text-center font-bold text-amber-600 font-mono">
                      {item.reservedStock}
                    </td>

                    <td className="py-3 px-4 text-center font-black text-emerald-700 font-mono text-sm">
                      {item.availableStock}
                    </td>

                    <td className="py-3 px-4 text-center text-[11px] text-stone-600">
                      MOQ: {item.minimumOrderQuantity} / Case: {item.caseQuantity}
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-bold font-mono text-stone-900 block">
                        ₹{Number(item.sellingPrice).toFixed(2)}
                      </span>
                      <span className="text-[10px] text-stone-500">MRP: ₹{item.mrp} ({item.marginPercent}% margin)</span>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.stockStatus === 'OUT OF STOCK'
                            ? 'bg-rose-100 text-rose-800'
                            : item.stockStatus === 'LOW STOCK'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {item.stockStatus}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => openStockAdjustModal(item)}
                        className="px-2.5 py-1 rounded bg-stone-100 hover:bg-stone-900 hover:text-amber-400 text-stone-700 text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                        title="Adjust Stock & Record Audit"
                      >
                        <Edit className="w-3 h-3" />
                        <span>Adjust</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Adjustment Modal */}
      {selectedProductForAdjust && <WarehouseStockAdjustModal />}
    </div>
  );
};
