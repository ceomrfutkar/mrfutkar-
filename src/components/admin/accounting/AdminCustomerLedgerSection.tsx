/**
 * MR FUTKAR — Admin Customer Ledger & AR Reporting Section (Phase 5.9 Part 3)
 * Server-authoritative, read-only Customer Accounts Receivable console for Account 1300.
 * Incorporates:
 * 1. Customer Accounting Summary (KPI cards derived from Account 1300 & customer receipts)
 * 2. Customer Statement (transaction-wise running balance from posted double-entry journals)
 * 3. Customer Receipt History (receipt number, voucher, method, total, allocated, unallocated, reversal info)
 * 4. Outstanding Sales Invoices (invoice number, date, total, adjusted, allocated, outstanding)
 *
 * Strict read-only guarantee: zero accounting mutations or client-side balance overrides.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
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
  TrendingUp,
  Receipt,
  Download,
  ChevronLeft,
  ChevronRight,
  Building2,
  ShieldCheck,
  CreditCard,
  RotateCcw,
} from 'lucide-react';
import { AdminClient } from '../../../services/adminClient';
import {
  CustomerLedgerSummaryResponse,
} from '../../../types/partyLedger';
import {
  CustomerStatementResponse,
  CustomerStatementTransaction,
  CustomerReceiptHistoryResponse,
  CustomerReceiptHistoryItem,
  CustomerOutstandingInvoicesResponse,
  OutstandingSalesInvoiceItem,
  CustomerAccountingSummaryResponse,
  CustomerStatementTransactionType,
} from '../../../types/customerReport';
import {
  CustomerReceiptPaymentMethod,
} from '../../../types/customerReceipt';

type DetailTab = 'STATEMENT' | 'RECEIPTS' | 'INVOICES' | 'SUMMARY';

export const AdminCustomerLedgerSection: React.FC = () => {
  // Navigation mode: 'SUMMARY' (All Customers List) | 'DETAIL' (Selected Customer Detail)
  const [viewMode, setViewMode] = useState<'SUMMARY' | 'DETAIL'>('SUMMARY');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('STATEMENT');

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [txTypeFilter, setTxTypeFilter] = useState<string>('ALL');

  // Global / Customer List States
  const [summaryList, setSummaryList] = useState<CustomerLedgerSummaryResponse | null>(null);
  const [globalAccountingSummary, setGlobalAccountingSummary] = useState<CustomerAccountingSummaryResponse | null>(null);

  // Detail View Data States
  const [customerSummary, setCustomerSummary] = useState<CustomerAccountingSummaryResponse | null>(null);
  const [statementData, setStatementData] = useState<CustomerStatementResponse | null>(null);
  const [receiptHistory, setReceiptHistory] = useState<CustomerReceiptHistoryResponse | null>(null);
  const [outstandingInvoices, setOutstandingInvoices] = useState<CustomerOutstandingInvoicesResponse | null>(null);

  // Pagination for Statement & Receipts
  const [statementPage, setStatementPage] = useState<number>(1);
  const [receiptPage, setReceiptPage] = useState<number>(1);
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

  // 1. Load All Customers & Global Accounting Summary
  const loadCustomersList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, globalSummaryRes] = await Promise.all([
        AdminClient.fetchCustomerLedgerSummary({
          search: searchQuery || undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        }),
        AdminClient.fetchCustomerAccountingSummary({
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        }),
      ]);

      if (summaryRes.success && summaryRes.data) {
        setSummaryList(summaryRes.data);
      } else {
        setError(summaryRes.message || 'Failed to load customer receivables summary.');
      }

      if (globalSummaryRes.success && globalSummaryRes.data) {
        setGlobalAccountingSummary(globalSummaryRes.data);
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching customer ledger summary.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, fromDate, toDate]);

  // 2. Load Selected Customer Detail Data
  const loadCustomerDetail = useCallback(async (customerId: string, currentDetailTab: DetailTab) => {
    setLoading(true);
    setError(null);
    try {
      // Always load the customer accounting summary for header cards
      const summaryPromise = AdminClient.fetchCustomerAccountingSummary({
        customerId,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });

      if (currentDetailTab === 'STATEMENT') {
        const [sumRes, stmtRes] = await Promise.all([
          summaryPromise,
          AdminClient.fetchCustomerStatement(customerId, {
            customerId,
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            transactionType: txTypeFilter !== 'ALL' ? (txTypeFilter as CustomerStatementTransactionType) : undefined,
            page: statementPage,
            pageSize,
          }),
        ]);

        if (sumRes.success && sumRes.data) setCustomerSummary(sumRes.data);
        if (stmtRes.success && stmtRes.data) {
          setStatementData(stmtRes.data);
        } else {
          setError(stmtRes.message || 'Failed to load customer statement.');
        }
      } else if (currentDetailTab === 'RECEIPTS') {
        const [sumRes, recRes] = await Promise.all([
          summaryPromise,
          AdminClient.fetchCustomerReceiptHistory({
            customerId,
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            page: receiptPage,
            pageSize,
          }),
        ]);

        if (sumRes.success && sumRes.data) setCustomerSummary(sumRes.data);
        if (recRes.success && recRes.data) {
          setReceiptHistory(recRes.data);
        } else {
          setError(recRes.message || 'Failed to load customer receipt history.');
        }
      } else if (currentDetailTab === 'INVOICES') {
        const [sumRes, invRes] = await Promise.all([
          summaryPromise,
          AdminClient.fetchCustomerOutstandingInvoices(customerId),
        ]);

        if (sumRes.success && sumRes.data) setCustomerSummary(sumRes.data);
        if (invRes.success && invRes.data) {
          setOutstandingInvoices(invRes.data);
        } else {
          setError(invRes.message || 'Failed to load outstanding sales invoices.');
        }
      } else if (currentDetailTab === 'SUMMARY') {
        const sumRes = await summaryPromise;
        if (sumRes.success && sumRes.data) {
          setCustomerSummary(sumRes.data);
        } else {
          setError(sumRes.message || 'Failed to load customer accounting summary.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching customer accounting records.');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, txTypeFilter, statementPage, receiptPage]);

  // Initial & Dependency Trigger
  useEffect(() => {
    if (viewMode === 'SUMMARY') {
      loadCustomersList();
    } else if (viewMode === 'DETAIL' && selectedCustomerId) {
      loadCustomerDetail(selectedCustomerId, detailTab);
    }
  }, [viewMode, selectedCustomerId, detailTab, loadCustomersList, loadCustomerDetail]);

  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setStatementPage(1);
    setReceiptPage(1);
    setDetailTab('STATEMENT');
    setViewMode('DETAIL');
  };

  const handleBackToSummary = () => {
    setSelectedCustomerId(null);
    setStatementData(null);
    setReceiptHistory(null);
    setOutstandingInvoices(null);
    setCustomerSummary(null);
    setViewMode('SUMMARY');
  };

  // Export current view to CSV
  const handleExportCurrentView = async () => {
    if (viewMode === 'SUMMARY') {
      setExporting(true);
      try {
        const res = await AdminClient.exportCustomerAccountingSummaryCsv({
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        });
        if (res.success && res.blob) {
          triggerDownload(res.blob, res.filename || 'customer_accounting_summary.csv');
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

    if (!selectedCustomerId) return;

    setExporting(true);
    try {
      if (detailTab === 'STATEMENT') {
        const res = await AdminClient.exportCustomerStatementCsv(selectedCustomerId, {
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          transactionType: txTypeFilter !== 'ALL' ? (txTypeFilter as CustomerStatementTransactionType) : undefined,
        });
        if (res.success && res.blob) {
          triggerDownload(res.blob, res.filename || `customer_statement_${selectedCustomerId}.csv`);
        } else {
          setError(res.error || 'Failed to export customer statement CSV.');
        }
      } else if (detailTab === 'RECEIPTS') {
        const res = await AdminClient.exportCustomerReceiptHistoryCsv({
          customerId: selectedCustomerId,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        });
        if (res.success && res.blob) {
          triggerDownload(res.blob, res.filename || `customer_receipts_${selectedCustomerId}.csv`);
        } else {
          setError(res.error || 'Failed to export receipts CSV.');
        }
      } else if (detailTab === 'INVOICES') {
        const res = await AdminClient.exportCustomerOutstandingInvoicesCsv(selectedCustomerId);
        if (res.success && res.blob) {
          triggerDownload(res.blob, res.filename || `outstanding_sales_invoices_${selectedCustomerId}.csv`);
        } else {
          setError(res.error || 'Failed to export sales invoices CSV.');
        }
      } else if (detailTab === 'SUMMARY') {
        const res = await AdminClient.exportCustomerAccountingSummaryCsv({
          customerId: selectedCustomerId,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        });
        if (res.success && res.blob) {
          triggerDownload(res.blob, res.filename || `customer_summary_${selectedCustomerId}.csv`);
        } else {
          setError(res.error || 'Failed to export customer summary CSV.');
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
      case 'SALES_INVOICE':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 text-blue-800 border border-blue-200">Tax Invoice</span>;
      case 'SALES_CREDIT_NOTE':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-100 text-amber-800 border border-amber-200">Credit Note</span>;
      case 'SALES_DEBIT_NOTE':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-100 text-purple-800 border border-purple-200">Debit Note</span>;
      case 'CUSTOMER_RECEIPT':
        return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-100 text-emerald-800 border border-emerald-200">Customer Receipt</span>;
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
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-stone-900">Customer Accounts Receivable & Ledger</span>
              <span className="px-2 py-0.5 text-[10px] font-bold tracking-wide rounded bg-emerald-100 text-emerald-800 uppercase">
                Account 1300
              </span>
            </div>
            <p className="text-xs text-stone-500">
              {viewMode === 'SUMMARY'
                ? 'Server-authoritative kirana retailer balances, receipt history, outstanding invoices, and double-entry subledger'
                : `Accounting record and double-entry statement for ${customerSummary?.customerName || statementData?.customerName || selectedCustomerId}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {viewMode === 'DETAIL' && (
            <button
              type="button"
              onClick={handleBackToSummary}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to All Customers
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCurrentView}
            disabled={exporting || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            title="Export server-authoritative CSV report"
          >
            <Download className={`w-3.5 h-3.5 ${exporting ? 'animate-bounce' : ''}`} />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>

          <button
            type="button"
            onClick={() => {
              if (viewMode === 'SUMMARY') loadCustomersList();
              else if (selectedCustomerId) loadCustomerDetail(selectedCustomerId, detailTab);
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
            className="text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. CUSTOMERS LIST VIEW (SUMMARY MODE)                                     */}
      {/* ========================================================================= */}
      {viewMode === 'SUMMARY' && (
        <div className="space-y-6">
          {/* Global Accounting Summary KPI Cards */}
          {globalAccountingSummary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
                <div className="text-xs font-medium text-stone-500 mb-1">Total Outstanding AR</div>
                <div className="text-xl font-bold text-emerald-700 font-mono tabular-nums">
                  {formatPaise(globalAccountingSummary.totalOutstandingARPaise)}
                </div>
                <div className="mt-2 text-[11px] text-stone-500 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-emerald-600" />
                  Net Trade Receivables (Account 1300)
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
                <div className="text-xs font-medium text-stone-500 mb-1">Posted Customer Receipts</div>
                <div className="text-xl font-bold text-stone-900 font-mono tabular-nums">
                  {formatPaise(globalAccountingSummary.totalPostedReceiptsPaise)}
                </div>
                <div className="mt-2 text-[11px] text-stone-500">
                  Allocated: <span className="font-semibold text-emerald-700">{formatPaise(globalAccountingSummary.totalAllocatedReceiptsPaise)}</span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
                <div className="text-xs font-medium text-stone-500 mb-1">Unallocated Advances</div>
                <div className="text-xl font-bold text-amber-700 font-mono tabular-nums">
                  {formatPaise(globalAccountingSummary.totalUnallocatedReceiptsPaise)}
                </div>
                <div className="mt-2 text-[11px] text-stone-500">
                  Reversed: <span className="font-semibold text-rose-600">{formatPaise(globalAccountingSummary.totalReversedReceiptsPaise)}</span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
                <div className="text-xs font-medium text-stone-500 mb-1">Due Sales Invoices</div>
                <div className="text-xl font-bold text-stone-900 font-mono tabular-nums">
                  {globalAccountingSummary.dueBillsCount || globalAccountingSummary.numberOfOutstandingInvoices}
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
                placeholder="Search retailer by shop name, owner, phone, or customer ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
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

          {/* Customer Accounts Table */}
          <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-stone-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-stone-900">Kirana Retailer Accounts</h4>
                <span className="px-2 py-0.5 text-xs bg-stone-100 text-stone-600 rounded-full font-mono">
                  {summaryList?.customers.length || 0}
                </span>
              </div>
              <div className="text-xs text-stone-500">
                Sorted by highest outstanding balance
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Kirana Retailer</th>
                    <th className="py-3 px-4">Contact & Location</th>
                    <th className="py-3 px-4 text-right">Total Invoiced (DR)</th>
                    <th className="py-3 px-4 text-right">Total Credited (CR)</th>
                    <th className="py-3 px-4 text-right">Outstanding Receivable</th>
                    <th className="py-3 px-4 text-center">Txns</th>
                    <th className="py-3 px-4 text-right">Last Activity</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-mono tabular-nums text-stone-700">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-stone-400 font-sans">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
                          <span>Calculating customer receivable ledgers...</span>
                        </div>
                      </td>
                    </tr>
                  ) : !summaryList || summaryList.customers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-stone-400 font-sans">
                        No kirana customers found matching the specified filters.
                      </td>
                    </tr>
                  ) : (
                    summaryList.customers.map((cust) => (
                      <tr key={cust.customerId} className="hover:bg-stone-50 transition-colors">
                        <td className="py-3 px-4 font-sans">
                          <div className="font-semibold text-stone-900">{cust.shopName}</div>
                          <div className="text-[11px] text-stone-500 font-mono">{cust.customerId}</div>
                        </td>
                        <td className="py-3 px-4 font-sans">
                          <div className="text-stone-900">{cust.ownerName}</div>
                          <div className="text-[11px] text-stone-500 font-mono">
                            {cust.mobile || '—'} • {cust.city}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-stone-900">
                          {formatCurrency(cust.totalDebit)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-stone-600">
                          {formatCurrency(cust.totalCredit)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold">
                          <span className={cust.outstandingBalance > 0 ? 'text-emerald-700' : 'text-stone-500'}>
                            {formatCurrency(cust.outstandingBalance)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-stone-600">
                          {cust.transactionCount}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-[11px] text-stone-500">
                          {cust.lastTransactionDate || '—'}
                        </td>
                        <td className="py-3 px-4 text-center font-sans">
                          <button
                            type="button"
                            onClick={() => handleSelectCustomer(cust.customerId)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                          >
                            View Ledger
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
      {/* 2. SELECTED CUSTOMER DETAIL VIEW (4 READ-ONLY TABS)                       */}
      {/* ========================================================================= */}
      {viewMode === 'DETAIL' && selectedCustomerId && (
        <div className="space-y-6">
          {/* Customer Header Snapshot */}
          <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-stone-100">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-stone-900">
                    {customerSummary?.customerName || statementData?.customerName || selectedCustomerId}
                  </h3>
                  <span className="px-2 py-0.5 text-xs font-mono font-medium rounded bg-stone-100 text-stone-600">
                    {selectedCustomerId}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 mt-1.5 text-xs text-stone-600">
                  {statementData?.customerSnapshot?.ownerName && (
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-stone-400" />
                      {statementData.customerSnapshot.ownerName}
                    </span>
                  )}
                  {statementData?.customerSnapshot?.mobile && (
                    <span className="flex items-center gap-1 font-mono">
                      <Phone className="w-3.5 h-3.5 text-stone-400" />
                      {statementData.customerSnapshot.mobile}
                    </span>
                  )}
                  {statementData?.customerSnapshot?.city && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-stone-400" />
                      {statementData.customerSnapshot.city}, {statementData.customerSnapshot.state}
                    </span>
                  )}
                  {statementData?.customerSnapshot?.gstin && (
                    <span className="font-mono text-stone-500">
                      GSTIN: <span className="font-semibold text-stone-700">{statementData.customerSnapshot.gstin}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Outstanding AR Highlight */}
              <div className="text-right flex flex-col items-end">
                <span className="text-xs text-stone-500 font-medium">Current Outstanding AR</span>
                <span className="text-2xl font-extrabold text-emerald-700 font-mono tabular-nums">
                  {customerSummary
                    ? formatPaise(customerSummary.totalOutstandingARPaise)
                    : statementData
                    ? formatPaise(statementData.currentOutstandingARPaise)
                    : '₹0.00'}
                </span>
                <span className="text-[10px] text-stone-400 mt-0.5">Account 1300 (Asset Normal Balance: DEBIT)</span>
              </div>
            </div>

            {/* Key Customer Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
              <div className="p-3 bg-stone-50 rounded-lg">
                <div className="text-[11px] font-medium text-stone-500">Posted Receipts</div>
                <div className="text-sm font-bold text-stone-900 mt-0.5 font-mono tabular-nums">
                  {customerSummary ? formatPaise(customerSummary.totalPostedReceiptsPaise) : '—'}
                </div>
              </div>

              <div className="p-3 bg-emerald-50 rounded-lg">
                <div className="text-[11px] font-medium text-emerald-700">Allocated</div>
                <div className="text-sm font-bold text-emerald-800 mt-0.5 font-mono tabular-nums">
                  {customerSummary ? formatPaise(customerSummary.totalAllocatedReceiptsPaise) : '—'}
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-lg">
                <div className="text-[11px] font-medium text-amber-700">Unallocated</div>
                <div className="text-sm font-bold text-amber-800 mt-0.5 font-mono tabular-nums">
                  {customerSummary ? formatPaise(customerSummary.totalUnallocatedReceiptsPaise) : '—'}
                </div>
              </div>

              <div className="p-3 bg-rose-50 rounded-lg">
                <div className="text-[11px] font-medium text-rose-700">Reversed Receipts</div>
                <div className="text-sm font-bold text-rose-800 mt-0.5 font-mono tabular-nums">
                  {customerSummary ? formatPaise(customerSummary.totalReversedReceiptsPaise) : '—'}
                </div>
              </div>

              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="text-[11px] font-medium text-blue-700">Due Invoices</div>
                <div className="text-sm font-bold text-blue-800 mt-0.5 font-mono tabular-nums">
                  {(customerSummary?.dueBillsCount ?? customerSummary?.numberOfOutstandingInvoices) ?? 0} bills
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
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Customer Statement
            </button>

            <button
              type="button"
              onClick={() => setDetailTab('RECEIPTS')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                detailTab === 'RECEIPTS'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              Receipt History
            </button>

            <button
              type="button"
              onClick={() => setDetailTab('INVOICES')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                detailTab === 'INVOICES'
                  ? 'bg-emerald-600 text-white shadow-xs'
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
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Accounting Summary
            </button>
          </div>

          {/* ===================================================================== */}
          {/* TAB 1: CUSTOMER STATEMENT                                             */}
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
                    <option value="SALES_INVOICE">Tax Invoices</option>
                    <option value="CUSTOMER_RECEIPT">Customer Receipts</option>
                    <option value="SALES_DEBIT_NOTE">Debit Notes</option>
                    <option value="SALES_CREDIT_NOTE">Credit Notes</option>
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
                      Account 1300 (Normal Balance: DEBIT)
                    </span>
                    <button
                      type="button"
                      onClick={handleExportCurrentView}
                      disabled={exporting || loading}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors cursor-pointer disabled:opacity-50"
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
                    <tbody className="divide-y divide-stone-100 font-mono tabular-nums text-stone-700">
                      {/* Opening Balance Row */}
                      {statementData && (
                        <tr className="bg-stone-50/80 font-semibold text-stone-900">
                          <td className="py-2.5 px-4 font-sans text-stone-500">
                            {fromDate || 'Beginning'}
                          </td>
                          <td colSpan={6} className="py-2.5 px-4 font-sans text-stone-600">
                            Opening Receivable Balance (Prior to selected period)
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
                              <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
                              <span>Loading customer statement transactions...</span>
                            </div>
                          </td>
                        </tr>
                      ) : !statementData || statementData.transactions.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-10 text-center text-stone-400 font-sans">
                            No transactions found for this customer in the selected period.
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
                            <td className="py-3 px-4 text-right font-bold text-amber-700">
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
                        <tr className="bg-emerald-50/60 font-bold border-t-2 border-emerald-200 text-stone-900">
                          <td className="py-3 px-4 font-sans text-emerald-900">
                            {toDate || 'Current'}
                          </td>
                          <td colSpan={6} className="py-3 px-4 font-sans text-emerald-900">
                            Closing Net Outstanding Receivable Balance
                          </td>
                          <td className="py-3 px-4 text-right text-emerald-800 text-sm">
                            {formatPaise(statementData.closingBalancePaise)}
                          </td>
                          <td className="py-3 px-4 text-center font-sans text-[10px] text-emerald-700 font-bold">
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
          {/* TAB 2: RECEIPT HISTORY                                                */}
          {/* ===================================================================== */}
          {detailTab === 'RECEIPTS' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-stone-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-stone-900">Customer Receipt Records</h4>
                    <span className="px-2 py-0.5 text-xs bg-stone-100 text-stone-600 rounded-full font-mono">
                      {receiptHistory?.totalCount || 0} receipts
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-stone-500 font-mono hidden sm:inline">
                      All amounts stored and verified in integer paise
                    </span>
                    <button
                      type="button"
                      onClick={handleExportCurrentView}
                      disabled={exporting || loading}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                      title="Export Receipts to CSV"
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
                        <th className="py-3 px-4">Receipt Date</th>
                        <th className="py-3 px-4">Receipt No.</th>
                        <th className="py-3 px-4">Voucher No.</th>
                        <th className="py-3 px-4">Method</th>
                        <th className="py-3 px-4 text-right">Receipt Amount</th>
                        <th className="py-3 px-4 text-right">Allocated</th>
                        <th className="py-3 px-4 text-right">Unallocated</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4">Reversal Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 font-mono tabular-nums text-stone-700">
                      {loading ? (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-stone-400 font-sans">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
                              <span>Loading customer receipt history...</span>
                            </div>
                          </td>
                        </tr>
                      ) : !receiptHistory || receiptHistory.receipts.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-10 text-center text-stone-400 font-sans">
                            No customer receipts recorded for this retailer.
                          </td>
                        </tr>
                      ) : (
                        receiptHistory.receipts.map((r) => (
                          <tr key={r.receiptId} className="hover:bg-stone-50 transition-colors">
                            <td className="py-3 px-4 whitespace-nowrap text-stone-900 font-medium">
                              {r.receiptDate || r.paymentDate}
                            </td>
                            <td className="py-3 px-4 font-medium text-stone-900">
                              {r.receiptNumber}
                            </td>
                            <td className="py-3 px-4 text-stone-600 font-medium">
                              {r.voucherNumber || '—'}
                            </td>
                            <td className="py-3 px-4 font-sans">
                              {getPaymentMethodBadge(r.paymentMethod)}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-stone-900">
                              {formatPaise(r.amountPaise)}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                              {formatPaise(r.allocatedAmountPaise)}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold text-amber-700">
                              {formatPaise(r.unallocatedAmountPaise)}
                            </td>
                            <td className="py-3 px-4 text-center font-sans">
                              {r.status === 'POSTED' && (
                                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-100 text-emerald-800">
                                  POSTED
                                </span>
                              )}
                              {r.status === 'REVERSED' && (
                                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-rose-100 text-rose-800">
                                  REVERSED
                                </span>
                              )}
                              {r.status === 'DRAFT' && (
                                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-stone-100 text-stone-700">
                                  DRAFT
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-sans text-xs">
                              {r.isReversed || r.reversalStatus === 'REVERSED' ? (
                                <div className="space-y-0.5">
                                  <div className="font-semibold text-rose-700 flex items-center gap-1">
                                    <RotateCcw className="w-3 h-3 text-rose-600" />
                                    <span>Reversed {r.reversedAt ? new Date(r.reversedAt).toLocaleDateString() : ''}</span>
                                  </div>
                                  {r.reversalReason && (
                                    <div className="text-[11px] text-stone-500 italic max-w-xs truncate" title={r.reversalReason}>
                                      "{r.reversalReason}"
                                    </div>
                                  )}
                                  {r.reversalJournalId && (
                                    <div className="text-[10px] text-stone-400 font-mono">
                                      Ref: {r.reversalJournalId}
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
                {receiptHistory?.summary && (
                  <div className="p-4 bg-stone-50 border-t border-stone-200 flex flex-wrap items-center justify-between gap-4 text-xs font-mono tabular-nums">
                    <div className="text-stone-600 font-sans font-medium">
                      Total Receipts: <span className="font-bold text-stone-900">{receiptHistory.summary.totalReceiptsCount}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div>
                        Total: <span className="font-bold text-stone-900">{formatPaise(receiptHistory.summary.totalAmountPaise)}</span>
                      </div>
                      <div>
                        Allocated: <span className="font-bold text-emerald-700">{formatPaise(receiptHistory.summary.totalAllocatedAmountPaise)}</span>
                      </div>
                      <div>
                        Unallocated: <span className="font-bold text-amber-700">{formatPaise(receiptHistory.summary.totalUnallocatedAmountPaise)}</span>
                      </div>
                      <div>
                        Reversed: <span className="font-bold text-rose-700">{formatPaise(receiptHistory.summary.totalReversedAmountPaise)}</span>
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
                    <h4 className="text-sm font-bold text-stone-900">Outstanding Sales Invoices</h4>
                    <span className="px-2 py-0.5 text-xs bg-stone-100 text-stone-600 rounded-full font-mono">
                      {outstandingInvoices?.totalCount || 0} due
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-stone-500 font-mono hidden sm:inline">
                      Adjusted for credit/debit notes and receipt allocations
                    </span>
                    <button
                      type="button"
                      onClick={handleExportCurrentView}
                      disabled={exporting || loading}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                      title="Export Outstanding Sales Invoices to CSV"
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
                        <th className="py-3 px-4 text-right">Original Total</th>
                        <th className="py-3 px-4 text-right">Adjusted Total</th>
                        <th className="py-3 px-4 text-right">Allocated / Paid</th>
                        <th className="py-3 px-4 text-right">Outstanding Amount</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 font-mono tabular-nums text-stone-700">
                      {loading ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-stone-400 font-sans">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
                              <span>Loading outstanding sales invoices...</span>
                            </div>
                          </td>
                        </tr>
                      ) : !outstandingInvoices || outstandingInvoices.invoices.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-stone-400 font-sans">
                            All sales invoices for this kirana retailer have been fully cleared and settled.
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
                            <td className="py-3 px-4 text-right font-bold text-emerald-700 text-sm">
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
                  <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-xs font-mono tabular-nums">
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
                        Net Outstanding AR: <span className="font-extrabold text-emerald-700">{formatPaise(outstandingInvoices.summary.totalOutstandingAmountPaise)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* TAB 4: COMPREHENSIVE ACCOUNTING SUMMARY BREAKDOWN                     */}
          {/* ===================================================================== */}
          {detailTab === 'SUMMARY' && customerSummary && (
            <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-xs space-y-6">
              <div className="border-b border-stone-100 pb-4">
                <h4 className="text-base font-bold text-stone-900">
                  Comprehensive Customer Accounts Receivable Position
                </h4>
                <p className="text-xs text-stone-500 mt-1">
                  Server-authoritative financial summary derived directly from Account 1300 (Accounts Receivable).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                    Receivables & Sales Invoices
                  </h5>
                  <div className="p-4 bg-stone-50 rounded-xl space-y-2.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-stone-600">Total Outstanding AR:</span>
                      <span className="font-mono tabular-nums font-bold text-emerald-700">{formatPaise(customerSummary.totalOutstandingARPaise)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-600">Due Sales Invoices:</span>
                      <span className="font-mono tabular-nums font-bold text-stone-900">
                        {customerSummary.dueBillsCount || customerSummary.numberOfOutstandingInvoices} bills
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-600">Control Account:</span>
                      <span className="font-mono text-stone-700">Account 1300 (Accounts Receivable)</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                    Receipt & Allocation Metrics
                  </h5>
                  <div className="p-4 bg-stone-50 rounded-xl space-y-2.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-stone-600">Total Posted Receipts:</span>
                      <span className="font-mono tabular-nums font-bold text-stone-900">{formatPaise(customerSummary.totalPostedReceiptsPaise)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-600">Total Allocated Receipts:</span>
                      <span className="font-mono tabular-nums font-bold text-emerald-700">{formatPaise(customerSummary.totalAllocatedReceiptsPaise)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-600">Total Unallocated Receipts:</span>
                      <span className="font-mono tabular-nums font-bold text-amber-700">{formatPaise(customerSummary.totalUnallocatedReceiptsPaise)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-600">Total Reversed Receipts:</span>
                      <span className="font-mono tabular-nums font-bold text-rose-700">{formatPaise(customerSummary.totalReversedReceiptsPaise)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl text-xs text-emerald-900 flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-bold">Zero Client Mutation Guarantee</div>
                  <div className="text-[11px] text-emerald-700 mt-0.5">
                    This reporting interface is strictly read-only. All metrics are computed server-side in integer paise from posted double-entry journal entries and immutable customer receipt allocations.
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
