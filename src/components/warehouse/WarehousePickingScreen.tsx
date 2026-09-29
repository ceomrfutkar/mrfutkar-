import React, { useState, useEffect } from 'react';
import { useWarehouse } from '../../context/WarehouseContext';
import {
  CheckSquare,
  ArrowLeft,
  Package,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Minus,
  Save,
  Building2,
  ArrowRight,
} from 'lucide-react';

export const WarehousePickingScreen: React.FC = () => {
  const {
    selectedOrder,
    selectOrder,
    orders,
    savePickingProgress,
    setCurrentView,
    warehouseId,
    warehouseName,
    isLoading,
  } = useWarehouse();

  // If no order selected or user jumped directly to Picking tab, pick first active order or allow selection
  const pickableOrders = orders.filter(o => ['ACCEPTED', 'PICKING'].includes(o.orderStatus));

  const [activeOrderId, setActiveOrderId] = useState<string>(selectedOrder?.orderId || '');
  const [pickState, setPickState] = useState<Record<string, { pickedQty: number; isShort: boolean; notes: string }>>({});

  const currentOrder = orders.find(o => o.orderId === activeOrderId) || selectedOrder;

  useEffect(() => {
    if (!activeOrderId && pickableOrders.length > 0) {
      setActiveOrderId(pickableOrders[0].orderId);
    }
  }, [activeOrderId, pickableOrders]);

  useEffect(() => {
    if (currentOrder) {
      const existing = currentOrder.picking?.items || {};
      const initial: Record<string, { pickedQty: number; isShort: boolean; notes: string }> = {};

      (currentOrder.items || []).forEach((item: any) => {
        if (existing[item.productId]) {
          initial[item.productId] = {
            pickedQty: existing[item.productId].pickedQty || 0,
            isShort: Boolean(existing[item.productId].isShort),
            notes: existing[item.productId].notes || '',
          };
        } else {
          initial[item.productId] = {
            pickedQty: 0,
            isShort: false,
            notes: '',
          };
        }
      });
      setPickState(initial);
    }
  }, [currentOrder]);

  if (!currentOrder) {
    return (
      <div className="bg-white p-8 rounded-xl border border-stone-200 text-center space-y-4">
        <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
          <CheckSquare className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-stone-900">No Active Picking Orders</h3>
        <p className="text-xs text-stone-500 max-w-md mx-auto">
          There are currently no orders in ACCEPTED or PICKING status in {warehouseId}. Accept new incoming orders to
          begin picking.
        </p>
        <button
          type="button"
          onClick={() => setCurrentView('ORDERS')}
          className="px-4 py-2 bg-stone-900 text-white rounded-lg text-xs font-bold hover:bg-stone-800 transition-all cursor-pointer"
        >
          Go to Incoming Orders
        </button>
      </div>
    );
  }

  const items = currentOrder.items || [];
  const totalItemsCount = items.length;

  // Calculate items fulfilled
  let fulfilledCount = 0;
  items.forEach((item: any) => {
    const s = pickState[item.productId];
    if (s && (s.pickedQty >= item.quantity || s.isShort)) {
      fulfilledCount++;
    }
  });

  const percentComplete = totalItemsCount > 0 ? Math.round((fulfilledCount / totalItemsCount) * 100) : 0;
  const isAllSatisfied = fulfilledCount === totalItemsCount;

  const handleSetPickedQty = (productId: string, qty: number, maxQty: number) => {
    const validQty = Math.max(0, Math.min(qty, maxQty));
    setPickState(prev => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || { notes: '' }),
        pickedQty: validQty,
        isShort: validQty < maxQty && prev[productId]?.isShort,
      },
    }));
  };

  const handlePickAll = (productId: string, maxQty: number) => {
    setPickState(prev => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || { notes: '' }),
        pickedQty: maxQty,
        isShort: false,
      },
    }));
  };

  const handleToggleShort = (productId: string, maxQty: number) => {
    setPickState(prev => {
      const cur = prev[productId] || { pickedQty: 0, isShort: false, notes: '' };
      return {
        ...prev,
        [productId]: {
          ...cur,
          isShort: !cur.isShort,
        },
      };
    });
  };

  const handleSaveOnly = async () => {
    await savePickingProgress(currentOrder.orderId, pickState, false);
  };

  const handleCompletePicking = async () => {
    if (!isAllSatisfied) {
      alert('All items must either have full picked quantity or be marked short before picking completion.');
      return;
    }
    const success = await savePickingProgress(currentOrder.orderId, pickState, true);
    if (success) {
      selectOrder(currentOrder.orderId, 'PACKING');
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => selectOrder(currentOrder.orderId, 'ORDER_DETAIL')}
            className="p-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-stone-900">Warehouse Picking System</h2>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold">
                {currentOrder.orderId}
              </span>
            </div>
            <p className="text-xs text-stone-500">
              Retailer: <strong className="text-stone-800">{currentOrder.shopName || currentOrder.retailerName}</strong> •{' '}
              {currentOrder.deliveryAddress?.city || 'Brahmpuri'}
            </p>
          </div>
        </div>

        {/* Multi-Order Pick Selector if multiple orders are in queue */}
        {pickableOrders.length > 1 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-stone-500">Switch Order:</span>
            <select
              value={activeOrderId}
              onChange={e => {
                setActiveOrderId(e.target.value);
                selectOrder(e.target.value, 'PICKING');
              }}
              className="bg-stone-100 border border-stone-300 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-stone-800"
            >
              {pickableOrders.map(o => (
                <option key={o.orderId} value={o.orderId}>
                  {o.orderId} - {o.shopName || o.retailerName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Picking Real-Time Progress Bar */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-stone-800">Picking Progress:</span>
            <span className="font-black text-indigo-600">
              {fulfilledCount} of {totalItemsCount} line items verified
            </span>
          </div>
          <span className="font-bold text-stone-600 font-mono">{percentComplete}% Complete</span>
        </div>
        <div className="w-full bg-stone-100 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isAllSatisfied ? 'bg-emerald-500' : 'bg-indigo-600'
            }`}
            style={{ width: `${percentComplete}%` }}
          />
        </div>
      </div>

      {/* Picking Items Cards / List */}
      <div className="space-y-2.5">
        {items.map((item: any, idx: number) => {
          const state = pickState[item.productId] || { pickedQty: 0, isShort: false, notes: '' };
          const isComplete = state.pickedQty >= item.quantity;
          const isShort = state.isShort;

          return (
            <div
              key={item.productId}
              className={`bg-white p-4 rounded-xl border transition-all ${
                isComplete
                  ? 'border-emerald-300 bg-emerald-50/20 shadow-xs'
                  : isShort
                  ? 'border-rose-300 bg-rose-50/20 shadow-xs'
                  : 'border-stone-200 shadow-xs'
              }`}
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                {/* Product Detail */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-stone-100 text-stone-700 flex items-center justify-center font-bold text-xs shrink-0">
                    {idx + 1}
                  </div>
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="w-12 h-12 object-contain rounded border border-stone-200 bg-white shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-xs sm:text-sm text-stone-900 truncate">{item.productName}</p>
                    <p className="text-[11px] text-stone-500 font-mono">
                      SKU: <strong className="text-stone-700">{item.sku || 'SKU'}</strong> • Brand:{' '}
                      {item.brandName || 'Brand'} • Pack: {item.packSize || item.unit || '1 unit'}
                    </p>
                    <p className="text-[11px] text-stone-600 mt-0.5">
                      Target Shelf Location: <strong className="text-amber-800">Aisle 3 / Bay 12</strong>
                    </p>
                  </div>
                </div>

                {/* Target Qty & Pick Stepper */}
                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-stone-100">
                  <div className="text-right">
                    <span className="text-[10px] text-stone-500 uppercase font-bold block">Required</span>
                    <span className="text-sm font-black text-stone-900">{item.quantity} units</span>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-1 border border-stone-200">
                    <button
                      type="button"
                      onClick={() => handleSetPickedQty(item.productId, state.pickedQty - 1, item.quantity)}
                      className="w-7 h-7 rounded bg-white hover:bg-stone-200 text-stone-800 flex items-center justify-center font-bold text-xs transition-colors cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={item.quantity}
                      value={state.pickedQty}
                      onChange={e => handleSetPickedQty(item.productId, parseInt(e.target.value) || 0, item.quantity)}
                      className="w-12 text-center text-xs font-black bg-white py-1 rounded border border-stone-200 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleSetPickedQty(item.productId, state.pickedQty + 1, item.quantity)}
                      className="w-7 h-7 rounded bg-white hover:bg-stone-200 text-stone-800 flex items-center justify-center font-bold text-xs transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Quick Pick All */}
                  <button
                    type="button"
                    onClick={() => handlePickAll(item.productId, item.quantity)}
                    className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-200 transition-colors cursor-pointer"
                  >
                    Pick All
                  </button>

                  {/* Mark Short Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggleShort(item.productId, item.quantity)}
                    className={`px-2.5 py-1.5 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                      isShort
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-stone-50 hover:bg-stone-100 text-stone-600 border-stone-200'
                    }`}
                  >
                    {isShort ? 'Marked Short' : 'Mark Short'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Picking Save and Complete Bar */}
      <div className="sticky bottom-4 bg-stone-900 text-white p-4 rounded-xl shadow-lg border border-stone-800 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <CheckCircle2 className={`w-4 h-4 ${isAllSatisfied ? 'text-emerald-400' : 'text-stone-500'}`} />
          <span>
            {isAllSatisfied
              ? 'All items successfully verified! Ready to seal and transfer to packing bay.'
              : `Pending: ${totalItemsCount - fulfilledCount} line item(s) need pick verification or short-stock tag.`}
          </span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={handleSaveOnly}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold rounded-lg transition-all cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Progress</span>
          </button>

          <button
            type="button"
            onClick={handleCompletePicking}
            disabled={!isAllSatisfied || isLoading}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition-all cursor-pointer shadow-md"
          >
            <span>Complete Picking & Go to Packing</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
