/**
 * MR FUTKAR — Customer Accounts Receivable (AR) Report Service (Phase 5.9 Part 2)
 * Server-authoritative, read-only customer AR reporting layer for Account 1300.
 * Strictly integer paise accounting. Zero data mutations.
 * Derives financial truth strictly from posted accounting journals, sales invoices,
 * customer receipts, and credit/debit notes.
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
  CustomerReceipt,
  CustomerReceiptStatus,
} from '../src/types/customerReceipt';
import { SalesInvoice } from '../src/types/invoice';
import { CreditDebitNote } from '../src/types/creditDebitNote';
import {
  CustomerStatementFilter,
  CustomerStatementResponse,
  CustomerStatementTransaction,
  CustomerStatementTransactionType,
  CustomerReceiptHistoryFilter,
  CustomerReceiptHistoryResponse,
  CustomerReceiptHistoryItem,
  OutstandingSalesInvoiceItem,
  CustomerOutstandingInvoicesResponse,
  CustomerAccountingSummaryResponse,
  CustomerSnapshot,
} from '../src/types/customerReport';
import { PartyLedgerService } from './partyLedgerService';
import { generateCsv } from './reportUtils';

export interface CustomerReportOptions {
  /** Optional flag when called internally by export routines to allow retrieving full report dataset */
  isExport?: boolean;
  /** Optional in-memory test fixtures to evaluate deterministic scenarios without database access */
  inMemoryFixtures?: {
    receipts?: CustomerReceipt[];
    invoices?: SalesInvoice[];
    notes?: CreditDebitNote[];
    journals?: JournalEntry[];
    journalLines?: JournalEntryLine[];
    retailers?: any[];
    accounts?: Account[];
  };
}

export class CustomerReportService {
  /**
   * Helper: Resolve Authoritative Account 1300 (Accounts Receivable)
   */
  private static async getAuthoritativeAccountsReceivable(options?: CustomerReportOptions): Promise<Account> {
    if (options?.inMemoryFixtures?.accounts) {
      const match = options.inMemoryFixtures.accounts.find((a) => a.accountCode === '1300');
      if (match) return match;
    }

    try {
      const directDocRef = doc(db, 'chartOfAccounts', 'acc_1300');
      const directSnap = await getDoc(directDocRef);
      if (directSnap.exists()) {
        return directSnap.data() as Account;
      }

      const codeQuery = query(collection(db, 'chartOfAccounts'), where('accountCode', '==', '1300'));
      const codeSnap = await getDocs(codeQuery);
      if (!codeSnap.empty) {
        return codeSnap.docs[0].data() as Account;
      }
    } catch {
      // Fallback default system account
    }

    return {
      accountId: 'acc_1300',
      accountCode: '1300',
      accountName: 'Accounts Receivable',
      accountType: 'ASSET',
      parentAccountId: null,
      normalBalance: 'DEBIT',
      isActive: true,
      isSystemAccount: true,
      description: 'Kirana retailer receivables from wholesale FMCG goods orders',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'SYSTEM_BOOTSTRAP',
      updatedBy: 'SYSTEM_BOOTSTRAP',
    };
  }

