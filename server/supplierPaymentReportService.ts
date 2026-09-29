/**
 * MR FUTKAR — Supplier Payment Report & Ledger Service (Phase 5.8 Part 4)
 * Server-authoritative, read-only supplier payment ledger and reporting layer.
 * Strictly integer paise accounting. Zero data mutations.
 * Derives financial truth strictly from posted accounting journals, invoices, and payments.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN } from './firebaseAdmin';
import { AdminSession } from '../src/types/admin';
import {
  Account,
  isValidDateFormat,
  paiseToRupees,
  parseAndValidatePaise,
  JournalEntry,
  JournalEntryLine,
} from '../src/types/accounting';
import {
  SupplierPayment,
  SupplierPaymentStatus,
  SupplierStatementFilter,
  SupplierStatementResponse,
  SupplierStatementTransaction,
  SupplierStatementTransactionType,
  SupplierPaymentHistoryFilter,
  SupplierPaymentHistoryResponse,
  SupplierPaymentHistoryItem,
  OutstandingPurchaseInvoiceItem,
  SupplierOutstandingInvoicesResponse,
  SupplierAccountingSummaryResponse,
  SupplierSnapshot,
} from '../src/types/supplierPayment';
import { PurchaseInvoice } from '../src/types/invoice';
import { CreditDebitNote } from '../src/types/creditDebitNote';
import { PartyLedgerService } from './partyLedgerService';
import { generateCsv } from './reportUtils';

export interface SupplierPaymentReportOptions {
  /** Optional flag when called internally by export routines to allow retrieving full report dataset */
  isExport?: boolean;
  /** Optional in-memory test fixtures to evaluate deterministic scenarios without database access */
  inMemoryFixtures?: {
    payments?: SupplierPayment[];
    invoices?: PurchaseInvoice[];
    notes?: CreditDebitNote[];
    journals?: JournalEntry[];
    journalLines?: JournalEntryLine[];
    suppliers?: any[];
    accounts?: Account[];
  };
}

export class SupplierPaymentReportService {
  /**
   * Helper: Resolve Authoritative Account 2100 (Accounts Payable)
   */
  private static async getAuthoritativeAccountsPayable(options?: SupplierPaymentReportOptions): Promise<Account> {
    if (options?.inMemoryFixtures?.accounts) {
      const match = options.inMemoryFixtures.accounts.find((a) => a.accountCode === '2100');
      if (match) return match;
    }

    try {
      const directDocRef = doc(db, 'chartOfAccounts', 'acc_2100');
      const directSnap = await getDoc(directDocRef);
      if (directSnap.exists()) {
        return directSnap.data() as Account;
      }

      const codeQuery = query(collection(db, 'chartOfAccounts'), where('accountCode', '==', '2100'));
      const codeSnap = await getDocs(codeQuery);
      if (!codeSnap.empty) {
        return codeSnap.docs[0].data() as Account;
      }
    } catch {
      // Fallback default system account
    }

    return {
      accountId: 'acc_2100',
      accountCode: '2100',
      accountName: 'Accounts Payable',
      accountType: 'LIABILITY',
      parentAccountId: null,
      normalBalance: 'CREDIT',
      isActive: true,
      isSystemAccount: true,
      description: 'Trade payables for FMCG suppliers and vendors',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'SYSTEM_BOOTSTRAP',
      updatedBy: 'SYSTEM_BOOTSTRAP',
    };
  }

  /**
   * Helper: Validate against client field injection
   */
  private static assertNoFieldInjection(payload: any): void {
    if (!payload || typeof payload !== 'object') return;
    const forbiddenKeys = [
      'openingBalance',
      'openingBalancePaise',
      'closingBalance',
      'closingBalancePaise',
      'runningBalance',
      'runningBalancePaise',
      'debit',
      'debitPaise',
      'credit',
      'creditPaise',
      'totalOutstandingAP',
      'totalOutstandingAPPaise',
      'periodDebit',
      'periodDebitPaise',
      'periodCredit',
      'periodCreditPaise',
      'outstandingAmount',
      'outstandingAmountPaise',
      'amountPaise',
      'allocatedAmountPaise',
      'unallocatedAmountPaise',
      '_serverTxnToken',
    ];

    for (const key of forbiddenKeys) {
      if (payload[key] !== undefined) {
        throw new Error(
          `CLIENT_FIELD_INJECTION_FORBIDDEN: Client cannot inject authoritative accounting parameters ("${key}").`
        );
      }
    }
  }

  // =========================================================================
  // 1. SUPPLIER STATEMENT
  // =========================================================================

