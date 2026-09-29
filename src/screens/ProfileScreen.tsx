import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import BrandLogo from '../components/BrandLogo';
import { RetailerLedgerModal } from '../components/RetailerLedgerModal';
import { CustomerProfilePhotoService } from '../services/customerProfilePhotoService';
import { CustomerLocationService } from '../services/customerLocationService';
import { AuthService } from '../services/authService';
import {
  Store,
  MapPin,
  Warehouse,
  Bell,
  MessageSquare,
  Settings,
  ChevronRight,
  ShieldCheck,
  LogOut,
  Code2,
  Check,
  HelpCircle,
  ExternalLink,
  ReceiptText,
  Camera,
  Image as ImageIcon,
  Trash2,
  Loader2,
  X,
  AlertCircle,
  Navigation,
  Compass,
  CheckCircle2,
} from 'lucide-react';

export default function ProfileScreen() {
  const { profile, updateProfile, logout, setShowCodeModal } = useApp();
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);

  // Profile Photo Management State
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoUploadProgress, setPhotoUploadProgress] = useState(0);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoSuccess, setPhotoSuccess] = useState<string | null>(null);

  // Shop Location Management State (Phase 6 Part 2)
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [locAddressLine1, setLocAddressLine1] = useState('');
  const [locAddressLine2, setLocAddressLine2] = useState('');
  const [locLandmark, setLocLandmark] = useState('');
  const [locArea, setLocArea] = useState('');
  const [locCity, setLocCity] = useState('');
  const [locState, setLocState] = useState('');
  const [locPincode, setLocPincode] = useState('');
  const [locLatitude, setLocLatitude] = useState('');
  const [locLongitude, setLocLongitude] = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationSuccess, setLocationSuccess] = useState<string | null>(null);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [deviceLocationNotice, setDeviceLocationNotice] = useState<string | null>(null);

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Form states for modals
  const [editShop, setEditShop] = useState(profile.shopName);
  const [editAddress, setEditAddress] = useState(profile.shopAddress);
  const [editWarehouse, setEditWarehouse] = useState(profile.nearestWarehouse);
  const [notifications, setNotifications] = useState(profile.notificationsEnabled !== false);
  const [orderUpdates, setOrderUpdates] = useState(profile.notificationPreferences?.orderUpdates !== false);
  const [deliveryUpdates, setDeliveryUpdates] = useState(profile.notificationPreferences?.deliveryUpdates !== false);
  const [promotions, setPromotions] = useState(Boolean(profile.notificationPreferences?.promotionalNotifications));

  const menuItems = [
    { id: 'ledger', title: 'Account Statement', icon: ReceiptText, sub: 'Customer ledger, running balance & invoices' },
    { id: 'shop', title: 'Shop Profile', icon: Store, sub: profile.shopName },
    {
      id: 'address',
      title: 'Shop Location & Address',
      icon: MapPin,
      sub: profile.shopAddress ? profile.shopAddress.slice(0, 32) + '...' : 'Add shop address & GPS destination',
    },
    { id: 'warehouse', title: 'Nearest Warehouse', icon: Warehouse, sub: profile.nearestWarehouse },
    { id: 'notifications', title: 'Notifications', icon: Bell, sub: notifications ? 'Active for Order Updates' : 'Muted' },
    { id: 'whatsapp', title: 'Help & WhatsApp Support', icon: MessageSquare, sub: '+91 98290 00000 (FMCG Desk)' },
    { id: 'code', title: 'Expo Native Project Source', icon: Code2, sub: 'Inspect React Native files & config' },
    { id: 'settings', title: 'Settings', icon: Settings, sub: 'Language: English / Hindi • v1.0.0' },
  ];

  const handleOpenLocationModal = () => {
    setLocAddressLine1(profile.addressLine1 || profile.shopAddress || '');
    setLocAddressLine2(profile.addressLine2 || '');
    setLocLandmark(profile.landmark || '');
    setLocArea(profile.area || '');
    setLocCity(profile.city || 'Jaipur');
    setLocState(profile.state || 'Rajasthan');
    setLocPincode(profile.pincode || '302015');
    const existingLat = typeof profile.latitude === 'number'
      ? profile.latitude
      : (typeof profile.shopLocation?.latitude === 'number' ? profile.shopLocation.latitude : undefined);
    const existingLng = typeof profile.longitude === 'number'
      ? profile.longitude
      : (typeof profile.shopLocation?.longitude === 'number' ? profile.shopLocation.longitude : undefined);
    setLocLatitude(existingLat !== undefined ? String(existingLat) : '');
    setLocLongitude(existingLng !== undefined ? String(existingLng) : '');
    setLocationError(null);
    setDeviceLocationNotice(null);
    setIsLocationModalOpen(true);
    AuthService.ensureAuthenticatedUser().catch(() => {});
  };

  const handleUseCurrentLocation = async () => {
    setIsDetectingLocation(true);
    setLocationError(null);
    setDeviceLocationNotice(null);
    try {
      const coords = await CustomerLocationService.captureDeviceLocationOnce();
      setLocLatitude(coords.latitude.toFixed(6));
      setLocLongitude(coords.longitude.toFixed(6));
      setDeviceLocationNotice('Fixed shop coordinates captured from device. Review address details and click Save Fixed Location.');
    } catch (err: any) {
      setLocationError(err.message || 'Could not acquire location. You can enter latitude and longitude manually.');
    } finally {
      setIsDetectingLocation(false);
    }
  };

  const handleSaveFixedShopLocation = async () => {
    setLocationError(null);
    setDeviceLocationNotice(null);

    // Validate address
    const addressValidation = CustomerLocationService.validateShopAddress({
      addressLine1: locAddressLine1,
      city: locCity,
      state: locState,
      pincode: locPincode,
    });
    if (!addressValidation.valid) {
      setLocationError(addressValidation.error || 'Please fill in required address fields.');
      return;
    }

    // Parse coordinates if provided
    let parsedLat: number | undefined = undefined;
    let parsedLng: number | undefined = undefined;
    if (locLatitude.trim() !== '' || locLongitude.trim() !== '') {
      if (locLatitude.trim() === '' || locLongitude.trim() === '') {
        setLocationError('Please provide both Latitude and Longitude, or clear both to save address only.');
        return;
      }
      parsedLat = parseFloat(locLatitude.trim());
      parsedLng = parseFloat(locLongitude.trim());
      const coordCheck = CustomerLocationService.validateCoordinates(parsedLat, parsedLng);
      if (!coordCheck.valid) {
        setLocationError(coordCheck.error || 'Invalid coordinates.');
        return;
      }
    }

    setIsSavingLocation(true);
    try {
      const updated = await CustomerLocationService.saveShopLocation({
        addressLine1: locAddressLine1.trim(),
        addressLine2: locAddressLine2.trim() || null,
        landmark: locLandmark.trim() || null,
        area: locArea.trim() || null,
        city: locCity.trim(),
        state: locState.trim(),
        pincode: locPincode.trim(),
        latitude: parsedLat,
        longitude: parsedLng,
        shopLocation: (parsedLat !== undefined && parsedLng !== undefined)
          ? { latitude: parsedLat, longitude: parsedLng }
          : null,
      });

      // Update AppContext
      updateProfile(updated);
      setLocationSuccess('Fixed shop location successfully updated!');
      setIsLocationModalOpen(false);
    } catch (err: any) {
      console.error('Save shop location error:', err);
      setLocationError(err.message || 'Failed to save shop location. Please try again.');
    } finally {
      setIsSavingLocation(false);
    }
  };

  const handleItemClick = (id: string) => {
    if (id === 'ledger') {
      setIsLedgerOpen(true);
    } else if (id === 'address') {
      handleOpenLocationModal();
    } else if (id === 'code') {
      setShowCodeModal(true);
    } else if (id === 'whatsapp') {
      alert('MR FUTKAR WhatsApp Kirana Support: Connected. You can chat with your dedicated FMCG distributor executive.');
    } else {
      setActiveModal(id);
    }
  };

  const handleOpenPhotoModal = () => {
    setPhotoError(null);
    setPhotoSuccess(null);
    setIsPhotoModalOpen(true);
    AuthService.ensureAuthenticatedUser().catch(() => {});
  };

  const handleClosePhotoModal = () => {
    if (isUploadingPhoto) return;
    setIsPhotoModalOpen(false);
    setPhotoError(null);
  };

  const handleSelectFromGallery = () => {
    setPhotoError(null);
    setPhotoSuccess(null);
    galleryInputRef.current?.click();
  };

  const handleCaptureFromCamera = () => {
    setPhotoError(null);
    setPhotoSuccess(null);
    cameraInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be re-selected if needed
    e.target.value = '';

    setIsUploadingPhoto(true);
    setPhotoUploadProgress(0);
    setPhotoError(null);
    setPhotoSuccess(null);

    try {
      const newPhotoUrl = await CustomerProfilePhotoService.updateCustomerProfilePhoto(
        file,
        profile.profilePhotoUrl,
        pct => setPhotoUploadProgress(pct)
      );

      // Immediately update local profile state
      updateProfile({
        profilePhotoUrl: newPhotoUrl,
      });

      setPhotoSuccess('Profile photo updated successfully!');
      setIsPhotoModalOpen(false);
    } catch (err: any) {
      console.error('Profile photo update failed:', err);
      setPhotoError(err.message || 'Failed to upload profile photo. Please try again.');
    } finally {
      setIsUploadingPhoto(false);
      setPhotoUploadProgress(0);
    }
  };

  const handleRemovePhoto = async () => {
    if (!profile.profilePhotoUrl) return;

    setIsUploadingPhoto(true);
    setPhotoError(null);
    setPhotoSuccess(null);

    try {
      await CustomerProfilePhotoService.removeCustomerProfilePhoto(profile.profilePhotoUrl);

      // Immediately update local profile state
      updateProfile({
        profilePhotoUrl: null,
      });

      setPhotoSuccess('Profile photo removed.');
      setIsPhotoModalOpen(false);
    } catch (err: any) {
      console.error('Remove profile photo failed:', err);
      setPhotoError(err.message || 'Failed to remove profile photo. Please try again.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSaveProfile = () => {
    updateProfile({
      shopName: editShop,
      shopAddress: editAddress,
      nearestWarehouse: editWarehouse,
      notificationsEnabled: notifications,
      notificationPreferences: {
        orderUpdates,
        deliveryUpdates,
        promotionalNotifications: promotions,
      },
    });
    setActiveModal(null);
  };

  return (
    <div className="space-y-4 pb-28">
      {/* Hidden file inputs for Gallery and Camera */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Upload profile photo from gallery"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Capture profile photo with camera"
      />

      {/* Global Status Notices */}
      {locationSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-3.5 flex items-center justify-between text-xs font-semibold shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{locationSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setLocationSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {photoSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-3.5 flex items-center justify-between text-xs font-semibold shadow-xs">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{photoSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setPhotoSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {photoError && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-3.5 flex items-center justify-between text-xs font-semibold shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{photoError}</span>
          </div>
          <button
            type="button"
            onClick={() => setPhotoError(null)}
            className="text-red-700 hover:text-red-900 font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Profile Card */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200/80 shadow-xs">
        <div className="flex items-center gap-3.5">
          {/* Avatar / Profile Photo Container */}
          <div className="relative group shrink-0">
            <button
              type="button"
              onClick={handleOpenPhotoModal}
              className="relative block rounded-2xl focus:outline-none focus:ring-2 focus:ring-stone-900 focus:ring-offset-2 transition-transform active:scale-95 cursor-pointer"
              aria-label="Change profile photo"
              title="Click to view or change profile photo"
            >
              {profile.profilePhotoUrl ? (
                <img
                  src={profile.profilePhotoUrl}
                  alt={profile.shopName || 'Retailer Profile'}
                  className="w-16 h-16 rounded-2xl object-cover border border-stone-200 shadow-xs"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-stone-900 text-white flex items-center justify-center font-black text-xl shadow-xs">
                  {profile.shopName.charAt(0) || 'M'}
                </div>
              )}

              {/* Camera Badge Overlay */}
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-stone-900 text-white border-2 border-white flex items-center justify-center shadow-xs">
                <Camera className="w-3 h-3" />
              </div>
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-black text-stone-950 truncate">
                {profile.shopName}
              </h2>
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <p className="text-xs font-semibold text-stone-500">
              {profile.ownerName} • +91 {profile.phone}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                GST: {profile.gstin}
              </span>
              <button
                type="button"
                onClick={handleOpenPhotoModal}
                className="text-[10px] font-bold text-stone-700 hover:text-stone-950 bg-stone-100 hover:bg-stone-200 px-2 py-0.5 rounded border border-stone-200 transition-colors"
              >
                {profile.profilePhotoUrl ? 'Change Photo' : 'Add Photo'}
              </button>
            </div>
          </div>
        </div>

        {/* Credit Banner */}
        <div className="mt-4 p-3 bg-stone-50 rounded-2xl border border-stone-100 flex items-center justify-between text-xs">
          <div>
            <span className="text-stone-400 font-medium block text-[10px] uppercase">
              Assigned Kirana Credit Limit
            </span>
            <span className="text-sm font-black text-stone-900">
              ₹{profile.availableCredit?.toLocaleString('en-IN')} / ₹{profile.creditLimit?.toLocaleString('en-IN')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => alert('Credit limit evaluation is active based on monthly wholesale turnover.')}
            className="text-[11px] font-bold text-stone-800 underline"
          >
            Manage
          </button>
        </div>
      </div>

      {/* PHASE 6 PART 2: FIXED SHOP LOCATION SECTION */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200/80 shadow-xs space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-black text-stone-950 uppercase tracking-wider">
                Shop Location
              </h3>
              <p className="text-[10px] text-stone-400 font-semibold">
                Wholesale delivery destination
              </p>
            </div>
          </div>

          {/* Status Badge */}
          {profile.shopAddress && profile.shopAddress.trim() ? (
            (typeof profile.latitude === 'number' && typeof profile.longitude === 'number') ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                <span>Destination Configured</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                <span>Address Saved • No GPS</span>
              </span>
            )
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
              <span>Shop location not added</span>
            </span>
          )}
        </div>

        {/* Address & Coordinates Details */}
        {profile.shopAddress && profile.shopAddress.trim() ? (
          <div className="space-y-2 text-xs bg-stone-50 rounded-2xl p-3.5 border border-stone-100">
            <div>
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                Shop Address
              </span>
              <p className="font-bold text-stone-900 mt-0.5 text-xs leading-relaxed">
                {profile.shopAddress}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-200/60 text-[11px]">
              <div>
                <span className="text-stone-400 font-medium block text-[10px]">City & State</span>
                <span className="font-bold text-stone-800">{profile.city || '—'}, {profile.state || '—'}</span>
              </div>
              <div>
                <span className="text-stone-400 font-medium block text-[10px]">Pincode</span>
                <span className="font-bold text-stone-800">{profile.pincode || '—'}</span>
              </div>
            </div>

            <div className="pt-1 border-t border-stone-200/60">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                Fixed Shop Coordinates
              </span>
              {(typeof profile.latitude === 'number' && typeof profile.longitude === 'number') ? (
                <div className="flex items-center justify-between mt-0.5">
                  <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-stone-900">
                    <Compass className="w-3.5 h-3.5 text-stone-500" />
                    <span>{profile.latitude.toFixed(5)}° N, {profile.longitude.toFixed(5)}° E</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                    Navigation Ready
                  </span>
                </div>
              ) : (
                <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                  GPS coordinates not configured. Delivery drivers will rely only on street address.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="text-xs bg-stone-50 rounded-2xl p-3.5 border border-stone-200 text-stone-600 space-y-1">
            <p className="font-bold text-stone-800">Shop location not added</p>
            <p className="text-[11px] text-stone-500 leading-relaxed">
              Add your shop address and fixed delivery coordinates so wholesale dispatch can route delivery vans directly to your store.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <p className="text-[10px] text-stone-400 italic">
            Fixed shop destination for Brahmpuri Hub wholesale fleet. Not live tracking.
          </p>
          <button
            type="button"
            onClick={handleOpenLocationModal}
            className="px-3.5 py-2 rounded-xl bg-stone-950 hover:bg-stone-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>{profile.shopAddress && profile.shopAddress.trim() ? 'Edit Shop Location' : 'Add Shop Location'}</span>
          </button>
        </div>
      </div>

      {/* Profile Menu List */}
      <div className="bg-white rounded-2xl border border-stone-200/80 divide-y divide-stone-100 shadow-xs overflow-hidden">
        {menuItems.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleItemClick(item.id)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-stone-50 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-stone-900">{item.title}</h4>
                  <p className="text-[11px] text-stone-400 mt-0.5">{item.sub}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-400" />
            </button>
          );
        })}
      </div>

      {/* Company Brand Logo & About */}
      <div className="pt-1">
        <BrandLogo variant="card" showTagline={true} showCorporate={true} />
      </div>

      {/* Logout / Switch Account */}
      <div className="pt-1">
        <button
          type="button"
          onClick={logout}
          className="w-full bg-white hover:bg-red-50 border border-stone-200 text-red-600 font-bold text-xs py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-xs"
        >
          <LogOut className="w-4 h-4" />
          <span>Switch Retailer Account / Logout</span>
        </button>
      </div>

      {/* Edit Profile Modal */}
      {activeModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="text-base font-black text-stone-900">
              {activeModal === 'shop' && 'Edit Shop Profile'}
              {activeModal === 'address' && 'Update Delivery Address'}
              {activeModal === 'warehouse' && 'Assign Nearest Warehouse'}
              {activeModal === 'notifications' && 'Notification Settings'}
              {activeModal === 'settings' && 'Retailer Settings'}
            </h3>

            {activeModal === 'shop' && (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Shop Name</label>
                  <input
                    type="text"
                    value={editShop}
                    onChange={e => setEditShop(e.target.value)}
                    className="w-full border border-stone-300 rounded-xl p-2.5 text-sm font-semibold"
                  />
                </div>
              </div>
            )}

            {activeModal === 'address' && (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Full Shop Address</label>
                  <textarea
                    rows={3}
                    value={editAddress}
                    onChange={e => setEditAddress(e.target.value)}
                    className="w-full border border-stone-300 rounded-xl p-2.5 text-sm font-semibold resize-none"
                  />
                </div>
              </div>
            )}

            {activeModal === 'warehouse' && (
              <div className="space-y-3 text-xs">
                <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-stone-900 text-sm">MR FUTKAR — BRAHMPURI</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                      Active Operational Hub
                    </span>
                  </div>
                  <p className="text-stone-600 font-medium">
                    Branch: <span className="font-bold text-stone-900">Brahmpuri Branch</span> (ID: <code className="text-[11px] font-mono bg-stone-200/70 px-1 py-0.5 rounded">WH-BRAHMPURI-01</code>)
                  </p>
                  <p className="text-stone-500 text-[11px] leading-relaxed">
                    Coverage: Serving Kirana partners across <span className="font-semibold text-stone-700">Brahmpuri, Karawal Nagar</span>, and East Delhi trade zones. All wholesale stock, picking, packing, and dispatch operate centrally through this single merged branch.
                  </p>
                </div>
                <p className="text-[11px] text-stone-500 italic">
                  Note: Warehouse assignment is authoritative and managed by MR FUTKAR logistics. Retailers cannot manually change fulfilment hubs.
                </p>
              </div>
            )}

            {activeModal === 'notifications' && (
              <div className="space-y-3.5 text-xs">
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <span className="font-bold text-stone-900 block text-xs">Push Notifications</span>
                      <span className="text-[11px] text-stone-500 font-medium">Enable real-time push delivery to device</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifications}
                      onChange={e => setNotifications(e.target.checked)}
                      className="w-4 h-4 rounded text-stone-900"
                    />
                  </label>
                </div>

                <div className="space-y-2 pl-1">
                  <label className="flex items-center justify-between cursor-pointer py-1">
                    <div>
                      <span className="font-semibold text-stone-800 block">Order Status Updates</span>
                      <span className="text-[10px] text-stone-400">Order placed, confirmed, picking & packed</span>
                    </div>
                    <input
                      type="checkbox"
                      disabled={!notifications}
                      checked={notifications && orderUpdates}
                      onChange={e => setOrderUpdates(e.target.checked)}
                      className="w-4 h-4 rounded text-stone-900 disabled:opacity-50"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer py-1">
                    <div>
                      <span className="font-semibold text-stone-800 block">Delivery Dispatch Alerts</span>
                      <span className="text-[10px] text-stone-400">Assigned, out for delivery & handover</span>
                    </div>
                    <input
                      type="checkbox"
                      disabled={!notifications}
                      checked={notifications && deliveryUpdates}
                      onChange={e => setDeliveryUpdates(e.target.checked)}
                      className="w-4 h-4 rounded text-stone-900 disabled:opacity-50"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer py-1">
                    <div>
                      <span className="font-semibold text-stone-800 block">Promotions & Wholesale Deals</span>
                      <span className="text-[10px] text-stone-400">Kirana volume discounts & trade deals</span>
                    </div>
                    <input
                      type="checkbox"
                      disabled={!notifications}
                      checked={notifications && promotions}
                      onChange={e => setPromotions(e.target.checked)}
                      className="w-4 h-4 rounded text-stone-900 disabled:opacity-50"
                    />
                  </label>
                </div>
              </div>
            )}

            {activeModal === 'settings' && (
              <div className="space-y-2 text-xs text-stone-600">
                <p className="font-bold text-stone-900">MR FUTKAR Retailer Architecture</p>
                <p>Framework: Expo 54 + React Native + TypeScript</p>
                <p>Contract: Shared B2B FMCG schema for Retailer, Sales, Warehouse, Delivery & Admin apps</p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 font-bold text-xs text-stone-600 hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveProfile}
                className="flex-1 py-2.5 rounded-xl bg-stone-950 text-white font-bold text-xs hover:bg-stone-800"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Retailer Account Statement / Customer Ledger Modal (Phase 5.7 Part 1A) */}
      <RetailerLedgerModal
        isOpen={isLedgerOpen}
        onClose={() => setIsLedgerOpen(false)}
        shopName={profile.shopName}
        retailerId={profile.retailerId}
      />

      {/* Profile Photo (DP) Action Modal */}
      {isPhotoModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in slide-in-from-bottom sm:slide-in-from-none duration-200">
            <div className="flex items-center justify-between pb-1 border-b border-stone-100">
              <div>
                <h3 className="text-base font-black text-stone-950">Profile Photo (DP)</h3>
                <p className="text-[11px] font-medium text-stone-500">Retailer Store Identity</p>
              </div>
              <button
                type="button"
                disabled={isUploadingPhoto}
                onClick={handleClosePhotoModal}
                className="p-1 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 disabled:opacity-50 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Photo Preview inside modal */}
            <div className="flex flex-col items-center justify-center py-2">
              {profile.profilePhotoUrl ? (
                <div className="relative">
                  <img
                    src={profile.profilePhotoUrl}
                    alt="Current Profile Photo"
                    className="w-24 h-24 rounded-2xl object-cover border-2 border-stone-200 shadow-md"
                  />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] shadow-xs">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                </div>
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-stone-100 border-2 border-dashed border-stone-300 text-stone-400 flex flex-col items-center justify-center gap-1.5">
                  <Camera className="w-7 h-7 text-stone-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">No Photo</span>
                </div>
              )}
            </div>

            {/* Uploading progress indicator */}
            {isUploadingPhoto ? (
              <div className="space-y-2 py-3 bg-stone-50 rounded-2xl p-4 border border-stone-200 text-center">
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-stone-800">
                  <Loader2 className="w-4 h-4 animate-spin text-stone-900" />
                  <span>Uploading profile photo... {photoUploadProgress > 0 ? `${photoUploadProgress}%` : ''}</span>
                </div>
                <div className="w-full bg-stone-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-stone-900 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(10, photoUploadProgress)}%` }}
                  />
                </div>
                <p className="text-[10px] text-stone-500 font-medium">Validating & saving to cloud storage...</p>
              </div>
            ) : (
              <div className="space-y-2.5 pt-1">
                {/* Take Photo button */}
                <button
                  type="button"
                  onClick={handleCaptureFromCamera}
                  className="w-full py-3 px-4 rounded-2xl bg-stone-950 text-white font-bold text-xs hover:bg-stone-800 flex items-center justify-center gap-2.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>Take Photo (Camera)</span>
                </button>

                {/* Choose from Gallery button */}
                <button
                  type="button"
                  onClick={handleSelectFromGallery}
                  className="w-full py-3 px-4 rounded-2xl bg-stone-100 text-stone-900 font-bold text-xs hover:bg-stone-200 flex items-center justify-center gap-2.5 transition-colors border border-stone-200 cursor-pointer"
                >
                  <ImageIcon className="w-4 h-4" />
                  <span>Choose from Gallery / Files</span>
                </button>

                {/* Remove DP button (if photo exists) */}
                {profile.profilePhotoUrl && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="w-full py-2.5 px-4 rounded-2xl text-red-600 bg-red-50 hover:bg-red-100 font-bold text-xs flex items-center justify-center gap-2 transition-colors border border-red-200/60 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Remove Profile Photo</span>
                  </button>
                )}

                <p className="text-[10px] text-center text-stone-400 pt-1">
                  Supported formats: JPG, PNG, WebP • Max size: 5MB
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PHASE 6 PART 2: SHOP LOCATION & DESTINATION MODAL */}
      {isLocationModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom sm:slide-in-from-none duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-stone-950">Fixed Shop Location</h3>
                  <p className="text-[11px] font-medium text-stone-500">Wholesale Delivery Destination</p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSavingLocation}
                onClick={() => setIsLocationModalOpen(false)}
                className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 disabled:opacity-50 cursor-pointer"
                aria-label="Close location modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Explanatory Banner */}
            <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl text-[11px] text-amber-900 leading-relaxed">
              <p className="font-bold text-amber-950 mb-0.5">Fixed Storefront Destination</p>
              This represents your fixed shop address and coordinates used by MR FUTKAR Brahmpuri Hub delivery drivers. This is <span className="font-semibold">not live GPS tracking</span>.
            </div>

            {/* Error Notification */}
            {locationError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span className="font-semibold">{locationError}</span>
              </div>
            )}

            {/* Device location feedback */}
            {deviceLocationNotice && (
              <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="font-semibold">{deviceLocationNotice}</span>
              </div>
            )}

            {/* Form Fields */}
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Shop Address / Street <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Shop #4, Main Market, Brahmpuri Road"
                  value={locAddressLine1}
                  onChange={e => setLocAddressLine1(e.target.value)}
                  className="w-full border border-stone-300 rounded-xl p-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-stone-900"
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">
                  Building / Floor / Address Line 2 <span className="text-stone-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ground Floor, Gupta Complex"
                  value={locAddressLine2}
                  onChange={e => setLocAddressLine2(e.target.value)}
                  className="w-full border border-stone-300 rounded-xl p-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-stone-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">
                    Landmark <span className="text-stone-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Opp. City Post Office"
                    value={locLandmark}
                    onChange={e => setLocLandmark(e.target.value)}
                    className="w-full border border-stone-300 rounded-xl p-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-stone-900"
                  />
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">
                    Area / Trade Zone <span className="text-stone-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Brahmpuri / Karawal Nagar"
                    value={locArea}
                    onChange={e => setLocArea(e.target.value)}
                    className="w-full border border-stone-300 rounded-xl p-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-stone-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">
                    City <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Delhi / Jaipur"
                    value={locCity}
                    onChange={e => setLocCity(e.target.value)}
                    className="w-full border border-stone-300 rounded-xl p-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-stone-900"
                  />
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">
                    State <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Delhi / Rajasthan"
                    value={locState}
                    onChange={e => setLocState(e.target.value)}
                    className="w-full border border-stone-300 rounded-xl p-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-stone-900"
                  />
                </div>
                <div>
                  <label className="font-bold text-stone-700 block mb-1">
                    Pincode <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="e.g. 110053"
                    value={locPincode}
                    onChange={e => setLocPincode(e.target.value.replace(/\D/g, ''))}
                    className="w-full border border-stone-300 rounded-xl p-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-stone-900"
                  />
                </div>
              </div>

              {/* Fixed Coordinates Sub-section */}
              <div className="pt-2 border-t border-stone-200">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Compass className="w-4 h-4 text-stone-700" />
                    <span className="font-bold text-stone-900 text-xs">Fixed Shop Coordinates (GPS)</span>
                  </div>
                  <button
                    type="button"
                    disabled={isDetectingLocation || isSavingLocation}
                    onClick={handleUseCurrentLocation}
                    className="text-[11px] font-bold text-stone-800 hover:text-stone-950 bg-stone-100 hover:bg-stone-200 border border-stone-200 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                    title="Capture current coordinates once to autofill shop coordinates"
                  >
                    {isDetectingLocation ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-stone-800" />
                        <span>Detecting...</span>
                      </>
                    ) : (
                      <>
                        <Navigation className="w-3 h-3 text-stone-800" />
                        <span>Use Current Location</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-stone-500 mb-2 leading-tight">
                  Enter decimal coordinates (-90 to 90 lat, -180 to 180 lng) or click "Use Current Location" while present at the storefront.
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-stone-600 block mb-0.5">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 28.6923"
                      value={locLatitude}
                      onChange={e => setLocLatitude(e.target.value)}
                      className="w-full border border-stone-300 rounded-xl p-2 text-xs font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-stone-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-stone-600 block mb-0.5">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 77.2685"
                      value={locLongitude}
                      onChange={e => setLocLongitude(e.target.value)}
                      className="w-full border border-stone-300 rounded-xl p-2 text-xs font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-stone-900"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Action Buttons */}
            <div className="flex gap-2.5 pt-2 border-t border-stone-100">
              <button
                type="button"
                disabled={isSavingLocation}
                onClick={() => setIsLocationModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 font-bold text-xs text-stone-600 hover:bg-stone-50 disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingLocation}
                onClick={handleSaveFixedShopLocation}
                className="flex-1 py-2.5 rounded-xl bg-stone-950 text-white font-bold text-xs hover:bg-stone-800 disabled:opacity-50 flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
              >
                {isSavingLocation ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving Location...</span>
                  </>
                ) : (
                  <span>Save Fixed Location</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
