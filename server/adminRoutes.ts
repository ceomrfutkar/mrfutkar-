import { Router, Request, Response } from 'express';
import { doc, updateDoc, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from './firebaseAdmin';
import { requireSuperAdmin, logAdminAudit } from './adminAuth';
import { AdminUser, AdminSession, AdminProfile } from '../src/types/admin';
import { adminProductRouter } from './adminProductRoutes';
import { adminPricingRouter } from './adminPricingRoutes';
import { adminRetailerRouter } from './adminRetailerRoutes';
import { adminInventoryRouter } from './adminInventoryRoutes';
import { adminOrderRouter } from './adminOrderRoutes';
import { adminWarehouseRouter } from './adminWarehouseRoutes';
import { adminDeliveryPartnerRouter } from './adminDeliveryPartnerRoutes';
import { adminNotificationRouter } from './adminNotificationRoutes';
import { adminReportRouter } from './adminReportRoutes';
import { adminSettingsRouter } from './adminSettingsRoutes';
import { adminUserRouter } from './adminUserRoutes';
import { adminAuditRouter } from './adminAuditRoutes';
import { adminAccountingRouter } from './adminAccountingRoutes';
import { adminInvoiceRouter } from './adminInvoiceRoutes';
import { adminCodRouter } from './adminCodRoutes';

export const adminRouter = Router();

// Enforce Super Admin authorization on all /api/admin/* routes
adminRouter.use(requireSuperAdmin());

// COD Handover & Custody Transfer API Endpoints (Phase 6 Part 4B)
adminRouter.use('/cod', adminCodRouter);

// Sales & Purchase Invoices API Endpoints (Phase 5.5 Part 1)
adminRouter.use('/invoices', adminInvoiceRouter);

// Accounting Core & Chart of Accounts API Endpoints (Phase 5.4 Part 1)
adminRouter.use('/accounting', adminAccountingRouter);

// Admin Audit & Security Center API Endpoints (Phase 3B-13)
adminRouter.use('/audit', adminAuditRouter);
adminRouter.use('/audit-logs', adminAuditRouter);

// Admin User & Access Management API Endpoints (Phase 3B-12)
adminRouter.use('/users', adminUserRouter);

// Business Configuration & Settings API Endpoints (Phase 3B-11)
adminRouter.use('/settings', adminSettingsRouter);

// Reports & Business Analytics API Endpoints (Phase 3B-10)
adminRouter.use('/reports', adminReportRouter);

// Notification Management API Endpoints (Phase 3B-9)
adminRouter.use('/notifications', adminNotificationRouter);

// Notification tokens and preferences top-level aliases
adminRouter.use('/notification-tokens', (req, res, next) => {
  req.url = '/tokens' + (req.url === '/' ? '' : req.url);
  adminNotificationRouter(req, res, next);
});
adminRouter.use('/notification-preferences', (req, res, next) => {
  req.url = '/preferences' + (req.url === '/' ? '' : req.url);
  adminNotificationRouter(req, res, next);
});

// Delivery Partner Management API Endpoints (Phase 3B-8)
adminRouter.use('/delivery-partners', adminDeliveryPartnerRouter);

// Order Management API Endpoints (Admin Order Console)
adminRouter.use('/orders', adminOrderRouter);

// Warehouse Management API Endpoints (Phase 3B-7)
adminRouter.use('/warehouse', adminWarehouseRouter);

// Product Management API Endpoints (Phase 3B-2A)
adminRouter.use('/products', adminProductRouter);

// Pricing Management API Endpoints (Phase 3B-3)
adminRouter.use('/pricing', adminPricingRouter);

// Retailer Management API Endpoints (Phase 3B-4A)
adminRouter.use('/retailers', adminRetailerRouter);

// Inventory Management API Endpoints (Phase 3B-5)
adminRouter.use('/inventory', adminInventoryRouter);

/**
 * GET /api/admin/session
 * Returns safe admin session payload. No credentials, tokens, or private secrets.
 */
adminRouter.get('/session', async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser as AdminUser;
    const now = new Date().toISOString();

    // Authoritative timestamp update (non-blocking)
    try {
      await updateDoc(doc(db, 'adminUsers', adminUser.uid), {
        lastLoginAt: now,
        updatedAt: now,
        _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
        _serverWriteNonce: Date.now().toString(),
      });
    } catch {
      // Non-blocking update
    }

    // Log successful session validation
    await logAdminAudit({
      action: 'ADMIN_LOGIN_SUCCESS',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'SESSION',
      targetId: adminUser.uid,
      metadata: { role: adminUser.role, status: adminUser.status },
      req,
    });

    const session: AdminSession = {
      uid: adminUser.uid,
      name: adminUser.name,
      mobile: adminUser.mobile,
      email: adminUser.email || '',
      role: 'SUPER_ADMIN',
      status: adminUser.status,
      permissionsVersion: adminUser.permissionsVersion || 1,
      lastLoginAt: now,
    };

    return res.status(200).json({
      success: true,
      session,
    });
  } catch (err: any) {
    console.error('Error fetching admin session:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve admin session.',
    });
  }
});

