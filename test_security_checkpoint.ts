import { db } from './src/config/firebase';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
} from 'firebase/firestore';
import { execSync } from 'child_process';
import cfg from './firebase-applet-config.json';

const BASE_URL = 'http://localhost:3000';
const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${cfg.firestoreDatabaseId}/documents`;

const RETAILER_A_UID = 'ret-test-auth-01';
const RETAILER_B_UID = 'ret-test-auth-02';
const STAFF_UID = 'WH-STAFF-01';
const MANAGER_UID = 'WH-MGR-01';
const ADMIN_UID = 'WH-ADMIN-01';

const RETAILER_A_AUTH = `Bearer test-uid-${RETAILER_A_UID}`;
const RETAILER_B_AUTH = `Bearer test-uid-${RETAILER_B_UID}`;
const STAFF_AUTH = `Bearer test-uid-${STAFF_UID}`;
const MANAGER_AUTH = `Bearer test-uid-${MANAGER_UID}`;
const ADMIN_AUTH = `Bearer test-uid-${ADMIN_UID}`;

interface CheckpointResult {
  code: string;
  name: string;
  status: 'PASS' | 'FAIL';
  evidence: string;
}

const results: CheckpointResult[] = [];

function record(code: string, name: string, status: 'PASS' | 'FAIL', evidence: string) {
  results.push({ code, name, status, evidence });
  const icon = status === 'PASS' ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`${icon} TEST ${code}: ${name}`);
  console.log(`    Evidence: ${evidence}\n`);
}

async function firestoreRestPatch(docPath: string, fields: any): Promise<{ status: number; data: any }> {
  try {
    const res = await fetch(`${FIRESTORE_REST_BASE}/${docPath}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    const data = await res.json();
    return { status: res.status, data };
  } catch (err: any) {
    return { status: 500, data: { error: err.message } };
  }
}

