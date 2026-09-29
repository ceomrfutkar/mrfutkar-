/**
 * MR FUTKAR — Super Admin Retailer Management Routes
 * Phase 3B-4A: Retailer Management Backend + API + Security
 * 
 * Secure server-authoritative endpoints for listing, viewing, searching,
 * inspecting orders, activity, customer pricing, audit logs, and activating/deactivating retailers.
 * Strictly enforced by requireSuperAdmin() and logged to adminAuditLogs.
 */

import { Router, Request, Response } from 'express';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
} from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN } from './firebaseAdmin';
import { requireSuperAdmin, logAdminAudit } from './adminAuth';
import { AdminUser } from '../src/types/admin';
import { PricingEngine } from '../src/services/pricingEngine';
import { Product, ProductPricingRule } from '../src/types/product';

export const adminRetailerRouter = Router();

// Enforce Super Admin authorization across all retailer management routes
adminRetailerRouter.use(requireSuperAdmin());

const ALLOWED_RETAILER_QUERY_PARAMS = new Set([
  'search',
  'status',
  'city',
  'area',
  'pincode',
  'activity',
  'dateFrom',
  'dateTo',
  'page',
  'pageSize',
]);

export interface SafeRetailer {
  retailerId: string;
  businessName: string;
  shopName: string;
  ownerName: string;
  mobile: string;
  email?: string;
  businessType?: string;
  gstin?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
  isActive: boolean;
  address: string;
  landmark?: string;
  city: string;
  state?: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  nearestWarehouse?: string;
  profilePhotoUrl?: string | null;
  isProfileComplete: boolean;
  creditLimit?: number;
  availableCredit?: number;
  createdAt: string;
  updatedAt: string;
  totalOrders?: number;
  totalPurchase?: number;
  lastOrder?: string | null;
  registeredDate?: string;
}

/**
 * Sanitizes raw Firestore retailer document to ensure only authorized safe fields
 * are returned. Never exposes internal tokens, passwords, or unrelated internal attributes.
 */
export function sanitizeRetailer(docData: any, docId: string): SafeRetailer {
  const retailerId = docData.retailerId || docId;
  const rawStatus = (docData.status || '').toUpperCase();
  const isActive = docData.isActive !== false && rawStatus !== 'INACTIVE' && rawStatus !== 'DEACTIVATED';
  const status = rawStatus === 'INACTIVE' || rawStatus === 'DEACTIVATED'
    ? 'INACTIVE'
    : rawStatus === 'SUSPENDED'
    ? 'SUSPENDED'
    : rawStatus === 'PENDING_VERIFICATION'
    ? 'PENDING_VERIFICATION'
    : (isActive ? 'ACTIVE' : 'INACTIVE');

  return {
    retailerId,
    businessName: docData.businessName || docData.shopName || 'Retailer Shop',
    shopName: docData.shopName || docData.businessName || 'Retailer Shop',
    ownerName: docData.ownerName || '',
    mobile: docData.mobileNumber || docData.phone || docData.mobile || '',
    email: docData.email || '',
    businessType: docData.businessType || docData.shopType || 'Kirana / General Store',
    gstin: docData.gstin || docData.gstNumber || '',
    status,
    isActive,
    address: docData.shopAddress || docData.address || docData.fullAddress || '',
    landmark: docData.landmark || '',
    city: docData.city || '',
    state: docData.state || 'Delhi',
    pincode: String(docData.pincode || ''),
    latitude: typeof docData.latitude === 'number' ? docData.latitude : null,
    longitude: typeof docData.longitude === 'number' ? docData.longitude : null,
    nearestWarehouse: docData.nearestWarehouse || 'MR FUTKAR — BRAHMPURI',
    profilePhotoUrl: docData.profilePhotoUrl || null,
    isProfileComplete: Boolean(docData.isProfileComplete),
    creditLimit: typeof docData.creditLimit === 'number' ? docData.creditLimit : 0,
    availableCredit: typeof docData.availableCredit === 'number' ? docData.availableCredit : 0,
    createdAt: docData.createdAt || new Date(0).toISOString(),
    updatedAt: docData.updatedAt || docData.createdAt || new Date(0).toISOString(),
  };
}

/**
 * GET /api/admin/retailers
 * List retailers with server-side pagination, search, status filtering, and location filtering.
 * Never loads the full retailer collection into browser memory.
 */
