/**
 * MR FUTKAR — Supplier Payment Types (Phase 5.8 Part 1)
 * Server-authoritative double-entry supplier payment types.
 * STRICTLY integer paise accounting.
 */

export type SupplierPaymentStatus = 'DRAFT' | 'POSTED' | 'REVERSED';
export type SupplierPaymentAccountingStatus = 'PENDING' | 'POSTED' | 'REVERSED';
export type SupplierPaymentAllocationStatus = 'UNALLOCATED' | 'PARTIALLY_ALLOCATED' | 'FULLY_ALLOCATED';

export type SupplierPaymentPaymentMethod =
  | 'CASH'
  | 'BANK_TRANSFER'
  | 'UPI'
  | 'NEFT'
  | 'RTGS'
  | 'CHEQUE'
  | 'OTHER';

export const ALLOWED_SUPPLIER_PAYMENT_METHODS: SupplierPaymentPaymentMethod[] = [
  'CASH',
  'BANK_TRANSFER',
  'UPI',
  'NEFT',
  'RTGS',
  'CHEQUE',
  'OTHER',
];

export interface SupplierSnapshot {
  supplierId: string;
  businessName: string;
  contactName?: string;
  mobile?: string;
  fullAddress?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
}

export interface SupplierPaymentCashAccountInfo {
  accountCode: string;
  accountName: string;
  accountType: string;
}

export interface SupplierPaymentAllocation {
  paymentId: string;
  invoiceId: string;
  invoiceNumber: string;
  supplierId: string;
  allocatedAmountPaise: number;
  createdAt: string;
  allocatedAt?: string;
}

export interface SupplierPaymentAllocationInput {
  invoiceId: string;
  amountPaise: number;
  allocatedAmountPaise?: number;
}

export interface AllocateSupplierPaymentPayload {
  allocations: SupplierPaymentAllocationInput[];
  idempotencyKey?: string;
}

export interface AllocateSupplierPaymentResponse {
  success: boolean;
  payment: SupplierPayment;
  isIdempotentReplay?: boolean;
}

export interface EligiblePurchaseInvoiceForAllocation {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  grandTotal: number;
  grandTotalPaise: number;
  adjustedTotalPaise: number;
  alreadyAllocatedPaise: number;
  outstandingAmountPaise: number;
  paymentStatus: string;
}

export interface SupplierPayment {
  paymentId: string;
  paymentNumber: string;
  supplierId: string;
  supplierSnapshot: SupplierSnapshot;
  paymentDate: string; // YYYY-MM-DD
  amountPaise: number;
  paymentMethod: SupplierPaymentPaymentMethod;
  cashBankAccountCode: string;
  cashBankAccountInfo?: SupplierPaymentCashAccountInfo;
  referenceNumber?: string | null;
  notes?: string | null;
  status: SupplierPaymentStatus;
  accountingStatus: SupplierPaymentAccountingStatus;
  journalId: string | null;
  voucherNumber: string | null;
  createdAt: string;
  createdBy: string;
  postedAt: string | null;
  reversedAt: string | null;
  reversedBy?: string | null;
  reversalJournalId: string | null;
  reversalReason?: string | null;
  idempotencyKey?: string | null;
  version: number;
  allocations: SupplierPaymentAllocation[];
  allocatedAmountPaise: number;
  unallocatedAmountPaise: number;
  allocationStatus?: SupplierPaymentAllocationStatus;
}

export interface ReverseSupplierPaymentPayload {
  reason?: string | null;
  idempotencyKey?: string | null;
}

export interface ReverseSupplierPaymentResponse {
  success: boolean;
  payment: SupplierPayment;
  reversalJournal?: any;
  isIdempotentReplay?: boolean;
}

export interface CreateSupplierPaymentPayload {
  supplierId: string;
  amountPaise: number;
  paymentMethod: SupplierPaymentPaymentMethod;
  paymentDate?: string;
  cashBankAccountCode?: string;
  referenceNumber?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
}

export interface PostSupplierPaymentPayload {
  idempotencyKey?: string | null;
}

export interface PostSupplierPaymentResponse {
  payment: SupplierPayment;
  journal: any;
  isIdempotentReplay?: boolean;
}