  /**
   * Generates a read-only, server-authoritative supplier statement.
   * Derived strictly from posted accounting journals and Account 2100 lines.
   */
  public static async getSupplierStatement(
    adminSession: AdminSession,
    filter: SupplierStatementFilter,
    options?: SupplierPaymentReportOptions
  ): Promise<SupplierStatementResponse> {
    // 1. Enforce Super Admin Authorization
    if (!adminSession || adminSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED: Only Super Admin users can access supplier statements.');
    }

    // 2. Reject client injection
    this.assertNoFieldInjection(filter);

    // 3. Validate & Resolve Canonical Supplier Identity
    const rawSupplierId = typeof filter?.supplierId === 'string' ? filter.supplierId.trim() : '';
    if (!rawSupplierId) {
      throw new Error('MISSING_SUPPLIER_ID: supplierId is required for supplier statement.');
    }

    let canonicalSupplierId = rawSupplierId;
    if (!options?.inMemoryFixtures) {
      const resolved = await PartyLedgerService.resolveCanonicalSupplierId(rawSupplierId);
      if (resolved) {
        canonicalSupplierId = resolved;
      }
    }

    // 4. Validate Date Filters
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

    // Pagination validation
    const page = Math.max(1, typeof filter.page === 'number' && Number.isFinite(filter.page) ? Math.floor(filter.page) : 1);
    const rawPageSize = filter.pageSize !== undefined ? Number(filter.pageSize) : 50;
    if (rawPageSize > 100 && !options?.isExport) {
      throw new Error('PAGE_SIZE_EXCEEDED: Page size cannot exceed 100.');
    }
    const pageSize = Math.max(1, Number.isFinite(rawPageSize) ? Math.floor(rawPageSize) : 50);

    // 5. Fetch Supplier Snapshot
    let supplierSnapshot: SupplierSnapshot = {
      supplierId: canonicalSupplierId,
      businessName: `Supplier (${canonicalSupplierId})`,
    };

    if (options?.inMemoryFixtures?.suppliers) {
      const match = options.inMemoryFixtures.suppliers.find(
        (s) => s.supplierId === canonicalSupplierId || s.id === canonicalSupplierId
      );
      if (match) {
        supplierSnapshot = {
          supplierId: canonicalSupplierId,
          businessName: match.businessName || match.name || `Supplier (${canonicalSupplierId})`,
          contactName: match.contactName,
          mobile: match.mobile,
          fullAddress: match.fullAddress,
          city: match.city,
          state: match.state,
          pincode: match.pincode,
          gstin: match.gstin,
        };
      }
    } else {
      const resolvedSnap = await PartyLedgerService.resolveSupplierSnapshot(canonicalSupplierId);
      supplierSnapshot = {
        supplierId: canonicalSupplierId,
        businessName: resolvedSnap.businessName,
        contactName: resolvedSnap.contactName,
        mobile: resolvedSnap.mobile,
        fullAddress: resolvedSnap.fullAddress,
        city: resolvedSnap.city,
        state: resolvedSnap.state,
        pincode: resolvedSnap.pincode,
        gstin: resolvedSnap.gstin,
      };
    }

    // 6. Resolve Accounts Payable Account (2100)
    const accPayable = await this.getAuthoritativeAccountsPayable(options);

    // 7. Retrieve Journal Lines for Account 2100
    let rawLines: JournalEntryLine[] = [];
    const journalMap = new Map<string, JournalEntry>();

    if (options?.inMemoryFixtures) {
      if (options.inMemoryFixtures.journalLines) {
        rawLines = options.inMemoryFixtures.journalLines.filter(
          (l) => l.accountId === accPayable.accountId || l.accountId === 'acc_2100'
        );
      }
      if (options.inMemoryFixtures.journals) {
        for (const j of options.inMemoryFixtures.journals) {
          journalMap.set(j.journalId, j);
        }
      }
    } else {
      const linesQuery = query(
        collection(db, 'journalEntryLines'),
        where('accountId', '==', accPayable.accountId)
      );
      const linesSnap = await getDocs(linesQuery);
      linesSnap.forEach((d) => rawLines.push(d.data() as JournalEntryLine));

      const uniqueJournalIds = Array.from(new Set(rawLines.map((l) => l.journalId)));
      for (const jId of uniqueJournalIds) {
        const jSnap = await getDoc(doc(db, 'journalEntries', jId));
        if (jSnap.exists()) {
          journalMap.set(jId, jSnap.data() as JournalEntry);
        }
      }
    }

    // 8. Partition lines into Opening Balance and Period Lines
    // Liability Account 2100 normal balance is CREDIT:
    // Credit increases payable (+), Debit reduces payable (-)
    let openingBalancePaise = 0;
    const periodItems: { line: JournalEntryLine; journal: JournalEntry }[] = [];

    // Also track all-time lines for this supplier to derive current total AP balance
    let allTimeDebitPaise = 0;
    let allTimeCreditPaise = 0;

    for (const line of rawLines) {
      const journal = journalMap.get(line.journalId);
      if (!journal || journal.status !== 'POSTED') continue;

      if (line.supplierId !== canonicalSupplierId) {
        continue;
      }

      const dPaise = parseAndValidatePaise(line.debit || 0, 'Line Debit');
      const cPaise = parseAndValidatePaise(line.credit || 0, 'Line Credit');

      allTimeDebitPaise += dPaise;
      allTimeCreditPaise += cPaise;

      if (fromDate && journal.journalDate < fromDate) {
        openingBalancePaise += (cPaise - dPaise);
      } else {
        if (!toDate || journal.journalDate <= toDate) {
          periodItems.push({ line, journal });
        }
      }
    }

    // Sort period entries chronologically
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

    // 9. Calculate Running Balances and Totals in Integer Paise
    let runningBalancePaise = openingBalancePaise;
    let periodDebitPaise = 0;
    let periodCreditPaise = 0;
    let totalPurchaseInvoiceDebitsPaise = 0;
    let totalPurchaseInvoiceCreditsPaise = 0;

    const allCalculatedTransactions: SupplierStatementTransaction[] = [];

    for (const item of periodItems) {
      const dPaise = parseAndValidatePaise(item.line.debit || 0, 'Line Debit');
      const cPaise = parseAndValidatePaise(item.line.credit || 0, 'Line Credit');

      periodDebitPaise += dPaise;
      periodCreditPaise += cPaise;
      runningBalancePaise += (cPaise - dPaise);

      // Determine Transaction Type
      let txType: SupplierStatementTransactionType = 'JOURNAL_ENTRY';
      if (item.journal.referenceType === 'PURCHASE_INVOICE') {
        txType = 'PURCHASE_INVOICE';
        totalPurchaseInvoiceDebitsPaise += dPaise;
        totalPurchaseInvoiceCreditsPaise += cPaise;
      } else if (item.journal.referenceType === 'CREDIT_DEBIT_NOTE') {
        txType = item.line.debit > 0 ? 'PURCHASE_DEBIT_NOTE' : 'PURCHASE_CREDIT_NOTE';
      } else if (
        item.journal.referenceType === 'SUPPLIER_PAYMENT' ||
        item.journal.voucherType === 'PAYMENT' ||
        item.journal.voucherType === 'PV'
      ) {
        txType = 'SUPPLIER_PAYMENT';
      } else if (item.journal.voucherType === 'DN' || item.journal.voucherType === 'DEBIT_NOTE') {
        txType = 'PURCHASE_DEBIT_NOTE';
      } else if (item.journal.voucherType === 'CN' || item.journal.voucherType === 'CREDIT_NOTE') {
        txType = 'PURCHASE_CREDIT_NOTE';
      }

      // Optional transactionType filter
      if (filter.transactionType && txType !== filter.transactionType) {
        continue;
      }

      // Optional status filter
      if (filter.status && item.journal.status !== filter.status) {
        continue;
      }

      const rawRef = (item.journal as any).referenceNumber || item.journal.referenceId;
      const refNumber =
        rawRef ||
        (item.journal.narration
          ? item.journal.narration.match(/(?:PI|SI|CN|DN|SP|PV|INV)-[A-Z0-9-]+/i)?.[0]
          : undefined);

      allCalculatedTransactions.push({
        date: item.journal.journalDate,
        transactionId: item.line.lineId || `${item.journal.journalId}_${item.line.lineNumber || 0}`,
        referenceId: item.journal.referenceId || undefined,
        referenceNumber: refNumber,
        voucherNumber: item.journal.journalNumber || item.journal.journalId,
        transactionType: txType,
        documentType: txType,
        narration: item.journal.narration || item.line.description || '',
        debit: paiseToRupees(dPaise),
        debitPaise: dPaise,
        credit: paiseToRupees(cPaise),
        creditPaise: cPaise,
        runningBalance: paiseToRupees(runningBalancePaise),
        runningBalancePaise,
        status: item.journal.status,
      });
    }

    const closingBalancePaise = openingBalancePaise + periodCreditPaise - periodDebitPaise;
    const currentOutstandingAPPaise = allTimeCreditPaise - allTimeDebitPaise;

    // 10. Query Supplier Payments for Payment/Allocation/Reversal aggregates
    let allPayments: SupplierPayment[] = [];
    if (options?.inMemoryFixtures?.payments) {
      allPayments = options.inMemoryFixtures.payments.filter((p) => p.supplierId === canonicalSupplierId);
    } else {
      try {
        const qPay = query(collection(db, 'supplierPayments'), where('supplierId', '==', canonicalSupplierId));
        const snapPay = await getDocs(qPay);
        snapPay.forEach((d) => allPayments.push(d.data() as SupplierPayment));
      } catch {
        // Fallback
      }
    }

    let totalSupplierPaymentsPaise = 0;
    let totalPaymentAllocationsPaise = 0;
    let totalPaymentReversalsPaise = 0;

    for (const p of allPayments) {
      // Date filtering for payments if fromDate/toDate specified
      if (fromDate && p.paymentDate < fromDate) continue;
      if (toDate && p.paymentDate > toDate) continue;

      if (p.status === 'POSTED') {
        totalSupplierPaymentsPaise += p.amountPaise;
        totalPaymentAllocationsPaise += (p.allocatedAmountPaise || 0);
      } else if (p.status === 'REVERSED') {
        totalPaymentReversalsPaise += p.amountPaise;
      }
    }

    // 11. Pagination Slicing
    const totalCount = allCalculatedTransactions.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const pagedTransactions = allCalculatedTransactions.slice(startIndex, startIndex + pageSize);

    return {
      success: true,
      supplierId: canonicalSupplierId,
      supplierName: supplierSnapshot.businessName,
      supplierSnapshot,
      filter: {
        supplierId: canonicalSupplierId,
        fromDate,
        toDate,
        transactionType: filter.transactionType,
        status: filter.status,
      },
      openingBalance: paiseToRupees(openingBalancePaise),
      openingBalancePaise,
      totalPurchaseInvoiceDebits: paiseToRupees(totalPurchaseInvoiceDebitsPaise),
      totalPurchaseInvoiceDebitsPaise,
      totalPurchaseInvoiceCredits: paiseToRupees(totalPurchaseInvoiceCreditsPaise),
      totalPurchaseInvoiceCreditsPaise,
      totalSupplierPayments: paiseToRupees(totalSupplierPaymentsPaise),
      totalSupplierPaymentsPaise,
      totalPaymentAllocations: paiseToRupees(totalPaymentAllocationsPaise),
      totalPaymentAllocationsPaise,
      totalPaymentReversals: paiseToRupees(totalPaymentReversalsPaise),
      totalPaymentReversalsPaise,
      currentOutstandingAPBalance: paiseToRupees(currentOutstandingAPPaise),
      currentOutstandingAPPaise,
      periodDebit: paiseToRupees(periodDebitPaise),
      periodDebitPaise,
      periodCredit: paiseToRupees(periodCreditPaise),
      periodCreditPaise,
      closingBalance: paiseToRupees(closingBalancePaise),
      closingBalancePaise,
      transactions: pagedTransactions,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
      },
    };
  }

  // =========================================================================
  // 2. PAYMENT HISTORY
  // =========================================================================

  /**
   * Generates a read-only supplier payment history with allocation and reversal details.
   */
  public static async getSupplierPaymentHistory(
    adminSession: AdminSession,
    filter: SupplierPaymentHistoryFilter,
    options?: SupplierPaymentReportOptions
  ): Promise<SupplierPaymentHistoryResponse> {
    // 1. Enforce Super Admin Authorization
    if (!adminSession || adminSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED: Only Super Admin users can access supplier payment history.');
    }

    // 2. Reject client injection
    this.assertNoFieldInjection(filter);

    // 3. Resolve canonical supplierId if provided
    let targetSupplierId: string | undefined = undefined;
    if (filter?.supplierId && typeof filter.supplierId === 'string' && filter.supplierId.trim()) {
      const rawSupp = filter.supplierId.trim();
      if (!options?.inMemoryFixtures) {
        targetSupplierId = (await PartyLedgerService.resolveCanonicalSupplierId(rawSupp)) || rawSupp;
      } else {
        targetSupplierId = rawSupp;
      }
    }

    // 4. Validate Date Filters
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

    // Pagination validation
    const page = Math.max(1, typeof filter.page === 'number' && Number.isFinite(filter.page) ? Math.floor(filter.page) : 1);
    const rawPageSize = filter.pageSize !== undefined ? Number(filter.pageSize) : 50;
    if (rawPageSize > 100 && !options?.isExport) {
      throw new Error('PAGE_SIZE_EXCEEDED: Page size cannot exceed 100.');
    }
    const pageSize = Math.max(1, Number.isFinite(rawPageSize) ? Math.floor(rawPageSize) : 50);

    // 5. Query Payments
    let allPayments: SupplierPayment[] = [];

    if (options?.inMemoryFixtures?.payments) {
      allPayments = [...options.inMemoryFixtures.payments];
    } else {
      try {
        const paymentsRef = collection(db, 'supplierPayments');
        const qPayments = query(paymentsRef, where('_serverTxnToken', '==', SERVER_TXN_TOKEN));
        const snap = await getDocs(qPayments);
        snap.forEach((d) => {
          const data = d.data() as SupplierPayment;
          const { _serverTxnToken, ...safePayment } = data as any;
          allPayments.push(safePayment as SupplierPayment);
        });
      } catch {
        // Fallback
      }
    }

    // 6. Apply In-Memory Filters
    if (targetSupplierId) {
      allPayments = allPayments.filter((p) => p.supplierId === targetSupplierId);
    }
    if (filter.paymentMethod) {
      allPayments = allPayments.filter((p) => p.paymentMethod === filter.paymentMethod);
    }
    if (filter.status) {
      allPayments = allPayments.filter((p) => p.status === filter.status);
    }
    if (fromDate) {
      allPayments = allPayments.filter((p) => p.paymentDate >= fromDate);
    }
    if (toDate) {
      allPayments = allPayments.filter((p) => p.paymentDate <= toDate);
    }
    if (filter.search) {
      const s = filter.search.trim().toLowerCase();
      allPayments = allPayments.filter(
        (p) =>
          (p.paymentNumber && p.paymentNumber.toLowerCase().includes(s)) ||
          (p.supplierId && p.supplierId.toLowerCase().includes(s)) ||
          (p.supplierSnapshot?.businessName && p.supplierSnapshot.businessName.toLowerCase().includes(s)) ||
          (p.referenceNumber && p.referenceNumber.toLowerCase().includes(s))
      );
    }

    // 7. Sort Descending by paymentDate, then createdAt
    allPayments.sort((a, b) => {
      const dCmp = (b.paymentDate || '').localeCompare(a.paymentDate || '');
      if (dCmp !== 0) return dCmp;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    // 8. Compute Summary Totals in Integer Paise
    let totalAmountPaise = 0;
    let totalAllocatedAmountPaise = 0;
    let totalUnallocatedAmountPaise = 0;
    let totalReversedAmountPaise = 0;

    const historyItems: SupplierPaymentHistoryItem[] = allPayments.map((p) => {
      const amtPaise = p.amountPaise;
      const allocPaise = p.allocatedAmountPaise || 0;
      const unallocPaise =
        typeof p.unallocatedAmountPaise === 'number'
          ? p.unallocatedAmountPaise
          : Math.max(0, amtPaise - allocPaise);

      if (p.status === 'POSTED') {
        totalAmountPaise += amtPaise;
        totalAllocatedAmountPaise += allocPaise;
        totalUnallocatedAmountPaise += unallocPaise;
      } else if (p.status === 'REVERSED') {
        totalReversedAmountPaise += amtPaise;
      }

      return {
        paymentId: p.paymentId,
        paymentNumber: p.paymentNumber,
        voucherNumber: p.voucherNumber || p.paymentNumber,
        supplierId: p.supplierId,
        supplierName: p.supplierSnapshot?.businessName || `Supplier (${p.supplierId})`,
        paymentMethod: p.paymentMethod,
        amount: paiseToRupees(amtPaise),
        amountPaise: amtPaise,
        status: p.status,
        accountingStatus: p.accountingStatus,
        paymentDate: p.paymentDate,
        allocatedAmount: paiseToRupees(allocPaise),
        allocatedAmountPaise: allocPaise,
        unallocatedAmount: paiseToRupees(unallocPaise),
        unallocatedAmountPaise: unallocPaise,
        reversalStatus: p.status === 'REVERSED' ? 'REVERSED' : 'NOT_REVERSED',
        isReversed: p.status === 'REVERSED',
        reversedAt: p.reversedAt || null,
        reversalJournalId: p.reversalJournalId || null,
        reversalReason: p.reversalReason || null,
        journalId: p.journalId || null,
        cashBankAccountCode: p.cashBankAccountCode,
        notes: p.notes || null,
        referenceNumber: p.referenceNumber || null,
      };
    });

    // 9. Pagination Slicing
    const totalCount = historyItems.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const pagedPayments = historyItems.slice(startIndex, startIndex + pageSize);

    return {
      success: true,
      payments: pagedPayments,
      totalCount,
      page,
      pageSize,
      totalPages,
      summary: {
        totalPaymentsCount: allPayments.length,
        totalAmount: paiseToRupees(totalAmountPaise),
        totalAmountPaise,
        totalAllocatedAmount: paiseToRupees(totalAllocatedAmountPaise),
        totalAllocatedAmountPaise,
        totalUnallocatedAmount: paiseToRupees(totalUnallocatedAmountPaise),
        totalUnallocatedAmountPaise,
        totalReversedAmount: paiseToRupees(totalReversedAmountPaise),
        totalReversedAmountPaise,
      },
    };
  }

  // =========================================================================
  // 3. PURCHASE INVOICE OUTSTANDING
  // =========================================================================

  /**
   * Returns eligible/outstanding purchase invoice information using the canonical calculation.
   * Derived from posted purchase invoices, credit/debit notes, and payment allocations.
   */
  public static async getOutstandingPurchaseInvoices(
    adminSession: AdminSession,
    supplierId: string,
    options?: SupplierPaymentReportOptions
  ): Promise<SupplierOutstandingInvoicesResponse> {
    // 1. Enforce Super Admin Authorization
    if (!adminSession || adminSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED: Only Super Admin users can view outstanding purchase invoices.');
    }

    // 2. Validate & Resolve Canonical Supplier Identity
    const rawSupplierId = typeof supplierId === 'string' ? supplierId.trim() : '';
    if (!rawSupplierId) {
      throw new Error('MISSING_SUPPLIER_ID: supplierId is required.');
    }

    let canonicalSupplierId = rawSupplierId;
    if (!options?.inMemoryFixtures) {
      const resolved = await PartyLedgerService.resolveCanonicalSupplierId(rawSupplierId);
      if (resolved) {
        canonicalSupplierId = resolved;
      }
    }

    // 3. Fetch Purchase Invoices
    let allInvoices: PurchaseInvoice[] = [];
    if (options?.inMemoryFixtures?.invoices) {
      allInvoices = options.inMemoryFixtures.invoices.filter((inv) => inv.supplierId === canonicalSupplierId);
    } else {
      try {
        const qInvoices = query(
          collection(db, 'purchaseInvoices'),
          where('supplierId', '==', canonicalSupplierId)
        );
        const invSnap = await getDocs(qInvoices);
        invSnap.forEach((d) => allInvoices.push(d.data() as PurchaseInvoice));
      } catch {
        // Fallback
      }
    }

    // 4. Fetch Posted Credit/Debit Notes for this supplier
    const notesByInvoice = new Map<string, CreditDebitNote[]>();
    if (options?.inMemoryFixtures?.notes) {
      for (const n of options.inMemoryFixtures.notes) {
        if (n.supplierId === canonicalSupplierId && n.status === 'POSTED' && n.originalInvoiceId) {
          const list = notesByInvoice.get(n.originalInvoiceId) || [];
          list.push(n);
          notesByInvoice.set(n.originalInvoiceId, list);
        }
      }
    } else {
      try {
        const qNotes = query(
          collection(db, 'creditDebitNotes'),
          where('supplierId', '==', canonicalSupplierId)
        );
        const notesSnap = await getDocs(qNotes);
        notesSnap.forEach((d) => {
          const note = d.data() as CreditDebitNote;
          if (note.status === 'POSTED' && note.originalInvoiceId) {
            const list = notesByInvoice.get(note.originalInvoiceId) || [];
            list.push(note);
            notesByInvoice.set(note.originalInvoiceId, list);
          }
        });
      } catch {
        // Fallback
      }
    }

    // 5. Fetch Allocations from posted supplier payments
    const allocatedByInvoice = new Map<string, number>();
    if (options?.inMemoryFixtures?.payments) {
      for (const pay of options.inMemoryFixtures.payments) {
        if (pay.supplierId === canonicalSupplierId && pay.status === 'POSTED' && Array.isArray(pay.allocations)) {
          for (const alloc of pay.allocations) {
            if (alloc.invoiceId && alloc.allocatedAmountPaise > 0) {
              const current = allocatedByInvoice.get(alloc.invoiceId) || 0;
              allocatedByInvoice.set(alloc.invoiceId, current + alloc.allocatedAmountPaise);
            }
          }
        }
      }
    } else {
      try {
        const qPayments = query(
          collection(db, 'supplierPayments'),
          where('supplierId', '==', canonicalSupplierId)
        );
        const paymentsSnap = await getDocs(qPayments);
        paymentsSnap.forEach((d) => {
          const pay = d.data() as SupplierPayment;
          if (pay.status === 'POSTED' && Array.isArray(pay.allocations)) {
            for (const alloc of pay.allocations) {
              if (alloc.invoiceId && alloc.allocatedAmountPaise > 0) {
                const current = allocatedByInvoice.get(alloc.invoiceId) || 0;
                allocatedByInvoice.set(alloc.invoiceId, current + alloc.allocatedAmountPaise);
              }
            }
          }
        });
      } catch {
        // Fallback
      }
    }

    // 6. Build Outstanding Invoices List
    const outstandingInvoices: OutstandingPurchaseInvoiceItem[] = [];
    let totalInvoiceAmountPaise = 0;
    let totalAllocatedAmountPaise = 0;
    let totalOutstandingAmountPaise = 0;

    for (const inv of allInvoices) {
      if (inv.invoiceStatus !== 'POSTED' || inv.accountingStatus !== 'POSTED') {
        continue;
      }

      const grandTotalPaise = Math.round((inv.grandTotal || 0) * 100);
      let adjustedTotalPaise = grandTotalPaise;

      // Apply credit/debit notes
      const notes = notesByInvoice.get(inv.invoiceId) || [];
      for (const note of notes) {
        const notePaise = Math.round((note.grandTotal || 0) * 100);
        if (note.noteType === 'PURCHASE_DEBIT_NOTE') {
          adjustedTotalPaise -= notePaise;
        } else if (note.noteType === 'PURCHASE_CREDIT_NOTE') {
          adjustedTotalPaise += notePaise;
        }
      }
      adjustedTotalPaise = Math.max(0, adjustedTotalPaise);

      // Apply payment allocations
      const alreadyAllocatedPaise = Math.max(
        allocatedByInvoice.get(inv.invoiceId) || 0,
        inv.paidAmountPaise || 0
      );
      const outstandingAmountPaise = Math.max(0, adjustedTotalPaise - alreadyAllocatedPaise);

      if (outstandingAmountPaise > 0) {
        totalInvoiceAmountPaise += adjustedTotalPaise;
        totalAllocatedAmountPaise += alreadyAllocatedPaise;
        totalOutstandingAmountPaise += outstandingAmountPaise;

        outstandingInvoices.push({
          invoiceId: inv.invoiceId,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate,
          supplierId: canonicalSupplierId,
          supplierName: inv.billingAddressSnapshot?.businessName || `Supplier (${canonicalSupplierId})`,
          invoiceTotal: paiseToRupees(grandTotalPaise),
          invoiceTotalPaise: grandTotalPaise,
          adjustedTotal: paiseToRupees(adjustedTotalPaise),
          adjustedTotalPaise,
          allocatedAmount: paiseToRupees(alreadyAllocatedPaise),
          allocatedAmountPaise: alreadyAllocatedPaise,
          outstandingAmount: paiseToRupees(outstandingAmountPaise),
          outstandingAmountPaise,
          invoiceStatus: inv.invoiceStatus,
          paymentStatus: inv.paymentStatus || (alreadyAllocatedPaise > 0 ? 'PARTIALLY_PAID' : 'UNPAID'),
        });
      }
    }

    // Sort FIFO by invoiceDate ascending, then invoiceNumber
    outstandingInvoices.sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.invoiceNumber.localeCompare(b.invoiceNumber));

    return {
      success: true,
      supplierId: canonicalSupplierId,
      invoices: outstandingInvoices,
      totalCount: outstandingInvoices.length,
      summary: {
        totalInvoiceAmount: paiseToRupees(totalInvoiceAmountPaise),
        totalInvoiceAmountPaise,
        totalAllocatedAmount: paiseToRupees(totalAllocatedAmountPaise),
        totalAllocatedAmountPaise,
        totalOutstandingAmount: paiseToRupees(totalOutstandingAmountPaise),
        totalOutstandingAmountPaise,
      },
    };
  }

  // =========================================================================
  // 4. SUPPLIER ACCOUNTING SUMMARY
  // =========================================================================

  /**
   * Generates a read-only supplier accounting summary across all suppliers or for a single supplier.
   * Total outstanding AP, total posted payments, total reversed payments, total allocated, total unallocated,
   * and count of outstanding purchase invoices.
   */
  public static async getSupplierAccountingSummary(
    adminSession: AdminSession,
    filters?: {
      supplierId?: string;
      fromDate?: string;
      toDate?: string;
    },
    options?: SupplierPaymentReportOptions
  ): Promise<SupplierAccountingSummaryResponse> {
    // 1. Enforce Super Admin Authorization
    if (!adminSession || adminSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED: Only Super Admin users can access supplier accounting summary.');
    }

    // 2. Reject client injection
    this.assertNoFieldInjection(filters);

    // 3. Resolve canonical supplierId if provided
    let targetSupplierId: string | undefined = undefined;
    let targetSupplierName: string | undefined = undefined;

    if (filters?.supplierId && typeof filters.supplierId === 'string' && filters.supplierId.trim()) {
      const rawSupp = filters.supplierId.trim();
      if (!options?.inMemoryFixtures) {
        targetSupplierId = (await PartyLedgerService.resolveCanonicalSupplierId(rawSupp)) || rawSupp;
        const snap = await PartyLedgerService.resolveSupplierSnapshot(targetSupplierId);
        targetSupplierName = snap.businessName;
      } else {
        targetSupplierId = rawSupp;
        targetSupplierName = `Supplier (${rawSupp})`;
      }
    }

    // 4. Validate Date Filters
    const fromDate = filters?.fromDate ? filters.fromDate.trim() : undefined;
    const toDate = filters?.toDate ? filters.toDate.trim() : undefined;

    if (fromDate && !isValidDateFormat(fromDate)) {
      throw new Error('INVALID_DATE_FORMAT: fromDate must be valid YYYY-MM-DD format.');
    }
    if (toDate && !isValidDateFormat(toDate)) {
      throw new Error('INVALID_DATE_FORMAT: toDate must be valid YYYY-MM-DD format.');
    }
    if (fromDate && toDate && fromDate > toDate) {
      throw new Error('INVALID_DATE_RANGE: fromDate cannot be after toDate.');
    }

    // 5. Total Outstanding AP from Account 2100 (Liability: Credit - Debit)
    const accPayable = await this.getAuthoritativeAccountsPayable(options);
    let rawLines: JournalEntryLine[] = [];
    const journalMap = new Map<string, JournalEntry>();

    if (options?.inMemoryFixtures) {
      if (options.inMemoryFixtures.journalLines) {
        rawLines = options.inMemoryFixtures.journalLines.filter(
          (l) => l.accountId === accPayable.accountId || l.accountId === 'acc_2100'
        );
      }
      if (options.inMemoryFixtures.journals) {
        for (const j of options.inMemoryFixtures.journals) {
          journalMap.set(j.journalId, j);
        }
      }
    } else {
      try {
        const linesQuery = query(
          collection(db, 'journalEntryLines'),
          where('accountId', '==', accPayable.accountId)
        );
        const linesSnap = await getDocs(linesQuery);
        linesSnap.forEach((d) => rawLines.push(d.data() as JournalEntryLine));

        const uniqueJournalIds = Array.from(new Set(rawLines.map((l) => l.journalId)));
        for (const jId of uniqueJournalIds) {
          const jSnap = await getDoc(doc(db, 'journalEntries', jId));
          if (jSnap.exists()) {
            journalMap.set(jId, jSnap.data() as JournalEntry);
          }
        }
      } catch {
        // Fallback
      }
    }

    let totalOutstandingAPPaise = 0;
    for (const line of rawLines) {
      const journal = journalMap.get(line.journalId);
      if (!journal || journal.status !== 'POSTED') continue;

      if (targetSupplierId && line.supplierId !== targetSupplierId) {
        continue;
      }

      if (fromDate && journal.journalDate < fromDate) continue;
      if (toDate && journal.journalDate > toDate) continue;

      const dPaise = parseAndValidatePaise(line.debit || 0, 'Line Debit');
      const cPaise = parseAndValidatePaise(line.credit || 0, 'Line Credit');
      totalOutstandingAPPaise += (cPaise - dPaise);
    }

    // 6. Payment Metrics from supplierPayments
    let allPayments: SupplierPayment[] = [];
    if (options?.inMemoryFixtures?.payments) {
      allPayments = [...options.inMemoryFixtures.payments];
    } else {
      try {
        const paymentsRef = collection(db, 'supplierPayments');
        const qPayments = query(paymentsRef, where('_serverTxnToken', '==', SERVER_TXN_TOKEN));
        const snap = await getDocs(qPayments);
        snap.forEach((d) => allPayments.push(d.data() as SupplierPayment));
      } catch {
        // Fallback
      }
    }

    if (targetSupplierId) {
      allPayments = allPayments.filter((p) => p.supplierId === targetSupplierId);
    }
    if (fromDate) {
      allPayments = allPayments.filter((p) => p.paymentDate >= fromDate);
    }
    if (toDate) {
      allPayments = allPayments.filter((p) => p.paymentDate <= toDate);
    }

    let totalPostedPaymentsPaise = 0;
    let totalReversedPaymentsPaise = 0;
    let totalAllocatedPaymentsPaise = 0;
    let totalUnallocatedPaymentsPaise = 0;

    for (const p of allPayments) {
      const amtPaise = p.amountPaise;
      const allocPaise = p.allocatedAmountPaise || 0;
      const unallocPaise =
        typeof p.unallocatedAmountPaise === 'number'
          ? p.unallocatedAmountPaise
          : Math.max(0, amtPaise - allocPaise);

      if (p.status === 'POSTED') {
        totalPostedPaymentsPaise += amtPaise;
        totalAllocatedPaymentsPaise += allocPaise;
        totalUnallocatedPaymentsPaise += unallocPaise;
      } else if (p.status === 'REVERSED') {
        totalReversedPaymentsPaise += amtPaise;
      }
    }

    // 7. Outstanding Purchase Invoices Count
    let allInvoices: PurchaseInvoice[] = [];
    if (options?.inMemoryFixtures?.invoices) {
      allInvoices = [...options.inMemoryFixtures.invoices];
    } else {
      try {
        const qInvoices = query(collection(db, 'purchaseInvoices'));
        const invSnap = await getDocs(qInvoices);
        invSnap.forEach((d) => allInvoices.push(d.data() as PurchaseInvoice));
      } catch {
        // Fallback
      }
    }

    if (targetSupplierId) {
      allInvoices = allInvoices.filter((inv) => inv.supplierId === targetSupplierId);
    }

    // Allocations map for invoices
    const allocatedByInvoice = new Map<string, number>();
    for (const p of allPayments) {
      if (p.status === 'POSTED' && Array.isArray(p.allocations)) {
        for (const a of p.allocations) {
          if (a.invoiceId && a.allocatedAmountPaise > 0) {
            const current = allocatedByInvoice.get(a.invoiceId) || 0;
            allocatedByInvoice.set(a.invoiceId, current + a.allocatedAmountPaise);
          }
        }
      }
    }

    let numberOfOutstandingInvoices = 0;
    for (const inv of allInvoices) {
      if (inv.invoiceStatus !== 'POSTED' || inv.accountingStatus !== 'POSTED') {
        continue;
      }
      const grandTotalPaise = Math.round((inv.grandTotal || 0) * 100);
      const paidPaise = Math.max(
        allocatedByInvoice.get(inv.invoiceId) || 0,
        inv.paidAmountPaise || 0
      );
      const outstandingPaise = Math.max(0, grandTotalPaise - paidPaise);
      if (outstandingPaise > 0) {
        numberOfOutstandingInvoices++;
      }
    }

    return {
      success: true,
      supplierId: targetSupplierId,
      supplierName: targetSupplierName,
      totalOutstandingAP: paiseToRupees(totalOutstandingAPPaise),
      totalOutstandingAPPaise,
      totalPostedPayments: paiseToRupees(totalPostedPaymentsPaise),
      totalPostedPaymentsPaise,
      totalReversedPayments: paiseToRupees(totalReversedPaymentsPaise),
      totalReversedPaymentsPaise,
      totalAllocatedPayments: paiseToRupees(totalAllocatedPaymentsPaise),
      totalAllocatedPaymentsPaise,
      totalUnallocatedPayments: paiseToRupees(totalUnallocatedPaymentsPaise),
      totalUnallocatedPaymentsPaise,
      numberOfOutstandingInvoices,
    };
  }

  // =========================================================================
  // 5. EXPORT UTILITIES (PHASE 5.8 PART 6)
  // =========================================================================

  /**
   * Export Supplier Statement to safely escaped CSV with complete metadata
   */
  public static async exportSupplierStatementCsv(
    adminSession: AdminSession,
    filter: SupplierStatementFilter,
    options?: SupplierPaymentReportOptions
  ): Promise<{ filename: string; csv: string }> {
    const statement = await this.getSupplierStatement(
      adminSession,
      { ...filter, pageSize: 10000 },
      { ...options, isExport: true }
    );

    const nowIso = new Date().toISOString();
    const dateRangeStr = `${filter.fromDate || 'All Time'} to ${filter.toDate || 'Present'}`;

    const metadata: string[] = [
      `REPORT: Supplier Statement of Account`,
      `SUPPLIER NAME: ${statement.supplierName}`,
      `SUPPLIER ID: ${statement.supplierId}`,
      `GENERATED AT: ${nowIso}`,
      `DATE RANGE: ${dateRangeStr}`,
      `CURRENCY: INR`,
      `OPENING BALANCE (INR): ${(statement.openingBalancePaise / 100).toFixed(2)}`,
      `TOTAL PURCHASES (CREDITS) (INR): ${(statement.totalPurchaseInvoiceCreditsPaise / 100).toFixed(2)}`,
      `TOTAL PAYMENTS (DEBITS) (INR): ${(statement.totalSupplierPaymentsPaise / 100).toFixed(2)}`,
      `TOTAL ALLOCATED (INR): ${(statement.totalPaymentAllocationsPaise / 100).toFixed(2)}`,
      `TOTAL REVERSED (INR): ${(statement.totalPaymentReversalsPaise / 100).toFixed(2)}`,
      `CLOSING BALANCE (INR): ${(statement.closingBalancePaise / 100).toFixed(2)}`,
      `CURRENT OUTSTANDING AP (INR): ${(statement.currentOutstandingAPPaise / 100).toFixed(2)}`,
    ];

    const headers = [
      'Date',
      'Transaction Type',
      'Document Ref / Number',
      'Journal Voucher',
      'Particulars / Narration',
      'Debit (INR)',
      'Credit (INR)',
      'Running Balance (INR)',
      'Status',
    ];

    const rows = statement.transactions.map((tx) => [
      tx.date,
      tx.transactionType,
      tx.referenceNumber || tx.referenceId || '',
      tx.voucherNumber || '',
      tx.narration || '',
      (tx.debitPaise / 100).toFixed(2),
      (tx.creditPaise / 100).toFixed(2),
      (tx.runningBalancePaise / 100).toFixed(2),
      tx.status,
    ]);

    const cleanSuppId = statement.supplierId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `supplier_statement_${cleanSuppId}_${filter.fromDate || 'all'}_to_${filter.toDate || 'now'}.csv`;
    const csv = generateCsv(headers, rows, metadata);

    return { filename, csv };
  }

  /**
   * Export Supplier Payment History to safely escaped CSV with complete metadata
   */
  public static async exportSupplierPaymentHistoryCsv(
    adminSession: AdminSession,
    filter: SupplierPaymentHistoryFilter,
    options?: SupplierPaymentReportOptions
  ): Promise<{ filename: string; csv: string }> {
    const history = await this.getSupplierPaymentHistory(
      adminSession,
      { ...filter, pageSize: 10000 },
      { ...options, isExport: true }
    );

    const nowIso = new Date().toISOString();
    const dateRangeStr = `${filter.fromDate || 'All Time'} to ${filter.toDate || 'Present'}`;

    const metadata: string[] = [
      `REPORT: Supplier Payment History`,
      `SUPPLIER ID: ${filter.supplierId || 'All Suppliers'}`,
      `GENERATED AT: ${nowIso}`,
      `DATE RANGE: ${dateRangeStr}`,
      `CURRENCY: INR`,
      `TOTAL PAYMENTS COUNT: ${history.summary.totalPaymentsCount}`,
      `TOTAL AMOUNT (INR): ${(history.summary.totalAmountPaise / 100).toFixed(2)}`,
      `TOTAL ALLOCATED AMOUNT (INR): ${(history.summary.totalAllocatedAmountPaise / 100).toFixed(2)}`,
      `TOTAL UNALLOCATED AMOUNT (INR): ${(history.summary.totalUnallocatedAmountPaise / 100).toFixed(2)}`,
      `TOTAL REVERSED AMOUNT (INR): ${(history.summary.totalReversedAmountPaise / 100).toFixed(2)}`,
    ];

    const headers = [
      'Payment Date',
      'Payment Number',
      'Payment ID',
      'Voucher Number',
      'Supplier ID',
      'Supplier Name',
      'Payment Method',
      'Amount (INR)',
      'Allocated Amount (INR)',
      'Unallocated Amount (INR)',
      'Status',
      'Reversal Status',
      'Reversed At',
      'Reversal Reason',
      'Reversal Journal ID',
    ];

    const rows = history.payments.map((p) => [
      p.paymentDate,
      p.paymentNumber || p.voucherNumber || p.paymentId,
      p.paymentId,
      p.voucherNumber,
      p.supplierId,
      p.supplierName,
      p.paymentMethod,
      (p.amountPaise / 100).toFixed(2),
      (p.allocatedAmountPaise / 100).toFixed(2),
      (p.unallocatedAmountPaise / 100).toFixed(2),
      p.status,
      p.reversalStatus,
      p.reversedAt || '',
      p.reversalReason || '',
      p.reversalJournalId || '',
    ]);

    const suppPart = filter.supplierId ? filter.supplierId.replace(/[^a-zA-Z0-9_-]/g, '_') : 'all';
    const filename = `supplier_payments_${suppPart}_${filter.fromDate || 'all'}_to_${filter.toDate || 'now'}.csv`;
    const csv = generateCsv(headers, rows, metadata);

    return { filename, csv };
  }

  /**
   * Export Outstanding Purchase Invoices to safely escaped CSV with complete metadata
   */
  public static async exportOutstandingPurchaseInvoicesCsv(
    adminSession: AdminSession,
    supplierId: string,
    options?: SupplierPaymentReportOptions
  ): Promise<{ filename: string; csv: string }> {
    const outstanding = await this.getOutstandingPurchaseInvoices(adminSession, supplierId, options);

    const nowIso = new Date().toISOString();

    const metadata: string[] = [
      `REPORT: Outstanding Purchase Invoices`,
      `SUPPLIER ID: ${outstanding.supplierId}`,
      `GENERATED AT: ${nowIso}`,
      `CURRENCY: INR`,
      `TOTAL DUE INVOICES: ${outstanding.totalCount}`,
      `TOTAL INVOICE AMOUNT (INR): ${(outstanding.summary.totalInvoiceAmountPaise / 100).toFixed(2)}`,
      `TOTAL ALLOCATED AMOUNT (INR): ${(outstanding.summary.totalAllocatedAmountPaise / 100).toFixed(2)}`,
      `TOTAL OUTSTANDING AP (INR): ${(outstanding.summary.totalOutstandingAmountPaise / 100).toFixed(2)}`,
    ];

    const headers = [
      'Invoice Number',
      'Invoice Date',
      'Supplier ID',
      'Supplier Name',
      'Invoice Total (INR)',
      'Adjusted Total (INR)',
      'Allocated Amount (INR)',
      'Outstanding Amount (INR)',
      'Invoice Status',
      'Payment Status',
    ];

    const rows = outstanding.invoices.map((inv) => [
      inv.invoiceNumber,
      inv.invoiceDate,
      inv.supplierId,
      inv.supplierName,
      (inv.invoiceTotalPaise / 100).toFixed(2),
      (inv.adjustedTotalPaise / 100).toFixed(2),
      (inv.allocatedAmountPaise / 100).toFixed(2),
      (inv.outstandingAmountPaise / 100).toFixed(2),
      inv.invoiceStatus,
      inv.paymentStatus,
    ]);

    const cleanSuppId = outstanding.supplierId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `outstanding_invoices_${cleanSuppId}_${nowIso.split('T')[0]}.csv`;
    const csv = generateCsv(headers, rows, metadata);

    return { filename, csv };
  }

  /**
   * Export Supplier Accounting Summary to safely escaped CSV with complete metadata
   */
  public static async exportSupplierAccountingSummaryCsv(
    adminSession: AdminSession,
    filters?: {
      supplierId?: string;
      fromDate?: string;
      toDate?: string;
    },
    options?: SupplierPaymentReportOptions
  ): Promise<{ filename: string; csv: string }> {
    const summary = await this.getSupplierAccountingSummary(adminSession, filters, options);

    const nowIso = new Date().toISOString();
    const dateRangeStr = `${filters?.fromDate || 'All Time'} to ${filters?.toDate || 'Present'}`;

    const metadata: string[] = [
      `REPORT: Supplier Accounting Summary`,
      `SUPPLIER ID: ${summary.supplierId || 'All Suppliers'}`,
      `SUPPLIER NAME: ${summary.supplierName || 'All Suppliers'}`,
      `GENERATED AT: ${nowIso}`,
      `DATE RANGE: ${dateRangeStr}`,
      `CURRENCY: INR`,
    ];

    const headers = [
      'Accounting Metric',
      'Value (INR / Count)',
      'Integer Paise / Count',
      'Accounting Control & Notes',
    ];

    const rows = [
      [
        'Total Outstanding AP Balance',
        (summary.totalOutstandingAPPaise / 100).toFixed(2),
        summary.totalOutstandingAPPaise,
        'Net trade payables liability (Account 2100)',
      ],
      [
        'Total Posted Payments',
        (summary.totalPostedPaymentsPaise / 100).toFixed(2),
        summary.totalPostedPaymentsPaise,
        'All posted disbursements to supplier',
      ],
      [
        'Total Allocated Payments',
        (summary.totalAllocatedPaymentsPaise / 100).toFixed(2),
        summary.totalAllocatedPaymentsPaise,
        'Matched and applied against purchase invoices',
      ],
      [
        'Total Unallocated Payments',
        (summary.totalUnallocatedPaymentsPaise / 100).toFixed(2),
        summary.totalUnallocatedPaymentsPaise,
        'Payments on account / advance balances',
      ],
      [
        'Total Reversed Payments',
        (summary.totalReversedPaymentsPaise / 100).toFixed(2),
        summary.totalReversedPaymentsPaise,
        'Voided/cancelled payments with balanced reversal journals',
      ],
      [
        'Outstanding Purchase Invoices Count',
        summary.numberOfOutstandingInvoices,
        summary.numberOfOutstandingInvoices,
        'Number of purchase bills with remaining payable balance',
      ],
    ];

    const suppPart = summary.supplierId ? summary.supplierId.replace(/[^a-zA-Z0-9_-]/g, '_') : 'all';
    const filename = `supplier_summary_${suppPart}_${filters?.fromDate || 'all'}_to_${filters?.toDate || 'now'}.csv`;
    const csv = generateCsv(headers, rows, metadata);

    return { filename, csv };
  }
}