adminRetailerRouter.get('/', async (req: Request, res: Response) => {
  try {
    // 1. Guard against arbitrary query parameters
    const queryKeys = Object.keys(req.query);
    const invalidKeys = queryKeys.filter(k => !ALLOWED_RETAILER_QUERY_PARAMS.has(k));
    if (invalidKeys.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_QUERY_PARAMETERS',
        message: `Query parameter(s) '${invalidKeys.join(', ')}' are not permitted. Allowed: ${Array.from(ALLOWED_RETAILER_QUERY_PARAMS).join(', ')}`,
      });
    }

    const {
      search,
      status,
      city,
      area,
      pincode,
      activity,
      dateFrom,
      dateTo,
      page: rawPage,
      pageSize: rawPageSize,
    } = req.query;

    // 2. Bound pagination parameters
    const page = Math.max(1, parseInt(String(rawPage || '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(rawPageSize || '25'), 10) || 25));

    // 3. Fetch all retailers from authoritative collection
    const snapshot = await getDocs(collection(db, 'retailers'));
    let retailers: SafeRetailer[] = snapshot.docs.map(d => sanitizeRetailer(d.data(), d.id));

    // 3.5 Single-pass aggregation of order stats (prevents N+1 queries completely)
    const ordersSnap = await getDocs(collection(db, 'orders'));
    const orderStatsMap = new Map<string, { totalOrders: number; totalPurchase: number; lastOrder: string | null; recentOrdersCount: number }>();
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    for (const ordDoc of ordersSnap.docs) {
      const o = ordDoc.data();
      const retId = o.retailerId;
      if (!retId) continue;

      const current = orderStatsMap.get(retId) || { totalOrders: 0, totalPurchase: 0, lastOrder: null, recentOrdersCount: 0 };
      current.totalOrders += 1;
      if (o.orderStatus !== 'CANCELLED') {
        const val = typeof o.grandTotal === 'number' ? o.grandTotal : (typeof o.total === 'number' ? o.total : 0);
        current.totalPurchase += val;
      }
      const orderTime = new Date(o.createdAt || 0).getTime();
      if (orderTime > 0) {
        if (!current.lastOrder || orderTime > new Date(current.lastOrder).getTime()) {
          current.lastOrder = o.createdAt;
        }
        if (orderTime >= thirtyDaysAgo) {
          current.recentOrdersCount += 1;
        }
      }
      orderStatsMap.set(retId, current);
    }

    // Attach server-calculated summary stats to each retailer
    retailers.forEach(r => {
      const stats = orderStatsMap.get(r.retailerId) || { totalOrders: 0, totalPurchase: 0, lastOrder: null, recentOrdersCount: 0 };
      r.totalOrders = stats.totalOrders;
      r.totalPurchase = Math.round(stats.totalPurchase * 100) / 100;
      r.lastOrder = stats.lastOrder;
      r.registeredDate = r.createdAt;
    });

    // 4. Server-side Filtering
    if (status && typeof status === 'string' && status.trim().toUpperCase() !== 'ALL') {
      const targetStatus = status.trim().toUpperCase();
      retailers = retailers.filter(r => {
        if (targetStatus === 'ACTIVE') return r.status === 'ACTIVE' && r.isActive;
        if (targetStatus === 'INACTIVE') return r.status === 'INACTIVE' || !r.isActive;
        return r.status === targetStatus;
      });
    }

    if (city && typeof city === 'string' && city.trim()) {
      const c = city.trim().toLowerCase();
      retailers = retailers.filter(r => r.city.toLowerCase().includes(c));
    }

    if (area && typeof area === 'string' && area.trim()) {
      const a = area.trim().toLowerCase();
      retailers = retailers.filter(r =>
        r.address.toLowerCase().includes(a) ||
        (r.landmark && r.landmark.toLowerCase().includes(a)) ||
        r.city.toLowerCase().includes(a)
      );
    }

    if (pincode && typeof pincode === 'string' && pincode.trim()) {
      const p = pincode.trim();
      retailers = retailers.filter(r => r.pincode.startsWith(p));
    }

    if (activity && typeof activity === 'string' && activity.trim().toUpperCase() !== 'ALL') {
      const act = activity.trim().toUpperCase();
      if (act === 'ORDERED_RECENTLY' || act === 'RECENT') {
        retailers = retailers.filter(r => {
          const stats = orderStatsMap.get(r.retailerId);
          return (stats?.recentOrdersCount || 0) > 0;
        });
      } else if (act === 'NO_RECENT_ORDER' || act === 'NONE') {
        retailers = retailers.filter(r => {
          const stats = orderStatsMap.get(r.retailerId);
          return (stats?.recentOrdersCount || 0) === 0;
        });
      }
    }

    if (dateFrom && typeof dateFrom === 'string' && dateFrom.trim()) {
      const fromTime = new Date(dateFrom.trim()).getTime();
      if (!isNaN(fromTime)) {
        retailers = retailers.filter(r => new Date(r.createdAt).getTime() >= fromTime);
      }
    }

    if (dateTo && typeof dateTo === 'string' && dateTo.trim()) {
      const toTime = new Date(dateTo.trim()).getTime();
      if (!isNaN(toTime)) {
        retailers = retailers.filter(r => new Date(r.createdAt).getTime() <= toTime);
      }
    }

    if (search && typeof search === 'string' && search.trim()) {
      const s = search.trim().toLowerCase();
      retailers = retailers.filter(r =>
        r.businessName.toLowerCase().includes(s) ||
        r.shopName.toLowerCase().includes(s) ||
        r.ownerName.toLowerCase().includes(s) ||
        r.mobile.includes(s) ||
        r.retailerId.toLowerCase().includes(s) ||
        (r.email && r.email.toLowerCase().includes(s)) ||
        r.pincode.includes(s) ||
        r.address.toLowerCase().includes(s)
      );
    }

    // 5. Sort by createdAt descending
    retailers.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime() || 0;
      const timeB = new Date(b.createdAt).getTime() || 0;
      return timeB - timeA;
    });

    const total = retailers.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const paginatedRetailers = retailers.slice(startIndex, startIndex + pageSize);

    return res.status(200).json({
      success: true,
      retailers: paginatedRetailers,
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'RETAILER_LIST_FAILED',
      message: err.message || 'Failed to list retailers.',
    });
  }
});

