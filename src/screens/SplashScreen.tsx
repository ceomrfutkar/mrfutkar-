import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import BrandLogo from '../components/BrandLogo';
import { MR_THEME } from '../theme/theme';
import { ArrowRight, Sparkles } from 'lucide-react';

export default function SplashScreen() {
  const { isLoggedIn, profile, replace, switchTab } = useApp();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Smooth progress bar animation
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 10;
      });
    }, 110);

    // Auto navigate after progress completes
    const timer = setTimeout(() => {
      proceed();
    }, 1300);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, []);

  const proceed = () => {
    if (isLoggedIn) {
      if (profile.isProfileComplete === false || !profile.shopName) {
        replace('ShopSetup');
      } else {
        replace('Main');
        switchTab('Home');
      }
    } else {
      replace('Login');
    }
  };

  return (
    <div
      onClick={proceed}
      className="min-h-screen bg-[#0d1d25] flex flex-col justify-between items-center p-6 text-white cursor-pointer relative overflow-hidden select-none"
    >
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-0 w-60 h-60 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Wholesale Badge */}
      <div className="pt-8 z-10">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] font-bold tracking-wider text-amber-300 uppercase">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>Direct B2B FMCG Wholesaler</span>
        </div>
      </div>

      {/* Center Hero: Logo & Official Brand Tagline */}
      <div className="flex flex-col items-center justify-center max-w-sm w-full text-center z-10 my-auto">
        <div className="w-full max-w-[280px] aspect-[16/9] relative flex items-center justify-center mb-2 drop-shadow-2xl">
          <img
            src="/logo.jpg"
            alt="MR FUTKAR"
            className="w-full h-full object-contain"
          />
        </div>

        {/* User Required Tagline */}
        <div className="mt-4 px-4 py-2 rounded-2xl bg-amber-500/10 border border-amber-400/25">
          <p className="text-amber-400 font-black text-base sm:text-lg tracking-tight leading-snug">
            "Order Thoda Ho Ya Jyada,
            <br />
            Achhi Seva Ka Hai Wada"
          </p>
        </div>

        {/* Company Entity Name */}
        <div className="mt-4 bg-[#d49b42] text-[#0d1d25] py-2 px-5 rounded-xl font-black text-xs sm:text-sm tracking-widest uppercase shadow-md">
          {MR_THEME.brand.companyName}
        </div>
      </div>

      {/* Bottom Loading Progress & Tap to Enter */}
      <div className="w-full max-w-xs z-10 pb-6 flex flex-col items-center gap-3">
        <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-gradient-to-r from-amber-400 via-amber-500 to-red-500 h-full rounded-full transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between w-full text-[11px] text-stone-400 font-semibold px-1">
          <span>Connecting to Kirana Hub...</span>
          <span className="text-amber-400 font-mono font-bold">{progress}%</span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            proceed();
          }}
          className="mt-2 text-xs font-bold text-stone-300 hover:text-white flex items-center gap-1 transition-colors"
        >
          <span>Tap anywhere to continue</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
