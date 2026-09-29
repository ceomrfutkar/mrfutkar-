import React, { useState, useEffect, useCallback } from 'react';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminClient } from '../../services/adminClient';
import { BusinessSettings, defaultBusinessSettings } from '../../config/businessSettings';

type SettingsTab =
  | 'BUSINESS'
  | 'ORDERS'
  | 'DELIVERY'
  | 'PAYMENTS'
  | 'RETAILER'
  | 'CATALOG'
  | 'INVENTORY'
  | 'NOTIFICATIONS'
  | 'WAREHOUSE'
  | 'SECURITY'
  | 'FEATURE_FLAGS';

interface TabItem {
  id: SettingsTab;
  label: string;
  icon: string;
  description: string;
}

const TABS: TabItem[] = [
  { id: 'BUSINESS', label: 'Business Profile', icon: '🏢', description: 'Company identity, contact info & regional constants' },
  { id: 'ORDERS', label: 'Order Settings', icon: '📦', description: 'Order thresholds, cancellation policies & limits' },
  { id: 'DELIVERY', label: 'Delivery Rules', icon: '🚚', description: 'Dispatch charges, free delivery & coverage areas' },
  { id: 'PAYMENTS', label: 'Payment & COD', icon: '💳', description: 'Payment gateways, COD restrictions & bounds' },
  { id: 'RETAILER', label: 'Retailer Onboarding', icon: '🏪', description: 'Kirana registration controls & default credit limits' },
  { id: 'CATALOG', label: 'Product & Catalog', icon: '🏷️', description: 'Default MOQ, images, file formats & catalog status' },
  { id: 'INVENTORY', label: 'Inventory Rules', icon: '🏬', description: 'Low-stock alert thresholds & negative stock guards' },
  { id: 'NOTIFICATIONS', label: 'Notifications', icon: '🔔', description: 'Push notifications & order status channel toggles' },
  { id: 'WAREHOUSE', label: 'Warehouse Hub', icon: '🏭', description: 'Operational fulfillment hub constants & cut-off times' },
  { id: 'SECURITY', label: 'Operational Security', icon: '🛡️', description: 'Session timeouts & dynamic access policies' },
  { id: 'FEATURE_FLAGS', label: 'Feature Flags', icon: '🚩', description: 'Platform capability toggles & operational flags' },
];

