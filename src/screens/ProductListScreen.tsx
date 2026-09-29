import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Product } from '../types/product';
import { productRepository, ProductFilterOptions } from '../repositories/ProductRepository';
import { categoryRepository } from '../repositories/CategoryRepository';
import ProductCard from '../components/ProductCard';
import FilterBottomSheet from '../components/FilterBottomSheet';
import {
  Search,
  X,
  SlidersHorizontal,
  LayoutGrid,
  List as ListIcon,
  PackageCheck,
  Tag,
  Clock,
  ArrowUpDown,
  Flame,
} from 'lucide-react';

const RECENT_SEARCHES_KEY = 'mrfutkar_recent_searches';

export default function ProductListScreen() {
  const { screenParams } = useApp();

  // View mode: Grid vs List
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Products state loaded from ProductRepository
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState(screenParams.category === 'All' ? '' : '');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
      return saved ? JSON.parse(saved) : ['Parle', 'Haldiram', 'Soap', 'Biscuit', 'Namkeen'];
    } catch {
      return ['Parle', 'Haldiram', 'Soap', 'Biscuit', 'Namkeen'];
    }
  });

  // Filter bottom sheet state
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState<ProductFilterOptions>({
    category: screenParams.category || 'All',
    inStockOnly: screenParams.onlyAvailable || false,
    sortBy: 'popular',
  });

  // Top category navigation tabs
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  // Search input reference
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load top categories
  useEffect(() => {
    categoryRepository.getMainCategories().then(cats => {
      setCategories([{ id: 'all', name: 'All' }, ...cats.map(c => ({ id: c.categoryId, name: c.name }))]);
    });
  }, []);

  // Sync incoming screenParams (e.g. if user tapped category on Home screen)
  useEffect(() => {
    if (screenParams.category) {
      setFilters(prev => ({
        ...prev,
        category: screenParams.category,
      }));
    }
    if (typeof screenParams.onlyAvailable === 'boolean') {
      setFilters(prev => ({
        ...prev,
        inStockOnly: screenParams.onlyAvailable,
      }));
    }
  }, [screenParams.category, screenParams.onlyAvailable]);

  // Query repository on filter or search changes
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);

    const queryParams: ProductFilterOptions = {
      ...filters,
      searchQuery: searchQuery.trim(),
    };

    productRepository.searchAndFilter(queryParams).then(result => {
      if (!isCancelled) {
        setProducts(result);
        setLoading(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [filters, searchQuery]);

  // Autocomplete suggestions
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      productRepository.getSuggestions(searchQuery, 5).then(setSuggestions);
    } else {
      setSuggestions([]);
    }
  }, [searchQuery]);

  const handleSearchSubmit = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setSearchQuery(trimmed);
    setIsSearchFocused(false);

    // Update recent searches
    setRecentSearches(prev => {
      const next = [trimmed, ...prev.filter(x => x.toLowerCase() !== trimmed.toLowerCase())].slice(0, 8);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {
      // ignore
    }
  };

  const removeFilterTag = (key: keyof ProductFilterOptions, value?: any) => {
    setFilters(prev => {
      const next = { ...prev };
      if (key === 'category') {
        next.category = 'All';
        next.categoryId = undefined;
        next.subcategory = undefined;
        next.subcategoryId = undefined;
      } else if (key === 'subcategory') {
        next.subcategory = undefined;
        next.subcategoryId = undefined;
      } else if (key === 'brands' && value) {
        next.brands = (next.brands || []).filter(b => b !== value);
      } else if (key === 'brand') {
        next.brand = undefined;
        next.brandId = undefined;
      } else if (key === 'inStockOnly') {
        next.inStockOnly = false;
      } else if (key === 'offersOnly') {
        next.offersOnly = false;
      } else if (key === 'hotSellingOnly') {
        next.hotSellingOnly = false;
      } else if (key === 'minPrice' || key === 'maxPrice') {
        next.minPrice = undefined;
        next.maxPrice = undefined;
      }
      return next;
    });
  };

  const resetAllFilters = () => {
    setFilters({
      category: 'All',
      categoryId: undefined,
      subcategory: undefined,
      subcategoryId: undefined,
      brand: undefined,
      brands: [],
      minPrice: undefined,
      maxPrice: undefined,
      inStockOnly: false,
      offersOnly: false,
      hotSellingOnly: false,
      sortBy: 'popular',
    });
    setSearchQuery('');
  };

  // Calculate active filter count
  const activeFilterCount =
    (filters.category && filters.category !== 'All' ? 1 : 0) +
    (filters.subcategory ? 1 : 0) +
    (filters.brand ? 1 : 0) +
    (filters.brands?.length || 0) +
    (filters.inStockOnly ? 1 : 0) +
    (filters.offersOnly ? 1 : 0) +
    (filters.hotSellingOnly ? 1 : 0) +
    (filters.minPrice !== undefined || filters.maxPrice !== undefined ? 1 : 0) +
    (filters.sortBy && filters.sortBy !== 'popular' ? 1 : 0);

  return (
    <div id="product-list-screen" className="space-y-3.5 pb-24">
      {/* Top Search & Controls Container */}
      <div className="bg-white rounded-2xl p-3 border border-stone-200 shadow-xs space-y-2.5 relative">
        {/* Search Input Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                handleSearchSubmit(searchQuery);
              }
            }}
            placeholder="Search FMCG by Name, Brand, SKU, Barcode, Category..."
            className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-10 pr-9 py-2 text-xs sm:text-sm font-medium text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
              className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-700 p-0.5"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Autocomplete Suggestions & Recent Searches Dropdown */}
          {isSearchFocused && (
            <>
              {/* Backdrop dismiss */}
              <div
                className="fixed inset-0 z-30 bg-transparent"
                onClick={() => setIsSearchFocused(false)}
              />
              <div className="absolute left-0 right-0 top-11 bg-white border border-stone-200 rounded-2xl shadow-xl z-40 p-3 space-y-3 overflow-hidden animate-in fade-in duration-150">
                {/* Suggestions */}
                {suggestions.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1.5 flex items-center gap-1">
                      <Search className="w-3 h-3 text-amber-500" />
                      Suggestions
                    </div>
                    <div className="divide-y divide-stone-100">
                      {suggestions.map(s => (
                        <button
                          key={s}
                          type="button"
                          onMouseDown={() => handleSearchSubmit(s)}
                          className="w-full text-left py-2 px-1 text-xs font-semibold text-stone-800 hover:text-amber-600 hover:bg-stone-50 flex items-center justify-between"
                        >
                          <span>{s}</span>
                          <span className="text-[10px] text-stone-400">Search</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Searches */}
                {recentSearches.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-stone-400" />
                        Recent Searches
                      </span>
                      <button
                        type="button"
                        onMouseDown={clearRecentSearches}
                        className="text-stone-400 hover:text-stone-700 normal-case"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {recentSearches.map(term => (
                        <button
                          key={term}
                          type="button"
                          onMouseDown={() => handleSearchSubmit(term)}
                          className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-amber-100 hover:text-amber-900 text-stone-700 text-xs font-medium transition-colors"
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Action Toolbar: Filter Button, Quick Toggle, View Mode Switch */}
        <div className="flex items-center justify-between pt-1 border-t border-stone-100 gap-2">
          {/* Filter Bottom Sheet Trigger */}
          <button
            type="button"
            onClick={() => setIsFilterOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              activeFilterCount > 0
                ? 'bg-amber-400 border-amber-500 text-stone-950 shadow-xs'
                : 'bg-stone-100 hover:bg-stone-200 border-stone-200 text-stone-700'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="bg-stone-950 text-amber-400 text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-black">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* In Stock Quick Pill */}
          <button
            type="button"
            onClick={() => setFilters(prev => ({ ...prev, inStockOnly: !prev.inStockOnly }))}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              filters.inStockOnly
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
            }`}
          >
            <PackageCheck className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">In Stock Only</span>
            <span className="xs:hidden">Stock</span>
          </button>

          {/* Offers Quick Pill */}
          <button
            type="button"
            onClick={() => setFilters(prev => ({ ...prev, offersOnly: !prev.offersOnly }))}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              filters.offersOnly
                ? 'bg-amber-600 border-amber-600 text-white'
                : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Deals</span>
          </button>

          {/* View Mode Toggle (Grid vs List) */}
          <div className="flex items-center bg-stone-100 rounded-xl p-0.5 border border-stone-200 ml-auto shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'grid'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-400 hover:text-stone-700'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'list'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-400 hover:text-stone-700'
              }`}
              title="List View"
            >
              <ListIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Category Horizontal Scrollable Chips */}
        <div className="flex gap-1.5 overflow-x-auto pt-1 pb-0.5 scrollbar-none">
          {categories.map(c => {
            const isSelected =
              (!filters.category && c.name === 'All') ||
              filters.category?.toLowerCase() === c.name.toLowerCase();
            return (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  setFilters(prev => ({
                    ...prev,
                    category: c.name,
                    subcategory: undefined,
                  }))
                }
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  isSelected
                    ? 'bg-[#0d1d25] text-white shadow-xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Filter Badges Bar */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wide shrink-0">
            Active:
          </span>

          {filters.category && filters.category !== 'All' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 text-stone-800 text-[11px] font-semibold border border-stone-200 shrink-0">
              Cat: {filters.category}
              <button type="button" onClick={() => removeFilterTag('category')}>
                <X className="w-3 h-3 text-stone-400 hover:text-stone-700" />
              </button>
            </span>
          )}

          {filters.subcategory && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 text-stone-800 text-[11px] font-semibold border border-stone-200 shrink-0">
              Sub: {filters.subcategory}
              <button type="button" onClick={() => removeFilterTag('subcategory')}>
                <X className="w-3 h-3 text-stone-400 hover:text-stone-700" />
              </button>
            </span>
          )}

          {filters.brands &&
            filters.brands.map(b => (
              <span
                key={b}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 text-stone-800 text-[11px] font-semibold border border-stone-200 shrink-0"
              >
                Brand: {b}
                <button type="button" onClick={() => removeFilterTag('brands', b)}>
                  <X className="w-3 h-3 text-stone-400 hover:text-stone-700" />
                </button>
              </span>
            ))}

          {filters.inStockOnly && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[11px] font-semibold border border-emerald-200 shrink-0">
              In Stock Only
              <button type="button" onClick={() => removeFilterTag('inStockOnly')}>
                <X className="w-3 h-3 text-emerald-600 hover:text-emerald-900" />
              </button>
            </span>
          )}

          {filters.offersOnly && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[11px] font-semibold border border-amber-200 shrink-0">
              Deals Only
              <button type="button" onClick={() => removeFilterTag('offersOnly')}>
                <X className="w-3 h-3 text-amber-600 hover:text-amber-900" />
              </button>
            </span>
          )}

          {filters.sortBy && filters.sortBy !== 'popular' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-100 text-stone-800 text-[11px] font-semibold border border-stone-200 shrink-0">
              Sort: {filters.sortBy}
            </span>
          )}

          <button
            type="button"
            onClick={resetAllFilters}
            className="text-[11px] font-bold text-amber-600 hover:text-amber-800 underline shrink-0 ml-1"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Results Header & Summary */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold text-stone-600">
          {loading ? 'Searching catalogue...' : `Showing ${products.length} wholesale FMCG products`}
        </span>
        <div className="flex items-center gap-1 text-xs text-stone-500">
          <ArrowUpDown className="w-3 h-3 text-stone-400" />
          <select
            value={filters.sortBy || 'popular'}
            onChange={e => setFilters({ ...filters, sortBy: e.target.value as any })}
            aria-label="Sort catalogue by"
            className="bg-transparent font-bold text-stone-800 border-none focus:outline-none cursor-pointer text-xs"
          >
            <option value="popular">Popularity</option>
            <option value="newest">Newest</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="discount-desc">Margin %: High to Low</option>
          </select>
        </div>
      </div>

      {/* Main Catalogue Product View (Grid or List) */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-stone-200 animate-pulse">
          <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin mx-auto mb-3" />
          <p className="text-stone-600 font-bold text-sm">Loading MR FUTKAR Catalogue...</p>
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-stone-200">
          <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 mx-auto mb-3">
            <Search className="w-6 h-6" />
          </div>
          <p className="text-stone-900 font-black text-base">No FMCG products found</p>
          <p className="text-stone-500 text-xs mt-1 max-w-sm mx-auto">
            {searchQuery
              ? `We couldn't find any products matching "${searchQuery}". Check spelling or try a brand name.`
              : 'No products match your currently active filters.'}
          </p>
          <div className="flex items-center justify-center gap-2 mt-5">
            <button
              type="button"
              onClick={resetAllFilters}
              className="bg-[#0d1d25] hover:bg-stone-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs transition-all"
            >
              Reset Filters & Search
            </button>
          </div>
        </div>
      ) : viewMode === 'list' ? (
        <div className="flex flex-col gap-2.5">
          {products.map(p => (
            <ProductCard key={p.productId || p.id} product={p} viewMode="list" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
          {products.map(p => (
            <ProductCard key={p.productId || p.id} product={p} viewMode="grid" />
          ))}
        </div>
      )}

      {/* Filter Bottom Sheet Modal */}
      <FilterBottomSheet
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        onApply={newFilters => setFilters(newFilters)}
        totalResultsCount={products.length}
      />
    </div>
  );
}