export interface SupplierPaymentListFilters {
  supplierId?: string;
  paymentMethod?: SupplierPaymentPaymentMethod;
  status?: SupplierPaymentStatus;
  fromDate?: string;
  toDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface SupplierPaymentListResponse {
  payments: SupplierPayment[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// =========================================================================
// PHASE 5.8 PART 4 — SUPPLIER PAYMENT LEDGER & REPORTING TYPES
// =========================================================================

export type SupplierStatementTransactionType =
  | 'PURCHASE_INVOICE'
  | 'PURCHASE_DEBIT_NOTE'
  | 'PURCHASE_CREDIT_NOTE'
  | 'SUPPLIER_PAYMENT'
  | 'JOURNAL_ENTRY';

export interface SupplierStatementFilter {
  supplierId: string;
  fromDate?: string;
  toDate?: string;
  transactionType?: SupplierStatementTransactionType;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface SupplierStatementTransaction {
  date: string;
  transactionId: string;
  referenceId?: string;
  referenceNumber?: string;
  voucherNumber?: string;
  transactionType: SupplierStatementTransactionType;
  documentType: SupplierStatementTransactionType;
  narration: string;
  debit: number;
  debitPaise: number;
  credit: number;
  creditPaise: number;
  runningBalance: number;
  runningBalancePaise: number;
  status: string;
}

export interface SupplierStatementResponse {
  success: boolean;
  supplierId: string;
  supplierName: string;
  supplierSnapshot?: SupplierSnapshot;
  filter: {
    supplierId: string;
    fromDate?: string;
    toDate?: string;
    transactionType?: SupplierStatementTransactionType;
    status?: string;
  };
  openingBalance: number;
  openingBalancePaise: number;
  totalPurchaseInvoiceDebits: number;
  totalPurchaseInvoiceDebitsPaise: number;
  totalPurchaseInvoiceCredits: number;
  totalPurchaseInvoiceCreditsPaise: number;
  totalSupplierPayments: number;
  totalSupplierPaymentsPaise: number;
  totalPaymentAllocations: number;
  totalPaymentAllocationsPaise: number;
  totalPaymentReversals: number;
  totalPaymentReversalsPaise: number;
  currentOutstandingAPBalance: number;
  currentOutstandingAPPaise: number;
  periodDebit: number;
  periodDebitPaise: number;
  periodCredit: number;
  periodCreditPaise: number;
  closingBalance: number;
  closingBalancePaise: number;
  transactions: SupplierStatementTransaction[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface SupplierPaymentHistoryFilter {
  supplierId?: string;
  paymentMethod?: SupplierPaymentPaymentMethod;
  status?: SupplierPaymentStatus;
  fromDate?: string;
  toDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface SupplierPaymentHistoryItem {
  paymentId: string;
  paymentNumber: string;
  voucherNumber: string;
  supplierId: string;
  supplierName: string;
  supplierSnapshot?: SupplierSnapshot;
  paymentMethod: SupplierPaymentPaymentMethod;
  amount: number;
  amountPaise: number;
  status: SupplierPaymentStatus;
  accountingStatus: SupplierPaymentAccountingStatus;
  paymentDate: string;
  allocatedAmount: number;
  allocatedAmountPaise: number;
  unallocatedAmount: number;
  unallocatedAmountPaise: number;
  allocationStatus?: SupplierPaymentAllocationStatus;
  allocations?: SupplierPaymentAllocation[];
  reversalStatus: 'NOT_REVERSED' | 'REVERSED';
  isReversed: boolean;
  reversedAt?: string | null;
  reversalJournalId?: string | null;
  reversalReason?: string | null;
  journalId?: string | null;
  cashBankAccountCode: string;
  notes?: string | null;
  referenceNumber?: string | null;
}

export interface SupplierPaymentHistoryResponse {
  success: boolean;
  payments: SupplierPaymentHistoryItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: {
    totalPaymentsCount: number;
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

export interface OutstandingPurchaseInvoiceItem {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  supplierId: string;
  supplierName: string;
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

export interface SupplierOutstandingInvoicesResponse {
  success: boolean;
  supplierId: string;
  supplierName?: string;
  invoices: OutstandingPurchaseInvoiceItem[];
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

export interface SupplierAccountingSummaryResponse {
  success: boolean;
  supplierId?: string;
  supplierName?: string;
  totalOutstandingAP: number;
  totalOutstandingAPPaise: number;
  totalPostedPayments: number;
  totalPostedPaymentsPaise: number;
  totalReversedPayments: number;
  totalReversedPaymentsPaise: number;
  totalAllocatedPayments: number;
  totalAllocatedPaymentsPaise: number;
  totalUnallocatedPayments: number;
  totalUnallocatedPaymentsPaise: number;
  numberOfOutstandingInvoices: number;
}
