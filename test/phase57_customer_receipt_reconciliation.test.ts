/**
 * MR FUTKAR — Phase 5.7 Part 2E: Customer Receipt Reconciliation & Reporting Test Suite
 * Production-grade server-authoritative reconciliation verification suite
 * Validates:
 * - REC-01: Valid unallocated receipt reconciles cleanly
 * - REC-02: Valid fully allocated receipt reconciles cleanly
 * - REC-03: Valid partially allocated receipt reconciles cleanly
 * - REC-04: Valid reversed receipt reconciles cleanly
 * - REC-05: Allocation total mismatch is detected (RECEIPT_ALLOCATION_MISMATCH)
 * - REC-06: Invoice paid/outstanding mismatch is detected (INCORRECT_INVOICE_BALANCE)
 * - REC-07: Cross-retailer allocation is detected (CROSS_RETAILER_ALLOCATION)
 * - REC-08: Orphan allocation is detected (ORPHAN_ALLOCATION)
 * - REC-09: Missing original journal is detected (MISSING_ORIGINAL_JOURNAL)
 * - REC-10: Missing reversal journal is detected (MISSING_REVERSAL_JOURNAL)
 * - REC-11: Incorrect reversal linkage is detected (INCORRECT_REVERSAL_LINKAGE)
 * - REC-12: Unresolved canonical retailer reference is detected (UNRESOLVED_RETAILER_REFERENCE)
 * - REC-13: Balanced journal passes reconciliation cleanly
 * - REC-14: Imbalanced journal is detected (ACCOUNTING_JOURNAL_IMBALANCE)
 * - REC-15: Unauthorized reconciliation request is rejected (SUPER_ADMIN required)
 * - REC-16: Reconciliation performs zero accounting mutations (Read-only guarantee)
 * - REC-17: Duplicate allocation record is detected (DUPLICATE_ALLOCATION_RECORD)
 * - REC-18: Allocation exceeding receipt amount is detected (ALLOCATION_EXCEEDS_RECEIPT_AMOUNT)
 * - REC-19: Reversal amount mismatch is detected (REVERSED_AMOUNT_MISMATCH)
 * - REC-20: Summary metrics and report totals are computed accurately
 */

import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN, OPERATIONAL_WAREHOUSE_ID } from '../server/firebaseAdmin';
import cfg from '../firebase-applet-config.json';
import { SeedService } from '../server/seedService';
import { ensureSystemAccounts } from '../server/accountingSeedService';
import { ensureDefaultAccountingPeriod } from '../server/accountingPeriodService';
import { ensureInitialSuperAdmin } from '../server/adminAuth';
import { CustomerReceiptService } from '../server/customerReceiptService';
import { InvoiceService } from '../server/invoiceService';
import { AdminSession } from '../src/types/admin';
import { CustomerReceipt } from '../src/types/customerReceipt';
import { SalesInvoice } from '../src/types/invoice';
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