/**
 * GET /api/admin/profile
 * Returns safe admin profile payload. Server-authoritative, read-only.
 */
adminRouter.get('/profile', async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser as AdminUser;

    const profile: AdminProfile = {
      uid: adminUser.uid,
      name: adminUser.name,
      mobile: adminUser.mobile,
      email: adminUser.email || '',
      role: 'SUPER_ADMIN',
      status: adminUser.status,
      createdAt: adminUser.createdAt,
      updatedAt: adminUser.updatedAt,
      lastLoginAt: adminUser.lastLoginAt,
      createdBy: adminUser.createdBy || 'SYSTEM',
      permissionsVersion: adminUser.permissionsVersion || 1,
    };

    return res.status(200).json({
      success: true,
      profile,
    });
  } catch (err: any) {
    console.error('Error fetching admin profile:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve admin profile.',
    });
  }
});

/**
 * POST /api/admin/logout
 * Terminates admin session and records immutable ADMIN_LOGOUT audit log
 */
adminRouter.post('/logout', async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser as AdminUser;

    await logAdminAudit({
      action: 'ADMIN_LOGOUT',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'SESSION',
      targetId: adminUser.uid,
      metadata: { reason: 'USER_INITIATED_LOGOUT' },
      req,
    });

    return res.status(200).json({
      success: true,
      message: 'Admin session terminated successfully.',
    });
  } catch (err: any) {
    console.error('Error logging out admin:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to process admin logout.',
    });
  }
});

/**
 * GET /api/admin/dashboard
 * Authoritative, server-computed dashboard metrics and recent orders
 * Super Admin access strictly required.
 */
