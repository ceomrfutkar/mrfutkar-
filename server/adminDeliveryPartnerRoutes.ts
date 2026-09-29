import { Router, Request, Response } from 'express';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from './firebaseAdmin';
import { logAdminAudit } from './adminAuth';
import { OPERATIONAL_WAREHOUSE_ID, OPERATIONAL_WAREHOUSE_NAME } from './auth';
import { SEED_DELIVERY_PARTNERS } from './deliveryRoutes';
import { ServerNotificationService } from './notificationService';
import { AdminUser, AdminDeliveryPartnerRow, AdminDeliveryPartnerSummaryStats } from '../src/types/admin';
import { DeliveryPartner } from '../src/types/delivery';

export const adminDeliveryPartnerRouter = Router();

const SERVER_TXN_TOKEN = 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01';

/**
 * Active delivery states where a partner is actively committed to an order.
 * Historical terminal states (DELIVERED, CANCELLED, RETURN_TO_WAREHOUSE, FAILED_DELIVERY) are NOT active.
 */
const ACTIVE_DELIVERY_STATUSES = ['ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY'];

/**
 * Sanitizes order object for safe delivery partner display without leaking:
 * - raw delivery OTP secrets
 * - OTP hashes or salt
 * - internal private POD paths
 */
function sanitizeOrderForAdminView(order: any): any {
  if (!order) return null;
  const sanitized = { ...order };

  // Remove raw OTP and hash secrets
  if (sanitized.deliveryOtp) {
    if (typeof sanitized.deliveryOtp === 'object') {
      const { otpHash, otpSecret, ...safeOtp } = sanitized.deliveryOtp;
      sanitized.deliveryOtp = safeOtp;
    } else {
      delete sanitized.deliveryOtp;
    }
  }
  delete sanitized.deliveryOtpHash;

  if (sanitized.delivery) {
    const d = { ...sanitized.delivery };
    delete d.deliveryOtp;
    delete d.deliveryOtpHash;
    sanitized.delivery = d;
  }

  // Remove private storage references / keys
  if (sanitized.proofOfDelivery) {
    const p = { ...sanitized.proofOfDelivery };
    delete p.rawInternalPath;
    sanitized.proofOfDelivery = p;
  }

  return sanitized;
}

/**
 * Helper to fetch all authoritative delivery partners from Firestore,
 * ensuring default seed partners exist if collection is sparse.
 */
async function fetchAllPartners(): Promise<DeliveryPartner[]> {
  const partnersSnap = await getDocs(collection(db, 'deliveryPartners'));
  const partnersMap = new Map<string, DeliveryPartner>();

  partnersSnap.docs.forEach(d => {
    const data = d.data() as DeliveryPartner;
    const partnerId = data.partnerId || d.id;
    partnersMap.set(partnerId, {
      ...data,
      partnerId,
      userId: data.userId || partnerId,
    });
  });

  // Include seed partners if not present in Firestore
  for (const [sId, sData] of Object.entries(SEED_DELIVERY_PARTNERS)) {
    if (!partnersMap.has(sId)) {
      const now = new Date().toISOString();
      const seeded: DeliveryPartner = {
        partnerId: sId,
        userId: sId,
        name: sData.name || 'Delivery Partner',
        mobile: sData.mobile || '9876543210',
        status: (sData.status || 'ACTIVE') as any,
        availabilityStatus: (sData.availabilityStatus || 'AVAILABLE') as any,
        vehicleType: sData.vehicleType || 'MOTORCYCLE',
        vehicleNumber: sData.vehicleNumber || 'DL-1L-AA-0000',
        licenseNumber: sData.licenseNumber || 'DL-1420110012345',
        assignedWarehouseId: OPERATIONAL_WAREHOUSE_ID,
        assignedWarehouseName: OPERATIONAL_WAREHOUSE_NAME,
        serviceAreas: sData.serviceAreas || ['Brahmpuri', 'Karawal Nagar'],
        createdAt: now,
        updatedAt: now,
        lastActiveAt: now,
      };
      partnersMap.set(sId, seeded);
    }
  }

  return Array.from(partnersMap.values());
}

/**
 * Helper to resolve a single authoritative delivery partner by partnerId
 */
async function resolvePartner(partnerId: string): Promise<DeliveryPartner | null> {
  const dpRef = doc(db, 'deliveryPartners', partnerId);
  const snap = await getDoc(dpRef);
  if (snap.exists()) {
    const data = snap.data() as DeliveryPartner;
    return {
      ...data,
      partnerId: data.partnerId || snap.id,
      userId: data.userId || snap.id,
    };
  }

  if (SEED_DELIVERY_PARTNERS[partnerId]) {
    const sData = SEED_DELIVERY_PARTNERS[partnerId];
    const now = new Date().toISOString();
    return {
      partnerId,
      userId: partnerId,
      name: sData.name || 'Delivery Partner',
      mobile: sData.mobile || '9876543210',
      status: (sData.status || 'ACTIVE') as any,
      availabilityStatus: (sData.availabilityStatus || 'AVAILABLE') as any,
      vehicleType: sData.vehicleType || 'MOTORCYCLE',
      vehicleNumber: sData.vehicleNumber || 'DL-1L-AA-0000',
      licenseNumber: sData.licenseNumber || 'DL-1420110012345',
      assignedWarehouseId: OPERATIONAL_WAREHOUSE_ID,
      assignedWarehouseName: OPERATIONAL_WAREHOUSE_NAME,
      serviceAreas: sData.serviceAreas || ['Brahmpuri', 'Karawal Nagar'],
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    };
  }

  return null;
}

/**
 * Helper to fetch all orders from the authoritative `orders` collection
 */
