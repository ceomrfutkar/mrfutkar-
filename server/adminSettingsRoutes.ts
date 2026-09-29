import { Router, Request, Response } from 'express';
import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN } from './firebaseAdmin';
import { requireSuperAdmin, logAdminAudit } from './adminAuth';
import { BusinessSettings, defaultBusinessSettings } from '../src/config/businessSettings';

export const adminSettingsRouter = Router();

// Strict SUPER_ADMIN enforcement on all settings management routes
adminSettingsRouter.use(requireSuperAdmin());

const ALLOWED_SETTING_KEYS = new Set([
  'businessName',
  'legalName',
  'supportPhone',
  'supportEmail',
  'businessAddress',
  'city',
  'state',
  'pincode',
  'currency',
  'timezone',
  'minimumOrderValue',
  'maximumOrderValue',
  'allowOrderCancellation',
  'cancellationAllowedStatuses',
  'maxOrderItemsCount',
  'defaultDeliveryCharge',
  'freeDeliveryThreshold',
  'defaultEstimatedDelivery',
  'deliveryServiceAreas',
  'allowCOD',
  'allowUPI',
  'allowOnlinePayment',
  'minCodOrderValue',
  'maxCodOrderValue',
  'retailerRegistrationEnabled',
  'defaultCreditLimit',
  'requireGstinForRegistration',
  'defaultProductMoq',
  'defaultProductActive',
  'defaultLowStockThreshold',
  'maxProductImages',
  'maxImageSizeBytes',
  'allowedImageFormats',
  'preventNegativeStock',
  'stockWarningThreshold',
  'pushNotificationsEnabled',
  'inAppNotificationsEnabled',
  'orderStatusNotifications',
  'inventoryAlertsEnabled',
  'defaultWarehouseId',
  'defaultWarehouseName',
  'dispatchCutoffTime',
  'autoAssignDeliveryPartner',
  'sessionTimeoutMinutes',
  'maxFailedLoginAttempts',
  'requireStrongPasswords',
  'featureFlags',
  'taxPercentage',
  'version',
]);

const FORBIDDEN_CLIENT_FIELDS = new Set([
  'updatedAt',
  'updatedBy',
  'createdAt',
  'createdBy',
  'adminUid',
  '_serverTxnToken',
  '_serverWriteNonce',
]);

/**
 * Validates settings mutation payload with strict bounds and types
 */
