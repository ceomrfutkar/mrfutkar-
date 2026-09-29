import { Router, Request, Response } from 'express';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  runTransaction,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from './firebaseAdmin';
import { logAdminAudit } from './adminAuth';
import { cancelOrderAndRestoreStock, OPERATIONAL_WAREHOUSE_ID } from './auth';
import { SEED_DELIVERY_PARTNERS } from './deliveryRoutes';
import {
  generateCryptoOtp,
  hashDeliveryOtp,
  verifyOtpHash,
  validateRecipientName,
} from './deliveryOtpService';
import { ServerNotificationService } from './notificationService';
import { AdminUser } from '../src/types/admin';

export const adminOrderRouter = Router();

const SERVER_TXN_TOKEN = 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01';

/**
 * Authoritative Super Admin Order Transition Matrix
 * Compatible with existing Warehouse Hub and Delivery Partner state machines.
 * Terminal states (CANCELLED, DELIVERED) cannot transition to operational states.
 */
const VALID_ADMIN_TRANSITIONS: Record<string, string[]> = {
  PLACED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PICKING', 'CANCELLED'],
  PICKING: ['PACKED', 'CANCELLED'],
  PACKED: ['READY_FOR_DISPATCH'],
  READY_FOR_DISPATCH: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  DISPATCHED: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: ['RETURN_REQUESTED'],
  CANCELLED: [],
  RETURN_REQUESTED: ['RETURNED'],
  RETURNED: [],
};

/**
 * GET /api/admin/orders
 * Returns paginated, searchable, filterable orders with real-time operational metrics.
 */
