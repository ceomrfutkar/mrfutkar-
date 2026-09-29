import React from 'react';
import { useApp } from '../context/AppContext';
import { categories, products } from '../data/products';
import {
  Cookie,
  Candy,
  Coffee,
  Sparkles,
  ShoppingBag,
  HeartHandshake,
  Home,
  Flame,
  ChevronRight,
} from 'lucide-react';

const categoryIcons: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  Namkeen: { icon: Flame, color: 'text-amber-700', bg: 'bg-amber-100' },
  Biscuits: { icon: Cookie, color: 'text-orange-700', bg: 'bg-orange-100' },
  Chocolates: { icon: Candy, color: 'text-rose-700', bg: 'bg-rose-100' },
  Toffees: { icon: Sparkles, color: 'text-purple-700', bg: 'bg-purple-100' },
  Snacks: { icon: ShoppingBag, color: 'text-yellow-700', bg: 'bg-yellow-100' },
  Beverages: { icon: Coffee, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  'Personal Care': { icon: HeartHandshake, color: 'text-cyan-700', bg: 'bg-cyan-100' },
  Household: { icon: Home, color: 'text-blue-700', bg: 'bg-blue-100' },
};

export default function CategoryScreen() {
  const { navigate } = useApp();
  const availableTotal = products.filter(p => p.inStock !== false && (p.stock === undefined || p.stock > 0)).length;

  return (
    <div className="space-y-4 pb-24">
      <div className="bg-white rounded-2xl p-4 border border-stone-200/80">
        <h2 className="text-xl font-black text-stone-900 tracking-tight">
          FMCG Categories
        </h2>
        <p className="text-stone-500 text-xs mt-1">
          Wholesale rates directly from authorized distributors & brand hubs
        </p>

        {/* Quick Filter for Available Products */}
        <button
          type="button"
          onClick={() => navigate('Products', { onlyAvailable: true })}
          className="mt-3 w-full bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 rounded-xl p-2.5 flex items-center justify-between text-left transition-all"
        >
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse"></span>
            <div>
              <span className="text-xs font-black text-emerald-950 block">
                Available Products for Immediate Dispatch
              </span>
              <span className="text-[11px] text-emerald-700">
                {availableTotal} items in stock at Jaipur North Central Hub
              </span>
            </div>
          </div>
          <span className="text-xs font-extrabold text-emerald-800 flex items-center">
            View <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
          </span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {categories.map(item => {
          const count = products.filter(p => p.category === item).length;
          const conf = categoryIcons[item] || {
            icon: ShoppingBag,
            color: 'text-stone-700',
            bg: 'bg-stone-100',
          };
          const Icon = conf.icon;

          return (
            <button
              key={item}
              type="button"
              onClick={() => navigate('Products', { category: item })}
              className="bg-white hover:bg-stone-50/80 border border-stone-200/90 rounded-2xl p-4 text-left flex flex-col justify-between min-h-[128px] shadow-xs active:scale-98 transition-all group relative overflow-hidden"
            >
              <div className="flex items-center justify-between w-full">
                <div className={`w-10 h-10 rounded-xl ${conf.bg} ${conf.color} flex items-center justify-center`}>
                  <Icon className="w-5 h-5" />
                </div>
                <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-stone-800 transition-colors" />
              </div>

              <div className="mt-3">
                <h3 className="text-sm font-bold text-stone-900 group-hover:text-stone-950">
                  {item}
                </h3>
                <p className="text-[11px] font-medium text-stone-500 mt-0.5">
                  {count > 0 ? `${count} items available` : 'Browse products'}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
