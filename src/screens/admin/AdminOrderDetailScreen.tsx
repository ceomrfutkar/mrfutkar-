import React, { useState, useEffect, useCallback } from 'react';
import { AdminClient } from '../../services/adminClient';
import {
  ArrowLeft,
  Package,
  Truck,
  Building2,
  CheckCircle2,
  Clock,
  Boxes,
  Send,
  XCircle,
  Store,
  Phone,
  MapPin,
  Calendar,
  AlertTriangle,
  Printer,
  ChevronRight,
  ShieldCheck,
  UserCheck,
  Receipt,
  FileText,
} from 'lucide-react';

interface AdminOrderDetailScreenProps {
  orderId: string;
  onBack: () => void;
  onNavigateToWarehouse?: () => void;
  onNavigateToDelivery?: () => void;
}

const LIFECYCLE_STEPS = [
  { key: 'PLACED', label: '1. Order Placed', role: 'Retailer', icon: Clock, desc: 'Received from Kirana Store' },
  { key: 'CONFIRMED', label: '2. Confirmed', role: 'Admin Console', icon: CheckCircle2, desc: 'Inventory allocated & validated' },
  { key: 'ACCEPTED', label: '3. Hub Accepted', role: 'Central Warehouse', icon: Building2, desc: 'Scheduled at WH-BRAHMPURI-01' },
  { key: 'PICKING', label: '4. Picking', role: 'Warehouse Picker', icon: Boxes, desc: 'Shelves picked & scanned' },
  { key: 'PACKED', label: '5. Packed', role: 'Packing Station', icon: Package, desc: 'Carton sealed & labeled' },
  { key: 'READY_FOR_DISPATCH', label: '6. Ready Dispatch', role: 'Loading Dock', icon: Send, desc: 'Staged for delivery fleet' },
  { key: 'OUT_FOR_DELIVERY', label: '7. Out for Delivery', role: 'Delivery Partner', icon: Truck, desc: 'En route to retailer store' },
  { key: 'DELIVERED', label: '8. Delivered', role: 'Handover Complete', icon: ShieldCheck, desc: 'OTP & POD verified' },
];

