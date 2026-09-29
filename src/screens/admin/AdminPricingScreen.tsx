import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AdminClient } from '../../services/adminClient';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminStatCard } from '../../components/admin/AdminStatCard';
import { AdminStatusBadge } from '../../components/admin/AdminStatusBadge';
import { PricingType, PriceSlab } from '../../types/product';

interface PricingRuleItem {
  id: string;
  pricingId?: string;
  productId: string;
  productName: string;
  productSku: string;
  productBarcode: string;
  productMrp: number;
  productWholesalePrice: number;
  productIsActive: boolean;
  retailerId?: string;
  retailerBusinessName: string;
  retailerOwnerName?: string;
  retailerMobile?: string;
  pricingType: PricingType;
  slabs?: PriceSlab[];
  priceSlabs?: PriceSlab[];
  fixedPrice?: number;
  active: boolean;
  priority?: number;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  ruleDescription?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

interface ProductOption {
  productId: string;
  productName: string;
  sku: string;
  barcode: string;
  brandName: string;
  mrp: number;
  wholesalePrice: number;
  isActive: boolean;
  stockQuantity: number;
}

interface CustomerOption {
  retailerId: string;
  businessName: string;
  ownerName: string;
  mobile: string;
  status: string;
}

export const AdminPricingScreen: React.FC = () => {
  // State: Listing & Filters
  const [rules, setRules] = useState<PricingRuleItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [pricingTypeFilter, setPricingTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Summary Metrics
  const [summary, setSummary] = useState<any>({
    totalActiveRules: 0,
    globalSlabRules: 0,
    customerSlabRules: 0,
    customerFixedRules: 0,
    productsWithCustomPricing: 0,
    totalRules: 0,
  });

  // Pickers data
  const [productsList, setProductsList] = useState<ProductOption[]>([]);
  const [customersList, setCustomersList] = useState<CustomerOption[]>([]);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [createType, setCreateType] = useState<PricingType>('GLOBAL_SLAB');
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState<boolean>(false);
  const [editingRule, setEditingRule] = useState<PricingRuleItem | null>(null);

  // Form State for Creation
  const [formProductId, setFormProductId] = useState<string>('');
  const [formRetailerId, setFormRetailerId] = useState<string>('');
  const [formFixedPrice, setFormFixedPrice] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formActive, setFormActive] = useState<boolean>(true);
  const [formSlabs, setFormSlabs] = useState<Array<{ minQuantity: number; maxQuantity: string; unitPrice: string }>>([
    { minQuantity: 1, maxQuantity: '10', unitPrice: '' },
    { minQuantity: 11, maxQuantity: '', unitPrice: '' },
  ]);
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Preview State
  const [previewProductId, setPreviewProductId] = useState<string>('');
  const [previewRetailerId, setPreviewRetailerId] = useState<string>('');
  const [previewQuantity, setPreviewQuantity] = useState<number>(1);
  const [previewResult, setPreviewResult] = useState<any | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Load rules
  const loadRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await AdminClient.fetchPricingRules({
        search: debouncedSearch,
        pricingType: pricingTypeFilter,
        status: statusFilter,
        page,
        pageSize,
      });

      if (res.success && res.rules) {
        setRules(res.rules);
        setTotalCount(res.totalCount || 0);
        setTotalPages(res.totalPages || 1);
        if (res.summary) {
          setSummary(res.summary);
        }
      } else {
        setError(res.message || 'Failed to load pricing rules.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error loading pricing rules.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, pricingTypeFilter, statusFilter, page, pageSize]);

  // Initial load & trigger on dependency change
  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // Load products and customers for selectors
  useEffect(() => {
    const fetchSelectors = async () => {
      const [prodRes, custRes] = await Promise.all([
        AdminClient.fetchPricingProducts(),
        AdminClient.fetchPricingCustomers(),
      ]);
      if (prodRes.success && prodRes.products) {
        setProductsList(prodRes.products);
      }
      if (custRes.success && custRes.customers) {
        setCustomersList(custRes.customers);
      }
    };
    fetchSelectors();
  }, []);

  // Quick Flash message
  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  // Handle Toggle Active
  const handleToggleActive = async (rule: PricingRuleItem) => {
    try {
      if (rule.active) {
        const res = await AdminClient.deactivatePricingRule(rule.id);
        if (res.success) {
          showSuccess(`Rule ${rule.id} deactivated successfully.`);
          loadRules();
        } else {
          alert(res.message || 'Failed to deactivate rule.');
        }
      } else {
        const res = await AdminClient.activatePricingRule(rule.id);
        if (res.success) {
          showSuccess(`Rule ${rule.id} activated successfully.`);
          loadRules();
        } else {
          alert(res.message || 'Failed to activate rule.');
        }
      }
    } catch (err: any) {
      alert(err.message || 'Error changing rule status.');
    }
  };

  // Handle Delete Rule
  const handleDeleteRule = async (rule: PricingRuleItem) => {
    if (!window.confirm(`Are you sure you want to permanently delete pricing rule '${rule.id}'?`)) {
      return;
    }
    try {
      const res = await AdminClient.deletePricingRule(rule.id);
      if (res.success) {
        showSuccess(`Rule ${rule.id} deleted successfully.`);
        loadRules();
      } else {
        alert(res.message || 'Failed to delete rule.');
      }
    } catch (err: any) {
      alert(err.message || 'Error deleting rule.');
    }
  };

  // Open Preview Modal pre-populated with a rule's product/customer
  const handleOpenPreviewForRule = (rule: PricingRuleItem) => {
    setPreviewProductId(rule.productId);
    setPreviewRetailerId(rule.retailerId || '');
    setPreviewQuantity(1);
    setPreviewResult(null);
    setPreviewError(null);
    setIsPreviewModalOpen(true);
  };

  // Execute Effective Price Preview
  const handleRunPreview = async () => {
    if (!previewProductId) {
      setPreviewError('Please select a product.');
      return;
    }
    if (!previewQuantity || previewQuantity < 1) {
      setPreviewError('Quantity must be at least 1.');
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await AdminClient.previewEffectivePrice({
        productId: previewProductId,
        retailerId: previewRetailerId || undefined,
        quantity: previewQuantity,
      });

      if (res.success) {
        setPreviewResult(res);
      } else {
        setPreviewError(res.message || 'Failed to resolve effective price.');
      }
    } catch (err: any) {
      setPreviewError(err.message || 'Network error running price preview.');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Add slab row in modal
  const handleAddSlabRow = () => {
    const last = formSlabs[formSlabs.length - 1];
    const nextMin = last && last.maxQuantity ? parseInt(last.maxQuantity, 10) + 1 : 10;
    setFormSlabs([...formSlabs, { minQuantity: nextMin, maxQuantity: '', unitPrice: '' }]);
  };

  // Remove slab row
  const handleRemoveSlabRow = (index: number) => {
    if (formSlabs.length <= 1) return;
    setFormSlabs(formSlabs.filter((_, i) => i !== index));
  };

  // Slab row change
  const handleSlabChange = (index: number, field: string, val: any) => {
    const updated = [...formSlabs];
    updated[index] = { ...updated[index], [field]: val };
    setFormSlabs(updated);
  };

  // Submit Rule Form
  const handleSubmitRuleForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formProductId) {
      setFormError('Please select a product.');
      return;
    }

    if ((createType === 'CUSTOMER_SLAB' || createType === 'CUSTOMER_FIXED') && !formRetailerId) {
      setFormError('Please select a customer for customer-specific pricing.');
      return;
    }

    setFormSubmitting(true);
    try {
      let payload: any = {
        productId: formProductId,
        pricingType: createType,
        active: formActive,
        ruleDescription: formDescription.trim() || undefined,
      };

      if (createType === 'CUSTOMER_SLAB' || createType === 'CUSTOMER_FIXED') {
        payload.retailerId = formRetailerId;
      }

      if (createType === 'CUSTOMER_FIXED') {
        const fp = parseFloat(formFixedPrice);
        if (isNaN(fp) || fp < 0) {
          setFormError('Fixed price must be a non-negative number.');
          setFormSubmitting(false);
          return;
        }
        payload.fixedPrice = fp;
      } else {
        // Slabs
        const formattedSlabs = formSlabs.map(s => ({
          minQuantity: Number(s.minQuantity),
          maxQuantity: s.maxQuantity !== '' && s.maxQuantity !== null ? Number(s.maxQuantity) : null,
          unitPrice: parseFloat(s.unitPrice),
        }));

        for (const s of formattedSlabs) {
          if (isNaN(s.unitPrice) || s.unitPrice < 0) {
            setFormError('Each slab must have a valid price >= 0.');
            setFormSubmitting(false);
            return;
          }
        }
        payload.slabs = formattedSlabs;
      }

      if (editingRule) {
        const res = await AdminClient.updatePricingRule(editingRule.id, payload);
        if (res.success) {
          showSuccess(`Rule ${editingRule.id} updated successfully.`);
          setIsCreateModalOpen(false);
          setEditingRule(null);
          loadRules();
        } else {
          setFormError(res.message || 'Failed to update rule.');
        }
      } else {
        const res = await AdminClient.createPricingRule(payload);
        if (res.success) {
          showSuccess(`New pricing rule created successfully.`);
          setIsCreateModalOpen(false);
          resetForm();
          loadRules();
        } else {
          setFormError(res.message || 'Failed to create pricing rule.');
        }
      }
    } catch (err: any) {
      setFormError(err.message || 'An error occurred while saving.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormProductId('');
    setFormRetailerId('');
    setFormFixedPrice('');
    setFormDescription('');
    setFormActive(true);
    setFormSlabs([
      { minQuantity: 1, maxQuantity: '10', unitPrice: '' },
      { minQuantity: 11, maxQuantity: '', unitPrice: '' },
    ]);
    setFormError(null);
    setEditingRule(null);
  };

  const openCreateModal = (type: PricingType = 'GLOBAL_SLAB') => {
    resetForm();
    setCreateType(type);
    setIsCreateModalOpen(true);
  };

  const openEditModal = (rule: PricingRuleItem) => {
    resetForm();
    setEditingRule(rule);
    setCreateType(rule.pricingType);
    setFormProductId(rule.productId);
    setFormRetailerId(rule.retailerId || '');
    setFormActive(rule.active);
    setFormDescription(rule.ruleDescription || '');

    if (rule.pricingType === 'CUSTOMER_FIXED') {
      setFormFixedPrice(String(rule.fixedPrice ?? ''));
    } else {
      const slabs = rule.slabs || rule.priceSlabs || [];
      if (slabs.length > 0) {
        setFormSlabs(
          slabs.map(s => ({
            minQuantity: s.minQuantity,
            maxQuantity: s.maxQuantity !== null && s.maxQuantity !== undefined ? String(s.maxQuantity) : '',
            unitPrice: String(s.unitPrice ?? s.slabPrice ?? ''),
          }))
        );
      }
    }
    setIsCreateModalOpen(true);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Banner Alert */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 text-sm font-semibold flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-700 hover:text-emerald-950">
            ✕
          </button>
        </div>
      )}

      {/* Page Header */}
      <AdminPageHeader
        title="Super Admin Pricing Management"
        subtitle="Manage authoritative B2B wholesale pricing rules: Global quantity slabs, customer-negotiated tiers, and fixed contracts."
        badge="Authoritative Pricing"
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                setPreviewProductId('');
                setPreviewRetailerId('');
                setPreviewQuantity(1);
                setPreviewResult(null);
                setPreviewError(null);
                setIsPreviewModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#0d1d25] text-[#f5b024] border border-[#f5b024]/40 hover:bg-[#132833] text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <span>✨</span>
              <span>Effective Price Preview</span>
            </button>

            <button
              onClick={() => openCreateModal('GLOBAL_SLAB')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#f5b024] text-slate-950 font-bold text-xs hover:bg-[#e09e19] transition-all shadow-sm cursor-pointer"
            >
              <span>+</span>
              <span>Create Pricing Rule</span>
            </button>
          </div>
        }
      />

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <AdminStatCard
          label="Active Rules"
          value={summary.totalActiveRules ?? 0}
          icon={<span>⚡</span>}
          accentColor="#10b981"
          subLabel="Currently enforced"
        />
        <AdminStatCard
          label="Global Slabs"
          value={summary.globalSlabRules ?? 0}
          icon={<span>🌐</span>}
          accentColor="#3b82f6"
          subLabel="Wholesale tiers"
        />
        <AdminStatCard
          label="Customer Slabs"
          value={summary.customerSlabRules ?? 0}
          icon={<span>🎯</span>}
          accentColor="#8b5cf6"
          subLabel="Volume tiers"
        />
        <AdminStatCard
          label="Customer Fixed"
          value={summary.customerFixedRules ?? 0}
          icon={<span>🏷️</span>}
          accentColor="#f5b024"
          subLabel="Contract rates"
        />
        <AdminStatCard
          label="Custom Products"
          value={summary.productsWithCustomPricing ?? 0}
          icon={<span>📦</span>}
          accentColor="#64748b"
          subLabel="With custom rates"
        />
        <AdminStatCard
          label="Total Rules"
          value={summary.totalRules ?? 0}
          icon={<span>📊</span>}
          accentColor="#475569"
          subLabel="In catalogue"
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1 w-full">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
              🔍
            </span>
            <input
              type="text"
              placeholder="Search product name, SKU, barcode, customer name, ID, or rule ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#f5b024] focus:border-transparent bg-slate-50/50"
            />
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            {/* Rule Type Filter */}
            <select
              value={pricingTypeFilter}
              onChange={e => {
                setPricingTypeFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-[#f5b024]"
            >
              <option value="ALL">All Rule Types</option>
              <option value="GLOBAL_SLAB">Global Slabs (GLOBAL_SLAB)</option>
              <option value="CUSTOMER_SLAB">Customer Slabs (CUSTOMER_SLAB)</option>
              <option value="CUSTOMER_FIXED">Customer Fixed (CUSTOMER_FIXED)</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-[#f5b024]"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>

            {/* Refresh Button */}
            <button
              onClick={loadRules}
              title="Refresh Pricing Rules"
              className="p-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-600 transition-colors text-xs"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Precedence Banner */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-[11px] text-slate-600 flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-800">Hierarchy Precedence:</span>
          <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-bold">1. CUSTOMER_SLAB</span>
          <span>&gt;</span>
          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">2. CUSTOMER_FIXED</span>
          <span>&gt;</span>
          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">3. GLOBAL_SLAB</span>
          <span>&gt;</span>
          <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">4. DEFAULT (Catalogue Price)</span>
        </div>
      </div>

      {/* Rules Table / Cards */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <div className="inline-block animate-spin text-2xl">⏳</div>
            <div className="text-xs font-medium">Loading authoritative pricing rules...</div>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600 space-y-3">
            <div className="text-2xl">⚠️</div>
            <div className="text-sm font-semibold">{error}</div>
            <button
              onClick={loadRules}
              className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold"
            >
              Try Again
            </button>
          </div>
        ) : rules.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <div className="text-3xl">🏷️</div>
            <div className="text-sm font-bold text-slate-700">No Pricing Rules Found</div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              No pricing rules match your current search and filter parameters. Products will resolve to their standard catalogue wholesale price.
            </p>
            <button
              onClick={() => openCreateModal('GLOBAL_SLAB')}
              className="px-4 py-2 rounded-lg bg-[#f5b024] text-slate-950 text-xs font-bold hover:bg-[#e09e19]"
            >
              + Create First Rule
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/75 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Rule / ID</th>
                  <th className="py-3 px-4">Product Details</th>
                  <th className="py-3 px-4">Customer Scope</th>
                  <th className="py-3 px-4">Rule Type</th>
                  <th className="py-3 px-4">Pricing & Quantity Slabs</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {rules.map(rule => {
                  const slabs = rule.slabs || rule.priceSlabs || [];

                  return (
                    <tr key={rule.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Rule ID & Created */}
                      <td className="py-3 px-4 align-top whitespace-nowrap">
                        <div className="font-mono font-bold text-slate-900 text-[11px]">
                          {rule.id}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(rule.updatedAt || rule.createdAt).toLocaleDateString()}
                        </div>
                      </td>

                      {/* Product Details */}
                      <td className="py-3 px-4 align-top max-w-xs">
                        <div className="font-bold text-slate-900 text-xs line-clamp-1">
                          {rule.productName}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                          <span className="font-mono">SKU: {rule.productSku || '—'}</span>
                          <span>•</span>
                          <span>MRP: ₹{rule.productMrp}</span>
                          <span>•</span>
                          <span className="text-slate-700 font-medium">Default: ₹{rule.productWholesalePrice}</span>
                        </div>
                        {!rule.productIsActive && (
                          <span className="inline-block mt-1 text-[9px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                            Product Inactive in Catalogue
                          </span>
                        )}
                      </td>

                      {/* Customer Scope */}
                      <td className="py-3 px-4 align-top whitespace-nowrap">
                        {rule.retailerId ? (
                          <div>
                            <div className="font-bold text-slate-900 text-xs">
                              {rule.retailerBusinessName}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              ID: {rule.retailerId}
                            </div>
                            {rule.retailerMobile && (
                              <div className="text-[10px] text-slate-400">
                                📞 {rule.retailerMobile}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 text-blue-700 font-bold text-xs bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                            <span>🌐</span>
                            <span>All Retailers (Global)</span>
                          </div>
                        )}
                      </td>

                      {/* Rule Type */}
                      <td className="py-3 px-4 align-top whitespace-nowrap">
                        {rule.pricingType === 'GLOBAL_SLAB' && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
                            GLOBAL_SLAB
                          </span>
                        )}
                        {rule.pricingType === 'CUSTOMER_SLAB' && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-800 border border-purple-200">
                            CUSTOMER_SLAB
                          </span>
                        )}
                        {rule.pricingType === 'CUSTOMER_FIXED' && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            CUSTOMER_FIXED
                          </span>
                        )}
                      </td>

                      {/* Pricing & Quantity Slabs */}
                      <td className="py-3 px-4 align-top">
                        {rule.pricingType === 'CUSTOMER_FIXED' ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-extrabold text-emerald-700">
                              ₹{rule.fixedPrice?.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              Fixed flat rate
                            </span>
                          </div>
                        ) : slabs.length > 0 ? (
                          <div className="space-y-1">
                            {slabs.map((slab, sIdx) => {
                              const min = slab.minQuantity;
                              const max = slab.maxQuantity !== null && slab.maxQuantity !== undefined ? slab.maxQuantity : '∞';
                              const price = slab.unitPrice ?? slab.slabPrice;
                              return (
                                <div
                                  key={sIdx}
                                  className="inline-flex items-center gap-2 mr-2 mb-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px]"
                                >
                                  <span className="font-semibold text-slate-700">
                                    Qty {min}–{max}:
                                  </span>
                                  <span className="font-black text-slate-900">
                                    ₹{Number(price).toFixed(2)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No slabs defined</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 align-top whitespace-nowrap">
                        <button
                          onClick={() => handleToggleActive(rule)}
                          title={`Click to ${rule.active ? 'Deactivate' : 'Activate'}`}
                          className="inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              rule.active ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-slate-300'
                            }`}
                          />
                          <span
                            className={`text-xs font-bold ${
                              rule.active ? 'text-emerald-700' : 'text-slate-500'
                            }`}
                          >
                            {rule.active ? 'Active' : 'Inactive'}
                          </span>
                        </button>
                      </td>

                      {/* Priority */}
                      <td className="py-3 px-4 align-top whitespace-nowrap">
                        <span className="font-mono text-xs font-semibold text-slate-600">
                          {rule.priority ?? (rule.pricingType === 'CUSTOMER_SLAB' ? 1 : rule.pricingType === 'CUSTOMER_FIXED' ? 2 : 3)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 align-top text-right whitespace-nowrap space-x-1.5">
                        <button
                          onClick={() => handleOpenPreviewForRule(rule)}
                          title="Preview live effective price"
                          className="px-2.5 py-1 rounded bg-[#0d1d25] text-[#f5b024] hover:bg-slate-800 text-[11px] font-bold"
                        >
                          Preview
                        </button>
                        <button
                          onClick={() => openEditModal(rule)}
                          title="Edit rule parameters"
                          className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule)}
                          title="Delete rule"
                          className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span>
              Showing {rules.length > 0 ? (page - 1) * pageSize + 1 : 0} to{' '}
              {Math.min(page * pageSize, totalCount)} of {totalCount} rules
            </span>
            <span>•</span>
            <label className="flex items-center gap-1.5">
              <span>Page size:</span>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="px-2 py-1 rounded border border-slate-300 bg-white text-xs font-semibold"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100 (Max)</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="font-bold text-slate-800">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* CREATE / EDIT RULE MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col my-8 animate-scale-up">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {editingRule ? `Edit Pricing Rule (${editingRule.id})` : 'Create Authoritative Pricing Rule'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Set server-authoritative wholesale pricing rules for catalogue products.
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg text-sm"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitRuleForm} className="p-6 space-y-5 overflow-y-auto flex-1">
              {formError && (
                <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  ⚠️ {formError}
                </div>
              )}

              {/* Rule Type Tabs (Disabled if editing) */}
              {!editingRule && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Pricing Rule Type:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setCreateType('GLOBAL_SLAB')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all text-center ${
                        createType === 'GLOBAL_SLAB'
                          ? 'bg-blue-50 border-blue-400 text-blue-800 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      🌐 Global Slabs
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateType('CUSTOMER_SLAB')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all text-center ${
                        createType === 'CUSTOMER_SLAB'
                          ? 'bg-purple-50 border-purple-400 text-purple-800 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      🎯 Customer Slabs
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateType('CUSTOMER_FIXED')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all text-center ${
                        createType === 'CUSTOMER_FIXED'
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-800 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      🏷️ Customer Fixed
                    </button>
                  </div>
                </div>
              )}

              {/* Product Picker */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Product <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formProductId}
                  disabled={!!editingRule}
                  onChange={e => setFormProductId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#f5b024] disabled:bg-slate-100"
                  required
                >
                  <option value="">-- Select Product --</option>
                  {productsList.map(p => (
                    <option key={p.productId} value={p.productId}>
                      {p.productName} ({p.sku}) — MRP: ₹{p.mrp}, Default: ₹{p.wholesalePrice}
                    </option>
                  ))}
                </select>
              </div>

              {/* Customer Picker (If customer-specific) */}
              {(createType === 'CUSTOMER_SLAB' || createType === 'CUSTOMER_FIXED') && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Customer (Retailer) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formRetailerId}
                    disabled={!!editingRule}
                    onChange={e => setFormRetailerId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#f5b024] disabled:bg-slate-100"
                    required
                  >
                    <option value="">-- Select Retailer --</option>
                    {customersList.map(c => (
                      <option key={c.retailerId} value={c.retailerId}>
                        {c.businessName} (ID: {c.retailerId}) — {c.ownerName} [{c.mobile}]
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Slabs Form or Fixed Price Form */}
              {createType === 'CUSTOMER_FIXED' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Negotiated Fixed Unit Price (₹) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 70.00"
                    value={formFixedPrice}
                    onChange={e => setFormFixedPrice(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#f5b024]"
                    required
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Flat negotiated price applied regardless of ordered quantity for this customer.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      Quantity Slabs & Pricing <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleAddSlabRow}
                      className="text-xs font-bold text-blue-700 hover:text-blue-900"
                    >
                      + Add Slab Tier
                    </button>
                  </div>

                  <div className="space-y-2">
                    {formSlabs.map((slab, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        <div className="flex-1">
                          <label className="text-[10px] text-slate-500 uppercase font-bold block mb-0.5">
                            Min Qty
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={slab.minQuantity}
                            onChange={e => handleSlabChange(idx, 'minQuantity', parseInt(e.target.value, 10))}
                            className="w-full px-2.5 py-1 text-xs rounded border border-slate-300 bg-white"
                            required
                          />
                        </div>

                        <div className="flex-1">
                          <label className="text-[10px] text-slate-500 uppercase font-bold block mb-0.5">
                            Max Qty (Blank = ∞)
                          </label>
                          <input
                            type="number"
                            min={slab.minQuantity}
                            placeholder="Open-ended"
                            value={slab.maxQuantity}
                            onChange={e => handleSlabChange(idx, 'maxQuantity', e.target.value)}
                            className="w-full px-2.5 py-1 text-xs rounded border border-slate-300 bg-white"
                          />
                        </div>

                        <div className="flex-1">
                          <label className="text-[10px] text-slate-500 uppercase font-bold block mb-0.5">
                            Unit Price (₹)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="75.00"
                            value={slab.unitPrice}
                            onChange={e => handleSlabChange(idx, 'unitPrice', e.target.value)}
                            className="w-full px-2.5 py-1 text-xs rounded border border-slate-300 bg-white font-bold text-slate-900"
                            required
                          />
                        </div>

                        {formSlabs.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSlabRow(idx)}
                            className="text-rose-500 hover:text-rose-700 p-1 mt-4 text-xs font-bold"
                            title="Remove slab"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status and Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Initial Status
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer mt-1">
                    <input
                      type="checkbox"
                      checked={formActive}
                      onChange={e => setFormActive(e.target.checked)}
                      className="w-4 h-4 text-[#f5b024] rounded border-slate-300 focus:ring-[#f5b024]"
                    />
                    <span className="text-xs font-semibold text-slate-800">
                      Active (Enforce immediately upon save)
                    </span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Rule Description / Notes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Festival wholesale volume discount"
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#f5b024]"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2 rounded-lg bg-[#f5b024] text-slate-950 font-bold text-xs hover:bg-[#e09e19] disabled:opacity-50"
                >
                  {formSubmitting ? 'Saving...' : editingRule ? 'Update Rule' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EFFECTIVE PRICE PREVIEW MODAL */}
      {isPreviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col my-8 animate-scale-up">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white rounded-t-2xl">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">✨</span>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Live Effective-Price Preview Tool
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Inspect authoritative PricingEngine price resolution with hierarchy traceability.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPreviewModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg text-sm"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {previewError && (
                <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  ⚠️ {previewError}
                </div>
              )}

              {/* Selector Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Product */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Select Product <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={previewProductId}
                    onChange={e => setPreviewProductId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="">-- Choose Product --</option>
                    {productsList.map(p => (
                      <option key={p.productId} value={p.productId}>
                        {p.productName} ({p.sku}) — MRP: ₹{p.mrp}, Default: ₹{p.wholesalePrice}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quantity */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Order Quantity <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={previewQuantity}
                    onChange={e => setPreviewQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 font-bold"
                  />
                </div>

                {/* Customer */}
                <div className="sm:col-span-3">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Select Customer (Optional — Leave blank for anonymous / general preview)
                  </label>
                  <select
                    value={previewRetailerId}
                    onChange={e => setPreviewRetailerId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="">All Retailers (Global / Anonymous)</option>
                    {customersList.map(c => (
                      <option key={c.retailerId} value={c.retailerId}>
                        {c.businessName} (ID: {c.retailerId}) — {c.ownerName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Preview Action Button */}
              <button
                type="button"
                onClick={handleRunPreview}
                disabled={previewLoading || !previewProductId}
                className="w-full py-2.5 rounded-lg bg-[#0d1d25] text-[#f5b024] font-bold text-xs hover:bg-[#152e3b] transition-all flex items-center justify-center gap-2 border border-[#f5b024]/40 disabled:opacity-50"
              >
                {previewLoading ? (
                  <span>Resolving PricingEngine...</span>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>Calculate Authoritative Effective Price</span>
                  </>
                )}
              </button>

              {/* Preview Results Panel */}
              {previewResult && (
                <div className="space-y-4 pt-4 border-t border-slate-200">
                  {/* Big Number Result Banner */}
                  <div className="p-4 rounded-xl bg-slate-900 text-white flex items-center justify-between shadow-sm">
                    <div>
                      <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">
                        Effective Unit Price
                      </div>
                      <div className="text-2xl font-black text-[#f5b024] flex items-center gap-2">
                        ₹{Number(previewResult.effectivePrice).toFixed(2)}
                        <span className="text-xs font-normal text-slate-300">/ unit</span>
                      </div>
                      <div className="text-xs text-slate-300 mt-0.5">
                        Line Total: <span className="font-bold text-white">₹{Number(previewResult.lineTotal).toFixed(2)}</span> for {previewResult.quantity} units
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">
                        Resolved Source
                      </div>
                      <span className="inline-block mt-1 px-3 py-1 rounded-full text-xs font-black bg-[#f5b024] text-slate-950">
                        {previewResult.pricingSource}
                      </span>
                      {previewResult.ruleId && (
                        <div className="text-[10px] text-slate-400 font-mono mt-1">
                          Rule: {previewResult.ruleId}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pricing Comparison Stats */}
                  <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] text-slate-500 uppercase font-bold">MRP</div>
                      <div className="font-bold text-slate-800 text-sm">₹{previewResult.mrp}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Catalogue Default</div>
                      <div className="font-bold text-slate-800 text-sm">₹{previewResult.defaultPrice}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                      <div className="text-[10px] text-emerald-700 uppercase font-bold">Unit Savings vs MRP</div>
                      <div className="font-extrabold text-emerald-700 text-sm">
                        ₹{(previewResult.mrp - previewResult.effectivePrice).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Hierarchy Steps Breakdown */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 mb-2">
                      Precedence Hierarchy Traceability
                    </h4>
                    <div className="space-y-2">
                      {previewResult.hierarchySteps?.map((step: any) => (
                        <div
                          key={step.tier}
                          className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                            step.applied
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-medium'
                              : 'bg-slate-50 border-slate-200 text-slate-600'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                                step.applied ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-700'
                              }`}
                            >
                              {step.tier}
                            </span>
                            <div>
                              <div className="font-bold text-slate-800">{step.label}</div>
                              <div className="text-[11px] text-slate-500">{step.status}</div>
                            </div>
                          </div>

                          <div>
                            {step.applied ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-extrabold text-[10px]">
                                APPLIED
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-semibold">
                                —
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Authoritative Explanation Note */}
                  <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded border border-slate-200">
                    ℹ️ {previewResult.hierarchyExplanation}
                  </p>
                </div>
              )}

              {/* Close Button */}
              <div className="pt-3 border-t border-slate-200 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsPreviewModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
