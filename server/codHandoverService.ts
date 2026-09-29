/**
 * MR FUTKAR — PHASE 6 PART 4B: COD HANDOVER & CUSTODY TRANSFER SERVICE
 * 
 * Server-authoritative custody transfer for COD collections:
 * - Delivery employee hands over physical cash custody to Warehouse or Admin
 * - Multi-destination support: WH-BRAHMPURI-01 or Admin
 * - Atomic Firestore transaction ensures zero partial transfers
 * - Discrepancy tracking without automatic write-offs or accounting mutations
 * - Strict idempotency preventing duplicate custody deductions/additions
 * - Salaried employee rule: zero commissions, wallets, or payouts
 * - Strict accounting boundary: zero GL entries, zero CustomerReceipts, zero AR mutations
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  runTransaction,
  orderBy,
  limit,
  setDoc,
} from 'firebase/firestore';
import { db } from './firebaseAdmin';
import { OPERATIONAL_WAREHOUSE_ID } from './auth';
import {
  CODHandoverRecord,
  CODHandoverDestinationType,
  CODHandoverStatus,
  WarehouseCashCustody,
  AdminCashCustody,
  DeliveryPartnerCustody,
  DeliveryCustodyMovement,
  CODCollectionRecord,
} from '../src/types/delivery';

const SERVER_INTERNAL_TOKEN = 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01';
const generateServerNonce = () => `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

/**
 * Append-only audit logger for delivery & handover events
 */
async function recordHandoverAudit(
  handoverId: string,
  event: string,
  actorId: string,
  warehouseId: string = OPERATIONAL_WAREHOUSE_ID,
  metadata?: Record<string, any>
) {
  try {
    const now = new Date().toISOString();
    const logRef = doc(collection(db, 'deliveryAuditLogs'));
    await setDoc(logRef, {
      logId: logRef.id,
      handoverId,
      event,
      eventType: event,
      deliveryPartnerId: actorId,
      warehouseId,
      timestamp: now,
      createdAt: now,
      metadata: metadata || {},
      _serverTxnToken: SERVER_INTERNAL_TOKEN,
      _serverWriteNonce: generateServerNonce(),
    });
  } catch (err: any) {
    console.warn('Note recording handover audit log:', err.message);
  }
}

/**
 * Submit a COD cash handover request from Delivery partner custody
 */
