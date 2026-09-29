/**
 * MR FUTKAR — Admin Invoice Client (Phase 5.5 Part 1)
 * REST Client for Sales & Purchase Invoices
 */

import {
  SalesInvoice,
  PurchaseInvoice,
  SalesInvoiceItemInput,
  PurchaseInvoiceItemInput,
  InvoiceAddressSnapshot,
} from '../types/invoice';
import { InvoiceDocumentModel } from '../types/invoiceDocument';
import { RetailerSelfLedgerResponse } from '../types/partyLedger';

const ADMIN_TOKEN_KEY = 'mrfutkar_admin_token';

function getAuthHeader(): Record<string, string> {
  let token: string | null = null;
  try {
    token = localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    token = null;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

export class InvoiceClient {
  // ==========================================
  // SALES INVOICES
  // ==========================================

  static async getSalesInvoices(params: {
    search?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
    customerId?: string;
    invoiceNumber?: string;
    sourceOrderId?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ invoices: SalesInvoice[]; total: number; page: number; pageSize: number }> {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status) query.set('status', params.status);
    if (params.fromDate) query.set('fromDate', params.fromDate);
    if (params.toDate) query.set('toDate', params.toDate);
    if (params.customerId) query.set('customerId', params.customerId);
    if (params.invoiceNumber) query.set('invoiceNumber', params.invoiceNumber);
    if (params.sourceOrderId) query.set('sourceOrderId', params.sourceOrderId);
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));

    const res = await fetch(`/api/admin/invoices/sales?${query.toString()}`, {
      headers: getAuthHeader(),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to fetch sales invoices');
    }

    return data;
  }

  static async getSalesInvoiceById(invoiceId: string): Promise<SalesInvoice> {
    const res = await fetch(`/api/admin/invoices/sales/${invoiceId}`, {
      headers: getAuthHeader(),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to fetch sales invoice');
    }

    return data.invoice;
  }

  static async createSalesInvoice(payload: {
    invoiceDate?: string;
    customerId: string;
    sourceOrderId?: string | null;
    items: SalesInvoiceItemInput[];
    billingAddressSnapshot?: Partial<InvoiceAddressSnapshot>;
    shippingAddressSnapshot?: Partial<InvoiceAddressSnapshot>;
    idempotencyKey?: string | null;
  }): Promise<SalesInvoice> {
    const res = await fetch('/api/admin/invoices/sales', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to create sales invoice');
    }

    return data.invoice;
  }

  static async updateSalesInvoice(
    invoiceId: string,
    payload: {
      invoiceDate?: string;
      items?: SalesInvoiceItemInput[];
      billingAddressSnapshot?: Partial<InvoiceAddressSnapshot>;
      shippingAddressSnapshot?: Partial<InvoiceAddressSnapshot>;
    }
  ): Promise<SalesInvoice> {
    const res = await fetch(`/api/admin/invoices/sales/${invoiceId}`, {
      method: 'PUT',
      headers: getAuthHeader(),
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to update sales invoice');
    }

    return data.invoice;
  }

  static async issueSalesInvoice(invoiceId: string): Promise<SalesInvoice> {
    const res = await fetch(`/api/admin/invoices/sales/${invoiceId}/issue`, {
      method: 'POST',
      headers: getAuthHeader(),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to issue sales invoice');
    }

    return data.invoice;
  }

  static async cancelSalesInvoice(invoiceId: string, reason?: string): Promise<SalesInvoice> {
    const res = await fetch(`/api/admin/invoices/sales/${invoiceId}/cancel`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ reason }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to cancel sales invoice');
    }

    return data.invoice;
  }

  // ==========================================
  // PURCHASE INVOICES
  // ==========================================

  static async getPurchaseInvoices(params: {
    search?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
    supplierId?: string;
    invoiceNumber?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ invoices: PurchaseInvoice[]; total: number; page: number; pageSize: number }> {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status) query.set('status', params.status);
    if (params.fromDate) query.set('fromDate', params.fromDate);
    if (params.toDate) query.set('toDate', params.toDate);
    if (params.supplierId) query.set('supplierId', params.supplierId);
    if (params.invoiceNumber) query.set('invoiceNumber', params.invoiceNumber);
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));

    const res = await fetch(`/api/admin/invoices/purchase?${query.toString()}`, {
      headers: getAuthHeader(),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to fetch purchase invoices');
    }

    return data;
  }

  static async getPurchaseInvoiceById(invoiceId: string): Promise<PurchaseInvoice> {
    const res = await fetch(`/api/admin/invoices/purchase/${invoiceId}`, {
      headers: getAuthHeader(),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to fetch purchase invoice');
    }

    return data.invoice;
  }

  static async createPurchaseInvoice(payload: {
    invoiceDate?: string;
    supplierId?: string | null;
    supplierType?: string;
    supplierInvoiceNumber?: string | null;
    items: PurchaseInvoiceItemInput[];
    billingAddressSnapshot?: Partial<InvoiceAddressSnapshot>;
    shippingAddressSnapshot?: Partial<InvoiceAddressSnapshot>;
    idempotencyKey?: string | null;
  }): Promise<PurchaseInvoice> {
    const res = await fetch('/api/admin/invoices/purchase', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to create purchase invoice');
    }

    return data.invoice;
  }

  static async updatePurchaseInvoice(
    invoiceId: string,
    payload: {
      invoiceDate?: string;
      supplierId?: string | null;
      supplierType?: string;
      supplierInvoiceNumber?: string | null;
      items?: PurchaseInvoiceItemInput[];
      billingAddressSnapshot?: Partial<InvoiceAddressSnapshot>;
      shippingAddressSnapshot?: Partial<InvoiceAddressSnapshot>;
    }
  ): Promise<PurchaseInvoice> {
    const res = await fetch(`/api/admin/invoices/purchase/${invoiceId}`, {
      method: 'PUT',
      headers: getAuthHeader(),
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to update purchase invoice');
    }

    return data.invoice;
  }

  static async postPurchaseInvoice(invoiceId: string): Promise<PurchaseInvoice> {
    const res = await fetch(`/api/admin/invoices/purchase/${invoiceId}/post`, {
      method: 'POST',
      headers: getAuthHeader(),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to post purchase invoice');
    }

    return data.invoice;
  }

  static async cancelPurchaseInvoice(invoiceId: string, reason?: string): Promise<PurchaseInvoice> {
    const res = await fetch(`/api/admin/invoices/purchase/${invoiceId}/cancel`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ reason }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to cancel purchase invoice');
    }

    return data.invoice;
  }

  // ==========================================
  // PHASE 5.5 PART 4: DOCUMENT & PDF METHODS
  // ==========================================

  static async getSalesInvoiceDocument(invoiceId: string): Promise<InvoiceDocumentModel> {
    const res = await fetch(`/api/admin/invoices/sales/${invoiceId}/document`, {
      headers: getAuthHeader(),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to fetch sales invoice document');
    }

    return data.document;
  }

  static async downloadSalesInvoicePdf(invoiceId: string, invoiceNumber: string): Promise<void> {
    const res = await fetch(`/api/admin/invoices/sales/${invoiceId}/pdf`, {
      headers: getAuthHeader(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Failed to download PDF' }));
      throw new Error(err.message || 'Failed to download sales invoice PDF');
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoiceNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  static async getPurchaseInvoiceDocument(invoiceId: string): Promise<InvoiceDocumentModel> {
    const res = await fetch(`/api/admin/invoices/purchase/${invoiceId}/document`, {
      headers: getAuthHeader(),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to fetch purchase invoice document');
    }

    return data.document;
  }

  static async downloadPurchaseInvoicePdf(invoiceId: string, invoiceNumber: string): Promise<void> {
    const res = await fetch(`/api/admin/invoices/purchase/${invoiceId}/pdf`, {
      headers: getAuthHeader(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Failed to download PDF' }));
      throw new Error(err.message || 'Failed to download purchase invoice PDF');
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoiceNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  static async getRetailerSalesInvoiceDocument(invoiceId: string, token?: string): Promise<InvoiceDocumentModel> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`/api/invoices/sales/${invoiceId}/document`, {
      headers,
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to fetch customer invoice document');
    }

    return data.document;
  }

  static async downloadRetailerSalesInvoicePdf(invoiceId: string, invoiceNumber: string, token?: string): Promise<void> {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`/api/invoices/sales/${invoiceId}/pdf`, {
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Failed to download PDF' }));
      throw new Error(err.message || 'Failed to download customer invoice PDF');
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoiceNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  // ==========================================
  // RETAILER SELF-LEDGER (PHASE 5.7 PART 1A)
  // ==========================================

  static async getMyLedger(
    params: {
      fromDate?: string;
      toDate?: string;
      page?: number;
      pageSize?: number;
    } = {},
    token?: string
  ): Promise<RetailerSelfLedgerResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const query = new URLSearchParams();
    if (params.fromDate) query.set('fromDate', params.fromDate);
    if (params.toDate) query.set('toDate', params.toDate);
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));

    const res = await fetch(`/api/invoices/my-ledger?${query.toString()}`, {
      headers,
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to fetch customer ledger statement');
    }

    return data;
  }
}

