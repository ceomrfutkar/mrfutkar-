/**
 * MR FUTKAR — Trial Balance Section Component
 * Phase 5.4 Part 3: Authoritative Double-Entry Trial Balance
 * Mandatory Invariant: TOTAL DEBIT = TOTAL CREDIT
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Scale,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Filter,
  Search,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { AdminClient } from '../../../services/adminClient';
import {
  AccountType,
  TrialBalanceResponse,
  TrialBalanceAccountRow,
} from '../../../types/accounting';

const ACCOUNT_TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];

const TYPE_BADGES: Record<AccountType, string> = {
  ASSET: 'bg-emerald-100 text-emerald-800',
  LIABILITY: 'bg-amber-100 text-amber-800',
  EQUITY: 'bg-purple-100 text-purple-800',
  INCOME: 'bg-blue-100 text-blue-800',
  EXPENSE: 'bg-rose-100 text-rose-800',
};

export const AdminTrialBalanceSection: React.FC = () => {
  // Filters
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [accountType, setAccountType] = useState<string>('ALL');
  const [includeZeroBalances, setIncludeZeroBalances] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Data states
  const [trialData, setTrialData] = useState<TrialBalanceResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch Trial Balance
  const fetchTrialBalance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await AdminClient.fetchTrialBalance({
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        accountType: accountType !== 'ALL' ? (accountType as AccountType) : undefined,
        includeZeroBalances,
      });

      if (res.success && res.data) {
        setTrialData(res.data);
      } else {
        setError(res.message || 'Failed to load Trial Balance.');
        setTrialData(null);
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching Trial Balance.');
      setTrialData(null);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, accountType, includeZeroBalances]);

  useEffect(() => {
    fetchTrialBalance();
  }, [fetchTrialBalance]);

  // Client search within rows
  const filteredAccounts = useMemo(() => {
    if (!trialData?.accounts) return [];
    if (!searchQuery.trim()) return trialData.accounts;
    const q = searchQuery.toLowerCase().trim();
    return trialData.accounts.filter(
      a =>
        a.accountCode.toLowerCase().includes(q) ||
        a.accountName.toLowerCase().includes(q) ||
        a.accountType.toLowerCase().includes(q)
    );
  }, [trialData, searchQuery]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Control / Filter Bar */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          {/* From Date */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="w-full pl-3 pr-2 py-2 bg-stone-50 border border-stone-300 rounded-lg text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
              To Date (As Of)
            </label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="w-full pl-3 pr-2 py-2 bg-stone-50 border border-stone-300 rounded-lg text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            />
          </div>

          {/* Account Type */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
              Account Category
            </label>
            <select
              value={accountType}
              onChange={e => setAccountType(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-lg text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            >
              <option value="ALL">All Categories</option>
              {ACCOUNT_TYPES.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Action button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchTrialBalance}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Run Trial Balance
            </button>
          </div>
        </div>

        {/* Options & Search Strip */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-stone-100">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-stone-700 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={includeZeroBalances}
                onChange={e => setIncludeZeroBalances(e.target.checked)}
                className="w-4 h-4 text-emerald-600 border-stone-300 rounded focus:ring-emerald-500"
              />
              Show zero-balance accounts
            </label>
          </div>

          <div className="relative max-w-xs w-full">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search account code or name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-stone-50 border border-stone-300 rounded-lg text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 text-rose-800">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold">Accounting Integrity Exception</p>
            <p className="text-rose-700 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="bg-white border border-stone-200 rounded-xl p-12 text-center text-stone-500 space-y-3">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
          <p className="text-sm font-semibold text-stone-800">Computing Double-Entry Trial Balance...</p>
          <p className="text-xs text-stone-500 max-w-md mx-auto">
            Aggregating all posted debits and credits across the general ledger and verifying invariant TOTAL DEBIT = TOTAL CREDIT.
          </p>
        </div>
      )}

      {/* Trial Balance Report */}
      {!loading && trialData && (
        <div className="space-y-6">
          {/* Integrity Balance Status Banner */}
          <div
            className={`rounded-xl border p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 ${
              trialData.isBalanced
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-3">
              {trialData.isBalanced ? (
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-6 h-6 text-rose-600" />
                </div>
              )}
              <div>
                <h4 className="text-sm font-bold">
                  {trialData.isBalanced
                    ? 'Trial Balance Invariant Verified: BALANCED'
                    : 'CRITICAL INTEGRITY FAILURE: UNBALANCED'}
                </h4>
                <p className="text-xs text-stone-600 mt-0.5">
                  {trialData.isBalanced
                    ? 'Total debits exactly equal total credits across all accounts in accordance with double-entry principles.'
                    : 'Discrepancy detected between Total Debit and Total Credit. Investigation required.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6 text-right">
              <div>
                <span className="block text-[11px] uppercase tracking-wider text-stone-500 font-semibold">
                  Total Debit
                </span>
                <span className="text-base font-mono font-bold text-emerald-800">
                  {formatCurrency(trialData.totalDebit)}
                </span>
              </div>
              <div className="text-stone-300 font-light text-xl">|</div>
              <div>
                <span className="block text-[11px] uppercase tracking-wider text-stone-500 font-semibold">
                  Total Credit
                </span>
                <span className="text-base font-mono font-bold text-blue-800">
                  {formatCurrency(trialData.totalCredit)}
                </span>
              </div>
            </div>
          </div>

          {/* Accounts Table */}
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-100/75 border-b border-stone-200 text-stone-700 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Account Code</th>
                    <th className="py-3 px-4">Account Name</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Normal Bal</th>
                    <th className="py-3 px-4 text-right">Total Debit (₹)</th>
                    <th className="py-3 px-4 text-right">Total Credit (₹)</th>
                    <th className="py-3 px-4 text-right">Closing Balance (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredAccounts.map(row => (
                    <tr key={row.accountId} className="hover:bg-stone-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-stone-900 whitespace-nowrap">
                        {row.accountCode}
                      </td>
                      <td className="py-3 px-4 font-medium text-stone-900 whitespace-nowrap">
                        {row.accountName}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${TYPE_BADGES[row.accountType] || 'bg-stone-100'}`}>
                          {row.accountType}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-stone-600 font-semibold whitespace-nowrap">
                        {row.normalBalance}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-emerald-700 whitespace-nowrap">
                        {row.debit > 0 ? formatCurrency(row.debit) : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-blue-700 whitespace-nowrap">
                        {row.credit > 0 ? formatCurrency(row.credit) : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-stone-900 whitespace-nowrap">
                        {formatCurrency(row.closingBalance)}
                      </td>
                    </tr>
                  ))}

                  {filteredAccounts.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-stone-500">
                        No accounts match the selected filters or have recorded balances.
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* Grand Totals Footer */}
                <tfoot className="bg-stone-100/90 font-bold border-t-2 border-stone-300 text-stone-900">
                  <tr>
                    <td className="py-3.5 px-4 uppercase text-[11px]" colSpan={4}>
                      Grand Totals ({filteredAccounts.length} accounts)
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-emerald-800 text-sm">
                      {formatCurrency(trialData.totalDebit)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-blue-800 text-sm">
                      {formatCurrency(trialData.totalCredit)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-purple-900">
                      {trialData.isBalanced ? 'BALANCED' : 'IMBALANCE'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
