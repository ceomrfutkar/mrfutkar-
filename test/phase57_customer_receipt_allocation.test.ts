/**
 * MR FUTKAR — Phase 5.7 Part 2C: Customer Receipt Allocation & Retailer Ledger Integration Test Suite
 * Validates:
 * - Server-authoritative Customer Receipt allocation to sales invoices
 * - Allocation record structure: receiptId, invoiceId, retailerId, customerId, allocatedAmountPaise, createdAt
 * - Server-side validation: matching retailer, invoice existence, posted status, amount > 0
 * - Over-allocation defenses (exceeds receipt unallocated, exceeds invoice outstanding)
 * - Duplicate invoice and idempotency handling
 * - Multiple sequential allocations against one receipt until fully allocated
 * - Retailer self-ledger outstanding balance derived from double-entry accounting source of truth
 * - Preservation of Part 2A/2B accounting behavior (no double-journaling on allocation, AR credited at receipt posting)
 * - Zero/negative allocation rejection
 * - Client field injection defense
 */

import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN, OPERATIONAL_WAREHOUSE_ID } from '../server/firebaseAdmin';
import cfg from '../firebase-applet-config.json';
import { SeedService } from '../server/seedService';
import { ensureSystemAccounts } from '../server/accountingSeedService';
import { ensureDefaultAccountingPeriod } from '../server/accountingPeriodService';
import { ensureInitialSuperAdmin } from '../server/adminAuth';
import { CustomerReceiptService } from '../server/customerReceiptService';
import { PartyLedgerService } from '../server/partyLedgerService';
import { InvoiceService } from '../server/invoiceService';
import { AdminSession } from '../src/types/admin';
import { CustomerReceipt } from '../src/types/customerReceipt';
import { SalesInvoice } from '../src/types/invoice';

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

