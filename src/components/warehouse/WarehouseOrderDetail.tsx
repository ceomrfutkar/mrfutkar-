import React, { useState } from 'react';
import { useWarehouse } from '../../context/WarehouseContext';
import { WarehouseOrderStatus } from '../../types/warehouse';
import {
  ArrowLeft,
  Building2,
  Phone,
  MapPin,
  Clock,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  CheckSquare,
  Package,
  Truck,
  RotateCcw,
  XCircle,
  FileText,
  Lock,
} from 'lucide-react';

export const WarehouseOrderDetail: React.FC = () => {
  const {
    selectedOrder,
    selectOrder,
    setCurrentView,
    transitionOrderStatus,
    warehouseId,
    warehouseName,
    branchName,
    isLoading,
  } = useWarehouse();

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  if (!selectedOrder) {
    return (
      <div className="bg-white p-8 rounded-xl border border-stone-200 text-center space-y-3">
        <p className="text-stone-500 text-sm">No order selected.</p>
        <button
          type="button"
          onClick={() => setCurrentView('ORDERS')}
          className="text-xs font-bold text-amber-600 hover:underline"
        >
          Return to Orders List
        </button>
      </div>
    );
  }

  const order = selectedOrder;
  const isKarawal = (order.deliveryAddress?.fullAddress || '').toLowerCase().includes('karawal');

  const handleTransition = async (newStatus: WarehouseOrderStatus) => {
    if (newStatus === 'CANCELLED') {
      setCancelModalOpen(true);
      return;
    }
    await transitionOrderStatus(order.orderId, newStatus);
  };

  const handleConfirmCancel = async () => {
    if (!cancelReason.trim()) {
      alert('Please specify a reason for cancellation.');
      return;
    }
    await transitionOrderStatus(order.orderId, 'CANCELLED', cancelReason);
    setCancelModalOpen(false);
  };

  const pickingItems = order.picking?.items || {};
  const pickingFinished = order.picking?.status === 'COMPLETED';

  return (
    <div className="space-y-5">
      {/* Top Breadcrumb / Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => selectOrder(null, 'ORDERS')}
            className="p-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black font-mono text-stone-900">{order.orderId}</h2>
              <span className="text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                {order.orderStatus}
              </span>
            </div>
            <p className="text-[11px] text-stone-500">
              Placed on {order.createdAt ? new Date(order.createdAt).toLocaleString() : '—'}
            </p>
          </div>
        </div>

        {/* Locked Warehouse Hub Tag */}
        <div className="flex items-center gap-1.5 bg-stone-900 text-amber-400 px-3 py-1.5 rounded-lg text-xs font-mono font-bold">
          <Lock className="w-3.5 h-3.5 text-stone-400" />
          <span>{warehouseId} ({branchName})</span>
        </div>
      </div>

      {/* Main Grid: Retailer & Delivery vs Accounting Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Retailer Info */}
        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-stone-500 uppercase tracking-wider">
            <Building2 className="w-3.5 h-3.5 text-amber-600" />
            <span>Retailer Profile</span>
          </div>
          <p className="text-sm font-bold text-stone-900">{order.shopName || order.retailerName}</p>
          <p className="text-xs text-stone-600">Owner: {order.retailerName || 'Retail Partner'}</p>
          <div className="flex items-center gap-1 text-xs text-stone-700 pt-1">
            <Phone className="w-3 h-3 text-stone-400" />
            <span>{order.deliveryAddress?.phone || 'Mobile not provided'}</span>
          </div>
          <p className="text-[11px] text-stone-400 font-mono">Retailer UID: {order.retailerId}</p>
        </div>

        {/* Delivery Address & Territory */}
        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-stone-500 uppercase tracking-wider">
              <MapPin className="w-3.5 h-3.5 text-amber-600" />
              <span>Fulfilment Destination</span>
            </div>
            {isKarawal && (
              <span className="text-[10px] bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full font-bold">
                Karawal Nagar Area
              </span>
            )}
          </div>
          <p className="text-xs text-stone-800 font-medium leading-relaxed">
            {order.deliveryAddress?.fullAddress || 'Address on record'}
          </p>
          <p className="text-xs text-stone-600">
            {order.deliveryAddress?.city} - {order.deliveryAddress?.pincode}
          </p>
          <p className="text-[11px] text-emerald-700 font-semibold pt-0.5">
            ✓ Routed from {warehouseName}
          </p>
        </div>

        {/* Order Accounting Summary (Frozen snapshot) */}
        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-stone-500 uppercase tracking-wider">
            <CreditCard className="w-3.5 h-3.5 text-amber-600" />
            <span>Accounting & Payment</span>
          </div>
          <div className="space-y-1 text-xs text-stone-600">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="font-semibold text-stone-800">₹{(order.subtotal || 0).toLocaleString('en-IN')}</span>
            </div>
            {(order.discount || 0) > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Wholesale Discount:</span>
                <span>-₹{(order.discount || 0).toLocaleString('en-IN')}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Delivery Fee:</span>
              <span>{order.deliveryCharge === 0 ? 'FREE' : `₹${order.deliveryCharge}`}</span>
            </div>
            <div className="flex justify-between text-sm font-black text-stone-900 pt-1.5 border-t border-stone-100">
              <span>Grand Total:</span>
              <span className="text-amber-600">₹{(order.grandTotal || 0).toLocaleString('en-IN')}</span>
            </div>
          </div>
          <div className="pt-1 flex items-center justify-between text-[11px]">
            <span className="font-medium text-stone-500">Method: {order.paymentMethod}</span>
            <span
              className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                order.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {order.paymentStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Customer Instructions / Order Notes if any */}
      {order.orderNotes && (
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 flex items-start gap-2 text-xs text-amber-900">
          <FileText className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <strong className="font-bold">Retailer Order Instructions:</strong> {order.orderNotes}
          </div>
        </div>
      )}

      {/* Valid State Transition Controller */}
      <div className="bg-stone-900 text-white p-4 rounded-xl shadow-md border border-stone-800 space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Warehouse State Transition Engine
            </h3>
            <p className="text-[11px] text-stone-400">
              Current state: <strong className="text-white">{order.orderStatus}</strong>. Only allowed state transitions
              are permitted.
            </p>
          </div>
          <div className="text-xs text-stone-400 font-mono">
            Picking Status: <span className="text-white font-bold">{order.picking?.status || 'NOT_STARTED'}</span>
          </div>
        </div>

        {/* Transition Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {order.orderStatus === 'PLACED' && (
            <>
              <button
                type="button"
                onClick={() => handleTransition('CONFIRMED')}
                disabled={isLoading}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm Order</span>
              </button>
              <button
                type="button"
                onClick={() => handleTransition('CANCELLED')}
                disabled={isLoading}
                className="px-3 py-1.5 bg-stone-800 hover:bg-rose-900 text-rose-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Cancel Order</span>
              </button>
            </>
          )}

          {order.orderStatus === 'CONFIRMED' && (
            <>
              <button
                type="button"
                onClick={() => handleTransition('ACCEPTED')}
                disabled={isLoading}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Accept for Fulfillment</span>
              </button>
              <button
                type="button"
                onClick={() => handleTransition('CANCELLED')}
                disabled={isLoading}
                className="px-3 py-1.5 bg-stone-800 hover:bg-rose-900 text-rose-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Cancel Order</span>
              </button>
            </>
          )}

          {order.orderStatus === 'ACCEPTED' && (
            <>
              <button
                type="button"
                onClick={() => selectOrder(order.orderId, 'PICKING')}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Start Picking (Open Picking Bay)</span>
              </button>
              <button
                type="button"
                onClick={() => handleTransition('CANCELLED')}
                disabled={isLoading}
                className="px-3 py-1.5 bg-stone-800 hover:bg-rose-900 text-rose-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            </>
          )}

          {order.orderStatus === 'PICKING' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => selectOrder(order.orderId, 'PICKING')}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Continue Active Picking</span>
              </button>
              {pickingFinished ? (
                <button
                  type="button"
                  onClick={() => selectOrder(order.orderId, 'PACKING')}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>Proceed to Packing Bay</span>
                </button>
              ) : (
                <span className="text-[11px] text-amber-400 font-medium">
                  (Must finish picking all items before order can move to PACKED)
                </span>
              )}
            </div>
          )}

          {order.orderStatus === 'PACKED' && (
            <>
              <button
                type="button"
                onClick={() => handleTransition('READY_FOR_DISPATCH')}
                disabled={isLoading}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <Truck className="w-3.5 h-3.5" />
                <span>Move to Ready for Dispatch</span>
              </button>
              <button
                type="button"
                onClick={() => selectOrder(order.orderId, 'PACKING')}
                className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <Package className="w-3.5 h-3.5" />
                <span>Review Packing Details</span>
              </button>
            </>
          )}

          {order.orderStatus === 'READY_FOR_DISPATCH' && (
            <button
              type="button"
              onClick={() => handleTransition('DISPATCHED')}
              disabled={isLoading}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Mark Dispatched (Driver Loaded)</span>
            </button>
          )}

          {order.orderStatus === 'DISPATCHED' && (
            <>
              <button
                type="button"
                onClick={() => handleTransition('DELIVERED')}
                disabled={isLoading}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm Delivered to Retailer</span>
              </button>
              <button
                type="button"
                onClick={() => handleTransition('RETURN_REQUESTED')}
                disabled={isLoading}
                className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-amber-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Log Return Request</span>
              </button>
            </>
          )}

          {order.orderStatus === 'DELIVERED' && (
            <button
              type="button"
              onClick={() => handleTransition('RETURN_REQUESTED')}
              disabled={isLoading}
              className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-amber-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Log Return Request</span>
            </button>
          )}

          {['CANCELLED', 'RETURNED'].includes(order.orderStatus) && (
            <span className="text-xs text-stone-400 italic">
              Order is in terminal status ({order.orderStatus}). No further state changes allowed.
            </span>
          )}
        </div>
      </div>

      {/* Authoritative Line Items Table */}
      <div className="bg-white rounded-xl border border-stone-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-stone-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-stone-900">Authoritative Order Items Snapshot</h3>
            <p className="text-[11px] text-stone-500">
              Prices frozen at order creation time • Never recalculated from catalogue
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-stone-600">{(order.items || []).length} SKUs</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 text-stone-600 font-bold border-b border-stone-200 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-2.5 px-4">Product & SKU</th>
                <th className="py-2.5 px-4">Pack Size</th>
                <th className="py-2.5 px-4 text-center">Ordered Qty</th>
                <th className="py-2.5 px-4 text-center">Physical Stock</th>
                <th className="py-2.5 px-4">Unit Price</th>
                <th className="py-2.5 px-4">MRP & Margin</th>
                <th className="py-2.5 px-4 text-right">Line Total</th>
                <th className="py-2.5 px-4 text-center">Picking Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-800">
              {(order.items || []).map((item: any) => {
                const pickState = pickingItems[item.productId];
                const isPicked = pickState?.pickedQty >= item.quantity;
                const isShort = pickState?.isShort;

                return (
                  <tr key={item.productId} className="hover:bg-stone-50/70">
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
                            {item.sku || 'SKU'} • {item.brandName || 'Brand'}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-stone-600">
                      {item.packSize || item.unit || '1 unit'}
                    </td>

                    <td className="py-3 px-4 text-center font-black text-stone-900">
                      {item.quantity} {item.unit || 'units'}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span
                        className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                          (item.availableStock || 0) >= item.quantity
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {item.availableStock !== undefined ? item.availableStock : 'Check'}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono font-bold text-stone-900">
                      ₹{Number(item.unitPrice || 0).toFixed(2)}
                    </td>

                    <td className="py-3 px-4">
                      <span className="text-stone-500 text-[11px] block">MRP: ₹{item.mrp || '—'}</span>
                      {item.marginPercent !== undefined && (
                        <span className="text-[10px] text-emerald-700 font-bold">{item.marginPercent}% margin</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right font-black font-mono text-stone-900">
                      ₹{(item.subtotal || item.unitPrice * item.quantity).toLocaleString('en-IN')}
                    </td>

                    <td className="py-3 px-4 text-center">
                      {isPicked ? (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                          ✓ Picked ({pickState.pickedQty})
                        </span>
                      ) : isShort ? (
                        <span className="text-[10px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded font-bold">
                          ⚠ Short ({pickState.pickedQty || 0}/{item.quantity})
                        </span>
                      ) : (
                        <span className="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded">Pending</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cancellation Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 bg-stone-950/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-xl border border-stone-200 space-y-4">
            <div className="flex items-center gap-2 text-rose-600 font-bold text-sm">
              <AlertCircle className="w-5 h-5" />
              <span>Confirm Order Cancellation</span>
            </div>
            <p className="text-xs text-stone-600">
              Cancelling this order will release all reserved inventory items back into the live{' '}
              <strong>WH-BRAHMPURI-01</strong> stock pool automatically and create an audit log.
            </p>
            <div>
              <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                Cancellation Reason (Required)
              </label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="e.g. Retailer requested cancellation / Store closed / Duplication..."
                className="w-full text-xs p-2.5 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500"
                rows={3}
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                className="px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 font-semibold cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={isLoading}
                className="px-3 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition-all cursor-pointer"
              >
                Confirm Cancellation & Restore Stock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
