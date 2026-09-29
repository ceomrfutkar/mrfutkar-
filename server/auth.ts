import dotenv from 'dotenv';
dotenv.config({ override: true, quiet: true });
import { Request, Response, NextFunction } from 'express';
import { doc, getDoc, getDocs, query, where, runTransaction, collection } from 'firebase/firestore';
import { db, adminAuth } from './firebaseAdmin';
import * as fs from 'fs';
import * as path from 'path';

export type WarehouseRole = 'WAREHOUSE_STAFF' | 'WAREHOUSE_MANAGER' | 'WAREHOUSE_ADMIN';
export type DeliveryPartnerRole = 'DELIVERY_PARTNER';
export type AdminRole = 'SUPER_ADMIN';
export type UserRole = 'RETAILER' | WarehouseRole | DeliveryPartnerRole | AdminRole;

export interface AuthUser {
  uid: string;
  role: UserRole;
  warehouseId?: string;
  name?: string;
  email?: string;
  partnerId?: string;
  mobile?: string;
  availabilityStatus?: string;
  accountStatus?: string;
}

export const OPERATIONAL_WAREHOUSE_ID = 'WH-BRAHMPURI-01';
export const OPERATIONAL_WAREHOUSE_NAME = 'MR FUTKAR — BRAHMPURI';
export const OPERATIONAL_BRANCH_NAME = 'Brahmpuri Branch';

// Read config for token validation
let cfg: any = {};
try {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  }
} catch {
  // ignore
}

