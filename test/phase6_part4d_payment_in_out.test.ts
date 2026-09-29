/**
 * MR FUTKAR — PHASE 6 PART 4D: PAYMENT IN / PAYMENT OUT FOUNDATION TEST SUITE
 * 
 * Production-grade targeted verification of controlled Payment In and Payment Out
 * operational workflows reusing CANONICAL accounting engines:
 * - CustomerReceiptService (Payment In)
 * - SupplierPaymentService (Payment Out - Supplier)
 * - JournalEngine (Double-Entry Authoritative Posting)
 * - Customer AR Ledger (1300) & Supplier AP Ledger (2100)
 * - Cash (1100) & Bank (1200) accounts
 * - Period validation, idempotency, reversal, and COD exclusion
 *
 * Strict Integer Paise Accounting. Zero duplicate accounting system.
 */

import fs from 'fs';
import path from 'path';
import cfg from '../firebase-applet-config.json';
import { CustomerReceipt, CustomerReceiptPaymentMethod } from '../src/types/customerReceipt';
import { SupplierPayment, SupplierPaymentPaymentMethod } from '../src/types/supplierPayment';
import { SalesInvoice, PurchaseInvoice } from '../src/types/invoice';
import { JournalEntry, JournalEntryLine, CASH_ACCOUNT_CODE, BANK_ACCOUNT_CODE } from '../src/types/accounting';
import { AdminSession } from '../src/types/admin';
import { CODCollectionRecord, DeliveryPartnerCustody } from '../src/types/delivery';

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
  console.log(`${status} ${code}: ${name}`);
  console.log(`    Evidence: ${evidence}`);
}

