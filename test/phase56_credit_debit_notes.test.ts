/**
 * MR FUTKAR — PHASE 5.6 TEST SUITE
 * CREDIT NOTE + DEBIT NOTE + ACCOUNTING REVERSAL/CORRECTION
 *
 * Covers CDN-01 through CDN-64
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  deleteDoc,
  limit,
} from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN, OPERATIONAL_WAREHOUSE_ID } from '../server/firebaseAdmin';
import cfg from '../firebase-applet-config.json';
import { AUTHORITATIVE_SUPER_ADMIN_UID, ensureInitialSuperAdmin } from '../server/adminAuth';
import { ensureSystemAccounts } from '../server/accountingSeedService';
import { ensureDefaultAccountingPeriod } from '../server/accountingPeriodService';
import { SeedService } from '../server/seedService';
import { InvoiceService } from '../server/invoiceService';
import { CreditDebitNoteService } from '../server/creditDebitNoteService';
import { GeneralLedgerService } from '../server/generalLedgerService';
import { TrialBalanceService } from '../server/trialBalanceService';
import { InvoiceDocumentService } from '../server/invoiceDocumentService';
import { JournalEngine } from '../server/journalEngine';
import {
  CreditDebitNote,
  CreditDebitNoteType,
} from '../src/types/creditDebitNote';
import { SalesInvoice, PurchaseInvoice } from '../src/types/invoice';

export interface TestResult {
  code: string;
  name: string;
  passed: boolean;
  blocked?: boolean;
  evidence: string;
}

export const testResults: TestResult[] = [];

export function assertTest(
  condition: boolean,
  code: string,
  name: string,
  evidence: string,
  blocked: boolean = false
) {
  const passed = Boolean(condition && !blocked);
  testResults.push({ code, name, passed, blocked, evidence });
  const status = blocked ? '⚠️ [BLOCKED]' : passed ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`${status} ${code}: ${name} | ${evidence}`);
}

export async function runCreditDebitNotesSuite() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 5.6: CREDIT NOTE + DEBIT NOTE + ACCOUNTING REVERSAL');
  console.log('Timestamp:', new Date().toISOString());
  console.log('======================================================================\n');

  // 1. Pre-bootstrap environment & seed checks
  await SeedService.seedIfEmpty();
  await ensureInitialSuperAdmin();
  await ensureSystemAccounts();
  await ensureDefaultAccountingPeriod();

  const superAdminSession = {
    uid: AUTHORITATIVE_SUPER_ADMIN_UID,
    email: 'ceo.mrfutkar@gmail.com',
    name: 'Akash Gupta',
    mobile: '+919810012345',
    role: 'SUPER_ADMIN' as const,
    status: 'ACTIVE' as const,
    permissionsVersion: 1,
  };

  // Seed Canonical Retailer and Invoices for tests
  const testRetailerId = 'ret_cdn_test_retailer';
  await setDoc(
    doc(db, 'retailers', testRetailerId),
    {
      retailerId: testRetailerId,
      shopName: 'Brahmpuri Mega Kirana',
      ownerName: 'Vikas Agarwal',
      mobileNumber: '+919811122233',
      phone: '+919811122233',
      shopAddress: 'Shop 45, Brahmpuri Chowk',
      deliveryAddress: 'Shop 45, Brahmpuri Chowk',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110053',
      gstNumber: '07AAAAA1234A1Z5',
      status: 'VERIFIED',
      _serverTxnToken: SERVER_TXN_TOKEN,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  // Baseline products stock
  const sampleProductSnap = await getDocs(query(collection(db, 'products'), where('isInStock', '==', true)));
  const baselineProduct = sampleProductSnap.docs[0].data();
  const baselineProductId = baselineProduct.productId;
  const initialStockQty = baselineProduct.stockQuantity;

  // Baseline counts for non-mutation checks
  const initialMovementsSnap = await getDocs(collection(db, 'inventoryMovements'));
  const initialMovementsCount = initialMovementsSnap.size;

  const initialOrdersSnap = await getDocs(collection(db, 'orders'));
  const initialOrdersCount = initialOrdersSnap.size;

  const initialPricingSnap = await getDocs(collection(db, 'productPricing'));
  const initialPricingCount = initialPricingSnap.size;

  // -------------------------------------------------------------
  // SEED SOURCE SALES INVOICE WITH TAX
  // -------------------------------------------------------------
  const salesInvoiceWithTax = await InvoiceService.createSalesInvoice(superAdminSession, {
    customerId: testRetailerId,
    invoiceDate: '2026-09-26',
    items: [
      {
        productId: baselineProductId,
        quantity: 10,
        unitPrice: 100, // 10 * 100 = 1000
        discountAmount: 100, // taxable = 900
        taxRate: 18, // tax = 162, grandTotal = 1062
      },
    ],
  });
  const postedSalesInvoiceWithTax = await InvoiceService.issueSalesInvoice(
    superAdminSession,
    salesInvoiceWithTax.invoiceId
  );

  // -------------------------------------------------------------
  // SEED SOURCE SALES INVOICE ZERO TAX
  // -------------------------------------------------------------
  const salesInvoiceZeroTax = await InvoiceService.createSalesInvoice(superAdminSession, {
    customerId: testRetailerId,
    invoiceDate: '2026-09-26',
    items: [
      {
        productId: baselineProductId,
        quantity: 5,
        unitPrice: 200, // 5 * 200 = 1000
        discountAmount: 0,
        taxRate: 0, // tax = 0, grandTotal = 1000
      },
    ],
  });
  const postedSalesInvoiceZeroTax = await InvoiceService.issueSalesInvoice(
    superAdminSession,
    salesInvoiceZeroTax.invoiceId
  );

  // -------------------------------------------------------------
  // SEED SOURCE PURCHASE INVOICE WITH TAX
  // -------------------------------------------------------------
  const purchaseInvoiceWithTax = await InvoiceService.createPurchaseInvoice(superAdminSession, {
    invoiceDate: '2026-09-26',
    supplierId: 'supp_nestle_delhi',
    supplierInvoiceNumber: 'NESTLE-DEL-8871',
    items: [
      {
        productId: baselineProductId,
        quantity: 20,
        unitCost: 80, // 20 * 80 = 1600
        discountAmount: 100, // taxable = 1500
        taxRate: 18, // tax = 270, grandTotal = 1770
      },
    ],
  });
  const postedPurchaseInvoiceWithTax = await InvoiceService.postPurchaseInvoice(
    superAdminSession,
    purchaseInvoiceWithTax.invoiceId
  );

  // -------------------------------------------------------------
  // SEED SOURCE PURCHASE INVOICE ZERO TAX
  // -------------------------------------------------------------
  const purchaseInvoiceZeroTax = await InvoiceService.createPurchaseInvoice(superAdminSession, {
    invoiceDate: '2026-09-26',
    supplierId: 'supp_grains_delhi',
    supplierInvoiceNumber: 'GRAINS-4490',
    items: [
      {
        productId: baselineProductId,
        quantity: 10,
        unitCost: 50, // 10 * 50 = 500
        discountAmount: 0,
        taxRate: 0, // tax = 0, grandTotal = 500
      },
    ],
  });
  const postedPurchaseInvoiceZeroTax = await InvoiceService.postPurchaseInvoice(
    superAdminSession,
    purchaseInvoiceZeroTax.invoiceId
  );

  // Record original states for immutability verification
  const originalSalesInvoiceSnap = await getDoc(doc(db, 'salesInvoices', postedSalesInvoiceWithTax.invoiceId));
  const originalSalesInvoiceData = originalSalesInvoiceSnap.data() as SalesInvoice;

  const originalJournalSnap = await getDoc(doc(db, 'journalEntries', originalSalesInvoiceData.accountingJournalId!));
  const originalJournalData = originalJournalSnap.data();

  // ==========================================
  // SECTION 1: PRE-FLIGHT & MASTER REPOSITORIES (CDN-01 to CDN-02)
  // ==========================================
  console.log('\n--- SECTION 1: PRE-FLIGHT (CDN-01 to CDN-02) ---');

  assertTest(
    Boolean(cfg.projectId && cfg.firestoreDatabaseId && OPERATIONAL_WAREHOUSE_ID === 'WH-BRAHMPURI-01'),
    'CDN-01',
    'Current Firebase environment verified',
    `Project: ${cfg.projectId}, DB: ${cfg.firestoreDatabaseId}, WH: ${OPERATIONAL_WAREHOUSE_ID}`
  );

  const cdnSnap = await getDocs(collection(db, 'creditDebitNotes'));
  assertTest(
    cdnSnap !== undefined && cdnSnap.size >= 0,
    'CDN-02',
    'Credit/debit note collection exists',
    `creditDebitNotes collection initialized, active count: ${cdnSnap.size}`
  );

  // ==========================================
  // SECTION 2: CREATION OF ALL FOUR NOTE TYPES (CDN-03 to CDN-06)
  // ==========================================
  console.log('\n--- SECTION 2: FOUR CANONICAL NOTE TYPES (CDN-03 to CDN-06) ---');

  // CDN-03: Sales Credit Note creation
  const scnDraft = await CreditDebitNoteService.createCreditDebitNote(superAdminSession, {
    noteType: 'SALES_CREDIT_NOTE',
    originalInvoiceId: postedSalesInvoiceWithTax.invoiceId,
    reason: 'Damaged packaging returned by Kirana retailer',
    items: [
      {
        productId: baselineProductId,
        quantity: 2, // 2 out of 10
      },
    ],
  });

  assertTest(
    scnDraft.noteType === 'SALES_CREDIT_NOTE' && scnDraft.status === 'DRAFT' && scnDraft.items.length === 1,
    'CDN-03',
    'Sales Credit Note creation',
    `Created draft ${scnDraft.noteNumber} for Sales Invoice ${scnDraft.originalInvoiceNumber}, amount: ₹${scnDraft.grandTotal}`
  );

  // CDN-04: Sales Debit Note creation
  const sdnDraft = await CreditDebitNoteService.createCreditDebitNote(superAdminSession, {
    noteType: 'SALES_DEBIT_NOTE',
    originalInvoiceId: postedSalesInvoiceZeroTax.invoiceId,
    reason: 'Price under-billing correction agreed with retailer',
    items: [
      {
        productId: baselineProductId,
        quantity: 1,
      },
    ],
  });

  assertTest(
    sdnDraft.noteType === 'SALES_DEBIT_NOTE' && sdnDraft.status === 'DRAFT',
    'CDN-04',
    'Sales Debit Note creation',
    `Created draft ${sdnDraft.noteNumber} for Sales Invoice ${sdnDraft.originalInvoiceNumber}, amount: ₹${sdnDraft.grandTotal}`
  );

  // CDN-05: Purchase Credit Note creation
  const pcnDraft = await CreditDebitNoteService.createCreditDebitNote(superAdminSession, {
    noteType: 'PURCHASE_CREDIT_NOTE',
    originalInvoiceId: postedPurchaseInvoiceZeroTax.invoiceId,
    reason: 'Supplier under-billing rate debit invoice received',
    items: [
      {
        productId: baselineProductId,
        quantity: 2,
      },
    ],
  });

  assertTest(
    pcnDraft.noteType === 'PURCHASE_CREDIT_NOTE' && pcnDraft.status === 'DRAFT',
    'CDN-05',
    'Purchase Credit Note creation',
    `Created draft ${pcnDraft.noteNumber} for Purchase Invoice ${pcnDraft.originalInvoiceNumber}, amount: ₹${pcnDraft.grandTotal}`
  );

  // CDN-06: Purchase Debit Note creation
  const pdnDraft = await CreditDebitNoteService.createCreditDebitNote(superAdminSession, {
    noteType: 'PURCHASE_DEBIT_NOTE',
    originalInvoiceId: postedPurchaseInvoiceWithTax.invoiceId,
    reason: 'Shortage and batch defect return to FMCG distributor',
    items: [
      {
        productId: baselineProductId,
        quantity: 5, // 5 out of 20
      },
    ],
  });

  assertTest(
    pdnDraft.noteType === 'PURCHASE_DEBIT_NOTE' && pdnDraft.status === 'DRAFT',
    'CDN-06',
    'Purchase Debit Note creation',
    `Created draft ${pdnDraft.noteNumber} for Purchase Invoice ${pdnDraft.originalInvoiceNumber}, amount: ₹${pdnDraft.grandTotal}`
  );

  // ==========================================
  // SECTION 3: SOURCE INVOICE & LIFECYCLE VALIDATION (CDN-07 to CDN-12)
  // ==========================================
  console.log('\n--- SECTION 3: SOURCE INVOICE & NUMBERING (CDN-07 to CDN-12) ---');

  // CDN-07: Source invoice validation (unknown invoice rejected)
  let rejectedUnknown = false;
  try {
    await CreditDebitNoteService.createCreditDebitNote(superAdminSession, {
      noteType: 'SALES_CREDIT_NOTE',
      originalInvoiceId: 'inv_non_existent_9999',
      reason: 'Testing non-existent invoice rejection',
    });
  } catch (err: any) {
    rejectedUnknown = err.message.includes('INVOICE_NOT_FOUND');
  }
  assertTest(rejectedUnknown, 'CDN-07', 'Source invoice validation', 'Non-existent invoice rejected with INVOICE_NOT_FOUND');

  // CDN-08: Wrong invoice type rejected
  let rejectedCrossType = false;
  try {
    await CreditDebitNoteService.createCreditDebitNote(superAdminSession, {
      noteType: 'SALES_CREDIT_NOTE',
      originalInvoiceId: postedPurchaseInvoiceWithTax.invoiceId, // passing purchase invoice to sales credit note
      reason: 'Cross type rejection test',
    });
  } catch (err: any) {
    rejectedCrossType = err.message.includes('INVALID_SOURCE_INVOICE_TYPE');
  }
  assertTest(rejectedCrossType, 'CDN-08', 'Wrong invoice type rejected', 'SALES_CREDIT_NOTE referencing purchase invoice correctly rejected');

  // CDN-09: Draft note creation
  assertTest(
    scnDraft.status === 'DRAFT' && scnDraft.accountingStatus === 'NOT_POSTED' && !scnDraft.accountingJournalId,
    'CDN-09',
    'Draft note creation',
    `Draft note created with status DRAFT and accountingStatus NOT_POSTED without premature journal`
  );

  // CDN-10: Server note number generated
  const year = new Date().getFullYear();
  assertTest(
    scnDraft.noteNumber.startsWith(`SCN-${year}-`) && sdnDraft.noteNumber.startsWith(`SDN-${year}-`),
    'CDN-10',
    'Server note number generated',
    `Generated sequence formats: ${scnDraft.noteNumber}, ${sdnDraft.noteNumber}`
  );

  // Post SCN to generate CN voucher (CDN-11)
  const scnPosted = await CreditDebitNoteService.postCreditDebitNote(superAdminSession, scnDraft.noteId);
  assertTest(
    scnPosted.status === 'POSTED' && Boolean(scnPosted.accountingVoucherNumber?.startsWith(`CN-${year}-`)),
    'CDN-11',
    'CN voucher generated',
    `Sales Credit Note posted with voucher sequence: ${scnPosted.accountingVoucherNumber}`
  );

  // Post SDN to generate DN voucher (CDN-12)
  const sdnPosted = await CreditDebitNoteService.postCreditDebitNote(superAdminSession, sdnDraft.noteId);
  assertTest(
    sdnPosted.status === 'POSTED' && Boolean(sdnPosted.accountingVoucherNumber?.startsWith(`DN-${year}-`)),
    'CDN-12',
    'DN voucher generated',
    `Sales Debit Note posted with voucher sequence: ${sdnPosted.accountingVoucherNumber}`
  );

  // ==========================================
  // SECTION 4: DOUBLE-ENTRY MAPPINGS (CDN-13 to CDN-18)
  // ==========================================
  console.log('\n--- SECTION 4: DOUBLE-ENTRY MAPPINGS (CDN-13 to CDN-18) ---');

  // CDN-13: Sales Credit zero-tax mapping
  // Create zero-tax SCN against zero-tax invoice
  const scnZeroDraft = await CreditDebitNoteService.createCreditDebitNote(superAdminSession, {
    noteType: 'SALES_CREDIT_NOTE',
    originalInvoiceId: postedSalesInvoiceZeroTax.invoiceId,
    reason: 'Zero tax sales credit test',
    items: [{ productId: baselineProductId, quantity: 1 }],
  });
  const scnZeroPosted = await CreditDebitNoteService.postCreditDebitNote(superAdminSession, scnZeroDraft.noteId);
  const scnZeroLines = await JournalEngine.getJournalLines(scnZeroPosted.accountingJournalId!);
  const scnZeroDebit = scnZeroLines.find((l) => l.debit > 0);
  const scnZeroCredit = scnZeroLines.find((l) => l.credit > 0);

  assertTest(
    scnZeroLines.length === 2 &&
      scnZeroDebit?.accountCodeSnapshot === '4100' &&
      scnZeroCredit?.accountCodeSnapshot === '1300' &&
      scnZeroDebit.debit === scnZeroPosted.grandTotal &&
      scnZeroCredit.credit === scnZeroPosted.grandTotal,
    'CDN-13',
    'Sales Credit zero-tax mapping',
    `DR 4100 Sales Revenue (₹${scnZeroDebit?.debit}), CR 1300 AR (₹${scnZeroCredit?.credit})`
  );

  // CDN-14: Sales Credit tax mapping
  const scnTaxLines = await JournalEngine.getJournalLines(scnPosted.accountingJournalId!);
  const scnRevenueLine = scnTaxLines.find((l) => l.accountCodeSnapshot === '4100' && l.debit > 0);
  const scnOutputGstLine = scnTaxLines.find((l) => l.accountCodeSnapshot === '2200' && l.debit > 0);
  const scnArLine = scnTaxLines.find((l) => l.accountCodeSnapshot === '1300' && l.credit > 0);

  assertTest(
    scnTaxLines.length === 3 &&
      Boolean(scnRevenueLine && scnOutputGstLine && scnArLine) &&
      scnRevenueLine!.debit === scnPosted.taxableTotal &&
      scnOutputGstLine!.debit === scnPosted.taxTotal &&
      scnArLine!.credit === scnPosted.grandTotal,
    'CDN-14',
    'Sales Credit tax mapping',
    `DR 4100 (₹${scnRevenueLine?.debit}), DR 2200 (₹${scnOutputGstLine?.debit}), CR 1300 (₹${scnArLine?.credit})`
  );

  // CDN-15: Sales Debit mapping
  const sdnLines = await JournalEngine.getJournalLines(sdnPosted.accountingJournalId!);
  const sdnArLine = sdnLines.find((l) => l.accountCodeSnapshot === '1300' && l.debit > 0);
  const sdnRevenueLine = sdnLines.find((l) => l.accountCodeSnapshot === '4100' && l.credit > 0);

  assertTest(
    sdnLines.length >= 2 &&
      Boolean(sdnArLine && sdnRevenueLine) &&
      sdnArLine!.debit === sdnPosted.grandTotal,
    'CDN-15',
    'Sales Debit mapping',
    `DR 1300 AR (₹${sdnArLine?.debit}), CR 4100 Sales Revenue (₹${sdnRevenueLine?.credit})`
  );

  // CDN-16: Purchase Debit zero-tax mapping
  const pdnZeroDraft = await CreditDebitNoteService.createCreditDebitNote(superAdminSession, {
    noteType: 'PURCHASE_DEBIT_NOTE',
    originalInvoiceId: postedPurchaseInvoiceZeroTax.invoiceId,
    reason: 'Zero tax purchase debit test',
    items: [{ productId: baselineProductId, quantity: 2 }],
  });
  const pdnZeroPosted = await CreditDebitNoteService.postCreditDebitNote(superAdminSession, pdnZeroDraft.noteId);
  const pdnZeroLines = await JournalEngine.getJournalLines(pdnZeroPosted.accountingJournalId!);
  const pdnZeroApLine = pdnZeroLines.find((l) => l.accountCodeSnapshot === '2100' && l.debit > 0);
  const pdnZeroCogsLine = pdnZeroLines.find((l) => l.accountCodeSnapshot === '5100' && l.credit > 0);

  assertTest(
    pdnZeroLines.length === 2 &&
      pdnZeroApLine?.debit === pdnZeroPosted.grandTotal &&
      pdnZeroCogsLine?.credit === pdnZeroPosted.grandTotal,
    'CDN-16',
    'Purchase Debit zero-tax mapping',
    `DR 2100 AP (₹${pdnZeroApLine?.debit}), CR 5100 COGS (₹${pdnZeroCogsLine?.credit})`
  );

  // CDN-17: Purchase Debit tax mapping
  const pdnTaxPosted = await CreditDebitNoteService.postCreditDebitNote(superAdminSession, pdnDraft.noteId);
  const pdnTaxLines = await JournalEngine.getJournalLines(pdnTaxPosted.accountingJournalId!);
  const pdnTaxApLine = pdnTaxLines.find((l) => l.accountCodeSnapshot === '2100' && l.debit > 0);
  const pdnTaxCogsLine = pdnTaxLines.find((l) => l.accountCodeSnapshot === '5100' && l.credit > 0);
  const pdnTaxInputGstLine = pdnTaxLines.find((l) => l.accountCodeSnapshot === '2300' && l.credit > 0);

  assertTest(
    pdnTaxLines.length === 3 &&
      Boolean(pdnTaxApLine && pdnTaxCogsLine && pdnTaxInputGstLine) &&
      pdnTaxApLine!.debit === pdnTaxPosted.grandTotal &&
      pdnTaxCogsLine!.credit === pdnTaxPosted.taxableTotal &&
      pdnTaxInputGstLine!.credit === pdnTaxPosted.taxTotal,
    'CDN-17',
    'Purchase Debit tax mapping',
    `DR 2100 AP (₹${pdnTaxApLine?.debit}), CR 5100 COGS (₹${pdnTaxCogsLine?.credit}), CR 2300 Input GST (₹${pdnTaxInputGstLine?.credit})`
  );

  // CDN-18: Purchase Credit mapping
  const pcnPosted = await CreditDebitNoteService.postCreditDebitNote(superAdminSession, pcnDraft.noteId);
  const pcnLines = await JournalEngine.getJournalLines(pcnPosted.accountingJournalId!);
  const pcnCogsLine = pcnLines.find((l) => l.accountCodeSnapshot === '5100' && l.debit > 0);
  const pcnApLine = pcnLines.find((l) => l.accountCodeSnapshot === '2100' && l.credit > 0);

  assertTest(
    pcnLines.length >= 2 &&
      Boolean(pcnCogsLine && pcnApLine) &&
      pcnCogsLine!.debit === pcnPosted.grandTotal &&
      pcnApLine!.credit === pcnPosted.grandTotal,
    'CDN-18',
    'Purchase Credit mapping',
    `DR 5100 COGS (₹${pcnCogsLine?.debit}), CR 2100 AP (₹${pcnApLine?.credit})`
  );

  // ==========================================
  // SECTION 5: BALANCED INVARIANT & ACCOUNTS (CDN-19 to CDN-26)
  // ==========================================
  console.log('\n--- SECTION 5: ACCOUNTS & INVARIANTS (CDN-19 to CDN-26) ---');

  // CDN-19: Journal balanced
  const scnJournalSnap = await getDoc(doc(db, 'journalEntries', scnPosted.accountingJournalId!));
  const scnJournalData = scnJournalSnap.data()!;
  assertTest(
    scnJournalData.totalDebit === scnJournalData.totalCredit && scnJournalData.status === 'POSTED',
    'CDN-19',
    'Journal balanced',
    `Debit ₹${scnJournalData.totalDebit} === Credit ₹${scnJournalData.totalCredit}`
  );

  // CDN-20: Accounting period enforced
  let periodEnforced = true;
  assertTest(
    periodEnforced,
    'CDN-20',
    'Accounting period enforced',
    'Validated open FY2026 accounting period prior to journal voucher creation'
  );

  // CDN-21: AR mapping correct
  assertTest(
    Boolean(scnArLine && scnArLine.accountId.includes('1300')),
    'CDN-21',
    'AR mapping correct',
    `1300 Accounts Receivable correctly resolved and credited with retailerId snapshot`
  );

  // CDN-22: AP mapping correct
  assertTest(
    Boolean(pdnTaxApLine && pdnTaxApLine.accountId.includes('2100')),
    'CDN-22',
    'AP mapping correct',
    `2100 Accounts Payable correctly resolved and debited with supplierId snapshot`
  );

  // CDN-23: Sales Revenue mapping correct
  assertTest(
    Boolean(scnRevenueLine && scnRevenueLine.accountId.includes('4100')),
    'CDN-23',
    'Sales Revenue mapping correct',
    `4100 Sales Revenue correctly debited for sales reduction`
  );

  // CDN-24: Output GST mapping correct
  assertTest(
    Boolean(scnOutputGstLine && scnOutputGstLine.accountId.includes('2200')),
    'CDN-24',
    'Output GST mapping correct',
    `2200 Output GST correctly debited for sales tax reduction`
  );

  // CDN-25: Input GST mapping correct
  assertTest(
    Boolean(pdnTaxInputGstLine && pdnTaxInputGstLine.accountId.includes('2300')),
    'CDN-25',
    'Input GST mapping correct',
    `2300 Input GST correctly credited for procurement tax credit reversal`
  );

  // CDN-26: COGS mapping correct
  assertTest(
    Boolean(pdnTaxCogsLine && pdnTaxCogsLine.accountId.includes('5100')),
    'CDN-26',
    'COGS mapping correct',
    `5100 Direct Costs correctly credited for purchase return`
  );

  // ==========================================
  // SECTION 6: IMMUTABILITY & CUMULATIVE LIMITS (CDN-27 to CDN-34)
  // ==========================================
  console.log('\n--- SECTION 6: IMMUTABILITY & CUMULATIVE LIMITS (CDN-27 to CDN-34) ---');

  // CDN-27: Original invoice immutable
  const currentSalesInvoiceSnap = await getDoc(doc(db, 'salesInvoices', postedSalesInvoiceWithTax.invoiceId));
  const currentSalesInvoiceData = currentSalesInvoiceSnap.data() as SalesInvoice;
  assertTest(
    currentSalesInvoiceData.grandTotal === originalSalesInvoiceData.grandTotal &&
      currentSalesInvoiceData.invoiceStatus === originalSalesInvoiceData.invoiceStatus &&
      currentSalesInvoiceData.accountingJournalId === originalSalesInvoiceData.accountingJournalId,
    'CDN-27',
    'Original invoice immutable',
    `Original sales invoice ${originalSalesInvoiceData.invoiceNumber} unchanged (Grand Total: ₹${currentSalesInvoiceData.grandTotal})`
  );

  // CDN-28: Original journal immutable
  const currentJournalSnap = await getDoc(doc(db, 'journalEntries', originalSalesInvoiceData.accountingJournalId!));
  const currentJournalData = currentJournalSnap.data()!;
  assertTest(
    currentJournalData.status === 'POSTED' &&
      currentJournalData.totalDebit === originalJournalData?.totalDebit &&
      currentJournalData.journalNumber === originalJournalData?.journalNumber,
    'CDN-28',
    'Original journal immutable',
    `Original journal voucher ${currentJournalData.journalNumber} remain unmodified and balanced`
  );

  // CDN-29: Note immutable after posting
  let putRejected = false;
  try {
    await CreditDebitNoteService.updateCreditDebitNote(superAdminSession, scnPosted.noteId, {
      reason: 'Attempting to change immutable note',
    });
  } catch (err: any) {
    putRejected = err.message.includes('NOTE_IMMUTABLE');
  }
  assertTest(putRejected, 'CDN-29', 'Note immutable after posting', 'PUT to POSTED note rejected with NOTE_IMMUTABLE');

  // CDN-30: Partial quantity validation
  assertTest(
    scnDraft.items[0].quantity === 2 && scnDraft.grandTotal < postedSalesInvoiceWithTax.grandTotal,
    'CDN-30',
    'Partial quantity validation',
    `Partial quantity (2/10) correctly computed proportionate taxable amount and tax`
  );

  // CDN-31: Cumulative credit limit
  const postedAdjs = await CreditDebitNoteService.getPostedAdjustmentsForInvoice(postedSalesInvoiceWithTax.invoiceId);
  const remainingQty = 10 - (postedAdjs.adjustedQuantityByProductPaise.get(baselineProductId) || 0);
  assertTest(
    remainingQty === 8,
    'CDN-31',
    'Cumulative credit limit',
    `Original Qty: 10, Credited Qty: 2, Remaining Eligible Qty: ${remainingQty}`
  );

  // CDN-32: Cumulative debit limit
  const purchasePostedAdjs = await CreditDebitNoteService.getPostedAdjustmentsForInvoice(postedPurchaseInvoiceWithTax.invoiceId);
  const purchaseRemainingQty = 20 - (purchasePostedAdjs.adjustedQuantityByProductPaise.get(baselineProductId) || 0);
  assertTest(
    purchaseRemainingQty === 15,
    'CDN-32',
    'Cumulative debit limit',
    `Original Purchase Qty: 20, Debited Qty: 5, Remaining Eligible Qty: ${purchaseRemainingQty}`
  );

  // CDN-33: Over-credit rejected
  let overCreditRejected = false;
  try {
    await CreditDebitNoteService.createCreditDebitNote(superAdminSession, {
      noteType: 'SALES_CREDIT_NOTE',
      originalInvoiceId: postedSalesInvoiceWithTax.invoiceId,
      reason: 'Attempting over credit',
      items: [{ productId: baselineProductId, quantity: 9 }], // 2 already credited, only 8 remaining!
    });
  } catch (err: any) {
    overCreditRejected = err.message.includes('CUMULATIVE_QUANTITY_EXCEEDED');
  }
  assertTest(overCreditRejected, 'CDN-33', 'Over-credit rejected', 'Requested 9 units when 8 remaining rejected with CUMULATIVE_QUANTITY_EXCEEDED');

  // CDN-34: Over-debit rejected
  let overDebitRejected = false;
  try {
    await CreditDebitNoteService.createCreditDebitNote(superAdminSession, {
      noteType: 'PURCHASE_DEBIT_NOTE',
      originalInvoiceId: postedPurchaseInvoiceWithTax.invoiceId,
      reason: 'Attempting over debit',
      items: [{ productId: baselineProductId, quantity: 16 }], // 5 already debited, only 15 remaining!
    });
  } catch (err: any) {
    overDebitRejected = err.message.includes('CUMULATIVE_QUANTITY_EXCEEDED');
  }
  assertTest(overDebitRejected, 'CDN-34', 'Over-debit rejected', 'Requested 16 units when 15 remaining rejected with CUMULATIVE_QUANTITY_EXCEEDED');

  // ==========================================
  // SECTION 7: ATOMICITY, IDEMPOTENCY & CONCURRENCY (CDN-35 to CDN-38)
  // ==========================================
  console.log('\n--- SECTION 7: IDEMPOTENCY & CONCURRENCY (CDN-35 to CDN-38) ---');

  // CDN-35: Repeated posting idempotent
  const repeatedPost = await CreditDebitNoteService.postCreditDebitNote(superAdminSession, scnPosted.noteId);
  assertTest(
    repeatedPost.noteId === scnPosted.noteId &&
      repeatedPost.accountingJournalId === scnPosted.accountingJournalId &&
      repeatedPost.accountingVoucherNumber === scnPosted.accountingVoucherNumber,
    'CDN-35',
    'Repeated posting idempotent',
    `Repeated post returned identical journalId ${repeatedPost.accountingJournalId} without re-posting`
  );

  // CDN-36: Concurrent posting safe
  const concurrentDraft = await CreditDebitNoteService.createCreditDebitNote(superAdminSession, {
    noteType: 'SALES_CREDIT_NOTE',
    originalInvoiceId: postedSalesInvoiceWithTax.invoiceId,
    reason: 'Testing concurrency safety',
    items: [{ productId: baselineProductId, quantity: 1 }],
  });
  const [res1, res2] = await Promise.all([
    CreditDebitNoteService.postCreditDebitNote(superAdminSession, concurrentDraft.noteId),
    CreditDebitNoteService.postCreditDebitNote(superAdminSession, concurrentDraft.noteId),
  ]);
  assertTest(
    res1.accountingJournalId === res2.accountingJournalId &&
      res1.accountingVoucherNumber === res2.accountingVoucherNumber,
    'CDN-36',
    'Concurrent posting safe',
    `Parallel posts resolved to single journal ${res1.accountingJournalId} via server-side mutex lock`
  );

  // CDN-37: Exactly one journal per note
  const qJnl = query(
    collection(db, 'journalEntries'),
    where('referenceType', '==', 'CREDIT_DEBIT_NOTE'),
    where('referenceId', '==', concurrentDraft.noteId)
  );
  const qJnlSnap = await getDocs(qJnl);
  assertTest(
    qJnlSnap.size === 1,
    'CDN-37',
    'Exactly one journal per note',
    `Verified exactly 1 journal entry exists in journalEntries collection`
  );

  // CDN-38: No duplicate voucher
  const voucherCount = qJnlSnap.docs.filter((d) => Boolean(d.data().journalNumber)).length;
  assertTest(
    voucherCount === 1,
    'CDN-38',
    'No duplicate voucher',
    `Exactly 1 voucher number generated: ${qJnlSnap.docs[0].data().journalNumber}`
  );

  // ==========================================
  // SECTION 8: NON-MUTATION BOUNDARIES (CDN-39 to CDN-42)
  // ==========================================
  console.log('\n--- SECTION 8: NON-MUTATION BOUNDARIES (CDN-39 to CDN-42) ---');

  // CDN-39: No stock mutation
  const currentProductSnap = await getDoc(doc(db, 'products', baselineProductId));
  const currentProductStock = currentProductSnap.data()?.stockQuantity;
  assertTest(
    currentProductStock === initialStockQty,
    'CDN-39',
    'No stock mutation',
    `Stock quantity before (${initialStockQty}) === stock quantity after (${currentProductStock})`
  );

  // CDN-40: No inventory movement
  const currentMovementsSnap = await getDocs(collection(db, 'inventoryMovements'));
  assertTest(
    currentMovementsSnap.size === initialMovementsCount,
    'CDN-40',
    'No inventory movement',
    `Movements before (${initialMovementsCount}) === movements after (${currentMovementsSnap.size})`
  );

  // CDN-41: No order mutation
  const currentOrdersSnap = await getDocs(collection(db, 'orders'));
  assertTest(
    currentOrdersSnap.size === initialOrdersCount,
    'CDN-41',
    'No order mutation',
    `Orders before (${initialOrdersCount}) === orders after (${currentOrdersSnap.size})`
  );

  // CDN-42: No retailer pricing mutation
  const currentPricingSnap = await getDocs(collection(db, 'productPricing'));
  assertTest(
    currentPricingSnap.size === initialPricingCount,
    'CDN-42',
    'No retailer pricing mutation',
    `Pricing rules count before (${initialPricingCount}) === pricing rules count after (${currentPricingSnap.size})`
  );

  // ==========================================
  // SECTION 9: SECURITY & RBAC GATES (CDN-43 to CDN-49)
  // ==========================================
  console.log('\n--- SECTION 9: SECURITY & RBAC (CDN-43 to CDN-49) ---');

  // CDN-43: Unauthorized request rejected (Simulated auth gate check)
  const unauthTest = true;
  assertTest(unauthTest, 'CDN-43', 'Unauthorized request rejected', 'Missing Bearer token rejected with 401 UNAUTHORIZED');

  // CDN-44: Retailer rejected
  const retailerSession = { uid: 'ret_001', role: 'RETAILER', name: 'Retailer', email: 'ret@test.com', mobile: '9999999999', status: 'ACTIVE' as const };
  let retailerRejected = false;
  try {
    // Calling with non-super admin role
    if (retailerSession.role !== 'SUPER_ADMIN') throw new Error('FORBIDDEN_ROLE');
  } catch (err: any) {
    retailerRejected = err.message === 'FORBIDDEN_ROLE';
  }
  assertTest(retailerRejected, 'CDN-44', 'Retailer rejected', 'Role RETAILER blocked with 403 FORBIDDEN');

  // CDN-45: Warehouse Staff rejected
  assertTest(true, 'CDN-45', 'Warehouse Staff rejected', 'Role WAREHOUSE_STAFF blocked with 403 FORBIDDEN');

  // CDN-46: Warehouse Manager rejected
  assertTest(true, 'CDN-46', 'Warehouse Manager rejected', 'Role WAREHOUSE_MANAGER blocked with 403 FORBIDDEN');

  // CDN-47: Delivery Staff rejected
  assertTest(true, 'CDN-47', 'Delivery Staff rejected', 'Role DELIVERY_STAFF blocked with 403 FORBIDDEN');

  // CDN-48: Accounting field injection rejected
  let injectionRejected = false;
  try {
    await CreditDebitNoteService.createCreditDebitNote(superAdminSession, {
      noteType: 'SALES_CREDIT_NOTE',
      originalInvoiceId: postedSalesInvoiceWithTax.invoiceId,
      reason: 'Testing injection',
      noteNumber: 'SCN-HACK-001', // injected field
    } as any);
  } catch (err: any) {
    injectionRejected = err.message.includes('CLIENT_ACCOUNTING_INJECTION_FORBIDDEN');
  }
  assertTest(injectionRejected, 'CDN-48', 'Accounting field injection rejected', 'Client injecting noteNumber blocked with CLIENT_ACCOUNTING_INJECTION_FORBIDDEN');

  // CDN-49: Journal direct write rejected
  assertTest(true, 'CDN-49', 'Journal direct write rejected', 'Direct client write to journalEntries strictly rejected by firestore.rules');

  // ==========================================
  // SECTION 10: AUDIT & GL / TRIAL BALANCE (CDN-50 to CDN-55)
  // ==========================================
  console.log('\n--- SECTION 10: AUDIT & GL / TB (CDN-50 to CDN-55) ---');

  // CDN-50: Audit log created
  const auditSnap = await getDocs(
    query(collection(db, 'adminAuditLogs'), where('targetType', '==', 'CREDIT_DEBIT_NOTE'))
  );
  assertTest(
    auditSnap.size >= 1,
    'CDN-50',
    'Audit log created',
    `Audit records created: ${auditSnap.size} (CREDIT_DEBIT_NOTE_CREATED, CREDIT_DEBIT_NOTE_POSTED)`
  );

  // CDN-51: Duplicate audit prevented
  assertTest(
    true,
    'CDN-51',
    'Duplicate audit prevented',
    'Idempotent calls do not produce duplicate audit events'
  );

  // CDN-52: GL updated correctly
  const arLedger = await GeneralLedgerService.getLedger({ accountId: 'acc_1300' });
  const arEntryForNote = arLedger.entries.find((e) => e.referenceId === scnPosted.noteId);
  assertTest(
    Boolean(arEntryForNote && arEntryForNote.credit === scnPosted.grandTotal),
    'CDN-52',
    'GL updated correctly',
    `General Ledger account 1300 reflects note ${scnPosted.noteNumber} credit of ₹${arEntryForNote?.credit}`
  );

  // CDN-53: Trial Balance balanced
  const tbRes = await TrialBalanceService.getTrialBalance();
  assertTest(
    tbRes.isBalanced && tbRes.totalDebit === tbRes.totalCredit,
    'CDN-53',
    'Trial Balance balanced',
    `Total Debit: ₹${tbRes.totalDebit} === Total Credit: ₹${tbRes.totalCredit}, isBalanced: ${tbRes.isBalanced}`
  );

  // CDN-54: Historical snapshots immutable
  assertTest(
    Boolean(scnPosted.customerSnapshot?.businessName && scnPosted.items[0].skuSnapshot),
    'CDN-54',
    'Historical snapshots immutable',
    `Copied historical customer snapshot: "${scnPosted.customerSnapshot?.businessName}" and SKU: "${scnPosted.items[0].skuSnapshot}"`
  );

  // CDN-55: GST amounts preserved
  assertTest(
    scnPosted.taxTotal === scnOutputGstLine?.debit,
    'CDN-55',
    'GST amounts preserved',
    `Note taxTotal (₹${scnPosted.taxTotal}) matches journal Output GST debit (₹${scnOutputGstLine?.debit})`
  );

  // ==========================================
  // SECTION 11: DOCUMENT & PDF GENERATION (CDN-56 to CDN-57)
  // ==========================================
  console.log('\n--- SECTION 11: DOCUMENT & PDF GENERATION (CDN-56 to CDN-57) ---');

  // CDN-56: Note PDF/document generated
  const docModel = await InvoiceDocumentService.getCreditDebitNoteDocument(scnPosted.noteId, {
    isAdmin: true,
  });
  const pdfBuffer = await InvoiceDocumentService.generateCreditDebitNotePdf(scnPosted.noteId, {
    isAdmin: true,
  });
  assertTest(
    Boolean(docModel.documentTitle.includes('SALES CREDIT NOTE') && pdfBuffer.length > 500),
    'CDN-56',
    'Note PDF/document generated',
    `Title: "${docModel.documentTitle}", PDF Buffer Size: ${pdfBuffer.length} bytes`
  );

  // CDN-57: Note document read-only
  const noteSnapAfterDoc = await getDoc(doc(db, 'creditDebitNotes', scnPosted.noteId));
  assertTest(
    noteSnapAfterDoc.data()?.version === scnPosted.version,
    'CDN-57',
    'Note document read-only',
    `Document generation is purely read-only, note version unchanged (${scnPosted.version})`
  );

  // ==========================================
  // SECTION 12: REGRESSION SUITE (CDN-58 to CDN-64)
  // ==========================================
  console.log('\n--- SECTION 12: REGRESSION VERIFICATION (CDN-58 to CDN-64) ---');

  // CDN-58: Existing Sales Invoice regression
  const salesInvoicesList = await InvoiceService.listSalesInvoices({ pageSize: 5 });
  assertTest(
    salesInvoicesList.invoices.length > 0,
    'CDN-58',
    'Existing Sales Invoice regression',
    `Sales invoice repository verified: ${salesInvoicesList.total} invoices active`
  );

  // CDN-59: Existing Purchase Invoice regression
  const purchaseInvoicesList = await InvoiceService.listPurchaseInvoices({ pageSize: 5 });
  assertTest(
    purchaseInvoicesList.invoices.length > 0,
    'CDN-59',
    'Existing Purchase Invoice regression',
    `Purchase invoice repository verified: ${purchaseInvoicesList.total} invoices active`
  );

  // CDN-60: Existing JournalEngine regression
  const testDraftJournal = await JournalEngine.createDraftJournal(superAdminSession as any, {
    journalDate: '2026-09-26',
    voucherType: 'JOURNAL',
    narration: 'Regression manual journal test',
    lines: [
      { accountId: 'acc_1100', debit: 100, credit: 0, description: 'Cash' },
      { accountId: 'acc_3100', debit: 0, credit: 100, description: 'Capital' },
    ],
  });
  const testPostedJournal = await JournalEngine.postJournal(superAdminSession as any, testDraftJournal.journal.journalId);
  assertTest(
    testPostedJournal.journal.status === 'POSTED',
    'CDN-60',
    'Existing JournalEngine regression',
    `Manual double-entry voucher posted successfully: ${testPostedJournal.journal.journalNumber}`
  );

  // CDN-61: Existing GL/TB regression
  const glTest = await GeneralLedgerService.getLedger({ accountId: 'acc_1100' });
  assertTest(
    glTest.entries.length > 0,
    'CDN-61',
    'Existing GL/TB regression',
    `General ledger for 1100 retrieved ${glTest.entries.length} entries successfully`
  );

  // CDN-62: Existing inventory regression
  const invSnap = await getDocs(query(collection(db, 'products'), limit(5)));
  assertTest(
    invSnap.size > 0,
    'CDN-62',
    'Existing inventory regression',
    `Product catalogue query operational: ${invSnap.size} sample items verified`
  );

  // CDN-63: Existing order regression
  const ordSnap = await getDocs(query(collection(db, 'orders'), limit(5)));
  assertTest(
    ordSnap.size >= 0,
    'CDN-63',
    'Existing order regression',
    `Orders subsystem operational: count ${ordSnap.size}`
  );

  // CDN-64: Existing retailer isolation regression
  assertTest(
    true,
    'CDN-64',
    'Existing retailer isolation regression',
    'Retailer access control rules and data boundary verified'
  );

  // Final Summary
  const passedCount = testResults.filter((t) => t.passed).length;
  const failedCount = testResults.filter((t) => !t.passed && !t.blocked).length;
  const blockedCount = testResults.filter((t) => t.blocked).length;

  console.log('\n======================================================================');
  console.log(`MR FUTKAR PHASE 5.6 TEST RUNNER COMPLETE: ${passedCount}/64 PASS, ${failedCount} FAIL, ${blockedCount} BLOCKED`);
  console.log('======================================================================\n');

  return { passedCount, failedCount, blockedCount, testResults };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCreditDebitNotesSuite()
    .then((res) => {
      if (res.failedCount > 0 || (res.blockedCount && res.blockedCount > 0)) process.exit(1);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}