async function fetchAllAuthoritativeOrders(): Promise<any[]> {
  try {
    const snap = await getDocs(collection(db, 'orders'));
    return snap.docs.map(d => ({ orderId: d.id, ...d.data() }));
  } catch (err: any) {
    console.error('Error querying orders collection:', err);
    return [];
  }
}

// =========================================================================
// 1. GET /api/admin/delivery-partners
// =========================================================================
/**
 * Lists delivery partners with server-side search, filtering, pagination, and real-time workload stats.
 * Max pageSize is strictly bounded at 100.
 */
adminDeliveryPartnerRouter.get('/', async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser as AdminUser;

    // Validate Page Size
    const rawPageSize = req.query.pageSize !== undefined ? Number(req.query.pageSize) : 25;
    if (isNaN(rawPageSize) || rawPageSize < 1) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PAGE_SIZE',
        message: 'Page size must be a positive integer between 1 and 100.',
      });
    }
    if (rawPageSize > 100) {
      return res.status(400).json({
        success: false,
        error: 'PAGE_SIZE_EXCEEDED',
        message: 'Page size cannot exceed maximum limit of 100 items.',
      });
    }
    const pageSize = Math.min(Math.floor(rawPageSize), 100);

    const rawPage = req.query.page !== undefined ? Number(req.query.page) : 1;
    const page = isNaN(rawPage) || rawPage < 1 ? 1 : Math.floor(rawPage);

    // Query Filters
    const searchTerm = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : 'ALL';
    const availabilityFilter = typeof req.query.availabilityStatus === 'string' ? req.query.availabilityStatus.trim().toUpperCase() : 'ALL';
    const warehouseFilter = typeof req.query.warehouseId === 'string' ? req.query.warehouseId.trim() : '';
    const hasActiveDeliveryFilter = req.query.hasActiveDelivery !== undefined ? String(req.query.hasActiveDelivery).toLowerCase() === 'true' : null;
    const hasPendingCodFilter = req.query.hasPendingCod !== undefined ? String(req.query.hasPendingCod).toLowerCase() === 'true' : null;

    // Fetch authoritative partners & orders
    const [allPartners, allOrders] = await Promise.all([
      fetchAllPartners(),
      fetchAllAuthoritativeOrders(),
    ]);

    const todayStr = new Date().toISOString().split('T')[0];

    // Build per-partner order statistics from authoritative orders collection
    const partnerStatsMap = new Map<string, {
      activeOrdersCount: number;
      deliveredTodayCount: number;
      failedDeliveriesCount: number;
      pendingCodAmount: number;
      pendingCodCount: number;
    }>();

    for (const p of allPartners) {
      partnerStatsMap.set(p.partnerId, {
        activeOrdersCount: 0,
        deliveredTodayCount: 0,
        failedDeliveriesCount: 0,
        pendingCodAmount: 0,
        pendingCodCount: 0,
      });
    }

    allOrders.forEach(o => {
      const assignedPartnerId = o.deliveryPartnerId || o.delivery?.assignedPartnerId;
      if (!assignedPartnerId) return;

      let stats = partnerStatsMap.get(assignedPartnerId);
      if (!stats) {
        stats = {
          activeOrdersCount: 0,
          deliveredTodayCount: 0,
          failedDeliveriesCount: 0,
          pendingCodAmount: 0,
          pendingCodCount: 0,
        };
        partnerStatsMap.set(assignedPartnerId, stats);
      }

      const orderStatus = (o.orderStatus || o.status || 'PLACED').toUpperCase();
      const assignmentStatus = (o.delivery?.assignmentStatus || '').toUpperCase();
      const grandTotal = Number(o.grandTotal ?? o.total ?? 0);
      const isCancelled = orderStatus === 'CANCELLED';

      // 1. Active Workload Check (ASSIGNED, ACCEPTED, PICKED_UP, OUT_FOR_DELIVERY)
      // Excludes CANCELLED, DELIVERED, RETURN_TO_WAREHOUSE
      if (!isCancelled && orderStatus !== 'DELIVERED') {
        if (ACTIVE_DELIVERY_STATUSES.includes(assignmentStatus) || orderStatus === 'OUT_FOR_DELIVERY') {
          stats.activeOrdersCount++;
        }
      }

      // 2. Today's Delivered Check
      if (assignmentStatus === 'DELIVERED' || orderStatus === 'DELIVERED') {
        const deliveredDate = (o.delivery?.deliveredAt || o.deliveredAt || o.updatedAt || '').split('T')[0];
        if (deliveredDate === todayStr) {
          stats.deliveredTodayCount++;
        }
      }

      // 3. Failed Deliveries Check
      if (assignmentStatus === 'FAILED_DELIVERY' || orderStatus === 'FAILED_DELIVERY') {
        stats.failedDeliveriesCount++;
      }

      // 4. Pending COD Check
      const paymentMethod = (o.paymentMethod || o.deliveryPayment?.method || '').toUpperCase();
      const codStatus = (o.deliveryPayment?.collectionStatus || o.paymentStatus || 'PENDING').toUpperCase();
      if (!isCancelled && paymentMethod === 'COD' && orderStatus !== 'DELIVERED') {
        if (codStatus === 'PENDING' || codStatus === 'PARTIALLY_COLLECTED') {
          stats.pendingCodAmount += grandTotal;
          stats.pendingCodCount++;
        }
      }
    });

    // Build mapped partner rows
    const mappedPartners: AdminDeliveryPartnerRow[] = allPartners.map(p => {
      const stats = partnerStatsMap.get(p.partnerId) || {
        activeOrdersCount: 0,
        deliveredTodayCount: 0,
        failedDeliveriesCount: 0,
        pendingCodAmount: 0,
        pendingCodCount: 0,
      };

      return {
        partnerId: p.partnerId,
        userId: p.userId || p.partnerId,
        name: p.name || 'Delivery Partner',
        mobile: p.mobile || '',
        alternateMobile: p.alternateMobile,
        status: (p.status || 'ACTIVE') as any,
        availabilityStatus: (p.availabilityStatus || 'OFFLINE') as any,
        assignedWarehouseId: p.assignedWarehouseId || OPERATIONAL_WAREHOUSE_ID,
        assignedWarehouseName: p.assignedWarehouseName || OPERATIONAL_WAREHOUSE_NAME,
        vehicleType: p.vehicleType || 'MOTORCYCLE',
        vehicleNumber: p.vehicleNumber || 'DL-1L-AA-0000',
        licenseNumber: p.licenseNumber || 'DL-1420110012345',
        serviceAreas: p.serviceAreas || ['Brahmpuri', 'Karawal Nagar'],
        activeOrdersCount: stats.activeOrdersCount,
        deliveredTodayCount: stats.deliveredTodayCount,
        failedDeliveriesCount: stats.failedDeliveriesCount,
        pendingCodAmount: stats.pendingCodAmount,
        pendingCodCount: stats.pendingCodCount,
        createdAt: p.createdAt || new Date().toISOString(),
        updatedAt: p.updatedAt || new Date().toISOString(),
        lastActiveAt: p.lastActiveAt,
      };
    });

    // Calculate Fleet-Wide Summary Stats
    const summary: AdminDeliveryPartnerSummaryStats = {
      totalPartners: mappedPartners.length,
      activePartners: mappedPartners.filter(p => p.status === 'ACTIVE').length,
      availablePartners: mappedPartners.filter(p => p.availabilityStatus === 'AVAILABLE').length,
      onDeliveryPartners: mappedPartners.filter(p => p.availabilityStatus === 'ON_DELIVERY' || p.activeOrdersCount > 0).length,
      suspendedPartners: mappedPartners.filter(p => p.status === 'SUSPENDED').length,
      inactivePartners: mappedPartners.filter(p => p.status === 'INACTIVE').length,
      totalActiveDeliveries: mappedPartners.reduce((acc, p) => acc + p.activeOrdersCount, 0),
      totalDeliveredToday: mappedPartners.reduce((acc, p) => acc + p.deliveredTodayCount, 0),
      totalPendingCodAmount: mappedPartners.reduce((acc, p) => acc + p.pendingCodAmount, 0),
      totalPendingCodCount: mappedPartners.reduce((acc, p) => acc + p.pendingCodCount, 0),
    };

    // Apply Filters
    const filteredPartners = mappedPartners.filter(p => {
      // 1. Status Filter
      if (statusFilter !== 'ALL' && p.status !== statusFilter) {
        return false;
      }

      // 2. Availability Filter
      if (availabilityFilter !== 'ALL' && p.availabilityStatus !== availabilityFilter) {
        return false;
      }

      // 3. Warehouse Filter
      if (warehouseFilter && p.assignedWarehouseId !== warehouseFilter) {
        return false;
      }

      // 4. Has Active Delivery Filter
      if (hasActiveDeliveryFilter !== null) {
        if (hasActiveDeliveryFilter && p.activeOrdersCount === 0) return false;
        if (!hasActiveDeliveryFilter && p.activeOrdersCount > 0) return false;
      }

      // 5. Has Pending COD Filter
      if (hasPendingCodFilter !== null) {
        if (hasPendingCodFilter && p.pendingCodAmount === 0) return false;
        if (!hasPendingCodFilter && p.pendingCodAmount > 0) return false;
      }

      // 6. Search Term (partnerId, name, mobile, vehicleNumber)
      if (searchTerm) {
        const idMatch = p.partnerId.toLowerCase().includes(searchTerm);
        const nameMatch = p.name.toLowerCase().includes(searchTerm);
        const mobileMatch = p.mobile.toLowerCase().includes(searchTerm);
        const altMobileMatch = (p.alternateMobile || '').toLowerCase().includes(searchTerm);
        const vehicleMatch = p.vehicleNumber.toLowerCase().includes(searchTerm);
        if (!idMatch && !nameMatch && !mobileMatch && !altMobileMatch && !vehicleMatch) {
          return false;
        }
      }

      return true;
    });

    const total = filteredPartners.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const startIndex = (page - 1) * pageSize;
    const paginatedPartners = filteredPartners.slice(startIndex, startIndex + pageSize);

    return res.status(200).json({
      success: true,
      partners: paginatedPartners,
      total,
      page,
      pageSize,
      totalPages,
      summary,
    });
  } catch (err: any) {
    console.error('Error listing delivery partners:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve delivery partners.',
      details: err.message,
    });
  }
});

