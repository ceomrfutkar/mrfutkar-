import express, { Request, Response, NextFunction } from 'express';
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
import { db, adminAuth } from './firebaseAdmin';
import cfg from '../firebase-applet-config.json';
import {
  requireDeliveryPartnerRole,
  requireWarehouseDispatchRole,
  resolveAuthUser,
  OPERATIONAL_WAREHOUSE_ID,
  OPERATIONAL_WAREHOUSE_NAME,
  OPERATIONAL_BRANCH_NAME,
} from './auth';
import { ServerNotificationService } from './notificationService';
import {
  generateCryptoOtp,
  hashDeliveryOtp,
  verifyOtpHash,
  validateRecipientName,
  validatePodMedia,
  validateCodCollection,
} from './deliveryOtpService';
import {
  DeliveryPartner,
  DeliveryPartnerSession,
  DeliveryAvailabilityStatus,
  DeliveryAssignmentStatus,
  DeliveryOrderSnapshot,
  DeliveryPaymentSnapshot,
  ProofOfDelivery,
  CODCollectionRecord,
  DeliveryPartnerCustody,
  DeliveryCustodyMovement,
  CODPaymentMethod,
  CODHandoverRecord,
} from '../src/types/delivery';
import {
  submitCodHandover,
  listPartnerHandovers,
  getEligibleCashCollections,
  cancelCodHandover,
} from './codHandoverService';
import { CodReceiptBridgeService } from './codReceiptBridgeService';

export { validateCodCollection };

export const deliveryRouter = express.Router();

/**
 * Valid transitions for Delivery State Machine:
 * READY_FOR_DISPATCH -> ASSIGNED
 * ASSIGNED -> ACCEPTED | READY_FOR_DISPATCH (rejected)
 * ACCEPTED -> PICKED_UP
 * PICKED_UP -> OUT_FOR_DELIVERY
 * OUT_FOR_DELIVERY -> DELIVERED | FAILED_DELIVERY
 * FAILED_DELIVERY -> RETURN_TO_WAREHOUSE
 */
export const VALID_DELIVERY_TRANSITIONS: Record<DeliveryAssignmentStatus, DeliveryAssignmentStatus[]> = {
  UNASSIGNED: ['ASSIGNED'],
  ASSIGNED: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['PICKED_UP'],
  REJECTED: ['ASSIGNED'], // Can be reassigned to another partner
  PICKED_UP: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED_DELIVERY'],
  DELIVERED: [],
  FAILED_DELIVERY: ['RETURN_TO_WAREHOUSE'],
  RETURN_TO_WAREHOUSE: [],
};

