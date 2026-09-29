import {
  AdminSession,
  AdminProfile,
  AdminDeliveryPartnerRow,
  AdminDeliveryPartnerSummaryStats,
  AdminDeliveryPartnerDetail,
  AdminNotificationMetrics,
  AdminNotificationItem,
  AdminNotificationDetail,
  AdminNotificationTokenRow,
  AdminUserRow,
  AdminUserListResponse,
  AdminUserDetail,
  CreateAdminPayload,
  UpdateAdminStatusPayload,
  AdminStatus,
} from '../types/admin';
import { BusinessSettings } from '../config/businessSettings';
import { InventoryItem, InventoryMovement, InventorySummary, ManualStockAdjustPayload } from '../types/inventory';
import {
  AdminWarehouseHub,
  AdminWarehouseMetrics,
  AdminWarehouseOrder,
  AdminWarehouseStaff,
  AdminWarehouseActivity,
  WarehouseQueueType,
  AgingBucket,
} from '../types/adminWarehouse';
import {
  Account,
  CreateAccountPayload,
  UpdateAccountPayload,
  JournalEntry,
  JournalEntryLine,
  CreateJournalPayload,
  UpdateJournalPayload,
  AccountingPeriod,
  GeneralLedgerResponse,
  GeneralLedgerFilter,
  TrialBalanceResponse,
  TrialBalanceFilter,
  AccountingBalanceResponse,
} from '../types/accounting';
import {
  CreditDebitNote,
  CreditDebitNoteType,
  CreditDebitNoteStatus,
  CreateCreditDebitNotePayload,
  UpdateCreditDebitNotePayload,
} from '../types/creditDebitNote';
import { InvoiceDocumentModel } from '../types/invoiceDocument';
import {
  CustomerLedgerResponse,
  CustomerLedgerSummaryResponse,
  SupplierLedgerResponse,
  SupplierLedgerSummaryResponse,
} from '../types/partyLedger';
import {
  CustomerReceipt,
  CreateCustomerReceiptPayload,
  PostCustomerReceiptPayload,
  AllocateCustomerReceiptPayload,
  EligibleInvoiceForAllocation,
  CustomerReceiptListFilters,
  CustomerReceiptListResponse,
} from '../types/customerReceipt';
import {
  SupplierPayment,
  CreateSupplierPaymentPayload,
  PostSupplierPaymentPayload,
  PostSupplierPaymentResponse,
  AllocateSupplierPaymentPayload,
  AllocateSupplierPaymentResponse,
  ReverseSupplierPaymentPayload,
  ReverseSupplierPaymentResponse,
  EligiblePurchaseInvoiceForAllocation,
  SupplierPaymentListFilters,
  SupplierPaymentListResponse,
  SupplierStatementFilter,
  SupplierStatementResponse,
  SupplierPaymentHistoryFilter,
  SupplierPaymentHistoryResponse,
  SupplierOutstandingInvoicesResponse,
  SupplierAccountingSummaryResponse,
} from '../types/supplierPayment';
import {
  CustomerStatementFilter,
  CustomerStatementResponse,
  CustomerReceiptHistoryFilter,
  CustomerReceiptHistoryResponse,
  CustomerOutstandingInvoicesResponse,
  CustomerAccountingSummaryResponse,
} from '../types/customerReport';

const ADMIN_TOKEN_KEY = 'mrfutkar_admin_token';