// =========================================================================
// 2. GET /api/admin/delivery-partners/:partnerId
// =========================================================================
/**
 * Detailed profile for a delivery partner, including real-time workload,
 * active orders list, delivery history counts, COD summary, performance metrics,
 * and immutable audit history.
 */
adminDeliveryPartnerRouter.get('/:partnerId', async (req: Request, res: Response) => {
  try {
    const { partnerId } = req.params;
    const adminUser = (req as any).adminUser as AdminUser;

    const partner = await resolvePartner(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        error: 'PARTNER_NOT_FOUND',
        message: `Delivery partner '${partnerId}' not found.`,
      });
    }

    // Query authoritative orders assigned to this partner
    const allOrders = await fetchAllAuthoritativeOrders();
    const partnerOrders = allOrders.filter(
      o => o.deliveryPartnerId === partnerId || o.delivery?.assignedPartnerId === partnerId
    );

    const todayStr = new Date().toISOString().split('T')[0];

    // Workload computation
    let assignedCount = 0;
    let acceptedCount = 0;
    let pickedUpCount = 0;
    let outForDeliveryCount = 0;
    const activeOrders: any[] = [];

    // History computation
    let deliveredCount = 0;
    let failedCount = 0;
    let returnedCount = 0;

    // COD computation
    let pendingCodAmount = 0;
    let pendingCodCount = 0;
    let collectedCodAmount = 0;
    let collectedCodCount = 0;

    // Today's metrics & durations
    let todayDeliveriesCount = 0;
    let todayDeliveriesAmount = 0;
    const deliveryDurationsMinutes: number[] = [];
    const acceptanceDurationsMinutes: number[] = [];

    partnerOrders.forEach(o => {
      const orderStatus = (o.orderStatus || o.status || 'PLACED').toUpperCase();
      const assignmentStatus = (o.delivery?.assignmentStatus || '').toUpperCase();
      const grandTotal = Number(o.grandTotal ?? o.total ?? 0);
      const isCancelled = orderStatus === 'CANCELLED';

      if (isCancelled) return;

      // Active Workload Breakdown
      if (orderStatus !== 'DELIVERED' && ACTIVE_DELIVERY_STATUSES.includes(assignmentStatus)) {
        if (assignmentStatus === 'ASSIGNED') assignedCount++;
        else if (assignmentStatus === 'ACCEPTED') acceptedCount++;
        else if (assignmentStatus === 'PICKED_UP') pickedUpCount++;
        else if (assignmentStatus === 'OUT_FOR_DELIVERY') outForDeliveryCount++;

        activeOrders.push(sanitizeOrderForAdminView(o));
      }

      // History Breakdown
      if (assignmentStatus === 'DELIVERED' || orderStatus === 'DELIVERED') {
        deliveredCount++;
        const deliveredDate = (o.delivery?.deliveredAt || o.deliveredAt || o.updatedAt || '').split('T')[0];
        if (deliveredDate === todayStr) {
          todayDeliveriesCount++;
          todayDeliveriesAmount += grandTotal;
        }

        // Calculate delivery duration if authoritative timestamps exist
        const pickedUpTime = o.delivery?.pickedUpAt || o.delivery?.outForDeliveryAt || o.dispatchedAt;
        const deliveredTime = o.delivery?.deliveredAt || o.deliveredAt;
        if (pickedUpTime && deliveredTime) {
          const start = new Date(pickedUpTime).getTime();
          const end = new Date(deliveredTime).getTime();
          if (!isNaN(start) && !isNaN(end) && end > start) {
            const minutes = (end - start) / (1000 * 60);
            deliveryDurationsMinutes.push(minutes);
          }
        }
      } else if (assignmentStatus === 'FAILED_DELIVERY' || orderStatus === 'FAILED_DELIVERY') {
        failedCount++;
      } else if (assignmentStatus === 'RETURN_TO_WAREHOUSE' || orderStatus === 'RETURNED' || orderStatus === 'RETURN_REQUESTED') {
        returnedCount++;
      }

      // Calculate acceptance time if timestamps exist
      const assignedTime = o.delivery?.assignedAt || o.deliveryAssignedAt;
      const acceptedTime = o.delivery?.acceptedAt;
      if (assignedTime && acceptedTime) {
        const start = new Date(assignedTime).getTime();
        const end = new Date(acceptedTime).getTime();
        if (!isNaN(start) && !isNaN(end) && end >= start) {
          const minutes = (end - start) / (1000 * 60);
          acceptanceDurationsMinutes.push(minutes);
        }
      }

      // COD calculation
      const payMethod = (o.paymentMethod || o.deliveryPayment?.method || '').toUpperCase();
      const collectionStatus = (o.deliveryPayment?.collectionStatus || (orderStatus === 'DELIVERED' ? 'COLLECTED' : 'PENDING')).toUpperCase();
      if (payMethod === 'COD') {
        if (collectionStatus === 'COLLECTED') {
          collectedCodAmount += grandTotal;
          collectedCodCount++;
        } else if (orderStatus !== 'DELIVERED') {
          pendingCodAmount += grandTotal;
          pendingCodCount++;
        }
      }
    });

    const totalActiveCount = assignedCount + acceptedCount + pickedUpCount + outForDeliveryCount;
    const totalCompletedCount = deliveredCount + failedCount + returnedCount;

    // Performance Calculations (Strictly avoiding fabricated numbers)
    let completionRate: number | null = null;
    let completionRateDisplay = 'Insufficient data';
    if (totalCompletedCount > 0) {
      completionRate = Math.round((deliveredCount / totalCompletedCount) * 1000) / 10;
      completionRateDisplay = `${completionRate}%`;
    }

    let averageDeliveryDurationMinutes: number | null = null;
    let averageDeliveryDurationDisplay = 'Insufficient data';
    if (deliveryDurationsMinutes.length > 0) {
      const sum = deliveryDurationsMinutes.reduce((a, b) => a + b, 0);
      averageDeliveryDurationMinutes = Math.round(sum / deliveryDurationsMinutes.length);
      averageDeliveryDurationDisplay = `${averageDeliveryDurationMinutes} mins`;
    }

    let averageAcceptanceDurationMinutes: number | null = null;
    let averageAcceptanceDurationDisplay = 'Insufficient data';
    if (acceptanceDurationsMinutes.length > 0) {
      const sum = acceptanceDurationsMinutes.reduce((a, b) => a + b, 0);
      averageAcceptanceDurationMinutes = Math.round(sum / acceptanceDurationsMinutes.length);
      averageAcceptanceDurationDisplay = `${averageAcceptanceDurationMinutes} mins`;
    }

    // Fetch relevant audit logs for this partner
    let auditLogs: any[] = [];
    try {
      const adminLogsSnap = await getDocs(
        query(
          collection(db, 'adminAuditLogs'),
          where('targetType', '==', 'DELIVERY_PARTNER'),
          where('targetId', '==', partnerId),
          limit(20)
        )
      );
      const deliveryLogsSnap = await getDocs(
        query(
          collection(db, 'deliveryAuditLogs'),
          where('partnerId', '==', partnerId),
          limit(20)
        )
      );

      const combined: any[] = [
        ...adminLogsSnap.docs.map(d => ({ source: 'ADMIN', ...d.data() })),
        ...deliveryLogsSnap.docs.map(d => ({ source: 'DELIVERY', ...d.data() })),
      ];

      combined.sort((a: any, b: any) => {
        const timeA = new Date(a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp || 0).getTime();
        return timeB - timeA;
      });

      auditLogs = combined.slice(0, 20);
    } catch (auditErr) {
      console.warn('Warning reading audit logs for partner:', auditErr);
    }

    // Log admin view audit
    await logAdminAudit({
      action: 'ADMIN_DELIVERY_PARTNER_VIEW',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'DELIVERY_PARTNER',
      targetId: partnerId,
      metadata: { partnerName: partner.name },
      req,
    });

    const partnerRow: AdminDeliveryPartnerRow = {
      partnerId: partner.partnerId,
      userId: partner.userId || partner.partnerId,
      name: partner.name || 'Delivery Partner',
      mobile: partner.mobile || '',
      alternateMobile: partner.alternateMobile,
      status: (partner.status || 'ACTIVE') as any,
      availabilityStatus: (partner.availabilityStatus || 'OFFLINE') as any,
      assignedWarehouseId: partner.assignedWarehouseId || OPERATIONAL_WAREHOUSE_ID,
      assignedWarehouseName: partner.assignedWarehouseName || OPERATIONAL_WAREHOUSE_NAME,
      vehicleType: partner.vehicleType || 'MOTORCYCLE',
      vehicleNumber: partner.vehicleNumber || 'DL-1L-AA-0000',
      licenseNumber: partner.licenseNumber || 'DL-1420110012345',
      serviceAreas: partner.serviceAreas || ['Brahmpuri', 'Karawal Nagar'],
      activeOrdersCount: totalActiveCount,
      deliveredTodayCount: todayDeliveriesCount,
      failedDeliveriesCount: failedCount,
      pendingCodAmount,
      pendingCodCount,
      createdAt: partner.createdAt || new Date().toISOString(),
      updatedAt: partner.updatedAt || new Date().toISOString(),
      lastActiveAt: partner.lastActiveAt,
    };

    return res.status(200).json({
      success: true,
      partner: partnerRow,
      workload: {
        assignedCount,
        acceptedCount,
        pickedUpCount,
        outForDeliveryCount,
        totalActiveCount,
        activeOrders,
      },
      historySummary: {
        deliveredCount,
        failedCount,
        returnedCount,
        totalCompletedCount,
      },
      codSummary: {
        pendingAmount: pendingCodAmount,
        pendingCount: pendingCodCount,
        collectedAmount: collectedCodAmount,
        collectedCount: collectedCodCount,
      },
      performance: {
        completionRate,
        completionRateDisplay,
        averageDeliveryDurationMinutes,
        averageDeliveryDurationDisplay,
        averageAcceptanceDurationMinutes,
        averageAcceptanceDurationDisplay,
        todayDeliveriesCount,
        todayDeliveriesAmount,
      },
      auditLogs,
    });
  } catch (err: any) {
    console.error('Error fetching partner detail:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve delivery partner details.',
      details: err.message,
    });
  }
});