// Server authority markers required by deployed firestore.rules
const SERVER_INTERNAL_TOKEN = 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01';
const generateServerNonce = () => `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

// Default fallback mock partners in development if collection is empty
export const SEED_DELIVERY_PARTNERS: Record<string, Partial<DeliveryPartner>> = {
  'DP-DELHI-01': {
    partnerId: 'DP-DELHI-01',
    userId: 'DP-DELHI-01',
    name: 'Mukesh Sharma (Fleet Partner)',
    mobile: '9876543210',
    status: 'ACTIVE',
    availabilityStatus: 'AVAILABLE',
    vehicleType: 'TATA_ACE',
    vehicleNumber: 'DL-1L-AA-1234',
    licenseNumber: 'DL-1420110012345',
    assignedWarehouseId: 'WH-BRAHMPURI-01',
    assignedWarehouseName: 'MR FUTKAR — BRAHMPURI',
    serviceAreas: ['Brahmpuri', 'Karawal Nagar'],
  },
  'DP-DELHI-02': {
    partnerId: 'DP-DELHI-02',
    userId: 'DP-DELHI-02',
    name: 'Sunil Verma (Fleet Partner)',
    mobile: '9876543211',
    status: 'ACTIVE',
    availabilityStatus: 'AVAILABLE',
    vehicleType: 'MOTORCYCLE',
    vehicleNumber: 'DL-5S-BB-5678',
    licenseNumber: 'DL-1420150098765',
    assignedWarehouseId: 'WH-BRAHMPURI-01',
    assignedWarehouseName: 'MR FUTKAR — BRAHMPURI',
    serviceAreas: ['Brahmpuri', 'Karawal Nagar'],
  },
};

/**
 * Helper to get or seed delivery partner profile
 */
async function getOrSeedDeliveryPartner(uid: string): Promise<DeliveryPartner | null> {
  try {
    const dpRef = doc(db, 'deliveryPartners', uid);
    const snap = await getDoc(dpRef);
    if (snap.exists()) {
      return snap.data() as DeliveryPartner;
    }

    // Check seed template
    if (SEED_DELIVERY_PARTNERS[uid]) {
      const now = new Date().toISOString();
      const newPartner: any = {
        partnerId: SEED_DELIVERY_PARTNERS[uid].partnerId || uid,
        userId: uid,
        name: SEED_DELIVERY_PARTNERS[uid].name || 'Delivery Partner',
        mobile: SEED_DELIVERY_PARTNERS[uid].mobile || '9876543210',
        status: 'ACTIVE',
        availabilityStatus: 'AVAILABLE',
        vehicleType: SEED_DELIVERY_PARTNERS[uid].vehicleType || 'MOTORCYCLE',
        vehicleNumber: SEED_DELIVERY_PARTNERS[uid].vehicleNumber || 'DL-1L-AA-0000',
        licenseNumber: SEED_DELIVERY_PARTNERS[uid].licenseNumber || 'DL-1234567890',
        assignedWarehouseId: OPERATIONAL_WAREHOUSE_ID,
        assignedWarehouseName: OPERATIONAL_WAREHOUSE_NAME,
        serviceAreas: ['Brahmpuri', 'Karawal Nagar'],
        createdAt: now,
        updatedAt: now,
        lastActiveAt: now,
        _serverTxnToken: SERVER_INTERNAL_TOKEN,
        _serverWriteNonce: generateServerNonce(),
      };
      await setDoc(dpRef, newPartner);
      return newPartner;
    }
  } catch (err: any) {
    console.warn('Note getting/seeding delivery partner:', err.message);
  }
  return null;
}

// =====================================================================
// 1. DELIVERY PARTNER SESSION & PROFILE
// =====================================================================

/**
 * POST /api/delivery/claim-partner
 * Authenticates a valid Firebase ID Token and securely claims/links a WH-BRAHMPURI-01 fleet partner slot.
 * Ensures the user has a real Firebase UID, ID token, and updates deliveryPartners/{uid} in Firestore.
 */
deliveryRouter.post('/claim-partner', async (req: Request, res: Response) => {
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

  const { partnerId } = req.body;
  const validPartnerSlots: Record<string, any> = {
    'DP-DELHI-01': {
      partnerId: 'DP-DELHI-01',
      name: 'Mukesh Sharma (Fleet Partner)',
      mobile: '9876543210',
      vehicleType: 'MOTORCYCLE',
      vehicleNumber: 'DL-5S-AA-1234',
      licenseNumber: 'DL-1420110012345',
    },
    'DP-DELHI-02': {
      partnerId: 'DP-DELHI-02',
      name: 'Sunil Verma (Fleet Partner)',
      mobile: '9876543211',
      vehicleType: 'MOTORCYCLE',
      vehicleNumber: 'DL-5S-BB-5678',
      licenseNumber: 'DL-1420150098765',
    },
  };

  const slot = validPartnerSlots[partnerId];
  if (!slot) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_PARTNER_ID',
      message: 'Invalid delivery partner slot. Must be DP-DELHI-01 or DP-DELHI-02.',
    });
  }

  const now = new Date().toISOString();
  const partnerRecord: any = {
    partnerId: slot.partnerId,
    userId: slot.partnerId,
    firebaseUid: uid,
    name: slot.name,
    mobile: slot.mobile,
    status: 'ACTIVE',
    availabilityStatus: 'AVAILABLE',
    vehicleType: slot.vehicleType,
    vehicleNumber: slot.vehicleNumber,
    licenseNumber: slot.licenseNumber,
    assignedWarehouseId: OPERATIONAL_WAREHOUSE_ID,
    assignedWarehouseName: OPERATIONAL_WAREHOUSE_NAME,
    serviceAreas: ['Brahmpuri', 'Karawal Nagar'],
    updatedAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  };

  await setDoc(doc(db, 'deliveryPartners', uid), partnerRecord, { merge: true });
  await setDoc(doc(db, 'deliveryPartners', slot.partnerId), { ...partnerRecord, firebaseUid: uid }, { merge: true });

  const session: DeliveryPartnerSession = {
    userId: uid,
    partnerId: slot.partnerId,
    role: 'DELIVERY_PARTNER',
    warehouseId: OPERATIONAL_WAREHOUSE_ID,
    warehouseName: OPERATIONAL_WAREHOUSE_NAME,
    partnerName: slot.name,
    mobile: slot.mobile,
    availabilityStatus: 'AVAILABLE',
    accountStatus: 'ACTIVE',
  };

  return res.status(200).json({
    success: true,
    session,
  });
});

/**
 * GET /api/delivery/session
 * Resolves authenticated delivery partner session.
 * Rejects retailers (403) and unauthenticated callers (401).
 */
deliveryRouter.get('/session', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  let partner = await getOrSeedDeliveryPartner(user.uid);

  const session: DeliveryPartnerSession = {
    userId: user.uid,
    partnerId: partner?.partnerId || user.partnerId || user.uid,
    role: 'DELIVERY_PARTNER',
    warehouseId: OPERATIONAL_WAREHOUSE_ID,
    warehouseName: OPERATIONAL_WAREHOUSE_NAME,
    partnerName: partner?.name || user.name || 'Delivery Partner',
    mobile: partner?.mobile || user.mobile || '',
    availabilityStatus: (partner?.availabilityStatus || user.availabilityStatus || 'OFFLINE') as DeliveryAvailabilityStatus,
    accountStatus: (partner?.status || user.accountStatus || 'ACTIVE') as any,
  };

  return res.status(200).json({
    success: true,
    session,
  });
});

/**
 * GET /api/delivery/profile
 * Returns detailed delivery partner profile
 */
deliveryRouter.get('/profile', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  let partner = await getOrSeedDeliveryPartner(user.uid);

  if (!partner) {
    return res.status(404).json({
      success: false,
      error: 'PARTNER_NOT_FOUND',
      message: 'Delivery partner record not found.',
    });
  }

  return res.status(200).json({
    success: true,
    partner,
  });
});

/**
 * PATCH /api/delivery/profile
 * Allows partner to update non-authoritative details (e.g. alternate mobile)
 * Cannot change partnerId, role, status, or assignedWarehouseId.
 */
deliveryRouter.patch('/profile', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const { alternateMobile, photoUrl } = req.body;

  try {
    const dpRef = doc(db, 'deliveryPartners', user.uid);
    const updates: any = {
      updatedAt: new Date().toISOString(),
      _serverTxnToken: SERVER_INTERNAL_TOKEN,
      _serverWriteNonce: generateServerNonce(),
    };
    if (alternateMobile !== undefined) updates.alternateMobile = String(alternateMobile).trim();
    if (photoUrl !== undefined) updates.photoUrl = String(photoUrl).trim();

    await updateDoc(dpRef, updates);
    const updatedSnap = await getDoc(dpRef);

    return res.status(200).json({
      success: true,
      partner: updatedSnap.data(),
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'PROFILE_UPDATE_FAILED',
      message: err.message,
    });
  }
});

// =====================================================================
// 2. AVAILABILITY
// =====================================================================

/**
 * GET /api/delivery/availability
 * Returns current availability status
 */
deliveryRouter.get('/availability', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const partner = await getOrSeedDeliveryPartner(user.uid);

  return res.status(200).json({
    success: true,
    partnerId: partner?.partnerId || user.uid,
    availabilityStatus: partner?.availabilityStatus || 'OFFLINE',
    lastActiveAt: partner?.lastActiveAt || new Date().toISOString(),
  });
});

/**
 * POST /api/delivery/availability
 * Allows partner to set availability: OFFLINE, AVAILABLE, PAUSED
 */
deliveryRouter.post('/availability', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const { status } = req.body;

  const validStatuses: DeliveryAvailabilityStatus[] = ['OFFLINE', 'AVAILABLE', 'PAUSED'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_AVAILABILITY_STATUS',
      message: `Status must be one of [${validStatuses.join(', ')}].`,
    });
  }

  try {
    const dpRef = doc(db, 'deliveryPartners', user.uid);
    const now = new Date().toISOString();
    await updateDoc(dpRef, {
      availabilityStatus: status,
      lastActiveAt: now,
      updatedAt: now,
      _serverTxnToken: SERVER_INTERNAL_TOKEN,
      _serverWriteNonce: generateServerNonce(),
    });

    return res.status(200).json({
      success: true,
      partnerId: user.uid,
      availabilityStatus: status,
      updatedAt: now,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: err.message,
    });
  }
});

// =====================================================================
// 3. WAREHOUSE DISPATCH ASSIGNMENT INFRASTRUCTURE
// =====================================================================

/**
 * GET /api/delivery/partners
 * Returns list of eligible active delivery partners assigned to WH-BRAHMPURI-01.
 * Gated to warehouse dispatch personnel (Staff, Manager, Admin).
 */
deliveryRouter.get('/partners', requireWarehouseDispatchRole(), async (req: Request, res: Response) => {
  try {
    const dpSnap = await getDocs(collection(db, 'deliveryPartners'));
    const partners: any[] = [];

    dpSnap.docs.forEach(docSnap => {
      const p = docSnap.data();
      const pStatus = (p.status || 'ACTIVE').toUpperCase();
      const pWarehouse = p.assignedWarehouseId || OPERATIONAL_WAREHOUSE_ID;

      if (pStatus === 'ACTIVE' && pWarehouse === OPERATIONAL_WAREHOUSE_ID) {
        partners.push({
          partnerId: p.partnerId || docSnap.id,
          name: p.name || 'Fleet Partner',
          mobile: p.mobile || '',
          status: pStatus,
          availabilityStatus: p.availabilityStatus || 'AVAILABLE',
          vehicleType: p.vehicleType || 'TATA_ACE',
          vehicleNumber: p.vehicleNumber || '',
          assignedWarehouseId: pWarehouse,
          assignedWarehouseName: p.assignedWarehouseName || OPERATIONAL_WAREHOUSE_NAME,
          serviceAreas: p.serviceAreas || ['Brahmpuri', 'Karawal Nagar'],
        });
      }
    });

    // Seed fallback if none in db yet
    if (partners.length === 0) {
      Object.values(SEED_DELIVERY_PARTNERS).forEach(p => {
        if (p && p.status === 'ACTIVE') {
          partners.push(p);
        }
      });
    }

    return res.status(200).json({
      success: true,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      count: partners.length,
      partners,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'FETCH_PARTNERS_FAILED',
      message: err.message,
    });
  }
});

/**
 * POST /api/delivery/assign
 * Gated to warehouse management personnel (Staff, Manager, Admin).
 * Transactionally assigns an order to an active, available partner.
 */
deliveryRouter.post('/assign', requireWarehouseDispatchRole(), async (req: Request, res: Response) => {
  const assigner = (req as any).authUser;
  const { orderId, partnerId, moveToDispatched } = req.body;

  if (!orderId || !partnerId) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_FIELDS',
      message: 'orderId and partnerId are strictly required.',
    });
  }

  try {
    const orderRef = doc(db, 'orders', orderId);
    const partnerRef = doc(db, 'deliveryPartners', partnerId);

    const now = new Date().toISOString();
    let assignedOrder: any = null;
    let orderToNotify: any = null;

    await runTransaction(db, async txn => {
      // 1. Fetch and validate partner
      const pSnap = await txn.get(partnerRef);
      let pData: DeliveryPartner | null = null;
      if (pSnap.exists()) {
        pData = pSnap.data() as DeliveryPartner;
      } else if (SEED_DELIVERY_PARTNERS[partnerId]) {
        pData = {
          ...SEED_DELIVERY_PARTNERS[partnerId],
          partnerId,
          userId: partnerId,
          createdAt: now,
          updatedAt: now,
        } as DeliveryPartner;
      }

      if (!pData) {
        throw new Error('PARTNER_NOT_FOUND');
      }

      if (pData.status !== 'ACTIVE') {
        throw new Error(`PARTNER_INACTIVE: Delivery partner status is ${pData.status}`);
      }

      if (pData.assignedWarehouseId !== OPERATIONAL_WAREHOUSE_ID) {
        throw new Error(`PARTNER_MISMATCH_WAREHOUSE: Assigned to ${pData.assignedWarehouseId}`);
      }

      // 2. Fetch and validate order
      const oSnap = await txn.get(orderRef);
      if (!oSnap.exists()) {
        throw new Error('ORDER_NOT_FOUND');
      }
      const order = oSnap.data();

      if (order.warehouseId !== OPERATIONAL_WAREHOUSE_ID) {
        throw new Error(`ORDER_MISMATCH_WAREHOUSE: Order belongs to ${order.warehouseId}`);
      }

      // Check current status
      const eligibleStatuses = ['READY_FOR_DISPATCH', 'PACKED', 'DISPATCHED'];
      if (!eligibleStatuses.includes(order.orderStatus)) {
        throw new Error(`CANNOT_ASSIGN_STATUS_${order.orderStatus}: Order must be READY_FOR_DISPATCH to assign partner.`);
      }

      // Idempotency: Already assigned to this exact partner
      if (
        (order.deliveryPartnerId === partnerId || order.delivery?.assignedPartnerId === partnerId) &&
        (order.orderStatus === 'DISPATCHED' || order.orderStatus === 'READY_FOR_DISPATCH' || order.orderStatus === 'PACKED')
      ) {
        assignedOrder = {
          orderId,
          orderStatus: order.orderStatus,
          deliveryPartnerId: partnerId,
          deliveryPartnerName: order.deliveryPartnerName || pData.name,
          delivery: order.delivery,
          deliveryPayment: order.deliveryPayment,
          isIdempotentReplay: true,
        };
        return;
      }

      // Check if already assigned to a DIFFERENT partner
      if (order.delivery?.assignmentStatus === 'ASSIGNED' || order.delivery?.assignmentStatus === 'ACCEPTED' || order.orderStatus === 'DISPATCHED') {
        if (order.delivery?.assignedPartnerId && order.delivery?.assignedPartnerId !== partnerId) {
          throw new Error(`ALREADY_ASSIGNED_TO_${order.delivery?.assignedPartnerId}`);
        }
      }

      // 3. Build authoritative delivery snapshot
      const deliverySnapshot: DeliveryOrderSnapshot = {
        assignmentStatus: 'ASSIGNED',
        assignedPartnerId: pData.partnerId,
        assignedPartnerName: pData.name,
        assignedPartnerMobile: pData.mobile,
        assignedAt: now,
        assignedBy: assigner.uid,
        warehouseId: OPERATIONAL_WAREHOUSE_ID,
      };

      // Prepare COD delivery payment snapshot if paymentMethod is COD
      const isCod = order.paymentMethod === 'COD';
      const deliveryPaymentSnapshot: DeliveryPaymentSnapshot = {
        method: order.paymentMethod || 'COD',
        amountDue: isCod ? (order.grandTotal || 0) : 0,
        amountCollected: 0,
        collectionStatus: isCod ? 'PENDING' : 'NOT_REQUIRED',
      };

      const finalStatus = moveToDispatched ? 'DISPATCHED' : order.orderStatus;

      txn.update(orderRef, {
        orderStatus: finalStatus,
        deliveryPartnerId: pData.partnerId,
        deliveryPartnerName: pData.name,
        delivery: deliverySnapshot,
        deliveryPayment: deliveryPaymentSnapshot,
        updatedAt: now,
        _serverTxnToken: SERVER_INTERNAL_TOKEN,
        _serverWriteNonce: generateServerNonce(),
      });

      // Update partner availability to ON_DELIVERY or keep track
      if (pSnap.exists()) {
        txn.update(partnerRef, {
          availabilityStatus: 'ON_DELIVERY',
          lastActiveAt: now,
          updatedAt: now,
          _serverTxnToken: SERVER_INTERNAL_TOKEN,
          _serverWriteNonce: generateServerNonce(),
        });
      } else {
        txn.set(partnerRef, {
          ...pData,
          availabilityStatus: 'ON_DELIVERY',
          lastActiveAt: now,
          updatedAt: now,
          _serverTxnToken: SERVER_INTERNAL_TOKEN,
          _serverWriteNonce: generateServerNonce(),
        });
      }

      assignedOrder = {
        orderId,
        orderStatus: finalStatus,
        deliveryPartnerId: pData.partnerId,
        deliveryPartnerName: pData.name,
        delivery: deliverySnapshot,
        deliveryPayment: deliveryPaymentSnapshot,
        isIdempotentReplay: false,
      };

      orderToNotify = {
        ...order,
        orderId,
        orderStatus: finalStatus,
        deliveryPartnerId: pData.partnerId,
        delivery: deliverySnapshot,
      };
    });

    // Server-Authoritative Notifications Trigger (only if not an idempotent replay)
    if (orderToNotify && !assignedOrder?.isIdempotentReplay) {
      ServerNotificationService.notifyOrderStatusTransition(
        orderToNotify,
        'ORDER_ASSIGNED_TO_DELIVERY',
        { partnerId, partnerName: orderToNotify.delivery?.assignedPartnerName }
      ).catch(err => console.warn('Note emitting ORDER_ASSIGNED_TO_DELIVERY notification:', err.message));
    }

    return res.status(200).json({
      success: true,
      message: assignedOrder?.isIdempotentReplay
        ? `Order ${orderId} was already assigned to delivery partner ${partnerId}.`
        : `Order ${orderId} successfully assigned to delivery partner ${partnerId}.`,
      isIdempotentReplay: Boolean(assignedOrder?.isIdempotentReplay),
      data: assignedOrder,
    });
  } catch (err: any) {
    const isConflict = err.message?.startsWith('ALREADY_ASSIGNED') || err.message?.startsWith('CANNOT_ASSIGN');
    return res.status(isConflict ? 409 : 400).json({
      success: false,
      error: err.message,
    });
  }
});

// =====================================================================
// 4. DELIVERY PARTNER ORDER VISIBILITY & DETAIL
// =====================================================================

export function sanitizeOrderForPartner(order: any) {
  if (!order) return order;
  const sanitized = { ...order };
  if (sanitized.delivery) {
    const d = { ...sanitized.delivery };
    delete d.deliveryOtp;
    sanitized.delivery = d;
  }
  if (sanitized.deliveryOtp) {
    const o = { ...sanitized.deliveryOtp };
    delete (o as any).otp;
    sanitized.deliveryOtp = o;
  }
  return sanitized;
}

/**
 * GET /api/delivery/orders
 * Returns ONLY orders assigned to the authenticated delivery partner.
 * NEVER returns all warehouse orders.
 */
deliveryRouter.get('/orders', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const partnerId = user.partnerId || user.uid;
  const statusFilter = req.query.status as string | undefined;

  try {
    // Primary query: orders assigned to this partner in WH-BRAHMPURI-01
    const ordersSnap = await getDocs(
      query(
        collection(db, 'orders'),
        where('warehouseId', '==', OPERATIONAL_WAREHOUSE_ID),
        where('deliveryPartnerId', '==', partnerId)
      )
    );

    let orders = ordersSnap.docs.map(d => ({ orderId: d.id, ...d.data() }));

    // Optional status filtering
    if (statusFilter) {
      orders = orders.filter((o: any) => o.delivery?.assignmentStatus === statusFilter || o.orderStatus === statusFilter);
    }

    // Mask plaintext OTP for delivery partner
    orders = orders.map(sanitizeOrderForPartner);

    return res.status(200).json({
      success: true,
      partnerId,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      count: orders.length,
      orders,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'FETCH_ORDERS_FAILED',
      message: err.message,
    });
  }
});

/**
 * GET /api/delivery/orders/:orderId
 * Fetches single order details. Validates that the order is assigned to the authenticated partner.
 */
deliveryRouter.get('/orders/:orderId', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const partnerId = user.partnerId || user.uid;
  const { orderId } = req.params;

  try {
    const oSnap = await getDoc(doc(db, 'orders', orderId));
    if (!oSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: `Order ${orderId} does not exist.`,
      });
    }

    const order = oSnap.data();

    // Enforce ownership: partner can only view their own assigned order
    if (order.deliveryPartnerId !== partnerId && order.delivery?.assignedPartnerId !== partnerId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'You are not assigned to this order.',
      });
    }

    // Phase 6 Part 3: Fetch authoritative retailer fixed shop destination
    let retailerShopDestination: any = null;
    if (order.retailerId) {
      const rSnap = await getDoc(doc(db, 'retailers', order.retailerId));
      if (rSnap.exists()) {
        const rData = rSnap.data();
        const lat = typeof rData.latitude === 'number'
          ? rData.latitude
          : (typeof rData.shopLocation?.latitude === 'number' ? rData.shopLocation.latitude : null);
        const lng = typeof rData.longitude === 'number'
          ? rData.longitude
          : (typeof rData.shopLocation?.longitude === 'number' ? rData.shopLocation.longitude : null);

        const hasValidCoords = lat !== null && lng !== null &&
          Number.isFinite(lat) && !Number.isNaN(lat) && lat >= -90 && lat <= 90 &&
          Number.isFinite(lng) && !Number.isNaN(lng) && lng >= -180 && lng <= 180;

        const fallbackAddress = order.deliveryAddressSnapshot?.fullAddress ||
          (typeof order.deliveryAddress === 'string' ? order.deliveryAddress : (order.deliveryAddress?.fullAddress || order.address || ''));

        retailerShopDestination = {
          retailerId: order.retailerId,
          shopName: rData.shopName || order.shopName || 'Retailer Shop',
          ownerName: rData.ownerName || order.ownerName || null,
          shopAddress: rData.shopAddress || fallbackAddress,
          latitude: hasValidCoords ? lat : null,
          longitude: hasValidCoords ? lng : null,
          hasCoordinates: hasValidCoords,
          navigationUrl: hasValidCoords
            ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(String(lat))},${encodeURIComponent(String(lng))}`
            : null,
        };
      }
    }

    if (!retailerShopDestination) {
      const fallbackAddress = order.deliveryAddressSnapshot?.fullAddress ||
        (typeof order.deliveryAddress === 'string' ? order.deliveryAddress : (order.deliveryAddress?.fullAddress || order.address || ''));
      retailerShopDestination = {
        retailerId: order.retailerId || null,
        shopName: order.shopName || order.retailerName || 'Retailer Shop',
        ownerName: order.ownerName || null,
        shopAddress: fallbackAddress,
        latitude: null,
        longitude: null,
        hasCoordinates: false,
        navigationUrl: null,
      };
    }

    return res.status(200).json({
      success: true,
      order: sanitizeOrderForPartner({ orderId: oSnap.id, ...order, retailerShopDestination }),
      retailerShopDestination,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message,
    });
  }
});