export const AdminSettingsScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('BUSINESS');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState(false);

  // Authoritative database copy
  const [dbSettings, setDbSettings] = useState<BusinessSettings>(defaultBusinessSettings);
  const [version, setVersion] = useState<number>(1);

  // Form draft copy
  const [formData, setFormData] = useState<BusinessSettings>(defaultBusinessSettings);

  // Confirmation dialog
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  // Fetch settings from server
  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    setConflictError(false);
    try {
      const res = await AdminClient.fetchSettings();
      if (res.success && res.settings) {
        setDbSettings(res.settings);
        setFormData(res.settings);
        setVersion(res.version || res.settings.version || 1);
      } else {
        setError(res.message || 'Failed to load business settings.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error while fetching settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Determine dirty/unsaved fields
  const isDirty = JSON.stringify(formData) !== JSON.stringify(dbSettings);

  const getChangedCount = (): number => {
    let count = 0;
    for (const key of Object.keys(formData) as (keyof BusinessSettings)[]) {
      if (JSON.stringify(formData[key]) !== JSON.stringify(dbSettings[key])) {
        count++;
      }
    }
    return count;
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  const handleFieldChange = <K extends keyof BusinessSettings>(key: K, value: BusinessSettings[K]) => {
    setFormData(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleDiscard = () => {
    setFormData(dbSettings);
    setValidationErrors([]);
    showToast('Changes discarded.');
  };

  const handleSaveClick = () => {
    // If critical changes are made (like disabling COD or changing warehouse), show confirmation modal
    const isCritical =
      formData.allowCOD !== dbSettings.allowCOD ||
      formData.minimumOrderValue !== dbSettings.minimumOrderValue ||
      formData.retailerRegistrationEnabled !== dbSettings.retailerRegistrationEnabled;

    if (isCritical) {
      setConfirmModalOpen(true);
    } else {
      executeSave();
    }
  };

  const executeSave = async () => {
    setConfirmModalOpen(false);
    setSaving(true);
    setError(null);
    setValidationErrors([]);
    setConflictError(false);

    try {
      // Build diff payload to send only what needs updating
      const payload: Partial<BusinessSettings> = { ...formData };
      // Strip client-forbidden fields defensively
      delete (payload as any).updatedAt;
      delete (payload as any).updatedBy;
      delete (payload as any)._serverTxnToken;

      const res = await AdminClient.updateSettings(payload, version);

      if (res.status === 409) {
        setConflictError(true);
        setError('Settings were modified by another administrator. Please reload to review the latest settings.');
        return;
      }

      if (res.success && res.settings) {
        setDbSettings(res.settings);
        setFormData(res.settings);
        setVersion(res.version || res.settings.version || (version + 1));
        showToast('Business settings successfully saved & synchronized!');
      } else {
        setError(res.message || 'Failed to update settings.');
        if (res.details && Array.isArray(res.details)) {
          setValidationErrors(res.details);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Settings & Business Configuration"
        subtitle="Manage centralized platform policies, operational rules, fulfillment defaults, and feature flags"
        actions={
          <div className="flex items-center gap-3">
            {isDirty && (
              <button
                onClick={handleDiscard}
                disabled={saving}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors shadow-2xs"
              >
                Discard ({getChangedCount()})
              </button>
            )}
            <button
              onClick={handleSaveClick}
              disabled={!isDirty || saving}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md shadow-2xs transition-colors flex items-center gap-1.5 ${
                isDirty && !saving
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {saving ? (
                <>
                  <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                  Saving...
                </>
              ) : (
                <>
                  <span>💾</span>
                  Save Changes {isDirty && `(${getChangedCount()})`}
                </>
              )}
            </button>
          </div>
        }
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-700 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium animate-fade-in">
          <span>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Version & Metadata Badge */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-slate-800">
            Canonical Version: <span className="text-blue-600">v{version}</span>
          </span>
          <span>•</span>
          <span>
            Target Store: <strong className="text-slate-800">MR FUTKAR — BRAHMPURI (WH-BRAHMPURI-01)</strong>
          </span>
          {dbSettings.updatedAt && (
            <>
              <span>•</span>
              <span>Last Modified: {new Date(dbSettings.updatedAt).toLocaleString()}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isDirty ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-amber-800 bg-amber-100 font-medium">
              ● Unsaved local changes ({getChangedCount()})
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-emerald-800 bg-emerald-100 font-medium">
              ✓ Synchronized with cloud
            </span>
          )}
        </div>
      </div>

      {/* Conflict Error Notice */}
      {conflictError && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-sm text-rose-800 flex items-center justify-between gap-4">
          <div>
            <strong>Concurrency Conflict (409):</strong> Another administrator has updated the settings document in the cloud.
            To avoid overwriting their work, please reload the latest settings.
          </div>
          <button
            onClick={loadSettings}
            className="px-3 py-1.5 bg-rose-600 text-white text-xs font-semibold rounded-md hover:bg-rose-700"
          >
            Reload Latest
          </button>
        </div>
      )}

      {/* General Error Banner */}
      {error && !conflictError && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-sm text-rose-800">
          <p className="font-semibold">Unable to complete request</p>
          <p>{error}</p>
          {validationErrors.length > 0 && (
            <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Main Grid: Tabs on Left, Config Panel on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-1 space-y-1 bg-white border border-slate-200 rounded-xl p-2 shadow-2xs">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-3 ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold border-l-4 border-blue-600'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="text-base">{tab.icon}</span>
                <div className="truncate">
                  <div className="truncate">{tab.label}</div>
                  <div className="text-[10px] text-slate-400 font-normal truncate">{tab.description}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Tab Content Panel */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-6 shadow-2xs min-h-[480px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400 space-y-3">
              <div className="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full" />
              <p className="text-sm">Loading canonical settings...</p>
            </div>
          ) : (
            <>
              {/* TAB 1: BUSINESS PROFILE */}
              {activeTab === 'BUSINESS' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Business Profile & Identity</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Store contact coordinates, registered company title, and operating regional standards.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Trading Name (Brand)</label>
                      <input
                        type="text"
                        value={formData.businessName || ''}
                        onChange={e => handleFieldChange('businessName', e.target.value)}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                        placeholder="MR FUTKAR"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Legal Entity Title</label>
                      <input
                        type="text"
                        value={formData.legalName || ''}
                        onChange={e => handleFieldChange('legalName', e.target.value)}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                        placeholder="MR FUTKAR Wholesale Groceries Pvt. Ltd."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Support Phone</label>
                      <input
                        type="text"
                        value={formData.supportPhone || ''}
                        onChange={e => handleFieldChange('supportPhone', e.target.value)}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                        placeholder="+91 11 22981000"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Support Email</label>
                      <input
                        type="email"
                        value={formData.supportEmail || ''}
                        onChange={e => handleFieldChange('supportEmail', e.target.value)}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                        placeholder="support@mrfutkar.com"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">Hub Physical Address</label>
                      <input
                        type="text"
                        value={formData.businessAddress || ''}
                        onChange={e => handleFieldChange('businessAddress', e.target.value)}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                        placeholder="Main Brahmpuri Road, Near Brahmpuri Bus Terminal"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">City</label>
                      <input
                        type="text"
                        value={formData.city || ''}
                        onChange={e => handleFieldChange('city', e.target.value)}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                        placeholder="Delhi"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">State</label>
                      <input
                        type="text"
                        value={formData.state || ''}
                        onChange={e => handleFieldChange('state', e.target.value)}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                        placeholder="Delhi"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Pincode</label>
                      <input
                        type="text"
                        value={formData.pincode || ''}
                        onChange={e => handleFieldChange('pincode', e.target.value)}
                        maxLength={6}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                        placeholder="110053"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Operating Currency <span className="text-slate-400 font-normal">(System Constant)</span>
                      </label>
                      <input
                        type="text"
                        value="INR (₹)"
                        disabled
                        className="w-full text-xs px-3 py-2 border border-slate-200 bg-slate-100 text-slate-500 rounded-lg cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: ORDER SETTINGS */}
              {activeTab === 'ORDERS' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Wholesale Order Policies</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Configure minimum order value constraints, single-order caps, and retailer cancellation terms.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Minimum Order Value (MOV in ₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        value={formData.minimumOrderValue}
                        onChange={e => handleFieldChange('minimumOrderValue', Number(e.target.value))}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Retailers cannot submit orders below this value.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Maximum Order Limit (₹)
                      </label>
                      <input
                        type="number"
                        min="1000"
                        step="1000"
                        value={formData.maximumOrderValue || 500000}
                        onChange={e => handleFieldChange('maximumOrderValue', Number(e.target.value))}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Single transaction limit to mitigate fraud risk.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Max Line Items per Order
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        value={formData.maxOrderItemsCount || 100}
                        onChange={e => handleFieldChange('maxOrderItemsCount', Number(e.target.value))}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Prevents oversized picking slips in warehouse.</p>
                    </div>

                    <div className="flex items-center gap-3 pt-6">
                      <input
                        type="checkbox"
                        id="allowOrderCancellation"
                        checked={formData.allowOrderCancellation}
                        onChange={e => handleFieldChange('allowOrderCancellation', e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="allowOrderCancellation" className="text-xs font-medium text-slate-700">
                        Allow Retailer Order Cancellation
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Cancellable Order Status Stages
                    </label>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Retailers may only cancel while the order has not progressed past these operational stages:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {['PLACED', 'CONFIRMED', 'ACCEPTED', 'PICKING'].map(status => {
                        const isSelected = (formData.cancellationAllowedStatuses || []).includes(status);
                        return (
                          <button
                            type="button"
                            key={status}
                            onClick={() => {
                              const current = formData.cancellationAllowedStatuses || [];
                              if (isSelected) {
                                handleFieldChange(
                                  'cancellationAllowedStatuses',
                                  current.filter(s => s !== status)
                                );
                              } else {
                                handleFieldChange('cancellationAllowedStatuses', [...current, status]);
                              }
                            }}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            {isSelected ? '✓ ' : '+ '}
                            {status}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: DELIVERY SETTINGS */}
              {activeTab === 'DELIVERY' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Delivery Rules & Thresholds</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Configure dispatch fees, free shipping criteria, and designated coverage zones.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Default Hub Delivery Charge (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="5"
                        value={formData.defaultDeliveryCharge}
                        onChange={e => handleFieldChange('defaultDeliveryCharge', Number(e.target.value))}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Applied when subtotal is below free delivery.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Free Delivery Threshold (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={formData.freeDeliveryThreshold}
                        onChange={e => handleFieldChange('freeDeliveryThreshold', Number(e.target.value))}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Orders at or above this receive ₹0 delivery fee.</p>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Default Estimated Delivery Promise
                      </label>
                      <input
                        type="text"
                        value={formData.defaultEstimatedDelivery || ''}
                        onChange={e => handleFieldChange('defaultEstimatedDelivery', e.target.value)}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                        placeholder="Today within 4 hours (Brahmpuri Hub)"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Designated Coverage Service Areas
                      </label>
                      <input
                        type="text"
                        value={(formData.deliveryServiceAreas || []).join(', ')}
                        onChange={e => {
                          const areas = e.target.value
                            .split(',')
                            .map(s => s.trim())
                            .filter(Boolean);
                          handleFieldChange('deliveryServiceAreas', areas);
                        }}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                        placeholder="Brahmpuri, Karawal Nagar, Yamuna Vihar, Seelampur, Shahdara, Bhajanpura"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Comma-separated list of active Kirana delivery zones.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: PAYMENT & COD */}
              {activeTab === 'PAYMENTS' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Payment Gateways & COD Controls</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Enable or disable wholesale checkout payment methods and cash limits.
                    </p>
                  </div>

                  <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold text-slate-800">Cash on Delivery (COD)</div>
                        <div className="text-[11px] text-slate-500">Allow retailers to pay upon delivery handover.</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.allowCOD}
                        onChange={e => handleFieldChange('allowCOD', e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <div>
                        <div className="text-xs font-semibold text-slate-800">UPI Instant Payment</div>
                        <div className="text-[11px] text-slate-500">Allow payment via PhonePe, GPay, Paytm UPI QR.</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.allowUPI}
                        onChange={e => handleFieldChange('allowUPI', e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <div>
                        <div className="text-xs font-semibold text-slate-800">Online Gateway (Cards / NetBanking)</div>
                        <div className="text-[11px] text-slate-500">Enable verified online payment gateway.</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.allowOnlinePayment}
                        onChange={e => handleFieldChange('allowOnlinePayment', e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Minimum COD Order Value (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.minCodOrderValue || 0}
                        onChange={e => handleFieldChange('minCodOrderValue', Number(e.target.value))}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Maximum COD Order Cap (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="5000"
                        value={formData.maxCodOrderValue || 50000}
                        onChange={e => handleFieldChange('maxCodOrderValue', Number(e.target.value))}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Orders above this must use digital payment.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: RETAILER ONBOARDING */}
              {activeTab === 'RETAILER' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Retailer Registration & Defaults</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Configure self-service Kirana signup availability and initial account credit.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg">
                      <div>
                        <div className="text-xs font-semibold text-slate-800">Retailer Self-Registration</div>
                        <div className="text-[11px] text-slate-500">
                          Allow new Kirana shop owners to create wholesale accounts.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.retailerRegistrationEnabled}
                        onChange={e => handleFieldChange('retailerRegistrationEnabled', e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg">
                      <div>
                        <div className="text-xs font-semibold text-slate-800">Mandate GSTIN for Registration</div>
                        <div className="text-[11px] text-slate-500">
                          Require verified 15-digit GSTIN during onboarding.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.requireGstinForRegistration}
                        onChange={e => handleFieldChange('requireGstinForRegistration', e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Default Retailer Credit Limit (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="5000"
                        value={formData.defaultCreditLimit || 25000}
                        onChange={e => handleFieldChange('defaultCreditLimit', Number(e.target.value))}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Assigned to newly approved Kirana retailers upon profile activation.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 6: PRODUCT & CATALOG */}
              {activeTab === 'CATALOG' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Product & Catalog Defaults</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Default wholesale MOQ values, image upload limits, and new product statuses.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Default Product MOQ (Units)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={formData.defaultProductMoq || 1}
                        onChange={e => handleFieldChange('defaultProductMoq', Number(e.target.value))}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Default Low Stock Threshold (Units)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.defaultLowStockThreshold || 10}
                        onChange={e => handleFieldChange('defaultLowStockThreshold', Number(e.target.value))}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Max Images per Product
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="15"
                        value={formData.maxProductImages || 5}
                        onChange={e => handleFieldChange('maxProductImages', Number(e.target.value))}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Max Image Size (Bytes)
                      </label>
                      <input
                        type="number"
                        value={formData.maxImageSizeBytes || 5242880}
                        onChange={e => handleFieldChange('maxImageSizeBytes', Number(e.target.value))}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Default: 5,242,880 bytes (5 MB)</p>
                    </div>

                    <div className="flex items-center gap-3 pt-4">
                      <input
                        type="checkbox"
                        id="defaultProductActive"
                        checked={formData.defaultProductActive}
                        onChange={e => handleFieldChange('defaultProductActive', e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="defaultProductActive" className="text-xs font-medium text-slate-700">
                        New Products Active by Default
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 7: INVENTORY RULES */}
              {activeTab === 'INVENTORY' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Inventory Safeguards & Warnings</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Configure stock ledgers, atomic stock deductions, and negative stock guards.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg">
                      <div>
                        <div className="text-xs font-semibold text-slate-800">Prevent Negative Stock</div>
                        <div className="text-[11px] text-slate-500">
                          Strictly rejects warehouse dispatches or order checkouts if stock is insufficient.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.preventNegativeStock}
                        onChange={e => handleFieldChange('preventNegativeStock', e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Stock Warning Alert Buffer (Units)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.stockWarningThreshold || 5}
                        onChange={e => handleFieldChange('stockWarningThreshold', Number(e.target.value))}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Warehouse dashboard displays amber indicator when stock approaches threshold.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 8: NOTIFICATION SETTINGS */}
              {activeTab === 'NOTIFICATIONS' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Notification Channel Controls</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Toggle push and in-app order updates dispatched to Kirana retailers and warehouse staff.
                    </p>
                  </div>

                  <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold text-slate-800">FCM Push Notifications</div>
                        <div className="text-[11px] text-slate-500">Deliver push alerts to registered mobile devices.</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.pushNotificationsEnabled}
                        onChange={e => handleFieldChange('pushNotificationsEnabled', e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <div>
                        <div className="text-xs font-semibold text-slate-800">In-App Notification Feed</div>
                        <div className="text-[11px] text-slate-500">Record persistent in-app notifications.</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.inAppNotificationsEnabled}
                        onChange={e => handleFieldChange('inAppNotificationsEnabled', e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <div>
                        <div className="text-xs font-semibold text-slate-800">Order Lifecycle Transition Alerts</div>
                        <div className="text-[11px] text-slate-500">Send alerts for PLACED, PACKED, DISPATCHED, DELIVERED.</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.orderStatusNotifications}
                        onChange={e => handleFieldChange('orderStatusNotifications', e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <div>
                        <div className="text-xs font-semibold text-slate-800">Inventory Low-Stock Alerts</div>
                        <div className="text-[11px] text-slate-500">Notify warehouse managers on inventory depletion.</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.inventoryAlertsEnabled}
                        onChange={e => handleFieldChange('inventoryAlertsEnabled', e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 9: WAREHOUSE SETTINGS */}
              {activeTab === 'WAREHOUSE' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Warehouse Fulfillment Operations</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Operational center configurations and dispatch schedule cutoffs.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Operational Warehouse ID <span className="text-slate-400">(Canonical)</span>
                      </label>
                      <input
                        type="text"
                        value={formData.defaultWarehouseId}
                        disabled
                        className="w-full text-xs px-3 py-2 border border-slate-200 bg-slate-100 text-slate-500 rounded-lg cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Warehouse Hub Title</label>
                      <input
                        type="text"
                        value={formData.defaultWarehouseName || ''}
                        onChange={e => handleFieldChange('defaultWarehouseName', e.target.value)}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Daily Dispatch Cut-off (24h)</label>
                      <input
                        type="text"
                        value={formData.dispatchCutoffTime || '18:00'}
                        onChange={e => handleFieldChange('dispatchCutoffTime', e.target.value)}
                        placeholder="18:00"
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Orders placed after this ship the next morning.</p>
                    </div>

                    <div className="flex items-center gap-3 pt-6">
                      <input
                        type="checkbox"
                        id="autoAssignDeliveryPartner"
                        checked={formData.autoAssignDeliveryPartner}
                        onChange={e => handleFieldChange('autoAssignDeliveryPartner', e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="autoAssignDeliveryPartner" className="text-xs font-medium text-slate-700">
                        Auto-Assign Delivery Fleet
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 10: SECURITY SETTINGS */}
              {activeTab === 'SECURITY' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Dynamic Operational Security</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Session duration controls and authentication safeguards. All private API keys and credentials remain safely managed server-side.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Admin Session Timeout (Minutes)
                      </label>
                      <input
                        type="number"
                        min="15"
                        max="1440"
                        value={formData.sessionTimeoutMinutes || 480}
                        onChange={e => handleFieldChange('sessionTimeoutMinutes', Number(e.target.value))}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Default: 480 min (8 hours).</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Max Failed Login Attempts
                      </label>
                      <input
                        type="number"
                        min="3"
                        max="20"
                        value={formData.maxFailedLoginAttempts || 5}
                        onChange={e => handleFieldChange('maxFailedLoginAttempts', Number(e.target.value))}
                        className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center gap-3 pt-4 md:col-span-2">
                      <input
                        type="checkbox"
                        id="requireStrongPasswords"
                        checked={formData.requireStrongPasswords}
                        onChange={e => handleFieldChange('requireStrongPasswords', e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="requireStrongPasswords" className="text-xs font-medium text-slate-700">
                        Enforce High-Complexity Passwords for Warehouse & Admin Staff
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 11: FEATURE FLAGS */}
              {activeTab === 'FEATURE_FLAGS' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Platform Feature Flags</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Enable or disable operational platform capabilities dynamically without code deployments.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {Object.entries(formData.featureFlags || {}).map(([key, flag]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg"
                      >
                        <div className="pr-4">
                          <div className="text-xs font-semibold text-slate-800">{key}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{flag.description}</div>
                          <div className="text-[10px] text-slate-400 mt-1">
                            Last updated by {flag.updatedBy || 'SUPER_ADMIN'}
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={flag.enabled}
                          onChange={e => {
                            const updatedFlags = {
                              ...(formData.featureFlags || {}),
                              [key]: {
                                ...flag,
                                enabled: e.target.checked,
                              },
                            };
                            handleFieldChange('featureFlags', updatedFlags);
                          }}
                          className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Critical Changes */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <span className="text-2xl">⚠️</span>
              <h3 className="text-base font-semibold text-slate-900">Confirm Policy Update</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              You are about to commit changes to critical business settings (e.g. Payment methods, Minimum Order Value, or Retailer Registration).
              These changes immediately apply to all Kirana retailers and order checkouts across the platform.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={executeSave}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Confirm & Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
