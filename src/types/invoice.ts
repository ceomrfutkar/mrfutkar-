/**
 * MR FUTKAR — Sales & Purchase Invoice Architecture (Phase 5.5 Part 1)
 * Authoritative Data Models, Lifecycle, Snapshots, & Monetary Calculations
 */

export type SalesInvoiceStatus = 'DRAFT' | 'ISSUED' | 'CANCELLED';
export type PurchaseInvoiceStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';
export type InvoicePaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
export type InvoiceAccountingStatus = 'NOT_POSTED' | 'POSTED';

export interface InvoiceAddressSnapshot {
  businessName: string;
  contactName: string;
  mobile: string;
  fullAddress: string;
  landmark?: string;
  city: string;
  state?: string;
  pincode: string;
  gstin?: string;
}

export interface SalesInvoiceItem {
  productId: string;
  skuSnapshot: string;
  productNameSnapshot: string;
  quantity: number;
  unitPrice: number; // in Rupees, accurate to 2 decimal places
  discountAmount: number; // item-level discount in Rupees
  taxableAmount: number; // (unitPrice * quantity) - discountAmount
  taxRate: number; // Percentage, e.g. 0, 5, 12, 18, 28
  taxAmount: number; // taxableAmount * (taxRate / 100)
  lineTotal: number; // taxableAmount + taxAmount
}

export interface SalesInvoiceItemInput {
  productId: string;
  quantity: number;
  unitPrice?: number;
  discountAmount?: number;
  taxRate?: number;
  skuSnapshot?: string;
  productNameSnapshot?: string;
}

export interface SalesInvoice {
  invoiceId: string;
  invoiceNumber: string; // e.g. SI-2026-00001
  invoiceDate: string; // YYYY-MM-DD
  invoiceStatus: SalesInvoiceStatus;

  customerId: string; // references retailers/{retailerId}
  customerType: 'RETAILER';

  sourceOrderId: string | null; // optional reference to orders/{orderId}

  warehouseId: string; // e.g. WH-BRAHMPURI-01

  billingAddressSnapshot: InvoiceAddressSnapshot;
  shippingAddressSnapshot: InvoiceAddressSnapshot;

  items: SalesInvoiceItem[];

  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  taxTotal: number;
  grandTotal: number;
  grandTotalPaise?: number;

  paymentStatus: InvoicePaymentStatus;
  paidAmountPaise?: number;
  outstandingAmountPaise?: number;
  allocations?: Array<{
    receiptId: string;
    receiptNumber?: string;
    allocatedAmountPaise: number;
    createdAt: string;
  }>;
  accountingStatus: InvoiceAccountingStatus;
  accountingJournalId?: string | null;
  accountingVoucherNumber?: string | null;
  accountingPostedAt?: string | null;

  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;

  version: number;
  idempotencyKey: string | null;
}

export interface PurchaseInvoiceItem {
  productId: string;
  skuSnapshot: string;
  productNameSnapshot: string;
  quantity: number;
  unitCost: number; // in Rupees
  discountAmount: number; // in Rupees
  taxableAmount: number;
  taxRate: number; // Percentage
  taxAmount: number;
  lineTotal: number;
}

export interface PurchaseInvoiceItemInput {
  productId: string;
  quantity: number;
  unitCost?: number;
  discountAmount?: number;
  taxRate?: number;
  skuSnapshot?: string;
  productNameSnapshot?: string;
}

export interface PurchaseInvoice {
  invoiceId: string;
  invoiceNumber: string; // e.g. PI-2026-00001
  invoiceDate: string; // YYYY-MM-DD
  invoiceStatus: PurchaseInvoiceStatus;

  supplierId: string | null; // nullable supplier linkage
  supplierType: string; // e.g. 'DISTRIBUTOR' | 'MANUFACTURER' | 'OTHER'
  supplierInvoiceNumber: string | null;

  warehouseId: string; // e.g. WH-BRAHMPURI-01

  billingAddressSnapshot: InvoiceAddressSnapshot;
  shippingAddressSnapshot: InvoiceAddressSnapshot;

  items: PurchaseInvoiceItem[];

  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  taxTotal: number;
  grandTotal: number;
  grandTotalPaise?: number;

