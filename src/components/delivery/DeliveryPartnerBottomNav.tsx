import React from 'react';
import { useDelivery, DeliveryTab } from '../../context/DeliveryContext';
import { Home, Package, History, User } from 'lucide-react';

export const DeliveryPartnerBottomNav: React.FC = () => {
  const { currentTab, setCurrentTab, orders } = useDelivery();

  // Active deliveries are those not yet delivered or returned
  const activeDeliveriesCount = orders.filter(o => {
    const s = o.delivery?.assignmentStatus || o.status;
    return s === 'ASSIGNED' || s === 'ACCEPTED' || s === 'PICKED_UP' || s === 'OUT_FOR_DELIVERY';
  }).length;

  const tabs: { id: DeliveryTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: 'HOME', label: 'Home', icon: Home },
    {
      id: 'DELIVERIES',
      label: 'Deliveries',
      icon: Package,
      badge: activeDeliveriesCount > 0 ? activeDeliveriesCount : undefined,
    },
    { id: 'HISTORY', label: 'History', icon: History },
    { id: 'PROFILE', label: 'Profile', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-[#0d1d25] border-t border-stone-800 shadow-2xl safe-area-bottom">
      <div className="max-w-4xl mx-auto flex items-center justify-around px-2 py-1">
        {tabs.map(tab => {
          const isActive = currentTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCurrentTab(tab.id)}
              className={`flex-1 min-h-[52px] flex flex-col items-center justify-center relative py-1 px-2 transition-all cursor-pointer select-none rounded-lg ${
                isActive
                  ? 'text-[#f5b024]'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.4]' : 'stroke-[1.8]'}`} />
                {tab.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 bg-[#e72b2b] text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-[#0d1d25]">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className={`text-[11px] font-semibold mt-1 tracking-tight ${isActive ? 'font-bold text-[#f5b024]' : ''}`}>
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute bottom-0 w-8 h-0.5 bg-[#f5b024] rounded-t-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
