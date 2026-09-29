/**
 * MR FUTKAR — Phase 5.8 Part 3: Supplier Payment Reversal Test Suite
 * Production-grade server-authoritative double-entry supplier payment reversal verification suite
 * Validates:
 * - REV-01: POSTED supplier payment can be reversed
 * - REV-02: DRAFT supplier payment cannot be reversed
 * - REV-03: Already REVERSED supplier payment cannot be reversed twice
 * - REV-04: Cash supplier payment reversal creates exact opposite journal: Cash DR / AP CR
 * - REV-05: Bank/UPI supplier payment reversal creates exact opposite journal: Bank DR / AP CR
 * - REV-06: Revenue remains unchanged
 * - REV-07: Output GST remains unchanged
 * - REV-08: Input GST remains unchanged
 * - REV-09: COGS remains unchanged
 * - REV-10: Inventory remains unchanged
 * - REV-11: Unallocated supplier payment reversal works correctly
 * - REV-12: Fully allocated supplier payment reversal restores purchase invoice balances
 * - REV-13: Purchase invoice payment status returns to its correct pre-payment state
 * - REV-14: Duplicate reversal request is idempotent
 * - REV-15: Unauthorized reversal is rejected (SUPER_ADMIN required)
 * - REV-16: Client field injection is rejected
 * - REV-17: Supplier AP ledger remains consistent
 * - REV-18: SUPPLIER_PAYMENT_REVERSED audit record is created
 * - REV-19: Original supplier payment and original journal remain preserved
 * - REV-20: Reversal journal correctly resolves to the canonical supplier identity
 * - REV-21: Partially allocated supplier payment reversal restores every affected invoice correctly
 * - REV-22: Multiple-invoice allocation reversal restores all affected invoices atomically
 * - REV-23: Reversal creates exactly one reversal journal
 * - REV-24: Reversal does not create any secondary allocation/accounting journal
 * - REV-25: Reversal journal supplier references do not produce UNRESOLVED_PARTY_REFERENCE
 * - REV-26: Canonical supplier resolution using existing supplier ledger architecture
 * - REV-27: Concurrent duplicate reversal execution safety
 */

import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN, OPERATIONAL_WAREHOUSE_ID } from '../server/firebaseAdmin';
import cfg from '../firebase-applet-config.json';
import { SeedService } from '../server/seedService';
import { ensureSystemAccounts } from '../server/accountingSeedService';
import { ensureDefaultAccountingPeriod } from '../server/accountingPeriodService';
import { ensureInitialSuperAdmin } from '../server/adminAuth';
import { SupplierPaymentService } from '../server/supplierPaymentService';
import { InvoiceService } from '../server/invoiceService';
import { GeneralLedgerService } from '../server/generalLedgerService';
import { PartyLedgerService } from '../server/partyLedgerService';
import { AdminSession } from '../src/types/admin';
import { SupplierPayment } from '../src/types/supplierPayment';
import { PurchaseInvoice } from '../src/types/invoice';
import { JournalEntry, JournalEntryLine } from '../src/types/accounting';

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

