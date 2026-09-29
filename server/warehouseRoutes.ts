import express, { Request, Response } from 'express';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  runTransaction,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, adminAuth } from './firebaseAdmin';
import cfg from '../firebase-applet-config.json';
import { WarehouseRole } from './auth';
import {
  WarehouseOrderStatus,
  StockAdjustmentReason,
  ALLOWED_ADJUSTMENT_REASONS,
  ReturnStatus,
  InspectionStatus,
} from '../src/types/warehouse';
import {
  requireWarehouseRole,
  cancelOrderAndRestoreStock,
  OPERATIONAL_WAREHOUSE_ID,
  OPERATIONAL_WAREHOUSE_NAME,
  OPERATIONAL_BRANCH_NAME,
} from './auth';
import { ServerNotificationService } from './notificationService';
import {
  listWarehouseHandovers,
  getWarehouseCashCustody,
  acceptCodHandover,
  rejectCodHandover,
} from './codHandoverService';
import { AccountingBalanceService } from './accountingBalanceService';
import { WarehouseBillService } from './warehouseBillService';
import { InvoiceService } from './invoiceService';
import { InvoiceDocumentService } from './invoiceDocumentService';

export const warehouseRouter = express.Router();

/**
 * POST /api/warehouse/claim-staff
 * Authenticates a valid Firebase ID Token and securely claims/links a WH-BRAHMPURI-01 staff slot.
 * Ensures the user has a real Firebase UID, ID token, and updates warehouseUsers/{uid} in Firestore.
 */
