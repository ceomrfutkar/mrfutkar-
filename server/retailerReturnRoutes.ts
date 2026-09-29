/**
 * MR FUTKAR — Retailer Self-Service Return Claims API (Phase 6 Part 6)
 * Server-authoritative return claims workflow with strict tenant isolation,
 * delivered order enforcement, immutable snapshot price validation,
 * cumulative active claim protection, and idempotency guarantees.
 */

import { Router, Request, Response } from 'express';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  runTransaction,
} from 'firebase/firestore';
import { db } from './firebaseAdmin';
import {
  resolveAuthUser,
  OPERATIONAL_WAREHOUSE_ID,
  OPERATIONAL_WAREHOUSE_NAME,
} from './auth';
import { ServerNotificationService } from './notificationService';
import { WarehouseReturnRecord, ReturnStatus, InspectionStatus } from '../src/types/warehouse';

export const retailerReturnRouter = Router();

// Middleware: Authenticate User
retailerReturnRouter.use(async (req: Request, res: Response, next) => {
  const authHeader = req.headers.authorization;
  const authResult = await resolveAuthUser(authHeader);

  if (!authResult.valid || !authResult.user) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required to access retailer return claims.',
    });
  }

  (req as any).authUser = authResult.user;
  next();
});

/**
 * POST /api/retailer/returns
 * Server-Authoritative Retailer Return Claim Submission
 */