  paymentStatus: InvoicePaymentStatus;
  paidAmountPaise?: number;
  outstandingAmountPaise?: number;
  allocations?: Array<{
    paymentId: string;
    paymentNumber?: string;
    allocatedAmountPaise: number;
    createdAt: string;
  }>;
  reversedAllocations?: Array<{
    paymentId: string;
    paymentNumber?: string;
    allocatedAmountPaise: number;
    createdAt: string;
    reversedAt: string;
    reversalReason?: string | null;
    reversalJournalId?: string | null;
  }>;
  accountingStatus: InvoiceAccountingStatus;
  accountingJournalId?: string | null;
  accountingVoucherNumber?: string | null;
  accountingPostedAt?: string | null;

  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;

  version: number;
  idempotencyKey: string | null;
}

// -------------------------------------------------------------
// Safe Monetary Calculations (Paise representation)
// -------------------------------------------------------------

export function toPaise(rupees: number): number {
  if (typeof rupees !== 'number' || isNaN(rupees) || !isFinite(rupees)) {
    throw new Error('INVALID_MONEY_VALUE: Amount must be a finite number');
  }
  return Math.round(rupees * 100);
}

export function toRupees(paise: number): number {
  if (typeof paise !== 'number' || isNaN(paise) || !isFinite(paise)) {
    throw new Error('INVALID_PAISE_VALUE: Paise must be a finite number');
  }
  return Number((paise / 100).toFixed(2));
}

export interface CalculatedInvoiceTotals<TItem> {
  items: TItem[];
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  taxTotal: number;
  grandTotal: number;
}

/**
 * Server-authoritative calculation of sales invoice line items and totals
 */
export function calculateSalesInvoiceTotals(
  rawItems: Array<{
    productId: string;
    skuSnapshot: string;
    productNameSnapshot: string;
    quantity: number;
    unitPrice: number;
    discountAmount?: number;
    taxRate?: number;
  }>
): CalculatedInvoiceTotals<SalesInvoiceItem> {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('EMPTY_ITEMS: Invoice must contain at least one item.');
  }

  let subtotalPaise = 0;
  let discountTotalPaise = 0;
  let taxableTotalPaise = 0;
  let taxTotalPaise = 0;
  let grandTotalPaise = 0;

  const items: SalesInvoiceItem[] = rawItems.map((raw, idx) => {
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

/**
 * Server-authoritative calculation of purchase invoice line items and totals
 */
export function calculatePurchaseInvoiceTotals(
  rawItems: Array<{
    productId: string;
    skuSnapshot: string;
    productNameSnapshot: string;
    quantity: number;
    unitCost: number;
    discountAmount?: number;
    taxRate?: number;
  }>
): CalculatedInvoiceTotals<PurchaseInvoiceItem> {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('EMPTY_ITEMS: Purchase invoice must contain at least one item.');
  }

  let subtotalPaise = 0;
  let discountTotalPaise = 0;
  let taxableTotalPaise = 0;
  let taxTotalPaise = 0;
  let grandTotalPaise = 0;

  const items: PurchaseInvoiceItem[] = rawItems.map((raw, idx) => {
    if (!raw.productId || typeof raw.productId !== 'string') {
      throw new Error(`INVALID_ITEM_PRODUCT: Item at line ${idx + 1} is missing productId.`);
    }

    const qty = Number(raw.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new Error(`INVALID_ITEM_QUANTITY: Line ${idx + 1} quantity must be a positive integer.`);
    }

    const unitCost = Number(raw.unitCost);
    if (isNaN(unitCost) || !isFinite(unitCost) || unitCost < 0) {
      throw new Error(`INVALID_ITEM_COST: Line ${idx + 1} unitCost must be >= 0.`);
    }

    const discountAmount = Number(raw.discountAmount || 0);
    if (isNaN(discountAmount) || !isFinite(discountAmount) || discountAmount < 0) {
      throw new Error(`INVALID_ITEM_DISCOUNT: Line ${idx + 1} discountAmount must be >= 0.`);
    }

    const taxRate = Number(raw.taxRate || 0);
    if (isNaN(taxRate) || !isFinite(taxRate) || taxRate < 0) {
      throw new Error(`INVALID_ITEM_TAX_RATE: Line ${idx + 1} taxRate must be >= 0.`);
    }

    const unitCostPaise = toPaise(unitCost);
    const lineGrossPaise = unitCostPaise * qty;
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
      unitCost: toRupees(unitCostPaise),
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
