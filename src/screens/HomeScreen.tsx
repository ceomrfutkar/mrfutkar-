import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { categories, products } from '../data/products';
import ProductCard from '../components/ProductCard';
import {
  Search,
  Sparkles,
  Flame,
  Tag,
  RotateCcw,
  Clock,
  ThumbsUp,
  LayoutGrid,
  ShoppingBag,
  MapPin,
  ArrowRight,
  X,
  Store,
  ChevronRight,
  Truck,
  ShieldCheck,
} from 'lucide-react';
import { MR_THEME } from '../theme/theme';
import BrandLogo from '../components/BrandLogo';

export default function HomeScreen() {
  const { navigate, profile, cartCount, switchTab } = useApp();
  const [searchQuery, setSearchQuery] = useState('');

  // Slices for each requested section
  const dealsProducts = products.filter(p => p.deal);
  const hotSellingProducts = products.filter(p => p.hotSelling);
  const buyAgainProducts = products.filter(p => p.recentOrder || p.popular).slice(0, 4);
  const recentlyOrderedProducts = products.filter(p => p.recentOrder).slice(0, 4);
  const recommendedProducts = products.filter(p => p.recommended || (p.marginPercent && p.marginPercent >= 12));

  // Search results
  const searchResults = searchQuery.trim()
    ? products.filter(
        p =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const categoryIcons: Record<string, string> = {
    Biscuits: '🍪',
    Namkeen: '🥨',
    Chocolates: '🍫',
    Toffees: '🍬',
    Snacks: '🍿',
    Beverages: '🧃',
    Grocery: '🌾',
    'Personal Care': '🧼',
    Household: '🧴',
  };

  return (
    <div className="space-y-5 pb-28">
      {/* 1. Retailer Home Header */}
      <div className="bg-white rounded-3xl p-4 border border-stone-200/90 shadow-xs">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#0d1d25] text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20">
              <Store className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black text-amber-600 uppercase tracking-wide bg-amber-50 px-1.5 py-0.2 rounded">
                  {MR_THEME.brand.name}
                </span>
                <span className="text-xs font-black text-stone-900 truncate">
                  {profile.shopName || 'Kirana Store'}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-stone-500 font-semibold truncate mt-0.5">
                <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                <span className="truncate">
                  {profile.city || 'Jaipur'} • {profile.nearestWarehouse || 'Jaipur Hub #1'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Cart Button with Live Badge */}
          <button
            type="button"
            onClick={() => switchTab('Cart')}
            className="relative p-2.5 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-800 transition-all flex items-center justify-center shrink-0"
            aria-label="Open Cart"
          >
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-600 text-white font-black text-[10px] w-5 h-5 rounded-full flex items-center justify-center shadow-xs">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Search Bar: "Search products, brands or categories" */}
        <div className="relative mt-3">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search products, brands or categories"
            className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-10 pr-9 py-2.5 text-sm font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#0d1d25] focus:bg-white transition-all placeholder:text-stone-400"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-3 text-stone-400 hover:text-stone-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* SEARCH RESULTS VIEW (if search is active) */}
      {searchQuery.trim() && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-black text-stone-900">
              Search Results for "{searchQuery}"
            </h3>
            <span className="text-xs font-bold text-stone-500">
              {searchResults.length} {searchResults.length === 1 ? 'item' : 'items'} found
            </span>
          </div>

          {searchResults.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {searchResults.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-8 text-center border border-stone-200">
              <p className="text-stone-500 text-sm font-semibold">
                No wholesale products found matching "{searchQuery}"
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-3 text-xs font-bold text-amber-700 hover:underline"
              >
                Clear Search
              </button>
            </div>
          )}
        </div>
      )}

      {/* HOME PAGE SECTIONS (when not searching) */}
      {!searchQuery.trim() && (
        <>
          {/* G. PROMOTIONAL BANNER */}
          <div className="bg-[#0d1d25] text-white rounded-3xl p-5 shadow-md relative overflow-hidden border border-amber-500/20">
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1">
                <div className="inline-flex items-center gap-1.5 bg-amber-400/15 text-amber-400 text-[10px] font-black px-2.5 py-0.5 rounded-md mb-2 border border-amber-400/30 uppercase tracking-wider">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>Wholesale FMCG Partner</span>
                </div>
                <h3 className="text-lg sm:text-xl font-black text-white leading-tight">
                  {MR_THEME.brand.tagline}
                </h3>
                <p className="text-stone-300 text-xs mt-1.5 max-w-[290px] leading-relaxed">
                  Consolidated multi-brand FMCG order • Single GST invoice • Fast 4-hour local warehouse dispatch.
                </p>

                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/10 text-[11px] text-stone-300">
                  <span className="flex items-center gap-1 font-bold">
                    <Truck className="w-3.5 h-3.5 text-emerald-400" /> Free Delivery &gt; ₹500
                  </span>
                  <span className="flex items-center gap-1 font-bold">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> 100% Brand Direct
                  </span>
                </div>
              </div>

              <div className="w-28 h-20 sm:w-32 sm:h-24 shrink-0 rounded-2xl bg-[#071319] p-1.5 border border-amber-500/20 flex items-center justify-center self-end sm:self-auto shadow-inner">
                <img
                  src="/logo.jpg"
                  alt="MR FUTKAR Logo"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          </div>

          {/* C. SHOP BY CATEGORY */}
          <div>
            <div className="flex items-center justify-between mb-2.5 px-1">
              <div className="flex items-center gap-1.5">
                <LayoutGrid className="w-4 h-4 text-stone-700" />
                <h3 className="text-sm font-black text-stone-900 tracking-tight">
                  Shop by Category
                </h3>
              </div>
              <button
                type="button"
                onClick={() => switchTab('Categories')}
                className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-0.5"
              >
                <span>All Categories</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {categories.slice(0, 8).map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => navigate('Products', { category: cat })}
                  className="bg-white hover:bg-amber-50/50 p-2.5 rounded-2xl border border-stone-200/80 flex flex-col items-center justify-center text-center transition-all hover:border-amber-400 active:scale-95 shadow-xs"
                >
                  <span className="text-2xl mb-1">{categoryIcons[cat] || '📦'}</span>
                  <span className="text-[11px] font-black text-stone-800 leading-tight truncate w-full">
                    {cat}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* A. TODAY'S DEALS */}
          <div>
            <div className="flex items-center justify-between mb-2.5 px-1">
              <div className="flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-red-600" />
                <h3 className="text-sm font-black text-stone-900 tracking-tight">
                  Today's Deals
                </h3>
                <span className="text-[10px] font-extrabold bg-red-100 text-red-700 px-2 py-0.5 rounded-md uppercase">
                  Extra Margin
                </span>
              </div>
              <button
                type="button"
                onClick={() => navigate('Products')}
                className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-0.5"
              >
                <span>View All</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {dealsProducts.slice(0, 4).map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>

          {/* B. HOT SELLING PRODUCTS */}
          <div>
            <div className="flex items-center justify-between mb-2.5 px-1">
              <div className="flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-black text-stone-900 tracking-tight">
                  Hot Selling Products
                </h3>
                <span className="text-[10px] font-extrabold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md uppercase">
                  Fast Moving
                </span>
              </div>
              <button
                type="button"
                onClick={() => navigate('Products')}
                className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-0.5"
              >
                <span>View All</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {hotSellingProducts.slice(0, 4).map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>

          {/* D. BUY AGAIN */}
          <div>
            <div className="flex items-center justify-between mb-2.5 px-1">
              <div className="flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-black text-stone-900 tracking-tight">
                  Buy Again
                </h3>
                <span className="text-[10px] font-bold text-stone-500">
                  Quick Reorder
                </span>
              </div>
              <button
                type="button"
                onClick={() => switchTab('Orders')}
                className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-0.5"
              >
                <span>Order History</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {buyAgainProducts.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>

          {/* E. RECENTLY ORDERED */}
          <div>
            <div className="flex items-center justify-between mb-2.5 px-1">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-black text-stone-900 tracking-tight">
                  Recently Ordered
                </h3>
              </div>
              <button
                type="button"
                onClick={() => switchTab('Orders')}
                className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-0.5"
              >
                <span>Track Orders</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {recentlyOrderedProducts.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>

          {/* F. RECOMMENDED PRODUCTS */}
          <div>
            <div className="flex items-center justify-between mb-2.5 px-1">
              <div className="flex items-center gap-1.5">
                <ThumbsUp className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-black text-stone-900 tracking-tight">
                  Recommended Products
                </h3>
                <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md uppercase">
                  High Margin
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {recommendedProducts.slice(0, 4).map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>

          {/* Corporate Footer Note */}
          <div className="pt-2 text-center text-xs text-stone-400">
            <p className="font-bold">{MR_THEME.brand.companyName}</p>
            <p className="text-[11px] mt-0.5">Direct Wholesale Kirana Procurement System</p>
          </div>
        </>
      )}
    </div>
  );
}
