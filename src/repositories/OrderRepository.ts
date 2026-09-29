import { Order, OrderItem, OrderStatus, PaymentMethod, PaymentStatus, DeliveryAddress } from '../types/order';
import { productRepository } from './ProductRepository';
import { PricingEngine } from '../services/pricingEngine';
import { BusinessSettingsService } from '../config/businessSettings';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';

const STORAGE_KEY = 'mrfutkar_orders';

export interface RepeatOrderResult {
  addedItems: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  unavailableItems: Array<{
    productId: string;
    productName: string;
    reason: string;
  }>;
}

export interface CreateOrderInput {
  retailerId: string;
  retailerName: string;
  shopName: string;
  items: OrderItem[];
  deliveryAddress: DeliveryAddress;
  subtotal: number;
  discount: number;
  schemeDiscount?: number;
  deliveryCharge: number;
  tax: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  orderNotes?: string;
  idempotencyKey?: string;
}

export interface IOrderRepository {
  getOrders(retailerId?: string): Promise<Order[]>;
  getOrderById(orderId: string): Promise<Order | undefined>;
  createOrder(orderInput: CreateOrderInput): Promise<Order>;
  cancelOrder(orderId: string, reason: string): Promise<Order>;
  repeatOrder(orderId: string): Promise<RepeatOrderResult>;
  subscribeToOrders(retailerId: string, onUpdate: (orders: Order[]) => void): () => void;
  subscribeToOrder(orderId: string, onUpdate: (order: Order) => void): () => void;
}

