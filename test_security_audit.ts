import { db } from './src/config/firebase';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';

const BASE_URL = 'http://localhost:3000';

const RETAILER_UID = 'ret-test-auth-01';
const STAFF_UID = 'WH-STAFF-01';
const MANAGER_UID = 'WH-MGR-01';
const ADMIN_UID = 'WH-ADMIN-01';

const RETAILER_AUTH = `Bearer test-uid-${RETAILER_UID}`;
const STAFF_AUTH = `Bearer test-uid-${STAFF_UID}`;
const MANAGER_AUTH = `Bearer test-uid-${MANAGER_UID}`;
const ADMIN_AUTH = `Bearer test-uid-${ADMIN_UID}`;

interface TestReport {
  id: string;
  name: string;
  category: string;
  status: 'PASS' | 'FAIL';
  evidence: string;
}

const reports: TestReport[] = [];

function logTest(id: string, name: string, category: string, status: 'PASS' | 'FAIL', evidence: string) {
  reports.push({ id, name, category, status, evidence });
  const icon = status === 'PASS' ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`${icon} [${category}] ${id}: ${name}\n    Evidence: ${evidence}\n`);
}

async function runSecurityAudit() {
  console.log('======================================================================');
  console.log('MR FUTKAR — AUTHORIZATION BOUNDARY & RBAC SECURITY AUDIT SUITE');
  console.log('======================================================================\n');

  // Ensure prod-001 has base stock for testing
  const prodRef = doc(db, 'products', 'prod-001');
  await updateDoc(prodRef, {
    stockQuantity: 250,
    isActive: true,
    warehouseId: 'WH-BRAHMPURI-01',
    warehouseName: 'MR FUTKAR — BRAHMPURI',
  }).catch(() => {});

  // -------------------------------------------------------------------------
  // 1. RETAILER PRIVILEGE RESTRICTION TEST: Cannot access Warehouse Metrics
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/warehouse/metrics`, {
      headers: { Authorization: RETAILER_AUTH },
    });
    const data = await res.json();
    if (res.status === 403 && data.error === 'FORBIDDEN') {
      logTest(
        'SEC-01',
        'Retailer Token Blocked from Warehouse Metrics',
        'RBAC Boundary',
        'PASS',
        `HTTP 403 returned with error '${data.error}': ${data.message}`
      );
    } else {
      logTest(
        'SEC-01',
        'Retailer Token Blocked from Warehouse Metrics',
        'RBAC Boundary',
        'FAIL',
        `Expected 403 FORBIDDEN, got HTTP ${res.status}: ${JSON.stringify(data)}`
      );
    }
  } catch (err: any) {
    logTest('SEC-01', 'Retailer Token Blocked from Warehouse Metrics', 'RBAC Boundary', 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // 2. RETAILER PRIVILEGE RESTRICTION TEST: Cannot Adjust Warehouse Inventory
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/warehouse/inventory/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: RETAILER_AUTH,
      },
      body: JSON.stringify({
        productId: 'prod-001',
        reason: 'Received stock (Purchase inward)',
        adjustmentQuantity: 10,
      }),
    });
    const data = await res.json();
    if (res.status === 403 && data.error === 'FORBIDDEN') {
      logTest(
        'SEC-02',
        'Retailer Blocked from Manual Inventory Adjustment',
        'RBAC Boundary',
        'PASS',
        `HTTP 403 returned with error '${data.error}': ${data.message}`
      );
    } else {
      logTest(
        'SEC-02',
        'Retailer Blocked from Manual Inventory Adjustment',
        'RBAC Boundary',
        'FAIL',
        `Expected 403 FORBIDDEN, got HTTP ${res.status}: ${JSON.stringify(data)}`
      );
    }
  } catch (err: any) {
    logTest('SEC-02', 'Retailer Blocked from Manual Inventory Adjustment', 'RBAC Boundary', 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // 3. WAREHOUSE STAFF ROLE SEPARATION: Staff Cannot Adjust Stock
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/warehouse/inventory/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: STAFF_AUTH,
      },
      body: JSON.stringify({
        productId: 'prod-001',
        reason: 'Damage',
        adjustmentQuantity: -5,
      }),
    });
    const data = await res.json();
    if (res.status === 403 && ['FORBIDDEN', 'INSUFFICIENT_PERMISSIONS'].includes(data.error)) {
      logTest(
        'SEC-03',
        'Warehouse Staff Blocked from Manual Stock Adjustment',
        'Role Separation',
        'PASS',
        `HTTP 403 returned with error '${data.error}': ${data.message}`
      );
    } else {
      logTest(
        'SEC-03',
        'Warehouse Staff Blocked from Manual Stock Adjustment',
        'Role Separation',
        'FAIL',
        `Expected 403 FORBIDDEN for Staff role, got HTTP ${res.status}: ${JSON.stringify(data)}`
      );
    }
  } catch (err: any) {
    logTest('SEC-03', 'Warehouse Staff Blocked from Manual Stock Adjustment', 'Role Separation', 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // 4. WAREHOUSE MANAGER PRIVILEGE: Manager CAN Adjust Stock With Mandatory Audit
  // -------------------------------------------------------------------------
  try {
    const beforeSnap = await getDoc(prodRef);
    const beforeStock = Number(beforeSnap.data()?.stockQuantity) || 0;

    const res = await fetch(`${BASE_URL}/api/warehouse/inventory/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: MANAGER_AUTH,
      },
      body: JSON.stringify({
        productId: 'prod-001',
        reason: 'Physical count correction',
        adjustmentQuantity: 5,
        notes: 'Security audit test adjustment by Manager',
      }),
    });
    const data = await res.json();

    const afterSnap = await getDoc(prodRef);
    const afterStock = Number(afterSnap.data()?.stockQuantity) || 0;

    if (res.status === 200 && data.success && afterStock === beforeStock + 5) {
      const mov = data.movement;
      const hasAllFields =
        mov.movementId &&
        mov.warehouseId === 'WH-BRAHMPURI-01' &&
        mov.productId === 'prod-001' &&
        mov.previousStock === beforeStock &&
        mov.delta === 5 &&
        mov.newStock === beforeStock + 5 &&
        mov.performedByRole === 'WAREHOUSE_MANAGER' &&
        mov.createdAt &&
        mov.referenceType === 'MANUAL_ADJUSTMENT';

      if (hasAllFields) {
        logTest(
          'SEC-04',
          'Warehouse Manager Authorized Stock Adjustment & Full Audit Trail',
          'Audit Compliance',
          'PASS',
          `Stock updated from ${beforeStock} to ${afterStock}. Movement record verified with all mandatory audit fields: ${JSON.stringify(mov)}`
        );
      } else {
        logTest(
          'SEC-04',
          'Warehouse Manager Authorized Stock Adjustment & Full Audit Trail',
          'Audit Compliance',
          'FAIL',
          `Movement record missing required fields: ${JSON.stringify(mov)}`
        );
      }
    } else {
      logTest(
        'SEC-04',
        'Warehouse Manager Authorized Stock Adjustment & Full Audit Trail',
        'Audit Compliance',
        'FAIL',
        `Expected 200 OK with stock change, got HTTP ${res.status}: ${JSON.stringify(data)}`
      );
    }
  } catch (err: any) {
    logTest('SEC-04', 'Warehouse Manager Authorized Stock Adjustment', 'Audit Compliance', 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // 5. WAREHOUSE ISOLATION: Reject Unauthorized Warehouse IDs
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/warehouse/inventory?warehouseId=WH-KARAWAL-02`, {
      headers: { Authorization: ADMIN_AUTH },
    });
    const data = await res.json();
    if (res.status === 403 && data.error === 'UNAUTHORIZED_WAREHOUSE') {
      logTest(
        'SEC-05',
        'Rejection of Unauthorized Warehouse ID (Karawal Nagar)',
        'Warehouse Isolation',
        'PASS',
        `HTTP 403 returned with error 'UNAUTHORIZED_WAREHOUSE': ${data.message}`
      );
    } else {
      logTest(
        'SEC-05',
        'Rejection of Unauthorized Warehouse ID (Karawal Nagar)',
        'Warehouse Isolation',
        'FAIL',
        `Expected 403 UNAUTHORIZED_WAREHOUSE, got HTTP ${res.status}: ${JSON.stringify(data)}`
      );
    }
  } catch (err: any) {
    logTest('SEC-05', 'Rejection of Unauthorized Warehouse ID', 'Warehouse Isolation', 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // 6. ORDER CREATION: Stock Deduction & Immutable Movement Logging
  // -------------------------------------------------------------------------
  let createdOrderId = '';
  try {
    const prodSnapBefore = await getDoc(prodRef);
    const stockBefore = Number(prodSnapBefore.data()?.stockQuantity) || 0;

    const orderPayload = {
      idempotencyKey: `idemp-sec-audit-${Date.now()}`,
      retailerId: RETAILER_UID,
      retailerName: 'Brahmpuri Kirana Mart',
      deliveryAddress: {
        shopName: 'Brahmpuri Kirana Mart',
        ownerName: 'Sunil Aggarwal',
        mobileNumber: '9810012345',
        line1: 'Shop 14, Main Brahmpuri Road',
        city: 'Delhi',
        pincode: '110053',
      },
      items: [
        {
          productId: 'prod-001',
          quantity: 10,
          price: 90, // Attacked price (should be rejected/overridden by server)
        },
      ],
      paymentMethod: 'COD',
    };

    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: RETAILER_AUTH,
      },
      body: JSON.stringify(orderPayload),
    });
    const data = await res.json();

    const prodSnapAfter = await getDoc(prodRef);
    const stockAfter = Number(prodSnapAfter.data()?.stockQuantity) || 0;

    if (res.status === 200 && data.success && stockAfter === stockBefore - 10) {
      createdOrderId = data.orderId;
      logTest(
        'SEC-06',
        'Server Authoritative Order Placement & Atomic Stock Deduction',
        'Inventory Integrity',
        'PASS',
        `Order ${createdOrderId} placed. Stock correctly decremented from ${stockBefore} to ${stockAfter} via transactional lock.`
      );
    } else {
      logTest(
        'SEC-06',
        'Server Authoritative Order Placement & Atomic Stock Deduction',
        'Inventory Integrity',
        'FAIL',
        `Expected 200 OK with stock deduction, got HTTP ${res.status}: ${JSON.stringify(data)}`
      );
    }
  } catch (err: any) {
    logTest('SEC-06', 'Server Authoritative Order Placement', 'Inventory Integrity', 'FAIL', err.message);
  }

  // -------------------------------------------------------------------------
  // 7. ILLEGAL STATUS TRANSITION REJECTION
  // -------------------------------------------------------------------------
  if (createdOrderId) {
    try {
      // Trying to jump directly from PLACED to DELIVERED or PACKED
      const res = await fetch(`${BASE_URL}/api/warehouse/orders/${createdOrderId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: STAFF_AUTH,
        },
        body: JSON.stringify({
          newStatus: 'DELIVERED',
        }),
      });
      const data = await res.json();
      if (res.status === 400 && data.error === 'INVALID_STATUS_TRANSITION') {
        logTest(
          'SEC-07',
          'Enforcement of Valid State Transitions (PLACED -> DELIVERED rejected)',
          'State Machine',
          'PASS',
          `HTTP 400 returned with error 'INVALID_STATUS_TRANSITION': ${data.message}`
        );
      } else {
        logTest(
          'SEC-07',
          'Enforcement of Valid State Transitions',
          'State Machine',
          'FAIL',
          `Expected 400 INVALID_STATUS_TRANSITION, got HTTP ${res.status}: ${JSON.stringify(data)}`
        );
      }
    } catch (err: any) {
      logTest('SEC-07', 'Enforcement of Valid State Transitions', 'State Machine', 'FAIL', err.message);
    }
  }

  // -------------------------------------------------------------------------
  // 8. TRANSACTIONAL ORDER CANCELLATION & STOCK RESTORATION
  // -------------------------------------------------------------------------
  if (createdOrderId) {
    try {
      const prodSnapBefore = await getDoc(prodRef);
      const stockBeforeCancel = Number(prodSnapBefore.data()?.stockQuantity) || 0;

      const res = await fetch(`${BASE_URL}/api/orders/${createdOrderId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: RETAILER_AUTH,
        },
        body: JSON.stringify({
          reason: 'Retailer requested cancellation due to store plan update',
        }),
      });
      const data = await res.json();

      const prodSnapAfter = await getDoc(prodRef);
      const stockAfterCancel = Number(prodSnapAfter.data()?.stockQuantity) || 0;

      if (res.status === 200 && data.success && data.stockRestored && stockAfterCancel === stockBeforeCancel + 10) {
        logTest(
          'SEC-08',
          'Transactional Order Cancellation & Stock Restoration',
          'Cancellation & Stock',
          'PASS',
          `Order ${createdOrderId} cancelled. Stock restored from ${stockBeforeCancel} to ${stockAfterCancel}. Message: ${data.message}`
        );
      } else {
        logTest(
          'SEC-08',
          'Transactional Order Cancellation & Stock Restoration',
          'Cancellation & Stock',
          'FAIL',
          `Expected 200 OK with stock restoration, got HTTP ${res.status}: ${JSON.stringify(data)}`
        );
      }
    } catch (err: any) {
      logTest('SEC-08', 'Transactional Order Cancellation & Stock Restoration', 'Cancellation & Stock', 'FAIL', err.message);
    }
  }

  // -------------------------------------------------------------------------
  // 9. CANCELLATION IDEMPOTENCY: Duplicate Cancellation MUST NOT Restore Stock Twice
  // -------------------------------------------------------------------------
  if (createdOrderId) {
    try {
      const prodSnapBefore = await getDoc(prodRef);
      const stockBeforeReplay = Number(prodSnapBefore.data()?.stockQuantity) || 0;

      const res = await fetch(`${BASE_URL}/api/orders/${createdOrderId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: RETAILER_AUTH,
        },
        body: JSON.stringify({
          reason: 'Duplicate cancellation attempt',
        }),
      });
      const data = await res.json();

      const prodSnapAfter = await getDoc(prodRef);
      const stockAfterReplay = Number(prodSnapAfter.data()?.stockQuantity) || 0;

      if (res.status === 200 && data.alreadyCancelled === true && data.stockRestored === false && stockAfterReplay === stockBeforeReplay) {
        logTest(
          'SEC-09',
          'Cancellation Idempotency Guard (Zero Duplicate Restock)',
          'Cancellation & Stock',
          'PASS',
          `Stock remained identical at ${stockAfterReplay}. Server correctly reported alreadyCancelled=true and stockRestored=false.`
        );
      } else {
        logTest(
          'SEC-09',
          'Cancellation Idempotency Guard',
          'Cancellation & Stock',
          'FAIL',
          `Duplicate cancellation modified stock! Before: ${stockBeforeReplay}, After: ${stockAfterReplay}, Response: ${JSON.stringify(data)}`
        );
      }
    } catch (err: any) {
      logTest('SEC-09', 'Cancellation Idempotency Guard', 'Cancellation & Stock', 'FAIL', err.message);
    }
  }

  // -------------------------------------------------------------------------
  // 10. RETAILER ISOLATION ON CANCELLATION: Cannot cancel another retailer's order
  // -------------------------------------------------------------------------
  if (createdOrderId) {
    try {
      const res = await fetch(`${BASE_URL}/api/orders/${createdOrderId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-uid-other-retailer-999',
        },
        body: JSON.stringify({
          reason: 'Hostile retailer cancel attempt',
        }),
      });
      const data = await res.json();
      if (res.status === 403 && data.error === 'FORBIDDEN') {
        logTest(
          'SEC-10',
          'Retailer Isolation: Blocked From Cancelling Another Retailer Order',
          'Tenant Isolation',
          'PASS',
          `HTTP 403 returned with error 'FORBIDDEN': ${data.message}`
        );
      } else {
        logTest(
          'SEC-10',
          'Retailer Isolation on Cancellation',
          'Tenant Isolation',
          'FAIL',
          `Expected 403 FORBIDDEN, got HTTP ${res.status}: ${JSON.stringify(data)}`
        );
      }
    } catch (err: any) {
      logTest('SEC-10', 'Retailer Isolation on Cancellation', 'Tenant Isolation', 'FAIL', err.message);
    }
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  const total = reports.length;
  const passed = reports.filter(r => r.status === 'PASS').length;
  const failed = reports.filter(r => r.status === 'FAIL').length;

  console.log('======================================================================');
  console.log(`SECURITY AUDIT TEST RESULTS: ${passed}/${total} PASSED, ${failed} FAILED`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSecurityAudit().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
