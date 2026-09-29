import { Router, Request, Response } from 'express';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebaseAdmin';
import { logAdminAudit } from './adminAuth';
import { AdminUser } from '../src/types/admin';
import {
  resolveDateRange,
  isDateInRange,
  getIstDateString,
  roundCurrency,
  generateCsv,
  IST_TIMEZONE,
  ResolvedDateRange,
} from './reportUtils';
import { SEED_DELIVERY_PARTNERS } from './deliveryRoutes';
import {
  ReportSummaryKpis,
  ReportSalesTrendPoint,
  ReportOrderStatusDistributionItem,
  ReportProductRow,
  ReportRetailerRow,
  ReportDeliveryPartnerRow,
  ReportWarehouseMetrics,
  ReportCodMetrics,
  ReportCancellationMetrics,
  ReportFailedDeliveryMetrics,
  ReportReturnMetrics,
} from '../src/types/report';

export const adminReportRouter = Router();

// Canonical order status definitions and display labels
const CANONICAL_STATUS_LABELS: Record<string, string> = {
  PLACED: 'Placed',
  CONFIRMED: 'Confirmed',
  ACCEPTED: 'Accepted',
  PICKING: 'Picking',
  PACKED: 'Packed',
  READY_FOR_DISPATCH: 'Ready for Dispatch',
  ASSIGNED: 'Assigned to Delivery',
  ACCEPTED_BY_DELIVERY_PARTNER: 'Accepted by Partner',
  PICKED_UP: 'Picked Up',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  FAILED_DELIVERY: 'Failed Delivery',
  RETURN_TO_WAREHOUSE: 'Returned to Warehouse',
  RETURN_REQUESTED: 'Return Requested',
  RETURNED: 'Returned',
};

/**
 * Helper to fetch authoritative collections needed for analytics
 */
async function fetchOrders(): Promise<any[]> {
  const snap = await getDocs(collection(db, 'orders'));
  return snap.docs.map(d => ({ orderId: d.id, ...d.data() }));
}

async function fetchProducts(): Promise<any[]> {
  const snap = await getDocs(collection(db, 'products'));
  return snap.docs.map(d => ({ productId: d.id, ...d.data() }));
}

async function fetchRetailers(): Promise<any[]> {
  const snap = await getDocs(collection(db, 'retailers'));
  return snap.docs.map(d => ({ retailerId: d.id, ...d.data() }));
}

async function fetchDeliveryPartners(): Promise<any[]> {
  const snap = await getDocs(collection(db, 'deliveryPartners'));
  const partners: any[] = snap.docs.map(d => ({ partnerId: d.id, ...d.data() }));
  if (partners.length === 0) {
    return Object.values(SEED_DELIVERY_PARTNERS);
  }
  return partners;
}

