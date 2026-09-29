/**
 * MR FUTKAR — Party Ledger Architecture (Phase 5.7 Part 1)
 * Customer Receivable Ledger (1300) & Supplier Payable Ledger (2100)
 * Strictly DERIVED from posted double-entry journal entries and lines
 */

import { VoucherType, JournalStatus } from './accounting';

export type PartyType = 'CUSTOMER' | 'SUPPLIER';

export type CustomerDocumentType =
  | 'SALES_INVOICE'
  | 'SALES_CREDIT_NOTE'
  | 'SALES_DEBIT_NOTE'
  | 'CUSTOMER_RECEIPT'
  | 'JOURNAL_ENTRY';

export type SupplierDocumentType =
  | 'PURCHASE_INVOICE'
  | 'PURCHASE_DEBIT_NOTE'
  | 'PURCHASE_CREDIT_NOTE'
  | 'SUPPLIER_PAYMENT'
  | 'JOURNAL_ENTRY';

export interface CustomerSnapshotInfo {
  customerId: string;
  shopName: string;
  ownerName: string;
  mobile: string;
  fullAddress: string;
  city: string;
  state: string;
  pincode: string;
  gstin?: string;
  authUid?: string;
}

export interface SupplierSnapshotInfo {
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

export interface CustomerLedgerEntry {
  entryId: string; // lineId
  date: string; // YYYY-MM-DD
  journalId: string;
  journalNumber: string;
  voucherType: VoucherType | string;
  documentType: CustomerDocumentType;
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  narration: string;
  debit: number; // in Rupees (increases receivable)
  credit: number; // in Rupees (reduces receivable)
  runningBalance: number; // in Rupees (Receivable Balance)
  customerId: string;
  customerName?: string;
  lineId: string;
  status: JournalStatus;
}

export interface CustomerLedgerFilter {
  /**
   * Authoritative canonical retailerId.
   * Client-supplied authUid or unverified IDs must NEVER be passed here.
   */
  customerId: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}

export interface CustomerLedgerPagination {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface CustomerLedgerResponse {
  success: boolean;
  customer: CustomerSnapshotInfo;
  account: {
    accountId: string;
    accountCode: string;
    accountName: string;
    normalBalance: 'DEBIT';
  };
  filter: {
    customerId: string;
    fromDate?: string;
    toDate?: string;
  };
  openingBalance: number;
  periodDebit: number;
  periodCredit: number;
  closingBalance: number;
  entries: CustomerLedgerEntry[];
  pagination: CustomerLedgerPagination;
}

export interface CustomerLedgerSummaryItem {
  customerId: string;
  shopName: string;
  ownerName: string;
  mobile: string;
  city: string;
  state: string;
  gstin?: string;
  totalDebit: number;
  totalCredit: number;
  outstandingBalance: number;
  transactionCount: number;
  lastTransactionDate: string | null;
}

export interface CustomerLedgerSummaryResponse {
  success: boolean;
  customers: CustomerLedgerSummaryItem[];
  totalCount: number;
  aggregate: {
    totalOutstandingReceivable: number;
    totalCustomersWithBalance: number;
    glReceivableBalance: number;
    isReconciledWithGL: boolean;
  };
}

export interface SupplierLedgerEntry {
  entryId: string; // lineId
  date: string; // YYYY-MM-DD
  journalId: string;
  journalNumber: string;
  voucherType: VoucherType | string;
  documentType: SupplierDocumentType;
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  narration: string;
  debit: number; // in Rupees (reduces payable)
  credit: number; // in Rupees (increases payable)
  runningBalance: number; // in Rupees (Payable Balance)
  supplierId: string;
  supplierName?: string;
  lineId: string;
  status: JournalStatus;
}

export interface SupplierLedgerFilter {
  supplierId: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}

export interface SupplierLedgerPagination {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface SupplierLedgerResponse {
  success: boolean;
  supplier: SupplierSnapshotInfo;
  account: {
    accountId: string;
    accountCode: string;
    accountName: string;
    normalBalance: 'CREDIT';
  };
  filter: {
    supplierId: string;
    fromDate?: string;
    toDate?: string;
  };
  openingBalance: number;
  periodDebit: number;
  periodCredit: number;
  closingBalance: number;
  entries: SupplierLedgerEntry[];
  pagination: SupplierLedgerPagination;
}

export interface SupplierLedgerSummaryItem {
  supplierId: string;
  businessName: string;
  contactName?: string;
  mobile?: string;
  city?: string;
  state?: string;
  gstin?: string;
  totalCredit: number;
  totalDebit: number;
  outstandingBalance: number;
  transactionCount: number;
  lastTransactionDate: string | null;
}

export interface SupplierLedgerSummaryResponse {
  success: boolean;
  suppliers: SupplierLedgerSummaryItem[];
  totalCount: number;
  aggregate: {
    totalOutstandingPayable: number;
    totalSuppliersWithBalance: number;
    glPayableBalance: number;
    isReconciledWithGL: boolean;
  };
}

// =========================================================================
// RETAILER SELF-LEDGER TYPES (PHASE 5.7 PART 1A)
// =========================================================================

export interface RetailerLedgerRow {
  date: string;
  documentType: CustomerDocumentType;
  documentNumber: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface RetailerSelfLedgerResponse {
  success: boolean;
  customerId: string;
  retailerId: string;
  authUid?: string;
  customer: {
    customerId: string;
    shopName: string;
    ownerName: string;
    city: string;
    state: string;
  };
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  currentOutstanding: number;
  runningBalance: number;
  transactionCount: number;
  transactions: RetailerLedgerRow[];
  rows: RetailerLedgerRow[];
  pagination: CustomerLedgerPagination;
  filter: {
    fromDate: string | null;
    toDate: string | null;
  };
}