export class LocalOrderRepository implements IOrderRepository {
  protected initializeDefaultOrders(): Order[] {
    try {
      const existing = localStorage.getItem(STORAGE_KEY);
      if (existing) {
        const parsed = JSON.parse(existing);
        if (parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }

    const seedOrders: Order[] = [
      {
        orderId: 'MF-20260921-000842',
        id: 'MF-20260921-000842',
        orderNumber: 'MF-20260921-000842',
        retailerId: 'ret-brahmpuri-01',
        retailerName: 'Radhey Shyam Gupta',
        shopName: 'Shree Krishna Kirana & General Store',
        warehouseId: 'WH-BRAHMPURI-01',
        warehouseName: 'MR FUTKAR — BRAHMPURI',
        items: [
          {
            productId: 'prod-001',
            sku: 'PAR-GLU-800G',
            productName: 'Parle-G 800g Super Saver Family Pack',
            brandName: 'Parle',
            imageUrl: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500&auto=format&fit=crop&q=80',
            quantity: 24,
            unit: 'Pack',
            packSize: '800g',
            caseQuantity: 24,
            unitPrice: 68,
            discount: 288,
            subtotal: 1632,
          },
          {
            productId: 'prod-021',
            sku: 'HLD-ALU-200G',
            productName: 'Haldiram Aloo Bhujia 200g Pouch',
            brandName: 'Haldiram',
            imageUrl: 'https://images.unsplash.com/photo-1599490659213-e2b9527bd087?w=500&auto=format&fit=crop&q=80',
            quantity: 20,
            unit: 'Pack',
            packSize: '200g',
            caseQuantity: 30,
            unitPrice: 53,
            discount: 240,
            subtotal: 1060,
          },
        ],
        deliveryAddress: {
          id: 'addr-default',
          shopName: 'Shree Krishna Kirana & General Store',
          ownerName: 'Radhey Shyam Gupta',
          fullAddress: 'Shop #4, Main Brahmpuri Road, Near Brahmpuri Bus Stand',
          city: 'Delhi',
          pincode: '110053',
          phone: '9810012345',
          isDefault: true,
        },
        subtotal: 2692,
        discount: 528,
        deliveryCharge: 0,
        tax: 0,
        grandTotal: 2692,
        total: 2692,
        savings: 528,
        paymentMethod: 'COD',
        paymentStatus: PaymentStatus.PENDING,
        orderStatus: OrderStatus.OUT_FOR_DELIVERY,
        status: 'Out for Delivery',
        orderNotes: 'Please deliver through back lane if road is blocked for morning rush.',
        deliveryPartnerId: 'DP-092',
        deliveryPartnerName: 'Ramesh Sharma (Vehicle DL14-AB-4920)',
        estimatedDeliveryTime: 'Today by 3:30 PM',
        createdAt: '2026-09-21T10:15:00.000Z',
        updatedAt: '2026-09-21T11:45:00.000Z',
      },
    ];

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seedOrders));
    } catch {
      // ignore
    }
    return seedOrders;
  }

  async getOrders(retailerId?: string): Promise<Order[]> {
    const all = this.initializeDefaultOrders();
    if (retailerId) {
      return all.filter(o => o.retailerId === retailerId);
    }
    return all;
  }

  async getOrderById(orderId: string): Promise<Order | undefined> {
    const orders = await this.getOrders();
    return orders.find(o => o.orderId === orderId || o.id === orderId);
  }

  async createOrder(orderInput: CreateOrderInput): Promise<Order> {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const orderId = `MF-${dateStr}-${randomSuffix}`;
    const now = new Date().toISOString();

    const settings = BusinessSettingsService.getSettings();

    const newOrder: Order = {
      orderId,
      id: orderId,
      orderNumber: orderId,
      retailerId: orderInput.retailerId,
      retailerName: orderInput.retailerName,
      shopName: orderInput.shopName,
      items: orderInput.items.map(item => ({
        ...item,
        pricingSource: (item.pricingSource || (item.slabMinQuantity ? 'GLOBAL_SLAB' : 'DEFAULT')) as any,
        pricingId: item.pricingId || 'order-creation-snapshot',
        slabMinQuantity: item.slabMinQuantity,
        slabMaxQuantity: item.slabMaxQuantity ?? null,
        serverValidatedUnitPrice: item.serverValidatedUnitPrice ?? item.unitPrice,
        serverValidatedDiscount: item.serverValidatedDiscount ?? item.discount,
        serverValidatedSubtotal: item.serverValidatedSubtotal ?? item.subtotal,
      })),
      deliveryAddress: orderInput.deliveryAddress,
      deliveryAddressSnapshot: {
        fullAddress: orderInput.deliveryAddress.fullAddress,
        landmark: orderInput.deliveryAddress.landmark,
        city: orderInput.deliveryAddress.city,
        pincode: orderInput.deliveryAddress.pincode,
        latitude: orderInput.deliveryAddress.latitude,
        longitude: orderInput.deliveryAddress.longitude,
        shopName: orderInput.deliveryAddress.shopName,
        ownerName: orderInput.deliveryAddress.ownerName,
        phone: orderInput.deliveryAddress.phone,
      },
      warehouseId: settings.defaultWarehouseId,
      warehouseName: settings.defaultWarehouseName,
      subtotal: orderInput.subtotal,
      discount: orderInput.discount,
      deliveryCharge: orderInput.deliveryCharge,
      tax: orderInput.tax,
      grandTotal: orderInput.grandTotal,
      total: orderInput.grandTotal,
      savings: orderInput.discount,
      paymentMethod: orderInput.paymentMethod,
      paymentStatus: orderInput.paymentMethod === 'ONLINE' ? PaymentStatus.PAID : PaymentStatus.PENDING,
      orderStatus: OrderStatus.PLACED,
      status: 'Placed',
      orderNotes: orderInput.orderNotes?.trim() || undefined,
      estimatedDeliveryTime: settings.defaultEstimatedDelivery,
      createdAt: now,
      updatedAt: now,
    };

    const orders = await this.getOrders();
    orders.unshift(newOrder);

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
      }
    } catch (e) {
      console.error('Failed to save order to localStorage', e);
    }

    return newOrder;
  }

  async cancelOrder(orderId: string, reason: string): Promise<Order> {
    const orders = await this.getOrders();
    const index = orders.findIndex(o => o.orderId === orderId || o.id === orderId);
    if (index === -1) {
      throw new Error(`Order ${orderId} not found`);
    }

    const order = orders[index];
    const settings = BusinessSettingsService.getSettings();
    if (!BusinessSettingsService.isOrderCancellable(order.orderStatus, settings)) {
      throw new Error(`Order cannot be cancelled in current status: ${order.orderStatus}`);
    }

    const now = new Date().toISOString();
    order.orderStatus = OrderStatus.CANCELLED;
    order.status = 'Cancelled';
    order.cancellationReason = reason;
    order.cancelledAt = now;
    order.updatedAt = now;

    orders[index] = order;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    } catch {
      // ignore
    }

    return order;
  }

  async repeatOrder(orderId: string): Promise<RepeatOrderResult> {
    const order = await this.getOrderById(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    const addedItems: RepeatOrderResult['addedItems'] = [];
    const unavailableItems: RepeatOrderResult['unavailableItems'] = [];

    for (const item of order.items) {
      const currentProduct = await productRepository.getById(item.productId);

      if (!currentProduct) {
        unavailableItems.push({
          productId: item.productId,
          productName: item.productName,
          reason: 'Product no longer listed in wholesale catalogue',
        });
        continue;
      }

      if (currentProduct.inStock === false || !currentProduct.isInStock || (currentProduct.stockQuantity || 0) <= 0) {
        unavailableItems.push({
          productId: item.productId,
          productName: item.productName,
          reason: 'Product is currently out of stock at Jaipur Hub',
        });
        continue;
      }

      const availableStock = currentProduct.stockQuantity || 9999;
      const moq = currentProduct.minimumOrderQuantity || 1;
      let targetQty = item.quantity;

      if (targetQty < moq) targetQty = moq;
      if (targetQty > availableStock) targetQty = availableStock;

      if (targetQty <= 0) {
        unavailableItems.push({
          productId: item.productId,
          productName: item.productName,
          reason: 'Insufficient stock to meet minimum order quantity',
        });
        continue;
      }

      const pricing = PricingEngine.getPricingBreakdown(currentProduct, targetQty);

      addedItems.push({
        productId: currentProduct.productId || currentProduct.id,
        productName: currentProduct.productName || currentProduct.name,
        quantity: targetQty,
        unitPrice: pricing.unitPrice,
        subtotal: pricing.subtotal,
      });
    }

    return { addedItems, unavailableItems };
  }

  subscribeToOrders(retailerId: string, onUpdate: (orders: Order[]) => void): () => void {
    this.getOrders(retailerId).then(onUpdate);
    return () => {};
  }

  subscribeToOrder(orderId: string, onUpdate: (order: Order) => void): () => void {
    this.getOrderById(orderId).then(order => {
      if (order) onUpdate(order);
    });
    return () => {};
  }
}

