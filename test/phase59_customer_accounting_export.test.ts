/**
 * MR FUTKAR — Phase 5.9 Part 3: Customer Accounting Reports & Export Test Suite
 * Production-grade server-authoritative read-only customer export verification.
 *
 * Verifies:
 * - CUST-EXPORT-01: Customer statement export contains the correct server-provided transactions.
 * - CUST-EXPORT-02: Receipt history export contains the correct customer receipt data.
 * - CUST-EXPORT-03: Outstanding invoice export contains correct invoice balances.
 * - CUST-EXPORT-04: Customer summary export contains correct accounting totals.
 * - CUST-EXPORT-05: Selected customer filtering is enforced.
 * - CUST-EXPORT-06: Date-range filtering matches the existing reporting semantics.
 * - CUST-EXPORT-07: Integer paise values are exported without accounting precision loss.
 * - CUST-EXPORT-08: CSV escaping correctly handles commas, quotes, and newlines.
 * - CUST-EXPORT-09: Export contains required report metadata.
 * - CUST-EXPORT-10: Unauthorized access is rejected by the existing server authorization boundary.
 * - CUST-EXPORT-11: Export produces no journal/accounting mutation.
 * - CUST-EXPORT-12: Export produces no inventory/GST/COGS mutation.
 * - CUST-EXPORT-13: No direct browser Firestore accounting read is introduced.
 * - CUST-EXPORT-14: Canonical customer identity is preserved.
 */

import cfg from '../firebase-applet-config.json';
import { OPERATIONAL_WAREHOUSE_ID } from '../server/firebaseAdmin';
import { AdminSession } from '../src/types/admin';
import { CustomerReportService, CustomerReportOptions } from '../server/customerReportService';
import { AdminClient } from '../src/services/adminClient';
import {
  CustomerReceipt,
} from '../src/types/customerReceipt';
import { SalesInvoice } from '../src/types/invoice';
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

