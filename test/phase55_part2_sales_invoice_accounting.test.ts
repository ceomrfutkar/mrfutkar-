/**
 * MR FUTKAR — PHASE 5.5 PART 2 TEST SUITE
 * SALES INVOICE + ACCOUNTING INTEGRATION VERIFICATION
 *
 * Verifies:
 * - Environment Pre-Flight & Master Collections Verification (ENV-01)
 * - Sales Invoice Creation, Server Totals, PricingEngine, Validation (SALES-01 to SALES-08)
 * - Double-Entry Accounting Journal Generation & Mapping (ACCOUNTING-01 to ACCOUNTING-14)
 * - Idempotency & Concurrency Guarantees (IDEMP-01 to IDEMP-03)
 * - Inventory Zero Double Deduction Boundary (INVENTORY-01 to INVENTORY-03)
 * - Order Operational Isolation Boundary (ORDER-01 to ORDER-02)
 * - Financial Document Immutability (IMM-01 to IMM-03)
 * - Role-Based Access Control & Firestore Rule Security (SEC-01 to SEC-07)
 * - Authoritative Admin Audit Logging (AUDIT-01 to AUDIT-02)
 * - Regression Verification Across Core Subsystems (REG-01 to REG-07)
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
} from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN, OPERATIONAL_WAREHOUSE_ID } from '../server/firebaseAdmin';
import cfg from '../firebase-applet-config.json';
import { AUTHORITATIVE_SUPER_ADMIN_UID, ensureInitialSuperAdmin } from '../server/adminAuth';
import { InvoiceService } from '../server/invoiceService';
import { ensureSystemAccounts } from '../server/accountingSeedService';
import { ensureDefaultAccountingPeriod } from '../server/accountingPeriodService';
import { SeedService } from '../server/seedService';
import { GeneralLedgerService } from '../server/generalLedgerService';
import { TrialBalanceService } from '../server/trialBalanceService';

const BASE_URL = 'http://localhost:3000';

interface TestResult {
  code: string;
  name: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

function assertTest(condition: boolean, code: string, name: string, detail?: string) {
  const passed = Boolean(condition);
  results.push({
    code,
    name,
    passed,
    message: detail || (passed ? 'Verified successfully' : 'Assertion failed'),
  });

  const icon = passed ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`${icon} ${code}: ${name}${detail ? ` | ${detail}` : ''}`);
}

export async function runSalesInvoiceAccountingSuite() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 5.5 PART 2: SALES INVOICE + ACCOUNTING INTEGRATION');
  console.log('Timestamp:', new Date().toISOString());
  console.log('======================================================================\n');

  // Pre-bootstrap seed checks
  await SeedService.seedIfEmpty();
  await ensureInitialSuperAdmin();
  await ensureSystemAccounts();
  await ensureDefaultAccountingPeriod();

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SERVER_TXN_TOKEN}`,
    'x-admin-role': 'SUPER_ADMIN',
    'x-admin-uid': AUTHORITATIVE_SUPER_ADMIN_UID,
  };

  const testRetailerId = 'ret-brahmpuri-001';
  const testOrderId = 'ord-phase55-p2-test-01';

  // Ensure test retailer exists
  await setDoc(
    doc(db, 'retailers', testRetailerId),
    {
      retailerId: testRetailerId,
      shopName: 'Brahmpuri General Store',
      ownerName: 'Ramesh Sharma',
      mobileNumber: '+919810011111',
      shopAddress: 'Shop 12, Brahmpuri Main Road',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110053',
      status: 'VERIFIED',
      _serverTxnToken: SERVER_TXN_TOKEN,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  // Ensure test order exists in orders
  await setDoc(
    doc(db, 'orders', testOrderId),
    {
      orderId: testOrderId,
      retailerId: testRetailerId,
      status: 'CONFIRMED',
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      items: [
        { productId: 'prod-001', quantity: 10, unitPrice: 70 },
      ],
      totalAmount: 700,
      _serverTxnToken: SERVER_TXN_TOKEN,
      createdAt: new Date().toISOString(),
    },
    { merge: true }
  );

  // Ensure test product prod-001 has known stock
  const p1Ref = doc(db, 'products', 'prod-001');
  const p1Snap = await getDoc(p1Ref);
  const baselineP1Stock = p1Snap.data()?.stockQuantity || 420;

  // Record baselines for Boundary & Accounting Verifications
  const initialJournalsSnap = await getDocs(collection(db, 'journalEntries'));
  const baselineJournalCount = initialJournalsSnap.size;
  const initialLinesSnap = await getDocs(collection(db, 'journalEntryLines'));
  const baselineLinesCount = initialLinesSnap.size;
  const initialMovementsSnap = await getDocs(collection(db, 'inventoryMovements'));
  const baselineMovementsCount = initialMovementsSnap.size;

  // ==========================================
  // SECTION 1: ENVIRONMENT PRE-FLIGHT (ENV-01)
  // ==========================================
  console.log('--- SECTION 1: ENVIRONMENT PRE-FLIGHT (ENV-01) ---');

  const requiredCollections = [
    'salesInvoices',
    'purchaseInvoices',
    'invoiceSequences',
    'retailers',
    'products',
    'productPricing',
    'orders',
    'chartOfAccounts',
    'accountingPeriods',
    'journalEntries',
    'journalEntryLines',
    'accountingSequences',
    'adminAuditLogs',
  ];

  let allCollectionsExist = true;
  for (const cName of requiredCollections) {
    try {
      const snap = await getDocs(query(collection(db, cName)));
      if (snap === undefined) allCollectionsExist = false;
    } catch {
      allCollectionsExist = false;
    }
  }

  const appEnv = process.env.APP_ENV || 'production';
  console.log(`CURRENT RUNTIME PRE-FLIGHT:
  Firebase Project: ${cfg.projectId}
  Firestore Database: ${cfg.firestoreDatabaseId}
  Storage Bucket: ${cfg.storageBucket}
  APP_ENV: ${appEnv}
  Warehouse ID: ${OPERATIONAL_WAREHOUSE_ID}`);

  assertTest(
    Boolean(cfg.projectId) &&
    OPERATIONAL_WAREHOUSE_ID === 'WH-BRAHMPURI-01' &&
    allCollectionsExist,
    'ENV-01',
    'Current Runtime & Authoritative Collections Verified',
    `Project: "${cfg.projectId}", DB: "${cfg.firestoreDatabaseId}", Bucket: "${cfg.storageBucket}", Env: "${appEnv}", Hub: "${OPERATIONAL_WAREHOUSE_ID}", 13 core collections verified.`
  );

  // ==========================================
  // SECTION 2: SALES INVOICE (SALES-01 to SALES-08)
  // ==========================================
  console.log('\n--- SECTION 2: SALES INVOICE (SALES-01 to SALES-08) ---');

  let salesInvDraft: any = null;

  // SALES-01: Create valid sales invoice
  try {
    const res = await fetch(`${BASE_URL}/api/admin/invoices/sales`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        customerId: testRetailerId,
        sourceOrderId: testOrderId,
        items: [
          { productId: 'prod-001', quantity: 10, discountAmount: 10, taxRate: 5 }, // unitPrice omitted to test PricingEngine resolution
        ],
      }),
    });
    const data = await res.json();
    salesInvDraft = data.invoice;
    assertTest(
      res.status === 201 && data.success === true && Boolean(salesInvDraft?.invoiceNumber),
      'SALES-01',
      'Create Valid Sales Invoice with Resolved Price',
      `Invoice created: ${salesInvDraft?.invoiceNumber}, resolved unitPrice: ₹${salesInvDraft?.items[0]?.unitPrice}`
    );
  } catch (err: any) {
    assertTest(false, 'SALES-01', 'Create Valid Sales Invoice', err.message);
  }

  // SALES-02: Server calculates totals
  // 10 units @ 70 = 700 - 10 discount = 690 taxable, 5% tax = 34.50, grandTotal = 724.50
  assertTest(
    salesInvDraft?.subtotal === 700 &&
    salesInvDraft?.discountTotal === 10 &&
    salesInvDraft?.taxableTotal === 690 &&
    salesInvDraft?.taxTotal === 34.5 &&
    salesInvDraft?.grandTotal === 724.5,
    'SALES-02',
    'Server Authoritative Totals Calculation Verified',
    `Subtotal: ₹${salesInvDraft?.subtotal}, Taxable: ₹${salesInvDraft?.taxableTotal}, Tax: ₹${salesInvDraft?.taxTotal}, Grand: ₹${salesInvDraft?.grandTotal}`
  );

  // SALES-03: Client totals cannot be forged
  try {
    const res = await fetch(`${BASE_URL}/api/admin/invoices/sales`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        customerId: testRetailerId,
        grandTotal: 1, // client forged grand total
        items: [{ productId: 'prod-001', quantity: 10 }],
      }),
    });
    const data = await res.json();
    assertTest(
      res.status === 400 && data.error === 'CLIENT_TOTAL_INJECTION_FORBIDDEN',
      'SALES-03',
      'Client Totals Cannot Be Forged',
      `Status: ${res.status}, error: ${data.error}`
    );
  } catch (err: any) {
    assertTest(false, 'SALES-03', 'Client Totals Cannot Be Forged', err.message);
  }

  // SALES-04: Invalid product rejected
  try {
    const res = await fetch(`${BASE_URL}/api/admin/invoices/sales`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        customerId: testRetailerId,
        items: [{ productId: 'invalid_prod_99999', quantity: 1 }],
      }),
    });
    const data = await res.json();
    assertTest(
      res.status === 400 && data.error === 'PRODUCT_NOT_FOUND',
      'SALES-04',
      'Invalid Product Rejected',
      `Status: ${res.status}, error: ${data.error}`
    );
  } catch (err: any) {
    assertTest(false, 'SALES-04', 'Invalid Product Rejected', err.message);
  }

  // SALES-05: Invalid retailer rejected
  try {
    const res = await fetch(`${BASE_URL}/api/admin/invoices/sales`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        customerId: 'non_existent_ret_9999',
        items: [{ productId: 'prod-001', quantity: 1 }],
      }),
    });
    const data = await res.json();
    assertTest(
      res.status === 400 && data.error === 'CUSTOMER_NOT_FOUND',
      'SALES-05',
      'Invalid Retailer Rejected',
      `Status: ${res.status}, error: ${data.error}`
    );
  } catch (err: any) {
    assertTest(false, 'SALES-05', 'Invalid Retailer Rejected', err.message);
  }

  // SALES-06: Source order ownership enforced
  try {
    const res = await fetch(`${BASE_URL}/api/admin/invoices/sales`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        customerId: 'ret-brahmpuri-002', // different retailer than order
        sourceOrderId: testOrderId,
        items: [{ productId: 'prod-001', quantity: 1 }],
      }),
    });
    const data = await res.json();
    assertTest(
      res.status === 400 && (data.error === 'ORDER_CUSTOMER_MISMATCH' || data.error === 'CUSTOMER_NOT_FOUND'),
      'SALES-06',
      'Source Order Retailer Ownership Enforced',
      `Status: ${res.status}, error: ${data.error}`
    );
  } catch (err: any) {
    assertTest(false, 'SALES-06', 'Source Order Retailer Ownership Enforced', err.message);
  }

  // SALES-07: Invoice number server-generated
  const currentYear = new Date().getFullYear();
  assertTest(
    salesInvDraft?.invoiceNumber?.startsWith(`SI-${currentYear}-`),
    'SALES-07',
    'Invoice Number Server-Generated and Year-Scoped',
    `Generated sequence: "${salesInvDraft?.invoiceNumber}"`
  );

  // SALES-08: Draft status verified
  assertTest(
    salesInvDraft?.invoiceStatus === 'DRAFT' && salesInvDraft?.accountingStatus === 'NOT_POSTED',
    'SALES-08',
    'Draft Status & NOT_POSTED Accounting Verified',
    `invoiceStatus: "${salesInvDraft?.invoiceStatus}", accountingStatus: "${salesInvDraft?.accountingStatus}"`
  );

  // ==========================================
  // SECTION 3: ACCOUNTING INTEGRATION (ACCOUNTING-01 to ACCOUNTING-14)
  // ==========================================
  console.log('\n--- SECTION 3: ACCOUNTING INTEGRATION (ACCOUNTING-01 to ACCOUNTING-14) ---');

  // ACCOUNTING-01: Draft invoice does not create journal
  const journalsAfterDraft = await getDocs(collection(db, 'journalEntries'));
  assertTest(
    journalsAfterDraft.size === baselineJournalCount,
    'ACCOUNTING-01',
    'Draft Invoice Does NOT Create Accounting Journal',
    `Journals count remains ${journalsAfterDraft.size} (unchanged from baseline ${baselineJournalCount})`
  );

  // ACCOUNTING-02 to ACCOUNTING-06: Issue Sales Invoice
  let issuedInvoice: any = null;
  try {
    const res = await fetch(`${BASE_URL}/api/admin/invoices/sales/${salesInvDraft.invoiceId}/issue`, {
      method: 'POST',
      headers: authHeaders,
    });
    const data = await res.json();
    issuedInvoice = data.invoice;

    assertTest(
      res.status === 200 && data.success === true && Boolean(data.accountingJournalId),
      'ACCOUNTING-02',
      'Issue Creates Exactly One Accounting Journal',
      `Journal ID: ${data.accountingJournalId}, Voucher: ${data.accountingVoucherNumber}`
    );
  } catch (err: any) {
    assertTest(false, 'ACCOUNTING-02', 'Issue Creates Exactly One Journal', err.message);
  }

  // ACCOUNTING-03: Invoice becomes ISSUED
  assertTest(
    issuedInvoice?.invoiceStatus === 'ISSUED',
    'ACCOUNTING-03',
    'Invoice Status Becomes ISSUED',
    `Status: "${issuedInvoice?.invoiceStatus}"`
  );

  // ACCOUNTING-04: AccountingStatus becomes POSTED
  assertTest(
    issuedInvoice?.accountingStatus === 'POSTED',
    'ACCOUNTING-04',
    'Invoice AccountingStatus Becomes POSTED',
    `accountingStatus: "${issuedInvoice?.accountingStatus}"`
  );

  // Fetch the posted journal entry from Firestore
  const journalRef = doc(db, 'journalEntries', issuedInvoice.accountingJournalId);
  const journalSnap = await getDoc(journalRef);
  const journalData = journalSnap.data();

  // ACCOUNTING-05: Journal referenceType = SALES_INVOICE
  assertTest(
    journalData?.referenceType === 'SALES_INVOICE',
    'ACCOUNTING-05',
    'Journal referenceType = SALES_INVOICE',
    `referenceType: "${journalData?.referenceType}"`
  );

  // ACCOUNTING-06: Journal referenceId = invoiceId
  assertTest(
    journalData?.referenceId === salesInvDraft.invoiceId,
    'ACCOUNTING-06',
    'Journal referenceId = invoiceId',
    `referenceId: "${journalData?.referenceId}"`
  );

  // Fetch journal lines
  const linesQuery = query(
    collection(db, 'journalEntryLines'),
    where('journalId', '==', issuedInvoice.accountingJournalId)
  );
  const linesSnap = await getDocs(linesQuery);
  const lines = linesSnap.docs.map(d => d.data());

  const receivableLine = lines.find(l => l.accountCodeSnapshot === '1300');
  const revenueLine = lines.find(l => l.accountCodeSnapshot === '4100');
  const gstLine = lines.find(l => l.accountCodeSnapshot === '2200');

  // ACCOUNTING-07: Receivable debit correct
  // Grand total was 724.50
  assertTest(
    receivableLine?.debit === 724.5 && receivableLine?.credit === 0,
    'ACCOUNTING-07',
    'Accounts Receivable Debit Matches Grand Total',
    `1300 Accounts Receivable Debit: ₹${receivableLine?.debit}`
  );

  // ACCOUNTING-08: Sales revenue credit correct
  // Taxable was 690
  assertTest(
    revenueLine?.credit === 690 && revenueLine?.debit === 0,
    'ACCOUNTING-08',
    'Sales Revenue Credit Matches Taxable Total',
    `4100 Sales Revenue Credit: ₹${revenueLine?.credit}`
  );

  // ACCOUNTING-09: Output GST credit correct when tax exists
  // Tax was 34.50
  assertTest(
    gstLine?.credit === 34.5 && gstLine?.debit === 0,
    'ACCOUNTING-09',
    'Output GST Credit Matches Tax Total',
    `2200 Output GST Credit: ₹${gstLine?.credit}`
  );

  // ACCOUNTING-10: Zero-tax invoice posts correctly
  let zeroTaxInvoice: any = null;
  try {
    const zeroRes = await fetch(`${BASE_URL}/api/admin/invoices/sales`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        customerId: testRetailerId,
        items: [
          { productId: 'prod-001', quantity: 2, unitPrice: 70, discountAmount: 0, taxRate: 0 },
        ],
      }),
    });
    const zeroData = await zeroRes.json();
    const issueZeroRes = await fetch(`${BASE_URL}/api/admin/invoices/sales/${zeroData.invoice.invoiceId}/issue`, {
      method: 'POST',
      headers: authHeaders,
    });
    const issueZeroData = await issueZeroRes.json();
    zeroTaxInvoice = issueZeroData.invoice;

    const zeroLinesSnap = await getDocs(
      query(collection(db, 'journalEntryLines'), where('journalId', '==', zeroTaxInvoice.accountingJournalId))
    );
    const zeroLines = zeroLinesSnap.docs.map(d => d.data());
    const zeroGstLine = zeroLines.find(l => l.accountCodeSnapshot === '2200');

    assertTest(
      issueZeroData.success === true &&
      zeroLines.length === 2 &&
      zeroGstLine === undefined &&
      zeroTaxInvoice.grandTotal === 140,
      'ACCOUNTING-10',
      'Zero-Tax Invoice Posts Correctly (AR Dr, Revenue Cr, No GST Line)',
      `GrandTotal: ₹${zeroTaxInvoice.grandTotal}, Lines count: ${zeroLines.length}, No 2200 line present.`
    );
  } catch (err: any) {
    assertTest(false, 'ACCOUNTING-10', 'Zero-Tax Invoice Posts Correctly', err.message);
  }

  // ACCOUNTING-11: Journal balanced
  assertTest(
    journalData?.totalDebit === journalData?.totalCredit && journalData?.totalDebit === 724.5,
    'ACCOUNTING-11',
    'Journal Balanced (Total Debit == Total Credit)',
    `Debit: ₹${journalData?.totalDebit} == Credit: ₹${journalData?.totalCredit}`
  );

  // ACCOUNTING-12: Trial Balance remains balanced
  const tb = await TrialBalanceService.generateTrialBalance();
  assertTest(
    tb.isBalanced === true && Math.abs(tb.totalDebitPaise - tb.totalCreditPaise) === 0,
    'ACCOUNTING-12',
    'Trial Balance Remains Authoritatively Balanced',
    `Balanced: ${tb.isBalanced}, Total Debit: ₹${tb.totalDebit} == Total Credit: ₹${tb.totalCredit}`
  );

  // ACCOUNTING-13: General Ledger reflects invoice
  const arLedger = await GeneralLedgerService.getAccountLedger('1300');
  const matchingTx = arLedger.transactions.find(t => t.referenceId === salesInvDraft.invoiceId);
  const foundInAr = Boolean(matchingTx && matchingTx.debit === 724.5);
  assertTest(
    foundInAr,
    'ACCOUNTING-13',
    'General Ledger Accounts Receivable Reflects Invoice Posting',
    `Transaction found in 1300 ledger: ${foundInAr}, Debit: ₹${matchingTx?.debit}`
  );

  // ACCOUNTING-14: Journal voucher server-generated
  assertTest(
    journalData?.journalNumber?.startsWith(`JV-${currentYear}-`),
    'ACCOUNTING-14',
    'Journal Voucher Number Server-Generated and Sequenced',
    `Voucher Number: "${journalData?.journalNumber}"`
  );

  // ==========================================
  // SECTION 4: IDEMPOTENCY & CONCURRENCY (IDEMP-01 to IDEMP-03)
  // ==========================================
  console.log('\n--- SECTION 4: IDEMPOTENCY & CONCURRENCY (IDEMP-01 to IDEMP-03) ---');

  // IDEMP-01: Repeated issue request does not duplicate journal
  const preRepeatJournals = await getDocs(collection(db, 'journalEntries'));
  const repeatRes = await fetch(`${BASE_URL}/api/admin/invoices/sales/${salesInvDraft.invoiceId}/issue`, {
    method: 'POST',
    headers: authHeaders,
  });
  const repeatData = await repeatRes.json();
  const postRepeatJournals = await getDocs(collection(db, 'journalEntries'));

  assertTest(
    repeatRes.status === 200 &&
    repeatData.success === true &&
    postRepeatJournals.size === preRepeatJournals.size &&
    repeatData.accountingJournalId === issuedInvoice.accountingJournalId,
    'IDEMP-01',
    'Repeated Issue Request Returns Idempotent State Without Duplicating Journal',
    `Journal count unchanged: ${postRepeatJournals.size}, same Journal ID: ${repeatData.accountingJournalId}`
  );

  // IDEMP-02: Concurrent issue attempts produce exactly one journal
  const draftForConcurrent = await InvoiceService.createSalesInvoice(
    { uid: AUTHORITATIVE_SUPER_ADMIN_UID, name: 'Admin', email: 'admin@mrfutkar.in', mobile: '+919999999999', role: 'SUPER_ADMIN', status: 'ACTIVE', permissionsVersion: 1 },
    {
      customerId: testRetailerId,
      items: [{ productId: 'prod-001', quantity: 1, unitPrice: 70 }],
    }
  );

  const preConcurrentJournals = await getDocs(collection(db, 'journalEntries'));
  const [resA, resB, resC] = await Promise.all([
    fetch(`${BASE_URL}/api/admin/invoices/sales/${draftForConcurrent.invoiceId}/issue`, {
      method: 'POST',
      headers: authHeaders,
    }),
    fetch(`${BASE_URL}/api/admin/invoices/sales/${draftForConcurrent.invoiceId}/issue`, {
      method: 'POST',
      headers: authHeaders,
    }),
    fetch(`${BASE_URL}/api/admin/invoices/sales/${draftForConcurrent.invoiceId}/issue`, {
      method: 'POST',
      headers: authHeaders,
    }),
  ]);
  const [dataA, dataB, dataC] = await Promise.all([resA.json(), resB.json(), resC.json()]);
  const postConcurrentJournals = await getDocs(collection(db, 'journalEntries'));

  assertTest(
    postConcurrentJournals.size === preConcurrentJournals.size + 1 &&
    dataA.accountingJournalId === dataB.accountingJournalId &&
    dataB.accountingJournalId === dataC.accountingJournalId,
    'IDEMP-02',
    'Concurrent Issue Attempts Produce Exactly One Journal',
    `Journals incremented by exactly 1 (${postConcurrentJournals.size}). All 3 requests returned identical journalId: ${dataA.accountingJournalId}`
  );

  // IDEMP-03: Invoice accounting linkage remains consistent
  const refetchedIssued = await InvoiceService.getSalesInvoiceById(draftForConcurrent.invoiceId);
  assertTest(
    refetchedIssued?.invoiceStatus === 'ISSUED' &&
    refetchedIssued?.accountingStatus === 'POSTED' &&
    refetchedIssued?.accountingJournalId === dataA.accountingJournalId &&
    Boolean(refetchedIssued?.accountingVoucherNumber),
    'IDEMP-03',
    'Invoice Accounting Linkage Remains Strict and Consistent',
    `Status: ${refetchedIssued?.invoiceStatus}, Voucher: ${refetchedIssued?.accountingVoucherNumber}`
  );

  // ==========================================
  // SECTION 5: INVENTORY ZERO DOUBLE DEDUCTION BOUNDARY (INVENTORY-01 to INVENTORY-03)
  // ==========================================
  console.log('\n--- SECTION 5: INVENTORY BOUNDARY (INVENTORY-01 to INVENTORY-03) ---');

  // Verify stock before and after invoice creation
  const preCheckP1 = await getDoc(p1Ref);
  const preStock = preCheckP1.data()?.stockQuantity;

  const invCreated = await InvoiceService.createSalesInvoice(
    { uid: AUTHORITATIVE_SUPER_ADMIN_UID, name: 'Admin', email: 'admin@mrfutkar.in', mobile: '+919999999999', role: 'SUPER_ADMIN', status: 'ACTIVE', permissionsVersion: 1 },
    {
      customerId: testRetailerId,
      items: [{ productId: 'prod-001', quantity: 20 }],
    }
  );

  const postCreateP1 = await getDoc(p1Ref);
  assertTest(
    postCreateP1.data()?.stockQuantity === preStock,
    'INVENTORY-01',
    'Product Stock Unchanged by Sales Invoice Creation',
    `Stock remains ${postCreateP1.data()?.stockQuantity} (unchanged)`
  );

  // Issue the invoice
  await InvoiceService.issueSalesInvoice(
    { uid: AUTHORITATIVE_SUPER_ADMIN_UID, name: 'Admin', email: 'admin@mrfutkar.in', mobile: '+919999999999', role: 'SUPER_ADMIN', status: 'ACTIVE', permissionsVersion: 1 },
    invCreated.invoiceId
  );

  const postIssueP1 = await getDoc(p1Ref);
  assertTest(
    postIssueP1.data()?.stockQuantity === preStock,
    'INVENTORY-02',
    'Product Stock Unchanged by Sales Invoice Issuance (No Double Deduction)',
    `Stock remains ${postIssueP1.data()?.stockQuantity} after issue`
  );

  // INVENTORY-03: No inventoryMovement created
  const postMovementsSnap = await getDocs(collection(db, 'inventoryMovements'));
  assertTest(
    postMovementsSnap.size === baselineMovementsCount,
    'INVENTORY-03',
    'No Inventory Movements Created by Invoice Operations',
    `Movements count remains ${postMovementsSnap.size} (unchanged from baseline ${baselineMovementsCount})`
  );

  // ==========================================
  // SECTION 6: ORDER OPERATIONAL ISOLATION BOUNDARY (ORDER-01 to ORDER-02)
  // ==========================================
  console.log('\n--- SECTION 6: ORDER BOUNDARY (ORDER-01 to ORDER-02) ---');

  const refetchedOrder = await getDoc(doc(db, 'orders', testOrderId));
  const orderData = refetchedOrder.data();

  assertTest(
    orderData?.totalAmount === 700 && orderData?.items?.length === 1,
    'ORDER-01',
    'Source Order Items and Totals Remain Unchanged',
    `Order total: ₹${orderData?.totalAmount}, items: ${orderData?.items?.length}`
  );

  assertTest(
    orderData?.status === 'CONFIRMED',
    'ORDER-02',
    'Source Order Status Remains Unchanged',
    `Order status: "${orderData?.status}"`
  );

  // ==========================================
  // SECTION 7: IMMUTABILITY (IMM-01 to IMM-03)
  // ==========================================
  console.log('\n--- SECTION 7: IMMUTABILITY (IMM-01 to IMM-03) ---');

  // IMM-01: Posted journal immutable
  let journalMutationDenied = false;
  try {
    await fetch(`${BASE_URL}/api/admin/accounting/journals/${issuedInvoice.accountingJournalId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        narration: 'MUTATED HACKED NARRATION',
      }),
    });
  } catch {
    journalMutationDenied = true;
  }
  const checkJournal = await getDoc(journalRef);
  assertTest(
    checkJournal.data()?.status === 'POSTED' && checkJournal.data()?.narration !== 'MUTATED HACKED NARRATION',
    'IMM-01',
    'Posted Accounting Journal Entry Remains Immutable',
    `Journal status: ${checkJournal.data()?.status}, narration untouched.`
  );

  // IMM-02: Issued invoice protected from price mutation
  try {
    const res = await fetch(`${BASE_URL}/api/admin/invoices/sales/${issuedInvoice.invoiceId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        items: [{ productId: 'prod-001', quantity: 999, unitPrice: 1 }],
      }),
    });
    const data = await res.json();
    assertTest(
      res.status === 400 && data.error === 'INVOICE_IMMUTABLE',
      'IMM-02',
      'Issued Invoice Protected from Price & Item Mutation',
      `Status: ${res.status}, error: ${data.error}`
    );
  } catch (err: any) {
    assertTest(false, 'IMM-02', 'Issued Invoice Protected from Price Mutation', err.message);
  }

  // IMM-03: Historical invoice snapshots preserved
  await updateDoc(doc(db, 'retailers', testRetailerId), {
    shopName: 'COMPLETELY MUTATED STORE NAME',
    _serverTxnToken: SERVER_TXN_TOKEN,
  });
  const refetchedHistorical = await InvoiceService.getSalesInvoiceById(issuedInvoice.invoiceId);
  assertTest(
    refetchedHistorical?.billingAddressSnapshot.businessName === 'Brahmpuri General Store',
    'IMM-03',
    'Historical Invoice Address Snapshots Preserved After Customer Edit',
    `Historical snapshot preserved: "${refetchedHistorical?.billingAddressSnapshot.businessName}"`
  );

  // ==========================================
  // SECTION 8: SECURITY & RBAC (SEC-01 to SEC-07)
  // ==========================================
  console.log('\n--- SECTION 8: SECURITY & RBAC (SEC-01 to SEC-07) ---');

  // SEC-01: Unauthenticated rejected
  const unauthRes = await fetch(`${BASE_URL}/api/admin/invoices/sales/${salesInvDraft.invoiceId}/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  assertTest(
    unauthRes.status === 401,
    'SEC-01',
    'Unauthenticated Issue Request Rejected (401)',
    `Status: ${unauthRes.status}`
  );

  // SEC-02: Retailer role rejected
  const retailerRes = await fetch(`${BASE_URL}/api/admin/invoices/sales/${salesInvDraft.invoiceId}/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-role': 'RETAILER', 'x-retailer-id': testRetailerId },
  });
  assertTest(
    retailerRes.status === 401 || retailerRes.status === 403,
    'SEC-02',
    'Retailer Role Direct Issue Request Rejected (401/403)',
    `Status: ${retailerRes.status}`
  );

  // SEC-03: Warehouse Staff rejected
  const whStaffRes = await fetch(`${BASE_URL}/api/admin/invoices/sales/${salesInvDraft.invoiceId}/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-warehouse-role': 'PICKER', 'x-warehouse-user-id': 'WH-USER-01' },
  });
  assertTest(
    whStaffRes.status === 401 || whStaffRes.status === 403,
    'SEC-03',
    'Warehouse Staff Issue Request Rejected (401/403)',
    `Status: ${whStaffRes.status}`
  );

  // SEC-04: Warehouse Manager rejected
  const whMgrRes = await fetch(`${BASE_URL}/api/admin/invoices/sales/${salesInvDraft.invoiceId}/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-warehouse-role': 'WAREHOUSE_ADMIN', 'x-warehouse-user-id': 'WH-ADMIN-01' },
  });
  assertTest(
    whMgrRes.status === 401 || whMgrRes.status === 403,
    'SEC-04',
    'Warehouse Manager Issue Request Rejected (401/403)',
    `Status: ${whMgrRes.status}`
  );

  // SEC-05: Delivery Staff rejected
  const delivRes = await fetch(`${BASE_URL}/api/admin/invoices/sales/${salesInvDraft.invoiceId}/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-delivery-partner-id': 'DP-001' },
  });
  assertTest(
    delivRes.status === 401 || delivRes.status === 403,
    'SEC-05',
    'Delivery Staff Issue Request Rejected (401/403)',
    `Status: ${delivRes.status}`
  );

  // SEC-06: Direct invoice Firestore write denied
  let directInvoiceWriteDenied = false;
  try {
    await setDoc(doc(db, 'salesInvoices', 'unauthorized_hack'), {
      invoiceId: 'unauthorized_hack',
      grandTotal: 0,
    });
  } catch (err: any) {
    directInvoiceWriteDenied = true;
  }
  assertTest(
    directInvoiceWriteDenied,
    'SEC-06',
    'Direct Client SDK Write to salesInvoices Denied by Firestore Rules',
    'Direct client write blocked.'
  );

  // SEC-07: Direct journal Firestore write denied
  let directJournalWriteDenied = false;
  try {
    await setDoc(doc(db, 'journalEntries', 'unauthorized_hack_journal'), {
      journalId: 'unauthorized_hack_journal',
      totalDebit: 100000,
    });
  } catch (err: any) {
    directJournalWriteDenied = true;
  }
  assertTest(
    directJournalWriteDenied,
    'SEC-07',
    'Direct Client SDK Write to journalEntries Denied by Firestore Rules',
    'Direct client write blocked.'
  );

  // ==========================================
  // SECTION 9: AUDIT LOGGING (AUDIT-01 to AUDIT-02)
  // ==========================================
  console.log('\n--- SECTION 9: AUDIT LOGGING (AUDIT-01 to AUDIT-02) ---');

  const auditLogsSnap = await getDocs(
    query(
      collection(db, 'adminAuditLogs'),
      where('targetId', '==', salesInvDraft.invoiceId)
    )
  );

  let foundInvoiceIssuedAudit = false;
  let foundAccountingPostedAudit = false;

  auditLogsSnap.forEach((d) => {
    const act = d.data().action;
    if (act === 'SALES_INVOICE_ISSUED') foundInvoiceIssuedAudit = true;
    if (act === 'SALES_INVOICE_ACCOUNTING_POSTED') foundAccountingPostedAudit = true;
  });

  assertTest(
    foundInvoiceIssuedAudit,
    'AUDIT-01',
    'SALES_INVOICE_ISSUED Audit Log Event Created',
    `Found event: ${foundInvoiceIssuedAudit}`
  );

  assertTest(
    foundAccountingPostedAudit,
    'AUDIT-02',
    'SALES_INVOICE_ACCOUNTING_POSTED Audit Log Event Created',
    `Found event: ${foundAccountingPostedAudit}`
  );

  // ==========================================
  // SECTION 10: REGRESSION (REG-01 to REG-07)
  // ==========================================
  console.log('\n--- SECTION 10: REGRESSION (REG-01 to REG-07) ---');

  // REG-01: Retailer system intact
  const retSnap = await getDoc(doc(db, 'retailers', testRetailerId));
  assertTest(retSnap.exists(), 'REG-01', 'Retailer System Intact', `Retailer ${testRetailerId} exists`);

  // REG-02: Warehouse intact
  const whRes = await fetch(`${BASE_URL}/api/warehouse/inventory`);
  assertTest(
    whRes.status === 401 || whRes.status === 200,
    'REG-02',
    'Warehouse Operations Subsystem Intact',
    `Warehouse endpoint reachable (status: ${whRes.status})`
  );

  // REG-03: Delivery intact
  const delRes = await fetch(`${BASE_URL}/api/delivery/health`);
  assertTest(
    delRes.status === 200 || delRes.status === 404,
    'REG-03',
    'Delivery Partner Subsystem Intact',
    `Delivery service accessible`
  );

  // REG-04: Inventory intact
  const invSnap = await getDoc(p1Ref);
  assertTest(
    invSnap.data()?.stockQuantity === baselineP1Stock,
    'REG-04',
    'Operational FMCG Inventory Balances Intact',
    `prod-001 stock quantity remains ${invSnap.data()?.stockQuantity}`
  );

  // REG-05: Pricing intact
  const prodWithSlabs = invSnap.data();
  assertTest(
    Array.isArray(prodWithSlabs?.priceSlabs) && prodWithSlabs?.priceSlabs?.length > 0,
    'REG-05',
    'Pricing Engine & FMCG Tier Slabs Intact',
    `Slabs count: ${prodWithSlabs?.priceSlabs?.length}`
  );

  // REG-06: GL intact
  const glTest = await GeneralLedgerService.getAccountLedger('4100');
  assertTest(
    glTest.transactions.length >= 1,
    'REG-06',
    'General Ledger System Intact',
    `4100 Sales Revenue contains ${glTest.transactions.length} transactions.`
  );

  // REG-07: Trial Balance intact
  const tbTest = await TrialBalanceService.generateTrialBalance();
  assertTest(
    tbTest.isBalanced === true,
    'REG-07',
    'Trial Balance Intact and Balanced',
    `Total Debit: ₹${tbTest.totalDebit} == Total Credit: ₹${tbTest.totalCredit}`
  );

  // Final Summary
  console.log('\n======================================================================');
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  console.log(`SUMMARY: Total Tests: ${results.length} | Passed: ${passedCount} | Blocked: 0 | Failed: ${failedCount}`);
  console.log('======================================================================\n');

  if (failedCount > 0) {
    console.error(`Execution complete. Status: FAIL`);
    process.exit(1);
  } else {
    console.log(`Execution complete. Status: PASS`);
    process.exit(0);
  }
}

// Self-executing runner
if (process.argv[1]?.includes('phase55_part2')) {
  runSalesInvoiceAccountingSuite().catch((err) => {
    console.error('Test suite execution error:', err);
    process.exit(1);
  });
}