retailerReturnRouter.post('/returns', async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).authUser;

    // Role check: Only authorized RETAILER or SUPER_ADMIN may submit claims
    if (authUser.role !== 'RETAILER' && authUser.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'UNAUTHORIZED_ROLE',
        message: 'Only retailers can submit retailer return claims.',
      });
    }

    const {
      orderId,
      productId,
      quantity,
      reason,
      description,
      idempotencyKey: bodyIdempKey,
    } = req.body;

    // 1. Basic parameter validation
    if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_ORDER_ID',
        message: 'Order ID is required to submit a return claim.',
      });
    }

    if (!productId || typeof productId !== 'string' || !productId.trim()) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PRODUCT_ID',
        message: 'Product ID is required to submit a return claim.',
      });
    }

    const cleanOrderId = orderId.trim();
    const cleanProductId = productId.trim();
    const cleanQty = Number(quantity);

    if (!Number.isInteger(cleanQty) || cleanQty <= 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_QUANTITY',
        message: 'Return quantity must be a positive integer greater than zero.',
      });
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REASON',
        message: 'A valid return reason of at least 3 characters is required.',
      });
    }

    // 2. Idempotency Key Handling
    const rawIdempKey =
      (typeof bodyIdempKey === 'string' && bodyIdempKey.trim())
        ? bodyIdempKey.trim()
        : (typeof req.headers['idempotency-key'] === 'string' ? (req.headers['idempotency-key'] as string).trim() : null);

    if (rawIdempKey) {
      if (rawIdempKey.length < 5) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_IDEMPOTENCY_KEY',
          message: 'Idempotency key must be at least 5 characters.',
        });
      }

      // Check existing idempotency record
      const idempDocRef = doc(db, 'idempotencyKeys', `retailer_return_${rawIdempKey}`);
      const idempSnap = await getDoc(idempDocRef);

      if (idempSnap.exists()) {
        const idempData = idempSnap.data();
        // Conflict verification: Ensure parameters match
        if (
          idempData.orderId !== cleanOrderId ||
          idempData.productId !== cleanProductId ||
          idempData.quantity !== cleanQty
        ) {
          return res.status(409).json({
            success: false,
            error: 'IDEMPOTENCY_CONFLICT',
            message: `Idempotency key "${rawIdempKey}" was previously used with conflicting parameters.`,
          });
        }

        // Fetch existing canonical return record
        if (idempData.returnId) {
          const existingReturnSnap = await getDoc(doc(db, 'returns', idempData.returnId));
          if (existingReturnSnap.exists()) {
            return res.status(200).json({
              success: true,
              isIdempotentReplay: true,
              returnRecord: { returnId: existingReturnSnap.id, ...existingReturnSnap.data() },
            });
          }
        }
      }
    }

    // 3. Fetch authoritative order document
    const orderRef = doc(db, 'orders', cleanOrderId);
    const orderSnap = await getDoc(orderRef);

    if (!orderSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: `Order "${cleanOrderId}" does not exist.`,
      });
    }

    const orderData = orderSnap.data() as any;

    // 4. Tenant Isolation: Retailer can only claim against their own order
    if (orderData.retailerId !== authUser.uid) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'You cannot submit a return claim for an order belonging to another retailer.',
      });
    }

    // 5. Warehouse Boundary: Order must belong to WH-BRAHMPURI-01
    if (orderData.warehouseId && orderData.warehouseId !== OPERATIONAL_WAREHOUSE_ID) {
      return res.status(400).json({
        success: false,
        error: 'ORDER_MISMATCH_WAREHOUSE',
        message: `Order belongs to warehouse "${orderData.warehouseId}", not operational warehouse "${OPERATIONAL_WAREHOUSE_ID}".`,
      });
    }

    // 6. Delivery Status Gate: Order must be DELIVERED
    const isDelivered =
      orderData.orderStatus === 'DELIVERED' ||
      orderData.delivery?.assignmentStatus === 'DELIVERED';

    if (!isDelivered) {
      return res.status(400).json({
        success: false,
        error: 'ORDER_NOT_DELIVERED',
        message: `Return claims can only be submitted for delivered orders. Current order status: ${orderData.orderStatus || 'UNKNOWN'}.`,
      });
    }

    // 7. Order Item Matching (Product snapshot in original order)
    const orderItems: any[] = Array.isArray(orderData.items) ? orderData.items : [];
    const matchedItem = orderItems.find(
      (item: any) => item.productId === cleanProductId || item.sku === cleanProductId
    );

    if (!matchedItem) {
      return res.status(400).json({
        success: false,
        error: 'PRODUCT_NOT_IN_ORDER',
        message: `Product "${cleanProductId}" is not part of order "${cleanOrderId}".`,
      });
    }

    const originalOrderedQty = Number(matchedItem.quantity) || 0;
    if (cleanQty > originalOrderedQty) {
      return res.status(400).json({
        success: false,
        error: 'QUANTITY_EXCEEDS_ORDERED',
        message: `Requested return quantity (${cleanQty}) exceeds the originally ordered quantity (${originalOrderedQty}).`,
      });
    }

    // 8. Cumulative Active Claim Protection
    // Query existing return records for this order and product
    const returnsQuery = query(
      collection(db, 'returns'),
      where('orderId', '==', cleanOrderId),
      where('productId', '==', matchedItem.productId)
    );

    let existingClaims: any[] = [];
    try {
      const snap = await getDocs(returnsQuery);
      existingClaims = snap.docs.map(d => ({ returnId: d.id, ...d.data() }));
    } catch (err: any) {
      console.warn('Note querying returns for cumulative check:', err.message);
    }

    // Active claims: Any claim that is not terminal 'REJECTED'
    const activeClaims = existingClaims.filter((c: any) => c.returnStatus !== 'REJECTED');
    const cumulativeActiveQty = activeClaims.reduce(
      (sum: number, c: any) => sum + (Number(c.quantity) || 0),
      0
    );

    const remainingClaimableQty = Math.max(0, originalOrderedQty - cumulativeActiveQty);

    if (cleanQty > remainingClaimableQty) {
      return res.status(409).json({
        success: false,
        error: 'QUANTITY_EXCEEDS_REMAINING',
        message: `Requested return quantity (${cleanQty}) exceeds remaining claimable quantity (${remainingClaimableQty}). Originally ordered: ${originalOrderedQty}, Active claims: ${cumulativeActiveQty}.`,
        originalOrderedQuantity: originalOrderedQty,
        cumulativeActiveQuantity: cumulativeActiveQty,
        remainingClaimableQuantity: remainingClaimableQty,
      });
    }

    // 9. Authoritative Historical Pricing Calculation
    // Use immutable snapshot price from original order item; discard any client-provided price
    const claimedItemPrice = Number(
      matchedItem.unitPrice ?? matchedItem.serverValidatedUnitPrice ?? 0
    );
    const claimedTotalValue = Math.round(claimedItemPrice * cleanQty * 100) / 100;

    // 10. Construct Authoritative Return Record
    const retRef = doc(collection(db, 'returns'));
    const returnId = retRef.id;
    const now = new Date().toISOString();

    const returnRecord: WarehouseReturnRecord = {
      returnId,
      orderId: cleanOrderId,
      retailerId: authUser.uid, // Server-derived from verified auth context
      retailerName: orderData.retailerName || authUser.name || 'Retailer Partner',
      shopName: orderData.shopName || orderData.deliveryAddress?.shopName || 'Retailer Shop',
      retailerMobile:
        orderData.deliveryAddress?.phone ||
        orderData.deliveryAddressSnapshot?.phone ||
        authUser.mobile ||
        '',
      productId: matchedItem.productId,
      productName: matchedItem.productName || 'Product',
      sku: matchedItem.sku || `SKU-${matchedItem.productId}`,
      quantity: cleanQty,
      claimedItemPrice,
      claimedTotalValue,
      reason: reason.trim(),
      description: typeof description === 'string' ? description.trim() : '',
      returnStatus: 'REQUESTED' as ReturnStatus, // Initial state strictly REQUESTED
      inspectionStatus: 'PENDING' as InspectionStatus, // Initial state strictly PENDING
      inspectionNotes: '',
      warehouseId: OPERATIONAL_WAREHOUSE_ID, // Server-enforced
      warehouseName: OPERATIONAL_WAREHOUSE_NAME, // Server-enforced
      claimSource: 'RETAILER_PORTAL',
      submittedBy: authUser.uid, // Server-derived
      idempotencyKey: rawIdempKey || undefined,
      createdAt: now,
      updatedAt: now,
    };

    // 11. Transactional Write: Write return record and persistent idempotency record
    await runTransaction(db, async txn => {
      // Re-verify idempotency within transaction if key provided
      if (rawIdempKey) {
        const idempRef = doc(db, 'idempotencyKeys', `retailer_return_${rawIdempKey}`);
        const idempCheck = await txn.get(idempRef);
        if (idempCheck.exists()) {
          throw new Error('IDEMPOTENT_TRANSACTION_REPLAY');
        }
        txn.set(idempRef, {
          key: rawIdempKey,
          returnId,
          orderId: cleanOrderId,
          productId: matchedItem.productId,
          quantity: cleanQty,
          retailerId: authUser.uid,
          createdAt: now,
        });
      }

      txn.set(retRef, {
        ...returnRecord,
        _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
      });
    });

    // 12. Notification: Trigger warehouse return notification (fire-and-forget, non-blocking)
    ServerNotificationService.getOperationalWarehouseUsers(OPERATIONAL_WAREHOUSE_ID)
      .then(whUsers => {
        for (const whUser of whUsers) {
          ServerNotificationService.sendPushNotification({
            recipientUserId: whUser.uid,
            role: whUser.role,
            title: 'New Return Claim Submitted',
            body: `Return claim submitted for Order ${cleanOrderId} (${matchedItem.productName} x ${cleanQty}). Reason: ${reason.trim()}.`,
            event: 'ORDER_RETURN_TO_WAREHOUSE',
            type: 'WAREHOUSE',
            orderId: cleanOrderId,
            orderNumber: cleanOrderId,
            deepLink: `/warehouse/returns`,
            data: {
              type: 'WAREHOUSE',
              event: 'ORDER_RETURN_TO_WAREHOUSE',
              orderId: cleanOrderId,
              returnId,
              productId: matchedItem.productId,
            },
          }).catch(err => {
            console.warn('Note dispatching warehouse return notification:', err.message);
          });
        }
      })
      .catch(err => {
        console.warn('Note retrieving warehouse users for notification:', err.message);
      });

    // Return 201 Created with authoritative return record
    return res.status(201).json({
      success: true,
      returnRecord,
    });
  } catch (err: any) {
    if (err.message === 'IDEMPOTENT_TRANSACTION_REPLAY') {
      return res.status(200).json({
        success: true,
        isIdempotentReplay: true,
        message: 'Request already processed.',
      });
    }
    console.error('Error submitting retailer return claim:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred while submitting the return claim.',
    });
  }
});