/**
 * GET /api/admin/retailers/:retailerId
 * Retrieve detailed authoritative profile for a specific retailer.
 * Logs RETAILER_VIEWED admin audit event.
 */
adminRetailerRouter.get('/:retailerId', async (req: Request, res: Response) => {
  try {
    const { retailerId } = req.params;
    if (!retailerId || typeof retailerId !== 'string' || !retailerId.trim()) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_RETAILER_ID',
        message: 'Retailer ID is required.',
      });
    }

    const retDocSnap = await getDoc(doc(db, 'retailers', retailerId));
    if (!retDocSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'RETAILER_NOT_FOUND',
        message: `Retailer with ID '${retailerId}' was not found.`,
      });
    }

    const safeRetailer = sanitizeRetailer(retDocSnap.data(), retDocSnap.id);
    const adminUser = (req as any).adminUser as AdminUser;

    // Log admin view audit
    if (adminUser) {
      await logAdminAudit({
        action: 'RETAILER_VIEWED',
        adminUid: adminUser.uid,
        adminName: adminUser.name,
        targetType: 'RETAILER',
        targetId: retailerId,
        metadata: { businessName: safeRetailer.businessName },
        req,
      });
    }

    return res.status(200).json({
      success: true,
      retailer: safeRetailer,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'RETAILER_FETCH_FAILED',
      message: err.message || 'Failed to fetch retailer detail.',
    });
  }
});

/**
 * GET /api/admin/retailers/:retailerId/orders
 * Retrieve orders belonging strictly to the requested retailer.
 * Validates that the retailer exists. Uses the existing orders collection.
 */
