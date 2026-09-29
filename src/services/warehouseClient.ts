import {
  WarehouseDashboardMetrics,
  WarehouseOrder,
  WarehouseInventoryItem,
  StockMovementRecord,
  WarehouseReturnRecord,
  WarehouseOrderStatus,
  StockAdjustmentReason,
  ReturnStatus,
  InspectionStatus,
  WarehouseSession,
} from '../types/warehouse';
import { AccountingBalanceResponse } from '../types/accounting';
import { SalesInvoice, PurchaseInvoice } from '../types/invoice';
import { InvoiceDocumentModel } from '../types/invoiceDocument';
import { auth } from '../config/firebase';

const WAREHOUSE_TOKEN_KEY = 'mrfutkar_warehouse_token';
const WAREHOUSE_SESSION_KEY = 'mrfutkar_warehouse_session';

export class WarehouseClient {
  private static activeUserId: string = '';
  private static activeToken: string = '';
  private static currentSession: WarehouseSession | null = null;

  static setAuthToken(token: string) {
    this.activeToken = token;
    try {
      if (token) localStorage.setItem(WAREHOUSE_TOKEN_KEY, token);
      else localStorage.removeItem(WAREHOUSE_TOKEN_KEY);
    } catch {
      // ignore
    }
  }

  static getAuthToken(): string {
    if (!this.activeToken) {
      try {
        this.activeToken = localStorage.getItem(WAREHOUSE_TOKEN_KEY) || '';
      } catch {
        // ignore
      }
    }
    return this.activeToken;
  }

  static setActiveUserId(userId: string) {
    this.activeUserId = userId;
  }

  static getActiveUserId(): string {
    return this.activeUserId;
  }

  static setCurrentSession(session: WarehouseSession | null) {
    this.currentSession = session;
    try {
      if (session) {
        localStorage.setItem(WAREHOUSE_SESSION_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(WAREHOUSE_SESSION_KEY);
      }
    } catch {
      // ignore
    }
  }

  static getCurrentSession(): WarehouseSession | null {
    if (!this.currentSession) {
      try {
        const saved = localStorage.getItem(WAREHOUSE_SESSION_KEY);
        if (saved) {
          this.currentSession = JSON.parse(saved);
        }
      } catch {
        // ignore
      }
    }
    return this.currentSession;
  }

  static clearSession() {
    this.activeToken = '';
    this.activeUserId = '';
    this.currentSession = null;
    try {
      localStorage.removeItem(WAREHOUSE_TOKEN_KEY);
      localStorage.removeItem(WAREHOUSE_SESSION_KEY);
    } catch {
      // ignore
    }
  }

  static isAuthorized(): boolean {
    const session = this.getCurrentSession();
    return (
      Boolean(session) &&
      session?.warehouseId === 'WH-BRAHMPURI-01' &&
      ['WAREHOUSE_ADMIN', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'SUPER_ADMIN'].includes(
        session?.role || ''
      )
    );
  }

  private static async fetchJson(url: string, options?: RequestInit) {
    let token = this.getAuthToken();
    if (!token && auth.currentUser) {
      try {
        token = await auth.currentUser.getIdToken();
        this.setAuthToken(token);
      } catch {
        // ignore
      }
    }
    const res = await fetch(url, {
      ...options,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options?.headers || {}),
      },
    });