export class AdminClient {
  static getToken(): string | null {
    try {
      return localStorage.getItem(ADMIN_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  static setToken(token: string): void {
    try {
      localStorage.setItem(ADMIN_TOKEN_KEY, token);
    } catch {
      // Ignore storage errors
    }
  }

  static clearToken(): void {
    try {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch {
      // Ignore storage errors
    }
  }

  static async fetchSession(): Promise<{ success: boolean; session?: AdminSession; error?: string; message?: string; status: number }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch('/api/admin/session', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        session: data.session,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async fetchProfile(): Promise<{ success: boolean; profile?: AdminProfile; error?: string; message?: string; status: number }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch('/api/admin/profile', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        profile: data.profile,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async fetchDashboard(): Promise<{ success: boolean; data?: any; error?: string; message?: string; status: number }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch('/api/admin/dashboard', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const resData = await res.json();
      return {
        success: res.ok && resData.success,
        data: resData.data,
        error: resData.error,
        message: resData.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async logout(): Promise<{ success: boolean }> {
    const token = this.getToken();
    if (token) {
      try {
        await fetch('/api/admin/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      } catch {
        // Non-blocking logout failure
      }
    }
    this.clearToken();
    return { success: true };
  }

  static async fetchProducts(params: {
    search?: string;
    brandId?: string;
    categoryId?: string;
    active?: boolean;
    lowStock?: boolean;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{
    success: boolean;
    products?: any[];
    totalCount?: number;
    totalPages?: number;
    page?: number;
    pageSize?: number;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const q = new URLSearchParams();
      if (params.search) q.set('search', params.search);
      if (params.brandId) q.set('brandId', params.brandId);
      if (params.categoryId) q.set('categoryId', params.categoryId);
      if (params.active !== undefined) q.set('active', String(params.active));
      if (params.lowStock !== undefined) q.set('lowStock', String(params.lowStock));
      if (params.page !== undefined) q.set('page', String(params.page));
      if (params.pageSize !== undefined) q.set('pageSize', String(params.pageSize));

      const queryStr = q.toString() ? `?${q.toString()}` : '';
      const res = await fetch(`/api/admin/products${queryStr}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        products: data.products,
        totalCount: data.totalCount,
        totalPages: data.totalPages,
        page: data.page,
        pageSize: data.pageSize,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async fetchProduct(productId: string): Promise<{
    success: boolean;
    product?: any;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(productId)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        product: data.product,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async createProduct(payload: any): Promise<{
    success: boolean;
    product?: any;
    error?: string;
    message?: string;
    errors?: any[];
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        product: data.product,
        error: data.error,
        message: data.message,
        errors: data.errors,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async updateProduct(productId: string, payload: any): Promise<{
    success: boolean;
    product?: any;
    error?: string;
    message?: string;
    errors?: any[];
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(productId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        product: data.product,
        error: data.error,
        message: data.message,
        errors: data.errors,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async activateProduct(productId: string): Promise<{
    success: boolean;
    productId?: string;
    isActive?: boolean;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/activate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        productId: data.productId,
        isActive: data.isActive,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async deactivateProduct(productId: string): Promise<{
    success: boolean;
    productId?: string;
    isActive?: boolean;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/deactivate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        productId: data.productId,
        isActive: data.isActive,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  // ==========================================
  // Product Image Management API Methods
  // ==========================================

  static async uploadProductImage(productId: string, payload: {
    fileData: string;
    fileName?: string;
    contentType?: string;
    altText?: string;
  }): Promise<{
    success: boolean;
    image?: any;
    images?: any[];
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/images`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        image: data.image,
        images: data.images,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async setPrimaryProductImage(productId: string, imageId: string): Promise<{
    success: boolean;
    imageId?: string;
    images?: any[];
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}/primary`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        imageId: data.imageId,
        images: data.images,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async reorderProductImages(productId: string, imageIds: string[]): Promise<{
    success: boolean;
    images?: any[];
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/images/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ imageIds }),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        images: data.images,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async deleteProductImage(productId: string, imageId: string): Promise<{
    success: boolean;
    deletedImageId?: string;
    images?: any[];
    primaryUrl?: string;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        deletedImageId: data.deletedImageId,
        images: data.images,
        primaryUrl: data.primaryUrl,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async replaceProductImage(productId: string, imageId: string, payload: {
    fileData: string;
    fileName?: string;
    contentType?: string;
    altText?: string;
  }): Promise<{
    success: boolean;
    image?: any;
    images?: any[];
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}/replace`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        image: data.image,
        images: data.images,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  // =========================================================================
  // PRICING MANAGEMENT CLIENT METHODS (Phase 3B-3)
  // =========================================================================

  static async fetchPricingRules(params: {
    search?: string;
    pricingType?: string;
    status?: string;
    productId?: string;
    retailerId?: string;
    minQuantity?: number;
    maxQuantity?: number;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{
    success: boolean;
    rules?: any[];
    totalCount?: number;
    totalPages?: number;
    page?: number;
    pageSize?: number;
    summary?: any;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const queryParams = new URLSearchParams();
      if (params.search) queryParams.set('search', params.search);
      if (params.pricingType && params.pricingType !== 'ALL') queryParams.set('pricingType', params.pricingType);
      if (params.status && params.status !== 'ALL') queryParams.set('status', params.status);
      if (params.productId) queryParams.set('productId', params.productId);
      if (params.retailerId) queryParams.set('retailerId', params.retailerId);
      if (params.minQuantity !== undefined) queryParams.set('minQuantity', String(params.minQuantity));
      if (params.maxQuantity !== undefined) queryParams.set('maxQuantity', String(params.maxQuantity));
      if (params.page) queryParams.set('page', String(params.page));
      if (params.pageSize) queryParams.set('pageSize', String(params.pageSize));

      const res = await fetch(`/api/admin/pricing?${queryParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        rules: data.rules || [],
        totalCount: data.totalCount || 0,
        totalPages: data.totalPages || 1,
        page: data.page || 1,
        pageSize: data.pageSize || 25,
        summary: data.summary,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async fetchPricingSummary(): Promise<{
    success: boolean;
    summary?: any;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch('/api/admin/pricing/summary', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        summary: data.summary,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async fetchPricingRule(ruleId: string): Promise<{
    success: boolean;
    rule?: any;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/pricing/${encodeURIComponent(ruleId)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        rule: data.rule,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async fetchPricingCustomers(search?: string): Promise<{
    success: boolean;
    customers?: any[];
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/admin/pricing/customers${q}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        customers: data.customers || [],
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async fetchPricingProducts(search?: string): Promise<{
    success: boolean;
    products?: any[];
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/admin/pricing/products${q}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        products: data.products || [],
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async createPricingRule(payload: any): Promise<{
    success: boolean;
    rule?: any;
    error?: string;
    message?: string;
    errors?: any[];
    conflictingRuleId?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch('/api/admin/pricing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        rule: data.rule,
        error: data.error,
        message: data.message,
        errors: data.errors,
        conflictingRuleId: data.conflictingRuleId,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async createBulkPricingSlabs(payload: any): Promise<{
    success: boolean;
    rule?: any;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch('/api/admin/pricing/bulk-slabs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        rule: data.rule,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async updatePricingRule(ruleId: string, payload: any): Promise<{
    success: boolean;
    rule?: any;
    error?: string;
    message?: string;
    errors?: any[];
    conflictingRuleId?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/pricing/${encodeURIComponent(ruleId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        rule: data.rule,
        error: data.error,
        message: data.message,
        errors: data.errors,
        conflictingRuleId: data.conflictingRuleId,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async activatePricingRule(ruleId: string): Promise<{
    success: boolean;
    rule?: any;
    error?: string;
    message?: string;
    conflictingRuleId?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/pricing/${encodeURIComponent(ruleId)}/activate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        rule: data.rule,
        error: data.error,
        message: data.message,
        conflictingRuleId: data.conflictingRuleId,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async deactivatePricingRule(ruleId: string): Promise<{
    success: boolean;
    rule?: any;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/pricing/${encodeURIComponent(ruleId)}/deactivate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        rule: data.rule,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async deletePricingRule(ruleId: string): Promise<{
    success: boolean;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/pricing/${encodeURIComponent(ruleId)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async previewEffectivePrice(payload: {
    productId: string;
    retailerId?: string;
    quantity: number;
  }): Promise<{
    success: boolean;
    productId?: string;
    productName?: string;
    sku?: string;
    retailerId?: string | null;
    customerBusinessName?: string;
    quantity?: number;
    defaultPrice?: number;
    effectivePrice?: number;
    lineTotal?: number;
    mrp?: number;
    savingsVsMrp?: number;
    unitSavingsVsDefault?: number;
    pricingSource?: string;
    ruleId?: string | null;
    slabMinQuantity?: number | null;
    slabMaxQuantity?: number | null;
    hierarchySteps?: any[];
    hierarchyExplanation?: string;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch('/api/admin/pricing/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        ...data,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  // ---------------------------------------------------------------------------
  // Super Admin Retailer Management API (Phase 3B-4A)
  // ---------------------------------------------------------------------------

  /**
   * List retailers with server-side pagination, search, status, and location filters.
   */
  static async listRetailers(params?: {
    search?: string;
    status?: string;
    city?: string;
    area?: string;
    pincode?: string;
    activity?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    success: boolean;
    retailers?: any[];
    total?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const queryParams = new URLSearchParams();
      if (params?.search) queryParams.set('search', params.search);
      if (params?.status) queryParams.set('status', params.status);
      if (params?.city) queryParams.set('city', params.city);
      if (params?.area) queryParams.set('area', params.area);
      if (params?.pincode) queryParams.set('pincode', params.pincode);
      if (params?.activity) queryParams.set('activity', params.activity);
      if (params?.page) queryParams.set('page', String(params.page));
      if (params?.pageSize) queryParams.set('pageSize', String(params.pageSize));

      const q = queryParams.toString() ? `?${queryParams.toString()}` : '';
      const res = await fetch(`/api/admin/retailers${q}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static getRetailers = AdminClient.listRetailers;
  static fetchRetailers = AdminClient.listRetailers;

  /**
   * Retrieve authoritative profile for a specific retailer.
   */
  static async getRetailer(retailerId: string): Promise<{
    success: boolean;
    retailer?: any;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/retailers/${encodeURIComponent(retailerId)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  /**
   * Retrieve orders belonging to a specific retailer.
   */
  static async getRetailerOrders(retailerId: string, page = 1, pageSize = 25): Promise<{
    success: boolean;
    retailerId?: string;
    orders?: any[];
    total?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(
        `/api/admin/retailers/${encodeURIComponent(retailerId)}/orders?page=${page}&pageSize=${pageSize}`,
        {
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  /**
   * Retrieve activity timeline for a retailer.
   */
  static async getRetailerActivity(retailerId: string): Promise<{
    success: boolean;
    retailerId?: string;
    activity?: any[];
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/retailers/${encodeURIComponent(retailerId)}/activity`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  /**
   * Retrieve pricing rules applicable to a retailer.
   */
  static async getRetailerPricing(retailerId: string): Promise<{
    success: boolean;
    retailerId?: string;
    customerPricingRules?: any[];
    globalPricingRules?: any[];
    totalRules?: number;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/retailers/${encodeURIComponent(retailerId)}/pricing`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  /**
   * Retrieve audit logs for a retailer.
   */
  static async getRetailerAuditLogs(retailerId: string): Promise<{
    success: boolean;
    retailerId?: string;
    auditLogs?: any[];
    total?: number;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/retailers/${encodeURIComponent(retailerId)}/audit-logs`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  /**
   * Activate retailer account.
   */
  static async activateRetailer(retailerId: string, reason?: string): Promise<{
    success: boolean;
    retailer?: any;
    alreadyActive?: boolean;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/retailers/${encodeURIComponent(retailerId)}/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  /**
   * Deactivate retailer account.
   */
  static async deactivateRetailer(retailerId: string, reason?: string): Promise<{
    success: boolean;
    retailer?: any;
    alreadyInactive?: boolean;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/retailers/${encodeURIComponent(retailerId)}/deactivate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  /**
   * Retrieve server-authoritative purchasing and product summary for a retailer.
   */
  static async getRetailerSummary(retailerId: string): Promise<{
    success: boolean;
    retailerId?: string;
    summary?: {
      totalOrders: number;
      deliveredOrders: number;
      cancelledOrders: number;
      pendingOrders: number;
      failedDeliveries: number;
      totalPurchaseValue: number;
      averageOrderValue: number;
      lastOrderDate: string | null;
      topProducts: Array<{
        productId: string;
        sku: string;
        productName: string;
        quantityPurchased: number;
        purchaseValue: number;
        averageUnitPrice: number;
      }>;
    };
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/retailers/${encodeURIComponent(retailerId)}/summary`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  /**
   * Calculate effective price preview for selected retailer, product and quantity.
   */
  static async getRetailerEffectivePrice(retailerId: string, productId: string, quantity: number): Promise<{
    success: boolean;
    retailerId?: string;
    productId?: string;
    productName?: string;
    sku?: string;
    quantity?: number;
    defaultPrice?: number;
    mrp?: number;
    effectivePrice?: number;
    pricingSource?: string;
    pricingId?: string | null;
    slabMinQuantity?: number | null;
    slabMaxQuantity?: number | null;
    subtotal?: number;
    totalSavings?: number;
    rule?: any;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(
        `/api/admin/retailers/${encodeURIComponent(retailerId)}/effective-price?productId=${encodeURIComponent(productId)}&quantity=${quantity}`,
        {
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  // =========================================================================
  // Phase 3B-5: Inventory Management Methods
  // =========================================================================

  static async fetchInventory(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    stockStatus?: string;
    brand?: string;
    category?: string;
  } = {}): Promise<{
    success: boolean;
    products?: InventoryItem[];
    totalCount?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
    summary?: InventorySummary;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.set('page', String(params.page));
      if (params.pageSize) queryParams.set('pageSize', String(params.pageSize));
      if (params.search) queryParams.set('search', params.search);
      if (params.stockStatus) queryParams.set('stockStatus', params.stockStatus);
      if (params.brand) queryParams.set('brand', params.brand);
      if (params.category) queryParams.set('category', params.category);

      const res = await fetch(`/api/admin/inventory?${queryParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async fetchInventoryItem(productId: string): Promise<{
    success: boolean;
    product?: InventoryItem;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/inventory/${encodeURIComponent(productId)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async fetchInventoryMovements(productId: string, limitCount = 50): Promise<{
    success: boolean;
    movements?: InventoryMovement[];
    totalCount?: number;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/inventory/${encodeURIComponent(productId)}/movements?limit=${limitCount}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async adjustInventory(payload: ManualStockAdjustPayload): Promise<{
    success: boolean;
    message?: string;
    productId?: string;
    productName?: string;
    sku?: string;
    previousStock?: number;
    newStock?: number;
    delta?: number;
    stockStatus?: string;
    movementId?: string;
    auditLogId?: string;
    isIdempotentReplay?: boolean;
    error?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch('/api/admin/inventory/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  // ==========================================
  // ADMIN ORDER CONSOLE
  // ==========================================

  static async fetchOrders(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    warehouseId?: string;
  } = {}): Promise<{
    success: boolean;
    orders?: any[];
    totalCount?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
    metrics?: {
      totalOrders: number;
      placed: number;
      warehouse: number;
      readyForDispatch: number;
      outForDelivery: number;
      delivered: number;
      cancelled: number;
      totalGmv: number;
    };
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.set('page', params.page.toString());
      if (params.pageSize) queryParams.set('pageSize', params.pageSize.toString());
      if (params.search) queryParams.set('search', params.search);
      if (params.status && params.status !== 'ALL') queryParams.set('status', params.status);
      if (params.warehouseId) queryParams.set('warehouseId', params.warehouseId);

      const res = await fetch(`/api/admin/orders?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async fetchOrderDetail(orderId: string): Promise<{
    success: boolean;
    order?: any;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async updateOrderStatus(
    orderId: string,
    newStatus: string,
    reason?: string,
    notes?: string
  ): Promise<{
    success: boolean;
    orderStatus?: string;
    message?: string;
    error?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newStatus, reason, notes }),
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async assignDeliveryPartner(
    orderId: string,
    payload: {
      partnerId: string;
      partnerName?: string;
      vehicleNumber?: string;
      vehicleType?: string;
    }
  ): Promise<{
    success: boolean;
    deliveryPartnerId?: string;
    deliveryPartnerName?: string;
    message?: string;
    error?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderId)}/assign-partner`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async fetchDeliveryPartners(): Promise<{
    success: boolean;
    partners?: any[];
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch('/api/admin/orders/delivery-partners/list', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  // ==========================================
  // PHASE 3B-7: WAREHOUSE MANAGEMENT & OPERATIONS
  // ==========================================

  static async fetchWarehouseHub(): Promise<{
    success: boolean;
    warehouse?: AdminWarehouseHub;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch('/api/admin/warehouse', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async fetchWarehouseMetrics(): Promise<{
    success: boolean;
    warehouseId?: string;
    metrics?: AdminWarehouseMetrics;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch('/api/admin/warehouse/metrics', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async fetchWarehouseOrders(params: {
    queue?: WarehouseQueueType;
    status?: string;
    aging?: AgingBucket | 'ALL';
    search?: string;
    paymentStatus?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{
    success: boolean;
    orders?: AdminWarehouseOrder[];
    pagination?: { total: number; page: number; pageSize: number; totalPages: number };
    queueCounts?: { acceptance: number; picking: number; packing: number; dispatch: number; all: number };
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    const queryParams = new URLSearchParams();
    if (params.queue) queryParams.set('queue', params.queue);
    if (params.status && params.status !== 'ALL') queryParams.set('status', params.status);
    if (params.aging && params.aging !== 'ALL') queryParams.set('aging', params.aging);
    if (params.search) queryParams.set('search', params.search);
    if (params.paymentStatus && params.paymentStatus !== 'ALL') queryParams.set('paymentStatus', params.paymentStatus);
    if (params.page) queryParams.set('page', String(params.page));
    if (params.pageSize) queryParams.set('pageSize', String(params.pageSize));

    try {
      const res = await fetch(`/api/admin/warehouse/orders?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async fetchWarehouseOrderDetail(orderId: string): Promise<{
    success: boolean;
    order?: AdminWarehouseOrder;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/warehouse/orders/${encodeURIComponent(orderId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async fetchWarehouseStaff(): Promise<{
    success: boolean;
    count?: number;
    staff?: AdminWarehouseStaff[];
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch('/api/admin/warehouse/staff', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async fetchWarehouseActivity(): Promise<{
    success: boolean;
    count?: number;
    activity?: AdminWarehouseActivity[];
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch('/api/admin/warehouse/activity', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  // =========================================================================
  // Phase 3B-8: Delivery Partner Management Console Methods
  // =========================================================================

  static async getDeliveryPartners(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    availabilityStatus?: string;
    warehouseId?: string;
    hasActiveDelivery?: boolean;
    hasPendingCod?: boolean;
  }): Promise<{
    success: boolean;
    partners?: AdminDeliveryPartnerRow[];
    total?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
    summary?: AdminDeliveryPartnerSummaryStats;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    const queryParams = new URLSearchParams();
    if (params.page) queryParams.set('page', params.page.toString());
    if (params.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    if (params.search) queryParams.set('search', params.search);
    if (params.status && params.status !== 'ALL') queryParams.set('status', params.status);
    if (params.availabilityStatus && params.availabilityStatus !== 'ALL') queryParams.set('availabilityStatus', params.availabilityStatus);
    if (params.warehouseId) queryParams.set('warehouseId', params.warehouseId);
    if (params.hasActiveDelivery !== undefined) queryParams.set('hasActiveDelivery', params.hasActiveDelivery.toString());
    if (params.hasPendingCod !== undefined) queryParams.set('hasPendingCod', params.hasPendingCod.toString());

    try {
      const res = await fetch(`/api/admin/delivery-partners?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async getDeliveryPartner(partnerId: string): Promise<{
    success: boolean;
    partner?: AdminDeliveryPartnerRow;
    workload?: any;
    historySummary?: any;
    codSummary?: any;
    performance?: any;
    auditLogs?: any[];
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/delivery-partners/${encodeURIComponent(partnerId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async getDeliveryPartnerOrders(partnerId: string, params?: {
    page?: number;
    pageSize?: number;
    status?: string;
  }): Promise<{
    success: boolean;
    orders?: any[];
    total?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', params.page.toString());
    if (params?.pageSize) queryParams.set('pageSize', params.pageSize.toString());
    if (params?.status && params.status !== 'ALL') queryParams.set('status', params.status);

    try {
      const res = await fetch(`/api/admin/delivery-partners/${encodeURIComponent(partnerId)}/orders?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async getDeliveryPartnerMetrics(partnerId: string): Promise<{
    success: boolean;
    metrics?: any;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/delivery-partners/${encodeURIComponent(partnerId)}/metrics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async getDeliveryPartnerAuditLogs(partnerId: string): Promise<{
    success: boolean;
    auditLogs?: any[];
    count?: number;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/delivery-partners/${encodeURIComponent(partnerId)}/audit-logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async activateDeliveryPartner(partnerId: string, reason?: string): Promise<{
    success: boolean;
    partner?: any;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/delivery-partners/${encodeURIComponent(partnerId)}/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async deactivateDeliveryPartner(partnerId: string, reason?: string): Promise<{
    success: boolean;
    partner?: any;
    error?: string;
    message?: string;
    activeOrdersCount?: number;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/delivery-partners/${encodeURIComponent(partnerId)}/deactivate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async suspendDeliveryPartner(partnerId: string, reason?: string): Promise<{
    success: boolean;
    partner?: any;
    error?: string;
    message?: string;
    activeOrdersCount?: number;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/delivery-partners/${encodeURIComponent(partnerId)}/suspend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  // =========================================================================
  // PHASE 3B-9: NOTIFICATION MANAGEMENT CONSOLE API CLIENT METHODS
  // =========================================================================

  static async getNotificationMetrics(): Promise<{
    success: boolean;
    metrics?: AdminNotificationMetrics;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch('/api/admin/notifications/metrics', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async getNotifications(params?: {
    page?: number;
    pageSize?: number;
    q?: string;
    role?: string;
    event?: string;
    status?: string;
    read?: boolean;
    orderId?: string;
    failedOnly?: boolean;
    startDate?: string;
    endDate?: string;
  }): Promise<{
    success: boolean;
    notifications?: AdminNotificationItem[];
    pagination?: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.q) query.set('q', params.q);
    if (params?.role && params.role !== 'ALL') query.set('role', params.role);
    if (params?.event && params.event !== 'ALL') query.set('event', params.event);
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.read !== undefined) query.set('read', String(params.read));
    if (params?.orderId) query.set('orderId', params.orderId);
    if (params?.failedOnly) query.set('failedOnly', 'true');
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);

    try {
      const res = await fetch(`/api/admin/notifications?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async getNotificationDetail(notificationId: string): Promise<{
    success: boolean;
    notification?: AdminNotificationDetail;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/notifications/${encodeURIComponent(notificationId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async retryNotification(notificationId: string): Promise<{
    success: boolean;
    deliveryStatus?: string;
    retryCount?: number;
    activeTokensCount?: number;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/notifications/${encodeURIComponent(notificationId)}/retry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async getNotificationTokens(params?: {
    userId?: string;
    role?: string;
    platform?: string;
    active?: boolean;
  }): Promise<{
    success: boolean;
    tokens?: AdminNotificationTokenRow[];
    total?: number;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    const query = new URLSearchParams();
    if (params?.userId) query.set('userId', params.userId);
    if (params?.role) query.set('role', params.role);
    if (params?.platform) query.set('platform', params.platform);
    if (params?.active !== undefined) query.set('active', String(params.active));

    try {
      const res = await fetch(`/api/admin/notifications/tokens?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async getNotificationPreferences(userId?: string): Promise<{
    success: boolean;
    preferences?: any;
    total?: number;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    const query = new URLSearchParams();
    if (userId) query.set('userId', userId);

    try {
      const res = await fetch(`/api/admin/notifications/preferences?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async getOrderNotifications(orderId: string): Promise<{
    success: boolean;
    orderId?: string;
    notifications?: AdminNotificationItem[];
    total?: number;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    try {
      const res = await fetch(`/api/admin/notifications/order/${encodeURIComponent(orderId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  static async getRecipientNotifications(userId: string, params?: { page?: number; pageSize?: number }): Promise<{
    success: boolean;
    userId?: string;
    notifications?: AdminNotificationItem[];
    pagination?: { page: number; pageSize: number; total: number; totalPages: number };
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'No admin token found.' };
    }

    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));

    try {
      const res = await fetch(`/api/admin/notifications/recipient/${encodeURIComponent(userId)}?${query.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return { success: res.ok && data.success, ...data, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Network request failed' };
    }
  }

  // =========================================================================
  // Phase 3B-10: Reports & Business Analytics API Methods
  // =========================================================================

  private static buildReportQuery(params?: {
    preset?: string;
    dateFrom?: string;
    dateTo?: string;
    [key: string]: any;
  }): string {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          query.set(k, String(v));
        }
      });
    }
    const qStr = query.toString();
    return qStr ? `?${qStr}` : '';
  }

  static async getReportsSummary(params?: { preset?: string; dateFrom?: string; dateTo?: string }): Promise<any> {
    const token = this.getToken();
    const q = this.buildReportQuery(params);
    const res = await fetch(`/api/admin/reports/summary${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  }

  static async getReportsSales(params?: { preset?: string; dateFrom?: string; dateTo?: string; groupBy?: string }): Promise<any> {
    const token = this.getToken();
    const q = this.buildReportQuery(params);
    const res = await fetch(`/api/admin/reports/sales${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  }

  static async getReportsOrders(params?: { preset?: string; dateFrom?: string; dateTo?: string }): Promise<any> {
    const token = this.getToken();
    const q = this.buildReportQuery(params);
    const res = await fetch(`/api/admin/reports/orders${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  }

  static async getReportsProducts(params?: {
    preset?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<any> {
    const token = this.getToken();
    const q = this.buildReportQuery(params);
    const res = await fetch(`/api/admin/reports/products${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  }

  static async getReportsRetailers(params?: {
    preset?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<any> {
    const token = this.getToken();
    const q = this.buildReportQuery(params);
    const res = await fetch(`/api/admin/reports/retailers${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  }

  static async getReportsWarehouse(params?: { preset?: string; dateFrom?: string; dateTo?: string }): Promise<any> {
    const token = this.getToken();
    const q = this.buildReportQuery(params);
    const res = await fetch(`/api/admin/reports/warehouse${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  }

  static async getReportsDelivery(params?: {
    preset?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<any> {
    const token = this.getToken();
    const q = this.buildReportQuery(params);
    const res = await fetch(`/api/admin/reports/delivery${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  }

  static async getReportsCod(params?: { preset?: string; dateFrom?: string; dateTo?: string }): Promise<any> {
    const token = this.getToken();
    const q = this.buildReportQuery(params);
    const res = await fetch(`/api/admin/reports/cod${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  }

  static async getReportsCancellations(params?: { preset?: string; dateFrom?: string; dateTo?: string }): Promise<any> {
    const token = this.getToken();
    const q = this.buildReportQuery(params);
    const res = await fetch(`/api/admin/reports/cancellations${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  }

  static async getReportsFailedDeliveries(params?: { preset?: string; dateFrom?: string; dateTo?: string }): Promise<any> {
    const token = this.getToken();
    const q = this.buildReportQuery(params);
    const res = await fetch(`/api/admin/reports/failed-deliveries${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  }

  static async getReportsReturns(params?: { preset?: string; dateFrom?: string; dateTo?: string }): Promise<any> {
    const token = this.getToken();
    const q = this.buildReportQuery(params);
    const res = await fetch(`/api/admin/reports/returns${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  }

  static async exportReportCsv(params: {
    type: string;
    preset?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<{ success: boolean; blob?: Blob; filename?: string; error?: string }> {
    const token = this.getToken();
    const q = this.buildReportQuery(params);
    try {
      const res = await fetch(`/api/admin/reports/export${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return { success: false, error: errJson.message || 'Export failed' };
      }
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition');
      let filename = `mr_futkar_${params.type}_report.csv`;
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }
      return { success: true, blob, filename };
    } catch (err: any) {
      return { success: false, error: err.message || 'Export network failed' };
    }
  }

  // ==========================================
  // BUSINESS SETTINGS & CONFIGURATION (Phase 3B-11)
  // ==========================================

  static async fetchSettings(): Promise<{
    success: boolean;
    settings?: BusinessSettings;
    version?: number;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch('/api/admin/settings', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        settings: data.settings,
        version: data.version,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        error: 'NETWORK_ERROR',
        message: err.message || 'Network request failed',
      };
    }
  }

  static async updateSettings(
    payload: Partial<BusinessSettings>,
    version?: number
  ): Promise<{
    success: boolean;
    settings?: BusinessSettings;
    version?: number;
    changedFields?: string[];
    error?: string;
    message?: string;
    details?: string[];
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          settings: payload,
          version,
        }),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        settings: data.settings,
        version: data.version,
        changedFields: data.changedFields,
        error: data.error,
        message: data.message,
        details: data.details,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        error: 'NETWORK_ERROR',
        message: err.message || 'Network request failed',
      };
    }
  }

  /**
   * Phase 3B-12: Admin User & Access Management Methods
   */

  static async fetchAdminUsers(params?: {
    search?: string;
    status?: string;
    role?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    success: boolean;
    users?: AdminUserRow[];
    totalCount?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
    summary?: { total: number; active: number; suspended: number; disabled: number };
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const q = new URLSearchParams();
      if (params?.search) q.append('search', params.search);
      if (params?.status && params.status !== 'ALL') q.append('status', params.status);
      if (params?.role && params.role !== 'ALL') q.append('role', params.role);
      if (params?.page) q.append('page', String(params.page));
      if (params?.pageSize) q.append('pageSize', String(params.pageSize));

      const res = await fetch(`/api/admin/users?${q.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        users: data.users,
        totalCount: data.totalCount,
        page: data.page,
        pageSize: data.pageSize,
        totalPages: data.totalPages,
        summary: data.summary,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        error: 'NETWORK_ERROR',
        message: err.message || 'Network request failed',
      };
    }
  }

  static async fetchAdminUserDetail(uid: string): Promise<{
    success: boolean;
    admin?: AdminUserRow;
    recentActivity?: any[];
    auditLogs?: any[];
    activityMetrics?: { totalAuditActions: number; lastActionTimestamp?: string };
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        admin: data.admin,
        recentActivity: data.recentActivity,
        auditLogs: data.auditLogs,
        activityMetrics: data.activityMetrics,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        error: 'NETWORK_ERROR',
        message: err.message || 'Network request failed',
      };
    }
  }

  static async createAdminUser(payload: CreateAdminPayload): Promise<{
    success: boolean;
    admin?: AdminUserRow;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        admin: data.admin,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        error: 'NETWORK_ERROR',
        message: err.message || 'Network request failed',
      };
    }
  }

  static async updateAdminUserStatus(
    uid: string,
    status: AdminStatus,
    reason: string
  ): Promise<{
    success: boolean;
    admin?: AdminUserRow;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status, reason }),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        admin: data.admin,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        error: 'NETWORK_ERROR',
        message: err.message || 'Network request failed',
      };
    }
  }

  static async fetchAdminUserAuditLogs(uid: string): Promise<{
    success: boolean;
    logs?: any[];
    count?: number;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}/audit-logs`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        logs: data.logs,
        count: data.count,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        error: 'NETWORK_ERROR',
        message: err.message || 'Network request failed',
      };
    }
  }

  // ==========================================
  // PHASE 5.4 PART 1: ACCOUNTING & CHART OF ACCOUNTS
  // ==========================================

  static async fetchAccounts(params?: {
    search?: string;
    accountType?: string;
    isActive?: boolean;
  }): Promise<{ success: boolean; accounts?: Account[]; totalCount?: number; error?: string; message?: string; status: number }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const searchParams = new URLSearchParams();
      if (params?.search) searchParams.set('search', params.search);
      if (params?.accountType) searchParams.set('accountType', params.accountType);
      if (params?.isActive !== undefined) searchParams.set('isActive', String(params.isActive));

      const queryStr = searchParams.toString() ? `?${searchParams.toString()}` : '';
      const res = await fetch(`/api/admin/accounting/accounts${queryStr}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        accounts: data.accounts,
        totalCount: data.totalCount,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        error: 'NETWORK_ERROR',
        message: err.message || 'Network request failed',
      };
    }
  }

  static async createAccount(payload: CreateAccountPayload): Promise<{
    success: boolean;
    account?: Account;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch('/api/admin/accounting/accounts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        account: data.account,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        error: 'NETWORK_ERROR',
        message: err.message || 'Network request failed',
      };
    }
  }

  static async updateAccount(
    accountId: string,
    payload: UpdateAccountPayload
  ): Promise<{
    success: boolean;
    account?: Account;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/accounts/${encodeURIComponent(accountId)}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        account: data.account,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        error: 'NETWORK_ERROR',
        message: err.message || 'Network request failed',
      };
    }
  }

  static async activateAccount(accountId: string): Promise<{
    success: boolean;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/accounts/${encodeURIComponent(accountId)}/activate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        error: 'NETWORK_ERROR',
        message: err.message || 'Network request failed',
      };
    }
  }

  static async deactivateAccount(accountId: string): Promise<{
    success: boolean;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/accounts/${encodeURIComponent(accountId)}/deactivate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        error: 'NETWORK_ERROR',
        message: err.message || 'Network request failed',
      };
    }
  }

  // ==========================================
  // PHASE 5.4 PART 2: JOURNALS & PERIODS
  // ==========================================

  static async fetchJournals(params?: {
    search?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<{
    success: boolean;
    journals?: JournalEntry[];
    totalCount?: number;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const searchParams = new URLSearchParams();
      if (params?.search) searchParams.set('search', params.search);
      if (params?.status) searchParams.set('status', params.status);
      if (params?.fromDate) searchParams.set('fromDate', params.fromDate);
      if (params?.toDate) searchParams.set('toDate', params.toDate);

      const queryStr = searchParams.toString() ? `?${searchParams.toString()}` : '';
      const res = await fetch(`/api/admin/accounting/journals${queryStr}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        journals: data.journals,
        totalCount: data.totalCount,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        error: 'NETWORK_ERROR',
        message: err.message || 'Network request failed',
      };
    }
  }

  static async fetchJournalById(journalId: string): Promise<{
    success: boolean;
    journal?: JournalEntry;
    lines?: JournalEntryLine[];
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/journals/${encodeURIComponent(journalId)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        journal: data.journal,
        lines: data.lines,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        error: 'NETWORK_ERROR',
        message: err.message || 'Network request failed',
      };
    }
  }

  static getJournal = this.fetchJournalById;

  static async createJournal(payload: CreateJournalPayload): Promise<{
    success: boolean;
    journal?: JournalEntry;
    lines?: JournalEntryLine[];
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch('/api/admin/accounting/journals', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        journal: data.journal,
        lines: data.lines,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        error: 'NETWORK_ERROR',
        message: err.message || 'Network request failed',
      };
    }
  }

  static createDraftJournal = this.createJournal;

  static async updateJournal(
    journalId: string,
    payload: UpdateJournalPayload
  ): Promise<{
    success: boolean;
    journal?: JournalEntry;
    lines?: JournalEntryLine[];
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/journals/${encodeURIComponent(journalId)}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        journal: data.journal,
        lines: data.lines,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        error: 'NETWORK_ERROR',
        message: err.message || 'Network request failed',
      };
    }
  }

  static async postJournal(journalId: string): Promise<{
    success: boolean;
    journal?: JournalEntry;
    lines?: JournalEntryLine[];
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/journals/${encodeURIComponent(journalId)}/post`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        journal: data.journal,
        lines: data.lines,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        error: 'NETWORK_ERROR',
        message: err.message || 'Network request failed',
      };
    }
  }

  static async reverseJournal(journalId: string): Promise<{
    success: boolean;
    reversalJournal?: JournalEntry;
    reversalLines?: JournalEntryLine[];
    originalJournal?: JournalEntry;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/journals/${encodeURIComponent(journalId)}/reverse`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        reversalJournal: data.reversalJournal,
        reversalLines: data.reversalLines,
        originalJournal: data.originalJournal,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        error: 'NETWORK_ERROR',
        message: err.message || 'Network request failed',
      };
    }
  }

  static async fetchAccountingPeriods(): Promise<{
    success: boolean;
    periods?: AccountingPeriod[];
    error?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED' };
    }
    try {
      const res = await fetch('/api/admin/accounting/periods', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return { success: res.ok && data.success, periods: data.periods, status: res.status };
    } catch (err: any) {
      return { success: false, status: 500, error: err.message };
    }
  }

  static async fetchGeneralLedger(filter: GeneralLedgerFilter): Promise<{
    success: boolean;
    data?: GeneralLedgerResponse;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const queryParams = new URLSearchParams();
      if (filter.accountId) queryParams.set('accountId', filter.accountId);
      if (filter.fromDate) queryParams.set('fromDate', filter.fromDate);
      if (filter.toDate) queryParams.set('toDate', filter.toDate);
      if (filter.voucherType) queryParams.set('voucherType', filter.voucherType);
      if (filter.referenceType) queryParams.set('referenceType', filter.referenceType);
      if (filter.customerId) queryParams.set('customerId', filter.customerId);
      if (filter.supplierId) queryParams.set('supplierId', filter.supplierId);

      const res = await fetch(`/api/admin/accounting/general-ledger?${queryParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        data: data.success ? (data as GeneralLedgerResponse) : undefined,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        error: 'NETWORK_ERROR',
        message: err.message || 'Failed to fetch General Ledger',
      };
    }
  }

  static async fetchTrialBalance(filter?: TrialBalanceFilter): Promise<{
    success: boolean;
    data?: TrialBalanceResponse;
    error?: string;
    message?: string;
    totalDebit?: number;
    totalCredit?: number;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const queryParams = new URLSearchParams();
      if (filter?.fromDate) queryParams.set('fromDate', filter.fromDate);
      if (filter?.toDate) queryParams.set('toDate', filter.toDate);
      if (filter?.accountType) queryParams.set('accountType', filter.accountType);
      if (filter?.includeZeroBalances !== undefined) {
        queryParams.set('includeZeroBalances', String(filter.includeZeroBalances));
      }

      const res = await fetch(`/api/admin/accounting/trial-balance?${queryParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        data: data.success ? (data as TrialBalanceResponse) : undefined,
        error: data.error,
        message: data.message,
        totalDebit: data.totalDebit,
        totalCredit: data.totalCredit,
        status: res.status,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        error: 'NETWORK_ERROR',
        message: err.message || 'Failed to fetch Trial Balance',
      };
    }
  }

  /**
   * PHASE 6 PART 4C-B: Authoritative Ledger-Backed Cash & Bank Balance
   * Server-authoritative, strictly read-only derived from posted general ledger entries.
   */
  static async getAccountingBalances(bypassCache = false): Promise<AccountingBalanceResponse> {
    const token = this.getToken();
    const query = bypassCache ? '?bypassCache=true' : '';
    const res = await fetch(`/api/admin/accounting/balances${query}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return res.json();
  }

  // -------------------------------------------------------------
  // PHASE 5.6: CREDIT & DEBIT NOTES ARCHITECTURE
  // -------------------------------------------------------------

  static async fetchCreditDebitNotes(filters?: {
    noteType?: CreditDebitNoteType;
    status?: CreditDebitNoteStatus;
    search?: string;
    originalInvoiceId?: string;
    originalInvoiceNumber?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    success: boolean;
    notes?: CreditDebitNote[];
    totalCount?: number;
    page?: number;
    pageSize?: number;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const q = new URLSearchParams();
      if (filters?.noteType) q.set('noteType', filters.noteType);
      if (filters?.status) q.set('status', filters.status);
      if (filters?.search) q.set('search', filters.search);
      if (filters?.originalInvoiceId) q.set('originalInvoiceId', filters.originalInvoiceId);
      if (filters?.originalInvoiceNumber) q.set('originalInvoiceNumber', filters.originalInvoiceNumber);
      if (filters?.page) q.set('page', String(filters.page));
      if (filters?.pageSize) q.set('pageSize', String(filters.pageSize));

      const res = await fetch(`/api/admin/accounting/credit-debit-notes?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        notes: data.notes,
        totalCount: data.totalCount,
        page: data.page,
        pageSize: data.pageSize,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to fetch notes' };
    }
  }

  static async fetchCreditDebitNote(noteId: string): Promise<{
    success: boolean;
    note?: CreditDebitNote;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/credit-debit-notes/${encodeURIComponent(noteId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        note: data.note,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to fetch note' };
    }
  }

  static async createCreditDebitNote(payload: CreateCreditDebitNotePayload): Promise<{
    success: boolean;
    note?: CreditDebitNote;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch('/api/admin/accounting/credit-debit-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        note: data.note,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to create note' };
    }
  }

  static async updateCreditDebitNote(
    noteId: string,
    payload: UpdateCreditDebitNotePayload
  ): Promise<{
    success: boolean;
    note?: CreditDebitNote;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/credit-debit-notes/${encodeURIComponent(noteId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        note: data.note,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to update note' };
    }
  }

  static async postCreditDebitNote(noteId: string): Promise<{
    success: boolean;
    note?: CreditDebitNote;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/credit-debit-notes/${encodeURIComponent(noteId)}/post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        note: data.note,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to post note' };
    }
  }

  static async fetchCreditDebitNoteDocument(noteId: string): Promise<{
    success: boolean;
    document?: InvoiceDocumentModel;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/credit-debit-notes/${encodeURIComponent(noteId)}/document`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        document: data.document,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to fetch document' };
    }
  }

  static async downloadCreditDebitNotePdf(noteId: string, noteNumber: string): Promise<boolean> {
    const token = this.getToken();
    if (!token) return false;

    try {
      const res = await fetch(`/api/admin/accounting/credit-debit-notes/${encodeURIComponent(noteId)}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${noteNumber || noteId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      return true;
    } catch (err) {
      console.error('Download PDF error:', err);
      return false;
    }
  }

  /**
   * Phase 5.7 Part 1: Customer & Supplier Party Ledger Methods
   */

  static async fetchCustomerLedgerSummary(filters?: {
    search?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<{
    success: boolean;
    data?: CustomerLedgerSummaryResponse;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const q = new URLSearchParams();
      if (filters?.search) q.append('search', filters.search);
      if (filters?.fromDate) q.append('fromDate', filters.fromDate);
      if (filters?.toDate) q.append('toDate', filters.toDate);

      const res = await fetch(`/api/admin/accounting/customer-ledger/summary?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        data: data.success ? data : undefined,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to fetch customer ledger summary' };
    }
  }

  static async fetchCustomerLedger(
    customerId: string,
    filters?: {
      fromDate?: string;
      toDate?: string;
      page?: number;
      pageSize?: number;
    }
  ): Promise<{
    success: boolean;
    data?: CustomerLedgerResponse;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const q = new URLSearchParams();
      if (filters?.fromDate) q.append('fromDate', filters.fromDate);
      if (filters?.toDate) q.append('toDate', filters.toDate);
      if (filters?.page) q.append('page', String(filters.page));
      if (filters?.pageSize) q.append('pageSize', String(filters.pageSize));

      const res = await fetch(`/api/admin/accounting/customer-ledger/${encodeURIComponent(customerId)}?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        data: data.success ? data : undefined,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to fetch customer ledger' };
    }
  }

  static async fetchSupplierLedgerSummary(filters?: {
    search?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<{
    success: boolean;
    data?: SupplierLedgerSummaryResponse;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const q = new URLSearchParams();
      if (filters?.search) q.append('search', filters.search);
      if (filters?.fromDate) q.append('fromDate', filters.fromDate);
      if (filters?.toDate) q.append('toDate', filters.toDate);

      const res = await fetch(`/api/admin/accounting/supplier-ledger/summary?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        data: data.success ? data : undefined,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to fetch supplier ledger summary' };
    }
  }

  static async fetchSupplierLedger(
    supplierId: string,
    filters?: {
      fromDate?: string;
      toDate?: string;
      page?: number;
      pageSize?: number;
    }
  ): Promise<{
    success: boolean;
    data?: SupplierLedgerResponse;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const q = new URLSearchParams();
      if (filters?.fromDate) q.append('fromDate', filters.fromDate);
      if (filters?.toDate) q.append('toDate', filters.toDate);
      if (filters?.page) q.append('page', String(filters.page));
      if (filters?.pageSize) q.append('pageSize', String(filters.pageSize));

      const res = await fetch(`/api/admin/accounting/supplier-ledger/${encodeURIComponent(supplierId)}?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        data: data.success ? data : undefined,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to fetch supplier ledger' };
    }
  }

  /**
   * Phase 5.7 Part 2A: Customer Receipts API
   */
  static async fetchCustomerReceipts(
    filters?: CustomerReceiptListFilters
  ): Promise<{
    success: boolean;
    data?: CustomerReceiptListResponse;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const q = new URLSearchParams();
      if (filters?.customerId) q.append('customerId', filters.customerId);
      if (filters?.paymentMethod) q.append('paymentMethod', filters.paymentMethod);
      if (filters?.status) q.append('status', filters.status);
      if (filters?.fromDate) q.append('fromDate', filters.fromDate);
      if (filters?.toDate) q.append('toDate', filters.toDate);
      if (filters?.search) q.append('search', filters.search);
      if (filters?.page) q.append('page', String(filters.page));
      if (filters?.pageSize) q.append('pageSize', String(filters.pageSize));

      const res = await fetch(`/api/admin/accounting/customer-receipts?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        data: data.success ? data : undefined,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to fetch customer receipts' };
    }
  }

  static async fetchCustomerReceipt(
    receiptId: string
  ): Promise<{
    success: boolean;
    data?: CustomerReceipt;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/customer-receipts/${encodeURIComponent(receiptId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        data: data.receipt,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to fetch customer receipt' };
    }
  }

  static async createCustomerReceipt(
    payload: CreateCustomerReceiptPayload
  ): Promise<{
    success: boolean;
    receipt?: CustomerReceipt;
    isIdempotentReplay?: boolean;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch('/api/admin/accounting/customer-receipts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        receipt: data.receipt,
        isIdempotentReplay: data.isIdempotentReplay,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to create customer receipt' };
    }
  }

  /**
   * Phase 5.7 Part 2B: Post Customer Receipt to double-entry accounting
   */
  static async postCustomerReceipt(
    receiptId: string,
    payload?: PostCustomerReceiptPayload
  ): Promise<{
    success: boolean;
    receipt?: CustomerReceipt;
    journal?: any;
    isIdempotentReplay?: boolean;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/customer-receipts/${encodeURIComponent(receiptId)}/post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload || {}),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        receipt: data.receipt,
        journal: data.journal,
        isIdempotentReplay: data.isIdempotentReplay,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to post customer receipt' };
    }
  }

  /**
   * Phase 5.7 Part 2C: Get eligible sales invoices for customer receipt allocation
   */
  static async getEligibleInvoicesForReceipt(
    receiptId: string
  ): Promise<{
    success: boolean;
    invoices?: EligibleInvoiceForAllocation[];
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/customer-receipts/${encodeURIComponent(receiptId)}/eligible-invoices`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        invoices: data.invoices,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to fetch eligible invoices' };
    }
  }

  /**
   * Phase 5.7 Part 2C: Allocate customer receipt to one or more sales invoices
   */
  static async allocateCustomerReceipt(
    receiptId: string,
    payload: AllocateCustomerReceiptPayload
  ): Promise<{
    success: boolean;
    receipt?: CustomerReceipt;
    isIdempotentReplay?: boolean;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/customer-receipts/${encodeURIComponent(receiptId)}/allocate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        receipt: data.receipt,
        isIdempotentReplay: data.isIdempotentReplay,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to allocate customer receipt' };
    }
  }

  /**
   * Reverse an authoritative POSTED Customer Receipt
   * POST /api/admin/accounting/customer-receipts/:receiptId/reverse
   */
  static async reverseCustomerReceipt(
    receiptId: string,
    payload?: { reason?: string; idempotencyKey?: string }
  ): Promise<{
    success: boolean;
    receipt?: any;
    reversalJournal?: any;
    isIdempotentReplay?: boolean;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/customer-receipts/${encodeURIComponent(receiptId)}/reverse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload || {}),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        receipt: data.receipt,
        reversalJournal: data.reversalJournal,
        isIdempotentReplay: data.isIdempotentReplay,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to reverse customer receipt' };
    }
  }

  // =========================================================================
  // Phase 5.8: Supplier Payments & Allocation
  // =========================================================================

  static async fetchSupplierPayments(
    filters?: SupplierPaymentListFilters
  ): Promise<{
    success: boolean;
    data?: SupplierPaymentListResponse;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const q = new URLSearchParams();
      if (filters?.supplierId) q.append('supplierId', filters.supplierId);
      if (filters?.paymentMethod) q.append('paymentMethod', filters.paymentMethod);
      if (filters?.status) q.append('status', filters.status);
      if (filters?.fromDate) q.append('fromDate', filters.fromDate);
      if (filters?.toDate) q.append('toDate', filters.toDate);
      if (filters?.search) q.append('search', filters.search);
      if (filters?.page) q.append('page', String(filters.page));
      if (filters?.pageSize) q.append('pageSize', String(filters.pageSize));

      const res = await fetch(`/api/admin/accounting/supplier-payments?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok,
        data: res.ok ? data : undefined,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to fetch supplier payments' };
    }
  }

  static async fetchSupplierPayment(
    paymentId: string
  ): Promise<{
    success: boolean;
    data?: SupplierPayment;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/supplier-payments/${encodeURIComponent(paymentId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        data: data.payment,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to fetch supplier payment' };
    }
  }

  static async createSupplierPayment(
    payload: CreateSupplierPaymentPayload
  ): Promise<{
    success: boolean;
    payment?: SupplierPayment;
    isIdempotentReplay?: boolean;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch('/api/admin/accounting/supplier-payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        payment: data.payment,
        isIdempotentReplay: data.isIdempotentReplay,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to create supplier payment' };
    }
  }

  static async postSupplierPayment(
    paymentId: string,
    payload?: PostSupplierPaymentPayload
  ): Promise<{
    success: boolean;
    payment?: SupplierPayment;
    journal?: any;
    isIdempotentReplay?: boolean;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/supplier-payments/${encodeURIComponent(paymentId)}/post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload || {}),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        payment: data.payment,
        journal: data.journal,
        isIdempotentReplay: data.isIdempotentReplay,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to post supplier payment' };
    }
  }

  static async getEligibleInvoicesForSupplierPayment(
    paymentId: string
  ): Promise<{
    success: boolean;
    invoices?: EligiblePurchaseInvoiceForAllocation[];
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/supplier-payments/${encodeURIComponent(paymentId)}/eligible-invoices`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        invoices: data.invoices,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to fetch eligible invoices' };
    }
  }

  static async allocateSupplierPayment(
    paymentId: string,
    payload: AllocateSupplierPaymentPayload
  ): Promise<{
    success: boolean;
    payment?: SupplierPayment;
    isIdempotentReplay?: boolean;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/supplier-payments/${encodeURIComponent(paymentId)}/allocate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        payment: data.payment,
        isIdempotentReplay: data.isIdempotentReplay,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to allocate supplier payment' };
    }
  }

  static async reverseSupplierPayment(
    paymentId: string,
    payload?: ReverseSupplierPaymentPayload
  ): Promise<{
    success: boolean;
    payment?: SupplierPayment;
    reversalJournal?: any;
    isIdempotentReplay?: boolean;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/supplier-payments/${encodeURIComponent(paymentId)}/reverse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload || {}),
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        payment: data.payment,
        reversalJournal: data.reversalJournal,
        isIdempotentReplay: data.isIdempotentReplay,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to reverse supplier payment' };
    }
  }

  // =========================================================================
  // PHASE 5.8 PART 4: SUPPLIER PAYMENT REPORTING & LEDGER CLIENT METHODS
  // =========================================================================

  /**
   * Fetches read-only server-authoritative supplier statement
   */
  static async fetchSupplierStatement(
    supplierId: string,
    filters?: Omit<SupplierStatementFilter, 'supplierId'>
  ): Promise<{
    success: boolean;
    data?: SupplierStatementResponse;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const q = new URLSearchParams();
      if (filters?.fromDate) q.append('fromDate', filters.fromDate);
      if (filters?.toDate) q.append('toDate', filters.toDate);
      if (filters?.transactionType) q.append('transactionType', filters.transactionType);
      if (filters?.status) q.append('status', filters.status);
      if (filters?.page) q.append('page', String(filters.page));
      if (filters?.pageSize) q.append('pageSize', String(filters.pageSize));

      const res = await fetch(`/api/admin/accounting/supplier-payments/statement/${encodeURIComponent(supplierId)}?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        data: data.success ? data : undefined,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to fetch supplier statement' };
    }
  }

  /**
   * Fetches read-only supplier payment history with allocations and reversals
   */
  static async fetchSupplierPaymentHistory(
    filters?: SupplierPaymentHistoryFilter
  ): Promise<{
    success: boolean;
    data?: SupplierPaymentHistoryResponse;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const q = new URLSearchParams();
      if (filters?.supplierId) q.append('supplierId', filters.supplierId);
      if (filters?.paymentMethod) q.append('paymentMethod', filters.paymentMethod);
      if (filters?.status) q.append('status', filters.status);
      if (filters?.fromDate) q.append('fromDate', filters.fromDate);
      if (filters?.toDate) q.append('toDate', filters.toDate);
      if (filters?.search) q.append('search', filters.search);
      if (filters?.page) q.append('page', String(filters.page));
      if (filters?.pageSize) q.append('pageSize', String(filters.pageSize));

      const res = await fetch(`/api/admin/accounting/supplier-payments/history?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        data: data.success ? data : undefined,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to fetch supplier payment history' };
    }
  }

  /**
   * Fetches read-only outstanding purchase invoices for a supplier
   */
  static async fetchSupplierOutstandingInvoices(
    supplierId: string
  ): Promise<{
    success: boolean;
    data?: SupplierOutstandingInvoicesResponse;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/supplier-payments/outstanding-invoices/${encodeURIComponent(supplierId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        data: data.success ? data : undefined,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to fetch outstanding invoices' };
    }
  }

  /**
   * Fetches read-only supplier accounting summary
   */
  static async fetchSupplierAccountingSummary(
    filters?: {
      supplierId?: string;
      fromDate?: string;
      toDate?: string;
    }
  ): Promise<{
    success: boolean;
    data?: SupplierAccountingSummaryResponse;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const q = new URLSearchParams();
      if (filters?.supplierId) q.append('supplierId', filters.supplierId);
      if (filters?.fromDate) q.append('fromDate', filters.fromDate);
      if (filters?.toDate) q.append('toDate', filters.toDate);

      const res = await fetch(`/api/admin/accounting/supplier-payments/summary?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        data: data.success ? data : undefined,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to fetch supplier accounting summary' };
    }
  }

  // =========================================================================
  // PHASE 5.8 PART 6: SUPPLIER ACCOUNTING REPORT EXPORT CLIENT METHODS
  // =========================================================================

  /**
   * Export read-only supplier statement to CSV
   */
  static async exportSupplierStatementCsv(
    supplierId: string,
    filters?: Omit<SupplierStatementFilter, 'supplierId'>
  ): Promise<{ success: boolean; blob?: Blob; filename?: string; error?: string }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, error: 'UNAUTHORIZED: Admin token missing.' };
    }

    try {
      const q = new URLSearchParams();
      if (filters?.fromDate) q.append('fromDate', filters.fromDate);
      if (filters?.toDate) q.append('toDate', filters.toDate);
      if (filters?.transactionType) q.append('transactionType', filters.transactionType);
      if (filters?.status) q.append('status', filters.status);

      const res = await fetch(
        `/api/admin/accounting/supplier-payments/export/statement/${encodeURIComponent(supplierId)}?${q.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return { success: false, error: errJson.message || 'Export failed' };
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition');
      let filename = `supplier_statement_${supplierId}.csv`;
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      return { success: true, blob, filename };
    } catch (err: any) {
      return { success: false, error: err.message || 'Export network failed' };
    }
  }

  /**
   * Export read-only supplier payment history to CSV
   */
  static async exportSupplierPaymentHistoryCsv(
    filters?: SupplierPaymentHistoryFilter
  ): Promise<{ success: boolean; blob?: Blob; filename?: string; error?: string }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, error: 'UNAUTHORIZED: Admin token missing.' };
    }

    try {
      const q = new URLSearchParams();
      if (filters?.supplierId) q.append('supplierId', filters.supplierId);
      if (filters?.paymentMethod) q.append('paymentMethod', filters.paymentMethod);
      if (filters?.status) q.append('status', filters.status);
      if (filters?.fromDate) q.append('fromDate', filters.fromDate);
      if (filters?.toDate) q.append('toDate', filters.toDate);
      if (filters?.search) q.append('search', filters.search);

      const res = await fetch(`/api/admin/accounting/supplier-payments/export/history?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return { success: false, error: errJson.message || 'Export failed' };
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition');
      let filename = `supplier_payments_${filters?.supplierId || 'all'}.csv`;
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      return { success: true, blob, filename };
    } catch (err: any) {
      return { success: false, error: err.message || 'Export network failed' };
    }
  }

  /**
   * Export read-only outstanding purchase invoices to CSV
   */
  static async exportSupplierOutstandingInvoicesCsv(
    supplierId: string
  ): Promise<{ success: boolean; blob?: Blob; filename?: string; error?: string }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, error: 'UNAUTHORIZED: Admin token missing.' };
    }

    try {
      const res = await fetch(
        `/api/admin/accounting/supplier-payments/export/outstanding-invoices/${encodeURIComponent(supplierId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return { success: false, error: errJson.message || 'Export failed' };
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition');
      let filename = `outstanding_invoices_${supplierId}.csv`;
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      return { success: true, blob, filename };
    } catch (err: any) {
      return { success: false, error: err.message || 'Export network failed' };
    }
  }

  /**
   * Export read-only supplier accounting summary to CSV
   */
  static async exportSupplierAccountingSummaryCsv(
    filters?: {
      supplierId?: string;
      fromDate?: string;
      toDate?: string;
    }
  ): Promise<{ success: boolean; blob?: Blob; filename?: string; error?: string }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, error: 'UNAUTHORIZED: Admin token missing.' };
    }

    try {
      const q = new URLSearchParams();
      if (filters?.supplierId) q.append('supplierId', filters.supplierId);
      if (filters?.fromDate) q.append('fromDate', filters.fromDate);
      if (filters?.toDate) q.append('toDate', filters.toDate);

      const res = await fetch(`/api/admin/accounting/supplier-payments/export/summary?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return { success: false, error: errJson.message || 'Export failed' };
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition');
      let filename = `supplier_summary_${filters?.supplierId || 'all'}.csv`;
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      return { success: true, blob, filename };
    } catch (err: any) {
      return { success: false, error: err.message || 'Export network failed' };
    }
  }

  // =========================================================================
  // PHASE 5.9: CUSTOMER AR REPORTING & EXPORT CLIENT METHODS
  // =========================================================================

  /**
   * Fetches read-only customer statement derived from Account 1300
   */
  static async fetchCustomerStatement(
    customerId: string,
    filters?: CustomerStatementFilter
  ): Promise<{
    success: boolean;
    data?: CustomerStatementResponse;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const q = new URLSearchParams();
      if (filters?.fromDate) q.append('fromDate', filters.fromDate);
      if (filters?.toDate) q.append('toDate', filters.toDate);
      if (filters?.transactionType) q.append('transactionType', filters.transactionType);
      if (filters?.status) q.append('status', filters.status);
      if (filters?.page) q.append('page', String(filters.page));
      if (filters?.pageSize) q.append('pageSize', String(filters.pageSize));

      const res = await fetch(`/api/admin/accounting/customer-reports/statement/${encodeURIComponent(customerId)}?${q.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        data: data.success ? data : undefined,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to fetch customer statement' };
    }
  }

  /**
   * Fetches read-only customer receipt history with allocations and reversals
   */
  static async fetchCustomerReceiptHistory(
    filters?: CustomerReceiptHistoryFilter
  ): Promise<{
    success: boolean;
    data?: CustomerReceiptHistoryResponse;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const q = new URLSearchParams();
      if (filters?.customerId) q.append('customerId', filters.customerId);
      if (filters?.paymentMethod) q.append('paymentMethod', filters.paymentMethod);
      if (filters?.status) q.append('status', filters.status);
      if (filters?.fromDate) q.append('fromDate', filters.fromDate);
      if (filters?.toDate) q.append('toDate', filters.toDate);
      if (filters?.search) q.append('search', filters.search);
      if (filters?.page) q.append('page', String(filters.page));
      if (filters?.pageSize) q.append('pageSize', String(filters.pageSize));

      const endpoint = filters?.customerId
        ? `/api/admin/accounting/customer-reports/receipt-history/${encodeURIComponent(filters.customerId)}?${q.toString()}`
        : `/api/admin/accounting/customer-reports/receipt-history?${q.toString()}`;

      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        data: data.success ? data : undefined,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to fetch customer receipt history' };
    }
  }

  /**
   * Fetches read-only outstanding sales invoices for a customer
   */
  static async fetchCustomerOutstandingInvoices(
    customerId: string
  ): Promise<{
    success: boolean;
    data?: CustomerOutstandingInvoicesResponse;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const res = await fetch(`/api/admin/accounting/customer-reports/outstanding-invoices/${encodeURIComponent(customerId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        data: data.success ? data : undefined,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to fetch customer outstanding invoices' };
    }
  }

  /**
   * Fetches read-only customer accounting summary
   */
  static async fetchCustomerAccountingSummary(
    filters?: {
      customerId?: string;
      fromDate?: string;
      toDate?: string;
    }
  ): Promise<{
    success: boolean;
    data?: CustomerAccountingSummaryResponse;
    error?: string;
    message?: string;
    status: number;
  }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, status: 401, error: 'UNAUTHORIZED', message: 'Admin token missing.' };
    }

    try {
      const q = new URLSearchParams();
      if (filters?.customerId) q.append('customerId', filters.customerId);
      if (filters?.fromDate) q.append('fromDate', filters.fromDate);
      if (filters?.toDate) q.append('toDate', filters.toDate);

      const endpoint = filters?.customerId
        ? `/api/admin/accounting/customer-reports/summary/${encodeURIComponent(filters.customerId)}?${q.toString()}`
        : `/api/admin/accounting/customer-reports/summary?${q.toString()}`;

      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return {
        success: res.ok && data.success,
        data: data.success ? data : undefined,
        error: data.error,
        message: data.message,
        status: res.status,
      };
    } catch (err: any) {
      return { success: false, status: 500, error: 'NETWORK_ERROR', message: err.message || 'Failed to fetch customer accounting summary' };
    }
  }

  /**
   * Export read-only customer statement to CSV
   */
  static async exportCustomerStatementCsv(
    customerId: string,
    filters?: Omit<CustomerStatementFilter, 'customerId'>
  ): Promise<{ success: boolean; blob?: Blob; filename?: string; error?: string }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, error: 'UNAUTHORIZED: Admin token missing.' };
    }

    try {
      const q = new URLSearchParams();
      if (filters?.fromDate) q.append('fromDate', filters.fromDate);
      if (filters?.toDate) q.append('toDate', filters.toDate);
      if (filters?.transactionType) q.append('transactionType', filters.transactionType);
      if (filters?.status) q.append('status', filters.status);

      const res = await fetch(
        `/api/admin/accounting/customer-reports/export/statement/${encodeURIComponent(customerId)}?${q.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return { success: false, error: errJson.message || 'Export failed' };
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition');
      let filename = `customer_statement_${customerId}.csv`;
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      return { success: true, blob, filename };
    } catch (err: any) {
      return { success: false, error: err.message || 'Export network failed' };
    }
  }

  /**
   * Export read-only customer receipt history to CSV
   */
  static async exportCustomerReceiptHistoryCsv(
    filters?: CustomerReceiptHistoryFilter
  ): Promise<{ success: boolean; blob?: Blob; filename?: string; error?: string }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, error: 'UNAUTHORIZED: Admin token missing.' };
    }

    try {
      const q = new URLSearchParams();
      if (filters?.customerId) q.append('customerId', filters.customerId);
      if (filters?.paymentMethod) q.append('paymentMethod', filters.paymentMethod);
      if (filters?.status) q.append('status', filters.status);
      if (filters?.fromDate) q.append('fromDate', filters.fromDate);
      if (filters?.toDate) q.append('toDate', filters.toDate);
      if (filters?.search) q.append('search', filters.search);

      const endpoint = filters?.customerId
        ? `/api/admin/accounting/customer-reports/export/receipt-history/${encodeURIComponent(filters.customerId)}?${q.toString()}`
        : `/api/admin/accounting/customer-reports/export/history?${q.toString()}`;

      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return { success: false, error: errJson.message || 'Export failed' };
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition');
      let filename = `customer_receipts_${filters?.customerId || 'all'}.csv`;
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      return { success: true, blob, filename };
    } catch (err: any) {
      return { success: false, error: err.message || 'Export network failed' };
    }
  }

  /**
   * Export read-only outstanding sales invoices to CSV
   */
  static async exportCustomerOutstandingInvoicesCsv(
    customerId: string
  ): Promise<{ success: boolean; blob?: Blob; filename?: string; error?: string }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, error: 'UNAUTHORIZED: Admin token missing.' };
    }

    try {
      const res = await fetch(
        `/api/admin/accounting/customer-reports/export/outstanding-invoices/${encodeURIComponent(customerId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return { success: false, error: errJson.message || 'Export failed' };
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition');
      let filename = `outstanding_sales_invoices_${customerId}.csv`;
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      return { success: true, blob, filename };
    } catch (err: any) {
      return { success: false, error: err.message || 'Export network failed' };
    }
  }

  /**
   * Export read-only customer accounting summary to CSV
   */
  static async exportCustomerAccountingSummaryCsv(
    filters?: {
      customerId?: string;
      fromDate?: string;
      toDate?: string;
    }
  ): Promise<{ success: boolean; blob?: Blob; filename?: string; error?: string }> {
    const token = this.getToken();
    if (!token) {
      return { success: false, error: 'UNAUTHORIZED: Admin token missing.' };
    }

    try {
      const q = new URLSearchParams();
      if (filters?.customerId) q.append('customerId', filters.customerId);
      if (filters?.fromDate) q.append('fromDate', filters.fromDate);
      if (filters?.toDate) q.append('toDate', filters.toDate);

      const endpoint = filters?.customerId
        ? `/api/admin/accounting/customer-reports/export/summary/${encodeURIComponent(filters.customerId)}?${q.toString()}`
        : `/api/admin/accounting/customer-reports/export/summary?${q.toString()}`;

      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return { success: false, error: errJson.message || 'Export failed' };
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition');
      let filename = `customer_summary_${filters?.customerId || 'all'}.csv`;
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      return { success: true, blob, filename };
    } catch (err: any) {
      return { success: false, error: err.message || 'Export network failed' };
    }
  }

  // Phase 6 Part 4B: Admin COD Cash Handover methods
  static async getAdminCodHandovers(): Promise<{ success: boolean; handovers?: any[]; error?: string; message?: string }> {
    const token = this.getToken();
    const res = await fetch('/api/admin/cod/handovers', {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    });
    const data = await res.json();
    return {
      success: res.ok && data.success,
      handovers: data.handovers || [],
      error: data.error,
      message: data.message,
    };
  }

  static async getAdminCashCustody(): Promise<{
    success: boolean;
    adminId?: string;
    cashBalancePaise?: number;
    cashBalanceRupees?: number;
    updatedAt?: string;
    error?: string;
    message?: string;
  }> {
    const token = this.getToken();
    const res = await fetch('/api/admin/cod/custody', {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    });
    const data = await res.json();
    return {
      success: res.ok && data.success,
      adminId: data.adminId,
      cashBalancePaise: data.cashBalancePaise,
      cashBalanceRupees: data.cashBalanceRupees,
      updatedAt: data.updatedAt,
      error: data.error,
      message: data.message,
    };
  }

  static async acceptAdminCodHandover(
    handoverId: string,
    receivedAmountPaise: number,
    notes?: string
  ): Promise<any> {
    const token = this.getToken();
    const res = await fetch(`/api/admin/cod/handovers/${encodeURIComponent(handoverId)}/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ receivedAmountPaise, notes }),
    });
    return await res.json();
  }

  static async rejectAdminCodHandover(
    handoverId: string,
    reason?: string
  ): Promise<any> {
    const token = this.getToken();
    const res = await fetch(`/api/admin/cod/handovers/${encodeURIComponent(handoverId)}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ reason }),
    });
    return await res.json();
  }
}