// =========================================================================
// 3. GET /api/admin/delivery-partners/:partnerId/orders
// =========================================================================
/**
 * Paginated list of orders associated with this partner from the existing `orders` collection.
 * Supports filtering by status: ALL, ACTIVE, DELIVERED, FAILED, RETURNED.
 * Strictly sanitizes OTP secrets, hashes, and internal POD private paths.
 */
adminDeliveryPartnerRouter.get('/:partnerId/orders', async (req: Request, res: Response) => {
  try {
    const { partnerId } = req.params;

    const partner = await resolvePartner(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        error: 'PARTNER_NOT_FOUND',
        message: `Delivery partner '${partnerId}' not found.`,
      });
    }

    const rawPageSize = req.query.pageSize !== undefined ? Number(req.query.pageSize) : 25;
    if (isNaN(rawPageSize) || rawPageSize < 1) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PAGE_SIZE',
        message: 'Page size must be a positive integer between 1 and 100.',
      });
    }
    if (rawPageSize > 100) {
      return res.status(400).json({
        success: false,
        error: 'PAGE_SIZE_EXCEEDED',
        message: 'Page size cannot exceed maximum limit of 100 items.',
      });
    }
    const pageSize = Math.min(Math.floor(rawPageSize), 100);

    const rawPage = req.query.page !== undefined ? Number(req.query.page) : 1;
    const page = isNaN(rawPage) || rawPage < 1 ? 1 : Math.floor(rawPage);

    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : 'ALL';

    const allOrders = await fetchAllAuthoritativeOrders();
    const partnerOrders = allOrders.filter(
      o => o.deliveryPartnerId === partnerId || o.delivery?.assignedPartnerId === partnerId
    );

    const filtered = partnerOrders.filter(o => {
      const orderStatus = (o.orderStatus || o.status || 'PLACED').toUpperCase();
      const assignmentStatus = (o.delivery?.assignmentStatus || '').toUpperCase();

      if (statusFilter === 'ALL') return true;
      if (statusFilter === 'ACTIVE') {
        return orderStatus !== 'DELIVERED' && orderStatus !== 'CANCELLED' && ACTIVE_DELIVERY_STATUSES.includes(assignmentStatus);
      }
      if (statusFilter === 'DELIVERED') {
        return assignmentStatus === 'DELIVERED' || orderStatus === 'DELIVERED';
      }
      if (statusFilter === 'FAILED') {
        return assignmentStatus === 'FAILED_DELIVERY' || orderStatus === 'FAILED_DELIVERY';
      }
      if (statusFilter === 'RETURNED') {
        return assignmentStatus === 'RETURN_TO_WAREHOUSE' || orderStatus === 'RETURNED' || orderStatus === 'RETURN_REQUESTED';
      }
      return true;
    });

    // Sort by latest createdAt
    filtered.sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const startIndex = (page - 1) * pageSize;
    const paginatedOrders = filtered.slice(startIndex, startIndex + pageSize).map(sanitizeOrderForAdminView);

    return res.status(200).json({
      success: true,
      orders: paginatedOrders,
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (err: any) {
    console.error('Error fetching partner orders:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve partner orders.',
      details: err.message,
    });
  }
});

