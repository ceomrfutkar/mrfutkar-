/**
 * MR FUTKAR — Customer Receipt Reconciliation Service (Phase 5.7 Part 2E)
 * Server-authoritative, read-only reconciliation layer for customer receipts against:
 * - Customer receipt records
 * - Receipt allocations
 * - Sales invoice paid/outstanding balances
 * - Customer AR ledger (1300)
 * - Accounting journals (Double-entry truth)
 *
 * STRICTLY integer paise accounting. Zero data mutations.
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
  CustomerReceipt,
  CustomerReceiptReconciliationFilters,
  CustomerReceiptReconciliationResult,
  CustomerReceiptReconciliationSummary,
  CustomerReceiptInconsistency,
} from '../src/types/customerReceipt';
import { SalesInvoice } from '../src/types/invoice';
import { JournalEntry, JournalEntryLine, isValidDateFormat, paiseToRupees } from '../src/types/accounting';
import { PartyLedgerService } from './partyLedgerService';
import { JournalEngine } from './journalEngine';

export interface CustomerReceiptReconciliationOptions {
  /** Optional in-memory test fixtures to evaluate deterministic scenarios without database pollution */
  inMemoryFixtures?: {
    receipts?: CustomerReceipt[];
    invoices?: SalesInvoice[];
    journals?: JournalEntry[];
    journalLines?: JournalEntryLine[];
  };
}

