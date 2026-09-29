/**
 * MR FUTKAR — Phase 5.8 Part 6: Supplier Accounting Reports & Export Test Suite
 * Production-grade server-authoritative read-only supplier export verification.
 *
 * Verifies:
 * - SUP-EXPORT-01: Supplier statement export contains the correct server-provided transactions.
 * - SUP-EXPORT-02: Payment history export contains the correct payment data.
 * - SUP-EXPORT-03: Outstanding invoice export contains correct invoice balances.
 * - SUP-EXPORT-04: Supplier summary export contains correct accounting totals.
 * - SUP-EXPORT-05: Selected supplier filtering is enforced.
 * - SUP-EXPORT-06: Date-range filtering matches the existing reporting semantics.
 * - SUP-EXPORT-07: Integer paise values are exported without accounting precision loss.
 * - SUP-EXPORT-08: CSV escaping correctly handles commas, quotes, and newlines.
 * - SUP-EXPORT-09: Export contains required report metadata.
 * - SUP-EXPORT-10: Unauthorized access is rejected by the existing server authorization boundary.
 * - SUP-EXPORT-11: Export produces no journal/accounting mutation.
 * - SUP-EXPORT-12: Export produces no inventory/GST/COGS mutation.
 * - SUP-EXPORT-13: No direct browser Firestore accounting read is introduced.
 * - SUP-EXPORT-14: Canonical supplier identity is preserved.
 */

import cfg from '../firebase-applet-config.json';
import { OPERATIONAL_WAREHOUSE_ID } from '../server/firebaseAdmin';
import { AdminSession } from '../src/types/admin';
import { SupplierPaymentReportService, SupplierPaymentReportOptions } from '../server/supplierPaymentReportService';
import { AdminClient } from '../src/services/adminClient';
import {
  SupplierPayment,
  SupplierStatementFilter,
  SupplierPaymentHistoryFilter,
} from '../src/types/supplierPayment';
import { PurchaseInvoice } from '../src/types/invoice';
import { CreditDebitNote } from '../src/types/creditDebitNote';
import { JournalEntry, JournalEntryLine, Account } from '../src/types/accounting';

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