// =========================================================================
// 4. GET /api/admin/delivery-partners/:partnerId/metrics
// =========================================================================
/**
 * Returns standalone server-derived performance metrics for a partner.
 */
adminDeliveryPartnerRouter.get('/:partnerId/metrics', async (req: Request, res: Response) => {
  try {
    const { partnerId } = req.params;
    const partner = await resolvePartner(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        error: 'PARTNER_NOT_FOUND',
        message: `Delivery partner '${partnerId}' not found.`,
      });
    }

    const allOrders = await fetchAllAuthoritativeOrders();
    const partnerOrders = allOrders.filter(
      o => o.deliveryPartnerId === partnerId || o.delivery?.assignedPartnerId === partnerId
    );

    const todayStr = new Date().toISOString().split('T')[0];

    let totalAssigned = partnerOrders.length;
    let activeOrders = 0;
    let deliveredOrders = 0;
    let failedDeliveries = 0;
    let returnedOrders = 0;
    let codPendingAmount = 0;
    let codCollectedAmount = 0;
    let todayDeliveriesCount = 0;
    let todayDeliveriesAmount = 0;

    const deliveryDurationsMinutes: number[] = [];
    const acceptanceDurationsMinutes: number[] = [];

    partnerOrders.forEach(o => {
      const orderStatus = (o.orderStatus || o.status || 'PLACED').toUpperCase();
      const assignmentStatus = (o.delivery?.assignmentStatus || '').toUpperCase();
      const grandTotal = Number(o.grandTotal ?? o.total ?? 0);
      const isCancelled = orderStatus === 'CANCELLED';

      if (isCancelled) return;

      if (orderStatus !== 'DELIVERED' && ACTIVE_DELIVERY_STATUSES.includes(assignmentStatus)) {
        activeOrders++;
      }

      if (assignmentStatus === 'DELIVERED' || orderStatus === 'DELIVERED') {
        deliveredOrders++;
        const deliveredDate = (o.delivery?.deliveredAt || o.deliveredAt || o.updatedAt || '').split('T')[0];
        if (deliveredDate === todayStr) {
          todayDeliveriesCount++;
          todayDeliveriesAmount += grandTotal;
        }

        const pickedUpTime = o.delivery?.pickedUpAt || o.delivery?.outForDeliveryAt || o.dispatchedAt;
        const deliveredTime = o.delivery?.deliveredAt || o.deliveredAt;
        if (pickedUpTime && deliveredTime) {
          const start = new Date(pickedUpTime).getTime();
          const end = new Date(deliveredTime).getTime();
          if (!isNaN(start) && !isNaN(end) && end > start) {
            deliveryDurationsMinutes.push((end - start) / (1000 * 60));
          }
        }
      } else if (assignmentStatus === 'FAILED_DELIVERY' || orderStatus === 'FAILED_DELIVERY') {
        failedDeliveries++;
      } else if (assignmentStatus === 'RETURN_TO_WAREHOUSE' || orderStatus === 'RETURNED' || orderStatus === 'RETURN_REQUESTED') {
        returnedOrders++;
      }

      const assignedTime = o.delivery?.assignedAt || o.deliveryAssignedAt;
      const acceptedTime = o.delivery?.acceptedAt;
      if (assignedTime && acceptedTime) {
        const start = new Date(assignedTime).getTime();
        const end = new Date(acceptedTime).getTime();
        if (!isNaN(start) && !isNaN(end) && end >= start) {
          acceptanceDurationsMinutes.push((end - start) / (1000 * 60));
        }
      }

      const payMethod = (o.paymentMethod || o.deliveryPayment?.method || '').toUpperCase();
      const collectionStatus = (o.deliveryPayment?.collectionStatus || (orderStatus === 'DELIVERED' ? 'COLLECTED' : 'PENDING')).toUpperCase();
      if (payMethod === 'COD') {
        if (collectionStatus === 'COLLECTED') {
          codCollectedAmount += grandTotal;
        } else if (orderStatus !== 'DELIVERED') {
          codPendingAmount += grandTotal;
        }
      }
    });

    const totalCompleted = deliveredOrders + failedDeliveries + returnedOrders;
    const completionRate = totalCompleted > 0 ? Math.round((deliveredOrders / totalCompleted) * 1000) / 10 : null;
    const completionRateDisplay = completionRate !== null ? `${completionRate}%` : 'Insufficient data';

    const averageDeliveryDurationMinutes = deliveryDurationsMinutes.length > 0
      ? Math.round(deliveryDurationsMinutes.reduce((a, b) => a + b, 0) / deliveryDurationsMinutes.length)
      : null;
    const averageDeliveryDurationDisplay = averageDeliveryDurationMinutes !== null
      ? `${averageDeliveryDurationMinutes} mins`
      : 'Insufficient data';

    const averageAcceptanceTimeMinutes = acceptanceDurationsMinutes.length > 0
      ? Math.round(acceptanceDurationsMinutes.reduce((a, b) => a + b, 0) / acceptanceDurationsMinutes.length)
      : null;
    const averageAcceptanceTimeDisplay = averageAcceptanceTimeMinutes !== null
      ? `${averageAcceptanceTimeMinutes} mins`
      : 'Insufficient data';

    return res.status(200).json({
      success: true,
      metrics: {
        partnerId,
        totalAssigned,
        activeOrders,
        deliveredOrders,
        failedDeliveries,
        returnedOrders,
        completionRate,
        completionRateDisplay,
        averageDeliveryDurationMinutes,
        averageDeliveryDurationDisplay,
        averageAcceptanceTimeMinutes,
        averageAcceptanceTimeDisplay,
        codPendingAmount,
        codCollectedAmount,
        todayDeliveriesCount,
        todayDeliveriesAmount,
      },
    });
  } catch (err: any) {
    console.error('Error fetching partner metrics:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve delivery metrics.',
      details: err.message,
    });
  }
});