export async function submitCodHandover(params: {
  deliveryPartnerId: string;
  deliveryPartnerName?: string;
  destinationType: CODHandoverDestinationType;
  requestedAmountPaise: number;
  collectionIds?: string[];
  notes?: string;
}): Promise<CODHandoverRecord> {
  const {
    deliveryPartnerId,
    deliveryPartnerName,
    destinationType,
    requestedAmountPaise,
    collectionIds = [],
    notes,
  } = params;

  // 1. Validate inputs
  if (destinationType !== 'WAREHOUSE' && destinationType !== 'ADMIN') {
    throw new Error('INVALID_DESTINATION_TYPE: Destination must be WAREHOUSE or ADMIN');
  }

  if (!Number.isInteger(requestedAmountPaise) || requestedAmountPaise <= 0) {
    throw new Error('INVALID_HANDOVER_AMOUNT: Requested amount must be a positive integer in paise');
  }

  // 2. Fetch authoritative partner custody
  const custodyRef = doc(db, 'deliveryPartnerCustody', deliveryPartnerId);
  const custodySnap = await getDoc(custodyRef);
  const currentBalancePaise = custodySnap.exists()
    ? Number(custodySnap.data().cashBalancePaise || 0)
    : 0;

  if (requestedAmountPaise > currentBalancePaise) {
    throw new Error(
      `INSUFFICIENT_CUSTODY_BALANCE: Requested handover of ₹${requestedAmountPaise / 100} exceeds available cash custody balance of ₹${currentBalancePaise / 100}`
    );
  }

  // 3. Authoritative calculation & collection validation
  const orderIds: string[] = [];
  const uniqueCollectionIds = Array.from(new Set(collectionIds));

  // Check all existing active handovers to prevent duplicate collection submissions
  const existingHandoversSnap = await getDocs(
    query(
      collection(db, 'codHandovers'),
      where('deliveryPartnerId', '==', deliveryPartnerId),
      where('status', 'in', ['SUBMITTED', 'ACCEPTED'])
    )
  );

  const alreadyHandedOverCollectionIds = new Set<string>();
  existingHandoversSnap.docs.forEach(d => {
    const hData = d.data() as CODHandoverRecord;
    (hData.collectionIds || []).forEach(cId => alreadyHandedOverCollectionIds.add(cId));
  });

  let validatedCollectionIds: string[] = [];

  if (uniqueCollectionIds.length > 0) {
    let collectionsSumPaise = 0;
    for (const cId of uniqueCollectionIds) {
      if (alreadyHandedOverCollectionIds.has(cId)) {
        throw new Error(`COLLECTION_ALREADY_HANDED_OVER: Collection ${cId} is already part of an active or accepted handover`);
      }

      const colRef = doc(db, 'codCollections', cId);
      const colSnap = await getDoc(colRef);
      if (!colSnap.exists()) {
        throw new Error(`COLLECTION_NOT_FOUND: COD Collection ${cId} not found`);
      }

      const colData = colSnap.data() as CODCollectionRecord;
      if (colData.deliveryPartnerId !== deliveryPartnerId) {
        throw new Error(`FORBIDDEN_COLLECTION_OWNERSHIP: Collection ${cId} does not belong to delivery employee ${deliveryPartnerId}`);
      }

      if (colData.paymentMethod !== 'CASH') {
        throw new Error(`INVALID_COLLECTION_PAYMENT_METHOD: Only physical CASH collections can be handed over. Collection ${cId} is ${colData.paymentMethod}`);
      }

      if (colData.collectionStatus !== 'COLLECTED') {
        throw new Error(`INVALID_COLLECTION_STATUS: Collection ${cId} has status '${colData.collectionStatus}', must be COLLECTED`);
      }

      collectionsSumPaise += Number(colData.amountCollectedPaise || 0);

      if (colData.orderId && !orderIds.includes(colData.orderId)) {
        orderIds.push(colData.orderId);
      }
    }

    if (requestedAmountPaise > collectionsSumPaise) {
      throw new Error(
        `REQUESTED_AMOUNT_EXCEEDS_COLLECTIONS: Requested handover (₹${requestedAmountPaise / 100}) exceeds sum of selected collections (₹${collectionsSumPaise / 100})`
      );
    }
    validatedCollectionIds = uniqueCollectionIds;
  } else {
    // If client did not specify collection IDs, auto-associate eligible unhanded CASH collections
    const eligibleCash = await getEligibleCashCollections(deliveryPartnerId);
    let accumulated = 0;
    for (const c of eligibleCash) {
      if (accumulated < requestedAmountPaise) {
        validatedCollectionIds.push(c.collectionId);
        if (c.orderId && !orderIds.includes(c.orderId)) {
          orderIds.push(c.orderId);
        }
        accumulated += Number(c.amountCollectedPaise || 0);
      }
    }
  }

  // 4. Create Handover Record
  const now = new Date().toISOString();
  const handoverId = `HND-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  const handoverRecord: CODHandoverRecord = {
    handoverId,
    deliveryPartnerId,
    deliveryPartnerName: deliveryPartnerName || deliveryPartnerId,
    warehouseId: OPERATIONAL_WAREHOUSE_ID,
    destinationType,
    destinationId: destinationType === 'WAREHOUSE' ? OPERATIONAL_WAREHOUSE_ID : undefined,
    status: 'SUBMITTED',
    requestedAmountPaise,
    acceptedAmountPaise: null,
    discrepancyAmountPaise: null,
    collectionIds: validatedCollectionIds,
    orderIds,
    submittedAt: now,
    submittedBy: deliveryPartnerId,
    acceptedAt: null,
    acceptedBy: null,
    notes: notes ? String(notes).trim() : null,
    createdAt: now,
    updatedAt: now,
    _serverTxnToken: SERVER_INTERNAL_TOKEN,
    _serverWriteNonce: generateServerNonce(),
  };

  const handoverRef = doc(db, 'codHandovers', handoverId);
  await setDoc(handoverRef, handoverRecord);

  await recordHandoverAudit(handoverId, 'COD_HANDOVER_SUBMITTED', deliveryPartnerId, OPERATIONAL_WAREHOUSE_ID, {
    requestedAmountPaise,
    destinationType,
    collectionCount: collectionIds.length,
  });

  return handoverRecord;
}

/**
 * Atomically accept a COD cash handover with actual physical count verification
 */
export async function acceptCodHandover(params: {
  handoverId: string;
  receiverId: string;
  receiverRole: string;
  destinationTypeExpected: CODHandoverDestinationType;
  receivedAmountPaise: number;
  notes?: string;
}): Promise<{
  success: boolean;
  isIdempotentReplay: boolean;
  handover: CODHandoverRecord;
  discrepancyAmountPaise: number;
}> {
  const {
    handoverId,
    receiverId,
    destinationTypeExpected,
    receivedAmountPaise,
    notes,
  } = params;

  if (!Number.isInteger(receivedAmountPaise) || receivedAmountPaise < 0) {
    throw new Error('INVALID_RECEIVED_AMOUNT: Received amount must be a non-negative integer in paise');
  }

  const now = new Date().toISOString();
  const idempotencyKey = `cod_handover_${handoverId}_accept`;
  const idempRef = doc(db, 'idempotencyKeys', idempotencyKey);
  const handoverRef = doc(db, 'codHandovers', handoverId);

  let resultHandover: CODHandoverRecord | null = null;
  let isIdempotentReplay = false;
  let discrepancyAmountPaise = 0;

  await runTransaction(db, async txn => {
    // 1. Check idempotency key first
    const idempSnap = await txn.get(idempRef);
    if (idempSnap.exists()) {
      const hSnap = await txn.get(handoverRef);
      if (hSnap.exists()) {
        resultHandover = hSnap.data() as CODHandoverRecord;
        isIdempotentReplay = true;
        discrepancyAmountPaise = resultHandover.discrepancyAmountPaise || 0;
        return;
      }
    }

    // 2. Fetch Handover Record
    const handoverSnap = await txn.get(handoverRef);
    if (!handoverSnap.exists()) {
      throw new Error('HANDOVER_NOT_FOUND: Handover record does not exist');
    }

    const handover = handoverSnap.data() as CODHandoverRecord;

    // Check idempotent replay by status
    if (handover.status === 'ACCEPTED') {
      resultHandover = handover;
      isIdempotentReplay = true;
      discrepancyAmountPaise = handover.discrepancyAmountPaise || 0;
      return;
    }

    if (handover.status !== 'SUBMITTED') {
      throw new Error(`INVALID_HANDOVER_STATUS: Cannot accept handover with status '${handover.status}'. Must be SUBMITTED.`);
    }

    if (receivedAmountPaise > handover.requestedAmountPaise) {
      throw new Error(
        `INVALID_RECEIVED_AMOUNT: Received amount (₹${receivedAmountPaise / 100}) cannot exceed requested handover amount (₹${handover.requestedAmountPaise / 100})`
      );
    }

    // 3. Destination Match Enforcement
    if (handover.destinationType !== destinationTypeExpected) {
      throw new Error(
        `DESTINATION_MISMATCH: Handover destination is '${handover.destinationType}', cannot be accepted through '${destinationTypeExpected}' channel`
      );
    }

    // 4. Delivery Partner Self-Approval Prohibition
    if (handover.deliveryPartnerId === receiverId) {
      throw new Error('SELF_APPROVAL_FORBIDDEN: Delivery partner cannot accept their own cash handover');
    }

    // 5. Source Custody Verification
    const custodyRef = doc(db, 'deliveryPartnerCustody', handover.deliveryPartnerId);
    const custodySnap = await txn.get(custodyRef);
    const currentPartnerBalancePaise = custodySnap.exists()
      ? Number(custodySnap.data().cashBalancePaise || 0)
      : 0;

    if (receivedAmountPaise > currentPartnerBalancePaise) {
      throw new Error(
        `INSUFFICIENT_SOURCE_CUSTODY: Accepted amount (₹${receivedAmountPaise / 100}) exceeds delivery partner available custody balance (₹${currentPartnerBalancePaise / 100})`
      );
    }

    // 6. Discrepancy Calculation
    // If received < requested, difference remains in partner custody as unresolved
    const acceptedAmountPaise = receivedAmountPaise;
    discrepancyAmountPaise = Math.max(0, handover.requestedAmountPaise - acceptedAmountPaise);

    // 7. Reduce Delivery Partner Cash Custody by accepted amount ONLY
    const newPartnerBalancePaise = currentPartnerBalancePaise - acceptedAmountPaise;
    txn.update(custodyRef, {
      cashBalancePaise: newPartnerBalancePaise,
      updatedAt: now,
      _serverTxnToken: SERVER_INTERNAL_TOKEN,
      _serverWriteNonce: generateServerNonce(),
    });

    // 8. Increase Destination Operational Cash Custody
    let newDestinationBalancePaise = 0;
    if (destinationTypeExpected === 'WAREHOUSE') {
      const whCustodyRef = doc(db, 'warehouseCashCustody', OPERATIONAL_WAREHOUSE_ID);
      const whSnap = await txn.get(whCustodyRef);
      const currentWhBalance = whSnap.exists()
        ? Number(whSnap.data().cashBalancePaise || 0)
        : 0;
      newDestinationBalancePaise = currentWhBalance + acceptedAmountPaise;

      txn.set(whCustodyRef, {
        warehouseId: OPERATIONAL_WAREHOUSE_ID,
        cashBalancePaise: newDestinationBalancePaise,
        updatedAt: now,
        _serverTxnToken: SERVER_INTERNAL_TOKEN,
        _serverWriteNonce: generateServerNonce(),
      }, { merge: true });
    } else {
      // ADMIN
      const adminCustodyRef = doc(db, 'adminCashCustody', receiverId);
      const admSnap = await txn.get(adminCustodyRef);
      const currentAdmBalance = admSnap.exists()
        ? Number(admSnap.data().cashBalancePaise || 0)
        : 0;
      newDestinationBalancePaise = currentAdmBalance + acceptedAmountPaise;

      txn.set(adminCustodyRef, {
        adminId: receiverId,
        cashBalancePaise: newDestinationBalancePaise,
        updatedAt: now,
        _serverTxnToken: SERVER_INTERNAL_TOKEN,
        _serverWriteNonce: generateServerNonce(),
      }, { merge: true });
    }

    // 9. Create Immutable Custody Movements
    // Movement OUT for delivery partner
    const movOutId = `MOV-OUT-${handoverId}`;
    const movOutRef = doc(db, 'deliveryCustodyMovements', movOutId);
    const movOut: DeliveryCustodyMovement = {
      movementId: movOutId,
      partnerId: handover.deliveryPartnerId,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      handoverId,
      destinationType: destinationTypeExpected,
      destinationId: receiverId,
      movementType: 'COD_HANDOVER_OUT',
      amountPaise: acceptedAmountPaise,
      balanceAfterPaise: newPartnerBalancePaise,
      timestamp: now,
      createdBy: receiverId,
      _serverTxnToken: SERVER_INTERNAL_TOKEN,
      _serverWriteNonce: generateServerNonce(),
    };
    txn.set(movOutRef, movOut);

    // Movement IN for receiving destination
    const movInId = `MOV-IN-${handoverId}`;
    const movInRef = doc(db, 'deliveryCustodyMovements', movInId);
    const movIn: DeliveryCustodyMovement = {
      movementId: movInId,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      handoverId,
      destinationType: destinationTypeExpected,
      destinationId: receiverId,
      sourceId: handover.deliveryPartnerId,
      movementType: 'COD_HANDOVER_IN',
      amountPaise: acceptedAmountPaise,
      balanceAfterPaise: newDestinationBalancePaise,
      timestamp: now,
      createdBy: receiverId,
      _serverTxnToken: SERVER_INTERNAL_TOKEN,
      _serverWriteNonce: generateServerNonce(),
    };
    txn.set(movInRef, movIn);

    // 10. Update Handover Record
    const updatedHandover: CODHandoverRecord = {
      ...handover,
      status: 'ACCEPTED',
      acceptedAmountPaise,
      discrepancyAmountPaise,
      acceptedAt: now,
      acceptedBy: receiverId,
      destinationId: receiverId,
      notes: notes ? `${handover.notes ? handover.notes + ' | ' : ''}Accepted notes: ${notes}` : handover.notes,
      updatedAt: now,
      _serverTxnToken: SERVER_INTERNAL_TOKEN,
      _serverWriteNonce: generateServerNonce(),
    };

    txn.update(handoverRef, {
      status: 'ACCEPTED',
      acceptedAmountPaise,
      discrepancyAmountPaise,
      acceptedAt: now,
      acceptedBy: receiverId,
      destinationId: receiverId,
      notes: updatedHandover.notes,
      updatedAt: now,
      _serverTxnToken: SERVER_INTERNAL_TOKEN,
      _serverWriteNonce: generateServerNonce(),
    });

    resultHandover = updatedHandover;

    // 11. Record Idempotency Key
    txn.set(idempRef, {
      key: idempotencyKey,
      handoverId,
      deliveryPartnerId: handover.deliveryPartnerId,
      destinationType: destinationTypeExpected,
      acceptedAmountPaise,
      discrepancyAmountPaise,
      status: 'COMPLETED',
      createdAt: now,
      _serverTxnToken: SERVER_INTERNAL_TOKEN,
      _serverWriteNonce: generateServerNonce(),
    });
  });

  if (isIdempotentReplay && resultHandover) {
    return {
      success: true,
      isIdempotentReplay: true,
      handover: resultHandover,
      discrepancyAmountPaise,
    };
  }

  // 12. Record Audit Logging outside transaction
  const auditEvent = destinationTypeExpected === 'WAREHOUSE'
    ? 'COD_HANDOVER_ACCEPTED_WAREHOUSE'
    : 'COD_HANDOVER_ACCEPTED_ADMIN';

  const handoverDoc = resultHandover as CODHandoverRecord | null;

  await recordHandoverAudit(handoverId, auditEvent, receiverId, OPERATIONAL_WAREHOUSE_ID, {
    deliveryPartnerId: handoverDoc?.deliveryPartnerId,
    requestedAmountPaise: handoverDoc?.requestedAmountPaise,
    acceptedAmountPaise: handoverDoc?.acceptedAmountPaise,
    discrepancyAmountPaise,
  });

  if (discrepancyAmountPaise > 0) {
    await recordHandoverAudit(handoverId, 'COD_DISCREPANCY_FLAGGED', receiverId, OPERATIONAL_WAREHOUSE_ID, {
      deliveryPartnerId: handoverDoc?.deliveryPartnerId,
      requestedAmountPaise: handoverDoc?.requestedAmountPaise,
      acceptedAmountPaise: handoverDoc?.acceptedAmountPaise,
      discrepancyAmountPaise,
    });
  }

  return {
    success: true,
    isIdempotentReplay: false,
    handover: handoverDoc!,
    discrepancyAmountPaise,
  };
}

/**
 * Reject a submitted COD cash handover request
 */
export async function rejectCodHandover(params: {
  handoverId: string;
  receiverId: string;
  destinationTypeExpected: CODHandoverDestinationType;
  reason?: string;
}): Promise<CODHandoverRecord> {
  const { handoverId, receiverId, destinationTypeExpected, reason } = params;

  const handoverRef = doc(db, 'codHandovers', handoverId);
  const snap = await getDoc(handoverRef);
  if (!snap.exists()) {
    throw new Error('HANDOVER_NOT_FOUND: Handover record does not exist');
  }

  const handover = snap.data() as CODHandoverRecord;

  if (handover.status === 'ACCEPTED') {
    throw new Error('ACCEPTED_HANDOVER_CANNOT_BE_REJECTED: Handover is already accepted and cannot be rejected');
  }

  if (handover.status !== 'SUBMITTED') {
    throw new Error(`INVALID_HANDOVER_STATUS: Cannot reject handover with status '${handover.status}'`);
  }

  if (handover.destinationType !== destinationTypeExpected) {
    throw new Error(
      `DESTINATION_MISMATCH: Handover destination is '${handover.destinationType}', cannot be rejected through '${destinationTypeExpected}' channel`
    );
  }

  const now = new Date().toISOString();
  const updates = {
    status: 'REJECTED' as CODHandoverStatus,
    rejectedAt: now,
    rejectedBy: receiverId,
    rejectionReason: reason ? String(reason).trim() : 'Rejected by recipient',
    updatedAt: now,
    _serverTxnToken: SERVER_INTERNAL_TOKEN,
    _serverWriteNonce: generateServerNonce(),
  };

  await setDoc(handoverRef, updates, { merge: true });

  await recordHandoverAudit(handoverId, 'COD_HANDOVER_REJECTED', receiverId, OPERATIONAL_WAREHOUSE_ID, {
    reason: updates.rejectionReason,
  });

  return {
    ...handover,
    ...updates,
  };
}

/**
 * Cancel a submitted COD cash handover by the delivery partner
 */
export async function cancelCodHandover(params: {
  handoverId: string;
  deliveryPartnerId: string;
}): Promise<CODHandoverRecord> {
  const { handoverId, deliveryPartnerId } = params;

  const handoverRef = doc(db, 'codHandovers', handoverId);
  const snap = await getDoc(handoverRef);
  if (!snap.exists()) {
    throw new Error('HANDOVER_NOT_FOUND: Handover record does not exist');
  }

  const handover = snap.data() as CODHandoverRecord;

  if (handover.deliveryPartnerId !== deliveryPartnerId) {
    throw new Error('FORBIDDEN_NOT_HANDOVER_OWNER: You can only cancel your own handovers');
  }

  if (handover.status === 'ACCEPTED') {
    throw new Error('ACCEPTED_HANDOVER_CANNOT_BE_CANCELLED: Accepted handovers cannot be cancelled');
  }

  if (handover.status !== 'SUBMITTED') {
    throw new Error(`INVALID_HANDOVER_STATUS: Handover with status '${handover.status}' cannot be cancelled`);
  }

  const now = new Date().toISOString();
  const updates = {
    status: 'CANCELLED' as CODHandoverStatus,
    updatedAt: now,
    _serverTxnToken: SERVER_INTERNAL_TOKEN,
    _serverWriteNonce: generateServerNonce(),
  };

  await setDoc(handoverRef, updates, { merge: true });

  await recordHandoverAudit(handoverId, 'COD_HANDOVER_CANCELLED', deliveryPartnerId, OPERATIONAL_WAREHOUSE_ID);

  return {
    ...handover,
    ...updates,
  };
}

/**
 * Query unhanded CASH COD collections eligible for handover
 */
export async function getEligibleCashCollections(partnerId: string): Promise<CODCollectionRecord[]> {
  const collectionsSnap = await getDocs(
    query(
      collection(db, 'codCollections'),
      where('deliveryPartnerId', '==', partnerId),
      where('paymentMethod', '==', 'CASH'),
      where('collectionStatus', '==', 'COLLECTED')
    )
  );

  const allCash = collectionsSnap.docs.map(d => d.data() as CODCollectionRecord);

  // Exclude collections already part of SUBMITTED or ACCEPTED handovers
  const handoversSnap = await getDocs(
    query(
      collection(db, 'codHandovers'),
      where('deliveryPartnerId', '==', partnerId),
      where('status', 'in', ['SUBMITTED', 'ACCEPTED'])
    )
  );

  const handedOverIds = new Set<string>();
  handoversSnap.docs.forEach(d => {
    const h = d.data() as CODHandoverRecord;
    (h.collectionIds || []).forEach(id => handedOverIds.add(id));
  });

  return allCash.filter(c => !handedOverIds.has(c.collectionId));
}

/**
 * Authoritative summary of eligible cash handover balance and collections
 */
export async function getAuthoritativeEligibleAmount(partnerId: string): Promise<{
  cashBalancePaise: number;
  cashBalanceRupees: number;
  eligibleCollectionsCount: number;
  eligibleTotalPaise: number;
  eligibleTotalRupees: number;
  eligibleCollections: CODCollectionRecord[];
}> {
  const custodyRef = doc(db, 'deliveryPartnerCustody', partnerId);
  const custodySnap = await getDoc(custodyRef);
  const cashBalancePaise = custodySnap.exists() ? Number(custodySnap.data().cashBalancePaise || 0) : 0;
  const eligibleCollections = await getEligibleCashCollections(partnerId);
  const eligibleTotalPaise = eligibleCollections.reduce((sum, c) => sum + Number(c.amountCollectedPaise || 0), 0);

  return {
    cashBalancePaise,
    cashBalanceRupees: cashBalancePaise / 100,
    eligibleCollectionsCount: eligibleCollections.length,
    eligibleTotalPaise,
    eligibleTotalRupees: eligibleTotalPaise / 100,
    eligibleCollections,
  };
}

/**
 * Query handovers for a delivery partner
 */
export async function listPartnerHandovers(partnerId: string): Promise<CODHandoverRecord[]> {
  const snap = await getDocs(
    query(
      collection(db, 'codHandovers'),
      where('deliveryPartnerId', '==', partnerId)
    )
  );
  const handovers = snap.docs.map(d => d.data() as CODHandoverRecord);
  return handovers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Query handovers for warehouse
 */
export async function listWarehouseHandovers(warehouseId: string = OPERATIONAL_WAREHOUSE_ID): Promise<CODHandoverRecord[]> {
  const snap = await getDocs(
    query(
      collection(db, 'codHandovers'),
      where('warehouseId', '==', warehouseId),
      where('destinationType', '==', 'WAREHOUSE')
    )
  );
  const handovers = snap.docs.map(d => d.data() as CODHandoverRecord);
  return handovers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Query handovers for admin
 */
export async function listAdminHandovers(): Promise<CODHandoverRecord[]> {
  const snap = await getDocs(
    query(
      collection(db, 'codHandovers'),
      where('destinationType', '==', 'ADMIN')
    )
  );
  const handovers = snap.docs.map(d => d.data() as CODHandoverRecord);
  return handovers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Fetch warehouse operational cash custody balance
 */
export async function getWarehouseCashCustody(warehouseId: string = OPERATIONAL_WAREHOUSE_ID): Promise<{
  warehouseId: string;
  cashBalancePaise: number;
  cashBalanceRupees: number;
  updatedAt: string;
}> {
  const snap = await getDoc(doc(db, 'warehouseCashCustody', warehouseId));
  if (!snap.exists()) {
    return {
      warehouseId,
      cashBalancePaise: 0,
      cashBalanceRupees: 0,
      updatedAt: new Date().toISOString(),
    };
  }
  const data = snap.data();
  const cashBalancePaise = Number(data.cashBalancePaise || 0);
  return {
    warehouseId,
    cashBalancePaise,
    cashBalanceRupees: cashBalancePaise / 100,
    updatedAt: data.updatedAt || new Date().toISOString(),
  };
}

/**
 * Fetch admin operational cash custody balance
 */
export async function getAdminCashCustody(adminId: string): Promise<{
  adminId: string;
  cashBalancePaise: number;
  cashBalanceRupees: number;
  updatedAt: string;
}> {
  const snap = await getDoc(doc(db, 'adminCashCustody', adminId));
  if (!snap.exists()) {
    return {
      adminId,
      cashBalancePaise: 0,
      cashBalanceRupees: 0,
      updatedAt: new Date().toISOString(),
    };
  }
  const data = snap.data();
  const cashBalancePaise = Number(data.cashBalancePaise || 0);
  return {
    adminId,
    cashBalancePaise,
    cashBalanceRupees: cashBalancePaise / 100,
    updatedAt: data.updatedAt || new Date().toISOString(),
  };
}
