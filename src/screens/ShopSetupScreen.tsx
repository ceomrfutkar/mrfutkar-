import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Store, MapPin, Building, ArrowRight, ShieldCheck, Navigation, CheckCircle2, User, Phone, FileText } from 'lucide-react';
import { MR_THEME } from '../theme/theme';

export default function ShopSetupScreen() {
  const { profile, updateProfile, replace, switchTab } = useApp();

  // 7 Required / Optional Fields
  const [ownerName, setOwnerName] = useState(profile.ownerName || '');
  const [shopName, setShopName] = useState(profile.shopName || '');
  const [phone, setPhone] = useState(profile.phone || '9829012345');
  const [shopAddress, setShopAddress] = useState(profile.shopAddress || '');
  const [landmark, setLandmark] = useState(profile.landmark || '');
  const [city, setCity] = useState(profile.city || 'Jaipur');
  const [pincode, setPincode] = useState(profile.pincode || '302015');
  const [latitude, setLatitude] = useState<number | undefined>(profile.latitude);
  const [longitude, setLongitude] = useState<number | undefined>(profile.longitude);
  const [gstin, setGstin] = useState(profile.gstin || '');

  // Validation & UI State
  const [error, setError] = useState('');
  const [locationStatus, setLocationStatus] = useState<'idle' | 'detecting' | 'detected' | 'fallback'>(
    profile.latitude && profile.longitude ? 'detected' : 'idle'
  );

  // Architectural Location Permission Support (one-time getCurrentPosition only)
  const handleDetectLocation = () => {
    setLocationStatus('detecting');
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          if (
            typeof lat === 'number' &&
            Number.isFinite(lat) &&
            lat >= -90 &&
            lat <= 90 &&
            typeof lng === 'number' &&
            Number.isFinite(lng) &&
            lng >= -180 &&
            lng <= 180
          ) {
            setLatitude(lat);
            setLongitude(lng);
            setLocationStatus('detected');
          } else {
            setLocationStatus('fallback');
            setError('Invalid coordinates returned by device GPS.');
          }
        },
        (_err) => {
          setLocationStatus('fallback');
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    } else {
      setLocationStatus('fallback');
    }
  };

  const handleContinue = () => {
    // Validation
    if (!ownerName.trim()) {
      setError('Please enter Owner Name');
      return;
    }
    if (!shopName.trim()) {
      setError('Please enter Shop / Business Name');
      return;
    }
    if (!phone.trim() || phone.replace(/\D/g, '').length !== 10) {
      setError('Please enter a valid 10-digit Mobile Number');
      return;
    }
    if (!shopAddress.trim()) {
      setError('Please enter Shop Address for wholesale delivery');
      return;
    }
    if (!city.trim()) {
      setError('Please enter City');
      return;
    }
    if (!pincode.trim() || pincode.replace(/\D/g, '').length !== 6) {
      setError('Please enter a valid 6-digit Pincode');
      return;
    }

    setError('');

    // Save profile and mark as complete with real coordinates
    updateProfile({
      ownerName: ownerName.trim(),
      shopName: shopName.trim(),
      phone: phone.trim(),
      shopAddress: shopAddress.trim(),
      landmark: landmark.trim() || undefined,
      city: city.trim(),
      pincode: pincode.trim(),
      latitude: typeof latitude === 'number' ? latitude : undefined,
      longitude: typeof longitude === 'number' ? longitude : undefined,
      gstin: gstin.trim().toUpperCase(),
      nearestWarehouse: 'MR FUTKAR — BRAHMPURI',
      isProfileComplete: true,
    });

    replace('Main');
    switchTab('Home');
  };

  return (
    <div className="min-h-[85vh] px-4 sm:px-5 py-4 max-w-md mx-auto w-full flex flex-col justify-between">
      <div>
        {/* Header Badge */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-11 h-11 bg-[#0d1d25] text-amber-400 rounded-2xl flex items-center justify-center shadow-sm">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-stone-950 tracking-tight leading-tight">
              Retailer Registration
            </h1>
            <p className="text-stone-500 text-xs font-semibold">
              {MR_THEME.brand.companyName}
            </p>
          </div>
        </div>

        <p className="text-stone-500 text-xs mb-4 leading-relaxed bg-stone-50 p-3 rounded-xl border border-stone-200">
          Register your Kirana or retail store to unlock direct distributor pricing, bulk MOQ discounts, and doorstep FMCG deliveries.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200">
            {error}
          </div>
        )}

        <div className="space-y-3.5">
          {/* 1. Owner Name */}
          <div>
            <label className="block text-xs font-black text-stone-700 mb-1 uppercase tracking-wider">
              Owner Name <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <User className="w-4 h-4 text-stone-400 absolute left-3" />
              <input
                type="text"
                placeholder="e.g. Ramesh Kumar Gupta"
                value={ownerName}
                onChange={e => setOwnerName(e.target.value)}
                className="w-full bg-white border border-stone-300 rounded-xl pl-9 pr-3.5 py-2.5 text-sm font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#0d1d25]"
              />
            </div>
          </div>

          {/* 2. Shop Name */}
          <div>
            <label className="block text-xs font-black text-stone-700 mb-1 uppercase tracking-wider">
              Shop Name <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <Store className="w-4 h-4 text-stone-400 absolute left-3" />
              <input
                type="text"
                placeholder="e.g. Shree Krishna Kirana Store"
                value={shopName}
                onChange={e => setShopName(e.target.value)}
                className="w-full bg-white border border-stone-300 rounded-xl pl-9 pr-3.5 py-2.5 text-sm font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#0d1d25]"
              />
            </div>
          </div>

          {/* 3. Mobile Number */}
          <div>
            <label className="block text-xs font-black text-stone-700 mb-1 uppercase tracking-wider">
              Mobile Number <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-xs font-bold text-stone-500">
                +91
              </span>
              <input
                type="tel"
                maxLength={10}
                placeholder="10-digit number"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-white border border-stone-300 rounded-xl pl-11 pr-3.5 py-2.5 text-sm font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#0d1d25]"
              />
            </div>
          </div>

          {/* 4. Shop Address & Location Auto-detect */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-black text-stone-700 uppercase tracking-wider">
                Shop Address <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleDetectLocation}
                className="text-[11px] font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1 cursor-pointer"
                title="Detect shop coordinates via browser/device GPS"
              >
                <Navigation className="w-3 h-3 text-amber-600" />
                <span>
                  {locationStatus === 'detecting'
                    ? 'Detecting...'
                    : typeof latitude === 'number' && typeof longitude === 'number'
                    ? `✓ ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
                    : 'Use Current Location'}
                </span>
              </button>
            </div>
            <textarea
              placeholder="Shop #, Market / Gali, Building, Main Road"
              value={shopAddress}
              onChange={e => setShopAddress(e.target.value)}
              rows={2}
              className="w-full bg-white border border-stone-300 rounded-xl px-3.5 py-2 text-sm font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#0d1d25] resize-none"
            />
          </div>

          {/* Landmark Field */}
          <div>
            <label className="block text-xs font-black text-stone-700 mb-1 uppercase tracking-wider">
              Landmark <span className="text-stone-400 font-normal">(Optional)</span>
            </label>
            <div className="relative flex items-center">
              <MapPin className="w-4 h-4 text-stone-400 absolute left-3" />
              <input
                type="text"
                placeholder="e.g. Near Shiv Mandir, Opposite State Bank"
                value={landmark}
                onChange={e => setLandmark(e.target.value)}
                className="w-full bg-white border border-stone-300 rounded-xl pl-9 pr-3.5 py-2.5 text-sm font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#0d1d25]"
              />
            </div>
          </div>

          {/* 5. City & 6. Pincode */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-stone-700 mb-1 uppercase tracking-wider">
                City <span className="text-red-500">*</span>
              </label>
              <div className="relative flex items-center">
                <Building className="w-4 h-4 text-stone-400 absolute left-3" />
                <input
                  type="text"
                  placeholder="e.g. Jaipur"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  className="w-full bg-white border border-stone-300 rounded-xl pl-9 pr-3 py-2.5 text-sm font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#0d1d25]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-stone-700 mb-1 uppercase tracking-wider">
                Pincode <span className="text-red-500">*</span>
              </label>
              <div className="relative flex items-center">
                <MapPin className="w-4 h-4 text-stone-400 absolute left-3" />
                <input
                  type="text"
                  maxLength={6}
                  placeholder="302015"
                  value={pincode}
                  onChange={e => setPincode(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-white border border-stone-300 rounded-xl pl-9 pr-3 py-2.5 text-sm font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#0d1d25]"
                />
              </div>
            </div>
          </div>

          {/* 7. GST Number - Optional */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-black text-stone-700 uppercase tracking-wider">
                GST Number
              </label>
              <span className="text-[10px] font-bold text-stone-400 uppercase">
                Optional
              </span>
            </div>
            <div className="relative flex items-center">
              <FileText className="w-4 h-4 text-stone-400 absolute left-3" />
              <input
                type="text"
                maxLength={15}
                placeholder="e.g. 08ABCDE1234F1Z5"
                value={gstin}
                onChange={e => setGstin(e.target.value.toUpperCase())}
                className="w-full bg-white border border-stone-300 rounded-xl pl-9 pr-3 py-2.5 text-sm font-mono font-bold text-stone-900 uppercase focus:outline-none focus:ring-2 focus:ring-[#0d1d25]"
              />
            </div>
            <p className="text-[11px] text-stone-400 mt-1">
              If GST is provided, tax invoice with input credit is issued automatically.
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="pt-6 pb-2">
        <button
          type="button"
          onClick={handleContinue}
          className="w-full bg-[#0d1d25] hover:bg-[#071319] text-white font-black text-sm py-3.5 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 active:scale-98"
        >
          <span>CONTINUE</span>
          <ArrowRight className="w-4 h-4 text-amber-400" />
        </button>
      </div>
    </div>
  );
}