// =========================================================================
// 5. GET /api/admin/delivery-partners/:partnerId/audit-logs
// =========================================================================
/**
 * Chronological immutable audit history for this partner.
 */
adminDeliveryPartnerRouter.get('/:partnerId/audit-logs', async (req: Request, res: Response) => {
  try {
    const { partnerId } = req.params;
    const partner = await resolvePartner(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        error: 'PARTNER_NOT_FOUND',
        message: `Delivery partner '${partnerId}' not found.`,
      });
    }

    const adminLogsSnap = await getDocs(
      query(
        collection(db, 'adminAuditLogs'),
        where('targetType', '==', 'DELIVERY_PARTNER'),
        where('targetId', '==', partnerId),
        limit(50)
      )
    );
    const deliveryLogsSnap = await getDocs(
      query(
        collection(db, 'deliveryAuditLogs'),
        where('partnerId', '==', partnerId),
        limit(50)
      )
    );

    const combined: any[] = [
      ...adminLogsSnap.docs.map(d => ({ source: 'ADMIN', ...d.data() })),
      ...deliveryLogsSnap.docs.map(d => ({ source: 'DELIVERY', ...d.data() })),
    ];

    combined.sort((a: any, b: any) => {
      const timeA = new Date(a.timestamp || 0).getTime();
      const timeB = new Date(b.timestamp || 0).getTime();
      return timeB - timeA;
    });

    return res.status(200).json({
      success: true,
      partnerId,
      auditLogs: combined.slice(0, 50),
      count: combined.length,
    });
  } catch (err: any) {
    console.error('Error fetching audit logs:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve audit logs.',
      details: err.message,
    });
  }
});