function validateSettingsPayload(payload: any): { valid: boolean; errors: string[]; sanitized: Partial<BusinessSettings> } {
  const errors: string[] = [];
  const sanitized: Partial<BusinessSettings> = {};

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, errors: ['Settings payload must be a non-empty object.'], sanitized: {} };
  }

  // 1. Check for unknown fields or forbidden client-provided system fields
  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_CLIENT_FIELDS.has(key)) {
      errors.push(`Field '${key}' is server-derived and cannot be set by client.`);
      continue;
    }
    if (!ALLOWED_SETTING_KEYS.has(key)) {
      errors.push(`Unknown settings field '${key}' is not recognized.`);
    }
  }

  // Helper for numeric validation
  const validateNumber = (
    field: string,
    min: number,
    max: number,
    mustBeInteger = false
  ) => {
    if (payload[field] === undefined) return;
    const val = payload[field];
    if (typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val)) {
      errors.push(`Field '${field}' must be a valid finite number.`);
      return;
    }
    if (val < min) {
      errors.push(`Field '${field}' must be greater than or equal to ${min}.`);
      return;
    }
    if (val > max) {
      errors.push(`Field '${field}' must be less than or equal to ${max}.`);
      return;
    }
    if (mustBeInteger && !Number.isInteger(val)) {
      errors.push(`Field '${field}' must be an integer.`);
      return;
    }
    (sanitized as any)[field] = val;
  };

  // Helper for boolean validation
  const validateBoolean = (field: string) => {
    if (payload[field] === undefined) return;
    const val = payload[field];
    if (typeof val !== 'boolean') {
      errors.push(`Field '${field}' must be a boolean (true/false).`);
      return;
    }
    (sanitized as any)[field] = val;
  };

  // Helper for string validation
  const validateString = (field: string, minLen: number, maxLen: number, regex?: RegExp) => {
    if (payload[field] === undefined) return;
    const val = payload[field];
    if (typeof val !== 'string') {
      errors.push(`Field '${field}' must be a string.`);
      return;
    }
    const trimmed = val.trim();
    if (trimmed.length < minLen || trimmed.length > maxLen) {
      errors.push(`Field '${field}' must be between ${minLen} and ${maxLen} characters.`);
      return;
    }
    if (regex && !regex.test(trimmed)) {
      errors.push(`Field '${field}' has an invalid format.`);
      return;
    }
    (sanitized as any)[field] = trimmed;
  };

  // 2. Validate Business Profile
  validateString('businessName', 1, 100);
  validateString('legalName', 1, 150);
  validateString('supportPhone', 5, 30);
  validateString('supportEmail', 5, 100, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  validateString('businessAddress', 5, 250);
  validateString('city', 1, 60);
  validateString('state', 1, 60);
  validateString('pincode', 6, 6, /^[0-9]{6}$/);

  if (payload.currency !== undefined) {
    if (payload.currency !== 'INR') {
      errors.push("Currency is fixed to 'INR' for MR FUTKAR domestic wholesale operations.");
    } else {
      sanitized.currency = 'INR';
    }
  }

  if (payload.timezone !== undefined) {
    if (payload.timezone !== 'Asia/Kolkata') {
      errors.push("Timezone is fixed to 'Asia/Kolkata'.");
    } else {
      sanitized.timezone = 'Asia/Kolkata';
    }
  }

  // 3. Validate Order Settings
  validateNumber('minimumOrderValue', 0, 1000000);
  validateNumber('maximumOrderValue', 1, 50000000);
  validateBoolean('allowOrderCancellation');
  validateNumber('maxOrderItemsCount', 1, 500, true);

  if (payload.cancellationAllowedStatuses !== undefined) {
    if (!Array.isArray(payload.cancellationAllowedStatuses)) {
      errors.push('Field cancellationAllowedStatuses must be an array of order status strings.');
    } else {
      const allowed = ['PLACED', 'CONFIRMED', 'ACCEPTED', 'PICKING'];
      const invalid = payload.cancellationAllowedStatuses.filter((s: any) => typeof s !== 'string' || !allowed.includes(s));
      if (invalid.length > 0) {
        errors.push(`Invalid cancellationAllowedStatuses: ${invalid.join(', ')}. Must be within [PLACED, CONFIRMED, ACCEPTED, PICKING].`);
      } else {
        sanitized.cancellationAllowedStatuses = payload.cancellationAllowedStatuses;
      }
    }
  }

  // Cross-check: maxOrderValue >= minOrderValue
  const effectiveMinOrder = sanitized.minimumOrderValue ?? payload.minimumOrderValue;
  const effectiveMaxOrder = sanitized.maximumOrderValue ?? payload.maximumOrderValue;
  if (effectiveMinOrder !== undefined && effectiveMaxOrder !== undefined && effectiveMaxOrder < effectiveMinOrder) {
    errors.push('maximumOrderValue must be greater than or equal to minimumOrderValue.');
  }

  // 4. Validate Delivery Settings
  validateNumber('defaultDeliveryCharge', 0, 10000);
  validateNumber('freeDeliveryThreshold', 0, 1000000);
  validateString('defaultEstimatedDelivery', 1, 150);

  if (payload.deliveryServiceAreas !== undefined) {
    if (!Array.isArray(payload.deliveryServiceAreas)) {
      errors.push('Field deliveryServiceAreas must be an array of service area names.');
    } else {
      const cleaned = payload.deliveryServiceAreas
        .filter((a: any) => typeof a === 'string' && a.trim().length > 0)
        .map((a: string) => a.trim());
      sanitized.deliveryServiceAreas = cleaned;
    }
  }

  // 5. Validate Payment / COD Settings
  validateBoolean('allowCOD');
  validateBoolean('allowUPI');
  validateBoolean('allowOnlinePayment');
  validateNumber('minCodOrderValue', 0, 1000000);
  validateNumber('maxCodOrderValue', 0, 1000000);

  // Cross-check: maxCodOrderValue >= minCodOrderValue
  const effectiveMinCod = sanitized.minCodOrderValue ?? payload.minCodOrderValue;
  const effectiveMaxCod = sanitized.maxCodOrderValue ?? payload.maxCodOrderValue;
  if (effectiveMinCod !== undefined && effectiveMaxCod !== undefined && effectiveMaxCod < effectiveMinCod) {
    errors.push('maxCodOrderValue must be greater than or equal to minCodOrderValue.');
  }

  // 6. Validate Retailer Settings
  validateBoolean('retailerRegistrationEnabled');
  validateNumber('defaultCreditLimit', 0, 10000000);
  validateBoolean('requireGstinForRegistration');

  // 7. Validate Product / Catalog Defaults
  validateNumber('defaultProductMoq', 1, 1000, true);
  validateBoolean('defaultProductActive');
  validateNumber('defaultLowStockThreshold', 0, 10000, true);
  validateNumber('maxProductImages', 1, 15, true);
  validateNumber('maxImageSizeBytes', 100000, 25000000, true);

  if (payload.allowedImageFormats !== undefined) {
    if (!Array.isArray(payload.allowedImageFormats)) {
      errors.push('Field allowedImageFormats must be an array of MIME type strings.');
    } else {
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
      const invalidMimes = payload.allowedImageFormats.filter((m: any) => typeof m !== 'string' || !allowedMimes.includes(m));
      if (invalidMimes.length > 0) {
        errors.push(`Invalid image formats: ${invalidMimes.join(', ')}. Supported: ${allowedMimes.join(', ')}.`);
      } else {
        sanitized.allowedImageFormats = payload.allowedImageFormats;
      }
    }
  }

  // 8. Validate Inventory Defaults
  validateBoolean('preventNegativeStock');
  validateNumber('stockWarningThreshold', 0, 1000, true);

  // 9. Validate Notification Settings
  validateBoolean('pushNotificationsEnabled');
  validateBoolean('inAppNotificationsEnabled');
  validateBoolean('orderStatusNotifications');
  validateBoolean('inventoryAlertsEnabled');

  // 10. Validate Warehouse Settings (Must keep canonical warehouse)
  if (payload.defaultWarehouseId !== undefined) {
    if (payload.defaultWarehouseId !== 'WH-BRAHMPURI-01') {
      errors.push("Operational warehouse ID is strictly fixed to 'WH-BRAHMPURI-01' (Brahmpuri Hub).");
    } else {
      sanitized.defaultWarehouseId = 'WH-BRAHMPURI-01';
    }
  }
  validateString('defaultWarehouseName', 1, 100);
  validateString('dispatchCutoffTime', 4, 5, /^([01]\d|2[0-3]):[0-5]\d$/);
  validateBoolean('autoAssignDeliveryPartner');

  // 11. Validate Security Operational Settings
  validateNumber('sessionTimeoutMinutes', 5, 1440, true);
  validateNumber('maxFailedLoginAttempts', 1, 20, true);
  validateBoolean('requireStrongPasswords');

  // 12. Validate Feature Flags
  if (payload.featureFlags !== undefined) {
    if (typeof payload.featureFlags !== 'object' || Array.isArray(payload.featureFlags) || payload.featureFlags === null) {
      errors.push('Field featureFlags must be an object map of feature flags.');
    } else {
      const sanitizedFlags: Record<string, any> = {};
      for (const [fKey, fVal] of Object.entries(payload.featureFlags)) {
        if (!fVal || typeof fVal !== 'object') {
          errors.push(`Feature flag '${fKey}' must be an object with { key, description, enabled }.`);
          continue;
        }
        const flagObj = fVal as any;
        if (typeof flagObj.enabled !== 'boolean') {
          errors.push(`Feature flag '${fKey}.enabled' must be a boolean.`);
          continue;
        }
        sanitizedFlags[fKey] = {
          key: fKey,
          description: typeof flagObj.description === 'string' ? flagObj.description.slice(0, 200) : '',
          enabled: flagObj.enabled,
          updatedAt: new Date().toISOString(),
          updatedBy: 'SUPER_ADMIN',
        };
      }
      sanitized.featureFlags = sanitizedFlags;
    }
  }

  // 13. Validate Tax Percentage
  validateNumber('taxPercentage', 0, 100);

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}

