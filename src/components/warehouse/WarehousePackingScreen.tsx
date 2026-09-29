import React, { useState } from 'react';
import { useWarehouse } from '../../context/WarehouseContext';
import {
  Package,
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  Truck,
  Box,
  AlertTriangle,
  FileCheck,
} from 'lucide-react';

export const WarehousePackingScreen: React.FC = () => {
  const {
    selectedOrder,
    selectOrder,
    savePackingInfo,
    setCurrentView,
    warehouseId,
    warehouseName,
    isLoading,
  } = useWarehouse();

  const [packageCount, setPackageCount] = useState<number>(1);
  const [boxType, setBoxType] = useState<string>('Standard 5-Ply Corrugated Wholesale Carton');
  const [packingNotes, setPackingNotes] = useState<string>('');

  // Quality Checklist states
  const [checkInvoice, setCheckInvoice] = useState<boolean>(true);
  const [checkQuantities, setCheckQuantities] = useState<boolean>(true);
  const [checkTamperSeal, setCheckTamperSeal] = useState<boolean>(true);

  if (!selectedOrder) {
    return (
      <div className="bg-white p-8 rounded-xl border border-stone-200 text-center space-y-4">
        <Package className="w-10 h-10 text-stone-400 mx-auto" />
        <p className="text-stone-600 text-sm">Please select an order to begin packing inspection.</p>
        <button
          type="button"
          onClick={() => setCurrentView('ORDERS')}
          className="px-4 py-2 bg-stone-900 text-white rounded-lg text-xs font-bold hover:bg-stone-800 transition-all cursor-pointer"
        >
          View Orders
        </button>
      </div>
    );
  }

  const order = selectedOrder;
  const isPickingComplete = order.picking?.status === 'COMPLETED';

  const handleSavePacking = async (moveToReady = false) => {
    if (!checkTamperSeal || !checkQuantities || !checkInvoice) {
      alert('Please complete all 3 verification checklist points before sealing packages.');
      return;
    }

    const success = await savePackingInfo(order.orderId, {
      numberOfPackages: packageCount,
      boxType,
      packingNotes,
      moveToReady,
    });

    if (success) {
      if (moveToReady) {
        setCurrentView('DISPATCH');
      } else {
        selectOrder(order.orderId, 'ORDER_DETAIL');
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => selectOrder(order.orderId, 'ORDER_DETAIL')}
            className="p-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-stone-900">Warehouse Packing Bay</h2>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-bold">
                {order.orderId}
              </span>
            </div>
            <p className="text-xs text-stone-500">
              Retailer: <strong className="text-stone-800">{order.shopName || order.retailerName}</strong> •{' '}
              {order.deliveryAddress?.city || 'Brahmpuri'}
            </p>
          </div>
        </div>

        <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-stone-100 text-stone-700">
          Hub: {warehouseId}
        </span>
      </div>

      {/* Picking Completion Guard */}
      {!isPickingComplete && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong className="font-bold text-sm block">Picking Incomplete</strong>
            This order has not completed the picking verification run yet. Items must be verified on the picking screen
            first.
            <div className="mt-2">
              <button
                type="button"
                onClick={() => selectOrder(order.orderId, 'PICKING')}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-colors cursor-pointer"
              >
                Go to Picking Screen →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Packing Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Package specs & Quality checklist */}
        <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
            <Box className="w-4 h-4 text-purple-600" />
            <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">Package Specifications</h3>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Number of Cartons / Bundles</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={50}
                value={packageCount}
                onChange={e => setPackageCount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-24 text-center font-bold text-sm bg-stone-50 border border-stone-300 rounded-lg p-2 focus:bg-white focus:ring-1 focus:ring-purple-500"
              />
              <span className="text-xs text-stone-500">Box(es) for this wholesale consignment</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Packaging Box Type</label>
            <select
              value={boxType}
              onChange={e => setBoxType(e.target.value)}
              className="w-full bg-stone-50 border border-stone-300 rounded-lg p-2 text-xs font-medium text-stone-800 focus:bg-white"
            >
              <option value="Standard 5-Ply Corrugated Wholesale Carton">
                Standard 5-Ply Corrugated Wholesale Carton
              </option>
              <option value="Heavy Duty Multi-SKU Master Crate">Heavy Duty Multi-SKU Master Crate</option>
              <option value="Tamper-Evident Wholesale Security Polybag">
                Tamper-Evident Wholesale Security Polybag
              </option>
              <option value="Perishable / Fragile Insulated Crate">Perishable / Fragile Insulated Crate</option>
            </select>
          </div>

          {/* Quality Checklist */}
          <div className="space-y-2 pt-2 border-t border-stone-100">
            <label className="block text-xs font-bold text-stone-700">Packing Quality Checklist (Mandatory)</label>
            <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
              <input
                type="checkbox"
                checked={checkQuantities}
                onChange={e => setCheckQuantities(e.target.checked)}
                className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
              />
              <span>All picked item quantities double-checked against wholesale manifest</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
              <input
                type="checkbox"
                checked={checkInvoice}
                onChange={e => setCheckInvoice(e.target.checked)}
                className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
              />
              <span>Printed delivery challan / tax invoice placed inside top pouch</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
              <input
                type="checkbox"
                checked={checkTamperSeal}
                onChange={e => setCheckTamperSeal(e.target.checked)}
                className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
              />
              <span>MR FUTKAR branded tamper-evident security tape applied on all carton seams</span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Packing Notes / Dispatch Tags</label>
            <textarea
              value={packingNotes}
              onChange={e => setPackingNotes(e.target.value)}
              placeholder="e.g. Fragile glass bottles secured in bubble wrap; box #1 of 2 contains FMCG packets..."
              rows={2}
              className="w-full text-xs p-2 bg-stone-50 border border-stone-300 rounded-lg focus:bg-white"
            />
          </div>
        </div>

        {/* Right: Picked Items Verification Table */}
        <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                Consignment Contents Summary
              </h3>
            </div>
            <span className="text-xs font-bold text-stone-500">{(order.items || []).length} SKUs</span>
          </div>

          <div className="divide-y divide-stone-100 max-h-[350px] overflow-y-auto pr-1 text-xs">
            {(order.items || []).map((item: any) => {
              const pickInfo = order.picking?.items?.[item.productId];
              const pickedQty = pickInfo?.pickedQty !== undefined ? pickInfo.pickedQty : item.quantity;
              const isShort = pickInfo?.isShort;

              return (
                <div key={item.productId} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-stone-900 truncate">{item.productName}</p>
                    <p className="text-[10px] text-stone-500 font-mono">
                      {item.sku} • {item.packSize || item.unit}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-stone-900 block">{pickedQty} units</span>
                    {isShort ? (
                      <span className="text-[9px] text-rose-600 font-bold bg-rose-50 px-1.5 py-0.2 rounded">
                        SHORT ({pickedQty}/{item.quantity})
                      </span>
                    ) : (
                      <span className="text-[9px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.2 rounded">
                        ✓ Verified
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-stone-100 text-xs text-stone-600 flex justify-between">
            <span className="font-medium">Total Consignment Value:</span>
            <span className="font-black text-stone-900 font-mono">
              ₹{(order.grandTotal || 0).toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      {/* Action Footer Bar */}
      <div className="bg-stone-900 text-white p-4 rounded-xl shadow-md border border-stone-800 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-stone-300">
          Ready to generate dispatch barcode label and mark as sealed packages.
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSavePacking(false)}
            disabled={!isPickingComplete || isLoading}
            className="px-3 py-2 bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-200 text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            Mark PACKED Only
          </button>

          <button
            type="button"
            onClick={() => handleSavePacking(true)}
            disabled={!isPickingComplete || isLoading}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-md"
          >
            <Truck className="w-4 h-4" />
            <span>Certify & Move to READY_FOR_DISPATCH</span>
          </button>
        </div>
      </div>
    </div>
  );
};