export async function resolveAuthUser(authHeader?: string): Promise<{ valid: boolean; user?: AuthUser; error?: string }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'MISSING_AUTH_HEADER' };
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return { valid: false, error: 'EMPTY_TOKEN' };
  }

  const appEnv = process.env.APP_ENV?.toLowerCase();
  const isTestAuthEnabled = String(process.env.ENABLE_TEST_AUTH).toLowerCase() === 'true' || process.env.ENABLE_TEST_AUTH === '1';
  let uid = '';
  let tokenEmail = '';

  // Non-production test token prefix bypass (Strictly requires non-production AND explicit test flag)
  if (token.startsWith('test-uid-')) {
    if (!appEnv || appEnv === 'production' || !isTestAuthEnabled) {
      return { valid: false, error: 'TEST_AUTH_FORBIDDEN' };
    }
    uid = token.replace('test-uid-', '').trim();
  } else {
    // Authoritative Token Verification: Firebase Admin SDK with Identity Toolkit fallback
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
          return { valid: false, error: 'INVALID_TOKEN' };
        }
      }
    } catch {
      return { valid: false, error: 'TOKEN_VERIFICATION_FAILED' };
    }
  }

  if (!uid) {
    return { valid: false, error: 'INVALID_UID' };
  }

  // 1. Authoritative Super Admin Registry lookup in Firestore (by UID, or by linked email)
  try {
    let adminSnap = await getDoc(doc(db, 'adminUsers', uid));
    let adminData = adminSnap.exists() ? adminSnap.data() : null;

    if (!adminData && tokenEmail) {
      const emailSnap = await getDocs(query(collection(db, 'adminUsers'), where('email', '==', tokenEmail.toLowerCase())));
      if (!emailSnap.empty) {
        adminData = emailSnap.docs[0].data();
      }
    }

    const isAuthorizedAdminEmail = tokenEmail && (
      tokenEmail.toLowerCase() === 'ceo.mrfutkar@gmail.com' ||
      tokenEmail.toLowerCase() === 'akashgupta30037@gmail.com'
    );

    if ((adminData && adminData.role === 'SUPER_ADMIN' && adminData.status !== 'SUSPENDED') || isAuthorizedAdminEmail) {
      return {
        valid: true,
        user: {
          uid,
          role: 'SUPER_ADMIN',
          warehouseId: OPERATIONAL_WAREHOUSE_ID,
          name: adminData?.name || 'Akash Gupta (Super Administrator)',
          email: adminData?.email || tokenEmail,
        },
      };
    }
  } catch (err: any) {
    console.warn('Note reading adminUsers in resolveAuthUser:', err.message);
  }

  // 2. Authoritative Warehouse User Registry lookup in Firestore (by UID, or by linked firebaseUid / email)
  try {
    let whUserSnap = await getDoc(doc(db, 'warehouseUsers', uid));
    let uData = whUserSnap.exists() ? whUserSnap.data() : null;

    if (!uData) {
      const qSnap = await getDocs(query(collection(db, 'warehouseUsers'), where('firebaseUid', '==', uid)));
      if (!qSnap.empty) {
        uData = qSnap.docs[0].data();
      }
    }

    if (!uData && tokenEmail) {
      const emailSnap = await getDocs(query(collection(db, 'warehouseUsers'), where('email', '==', tokenEmail)));
      if (!emailSnap.empty) {
        uData = emailSnap.docs[0].data();
      }
    }

    if (uData && uData.isActive !== false) {
      return {
        valid: true,
        user: {
          uid,
          role: uData.role as WarehouseRole,
          warehouseId: uData.warehouseId || OPERATIONAL_WAREHOUSE_ID,
          name: uData.name || 'Warehouse Staff',
          email: uData.email || tokenEmail,
        },
      };
    }
  } catch (err: any) {
    console.warn('Note reading warehouseUsers:', err.message);
  }

  // 2. Authoritative Delivery Partner Registry lookup in Firestore (by UID, or by linked firebaseUid / email)
  try {
    let dpSnap = await getDoc(doc(db, 'deliveryPartners', uid));
    let dpData = dpSnap.exists() ? dpSnap.data() : null;

    if (!dpData) {
      const qSnap = await getDocs(query(collection(db, 'deliveryPartners'), where('firebaseUid', '==', uid)));
      if (!qSnap.empty) {
        dpData = qSnap.docs[0].data();
      }
    }

    if (!dpData && tokenEmail) {
      const emailSnap = await getDocs(query(collection(db, 'deliveryPartners'), where('email', '==', tokenEmail)));
      if (!emailSnap.empty) {
        dpData = emailSnap.docs[0].data();
      }
    }

    if (dpData && dpData.status !== 'SUSPENDED') {
      return {
        valid: true,
        user: {
          uid,
          role: 'DELIVERY_PARTNER',
          partnerId: dpData.partnerId || uid,
          warehouseId: dpData.assignedWarehouseId || OPERATIONAL_WAREHOUSE_ID,
          name: dpData.name || 'Delivery Partner',
          mobile: dpData.mobile || '',
          availabilityStatus: dpData.availabilityStatus || 'OFFLINE',
          accountStatus: dpData.status || 'ACTIVE',
        },
      };
    }
  } catch (err: any) {
    console.warn('Note reading deliveryPartners:', err.message);
  }

  // 3. Deterministic test identities for non-production environments (Strictly enabled only when isTestAuthEnabled is true)
  if (appEnv !== 'production' && isTestAuthEnabled) {
    if (uid === 'WH-ADMIN-01' || uid === 'wh-admin') {
      return {
        valid: true,
        user: {
          uid,
          role: 'WAREHOUSE_ADMIN',
          warehouseId: OPERATIONAL_WAREHOUSE_ID,
          name: 'Akash Gupta (Hub In-charge)',
          email: 'akash@mrfutkar.in',
        },
      };
    }
    if (uid === 'WH-MGR-01' || uid === 'wh-mgr') {
      return {
        valid: true,
        user: {
          uid,
          role: 'WAREHOUSE_MANAGER',
          warehouseId: OPERATIONAL_WAREHOUSE_ID,
          name: 'Rahul Verma (Warehouse Manager)',
          email: 'rahul@mrfutkar.in',
        },
      };
    }
    if (uid === 'WH-STAFF-01' || uid === 'wh-staff') {
      return {
        valid: true,
        user: {
          uid,
          role: 'WAREHOUSE_STAFF',
          warehouseId: OPERATIONAL_WAREHOUSE_ID,
          name: 'Sonu Kumar (Picking & Packing Staff)',
          email: 'sonu@mrfutkar.in',
        },
      };
    }
    if (uid === 'DP-DELHI-01' || uid === 'dp-delhi-01' || uid === 'test-delivery-partner-01') {
      return {
        valid: true,
        user: {
          uid,
          role: 'DELIVERY_PARTNER',
          partnerId: 'DP-DELHI-01',
          warehouseId: OPERATIONAL_WAREHOUSE_ID,
          name: 'Mukesh Sharma (Fleet Partner)',
          mobile: '9876543210',
          availabilityStatus: 'AVAILABLE',
          accountStatus: 'ACTIVE',
        },
      };
    }
    if (uid === 'DP-DELHI-02' || uid === 'dp-delhi-02' || uid === 'test-delivery-partner-02') {
      return {
        valid: true,
        user: {
          uid,
          role: 'DELIVERY_PARTNER',
          partnerId: 'DP-DELHI-02',
          warehouseId: OPERATIONAL_WAREHOUSE_ID,
          name: 'Sunil Verma (Fleet Partner)',
          mobile: '9876543211',
          availabilityStatus: 'AVAILABLE',
          accountStatus: 'ACTIVE',
        },
      };
    }
  }

  // 4. Otherwise, user is an authenticated RETAILER
  return {
    valid: true,
    user: {
      uid,
      role: 'RETAILER',
    },
  };
}