    const contentType = res.headers.get('content-type') || '';
    let data: any;

    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (jsonErr: any) {
        throw new Error(`Invalid JSON response from server (${res.status}): ${jsonErr.message}`);
      }
    } else {
      const text = await res.text();
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          this.clearSession();
        }
        throw new Error(`Server returned HTTP ${res.status}: ${text.slice(0, 100) || res.statusText}`);
      }
      throw new Error(`Expected JSON but received ${contentType || 'non-JSON'}: ${text.slice(0, 100)}`);
    }

    if (!res.ok || data.success === false) {
      if (res.status === 401 || res.status === 403) {
        this.clearSession();
      }
      throw new Error(data.message || data.error || `Warehouse API request failed with status ${res.status}`);
    }
    return data;
  }

  /**
   * Securely claims / links a WH-BRAHMPURI-01 staff slot to the authenticated Firebase User
   */
  static async claimStaff(staffId: string, token: string): Promise<WarehouseSession> {
    const res = await fetch('/api/warehouse/claim-staff', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ staffId }),
    });

    const contentType = res.headers.get('content-type') || '';
    let data: any;
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (jsonErr: any) {
        throw new Error(`Invalid response from warehouse server (${res.status}): ${jsonErr.message}`);
      }
    } else {
      const text = await res.text();
      throw new Error(`Warehouse server returned error (${res.status}): ${text.slice(0, 100) || res.statusText}`);
    }

    if (!res.ok || !data.success) {
      throw new Error(data.message || data.error || 'Failed to claim warehouse staff slot');
    }

    const session: WarehouseSession = {
      uid: data.uid,
      role: data.role,
      name: data.name,
      email: data.email,
      warehouseId: data.warehouseId,
      warehouseName: data.warehouseName,
      branchName: data.branchName,
    };

    this.setCurrentSession(session);
    this.setAuthToken(token);
    this.setActiveUserId(data.uid);
    return session;
  }

  /**
   * Authoritative session verification against GET /api/warehouse/session
   */
  static async getSession(token?: string): Promise<WarehouseSession> {
    let bearer = token || this.getAuthToken();
    if (!bearer && auth.currentUser) {
      try {
        bearer = await auth.currentUser.getIdToken();
        this.setAuthToken(bearer);
      } catch {
        // ignore
      }
    }
    if (!bearer) {
      throw new Error('Authentication token is required to verify warehouse session.');
    }

    const res = await fetch('/api/warehouse/session', {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearer}`,
      },
    });

    const contentType = res.headers.get('content-type') || '';
    let data: any;
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (jsonErr: any) {
        this.clearSession();
        throw new Error(`Invalid response from warehouse server (${res.status}): ${jsonErr.message}`);
      }
    } else {
      this.clearSession();
      const text = await res.text();
      throw new Error(`Warehouse access denied (${res.status}): ${text.slice(0, 100) || res.statusText}`);
    }

    if (!res.ok || !data.success) {
      this.clearSession();
      throw new Error(data.message || data.error || 'Warehouse access denied');
    }

    const session: WarehouseSession = {
      uid: data.uid,
      role: data.role,
      name: data.name,
      email: data.email,
      warehouseId: data.warehouseId,
      warehouseName: data.warehouseName,
      branchName: data.branchName,
    };

    this.setCurrentSession(session);
    if (token) this.setAuthToken(token);
    if (data.uid) this.setActiveUserId(data.uid);

    return session;
  }

  static async getMetrics(): Promise<WarehouseDashboardMetrics> {
    const data = await this.fetchJson('/api/warehouse/metrics');
    return data.metrics;
  }

  static async getOrders(params?: {
    status?: string;
    paymentStatus?: string;
    deliveryArea?: string;
    search?: string;
    date?: string;
  }): Promise<WarehouseOrder[]> {
    const queryParts: string[] = [];
    if (params?.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
    if (params?.paymentStatus) queryParts.push(`paymentStatus=${encodeURIComponent(params.paymentStatus)}`);
    if (params?.deliveryArea) queryParts.push(`deliveryArea=${encodeURIComponent(params.deliveryArea)}`);
    if (params?.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
    if (params?.date) queryParts.push(`date=${encodeURIComponent(params.date)}`);

    const queryString = queryParts.length ? `?${queryParts.join('&')}` : '';
    const data = await this.fetchJson(`/api/warehouse/orders${queryString}`);
    return data.orders || [];
  }

  static async getOrderDetail(orderId: string): Promise<WarehouseOrder> {
    const data = await this.fetchJson(`/api/warehouse/orders/${encodeURIComponent(orderId)}`);
    return data.order;
  }

  /**
   * Fetch eligible active delivery partners assigned to WH-BRAHMPURI-01
   */
  static async getDeliveryPartners(): Promise<any[]> {
    const data = await this.fetchJson('/api/delivery/partners');
    return data.partners || [];
  }

  /**
   * Transactionally assign an order to a delivery partner at dispatch bay
   */
  static async assignDeliveryPartner(
    orderId: string,
    partnerId: string,
    moveToDispatched = false
  ): Promise<any> {
    const data = await this.fetchJson('/api/delivery/assign', {
      method: 'POST',
      body: JSON.stringify({ orderId, partnerId, moveToDispatched }),
    });
    return data;
  }

  static async updateOrderStatus(
    orderId: string,
    newStatus: WarehouseOrderStatus,
    reason?: string,
    userId = 'WH-MGR-01',
    userName = 'Warehouse Manager'
  ): Promise<{ orderId: string; previousStatus: string; newStatus: string }> {
    const data = await this.fetchJson(`/api/warehouse/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'POST',
      body: JSON.stringify({ newStatus, reason, userId, userName }),
    });
    return data;
  }

  static async updatePicking(
    orderId: string,
    items: Record<string, { pickedQty: number; isShort: boolean; notes?: string }>,
    completePicking = false,
    userId = 'WH-PICKER-01',
    userName = 'Picking Staff'
  ): Promise<any> {
    const data = await this.fetchJson(`/api/warehouse/orders/${encodeURIComponent(orderId)}/picking`, {
      method: 'POST',
      body: JSON.stringify({ items, completePicking, userId, userName }),
    });
    return data;
  }

  static async updatePacking(
    orderId: string,
    payload: {
      numberOfPackages: number;
      boxType?: string;
      packingNotes?: string;
      userId?: string;
      userName?: string;
      moveToReady?: boolean;
    }
  ): Promise<any> {
    const data = await this.fetchJson(`/api/warehouse/orders/${encodeURIComponent(orderId)}/packing`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data;
  }

  static async getInventory(params?: {
    category?: string;
    search?: string;
    stockStatus?: string;
  }): Promise<WarehouseInventoryItem[]> {
    const queryParts: string[] = [];
    if (params?.category) queryParts.push(`category=${encodeURIComponent(params.category)}`);
    if (params?.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
    if (params?.stockStatus) queryParts.push(`stockStatus=${encodeURIComponent(params.stockStatus)}`);

    const queryString = queryParts.length ? `?${queryParts.join('&')}` : '';
    const data = await this.fetchJson(`/api/warehouse/inventory${queryString}`);
    return data.inventory || [];
  }

  static async adjustStock(payload: {
    productId: string;
    reason: StockAdjustmentReason;
    adjustmentQuantity: number;
    notes?: string;
    userId?: string;
    userName?: string;
  }): Promise<StockMovementRecord> {
    const data = await this.fetchJson('/api/warehouse/inventory/adjust', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.movement;
  }

  static async getInventoryMovements(productId?: string): Promise<StockMovementRecord[]> {
    const url = productId
      ? `/api/warehouse/inventory/movements?productId=${encodeURIComponent(productId)}`
      : '/api/warehouse/inventory/movements';
    const data = await this.fetchJson(url);
    return data.movements || [];
  }

  static async getReturns(): Promise<WarehouseReturnRecord[]> {
    const data = await this.fetchJson('/api/warehouse/returns');
    return data.returns || [];
  }

  static async createReturn(payload: {
    orderId: string;
    retailerId?: string;
    retailerName?: string;
    shopName?: string;
    retailerMobile?: string;
    productId: string;
    productName?: string;
    sku?: string;
    quantity: number;
    reason: string;
  }): Promise<WarehouseReturnRecord> {
    const data = await this.fetchJson('/api/warehouse/returns', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data.returnRecord;
  }

  static async updateReturnStatus(
    returnId: string,
    payload: {
      returnStatus?: ReturnStatus;
      inspectionStatus?: InspectionStatus;
      inspectionNotes?: string;
      restockItem?: boolean;
      userId?: string;
      userName?: string;
    }
  ): Promise<any> {
    const data = await this.fetchJson(`/api/warehouse/returns/${encodeURIComponent(returnId)}/status`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return data;
  }

  static async getDispatchOrders(): Promise<any[]> {
    const data = await this.fetchJson('/api/warehouse/dispatch');
    return data.orders || [];
  }

  // Phase 6 Part 4B: Warehouse COD Handover methods
  static async getCodHandovers(): Promise<any[]> {
    const data = await this.fetchJson('/api/warehouse/cod/handovers');
    return data.handovers || [];
  }

  static async getWarehouseCashCustody(): Promise<{
    warehouseId: string;
    cashBalancePaise: number;
    cashBalanceRupees: number;
    updatedAt: string;
  }> {
    return await this.fetchJson('/api/warehouse/cod/custody');
  }

  static async acceptCodHandover(
    handoverId: string,
    receivedAmountPaise: number,
    notes?: string
  ): Promise<any> {
    return await this.fetchJson(`/api/warehouse/cod/handovers/${encodeURIComponent(handoverId)}/accept`, {
      method: 'POST',
      body: JSON.stringify({ receivedAmountPaise, notes }),
    });
  }

  static async rejectCodHandover(
    handoverId: string,
    reason?: string
  ): Promise<any> {
    return await this.fetchJson(`/api/warehouse/cod/handovers/${encodeURIComponent(handoverId)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  /**
   * Phase 6 Part 4C-B: Retrieve server-authoritative, read-only Cash & Bank GL balances
   */
  static async getAccountingBalances(bypassCache = false): Promise<AccountingBalanceResponse> {
    const url = `/api/warehouse/accounting/balances${bypassCache ? '?bypassCache=true' : ''}`;
    return await this.fetchJson(url);
  }

  // =========================================================================
  // Phase 6 Part 4E: Warehouse Sale Bills & Purchase Bills
  // =========================================================================

  static async listEligibleOrders(search?: string): Promise<any[]> {
    const url = `/api/warehouse/bills/eligible-orders${search ? `?search=${encodeURIComponent(search)}` : ''}`;
    const data = await this.fetchJson(url);
    return data.orders || [];
  }

  static async listSuppliers(): Promise<any[]> {
    const data = await this.fetchJson('/api/warehouse/bills/suppliers');
    return data.suppliers || [];
  }

  static async listSaleBills(filters?: any): Promise<{ invoices: SalesInvoice[]; total: number }> {
    const params = new URLSearchParams();
    if (filters) {
      Object.keys(filters).forEach(k => {
        if (filters[k] !== undefined && filters[k] !== null && filters[k] !== '') {
          params.append(k, String(filters[k]));
        }
      });
    }
    const url = `/api/warehouse/bills/sales${params.toString() ? `?${params.toString()}` : ''}`;
    return await this.fetchJson(url);
  }

  static async getSaleBillById(invoiceId: string): Promise<SalesInvoice> {
    const data = await this.fetchJson(`/api/warehouse/bills/sales/${encodeURIComponent(invoiceId)}`);
    return data.invoice;
  }

  static async createSaleBillFromOrder(payload: {
    orderId: string;
    invoiceDate?: string;
    idempotencyKey?: string;
  }): Promise<{ invoice: SalesInvoice; isIdempotentReplay: boolean; message: string }> {
    return await this.fetchJson('/api/warehouse/bills/sales', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async reverseSaleBill(invoiceId: string, reason?: string): Promise<any> {
    return await this.fetchJson(`/api/warehouse/bills/sales/${encodeURIComponent(invoiceId)}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  static async listPurchaseBills(filters?: any): Promise<{ invoices: PurchaseInvoice[]; total: number }> {
    const params = new URLSearchParams();
    if (filters) {
      Object.keys(filters).forEach(k => {
        if (filters[k] !== undefined && filters[k] !== null && filters[k] !== '') {
          params.append(k, String(filters[k]));
        }
      });
    }
    const url = `/api/warehouse/bills/purchase${params.toString() ? `?${params.toString()}` : ''}`;
    return await this.fetchJson(url);
  }

  static async getPurchaseBillById(invoiceId: string): Promise<PurchaseInvoice> {
    const data = await this.fetchJson(`/api/warehouse/bills/purchase/${encodeURIComponent(invoiceId)}`);
    return data.invoice;
  }

  static async createPurchaseBill(payload: any): Promise<{ invoice: PurchaseInvoice; isIdempotentReplay: boolean; message: string }> {
    return await this.fetchJson('/api/warehouse/bills/purchase', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async reversePurchaseBill(invoiceId: string, reason?: string): Promise<any> {
    return await this.fetchJson(`/api/warehouse/bills/purchase/${encodeURIComponent(invoiceId)}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  static async getSalesInvoiceDocument(invoiceId: string): Promise<InvoiceDocumentModel> {
    const data = await this.fetchJson(`/api/warehouse/bills/sales/${encodeURIComponent(invoiceId)}/document`);
    return data.document;
  }

  static async getPurchaseInvoiceDocument(invoiceId: string): Promise<InvoiceDocumentModel> {
    const data = await this.fetchJson(`/api/warehouse/bills/purchase/${encodeURIComponent(invoiceId)}/document`);
    return data.document;
  }
}
