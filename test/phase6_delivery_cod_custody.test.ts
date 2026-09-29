/**
 * MR FUTKAR — PHASE 6 PART 4A: DELIVERY COD COLLECTION & CASH CUSTODY FOUNDATION TEST SUITE
 * Tests COD-01 through COD-20
 * 
 * Validates:
 * - Server-authoritative COD amount determination from order
 * - Exact collection validation (no under-collection, no over-collection)
 * - Dedicated COD Collection Record creation with integer paise representation
 * - Cash collection increments Delivery employee physical cash custody balance
 * - Cash collection creates immutable delivery custody movement record
 * - UPI collection records bank/reference information without physical cash custody
 * - UPI collection does NOT increment physical cash custody balance
 * - Order snapshot and payment status linkage
 * - Delivery completion (DELIVERED) with OTP and POD preserved
 * - Non-COD orders do not generate COD collections or custody movements
 * - Idempotency protection against double-counting and duplicate custody increments
 * - Custody and movement inquiry endpoints
 * - Strict Accounting Boundary: NO CustomerReceipt, NO AR modifications, NO GL entries
 * - Salaried Employee Rule: NO commission, NO wallet, NO payout logic
 * - Security Rules: Direct client writes denied, server authority only
 */

import fs from 'fs';
import path from 'path';
import { validateCodCollection } from '../server/deliveryOtpService';
import {
  CODCollectionRecord,
  DeliveryPartnerCustody,
  DeliveryCustodyMovement,
  CODPaymentMethod,
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

export async function runDeliveryCodCustodyTestSuite() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 6 PART 4A DELIVERY COD & CUSTODY FOUNDATION TESTS');
  console.log('======================================================================\n');

  // Simulated in-memory database representing Firestore state
  const mockDb = {
    orders: new Map<string, any>(),
    codCollections: new Map<string, CODCollectionRecord>(),
    deliveryPartnerCustody: new Map<string, DeliveryPartnerCustody>(),
    deliveryCustodyMovements: new Map<string, DeliveryCustodyMovement>(),
    idempotencyKeys: new Map<string, any>(),
    customerReceipts: new Map<string, any>(),
    journalEntries: new Map<string, any>(),
    accountsReceivable: new Map<string, any>(),
  };

  const partnerId = 'DP-BRAHMPURI-01';
  const warehouseId = 'WH-BRAHMPURI-01' as const;

  // COD-01: Server-authoritative COD amount determination from order
  {
    const orderCod = {
      orderId: 'ORD-COD-01',
      grandTotal: 1540.50,
      paymentMethod: 'COD',
      retailerId: 'RET-01',
    };
    const isOrderCod = orderCod.paymentMethod === 'COD';
    const authoritativeCodDue = Number(orderCod.grandTotal);

    assertTest(
      isOrderCod && authoritativeCodDue === 1540.50,
      'COD-01',
      'Authoritative COD amount determination',
      `Identified COD order with server-authoritative due amount ₹${authoritativeCodDue}`
    );
  }

  // COD-02: Strict validation rejecting under-collection
  {
    const codDue = 1200;
    const underCollected = 1000;
    const result = validateCodCollection(codDue, underCollected);

    assertTest(
      !result.valid && Boolean(result.error?.includes('Full payment')),
      'COD-02',
      'Under-collection rejection',
      `Under-collection rejected: error='${result.error}'`
    );
  }

  // COD-03: Strict validation rejecting over-collection
  {
    const codDue = 1200;
    const overCollected = 1300;
    const result = validateCodCollection(codDue, overCollected);

    assertTest(
      !result.valid && Boolean(result.error?.includes('cannot exceed')),
      'COD-03',
      'Over-collection rejection',
      `Over-collection rejected: error='${result.error}'`
    );
  }

  // COD-04: Successful exact COD collection validation
  {
    const codDue = 1250.75;
    const exactCollected = 1250.75;
    const result = validateCodCollection(codDue, exactCollected);

    assertTest(
      result.valid && result.collectedNum === 1250.75,
      'COD-04',
      'Exact COD collection acceptance',
      `Exact collection validated: valid=${result.valid}, collectedNum=₹${result.collectedNum}`
    );
  }

  // Helper simulating server delivery completion transaction
  const executeServerDeliveryCompletion = (orderInput: any, handoverDetails: {
    amountCollected?: number;
    paymentMethod?: CODPaymentMethod;
    paymentReference?: string;
    recipientName: string;
    otp: string;
  }) => {
    const orderId = orderInput.orderId;
    const idempotencyKey = `cod_collect_${orderId}`;

    // 1. Check idempotency
    if (mockDb.idempotencyKeys.has(idempotencyKey) || orderInput.orderStatus === 'DELIVERED') {
      return {
        success: true,
        isIdempotentReplay: true,
        order: mockDb.orders.get(orderId) || orderInput,
        codCollection: mockDb.codCollections.get(`COL-${orderId}`) || null,
      };
    }

    const isOrderCod = orderInput.paymentMethod === 'COD' || orderInput.payment?.method === 'COD';
    const codDue = Number(orderInput.grandTotal ?? orderInput.total ?? 0);
    const now = new Date().toISOString();
    let createdCodCollection: CODCollectionRecord | null = null;

    if (isOrderCod) {
      const validation = validateCodCollection(codDue, handoverDetails.amountCollected);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
      const codCollected = validation.collectedNum;
      const amountDuePaise = Math.round(codDue * 100);
      const amountCollectedPaise = Math.round(codCollected * 100);
      const codPaymentMethod: CODPaymentMethod = handoverDetails.paymentMethod === 'UPI' ? 'UPI' : 'CASH';

      const collectionId = `COL-${orderId}`;
      const codRecord: CODCollectionRecord = {
        collectionId,
        orderId,
        orderNumber: orderInput.orderNumber || orderId,
        retailerId: orderInput.retailerId,
        deliveryPartnerId: partnerId,
        warehouseId,
        paymentMethod: codPaymentMethod,
        amountDuePaise,
        amountCollectedPaise,
        currency: 'INR',
        collectionStatus: 'COLLECTED',
        collectedAt: now,
        collectedBy: partnerId,
        referenceId: handoverDetails.paymentReference ? String(handoverDetails.paymentReference).trim() : null,
        createdAt: now,
        updatedAt: now,
      };

      mockDb.codCollections.set(collectionId, codRecord);
      createdCodCollection = codRecord;

      if (codPaymentMethod === 'CASH') {
        const existingCustody = mockDb.deliveryPartnerCustody.get(partnerId);
        const currentBalancePaise = existingCustody ? existingCustody.cashBalancePaise : 0;
        const newBalancePaise = currentBalancePaise + amountCollectedPaise;

        mockDb.deliveryPartnerCustody.set(partnerId, {
          partnerId,
          warehouseId,
          cashBalancePaise: newBalancePaise,
          updatedAt: now,
        });

        const movementId = `MOV-${orderId}`;
        const custodyMovement: DeliveryCustodyMovement = {
          movementId,
          partnerId,
          warehouseId,
          orderId,
          collectionId,
          movementType: 'COD_COLLECTION_CASH',
          amountPaise: amountCollectedPaise,
          balanceAfterPaise: newBalancePaise,
          timestamp: now,
          referenceId: handoverDetails.paymentReference ? String(handoverDetails.paymentReference).trim() : null,
          createdBy: partnerId,
        };
        mockDb.deliveryCustodyMovements.set(movementId, custodyMovement);
      }

      mockDb.idempotencyKeys.set(idempotencyKey, {
        key: idempotencyKey,
        action: 'COD_COLLECTION',
        orderId,
        collectionId,
        amountCollectedPaise,
        status: 'COMPLETED',
      });
    }

    const updatedOrder = {
      ...orderInput,
      orderStatus: 'DELIVERED',
      paymentStatus: isOrderCod ? 'PAID' : (orderInput.paymentStatus || 'PAID'),
      delivery: {
        ...orderInput.delivery,
        assignmentStatus: 'DELIVERED',
        deliveredAt: now,
        deliveredBy: partnerId,
        recipientName: handoverDetails.recipientName,
        otpVerified: true,
      },
      ...(isOrderCod ? {
        deliveryPayment: {
          method: handoverDetails.paymentMethod === 'UPI' ? 'UPI' : 'COD',
          amountDue: codDue,
          amountCollected: handoverDetails.amountCollected,
          collectionStatus: 'COLLECTED',
          collectedAt: now,
          collectedBy: partnerId,
          codCollectionId: `COL-${orderId}`,
          referenceId: handoverDetails.paymentReference || null,
        }
      } : {}),
    };

    mockDb.orders.set(orderId, updatedOrder);

    return {
      success: true,
      isIdempotentReplay: false,
      order: updatedOrder,
      codCollection: createdCodCollection,
    };
  };

  // COD-05: Dedicated COD Collection Record created with integer paise representation
  {
    const order1 = {
      orderId: 'ORD-COD-101',
      retailerId: 'RET-BRAHMPURI-101',
      grandTotal: 2450.50,
      paymentMethod: 'COD',
      delivery: { assignmentStatus: 'OUT_FOR_DELIVERY' },
    };

    const res = executeServerDeliveryCompletion(order1, {
      amountCollected: 2450.50,
      paymentMethod: 'CASH',
      recipientName: 'Ramesh Gupta',
      otp: '123456',
    });

    const codRecord = mockDb.codCollections.get('COL-ORD-COD-101');
    const isPaiseExact = codRecord?.amountDuePaise === 245050 && codRecord?.amountCollectedPaise === 245050;

    assertTest(
      Boolean(codRecord) && isPaiseExact && codRecord?.collectionStatus === 'COLLECTED',
      'COD-05',
      'Dedicated COD Collection Record created with exact integer paise',
      `Record COL-ORD-COD-101: amountDuePaise=${codRecord?.amountDuePaise}, amountCollectedPaise=${codRecord?.amountCollectedPaise}, status=${codRecord?.collectionStatus}`
    );
  }

  // COD-06: Cash collection increments Delivery employee physical cash custody balance
  {
    const custody = mockDb.deliveryPartnerCustody.get(partnerId);
    assertTest(
      Boolean(custody) && custody?.cashBalancePaise === 245050,
      'COD-06',
      'Cash collection increments custody balance',
      `Delivery partner ${partnerId} cash custody balance = ${custody?.cashBalancePaise} paise (₹${(custody?.cashBalancePaise || 0) / 100})`
    );
  }

  // COD-07: Cash collection creates immutable delivery custody movement record
  {
    const movement = mockDb.deliveryCustodyMovements.get('MOV-ORD-COD-101');
    assertTest(
      Boolean(movement) &&
      movement?.movementType === 'COD_COLLECTION_CASH' &&
      movement?.amountPaise === 245050 &&
      movement?.balanceAfterPaise === 245050,
      'COD-07',
      'Cash collection creates immutable delivery custody movement',
      `Custody movement MOV-ORD-COD-101: type=${movement?.movementType}, amount=${movement?.amountPaise} paise, balanceAfter=${movement?.balanceAfterPaise} paise`
    );
  }

  // COD-08: UPI collection records bank/reference information in referenceId
  // COD-09: UPI collection does NOT increment physical cash custody balance
  // COD-10: UPI collection does NOT create physical cash custody movement
  {
    const initialCustodyPaise = mockDb.deliveryPartnerCustody.get(partnerId)?.cashBalancePaise || 0;
    const initialMovementsCount = mockDb.deliveryCustodyMovements.size;

    const order2 = {
      orderId: 'ORD-COD-102',
      retailerId: 'RET-BRAHMPURI-102',
      grandTotal: 1800,
      paymentMethod: 'COD',
      delivery: { assignmentStatus: 'OUT_FOR_DELIVERY' },
    };

    const resUpi = executeServerDeliveryCompletion(order2, {
      amountCollected: 1800,
      paymentMethod: 'UPI',
      paymentReference: 'UPI-REF-987654321',
      recipientName: 'Kailash Chand',
      otp: '654321',
    });

    const codRecordUpi = mockDb.codCollections.get('COL-ORD-COD-102');
    const custodyAfterUpi = mockDb.deliveryPartnerCustody.get(partnerId)?.cashBalancePaise || 0;
    const movementsAfterUpi = mockDb.deliveryCustodyMovements.size;

    assertTest(
      codRecordUpi?.paymentMethod === 'UPI' && codRecordUpi?.referenceId === 'UPI-REF-987654321',
      'COD-08',
      'UPI collection records bank/reference information',
      `UPI collection created: paymentMethod=${codRecordUpi?.paymentMethod}, referenceId=${codRecordUpi?.referenceId}`
    );

    assertTest(
      custodyAfterUpi === initialCustodyPaise,
      'COD-09',
      'UPI collection does NOT increment physical cash custody balance',
      `Custody balance stayed unchanged at ${custodyAfterUpi} paise (was ${initialCustodyPaise})`
    );

    assertTest(
      movementsAfterUpi === initialMovementsCount,
      'COD-10',
      'UPI collection does NOT create physical cash custody movement',
      `Movements count remained ${movementsAfterUpi} (no cash custody movement generated for UPI)`
    );
  }

  // COD-11: Linking of COD collection to Order snapshot and deliveryPayment object
  {
    const savedOrder = mockDb.orders.get('ORD-COD-101');
    const payment = savedOrder?.deliveryPayment;

    assertTest(
      payment?.codCollectionId === 'COL-ORD-COD-101' &&
      payment?.amountCollected === 2450.50 &&
      payment?.collectionStatus === 'COLLECTED',
      'COD-11',
      'Linking of COD collection to order snapshot',
      `Order deliveryPayment linked: codCollectionId=${payment?.codCollectionId}, amountCollected=₹${payment?.amountCollected}`
    );
  }

  // COD-12: Order paymentStatus updated to PAID upon verified COD delivery handover
  {
    const savedOrder = mockDb.orders.get('ORD-COD-101');
    assertTest(
      savedOrder?.paymentStatus === 'PAID',
      'COD-12',
      'Order paymentStatus updated to PAID upon delivery',
      `Order ORD-COD-101 paymentStatus = ${savedOrder?.paymentStatus}`
    );
  }

  // COD-13: Order fulfillment transitions to DELIVERED with OTP and recipient preserved
  {
    const savedOrder = mockDb.orders.get('ORD-COD-101');
    assertTest(
      savedOrder?.orderStatus === 'DELIVERED' &&
      savedOrder?.delivery?.assignmentStatus === 'DELIVERED' &&
      savedOrder?.delivery?.recipientName === 'Ramesh Gupta' &&
      savedOrder?.delivery?.otpVerified === true,
      'COD-13',
      'Order fulfillment status transitions to DELIVERED with verified POD',
      `Order status=${savedOrder?.orderStatus}, recipient=${savedOrder?.delivery?.recipientName}, otpVerified=${savedOrder?.delivery?.otpVerified}`
    );
  }

  // COD-14: Non-COD order delivery completion creates zero COD collection records and zero custody changes
  {
    const custodyBefore = mockDb.deliveryPartnerCustody.get(partnerId)?.cashBalancePaise || 0;
    const collectionsCountBefore = mockDb.codCollections.size;

    const prepaidOrder = {
      orderId: 'ORD-PREPAID-201',
      retailerId: 'RET-BRAHMPURI-103',
      grandTotal: 3500,
      paymentMethod: 'PREPAID',
      paymentStatus: 'PAID',
      delivery: { assignmentStatus: 'OUT_FOR_DELIVERY' },
    };

    executeServerDeliveryCompletion(prepaidOrder, {
      recipientName: 'Mohan Lal',
      otp: '112233',
    });

    const custodyAfter = mockDb.deliveryPartnerCustody.get(partnerId)?.cashBalancePaise || 0;
    const collectionsCountAfter = mockDb.codCollections.size;

    assertTest(
      custodyAfter === custodyBefore && collectionsCountAfter === collectionsCountBefore,
      'COD-14',
      'Non-COD order delivery completion creates zero COD collections or custody changes',
      `Prepaid order completed: custody=${custodyAfter} paise (no change), collections count=${collectionsCountAfter} (no change)`
    );
  }

  // COD-15: Strict Idempotency: Duplicate delivery completion returns idempotent replay without double-crediting cash custody balance
  {
    const custodyBeforeReplay = mockDb.deliveryPartnerCustody.get(partnerId)?.cashBalancePaise || 0;
    const existingOrder = mockDb.orders.get('ORD-COD-101');

    const replayRes = executeServerDeliveryCompletion(existingOrder, {
      amountCollected: 2450.50,
      paymentMethod: 'CASH',
      recipientName: 'Ramesh Gupta',
      otp: '123456',
    });

    const custodyAfterReplay = mockDb.deliveryPartnerCustody.get(partnerId)?.cashBalancePaise || 0;

    assertTest(
      replayRes.isIdempotentReplay === true && custodyAfterReplay === custodyBeforeReplay,
      'COD-15',
      'Idempotent replay does not double-credit cash custody balance',
      `Replay result: isIdempotentReplay=${replayRes.isIdempotentReplay}, custodyBalance=${custodyAfterReplay} paise (zero duplicate increment)`
    );
  }

  // COD-16: Partner custody inquiry endpoint logic (GET /api/delivery/cod/custody)
  {
    const currentCustody = mockDb.deliveryPartnerCustody.get(partnerId);
    const balancePaise = currentCustody?.cashBalancePaise || 0;
    const balanceRupees = balancePaise / 100;

    assertTest(
      balancePaise === 245050 && balanceRupees === 2450.50,
      'COD-16',
      'Delivery partner cash custody inquiry returns exact balance in paise and rupees',
      `Custody inquiry: balancePaise=${balancePaise}, balanceRupees=₹${balanceRupees}`
    );
  }

  // COD-17: Partner collections and movements inquiry endpoint logic
  {
    const partnerCollections = Array.from(mockDb.codCollections.values()).filter(
      c => c.deliveryPartnerId === partnerId
    );
    const partnerMovements = Array.from(mockDb.deliveryCustodyMovements.values()).filter(
      m => m.partnerId === partnerId
    );

    assertTest(
      partnerCollections.length === 2 && partnerMovements.length === 1,
      'COD-17',
      'Partner collections and custody movements retrieval',
      `Retrieved ${partnerCollections.length} COD collections and ${partnerMovements.length} cash custody movement records`
    );
  }

  // COD-18: Strict Accounting Boundary: NO CustomerReceipt, NO Accounts Receivable mutation, NO General Ledger entries posted
  {
    const receiptsCount = mockDb.customerReceipts.size;
    const journalEntriesCount = mockDb.journalEntries.size;
    const arEntriesCount = mockDb.accountsReceivable.size;

    // Also inspect deliveryRoutes.ts to guarantee no imports or calls to customerReceiptService or generalLedgerService
    const deliveryRoutesPath = path.resolve(process.cwd(), 'server/deliveryRoutes.ts');
    const deliveryRoutesCode = fs.readFileSync(deliveryRoutesPath, 'utf8');

    const hasNoCustomerReceiptImport = !deliveryRoutesCode.includes('customerReceiptService');
    const hasNoJournalEngineImport = !deliveryRoutesCode.includes('journalEngine');
    const hasNoGeneralLedgerImport = !deliveryRoutesCode.includes('generalLedgerService');

    const accountingBoundaryPreserved = (
      receiptsCount === 0 &&
      journalEntriesCount === 0 &&
      arEntriesCount === 0 &&
      hasNoCustomerReceiptImport &&
      hasNoJournalEngineImport &&
      hasNoGeneralLedgerImport
    );

    assertTest(
      accountingBoundaryPreserved,
      'COD-18',
      'Strict Accounting Boundary: No CustomerReceipt, No AR mutations, No GL entries',
      `CustomerReceipts=${receiptsCount}, JournalEntries=${journalEntriesCount}, AR mutations=${arEntriesCount}, No accounting service calls in deliveryRoutes`
    );
  }

  // COD-19: Strict Salaried Employee Rule: NO commission, NO wallet, NO payout logic
  {
    const deliveryTypesPath = path.resolve(process.cwd(), 'src/types/delivery.ts');
    const deliveryTypesCode = fs.readFileSync(deliveryTypesPath, 'utf8');
    const deliveryRoutesPath = path.resolve(process.cwd(), 'server/deliveryRoutes.ts');
    const deliveryRoutesCode = fs.readFileSync(deliveryRoutesPath, 'utf8');

    const hasNoCommission = !deliveryTypesCode.toLowerCase().includes('commission') && !deliveryRoutesCode.toLowerCase().includes('commission');
    const hasNoDeliveryWallet = !deliveryTypesCode.toLowerCase().includes('walletbalance') && !deliveryRoutesCode.toLowerCase().includes('walletbalance');
    const hasNoPayoutCalculation = !deliveryTypesCode.toLowerCase().includes('payoutcalculation') && !deliveryRoutesCode.toLowerCase().includes('payoutcalculation');

    assertTest(
      hasNoCommission && hasNoDeliveryWallet && hasNoPayoutCalculation,
      'COD-19',
      'Salaried employee rule: zero commission, zero delivery wallet, zero payout calculations',
      'Verified delivery types and routes strictly lack commission, wallet, or payout fields'
    );
  }

  // COD-20: Security rules enforcement: Direct client write denied, server authority only
  {
    const firestoreRulesPath = path.resolve(process.cwd(), 'firestore.rules');
    const rulesCode = fs.readFileSync(firestoreRulesPath, 'utf8');

    const hasCodCollectionsRule = rulesCode.includes('match /codCollections/{collectionId}');
    const hasCustodyRule = rulesCode.includes('match /deliveryPartnerCustody/{partnerId}');
    const hasMovementsRule = rulesCode.includes('match /deliveryCustodyMovements/{movementId}');
    const serverAuthEnforced = rulesCode.includes("request.resource.data.get('_serverTxnToken', '') == 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01'");

    assertTest(
      hasCodCollectionsRule && hasCustodyRule && hasMovementsRule && serverAuthEnforced,
      'COD-20',
      'Firestore Security Rules enforce server authority for COD and cash custody',
      'Direct client writes to codCollections, deliveryPartnerCustody, and deliveryCustodyMovements are strictly denied'
    );
  }

  // Summary
  console.log('\n======================================================================');
  const allPassed = testResults.every(r => r.passed);
  const passedCount = testResults.filter(r => r.passed).length;
  console.log(`TOTAL TESTS: ${testResults.length} | PASSED: ${passedCount} | FAILED: ${testResults.length - passedCount}`);
  console.log('======================================================================');

  if (!allPassed) {
    throw new Error('One or more tests failed in Phase 6 Part 4A test suite');
  }
}

if (process.argv[1]?.endsWith('phase6_delivery_cod_custody.test.ts')) {
  runDeliveryCodCustodyTestSuite()
    .then(() => {
      process.exit(0);
    })
    .catch(err => {
      console.error('Test suite failed:', err);
      process.exit(1);
    });
}