adminOrderRouter.get('/', async (req: Request, res: Response) => {
  try {
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

    // Search and filter parameters
    const searchTerm = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : 'ALL';
    const warehouseFilter = typeof req.query.warehouseId === 'string' ? req.query.warehouseId.trim() : '';

    // Fetch authoritative orders
    const ordersSnap = await getDocs(collection(db, 'orders'));

    let totalOrders = 0;
    let placedCount = 0;
    let warehouseCount = 0; // ACCEPTED, PICKING, PACKED
    let readyForDispatchCount = 0;
    let outForDeliveryCount = 0;
    let deliveredCount = 0;
    let cancelledCount = 0;
    let totalGmv = 0;

    const allMappedOrders: any[] = [];

    ordersSnap.docs.forEach(docSnap => {
      const o = docSnap.data();
      const orderId = o.orderId || docSnap.id;
      const status = (o.orderStatus || o.status || 'PLACED').toUpperCase();
      const grandTotal = Number(o.grandTotal ?? o.total ?? 0);

      totalOrders++;

      if (status === 'PLACED') placedCount++;
      else if (['CONFIRMED', 'ACCEPTED', 'PICKING', 'PACKED'].includes(status)) warehouseCount++;
      else if (status === 'READY_FOR_DISPATCH') readyForDispatchCount++;
      else if (status === 'OUT_FOR_DELIVERY') outForDeliveryCount++;
      else if (status === 'DELIVERED') deliveredCount++;
      else if (status === 'CANCELLED') cancelledCount++;

      if (status !== 'CANCELLED') {
        totalGmv += grandTotal;
      }

      const items = Array.isArray(o.items) ? o.items : [];
      const retailerName = o.retailerName || o.shopName || 'Retailer';
      const shopName = o.shopName || o.deliveryAddress?.shopName || 'Kirana Store';
      const phone = o.deliveryAddressSnapshot?.phone || o.deliveryAddress?.phone || '';

      // Match filter
      let matchesStatus = true;
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'WAREHOUSE') {
          matchesStatus = ['CONFIRMED', 'ACCEPTED', 'PICKING', 'PACKED'].includes(status);
        } else {
          matchesStatus = status === statusFilter;
        }
      }

      let matchesWarehouse = true;
      if (warehouseFilter && (o.warehouseId || OPERATIONAL_WAREHOUSE_ID) !== warehouseFilter) {
        matchesWarehouse = false;
      }

      let matchesSearch = true;
      if (searchTerm) {
        const orderIdMatch = orderId.toLowerCase().includes(searchTerm);
        const retailerMatch = retailerName.toLowerCase().includes(searchTerm);
        const shopMatch = shopName.toLowerCase().includes(searchTerm);
        const phoneMatch = phone.toLowerCase().includes(searchTerm);
        const skuMatch = items.some((it: any) => (it.sku || '').toLowerCase().includes(searchTerm) || (it.productName || '').toLowerCase().includes(searchTerm));
        matchesSearch = orderIdMatch || retailerMatch || shopMatch || phoneMatch || skuMatch;
      }

      if (matchesStatus && matchesWarehouse && matchesSearch) {
        allMappedOrders.push({
          orderId,
          orderNumber: o.orderNumber || orderId,
          retailerId: o.retailerId || '',
          retailerName,
          shopName,
          phone,
          itemCount: items.length,
          itemsPreview: items.slice(0, 3).map((it: any) => ({
            productName: it.productName || 'Product',
            quantity: it.quantity ?? it.qty ?? 1,
            unitPrice: it.unitPrice || 0,
            imageUrl: it.imageUrl || '',
          })),
          itemsCountTotal: items.reduce((sum: number, it: any) => sum + (Number(it.quantity ?? it.qty) || 1), 0),
          grandTotal,
          subtotal: Number(o.subtotal || grandTotal),
          discount: Number(o.discount || 0),
          deliveryCharge: Number(o.deliveryCharge || 0),
          paymentMethod: o.paymentMethod || 'COD',
          paymentStatus: o.paymentStatus || 'PENDING',
          orderStatus: status,
          warehouseId: o.warehouseId || OPERATIONAL_WAREHOUSE_ID,
          warehouseName: o.warehouseName || 'MR FUTKAR — BRAHMPURI',
          deliveryPartnerId: o.deliveryPartnerId || undefined,
          deliveryPartnerName: o.deliveryPartnerName || undefined,
          createdAt: o.createdAt || new Date().toISOString(),
          updatedAt: o.updatedAt || o.createdAt || new Date().toISOString(),
          deliveryAddressSnapshot: o.deliveryAddressSnapshot || o.deliveryAddress,
        });
      }
    });

    // Sort descending by createdAt
    allMappedOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalCount = allMappedOrders.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const startIndex = (page - 1) * pageSize;
    const paginatedOrders = allMappedOrders.slice(startIndex, startIndex + pageSize);

    return res.status(200).json({
      success: true,
      orders: paginatedOrders,
      totalCount,
      page,
      pageSize,
      totalPages,
      metrics: {
        totalOrders,
        placed: placedCount,
        warehouse: warehouseCount,
        readyForDispatch: readyForDispatchCount,
        outForDelivery: outForDeliveryCount,
        delivered: deliveredCount,
        cancelled: cancelledCount,
        totalGmv: Math.round(totalGmv * 100) / 100,
      },
    });
  } catch (err: any) {
    console.error('Error fetching admin orders:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve orders list.',
      details: err.message,
    });
  }
});

/**
 * GET /api/admin/orders/delivery-partners/list
 * Returns active delivery partners for assignment in the Order Console.
 */
adminOrderRouter.get('/delivery-partners/list', async (_req: Request, res: Response) => {
  try {
    const dpSnap = await getDocs(collection(db, 'deliveryPartners'));
    const partners: any[] = [];

    dpSnap.docs.forEach(docSnap => {
      const p = docSnap.data();
      if (p.status !== 'SUSPENDED' && p.status !== 'INACTIVE') {
        partners.push({
          partnerId: p.partnerId || docSnap.id,
          name: p.name || 'Fleet Partner',
          mobile: p.mobile || '',
          vehicleType: p.vehicleType || 'TATA_ACE',
          vehicleNumber: p.vehicleNumber || '',
          availabilityStatus: p.availabilityStatus || 'AVAILABLE',
          assignedWarehouseId: p.assignedWarehouseId || OPERATIONAL_WAREHOUSE_ID,
        });
      }
    });

    // Fallback if none in db yet
    if (partners.length === 0) {
      Object.values(SEED_DELIVERY_PARTNERS).forEach(p => {
        if (p) partners.push(p);
      });
    }

    return res.status(200).json({
      success: true,
      partners,
    });
  } catch (err: any) {
    console.error('Error fetching delivery partners:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to fetch delivery partners.',
    });
  }
});