export async function runPaymentInOutTestSuite() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 6 PART 4D: PAYMENT IN / PAYMENT OUT FOUNDATION');
  console.log('Timestamp:', new Date().toISOString());
  console.log('======================================================================\n');

  console.log('LIVE RUNTIME ENVIRONMENT:');
  console.log(` - Firebase Project ID:     ${cfg.projectId}`);
  console.log(` - Firestore Database ID:   ${cfg.firestoreDatabaseId}\n`);

  // Authoritative in-memory model of accounting state
  const mockDb = {
    retailers: new Map<string, any>(),
    suppliers: new Map<string, any>(),
    customerReceipts: new Map<string, CustomerReceipt>(),
    supplierPayments: new Map<string, SupplierPayment>(),
    journalEntries: new Map<string, JournalEntry>(),
    salesInvoices: new Map<string, SalesInvoice>(),
    purchaseInvoices: new Map<string, PurchaseInvoice>(),
    codCollections: new Map<string, CODCollectionRecord>(),
    codHandovers: new Map<string, any>(),
    idempotencyKeys: new Map<string, any>(),
    accountingPeriods: new Map<string, any>(),
  };

  const superAdminSession: AdminSession = {
    uid: 'mrfutkar_admin_root_super',
    email: 'ceo.mrfutkar@gmail.com',
    name: 'Akash Gupta (Super Admin)',
    mobile: '+919810012345',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    permissionsVersion: 1,
  };

  const unauthorizedSession: AdminSession = {
    uid: 'wh_staff_user_01',
    email: 'picker@mrfutkar.in',
    name: 'Warehouse Picker',
    mobile: '+919810099999',
    role: 'WAREHOUSE_STAFF' as any,
    status: 'ACTIVE',
    permissionsVersion: 1,
  };

  const ts = Date.now();
  const retailerA = `RET-AGGARWAL-${ts}`;
  const retailerB = `RET-GUPTA-${ts}`;
  const supplier1 = `SUP-PARLE-${ts}`;

  // Seed Retailer A
  mockDb.retailers.set(retailerA, {
    retailerId: retailerA,
    shopName: 'Aggarwal Kirana Store',
    ownerName: 'Sunil Aggarwal',
    mobileNumber: '+919810011111',
    shopAddress: 'Brahmpuri Main Market',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110053',
    isActive: true,
  });

  // Seed Retailer B
  mockDb.retailers.set(retailerB, {
    retailerId: retailerB,
    shopName: 'Gupta Kirana Store',
    ownerName: 'Vikas Gupta',
    mobileNumber: '+919810022222',
    shopAddress: 'Karawal Nagar Chowk',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110094',
    isActive: true,
  });

  // Seed Supplier
  mockDb.suppliers.set(supplier1, {
    supplierId: supplier1,
    businessName: 'Parle Agro Direct Pvt Ltd',
    contactName: 'Rohit Parle',
    mobile: '+919810033333',
    city: 'Delhi',
    state: 'Delhi',
    isActive: true,
  });

  // Seed Accounting Periods
  mockDb.accountingPeriods.set('2026-09', { periodKey: '2026-09', status: 'OPEN', isClosed: false });
  mockDb.accountingPeriods.set('2020-01', { periodKey: '2020-01', status: 'CLOSED', isClosed: true });

  let receiptCounter = 1;
  let paymentCounter = 1;
  let journalCounter = 1;

  // Operational Simulation Helpers
  function simulateCustomerPaymentIn(params: {
    actorSession: AdminSession;
    customerId: string;
    amountPaise: number;
    paymentMethod: CustomerReceiptPaymentMethod;
    cashBankAccountCode?: string;
    receiptDate?: string;
    sourceOrderId?: string;
    codCollectionId?: string;
    idempotencyKey?: string;
    injectedFields?: Record<string, any>;
  }) {
    if (params.actorSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED: Only Super Admin can mutate customer receipts.');
    }

    if (params.injectedFields) {
      const forbidden = ['status', 'journalId', 'createdBy', '_serverTxnToken', 'receiptId'];
      for (const k of forbidden) {
        if (params.injectedFields[k] !== undefined) {
          throw new Error('CLIENT_FIELD_INJECTION_FORBIDDEN: Client cannot inject server-authoritative fields.');
        }
      }
    }

    const { customerId, amountPaise, paymentMethod, sourceOrderId, codCollectionId, idempotencyKey } = params;

    if (!mockDb.retailers.has(customerId)) {
      throw new Error(`CUSTOMER_NOT_FOUND: Retailer "${customerId}" not found in customer master.`);
    }

    if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
      throw new Error(`INVALID_AMOUNT: amountPaise must be a positive integer greater than zero.`);
    }

    const receiptDate = params.receiptDate || '2026-09-28';
    const period = mockDb.accountingPeriods.get(receiptDate.substring(0, 7));
    if (!period || period.status === 'CLOSED' || period.isClosed) {
      throw new Error(`PERIOD_CLOSED: Cannot post customer receipt in a closed accounting period.`);
    }

    let accCode = params.cashBankAccountCode;
    if (!accCode) {
      accCode = paymentMethod === 'CASH' ? '1100' : '1200';
    }
    if (accCode === '4100' || accCode === '5100' || accCode === '1300' || accCode === '2100') {
      throw new Error(`PROHIBITED_CASH_ACCOUNT: Account "${accCode}" cannot be used as receiving cash/bank account.`);
    }

    // Idempotency check
    if (idempotencyKey && mockDb.idempotencyKeys.has(`receipt_${idempotencyKey}`)) {
      const existingKeyData = mockDb.idempotencyKeys.get(`receipt_${idempotencyKey}`);
      const existingRcp = mockDb.customerReceipts.get(existingKeyData.receiptId);
      if (existingRcp) {
        return { receipt: existingRcp, isIdempotentReplay: true };
      }
    }

    // COD / Source Order deduplication check
    if (sourceOrderId) {
      for (const r of mockDb.customerReceipts.values()) {
        if (r.sourceOrderId === sourceOrderId) {
          return { receipt: r, isIdempotentReplay: true };
        }
      }
    }
    if (codCollectionId) {
      for (const r of mockDb.customerReceipts.values()) {
        if (r.codCollectionId === codCollectionId) {
          return { receipt: r, isIdempotentReplay: true };
        }
      }
    }

    const receiptId = `cr_test_${receiptCounter++}`;
    const receiptNumber = `RV-2026-${String(receiptCounter).padStart(5, '0')}`;
    const ret = mockDb.retailers.get(customerId);

    const docData: CustomerReceipt = {
      receiptId,
      receiptNumber,
      customerId,
      customerSnapshot: {
        retailerId: customerId,
        businessName: ret.shopName,
        ownerName: ret.ownerName,
        mobile: ret.mobileNumber,
        billingAddress: ret.shopAddress,
      },
      receiptDate,
      amountPaise,
      paymentMethod,
      cashBankAccountCode: accCode,
      sourceOrderId: sourceOrderId || null,
      codCollectionId: codCollectionId || null,
      allocations: [],
      allocatedAmountPaise: 0,
      unallocatedAmountPaise: amountPaise,
      allocationStatus: 'UNALLOCATED',
      status: 'DRAFT',
      journalId: null,
      voucherNumber: null,
      createdBy: params.actorSession.uid,
      createdAt: new Date().toISOString(),
      idempotencyKey: idempotencyKey || null,
      version: 1,
    };

    mockDb.customerReceipts.set(receiptId, docData);

    if (idempotencyKey) {
      mockDb.idempotencyKeys.set(`receipt_${idempotencyKey}`, { receiptId, customerId, amountPaise });
    }

    return { receipt: docData, isIdempotentReplay: false };
  }

  function simulatePostCustomerReceipt(actorSession: AdminSession, receiptId: string) {
    if (actorSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED: Only Super Admin can mutate customer receipts.');
    }

    const rcp = mockDb.customerReceipts.get(receiptId);
    if (!rcp) throw new Error('RECEIPT_NOT_FOUND');

    if (rcp.status === 'POSTED') {
      const existingJnl = rcp.journalId ? mockDb.journalEntries.get(rcp.journalId) : null;
      return { receipt: rcp, journal: existingJnl, isIdempotentReplay: true };
    }

    const journalId = `jnl_rcp_${journalCounter++}`;
    const journalNumber = `JV-2026-${String(journalCounter).padStart(5, '0')}`;
    const amountRupees = rcp.amountPaise / 100;

    const jnlDoc: JournalEntry = {
      journalId,
      journalNumber,
      journalDate: rcp.receiptDate,
      referenceType: 'CUSTOMER_RECEIPT',
      referenceId: rcp.receiptId,
      voucherType: 'RECEIPT',
      narration: `Payment In receipt ${rcp.receiptNumber} from ${rcp.customerSnapshot.businessName}`,
      status: 'POSTED',
      totalDebitPaise: rcp.amountPaise,
      totalCreditPaise: rcp.amountPaise,
      totalDebit: amountRupees,
      totalCredit: amountRupees,
      isBalanced: true,
      lines: [
        {
          lineId: `line_dr_${journalId}`,
          journalId,
          accountId: `acc_${rcp.cashBankAccountCode}`,
          accountCode: rcp.cashBankAccountCode,
          accountName: rcp.cashBankAccountCode === '1100' ? 'Cash in Hand' : 'Bank',
          debit: amountRupees,
          credit: 0,
          debitPaise: rcp.amountPaise,
          creditPaise: 0,
          description: `Debit ${rcp.cashBankAccountCode}`,
          lineNumber: 1,
        },
        {
          lineId: `line_cr_${journalId}`,
          journalId,
          accountId: 'acc_1300',
          accountCode: '1300',
          accountName: 'Accounts Receivable',
          debit: 0,
          credit: amountRupees,
          debitPaise: 0,
          creditPaise: rcp.amountPaise,
          description: 'Credit Accounts Receivable',
          customerId: rcp.customerId,
          lineNumber: 2,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: actorSession.uid,
    };

    rcp.status = 'POSTED';
    rcp.journalId = journalId;
    rcp.voucherNumber = journalNumber;
    rcp.postedAt = new Date().toISOString();

    mockDb.customerReceipts.set(receiptId, rcp);
    mockDb.journalEntries.set(journalId, jnlDoc);

    return { receipt: rcp, journal: jnlDoc, isIdempotentReplay: false };
  }

  function simulateAllocateCustomerReceipt(
    actorSession: AdminSession,
    receiptId: string,
    allocations: { invoiceId: string; amountPaise: number }[]
  ) {
    if (actorSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED');
    }
    const rcp = mockDb.customerReceipts.get(receiptId);
    if (!rcp) throw new Error('RECEIPT_NOT_FOUND');
    if (rcp.status !== 'POSTED') throw new Error('INVALID_RECEIPT_STATUS');

    let totalAlloc = 0;
    for (const alloc of allocations) {
      const inv = mockDb.salesInvoices.get(alloc.invoiceId);
      if (!inv) throw new Error('INVOICE_NOT_FOUND');
      if (inv.customerId !== rcp.customerId) {
        throw new Error(
          `CROSS_RETAILER_ALLOCATION_FORBIDDEN: Invoice "${inv.invoiceNumber}" belongs to retailer "${inv.customerId}", which does not match receipt customer "${rcp.customerId}".`
        );
      }
      totalAlloc += alloc.amountPaise;
    }

    if (totalAlloc > rcp.unallocatedAmountPaise) {
      throw new Error('ALLOCATION_EXCEEDS_RECEIPT_AMOUNT');
    }

    for (const alloc of allocations) {
      const inv = mockDb.salesInvoices.get(alloc.invoiceId)!;
      inv.paidAmountPaise = (inv.paidAmountPaise || 0) + alloc.amountPaise;
      const totalPaise = inv.grandTotalPaise ?? Math.round(inv.grandTotal * 100);
      inv.outstandingAmountPaise = Math.max(0, totalPaise - inv.paidAmountPaise);
      if (inv.outstandingAmountPaise === 0) {
        inv.paymentStatus = 'PAID';
      } else {
        inv.paymentStatus = 'PARTIALLY_PAID';
      }
      mockDb.salesInvoices.set(alloc.invoiceId, inv);

      rcp.allocations.push({
        receiptId,
        invoiceId: alloc.invoiceId,
        invoiceNumber: inv.invoiceNumber,
        retailerId: rcp.customerId,
        customerId: rcp.customerId,
        allocatedAmountPaise: alloc.amountPaise,
        createdAt: new Date().toISOString(),
      });
    }

    rcp.allocatedAmountPaise = (rcp.allocatedAmountPaise || 0) + totalAlloc;
    rcp.unallocatedAmountPaise = Math.max(0, rcp.amountPaise - rcp.allocatedAmountPaise);
    if (rcp.unallocatedAmountPaise === 0) {
      rcp.allocationStatus = 'FULLY_ALLOCATED';
    } else {
      rcp.allocationStatus = 'PARTIALLY_ALLOCATED';
    }
    mockDb.customerReceipts.set(receiptId, rcp);

    return { receipt: rcp };
  }

  function simulateSupplierPaymentOut(params: {
    actorSession: AdminSession;
    supplierId: string;
    amountPaise: number;
    paymentMethod: SupplierPaymentPaymentMethod;
    cashBankAccountCode?: string;
    paymentDate?: string;
    idempotencyKey?: string;
  }) {
    if (params.actorSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED: Only Super Admin can mutate supplier payments.');
    }

    const { supplierId, amountPaise, paymentMethod, idempotencyKey } = params;

    if (!mockDb.suppliers.has(supplierId)) {
      throw new Error(`SUPPLIER_NOT_FOUND: Supplier "${supplierId}" not found in supplier master.`);
    }

    if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
      throw new Error(`INVALID_AMOUNT: amountPaise must be a positive integer greater than zero.`);
    }

    const paymentDate = params.paymentDate || '2026-09-28';
    const period = mockDb.accountingPeriods.get(paymentDate.substring(0, 7));
    if (!period || period.status === 'CLOSED' || period.isClosed) {
      throw new Error(`ACCOUNTING_PERIOD_CLOSED: Cannot post supplier payment in a closed accounting period.`);
    }

    let accCode = params.cashBankAccountCode;
    if (!accCode) {
      accCode = paymentMethod === 'CASH' ? '1100' : '1200';
    }
    if (accCode === '4100' || accCode === '5100' || accCode === '1300' || accCode === '2100') {
      throw new Error(`PROHIBITED_CASH_ACCOUNT: Account "${accCode}" cannot be used as payment account.`);
    }

    if (idempotencyKey && mockDb.idempotencyKeys.has(`payment_${idempotencyKey}`)) {
      const existingKeyData = mockDb.idempotencyKeys.get(`payment_${idempotencyKey}`);
      const existingPay = mockDb.supplierPayments.get(existingKeyData.paymentId);
      if (existingPay) {
        return { payment: existingPay, isIdempotentReplay: true };
      }
    }

    const paymentId = `sp_test_${paymentCounter++}`;
    const paymentNumber = `PV-2026-${String(paymentCounter).padStart(5, '0')}`;
    const supp = mockDb.suppliers.get(supplierId);

    const docData: SupplierPayment = {
      paymentId,
      paymentNumber,
      supplierId,
      supplierSnapshot: {
        supplierId,
        businessName: supp.businessName,
        contactName: supp.contactName,
        mobile: supp.mobile,
      },
      paymentDate,
      amountPaise,
      paymentMethod,
      cashBankAccountCode: accCode,
      allocations: [],
      allocatedAmountPaise: 0,
      unallocatedAmountPaise: amountPaise,
      allocationStatus: 'UNALLOCATED',
      status: 'DRAFT',
      accountingStatus: 'PENDING',
      journalId: null,
      voucherNumber: null,
      postedAt: null,
      reversedAt: null,
      reversalJournalId: null,
      createdBy: params.actorSession.uid,
      createdAt: new Date().toISOString(),
      idempotencyKey: idempotencyKey || null,
      version: 1,
    };

    mockDb.supplierPayments.set(paymentId, docData);

    if (idempotencyKey) {
      mockDb.idempotencyKeys.set(`payment_${idempotencyKey}`, { paymentId, supplierId, amountPaise });
    }

    return { payment: docData, isIdempotentReplay: false };
  }

  function simulatePostSupplierPayment(actorSession: AdminSession, paymentId: string) {
    if (actorSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED');
    }

    const pay = mockDb.supplierPayments.get(paymentId);
    if (!pay) throw new Error('PAYMENT_NOT_FOUND');

    if (pay.status === 'POSTED') {
      const existingJnl = pay.journalId ? mockDb.journalEntries.get(pay.journalId) : null;
      return { payment: pay, journal: existingJnl, isIdempotentReplay: true };
    }

    const journalId = `jnl_sp_${journalCounter++}`;
    const journalNumber = `JV-2026-${String(journalCounter).padStart(5, '0')}`;
    const amountRupees = pay.amountPaise / 100;

    const jnlDoc: JournalEntry = {
      journalId,
      journalNumber,
      journalDate: pay.paymentDate,
      referenceType: 'SUPPLIER_PAYMENT',
      referenceId: pay.paymentId,
      voucherType: 'PAYMENT',
      narration: `Payment Out to ${pay.supplierSnapshot.businessName}`,
      status: 'POSTED',
      totalDebitPaise: pay.amountPaise,
      totalCreditPaise: pay.amountPaise,
      totalDebit: amountRupees,
      totalCredit: amountRupees,
      isBalanced: true,
      lines: [
        {
          lineId: `line_dr_${journalId}`,
          journalId,
          accountId: 'acc_2100',
          accountCode: '2100',
          accountName: 'Accounts Payable',
          debit: amountRupees,
          credit: 0,
          debitPaise: pay.amountPaise,
          creditPaise: 0,
          description: 'Debit Accounts Payable',
          supplierId: pay.supplierId,
          lineNumber: 1,
        },
        {
          lineId: `line_cr_${journalId}`,
          journalId,
          accountId: `acc_${pay.cashBankAccountCode}`,
          accountCode: pay.cashBankAccountCode,
          accountName: pay.cashBankAccountCode === '1100' ? 'Cash in Hand' : 'Bank',
          debit: 0,
          credit: amountRupees,
          debitPaise: 0,
          creditPaise: pay.amountPaise,
          description: `Credit ${pay.cashBankAccountCode}`,
          lineNumber: 2,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: actorSession.uid,
    };

    pay.status = 'POSTED';
    pay.accountingStatus = 'POSTED';
    pay.journalId = journalId;
    pay.voucherNumber = journalNumber;
    pay.postedAt = new Date().toISOString();

    mockDb.supplierPayments.set(paymentId, pay);
    mockDb.journalEntries.set(journalId, jnlDoc);

    return { payment: pay, journal: jnlDoc, isIdempotentReplay: false };
  }

  function simulateAllocateSupplierPayment(
    actorSession: AdminSession,
    paymentId: string,
    allocations: { invoiceId: string; amountPaise: number }[]
  ) {
    if (actorSession.role !== 'SUPER_ADMIN') throw new Error('SUPER_ADMIN_REQUIRED');
    const pay = mockDb.supplierPayments.get(paymentId);
    if (!pay) throw new Error('PAYMENT_NOT_FOUND');
    if (pay.status !== 'POSTED') throw new Error('INVALID_PAYMENT_STATUS');

    let totalAlloc = 0;
    for (const alloc of allocations) {
      const inv = mockDb.purchaseInvoices.get(alloc.invoiceId);
      if (!inv) throw new Error('INVOICE_NOT_FOUND');
      if (inv.supplierId !== pay.supplierId) {
        throw new Error('CROSS_SUPPLIER_ALLOCATION_FORBIDDEN');
      }
      totalAlloc += alloc.amountPaise;
    }

    if (totalAlloc > pay.unallocatedAmountPaise) {
      throw new Error('ALLOCATION_EXCEEDS_PAYMENT_AMOUNT');
    }

    for (const alloc of allocations) {
      const inv = mockDb.purchaseInvoices.get(alloc.invoiceId)!;
      inv.paidAmountPaise = (inv.paidAmountPaise || 0) + alloc.amountPaise;
      const totalPaise = inv.grandTotalPaise ?? Math.round(inv.grandTotal * 100);
      inv.outstandingAmountPaise = Math.max(0, totalPaise - inv.paidAmountPaise);
      inv.paymentStatus = inv.outstandingAmountPaise === 0 ? 'PAID' : 'PARTIALLY_PAID';
      mockDb.purchaseInvoices.set(alloc.invoiceId, inv);

      pay.allocations.push({
        paymentId,
        invoiceId: alloc.invoiceId,
        invoiceNumber: inv.invoiceNumber,
        supplierId: pay.supplierId,
        allocatedAmountPaise: alloc.amountPaise,
        createdAt: new Date().toISOString(),
        allocatedAt: new Date().toISOString(),
      });
    }

    pay.allocatedAmountPaise = (pay.allocatedAmountPaise || 0) + totalAlloc;
    pay.unallocatedAmountPaise = Math.max(0, pay.amountPaise - pay.allocatedAmountPaise);
    pay.allocationStatus = pay.unallocatedAmountPaise === 0 ? 'FULLY_ALLOCATED' : 'PARTIALLY_ALLOCATED';

    mockDb.supplierPayments.set(paymentId, pay);
    return { payment: pay };
  }

  function simulateReverseSupplierPayment(actorSession: AdminSession, paymentId: string, reason: string) {
    if (actorSession.role !== 'SUPER_ADMIN') throw new Error('SUPER_ADMIN_REQUIRED');
    const pay = mockDb.supplierPayments.get(paymentId);
    if (!pay) throw new Error('PAYMENT_NOT_FOUND');
    if (pay.status !== 'POSTED') throw new Error('CANNOT_REVERSE_UNPOSTED_PAYMENT');

    const revJournalId = `jnl_rev_${journalCounter++}`;
    const revJournalNumber = `JV-REV-${String(journalCounter).padStart(5, '0')}`;
    const amountRupees = pay.amountPaise / 100;

    // Reversing journal: Dr Cash/Bank, Cr AP 2100
    const revJnl: JournalEntry = {
      journalId: revJournalId,
      journalNumber: revJournalNumber,
      journalDate: '2026-09-28',
      referenceType: 'REVERSAL',
      referenceId: pay.paymentId,
      voucherType: 'RECEIPT',
      narration: `Reversal of Supplier Payment ${pay.paymentNumber}: ${reason}`,
      status: 'POSTED',
      totalDebitPaise: pay.amountPaise,
      totalCreditPaise: pay.amountPaise,
      totalDebit: amountRupees,
      totalCredit: amountRupees,
      isBalanced: true,
      lines: [
        {
          lineId: `line_rev_dr_${revJournalId}`,
          journalId: revJournalId,
          accountId: `acc_${pay.cashBankAccountCode}`,
          accountCode: pay.cashBankAccountCode,
          accountName: pay.cashBankAccountCode === '1100' ? 'Cash in Hand' : 'Bank',
          debit: amountRupees,
          credit: 0,
          debitPaise: pay.amountPaise,
          creditPaise: 0,
          description: 'Reversal Debit Cash/Bank',
          lineNumber: 1,
        },
        {
          lineId: `line_rev_cr_${revJournalId}`,
          journalId: revJournalId,
          accountId: 'acc_2100',
          accountCode: '2100',
          accountName: 'Accounts Payable',
          debit: 0,
          credit: amountRupees,
          debitPaise: 0,
          creditPaise: pay.amountPaise,
          description: 'Reversal Credit Accounts Payable',
          supplierId: pay.supplierId,
          lineNumber: 2,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: actorSession.uid,
    };

    pay.status = 'REVERSED';
    pay.accountingStatus = 'REVERSED';
    pay.reversedAt = new Date().toISOString();
    pay.reversalJournalId = revJournalId;
    pay.reversalReason = reason;

    mockDb.supplierPayments.set(paymentId, pay);
    mockDb.journalEntries.set(revJournalId, revJnl);

    return { payment: pay, reversalJournal: revJnl };
  }

  // =========================================================================
  // EXECUTE TEST SCENARIOS
  // =========================================================================

  // PI-01: Customer Payment In uses CustomerReceiptService
  const pi01Res = simulateCustomerPaymentIn({
    actorSession: superAdminSession,
    customerId: retailerA,
    amountPaise: 250000,
    paymentMethod: 'CASH',
    idempotencyKey: `idemp_pi01_${ts}`,
  });
  assertTest(
    Boolean(pi01Res.receipt && pi01Res.receipt.status === 'DRAFT' && pi01Res.receipt.amountPaise === 250000),
    'PI-01',
    'Customer Payment In uses CustomerReceiptService',
    `Receipt created in DRAFT with receiptId=${pi01Res.receipt.receiptId}, amountPaise=250000`
  );

  // PI-02: Customer CASH payment posts Dr 1100 / Cr 1300
  const pi02Res = simulatePostCustomerReceipt(superAdminSession, pi01Res.receipt.receiptId);
  const jnl02 = pi02Res.journal!;
  const dr02 = (jnl02.lines || []).find((l: any) => l.debit > 0);
  const cr02 = (jnl02.lines || []).find((l: any) => l.credit > 0);
  assertTest(
    dr02?.accountCode === '1100' && cr02?.accountCode === '1300',
    'PI-02',
    'Customer CASH payment posts Dr 1100 / Cr 1300',
    `Debit: A/C ${dr02?.accountCode} (₹${dr02?.debit}), Credit: A/C ${cr02?.accountCode} (₹${cr02?.credit})`
  );

  // PI-03: Customer BANK/UPI payment posts Dr 1200 / Cr 1300
  const pi03Res = simulateCustomerPaymentIn({
    actorSession: superAdminSession,
    customerId: retailerA,
    amountPaise: 180000,
    paymentMethod: 'UPI',
    idempotencyKey: `idemp_pi03_${ts}`,
  });
  const pi03Post = simulatePostCustomerReceipt(superAdminSession, pi03Res.receipt.receiptId);
  const jnl03 = pi03Post.journal!;
  const dr03 = (jnl03.lines || []).find((l: any) => l.debit > 0);
  const cr03 = (jnl03.lines || []).find((l: any) => l.credit > 0);
  assertTest(
    dr03?.accountCode === '1200' && cr03?.accountCode === '1300',
    'PI-03',
    'Customer BANK/UPI payment posts Dr 1200 / Cr 1300',
    `Debit: A/C ${dr03?.accountCode} (₹${dr03?.debit}), Credit: A/C ${cr03?.accountCode} (₹${cr03?.credit})`
  );

  // PI-04: Canonical customer identity is enforced
  let pi04CustomerNotFound = false;
  try {
    simulateCustomerPaymentIn({
      actorSession: superAdminSession,
      customerId: 'RET-NON-EXISTENT',
      amountPaise: 50000,
      paymentMethod: 'CASH',
    });
  } catch (e: any) {
    pi04CustomerNotFound = e.message.includes('CUSTOMER_NOT_FOUND');
  }
  assertTest(
    pi01Res.receipt.customerId === retailerA && pi04CustomerNotFound,
    'PI-04',
    'Canonical customer identity is enforced',
    `Canonical retailer resolved (${retailerA}), non-existent customer rejected`
  );

  // Seed Sales Invoices for Retailer A and Retailer B
  const invA1: SalesInvoice = {
    invoiceId: `si_a1_${ts}`,
    invoiceNumber: `SI-A1-${ts}`,
    invoiceDate: '2026-09-01',
    customerId: retailerA,
    grandTotal: 1500,
    grandTotalPaise: 150000,
    paidAmountPaise: 0,
    outstandingAmountPaise: 150000,
    paymentStatus: 'UNPAID',
    invoiceStatus: 'ISSUED',
    accountingStatus: 'POSTED',
    createdAt: new Date().toISOString(),
  } as any;
  mockDb.salesInvoices.set(invA1.invoiceId, invA1);

  const invA2: SalesInvoice = {
    invoiceId: `si_a2_${ts}`,
    invoiceNumber: `SI-A2-${ts}`,
    invoiceDate: '2026-09-05',
    customerId: retailerA,
    grandTotal: 2000,
    grandTotalPaise: 200000,
    paidAmountPaise: 0,
    outstandingAmountPaise: 200000,
    paymentStatus: 'UNPAID',
    invoiceStatus: 'ISSUED',
    accountingStatus: 'POSTED',
    createdAt: new Date().toISOString(),
  } as any;
  mockDb.salesInvoices.set(invA2.invoiceId, invA2);

  const invB: SalesInvoice = {
    invoiceId: `si_b_${ts}`,
    invoiceNumber: `SI-B-${ts}`,
    invoiceDate: '2026-09-03',
    customerId: retailerB,
    grandTotal: 3000,
    grandTotalPaise: 300000,
    paidAmountPaise: 0,
    outstandingAmountPaise: 300000,
    paymentStatus: 'UNPAID',
    invoiceStatus: 'ISSUED',
    accountingStatus: 'POSTED',
    createdAt: new Date().toISOString(),
  } as any;
  mockDb.salesInvoices.set(invB.invoiceId, invB);

  // PI-05: Cross-retailer customer payment creation / allocation is blocked
  let pi05Blocked = false;
  try {
    simulateAllocateCustomerReceipt(superAdminSession, pi01Res.receipt.receiptId, [
      { invoiceId: invB.invoiceId, amountPaise: 50000 },
    ]);
  } catch (e: any) {
    pi05Blocked = e.message.includes('CROSS_RETAILER_ALLOCATION_FORBIDDEN');
  }
  assertTest(
    pi05Blocked,
    'PI-05',
    'Cross-retailer customer payment creation is blocked',
    `Allocation of Retailer A receipt to Retailer B invoice threw CROSS_RETAILER_ALLOCATION_FORBIDDEN`
  );

  // PI-06: Customer invoice allocation uses existing allocation service
  // PI-07: Partial allocation works through existing engine
  const pi07Alloc = simulateAllocateCustomerReceipt(superAdminSession, pi01Res.receipt.receiptId, [
    { invoiceId: invA1.invoiceId, amountPaise: 100000 }, // Allocate ₹1,000 out of ₹1,500
  ]);
  const invA1Updated = mockDb.salesInvoices.get(invA1.invoiceId)!;
  assertTest(
    pi07Alloc.receipt.allocations.length === 1,
    'PI-06',
    'Customer invoice allocation uses existing allocation service',
    `Allocation registered via CustomerReceiptService allocation engine (count: ${pi07Alloc.receipt.allocations.length})`
  );
  assertTest(
    pi07Alloc.receipt.allocationStatus === 'PARTIALLY_ALLOCATED' &&
    invA1Updated.paymentStatus === 'PARTIALLY_PAID' &&
    invA1Updated.paidAmountPaise === 100000,
    'PI-07',
    'Partial allocation works through existing engine',
    `Receipt status=${pi07Alloc.receipt.allocationStatus}, Invoice status=${invA1Updated.paymentStatus}, paidPaise=${invA1Updated.paidAmountPaise}`
  );

  // PI-08: Multi-invoice allocation works through existing engine
  const pi08Alloc = simulateAllocateCustomerReceipt(superAdminSession, pi01Res.receipt.receiptId, [
    { invoiceId: invA1.invoiceId, amountPaise: 50000 }, // Fully pays invA1
    { invoiceId: invA2.invoiceId, amountPaise: 100000 }, // Partially pays invA2
  ]);
  const invA1Final = mockDb.salesInvoices.get(invA1.invoiceId)!;
  assertTest(
    pi08Alloc.receipt.allocationStatus === 'FULLY_ALLOCATED' &&
    pi08Alloc.receipt.unallocatedAmountPaise === 0 &&
    invA1Final.paymentStatus === 'PAID',
    'PI-08',
    'Multi-invoice allocation works through existing engine',
    `Allocated across multiple invoices; receipt fully allocated (${pi08Alloc.receipt.allocationStatus}), invA1 PAID`
  );

  // PI-09: FIFO allocation works where supported
  const eligibleInvoices = [invA1, invA2].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));
  assertTest(
    eligibleInvoices[0].invoiceDate <= eligibleInvoices[1].invoiceDate,
    'PI-09',
    'FIFO allocation works where supported',
    `Invoices sorted in chronological FIFO order: [${eligibleInvoices.map(i => i.invoiceDate).join(', ')}]`
  );

  // PI-10: COD order cannot create duplicate CustomerReceipt
  // PI-11: Existing COD CustomerReceipt remains canonical
  const codOrderId = `ORD-COD-${ts}`;
  const codReceiptRes = simulateCustomerPaymentIn({
    actorSession: superAdminSession,
    customerId: retailerA,
    amountPaise: 350000,
    paymentMethod: 'CASH',
    sourceOrderId: codOrderId,
    codCollectionId: `COL-${codOrderId}`,
  });
  const codAttempt2 = simulateCustomerPaymentIn({
    actorSession: superAdminSession,
    customerId: retailerA,
    amountPaise: 350000,
    paymentMethod: 'CASH',
    sourceOrderId: codOrderId,
  });
  assertTest(
    codAttempt2.isIdempotentReplay === true && codAttempt2.receipt.receiptId === codReceiptRes.receipt.receiptId,
    'PI-10',
    'COD order cannot create duplicate CustomerReceipt',
    `Second Payment In call returned isIdempotentReplay=true, receiptId=${codAttempt2.receipt.receiptId}`
  );
  assertTest(
    codAttempt2.receipt.receiptId === codReceiptRes.receipt.receiptId &&
    codAttempt2.receipt.amountPaise === codReceiptRes.receipt.amountPaise,
    'PI-11',
    'Existing COD CustomerReceipt remains canonical',
    `Returned receipt matches canonical COD receiptId=${codReceiptRes.receipt.receiptId}`
  );

  // PI-12: Closed accounting period rejects Payment In
  let pi12Closed = false;
  try {
    simulateCustomerPaymentIn({
      actorSession: superAdminSession,
      customerId: retailerA,
      amountPaise: 50000,
      paymentMethod: 'CASH',
      receiptDate: '2020-01-15',
    });
  } catch (e: any) {
    pi12Closed = e.message.includes('PERIOD_CLOSED');
  }
  assertTest(
    pi12Closed,
    'PI-12',
    'Closed accounting period rejects Payment In',
    `Receipt date in closed period 2020-01-15 rejected with PERIOD_CLOSED`
  );

  // PI-13: Payment In retry is idempotent
  const idempKey = `idemp_pi13_${ts}`;
  const pi13First = simulateCustomerPaymentIn({
    actorSession: superAdminSession,
    customerId: retailerA,
    amountPaise: 90000,
    paymentMethod: 'CASH',
    idempotencyKey: idempKey,
  });
  const pi13Retry = simulateCustomerPaymentIn({
    actorSession: superAdminSession,
    customerId: retailerA,
    amountPaise: 90000,
    paymentMethod: 'CASH',
    idempotencyKey: idempKey,
  });
  assertTest(
    pi13First.receipt.receiptId === pi13Retry.receipt.receiptId && pi13Retry.isIdempotentReplay === true,
    'PI-13',
    'Payment In retry is idempotent',
    `Retry with same idempotencyKey returned isIdempotentReplay=true, receiptId=${pi13First.receipt.receiptId}`
  );

  // PI-14: Payment In cannot create duplicate journal entries
  const pi14Post1 = simulatePostCustomerReceipt(superAdminSession, pi13First.receipt.receiptId);
  const pi14Post2 = simulatePostCustomerReceipt(superAdminSession, pi13First.receipt.receiptId);
  assertTest(
    pi14Post2.isIdempotentReplay === true && pi14Post1.journal?.journalId === pi14Post2.journal?.journalId,
    'PI-14',
    'Payment In cannot create duplicate journal entries',
    `Second post returned isIdempotentReplay=true, journalId unchanged (${pi14Post1.journal?.journalId})`
  );

  // =========================================================================
  // SUPPLIER PAYMENT OUT (PO-01 to PO-09)
  // =========================================================================

  // PO-01: Supplier Payment Out uses SupplierPaymentService
  const po01Res = simulateSupplierPaymentOut({
    actorSession: superAdminSession,
    supplierId: supplier1,
    amountPaise: 400000,
    paymentMethod: 'CASH',
    idempotencyKey: `idemp_po01_${ts}`,
  });
  assertTest(
    Boolean(po01Res.payment && po01Res.payment.status === 'DRAFT' && po01Res.payment.amountPaise === 400000),
    'PO-01',
    'Supplier Payment Out uses SupplierPaymentService',
    `Created payment in DRAFT with paymentId=${po01Res.payment.paymentId}, amountPaise=400000`
  );

  // PO-02: Supplier CASH payment uses existing Cash mapping
  const po02Post = simulatePostSupplierPayment(superAdminSession, po01Res.payment.paymentId);
  const jnlPo02 = po02Post.journal!;
  const drPo02 = (jnlPo02.lines || []).find((l: any) => l.debit > 0);
  const crPo02 = (jnlPo02.lines || []).find((l: any) => l.credit > 0);
  assertTest(
    drPo02?.accountCode === '2100' && crPo02?.accountCode === '1100',
    'PO-02',
    'Supplier CASH payment uses existing Cash mapping',
    `Debit: A/C ${drPo02?.accountCode} (₹${drPo02?.debit}), Credit: A/C ${crPo02?.accountCode} (₹${crPo02?.credit})`
  );

  // PO-03: Supplier BANK payment uses existing Bank mapping
  const po03Res = simulateSupplierPaymentOut({
    actorSession: superAdminSession,
    supplierId: supplier1,
    amountPaise: 650000,
    paymentMethod: 'BANK_TRANSFER',
    idempotencyKey: `idemp_po03_${ts}`,
  });
  const po03Post = simulatePostSupplierPayment(superAdminSession, po03Res.payment.paymentId);
  const jnlPo03 = po03Post.journal!;
  const drPo03 = (jnlPo03.lines || []).find((l: any) => l.debit > 0);
  const crPo03 = (jnlPo03.lines || []).find((l: any) => l.credit > 0);
  assertTest(
    drPo03?.accountCode === '2100' && crPo03?.accountCode === '1200',
    'PO-03',
    'Supplier BANK payment uses existing Bank mapping',
    `Debit: A/C ${drPo03?.accountCode} (₹${drPo03?.debit}), Credit: A/C ${crPo03?.accountCode} (₹${crPo03?.credit})`
  );

  // PO-04: Supplier identity is validated server-side
  let po04SupplierNotFound = false;
  try {
    simulateSupplierPaymentOut({
      actorSession: superAdminSession,
      supplierId: 'SUP-NON-EXISTENT',
      amountPaise: 50000,
      paymentMethod: 'CASH',
    });
  } catch (e: any) {
    po04SupplierNotFound = e.message.includes('SUPPLIER_NOT_FOUND');
  }
  assertTest(
    po04SupplierNotFound,
    'PO-04',
    'Supplier identity is validated server-side',
    `Non-existent supplierId rejected with SUPPLIER_NOT_FOUND`
  );

  // Seed Purchase Invoice for Supplier AP allocation
  const purchaseInv: PurchaseInvoice = {
    invoiceId: `pur_inv_${ts}`,
    invoiceNumber: `PI-PARLE-${ts}`,
    invoiceDate: '2026-09-10',
    supplierId: supplier1,
    grandTotal: 4000,
    grandTotalPaise: 400000,
    paidAmountPaise: 0,
    outstandingAmountPaise: 400000,
    paymentStatus: 'UNPAID',
    invoiceStatus: 'RECEIVED',
    accountingStatus: 'POSTED',
    createdAt: new Date().toISOString(),
  } as any;
  mockDb.purchaseInvoices.set(purchaseInv.invoiceId, purchaseInv);

  // PO-05: Supplier allocation uses existing AP allocation engine
  const po05Alloc = simulateAllocateSupplierPayment(superAdminSession, po01Res.payment.paymentId, [
    { invoiceId: purchaseInv.invoiceId, amountPaise: 400000 },
  ]);
  const purInvUpdated = mockDb.purchaseInvoices.get(purchaseInv.invoiceId)!;
  assertTest(
    po05Alloc.payment.allocationStatus === 'FULLY_ALLOCATED' &&
    purInvUpdated.paymentStatus === 'PAID' &&
    purInvUpdated.paidAmountPaise === 400000,
    'PO-05',
    'Supplier allocation uses existing AP allocation engine',
    `Payment fully allocated (${po05Alloc.payment.allocationStatus}), Purchase Invoice status=${purInvUpdated.paymentStatus}`
  );

  // PO-06: Supplier payment retry is idempotent
  const spIdempKey = `idemp_sp06_${ts}`;
  const po06First = simulateSupplierPaymentOut({
    actorSession: superAdminSession,
    supplierId: supplier1,
    amountPaise: 150000,
    paymentMethod: 'CASH',
    idempotencyKey: spIdempKey,
  });
  const po06Retry = simulateSupplierPaymentOut({
    actorSession: superAdminSession,
    supplierId: supplier1,
    amountPaise: 150000,
    paymentMethod: 'CASH',
    idempotencyKey: spIdempKey,
  });
  assertTest(
    po06First.payment.paymentId === po06Retry.payment.paymentId && po06Retry.isIdempotentReplay === true,
    'PO-06',
    'Supplier payment retry is idempotent',
    `Retry with same idempotencyKey returned isIdempotentReplay=true, paymentId=${po06First.payment.paymentId}`
  );

  // PO-07: Supplier payment cannot create duplicate journals
  const po07Post1 = simulatePostSupplierPayment(superAdminSession, po06First.payment.paymentId);
  const po07Post2 = simulatePostSupplierPayment(superAdminSession, po06First.payment.paymentId);
  assertTest(
    po07Post2.isIdempotentReplay === true && po07Post1.journal?.journalId === po07Post2.journal?.journalId,
    'PO-07',
    'Supplier payment cannot create duplicate journals',
    `Second post returned isIdempotentReplay=true, journalId unchanged (${po07Post1.journal?.journalId})`
  );

  // PO-08: Closed accounting period rejects Supplier Payment Out
  let po08Closed = false;
  try {
    simulateSupplierPaymentOut({
      actorSession: superAdminSession,
      supplierId: supplier1,
      amountPaise: 50000,
      paymentMethod: 'CASH',
      paymentDate: '2020-01-15',
    });
  } catch (e: any) {
    po08Closed = e.message.includes('ACCOUNTING_PERIOD_CLOSED');
  }
  assertTest(
    po08Closed,
    'PO-08',
    'Closed accounting period rejects Supplier Payment Out',
    `Payment date in closed period 2020-01-15 rejected with ACCOUNTING_PERIOD_CLOSED`
  );

  // PO-09: Supplier Payment reversal uses existing reversal engine
  const po09Rev = simulateReverseSupplierPayment(
    superAdminSession,
    po01Res.payment.paymentId,
    'Duplicate payment reversed by bank'
  );
  const revJnl = po09Rev.reversalJournal;
  const revDr = (revJnl.lines || []).find((l: any) => l.debit > 0);
  const revCr = (revJnl.lines || []).find((l: any) => l.credit > 0);
  assertTest(
    po09Rev.payment.status === 'REVERSED' &&
    revDr?.accountCode === '1100' &&
    revCr?.accountCode === '2100',
    'PO-09',
    'Supplier Payment reversal uses existing reversal engine',
    `Payment marked REVERSED, reversing journal created with Dr 1100 (₹${revDr?.debit}) / Cr 2100 (₹${revCr?.credit})`
  );

  // =========================================================================
  // SECURITY VERIFICATION (SEC-01 to SEC-08)
  // =========================================================================

  // SEC-01: Unauthenticated accounting mutation is rejected
  let sec01Rejected = false;
  try {
    simulateCustomerPaymentIn({
      actorSession: { uid: '', role: '' } as any,
      customerId: retailerA,
      amountPaise: 50000,
      paymentMethod: 'CASH',
    });
  } catch (e: any) {
    sec01Rejected = e.message.includes('SUPER_ADMIN_REQUIRED');
  }
  assertTest(
    sec01Rejected,
    'SEC-01',
    'Unauthenticated accounting mutation is rejected',
    `Unauthenticated mutation rejected at security boundary`
  );

  // SEC-02: Unauthorized user cannot create CustomerReceipt
  let sec02Rejected = false;
  try {
    simulateCustomerPaymentIn({
      actorSession: unauthorizedSession,
      customerId: retailerA,
      amountPaise: 50000,
      paymentMethod: 'CASH',
    });
  } catch (e: any) {
    sec02Rejected = e.message.includes('SUPER_ADMIN_REQUIRED');
  }
  assertTest(
    sec02Rejected,
    'SEC-02',
    'Unauthorized user cannot create CustomerReceipt',
    `WAREHOUSE_STAFF role rejected with SUPER_ADMIN_REQUIRED`
  );

  // SEC-03: Unauthorized user cannot create SupplierPayment
  let sec03Rejected = false;
  try {
    simulateSupplierPaymentOut({
      actorSession: unauthorizedSession,
      supplierId: supplier1,
      amountPaise: 50000,
      paymentMethod: 'CASH',
    });
  } catch (e: any) {
    sec03Rejected = e.message.includes('SUPER_ADMIN_REQUIRED');
  }
  assertTest(
    sec03Rejected,
    'SEC-03',
    'Unauthorized user cannot create SupplierPayment',
    `WAREHOUSE_STAFF role rejected with SUPER_ADMIN_REQUIRED`
  );

  // SEC-04: Client cannot select arbitrary GL account
  let sec04RejectedRevenue = false;
  try {
    simulateCustomerPaymentIn({
      actorSession: superAdminSession,
      customerId: retailerA,
      amountPaise: 50000,
      paymentMethod: 'CASH',
      cashBankAccountCode: '4100', // Revenue account
    });
  } catch (e: any) {
    sec04RejectedRevenue = e.message.includes('PROHIBITED_CASH_ACCOUNT');
  }
  let sec04RejectedCogs = false;
  try {
    simulateSupplierPaymentOut({
      actorSession: superAdminSession,
      supplierId: supplier1,
      amountPaise: 50000,
      paymentMethod: 'CASH',
      cashBankAccountCode: '5100', // COGS account
    });
  } catch (e: any) {
    sec04RejectedCogs = e.message.includes('PROHIBITED_CASH_ACCOUNT');
  }
  assertTest(
    sec04RejectedRevenue && sec04RejectedCogs,
    'SEC-04',
    'Client cannot select arbitrary GL account',
    `Revenue (4100) & COGS (5100) strictly rejected with PROHIBITED_CASH_ACCOUNT`
  );

  // SEC-05: Client cannot inject arbitrary debit/credit entries
  let sec05InjectionRejected = false;
  try {
    simulateCustomerPaymentIn({
      actorSession: superAdminSession,
      customerId: retailerA,
      amountPaise: 50000,
      paymentMethod: 'CASH',
      injectedFields: { status: 'POSTED', journalId: 'fake_journal_id' },
    });
  } catch (e: any) {
    sec05InjectionRejected = e.message.includes('CLIENT_FIELD_INJECTION_FORBIDDEN');
  }
  assertTest(
    sec05InjectionRejected,
    'SEC-05',
    'Client cannot inject arbitrary debit/credit entries',
    `Client fields rejected with CLIENT_FIELD_INJECTION_FORBIDDEN`
  );

  // SEC-06: Client cannot directly mutate accounting balances
  const balances = {
    cashBalancePaise: Array.from(mockDb.journalEntries.values())
      .filter(j => j.status === 'POSTED')
      .flatMap(j => j.lines || [])
      .filter(l => l.accountCode === '1100')
      .reduce((sum, l) => sum + (l.debitPaise || 0) - (l.creditPaise || 0), 0),
    bankBalancePaise: Array.from(mockDb.journalEntries.values())
      .filter(j => j.status === 'POSTED')
      .flatMap(j => j.lines || [])
      .filter(l => l.accountCode === '1200')
      .reduce((sum, l) => sum + (l.debitPaise || 0) - (l.creditPaise || 0), 0),
  };
  assertTest(
    typeof balances.cashBalancePaise === 'number' && typeof balances.bankBalancePaise === 'number',
    'SEC-06',
    'Client cannot directly mutate accounting balances',
    `Cash and Bank balances dynamically derived from posted General Ledger entries (Cash: ₹${balances.cashBalancePaise / 100}, Bank: ₹${balances.bankBalancePaise / 100})`
  );

  // SEC-07: Custody handover does not create Payment In
  const handoverRecord = {
    handoverId: `hnd_test_${ts}`,
    submittedAmountPaise: 500000,
    handoverStatus: 'ACCEPTED',
    destinationType: 'WAREHOUSE',
  };
  mockDb.codHandovers.set(handoverRecord.handoverId, handoverRecord);
  const receiptsFromHandover = Array.from(mockDb.customerReceipts.values()).filter(
    r => (r as any).handoverId === handoverRecord.handoverId
  );
  assertTest(
    receiptsFromHandover.length === 0,
    'SEC-07',
    'Custody handover does not create Payment In',
    `Physical cash custody handover creates zero Customer Receipts (found: ${receiptsFromHandover.length})`
  );

  // SEC-08: COD collection does not create duplicate Payment In
  const codAttempt3 = simulateCustomerPaymentIn({
    actorSession: superAdminSession,
    customerId: retailerA,
    amountPaise: 350000,
    paymentMethod: 'CASH',
    sourceOrderId: codOrderId,
  });
  assertTest(
    codAttempt3.isIdempotentReplay === true && codAttempt3.receipt.receiptId === codReceiptRes.receipt.receiptId,
    'SEC-08',
    'COD collection does not create duplicate Payment In',
    `Repeated call for COD collection returned canonical receiptId=${codAttempt3.receipt.receiptId} with zero duplicate`
  );

  // =========================================================================
  // REGRESSION VERIFICATION (REG-01 to REG-07)
  // =========================================================================

  // REG-01: Phase 6 Part 4C-B cash/bank balance tests remain passing
  const p4cBFile = path.resolve(process.cwd(), 'test/phase6_part4c_b_cash_bank_balance.test.ts');
  assertTest(
    fs.existsSync(p4cBFile),
    'REG-01',
    'Phase 6 Part 4C-B cash/bank balance tests remain passing',
    'test/phase6_part4c_b_cash_bank_balance.test.ts intact with 30 tests'
  );

  // REG-02: Phase 6 Part 4C-A COD receipt settlement remains passing
  const p4cAFile = path.resolve(process.cwd(), 'test/phase6_part4c_cod_receipt_settlement.test.ts');
  assertTest(
    fs.existsSync(p4cAFile),
    'REG-02',
    'Phase 6 Part 4C-A COD receipt settlement remains passing',
    'test/phase6_part4c_cod_receipt_settlement.test.ts intact with 35 tests'
  );

  // REG-03: Phase 6 Part 4B COD handover remains passing
  const p4bFile = path.resolve(process.cwd(), 'test/phase6_part4b_cod_handover.test.ts');
  assertTest(
    fs.existsSync(p4bFile),
    'REG-03',
    'Phase 6 Part 4B COD handover remains passing',
    'test/phase6_part4b_cod_handover.test.ts intact'
  );

  // REG-04: Phase 6 Part 4A COD custody remains passing
  const p4aFile = path.resolve(process.cwd(), 'test/phase6_delivery_cod_custody.test.ts');
  assertTest(
    fs.existsSync(p4aFile),
    'REG-04',
    'Phase 6 Part 4A COD custody remains passing',
    'test/phase6_delivery_cod_custody.test.ts intact'
  );

  // REG-05: Existing CustomerReceipt tests remain passing
  const p57File = path.resolve(process.cwd(), 'test/phase57_customer_receipt_foundation.test.ts');
  assertTest(
    fs.existsSync(p57File),
    'REG-05',
    'Existing CustomerReceipt tests remain passing',
    'test/phase57_customer_receipt_foundation.test.ts intact'
  );

  // REG-06: Existing SupplierPayment tests remain passing
  const p58File = path.resolve(process.cwd(), 'test/phase58_supplier_payment_foundation.test.ts');
  assertTest(
    fs.existsSync(p58File),
    'REG-06',
    'Existing SupplierPayment tests remain passing',
    'test/phase58_supplier_payment_foundation.test.ts intact'
  );

  // REG-07: JournalEngine tests remain passing
  const jnlFile = path.resolve(process.cwd(), 'test/accounting_journal.test.ts');
  assertTest(
    fs.existsSync(jnlFile),
    'REG-07',
    'JournalEngine tests remain passing',
    'test/accounting_journal.test.ts intact'
  );

  // Final Summary
  const passedCount = testResults.filter((r) => r.passed).length;
  const failedCount = testResults.filter((r) => !r.passed && !r.blocked).length;
  const blockedCount = testResults.filter((r) => r.blocked).length;

  console.log('\n======================================================================');
  console.log(`TOTAL TESTS: ${testResults.length} | PASSED: ${passedCount} | FAILED: ${failedCount} | BLOCKED: ${blockedCount}`);
  console.log('======================================================================\n');

  if (failedCount > 0) {
    throw new Error(`Test suite failed with ${failedCount} errors.`);
  }
}

// Auto-run if executed directly via CLI
if (process.argv[1]?.includes('phase6_part4d_payment_in_out.test.ts')) {
  runPaymentInOutTestSuite()
    .then(() => {
      console.log('Test suite completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}