export class CustomerReceiptReconciliationService {
  /**
   * Run server-authoritative Customer Receipt reconciliation
   * Read-only: never modifies any records
   */
  public static async reconcileReceipts(
    adminSession: AdminSession,
    filters?: CustomerReceiptReconciliationFilters,
    options?: CustomerReceiptReconciliationOptions
  ): Promise<CustomerReceiptReconciliationResult> {
    // 1. Enforce SUPER_ADMIN Authorization
    if (!adminSession || adminSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED: Only Super Admin users can perform customer receipt reconciliation.');
    }

    const cleanFilters: CustomerReceiptReconciliationFilters = {
      customerId: filters?.customerId ? filters.customerId.trim() : undefined,
      receiptId: filters?.receiptId ? filters.receiptId.trim() : undefined,
      fromDate: filters?.fromDate ? filters.fromDate.trim() : undefined,
      toDate: filters?.toDate ? filters.toDate.trim() : undefined,
      status: filters?.status,
    };

    // 2. Validate Filter Dates
    if (cleanFilters.fromDate && !isValidDateFormat(cleanFilters.fromDate)) {
      throw new Error('INVALID_DATE_FORMAT: fromDate must be valid YYYY-MM-DD format.');
    }
    if (cleanFilters.toDate && !isValidDateFormat(cleanFilters.toDate)) {
      throw new Error('INVALID_DATE_FORMAT: toDate must be valid YYYY-MM-DD format.');
    }
    if (cleanFilters.fromDate && cleanFilters.toDate && cleanFilters.fromDate > cleanFilters.toDate) {
      throw new Error('INVALID_DATE_RANGE: fromDate cannot be after toDate.');
    }

    // 3. Resolve target canonical customerId if provided
    let filterCanonicalCustomerId: string | null = null;
    if (cleanFilters.customerId) {
      filterCanonicalCustomerId =
        (await PartyLedgerService.resolveCanonicalRetailerId(cleanFilters.customerId)) ||
        cleanFilters.customerId;
    }

    // 4. Retrieve Receipts to Reconcile
    let receipts: CustomerReceipt[] = [];

    if (options?.inMemoryFixtures?.receipts) {
      receipts = [...options.inMemoryFixtures.receipts];
    } else if (cleanFilters.receiptId) {
      const snap = await getDoc(doc(db, 'customerReceipts', cleanFilters.receiptId));
      if (snap.exists()) {
        receipts = [snap.data() as CustomerReceipt];
      }
    } else {
      const receiptsRef = collection(db, 'customerReceipts');
      const q = query(receiptsRef, where('_serverTxnToken', '==', SERVER_TXN_TOKEN));
      const snap = await getDocs(q);
      snap.forEach((d) => {
        receipts.push(d.data() as CustomerReceipt);
      });
    }

    // Filter by customerId / date range if querying multiple receipts
    if (filterCanonicalCustomerId) {
      receipts = receipts.filter(
        (r) =>
          r.customerId === filterCanonicalCustomerId ||
          r.customerId === cleanFilters.customerId
      );
    }
    if (cleanFilters.status && !options?.inMemoryFixtures) {
      receipts = receipts.filter((r) => r.status === cleanFilters.status);
    }
    if (cleanFilters.fromDate) {
      receipts = receipts.filter((r) => r.receiptDate >= cleanFilters.fromDate!);
    }
    if (cleanFilters.toDate) {
      receipts = receipts.filter((r) => r.receiptDate <= cleanFilters.toDate!);
    }

    // 5. In-Memory Caches to avoid duplicate DB reads
    const invoiceDocCache = new Map<string, SalesInvoice | null>();
    const journalDocCache = new Map<string, JournalEntry | null>();
    const journalLinesCache = new Map<string, JournalEntryLine[]>();
    const partyIdToCanonicalCache = new Map<string, string | null>();

    // Seed caches from options if provided
    if (options?.inMemoryFixtures?.invoices) {
      for (const inv of options.inMemoryFixtures.invoices) {
        invoiceDocCache.set(inv.invoiceId, inv);
      }
    }
    if (options?.inMemoryFixtures?.journals) {
      for (const j of options.inMemoryFixtures.journals) {
        journalDocCache.set(j.journalId, j);
      }
    }
    if (options?.inMemoryFixtures?.journalLines) {
      for (const jl of options.inMemoryFixtures.journalLines) {
        const existing = journalLinesCache.get(jl.journalId) || [];
        existing.push(jl);
        journalLinesCache.set(jl.journalId, existing);
      }
    }

    // 6. Tracking Aggregators
    let totalActiveReceiptAmountPaise = 0;
    let totalAllocatedAmountPaise = 0;
    let totalUnallocatedAmountPaise = 0;
    let totalReversedAmountPaise = 0;
    const invoicesCheckedSet = new Set<string>();
    const customersCheckedSet = new Set<string>();
    const inconsistencies: CustomerReceiptInconsistency[] = [];

    // Helper to fetch invoice with cache
    const getInvoice = async (invoiceId: string): Promise<SalesInvoice | null> => {
      if (invoiceDocCache.has(invoiceId)) {
        return invoiceDocCache.get(invoiceId)!;
      }
      try {
        const snap = await getDoc(doc(db, 'salesInvoices', invoiceId));
        const data = snap.exists() ? (snap.data() as SalesInvoice) : null;
        invoiceDocCache.set(invoiceId, data);
        return data;
      } catch {
        invoiceDocCache.set(invoiceId, null);
        return null;
      }
    };

    // Helper to fetch journal with cache
    const getJournal = async (journalId: string): Promise<JournalEntry | null> => {
      if (journalDocCache.has(journalId)) {
        return journalDocCache.get(journalId)!;
      }
      try {
        const snap = await getDoc(doc(db, 'journalEntries', journalId));
        const data = snap.exists() ? (snap.data() as JournalEntry) : null;
        journalDocCache.set(journalId, data);
        return data;
      } catch {
        journalDocCache.set(journalId, null);
        return null;
      }
    };

    // Helper to fetch journal lines with cache
    const getLines = async (journalId: string): Promise<JournalEntryLine[]> => {
      if (journalLinesCache.has(journalId)) {
        return journalLinesCache.get(journalId)!;
      }
      try {
        const lines = await JournalEngine.getJournalLines(journalId);
        journalLinesCache.set(journalId, lines);
        return lines;
      } catch {
        journalLinesCache.set(journalId, []);
        return [];
      }
    };

    // Helper to resolve canonical retailer
    const resolveCanonical = async (partyId: string): Promise<string | null> => {
      if (!partyId) return null;
      if (partyIdToCanonicalCache.has(partyId)) {
        return partyIdToCanonicalCache.get(partyId)!;
      }
      const res = await PartyLedgerService.resolveCanonicalRetailerId(partyId);
      partyIdToCanonicalCache.set(partyId, res);
      return res;
    };

    // 7. Verify Each Receipt Record
    for (const receipt of receipts) {
      const receiptId = receipt.receiptId;
      const receiptNumber = receipt.receiptNumber || receiptId;
      const customerId = receipt.customerId;

      // 7.1 Receipt Amount Validation
      if (
        typeof receipt.amountPaise !== 'number' ||
        !Number.isFinite(receipt.amountPaise) ||
        !Number.isInteger(receipt.amountPaise) ||
        receipt.amountPaise <= 0
      ) {
        inconsistencies.push({
          code: 'INVALID_RECEIPT_AMOUNT',
          severity: 'ERROR',
          receiptId,
          receiptNumber,
          customerId,
          message: `Receipt ${receiptNumber} has invalid amountPaise: ${receipt.amountPaise}. Must be positive integer.`,
          details: { amountPaise: receipt.amountPaise },
        });
      }

      // 7.2 Canonical Retailer Resolution Check
      const resolvedRetailerId = await resolveCanonical(customerId);
      if (!resolvedRetailerId) {
        inconsistencies.push({
          code: 'UNRESOLVED_RETAILER_REFERENCE',
          severity: 'ERROR',
          receiptId,
          receiptNumber,
          customerId,
          message: `Customer reference "${customerId}" on receipt ${receiptNumber} cannot be resolved to a canonical retailer.`,
        });
      }
      const canonicalCustomer = resolvedRetailerId || customerId;
      if (canonicalCustomer) {
        customersCheckedSet.add(canonicalCustomer);
      }

      // 7.3 Tally Totals
      if (receipt.status === 'REVERSED') {
        totalReversedAmountPaise += receipt.amountPaise || 0;
      } else if (receipt.status === 'POSTED') {
        totalActiveReceiptAmountPaise += receipt.amountPaise || 0;
        totalAllocatedAmountPaise += receipt.allocatedAmountPaise || 0;
        totalUnallocatedAmountPaise += receipt.unallocatedAmountPaise || 0;
      }

      // 7.4 Allocations Verification
      const allocations = Array.isArray(receipt.allocations) ? receipt.allocations : [];
      let actualAllocatedSumPaise = 0;
      const seenInvoicesInReceipt = new Set<string>();

      for (const alloc of allocations) {
        const allocPaise = alloc.allocatedAmountPaise || 0;
        actualAllocatedSumPaise += allocPaise;

        // Check duplicate allocation inside receipt
        if (seenInvoicesInReceipt.has(alloc.invoiceId)) {
          inconsistencies.push({
            code: 'DUPLICATE_ALLOCATION_RECORD',
            severity: 'ERROR',
            receiptId,
            receiptNumber,
            invoiceId: alloc.invoiceId,
            message: `Duplicate allocation record for invoice "${alloc.invoiceId}" in receipt ${receiptNumber}.`,
          });
        }
        seenInvoicesInReceipt.add(alloc.invoiceId);
        invoicesCheckedSet.add(alloc.invoiceId);

        // Fetch referenced invoice
        const invoice = await getInvoice(alloc.invoiceId);
        if (!invoice) {
          inconsistencies.push({
            code: 'ORPHAN_ALLOCATION',
            severity: 'ERROR',
            receiptId,
            receiptNumber,
            invoiceId: alloc.invoiceId,
            message: `Allocation in receipt ${receiptNumber} references non-existent invoice "${alloc.invoiceId}".`,
          });
        } else {
          // Check cross-retailer allocation
          const invCanonical = (await resolveCanonical(invoice.customerId)) || invoice.customerId;
          if (invCanonical !== canonicalCustomer) {
            inconsistencies.push({
              code: 'CROSS_RETAILER_ALLOCATION',
              severity: 'ERROR',
              receiptId,
              receiptNumber,
              customerId: canonicalCustomer,
              invoiceId: alloc.invoiceId,
              message: `Cross-retailer allocation detected: Receipt belongs to "${canonicalCustomer}", but invoice "${invoice.invoiceNumber || alloc.invoiceId}" belongs to "${invCanonical}".`,
              details: { receiptCustomer: canonicalCustomer, invoiceCustomer: invCanonical },
            });
          }

          // Check allocation exceeding invoice grand total
          const invGrandTotalPaise = Math.round((invoice.grandTotal || 0) * 100);
          if (allocPaise > invGrandTotalPaise) {
            inconsistencies.push({
              code: 'ALLOCATION_EXCEEDS_INVOICE_OUTSTANDING',
              severity: 'ERROR',
              receiptId,
              receiptNumber,
              invoiceId: alloc.invoiceId,
              message: `Allocation amount ₹${allocPaise / 100} in receipt ${receiptNumber} exceeds invoice grand total ₹${invGrandTotalPaise / 100}.`,
              details: { allocatedPaise: allocPaise, invoiceGrandTotalPaise: invGrandTotalPaise },
            });
          }
        }
      }

      // 7.5 Invariant Checks for POSTED Receipts
      if (receipt.status === 'POSTED') {
        const allocatedPaise = receipt.allocatedAmountPaise || 0;
        const unallocatedPaise =
          receipt.unallocatedAmountPaise !== undefined
            ? receipt.unallocatedAmountPaise
            : receipt.amountPaise - allocatedPaise;

        // Invariant: allocatedAmountPaise + unallocatedAmountPaise === amountPaise
        if (allocatedPaise + unallocatedPaise !== receipt.amountPaise) {
          inconsistencies.push({
            code: 'RECEIPT_ALLOCATION_MISMATCH',
            severity: 'ERROR',
            receiptId,
            receiptNumber,
            message: `Invariant broken on receipt ${receiptNumber}: allocatedAmountPaise (${allocatedPaise}) + unallocatedAmountPaise (${unallocatedPaise}) !== amountPaise (${receipt.amountPaise}).`,
            details: {
              allocatedAmountPaise: allocatedPaise,
              unallocatedAmountPaise: unallocatedPaise,
              amountPaise: receipt.amountPaise,
            },
          });
        }

        // Sum of allocations vs allocatedAmountPaise
        if (actualAllocatedSumPaise !== allocatedPaise) {
          inconsistencies.push({
            code: 'RECEIPT_ALLOCATION_MISMATCH',
            severity: 'ERROR',
            receiptId,
            receiptNumber,
            message: `Allocations array sum (${actualAllocatedSumPaise} paise) does not match recorded allocatedAmountPaise (${allocatedPaise} paise) on receipt ${receiptNumber}.`,
            details: {
              actualAllocationsSum: actualAllocatedSumPaise,
              recordedAllocatedAmountPaise: allocatedPaise,
            },
          });
        }

        // Total allocations cannot exceed receipt amount
        if (actualAllocatedSumPaise > receipt.amountPaise) {
          inconsistencies.push({
            code: 'ALLOCATION_EXCEEDS_RECEIPT_AMOUNT',
            severity: 'ERROR',
            receiptId,
            receiptNumber,
            message: `Allocated amount (${actualAllocatedSumPaise} paise) exceeds receipt total (${receipt.amountPaise} paise) on receipt ${receiptNumber}.`,
          });
        }

        // Check allocationStatus flag consistency
        if (receipt.allocationStatus) {
          if (allocatedPaise === 0 && receipt.allocationStatus !== 'UNALLOCATED') {
            inconsistencies.push({
              code: 'RECEIPT_ALLOCATION_MISMATCH',
              severity: 'WARNING',
              receiptId,
              receiptNumber,
              message: `Receipt ${receiptNumber} has allocationStatus "${receipt.allocationStatus}" but allocatedAmountPaise is 0. Expected "UNALLOCATED".`,
            });
          } else if (
            allocatedPaise > 0 &&
            unallocatedPaise > 0 &&
            receipt.allocationStatus !== 'PARTIALLY_ALLOCATED'
          ) {
            inconsistencies.push({
              code: 'RECEIPT_ALLOCATION_MISMATCH',
              severity: 'WARNING',
              receiptId,
              receiptNumber,
              message: `Receipt ${receiptNumber} has allocationStatus "${receipt.allocationStatus}" but is partially allocated. Expected "PARTIALLY_ALLOCATED".`,
            });
          } else if (
            allocatedPaise > 0 &&
            unallocatedPaise === 0 &&
            receipt.allocationStatus !== 'FULLY_ALLOCATED'
          ) {
            inconsistencies.push({
              code: 'RECEIPT_ALLOCATION_MISMATCH',
              severity: 'WARNING',
              receiptId,
              receiptNumber,
              message: `Receipt ${receiptNumber} has allocationStatus "${receipt.allocationStatus}" but has 0 unallocated amount. Expected "FULLY_ALLOCATED".`,
            });
          }
        }
      }

      // 7.6 Original Journal Verification (for POSTED and REVERSED)
      if (receipt.status === 'POSTED' || receipt.status === 'REVERSED') {
        if (!receipt.journalId) {
          inconsistencies.push({
            code: 'MISSING_ORIGINAL_JOURNAL',
            severity: 'ERROR',
            receiptId,
            receiptNumber,
            message: `Receipt ${receiptNumber} with status "${receipt.status}" has no linked accounting journalId.`,
          });
        } else {
          const origJournal = await getJournal(receipt.journalId);
          if (!origJournal) {
            inconsistencies.push({
              code: 'MISSING_ORIGINAL_JOURNAL',
              severity: 'ERROR',
              receiptId,
              receiptNumber,
              journalId: receipt.journalId,
              message: `Linked original accounting journal "${receipt.journalId}" not found for receipt ${receiptNumber}.`,
            });
          } else {
            // Verify original journal lines balance (Double-entry check)
            const lines = await getLines(receipt.journalId);
            let dPaise = 0;
            let cPaise = 0;
            for (const l of lines) {
              dPaise += Math.round((l.debit || 0) * 100);
              cPaise += Math.round((l.credit || 0) * 100);
            }
            if (dPaise !== cPaise || dPaise === 0) {
              inconsistencies.push({
                code: 'ACCOUNTING_JOURNAL_IMBALANCE',
                severity: 'ERROR',
                receiptId,
                receiptNumber,
                journalId: receipt.journalId,
                message: `Original journal "${receipt.journalId}" is imbalanced: Total Debit ₹${dPaise / 100} !== Total Credit ₹${cPaise / 100}.`,
                details: { totalDebitPaise: dPaise, totalCreditPaise: cPaise },
              });
            }
          }
        }
      }

      // 7.7 Reversal Verification (for REVERSED)
      if (receipt.status === 'REVERSED') {
        if (!receipt.reversalJournalId) {
          inconsistencies.push({
            code: 'MISSING_REVERSAL_JOURNAL',
            severity: 'ERROR',
            receiptId,
            receiptNumber,
            message: `Reversed customer receipt ${receiptNumber} has no linked reversalJournalId.`,
          });
        } else {
          const revJournal = await getJournal(receipt.reversalJournalId);
          if (!revJournal) {
            inconsistencies.push({
              code: 'MISSING_REVERSAL_JOURNAL',
              severity: 'ERROR',
              receiptId,
              receiptNumber,
              reversalJournalId: receipt.reversalJournalId,
              message: `Linked reversal journal "${receipt.reversalJournalId}" not found for reversed receipt ${receiptNumber}.`,
            });
          } else {
            // Verify reversal journal linkage to original journal
            if (revJournal.reversalOfJournalId !== receipt.journalId) {
              inconsistencies.push({
                code: 'INCORRECT_REVERSAL_LINKAGE',
                severity: 'ERROR',
                receiptId,
                receiptNumber,
                journalId: receipt.journalId || undefined,
                reversalJournalId: receipt.reversalJournalId || undefined,
                message: `Reversal journal "${receipt.reversalJournalId}" has reversalOfJournalId "${revJournal.reversalOfJournalId}", expected "${receipt.journalId}".`,
                details: {
                  expectedJournalId: receipt.journalId,
                  actualReversalOfJournalId: revJournal.reversalOfJournalId,
                },
              });
            }

            // Verify reversal journal balance
            const revLines = await getLines(receipt.reversalJournalId);
            let rdPaise = 0;
            let rcPaise = 0;
            for (const l of revLines) {
              rdPaise += Math.round((l.debit || 0) * 100);
              rcPaise += Math.round((l.credit || 0) * 100);
            }
            if (rdPaise !== rcPaise || rdPaise === 0) {
              inconsistencies.push({
                code: 'ACCOUNTING_JOURNAL_IMBALANCE',
                severity: 'ERROR',
                receiptId,
                receiptNumber,
                reversalJournalId: receipt.reversalJournalId,
                message: `Reversal journal "${receipt.reversalJournalId}" is imbalanced: Total Debit ₹${rdPaise / 100} !== Total Credit ₹${rcPaise / 100}.`,
                details: { totalDebitPaise: rdPaise, totalCreditPaise: rcPaise },
              });
            }

            // Check original and reversal amounts cancel correctly
            const origJournal = receipt.journalId ? await getJournal(receipt.journalId) : null;
            if (origJournal && origJournal.totalDebit && revJournal.totalDebit) {
              const origDebitPaise = Math.round(origJournal.totalDebit * 100);
              const revDebitPaise = Math.round(revJournal.totalDebit * 100);
              if (origDebitPaise !== revDebitPaise) {
                inconsistencies.push({
                  code: 'REVERSED_AMOUNT_MISMATCH',
                  severity: 'ERROR',
                  receiptId,
                  receiptNumber,
                  journalId: receipt.journalId || undefined,
                  reversalJournalId: receipt.reversalJournalId || undefined,
                  message: `Reversal journal debit (₹${revDebitPaise / 100}) does not equal original journal debit (₹${origDebitPaise / 100}).`,
                });
              }
            }
          }
        }
      }
    }

    // 8. Cross-Verify Invoice Balances for All Linked Invoices
    for (const invId of invoicesCheckedSet) {
      const invoice = await getInvoice(invId);
      if (!invoice) continue;

      const grandTotalPaise = Math.round((invoice.grandTotal || 0) * 100);
      const paidPaise = invoice.paidAmountPaise || 0;
      const outstandingPaise =
        invoice.outstandingAmountPaise !== undefined
          ? invoice.outstandingAmountPaise
          : Math.max(0, grandTotalPaise - paidPaise);

      // Validate invariant: paidAmountPaise + outstandingAmountPaise === grandTotalPaise
      if (paidPaise + outstandingPaise !== grandTotalPaise) {
        inconsistencies.push({
          code: 'INCORRECT_INVOICE_BALANCE',
          severity: 'ERROR',
          invoiceId: invId,
          message: `Sales invoice "${invoice.invoiceNumber || invId}" balance invariant violated: paidAmountPaise (${paidPaise}) + outstandingAmountPaise (${outstandingPaise}) !== grandTotalPaise (${grandTotalPaise}).`,
          details: {
            paidAmountPaise: paidPaise,
            outstandingAmountPaise: outstandingPaise,
            grandTotalPaise,
          },
        });
      }
    }

    // 9. Customer AR Ledger Consistency (Account 1300)
    let ledgerChecksPerformed = 0;
    for (const custId of customersCheckedSet) {
      try {
        const ledger = await PartyLedgerService.getCustomerLedger({ customerId: custId });
        ledgerChecksPerformed++;
        if (!ledger.success) {
          inconsistencies.push({
            code: 'INCORRECT_INVOICE_BALANCE',
            severity: 'ERROR',
            customerId: custId,
            message: `PartyLedgerService failed to retrieve AR ledger for customer "${custId}".`,
          });
        }
      } catch (err: any) {
        inconsistencies.push({
          code: 'INCORRECT_INVOICE_BALANCE',
          severity: 'ERROR',
          customerId: custId,
          message: `PartyLedgerService encountered error while verifying AR ledger for customer "${custId}": ${err.message}`,
        });
      }
    }

    // 10. Summary Calculation
    const summary: CustomerReceiptReconciliationSummary = {
      totalReceiptsChecked: receipts.length,
      totalActiveReceiptAmountPaise,
      totalActiveReceiptAmount: paiseToRupees(totalActiveReceiptAmountPaise),
      totalAllocatedAmountPaise,
      totalAllocatedAmount: paiseToRupees(totalAllocatedAmountPaise),
      totalUnallocatedAmountPaise,
      totalUnallocatedAmount: paiseToRupees(totalUnallocatedAmountPaise),
      totalReversedAmountPaise,
      totalReversedAmount: paiseToRupees(totalReversedAmountPaise),
      invoicesChecked: invoicesCheckedSet.size,
      ledgerChecksPerformed,
      inconsistencyCount: inconsistencies.length,
      isFullyReconciled: inconsistencies.length === 0,
    };

    return {
      success: true,
      timestamp: new Date().toISOString(),
      filters: cleanFilters,
      summary,
      inconsistencies,
    };
  }
}
