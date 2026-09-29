import React from 'react';
import { Product } from '../types/product';
import { useApp } from '../context/AppContext';
import { Plus, Minus, Layers, AlertCircle } from 'lucide-react';

interface ProductCardProps {
  p?: Product;
  product?: Product;
  onPress?: () => void;
  viewMode?: 'grid' | 'list';
}

export default function ProductCard({
  p: propP,
  product: propProduct,
  onPress,
  viewMode = 'grid',
}: ProductCardProps) {
  const p = propProduct || propP;
  if (!p) return null;

  const { addToCart, changeQty, cart, navigate } = useApp();
  const productId = p.productId || p.id;
  const cartItem = cart.find(x => x.id === productId || x.productId === productId);

  const discountPercent = p.discountPercent ?? (p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0);
  const discountAmount = p.discountAmount ?? Math.max(0, p.mrp - p.price);
  const stockQty = p.stockQuantity ?? p.stock ?? 0;
  const isOutOfStock = !p.isInStock || p.inStock === false || stockQty <= 0;
  const isLowStock = !isOutOfStock && stockQty <= (p.lowStockThreshold || 20);

  const handleCardClick = () => {
    if (onPress) {
      onPress();
    } else {
      navigate('ProductDetail', { id: productId });
    }
  };

  const packSize = p.packSize || p.unit;
  const caseQty = p.caseQuantity || 1;
  const moq = p.minimumOrderQuantity || p.moq || 1;

  // Primary image resolution (Phase 3B-2B IMG-30)
  const primaryImage =
    p.images?.find(img => img.isPrimary)?.url ||
    (p.images && p.images.length > 0 ? p.images[0].url : null) ||
    p.imageUrl ||
    p.image ||
    '/logo.jpg';

  // ==================== LIST VIEW ====================
  if (viewMode === 'list') {
    return (
      <div
        id={`product-card-list-${productId}`}
        className={`bg-white rounded-2xl border p-3 flex items-center gap-3.5 shadow-xs hover:shadow-md transition-all duration-200 group relative ${
          isOutOfStock ? 'border-stone-200/60 opacity-80' : 'border-stone-200/80'
        }`}
      >
        {/* Left Thumbnail */}
        <div
          onClick={handleCardClick}
          className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-stone-100 overflow-hidden relative shrink-0 cursor-pointer flex items-center justify-center"
        >
          <img
            src={primaryImage}
            alt={p.productName || p.name}
            referrerPolicy="no-referrer"
            className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${
              isOutOfStock ? 'grayscale-[50%]' : ''
            }`}
            loading="lazy"
          />
          {discountPercent > 0 && !isOutOfStock && (
            <span className="absolute top-1 left-1 bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow-xs">
              {discountPercent}% MARGIN
            </span>
          )}
        </div>

        {/* Middle Info Block */}
        <div onClick={handleCardClick} className="flex-1 min-w-0 cursor-pointer">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-wider uppercase text-stone-500 truncate">
              {p.brandName || p.brand} • {p.categoryName || p.category}
            </span>
          </div>

          <h3 className="text-xs sm:text-sm font-bold text-stone-900 line-clamp-1 mt-0.5">
            {p.productName || p.name}
          </h3>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-stone-500 mt-1">
            <span className="font-semibold text-stone-700 bg-stone-100 px-1.5 py-0.2 rounded">
              Pack: {packSize}
            </span>
            {caseQty > 1 && (
              <span className="text-stone-500 text-[10px]">
                Case: {caseQty} units
              </span>
            )}
            {moq > 1 && (
              <span className="text-stone-500 text-[10px]">
                MOQ: {moq}
              </span>
            )}
          </div>

          {/* Pricing Row with Margin Indicator */}
          <div className="flex items-baseline gap-2 mt-1.5">
            <span className="text-base font-black text-stone-950">
              ₹{p.sellingPrice ?? p.price}
            </span>
            {p.mrp > (p.sellingPrice ?? p.price) && (
              <span className="text-xs text-stone-400 line-through">
                ₹{p.mrp}
              </span>
            )}
            {discountAmount > 0 && (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                Save ₹{discountAmount}
              </span>
            )}
          </div>

          {/* Stock Tag */}
          <div className="mt-1">
            {isOutOfStock ? (
              <span className="text-[10px] font-bold text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">
                Currently unavailable
              </span>
            ) : isLowStock ? (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                Only {stockQty} available
              </span>
            ) : (
              <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                In Stock ({stockQty})
              </span>
            )}
          </div>
        </div>

        {/* Right Action Block */}
        <div className="shrink-0 flex flex-col items-end justify-center w-24">
          {isOutOfStock ? (
            <button
              type="button"
              disabled
              className="w-full bg-stone-100 text-stone-400 font-bold text-[11px] py-2 px-2 rounded-xl cursor-not-allowed text-center border border-stone-200"
            >
              Unavailable
            </button>
          ) : cartItem ? (
            <div className="flex items-center justify-between w-full bg-[#0d1d25] text-white rounded-xl px-1.5 py-1 shadow-xs">
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  changeQty(productId, -1);
                }}
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-stone-800 active:scale-90 transition-all text-white"
                title="Decrease quantity"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="font-bold text-xs text-center px-1">
                {cartItem.quantity || cartItem.qty}
              </span>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  changeQty(productId, 1);
                }}
                disabled={cartItem.quantity >= stockQty}
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-stone-800 active:scale-90 transition-all text-white disabled:opacity-40"
                title="Increase quantity"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                addToCart(p, moq);
              }}
              className="w-full flex items-center justify-center gap-1 bg-[#0d1d25] hover:bg-stone-800 text-white font-bold text-xs py-2 px-2.5 rounded-xl active:scale-98 transition-all shadow-xs"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span>ADD {moq > 1 ? `(${moq})` : ''}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // ==================== GRID VIEW ====================
  return (
    <div
      id={`product-card-${productId}`}
      className={`bg-white rounded-2xl border p-3 flex flex-col justify-between shadow-xs hover:shadow-md transition-all duration-200 group relative ${
        isOutOfStock ? 'border-stone-200/60 opacity-80' : 'border-stone-200/80'
      }`}
    >
      {/* Margin / Discount badge */}
      {discountPercent > 0 && !isOutOfStock && (
        <span className="absolute top-2 left-2 z-10 bg-emerald-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-md shadow-xs">
          {discountPercent}% MARGIN
        </span>
      )}

      {/* Out of stock badge */}
      {isOutOfStock && (
        <span className="absolute top-2 left-2 z-10 bg-stone-800 text-stone-200 text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow-xs">
          Currently unavailable
        </span>
      )}

      {/* Image & Click Area */}
      <div
        onClick={handleCardClick}
        className="cursor-pointer flex flex-col items-stretch"
      >
        <div className="w-full h-28 sm:h-36 rounded-xl bg-stone-100 overflow-hidden relative flex items-center justify-center">
          <img
            src={primaryImage}
            alt={p.productName || p.name}
            referrerPolicy="no-referrer"
            className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${
              isOutOfStock ? 'grayscale-[50%]' : ''
            }`}
            loading="lazy"
          />
          {(p.isHotSelling || p.hotSelling) && !isOutOfStock && (
            <span className="absolute bottom-1 right-1 bg-amber-400 text-stone-900 text-[9px] font-black px-1.5 py-0.5 rounded shadow-xs">
              HOT
            </span>
          )}
        </div>

        {/* Brand & Stock Status */}
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] font-bold tracking-wide uppercase text-stone-500 truncate max-w-[65%]">
            {p.brandName || p.brand}
          </span>
          {isOutOfStock ? (
            <span className="text-[10px] font-bold text-stone-400">
              Unavailable
            </span>
          ) : isLowStock ? (
            <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-200">
              Only {stockQty} left
            </span>
          ) : (
            <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              In Stock
            </span>
          )}
        </div>

        {/* Product Name */}
        <h3 className="text-xs sm:text-sm font-bold text-stone-900 line-clamp-2 mt-0.5 leading-snug min-h-[34px]">
          {p.productName || p.name}
        </h3>

        {/* Pack Size & Case Info */}
        <div className="flex items-center gap-1.5 text-[11px] text-stone-500 mt-1">
          <span className="font-semibold text-stone-700 bg-stone-100 px-1.5 py-0.2 rounded text-[10px]">
            {packSize}
          </span>
          {caseQty > 1 && (
            <span className="text-stone-400 text-[10px] truncate">
              • Case: {caseQty}
            </span>
          )}
        </div>

        {/* Wholesale Price & MRP Row */}
        <div className="flex items-baseline gap-1.5 mt-2">
          <span className="text-base sm:text-lg font-black text-stone-950">
            ₹{p.sellingPrice ?? p.price}
          </span>
          {p.mrp > (p.sellingPrice ?? p.price) && (
            <span className="text-xs text-stone-400 line-through">
              ₹{p.mrp}
            </span>
          )}
        </div>
      </div>

      {/* Action / Stepper Container */}
      <div className="mt-2.5 pt-2 border-t border-stone-100">
        {isOutOfStock ? (
          <button
            type="button"
            disabled
            className="w-full bg-stone-100 text-stone-400 font-bold text-xs py-2 px-2 rounded-xl h-9 cursor-not-allowed text-center border border-stone-200"
          >
            Currently unavailable
          </button>
        ) : cartItem ? (
          <div className="flex items-center justify-between bg-[#0d1d25] text-white rounded-xl px-2 py-1 h-9 shadow-xs">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                changeQty(productId, -1);
              }}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-stone-800 active:scale-90 transition-all text-white"
              title="Decrease quantity"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="font-bold text-xs sm:text-sm text-center px-1">
              {cartItem.quantity || cartItem.qty}
            </span>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                changeQty(productId, 1);
              }}
              disabled={cartItem.quantity >= stockQty}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-stone-800 active:scale-90 transition-all text-white disabled:opacity-40"
              title="Increase quantity"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              addToCart(p, moq);
            }}
            className="w-full flex items-center justify-center gap-1.5 bg-[#0d1d25] hover:bg-stone-800 text-white font-bold text-xs py-2 px-3 rounded-xl active:scale-98 transition-all shadow-xs h-9"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>ADD {moq > 1 ? `(${moq})` : ''}</span>
          </button>
        )}
      </div>
    </div>
  );
}
