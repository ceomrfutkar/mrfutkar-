import React, { useState, useRef, useEffect } from 'react';
import {
  DeliveryRejectionReason,
  DeliveryFailureReason,
} from '../../types/delivery';
import {
  AlertTriangle,
  X,
  CheckCircle2,
  AlertCircle,
  Truck,
  IndianRupee,
  FileText,
  Loader2,
  Camera,
  PenTool,
  KeyRound,
  ShieldCheck,
  Trash2,
  CreditCard,
} from 'lucide-react';

interface RejectModalProps {
  orderId: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: DeliveryRejectionReason | string) => Promise<void>;
  isLoading: boolean;
}

export const RejectModal: React.FC<RejectModalProps> = ({
  orderId,
  isOpen,
  onClose,
  onConfirm,
  isLoading,
}) => {
  const [reason, setReason] = useState<DeliveryRejectionReason>('VEHICLE_ISSUE');
  const [customReason, setCustomReason] = useState('');

  if (!isOpen) return null;

  const reasons: { key: DeliveryRejectionReason; label: string }[] = [
    { key: 'CUSTOMER_TOO_FAR', label: 'Delivery location out of reach / Corridor blocked' },
    { key: 'VEHICLE_ISSUE', label: 'Vehicle breakdown or mechanical fault' },
    { key: 'PERSONAL_REASON', label: 'Personal emergency / Shift ending' },
    { key: 'ROUTE_ISSUE', label: 'Severe traffic or route impassable' },
    { key: 'OTHER', label: 'Other operational issue' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalReason = reason === 'OTHER' && customReason.trim() ? customReason.trim() : reason;
    await onConfirm(finalReason);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-stone-800 pb-3">
          <div className="flex items-center gap-2 text-[#e72b2b]">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="font-black text-base text-white">Reject Delivery Assignment</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-1 rounded-lg text-stone-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-stone-300">
          Rejecting will return order <span className="font-mono font-bold text-[#f5b024]">{orderId}</span> to the Brahmpuri dispatch bay for fleet reassignment. Inventory will remain intact.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">
              Reason for Rejection <span className="text-[#e72b2b]">*</span>
            </label>
            <div className="space-y-2">
              {reasons.map(r => (
                <label
                  key={r.key}
                  className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer text-xs transition-all ${
                    reason === r.key
                      ? 'border-[#f5b024] bg-[#f5b024]/10 text-white font-medium'
                      : 'border-stone-800 bg-stone-950 text-stone-300 hover:border-stone-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="rejectReason"
                    value={r.key}
                    checked={reason === r.key}
                    onChange={() => setReason(r.key)}
                    className="mt-0.5 text-[#f5b024] focus:ring-[#f5b024]"
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          {reason === 'OTHER' && (
            <div>
              <input
                type="text"
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                placeholder="Specify reason..."
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-stone-600 focus:outline-none focus:border-[#f5b024]"
                required
              />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-2.5 rounded-xl border border-stone-700 text-stone-300 text-xs font-bold hover:bg-stone-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-2.5 rounded-xl bg-[#e72b2b] hover:bg-red-600 text-white text-xs font-black shadow-lg flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span>Confirm Rejection</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface FailedModalProps {
  orderId: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: DeliveryFailureReason | string, notes?: string) => Promise<void>;
  isLoading: boolean;
}

export const FailedModal: React.FC<FailedModalProps> = ({
  orderId,
  isOpen,
  onClose,
  onConfirm,
  isLoading,
}) => {
  const [reason, setReason] = useState<DeliveryFailureReason>('SHOP_CLOSED');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const failureReasons: { key: DeliveryFailureReason; label: string }[] = [
    { key: 'CUSTOMER_UNAVAILABLE', label: 'Customer / Shopkeeper unavailable after multiple calls' },
    { key: 'SHOP_CLOSED', label: 'Retail outlet or shop is shuttered / closed' },
    { key: 'WRONG_ADDRESS', label: 'Inaccurate address / unable to locate store in corridor' },
    { key: 'CUSTOMER_REFUSED', label: 'Retailer refused delivery / declined wholesale order' },
    { key: 'PAYMENT_ISSUE', label: 'Retailer unable or unwilling to pay COD amount' },
    { key: 'VEHICLE_ISSUE', label: 'Transit vehicle breakdown preventing completion' },
    { key: 'OTHER', label: 'Other field condition' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm(reason, notes);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-stone-800 pb-3">
          <div className="flex items-center gap-2 text-[#e72b2b]">
            <AlertCircle className="w-5 h-5" />
            <h3 className="font-black text-base text-white">Record Delivery Failure</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-1 rounded-lg text-stone-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-stone-300">
          Marking order <span className="font-mono font-bold text-[#f5b024]">{orderId}</span> as failed will update its status to <span className="font-bold text-[#e72b2b]">FAILED_DELIVERY</span> and prompt return staging back to WH-BRAHMPURI-01.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-2">
              Failure Reason <span className="text-[#e72b2b]">*</span>
            </label>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {failureReasons.map(r => (
                <label
                  key={r.key}
                  className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer text-xs transition-all ${
                    reason === r.key
                      ? 'border-[#e72b2b] bg-[#e72b2b]/10 text-white font-medium'
                      : 'border-stone-800 bg-stone-950 text-stone-300 hover:border-stone-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="failureReason"
                    value={r.key}
                    checked={reason === r.key}
                    onChange={() => setReason(r.key)}
                    className="mt-0.5 text-[#e72b2b] focus:ring-[#e72b2b]"
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1">
              Field Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Shop shutter down at 11:30 AM, phone unreachable"
              className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-white placeholder:text-stone-600 focus:outline-none focus:border-[#f5b024]"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-2.5 rounded-xl border border-stone-700 text-stone-300 text-xs font-bold hover:bg-stone-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-2.5 rounded-xl bg-[#e72b2b] hover:bg-red-600 text-white text-xs font-black shadow-lg flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span>Mark Delivery Failed</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface DeliveredModalProps {
  order: any;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (details: {
    recipientName: string;
    deliveryNotes?: string;
    amountCollected?: number;
    paymentMethod?: 'CASH' | 'UPI';
    paymentReference?: string;
    otp: string;
    photoUrl?: string;
    signatureUrl?: string;
  }) => Promise<void>;
  isLoading: boolean;
}

export const DeliveredModal: React.FC<DeliveredModalProps> = ({
  order,
  isOpen,
  onClose,
  onConfirm,
  isLoading,
}) => {
  const isCod = (order?.paymentMethod || order?.payment?.method) === 'COD';
  const totalAmount = Number(order?.totalAmount ?? order?.grandTotal ?? order?.total ?? 0);
  const isPaid = (order?.paymentStatus || order?.payment?.status) === 'PAID';
  const amountDue = isCod && !isPaid ? totalAmount : 0;

  const [recipientName, setRecipientName] = useState(
    order?.deliveryAddress?.ownerName || order?.shopName || order?.retailerName || ''
  );
  const [deliveryNotes, setDeliveryNotes] = useState('Delivered to shop owner');
  const [amountCollected, setAmountCollected] = useState<string>(String(amountDue));
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI'>('CASH');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [otp, setOtp] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(order?.delivery?.proofOfDelivery?.photoUrl || null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(order?.delivery?.proofOfDelivery?.signatureUrl || null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignatureStroke, setHasSignatureStroke] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize canvas
  useEffect(() => {
    if (isOpen && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#f5b024';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [isOpen]);

  if (!isOpen || !order) return null;

  // Drawing event handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSignatureStroke(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing && canvasRef.current) {
      setIsDrawing(false);
      setSignatureUrl(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasSignatureStroke(false);
    setSignatureUrl(null);
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Photo exceeds 5MB limit. Please upload a smaller image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setPhotoUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!recipientName.trim() || recipientName.trim().length < 2) {
      setError('Please provide the recipient name (minimum 2 characters).');
      return;
    }

    // OTP validation
    const alreadyVerified = Boolean(order?.delivery?.otpVerified);
    if (!alreadyVerified) {
      if (!otp.trim() || otp.trim().length !== 6) {
        setError('Please enter the 6-digit delivery OTP given by the retailer.');
        return;
      }
    }

    // COD validation
    const collectedNum = Number(amountCollected) || 0;
    if (isCod && amountDue > 0) {
      if (collectedNum > amountDue) {
        setError(`Amount collected (₹${collectedNum}) cannot exceed total COD due (₹${amountDue}).`);
        return;
      }
      if (collectedNum < amountDue) {
        setError(`Full payment of ₹${amountDue} required to complete COD delivery handover.`);
        return;
      }
    }

    await onConfirm({
      recipientName: recipientName.trim(),
      deliveryNotes: deliveryNotes.trim(),
      amountCollected: isCod ? collectedNum : 0,
      paymentMethod: isCod ? paymentMode : undefined,
      paymentReference: isCod && paymentReference.trim() ? paymentReference.trim() : undefined,
      otp: otp.trim(),
      photoUrl: photoUrl || undefined,
      signatureUrl: signatureUrl || undefined,
    });
  };

  const isOtpPreVerified = Boolean(order?.delivery?.otpVerified);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-lg w-full p-4 sm:p-5 shadow-2xl space-y-4 my-auto max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-stone-800 pb-3">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
            <h3 className="font-black text-base text-white">Proof of Delivery & Handover</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-1 rounded-lg text-stone-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Order Summary Strip */}
        <div className="bg-stone-950 border border-stone-800 rounded-xl p-3 space-y-1.5 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-stone-400">Consignment</span>
            <span className="font-mono font-bold text-white">{order.orderId || order.id}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-stone-400">Destination Store</span>
            <span className="font-bold text-[#f5b024]">{order.deliveryAddress?.shopName || order.shopName || 'Retailer Shop'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-stone-400">Corridor</span>
            <span className="text-stone-300 font-medium">{order.deliveryAddress?.serviceArea || 'Brahmpuri / Karawal Nagar'}</span>
          </div>
        </div>

        {/* COD Collection Section */}
        {isCod && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-black text-[#f5b024] uppercase tracking-wider">
                <IndianRupee className="w-4 h-4" />
                <span>Cash on Delivery (COD) Collection</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-[#f5b024] text-[10px] font-bold">
                {isPaid ? 'PAID' : 'DUE ON HANDOVER'}
              </span>
            </div>

            <div className="flex items-baseline justify-between">
              <span className="text-xs text-stone-300">Amount Due from Retailer:</span>
              <span className="text-lg font-black text-white font-mono">
                ₹{amountDue.toLocaleString('en-IN')}
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-300 mb-1">
                Amount Collected (₹) <span className="text-[#f5b024]">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-stone-400 font-bold">₹</span>
                <input
                  type="number"
                  min={0}
                  value={amountCollected}
                  onChange={e => setAmountCollected(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-8 pr-3 py-1.5 text-sm text-white font-mono font-bold focus:outline-none focus:border-[#f5b024]"
                  required
                />
              </div>
              <p className="text-[10px] text-stone-400 mt-0.5">
                Exact payment matching invoice total required. No under-collection allowed.
              </p>
            </div>

            {/* Payment Mode Selection: CASH vs UPI */}
            <div>
              <label className="block text-xs font-bold text-stone-300 mb-1.5">
                Collection Mode <span className="text-[#f5b024]">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMode('CASH')}
                  className={`py-2 px-3 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                    paymentMode === 'CASH'
                      ? 'border-[#f5b024] bg-[#f5b024]/15 text-[#f5b024]'
                      : 'border-stone-800 bg-stone-950 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <IndianRupee className="w-3.5 h-3.5" />
                  <span>Physical Cash</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('UPI')}
                  className={`py-2 px-3 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                    paymentMode === 'UPI'
                      ? 'border-[#f5b024] bg-[#f5b024]/15 text-[#f5b024]'
                      : 'border-stone-800 bg-stone-950 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>UPI / QR</span>
                </button>
              </div>
              <p className="text-[10px] text-stone-400 mt-1">
                {paymentMode === 'CASH'
                  ? 'Physical cash added to your cash custody balance for warehouse/admin handover.'
                  : 'UPI collection goes directly to company bank account (no physical cash custody in hand).'}
              </p>
            </div>

            {paymentMode === 'UPI' && (
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1">
                  UPI / Bank Reference ID (UTR)
                </label>
                <input
                  type="text"
                  value={paymentReference}
                  onChange={e => setPaymentReference(e.target.value)}
                  placeholder="e.g. 3254XXXXXXXX"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#f5b024]"
                />
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Recipient Input */}
          <div>
            <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1">
              Received By (Kirana Owner / Staff) <span className="text-[#f5b024]">*</span>
            </label>
            <input
              type="text"
              value={recipientName}
              onChange={e => setRecipientName(e.target.value)}
              placeholder="e.g. Ramesh Kumar (Store Owner)"
              className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#f5b024]"
              required
            />
          </div>

          {/* Delivery OTP Section */}
          <div className="bg-stone-950 border border-stone-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-stone-300">
                <KeyRound className="w-4 h-4 text-[#f5b024]" />
                <span>Handover Verification OTP</span>
              </div>
              {isOtpPreVerified ? (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                  <ShieldCheck className="w-3 h-3" /> VERIFIED
                </span>
              ) : (
                <span className="text-[10px] text-stone-400">Ask retailer for 6-digit code</span>
              )}
            </div>

            {!isOtpPreVerified && (
              <div>
                <input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 6-digit OTP"
                  className="w-full bg-stone-900 border border-stone-700 rounded-xl px-3 py-2 text-center text-sm font-mono tracking-widest text-[#f5b024] font-black focus:outline-none focus:border-[#f5b024]"
                  required
                />
              </div>
            )}
          </div>

          {/* Proof of Delivery Media: Photo & Signature */}
          <div className="space-y-3 pt-1">
            <div className="text-xs font-bold text-stone-300 uppercase tracking-wider">
              Proof of Delivery (POD) Documentation
            </div>

            {/* Photo Capture */}
            <div className="bg-stone-950 border border-stone-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-300 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-[#f5b024]" />
                  Store / Package Photo
                </span>
                {photoUrl && (
                  <button
                    type="button"
                    onClick={() => setPhotoUrl(null)}
                    className="text-[10px] text-[#e72b2b] hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                )}
              </div>

              {photoUrl ? (
                <div className="relative rounded-lg overflow-hidden border border-stone-800 h-28 bg-black flex items-center justify-center">
                  <img src={photoUrl} alt="POD Capture" className="h-full w-full object-cover" />
                  <span className="absolute bottom-1 right-2 bg-black/60 px-1.5 py-0.5 rounded text-[9px] text-emerald-400 font-bold">
                    Captured
                  </span>
                </div>
              ) : (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-3 border border-dashed border-stone-700 hover:border-[#f5b024] rounded-xl flex items-center justify-center gap-2 text-xs text-stone-400 hover:text-white transition-colors"
                  >
                    <Camera className="w-4 h-4 text-[#f5b024]" />
                    <span>Take Photo or Upload Image</span>
                  </button>
                </div>
              )}
            </div>

            {/* Signature Capture */}
            <div className="bg-stone-950 border border-stone-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-300 flex items-center gap-1.5">
                  <PenTool className="w-4 h-4 text-[#f5b024]" />
                  Recipient Digital Signature
                </span>
                {hasSignatureStroke && (
                  <button
                    type="button"
                    onClick={clearSignature}
                    className="text-[10px] text-stone-400 hover:text-white flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Clear
                  </button>
                )}
              </div>

              <div className="border border-stone-800 rounded-xl bg-stone-900/60 overflow-hidden touch-none">
                <canvas
                  ref={canvasRef}
                  width={340}
                  height={100}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-24 cursor-crosshair block"
                />
              </div>
              <p className="text-[10px] text-stone-500">
                Kirana owner or receiver can sign with finger or stylus above.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1">
              Delivery Notes
            </label>
            <input
              type="text"
              value={deliveryNotes}
              onChange={e => setDeliveryNotes(e.target.value)}
              placeholder="e.g. Handed over at counter with verified stock count"
              className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#f5b024]"
            />
          </div>

          {error && (
            <div className="p-2.5 bg-[#e72b2b]/15 border border-[#e72b2b]/30 rounded-xl text-[#e72b2b] text-xs font-medium">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-2.5 rounded-xl border border-stone-700 text-stone-300 text-xs font-bold hover:bg-stone-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 text-xs font-black shadow-lg flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm Handover & POD</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
