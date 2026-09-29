/**
 * MR FUTKAR — General Ledger Section Component
 * Phase 5.4 Part 3: Authoritative General Ledger & Running Balances
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  Calendar,
  BookOpen,
  ArrowDownRight,
  ArrowUpRight,
  Scale,
  FileText,
  Clock,
  ChevronDown,
} from 'lucide-react';
import { AdminClient } from '../../../services/adminClient';
import {
  Account,
  GeneralLedgerResponse,
  GeneralLedgerEntry,
  VoucherType,
} from '../../../types/accounting';

interface AdminGeneralLedgerSectionProps {
  accounts: Account[];
  initialAccountId?: string;
}

export const AdminGeneralLedgerSection: React.FC<AdminGeneralLedgerSectionProps> = ({
  accounts,
  initialAccountId,
}) => {
  // Account selection
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    initialAccountId || (accounts.length > 0 ? accounts[0].accountId : '')
  );

  // If initialAccountId changes or accounts load
  useEffect(() => {
    if (!selectedAccountId && accounts.length > 0) {
      setSelectedAccountId(accounts[0].accountId);
    }
  }, [accounts, selectedAccountId]);

  // Filters
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [voucherType, setVoucherType] = useState<string>('ALL');
  const [tableSearch, setTableSearch] = useState<string>('');

  // Ledger state
  const [ledgerData, setLedgerData] = useState<GeneralLedgerResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch Ledger
  const fetchLedger = useCallback(async () => {
    if (!selectedAccountId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await AdminClient.fetchGeneralLedger({
        accountId: selectedAccountId,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        voucherType: voucherType !== 'ALL' ? voucherType : undefined,
      });

      if (res.success && res.data) {
        setLedgerData(res.data);
      } else {
        setError(res.message || 'Failed to load General Ledger.');
        setLedgerData(null);
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching General Ledger.');
      setLedgerData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, fromDate, toDate, voucherType]);

  // Auto-fetch when selected account changes
  useEffect(() => {
    if (selectedAccountId) {
      fetchLedger();
    }
  }, [selectedAccountId, fetchLedger]);

  // Quick date presets
  const handleSetPreset = (preset: 'THIS_MONTH' | 'ALL_TIME' | 'TODAY') => {
    const today = new Date().toISOString().slice(0, 10);
    if (preset === 'TODAY') {
      setFromDate(today);
      setToDate(today);
    } else if (preset === 'THIS_MONTH') {
      const year = today.slice(0, 4);
      const month = today.slice(5, 7);
      setFromDate(`${year}-${month}-01`);
      setToDate(today);
    } else if (preset === 'ALL_TIME') {
      setFromDate('');
      setToDate('');
    }
  };

  // Selected account details
  const currentAccount = useMemo(() => {
    return accounts.find(a => a.accountId === selectedAccountId) || ledgerData?.account;
  }, [accounts, selectedAccountId, ledgerData]);

  // Client-side search within ledger entries
  const filteredEntries = useMemo(() => {
    if (!ledgerData?.entries) return [];
    if (!tableSearch.trim()) return ledgerData.entries;
    const q = tableSearch.toLowerCase().trim();
    return ledgerData.entries.filter(
      e =>
        e.journalNumber.toLowerCase().includes(q) ||
        e.narration.toLowerCase().includes(q) ||
        (e.referenceId && e.referenceId.toLowerCase().includes(q)) ||
        (e.accountNameSnapshot && e.accountNameSnapshot.toLowerCase().includes(q))
    );
  }, [ledgerData, tableSearch]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Filters & Account Selector Bar */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 items-end">
          {/* Account Selector */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
              Select General Ledger Account <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <select
                value={selectedAccountId}
                onChange={e => setSelectedAccountId(e.target.value)}
                className="w-full pl-3 pr-9 py-2.5 bg-stone-50 border border-stone-300 rounded-lg text-xs font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              >
                <option value="" disabled>
                  -- Select Account --
                </option>
                {accounts.map(acc => (
                  <option key={acc.accountId} value={acc.accountId}>
                    {acc.accountCode} - {acc.accountName} ({acc.accountType} | Normal: {acc.normalBalance})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-stone-400 absolute right-3 top-3 pointer-events-none" />
            </div>
          </div>

          {/* From Date */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
              From Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="w-full pl-3 pr-2 py-2 bg-stone-50 border border-stone-300 rounded-lg text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
            </div>
          </div>

          {/* To Date */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
              To Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="w-full pl-3 pr-2 py-2 bg-stone-50 border border-stone-300 rounded-lg text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
            </div>
          </div>
        </div>

        {/* Secondary filters row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-stone-100">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-stone-500 font-medium">Quick Dates:</span>
            <button
              type="button"
              onClick={() => handleSetPreset('TODAY')}
              className="px-2.5 py-1 text-[11px] font-medium bg-stone-100 hover:bg-stone-200 text-stone-700 rounded cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handleSetPreset('THIS_MONTH')}
              className="px-2.5 py-1 text-[11px] font-medium bg-stone-100 hover:bg-stone-200 text-stone-700 rounded cursor-pointer"
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => handleSetPreset('ALL_TIME')}
              className="px-2.5 py-1 text-[11px] font-medium bg-stone-100 hover:bg-stone-200 text-stone-700 rounded cursor-pointer"
            >
              All Time
            </button>

            {/* Voucher Type filter */}
            <div className="ml-3 flex items-center gap-1.5">
              <span className="text-xs text-stone-500 font-medium">Voucher:</span>
              <select
                value={voucherType}
                onChange={e => setVoucherType(e.target.value)}
                className="px-2 py-1 bg-stone-100 border border-stone-300 rounded text-xs text-stone-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="ALL">All Types</option>
                <option value="JOURNAL">JOURNAL</option>
                <option value="PAYMENT">PAYMENT</option>
                <option value="RECEIPT">RECEIPT</option>
                <option value="CONTRA">CONTRA</option>
                <option value="REVERSAL">REVERSAL</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchLedger}
              disabled={loading || !selectedAccountId}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Run Ledger
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 text-rose-800">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold">General Ledger Error</p>
            <p className="text-rose-700 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="bg-white border border-stone-200 rounded-xl p-12 text-center text-stone-500 space-y-3">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
          <p className="text-sm font-semibold text-stone-800">Calculating Server-Authoritative Ledger...</p>
          <p className="text-xs text-stone-500 max-w-md mx-auto">
            Computing integer paise running balances from posted double-entry journal vouchers.
          </p>
        </div>
      )}

      {/* Ledger Results */}
      {!loading && ledgerData && (
        <div className="space-y-6">
          {/* Summary Balance Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Opening Balance */}
            <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-stone-500 text-xs font-medium">
                <span>Opening Balance</span>
                <Clock className="w-4 h-4 text-stone-400" />
              </div>
              <div className="mt-2 text-xl font-bold text-stone-900">
                {formatCurrency(ledgerData.openingBalance)}
              </div>
              <div className="mt-1 text-[11px] text-stone-500 flex items-center gap-1">
                <span>Normal: <strong>{ledgerData.account.normalBalance}</strong></span>
                {fromDate ? <span>(Prior to {fromDate})</span> : <span>(Inception)</span>}
              </div>
            </div>

            {/* Period Debit */}
            <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-stone-500 text-xs font-medium">
                <span>Period Debit (DR)</span>
                <ArrowDownRight className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2 text-xl font-bold text-emerald-700">
                {formatCurrency(ledgerData.periodDebit)}
              </div>
              <div className="mt-1 text-[11px] text-stone-500">
                Total debits inside selected date range
              </div>
            </div>

            {/* Period Credit */}
            <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-stone-500 text-xs font-medium">
                <span>Period Credit (CR)</span>
                <ArrowUpRight className="w-4 h-4 text-blue-600" />
              </div>
              <div className="mt-2 text-xl font-bold text-blue-700">
                {formatCurrency(ledgerData.periodCredit)}
              </div>
              <div className="mt-1 text-[11px] text-stone-500">
                Total credits inside selected date range
              </div>
            </div>

            {/* Closing Balance */}
            <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-stone-500 text-xs font-medium">
                <span>Closing Balance</span>
                <Scale className="w-4 h-4 text-purple-600" />
              </div>
              <div className="mt-2 text-xl font-bold text-purple-800">
                {formatCurrency(ledgerData.closingBalance)}
              </div>
              <div className="mt-1 text-[11px] text-stone-500">
                As of {toDate || 'Present'} ({ledgerData.account.normalBalance} balance)
              </div>
            </div>
          </div>

          {/* Account Profile Header Strip */}
          <div className="bg-stone-50 border border-stone-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-stone-900 bg-white border border-stone-200 px-2.5 py-1 rounded">
                {ledgerData.account.accountCode}
              </span>
              <span className="font-semibold text-stone-900 text-sm">
                {ledgerData.account.accountName}
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                {ledgerData.account.accountType}
              </span>
              <span className="text-stone-500">
                Normal Balance: <strong>{ledgerData.account.normalBalance}</strong>
              </span>
            </div>
            <div className="text-stone-500 text-[11px]">
              {ledgerData.entries.length} posted transaction{ledgerData.entries.length === 1 ? '' : 's'} in period
            </div>
          </div>

          {/* Table Search */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative max-w-sm w-full">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filter by voucher #, narration, or ref ID..."
                value={tableSearch}
                onChange={e => setTableSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-stone-300 rounded-lg text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Transaction Table */}
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-100/75 border-b border-stone-200 text-stone-700 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Journal #</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Narration / Snapshot</th>
                    <th className="py-3 px-4">Ref Type / ID</th>
                    <th className="py-3 px-4 text-right">Debit (₹)</th>
                    <th className="py-3 px-4 text-right">Credit (₹)</th>
                    <th className="py-3 px-4 text-right">Running Balance (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {/* Opening Balance Row */}
                  <tr className="bg-stone-50/70 font-semibold text-stone-700">
                    <td className="py-2.5 px-4 font-mono text-stone-500">
                      {fromDate || '—'}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-stone-500">—</td>
                    <td className="py-2.5 px-4 text-stone-500">OPENING</td>
                    <td className="py-2.5 px-4 italic text-stone-600" colSpan={2}>
                      Opening Balance brought forward
                    </td>
                    <td className="py-2.5 px-4 text-right">—</td>
                    <td className="py-2.5 px-4 text-right">—</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-stone-900">
                      {formatCurrency(ledgerData.openingBalance)}
                    </td>
                  </tr>

                  {/* Transaction Rows */}
                  {filteredEntries.map(entry => {
                    const isReversal = entry.status === 'REVERSED' || entry.voucherType === 'REVERSAL';
                    return (
                      <tr
                        key={entry.lineId}
                        className={`hover:bg-stone-50 transition-colors ${
                          isReversal ? 'bg-amber-50/30' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-mono text-stone-700 whitespace-nowrap">
                          {entry.date}
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-stone-900 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span>{entry.journalNumber}</span>
                            {entry.status === 'REVERSED' && (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-100 text-amber-800">
                                REVERSED
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                              entry.voucherType === 'REVERSAL'
                                ? 'bg-purple-100 text-purple-800'
                                : entry.voucherType === 'PAYMENT'
                                ? 'bg-amber-100 text-amber-800'
                                : entry.voucherType === 'RECEIPT'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-stone-100 text-stone-700'
                            }`}
                          >
                            {entry.voucherType}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-stone-900 font-medium">{entry.narration}</p>
                          {entry.accountNameSnapshot && (
                            <p className="text-[10px] text-stone-500 mt-0.5">
                              Historical Snapshot: {entry.accountCodeSnapshot} - {entry.accountNameSnapshot}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-stone-600 whitespace-nowrap">
                          {entry.referenceType ? (
                            <span className="font-mono text-[11px] bg-stone-100 px-1.5 py-0.5 rounded">
                              {entry.referenceType}: {entry.referenceId || 'N/A'}
                            </span>
                          ) : (
                            <span className="text-stone-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-medium text-emerald-700 whitespace-nowrap">
                          {entry.debit > 0 ? formatCurrency(entry.debit) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-medium text-blue-700 whitespace-nowrap">
                          {entry.credit > 0 ? formatCurrency(entry.credit) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-stone-900 whitespace-nowrap">
                          {formatCurrency(entry.runningBalance)}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredEntries.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-stone-500">
                        No transactions recorded for this account inside the selected period.
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* Footer Totals Row */}
                <tfoot className="bg-stone-100/90 font-bold border-t-2 border-stone-300 text-stone-900">
                  <tr>
                    <td className="py-3 px-4 uppercase text-[11px]" colSpan={5}>
                      Period Totals & Closing Balance
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-800">
                      {formatCurrency(ledgerData.periodDebit)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-blue-800">
                      {formatCurrency(ledgerData.periodCredit)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-purple-900 text-sm">
                      {formatCurrency(ledgerData.closingBalance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Empty State before selection */}
      {!loading && !ledgerData && !error && (
        <div className="bg-white border border-stone-200 rounded-xl p-12 text-center text-stone-500 space-y-3">
          <BookOpen className="w-10 h-10 text-stone-400 mx-auto" />
          <h3 className="text-sm font-semibold text-stone-800">General Ledger Inactive</h3>
          <p className="text-xs text-stone-500 max-w-md mx-auto">
            Select an account and click "Run Ledger" to view authoritative double-entry journal transactions and running balances.
          </p>
        </div>
      )}
    </div>
  );
};
