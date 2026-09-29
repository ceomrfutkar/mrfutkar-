/**
 * MR FUTKAR — Credit Note & Debit Note Architecture (Phase 5.6)
 * Server-Authoritative Types, Lifecycle, Snapshots, & Monetary Calculations
 */

import { InvoiceAddressSnapshot, toPaise, toRupees } from './invoice';

export type CreditDebitNoteType =
  | 'SALES_CREDIT_NOTE'
  | 'SALES_DEBIT_NOTE'
  | 'PURCHASE_CREDIT_NOTE'
  | 'PURCHASE_DEBIT_NOTE';

export type CreditDebitNoteStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';

export type NoteAccountingStatus = 'NOT_POSTED' | 'POSTED';

export interface WarehouseSnapshot {
  warehouseId: string;
  name: string;
  city: string;
  branch: string;
  address?: string;
  pincode?: string;
}

export interface CreditDebitNoteItem {
  productId: string;
  skuSnapshot: string;
  productNameSnapshot: string;
  quantity: number;
  unitPrice: number; // or unitCost for purchase notes, in Rupees
  discountAmount: number; // in Rupees
  taxableAmount: number; // (unitPrice * quantity) - discountAmount
  taxRate: number; // Percentage, e.g. 0, 5, 12, 18, 28
  taxAmount: number; // taxableAmount * (taxRate / 100)
  lineTotal: number; // taxableAmount + taxAmount
}

export interface CreditDebitNoteItemInput {
  productId: string;
  quantity: number;
  unitPrice?: number;
  discountAmount?: number;
  taxRate?: number;
  skuSnapshot?: string;
  productNameSnapshot?: string;
}

export interface CreditDebitNote {
  noteId: string;
  noteNumber: string; // e.g. SCN-2026-00001, SDN-2026-00001, PCN-2026-00001, PDN-2026-00001
  noteType: CreditDebitNoteType;
  status: CreditDebitNoteStatus;

  originalInvoiceId: string;
  originalInvoiceNumber: string;
  originalInvoiceDate?: string;

  customerId: string | null;
  supplierId: string | null;

  customerSnapshot: InvoiceAddressSnapshot | null;
  supplierSnapshot: InvoiceAddressSnapshot | null;

  warehouseId: string;
  warehouseSnapshot: WarehouseSnapshot;

  reason: string;
  items: CreditDebitNoteItem[];

  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  taxTotal: number;
  grandTotal: number;

  accountingStatus: NoteAccountingStatus;
  accountingJournalId?: string | null;
  accountingVoucherNumber?: string | null;
  accountingPostedAt?: string | null;

  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;

  version: number;
  idempotencyKey: string | null;
}

export interface CreateCreditDebitNotePayload {
  noteType: CreditDebitNoteType;
  originalInvoiceId: string;
  reason: string;
  items?: CreditDebitNoteItemInput[]; // if omitted or empty, applies to entire invoice
  idempotencyKey?: string | null;
}

export interface UpdateCreditDebitNotePayload {
  reason?: string;
  items?: CreditDebitNoteItemInput[];
}

export interface CalculatedNoteTotals {
  items: CreditDebitNoteItem[];
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  taxTotal: number;
  grandTotal: number;
}

/**
 * Server-authoritative calculation of note items and totals using integer paise
 */
export function calculateCreditDebitNoteTotals(
  rawItems: Array<{
    productId: string;
    skuSnapshot: string;
    productNameSnapshot: string;
    quantity: number;
    unitPrice: number;
    discountAmount?: number;
    taxRate?: number;
  }>
): CalculatedNoteTotals {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('EMPTY_ITEMS: Note must contain at least one item.');
  }

  let subtotalPaise = 0;
  let discountTotalPaise = 0;
  let taxableTotalPaise = 0;
  let taxTotalPaise = 0;
  let grandTotalPaise = 0;

  const items: CreditDebitNoteItem[] = rawItems.map((raw, idx) => {
    if (!raw.productId || typeof raw.productId !== 'string') {
      throw new Error(`INVALID_ITEM_PRODUCT: Item at line ${idx + 1} is missing productId.`);
    }

    const qty = Number(raw.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new Error(`INVALID_ITEM_QUANTITY: Line ${idx + 1} quantity must be a positive integer.`);
    }

    const unitPrice = Number(raw.unitPrice);
    if (isNaN(unitPrice) || !isFinite(unitPrice) || unitPrice < 0) {
      throw new Error(`INVALID_ITEM_PRICE: Line ${idx + 1} unitPrice must be >= 0.`);
    }

    const discountAmount = Number(raw.discountAmount || 0);
    if (isNaN(discountAmount) || !isFinite(discountAmount) || discountAmount < 0) {
      throw new Error(`INVALID_ITEM_DISCOUNT: Line ${idx + 1} discountAmount must be >= 0.`);
    }

    const taxRate = Number(raw.taxRate || 0);
    if (isNaN(taxRate) || !isFinite(taxRate) || taxRate < 0) {
      throw new Error(`INVALID_ITEM_TAX_RATE: Line ${idx + 1} taxRate must be >= 0.`);
    }

    const unitPricePaise = toPaise(unitPrice);
    const lineGrossPaise = unitPricePaise * qty;
    const discountPaise = toPaise(discountAmount);

    if (discountPaise > lineGrossPaise) {
      throw new Error(`EXCESSIVE_DISCOUNT: Line ${idx + 1} discount cannot exceed line gross value.`);
    }

    const taxablePaise = lineGrossPaise - discountPaise;
    const taxPaise = Math.round((taxablePaise * taxRate) / 100);
    const lineTotalPaise = taxablePaise + taxPaise;

    subtotalPaise += lineGrossPaise;
    discountTotalPaise += discountPaise;
    taxableTotalPaise += taxablePaise;
    taxTotalPaise += taxPaise;
    grandTotalPaise += lineTotalPaise;

    return {
      productId: raw.productId.trim(),
      skuSnapshot: (raw.skuSnapshot || raw.productId).trim(),
      productNameSnapshot: (raw.productNameSnapshot || 'Product').trim(),
      quantity: qty,
      unitPrice: toRupees(unitPricePaise),
      discountAmount: toRupees(discountPaise),
      taxableAmount: toRupees(taxablePaise),
      taxRate: Number(taxRate.toFixed(2)),
      taxAmount: toRupees(taxPaise),
      lineTotal: toRupees(lineTotalPaise),
    };
  });

  return {
    items,
    subtotal: toRupees(subtotalPaise),
    discountTotal: toRupees(discountTotalPaise),
    taxableTotal: toRupees(taxableTotalPaise),
    taxTotal: toRupees(taxTotalPaise),
    grandTotal: toRupees(grandTotalPaise),
  };
}