export class FirebaseOrderRepository extends LocalOrderRepository implements IOrderRepository {
  private collectionName = 'orders';

  override async getOrders(retailerId?: string): Promise<Order[]> {
    const currentUid = retailerId || auth.currentUser?.uid;

    if (!currentUid) {
      return super.getOrders();
    }

    try {
      const q = query(
        collection(db, this.collectionName),
        where('retailerId', '==', currentUid)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        // Fall back to local storage if user has local orders
        return super.getOrders(currentUid);
      }

      const orders: Order[] = [];
      snap.forEach(d => {
        const data = d.data() as Order;
        orders.push({
          ...data,
          orderId: data.orderId || d.id,
          id: data.orderId || d.id,
          orderNumber: data.orderId || d.id,
          total: data.grandTotal,
        });
      });

      // Sort newest first
      orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return orders;
    } catch (err) {
      console.warn('Firestore getOrders failed, falling back to local storage:', err);
      return super.getOrders(currentUid);
    }
  }

  override async getOrderById(orderId: string): Promise<Order | undefined> {
    try {
      const docRef = doc(db, this.collectionName, orderId);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        const data = snap.data() as Order;
        return {
          ...data,
          orderId: data.orderId || snap.id,
          id: data.orderId || snap.id,
          orderNumber: data.orderId || snap.id,
          total: data.grandTotal,
        };
      }
    } catch (err) {
      console.warn('Firestore getOrderById failed, checking local:', err);
    }

