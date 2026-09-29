/**
 * MR FUTKAR — Phase 5.8 Part 1: Supplier Payment Foundation Test Suite
 * Production-grade server-authoritative supplier payment verification suite
 * Validates:
 * - SPF-01: Valid supplier payment creation as DRAFT
 * - SPF-02: Invalid amount rejected (float, non-integer)
 * - SPF-03: Zero amount rejected
 * - SPF-04: Negative amount rejected
 * - SPF-05: Unauthorized supplier payment creation rejected (SUPER_ADMIN required)
 * - SPF-06: Client field injection rejected (paymentId, status, journalId, createdBy, etc.)
 * - SPF-07: DRAFT payment does not create accounting journal
 * - SPF-08: POSTED payment creates exactly one journal
 * - SPF-09: Cash payment creates AP DR (2100) / Cash CR (1100)
 * - SPF-10: Bank/UPI payment creates AP DR (2100) / Bank CR (1200)
 * - SPF-11: Accounting journal is perfectly balanced (Debit === Credit)
 * - SPF-12: Duplicate posting is idempotent and does not create duplicate journals
 * - SPF-13: Supplier identity is canonical and snapshot is server-authoritative
 * - SPF-14: Revenue (4100) unchanged
 * - SPF-15: Output GST (2200) & Input GST (2300) unchanged
 * - SPF-16: COGS (5100) unchanged
 * - SPF-17: Inventory (1400) unchanged
 * - SPF-18: Supplier AP ledger reflects the payment and reduces payable balance
 * - SPF-19: Accounting-period rules are enforced (closed period rejected)
 * - SPF-20: Audit logs are immutably created for creation and posting
 * - SPF-21: Direct client write without server authority token rejected by Firestore rules
 * - SPF-22: Direct client deletion denied by Firestore rules
 */

import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN, OPERATIONAL_WAREHOUSE_ID } from '../server/firebaseAdmin';
import cfg from '../firebase-applet-config.json';
import { SeedService } from '../server/seedService';
import { ensureSystemAccounts } from '../server/accountingSeedService';
import { ensureDefaultAccountingPeriod } from '../server/accountingPeriodService';
import { ensureInitialSuperAdmin } from '../server/adminAuth';
import { SupplierPaymentService } from '../server/supplierPaymentService';
import { InvoiceService } from '../server/invoiceService';
import { PartyLedgerService } from '../server/partyLedgerService';
import { AdminSession } from '../src/types/admin';
import { SupplierPayment } from '../src/types/supplierPayment';
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

