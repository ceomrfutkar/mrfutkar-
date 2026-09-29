/**
 * MR FUTKAR — General Ledger Service
 * Phase 5.4 Part 3: Server-Authoritative General Ledger Query Service
 * Derived strictly from posted accounting journals and lines
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
  GeneralLedgerEntry,
  GeneralLedgerFilter,
  GeneralLedgerResponse,
  getRequiredNormalBalance,
  parseAndValidatePaise,
  paiseToRupees,
  isValidDateFormat,
} from '../src/types/accounting';

export class GeneralLedgerService {
  /**
   * Helper alias for querying account ledger by accountCode or accountId
   */
  static async getAccountLedger(accountCodeOrId: string) {
    const res = await this.getLedger({ accountId: accountCodeOrId });
    return {
      ...res,
      transactions: res.entries,
    };
  }

  /**
   * Authoritative General Ledger query
   */
  static async getLedger(filter: GeneralLedgerFilter): Promise<GeneralLedgerResponse & { transactions: GeneralLedgerEntry[] }> {
    const rawAccountId = typeof filter.accountId === 'string' ? filter.accountId.trim() : '';
    if (!rawAccountId) {
      throw new Error('MISSING_ACCOUNT_ID: accountId is required for General Ledger query.');
    }

    // 1. Static Parameter Validation (Dates)
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

    // 2. Fetch Account
    let account: Account | null = null;
    const directDocRef = doc(db, 'chartOfAccounts', rawAccountId);
    const directSnap = await getDoc(directDocRef);

    if (directSnap.exists()) {
      account = directSnap.data() as Account;
    } else {
      // Allow searching by accountCode
      const codeQuery = query(collection(db, 'chartOfAccounts'), where('accountCode', '==', rawAccountId));
      const codeSnap = await getDocs(codeQuery);
      if (!codeSnap.empty) {
        account = codeSnap.docs[0].data() as Account;
      }
    }

    if (!account) {
      throw new Error(`ACCOUNT_NOT_FOUND: Account "${rawAccountId}" does not exist in Chart of Accounts.`);
    }

    const normalBalance = account.normalBalance || getRequiredNormalBalance(account.accountType);

    // 3. Fetch all journal entry lines for this account
    const linesQuery = query(
      collection(db, 'journalEntryLines'),
      where('accountId', '==', account.accountId)
    );
    const linesSnap = await getDocs(linesQuery);

    const rawLines: JournalEntryLine[] = [];
    linesSnap.forEach(d => {
      const { _serverTxnToken, ...safeLine } = d.data() as any;
      rawLines.push(safeLine as JournalEntryLine);
    });

    // 4. Batch fetch parent journals
    const uniqueJournalIds = Array.from(new Set(rawLines.map(l => l.journalId)));
    const journalMap = new Map<string, JournalEntry>();

    for (const jId of uniqueJournalIds) {
      const jRef = doc(db, 'journalEntries', jId);
      const jSnap = await getDoc(jRef);
      if (jSnap.exists()) {
        const { _serverTxnToken, ...safeJournal } = jSnap.data() as any;
        journalMap.set(jId, safeJournal as JournalEntry);
      }
    }

    // 5. Partition lines into Opening Balance and Period Lines
    // ONLY POSTED and REVERSED journals affect the ledger. DRAFT is excluded.
    let openingBalancePaise = 0;
    const periodItems: { line: JournalEntryLine; journal: JournalEntry }[] = [];

    for (const line of rawLines) {
      const journal = journalMap.get(line.journalId);
      if (!journal) continue;

      // GL-02 & Section 6: DRAFT journals must NOT appear in General Ledger
      if (journal.status === 'DRAFT') {
        continue;
      }

      // Check optional filters
      if (filter.voucherType && journal.voucherType !== filter.voucherType) {
        continue;
      }
      if (filter.referenceType && journal.referenceType !== filter.referenceType) {
        continue;
      }
      if (filter.customerId && line.customerId !== filter.customerId) {
        continue;
      }
      if (filter.supplierId && line.supplierId !== filter.supplierId) {
        continue;
      }

      const dPaise = parseAndValidatePaise(line.debit || 0, 'Line Debit');
      const cPaise = parseAndValidatePaise(line.credit || 0, 'Line Credit');

      // Check if entry is strictly prior to fromDate
      if (fromDate && journal.journalDate < fromDate) {
        if (normalBalance === 'DEBIT') {
          openingBalancePaise += (dPaise - cPaise);
        } else {
          openingBalancePaise += (cPaise - dPaise);
        }
      } else {
        // Check if inside period
        if (!toDate || journal.journalDate <= toDate) {
          periodItems.push({ line, journal });
        }
      }
    }

    // 6. Sort period entries in chronological order
    periodItems.sort((a, b) => {
      const dateCmp = a.journal.journalDate.localeCompare(b.journal.journalDate);
      if (dateCmp !== 0) return dateCmp;
      const createdCmp = (a.journal.createdAt || '').localeCompare(b.journal.createdAt || '');
      if (createdCmp !== 0) return createdCmp;
      const numCmp = (a.journal.journalNumber || a.journal.journalId).localeCompare(
        b.journal.journalNumber || b.journal.journalId
      );
      if (numCmp !== 0) return numCmp;
      return (a.line.lineNumber || 0) - (b.line.lineNumber || 0);
    });

    // 7. Calculate Running Balance & Period Totals
    let currentBalancePaise = openingBalancePaise;
    let periodDebitPaise = 0;
    let periodCreditPaise = 0;
    const entries: GeneralLedgerEntry[] = [];

    for (const item of periodItems) {
      const dPaise = parseAndValidatePaise(item.line.debit || 0, 'Line Debit');
      const cPaise = parseAndValidatePaise(item.line.credit || 0, 'Line Credit');

      periodDebitPaise += dPaise;
      periodCreditPaise += cPaise;

      if (normalBalance === 'DEBIT') {
        currentBalancePaise += (dPaise - cPaise);
      } else {
        currentBalancePaise += (cPaise - dPaise);
      }

      // Preserve historical snapshots (GL-10)
      entries.push({
        date: item.journal.journalDate,
        journalId: item.journal.journalId,
        journalNumber: item.journal.journalNumber || item.journal.journalId,
        voucherType: item.journal.voucherType,
        referenceType: item.journal.referenceType || undefined,
        referenceId: item.journal.referenceId || undefined,
        narration: item.line.description || item.journal.narration,
        lineId: item.line.lineId,
        accountId: account.accountId,
        accountCodeSnapshot: item.line.accountCodeSnapshot || account.accountCode,
        accountNameSnapshot: item.line.accountNameSnapshot || account.accountName,
        debit: paiseToRupees(dPaise),
        credit: paiseToRupees(cPaise),
        runningBalance: paiseToRupees(currentBalancePaise),
        customerId: item.line.customerId || null,
        supplierId: item.line.supplierId || null,
        productId: item.line.productId || null,
        status: item.journal.status,
      });
    }

    return {
      success: true,
      account: {
        accountId: account.accountId,
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        normalBalance,
        isActive: account.isActive,
      },
      filter: {
        accountId: account.accountId,
        fromDate,
        toDate,
        voucherType: filter.voucherType,
        referenceType: filter.referenceType,
        customerId: filter.customerId,
        supplierId: filter.supplierId,
      },
      openingBalance: paiseToRupees(openingBalancePaise),
      periodDebit: paiseToRupees(periodDebitPaise),
      periodCredit: paiseToRupees(periodCreditPaise),
      closingBalance: paiseToRupees(currentBalancePaise),
      entries,
      transactions: entries,
      totalCount: entries.length,
    };
  }
}