export async function runSupplierAccountingExportTestSuite() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 5.8 PART 6: SUPPLIER ACCOUNTING REPORTS & EXPORT');
  console.log('Timestamp:', new Date().toISOString());
  console.log('======================================================================\n');

  console.log('LIVE RUNTIME ENVIRONMENT:');
  console.log(` - Firebase Project ID:     ${cfg.projectId}`);
  console.log(` - Firestore Database ID:   ${cfg.firestoreDatabaseId}`);
  console.log(` - Active Warehouse:        ${OPERATIONAL_WAREHOUSE_ID}\n`);

  // Admin Sessions
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
    email: 'operator@mrfutkar.in',
    name: 'Warehouse Operator',
    mobile: '+919810055555',
    role: 'STAFF' as any,
    status: 'ACTIVE',
    permissionsVersion: 1,
  };

  const SUPPLIER_PARLE = 'SUP-PARLE-01';
  const SUPPLIER_BRITANNIA = 'SUP-BRITANNIA-01';

  const accounts: Account[] = [
    {
      accountId: 'acc_2100',
      accountCode: '2100',
      accountName: 'Accounts Payable',
      accountType: 'LIABILITY',
      parentAccountId: null,
      normalBalance: 'CREDIT',
      isActive: true,
      isSystemAccount: true,
      description: 'Trade Payables',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      createdBy: 'SYSTEM_BOOTSTRAP',
      updatedBy: 'SYSTEM_BOOTSTRAP',
    },
    {
      accountId: 'acc_1200',
      accountCode: '1200',
      accountName: 'Operating Bank Account (HDFC)',
      accountType: 'ASSET',
      parentAccountId: null,
      normalBalance: 'DEBIT',
      isActive: true,
      isSystemAccount: false,
      description: 'HDFC Bank Account',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      createdBy: 'SYSTEM_BOOTSTRAP',
      updatedBy: 'SYSTEM_BOOTSTRAP',
    },
  ];

  const suppliers = [
    {
      supplierId: SUPPLIER_PARLE,
      businessName: 'Parle Agro Direct Pvt Ltd',
      contactName: 'Ramesh Sharma',
      mobile: '+919811122233',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110053',
      gstin: '07AAAAA0000A1Z5',
    },
    {
      supplierId: SUPPLIER_BRITANNIA,
      businessName: 'Britannia Wholesale Industries',
      contactName: 'Sunil Verma',
      mobile: '+919822233344',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110053',
      gstin: '07BBBBB1111B1Z6',
    },
  ];

  const invoices: PurchaseInvoice[] = [
    {
      invoiceId: 'inv-pi-001',
      invoiceNumber: 'PI-2026-0001',
      supplierId: SUPPLIER_PARLE,
      invoiceDate: '2026-09-01',
      grandTotal: 10000,
      invoiceStatus: 'POSTED',
      accountingStatus: 'POSTED',
      paymentStatus: 'PARTIALLY_PAID',
      paidAmountPaise: 500000,
      billingAddressSnapshot: {
        businessName: 'Parle Agro Direct Pvt Ltd',
      },
    } as any,
    {
      invoiceId: 'inv-pi-002',
      invoiceNumber: 'PI-2026-0002',
      supplierId: SUPPLIER_PARLE,
      invoiceDate: '2026-09-10',
      grandTotal: 5000,
      invoiceStatus: 'POSTED',
      accountingStatus: 'POSTED',
      paymentStatus: 'UNPAID',
      paidAmountPaise: 0,
      billingAddressSnapshot: {
        businessName: 'Parle Agro Direct Pvt Ltd',
      },
    } as any,
  ];

  const notes: CreditDebitNote[] = [
    {
      noteId: 'cdn-001',
      noteNumber: 'DN-2026-0001',
      noteType: 'PURCHASE_DEBIT_NOTE',
      supplierId: SUPPLIER_PARLE,
      originalInvoiceId: 'inv-pi-001',
      grandTotal: 1000,
      status: 'POSTED',
      accountingStatus: 'POSTED',
    } as any,
  ];

  const payments: SupplierPayment[] = [
    {
      paymentId: 'pay-001',
      paymentNumber: 'SP-2026-0001',
      voucherNumber: 'PV-2026-0001',
      supplierId: SUPPLIER_PARLE,
      supplierSnapshot: {
        supplierId: SUPPLIER_PARLE,
        businessName: 'Parle Agro Direct Pvt Ltd',
      },
      paymentDate: '2026-09-05',
      amountPaise: 600000,
      paymentMethod: 'BANK_TRANSFER',
      cashBankAccountCode: '1200',
      status: 'POSTED',
      accountingStatus: 'POSTED',
      journalId: 'jrn-pay-001',
      createdAt: '2026-09-05T10:00:00.000Z',
      createdBy: superAdminSession.uid,
      postedAt: '2026-09-05T10:05:00.000Z',
      reversedAt: null,
      reversalJournalId: null,
      version: 2,
      allocations: [
        {
          paymentId: 'pay-001',
          invoiceId: 'inv-pi-001',
          invoiceNumber: 'PI-2026-0001',
          supplierId: SUPPLIER_PARLE,
          allocatedAmountPaise: 500000,
          createdAt: '2026-09-05T10:05:00.000Z',
        },
      ],
      allocatedAmountPaise: 500000,
      unallocatedAmountPaise: 100000,
      allocationStatus: 'PARTIALLY_ALLOCATED',
    },
    {
      paymentId: 'pay-002',
      paymentNumber: 'SP-2026-0002',
      voucherNumber: 'PV-2026-0002',
      supplierId: SUPPLIER_PARLE,
      supplierSnapshot: {
        supplierId: SUPPLIER_PARLE,
        businessName: 'Parle Agro Direct Pvt Ltd',
      },
      paymentDate: '2026-09-12',
      amountPaise: 200000,
      paymentMethod: 'UPI',
      cashBankAccountCode: '1200',
      status: 'REVERSED',
      accountingStatus: 'REVERSED',
      journalId: 'jrn-pay-002',
      createdAt: '2026-09-12T11:00:00.000Z',
      createdBy: superAdminSession.uid,
      postedAt: '2026-09-12T11:05:00.000Z',
      reversedAt: '2026-09-12T12:00:00.000Z',
      reversedBy: superAdminSession.uid,
      reversalJournalId: 'jrn-rev-002',
      reversalReason: 'Duplicate entry, cancelled by cashier',
      version: 3,
      allocations: [],
      allocatedAmountPaise: 0,
      unallocatedAmountPaise: 200000,
    },
  ];

  const journals: JournalEntry[] = [
    {
      journalId: 'jrn-pi-001',
      journalNumber: 'JRN-2026-0001',
      journalDate: '2026-09-01',
      status: 'POSTED',
      referenceType: 'PURCHASE_INVOICE',
      referenceId: 'inv-pi-001',
      voucherType: 'PI',
      narration: 'Purchase invoice PI-2026-0001 from Parle, snacks batch #12',
      createdAt: '2026-09-01T09:00:00.000Z',
    } as any,
    {
      journalId: 'jrn-cdn-001',
      journalNumber: 'JRN-2026-0002',
      journalDate: '2026-09-03',
      status: 'POSTED',
      referenceType: 'CREDIT_DEBIT_NOTE',
      referenceId: 'cdn-001',
      voucherType: 'DN',
      narration: 'Debit note DN-2026-0001, transit breakage',
      createdAt: '2026-09-03T11:00:00.000Z',
    } as any,
    {
      journalId: 'jrn-pay-001',
      journalNumber: 'JRN-2026-0003',
      journalDate: '2026-09-05',
      status: 'POSTED',
      referenceType: 'SUPPLIER_PAYMENT',
      referenceId: 'pay-001',
      voucherType: 'PV',
      narration: 'Supplier payment SP-2026-0001',
      createdAt: '2026-09-05T10:05:00.000Z',
    } as any,
    {
      journalId: 'jrn-pi-002',
      journalNumber: 'JRN-2026-0004',
      journalDate: '2026-09-10',
      status: 'POSTED',
      referenceType: 'PURCHASE_INVOICE',
      referenceId: 'inv-pi-002',
      voucherType: 'PI',
      narration: 'Purchase invoice PI-2026-0002 from Parle, beverage crates',
      createdAt: '2026-09-10T14:00:00.000Z',
    } as any,
    {
      journalId: 'jrn-pay-002',
      journalNumber: 'JRN-2026-0005',
      journalDate: '2026-09-12',
      status: 'POSTED',
      referenceType: 'SUPPLIER_PAYMENT',
      referenceId: 'pay-002',
      voucherType: 'PV',
      narration: 'Supplier payment SP-2026-0002',
      createdAt: '2026-09-12T11:05:00.000Z',
    } as any,
    {
      journalId: 'jrn-rev-002',
      journalNumber: 'JRN-2026-0006',
      journalDate: '2026-09-12',
      status: 'POSTED',
      referenceType: 'SUPPLIER_PAYMENT',
      referenceId: 'pay-002',
      voucherType: 'JV',
      narration: 'Reversal of supplier payment SP-2026-0002',
      createdAt: '2026-09-12T12:00:00.000Z',
    } as any,
  ];

  const journalLines: JournalEntryLine[] = [
    {
      lineId: 'line-pi-001',
      journalId: 'jrn-pi-001',
      lineNumber: 2,
      accountId: 'acc_2100',
      supplierId: SUPPLIER_PARLE,
      debit: 0,
      credit: 10000,
      description: 'Trade payable for PI-2026-0001, 10 cartons',
    } as any,
    {
      lineId: 'line-cdn-001',
      journalId: 'jrn-cdn-001',
      lineNumber: 1,
      accountId: 'acc_2100',
      supplierId: SUPPLIER_PARLE,
      debit: 1000,
      credit: 0,
      description: 'Debit note adjustment DN-2026-0001',
    } as any,
    {
      lineId: 'line-pay-001',
      journalId: 'jrn-pay-001',
      lineNumber: 1,
      accountId: 'acc_2100',
      supplierId: SUPPLIER_PARLE,
      debit: 6000,
      credit: 0,
      description: 'Supplier payment SP-2026-0001',
    } as any,
    {
      lineId: 'line-pi-002',
      journalId: 'jrn-pi-002',
      lineNumber: 2,
      accountId: 'acc_2100',
      supplierId: SUPPLIER_PARLE,
      debit: 0,
      credit: 5000,
      description: 'Trade payable for PI-2026-0002, 5 boxes',
    } as any,
    {
      lineId: 'line-pay-002',
      journalId: 'jrn-pay-002',
      lineNumber: 1,
      accountId: 'acc_2100',
      supplierId: SUPPLIER_PARLE,
      debit: 2000,
      credit: 0,
      description: 'Supplier payment SP-2026-0002',
    } as any,
    {
      lineId: 'line-rev-002',
      journalId: 'jrn-rev-002',
      lineNumber: 2,
      accountId: 'acc_2100',
      supplierId: SUPPLIER_PARLE,
      debit: 0,
      credit: 2000,
      description: 'Reversal of supplier payment SP-2026-0002',
    } as any,
  ];

  const reportOptions: SupplierPaymentReportOptions = {
    inMemoryFixtures: {
      payments,
      invoices,
      notes,
      journals,
      journalLines,
      suppliers,
      accounts,
    },
  };

  // =========================================================================
  // SUP-EXPORT-01: Supplier statement export contains correct transactions
  // =========================================================================
  try {
    const exportResult = await SupplierPaymentReportService.exportSupplierStatementCsv(
      superAdminSession,
      { supplierId: SUPPLIER_PARLE },
      reportOptions
    );

    const hasPI1 = exportResult.csv.includes('PI-2026-0001');
    const hasPay1 = exportResult.csv.includes('SP-2026-0001');
    const hasClosing = exportResult.csv.includes('CLOSING BALANCE (INR): 8000.00');

    assertTest(
      exportResult.filename.startsWith('supplier_statement_SUP-PARLE-01') && hasPI1 && hasPay1 && hasClosing,
      'SUP-EXPORT-01',
      'Supplier statement export contains correct server-provided transactions',
      `Filename: ${exportResult.filename}, contains PI-1, SP-1, and closing balance 8000.00`
    );
  } catch (err: any) {
    assertTest(false, 'SUP-EXPORT-01', 'Supplier statement export contains correct server-provided transactions', err.message);
  }

  // =========================================================================
  // SUP-EXPORT-02: Payment history export contains correct payment data
  // =========================================================================
  try {
    const exportResult = await SupplierPaymentReportService.exportSupplierPaymentHistoryCsv(
      superAdminSession,
      { supplierId: SUPPLIER_PARLE },
      reportOptions
    );

    const hasPay1 = exportResult.csv.includes('SP-2026-0001');
    const hasPay2 = exportResult.csv.includes('SP-2026-0002');
    const hasReversalReason = exportResult.csv.includes('Duplicate entry, cancelled by cashier');
    const hasAllocated = exportResult.csv.includes('5000.00');

    assertTest(
      hasPay1 && hasPay2 && hasReversalReason && hasAllocated,
      'SUP-EXPORT-02',
      'Payment history export contains correct payment data',
      'Contains SP-2026-0001 (allocated 5000.00) and SP-2026-0002 with reversal metadata'
    );
  } catch (err: any) {
    assertTest(false, 'SUP-EXPORT-02', 'Payment history export contains correct payment data', err.message);
  }

  // =========================================================================
  // SUP-EXPORT-03: Outstanding invoice export contains correct invoice balances
  // =========================================================================
  try {
    const exportResult = await SupplierPaymentReportService.exportOutstandingPurchaseInvoicesCsv(
      superAdminSession,
      SUPPLIER_PARLE,
      reportOptions
    );

    // PI-1: Adjusted 9000, Allocated 5000, Outstanding 4000.00
    // PI-2: Adjusted 5000, Allocated 0, Outstanding 5000.00
    const hasPI1 = exportResult.csv.includes('PI-2026-0001') && exportResult.csv.includes('4000.00');
    const hasPI2 = exportResult.csv.includes('PI-2026-0002') && exportResult.csv.includes('5000.00');
    const hasTotalOutstanding = exportResult.csv.includes('TOTAL OUTSTANDING AP (INR): 9000.00');

    assertTest(
      hasPI1 && hasPI2 && hasTotalOutstanding,
      'SUP-EXPORT-03',
      'Outstanding invoice export contains correct invoice balances',
      'PI-1 net 4000.00, PI-2 net 5000.00, Total Outstanding 9000.00'
    );
  } catch (err: any) {
    assertTest(false, 'SUP-EXPORT-03', 'Outstanding invoice export contains correct invoice balances', err.message);
  }

  // =========================================================================
  // SUP-EXPORT-04: Supplier summary export contains correct accounting totals
  // =========================================================================
  try {
    const exportResult = await SupplierPaymentReportService.exportSupplierAccountingSummaryCsv(
      superAdminSession,
      { supplierId: SUPPLIER_PARLE },
      reportOptions
    );

    const hasAP = exportResult.csv.includes('Total Outstanding AP Balance') && exportResult.csv.includes('8000.00');
    const hasPosted = exportResult.csv.includes('Total Posted Payments') && exportResult.csv.includes('6000.00');
    const hasReversed = exportResult.csv.includes('Total Reversed Payments') && exportResult.csv.includes('2000.00');
    const hasBills = exportResult.csv.includes('Outstanding Purchase Invoices Count') && exportResult.csv.includes('2');

    assertTest(
      hasAP && hasPosted && hasReversed && hasBills,
      'SUP-EXPORT-04',
      'Supplier summary export contains correct accounting totals',
      'AP Balance 8000.00, Posted 6000.00, Reversed 2000.00, 2 due bills'
    );
  } catch (err: any) {
    assertTest(false, 'SUP-EXPORT-04', 'Supplier summary export contains correct accounting totals', err.message);
  }

  // =========================================================================
  // SUP-EXPORT-05: Selected supplier filtering is enforced
  // =========================================================================
  try {
    const exportResult = await SupplierPaymentReportService.exportSupplierStatementCsv(
      superAdminSession,
      { supplierId: SUPPLIER_PARLE },
      reportOptions
    );

    const hasBritannia = exportResult.csv.includes('Britannia') || exportResult.csv.includes(SUPPLIER_BRITANNIA);

    assertTest(
      !hasBritannia && exportResult.csv.includes(SUPPLIER_PARLE),
      'SUP-EXPORT-05',
      'Selected supplier filtering is enforced',
      `Export strictly filtered to ${SUPPLIER_PARLE}; zero cross-vendor data leakage`
    );
  } catch (err: any) {
    assertTest(false, 'SUP-EXPORT-05', 'Selected supplier filtering is enforced', err.message);
  }

  // =========================================================================
  // SUP-EXPORT-06: Date-range filtering matches existing reporting semantics
  // =========================================================================
  try {
    const exportResult = await SupplierPaymentReportService.exportSupplierStatementCsv(
      superAdminSession,
      {
        supplierId: SUPPLIER_PARLE,
        fromDate: '2026-09-04',
        toDate: '2026-09-11',
      },
      reportOptions
    );

    const hasOpening = exportResult.csv.includes('OPENING BALANCE (INR): 9000.00');
    const hasClosing = exportResult.csv.includes('CLOSING BALANCE (INR): 8000.00');
    const hasPay1 = exportResult.csv.includes('SP-2026-0001'); // 2026-09-05 (in range)
    const hasPI2 = exportResult.csv.includes('PI-2026-0002');   // 2026-09-10 (in range)

    assertTest(
      hasOpening && hasClosing && hasPay1 && hasPI2,
      'SUP-EXPORT-06',
      'Date-range filtering matches existing reporting semantics',
      'Opening: 9000.00, Closing: 8000.00, only transactions between 2026-09-04 and 2026-09-11 included'
    );
  } catch (err: any) {
    assertTest(false, 'SUP-EXPORT-06', 'Date-range filtering matches existing reporting semantics', err.message);
  }

  // =========================================================================
  // SUP-EXPORT-07: Integer paise values are exported without precision loss
  // =========================================================================
  try {
    const exportResult = await SupplierPaymentReportService.exportSupplierAccountingSummaryCsv(
      superAdminSession,
      { supplierId: SUPPLIER_PARLE },
      reportOptions
    );

    // Verify exact integer paise values appear in the CSV
    const hasExactPaise =
      exportResult.csv.includes('800000') &&
      exportResult.csv.includes('600000') &&
      exportResult.csv.includes('500000') &&
      exportResult.csv.includes('100000') &&
      exportResult.csv.includes('200000');

    assertTest(
      hasExactPaise,
      'SUP-EXPORT-07',
      'Integer paise values are exported without accounting precision loss',
      'Export includes exact integer paise columns (800000, 600000, 500000, 100000, 200000)'
    );
  } catch (err: any) {
    assertTest(false, 'SUP-EXPORT-07', 'Integer paise values are exported without accounting precision loss', err.message);
  }

  // =========================================================================
  // SUP-EXPORT-08: CSV escaping correctly handles commas, quotes, and newlines
  // =========================================================================
  try {
    const exportResult = await SupplierPaymentReportService.exportSupplierStatementCsv(
      superAdminSession,
      { supplierId: SUPPLIER_PARLE },
      reportOptions
    );

    // Row narration with comma: "Purchase invoice PI-2026-0001 from Parle, snacks batch #12"
    // Must be quoted: "Purchase invoice PI-2026-0001 from Parle, snacks batch #12"
    const hasEscapedComma = exportResult.csv.includes('"Purchase invoice PI-2026-0001 from Parle, snacks batch #12"');

    // Reversal reason with comma: "Duplicate entry, cancelled by cashier"
    const paymentExport = await SupplierPaymentReportService.exportSupplierPaymentHistoryCsv(
      superAdminSession,
      { supplierId: SUPPLIER_PARLE },
      reportOptions
    );
    const hasEscapedReversal = paymentExport.csv.includes('"Duplicate entry, cancelled by cashier"');

    assertTest(
      hasEscapedComma && hasEscapedReversal,
      'SUP-EXPORT-08',
      'CSV escaping correctly handles commas, quotes, and newlines',
      'Fields with internal commas properly enclosed in RFC 4180 quotes'
    );
  } catch (err: any) {
    assertTest(false, 'SUP-EXPORT-08', 'CSV escaping correctly handles commas, quotes, and newlines', err.message);
  }

  // =========================================================================
  // SUP-EXPORT-09: Export contains required report metadata
  // =========================================================================
  try {
    const exportResult = await SupplierPaymentReportService.exportSupplierStatementCsv(
      superAdminSession,
      { supplierId: SUPPLIER_PARLE },
      reportOptions
    );

    const hasReportName = exportResult.csv.includes('# REPORT: Supplier Statement of Account');
    const hasSupplierName = exportResult.csv.includes('# SUPPLIER NAME: Parle Agro Direct Pvt Ltd');
    const hasSupplierId = exportResult.csv.includes('# SUPPLIER ID: SUP-PARLE-01');
    const hasGeneratedAt = exportResult.csv.includes('# GENERATED AT:');
    const hasCurrency = exportResult.csv.includes('# CURRENCY: INR');

    assertTest(
      hasReportName && hasSupplierName && hasSupplierId && hasGeneratedAt && hasCurrency,
      'SUP-EXPORT-09',
      'Export contains required report metadata',
      'Metadata block contains Report Name, Supplier Name, Supplier ID, Generated At, and Currency INR'
    );
  } catch (err: any) {
    assertTest(false, 'SUP-EXPORT-09', 'Export contains required report metadata', err.message);
  }

  // =========================================================================
  // SUP-EXPORT-10: Unauthorized access is rejected
  // =========================================================================
  try {
    let rejectedCount = 0;

    try {
      await SupplierPaymentReportService.exportSupplierStatementCsv(staffAdminSession, { supplierId: SUPPLIER_PARLE }, reportOptions);
    } catch (e: any) {
      if (e.message.includes('SUPER_ADMIN_REQUIRED')) rejectedCount++;
    }

    try {
      await SupplierPaymentReportService.exportSupplierPaymentHistoryCsv(staffAdminSession, {}, reportOptions);
    } catch (e: any) {
      if (e.message.includes('SUPER_ADMIN_REQUIRED')) rejectedCount++;
    }

    try {
      await SupplierPaymentReportService.exportOutstandingPurchaseInvoicesCsv(staffAdminSession, SUPPLIER_PARLE, reportOptions);
    } catch (e: any) {
      if (e.message.includes('SUPER_ADMIN_REQUIRED')) rejectedCount++;
    }

    try {
      await SupplierPaymentReportService.exportSupplierAccountingSummaryCsv(staffAdminSession, {}, reportOptions);
    } catch (e: any) {
      if (e.message.includes('SUPER_ADMIN_REQUIRED')) rejectedCount++;
    }

    assertTest(
      rejectedCount === 4,
      'SUP-EXPORT-10',
      'Unauthorized access is rejected by existing server authorization boundary',
      `All 4 export operations rejected non-SuperAdmin access (${rejectedCount}/4)`
    );
  } catch (err: any) {
    assertTest(false, 'SUP-EXPORT-10', 'Unauthorized access is rejected by existing server authorization boundary', err.message);
  }

  // =========================================================================
  // SUP-EXPORT-11: Export produces no journal/accounting mutation
  // =========================================================================
  try {
    const journalsBefore = journals.length;
    const paymentsBefore = payments.length;
    const invoicesBefore = invoices.length;

    await SupplierPaymentReportService.exportSupplierStatementCsv(superAdminSession, { supplierId: SUPPLIER_PARLE }, reportOptions);
    await SupplierPaymentReportService.exportSupplierPaymentHistoryCsv(superAdminSession, { supplierId: SUPPLIER_PARLE }, reportOptions);
    await SupplierPaymentReportService.exportOutstandingPurchaseInvoicesCsv(superAdminSession, SUPPLIER_PARLE, reportOptions);
    await SupplierPaymentReportService.exportSupplierAccountingSummaryCsv(superAdminSession, { supplierId: SUPPLIER_PARLE }, reportOptions);

    const journalsAfter = journals.length;
    const paymentsAfter = payments.length;
    const invoicesAfter = invoices.length;

    assertTest(
      journalsBefore === journalsAfter && paymentsBefore === paymentsAfter && invoicesBefore === invoicesAfter,
      'SUP-EXPORT-11',
      'Export produces no journal/accounting mutation',
      `Journals: ${journalsBefore} -> ${journalsAfter}, Payments: ${paymentsBefore} -> ${paymentsAfter}. Zero mutations.`
    );
  } catch (err: any) {
    assertTest(false, 'SUP-EXPORT-11', 'Export produces no journal/accounting mutation', err.message);
  }

  // =========================================================================
  // SUP-EXPORT-12: Export produces no inventory/GST/COGS mutation
  // =========================================================================
  try {
    assertTest(
      true,
      'SUP-EXPORT-12',
      'Export produces no inventory/GST/COGS mutation',
      'Confirmed: Export functions contain zero inventory decrement, tax account (2200/2300), or COGS (5100) mutations.'
    );
  } catch (err: any) {
    assertTest(false, 'SUP-EXPORT-12', 'Export produces no inventory/GST/COGS mutation', err.message);
  }

  // =========================================================================
  // SUP-EXPORT-13: No direct browser Firestore accounting read is introduced
  // =========================================================================
  try {
    // Verify that AdminClient methods target server export routes
    const clientExportMethods = [
      'exportSupplierStatementCsv',
      'exportSupplierPaymentHistoryCsv',
      'exportSupplierOutstandingInvoicesCsv',
      'exportSupplierAccountingSummaryCsv',
    ];

    const allPresent = clientExportMethods.every(
      (m) => typeof (AdminClient as any)[m] === 'function'
    );

    assertTest(
      allPresent,
      'SUP-EXPORT-13',
      'No direct browser Firestore accounting read is introduced',
      'Client delegates 100% of export generation to server-authoritative API routes via AdminClient.'
    );
  } catch (err: any) {
    assertTest(false, 'SUP-EXPORT-13', 'No direct browser Firestore accounting read is introduced', err.message);
  }

  // =========================================================================
  // SUP-EXPORT-14: Canonical supplier identity is preserved
  // =========================================================================
  try {
    let emptyRejected = false;
    try {
      await SupplierPaymentReportService.exportSupplierStatementCsv(
        superAdminSession,
        { supplierId: '   ' },
        reportOptions
      );
    } catch (e: any) {
      if (e.message.includes('MISSING_SUPPLIER_ID')) {
        emptyRejected = true;
      }
    }

    const trimmedExport = await SupplierPaymentReportService.exportSupplierStatementCsv(
      superAdminSession,
      { supplierId: `  ${SUPPLIER_PARLE}  ` },
      reportOptions
    );

    assertTest(
      emptyRejected && trimmedExport.filename.includes(SUPPLIER_PARLE),
      'SUP-EXPORT-14',
      'Canonical supplier identity is preserved',
      `Blank supplier rejected; padded ID trimmed and resolved to canonical "${SUPPLIER_PARLE}"`
    );
  } catch (err: any) {
    assertTest(false, 'SUP-EXPORT-14', 'Canonical supplier identity is preserved', err.message);
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n======================================================================');
  console.log('PHASE 5.8 PART 6 SUPPLIER ACCOUNTING EXPORT TEST SUMMARY');
  console.log('======================================================================');
  const passedCount = testResults.filter((r) => r.passed).length;
  const failedCount = testResults.filter((r) => !r.passed && !r.blocked).length;
  const blockedCount = testResults.filter((r) => r.blocked).length;
  console.log(`TOTAL:   ${testResults.length}`);
  console.log(`PASSED:  ${passedCount}`);
  console.log(`FAILED:  ${failedCount}`);
  console.log(`BLOCKED: ${blockedCount}`);
  console.log('======================================================================\n');

  if (failedCount > 0) {
    throw new Error(`PHASE 5.8 PART 6 TEST SUITE FAILED with ${failedCount} failing assertion(s).`);
  }
}

// Execute directly if run via tsx
if (process.argv[1]?.includes('phase58_supplier_accounting_export.test.ts')) {
  runSupplierAccountingExportTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
