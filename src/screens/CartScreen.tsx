import React from 'react';
import { useApp } from '../context/AppContext';
import {
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ShoppingBag,
  Truck,
  Sparkles,
  AlertCircle,
  Box,
  Layers,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';

export default function CartScreen() {
  const {
    cart,
    changeQty,
    removeFromCart,
    toggleItemPackagingMode,
    subtotal,
    totalMrp,
    totalSavings,
    deliveryFee,
    grandTotal,
    uniqueProductsCount,
    totalQuantity,
    settings,
    isMinOrderMet,
    remainingForMinOrder,
    isFreeDelivery,
    navigate,
  } = useApp();

  if (cart.length === 0) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4 max-w-md mx-auto">
        <div className="w-16 h-16 bg-stone-100 text-stone-400 rounded-3xl flex items-center justify-center mb-4">
          <ShoppingBag className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-xl font-black text-stone-900 mb-1">
          Your wholesale cart is empty
        </h2>
        <p className="text-xs text-stone-500 max-w-xs mb-6 leading-relaxed">
          Add fast-moving FMCG products from Haldiram, Parle, Britannia, and Cadbury directly at Kirana wholesale margins.
        </p>
        <button
          type="button"
          onClick={() => navigate('Catalogue')}
          className="bg-[#0d1d25] hover:bg-stone-800 text-white font-bold text-xs px-6 py-3 rounded-xl transition-all shadow-sm"
        >
          Explore Wholesale Catalogue
        </button>
      </div>
    );
  }

  return (
    <div id="cart-screen" className="space-y-4 pb-32 max-w-lg mx-auto">
      {/* 2. Header: My Cart with Unique Products & Total Quantity */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200/90 shadow-xs flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-stone-900 tracking-tight">
            My Cart
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            MR FUTKAR Kirana Wholesale Procurement
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-stone-100 text-stone-700 text-xs font-bold px-2.5 py-1 rounded-lg">
            {uniqueProductsCount} {uniqueProductsCount === 1 ? 'Product' : 'Products'}
          </span>
          <span className="bg-amber-100 text-amber-900 text-xs font-black px-2.5 py-1 rounded-lg">
            {totalQuantity} {totalQuantity === 1 ? 'Unit' : 'Total Units'}
          </span>
        </div>
      </div>

      {/* 4. Minimum Order Rule Notification Banner */}
      {!isMinOrderMet ? (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 text-xs text-amber-950 flex items-start gap-2.5 shadow-xs">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-black text-amber-900">
              Minimum Order Value: ₹{settings.minimumOrderValue}
            </p>
            <p className="text-amber-800 mt-0.5 font-medium">
              Add <strong className="text-amber-950 font-bold">₹{remainingForMinOrder.toFixed(2)}</strong> more to place your wholesale order.
            </p>
            <div className="w-full bg-amber-200/70 h-2 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-amber-600 h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, Math.round((subtotal / settings.minimumOrderValue) * 100))}%`,
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center justify-between text-xs text-emerald-950 shadow-xs">
          <div className="flex items-center gap-2 font-bold">
            <Truck className="w-4 h-4 text-emerald-600" />
            <span>
              {isFreeDelivery
                ? 'FREE delivery unlocked from Jaipur Central Hub!'
                : `Add ₹${(settings.freeDeliveryThreshold - subtotal).toFixed(2)} more for free delivery.`}
            </span>
          </div>
          {isFreeDelivery && (
            <span className="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded">
              FREE DELIVERY
            </span>
          )}
        </div>
      )}

      {/* 2. Cart Items List */}
      <div className="bg-white rounded-2xl border border-stone-200/90 divide-y divide-stone-100 overflow-hidden shadow-xs">
        {cart.map(item => {
          const itemQty = item.quantity;
          const caseQty = item.caseQuantity || 1;
          const supportsCases = caseQty > 1;
          const isCaseMode = item.orderMode === 'cases';
          const casesCount = Math.floor(itemQty / caseQty);
          const looseUnits = itemQty % caseQty;
          const discountPerUnit = Math.max(0, item.mrp - item.unitPrice);

          return (
            <div key={item.productId || item.id} className="p-3.5 space-y-2.5">
              <div className="flex items-start gap-3">
                {/* Product Image */}
                <div
                  onClick={() => navigate('ProductDetail', { id: item.productId || item.id })}
                  className="w-16 h-16 rounded-xl bg-stone-100 shrink-0 overflow-hidden flex items-center justify-center cursor-pointer border border-stone-100"
                >
                  <img
                    src={item.imageUrl || item.image}
                    alt={item.productName || item.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Product Meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block truncate">
                      {item.brandName || item.brand}
                    </span>
                    <span className="text-[9px] font-mono text-stone-400">
                      SKU: {item.sku || `SKU-${item.id}`}
                    </span>
                  </div>

                  <h4
                    onClick={() => navigate('ProductDetail', { id: item.productId || item.id })}
                    className="text-xs font-black text-stone-900 truncate cursor-pointer hover:text-amber-600 transition-colors"
                  >
                    {item.productName || item.name}
                  </h4>

                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-stone-500">
                    <span className="bg-stone-100 text-stone-700 font-semibold px-1.5 py-0.2 rounded">
                      Pack: {item.packSize || item.unit}
                    </span>
                    {supportsCases && (
                      <span className="text-stone-500 font-medium">
                        1 Case = {caseQty} units
                      </span>
                    )}
                  </div>
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => removeFromCart(item.productId || item.id)}
                  className="p-1 text-stone-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  title="Remove from cart"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* B2B Units / Cases Switcher (ONLY when product supports both) */}
              {supportsCases && (
                <div className="flex items-center justify-between bg-stone-50 rounded-xl p-1.5 border border-stone-200/80 text-xs">
                  <span className="text-[11px] font-bold text-stone-600 pl-1">
                    Order Packaging Mode:
                  </span>
                  <div className="flex items-center gap-1 bg-stone-200/70 p-0.5 rounded-lg">
                    <button
                      type="button"
                      onClick={() => !isCaseMode ? null : toggleItemPackagingMode(item.productId || item.id)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${
                        !isCaseMode
                          ? 'bg-white text-stone-950 shadow-2xs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Units ({item.unit})
                    </button>
                    <button
                      type="button"
                      onClick={() => isCaseMode ? null : toggleItemPackagingMode(item.productId || item.id)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${
                        isCaseMode
                          ? 'bg-[#0d1d25] text-amber-400 shadow-2xs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Full Cases ({caseQty}x)
                    </button>
                  </div>
                </div>
              )}

              {/* Quantity Stepper, Price & Subtotal */}
              <div className="flex items-center justify-between pt-1 border-t border-stone-100">
                {/* Stepper */}
                <div className="flex items-center bg-stone-100 rounded-xl p-0.5 border border-stone-200">
                  <button
                    type="button"
                    onClick={() => changeQty(item.productId || item.id, -1)}
                    className="w-7 h-7 flex items-center justify-center text-stone-700 hover:bg-stone-200 rounded-lg transition-colors"
                    title="Decrease"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-12 text-center">
                    <span className="font-black text-xs text-stone-900 block leading-tight">
                      {isCaseMode ? casesCount : itemQty}
                    </span>
                    <span className="text-[9px] text-stone-500 font-bold block leading-none">
                      {isCaseMode ? 'cases' : 'units'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => changeQty(item.productId || item.id, 1)}
                    disabled={itemQty >= (item.stockQuantity || 9999)}
                    className="w-7 h-7 flex items-center justify-center text-stone-700 hover:bg-stone-200 rounded-lg transition-colors disabled:opacity-30"
                    title="Increase"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Price, Discount & Subtotal breakdown */}
                <div className="text-right">
                  {/* B2B Pricing Source Badges */}
                  <div className="flex items-center justify-end gap-1 mb-1">
                    {item.isCustomerSpecific && (
                      <span className="text-[9px] font-black tracking-wide text-amber-900 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded shadow-2xs">
                        YOUR SPECIAL PRICE
                      </span>
                    )}
                    {item.activeSlab && !item.isCustomerSpecific && (
                      <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded">
                        SLAB: {item.activeSlab.minQuantity}{item.activeSlab.maxQuantity ? `–${item.activeSlab.maxQuantity}` : '+'} UNITS
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline justify-end gap-1.5 text-xs">
                    <span className="text-stone-500 text-[11px]">
                      Rate: <strong className="text-stone-900">₹{item.unitPrice}</strong>/unit
                    </span>
                    {discountPerUnit > 0 && (
                      <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1 py-0.2 rounded">
                        Save ₹{(discountPerUnit * itemQty).toFixed(0)}
                      </span>
                    )}
                  </div>

                  {/* Quantity slab notification indicator */}
                  {(item.pricingSource === 'CUSTOMER_SLAB' || item.pricingSource === 'GLOBAL_SLAB') && (
                    <div className="text-[9px] font-semibold text-emerald-700 mt-0.5">
                      Price updated based on quantity
                    </div>
                  )}

                  <div className="flex items-baseline justify-end gap-1 mt-0.5">
                    <span className="text-[10px] text-stone-400">Subtotal:</span>
                    <span className="text-sm font-black text-stone-950">
                      ₹{item.subtotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Cart Summary Section */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200/90 shadow-xs space-y-2.5 text-xs">
        <h3 className="font-black text-stone-900 uppercase tracking-wider text-[11px] pb-1 border-b border-stone-100">
          Cart Commercial Summary
        </h3>

        <div className="flex justify-between text-stone-600">
          <span>Product Subtotal</span>
          <span className="font-semibold text-stone-900">₹{subtotal.toFixed(2)}</span>
        </div>

        <div className="flex justify-between text-stone-600">
          <span className="flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>Wholesale Margin Discount</span>
          </span>
          <span className="font-bold text-emerald-700">- ₹{totalSavings.toFixed(2)}</span>
        </div>

        <div className="flex justify-between text-stone-600">
          <span>Additional Scheme Discount</span>
          <span className="font-semibold text-stone-500">₹0.00</span>
        </div>

        <div className="flex justify-between text-stone-600">
          <span>Delivery Charge</span>
          <span className={`font-bold ${deliveryFee === 0 ? 'text-emerald-700' : 'text-stone-900'}`}>
            {deliveryFee === 0 ? 'FREE' : `₹${deliveryFee.toFixed(2)}`}
          </span>
        </div>

        <div className="flex justify-between text-stone-600">
          <span>Taxes (GST Inclusive)</span>
          <span className="font-semibold text-stone-500">₹0.00</span>
        </div>

        <div className="pt-2.5 border-t border-stone-100 flex justify-between items-baseline text-stone-950">
          <div>
            <span className="text-sm font-black block leading-tight">Grand Total</span>
            <span className="text-[10px] text-stone-400">Single consolidated GST invoice</span>
          </div>
          <span className="text-xl font-black text-[#0d1d25]">
            ₹{grandTotal.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-3 bg-white/95 backdrop-blur-md border-t border-stone-200 z-30 max-w-lg mx-auto">
        {isMinOrderMet ? (
          <button
            type="button"
            onClick={() => navigate('Checkout')}
            className="w-full bg-[#0d1d25] hover:bg-stone-800 text-white font-black text-sm py-3.5 px-4 rounded-xl transition-all shadow-md flex items-center justify-between active:scale-98"
          >
            <div className="text-left">
              <span className="text-[10px] text-amber-400 uppercase tracking-wider block font-bold">
                {uniqueProductsCount} items • {totalQuantity} units
              </span>
              <span>₹{grandTotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-black">
              <span>PROCEED TO CHECKOUT</span>
              <ArrowRight className="w-4 h-4 text-amber-400" />
            </div>
          </button>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              disabled
              className="w-full bg-stone-200 text-stone-500 font-bold text-xs py-3 px-4 rounded-xl cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span>ADD ₹{remainingForMinOrder.toFixed(2)} MORE TO PLACE ORDER</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('Catalogue')}
              className="w-full bg-[#0d1d25] hover:bg-stone-800 text-amber-400 font-black text-xs py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs"
            >
              <span>CONTINUE SHOPPING</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