adminRetailerRouter.get('/:retailerId/orders', async (req: Request, res: Response) => {
  try {
    const { retailerId } = req.params;
    const { page: rawPage, pageSize: rawPageSize } = req.query;

    const page = Math.max(1, parseInt(String(rawPage || '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(rawPageSize || '25'), 10) || 25));

    // Verify retailer exists
    const retDocSnap = await getDoc(doc(db, 'retailers', retailerId));
    if (!retDocSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'RETAILER_NOT_FOUND',
        message: `Retailer with ID '${retailerId}' was not found.`,
      });
    }

    // Query existing authoritative orders collection
    const ordersQuery = query(collection(db, 'orders'), where('retailerId', '==', retailerId));
    const ordersSnap = await getDocs(ordersQuery);

    const orders = ordersSnap.docs.map(d => ({
      ...d.data(),
      id: d.id,
    }));

    // Sort by createdAt descending
    orders.sort((a: any, b: any) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    const total = orders.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const paginatedOrders = orders.slice(startIndex, startIndex + pageSize);

    // Optional read audit
    const adminUser = (req as any).adminUser as AdminUser;
    if (adminUser) {
      await logAdminAudit({
        action: 'RETAILER_ORDER_HISTORY_VIEWED',
        adminUid: adminUser.uid,
        adminName: adminUser.name,
        targetType: 'RETAILER',
        targetId: retailerId,
        metadata: { orderCount: total },
        req,
      });
    }

    return res.status(200).json({
      success: true,
      retailerId,
      orders: paginatedOrders,
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'RETAILER_ORDERS_FETCH_FAILED',
      message: err.message || 'Failed to fetch retailer orders.',
    });
  }
});

/**
 * GET /api/admin/retailers/:retailerId/summary
 * Server-authoritative purchasing and operational summary for this retailer:
 * - Total orders, delivered, cancelled, pending, failed
 * - Total purchase value (sum of non-cancelled orders' grandTotal)
 * - Average order value
 * - Last order date
 * - Top 10 purchased products aggregated directly from order item snapshots
 */
adminRetailerRouter.get('/:retailerId/summary', async (req: Request, res: Response) => {
  try {
    const { retailerId } = req.params;

    // Verify retailer exists
    const retDocSnap = await getDoc(doc(db, 'retailers', retailerId));
    if (!retDocSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'RETAILER_NOT_FOUND',
        message: `Retailer with ID '${retailerId}' was not found.`,
      });
    }

    // Query all orders for this retailer
    const ordersQuery = query(collection(db, 'orders'), where('retailerId', '==', retailerId));
    const ordersSnap = await getDocs(ordersQuery);

    let totalOrders = 0;
    let deliveredOrders = 0;
    let cancelledOrders = 0;
    let pendingOrders = 0;
    let failedDeliveries = 0;
    let totalPurchaseValue = 0;
    let lastOrderDate: string | null = null;

    const productMap = new Map<string, {
      productId: string;
      sku: string;
      productName: string;
      quantityPurchased: number;
      totalSpend: number;
    }>();

    for (const d of ordersSnap.docs) {
      const o = d.data();
      totalOrders++;

      const status = (o.orderStatus || '').toUpperCase();
      if (status === 'DELIVERED') {
        deliveredOrders++;
      } else if (status === 'CANCELLED') {
        cancelledOrders++;
      } else if (status === 'FAILED' || status === 'RETURNED' || status === 'DELIVERY_FAILED') {
        failedDeliveries++;
      } else {
        pendingOrders++;
      }

      // Financial aggregation: non-cancelled orders count towards purchase value
      if (status !== 'CANCELLED') {
        const orderTotal = typeof o.grandTotal === 'number' ? o.grandTotal : (typeof o.total === 'number' ? o.total : 0);
        totalPurchaseValue += orderTotal;

        // Aggregate top products strictly using immutable historical item snapshots
        if (Array.isArray(o.items)) {
          for (const item of o.items) {
            const pId = item.productId || item.id;
            if (!pId) continue;

            const existing = productMap.get(pId) || {
              productId: pId,
              sku: item.sku || '',
              productName: item.productName || item.name || 'Product',
              quantityPurchased: 0,
              totalSpend: 0,
            };

            const qty = typeof item.quantity === 'number' ? item.quantity : 1;
            const unitPrice = typeof item.unitPrice === 'number' ? item.unitPrice : (typeof item.price === 'number' ? item.price : 0);
            const lineSubtotal = typeof item.subtotal === 'number' ? item.subtotal : (typeof item.total === 'number' ? item.total : qty * unitPrice);

            existing.quantityPurchased += qty;
            existing.totalSpend += lineSubtotal;
            productMap.set(pId, existing);
          }
        }
      }

      // Track last order date
      const createdAt = o.createdAt;
      if (createdAt) {
        if (!lastOrderDate || new Date(createdAt).getTime() > new Date(lastOrderDate).getTime()) {
          lastOrderDate = createdAt;
        }
      }
    }

    const nonCancelledOrders = totalOrders - cancelledOrders;
    const averageOrderValue = nonCancelledOrders > 0
      ? Math.round((totalPurchaseValue / nonCancelledOrders) * 100) / 100
      : 0;

    // Top 10 products sorted by quantity purchased descending
    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.quantityPurchased - a.quantityPurchased)
      .slice(0, 10)
      .map(p => ({
        productId: p.productId,
        sku: p.sku,
        productName: p.productName,
        quantityPurchased: p.quantityPurchased,
        purchaseValue: Math.round(p.totalSpend * 100) / 100,
        averageUnitPrice: p.quantityPurchased > 0 ? Math.round((p.totalSpend / p.quantityPurchased) * 100) / 100 : 0,
      }));

    return res.status(200).json({
      success: true,
      retailerId,
      summary: {
        totalOrders,
        deliveredOrders,
        cancelledOrders,
        pendingOrders,
        failedDeliveries,
        totalPurchaseValue: Math.round(totalPurchaseValue * 100) / 100,
        averageOrderValue,
        lastOrderDate,
        topProducts,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'RETAILER_SUMMARY_FAILED',
      message: err.message || 'Failed to fetch retailer purchasing summary.',
    });
  }
});