async function fetchInventoryMovements() {
  try {
    const snap = await getDocs(collection(db, 'inventoryMovements'));
    return snap.docs.map(d => ({ movementId: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

async function fetchReturns() {
  try {
    const snap = await getDocs(collection(db, 'returns'));
    return snap.docs.map(d => ({ returnId: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

/**
 * Filter orders within the resolved date range based on createdAt
 */
function filterOrdersByDate(orders: any[], range: ResolvedDateRange) {
  return orders.filter(o => {
    const dateVal = o.createdAt || o.created_at;
    return isDateInRange(dateVal, range.startUtcMs, range.endUtcMs);
  });
}

/**
 * Parse and validate standard pagination parameters
 */
function parsePaginationParams(req: Request) {
  const rawPage = req.query.page !== undefined ? Number(req.query.page) : 1;
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : Math.floor(rawPage);

  const rawPageSize = req.query.pageSize !== undefined ? Number(req.query.pageSize) : 25;
  if (isNaN(rawPageSize) || rawPageSize < 1) {
    return { error: 'INVALID_PAGE_SIZE', message: 'Page size must be a positive integer between 1 and 100.' };
  }
  if (rawPageSize > 100) {
    return { error: 'PAGE_SIZE_EXCEEDED', message: 'Page size cannot exceed maximum limit of 100 items.' };
  }
  const pageSize = Math.min(Math.floor(rawPageSize), 100);

  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy.trim() : '';
  const sortOrder = typeof req.query.sortOrder === 'string' && req.query.sortOrder.toLowerCase() === 'asc' ? 'asc' : 'desc';

  return { page, pageSize, search, sortBy, sortOrder };
}

// =========================================================================
// 1. GET /api/admin/reports/summary — Executive KPIs
// =========================================================================
adminReportRouter.get('/summary', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser as AdminUser;
  const range = resolveDateRange(req.query.preset, req.query.dateFrom, req.query.dateTo);
  if (!range.success) {
    return res.status(400).json({ success: false, error: range.error, message: range.message });
  }

  try {
    const [allOrders, allRetailers, allPartners] = await Promise.all([
      fetchOrders(),
      fetchRetailers(),
      fetchDeliveryPartners(),
    ]);

    const ordersInRange = filterOrdersByDate(allOrders, range);

    let grossSales = 0;
    let deliveredSales = 0;
    let cancelledValue = 0;
    let failedDeliveryValue = 0;
    let returnToWarehouseValue = 0;

    let deliveredOrders = 0;
    let cancelledOrders = 0;
    let failedDeliveries = 0;
    let returnToWarehouseOrders = 0;

    let pendingCod = 0;
    let collectedCod = 0;

    ordersInRange.forEach((o: any) => {
      const grandTotal = Number(o.grandTotal ?? o.total ?? 0);
      const status = String(o.orderStatus || o.status || 'PLACED').toUpperCase();
      const deliveryStatus = String(o.delivery?.assignmentStatus || '').toUpperCase();
      const paymentMethod = String(o.paymentMethod || 'COD').toUpperCase();
      const paymentStatus = String(o.paymentStatus || 'PENDING').toUpperCase();

      const isCancelled = status === 'CANCELLED';
      const isDelivered = status === 'DELIVERED';
      const isFailed = status === 'FAILED_DELIVERY' || deliveryStatus === 'FAILED_DELIVERY';
      const isReturn =
        ['RETURN_REQUESTED', 'RETURNED', 'RETURN_TO_WAREHOUSE'].includes(status) ||
        deliveryStatus === 'RETURN_TO_WAREHOUSE';

      if (!isCancelled) {
        grossSales += grandTotal;
      }
      if (isDelivered) {
        deliveredSales += grandTotal;
        deliveredOrders++;
      }
      if (isCancelled) {
        cancelledValue += grandTotal;
        cancelledOrders++;
      }
      if (isFailed) {
        failedDeliveryValue += grandTotal;
        failedDeliveries++;
      }
      if (isReturn) {
        returnToWarehouseValue += grandTotal;
        returnToWarehouseOrders++;
      }

      if (paymentMethod === 'COD') {
        if (paymentStatus === 'PAID') {
          collectedCod += grandTotal;
        } else if (!isCancelled && !isFailed && !isReturn) {
          pendingCod += grandTotal;
        }
      }
    });

    const totalOrders = ordersInRange.length;
    const nonCancelledOrders = totalOrders - cancelledOrders;
    const averageOrderValue = nonCancelledOrders > 0
      ? roundCurrency(grossSales / nonCancelledOrders)
      : totalOrders > 0 ? roundCurrency(grossSales / totalOrders) : 0;

    const activeRetailers = allRetailers.filter(r => r.isActive === true || r.status === 'ACTIVE').length;
    const activeDeliveryPartners = allPartners.filter(p => p.status === 'ACTIVE').length;

    const kpis: ReportSummaryKpis = {
      grossSales: roundCurrency(grossSales),
      deliveredSales: roundCurrency(deliveredSales),
      cancelledValue: roundCurrency(cancelledValue),
      failedDeliveryValue: roundCurrency(failedDeliveryValue),
      returnToWarehouseValue: roundCurrency(returnToWarehouseValue),
      totalOrders,
      averageOrderValue,
      deliveredOrders,
      cancelledOrders,
      failedDeliveries,
      returnToWarehouseOrders,
      pendingCod: roundCurrency(pendingCod),
      collectedCod: roundCurrency(collectedCod),
      activeRetailers,
      activeDeliveryPartners,
    };

    // Log audit trail
    await logAdminAudit({
      action: 'ADMIN_REPORT_VIEW',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'REPORT_SUMMARY',
      targetId: range.preset,
      metadata: { dateFrom: range.dateFrom, dateTo: range.dateTo, totalOrders },
      req,
    });

    return res.status(200).json({
      success: true,
      metadata: {
        currency: 'INR',
        timezone: IST_TIMEZONE,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        generatedAt: new Date().toISOString(),
        preset: range.preset,
      },
      kpis,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

// =========================================================================
// 2. GET /api/admin/reports/sales — Sales & Revenue Trends
// =========================================================================
adminReportRouter.get('/sales', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser as AdminUser;
  const range = resolveDateRange(req.query.preset, req.query.dateFrom, req.query.dateTo);
  if (!range.success) {
    return res.status(400).json({ success: false, error: range.error, message: range.message });
  }

  const groupBy = (String(req.query.groupBy || 'daily').toLowerCase()) as 'daily' | 'weekly' | 'monthly';

  try {
    const allOrders = await fetchOrders();
    const ordersInRange = filterOrdersByDate(allOrders, range);

    // Group buckets
    const bucketsMap = new Map<string, {
      period: string;
      date: string;
      label: string;
      grossSales: number;
      deliveredSales: number;
      ordersCount: number;
      deliveredCount: number;
      cancelledCount: number;
    }>();

    let totalGrossSales = 0;
    let totalDeliveredSales = 0;
    let totalOrdersCount = 0;

    ordersInRange.forEach((o: any) => {
      const grandTotal = Number(o.grandTotal ?? o.total ?? 0);
      const status = String(o.orderStatus || o.status || 'PLACED').toUpperCase();
      const dateVal = o.createdAt || o.created_at;
      const istDate = getIstDateString(dateVal);

      let key = istDate;
      let label = istDate;

      if (groupBy === 'monthly') {
        key = istDate.substring(0, 7); // YYYY-MM
        label = key;
      } else if (groupBy === 'weekly') {
        // Find start of week (Monday)
        const d = new Date(istDate);
        const day = d.getUTCDay();
        const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
        const mon = new Date(d.setUTCDate(diff));
        const monStr = mon.toISOString().substring(0, 10);
        key = `Week of ${monStr}`;
        label = key;
      }

      if (!bucketsMap.has(key)) {
        bucketsMap.set(key, {
          period: key,
          date: istDate,
          label,
          grossSales: 0,
          deliveredSales: 0,
          ordersCount: 0,
          deliveredCount: 0,
          cancelledCount: 0,
        });
      }

      const b = bucketsMap.get(key)!;
      b.ordersCount++;
      totalOrdersCount++;

      if (status !== 'CANCELLED') {
        b.grossSales += grandTotal;
        totalGrossSales += grandTotal;
      }
      if (status === 'DELIVERED') {
        b.deliveredSales += grandTotal;
        totalDeliveredSales += grandTotal;
        b.deliveredCount++;
      } else if (status === 'CANCELLED') {
        b.cancelledCount++;
      }
    });

    const trends: ReportSalesTrendPoint[] = Array.from(bucketsMap.values())
      .map(b => ({
        ...b,
        grossSales: roundCurrency(b.grossSales),
        deliveredSales: roundCurrency(b.deliveredSales),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Peak day
    let peakSalesDay = trends.length > 0
      ? trends.reduce((prev, cur) => (cur.grossSales > prev.grossSales ? cur : prev), trends[0]).date
      : 'N/A';

    const dayCount = Math.max(1, trends.length);
    const averageDailySales = roundCurrency(totalGrossSales / dayCount);

    await logAdminAudit({
      action: 'ADMIN_REPORT_VIEW',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'REPORT_SALES',
      targetId: range.preset,
      metadata: { dateFrom: range.dateFrom, dateTo: range.dateTo, totalGrossSales },
      req,
    });

    return res.status(200).json({
      success: true,
      metadata: {
        currency: 'INR',
        timezone: IST_TIMEZONE,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        generatedAt: new Date().toISOString(),
        preset: range.preset,
        groupBy,
      },
      kpis: {
        totalGrossSales: roundCurrency(totalGrossSales),
        totalDeliveredSales: roundCurrency(totalDeliveredSales),
        totalOrders: totalOrdersCount,
        averageDailySales,
        peakSalesDay,
      },
      trends,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

// =========================================================================
// 3. GET /api/admin/reports/orders — Canonical Status Distribution
// =========================================================================
adminReportRouter.get('/orders', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser as AdminUser;
  const range = resolveDateRange(req.query.preset, req.query.dateFrom, req.query.dateTo);
  if (!range.success) {
    return res.status(400).json({ success: false, error: range.error, message: range.message });
  }

  try {
    const allOrders = await fetchOrders();
    const ordersInRange = filterOrdersByDate(allOrders, range);

    const statusCounts: Record<string, { count: number; totalValue: number }> = {};
    Object.keys(CANONICAL_STATUS_LABELS).forEach(st => {
      statusCounts[st] = { count: 0, totalValue: 0 };
    });

    const totalOrders = ordersInRange.length;

    ordersInRange.forEach((o: any) => {
      let status = String(o.orderStatus || o.status || 'PLACED').toUpperCase();
      const deliveryStatus = String(o.delivery?.assignmentStatus || '').toUpperCase();
      if (status === 'OUT_FOR_DELIVERY' && deliveryStatus === 'FAILED_DELIVERY') {
        status = 'FAILED_DELIVERY';
      } else if (deliveryStatus === 'RETURN_TO_WAREHOUSE') {
        status = 'RETURN_TO_WAREHOUSE';
      }

      if (!statusCounts[status]) {
        statusCounts[status] = { count: 0, totalValue: 0 };
      }

      const grandTotal = Number(o.grandTotal ?? o.total ?? 0);
      statusCounts[status].count++;
      statusCounts[status].totalValue += grandTotal;
    });

    const distribution: ReportOrderStatusDistributionItem[] = Object.entries(statusCounts)
      .map(([st, data]) => ({
        status: st,
        label: CANONICAL_STATUS_LABELS[st] || st,
        count: data.count,
        percentage: totalOrders > 0 ? Math.round((data.count / totalOrders) * 1000) / 10 : 0,
        totalValue: roundCurrency(data.totalValue),
      }))
      .filter(item => item.count > 0 || ['PLACED', 'CONFIRMED', 'DELIVERED', 'CANCELLED'].includes(item.status));

    // Daily order volume trends
    const dailyVolumeMap = new Map<string, { date: string; total: number; delivered: number; cancelled: number }>();
    ordersInRange.forEach((o: any) => {
      const istDate = getIstDateString(o.createdAt || o.created_at);
      if (!dailyVolumeMap.has(istDate)) {
        dailyVolumeMap.set(istDate, { date: istDate, total: 0, delivered: 0, cancelled: 0 });
      }
      const entry = dailyVolumeMap.get(istDate)!;
      entry.total++;
      const st = String(o.orderStatus || o.status || '').toUpperCase();
      if (st === 'DELIVERED') entry.delivered++;
      else if (st === 'CANCELLED') entry.cancelled++;
    });

    const dailyTrends = Array.from(dailyVolumeMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    await logAdminAudit({
      action: 'ADMIN_REPORT_VIEW',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'REPORT_ORDERS',
      targetId: range.preset,
      metadata: { dateFrom: range.dateFrom, dateTo: range.dateTo, totalOrders },
      req,
    });

    return res.status(200).json({
      success: true,
      metadata: {
        currency: 'INR',
        timezone: IST_TIMEZONE,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        generatedAt: new Date().toISOString(),
        preset: range.preset,
      },
      totalOrders,
      distribution,
      dailyTrends,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

// =========================================================================
// 4. GET /api/admin/reports/products — SKU & Product Performance
// =========================================================================
adminReportRouter.get('/products', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser as AdminUser;
  const range = resolveDateRange(req.query.preset, req.query.dateFrom, req.query.dateTo);
  if (!range.success) {
    return res.status(400).json({ success: false, error: range.error, message: range.message });
  }

  const pagination = parsePaginationParams(req);
  if ('error' in pagination) {
    return res.status(400).json({ success: false, error: pagination.error, message: pagination.message });
  }

  try {
    const [allOrders, allProducts] = await Promise.all([
      fetchOrders(),
      fetchProducts(),
    ]);

    // Product index by productId and SKU
    const productCatalogMap = new Map<string, any>();
    allProducts.forEach((p: any) => {
      productCatalogMap.set(p.productId || p.id, p);
      if (p.sku) productCatalogMap.set(p.sku, p);
    });

    const ordersInRange = filterOrdersByDate(allOrders, range);

    // Aggregate items performance from frozen order snapshot
    const productMetricsMap = new Map<string, {
      productId: string;
      sku: string;
      productName: string;
      quantitySold: number;
      salesValue: number;
      orderCount: number;
      orderIds: Set<string>;
    }>();

    ordersInRange.forEach((o: any) => {
      const isCancelled = String(o.orderStatus || o.status || '').toUpperCase() === 'CANCELLED';
      if (isCancelled) return; // Exclude cancelled orders from sold volume

      const items = Array.isArray(o.items) ? o.items : [];
      items.forEach((it: any) => {
        const prodId = it.productId || it.id || it.sku || 'UNKNOWN_PRODUCT';
        const sku = it.sku || 'N/A';
        const productName = it.productName || it.name || 'Product';
        const qty = Number(it.quantity ?? it.qty ?? 0);
        const unitPrice = Number(it.unitPrice ?? it.price ?? 0);
        const lineTotal = Number(it.totalPrice ?? it.total ?? (qty * unitPrice));

        if (!productMetricsMap.has(prodId)) {
          productMetricsMap.set(prodId, {
            productId: prodId,
            sku,
            productName,
            quantitySold: 0,
            salesValue: 0,
            orderCount: 0,
            orderIds: new Set(),
          });
        }

        const m = productMetricsMap.get(prodId)!;
        m.quantitySold += qty;
        m.salesValue += lineTotal;
        m.orderIds.add(o.orderId || o.id);
        if (m.sku === 'N/A' && sku !== 'N/A') m.sku = sku;
        if (m.productName === 'Product' && productName !== 'Product') m.productName = productName;
      });
    });

    // Also merge all products from catalog so zero-sales items can be analyzed
    allProducts.forEach((p: any) => {
      const prodId = p.productId || p.id;
      if (!productMetricsMap.has(prodId)) {
        productMetricsMap.set(prodId, {
          productId: prodId,
          sku: p.sku || 'N/A',
          productName: p.productName || p.name || 'Product',
          quantitySold: 0,
          salesValue: 0,
          orderCount: 0,
          orderIds: new Set(),
        });
      }
    });

    const rows: ReportProductRow[] = Array.from(productMetricsMap.values()).map(m => {
      const catalogItem = productCatalogMap.get(m.productId) || productCatalogMap.get(m.sku) || {};
      const currentStock = Number(catalogItem.stockQuantity ?? catalogItem.stock ?? 0);
      const lowStockThreshold = Number(catalogItem.lowStockThreshold ?? 10);
      const isLowStock = currentStock <= lowStockThreshold;
      const averageSellingPrice = m.quantitySold > 0 ? roundCurrency(m.salesValue / m.quantitySold) : 0;

      return {
        productId: m.productId,
        sku: m.sku !== 'N/A' ? m.sku : (catalogItem.sku || 'N/A'),
        productName: catalogItem.productName || m.productName,
        quantitySold: m.quantitySold,
        unitsSold: m.quantitySold,
        salesValue: roundCurrency(m.salesValue),
        orderCount: m.orderIds.size,
        averageSellingPrice,
        currentStock,
        lowStockThreshold,
        isLowStock,
      };
    });

    // Top products
    const byQuantity = [...rows].sort((a, b) => b.quantitySold - a.quantitySold).slice(0, 5);
    const bySales = [...rows].sort((a, b) => b.salesValue - a.salesValue).slice(0, 5);
    const byFrequency = [...rows].sort((a, b) => b.orderCount - a.orderCount).slice(0, 5);

    // Filter & Search
    let filteredRows = rows;
    if (pagination.search) {
      filteredRows = filteredRows.filter(r =>
        r.productName.toLowerCase().includes(pagination.search) ||
        r.sku.toLowerCase().includes(pagination.search) ||
        r.productId.toLowerCase().includes(pagination.search)
      );
    }

    // Sort
    const sortBy = pagination.sortBy || 'salesValue';
    filteredRows.sort((a: any, b: any) => {
      const valA = a[sortBy] ?? 0;
      const valB = b[sortBy] ?? 0;
      if (typeof valA === 'string') {
        return pagination.sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return pagination.sortOrder === 'asc' ? valA - valB : valB - valA;
    });

    // Paginate
    const totalCount = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pagination.pageSize));
    const startIndex = (pagination.page - 1) * pagination.pageSize;
    const paginatedProducts = filteredRows.slice(startIndex, startIndex + pagination.pageSize);

    await logAdminAudit({
      action: 'ADMIN_REPORT_VIEW',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'REPORT_PRODUCTS',
      targetId: range.preset,
      metadata: { dateFrom: range.dateFrom, dateTo: range.dateTo, totalProducts: totalCount },
      req,
    });

    return res.status(200).json({
      success: true,
      metadata: {
        currency: 'INR',
        timezone: IST_TIMEZONE,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        generatedAt: new Date().toISOString(),
        preset: range.preset,
      },
      topProducts: {
        byQuantity,
        bySales,
        byFrequency,
      },
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalCount,
        totalPages,
      },
      products: paginatedProducts,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

// =========================================================================
// 5. GET /api/admin/reports/retailers — Retailer Performance & Procurement
// =========================================================================
adminReportRouter.get('/retailers', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser as AdminUser;
  const range = resolveDateRange(req.query.preset, req.query.dateFrom, req.query.dateTo);
  if (!range.success) {
    return res.status(400).json({ success: false, error: range.error, message: range.message });
  }

  const pagination = parsePaginationParams(req);
  if ('error' in pagination) {
    return res.status(400).json({ success: false, error: pagination.error, message: pagination.message });
  }

  try {
    const [allOrders, allRetailers] = await Promise.all([
      fetchOrders(),
      fetchRetailers(),
    ]);

    const retailerCatalogMap = new Map<string, any>();
    allRetailers.forEach((r: any) => {
      retailerCatalogMap.set(r.retailerId || r.id, r);
    });

    const ordersInRange = filterOrdersByDate(allOrders, range);

    const retailerMetricsMap = new Map<string, {
      retailerId: string;
      shopName: string;
      ownerName: string;
      mobile: string;
      orderCount: number;
      totalSalesValue: number;
      deliveredOrderCount: number;
      cancelledOrderCount: number;
      lastOrderDate?: string;
    }>();

    ordersInRange.forEach((o: any) => {
      const retId = o.retailerId || 'UNKNOWN_RETAILER';
      const grandTotal = Number(o.grandTotal ?? o.total ?? 0);
      const status = String(o.orderStatus || o.status || 'PLACED').toUpperCase();
      const createdAt = o.createdAt || o.created_at;

      if (!retailerMetricsMap.has(retId)) {
        retailerMetricsMap.set(retId, {
          retailerId: retId,
          shopName: o.shopName || o.deliveryAddress?.shopName || 'Kirana Store',
          ownerName: o.retailerName || 'Retailer Owner',
          mobile: o.deliveryAddressSnapshot?.phone || o.phone || '',
          orderCount: 0,
          totalSalesValue: 0,
          deliveredOrderCount: 0,
          cancelledOrderCount: 0,
          lastOrderDate: createdAt,
        });
      }

      const m = retailerMetricsMap.get(retId)!;
      m.orderCount++;
      if (status !== 'CANCELLED') {
        m.totalSalesValue += grandTotal;
      }
      if (status === 'DELIVERED') {
        m.deliveredOrderCount++;
      } else if (status === 'CANCELLED') {
        m.cancelledOrderCount++;
      }

      if (!m.lastOrderDate || (createdAt && new Date(createdAt).getTime() > new Date(m.lastOrderDate).getTime())) {
        m.lastOrderDate = createdAt;
      }
    });

    // Also merge registered retailers
    allRetailers.forEach((r: any) => {
      const retId = r.retailerId || r.id;
      if (!retailerMetricsMap.has(retId)) {
        retailerMetricsMap.set(retId, {
          retailerId: retId,
          shopName: r.shopName || 'Kirana Store',
          ownerName: r.ownerName || 'Retailer',
          mobile: r.mobileNumber || r.phone || '',
          orderCount: 0,
          totalSalesValue: 0,
          deliveredOrderCount: 0,
          cancelledOrderCount: 0,
        });
      }
    });

    const rows: ReportRetailerRow[] = Array.from(retailerMetricsMap.values()).map(m => {
      const rDoc = retailerCatalogMap.get(m.retailerId) || {};
      const nonCancelled = m.orderCount - m.cancelledOrderCount;
      const averageOrderValue = nonCancelled > 0 ? roundCurrency(m.totalSalesValue / nonCancelled) : 0;

      return {
        retailerId: m.retailerId,
        shopName: rDoc.shopName || m.shopName,
        ownerName: rDoc.ownerName || m.ownerName,
        mobile: rDoc.mobileNumber || rDoc.phone || m.mobile,
        orderCount: m.orderCount,
        totalSalesValue: roundCurrency(m.totalSalesValue),
        deliveredOrderCount: m.deliveredOrderCount,
        cancelledOrderCount: m.cancelledOrderCount,
        averageOrderValue,
        lastOrderDate: m.lastOrderDate,
        status: rDoc.status || (rDoc.isActive ? 'ACTIVE' : 'INACTIVE'),
      };
    });

    // Top retailers
    const bySales = [...rows].sort((a, b) => b.totalSalesValue - a.totalSalesValue).slice(0, 5);
    const byOrders = [...rows].sort((a, b) => b.orderCount - a.orderCount).slice(0, 5);

    // Filter & Search
    let filteredRows = rows;
    if (pagination.search) {
      filteredRows = filteredRows.filter(r =>
        r.shopName.toLowerCase().includes(pagination.search) ||
        r.ownerName.toLowerCase().includes(pagination.search) ||
        r.retailerId.toLowerCase().includes(pagination.search)
      );
    }

    // Sort
    const sortBy = pagination.sortBy || 'totalSalesValue';
    filteredRows.sort((a: any, b: any) => {
      const valA = a[sortBy] ?? 0;
      const valB = b[sortBy] ?? 0;
      if (typeof valA === 'string') {
        return pagination.sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return pagination.sortOrder === 'asc' ? valA - valB : valB - valA;
    });

    // Paginate
    const totalCount = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pagination.pageSize));
    const startIndex = (pagination.page - 1) * pagination.pageSize;
    const paginatedRetailers = filteredRows.slice(startIndex, startIndex + pagination.pageSize);

    await logAdminAudit({
      action: 'ADMIN_REPORT_VIEW',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'REPORT_RETAILERS',
      targetId: range.preset,
      metadata: { dateFrom: range.dateFrom, dateTo: range.dateTo, totalRetailers: totalCount },
      req,
    });

    return res.status(200).json({
      success: true,
      metadata: {
        currency: 'INR',
        timezone: IST_TIMEZONE,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        generatedAt: new Date().toISOString(),
        preset: range.preset,
      },
      topRetailers: {
        bySales,
        byOrders,
      },
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalCount,
        totalPages,
      },
      retailers: paginatedRetailers,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

// =========================================================================
// 6. GET /api/admin/reports/warehouse — Fulfillment Funnel & Stock
// =========================================================================
adminReportRouter.get('/warehouse', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser as AdminUser;
  const range = resolveDateRange(req.query.preset, req.query.dateFrom, req.query.dateTo);
  if (!range.success) {
    return res.status(400).json({ success: false, error: range.error, message: range.message });
  }

  try {
    const [allOrders, movements] = await Promise.all([
      fetchOrders(),
      fetchInventoryMovements(),
    ]);

    const ordersInRange = filterOrdersByDate(allOrders, range);

    let acceptedCount = 0;
    let pickedCount = 0;
    let packedCount = 0;
    let readyForDispatchCount = 0;
    let dispatchedCount = 0;
    let pendingOrdersCount = 0;

    ordersInRange.forEach((o: any) => {
      const status = String(o.orderStatus || o.status || '').toUpperCase();
      if (['ACCEPTED', 'PICKING', 'PACKED', 'READY_FOR_DISPATCH'].includes(status)) {
        pendingOrdersCount++;
      }

      if (['ACCEPTED', 'PICKING', 'PACKED', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(status)) {
        acceptedCount++;
      }
      if (['PICKING', 'PACKED', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(status)) {
        pickedCount++;
      }
      if (['PACKED', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(status)) {
        packedCount++;
      }
      if (['READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(status)) {
        readyForDispatchCount++;
      }
      if (['OUT_FOR_DELIVERY', 'DELIVERED'].includes(status)) {
        dispatchedCount++;
      }
    });

    // Movements within range
    const movementsInRange = movements.filter((m: any) => {
      const dateVal = m.timestamp || m.createdAt;
      return isDateInRange(dateVal, range.startUtcMs, range.endUtcMs);
    });

    const movementReasonsBreakdown: Record<string, number> = {};
    movementsInRange.forEach((m: any) => {
      const r = String(m.reason || 'ADJUSTMENT').toUpperCase();
      movementReasonsBreakdown[r] = (movementReasonsBreakdown[r] || 0) + 1;
    });

    const metrics: ReportWarehouseMetrics = {
      warehouseId: 'WH-BRAHMPURI-01',
      warehouseName: 'MR FUTKAR — BRAHMPURI',
      acceptedCount,
      pickedCount,
      packedCount,
      readyForDispatchCount,
      dispatchedCount,
      pendingOrdersCount,
      stockAdjustmentsCount: movementsInRange.length,
      movementReasonsBreakdown,
    };

    await logAdminAudit({
      action: 'ADMIN_REPORT_VIEW',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'REPORT_WAREHOUSE',
      targetId: range.preset,
      metadata: { dateFrom: range.dateFrom, dateTo: range.dateTo },
      req,
    });

    return res.status(200).json({
      success: true,
      metadata: {
        currency: 'INR',
        timezone: IST_TIMEZONE,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        generatedAt: new Date().toISOString(),
        preset: range.preset,
      },
      warehouseMetrics: metrics,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

// =========================================================================
// 7. GET /api/admin/reports/delivery — Delivery Partner Fleet Analytics
// =========================================================================
adminReportRouter.get('/delivery', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser as AdminUser;
  const range = resolveDateRange(req.query.preset, req.query.dateFrom, req.query.dateTo);
  if (!range.success) {
    return res.status(400).json({ success: false, error: range.error, message: range.message });
  }

  const pagination = parsePaginationParams(req);
  if ('error' in pagination) {
    return res.status(400).json({ success: false, error: pagination.error, message: pagination.message });
  }

  try {
    const [allOrders, allPartners] = await Promise.all([
      fetchOrders(),
      fetchDeliveryPartners(),
    ]);

    const partnerCatalogMap = new Map<string, any>();
    allPartners.forEach((p: any) => {
      partnerCatalogMap.set(p.partnerId || p.userId || p.id, p);
    });

    const ordersInRange = filterOrdersByDate(allOrders, range);

    const partnerMetricsMap = new Map<string, {
      partnerId: string;
      name: string;
      mobile: string;
      vehicleType?: string;
      assignedCount: number;
      acceptedCount: number;
      pickedUpCount: number;
      outForDeliveryCount: number;
      deliveredCount: number;
      failedCount: number;
      returnedCount: number;
      codPending: number;
      codCollected: number;
    }>();

    ordersInRange.forEach((o: any) => {
      const pid = o.deliveryPartnerId || o.delivery?.assignedPartnerId;
      if (!pid) return;

      const grandTotal = Number(o.grandTotal ?? o.total ?? 0);
      const st = String(o.orderStatus || o.status || '').toUpperCase();
      const dst = String(o.delivery?.assignmentStatus || '').toUpperCase();
      const paymentMethod = String(o.paymentMethod || 'COD').toUpperCase();
      const paymentStatus = String(o.paymentStatus || 'PENDING').toUpperCase();

      if (!partnerMetricsMap.has(pid)) {
        const pDoc = partnerCatalogMap.get(pid) || {};
        partnerMetricsMap.set(pid, {
          partnerId: pid,
          name: o.deliveryPartnerName || pDoc.name || 'Delivery Partner',
          mobile: pDoc.mobile || '',
          vehicleType: pDoc.vehicleType,
          assignedCount: 0,
          acceptedCount: 0,
          pickedUpCount: 0,
          outForDeliveryCount: 0,
          deliveredCount: 0,
          failedCount: 0,
          returnedCount: 0,
          codPending: 0,
          codCollected: 0,
        });
      }

      const m = partnerMetricsMap.get(pid)!;
      m.assignedCount++;

      if (['ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(dst) || ['ACCEPTED_BY_DELIVERY_PARTNER', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(st)) {
        m.acceptedCount++;
      }
      if (['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(dst) || ['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(st)) {
        m.pickedUpCount++;
      }
      if (['OUT_FOR_DELIVERY', 'DELIVERED'].includes(dst) || ['OUT_FOR_DELIVERY', 'DELIVERED'].includes(st)) {
        m.outForDeliveryCount++;
      }
      if (dst === 'DELIVERED' || st === 'DELIVERED') {
        m.deliveredCount++;
      }
      if (dst === 'FAILED_DELIVERY' || st === 'FAILED_DELIVERY') {
        m.failedCount++;
      }
      if (dst === 'RETURN_TO_WAREHOUSE' || ['RETURN_REQUESTED', 'RETURNED', 'RETURN_TO_WAREHOUSE'].includes(st)) {
        m.returnedCount++;
      }

      if (paymentMethod === 'COD' && st !== 'CANCELLED') {
        if (paymentStatus === 'PAID') {
          m.codCollected += grandTotal;
        } else {
          m.codPending += grandTotal;
        }
      }
    });

    // Also include registered partners even if 0 deliveries in range
    allPartners.forEach((p: any) => {
      const pid = p.partnerId || p.userId || p.id;
      if (!partnerMetricsMap.has(pid)) {
        partnerMetricsMap.set(pid, {
          partnerId: pid,
          name: p.name || 'Delivery Partner',
          mobile: p.mobile || '',
          vehicleType: p.vehicleType,
          assignedCount: 0,
          acceptedCount: 0,
          pickedUpCount: 0,
          outForDeliveryCount: 0,
          deliveredCount: 0,
          failedCount: 0,
          returnedCount: 0,
          codPending: 0,
          codCollected: 0,
        });
      }
    });

    const rows: ReportDeliveryPartnerRow[] = Array.from(partnerMetricsMap.values()).map(m => {
      const totalDecided = m.deliveredCount + m.failedCount;
      const successRate = totalDecided > 0
        ? Math.round((m.deliveredCount / totalDecided) * 1000) / 10
        : (m.deliveredCount > 0 ? 100 : 0);

      return {
        ...m,
        codPending: roundCurrency(m.codPending),
        codCollected: roundCurrency(m.codCollected),
        successRate,
      };
    });

    // Filter & Search
    let filteredRows = rows;
    if (pagination.search) {
      filteredRows = filteredRows.filter(r =>
        r.name.toLowerCase().includes(pagination.search) ||
        r.partnerId.toLowerCase().includes(pagination.search) ||
        r.mobile.toLowerCase().includes(pagination.search)
      );
    }

    // Sort
    const sortBy = pagination.sortBy || 'deliveredCount';
    filteredRows.sort((a: any, b: any) => {
      const valA = a[sortBy] ?? 0;
      const valB = b[sortBy] ?? 0;
      if (typeof valA === 'string') {
        return pagination.sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return pagination.sortOrder === 'asc' ? valA - valB : valB - valA;
    });

    // Paginate
    const totalCount = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pagination.pageSize));
    const startIndex = (pagination.page - 1) * pagination.pageSize;
    const paginatedPartners = filteredRows.slice(startIndex, startIndex + pagination.pageSize);

    await logAdminAudit({
      action: 'ADMIN_REPORT_VIEW',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'REPORT_DELIVERY',
      targetId: range.preset,
      metadata: { dateFrom: range.dateFrom, dateTo: range.dateTo, totalPartners: totalCount },
      req,
    });

    return res.status(200).json({
      success: true,
      metadata: {
        currency: 'INR',
        timezone: IST_TIMEZONE,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        generatedAt: new Date().toISOString(),
        preset: range.preset,
      },
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalCount,
        totalPages,
      },
      partners: paginatedPartners,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

// =========================================================================
// 8. GET /api/admin/reports/cod — Cash on Delivery Financials & Reconciliation
// =========================================================================
adminReportRouter.get('/cod', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser as AdminUser;
  const range = resolveDateRange(req.query.preset, req.query.dateFrom, req.query.dateTo);
  if (!range.success) {
    return res.status(400).json({ success: false, error: range.error, message: range.message });
  }

  try {
    const allOrders = await fetchOrders();
    const ordersInRange = filterOrdersByDate(allOrders, range);

    let totalCodOrders = 0;
    let totalCodValue = 0;
    let pendingCodValue = 0;
    let collectedCodValue = 0;
    let failedCodValue = 0;

    const partnerMap = new Map<string, {
      partnerId: string;
      partnerName: string;
      pendingCod: number;
      collectedCod: number;
      orderCount: number;
    }>();

    const trendMap = new Map<string, { date: string; collectedCod: number; pendingCod: number }>();

    ordersInRange.forEach((o: any) => {
      const pm = String(o.paymentMethod || 'COD').toUpperCase();
      if (pm !== 'COD') return;

      const grandTotal = Number(o.grandTotal ?? o.total ?? 0);
      const status = String(o.orderStatus || o.status || 'PLACED').toUpperCase();
      const dst = String(o.delivery?.assignmentStatus || '').toUpperCase();
      const payStatus = String(o.paymentStatus || 'PENDING').toUpperCase();
      const istDate = getIstDateString(o.createdAt || o.created_at);
      const pid = o.deliveryPartnerId || o.delivery?.assignedPartnerId || 'UNASSIGNED';
      const pname = o.deliveryPartnerName || (pid === 'UNASSIGNED' ? 'Unassigned' : pid);

      totalCodOrders++;
      totalCodValue += grandTotal;

      if (!trendMap.has(istDate)) {
        trendMap.set(istDate, { date: istDate, collectedCod: 0, pendingCod: 0 });
      }
      const trend = trendMap.get(istDate)!;

      if (!partnerMap.has(pid)) {
        partnerMap.set(pid, { partnerId: pid, partnerName: pname, pendingCod: 0, collectedCod: 0, orderCount: 0 });
      }
      const partnerData = partnerMap.get(pid)!;
      partnerData.orderCount++;

      if (payStatus === 'PAID') {
        collectedCodValue += grandTotal;
        partnerData.collectedCod += grandTotal;
        trend.collectedCod += grandTotal;
      } else if (
        status === 'FAILED_DELIVERY' ||
        status === 'CANCELLED' ||
        dst === 'FAILED_DELIVERY' ||
        dst === 'RETURN_TO_WAREHOUSE' ||
        ['RETURN_REQUESTED', 'RETURNED', 'RETURN_TO_WAREHOUSE'].includes(status)
      ) {
        failedCodValue += grandTotal;
      } else {
        pendingCodValue += grandTotal;
        partnerData.pendingCod += grandTotal;
        trend.pendingCod += grandTotal;
      }
    });

    const partnerBreakdown = Array.from(partnerMap.values()).map(p => ({
      ...p,
      pendingCod: roundCurrency(p.pendingCod),
      collectedCod: roundCurrency(p.collectedCod),
    }));

    const trend = Array.from(trendMap.values())
      .map(t => ({
        ...t,
        collectedCod: roundCurrency(t.collectedCod),
        pendingCod: roundCurrency(t.pendingCod),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const metrics: ReportCodMetrics = {
      totalCodOrders,
      totalCodValue: roundCurrency(totalCodValue),
      pendingCodValue: roundCurrency(pendingCodValue),
      collectedCodValue: roundCurrency(collectedCodValue),
      failedCodValue: roundCurrency(failedCodValue),
      partnerBreakdown,
      trend,
    };

    await logAdminAudit({
      action: 'ADMIN_REPORT_VIEW',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'REPORT_COD',
      targetId: range.preset,
      metadata: { dateFrom: range.dateFrom, dateTo: range.dateTo, totalCodValue },
      req,
    });

    return res.status(200).json({
      success: true,
      metadata: {
        currency: 'INR',
        timezone: IST_TIMEZONE,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        generatedAt: new Date().toISOString(),
        preset: range.preset,
      },
      codMetrics: metrics,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

// =========================================================================
// 9. GET /api/admin/reports/cancellations — Cancellation Root Cause
// =========================================================================
adminReportRouter.get('/cancellations', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser as AdminUser;
  const range = resolveDateRange(req.query.preset, req.query.dateFrom, req.query.dateTo);
  if (!range.success) {
    return res.status(400).json({ success: false, error: range.error, message: range.message });
  }

  try {
    const allOrders = await fetchOrders();
    const ordersInRange = filterOrdersByDate(allOrders, range);

    let cancellationCount = 0;
    let cancellationValue = 0;
    const reasonsBreakdown: Record<string, number> = {};
    const trendMap = new Map<string, { date: string; count: number; value: number }>();

    ordersInRange.forEach((o: any) => {
      const status = String(o.orderStatus || o.status || '').toUpperCase();
      if (status !== 'CANCELLED') return;

      const grandTotal = Number(o.grandTotal ?? o.total ?? 0);
      const reason = String(o.cancellationReason || 'NOT_SPECIFIED').trim();
      const istDate = getIstDateString(o.cancelledAt || o.updatedAt || o.createdAt);

      cancellationCount++;
      cancellationValue += grandTotal;
      reasonsBreakdown[reason] = (reasonsBreakdown[reason] || 0) + 1;

      if (!trendMap.has(istDate)) {
        trendMap.set(istDate, { date: istDate, count: 0, value: 0 });
      }
      const tr = trendMap.get(istDate)!;
      tr.count++;
      tr.value += grandTotal;
    });

    const totalOrders = ordersInRange.length;
    const cancellationRate = totalOrders > 0
      ? Math.round((cancellationCount / totalOrders) * 1000) / 10
      : 0;

    const trend = Array.from(trendMap.values())
      .map(t => ({ ...t, value: roundCurrency(t.value) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const metrics: ReportCancellationMetrics = {
      cancellationCount,
      cancellationValue: roundCurrency(cancellationValue),
      cancellationRate,
      reasonsBreakdown,
      trend,
    };

    await logAdminAudit({
      action: 'ADMIN_REPORT_VIEW',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'REPORT_CANCELLATIONS',
      targetId: range.preset,
      metadata: { dateFrom: range.dateFrom, dateTo: range.dateTo, cancellationCount },
      req,
    });

    return res.status(200).json({
      success: true,
      metadata: {
        currency: 'INR',
        timezone: IST_TIMEZONE,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        generatedAt: new Date().toISOString(),
        preset: range.preset,
      },
      cancellationMetrics: metrics,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

// =========================================================================
// 10. GET /api/admin/reports/failed-deliveries — Undelivered Consignments
// =========================================================================
adminReportRouter.get('/failed-deliveries', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser as AdminUser;
  const range = resolveDateRange(req.query.preset, req.query.dateFrom, req.query.dateTo);
  if (!range.success) {
    return res.status(400).json({ success: false, error: range.error, message: range.message });
  }

  try {
    const allOrders = await fetchOrders();
    const ordersInRange = filterOrdersByDate(allOrders, range);

    let failedDeliveryCount = 0;
    let failedDeliveryValue = 0;
    const reasonsBreakdown: Record<string, number> = {};
    const partnerBreakdownMap = new Map<string, { partnerId: string; partnerName: string; failedCount: number; failedValue: number }>();
    const trendMap = new Map<string, { date: string; count: number; value: number }>();

    ordersInRange.forEach((o: any) => {
      const status = String(o.orderStatus || o.status || '').toUpperCase();
      const dst = String(o.delivery?.assignmentStatus || '').toUpperCase();
      if (status !== 'FAILED_DELIVERY' && dst !== 'FAILED_DELIVERY') return;

      const grandTotal = Number(o.grandTotal ?? o.total ?? 0);
      const reason = String(o.delivery?.failureReason || o.failureReason || 'CUSTOMER_UNAVAILABLE').trim();
      const istDate = getIstDateString(o.delivery?.failedAt || o.updatedAt || o.createdAt);
      const pid = o.deliveryPartnerId || o.delivery?.assignedPartnerId || 'UNKNOWN';
      const pname = o.deliveryPartnerName || pid;

      failedDeliveryCount++;
      failedDeliveryValue += grandTotal;
      reasonsBreakdown[reason] = (reasonsBreakdown[reason] || 0) + 1;

      if (!partnerBreakdownMap.has(pid)) {
        partnerBreakdownMap.set(pid, { partnerId: pid, partnerName: pname, failedCount: 0, failedValue: 0 });
      }
      const pb = partnerBreakdownMap.get(pid)!;
      pb.failedCount++;
      pb.failedValue += grandTotal;

      if (!trendMap.has(istDate)) {
        trendMap.set(istDate, { date: istDate, count: 0, value: 0 });
      }
      const tr = trendMap.get(istDate)!;
      tr.count++;
      tr.value += grandTotal;
    });

    const partnerBreakdown = Array.from(partnerBreakdownMap.values()).map(pb => ({
      ...pb,
      failedValue: roundCurrency(pb.failedValue),
    }));

    const trend = Array.from(trendMap.values())
      .map(t => ({ ...t, value: roundCurrency(t.value) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const metrics: ReportFailedDeliveryMetrics = {
      failedDeliveryCount,
      failedDeliveryValue: roundCurrency(failedDeliveryValue),
      reasonsBreakdown,
      partnerBreakdown,
      trend,
    };

    await logAdminAudit({
      action: 'ADMIN_REPORT_VIEW',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'REPORT_FAILED_DELIVERIES',
      targetId: range.preset,
      metadata: { dateFrom: range.dateFrom, dateTo: range.dateTo, failedDeliveryCount },
      req,
    });

    return res.status(200).json({
      success: true,
      metadata: {
        currency: 'INR',
        timezone: IST_TIMEZONE,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        generatedAt: new Date().toISOString(),
        preset: range.preset,
      },
      failedMetrics: metrics,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

// =========================================================================
// 11. GET /api/admin/reports/returns — Return-to-Warehouse Audit
// =========================================================================
adminReportRouter.get('/returns', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser as AdminUser;
  const range = resolveDateRange(req.query.preset, req.query.dateFrom, req.query.dateTo);
  if (!range.success) {
    return res.status(400).json({ success: false, error: range.error, message: range.message });
  }

  try {
    const [allOrders, rawReturns] = await Promise.all([
      fetchOrders(),
      fetchReturns(),
    ]);

    const ordersInRange = filterOrdersByDate(allOrders, range);

    let returnCount = 0;
    let returnValue = 0;
    const reasonsBreakdown: Record<string, number> = {};
    const recentReturns: any[] = [];

    ordersInRange.forEach((o: any) => {
      const status = String(o.orderStatus || o.status || '').toUpperCase();
      const dst = String(o.delivery?.assignmentStatus || '').toUpperCase();
      const isReturn =
        ['RETURN_REQUESTED', 'RETURNED', 'RETURN_TO_WAREHOUSE'].includes(status) ||
        dst === 'RETURN_TO_WAREHOUSE';

      if (!isReturn) return;

      const grandTotal = Number(o.grandTotal ?? o.total ?? 0);
      const reason = String(o.delivery?.returnReason || o.returnReason || o.delivery?.failureReason || 'Returned to Hub').trim();
      const dateVal = o.delivery?.returnedAt || o.updatedAt || o.createdAt;

      returnCount++;
      returnValue += grandTotal;
      reasonsBreakdown[reason] = (reasonsBreakdown[reason] || 0) + 1;

      recentReturns.push({
        returnId: `RET-${o.orderId}`,
        orderId: o.orderId || o.id,
        retailerId: o.retailerId || 'N/A',
        shopName: o.shopName || o.deliveryAddress?.shopName || 'Retailer',
        deliveryPartnerId: o.deliveryPartnerId || o.delivery?.assignedPartnerId || 'N/A',
        status: dst === 'RETURN_TO_WAREHOUSE' ? 'RETURN_TO_WAREHOUSE' : status,
        date: getIstDateString(dateVal),
        value: roundCurrency(grandTotal),
        reason,
      });
    });

    const metrics: ReportReturnMetrics = {
      returnCount,
      returnValue: roundCurrency(returnValue),
      reasonsBreakdown,
      recentReturns: recentReturns.slice(0, 20),
    };

    await logAdminAudit({
      action: 'ADMIN_REPORT_VIEW',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'REPORT_RETURNS',
      targetId: range.preset,
      metadata: { dateFrom: range.dateFrom, dateTo: range.dateTo, returnCount },
      req,
    });

    return res.status(200).json({
      success: true,
      metadata: {
        currency: 'INR',
        timezone: IST_TIMEZONE,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        generatedAt: new Date().toISOString(),
        preset: range.preset,
      },
      returnMetrics: metrics,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

// =========================================================================
// 12. GET /api/admin/reports/export — Server-Authoritative CSV Generation
// =========================================================================
adminReportRouter.get('/export', async (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser as AdminUser;
  const exportType = String(req.query.type || 'sales').toLowerCase();
  const range = resolveDateRange(req.query.preset, req.query.dateFrom, req.query.dateTo);
  if (!range.success) {
    return res.status(400).json({ success: false, error: range.error, message: range.message });
  }

  try {
    const allOrders = await fetchOrders();
    const ordersInRange = filterOrdersByDate(allOrders, range);

    let headers: string[] = [];
    let rows: (string | number)[][] = [];

    const metaComments = [
      `MR FUTKAR Wholesaler Operations Report — ${exportType.toUpperCase()}`,
      `Timezone: ${IST_TIMEZONE}`,
      `Date Range: ${range.dateFrom} to ${range.dateTo} (${range.preset})`,
      `Generated At: ${new Date().toISOString()}`,
      `Generated By: ${adminUser.name} (${adminUser.uid})`,
      `Classification: STRICTLY CONFIDENTIAL / SUPER ADMIN ACCESS ONLY`,
    ];

    if (exportType === 'orders') {
      headers = [
        'Order ID',
        'Date (IST)',
        'Retailer ID',
        'Shop Name',
        'Order Status',
        'Delivery Status',
        'Payment Method',
        'Payment Status',
        'Item Count',
        'Subtotal (INR)',
        'Discount (INR)',
        'Delivery Charge (INR)',
        'Grand Total (INR)',
        'Delivery Partner ID',
      ];
      rows = ordersInRange.map((o: any) => [
        o.orderId || o.id,
        getIstDateString(o.createdAt || o.created_at),
        o.retailerId || '',
        o.shopName || o.deliveryAddress?.shopName || '',
        o.orderStatus || o.status || 'PLACED',
        o.delivery?.assignmentStatus || 'UNASSIGNED',
        o.paymentMethod || 'COD',
        o.paymentStatus || 'PENDING',
        Array.isArray(o.items) ? o.items.length : 0,
        roundCurrency(Number(o.subtotal || o.grandTotal || 0)),
        roundCurrency(Number(o.discount || 0)),
        roundCurrency(Number(o.deliveryCharge || 0)),
        roundCurrency(Number(o.grandTotal || o.total || 0)),
        o.deliveryPartnerId || o.delivery?.assignedPartnerId || '',
      ]);
    } else if (exportType === 'products') {
      const allProducts = await fetchProducts();
      const productCatalogMap = new Map<string, any>();
      allProducts.forEach((p: any) => productCatalogMap.set(p.productId || p.id, p));

      const prodMap = new Map<string, {
        productId: string;
        sku: string;
        name: string;
        quantitySold: number;
        salesValue: number;
        orderCount: number;
        orderIds: Set<string>;
      }>();

      ordersInRange.forEach((o: any) => {
        if (String(o.orderStatus || '').toUpperCase() === 'CANCELLED') return;
        const items = Array.isArray(o.items) ? o.items : [];
        items.forEach((it: any) => {
          const pid = it.productId || it.id || it.sku || 'UNKNOWN';
          if (!prodMap.has(pid)) {
            prodMap.set(pid, {
              productId: pid,
              sku: it.sku || '',
              name: it.productName || it.name || 'Product',
              quantitySold: 0,
              salesValue: 0,
              orderCount: 0,
              orderIds: new Set(),
            });
          }
          const p = prodMap.get(pid)!;
          const qty = Number(it.quantity ?? it.qty ?? 0);
          const price = Number(it.unitPrice ?? it.price ?? 0);
          p.quantitySold += qty;
          p.salesValue += (it.totalPrice ?? (qty * price));
          p.orderIds.add(o.orderId || o.id);
        });
      });

      headers = [
        'Product ID',
        'SKU',
        'Product Name',
        'Quantity Sold',
        'Sales Value (INR)',
        'Order Frequency',
        'Avg Selling Price (INR)',
        'Current Stock',
        'Low Stock Threshold',
        'Is Low Stock',
      ];
      rows = Array.from(prodMap.values()).map(p => {
        const cat = productCatalogMap.get(p.productId) || {};
        const stock = Number(cat.stockQuantity ?? 0);
        const threshold = Number(cat.lowStockThreshold ?? 10);
        return [
          p.productId,
          p.sku || cat.sku || '',
          cat.productName || p.name,
          p.quantitySold,
          roundCurrency(p.salesValue),
          p.orderIds.size,
          p.quantitySold > 0 ? roundCurrency(p.salesValue / p.quantitySold) : 0,
          stock,
          threshold,
          stock <= threshold ? 'YES' : 'NO',
        ];
      });
    } else if (exportType === 'retailers') {
      const allRetailers = await fetchRetailers();
      const retMap = new Map<string, {
        retailerId: string;
        shopName: string;
        ownerName: string;
        orderCount: number;
        salesValue: number;
        deliveredCount: number;
        cancelledCount: number;
        lastDate: string;
      }>();

      ordersInRange.forEach((o: any) => {
        const rid = o.retailerId || 'UNKNOWN';
        const st = String(o.orderStatus || '').toUpperCase();
        const tot = Number(o.grandTotal || 0);

        if (!retMap.has(rid)) {
          retMap.set(rid, {
            retailerId: rid,
            shopName: o.shopName || '',
            ownerName: o.retailerName || '',
            orderCount: 0,
            salesValue: 0,
            deliveredCount: 0,
            cancelledCount: 0,
            lastDate: getIstDateString(o.createdAt),
          });
        }
        const r = retMap.get(rid)!;
        r.orderCount++;
        if (st !== 'CANCELLED') r.salesValue += tot;
        if (st === 'DELIVERED') r.deliveredCount++;
        if (st === 'CANCELLED') r.cancelledCount++;
      });

      headers = [
        'Retailer ID',
        'Shop Name',
        'Owner Name',
        'Total Orders',
        'Delivered Orders',
        'Cancelled Orders',
        'Total Sales (INR)',
        'Avg Order Value (INR)',
        'Last Order Date',
      ];
      rows = Array.from(retMap.values()).map(r => {
        const validOrders = r.orderCount - r.cancelledCount;
        return [
          r.retailerId,
          r.shopName,
          r.ownerName,
          r.orderCount,
          r.deliveredCount,
          r.cancelledCount,
          roundCurrency(r.salesValue),
          validOrders > 0 ? roundCurrency(r.salesValue / validOrders) : 0,
          r.lastDate,
        ];
      });
    } else if (exportType === 'cod') {
      headers = [
        'Order ID',
        'Date (IST)',
        'Retailer ID',
        'Shop Name',
        'Grand Total (INR)',
        'Payment Status',
        'Order Status',
        'Delivery Partner ID',
        'Delivery Partner Name',
      ];
      rows = ordersInRange
        .filter((o: any) => String(o.paymentMethod || 'COD').toUpperCase() === 'COD')
        .map((o: any) => [
          o.orderId || o.id,
          getIstDateString(o.createdAt),
          o.retailerId || '',
          o.shopName || '',
          roundCurrency(Number(o.grandTotal || 0)),
          o.paymentStatus || 'PENDING',
          o.orderStatus || 'PLACED',
          o.deliveryPartnerId || o.delivery?.assignedPartnerId || '',
          o.deliveryPartnerName || '',
        ]);
    } else if (exportType === 'cancellations') {
      headers = [
        'Order ID',
        'Date (IST)',
        'Retailer ID',
        'Shop Name',
        'Grand Total (INR)',
        'Cancellation Reason',
        'Payment Method',
        'Payment Status',
      ];
      rows = ordersInRange
        .filter((o: any) => String(o.orderStatus || o.status || '').toUpperCase() === 'CANCELLED')
        .map((o: any) => [
          o.orderId || o.id,
          getIstDateString(o.cancelledAt || o.updatedAt || o.createdAt),
          o.retailerId || '',
          o.shopName || o.deliveryAddress?.shopName || '',
          roundCurrency(Number(o.grandTotal || 0)),
          String(o.cancellationReason || 'NOT_SPECIFIED'),
          o.paymentMethod || 'COD',
          o.paymentStatus || 'PENDING',
        ]);
    } else if (exportType === 'failed' || exportType === 'failed-deliveries') {
      headers = [
        'Order ID',
        'Date (IST)',
        'Retailer ID',
        'Shop Name',
        'Grand Total (INR)',
        'Failure Reason',
        'Delivery Partner ID',
        'Delivery Partner Name',
      ];
      rows = ordersInRange
        .filter((o: any) => {
          const st = String(o.orderStatus || o.status || '').toUpperCase();
          const dst = String(o.delivery?.assignmentStatus || '').toUpperCase();
          return st === 'FAILED_DELIVERY' || dst === 'FAILED_DELIVERY';
        })
        .map((o: any) => [
          o.orderId || o.id,
          getIstDateString(o.delivery?.failedAt || o.updatedAt || o.createdAt),
          o.retailerId || '',
          o.shopName || o.deliveryAddress?.shopName || '',
          roundCurrency(Number(o.grandTotal || 0)),
          String(o.delivery?.failureReason || o.failureReason || 'CUSTOMER_UNAVAILABLE'),
          o.deliveryPartnerId || o.delivery?.assignedPartnerId || '',
          o.deliveryPartnerName || '',
        ]);
    } else if (exportType === 'returns') {
      headers = [
        'Order ID',
        'Date (IST)',
        'Retailer ID',
        'Shop Name',
        'Grand Total (INR)',
        'Return Reason',
        'Status',
        'Delivery Partner ID',
      ];
      rows = ordersInRange
        .filter((o: any) => {
          const st = String(o.orderStatus || o.status || '').toUpperCase();
          const dst = String(o.delivery?.assignmentStatus || '').toUpperCase();
          return ['RETURN_REQUESTED', 'RETURNED', 'RETURN_TO_WAREHOUSE'].includes(st) || dst === 'RETURN_TO_WAREHOUSE';
        })
        .map((o: any) => [
          o.orderId || o.id,
          getIstDateString(o.delivery?.returnedAt || o.updatedAt || o.createdAt),
          o.retailerId || '',
          o.shopName || o.deliveryAddress?.shopName || '',
          roundCurrency(Number(o.grandTotal || 0)),
          String(o.delivery?.returnReason || o.returnReason || o.delivery?.failureReason || 'Returned to Hub'),
          o.delivery?.assignmentStatus === 'RETURN_TO_WAREHOUSE' ? 'RETURN_TO_WAREHOUSE' : (o.orderStatus || 'RETURNED'),
          o.deliveryPartnerId || o.delivery?.assignedPartnerId || '',
        ]);
    } else {
      // Default sales summary export
      headers = [
        'Date (IST)',
        'Gross Sales (INR)',
        'Delivered Sales (INR)',
        'Total Orders',
        'Delivered Orders',
        'Cancelled Orders',
      ];
      const dailyMap = new Map<string, { gross: number; delivered: number; total: number; del: number; can: number }>();
      ordersInRange.forEach((o: any) => {
        const istDate = getIstDateString(o.createdAt);
        const tot = Number(o.grandTotal || 0);
        const st = String(o.orderStatus || '').toUpperCase();
        if (!dailyMap.has(istDate)) {
          dailyMap.set(istDate, { gross: 0, delivered: 0, total: 0, del: 0, can: 0 });
        }
        const d = dailyMap.get(istDate)!;
        d.total++;
        if (st !== 'CANCELLED') d.gross += tot;
        if (st === 'DELIVERED') {
          d.delivered += tot;
          d.del++;
        }
        if (st === 'CANCELLED') d.can++;
      });

      rows = Array.from(dailyMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, d]) => [
          date,
          roundCurrency(d.gross),
          roundCurrency(d.delivered),
          d.total,
          d.del,
          d.can,
        ]);
    }

    const csvContent = generateCsv(headers, rows, metaComments);

    // Audit log
    await logAdminAudit({
      action: 'ADMIN_REPORT_EXPORT',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'REPORT_EXPORT',
      targetId: exportType,
      metadata: {
        exportType,
        preset: range.preset,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        rowCount: rows.length,
      },
      req,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mr_futkar_${exportType}_report_${range.dateFrom}_to_${range.dateTo}.csv"`);
    return res.status(200).send(csvContent);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});