export async function runCustomerReceiptReconciliationTestSuite() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 5.7 PART 2E: CUSTOMER RECEIPT RECONCILIATION & REPORTING');
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
  const retailerAId = `ret_rec_a_${testTimestamp}`;
  const retailerBId = `ret_rec_b_${testTimestamp}`;

  // 1. Provision Test Retailers in Master
  await setDoc(doc(db, 'retailers', retailerAId), {
    retailerId: retailerAId,
    shopName: 'Aggarwal Kirana Store Recon',
    ownerName: 'Vikas Aggarwal',
    mobileNumber: '9811199111',
    shopAddress: 'B-10, Main Market, Brahmpuri',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110053',
    status: 'ACTIVE',
    isActive: true,
    isProfileComplete: true,
    createdAt: new Date().toISOString(),
    _serverTxnToken: SERVER_TXN_TOKEN,
  });

  await setDoc(doc(db, 'retailers', retailerBId), {
    retailerId: retailerBId,
    shopName: 'Sharma General Store Recon',
    ownerName: 'Sunil Sharma',
    mobileNumber: '9811199222',
    shopAddress: 'C-22, Brahmpuri, Delhi',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110053',
    status: 'ACTIVE',
    isActive: true,
    isProfileComplete: true,
    createdAt: new Date().toISOString(),
    _serverTxnToken: SERVER_TXN_TOKEN,
  });

  // 2. Provision Sales Invoices for Retailer A
  // Invoice 1: ₹1,000.00 (100,000 paise)
  const invoiceA1 = await InvoiceService.createSalesInvoice(superAdminSession, {
    customerId: retailerAId,
    invoiceDate: '2026-09-01',
    items: [
      {
        productId: 'prod-001',
        quantity: 2,
        unitPrice: 500,
        taxRate: 0,
      },
    ],
  });
  await InvoiceService.issueSalesInvoice(superAdminSession, invoiceA1.invoiceId);

  // Invoice 2: ₹500.00 (50,000 paise)
  const invoiceA2 = await InvoiceService.createSalesInvoice(superAdminSession, {
    customerId: retailerAId,
    invoiceDate: '2026-09-02',
    items: [
      {
        productId: 'prod-002',
        quantity: 1,
        unitPrice: 500,
        taxRate: 0,
      },
    ],
  });
  await InvoiceService.issueSalesInvoice(superAdminSession, invoiceA2.invoiceId);

  // -------------------------------------------------------------------------
  // TEST REC-15: Unauthorized reconciliation request is rejected
  // -------------------------------------------------------------------------
  try {
    await CustomerReceiptService.reconcileCustomerReceipts(staffAdminSession);
    assertTest(false, 'REC-15', 'Unauthorized reconciliation request is rejected', 'Expected error for non-SUPER_ADMIN.');
  } catch (err: any) {
    assertTest(
      err.message.includes('SUPER_ADMIN_REQUIRED'),
      'REC-15',
      'Unauthorized reconciliation request is rejected',
      `Correctly rejected non-SUPER_ADMIN: ${err.message}`
    );
  }

  // -------------------------------------------------------------------------
  // TEST REC-01: Valid unallocated receipt reconciles cleanly
  // -------------------------------------------------------------------------
  const unallocReceiptDraft = await CustomerReceiptService.createCustomerReceipt(superAdminSession, {
    customerId: retailerAId,
    amountPaise: 40000,
    paymentMethod: 'CASH',
    cashBankAccountCode: '1100',
    referenceNumber: 'CASH-UNALLOC-01',
  });
  const unallocReceiptPosted = await CustomerReceiptService.postCustomerReceipt(
    superAdminSession,
    unallocReceiptDraft.receipt.receiptId
  );

  const reconUnalloc = await CustomerReceiptService.reconcileCustomerReceipts(superAdminSession, {
    receiptId: unallocReceiptPosted.receipt.receiptId,
  });

  assertTest(
    reconUnalloc.success === true &&
      reconUnalloc.summary.totalReceiptsChecked === 1 &&
      reconUnalloc.summary.totalActiveReceiptAmountPaise === 40000 &&
      reconUnalloc.summary.totalUnallocatedAmountPaise === 40000 &&
      reconUnalloc.summary.totalAllocatedAmountPaise === 0 &&
      reconUnalloc.summary.isFullyReconciled === true &&
      reconUnalloc.inconsistencies.length === 0,
    'REC-01',
    'Valid unallocated receipt reconciles cleanly',
    `Unallocated receipt verified: Active=₹${reconUnalloc.summary.totalActiveReceiptAmount}, Unallocated=₹${reconUnalloc.summary.totalUnallocatedAmount}, Inconsistencies=${reconUnalloc.inconsistencies.length}`
  );

  // -------------------------------------------------------------------------
  // TEST REC-02: Valid fully allocated receipt reconciles cleanly
  // -------------------------------------------------------------------------
  const fullReceiptDraft = await CustomerReceiptService.createCustomerReceipt(superAdminSession, {
    customerId: retailerAId,
    amountPaise: 100000,
    paymentMethod: 'UPI',
    cashBankAccountCode: '1200',
    referenceNumber: 'UPI-FULL-01',
  });
  const fullReceiptPosted = await CustomerReceiptService.postCustomerReceipt(
    superAdminSession,
    fullReceiptDraft.receipt.receiptId
  );
  await CustomerReceiptService.allocateCustomerReceipt(
    superAdminSession,
    fullReceiptPosted.receipt.receiptId,
    {
      allocations: [{ invoiceId: invoiceA1.invoiceId, amountPaise: 100000 }],
    }
  );

  const reconFull = await CustomerReceiptService.reconcileCustomerReceipts(superAdminSession, {
    receiptId: fullReceiptPosted.receipt.receiptId,
  });

  assertTest(
    reconFull.success === true &&
      reconFull.summary.totalReceiptsChecked === 1 &&
      reconFull.summary.totalActiveReceiptAmountPaise === 100000 &&
      reconFull.summary.totalAllocatedAmountPaise === 100000 &&
      reconFull.summary.totalUnallocatedAmountPaise === 0 &&
      reconFull.summary.isFullyReconciled === true &&
      reconFull.inconsistencies.length === 0,
    'REC-02',
    'Valid fully allocated receipt reconciles cleanly',
    `Fully allocated receipt verified: Active=₹${reconFull.summary.totalActiveReceiptAmount}, Allocated=₹${reconFull.summary.totalAllocatedAmount}, Inconsistencies=${reconFull.inconsistencies.length}`
  );

  // -------------------------------------------------------------------------
  // TEST REC-03: Valid partially allocated receipt reconciles cleanly
  // -------------------------------------------------------------------------
  const partialReceiptDraft = await CustomerReceiptService.createCustomerReceipt(superAdminSession, {
    customerId: retailerAId,
    amountPaise: 50000,
    paymentMethod: 'UPI',
    cashBankAccountCode: '1200',
    referenceNumber: 'UPI-PART-01',
  });
  const partialReceiptPosted = await CustomerReceiptService.postCustomerReceipt(
    superAdminSession,
    partialReceiptDraft.receipt.receiptId
  );
  await CustomerReceiptService.allocateCustomerReceipt(
    superAdminSession,
    partialReceiptPosted.receipt.receiptId,
    {
      allocations: [{ invoiceId: invoiceA2.invoiceId, amountPaise: 20000 }],
    }
  );

  const reconPartial = await CustomerReceiptService.reconcileCustomerReceipts(superAdminSession, {
    receiptId: partialReceiptPosted.receipt.receiptId,
  });

  assertTest(
    reconPartial.success === true &&
      reconPartial.summary.totalReceiptsChecked === 1 &&
      reconPartial.summary.totalActiveReceiptAmountPaise === 50000 &&
      reconPartial.summary.totalAllocatedAmountPaise === 20000 &&
      reconPartial.summary.totalUnallocatedAmountPaise === 30000 &&
      reconPartial.summary.isFullyReconciled === true &&
      reconPartial.inconsistencies.length === 0,
    'REC-03',
    'Valid partially allocated receipt reconciles cleanly',
    `Partially allocated receipt verified: Active=₹${reconPartial.summary.totalActiveReceiptAmount}, Allocated=₹${reconPartial.summary.totalAllocatedAmount}, Unallocated=₹${reconPartial.summary.totalUnallocatedAmount}`
  );

  // -------------------------------------------------------------------------
  // TEST REC-04: Valid reversed receipt reconciles cleanly
  // -------------------------------------------------------------------------
  const revReceiptDraft = await CustomerReceiptService.createCustomerReceipt(superAdminSession, {
    customerId: retailerAId,
    amountPaise: 30000,
    paymentMethod: 'CASH',
    cashBankAccountCode: '1100',
    referenceNumber: 'CASH-REV-01',
  });
  const revReceiptPosted = await CustomerReceiptService.postCustomerReceipt(
    superAdminSession,
    revReceiptDraft.receipt.receiptId
  );
  await CustomerReceiptService.reverseCustomerReceipt(
    superAdminSession,
    revReceiptPosted.receipt.receiptId,
    { reason: 'Customer cancellation' }
  );

  const reconReversed = await CustomerReceiptService.reconcileCustomerReceipts(superAdminSession, {
    receiptId: revReceiptPosted.receipt.receiptId,
  });

  assertTest(
    reconReversed.success === true &&
      reconReversed.summary.totalReceiptsChecked === 1 &&
      reconReversed.summary.totalActiveReceiptAmountPaise === 0 &&
      reconReversed.summary.totalReversedAmountPaise === 30000 &&
      reconReversed.summary.isFullyReconciled === true &&
      reconReversed.inconsistencies.length === 0,
    'REC-04',
    'Valid reversed receipt reconciles cleanly',
    `Reversed receipt verified: Active=₹${reconReversed.summary.totalActiveReceiptAmount}, Reversed=₹${reconReversed.summary.totalReversedAmount}, Inconsistencies=${reconReversed.inconsistencies.length}`
  );

  // -------------------------------------------------------------------------
  // TEST REC-05: Allocation total mismatch is detected (RECEIPT_ALLOCATION_MISMATCH)
  // -------------------------------------------------------------------------
  const fixtureBrokenAllocation: CustomerReceipt = {
    receiptId: 'cr_fixture_broken_alloc',
    receiptNumber: 'CR-FIXTURE-01',
    customerId: retailerAId,
    customerSnapshot: {
      retailerId: retailerAId,
      businessName: 'Aggarwal Kirana Store',
      ownerName: 'Vikas Aggarwal',
      mobile: '9811199111',
      billingAddress: 'B-10, Main Market',
    },
    receiptDate: '2026-09-05',
    amountPaise: 50000,
    paymentMethod: 'CASH',
    cashBankAccountCode: '1100',
    allocations: [],
    allocatedAmountPaise: 30000,
    unallocatedAmountPaise: 10000, // Sum = 40,000 !== 50,000!
    status: 'POSTED',
    journalId: 'jnl_dummy',
    createdBy: superAdminSession.uid,
    createdAt: new Date().toISOString(),
    version: 1,
  };

  const reconBrokenAlloc = await CustomerReceiptService.reconcileCustomerReceipts(
    superAdminSession,
    undefined,
    {
      inMemoryFixtures: {
        receipts: [fixtureBrokenAllocation],
        journals: [
          {
            journalId: 'jnl_dummy',
            journalNumber: 'JNL-DUMMY',
            journalDate: '2026-09-05',
            status: 'POSTED',
            totalDebit: 500,
            totalCredit: 500,
            createdBy: 'admin',
            createdAt: new Date().toISOString(),
          } as any,
        ],
        journalLines: [
          {
            lineId: 'line_1',
            journalId: 'jnl_dummy',
            accountId: 'acc_1100',
            debit: 500,
            credit: 0,
            lineNumber: 1,
          } as any,
          {
            lineId: 'line_2',
            journalId: 'jnl_dummy',
            accountId: 'acc_1300',
            debit: 0,
            credit: 500,
            lineNumber: 2,
          } as any,
        ],
      },
    }
  );

  const foundAllocMismatch = reconBrokenAlloc.inconsistencies.some(
    (i) => i.code === 'RECEIPT_ALLOCATION_MISMATCH'
  );

  assertTest(
    foundAllocMismatch === true && reconBrokenAlloc.summary.isFullyReconciled === false,
    'REC-05',
    'Allocation total mismatch is detected',
    `Detected RECEIPT_ALLOCATION_MISMATCH correctly: ${reconBrokenAlloc.inconsistencies[0]?.message}`
  );

  // -------------------------------------------------------------------------
  // TEST REC-06: Invoice paid/outstanding mismatch is detected (INCORRECT_INVOICE_BALANCE)
  // -------------------------------------------------------------------------
  const fixtureBrokenInvoice: SalesInvoice = {
    invoiceId: 'inv_fixture_broken_balance',
    invoiceNumber: 'SI-FIXTURE-BROKEN',
    customerId: retailerAId,
    grandTotal: 1000,
    paidAmountPaise: 40000,
    outstandingAmountPaise: 50000, // 40,000 + 50,000 = 90,000 !== 100,000!
    paymentStatus: 'PARTIALLY_PAID',
    items: [],
    invoiceDate: '2026-09-01',
    createdAt: new Date().toISOString(),
    status: 'ISSUED',
  } as any;

  const fixtureReceiptForInv: CustomerReceipt = {
    receiptId: 'cr_fixture_inv_test',
    receiptNumber: 'CR-FIXTURE-INV',
    customerId: retailerAId,
    customerSnapshot: {
      retailerId: retailerAId,
      businessName: 'Aggarwal Kirana Store',
      ownerName: 'Vikas Aggarwal',
      mobile: '9811199111',
      billingAddress: 'B-10, Main Market',
    },
    receiptDate: '2026-09-05',
    amountPaise: 40000,
    paymentMethod: 'CASH',
    cashBankAccountCode: '1100',
    allocations: [
      {
        receiptId: 'cr_fixture_inv_test',
        invoiceId: 'inv_fixture_broken_balance',
        invoiceNumber: 'SI-FIXTURE-BROKEN',
        retailerId: retailerAId,
        customerId: retailerAId,
        allocatedAmountPaise: 40000,
        createdAt: new Date().toISOString(),
      },
    ],
    allocatedAmountPaise: 40000,
    unallocatedAmountPaise: 0,
    status: 'POSTED',
    journalId: 'jnl_dummy_2',
    createdBy: superAdminSession.uid,
    createdAt: new Date().toISOString(),
    version: 1,
  };

  const reconBrokenInv = await CustomerReceiptService.reconcileCustomerReceipts(
    superAdminSession,
    undefined,
    {
      inMemoryFixtures: {
        receipts: [fixtureReceiptForInv],
        invoices: [fixtureBrokenInvoice],
        journals: [
          {
            journalId: 'jnl_dummy_2',
            journalNumber: 'JNL-DUMMY-2',
            journalDate: '2026-09-05',
            status: 'POSTED',
            totalDebit: 400,
            totalCredit: 400,
            createdBy: 'admin',
            createdAt: new Date().toISOString(),
          } as any,
        ],
        journalLines: [
          { lineId: 'l1', journalId: 'jnl_dummy_2', accountId: 'acc_1100', debit: 400, credit: 0, lineNumber: 1 } as any,
          { lineId: 'l2', journalId: 'jnl_dummy_2', accountId: 'acc_1300', debit: 0, credit: 400, lineNumber: 2 } as any,
        ],
      },
    }
  );

  const foundInvMismatch = reconBrokenInv.inconsistencies.some(
    (i) => i.code === 'INCORRECT_INVOICE_BALANCE'
  );

  assertTest(
    foundInvMismatch === true,
    'REC-06',
    'Invoice paid/outstanding mismatch is detected',
    `Detected INCORRECT_INVOICE_BALANCE correctly for broken invoice.`
  );

  // -------------------------------------------------------------------------
  // TEST REC-07: Cross-retailer allocation is detected (CROSS_RETAILER_ALLOCATION)
  // -------------------------------------------------------------------------
  const fixtureCrossRetailerInvoice: SalesInvoice = {
    invoiceId: 'inv_retailer_b',
    invoiceNumber: 'SI-RET-B-01',
    customerId: retailerBId, // Belongs to Retailer B!
    grandTotal: 500,
    paidAmountPaise: 0,
    outstandingAmountPaise: 50000,
    paymentStatus: 'UNPAID',
    items: [],
    invoiceDate: '2026-09-01',
    createdAt: new Date().toISOString(),
    status: 'ISSUED',
  } as any;

  const fixtureCrossRetailerReceipt: CustomerReceipt = {
    receiptId: 'cr_cross_retailer_receipt',
    receiptNumber: 'CR-CROSS-01',
    customerId: retailerAId, // Belongs to Retailer A!
    customerSnapshot: {
      retailerId: retailerAId,
      businessName: 'Aggarwal Kirana Store',
      ownerName: 'Vikas Aggarwal',
      mobile: '9811199111',
      billingAddress: 'B-10, Main Market',
    },
    receiptDate: '2026-09-05',
    amountPaise: 20000,
    paymentMethod: 'CASH',
    cashBankAccountCode: '1100',
    allocations: [
      {
        receiptId: 'cr_cross_retailer_receipt',
        invoiceId: 'inv_retailer_b',
        invoiceNumber: 'SI-RET-B-01',
        retailerId: retailerBId,
        customerId: retailerBId,
        allocatedAmountPaise: 20000,
        createdAt: new Date().toISOString(),
      },
    ],
    allocatedAmountPaise: 20000,
    unallocatedAmountPaise: 0,
    status: 'POSTED',
    journalId: 'jnl_dummy_cross',
    createdBy: superAdminSession.uid,
    createdAt: new Date().toISOString(),
    version: 1,
  };

  const reconCross = await CustomerReceiptService.reconcileCustomerReceipts(
    superAdminSession,
    undefined,
    {
      inMemoryFixtures: {
        receipts: [fixtureCrossRetailerReceipt],
        invoices: [fixtureCrossRetailerInvoice],
        journals: [
          {
            journalId: 'jnl_dummy_cross',
            journalNumber: 'JNL-DUMMY-CROSS',
            journalDate: '2026-09-05',
            status: 'POSTED',
            totalDebit: 200,
            totalCredit: 200,
            createdBy: 'admin',
            createdAt: new Date().toISOString(),
          } as any,
        ],
        journalLines: [
          { lineId: 'lc1', journalId: 'jnl_dummy_cross', accountId: 'acc_1100', debit: 200, credit: 0, lineNumber: 1 } as any,
          { lineId: 'lc2', journalId: 'jnl_dummy_cross', accountId: 'acc_1300', debit: 0, credit: 200, lineNumber: 2 } as any,
        ],
      },
    }
  );

  const foundCrossRetailer = reconCross.inconsistencies.some(
    (i) => i.code === 'CROSS_RETAILER_ALLOCATION'
  );

  assertTest(
    foundCrossRetailer === true,
    'REC-07',
    'Cross-retailer allocation is detected',
    `Detected CROSS_RETAILER_ALLOCATION correctly: ${reconCross.inconsistencies.find((i) => i.code === 'CROSS_RETAILER_ALLOCATION')?.message}`
  );

  // -------------------------------------------------------------------------
  // TEST REC-08: Orphan allocation is detected (ORPHAN_ALLOCATION)
  // -------------------------------------------------------------------------
  const fixtureOrphanReceipt: CustomerReceipt = {
    receiptId: 'cr_orphan_alloc_receipt',
    receiptNumber: 'CR-ORPHAN-01',
    customerId: retailerAId,
    customerSnapshot: {
      retailerId: retailerAId,
      businessName: 'Aggarwal Kirana Store',
      ownerName: 'Vikas Aggarwal',
      mobile: '9811199111',
      billingAddress: 'B-10, Main Market',
    },
    receiptDate: '2026-09-05',
    amountPaise: 20000,
    paymentMethod: 'CASH',
    cashBankAccountCode: '1100',
    allocations: [
      {
        receiptId: 'cr_orphan_alloc_receipt',
        invoiceId: 'inv_non_existent_orphan_9999',
        invoiceNumber: 'SI-NON-EXISTENT',
        retailerId: retailerAId,
        customerId: retailerAId,
        allocatedAmountPaise: 20000,
        createdAt: new Date().toISOString(),
      },
    ],
    allocatedAmountPaise: 20000,
    unallocatedAmountPaise: 0,
    status: 'POSTED',
    journalId: 'jnl_dummy_orphan',
    createdBy: superAdminSession.uid,
    createdAt: new Date().toISOString(),
    version: 1,
  };

  const reconOrphan = await CustomerReceiptService.reconcileCustomerReceipts(
    superAdminSession,
    undefined,
    {
      inMemoryFixtures: {
        receipts: [fixtureOrphanReceipt],
        invoices: [], // Empty invoices list!
        journals: [
          {
            journalId: 'jnl_dummy_orphan',
            journalNumber: 'JNL-DUMMY-ORPHAN',
            journalDate: '2026-09-05',
            status: 'POSTED',
            totalDebit: 200,
            totalCredit: 200,
            createdBy: 'admin',
            createdAt: new Date().toISOString(),
          } as any,
        ],
        journalLines: [
          { lineId: 'lo1', journalId: 'jnl_dummy_orphan', accountId: 'acc_1100', debit: 200, credit: 0, lineNumber: 1 } as any,
          { lineId: 'lo2', journalId: 'jnl_dummy_orphan', accountId: 'acc_1300', debit: 0, credit: 200, lineNumber: 2 } as any,
        ],
      },
    }
  );

  const foundOrphan = reconOrphan.inconsistencies.some((i) => i.code === 'ORPHAN_ALLOCATION');

  assertTest(
    foundOrphan === true,
    'REC-08',
    'Orphan allocation is detected',
    `Detected ORPHAN_ALLOCATION correctly: ${reconOrphan.inconsistencies.find((i) => i.code === 'ORPHAN_ALLOCATION')?.message}`
  );

  // -------------------------------------------------------------------------
  // TEST REC-09: Missing original journal is detected (MISSING_ORIGINAL_JOURNAL)
  // -------------------------------------------------------------------------
  const fixtureMissingJournalReceipt: CustomerReceipt = {
    receiptId: 'cr_missing_journal_receipt',
    receiptNumber: 'CR-MISSING-JNL',
    customerId: retailerAId,
    customerSnapshot: {
      retailerId: retailerAId,
      businessName: 'Aggarwal Kirana Store',
      ownerName: 'Vikas Aggarwal',
      mobile: '9811199111',
      billingAddress: 'B-10, Main Market',
    },
    receiptDate: '2026-09-05',
    amountPaise: 20000,
    paymentMethod: 'CASH',
    cashBankAccountCode: '1100',
    allocations: [],
    allocatedAmountPaise: 0,
    unallocatedAmountPaise: 20000,
    status: 'POSTED',
    journalId: 'jnl_missing_non_existent',
    createdBy: superAdminSession.uid,
    createdAt: new Date().toISOString(),
    version: 1,
  };

  const reconMissingJnl = await CustomerReceiptService.reconcileCustomerReceipts(
    superAdminSession,
    undefined,
    {
      inMemoryFixtures: {
        receipts: [fixtureMissingJournalReceipt],
        journals: [], // Journal not found!
      },
    }
  );

  const foundMissingJnl = reconMissingJnl.inconsistencies.some(
    (i) => i.code === 'MISSING_ORIGINAL_JOURNAL'
  );

  assertTest(
    foundMissingJnl === true,
    'REC-09',
    'Missing original journal is detected',
    `Detected MISSING_ORIGINAL_JOURNAL correctly: ${reconMissingJnl.inconsistencies.find((i) => i.code === 'MISSING_ORIGINAL_JOURNAL')?.message}`
  );

  // -------------------------------------------------------------------------
  // TEST REC-10: Missing reversal journal is detected (MISSING_REVERSAL_JOURNAL)
  // -------------------------------------------------------------------------
  const fixtureMissingRevJnlReceipt: CustomerReceipt = {
    receiptId: 'cr_missing_rev_jnl_receipt',
    receiptNumber: 'CR-MISSING-REV-JNL',
    customerId: retailerAId,
    customerSnapshot: {
      retailerId: retailerAId,
      businessName: 'Aggarwal Kirana Store',
      ownerName: 'Vikas Aggarwal',
      mobile: '9811199111',
      billingAddress: 'B-10, Main Market',
    },
    receiptDate: '2026-09-05',
    amountPaise: 20000,
    paymentMethod: 'CASH',
    cashBankAccountCode: '1100',
    allocations: [],
    allocatedAmountPaise: 0,
    unallocatedAmountPaise: 20000,
    status: 'REVERSED',
    journalId: 'jnl_orig_exists',
    reversalJournalId: 'rev_jnl_missing',
    createdBy: superAdminSession.uid,
    createdAt: new Date().toISOString(),
    version: 1,
  };

  const reconMissingRevJnl = await CustomerReceiptService.reconcileCustomerReceipts(
    superAdminSession,
    undefined,
    {
      inMemoryFixtures: {
        receipts: [fixtureMissingRevJnlReceipt],
        journals: [
          {
            journalId: 'jnl_orig_exists',
            journalNumber: 'JNL-ORIG-01',
            journalDate: '2026-09-05',
            status: 'POSTED',
            totalDebit: 200,
            totalCredit: 200,
            createdBy: 'admin',
            createdAt: new Date().toISOString(),
          } as any,
        ],
        journalLines: [
          { lineId: 'lo1', journalId: 'jnl_orig_exists', accountId: 'acc_1100', debit: 200, credit: 0, lineNumber: 1 } as any,
          { lineId: 'lo2', journalId: 'jnl_orig_exists', accountId: 'acc_1300', debit: 0, credit: 200, lineNumber: 2 } as any,
        ],
      },
    }
  );

  const foundMissingRevJnl = reconMissingRevJnl.inconsistencies.some(
    (i) => i.code === 'MISSING_REVERSAL_JOURNAL'
  );

  assertTest(
    foundMissingRevJnl === true,
    'REC-10',
    'Missing reversal journal is detected',
    `Detected MISSING_REVERSAL_JOURNAL correctly: ${reconMissingRevJnl.inconsistencies.find((i) => i.code === 'MISSING_REVERSAL_JOURNAL')?.message}`
  );

  // -------------------------------------------------------------------------
  // TEST REC-11: Incorrect reversal linkage is detected (INCORRECT_REVERSAL_LINKAGE)
  // -------------------------------------------------------------------------
  const fixtureBadLinkageReceipt: CustomerReceipt = {
    receiptId: 'cr_bad_linkage_receipt',
    receiptNumber: 'CR-BAD-LINK',
    customerId: retailerAId,
    customerSnapshot: {
      retailerId: retailerAId,
      businessName: 'Aggarwal Kirana Store',
      ownerName: 'Vikas Aggarwal',
      mobile: '9811199111',
      billingAddress: 'B-10, Main Market',
    },
    receiptDate: '2026-09-05',
    amountPaise: 20000,
    paymentMethod: 'CASH',
    cashBankAccountCode: '1100',
    allocations: [],
    allocatedAmountPaise: 0,
    unallocatedAmountPaise: 20000,
    status: 'REVERSED',
    journalId: 'jnl_orig_link_test',
    reversalJournalId: 'rev_bad_linkage',
    createdBy: superAdminSession.uid,
    createdAt: new Date().toISOString(),
    version: 1,
  };

  const fixtureBadReversalJournal: JournalEntry = {
    journalId: 'rev_bad_linkage',
    journalNumber: 'REV-BAD-01',
    journalDate: '2026-09-05',
    voucherType: 'REVERSAL',
    status: 'POSTED',
    totalDebit: 200,
    totalCredit: 200,
    reversalOfJournalId: 'jnl_some_other_wrong_journal_id', // Points to wrong journal!
    createdBy: 'admin',
    createdAt: new Date().toISOString(),
  } as any;

  const reconBadLinkage = await CustomerReceiptService.reconcileCustomerReceipts(
    superAdminSession,
    undefined,
    {
      inMemoryFixtures: {
        receipts: [fixtureBadLinkageReceipt],
        journals: [
          {
            journalId: 'jnl_orig_link_test',
            journalNumber: 'JNL-ORIG-LINK',
            journalDate: '2026-09-05',
            status: 'POSTED',
            totalDebit: 200,
            totalCredit: 200,
            createdBy: 'admin',
            createdAt: new Date().toISOString(),
          } as any,
          fixtureBadReversalJournal,
        ],
        journalLines: [
          { lineId: 'lb1', journalId: 'jnl_orig_link_test', accountId: 'acc_1100', debit: 200, credit: 0, lineNumber: 1 } as any,
          { lineId: 'lb2', journalId: 'jnl_orig_link_test', accountId: 'acc_1300', debit: 0, credit: 200, lineNumber: 2 } as any,
          { lineId: 'lbr1', journalId: 'rev_bad_linkage', accountId: 'acc_1300', debit: 200, credit: 0, lineNumber: 1 } as any,
          { lineId: 'lbr2', journalId: 'rev_bad_linkage', accountId: 'acc_1100', debit: 0, credit: 200, lineNumber: 2 } as any,
        ],
      },
    }
  );

  const foundBadLinkage = reconBadLinkage.inconsistencies.some(
    (i) => i.code === 'INCORRECT_REVERSAL_LINKAGE'
  );

  assertTest(
    foundBadLinkage === true,
    'REC-11',
    'Incorrect reversal linkage is detected',
    `Detected INCORRECT_REVERSAL_LINKAGE correctly: ${reconBadLinkage.inconsistencies.find((i) => i.code === 'INCORRECT_REVERSAL_LINKAGE')?.message}`
  );

  // -------------------------------------------------------------------------
  // TEST REC-12: Unresolved canonical retailer reference is detected (UNRESOLVED_RETAILER_REFERENCE)
  // -------------------------------------------------------------------------
  const fixtureUnresolvedCustomerReceipt: CustomerReceipt = {
    receiptId: 'cr_unresolved_customer_receipt',
    receiptNumber: 'CR-UNRESOLVED',
    customerId: 'retailer_does_not_exist_xyz_9999',
    customerSnapshot: {
      retailerId: 'retailer_does_not_exist_xyz_9999',
      businessName: 'Non Existent Store',
      ownerName: 'Ghost',
      mobile: '9999999999',
      billingAddress: 'Nowhere',
    },
    receiptDate: '2026-09-05',
    amountPaise: 10000,
    paymentMethod: 'CASH',
    cashBankAccountCode: '1100',
    allocations: [],
    allocatedAmountPaise: 0,
    unallocatedAmountPaise: 10000,
    status: 'POSTED',
    journalId: 'jnl_dummy_unres',
    createdBy: superAdminSession.uid,
    createdAt: new Date().toISOString(),
    version: 1,
  };

  const reconUnresolved = await CustomerReceiptService.reconcileCustomerReceipts(
    superAdminSession,
    undefined,
    {
      inMemoryFixtures: {
        receipts: [fixtureUnresolvedCustomerReceipt],
        journals: [
          {
            journalId: 'jnl_dummy_unres',
            journalNumber: 'JNL-UNRES',
            journalDate: '2026-09-05',
            status: 'POSTED',
            totalDebit: 100,
            totalCredit: 100,
            createdBy: 'admin',
            createdAt: new Date().toISOString(),
          } as any,
        ],
        journalLines: [
          { lineId: 'lu1', journalId: 'jnl_dummy_unres', accountId: 'acc_1100', debit: 100, credit: 0, lineNumber: 1 } as any,
          { lineId: 'lu2', journalId: 'jnl_dummy_unres', accountId: 'acc_1300', debit: 0, credit: 100, lineNumber: 2 } as any,
        ],
      },
    }
  );

  const foundUnresolved = reconUnresolved.inconsistencies.some(
    (i) => i.code === 'UNRESOLVED_RETAILER_REFERENCE'
  );

  assertTest(
    foundUnresolved === true,
    'REC-12',
    'Unresolved canonical retailer reference is detected',
    `Detected UNRESOLVED_RETAILER_REFERENCE correctly: ${reconUnresolved.inconsistencies.find((i) => i.code === 'UNRESOLVED_RETAILER_REFERENCE')?.message}`
  );

  // -------------------------------------------------------------------------
  // TEST REC-13 & REC-14: Balanced journal passes, imbalanced journal detected (ACCOUNTING_JOURNAL_IMBALANCE)
  // -------------------------------------------------------------------------
  const fixtureImbalancedReceipt: CustomerReceipt = {
    receiptId: 'cr_imbalanced_jnl_receipt',
    receiptNumber: 'CR-IMBALANCE',
    customerId: retailerAId,
    customerSnapshot: {
      retailerId: retailerAId,
      businessName: 'Aggarwal Kirana Store',
      ownerName: 'Vikas Aggarwal',
      mobile: '9811199111',
      billingAddress: 'B-10, Main Market',
    },
    receiptDate: '2026-09-05',
    amountPaise: 30000,
    paymentMethod: 'CASH',
    cashBankAccountCode: '1100',
    allocations: [],
    allocatedAmountPaise: 0,
    unallocatedAmountPaise: 30000,
    status: 'POSTED',
    journalId: 'jnl_imbalanced_test',
    createdBy: superAdminSession.uid,
    createdAt: new Date().toISOString(),
    version: 1,
  };

  const reconImbalance = await CustomerReceiptService.reconcileCustomerReceipts(
    superAdminSession,
    undefined,
    {
      inMemoryFixtures: {
        receipts: [fixtureImbalancedReceipt],
        journals: [
          {
            journalId: 'jnl_imbalanced_test',
            journalNumber: 'JNL-IMBALANCED',
            journalDate: '2026-09-05',
            status: 'POSTED',
            totalDebit: 300,
            totalCredit: 250, // IMBALANCED!
            createdBy: 'admin',
            createdAt: new Date().toISOString(),
          } as any,
        ],
        journalLines: [
          { lineId: 'li1', journalId: 'jnl_imbalanced_test', accountId: 'acc_1100', debit: 300, credit: 0, lineNumber: 1 } as any,
          { lineId: 'li2', journalId: 'jnl_imbalanced_test', accountId: 'acc_1300', debit: 0, credit: 250, lineNumber: 2 } as any, // 300 !== 250
        ],
      },
    }
  );

  const foundImbalance = reconImbalance.inconsistencies.some(
    (i) => i.code === 'ACCOUNTING_JOURNAL_IMBALANCE'
  );

  assertTest(
    foundImbalance === true,
    'REC-14',
    'Imbalanced journal is detected',
    `Detected ACCOUNTING_JOURNAL_IMBALANCE correctly: ${reconImbalance.inconsistencies.find((i) => i.code === 'ACCOUNTING_JOURNAL_IMBALANCE')?.message}`
  );

  assertTest(
    reconUnalloc.summary.isFullyReconciled === true &&
      !reconUnalloc.inconsistencies.some((i) => i.code === 'ACCOUNTING_JOURNAL_IMBALANCE'),
    'REC-13',
    'Balanced journal passes reconciliation cleanly',
    `Balanced journal passed cleanly with 0 imbalance flags.`
  );

  // -------------------------------------------------------------------------
  // TEST REC-16: Reconciliation performs zero accounting mutations (Read-only guarantee)
  // -------------------------------------------------------------------------
  const receiptsBeforeSnap = await getDocs(
    query(collection(db, 'customerReceipts'), where('_serverTxnToken', '==', SERVER_TXN_TOKEN))
  );
  const journalsBeforeSnap = await getDocs(collection(db, 'journalEntries'));
  const invoicesBeforeSnap = await getDocs(collection(db, 'salesInvoices'));

  // Run reconciliation across all records in Firestore
  await CustomerReceiptService.reconcileCustomerReceipts(superAdminSession);

  const receiptsAfterSnap = await getDocs(
    query(collection(db, 'customerReceipts'), where('_serverTxnToken', '==', SERVER_TXN_TOKEN))
  );
  const journalsAfterSnap = await getDocs(collection(db, 'journalEntries'));
  const invoicesAfterSnap = await getDocs(collection(db, 'salesInvoices'));

  assertTest(
    receiptsBeforeSnap.size === receiptsAfterSnap.size &&
      journalsBeforeSnap.size === journalsAfterSnap.size &&
      invoicesBeforeSnap.size === invoicesAfterSnap.size,
    'REC-16',
    'Reconciliation performs zero accounting mutations',
    `Receipt count: ${receiptsBeforeSnap.size} == ${receiptsAfterSnap.size}, Journals count: ${journalsBeforeSnap.size} == ${journalsAfterSnap.size}, Invoices count: ${invoicesBeforeSnap.size} == ${invoicesAfterSnap.size}`
  );

  // -------------------------------------------------------------------------
  // TEST REC-17: Duplicate allocation record is detected (DUPLICATE_ALLOCATION_RECORD)
  // -------------------------------------------------------------------------
  const fixtureDuplicateAllocReceipt: CustomerReceipt = {
    receiptId: 'cr_duplicate_alloc_receipt',
    receiptNumber: 'CR-DUP-ALLOC',
    customerId: retailerAId,
    customerSnapshot: {
      retailerId: retailerAId,
      businessName: 'Aggarwal Kirana Store',
      ownerName: 'Vikas Aggarwal',
      mobile: '9811199111',
      billingAddress: 'B-10, Main Market',
    },
    receiptDate: '2026-09-05',
    amountPaise: 40000,
    paymentMethod: 'CASH',
    cashBankAccountCode: '1100',
    allocations: [
      {
        receiptId: 'cr_duplicate_alloc_receipt',
        invoiceId: invoiceA1.invoiceId,
        invoiceNumber: invoiceA1.invoiceNumber,
        retailerId: retailerAId,
        customerId: retailerAId,
        allocatedAmountPaise: 20000,
        createdAt: new Date().toISOString(),
      },
      {
        receiptId: 'cr_duplicate_alloc_receipt',
        invoiceId: invoiceA1.invoiceId, // Duplicate of invoiceA1!
        invoiceNumber: invoiceA1.invoiceNumber,
        retailerId: retailerAId,
        customerId: retailerAId,
        allocatedAmountPaise: 20000,
        createdAt: new Date().toISOString(),
      },
    ],
    allocatedAmountPaise: 40000,
    unallocatedAmountPaise: 0,
    status: 'POSTED',
    journalId: 'jnl_dummy_dup',
    createdBy: superAdminSession.uid,
    createdAt: new Date().toISOString(),
    version: 1,
  };

  const reconDup = await CustomerReceiptService.reconcileCustomerReceipts(
    superAdminSession,
    undefined,
    {
      inMemoryFixtures: {
        receipts: [fixtureDuplicateAllocReceipt],
        journals: [
          {
            journalId: 'jnl_dummy_dup',
            journalNumber: 'JNL-DUP',
            journalDate: '2026-09-05',
            status: 'POSTED',
            totalDebit: 400,
            totalCredit: 400,
            createdBy: 'admin',
            createdAt: new Date().toISOString(),
          } as any,
        ],
        journalLines: [
          { lineId: 'ld1', journalId: 'jnl_dummy_dup', accountId: 'acc_1100', debit: 400, credit: 0, lineNumber: 1 } as any,
          { lineId: 'ld2', journalId: 'jnl_dummy_dup', accountId: 'acc_1300', debit: 0, credit: 400, lineNumber: 2 } as any,
        ],
      },
    }
  );

  const foundDupAlloc = reconDup.inconsistencies.some(
    (i) => i.code === 'DUPLICATE_ALLOCATION_RECORD'
  );

  assertTest(
    foundDupAlloc === true,
    'REC-17',
    'Duplicate allocation record is detected',
    `Detected DUPLICATE_ALLOCATION_RECORD correctly: ${reconDup.inconsistencies.find((i) => i.code === 'DUPLICATE_ALLOCATION_RECORD')?.message}`
  );

  // -------------------------------------------------------------------------
  // TEST REC-18: Allocation exceeding receipt amount is detected (ALLOCATION_EXCEEDS_RECEIPT_AMOUNT)
  // -------------------------------------------------------------------------
  const fixtureExceedingReceipt: CustomerReceipt = {
    receiptId: 'cr_exceeding_alloc_receipt',
    receiptNumber: 'CR-EXCEED-ALLOC',
    customerId: retailerAId,
    customerSnapshot: {
      retailerId: retailerAId,
      businessName: 'Aggarwal Kirana Store',
      ownerName: 'Vikas Aggarwal',
      mobile: '9811199111',
      billingAddress: 'B-10, Main Market',
    },
    receiptDate: '2026-09-05',
    amountPaise: 20000, // 200 rupees
    paymentMethod: 'CASH',
    cashBankAccountCode: '1100',
    allocations: [
      {
        receiptId: 'cr_exceeding_alloc_receipt',
        invoiceId: invoiceA1.invoiceId,
        invoiceNumber: invoiceA1.invoiceNumber,
        retailerId: retailerAId,
        customerId: retailerAId,
        allocatedAmountPaise: 50000, // 500 rupees > 200 rupees!
        createdAt: new Date().toISOString(),
      },
    ],
    allocatedAmountPaise: 50000,
    unallocatedAmountPaise: -30000,
    status: 'POSTED',
    journalId: 'jnl_dummy_exceed',
    createdBy: superAdminSession.uid,
    createdAt: new Date().toISOString(),
    version: 1,
  };

  const reconExceed = await CustomerReceiptService.reconcileCustomerReceipts(
    superAdminSession,
    undefined,
    {
      inMemoryFixtures: {
        receipts: [fixtureExceedingReceipt],
        journals: [
          {
            journalId: 'jnl_dummy_exceed',
            journalNumber: 'JNL-EXCEED',
            journalDate: '2026-09-05',
            status: 'POSTED',
            totalDebit: 200,
            totalCredit: 200,
            createdBy: 'admin',
            createdAt: new Date().toISOString(),
          } as any,
        ],
        journalLines: [
          { lineId: 'le1', journalId: 'jnl_dummy_exceed', accountId: 'acc_1100', debit: 200, credit: 0, lineNumber: 1 } as any,
          { lineId: 'le2', journalId: 'jnl_dummy_exceed', accountId: 'acc_1300', debit: 0, credit: 200, lineNumber: 2 } as any,
        ],
      },
    }
  );

  const foundExceed = reconExceed.inconsistencies.some(
    (i) => i.code === 'ALLOCATION_EXCEEDS_RECEIPT_AMOUNT'
  );

  assertTest(
    foundExceed === true,
    'REC-18',
    'Allocation exceeding receipt amount is detected',
    `Detected ALLOCATION_EXCEEDS_RECEIPT_AMOUNT correctly: ${reconExceed.inconsistencies.find((i) => i.code === 'ALLOCATION_EXCEEDS_RECEIPT_AMOUNT')?.message}`
  );

  // -------------------------------------------------------------------------
  // TEST REC-19: Reversal amount mismatch is detected (REVERSED_AMOUNT_MISMATCH)
  // -------------------------------------------------------------------------
  const fixtureReversalMismatchReceipt: CustomerReceipt = {
    receiptId: 'cr_rev_mismatch_receipt',
    receiptNumber: 'CR-REV-MISMATCH',
    customerId: retailerAId,
    customerSnapshot: {
      retailerId: retailerAId,
      businessName: 'Aggarwal Kirana Store',
      ownerName: 'Vikas Aggarwal',
      mobile: '9811199111',
      billingAddress: 'B-10, Main Market',
    },
    receiptDate: '2026-09-05',
    amountPaise: 40000,
    paymentMethod: 'CASH',
    cashBankAccountCode: '1100',
    allocations: [],
    allocatedAmountPaise: 0,
    unallocatedAmountPaise: 40000,
    status: 'REVERSED',
    journalId: 'jnl_orig_400',
    reversalJournalId: 'rev_jnl_300', // Reversal has 300, not 400!
    createdBy: superAdminSession.uid,
    createdAt: new Date().toISOString(),
    version: 1,
  };

  const reconRevMismatch = await CustomerReceiptService.reconcileCustomerReceipts(
    superAdminSession,
    undefined,
    {
      inMemoryFixtures: {
        receipts: [fixtureReversalMismatchReceipt],
        journals: [
          {
            journalId: 'jnl_orig_400',
            journalNumber: 'JNL-400',
            journalDate: '2026-09-05',
            status: 'POSTED',
            totalDebit: 400,
            totalCredit: 400,
            createdBy: 'admin',
            createdAt: new Date().toISOString(),
          } as any,
          {
            journalId: 'rev_jnl_300',
            journalNumber: 'REV-300',
            journalDate: '2026-09-05',
            voucherType: 'REVERSAL',
            status: 'POSTED',
            reversalOfJournalId: 'jnl_orig_400',
            totalDebit: 300, // 300 !== 400!
            totalCredit: 300,
            createdBy: 'admin',
            createdAt: new Date().toISOString(),
          } as any,
        ],
        journalLines: [
          { lineId: 'lo1', journalId: 'jnl_orig_400', accountId: 'acc_1100', debit: 400, credit: 0, lineNumber: 1 } as any,
          { lineId: 'lo2', journalId: 'jnl_orig_400', accountId: 'acc_1300', debit: 0, credit: 400, lineNumber: 2 } as any,
          { lineId: 'lr1', journalId: 'rev_jnl_300', accountId: 'acc_1300', debit: 300, credit: 0, lineNumber: 1 } as any,
          { lineId: 'lr2', journalId: 'rev_jnl_300', accountId: 'acc_1100', debit: 0, credit: 300, lineNumber: 2 } as any,
        ],
      },
    }
  );

  const foundRevMismatch = reconRevMismatch.inconsistencies.some(
    (i) => i.code === 'REVERSED_AMOUNT_MISMATCH'
  );

  assertTest(
    foundRevMismatch === true,
    'REC-19',
    'Reversal amount mismatch is detected',
    `Detected REVERSED_AMOUNT_MISMATCH correctly: ${reconRevMismatch.inconsistencies.find((i) => i.code === 'REVERSED_AMOUNT_MISMATCH')?.message}`
  );

  // -------------------------------------------------------------------------
  // TEST REC-20: Summary metrics and report totals are computed accurately
  // -------------------------------------------------------------------------
  const reconSummaryCheck = await CustomerReceiptService.reconcileCustomerReceipts(
    superAdminSession,
    { customerId: retailerAId }
  );

  assertTest(
    reconSummaryCheck.success === true &&
      reconSummaryCheck.summary.totalReceiptsChecked >= 4 &&
      reconSummaryCheck.summary.totalActiveReceiptAmountPaise === 40000 + 100000 + 50000 &&
      reconSummaryCheck.summary.totalAllocatedAmountPaise === 100000 + 20000 &&
      reconSummaryCheck.summary.totalUnallocatedAmountPaise === 40000 + 30000 &&
      reconSummaryCheck.summary.totalReversedAmountPaise === 30000 &&
      reconSummaryCheck.summary.ledgerChecksPerformed >= 1 &&
      reconSummaryCheck.summary.isFullyReconciled === true,
    'REC-20',
    'Summary metrics and report totals are computed accurately',
    `Summary metrics verified: Receipts=${reconSummaryCheck.summary.totalReceiptsChecked}, Active=₹${reconSummaryCheck.summary.totalActiveReceiptAmount}, Allocated=₹${reconSummaryCheck.summary.totalAllocatedAmount}, Unallocated=₹${reconSummaryCheck.summary.totalUnallocatedAmount}, Reversed=₹${reconSummaryCheck.summary.totalReversedAmount}, LedgersChecked=${reconSummaryCheck.summary.ledgerChecksPerformed}`
  );

  // Summary
  console.log('\n======================================================================');
  console.log('PHASE 5.7 PART 2E TEST SUITE SUMMARY');
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
    console.log('✅ ALL PHASE 5.7 PART 2E TESTS PASSED SUCCESSFULLY');
  }

  return { total, passed, failed, blocked };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCustomerReceiptReconciliationTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}
