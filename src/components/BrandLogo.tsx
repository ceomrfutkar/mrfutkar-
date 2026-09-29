import React, { useState } from 'react';

interface BrandLogoProps {
  variant?: 'full' | 'header' | 'compact' | 'card';
  className?: string;
  showTagline?: boolean;
  showCorporate?: boolean;
}

export default function BrandLogo({
  variant = 'header',
  className = '',
  showTagline = true,
  showCorporate = true,
}: BrandLogoProps) {
  const [imageError, setImageError] = useState(false);

  // Variant: Header (compact for navigation bar)
  if (variant === 'header') {
    return (
      <div className={`flex items-center gap-2.5 ${className}`}>
        {/* Cart Icon / Mini Logo */}
        <div className="relative w-10 h-10 rounded-xl bg-[#0d1d25] flex items-center justify-center p-1 overflow-hidden shrink-0 shadow-xs border border-amber-900/30">
          {!imageError ? (
            <img
              src="/logo.jpg"
              alt="MR FUTKAR"
              onError={() => setImageError(true)}
              className="w-full h-full object-contain scale-110"
            />
          ) : (
            <div className="text-center leading-none">
              <span className="text-[9px] font-black text-amber-400 block">MR</span>
              <span className="text-[10px] font-black text-red-500 block">FUTKAR</span>
            </div>
          )}
        </div>

        {/* Brand Text & Tagline */}
        <div className="leading-tight">
          <div className="flex items-baseline gap-1">
            <span className="text-amber-500 font-black text-sm tracking-wide">MR</span>
            <span className="text-red-600 font-black text-base tracking-tight font-sans">FUTKAR</span>
          </div>
          <p className="text-[10px] font-bold text-amber-600/90 tracking-tight -mt-0.5">
            When you grow ! We grow !!
          </p>
        </div>
      </div>
    );
  }

  // Variant: Card / Banner (for Login & Profile & Success)
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-[#0d1d25] text-white p-4 sm:p-5 shadow-lg border border-amber-500/20 ${className}`}
    >
      {/* Official Company Logo Image */}
      <div className="flex flex-col items-center justify-center text-center">
        <div className="w-full max-w-[260px] aspect-[16/9] relative flex items-center justify-center mb-1">
          <img
            src="/logo.jpg"
            alt="MR FUTKAR Logo - When you grow ! We grow !!"
            onError={() => setImageError(true)}
            className="w-full h-full object-contain rounded-lg"
          />
        </div>

        {showTagline && (
          <p className="text-amber-400 text-xs sm:text-sm font-black tracking-wider uppercase mt-1">
            When you grow ! We grow !!
          </p>
        )}

        {showCorporate && (
          <div className="mt-3 w-full bg-[#d49b42] text-[#0d1d25] py-1.5 px-4 rounded-xl font-black text-xs sm:text-sm tracking-wider uppercase text-center shadow-inner">
            MRFUTKAR INDIA PRIVATE LIMITED
          </div>
        )}
      </div>
    </div>
  );
}