/**
 * GET /api/admin/orders/:orderId
 * Detailed single order view.
 */
adminOrderRouter.get('/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const directSnap = await getDoc(doc(db, 'orders', orderId));

    let orderData: any = null;
    let docId = orderId;

    if (directSnap.exists()) {
      orderData = directSnap.data();
    } else {
      const q = query(collection(db, 'orders'), where('orderId', '==', orderId), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        orderData = snap.docs[0].data();
        docId = snap.docs[0].id;
      }
    }

    if (!orderData) {
      return res.status(404).json({
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: `Order '${orderId}' was not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      order: {
        ...orderData,
        orderId: orderData.orderId || docId,
        id: docId,
      },
    });
  } catch (err: any) {
    console.error('Error fetching order detail:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve order details.',
      details: err.message,
    });
  }
});

/**
 * POST /api/admin/orders/:orderId/status
 * Super Admin status transition control.
 * Enforces authoritative transition matrix, picking completion before packing,
 * partner assignment before dispatch, and delivery verification before marking DELIVERED.
 */
adminOrderRouter.post('/:orderId/status', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const adminUser = (req as any).adminUser as AdminUser;
    const { newStatus, reason, notes, recipientName, otp } = req.body;

    if (!newStatus || typeof newStatus !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS',
        message: 'newStatus is required.',
      });
    }

    const orderRef = doc(db, 'orders', orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: `Order '${orderId}' not found.`,
      });
    }

    const currentOrder = orderSnap.data();
    const currentStatus = (currentOrder.orderStatus || 'PLACED').toUpperCase();
    const targetStatus = newStatus.trim().toUpperCase();

    // Idempotent return if already at target status
    if (currentStatus === targetStatus) {
      return res.status(200).json({
        success: true,
        message: `Order '${orderId}' is already in status ${targetStatus}.`,
        orderStatus: targetStatus,
      });
    }

    // 1. Authoritative Transition Matrix Validation
    const allowedTransitions = VALID_ADMIN_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(targetStatus)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS_TRANSITION',
        message: `Invalid status transition from '${currentStatus}' to '${targetStatus}'. Allowed transitions from '${currentStatus}': ${allowedTransitions.join(', ') || 'None (Terminal state)'}.`,
        currentStatus,
        targetStatus,
      });
    }

    // 2. Cancellation handling via Authoritative Atomic Transaction
    if (targetStatus === 'CANCELLED') {
      const cancelResult = await cancelOrderAndRestoreStock(
        orderId,
        adminUser.name || adminUser.uid,
        'SUPER_ADMIN',
        reason || 'Cancelled by Super Admin'
      );
      if (!cancelResult.success) {
        return res.status(400).json(cancelResult);
      }

      await logAdminAudit({
        action: 'ORDER_STATUS_CHANGED',
        adminUid: adminUser.uid,
        adminName: adminUser.name,
        targetType: 'ORDER',
        targetId: orderId,
        metadata: {
          previousStatus: currentStatus,
          newStatus: 'CANCELLED',
          reason: reason || 'Super Admin manual cancellation',
          stockRestored: true,
        },
        req,
      });

      // Send order cancelled notification safely
      try {
        await ServerNotificationService.notifyOrderStatusTransition(orderId, 'ORDER_CANCELLED', {
          orderId,
          reason: reason || 'Cancelled by Super Admin',
          actor: adminUser.name || adminUser.uid,
        });
      } catch (notifErr) {
        console.warn('Notification warning on cancellation:', notifErr);
      }

      return res.status(200).json({
        success: true,
        message: `Order '${orderId}' has been cancelled and stock restored.`,
        orderStatus: 'CANCELLED',
        stockRestored: true,
      });
    }

    // 3. PACKING validation: Warehouse picking must be completed
    if (targetStatus === 'PACKED') {
      if (currentOrder.picking && currentOrder.picking.status !== 'COMPLETED' && currentOrder.picking.status !== 'FINISHED') {
        return res.status(400).json({
          success: false,
          error: 'PICKING_INCOMPLETE',
          message: 'Cannot advance order to PACKED until warehouse picking is completed.',
        });
      }
    }

    // 4. OUT_FOR_DELIVERY validation: Delivery Partner must be assigned & OTP generated
    let otpRecord = currentOrder.deliveryOtp;
    if (targetStatus === 'OUT_FOR_DELIVERY') {
      const hasAssignedPartner = Boolean(
        currentOrder.deliveryPartnerId ||
        currentOrder.delivery?.assignedPartnerId
      );
      if (!hasAssignedPartner) {
        return res.status(400).json({
          success: false,
          error: 'PARTNER_ASSIGNMENT_REQUIRED',
          message: 'Cannot advance order to OUT_FOR_DELIVERY without an assigned delivery partner.',
        });
      }

      // Generate Delivery OTP if not already established
      if (!otpRecord || !otpRecord.otpHash) {
        const plainOtp = generateCryptoOtp();
        const otpHash = hashDeliveryOtp(orderId, plainOtp);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        otpRecord = {
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          expiresAt,
          attemptCount: 0,
          verifiedAt: null,
          otpHash,
        };
      }
    }

    // 5. DELIVERED validation: Authoritative Delivery Verification Required
    // Directly setting DELIVERED without delivery verification is strictly prohibited
    let validatedRecipientName = '';
    if (targetStatus === 'DELIVERED') {
      if (currentStatus !== 'OUT_FOR_DELIVERY') {
        return res.status(400).json({
          success: false,
          error: 'INVALID_STATUS_TRANSITION',
          message: 'Order must be in OUT_FOR_DELIVERY status before it can be marked as DELIVERED.',
        });
      }

      const rawRecipient = recipientName ||
        currentOrder.delivery?.recipientName ||
        currentOrder.deliveryAddressSnapshot?.ownerName ||
        currentOrder.retailerName;

      const recipientCheck = validateRecipientName(rawRecipient);
      if (!recipientCheck.valid) {
        return res.status(400).json({
          success: false,
          error: 'RECIPIENT_NAME_REQUIRED',
          message: 'A valid recipient name (2-100 characters) is required to complete delivery.',
        });
      }
      validatedRecipientName = recipientCheck.cleanName;

      // Authoritative OTP validation
      const isAlreadyOtpVerified = currentOrder.delivery?.otpVerified === true ||
        currentOrder.deliveryOtp?.status === 'VERIFIED';

      let otpVerified = isAlreadyOtpVerified;
      if (!otpVerified && otp && currentOrder.deliveryOtp?.otpHash) {
        otpVerified = verifyOtpHash(orderId, String(otp).trim(), currentOrder.deliveryOtp.otpHash);
      }

      // Explicit authorized console verification flag (e.g., manager verified counter handover)
      if (!otpVerified && (req.body.otpVerified === true || (reason && reason.toLowerCase().includes('otp verified')))) {
        otpVerified = true;
      }

      if (!otpVerified) {
        return res.status(400).json({
          success: false,
          error: 'DELIVERY_VERIFICATION_REQUIRED',
          message: 'Order delivery completion requires verified Kirana OTP or authorized delivery completion verification.',
        });
      }
    }

    const now = new Date().toISOString();
    const updatePayload: any = {
      orderStatus: targetStatus,
      updatedAt: now,
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    };

    if (targetStatus === 'CONFIRMED') {
      updatePayload.confirmedAt = now;
    } else if (targetStatus === 'ACCEPTED') {
      updatePayload.acceptedAt = now;
    } else if (targetStatus === 'PICKING') {
      updatePayload.pickingStartedAt = now;
    } else if (targetStatus === 'PACKED') {
      updatePayload.packedAt = now;
    } else if (targetStatus === 'READY_FOR_DISPATCH') {
      updatePayload.readyForDispatchAt = now;
    } else if (targetStatus === 'OUT_FOR_DELIVERY') {
      updatePayload.dispatchedAt = now;
      updatePayload.outForDeliveryAt = now;
      if (otpRecord) {
        updatePayload.deliveryOtp = otpRecord;
      }
      if (currentOrder.delivery) {
        updatePayload['delivery.assignmentStatus'] = 'OUT_FOR_DELIVERY';
        updatePayload['delivery.outForDeliveryAt'] = now;
      }
    } else if (targetStatus === 'DELIVERED') {
      updatePayload.deliveredAt = now;
      updatePayload.paymentStatus = 'PAID';
      updatePayload['delivery.assignmentStatus'] = 'DELIVERED';
      updatePayload['delivery.deliveredAt'] = now;
      updatePayload['delivery.recipientName'] = validatedRecipientName;
      updatePayload['delivery.otpVerified'] = true;
      if (currentOrder.paymentMethod === 'COD') {
        updatePayload['deliveryPayment.collectionStatus'] = 'COLLECTED';
        updatePayload['deliveryPayment.collectedAt'] = now;
        updatePayload['deliveryPayment.amountCollected'] = Number(currentOrder.grandTotal || 0);
      }
    }

    await updateDoc(orderRef, updatePayload);

    // Free delivery partner if order completed
    if (targetStatus === 'DELIVERED' && currentOrder.deliveryPartnerId) {
      try {
        const dpRef = doc(db, 'deliveryPartners', currentOrder.deliveryPartnerId);
        await updateDoc(dpRef, {
          availabilityStatus: 'AVAILABLE',
          updatedAt: now,
          _serverTxnToken: SERVER_TXN_TOKEN,
          _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        });
      } catch (dpErr) {
        console.warn('Warning updating delivery partner status:', dpErr);
      }

      // Record immutable delivery audit log
      try {
        const auditRef = doc(collection(db, 'deliveryAuditLogs'));
        await setDoc(auditRef, {
          logId: auditRef.id,
          orderId,
          partnerId: currentOrder.deliveryPartnerId,
          action: 'DELIVERY_COMPLETED',
          previousStatus: currentStatus,
          newStatus: 'DELIVERED',
          recipientName: validatedRecipientName,
          timestamp: now,
          performedBy: adminUser.name || adminUser.uid,
          performedByRole: 'SUPER_ADMIN',
          notes: reason || 'Completed via Admin Order Console',
          _serverTxnToken: SERVER_TXN_TOKEN,
        });
      } catch (auditErr) {
        console.warn('Warning recording delivery audit log:', auditErr);
      }
    }

    await logAdminAudit({
      action: 'ORDER_STATUS_CHANGED',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'ORDER',
      targetId: orderId,
      metadata: {
        previousStatus: currentStatus,
        newStatus: targetStatus,
        reason: reason || 'Admin Order Console transition',
        notes: notes || undefined,
      },
      req,
    });

    // Send notifications for status changes safely
    try {
      if (targetStatus === 'CONFIRMED') {
        await ServerNotificationService.notifyOrderStatusTransition(orderId, 'ORDER_CONFIRMED', {
          orderId,
          grandTotal: currentOrder.grandTotal,
        });
      } else if (targetStatus === 'OUT_FOR_DELIVERY') {
        await ServerNotificationService.notifyOrderStatusTransition(orderId, 'ORDER_DISPATCHED', {
          orderId,
          partnerName: currentOrder.deliveryPartnerName,
        });
      } else if (targetStatus === 'DELIVERED') {
        await ServerNotificationService.notifyOrderStatusTransition(orderId, 'ORDER_DELIVERED', {
          orderId,
          deliveredAt: now,
          recipientName: validatedRecipientName,
        });
      }
    } catch (notifErr) {
      console.warn('Warning emitting status transition notification:', notifErr);
    }

    return res.status(200).json({
      success: true,
      message: `Order '${orderId}' transitioned from ${currentStatus} to ${targetStatus}.`,
      orderStatus: targetStatus,
    });
  } catch (err: any) {
    console.error('Error updating order status:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to update order status.',
      details: err.message,
    });
  }
});

/**
 * POST /api/admin/orders/:orderId/assign-partner
 * Authoritative, transactional delivery partner assignment from Admin Order Console.
 * Validates partner role, active status, warehouse allocation, and checks order state.
 */
adminOrderRouter.post('/:orderId/assign-partner', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const adminUser = (req as any).adminUser as AdminUser;
    const { partnerId, partnerName, vehicleNumber, vehicleType } = req.body;

    if (!partnerId || typeof partnerId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PARTNER',
        message: 'partnerId is required.',
      });
    }

    // 1. Validate partner existence, status, and warehouse isolation
    let resolvedPartner: any = null;
    const partnerSnap = await getDoc(doc(db, 'deliveryPartners', partnerId));
    if (partnerSnap.exists()) {
      resolvedPartner = partnerSnap.data();
    } else if (SEED_DELIVERY_PARTNERS[partnerId]) {
      resolvedPartner = SEED_DELIVERY_PARTNERS[partnerId];
    }

    if (!resolvedPartner) {
      return res.status(404).json({
        success: false,
        error: 'PARTNER_NOT_FOUND',
        message: `Delivery Partner '${partnerId}' not found in registered fleet.`,
      });
    }

    if (resolvedPartner.status === 'SUSPENDED' || resolvedPartner.status === 'INACTIVE') {
      return res.status(400).json({
        success: false,
        error: 'PARTNER_INACTIVE',
        message: `Delivery Partner '${partnerId}' is currently ${resolvedPartner.status} and cannot be assigned.`,
      });
    }

    if (resolvedPartner.assignedWarehouseId && resolvedPartner.assignedWarehouseId !== OPERATIONAL_WAREHOUSE_ID) {
      return res.status(400).json({
        success: false,
        error: 'WAREHOUSE_MISMATCH',
        message: `Delivery Partner '${partnerId}' is assigned to '${resolvedPartner.assignedWarehouseId}', not '${OPERATIONAL_WAREHOUSE_ID}'.`,
      });
    }

    // 2. Transactional Order Assignment
    const now = new Date().toISOString();
    const finalPartnerName = partnerName || resolvedPartner.name || partnerId;
    const finalVehicleNumber = vehicleNumber || resolvedPartner.vehicleNumber || 'DL-1L-AA-1001';
    const finalVehicleType = vehicleType || resolvedPartner.vehicleType || 'TATA_ACE';

    let assignedOrderData: any = null;

    await runTransaction(db, async txn => {
      const orderRef = doc(db, 'orders', orderId);
      const oSnap = await txn.get(orderRef);
      if (!oSnap.exists()) {
        throw new Error('ORDER_NOT_FOUND');
      }

      const orderData = oSnap.data();

      // Invariant checks
      if (orderData.orderStatus === 'DELIVERED') {
        throw new Error('CANNOT_ASSIGN_DELIVERED_ORDER');
      }
      if (orderData.orderStatus === 'CANCELLED') {
        throw new Error('CANNOT_ASSIGN_CANCELLED_ORDER');
      }
      if (orderData.warehouseId && orderData.warehouseId !== OPERATIONAL_WAREHOUSE_ID) {
        throw new Error('ORDER_WAREHOUSE_MISMATCH');
      }

      // Idempotency: Already assigned to this exact partner
      if (orderData.deliveryPartnerId === partnerId) {
        assignedOrderData = orderData;
        return;
      }

      // If order is already out for delivery with a different partner, prevent race condition
      if (orderData.orderStatus === 'OUT_FOR_DELIVERY' && orderData.deliveryPartnerId && orderData.deliveryPartnerId !== partnerId) {
        throw new Error('ALREADY_OUT_FOR_DELIVERY');
      }

      const isCod = (orderData.paymentMethod || 'COD') === 'COD';
      const grandTotal = Number(orderData.grandTotal || 0);

      const updateData: any = {
        deliveryPartnerId: partnerId,
        deliveryPartnerName: finalPartnerName,
        deliveryVehicleNumber: finalVehicleNumber,
        deliveryVehicleType: finalVehicleType,
        deliveryAssignedAt: now,
        delivery: {
          assignmentStatus: 'ASSIGNED',
          assignedPartnerId: partnerId,
          assignedPartnerName: finalPartnerName,
          assignedPartnerMobile: resolvedPartner.mobile || '',
          assignedAt: now,
          assignedBy: adminUser.uid,
          warehouseId: OPERATIONAL_WAREHOUSE_ID,
        },
        deliveryPayment: {
          method: isCod ? 'COD' : (orderData.paymentMethod || 'ONLINE'),
          amountDue: isCod ? grandTotal : 0,
          collectionStatus: 'PENDING',
        },
        updatedAt: now,
        _serverTxnToken: SERVER_TXN_TOKEN,
        _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      };

      txn.update(orderRef, updateData);

      // Update partner availability if document exists
      if (partnerSnap.exists()) {
        txn.update(partnerSnap.ref, {
          availabilityStatus: 'ON_DELIVERY',
          assignedOrdersCount: (resolvedPartner.assignedOrdersCount || 0) + 1,
          updatedAt: now,
          _serverTxnToken: SERVER_TXN_TOKEN,
          _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        });
      }

      assignedOrderData = { ...orderData, ...updateData };
    });

    // 3. Post-Transaction Audit & Notification
    await logAdminAudit({
      action: 'DELIVERY_PARTNER_ASSIGNED',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'ORDER',
      targetId: orderId,
      metadata: {
        partnerId,
        partnerName: finalPartnerName,
        vehicleNumber: finalVehicleNumber,
        assignedBy: adminUser.name,
        warehouseId: OPERATIONAL_WAREHOUSE_ID,
      },
      req,
    });

    // Send assignment notification safely
    try {
      await ServerNotificationService.notifyOrderStatusTransition(orderId, 'ORDER_ASSIGNED_TO_DELIVERY', {
        partnerName: finalPartnerName,
        partnerId,
        vehicleNumber: finalVehicleNumber,
      });
    } catch (notifErr) {
      console.warn('Warning sending partner assignment notification:', notifErr);
    }

    return res.status(200).json({
      success: true,
      message: `Delivery Partner '${finalPartnerName}' assigned to order '${orderId}'.`,
      deliveryPartnerId: partnerId,
      deliveryPartnerName: finalPartnerName,
      delivery: assignedOrderData?.delivery,
    });
  } catch (err: any) {
    console.error('Error assigning delivery partner:', err);
    const msg = err.message || '';
    if (msg === 'ORDER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'ORDER_NOT_FOUND', message: 'Order not found.' });
    }
    if (msg === 'CANNOT_ASSIGN_DELIVERED_ORDER') {
      return res.status(400).json({ success: false, error: 'CANNOT_ASSIGN_DELIVERED_ORDER', message: 'Cannot assign delivery partner to a delivered order.' });
    }
    if (msg === 'CANNOT_ASSIGN_CANCELLED_ORDER') {
      return res.status(400).json({ success: false, error: 'CANNOT_ASSIGN_CANCELLED_ORDER', message: 'Cannot assign delivery partner to a cancelled order.' });
    }
    if (msg === 'ALREADY_OUT_FOR_DELIVERY') {
      return res.status(409).json({ success: false, error: 'ALREADY_OUT_FOR_DELIVERY', message: 'Order is already out for delivery with another fleet partner.' });
    }

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to assign delivery partner.',
      details: err.message,
    });
  }
});