/**
 * GET /api/admin/retailers/:retailerId/activity
 * Return operational activity timeline based strictly on existing data:
 * Registration, profile updates, order lifecycle events, and admin audit events.
 */
adminRetailerRouter.get('/:retailerId/activity', async (req: Request, res: Response) => {
  try {
    const { retailerId } = req.params;

    // Verify retailer exists
    const retDocSnap = await getDoc(doc(db, 'retailers', retailerId));
    if (!retDocSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'RETAILER_NOT_FOUND',
        message: `Retailer with ID '${retailerId}' was not found.`,
      });
    }

    const retData = retDocSnap.data();
    const activityEvents: {
      id: string;
      eventType: string;
      timestamp: string;
      title: string;
      description: string;
      metadata?: Record<string, any>;
    }[] = [];

    // 1. Account registration event
    if (retData.createdAt) {
      activityEvents.push({
        id: `ACT-REG-${retailerId}`,
        eventType: 'ACCOUNT_REGISTRATION',
        timestamp: retData.createdAt,
        title: 'Retailer Account Registered',
        description: `Account created for "${retData.shopName || retData.businessName || 'Retailer'}"`,
        metadata: {
          ownerName: retData.ownerName,
          mobile: retData.mobileNumber || retData.phone,
          city: retData.city,
        },
      });
    }

    // 2. Profile update event (if updated after registration)
    if (retData.updatedAt && retData.createdAt && retData.updatedAt !== retData.createdAt) {
      activityEvents.push({
        id: `ACT-UPD-${retailerId}`,
        eventType: 'PROFILE_UPDATED',
        timestamp: retData.updatedAt,
        title: 'Profile Information Updated',
        description: 'Retailer profile or shop details updated',
      });
    }

    // 3. Orders activity from existing orders collection
    const ordersQuery = query(collection(db, 'orders'), where('retailerId', '==', retailerId));
    const ordersSnap = await getDocs(ordersQuery);

    for (const d of ordersSnap.docs) {
      const o = d.data();
      const orderId = o.orderId || d.id;

      activityEvents.push({
        id: `ACT-ORD-PLACED-${orderId}`,
        eventType: 'ORDER_PLACED',
        timestamp: o.createdAt || new Date().toISOString(),
        title: `Order Placed (${orderId})`,
        description: `Wholesale order placed for ₹${o.grandTotal} (${(o.items || []).length} items)`,
        metadata: {
          orderId,
          grandTotal: o.grandTotal,
          paymentMethod: o.paymentMethod,
          paymentStatus: o.paymentStatus,
          orderStatus: o.orderStatus,
        },
      });

      if (o.orderStatus === 'DELIVERED') {
        activityEvents.push({
          id: `ACT-ORD-DELIVERED-${orderId}`,
          eventType: 'ORDER_DELIVERED',
          timestamp: o.deliveredAt || o.updatedAt || o.createdAt,
          title: `Order Delivered (${orderId})`,
          description: `Order successfully delivered to shop`,
          metadata: { orderId },
        });
      } else if (o.orderStatus === 'CANCELLED') {
        activityEvents.push({
          id: `ACT-ORD-CANCELLED-${orderId}`,
          eventType: 'ORDER_CANCELLED',
          timestamp: o.cancelledAt || o.updatedAt || o.createdAt,
          title: `Order Cancelled (${orderId})`,
          description: `Order was cancelled: ${o.cancelReason || 'Cancelled'}`,
          metadata: { orderId, cancelReason: o.cancelReason },
        });
      }
    }

    // 4. Relevant Admin Audit Events from existing adminAuditLogs collection
    const auditSnap = await getDocs(collection(db, 'adminAuditLogs'));
    for (const d of auditSnap.docs) {
      const log = d.data();
      if (
        log.targetId === retailerId ||
        log.metadata?.retailerId === retailerId ||
        log.metadata?.targetId === retailerId
      ) {
        activityEvents.push({
          id: `ACT-AUD-${d.id}`,
          eventType: log.action || 'ADMIN_ACTION',
          timestamp: log.timestamp,
          title: `Admin Action: ${log.action}`,
          description: `Performed by ${log.adminName || 'Admin'}`,
          metadata: {
            adminUid: log.adminUid,
            action: log.action,
            ...(log.metadata || {}),
          },
        });
      }
    }

    // 5. Sort all events chronologically descending
    activityEvents.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime() || 0;
      const timeB = new Date(b.timestamp).getTime() || 0;
      return timeB - timeA;
    });

    return res.status(200).json({
      success: true,
      retailerId,
      activity: activityEvents,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'RETAILER_ACTIVITY_FETCH_FAILED',
      message: err.message || 'Failed to fetch retailer activity.',
    });
  }
});