export const AdminOrderDetailScreen: React.FC<AdminOrderDetailScreenProps> = ({
  orderId,
  onBack,
}) => {
  const [order, setOrder] = useState<any | null>(null);
  const [partners, setPartners] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modal / inputs
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [orderRes, partnerRes] = await Promise.all([
        AdminClient.fetchOrderDetail(orderId),
        AdminClient.fetchDeliveryPartners(),
      ]);

      if (orderRes.success && orderRes.order) {
        setOrder(orderRes.order);
        if (orderRes.order.deliveryPartnerId) {
          setSelectedPartnerId(orderRes.order.deliveryPartnerId);
        }
      } else {
        setError(orderRes.message || 'Failed to fetch order details.');
      }

      if (partnerRes.success && partnerRes.partners) {
        setPartners(partnerRes.partners);
        if (!orderRes.order?.deliveryPartnerId && partnerRes.partners.length > 0) {
          setSelectedPartnerId(partnerRes.partners[0].partnerId);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching order.');
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAdvanceStatus = async (targetStatus: string) => {
    setIsActionLoading(true);
    setError(null);
    setActionSuccess(null);
    try {
      const res = await AdminClient.updateOrderStatus(orderId, targetStatus, `Admin Console advanced to ${targetStatus}`);
      if (res.success) {
        setActionSuccess(`Order status successfully updated to ${targetStatus}.`);
        await loadData();
      } else {
        setError(res.message || 'Failed to update order status.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error updating status.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleAssignPartner = async () => {
    if (!selectedPartnerId) return;
    const partner = partners.find(p => p.partnerId === selectedPartnerId);
    setIsActionLoading(true);
    setError(null);
    setActionSuccess(null);
    try {
      const res = await AdminClient.assignDeliveryPartner(orderId, {
        partnerId: selectedPartnerId,
        partnerName: partner?.name || selectedPartnerId,
        vehicleNumber: partner?.vehicleNumber,
        vehicleType: partner?.vehicleType,
      });

      if (res.success) {
        setActionSuccess(`Delivery Partner assigned: ${partner?.name || selectedPartnerId}`);
        await loadData();
      } else {
        setError(res.message || 'Failed to assign delivery partner.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error assigning partner.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelReason || cancelReason.trim().length < 5) {
      setError('Please provide a valid cancellation reason of at least 5 characters.');
      return;
    }

    setIsActionLoading(true);
    setError(null);
    setActionSuccess(null);
    try {
      const res = await AdminClient.updateOrderStatus(orderId, 'CANCELLED', cancelReason.trim());
      if (res.success) {
        setActionSuccess('Order has been cancelled and inventory restored atomically.');
        setShowCancelModal(false);
        setCancelReason('');
        await loadData();
      } else {
        setError(res.message || 'Failed to cancel order.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error cancelling order.');
    } finally {
      setIsActionLoading(false);
    }
  };

  if (isLoading && !order) {
    return (
      <div className="py-20 text-center text-slate-500">
        <Package className="w-8 h-8 animate-spin mx-auto mb-2 text-[#f5b024]" />
        Loading order details...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-8 bg-white rounded-xl border border-slate-200 text-center space-y-4">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
        <h3 className="text-base font-bold text-slate-900">Order Not Found</h3>
        <p className="text-xs text-slate-500">Order ID '{orderId}' does not exist or has been removed.</p>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors"
        >
          Return to Orders List
        </button>
      </div>
    );
  }

  const currentStatus = (order.orderStatus || 'PLACED').toUpperCase();
  const isCancelled = currentStatus === 'CANCELLED';

  const currentStepIndex = LIFECYCLE_STEPS.findIndex(s => s.key === currentStatus);
  const activeStepIdx = currentStepIndex >= 0 ? currentStepIndex : 0;

  // Next logical status to advance to
  let nextStatus: string | null = null;
  if (currentStatus === 'PLACED') nextStatus = 'CONFIRMED';
  else if (currentStatus === 'CONFIRMED') nextStatus = 'ACCEPTED';
  else if (currentStatus === 'ACCEPTED') nextStatus = 'PICKING';
  else if (currentStatus === 'PICKING') nextStatus = 'PACKED';
  else if (currentStatus === 'PACKED') nextStatus = 'READY_FOR_DISPATCH';
  else if (currentStatus === 'READY_FOR_DISPATCH') nextStatus = 'OUT_FOR_DELIVERY';
  else if (currentStatus === 'OUT_FOR_DELIVERY') nextStatus = 'DELIVERED';

  const address = order.deliveryAddressSnapshot || order.deliveryAddress || {};
  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <div className="space-y-6 pb-16">
      {/* Top Navigation Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 sm:px-6 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
            title="Back to Orders List"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-extrabold text-slate-900">{order.orderId}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  isCancelled
                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                    : currentStatus === 'DELIVERED'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-[#f5b024]/20 text-slate-900 border-[#f5b024]/40'
                }`}
              >
                {currentStatus}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Placed on {new Date(order.createdAt).toLocaleString('en-IN')} by {order.shopName} ({order.retailerName})
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Challan / Invoice</span>
          </button>

          {!isCancelled && currentStatus !== 'DELIVERED' && (
            <button
              type="button"
              onClick={() => setShowCancelModal(true)}
              className="px-3 py-2 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cancel Order</span>
            </button>
          )}
        </div>
      </div>

      {/* Action Messages */}
      {actionSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* End-to-End Operational Lifecycle Stepper */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>Operational Fulfillment Pipeline</span>
              <span className="text-[11px] font-normal text-slate-500">
                (Retailer → Admin → Warehouse → Picking → Packing → Dispatch → Fleet → Delivered)
              </span>
            </h3>
          </div>
          {nextStatus && !isCancelled && (
            <button
              type="button"
              disabled={isActionLoading}
              onClick={() => handleAdvanceStatus(nextStatus!)}
              className="px-3.5 py-1.5 bg-[#0d1d25] hover:bg-slate-800 text-[#f5b024] rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <span>Advance to {nextStatus}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Stepper Steps Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          {LIFECYCLE_STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isCompleted = !isCancelled && idx < activeStepIdx;
            const isCurrent = !isCancelled && idx === activeStepIdx;
            const isPending = !isCancelled && idx > activeStepIdx;

            return (
              <div
                key={step.key}
                className={`p-3 rounded-xl border text-center transition-all flex flex-col justify-between ${
                  isCurrent
                    ? 'bg-amber-50/80 border-[#f5b024] ring-2 ring-[#f5b024]/40 shadow-xs'
                    : isCompleted
                    ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                    : isCancelled
                    ? 'bg-slate-50 border-slate-200 opacity-50'
                    : 'bg-slate-50 border-slate-200 opacity-70'
                }`}
              >
                <div>
                  <div className="flex items-center justify-center mb-1.5">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        isCurrent
                          ? 'bg-[#f5b024] text-slate-950 shadow-xs'
                          : isCompleted
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <div className="text-[11px] font-bold text-slate-900 leading-tight">
                    {step.label}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                    {step.role}
                  </div>
                </div>

                <div className="mt-2 pt-1 border-t border-slate-200/60">
                  <span
                    className={`text-[9px] font-extrabold uppercase ${
                      isCurrent
                        ? 'text-amber-800 animate-pulse'
                        : isCompleted
                        ? 'text-emerald-700'
                        : 'text-slate-400'
                    }`}
                  >
                    {isCurrent ? '● IN PROGRESS' : isCompleted ? '✓ DONE' : 'WAITING'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Logistics & Customer cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: Retailer & Destination Details */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Store className="w-4 h-4 text-slate-500" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Retailer & Destination</h4>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <div className="font-extrabold text-slate-900 text-sm">{order.shopName}</div>
              <div className="text-slate-500 font-medium">Owner: {order.retailerName}</div>
            </div>

            <div className="flex items-start gap-2 text-slate-600">
              <Phone className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
              <span>{address.phone || 'Phone not specified'}</span>
            </div>

            <div className="flex items-start gap-2 text-slate-600">
              <MapPin className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
              <div>
                <div>{address.fullAddress}</div>
                {address.landmark && <div className="text-slate-500">Near: {address.landmark}</div>}
                <div className="font-semibold text-slate-700">
                  {address.city} - {address.pincode}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Logistics & Dispatch Assignment */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Truck className="w-4 h-4 text-slate-500" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Logistics & Fleet</h4>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <div className="text-slate-400 font-semibold text-[11px]">Assigned Fulfillment Hub</div>
              <div className="font-bold text-slate-900 flex items-center gap-1.5 mt-0.5">
                <Building2 className="w-3.5 h-3.5 text-sky-600" />
                <span>WH-BRAHMPURI-01 (MR FUTKAR Central Hub)</span>
              </div>
            </div>

            <div>
              <div className="text-slate-400 font-semibold text-[11px] mb-1">Assigned Delivery Partner</div>
              <div className="flex gap-2">
                <select
                  value={selectedPartnerId}
                  onChange={e => setSelectedPartnerId(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-[#f5b024]"
                >
                  <option value="">Select Delivery Partner...</option>
                  {partners.map(p => (
                    <option key={p.partnerId} value={p.partnerId}>
                      {p.name} ({p.vehicleType} • {p.vehicleNumber || 'Delhi'})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={isActionLoading || !selectedPartnerId}
                  onClick={handleAssignPartner}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Assign
                </button>
              </div>
              {order.deliveryPartnerName && (
                <div className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Currently assigned: {order.deliveryPartnerName}</span>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-slate-600">
              <span>Delivery OTP:</span>
              <span className="font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-800">
                {order.deliveryOtp || 'Generated upon Dispatch'}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Financial & Billing Summary */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Receipt className="w-4 h-4 text-slate-500" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Financial Summary</h4>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Items Subtotal:</span>
              <span className="font-semibold text-slate-900">₹{order.subtotal?.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between text-emerald-700 font-medium">
              <span>Wholesale B2B Savings:</span>
              <span>-₹{order.discount?.toLocaleString('en-IN') || 0}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Delivery Charge:</span>
              <span>₹{order.deliveryCharge || 0}</span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline font-extrabold text-sm text-slate-900">
              <span>Grand Total (GMV):</span>
              <span className="text-base text-slate-950">₹{order.grandTotal?.toLocaleString('en-IN')}</span>
            </div>

            <div className="pt-2 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Payment Method:</span>
              <span className="px-2 py-0.5 rounded font-bold bg-slate-100 text-slate-700">
                {order.paymentMethod}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Payment Status:</span>
              <span
                className={`px-2 py-0.5 rounded font-bold ${
                  order.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {order.paymentStatus}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Items Breakdown Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-500" />
            <span>Ordered Items ({items.length} SKUs)</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 font-bold border-b border-slate-200">
                <th className="py-2.5 px-4">Product Details</th>
                <th className="py-2.5 px-4">SKU</th>
                <th className="py-2.5 px-4 text-center">Pack Size</th>
                <th className="py-2.5 px-4 text-center">Quantity</th>
                <th className="py-2.5 px-4 text-right">Unit Price</th>
                <th className="py-2.5 px-4 text-right">Total (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item: any, idx: number) => {
                const qty = Number(item.quantity ?? item.qty ?? 1);
                const price = Number(item.serverValidatedUnitPrice ?? item.unitPrice ?? 0);
                const subtotal = Number(item.serverValidatedSubtotal ?? item.subtotal ?? price * qty);

                return (
                  <tr key={item.productId || idx} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{item.productName}</div>
                      <div className="text-[11px] text-slate-400">{item.brandName}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">{item.sku || 'N/A'}</td>
                    <td className="py-3 px-4 text-center text-slate-600">{item.packSize || item.unit || 'Standard'}</td>
                    <td className="py-3 px-4 text-center font-bold text-slate-900">{qty}</td>
                    <td className="py-3 px-4 text-right text-slate-700">₹{price.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right font-extrabold text-slate-950">₹{subtotal.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cancel Order Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2 rounded-xl bg-rose-50">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Cancel Order #{order.orderId}?</h3>
                <p className="text-xs text-slate-500">Cancelling will atomically restore reserved stock.</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cancellation Reason <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation (e.g. Retailer requested before dispatch)..."
                rows={3}
                className="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Go Back
              </button>
              <button
                type="button"
                disabled={isActionLoading || cancelReason.trim().length < 5}
                onClick={handleConfirmCancel}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-50"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
