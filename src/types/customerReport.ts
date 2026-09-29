/**
 * MR FUTKAR — Customer Accounts Receivable (AR) Reporting Types (Phase 5.9 Part 2)
 * Server-authoritative double-entry customer AR reporting types.
 * STRICTLY integer paise accounting. Zero data mutations.
 * Derives financial truth strictly from Account 1300 posted accounting journals,
 * sales invoices, and customer receipts.
 */

import {
  CustomerReceiptPaymentMethod,
  CustomerReceiptStatus,
} from './customerReceipt';

export type CustomerStatementTransactionType =
  | 'SALES_INVOICE'
  | 'SALES_CREDIT_NOTE'
  | 'SALES_DEBIT_NOTE'
  | 'CUSTOMER_RECEIPT'
  | 'JOURNAL_ENTRY';

export interface CustomerStatementFilter {
  /** Canonical customer/retailer ID (Required) */
  customerId: string;
  fromDate?: string; // YYYY-MM-DD
  toDate?: string; // YYYY-MM-DD
  transactionType?: CustomerStatementTransactionType;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface CustomerStatementTransaction {
  date: string; // YYYY-MM-DD
  transactionId: string;
  referenceId?: string;
  referenceNumber?: string;
  voucherNumber?: string;
  transactionType: CustomerStatementTransactionType;
  documentType: CustomerStatementTransactionType;
  narration: string;
  debit: number; // in Rupees (increases receivable)
  debitPaise: number; // integer paise
  credit: number; // in Rupees (reduces receivable)
  creditPaise: number; // integer paise
  runningBalance: number; // in Rupees
  runningBalancePaise: number; // integer paise
  status: string;
}

export interface CustomerSnapshot {
  customerId: string;
  shopName: string;
  ownerName?: string;
  mobile?: string;
  fullAddress?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  authUid?: string;
}

export interface CustomerStatementResponse {
  success: boolean;
  customerId: string;
  customerName: string;
  customerSnapshot?: CustomerSnapshot;
  filter: {
    customerId: string;
    fromDate?: string;
    toDate?: string;
    transactionType?: CustomerStatementTransactionType;
    status?: string;
  };
  openingBalance: number;
  openingBalancePaise: number;
  totalSalesInvoiceDebits: number;
  totalSalesInvoiceDebitsPaise: number;
  totalSalesInvoiceCredits: number;
  totalSalesInvoiceCreditsPaise: number;
  totalCustomerReceipts: number;
  totalCustomerReceiptsPaise: number;
  totalReceiptAllocations: number;
  totalReceiptAllocationsPaise: number;
  totalReceiptReversals: number;
  totalReceiptReversalsPaise: number;
  currentOutstandingARBalance: number;
  currentOutstandingARPaise: number;
  periodDebit: number;
  periodDebitPaise: number;
  periodCredit: number;
  periodCreditPaise: number;
  closingBalance: number;
  closingBalancePaise: number;
  transactions: CustomerStatementTransaction[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface CustomerReceiptHistoryFilter {
  customerId?: string;
  paymentMethod?: CustomerReceiptPaymentMethod;
  status?: CustomerReceiptStatus;
  fromDate?: string;
  toDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CustomerReceiptHistoryItem {
  receiptId: string;
  receiptNumber: string;
  voucherNumber?: string | null;
  customerId: string;
  customerName: string;
  customerSnapshot?: any;
  paymentMethod: CustomerReceiptPaymentMethod;
  amount: number;
  amountPaise: number;
  status: CustomerReceiptStatus;
  paymentDate: string; // YYYY-MM-DD
  receiptDate: string; // YYYY-MM-DD
  allocatedAmount: number;
  allocatedAmountPaise: number;
  unallocatedAmount: number;
  unallocatedAmountPaise: number;
  reversalStatus: 'NOT_REVERSED' | 'REVERSED';
  isReversed: boolean;
  reversedAt?: string | null;
  reversedBy?: string | null;
  reversalJournalId?: string | null;
  reversalReason?: string | null;
  journalId?: string | null;
  cashBankAccountCode: string;
  notes?: string | null;
  referenceNumber?: string | null;
  createdAt: string;
  postedAt?: string | null;
}

export interface CustomerReceiptHistoryResponse {
  success: boolean;
  receipts: CustomerReceiptHistoryItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: {
    totalReceiptsCount: number;
    totalAmount: number;
    totalAmountPaise: number;
    totalAllocatedAmount: number;
    totalAllocatedAmountPaise: number;
    totalUnallocatedAmount: number;
    totalUnallocatedAmountPaise: number;
    totalReversedAmount: number;
    totalReversedAmountPaise: number;
  };
}

export interface OutstandingSalesInvoiceItem {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerId: string;
  customerName: string;
  invoiceTotal: number;
  invoiceTotalPaise: number;
  adjustedTotal: number;
  adjustedTotalPaise: number;
  allocatedAmount: number;
  allocatedAmountPaise: number;
  outstandingAmount: number;
  outstandingAmountPaise: number;
  invoiceStatus: string;
  paymentStatus: string;
}

export interface CustomerOutstandingInvoicesResponse {
  success: boolean;
  customerId: string;
  customerName?: string;
  invoices: OutstandingSalesInvoiceItem[];
  totalCount: number;
  summary: {
    totalInvoiceAmount: number;
    totalInvoiceAmountPaise: number;
    totalAllocatedAmount: number;
    totalAllocatedAmountPaise: number;
    totalOutstandingAmount: number;
    totalOutstandingAmountPaise: number;
  };
}

export interface CustomerAccountingSummaryResponse {
  success: boolean;
  customerId?: string;
  customerName?: string;
  totalOutstandingAR: number;
  totalOutstandingARPaise: number;
  totalPostedReceipts: number;
  totalPostedReceiptsPaise: number;
  totalReversedReceipts: number;
  totalReversedReceiptsPaise: number;
  totalAllocatedReceipts: number;
  totalAllocatedReceiptsPaise: number;
  totalUnallocatedReceipts: number;
  totalUnallocatedReceiptsPaise: number;
  dueBillsCount: number;
  numberOfOutstandingInvoices: number;
  customerARBalance?: number;
  customerARBalancePaise?: number;
  openingBalance?: number;
  openingBalancePaise?: number;
  closingBalance?: number;
  closingBalancePaise?: number;
  periodDebit?: number;
  periodDebitPaise?: number;
  periodCredit?: number;
  periodCreditPaise?: number;
}
