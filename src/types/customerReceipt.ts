/**
 * MR FUTKAR — Customer Receipt Foundation Types (Phase 5.7 Part 2A)
 * Represents server-authoritative money received from Kirana retailers/customers.
 * STRICTLY integer paise accounting.
 */

export type CustomerReceiptStatus = 'DRAFT' | 'POSTED' | 'REVERSED';

export type CustomerReceiptAllocationStatus = 'UNALLOCATED' | 'PARTIALLY_ALLOCATED' | 'FULLY_ALLOCATED';

export type CustomerReceiptPaymentMethod =
  | 'CASH'
  | 'BANK_TRANSFER'
  | 'UPI'
  | 'CHEQUE'
  | 'OTHER';

export const ALLOWED_PAYMENT_METHODS: CustomerReceiptPaymentMethod[] = [
  'CASH',
  'BANK_TRANSFER',
  'UPI',
  'CHEQUE',
  'OTHER',
];

export interface CustomerReceiptCustomerSnapshot {
  retailerId: string;
  businessName: string;
  ownerName: string;
  mobile: string;
  billingAddress: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  isActive?: boolean;
}

export interface CustomerReceiptCashAccountInfo {
  accountCode: string;
  accountName: string;
  accountType: string;
}

export interface CustomerReceiptAllocation {
  receiptId: string;
  invoiceId: string;
  invoiceNumber: string;
  retailerId: string;
  customerId: string;
  allocatedAmountPaise: number;
  createdAt: string;
  allocatedAt?: string;
}

export interface CustomerReceiptAllocationInput {
  invoiceId: string;
  amountPaise: number;
}

export interface AllocateCustomerReceiptPayload {
  allocations: CustomerReceiptAllocationInput[];
  idempotencyKey?: string;
}

export interface AllocateCustomerReceiptResponse {
  success: boolean;
  receipt: CustomerReceipt;
  isIdempotentReplay?: boolean;
}

export interface EligibleInvoiceForAllocation {
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

export interface CustomerReceipt {
  receiptId: string;
  receiptNumber: string;
  customerId: string;
  customerSnapshot: CustomerReceiptCustomerSnapshot;
  receiptDate: string; // YYYY-MM-DD (Asia/Kolkata)
  amountPaise: number; // Positive integer paise
  paymentMethod: CustomerReceiptPaymentMethod;
  cashBankAccountCode: string;
  cashBankAccountInfo?: CustomerReceiptCashAccountInfo;
  referenceNumber?: string | null;
  notes?: string | null;
  allocations: CustomerReceiptAllocation[];
  allocatedAmountPaise?: number;
  unallocatedAmountPaise: number;
  allocationStatus?: CustomerReceiptAllocationStatus;
  status: CustomerReceiptStatus;
  journalId?: string | null;
  voucherNumber?: string | null;
  createdBy: string;
  createdAt: string;
  postedAt?: string | null;
  reversedAt?: string | null;
  reversalJournalId?: string | null;
  reversalReason?: string | null;
  reversedBy?: string | null;
  idempotencyKey?: string | null;
  sourceOrderId?: string | null;
  codCollectionId?: string | null;
  version: number;
}

export interface ReverseCustomerReceiptPayload {
  reason?: string;
  idempotencyKey?: string;
}

export interface ReverseCustomerReceiptResponse {
  success: boolean;
  receipt: CustomerReceipt;
  reversalJournal?: any;
  isIdempotentReplay?: boolean;
}

export interface CreateCustomerReceiptPayload {
  customerId: string;
  receiptDate?: string;
  amountPaise: number;
  paymentMethod: CustomerReceiptPaymentMethod;
  cashBankAccountCode?: string;
  referenceNumber?: string;
  notes?: string;
  idempotencyKey?: string;
  sourceOrderId?: string;
  codCollectionId?: string;
}

export interface PostCustomerReceiptPayload {
  idempotencyKey?: string;
}

export interface PostCustomerReceiptResponse {
  success: boolean;
  receipt: CustomerReceipt;
  journal?: any;
  isIdempotentReplay?: boolean;
}

export interface CustomerReceiptListFilters {
  customerId?: string;
  paymentMethod?: CustomerReceiptPaymentMethod;
  status?: CustomerReceiptStatus;
  fromDate?: string;
  toDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CustomerReceiptListResponse {
  success: boolean;
  receipts: CustomerReceipt[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

// =========================================================================
// PHASE 5.7 PART 2E: CUSTOMER RECEIPT RECONCILIATION & REPORTING TYPES
// =========================================================================

export type CustomerReceiptInconsistencyCode =
  | 'ORPHAN_ALLOCATION'
  | 'CROSS_RETAILER_ALLOCATION'
  | 'ALLOCATION_EXCEEDS_RECEIPT_AMOUNT'
  | 'ALLOCATION_EXCEEDS_INVOICE_OUTSTANDING'
  | 'INCORRECT_INVOICE_BALANCE'
  | 'RECEIPT_ALLOCATION_MISMATCH'
  | 'MISSING_ORIGINAL_JOURNAL'
  | 'MISSING_REVERSAL_JOURNAL'
  | 'INCORRECT_REVERSAL_LINKAGE'
  | 'DUPLICATE_ALLOCATION_RECORD'
  | 'UNRESOLVED_RETAILER_REFERENCE'
  | 'ACCOUNTING_JOURNAL_IMBALANCE'
  | 'INVALID_RECEIPT_AMOUNT'
  | 'REVERSED_AMOUNT_MISMATCH';

export interface CustomerReceiptInconsistency {
  code: CustomerReceiptInconsistencyCode;
  severity: 'ERROR' | 'WARNING';
  receiptId?: string;
  receiptNumber?: string;
  customerId?: string;
  invoiceId?: string;
  journalId?: string;
  reversalJournalId?: string;
  message: string;
  details?: Record<string, any>;
}

export interface CustomerReceiptReconciliationFilters {
  customerId?: string;
  receiptId?: string;
  fromDate?: string;
  toDate?: string;
  status?: CustomerReceiptStatus;
}

export interface CustomerReceiptReconciliationSummary {
  totalReceiptsChecked: number;
  totalActiveReceiptAmountPaise: number;
  totalActiveReceiptAmount: number;
  totalAllocatedAmountPaise: number;
  totalAllocatedAmount: number;
  totalUnallocatedAmountPaise: number;
  totalUnallocatedAmount: number;
  totalReversedAmountPaise: number;
  totalReversedAmount: number;
  invoicesChecked: number;
  ledgerChecksPerformed: number;
  inconsistencyCount: number;
  isFullyReconciled: boolean;
}

export interface CustomerReceiptReconciliationResult {
  success: boolean;
  timestamp: string;
  filters: CustomerReceiptReconciliationFilters;
  summary: CustomerReceiptReconciliationSummary;
  inconsistencies: CustomerReceiptInconsistency[];
}