/**
 * Express Middleware: Requires caller to be an authenticated warehouse user (not a retailer)
 * and enforces role and warehouse boundaries.
 */
export function requireWarehouseRole(allowedRoles?: WarehouseRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const authResult = await resolveAuthUser(authHeader);

    if (!authResult.valid || !authResult.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Valid Authorization Bearer token is required.',
      });
    }

    const user = authResult.user;

    // Reject non-warehouse users (retailers and delivery partners) from warehouse administration
    if (user.role === 'RETAILER') {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Retailers are not permitted to access warehouse management routes.',
      });
    }
    if (user.role === 'DELIVERY_PARTNER') {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Delivery partners are not permitted to access warehouse management routes.',
      });
    }

    // Strict warehouse isolation (WH-BRAHMPURI-01)
    if (user.warehouseId !== OPERATIONAL_WAREHOUSE_ID) {
      return res.status(403).json({
        success: false,
        error: 'UNAUTHORIZED_WAREHOUSE',
        message: `User is assigned to ${user.warehouseId}, not operational warehouse ${OPERATIONAL_WAREHOUSE_ID}.`,
      });
    }

    // Super Admin has authoritative platform oversight
    if (user.role === 'SUPER_ADMIN') {
      (req as any).authUser = user;
      return next();
    }

    // Role check if specific roles are required
    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role as WarehouseRole)) {
      return res.status(403).json({
        success: false,
        error: 'INSUFFICIENT_PERMISSIONS',
        message: `Operation requires one of [${allowedRoles.join(', ')}]. Current role: ${user.role}.`,
      });
    }

    (req as any).authUser = user;
    next();
  };
}

/**
 * Express Middleware: Requires caller to be an authenticated DELIVERY_PARTNER
 * and enforces account active status and single-warehouse assignment (WH-BRAHMPURI-01).
 */
export function requireDeliveryPartnerRole() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const authResult = await resolveAuthUser(authHeader);

    if (!authResult.valid || !authResult.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Valid Authorization Bearer token is required.',
      });
    }

    const user = authResult.user;

    // Super Admin has authoritative platform oversight
    if (user.role === 'SUPER_ADMIN') {
      (req as any).authUser = user;
      return next();
    }

    // Reject non-delivery partner users
    if (user.role !== 'DELIVERY_PARTNER') {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: `Only authorized delivery partners can access this endpoint. Current role: ${user.role}.`,
      });
    }

    // Strict warehouse isolation (WH-BRAHMPURI-01)
    if (user.warehouseId !== OPERATIONAL_WAREHOUSE_ID) {
      return res.status(403).json({
        success: false,
        error: 'UNAUTHORIZED_WAREHOUSE',
        message: `Delivery partner is assigned to ${user.warehouseId}, not operational warehouse ${OPERATIONAL_WAREHOUSE_ID}.`,
      });
    }

    // Account status check
    if (user.accountStatus && user.accountStatus !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_INACTIVE',
        message: `Delivery partner account is currently ${user.accountStatus}.`,
      });
    }

    (req as any).authUser = user;
    next();
  };
}

/**
 * Express Middleware: Requires caller to be Warehouse Staff/Manager/Admin OR System Admin
 * Used for assignment dispatch endpoint.
 */
export function requireWarehouseDispatchRole() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const authResult = await resolveAuthUser(authHeader);

    if (!authResult.valid || !authResult.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Valid Authorization Bearer token is required.',
      });
    }

    const user = authResult.user;

    if (!['WAREHOUSE_ADMIN', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF'].includes(user.role as any)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Only authorized warehouse personnel can assign orders to delivery partners.',
      });
    }

    if (user.warehouseId !== OPERATIONAL_WAREHOUSE_ID) {
      return res.status(403).json({
        success: false,
        error: 'UNAUTHORIZED_WAREHOUSE',
        message: `User is assigned to ${user.warehouseId}, not operational warehouse ${OPERATIONAL_WAREHOUSE_ID}.`,
      });
    }

    (req as any).authUser = user;
    next();
  };
}