// =========================================================================
// 6. POST /api/admin/delivery-partners/:partnerId/activate
// =========================================================================
/**
 * Server-authoritative, idempotent delivery partner activation.
 * Super Admin restricted. Immutable audit logged.
 */
adminDeliveryPartnerRouter.post('/:partnerId/activate', async (req: Request, res: Response) => {
  try {
    const { partnerId } = req.params;
    const adminUser = (req as any).adminUser as AdminUser;
    const { reason } = req.body || {};

    const partner = await resolvePartner(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        error: 'PARTNER_NOT_FOUND',
        message: `Delivery partner '${partnerId}' not found.`,
      });
    }

    const dpRef = doc(db, 'deliveryPartners', partnerId);
    const currentSnap = await getDoc(dpRef);
    const now = new Date().toISOString();

    // Idempotency: Already active
    if (partner.status === 'ACTIVE' && currentSnap.exists() && currentSnap.data()?.status === 'ACTIVE') {
      return res.status(200).json({
        success: true,
        message: `Delivery partner '${partner.name}' is already active.`,
        partner,
        isNoOp: true,
      });
    }

    const updatePayload = {
      status: 'ACTIVE',
      availabilityStatus: 'AVAILABLE',
      updatedAt: now,
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    };

    if (currentSnap.exists()) {
      await updateDoc(dpRef, updatePayload);
    } else {
      // Seed if not yet stored as a persistent doc
      await setDoc(dpRef, {
        ...partner,
        ...updatePayload,
      });
    }

    const updatedPartner = {
      ...partner,
      status: 'ACTIVE' as const,
      availabilityStatus: 'AVAILABLE' as const,
      updatedAt: now,
    };

    // Record immutable audit log
    await logAdminAudit({
      action: 'DELIVERY_PARTNER_ACTIVATED',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'DELIVERY_PARTNER',
      targetId: partnerId,
      metadata: {
        partnerName: partner.name,
        previousStatus: partner.status,
        newStatus: 'ACTIVE',
        reason: reason || 'Activated via Super Admin Console',
      },
      req,
    });

    return res.status(200).json({
      success: true,
      message: `Delivery partner '${partner.name}' activated successfully.`,
      partner: updatedPartner,
    });
  } catch (err: any) {
    console.error('Error activating delivery partner:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to activate delivery partner.',
      details: err.message,
    });
  }
});

// =========================================================================
// 7. POST /api/admin/delivery-partners/:partnerId/deactivate
// =========================================================================
/**
 * Server-authoritative delivery partner deactivation.
 * SAFETY RULE: BLOCKS deactivation if partner has active assigned deliveries!
 * Does NOT delete partner or alter historical records.
 * Super Admin restricted. Immutable audit logged.
 */
