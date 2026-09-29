import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { OrderStatus } from '../types/order';
import OrderStatusBadge from '../components/OrderStatusBadge';
import { BusinessSettingsService } from '../config/businessSettings';
import { auth } from '../config/firebase';
import { InvoiceClient } from '../services/invoiceClient';
import { InvoiceDocumentModel } from '../types/invoiceDocument';
import { InvoiceDocumentModal } from '../components/admin/accounting/InvoiceDocumentModal';
import {
  ArrowLeft,
  Truck,
  RotateCcw,
  XCircle,
  MapPin,
  CreditCard,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Calendar,
  ShieldCheck,
  Eye,
  Download,
} from 'lucide-react';

const CANCELLATION_REASONS = [
  'Changed my mind',
  'Ordered by mistake',
  'Price issue',
  'Need different quantity',
  'Other / Store requirement adjusted',
];

export default function OrderDetailScreen() {
  const { orders, screenParams, goBack, navigate, cancelOrder, repeatOrder } = useApp();

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState(CANCELLATION_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRepeating, setIsRepeating] = useState(false);
  const [alertInfo, setAlertInfo] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  // Phase 5.5 Part 4: Tax Invoice Document state for Retailer
  const [invoiceInfo, setInvoiceInfo] = useState<{ invoiceId: string; invoiceNumber: string; grandTotal?: number } | null>(null);
  const [invoiceDoc, setInvoiceDoc] = useState<InvoiceDocumentModel | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const orderId = screenParams?.orderId;
  const order = useMemo(() => {
    if (orderId) {
      const found = orders.find(o => o.orderId === orderId || o.id === orderId || o.orderNumber === orderId);
      if (found) return found;
    }
    return orders[0];
  }, [orders, orderId]);

  useEffect(() => {
    let isMounted = true;
    const loadInvoice = async () => {
      const activeOrderId = order?.orderId || order?.id;
      if (!activeOrderId) return;
      try {
        const token = await auth.currentUser?.getIdToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/invoices/by-order/${activeOrderId}`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.success && data.invoiceId) {
            setInvoiceInfo({ invoiceId: data.invoiceId, invoiceNumber: data.invoiceNumber, grandTotal: data.grandTotal });
          }
        }
      } catch {
        // Non-blocking if invoice not yet issued for order
      }
    };
    loadInvoice();
    return () => { isMounted = false; };
  }, [order?.orderId, order?.id]);

  const handleViewInvoice = async () => {
    if (!invoiceInfo?.invoiceId) return;
    setInvoiceLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const doc = await InvoiceClient.getRetailerSalesInvoiceDocument(invoiceInfo.invoiceId, token);
      setInvoiceDoc(doc);
      setShowInvoiceModal(true);
    } catch (e: any) {
      setAlertInfo({ type: 'error', message: e.message || 'Failed to load tax invoice.' });
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handleDownloadInvoicePdf = async () => {
    if (!invoiceInfo?.invoiceId) return;
    setInvoiceLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      await InvoiceClient.downloadRetailerSalesInvoicePdf(invoiceInfo.invoiceId, invoiceInfo.invoiceNumber, token);
    } catch (e: any) {
      setAlertInfo({ type: 'error', message: e.message || 'Failed to download tax invoice PDF.' });
    } finally {
      setInvoiceLoading(false);
    }
  };

  if (!order) {
    return (
      <div className="p-4 text-center min-h-[60vh] flex flex-col items-center justify-center">
        <p className="text-stone-500 text-xs">Order details could not be found.</p>
        <button
          type="button"
          onClick={() => goBack()}
          className="mt-3 bg-[#0d1d25] text-white text-xs font-bold px-4 py-2 rounded-xl"
        >
          Back to Orders
        </button>
      </div>
    );
  }

  const isCancellable = BusinessSettingsService.isOrderCancellable(order.orderStatus);

  const handleConfirmCancellation = async () => {
    setIsCancelling(true);
    const reason = selectedReason === 'Other / Store requirement adjusted' && customReason.trim()
      ? customReason.trim()
      : selectedReason;

    try {
      await cancelOrder(order.orderId || order.id || '', reason);
      setShowCancelModal(false);
      setIsCancelling(false);
      setAlertInfo({ type: 'success', message: 'Order has been successfully cancelled.' });
    } catch (e: any) {
      setIsCancelling(false);
      setAlertInfo({ type: 'error', message: e.message || 'Failed to cancel order.' });
    }
  };

  const handleOrderAgain = async () => {
    setIsRepeating(true);
    try {
      const result = await repeatOrder(order.orderId || order.id || '');
      setIsRepeating(false);

      if (result.unavailableItems.length > 0) {
        const unavailableNames = result.unavailableItems.map(x => x.productName).join(', ');
        alert(`Note: Some items (${unavailableNames}) were out of stock and excluded. Remaining items added at current wholesale prices.`);
      }

      navigate('Cart');
    } catch (e: any) {
      setIsRepeating(false);
      setAlertInfo({ type: 'error', message: e.message || 'Failed to prepare order repeat.' });
    }
  };

  const deliveryAddr = order.deliveryAddress;
  const addressText = typeof deliveryAddr === 'string'
    ? deliveryAddr
    : deliveryAddr
    ? `${deliveryAddr.shopName}, ${deliveryAddr.fullAddress}, ${deliveryAddr.city} - ${deliveryAddr.pincode}`
    : 'Shop Address';

  return (
    <div id="order-detail-screen" className="space-y-4 pb-28 max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => goBack()}
            className="p-1.5 rounded-xl hover:bg-stone-100 text-stone-600 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-stone-900 tracking-tight">
                Order Detail
              </h2>
              <OrderStatusBadge status={order.orderStatus} />
            </div>
            <p className="text-xs text-stone-500 font-mono mt-0.5">
              {order.orderId || order.orderNumber}
            </p>
          </div>
        </div>

        {/* Quick Track link */}
        <button
          type="button"
          onClick={() => navigate('OrderTracking', { orderId: order.orderId || order.id })}
          className="text-xs font-bold text-amber-700 hover:text-amber-800 bg-amber-50 px-2.5 py-1.5 rounded-lg flex items-center gap-1 border border-amber-200"
        >
          <Truck className="w-3.5 h-3.5" />
          <span>Track</span>
        </button>
      </div>

      {/* Alert banner */}
      {alertInfo && (
        <div
          className={`p-3.5 rounded-2xl text-xs flex items-start gap-2 border shadow-xs ${
            alertInfo.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-red-50 text-red-900 border-red-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 font-semibold">{alertInfo.message}</div>
        </div>
      )}

      {/* Meta Overview Card */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-xs grid grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-[10px] text-stone-400 font-bold uppercase block">Placed On</span>
          <span className="font-bold text-stone-800 mt-0.5 block">
            {new Date(order.createdAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-stone-400 font-bold uppercase block">Payment Method</span>
          <span className="font-bold text-stone-800 mt-0.5 block uppercase">
            {order.paymentMethod} ({order.paymentStatus})
          </span>
        </div>
        <div>
          <span className="text-[10px] text-stone-400 font-bold uppercase block">Warehouse Hub</span>
          <span className="font-bold text-stone-800 mt-0.5 block truncate">
            {order.warehouseName || 'MR FUTKAR — BRAHMPURI'}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-stone-400 font-bold uppercase block">Estimated Delivery</span>
          <span className="font-bold text-emerald-700 mt-0.5 block">
            {order.estimatedDeliveryTime || 'Within 4 hours'}
          </span>
        </div>
      </div>

      {/* Products List */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-xs space-y-3">
        <h3 className="text-xs font-black uppercase tracking-wider text-stone-900">
          Products Ordered ({order.items.length} FMCG Lines)
        </h3>

        <div className="divide-y divide-stone-100">
          {order.items.map((item, idx) => (
            <div key={`${item.productId}-${idx}`} className="py-3 flex items-start justify-between gap-3 text-xs">
              <div className="flex items-start gap-3 min-w-0">
                <img
                  src={item.imageUrl}
                  alt={item.productName}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-xl object-cover bg-stone-100 shrink-0 border border-stone-100"
                />
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-amber-700 uppercase block truncate">
                    {item.brandName}
                  </span>
                  <p className="font-black text-stone-900 truncate">{item.productName}</p>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    {item.quantity} {item.unit} • ₹{item.unitPrice} per unit
                  </p>
                  {item.caseQuantity > 1 && (
                    <span className="text-[10px] text-stone-400 font-medium block">
                      Pack: {item.packSize} (Case of {item.caseQuantity})
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="font-black text-stone-950 block text-sm">
                  ₹{item.subtotal.toFixed(2)}
                </span>
                {item.discount > 0 && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded">
                    Saved ₹{item.discount.toFixed(0)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing Breakdown */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-xs space-y-2 text-xs">
        <h3 className="font-black text-stone-900 uppercase tracking-wider text-[11px] pb-1 border-b border-stone-100">
          Commercial Bill Breakdown
        </h3>

        <div className="flex justify-between text-stone-600">
          <span>Items Subtotal</span>
          <span className="font-semibold text-stone-900">₹{order.subtotal.toFixed(2)}</span>
        </div>

        <div className="flex justify-between text-stone-600">
          <span>Wholesale Margin Savings</span>
          <span className="font-bold text-emerald-700">- ₹{(order.discount || 0).toFixed(2)}</span>
        </div>

        <div className="flex justify-between text-stone-600">
          <span>Delivery Charge</span>
          <span className="font-bold text-stone-900">
            {order.deliveryCharge === 0 ? 'FREE' : `₹${order.deliveryCharge.toFixed(2)}`}
          </span>
        </div>

        <div className="flex justify-between text-stone-600">
          <span>Taxes (GST Inclusive)</span>
          <span className="font-semibold text-stone-500">₹0.00</span>
        </div>

        <div className="pt-2 border-t border-stone-100 flex justify-between items-baseline text-stone-950">
          <span className="text-sm font-black">Grand Total</span>
          <span className="text-xl font-black text-[#0d1d25]">
            ₹{(order.grandTotal || order.total || 0).toFixed(2)}
          </span>
        </div>
      </div>

      {/* SECTION: OFFICIAL TAX INVOICE CARD (Phase 5.5 Part 4) */}
      {invoiceInfo && (
        <div className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-4 shadow-xs space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-amber-200/70 pb-2">
            <div className="flex items-center gap-2 font-black uppercase tracking-wider text-amber-950 text-xs">
              <FileText className="w-4 h-4 text-amber-600" />
              <span>Official Tax Invoice</span>
            </div>
            <span className="font-mono text-xs font-bold text-amber-900">
              {invoiceInfo.invoiceNumber}
            </span>
          </div>

          <p className="text-[11px] text-amber-900/80 leading-relaxed">
            Your GST-ready wholesale tax invoice is generated. Suitable for GST input credit and store records.
          </p>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleViewInvoice}
              disabled={invoiceLoading}
              className="flex-1 py-2 bg-white hover:bg-stone-50 border border-amber-300 rounded-xl text-amber-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-amber-700" />
              <span>View Invoice</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadInvoicePdf}
              disabled={invoiceLoading}
              className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>
          </div>
        </div>
      )}

      {/* Delivery Destination & Notes */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-xs space-y-3 text-xs">
        <div>
          <div className="flex items-center gap-2 font-black uppercase tracking-wider text-stone-900 text-xs mb-1">
            <MapPin className="w-4 h-4 text-emerald-600" />
            <span>Delivery Destination</span>
          </div>
          <p className="font-bold text-stone-900">{order.shopName}</p>
          <p className="text-stone-600 leading-relaxed text-[11px] mt-0.5">{addressText}</p>
        </div>

        {order.orderNotes && (
          <div className="pt-2 border-t border-stone-100">
            <span className="font-bold text-stone-700 block mb-0.5">Order Delivery Instructions:</span>
            <p className="text-stone-600 italic bg-stone-50 p-2 rounded-lg text-[11px]">
              "{order.orderNotes}"
            </p>
          </div>
        )}

        {order.cancellationReason && (
          <div className="pt-2 border-t border-stone-100 text-red-700">
            <span className="font-bold block mb-0.5">Cancellation Reason:</span>
            <p className="bg-red-50 p-2 rounded-lg text-[11px]">
              {order.cancellationReason}
            </p>
          </div>
        )}
      </div>

      {/* SECTION 4: DELIVERY COMPLETION & PROOF OF DELIVERY (Phase 2C Part 3B) */}
      {(order.orderStatus === 'DELIVERED' || order.delivery?.assignmentStatus === 'DELIVERED' || order.deliveryCompletion) && (
        <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-4 shadow-xs space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2">
            <div className="flex items-center gap-2 font-black uppercase tracking-wider text-emerald-900 text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Verified Delivery Handover</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-black uppercase">
              COMPLETED
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-[10px] text-emerald-800 font-bold uppercase block">Received By</span>
              <span className="font-black text-stone-900 mt-0.5 block">
                {order.deliveryCompletion?.recipientName || order.delivery?.recipientName || order.delivery?.proofOfDelivery?.recipientName || 'Kirana Owner'}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-emerald-800 font-bold uppercase block">Handover OTP</span>
              <span className="font-bold text-emerald-700 mt-0.5 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Verified by Retailer</span>
              </span>
            </div>

            <div>
              <span className="text-[10px] text-emerald-800 font-bold uppercase block">COD Settlement</span>
              <span className="font-bold text-stone-900 mt-0.5 block">
                {(order.paymentMethod === 'COD' || order.deliveryCompletion?.codPaymentStatus === 'COLLECTED')
                  ? `₹${Number(order.deliveryCompletion?.codCollectedAmount || (order as any).deliveryPayment?.amountCollected || order.grandTotal).toLocaleString('en-IN')} (Paid)`
                  : 'Prepaid / Online'}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-emerald-800 font-bold uppercase block">Handover Time</span>
              <span className="font-bold text-stone-700 mt-0.5 block">
                {order.deliveryCompletion?.completedAt || order.delivery?.deliveredAt
                  ? new Date(order.deliveryCompletion?.completedAt || order.delivery?.deliveredAt).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Delivered'}
              </span>
            </div>
          </div>

          {/* Proof of Delivery Images */}
          {(order.delivery?.proofOfDelivery?.photoUrl || order.deliveryCompletion?.podPhotoPath || order.delivery?.proofOfDelivery?.signatureUrl || order.deliveryCompletion?.signaturePath) && (
            <div className="pt-2 border-t border-emerald-200/60 flex items-center gap-3">
              {(order.delivery?.proofOfDelivery?.photoUrl || order.deliveryCompletion?.podPhotoPath) && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-emerald-900 block uppercase">Store Photo</span>
                  <img
                    src={order.delivery?.proofOfDelivery?.photoUrl || order.deliveryCompletion?.podPhotoPath}
                    alt="Proof of Delivery Photo"
                    className="w-16 h-12 rounded-lg object-cover border border-emerald-300"
                  />
                </div>
              )}
              {(order.delivery?.proofOfDelivery?.signatureUrl || order.deliveryCompletion?.signaturePath) && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-emerald-900 block uppercase">Signature</span>
                  <img
                    src={order.delivery?.proofOfDelivery?.signatureUrl || order.deliveryCompletion?.signaturePath}
                    alt="Recipient Signature"
                    className="w-24 h-12 rounded-lg object-contain bg-white border border-emerald-300 p-1"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions: CANCEL ORDER (if status permits) & ORDER AGAIN */}
      <div className="space-y-2 pt-2">
        <button
          type="button"
          disabled={isRepeating}
          onClick={handleOrderAgain}
          className="w-full bg-[#0d1d25] hover:bg-stone-800 text-white font-black text-xs py-3.5 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 active:scale-98"
        >
          <RotateCcw className="w-4 h-4 text-amber-400" />
          <span>{isRepeating ? 'CALCULATING LIVE CATALOGUE PRICING...' : 'ORDER AGAIN (AT CURRENT WHOLESALE RATES)'}</span>
        </button>

        {isCancellable && (
          <button
            type="button"
            onClick={() => setShowCancelModal(true)}
            className="w-full bg-white hover:bg-red-50 text-red-700 font-bold text-xs py-3 px-4 rounded-xl border border-red-200 transition-all flex items-center justify-center gap-2"
          >
            <XCircle className="w-4 h-4 text-red-600" />
            <span>CANCEL ORDER</span>
          </button>
        )}
      </div>

      {/* Cancellation Confirmation Dialog */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-4 border border-stone-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-sm text-stone-900">Cancel Wholesale Order?</h4>
                <p className="text-[11px] text-stone-500">
                  This will halt inventory allocation at Jaipur Hub.
                </p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <label className="font-bold text-stone-700 block">Select cancellation reason:</label>
              <select
                value={selectedReason}
                onChange={e => setSelectedReason(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#0d1d25]"
              >
                {CANCELLATION_REASONS.map(r => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              {selectedReason === 'Other / Store requirement adjusted' && (
                <textarea
                  rows={2}
                  value={customReason}
                  onChange={e => setCustomReason(e.target.value)}
                  placeholder="Please specify..."
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2 font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#0d1d25] resize-none"
                />
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs py-2.5 rounded-xl transition-all"
              >
                Keep Order
              </button>
              <button
                type="button"
                disabled={isCancelling}
                onClick={handleConfirmCancellation}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black text-xs py-2.5 rounded-xl transition-all shadow-xs disabled:opacity-50"
              >
                {isCancelling ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 5.5 PART 4: CUSTOMER-FACING TAX INVOICE PREVIEW MODAL */}
      <InvoiceDocumentModal
        document={invoiceDoc}
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        isAdmin={false}
      />
    </div>
  );
}
