import {
  DeliveryPartner,
  DeliveryPartnerSession,
  DeliveryAvailabilityStatus,
  DeliveryAssignmentStatus,
  DeliveryRejectionReason,
  DeliveryFailureReason,
  CODCollectionRecord,
  DeliveryPartnerCustody,
  DeliveryCustodyMovement,
} from '../types/delivery';
import { auth } from '../config/firebase';

const DELIVERY_TOKEN_KEY = 'mrfutkar_delivery_token';
const DELIVERY_SESSION_KEY = 'mrfutkar_delivery_session';

export class DeliveryClient {
  private static activeUserId: string = '';
  private static activeToken: string = '';
  private static currentSession: DeliveryPartnerSession | null = null;

  static setAuthToken(token: string) {
    this.activeToken = token;
    try {
      if (token) localStorage.setItem(DELIVERY_TOKEN_KEY, token);
      else localStorage.removeItem(DELIVERY_TOKEN_KEY);
    } catch {
      // ignore
    }
  }

  static getAuthToken(): string {
    if (!this.activeToken) {
      try {
        this.activeToken = localStorage.getItem(DELIVERY_TOKEN_KEY) || '';
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

  static setCurrentSession(session: DeliveryPartnerSession | null) {
    this.currentSession = session;
    try {
      if (session) {
        localStorage.setItem(DELIVERY_SESSION_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(DELIVERY_SESSION_KEY);
      }
    } catch {
      // ignore
    }
  }

  static getCurrentSession(): DeliveryPartnerSession | null {
    if (!this.currentSession) {
      try {
        const saved = localStorage.getItem(DELIVERY_SESSION_KEY);
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
      localStorage.removeItem(DELIVERY_TOKEN_KEY);
      localStorage.removeItem(DELIVERY_SESSION_KEY);
    } catch {
      // ignore
    }
  }

  static isAuthorized(): boolean {
    const session = this.getCurrentSession();
    return (
      Boolean(session) &&
      (session?.role === 'DELIVERY_PARTNER' || session?.role === ('SUPER_ADMIN' as any)) &&
      session?.warehouseId === 'WH-BRAHMPURI-01'
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
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers as any),
    };

    const res = await fetch(url, { ...options, headers });
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

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        this.clearSession();
      }
      throw new Error(data.message || data.error || `Request failed with status ${res.status}`);
    }
    return data;
  }

  /**
   * Securely claims / links a WH-BRAHMPURI-01 delivery partner slot to the authenticated Firebase User
   */
  static async claimPartner(partnerId: string, token: string): Promise<DeliveryPartnerSession> {
    const res = await fetch('/api/delivery/claim-partner', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ partnerId }),
    });