adminRouter.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser as AdminUser;

    // 1. Immutable Audit Logging
    await logAdminAudit({
      action: 'ADMIN_DASHBOARD_VIEW',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'DASHBOARD',
      targetId: 'OVERVIEW',
      metadata: { accessTimestamp: new Date().toISOString() },
      req,
    });

    // 2. Query Orders authoritatively (bounded query)
    let ordersSnap;
    try {
      const ordersQuery = query(
        collection(db, 'orders'),
        orderBy('createdAt', 'desc'),
        limit(500)
      );
      ordersSnap = await getDocs(ordersQuery);
    } catch {
      ordersSnap = await getDocs(collection(db, 'orders'));
    }

    const todayStr = new Date().toISOString().split('T')[0];
    let salesToday = 0;
    let ordersToday = 0;
    let pendingOrders = 0;
    let deliveredOrdersToday = 0;
    let deliveredOrders = 0;
    let codPending = 0;

    const topProductsMap: Record<string, {
      productId: string;
      productName: string;
      sku: string;
      brandName: string;
      unitsSold: number;
      salesValue: number;
    }> = {};

    const rawOrders: any[] = [];

    ordersSnap.docs.forEach(docSnap => {
      const o = docSnap.data();
      rawOrders.push({ id: docSnap.id, ...o });

      const status = (o.orderStatus || o.status || 'PLACED').toUpperCase();
      const grandTotal = Number(o.grandTotal ?? o.total) || 0;
      const createdDate = (o.createdAt || '').split('T')[0];

      // Today's metrics (valid business orders placed today)
      if (createdDate === todayStr) {
        if (status !== 'CANCELLED') {
          salesToday += grandTotal;
          ordersToday++;
        }
        if (status === 'DELIVERED') {
          deliveredOrdersToday++;
        }
      }

      // Overall status aggregation
      if (status === 'DELIVERED') {
        deliveredOrders++;
      } else if (status !== 'CANCELLED') {
        pendingOrders++;
      }

      // COD Pending calculation (paymentMethod COD, not delivered, not cancelled, payment not completed)
      const payMethod = (o.paymentMethod || '').toUpperCase();
      const payStatus = (o.paymentStatus || '').toUpperCase();
      if (payMethod === 'COD' && status !== 'DELIVERED' && status !== 'CANCELLED' && payStatus !== 'PAID') {
        codPending += grandTotal;
      }

      // Top selling products aggregation for today's non-cancelled orders
      if (createdDate === todayStr && status !== 'CANCELLED' && Array.isArray(o.items)) {
        o.items.forEach((it: any) => {
          const pId = it.productId || it.id || it.sku;
          if (!pId) return;
          const qty = Number(it.quantity ?? it.qty) || 0;
          const subtotal = Number(it.serverValidatedSubtotal ?? it.subtotal ?? (Number(it.unitPrice ?? it.price ?? 0) * qty)) || 0;

          if (!topProductsMap[pId]) {
            topProductsMap[pId] = {
              productId: pId,
              productName: it.productName || it.name || 'Product',
              sku: it.sku || pId,
              brandName: it.brandName || it.brand || '',
              unitsSold: 0,
              salesValue: 0,
            };
          }
          topProductsMap[pId].unitsSold += qty;
          topProductsMap[pId].salesValue += subtotal;
        });
      }
    });

    // If no sales today, aggregate recent orders for top selling preview
    if (Object.keys(topProductsMap).length === 0) {
      rawOrders.filter(o => (o.orderStatus || o.status) !== 'CANCELLED').slice(0, 50).forEach(o => {
        if (Array.isArray(o.items)) {
          o.items.forEach((it: any) => {
            const pId = it.productId || it.id || it.sku;
            if (!pId) return;
            const qty = Number(it.quantity ?? it.qty) || 0;
            const subtotal = Number(it.serverValidatedSubtotal ?? it.subtotal ?? (Number(it.unitPrice ?? it.price ?? 0) * qty)) || 0;

            if (!topProductsMap[pId]) {
              topProductsMap[pId] = {
                productId: pId,
                productName: it.productName || it.name || 'Product',
                sku: it.sku || pId,
                brandName: it.brandName || it.brand || '',
                unitsSold: 0,
                salesValue: 0,
              };
            }
            topProductsMap[pId].unitsSold += qty;
            topProductsMap[pId].salesValue += subtotal;
          });
        }
      });
    }

    const topSellingProducts = Object.values(topProductsMap)
      .sort((a, b) => b.unitsSold - a.unitsSold || b.salesValue - a.salesValue)
      .slice(0, 10);

    // Format recent orders (strictly limited to latest 10)
    const recentOrders = rawOrders
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 10)
      .map(o => {
        const items = Array.isArray(o.items) ? o.items : [];
        const summary = items.slice(0, 2).map((it: any) => `${it.productName || it.name || 'Item'} (x${it.quantity ?? it.qty ?? 1})`).join(', ');
        return {
          orderId: o.orderId || o.id,
          orderNumber: o.orderNumber || o.orderId || o.id,
          retailerId: o.retailerId || '',
          retailerName: o.retailerName || o.shopName || 'Retailer',
          shopName: o.shopName || o.retailerName || 'Retailer Store',
          itemCount: items.length,
          itemsSummary: summary + (items.length > 2 ? ` +${items.length - 2} more` : ''),
          grandTotal: Number(o.grandTotal ?? o.total) || 0,
          paymentMethod: o.paymentMethod || 'COD',
          paymentStatus: o.paymentStatus || 'PENDING',
          orderStatus: o.orderStatus || o.status || 'PLACED',
          createdAt: o.createdAt || '',
        };
      });

    // 3. Active Retailers
    let activeRetailers = 0;
    try {
      const retSnap = await getDocs(collection(db, 'retailers'));
      activeRetailers = retSnap.docs.filter(d => {
        const r = d.data();
        return r.isActive !== false && r.status !== 'INACTIVE' && r.status !== 'SUSPENDED';
      }).length;
    } catch {
      // Non-blocking fallback
    }

    // 4. Active Delivery Partners
    let activeDeliveryPartners = 0;
    try {
      const dpSnap = await getDocs(collection(db, 'deliveryPartners'));
      activeDeliveryPartners = dpSnap.docs.filter(d => {
        const dp = d.data();
        return dp.accountStatus === 'ACTIVE' || (dp.active !== false && dp.accountStatus !== 'INACTIVE' && dp.accountStatus !== 'SUSPENDED');
      }).length;
    } catch {
      // Non-blocking fallback
    }

    // 5. Low Stock Products
    let lowStockProducts = 0;
    try {
      const prodSnap = await getDocs(collection(db, 'products'));
      lowStockProducts = prodSnap.docs.filter(d => {
        const p = d.data();
        if (p.isActive === false) return false;
        const stock = Number(p.stockQuantity) || 0;
        const threshold = Number(p.lowStockThreshold) || 20;
        return stock <= threshold;
      }).length;
    } catch {
      // Non-blocking fallback
    }

    return res.status(200).json({
      success: true,
      data: {
        salesToday: Math.round(salesToday * 100) / 100,
        ordersToday,
        pendingOrders,
        deliveredOrdersToday,
        deliveredOrders,
        activeRetailers,
        activeDeliveryPartners,
        lowStockProducts,
        codPending: Math.round(codPending * 100) / 100,
        recentOrders,
        topSellingProducts,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('Error fetching admin dashboard data:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Unable to load dashboard data.',
    });
  }
});

