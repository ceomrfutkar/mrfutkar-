import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Calendar,
  RefreshCw,
  FileText,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronLeft,
  ChevronRight,
  Store,
  ShieldCheck,
} from 'lucide-react';
import { InvoiceClient } from '../services/invoiceClient';
import { RetailerSelfLedgerResponse, RetailerLedgerRow } from '../types/partyLedger';
import { auth } from '../config/firebase';

interface RetailerLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  shopName?: string;
  retailerId?: string;
}

export const RetailerLedgerModal: React.FC<RetailerLedgerModalProps> = ({
  isOpen,
  onClose,
  shopName,
  retailerId,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ledgerData, setLedgerData] = useState<RetailerSelfLedgerResponse | null>(null);

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const loadLedger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Get Firebase Auth user ID token
      let token: string | undefined;
      const currentUser = auth.currentUser;
      if (currentUser) {
        token = await currentUser.getIdToken();
      }

      const res = await InvoiceClient.getMyLedger(
        {
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          page,
          pageSize,
        },
        token
      );
      setLedgerData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load account statement.');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, page, pageSize, retailerId]);

  useEffect(() => {
    if (isOpen) {
      loadLedger();
    }
  }, [isOpen, loadLedger]);

  if (!isOpen) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const getDocBadge = (type: string) => {
    switch (type) {
      case 'SALES_INVOICE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <ArrowUpRight className="w-3 h-3 text-blue-600" />
            Sales Invoice
          </span>
        );
      case 'SALES_CREDIT_NOTE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <ArrowDownLeft className="w-3 h-3 text-amber-600" />
            Credit Note
          </span>
        );
      case 'SALES_DEBIT_NOTE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <ArrowUpRight className="w-3 h-3 text-purple-600" />
            Debit Note
          </span>
        );
      case 'CUSTOMER_RECEIPT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
            Payment Received
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-stone-100 text-stone-700">
            {type}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-stone-50 rounded-3xl border border-stone-200 shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="bg-stone-900 text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-stone-950 flex items-center justify-center font-black">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base md:text-lg font-black tracking-wide uppercase">
                  Account Statement
                </h2>
                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-extrabold px-2 py-0.5 rounded border border-emerald-400/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Verified
                </span>
              </div>
              <p className="text-xs text-stone-400">
                {ledgerData?.customer.shopName || shopName || 'Kirana Store'}
                {ledgerData?.customerId ? ` (${ledgerData.customerId})` : retailerId ? ` (${retailerId})` : ''} • Customer Subledger Statement
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Date Filter Bar */}
        <div className="bg-white border-b border-stone-200 p-4 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-stone-600 font-bold">
                <Calendar className="w-4 h-4 text-stone-400" />
                <span>Period:</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={fromDate}
                  onChange={e => {
                    setFromDate(e.target.value);
                    setPage(1);
                  }}
                  className="text-xs font-semibold bg-stone-50 border border-stone-300 rounded-xl px-2.5 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-stone-900"
                />
                <span className="text-xs text-stone-400 font-bold">to</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={e => {
                    setToDate(e.target.value);
                    setPage(1);
                  }}
                  className="text-xs font-semibold bg-stone-50 border border-stone-300 rounded-xl px-2.5 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-stone-900"
                />
              </div>
              {(fromDate || toDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setFromDate('');
                    setToDate('');
                    setPage(1);
                  }}
                  className="text-xs text-stone-500 hover:text-stone-900 underline font-semibold px-1"
                >
                  Reset
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => loadLedger()}
              disabled={loading}
              className="text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-xl px-3 py-1.5 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Modal Body / Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-2xl font-medium">
              {error}
            </div>
          )}

          {/* Statement KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-stone-400 block tracking-wider">
                Opening Balance
              </span>
              <p className="text-sm md:text-base font-black text-stone-800 mt-1">
                {ledgerData ? formatCurrency(ledgerData.openingBalance) : '₹0.00'}
              </p>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-stone-400 block tracking-wider">
                Total Debit (+)
              </span>
              <p className="text-sm md:text-base font-black text-blue-700 mt-1">
                {ledgerData ? formatCurrency(ledgerData.totalDebit) : '₹0.00'}
              </p>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-stone-400 block tracking-wider">
                Total Credit (-)
              </span>
              <p className="text-sm md:text-base font-black text-emerald-700 mt-1">
                {ledgerData ? formatCurrency(ledgerData.totalCredit) : '₹0.00'}
              </p>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-stone-400 block tracking-wider">
                Current Outstanding
              </span>
              <p className="text-sm md:text-base font-black text-amber-700 mt-1">
                {ledgerData ? formatCurrency(ledgerData.closingBalance) : '₹0.00'}
              </p>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-xs col-span-2 md:col-span-1">
              <span className="text-[10px] uppercase font-bold text-stone-400 block tracking-wider">
                Total Entries
              </span>
              <p className="text-sm md:text-base font-black text-stone-900 mt-1">
                {ledgerData ? ledgerData.transactionCount : 0}
              </p>
            </div>
          </div>

          {/* Statement Transaction Table */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-stone-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-stone-500" />
                <h3 className="text-xs font-black uppercase text-stone-800 tracking-wider">
                  Transaction Activity
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-stone-400">
                Sorted Chronologically
              </span>
            </div>

            {loading && !ledgerData ? (
              <div className="p-8 text-center text-xs text-stone-400 font-medium">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-stone-400" />
                Loading ledger transactions...
              </div>
            ) : !ledgerData || ledgerData.transactions.length === 0 ? (
              <div className="p-8 text-center text-xs text-stone-500 font-medium space-y-1">
                <p>No accounting transactions found for the selected period.</p>
                <p className="text-[11px] text-stone-400">
                  Transactions appear once sales invoices or credit/debit notes are issued.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-3 px-3.5">Date</th>
                      <th className="py-3 px-3.5">Particulars / Document</th>
                      <th className="py-3 px-3.5 text-right">Debit (₹)</th>
                      <th className="py-3 px-3.5 text-right">Credit (₹)</th>
                      <th className="py-3 px-3.5 text-right">Balance (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {ledgerData.transactions.map((tx: RetailerLedgerRow, idx: number) => (
                      <tr key={idx} className="hover:bg-stone-50/70 transition-colors">
                        <td className="py-3 px-3.5 font-semibold text-stone-700 whitespace-nowrap">
                          {tx.date}
                        </td>
                        <td className="py-3 px-3.5">
                          <div className="flex items-center gap-2">
                            {getDocBadge(tx.documentType)}
                            <span className="font-mono font-bold text-stone-900 text-[11px]">
                              {tx.documentNumber}
                            </span>
                          </div>
                          {tx.description && (
                            <p className="text-[11px] text-stone-400 mt-0.5 truncate max-w-xs">
                              {tx.description}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-right font-semibold text-stone-900 whitespace-nowrap">
                          {tx.debit > 0 ? formatCurrency(tx.debit) : '—'}
                        </td>
                        <td className="py-3 px-3.5 text-right font-semibold text-emerald-700 whitespace-nowrap">
                          {tx.credit > 0 ? formatCurrency(tx.credit) : '—'}
                        </td>
                        <td className="py-3 px-3.5 text-right font-black text-stone-900 whitespace-nowrap">
                          {formatCurrency(tx.runningBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {ledgerData && ledgerData.pagination.totalPages > 1 && (
              <div className="p-3 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-xs">
                <span className="text-stone-500 font-medium text-[11px]">
                  Page {ledgerData.pagination.page} of {ledgerData.pagination.totalPages} ({ledgerData.pagination.totalCount} total)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={ledgerData.pagination.page <= 1}
                    className="p-1.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-stone-600" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.min(ledgerData.pagination.totalPages, p + 1))}
                    disabled={ledgerData.pagination.page >= ledgerData.pagination.totalPages}
                    className="p-1.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-100 disabled:opacity-40 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-stone-600" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-stone-100 border-t border-stone-200 p-4 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-stone-500 font-medium">
            Read-only statement derived from official accounts receivable records.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