    const contentType = res.headers.get('content-type') || '';
    let data: any;
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch (jsonErr: any) {
        throw new Error(`Invalid response from delivery server (${res.status}): ${jsonErr.message}`);
      }
    } else {
      const text = await res.text();
      throw new Error(`Delivery server returned error (${res.status}): ${text.slice(0, 100) || res.statusText}`);
    }

    if (!res.ok || !data.success) {
      throw new Error(data.message || data.error || 'Failed to claim delivery partner slot');
    }

    const session: DeliveryPartnerSession = data.session;
    this.setCurrentSession(session);
    this.setAuthToken(token);
    this.setActiveUserId(session.userId);
    return session;
  }

  static async getSession(): Promise<DeliveryPartnerSession> {
    const res = await this.fetchJson('/api/delivery/session');
    if (res.success && res.session) {
      this.setCurrentSession(res.session);
      return res.session;
    }
    throw new Error(res.error || 'Failed to resolve delivery partner session');
  }

  static async getProfile(): Promise<DeliveryPartner> {
    const res = await this.fetchJson('/api/delivery/profile');
    return res.partner;
  }

  static async updateProfile(updates: { alternateMobile?: string; photoUrl?: string }): Promise<DeliveryPartner> {
    const res = await this.fetchJson('/api/delivery/profile', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return res.partner;
  }

  static async getAvailability(): Promise<{ availabilityStatus: DeliveryAvailabilityStatus }> {
    const res = await this.fetchJson('/api/delivery/availability');
    return res;
  }

  static async setAvailability(status: DeliveryAvailabilityStatus): Promise<any> {
    const res = await this.fetchJson('/api/delivery/availability', {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    if (this.currentSession) {
      this.currentSession.availabilityStatus = status;
    }
    return res;
  }

  static async getAssignedOrders(statusFilter?: string): Promise<any[]> {
    const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    const res = await this.fetchJson(`/api/delivery/orders${query}`);
    return res.orders || [];
  }

  static async getOrderDetail(orderId: string): Promise<any> {
    const res = await this.fetchJson(`/api/delivery/orders/${orderId}`);
    return res.order;
  }

  static async getShopDestination(orderId: string): Promise<any> {
    const res = await this.fetchJson(`/api/delivery/orders/${orderId}/destination`);
    return res.destination;
  }

  static async acceptOrder(orderId: string): Promise<any> {
    return await this.fetchJson(`/api/delivery/orders/${orderId}/accept`, {
      method: 'POST',
    });
  }

  static async rejectOrder(orderId: string, reason: DeliveryRejectionReason | string): Promise<any> {
    return await this.fetchJson(`/api/delivery/orders/${orderId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  static async pickupOrder(orderId: string): Promise<any> {
    return await this.fetchJson(`/api/delivery/orders/${orderId}/pickup`, {
      method: 'POST',
    });
  }

  static async setOutForDelivery(orderId: string): Promise<any> {
    return await this.fetchJson(`/api/delivery/orders/${orderId}/out-for-delivery`, {
      method: 'POST',
    });
  }

  static async completeDelivery(
    orderId: string,
    details?: {
      recipientName?: string;
      deliveryNotes?: string;
      proofOfDeliveryRef?: string;
      amountCollected?: number;
      paymentMethod?: 'CASH' | 'UPI';
      paymentReference?: string;
      otp?: string;
      photoUrl?: string;
      signatureUrl?: string;
    }
  ): Promise<any> {
    return await this.fetchJson(`/api/delivery/orders/${orderId}/delivered`, {
      method: 'POST',
      body: JSON.stringify(details || {}),
    });
  }

  static async getCashCustody(): Promise<{
    success: boolean;
    partnerId: string;
    warehouseId: string;
    cashBalancePaise: number;
    cashBalanceRupees: number;
    updatedAt: string;
  }> {
    return await this.fetchJson('/api/delivery/cod/custody');
  }

  static async getCodCollections(): Promise<CODCollectionRecord[]> {
    const res = await this.fetchJson('/api/delivery/cod/collections');
    return res.collections || [];
  }

  static async getCustodyMovements(): Promise<DeliveryCustodyMovement[]> {
    const res = await this.fetchJson('/api/delivery/cod/movements');
    return res.movements || [];
  }

  // Phase 6 Part 4B: COD Cash Handover methods
  static async submitCodHandover(payload: {
    destinationType: 'WAREHOUSE' | 'ADMIN';
    requestedAmountPaise?: number;
    requestedAmountRupees?: number;
    collectionIds?: string[];
    notes?: string;
  }): Promise<any> {
    return await this.fetchJson('/api/delivery/cod/handover', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async getPartnerHandovers(): Promise<any[]> {
    const res = await this.fetchJson('/api/delivery/cod/handovers');
    return res.handovers || [];
  }

  static async getEligibleCollections(): Promise<CODCollectionRecord[]> {
    const res = await this.fetchJson('/api/delivery/cod/eligible-collections');
    return res.collections || [];
  }

  static async cancelCodHandover(handoverId: string): Promise<any> {
    return await this.fetchJson(`/api/delivery/cod/handovers/${encodeURIComponent(handoverId)}/cancel`, {
      method: 'POST',
    });
  }

  static async failDelivery(orderId: string, reason: DeliveryFailureReason | string, notes?: string): Promise<any> {
    return await this.fetchJson(`/api/delivery/orders/${orderId}/failed`, {
      method: 'POST',
      body: JSON.stringify({ reason, notes }),
    });
  }

  static async returnToWarehouse(orderId: string, returnReason?: string): Promise<any> {
    return await this.fetchJson(`/api/delivery/orders/${orderId}/return`, {
      method: 'POST',
      body: JSON.stringify({ returnReason }),
    });
  }

  // Delivery OTP & Proof of Delivery API
  static async generateDeliveryOtp(orderId: string): Promise<any> {
    return await this.fetchJson(`/api/delivery/orders/${orderId}/otp/generate`, {
      method: 'POST',
    });
  }

  static async verifyDeliveryOtp(orderId: string, otp: string): Promise<any> {
    return await this.fetchJson(`/api/delivery/orders/${orderId}/otp/verify`, {
      method: 'POST',
      body: JSON.stringify({ otp }),
    });
  }

  static async uploadPod(
    orderId: string,
    type: 'photo' | 'signature',
    dataUrl: string
  ): Promise<any> {
    return await this.fetchJson(`/api/delivery/orders/${orderId}/pod/upload`, {
      method: 'POST',
      body: JSON.stringify({ type, dataUrl }),
    });
  }
}
