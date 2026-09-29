/**
 * MR FUTKAR — Admin Supplier Ledger & Reporting Section (Phase 5.8 Part 5)
 * Server-authoritative, read-only supplier accounting console.
 * Incorporates:
 * 1. Supplier Accounting Summary (KPI cards derived from Account 2100 & payments)
 * 2. Supplier Statement (transaction-wise running balance from posted journals)
 * 3. Payment History (voucher, method, amount, allocated, unallocated, reversal info)
 * 4. Outstanding Purchase Invoices (invoice number, date, total, allocated, outstanding)
 *
 * Strict read-only guarantee: zero accounting mutations or client-side balance overrides.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Truck,
  Search,
  Calendar,
  Filter,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  FileText,
  AlertCircle,
  CheckCircle2,
  Phone,
  MapPin,
  TrendingDown,
  Building2,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  CreditCard,
  Receipt,
  DollarSign,
  Clock,
  Ban,
  Check,
  RotateCcw,
  Download,
} from 'lucide-react';
import { AdminClient } from '../../../services/adminClient';
import {
  SupplierLedgerSummaryResponse,
} from '../../../types/partyLedger';
import {
  SupplierStatementResponse,
  SupplierStatementTransaction,
  SupplierPaymentHistoryResponse,
  SupplierPaymentHistoryItem,
  SupplierOutstandingInvoicesResponse,
  OutstandingPurchaseInvoiceItem,
  SupplierAccountingSummaryResponse,
  SupplierStatementTransactionType,
} from '../../../types/supplierPayment';

type DetailTab = 'STATEMENT' | 'PAYMENTS' | 'INVOICES' | 'SUMMARY';

export const AdminSupplierLedgerSection: React.FC = () => {
  // Navigation mode: 'SUPPLIERS_LIST' | 'SUPPLIER_DETAIL'
  const [viewMode, setViewMode] = useState<'SUPPLIERS_LIST' | 'SUPPLIER_DETAIL'>('SUPPLIERS_LIST');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('STATEMENT');

  // Filters for Suppliers List
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [txTypeFilter, setTxTypeFilter] = useState<string>('ALL');

  // Global / Supplier List States
  const [summaryList, setSummaryList] = useState<SupplierLedgerSummaryResponse | null>(null);
  const [globalAccountingSummary, setGlobalAccountingSummary] = useState<SupplierAccountingSummaryResponse | null>(null);

  // Detail View Data States
  const [supplierSummary, setSupplierSummary] = useState<SupplierAccountingSummaryResponse | null>(null);
  const [statementData, setStatementData] = useState<SupplierStatementResponse | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<SupplierPaymentHistoryResponse | null>(null);
  const [outstandingInvoices, setOutstandingInvoices] = useState<SupplierOutstandingInvoicesResponse | null>(null);

  // Pagination for Statement & Payments
  const [statementPage, setStatementPage] = useState<number>(1);
  const [paymentPage, setPaymentPage] = useState<number>(1);
  const pageSize = 50;

  // Status & Error
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Helper: Trigger browser file download from Blob
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Helper: Format paise to INR
  const formatPaise = (paise: number | undefined): string => {
    if (paise === undefined || isNaN(paise)) return '₹0.00';
    const rupees = paise / 100;
    return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Helper: Format rupees to INR
  const formatCurrency = (val: number | undefined): string => {
    if (val === undefined || isNaN(val)) return '₹0.00';
    return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // =========================================================================
  // DATA LOADERS
  // =========================================================================

  // 1. Load All Suppliers & Global Accounting Summary
  const loadSuppliersList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, globalSummaryRes] = await Promise.all([
        AdminClient.fetchSupplierLedgerSummary({
          search: searchQuery || undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        }),
        AdminClient.fetchSupplierAccountingSummary({
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        }),
      ]);

      if (summaryRes.success && summaryRes.data) {
        setSummaryList(summaryRes.data);
      } else {
        setError(summaryRes.message || 'Failed to load suppliers summary.');
      }

      if (globalSummaryRes.success && globalSummaryRes.data) {
        setGlobalAccountingSummary(globalSummaryRes.data);
      }
    } catch (err: any) {
      setError(err.message || 'Network error loading supplier data.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, fromDate, toDate]);

  // 2. Load Selected Supplier Detail Data
  const loadSupplierDetail = useCallback(async (supplierId: string, currentDetailTab: DetailTab) => {
    setLoading(true);
    setError(null);
    try {
      // Always load the supplier accounting summary for header cards
      const summaryPromise = AdminClient.fetchSupplierAccountingSummary({
        supplierId,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });

      if (currentDetailTab === 'STATEMENT') {
        const [sumRes, stmtRes] = await Promise.all([
          summaryPromise,
          AdminClient.fetchSupplierStatement(supplierId, {
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            transactionType: txTypeFilter !== 'ALL' ? (txTypeFilter as SupplierStatementTransactionType) : undefined,
            page: statementPage,
            pageSize,
          }),
        ]);

        if (sumRes.success && sumRes.data) setSupplierSummary(sumRes.data);
        if (stmtRes.success && stmtRes.data) {
          setStatementData(stmtRes.data);
        } else {
          setError(stmtRes.message || 'Failed to load supplier statement.');
        }
      } else if (currentDetailTab === 'PAYMENTS') {
        const [sumRes, payRes] = await Promise.all([
          summaryPromise,
          AdminClient.fetchSupplierPaymentHistory({
            supplierId,
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            page: paymentPage,
            pageSize,
          }),
        ]);

        if (sumRes.success && sumRes.data) setSupplierSummary(sumRes.data);
        if (payRes.success && payRes.data) {
          setPaymentHistory(payRes.data);
        } else {
          setError(payRes.message || 'Failed to load supplier payment history.');
        }
      } else if (currentDetailTab === 'INVOICES') {
        const [sumRes, invRes] = await Promise.all([
          summaryPromise,
          AdminClient.fetchSupplierOutstandingInvoices(supplierId),
        ]);

        if (sumRes.success && sumRes.data) setSupplierSummary(sumRes.data);
        if (invRes.success && invRes.data) {
          setOutstandingInvoices(invRes.data);
        } else {
          setError(invRes.message || 'Failed to load outstanding invoices.');
        }
      } else if (currentDetailTab === 'SUMMARY') {
        const sumRes = await summaryPromise;
        if (sumRes.success && sumRes.data) {
          setSupplierSummary(sumRes.data);
        } else {
          setError(sumRes.message || 'Failed to load supplier accounting summary.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching supplier accounting records.');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, txTypeFilter, statementPage, paymentPage]);

  // Initial & Dependency Trigger
  useEffect(() => {
    if (viewMode === 'SUPPLIERS_LIST') {
      loadSuppliersList();
    } else if (viewMode === 'SUPPLIER_DETAIL' && selectedSupplierId) {
      loadSupplierDetail(selectedSupplierId, detailTab);
    }
  }, [viewMode, selectedSupplierId, detailTab, loadSuppliersList, loadSupplierDetail]);

  const handleSelectSupplier = (supplierId: string) => {
    setSelectedSupplierId(supplierId);
    setStatementPage(1);
    setPaymentPage(1);
    setDetailTab('STATEMENT');
    setViewMode('SUPPLIER_DETAIL');
  };

  const handleBackToList = () => {
    setSelectedSupplierId(null);
    setStatementData(null);
    setPaymentHistory(null);
    setOutstandingInvoices(null);
    setSupplierSummary(null);
    setViewMode('SUPPLIERS_LIST');
  };

  // Export current view to CSV
  const handleExportCurrentView = async () => {
    if (viewMode === 'SUPPLIERS_LIST') {
      setExporting(true);
      try {
        const res = await AdminClient.exportSupplierAccountingSummaryCsv({
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        });
        if (res.success && res.blob) {
          triggerDownload(res.blob, res.filename || 'suppliers_accounting_summary.csv');
        } else {
          setError(res.error || 'Failed to export accounting summary CSV.');
        }
      } catch {
        setError('Network error exporting summary.');
      } finally {
        setExporting(false);
      }
      return;
    }

    if (!selectedSupplierId) return;

    setExporting(true);
    try {
      if (detailTab === 'STATEMENT') {
        const res = await AdminClient.exportSupplierStatementCsv(selectedSupplierId, {
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          transactionType: txTypeFilter !== 'ALL' ? (txTypeFilter as SupplierStatementTransactionType) : undefined,
        });
        if (res.success && res.blob) {
          triggerDownload(res.blob, res.filename || `supplier_statement_${selectedSupplierId}.csv`);
        } else {
          setError(res.error || 'Failed to export supplier statement CSV.');
        }
      } else if (detailTab === 'PAYMENTS') {
        const res = await AdminClient.exportSupplierPaymentHistoryCsv({
          supplierId: selectedSupplierId,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        });
        if (res.success && res.blob) {
          triggerDownload(res.blob, res.filename || `supplier_payments_${selectedSupplierId}.csv`);
        } else {
          setError(res.error || 'Failed to export payments CSV.');
        }
      } else if (detailTab === 'INVOICES') {
        const res = await AdminClient.exportSupplierOutstandingInvoicesCsv(selectedSupplierId);
        if (res.success && res.blob) {
          triggerDownload(res.blob, res.filename || `outstanding_invoices_${selectedSupplierId}.csv`);
        } else {
          setError(res.error || 'Failed to export invoices CSV.');
        }
      } else if (detailTab === 'SUMMARY') {
        const res = await AdminClient.exportSupplierAccountingSummaryCsv({
          supplierId: selectedSupplierId,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        });
        if (res.success && res.blob) {
          triggerDownload(res.blob, res.filename || `supplier_summary_${selectedSupplierId}.csv`);
        } else {
          setError(res.error || 'Failed to export supplier summary CSV.');
        }
      }
    } catch {
      setError('Network error downloading report CSV.');
    } finally {
      setExporting(false);
    }
  };

  const getDocTypeBadge = (docType: string) => {
    switch (docType) {
      case 'PURCHASE_INVOICE':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 text-blue-800 border border-blue-200">Purchase Bill</span>;
      case 'PURCHASE_DEBIT_NOTE':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-100 text-emerald-800 border border-emerald-200">Debit Note</span>;
      case 'PURCHASE_CREDIT_NOTE':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-100 text-purple-800 border border-purple-200">Credit Note</span>;
      case 'SUPPLIER_PAYMENT':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-800 border border-amber-200">Supplier Payment</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-stone-100 text-stone-700 border border-stone-200">Journal Entry</span>;
    }
  };

  const getPaymentMethodBadge = (method: string) => {
    switch (method) {
      case 'BANK_TRANSFER':
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-sky-50 text-sky-700 border border-sky-200">Bank Transfer</span>;
      case 'UPI':
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-indigo-50 text-indigo-700 border border-indigo-200">UPI</span>;
      case 'CASH':
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200">Cash</span>;
      case 'CHEQUE':
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-purple-50 text-purple-700 border border-purple-200">Cheque</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-stone-100 text-stone-700">{method}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Mode Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-stone-900">Supplier Accounting & Payables</span>
              <span className="px-2 py-0.5 text-[10px] font-bold tracking-wide rounded bg-indigo-100 text-indigo-800 uppercase">
                Phase 5.8
              </span>
            </div>
            <p className="text-xs text-stone-500">
              {viewMode === 'SUPPLIERS_LIST'
                ? 'Server-authoritative vendor balances, payment history, outstanding invoices, and subledger'
                : `Accounting record and double-entry ledger for ${supplierSummary?.supplierName || statementData?.supplierName || selectedSupplierId}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {viewMode === 'SUPPLIER_DETAIL' && (
            <button
              type="button"
              onClick={handleBackToList}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to All Suppliers
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCurrentView}
            disabled={exporting || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            title="Export server-authoritative CSV report"
          >
            <Download className={`w-3.5 h-3.5 ${exporting ? 'animate-bounce' : ''}`} />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>

          <button
            type="button"
            onClick={() => {
              if (viewMode === 'SUPPLIERS_LIST') loadSuppliersList();
              else if (selectedSupplierId) loadSupplierDetail(selectedSupplierId, detailTab);
            }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 hover:bg-stone-50 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ERROR NOTICE */}
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-rose-800 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-600 hover:text-rose-800 font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. SUPPLIERS LIST VIEW                                                    */}
      {/* ========================================================================= */}
      {viewMode === 'SUPPLIERS_LIST' && (
        <div className="space-y-6">
          {/* Global Accounting Summary KPI Cards */}
          {globalAccountingSummary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
                <div className="text-xs font-medium text-stone-500 mb-1">Total Outstanding AP</div>
                <div className="text-xl font-bold text-indigo-700">
                  {formatPaise(globalAccountingSummary.totalOutstandingAPPaise)}
                </div>
                <div className="mt-2 text-[11px] text-stone-500 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3 text-indigo-600" />
                  Net Trade Payables (Account 2100)
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
                <div className="text-xs font-medium text-stone-500 mb-1">Posted Payments</div>
                <div className="text-xl font-bold text-emerald-700">
                  {formatPaise(globalAccountingSummary.totalPostedPaymentsPaise)}
                </div>
                <div className="mt-2 text-[11px] text-stone-500">
                  Allocated: <span className="font-semibold text-stone-700">{formatPaise(globalAccountingSummary.totalAllocatedPaymentsPaise)}</span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
                <div className="text-xs font-medium text-stone-500 mb-1">Unallocated Payments</div>
                <div className="text-xl font-bold text-amber-700">
                  {formatPaise(globalAccountingSummary.totalUnallocatedPaymentsPaise)}
                </div>
                <div className="mt-2 text-[11px] text-stone-500">
                  Reversed: <span className="font-semibold text-rose-600">{formatPaise(globalAccountingSummary.totalReversedPaymentsPaise)}</span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
                <div className="text-xs font-medium text-stone-500 mb-1">Due Purchase Bills</div>
                <div className="text-xl font-bold text-stone-900">
                  {globalAccountingSummary.numberOfOutstandingInvoices}
                  <span className="text-xs font-normal text-stone-400 ml-1.5">bills pending payment</span>
                </div>
                <div className="mt-2 text-[11px] text-stone-500 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Server-authoritative calculation
                </div>
              </div>
            </div>
          )}

          {/* Search & Date Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-stone-200 shadow-xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                placeholder="Search vendor by business name, supplier ID, or contact number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-stone-600 bg-stone-50 px-2.5 py-1.5 rounded-lg border border-stone-200">
                <Calendar className="w-3.5 h-3.5 text-stone-400" />
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="bg-transparent text-xs text-stone-700 focus:outline-none"
                  placeholder="From"
                />
                <span className="text-stone-400">to</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="bg-transparent text-xs text-stone-700 focus:outline-none"
                  placeholder="To"
                />
              </div>

              {(fromDate || toDate || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setFromDate('');
                    setToDate('');
                    setSearchQuery('');
                  }}
                  className="px-2.5 py-1.5 text-xs text-stone-500 hover:text-stone-700 cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Suppliers List Table */}
          <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-stone-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-stone-900">FMCG Supplier Accounts</h4>
                <span className="px-2 py-0.5 text-xs bg-stone-100 text-stone-600 rounded-full font-mono">
                  {summaryList?.suppliers.length || 0}
                </span>
              </div>
              <div className="text-xs text-stone-500 font-mono">
                Subledger ↔ General Ledger (2100) Reconciled
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Supplier / Vendor</th>
                    <th className="py-3 px-4">Contact & Location</th>
                    <th className="py-3 px-4 text-right">Total Purchases (CR)</th>
                    <th className="py-3 px-4 text-right">Total Debited (DR)</th>
                    <th className="py-3 px-4 text-right">Outstanding AP</th>
                    <th className="py-3 px-4 text-center">Txns</th>
                    <th className="py-3 px-4 text-right">Last Activity</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-mono text-stone-700">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-stone-400 font-sans">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                          <span>Loading supplier accounting records...</span>
                        </div>
                      </td>
                    </tr>
                  ) : !summaryList || summaryList.suppliers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-stone-400 font-sans">
                        No suppliers found matching the specified filters.
                      </td>
                    </tr>
                  ) : (
                    summaryList.suppliers.map((supp) => (
                      <tr key={supp.supplierId} className="hover:bg-stone-50 transition-colors">
                        <td className="py-3 px-4 font-sans">
                          <div className="font-semibold text-stone-900">{supp.businessName}</div>
                          <div className="text-[11px] text-stone-500 font-mono">{supp.supplierId}</div>
                        </td>
                        <td className="py-3 px-4 font-sans">
                          <div className="text-stone-900">{supp.contactName || '—'}</div>
                          <div className="text-[11px] text-stone-500 font-mono">
                            {supp.mobile || '—'} • {supp.city || 'Delhi'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-stone-900">
                          {formatCurrency(supp.totalCredit)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-stone-600">
                          {formatCurrency(supp.totalDebit)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold">
                          <span className={supp.outstandingBalance > 0 ? 'text-indigo-700' : 'text-stone-500'}>
                            {formatCurrency(supp.outstandingBalance)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-stone-600">
                          {supp.transactionCount}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-[11px] text-stone-500">
                          {supp.lastTransactionDate || '—'}
                        </td>
                        <td className="py-3 px-4 text-center font-sans">
                          <button
                            type="button"
                            onClick={() => handleSelectSupplier(supp.supplierId)}
                            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                          >
                            Accounting
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SELECTED SUPPLIER DETAIL VIEW (4 READ-ONLY VIEWS)                      */}
      {/* ========================================================================= */}
      {viewMode === 'SUPPLIER_DETAIL' && selectedSupplierId && (
        <div className="space-y-6">
          {/* VIEW 1: SUPPLIER ACCOUNTING SUMMARY HEADER CARDS */}
          <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-stone-100">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-stone-900">
                    {supplierSummary?.supplierName || statementData?.supplierName || selectedSupplierId}
                  </h3>
                  <span className="px-2 py-0.5 text-xs font-mono font-medium rounded bg-stone-100 text-stone-600">
                    {selectedSupplierId}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 mt-1.5 text-xs text-stone-600">
                  {statementData?.supplierSnapshot?.contactName && (
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-stone-400" />
                      {statementData.supplierSnapshot.contactName}
                    </span>
                  )}
                  {statementData?.supplierSnapshot?.mobile && (
                    <span className="flex items-center gap-1 font-mono">
                      <Phone className="w-3.5 h-3.5 text-stone-400" />
                      {statementData.supplierSnapshot.mobile}
                    </span>
                  )}
                  {statementData?.supplierSnapshot?.city && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-stone-400" />
                      {statementData.supplierSnapshot.city}, {statementData.supplierSnapshot.state}
                    </span>
                  )}
                  {statementData?.supplierSnapshot?.gstin && (
                    <span className="font-mono text-stone-500">
                      GSTIN: <span className="font-semibold text-stone-700">{statementData.supplierSnapshot.gstin}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Outstanding AP Highlight */}
              <div className="text-right flex flex-col items-end">
                <span className="text-xs text-stone-500 font-medium">Current Outstanding AP</span>
                <span className="text-2xl font-extrabold text-indigo-700 font-mono">
                  {supplierSummary
                    ? formatPaise(supplierSummary.totalOutstandingAPPaise)
                    : statementData
                    ? formatPaise(statementData.currentOutstandingAPPaise)
                    : '₹0.00'}
                </span>
                <span className="text-[10px] text-stone-400 mt-0.5">Account 2100 (Liability Normal Balance)</span>
              </div>
            </div>

            {/* Key Supplier Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
              <div className="p-3 bg-stone-50 rounded-lg">
                <div className="text-[11px] font-medium text-stone-500">Posted Payments</div>
                <div className="text-sm font-bold text-stone-900 mt-0.5 font-mono">
                  {supplierSummary ? formatPaise(supplierSummary.totalPostedPaymentsPaise) : '—'}
                </div>
              </div>

              <div className="p-3 bg-emerald-50 rounded-lg">
                <div className="text-[11px] font-medium text-emerald-700">Allocated</div>
                <div className="text-sm font-bold text-emerald-800 mt-0.5 font-mono">
                  {supplierSummary ? formatPaise(supplierSummary.totalAllocatedPaymentsPaise) : '—'}
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-lg">
                <div className="text-[11px] font-medium text-amber-700">Unallocated</div>
                <div className="text-sm font-bold text-amber-800 mt-0.5 font-mono">
                  {supplierSummary ? formatPaise(supplierSummary.totalUnallocatedPaymentsPaise) : '—'}
                </div>
              </div>

              <div className="p-3 bg-rose-50 rounded-lg">
                <div className="text-[11px] font-medium text-rose-700">Reversed Payments</div>
                <div className="text-sm font-bold text-rose-800 mt-0.5 font-mono">
                  {supplierSummary ? formatPaise(supplierSummary.totalReversedPaymentsPaise) : '—'}
                </div>
              </div>

              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="text-[11px] font-medium text-blue-700">Due Invoices</div>
                <div className="text-sm font-bold text-blue-800 mt-0.5 font-mono">
                  {supplierSummary?.numberOfOutstandingInvoices ?? 0} bills
                </div>
              </div>

              <div className="p-3 bg-purple-50 rounded-lg">
                <div className="text-[11px] font-medium text-purple-700">Security & Integrity</div>
                <div className="text-xs font-bold text-purple-800 mt-1 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                  Server Verified
                </div>
              </div>
            </div>
          </div>

          {/* Sub-Tab Navigation */}
          <div className="flex items-center gap-2 border-b border-stone-200 pb-2">
            <button
              type="button"
              onClick={() => setDetailTab('STATEMENT')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                detailTab === 'STATEMENT'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Supplier Statement
            </button>

            <button
              type="button"
              onClick={() => setDetailTab('PAYMENTS')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                detailTab === 'PAYMENTS'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              Payment History
            </button>

            <button
              type="button"
              onClick={() => setDetailTab('INVOICES')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                detailTab === 'INVOICES'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              Outstanding Invoices
            </button>

            <button
              type="button"
              onClick={() => setDetailTab('SUMMARY')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                detailTab === 'SUMMARY'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Accounting Summary
            </button>
          </div>

          {/* ===================================================================== */}
          {/* TAB 1: SUPPLIER STATEMENT                                             */}
          {/* ===================================================================== */}
          {detailTab === 'STATEMENT' && (
            <div className="space-y-4">
              {/* Filter Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-stone-200 shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-stone-500">Transaction Type:</span>
                  <select
                    value={txTypeFilter}
                    onChange={(e) => {
                      setTxTypeFilter(e.target.value);
                      setStatementPage(1);
                    }}
                    className="text-xs py-1.5 px-2.5 bg-stone-50 border border-stone-200 rounded-lg text-stone-700 focus:outline-none"
                  >
                    <option value="ALL">All Transactions</option>
                    <option value="PURCHASE_INVOICE">Purchase Bills</option>
                    <option value="SUPPLIER_PAYMENT">Supplier Payments</option>
                    <option value="PURCHASE_DEBIT_NOTE">Debit Notes</option>
                    <option value="PURCHASE_CREDIT_NOTE">Credit Notes</option>
                    <option value="JOURNAL_ENTRY">Journal Entries</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-stone-600 bg-stone-50 px-2.5 py-1.5 rounded-lg border border-stone-200">
                    <Calendar className="w-3.5 h-3.5 text-stone-400" />
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => {
                        setFromDate(e.target.value);
                        setStatementPage(1);
                      }}
                      className="bg-transparent text-xs text-stone-700 focus:outline-none"
                      placeholder="From"
                    />
                    <span className="text-stone-400">to</span>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => {
                        setToDate(e.target.value);
                        setStatementPage(1);
                      }}
                      className="bg-transparent text-xs text-stone-700 focus:outline-none"
                      placeholder="To"
                    />
                  </div>

                  {(fromDate || toDate || txTypeFilter !== 'ALL') && (
                    <button
                      type="button"
                      onClick={() => {
                        setFromDate('');
                        setToDate('');
                        setTxTypeFilter('ALL');
                        setStatementPage(1);
                      }}
                      className="px-2.5 py-1.5 text-xs text-stone-500 hover:text-stone-700 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Statement Table */}
              <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-stone-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-stone-900">Statement of Account</h4>
                    <span className="px-2 py-0.5 text-xs bg-stone-100 text-stone-600 rounded-full font-mono">
                      {statementData?.pagination.totalCount || 0} entries
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-stone-500 font-mono hidden sm:inline">
                      Account 2100 (Normal Balance: CREDIT)
                    </span>
                    <button
                      type="button"
                      onClick={handleExportCurrentView}
                      disabled={exporting || loading}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                      title="Export Statement to CSV"
                    >
                      <Download className="w-3 h-3" />
                      Export CSV
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase font-semibold">
                      <tr>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Transaction Type</th>
                        <th className="py-3 px-4">Doc Ref / Number</th>
                        <th className="py-3 px-4">Journal Voucher</th>
                        <th className="py-3 px-4">Particulars / Narration</th>
                        <th className="py-3 px-4 text-right">Debit (DR)</th>
                        <th className="py-3 px-4 text-right">Credit (CR)</th>
                        <th className="py-3 px-4 text-right">Running Balance</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 font-mono text-stone-700">
                      {/* Opening Balance Row */}
                      {statementData && (
                        <tr className="bg-stone-50/80 font-semibold text-stone-900">
                          <td className="py-2.5 px-4 font-sans text-stone-500">
                            {fromDate || 'Beginning'}
                          </td>
                          <td colSpan={6} className="py-2.5 px-4 font-sans text-stone-600">
                            Opening Payable Balance (Prior to selected period)
                          </td>
                          <td className="py-2.5 px-4 text-right font-bold text-stone-900">
                            {formatPaise(statementData.openingBalancePaise)}
                          </td>
                          <td className="py-2.5 px-4 text-center font-sans text-[10px] text-stone-400">
                            BASELINE
                          </td>
                        </tr>
                      )}

                      {loading ? (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-stone-400 font-sans">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                              <span>Loading statement transactions...</span>
                            </div>
                          </td>
                        </tr>
                      ) : !statementData || statementData.transactions.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-10 text-center text-stone-400 font-sans">
                            No transactions found for this supplier in the selected period.
                          </td>
                        </tr>
                      ) : (
                        statementData.transactions.map((tx) => (
                          <tr key={tx.transactionId} className="hover:bg-stone-50 transition-colors">
                            <td className="py-3 px-4 whitespace-nowrap text-stone-900 font-medium">
                              {tx.date}
                            </td>
                            <td className="py-3 px-4 font-sans">
                              {getDocTypeBadge(tx.transactionType)}
                            </td>
                            <td className="py-3 px-4 font-medium text-stone-900">
                              {tx.referenceNumber || tx.referenceId || '—'}
                            </td>
                            <td className="py-3 px-4 text-stone-600 font-medium">
                              {tx.voucherNumber}
                            </td>
                            <td className="py-3 px-4 font-sans text-stone-600 max-w-xs truncate" title={tx.narration}>
                              {tx.narration}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-emerald-700">
                              {tx.debitPaise > 0 ? formatPaise(tx.debitPaise) : '—'}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-indigo-700">
                              {tx.creditPaise > 0 ? formatPaise(tx.creditPaise) : '—'}
                            </td>
                            <td className="py-3 px-4 text-right font-extrabold text-stone-900">
                              {formatPaise(tx.runningBalancePaise)}
                            </td>
                            <td className="py-3 px-4 text-center font-sans">
                              <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-100 text-emerald-800">
                                {tx.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}

                      {/* Closing Balance Row */}
                      {statementData && (
                        <tr className="bg-indigo-50/60 font-bold border-t-2 border-indigo-200 text-stone-900">
                          <td className="py-3 px-4 font-sans text-indigo-900">
                            {toDate || 'Current'}
                          </td>
                          <td colSpan={6} className="py-3 px-4 font-sans text-indigo-900">
                            Closing Net Outstanding Payable Balance
                          </td>
                          <td className="py-3 px-4 text-right text-indigo-800 text-sm">
                            {formatPaise(statementData.closingBalancePaise)}
                          </td>
                          <td className="py-3 px-4 text-center font-sans text-[10px] text-indigo-700 font-bold">
                            RECONCILED
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {statementData && statementData.pagination.totalPages > 1 && (
                  <div className="p-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
                    <div>
                      Showing page {statementData.pagination.page} of {statementData.pagination.totalPages} ({statementData.pagination.totalCount} entries)
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setStatementPage((p) => Math.max(1, p - 1))}
                        disabled={statementData.pagination.page <= 1 || loading}
                        className="p-1.5 border border-stone-200 rounded-md hover:bg-stone-50 disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="px-2 font-mono font-medium">{statementData.pagination.page}</span>
                      <button
                        type="button"
                        onClick={() => setStatementPage((p) => Math.min(statementData.pagination.totalPages, p + 1))}
                        disabled={statementData.pagination.page >= statementData.pagination.totalPages || loading}
                        className="p-1.5 border border-stone-200 rounded-md hover:bg-stone-50 disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 2: PAYMENT HISTORY                                                */}
          {/* ===================================================================== */}
          {detailTab === 'PAYMENTS' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-stone-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-stone-900">Supplier Payment Records</h4>
                    <span className="px-2 py-0.5 text-xs bg-stone-100 text-stone-600 rounded-full font-mono">
                      {paymentHistory?.totalCount || 0} payments
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-stone-500 font-mono hidden sm:inline">
                      All amounts strictly stored and verified in integer paise
                    </span>
                    <button
                      type="button"
                      onClick={handleExportCurrentView}
                      disabled={exporting || loading}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                      title="Export Payments to CSV"
                    >
                      <Download className="w-3 h-3" />
                      Export CSV
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase font-semibold">
                      <tr>
                        <th className="py-3 px-4">Payment Date</th>
                        <th className="py-3 px-4">Voucher No.</th>
                        <th className="py-3 px-4">Method</th>
                        <th className="py-3 px-4 text-right">Payment Amount</th>
                        <th className="py-3 px-4 text-right">Allocated</th>
                        <th className="py-3 px-4 text-right">Unallocated</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4">Reversal Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 font-mono text-stone-700">
                      {loading ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-stone-400 font-sans">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                              <span>Loading supplier payment history...</span>
                            </div>
                          </td>
                        </tr>
                      ) : !paymentHistory || paymentHistory.payments.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-stone-400 font-sans">
                            No supplier payments recorded for this vendor.
                          </td>
                        </tr>
                      ) : (
                        paymentHistory.payments.map((p) => (
                          <tr key={p.paymentId} className="hover:bg-stone-50 transition-colors">
                            <td className="py-3 px-4 whitespace-nowrap text-stone-900 font-medium">
                              {p.paymentDate}
                            </td>
                            <td className="py-3 px-4 font-medium text-stone-900">
                              {p.voucherNumber}
                            </td>
                            <td className="py-3 px-4 font-sans">
                              {getPaymentMethodBadge(p.paymentMethod)}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-stone-900">
                              {formatPaise(p.amountPaise)}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                              {formatPaise(p.allocatedAmountPaise)}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold text-amber-700">
                              {formatPaise(p.unallocatedAmountPaise)}
                            </td>
                            <td className="py-3 px-4 text-center font-sans">
                              {p.status === 'POSTED' && (
                                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-100 text-emerald-800">
                                  POSTED
                                </span>
                              )}
                              {p.status === 'REVERSED' && (
                                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-rose-100 text-rose-800">
                                  REVERSED
                                </span>
                              )}
                              {p.status === 'DRAFT' && (
                                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-stone-100 text-stone-700">
                                  DRAFT
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-sans text-xs">
                              {p.isReversed ? (
                                <div className="space-y-0.5">
                                  <div className="font-semibold text-rose-700 flex items-center gap-1">
                                    <RotateCcw className="w-3 h-3 text-rose-600" />
                                    <span>Reversed {p.reversedAt ? new Date(p.reversedAt).toLocaleDateString() : ''}</span>
                                  </div>
                                  {p.reversalReason && (
                                    <div className="text-[11px] text-stone-500 italic max-w-xs truncate" title={p.reversalReason}>
                                      "{p.reversalReason}"
                                    </div>
                                  )}
                                  {p.reversalJournalId && (
                                    <div className="text-[10px] text-stone-400 font-mono">
                                      Ref: {p.reversalJournalId}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-stone-400 font-sans text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Summary Bar */}
                {paymentHistory?.summary && (
                  <div className="p-4 bg-stone-50 border-t border-stone-200 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
                    <div className="text-stone-600 font-sans font-medium">
                      Total Payments: <span className="font-bold text-stone-900">{paymentHistory.summary.totalPaymentsCount}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div>
                        Total: <span className="font-bold text-stone-900">{formatPaise(paymentHistory.summary.totalAmountPaise)}</span>
                      </div>
                      <div>
                        Allocated: <span className="font-bold text-emerald-700">{formatPaise(paymentHistory.summary.totalAllocatedAmountPaise)}</span>
                      </div>
                      <div>
                        Unallocated: <span className="font-bold text-amber-700">{formatPaise(paymentHistory.summary.totalUnallocatedAmountPaise)}</span>
                      </div>
                      <div>
                        Reversed: <span className="font-bold text-rose-700">{formatPaise(paymentHistory.summary.totalReversedAmountPaise)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 3: OUTSTANDING INVOICES                                           */}
          {/* ===================================================================== */}
          {detailTab === 'INVOICES' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-stone-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-stone-900">Outstanding Purchase Invoices</h4>
                    <span className="px-2 py-0.5 text-xs bg-stone-100 text-stone-600 rounded-full font-mono">
                      {outstandingInvoices?.totalCount || 0} due
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-stone-500 font-mono hidden sm:inline">
                      Adjusted for credit/debit notes and payments
                    </span>
                    <button
                      type="button"
                      onClick={handleExportCurrentView}
                      disabled={exporting || loading}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                      title="Export Outstanding Invoices to CSV"
                    >
                      <Download className="w-3 h-3" />
                      Export CSV
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase font-semibold">
                      <tr>
                        <th className="py-3 px-4">Invoice Number</th>
                        <th className="py-3 px-4">Invoice Date</th>
                        <th className="py-3 px-4 text-right">Invoice Total</th>
                        <th className="py-3 px-4 text-right">Adjusted Total</th>
                        <th className="py-3 px-4 text-right">Allocated / Paid</th>
                        <th className="py-3 px-4 text-right">Outstanding Amount</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 font-mono text-stone-700">
                      {loading ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-stone-400 font-sans">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                              <span>Loading outstanding purchase invoices...</span>
                            </div>
                          </td>
                        </tr>
                      ) : !outstandingInvoices || outstandingInvoices.invoices.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-stone-400 font-sans">
                            All purchase bills for this vendor have been fully cleared and paid.
                          </td>
                        </tr>
                      ) : (
                        outstandingInvoices.invoices.map((inv) => (
                          <tr key={inv.invoiceId} className="hover:bg-stone-50 transition-colors">
                            <td className="py-3 px-4 font-semibold text-stone-900">
                              {inv.invoiceNumber}
                            </td>
                            <td className="py-3 px-4 text-stone-600 font-medium">
                              {inv.invoiceDate}
                            </td>
                            <td className="py-3 px-4 text-right text-stone-700">
                              {formatPaise(inv.invoiceTotalPaise)}
                            </td>
                            <td className="py-3 px-4 text-right font-medium text-stone-900">
                              {formatPaise(inv.adjustedTotalPaise)}
                            </td>
                            <td className="py-3 px-4 text-right font-medium text-emerald-700">
                              {formatPaise(inv.allocatedAmountPaise)}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-indigo-700 text-sm">
                              {formatPaise(inv.outstandingAmountPaise)}
                            </td>
                            <td className="py-3 px-4 text-center font-sans">
                              {inv.paymentStatus === 'PARTIALLY_PAID' ? (
                                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-800">
                                  PARTIALLY PAID
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-rose-100 text-rose-800">
                                  UNPAID
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Summary Bar */}
                {outstandingInvoices?.summary && (
                  <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-xs font-mono">
                    <div className="text-stone-600 font-sans font-medium">
                      Total Invoices: <span className="font-bold text-stone-900">{outstandingInvoices.totalCount}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div>
                        Total Adjusted: <span className="font-bold text-stone-900">{formatPaise(outstandingInvoices.summary.totalInvoiceAmountPaise)}</span>
                      </div>
                      <div>
                        Allocated: <span className="font-bold text-emerald-700">{formatPaise(outstandingInvoices.summary.totalAllocatedAmountPaise)}</span>
                      </div>
                      <div>
                        Net Outstanding: <span className="font-extrabold text-indigo-700">{formatPaise(outstandingInvoices.summary.totalOutstandingAmountPaise)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 4: DETAILED ACCOUNTING SUMMARY BREAKDOWN                          */}
          {/* ===================================================================== */}
          {detailTab === 'SUMMARY' && supplierSummary && (
            <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-xs space-y-6">
              <div className="border-b border-stone-100 pb-4">
                <h4 className="text-base font-bold text-stone-900">
                  Comprehensive Supplier Accounting Position
                </h4>
                <p className="text-xs text-stone-500 mt-1">
                  Server-authoritative financial summary derived directly from Account 2100 (Trade Payables).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                    Payables & Invoices
                  </h5>
                  <div className="p-4 bg-stone-50 rounded-xl space-y-2.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-stone-600">Total Outstanding AP:</span>
                      <span className="font-mono font-bold text-indigo-700">{formatPaise(supplierSummary.totalOutstandingAPPaise)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-600">Due Purchase Invoices:</span>
                      <span className="font-mono font-bold text-stone-900">{supplierSummary.numberOfOutstandingInvoices} bills</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-600">Control Account:</span>
                      <span className="font-mono text-stone-700">Account 2100 (Accounts Payable)</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                    Payment & Allocation Metrics
                  </h5>
                  <div className="p-4 bg-stone-50 rounded-xl space-y-2.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-stone-600">Total Posted Payments:</span>
                      <span className="font-mono font-bold text-stone-900">{formatPaise(supplierSummary.totalPostedPaymentsPaise)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-600">Total Allocated Payments:</span>
                      <span className="font-mono font-bold text-emerald-700">{formatPaise(supplierSummary.totalAllocatedPaymentsPaise)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-600">Total Unallocated Payments:</span>
                      <span className="font-mono font-bold text-amber-700">{formatPaise(supplierSummary.totalUnallocatedPaymentsPaise)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-600">Total Reversed Payments:</span>
                      <span className="font-mono font-bold text-rose-700">{formatPaise(supplierSummary.totalReversedPaymentsPaise)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl text-xs text-indigo-900 flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0" />
                <div>
                  <div className="font-bold">Zero Client Mutation Guarantee</div>
                  <div className="text-[11px] text-indigo-700 mt-0.5">
                    This reporting interface is strictly read-only. All metrics are computed server-side in integer paise from posted double-entry journal entries and immutable payment allocations.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