warehouseRouter.post('/claim-staff', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Valid Firebase Authorization Bearer token is required.',
    });
  }

  const token = authHeader.substring(7).trim();
  let uid = '';
  let tokenEmail = '';

  const appEnv = process.env.APP_ENV?.toLowerCase();
  const isTestAuthEnabled = String(process.env.ENABLE_TEST_AUTH).toLowerCase() === 'true' || process.env.ENABLE_TEST_AUTH === '1';

  if (token.startsWith('test-uid-')) {
    if (!appEnv || appEnv === 'production' || !isTestAuthEnabled) {
      return res.status(401).json({ success: false, error: 'TEST_AUTH_FORBIDDEN' });
    }
    uid = token.replace('test-uid-', '').trim();
  } else {
    try {
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        uid = decoded.uid;
        tokenEmail = decoded.email || '';
      } catch {
        const lookupUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${cfg.apiKey}`;
        const resp = await fetch(lookupUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: token }),
        });
        const data = await resp.json();
        if (resp.ok && data.users && data.users.length > 0) {
          uid = data.users[0].localId;
          tokenEmail = data.users[0].email || '';
        } else {
          return res.status(401).json({ success: false, error: 'INVALID_TOKEN' });
        }
      }
    } catch {
      return res.status(401).json({ success: false, error: 'TOKEN_VERIFICATION_FAILED' });
    }
  }

  if (!uid) {
    return res.status(401).json({ success: false, error: 'INVALID_UID' });
  }

  const { staffId } = req.body;
  const validStaffSlots: Record<string, { role: WarehouseRole; name: string; email: string }> = {
    'WH-ADMIN-01': { role: 'WAREHOUSE_ADMIN', name: 'Akash Gupta (Hub In-charge)', email: 'akash@mrfutkar.in' },
    'WH-MGR-01': { role: 'WAREHOUSE_MANAGER', name: 'Rahul Verma (Warehouse Manager)', email: 'rahul@mrfutkar.in' },
    'WH-STAFF-01': { role: 'WAREHOUSE_STAFF', name: 'Sonu Kumar (Picking & Packing Staff)', email: 'sonu@mrfutkar.in' },
  };

  const slot = validStaffSlots[staffId];
  if (!slot) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_STAFF_ID',
      message: 'Invalid staff slot. Must be one of [WH-ADMIN-01, WH-MGR-01, WH-STAFF-01].',
    });
  }

  const now = new Date().toISOString();
  const staffRecord = {
    userId: staffId,
    firebaseUid: uid,
    name: slot.name,
    email: tokenEmail || slot.email,
    role: slot.role,
    warehouseId: OPERATIONAL_WAREHOUSE_ID,
    warehouseName: OPERATIONAL_WAREHOUSE_NAME,
    branchName: OPERATIONAL_BRANCH_NAME,
    isActive: true,
    updatedAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  };

  await setDoc(doc(db, 'warehouseUsers', uid), staffRecord, { merge: true });
  await setDoc(doc(db, 'warehouseUsers', staffId), { ...staffRecord, firebaseUid: uid }, { merge: true });

  return res.status(200).json({
    success: true,
    uid,
    role: slot.role,
    name: slot.name,
    email: tokenEmail || slot.email,
    warehouseId: OPERATIONAL_WAREHOUSE_ID,
    warehouseName: OPERATIONAL_WAREHOUSE_NAME,
    branchName: OPERATIONAL_BRANCH_NAME,
  });
});

// 1. Authoritative Warehouse Authentication & Role Boundary Middleware
warehouseRouter.use(requireWarehouseRole());

// 2. Authoritative Warehouse Isolation Middleware (Only WH-BRAHMPURI-01 is operational)
warehouseRouter.use((req: Request, res: Response, next) => {
  const queryWh = req.query.warehouseId as string | undefined;
  const bodyWh = req.body?.warehouseId as string | undefined;

  if (queryWh && queryWh !== OPERATIONAL_WAREHOUSE_ID) {
    return res.status(403).json({
      success: false,
      error: 'UNAUTHORIZED_WAREHOUSE',
      message: `Invalid warehouse '${queryWh}'. MR FUTKAR operates exclusively through ${OPERATIONAL_WAREHOUSE_ID}.`,
    });
  }

  if (bodyWh && bodyWh !== OPERATIONAL_WAREHOUSE_ID) {
    return res.status(403).json({
      success: false,
      error: 'UNAUTHORIZED_WAREHOUSE',
      message: `Invalid warehouse '${bodyWh}'. MR FUTKAR operates exclusively through ${OPERATIONAL_WAREHOUSE_ID}.`,
    });
  }

  next();
});

// Strict state transition machine for warehouse orders
export const VALID_ORDER_TRANSITIONS: Record<WarehouseOrderStatus, WarehouseOrderStatus[]> = {
  PLACED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PICKING', 'CANCELLED'],
  PICKING: ['PACKED', 'CANCELLED'],
  PACKED: ['READY_FOR_DISPATCH'],
  READY_FOR_DISPATCH: ['DISPATCHED'],
  DISPATCHED: ['DELIVERED', 'RETURN_REQUESTED'],
  DELIVERED: ['RETURN_REQUESTED'],
  CANCELLED: [],
  RETURN_REQUESTED: ['RETURNED'],
  RETURNED: [],
};

// In-memory audit & return buffers to ensure 100% resilient fallback against transient network hiccups
const inMemoryMovements: any[] = [];
const inMemoryReturns: any[] = [];

/**
 * GET /api/warehouse/session
 * Server-authoritative session resolution for authenticated warehouse users.
 * Protected by requireWarehouseRole():
 * - Returns 401 UNAUTHORIZED if no/invalid token
 * - Returns 403 FORBIDDEN if caller has RETAILER role
 * - Returns 403 UNAUTHORIZED_WAREHOUSE if assigned warehouse is not WH-BRAHMPURI-01
 * - Returns 200 OK with server-validated identity if role is WAREHOUSE_STAFF, WAREHOUSE_MANAGER, or WAREHOUSE_ADMIN
 */
warehouseRouter.get('/session', async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  return res.status(200).json({
    success: true,
    uid: user.uid,
    role: user.role,
    name: user.name || 'Warehouse Staff',
    email: user.email || '',
    warehouseId: OPERATIONAL_WAREHOUSE_ID,
    warehouseName: OPERATIONAL_WAREHOUSE_NAME,
    branchName: OPERATIONAL_BRANCH_NAME,
  });
});

/**
 * GET /api/warehouse/metrics
 * Computes live operational dashboard metrics for WH-BRAHMPURI-01
 */
warehouseRouter.get('/metrics', async (req: Request, res: Response) => {
  try {
    const ordersSnap = await getDocs(
      query(collection(db, 'orders'), where('warehouseId', '==', OPERATIONAL_WAREHOUSE_ID))
    );

    const todayStr = new Date().toISOString().split('T')[0];
    let todaysOrdersCount = 0;
    let newOrdersCount = 0;
    let ordersToAcceptCount = 0;
    let ordersBeingPickedCount = 0;
    let ordersPackedCount = 0;
    let ordersReadyForDispatchCount = 0;
    let dispatchedOrdersCount = 0;
    let deliveredOrdersCount = 0;
    let cancelledOrdersCount = 0;
    let todaysSalesAmount = 0;
    let pendingFulfillmentValue = 0;

    ordersSnap.docs.forEach(docSnap => {
      const order = docSnap.data();
      const status: WarehouseOrderStatus = order.orderStatus || 'PLACED';
      const createdDate = (order.createdAt || '').split('T')[0];
      const grandTotal = Number(order.grandTotal) || 0;

      if (createdDate === todayStr) {
        todaysOrdersCount++;
        if (status !== 'CANCELLED') {
          todaysSalesAmount += grandTotal;
        }
      }

      switch (status) {
        case 'PLACED':
          newOrdersCount++;
          pendingFulfillmentValue += grandTotal;
          break;
        case 'CONFIRMED':
          ordersToAcceptCount++;
          pendingFulfillmentValue += grandTotal;
          break;
        case 'ACCEPTED':
        case 'PICKING':
          ordersBeingPickedCount++;
          pendingFulfillmentValue += grandTotal;
          break;
        case 'PACKED':
          ordersPackedCount++;
          pendingFulfillmentValue += grandTotal;
          break;
        case 'READY_FOR_DISPATCH':
          ordersReadyForDispatchCount++;
          pendingFulfillmentValue += grandTotal;
          break;
        case 'DISPATCHED':
          dispatchedOrdersCount++;
          break;
        case 'DELIVERED':
          deliveredOrdersCount++;
          break;
        case 'CANCELLED':
          cancelledOrdersCount++;
          break;
      }
    });

    // Compute Low Stock alerts for active products
    const prodSnap = await getDocs(
      query(collection(db, 'products'), where('warehouseId', '==', OPERATIONAL_WAREHOUSE_ID))
    );

    let lowStockAlertsCount = 0;
    prodSnap.docs.forEach(docSnap => {
      const p = docSnap.data();
      if (p.isActive !== false) {
        const stock = Number(p.stockQuantity) || 0;
        const threshold = Number(p.lowStockThreshold) || 20;
        if (stock <= threshold) {
          lowStockAlertsCount++;
        }
      }
    });

    return res.status(200).json({
      success: true,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      warehouseName: OPERATIONAL_WAREHOUSE_NAME,
      branchName: OPERATIONAL_BRANCH_NAME,
      metrics: {
        todaysOrdersCount,
        newOrdersCount,
        ordersToAcceptCount,
        ordersBeingPickedCount,
        ordersPackedCount,
        ordersReadyForDispatchCount,
        dispatchedOrdersCount,
        deliveredOrdersCount,
        cancelledOrdersCount,
        todaysSalesAmount: Math.round(todaysSalesAmount * 100) / 100,
        pendingFulfillmentValue: Math.round(pendingFulfillmentValue * 100) / 100,
        lowStockAlertsCount,
      },
    });
  } catch (err: any) {
    console.error('Error fetching warehouse metrics:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/warehouse/orders
 * Filterable orders for WH-BRAHMPURI-01
 */
warehouseRouter.get('/orders', async (req: Request, res: Response) => {
  try {
    const { status, paymentStatus, deliveryArea, search, date } = req.query;

    const ordersSnap = await getDocs(
      query(collection(db, 'orders'), where('warehouseId', '==', OPERATIONAL_WAREHOUSE_ID))
    );

    let orders = ordersSnap.docs.map(d => ({ orderId: d.id, ...d.data() })) as any[];

    // In-memory filtration
    if (status && typeof status === 'string' && status !== 'ALL') {
      orders = orders.filter(o => o.orderStatus === status);
    }

    if (paymentStatus && typeof paymentStatus === 'string' && paymentStatus !== 'ALL') {
      orders = orders.filter(o => o.paymentStatus === paymentStatus);
    }

    if (date && typeof date === 'string') {
      orders = orders.filter(o => (o.createdAt || '').startsWith(date));
    }

    if (deliveryArea && typeof deliveryArea === 'string' && deliveryArea !== 'ALL') {
      const areaLower = deliveryArea.toLowerCase();
      orders = orders.filter(o => {
        const fullAddr = (o.deliveryAddress?.fullAddress || '').toLowerCase();
        const city = (o.deliveryAddress?.city || '').toLowerCase();
        return fullAddr.includes(areaLower) || city.includes(areaLower);
      });
    }

    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim().toLowerCase();
      orders = orders.filter(o => {
        const idMatch = (o.orderId || '').toLowerCase().includes(term);
        const nameMatch = (o.retailerName || '').toLowerCase().includes(term);
        const shopMatch = (o.shopName || '').toLowerCase().includes(term);
        const phoneMatch = (o.deliveryAddress?.phone || '').includes(term);
        const itemMatch = (o.items || []).some(
          (i: any) =>
            (i.productName || '').toLowerCase().includes(term) ||
            (i.sku || '').toLowerCase().includes(term) ||
            (i.brandName || '').toLowerCase().includes(term)
        );
        return idMatch || nameMatch || shopMatch || phoneMatch || itemMatch;
      });
    }

    // Sort descending by createdAt
    orders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    return res.status(200).json({
      success: true,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      count: orders.length,
      orders,
    });
  } catch (err: any) {
    console.error('Error fetching warehouse orders:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/warehouse/orders/:orderId
 * Authoritative order details for WH-BRAHMPURI-01
 */
warehouseRouter.get('/orders/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const orderDoc = await getDoc(doc(db, 'orders', orderId));

    if (!orderDoc.exists()) {
      return res.status(404).json({ success: false, error: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }

    const orderData = orderDoc.data();
    if (orderData.warehouseId !== OPERATIONAL_WAREHOUSE_ID) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'This order belongs to a different warehouse partition.',
      });
    }

    // Attach live product stock info for picking guidance without modifying historic unit prices
    const enrichedItems = await Promise.all(
      (orderData.items || []).map(async (item: any) => {
        let currentStock = 0;
        try {
          const pDoc = await getDoc(doc(db, 'products', item.productId));
          if (pDoc.exists()) {
            currentStock = Number(pDoc.data().stockQuantity) || 0;
          }
        } catch {
          // ignore
        }

        const unitPrice = Number(item.unitPrice) || 0;
        const mrp = Number(item.mrp) || unitPrice * 1.15;
        const marginPercent = mrp > 0 ? Math.round(((mrp - unitPrice) / mrp) * 100) : 0;

        return {
          ...item,
          availableStock: currentStock,
          mrp,
          marginPercent,
        };
      })
    );

    return res.status(200).json({
      success: true,
      order: {
        orderId: orderDoc.id,
        ...orderData,
        items: enrichedItems,
      },
    });
  } catch (err: any) {
    console.error('Error fetching order detail:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/warehouse/orders/:orderId/status
 * Execute valid state transition
 */
warehouseRouter.post('/orders/:orderId/status', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { newStatus, reason, userId, userName } = req.body;

    if (!newStatus) {
      return res.status(400).json({ success: false, error: 'MISSING_STATUS', message: 'New status is required' });
    }

    const orderRef = doc(db, 'orders', orderId);
    const orderDoc = await getDoc(orderRef);

    if (!orderDoc.exists()) {
      return res.status(404).json({ success: false, error: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }

    const orderData = orderDoc.data();
    if (orderData.warehouseId !== OPERATIONAL_WAREHOUSE_ID) {
      return res.status(403).json({ success: false, error: 'UNAUTHORIZED_WAREHOUSE' });
    }

    const currentStatus: WarehouseOrderStatus = orderData.orderStatus || 'PLACED';
    const allowedTransitions = VALID_ORDER_TRANSITIONS[currentStatus] || [];

    if (!allowedTransitions.includes(newStatus as WarehouseOrderStatus)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition order from ${currentStatus} to ${newStatus}. Valid transitions are: ${allowedTransitions.join(', ') || 'None (Terminal status)'}`,
      });
    }

    // Special validation: moving to PACKED requires picking to be completed!
    if (newStatus === 'PACKED') {
      const pickingStatus = orderData.picking?.status;
      if (pickingStatus !== 'COMPLETED') {
        return res.status(400).json({
          success: false,
          error: 'PICKING_INCOMPLETE',
          message: 'All items must be picked or marked short before order can be marked as PACKED.',
        });
      }
    }

    const now = new Date().toISOString();
    const user = (req as any).authUser;

    // If cancelled, execute atomic cancellation and stock restoration
    if (newStatus === 'CANCELLED') {
      const cancelResult = await cancelOrderAndRestoreStock(
        orderId,
        user?.uid || userId || 'WH-STAFF-01',
        user?.role || 'WAREHOUSE_STAFF',
        reason || 'Cancelled by warehouse operational staff'
      );

      ServerNotificationService.notifyOrderStatusTransition(
        { ...orderData, orderId, orderStatus: 'CANCELLED' },
        'CANCELLED',
        { reason: reason || 'Cancelled by warehouse operational staff' }
      ).catch(err => console.warn('Note emitting CANCELLED notification:', err.message));

      return res.status(200).json({
        success: true,
        orderId,
        previousStatus: currentStatus,
        newStatus: 'CANCELLED',
        orderStatus: 'CANCELLED',
        alreadyCancelled: cancelResult.alreadyCancelled,
        stockRestored: cancelResult.stockRestored,
        message: cancelResult.message,
        updatedAt: now,
      });
    }

    const updatePayload: any = {
      orderStatus: newStatus,
      updatedAt: now,
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
      _serverWriteNonce: Date.now().toString(),
      statusHistory: [
        ...(orderData.statusHistory || []),
        {
          from: currentStatus,
          to: newStatus,
          timestamp: now,
          userId: user?.uid || userId || 'WH-STAFF-01',
          userName: user?.name || userName || 'Warehouse Staff',
          reason: reason || '',
        },
      ],
    };

    await runTransaction(db, async txn => {
      txn.update(orderRef, updatePayload);
    });

    // Server-Authoritative Notifications Trigger
    ServerNotificationService.notifyOrderStatusTransition(
      { ...orderData, orderId, orderStatus: newStatus },
      newStatus,
      { reason }
    ).catch(err => console.warn(`Note emitting ${newStatus} notification:`, err.message));

    return res.status(200).json({
      success: true,
      orderId,
      previousStatus: currentStatus,
      newStatus,
      updatedAt: now,
    });
  } catch (err: any) {
    console.error('Error transitioning order status:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/warehouse/orders/:orderId/picking
 * Record picking progress for items in order
 */
warehouseRouter.post('/orders/:orderId/picking', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { items, completePicking, userId, userName } = req.body;

    const orderRef = doc(db, 'orders', orderId);
    const orderDoc = await getDoc(orderRef);

    if (!orderDoc.exists()) {
      return res.status(404).json({ success: false, error: 'ORDER_NOT_FOUND' });
    }

    const orderData = orderDoc.data();
    if (orderData.warehouseId !== OPERATIONAL_WAREHOUSE_ID) {
      return res.status(403).json({ success: false, error: 'UNAUTHORIZED_WAREHOUSE' });
    }

    const now = new Date().toISOString();
    const existingPicking = orderData.picking || { items: {} };
    const mergedItems = { ...existingPicking.items, ...(items || {}) };

    // Calculate completion metrics
    const orderItems: any[] = orderData.items || [];
    let allFinished = true;
    let pickedCount = 0;

    for (const oi of orderItems) {
      const state = mergedItems[oi.productId];
      if (!state || (Number(state.pickedQty || 0) < oi.quantity && !state.isShort)) {
        allFinished = false;
      }
      if (state && (state.pickedQty > 0 || state.isShort)) {
        pickedCount++;
      }
    }

    const isFullyCompleted = Boolean(completePicking) && allFinished;

    const pickingUpdate: any = {
      status: isFullyCompleted ? 'COMPLETED' : 'IN_PROGRESS',
      startedAt: existingPicking.startedAt || now,
      pickedBy: userName || existingPicking.pickedBy || 'Warehouse Staff',
      items: mergedItems,
    };

    if (isFullyCompleted) {
      pickingUpdate.completedAt = now;
    }

    const updatePayload: any = {
      picking: pickingUpdate,
      updatedAt: now,
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
      _serverWriteNonce: Date.now().toString(),
    };

    // Auto-advance orderStatus from ACCEPTED to PICKING if picking has started
    if (orderData.orderStatus === 'ACCEPTED') {
      updatePayload.orderStatus = 'PICKING';
    }

    await runTransaction(db, async txn => {
      txn.update(orderRef, updatePayload);
    });

    if (updatePayload.orderStatus === 'PICKING') {
      ServerNotificationService.notifyOrderStatusTransition(
        { ...orderData, orderId, orderStatus: 'PICKING' },
        'PICKING'
      ).catch(err => console.warn('Note emitting PICKING notification:', err.message));
    }

    return res.status(200).json({
      success: true,
      orderId,
      picking: pickingUpdate,
      orderStatus: updatePayload.orderStatus || orderData.orderStatus,
      progress: `${pickedCount}/${orderItems.length}`,
      isCompleted: isFullyCompleted,
    });
  } catch (err: any) {
    console.error('Error updating picking status:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/warehouse/orders/:orderId/packing
 * Record packing verification and transition to PACKED or READY_FOR_DISPATCH
 */
warehouseRouter.post('/orders/:orderId/packing', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { numberOfPackages, boxType, packingNotes, userId, userName, moveToReady } = req.body;

    const orderRef = doc(db, 'orders', orderId);
    const orderDoc = await getDoc(orderRef);

    if (!orderDoc.exists()) {
      return res.status(404).json({ success: false, error: 'ORDER_NOT_FOUND' });
    }

    const orderData = orderDoc.data();
    if (orderData.warehouseId !== OPERATIONAL_WAREHOUSE_ID) {
      return res.status(403).json({ success: false, error: 'UNAUTHORIZED_WAREHOUSE' });
    }

    // Verify picking condition
    if (orderData.picking?.status !== 'COMPLETED') {
      return res.status(400).json({
        success: false,
        error: 'PICKING_INCOMPLETE',
        message: 'Order picking must be marked completed before packing can be certified.',
      });
    }

    const now = new Date().toISOString();
    const pkgCount = Math.max(1, Number(numberOfPackages) || 1);

    const packingInfo = {
      status: 'PACKED',
      packedAt: now,
      packedBy: userName || 'Warehouse Staff',
      numberOfPackages: pkgCount,
      boxType: boxType || 'Corrugated Wholesale Box',
      packingNotes: packingNotes || '',
    };

    const targetStatus = moveToReady ? 'READY_FOR_DISPATCH' : 'PACKED';

    const updatePayload: any = {
      packing: packingInfo,
      orderStatus: targetStatus,
      updatedAt: now,
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
      _serverWriteNonce: Date.now().toString(),
      dispatch: {
        deliveryArea: orderData.deliveryAddress?.city || 'Brahmpuri',
        packageCount: pkgCount,
      },
    };

    await runTransaction(db, async txn => {
      txn.update(orderRef, updatePayload);
    });

    // Server-Authoritative Notifications Trigger
    ServerNotificationService.notifyOrderStatusTransition(
      { ...orderData, orderId, orderStatus: targetStatus },
      targetStatus
    ).catch(err => console.warn(`Note emitting ${targetStatus} notification:`, err.message));

    return res.status(200).json({
      success: true,
      orderId,
      orderStatus: targetStatus,
      packing: packingInfo,
    });
  } catch (err: any) {
    console.error('Error updating packing status:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/warehouse/inventory
 * Inventory list for WH-BRAHMPURI-01 with live reservation and stock status
 */
warehouseRouter.get('/inventory', async (req: Request, res: Response) => {
  try {
    const { category, search, stockStatus } = req.query;

    const prodSnap = await getDocs(
      query(collection(db, 'products'), where('warehouseId', '==', OPERATIONAL_WAREHOUSE_ID))
    );

    // Compute reserved quantities across pending active orders
    const pendingOrdersSnap = await getDocs(
      query(collection(db, 'orders'), where('warehouseId', '==', OPERATIONAL_WAREHOUSE_ID))
    );

    const reservedMap: Record<string, number> = {};
    pendingOrdersSnap.docs.forEach(d => {
      const o = d.data();
      if (['PLACED', 'CONFIRMED', 'ACCEPTED', 'PICKING'].includes(o.orderStatus)) {
        (o.items || []).forEach((item: any) => {
          reservedMap[item.productId] = (reservedMap[item.productId] || 0) + Number(item.quantity || 0);
        });
      }
    });

    let inventory = prodSnap.docs.map(docSnap => {
      const p = docSnap.data();
      const currentStock = Number(p.stockQuantity) || 0;
      const reservedStock = reservedMap[docSnap.id] || 0;
      const availableStock = Math.max(0, currentStock - reservedStock);
      const threshold = Number(p.lowStockThreshold) || 20;

      let status: 'IN STOCK' | 'LOW STOCK' | 'OUT OF STOCK' = 'IN STOCK';
      if (currentStock <= 0) {
        status = 'OUT OF STOCK';
      } else if (currentStock <= threshold) {
        status = 'LOW STOCK';
      }

      const mrp = Number(p.mrp) || 0;
      const sellingPrice = Number(p.sellingPrice) || 0;
      const marginPercent = mrp > 0 ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 0;

      return {
        productId: docSnap.id,
        sku: p.sku || `SKU-${docSnap.id}`,
        productName: p.productName || '',
        brandName: p.brandName || '',
        category: p.categoryName || p.categoryId || 'General',
        imageUrl: p.imageUrl || '',
        currentStock,
        reservedStock,
        availableStock,
        minimumOrderQuantity: Number(p.minimumOrderQuantity) || 1,
        caseQuantity: Number(p.caseQuantity) || 1,
        lowStockThreshold: threshold,
        stockStatus: status,
        sellingPrice,
        mrp,
        marginPercent,
        warehouseId: OPERATIONAL_WAREHOUSE_ID,
        warehouseName: OPERATIONAL_WAREHOUSE_NAME,
        unit: p.unit || 'pcs',
        packSize: p.packSize || '1 unit',
      };
    });

    // In-memory filters
    if (category && typeof category === 'string' && category !== 'ALL') {
      inventory = inventory.filter(i => i.category.toLowerCase() === category.toLowerCase());
    }

    if (stockStatus && typeof stockStatus === 'string' && stockStatus !== 'ALL') {
      inventory = inventory.filter(i => i.stockStatus === stockStatus);
    }

    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim().toLowerCase();
      inventory = inventory.filter(
        i =>
          i.productName.toLowerCase().includes(term) ||
          i.sku.toLowerCase().includes(term) ||
          i.brandName.toLowerCase().includes(term)
      );
    }

    return res.status(200).json({
      success: true,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      count: inventory.length,
      inventory,
    });
  } catch (err: any) {
    console.error('Error fetching inventory:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/warehouse/inventory/adjust
 * Controlled stock adjustment creating immutable stock audit records
 * Requires WAREHOUSE_MANAGER or WAREHOUSE_ADMIN role
 */
warehouseRouter.post('/inventory/adjust', requireWarehouseRole(['WAREHOUSE_MANAGER', 'WAREHOUSE_ADMIN']), async (req: Request, res: Response) => {
  try {
    const { productId, reason, adjustmentQuantity, notes, userId, userName } = req.body;
    const user = (req as any).authUser;

    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({ success: false, error: 'INVALID_PRODUCT', message: 'Product ID is required' });
    }

    if (!reason || !ALLOWED_ADJUSTMENT_REASONS.includes(reason)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REASON',
        message: `Adjustment reason must be one of: ${ALLOWED_ADJUSTMENT_REASONS.join(', ')}`,
      });
    }

    const delta = Number(adjustmentQuantity);
    if (!Number.isInteger(delta) || delta === 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_QUANTITY',
        message: 'Adjustment quantity must be a non-zero whole number integer.',
      });
    }

    // Resolve target product doc ID (supports doc ID, productId field, or sku)
    let targetDocId = productId;
    const directSnap = await getDoc(doc(db, 'products', productId));
    if (!directSnap.exists()) {
      const qByPid = query(collection(db, 'products'), where('productId', '==', productId), limit(1));
      const snapByPid = await getDocs(qByPid);
      if (!snapByPid.empty) {
        targetDocId = snapByPid.docs[0].id;
      } else {
        const qBySku = query(collection(db, 'products'), where('sku', '==', productId), limit(1));
        const snapBySku = await getDocs(qBySku);
        if (!snapBySku.empty) {
          targetDocId = snapBySku.docs[0].id;
        } else {
          return res.status(404).json({
            success: false,
            error: 'PRODUCT_NOT_FOUND',
            message: `Product '${productId}' not found in the warehouse catalogue.`,
          });
        }
      }
    }

    const prodRef = doc(db, 'products', targetDocId);
    const now = new Date().toISOString();
    let movementResult: any = null;

    await runTransaction(db, async txn => {
      const pSnap = await txn.get(prodRef);
      if (!pSnap.exists()) {
        throw new Error('PRODUCT_NOT_FOUND');
      }

      const prodData = pSnap.data();
      if (prodData.warehouseId && prodData.warehouseId !== OPERATIONAL_WAREHOUSE_ID) {
        throw new Error('UNAUTHORIZED_WAREHOUSE');
      }

      const prevStock = Number(prodData.stockQuantity) || 0;
      const newStock = prevStock + delta;

      if (newStock < 0) {
        throw new Error(`INSUFFICIENT_STOCK: Current stock is ${prevStock}, adjustment would result in ${newStock}`);
      }

      // Update product document
      txn.update(prodRef, {
        stockQuantity: newStock,
        warehouseId: OPERATIONAL_WAREHOUSE_ID,
        updatedAt: now,
        _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
        _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      });

      // Write immutable audit log to inventoryMovements
      const movRef = doc(collection(db, 'inventoryMovements'));
      movementResult = {
        movementId: movRef.id,
        warehouseId: OPERATIONAL_WAREHOUSE_ID,
        productId: targetDocId,
        productName: prodData.productName,
        sku: prodData.sku || `SKU-${targetDocId}`,
        previousStock: prevStock,
        previousQuantity: prevStock,
        delta: delta,
        adjustmentQuantity: delta,
        newStock: newStock,
        newQuantity: newStock,
        reason,
        notes: notes || '',
        performedBy: user?.uid || userId || 'WH-MGR-01',
        performedByRole: user?.role || 'WAREHOUSE_MANAGER',
        userId: user?.uid || userId || 'WH-MGR-01',
        userName: user?.name || userName || 'Warehouse Manager',
        createdAt: now,
        timestamp: now,
        referenceType: 'MANUAL_ADJUSTMENT',
        referenceId: `ADJ-${targetDocId}-${Date.now()}`,
        _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
      };

      txn.set(movRef, JSON.parse(JSON.stringify(movementResult)));
    });

    if (movementResult) {
      inMemoryMovements.unshift(movementResult);
    }

    return res.status(200).json({
      success: true,
      message: 'Stock adjusted successfully with immutable audit log',
      movement: movementResult,
    });
  } catch (err: any) {
    if (err.message === 'PRODUCT_NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'PRODUCT_NOT_FOUND', message: 'Product not found in catalogue.' });
    }
    if (err.message?.includes('INSUFFICIENT_STOCK')) {
      return res.status(400).json({ success: false, error: 'INSUFFICIENT_STOCK', message: err.message });
    }
    if (err.message === 'UNAUTHORIZED_WAREHOUSE') {
      return res.status(403).json({ success: false, error: 'UNAUTHORIZED_WAREHOUSE', message: 'Product belongs to a different warehouse.' });
    }
    console.warn('Warning adjusting inventory:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/warehouse/inventory/movements
 * List immutable stock movement audit logs for WH-BRAHMPURI-01
 */
warehouseRouter.get('/inventory/movements', async (req: Request, res: Response) => {
  try {
    const { productId } = req.query;
    let movements: any[] = [];

    try {
      const movSnap = await getDocs(
        query(collection(db, 'inventoryMovements'), where('warehouseId', '==', OPERATIONAL_WAREHOUSE_ID))
      );

      movements = movSnap.docs.map(d => ({ movementId: d.id, ...d.data() }));

      // Synchronize into fallback buffer
      movements.forEach(m => {
        if (!inMemoryMovements.some(existing => existing.movementId === m.movementId)) {
          inMemoryMovements.push(m);
        }
      });
    } catch (dbErr: any) {
      console.warn('Remote movements query note:', dbErr.message);
      movements = [...inMemoryMovements];
    }

    if (productId && typeof productId === 'string') {
      movements = movements.filter(m => m.productId === productId);
    }

    movements.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

    return res.status(200).json({
      success: true,
      count: movements.length,
      movements,
    });
  } catch (err: any) {
    console.warn('Handling movements fetch:', err.message);
    return res.status(200).json({
      success: true,
      count: inMemoryMovements.length,
      movements: inMemoryMovements,
    });
  }
});

/**
 * GET /api/warehouse/returns
 * Returns list for WH-BRAHMPURI-01
 */
warehouseRouter.get('/returns', async (req: Request, res: Response) => {
  try {
    let returns: any[] = [];

    try {
      const retSnap = await getDocs(
        query(collection(db, 'returns'), where('warehouseId', '==', OPERATIONAL_WAREHOUSE_ID))
      );

      returns = retSnap.docs.map(d => ({ returnId: d.id, ...d.data() }));
      returns.forEach(r => {
        if (!inMemoryReturns.some(existing => existing.returnId === r.returnId)) {
          inMemoryReturns.push(r);
        }
      });
    } catch (dbErr: any) {
      console.warn('Remote returns query note:', dbErr.message);
      returns = [...inMemoryReturns];
    }

    returns.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    return res.status(200).json({
      success: true,
      count: returns.length,
      returns,
    });
  } catch (err: any) {
    console.warn('Handling returns fetch:', err.message);
    return res.status(200).json({
      success: true,
      count: inMemoryReturns.length,
      returns: inMemoryReturns,
    });
  }
});

/**
 * POST /api/warehouse/returns
 * Create new return request
 */
warehouseRouter.post('/returns', async (req: Request, res: Response) => {
  try {
    const {
      orderId,
      retailerId,
      retailerName,
      shopName,
      retailerMobile,
      productId,
      productName,
      sku,
      quantity,
      reason,
    } = req.body;

    if (!orderId || !productId || !quantity || !reason) {
      return res.status(400).json({ success: false, error: 'MISSING_FIELDS', message: 'Missing required return fields' });
    }

    const retRef = doc(collection(db, 'returns'));
    const now = new Date().toISOString();

    const returnDoc = {
      returnId: retRef.id,
      orderId,
      retailerId: retailerId || 'ret-01',
      retailerName: retailerName || 'Retailer',
      shopName: shopName || 'Kirana Store',
      retailerMobile: retailerMobile || '',
      productId,
      productName: productName || 'Product',
      sku: sku || `SKU-${productId}`,
      quantity: Number(quantity),
      reason,
      returnStatus: 'REQUESTED' as ReturnStatus,
      inspectionStatus: 'PENDING' as InspectionStatus,
      inspectionNotes: '',
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      warehouseName: OPERATIONAL_WAREHOUSE_NAME,
      createdAt: now,
      updatedAt: now,
    };

    await runTransaction(db, async txn => {
      txn.set(retRef, returnDoc);
    });

    return res.status(200).json({ success: true, returnRecord: returnDoc });
  } catch (err: any) {
    console.error('Error creating return:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/warehouse/returns/:returnId/status
 * Update return and inspection status (Requires WAREHOUSE_MANAGER or WAREHOUSE_ADMIN)
 */
warehouseRouter.post('/returns/:returnId/status', requireWarehouseRole(['WAREHOUSE_MANAGER', 'WAREHOUSE_ADMIN']), async (req: Request, res: Response) => {
  try {
    const { returnId } = req.params;
    const { returnStatus, inspectionStatus, inspectionNotes, restockItem, userId, userName } = req.body;
    const user = (req as any).authUser;

    const retRef = doc(db, 'returns', returnId);
    const retDoc = await getDoc(retRef);

    if (!retDoc.exists()) {
      return res.status(404).json({ success: false, error: 'RETURN_NOT_FOUND' });
    }

    const retData = retDoc.data();
    if (retData.warehouseId !== OPERATIONAL_WAREHOUSE_ID) {
      return res.status(403).json({ success: false, error: 'UNAUTHORIZED_WAREHOUSE' });
    }

    const now = new Date().toISOString();
    const updatePayload: any = {
      updatedAt: now,
    };

    if (returnStatus) updatePayload.returnStatus = returnStatus;
    if (inspectionStatus) updatePayload.inspectionStatus = inspectionStatus;
    if (inspectionNotes) updatePayload.inspectionNotes = inspectionNotes;

    // If restock is flagged and return is accepted/refunded, add stock back with Return inward
    if (restockItem && ['ACCEPTED', 'REFUNDED'].includes(returnStatus)) {
      const prodRef = doc(db, 'products', retData.productId);
      await runTransaction(db, async txn => {
        const pSnap = await txn.get(prodRef);
        if (pSnap.exists()) {
          const curStock = Number(pSnap.data().stockQuantity) || 0;
          const deltaQty = Number(retData.quantity);
          const newStock = curStock + deltaQty;
          txn.update(prodRef, {
            stockQuantity: newStock,
            updatedAt: now,
            _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
            _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          });

          const movRef = doc(collection(db, 'inventoryMovements'));
          txn.set(movRef, {
            movementId: movRef.id,
            warehouseId: OPERATIONAL_WAREHOUSE_ID,
            productId: retData.productId,
            productName: retData.productName,
            sku: retData.sku,
            previousStock: curStock,
            previousQuantity: curStock,
            delta: deltaQty,
            adjustmentQuantity: deltaQty,
            newStock: newStock,
            newQuantity: newStock,
            reason: 'Return inward',
            notes: `Restock from return ${returnId}`,
            performedBy: user?.uid || userId || 'WH-MGR-01',
            performedByRole: user?.role || 'WAREHOUSE_MANAGER',
            userId: user?.uid || userId || 'WH-MGR-01',
            userName: user?.name || userName || 'Warehouse Manager',
            createdAt: now,
            timestamp: now,
            referenceType: 'RETURN',
            referenceId: returnId,
          });
        }
        txn.update(retRef, updatePayload);
      });
    } else {
      await runTransaction(db, async txn => {
        txn.update(retRef, updatePayload);
      });
    }

    return res.status(200).json({
      success: true,
      returnId,
      returnStatus: updatePayload.returnStatus || retData.returnStatus,
      inspectionStatus: updatePayload.inspectionStatus || retData.inspectionStatus,
    });
  } catch (err: any) {
    console.error('Error updating return status:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/warehouse/dispatch
 * Dispatch preparation list: orders READY_FOR_DISPATCH and DISPATCHED
 */
warehouseRouter.get('/dispatch', async (req: Request, res: Response) => {
  try {
    const ordersSnap = await getDocs(
      query(collection(db, 'orders'), where('warehouseId', '==', OPERATIONAL_WAREHOUSE_ID))
    );

    const dispatchOrders = ordersSnap.docs
      .map(d => ({ orderId: d.id, ...d.data() }))
      .filter((o: any) => ['PACKED', 'READY_FOR_DISPATCH', 'DISPATCHED'].includes(o.orderStatus))
      .map((o: any) => ({
        orderId: o.orderId,
        createdAt: o.createdAt,
        retailerName: o.retailerName,
        shopName: o.shopName,
        retailerMobile: o.deliveryAddress?.phone || '',
        address: o.deliveryAddress?.fullAddress || '',
        deliveryArea: o.deliveryAddress?.city || 'Brahmpuri',
        orderValue: o.grandTotal,
        packageCount: o.packing?.numberOfPackages || 1,
        boxType: o.packing?.boxType || 'Standard Corrugated',
        orderStatus: o.orderStatus,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        assignedPartnerId: o.deliveryPartnerId || null,
        assignedPartnerName: o.deliveryPartnerName || 'Unassigned',
      }));

    return res.status(200).json({
      success: true,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      count: dispatchOrders.length,
      orders: dispatchOrders,
    });
  } catch (err: any) {
    console.error('Error fetching dispatch orders:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// PHASE 6 PART 4B: WAREHOUSE COD HANDOVER & CUSTODY TRANSFER ENDPOINTS
// =========================================================================

/**
 * GET /api/warehouse/cod/handovers
 * Lists COD cash handover requests submitted to WH-BRAHMPURI-01
 */
warehouseRouter.get('/cod/handovers', async (req: Request, res: Response) => {
  try {
    const handovers = await listWarehouseHandovers(OPERATIONAL_WAREHOUSE_ID);
    return res.status(200).json({
      success: true,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      count: handovers.length,
      handovers,
    });
  } catch (err: any) {
    console.error('Error fetching warehouse COD handovers:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/warehouse/cod/custody
 * Fetches current operational physical cash custody balance for WH-BRAHMPURI-01
 */
warehouseRouter.get('/cod/custody', async (req: Request, res: Response) => {
  try {
    const custody = await getWarehouseCashCustody(OPERATIONAL_WAREHOUSE_ID);
    return res.status(200).json({
      success: true,
      ...custody,
    });
  } catch (err: any) {
    console.error('Error fetching warehouse cash custody:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/warehouse/cod/handovers/:handoverId/accept
 * Verifies physical cash count and atomically accepts handover into WH-BRAHMPURI-01 custody
 */
warehouseRouter.post('/cod/handovers/:handoverId/accept', async (req: Request, res: Response) => {
  try {
    const { handoverId } = req.params;
    const { receivedAmountPaise, receivedAmountRupees, notes } = req.body;
    const user = (req as any).authUser;

    const amountPaise = receivedAmountPaise !== undefined
      ? Number(receivedAmountPaise)
      : Math.round(Number(receivedAmountRupees || 0) * 100);

    const result = await acceptCodHandover({
      handoverId,
      receiverId: user.uid,
      receiverRole: user.role,
      destinationTypeExpected: 'WAREHOUSE',
      receivedAmountPaise: amountPaise,
      notes,
    });

    return res.status(200).json({
      message: result.isIdempotentReplay
        ? 'Handover was already accepted.'
        : `Handover accepted successfully into WH-BRAHMPURI-01 cash custody (₹${result.handover.acceptedAmountPaise! / 100}).`,
      ...result,
    });
  } catch (err: any) {
    const isValidation =
      err.message.startsWith('INVALID') ||
      err.message.startsWith('INSUFFICIENT') ||
      err.message.startsWith('DESTINATION_MISMATCH') ||
      err.message.startsWith('HANDOVER_NOT_FOUND');
    const isForbidden = err.message.startsWith('SELF_APPROVAL_FORBIDDEN') || err.message.startsWith('FORBIDDEN');
    return res.status(isForbidden ? 403 : isValidation ? 400 : 500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/warehouse/cod/handovers/:handoverId/reject
 * Rejects a submitted COD cash handover request
 */
warehouseRouter.post('/cod/handovers/:handoverId/reject', async (req: Request, res: Response) => {
  try {
    const { handoverId } = req.params;
    const { reason } = req.body;
    const user = (req as any).authUser;

    const rejected = await rejectCodHandover({
      handoverId,
      receiverId: user.uid,
      destinationTypeExpected: 'WAREHOUSE',
      reason,
    });

    return res.status(200).json({
      success: true,
      message: 'Handover rejected successfully.',
      handover: rejected,
    });
  } catch (err: any) {
    const isValidation =
      err.message.startsWith('INVALID') ||
      err.message.startsWith('ACCEPTED') ||
      err.message.startsWith('DESTINATION_MISMATCH') ||
      err.message.startsWith('HANDOVER_NOT_FOUND');
    return res.status(isValidation ? 400 : 500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/warehouse/accounting/balances
 * and GET /api/warehouse/balances
 * Phase 6 Part 4C-B: Server-authoritative read-only Cash in Hand (1100) and Bank Balance (1200)
 * Derived strictly from posted journal entries in the General Ledger.
 * Protected by requireWarehouseRole().
 */
warehouseRouter.get(['/accounting/balances', '/balances'], async (req: Request, res: Response) => {
  try {
    const toDate = typeof req.query.toDate === 'string' && req.query.toDate.trim() ? req.query.toDate.trim() : undefined;
    const bypassCache = req.query.bypassCache === 'true' || req.query.refresh === 'true';

    const result = await AccountingBalanceService.getLedgerBalances({ toDate, bypassCache });
    return res.status(200).json(result);
  } catch (error: any) {
    const msg = error.message || String(error);
    return res.status(500).json({
      success: false,
      error: 'ACCOUNTING_BALANCE_ERROR',
      message: 'Failed to retrieve ledger balances: ' + msg,
    });
  }
});

// =========================================================================
// PHASE 6 PART 4E: WAREHOUSE SALE BILLS & PURCHASE BILLS
// =========================================================================

/**
 * GET /api/warehouse/bills/eligible-orders
 * List orders in WH-BRAHMPURI-01 eligible for Sale Bill creation
 */
warehouseRouter.get('/bills/eligible-orders', async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const orders = await WarehouseBillService.listEligibleOrders(search);
    return res.status(200).json({
      success: true,
      orders,
      total: orders.length,
    });
  } catch (err: any) {
    console.error('Failed to list eligible orders for sale bills:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to list eligible orders.',
    });
  }
});

/**
 * GET /api/warehouse/bills/suppliers
 * List recognized suppliers for Purchase Bill creation
 */
warehouseRouter.get('/bills/suppliers', async (req: Request, res: Response) => {
  try {
    const suppliers = await WarehouseBillService.listSuppliers();
    return res.status(200).json({
      success: true,
      suppliers,
      total: suppliers.length,
    });
  } catch (err: any) {
    console.error('Failed to list suppliers for purchase bills:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to list suppliers.',
    });
  }
});

/**
 * GET /api/warehouse/bills/sales
 * List Sales Invoices for WH-BRAHMPURI-01
 */
warehouseRouter.get('/bills/sales', async (req: Request, res: Response) => {
  try {
    const { search, status, fromDate, toDate, customerId, invoiceNumber, page, pageSize } = req.query;

    const requestedPageSize = Number(pageSize || 20);
    if (requestedPageSize > 100) {
      return res.status(400).json({
        success: false,
        error: 'PAGE_SIZE_EXCEEDED',
        message: 'Maximum page size allowed is 100.',
      });
    }

    const result = await InvoiceService.listSalesInvoices({
      search: search ? String(search) : undefined,
      status: status ? String(status) : undefined,
      fromDate: fromDate ? String(fromDate) : undefined,
      toDate: toDate ? String(toDate) : undefined,
      customerId: customerId ? String(customerId) : undefined,
      invoiceNumber: invoiceNumber ? String(invoiceNumber) : undefined,
      page: page ? Number(page) : 1,
      pageSize: requestedPageSize,
    });

    return res.status(200).json({
      success: true,
      invoices: result.invoices,
      total: result.total,
      page: Number(page || 1),
      pageSize: requestedPageSize,
    });
  } catch (err: any) {
    console.error('Failed to list warehouse sales bills:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to list warehouse sales bills.',
    });
  }
});

/**
 * GET /api/warehouse/bills/sales/:invoiceId
 * Retrieve single Sales Invoice
 */
warehouseRouter.get('/bills/sales/:invoiceId', async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const invoice = await InvoiceService.getSalesInvoiceById(invoiceId);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'INVOICE_NOT_FOUND',
        message: `Sales invoice "${invoiceId}" not found.`,
      });
    }

    if (invoice.warehouseId && invoice.warehouseId !== OPERATIONAL_WAREHOUSE_ID) {
      return res.status(403).json({
        success: false,
        error: 'UNAUTHORIZED_WAREHOUSE',
        message: `Invoice belongs to another warehouse.`,
      });
    }

    return res.status(200).json({
      success: true,
      invoice,
    });
  } catch (err: any) {
    console.error('Failed to get warehouse sales bill:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to get sales bill.',
    });
  }
});

/**
 * POST /api/warehouse/bills/sales
 * Create & Issue a Sale Bill from an existing Retailer Order (ZERO double stock deduction)
 */
warehouseRouter.post('/bills/sales', async (req: Request, res: Response) => {
  try {
    const user = (req as any).authUser;
    const { orderId, invoiceDate, idempotencyKey, grandTotal, subtotal, unitPrice, taxTotal, customerId, warehouseId } = req.body || {};

    // Reject client price/totals injection
    if (
      grandTotal !== undefined ||
      subtotal !== undefined ||
      unitPrice !== undefined ||
      taxTotal !== undefined ||
      req.body.taxableTotal !== undefined ||
      req.body.discountTotal !== undefined
    ) {
      return res.status(400).json({
        success: false,
        error: 'CLIENT_PRICE_INJECTION_FORBIDDEN',
        message: 'Client cannot forge Sale Bill prices or totals. Pricing is derived authoritatively from the order snapshot.',
      });
    }

    if (warehouseId && warehouseId !== OPERATIONAL_WAREHOUSE_ID) {
      return res.status(403).json({
        success: false,
        error: 'UNAUTHORIZED_WAREHOUSE',
        message: `Sale bills are permitted only for ${OPERATIONAL_WAREHOUSE_ID}.`,
      });
    }

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_ORDER_ID',
        message: 'orderId is required to generate a warehouse Sale Bill.',
      });
    }

    const result = await WarehouseBillService.createSaleBillFromOrder(
      user,
      {
        orderId,
        invoiceDate,
        idempotencyKey,
        customerId,
        warehouseId,
      },
      req
    );

    return res.status(result.isIdempotentReplay ? 200 : 201).json({
      success: true,
      invoice: result.invoice,
      isIdempotentReplay: result.isIdempotentReplay,
      message: result.isIdempotentReplay
        ? `Sale Bill "${result.invoice.invoiceNumber}" already processed.`
        : `Sale Bill "${result.invoice.invoiceNumber}" created and issued successfully.`,
    });
  } catch (err: any) {
    const msg = err.message || '';
    if (
      msg.includes('ORDER_NOT_FOUND') ||
      msg.includes('ORDER_NOT_ELIGIBLE') ||
      msg.includes('CLIENT_PRICE_INJECTION_FORBIDDEN') ||
      msg.includes('CLIENT_CUSTOMER_INJECTION_FORBIDDEN') ||
      msg.includes('ORDER_CUSTOMER_MISMATCH') ||
      msg.includes('ORDER_ITEMS_EMPTY') ||
      msg.includes('PERIOD_CLOSED') ||
      msg.includes('PERIOD_NOT_OPEN') ||
      msg.includes('MISSING_ORDER_ID') ||
      msg.includes('CUSTOMER_NOT_FOUND')
    ) {
      return res.status(400).json({
        success: false,
        error: msg.split(':')[0] || 'BAD_REQUEST',
        message: msg,
      });
    }

    if (msg.includes('UNAUTHORIZED_WAREHOUSE') || msg.includes('ORDER_WAREHOUSE_MISMATCH')) {
      return res.status(403).json({
        success: false,
        error: 'UNAUTHORIZED_WAREHOUSE',
        message: msg,
      });
    }

    console.error('Failed to create warehouse sale bill:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to create sale bill.',
    });
  }
});

/**
 * POST /api/warehouse/bills/sales/:invoiceId/reverse
 * Reverse an issued Sale Bill using existing double-entry journal reversal (ZERO inventory alteration)
 */
warehouseRouter.post('/bills/sales/:invoiceId/reverse', async (req: Request, res: Response) => {
  try {
    const user = (req as any).authUser;
    const { invoiceId } = req.params;
    const { reason } = req.body || {};

    const result = await WarehouseBillService.reverseSaleBill(user, invoiceId, reason, req);

    return res.status(200).json({
      success: true,
      invoice: result.invoice,
      reversalJournalId: result.reversalJournalId,
      message: `Sale Bill "${result.invoice.invoiceNumber}" reversed successfully.`,
    });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('INVOICE_NOT_FOUND')) {
      return res.status(404).json({ success: false, error: 'INVOICE_NOT_FOUND', message: msg });
    }
    if (msg.includes('INVOICE_ALREADY_CANCELLED') || msg.includes('MISSING_JOURNAL_LINK')) {
      return res.status(400).json({ success: false, error: msg.split(':')[0] || 'BAD_REQUEST', message: msg });
    }
    console.error('Failed to reverse sale bill:', err);
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * GET /api/warehouse/bills/purchase
 * List Purchase Invoices for WH-BRAHMPURI-01
 */
warehouseRouter.get('/bills/purchase', async (req: Request, res: Response) => {
  try {
    const { search, status, fromDate, toDate, supplierId, invoiceNumber, page, pageSize } = req.query;

    const requestedPageSize = Number(pageSize || 20);
    if (requestedPageSize > 100) {
      return res.status(400).json({
        success: false,
        error: 'PAGE_SIZE_EXCEEDED',
        message: 'Maximum page size allowed is 100.',
      });
    }

    const result = await InvoiceService.listPurchaseInvoices({
      search: search ? String(search) : undefined,
      status: status ? String(status) : undefined,
      fromDate: fromDate ? String(fromDate) : undefined,
      toDate: toDate ? String(toDate) : undefined,
      supplierId: supplierId ? String(supplierId) : undefined,
      invoiceNumber: invoiceNumber ? String(invoiceNumber) : undefined,
      page: page ? Number(page) : 1,
      pageSize: requestedPageSize,
    });

    return res.status(200).json({
      success: true,
      invoices: result.invoices,
      total: result.total,
      page: Number(page || 1),
      pageSize: requestedPageSize,
    });
  } catch (err: any) {
    console.error('Failed to list warehouse purchase bills:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to list warehouse purchase bills.',
    });
  }
});

/**
 * GET /api/warehouse/bills/purchase/:invoiceId
 * Retrieve single Purchase Invoice
 */
warehouseRouter.get('/bills/purchase/:invoiceId', async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const invoice = await InvoiceService.getPurchaseInvoiceById(invoiceId);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'INVOICE_NOT_FOUND',
        message: `Purchase invoice "${invoiceId}" not found.`,
      });
    }

    if (invoice.warehouseId && invoice.warehouseId !== OPERATIONAL_WAREHOUSE_ID) {
      return res.status(403).json({
        success: false,
        error: 'UNAUTHORIZED_WAREHOUSE',
        message: `Purchase bill belongs to another warehouse.`,
      });
    }

    return res.status(200).json({
      success: true,
      invoice,
    });
  } catch (err: any) {
    console.error('Failed to get warehouse purchase bill:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to get purchase bill.',
    });
  }
});

/**
 * POST /api/warehouse/bills/purchase
 * Create & Post a Purchase Bill for inward stock receipt (Double-entry AP + Atomic inventory increase)
 */
warehouseRouter.post('/bills/purchase', async (req: Request, res: Response) => {
  try {
    const user = (req as any).authUser;
    const {
      supplierId,
      supplierType,
      supplierInvoiceNumber,
      invoiceDate,
      items,
      billingAddressSnapshot,
      shippingAddressSnapshot,
      notes,
      idempotencyKey,
      warehouseId,
      grandTotal,
      subtotal,
      taxTotal,
      totalDebit,
      totalCredit,
    } = req.body || {};

    // Reject client accounting / price injection
    if (
      grandTotal !== undefined ||
      subtotal !== undefined ||
      taxTotal !== undefined ||
      totalDebit !== undefined ||
      totalCredit !== undefined ||
      req.body.taxableTotal !== undefined ||
      req.body.discountTotal !== undefined ||
      req.body.accountingJournalId !== undefined ||
      req.body.accountingVoucherNumber !== undefined ||
      req.body.accountingStatus !== undefined ||
      req.body.accountId !== undefined ||
      req.body.movementId !== undefined ||
      req.body.inventoryMovements !== undefined
    ) {
      return res.status(400).json({
        success: false,
        error: 'CLIENT_TOTAL_INJECTION_FORBIDDEN',
        message: 'Client cannot forge Purchase Bill totals or accounting fields. Calculations are performed server-side.',
      });
    }

    if (warehouseId && warehouseId !== OPERATIONAL_WAREHOUSE_ID) {
      return res.status(403).json({
        success: false,
        error: 'UNAUTHORIZED_WAREHOUSE',
        message: `Purchase bills are permitted only for ${OPERATIONAL_WAREHOUSE_ID}.`,
      });
    }

    if (!supplierId) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SUPPLIER_ID',
        message: 'supplierId is required to generate a warehouse Purchase Bill.',
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'EMPTY_ITEMS',
        message: 'Purchase Bill must contain at least one line item.',
      });
    }

    const result = await WarehouseBillService.createPurchaseBill(
      user,
      {
        supplierId,
        supplierType,
        supplierInvoiceNumber,
        invoiceDate,
        items,
        billingAddressSnapshot,
        shippingAddressSnapshot,
        notes,
        idempotencyKey,
        warehouseId,
      },
      req
    );

    return res.status(result.isIdempotentReplay ? 200 : 201).json({
      success: true,
      invoice: result.invoice,
      isIdempotentReplay: result.isIdempotentReplay,
      message: result.isIdempotentReplay
        ? `Purchase Bill "${result.invoice.invoiceNumber}" already processed.`
        : `Purchase Bill "${result.invoice.invoiceNumber}" created, posted to accounting, and inventory received successfully.`,
    });
  } catch (err: any) {
    const msg = err.message || '';
    if (
      msg.includes('INVALID_SUPPLIER_ID') ||
      msg.includes('SUPPLIER_NOT_FOUND') ||
      msg.includes('CLIENT_TOTAL_INJECTION_FORBIDDEN') ||
      msg.includes('CLIENT_ACCOUNTING_INJECTION_FORBIDDEN') ||
      msg.includes('EMPTY_ITEMS') ||
      msg.includes('INVALID_ITEM') ||
      msg.includes('PRODUCT_NOT_FOUND') ||
      msg.includes('PERIOD_CLOSED') ||
      msg.includes('PERIOD_NOT_OPEN') ||
      msg.includes('EXCESSIVE_DISCOUNT')
    ) {
      return res.status(400).json({
        success: false,
        error: msg.split(':')[0] || 'BAD_REQUEST',
        message: msg,
      });
    }

    if (msg.includes('UNAUTHORIZED_WAREHOUSE')) {
      return res.status(403).json({
        success: false,
        error: 'UNAUTHORIZED_WAREHOUSE',
        message: msg,
      });
    }

    console.error('Failed to create warehouse purchase bill:', err);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to create purchase bill.',
    });
  }
});

/**
 * POST /api/warehouse/bills/purchase/:invoiceId/reverse
 * Reverse a posted Purchase Bill via double-entry journal reversal (ZERO blind inventory mutation)
 */
warehouseRouter.post('/bills/purchase/:invoiceId/reverse', async (req: Request, res: Response) => {
  try {
    const user = (req as any).authUser;
    const { invoiceId } = req.params;
    const { reason } = req.body || {};

    const result = await WarehouseBillService.reversePurchaseBill(user, invoiceId, reason, req);

    return res.status(200).json({
      success: true,
      invoice: result.invoice,
      reversalJournalId: result.reversalJournalId,
      message: `Purchase Bill "${result.invoice.invoiceNumber}" reversed successfully.`,
    });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('INVOICE_NOT_FOUND')) {
      return res.status(404).json({ success: false, error: 'INVOICE_NOT_FOUND', message: msg });
    }
    if (msg.includes('INVOICE_ALREADY_CANCELLED') || msg.includes('MISSING_JOURNAL_LINK')) {
      return res.status(400).json({ success: false, error: msg.split(':')[0] || 'BAD_REQUEST', message: msg });
    }
    console.error('Failed to reverse purchase bill:', err);
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * GET /api/warehouse/bills/sales/:invoiceId/document & /pdf
 */
warehouseRouter.get('/bills/sales/:invoiceId/document', async (req: Request, res: Response) => {
  try {
    const user = (req as any).authUser;
    const { invoiceId } = req.params;

    const document = await InvoiceDocumentService.getSalesInvoiceDocument(invoiceId, {
      isAdmin: true,
      req,
      auditAction: 'VIEW',
      adminUid: user.uid,
      adminName: user.name || 'Warehouse Staff',
    });

    return res.status(200).json({
      success: true,
      document,
    });
  } catch (err: any) {
    const msg = err.message || '';
    return res.status(msg.includes('INVOICE_NOT_FOUND') ? 404 : 500).json({
      success: false,
      error: msg.includes('INVOICE_NOT_FOUND') ? 'INVOICE_NOT_FOUND' : 'SERVER_ERROR',
      message: msg,
    });
  }
});

warehouseRouter.get('/bills/sales/:invoiceId/pdf', async (req: Request, res: Response) => {
  try {
    const user = (req as any).authUser;
    const { invoiceId } = req.params;

    const document = await InvoiceDocumentService.getSalesInvoiceDocument(invoiceId, {
      isAdmin: true,
      req,
      auditAction: 'EXPORT',
      adminUid: user.uid,
      adminName: user.name || 'Warehouse Staff',
    });

    const pdfBuffer = InvoiceDocumentService.generateInvoicePdf(document);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${document.invoiceNumber}.pdf"`);
    return res.status(200).send(pdfBuffer);
  } catch (err: any) {
    const msg = err.message || '';
    return res.status(msg.includes('INVOICE_NOT_FOUND') ? 404 : 500).json({
      success: false,
      error: msg.includes('INVOICE_NOT_FOUND') ? 'INVOICE_NOT_FOUND' : 'SERVER_ERROR',
      message: msg,
    });
  }
});

/**
 * GET /api/warehouse/bills/purchase/:invoiceId/document & /pdf
 */
warehouseRouter.get('/bills/purchase/:invoiceId/document', async (req: Request, res: Response) => {
  try {
    const user = (req as any).authUser;
    const { invoiceId } = req.params;

    const document = await InvoiceDocumentService.getPurchaseInvoiceDocument(invoiceId, {
      isAdmin: true,
      req,
      auditAction: 'VIEW',
      adminUid: user.uid,
      adminName: user.name || 'Warehouse Staff',
    });

    return res.status(200).json({
      success: true,
      document,
    });
  } catch (err: any) {
    const msg = err.message || '';
    return res.status(msg.includes('INVOICE_NOT_FOUND') ? 404 : 500).json({
      success: false,
      error: msg.includes('INVOICE_NOT_FOUND') ? 'INVOICE_NOT_FOUND' : 'SERVER_ERROR',
      message: msg,
    });
  }
});

warehouseRouter.get('/bills/purchase/:invoiceId/pdf', async (req: Request, res: Response) => {
  try {
    const user = (req as any).authUser;
    const { invoiceId } = req.params;

    const document = await InvoiceDocumentService.getPurchaseInvoiceDocument(invoiceId, {
      isAdmin: true,
      req,
      auditAction: 'EXPORT',
      adminUid: user.uid,
      adminName: user.name || 'Warehouse Staff',
    });

    const pdfBuffer = InvoiceDocumentService.generateInvoicePdf(document);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${document.invoiceNumber}.pdf"`);
    return res.status(200).send(pdfBuffer);
  } catch (err: any) {
    const msg = err.message || '';
    return res.status(msg.includes('INVOICE_NOT_FOUND') ? 404 : 500).json({
      success: false,
      error: msg.includes('INVOICE_NOT_FOUND') ? 'INVOICE_NOT_FOUND' : 'SERVER_ERROR',
      message: msg,
    });
  }
});
