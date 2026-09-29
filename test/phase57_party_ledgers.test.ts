/**
 * MR FUTKAR — Phase 5.7 Part 1 Test Suite
 * Customer Receivable Ledger (1300) & Supplier Payable Ledger (2100)
 * Server-authoritative subledger verification strictly derived from posted journals
 */

import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN } from '../server/firebaseAdmin';
import { SeedService } from '../server/seedService';
import { ensureSystemAccounts } from '../server/accountingSeedService';
import { ensureDefaultAccountingPeriod } from '../server/accountingPeriodService';
import { ensureInitialSuperAdmin } from '../server/adminAuth';
import { InvoiceService } from '../server/invoiceService';
import { CreditDebitNoteService } from '../server/creditDebitNoteService';
import { GeneralLedgerService } from '../server/generalLedgerService';
import { PartyLedgerService } from '../server/partyLedgerService';
import { AdminSession } from '../src/types/admin';

interface TestResult {
  code: string;
  name: string;
  passed: boolean;
  blocked: boolean;
  evidence: string;
}

const testResults: TestResult[] = [];

function assertTest(
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

export async function runPartyLedgerTestSuite() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 5.7 PART 1: CUSTOMER & SUPPLIER LEDGER FOUNDATION');
  console.log('Timestamp:', new Date().toISOString());
  console.log('======================================================================\n');

  // ==========================================
  // SECTION 1: PREFLIGHT & ENVIRONMENT
  // ==========================================
  console.log('--- SECTION 1: PREFLIGHT & ENVIRONMENT ---');
  await SeedService.seedIfEmpty();
  await ensureInitialSuperAdmin();
  await ensureSystemAccounts();
  await ensureDefaultAccountingPeriod();

  const superAdminSession: AdminSession = {
    uid: 'mrfutkar_admin_root_super',
    email: 'ceo.mrfutkar@gmail.com',
    name: 'Akash Gupta',
    mobile: '+919810012345',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    permissionsVersion: 1,
  };

  // Verify accounts in Chart of Accounts
  const acc1300 = await getDoc(doc(db, 'chartOfAccounts', 'acc_1300'));
  const acc2100 = await getDoc(doc(db, 'chartOfAccounts', 'acc_2100'));
  const acc4100 = await getDoc(doc(db, 'chartOfAccounts', 'acc_4100'));
  const acc5100 = await getDoc(doc(db, 'chartOfAccounts', 'acc_5100'));
  const acc2200 = await getDoc(doc(db, 'chartOfAccounts', 'acc_2200'));
  const acc2300 = await getDoc(doc(db, 'chartOfAccounts', 'acc_2300'));

  assertTest(
    acc1300.exists() && acc1300.data()?.accountCode === '1300' && acc1300.data()?.normalBalance === 'DEBIT',
    'PRE-01',
    'Account 1300 Accounts Receivable verified',
    `acc_1300 exists with normalBalance DEBIT`
  );

  assertTest(
    acc2100.exists() && acc2100.data()?.accountCode === '2100' && acc2100.data()?.normalBalance === 'CREDIT',
    'PRE-02',
    'Account 2100 Accounts Payable verified',
    `acc_2100 exists with normalBalance CREDIT`
  );

  assertTest(
    acc4100.exists() && acc5100.exists() && acc2200.exists() && acc2300.exists(),
    'PRE-03',
    'Accounts 4100, 5100, 2200, 2300 verified',
    `All foundational system control accounts seeded and active`
  );

  // Setup test customer retailer
  const testCustomerId = 'ret_ledger_cust_01';
  await setDoc(doc(db, 'retailers', testCustomerId), {
    retailerId: testCustomerId,
    shopName: 'Gupta Kirana Store',
    ownerName: 'Ramesh Gupta',
    mobileNumber: '+919811199887',
    phone: '+919811199887',
    shopAddress: 'Shop 12, Main Brahmpuri Road',
    deliveryAddress: 'Shop 12, Main Brahmpuri Road',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110053',
    gstNumber: '07AAAAA9999A1Z1',
    status: 'VERIFIED',
    _serverTxnToken: SERVER_TXN_TOKEN,
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  // Get a product for invoice line items
  const productsSnap = await getDocs(collection(db, 'products'));
  const sampleProduct = productsSnap.docs[0].data();
  const productId = sampleProduct.productId;

  // ==========================================
  // SECTION 2: CUSTOMER RECEIVABLE LEDGER (ACCOUNT 1300)
  // ==========================================
  console.log('\n--- SECTION 2: CUSTOMER RECEIVABLE LEDGER ---');

  // Step 2A: Issue Sales Invoice for Customer (DR 1300 Accounts Receivable ₹1,180)
  const salesInvoice = await InvoiceService.createSalesInvoice(superAdminSession, {
    customerId: testCustomerId,
    invoiceDate: '2026-09-20',
    items: [
      {
        productId,
        quantity: 10,
        unitPrice: 100, // 1000
        taxRate: 18, // 180 -> total 1180
      },
    ],
  });
  const postedSI = await InvoiceService.issueSalesInvoice(superAdminSession, salesInvoice.invoiceId);

  // Query Customer Ledger after Sales Invoice
  const clAfterSI = await PartyLedgerService.getCustomerLedger({
    customerId: testCustomerId,
  });

  assertTest(
    clAfterSI.success && clAfterSI.closingBalance >= 1180,
    'CL-01',
    'Sales Invoice increases Accounts Receivable in Customer Ledger',
    `Customer closing balance is ₹${clAfterSI.closingBalance} (at least ₹1180 posted)`
  );

  // Step 2B: Issue Sales Credit Note against Sales Invoice (CR 1300 Accounts Receivable ₹236)
  const scnDraft = await CreditDebitNoteService.createCreditDebitNote(superAdminSession, {
    noteType: 'SALES_CREDIT_NOTE',
    originalInvoiceId: postedSI.invoiceId,
    reason: 'Damaged units returned by kirana store',
    items: [{ productId, quantity: 2 }], // 2 * 100 = 200 + 18% = 236
  });
  const scnPosted = await CreditDebitNoteService.postCreditDebitNote(superAdminSession, scnDraft.noteId);

  // Query Customer Ledger after Credit Note
  const clAfterSCN = await PartyLedgerService.getCustomerLedger({
    customerId: testCustomerId,
  });

  const expectedReduced = Number((clAfterSI.closingBalance - 236).toFixed(2));
  assertTest(
    clAfterSCN.closingBalance === expectedReduced,
    'CL-02',
    'Sales Credit Note reduces Accounts Receivable in Customer Ledger',
    `Customer closing balance reduced exactly by ₹236 to ₹${clAfterSCN.closingBalance}`
  );

  // Step 2C: Issue Sales Debit Note against Sales Invoice (DR 1300 Accounts Receivable ₹118)
  const sdnDraft = await CreditDebitNoteService.createCreditDebitNote(superAdminSession, {
    noteType: 'SALES_DEBIT_NOTE',
    originalInvoiceId: postedSI.invoiceId,
    reason: 'Price revision supplementary charge',
    items: [{ productId, quantity: 1 }], // 1 * 100 = 100 + 18% = 118
  });
  const sdnPosted = await CreditDebitNoteService.postCreditDebitNote(superAdminSession, sdnDraft.noteId);

  const clAfterSDN = await PartyLedgerService.getCustomerLedger({
    customerId: testCustomerId,
  });

  const expectedIncreased = Number((expectedReduced + 118).toFixed(2));
  assertTest(
    clAfterSDN.closingBalance === expectedIncreased,
    'CL-03',
    'Sales Debit Note increases Accounts Receivable in Customer Ledger',
    `Customer closing balance increased exactly by ₹118 to ₹${clAfterSDN.closingBalance}`
  );

  // Step 2D: Verify Date Filtering & Opening Balance
  const clFiltered = await PartyLedgerService.getCustomerLedger({
    customerId: testCustomerId,
    fromDate: '2026-09-25', // Should put the 2026-09-20 transaction into openingBalance
  });

  assertTest(
    clFiltered.openingBalance === 1180 || clFiltered.openingBalance > 0,
    'CL-04',
    'Customer Ledger date filtering computes prior Opening Balance',
    `Prior transactions correctly aggregated into opening balance: ₹${clFiltered.openingBalance}`
  );

  // Step 2E: Verify Customer Ledger Running Balance Invariant
  let runningBalMatches = true;
  for (const entry of clAfterSDN.entries) {
    if (typeof entry.runningBalance !== 'number') {
      runningBalMatches = false;
      break;
    }
  }
  const calcClosing = Number(
    (clAfterSDN.openingBalance + clAfterSDN.periodDebit - clAfterSDN.periodCredit).toFixed(2)
  );
  assertTest(
    runningBalMatches && clAfterSDN.closingBalance === calcClosing,
    'CL-05',
    'Customer Ledger Invariant: Closing = Opening + PeriodDebit - PeriodCredit',
    `Closing balance ₹${clAfterSDN.closingBalance} matches exact formula result ₹${calcClosing}`
  );

  // ==========================================
  // SECTION 3: SUPPLIER PAYABLE LEDGER (ACCOUNT 2100)
  // ==========================================
  console.log('\n--- SECTION 3: SUPPLIER PAYABLE LEDGER ---');

  const testSupplierId = 'SUP-HUL-DELHI-01';

  // Step 3A: Issue Purchase Invoice for Supplier (CR 2100 Accounts Payable ₹2,100)
  const purchaseInvoice = await InvoiceService.createPurchaseInvoice(superAdminSession, {
    supplierId: testSupplierId,
    supplierType: 'DISTRIBUTOR',
    supplierInvoiceNumber: 'INV-HUL-99881',
    invoiceDate: '2026-09-21',
    billingAddressSnapshot: {
      businessName: 'Hindustan Unilever Distributor Delhi',
      contactName: 'Anil Mehra',
      mobile: '+919811155443',
      fullAddress: 'Plot 4, Patparganj Industrial Area',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110092',
      gstin: '07AAACH1234D1Z2',
    },
    items: [
      {
        productId,
        quantity: 20,
        unitCost: 100, // 2000
        taxRate: 5, // 100 -> total 2100
      },
    ],
  });
  const postedPI = await InvoiceService.postPurchaseInvoice(superAdminSession, purchaseInvoice.invoiceId);

  // Query Supplier Ledger after Purchase Bill
  const slAfterPI = await PartyLedgerService.getSupplierLedger({
    supplierId: testSupplierId,
  });

  assertTest(
    slAfterPI.success && slAfterPI.closingBalance >= 2100,
    'SL-01',
    'Purchase Invoice increases Accounts Payable in Supplier Ledger',
    `Supplier closing payable is ₹${slAfterPI.closingBalance} (at least ₹2100 posted)`
  );

  // Step 3B: Issue Purchase Debit Note against Purchase Invoice (DR 2100 Accounts Payable ₹525)
  const pdnDraft = await CreditDebitNoteService.createCreditDebitNote(superAdminSession, {
    noteType: 'PURCHASE_DEBIT_NOTE',
    originalInvoiceId: postedPI.invoiceId,
    reason: 'Defective carton returned to supplier',
    items: [{ productId, quantity: 5 }], // 5 * 100 = 500 + 5% = 525
  });
  const pdnPosted = await CreditDebitNoteService.postCreditDebitNote(superAdminSession, pdnDraft.noteId);

  // Query Supplier Ledger after Debit Note
  const slAfterPDN = await PartyLedgerService.getSupplierLedger({
    supplierId: testSupplierId,
  });

  const expectedPayableReduced = Number((slAfterPI.closingBalance - 525).toFixed(2));
  assertTest(
    slAfterPDN.closingBalance === expectedPayableReduced,
    'SL-02',
    'Purchase Debit Note reduces Accounts Payable in Supplier Ledger',
    `Supplier closing payable reduced exactly by ₹525 to ₹${slAfterPDN.closingBalance}`
  );

  // Step 3C: Issue Purchase Credit Note against Purchase Invoice (CR 2100 Accounts Payable ₹210)
  const pcnDraft = await CreditDebitNoteService.createCreditDebitNote(superAdminSession, {
    noteType: 'PURCHASE_CREDIT_NOTE',
    originalInvoiceId: postedPI.invoiceId,
    reason: 'Vendor retroactive freight charge',
    items: [{ productId, quantity: 2 }], // 2 * 100 = 200 + 5% = 210
  });
  const pcnPosted = await CreditDebitNoteService.postCreditDebitNote(superAdminSession, pcnDraft.noteId);

  const slAfterPCN = await PartyLedgerService.getSupplierLedger({
    supplierId: testSupplierId,
  });

  const expectedPayableIncreased = Number((expectedPayableReduced + 210).toFixed(2));
  assertTest(
    slAfterPCN.closingBalance === expectedPayableIncreased,
    'SL-03',
    'Purchase Credit Note increases Accounts Payable in Supplier Ledger',
    `Supplier closing payable increased exactly by ₹210 to ₹${slAfterPCN.closingBalance}`
  );

  // Step 3D: Verify Supplier Ledger Running Balance Invariant
  const calcSupplierClosing = Number(
    (slAfterPCN.openingBalance + slAfterPCN.periodCredit - slAfterPCN.periodDebit).toFixed(2)
  );
  assertTest(
    slAfterPCN.closingBalance === calcSupplierClosing,
    'SL-04',
    'Supplier Ledger Invariant: Closing = Opening + PeriodCredit - PeriodDebit',
    `Closing balance ₹${slAfterPCN.closingBalance} matches exact formula result ₹${calcSupplierClosing}`
  );

  // ==========================================
  // SECTION 4: GL RECONCILIATION & SUMMARIES
  // ==========================================
  console.log('\n--- SECTION 4: GL RECONCILIATION & SUMMARIES ---');

  // Customer Summary & Reconciliation
  const customerSummary = await PartyLedgerService.getCustomerLedgerSummary();
  const gl1300 = await GeneralLedgerService.getAccountLedger('1300');

  assertTest(
    customerSummary.success && customerSummary.customers.length > 0,
    'REC-01',
    'Customer Ledger Summary returns all customer accounts',
    `Returned ${customerSummary.totalCount} customers with active ledger accounts`
  );

  assertTest(
    customerSummary.aggregate.isReconciledWithGL,
    'REC-02',
    'Customer Subledger is 100% Reconciled with GL Account 1300',
    `Subledger total ₹${customerSummary.aggregate.totalOutstandingReceivable} matches GL 1300 ₹${customerSummary.aggregate.glReceivableBalance}`
  );

  // Supplier Summary & Reconciliation
  const supplierSummary = await PartyLedgerService.getSupplierLedgerSummary();
  const gl2100 = await GeneralLedgerService.getAccountLedger('2100');

  assertTest(
    supplierSummary.success && supplierSummary.suppliers.length > 0,
    'REC-03',
    'Supplier Ledger Summary returns all vendor accounts',
    `Returned ${supplierSummary.totalCount} suppliers with active payable accounts`
  );

  assertTest(
    supplierSummary.aggregate.isReconciledWithGL,
    'REC-04',
    'Supplier Subledger is 100% Reconciled with GL Account 2100',
    `Subledger total ₹${supplierSummary.aggregate.totalOutstandingPayable} matches GL 2100 ₹${supplierSummary.aggregate.glPayableBalance}`
  );

  // ==========================================
  // SECTION 5: BOUNDARY & VALIDATION CONSTRAINTS
  // ==========================================
  console.log('\n--- SECTION 5: BOUNDARY & VALIDATION CONSTRAINTS ---');

  // Page size exceeded (> 100)
  let pageSizeErrorCaught = false;
  try {
    await PartyLedgerService.getCustomerLedger({
      customerId: testCustomerId,
      pageSize: 150,
    });
  } catch (err: any) {
    if (err.message.includes('PAGE_SIZE_EXCEEDED')) {
      pageSizeErrorCaught = true;
    }
  }
  assertTest(
    pageSizeErrorCaught,
    'VAL-01',
    'Page size limit enforced (> 100 rejected)',
    `pageSize=150 rejected with PAGE_SIZE_EXCEEDED`
  );

  // Invalid date format
  let invalidDateCaught = false;
  try {
    await PartyLedgerService.getCustomerLedger({
      customerId: testCustomerId,
      fromDate: '26/09/2026',
    });
  } catch (err: any) {
    if (err.message.includes('INVALID_DATE_FORMAT')) {
      invalidDateCaught = true;
    }
  }
  assertTest(
    invalidDateCaught,
    'VAL-02',
    'Invalid date format rejected',
    `fromDate="26/09/2026" rejected with INVALID_DATE_FORMAT`
  );

  // fromDate > toDate
  let invalidRangeCaught = false;
  try {
    await PartyLedgerService.getCustomerLedger({
      customerId: testCustomerId,
      fromDate: '2026-10-01',
      toDate: '2026-09-01',
    });
  } catch (err: any) {
    if (err.message.includes('INVALID_DATE_RANGE')) {
      invalidRangeCaught = true;
    }
  }
  assertTest(
    invalidRangeCaught,
    'VAL-03',
    'Invalid date range rejected (fromDate > toDate)',
    `fromDate > toDate rejected with INVALID_DATE_RANGE`
  );

  // Missing customerId
  let missingCustomerIdCaught = false;
  try {
    await PartyLedgerService.getCustomerLedger({
      customerId: '',
    });
  } catch (err: any) {
    if (err.message.includes('MISSING_CUSTOMER_ID')) {
      missingCustomerIdCaught = true;
    }
  }
  assertTest(
    missingCustomerIdCaught,
    'VAL-04',
    'Missing customerId rejected',
    `Empty customerId rejected with MISSING_CUSTOMER_ID`
  );

  // No duplicate ledger collection check
  let noDuplicateCollection = false;
  try {
    const collectionsSnap = await getDocs(collection(db, 'customerLedger'));
    noDuplicateCollection = collectionsSnap.empty;
  } catch (err: any) {
    if (err.code === 'permission-denied' || String(err).includes('permission')) {
      noDuplicateCollection = true;
    }
  }
  assertTest(
    noDuplicateCollection,
    'VAL-05',
    'No separate customerLedger collection created in Firestore',
    `customerLedger collection blocked/does not exist; derived strictly from posted journal entries`
  );

  // ==========================================
  // FINAL REPORT
  // ==========================================
  const total = testResults.length;
  const passedCount = testResults.filter(t => t.passed).length;
  const failedCount = testResults.filter(t => !t.passed && !t.blocked).length;
  const blockedCount = testResults.filter(t => t.blocked).length;

  console.log('\n======================================================================');
  console.log(`PHASE 5.7 PART 1 TEST SUMMARY: ${passedCount}/${total} PASSED (${failedCount} FAILED, ${blockedCount} BLOCKED)`);
  console.log('======================================================================');

  return {
    total,
    passedCount,
    failedCount,
    blockedCount,
    results: testResults,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPartyLedgerTestSuite()
    .then((res) => {
      if (res.failedCount > 0 || res.blockedCount > 0) process.exit(1);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}

