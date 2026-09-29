import React, { useState, useEffect, useCallback } from 'react';
import { AdminClient } from '../../services/adminClient';
import { AdminStatCard } from '../../components/admin/AdminStatCard';
import { AdminStatusBadge } from '../../components/admin/AdminStatusBadge';

interface AdminRetailerDetailScreenProps {
  retailerId: string;
  onBack: () => void;
}

export const AdminRetailerDetailScreen: React.FC<AdminRetailerDetailScreenProps> = ({
  retailerId,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<
    'OVERVIEW' | 'ORDERS' | 'PURCHASING' | 'PRICING' | 'PREVIEW' | 'ACTIVITY'
  >('OVERVIEW');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Core Data
  const [retailer, setRetailer] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [pricingData, setPricingData] = useState<any>(null);
  const [activityEvents, setActivityEvents] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Mutation modal state
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [actionReason, setActionReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Effective Pricing Preview state
  const [productsList, setProductsList] = useState<any[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [previewQuantity, setPreviewQuantity] = useState(10);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const loadRetailerData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [retRes, sumRes, ordRes, prcRes, actRes, audRes] = await Promise.all([
        AdminClient.getRetailer(retailerId),
        AdminClient.getRetailerSummary(retailerId),
        AdminClient.getRetailerOrders(retailerId, 1, 20),
        AdminClient.getRetailerPricing(retailerId),
        AdminClient.getRetailerActivity(retailerId),
        AdminClient.getRetailerAuditLogs(retailerId),
      ]);

      if (retRes.success && retRes.retailer) {
        setRetailer(retRes.retailer);
      } else {
        setError(retRes.message || 'Retailer not found.');
      }

      if (sumRes.success && sumRes.summary) {
        setSummary(sumRes.summary);
      }

      if (ordRes.success && Array.isArray(ordRes.orders)) {
        setOrders(ordRes.orders);
        setOrdersTotal(ordRes.total || 0);
      }

      if (prcRes.success) {
        setPricingData(prcRes);
      }

      if (actRes.success && Array.isArray(actRes.activity)) {
        setActivityEvents(actRes.activity);
      }

      if (audRes.success && Array.isArray(audRes.auditLogs)) {
        setAuditLogs(audRes.auditLogs);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load retailer profile.');
    } finally {
      setLoading(false);
    }
  }, [retailerId]);

  // Load products list for effective price preview
  useEffect(() => {
    AdminClient.fetchPricingProducts()
      .then(res => {
        if (res.success && Array.isArray(res.products)) {
          setProductsList(res.products);
          if (res.products.length > 0) {
            setSelectedProductId(res.products[0].productId);
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadRetailerData();
  }, [loadRetailerData]);

  // Handle price preview calculation
  const handleCalculateEffectivePrice = async () => {
    if (!selectedProductId || previewQuantity <= 0) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await AdminClient.getRetailerEffectivePrice(
        retailerId,
        selectedProductId,
        previewQuantity
      );
      if (res.success) {
        setPreviewResult(res);
      } else {
        setPreviewError(res.message || 'Could not calculate price.');
      }
    } catch (err: any) {
      setPreviewError(err.message || 'Error executing price preview.');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle deactivation
  const handleDeactivate = async () => {
    setSubmittingAction(true);
    try {
      const res = await AdminClient.deactivateRetailer(retailerId, actionReason.trim() || undefined);
      if (res.success) {
        setActionFeedback({ text: 'Retailer account deactivated successfully.', type: 'success' });
        setShowDeactivateModal(false);
        setActionReason('');
        loadRetailerData();
      } else {
        setActionFeedback({ text: res.message || 'Failed to deactivate retailer.', type: 'error' });
      }
    } catch (err: any) {
      setActionFeedback({ text: err.message || 'Action failed.', type: 'error' });
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle activation
  const handleActivate = async () => {
    setSubmittingAction(true);
    try {
      const res = await AdminClient.activateRetailer(retailerId, actionReason.trim() || undefined);
      if (res.success) {
        setActionFeedback({ text: 'Retailer account activated successfully.', type: 'success' });
        setShowActivateModal(false);
        setActionReason('');
        loadRetailerData();
      } else {
        setActionFeedback({ text: res.message || 'Failed to activate retailer.', type: 'error' });
      }
    } catch (err: any) {
      setActionFeedback({ text: err.message || 'Action failed.', type: 'error' });
    } finally {
      setSubmittingAction(false);
    }
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return 'Not available';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return 'Not available';
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Not available';
    }
  };

  if (loading) {
    return (
      <div className="p-16 text-center text-slate-500">
        <div className="inline-block w-8 h-8 border-4 border-[#f5b024] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium">Loading authoritative retailer profile & history...</p>
      </div>
    );
  }

  if (error || !retailer) {
    return (
      <div className="bg-white rounded-xl border border-red-200 p-8 text-center text-red-600 shadow-xs max-w-lg mx-auto">
        <span className="text-4xl block mb-2">⚠️</span>
        <h3 className="text-base font-bold text-slate-800">Retailer Error</h3>
        <p className="text-xs text-red-600 mt-1">{error || 'Retailer was not found.'}</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 text-xs font-bold rounded-lg bg-slate-900 text-white hover:bg-slate-800"
        >
          ← Back to Retailers
        </button>
      </div>
    );
  }

  const isActive = retailer.status === 'ACTIVE' && retailer.isActive;

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {actionFeedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm font-medium animate-slide-down ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <span>{actionFeedback.text}</span>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-xs px-2 py-1 rounded hover:bg-black/5"
          >
            ✕
          </button>
        </div>
      )}

      {/* Screen Header & Top Actions */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              onClick={onBack}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              title="Back to retailers"
            >
              ←
            </button>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  {retailer.businessName || retailer.shopName}
                </h1>
                <AdminStatusBadge status={isActive ? 'ACTIVE' : 'INACTIVE'} />
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                <span>
                  ID: <span className="font-mono font-medium text-slate-700">{retailer.retailerId}</span>
                </span>
                <span>•</span>
                <span>
                  Owner: <span className="font-medium text-slate-700">{retailer.ownerName || '—'}</span>
                </span>
                <span>•</span>
                <span>
                  Mobile: <span className="font-mono font-medium text-slate-700">{retailer.mobile || '—'}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {isActive ? (
              <button
                onClick={() => {
                  setShowDeactivateModal(true);
                  setActionReason('');
                }}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-red-300 text-red-600 bg-white hover:bg-red-50 transition-colors shadow-2xs"
              >
                Deactivate Retailer
              </button>
            ) : (
              <button
                onClick={() => {
                  setShowActivateModal(true);
                  setActionReason('');
                }}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50 transition-colors shadow-2xs"
              >
                Activate Retailer
              </button>
            )}
            <button
              onClick={loadRetailerData}
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
              title="Refresh profile"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-t border-slate-100 pt-3 overflow-x-auto text-xs font-semibold">
          {[
            { key: 'OVERVIEW', label: 'Business & Delivery', icon: '🏪' },
            { key: 'PURCHASING', label: 'Purchasing Summary', icon: '📈' },
            { key: 'ORDERS', label: `Orders (${ordersTotal})`, icon: '📦' },
            { key: 'PRICING', label: 'Contract Pricing', icon: '💰' },
            { key: 'PREVIEW', label: 'Effective Price Preview', icon: '🔍' },
            { key: 'ACTIVITY', label: 'Activity & Audit', icon: '🛡️' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: OVERVIEW (BUSINESS + FIXED DELIVERY DESTINATION) */}
      {activeTab === 'OVERVIEW' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Section A: Business Information */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>🏢</span> Business Information
              </h2>
              <span className="text-[11px] text-slate-400">Authoritative Master</span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block">Business / Shop Name</span>
                <span className="font-semibold text-slate-900 text-sm">
                  {retailer.businessName || retailer.shopName || '—'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block">Owner Full Name</span>
                <span className="font-semibold text-slate-900 text-sm">
                  {retailer.ownerName || '—'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block">Registered Phone</span>
                <span className="font-mono font-medium text-slate-900">
                  {retailer.mobile || '—'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block">Email Address</span>
                <span className="text-slate-700">
                  {retailer.email || 'Not provided'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block">Business Type</span>
                <span className="font-medium text-slate-800">
                  {retailer.businessType || 'Kirana / Grocery'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block">GSTIN</span>
                <span className="font-mono text-slate-700">
                  {retailer.gstin || 'Not registered / Unregistered'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block">Account Status</span>
                <span className="inline-block mt-0.5">
                  <AdminStatusBadge status={isActive ? 'ACTIVE' : 'INACTIVE'} />
                </span>
              </div>

              <div>
                <span className="text-slate-500 block">Assigned Warehouse</span>
                <span className="font-semibold text-slate-800">
                  {retailer.nearestWarehouse || 'WH-BRAHMPURI-01 (Jaipur Central)'}
                </span>
              </div>

              <div className="col-span-2 border-t border-slate-100 pt-3 flex items-center justify-between text-slate-500 text-[11px]">
                <span>Retailer Master ID: <code className="font-mono">{retailer.retailerId}</code></span>
                <span>Registered: {formatDate(retailer.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* Section B: Fixed Delivery Destination (Explicitly Static Address) */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>📍</span> Fixed Delivery Destination
              </h2>
              <span className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                Fixed Shop Address
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px] uppercase font-bold tracking-wider mb-1">
                  Full Street Address
                </span>
                <p className="font-medium text-slate-900 text-sm leading-relaxed">
                  {retailer.address || 'Address on record not set'}
                </p>
                {retailer.landmark && (
                  <p className="text-slate-600 mt-1">
                    Landmark: <span className="font-medium text-slate-800">{retailer.landmark}</span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-500 block">City & State</span>
                  <span className="font-semibold text-slate-800">
                    {retailer.city || 'Jaipur'}, {retailer.state || 'Rajasthan'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">Pincode</span>
                  <span className="font-mono font-bold text-slate-900">
                    {retailer.pincode || '—'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">Latitude (Fixed)</span>
                  <span className="font-mono text-slate-700">
                    {retailer.latitude !== null && retailer.latitude !== undefined ? retailer.latitude : 'Not recorded'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">Longitude (Fixed)</span>
                  <span className="font-mono text-slate-700">
                    {retailer.longitude !== null && retailer.longitude !== undefined ? retailer.longitude : 'Not recorded'}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-lg text-[11px] text-amber-900 leading-normal">
                ℹ️ <strong>Address Immutability:</strong> Historical wholesale orders retain their original immutable <code>deliveryAddressSnapshot</code> as captured at checkout. Profile updates do not alter past shipments.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PURCHASING SUMMARY & TOP PRODUCTS */}
      {activeTab === 'PURCHASING' && (
        <div className="space-y-6">
          {/* Key Purchasing KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <AdminStatCard
              label="Total Purchase Spend"
              value={`₹${(summary?.totalPurchaseValue ?? 0).toLocaleString('en-IN')}`}
              icon="💳"
              subLabel="Sum of non-cancelled orders"
            />
            <AdminStatCard
              label="Average Order Value"
              value={`₹${(summary?.averageOrderValue ?? 0).toLocaleString('en-IN')}`}
              icon="📊"
              subLabel="AOV across completed orders"
            />
            <AdminStatCard
              label="Delivered / Total Orders"
              value={`${summary?.deliveredOrders ?? 0} / ${summary?.totalOrders ?? 0}`}
              icon="✅"
              subLabel={`${summary?.cancelledOrders ?? 0} cancelled, ${summary?.pendingOrders ?? 0} pending`}
            />
            <AdminStatCard
              label="Last Order Date"
              value={summary?.lastOrderDate ? formatDate(summary.lastOrderDate).split(',')[0] : 'None'}
              icon="📅"
              subLabel={summary?.lastOrderDate ? formatDate(summary.lastOrderDate) : 'No orders recorded'}
            />
          </div>

          {/* Top 10 Products Purchased */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Top 10 Products Purchased
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Server-aggregated directly from historical order item snapshots.
                </p>
              </div>
            </div>

            {(!summary?.topProducts || summary.topProducts.length === 0) ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                No product purchasing history available for this retailer yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px] tracking-wider">
                      <th className="py-2.5 px-4">#</th>
                      <th className="py-2.5 px-4">Product Name</th>
                      <th className="py-2.5 px-4">SKU</th>
                      <th className="py-2.5 px-4 text-right">Quantity Purchased</th>
                      <th className="py-2.5 px-4 text-right">Avg Unit Price</th>
                      <th className="py-2.5 px-4 text-right">Total Purchase Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {summary.topProducts.map((prod: any, idx: number) => (
                      <tr key={prod.productId || idx} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-4 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-2.5 px-4 font-bold text-slate-900">{prod.productName}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-500">{prod.sku || '—'}</td>
                        <td className="py-2.5 px-4 text-right font-mono font-semibold">{prod.quantityPurchased}</td>
                        <td className="py-2.5 px-4 text-right font-mono">₹{prod.averageUnitPrice}</td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                          ₹{prod.purchaseValue.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ORDER HISTORY */}
      {activeTab === 'ORDERS' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Order History ({ordersTotal} total)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Authoritative orders belonging strictly to {retailer.businessName || retailer.shopName}.
              </p>
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              No orders placed by this retailer yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px] tracking-wider">
                    <th className="py-3 px-4">Order ID</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-center">Items</th>
                    <th className="py-3 px-4 text-right">Grand Total</th>
                    <th className="py-3 px-4">Payment</th>
                    <th className="py-3 px-4">Payment Status</th>
                    <th className="py-3 px-4">Order Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {orders.map(order => (
                    <tr key={order.orderId || order.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {order.orderId || order.id}
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {formatDate(order.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-semibold">
                        {Array.isArray(order.items) ? order.items.length : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        ₹{(order.grandTotal ?? order.total ?? 0).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {order.paymentMethod || 'COD'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            order.paymentStatus === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {order.paymentStatus || 'PENDING'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            order.orderStatus === 'DELIVERED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : order.orderStatus === 'CANCELLED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {order.orderStatus || 'PLACED'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CONTRACT PRICING RELATIONSHIP */}
      {activeTab === 'PRICING' && (
        <div className="space-y-6">
          {/* Pricing KPI metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <AdminStatCard
              label="Customer Slab Rules"
              value={pricingData?.customerSlabRulesCount ?? 0}
              icon="📊"
              subLabel="Quantity-tiered slabs for this retailer"
            />
            <AdminStatCard
              label="Customer Fixed Rules"
              value={pricingData?.customerFixedRulesCount ?? 0}
              icon="🔒"
              subLabel="Negotiated fixed wholesale price"
            />
            <AdminStatCard
              label="Active Contract Rules"
              value={pricingData?.activeRulesCount ?? 0}
              icon="✅"
              subLabel="Currently applied rules"
            />
            <AdminStatCard
              label="Negotiated Products"
              value={pricingData?.negotiatedProductsCount ?? 0}
              icon="🏷️"
              subLabel="Products with custom agreements"
            />
          </div>

          {/* Customer Specific Pricing Rules */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Custom Contract Pricing Rules ({pricingData?.customerPricingRules?.length || 0})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Negotiated pricing rules tied exclusively to this retailer.
                </p>
              </div>
            </div>

            {(!pricingData?.customerPricingRules || pricingData.customerPricingRules.length === 0) ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No customer-specific pricing contracts assigned. Standard wholesale or global slab rules apply.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold text-[11px] tracking-wider">
                      <th className="py-2.5 px-4">Rule Type</th>
                      <th className="py-2.5 px-4">Product</th>
                      <th className="py-2.5 px-4">Condition / Slabs</th>
                      <th className="py-2.5 px-4 text-right">Negotiated Price</th>
                      <th className="py-2.5 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {pricingData.customerPricingRules.map((rule: any) => (
                      <tr key={rule.ruleId || rule.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {rule.pricingType}
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="font-bold text-slate-900">{rule.productName || rule.productId}</div>
                          <div className="text-[10px] font-mono text-slate-400">{rule.productId}</div>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600">
                          {rule.pricingType === 'CUSTOMER_FIXED' ? (
                            'Flat fixed wholesale rate'
                          ) : Array.isArray(rule.slabs) ? (
                            `${rule.slabs.length} slab tier(s)`
                          ) : (
                            'Tiered slab'
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                          {rule.customPrice ? `₹${rule.customPrice}` : 'Slab Tiered'}
                        </td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              rule.status === 'ACTIVE' || rule.active === true
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {rule.status || (rule.active ? 'ACTIVE' : 'INACTIVE')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: EFFECTIVE PRICE PREVIEW TOOL */}
      {activeTab === 'PREVIEW' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>🔍</span> Server-Authoritative Effective Price Preview
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Test price resolution for this kirana retailer using the <strong>exact same PricingEngine</strong> invoked during wholesale checkout.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Select FMCG Product
              </label>
              <select
                value={selectedProductId}
                onChange={e => setSelectedProductId(e.target.value)}
                className="w-full py-2 px-3 text-sm rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#f5b024] bg-white font-medium"
              >
                {productsList.map(p => (
                  <option key={p.productId} value={p.productId}>
                    {p.productName} ({p.sku || p.productId}) — Base: ₹{p.wholesalePrice} / MRP: ₹{p.mrp}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Order Quantity
              </label>
              <input
                type="number"
                min={1}
                value={previewQuantity}
                onChange={e => setPreviewQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full py-2 px-3 text-sm rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#f5b024] bg-white font-mono font-bold"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleCalculateEffectivePrice}
              disabled={previewLoading || !selectedProductId}
              className="px-5 py-2.5 text-xs font-bold rounded-lg bg-[#0d1d25] text-[#f5b024] hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-xs"
            >
              {previewLoading ? 'Resolving Pricing...' : 'Calculate Effective Price'}
            </button>
          </div>

          {previewError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
              ⚠️ {previewError}
            </div>
          )}

          {previewResult && (
            <div className="p-5 bg-amber-50/50 border border-amber-200 rounded-xl space-y-4">
              <div className="flex items-center justify-between border-b border-amber-200/60 pb-3">
                <span className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                  Pricing Resolution Result
                </span>
                <span className="px-2.5 py-1 rounded bg-[#0d1d25] text-[#f5b024] text-xs font-mono font-bold">
                  Rule: {previewResult.pricingSource}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block">Default Wholesale Price</span>
                  <span className="font-mono text-base font-semibold text-slate-700">
                    ₹{previewResult.defaultPrice}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">Effective Unit Price</span>
                  <span className="font-mono text-lg font-black text-emerald-700">
                    ₹{previewResult.effectivePrice}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">Applied Quantity Range</span>
                  <span className="font-mono text-sm font-semibold text-slate-800">
                    {previewResult.slabMinQuantity !== null
                      ? `${previewResult.slabMinQuantity} – ${previewResult.slabMaxQuantity ?? '∞'} units`
                      : 'N/A (Fixed/Default)'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">Total Retailer Savings</span>
                  <span className="font-mono text-base font-bold text-emerald-600">
                    ₹{previewResult.totalSavings.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-amber-200/60 flex items-center justify-between text-xs font-bold text-slate-900">
                <span>Total Wholesale Order Line Amount ({previewQuantity} units):</span>
                <span className="font-mono text-lg text-slate-900">
                  ₹{previewResult.subtotal.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: ACTIVITY & AUDIT */}
      {activeTab === 'ACTIVITY' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Operational Timeline */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>🕒</span> Retailer Activity Timeline
            </h3>

            {activityEvents.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                No activity recorded yet.
              </p>
            ) : (
              <div className="space-y-3">
                {activityEvents.map((evt, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-start gap-3 text-xs"
                  >
                    <span className="text-base shrink-0 mt-0.5">
                      {evt.type === 'REGISTRATION' ? '🎉' : evt.type === 'ORDER' ? '📦' : '🛡️'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-900">{evt.title}</div>
                      <div className="text-slate-600 text-[11px] mt-0.5">{evt.description}</div>
                      <div className="text-slate-400 text-[10px] mt-1 font-mono">
                        {formatDate(evt.timestamp)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Admin Audit History */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>🛡️</span> Admin Audit Log History
            </h3>

            {auditLogs.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                No admin audit entries found for this retailer.
              </p>
            ) : (
              <div className="space-y-3">
                {auditLogs.map((log, idx) => (
                  <div
                    key={log.logId || idx}
                    className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-start gap-3 text-xs"
                  >
                    <span className="text-base shrink-0 mt-0.5">
                      {log.action?.includes('ACTIVATED') ? '✅' : log.action?.includes('DEACTIVATED') ? '⚠️' : '👁️'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 font-mono text-[11px]">
                          {log.action}
                        </span>
                        <span className="text-slate-400 text-[10px] font-mono">
                          {formatDate(log.timestamp)}
                        </span>
                      </div>
                      <div className="text-slate-600 text-[11px] mt-0.5">
                        Admin: <span className="font-semibold text-slate-800">{log.adminName || log.adminUid}</span>
                      </div>
                      {log.metadata?.reason && (
                        <div className="text-slate-500 text-[11px] mt-0.5 italic">
                          Reason: &quot;{log.metadata.reason}&quot;
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Deactivate Modal */}
      {showDeactivateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xl shrink-0">
                ⚠️
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Deactivate Retailer Account
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Retailer: <span className="font-semibold text-slate-800">{retailer.businessName || retailer.shopName}</span>
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
              <p className="font-bold">Deactivate this retailer?</p>
              <p>The retailer will no longer be able to place new wholesale orders.</p>
              <p className="text-[11px] text-amber-700">Existing order history and address records remain preserved.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Deactivation Reason (Optional)
              </label>
              <input
                type="text"
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                placeholder="e.g. Incomplete documentation, Credit limit breach"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={submittingAction}
                onClick={() => setShowDeactivateModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingAction}
                onClick={handleDeactivate}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-red-600 text-white hover:bg-red-700 shadow-sm disabled:opacity-50"
              >
                {submittingAction ? 'Deactivating...' : 'Confirm Deactivation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Activate Modal */}
      {showActivateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl shrink-0">
                ✅
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Activate Retailer Account
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Retailer: <span className="font-semibold text-slate-800">{retailer.businessName || retailer.shopName}</span>
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
              <p className="font-bold">Activate this retailer?</p>
              <p>The retailer will be granted immediate permission to place new wholesale orders.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Activation Note (Optional)
              </label>
              <input
                type="text"
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                placeholder="e.g. Verified by Super Admin"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={submittingAction}
                onClick={() => setShowActivateModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingAction}
                onClick={handleActivate}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm disabled:opacity-50"
              >
                {submittingAction ? 'Activating...' : 'Confirm Activation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