export async function runSupplierPaymentReversalTestSuite() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 5.8 PART 3: SUPPLIER PAYMENT REVERSAL');
  console.log('Timestamp:', new Date().toISOString());
  console.log('======================================================================\n');

  const originalWarn = console.warn;
  const unresolvedWarnings: string[] = [];
  console.warn = (...args: any[]) => {
    const msg = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    if (msg.includes('UNRESOLVED_PARTY_REFERENCE')) {
      unresolvedWarnings.push(msg);
    }
    originalWarn(...args);
  };

  console.log('LIVE RUNTIME ENVIRONMENT:');
  console.log(` - Firebase Project ID:     ${cfg.projectId}`);
  console.log(` - Firestore Database ID:   ${cfg.firestoreDatabaseId}`);
  console.log(` - Active Warehouse:        ${OPERATIONAL_WAREHOUSE_ID}\n`);

  // Preflight setup
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

  const staffAdminSession: AdminSession = {
    uid: 'mrfutkar_staff_user',
    email: 'staff@mrfutkar.in',
    name: 'Warehouse Staff',
    mobile: '+919810055555',
    role: 'STAFF' as any,
    status: 'ACTIVE',
    permissionsVersion: 1,
  };

  const testTimestamp = Date.now();
  const supplierAId = `sup_rev_a_${testTimestamp}`;
  const supplierBId = `sup_rev_b_${testTimestamp}`;

  // 1. Provision Canonical Suppliers A & B
  await setDoc(doc(db, 'suppliers', supplierAId), {
    supplierId: supplierAId,
    businessName: 'Amul India Distribution Hub Rev',
    contactName: 'Ramesh Patel',
    mobile: '9811166333',
    fullAddress: 'Plot 12, Anand Dairy Zone, Delhi',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110092',
    gstin: '07AAACA1234D1Z9',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    _serverTxnToken: SERVER_TXN_TOKEN,
  });

  await setDoc(doc(db, 'suppliers', supplierBId), {
    supplierId: supplierBId,
    businessName: 'ITC Foods Regional Hub Rev',
    contactName: 'Manoj Kumar',
    mobile: '9811155444',
    fullAddress: 'Plot 34, Jhilmil Industrial Area, Delhi',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110095',
    gstin: '07AAACI1234D1Z8',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    _serverTxnToken: SERVER_TXN_TOKEN,
  });

  // 2. Create and Post Purchase Invoices for Supplier A
  // PI-1: ₹2,000 (200,000 paise)
  const pi1 = await InvoiceService.createPurchaseInvoice(superAdminSession, {
    supplierId: supplierAId,
    supplierType: 'DISTRIBUTOR',
    supplierInvoiceNumber: `INV-AMUL-1-${testTimestamp}`,
    invoiceDate: '2026-09-01',
    items: [
      {
        productId: 'prod-001',
        quantity: 4,
        unitCost: 500,
        taxRate: 0,
      },
    ],
  });
  await InvoiceService.postPurchaseInvoice(superAdminSession, pi1.invoiceId);

  // PI-2: ₹3,000 (300,000 paise)
  const pi2 = await InvoiceService.createPurchaseInvoice(superAdminSession, {
    supplierId: supplierAId,
    supplierType: 'DISTRIBUTOR',
    supplierInvoiceNumber: `INV-AMUL-2-${testTimestamp}`,
    invoiceDate: '2026-09-02',
    items: [
      {
        productId: 'prod-002',
        quantity: 6,
        unitCost: 500,
        taxRate: 0,
      },
    ],
  });
  await InvoiceService.postPurchaseInvoice(superAdminSession, pi2.invoiceId);

  // Snapshot initial GL account balances before payments and reversals
  const initialGLRevenue = await GeneralLedgerService.getAccountLedger('4100');
  const initialGLOutputGst = await GeneralLedgerService.getAccountLedger('2200');
  const initialGLInputGst = await GeneralLedgerService.getAccountLedger('2300');
  const initialGLCogs = await GeneralLedgerService.getAccountLedger('5100');
  const initialGLInventory = await GeneralLedgerService.getAccountLedger('1400');

  // -------------------------------------------------------------------------
  // SECTION 1: Unallocated Cash Payment Reversal (REV-01, 04, 11, 18, 19, 20, 23, 24)
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 1: Unallocated Cash Payment Reversal ---');

  // Create & Post Cash Payment: ₹1,000 (100,000 paise)
  const createCashPay = await SupplierPaymentService.createSupplierPayment(superAdminSession, {
    supplierId: supplierAId,
    amountPaise: 100000,
    paymentMethod: 'CASH',
    cashBankAccountCode: '1100',
    referenceNumber: `CASH-PAY-01-${testTimestamp}`,
  });
  const postCashPay = await SupplierPaymentService.postSupplierPayment(
    superAdminSession,
    createCashPay.payment.paymentId
  );

  const origCashPaymentId = postCashPay.payment.paymentId;
  const origCashJournalId = postCashPay.payment.journalId!;

  // Reverse Cash Payment
  const revCashRes = await SupplierPaymentService.reverseSupplierPayment(
    superAdminSession,
    origCashPaymentId,
    { reason: 'Duplicate cash disbursement by cashier error' }
  );

  // Assert REV-01: POSTED supplier payment can be reversed
  assertTest(
    revCashRes.success === true && revCashRes.payment.status === 'REVERSED',
    'REV-01',
    'POSTED supplier payment can be reversed',
    `Payment ${origCashPaymentId} status: ${revCashRes.payment.status}`
  );

  // Assert REV-11: Unallocated supplier payment reversal works correctly
  assertTest(
    revCashRes.payment.allocations.length === 0 && revCashRes.payment.allocatedAmountPaise === 0,
    'REV-11',
    'Unallocated supplier payment reversal works correctly',
    `Unallocated payment reversed cleanly without invoice mutations`
  );

  // Assert REV-04: Cash supplier payment reversal creates exact opposite journal: Cash DR / AP CR
  const cashRevJournalId = revCashRes.payment.reversalJournalId!;
  const cashRevJournalSnap = await getDoc(doc(db, 'journalEntries', cashRevJournalId));
  const cashRevJournal = cashRevJournalSnap.data() as JournalEntry;
  const cashRevLinesSnap = await getDocs(
    query(collection(db, 'journalEntryLines'), where('journalId', '==', cashRevJournalId))
  );
  const cashRevLines: JournalEntryLine[] = [];
  cashRevLinesSnap.forEach((d) => cashRevLines.push(d.data() as JournalEntryLine));

  const apCreditLine = cashRevLines.find((l) => l.accountCodeSnapshot === '2100');
  const cashDebitLine = cashRevLines.find((l) => l.accountCodeSnapshot === '1100');

  assertTest(
    cashRevJournal.status === 'POSTED' &&
      cashRevJournal.voucherType === 'REVERSAL' &&
      cashRevJournal.reversalOfJournalId === origCashJournalId &&
      apCreditLine !== undefined &&
      apCreditLine.credit === 1000 &&
      apCreditLine.debit === 0 &&
      cashDebitLine !== undefined &&
      cashDebitLine.debit === 1000 &&
      cashDebitLine.credit === 0,
    'REV-04',
    'Cash supplier payment reversal creates exact opposite journal (Cash DR / AP CR)',
    `Cash 1100 DR=₹${cashDebitLine?.debit}, AP 2100 CR=₹${apCreditLine?.credit}, reversalOf=${cashRevJournal.reversalOfJournalId}`
  );

  // Assert REV-19: Original supplier payment and original journal remain preserved
  const origCashPaySnap = await getDoc(doc(db, 'supplierPayments', origCashPaymentId));
  const origCashPayData = origCashPaySnap.data() as SupplierPayment;
  const origCashJournalSnap = await getDoc(doc(db, 'journalEntries', origCashJournalId));
  const origCashJournalData = origCashJournalSnap.data() as JournalEntry;

  assertTest(
    origCashPaySnap.exists() &&
      origCashPayData.status === 'REVERSED' &&
      origCashPayData.paymentId === origCashPaymentId &&
      origCashJournalSnap.exists() &&
      origCashJournalData.status === 'REVERSED',
    'REV-19',
    'Original supplier payment and original journal remain preserved for permanent audit',
    `Original payment doc preserved with status=REVERSED, original journal preserved with status=REVERSED`
  );

  // Assert REV-20: Reversal journal correctly resolves to the canonical supplier identity
  assertTest(
    cashRevJournal.supplierId === supplierAId && apCreditLine?.supplierId === supplierAId,
    'REV-20',
    'Reversal journal correctly resolves to the canonical supplier identity',
    `Journal supplierId: ${cashRevJournal.supplierId}, Line supplierId: ${apCreditLine?.supplierId}`
  );

  // Assert REV-23: Reversal creates exactly one reversal journal
  const allRevJournalsSnap = await getDocs(
    query(collection(db, 'journalEntries'), where('reversalOfJournalId', '==', origCashJournalId))
  );
  assertTest(
    allRevJournalsSnap.size === 1,
    'REV-23',
    'Reversal creates exactly one reversal journal',
    `Found ${allRevJournalsSnap.size} reversal journal(s) for original journal ${origCashJournalId}`
  );

  // Assert REV-24: Reversal does not create any secondary allocation/accounting journal
  const secondaryJournalsSnap = await getDocs(
    query(collection(db, 'journalEntries'), where('referenceId', '==', origCashPaymentId))
  );
  // Total journals referencing origCashPaymentId: original payment (1) + reversal journal (1) = 2
  assertTest(
    secondaryJournalsSnap.size === 2,
    'REV-24',
    'Reversal does not create any secondary allocation/accounting journal',
    `Total journals referencing payment ${origCashPaymentId}: ${secondaryJournalsSnap.size} (original + reversal only)`
  );

  // Assert REV-18: SUPPLIER_PAYMENT_REVERSED audit record is created
  const auditRevQuery = query(
    collection(db, 'adminAuditLogs'),
    where('targetId', '==', origCashPaymentId),
    where('action', '==', 'SUPPLIER_PAYMENT_REVERSED')
  );
  const auditRevSnap = await getDocs(auditRevQuery);
  const auditRevData = !auditRevSnap.empty ? (auditRevSnap.docs[0].data() as any) : null;

  assertTest(
    !auditRevSnap.empty &&
      auditRevData?.metadata?.supplierId === supplierAId &&
      auditRevData?.metadata?.originalJournalId === origCashJournalId &&
      auditRevData?.metadata?.reversalJournalId === cashRevJournalId &&
      auditRevData?.adminUid === superAdminSession.uid,
    'REV-18',
    'SUPPLIER_PAYMENT_REVERSED audit record is created with comprehensive metadata',
    `Audit log found: Action=SUPPLIER_PAYMENT_REVERSED, Admin=${auditRevData?.adminUid}, ReversalJournal=${auditRevData?.metadata?.reversalJournalId}`
  );

  // -------------------------------------------------------------------------
  // SECTION 2: Bank/UPI Payment Reversal (REV-05)
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 2: Bank/UPI Payment Reversal ---');

  const createBankPay = await SupplierPaymentService.createSupplierPayment(superAdminSession, {
    supplierId: supplierAId,
    amountPaise: 150000, // ₹1,500
    paymentMethod: 'NEFT',
    cashBankAccountCode: '1200',
    referenceNumber: `NEFT-PAY-01-${testTimestamp}`,
  });
  const postBankPay = await SupplierPaymentService.postSupplierPayment(
    superAdminSession,
    createBankPay.payment.paymentId
  );

  const origBankJournalId = postBankPay.payment.journalId!;
  const revBankRes = await SupplierPaymentService.reverseSupplierPayment(
    superAdminSession,
    postBankPay.payment.paymentId,
    { reason: 'Incorrect NEFT batch reversal' }
  );

  const bankRevJournalSnap = await getDoc(doc(db, 'journalEntries', revBankRes.payment.reversalJournalId!));
  const bankRevJournal = bankRevJournalSnap.data() as JournalEntry;
  const bankRevLinesSnap = await getDocs(
    query(collection(db, 'journalEntryLines'), where('journalId', '==', revBankRes.payment.reversalJournalId!))
  );
  const bankRevLines: JournalEntryLine[] = [];
  bankRevLinesSnap.forEach((d) => bankRevLines.push(d.data() as JournalEntryLine));

  const bankApCreditLine = bankRevLines.find((l) => l.accountCodeSnapshot === '2100');
  const bankDebitLine = bankRevLines.find((l) => l.accountCodeSnapshot === '1200');

  assertTest(
    bankRevJournal.status === 'POSTED' &&
      bankRevJournal.reversalOfJournalId === origBankJournalId &&
      bankApCreditLine?.credit === 1500 &&
      bankApCreditLine?.debit === 0 &&
      bankDebitLine?.debit === 1500 &&
      bankDebitLine?.credit === 0,
    'REV-05',
    'Bank/UPI supplier payment reversal creates exact opposite journal: Bank DR / AP CR',
    `Bank 1200 DR=₹${bankDebitLine?.debit}, AP 2100 CR=₹${bankApCreditLine?.credit}, reversalOf=${origBankJournalId}`
  );

  // -------------------------------------------------------------------------
  // SECTION 3: Defensive Validations & State Guardrails (REV-02, 03, 14, 15, 16, 27)
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 3: Defensive Validations & State Guardrails ---');

  // REV-02: DRAFT supplier payment cannot be reversed
  const draftPay = await SupplierPaymentService.createSupplierPayment(superAdminSession, {
    supplierId: supplierAId,
    amountPaise: 50000,
    paymentMethod: 'CASH',
    cashBankAccountCode: '1100',
  });
  let draftRevFailed = false;
  let draftRevMsg = '';
  try {
    await SupplierPaymentService.reverseSupplierPayment(superAdminSession, draftPay.payment.paymentId);
  } catch (err: any) {
    draftRevFailed = true;
    draftRevMsg = err.message || '';
  }
  assertTest(
    draftRevFailed && draftRevMsg.includes('CANNOT_REVERSE_DRAFT_PAYMENT'),
    'REV-02',
    'DRAFT supplier payment cannot be reversed',
    `Correctly blocked draft payment reversal: ${draftRevMsg}`
  );

  // REV-03: Already REVERSED supplier payment cannot be reversed twice
  let doubleRevFailed = false;
  let doubleRevMsg = '';
  try {
    await SupplierPaymentService.reverseSupplierPayment(superAdminSession, origCashPaymentId);
  } catch (err: any) {
    doubleRevFailed = true;
    doubleRevMsg = err.message || '';
  }
  assertTest(
    doubleRevFailed && doubleRevMsg.includes('PAYMENT_ALREADY_REVERSED'),
    'REV-03',
    'Already REVERSED supplier payment cannot be reversed twice',
    `Correctly blocked repeated reversal: ${doubleRevMsg}`
  );

  // REV-14: Duplicate reversal request with same idempotency key is idempotent
  const idempPayment = await SupplierPaymentService.createSupplierPayment(superAdminSession, {
    supplierId: supplierAId,
    amountPaise: 50000,
    paymentMethod: 'CASH',
    cashBankAccountCode: '1100',
  });
  await SupplierPaymentService.postSupplierPayment(superAdminSession, idempPayment.payment.paymentId);

  const sharedIdempKey = `rev_idemp_${testTimestamp}`;
  const firstRevCall = await SupplierPaymentService.reverseSupplierPayment(
    superAdminSession,
    idempPayment.payment.paymentId,
    { idempotencyKey: sharedIdempKey, reason: 'First reversal invocation' }
  );

  const replayRevCall = await SupplierPaymentService.reverseSupplierPayment(
    superAdminSession,
    idempPayment.payment.paymentId,
    { idempotencyKey: sharedIdempKey, reason: 'Replayed reversal invocation' }
  );

  assertTest(
    firstRevCall.isIdempotentReplay === false &&
      replayRevCall.isIdempotentReplay === true &&
      firstRevCall.payment.reversalJournalId === replayRevCall.reversalJournal?.journalId,
    'REV-14',
    'Duplicate reversal request with same idempotency key is safely idempotent',
    `Replay returned isIdempotentReplay=true, same reversal journal ${firstRevCall.payment.reversalJournalId}`
  );

  // REV-15: Unauthorized reversal is rejected (SUPER_ADMIN required)
  let staffRevFailed = false;
  let staffRevMsg = '';
  try {
    await SupplierPaymentService.reverseSupplierPayment(staffAdminSession, idempPayment.payment.paymentId);
  } catch (err: any) {
    staffRevFailed = true;
    staffRevMsg = err.message || '';
  }
  assertTest(
    staffRevFailed && staffRevMsg.includes('SUPER_ADMIN_REQUIRED'),
    'REV-15',
    'Unauthorized reversal is rejected (SUPER_ADMIN required)',
    `Staff user blocked: ${staffRevMsg}`
  );

  // REV-16: Client field injection is rejected
  let injectionFailed = false;
  let injectionMsg = '';
  try {
    await SupplierPaymentService.reverseSupplierPayment(
      superAdminSession,
      idempPayment.payment.paymentId,
      { status: 'POSTED', amountPaise: 999999 } as any
    );
  } catch (err: any) {
    injectionFailed = true;
    injectionMsg = err.message || '';
  }
  assertTest(
    injectionFailed && injectionMsg.includes('CLIENT_FIELD_INJECTION_FORBIDDEN'),
    'REV-16',
    'Client field injection is rejected',
    `Client injection blocked: ${injectionMsg}`
  );

  // -------------------------------------------------------------------------
  // SECTION 4: Fully Allocated Payment Reversal & Invoice Restoration (REV-12, 13)
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 4: Fully Allocated Payment Reversal ---');

  // Allocate ₹2,000 against PI-1 (which has ₹2,000 total)
  const fullPay = await SupplierPaymentService.createSupplierPayment(superAdminSession, {
    supplierId: supplierAId,
    amountPaise: 200000,
    paymentMethod: 'BANK_TRANSFER',
    cashBankAccountCode: '1200',
    referenceNumber: `FULL-ALLOC-PAY-${testTimestamp}`,
  });
  await SupplierPaymentService.postSupplierPayment(superAdminSession, fullPay.payment.paymentId);

  // Allocate in full against PI-1
  await SupplierPaymentService.allocateSupplierPayment(superAdminSession, fullPay.payment.paymentId, {
    allocations: [{ invoiceId: pi1.invoiceId, amountPaise: 200000, allocatedAmountPaise: 200000 }],
  });

  // Verify PI-1 is PAID before reversal
  const pi1BeforeRev = (await getDoc(doc(db, 'purchaseInvoices', pi1.invoiceId))).data() as PurchaseInvoice;
  if (pi1BeforeRev.paymentStatus !== 'PAID') {
    throw new Error(`Precondition failed: PI-1 expected PAID, got ${pi1BeforeRev.paymentStatus}`);
  }

  // Reverse the fully allocated supplier payment
  await SupplierPaymentService.reverseSupplierPayment(superAdminSession, fullPay.payment.paymentId, {
    reason: 'Settlement cancelled due to credit adjustment',
  });

  // Fetch PI-1 after reversal
  const pi1AfterRev = (await getDoc(doc(db, 'purchaseInvoices', pi1.invoiceId))).data() as PurchaseInvoice;

  // Assert REV-12: Fully allocated supplier payment reversal restores purchase invoice balances
  assertTest(
    pi1AfterRev.paidAmountPaise === 0 && pi1AfterRev.outstandingAmountPaise === 200000,
    'REV-12',
    'Fully allocated supplier payment reversal restores purchase invoice balances',
    `PI-1 paidAmountPaise: ${pi1AfterRev.paidAmountPaise} (expected 0), outstanding: ${pi1AfterRev.outstandingAmountPaise} (expected 200,000)`
  );

  // Assert REV-13: Purchase invoice payment status returns to its correct pre-payment state
  assertTest(
    pi1AfterRev.paymentStatus === 'UNPAID',
    'REV-13',
    'Purchase invoice payment status returns to correct pre-payment state (UNPAID)',
    `PI-1 status restored to: ${pi1AfterRev.paymentStatus}`
  );

  // -------------------------------------------------------------------------
  // SECTION 5: Partially Allocated Payment Reversal (REV-21)
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 5: Partially Allocated Payment Reversal ---');

  // PI-2 has ₹3,000 outstanding (300,000 paise)
  // Create Payment of ₹2,500; Allocate ₹1,000 to PI-2 (partial allocation with ₹1,500 unallocated)
  const partialPay = await SupplierPaymentService.createSupplierPayment(superAdminSession, {
    supplierId: supplierAId,
    amountPaise: 250000,
    paymentMethod: 'UPI',
    cashBankAccountCode: '1200',
    referenceNumber: `PART-ALLOC-PAY-${testTimestamp}`,
  });
  await SupplierPaymentService.postSupplierPayment(superAdminSession, partialPay.payment.paymentId);

  await SupplierPaymentService.allocateSupplierPayment(superAdminSession, partialPay.payment.paymentId, {
    allocations: [{ invoiceId: pi2.invoiceId, amountPaise: 100000, allocatedAmountPaise: 100000 }],
  });

  const pi2BeforeRev = (await getDoc(doc(db, 'purchaseInvoices', pi2.invoiceId))).data() as PurchaseInvoice;
  if (pi2BeforeRev.paymentStatus !== 'PARTIALLY_PAID') {
    throw new Error(`Precondition failed: PI-2 expected PARTIALLY_PAID, got ${pi2BeforeRev.paymentStatus}`);
  }

  // Reverse partial payment
  await SupplierPaymentService.reverseSupplierPayment(superAdminSession, partialPay.payment.paymentId, {
    reason: 'UPI transaction chargeback / failure',
  });

  const pi2AfterRev = (await getDoc(doc(db, 'purchaseInvoices', pi2.invoiceId))).data() as PurchaseInvoice;

  // Assert REV-21: Partially allocated supplier payment reversal restores every affected invoice correctly
  assertTest(
    pi2AfterRev.paidAmountPaise === 0 &&
      pi2AfterRev.outstandingAmountPaise === 300000 &&
      pi2AfterRev.paymentStatus === 'UNPAID',
    'REV-21',
    'Partially allocated supplier payment reversal restores every affected invoice correctly',
    `PI-2 restored: paid=${pi2AfterRev.paidAmountPaise}, outstanding=${pi2AfterRev.outstandingAmountPaise}, status=${pi2AfterRev.paymentStatus}`
  );

  // -------------------------------------------------------------------------
  // SECTION 6: Multiple Invoices Allocated Atomically Reversal (REV-22)
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 6: Multiple Invoices Allocation Reversal ---');

  // Allocate across both PI-1 (₹1,000) and PI-2 (₹1,500) in single payment
  const multiPay = await SupplierPaymentService.createSupplierPayment(superAdminSession, {
    supplierId: supplierAId,
    amountPaise: 250000,
    paymentMethod: 'BANK_TRANSFER',
    cashBankAccountCode: '1200',
    referenceNumber: `MULTI-ALLOC-PAY-${testTimestamp}`,
  });
  await SupplierPaymentService.postSupplierPayment(superAdminSession, multiPay.payment.paymentId);

  await SupplierPaymentService.allocateSupplierPayment(superAdminSession, multiPay.payment.paymentId, {
    allocations: [
      { invoiceId: pi1.invoiceId, amountPaise: 100000, allocatedAmountPaise: 100000 },
      { invoiceId: pi2.invoiceId, amountPaise: 150000, allocatedAmountPaise: 150000 },
    ],
  });

  // Now reverse this multi-allocated payment
  await SupplierPaymentService.reverseSupplierPayment(superAdminSession, multiPay.payment.paymentId, {
    reason: 'Multi-allocation batch cancelled by accounts manager',
  });

  const pi1MultiRestored = (await getDoc(doc(db, 'purchaseInvoices', pi1.invoiceId))).data() as PurchaseInvoice;
  const pi2MultiRestored = (await getDoc(doc(db, 'purchaseInvoices', pi2.invoiceId))).data() as PurchaseInvoice;

  // Assert REV-22: Multiple-invoice allocation reversal restores all affected invoices atomically
  assertTest(
    pi1MultiRestored.paidAmountPaise === 0 &&
      pi1MultiRestored.outstandingAmountPaise === 200000 &&
      pi1MultiRestored.paymentStatus === 'UNPAID' &&
      pi2MultiRestored.paidAmountPaise === 0 &&
      pi2MultiRestored.outstandingAmountPaise === 300000 &&
      pi2MultiRestored.paymentStatus === 'UNPAID',
    'REV-22',
    'Multiple-invoice allocation reversal restores all affected invoices atomically',
    `PI-1: paid=${pi1MultiRestored.paidAmountPaise}, out=${pi1MultiRestored.outstandingAmountPaise} | PI-2: paid=${pi2MultiRestored.paidAmountPaise}, out=${pi2MultiRestored.outstandingAmountPaise}`
  );

  // -------------------------------------------------------------------------
  // SECTION 7: Balance Sheet & P&L Protection Verification (REV-06, 07, 08, 09, 10)
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 7: Revenue, GST, COGS, Inventory Protection Verification ---');

  const postGLRevenue = await GeneralLedgerService.getAccountLedger('4100');
  const postGLOutputGst = await GeneralLedgerService.getAccountLedger('2200');
  const postGLInputGst = await GeneralLedgerService.getAccountLedger('2300');
  const postGLCogs = await GeneralLedgerService.getAccountLedger('5100');
  const postGLInventory = await GeneralLedgerService.getAccountLedger('1400');

  assertTest(
    initialGLRevenue.closingBalance === postGLRevenue.closingBalance,
    'REV-06',
    'Revenue remains unchanged by supplier payment reversals',
    `Revenue 4100 before: ₹${initialGLRevenue.closingBalance}, after: ₹${postGLRevenue.closingBalance}`
  );

  assertTest(
    initialGLOutputGst.closingBalance === postGLOutputGst.closingBalance,
    'REV-07',
    'Output GST remains unchanged by supplier payment reversals',
    `Output GST 2200 before: ₹${initialGLOutputGst.closingBalance}, after: ₹${postGLOutputGst.closingBalance}`
  );

  assertTest(
    initialGLInputGst.closingBalance === postGLInputGst.closingBalance,
    'REV-08',
    'Input GST remains unchanged by supplier payment reversals',
    `Input GST 2300 before: ₹${initialGLInputGst.closingBalance}, after: ₹${postGLInputGst.closingBalance}`
  );

  assertTest(
    initialGLCogs.closingBalance === postGLCogs.closingBalance,
    'REV-09',
    'COGS remains unchanged by supplier payment reversals',
    `COGS 5100 before: ₹${initialGLCogs.closingBalance}, after: ₹${postGLCogs.closingBalance}`
  );

  assertTest(
    initialGLInventory.closingBalance === postGLInventory.closingBalance,
    'REV-10',
    'Inventory remains unchanged by supplier payment reversals',
    `Inventory 1400 before: ₹${initialGLInventory.closingBalance}, after: ₹${postGLInventory.closingBalance}`
  );

  // -------------------------------------------------------------------------
  // SECTION 8: Supplier AP Ledger Consistency & Reconciliation (REV-17, 25, 26, 27)
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 8: Supplier AP Ledger & Party Reconciliation ---');

  // Supplier A had two purchase invoices: PI-1 (₹2,000) + PI-2 (₹3,000) = ₹5,000 total liability
  // All payments were reversed. Therefore, closing payable balance must be exactly ₹5,000.00!
  const supplierLedger = await PartyLedgerService.getSupplierLedger({
    supplierId: supplierAId,
  });

  // Assert REV-17: Supplier AP ledger remains consistent
  assertTest(
    supplierLedger.success === true &&
      supplierLedger.closingBalance === 5000 &&
      supplierLedger.supplier.supplierId === supplierAId,
    'REV-17',
    'Supplier AP ledger remains consistent and restores exact pre-payment payable balance',
    `Supplier A Closing AP: ₹${supplierLedger.closingBalance} (expected ₹5,000.00), entries=${supplierLedger.entries.length}`
  );

  // Assert REV-25: Reversal journal supplier references do not produce UNRESOLVED_PARTY_REFERENCE
  assertTest(
    unresolvedWarnings.length === 0,
    'REV-25',
    'Reversal journal supplier references do not produce UNRESOLVED_PARTY_REFERENCE',
    `Unresolved party reference warnings count: ${unresolvedWarnings.length}`
  );

  // Assert REV-26: Canonical supplier resolution using existing supplier ledger architecture
  const canonicalResolved = await PartyLedgerService.resolveCanonicalSupplierId(supplierAId);
  assertTest(
    canonicalResolved === supplierAId,
    'REV-26',
    'Canonical supplier resolution using existing supplier ledger architecture',
    `Canonical supplier: ${canonicalResolved}`
  );

  // Assert REV-27: Concurrent duplicate reversal execution safety
  const concurrentPay = await SupplierPaymentService.createSupplierPayment(superAdminSession, {
    supplierId: supplierAId,
    amountPaise: 40000,
    paymentMethod: 'CASH',
    cashBankAccountCode: '1100',
  });
  await SupplierPaymentService.postSupplierPayment(superAdminSession, concurrentPay.payment.paymentId);

  const [callA, callB] = await Promise.allSettled([
    SupplierPaymentService.reverseSupplierPayment(superAdminSession, concurrentPay.payment.paymentId, {
      reason: 'Concurrent request A',
    }),
    SupplierPaymentService.reverseSupplierPayment(superAdminSession, concurrentPay.payment.paymentId, {
      reason: 'Concurrent request B',
    }),
  ]);

  const successCount = [callA, callB].filter((c) => c.status === 'fulfilled' && (c.value as any).success).length;
  const rejectedCount = [callA, callB].filter(
    (c) => c.status === 'rejected' && (c.reason?.message || '').includes('PAYMENT_ALREADY_REVERSED')
  ).length;

  assertTest(
    successCount === 1 && rejectedCount === 1,
    'REV-27',
    'Zero duplicate supplier payment reversal can occur under concurrent requests',
    `Concurrent results: 1 succeeded, 1 rejected cleanly with PAYMENT_ALREADY_REVERSED`
  );

  // Summary
  console.log('\n======================================================================');
  console.log('PHASE 5.8 PART 3 REVERSAL TEST SUITE SUMMARY');
  console.log('======================================================================');
  const total = testResults.length;
  const passed = testResults.filter((t) => t.passed).length;
  const failed = testResults.filter((t) => !t.passed && !t.blocked).length;
  const blocked = testResults.filter((t) => t.blocked).length;

  console.log(`Total Assertions: ${total}`);
  console.log(`Passed:           ${passed}`);
  console.log(`Failed:           ${failed}`);
  console.log(`Blocked:          ${blocked}\n`);

  if (failed > 0 || blocked > 0) {
    throw new Error(`PHASE 5.8 PART 3 TESTS FAILED: ${failed} failed, ${blocked} blocked.`);
  }

  console.log('✅ ALL PHASE 5.8 PART 3 TESTS PASSED SUCCESSFULLY');
}