  /**
   * Helper: Resolve Customer Profile Snapshot
   */
  private static async resolveCustomerSnapshot(customerId: string): Promise<CustomerSnapshot> {
    try {
      const rRef = doc(db, 'retailers', customerId);
      const rSnap = await getDoc(rRef);
      if (rSnap.exists()) {
        const data = rSnap.data();
        return {
          customerId,
          shopName: (data.shopName || data.businessName || data.ownerName || 'Kirana Store').trim(),
          ownerName: (data.ownerName || data.contactName || 'Kirana Owner').trim(),
          mobile: (data.mobileNumber || data.phone || '').trim(),
          fullAddress: (data.shopAddress || data.deliveryAddress || 'Delhi').trim(),
          city: (data.city || 'Delhi').trim(),
          state: (data.state || 'Delhi').trim(),
          pincode: (data.pincode || '110053').trim(),
          gstin: data.gstNumber || data.gstin || undefined,
          authUid: data.authUid || data.userId || undefined,
        };
      }
    } catch {
      // Fallback
    }

    try {
      const qRet = query(collection(db, 'retailers'), where('retailerId', '==', customerId));
      const retSnap = await getDocs(qRet);
      if (!retSnap.empty) {
        const data = retSnap.docs[0].data();
        return {
          customerId,
          shopName: (data.shopName || data.businessName || data.ownerName || 'Kirana Store').trim(),
          ownerName: (data.ownerName || data.contactName || 'Kirana Owner').trim(),
          mobile: (data.mobileNumber || data.phone || '').trim(),
          fullAddress: (data.shopAddress || data.deliveryAddress || 'Delhi').trim(),
          city: (data.city || 'Delhi').trim(),
          state: (data.state || 'Delhi').trim(),
          pincode: (data.pincode || '110053').trim(),
          gstin: data.gstNumber || data.gstin || undefined,
          authUid: data.authUid || data.userId || undefined,
        };
      }
    } catch {
      // Fallback
    }

    return {
      customerId,
      shopName: `Retailer (${customerId})`,
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
      'totalOutstandingAR',
      'totalOutstandingARPaise',
      'customerARBalance',
      'customerARBalancePaise',
      'periodDebit',
      'periodDebitPaise',
      'periodCredit',
      'periodCreditPaise',
      'outstandingAmount',
      'outstandingAmountPaise',
      'amountPaise',
      'allocatedAmountPaise',
      'unallocatedAmountPaise',
      'totalPostedReceipts',
      'totalPostedReceiptsPaise',
      'totalAllocatedReceipts',
      'totalAllocatedReceiptsPaise',
      'totalUnallocatedReceipts',
      'totalUnallocatedReceiptsPaise',
      'totalReversedReceipts',
      'totalReversedReceiptsPaise',
      'dueBillsCount',
      'numberOfOutstandingInvoices',
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

  /**
   * Helper: Extract clean reference number from journal narration or voucher
   */
  private static extractReferenceNumber(journal: JournalEntry): string | undefined {
    const rawRef = (journal as any).referenceNumber;
    if (rawRef) return rawRef;
    if (!journal.narration) return journal.referenceId || undefined;
    const match =
      journal.narration.match(/(?:SI|PI|CN|DN|RV|CR|SP|PV|INV|ORD)-[0-9]{4,}-[0-9]+/i) ||
      journal.narration.match(/(?:SI|PI|CN|DN|RV|CR|SP|PV|INV|CR-REC)-[A-Z0-9-]+/i);
    return match ? match[0] : journal.referenceId || undefined;
  }

  // =========================================================================
  // 1. CUSTOMER STATEMENT (Account 1300)
  // =========================================================================

  /**
   * Generates a read-only, server-authoritative customer statement.
   * Derived strictly from posted accounting journals and Account 1300 lines.
   */
  public static async getCustomerStatement(
    adminSession: AdminSession,
    filter: CustomerStatementFilter,
    options?: CustomerReportOptions
  ): Promise<CustomerStatementResponse> {
    // 1. Enforce Super Admin Authorization
    if (!adminSession || adminSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED: Only Super Admin users can access customer statements.');
    }

    // 2. Reject client injection
    this.assertNoFieldInjection(filter);

    // 3. Validate & Resolve Canonical Customer Identity
    const rawCustomerId = typeof filter?.customerId === 'string' ? filter.customerId.trim() : '';
    if (!rawCustomerId) {
      throw new Error('MISSING_CUSTOMER_ID: customerId is required for customer statement.');
    }

    let canonicalCustomerId = rawCustomerId;
    if (!options?.inMemoryFixtures) {
      const resolved = await PartyLedgerService.resolveCanonicalRetailerId(rawCustomerId);
      if (resolved) {
        canonicalCustomerId = resolved;
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

    // 5. Fetch Customer Snapshot
    let customerSnapshot: CustomerSnapshot = {
      customerId: canonicalCustomerId,
      shopName: `Retailer (${canonicalCustomerId})`,
    };

    if (options?.inMemoryFixtures?.retailers) {
      const match = options.inMemoryFixtures.retailers.find(
        (r) => r.customerId === canonicalCustomerId || r.retailerId === canonicalCustomerId || r.id === canonicalCustomerId
      );
      if (match) {
        customerSnapshot = {
          customerId: canonicalCustomerId,
          shopName: match.shopName || match.businessName || match.name || `Retailer (${canonicalCustomerId})`,
          ownerName: match.ownerName || match.contactName,
          mobile: match.mobile || match.mobileNumber || match.phone,
          fullAddress: match.fullAddress || match.shopAddress || match.deliveryAddress,
          city: match.city,
          state: match.state,
          pincode: match.pincode,
          gstin: match.gstin || match.gstNumber,
          authUid: match.authUid || match.userId,
        };
      }
    } else {
      const resolvedSnap = await this.resolveCustomerSnapshot(canonicalCustomerId);
      customerSnapshot = {
        customerId: canonicalCustomerId,
        shopName: resolvedSnap.shopName,
        ownerName: resolvedSnap.ownerName,
        mobile: resolvedSnap.mobile,
        fullAddress: resolvedSnap.fullAddress,
        city: resolvedSnap.city,
        state: resolvedSnap.state,
        pincode: resolvedSnap.pincode,
        gstin: resolvedSnap.gstin,
        authUid: resolvedSnap.authUid,
      };
    }

    // 6. Resolve Accounts Receivable Account (1300)
    const accReceivable = await this.getAuthoritativeAccountsReceivable(options);

    // 7. Retrieve Journal Lines for Account 1300
    let rawLines: JournalEntryLine[] = [];
    const journalMap = new Map<string, JournalEntry>();

    if (options?.inMemoryFixtures) {
      if (options.inMemoryFixtures.journalLines) {
        rawLines = options.inMemoryFixtures.journalLines.filter(
          (l) => l.accountId === accReceivable.accountId || l.accountId === 'acc_1300'
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
        where('accountId', '==', accReceivable.accountId)
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

    // Caches for source document resolution when verifying customer association
    const invoiceDocCache = new Map<string, any>();
    const noteDocCache = new Map<string, any>();
    const receiptDocCache = new Map<string, any>();

    // 8. Partition lines into Opening Balance and Period Lines
    // Asset Account 1300 normal balance is DEBIT:
    // Debit increases receivable (+), Credit reduces receivable (-)
    let openingBalancePaise = 0;
    const periodItems: { line: JournalEntryLine; journal: JournalEntry }[] = [];

    // Also track all-time lines for this customer to derive current total AR balance
    let allTimeDebitPaise = 0;
    let allTimeCreditPaise = 0;

    for (const line of rawLines) {
      const journal = journalMap.get(line.journalId);
      if (!journal || journal.status !== 'POSTED') continue;

      // Match canonical customer identity
      let matchesCustomer = false;
      if (line.customerId === canonicalCustomerId) {
        matchesCustomer = true;
      } else if (options?.inMemoryFixtures) {
        // In-memory fixtures resolution
        if (journal.referenceType === 'SALES_INVOICE' && journal.referenceId && options.inMemoryFixtures.invoices) {
          const inv = options.inMemoryFixtures.invoices.find((i) => i.invoiceId === journal.referenceId);
          if (inv && (inv.customerId === canonicalCustomerId || inv.customerId === rawCustomerId)) {
            matchesCustomer = true;
          }
        } else if (journal.referenceType === 'CUSTOMER_RECEIPT' && journal.referenceId && options.inMemoryFixtures.receipts) {
          const rec = options.inMemoryFixtures.receipts.find((r) => r.receiptId === journal.referenceId);
          if (rec && (rec.customerId === canonicalCustomerId || rec.customerId === rawCustomerId)) {
            matchesCustomer = true;
          }
        } else if (journal.referenceType === 'CREDIT_DEBIT_NOTE' && journal.referenceId && options.inMemoryFixtures.notes) {
          const note = options.inMemoryFixtures.notes.find((n) => n.noteId === journal.referenceId);
          if (note && ((note as any).customerId === canonicalCustomerId || (note as any).partyId === canonicalCustomerId)) {
            matchesCustomer = true;
          }
        } else if (journal.referenceType === 'JOURNAL_REVERSAL' || journal.reversalOfJournalId) {
          const origJournalId = journal.reversalOfJournalId || journal.referenceId;
          const origJ = origJournalId ? journalMap.get(origJournalId) : null;
          if (origJ && (origJ as any).customerId === canonicalCustomerId) {
            matchesCustomer = true;
          }
        }
      } else {
        // Live resolution through PartyLedgerService source document matching
        if (journal.referenceType === 'SALES_INVOICE' && journal.referenceId) {
          let invData = invoiceDocCache.get(journal.referenceId);
          if (invData === undefined) {
            const invSnap = await getDoc(doc(db, 'salesInvoices', journal.referenceId));
            invData = invSnap.exists() ? invSnap.data() : null;
            invoiceDocCache.set(journal.referenceId, invData);
          }
          if (invData && invData.customerId) {
            const resolved = await PartyLedgerService.resolveCanonicalRetailerId(invData.customerId);
            if (resolved === canonicalCustomerId || invData.customerId === canonicalCustomerId) {
              matchesCustomer = true;
            }
          }
        } else if (journal.referenceType === 'CUSTOMER_RECEIPT' && journal.referenceId) {
          let recData = receiptDocCache.get(journal.referenceId);
          if (recData === undefined) {
            try {
              const recSnap = await getDoc(doc(db, 'customerReceipts', journal.referenceId));
              recData = recSnap.exists() ? recSnap.data() : null;
            } catch {
              recData = null;
            }
            receiptDocCache.set(journal.referenceId, recData);
          }
          const rawPartyId = recData?.customerId || (journal as any).customerId;
          if (rawPartyId) {
            const resolved = await PartyLedgerService.resolveCanonicalRetailerId(rawPartyId);
            if (resolved === canonicalCustomerId || rawPartyId === canonicalCustomerId) {
              matchesCustomer = true;
            }
          }
        } else if (journal.referenceType === 'CREDIT_DEBIT_NOTE' && journal.referenceId) {
          let noteData = noteDocCache.get(journal.referenceId);
          if (noteData === undefined) {
            const noteSnap = await getDoc(doc(db, 'creditDebitNotes', journal.referenceId));
            noteData = noteSnap.exists() ? noteSnap.data() : null;
            noteDocCache.set(journal.referenceId, noteData);
          }
          const rawPartyId = noteData?.customerId || noteData?.partyId;
          if (rawPartyId) {
            const resolved = await PartyLedgerService.resolveCanonicalRetailerId(rawPartyId);
            if (resolved === canonicalCustomerId || rawPartyId === canonicalCustomerId) {
              matchesCustomer = true;
            }
          }
        } else if (journal.referenceType === 'JOURNAL_REVERSAL' || journal.reversalOfJournalId) {
          const origJournalId = journal.reversalOfJournalId || journal.referenceId;
          if (origJournalId) {
            const origJ = journalMap.get(origJournalId);
            if (origJ && (origJ as any).customerId === canonicalCustomerId) {
              matchesCustomer = true;
            }
          }
        }
      }

      if (!matchesCustomer) {
        continue;
      }

      const dPaise = parseAndValidatePaise(line.debit || 0, 'Line Debit');
      const cPaise = parseAndValidatePaise(line.credit || 0, 'Line Credit');

      allTimeDebitPaise += dPaise;
      allTimeCreditPaise += cPaise;

      // Asset Account 1300: Debit increases (+), Credit reduces (-)
      if (fromDate && journal.journalDate < fromDate) {
        openingBalancePaise += (dPaise - cPaise);
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
    let totalSalesInvoiceDebitsPaise = 0;
    let totalSalesInvoiceCreditsPaise = 0;

    const allCalculatedTransactions: CustomerStatementTransaction[] = [];

    for (const item of periodItems) {
      const dPaise = parseAndValidatePaise(item.line.debit || 0, 'Line Debit');
      const cPaise = parseAndValidatePaise(item.line.credit || 0, 'Line Credit');

      periodDebitPaise += dPaise;
      periodCreditPaise += cPaise;
      runningBalancePaise += (dPaise - cPaise);

      // Determine Transaction Type
      let txType: CustomerStatementTransactionType = 'JOURNAL_ENTRY';
      if (item.journal.referenceType === 'SALES_INVOICE') {
        txType = 'SALES_INVOICE';
        totalSalesInvoiceDebitsPaise += dPaise;
        totalSalesInvoiceCreditsPaise += cPaise;
      } else if (item.journal.referenceType === 'CREDIT_DEBIT_NOTE') {
        txType = item.line.credit > 0 ? 'SALES_CREDIT_NOTE' : 'SALES_DEBIT_NOTE';
      } else if (
        item.journal.referenceType === 'CUSTOMER_RECEIPT' ||
        item.journal.voucherType === 'RECEIPT' ||
        (item.journal.voucherType as string) === 'RV'
      ) {
        txType = 'CUSTOMER_RECEIPT';
      } else if (item.journal.voucherType === 'CN' || item.journal.voucherType === 'CREDIT_NOTE') {
        txType = 'SALES_CREDIT_NOTE';
      } else if (item.journal.voucherType === 'DN' || item.journal.voucherType === 'DEBIT_NOTE') {
        txType = 'SALES_DEBIT_NOTE';
      }

      // Optional transactionType filter
      if (filter.transactionType && txType !== filter.transactionType) {
        continue;
      }

      // Optional status filter
      if (filter.status && item.journal.status !== filter.status) {
        continue;
      }

      const refNumber = this.extractReferenceNumber(item.journal);

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

    const closingBalancePaise = openingBalancePaise + periodDebitPaise - periodCreditPaise;
    const currentOutstandingARPaise = allTimeDebitPaise - allTimeCreditPaise;

    // 10. Query Customer Receipts for Receipt/Allocation/Reversal aggregates
    let allReceipts: CustomerReceipt[] = [];
    if (options?.inMemoryFixtures?.receipts) {
      allReceipts = options.inMemoryFixtures.receipts.filter(
        (r) => r.customerId === canonicalCustomerId || r.customerId === rawCustomerId
      );
    } else {
      try {
        const qReceipts = query(
          collection(db, 'customerReceipts'),
          where('customerId', '==', canonicalCustomerId)
        );
        const snapReceipts = await getDocs(qReceipts);
        snapReceipts.forEach((d) => allReceipts.push(d.data() as CustomerReceipt));
      } catch {
        // Fallback
      }
    }

    let totalCustomerReceiptsPaise = 0;
    let totalReceiptAllocationsPaise = 0;
    let totalReceiptReversalsPaise = 0;

    for (const r of allReceipts) {
      if (fromDate && r.receiptDate < fromDate) continue;
      if (toDate && r.receiptDate > toDate) continue;

      if (r.status === 'POSTED') {
        totalCustomerReceiptsPaise += r.amountPaise;
        totalReceiptAllocationsPaise += (r.allocatedAmountPaise || 0);
      } else if (r.status === 'REVERSED') {
        totalReceiptReversalsPaise += r.amountPaise;
      }
    }

    // 11. Pagination Slicing
    const totalCount = allCalculatedTransactions.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const pagedTransactions = allCalculatedTransactions.slice(startIndex, startIndex + pageSize);

    return {
      success: true,
      customerId: canonicalCustomerId,
      customerName: customerSnapshot.shopName,
      customerSnapshot,
      filter: {
        customerId: canonicalCustomerId,
        fromDate,
        toDate,
        transactionType: filter.transactionType,
        status: filter.status,
      },
      openingBalance: paiseToRupees(openingBalancePaise),
      openingBalancePaise,
      totalSalesInvoiceDebits: paiseToRupees(totalSalesInvoiceDebitsPaise),
      totalSalesInvoiceDebitsPaise,
      totalSalesInvoiceCredits: paiseToRupees(totalSalesInvoiceCreditsPaise),
      totalSalesInvoiceCreditsPaise,
      totalCustomerReceipts: paiseToRupees(totalCustomerReceiptsPaise),
      totalCustomerReceiptsPaise,
      totalReceiptAllocations: paiseToRupees(totalReceiptAllocationsPaise),
      totalReceiptAllocationsPaise,
      totalReceiptReversals: paiseToRupees(totalReceiptReversalsPaise),
      totalReceiptReversalsPaise,
      currentOutstandingARBalance: paiseToRupees(currentOutstandingARPaise),
      currentOutstandingARPaise,
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
  // 2. CUSTOMER RECEIPT HISTORY
  // =========================================================================

  /**
   * Generates a read-only customer receipt history with allocation and reversal details.
   */
  public static async getCustomerReceiptHistory(
    adminSession: AdminSession,
    filter: CustomerReceiptHistoryFilter,
    options?: CustomerReportOptions
  ): Promise<CustomerReceiptHistoryResponse> {
    // 1. Enforce Super Admin Authorization
    if (!adminSession || adminSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED: Only Super Admin users can access customer receipt history.');
    }

    // 2. Reject client injection
    this.assertNoFieldInjection(filter);

    // 3. Resolve canonical customerId if provided
    let targetCustomerId: string | undefined = undefined;
    if (filter?.customerId !== undefined) {
      const rawCustomer = typeof filter.customerId === 'string' ? filter.customerId.trim() : '';
      if (!rawCustomer) {
        throw new Error('MISSING_CUSTOMER_ID: customerId cannot be empty if specified.');
      }
      if (!options?.inMemoryFixtures) {
        targetCustomerId = (await PartyLedgerService.resolveCanonicalRetailerId(rawCustomer)) || rawCustomer;
      } else {
        targetCustomerId = rawCustomer;
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

    // 5. Query Customer Receipts
    let allReceipts: CustomerReceipt[] = [];

    if (options?.inMemoryFixtures?.receipts) {
      allReceipts = [...options.inMemoryFixtures.receipts];
    } else {
      try {
        const receiptsRef = collection(db, 'customerReceipts');
        const qReceipts = query(receiptsRef, where('_serverTxnToken', '==', SERVER_TXN_TOKEN));
        const snap = await getDocs(qReceipts);
        snap.forEach((d) => {
          const data = d.data() as CustomerReceipt;
          const { _serverTxnToken, ...safeReceipt } = data as any;
          allReceipts.push(safeReceipt as CustomerReceipt);
        });
      } catch {
        // Fallback
      }
    }

    // 6. Apply In-Memory Filters
    if (targetCustomerId) {
      allReceipts = allReceipts.filter(
        (r) => r.customerId === targetCustomerId || (r.customerSnapshot && (r.customerSnapshot as any).retailerId === targetCustomerId)
      );
    }
    if (filter.paymentMethod) {
      allReceipts = allReceipts.filter((r) => r.paymentMethod === filter.paymentMethod);
    }
    if (filter.status) {
      allReceipts = allReceipts.filter((r) => r.status === filter.status);
    }
    if (fromDate) {
      allReceipts = allReceipts.filter((r) => (r.receiptDate || '') >= fromDate);
    }
    if (toDate) {
      allReceipts = allReceipts.filter((r) => (r.receiptDate || '') <= toDate);
    }
    if (filter.search) {
      const s = filter.search.trim().toLowerCase();
      allReceipts = allReceipts.filter(
        (r) =>
          (r.receiptNumber && r.receiptNumber.toLowerCase().includes(s)) ||
          (r.customerId && r.customerId.toLowerCase().includes(s)) ||
          (r.customerSnapshot?.businessName && r.customerSnapshot.businessName.toLowerCase().includes(s)) ||
          (r.referenceNumber && r.referenceNumber.toLowerCase().includes(s))
      );
    }

    // 7. Sort Descending by receiptDate, then createdAt
    allReceipts.sort((a, b) => {
      const dCmp = (b.receiptDate || '').localeCompare(a.receiptDate || '');
      if (dCmp !== 0) return dCmp;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    // 8. Compute Summary Totals in Integer Paise
    let totalAmountPaise = 0;
    let totalAllocatedAmountPaise = 0;
    let totalUnallocatedAmountPaise = 0;
    let totalReversedAmountPaise = 0;

    const historyItems: CustomerReceiptHistoryItem[] = allReceipts.map((r) => {
      const amtPaise = r.amountPaise;
      const allocPaise = r.allocatedAmountPaise || 0;
      const unallocPaise =
        typeof r.unallocatedAmountPaise === 'number'
          ? r.unallocatedAmountPaise
          : Math.max(0, amtPaise - allocPaise);

      if (r.status === 'POSTED') {
        totalAmountPaise += amtPaise;
        totalAllocatedAmountPaise += allocPaise;
        totalUnallocatedAmountPaise += unallocPaise;
      } else if (r.status === 'REVERSED') {
        totalReversedAmountPaise += amtPaise;
      }

      return {
        receiptId: r.receiptId,
        receiptNumber: r.receiptNumber,
        voucherNumber: r.voucherNumber || r.receiptNumber,
        customerId: r.customerId,
        customerName: r.customerSnapshot?.businessName || `Retailer (${r.customerId})`,
        customerSnapshot: r.customerSnapshot,
        paymentMethod: r.paymentMethod,
        amount: paiseToRupees(amtPaise),
        amountPaise: amtPaise,
        status: r.status,
        paymentDate: r.receiptDate,
        receiptDate: r.receiptDate,
        allocatedAmount: paiseToRupees(allocPaise),
        allocatedAmountPaise: allocPaise,
        unallocatedAmount: paiseToRupees(unallocPaise),
        unallocatedAmountPaise: unallocPaise,
        reversalStatus: r.status === 'REVERSED' ? 'REVERSED' : 'NOT_REVERSED',
        isReversed: r.status === 'REVERSED',
        reversedAt: r.reversedAt || null,
        reversedBy: r.reversedBy || null,
        reversalJournalId: r.reversalJournalId || null,
        reversalReason: r.reversalReason || null,
        journalId: r.journalId || null,
        cashBankAccountCode: r.cashBankAccountCode,
        notes: r.notes || null,
        referenceNumber: r.referenceNumber || null,
        createdAt: r.createdAt,
        postedAt: r.postedAt || null,
      };
    });

    // 9. Pagination Slicing
    const totalCount = historyItems.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const pagedReceipts = historyItems.slice(startIndex, startIndex + pageSize);

    return {
      success: true,
      receipts: pagedReceipts,
      totalCount,
      page,
      pageSize,
      totalPages,
      summary: {
        totalReceiptsCount: allReceipts.length,
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
  // 3. OUTSTANDING SALES INVOICES
  // =========================================================================

  /**
   * Returns eligible/outstanding sales invoices for a canonical customer.
   * Derived from posted sales invoices, credit/debit notes, and customer receipt allocations.
   * Excludes fully paid/settled invoices.
   */
  public static async getOutstandingSalesInvoices(
    adminSession: AdminSession,
    customerId: string,
    options?: CustomerReportOptions
  ): Promise<CustomerOutstandingInvoicesResponse> {
    // 1. Enforce Super Admin Authorization
    if (!adminSession || adminSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED: Only Super Admin users can view outstanding sales invoices.');
    }

    // 2. Validate & Resolve Canonical Customer Identity
    const rawCustomerId = typeof customerId === 'string' ? customerId.trim() : '';
    if (!rawCustomerId) {
      throw new Error('MISSING_CUSTOMER_ID: customerId is required.');
    }

    let canonicalCustomerId = rawCustomerId;
    if (!options?.inMemoryFixtures) {
      const resolved = await PartyLedgerService.resolveCanonicalRetailerId(rawCustomerId);
      if (resolved) {
        canonicalCustomerId = resolved;
      }
    }

    // 3. Fetch Sales Invoices
    let allInvoices: SalesInvoice[] = [];
    if (options?.inMemoryFixtures?.invoices) {
      allInvoices = options.inMemoryFixtures.invoices.filter(
        (inv) => inv.customerId === canonicalCustomerId || inv.customerId === rawCustomerId
      );
    } else {
      try {
        const qInvoices = query(
          collection(db, 'salesInvoices'),
          where('customerId', '==', canonicalCustomerId)
        );
        const invSnap = await getDocs(qInvoices);
        invSnap.forEach((d) => allInvoices.push(d.data() as SalesInvoice));
      } catch {
        // Fallback
      }
    }

    // 4. Fetch Posted Credit/Debit Notes for this customer
    const notesByInvoice = new Map<string, CreditDebitNote[]>();
    if (options?.inMemoryFixtures?.notes) {
      for (const n of options.inMemoryFixtures.notes) {
        const notePartyId = (n as any).customerId || (n as any).partyId;
        if (
          (notePartyId === canonicalCustomerId || notePartyId === rawCustomerId) &&
          n.status === 'POSTED' &&
          n.originalInvoiceId
        ) {
          const list = notesByInvoice.get(n.originalInvoiceId) || [];
          list.push(n);
          notesByInvoice.set(n.originalInvoiceId, list);
        }
      }
    } else {
      try {
        const qNotes = query(
          collection(db, 'creditDebitNotes'),
          where('customerId', '==', canonicalCustomerId)
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

    // 5. Fetch Allocations from posted customer receipts
    const allocatedByInvoice = new Map<string, number>();
    if (options?.inMemoryFixtures?.receipts) {
      for (const rec of options.inMemoryFixtures.receipts) {
        if (
          (rec.customerId === canonicalCustomerId || rec.customerId === rawCustomerId) &&
          rec.status === 'POSTED' &&
          Array.isArray(rec.allocations)
        ) {
          for (const alloc of rec.allocations) {
            if (alloc.invoiceId && alloc.allocatedAmountPaise > 0) {
              const current = allocatedByInvoice.get(alloc.invoiceId) || 0;
              allocatedByInvoice.set(alloc.invoiceId, current + alloc.allocatedAmountPaise);
            }
          }
        }
      }
    } else {
      try {
        const qReceipts = query(
          collection(db, 'customerReceipts'),
          where('customerId', '==', canonicalCustomerId)
        );
        const receiptsSnap = await getDocs(qReceipts);
        receiptsSnap.forEach((d) => {
          const rec = d.data() as CustomerReceipt;
          if (rec.status === 'POSTED' && Array.isArray(rec.allocations)) {
            for (const alloc of rec.allocations) {
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
    const outstandingInvoices: OutstandingSalesInvoiceItem[] = [];
    let totalInvoiceAmountPaise = 0;
    let totalAllocatedAmountPaise = 0;
    let totalOutstandingAmountPaise = 0;

    for (const inv of allInvoices) {
      // Must be issued/posted sales invoice
      const isIssued = inv.invoiceStatus === 'ISSUED' || (inv.invoiceStatus as any) === 'POSTED';
      const isAcctPosted = inv.accountingStatus === 'POSTED';
      if (!isIssued || !isAcctPosted) {
        continue;
      }

      const grandTotalPaise = Math.round((inv.grandTotal || 0) * 100);
      let adjustedTotalPaise = grandTotalPaise;

      // Apply credit/debit notes:
      // SALES_CREDIT_NOTE reduces receivable / invoice total
      // SALES_DEBIT_NOTE increases receivable / invoice total
      const notes = notesByInvoice.get(inv.invoiceId) || [];
      for (const note of notes) {
        const notePaise = Math.round((note.grandTotal || 0) * 100);
        if (note.noteType === 'SALES_CREDIT_NOTE') {
          adjustedTotalPaise -= notePaise;
        } else if (note.noteType === 'SALES_DEBIT_NOTE') {
          adjustedTotalPaise += notePaise;
        }
      }
      adjustedTotalPaise = Math.max(0, adjustedTotalPaise);

      // Apply customer receipt allocations
      const alreadyAllocatedPaise = Math.max(
        allocatedByInvoice.get(inv.invoiceId) || 0,
        inv.paidAmountPaise || 0
      );
      const outstandingAmountPaise = Math.max(0, adjustedTotalPaise - alreadyAllocatedPaise);

      // Exclude fully settled invoices
      if (outstandingAmountPaise > 0) {
        totalInvoiceAmountPaise += adjustedTotalPaise;
        totalAllocatedAmountPaise += alreadyAllocatedPaise;
        totalOutstandingAmountPaise += outstandingAmountPaise;

        outstandingInvoices.push({
          invoiceId: inv.invoiceId,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate,
          customerId: canonicalCustomerId,
          customerName: inv.billingAddressSnapshot?.businessName || `Retailer (${canonicalCustomerId})`,
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
      customerId: canonicalCustomerId,
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
  // 4. CUSTOMER ACCOUNTING SUMMARY
  // =========================================================================

  /**
   * Generates a read-only customer accounting summary across all customers or for a single customer.
   * Total outstanding AR (Account 1300), total posted receipts, total reversed receipts,
   * total allocated, total unallocated, and due bills count.
   */
  public static async getCustomerAccountingSummary(
    adminSession: AdminSession,
    filters?: {
      customerId?: string;
      fromDate?: string;
      toDate?: string;
    },
    options?: CustomerReportOptions
  ): Promise<CustomerAccountingSummaryResponse> {
    // 1. Enforce Super Admin Authorization
    if (!adminSession || adminSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED: Only Super Admin users can access customer accounting summary.');
    }

    // 2. Reject client injection
    this.assertNoFieldInjection(filters);

    // 3. Resolve canonical customerId if provided
    let targetCustomerId: string | undefined = undefined;
    let targetCustomerName: string | undefined = undefined;

    if (filters?.customerId !== undefined) {
      const rawCustomer = typeof filters.customerId === 'string' ? filters.customerId.trim() : '';
      if (!rawCustomer) {
        throw new Error('MISSING_CUSTOMER_ID: customerId cannot be empty if specified.');
      }
      if (!options?.inMemoryFixtures) {
        targetCustomerId = (await PartyLedgerService.resolveCanonicalRetailerId(rawCustomer)) || rawCustomer;
        const snap = await this.resolveCustomerSnapshot(targetCustomerId);
        targetCustomerName = snap.shopName;
      } else {
        targetCustomerId = rawCustomer;
        const matchRet = options.inMemoryFixtures.retailers?.find(
          (r) => r.customerId === rawCustomer || r.retailerId === rawCustomer
        );
        targetCustomerName = matchRet ? matchRet.shopName || matchRet.businessName : `Retailer (${rawCustomer})`;
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

    // 5. Total Outstanding AR from Account 1300 (Asset: Debit - Credit)
    const accReceivable = await this.getAuthoritativeAccountsReceivable(options);
    let rawLines: JournalEntryLine[] = [];
    const journalMap = new Map<string, JournalEntry>();

    if (options?.inMemoryFixtures) {
      if (options.inMemoryFixtures.journalLines) {
        rawLines = options.inMemoryFixtures.journalLines.filter(
          (l) => l.accountId === accReceivable.accountId || l.accountId === 'acc_1300'
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
          where('accountId', '==', accReceivable.accountId)
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

    let openingBalancePaise = 0;
    let periodDebitPaise = 0;
    let periodCreditPaise = 0;
    let allTimeARPaise = 0;

    for (const line of rawLines) {
      const journal = journalMap.get(line.journalId);
      if (!journal || journal.status !== 'POSTED') continue;

      if (targetCustomerId) {
        let lineMatch = line.customerId === targetCustomerId;
        if (!lineMatch && options?.inMemoryFixtures) {
          if (journal.referenceType === 'SALES_INVOICE' && journal.referenceId && options.inMemoryFixtures.invoices) {
            const inv = options.inMemoryFixtures.invoices.find((i) => i.invoiceId === journal.referenceId);
            if (inv && (inv.customerId === targetCustomerId)) lineMatch = true;
          } else if (journal.referenceType === 'CUSTOMER_RECEIPT' && journal.referenceId && options.inMemoryFixtures.receipts) {
            const rec = options.inMemoryFixtures.receipts.find((r) => r.receiptId === journal.referenceId);
            if (rec && (rec.customerId === targetCustomerId)) lineMatch = true;
          }
        }
        if (!lineMatch) continue;
      }

      const dPaise = parseAndValidatePaise(line.debit || 0, 'Line Debit');
      const cPaise = parseAndValidatePaise(line.credit || 0, 'Line Credit');

      allTimeARPaise += (dPaise - cPaise);

      if (fromDate && journal.journalDate < fromDate) {
        openingBalancePaise += (dPaise - cPaise);
      } else {
        if (!toDate || journal.journalDate <= toDate) {
          periodDebitPaise += dPaise;
          periodCreditPaise += cPaise;
        }
      }
    }

    const hasDateFilter = Boolean(fromDate || toDate);
    const closingBalancePaise = openingBalancePaise + periodDebitPaise - periodCreditPaise;
    const totalOutstandingARPaise = hasDateFilter ? closingBalancePaise : allTimeARPaise;

    // 6. Receipt Metrics from customerReceipts
    let allReceipts: CustomerReceipt[] = [];
    if (options?.inMemoryFixtures?.receipts) {
      allReceipts = [...options.inMemoryFixtures.receipts];
    } else {
      try {
        const receiptsRef = collection(db, 'customerReceipts');
        const qReceipts = query(receiptsRef, where('_serverTxnToken', '==', SERVER_TXN_TOKEN));
        const snap = await getDocs(qReceipts);
        snap.forEach((d) => allReceipts.push(d.data() as CustomerReceipt));
      } catch {
        // Fallback
      }
    }

    if (targetCustomerId) {
      allReceipts = allReceipts.filter(
        (r) => r.customerId === targetCustomerId || (r.customerSnapshot && (r.customerSnapshot as any).retailerId === targetCustomerId)
      );
    }
    if (fromDate) {
      allReceipts = allReceipts.filter((r) => (r.receiptDate || '') >= fromDate);
    }
    if (toDate) {
      allReceipts = allReceipts.filter((r) => (r.receiptDate || '') <= toDate);
    }

    let totalPostedReceiptsPaise = 0;
    let totalReversedReceiptsPaise = 0;
    let totalAllocatedReceiptsPaise = 0;
    let totalUnallocatedReceiptsPaise = 0;

    for (const r of allReceipts) {
      const amtPaise = r.amountPaise;
      const allocPaise = r.allocatedAmountPaise || 0;
      const unallocPaise =
        typeof r.unallocatedAmountPaise === 'number'
          ? r.unallocatedAmountPaise
          : Math.max(0, amtPaise - allocPaise);

      if (r.status === 'POSTED') {
        totalPostedReceiptsPaise += amtPaise;
        totalAllocatedReceiptsPaise += allocPaise;
        totalUnallocatedReceiptsPaise += unallocPaise;
      } else if (r.status === 'REVERSED') {
        totalReversedReceiptsPaise += amtPaise;
      }
    }

    // 7. Due Bills Count (Number of outstanding sales invoices)
    let allInvoices: SalesInvoice[] = [];
    if (options?.inMemoryFixtures?.invoices) {
      allInvoices = [...options.inMemoryFixtures.invoices];
    } else {
      try {
        const qInvoices = query(collection(db, 'salesInvoices'));
        const invSnap = await getDocs(qInvoices);
        invSnap.forEach((d) => allInvoices.push(d.data() as SalesInvoice));
      } catch {
        // Fallback
      }
    }

    if (targetCustomerId) {
      allInvoices = allInvoices.filter((inv) => inv.customerId === targetCustomerId);
    }

    // Notes map for invoices
    const notesByInvoice = new Map<string, CreditDebitNote[]>();
    if (options?.inMemoryFixtures?.notes) {
      for (const n of options.inMemoryFixtures.notes) {
        if (n.status === 'POSTED' && n.originalInvoiceId) {
          const list = notesByInvoice.get(n.originalInvoiceId) || [];
          list.push(n);
          notesByInvoice.set(n.originalInvoiceId, list);
        }
      }
    }

    // Allocations map for invoices from posted receipts
    const allocatedByInvoice = new Map<string, number>();
    for (const r of allReceipts) {
      if (r.status === 'POSTED' && Array.isArray(r.allocations)) {
        for (const a of r.allocations) {
          if (a.invoiceId && a.allocatedAmountPaise > 0) {
            const current = allocatedByInvoice.get(a.invoiceId) || 0;
            allocatedByInvoice.set(a.invoiceId, current + a.allocatedAmountPaise);
          }
        }
      }
    }

    let dueBillsCount = 0;
    for (const inv of allInvoices) {
      const isIssued = inv.invoiceStatus === 'ISSUED' || (inv.invoiceStatus as any) === 'POSTED';
      const isAcctPosted = inv.accountingStatus === 'POSTED';
      if (!isIssued || !isAcctPosted) {
        continue;
      }

      const grandTotalPaise = Math.round((inv.grandTotal || 0) * 100);
      let adjustedTotalPaise = grandTotalPaise;

      const notes = notesByInvoice.get(inv.invoiceId) || [];
      for (const note of notes) {
        const notePaise = Math.round((note.grandTotal || 0) * 100);
        if (note.noteType === 'SALES_CREDIT_NOTE') {
          adjustedTotalPaise -= notePaise;
        } else if (note.noteType === 'SALES_DEBIT_NOTE') {
          adjustedTotalPaise += notePaise;
        }
      }
      adjustedTotalPaise = Math.max(0, adjustedTotalPaise);

      const paidPaise = Math.max(
        allocatedByInvoice.get(inv.invoiceId) || 0,
        inv.paidAmountPaise || 0
      );
      const outstandingPaise = Math.max(0, adjustedTotalPaise - paidPaise);
      if (outstandingPaise > 0) {
        dueBillsCount++;
      }
    }

    return {
      success: true,
      customerId: targetCustomerId,
      customerName: targetCustomerName,
      totalOutstandingAR: paiseToRupees(totalOutstandingARPaise),
      totalOutstandingARPaise,
      totalPostedReceipts: paiseToRupees(totalPostedReceiptsPaise),
      totalPostedReceiptsPaise,
      totalReversedReceipts: paiseToRupees(totalReversedReceiptsPaise),
      totalReversedReceiptsPaise,
      totalAllocatedReceipts: paiseToRupees(totalAllocatedReceiptsPaise),
      totalAllocatedReceiptsPaise,
      totalUnallocatedReceipts: paiseToRupees(totalUnallocatedReceiptsPaise),
      totalUnallocatedReceiptsPaise,
      dueBillsCount,
      numberOfOutstandingInvoices: dueBillsCount,
      customerARBalance: paiseToRupees(allTimeARPaise),
      customerARBalancePaise: allTimeARPaise,
      openingBalance: hasDateFilter ? paiseToRupees(openingBalancePaise) : undefined,
      openingBalancePaise: hasDateFilter ? openingBalancePaise : undefined,
      closingBalance: hasDateFilter ? paiseToRupees(closingBalancePaise) : undefined,
      closingBalancePaise: hasDateFilter ? closingBalancePaise : undefined,
      periodDebit: hasDateFilter ? paiseToRupees(periodDebitPaise) : undefined,
      periodDebitPaise: hasDateFilter ? periodDebitPaise : undefined,
      periodCredit: hasDateFilter ? paiseToRupees(periodCreditPaise) : undefined,
      periodCreditPaise: hasDateFilter ? periodCreditPaise : undefined,
    };
  }

  // =========================================================================
  // 5. CSV EXPORT UTILITIES (PHASE 5.9 PART 3)
  // =========================================================================

  /**
   * Export Customer Statement to safely escaped CSV with complete metadata
   */
  public static async exportCustomerStatementCsv(
    adminSession: AdminSession,
    filter: CustomerStatementFilter,
    options?: CustomerReportOptions
  ): Promise<{ filename: string; csv: string }> {
    const statement = await this.getCustomerStatement(
      adminSession,
      { ...filter, pageSize: 10000 },
      { ...options, isExport: true }
    );

    const nowIso = new Date().toISOString();
    const dateRangeStr = `${filter.fromDate || 'All Time'} to ${filter.toDate || 'Present'}`;

    const metadata: string[] = [
      `REPORT: Customer Statement of Account`,
      `CUSTOMER NAME: ${statement.customerName}`,
      `CUSTOMER ID: ${statement.customerId}`,
      `GENERATED AT: ${nowIso}`,
      `DATE RANGE: ${dateRangeStr}`,
      `CURRENCY: INR`,
      `OPENING BALANCE (INR): ${(statement.openingBalancePaise / 100).toFixed(2)}`,
      `TOTAL SALES (DEBITS) (INR): ${(statement.totalSalesInvoiceDebitsPaise / 100).toFixed(2)}`,
      `TOTAL RECEIPTS (CREDITS) (INR): ${(statement.totalCustomerReceiptsPaise / 100).toFixed(2)}`,
      `TOTAL ALLOCATED (INR): ${(statement.totalReceiptAllocationsPaise / 100).toFixed(2)}`,
      `TOTAL REVERSED (INR): ${(statement.totalReceiptReversalsPaise / 100).toFixed(2)}`,
      `CLOSING BALANCE (INR): ${(statement.closingBalancePaise / 100).toFixed(2)}`,
      `CURRENT OUTSTANDING AR (INR): ${(statement.currentOutstandingARPaise / 100).toFixed(2)}`,
    ];

    const headers = [
      'Date',
      'Transaction Type',
      'Document Ref / Number',
      'Journal Voucher',
      'Particulars / Narration',
      'Debit (INR)',
      'Debit (Paise)',
      'Credit (INR)',
      'Credit (Paise)',
      'Running Balance (INR)',
      'Running Balance (Paise)',
      'Status',
    ];

    const rows = statement.transactions.map((tx) => [
      tx.date,
      tx.transactionType,
      tx.referenceNumber || tx.referenceId || '',
      tx.voucherNumber || '',
      tx.narration || '',
      (tx.debitPaise / 100).toFixed(2),
      tx.debitPaise,
      (tx.creditPaise / 100).toFixed(2),
      tx.creditPaise,
      (tx.runningBalancePaise / 100).toFixed(2),
      tx.runningBalancePaise,
      tx.status,
    ]);

    const cleanCustId = statement.customerId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `customer_statement_${cleanCustId}_${filter.fromDate || 'all'}_to_${filter.toDate || 'now'}.csv`;
    const csv = generateCsv(headers, rows, metadata);

    return { filename, csv };
  }

  /**
   * Export Customer Receipt History to safely escaped CSV with complete metadata
   */
  public static async exportCustomerReceiptHistoryCsv(
    adminSession: AdminSession,
    filter: CustomerReceiptHistoryFilter,
    options?: CustomerReportOptions
  ): Promise<{ filename: string; csv: string }> {
    const history = await this.getCustomerReceiptHistory(
      adminSession,
      { ...filter, pageSize: 10000 },
      { ...options, isExport: true }
    );

    const nowIso = new Date().toISOString();
    const dateRangeStr = `${filter.fromDate || 'All Time'} to ${filter.toDate || 'Present'}`;

    const metadata: string[] = [
      `REPORT: Customer Receipt History`,
      `CUSTOMER ID: ${filter.customerId || 'All Customers'}`,
      `GENERATED AT: ${nowIso}`,
      `DATE RANGE: ${dateRangeStr}`,
      `CURRENCY: INR`,
      `TOTAL RECEIPTS COUNT: ${history.summary.totalReceiptsCount}`,
      `TOTAL AMOUNT (INR): ${(history.summary.totalAmountPaise / 100).toFixed(2)}`,
      `TOTAL ALLOCATED AMOUNT (INR): ${(history.summary.totalAllocatedAmountPaise / 100).toFixed(2)}`,
      `TOTAL UNALLOCATED AMOUNT (INR): ${(history.summary.totalUnallocatedAmountPaise / 100).toFixed(2)}`,
      `TOTAL REVERSED AMOUNT (INR): ${(history.summary.totalReversedAmountPaise / 100).toFixed(2)}`,
    ];

    const headers = [
      'Receipt Date',
      'Receipt Number',
      'Receipt ID',
      'Voucher Number',
      'Customer ID',
      'Customer Name',
      'Payment Method',
      'Amount (INR)',
      'Amount (Paise)',
      'Allocated Amount (INR)',
      'Allocated Amount (Paise)',
      'Unallocated Amount (INR)',
      'Unallocated Amount (Paise)',
      'Status',
      'Reversal Status',
      'Reversed At',
      'Reversal Reason',
      'Reversal Journal ID',
    ];

    const rows = history.receipts.map((r) => [
      r.receiptDate,
      r.receiptNumber,
      r.receiptId,
      r.voucherNumber || '',
      r.customerId,
      r.customerName,
      r.paymentMethod,
      (r.amountPaise / 100).toFixed(2),
      r.amountPaise,
      (r.allocatedAmountPaise / 100).toFixed(2),
      r.allocatedAmountPaise,
      (r.unallocatedAmountPaise / 100).toFixed(2),
      r.unallocatedAmountPaise,
      r.status,
      r.reversalStatus,
      r.reversedAt || '',
      r.reversalReason || '',
      r.reversalJournalId || '',
    ]);

    const custPart = filter.customerId ? filter.customerId.replace(/[^a-zA-Z0-9_-]/g, '_') : 'all';
    const filename = `customer_receipts_${custPart}_${filter.fromDate || 'all'}_to_${filter.toDate || 'now'}.csv`;
    const csv = generateCsv(headers, rows, metadata);

    return { filename, csv };
  }

  /**
   * Export Outstanding Sales Invoices to safely escaped CSV with complete metadata
   */
  public static async exportOutstandingSalesInvoicesCsv(
    adminSession: AdminSession,
    customerId: string,
    options?: CustomerReportOptions
  ): Promise<{ filename: string; csv: string }> {
    const outstanding = await this.getOutstandingSalesInvoices(adminSession, customerId, options);

    const nowIso = new Date().toISOString();

    const metadata: string[] = [
      `REPORT: Outstanding Sales Invoices`,
      `CUSTOMER ID: ${outstanding.customerId}`,
      `GENERATED AT: ${nowIso}`,
      `CURRENCY: INR`,
      `TOTAL DUE INVOICES: ${outstanding.totalCount}`,
      `TOTAL INVOICE AMOUNT (INR): ${(outstanding.summary.totalInvoiceAmountPaise / 100).toFixed(2)}`,
      `TOTAL ALLOCATED AMOUNT (INR): ${(outstanding.summary.totalAllocatedAmountPaise / 100).toFixed(2)}`,
      `TOTAL OUTSTANDING AR (INR): ${(outstanding.summary.totalOutstandingAmountPaise / 100).toFixed(2)}`,
    ];

    const headers = [
      'Invoice Number',
      'Invoice Date',
      'Customer ID',
      'Customer Name',
      'Invoice Total (INR)',
      'Adjusted Total (INR)',
      'Allocated Amount (INR)',
      'Outstanding Amount (INR)',
      'Outstanding (Paise)',
      'Invoice Status',
      'Payment Status',
    ];

    const rows = outstanding.invoices.map((inv) => [
      inv.invoiceNumber,
      inv.invoiceDate,
      inv.customerId,
      inv.customerName,
      (inv.invoiceTotalPaise / 100).toFixed(2),
      (inv.adjustedTotalPaise / 100).toFixed(2),
      (inv.allocatedAmountPaise / 100).toFixed(2),
      (inv.outstandingAmountPaise / 100).toFixed(2),
      inv.outstandingAmountPaise,
      inv.invoiceStatus,
      inv.paymentStatus,
    ]);

    const cleanCustId = outstanding.customerId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `outstanding_sales_invoices_${cleanCustId}_${nowIso.split('T')[0]}.csv`;
    const csv = generateCsv(headers, rows, metadata);

    return { filename, csv };
  }

  /**
   * Export Customer Accounting Summary to safely escaped CSV with complete metadata
   */
  public static async exportCustomerAccountingSummaryCsv(
    adminSession: AdminSession,
    filters?: {
      customerId?: string;
      fromDate?: string;
      toDate?: string;
    },
    options?: CustomerReportOptions
  ): Promise<{ filename: string; csv: string }> {
    const summary = await this.getCustomerAccountingSummary(adminSession, filters, options);

    const nowIso = new Date().toISOString();
    const dateRangeStr = `${filters?.fromDate || 'All Time'} to ${filters?.toDate || 'Present'}`;

    const metadata: string[] = [
      `REPORT: Customer Accounting Summary`,
      `CUSTOMER ID: ${summary.customerId || 'All Customers'}`,
      `CUSTOMER NAME: ${summary.customerName || 'All Customers'}`,
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
        'Total Outstanding AR Balance',
        (summary.totalOutstandingARPaise / 100).toFixed(2),
        summary.totalOutstandingARPaise,
        'Net trade receivables asset (Account 1300)',
      ],
      [
        'Total Posted Receipts',
        (summary.totalPostedReceiptsPaise / 100).toFixed(2),
        summary.totalPostedReceiptsPaise,
        'All posted receipts from customer',
      ],
      [
        'Total Allocated Receipts',
        (summary.totalAllocatedReceiptsPaise / 100).toFixed(2),
        summary.totalAllocatedReceiptsPaise,
        'Matched and applied against sales invoices',
      ],
      [
        'Total Unallocated Receipts',
        (summary.totalUnallocatedReceiptsPaise / 100).toFixed(2),
        summary.totalUnallocatedReceiptsPaise,
        'Unapplied receipts / advance customer balances',
      ],
      [
        'Total Reversed Receipts',
        (summary.totalReversedReceiptsPaise / 100).toFixed(2),
        summary.totalReversedReceiptsPaise,
        'Voided/bounced receipts with balanced reversal journals',
      ],
      [
        'Due Bills Count',
        summary.dueBillsCount,
        summary.dueBillsCount,
        'Number of sales invoices with remaining receivable balance',
      ],
    ];

    const custPart = summary.customerId ? summary.customerId.replace(/[^a-zA-Z0-9_-]/g, '_') : 'all';
    const filename = `customer_summary_${custPart}_${filters?.fromDate || 'all'}_to_${filters?.toDate || 'now'}.csv`;
    const csv = generateCsv(headers, rows, metadata);

    return { filename, csv };
  }
}