async function firestoreRestPost(collectionPath: string, fields: any): Promise<{ status: number; data: any }> {
  try {
    const res = await fetch(`${FIRESTORE_REST_BASE}/${collectionPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    const data = await res.json();
    return { status: res.status, data };
  } catch (err: any) {
    return { status: 500, data: { error: err.message } };
  }
}

async function firestoreRestDelete(docPath: string): Promise<{ status: number; data: any }> {
  try {
    const res = await fetch(`${FIRESTORE_REST_BASE}/${docPath}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    return { status: res.status, data };
  } catch (err: any) {
    return { status: 500, data: { error: err.message } };
  }
}

async function runCheckpoint() {
  console.log('======================================================================');
  console.log('MR FUTKAR — FORMAL SECURITY HARDENING CHECKPOINT REGRESSION SUITE (A-O)');
  console.log('======================================================================\n');

  // Verify server is alive
  try {
    const health = await fetch(`${BASE_URL}/api/health`).then(r => r.json());
    if (health.status !== 'ok') {
      throw new Error(`Unexpected health status: ${health.status}`);
    }
  } catch (err: any) {
    console.error('Backend server is not reachable on port 3000:', err.message);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // TEST A: Retailer → product write
  // -------------------------------------------------------------------------
  try {
    // 1. Retailer attempts to adjust inventory/product catalogue via API
    const resApi = await fetch(`${BASE_URL}/api/warehouse/inventory/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: RETAILER_A_AUTH },
      body: JSON.stringify({
        productId: 'prod-001',
        adjustmentQuantity: 50,
        reason: 'THEFT_OR_SHRINKAGE',
      }),
    });
    const dataApi = await resApi.json();

    // 2. Client attempts direct write to /products/prod-001 via Firestore REST
    const restRes = await firestoreRestPatch('products/prod-001', {
      price: { doubleValue: 1.0 },
      stockQuantity: { integerValue: '9999' },
    });

    const apiBlocked = resApi.status === 403 && dataApi.error === 'FORBIDDEN';
    const rulesBlocked = restRes.status === 403 && restRes.data?.error?.status === 'PERMISSION_DENIED';

    if (apiBlocked && rulesBlocked) {
      record(
        'A',
        'Retailer → product write',
        'PASS',
        `API rejected retailer catalogue write with HTTP 403 FORBIDDEN. Direct Firestore write rejected with HTTP 403 PERMISSION_DENIED.`
      );
    } else {
      record(
        'A',
        'Retailer → product write',
        'FAIL',
        `apiBlocked: ${apiBlocked} (status ${resApi.status}), rulesBlocked: ${rulesBlocked} (status ${restRes.status})`
      );
    }
  } catch (err: any) {
    record('A', 'Retailer → product write', 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST B: Retailer → warehouse write
  // -------------------------------------------------------------------------
  try {
    // 1. Retailer attempts to access/write warehouse management routes
    const resApi = await fetch(`${BASE_URL}/api/warehouse/inventory?warehouseId=WH-BRAHMPURI-01`, {
      headers: { Authorization: RETAILER_A_AUTH },
    });
    const dataApi = await resApi.json();

    // 2. Client attempts direct write to /warehouses/WH-KARAWAL-02 via Firestore REST
    const restRes = await firestoreRestPatch('warehouses/WH-KARAWAL-02', {
      name: { stringValue: 'Malicious Warehouse' },
      isActive: { booleanValue: true },
    });

    const apiBlocked = resApi.status === 403 && dataApi.error === 'FORBIDDEN';
    const rulesBlocked = restRes.status === 403 && restRes.data?.error?.status === 'PERMISSION_DENIED';

    if (apiBlocked && rulesBlocked) {
      record(
        'B',
        'Retailer → warehouse write',
        'PASS',
        `API blocked retailer with HTTP 403 FORBIDDEN. Direct write to /warehouses rejected by Firestore rules with HTTP 403 PERMISSION_DENIED.`
      );
    } else {
      record(
        'B',
        'Retailer → warehouse write',
        'FAIL',
        `apiBlocked: ${apiBlocked}, rulesBlocked: ${rulesBlocked}`
      );
    }
  } catch (err: any) {
    record('B', 'Retailer → warehouse write', 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST C: Retailer → inventory movement write
  // -------------------------------------------------------------------------
  try {
    // 1. Retailer calls inventory adjust endpoint
    const resRetailer = await fetch(`${BASE_URL}/api/warehouse/inventory/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: RETAILER_A_AUTH },
      body: JSON.stringify({
        productId: 'prod-001',
        adjustmentQuantity: 50,
        reason: 'FOUND_STOCK',
      }),
    });
    const dataRetailer = await resRetailer.json();

    // 2. Staff (unprivileged) calls inventory adjust endpoint
    const resStaff = await fetch(`${BASE_URL}/api/warehouse/inventory/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: STAFF_AUTH },
      body: JSON.stringify({
        productId: 'prod-001',
        adjustmentQuantity: 50,
        reason: 'FOUND_STOCK',
      }),
    });
    const dataStaff = await resStaff.json();

    // 3. Direct unauthenticated injection to /inventoryMovements via Firestore REST
    const restRes = await firestoreRestPost('inventoryMovements', {
      delta: { integerValue: '500' },
      reason: { stringValue: 'Hacked stock' },
    });

    const retailerBlocked = resRetailer.status === 403 && dataRetailer.error === 'FORBIDDEN';
    const staffBlocked = resStaff.status === 403 && dataStaff.error === 'INSUFFICIENT_PERMISSIONS';
    const rulesBlocked = restRes.status === 403 && restRes.data?.error?.status === 'PERMISSION_DENIED';

    if (retailerBlocked && staffBlocked && rulesBlocked) {
      record(
        'C',
        'Retailer → inventory movement write',
        'PASS',
        `Retailer blocked with HTTP 403 FORBIDDEN. Staff blocked with HTTP 403 INSUFFICIENT_PERMISSIONS. Direct REST write blocked by rules with HTTP 403 PERMISSION_DENIED.`
      );
    } else {
      record(
        'C',
        'Retailer → inventory movement write',
        'FAIL',
        `retailerBlocked: ${retailerBlocked}, staffBlocked: ${staffBlocked}, rulesBlocked: ${rulesBlocked}`
      );
    }
  } catch (err: any) {
    record('C', 'Retailer → inventory movement write', 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST D: Retailer → warehouseUsers write
  // -------------------------------------------------------------------------
  try {
    // 1. Direct write attempt to self-grant WAREHOUSE_ADMIN in /warehouseUsers
    const restRes = await firestoreRestPatch('warehouseUsers/ret-test-auth-01', {
      role: { stringValue: 'WAREHOUSE_ADMIN' },
      warehouseId: { stringValue: 'WH-BRAHMPURI-01' },
    });

    // 2. Retailer attempts client-side role injection during request
    const resRoleInjection = await fetch(`${BASE_URL}/api/warehouse/metrics`, {
      headers: {
        Authorization: RETAILER_A_AUTH,
        'X-Injected-Role': 'WAREHOUSE_ADMIN',
      },
    });
    const dataRoleInjection = await resRoleInjection.json();

    const rulesBlocked = restRes.status === 403 && restRes.data?.error?.status === 'PERMISSION_DENIED';
    const serverAuthBlocked = resRoleInjection.status === 403 && dataRoleInjection.error === 'FORBIDDEN';

    if (rulesBlocked && serverAuthBlocked) {
      record(
        'D',
        'Retailer → warehouseUsers write',
        'PASS',
        `Direct write to /warehouseUsers rejected with HTTP 403 PERMISSION_DENIED. Injected client role ignored by server; resolved authoritatively as RETAILER (HTTP 403 FORBIDDEN).`
      );
    } else {
      record(
        'D',
        'Retailer → warehouseUsers write',
        'FAIL',
        `rulesBlocked: ${rulesBlocked}, serverAuthBlocked: ${serverAuthBlocked}`
      );
    }
  } catch (err: any) {
    record('D', 'Retailer → warehouseUsers write', 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST E: Retailer → another retailer's order mutation
  // -------------------------------------------------------------------------
  let orderBId = '';
  try {
    // 1. Place an order for Retailer B
    const orderBPayload = {
      idempotencyKey: `idemp-chk-b-${Date.now()}`,
      retailerId: RETAILER_B_UID,
      retailerName: 'Karawal General Store',
      deliveryAddress: {
        shopName: 'Karawal General Store',
        ownerName: 'Vikas Sharma',
        mobileNumber: '9810098765',
        line1: 'Shop 2, Karawal Nagar Main Road',
        city: 'Delhi',
        pincode: '110094',
      },
      items: [{ productId: 'prod-001', quantity: 10 }],
      paymentMethod: 'COD',
    };

    const resB = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: RETAILER_B_AUTH },
      body: JSON.stringify(orderBPayload),
    });
    const dataB = await resB.json();
    orderBId = dataB.orderId;

    // 2. Retailer A attempts to cancel Retailer B's order via API
    const resCancel = await fetch(`${BASE_URL}/api/orders/${orderBId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: RETAILER_A_AUTH },
      body: JSON.stringify({ reason: 'Malicious cancellation by Retailer A' }),
    });
    const cancelData = await resCancel.json();

    // Verify order B status is still PLACED
    const orderDoc = await getDoc(doc(db, 'orders', orderBId));
    const isStillPlaced = orderDoc.exists() && orderDoc.data()?.orderStatus === 'PLACED';

    if (resCancel.status === 403 && cancelData.error === 'FORBIDDEN' && isStillPlaced) {
      record(
        'E',
        "Retailer → another retailer's order mutation",
        'PASS',
        `API returned HTTP 403 FORBIDDEN: "${cancelData.message}". Order B status verified unchanged as PLACED.`
      );
    } else {
      record(
        'E',
        "Retailer → another retailer's order mutation",
        'FAIL',
        `resCancel.status: ${resCancel.status}, error: ${cancelData.error}, isStillPlaced: ${isStillPlaced}`
      );
    }
  } catch (err: any) {
    record('E', "Retailer → another retailer's order mutation", 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST F: Warehouse Staff → WH-BRAHMPURI-01
  // -------------------------------------------------------------------------
  try {
    const resOrders = await fetch(`${BASE_URL}/api/warehouse/orders`, {
      headers: { Authorization: STAFF_AUTH },
    });
    const dataOrders = await resOrders.json();

    const resMetrics = await fetch(`${BASE_URL}/api/warehouse/metrics`, {
      headers: { Authorization: STAFF_AUTH },
    });
    const dataMetrics = await resMetrics.json();

    if (resOrders.status === 200 && dataOrders.success && resMetrics.status === 200 && dataMetrics.success) {
      record(
        'F',
        'Warehouse Staff → WH-BRAHMPURI-01',
        'PASS',
        `Warehouse staff successfully accessed WH-BRAHMPURI-01 management endpoints with HTTP 200. Orders count: ${dataOrders.count}, Hub: ${dataMetrics.warehouseName} (${dataMetrics.branchName})`
      );
    } else {
      record(
        'F',
        'Warehouse Staff → WH-BRAHMPURI-01',
        'FAIL',
        `Orders Status: ${resOrders.status}, Metrics Status: ${resMetrics.status}`
      );
    }
  } catch (err: any) {
    record('F', 'Warehouse Staff → WH-BRAHMPURI-01', 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST G: Warehouse Staff → unauthorized warehouse
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/warehouse/inventory?warehouseId=WH-KARAWAL-02`, {
      headers: { Authorization: STAFF_AUTH },
    });
    const data = await res.json();

    if (res.status === 403 && data.error === 'UNAUTHORIZED_WAREHOUSE') {
      record(
        'G',
        'Warehouse Staff → unauthorized warehouse',
        'PASS',
        `Staff query targeting non-operational warehouse 'WH-KARAWAL-02' rejected with HTTP 403 UNAUTHORIZED_WAREHOUSE: ${data.message}`
      );
    } else {
      record(
        'G',
        'Warehouse Staff → unauthorized warehouse',
        'FAIL',
        `Expected 403 UNAUTHORIZED_WAREHOUSE, got HTTP ${res.status}: ${JSON.stringify(data)}`
      );
    }
  } catch (err: any) {
    record('G', 'Warehouse Staff → unauthorized warehouse', 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST H: Client → fake warehouseId
  // -------------------------------------------------------------------------
  try {
    const fakeOrderPayload = {
      idempotencyKey: `idemp-fake-wh-${Date.now()}`,
      warehouseId: 'WH-FAKE-99',
      retailerId: RETAILER_A_UID,
      retailerName: 'Brahmpuri Kirana Mart',
      deliveryAddress: {
        shopName: 'Brahmpuri Kirana Mart',
        ownerName: 'Sunil Aggarwal',
        mobileNumber: '9810012345',
        line1: 'Shop 14, Main Brahmpuri Road',
        city: 'Delhi',
        pincode: '110053',
      },
      items: [{ productId: 'prod-001', quantity: 10 }],
      paymentMethod: 'COD',
    };

    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: RETAILER_A_AUTH },
      body: JSON.stringify(fakeOrderPayload),
    });
    const data = await res.json();

    if (res.status === 400 && data.error === 'INVALID_WAREHOUSE') {
      record(
        'H',
        'Client → fake warehouseId',
        'PASS',
        `Order placement with fake warehouseId 'WH-FAKE-99' rejected with HTTP 400 INVALID_WAREHOUSE: ${data.message}`
      );
    } else {
      record(
        'H',
        'Client → fake warehouseId',
        'FAIL',
        `Expected 400 INVALID_WAREHOUSE, got HTTP ${res.status}: ${JSON.stringify(data)}`
      );
    }
  } catch (err: any) {
    record('H', 'Client → fake warehouseId', 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST I: Invalid order status transition
  // -------------------------------------------------------------------------
  let orderTransitionTestId = '';
  try {
    // Create an order in PLACED status
    const orderPayload = {
      idempotencyKey: `idemp-trans-${Date.now()}`,
      retailerId: RETAILER_A_UID,
      retailerName: 'Brahmpuri Kirana Mart',
      deliveryAddress: {
        shopName: 'Brahmpuri Kirana Mart',
        ownerName: 'Sunil Aggarwal',
        mobileNumber: '9810012345',
        line1: 'Shop 14, Main Brahmpuri Road',
        city: 'Delhi',
        pincode: '110053',
      },
      items: [{ productId: 'prod-001', quantity: 10 }],
      paymentMethod: 'COD',
    };

    const resOrder = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: RETAILER_A_AUTH },
      body: JSON.stringify(orderPayload),
    });
    const orderData = await resOrder.json();
    orderTransitionTestId = orderData.orderId;

    // Attempt illegal transition: PLACED -> DELIVERED
    const resIllegal = await fetch(`${BASE_URL}/api/warehouse/orders/${orderTransitionTestId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: STAFF_AUTH },
      body: JSON.stringify({ newStatus: 'DELIVERED' }),
    });
    const illegalData = await resIllegal.json();

    if (resIllegal.status === 400 && illegalData.error === 'INVALID_STATUS_TRANSITION') {
      record(
        'I',
        'Invalid order status transition',
        'PASS',
        `Attempted transition from PLACED to DELIVERED rejected with HTTP 400 INVALID_STATUS_TRANSITION: ${illegalData.message}`
      );
    } else {
      record(
        'I',
        'Invalid order status transition',
        'FAIL',
        `Expected 400 INVALID_STATUS_TRANSITION, got HTTP ${resIllegal.status}: ${JSON.stringify(illegalData)}`
      );
    }
  } catch (err: any) {
    record('I', 'Invalid order status transition', 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST J: Valid warehouse status transition
  // -------------------------------------------------------------------------
  try {
    // Valid transition: PLACED -> CONFIRMED
    const resValid = await fetch(`${BASE_URL}/api/warehouse/orders/${orderTransitionTestId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: STAFF_AUTH },
      body: JSON.stringify({ newStatus: 'CONFIRMED', reason: 'Order verified by hub team' }),
    });
    const validData = await resValid.json();

    // Verify in Firestore document
    const orderDocSnap = await getDoc(doc(db, 'orders', orderTransitionTestId));
    const savedOrder = orderDocSnap.data();

    if (
      resValid.status === 200 &&
      validData.success &&
      savedOrder?.orderStatus === 'CONFIRMED' &&
      savedOrder?.statusHistory?.length > 0
    ) {
      record(
        'J',
        'Valid warehouse status transition',
        'PASS',
        `Order transitioned from PLACED to CONFIRMED with HTTP 200. Audit history appended: ${JSON.stringify(savedOrder.statusHistory[savedOrder.statusHistory.length - 1])}`
      );
    } else {
      record(
        'J',
        'Valid warehouse status transition',
        'FAIL',
        `Expected status CONFIRMED with history, got HTTP ${resValid.status}: ${JSON.stringify(validData)}`
      );
    }
  } catch (err: any) {
    record('J', 'Valid warehouse status transition', 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST K: Cancellation → stock restored once
  // -------------------------------------------------------------------------
  let cancelOrderId = '';
  let stockBeforeCancel = 0;
  let stockAfterCancel = 0;
  try {
    // Create an order for 12 units
    const orderPayload = {
      idempotencyKey: `idemp-cancel-test-${Date.now()}`,
      retailerId: RETAILER_A_UID,
      retailerName: 'Brahmpuri Kirana Mart',
      deliveryAddress: {
        shopName: 'Brahmpuri Kirana Mart',
        ownerName: 'Sunil Aggarwal',
        mobileNumber: '9810012345',
        line1: 'Shop 14, Main Brahmpuri Road',
        city: 'Delhi',
        pincode: '110053',
      },
      items: [{ productId: 'prod-001', quantity: 12 }],
      paymentMethod: 'COD',
    };

    const resOrder = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: RETAILER_A_AUTH },
      body: JSON.stringify(orderPayload),
    });
    const orderData = await resOrder.json();
    cancelOrderId = orderData.orderId;

    const prodSnapAfterOrder = await getDoc(doc(db, 'products', 'prod-001'));
    stockBeforeCancel = Number(prodSnapAfterOrder.data()?.stockQuantity) || 0;

    // Cancel the order via server authoritative endpoint
    const resCancel = await fetch(`${BASE_URL}/api/orders/${cancelOrderId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: RETAILER_A_AUTH },
      body: JSON.stringify({ reason: 'Test cancellation' }),
    });
    const cancelData = await resCancel.json();

    const prodSnapAfterCancel = await getDoc(doc(db, 'products', 'prod-001'));
    stockAfterCancel = Number(prodSnapAfterCancel.data()?.stockQuantity) || 0;

    if (
      resCancel.status === 200 &&
      cancelData.success &&
      cancelData.stockRestored === true &&
      stockAfterCancel === stockBeforeCancel + 12
    ) {
      record(
        'K',
        'Cancellation → stock restored once',
        'PASS',
        `Stock correctly restored from ${stockBeforeCancel} to ${stockAfterCancel} (exact +12 increment) under atomic transaction.`
      );
    } else {
      record(
        'K',
        'Cancellation → stock restored once',
        'FAIL',
        `Before cancel: ${stockBeforeCancel}, After cancel: ${stockAfterCancel}, cancelData: ${JSON.stringify(cancelData)}`
      );
    }
  } catch (err: any) {
    record('K', 'Cancellation → stock restored once', 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST L: Duplicate cancellation → no second restoration
  // -------------------------------------------------------------------------
  try {
    // Attempt second cancellation on the same order
    const resDuplicateCancel = await fetch(`${BASE_URL}/api/orders/${cancelOrderId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: RETAILER_A_AUTH },
      body: JSON.stringify({ reason: 'Duplicate test cancellation' }),
    });
    const duplicateData = await resDuplicateCancel.json();

    const prodSnapAfterSecond = await getDoc(doc(db, 'products', 'prod-001'));
    const stockAfterSecond = Number(prodSnapAfterSecond.data()?.stockQuantity) || 0;

    if (
      resDuplicateCancel.status === 200 &&
      duplicateData.alreadyCancelled === true &&
      duplicateData.stockRestored === false &&
      stockAfterSecond === stockAfterCancel
    ) {
      record(
        'L',
        'Duplicate cancellation → no second restoration',
        'PASS',
        `Duplicate cancellation rejected duplicate restock. alreadyCancelled: true, stockRestored: false, stock remained unchanged at ${stockAfterSecond}.`
      );
    } else {
      record(
        'L',
        'Duplicate cancellation → no second restoration',
        'FAIL',
        `Stock changed from ${stockAfterCancel} to ${stockAfterSecond}! Response: ${JSON.stringify(duplicateData)}`
      );
    }
  } catch (err: any) {
    record('L', 'Duplicate cancellation → no second restoration', 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST M: Inventory audit created
  // -------------------------------------------------------------------------
  let auditMovementId = '';
  try {
    const qMov = query(
      collection(db, 'inventoryMovements'),
      where('referenceId', '==', cancelOrderId)
    );
    const snapMov = await getDocs(qMov);

    if (!snapMov.empty) {
      const movDoc = snapMov.docs[0];
      auditMovementId = movDoc.id;
      const movData = movDoc.data();

      const requiredFields = [
        'movementId',
        'warehouseId',
        'productId',
        'previousStock',
        'delta',
        'newStock',
        'reason',
        'performedBy',
        'performedByRole',
        'createdAt',
        'referenceType',
        'referenceId',
      ];

      const missing = requiredFields.filter(f => movData[f] === undefined);

      if (missing.length === 0 && movData.warehouseId === 'WH-BRAHMPURI-01') {
        record(
          'M',
          'Inventory audit created',
          'PASS',
          `Audit movement created with all mandatory fields: movementId=${movData.movementId}, warehouseId=${movData.warehouseId}, delta=${movData.delta}, newStock=${movData.newStock}, reason=${movData.reason}, referenceId=${movData.referenceId}`
        );
      } else {
        record(
          'M',
          'Inventory audit created',
          'FAIL',
          `Missing required fields in audit movement: ${missing.join(', ')}`
        );
      }
    } else {
      record('M', 'Inventory audit created', 'FAIL', `No inventoryMovements found for referenceId ${cancelOrderId}`);
    }
  } catch (err: any) {
    record('M', 'Inventory audit created', 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST N: Inventory audit modification/deletion rejected
  // -------------------------------------------------------------------------
  try {
    if (!auditMovementId) {
      record('N', 'Inventory audit modification/deletion rejected', 'FAIL', 'No auditMovementId available to test.');
    } else {
      // 1. Attempt REST PATCH on inventory movement
      const patchRes = await firestoreRestPatch(`inventoryMovements/${auditMovementId}`, {
        delta: { integerValue: '9999' },
        reason: { stringValue: 'Tampered reason' },
      });

      // 2. Attempt REST DELETE on inventory movement
      const deleteRes = await firestoreRestDelete(`inventoryMovements/${auditMovementId}`);

      const patchBlocked = patchRes.status === 403 && patchRes.data?.error?.status === 'PERMISSION_DENIED';
      const deleteBlocked = deleteRes.status === 403 && deleteRes.data?.error?.status === 'PERMISSION_DENIED';

      if (patchBlocked && deleteBlocked) {
        record(
          'N',
          'Inventory audit modification/deletion rejected',
          'PASS',
          `Audit movement modification (HTTP ${patchRes.status} PERMISSION_DENIED) and deletion (HTTP ${deleteRes.status} PERMISSION_DENIED) both strictly rejected by Firestore rules.`
        );
      } else {
        record(
          'N',
          'Inventory audit modification/deletion rejected',
          'FAIL',
          `patchBlocked: ${patchBlocked} (HTTP ${patchRes.status}), deleteBlocked: ${deleteBlocked} (HTTP ${deleteRes.status})`
        );
      }
    }
  } catch (err: any) {
    record('N', 'Inventory audit modification/deletion rejected', 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST O: Existing 28/28 retailer integration tests
  // -------------------------------------------------------------------------
  try {
    console.log('Executing existing 28/28 Retailer Integration & Blockers Test Suites...');
    
    // 1. Run Production Blockers (13 tests)
    const blockersOutput = execSync('npx tsx test_production_blockers.ts', { encoding: 'utf8' });
    const blockersPassed = blockersOutput.includes('AUDIT RESULTS: 13 PASSED, 0 FAILED');

    // 2. Run E2E Retailer Integration (15 tests)
    const e2eOutput = execSync('npx tsx test_e2e_integration.ts', { encoding: 'utf8' });
    const e2ePassed = e2eOutput.includes('INTEGRATION TEST AUDIT FINISHED: 15 PASSED, 0 WARNINGS, 0 BLOCKERS');

    if (blockersPassed && e2ePassed) {
      record(
        'O',
        'Existing 28/28 retailer integration tests',
        'PASS',
        `All 13 production blockers passed (13/13). All 15 E2E retailer integration tests passed (15/15). Total 28/28 PASS with 0 warnings and 0 production blockers.`
      );
    } else {
      record(
        'O',
        'Existing 28/28 retailer integration tests',
        'FAIL',
        `blockersPassed: ${blockersPassed}, e2ePassed: ${e2ePassed}`
      );
    }
  } catch (err: any) {
    record('O', 'Existing 28/28 retailer integration tests', 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  const total = results.length;
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log('======================================================================');
  console.log(`SECURITY CHECKPOINT A-O RESULTS: ${passed}/${total} PASSED, ${failed} FAILED`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runCheckpoint().catch(err => {
  console.error('Fatal checkpoint error:', err);
  process.exit(1);
});