/**
 * GET /api/admin/retailers/:retailerId/pricing
 * Retrieve customer-specific and applicable global pricing rules for this retailer.
 * Reuses existing productPricing collection. Strictly filters out other retailers' rules.
 */
adminRetailerRouter.get('/:retailerId/pricing', async (req: Request, res: Response) => {
  try {
    const { retailerId } = req.params;

    // Verify retailer exists
    const retDocSnap = await getDoc(doc(db, 'retailers', retailerId));
    if (!retDocSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'RETAILER_NOT_FOUND',
        message: `Retailer with ID '${retailerId}' was not found.`,
      });
    }

    // Fetch all pricing rules
    const pricingSnap = await getDocs(collection(db, 'productPricing'));
    const customerPricingRules: any[] = [];
    const globalPricingRules: any[] = [];

    let customerSlabRulesCount = 0;
    let customerFixedRulesCount = 0;
    let activeRulesCount = 0;
    let inactiveRulesCount = 0;
    const negotiatedProductSet = new Set<string>();
    const negotiatedProducts: Array<{ productId: string; productName?: string; ruleType: string; priceOrSlabs: any }> = [];

    for (const d of pricingSnap.docs) {
      const r = d.data();
      const rule = { ...r, ruleId: d.id } as any;

      // Strictly isolate: rules belonging to THIS retailer
      if (rule.retailerId === retailerId) {
        customerPricingRules.push(rule);
        if (rule.pricingType === 'CUSTOMER_SLAB') customerSlabRulesCount++;
        if (rule.pricingType === 'CUSTOMER_FIXED') customerFixedRulesCount++;
        if (rule.status === 'ACTIVE' || rule.active === true) activeRulesCount++;
        else inactiveRulesCount++;

        if (rule.productId) {
          negotiatedProductSet.add(rule.productId);
          negotiatedProducts.push({
            productId: rule.productId,
            productName: rule.productName || rule.productId,
            ruleType: rule.pricingType,
            priceOrSlabs: rule.customPrice ?? rule.slabs ?? null,
          });
        }
      } else if (
        rule.pricingType === 'GLOBAL_SLAB' &&
        (!rule.retailerId || rule.retailerId === '') &&
        (rule.status === 'ACTIVE' || rule.active === true)
      ) {
        // Applicable active global slab rules
        globalPricingRules.push(rule);
      }
      // Rules for another retailer are NEVER included
    }

    return res.status(200).json({
      success: true,
      retailerId,
      customerPricingRules,
      globalPricingRules,
      totalRules: customerPricingRules.length + globalPricingRules.length,
      customerSlabRulesCount,
      customerFixedRulesCount,
      activeRulesCount,
      inactiveRulesCount,
      negotiatedProductsCount: negotiatedProductSet.size,
      negotiatedProducts,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'RETAILER_PRICING_FETCH_FAILED',
      message: err.message || 'Failed to fetch retailer pricing.',
    });
  }
});

/**
 * GET /api/admin/retailers/:retailerId/effective-price
 * Preview effective price for a selected product and quantity for this retailer.
 * Uses the SAME PricingEngine.resolveProductPrice as authoritative order creation.
 */
