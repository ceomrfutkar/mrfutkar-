import React from 'react';
import { useApp } from '../context/AppContext';
import { Home, LayoutGrid, Package, User, ShoppingBag, ShoppingCart } from 'lucide-react';
import { TabScreen } from '../types/retailer';

export default function BottomTabs() {
  const { activeTab, switchTab, orders, cartCount, subtotal, navigate, activeScreen } = useApp();

  const activeOrdersCount = orders.filter(
    o => o.status === 'Confirmed' || o.status === 'Processing' || o.status === 'Out for Delivery'
  ).length;

  const tabs: { key: TabScreen; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'Home', label: 'Home', icon: Home },
    { key: 'Categories', label: 'Categories', icon: LayoutGrid },
    { key: 'Orders', label: 'Orders', icon: Package },
    { key: 'Cart', label: 'Cart', icon: ShoppingBag },
    { key: 'Profile', label: 'Profile', icon: User },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 max-w-md mx-auto w-full pointer-events-none">
      {/* Floating Cart Quick Bar (only if NOT currently on Cart tab and cart has items) */}
      {cartCount > 0 && activeScreen === 'Main' && activeTab !== 'Cart' && (
        <div className="px-3 mb-2 pointer-events-auto">
          <div
            onClick={() => switchTab('Cart')}
            className="bg-[#0d1d25] text-white rounded-2xl p-3 flex items-center justify-between shadow-xl cursor-pointer hover:bg-[#071319] transition-all border border-amber-500/30"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-400 text-stone-950 flex items-center justify-center font-black text-xs">
                {cartCount}
              </div>
              <div>
                <p className="text-xs font-semibold text-stone-300">
                  {cartCount} {cartCount === 1 ? 'item' : 'items'} in Wholesale Cart
                </p>
                <p className="text-sm font-black text-white">₹{subtotal.toFixed(2)}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-bold bg-[#d49b42] text-[#0d1d25] px-3 py-1.5 rounded-xl shadow-xs">
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>CHECKOUT</span>
            </div>
          </div>
        </div>
      )}

      {/* Main 5-Tab Bar */}
      <nav className="bg-white/95 backdrop-blur-md border-t border-stone-200/90 px-2 py-2 flex items-center justify-around shadow-lg pointer-events-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => switchTab(tab.key)}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all relative ${
                isActive ? 'text-[#0d1d25] font-black' : 'text-stone-400 hover:text-stone-600 font-medium'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5px] text-[#0d1d25]' : 'stroke-[1.8px]'}`} />

                {/* Orders active badge */}
                {tab.key === 'Orders' && activeOrdersCount > 0 && (
                  <span className="absolute -top-1 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-black flex items-center justify-center">
                    {activeOrdersCount}
                  </span>
                )}

                {/* Cart live item count badge */}
                {tab.key === 'Cart' && cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-black flex items-center justify-center shadow-xs">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </div>

              <span className={`text-[10px] mt-1 leading-none ${isActive ? 'font-black text-[#0d1d25]' : 'font-semibold'}`}>
                {tab.label}
              </span>

              {isActive && (
                <span className="w-1 h-1 rounded-full bg-amber-500 mt-0.5" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
