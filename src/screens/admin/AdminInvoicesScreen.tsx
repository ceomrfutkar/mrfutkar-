import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Search,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  Filter,
  ArrowRight,
  Receipt,
  ShoppingCart,
  Building,
  Calendar,
  Layers,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Send,
  Ban,
  Clock,
  Printer,
  Download,
} from 'lucide-react';
import { InvoiceClient } from '../../services/invoiceClient';
import {
  SalesInvoice,
  PurchaseInvoice,
  SalesInvoiceStatus,
  PurchaseInvoiceStatus,
} from '../../types/invoice';
import { InvoiceDocumentModel } from '../../types/invoiceDocument';
import { InvoiceDocumentModal } from '../../components/admin/accounting/InvoiceDocumentModal';

export const AdminInvoicesScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'SALES' | 'PURCHASE'>('SALES');

  // Sales state
  const [salesInvoices, setSalesInvoices] = useState<SalesInvoice[]>([]);
  const [salesTotal, setSalesTotal] = useState(0);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesSearch, setSalesSearch] = useState('');
  const [salesStatusFilter, setSalesStatusFilter] = useState<string>('');
  const [salesFromDate, setSalesFromDate] = useState('');
  const [salesToDate, setSalesToDate] = useState('');
  const [salesPage, setSalesPage] = useState(1);

  // Purchase state
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>([]);
  const [purchaseTotal, setPurchaseTotal] = useState(0);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState<string>('');
  const [purchaseFromDate, setPurchaseFromDate] = useState('');
  const [purchaseToDate, setPurchaseToDate] = useState('');
  const [purchasePage, setPurchasePage] = useState(1);

  // Selected for detail view
  const [selectedSalesInvoice, setSelectedSalesInvoice] = useState<SalesInvoice | null>(null);
  const [selectedPurchaseInvoice, setSelectedPurchaseInvoice] = useState<PurchaseInvoice | null>(null);

  // Modals for creation
  const [showCreateSalesModal, setShowCreateSalesModal] = useState(false);
  const [showCreatePurchaseModal, setShowCreatePurchaseModal] = useState(false);

  // Action feedback
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Form states for Create Sales Invoice
  const [salesCustomerId, setSalesCustomerId] = useState('');
  const [salesSourceOrderId, setSalesSourceOrderId] = useState('');
  const [salesItems, setSalesItems] = useState([
    { productId: '', skuSnapshot: '', productNameSnapshot: '', quantity: 1, unitPrice: 0, discountAmount: 0, taxRate: 0 },
  ]);

  // Form states for Create Purchase Invoice
  const [purchaseSupplierId, setPurchaseSupplierId] = useState('');
  const [purchaseSupplierInvoiceNum, setPurchaseSupplierInvoiceNum] = useState('');
  const [purchaseItems, setPurchaseItems] = useState([
    { productId: '', skuSnapshot: '', productNameSnapshot: '', quantity: 1, unitCost: 0, discountAmount: 0, taxRate: 0 },
  ]);

  // Document Layer State (Phase 5.5 Part 4)
  const [previewDoc, setPreviewDoc] = useState<InvoiceDocumentModel | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [documentLoading, setDocumentLoading] = useState(false);

  const handlePreviewSalesInvoice = async (invoiceId: string) => {
    setDocumentLoading(true);
    setActionError(null);
    try {
      const docModel = await InvoiceClient.getSalesInvoiceDocument(invoiceId);
      setPreviewDoc(docModel);
      setPreviewOpen(true);
    } catch (err: any) {
      setActionError(err.message || 'Failed to load sales invoice document');
    } finally {
      setDocumentLoading(false);
    }
  };

  const handlePrintSalesInvoice = async (invoiceId: string) => {
    setDocumentLoading(true);
    setActionError(null);
    try {
      const docModel = await InvoiceClient.getSalesInvoiceDocument(invoiceId);
      setPreviewDoc(docModel);
      setPreviewOpen(true);
      setTimeout(() => {
        window.print();
      }, 350);
    } catch (err: any) {
      setActionError(err.message || 'Failed to prepare sales invoice for printing');
    } finally {
      setDocumentLoading(false);
    }
  };

  const handleDownloadSalesInvoicePdf = async (invoiceId: string, invoiceNumber: string) => {
    setDocumentLoading(true);
    setActionError(null);
    try {
      await InvoiceClient.downloadSalesInvoicePdf(invoiceId, invoiceNumber);
      setActionSuccess(`Downloaded PDF for ${invoiceNumber}`);
    } catch (err: any) {
      setActionError(err.message || 'Failed to download sales invoice PDF');
    } finally {
      setDocumentLoading(false);
    }
  };

  const handlePreviewPurchaseInvoice = async (invoiceId: string) => {
    setDocumentLoading(true);
    setActionError(null);
    try {
      const docModel = await InvoiceClient.getPurchaseInvoiceDocument(invoiceId);
      setPreviewDoc(docModel);
      setPreviewOpen(true);
    } catch (err: any) {
      setActionError(err.message || 'Failed to load purchase invoice document');
    } finally {
      setDocumentLoading(false);
    }
  };

  const handlePrintPurchaseInvoice = async (invoiceId: string) => {
    setDocumentLoading(true);
    setActionError(null);
    try {
      const docModel = await InvoiceClient.getPurchaseInvoiceDocument(invoiceId);
      setPreviewDoc(docModel);
      setPreviewOpen(true);
      setTimeout(() => {
        window.print();
      }, 350);
    } catch (err: any) {
      setActionError(err.message || 'Failed to prepare purchase invoice for printing');
    } finally {
      setDocumentLoading(false);
    }
  };

  const handleDownloadPurchaseInvoicePdf = async (invoiceId: string, invoiceNumber: string) => {
    setDocumentLoading(true);
    setActionError(null);
    try {
      await InvoiceClient.downloadPurchaseInvoicePdf(invoiceId, invoiceNumber);
      setActionSuccess(`Downloaded PDF for ${invoiceNumber}`);
    } catch (err: any) {
      setActionError(err.message || 'Failed to download purchase invoice PDF');
    } finally {
      setDocumentLoading(false);
    }
  };

  const loadSalesInvoices = useCallback(async () => {
    setSalesLoading(true);
    setActionError(null);
    try {
      const res = await InvoiceClient.getSalesInvoices({
        search: salesSearch || undefined,
        status: salesStatusFilter || undefined,
        fromDate: salesFromDate || undefined,
        toDate: salesToDate || undefined,
        page: salesPage,
        pageSize: 15,
      });
      setSalesInvoices(res.invoices);
      setSalesTotal(res.total);
    } catch (err: any) {
      setActionError(err.message || 'Failed to load sales invoices');
    } finally {
      setSalesLoading(false);
    }
  }, [salesSearch, salesStatusFilter, salesFromDate, salesToDate, salesPage]);

  const loadPurchaseInvoices = useCallback(async () => {
    setPurchaseLoading(true);
    setActionError(null);
    try {
      const res = await InvoiceClient.getPurchaseInvoices({
        search: purchaseSearch || undefined,
        status: purchaseStatusFilter || undefined,
        fromDate: purchaseFromDate || undefined,
        toDate: purchaseToDate || undefined,
        page: purchasePage,
        pageSize: 15,
      });
      setPurchaseInvoices(res.invoices);
      setPurchaseTotal(res.total);
    } catch (err: any) {
      setActionError(err.message || 'Failed to load purchase invoices');
    } finally {
      setPurchaseLoading(false);
    }
  }, [purchaseSearch, purchaseStatusFilter, purchaseFromDate, purchaseToDate, purchasePage]);

  useEffect(() => {
    if (activeTab === 'SALES') {
      loadSalesInvoices();
    } else {
      loadPurchaseInvoices();
    }
  }, [activeTab, loadSalesInvoices, loadPurchaseInvoices]);

  // Handle Sales Invoice Creation
  const handleCreateSalesInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionLoading(true);

    try {
      if (!salesCustomerId.trim()) {
        throw new Error('Customer ID (Retailer ID) is required.');
      }
      if (salesItems.length === 0 || !salesItems[0].productId) {
        throw new Error('At least one item with a valid product ID is required.');
      }

      const invoice = await InvoiceClient.createSalesInvoice({
        customerId: salesCustomerId.trim(),
        sourceOrderId: salesSourceOrderId.trim() || null,
        items: salesItems.map((item) => ({
          productId: item.productId.trim(),
          skuSnapshot: item.skuSnapshot.trim() || undefined,
          productNameSnapshot: item.productNameSnapshot.trim() || undefined,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          discountAmount: Number(item.discountAmount || 0),
          taxRate: Number(item.taxRate || 0),
        })),
      });

      setActionSuccess(`Sales invoice ${invoice.invoiceNumber} created successfully!`);
      setShowCreateSalesModal(false);
      setSalesCustomerId('');
      setSalesSourceOrderId('');
      setSalesItems([
        { productId: '', skuSnapshot: '', productNameSnapshot: '', quantity: 1, unitPrice: 0, discountAmount: 0, taxRate: 0 },
      ]);
      loadSalesInvoices();
    } catch (err: any) {
      setActionError(err.message || 'Failed to create sales invoice');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Purchase Invoice Creation
  const handleCreatePurchaseInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionLoading(true);

    try {
      if (purchaseItems.length === 0 || !purchaseItems[0].productId) {
        throw new Error('At least one item with a valid product ID is required.');
      }

      const invoice = await InvoiceClient.createPurchaseInvoice({
        supplierId: purchaseSupplierId.trim() || null,
        supplierInvoiceNumber: purchaseSupplierInvoiceNum.trim() || null,
        items: purchaseItems.map((item) => ({
          productId: item.productId.trim(),
          skuSnapshot: item.skuSnapshot.trim() || undefined,
          productNameSnapshot: item.productNameSnapshot.trim() || undefined,
          quantity: Number(item.quantity),
          unitCost: Number(item.unitCost),
          discountAmount: Number(item.discountAmount || 0),
          taxRate: Number(item.taxRate || 0),
        })),
      });

      setActionSuccess(`Purchase invoice ${invoice.invoiceNumber} created successfully!`);
      setShowCreatePurchaseModal(false);
      setPurchaseSupplierId('');
      setPurchaseSupplierInvoiceNum('');
      setPurchaseItems([
        { productId: '', skuSnapshot: '', productNameSnapshot: '', quantity: 1, unitCost: 0, discountAmount: 0, taxRate: 0 },
      ]);
      loadPurchaseInvoices();
    } catch (err: any) {
      setActionError(err.message || 'Failed to create purchase invoice');
    } finally {
      setActionLoading(false);
    }
  };

  // Issue Sales Invoice
  const handleIssueSalesInvoice = async (invoiceId: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await InvoiceClient.issueSalesInvoice(invoiceId);
      setActionSuccess(`Sales invoice ${updated.invoiceNumber} issued successfully!`);
      if (selectedSalesInvoice?.invoiceId === invoiceId) {
        setSelectedSalesInvoice(updated);
      }
      loadSalesInvoices();
    } catch (err: any) {
      setActionError(err.message || 'Failed to issue sales invoice');
    } finally {
      setActionLoading(false);
    }
  };

  // Cancel Sales Invoice
  const handleCancelSalesInvoice = async (invoiceId: string) => {
    if (!confirm('Are you sure you want to cancel this sales invoice? This action is permanent and audited.')) {
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await InvoiceClient.cancelSalesInvoice(invoiceId, 'Cancelled via Admin Console');
      setActionSuccess(`Sales invoice ${updated.invoiceNumber} cancelled.`);
      if (selectedSalesInvoice?.invoiceId === invoiceId) {
        setSelectedSalesInvoice(updated);
      }
      loadSalesInvoices();
    } catch (err: any) {
      setActionError(err.message || 'Failed to cancel sales invoice');
    } finally {
      setActionLoading(false);
    }
  };

  // Post Purchase Invoice
  const handlePostPurchaseInvoice = async (invoiceId: string) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await InvoiceClient.postPurchaseInvoice(invoiceId);
      setActionSuccess(`Purchase invoice ${updated.invoiceNumber} posted successfully!`);
      if (selectedPurchaseInvoice?.invoiceId === invoiceId) {
        setSelectedPurchaseInvoice(updated);
      }
      loadPurchaseInvoices();
    } catch (err: any) {
      setActionError(err.message || 'Failed to post purchase invoice');
    } finally {
      setActionLoading(false);
    }
  };

  // Cancel Purchase Invoice
  const handleCancelPurchaseInvoice = async (invoiceId: string) => {
    if (!confirm('Are you sure you want to cancel this purchase invoice? This action is permanent and audited.')) {
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await InvoiceClient.cancelPurchaseInvoice(invoiceId, 'Cancelled via Admin Console');
      setActionSuccess(`Purchase invoice ${updated.invoiceNumber} cancelled.`);
      if (selectedPurchaseInvoice?.invoiceId === invoiceId) {
        setSelectedPurchaseInvoice(updated);
      }
      loadPurchaseInvoices();
    } catch (err: any) {
      setActionError(err.message || 'Failed to cancel purchase invoice');
    } finally {
      setActionLoading(false);
    }
  };

  // Render Status Badge
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Clock className="w-3 h-3" /> Draft
          </span>
        );
      case 'ISSUED':
      case 'POSTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> {status}
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <XCircle className="w-3 h-3" /> Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Invoice Management</h1>
            <span className="px-2 py-0.5 text-[11px] font-bold uppercase rounded bg-[#f5b024]/20 text-[#f5b024] border border-[#f5b024]/30">
              Phase 5.5
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Authoritative Sales (SI) and Purchase (PI) tax/accounting documents with sequential numbering and immutable snapshots.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'SALES' ? (
            <button
              onClick={() => setShowCreateSalesModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#f5b024] hover:bg-[#e5a014] text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Sales Invoice</span>
            </button>
          ) : (
            <button
              onClick={() => setShowCreatePurchaseModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#f5b024] hover:bg-[#e5a014] text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Purchase Invoice</span>
            </button>
          )}

          <button
            onClick={() => (activeTab === 'SALES' ? loadSalesInvoices() : loadPurchaseInvoices())}
            disabled={salesLoading || purchaseLoading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${salesLoading || purchaseLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notifications / Toast */}
      {actionError && (
        <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-lg text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}
      {actionSuccess && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveTab('SALES')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'SALES'
              ? 'border-[#f5b024] text-[#f5b024]'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Sales Invoices (Retailers)</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
            {salesTotal}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('PURCHASE')}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'PURCHASE'
              ? 'border-[#f5b024] text-[#f5b024]'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>Purchase Invoices (Suppliers)</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
            {purchaseTotal}
          </span>
        </button>
      </div>

      {/* SALES TAB CONTENT */}
      {activeTab === 'SALES' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search SI number, retailer..."
                value={salesSearch}
                onChange={(e) => setSalesSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-[#f5b024]"
              />
            </div>

            <div>
              <select
                value={salesStatusFilter}
                onChange={(e) => setSalesStatusFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-[#f5b024]"
              >
                <option value="">All Statuses</option>
                <option value="DRAFT">DRAFT</option>
                <option value="ISSUED">ISSUED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>

            <div>
              <input
                type="date"
                value={salesFromDate}
                onChange={(e) => setSalesFromDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-[#f5b024]"
                placeholder="From Date"
              />
            </div>

            <div>
              <input
                type="date"
                value={salesToDate}
                onChange={(e) => setSalesToDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-[#f5b024]"
                placeholder="To Date"
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-400 font-semibold">
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Customer (Retailer)</th>
                    <th className="py-3 px-4">Order Ref</th>
                    <th className="py-3 px-4 text-right">Items</th>
                    <th className="py-3 px-4 text-right">Grand Total</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Accounting</th>
                    <th className="py-3 px-4 text-center">Payment</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {salesLoading ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500">
                        <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-2" />
                        Loading sales invoices...
                      </td>
                    </tr>
                  ) : salesInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500">
                        No sales invoices found matching current criteria.
                      </td>
                    </tr>
                  ) : (
                    salesInvoices.map((inv) => (
                      <tr key={inv.invoiceId} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-white">
                          {inv.invoiceNumber}
                        </td>
                        <td className="py-3 px-4 text-slate-400">{inv.invoiceDate}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">
                            {inv.billingAddressSnapshot.businessName || inv.customerId}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {inv.billingAddressSnapshot.city} • ID: {inv.customerId}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                          {inv.sourceOrderId || '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          {inv.items.length}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-white">
                          ₹{inv.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {renderStatusBadge(inv.invoiceStatus)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {inv.accountingStatus === 'POSTED' ? (
                            <div className="inline-flex flex-col items-center">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="w-2.5 h-2.5" /> POSTED
                              </span>
                              <span className="font-mono text-[10px] text-slate-400 mt-0.5 font-bold">
                                {inv.accountingVoucherNumber || 'JV Assigned'}
                              </span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400">
                              <Clock className="w-2.5 h-2.5" /> NOT POSTED
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="text-[10px] uppercase font-bold text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">
                            {inv.paymentStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedSalesInvoice(inv)}
                              className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer"
                              title="View Invoice Detail"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handlePreviewSalesInvoice(inv.invoiceId)}
                              className="p-1 hover:bg-slate-800 text-[#f5b024] hover:text-amber-300 rounded cursor-pointer"
                              title="Preview Document"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDownloadSalesInvoicePdf(inv.invoiceId, inv.invoiceNumber)}
                              className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer"
                              title="Download PDF"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            {inv.invoiceStatus === 'DRAFT' && (
                              <button
                                onClick={() => handleIssueSalesInvoice(inv.invoiceId)}
                                disabled={actionLoading}
                                className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
                                title="Issue Invoice"
                              >
                                Issue
                              </button>
                            )}
                            {inv.invoiceStatus !== 'CANCELLED' && (
                              <button
                                onClick={() => handleCancelSalesInvoice(inv.invoiceId)}
                                disabled={actionLoading}
                                className="p-1 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 rounded cursor-pointer"
                                title="Cancel Invoice"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-950/70 border-t border-slate-800 text-xs text-slate-400">
              <div>
                Showing {salesInvoices.length} of {salesTotal} invoices
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={salesPage <= 1}
                  onClick={() => setSalesPage((p) => Math.max(p - 1, 1))}
                  className="p-1 rounded bg-slate-800 text-slate-300 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-semibold text-white">Page {salesPage}</span>
                <button
                  disabled={salesInvoices.length < 15}
                  onClick={() => setSalesPage((p) => p + 1)}
                  className="p-1 rounded bg-slate-800 text-slate-300 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PURCHASE TAB CONTENT */}
      {activeTab === 'PURCHASE' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search PI number, supplier..."
                value={purchaseSearch}
                onChange={(e) => setPurchaseSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-[#f5b024]"
              />
            </div>

            <div>
              <select
                value={purchaseStatusFilter}
                onChange={(e) => setPurchaseStatusFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-[#f5b024]"
              >
                <option value="">All Statuses</option>
                <option value="DRAFT">DRAFT</option>
                <option value="POSTED">POSTED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>

            <div>
              <input
                type="date"
                value={purchaseFromDate}
                onChange={(e) => setPurchaseFromDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-[#f5b024]"
              />
            </div>

            <div>
              <input
                type="date"
                value={purchaseToDate}
                onChange={(e) => setPurchaseToDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-hidden focus:border-[#f5b024]"
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-400 font-semibold">
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4">Supplier Bill #</th>
                    <th className="py-3 px-4 text-right">Items</th>
                    <th className="py-3 px-4 text-right">Grand Total</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Payment</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {purchaseLoading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500">
                        <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-2" />
                        Loading purchase invoices...
                      </td>
                    </tr>
                  ) : purchaseInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500">
                        No purchase invoices found matching current criteria.
                      </td>
                    </tr>
                  ) : (
                    purchaseInvoices.map((inv) => (
                      <tr key={inv.invoiceId} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-white">
                          {inv.invoiceNumber}
                        </td>
                        <td className="py-3 px-4 text-slate-400">{inv.invoiceDate}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">
                            {inv.supplierId || 'Direct / FMCG Vendor'}
                          </div>
                          <div className="text-[11px] text-slate-400">{inv.supplierType}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                          {inv.supplierInvoiceNumber || '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          {inv.items.length}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-white">
                          ₹{inv.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {renderStatusBadge(inv.invoiceStatus)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="text-[10px] uppercase font-bold text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">
                            {inv.paymentStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedPurchaseInvoice(inv)}
                              className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer"
                              title="View Invoice Detail"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handlePreviewPurchaseInvoice(inv.invoiceId)}
                              className="p-1 hover:bg-slate-800 text-[#f5b024] hover:text-amber-300 rounded cursor-pointer"
                              title="Preview Document"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDownloadPurchaseInvoicePdf(inv.invoiceId, inv.invoiceNumber)}
                              className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded cursor-pointer"
                              title="Download PDF"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            {inv.invoiceStatus === 'DRAFT' && (
                              <button
                                onClick={() => handlePostPurchaseInvoice(inv.invoiceId)}
                                disabled={actionLoading}
                                className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
                                title="Post Invoice"
                              >
                                Post
                              </button>
                            )}
                            {inv.invoiceStatus !== 'CANCELLED' && (
                              <button
                                onClick={() => handleCancelPurchaseInvoice(inv.invoiceId)}
                                disabled={actionLoading}
                                className="p-1 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 rounded cursor-pointer"
                                title="Cancel Invoice"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-950/70 border-t border-slate-800 text-xs text-slate-400">
              <div>
                Showing {purchaseInvoices.length} of {purchaseTotal} invoices
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={purchasePage <= 1}
                  onClick={() => setPurchasePage((p) => Math.max(p - 1, 1))}
                  className="p-1 rounded bg-slate-800 text-slate-300 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-semibold text-white">Page {purchasePage}</span>
                <button
                  disabled={purchaseInvoices.length < 15}
                  onClick={() => setPurchasePage((p) => p + 1)}
                  className="p-1 rounded bg-slate-800 text-slate-300 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL MODAL FOR SALES INVOICE */}
      {selectedSalesInvoice && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 space-y-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white font-mono">
                    {selectedSalesInvoice.invoiceNumber}
                  </h2>
                  {renderStatusBadge(selectedSalesInvoice.invoiceStatus)}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Issued on {selectedSalesInvoice.invoiceDate} • Warehouse: {selectedSalesInvoice.warehouseId}
                </p>
              </div>
              <button
                onClick={() => setSelectedSalesInvoice(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Address Snapshots */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Billing Address Snapshot
                </span>
                <div className="font-bold text-white">
                  {selectedSalesInvoice.billingAddressSnapshot.businessName}
                </div>
                <div className="text-slate-300">
                  {selectedSalesInvoice.billingAddressSnapshot.contactName} • {selectedSalesInvoice.billingAddressSnapshot.mobile}
                </div>
                <div className="text-slate-400">
                  {selectedSalesInvoice.billingAddressSnapshot.fullAddress}, {selectedSalesInvoice.billingAddressSnapshot.city} - {selectedSalesInvoice.billingAddressSnapshot.pincode}
                </div>
                {selectedSalesInvoice.billingAddressSnapshot.gstin && (
                  <div className="text-[11px] text-[#f5b024]">
                    GSTIN: {selectedSalesInvoice.billingAddressSnapshot.gstin}
                  </div>
                )}
              </div>

              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Shipping Address Snapshot
                </span>
                <div className="font-bold text-white">
                  {selectedSalesInvoice.shippingAddressSnapshot.businessName}
                </div>
                <div className="text-slate-300">
                  {selectedSalesInvoice.shippingAddressSnapshot.contactName} • {selectedSalesInvoice.shippingAddressSnapshot.mobile}
                </div>
                <div className="text-slate-400">
                  {selectedSalesInvoice.shippingAddressSnapshot.fullAddress}, {selectedSalesInvoice.shippingAddressSnapshot.city} - {selectedSalesInvoice.shippingAddressSnapshot.pincode}
                </div>
              </div>
            </div>

            {/* Line Items Snapshot */}
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Item / SKU</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Price</th>
                    <th className="py-2.5 px-3 text-right">Discount</th>
                    <th className="py-2.5 px-3 text-right">Taxable</th>
                    <th className="py-2.5 px-3 text-right">Tax</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {selectedSalesInvoice.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-3">
                        <div className="font-semibold text-white">{item.productNameSnapshot}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{item.skuSnapshot}</div>
                      </td>
                      <td className="py-2 px-3 text-right font-medium">{item.quantity}</td>
                      <td className="py-2 px-3 text-right font-mono">₹{item.unitPrice.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-400">₹{item.discountAmount.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right font-mono">₹{item.taxableAmount.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-400">
                        ₹{item.taxAmount.toFixed(2)} ({item.taxRate}%)
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-white">
                        ₹{item.lineTotal.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary Totals */}
            <div className="flex justify-end text-xs">
              <div className="w-64 space-y-1.5 bg-slate-950/70 p-4 rounded-xl border border-slate-800">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal:</span>
                  <span className="font-mono text-white">₹{selectedSalesInvoice.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Discount:</span>
                  <span className="font-mono text-white">-₹{selectedSalesInvoice.discountTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Taxable Total:</span>
                  <span className="font-mono text-white">₹{selectedSalesInvoice.taxableTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Tax Total:</span>
                  <span className="font-mono text-white">₹{selectedSalesInvoice.taxTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-[#f5b024] border-t border-slate-800 pt-2 mt-2">
                  <span>Grand Total:</span>
                  <span className="font-mono">₹{selectedSalesInvoice.grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Authoritative Accounting Integration Section */}
            <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Accounting & Ledger Integration
                </span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  selectedSalesInvoice.accountingStatus === 'POSTED'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                }`}>
                  {selectedSalesInvoice.accountingStatus}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                <div>
                  <span className="text-slate-500 block text-[10px]">Voucher Number</span>
                  <span className="font-mono font-bold text-white">
                    {selectedSalesInvoice.accountingVoucherNumber || '— (Pending Issue)'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Journal Entry ID</span>
                  <span className="font-mono text-slate-300 text-[11px] truncate block">
                    {selectedSalesInvoice.accountingJournalId || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Posted Timestamp</span>
                  <span className="text-slate-300">
                    {selectedSalesInvoice.accountingPostedAt
                      ? new Date(selectedSalesInvoice.accountingPostedAt).toLocaleString('en-IN')
                      : '—'}
                  </span>
                </div>
              </div>
              {selectedSalesInvoice.invoiceStatus === 'ISSUED' && (
                <div className="text-[11px] text-emerald-400 font-medium pt-1 border-t border-slate-800/60 mt-1">
                  ✓ Accounting Posted • Voucher: {selectedSalesInvoice.accountingVoucherNumber || 'JV Assigned'}
                </div>
              )}
              {selectedSalesInvoice.invoiceStatus === 'CANCELLED' && (
                <div className="text-[11px] text-rose-400 font-medium pt-1 border-t border-slate-800/60 mt-1">
                  Cancelled
                </div>
              )}
            </div>

            {/* Phase 5.5 Part 4: Official Document Actions Bar */}
            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-white block">
                  Official Commercial Document
                </span>
                <span className="text-[11px] text-slate-400">
                  Read-only presentation • A4 Printable • Authoritative PDF
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePreviewSalesInvoice(selectedSalesInvoice.invoiceId)}
                  disabled={documentLoading}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-[#f5b024]" />
                  <span>Preview</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintSalesInvoice(selectedSalesInvoice.invoiceId)}
                  disabled={documentLoading}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-300" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadSalesInvoicePdf(selectedSalesInvoice.invoiceId, selectedSalesInvoice.invoiceNumber)}
                  disabled={documentLoading}
                  className="px-4 py-1.5 bg-[#f5b024] hover:bg-[#e5a014] text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
              </div>
            </div>

            {/* Metadata Footer & Controlled Lifecycle Actions */}
            <div className="text-[11px] text-slate-500 border-t border-slate-800 pt-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                Created by {selectedSalesInvoice.createdBy} • Updated: {selectedSalesInvoice.updatedAt}
              </div>
              <div className="flex items-center gap-2">
                {selectedSalesInvoice.invoiceStatus === 'DRAFT' && (
                  <button
                    onClick={() => handleIssueSalesInvoice(selectedSalesInvoice.invoiceId)}
                    disabled={actionLoading}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg cursor-pointer transition-colors"
                  >
                    ISSUE INVOICE
                  </button>
                )}
                {selectedSalesInvoice.invoiceStatus === 'ISSUED' && (
                  <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold rounded-lg text-xs">
                    Accounting Posted • Voucher: {selectedSalesInvoice.accountingVoucherNumber}
                  </span>
                )}
                {selectedSalesInvoice.invoiceStatus === 'CANCELLED' && (
                  <span className="px-3 py-1 bg-rose-500/10 border border-rose-500/30 text-rose-400 font-bold rounded-lg text-xs">
                    Cancelled
                  </span>
                )}
                {selectedSalesInvoice.invoiceStatus !== 'CANCELLED' && (
                  <button
                    onClick={() => handleCancelSalesInvoice(selectedSalesInvoice.invoiceId)}
                    disabled={actionLoading}
                    className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg cursor-pointer transition-colors"
                  >
                    Cancel Invoice
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL MODAL FOR PURCHASE INVOICE */}
      {selectedPurchaseInvoice && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 space-y-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white font-mono">
                    {selectedPurchaseInvoice.invoiceNumber}
                  </h2>
                  {renderStatusBadge(selectedPurchaseInvoice.invoiceStatus)}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Dated {selectedPurchaseInvoice.invoiceDate} • Warehouse: {selectedPurchaseInvoice.warehouseId}
                </p>
              </div>
              <button
                onClick={() => setSelectedPurchaseInvoice(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Supplier and Receiving Addresses */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Supplier Information
                </span>
                <div className="font-bold text-white">
                  {selectedPurchaseInvoice.supplierId || 'Direct FMCG Vendor'}
                </div>
                <div className="text-slate-300">
                  Type: {selectedPurchaseInvoice.supplierType}
                </div>
                {selectedPurchaseInvoice.supplierInvoiceNumber && (
                  <div className="text-slate-400">
                    Vendor Bill Ref: {selectedPurchaseInvoice.supplierInvoiceNumber}
                  </div>
                )}
              </div>

              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Warehouse Inward Hub
                </span>
                <div className="font-bold text-white">
                  {selectedPurchaseInvoice.shippingAddressSnapshot.businessName}
                </div>
                <div className="text-slate-400">
                  {selectedPurchaseInvoice.shippingAddressSnapshot.fullAddress}, {selectedPurchaseInvoice.shippingAddressSnapshot.city}
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Item / SKU</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Cost</th>
                    <th className="py-2.5 px-3 text-right">Discount</th>
                    <th className="py-2.5 px-3 text-right">Taxable</th>
                    <th className="py-2.5 px-3 text-right">Tax</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {selectedPurchaseInvoice.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-3">
                        <div className="font-semibold text-white">{item.productNameSnapshot}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{item.skuSnapshot}</div>
                      </td>
                      <td className="py-2 px-3 text-right font-medium">{item.quantity}</td>
                      <td className="py-2 px-3 text-right font-mono">₹{item.unitCost.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-400">₹{item.discountAmount.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right font-mono">₹{item.taxableAmount.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-400">
                        ₹{item.taxAmount.toFixed(2)} ({item.taxRate}%)
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-white">
                        ₹{item.lineTotal.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary Totals */}
            <div className="flex justify-end text-xs">
              <div className="w-64 space-y-1.5 bg-slate-950/70 p-4 rounded-xl border border-slate-800">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal:</span>
                  <span className="font-mono text-white">₹{selectedPurchaseInvoice.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Discount:</span>
                  <span className="font-mono text-white">-₹{selectedPurchaseInvoice.discountTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Taxable Total:</span>
                  <span className="font-mono text-white">₹{selectedPurchaseInvoice.taxableTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Tax Total:</span>
                  <span className="font-mono text-white">₹{selectedPurchaseInvoice.taxTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-[#f5b024] border-t border-slate-800 pt-2 mt-2">
                  <span>Grand Total:</span>
                  <span className="font-mono">₹{selectedPurchaseInvoice.grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Authoritative Accounting Integration Section */}
            <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Accounting & Ledger Integration
                </span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  selectedPurchaseInvoice.accountingStatus === 'POSTED'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                }`}>
                  {selectedPurchaseInvoice.accountingStatus}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                <div>
                  <span className="text-slate-500 block text-[10px]">Voucher Number</span>
                  <span className="font-mono font-bold text-white">
                    {selectedPurchaseInvoice.accountingVoucherNumber || '— (Pending Post)'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Journal Entry ID</span>
                  <span className="font-mono text-slate-300 text-[11px] truncate block">
                    {selectedPurchaseInvoice.accountingJournalId || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Posted Timestamp</span>
                  <span className="text-slate-300">
                    {selectedPurchaseInvoice.accountingPostedAt
                      ? new Date(selectedPurchaseInvoice.accountingPostedAt).toLocaleString('en-IN')
                      : '—'}
                  </span>
                </div>
              </div>
              {selectedPurchaseInvoice.invoiceStatus === 'POSTED' && (
                <div className="text-[11px] text-emerald-400 font-medium pt-1 border-t border-slate-800/60 mt-1">
                  ✓ Accounting Posted • Voucher: {selectedPurchaseInvoice.accountingVoucherNumber || 'PV Assigned'}
                </div>
              )}
              {selectedPurchaseInvoice.invoiceStatus === 'CANCELLED' && (
                <div className="text-[11px] text-rose-400 font-medium pt-1 border-t border-slate-800/60 mt-1">
                  Cancelled
                </div>
              )}
            </div>

            {/* Phase 5.5 Part 4: Official Document Actions Bar */}
            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-white block">
                  Official Commercial Document
                </span>
                <span className="text-[11px] text-slate-400">
                  Read-only presentation • A4 Printable • Authoritative PDF
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePreviewPurchaseInvoice(selectedPurchaseInvoice.invoiceId)}
                  disabled={documentLoading}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-[#f5b024]" />
                  <span>Preview</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintPurchaseInvoice(selectedPurchaseInvoice.invoiceId)}
                  disabled={documentLoading}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-300" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadPurchaseInvoicePdf(selectedPurchaseInvoice.invoiceId, selectedPurchaseInvoice.invoiceNumber)}
                  disabled={documentLoading}
                  className="px-4 py-1.5 bg-[#f5b024] hover:bg-[#e5a014] text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="text-[11px] text-slate-500 border-t border-slate-800 pt-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                Created by {selectedPurchaseInvoice.createdBy} • Accounting: {selectedPurchaseInvoice.accountingStatus}
              </div>
              <div className="flex gap-2">
                {selectedPurchaseInvoice.invoiceStatus === 'DRAFT' && (
                  <button
                    onClick={() => handlePostPurchaseInvoice(selectedPurchaseInvoice.invoiceId)}
                    disabled={actionLoading}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg cursor-pointer transition-colors"
                  >
                    POST PURCHASE INVOICE
                  </button>
                )}
                {selectedPurchaseInvoice.invoiceStatus !== 'CANCELLED' && (
                  <button
                    onClick={() => handleCancelPurchaseInvoice(selectedPurchaseInvoice.invoiceId)}
                    disabled={actionLoading}
                    className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg cursor-pointer transition-colors"
                  >
                    Cancel Invoice
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE SALES INVOICE MODAL */}
      {showCreateSalesModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#f5b024]" />
                Create New Sales Invoice (SI)
              </h2>
              <button
                onClick={() => setShowCreateSalesModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSalesInvoice} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Customer / Retailer ID *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ret_brahmpuri_001"
                    value={salesCustomerId}
                    onChange={(e) => setSalesCustomerId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:outline-hidden focus:border-[#f5b024]"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Source Order ID (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. ord_12345"
                    value={salesSourceOrderId}
                    onChange={(e) => setSalesSourceOrderId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:outline-hidden focus:border-[#f5b024]"
                  />
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-300">Line Items *</label>
                  <button
                    type="button"
                    onClick={() =>
                      setSalesItems((prev) => [
                        ...prev,
                        { productId: '', skuSnapshot: '', productNameSnapshot: '', quantity: 1, unitPrice: 0, discountAmount: 0, taxRate: 0 },
                      ])
                    }
                    className="text-[#f5b024] hover:underline font-semibold"
                  >
                    + Add Item
                  </button>
                </div>

                {salesItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                    <div className="col-span-12 sm:col-span-4">
                      <input
                        type="text"
                        required
                        placeholder="Product ID (e.g. prod_01)"
                        value={item.productId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSalesItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, productId: val } : it))
                          );
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <input
                        type="number"
                        min="1"
                        required
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSalesItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, quantity: val } : it))
                          );
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        placeholder="Unit Price"
                        value={item.unitPrice}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSalesItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, unitPrice: val } : it))
                          );
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Discount"
                        value={item.discountAmount}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSalesItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, discountAmount: val } : it))
                          );
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-2 flex items-center justify-end">
                      {salesItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSalesItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-rose-400 hover:text-rose-300"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateSalesModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-[#f5b024] hover:bg-[#e5a014] text-slate-950 font-bold rounded-lg cursor-pointer"
                >
                  {actionLoading ? 'Creating...' : 'Create Draft SI'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE PURCHASE INVOICE MODAL */}
      {showCreatePurchaseModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#f5b024]" />
                Create New Purchase Invoice (PI)
              </h2>
              <button
                onClick={() => setShowCreatePurchaseModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePurchaseInvoice} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Supplier ID / Name (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. sup_itc_distributor"
                    value={purchaseSupplierId}
                    onChange={(e) => setPurchaseSupplierId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:outline-hidden focus:border-[#f5b024]"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Supplier Bill # (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. ITC-DEL-9842"
                    value={purchaseSupplierInvoiceNum}
                    onChange={(e) => setPurchaseSupplierInvoiceNum(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:outline-hidden focus:border-[#f5b024]"
                  />
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-300">Purchase Line Items *</label>
                  <button
                    type="button"
                    onClick={() =>
                      setPurchaseItems((prev) => [
                        ...prev,
                        { productId: '', skuSnapshot: '', productNameSnapshot: '', quantity: 1, unitCost: 0, discountAmount: 0, taxRate: 0 },
                      ])
                    }
                    className="text-[#f5b024] hover:underline font-semibold"
                  >
                    + Add Item
                  </button>
                </div>

                {purchaseItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                    <div className="col-span-12 sm:col-span-4">
                      <input
                        type="text"
                        required
                        placeholder="Product ID (e.g. prod_01)"
                        value={item.productId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPurchaseItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, productId: val } : it))
                          );
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <input
                        type="number"
                        min="1"
                        required
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setPurchaseItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, quantity: val } : it))
                          );
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        placeholder="Unit Cost"
                        value={item.unitCost}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setPurchaseItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, unitCost: val } : it))
                          );
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Discount"
                        value={item.discountAmount}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setPurchaseItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, discountAmount: val } : it))
                          );
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-2 flex items-center justify-end">
                      {purchaseItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setPurchaseItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-rose-400 hover:text-rose-300"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreatePurchaseModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-[#f5b024] hover:bg-[#e5a014] text-slate-950 font-bold rounded-lg cursor-pointer"
                >
                  {actionLoading ? 'Creating...' : 'Create Draft PI'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PHASE 5.5 PART 4: DOCUMENT PREVIEW MODAL */}
      <InvoiceDocumentModal
        document={previewDoc}
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        isAdmin={true}
      />
    </div>
  );
};
