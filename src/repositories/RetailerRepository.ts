import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { RetailerProfile } from '../types/retailer';

export interface IRetailerRepository {
  getProfile(retailerId: string): Promise<RetailerProfile | null>;
  saveProfile(profile: RetailerProfile): Promise<RetailerProfile>;
  updateProfile(retailerId: string, updates: Partial<RetailerProfile>): Promise<RetailerProfile>;
  updateProfilePhoto(retailerId: string, photoUrl: string | null): Promise<void>;
  updateShopLocation(retailerId: string, locationData: Partial<RetailerProfile>): Promise<RetailerProfile>;
}

export class FirebaseRetailerRepository implements IRetailerRepository {
  private collectionName = 'retailers';

  async getProfile(retailerId: string): Promise<RetailerProfile | null> {
    try {
      const docRef = doc(db, this.collectionName, retailerId);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists()) {
        return null;
      }

      const data = snapshot.data();
      const lat = typeof data.latitude === 'number'
        ? data.latitude
        : (typeof data.shopLocation?.latitude === 'number' ? data.shopLocation.latitude : undefined);
      const lng = typeof data.longitude === 'number'
        ? data.longitude
        : (typeof data.shopLocation?.longitude === 'number' ? data.shopLocation.longitude : undefined);

      return {
        retailerId: data.retailerId || snapshot.id,
        mobileNumber: data.mobileNumber || data.phone || '',
        phone: data.mobileNumber || data.phone || '',
        ownerName: data.ownerName || '',
        shopName: data.shopName || '',
        shopAddress: data.shopAddress || '',
        addressLine1: data.addressLine1 || data.shopAddress || '',
        addressLine2: data.addressLine2 || null,
        landmark: data.landmark || null,
        area: data.area || null,
        city: data.city || 'Jaipur',
        state: data.state || 'Rajasthan',
        pincode: data.pincode || '302015',
        gstNumber: data.gstNumber || data.gstin || '',
        gstin: data.gstNumber || data.gstin || '',
        latitude: lat,
        longitude: lng,
        shopLocation: (typeof lat === 'number' && typeof lng === 'number')
          ? { latitude: lat, longitude: lng }
          : (data.shopLocation || null),
        defaultAddressId: data.defaultAddressId || 'addr-default',
        nearestWarehouse: data.nearestWarehouse || `${data.city || 'Jaipur'} Central Hub`,
        notificationsEnabled: data.notificationsEnabled ?? true,
        creditLimit: data.creditLimit ?? 25000,
        availableCredit: data.availableCredit ?? 25000,
        profilePhotoUrl: data.profilePhotoUrl || null,
        isProfileComplete: Boolean(data.isProfileComplete),
        isActive: data.isActive ?? true,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
      };
    } catch (err) {
      console.warn('Error fetching retailer profile from Firestore, using fallback:', err);
      // Fallback to local storage if offline
      return this.getLocalFallback(retailerId);
    }
  }

  async saveProfile(profile: RetailerProfile): Promise<RetailerProfile> {
    const now = new Date().toISOString();
    const lat = typeof profile.latitude === 'number'
      ? profile.latitude
      : (typeof profile.shopLocation?.latitude === 'number' ? profile.shopLocation.latitude : undefined);
    const lng = typeof profile.longitude === 'number'
      ? profile.longitude
      : (typeof profile.shopLocation?.longitude === 'number' ? profile.shopLocation.longitude : undefined);

    const cleanProfile: RetailerProfile = {
      ...profile,
      phone: profile.mobileNumber || profile.phone,
      mobileNumber: profile.mobileNumber || profile.phone,
      gstin: profile.gstNumber || profile.gstin || '',
      gstNumber: profile.gstNumber || profile.gstin || '',
      latitude: lat,
      longitude: lng,
      shopLocation: (typeof lat === 'number' && typeof lng === 'number')
        ? { latitude: lat, longitude: lng }
        : (profile.shopLocation || null),
      profilePhotoUrl: profile.profilePhotoUrl !== undefined ? profile.profilePhotoUrl : null,
      isActive: profile.isActive ?? true,
      createdAt: profile.createdAt || now,
      updatedAt: now,
    };

    try {
      const docRef = doc(db, this.collectionName, profile.retailerId);
      await setDoc(docRef, cleanProfile, { merge: true });
    } catch (err) {
      console.warn('Firestore write failed for retailer profile, caching locally:', err);
    }

    // Always cache locally for instant offline hydration
    try {
      localStorage.setItem(`retailer_profile_${profile.retailerId}`, JSON.stringify(cleanProfile));
      localStorage.setItem('mrfutkar_retailer_profile', JSON.stringify(cleanProfile));
    } catch {
      // ignore
    }

    return cleanProfile;
  }

  async updateShopLocation(retailerId: string, locationData: Partial<RetailerProfile>): Promise<RetailerProfile> {
    const existing = (await this.getProfile(retailerId)) || {
      retailerId,
      mobileNumber: '',
      phone: '',
      ownerName: '',
      shopName: '',
      shopAddress: '',
      city: 'Jaipur',
      pincode: '302015',
      isProfileComplete: false,
    };

    const lat = typeof locationData.latitude === 'number'
      ? locationData.latitude
      : (typeof locationData.shopLocation?.latitude === 'number' ? locationData.shopLocation.latitude : existing.latitude);
    const lng = typeof locationData.longitude === 'number'
      ? locationData.longitude
      : (typeof locationData.shopLocation?.longitude === 'number' ? locationData.shopLocation.longitude : existing.longitude);

    const merged: RetailerProfile = {
      ...existing,
      ...locationData,
      retailerId, // Immutability guarantee
      latitude: lat,
      longitude: lng,
      shopLocation: (typeof lat === 'number' && typeof lng === 'number')
        ? { latitude: lat, longitude: lng }
        : (locationData.shopLocation ?? existing.shopLocation ?? null),
      updatedAt: new Date().toISOString(),
    };

    return this.saveProfile(merged);
  }

  async updateProfilePhoto(retailerId: string, photoUrl: string | null): Promise<void> {
    const updatedAt = new Date().toISOString();
    try {
      const docRef = doc(db, this.collectionName, retailerId);
      await setDoc(docRef, { profilePhotoUrl: photoUrl, updatedAt }, { merge: true });
    } catch (err) {
      console.warn('Firestore updateProfilePhoto failed, updating cache:', err);
    }

    // Update local cache
    try {
      const cached = this.getLocalFallback(retailerId);
      if (cached) {
        cached.profilePhotoUrl = photoUrl;
        cached.updatedAt = updatedAt;
        localStorage.setItem(`retailer_profile_${retailerId}`, JSON.stringify(cached));
        localStorage.setItem('mrfutkar_retailer_profile', JSON.stringify(cached));
      }
    } catch {
      // ignore
    }
  }

  async updateProfile(retailerId: string, updates: Partial<RetailerProfile>): Promise<RetailerProfile> {
    const existing = (await this.getProfile(retailerId)) || {
      retailerId,
      mobileNumber: updates.mobileNumber || updates.phone || '',
      phone: updates.mobileNumber || updates.phone || '',
      ownerName: '',
      shopName: '',
      shopAddress: '',
      city: 'Jaipur',
      pincode: '302015',
      isProfileComplete: false,
    };

    const merged: RetailerProfile = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    return this.saveProfile(merged);
  }

  private getLocalFallback(retailerId: string): RetailerProfile | null {
    try {
      const saved = localStorage.getItem(`retailer_profile_${retailerId}`) || localStorage.getItem('mrfutkar_retailer_profile');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return null;
  }
}

export const retailerRepository: IRetailerRepository = new FirebaseRetailerRepository();
