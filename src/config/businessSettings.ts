import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface BusinessFeatureFlag {
  key: string;
  description: string;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface BusinessSettings {
  // Business Profile
  businessName: string;
  legalName: string;
  supportPhone: string;
  supportEmail: string;
  businessAddress: string;
  city: string;
  state: string;
  pincode: string;
  currency: string; // 'INR'
  timezone: string; // 'Asia/Kolkata'

  // Order Settings
  minimumOrderValue: number;
  maximumOrderValue: number;
  allowOrderCancellation: boolean;
  cancellationAllowedStatuses: string[];
  maxOrderItemsCount: number;

  // Delivery Settings
  defaultDeliveryCharge: number;
  freeDeliveryThreshold: number;
  defaultEstimatedDelivery: string;
  deliveryServiceAreas: string[];
  serviceablePincodes?: string[];

  // Payment / COD Settings
  allowCOD: boolean;
  allowUPI: boolean;
  allowOnlinePayment: boolean;
  minCodOrderValue: number;
  maxCodOrderValue: number;

  // Retailer Settings
  retailerRegistrationEnabled: boolean;
  defaultCreditLimit: number;
  requireGstinForRegistration: boolean;

  // Product / Catalog Defaults
  defaultProductMoq: number;
  defaultProductActive: boolean;
  defaultLowStockThreshold: number;
  maxProductImages: number;
  maxImageSizeBytes: number;
  allowedImageFormats: string[];

  // Inventory Defaults & Safeguards
  preventNegativeStock: boolean;
  stockWarningThreshold: number;

  // Notification Settings
  pushNotificationsEnabled: boolean;
  inAppNotificationsEnabled: boolean;
  orderStatusNotifications: boolean;
  inventoryAlertsEnabled: boolean;

  // Warehouse Operational Settings
  defaultWarehouseId: string;
  defaultWarehouseName: string;
  dispatchCutoffTime: string;
  autoAssignDeliveryPartner: boolean;

  // Security Operational Settings (safe dynamic configs, NO secrets)
  sessionTimeoutMinutes: number;
  maxFailedLoginAttempts: number;
  requireStrongPasswords: boolean;

  // Feature Flags
  featureFlags: Record<string, BusinessFeatureFlag>;

  // Metadata & Concurrency
  taxPercentage: number;
  version: number;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const defaultBusinessSettings: BusinessSettings = {
  // Business Profile
  businessName: 'MR FUTKAR',
  legalName: 'MR FUTKAR Wholesale Groceries Pvt. Ltd.',
  supportPhone: '+91 11 22981000',
  supportEmail: 'support@mrfutkar.com',
  businessAddress: 'Main Brahmpuri Road, Near Brahmpuri Bus Terminal',
  city: 'Delhi',
  state: 'Delhi',
  pincode: '110053',
  currency: 'INR',
  timezone: 'Asia/Kolkata',

  // Order Settings
  minimumOrderValue: 500, // ₹500 Minimum Order for wholesale dispatch
  maximumOrderValue: 500000, // ₹500,000 maximum single order cap
  allowOrderCancellation: true,
  cancellationAllowedStatuses: ['PLACED', 'CONFIRMED', 'ACCEPTED'],
  maxOrderItemsCount: 100,

  // Delivery Settings
  defaultDeliveryCharge: 40, // ₹40 standard hub delivery
  freeDeliveryThreshold: 1000, // ₹1,000+ orders qualify for free delivery
  defaultEstimatedDelivery: 'Today within 4 hours (Brahmpuri Hub)',
  deliveryServiceAreas: ['Brahmpuri', 'Karawal Nagar', 'Yamuna Vihar', 'Seelampur', 'Shahdara', 'Bhajanpura'],

  // Payment / COD Settings
  allowCOD: true,
  allowUPI: true,
  allowOnlinePayment: true,
  minCodOrderValue: 0,
  maxCodOrderValue: 50000,

  // Retailer Settings
  retailerRegistrationEnabled: true,
  defaultCreditLimit: 25000,
  requireGstinForRegistration: false,

  // Product / Catalog Defaults
  defaultProductMoq: 1,
  defaultProductActive: true,
  defaultLowStockThreshold: 10,
  maxProductImages: 5,
  maxImageSizeBytes: 5242880, // 5MB
  allowedImageFormats: ['image/jpeg', 'image/png', 'image/webp'],

  // Inventory Defaults
  preventNegativeStock: true,
  stockWarningThreshold: 5,

  // Notification Settings
  pushNotificationsEnabled: true,
  inAppNotificationsEnabled: true,
  orderStatusNotifications: true,
  inventoryAlertsEnabled: true,

  // Warehouse Operational Settings
  defaultWarehouseId: 'WH-BRAHMPURI-01',
  defaultWarehouseName: 'MR FUTKAR — BRAHMPURI',
  dispatchCutoffTime: '18:00',
  autoAssignDeliveryPartner: false,

  // Security Operational Settings
  sessionTimeoutMinutes: 480, // 8 hours
  maxFailedLoginAttempts: 5,
  requireStrongPasswords: true,

  // Feature Flags
  featureFlags: {
    enableNewPricingEngine: {
      key: 'enableNewPricingEngine',
      description: 'Use advanced tiered pricing engine for wholesale volume discounts',
      enabled: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
      updatedBy: 'SYSTEM_BOOTSTRAP',
    },
    enableLiveProofOfDelivery: {
      key: 'enableLiveProofOfDelivery',
      description: 'Require photographic proof of delivery and OTP signature upon order handover',
      enabled: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
      updatedBy: 'SYSTEM_BOOTSTRAP',
    },
    enableExpressDelivery: {
      key: 'enableExpressDelivery',
      description: 'Enable 2-hour priority express dispatch option from Brahmpuri Hub',
      enabled: false,
      updatedAt: '2026-01-01T00:00:00.000Z',
      updatedBy: 'SYSTEM_BOOTSTRAP',
    },
    enableBulkOrderDiscounts: {
      key: 'enableBulkOrderDiscounts',
      description: 'Apply tiered quantity slab pricing automatically during order placement',
      enabled: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
      updatedBy: 'SYSTEM_BOOTSTRAP',
    },
  },

  taxPercentage: 0, // FMCG prices are GST-inclusive at wholesale
  version: 1,
};

export class BusinessSettingsService {
  private static STORAGE_KEY = 'mrfutkar_business_settings';
  private static cachedSettings: BusinessSettings = defaultBusinessSettings;

  static getSettings(): BusinessSettings {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        this.cachedSettings = { ...defaultBusinessSettings, ...JSON.parse(saved) };
        return this.cachedSettings;
      }
    } catch {
      // Fallback
    }
    return this.cachedSettings;
  }

  static updateSettings(newSettings: Partial<BusinessSettings>): BusinessSettings {
    const current = this.getSettings();
    const updated = { ...current, ...newSettings };
    this.cachedSettings = updated;
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Fallback
    }
    return updated;
  }

  /**
   * Reads from Firestore businessSettings/global with fallback to /api/settings/public
   */
  static async fetchSettings(): Promise<BusinessSettings> {
    // 1. Try public server API first (cleanest public config)
    try {
      const res = await fetch('/api/settings/public');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.settings) {
          const merged: BusinessSettings = {
            ...defaultBusinessSettings,
            ...data.settings,
          };
          this.cachedSettings = merged;
          try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(merged));
          } catch {
            // ignore
          }
          return merged;
        }
      }
    } catch {
      // Fallback to direct Firestore read
    }

    // 2. Direct Firestore read fallback
    try {
      const docRef = doc(db, 'businessSettings', 'global');
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        const remoteData = snap.data() as Partial<BusinessSettings>;
        const merged: BusinessSettings = {
          ...defaultBusinessSettings,
          ...remoteData,
        };
        this.cachedSettings = merged;
        try {
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(merged));
        } catch {
          // ignore
        }
        return merged;
      }
    } catch {
      // Graceful local configuration fallback
    }
    return this.getSettings();
  }

  static calculateDeliveryFee(subtotal: number, settings?: BusinessSettings): number {
    const conf = settings || this.getSettings();
    if (subtotal <= 0) return 0;
    return subtotal >= conf.freeDeliveryThreshold ? 0 : conf.defaultDeliveryCharge;
  }

  static isMinimumOrderMet(subtotal: number, settings?: BusinessSettings): boolean {
    const conf = settings || this.getSettings();
    return subtotal >= conf.minimumOrderValue;
  }

  static getRemainingForMinimumOrder(subtotal: number, settings?: BusinessSettings): number {
    const conf = settings || this.getSettings();
    return Math.max(0, conf.minimumOrderValue - subtotal);
  }

  static getRemainingForFreeDelivery(subtotal: number, settings?: BusinessSettings): number {
    const conf = settings || this.getSettings();
    return Math.max(0, conf.freeDeliveryThreshold - subtotal);
  }

  static isOrderCancellable(status: string, settings?: BusinessSettings): boolean {
    const conf = settings || this.getSettings();
    if (!conf.allowOrderCancellation) return false;
    return (conf.cancellationAllowedStatuses || []).includes(status);
  }
}