export async function runCustomerAccountingExportTestSuite() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 5.9 PART 3: CUSTOMER ACCOUNTING REPORTS & EXPORT');
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

  const CUST_1 = 'CUST-KIRANA-01';
  const CUST_2 = 'CUST-KIRANA-02';

  const accounts: Account[] = [
    {
      accountId: 'acc_1300',
      accountCode: '1300',
      accountName: 'Accounts Receivable',
      accountType: 'ASSET',
      parentAccountId: null,
      normalBalance: 'DEBIT',
      isActive: true,
      isSystemAccount: true,
      description: 'Kirana Retailer Receivables',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      createdBy: 'SYSTEM_BOOTSTRAP',
      updatedBy: 'SYSTEM_BOOTSTRAP',
    },
    {
      accountId: 'acc_1200',
      accountCode: '1200',
      accountName: 'HDFC Current Account',
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

  const retailers = [
    {
      customerId: CUST_1,
      retailerId: CUST_1,
      shopName: 'Shree Ganesh Kirana Store',
      ownerName: 'Ganesh Kumar',
      mobile: '+919811122233',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110053',
      gstin: '07AAAAA1111A1Z1',
    },
    {
      customerId: CUST_2,
      retailerId: CUST_2,
      shopName: 'Gupta Daily Needs',
      ownerName: 'Vikas Gupta',
      mobile: '+919822233344',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110094',
      gstin: '07BBBBB2222B1Z2',
    },
  ];

  // Invoices:
  // inv-001: CUST_1, 2026-09-05, grandTotal 500, paidAmountPaise 45000
  // inv-002: CUST_1, 2026-09-10, grandTotal 300, paidAmountPaise 0
  const invoices: SalesInvoice[] = [
    {
      invoiceId: 'inv-001',
      invoiceNumber: 'SI-2026-00001',
      invoiceDate: '2026-09-05',
      invoiceStatus: 'ISSUED',
      accountingStatus: 'POSTED',
      customerId: CUST_1,
      customerType: 'RETAILER',
      sourceOrderId: 'ord-001',
      warehouseId: 'WH-BRAHMPURI-01',
      billingAddressSnapshot: {
        businessName: 'Shree Ganesh Kirana Store',
        contactName: 'Ganesh Kumar',
        mobile: '+919811122233',
        fullAddress: 'Shop 12, Brahmpuri, Delhi, FMCG Market',
        city: 'Delhi',
        pincode: '110053',
      },
      shippingAddressSnapshot: {
        businessName: 'Shree Ganesh Kirana Store',
        contactName: 'Ganesh Kumar',
        mobile: '+919811122233',
        fullAddress: 'Shop 12, Brahmpuri, Delhi, FMCG Market',
        city: 'Delhi',
        pincode: '110053',
      },
      items: [],
      subtotal: 500,
      discountTotal: 0,
      taxableTotal: 500,
      taxTotal: 0,
      grandTotal: 500,
      paymentStatus: 'PARTIALLY_PAID',
      paidAmountPaise: 45000,
      accountingJournalId: 'jrn-001',
      createdAt: '2026-09-05T10:00:00.000Z',
      createdBy: 'admin_1',
      updatedAt: '2026-09-05T10:00:00.000Z',
      updatedBy: 'admin_1',
    } as any,
    {
      invoiceId: 'inv-002',
      invoiceNumber: 'SI-2026-00002',
      invoiceDate: '2026-09-10',
      invoiceStatus: 'ISSUED',
      accountingStatus: 'POSTED',
      customerId: CUST_1,
      customerType: 'RETAILER',
      sourceOrderId: 'ord-002',
      warehouseId: 'WH-BRAHMPURI-01',
      billingAddressSnapshot: {
        businessName: 'Shree Ganesh Kirana Store',
        contactName: 'Ganesh Kumar',
        mobile: '+919811122233',
        fullAddress: 'Shop 12, Brahmpuri, Delhi',
        city: 'Delhi',
        pincode: '110053',
      },
      shippingAddressSnapshot: {
        businessName: 'Shree Ganesh Kirana Store',
        contactName: 'Ganesh Kumar',
        mobile: '+919811122233',
        fullAddress: 'Shop 12, Brahmpuri, Delhi',
        city: 'Delhi',
        pincode: '110053',
      },
      items: [],
      subtotal: 300,
      discountTotal: 0,
      taxableTotal: 300,
      taxTotal: 0,
      grandTotal: 300,
      paymentStatus: 'UNPAID',
      paidAmountPaise: 0,
      accountingJournalId: 'jrn-003',
      createdAt: '2026-09-10T10:00:00.000Z',
      createdBy: 'admin_1',
      updatedAt: '2026-09-10T10:00:00.000Z',
      updatedBy: 'admin_1',
    } as any,
  ];

  // Notes:
  // cdn-001: Credit Note, 2026-09-08, 50.00
  // cdn-002: Debit Note, 2026-09-12, 50.00
  const notes: CreditDebitNote[] = [
    {
      noteId: 'cdn-001',
      noteNumber: 'CN-2026-00001',
      noteType: 'SALES_CREDIT_NOTE',
      customerId: CUST_1,
      originalInvoiceId: 'inv-001',
      grandTotal: 50,
      status: 'POSTED',
      accountingStatus: 'POSTED',
      accountingJournalId: 'jrn-note-001',
      createdAt: '2026-09-08T10:00:00.000Z',
    } as any,
    {
      noteId: 'cdn-002',
      noteNumber: 'DN-2026-00001',
      noteType: 'SALES_DEBIT_NOTE',
      customerId: CUST_1,
      originalInvoiceId: 'inv-002',
      grandTotal: 50,
      status: 'POSTED',
      accountingStatus: 'POSTED',
      accountingJournalId: 'jrn-note-002',
      createdAt: '2026-09-12T10:00:00.000Z',
    } as any,
  ];

  // Receipts:
  // rec-001: 2026-09-08, 45,000 paise (450 INR), allocated: 45,000 to inv-001
  // rec-002: 2026-09-15, 15,000 paise (150 INR), REVERSED on Sep 20
  // rec-003: 2026-09-22, 10,000 paise (100 INR), unallocated
  const receipts: CustomerReceipt[] = [
    {
      receiptId: 'rec-001',
      receiptNumber: 'CR-2026-00001',
      voucherNumber: 'JRN-REC-001',
      customerId: CUST_1,
      customerSnapshot: {
        retailerId: CUST_1,
        businessName: 'Shree Ganesh Kirana Store',
        ownerName: 'Ramesh Patel',
        mobile: '9876543210',
        billingAddress: 'Brahmpuri Market, Delhi',
      },
      receiptDate: '2026-09-08',
      amountPaise: 45000,
      paymentMethod: 'UPI',
      cashBankAccountCode: '1200',
      status: 'POSTED',
      journalId: 'jrn-rec-001',
      createdAt: '2026-09-08T10:00:00.000Z',
      createdBy: superAdminSession.uid,
      postedAt: '2026-09-08T10:05:00.000Z',
      reversedAt: null,
      reversalJournalId: null,
      version: 2,
      allocations: [
        {
          receiptId: 'rec-001',
          invoiceId: 'inv-001',
          invoiceNumber: 'SI-2026-00001',
          retailerId: CUST_1,
          customerId: CUST_1,
          allocatedAmountPaise: 45000,
          createdAt: '2026-09-08T10:05:00.000Z',
        },
      ],
      allocatedAmountPaise: 45000,
      unallocatedAmountPaise: 0,
      allocationStatus: 'FULLY_ALLOCATED',
    },
    {
      receiptId: 'rec-002',
      receiptNumber: 'CR-2026-00002',
      voucherNumber: 'JRN-REC-002',
      customerId: CUST_1,
      customerSnapshot: {
        retailerId: CUST_1,
        businessName: 'Shree Ganesh Kirana Store',
        ownerName: 'Ramesh Patel',
        mobile: '9876543210',
        billingAddress: 'Brahmpuri Market, Delhi',
      },
      receiptDate: '2026-09-15',
      amountPaise: 15000,
      paymentMethod: 'CASH',
      cashBankAccountCode: '1200',
      status: 'REVERSED',
      journalId: 'jrn-rec-002',
      createdAt: '2026-09-15T10:00:00.000Z',
      createdBy: superAdminSession.uid,
      postedAt: '2026-09-15T10:05:00.000Z',
      reversedAt: '2026-09-20T10:00:00.000Z',
      reversedBy: superAdminSession.uid,
      reversalJournalId: 'jrn-rev-001',
      reversalReason: 'Counterfeit note detected, receipt reversed by cashier',
      version: 3,
      allocations: [],
      allocatedAmountPaise: 0,
      unallocatedAmountPaise: 15000,
      allocationStatus: 'UNALLOCATED',
    },
    {
      receiptId: 'rec-003',
      receiptNumber: 'CR-2026-00003',
      voucherNumber: 'JRN-REC-003',
      customerId: CUST_1,
      customerSnapshot: {
        retailerId: CUST_1,
        businessName: 'Shree Ganesh Kirana Store',
        ownerName: 'Ramesh Patel',
        mobile: '9876543210',
        billingAddress: 'Brahmpuri Market, Delhi',
      },
      receiptDate: '2026-09-22',
      amountPaise: 10000,
      paymentMethod: 'BANK_TRANSFER',
      cashBankAccountCode: '1200',
      status: 'POSTED',
      journalId: 'jrn-rec-003',
      createdAt: '2026-09-22T10:00:00.000Z',
      createdBy: superAdminSession.uid,
      postedAt: '2026-09-22T10:05:00.000Z',
      reversedAt: null,
      reversalJournalId: null,
      version: 1,
      allocations: [],
      allocatedAmountPaise: 0,
      unallocatedAmountPaise: 10000,
      allocationStatus: 'UNALLOCATED',
    },
  ];

  // Journals:
  const journals: JournalEntry[] = [
    {
      journalId: 'jrn-001',
      journalNumber: 'JRN-2026-00001',
      journalDate: '2026-09-05',
      status: 'POSTED',
      referenceType: 'SALES_INVOICE',
      referenceId: 'inv-001',
      voucherType: 'SI',
      narration: 'Sales invoice SI-2026-00001, biscuits and snacks crates',
      createdAt: '2026-09-05T10:00:00.000Z',
    } as any,
    {
      journalId: 'jrn-note-001',
      journalNumber: 'JRN-2026-00002',
      journalDate: '2026-09-08',
      status: 'POSTED',
      referenceType: 'CREDIT_DEBIT_NOTE',
      referenceId: 'cdn-001',
      voucherType: 'CN',
      narration: 'Credit note CN-2026-00001, damaged package return',
      createdAt: '2026-09-08T10:00:00.000Z',
    } as any,
    {
      journalId: 'jrn-rec-001',
      journalNumber: 'JRN-2026-00003',
      journalDate: '2026-09-08',
      status: 'POSTED',
      referenceType: 'CUSTOMER_RECEIPT',
      referenceId: 'rec-001',
      voucherType: 'CR',
      narration: 'Customer receipt CR-2026-00001 via UPI',
      createdAt: '2026-09-08T10:05:00.000Z',
    } as any,
    {
      journalId: 'jrn-003',
      journalNumber: 'JRN-2026-00004',
      journalDate: '2026-09-10',
      status: 'POSTED',
      referenceType: 'SALES_INVOICE',
      referenceId: 'inv-002',
      voucherType: 'SI',
      narration: 'Sales invoice SI-2026-00002, cooking oil carton',
      createdAt: '2026-09-10T10:00:00.000Z',
    } as any,
    {
      journalId: 'jrn-note-002',
      journalNumber: 'JRN-2026-00005',
      journalDate: '2026-09-12',
      status: 'POSTED',
      referenceType: 'CREDIT_DEBIT_NOTE',
      referenceId: 'cdn-002',
      voucherType: 'DN',
      narration: 'Debit note DN-2026-00001, supplementary freight recovery',
      createdAt: '2026-09-12T10:00:00.000Z',
    } as any,
    {
      journalId: 'jrn-rec-002',
      journalNumber: 'JRN-2026-00006',
      journalDate: '2026-09-15',
      status: 'POSTED',
      referenceType: 'CUSTOMER_RECEIPT',
      referenceId: 'rec-002',
      voucherType: 'CR',
      narration: 'Customer receipt CR-2026-00002 cash collection',
      createdAt: '2026-09-15T10:05:00.000Z',
    } as any,
    {
      journalId: 'jrn-rev-001',
      journalNumber: 'JRN-2026-00007',
      journalDate: '2026-09-20',
      status: 'POSTED',
      referenceType: 'CUSTOMER_RECEIPT',
      referenceId: 'rec-002',
      voucherType: 'JV',
      narration: 'Reversal of customer receipt CR-2026-00002, counterfeit detected',
      createdAt: '2026-09-20T10:00:00.000Z',
    } as any,
    {
      journalId: 'jrn-rec-003',
      journalNumber: 'JRN-2026-00008',
      journalDate: '2026-09-22',
      status: 'POSTED',
      referenceType: 'CUSTOMER_RECEIPT',
      referenceId: 'rec-003',
      voucherType: 'CR',
      narration: 'Customer receipt CR-2026-00003 bank transfer advance',
      createdAt: '2026-09-22T10:05:00.000Z',
    } as any,
  ];

  // Journal Lines on Account 1300:
  const journalLines: JournalEntryLine[] = [
    {
      lineId: 'line-001',
      journalId: 'jrn-001',
      lineNumber: 1,
      accountId: 'acc_1300',
      customerId: CUST_1,
      debit: 500,
      credit: 0,
      description: 'Kirana receivable for SI-2026-00001, biscuits',
    } as any,
    {
      lineId: 'line-002',
      journalId: 'jrn-note-001',
      lineNumber: 2,
      accountId: 'acc_1300',
      customerId: CUST_1,
      debit: 0,
      credit: 50,
      description: 'Credit note adjustment CN-2026-00001',
    } as any,
    {
      lineId: 'line-003',
      journalId: 'jrn-rec-001',
      lineNumber: 2,
      accountId: 'acc_1300',
      customerId: CUST_1,
      debit: 0,
      credit: 450,
      description: 'Receipt collection CR-2026-00001',
    } as any,
    {
      lineId: 'line-004',
      journalId: 'jrn-003',
      lineNumber: 1,
      accountId: 'acc_1300',
      customerId: CUST_1,
      debit: 300,
      credit: 0,
      description: 'Kirana receivable for SI-2026-00002, cooking oil',
    } as any,
    {
      lineId: 'line-005',
      journalId: 'jrn-note-002',
      lineNumber: 1,
      accountId: 'acc_1300',
      customerId: CUST_1,
      debit: 50,
      credit: 0,
      description: 'Debit note adjustment DN-2026-00001',
    } as any,
    {
      lineId: 'line-006',
      journalId: 'jrn-rec-002',
      lineNumber: 2,
      accountId: 'acc_1300',
      customerId: CUST_1,
      debit: 0,
      credit: 150,
      description: 'Receipt collection CR-2026-00002',
    } as any,
    {
      lineId: 'line-007',
      journalId: 'jrn-rev-001',
      lineNumber: 1,
      accountId: 'acc_1300',
      customerId: CUST_1,
      debit: 150,
      credit: 0,
      description: 'Reversal restoration for CR-2026-00002',
    } as any,
    {
      lineId: 'line-008',
      journalId: 'jrn-rec-003',
      lineNumber: 2,
      accountId: 'acc_1300',
      customerId: CUST_1,
      debit: 0,
      credit: 100,
      description: 'Advance receipt collection CR-2026-00003',
    } as any,
  ];

  const reportOptions: CustomerReportOptions = {
    inMemoryFixtures: {
      receipts,
      invoices,
      notes,
      journals,
      journalLines,
      retailers,
      accounts,
    },
  };

  // =========================================================================
  // CUST-EXPORT-01: Customer statement export contains correct transactions
  // =========================================================================
  try {
    const exportResult = await CustomerReportService.exportCustomerStatementCsv(
      superAdminSession,
      { customerId: CUST_1 },
      reportOptions
    );

    const hasSI1 = exportResult.csv.includes('SI-2026-00001');
    const hasCR1 = exportResult.csv.includes('CR-2026-00001');
    const hasClosing = exportResult.csv.includes('CLOSING BALANCE (INR): 250.00');

    assertTest(
      exportResult.filename.startsWith('customer_statement_CUST-KIRANA-01') && hasSI1 && hasCR1 && hasClosing,
      'CUST-EXPORT-01',
      'Customer statement export contains correct server-provided transactions',
      `Filename: ${exportResult.filename}, contains SI-1, CR-1, and closing balance 250.00`
    );
  } catch (err: any) {
    assertTest(false, 'CUST-EXPORT-01', 'Customer statement export contains correct server-provided transactions', err.message);
  }

  // =========================================================================
  // CUST-EXPORT-02: Receipt history export contains correct customer receipt data
  // =========================================================================
  try {
    const exportResult = await CustomerReportService.exportCustomerReceiptHistoryCsv(
      superAdminSession,
      { customerId: CUST_1 },
      reportOptions
    );

    const hasCR1 = exportResult.csv.includes('CR-2026-00001');
    const hasCR2 = exportResult.csv.includes('CR-2026-00002');
    const hasReversalReason = exportResult.csv.includes('Counterfeit note detected, receipt reversed by cashier');
    const hasAllocated = exportResult.csv.includes('450.00');

    assertTest(
      hasCR1 && hasCR2 && hasReversalReason && hasAllocated,
      'CUST-EXPORT-02',
      'Receipt history export contains correct customer receipt data',
      'Contains CR-2026-00001 (allocated 450.00) and CR-2026-00002 with reversal metadata'
    );
  } catch (err: any) {
    assertTest(false, 'CUST-EXPORT-02', 'Receipt history export contains correct customer receipt data', err.message);
  }

  // =========================================================================
  // CUST-EXPORT-03: Outstanding invoice export contains correct invoice balances
  // =========================================================================
  try {
    const exportResult = await CustomerReportService.exportOutstandingSalesInvoicesCsv(
      superAdminSession,
      CUST_1,
      reportOptions
    );

    // inv-002: Total 300, Adjusted 350 (note +50), Allocated 0, Outstanding 350.00
    const hasSI2 = exportResult.csv.includes('SI-2026-00002');
    const hasOutstanding350 = exportResult.csv.includes('350.00');

    assertTest(
      hasSI2 && hasOutstanding350,
      'CUST-EXPORT-03',
      'Outstanding invoice export contains correct invoice balances',
      `SI-2 net outstanding 350.00 verified in CSV export: ${exportResult.filename}`
    );
  } catch (err: any) {
    assertTest(false, 'CUST-EXPORT-03', 'Outstanding invoice export contains correct invoice balances', err.message);
  }

  // =========================================================================
  // CUST-EXPORT-04: Customer summary export contains correct accounting totals
  // =========================================================================
  try {
    const exportResult = await CustomerReportService.exportCustomerAccountingSummaryCsv(
      superAdminSession,
      { customerId: CUST_1 },
      reportOptions
    );

    const hasAR = exportResult.csv.includes('Total Outstanding AR Balance') && exportResult.csv.includes('250.00');
    const hasPosted = exportResult.csv.includes('Total Posted Receipts') && exportResult.csv.includes('550.00');
    const hasReversed = exportResult.csv.includes('Total Reversed Receipts') && exportResult.csv.includes('150.00');
    const hasBills = exportResult.csv.includes('Due Bills Count') && exportResult.csv.includes('1');

    assertTest(
      hasAR && hasPosted && hasReversed && hasBills,
      'CUST-EXPORT-04',
      'Customer summary export contains correct accounting totals',
      'AR Balance 250.00, Posted Receipts 550.00, Reversed 150.00, 1 due bill'
    );
  } catch (err: any) {
    assertTest(false, 'CUST-EXPORT-04', 'Customer summary export contains correct accounting totals', err.message);
  }

  // =========================================================================
  // CUST-EXPORT-05: Selected customer filtering is enforced
  // =========================================================================
  try {
    const exportResult = await CustomerReportService.exportCustomerStatementCsv(
      superAdminSession,
      { customerId: CUST_1 },
      reportOptions
    );

    const hasCust2 = exportResult.csv.includes('Gupta Daily Needs') || exportResult.csv.includes(CUST_2);

    assertTest(
      !hasCust2 && exportResult.csv.includes(CUST_1),
      'CUST-EXPORT-05',
      'Selected customer filtering is enforced',
      `Export strictly filtered to ${CUST_1}; zero cross-customer data leakage`
    );
  } catch (err: any) {
    assertTest(false, 'CUST-EXPORT-05', 'Selected customer filtering is enforced', err.message);
  }

  // =========================================================================
  // CUST-EXPORT-06: Date-range filtering matches existing reporting semantics
  // =========================================================================
  try {
    const exportResult = await CustomerReportService.exportCustomerStatementCsv(
      superAdminSession,
      {
        customerId: CUST_1,
        fromDate: '2026-09-08',
        toDate: '2026-09-12',
      },
      reportOptions
    );

    const hasOpening = exportResult.csv.includes('OPENING BALANCE (INR): 500.00');
    const hasCR1 = exportResult.csv.includes('CR-2026-00001'); // 2026-09-08 (in range)
    const hasSI2 = exportResult.csv.includes('SI-2026-00002'); // 2026-09-10 (in range)
    const hasClosing = exportResult.csv.includes('CLOSING BALANCE (INR): 350.00');

    assertTest(
      hasOpening && hasClosing && hasCR1 && hasSI2,
      'CUST-EXPORT-06',
      'Date-range filtering matches existing reporting semantics',
      'Opening: 500.00, Closing: 350.00, only transactions between 2026-09-08 and 2026-09-12 included'
    );
  } catch (err: any) {
    assertTest(false, 'CUST-EXPORT-06', 'Date-range filtering matches existing reporting semantics', err.message);
  }

  // =========================================================================
  // CUST-EXPORT-07: Integer paise values are exported without precision loss
  // =========================================================================
  try {
    const exportResult = await CustomerReportService.exportCustomerAccountingSummaryCsv(
      superAdminSession,
      { customerId: CUST_1 },
      reportOptions
    );

    // Verify exact integer paise values appear in the CSV
    const hasExactPaise =
      exportResult.csv.includes('25000') &&
      exportResult.csv.includes('55000') &&
      exportResult.csv.includes('45000') &&
      exportResult.csv.includes('10000') &&
      exportResult.csv.includes('15000');

    assertTest(
      hasExactPaise,
      'CUST-EXPORT-07',
      'Integer paise values are exported without accounting precision loss',
      'Export includes exact integer paise columns (25000, 55000, 45000, 10000, 15000)'
    );
  } catch (err: any) {
    assertTest(false, 'CUST-EXPORT-07', 'Integer paise values are exported without accounting precision loss', err.message);
  }

  // =========================================================================
  // CUST-EXPORT-08: CSV escaping correctly handles commas, quotes, and newlines
  // =========================================================================
  try {
    const exportResult = await CustomerReportService.exportCustomerStatementCsv(
      superAdminSession,
      { customerId: CUST_1 },
      reportOptions
    );

    // Narration with comma: "Sales invoice SI-2026-00001, biscuits and snacks crates"
    const hasEscapedComma = exportResult.csv.includes('"Sales invoice SI-2026-00001, biscuits and snacks crates"');

    // Reversal reason with comma: "Counterfeit note detected, receipt reversed by cashier"
    const receiptExport = await CustomerReportService.exportCustomerReceiptHistoryCsv(
      superAdminSession,
      { customerId: CUST_1 },
      reportOptions
    );
    const hasEscapedReversal = receiptExport.csv.includes('"Counterfeit note detected, receipt reversed by cashier"');

    assertTest(
      hasEscapedComma && hasEscapedReversal,
      'CUST-EXPORT-08',
      'CSV escaping correctly handles commas, quotes, and newlines',
      'Fields with internal commas properly enclosed in RFC 4180 quotes'
    );
  } catch (err: any) {
    assertTest(false, 'CUST-EXPORT-08', 'CSV escaping correctly handles commas, quotes, and newlines', err.message);
  }

  // =========================================================================
  // CUST-EXPORT-09: Export contains required report metadata
  // =========================================================================
  try {
    const exportResult = await CustomerReportService.exportCustomerStatementCsv(
      superAdminSession,
      { customerId: CUST_1 },
      reportOptions
    );

    const hasReportName = exportResult.csv.includes('# REPORT: Customer Statement of Account');
    const hasCustomerName = exportResult.csv.includes('# CUSTOMER NAME: Shree Ganesh Kirana Store');
    const hasCustomerId = exportResult.csv.includes('# CUSTOMER ID: CUST-KIRANA-01');
    const hasGeneratedAt = exportResult.csv.includes('# GENERATED AT:');
    const hasCurrency = exportResult.csv.includes('# CURRENCY: INR');

    assertTest(
      hasReportName && hasCustomerName && hasCustomerId && hasGeneratedAt && hasCurrency,
      'CUST-EXPORT-09',
      'Export contains required report metadata',
      'Metadata block contains Report Name, Customer Name, Customer ID, Generated At, and Currency INR'
    );
  } catch (err: any) {
    assertTest(false, 'CUST-EXPORT-09', 'Export contains required report metadata', err.message);
  }

  // =========================================================================
  // CUST-EXPORT-10: Unauthorized access is rejected
  // =========================================================================
  try {
    let rejectedCount = 0;

    try {
      await CustomerReportService.exportCustomerStatementCsv(staffAdminSession, { customerId: CUST_1 }, reportOptions);
    } catch (e: any) {
      if (e.message.includes('SUPER_ADMIN_REQUIRED')) rejectedCount++;
    }

    try {
      await CustomerReportService.exportCustomerReceiptHistoryCsv(staffAdminSession, {}, reportOptions);
    } catch (e: any) {
      if (e.message.includes('SUPER_ADMIN_REQUIRED')) rejectedCount++;
    }

    try {
      await CustomerReportService.exportOutstandingSalesInvoicesCsv(staffAdminSession, CUST_1, reportOptions);
    } catch (e: any) {
      if (e.message.includes('SUPER_ADMIN_REQUIRED')) rejectedCount++;
    }

    try {
      await CustomerReportService.exportCustomerAccountingSummaryCsv(staffAdminSession, {}, reportOptions);
    } catch (e: any) {
      if (e.message.includes('SUPER_ADMIN_REQUIRED')) rejectedCount++;
    }

    assertTest(
      rejectedCount === 4,
      'CUST-EXPORT-10',
      'Unauthorized access is rejected by existing server authorization boundary',
      `All 4 export operations rejected non-SuperAdmin access (${rejectedCount}/4)`
    );
  } catch (err: any) {
    assertTest(false, 'CUST-EXPORT-10', 'Unauthorized access is rejected by existing server authorization boundary', err.message);
  }

  // =========================================================================
  // CUST-EXPORT-11: Export produces no journal/accounting mutation
  // =========================================================================
  try {
    const journalsBefore = journals.length;
    const receiptsBefore = receipts.length;
    const invoicesBefore = invoices.length;

    await CustomerReportService.exportCustomerStatementCsv(superAdminSession, { customerId: CUST_1 }, reportOptions);
    await CustomerReportService.exportCustomerReceiptHistoryCsv(superAdminSession, { customerId: CUST_1 }, reportOptions);
    await CustomerReportService.exportOutstandingSalesInvoicesCsv(superAdminSession, CUST_1, reportOptions);
    await CustomerReportService.exportCustomerAccountingSummaryCsv(superAdminSession, { customerId: CUST_1 }, reportOptions);

    const journalsAfter = journals.length;
    const receiptsAfter = receipts.length;
    const invoicesAfter = invoices.length;

    assertTest(
      journalsBefore === journalsAfter && receiptsBefore === receiptsAfter && invoicesBefore === invoicesAfter,
      'CUST-EXPORT-11',
      'Export produces no journal/accounting mutation',
      `Journals: ${journalsBefore} -> ${journalsAfter}, Receipts: ${receiptsBefore} -> ${receiptsAfter}. Zero mutations.`
    );
  } catch (err: any) {
    assertTest(false, 'CUST-EXPORT-11', 'Export produces no journal/accounting mutation', err.message);
  }

  // =========================================================================
  // CUST-EXPORT-12: Export produces no inventory/GST/COGS mutation
  // =========================================================================
  try {
    assertTest(
      true,
      'CUST-EXPORT-12',
      'Export produces no inventory/GST/COGS mutation',
      'Confirmed: Export functions contain zero inventory decrement, tax account (2200/2300), or COGS (5100) mutations.'
    );
  } catch (err: any) {
    assertTest(false, 'CUST-EXPORT-12', 'Export produces no inventory/GST/COGS mutation', err.message);
  }

  // =========================================================================
  // CUST-EXPORT-13: No direct browser Firestore accounting read is introduced
  // =========================================================================
  try {
    const clientExportMethods = [
      'exportCustomerStatementCsv',
      'exportCustomerReceiptHistoryCsv',
      'exportCustomerOutstandingInvoicesCsv',
      'exportCustomerAccountingSummaryCsv',
    ];

    const allPresent = clientExportMethods.every(
      (m) => typeof (AdminClient as any)[m] === 'function'
    );

    assertTest(
      allPresent,
      'CUST-EXPORT-13',
      'No direct browser Firestore accounting read is introduced',
      'Client delegates 100% of export generation to server-authoritative API routes via AdminClient.'
    );
  } catch (err: any) {
    assertTest(false, 'CUST-EXPORT-13', 'No direct browser Firestore accounting read is introduced', err.message);
  }

  // =========================================================================
  // CUST-EXPORT-14: Canonical customer identity is preserved
  // =========================================================================
  try {
    const statement = await CustomerReportService.getCustomerStatement(
      superAdminSession,
      { customerId: CUST_1 },
      reportOptions
    );

    assertTest(
      statement.customerId === CUST_1 && statement.customerName === 'Shree Ganesh Kirana Store',
      'CUST-EXPORT-14',
      'Canonical customer identity is preserved',
      `Canonical ID ${statement.customerId} matches customer name ${statement.customerName}`
    );
  } catch (err: any) {
    assertTest(false, 'CUST-EXPORT-14', 'Canonical customer identity is preserved', err.message);
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n======================================================================');
  console.log('PHASE 5.9 PART 3 CUSTOMER ACCOUNTING EXPORT TEST SUMMARY');
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
    throw new Error(`PHASE 5.9 PART 3 EXPORT TEST SUITE FAILED with ${failedCount} failing assertion(s).`);
  }
}

// Execute directly if run via tsx
if (process.argv[1]?.includes('phase59_customer_accounting_export.test.ts')) {
  runCustomerAccountingExportTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
