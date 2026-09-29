import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { PaymentMethod } from '../types/order';
import { DeliveryAddress } from '../types/order';
import { mapOrderError } from '../services/orderErrorMapper';
import {
  MapPin,
  CreditCard,
  Banknote,
  QrCode,
  Globe,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
  Truck,
  Plus,
  Edit2,
  X,
  AlertCircle,
  RotateCw,
  FileText,
  Building2,
  Phone,
  User,
  ShoppingBag,
} from 'lucide-react';

export default function CheckoutScreen() {
  const {
    cart,
    subtotal,
    totalSavings,
    deliveryFee,
    grandTotal,
    savedAddresses,
    selectedAddress,
    selectAddress,
    addAddress,
    updateAddress,
    placeOrder,
    navigate,
    isMinOrderMet,
    remainingForMinOrder,
    settings,
  } = useApp();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [orderNotes, setOrderNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Blocker 5: Idempotency Key tied to checkout attempt session
  const [checkoutAttemptKey, setCheckoutAttemptKey] = useState<string>(() => {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  });

  // Address Modal State
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressForm, setAddressForm] = useState<Omit<DeliveryAddress, 'id'>>({
    shopName: '',
    ownerName: '',
    fullAddress: '',
    city: 'Jaipur',
    pincode: '',
    phone: '',
    isDefault: false,
  });

  const openAddAddressModal = () => {
    setEditingAddressId(null);
    setAddressForm({
      shopName: selectedAddress?.shopName || '',
      ownerName: selectedAddress?.ownerName || '',
      fullAddress: '',
      city: selectedAddress?.city || 'Jaipur',
      pincode: '',
      phone: selectedAddress?.phone || '',
      isDefault: false,
    });
    setShowAddressModal(true);
  };

  const openEditAddressModal = (addr: DeliveryAddress) => {
    setEditingAddressId(addr.id);
    setAddressForm({
      shopName: addr.shopName,
      ownerName: addr.ownerName,
      fullAddress: addr.fullAddress,
      city: addr.city,
      pincode: addr.pincode,
      phone: addr.phone,
      isDefault: addr.isDefault || false,
    });
    setShowAddressModal(true);
  };

  const handleSaveAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addressForm.shopName.trim() || !addressForm.fullAddress.trim() || !addressForm.phone.trim()) {
      return;
    }

    if (editingAddressId) {
      updateAddress(editingAddressId, addressForm);
    } else {
      addAddress(addressForm);
    }
    setShowAddressModal(false);
  };

  const handlePlaceOrder = async (isRetry = false) => {
    setErrorMessage(null);

    if (cart.length === 0) {
      setErrorMessage('Your cart is empty. Please add items from catalogue.');
      return;
    }
    if (!selectedAddress) {
      setErrorMessage('Please select or add a delivery destination address.');
      return;
    }
    if (!isMinOrderMet) {
      setErrorMessage(
        `Minimum order value of ₹${settings.minimumOrderValue} not met. Please add ₹${remainingForMinOrder.toFixed(2)} more.`
      );
      return;
    }

    // Reuse the exact same idempotency key on retry to guarantee deduplication
    let activeKey = checkoutAttemptKey;
    if (!isRetry && !activeKey) {
      activeKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setCheckoutAttemptKey(activeKey);
    }

    setIsSubmitting(true);
    try {
      const order = await placeOrder(paymentMethod, orderNotes, activeKey);
      setIsSubmitting(false);
      // ONLY on confirmed backend success:
      navigate('OrderSuccess', { orderId: order.orderId });
    } catch (err: any) {
      setIsSubmitting(false);
      // Map error code to retailer-friendly message
      const friendlyMessage = mapOrderError(err);
      setErrorMessage(friendlyMessage);
      // CRITICAL (Blocker 3): Never clear cart, never show order success on error!
    }
  };

  if (cart.length === 0) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4 max-w-md mx-auto">
        <div className="w-16 h-16 bg-stone-100 text-stone-400 rounded-3xl flex items-center justify-center mb-4">
          <ShoppingBag className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-xl font-black text-stone-900 mb-1">
          No items to checkout
        </h2>
        <p className="text-xs text-stone-500 max-w-xs mb-6">
          Add items to your cart before proceeding to checkout.
        </p>
        <button
          type="button"
          onClick={() => navigate('Catalogue')}
          className="bg-[#0d1d25] hover:bg-stone-800 text-white font-bold text-xs px-6 py-3 rounded-xl transition-all shadow-sm"
        >
          Explore Catalogue
        </button>
      </div>
    );
  }

  return (
    <div id="checkout-screen" className="space-y-4 pb-32 max-w-lg mx-auto">
      {/* Checkout Header */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200/90 shadow-xs">
        <h2 className="text-xl font-black text-stone-900 tracking-tight">
          B2B Wholesale Checkout
        </h2>
        <p className="text-xs text-stone-500 mt-0.5">
          Dispatching from {settings.defaultWarehouseName}
        </p>
      </div>

      {/* Error alert with Retry and Edit Cart actions (Blocker 3 & Blocker 5) */}
      {errorMessage && (
        <div id="checkout-error-banner" className="bg-red-50 border border-red-200 rounded-2xl p-4 text-xs text-red-900 shadow-xs space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-black text-red-950 text-sm">Order Submission Notice</h4>
              <p className="mt-0.5 font-medium text-red-800 leading-relaxed">{errorMessage}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-red-200/70">
            <button
              id="retry-order-btn"
              type="button"
              onClick={() => handlePlaceOrder(true)}
              disabled={isSubmitting}
              className="flex-1 bg-red-600 hover:bg-red-700 active:scale-[0.98] disabled:opacity-60 text-white font-bold py-2.5 px-3 rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
              <span>Retry Order</span>
            </button>
            <button
              id="cancel-error-btn"
              type="button"
              onClick={() => {
                setErrorMessage(null);
                navigate('Cart');
              }}
              className="bg-white hover:bg-stone-50 active:scale-[0.98] border border-red-200 text-stone-700 font-bold py-2.5 px-4 rounded-xl transition-all cursor-pointer"
            >
              Edit Cart
            </button>
          </div>
        </div>
      )}

      {/* SECTION A. Delivery Address */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-stone-900">
            <MapPin className="w-4 h-4 text-emerald-600" />
            <span>A. Delivery Address</span>
          </div>
          <button
            type="button"
            onClick={openAddAddressModal}
            className="text-xs font-bold text-amber-600 hover:text-amber-800 flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Address</span>
          </button>
        </div>

        {/* Saved Addresses List with Selection */}
        <div className="space-y-2">
          {savedAddresses.map(addr => {
            const isSelected = selectedAddress?.id === addr.id;
            return (
              <div
                key={addr.id}
                onClick={() => selectAddress(addr.id)}
                className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer relative ${
                  isSelected
                    ? 'border-[#0d1d25] bg-amber-50/40 shadow-xs'
                    : 'border-stone-200 hover:border-stone-300 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-xs text-stone-900 truncate">
                        {addr.shopName}
                      </span>
                      {addr.isDefault && (
                        <span className="text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-semibold text-stone-700 mt-0.5">
                      Contact: {addr.ownerName} • +91 {addr.phone}
                    </p>
                    <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                      {addr.fullAddress}, {addr.city} - {addr.pincode}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? 'border-[#0d1d25]' : 'border-stone-300'
                      }`}
                    >
                      {isSelected && <div className="w-2 h-2 rounded-full bg-[#0d1d25]" />}
                    </div>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        openEditAddressModal(addr);
                      }}
                      className="p-1 text-stone-400 hover:text-stone-700 transition-colors"
                      title="Edit address"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION B. Order Summary (Items Overview) */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-stone-900">
            <ShoppingBag className="w-4 h-4 text-amber-600" />
            <span>B. Order Summary ({cart.length} items)</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('Cart')}
            className="text-[11px] font-bold text-amber-600 hover:text-amber-800"
          >
            Edit Cart
          </button>
        </div>

        <div className="divide-y divide-stone-100 max-h-52 overflow-y-auto pr-1">
          {cart.map(item => (
            <div key={item.productId || item.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={item.imageUrl || item.image}
                  alt={item.productName || item.name}
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 rounded-lg object-cover bg-stone-100 shrink-0"
                />
                <div className="min-w-0">
                  <p className="font-bold text-stone-900 truncate">{item.productName || item.name}</p>
                  <p className="text-[10px] text-stone-500">
                    {item.quantity} {item.unit} • ₹{item.unitPrice} per unit
                  </p>
                </div>
              </div>
              <span className="font-black text-stone-900 shrink-0">
                ₹{item.subtotal.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION C. Pricing Summary */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-xs space-y-2.5 text-xs">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-stone-900 pb-1 border-b border-stone-100">
          <FileText className="w-4 h-4 text-emerald-600" />
          <span>C. Pricing Summary</span>
        </div>

        <div className="flex justify-between text-stone-600">
          <span>Items Subtotal</span>
          <span className="font-semibold text-stone-900">₹{subtotal.toFixed(2)}</span>
        </div>

        <div className="flex justify-between text-stone-600">
          <span>Wholesale Margin Savings</span>
          <span className="font-bold text-emerald-700">- ₹{totalSavings.toFixed(2)}</span>
        </div>

        <div className="flex justify-between text-stone-600">
          <span>Delivery Charge ({settings.defaultWarehouseName})</span>
          <span className={`font-bold ${deliveryFee === 0 ? 'text-emerald-700' : 'text-stone-900'}`}>
            {deliveryFee === 0 ? 'FREE' : `₹${deliveryFee.toFixed(2)}`}
          </span>
        </div>

        <div className="flex justify-between text-stone-600">
          <span>Taxes (GST Inclusive)</span>
          <span className="font-semibold text-stone-500">₹0.00</span>
        </div>

        <div className="pt-2 border-t border-stone-100 flex justify-between items-baseline text-stone-950">
          <span className="text-sm font-black">Grand Total to Pay</span>
          <span className="text-xl font-black text-[#0d1d25]">₹{grandTotal.toFixed(2)}</span>
        </div>
      </div>

      {/* SECTION D. Payment Method Selection */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-stone-900">
          <CreditCard className="w-4 h-4 text-amber-600" />
          <span>D. Payment Method</span>
        </div>

        <div className="space-y-2">
          {/* 1. Cash on Delivery (COD) */}
          <div
            onClick={() => setPaymentMethod('COD')}
            className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
              paymentMethod === 'COD'
                ? 'border-[#0d1d25] bg-stone-50/80 shadow-xs'
                : 'border-stone-200 hover:border-stone-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-black shrink-0">
                <Banknote className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-black text-stone-900">Cash on Delivery (COD)</h4>
                  <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                    Popular for Kirana
                  </span>
                </div>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Hand cash or scan dynamic QR at shop counter upon delivery
                </p>
              </div>
            </div>
            <div
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                paymentMethod === 'COD' ? 'border-[#0d1d25]' : 'border-stone-300'
              }`}
            >
              {paymentMethod === 'COD' && <div className="w-2 h-2 rounded-full bg-[#0d1d25]" />}
            </div>
          </div>

          {/* 2. Instant UPI */}
          <div
            onClick={() => setPaymentMethod('UPI')}
            className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
              paymentMethod === 'UPI'
                ? 'border-[#0d1d25] bg-stone-50/80 shadow-xs'
                : 'border-stone-200 hover:border-stone-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-black shrink-0">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-stone-900">Instant UPI Payment</h4>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Google Pay, PhonePe, Paytm, BHIM QR
                </p>
              </div>
            </div>
            <div
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                paymentMethod === 'UPI' ? 'border-[#0d1d25]' : 'border-stone-300'
              }`}
            >
              {paymentMethod === 'UPI' && <div className="w-2 h-2 rounded-full bg-[#0d1d25]" />}
            </div>
          </div>

          {/* 3. Online Payment (Gateway Ready) */}
          <div
            onClick={() => setPaymentMethod('ONLINE')}
            className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
              paymentMethod === 'ONLINE'
                ? 'border-[#0d1d25] bg-stone-50/80 shadow-xs'
                : 'border-stone-200 hover:border-stone-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center font-black shrink-0">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-stone-900">NetBanking / Business Debit Card</h4>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  HDFC, SBI, ICICI, Axis B2B Current Accounts
                </p>
              </div>
            </div>
            <div
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                paymentMethod === 'ONLINE' ? 'border-[#0d1d25]' : 'border-stone-300'
              }`}
            >
              {paymentMethod === 'ONLINE' && <div className="w-2 h-2 rounded-full bg-[#0d1d25]" />}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION E. Order Notes */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-xs space-y-2">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-stone-900">
          <FileText className="w-4 h-4 text-stone-600" />
          <span>E. Order Notes / Delivery Instructions</span>
        </div>
        <textarea
          value={orderNotes}
          onChange={e => setOrderNotes(e.target.value)}
          placeholder="e.g. Please deliver between 2 PM - 4 PM when shop rush is low, or call before dispatch..."
          rows={2}
          className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs text-stone-900 placeholder:text-stone-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0d1d25] transition-all resize-none"
        />
      </div>

      {/* SECTION F. Fixed Bottom Place Order Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-3 bg-white/95 backdrop-blur-md border-t border-stone-200 z-30 max-w-lg mx-auto">
        <button
          id="place-wholesale-order-btn"
          type="button"
          disabled={isSubmitting}
          onClick={() => handlePlaceOrder(false)}
          className="w-full bg-[#0d1d25] hover:bg-stone-800 text-white font-black text-sm py-4 px-4 rounded-xl transition-all shadow-md flex items-center justify-between active:scale-98 disabled:opacity-70 cursor-pointer"
        >
          <div className="text-left">
            <span className="text-[10px] text-amber-400 uppercase tracking-wider block font-bold">
              {paymentMethod} • Direct Hub Dispatch
            </span>
            <span>₹{grandTotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-black">
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <RotateCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span>Placing Order...</span>
              </span>
            ) : (
              <>
                <span>PLACE WHOLESALE ORDER</span>
                <ArrowRight className="w-4 h-4 text-amber-400" />
              </>
            )}
          </div>
        </button>
      </div>

      {/* Add/Edit Address Modal */}
      {showAddressModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-3">
          <div className="bg-white rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4 border border-stone-200">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="font-black text-base text-stone-900">
                {editingAddressId ? 'Edit Delivery Address' : 'Add New Delivery Destination'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddressModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAddress} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">Kirana / Shop Name *</label>
                <input
                  type="text"
                  required
                  value={addressForm.shopName}
                  onChange={e => setAddressForm(prev => ({ ...prev, shopName: e.target.value }))}
                  placeholder="e.g. Shree Krishna Kirana & General Store"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 font-semibold text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0d1d25]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Owner Name *</label>
                  <input
                    type="text"
                    required
                    value={addressForm.ownerName}
                    onChange={e => setAddressForm(prev => ({ ...prev, ownerName: e.target.value }))}
                    placeholder="e.g. Radhey Shyam"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 font-semibold text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0d1d25]"
                  />
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={addressForm.phone}
                    onChange={e => setAddressForm(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="10-digit mobile"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 font-semibold text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0d1d25]"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">Full Shop / Godown Address *</label>
                <textarea
                  required
                  rows={2}
                  value={addressForm.fullAddress}
                  onChange={e => setAddressForm(prev => ({ ...prev, fullAddress: e.target.value }))}
                  placeholder="Plot/Shop number, Street, Landmark..."
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 font-semibold text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0d1d25] resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">City *</label>
                  <input
                    type="text"
                    required
                    value={addressForm.city}
                    onChange={e => setAddressForm(prev => ({ ...prev, city: e.target.value }))}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 font-semibold text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0d1d25]"
                  />
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Pincode *</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={addressForm.pincode}
                    onChange={e => setAddressForm(prev => ({ ...prev, pincode: e.target.value }))}
                    placeholder="e.g. 302015"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 font-semibold text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0d1d25]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-3 bg-[#0d1d25] hover:bg-stone-800 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-xs"
              >
                {editingAddressId ? 'Update Address' : 'Save & Select Address'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