/**
 * GET /api/admin/settings
 * Super Admin reads canonical business configuration from businessSettings/global
 * Audited; no secrets returned.
 */
adminSettingsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser;
    const settingsDocRef = doc(db, 'businessSettings', 'global');
    const snap = await getDoc(settingsDocRef);

    let currentSettings: BusinessSettings;
    if (!snap.exists()) {
      // Bootstrap canonical settings in Firestore
      currentSettings = {
        ...defaultBusinessSettings,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: adminUser?.uid || 'SUPER_ADMIN_BOOTSTRAP',
      };
      await runTransaction(db, async txn => {
        txn.set(settingsDocRef, {
          ...currentSettings,
          _serverTxnToken: SERVER_TXN_TOKEN,
        });
      });
    } else {
      currentSettings = {
        ...defaultBusinessSettings,
        ...(snap.data() as Partial<BusinessSettings>),
      };
    }

    // Ensure version field exists
    if (!currentSettings.version) {
      currentSettings.version = 1;
    }

    // Audit log settings view
    await logAdminAudit({
      action: 'ADMIN_SETTINGS_VIEW',
      adminUid: adminUser?.uid,
      adminName: adminUser?.name,
      targetType: 'BUSINESS_SETTINGS',
      targetId: 'global',
      metadata: { version: currentSettings.version },
      req,
    });

    // Strip internal server tokens if any (defensive)
    const { _serverTxnToken, _serverWriteNonce, ...safeSettings }: any = currentSettings;

    return res.status(200).json({
      success: true,
      settings: safeSettings,
      version: safeSettings.version,
    });
  } catch (err: any) {
    console.error('Error fetching admin business settings:', err);
    return res.status(500).json({
      success: false,
      error: 'SETTINGS_FETCH_FAILED',
      message: err.message || 'Unable to retrieve business settings.',
    });
  }
});

