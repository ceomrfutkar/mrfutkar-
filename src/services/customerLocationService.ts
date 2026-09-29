/**
 * MR FUTKAR — PHASE 6 PART 2: CUSTOMER FIXED SHOP LOCATION SERVICE
 * 
 * Handles validation, ownership enforcement, atomic persistence, and delivery compatibility
 * for the Retailer's FIXED SHOP DESTINATION.
 * 
 * Invariants:
 * - Fixed permanent destination for wholesale delivery vehicles (NOT live GPS or continuous tracking).
 * - No Maps SDK, No live GPS tracking, No background tracking.
 * - Strict coordinate boundaries: Latitude [-90, 90], Longitude [-180, 180].
 * - Rejects NaN, Infinity, strings, and out-of-range coordinates.
 * - Enforces India 6-digit postal code standard.
 * - Authoritative Firebase Auth ownership enforcement: customer can only modify their own profile.
 * - Strict field sanitization: protected fields (role, status, creditLimit, etc.) cannot be injected.
 * - Atomic persistence: address and coordinates validated and saved together.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { RetailerProfile, ShopAddressDetails, ShopLocation } from '../types/retailer';
import { retailerRepository } from '../repositories/RetailerRepository';
import { AuthService } from './authService';

export interface LocationValidationResult {
  valid: boolean;
  error?: string;
}

export interface FixedShopDestination {
  shopAddress: string;
  latitude: number | null;
  longitude: number | null;
  hasCoordinates: boolean;
}

export class CustomerLocationService {
  /**
   * Strictly validates latitude and longitude coordinates.
   * Latitude: [-90, 90]
   * Longitude: [-180, 180]
   * Rejects NaN, Infinity, -Infinity, strings, null, undefined, booleans, and non-numeric types.
   */
  static validateCoordinates(latitude: unknown, longitude: unknown): LocationValidationResult {
    if (latitude === undefined || latitude === null || longitude === undefined || longitude === null) {
      return { valid: false, error: 'Latitude and Longitude are required coordinates.' };
    }

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return { valid: false, error: 'Coordinates must be valid numbers.' };
    }

    if (!Number.isFinite(latitude) || Number.isNaN(latitude)) {
      return { valid: false, error: 'Latitude must be a finite, non-NaN number.' };
    }

    if (!Number.isFinite(longitude) || Number.isNaN(longitude)) {
      return { valid: false, error: 'Longitude must be a finite, non-NaN number.' };
    }

    if (latitude < -90) {
      return { valid: false, error: 'Latitude cannot be less than -90 degrees.' };
    }

    if (latitude > 90) {
      return { valid: false, error: 'Latitude cannot be greater than 90 degrees.' };
    }

    if (longitude < -180) {
      return { valid: false, error: 'Longitude cannot be less than -180 degrees.' };
    }

    if (longitude > 180) {
      return { valid: false, error: 'Longitude cannot be greater than 180 degrees.' };
    }

    return { valid: true };
  }

  /**
   * Validates Indian pincode format (6 digits).
   */
  static validatePincode(pincode: unknown): LocationValidationResult {
    if (!pincode || typeof pincode !== 'string') {
      return { valid: false, error: 'Pincode is required.' };
    }

    const trimmed = pincode.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      return { valid: false, error: 'Please enter a valid 6-digit Indian Pincode (e.g. 302015 or 110053).' };
    }

    return { valid: true };
  }

  /**
   * Validates structured shop address fields.
   */
  static validateShopAddress(address: Partial<ShopAddressDetails> | { shopAddress?: string; city?: string; state?: string; pincode?: string }): LocationValidationResult {
    if (!address) {
      return { valid: false, error: 'Shop address details are required.' };
    }

    const addressLine = (address as any).addressLine1 || (address as any).shopAddress || '';
    if (!addressLine || typeof addressLine !== 'string' || addressLine.trim().length < 3) {
      return { valid: false, error: 'Please enter a valid Shop Address / Street Line (minimum 3 characters).' };
    }

    const city = address.city || '';
    if (!city || typeof city !== 'string' || city.trim().length < 2) {
      return { valid: false, error: 'Please enter a valid City (minimum 2 characters).' };
    }

    const state = address.state || '';
    if (!state || typeof state !== 'string' || state.trim().length < 2) {
      return { valid: false, error: 'Please enter a valid State (minimum 2 characters).' };
    }

    const pincodeValidation = this.validatePincode(address.pincode);
    if (!pincodeValidation.valid) {
      return pincodeValidation;
    }

    return { valid: true };
  }

  /**
   * Formats a canonical full shop address string from components.
   */
  static formatFullAddress(details: {
    addressLine1: string;
    addressLine2?: string | null;
    landmark?: string | null;
    area?: string | null;
    city: string;
    state: string;
    pincode: string;
  }): string {
    const parts: string[] = [];
    if (details.addressLine1?.trim()) parts.push(details.addressLine1.trim());
    if (details.addressLine2?.trim()) parts.push(details.addressLine2.trim());
    if (details.landmark?.trim()) parts.push(`Near ${details.landmark.trim()}`);
    if (details.area?.trim()) parts.push(details.area.trim());
    if (details.city?.trim()) parts.push(details.city.trim());
    if (details.state?.trim()) parts.push(details.state.trim());
    if (details.pincode?.trim()) parts.push(`PIN: ${details.pincode.trim()}`);
    return parts.join(', ');
  }

  /**
   * Sanitizes mutation payload to ensure protected customer fields cannot be modified
   * through location update workflows.
   */
  static sanitizeLocationPayload(rawPayload: Record<string, any>): Record<string, any> {
    const ALLOWED_LOCATION_FIELDS = new Set([
      'shopAddress',
      'addressLine1',
      'addressLine2',
      'landmark',
      'area',
      'city',
      'state',
      'pincode',
      'latitude',
      'longitude',
      'shopLocation',
      'updatedAt',
    ]);

    const sanitized: Record<string, any> = {};
    for (const key of Object.keys(rawPayload)) {
      if (ALLOWED_LOCATION_FIELDS.has(key)) {
        sanitized[key] = rawPayload[key];
      }
    }
    return sanitized;
  }

  /**
   * Resolves authenticated Firebase Auth User.
   * Throws if unauthenticated to enforce ownership authority.
   */
  static async getAuthenticatedCustomer(): Promise<{ uid: string }> {
    let currentUser = auth.currentUser;
    if (currentUser && currentUser.uid) {
      return currentUser;
    }

    try {
      currentUser = await AuthService.ensureAuthenticatedUser();
      if (currentUser && currentUser.uid) {
        return currentUser;
      }
    } catch (err) {
      console.warn('CustomerLocationService auth resolution notice:', err);
    }

    if (!currentUser || !currentUser.uid) {
      throw new Error('Authentication required. Only authenticated retailers can update their shop location.');
    }

    return currentUser;
  }

  /**
   * Saves or updates the retailer's fixed shop location.
   * Enforces customer ownership: commits strictly to `/retailers/{currentUser.uid}`.
   * Enforces atomic validation: address AND coordinates validated together before modifying state.
   */
  static async saveShopLocation(params: {
    addressLine1: string;
    addressLine2?: string | null;
    landmark?: string | null;
    area?: string | null;
    city: string;
    state: string;
    pincode: string;
    latitude?: number;
    longitude?: number;
    shopLocation?: ShopLocation | null;
  }): Promise<RetailerProfile> {
    const user = await this.getAuthenticatedCustomer();
    const uid = user.uid;

    // 1. Validate Address
    const addressValidation = this.validateShopAddress(params);
    if (!addressValidation.valid) {
      throw new Error(addressValidation.error || 'Invalid shop address details.');
    }

    // 2. Validate Coordinates if provided
    const targetLat = typeof params.latitude === 'number' ? params.latitude : params.shopLocation?.latitude;
    const targetLng = typeof params.longitude === 'number' ? params.longitude : params.shopLocation?.longitude;

    if (targetLat !== undefined || targetLng !== undefined) {
      const coordValidation = this.validateCoordinates(targetLat, targetLng);
      if (!coordValidation.valid) {
        throw new Error(coordValidation.error || 'Invalid coordinates.');
      }
    }

    // 3. Compose canonical formatted address
    const fullShopAddress = this.formatFullAddress({
      addressLine1: params.addressLine1,
      addressLine2: params.addressLine2,
      landmark: params.landmark,
      area: params.area,
      city: params.city,
      state: params.state,
      pincode: params.pincode,
    });

    const now = new Date().toISOString();
    const locationUpdates: Record<string, any> = {
      shopAddress: fullShopAddress,
      addressLine1: params.addressLine1.trim(),
      addressLine2: params.addressLine2?.trim() || null,
      landmark: params.landmark?.trim() || null,
      area: params.area?.trim() || null,
      city: params.city.trim(),
      state: params.state.trim(),
      pincode: params.pincode.trim(),
      updatedAt: now,
    };

    if (typeof targetLat === 'number' && typeof targetLng === 'number') {
      locationUpdates.latitude = targetLat;
      locationUpdates.longitude = targetLng;
      locationUpdates.shopLocation = {
        latitude: targetLat,
        longitude: targetLng,
      };
    }

    // 4. Sanitize payload strictly
    const sanitized = this.sanitizeLocationPayload(locationUpdates);

    // 5. Commit atomically to Firestore under the authenticated user's document
    const docRef = doc(db, 'retailers', uid);
    await setDoc(docRef, sanitized, { merge: true });

    // 6. Update local repository and cache
    let existing = await retailerRepository.getProfile(uid);
    if (!existing) {
      try {
        const cachedRaw = localStorage.getItem('mrfutkar_retailer_profile');
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (parsed && typeof parsed === 'object') {
            existing = parsed;
          }
        }
      } catch {
        // ignore
      }
    }
    const updatedProfile: RetailerProfile = {
      ...(existing || {
        retailerId: uid,
        mobileNumber: '',
        phone: '',
        ownerName: '',
        shopName: '',
        shopAddress: fullShopAddress,
        city: params.city,
        state: params.state,
        pincode: params.pincode,
        isProfileComplete: true,
      }),
      ...sanitized,
      retailerId: uid, // Immutability guarantee
    };

    try {
      localStorage.setItem(`retailer_profile_${uid}`, JSON.stringify(updatedProfile));
      localStorage.setItem('mrfutkar_retailer_profile', JSON.stringify(updatedProfile));
    } catch {
      // ignore
    }

    return updatedProfile;
  }

  /**
   * One-time user-triggered device location detection convenience action.
   * Does NOT start continuous tracking. Does NOT store location history. Does NOT run in background.
   */
  static async captureDeviceLocationOnce(): Promise<ShopLocation> {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      throw new Error('Geolocation is not supported by your current browser environment.');
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const validation = CustomerLocationService.validateCoordinates(lat, lng);
          if (validation.valid) {
            resolve({ latitude: lat, longitude: lng });
          } else {
            reject(new Error(validation.error || 'Invalid device coordinates returned.'));
          }
        },
        (err) => {
          let message = 'Could not acquire device location.';
          if (err.code === 1) {
            message = 'Location access was denied. You can enter your shop coordinates manually.';
          } else if (err.code === 2) {
            message = 'Position unavailable. Please enter your shop coordinates manually.';
          } else if (err.code === 3) {
            message = 'Location request timed out. Please try again or enter coordinates manually.';
          }
          reject(new Error(message));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  }

  /**
   * Generates a safe external Google Maps navigation URL for the fixed shop destination.
   * Preferred format: https://www.google.com/maps/dir/?api=1&destination={latitude},{longitude}
   * Returns null if coordinates are invalid, missing, NaN, infinite, or out of range.
   * Does NOT add Maps SDK, API keys, or live GPS tracking.
   */
  static buildExternalNavigationUrl(latitude: unknown, longitude: unknown): string | null {
    const validation = this.validateCoordinates(latitude, longitude);
    if (!validation.valid || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return null;
    }

    const latEnc = encodeURIComponent(latitude.toString());
    const lngEnc = encodeURIComponent(longitude.toString());
    return `https://www.google.com/maps/dir/?api=1&destination=${latEnc},${lngEnc}`;
  }

  /**
   * Extracts the fixed shop destination for the Delivery module to format external Google Maps navigation links.
   * Does NOT implement navigation or require Maps SDK.
   */
  static getFixedShopDestination(profile?: RetailerProfile | null): FixedShopDestination {
    if (!profile) {
      return {
        shopAddress: '',
        latitude: null,
        longitude: null,
        hasCoordinates: false,
      };
    }

    const lat = typeof profile.latitude === 'number'
      ? profile.latitude
      : (typeof profile.shopLocation?.latitude === 'number' ? profile.shopLocation.latitude : null);
    
    const lng = typeof profile.longitude === 'number'
      ? profile.longitude
      : (typeof profile.shopLocation?.longitude === 'number' ? profile.shopLocation.longitude : null);

    const hasCoordinates = lat !== null && lng !== null && CustomerLocationService.validateCoordinates(lat, lng).valid;

    return {
      shopAddress: profile.shopAddress || '',
      latitude: lat,
      longitude: lng,
      hasCoordinates,
    };
  }
}
