/**
 * MR FUTKAR — Cash in Hand & Bank Balance Financial Summary
 * Phase 6 Part 4C-B: Read-Only Ledger-Backed Balance Widget
 * 
 * Exposes:
 * - Cash in Hand (Account 1100)
 * - Bank Balance (Account 1200)
 * 
 * Rules:
 * 1. Read-only derived strictly from posted double-entry journal entries.
 * 2. Zero editable inputs, zero manual adjustments.
 * 3. Does not double-count operational COD custody.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Wallet, Landmark, RefreshCw, AlertCircle, ShieldCheck } from 'lucide-react';
import { AccountingBalanceResponse } from '../../types/accounting';

interface CashBankBalanceCardProps {
  fetchBalances: (bypassCache?: boolean) => Promise<AccountingBalanceResponse>;
  title?: string;
  subtitle?: string;
  className?: string;
}

export const CashBankBalanceCard: React.FC<CashBankBalanceCardProps> = ({
  fetchBalances,
  title = 'General Ledger Balances',
  subtitle = 'Posted Cash in Hand & Bank Balances (Accounts 1100 & 1200)',
  className = '',
}) => {
  const [data, setData] = useState<AccountingBalanceResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadBalances = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const res = await fetchBalances(isManualRefresh);
      if (res && res.success) {
        setData(res);
      } else {
        setData(null);
        setError(res?.message || 'Unable to retrieve accounting balances.');
      }
    } catch (err: any) {
      setData(null);
      setError(err?.message || 'Failed to connect to accounting service.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [fetchBalances]);

  useEffect(() => {
    loadBalances(false);
  }, [loadBalances]);

  const formatRupees = (rupees?: number): string => {
    if (rupees === undefined || rupees === null || Number.isNaN(rupees)) return '--';
    return `₹${rupees.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatTime = (isoString?: string): string => {
    if (!isoString) return '--';
    try {
      return new Date(isoString).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className={`bg-white rounded-xl border border-stone-200/80 shadow-xs overflow-hidden ${className}`}>
      {/* Header Bar */}
      <div className="px-5 py-3.5 border-b border-stone-100 flex items-center justify-between gap-4 bg-stone-50/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-700 flex items-center justify-center font-bold">
            ₹
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-stone-900">{title}</h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                Ledger-Backed • Read Only
              </span>
            </div>
            <p className="text-[11px] text-stone-500">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {data?.asOf && !error && (
            <span className="text-[11px] text-stone-400 hidden sm:inline">
              As of {formatTime(data.asOf)}
            </span>
          )}
          <button
            type="button"
            onClick={() => loadBalances(true)}
            disabled={isLoading || isRefreshing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
            title="Refresh Ledger Balances"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-600' : ''}`} />
            <span className="hidden sm:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && !isLoading && (
        <div className="p-5 text-center bg-rose-50/70 border-b border-rose-100 space-y-2">
          <div className="flex items-center justify-center gap-2 text-rose-700 font-semibold text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Accounting Ledger Balances Currently Unavailable</span>
          </div>
          <p className="text-[11px] text-rose-600 max-w-md mx-auto">{error}</p>
          <button
            type="button"
            onClick={() => loadBalances(false)}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold transition-colors shadow-xs"
          >
            Retry
          </button>
        </div>
      )}

      {/* Balances Display Grid */}
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Account 1100: Cash in Hand */}
        <div className="p-4 rounded-xl border border-stone-200/80 bg-gradient-to-br from-amber-50/40 via-white to-white flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
                A/C 1100
              </span>
              <p className="text-xs font-bold uppercase tracking-wider text-stone-600">
                {data?.cashAccount?.accountName || 'Cash in Hand'}
              </p>
            </div>

            {isLoading ? (
              <div className="h-8 w-32 bg-stone-100 animate-pulse rounded my-1" />
            ) : error ? (
              <p className="text-xl font-bold text-stone-400 mt-1">--</p>
            ) : (
              <p className="text-2xl font-black text-stone-900 tracking-tight mt-1">
                {formatRupees(data?.cashBalanceRupees)}
              </p>
            )}

            <p className="text-[11px] text-stone-500">
              {isLoading
                ? 'Reading general ledger...'
                : data
                ? `${data.cashBalancePaise.toLocaleString('en-IN')} paise (Asset • Normal Debit)`
                : 'Ledger balance'}
            </p>
          </div>

          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5" />
          </div>
        </div>

        {/* Account 1200: Bank Account */}
        <div className="p-4 rounded-xl border border-stone-200/80 bg-gradient-to-br from-blue-50/40 via-white to-white flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-200">
                A/C 1200
              </span>
              <p className="text-xs font-bold uppercase tracking-wider text-stone-600">
                {data?.bankAccount?.accountName || 'Bank Balance'}
              </p>
            </div>

            {isLoading ? (
              <div className="h-8 w-32 bg-stone-100 animate-pulse rounded my-1" />
            ) : error ? (
              <p className="text-xl font-bold text-stone-400 mt-1">--</p>
            ) : (
              <p className="text-2xl font-black text-stone-900 tracking-tight mt-1">
                {formatRupees(data?.bankBalanceRupees)}
              </p>
            )}

            <p className="text-[11px] text-stone-500">
              {isLoading
                ? 'Reading general ledger...'
                : data
                ? `${data.bankBalancePaise.toLocaleString('en-IN')} paise (Asset • Normal Debit)`
                : 'Ledger balance'}
            </p>
          </div>

          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <Landmark className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Accounting Separation Guarantee Notice */}
      <div className="px-5 py-2.5 bg-stone-50 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
        <span>
          <strong>Accounting Invariant:</strong> Derived strictly from posted journal entries. Operational COD cash custody is held separately and not double-counted.
        </span>
        <span className="text-stone-400 text-[10px] hidden md:inline">
          Currency: {data?.currency || 'INR'}
        </span>
      </div>
    </div>
  );
};
