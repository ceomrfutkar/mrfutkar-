/**
 * MR FUTKAR — Party Ledger Service (Phase 5.7 Part 1)
 * Customer Receivable Ledger (Account 1300) & Supplier Payable Ledger (Account 2100)
 * Server-authoritative subledger strictly derived from posted accounting journals and lines
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { db } from './firebaseAdmin';
import {
  Account,
  JournalEntry,
  JournalEntryLine,
  parseAndValidatePaise,
  paiseToRupees,
  isValidDateFormat,
} from '../src/types/accounting';
import {
  CustomerDocumentType,
  CustomerLedgerEntry,
  CustomerLedgerFilter,
  CustomerLedgerResponse,
  CustomerLedgerSummaryItem,
  CustomerLedgerSummaryResponse,
  CustomerSnapshotInfo,
  SupplierDocumentType,
  SupplierLedgerEntry,
  SupplierLedgerFilter,
  SupplierLedgerResponse,
  SupplierLedgerSummaryItem,
  SupplierLedgerSummaryResponse,
  SupplierSnapshotInfo,
} from '../src/types/partyLedger';

export class PartyLedgerService {
  /**
   * Helper: Resolve Authoritative Account from Chart of Accounts by code
   */
  private static async getAuthoritativeAccount(code: string): Promise<Account> {
    const directDocRef = doc(db, 'chartOfAccounts', `acc_${code}`);
    const directSnap = await getDoc(directDocRef);
    if (directSnap.exists()) {
      return directSnap.data() as Account;
    }

    const codeQuery = query(
      collection(db, 'chartOfAccounts'),
      where('accountCode', '==', code)
    );
    const codeSnap = await getDocs(codeQuery);
    if (!codeSnap.empty) {
      return codeSnap.docs[0].data() as Account;
    }

    throw new Error(`ACCOUNT_NOT_FOUND: Required account code "${code}" not found in Chart of Accounts.`);
  }

  /**
   * Helper: Extract reference number from journal narration or voucher
   */
  private static extractReferenceNumber(journal: JournalEntry): string | undefined {
    const rawRef = (journal as any).referenceNumber;
    if (rawRef) return rawRef;
    if (!journal.narration) return journal.referenceId || undefined;
    // Match SI-YYYY-NNNNN, PI-YYYY-NNNNN, CN-YYYY-NNNNN, DN-YYYY-NNNNN, RV-YYYY-NNNNN, CR-YYYY-NNNNN, SP-YYYY-NNNNN, PV-..., INV-..., etc.
    const match = journal.narration.match(/(?:SI|PI|CN|DN|RV|CR|SP|PV|INV|ORD)-[0-9]{4,}-[0-9]+/i) ||
                  journal.narration.match(/(?:SI|PI|CN|DN|RV|CR|SP|PV)-[A-Z0-9-]+/i);
    return match ? match[0] : journal.referenceId || undefined;
  }

  // =========================================================================
  // CUSTOMER RECEIVABLE LEDGER (ACCOUNT 1300)
  // =========================================================================

  /**
   * Authoritative Customer Ledger statement for a specific customer
   */
  static async getCustomerLedger(filter: CustomerLedgerFilter): Promise<CustomerLedgerResponse> {
    const customerId = typeof filter.customerId === 'string' ? filter.customerId.trim() : '';
    if (!customerId) {
      throw new Error('MISSING_CUSTOMER_ID: customerId is required for Customer Ledger statement.');
    }

    // 1. Static Parameter Validation
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
    if (rawPageSize > 100) {
      throw new Error('PAGE_SIZE_EXCEEDED: Page size cannot exceed 100.');
    }
    const pageSize = Math.max(1, Number.isFinite(rawPageSize) ? Math.floor(rawPageSize) : 50);

    // 1. Resolve Canonical Retailer ID
    const canonicalRetailerId = (await this.resolveCanonicalRetailerId(customerId)) || customerId.trim();

    // 2. Fetch Customer Info
    const customer = await this.resolveCustomerSnapshot(canonicalRetailerId);

    // 3. Resolve Accounts Receivable Account (1300)
    const accReceivable = await this.getAuthoritativeAccount('1300');

    // 4. Fetch all journal entry lines for account 1300
    const linesQuery = query(
      collection(db, 'journalEntryLines'),
      where('accountId', '==', accReceivable.accountId)
    );
    const linesSnap = await getDocs(linesQuery);

    const rawLines: JournalEntryLine[] = [];
    linesSnap.forEach(d => {
      const data = d.data() as JournalEntryLine;
      rawLines.push(data);
    });

    // 5. Batch fetch parent journals
    const uniqueJournalIds = Array.from(new Set(rawLines.map(l => l.journalId)));
    const journalMap = new Map<string, JournalEntry>();

    for (const jId of uniqueJournalIds) {
      const jRef = doc(db, 'journalEntries', jId);
      const jSnap = await getDoc(jRef);
      if (jSnap.exists()) {
        journalMap.set(jId, jSnap.data() as JournalEntry);
      }
    }

    // Caches for explicit source document resolution
    const invoiceDocCache = new Map<string, any>();
    const noteDocCache = new Map<string, any>();
    const partyIdToCanonicalCache = new Map<string, string | null>();

    // 6. Partition lines into Opening Balance and Period Lines
    // Matching criteria: line.customerId === canonicalRetailerId OR verified source document belongs to this retailer
    let openingBalancePaise = 0;
    const periodItems: { line: JournalEntryLine; journal: JournalEntry }[] = [];

    for (const line of rawLines) {
      const journal = journalMap.get(line.journalId);
      if (!journal) continue;

      // GL-02 & Section 6: Exclude DRAFT journals from accounting ledger
      if (journal.status === 'DRAFT') {
        continue;
      }

      // Customer Matching & Explicit Historical Journal Resolution:
      // CRITICAL: Do NOT use a broad OR condition (e.g. line.customerId === authUid).
      let matchesCustomer = false;

      if (line.customerId === canonicalRetailerId) {
        // Direct canonical match
        matchesCustomer = true;
      } else {
        // Explicit server-side resolver for historical journals:
        // journal -> source reference -> salesInvoice / creditDebitNote -> authoritative customerId -> canonical retailerId
        if (journal.referenceType === 'SALES_INVOICE' && journal.referenceId) {
          let invData = invoiceDocCache.get(journal.referenceId);
          if (invData === undefined) {
            const invSnap = await getDoc(doc(db, 'salesInvoices', journal.referenceId));
            invData = invSnap.exists() ? invSnap.data() : null;
            invoiceDocCache.set(journal.referenceId, invData);
          }
          if (invData && invData.customerId) {
            let resolved = partyIdToCanonicalCache.get(invData.customerId);
            if (resolved === undefined) {
              resolved = await this.resolveCanonicalRetailerId(invData.customerId);
              partyIdToCanonicalCache.set(invData.customerId, resolved);
            }
            if (resolved === canonicalRetailerId || invData.customerId === canonicalRetailerId) {
              matchesCustomer = true;
            }
          } else {
            console.warn('[PartyLedgerService] UNRESOLVED_PARTY_REFERENCE: Excluded journal line with unverified sales invoice', {
              journalId: journal.journalId,
              lineId: line.lineId,
              referenceId: journal.referenceId,
            });
          }
        } else if (journal.referenceType === 'CREDIT_DEBIT_NOTE' && journal.referenceId) {
          let noteData = noteDocCache.get(journal.referenceId);
          if (noteData === undefined) {
            const noteSnap = await getDoc(doc(db, 'creditDebitNotes', journal.referenceId));
            noteData = noteSnap.exists() ? noteSnap.data() : null;
            noteDocCache.set(journal.referenceId, noteData);
          }
          const rawPartyId = noteData?.partyId || noteData?.customerId;
          if (noteData && rawPartyId) {
            let resolved = partyIdToCanonicalCache.get(rawPartyId);
            if (resolved === undefined) {
              resolved = await this.resolveCanonicalRetailerId(rawPartyId);
              partyIdToCanonicalCache.set(rawPartyId, resolved);
            }
            if (resolved === canonicalRetailerId || rawPartyId === canonicalRetailerId) {
              matchesCustomer = true;
            }
          } else {
            console.warn('[PartyLedgerService] UNRESOLVED_PARTY_REFERENCE: Excluded journal line with unverified credit/debit note', {
              journalId: journal.journalId,
              lineId: line.lineId,
              referenceId: journal.referenceId,
            });
          }
        } else if (journal.referenceType === 'CUSTOMER_RECEIPT' && journal.referenceId) {
          let recData: any = null;
          try {
            const receiptSnap = await getDoc(doc(db, 'customerReceipts', journal.referenceId));
            recData = receiptSnap.exists() ? receiptSnap.data() : null;
          } catch {
            // Document read restricted by rules, fallback to line.customerId
          }
          const rawPartyId = recData?.customerId || line.customerId || (journal as any).customerId;
          if (rawPartyId) {
            let resolved = partyIdToCanonicalCache.get(rawPartyId);
            if (resolved === undefined) {
              resolved = await this.resolveCanonicalRetailerId(rawPartyId);
              partyIdToCanonicalCache.set(rawPartyId, resolved);
            }
            if (resolved === canonicalRetailerId || rawPartyId === canonicalRetailerId) {
              matchesCustomer = true;
            }
          } else {
            console.warn('[PartyLedgerService] UNRESOLVED_PARTY_REFERENCE: Excluded journal line with unverified customer receipt', {
              journalId: journal.journalId,
              lineId: line.lineId,
              referenceId: journal.referenceId,
            });
          }
        } else if (
          journal.referenceType === 'JOURNAL_REVERSAL' ||
          journal.voucherType === 'REVERSAL' ||
          Boolean(journal.reversalOfJournalId)
        ) {
          // Reversal Journal Resolution:
          // Check direct party reference on line or reversal header first
          let rawPartyId = line.customerId || (journal as any).customerId;

          // If not directly present on reversal journal, resolve from the original reversed journal
          if (!rawPartyId) {
            const origJournalId =
              journal.reversalOfJournalId ||
              (journal.referenceType === 'JOURNAL_REVERSAL' ? journal.referenceId : null);
            if (origJournalId) {
              let origJournal = journalMap.get(origJournalId);
              if (!origJournal) {
                try {
                  const origSnap = await getDoc(doc(db, 'journalEntries', origJournalId));
                  if (origSnap.exists()) {
                    origJournal = origSnap.data() as JournalEntry;
                    journalMap.set(origJournalId, origJournal);
                  }
                } catch {
                  // Ignore read error
                }
              }
              if (origJournal) {
                rawPartyId = (origJournal as any).customerId;
                if (!rawPartyId && origJournal.referenceType === 'CUSTOMER_RECEIPT' && origJournal.referenceId) {
                  try {
                    const rSnap = await getDoc(doc(db, 'customerReceipts', origJournal.referenceId));
                    if (rSnap.exists()) {
                      rawPartyId = rSnap.data()?.customerId;
                    }
                  } catch {
                    // Ignore
                  }
                } else if (!rawPartyId && origJournal.referenceType === 'SALES_INVOICE' && origJournal.referenceId) {
                  let invData = invoiceDocCache.get(origJournal.referenceId);
                  if (invData === undefined) {
                    try {
                      const invSnap = await getDoc(doc(db, 'salesInvoices', origJournal.referenceId));
                      invData = invSnap.exists() ? invSnap.data() : null;
                      invoiceDocCache.set(origJournal.referenceId, invData);
                    } catch {
                      // Ignore
                    }
                  }
                  rawPartyId = invData?.customerId;
                } else if (!rawPartyId && origJournal.referenceType === 'CREDIT_DEBIT_NOTE' && origJournal.referenceId) {
                  let noteData = noteDocCache.get(origJournal.referenceId);
                  if (noteData === undefined) {
                    try {
                      const noteSnap = await getDoc(doc(db, 'creditDebitNotes', origJournal.referenceId));
                      noteData = noteSnap.exists() ? noteSnap.data() : null;
                      noteDocCache.set(origJournal.referenceId, noteData);
                    } catch {
                      // Ignore
                    }
                  }
                  rawPartyId = noteData?.partyId || noteData?.customerId;
                }
              }
            }
          }

          if (rawPartyId) {
            let resolved = partyIdToCanonicalCache.get(rawPartyId);
            if (resolved === undefined) {
              resolved = await this.resolveCanonicalRetailerId(rawPartyId);
              partyIdToCanonicalCache.set(rawPartyId, resolved);
            }
            if (resolved === canonicalRetailerId || rawPartyId === canonicalRetailerId) {
              matchesCustomer = true;
            }
          } else {
            console.warn('[PartyLedgerService] UNRESOLVED_PARTY_REFERENCE: Excluded reversal journal line with unverified source reference', {
              journalId: journal.journalId,
              lineId: line.lineId,
              referenceType: journal.referenceType,
              referenceId: journal.referenceId,
              reversalOfJournalId: journal.reversalOfJournalId,
            });
          }
        } else {
          // If party identity cannot be resolved with certainty from source reference:
          // Exclude the transaction from the retailer ledger and flag UNRESOLVED_PARTY_REFERENCE
          console.warn('[PartyLedgerService] UNRESOLVED_PARTY_REFERENCE: Journal line cannot be resolved to canonical retailerId', {
            journalId: journal.journalId,
            lineId: line.lineId,
            referenceType: journal.referenceType,
            referenceId: journal.referenceId,
            lineCustomerId: line.customerId,
            expectedCanonicalRetailerId: canonicalRetailerId,
          });
        }
      }

      if (!matchesCustomer) {
        continue;
      }

      const dPaise = parseAndValidatePaise(line.debit || 0, 'Line Debit');
      const cPaise = parseAndValidatePaise(line.credit || 0, 'Line Credit');

      // Asset account 1300 normal balance is DEBIT:
      // Debit increases receivable (+), Credit reduces receivable (-)
      if (fromDate && journal.journalDate < fromDate) {
        openingBalancePaise += (dPaise - cPaise);
      } else {
        if (!toDate || journal.journalDate <= toDate) {
          periodItems.push({ line, journal });
        }
      }
    }

    // 7. Sort period entries in chronological order
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

    // 8. Calculate Running Balance & Period Totals in exact Integer Paise
    let runningBalancePaise = openingBalancePaise;
    let periodDebitPaise = 0;
    let periodCreditPaise = 0;
    const allCalculatedEntries: CustomerLedgerEntry[] = [];

    for (const item of periodItems) {
      const dPaise = parseAndValidatePaise(item.line.debit || 0, 'Line Debit');
      const cPaise = parseAndValidatePaise(item.line.credit || 0, 'Line Credit');

      periodDebitPaise += dPaise;
      periodCreditPaise += cPaise;
      runningBalancePaise += (dPaise - cPaise);

      // Determine Document Type
      let docType: CustomerDocumentType = 'JOURNAL_ENTRY';
      if (item.journal.referenceType === 'SALES_INVOICE') {
        docType = 'SALES_INVOICE';
      } else if (item.journal.referenceType === 'CREDIT_DEBIT_NOTE') {
        if (item.line.credit > 0) {
          docType = 'SALES_CREDIT_NOTE';
        } else {
          docType = 'SALES_DEBIT_NOTE';
        }
      } else if (item.journal.referenceType === 'CUSTOMER_RECEIPT' || item.journal.voucherType === 'RECEIPT') {
        docType = 'CUSTOMER_RECEIPT';
      } else if (item.journal.voucherType === 'CN' || item.journal.voucherType === 'CREDIT_NOTE') {
        docType = 'SALES_CREDIT_NOTE';
      } else if (item.journal.voucherType === 'DN' || item.journal.voucherType === 'DEBIT_NOTE') {
        docType = 'SALES_DEBIT_NOTE';
      }

      allCalculatedEntries.push({
        entryId: item.line.lineId,
        lineId: item.line.lineId,
        date: item.journal.journalDate,
        journalId: item.journal.journalId,
        journalNumber: item.journal.journalNumber || item.journal.journalId,
        voucherType: item.journal.voucherType,
        documentType: docType,
        referenceType: item.journal.referenceType || undefined,
        referenceId: item.journal.referenceId || undefined,
        referenceNumber: this.extractReferenceNumber(item.journal),
        narration: item.line.description || item.journal.narration,
        debit: paiseToRupees(dPaise),
        credit: paiseToRupees(cPaise),
        runningBalance: paiseToRupees(runningBalancePaise),
        customerId,
        customerName: customer.shopName,
        status: item.journal.status,
      });
    }

    const closingBalancePaise = openingBalancePaise + periodDebitPaise - periodCreditPaise;

    // 9. Pagination Slicing
    const totalCount = allCalculatedEntries.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const pagedEntries = allCalculatedEntries.slice(startIndex, startIndex + pageSize);

    return {
      success: true,
      customer,
      account: {
        accountId: accReceivable.accountId,
        accountCode: accReceivable.accountCode,
        accountName: accReceivable.accountName,
        normalBalance: 'DEBIT',
      },
      filter: {
        customerId,
        fromDate,
        toDate,
      },
      openingBalance: paiseToRupees(openingBalancePaise),
      periodDebit: paiseToRupees(periodDebitPaise),
      periodCredit: paiseToRupees(periodCreditPaise),
      closingBalance: paiseToRupees(closingBalancePaise),
      entries: pagedEntries,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
      },
    };
  }

  /**
   * Customer Ledger Summary for all kirana customers
   * Reconciles derived subledger balances against General Ledger Account 1300
   */
  static async getCustomerLedgerSummary(filters?: {
    search?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<CustomerLedgerSummaryResponse> {
    const accReceivable = await this.getAuthoritativeAccount('1300');

    // 1. Fetch all lines for account 1300
    const linesQuery = query(
      collection(db, 'journalEntryLines'),
      where('accountId', '==', accReceivable.accountId)
    );
    const linesSnap = await getDocs(linesQuery);

    const rawLines: JournalEntryLine[] = [];
    linesSnap.forEach(d => rawLines.push(d.data() as JournalEntryLine));

    // 2. Batch fetch parent journals
    const uniqueJournalIds = Array.from(new Set(rawLines.map(l => l.journalId)));
    const journalMap = new Map<string, JournalEntry>();

    for (const jId of uniqueJournalIds) {
      const jRef = doc(db, 'journalEntries', jId);
      const jSnap = await getDoc(jRef);
      if (jSnap.exists()) {
        journalMap.set(jId, jSnap.data() as JournalEntry);
      }
    }

    // 3. Aggregate by customerId
    const customerMap = new Map<
      string,
      {
        totalDebitPaise: number;
        totalCreditPaise: number;
        transactionCount: number;
        lastTransactionDate: string | null;
      }
    >();

    let glTotalReceivablePaise = 0;

    for (const line of rawLines) {
      const journal = journalMap.get(line.journalId);
      if (!journal || journal.status !== 'POSTED') continue;

      const dPaise = parseAndValidatePaise(line.debit || 0, 'Line Debit');
      const cPaise = parseAndValidatePaise(line.credit || 0, 'Line Credit');

      // Date filtering if specified
      if (filters?.fromDate && journal.journalDate < filters.fromDate) continue;
      if (filters?.toDate && journal.journalDate > filters.toDate) continue;

      glTotalReceivablePaise += (dPaise - cPaise);

      const custId = line.customerId || 'UNKNOWN_CUSTOMER';
      let entry = customerMap.get(custId);
      if (!entry) {
        entry = {
          totalDebitPaise: 0,
          totalCreditPaise: 0,
          transactionCount: 0,
          lastTransactionDate: null,
        };
        customerMap.set(custId, entry);
      }

      entry.totalDebitPaise += dPaise;
      entry.totalCreditPaise += cPaise;
      entry.transactionCount += 1;
      if (!entry.lastTransactionDate || journal.journalDate > entry.lastTransactionDate) {
        entry.lastTransactionDate = journal.journalDate;
      }
    }

    // 4. Also fetch retailers collection to populate active customer names and include retailers
    const retailersSnap = await getDocs(collection(db, 'retailers'));
    const retailerInfoMap = new Map<string, any>();
    retailersSnap.forEach(d => retailerInfoMap.set(d.id, d.data()));

    const customers: CustomerLedgerSummaryItem[] = [];
    const search = filters?.search ? filters.search.trim().toLowerCase() : '';

    // Build list combining customers with activity and registered retailers
    const allCustomerIds = Array.from(new Set([...customerMap.keys(), ...retailerInfoMap.keys()]));

    let totalOutstandingReceivablePaise = 0;
    let customersWithBalanceCount = 0;

    for (const custId of allCustomerIds) {
      if (custId === 'UNKNOWN_CUSTOMER') continue;

      const stats = customerMap.get(custId) || {
        totalDebitPaise: 0,
        totalCreditPaise: 0,
        transactionCount: 0,
        lastTransactionDate: null,
      };

      const ret = retailerInfoMap.get(custId);
      const shopName = (ret?.shopName || ret?.businessName || ret?.ownerName || `Kirana Store (${custId})`).trim();
      const ownerName = (ret?.ownerName || ret?.contactName || 'Kirana Owner').trim();
      const mobile = (ret?.mobileNumber || ret?.phone || '').trim();
      const city = (ret?.city || 'Delhi').trim();
      const state = (ret?.state || 'Delhi').trim();
      const gstin = ret?.gstNumber || ret?.gstin || undefined;

      const outstandingPaise = stats.totalDebitPaise - stats.totalCreditPaise;
      totalOutstandingReceivablePaise += outstandingPaise;
      if (outstandingPaise > 0) {
        customersWithBalanceCount++;
      }

      if (
        search &&
        !custId.toLowerCase().includes(search) &&
        !shopName.toLowerCase().includes(search) &&
        !ownerName.toLowerCase().includes(search) &&
        !mobile.includes(search)
      ) {
        continue;
      }

      customers.push({
        customerId: custId,
        shopName,
        ownerName,
        mobile,
        city,
        state,
        gstin,
        totalDebit: paiseToRupees(stats.totalDebitPaise),
        totalCredit: paiseToRupees(stats.totalCreditPaise),
        outstandingBalance: paiseToRupees(outstandingPaise),
        transactionCount: stats.transactionCount,
        lastTransactionDate: stats.lastTransactionDate,
      });
    }

    // Sort: highest outstanding balance first
    customers.sort((a, b) => b.outstandingBalance - a.outstandingBalance);

    return {
      success: true,
      customers,
      totalCount: customers.length,
      aggregate: {
        totalOutstandingReceivable: paiseToRupees(totalOutstandingReceivablePaise),
        totalCustomersWithBalance: customersWithBalanceCount,
        glReceivableBalance: paiseToRupees(glTotalReceivablePaise),
        isReconciledWithGL: Math.abs(totalOutstandingReceivablePaise - glTotalReceivablePaise) < 1,
      },
    };
  }

  // =========================================================================
  // SUPPLIER PAYABLE LEDGER (ACCOUNT 2100)
  // =========================================================================

  /**
   * Authoritative Supplier Ledger statement for a specific supplier
   */
  static async getSupplierLedger(filter: SupplierLedgerFilter): Promise<SupplierLedgerResponse> {
    const supplierId = typeof filter.supplierId === 'string' ? filter.supplierId.trim() : '';
    if (!supplierId) {
      throw new Error('MISSING_SUPPLIER_ID: supplierId is required for Supplier Ledger statement.');
    }

    // 1. Static Parameter Validation
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
    if (rawPageSize > 100) {
      throw new Error('PAGE_SIZE_EXCEEDED: Page size cannot exceed 100.');
    }
    const pageSize = Math.max(1, Number.isFinite(rawPageSize) ? Math.floor(rawPageSize) : 50);

    // 2. Fetch Supplier Info
    const supplier = await this.resolveSupplierSnapshot(supplierId);

    // 3. Resolve Accounts Payable Account (2100)
    const accPayable = await this.getAuthoritativeAccount('2100');

    // 4. Fetch all journal entry lines for account 2100
    const linesQuery = query(
      collection(db, 'journalEntryLines'),
      where('accountId', '==', accPayable.accountId)
    );
    const linesSnap = await getDocs(linesQuery);

    const rawLines: JournalEntryLine[] = [];
    linesSnap.forEach(d => rawLines.push(d.data() as JournalEntryLine));

    // 5. Batch fetch parent journals
    const uniqueJournalIds = Array.from(new Set(rawLines.map(l => l.journalId)));
    const journalMap = new Map<string, JournalEntry>();

    for (const jId of uniqueJournalIds) {
      const jRef = doc(db, 'journalEntries', jId);
      const jSnap = await getDoc(jRef);
      if (jSnap.exists()) {
        journalMap.set(jId, jSnap.data() as JournalEntry);
      }
    }

    // 6. Partition lines into Opening Balance and Period Lines
    // Liability account 2100 normal balance is CREDIT:
    // Credit increases payable (+), Debit reduces payable (-)
    let openingBalancePaise = 0;
    const periodItems: { line: JournalEntryLine; journal: JournalEntry }[] = [];

    for (const line of rawLines) {
      const journal = journalMap.get(line.journalId);
      if (!journal) continue;

      if (journal.status === 'DRAFT') {
        continue;
      }

      if (line.supplierId !== supplierId) {
        continue;
      }

      const dPaise = parseAndValidatePaise(line.debit || 0, 'Line Debit');
      const cPaise = parseAndValidatePaise(line.credit || 0, 'Line Credit');

      if (fromDate && journal.journalDate < fromDate) {
        openingBalancePaise += (cPaise - dPaise);
      } else {
        if (!toDate || journal.journalDate <= toDate) {
          periodItems.push({ line, journal });
        }
      }
    }

    // 7. Sort period entries in chronological order
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

    // 8. Calculate Running Balance & Period Totals in exact Integer Paise
    let runningBalancePaise = openingBalancePaise;
    let periodDebitPaise = 0;
    let periodCreditPaise = 0;
    const allCalculatedEntries: SupplierLedgerEntry[] = [];

    for (const item of periodItems) {
      const dPaise = parseAndValidatePaise(item.line.debit || 0, 'Line Debit');
      const cPaise = parseAndValidatePaise(item.line.credit || 0, 'Line Credit');

      periodDebitPaise += dPaise;
      periodCreditPaise += cPaise;
      runningBalancePaise += (cPaise - dPaise);

      // Determine Document Type
      let docType: SupplierDocumentType = 'JOURNAL_ENTRY';
      if (item.journal.referenceType === 'PURCHASE_INVOICE') {
        docType = 'PURCHASE_INVOICE';
      } else if (item.journal.referenceType === 'CREDIT_DEBIT_NOTE') {
        if (item.line.debit > 0) {
          docType = 'PURCHASE_DEBIT_NOTE';
        } else {
          docType = 'PURCHASE_CREDIT_NOTE';
        }
      } else if (item.journal.referenceType === 'SUPPLIER_PAYMENT' || item.journal.voucherType === 'PAYMENT' || item.journal.voucherType === 'PV') {
        docType = 'SUPPLIER_PAYMENT';
      } else if (item.journal.voucherType === 'DN' || item.journal.voucherType === 'DEBIT_NOTE') {
        docType = 'PURCHASE_DEBIT_NOTE';
      } else if (item.journal.voucherType === 'CN' || item.journal.voucherType === 'CREDIT_NOTE') {
        docType = 'PURCHASE_CREDIT_NOTE';
      }

      allCalculatedEntries.push({
        entryId: item.line.lineId,
        lineId: item.line.lineId,
        date: item.journal.journalDate,
        journalId: item.journal.journalId,
        journalNumber: item.journal.journalNumber || item.journal.journalId,
        voucherType: item.journal.voucherType,
        documentType: docType,
        referenceType: item.journal.referenceType || undefined,
        referenceId: item.journal.referenceId || undefined,
        referenceNumber: this.extractReferenceNumber(item.journal),
        narration: item.line.description || item.journal.narration,
        debit: paiseToRupees(dPaise),
        credit: paiseToRupees(cPaise),
        runningBalance: paiseToRupees(runningBalancePaise),
        supplierId,
        supplierName: supplier.businessName,
        status: item.journal.status,
      });
    }

    const closingBalancePaise = openingBalancePaise + periodCreditPaise - periodDebitPaise;

    // 9. Pagination Slicing
    const totalCount = allCalculatedEntries.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const pagedEntries = allCalculatedEntries.slice(startIndex, startIndex + pageSize);

    return {
      success: true,
      supplier,
      account: {
        accountId: accPayable.accountId,
        accountCode: accPayable.accountCode,
        accountName: accPayable.accountName,
        normalBalance: 'CREDIT',
      },
      filter: {
        supplierId,
        fromDate,
        toDate,
      },
      openingBalance: paiseToRupees(openingBalancePaise),
      periodDebit: paiseToRupees(periodDebitPaise),
      periodCredit: paiseToRupees(periodCreditPaise),
      closingBalance: paiseToRupees(closingBalancePaise),
      entries: pagedEntries,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
      },
    };
  }

  /**
   * Supplier Ledger Summary for all FMCG vendors/suppliers
   * Reconciles derived subledger balances against General Ledger Account 2100
   */
  static async getSupplierLedgersSummary(filters?: {
    search?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<SupplierLedgerSummaryResponse> {
    return this.getSupplierLedgerSummary(filters);
  }

  static async getSupplierLedgerSummary(filters?: {
    search?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<SupplierLedgerSummaryResponse> {
    const accPayable = await this.getAuthoritativeAccount('2100');

    // 1. Fetch all lines for account 2100
    const linesQuery = query(
      collection(db, 'journalEntryLines'),
      where('accountId', '==', accPayable.accountId)
    );
    const linesSnap = await getDocs(linesQuery);

    const rawLines: JournalEntryLine[] = [];
    linesSnap.forEach(d => rawLines.push(d.data() as JournalEntryLine));

    // 2. Batch fetch parent journals
    const uniqueJournalIds = Array.from(new Set(rawLines.map(l => l.journalId)));
    const journalMap = new Map<string, JournalEntry>();

    for (const jId of uniqueJournalIds) {
      const jRef = doc(db, 'journalEntries', jId);
      const jSnap = await getDoc(jRef);
      if (jSnap.exists()) {
        journalMap.set(jId, jSnap.data() as JournalEntry);
      }
    }

    // 3. Aggregate by supplierId
    const supplierStatsMap = new Map<
      string,
      {
        totalCreditPaise: number;
        totalDebitPaise: number;
        transactionCount: number;
        lastTransactionDate: string | null;
      }
    >();

    let glTotalPayablePaise = 0;

    for (const line of rawLines) {
      const journal = journalMap.get(line.journalId);
      if (!journal || journal.status !== 'POSTED') continue;

      const dPaise = parseAndValidatePaise(line.debit || 0, 'Line Debit');
      const cPaise = parseAndValidatePaise(line.credit || 0, 'Line Credit');

      if (filters?.fromDate && journal.journalDate < filters.fromDate) continue;
      if (filters?.toDate && journal.journalDate > filters.toDate) continue;

      glTotalPayablePaise += (cPaise - dPaise);

      const suppId = line.supplierId || 'UNKNOWN_SUPPLIER';
      let entry = supplierStatsMap.get(suppId);
      if (!entry) {
        entry = {
          totalCreditPaise: 0,
          totalDebitPaise: 0,
          transactionCount: 0,
          lastTransactionDate: null,
        };
        supplierStatsMap.set(suppId, entry);
      }

      entry.totalCreditPaise += cPaise;
      entry.totalDebitPaise += dPaise;
      entry.transactionCount += 1;
      if (!entry.lastTransactionDate || journal.journalDate > entry.lastTransactionDate) {
        entry.lastTransactionDate = journal.journalDate;
      }
    }

    // 4. Resolve supplier profile details from purchase invoices and credit/debit notes
    const suppliers: SupplierLedgerSummaryItem[] = [];
    const search = filters?.search ? filters.search.trim().toLowerCase() : '';

    let totalOutstandingPayablePaise = 0;
    let suppliersWithBalanceCount = 0;

    for (const [suppId, stats] of supplierStatsMap.entries()) {
      if (suppId === 'UNKNOWN_SUPPLIER') continue;

      const snapshot = await this.resolveSupplierSnapshot(suppId);
      const outstandingPaise = stats.totalCreditPaise - stats.totalDebitPaise;
      totalOutstandingPayablePaise += outstandingPaise;
      if (outstandingPaise > 0) {
        suppliersWithBalanceCount++;
      }

      if (
        search &&
        !suppId.toLowerCase().includes(search) &&
        !snapshot.businessName.toLowerCase().includes(search) &&
        !(snapshot.contactName || '').toLowerCase().includes(search) &&
        !(snapshot.mobile || '').includes(search)
      ) {
        continue;
      }

      suppliers.push({
        supplierId: suppId,
        businessName: snapshot.businessName,
        contactName: snapshot.contactName,
        mobile: snapshot.mobile,
        city: snapshot.city,
        state: snapshot.state,
        gstin: snapshot.gstin,
        totalCredit: paiseToRupees(stats.totalCreditPaise),
        totalDebit: paiseToRupees(stats.totalDebitPaise),
        outstandingBalance: paiseToRupees(outstandingPaise),
        transactionCount: stats.transactionCount,
        lastTransactionDate: stats.lastTransactionDate,
      });
    }

    // Sort: highest outstanding payable balance first
    suppliers.sort((a, b) => b.outstandingBalance - a.outstandingBalance);

    return {
      success: true,
      suppliers,
      totalCount: suppliers.length,
      aggregate: {
        totalOutstandingPayable: paiseToRupees(totalOutstandingPayablePaise),
        totalSuppliersWithBalance: suppliersWithBalanceCount,
        glPayableBalance: paiseToRupees(glTotalPayablePaise),
        isReconciledWithGL: Math.abs(totalOutstandingPayablePaise - glTotalPayablePaise) < 1,
      },
    };
  }

  // =========================================================================
  // SNAPSHOT RESOLUTION HELPERS & CANONICAL IDENTITY
  // =========================================================================

  /**
   * Resolves any party identifier (Firebase Auth UID, userId, legacy doc key, etc.)
   * to the authoritative canonical business retailerId.
   */
  public static async resolveCanonicalRetailerId(rawIdentifier: string): Promise<string | null> {
    if (!rawIdentifier || typeof rawIdentifier !== 'string') return null;
    const cleanId = rawIdentifier.trim();
    if (!cleanId) return null;

    // 1. Direct document check by ID
    try {
      const docSnap = await getDoc(doc(db, 'retailers', cleanId));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.retailerId && typeof data.retailerId === 'string' && data.retailerId.trim()) {
          return data.retailerId.trim();
        }
        return cleanId;
      }
    } catch (err: any) {
      console.warn('Note checking retailer by doc ID:', err?.message);
    }

    // 2. Query by retailerId field
    try {
      const qRetailerId = query(collection(db, 'retailers'), where('retailerId', '==', cleanId), limit(1));
      const snapRetailerId = await getDocs(qRetailerId);
      if (!snapRetailerId.empty) {
        const data = snapRetailerId.docs[0].data();
        return (data.retailerId || snapRetailerId.docs[0].id).trim();
      }
    } catch (err: any) {
      console.warn('Note querying retailer by retailerId:', err?.message);
    }

    // 3. Query by authUid field
    try {
      const qAuthUid = query(collection(db, 'retailers'), where('authUid', '==', cleanId), limit(1));
      const snapAuthUid = await getDocs(qAuthUid);
      if (!snapAuthUid.empty) {
        const data = snapAuthUid.docs[0].data();
        return (data.retailerId || snapAuthUid.docs[0].id).trim();
      }
    } catch (err: any) {
      console.warn('Note querying retailer by authUid:', err?.message);
    }

    // 4. Query by userId field
    try {
      const qUserId = query(collection(db, 'retailers'), where('userId', '==', cleanId), limit(1));
      const snapUserId = await getDocs(qUserId);
      if (!snapUserId.empty) {
        const data = snapUserId.docs[0].data();
        return (data.retailerId || snapUserId.docs[0].id).trim();
      }
    } catch (err: any) {
      console.warn('Note querying retailer by userId:', err?.message);
    }

    return null;
  }

  private static async resolveCustomerSnapshot(customerId: string): Promise<CustomerSnapshotInfo> {
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

    // Secondary check: query by retailerId field or authUid field
    try {
      const qRet = query(collection(db, 'retailers'), where('retailerId', '==', customerId), limit(1));
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

    // Fallback: check salesInvoices for snapshot
    const qInv = query(
      collection(db, 'salesInvoices'),
      where('customerId', '==', customerId)
    );
    const invSnap = await getDocs(qInv);
    if (!invSnap.empty) {
      const invData = invSnap.docs[0].data();
      const snap = invData.billingAddressSnapshot || {};
      return {
        customerId,
        shopName: snap.businessName || 'Kirana Store',
        ownerName: snap.contactName || 'Kirana Owner',
        mobile: snap.mobile || '',
        fullAddress: snap.fullAddress || 'Delhi',
        city: snap.city || 'Delhi',
        state: snap.state || 'Delhi',
        pincode: snap.pincode || '110053',
        gstin: snap.gstin,
      };
    }

    return {
      customerId,
      shopName: `Retailer (${customerId})`,
      ownerName: 'Kirana Owner',
      mobile: '',
      fullAddress: 'Delhi',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110053',
    };
  }

  /**
   * Resolves any supplier identifier to the canonical supplierId.
   */
  public static async resolveCanonicalSupplierId(rawIdentifier: string): Promise<string | null> {
    if (!rawIdentifier || typeof rawIdentifier !== 'string') return null;
    const cleanId = rawIdentifier.trim();
    if (!cleanId) return null;

    // 1. Direct document check in suppliers collection if exists
    try {
      const docSnap = await getDoc(doc(db, 'suppliers', cleanId));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.supplierId && typeof data.supplierId === 'string' && data.supplierId.trim()) {
          return data.supplierId.trim();
        }
        return cleanId;
      }
    } catch {
      // ignore
    }

    // 2. Query suppliers collection by supplierId field
    try {
      const qSupp = query(collection(db, 'suppliers'), where('supplierId', '==', cleanId), limit(1));
      const snap = await getDocs(qSupp);
      if (!snap.empty) {
        const data = snap.docs[0].data();
        return (data.supplierId || snap.docs[0].id).trim();
      }
    } catch {
      // ignore
    }

    // 3. Check purchaseInvoices collection for supplierId
    try {
      const qPI = query(collection(db, 'purchaseInvoices'), where('supplierId', '==', cleanId), limit(1));
      const snapPI = await getDocs(qPI);
      if (!snapPI.empty) {
        const data = snapPI.docs[0].data();
        return (data.supplierId || cleanId).trim();
      }
    } catch {
      // ignore
    }

    // 4. Check creditDebitNotes collection for supplierId
    try {
      const qCDN = query(collection(db, 'creditDebitNotes'), where('supplierId', '==', cleanId), limit(1));
      const snapCDN = await getDocs(qCDN);
      if (!snapCDN.empty) {
        const data = snapCDN.docs[0].data();
        return (data.supplierId || cleanId).trim();
      }
    } catch {
      // ignore
    }

    return cleanId;
  }

  public static async resolveSupplierSnapshot(supplierId: string): Promise<SupplierSnapshotInfo> {
    // Check direct suppliers master collection
    try {
      const suppRef = doc(db, 'suppliers', supplierId);
      const suppSnap = await getDoc(suppRef);
      if (suppSnap.exists()) {
        const data = suppSnap.data();
        return {
          supplierId,
          businessName: (data.businessName || data.name || data.shopName || `Supplier (${supplierId})`).trim(),
          contactName: data.contactName,
          mobile: data.mobile || data.phone || data.mobileNumber,
          fullAddress: data.fullAddress || data.address,
          city: data.city || 'Delhi',
          state: data.state || 'Delhi',
          pincode: data.pincode,
          gstin: data.gstin || data.gstNumber,
        };
      }
    } catch {
      // ignore
    }

    // Check purchaseInvoices for billing snapshot
    const qPI = query(
      collection(db, 'purchaseInvoices'),
      where('supplierId', '==', supplierId)
    );
    const piSnap = await getDocs(qPI);
    if (!piSnap.empty) {
      const piData = piSnap.docs[0].data();
      const snap = piData.billingAddressSnapshot || {};
      return {
        supplierId,
        businessName: snap.businessName || `Supplier (${supplierId})`,
        contactName: snap.contactName,
        mobile: snap.mobile,
        fullAddress: snap.fullAddress,
        city: snap.city || 'Delhi',
        state: snap.state || 'Delhi',
        pincode: snap.pincode,
        gstin: snap.gstin,
      };
    }

    // Check creditDebitNotes
    const qCDN = query(
      collection(db, 'creditDebitNotes'),
      where('supplierId', '==', supplierId)
    );
    const cdnSnap = await getDocs(qCDN);
    if (!cdnSnap.empty) {
      const cdnData = cdnSnap.docs[0].data();
      const snap = cdnData.supplierSnapshot || {};
      return {
        supplierId,
        businessName: snap.businessName || `Supplier (${supplierId})`,
        contactName: snap.contactName,
        mobile: snap.mobile,
        fullAddress: snap.fullAddress,
        city: snap.city || 'Delhi',
        state: snap.state || 'Delhi',
        pincode: snap.pincode,
        gstin: snap.gstin,
      };
    }

    return {
      supplierId,
      businessName: `Supplier (${supplierId})`,
      city: 'Delhi',
      state: 'Delhi',
    };
  }
}
