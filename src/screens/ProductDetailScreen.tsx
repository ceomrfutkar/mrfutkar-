import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Product } from '../types/product';
import { productRepository } from '../repositories/ProductRepository';
import { PricingEngine } from '../services/pricingEngine';
import ProductCard from '../components/ProductCard';
import {
  Plus,
  Minus,
  ShoppingCart,
  Truck,
  ShieldCheck,
  Tag,
  Layers,
  ArrowLeft,
  CheckCircle2,
  Box,
  Barcode,
  Sparkles,
  Gift,
  AlertTriangle,
} from 'lucide-react';

export default function ProductDetailScreen() {
  const { screenParams, addToCart, addCasesToCart, navigate, goBack, cart, profile, customerPricingRules } = useApp();

  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [orderUnitMode, setOrderUnitMode] = useState<'units' | 'cases'>('units');
  const [casesCount, setCasesCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // Load product from repository
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setSelectedImageIndex(0);

    const productId = screenParams.id || 'p-parle-g-800';
    productRepository.getById(productId).then(found => {
      if (!isCancelled) {
        if (found) {
          setProduct(found);
          const initialQty = found.minimumOrderQuantity || 1;
          setQuantity(initialQty);

          productRepository.getRelatedProducts(found, 4).then(related => {
            if (!isCancelled) setRelatedProducts(related);
          });
        }
        setLoading(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [screenParams.id]);

  if (loading || !product) {
    return (
      <div className="bg-white rounded-3xl p-12 text-center border border-stone-200">
        <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin mx-auto mb-3" />
        <p className="text-stone-600 font-bold text-sm">Loading Product Details...</p>
      </div>
    );
  }

  const p = product;
  const productId = p.productId || p.id;
  const stockQty = p.stockQuantity ?? p.stock ?? 0;
  const isOutOfStock = !p.isInStock || p.inStock === false || stockQty <= 0;
  const isLowStock = !isOutOfStock && stockQty <= (p.lowStockThreshold || 20);
  const caseQty = p.caseQuantity || 1;
  const moq = p.minimumOrderQuantity || p.moq || 1;

  // Calculate pricing breakdown using PricingEngine with customer-specific rules
  const effectiveUnits = orderUnitMode === 'cases' ? casesCount * caseQty : quantity;
  const pricing = PricingEngine.getPricingBreakdown(
    p,
    effectiveUnits,
    profile?.retailerId,
    customerPricingRules
  );
  const discountAmount = Math.max(0, p.mrp - pricing.unitPrice);
  const discountPercent = p.mrp > 0 ? Math.round((discountAmount / p.mrp) * 100) : 0;

  const handleAddToCart = () => {
    if (isOutOfStock) return;
    if (orderUnitMode === 'cases') {
      addCasesToCart(p, casesCount);
    } else {
      addToCart(p, quantity);
    }
    navigate('Cart');
  };

  const handleUnitQuantityChange = (newQty: number) => {
    const clamped = Math.max(moq, Math.min(newQty, stockQty));
    setQuantity(clamped);
  };

  const handleCasesQuantityChange = (newCases: number) => {
    const maxCases = Math.floor(stockQty / caseQty) || 1;
    const clamped = Math.max(1, Math.min(newCases, maxCases));
    setCasesCount(clamped);
  };

  return (
    <div id={`product-detail-${productId}`} className="space-y-4 pb-28 max-w-lg mx-auto">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-1.5 text-xs font-bold text-stone-600 hover:text-stone-900 bg-white border border-stone-200 px-3 py-1.5 rounded-xl shadow-xs transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Catalogue</span>
        </button>

        <span className="text-[11px] font-mono text-stone-500 bg-stone-100 px-2 py-1 rounded-lg">
          SKU: {p.sku}
        </span>
      </div>

      {/* Main Image & Hero Card with Gallery (Phase 3B-2B IMG-29) */}
      {(() => {
        const galleryImages = p.images && p.images.length > 0
          ? [...p.images].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          : [{ imageId: 'default', url: p.imageUrl || p.image || '/logo.jpg', isPrimary: true, sortOrder: 0, storagePath: '', createdAt: '' }];
        const activeImg = galleryImages[selectedImageIndex] || galleryImages[0];

        return (
          <div className="bg-white rounded-3xl p-4 border border-stone-200/90 shadow-xs relative overflow-hidden">
            <div className="w-full h-64 sm:h-72 rounded-2xl bg-stone-100 overflow-hidden flex items-center justify-center relative group">
              <img
                src={activeImg.url}
                alt={activeImg.altText || p.productName || p.name}
                referrerPolicy="no-referrer"
                className={`w-full h-full object-cover transition-all duration-300 ${isOutOfStock ? 'grayscale-[50%]' : ''}`}
              />
              {discountPercent > 0 && !isOutOfStock && (
                <span className="absolute top-3 left-3 bg-emerald-600 text-white text-xs font-black px-2.5 py-1 rounded-xl shadow-xs z-10">
                  {discountPercent}% WHOLESALE MARGIN
                </span>
              )}
              {p.isHotSelling && !isOutOfStock && (
                <span className="absolute top-3 right-3 bg-amber-400 text-stone-950 text-xs font-black px-2.5 py-1 rounded-xl shadow-xs z-10">
                  TOP KIRANA SELLER
                </span>
              )}
              {galleryImages.length > 1 && (
                <span className="absolute bottom-3 right-3 bg-stone-900/75 backdrop-blur-xs text-white text-[11px] font-bold px-2.5 py-1 rounded-lg z-10">
                  {selectedImageIndex + 1} / {galleryImages.length}
                </span>
              )}
            </div>

            {/* Thumbnail Gallery Strip */}
            {galleryImages.length > 1 && (
              <div className="flex items-center gap-2 mt-3 overflow-x-auto pb-1.5 scrollbar-thin">
                {galleryImages.map((img, idx) => (
                  <button
                    type="button"
                    key={img.imageId || idx}
                    onClick={() => setSelectedImageIndex(idx)}
                    className={`relative w-14 h-14 rounded-xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                      selectedImageIndex === idx
                        ? 'border-amber-500 scale-105 shadow-xs'
                        : 'border-stone-200 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={img.url}
                      alt={img.altText || `View ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {img.isPrimary && (
                      <span className="absolute bottom-0 inset-x-0 bg-amber-500 text-stone-950 text-[8px] font-black uppercase text-center py-0.5 leading-none">
                        Main
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Brand & Title */}
            <div className="mt-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600">
              {p.brandName || p.brand} • {p.categoryName || p.category}
            </span>
            {p.barcode && (
              <span className="text-[10px] font-mono text-stone-400 flex items-center gap-1">
                <Barcode className="w-3.5 h-3.5" />
                {p.barcode}
              </span>
            )}
          </div>

          <h1 className="text-lg sm:text-xl font-black text-stone-900 mt-1 leading-snug">
            {p.productName || p.name}
          </h1>

          {/* Pricing Highlight */}
          <div className="flex flex-wrap items-baseline gap-2.5 mt-3">
            <span className="text-2xl sm:text-3xl font-black text-stone-950">
              ₹{pricing.unitPrice}
            </span>
            <span className="text-xs text-stone-500 font-semibold">per {p.unit || 'Pack'}</span>
            {p.mrp > pricing.unitPrice && (
              <span className="text-sm text-stone-400 line-through">
                MRP: ₹{p.mrp}
              </span>
            )}
            {discountAmount > 0 && (
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Save ₹{discountAmount} ({discountPercent}%)
              </span>
            )}
            {pricing.isCustomerSpecific && (
              <span className="text-xs font-black text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-xl shadow-2xs">
                YOUR SPECIAL PRICE
              </span>
            )}
          </div>

          {/* Stock Availability Badge */}
          <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-stone-600">
              <Box className="w-4 h-4 text-stone-400" />
              <span>
                Pack: <strong>{p.packSize || p.unit}</strong> • MOQ: <strong>{moq} units</strong>
              </span>
            </div>

            {isOutOfStock ? (
              <span className="text-xs font-extrabold text-stone-600 bg-stone-100 px-2.5 py-1 rounded-lg border border-stone-300">
                Currently unavailable
              </span>
            ) : isLowStock ? (
              <span className="text-xs font-extrabold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                Only {stockQty} available
              </span>
            ) : (
              <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                In Stock ({stockQty} units ready)
              </span>
            )}
          </div>
        </div>
      </div>
    );
  })()}

      {/* Case Calculation Helper & Case Ordering Toggle */}
      <div className="bg-stone-900 text-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
              B2B Case Wholesale Ordering
            </h3>
          </div>
          <span className="text-xs font-bold text-stone-300 bg-stone-800 px-2.5 py-0.5 rounded-lg border border-stone-700">
            1 Case = {caseQty} {p.unit || 'Units'}
          </span>
        </div>

        <p className="text-xs text-stone-300 leading-relaxed mb-3">
          Wholesale cases are shipped in factory-sealed cartons directly from our Jaipur North Central Hub.
        </p>

        {/* Toggle between Units mode and Cases mode */}
        <div className="grid grid-cols-2 gap-2 bg-stone-800 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setOrderUnitMode('units')}
            className={`py-2 text-xs font-bold rounded-lg transition-all ${
              orderUnitMode === 'units'
                ? 'bg-amber-400 text-stone-950 shadow-xs'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            Order in Units ({p.unit || 'Packs'})
          </button>
          <button
            type="button"
            onClick={() => setOrderUnitMode('cases')}
            className={`py-2 text-xs font-bold rounded-lg transition-all ${
              orderUnitMode === 'cases'
                ? 'bg-amber-400 text-stone-950 shadow-xs'
                : 'text-stone-400 hover:text-white'
            }`}
          >
            Order Full Cases ({caseQty}x)
          </button>
        </div>

        {/* Case Calculator live preview */}
        {orderUnitMode === 'cases' && (
          <div className="mt-3 pt-3 border-t border-stone-800 flex items-center justify-between text-xs">
            <span className="text-stone-300">
              Selected: <strong className="text-amber-400">{casesCount} Case(s)</strong> = {casesCount * caseQty} Units
            </span>
            <span className="text-amber-300 font-bold">
              Total: ₹{(pricing.unitPrice * casesCount * caseQty).toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* Customer-Specific Fixed Price Banner */}
      {pricing.pricingSource === 'CUSTOMER_FIXED' && (
        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-300">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 bg-amber-200 px-2 py-0.5 rounded">
              Your Special B2B Price
            </span>
          </div>
          <p className="text-xs text-amber-950 font-medium leading-relaxed">
            Your negotiated Kirana special rate of <strong>₹{pricing.unitPrice}</strong> applies to every unit regardless of volume.
          </p>
        </div>
      )}

      {/* Tiered Slab Pricing Table (Dynamic with highlight on active tier) */}
      {((pricing.applicableSlabs && pricing.applicableSlabs.length > 0) || (p.priceSlabs && p.priceSlabs.length > 0)) && (
        <div className="bg-white rounded-2xl p-4 border border-stone-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800">
                {pricing.pricingSource === 'CUSTOMER_SLAB'
                  ? 'Your Negotiated Volume Slab Pricing'
                  : 'Quantity Volume Slab Pricing'}
              </h3>
            </div>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              Auto-applied in cart
            </span>
          </div>

          <div className="overflow-hidden border border-stone-200 rounded-xl mt-2">
            <table className="w-full text-xs text-left">
              <thead className="bg-stone-100 text-stone-600 uppercase font-bold text-[10px]">
                <tr>
                  <th className="py-2 px-3">Order Quantity</th>
                  <th className="py-2 px-3">Wholesale Rate</th>
                  <th className="py-2 px-3">Margin %</th>
                  <th className="py-2 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {/* Base price tier */}
                {pricing.pricingSource !== 'CUSTOMER_SLAB' && (
                  <tr className={effectiveUnits < ((pricing.applicableSlabs || p.priceSlabs || [])[0]?.minQuantity || 999) ? 'bg-amber-50 font-bold' : ''}>
                    <td className="py-2 px-3">{moq} - {((pricing.applicableSlabs || p.priceSlabs || [])[0]?.minQuantity || 10) - 1} units</td>
                    <td className="py-2 px-3">₹{p.sellingPrice}</td>
                    <td className="py-2 px-3 text-emerald-700">{p.discountPercent}%</td>
                    <td className="py-2 px-3 text-right">
                      {effectiveUnits < ((pricing.applicableSlabs || p.priceSlabs || [])[0]?.minQuantity || 999) ? (
                        <span className="text-[10px] font-black text-amber-800 bg-amber-200/80 px-1.5 py-0.5 rounded">
                          ACTIVE
                        </span>
                      ) : (
                        <span className="text-[10px] text-stone-400">Available</span>
                      )}
                    </td>
                  </tr>
                )}

                {/* Slabs */}
                {(pricing.applicableSlabs || p.priceSlabs || []).map((slab, idx) => {
                  const isActive =
                    effectiveUnits >= slab.minQuantity &&
                    (!slab.maxQuantity || effectiveUnits <= slab.maxQuantity);

                  const slabRate = slab.unitPrice ?? slab.price ?? slab.slabPrice ?? 0;
                  const slabDiscount =
                    slab.discountPercent ??
                    (p.mrp > slabRate ? Math.round(((p.mrp - slabRate) / p.mrp) * 100) : 0);

                  return (
                    <tr
                      key={idx}
                      className={isActive ? 'bg-emerald-50 font-bold text-emerald-950' : 'text-stone-700'}
                    >
                      <td className="py-2 px-3">
                        {slab.minQuantity}
                        {slab.maxQuantity ? ` - ${slab.maxQuantity}` : '+'} units
                      </td>
                      <td className="py-2 px-3">₹{slabRate}</td>
                      <td className="py-2 px-3 text-emerald-700">{slabDiscount}%</td>
                      <td className="py-2 px-3 text-right">
                        {isActive ? (
                          <span className="text-[10px] font-black text-emerald-800 bg-emerald-200 px-1.5 py-0.5 rounded">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="text-[10px] text-stone-400">Available</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trade Schemes & Promotional Offers */}
      <div className="bg-amber-50/80 rounded-2xl p-4 border border-amber-200">
        <div className="flex items-center gap-2 text-stone-900 font-bold text-xs mb-1.5">
          <Gift className="w-4 h-4 text-amber-600" />
          <span>Kirana Schemes & Trade Offers</span>
        </div>
        <div className="space-y-1.5 text-xs text-stone-700">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              {p.schemeDescription || 'Special Kirana Promo: Buy 10 Cases get 1 Case FREE at invoice time.'}
            </span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span>Extra 1% cash discount on UPI / Instant NetBanking payment.</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            <span>7-day credit available for verified GSTIN retailers.</span>
          </div>
        </div>
      </div>

      {/* Product Specification & FMCG Metadata */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200 text-xs space-y-2">
        <h3 className="font-bold text-stone-900">Product Specifications</h3>
        <p className="text-stone-600 leading-relaxed">{p.description}</p>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-100 text-[11px]">
          <div>
            <span className="text-stone-400 block">Category</span>
            <span className="font-bold text-stone-800">{p.categoryName || p.category}</span>
          </div>
          <div>
            <span className="text-stone-400 block">Subcategory</span>
            <span className="font-bold text-stone-800">{p.subcategoryName || 'General FMCG'}</span>
          </div>
          <div>
            <span className="text-stone-400 block">Pack Weight/Size</span>
            <span className="font-bold text-stone-800">{p.packSize || p.unit}</span>
          </div>
          <div>
            <span className="text-stone-400 block">Case Packaging</span>
            <span className="font-bold text-stone-800">{caseQty} units / master box</span>
          </div>
          <div>
            <span className="text-stone-400 block">FMCG Barcode</span>
            <span className="font-mono font-bold text-stone-800">{p.barcode}</span>
          </div>
          <div>
            <span className="text-stone-400 block">Hub Dispatch</span>
            <span className="font-bold text-emerald-700">Jaipur North Central Hub</span>
          </div>
        </div>
      </div>

      {/* Assurance badges */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-white p-3 rounded-xl border border-stone-200 flex items-center gap-2">
          <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="text-stone-700 font-medium">Free 4-Hour Delivery</span>
        </div>
        <div className="bg-white p-3 rounded-xl border border-stone-200 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-stone-700 font-medium">100% Genuine FMCG</span>
        </div>
      </div>

      {/* Related Products from Same Category or Brand */}
      {relatedProducts.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700">
              Related FMCG Products
            </h3>
            <button
              type="button"
              onClick={() => navigate('Catalogue', { category: p.categoryName || p.category })}
              className="text-[11px] font-bold text-amber-600 hover:text-amber-800"
            >
              View All
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {relatedProducts.slice(0, 2).map(item => (
              <ProductCard key={item.productId || item.id} product={item} viewMode="grid" />
            ))}
          </div>
        </div>
      )}

      {/* Bottom Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200 p-3 shadow-lg max-w-lg mx-auto">
        <div className="flex items-center gap-3">
          {/* Quantity Stepper */}
          {!isOutOfStock && (
            <div className="flex items-center bg-stone-100 rounded-xl p-1 shrink-0 border border-stone-200">
              <button
                type="button"
                onClick={() =>
                  orderUnitMode === 'cases'
                    ? handleCasesQuantityChange(casesCount - 1)
                    : handleUnitQuantityChange(quantity - 1)
                }
                className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-700 hover:bg-stone-200 transition-colors"
                title="Decrease"
              >
                <Minus className="w-4 h-4" />
              </button>
              <div className="w-12 text-center">
                <span className="font-black text-sm text-stone-900 block leading-none">
                  {orderUnitMode === 'cases' ? casesCount : quantity}
                </span>
                <span className="text-[9px] text-stone-500 font-semibold block leading-tight">
                  {orderUnitMode === 'cases' ? 'cases' : 'units'}
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  orderUnitMode === 'cases'
                    ? handleCasesQuantityChange(casesCount + 1)
                    : handleUnitQuantityChange(quantity + 1)
                }
                className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-700 hover:bg-stone-200 transition-colors"
                title="Increase"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Add to Cart button */}
          {!isOutOfStock ? (
            <button
              type="button"
              onClick={handleAddToCart}
              className="flex-1 bg-[#0d1d25] hover:bg-stone-800 text-white font-black text-xs sm:text-sm py-3 px-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 active:scale-98"
            >
              <ShoppingCart className="w-4 h-4 text-amber-400" />
              <span>
                ADD {effectiveUnits} UNITS • ₹{pricing.subtotal.toFixed(2)}
              </span>
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="flex-1 bg-stone-200 text-stone-500 font-bold text-xs sm:text-sm py-3 px-3 rounded-xl cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span>CURRENTLY UNAVAILABLE</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