/**
 * PUT /api/admin/settings
 * Atomic, server-authoritative update of canonical businessSettings/global
 * Enforces:
 * 1. Super Admin authentication
 * 2. Strict input validation and field allowlisting
 * 3. Optimistic concurrency check (version matching)
 * 4. Atomic Firestore transaction
 * 5. Immutable audit log entry
 */
adminSettingsRouter.put('/', async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser;
    const body = req.body || {};

    // Support payload wrapped in { settings: {...}, version: 1 } or flat { ...settings, version: 1 }
    const rawSettings = body.settings && typeof body.settings === 'object' ? body.settings : body;
    const clientVersion = body.version ?? rawSettings.version ?? body.currentVersion;

    // 1. Validate payload
    const { valid, errors, sanitized } = validateSettingsPayload(rawSettings);
    if (!valid) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SETTINGS_PAYLOAD',
        message: 'Validation failed for one or more settings fields.',
        details: errors,
      });
    }

    if (Object.keys(sanitized).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'EMPTY_SETTINGS_UPDATE',
        message: 'No valid setting fields provided to update.',
      });
    }

    const settingsDocRef = doc(db, 'businessSettings', 'global');
    let updatedSettings: BusinessSettings | null = null;
    let newVersion = 1;
    let changedFields: string[] = [];
    let previousValues: Record<string, any> = {};
    let newValues: Record<string, any> = {};

    // 2. Atomic Transaction with Optimistic Concurrency Protection
    await runTransaction(db, async txn => {
      const snap = await txn.get(settingsDocRef);
      const existingData: Partial<BusinessSettings> = snap.exists()
        ? (snap.data() as Partial<BusinessSettings>)
        : defaultBusinessSettings;

      const currentVersion = Number(existingData.version) || 1;

      // Check version concurrency if client provided a version
      if (clientVersion !== undefined && clientVersion !== null) {
        const parsedClientVersion = Number(clientVersion);
        if (parsedClientVersion !== currentVersion) {
          throw new Error(`SETTINGS_VERSION_CONFLICT: Expected version ${parsedClientVersion} but database version is ${currentVersion}.`);
        }
      }

      newVersion = currentVersion + 1;
      const now = new Date().toISOString();

      // Collect diff for audit log
      for (const [key, value] of Object.entries(sanitized)) {
        if (JSON.stringify((existingData as any)[key]) !== JSON.stringify(value)) {
          changedFields.push(key);
          previousValues[key] = (existingData as any)[key] ?? null;
          newValues[key] = value;
        }
      }

      const mergedSettings: BusinessSettings = {
        ...defaultBusinessSettings,
        ...existingData,
        ...sanitized,
        version: newVersion,
        updatedAt: now,
        updatedBy: adminUser.uid,
      };

      txn.set(settingsDocRef, {
        ...mergedSettings,
        _serverTxnToken: SERVER_TXN_TOKEN,
        _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      });

      updatedSettings = mergedSettings;
    });

    if (!updatedSettings) {
      throw new Error('Failed to commit settings transaction.');
    }

    // 3. Create immutable audit log
    await logAdminAudit({
      action: 'ADMIN_SETTINGS_UPDATED',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'BUSINESS_SETTINGS',
      targetId: 'global',
      metadata: {
        newVersion,
        changedFields,
        previousValues,
        newValues,
        updateCount: changedFields.length,
      },
      req,
    });

    // Strip internal server tokens
    const { _serverTxnToken, _serverWriteNonce, ...safeResult }: any = updatedSettings;

    return res.status(200).json({
      success: true,
      settings: safeResult,
      version: newVersion,
      changedFields,
      message: 'Business settings updated successfully.',
    });
  } catch (err: any) {
    if (err.message?.includes('SETTINGS_VERSION_CONFLICT')) {
      return res.status(409).json({
        success: false,
        error: 'SETTINGS_VERSION_CONFLICT',
        message: 'Settings were modified by another administrator. Please reload and try again.',
      });
    }

    console.error('Error updating admin business settings:', err);
    return res.status(500).json({
      success: false,
      error: 'SETTINGS_UPDATE_FAILED',
      message: err.message || 'Unable to update business settings.',
    });
  }
});