export async function runSupplierPaymentFoundationTestSuite() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 5.8 PART 1: SUPPLIER PAYMENT FOUNDATION');
  console.log('Timestamp:', new Date().toISOString());
  console.log('======================================================================\n');

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
    name: 'Warehouse Operator',
    mobile: '+919810055555',
    role: 'STAFF' as any,
    status: 'ACTIVE',
    permissionsVersion: 1,
  };

  const testTimestamp = Date.now();
  const testSupplierId = `sup_fmcg_${testTimestamp}`;

  // 1. Provision Test Supplier in Master
  await setDoc(doc(db, 'suppliers', testSupplierId), {
    supplierId: testSupplierId,
    businessName: 'Tata Consumer Products Ltd North Delhi Depot',
    contactName: 'Rajesh Verma',
    mobile: '9811199333',
    fullAddress: 'Plot 12, Patparganj Industrial Area',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110092',
    gstin: '07AAACT1234D1Z5',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    _serverTxnToken: SERVER_TXN_TOKEN,
  });

  // 2. Issue a Purchase Invoice for this Supplier so AP ledger has an opening payable (e.g. ₹5,000)
  const purchaseInvoice = await InvoiceService.createPurchaseInvoice(superAdminSession, {
    supplierId: testSupplierId,
    supplierType: 'DISTRIBUTOR',
    supplierInvoiceNumber: `INV-TATA-${testTimestamp}`,
    invoiceDate: '2026-09-01',
    billingAddressSnapshot: {
      businessName: 'Tata Consumer Products Ltd North Delhi Depot',
      contactName: 'Rajesh Verma',
      mobile: '9811199333',
      fullAddress: 'Plot 12, Patparganj Industrial Area',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110092',
      gstin: '07AAACT1234D1Z5',
    },
    items: [
      {
        productId: 'prod-001',
        quantity: 10,
        unitCost: 500, // ₹5,000 total (500,000 paise)
        taxRate: 0,
      },
    ],
  });
  await InvoiceService.postPurchaseInvoice(superAdminSession, purchaseInvoice.invoiceId);

  // Check baseline GL balances before supplier payments
  const fetchGLBalance = async (accCode: string): Promise<number> => {
    const accSnap = await getDoc(doc(db, 'chartOfAccounts', `acc_${accCode}`));
    if (!accSnap.exists()) return 0;
    const linesSnap = await getDocs(
      query(collection(db, 'journalEntryLines'), where('accountId', '==', `acc_${accCode}`))
    );
    let balPaise = 0;
    linesSnap.forEach((d) => {
      const line = d.data() as JournalEntryLine;
      balPaise += Math.round((line.debit || 0) * 100) - Math.round((line.credit || 0) * 100);
    });
    return balPaise;
  };

  const revenueBefore = await fetchGLBalance('4100');
  const outputGstBefore = await fetchGLBalance('2200');
  const inputGstBefore = await fetchGLBalance('2300');
  const cogsBefore = await fetchGLBalance('5100');
  const inventoryBefore = await fetchGLBalance('1400');

  // -------------------------------------------------------------------------
  // TEST SPF-05: Unauthorized supplier payment creation rejected
  // -------------------------------------------------------------------------
  try {
    await SupplierPaymentService.createSupplierPayment(staffAdminSession, {
      supplierId: testSupplierId,
      amountPaise: 100000,
      paymentMethod: 'CASH',
    });
    assertTest(false, 'SPF-05', 'Unauthorized supplier payment creation rejected', 'Expected error for non-SUPER_ADMIN.');
  } catch (err: any) {
    assertTest(
      err.message.includes('SUPER_ADMIN_REQUIRED'),
      'SPF-05',
      'Unauthorized supplier payment creation rejected',
      `Correctly rejected non-SUPER_ADMIN: ${err.message}`
    );
  }

  // -------------------------------------------------------------------------
  // TEST SPF-02, SPF-03, SPF-04: Invalid, zero, and negative amounts rejected
  // -------------------------------------------------------------------------
  try {
    await SupplierPaymentService.createSupplierPayment(superAdminSession, {
      supplierId: testSupplierId,
      amountPaise: 100.5 as any, // float
      paymentMethod: 'CASH',
    });
    assertTest(false, 'SPF-02', 'Invalid amount rejected', 'Expected error for float amount.');
  } catch (err: any) {
    assertTest(
      err.message.includes('INVALID_AMOUNT'),
      'SPF-02',
      'Invalid amount rejected',
      `Correctly rejected float: ${err.message}`
    );
  }

  try {
    await SupplierPaymentService.createSupplierPayment(superAdminSession, {
      supplierId: testSupplierId,
      amountPaise: 0,
      paymentMethod: 'CASH',
    });
    assertTest(false, 'SPF-03', 'Zero amount rejected', 'Expected error for 0 amount.');
  } catch (err: any) {
    assertTest(
      err.message.includes('INVALID_AMOUNT'),
      'SPF-03',
      'Zero amount rejected',
      `Correctly rejected 0: ${err.message}`
    );
  }

  try {
    await SupplierPaymentService.createSupplierPayment(superAdminSession, {
      supplierId: testSupplierId,
      amountPaise: -50000,
      paymentMethod: 'CASH',
    });
    assertTest(false, 'SPF-04', 'Negative amount rejected', 'Expected error for negative amount.');
  } catch (err: any) {
    assertTest(
      err.message.includes('INVALID_AMOUNT'),
      'SPF-04',
      'Negative amount rejected',
      `Correctly rejected negative: ${err.message}`
    );
  }

  // -------------------------------------------------------------------------
  // TEST SPF-06: Client field injection rejected
  // -------------------------------------------------------------------------
  try {
    await SupplierPaymentService.createSupplierPayment(superAdminSession, {
      supplierId: testSupplierId,
      amountPaise: 100000,
      paymentMethod: 'CASH',
      status: 'POSTED', // Injected!
    } as any);
    assertTest(false, 'SPF-06', 'Client field injection rejected', 'Expected error for injected status.');
  } catch (err: any) {
    assertTest(
      err.message.includes('CLIENT_FIELD_INJECTION_FORBIDDEN'),
      'SPF-06',
      'Client field injection rejected',
      `Correctly rejected injected status: ${err.message}`
    );
  }

  // -------------------------------------------------------------------------
  // TEST SPF-01: Valid supplier payment creation as DRAFT
  // -------------------------------------------------------------------------
  const draftPaymentRes = await SupplierPaymentService.createSupplierPayment(superAdminSession, {
    supplierId: testSupplierId,
    amountPaise: 100000, // ₹1,000.00
    paymentMethod: 'CASH',
    cashBankAccountCode: '1100',
    referenceNumber: 'CASH-VOUCHER-01',
    notes: 'Advance cash payment for tea supplies',
  });
  const draftPayment = draftPaymentRes.payment;

  assertTest(
    draftPayment.status === 'DRAFT' &&
      draftPayment.accountingStatus === 'PENDING' &&
      draftPayment.journalId === null &&
      draftPayment.voucherNumber === null &&
      draftPayment.amountPaise === 100000 &&
      draftPayment.paymentMethod === 'CASH' &&
      draftPayment.cashBankAccountCode === '1100' &&
      draftPayment.paymentNumber.startsWith('SP-') &&
      draftPayment.supplierId === testSupplierId,
    'SPF-01',
    'Valid supplier payment creation as DRAFT',
    `Created draft payment ${draftPayment.paymentNumber} (${draftPayment.paymentId}) for supplier ${draftPayment.supplierId}, amount=₹${draftPayment.amountPaise / 100}`
  );

  // -------------------------------------------------------------------------
  // TEST SPF-07: DRAFT payment does not create accounting journal
  // -------------------------------------------------------------------------
  const draftJournalsQuery = query(
    collection(db, 'journalEntries'),
    where('referenceType', '==', 'SUPPLIER_PAYMENT'),
    where('referenceId', '==', draftPayment.paymentId)
  );
  const draftJournalsSnap = await getDocs(draftJournalsQuery);

  assertTest(
    draftJournalsSnap.empty === true && draftPayment.journalId === null,
    'SPF-07',
    'DRAFT payment does not create accounting journal',
    `Verified zero journals exist for draft payment ${draftPayment.paymentId}.`
  );

  // -------------------------------------------------------------------------
  // TEST SPF-08 & SPF-09: Cash payment posting creates AP DR (2100) / Cash CR (1100)
  // -------------------------------------------------------------------------
  const postedCashPaymentRes = await SupplierPaymentService.postSupplierPayment(
    superAdminSession,
    draftPayment.paymentId
  );
  const postedCashPayment = postedCashPaymentRes.payment;
  const cashJournal = postedCashPaymentRes.journal;

  // Fetch journal lines
  const cashJournalLinesSnap = await getDocs(
    query(collection(db, 'journalEntryLines'), where('journalId', '==', cashJournal.journalId))
  );
  const cashLines: JournalEntryLine[] = [];
  cashJournalLinesSnap.forEach((d) => cashLines.push(d.data() as JournalEntryLine));

  const apLine = cashLines.find((l) => l.accountId === 'acc_2100');
  const cashLine = cashLines.find((l) => l.accountId === 'acc_1100');

  assertTest(
    postedCashPayment.status === 'POSTED' &&
      postedCashPayment.accountingStatus === 'POSTED' &&
      postedCashPayment.journalId === cashJournal.journalId &&
      postedCashPayment.voucherNumber === cashJournal.journalNumber &&
      cashJournal.status === 'POSTED' &&
      cashLines.length === 2,
    'SPF-08',
    'POSTED payment creates exactly one journal',
    `Payment ${postedCashPayment.paymentNumber} posted with journal ${cashJournal.journalNumber} (${cashJournal.journalId}).`
  );

  assertTest(
    Boolean(
      apLine &&
        cashLine &&
        apLine.debit === 1000 &&
        apLine.credit === 0 &&
        cashLine.debit === 0 &&
        cashLine.credit === 1000 &&
        apLine.supplierId === testSupplierId
    ),
    'SPF-09',
    'Cash payment creates AP DR (2100) / Cash CR (1100)',
    `AP 2100 Debit: ₹${apLine?.debit}, Cash 1100 Credit: ₹${cashLine?.credit}, SupplierId: ${apLine?.supplierId}`
  );

  // -------------------------------------------------------------------------
  // TEST SPF-10: Bank/UPI payment creates AP DR (2100) / Bank CR (1200)
  // -------------------------------------------------------------------------
  const bankDraftRes = await SupplierPaymentService.createSupplierPayment(superAdminSession, {
    supplierId: testSupplierId,
    amountPaise: 200000, // ₹2,000.00
    paymentMethod: 'UPI',
    cashBankAccountCode: '1200',
    referenceNumber: 'UPI-TXN-998877',
    notes: 'Depot invoice payment via UPI',
  });
  const bankDraft = bankDraftRes.payment;

  const postedBankPaymentRes = await SupplierPaymentService.postSupplierPayment(
    superAdminSession,
    bankDraft.paymentId
  );
  const postedBankPayment = postedBankPaymentRes.payment;
  const bankJournal = postedBankPaymentRes.journal;

  const bankJournalLinesSnap = await getDocs(
    query(collection(db, 'journalEntryLines'), where('journalId', '==', bankJournal.journalId))
  );
  const bankLines: JournalEntryLine[] = [];
  bankJournalLinesSnap.forEach((d) => bankLines.push(d.data() as JournalEntryLine));

  const bankApLine = bankLines.find((l) => l.accountId === 'acc_2100');
  const bankAccountLine = bankLines.find((l) => l.accountId === 'acc_1200');

  assertTest(
    Boolean(
      bankApLine &&
        bankAccountLine &&
        bankApLine.debit === 2000 &&
        bankApLine.credit === 0 &&
        bankAccountLine.debit === 0 &&
        bankAccountLine.credit === 2000 &&
        bankApLine.supplierId === testSupplierId
    ),
    'SPF-10',
    'Bank/UPI payment creates AP DR (2100) / Bank CR (1200)',
    `AP 2100 Debit: ₹${bankApLine?.debit}, Bank 1200 Credit: ₹${bankAccountLine?.credit}, SupplierId: ${bankApLine?.supplierId}`
  );

  // -------------------------------------------------------------------------
  // TEST SPF-11: Accounting journal is perfectly balanced
  // -------------------------------------------------------------------------
  const cashDebitPaise = cashLines.reduce((s, l) => s + Math.round((l.debit || 0) * 100), 0);
  const cashCreditPaise = cashLines.reduce((s, l) => s + Math.round((l.credit || 0) * 100), 0);
  const bankDebitPaise = bankLines.reduce((s, l) => s + Math.round((l.debit || 0) * 100), 0);
  const bankCreditPaise = bankLines.reduce((s, l) => s + Math.round((l.credit || 0) * 100), 0);

  assertTest(
    cashDebitPaise === cashCreditPaise &&
      cashDebitPaise === 100000 &&
      bankDebitPaise === bankCreditPaise &&
      bankDebitPaise === 200000,
    'SPF-11',
    'Accounting journal is perfectly balanced (Debit === Credit)',
    `Cash Journal: Dr ₹${cashDebitPaise / 100} === Cr ₹${cashCreditPaise / 100} | Bank Journal: Dr ₹${bankDebitPaise / 100} === Cr ₹${bankCreditPaise / 100}`
  );

  // -------------------------------------------------------------------------
  // TEST SPF-12: Duplicate posting is idempotent
  // -------------------------------------------------------------------------
  const duplicatePostRes = await SupplierPaymentService.postSupplierPayment(
    superAdminSession,
    draftPayment.paymentId
  );

  const totalJournalsForCashQuery = query(
    collection(db, 'journalEntries'),
    where('referenceType', '==', 'SUPPLIER_PAYMENT'),
    where('referenceId', '==', draftPayment.paymentId)
  );
  const totalJournalsSnap = await getDocs(totalJournalsForCashQuery);

  assertTest(
    duplicatePostRes.isIdempotentReplay === true &&
      duplicatePostRes.payment.journalId === cashJournal.journalId &&
      totalJournalsSnap.size === 1,
    'SPF-12',
    'Duplicate posting is idempotent and does not create duplicate journals',
    `Idempotent replay verified with journalId: ${duplicatePostRes.payment.journalId}, total journals count: ${totalJournalsSnap.size}`
  );

  // -------------------------------------------------------------------------
  // TEST SPF-13: Supplier identity is canonical and snapshot is server-authoritative
  // -------------------------------------------------------------------------
  assertTest(
    postedCashPayment.supplierSnapshot.supplierId === testSupplierId &&
      postedCashPayment.supplierSnapshot.businessName.includes('Tata Consumer') &&
      postedCashPayment.supplierSnapshot.city === 'Delhi' &&
      postedCashPayment.supplierSnapshot.state === 'Delhi',
    'SPF-13',
    'Supplier identity is canonical and snapshot is server-authoritative',
    `Supplier snapshot authoritative: Business="${postedCashPayment.supplierSnapshot.businessName}", GSTIN=${postedCashPayment.supplierSnapshot.gstin}`
  );

  // -------------------------------------------------------------------------
  // TEST SPF-14: Revenue (4100) unchanged
  // -------------------------------------------------------------------------
  const revenueAfter = await fetchGLBalance('4100');
  assertTest(
    revenueBefore === revenueAfter,
    'SPF-14',
    'Revenue (4100) unchanged',
    `Revenue before: ₹${revenueBefore / 100}, after: ₹${revenueAfter / 100}`
  );

  // -------------------------------------------------------------------------
  // TEST SPF-15: Output GST (2200) & Input GST (2300) unchanged
  // -------------------------------------------------------------------------
  const outputGstAfter = await fetchGLBalance('2200');
  const inputGstAfter = await fetchGLBalance('2300');
  assertTest(
    outputGstBefore === outputGstAfter && inputGstBefore === inputGstAfter,
    'SPF-15',
    'Output GST (2200) & Input GST (2300) unchanged',
    `Output GST: ₹${outputGstBefore / 100} -> ₹${outputGstAfter / 100} | Input GST: ₹${inputGstBefore / 100} -> ₹${inputGstAfter / 100}`
  );

  // -------------------------------------------------------------------------
  // TEST SPF-16: COGS (5100) unchanged
  // -------------------------------------------------------------------------
  const cogsAfter = await fetchGLBalance('5100');
  assertTest(
    cogsBefore === cogsAfter,
    'SPF-16',
    'COGS (5100) unchanged',
    `COGS before: ₹${cogsBefore / 100}, after: ₹${cogsAfter / 100}`
  );

  // -------------------------------------------------------------------------
  // TEST SPF-17: Inventory (1400) unchanged
  // -------------------------------------------------------------------------
  const inventoryAfter = await fetchGLBalance('1400');
  assertTest(
    inventoryBefore === inventoryAfter,
    'SPF-17',
    'Inventory (1400) unchanged',
    `Inventory before: ₹${inventoryBefore / 100}, after: ₹${inventoryAfter / 100}`
  );

  // -------------------------------------------------------------------------
  // TEST SPF-18: Supplier AP ledger reflects the payment and reduces payable balance
  // -------------------------------------------------------------------------
  // Initial purchase invoice: Credit ₹5,000 (Payable)
  // Payments: Cash ₹1,000 (Debit) + UPI ₹2,000 (Debit) = Total Debit ₹3,000
  // Net closing payable balance: ₹5,000 - ₹3,000 = ₹2,000 (Credit)
  const supplierLedger = await PartyLedgerService.getSupplierLedger({ supplierId: testSupplierId });

  const paymentEntries = supplierLedger.entries.filter((e) => e.documentType === 'SUPPLIER_PAYMENT');
  const totalDebitFromPayments = paymentEntries.reduce((s, e) => s + e.debit, 0);

  assertTest(
    supplierLedger.success === true &&
      paymentEntries.length === 2 &&
      totalDebitFromPayments === 3000 &&
      supplierLedger.closingBalance === 2000,
    'SPF-18',
    'Supplier AP ledger reflects the payment and reduces payable balance',
    `Supplier Ledger: TotalDebitsFromPayments=₹${totalDebitFromPayments}, ClosingBalance=₹${supplierLedger.closingBalance} (Expected: ₹2,000), TotalEntries=${supplierLedger.entries.length}`
  );

  // -------------------------------------------------------------------------
  // TEST SPF-19: Accounting-period rules are enforced
  // -------------------------------------------------------------------------
  try {
    await SupplierPaymentService.createSupplierPayment(superAdminSession, {
      supplierId: testSupplierId,
      amountPaise: 50000,
      paymentMethod: 'CASH',
      paymentDate: '2025-01-01', // Out of bounds or closed
    });
    assertTest(false, 'SPF-19', 'Accounting-period rules are enforced', 'Expected error for date outside open period.');
  } catch (err: any) {
    assertTest(
      err.message.includes('ACCOUNTING_PERIOD_CLOSED') || err.message.includes('PERIOD'),
      'SPF-19',
      'Accounting-period rules are enforced',
      `Correctly rejected closed period: ${err.message}`
    );
  }

  // -------------------------------------------------------------------------
  // TEST SPF-20: Audit logs are immutably created for creation and posting
  // -------------------------------------------------------------------------
  const auditLogsSnap = await getDocs(
    query(collection(db, 'adminAuditLogs'), where('targetType', '==', 'SUPPLIER_PAYMENT'))
  );
  let foundCreationAudit = false;
  let foundPostingAudit = false;

  auditLogsSnap.forEach((d) => {
    const data = d.data();
    if (data.action === 'SUPPLIER_PAYMENT_CREATED' && data.targetId === draftPayment.paymentId) {
      foundCreationAudit = true;
    }
    if (data.action === 'SUPPLIER_PAYMENT_POSTED' && data.targetId === draftPayment.paymentId) {
      foundPostingAudit = true;
    }
  });

  assertTest(
    foundCreationAudit && foundPostingAudit,
    'SPF-20',
    'Audit logs are immutably created for creation and posting',
    `Audit trail confirmed: CreatedAudit=${foundCreationAudit}, PostedAudit=${foundPostingAudit}`
  );

  // -------------------------------------------------------------------------
  // TEST SPF-21: Direct client write without server authority token rejected by Firestore rules
  // -------------------------------------------------------------------------
  let clientWriteBlocked = false;
  try {
    await setDoc(doc(db, 'supplierPayments', 'sp_malicious_unauth_write'), {
      paymentId: 'sp_malicious_unauth_write',
      paymentNumber: 'SP-FAKE-001',
      supplierId: testSupplierId,
      amountPaise: 999999,
      status: 'POSTED',
      // No _serverTxnToken!
    });
  } catch (err: any) {
    if (err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permissions')) {
      clientWriteBlocked = true;
    }
  }

  assertTest(
    clientWriteBlocked,
    'SPF-21',
    'Direct client write without server authority token rejected by Firestore rules',
    'Firestore security rules blocked direct client creation without server txn authority.'
  );

  // -------------------------------------------------------------------------
  // TEST SPF-22: Direct client deletion denied by Firestore rules
  // -------------------------------------------------------------------------
  let clientDeleteBlocked = false;
  try {
    await deleteDoc(doc(db, 'supplierPayments', draftPayment.paymentId));
  } catch (err: any) {
    if (err?.code === 'permission-denied' || String(err?.message || '').toLowerCase().includes('permissions')) {
      clientDeleteBlocked = true;
    }
  }

  assertTest(
    clientDeleteBlocked,
    'SPF-22',
    'Direct client deletion denied by Firestore rules',
    'Firestore security rules blocked client deletion of supplier payment record.'
  );

  // Summary
  console.log('\n======================================================================');
  console.log('PHASE 5.8 PART 1 TEST SUITE SUMMARY');
  console.log('======================================================================');
  const total = testResults.length;
  const passed = testResults.filter((t) => t.passed).length;
  const failed = testResults.filter((t) => !t.passed && !t.blocked).length;
  const blocked = testResults.filter((t) => t.blocked).length;

  console.log(`Total Assertions: ${total}`);
  console.log(`Passed:           ${passed}`);
  console.log(`Failed:           ${failed}`);
  console.log(`Blocked:          ${blocked}`);

  if (failed > 0 || blocked > 0) {
    console.error('❌ SOME TESTS FAILED OR WERE BLOCKED');
    process.exit(1);
  } else {
    console.log('✅ ALL PHASE 5.8 PART 1 TESTS PASSED SUCCESSFULLY');
  }

  return { total, passed, failed, blocked };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSupplierPaymentFoundationTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}
