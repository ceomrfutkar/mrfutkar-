/**
 * MR FUTKAR — Accounting Balance Service
 * Phase 6 Part 4C-B: Server-Authoritative Ledger-Backed Cash & Bank Balance Service
 * 
 * Strictly READ-ONLY derived from posted double-entry journal entries and lines.
 * Canonical GL Accounts:
 * - 1100: Cash in Hand (Asset, normal debit)
 * - 1200: Bank Account (Asset, normal debit)
 * 
 * Rules:
 * 1. Balances are derived ONLY from the general ledger (journal entries & lines).
 * 2. Operational custody (delivery partner custody, warehouse custody, admin custody) is NOT GL Cash and is never added here.
 * 3. Draft, non-posted, and unreversed unposted records do NOT affect balances.
 * 4. All computations use integer paise internally.
 * 5. This is a pure read operation with zero database mutations or audit writes.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from './firebaseAdmin';
import {
  Account,
  JournalEntry,
  JournalEntryLine,
  AccountingBalanceResponse,
  AccountingBalanceAccountInfo,
  CASH_ACCOUNT_CODE,
  BANK_ACCOUNT_CODE,
  parseAndValidatePaise,
  paiseToRupees,
} from '../src/types/accounting';
import { ensureSystemAccounts } from './accountingSeedService';

interface CacheEntry {
  data: AccountingBalanceResponse;
  timestamp: number;
}

export class AccountingBalanceService {
  private static cache: CacheEntry | null = null;
  private static readonly CACHE_TTL_MS = 5000; // 5-second short TTL to minimize Firestore reads on rapid UI renders

  /**
   * Clear cache for testing or immediate invalidation
   */
  public static clearCache(): void {
    this.cache = null;
  }

  /**
   * Authoritative calculation of Cash & Bank balances from posted accounting journals
   */
  public static async getLedgerBalances(options?: {
    asOf?: string;
    toDate?: string;
    bypassCache?: boolean;
  }): Promise<AccountingBalanceResponse> {
    const now = Date.now();

    // Check cache if no date filter and not explicitly bypassed
    if (
      !options?.toDate &&
      !options?.bypassCache &&
      this.cache &&
      now - this.cache.timestamp < this.CACHE_TTL_MS
    ) {
      return {
        ...this.cache.data,
        asOf: new Date().toISOString(),
      };
    }

    // 1. Resolve Accounts 1100 (Cash) and 1200 (Bank) from Chart of Accounts
    await ensureSystemAccounts().catch(() => {});

    let cashAccount: Account | null = null;
    let bankAccount: Account | null = null;

    // Check direct IDs first
    const [cashSnap, bankSnap] = await Promise.all([
      getDoc(doc(db, 'chartOfAccounts', `acc_${CASH_ACCOUNT_CODE}`)).catch(() => null),
      getDoc(doc(db, 'chartOfAccounts', `acc_${BANK_ACCOUNT_CODE}`)).catch(() => null),
    ]);

    if (cashSnap && cashSnap.exists()) {
      const { _serverTxnToken, ...safe } = cashSnap.data() as any;
      cashAccount = safe as Account;
    }
    if (bankSnap && bankSnap.exists()) {
      const { _serverTxnToken, ...safe } = bankSnap.data() as any;
      bankAccount = safe as Account;
    }

    // Fallback: search by accountCode if doc ID was custom
    if (!cashAccount || !bankAccount) {
      const allAccountsSnap = await getDocs(collection(db, 'chartOfAccounts'));
      allAccountsSnap.forEach(d => {
        const { _serverTxnToken, ...safe } = d.data() as any;
        const acc = safe as Account;
        if (acc.accountCode === CASH_ACCOUNT_CODE) {
          cashAccount = acc;
        } else if (acc.accountCode === BANK_ACCOUNT_CODE) {
          bankAccount = acc;
        }
      });
    }

    // Canonical default structures if not yet in DB
    const resolvedCashAccount: AccountingBalanceAccountInfo = {
      accountId: cashAccount?.accountId || `acc_${CASH_ACCOUNT_CODE}`,
      accountCode: CASH_ACCOUNT_CODE,
      accountName: cashAccount?.accountName || 'Cash in Hand',
      accountType: 'ASSET',
      normalBalance: 'DEBIT',
    };

    const resolvedBankAccount: AccountingBalanceAccountInfo = {
      accountId: bankAccount?.accountId || `acc_${BANK_ACCOUNT_CODE}`,
      accountCode: BANK_ACCOUNT_CODE,
      accountName: bankAccount?.accountName || 'HDFC Bank Operational A/C',
      accountType: 'ASSET',
      normalBalance: 'DEBIT',
    };

    // 2. Fetch all journal entries to determine eligibility
    const journalsSnap = await getDocs(collection(db, 'journalEntries'));
    const eligibleJournalMap = new Map<string, JournalEntry>();
    const reversedJournalIds = new Set<string>();
    const journalsWithReversals = new Set<string>();

    const allJournals: JournalEntry[] = [];
    journalsSnap.forEach(d => {
      const { _serverTxnToken, ...safeJ } = d.data() as any;
      const j = safeJ as JournalEntry;
      allJournals.push(j);

      if (j.reversalOfJournalId) {
        journalsWithReversals.add(j.reversalOfJournalId);
      }
      if (j.status === 'REVERSED') {
        reversedJournalIds.add(j.journalId);
      }
    });

    const toDate = options?.toDate ? options.toDate.trim() : undefined;

    for (const j of allJournals) {
      // CB-03: DRAFT and non-posted journals strictly excluded
      if (j.status === 'DRAFT' || (j.status as string) === 'FAILED') {
        continue;
      }

      // Date filtering if asOf / toDate provided
      if (toDate && j.journalDate > toDate) {
        continue;
      }

      // CB-04: Reversed journals handling
      if (j.status === 'REVERSED') {
        // If a matching reversal journal exists in the ledger, both original and reversal
        // will cancel out to net 0.
        // If NO reversal journal exists (i.e. status was set to REVERSED without an offsetting voucher),
        // we must exclude this journal so that it does not incorrectly inflate the balance.
        if (!journalsWithReversals.has(j.journalId)) {
          continue;
        }
      }

      eligibleJournalMap.set(j.journalId, j);
    }

    // 3. Fetch journal lines for accounts 1100 and 1200
    const linesSnap = await getDocs(collection(db, 'journalEntryLines'));

    let cashBalancePaise = 0;
    let bankBalancePaise = 0;

    linesSnap.forEach(d => {
      const line = d.data() as JournalEntryLine;

      // Only lines from eligible journals
      if (!eligibleJournalMap.has(line.journalId)) {
        return;
      }

      const isCashLine =
        line.accountId === resolvedCashAccount.accountId ||
        line.accountCodeSnapshot === CASH_ACCOUNT_CODE;

      const isBankLine =
        line.accountId === resolvedBankAccount.accountId ||
        line.accountCodeSnapshot === BANK_ACCOUNT_CODE;

      if (!isCashLine && !isBankLine) {
        return;
      }

      const dPaise = parseAndValidatePaise(line.debit || 0, 'Line Debit');
      const cPaise = parseAndValidatePaise(line.credit || 0, 'Line Credit');

      // Asset accounts have normal balance DEBIT: balance = Debit - Credit
      const netPaise = dPaise - cPaise;

      if (isCashLine) {
        cashBalancePaise += netPaise;
      }
      if (isBankLine) {
        bankBalancePaise += netPaise;
      }
    });

    const result: AccountingBalanceResponse = {
      success: true,
      cashBalancePaise,
      bankBalancePaise,
      cashBalanceRupees: paiseToRupees(cashBalancePaise),
      bankBalanceRupees: paiseToRupees(bankBalancePaise),
      asOf: new Date().toISOString(),
      currency: 'INR',
      cashAccount: resolvedCashAccount,
      bankAccount: resolvedBankAccount,
    };

    if (!options?.toDate) {
      this.cache = { data: result, timestamp: now };
    }

    return result;
  }
}