    return super.getOrderById(orderId);
  }

  override async createOrder(orderInput: CreateOrderInput): Promise<Order> {
    const isProduction = import.meta.env?.PROD || process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';

    // 1. Get current Auth Token
    let token = '';
    try {
      if (auth.currentUser) {
        token = await auth.currentUser.getIdToken();
      }
    } catch {
      // ignore
    }

    if (!token) {
      throw new Error('You must be signed in to place a wholesale order. Please verify your login.');
    }

    // 2. Prepare payload for authoritative server endpoint
    const idempotencyKey = orderInput.idempotencyKey || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);

    const payload = {
      idempotencyKey,
      retailerName: orderInput.retailerName,
      shopName: orderInput.shopName,
      deliveryAddress: orderInput.deliveryAddress,
      paymentMethod: orderInput.paymentMethod,
      orderNotes: orderInput.orderNotes?.trim() || '',
      items: orderInput.items.map(i => ({
        productId: i.productId,
        quantity: i.quantity,
      })),
    };

    // 3. Call Server-Side Order Endpoint
    const resp = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok || !data || !data.success) {
      const errorMsg = data?.message || data?.error || 'Failed to place wholesale order with warehouse backend.';
      throw new Error(errorMsg);
    }

    // 4. Fetch the authoritative order document from Firestore or construct authoritative response
    const orderId = data.orderId;
    try {
      const orderDoc = await getDoc(doc(db, this.collectionName, orderId));
      if (orderDoc.exists()) {
        const fullOrder = orderDoc.data() as Order;
        return {
          ...fullOrder,
          id: fullOrder.orderId,
          orderNumber: fullOrder.orderId,
        };
      }
    } catch {
      // If direct read fails, synthesize from server response
    }

    const settings = BusinessSettingsService.getSettings();
    const createdOrder: Order = {
      orderId,
      id: orderId,
      orderNumber: orderId,
      retailerId: orderInput.retailerId,
      retailerName: orderInput.retailerName,
      shopName: orderInput.shopName,
      items: orderInput.items,
      deliveryAddress: orderInput.deliveryAddress,
      warehouseId: settings.defaultWarehouseId,
      warehouseName: settings.defaultWarehouseName,
      subtotal: data.subtotal || orderInput.subtotal,
      discount: data.discount !== undefined ? data.discount : orderInput.discount,
      deliveryCharge: data.deliveryCharge !== undefined ? data.deliveryCharge : orderInput.deliveryCharge,
      tax: 0,
      grandTotal: data.grandTotal || orderInput.grandTotal,
      total: data.grandTotal || orderInput.grandTotal,
      savings: data.discount !== undefined ? data.discount : orderInput.discount,
      paymentMethod: orderInput.paymentMethod,
      paymentStatus: PaymentStatus.PENDING,
      orderStatus: OrderStatus.PLACED,
      status: 'Placed',
      orderNotes: orderInput.orderNotes?.trim() || undefined,
      estimatedDeliveryTime: settings.defaultEstimatedDelivery,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.createdAt || new Date().toISOString(),
    };

    return createdOrder;
  }

  override async cancelOrder(orderId: string, reason: string): Promise<Order> {
    const existing = await this.getOrderById(orderId);
    if (!existing) {
      throw new Error(`Order ${orderId} not found`);
    }

    let token = '';
    if (auth.currentUser) {
      token = await auth.currentUser.getIdToken().catch(() => '');
    }
    if (!token) {
      throw new Error('You must be signed in to cancel an order. Please verify your login.');
    }

    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ reason }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.message || data.error || `Server failed to cancel order ${orderId}`);
    }

    // Update local cache strictly upon confirmed server authority execution
    return super.cancelOrder(orderId, reason);
  }

  override subscribeToOrders(retailerId: string, onUpdate: (orders: Order[]) => void): Unsubscribe {
    const currentUid = retailerId || auth.currentUser?.uid;
    if (!currentUid) {
      this.getOrders().then(onUpdate);
      return () => {};
    }

    try {
      const q = query(
        collection(db, this.collectionName),
        where('retailerId', '==', currentUid)
      );

      return onSnapshot(
        q,
        snapshot => {
          if (snapshot.empty) {
            this.getOrders(currentUid).then(onUpdate);
            return;
          }

          const orders: Order[] = [];
          snapshot.forEach(d => {
            const data = d.data() as Order;
            orders.push({
              ...data,
              orderId: data.orderId || d.id,
              id: data.orderId || d.id,
              orderNumber: data.orderId || d.id,
              total: data.grandTotal,
            });
          });

          orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          onUpdate(orders);
        },
        error => {
          console.warn('Firestore orders snapshot error, using local fallback:', error);
          this.getOrders(currentUid).then(onUpdate);
        }
      );
    } catch (err) {
      console.warn('Failed to attach firestore orders listener:', err);
      this.getOrders(currentUid).then(onUpdate);
      return () => {};
    }
  }

  override subscribeToOrder(orderId: string, onUpdate: (order: Order) => void): Unsubscribe {
    try {
      const docRef = doc(db, this.collectionName, orderId);
      return onSnapshot(
        docRef,
        snap => {
          if (snap.exists()) {
            const data = snap.data() as Order;
            onUpdate({
              ...data,
              orderId: data.orderId || snap.id,
              id: data.orderId || snap.id,
              orderNumber: data.orderId || snap.id,
              total: data.grandTotal,
            });
          }
        },
        error => {
          console.warn('Firestore order snapshot error:', error);
          this.getOrderById(orderId).then(o => {
            if (o) onUpdate(o);
          });
        }
      );
    } catch (err) {
      this.getOrderById(orderId).then(o => {
        if (o) onUpdate(o);
      });
      return () => {};
    }
  }
}

export const orderRepository: IOrderRepository = new FirebaseOrderRepository();
export { LocalOrderRepository as OrderRepository };