adminRetailerRouter.get('/:retailerId/effective-price', async (req: Request, res: Response) => {
  try {
    const { retailerId } = req.params;
    const { productId, quantity } = req.query;

    if (!productId || typeof productId !== 'string' || !productId.trim()) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PRODUCT_ID',
        message: 'Query parameter "productId" is required.',
      });
    }

    const parsedQty = parseInt(String(quantity || '1'), 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_QUANTITY',
        message: 'Query parameter "quantity" must be a positive integer greater than zero.',
      });
    }

    // Verify retailer exists
    const retDocSnap = await getDoc(doc(db, 'retailers', retailerId));
    if (!retDocSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'RETAILER_NOT_FOUND',
        message: `Retailer with ID '${retailerId}' was not found.`,
      });
    }

    // Fetch product
    const prodDocSnap = await getDoc(doc(db, 'products', productId.trim()));
    if (!prodDocSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'PRODUCT_NOT_FOUND',
        message: `Product with ID '${productId}' was not found.`,
      });
    }
    const productData = { ...prodDocSnap.data(), productId: prodDocSnap.id } as Product;

    // Fetch pricing rules for this retailer + global rules
    const pricingSnap = await getDocs(collection(db, 'productPricing'));
    const applicableRules = pricingSnap.docs
      .map(d => {
        const data = d.data();
        const rawSlabs = data.slabs || data.priceSlabs || [];
        const normalizedSlabs = rawSlabs.map((s: any) => ({
          minQuantity: s.minQuantity,
          maxQuantity: s.maxQuantity ?? null,
          unitPrice: typeof s.unitPrice === 'number' ? s.unitPrice : (typeof s.pricePerUnit === 'number' ? s.pricePerUnit : (typeof s.price === 'number' ? s.price : 0)),
        }));
        return {
          ...data,
          id: d.id,
          pricingId: d.id,
          ruleId: d.id,
          productId: data.productId,
          pricingType: data.pricingType,
          retailerId: data.retailerId || null,
          active: data.active !== false && data.status !== 'INACTIVE',
          slabs: normalizedSlabs,
          priceSlabs: normalizedSlabs,
          fixedPrice: typeof data.fixedPrice === 'number' ? data.fixedPrice : (typeof data.customPrice === 'number' ? data.customPrice : undefined),
        } as ProductPricingRule;
      })
      .filter((r: any) => r.active && (!r.retailerId || r.retailerId === '' || r.retailerId === retailerId));

    // Authoritative resolution via existing PricingEngine
    const resolved = PricingEngine.resolveProductPrice({
      product: productData,
      quantity: parsedQty,
      retailerId,
      customerPricingRules: applicableRules as any,
    });

    const subtotal = Math.round(resolved.unitPrice * parsedQty * 100) / 100;
    const totalSavings = Math.round(Math.max(0, (productData.mrp - resolved.unitPrice) * parsedQty) * 100) / 100;

    return res.status(200).json({
      success: true,
      retailerId,
      productId: productData.productId,
      productName: productData.productName,
      sku: productData.sku,
      quantity: parsedQty,
      defaultPrice: productData.wholesalePrice,
      mrp: productData.mrp,
      effectivePrice: resolved.unitPrice,
      pricingSource: resolved.pricingSource,
      pricingId: resolved.pricingId || null,
      slabMinQuantity: resolved.slabMinQuantity ?? null,
      slabMaxQuantity: resolved.slabMaxQuantity ?? null,
      subtotal,
      totalSavings,
      rule: resolved.rule || null,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'EFFECTIVE_PRICE_PREVIEW_FAILED',
      message: err.message || 'Failed to calculate effective price preview.',
    });
  }
});

/**
 * GET /api/admin/retailers/:retailerId/audit-logs
 * Retrieve audit log history specific to this retailer from existing adminAuditLogs.
 */
adminRetailerRouter.get('/:retailerId/audit-logs', async (req: Request, res: Response) => {
  try {
    const { retailerId } = req.params;

    // Verify retailer exists
    const retDocSnap = await getDoc(doc(db, 'retailers', retailerId));
    if (!retDocSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'RETAILER_NOT_FOUND',
        message: `Retailer with ID '${retailerId}' was not found.`,
      });
    }

    const auditSnap = await getDocs(collection(db, 'adminAuditLogs'));
    const matchingLogs: any[] = [];

    for (const d of auditSnap.docs) {
      const log = d.data();
      if (
        log.targetId === retailerId ||
        log.metadata?.retailerId === retailerId ||
        log.metadata?.targetId === retailerId
      ) {
        matchingLogs.push({ ...log, logId: d.id });
      }
    }

    matchingLogs.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime() || 0;
      const timeB = new Date(b.timestamp).getTime() || 0;
      return timeB - timeA;
    });

    return res.status(200).json({
      success: true,
      retailerId,
      auditLogs: matchingLogs,
      total: matchingLogs.length,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'RETAILER_AUDIT_FETCH_FAILED',
      message: err.message || 'Failed to fetch retailer audit logs.',
    });
  }
});

