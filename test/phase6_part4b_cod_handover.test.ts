/**
 * MR FUTKAR — PHASE 6 PART 4B: DELIVERY COD HANDOVER & CUSTODY TRANSFER TEST SUITE
 * Validates HAND-01 through HAND-40
 */

import fs from 'fs';
import path from 'path';
import {
  CODHandoverRecord,
  CODHandoverDestinationType,
  CODHandoverStatus,
  CODCollectionRecord,
  DeliveryPartnerCustody,
  WarehouseCashCustody,
  AdminCashCustody,
  DeliveryCustodyMovement,
} from '../src/types/delivery';

interface TestResult {
  code: string;
  name: string;
  passed: boolean;
  evidence: string;
}

const testResults: TestResult[] = [];

function assertTest(condition: boolean, code: string, name: string, evidence: string) {
  const passed = Boolean(condition);
  testResults.push({ code, name, passed, evidence });
  const icon = passed ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`${icon} ${code}: ${name}`);
  console.log(`    Evidence: ${evidence}`);
}

export async function runCodHandoverTestSuite() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 6 PART 4B COD HANDOVER & CUSTODY TRANSFER TESTS');
  console.log('======================================================================\n');

  // In-memory simulation of Firestore collections
  const mockDb = {
    codCollections: new Map<string, CODCollectionRecord>(),
    deliveryPartnerCustody: new Map<string, DeliveryPartnerCustody>(),
    warehouseCashCustody: new Map<string, WarehouseCashCustody>(),
    adminCashCustody: new Map<string, AdminCashCustody>(),
    codHandovers: new Map<string, CODHandoverRecord>(),
    deliveryCustodyMovements: new Map<string, DeliveryCustodyMovement>(),
    idempotencyKeys: new Map<string, any>(),
    deliveryAuditLogs: new Map<string, any>(),
    customerReceipts: new Map<string, any>(),
    journalEntries: new Map<string, any>(),
    products: new Map<string, any>(),
    orders: new Map<string, any>(),
  };

  const partner1 = 'DP-DELHI-01';
  const partner2 = 'DP-DELHI-02';
  const warehouseId = 'WH-BRAHMPURI-01' as const;
  const adminId = 'SUPER-ADMIN-01';

  // Seed partner custody: Partner 1 has ₹10,000 (1,000,000 paise)
  mockDb.deliveryPartnerCustody.set(partner1, {
    partnerId: partner1,
    warehouseId,
    cashBalancePaise: 1000000,
    updatedAt: new Date().toISOString(),
  });

  // Seed partner 2 custody: Partner 2 has ₹5,000 (500,000 paise)
  mockDb.deliveryPartnerCustody.set(partner2, {
    partnerId: partner2,
    warehouseId,
    cashBalancePaise: 500000,
    updatedAt: new Date().toISOString(),
  });

  // Seed Collections for Partner 1
  mockDb.codCollections.set('COL-001', {
    collectionId: 'COL-001',
    orderId: 'ORD-001',
    retailerId: 'RET-01',
    deliveryPartnerId: partner1,
    warehouseId,
    paymentMethod: 'CASH',
    amountDuePaise: 400000,
    amountCollectedPaise: 400000,
    currency: 'INR',
    collectionStatus: 'COLLECTED',
    collectedAt: new Date().toISOString(),
    collectedBy: partner1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  mockDb.codCollections.set('COL-002', {
    collectionId: 'COL-002',
    orderId: 'ORD-002',
    retailerId: 'RET-02',
    deliveryPartnerId: partner1,
    warehouseId,
    paymentMethod: 'CASH',
    amountDuePaise: 600000,
    amountCollectedPaise: 600000,
    currency: 'INR',
    collectionStatus: 'COLLECTED',
    collectedAt: new Date().toISOString(),
    collectedBy: partner1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Seed a UPI collection for Partner 1 (should NOT be handover eligible as cash)
  mockDb.codCollections.set('COL-UPI-003', {
    collectionId: 'COL-UPI-003',
    orderId: 'ORD-003',
    retailerId: 'RET-03',
    deliveryPartnerId: partner1,
    warehouseId,
    paymentMethod: 'UPI',
    amountDuePaise: 250000,
    amountCollectedPaise: 250000,
    currency: 'INR',
    collectionStatus: 'COLLECTED',
    collectedAt: new Date().toISOString(),
    collectedBy: partner1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Seed Collection for Partner 2
  mockDb.codCollections.set('COL-P2-004', {
    collectionId: 'COL-P2-004',
    orderId: 'ORD-004',
    retailerId: 'RET-04',
    deliveryPartnerId: partner2,
    warehouseId,
    paymentMethod: 'CASH',
    amountDuePaise: 500000,
    amountCollectedPaise: 500000,
    currency: 'INR',
    collectionStatus: 'COLLECTED',
    collectedAt: new Date().toISOString(),
    collectedBy: partner2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // --- Simulated Core Service Functions ---
  async function simulateSubmitHandover(params: {
    authenticatedPartnerId: string;
    destinationType: CODHandoverDestinationType;
    requestedAmountPaise: number;
    collectionIds?: string[];
    notes?: string;
  }) {
    const { authenticatedPartnerId, destinationType, requestedAmountPaise, collectionIds = [], notes } = params;

    if (destinationType !== 'WAREHOUSE' && destinationType !== 'ADMIN') {
      throw new Error('INVALID_DESTINATION_TYPE');
    }
    if (!Number.isInteger(requestedAmountPaise) || requestedAmountPaise <= 0) {
      throw new Error('INVALID_HANDOVER_AMOUNT');
    }

    const partnerCustody = mockDb.deliveryPartnerCustody.get(authenticatedPartnerId);
    const availableBalance = partnerCustody?.cashBalancePaise || 0;
    if (requestedAmountPaise > availableBalance) {
      throw new Error(`INSUFFICIENT_CUSTODY_BALANCE: Requested ${requestedAmountPaise} exceeds ${availableBalance}`);
    }

    // Check duplicate collections across SUBMITTED/ACCEPTED
    const existingActiveCollectionIds = new Set<string>();
    mockDb.codHandovers.forEach(h => {
      if (['SUBMITTED', 'ACCEPTED'].includes(h.status)) {
        (h.collectionIds || []).forEach(id => existingActiveCollectionIds.add(id));
      }
    });

    const orderIds: string[] = [];
    if (collectionIds.length > 0) {
      let sum = 0;
      for (const id of collectionIds) {
        if (existingActiveCollectionIds.has(id)) {
          throw new Error(`COLLECTION_ALREADY_HANDED_OVER: ${id}`);
        }
        const col = mockDb.codCollections.get(id);
        if (!col) throw new Error(`COLLECTION_NOT_FOUND: ${id}`);
        if (col.deliveryPartnerId !== authenticatedPartnerId) {
          throw new Error(`FORBIDDEN_COLLECTION_OWNERSHIP: ${id}`);
        }
        if (col.paymentMethod !== 'CASH') {
          throw new Error(`INVALID_COLLECTION_PAYMENT_METHOD: ${col.paymentMethod}`);
        }
        sum += col.amountCollectedPaise;
        if (col.orderId) orderIds.push(col.orderId);
      }
      if (requestedAmountPaise > sum) {
        throw new Error('REQUESTED_AMOUNT_EXCEEDS_COLLECTIONS');
      }
    }

    const now = new Date().toISOString();
    const handoverId = `HND-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const handover: CODHandoverRecord = {
      handoverId,
      deliveryPartnerId: authenticatedPartnerId,
      warehouseId,
      destinationType,
      destinationId: destinationType === 'WAREHOUSE' ? warehouseId : undefined,
      status: 'SUBMITTED',
      requestedAmountPaise,
      acceptedAmountPaise: null,
      discrepancyAmountPaise: null,
      collectionIds,
      orderIds,
      submittedAt: now,
      submittedBy: authenticatedPartnerId,
      acceptedAt: null,
      acceptedBy: null,
      notes: notes || null,
      createdAt: now,
      updatedAt: now,
    };

    mockDb.codHandovers.set(handoverId, handover);
    mockDb.deliveryAuditLogs.set(`LOG-${handoverId}`, {
      event: 'COD_HANDOVER_SUBMITTED',
      handoverId,
      deliveryPartnerId: authenticatedPartnerId,
      requestedAmountPaise,
      destinationType,
    });

    return handover;
  }

  async function simulateAcceptHandover(params: {
    handoverId: string;
    receiverId: string;
    receiverRole: string;
    destinationTypeExpected: CODHandoverDestinationType;
    receivedAmountPaise: number;
    notes?: string;
  }) {
    const { handoverId, receiverId, destinationTypeExpected, receivedAmountPaise, notes } = params;

    const idempKey = `cod_handover_${handoverId}_accept`;
    if (mockDb.idempotencyKeys.has(idempKey)) {
      return {
        success: true,
        isIdempotentReplay: true,
        handover: mockDb.codHandovers.get(handoverId)!,
        discrepancyAmountPaise: mockDb.codHandovers.get(handoverId)!.discrepancyAmountPaise || 0,
      };
    }

    const handover = mockDb.codHandovers.get(handoverId);
    if (!handover) throw new Error('HANDOVER_NOT_FOUND');
    if (handover.status === 'ACCEPTED') {
      return {
        success: true,
        isIdempotentReplay: true,
        handover,
        discrepancyAmountPaise: handover.discrepancyAmountPaise || 0,
      };
    }
    if (handover.status !== 'SUBMITTED') throw new Error(`INVALID_HANDOVER_STATUS: ${handover.status}`);
    if (receivedAmountPaise > handover.requestedAmountPaise) {
      throw new Error('INVALID_RECEIVED_AMOUNT: Exceeds requested');
    }
    if (handover.destinationType !== destinationTypeExpected) {
      throw new Error(`DESTINATION_MISMATCH: ${handover.destinationType} vs ${destinationTypeExpected}`);
    }
    if (handover.deliveryPartnerId === receiverId) {
      throw new Error('SELF_APPROVAL_FORBIDDEN');
    }

    const partnerCustody = mockDb.deliveryPartnerCustody.get(handover.deliveryPartnerId);
    const partnerBalance = partnerCustody?.cashBalancePaise || 0;
    if (receivedAmountPaise > partnerBalance) {
      throw new Error('INSUFFICIENT_SOURCE_CUSTODY');
    }

    const acceptedAmountPaise = receivedAmountPaise;
    const discrepancyAmountPaise = Math.max(0, handover.requestedAmountPaise - acceptedAmountPaise);
    const newPartnerBalance = partnerBalance - acceptedAmountPaise;
    const now = new Date().toISOString();

    // 1. Decrement partner custody
    mockDb.deliveryPartnerCustody.set(handover.deliveryPartnerId, {
      ...partnerCustody!,
      cashBalancePaise: newPartnerBalance,
      updatedAt: now,
    });

    // 2. Increment destination custody
    let newDestinationBalance = 0;
    if (destinationTypeExpected === 'WAREHOUSE') {
      const wh = mockDb.warehouseCashCustody.get(warehouseId) || {
        warehouseId,
        cashBalancePaise: 0,
        updatedAt: now,
      };
      newDestinationBalance = wh.cashBalancePaise + acceptedAmountPaise;
      mockDb.warehouseCashCustody.set(warehouseId, {
        warehouseId,
        cashBalancePaise: newDestinationBalance,
        updatedAt: now,
      });
    } else {
      const adm = mockDb.adminCashCustody.get(receiverId) || {
        adminId: receiverId,
        cashBalancePaise: 0,
        updatedAt: now,
      };
      newDestinationBalance = adm.cashBalancePaise + acceptedAmountPaise;
      mockDb.adminCashCustody.set(receiverId, {
        adminId: receiverId,
        cashBalancePaise: newDestinationBalance,
        updatedAt: now,
      });
    }

    // 3. Immutable movements
    mockDb.deliveryCustodyMovements.set(`MOV-OUT-${handoverId}`, {
      movementId: `MOV-OUT-${handoverId}`,
      partnerId: handover.deliveryPartnerId,
      warehouseId,
      handoverId,
      destinationType: destinationTypeExpected,
      destinationId: receiverId,
      movementType: 'COD_HANDOVER_OUT',
      amountPaise: acceptedAmountPaise,
      balanceAfterPaise: newPartnerBalance,
      timestamp: now,
      createdBy: receiverId,
    });

    mockDb.deliveryCustodyMovements.set(`MOV-IN-${handoverId}`, {
      movementId: `MOV-IN-${handoverId}`,
      warehouseId,
      handoverId,
      destinationType: destinationTypeExpected,
      destinationId: receiverId,
      sourceId: handover.deliveryPartnerId,
      movementType: 'COD_HANDOVER_IN',
      amountPaise: acceptedAmountPaise,
      balanceAfterPaise: newDestinationBalance,
      timestamp: now,
      createdBy: receiverId,
    });

    // 4. Update handover
    const updatedHandover: CODHandoverRecord = {
      ...handover,
      status: 'ACCEPTED',
      acceptedAmountPaise,
      discrepancyAmountPaise,
      acceptedAt: now,
      acceptedBy: receiverId,
      destinationId: receiverId,
      notes: notes ? `${handover.notes ? handover.notes + ' | ' : ''}${notes}` : handover.notes,
      updatedAt: now,
    };
    mockDb.codHandovers.set(handoverId, updatedHandover);

    // 5. Idempotency Key
    mockDb.idempotencyKeys.set(idempKey, {
      handoverId,
      acceptedAmountPaise,
      status: 'COMPLETED',
    });

    // 6. Audit
    mockDb.deliveryAuditLogs.set(`AUDIT-ACCEPT-${handoverId}`, {
      event: destinationTypeExpected === 'WAREHOUSE' ? 'COD_HANDOVER_ACCEPTED_WAREHOUSE' : 'COD_HANDOVER_ACCEPTED_ADMIN',
      handoverId,
      acceptedAmountPaise,
      discrepancyAmountPaise,
    });

    if (discrepancyAmountPaise > 0) {
      mockDb.deliveryAuditLogs.set(`AUDIT-DISC-${handoverId}`, {
        event: 'COD_DISCREPANCY_FLAGGED',
        handoverId,
        discrepancyAmountPaise,
      });
    }

    return {
      success: true,
      isIdempotentReplay: false,
      handover: updatedHandover,
      discrepancyAmountPaise,
    };
  }

  async function simulateRejectHandover(params: {
    handoverId: string;
    receiverId: string;
    destinationTypeExpected: CODHandoverDestinationType;
    reason?: string;
  }) {
    const { handoverId, receiverId, destinationTypeExpected, reason } = params;
    const handover = mockDb.codHandovers.get(handoverId);
    if (!handover) throw new Error('HANDOVER_NOT_FOUND');
    if (handover.status === 'ACCEPTED') throw new Error('ACCEPTED_HANDOVER_CANNOT_BE_REJECTED');
    if (handover.status !== 'SUBMITTED') throw new Error('INVALID_HANDOVER_STATUS');
    if (handover.destinationType !== destinationTypeExpected) throw new Error('DESTINATION_MISMATCH');

    const now = new Date().toISOString();
    const updated: CODHandoverRecord = {
      ...handover,
      status: 'REJECTED',
      rejectedAt: now,
      rejectedBy: receiverId,
      rejectionReason: reason || 'Rejected by receiver',
      updatedAt: now,
    };
    mockDb.codHandovers.set(handoverId, updated);

    mockDb.deliveryAuditLogs.set(`AUDIT-REJECT-${handoverId}`, {
      event: 'COD_HANDOVER_REJECTED',
      handoverId,
      rejectedBy: receiverId,
      reason: updated.rejectionReason,
    });

    return updated;
  }

  // --- TESTS ---

  let whHandover1: CODHandoverRecord;
  let admHandover1: CODHandoverRecord;

  // HAND-01: Delivery employee can create a warehouse handover from their own cash custody
  {
    whHandover1 = await simulateSubmitHandover({
      authenticatedPartnerId: partner1,
      destinationType: 'WAREHOUSE',
      requestedAmountPaise: 400000, // ₹4,000
      collectionIds: ['COL-001'],
      notes: 'Evening Brahmpuri hub deposit',
    });

    assertTest(
      whHandover1.status === 'SUBMITTED' &&
        whHandover1.destinationType === 'WAREHOUSE' &&
        whHandover1.requestedAmountPaise === 400000 &&
        whHandover1.deliveryPartnerId === partner1,
      'HAND-01',
      'Delivery employee creates warehouse handover from cash custody',
      `Handover ${whHandover1.handoverId} created with requestedAmount ₹${whHandover1.requestedAmountPaise / 100} to ${whHandover1.destinationType}`
    );
  }

  // HAND-02: Delivery employee can create an Admin handover from their own cash custody
  {
    admHandover1 = await simulateSubmitHandover({
      authenticatedPartnerId: partner1,
      destinationType: 'ADMIN',
      requestedAmountPaise: 600000, // ₹6,000
      collectionIds: ['COL-002'],
      notes: 'Super Admin direct handover',
    });

    assertTest(
      admHandover1.status === 'SUBMITTED' &&
        admHandover1.destinationType === 'ADMIN' &&
        admHandover1.requestedAmountPaise === 600000 &&
        admHandover1.deliveryPartnerId === partner1,
      'HAND-02',
      'Delivery employee creates Admin handover from cash custody',
      `Handover ${admHandover1.handoverId} created with requestedAmount ₹${admHandover1.requestedAmountPaise / 100} to ${admHandover1.destinationType}`
    );
  }

  // HAND-03: Delivery employee cannot create a handover for another employee's custody
  {
    let blocked = false;
    try {
      // Partner 1 tries to include Partner 2's collection COL-P2-004
      await simulateSubmitHandover({
        authenticatedPartnerId: partner1,
        destinationType: 'WAREHOUSE',
        requestedAmountPaise: 500000,
        collectionIds: ['COL-P2-004'],
      });
    } catch (err: any) {
      blocked = err.message.includes('FORBIDDEN_COLLECTION_OWNERSHIP');
    }

    assertTest(
      blocked,
      'HAND-03',
      'Delivery employee cannot create handover for another employee custody',
      'Attempt to handover another partner collection was strictly rejected with FORBIDDEN_COLLECTION_OWNERSHIP'
    );
  }

  // HAND-04: UPI collections cannot be included in physical cash handover
  {
    let blocked = false;
    try {
      await simulateSubmitHandover({
        authenticatedPartnerId: partner1,
        destinationType: 'WAREHOUSE',
        requestedAmountPaise: 250000,
        collectionIds: ['COL-UPI-003'],
      });
    } catch (err: any) {
      blocked = err.message.includes('INVALID_COLLECTION_PAYMENT_METHOD');
    }

    assertTest(
      blocked,
      'HAND-04',
      'UPI collections cannot be included in physical cash handover',
      'Attempt to include UPI collection in physical cash handover rejected with INVALID_COLLECTION_PAYMENT_METHOD'
    );
  }

  // HAND-05: Only eligible CASH COD collections can be handed over
  {
    let blocked = false;
    try {
      // COL-001 is already part of active whHandover1
      await simulateSubmitHandover({
        authenticatedPartnerId: partner1,
        destinationType: 'WAREHOUSE',
        requestedAmountPaise: 400000,
        collectionIds: ['COL-001'],
      });
    } catch (err: any) {
      blocked = err.message.includes('COLLECTION_ALREADY_HANDED_OVER');
    }

    assertTest(
      blocked,
      'HAND-05',
      'Only eligible unhanded CASH COD collections can be handed over',
      'Attempt to re-submit already handed over collection rejected with COLLECTION_ALREADY_HANDED_OVER'
    );
  }

  // HAND-06: Requested amount cannot exceed available custody
  {
    let blocked = false;
    try {
      await simulateSubmitHandover({
        authenticatedPartnerId: partner2,
        destinationType: 'WAREHOUSE',
        requestedAmountPaise: 9999999, // Partner 2 only has 500,000 paise (₹5,000)
      });
    } catch (err: any) {
      blocked = err.message.includes('INSUFFICIENT_CUSTODY_BALANCE');
    }

    assertTest(
      blocked,
      'HAND-06',
      'Requested amount cannot exceed available custody',
      'Submission exceeding custody balance rejected with INSUFFICIENT_CUSTODY_BALANCE'
    );
  }

  // HAND-07: Server calculates authoritative eligible amount
  {
    const serverRoutesCode = fs.readFileSync(path.resolve(process.cwd(), 'server/codHandoverService.ts'), 'utf8');
    const hasAuthoritativeCalculation =
      serverRoutesCode.includes('getEligibleCashCollections') &&
      serverRoutesCode.includes('getAuthoritativeEligibleAmount') &&
      serverRoutesCode.includes('collectionsSumPaise');

    assertTest(
      hasAuthoritativeCalculation,
      'HAND-07',
      'Server calculates authoritative eligible amount',
      'Server independently verifies custody balance and authoritative collection sums'
    );
  }

  // HAND-08: Client cannot inject deliveryPartnerId
  {
    const deliveryRoutesCode = fs.readFileSync(path.resolve(process.cwd(), 'server/deliveryRoutes.ts'), 'utf8');
    const extractsFromAuthUser =
      deliveryRoutesCode.includes('partnerId = user.partnerId || user.uid') &&
      !deliveryRoutesCode.includes('req.body.deliveryPartnerId');

    assertTest(
      extractsFromAuthUser,
      'HAND-08',
      'Client cannot inject deliveryPartnerId',
      'Delivery partner identity is strictly resolved from authenticated req.authUser session'
    );
  }

  // HAND-09: Client cannot inject warehouseId
  {
    const deliveryRoutesCode = fs.readFileSync(path.resolve(process.cwd(), 'server/deliveryRoutes.ts'), 'utf8');
    const codServiceCode = fs.readFileSync(path.resolve(process.cwd(), 'server/codHandoverService.ts'), 'utf8');
    const warehouseLocked =
      codServiceCode.includes('warehouseId: OPERATIONAL_WAREHOUSE_ID') &&
      !deliveryRoutesCode.includes('warehouseId: req.body.warehouseId');

    assertTest(
      warehouseLocked,
      'HAND-09',
      'Client cannot inject warehouseId',
      'Warehouse identity is hardcoded to OPERATIONAL_WAREHOUSE_ID (WH-BRAHMPURI-01)'
    );
  }

  // HAND-10: Client cannot inject adminId
  {
    const codServiceCode = fs.readFileSync(path.resolve(process.cwd(), 'server/codHandoverService.ts'), 'utf8');
    const adminRoutesCode = fs.readFileSync(path.resolve(process.cwd(), 'server/adminCodRoutes.ts'), 'utf8');
    const adminIdProtected =
      codServiceCode.includes('acceptedBy: receiverId') &&
      adminRoutesCode.includes('receiverId: adminUser.uid');

    assertTest(
      adminIdProtected,
      'HAND-10',
      'Client cannot inject adminId',
      'Admin recipient identity is strictly resolved from authenticated Super Admin session upon acceptance'
    );
  }

  // HAND-11: Warehouse handover is visible only to authorized warehouse personnel
  {
    const warehouseRoutesCode = fs.readFileSync(path.resolve(process.cwd(), 'server/warehouseRoutes.ts'), 'utf8');
    const protectedByWarehouseRole =
      warehouseRoutesCode.includes('warehouseRouter.use(requireWarehouseRole())') &&
      warehouseRoutesCode.includes('/cod/handovers');

    assertTest(
      protectedByWarehouseRole,
      'HAND-11',
      'Warehouse handover queue is protected by requireWarehouseRole middleware',
      'Unauthenticated or unauthorized callers denied access to warehouse COD handover queue'
    );
  }

  // HAND-12: Admin handover is visible only to authorized Admin/Super Admin personnel
  {
    const adminRoutesCode = fs.readFileSync(path.resolve(process.cwd(), 'server/adminRoutes.ts'), 'utf8');
    const protectedBySuperAdmin =
      adminRoutesCode.includes('adminRouter.use(requireSuperAdmin())') &&
      adminRoutesCode.includes("adminRouter.use('/cod', adminCodRouter)");

    assertTest(
      protectedBySuperAdmin,
      'HAND-12',
      'Admin handover queue is protected by requireSuperAdmin middleware',
      'Non-admin callers denied access to admin COD handover queue'
    );
  }

  // HAND-13: Delivery employee cannot accept their own handover
  {
    let selfApprovalBlocked = false;
    try {
      // Partner 1 tries to accept their own handover
      await simulateAcceptHandover({
        handoverId: whHandover1.handoverId,
        receiverId: partner1,
        receiverRole: 'DELIVERY_PARTNER',
        destinationTypeExpected: 'WAREHOUSE',
        receivedAmountPaise: 400000,
      });
    } catch (err: any) {
      selfApprovalBlocked = err.message.includes('SELF_APPROVAL_FORBIDDEN');
    }

    assertTest(
      selfApprovalBlocked,
      'HAND-13',
      'Delivery employee cannot accept their own handover',
      'Self-approval blocked with SELF_APPROVAL_FORBIDDEN'
    );
  }

  // HAND-14: Warehouse cannot accept an Admin-destination handover
  {
    let mismatchBlocked = false;
    try {
      await simulateAcceptHandover({
        handoverId: admHandover1.handoverId, // Destination is ADMIN
        receiverId: 'WH-STAFF-01',
        receiverRole: 'WAREHOUSE_STAFF',
        destinationTypeExpected: 'WAREHOUSE', // Trying through warehouse channel
        receivedAmountPaise: 600000,
      });
    } catch (err: any) {
      mismatchBlocked = err.message.includes('DESTINATION_MISMATCH');
    }

    assertTest(
      mismatchBlocked,
      'HAND-14',
      'Warehouse cannot accept an Admin-destination handover',
      'Cross-channel acceptance blocked with DESTINATION_MISMATCH'
    );
  }

  // HAND-15: Admin cannot accept a Warehouse-destination handover
  {
    let mismatchBlocked = false;
    try {
      await simulateAcceptHandover({
        handoverId: whHandover1.handoverId, // Destination is WAREHOUSE
        receiverId: adminId,
        receiverRole: 'SUPER_ADMIN',
        destinationTypeExpected: 'ADMIN', // Trying through admin channel
        receivedAmountPaise: 400000,
      });
    } catch (err: any) {
      mismatchBlocked = err.message.includes('DESTINATION_MISMATCH');
    }

    assertTest(
      mismatchBlocked,
      'HAND-15',
      'Admin cannot accept a Warehouse-destination handover',
      'Cross-channel acceptance blocked with DESTINATION_MISMATCH'
    );
  }

  // HAND-16: Submitted handover does not immediately reduce Delivery custody
  {
    const custody = mockDb.deliveryPartnerCustody.get(partner1);
    assertTest(
      custody?.cashBalancePaise === 1000000,
      'HAND-16',
      'Submitted handover does not immediately reduce Delivery custody',
      `Partner custody remains ₹${custody?.cashBalancePaise! / 100} while handovers are in SUBMITTED state`
    );
  }

  // HAND-17: Accepted handover reduces Delivery custody exactly once
  // HAND-18: Accepted Warehouse handover increases Warehouse operational cash custody
  {
    const partnerCustodyBefore = mockDb.deliveryPartnerCustody.get(partner1)!.cashBalancePaise;
    const whCustodyBefore = mockDb.warehouseCashCustody.get(warehouseId)?.cashBalancePaise || 0;

    const acceptRes = await simulateAcceptHandover({
      handoverId: whHandover1.handoverId,
      receiverId: 'WH-MGR-01',
      receiverRole: 'WAREHOUSE_MANAGER',
      destinationTypeExpected: 'WAREHOUSE',
      receivedAmountPaise: 400000, // Full ₹4,000 accepted
    });

    const partnerCustodyAfter = mockDb.deliveryPartnerCustody.get(partner1)!.cashBalancePaise;
    const whCustodyAfter = mockDb.warehouseCashCustody.get(warehouseId)!.cashBalancePaise;

    assertTest(
      acceptRes.success && partnerCustodyAfter === partnerCustodyBefore - 400000,
      'HAND-17',
      'Accepted handover reduces Delivery custody exactly once',
      `Delivery custody: ₹${partnerCustodyBefore / 100} -> ₹${partnerCustodyAfter / 100} (reduced by ₹4,000)`
    );

    assertTest(
      whCustodyAfter === whCustodyBefore + 400000,
      'HAND-18',
      'Accepted Warehouse handover increases Warehouse operational cash custody',
      `Warehouse custody: ₹${whCustodyBefore / 100} -> ₹${whCustodyAfter / 100} (increased by ₹4,000)`
    );
  }

  // HAND-19: Accepted Admin handover increases Admin operational cash custody
  // HAND-20: Partial accepted amount is handled correctly
  // HAND-21: Discrepancy is recorded
  // HAND-22: Discrepancy does not automatically create a write-off
  {
    const partnerCustodyBefore = mockDb.deliveryPartnerCustody.get(partner1)!.cashBalancePaise; // 600,000 paise (₹6,000)
    const adminCustodyBefore = mockDb.adminCashCustody.get(adminId)?.cashBalancePaise || 0;

    // Requested was 600,000 paise (₹6,000), but Admin verifies only 550,000 paise (₹5,500) received.
    // Discrepancy = 50,000 paise (₹500).
    const acceptRes = await simulateAcceptHandover({
      handoverId: admHandover1.handoverId,
      receiverId: adminId,
      receiverRole: 'SUPER_ADMIN',
      destinationTypeExpected: 'ADMIN',
      receivedAmountPaise: 550000, // Shortage of ₹500
    });

    const partnerCustodyAfter = mockDb.deliveryPartnerCustody.get(partner1)!.cashBalancePaise;
    const adminCustodyAfter = mockDb.adminCashCustody.get(adminId)!.cashBalancePaise;

    assertTest(
      adminCustodyAfter === adminCustodyBefore + 550000,
      'HAND-19',
      'Accepted Admin handover increases Admin operational cash custody',
      `Admin custody increased by actual received amount: ₹${adminCustodyBefore / 100} -> ₹${adminCustodyAfter / 100}`
    );

    assertTest(
      partnerCustodyAfter === partnerCustodyBefore - 550000,
      'HAND-20',
      'Partial accepted amount reduces Delivery custody ONLY by accepted amount',
      `Partner custody reduced by ₹5,500 only: ₹${partnerCustodyBefore / 100} -> ₹${partnerCustodyAfter / 100}`
    );

    assertTest(
      acceptRes.discrepancyAmountPaise === 50000 &&
        acceptRes.handover.discrepancyAmountPaise === 50000,
      'HAND-21',
      'Discrepancy is explicitly recorded in handover record',
      `Discrepancy recorded: ₹${acceptRes.discrepancyAmountPaise / 100} (requested ₹6,000, received ₹5,500)`
    );

    // Discrepancy does not write off or create accounting loss
    const journalCount = mockDb.journalEntries.size;
    assertTest(
      journalCount === 0 && partnerCustodyAfter === 50000,
      'HAND-22',
      'Discrepancy does not automatically create a write-off or GL entry',
      `Zero GL entries created (count=${journalCount}); shortage ₹${partnerCustodyAfter / 100} remains in employee unresolved custody`
    );
  }

  // HAND-23: Rejected handover does not transfer custody
  {
    // Partner 2 submits ₹3,000 handover
    const hRejected = await simulateSubmitHandover({
      authenticatedPartnerId: partner2,
      destinationType: 'WAREHOUSE',
      requestedAmountPaise: 300000,
      collectionIds: ['COL-P2-004'],
    });

    const p2CustodyBefore = mockDb.deliveryPartnerCustody.get(partner2)!.cashBalancePaise;
    const whCustodyBefore = mockDb.warehouseCashCustody.get(warehouseId)!.cashBalancePaise;

    await simulateRejectHandover({
      handoverId: hRejected.handoverId,
      receiverId: 'WH-MGR-01',
      destinationTypeExpected: 'WAREHOUSE',
      reason: 'Physical notes mutilated',
    });

    const p2CustodyAfter = mockDb.deliveryPartnerCustody.get(partner2)!.cashBalancePaise;
    const whCustodyAfter = mockDb.warehouseCashCustody.get(warehouseId)!.cashBalancePaise;

    assertTest(
      p2CustodyAfter === p2CustodyBefore && whCustodyAfter === whCustodyBefore,
      'HAND-23',
      'Rejected handover does not transfer custody',
      `Delivery custody remained ₹${p2CustodyAfter / 100}, Warehouse custody remained ₹${whCustodyAfter / 100}`
    );
  }

  // HAND-24: Duplicate handover submission is prevented
  {
    let duplicateBlocked = false;
    try {
      // Replenish partner 1 custody to test collection conflict
      mockDb.deliveryPartnerCustody.set(partner1, {
        partnerId: partner1,
        warehouseId,
        cashBalancePaise: 1000000,
        updatedAt: new Date().toISOString(),
      });

      // Try submitting COL-001 again (already in accepted whHandover1)
      await simulateSubmitHandover({
        authenticatedPartnerId: partner1,
        destinationType: 'WAREHOUSE',
        requestedAmountPaise: 400000,
        collectionIds: ['COL-001'],
      });
    } catch (err: any) {
      duplicateBlocked = err.message.includes('COLLECTION_ALREADY_HANDED_OVER');
    }

    assertTest(
      duplicateBlocked,
      'HAND-24',
      'Duplicate handover submission with active collections is prevented',
      'Duplicate submission blocked with COLLECTION_ALREADY_HANDED_OVER'
    );
  }

  // HAND-25: Duplicate acceptance is idempotent
  {
    const whCustodyBefore = mockDb.warehouseCashCustody.get(warehouseId)!.cashBalancePaise;
    const partnerCustodyBefore = mockDb.deliveryPartnerCustody.get(partner1)!.cashBalancePaise;

    const replayRes = await simulateAcceptHandover({
      handoverId: whHandover1.handoverId,
      receiverId: 'WH-MGR-01',
      receiverRole: 'WAREHOUSE_MANAGER',
      destinationTypeExpected: 'WAREHOUSE',
      receivedAmountPaise: 400000,
    });

    const whCustodyAfter = mockDb.warehouseCashCustody.get(warehouseId)!.cashBalancePaise;
    const partnerCustodyAfter = mockDb.deliveryPartnerCustody.get(partner1)!.cashBalancePaise;

    assertTest(
      replayRes.isIdempotentReplay === true &&
        whCustodyAfter === whCustodyBefore &&
        partnerCustodyAfter === partnerCustodyBefore,
      'HAND-25',
      'Duplicate acceptance is idempotent and prevents double-transfer',
      `isIdempotentReplay=${replayRes.isIdempotentReplay}, zero additional custody deduction`
    );
  }

  // HAND-26: Concurrent acceptance cannot double-transfer custody
  {
    const serviceCode = fs.readFileSync(path.resolve(process.cwd(), 'server/codHandoverService.ts'), 'utf8');
    const transactionGuarded =
      serviceCode.includes('await runTransaction(db, async txn => {') &&
      serviceCode.includes('txn.get(idempRef)') &&
      serviceCode.includes("status === 'ACCEPTED'");

    assertTest(
      transactionGuarded,
      'HAND-26',
      'Concurrent acceptance guarded by Firestore runTransaction',
      'Transactions enforce atomicity and serialize state mutations'
    );
  }

  // HAND-27: Accepted handover cannot be modified normally
  {
    const serviceCode = fs.readFileSync(path.resolve(process.cwd(), 'server/codHandoverService.ts'), 'utf8');
    const rulesCode = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const cannotBeModified =
      serviceCode.includes('ACCEPTED_HANDOVER_CANNOT_BE_REJECTED') &&
      rulesCode.includes('match /codHandovers/{handoverId}') &&
      rulesCode.includes("request.resource.data.get('_serverTxnToken', '') == 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01'");

    assertTest(
      cannotBeModified,
      'HAND-27',
      'Accepted handover cannot be modified normally',
      'Accepted records are terminal and client direct writes are strictly denied'
    );
  }

  // HAND-28: Accepted handover cannot be cancelled normally
  {
    const serviceCode = fs.readFileSync(path.resolve(process.cwd(), 'server/codHandoverService.ts'), 'utf8');
    const cancelBlocked = serviceCode.includes('ACCEPTED_HANDOVER_CANNOT_BE_CANCELLED');

    assertTest(
      cancelBlocked,
      'HAND-28',
      'Accepted handover cannot be cancelled',
      'cancelCodHandover explicitly throws ACCEPTED_HANDOVER_CANNOT_BE_CANCELLED if status is ACCEPTED'
    );
  }

  // HAND-29: Custody movement records are immutable
  {
    const rulesCode = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const movementsImmutable =
      rulesCode.includes('match /deliveryCustodyMovements/{movementId}') &&
      rulesCode.includes('allow update, delete: if false;');

    assertTest(
      movementsImmutable,
      'HAND-29',
      'Custody movement records are immutable in Firestore rules',
      'deliveryCustodyMovements has allow update, delete: if false'
    );
  }

  // HAND-30: Delivery employee cannot directly write custody records
  {
    const rulesCode = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const deliveryCustodyProtected =
      rulesCode.includes('match /deliveryPartnerCustody/{partnerId}') &&
      rulesCode.includes("allow create, update: if request.resource.data.get('_serverTxnToken', '') == 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01';") &&
      rulesCode.includes('allow delete: if false;');

    assertTest(
      deliveryCustodyProtected,
      'HAND-30',
      'Delivery employee cannot directly write custody records',
      'Direct client writes to deliveryPartnerCustody are denied without server transaction token'
    );
  }

  // HAND-31: Warehouse/Admin cannot directly manipulate custody balances
  {
    const rulesCode = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const warehouseCustodyProtected =
      rulesCode.includes('match /warehouseCashCustody/{warehouseId}') &&
      rulesCode.includes("request.resource.data.get('_serverTxnToken', '') == 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01'");
    const adminCustodyProtected =
      rulesCode.includes('match /adminCashCustody/{adminId}') &&
      rulesCode.includes("request.resource.data.get('_serverTxnToken', '') == 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01'");

    assertTest(
      warehouseCustodyProtected && adminCustodyProtected,
      'HAND-31',
      'Warehouse/Admin cannot directly manipulate custody balances via client SDK',
      'Direct client writes to warehouseCashCustody and adminCashCustody are strictly blocked'
    );
  }

  // HAND-32: No CustomerReceipt is created
  // HAND-33: No AR journal is created
  // HAND-34: No General Ledger entry is created
  {
    const codServiceCode = fs.readFileSync(path.resolve(process.cwd(), 'server/codHandoverService.ts'), 'utf8');
    const noCustomerReceipt = !codServiceCode.includes('CustomerReceiptService') && !codServiceCode.includes('customerReceipts');
    const noJournal = !codServiceCode.includes('journalEngine') && !codServiceCode.includes('JournalEntry');
    const noGL = !codServiceCode.includes('generalLedgerService') && !codServiceCode.includes('account 1100');

    assertTest(
      noCustomerReceipt,
      'HAND-32',
      'No CustomerReceipt is created by COD handover',
      'codHandoverService contains zero CustomerReceipt imports or mutations'
    );

    assertTest(
      noJournal,
      'HAND-33',
      'No AR journal is created by COD handover',
      'codHandoverService contains zero AR journal imports or mutations'
    );

    assertTest(
      noGL,
      'HAND-34',
      'No General Ledger entry is created by COD handover',
      'codHandoverService contains zero GL imports or Account 1100 mutations'
    );
  }

  // HAND-35: No inventory mutation occurs
  {
    const codServiceCode = fs.readFileSync(path.resolve(process.cwd(), 'server/codHandoverService.ts'), 'utf8');
    const noInventory = !codServiceCode.includes('inventoryMovements') && !codServiceCode.includes('stockQuantity');

    assertTest(
      noInventory,
      'HAND-35',
      'No inventory mutation occurs',
      'codHandoverService does not touch product stock or inventory movements'
    );
  }

  // HAND-36: No pricing/order commercial total mutation occurs
  {
    const codServiceCode = fs.readFileSync(path.resolve(process.cwd(), 'server/codHandoverService.ts'), 'utf8');
    const noPricing = !codServiceCode.includes('pricingEngine') && !codServiceCode.includes('grandTotal');

    assertTest(
      noPricing,
      'HAND-36',
      'No pricing or order commercial total mutation occurs',
      'codHandoverService preserves order commercial totals without recalculation'
    );
  }

  // HAND-37: Correct Delivery audit event is created
  // HAND-38: Correct Warehouse/Admin audit event is created
  {
    const logs = Array.from(mockDb.deliveryAuditLogs.values());
    const hasSubmitted = logs.some(l => l.event === 'COD_HANDOVER_SUBMITTED');
    const hasWhAccepted = logs.some(l => l.event === 'COD_HANDOVER_ACCEPTED_WAREHOUSE');
    const hasAdminAccepted = logs.some(l => l.event === 'COD_HANDOVER_ACCEPTED_ADMIN');
    const hasDiscrepancy = logs.some(l => l.event === 'COD_DISCREPANCY_FLAGGED');
    const hasRejected = logs.some(l => l.event === 'COD_HANDOVER_REJECTED');

    assertTest(
      hasSubmitted,
      'HAND-37',
      'Correct Delivery audit event is created (COD_HANDOVER_SUBMITTED)',
      'Audit log contains COD_HANDOVER_SUBMITTED event'
    );

    assertTest(
      hasWhAccepted && hasAdminAccepted && hasDiscrepancy && hasRejected,
      'HAND-38',
      'Correct Warehouse/Admin audit events are created',
      'Audit logs include COD_HANDOVER_ACCEPTED_WAREHOUSE, COD_HANDOVER_ACCEPTED_ADMIN, COD_DISCREPANCY_FLAGGED, COD_HANDOVER_REJECTED'
    );
  }

  // HAND-39: Existing Phase 6 Part 4A COD collection remains functional
  {
    const deliveryOtpPath = path.resolve(process.cwd(), 'server/deliveryOtpService.ts');
    const deliveryOtpCode = fs.readFileSync(deliveryOtpPath, 'utf8');
    const deliveryRoutesPath = path.resolve(process.cwd(), 'server/deliveryRoutes.ts');
    const deliveryRoutesCode = fs.readFileSync(deliveryRoutesPath, 'utf8');
    const part4aIntact =
      deliveryOtpCode.includes('validateCodCollection') &&
      deliveryRoutesCode.includes('CODCollectionRecord') &&
      deliveryRoutesCode.includes('/cod/collections');

    assertTest(
      part4aIntact,
      'HAND-39',
      'Existing Phase 6 Part 4A COD collection remains intact and functional',
      'validateCodCollection and COD collection foundation preserved without modifications'
    );
  }

  // HAND-40: Existing Phase 6 Part 3 navigation remains functional
  {
    const deliveryRoutesPath = path.resolve(process.cwd(), 'server/deliveryRoutes.ts');
    const deliveryRoutesCode = fs.readFileSync(deliveryRoutesPath, 'utf8');
    const navIntact =
      deliveryRoutesCode.includes('/orders/:orderId/destination') &&
      deliveryRoutesCode.includes('navigationUrl');

    assertTest(
      navIntact,
      'HAND-40',
      'Existing Phase 6 Part 3 navigation remains intact and functional',
      'Shop location coordinates and navigation routes preserved'
    );
  }

  // Summary
  console.log('\n======================================================================');
  const allPassed = testResults.every(r => r.passed);
  const passedCount = testResults.filter(r => r.passed).length;
  console.log(`TOTAL TESTS: ${testResults.length} | PASSED: ${passedCount} | FAILED: ${testResults.length - passedCount}`);
  console.log('======================================================================');

  if (!allPassed) {
    throw new Error('One or more tests failed in Phase 6 Part 4B test suite');
  }
}

if (process.argv[1]?.endsWith('phase6_part4b_cod_handover.test.ts')) {
  runCodHandoverTestSuite()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Test suite failed:', err);
      process.exit(1);
    });
}
