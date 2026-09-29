/**
 * MR FUTKAR — Trial Balance Service
 * Phase 5.4 Part 3: Server-Authoritative Trial Balance Service
 * Derived strictly from posted journal entries and lines
 * Mandatory Invariant: TOTAL DEBIT = TOTAL CREDIT
 */

import {
  collection,
  doc,
  getDocs,
  query,
} from 'firebase/firestore';
import { db } from './firebaseAdmin';
import {
  Account,
  JournalEntry,
  JournalEntryLine,
  TrialBalanceAccountRow,
  TrialBalanceFilter,
  TrialBalanceResponse,
  getRequiredNormalBalance,
  parseAndValidatePaise,
  paiseToRupees,
  isValidDateFormat,
} from '../src/types/accounting';

export class TrialBalanceService {
  /**
   * Helper alias for generating complete trial balance
   */
  static async generateTrialBalance(
    filter: TrialBalanceFilter = {}
  ): Promise<TrialBalanceResponse> {
    return this.getTrialBalance(filter);
  }

  /**
   * Authoritative Trial Balance computation
   */
  static async getTrialBalance(
    filter: TrialBalanceFilter = {},
    options?: { simulateUnbalanced?: boolean }
  ): Promise<TrialBalanceResponse> {
    const fromDate = filter.fromDate ? filter.fromDate.trim() : undefined;
    const toDate = filter.toDate ? filter.toDate.trim() : undefined;

    if (fromDate && !isValidDateFormat(fromDate)) {
      throw new Error('INVALID_DATE_FORMAT: fromDate must be valid YYYY-MM-DD format.');
    }
    if (toDate && !isValidDateFormat(toDate)) {
      throw new Error('INVALID_DATE_FORMAT: toDate must be valid YYYY-MM-DD format.');
    }
    if (fromDate && toDate && fromDate > toDate) {
      throw new Error('INVALID_DATE_RANGE: fromDate cannot be after toDate.');
    }

    // 1. Fetch all accounts from Chart of Accounts
    const accountsRef = collection(db, 'chartOfAccounts');
    const accountsSnap = await getDocs(accountsRef);
    const allAccounts: Account[] = [];
    const accountMap = new Map<string, Account>();

    accountsSnap.forEach(d => {
      const { _serverTxnToken, ...safeAccount } = d.data() as any;
      const acc = safeAccount as Account;
      allAccounts.push(acc);
      accountMap.set(acc.accountId, acc);
    });

    // 2. Fetch all journal entries
    const journalsRef = collection(db, 'journalEntries');
    const journalsSnap = await getDocs(journalsRef);
    const eligibleJournalMap = new Map<string, JournalEntry>();

    journalsSnap.forEach(d => {
      const j = d.data() as JournalEntry;
      // TB-03: DRAFT journals are strictly excluded
      if (j.status === 'DRAFT') {
        return;
      }
      // Date filtering
      if (fromDate && j.journalDate < fromDate) {
        return;
      }
      if (toDate && j.journalDate > toDate) {
        return;
      }
      eligibleJournalMap.set(j.journalId, j);
    });

    // 3. Fetch all journal lines
    const linesRef = collection(db, 'journalEntryLines');
    const linesSnap = await getDocs(linesRef);

    const accountTotalsPaise: Record<string, { debitPaise: number; creditPaise: number }> = {};
    let grandTotalDebitPaise = 0;
    let grandTotalCreditPaise = 0;

    linesSnap.forEach(d => {
      const line = d.data() as JournalEntryLine;
      // Only include lines from eligible (POSTED / REVERSED) journals within date range
      if (!eligibleJournalMap.has(line.journalId)) {
        return;
      }

      const accId = line.accountId;
      if (!accountTotalsPaise[accId]) {
        accountTotalsPaise[accId] = { debitPaise: 0, creditPaise: 0 };
      }

      const dPaise = parseAndValidatePaise(line.debit || 0, 'Line Debit');
      const cPaise = parseAndValidatePaise(line.credit || 0, 'Line Credit');

      accountTotalsPaise[accId].debitPaise += dPaise;
      accountTotalsPaise[accId].creditPaise += cPaise;

      grandTotalDebitPaise += dPaise;
      grandTotalCreditPaise += cPaise;
    });

    // Optional simulation for TB-08 test
    if (options?.simulateUnbalanced) {
      grandTotalDebitPaise += 10000; // Add fake ₹100 discrepancy
    }

    // 4. Trial Balance Invariant Check (Section 10 & TB-02, TB-08)
    // When no accountType filter is applied, TOTAL DEBIT must equal TOTAL CREDIT
    const isFullTrialBalance = !filter.accountType;
    if (isFullTrialBalance && grandTotalDebitPaise !== grandTotalCreditPaise) {
      const err: any = new Error(
        `ACCOUNTING_INTEGRITY_ERROR: Trial Balance is unbalanced. Total Debit (₹${paiseToRupees(
          grandTotalDebitPaise
        )}) does not equal Total Credit (₹${paiseToRupees(grandTotalCreditPaise)}).`
      );
      err.code = 'ACCOUNTING_INTEGRITY_ERROR';
      err.totalDebit = paiseToRupees(grandTotalDebitPaise);
      err.totalCredit = paiseToRupees(grandTotalCreditPaise);
      throw err;
    }

    // 5. Build account rows
    const rows: TrialBalanceAccountRow[] = [];
    let filteredTotalDebitPaise = 0;
    let filteredTotalCreditPaise = 0;

    // Sort accounts by accountCode
    allAccounts.sort((a, b) =>
      a.accountCode.localeCompare(b.accountCode, undefined, { numeric: true })
    );

    for (const acc of allAccounts) {
      // TB-06: Account type filtering
      if (filter.accountType && acc.accountType !== filter.accountType) {
        continue;
      }

      const totals = accountTotalsPaise[acc.accountId] || { debitPaise: 0, creditPaise: 0 };
      const dPaise = totals.debitPaise;
      const cPaise = totals.creditPaise;

      // Section 9: Only accounts with relevant balances may be shown unless explicitly requested
      if (!filter.includeZeroBalances && dPaise === 0 && cPaise === 0) {
        continue;
      }

      filteredTotalDebitPaise += dPaise;
      filteredTotalCreditPaise += cPaise;

      const normal = acc.normalBalance || getRequiredNormalBalance(acc.accountType);
      const closingBalPaise = normal === 'DEBIT' ? dPaise - cPaise : cPaise - dPaise;

      const netDebitPaise = dPaise > cPaise ? dPaise - cPaise : 0;
      const netCreditPaise = cPaise > dPaise ? cPaise - dPaise : 0;

      rows.push({
        accountId: acc.accountId,
        accountCode: acc.accountCode,
        accountName: acc.accountName,
        accountType: acc.accountType,
        normalBalance: normal,
        debit: paiseToRupees(dPaise),
        credit: paiseToRupees(cPaise),
        closingBalance: paiseToRupees(closingBalPaise),
        netDebit: paiseToRupees(netDebitPaise),
        netCredit: paiseToRupees(netCreditPaise),
      });
    }

    const finalTotalDebitPaise = isFullTrialBalance ? grandTotalDebitPaise : filteredTotalDebitPaise;
    const finalTotalCreditPaise = isFullTrialBalance ? grandTotalCreditPaise : filteredTotalCreditPaise;
    const isBalanced = finalTotalDebitPaise === finalTotalCreditPaise;

    return {
      success: true,
      accounts: rows,
      totalDebit: paiseToRupees(finalTotalDebitPaise),
      totalCredit: paiseToRupees(finalTotalCreditPaise),
      totalDebitPaise: finalTotalDebitPaise,
      totalCreditPaise: finalTotalCreditPaise,
      isBalanced,
      filter: {
        fromDate,
        toDate,
        accountType: filter.accountType,
        includeZeroBalances: filter.includeZeroBalances,
      },
    };
  }
}