/**
 * POST /api/admin/retailers/:retailerId/activate
 * Reactivate a deactivated or suspended retailer account.
 * Idempotent: If already active, returns current state with alreadyActive=true.
 * Logs RETAILER_ACTIVATED immutable audit log.
 */
adminRetailerRouter.post('/:retailerId/activate', async (req: Request, res: Response) => {
  try {
    const { retailerId } = req.params;
    const adminUser = (req as any).adminUser as AdminUser;

    const retDocSnap = await getDoc(doc(db, 'retailers', retailerId));
    if (!retDocSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'RETAILER_NOT_FOUND',
        message: `Retailer with ID '${retailerId}' was not found.`,
      });
    }

    const currentData = retDocSnap.data();
    const isAlreadyActive = (currentData.status === 'ACTIVE' || !currentData.status) && currentData.isActive !== false;

    if (isAlreadyActive) {
      return res.status(200).json({
        success: true,
        message: 'Retailer is already active.',
        alreadyActive: true,
        retailer: sanitizeRetailer(currentData, retDocSnap.id),
      });
    }

    const now = new Date().toISOString();
    await updateDoc(doc(db, 'retailers', retailerId), {
      status: 'ACTIVE',
      isActive: true,
      activatedAt: now,
      updatedAt: now,
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    });

    // Record immutable audit log
    await logAdminAudit({
      action: 'RETAILER_ACTIVATED',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'RETAILER',
      targetId: retailerId,
      metadata: {
        previousStatus: currentData.status || (currentData.isActive === false ? 'INACTIVE' : 'ACTIVE'),
        reason: req.body?.reason || 'Super Admin activation',
      },
      req,
    });

    const updatedSnap = await getDoc(doc(db, 'retailers', retailerId));

    return res.status(200).json({
      success: true,
      message: 'Retailer account activated successfully.',
      alreadyActive: false,
      retailer: sanitizeRetailer(updatedSnap.data(), updatedSnap.id),
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'RETAILER_ACTIVATION_FAILED',
      message: err.message || 'Failed to activate retailer.',
    });
  }
});

/**
 * POST /api/admin/retailers/:retailerId/deactivate
 * Deactivate a retailer account.
 * When deactivated:
 * - New retailer order creation is rejected server-side.
 * - Existing historical orders, snapshots, and prices remain unchanged.
 * - Idempotent: If already inactive, returns current state with alreadyInactive=true.
 * Logs RETAILER_DEACTIVATED immutable audit log.
 */
adminRetailerRouter.post('/:retailerId/deactivate', async (req: Request, res: Response) => {
  try {
    const { retailerId } = req.params;
    const adminUser = (req as any).adminUser as AdminUser;

    const retDocSnap = await getDoc(doc(db, 'retailers', retailerId));
    if (!retDocSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'RETAILER_NOT_FOUND',
        message: `Retailer with ID '${retailerId}' was not found.`,
      });
    }

    const currentData = retDocSnap.data();
    const isAlreadyInactive =
      (currentData.status === 'INACTIVE' || currentData.status === 'DEACTIVATED') &&
      currentData.isActive === false;

    if (isAlreadyInactive) {
      return res.status(200).json({
        success: true,
        message: 'Retailer is already deactivated.',
        alreadyInactive: true,
        retailer: sanitizeRetailer(currentData, retDocSnap.id),
      });
    }

    const now = new Date().toISOString();
    await updateDoc(doc(db, 'retailers', retailerId), {
      status: 'INACTIVE',
      isActive: false,
      deactivatedAt: now,
      updatedAt: now,
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    });

    // Record immutable audit log
    await logAdminAudit({
      action: 'RETAILER_DEACTIVATED',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'RETAILER',
      targetId: retailerId,
      metadata: {
        previousStatus: currentData.status || (currentData.isActive ? 'ACTIVE' : 'INACTIVE'),
        reason: req.body?.reason || 'Super Admin deactivation',
      },
      req,
    });

    const updatedSnap = await getDoc(doc(db, 'retailers', retailerId));

    return res.status(200).json({
      success: true,
      message: 'Retailer account deactivated successfully.',
      alreadyInactive: false,
      retailer: sanitizeRetailer(updatedSnap.data(), updatedSnap.id),
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'RETAILER_DEACTIVATION_FAILED',
      message: err.message || 'Failed to deactivate retailer.',
    });
  }
});