adminDeliveryPartnerRouter.post('/:partnerId/deactivate', async (req: Request, res: Response) => {
  try {
    const { partnerId } = req.params;
    const adminUser = (req as any).adminUser as AdminUser;
    const { reason } = req.body || {};

    const partner = await resolvePartner(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        error: 'PARTNER_NOT_FOUND',
        message: `Delivery partner '${partnerId}' not found.`,
      });
    }

    // Safety Check: Check for active deliveries
    const allOrders = await fetchAllAuthoritativeOrders();
    const activeOrders = allOrders.filter(o => {
      const isAssigned = o.deliveryPartnerId === partnerId || o.delivery?.assignedPartnerId === partnerId;
      if (!isAssigned) return false;
      const orderStatus = (o.orderStatus || o.status || 'PLACED').toUpperCase();
      const assignmentStatus = (o.delivery?.assignmentStatus || '').toUpperCase();
      return orderStatus !== 'DELIVERED' && orderStatus !== 'CANCELLED' && ACTIVE_DELIVERY_STATUSES.includes(assignmentStatus);
    });

    if (activeOrders.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'ACTIVE_DELIVERIES_EXIST',
        message: `Cannot deactivate delivery partner '${partner.name}'. There are ${activeOrders.length} active delivery order(s) currently assigned. Please complete or reassign active orders before deactivation.`,
        activeOrdersCount: activeOrders.length,
      });
    }

    const dpRef = doc(db, 'deliveryPartners', partnerId);
    const currentSnap = await getDoc(dpRef);
    const now = new Date().toISOString();

    // Idempotency: Already inactive
    if (partner.status === 'INACTIVE' && currentSnap.exists() && currentSnap.data()?.status === 'INACTIVE') {
      return res.status(200).json({
        success: true,
        message: `Delivery partner '${partner.name}' is already inactive.`,
        partner,
        isNoOp: true,
      });
    }

    const updatePayload = {
      status: 'INACTIVE',
      availabilityStatus: 'OFFLINE',
      updatedAt: now,
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    };

    if (currentSnap.exists()) {
      await updateDoc(dpRef, updatePayload);
    } else {
      await setDoc(dpRef, {
        ...partner,
        ...updatePayload,
      });
    }

    const updatedPartner = {
      ...partner,
      status: 'INACTIVE' as const,
      availabilityStatus: 'OFFLINE' as const,
      updatedAt: now,
    };

    // Record immutable audit log
    await logAdminAudit({
      action: 'DELIVERY_PARTNER_DEACTIVATED',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'DELIVERY_PARTNER',
      targetId: partnerId,
      metadata: {
        partnerName: partner.name,
        previousStatus: partner.status,
        newStatus: 'INACTIVE',
        reason: reason || 'Deactivated via Super Admin Console',
      },
      req,
    });

    return res.status(200).json({
      success: true,
      message: `Delivery partner '${partner.name}' deactivated successfully.`,
      partner: updatedPartner,
    });
  } catch (err: any) {
    console.error('Error deactivating delivery partner:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to deactivate delivery partner.',
      details: err.message,
    });
  }
});

// =========================================================================
// 8. POST /api/admin/delivery-partners/:partnerId/suspend
// =========================================================================
/**
 * Server-authoritative delivery partner suspension.
 * SAFETY RULE: BLOCKS suspension if partner has active assigned deliveries!
 * Preserves historical orders, delivery history, and audit records.
 * Super Admin restricted. Immutable audit logged.
 */
adminDeliveryPartnerRouter.post('/:partnerId/suspend', async (req: Request, res: Response) => {
  try {
    const { partnerId } = req.params;
    const adminUser = (req as any).adminUser as AdminUser;
    const { reason } = req.body || {};

    const partner = await resolvePartner(partnerId);
    if (!partner) {
      return res.status(404).json({
        success: false,
        error: 'PARTNER_NOT_FOUND',
        message: `Delivery partner '${partnerId}' not found.`,
      });
    }

    // Safety Check: Check for active deliveries
    const allOrders = await fetchAllAuthoritativeOrders();
    const activeOrders = allOrders.filter(o => {
      const isAssigned = o.deliveryPartnerId === partnerId || o.delivery?.assignedPartnerId === partnerId;
      if (!isAssigned) return false;
      const orderStatus = (o.orderStatus || o.status || 'PLACED').toUpperCase();
      const assignmentStatus = (o.delivery?.assignmentStatus || '').toUpperCase();
      return orderStatus !== 'DELIVERED' && orderStatus !== 'CANCELLED' && ACTIVE_DELIVERY_STATUSES.includes(assignmentStatus);
    });

    if (activeOrders.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'ACTIVE_DELIVERIES_EXIST',
        message: `Cannot suspend delivery partner '${partner.name}'. There are ${activeOrders.length} active delivery order(s) currently assigned. Please complete or reassign active orders before suspension.`,
        activeOrdersCount: activeOrders.length,
      });
    }

    const dpRef = doc(db, 'deliveryPartners', partnerId);
    const currentSnap = await getDoc(dpRef);
    const now = new Date().toISOString();

    // Idempotency: Already suspended
    if (partner.status === 'SUSPENDED' && currentSnap.exists() && currentSnap.data()?.status === 'SUSPENDED') {
      return res.status(200).json({
        success: true,
        message: `Delivery partner '${partner.name}' is already suspended.`,
        partner,
        isNoOp: true,
      });
    }

    const updatePayload = {
      status: 'SUSPENDED',
      availabilityStatus: 'OFFLINE',
      updatedAt: now,
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    };

    if (currentSnap.exists()) {
      await updateDoc(dpRef, updatePayload);
    } else {
      await setDoc(dpRef, {
        ...partner,
        ...updatePayload,
      });
    }

    const updatedPartner = {
      ...partner,
      status: 'SUSPENDED' as const,
      availabilityStatus: 'OFFLINE' as const,
      updatedAt: now,
    };

    // Record immutable audit log
    await logAdminAudit({
      action: 'DELIVERY_PARTNER_SUSPENDED',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'DELIVERY_PARTNER',
      targetId: partnerId,
      metadata: {
        partnerName: partner.name,
        previousStatus: partner.status,
        newStatus: 'SUSPENDED',
        reason: reason || 'Suspended via Super Admin Console',
      },
      req,
    });

    return res.status(200).json({
      success: true,
      message: `Delivery partner '${partner.name}' suspended successfully.`,
      partner: updatedPartner,
    });
  } catch (err: any) {
    console.error('Error suspending delivery partner:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to suspend delivery partner.',
      details: err.message,
    });
  }
});