/**
 * GET /api/retailer/returns/by-order/:orderId
 * Fetch Return Claims for a Specific Order (Tenant-Isolated for Authenticated Retailer)
 */
retailerReturnRouter.get('/returns/by-order/:orderId', async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).authUser;
    const { orderId } = req.params;

    if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_ORDER_ID',
        message: 'Order ID parameter is required.',
      });
    }

    const cleanOrderId = orderId.trim();

    // 1. Fetch order to verify existence and tenant ownership
    const orderRef = doc(db, 'orders', cleanOrderId);
    const orderSnap = await getDoc(orderRef);

    if (!orderSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: `Order "${cleanOrderId}" does not exist.`,
      });
    }

    const orderData = orderSnap.data() as any;

    // 2. Tenant Isolation Check: Retailer can only view claims for their own order
    if (authUser.role === 'RETAILER' && orderData.retailerId !== authUser.uid) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'You cannot view return claims for an order belonging to another retailer.',
      });
    }

    // 3. Query return records for this order and retailer at WH-BRAHMPURI-01
    const retQuery = query(
      collection(db, 'returns'),
      where('orderId', '==', cleanOrderId),
      where('retailerId', '==', orderData.retailerId),
      where('warehouseId', '==', OPERATIONAL_WAREHOUSE_ID)
    );

    const retSnap = await getDocs(retQuery);
    const rawReturns = retSnap.docs.map(d => ({ returnId: d.id, ...d.data() }));

    // Sort newest first
    rawReturns.sort(
      (a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    // Sanitize retailer-facing fields
    const sanitizedReturns = rawReturns.map((r: any) => ({
      returnId: r.returnId,
      orderId: r.orderId,
      productId: r.productId,
      productName: r.productName,
      sku: r.sku,
      quantity: r.quantity,
      claimedItemPrice: r.claimedItemPrice,
      claimedTotalValue: r.claimedTotalValue,
      reason: r.reason,
      description: r.description || '',
      returnStatus: r.returnStatus,
      inspectionStatus: r.inspectionStatus,
      inspectionNotes: r.inspectionNotes || '',
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      claimSource: r.claimSource || 'RETAILER_PORTAL',
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    return res.status(200).json({
      success: true,
      count: sanitizedReturns.length,
      returns: sanitizedReturns,
    });
  } catch (err: any) {
    console.error('Error fetching retailer return claims:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred while fetching return claims.',
    });
  }
});
