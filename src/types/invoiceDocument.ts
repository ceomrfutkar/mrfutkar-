/**
 * MR FUTKAR — Invoice Document Layer Types (Phase 5.5 Part 4)
 * Normalized Presentation & Document Representation for Sales and Purchase Invoices
 */

export interface InvoiceCompanyInfo {
  legalName: string;
  brandName: string;
  supportPhone: string;
  supportEmail: string;
  fullAddress: string;
  city: string;
  state: string;
  pincode: string;
  gstin?: string;
  pan?: string;
  logoUrl?: string;
  currency: string;
  timezone: string;
}

export interface InvoicePartyInfo {
  businessName: string;
  contactName: string;
  mobile: string;
  fullAddress: string;
  city: string;
  state: string;
  pincode: string;
  gstin?: string;
}

export interface InvoiceDocumentLine {
  srNo: number;
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxableAmount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
}

export interface InvoiceDocumentTotals {
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  taxTotal: number;
  grandTotal: number;
  currencySymbol: string;
  amountInWords?: string;
}

export interface InvoiceDocumentModel {
  documentType:
    | 'TAX_INVOICE'
    | 'PURCHASE_INVOICE'
    | 'SALES_CREDIT_NOTE'
    | 'SALES_DEBIT_NOTE'
    | 'PURCHASE_CREDIT_NOTE'
    | 'PURCHASE_DEBIT_NOTE';
  documentTitle: string; // "TAX INVOICE", "SALES CREDIT NOTE", "PURCHASE DEBIT NOTE", etc.
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  formattedDate: string; // e.g. "26 Sep 2026"
  status: string;
  paymentStatus: string;
  accountingStatus?: string;
  warehouseId: string;
  warehouseName: string;
  warehouse: {
    warehouseId: string;
    warehouseName: string;
  };
  company: InvoiceCompanyInfo;
  customer?: InvoicePartyInfo;
  supplier?: InvoicePartyInfo;
  billingAddress: InvoicePartyInfo;
  shippingAddress: InvoicePartyInfo;
  items: InvoiceDocumentLine[];
  totals: InvoiceDocumentTotals;
  tax: {
    taxableTotal: number;
    taxTotal: number;
  };
  accounting?: {
    accountingStatus: string;
    voucherNumber?: string | null;
    journalId?: string | null;
    postedAt?: string | null;
  };
  references: {
    sourceOrderId?: string | null;
    supplierInvoiceNumber?: string | null;
    originalInvoiceId?: string | null;
    originalInvoiceNumber?: string | null;
    originalInvoiceDate?: string | null;
    reason?: string | null;
    idempotencyKey?: string | null;
  };
  isCustomerFacing: boolean;
}

/**
 * Format Indian Rupee representation (e.g., ₹ 1,23,456.78)
 */
export function formatIndianCurrency(amount: number): string {
  if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
    return '₹ 0.00';
  }
  const formatted = amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `₹ ${formatted}`;
}

/**
 * Format currency string for PDF rendering (ASCII standard: Rs. 1,23,456.78)
 */
export function formatPdfCurrency(amount: number): string {
  if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount)) {
    return 'Rs. 0.00';
  }
  const formatted = amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `Rs. ${formatted}`;
}

/**
 * Format date in Asia/Kolkata context (e.g. 26 Sep 2026)
 */
export function formatDateIndian(dateStr: string): string {
  if (!dateStr) return '—';
  // Parse YYYY-MM-DD explicitly to prevent local timezone shifts
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (month >= 0 && month < 12 && !isNaN(day) && !isNaN(year)) {
      return `${String(day).padStart(2, '0')} ${months[month]} ${year}`;
    }
  }
  return dateStr;
}

/**
 * Convert rupee number to Indian Currency Words
 */
export function numberToWordsIndian(amount: number): string {
  if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
    return 'Zero Rupees Only';
  }

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n: number): string {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    const t = tens[Math.floor(n / 10)];
    const o = ones[n % 10];
    return o ? `${t} ${o}` : t;
  }

  function convertThreeDigits(n: number): string {
    const h = Math.floor(n / 100);
    const r = n % 100;
    if (h > 0 && r > 0) {
      return `${ones[h]} Hundred and ${convertTwoDigits(r)}`;
    }
    if (h > 0) {
      return `${ones[h]} Hundred`;
    }
    return convertTwoDigits(r);
  }

  const rounded = Math.round(amount * 100) / 100;
  const rupeesPart = Math.floor(rounded);
  const paisePart = Math.round((rounded - rupeesPart) * 100);

  if (rupeesPart === 0 && paisePart > 0) {
    return `${convertTwoDigits(paisePart)} Paise Only`;
  }

  let words = '';

  const crores = Math.floor(rupeesPart / 10000000);
  let rem = rupeesPart % 10000000;

  const lakhs = Math.floor(rem / 100000);
  rem = rem % 100000;

  const thousands = Math.floor(rem / 1000);
  rem = rem % 1000;

  const hundreds = rem;

  if (crores > 0) {
    words += `${convertTwoDigits(crores)} Crore `;
  }
  if (lakhs > 0) {
    words += `${convertTwoDigits(lakhs)} Lakh `;
  }
  if (thousands > 0) {
    words += `${convertTwoDigits(thousands)} Thousand `;
  }
  if (hundreds > 0) {
    words += `${convertThreeDigits(hundreds)} `;
  }

  words = words.trim() + ' Rupees';

  if (paisePart > 0) {
    words += ` and ${convertTwoDigits(paisePart)} Paise`;
  }

  return words + ' Only';
}