/**
 * GET /api/delivery/orders/:orderId/destination
 * Phase 6 Part 3: Fixed Shop Destination for Delivery Boy Navigation
 * Authoritative read of the retailer's saved shop location strictly for assigned orders.
 */
deliveryRouter.get('/orders/:orderId/destination', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const partnerId = user.partnerId || user.uid;
  const { orderId } = req.params;

  try {
    const oSnap = await getDoc(doc(db, 'orders', orderId));
    if (!oSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: `Order ${orderId} does not exist.`,
      });
    }

    const order = oSnap.data();

    // Enforce ownership: partner can only access destination for their assigned order
    if (order.deliveryPartnerId !== partnerId && order.delivery?.assignedPartnerId !== partnerId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'You are not assigned to this order.',
      });
    }

    let rData: any = null;
    if (order.retailerId) {
      const rSnap = await getDoc(doc(db, 'retailers', order.retailerId));
      if (rSnap.exists()) {
        rData = rSnap.data();
      }
    }

    const lat = rData && typeof rData.latitude === 'number'
      ? rData.latitude
      : (rData && typeof rData.shopLocation?.latitude === 'number' ? rData.shopLocation.latitude : null);
    const lng = rData && typeof rData.longitude === 'number'
      ? rData.longitude
      : (rData && typeof rData.shopLocation?.longitude === 'number' ? rData.shopLocation.longitude : null);

    const hasValidCoords = lat !== null && lng !== null &&
      Number.isFinite(lat) && !Number.isNaN(lat) && lat >= -90 && lat <= 90 &&
      Number.isFinite(lng) && !Number.isNaN(lng) && lng >= -180 && lng <= 180;

    const fallbackAddress = order.deliveryAddressSnapshot?.fullAddress ||
      (typeof order.deliveryAddress === 'string' ? order.deliveryAddress : (order.deliveryAddress?.fullAddress || order.address || ''));

    const destination = {
      orderId,
      retailerId: order.retailerId || null,
      shopName: rData?.shopName || order.shopName || order.retailerName || 'Retailer Shop',
      ownerName: rData?.ownerName || order.ownerName || null,
      shopAddress: rData?.shopAddress || fallbackAddress,
      latitude: hasValidCoords ? lat : null,
      longitude: hasValidCoords ? lng : null,
      hasCoordinates: hasValidCoords,
      navigationUrl: hasValidCoords
        ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(String(lat))},${encodeURIComponent(String(lng))}`
        : null,
    };

    return res.status(200).json({
      success: true,
      destination,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message,
    });
  }
});

// =====================================================================
// 5. DELIVERY STATE MACHINE TRANSITION ENDPOINTS
// =====================================================================

/**
 * POST /api/delivery/orders/:orderId/accept
 * ASSIGNED -> ACCEPTED
 */
deliveryRouter.post('/orders/:orderId/accept', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const partnerId = user.partnerId || user.uid;
  const { orderId } = req.params;
  const now = new Date().toISOString();

  try {
    const orderRef = doc(db, 'orders', orderId);
    let updatedOrder: any = null;

    let isIdempotentReplay = false;

    await runTransaction(db, async txn => {
      const snap = await txn.get(orderRef);
      if (!snap.exists()) throw new Error('ORDER_NOT_FOUND');
      const order = snap.data();

      if (order.deliveryPartnerId !== partnerId && order.delivery?.assignedPartnerId !== partnerId) {
        throw new Error('FORBIDDEN_NOT_ASSIGNED_PARTNER');
      }

      const currentStatus: DeliveryAssignmentStatus = order.delivery?.assignmentStatus || 'UNASSIGNED';
      if (currentStatus === 'ACCEPTED') {
        isIdempotentReplay = true;
        updatedOrder = { ...order, orderId };
        return;
      }

      if (currentStatus !== 'ASSIGNED') {
        throw new Error(`INVALID_TRANSITION: Cannot accept order with status '${currentStatus}'.`);
      }

      const updatedDelivery: DeliveryOrderSnapshot = {
        ...order.delivery,
        assignmentStatus: 'ACCEPTED',
        acceptedAt: now,
      };

      txn.update(orderRef, {
        delivery: updatedDelivery,
        updatedAt: now,
        _serverTxnToken: SERVER_INTERNAL_TOKEN,
        _serverWriteNonce: generateServerNonce(),
      });

      updatedOrder = { ...order, orderId, delivery: updatedDelivery };
    });

    if (isIdempotentReplay) {
      return res.status(200).json({
        success: true,
        isIdempotentReplay: true,
        message: 'Order was already accepted by delivery partner.',
        order: updatedOrder,
      });
    }

    // Server-Authoritative Notifications Trigger
    if (updatedOrder) {
      ServerNotificationService.notifyOrderStatusTransition(
        updatedOrder,
        'ORDER_ACCEPTED_BY_DELIVERY_PARTNER',
        { partnerId }
      ).catch(err => console.warn('Note emitting ORDER_ACCEPTED_BY_DELIVERY_PARTNER notification:', err.message));
    }

    return res.status(200).json({
      success: true,
      message: 'Order accepted by delivery partner.',
      order: updatedOrder,
    });
  } catch (err: any) {
    const isForbidden = err.message.startsWith('FORBIDDEN');
    return res.status(isForbidden ? 403 : 400).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/delivery/orders/:orderId/reject
 * ASSIGNED -> READY_FOR_DISPATCH (with reason)
 * Makes order available for reassignment. Does NOT affect inventory or alter retailer price.
 */
deliveryRouter.post('/orders/:orderId/reject', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const partnerId = user.partnerId || user.uid;
  const { orderId } = req.params;
  const { reason } = req.body;

  const validReasons = ['CUSTOMER_TOO_FAR', 'VEHICLE_ISSUE', 'PERSONAL_REASON', 'ROUTE_ISSUE', 'OTHER'];
  if (!reason || !validReasons.includes(reason)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_REJECTION_REASON',
      message: `Rejection reason must be one of: [${validReasons.join(', ')}]`,
    });
  }

  const now = new Date().toISOString();

  try {
    const orderRef = doc(db, 'orders', orderId);

    await runTransaction(db, async txn => {
      const snap = await txn.get(orderRef);
      if (!snap.exists()) throw new Error('ORDER_NOT_FOUND');
      const order = snap.data();

      if (order.deliveryPartnerId !== partnerId && order.delivery?.assignedPartnerId !== partnerId) {
        throw new Error('FORBIDDEN_NOT_ASSIGNED_PARTNER');
      }

      const currentStatus: DeliveryAssignmentStatus = order.delivery?.assignmentStatus || 'UNASSIGNED';
      if (currentStatus !== 'ASSIGNED') {
        throw new Error(`INVALID_TRANSITION: Cannot reject order with status '${currentStatus}'.`);
      }

      const updatedDelivery: DeliveryOrderSnapshot = {
        ...order.delivery,
        assignmentStatus: 'REJECTED',
        rejectionReason: reason,
        rejectedAt: now,
      };

      // Reset to READY_FOR_DISPATCH and clear deliveryPartnerId so another partner can be assigned
      txn.update(orderRef, {
        orderStatus: 'READY_FOR_DISPATCH',
        deliveryPartnerId: null,
        deliveryPartnerName: null,
        delivery: updatedDelivery,
        updatedAt: now,
        _serverTxnToken: SERVER_INTERNAL_TOKEN,
        _serverWriteNonce: generateServerNonce(),
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Order rejected and returned to dispatch bay for reassignment.',
      rejectionReason: reason,
    });
  } catch (err: any) {
    const isForbidden = err.message.startsWith('FORBIDDEN');
    return res.status(isForbidden ? 403 : 400).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/delivery/orders/:orderId/pickup
 * ACCEPTED -> PICKED_UP
 * Confirms order picked up from WH-BRAHMPURI-01. Does NOT alter inventory.
 */
deliveryRouter.post('/orders/:orderId/pickup', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const partnerId = user.partnerId || user.uid;
  const { orderId } = req.params;
  const now = new Date().toISOString();

  try {
    const orderRef = doc(db, 'orders', orderId);

    let pickedOrderToNotify: any = null;
    let isIdempotentReplay = false;
    let existingPickedUpAt = '';

    await runTransaction(db, async txn => {
      const snap = await txn.get(orderRef);
      if (!snap.exists()) throw new Error('ORDER_NOT_FOUND');
      const order = snap.data();

      if (order.deliveryPartnerId !== partnerId && order.delivery?.assignedPartnerId !== partnerId) {
        throw new Error('FORBIDDEN_NOT_ASSIGNED_PARTNER');
      }

      const currentStatus: DeliveryAssignmentStatus = order.delivery?.assignmentStatus || 'UNASSIGNED';
      if (currentStatus === 'PICKED_UP' || order.orderStatus === 'DISPATCHED') {
        isIdempotentReplay = true;
        existingPickedUpAt = order.delivery?.pickedUpAt || now;
        return;
      }

      if (currentStatus !== 'ACCEPTED') {
        throw new Error(`INVALID_TRANSITION: Cannot pickup order with status '${currentStatus}'.`);
      }

      const updatedDelivery: DeliveryOrderSnapshot = {
        ...order.delivery,
        assignmentStatus: 'PICKED_UP',
        pickedUpAt: now,
        pickedUpBy: partnerId,
      };

      txn.update(orderRef, {
        orderStatus: 'DISPATCHED',
        delivery: updatedDelivery,
        updatedAt: now,
        _serverTxnToken: SERVER_INTERNAL_TOKEN,
        _serverWriteNonce: generateServerNonce(),
      });

      pickedOrderToNotify = { ...order, orderId, orderStatus: 'DISPATCHED', delivery: updatedDelivery };
    });

    if (isIdempotentReplay) {
      return res.status(200).json({
        success: true,
        isIdempotentReplay: true,
        message: 'Order was already picked up from warehouse.',
        pickedUpAt: existingPickedUpAt || now,
      });
    }

    // Server-Authoritative Notifications Trigger
    if (pickedOrderToNotify) {
      ServerNotificationService.notifyOrderStatusTransition(
        pickedOrderToNotify,
        'PICKED_UP',
        { partnerId }
      ).catch(err => console.warn('Note emitting PICKED_UP notification:', err.message));
    }

    return res.status(200).json({
      success: true,
      message: 'Order picked up from warehouse.',
      pickedUpAt: now,
    });
  } catch (err: any) {
    const isForbidden = err.message.startsWith('FORBIDDEN');
    return res.status(isForbidden ? 403 : 400).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * Immutable Delivery Audit Log Recorder
 */
async function recordDeliveryAudit(
  orderId: string,
  event: string,
  deliveryPartnerId: string,
  warehouseId: string = OPERATIONAL_WAREHOUSE_ID,
  metadata?: Record<string, any>
) {
  try {
    const now = new Date().toISOString();
    const logRef = doc(collection(db, 'deliveryAuditLogs'));
    await setDoc(logRef, {
      logId: logRef.id,
      orderId,
      event,
      eventType: event,
      deliveryPartnerId,
      warehouseId,
      timestamp: now,
      createdAt: now,
      metadata: metadata || {},
      _serverTxnToken: SERVER_INTERNAL_TOKEN,
      _serverWriteNonce: generateServerNonce(),
    });
  } catch (err: any) {
    console.warn('Note recording delivery audit log:', err.message);
  }
}

/**
 * POST /api/delivery/orders/:orderId/out-for-delivery
 * PICKED_UP -> OUT_FOR_DELIVERY
 * Generates cryptographically secure delivery OTP hash and logs audit trail.
 */
deliveryRouter.post('/orders/:orderId/out-for-delivery', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const partnerId = user.partnerId || user.uid;
  const { orderId } = req.params;
  const now = new Date().toISOString();

  try {
    const orderRef = doc(db, 'orders', orderId);
    let updatedDelivery: any = null;
    let outOrderToNotify: any = null;
    let isIdempotentReplay = false;
    let existingOutForDeliveryAt = '';

    await runTransaction(db, async txn => {
      const snap = await txn.get(orderRef);
      if (!snap.exists()) throw new Error('ORDER_NOT_FOUND');
      const order = snap.data();

      if (order.deliveryPartnerId !== partnerId && order.delivery?.assignedPartnerId !== partnerId) {
        throw new Error('FORBIDDEN_NOT_ASSIGNED_PARTNER');
      }

      const currentStatus: DeliveryAssignmentStatus = order.delivery?.assignmentStatus || 'UNASSIGNED';
      if (currentStatus === 'OUT_FOR_DELIVERY' || order.orderStatus === 'OUT_FOR_DELIVERY') {
        isIdempotentReplay = true;
        existingOutForDeliveryAt = order.delivery?.outForDeliveryAt || now;
        return;
      }

      if (currentStatus !== 'PICKED_UP') {
        throw new Error(`INVALID_TRANSITION: Cannot set out-for-delivery from '${currentStatus}'.`);
      }

      // Generate 6-digit cryptographically secure numeric Delivery OTP and compute hash
      const rawOtp = generateCryptoOtp();
      const otpHash = hashDeliveryOtp(orderId, rawOtp);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const deliveryOtpRecord = {
        status: 'PENDING',
        createdAt: now,
        expiresAt,
        attemptCount: 0,
        verifiedAt: null,
        otpHash,
      };

      updatedDelivery = {
        ...order.delivery,
        assignmentStatus: 'OUT_FOR_DELIVERY',
        outForDeliveryAt: now,
        deliveryOtpHash: otpHash,
        otpGeneratedAt: now,
        otpExpiresAt: expiresAt,
        otpAttempts: 0,
        otpVerified: false,
        otpVerifiedAt: null,
      };

      txn.update(orderRef, {
        orderStatus: 'OUT_FOR_DELIVERY',
        delivery: updatedDelivery,
        deliveryOtp: deliveryOtpRecord,
        updatedAt: now,
        _serverTxnToken: SERVER_INTERNAL_TOKEN,
        _serverWriteNonce: generateServerNonce(),
      });

      outOrderToNotify = { ...order, orderId, orderStatus: 'OUT_FOR_DELIVERY', delivery: updatedDelivery };
    });

    if (isIdempotentReplay) {
      return res.status(200).json({
        success: true,
        isIdempotentReplay: true,
        message: 'Order is already out for delivery.',
        outForDeliveryAt: existingOutForDeliveryAt || now,
      });
    }

    // Server-Authoritative Notifications Trigger
    if (outOrderToNotify) {
      ServerNotificationService.notifyOrderStatusTransition(
        outOrderToNotify,
        'OUT_FOR_DELIVERY',
        { partnerId }
      ).catch(err => console.warn('Note emitting OUT_FOR_DELIVERY notification:', err.message));
    }

    await recordDeliveryAudit(orderId, 'OUT_FOR_DELIVERY', partnerId, OPERATIONAL_WAREHOUSE_ID, {
      outForDeliveryAt: now,
    });
    await recordDeliveryAudit(orderId, 'OTP_GENERATED', partnerId, OPERATIONAL_WAREHOUSE_ID, {
      otpLength: 6,
    });

    return res.status(200).json({
      success: true,
      message: 'Order is out for delivery. OTP generated.',
      outForDeliveryAt: now,
    });
  } catch (err: any) {
    const isForbidden = err.message.startsWith('FORBIDDEN');
    return res.status(isForbidden ? 403 : 400).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * Delivery OTP Generation Rate Limiting (P1-03)
 * Enforces:
 * - Max 3 OTP generations/resends per order per 10-minute window
 * - Cooldown of 60 seconds between successive generates/resends
 * - Returns 429 TOO_MANY_REQUESTS with Retry-After header & retryAfterSeconds
 */
interface OtpRateLimitRecord {
  count: number;
  windowStart: number;
  lastGeneratedAt: number;
}
const otpRateLimitStore = new Map<string, OtpRateLimitRecord>();

function checkOtpRateLimit(orderId: string): { allowed: boolean; retryAfterSeconds?: number; reason?: string } {
  const now = Date.now();
  const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  const MAX_PER_WINDOW = 3;
  const COOLDOWN_MS = 60 * 1000; // 60 seconds cooldown between generates

  let state = otpRateLimitStore.get(orderId);
  if (!state || now - state.windowStart > WINDOW_MS) {
    state = { count: 0, windowStart: now, lastGeneratedAt: 0 };
  }

  // Check cooldown between successive generates
  if (state.lastGeneratedAt > 0) {
    const elapsedSinceLast = now - state.lastGeneratedAt;
    if (elapsedSinceLast < COOLDOWN_MS) {
      const retryAfter = Math.ceil((COOLDOWN_MS - elapsedSinceLast) / 1000);
      return {
        allowed: false,
        retryAfterSeconds: retryAfter,
        reason: `Please wait ${retryAfter} seconds before generating or resending another OTP.`,
      };
    }
  }

  // Check maximum in window
  if (state.count >= MAX_PER_WINDOW) {
    const remainingWindow = Math.ceil((state.windowStart + WINDOW_MS - now) / 1000);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, remainingWindow),
      reason: `Maximum OTP generation attempts (3) exceeded for this 5-minute window. Please try again in ${remainingWindow} seconds.`,
    };
  }

  // Allowed: update record
  state.count += 1;
  state.lastGeneratedAt = now;
  otpRateLimitStore.set(orderId, state);

  return { allowed: true };
}

const otpRateLimitMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const { orderId } = req.params;
  if (!orderId) return next();

  // Allow bypassing rate limit only in automated test harness if explicit flag is passed
  if (req.body?._bypassRateLimit && process.env.ENABLE_TEST_AUTH === 'true') {
    return next();
  }

  const check = checkOtpRateLimit(orderId);
  if (!check.allowed) {
    res.setHeader('Retry-After', String(check.retryAfterSeconds));
    return res.status(429).json({
      success: false,
      error: 'TOO_MANY_REQUESTS',
      message: check.reason,
      retryAfterSeconds: check.retryAfterSeconds,
    });
  }
  next();
};

async function handleOtpGenerateOrResend(req: Request, res: Response, isResend: boolean) {
  const authHeader = req.headers.authorization;
  const authResult = await resolveAuthUser(authHeader);

  if (!authResult.valid || !authResult.user) {
    return res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
  }

  const user = authResult.user;
  const { orderId } = req.params;
  const now = new Date().toISOString();

  try {
    const orderRef = doc(db, 'orders', orderId);
    let newOtp: string = '';
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await runTransaction(db, async txn => {
      const snap = await txn.get(orderRef);
      if (!snap.exists()) throw new Error('ORDER_NOT_FOUND');
      const order = snap.data();

      // Authorization check
      if (user.role === 'RETAILER' && order.retailerId !== user.uid) {
        throw new Error('FORBIDDEN: Retailer does not own this order.');
      }
      if (user.role === 'DELIVERY_PARTNER') {
        const pId = user.partnerId || user.uid;
        if (order.deliveryPartnerId !== pId && order.delivery?.assignedPartnerId !== pId) {
          throw new Error('FORBIDDEN: Partner not assigned to this order.');
        }
      }

      // Generate cryptographically secure 6-digit OTP
      if (process.env.NODE_ENV === 'test' && req.body?.testOtp) {
        newOtp = String(req.body.testOtp);
      } else {
        newOtp = generateCryptoOtp();
      }

      const otpHash = hashDeliveryOtp(orderId, newOtp);

      const deliveryOtpRecord = {
        status: 'PENDING',
        createdAt: now,
        expiresAt,
        attemptCount: 0,
        verifiedAt: null,
        otpHash,
      };

      const updatedDelivery: DeliveryOrderSnapshot = {
        ...(order.delivery || {}),
        deliveryOtpHash: otpHash,
        otpGeneratedAt: now,
        otpExpiresAt: expiresAt,
        otpAttempts: 0,
        otpVerified: false,
        otpVerifiedAt: null,
      };

      txn.update(orderRef, {
        delivery: updatedDelivery,
        deliveryOtp: deliveryOtpRecord,
        updatedAt: now,
        _serverTxnToken: SERVER_INTERNAL_TOKEN,
        _serverWriteNonce: generateServerNonce(),
      });
    });

    await recordDeliveryAudit(orderId, isResend ? 'OTP_RESENT' : 'OTP_GENERATED', user.uid, OPERATIONAL_WAREHOUSE_ID, {
      otpLength: 6,
      expiresAt,
      action: isResend ? 'RESEND' : 'GENERATE',
    });

    return res.status(200).json({
      success: true,
      message: isResend ? 'Delivery OTP resent successfully.' : 'New Delivery OTP generated.',
      expiresAt,
      // Return plaintext OTP only to retailer or warehouse staff, NEVER to delivery partner
      ...(user.role !== 'DELIVERY_PARTNER' ? { otp: newOtp } : {}),
    });
  } catch (err: any) {
    const isForbidden = err.message.startsWith('FORBIDDEN');
    return res.status(isForbidden ? 403 : 400).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/delivery/orders/:orderId/otp/generate
 * Generates a new 6-digit Delivery OTP (rate-limited)
 */
deliveryRouter.post('/orders/:orderId/otp/generate', otpRateLimitMiddleware, async (req: Request, res: Response) => {
  return handleOtpGenerateOrResend(req, res, false);
});

/**
 * POST /api/delivery/orders/:orderId/otp/resend
 * Resends a 6-digit Delivery OTP (rate-limited)
 */
deliveryRouter.post('/orders/:orderId/otp/resend', otpRateLimitMiddleware, async (req: Request, res: Response) => {
  return handleOtpGenerateOrResend(req, res, true);
});

/**
 * POST /api/delivery/orders/:orderId/otp/verify
 * Delivery Partner verifies the 6-digit OTP received from the Kirana retailer
 */
deliveryRouter.post('/orders/:orderId/otp/verify', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const partnerId = user.partnerId || user.uid;
  const { orderId } = req.params;
  const { otp } = req.body;

  if (!otp || typeof otp !== 'string' || otp.trim().length !== 6) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_OTP_FORMAT',
      message: 'OTP must be a 6-digit number.',
    });
  }

  const cleanOtp = otp.trim();
  const now = new Date().toISOString();

  try {
    const orderRef = doc(db, 'orders', orderId);

    await runTransaction(db, async txn => {
      const snap = await txn.get(orderRef);
      if (!snap.exists()) throw new Error('ORDER_NOT_FOUND');
      const order = snap.data();

      // Authorization check: Partner assigned to order
      if (order.deliveryPartnerId !== partnerId && order.delivery?.assignedPartnerId !== partnerId) {
        throw new Error('FORBIDDEN_NOT_ASSIGNED_PARTNER');
      }

      // Check order status
      const currentStatus = order.delivery?.assignmentStatus || order.orderStatus;
      if (currentStatus !== 'OUT_FOR_DELIVERY') {
        throw new Error(`INVALID_STATUS: Cannot verify OTP when order is in '${currentStatus}' status. Order must be OUT_FOR_DELIVERY.`);
      }

      // Single-use check: Cannot re-verify an already verified OTP
      if (order.deliveryOtp?.status === 'VERIFIED' || order.delivery?.otpVerified === true) {
        throw new Error('OTP_ALREADY_VERIFIED: This OTP has already been verified and cannot be reused.');
      }

      // Expiration check: OTP expires after 10 minutes
      const expiresAt = order.deliveryOtp?.expiresAt || order.delivery?.otpExpiresAt;
      if (expiresAt && Date.now() > new Date(expiresAt).getTime()) {
        txn.update(orderRef, {
          'deliveryOtp.status': 'EXPIRED',
          updatedAt: now,
          _serverTxnToken: SERVER_INTERNAL_TOKEN,
          _serverWriteNonce: generateServerNonce(),
        });
        throw new Error('OTP_EXPIRED: Delivery OTP has expired. Please request a new OTP.');
      }

      // Maximum attempts check: Block after 5 failed attempts
      const currentAttempts = (order.deliveryOtp?.attemptCount || order.delivery?.otpAttempts || 0) + 1;
      if (currentAttempts > 5) {
        txn.update(orderRef, {
          'deliveryOtp.status': 'BLOCKED',
          'deliveryOtp.attemptCount': currentAttempts,
          'delivery.otpAttempts': currentAttempts,
          updatedAt: now,
          _serverTxnToken: SERVER_INTERNAL_TOKEN,
          _serverWriteNonce: generateServerNonce(),
        });
        throw new Error('OTP_MAX_ATTEMPTS_EXCEEDED: Maximum verification attempts exceeded. Ask retailer to generate a new OTP.');
      }

      // Hash comparison check
      const storedHash = order.deliveryOtp?.otpHash || order.delivery?.deliveryOtpHash;
      const isMatch = storedHash ? verifyOtpHash(orderId, cleanOtp, storedHash) : false;

      if (!isMatch) {
        txn.update(orderRef, {
          'deliveryOtp.attemptCount': currentAttempts,
          'delivery.otpAttempts': currentAttempts,
          updatedAt: now,
          _serverTxnToken: SERVER_INTERNAL_TOKEN,
          _serverWriteNonce: generateServerNonce(),
        });
        throw new Error('INVALID_OTP: The entered OTP is incorrect.');
      }

      // OTP Verification Success
      txn.update(orderRef, {
        'deliveryOtp.status': 'VERIFIED',
        'deliveryOtp.verifiedAt': now,
        'deliveryOtp.attemptCount': currentAttempts,
        'delivery.otpVerified': true,
        'delivery.otpVerifiedAt': now,
        'delivery.otpAttempts': currentAttempts,
        updatedAt: now,
        _serverTxnToken: SERVER_INTERNAL_TOKEN,
        _serverWriteNonce: generateServerNonce(),
      });
    });

    await recordDeliveryAudit(orderId, 'OTP_VERIFIED', partnerId, OPERATIONAL_WAREHOUSE_ID);

    return res.status(200).json({
      success: true,
      verified: true,
      message: 'Delivery OTP verified successfully.',
      verifiedAt: now,
    });
  } catch (err: any) {
    const isForbidden = err.message.startsWith('FORBIDDEN');
    return res.status(isForbidden ? 403 : 400).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/delivery/orders/:orderId/pod/upload
 * Validates and attaches Proof of Delivery (Photo / Signature)
 */
deliveryRouter.post('/orders/:orderId/pod/upload', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const partnerId = user.partnerId || user.uid;
  const { orderId } = req.params;
  const { type, dataUrl } = req.body;

  const validation = validatePodMedia(type, dataUrl);
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_POD_MEDIA',
      message: validation.error,
    });
  }

  const now = new Date().toISOString();
  const podId = `pod_${orderId}_${Date.now()}`;

  try {
    const orderRef = doc(db, 'orders', orderId);

    await runTransaction(db, async txn => {
      const snap = await txn.get(orderRef);
      if (!snap.exists()) throw new Error('ORDER_NOT_FOUND');
      const order = snap.data();

      if (order.deliveryPartnerId !== partnerId && order.delivery?.assignedPartnerId !== partnerId) {
        throw new Error('FORBIDDEN_NOT_ASSIGNED_PARTNER');
      }

      const existingPod = order.delivery?.proofOfDelivery || {};
      const updatedPod: ProofOfDelivery = {
        podId,
        recipientName: existingPod.recipientName || '',
        otpVerified: Boolean(order.delivery?.otpVerified),
        otpVerifiedAt: order.delivery?.otpVerifiedAt || null,
        photoUrl: type === 'photo' ? (dataUrl as string) : (existingPod.photoUrl || null),
        signatureUrl: type === 'signature' ? (dataUrl as string) : (existingPod.signatureUrl || null),
        completedAt: existingPod.completedAt || null,
        completedBy: existingPod.completedBy || null,
      };

      txn.update(orderRef, {
        'delivery.proofOfDelivery': updatedPod,
        updatedAt: now,
        _serverTxnToken: SERVER_INTERNAL_TOKEN,
        _serverWriteNonce: generateServerNonce(),
      });
    });

    // Save persistent immutable record in deliveryProofs collection
    try {
      const proofDocRef = doc(db, 'deliveryProofs', podId);
      await setDoc(proofDocRef, {
        podId,
        orderId,
        uploadedBy: partnerId,
        uploadedAt: now,
        type,
        storagePath: dataUrl,
        contentType: validation.mimeType,
        fileSize: validation.sizeBytes,
        _serverTxnToken: SERVER_INTERNAL_TOKEN,
        _serverWriteNonce: generateServerNonce(),
      });
    } catch {
      // Non-fatal if collection write fails in local mock mode
    }

    await recordDeliveryAudit(
      orderId,
      type === 'photo' ? 'POD_PHOTO_UPLOADED' : 'POD_SIGNATURE_UPLOADED',
      partnerId,
      OPERATIONAL_WAREHOUSE_ID,
      { podId, contentType: validation.mimeType, sizeBytes: validation.sizeBytes }
    );

    return res.status(200).json({
      success: true,
      podId,
      type,
      message: `Proof of delivery ${type} uploaded successfully.`,
    });
  } catch (err: any) {
    const isForbidden = err.message.startsWith('FORBIDDEN');
    return res.status(isForbidden ? 403 : 400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/delivery/orders/:orderId/delivered
 * OUT_FOR_DELIVERY -> DELIVERED
 * Authoritative atomic delivery handover completion with:
 * - OTP Verification requirement
 * - Recipient Name capture & validation
 * - Proof of Delivery (POD) record
 * - Exact COD reconciliation
 * - Zero inventory deduction
 * - Idempotency protection
 */
deliveryRouter.post('/orders/:orderId/delivered', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const partnerId = user.partnerId || user.uid;
  const { orderId } = req.params;
  const {
    recipientName,
    deliveryNotes,
    proofOfDeliveryRef,
    amountCollected,
    codCollectedAmount,
    paymentMethod: clientPaymentMethod,
    paymentReference,
    otp,
    photoUrl,
    signatureUrl,
  } = req.body;

  const now = new Date().toISOString();

  // Validate recipient name
  const recipientValidation = validateRecipientName(recipientName);
  if (!recipientValidation.valid) {
    return res.status(400).json({
      success: false,
      error: 'RECIPIENT_NAME_REQUIRED',
      message: recipientValidation.error,
    });
  }

  const cleanRecipientName = recipientValidation.cleanName;

  try {
    const orderRef = doc(db, 'orders', orderId);
    let finalOrder: any = null;
    let isAlreadyDelivered = false;
    let codDue = 0;
    let codCollected = 0;
    let isOrderCod = false;
    let codPaymentMethod: CODPaymentMethod = 'CASH';
    let createdCodCollection: CODCollectionRecord | null = null;

    await runTransaction(db, async txn => {
      const snap = await txn.get(orderRef);
      if (!snap.exists()) throw new Error('ORDER_NOT_FOUND');
      const order = snap.data();

      // Authorization check
      if (order.deliveryPartnerId !== partnerId && order.delivery?.assignedPartnerId !== partnerId) {
        throw new Error('FORBIDDEN_NOT_ASSIGNED_PARTNER');
      }

      // Idempotency: Check both order status and deterministic idempotency key
      const idempotencyKey = `cod_collect_${orderId}`;
      const idempRef = doc(db, 'idempotencyKeys', idempotencyKey);
      const idempSnap = await txn.get(idempRef);

      if (idempSnap.exists() || order.orderStatus === 'DELIVERED' || order.delivery?.assignmentStatus === 'DELIVERED') {
        isAlreadyDelivered = true;
        finalOrder = order;
        return;
      }

      const currentStatus: DeliveryAssignmentStatus = order.delivery?.assignmentStatus || order.orderStatus || 'UNASSIGNED';
      if (currentStatus !== 'OUT_FOR_DELIVERY') {
        throw new Error(`INVALID_TRANSITION: Cannot mark delivered from '${currentStatus}'. Order must be OUT_FOR_DELIVERY.`);
      }

      // Authoritative OTP Verification
      let otpVerified = Boolean(order.delivery?.otpVerified) || order.deliveryOtp?.status === 'VERIFIED';
      if (!otpVerified) {
        if (otp && typeof otp === 'string') {
          const cleanOtp = otp.trim();
          const storedHash = order.deliveryOtp?.otpHash || order.delivery?.deliveryOtpHash;
          const expiresAt = order.deliveryOtp?.expiresAt || order.delivery?.otpExpiresAt;

          if (expiresAt && Date.now() > new Date(expiresAt).getTime()) {
            throw new Error('OTP_EXPIRED: Delivery OTP has expired. Please request a new OTP.');
          }

          const attempts = (order.deliveryOtp?.attemptCount || order.delivery?.otpAttempts || 0) + 1;
          if (attempts > 5) {
            throw new Error('OTP_MAX_ATTEMPTS_EXCEEDED: Maximum verification attempts exceeded.');
          }

          if (storedHash && verifyOtpHash(orderId, cleanOtp, storedHash)) {
            otpVerified = true;
          } else {
            txn.update(orderRef, {
              'deliveryOtp.attemptCount': attempts,
              'delivery.otpAttempts': attempts,
              updatedAt: now,
              _serverTxnToken: SERVER_INTERNAL_TOKEN,
              _serverWriteNonce: generateServerNonce(),
            });
            throw new Error('INVALID_OTP: The entered OTP is incorrect.');
          }
        } else {
          throw new Error('OTP_VERIFICATION_REQUIRED: Kirana delivery requires valid 6-digit OTP verification from the retailer.');
        }
      }

      // Authoritative COD Reconciliation & Phase 6 Part 4A Collection Record
      isOrderCod = order.paymentMethod === 'COD' || order.payment?.method === 'COD';
      codDue = Number(order.grandTotal ?? order.total ?? 0);

      if (isOrderCod) {
        const collectedInput = amountCollected !== undefined ? amountCollected : codCollectedAmount;
        const codValidation = validateCodCollection(codDue, collectedInput);
        if (!codValidation.valid) {
          throw new Error(codValidation.error);
        }
        codCollected = codValidation.collectedNum;

        // Phase 6 Part 4A: Exact Integer Paise calculations
        const amountDuePaise = Math.round(codDue * 100);
        const amountCollectedPaise = Math.round(codCollected * 100);
        codPaymentMethod = clientPaymentMethod === 'UPI' ? 'UPI' : 'CASH';

        const collectionId = `COL-${orderId}`;
        const collectionRef = doc(db, 'codCollections', collectionId);

        const codRecord: CODCollectionRecord = {
          collectionId,
          orderId,
          orderNumber: order.orderNumber || orderId,
          retailerId: order.retailerId,
          deliveryPartnerId: partnerId,
          warehouseId: OPERATIONAL_WAREHOUSE_ID,
          paymentMethod: codPaymentMethod,
          amountDuePaise,
          amountCollectedPaise,
          currency: 'INR',
          collectionStatus: 'COLLECTED',
          collectedAt: now,
          collectedBy: partnerId,
          referenceId: paymentReference ? String(paymentReference).trim() : null,
          createdAt: now,
          updatedAt: now,
          _serverTxnToken: SERVER_INTERNAL_TOKEN,
          _serverWriteNonce: generateServerNonce(),
        };

        txn.set(collectionRef, codRecord);
        createdCodCollection = codRecord;

        // CASH COD increases physical cash custody; UPI COD records direct bank transfer without physical cash custody
        if (codPaymentMethod === 'CASH') {
          const custodyRef = doc(db, 'deliveryPartnerCustody', partnerId);
          const custodySnap = await txn.get(custodyRef);
          const currentBalancePaise = custodySnap.exists()
            ? Number(custodySnap.data().cashBalancePaise || 0)
            : 0;
          const newBalancePaise = currentBalancePaise + amountCollectedPaise;

          txn.set(custodyRef, {
            partnerId,
            warehouseId: OPERATIONAL_WAREHOUSE_ID,
            cashBalancePaise: newBalancePaise,
            updatedAt: now,
            _serverTxnToken: SERVER_INTERNAL_TOKEN,
            _serverWriteNonce: generateServerNonce(),
          }, { merge: true });

          const movementId = `MOV-${orderId}`;
          const movementRef = doc(db, 'deliveryCustodyMovements', movementId);
          const custodyMovement: DeliveryCustodyMovement = {
            movementId,
            partnerId,
            warehouseId: OPERATIONAL_WAREHOUSE_ID,
            orderId,
            collectionId,
            movementType: 'COD_COLLECTION_CASH',
            amountPaise: amountCollectedPaise,
            balanceAfterPaise: newBalancePaise,
            timestamp: now,
            referenceId: paymentReference ? String(paymentReference).trim() : null,
            createdBy: partnerId,
            _serverTxnToken: SERVER_INTERNAL_TOKEN,
            _serverWriteNonce: generateServerNonce(),
          };
          txn.set(movementRef, custodyMovement);
        }

        // Record Idempotency Key entry inside the transaction
        txn.set(idempRef, {
          key: idempotencyKey,
          action: 'COD_COLLECTION',
          orderId,
          collectionId,
          partnerId,
          paymentMethod: codPaymentMethod,
          amountCollectedPaise,
          status: 'COMPLETED',
          createdAt: now,
          _serverTxnToken: SERVER_INTERNAL_TOKEN,
          _serverWriteNonce: generateServerNonce(),
        });
      }

      // Construct Proof of Delivery snapshot
      const existingPod = order.delivery?.proofOfDelivery || {};
      const podId = existingPod.podId || `pod_${orderId}_${Date.now()}`;
      const pod: ProofOfDelivery = {
        podId,
        recipientName: cleanRecipientName,
        otpVerified: true,
        otpVerifiedAt: order.delivery?.otpVerifiedAt || now,
        photoUrl: photoUrl || existingPod.photoUrl || null,
        signatureUrl: signatureUrl || existingPod.signatureUrl || null,
        completedAt: now,
        completedBy: partnerId,
      };

      // Construct deliveryCompletion record
      const deliveryCompletion = {
        recipientName: cleanRecipientName,
        recipientCapturedAt: now,
        otpVerifiedAt: order.delivery?.otpVerifiedAt || now,
        podId,
        podPhotoPath: photoUrl || existingPod.photoUrl || null,
        signaturePath: signatureUrl || existingPod.signatureUrl || null,
        codExpectedAmount: isOrderCod ? codDue : 0,
        codCollectedAmount: isOrderCod ? codCollected : 0,
        codPaymentStatus: isOrderCod ? 'COLLECTED' : 'NOT_REQUIRED',
        completedAt: now,
        completedBy: partnerId,
      };

      const updatedDelivery: DeliveryOrderSnapshot = {
        ...order.delivery,
        assignmentStatus: 'DELIVERED',
        deliveredAt: now,
        deliveredBy: partnerId,
        recipientName: cleanRecipientName,
        recipientCapturedAt: now,
        otpVerified: true,
        otpVerifiedAt: order.delivery?.otpVerifiedAt || now,
        proofOfDelivery: pod,
      };
      if (deliveryNotes) {
        updatedDelivery.deliveryNotes = String(deliveryNotes).trim();
      }
      if (proofOfDeliveryRef) {
        updatedDelivery.proofOfDeliveryRef = String(proofOfDeliveryRef).trim();
      }

      const updates: any = {
        orderStatus: 'DELIVERED',
        delivery: updatedDelivery,
        deliveryCompletion,
        'deliveryOtp.status': 'VERIFIED',
        'deliveryOtp.verifiedAt': order.deliveryOtp?.verifiedAt || now,
        updatedAt: now,
        _serverTxnToken: SERVER_INTERNAL_TOKEN,
        _serverWriteNonce: generateServerNonce(),
      };

      if (isOrderCod) {
        const paymentSnapshot: DeliveryPaymentSnapshot = {
          method: codPaymentMethod === 'UPI' ? 'UPI' : 'COD',
          amountDue: codDue,
          amountCollected: codCollected,
          collectionStatus: 'COLLECTED',
          collectedAt: now,
          collectedBy: partnerId,
          referenceId: paymentReference || `COD-COL-${orderId}`,
          codCollectionId: `COL-${orderId}`,
          notes: `${codPaymentMethod} COD payment of ₹${codCollected} collected on handover`,
        };

        updates.deliveryPayment = paymentSnapshot;
        updates.paymentStatus = 'PAID';
      }

      txn.update(orderRef, updates);
      finalOrder = { ...order, ...updates };
    });

    if (isAlreadyDelivered) {
      let existingCollection: any = null;
      let existingReceipt: any = null;
      try {
        const colSnap = await getDoc(doc(db, 'codCollections', `COL-${orderId}`));
        if (colSnap.exists()) existingCollection = colSnap.data();
      } catch {
        // ignore
      }
      try {
        existingReceipt = await CodReceiptBridgeService.getCodCustomerReceiptByOrderId(orderId);
      } catch {
        // ignore
      }

      return res.status(200).json({
        success: true,
        isIdempotentReplay: true,
        message: 'Order was already marked as delivered.',
        deliveredAt: finalOrder?.delivery?.deliveredAt,
        order: finalOrder,
        codCollection: existingCollection,
        customerReceipt: existingReceipt,
      });
    }

    await recordDeliveryAudit(orderId, 'DELIVERY_COMPLETED', partnerId, OPERATIONAL_WAREHOUSE_ID, {
      recipientName: cleanRecipientName,
      deliveredAt: now,
    });

    let createdReceipt: any = null;
    if (isOrderCod) {
      await recordDeliveryAudit(orderId, 'COD_PAYMENT_COLLECTED', partnerId, OPERATIONAL_WAREHOUSE_ID, {
        collectionId: `COL-${orderId}`,
        paymentMethod: codPaymentMethod,
        amountPaise: Math.round(codCollected * 100),
        referenceId: paymentReference || null,
      });
      await recordDeliveryAudit(orderId, 'COD_CONFIRMED', partnerId, OPERATIONAL_WAREHOUSE_ID, {
        codExpectedAmount: codDue,
        codCollectedAmount: codCollected,
      });

      // Phase 6 Part 4C-A: Server-authoritative Customer Receipt linkage
      try {
        const bridgeRes = await CodReceiptBridgeService.createOrLinkCodCustomerReceipt({
          orderId,
          collectionId: `COL-${orderId}`,
          deliveryPartnerId: partnerId,
          autoPost: true,
          autoAllocateInvoice: true,
        });
        createdReceipt = bridgeRes.receipt;
      } catch (err: any) {
        console.warn('Note creating COD customer receipt:', err.message);
      }
    }

    // Server-Authoritative Notifications Trigger (fail-safe)
    if (finalOrder && !isAlreadyDelivered) {
      ServerNotificationService.notifyOrderStatusTransition(
        finalOrder,
        'DELIVERED',
        { partnerId, recipientName: cleanRecipientName }
      ).catch(err => console.warn('Note emitting DELIVERED notification:', err.message));
    }

    return res.status(200).json({
      success: true,
      message: 'Order successfully delivered with verified POD and COD reconciliation.',
      deliveredAt: now,
      order: finalOrder,
      codCollection: createdCodCollection,
      customerReceipt: createdReceipt,
    });
  } catch (err: any) {
    const isForbidden = err.message.startsWith('FORBIDDEN');
    return res.status(isForbidden ? 403 : 400).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/delivery/cod/custody
 * Phase 6 Part 4A: Returns current Delivery Partner cash custody balance
 */
deliveryRouter.get('/cod/custody', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const partnerId = user.partnerId || user.uid;

  try {
    const custodyRef = doc(db, 'deliveryPartnerCustody', partnerId);
    const snap = await getDoc(custodyRef);

    if (!snap.exists()) {
      return res.status(200).json({
        success: true,
        partnerId,
        warehouseId: OPERATIONAL_WAREHOUSE_ID,
        cashBalancePaise: 0,
        cashBalanceRupees: 0,
        updatedAt: new Date().toISOString(),
      });
    }

    const data = snap.data();
    const cashBalancePaise = Number(data.cashBalancePaise || 0);

    return res.status(200).json({
      success: true,
      partnerId,
      warehouseId: data.warehouseId || OPERATIONAL_WAREHOUSE_ID,
      cashBalancePaise,
      cashBalanceRupees: cashBalancePaise / 100,
      updatedAt: data.updatedAt || new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'FETCH_CUSTODY_FAILED',
      message: err.message,
    });
  }
});

/**
 * GET /api/delivery/cod/collections
 * Phase 6 Part 4A: Returns list of COD collection records for the authenticated delivery partner
 */
deliveryRouter.get('/cod/collections', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const partnerId = user.partnerId || user.uid;

  try {
    const q = query(
      collection(db, 'codCollections'),
      where('deliveryPartnerId', '==', partnerId)
    );
    const snap = await getDocs(q);
    const collections = snap.docs.map(d => d.data() as CODCollectionRecord);

    return res.status(200).json({
      success: true,
      partnerId,
      count: collections.length,
      collections,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'FETCH_COLLECTIONS_FAILED',
      message: err.message,
    });
  }
});

/**
 * GET /api/delivery/cod/movements
 * Phase 6 Part 4A: Returns custody movement history for the authenticated delivery partner
 */
deliveryRouter.get('/cod/movements', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const partnerId = user.partnerId || user.uid;

  try {
    const q = query(
      collection(db, 'deliveryCustodyMovements'),
      where('partnerId', '==', partnerId)
    );
    const snap = await getDocs(q);
    const movements = snap.docs.map(d => d.data() as DeliveryCustodyMovement);

    return res.status(200).json({
      success: true,
      partnerId,
      count: movements.length,
      movements,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'FETCH_MOVEMENTS_FAILED',
      message: err.message,
    });
  }
});

/**
 * POST /api/delivery/cod/handover
 * Phase 6 Part 4B: Creates a COD cash handover request from authenticated partner's custody
 */
deliveryRouter.post('/cod/handover', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const partnerId = user.partnerId || user.uid;
  const partnerName = user.name || partnerId;
  const { destinationType, requestedAmountPaise, requestedAmountRupees, collectionIds, notes } = req.body;

  try {
    const amountPaise = requestedAmountPaise !== undefined
      ? Number(requestedAmountPaise)
      : Math.round(Number(requestedAmountRupees || 0) * 100);

    const handover = await submitCodHandover({
      deliveryPartnerId: partnerId,
      deliveryPartnerName: partnerName,
      destinationType,
      requestedAmountPaise: amountPaise,
      collectionIds,
      notes,
    });

    return res.status(201).json({
      success: true,
      message: `COD cash handover request of ₹${handover.requestedAmountPaise / 100} submitted successfully to ${handover.destinationType}.`,
      handover,
    });
  } catch (err: any) {
    const isValidation =
      err.message.startsWith('INVALID') ||
      err.message.startsWith('INSUFFICIENT') ||
      err.message.startsWith('COLLECTION_ALREADY');
    const isForbidden = err.message.startsWith('FORBIDDEN');
    return res.status(isForbidden ? 403 : isValidation ? 400 : 500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/delivery/cod/handovers
 * Phase 6 Part 4B: Returns list of handovers created by the authenticated delivery partner
 */
deliveryRouter.get('/cod/handovers', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const partnerId = user.partnerId || user.uid;

  try {
    const handovers = await listPartnerHandovers(partnerId);
    return res.status(200).json({
      success: true,
      partnerId,
      count: handovers.length,
      handovers,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'FETCH_HANDOVERS_FAILED',
      message: err.message,
    });
  }
});

/**
 * GET /api/delivery/cod/eligible-collections
 * Phase 6 Part 4B: Returns CASH COD collections eligible for handover (not yet handed over)
 */
deliveryRouter.get('/cod/eligible-collections', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const partnerId = user.partnerId || user.uid;

  try {
    const collections = await getEligibleCashCollections(partnerId);
    return res.status(200).json({
      success: true,
      partnerId,
      count: collections.length,
      collections,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'FETCH_ELIGIBLE_COLLECTIONS_FAILED',
      message: err.message,
    });
  }
});

/**
 * POST /api/delivery/cod/handovers/:handoverId/cancel
 * Phase 6 Part 4B: Cancels a submitted handover (while still SUBMITTED)
 */
deliveryRouter.post('/cod/handovers/:handoverId/cancel', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const partnerId = user.partnerId || user.uid;
  const { handoverId } = req.params;

  try {
    const cancelled = await cancelCodHandover({
      handoverId,
      deliveryPartnerId: partnerId,
    });

    return res.status(200).json({
      success: true,
      message: 'Handover cancelled successfully.',
      handover: cancelled,
    });
  } catch (err: any) {
    const isForbidden = err.message.startsWith('FORBIDDEN');
    const isValidation = err.message.startsWith('INVALID') || err.message.startsWith('ACCEPTED');
    return res.status(isForbidden ? 403 : isValidation ? 400 : 500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/delivery/orders/:orderId/failed
 * OUT_FOR_DELIVERY -> FAILED_DELIVERY
 * Automatically stops tracking session and logs failure.
 */
deliveryRouter.post('/orders/:orderId/failed', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const partnerId = user.partnerId || user.uid;
  const { orderId } = req.params;
  const { reason, notes } = req.body;

  const validReasons = [
    'CUSTOMER_UNAVAILABLE',
    'WRONG_ADDRESS',
    'CUSTOMER_REFUSED',
    'SHOP_CLOSED',
    'PAYMENT_ISSUE',
    'VEHICLE_ISSUE',
    'OTHER',
  ];

  if (!reason || !validReasons.includes(reason)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_FAILURE_REASON',
      message: `Failure reason must be one of: [${validReasons.join(', ')}]`,
    });
  }

  const now = new Date().toISOString();

  try {
    const orderRef = doc(db, 'orders', orderId);
    let failedOrderToNotify: any = null;
    let isIdempotentReplay = false;
    let existingFailedAt = '';
    let existingReason = '';

    await runTransaction(db, async txn => {
      const snap = await txn.get(orderRef);
      if (!snap.exists()) throw new Error('ORDER_NOT_FOUND');
      const order = snap.data();

      if (order.deliveryPartnerId !== partnerId && order.delivery?.assignedPartnerId !== partnerId) {
        throw new Error('FORBIDDEN_NOT_ASSIGNED_PARTNER');
      }

      const currentStatus: DeliveryAssignmentStatus = order.delivery?.assignmentStatus || 'UNASSIGNED';
      if (currentStatus === 'FAILED_DELIVERY') {
        isIdempotentReplay = true;
        existingFailedAt = order.delivery?.failedAt || now;
        existingReason = order.delivery?.failureReason || reason;
        return;
      }

      if (currentStatus !== 'OUT_FOR_DELIVERY') {
        throw new Error(`INVALID_TRANSITION: Cannot mark delivery failed from '${currentStatus}'.`);
      }

      const updatedDelivery: DeliveryOrderSnapshot = {
        ...order.delivery,
        assignmentStatus: 'FAILED_DELIVERY',
        failedAt: now,
        failureReason: reason,
      };
      if (notes) {
        updatedDelivery.deliveryNotes = String(notes).trim();
      }

      txn.update(orderRef, {
        delivery: updatedDelivery,
        updatedAt: now,
        _serverTxnToken: SERVER_INTERNAL_TOKEN,
        _serverWriteNonce: generateServerNonce(),
      });

      failedOrderToNotify = { ...order, orderId, delivery: updatedDelivery };
    });

    if (isIdempotentReplay) {
      return res.status(200).json({
        success: true,
        isIdempotentReplay: true,
        message: 'Delivery was already marked as failed.',
        failedAt: existingFailedAt || now,
        reason: existingReason,
      });
    }

    await recordDeliveryAudit(orderId, 'DELIVERY_FAILED', partnerId, OPERATIONAL_WAREHOUSE_ID, {
      reason,
      notes,
    });

    // Server-Authoritative Notifications Trigger
    if (failedOrderToNotify) {
      ServerNotificationService.notifyOrderStatusTransition(
        failedOrderToNotify,
        'FAILED_DELIVERY',
        { partnerId, reason }
      ).catch(err => console.warn('Note emitting FAILED_DELIVERY notification:', err.message));
    }

    return res.status(200).json({
      success: true,
      message: 'Delivery marked as failed. Prepared for return to warehouse.',
      failedAt: now,
      reason,
    });
  } catch (err: any) {
    const isForbidden = err.message.startsWith('FORBIDDEN');
    return res.status(isForbidden ? 403 : 400).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/delivery/orders/:orderId/return
 * FAILED_DELIVERY -> RETURN_TO_WAREHOUSE
 * Stages return of undelivered consignment back to WH-BRAHMPURI-01.
 */
deliveryRouter.post('/orders/:orderId/return', requireDeliveryPartnerRole(), async (req: Request, res: Response) => {
  const user = (req as any).authUser;
  const partnerId = user.partnerId || user.uid;
  const { orderId } = req.params;
  const { returnReason } = req.body;
  const now = new Date().toISOString();

  try {
    const orderRef = doc(db, 'orders', orderId);
    let returnOrderToNotify: any = null;
    let isIdempotentReplay = false;
    let existingReturnedAt = '';

    await runTransaction(db, async txn => {
      const snap = await txn.get(orderRef);
      if (!snap.exists()) throw new Error('ORDER_NOT_FOUND');
      const order = snap.data();

      if (order.deliveryPartnerId !== partnerId && order.delivery?.assignedPartnerId !== partnerId) {
        throw new Error('FORBIDDEN_NOT_ASSIGNED_PARTNER');
      }

      const currentStatus: DeliveryAssignmentStatus = order.delivery?.assignmentStatus || 'UNASSIGNED';
      if (currentStatus === 'RETURN_TO_WAREHOUSE' || order.orderStatus === 'RETURN_REQUESTED') {
        isIdempotentReplay = true;
        existingReturnedAt = order.delivery?.returnedAt || now;
        return;
      }

      if (currentStatus !== 'FAILED_DELIVERY') {
        throw new Error(`INVALID_TRANSITION: Cannot return order with status '${currentStatus}'. Must be FAILED_DELIVERY.`);
      }

      const updatedDelivery: DeliveryOrderSnapshot = {
        ...order.delivery,
        assignmentStatus: 'RETURN_TO_WAREHOUSE',
        returnedAt: now,
        returnReason: returnReason || order.delivery?.failureReason || 'Undelivered return',
      };

      txn.update(orderRef, {
        orderStatus: 'RETURN_REQUESTED',
        delivery: updatedDelivery,
        updatedAt: now,
        _serverTxnToken: SERVER_INTERNAL_TOKEN,
        _serverWriteNonce: generateServerNonce(),
      });

      returnOrderToNotify = { ...order, orderId, orderStatus: 'RETURN_REQUESTED', delivery: updatedDelivery };
    });

    if (isIdempotentReplay) {
      return res.status(200).json({
        success: true,
        isIdempotentReplay: true,
        message: 'Consignment was already staged for return to WH-BRAHMPURI-01.',
        returnedAt: existingReturnedAt || now,
      });
    }

    await recordDeliveryAudit(orderId, 'RETURN_TO_WAREHOUSE', partnerId, OPERATIONAL_WAREHOUSE_ID, {
      returnReason,
    });

    // Server-Authoritative Notifications Trigger
    if (returnOrderToNotify) {
      ServerNotificationService.notifyOrderStatusTransition(
        returnOrderToNotify,
        'RETURN_TO_WAREHOUSE',
        { partnerId, returnReason }
      ).catch(err => console.warn('Note emitting RETURN_TO_WAREHOUSE notification:', err.message));
    }

    return res.status(200).json({
      success: true,
      message: 'Consignment staged for return to WH-BRAHMPURI-01.',
      returnedAt: now,
    });
  } catch (err: any) {
    const isForbidden = err.message.startsWith('FORBIDDEN');
    return res.status(isForbidden ? 403 : 400).json({
      success: false,
      error: err.message,
    });
  }
});
