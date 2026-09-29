import React, { useState, useEffect } from 'react';
import { X, Check, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { ProductFilterOptions } from '../repositories/ProductRepository';
import { Category, Brand } from '../types/product';
import { categoryRepository, brandRepository } from '../repositories';

interface FilterBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  filters: ProductFilterOptions;
  onApply: (filters: ProductFilterOptions) => void;
  totalResultsCount?: number;
}

export default function FilterBottomSheet({
  isOpen,
  onClose,
  filters,
  onApply,
  totalResultsCount,
}: FilterBottomSheetProps) {
  // Local filter draft state
  const [draft, setDraft] = useState<ProductFilterOptions>(filters);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [activeTab, setActiveTab] = useState<'sort' | 'category' | 'brand' | 'price' | 'offers'>('sort');

  useEffect(() => {
    if (isOpen) {
      setDraft(filters);
      categoryRepository.getMainCategories().then(setCategories);
      brandRepository.getAll().then(setBrands);
    }
  }, [isOpen, filters]);

  // Update subcategories when category changes
  useEffect(() => {
    if (draft.category && draft.category !== 'All') {
      const selectedCat = categories.find(
        c => c.name.toLowerCase() === draft.category?.toLowerCase() || c.categoryId === draft.categoryId
      );
      if (selectedCat) {
        categoryRepository.getSubcategories(selectedCat.categoryId).then(setSubcategories);
      } else {
        setSubcategories([]);
      }
    } else {
      setSubcategories([]);
    }
  }, [draft.category, draft.categoryId, categories]);

  if (!isOpen) return null;

  const handleReset = () => {
    setDraft({
      category: 'All',
      categoryId: undefined,
      subcategory: undefined,
      subcategoryId: undefined,
      brand: undefined,
      brandId: undefined,
      brands: [],
      minPrice: undefined,
      maxPrice: undefined,
      inStockOnly: false,
      offersOnly: false,
      hotSellingOnly: false,
      sortBy: 'popular',
    });
  };

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  const toggleBrand = (brandName: string) => {
    const current = draft.brands || [];
    if (current.includes(brandName)) {
      setDraft({ ...draft, brands: current.filter(b => b !== brandName) });
    } else {
      setDraft({ ...draft, brands: [...current, brandName] });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        id="filter-bottom-sheet"
        className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-bold text-stone-900">Filters & Sorting</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="text-xs font-semibold text-stone-500 hover:text-stone-800 flex items-center gap-1 active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body: Left category tabs, right selection values */}
        <div className="flex-1 flex overflow-hidden min-h-[340px]">
          {/* Left Vertical Section Tabs */}
          <div className="w-1/3 bg-stone-50 border-r border-stone-200 overflow-y-auto py-2">
            {[
              { id: 'sort', label: 'Sort By' },
              { id: 'category', label: 'Category' },
              { id: 'brand', label: 'Brand' },
              { id: 'price', label: 'Price Range' },
              { id: 'offers', label: 'Offers & Stock' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full text-left px-4 py-3 text-xs font-bold transition-all relative ${
                  activeTab === tab.id
                    ? 'bg-white text-stone-900 border-l-4 border-amber-500'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Right Tab Content */}
          <div className="w-2/3 p-4 overflow-y-auto">
            {/* 1. SORT TAB */}
            {activeTab === 'sort' && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">
                  Sort Products By
                </h3>
                {[
                  { value: 'popular', label: 'Popularity (Fast Moving)' },
                  { value: 'newest', label: 'Newest Arrivals' },
                  { value: 'price-asc', label: 'Price: Low to High' },
                  { value: 'price-desc', label: 'Price: High to Low' },
                  { value: 'discount-desc', label: 'Discount: High to Low' },
                ].map(opt => (
                  <label
                    key={opt.value}
                    onClick={() => setDraft({ ...draft, sortBy: opt.value as any })}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                      draft.sortBy === opt.value
                        ? 'border-amber-500 bg-amber-50/50 text-stone-900'
                        : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {draft.sortBy === opt.value && (
                      <div className="w-4 h-4 rounded-full bg-amber-500 text-stone-950 flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </label>
                ))}
              </div>
            )}

            {/* 2. CATEGORY & SUBCATEGORY TAB */}
            {activeTab === 'category' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">
                    Primary Category
                  </h3>
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, category: 'All', subcategory: undefined })}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                        !draft.category || draft.category === 'All'
                          ? 'border-amber-500 bg-amber-50 text-stone-900'
                          : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      All Categories
                    </button>
                    {categories.map(c => (
                      <button
                        key={c.categoryId}
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            category: c.name,
                            categoryId: c.categoryId,
                            subcategory: undefined,
                            subcategoryId: undefined,
                          })
                        }
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center justify-between ${
                          draft.category?.toLowerCase() === c.name.toLowerCase()
                            ? 'border-amber-500 bg-amber-50 text-stone-900'
                            : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                        }`}
                      >
                        <span>{c.name}</span>
                        {draft.category?.toLowerCase() === c.name.toLowerCase() && (
                          <Check className="w-3.5 h-3.5 text-amber-600" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {subcategories.length > 0 && (
                  <div className="pt-2 border-t border-stone-200">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">
                      Subcategory
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {subcategories.map(sub => (
                        <button
                          key={sub.categoryId}
                          type="button"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              subcategory:
                                draft.subcategory === sub.name ? undefined : sub.name,
                              subcategoryId:
                                draft.subcategoryId === sub.categoryId ? undefined : sub.categoryId,
                            })
                          }
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            draft.subcategory === sub.name
                              ? 'bg-stone-900 text-white border-stone-900'
                              : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
                          }`}
                        >
                          {sub.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. BRAND TAB */}
            {activeTab === 'brand' && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">
                  Select FMCG Brands
                </h3>
                <div className="space-y-1.5">
                  {brands.map(b => {
                    const isSelected = (draft.brands || []).includes(b.brandName);
                    return (
                      <label
                        key={b.brandId}
                        onClick={() => toggleBrand(b.brandName)}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                          isSelected
                            ? 'border-amber-500 bg-amber-50/50 text-stone-900'
                            : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                        }`}
                      >
                        <span>{b.brandName}</span>
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-amber-500 border-amber-500 text-stone-950'
                              : 'border-stone-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. PRICE RANGE TAB */}
            {activeTab === 'price' && (
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">
                  Wholesale Price (₹)
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-stone-500 block mb-1">
                      Min Price
                    </label>
                    <input
                      type="number"
                      placeholder="0"
                      value={draft.minPrice ?? ''}
                      onChange={e =>
                        setDraft({
                          ...draft,
                          minPrice: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-bold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-stone-500 block mb-1">
                      Max Price
                    </label>
                    <input
                      type="number"
                      placeholder="5000"
                      value={draft.maxPrice ?? ''}
                      onChange={e =>
                        setDraft({
                          ...draft,
                          maxPrice: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="w-full px-3 py-2 border border-stone-200 rounded-xl text-xs font-bold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* Quick Price Shortcuts */}
                <div className="pt-2">
                  <span className="text-[11px] font-semibold text-stone-500 block mb-2">
                    Quick Filters
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: 'Under ₹50', max: 50 },
                      { label: '₹50 - ₹200', min: 50, max: 200 },
                      { label: '₹200 - ₹500', min: 200, max: 500 },
                      { label: 'Above ₹500', min: 500 },
                    ].map(p => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            minPrice: p.min,
                            maxPrice: p.max,
                          })
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 5. OFFERS & AVAILABILITY TAB */}
            {activeTab === 'offers' && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-2">
                  Stock & Deals
                </h3>

                <label
                  onClick={() => setDraft({ ...draft, inStockOnly: !draft.inStockOnly })}
                  className={`flex items-center justify-between p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                    draft.inStockOnly
                      ? 'border-amber-500 bg-amber-50 text-stone-900'
                      : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <div>
                    <p className="font-bold text-stone-900">In Stock Only</p>
                    <p className="text-[11px] text-stone-500">Hide out of stock items</p>
                  </div>
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center ${
                      draft.inStockOnly
                        ? 'bg-amber-500 border-amber-500 text-stone-950'
                        : 'border-stone-300 bg-white'
                    }`}
                  >
                    {draft.inStockOnly && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </label>

                <label
                  onClick={() => setDraft({ ...draft, offersOnly: !draft.offersOnly })}
                  className={`flex items-center justify-between p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                    draft.offersOnly
                      ? 'border-amber-500 bg-amber-50 text-stone-900'
                      : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <div>
                    <p className="font-bold text-stone-900">Offers & Deals</p>
                    <p className="text-[11px] text-stone-500">15%+ wholesale margins</p>
                  </div>
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center ${
                      draft.offersOnly
                        ? 'bg-amber-500 border-amber-500 text-stone-950'
                        : 'border-stone-300 bg-white'
                    }`}
                  >
                    {draft.offersOnly && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </label>

                <label
                  onClick={() => setDraft({ ...draft, hotSellingOnly: !draft.hotSellingOnly })}
                  className={`flex items-center justify-between p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                    draft.hotSellingOnly
                      ? 'border-amber-500 bg-amber-50 text-stone-900'
                      : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <div>
                    <p className="font-bold text-stone-900">Hot Selling FMCG</p>
                    <p className="text-[11px] text-stone-500">Fastest kirana store turnover</p>
                  </div>
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center ${
                      draft.hotSellingOnly
                        ? 'bg-amber-500 border-amber-500 text-stone-950'
                        : 'border-stone-300 bg-white'
                    }`}
                  >
                    {draft.hotSellingOnly && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white border-t border-stone-200 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl border border-stone-200 text-stone-700 font-bold text-xs hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex-2 py-2.5 px-4 rounded-xl bg-[#0d1d25] hover:bg-stone-800 text-white font-bold text-xs shadow-md active:scale-98 transition-all flex items-center justify-center gap-1.5"
          >
            <span>Apply Filters</span>
            {typeof totalResultsCount === 'number' && (
              <span className="bg-amber-400 text-stone-950 text-[10px] px-1.5 py-0.5 rounded font-black">
                {totalResultsCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
