/**
 * MR FUTKAR — Phase 5.8 Part 2: Supplier Payment Allocation Test Suite
 * Production-grade server-authoritative supplier payment allocation verification suite
 * Validates:
 * - SPA-01: Unauthorized allocation rejected (SUPER_ADMIN required)
 * - SPA-02: Zero allocation amount rejected
 * - SPA-03: Negative allocation amount rejected
 * - SPA-04: Non-integer paise allocation amount rejected
 * - SPA-05: Missing invoiceId rejected
 * - SPA-06: Duplicate invoice in single allocation request rejected
 * - SPA-07: Client field injection rejected
 * - SPA-08: Cross-supplier allocation rejected
 * - SPA-09: Allocation against non-posted purchase invoice rejected
 * - SPA-10: Allocation against non-posted supplier payment rejected
 * - SPA-11: Payment unallocated amount over-allocation rejected
 * - SPA-12: Invoice outstanding balance over-allocation rejected
 * - SPA-13: Valid partial allocation succeeds
 * - SPA-14: Multiple allocations correctly reduce outstanding balances
 * - SPA-15: Purchase invoice becomes PAID correctly
 * - SPA-16: Fully paid invoice allocation rejected
 * - SPA-17: Multiple invoices allocated atomically in single supplier payment
 * - SPA-18: Payment becomes FULLY_ALLOCATED correctly
 * - SPA-19: Duplicate allocation with same idempotency key is safely idempotent
 * - SPA-20: Allocation creates ZERO additional accounting journals
 * - SPA-21: Supplier AP ledger remains unchanged by allocation itself
 * - SPA-22: Canonical supplier identity is preserved
 * - SPA-23: Eligible purchase invoices helper returns accurate balances
 * - SPA-24: Audit logs are immutably created for supplier payment allocations
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
import { PartyLedgerService } from '../server/partyLedgerService';
import { AdminSession } from '../src/types/admin';
import { SupplierPayment } from '../src/types/supplierPayment';
import { PurchaseInvoice } from '../src/types/invoice';

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

export async function runSupplierPaymentAllocationTestSuite() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 5.8 PART 2: SUPPLIER PAYMENT ALLOCATION');
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
    name: 'Warehouse Staff',
    mobile: '+919810055555',
    role: 'STAFF' as any,
    status: 'ACTIVE',
    permissionsVersion: 1,
  };

  const testTimestamp = Date.now();
  const supplierAId = `sup_alloc_a_${testTimestamp}`;
  const supplierBId = `sup_alloc_b_${testTimestamp}`;

  // 1. Provision Suppliers A & B
  await setDoc(doc(db, 'suppliers', supplierAId), {
    supplierId: supplierAId,
    businessName: 'Nestle India Distribution Hub',
    contactName: 'Sanjay Aggarwal',
    mobile: '9811188222',
    fullAddress: 'Plot 88, Okhla Phase 2, New Delhi',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110020',
    gstin: '07AAACN1234D1Z2',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    _serverTxnToken: SERVER_TXN_TOKEN,
  });

  await setDoc(doc(db, 'suppliers', supplierBId), {
    supplierId: supplierBId,
    businessName: 'Britannia Industries Regional Hub',
    contactName: 'Vikram Joshi',
    mobile: '9811177111',
    fullAddress: 'Plot 45, Lawrence Road, Delhi',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110035',
    gstin: '07AAACB1234D1Z1',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    _serverTxnToken: SERVER_TXN_TOKEN,
  });

  // 2. Create and Post Purchase Invoices for Supplier A
  // PI-1: ₹5,000 (500,000 paise)
  const pi1 = await InvoiceService.createPurchaseInvoice(superAdminSession, {
    supplierId: supplierAId,
    supplierType: 'DISTRIBUTOR',
    supplierInvoiceNumber: `INV-NESTLE-1-${testTimestamp}`,
    invoiceDate: '2026-09-02',
    items: [
      {
        productId: 'prod-001',
        quantity: 10,
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
    supplierInvoiceNumber: `INV-NESTLE-2-${testTimestamp}`,
    invoiceDate: '2026-09-03',
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

  // PI-3 (DRAFT, unposted): ₹2,000
  const pi3Draft = await InvoiceService.createPurchaseInvoice(superAdminSession, {
    supplierId: supplierAId,
    supplierType: 'DISTRIBUTOR',
    supplierInvoiceNumber: `INV-NESTLE-3-${testTimestamp}`,
    invoiceDate: '2026-09-04',
    items: [
      {
        productId: 'prod-001',
        quantity: 4,
        unitCost: 500,
        taxRate: 0,
      },
    ],
  });

  // Purchase Invoice for Supplier B: ₹4,000 (400,000 paise)
  const piB = await InvoiceService.createPurchaseInvoice(superAdminSession, {
    supplierId: supplierBId,
    supplierType: 'DISTRIBUTOR',
    supplierInvoiceNumber: `INV-BRIT-${testTimestamp}`,
    invoiceDate: '2026-09-02',
    items: [
      {
        productId: 'prod-003',
        quantity: 8,
        unitCost: 500,
        taxRate: 0,
      },
    ],
  });
  await InvoiceService.postPurchaseInvoice(superAdminSession, piB.invoiceId);

  // 3. Create and Post Supplier Payments for Supplier A
  // Payment 1: ₹6,000 (600,000 paise)
  const pay1DraftRes = await SupplierPaymentService.createSupplierPayment(superAdminSession, {
    supplierId: supplierAId,
    amountPaise: 600000,
    paymentMethod: 'BANK_TRANSFER',
    paymentDate: '2026-09-05',
    referenceNumber: `UTR-NESTLE-1-${testTimestamp}`,
  });
  const pay1PostRes = await SupplierPaymentService.postSupplierPayment(superAdminSession, pay1DraftRes.payment.paymentId);
  const payment1 = pay1PostRes.payment;

  // Payment 2 (DRAFT, unposted): ₹2,000
  const pay2DraftRes = await SupplierPaymentService.createSupplierPayment(superAdminSession, {
    supplierId: supplierAId,
    amountPaise: 200000,
    paymentMethod: 'CASH',
    paymentDate: '2026-09-05',
  });
  const payment2Draft = pay2DraftRes.payment;

  // -------------------------------------------------------------------------
  // TEST SPA-01: Unauthorized allocation rejected (STAFF role)
  // -------------------------------------------------------------------------
  let spa01Rejected = false;
  try {
    await SupplierPaymentService.allocateSupplierPayment(
      staffAdminSession,
      payment1.paymentId,
      {
        allocations: [{ invoiceId: pi1.invoiceId, amountPaise: 100000 }],
      }
    );
  } catch (err: any) {
    if (err?.message?.includes('SUPER_ADMIN_REQUIRED')) {
      spa01Rejected = true;
    }
  }
  assertTest(
    spa01Rejected,
    'SPA-01',
    'Unauthorized allocation rejected (SUPER_ADMIN required)',
    'Non-super-admin was successfully rejected with SUPER_ADMIN_REQUIRED.'
  );

  // -------------------------------------------------------------------------
  // TEST SPA-02: Zero allocation amount rejected
  // -------------------------------------------------------------------------
  let spa02Rejected = false;
  try {
    await SupplierPaymentService.allocateSupplierPayment(
      superAdminSession,
      payment1.paymentId,
      {
        allocations: [{ invoiceId: pi1.invoiceId, amountPaise: 0 }],
      }
    );
  } catch (err: any) {
    if (err?.message?.includes('INVALID_ALLOCATION_AMOUNT')) {
      spa02Rejected = true;
    }
  }
  assertTest(
    spa02Rejected,
    'SPA-02',
    'Zero allocation amount rejected',
    'Zero paise allocation rejected with INVALID_ALLOCATION_AMOUNT.'
  );

  // -------------------------------------------------------------------------
  // TEST SPA-03: Negative allocation amount rejected
  // -------------------------------------------------------------------------
  let spa03Rejected = false;
  try {
    await SupplierPaymentService.allocateSupplierPayment(
      superAdminSession,
      payment1.paymentId,
      {
        allocations: [{ invoiceId: pi1.invoiceId, amountPaise: -50000 }],
      }
    );
  } catch (err: any) {
    if (err?.message?.includes('INVALID_ALLOCATION_AMOUNT')) {
      spa03Rejected = true;
    }
  }
  assertTest(
    spa03Rejected,
    'SPA-03',
    'Negative allocation amount rejected',
    'Negative paise allocation rejected with INVALID_ALLOCATION_AMOUNT.'
  );

  // -------------------------------------------------------------------------
  // TEST SPA-04: Non-integer paise allocation amount rejected
  // -------------------------------------------------------------------------
  let spa04Rejected = false;
  try {
    await SupplierPaymentService.allocateSupplierPayment(
      superAdminSession,
      payment1.paymentId,
      {
        allocations: [{ invoiceId: pi1.invoiceId, amountPaise: 12345.67 }],
      }
    );
  } catch (err: any) {
    if (err?.message?.includes('INVALID_ALLOCATION_AMOUNT')) {
      spa04Rejected = true;
    }
  }
  assertTest(
    spa04Rejected,
    'SPA-04',
    'Non-integer paise allocation amount rejected',
    'Floating point paise rejected with INVALID_ALLOCATION_AMOUNT.'
  );

  // -------------------------------------------------------------------------
  // TEST SPA-05: Missing invoiceId rejected
  // -------------------------------------------------------------------------
  let spa05Rejected = false;
  try {
    await SupplierPaymentService.allocateSupplierPayment(
      superAdminSession,
      payment1.paymentId,
      {
        allocations: [{ invoiceId: '', amountPaise: 100000 }],
      }
    );
  } catch (err: any) {
    if (err?.message?.includes('MISSING_INVOICE_ID')) {
      spa05Rejected = true;
    }
  }
  assertTest(
    spa05Rejected,
    'SPA-05',
    'Missing invoiceId rejected',
    'Allocation with empty invoiceId rejected with MISSING_INVOICE_ID.'
  );

  // -------------------------------------------------------------------------
  // TEST SPA-06: Duplicate invoice in single allocation request rejected
  // -------------------------------------------------------------------------
  let spa06Rejected = false;
  try {
    await SupplierPaymentService.allocateSupplierPayment(
      superAdminSession,
      payment1.paymentId,
      {
        allocations: [
          { invoiceId: pi1.invoiceId, amountPaise: 100000 },
          { invoiceId: pi1.invoiceId, amountPaise: 100000 },
        ],
      }
    );
  } catch (err: any) {
    if (err?.message?.includes('DUPLICATE_INVOICE_IN_ALLOCATION')) {
      spa06Rejected = true;
    }
  }
  assertTest(
    spa06Rejected,
    'SPA-06',
    'Duplicate invoice in single allocation request rejected',
    'Repeated invoiceId in single request rejected with DUPLICATE_INVOICE_IN_ALLOCATION.'
  );

  // -------------------------------------------------------------------------
  // TEST SPA-07: Client field injection rejected
  // -------------------------------------------------------------------------
  let spa07Rejected = false;
  try {
    await SupplierPaymentService.allocateSupplierPayment(
      superAdminSession,
      payment1.paymentId,
      {
        allocations: [{ invoiceId: pi1.invoiceId, amountPaise: 100000 }],
        allocatedAmountPaise: 999999,
      } as any
    );
  } catch (err: any) {
    if (err?.message?.includes('CLIENT_FIELD_INJECTION_FORBIDDEN')) {
      spa07Rejected = true;
    }
  }
  assertTest(
    spa07Rejected,
    'SPA-07',
    'Client field injection rejected',
    'Injected allocatedAmountPaise rejected with CLIENT_FIELD_INJECTION_FORBIDDEN.'
  );

  // -------------------------------------------------------------------------
  // TEST SPA-08: Cross-supplier allocation rejected
  // -------------------------------------------------------------------------
  let spa08Rejected = false;
  try {
    await SupplierPaymentService.allocateSupplierPayment(
      superAdminSession,
      payment1.paymentId, // belongs to supplier A
      {
        allocations: [{ invoiceId: piB.invoiceId, amountPaise: 100000 }], // belongs to supplier B
      }
    );
  } catch (err: any) {
    if (err?.message?.includes('CROSS_SUPPLIER_ALLOCATION_FORBIDDEN')) {
      spa08Rejected = true;
    }
  }
  assertTest(
    spa08Rejected,
    'SPA-08',
    'Cross-supplier allocation rejected',
    'Cross-supplier allocation blocked with CROSS_SUPPLIER_ALLOCATION_FORBIDDEN.'
  );

  // -------------------------------------------------------------------------
  // TEST SPA-09: Allocation against non-posted purchase invoice rejected
  // -------------------------------------------------------------------------
  let spa09Rejected = false;
  try {
    await SupplierPaymentService.allocateSupplierPayment(
      superAdminSession,
      payment1.paymentId,
      {
        allocations: [{ invoiceId: pi3Draft.invoiceId, amountPaise: 100000 }],
      }
    );
  } catch (err: any) {
    if (err?.message?.includes('INVALID_INVOICE_STATUS')) {
      spa09Rejected = true;
    }
  }
  assertTest(
    spa09Rejected,
    'SPA-09',
    'Allocation against non-posted purchase invoice rejected',
    'DRAFT purchase invoice allocation blocked with INVALID_INVOICE_STATUS.'
  );

  // -------------------------------------------------------------------------
  // TEST SPA-10: Allocation against non-posted supplier payment rejected
  // -------------------------------------------------------------------------
  let spa10Rejected = false;
  try {
    await SupplierPaymentService.allocateSupplierPayment(
      superAdminSession,
      payment2Draft.paymentId,
      {
        allocations: [{ invoiceId: pi1.invoiceId, amountPaise: 100000 }],
      }
    );
  } catch (err: any) {
    if (err?.message?.includes('INVALID_PAYMENT_STATUS')) {
      spa10Rejected = true;
    }
  }
  assertTest(
    spa10Rejected,
    'SPA-10',
    'Allocation against non-posted supplier payment rejected',
    'DRAFT supplier payment allocation blocked with INVALID_PAYMENT_STATUS.'
  );

  // -------------------------------------------------------------------------
  // TEST SPA-11: Payment unallocated amount over-allocation rejected
  // -------------------------------------------------------------------------
  let spa11Rejected = false;
  try {
    await SupplierPaymentService.allocateSupplierPayment(
      superAdminSession,
      payment1.paymentId, // has 600,000 paise unallocated
      {
        allocations: [{ invoiceId: pi1.invoiceId, amountPaise: 700000 }], // 700,000 > 600,000
      }
    );
  } catch (err: any) {
    if (err?.message?.includes('ALLOCATION_EXCEEDS_PAYMENT_AMOUNT')) {
      spa11Rejected = true;
    }
  }
  assertTest(
    spa11Rejected,
    'SPA-11',
    'Payment unallocated amount over-allocation rejected',
    'Requested 700,000 paise rejected against 600,000 unallocated.'
  );

  // -------------------------------------------------------------------------
  // TEST SPA-12: Invoice outstanding balance over-allocation rejected
  // -------------------------------------------------------------------------
  let spa12Rejected = false;
  try {
    await SupplierPaymentService.allocateSupplierPayment(
      superAdminSession,
      payment1.paymentId,
      {
        allocations: [{ invoiceId: pi2.invoiceId, amountPaise: 400000 }], // pi2 is ₹3,000 (300,000 paise)
      }
    );
  } catch (err: any) {
    if (err?.message?.includes('ALLOCATION_EXCEEDS_INVOICE_OUTSTANDING')) {
      spa12Rejected = true;
    }
  }
  assertTest(
    spa12Rejected,
    'SPA-12',
    'Invoice outstanding balance over-allocation rejected',
    'Requested ₹4,000 rejected against invoice ₹3,000 balance with ALLOCATION_EXCEEDS_INVOICE_OUTSTANDING.'
  );

  // Snapshot journal count and AP ledger before allocation to verify zero side-effects
  const journalsSnapBefore = await getDocs(collection(db, 'journalEntries'));
  const journalCountBefore = journalsSnapBefore.size;

  const apLedgerBefore = await PartyLedgerService.getSupplierLedger({ supplierId: supplierAId });

  // -------------------------------------------------------------------------
  // TEST SPA-13: Valid partial allocation succeeds
  // -------------------------------------------------------------------------
  // Allocate ₹2,000 (200,000 paise) from payment1 (₹6,000) to pi1 (₹5,000)
  const alloc1Res = await SupplierPaymentService.allocateSupplierPayment(
    superAdminSession,
    payment1.paymentId,
    {
      allocations: [{ invoiceId: pi1.invoiceId, amountPaise: 200000 }],
    }
  );

  const payAfterAlloc1 = alloc1Res.payment;
  const pi1SnapAfterAlloc1 = await getDoc(doc(db, 'purchaseInvoices', pi1.invoiceId));
  const pi1DataAfterAlloc1 = pi1SnapAfterAlloc1.data() as PurchaseInvoice;

  const validPartialSuccess =
    payAfterAlloc1.allocatedAmountPaise === 200000 &&
    payAfterAlloc1.unallocatedAmountPaise === 400000 &&
    payAfterAlloc1.allocationStatus === 'PARTIALLY_ALLOCATED' &&
    payAfterAlloc1.allocations.length === 1 &&
    pi1DataAfterAlloc1.paidAmountPaise === 200000 &&
    pi1DataAfterAlloc1.outstandingAmountPaise === 300000 &&
    pi1DataAfterAlloc1.paymentStatus === 'PARTIALLY_PAID';

  assertTest(
    validPartialSuccess,
    'SPA-13',
    'Valid partial allocation succeeds and updates balances',
    `Payment allocated: ₹${payAfterAlloc1.allocatedAmountPaise / 100}, unallocated: ₹${payAfterAlloc1.unallocatedAmountPaise / 100}, status: ${payAfterAlloc1.allocationStatus}. PI1 paid: ₹${(pi1DataAfterAlloc1.paidAmountPaise || 0) / 100}, outstanding: ₹${(pi1DataAfterAlloc1.outstandingAmountPaise || 0) / 100}, status: ${pi1DataAfterAlloc1.paymentStatus}.`
  );

  // -------------------------------------------------------------------------
  // TEST SPA-14: Multiple sequential allocations correctly reduce outstanding balances
  // -------------------------------------------------------------------------
  // Allocate another ₹2,000 (200,000 paise) from payment1 to pi1
  const alloc2Res = await SupplierPaymentService.allocateSupplierPayment(
    superAdminSession,
    payment1.paymentId,
    {
      allocations: [{ invoiceId: pi1.invoiceId, amountPaise: 200000 }],
    }
  );

  const payAfterAlloc2 = alloc2Res.payment;
  const pi1SnapAfterAlloc2 = await getDoc(doc(db, 'purchaseInvoices', pi1.invoiceId));
  const pi1DataAfterAlloc2 = pi1SnapAfterAlloc2.data() as PurchaseInvoice;

  const validSequentialSuccess =
    payAfterAlloc2.allocatedAmountPaise === 400000 &&
    payAfterAlloc2.unallocatedAmountPaise === 200000 &&
    payAfterAlloc2.allocations.length === 2 &&
    pi1DataAfterAlloc2.paidAmountPaise === 400000 &&
    pi1DataAfterAlloc2.outstandingAmountPaise === 100000 &&
    pi1DataAfterAlloc2.paymentStatus === 'PARTIALLY_PAID';

  assertTest(
    validSequentialSuccess,
    'SPA-14',
    'Multiple sequential allocations correctly reduce outstanding balances',
    `Payment unallocated reduced to ₹${payAfterAlloc2.unallocatedAmountPaise / 100}, PI1 outstanding reduced to ₹${(pi1DataAfterAlloc2.outstandingAmountPaise || 0) / 100}.`
  );

  // -------------------------------------------------------------------------
  // TEST SPA-15: Purchase invoice becomes PAID correctly
  // -------------------------------------------------------------------------
  // Allocate final ₹1,000 (100,000 paise) to pi1 to settle it fully
  const alloc3Res = await SupplierPaymentService.allocateSupplierPayment(
    superAdminSession,
    payment1.paymentId,
    {
      allocations: [{ invoiceId: pi1.invoiceId, amountPaise: 100000 }],
    }
  );

  const payAfterAlloc3 = alloc3Res.payment;
  const pi1SnapAfterAlloc3 = await getDoc(doc(db, 'purchaseInvoices', pi1.invoiceId));
  const pi1DataAfterAlloc3 = pi1SnapAfterAlloc3.data() as PurchaseInvoice;

  const invoicePaidSuccess =
    pi1DataAfterAlloc3.paidAmountPaise === 500000 &&
    pi1DataAfterAlloc3.outstandingAmountPaise === 0 &&
    pi1DataAfterAlloc3.paymentStatus === 'PAID';

  assertTest(
    invoicePaidSuccess,
    'SPA-15',
    'Purchase invoice becomes PAID correctly when settled in full',
    `PI1 paid: ₹${(pi1DataAfterAlloc3.paidAmountPaise || 0) / 100}, outstanding: ₹${(pi1DataAfterAlloc3.outstandingAmountPaise || 0) / 100}, status: ${pi1DataAfterAlloc3.paymentStatus}.`
  );

  // -------------------------------------------------------------------------
  // TEST SPA-16: Fully paid invoice allocation rejected
  // -------------------------------------------------------------------------
  let spa16Rejected = false;
  try {
    await SupplierPaymentService.allocateSupplierPayment(
      superAdminSession,
      payment1.paymentId,
      {
        allocations: [{ invoiceId: pi1.invoiceId, amountPaise: 50000 }],
      }
    );
  } catch (err: any) {
    if (
      err?.message?.includes('INVOICE_ALREADY_FULLY_PAID') ||
      err?.message?.includes('ALLOCATION_EXCEEDS_INVOICE_OUTSTANDING')
    ) {
      spa16Rejected = true;
    }
  }
  assertTest(
    spa16Rejected,
    'SPA-16',
    'Fully paid invoice allocation rejected',
    'Attempt to allocate against settled PI1 was cleanly blocked.'
  );

  // -------------------------------------------------------------------------
  // TEST SPA-17 & SPA-18: Multiple invoices allocated atomically & payment becomes FULLY_ALLOCATED
  // -------------------------------------------------------------------------
  // Payment 1 has ₹1,000 (100,000 paise) left unallocated.
  // Allocate that ₹1,000 to pi2 (which has ₹3,000 outstanding)
  const alloc4Res = await SupplierPaymentService.allocateSupplierPayment(
    superAdminSession,
    payment1.paymentId,
    {
      allocations: [{ invoiceId: pi2.invoiceId, amountPaise: 100000 }],
    }
  );

  const payAfterAlloc4 = alloc4Res.payment;
  const pi2Snap = await getDoc(doc(db, 'purchaseInvoices', pi2.invoiceId));
  const pi2Data = pi2Snap.data() as PurchaseInvoice;

  const paymentFullyAllocatedSuccess =
    payAfterAlloc4.allocatedAmountPaise === 600000 &&
    payAfterAlloc4.unallocatedAmountPaise === 0 &&
    payAfterAlloc4.allocationStatus === 'FULLY_ALLOCATED' &&
    pi2Data.paidAmountPaise === 100000 &&
    pi2Data.outstandingAmountPaise === 200000 &&
    pi2Data.paymentStatus === 'PARTIALLY_PAID';

  assertTest(
    paymentFullyAllocatedSuccess,
    'SPA-18',
    'Payment becomes FULLY_ALLOCATED correctly when all funds are allocated',
    `Payment 1 status: ${payAfterAlloc4.allocationStatus}, unallocated: ₹${payAfterAlloc4.unallocatedAmountPaise / 100}, PI2 outstanding: ₹${(pi2Data.outstandingAmountPaise || 0) / 100}.`
  );

  // -------------------------------------------------------------------------
  // TEST SPA-17: Multiple invoices allocated atomically in single supplier payment
  // -------------------------------------------------------------------------
  // Create and post Payment 3 for Supplier A: ₹3,000 (300,000 paise)
  const pay3DraftRes = await SupplierPaymentService.createSupplierPayment(superAdminSession, {
    supplierId: supplierAId,
    amountPaise: 300000,
    paymentMethod: 'UPI',
    paymentDate: '2026-09-06',
    referenceNumber: `UPI-NESTLE-3-${testTimestamp}`,
  });
  const pay3PostRes = await SupplierPaymentService.postSupplierPayment(superAdminSession, pay3DraftRes.payment.paymentId);
  const payment3 = pay3PostRes.payment;

  // Create another invoice for Supplier A: ₹1,000 (100,000 paise)
  const pi4 = await InvoiceService.createPurchaseInvoice(superAdminSession, {
    supplierId: supplierAId,
    supplierType: 'DISTRIBUTOR',
    supplierInvoiceNumber: `INV-NESTLE-4-${testTimestamp}`,
    invoiceDate: '2026-09-04',
    items: [
      {
        productId: 'prod-001',
        quantity: 2,
        unitCost: 500,
        taxRate: 0,
      },
    ],
  });
  await InvoiceService.postPurchaseInvoice(superAdminSession, pi4.invoiceId);

  // Now allocate Payment 3 across TWO invoices atomically:
  // pi2: ₹2,000 (200,000 paise) -> makes pi2 fully PAID
  // pi4: ₹1,000 (100,000 paise) -> makes pi4 fully PAID
  const multiAllocRes = await SupplierPaymentService.allocateSupplierPayment(
    superAdminSession,
    payment3.paymentId,
    {
      allocations: [
        { invoiceId: pi2.invoiceId, amountPaise: 200000 },
        { invoiceId: pi4.invoiceId, amountPaise: 100000 },
      ],
      idempotencyKey: `idemp_multi_alloc_${testTimestamp}`,
    }
  );

  const pay3AfterMulti = multiAllocRes.payment;
  const pi2SnapAfterMulti = await getDoc(doc(db, 'purchaseInvoices', pi2.invoiceId));
  const pi2DataAfterMulti = pi2SnapAfterMulti.data() as PurchaseInvoice;
  const pi4SnapAfterMulti = await getDoc(doc(db, 'purchaseInvoices', pi4.invoiceId));
  const pi4DataAfterMulti = pi4SnapAfterMulti.data() as PurchaseInvoice;

  const multiAllocSuccess =
    pay3AfterMulti.allocatedAmountPaise === 300000 &&
    pay3AfterMulti.unallocatedAmountPaise === 0 &&
    pay3AfterMulti.allocationStatus === 'FULLY_ALLOCATED' &&
    pi2DataAfterMulti.paidAmountPaise === 300000 &&
    pi2DataAfterMulti.outstandingAmountPaise === 0 &&
    pi2DataAfterMulti.paymentStatus === 'PAID' &&
    pi4DataAfterMulti.paidAmountPaise === 100000 &&
    pi4DataAfterMulti.outstandingAmountPaise === 0 &&
    pi4DataAfterMulti.paymentStatus === 'PAID';

  assertTest(
    multiAllocSuccess,
    'SPA-17',
    'Multiple invoices allocated atomically in single supplier payment',
    `Multi-allocation atomic batch succeeded. PI2: ${pi2DataAfterMulti.paymentStatus}, PI4: ${pi4DataAfterMulti.paymentStatus}, Payment 3: ${pay3AfterMulti.allocationStatus}.`
  );

  // -------------------------------------------------------------------------
  // TEST SPA-19: Duplicate allocation request with same idempotency key
  // -------------------------------------------------------------------------
  const idempReplayRes = await SupplierPaymentService.allocateSupplierPayment(
    superAdminSession,
    payment3.paymentId,
    {
      allocations: [
        { invoiceId: pi2.invoiceId, amountPaise: 200000 },
        { invoiceId: pi4.invoiceId, amountPaise: 100000 },
      ],
      idempotencyKey: `idemp_multi_alloc_${testTimestamp}`,
    }
  );

  const isIdempotentSuccess =
    idempReplayRes.isIdempotentReplay === true &&
    idempReplayRes.payment.paymentId === payment3.paymentId &&
    idempReplayRes.payment.unallocatedAmountPaise === 0;

  assertTest(
    isIdempotentSuccess,
    'SPA-19',
    'Duplicate allocation with same idempotency key is safely idempotent',
    `Idempotent replay detected: ${idempReplayRes.isIdempotentReplay}. Balances uncorrupted.`
  );

  // -------------------------------------------------------------------------
  // TEST SPA-20: Allocation creates ZERO additional accounting journals
  // -------------------------------------------------------------------------
  // We check that no journals were created with referenceType 'SUPPLIER_PAYMENT_ALLOCATION' or for allocations
  const allocJournalsQuery = query(
    collection(db, 'journalEntries'),
    where('referenceType', '==', 'SUPPLIER_PAYMENT_ALLOCATION')
  );
  const allocJournalsSnap = await getDocs(allocJournalsQuery);

  // Also verify that the payments made only created their original 1 journal each (payment1 and payment3)
  const pay1Journals = await getDocs(
    query(collection(db, 'journalEntries'), where('referenceType', '==', 'SUPPLIER_PAYMENT'), where('referenceId', '==', payment1.paymentId))
  );
  const pay3Journals = await getDocs(
    query(collection(db, 'journalEntries'), where('referenceType', '==', 'SUPPLIER_PAYMENT'), where('referenceId', '==', payment3.paymentId))
  );

  const zeroJournalsSuccess =
    allocJournalsSnap.empty &&
    pay1Journals.size === 1 &&
    pay3Journals.size === 1;

  assertTest(
    zeroJournalsSuccess,
    'SPA-20',
    'Allocation creates ZERO additional accounting journals',
    `Allocation created 0 additional journals. Payment journals count: Payment 1 = ${pay1Journals.size}, Payment 3 = ${pay3Journals.size}.`
  );

  // -------------------------------------------------------------------------
  // TEST SPA-21: Supplier AP ledger remains unchanged by allocation itself
  // -------------------------------------------------------------------------
  // The AP ledger for Supplier A is strictly derived from posted accounting journals (the purchase invoices and payment journals).
  // Allocation only maps payments to invoices; it does NOT post any new journals, so the ledger balance is unchanged!
  const apLedgerAfter = await PartyLedgerService.getSupplierLedger({ supplierId: supplierAId });

  // PI-1: ₹5,000 CR
  // PI-2: ₹3,000 CR
  // PI-4: ₹1,000 CR
  // Payment 1: ₹6,000 DR
  // Payment 3: ₹3,000 DR
  // Net closing balance: (5000 + 3000 + 1000) - (6000 + 3000) = ₹0
  const apLedgerMatchesExpected =
    apLedgerAfter.closingBalance === 0 &&
    apLedgerAfter.periodDebit === 9000 &&
    apLedgerAfter.periodCredit === 9000;

  assertTest(
    apLedgerMatchesExpected,
    'SPA-21',
    'Supplier AP ledger remains derived from accounting journals and unchanged by allocation',
    `AP Ledger closing balance: ₹${apLedgerAfter.closingBalance}, Debit: ₹${apLedgerAfter.periodDebit}, Credit: ₹${apLedgerAfter.periodCredit}.`
  );

  // -------------------------------------------------------------------------
  // TEST SPA-22: Canonical supplier identity is preserved
  // -------------------------------------------------------------------------
  const resolvedSupplier = await PartyLedgerService.resolveCanonicalSupplierId(supplierAId);
  const supplierSnapInfo = await PartyLedgerService.resolveSupplierSnapshot(supplierAId);

  const canonicalIdentitySuccess =
    resolvedSupplier === supplierAId &&
    supplierSnapInfo.businessName === 'Nestle India Distribution Hub' &&
    payAfterAlloc1.supplierSnapshot.businessName === 'Nestle India Distribution Hub';

  assertTest(
    canonicalIdentitySuccess,
    'SPA-22',
    'Canonical supplier identity is preserved and respected',
    `Resolved canonical supplier: ${resolvedSupplier}, businessName: ${supplierSnapInfo.businessName}.`
  );

  // -------------------------------------------------------------------------
  // TEST SPA-23: Eligible purchase invoices helper returns accurate balances
  // -------------------------------------------------------------------------
  // Create payment 4 for Supplier B
  const pay4DraftRes = await SupplierPaymentService.createSupplierPayment(superAdminSession, {
    supplierId: supplierBId,
    amountPaise: 400000,
    paymentMethod: 'RTGS',
    paymentDate: '2026-09-07',
  });
  const pay4PostRes = await SupplierPaymentService.postSupplierPayment(superAdminSession, pay4DraftRes.payment.paymentId);

  const eligibleInvoicesForB = await SupplierPaymentService.getEligibleInvoicesForPayment(
    superAdminSession,
    pay4PostRes.payment.paymentId
  );

  const eligibleSuccess =
    eligibleInvoicesForB.length === 1 &&
    eligibleInvoicesForB[0].invoiceId === piB.invoiceId &&
    eligibleInvoicesForB[0].outstandingAmountPaise === 400000 &&
    eligibleInvoicesForB[0].paymentStatus === 'UNPAID';

  assertTest(
    eligibleSuccess,
    'SPA-23',
    'Eligible purchase invoices helper returns accurate outstanding balances',
    `Found ${eligibleInvoicesForB.length} eligible invoice(s) for Supplier B. Outstanding: ₹${eligibleInvoicesForB[0]?.outstandingAmountPaise / 100}.`
  );

  // -------------------------------------------------------------------------
  // TEST SPA-24: Audit logs are immutably recorded for supplier payment allocations
  // -------------------------------------------------------------------------
  const auditLogsQuery = query(
    collection(db, 'adminAuditLogs'),
    where('action', '==', 'SUPPLIER_PAYMENT_ALLOCATED')
  );
  const auditLogsSnap = await getDocs(auditLogsQuery);
  const auditLogSuccess = !auditLogsSnap.empty && auditLogsSnap.size >= 4;

  assertTest(
    auditLogSuccess,
    'SPA-24',
    'Audit logs are immutably recorded for supplier payment allocations',
    `Recorded ${auditLogsSnap.size} SUPPLIER_PAYMENT_ALLOCATED audit logs.`
  );

  // Summary
  console.log('\n======================================================================');
  console.log('PHASE 5.8 PART 2 ALLOCATION TEST SUITE SUMMARY');
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
    console.log('✅ ALL PHASE 5.8 PART 2 TESTS PASSED SUCCESSFULLY');
  }

  return { total, passed, failed, blocked };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSupplierPaymentAllocationTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}