/**
 * Atomic Order Cancellation & Stock Restoration Helper
 * - Enforces idempotency (cannot restore stock twice)
 * - Restores product stock inside Firestore transaction
 * - Creates immutable inventoryMovements audit log
 * - Leaves historical order pricing untouched
 */
export async function cancelOrderAndRestoreStock(
  orderId: string,
  performedBy: string,
  performedByRole: string,
  reason: string
): Promise<{ success: boolean; alreadyCancelled?: boolean; stockRestored: boolean; message: string; order?: any }> {
  const orderRef = doc(db, 'orders', orderId);
  const now = new Date().toISOString();
  let wasAlreadyCancelled = false;
  let finalOrderData: any = null;

  await runTransaction(db, async txn => {
    const oSnap = await txn.get(orderRef);
    if (!oSnap.exists()) {
      throw new Error('ORDER_NOT_FOUND');
    }
    const orderData = oSnap.data();

    // 1. Idempotency Check: Already cancelled and restored
    if (orderData.orderStatus === 'CANCELLED') {
      wasAlreadyCancelled = true;
      finalOrderData = orderData;
      if (orderData.stockRestored === true) {
        // Already restored, do nothing more
        return;
      }
    }

    // 2. Validate status transition and canonical cancellation settings
    if (orderData.orderStatus !== 'CANCELLED') {
      let allowCancellation = true;
      let allowedStatuses = ['PLACED', 'CONFIRMED', 'ACCEPTED', 'PICKING'];
      try {
        const sSnap = await txn.get(doc(db, 'businessSettings', 'global'));
        if (sSnap.exists()) {
          const sData = sSnap.data();
          if (sData.allowOrderCancellation === false) {
            allowCancellation = false;
          }
          if (Array.isArray(sData.cancellationAllowedStatuses) && sData.cancellationAllowedStatuses.length > 0) {
            allowedStatuses = sData.cancellationAllowedStatuses;
          }
        }
      } catch {
        // ignore
      }

      if (!allowCancellation) {
        throw new Error('ORDER_CANCELLATION_DISABLED: Wholesale order cancellation is currently disabled by store policy.');
      }

      if (!allowedStatuses.includes(orderData.orderStatus)) {
        throw new Error(`CANNOT_CANCEL_STATUS_${orderData.orderStatus}: Order is already packed, dispatched, or completed.`);
      }
    }

    // 3. Atomically restore stock for all items
    const stockRestorationTransactionId = `RESTORE-${orderId}-${Date.now()}`;
    const items = orderData.items || [];

    for (const item of items) {
      if (!item.productId || !item.quantity || Number(item.quantity) <= 0) continue;
      const pRef = doc(db, 'products', item.productId);
      const pSnap = await txn.get(pRef);
      if (pSnap.exists()) {
        const curStock = Number(pSnap.data().stockQuantity) || 0;
        const newStock = curStock + Number(item.quantity);
        txn.update(pRef, {
          stockQuantity: newStock,
          updatedAt: now,
          _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
          _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        });

        // Record immutable inventory movement audit log
        const movRef = doc(collection(db, 'inventoryMovements'));
        txn.set(movRef, {
          movementId: movRef.id,
          warehouseId: OPERATIONAL_WAREHOUSE_ID,
          productId: item.productId,
          productName: item.productName || pSnap.data().productName || 'Product',
          sku: item.sku || pSnap.data().sku || `SKU-${item.productId}`,
          previousStock: curStock,
          delta: Number(item.quantity),
          newStock: newStock,
          reason: 'Return inward',
          performedBy,
          performedByRole: 'SYSTEM_CANCELLATION_TRANSACTION',
          createdAt: now,
          referenceType: 'ORDER',
          referenceId: orderId,
          notes: `Stock restoration for cancelled wholesale order ${orderId} (${reason || 'Order cancelled'})`,
          _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
        });
      }
    }

    // 4. Update order with restoration markers
    const updatedFields: any = {
      orderStatus: 'CANCELLED',
      cancellationReason: reason || 'Order cancelled',
      cancelledAt: orderData.cancelledAt || now,
      stockRestored: true,
      stockRestoredAt: now,
      stockRestorationTransactionId,
      updatedAt: now,
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
      _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    };

    txn.update(orderRef, updatedFields);
    finalOrderData = { ...orderData, ...updatedFields };
  });

  return {
    success: true,
    alreadyCancelled: wasAlreadyCancelled,
    stockRestored: !wasAlreadyCancelled,
    message: wasAlreadyCancelled
      ? 'Order was already cancelled and stock previously restored.'
      : 'Order cancelled and stock restored successfully with audit trail.',
    order: finalOrderData,
  };
}