export async function runCustomerReceiptAllocationTestSuite() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 5.7 PART 2C: RECEIPT ALLOCATION & LEDGER INTEGRATION');
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

  const testTimestamp = Date.now();
  const retailerAId = `ret_alloc_a_${testTimestamp}`;
  const retailerBId = `ret_alloc_b_${testTimestamp}`;

  // 1. Create test Retailer A
  await setDoc(doc(db, 'retailers', retailerAId), {
    retailerId: retailerAId,
    shopName: 'Aggarwal Provision Store',
    ownerName: 'Sunil Aggarwal',
    mobileNumber: '9811100001',
    shopAddress: 'A-1, Market Road, Brahmpuri',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110053',
    gstNumber: '07AAAAA1111A1Z1',
    status: 'ACTIVE',
    isActive: true,
    isProfileComplete: true,
    createdAt: new Date().toISOString(),
    _serverTxnToken: SERVER_TXN_TOKEN,
  });

  // 2. Create test Retailer B
  await setDoc(doc(db, 'retailers', retailerBId), {
    retailerId: retailerBId,
    shopName: 'Bansal Super Store',
    ownerName: 'Praveen Bansal',
    mobileNumber: '9811100002',
    shopAddress: 'B-2, Subhash Marg, Delhi',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110053',
    gstNumber: '07AAAAA2222B1Z2',
    status: 'ACTIVE',
    isActive: true,
    isProfileComplete: true,
    createdAt: new Date().toISOString(),
    _serverTxnToken: SERVER_TXN_TOKEN,
  });

  // 3. Create and Post Sales Invoices
  // Invoice A1: ₹1,000 (100,000 paise) for Retailer A
  const invoiceA1 = await InvoiceService.createSalesInvoice(superAdminSession, {
    customerId: retailerAId,
    invoiceDate: '2026-09-01',
    items: [
      {
        productId: 'prod-001',
        quantity: 2,
        unitPrice: 500,
      },
    ],
  });
  await InvoiceService.issueSalesInvoice(superAdminSession, invoiceA1.invoiceId);

  // Invoice A2: ₹500 (50,000 paise) for Retailer A
  const invoiceA2 = await InvoiceService.createSalesInvoice(superAdminSession, {
    customerId: retailerAId,
    invoiceDate: '2026-09-02',
    items: [
      {
        productId: 'prod-002',
        quantity: 1,
        unitPrice: 500,
      },
    ],
  });
  await InvoiceService.issueSalesInvoice(superAdminSession, invoiceA2.invoiceId);

  // Invoice B1: ₹800 (80,000 paise) for Retailer B
  const invoiceB1 = await InvoiceService.createSalesInvoice(superAdminSession, {
    customerId: retailerBId,
    invoiceDate: '2026-09-03',
    items: [
      {
        productId: 'prod-001',
        quantity: 4,
        unitPrice: 200,
      },
    ],
  });
  await InvoiceService.issueSalesInvoice(superAdminSession, invoiceB1.invoiceId);

  // 4. Create and Post Customer Receipts for Retailer A
  // Receipt A1: ₹1,200 (120,000 paise)
  const draftReceiptA1 = await CustomerReceiptService.createCustomerReceipt(superAdminSession, {
    customerId: retailerAId,
    amountPaise: 120000,
    paymentMethod: 'BANK_TRANSFER',
    cashBankAccountCode: '1200',
    receiptDate: '2026-09-05',
    referenceNumber: 'NEFT-ALLOC-001',
  });
  const postResultA1 = await CustomerReceiptService.postCustomerReceipt(
    superAdminSession,
    draftReceiptA1.receipt.receiptId
  );
  const receiptA1 = postResultA1.receipt;

  // Receipt A2: ₹300 (30,000 paise)
  const draftReceiptA2 = await CustomerReceiptService.createCustomerReceipt(superAdminSession, {
    customerId: retailerAId,
    amountPaise: 30000,
    paymentMethod: 'UPI',
    cashBankAccountCode: '1100',
    receiptDate: '2026-09-06',
    referenceNumber: 'UPI-ALLOC-002',
  });
  const postResultA2 = await CustomerReceiptService.postCustomerReceipt(
    superAdminSession,
    draftReceiptA2.receipt.receiptId
  );
  const receiptA2 = postResultA2.receipt;

  console.log('\n--- EXECUTING SPECIFIED ALLOCATION TESTS ---');

  // TEST 1: Zero allocation amount rejection
  try {
    await CustomerReceiptService.allocateCustomerReceipt(superAdminSession, receiptA1.receiptId, {
      allocations: [
        {
          invoiceId: invoiceA1.invoiceId,
          amountPaise: 0,
        },
      ],
    });
    assertTest(false, 'ALLOC-01', 'Zero allocation amount rejected', 'Expected error for 0 paise allocation.');
  } catch (err: any) {
    assertTest(
      err.message.includes('INVALID_ALLOCATION_AMOUNT'),
      'ALLOC-01',
      'Zero allocation amount rejected',
      `Correctly rejected zero amount: ${err.message}`
    );
  }

  // TEST 2: Negative allocation amount rejection
  try {
    await CustomerReceiptService.allocateCustomerReceipt(superAdminSession, receiptA1.receiptId, {
      allocations: [
        {
          invoiceId: invoiceA1.invoiceId,
          amountPaise: -5000,
        },
      ],
    });
    assertTest(false, 'ALLOC-02', 'Negative allocation amount rejected', 'Expected error for negative paise allocation.');
  } catch (err: any) {
    assertTest(
      err.message.includes('INVALID_ALLOCATION_AMOUNT'),
      'ALLOC-02',
      'Negative allocation amount rejected',
      `Correctly rejected negative amount: ${err.message}`
    );
  }

  // TEST 3: Cross-retailer invoice mismatch rejection
  try {
    await CustomerReceiptService.allocateCustomerReceipt(superAdminSession, receiptA1.receiptId, {
      allocations: [
        {
          invoiceId: invoiceB1.invoiceId, // Belongs to Retailer B!
          amountPaise: 50000,
        },
      ],
    });
    assertTest(false, 'ALLOC-03', 'Cross-retailer allocation rejected', 'Expected error for cross-retailer invoice allocation.');
  } catch (err: any) {
    assertTest(
      err.message.includes('CROSS_RETAILER_ALLOCATION_FORBIDDEN'),
      'ALLOC-03',
      'Cross-retailer allocation rejected',
      `Correctly rejected cross-retailer allocation: ${err.message}`
    );
  }

  // TEST 4: Allocation greater than invoice outstanding balance rejection
  try {
    await CustomerReceiptService.allocateCustomerReceipt(superAdminSession, receiptA1.receiptId, {
      allocations: [
        {
          invoiceId: invoiceA1.invoiceId,
          amountPaise: 110000, // Invoice total is only ₹1,000 (100,000 paise), receipt has ₹1,200 (120,000 paise)
        },
      ],
    });
    assertTest(false, 'ALLOC-04', 'Allocation exceeds invoice outstanding rejected', 'Expected error when amount > invoice outstanding.');
  } catch (err: any) {
    assertTest(
      err.message.includes('ALLOCATION_EXCEEDS_INVOICE_OUTSTANDING'),
      'ALLOC-04',
      'Allocation exceeds invoice outstanding rejected',
      `Correctly rejected over-allocation against invoice: ${err.message}`
    );
  }

  // TEST 5: Allocation greater than receipt remaining amount rejection
  try {
    await CustomerReceiptService.allocateCustomerReceipt(superAdminSession, receiptA2.receiptId, {
      allocations: [
        {
          invoiceId: invoiceA1.invoiceId,
          amountPaise: 50000, // Receipt A2 is only ₹300 (30,000 paise)
        },
      ],
    });
    assertTest(false, 'ALLOC-05', 'Allocation exceeds receipt amount rejected', 'Expected error when amount > receipt unallocated.');
  } catch (err: any) {
    assertTest(
      err.message.includes('ALLOCATION_EXCEEDS_RECEIPT_AMOUNT'),
      'ALLOC-05',
      'Allocation exceeds receipt amount rejected',
      `Correctly rejected allocation exceeding receipt balance: ${err.message}`
    );
  }

  // TEST 6: Duplicate invoice in single allocation payload rejection
  try {
    await CustomerReceiptService.allocateCustomerReceipt(superAdminSession, receiptA1.receiptId, {
      allocations: [
        { invoiceId: invoiceA1.invoiceId, amountPaise: 20000 },
        { invoiceId: invoiceA1.invoiceId, amountPaise: 30000 },
      ],
    });
    assertTest(false, 'ALLOC-06', 'Duplicate invoice in request rejected', 'Expected error for duplicate invoice IDs.');
  } catch (err: any) {
    assertTest(
      err.message.includes('DUPLICATE_INVOICE_IN_ALLOCATION'),
      'ALLOC-06',
      'Duplicate invoice in request rejected',
      `Correctly rejected duplicate invoice in request: ${err.message}`
    );
  }

  // TEST 7: Client field injection defense
  try {
    await CustomerReceiptService.allocateCustomerReceipt(superAdminSession, receiptA1.receiptId, {
      allocations: [{ invoiceId: invoiceA1.invoiceId, amountPaise: 10000 }],
      status: 'FULLY_ALLOCATED',
    } as any);
    assertTest(false, 'ALLOC-07', 'Client field injection rejected', 'Expected error when client injects status.');
  } catch (err: any) {
    assertTest(
      err.message.includes('CLIENT_FIELD_INJECTION_FORBIDDEN'),
      'ALLOC-07',
      'Client field injection rejected',
      `Correctly rejected client field injection: ${err.message}`
    );
  }

  // TEST 8: Valid Allocation (First step: ₹600 from Receipt A1 to Invoice A1)
  const allocIdempKey = `idemp_alloc_${testTimestamp}`;
  const allocResult1 = await CustomerReceiptService.allocateCustomerReceipt(superAdminSession, receiptA1.receiptId, {
    allocations: [
      {
        invoiceId: invoiceA1.invoiceId,
        amountPaise: 60000, // ₹600
      },
    ],
    idempotencyKey: allocIdempKey,
  });

  const updatedRec1 = allocResult1.receipt;
  const alloc1 = updatedRec1.allocations[0];
  const hasRequiredFields =
    alloc1.receiptId === receiptA1.receiptId &&
    alloc1.invoiceId === invoiceA1.invoiceId &&
    alloc1.retailerId === retailerAId &&
    alloc1.customerId === retailerAId &&
    alloc1.allocatedAmountPaise === 60000 &&
    typeof alloc1.createdAt === 'string' &&
    alloc1.createdAt.length > 10;

  assertTest(
    allocResult1.success &&
      updatedRec1.allocatedAmountPaise === 60000 &&
      updatedRec1.unallocatedAmountPaise === 60000 &&
      updatedRec1.allocationStatus === 'PARTIALLY_ALLOCATED' &&
      hasRequiredFields,
    'ALLOC-08',
    'Valid partial allocation succeeds with all required fields',
    `Allocated ₹600 of ₹1200. Unallocated: ₹${updatedRec1.unallocatedAmountPaise / 100}, Status: ${updatedRec1.allocationStatus}, AllocationRecord verified.`
  );

  // TEST 9: Invoice status and outstanding updated after partial allocation
  const invA1Snap1 = await getDoc(doc(db, 'salesInvoices', invoiceA1.invoiceId));
  const invA1Data1 = invA1Snap1.data() as SalesInvoice;
  assertTest(
    invA1Data1.paymentStatus === 'PARTIALLY_PAID' &&
      invA1Data1.paidAmountPaise === 60000 &&
      invA1Data1.outstandingAmountPaise === 40000,
    'ALLOC-09',
    'Invoice updated to PARTIALLY_PAID with correct balances',
    `Invoice ${invA1Data1.invoiceNumber}: Status=${invA1Data1.paymentStatus}, Paid=₹${(invA1Data1.paidAmountPaise || 0) / 100}, Outstanding=₹${(invA1Data1.outstandingAmountPaise || 0) / 100}`
  );

  // TEST 10: Idempotent replay of allocation returns same result without duplicate deduction
  const idempReplayResult = await CustomerReceiptService.allocateCustomerReceipt(
    superAdminSession,
    receiptA1.receiptId,
    {
      allocations: [
        {
          invoiceId: invoiceA1.invoiceId,
          amountPaise: 60000,
        },
      ],
      idempotencyKey: allocIdempKey,
    }
  );
  assertTest(
    idempReplayResult.isIdempotentReplay === true &&
      idempReplayResult.receipt.allocatedAmountPaise === 60000 &&
      idempReplayResult.receipt.unallocatedAmountPaise === 60000,
    'ALLOC-10',
    'Duplicate idempotent allocation returns original result without duplicate deduction',
    `isIdempotentReplay=${idempReplayResult.isIdempotentReplay}, allocatedAmountPaise=${idempReplayResult.receipt.allocatedAmountPaise}`
  );

  // TEST 11: Multiple allocations against one receipt (Sequential allocation)
  // Allocate remaining ₹400 to Invoice A1 (clearing it to ₹0 outstanding)
  // Allocate ₹200 to Invoice A2 (reducing it to ₹300 outstanding)
  // Total additional allocated: ₹600, fully allocating Receipt A1!
  const allocResult2 = await CustomerReceiptService.allocateCustomerReceipt(superAdminSession, receiptA1.receiptId, {
    allocations: [
      {
        invoiceId: invoiceA1.invoiceId,
        amountPaise: 40000, // ₹400 remaining on Invoice A1
      },
      {
        invoiceId: invoiceA2.invoiceId,
        amountPaise: 20000, // ₹200 towards Invoice A2
      },
    ],
  });

  const fullyAllocatedRec = allocResult2.receipt;
  assertTest(
    allocResult2.success &&
      fullyAllocatedRec.allocatedAmountPaise === 120000 &&
      fullyAllocatedRec.unallocatedAmountPaise === 0 &&
      fullyAllocatedRec.allocationStatus === 'FULLY_ALLOCATED' &&
      fullyAllocatedRec.allocations.length === 3,
    'ALLOC-11',
    'Multiple allocations against one receipt until fully allocated',
    `Allocations count: ${fullyAllocatedRec.allocations.length}, Total allocated: ₹${(fullyAllocatedRec.allocatedAmountPaise || 0) / 100}, Unallocated: ₹${fullyAllocatedRec.unallocatedAmountPaise / 100}, Status: ${fullyAllocatedRec.allocationStatus}`
  );

  // TEST 12: Invoice A1 is now fully PAID (outstanding = 0)
  const invA1Snap2 = await getDoc(doc(db, 'salesInvoices', invoiceA1.invoiceId));
  const invA1Data2 = invA1Snap2.data() as SalesInvoice;
  assertTest(
    invA1Data2.paymentStatus === 'PAID' &&
      invA1Data2.paidAmountPaise === 100000 &&
      invA1Data2.outstandingAmountPaise === 0,
    'ALLOC-12',
    'Invoice A1 updated to PAID after multiple receipt allocations',
    `Invoice ${invA1Data2.invoiceNumber}: Status=${invA1Data2.paymentStatus}, Paid=₹${(invA1Data2.paidAmountPaise || 0) / 100}, Outstanding=₹${(invA1Data2.outstandingAmountPaise || 0) / 100}`
  );

  // TEST 13: Attempt to allocate against fully paid invoice rejected
  try {
    await CustomerReceiptService.allocateCustomerReceipt(superAdminSession, receiptA2.receiptId, {
      allocations: [
        {
          invoiceId: invoiceA1.invoiceId,
          amountPaise: 5000, // Invoice A1 has 0 balance!
        },
      ],
    });
    assertTest(false, 'ALLOC-13', 'Allocation against paid invoice rejected', 'Expected error when allocating against paid invoice.');
  } catch (err: any) {
    assertTest(
      err.message.includes('ALLOCATION_EXCEEDS_INVOICE_OUTSTANDING'),
      'ALLOC-13',
      'Allocation against paid invoice rejected',
      `Correctly rejected allocation on zero-balance invoice: ${err.message}`
    );
  }

  // TEST 14: Attempt to allocate against fully allocated receipt rejected
  try {
    await CustomerReceiptService.allocateCustomerReceipt(superAdminSession, receiptA1.receiptId, {
      allocations: [
        {
          invoiceId: invoiceA2.invoiceId,
          amountPaise: 10000,
        },
      ],
    });
    assertTest(false, 'ALLOC-14', 'Allocation on fully allocated receipt rejected', 'Expected error on fully allocated receipt.');
  } catch (err: any) {
    assertTest(
      err.message.includes('ALLOCATION_EXCEEDS_RECEIPT_AMOUNT'),
      'ALLOC-14',
      'Allocation on fully allocated receipt rejected',
      `Correctly rejected allocation on fully exhausted receipt: ${err.message}`
    );
  }

  // TEST 15: Retailer Self-Ledger outstanding balance after allocation
  // The ledger is strictly derived from double-entry journals (Account 1300 AR)
  // Invoices debited AR: ₹1,000 + ₹500 = ₹1,500
  // Receipts credited AR: ₹1,200 + ₹300 = ₹1,500
  // Net closing balance = ₹0.00
  const ledger = await PartyLedgerService.getCustomerLedger({
    customerId: retailerAId,
  });

  assertTest(
    ledger.success &&
      ledger.closingBalance === 0 &&
      ledger.periodDebit === 1500 &&
      ledger.periodCredit === 1500,
    'ALLOC-15',
    'Retailer self-ledger reflects double-entry source of truth with 0 net AR balance',
    `Customer: ${ledger.customer.shopName}, Total Debit (Invoices)=₹${ledger.periodDebit}, Total Credit (Receipts)=₹${ledger.periodCredit}, Closing Balance=₹${ledger.closingBalance}`
  );

  // TEST 16: Zero double-entry journal re-posting during allocation (Preserve Part 2A/2B behavior)
  // Receipts credit AR on POST. Allocation performs subledger matching and does NOT create extra journal lines.
  const receiptJournals = ledger.entries.filter((e) => e.documentType === 'CUSTOMER_RECEIPT');
  assertTest(
    receiptJournals.length === 2,
    'ALLOC-16',
    'Part 2A/2B behavior preserved: Exactly 2 receipt journals exist (no extra journals created by allocation)',
    `Receipt journals count: ${receiptJournals.length}, Total receipts credited: ₹${receiptJournals.reduce((s, e) => s + e.credit, 0)}`
  );

  // Summary
  console.log('\n======================================================================');
  console.log('PHASE 5.7 PART 2C TEST SUITE SUMMARY');
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
    console.log('✅ ALL PHASE 5.7 PART 2C TESTS PASSED SUCCESSFULLY');
  }

  return { total, passed, failed, blocked };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCustomerReceiptAllocationTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}
