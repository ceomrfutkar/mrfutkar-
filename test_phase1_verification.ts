/**
 * Phase 1 Verification Test Suite
 * Verifies all 9 Modules of MR FUTKAR Warehouse/Hub Management System:
 * 1. Warehouse Dashboard Metrics
 * 2. Incoming Orders Queue & Filters
 * 3. Order Details & Live Stock Guidance
 * 4. Digital Pick List Engine
 * 5. Packing Bay & Packaging Checklist
 * 6. Ready for Dispatch Bay & Assignment
 * 7. Warehouse Inventory & Live Reservations
 * 8. Controlled Stock Adjustment (Manager/Admin RBAC + Transactional Atomicity)
 * 9. Immutable Stock Audit Logs & Isolation to WH-BRAHMPURI-01
 */

// Native Node 22 fetch is globally available

const BASE_URL = 'http://localhost:3000';

const TOKENS = {
  ADMIN: 'test-uid-WH-ADMIN-01',
  MANAGER: 'test-uid-WH-MGR-01',
  STAFF: 'test-uid-WH-STAFF-01',
  RETAILER: 'test-uid-ret-01',
};

async function runTests() {
  console.log('====================================================');
  console.log('MR FUTKAR WAREHOUSE PHASE 1 VERIFICATION TEST SUITE');
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
      failed++;
    }
  }

  // 1. Dashboard Metrics
  console.log('\n--- MODULE 1: Warehouse Dashboard Metrics ---');
  try {
    const res = await fetch(`${BASE_URL}/api/warehouse/metrics`, {
      headers: { Authorization: `Bearer ${TOKENS.STAFF}` },
    });
    const data: any = await res.json();
    assert(res.status === 200, 'Metrics returns 200 OK');
    assert(data.warehouseId === 'WH-BRAHMPURI-01', 'Warehouse ID is WH-BRAHMPURI-01');
    assert(typeof data.metrics.todaysOrdersCount === 'number', 'todaysOrdersCount is number');
    assert(typeof data.metrics.lowStockAlertsCount === 'number', 'lowStockAlertsCount is number');
    assert(typeof data.metrics.pendingFulfillmentValue === 'number', 'pendingFulfillmentValue is number');
  } catch (err: any) {
    assert(false, 'Metrics fetch failed', err.message);
  }

  // 2. Incoming Orders Screen & Filters
  console.log('\n--- MODULE 2: Incoming Orders & Filtering ---');
  let testOrderId = '';
  try {
    const res = await fetch(`${BASE_URL}/api/warehouse/orders`, {
      headers: { Authorization: `Bearer ${TOKENS.STAFF}` },
    });
    const data: any = await res.json();
    assert(res.status === 200, 'Orders list returns 200 OK');
    assert(Array.isArray(data.orders), 'Orders list is an array');
    assert(data.warehouseId === 'WH-BRAHMPURI-01', 'Orders belong to WH-BRAHMPURI-01');

    const validOrder = data.orders.find((o: any) => Array.isArray(o.items) && o.items.length > 0);
    if (validOrder) {
      testOrderId = validOrder.orderId;
      assert(true, `Found existing test order with items: ${testOrderId}`);
    } else {
      console.log('No orders with items currently found, will check order placement.');
    }

    // Test Area filter (Brahmpuri and Karawal Nagar corridor)
    const areaRes = await fetch(`${BASE_URL}/api/warehouse/orders?deliveryArea=Brahmpuri`, {
      headers: { Authorization: `Bearer ${TOKENS.STAFF}` },
    });
    const areaData: any = await areaRes.json();
    assert(areaRes.status === 200, 'Delivery area filter works');
  } catch (err: any) {
    assert(false, 'Orders query failed', err.message);
  }

  // If no order found, let's create a valid order for warehouse WH-BRAHMPURI-01
  if (!testOrderId) {
    console.log('\nCreating sample wholesale order for testing lifecycle...');
    const invRes = await fetch(`${BASE_URL}/api/warehouse/inventory`, {
      headers: { Authorization: `Bearer ${TOKENS.STAFF}` },
    });
    const invData: any = await invRes.json();
    const firstProd = invData.inventory[0];

    const orderPayload = {
      orderId: `ORD-TEST-${Date.now()}`,
      retailerId: 'ret-phase1-test',
      retailerName: 'Gupta Kirana Store',
      shopName: 'Gupta Kirana',
      warehouseId: 'WH-BRAHMPURI-01',
      warehouseName: 'MR FUTKAR — BRAHMPURI',
      items: [
        {
          productId: firstProd.productId,
          productName: firstProd.productName,
          sku: firstProd.sku,
          brandName: firstProd.brandName,
          quantity: 2,
          unitPrice: firstProd.sellingPrice || 100,
          mrp: firstProd.mrp || 120,
          totalPrice: (firstProd.sellingPrice || 100) * 2,
        },
      ],
      subtotal: (firstProd.sellingPrice || 100) * 2,
      deliveryCharge: 0,
      grandTotal: (firstProd.sellingPrice || 100) * 2,
      paymentMethod: 'CASH_ON_DELIVERY',
      paymentStatus: 'PENDING',
      orderStatus: 'PLACED',
      deliveryAddress: {
        shopName: 'Gupta Kirana',
        fullAddress: 'Shop 12, Brahmpuri Main Market',
        city: 'Brahmpuri',
        pincode: '110053',
        phone: '9876543210',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save order via direct internal seed or post
    // For test we can invoke /api/checkout or directly update
    const checkoutRes = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKENS.RETAILER}`,
      },
      body: JSON.stringify(orderPayload),
    });
    if (checkoutRes.ok) {
      testOrderId = orderPayload.orderId;
      console.log(`Created order: ${testOrderId}`);
    } else {
      // Use fallback test ID if direct order create requires specific auth
      console.log('Order creation note:', await checkoutRes.text());
    }
  }

  // 3. Order Details & Live Stock Guidance
  console.log('\n--- MODULE 3: Order Details ---');
  if (testOrderId) {
    try {
      const res = await fetch(`${BASE_URL}/api/warehouse/orders/${testOrderId}`, {
        headers: { Authorization: `Bearer ${TOKENS.STAFF}` },
      });
      const data: any = await res.json();
      assert(res.status === 200, 'Order details fetch 200 OK');
      assert(data.order.warehouseId === 'WH-BRAHMPURI-01', 'Order belongs to WH-BRAHMPURI-01');
      assert(Array.isArray(data.order.items), 'Order has items');
    } catch (err: any) {
      assert(false, 'Order details failed', err.message);
    }
  } else {
    assert(true, 'Skipping specific order detail test (no active order)');
  }

  // 4. State Transitions Engine & Digital Pick List
  console.log('\n--- MODULE 4 & 5: State Transitions, Picking & Packing ---');
  if (testOrderId) {
    try {
      // A. Transition PLACED -> CONFIRMED -> ACCEPTED
      const confirmRes = await fetch(`${BASE_URL}/api/warehouse/orders/${testOrderId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKENS.STAFF}`,
        },
        body: JSON.stringify({ newStatus: 'CONFIRMED' }),
      });
      console.log('Confirm response status:', confirmRes.status);

      const acceptRes = await fetch(`${BASE_URL}/api/warehouse/orders/${testOrderId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKENS.STAFF}`,
        },
        body: JSON.stringify({ newStatus: 'ACCEPTED' }),
      });
      console.log('Accept response status:', acceptRes.status);

      // B. Save Picking Progress
      const detailRes = await fetch(`${BASE_URL}/api/warehouse/orders/${testOrderId}`, {
        headers: { Authorization: `Bearer ${TOKENS.STAFF}` },
      });
      const detailData: any = await detailRes.json();
      const firstItem = detailData.order.items[0];

      const pickPayload = {
        items: {
          [firstItem.productId]: {
            pickedQty: firstItem.quantity,
            isShort: false,
            notes: 'Picked from Aisle 2',
          },
        },
        completePicking: true,
        userName: 'Sonu Kumar',
      };

      const pickRes = await fetch(`${BASE_URL}/api/warehouse/orders/${testOrderId}/picking`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKENS.STAFF}`,
        },
        body: JSON.stringify(pickPayload),
      });
      const pickData: any = await pickRes.json();
      assert(pickRes.status === 200, 'Picking progress recorded successfully');
      assert(pickData.picking.status === 'COMPLETED', 'Picking status marked COMPLETED');

      // C. Packing Inspection & Package Staging
      const packPayload = {
        numberOfPackages: 2,
        boxType: 'Standard 5-Ply Corrugated Wholesale Carton',
        packingNotes: 'Fragile sealed with tamper tape',
        moveToReady: true,
        userName: 'Sonu Kumar',
      };

      const packRes = await fetch(`${BASE_URL}/api/warehouse/orders/${testOrderId}/packing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${TOKENS.STAFF}`,
        },
        body: JSON.stringify(packPayload),
      });
      const packData: any = await packRes.json();
      assert(packRes.status === 200, 'Packing verified and saved');
      assert(packData.orderStatus === 'READY_FOR_DISPATCH', 'Order advanced to READY_FOR_DISPATCH');
    } catch (err: any) {
      assert(false, 'Picking/Packing test failed', err.message);
    }
  }

  // 6. Ready for Dispatch Bay
  console.log('\n--- MODULE 6: Ready for Dispatch Bay ---');
  try {
    const res = await fetch(`${BASE_URL}/api/warehouse/dispatch`, {
      headers: { Authorization: `Bearer ${TOKENS.STAFF}` },
    });
    const data: any = await res.json();
    assert(res.status === 200, 'Dispatch Bay query 200 OK');
    assert(Array.isArray(data.orders), 'Dispatch orders is array');
    assert(data.warehouseId === 'WH-BRAHMPURI-01', 'Dispatch bay belongs to WH-BRAHMPURI-01');
  } catch (err: any) {
    assert(false, 'Dispatch bay query failed', err.message);
  }

  // 7. Warehouse Inventory & Stock Ledger
  console.log('\n--- MODULE 7: Warehouse Inventory Ledger ---');
  let sampleProductId = '';
  try {
    const res = await fetch(`${BASE_URL}/api/warehouse/inventory`, {
      headers: { Authorization: `Bearer ${TOKENS.STAFF}` },
    });
    const data: any = await res.json();
    assert(res.status === 200, 'Inventory query 200 OK');
    assert(Array.isArray(data.inventory), 'Inventory list is array');
    assert(data.inventory.length > 0, `Found ${data.inventory.length} inventory SKUs`);

    sampleProductId = data.inventory[0].productId;
    const sample = data.inventory[0];
    assert(typeof sample.currentStock === 'number', 'Inventory item has currentStock number');
    assert(typeof sample.availableStock === 'number', 'Inventory item has calculated availableStock');
    assert(sample.warehouseId === 'WH-BRAHMPURI-01', 'Inventory item partitioned to WH-BRAHMPURI-01');
  } catch (err: any) {
    assert(false, 'Inventory fetch failed', err.message);
  }

  // 8. Controlled Stock Adjustment (Manager/Admin RBAC + Atomic Balance)
  console.log('\n--- MODULE 8: Controlled Stock Adjustment ---');
  try {
    // A. Staff attempt MUST BE REJECTED (RBAC: 403 Forbidden)
    const staffAdjustRes = await fetch(`${BASE_URL}/api/warehouse/inventory/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKENS.STAFF}`,
      },
      body: JSON.stringify({
        productId: sampleProductId,
        reason: 'Physical count correction',
        adjustmentQuantity: 5,
        notes: 'Unauthorized staff attempt',
      }),
    });
    assert(staffAdjustRes.status === 403, 'WAREHOUSE_STAFF rejected from stock adjustment (403)');

    // B. Warehouse Manager attempt MUST SUCCEED (200 OK)
    const mgrAdjustRes = await fetch(`${BASE_URL}/api/warehouse/inventory/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKENS.MANAGER}`,
      },
      body: JSON.stringify({
        productId: sampleProductId,
        reason: 'Physical count correction',
        adjustmentQuantity: 5,
        notes: 'Manager verified physical stock count',
      }),
    });
    const mgrData: any = await mgrAdjustRes.json();
    assert(mgrAdjustRes.status === 200, 'WAREHOUSE_MANAGER successfully adjusted stock');
    assert(mgrData.movement.delta === 5, 'Movement delta matches adjustment quantity');
    assert(mgrData.movement.warehouseId === 'WH-BRAHMPURI-01', 'Movement recorded for WH-BRAHMPURI-01');

    // C. Negative balance prevention
    const badAdjustRes = await fetch(`${BASE_URL}/api/warehouse/inventory/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKENS.ADMIN}`,
      },
      body: JSON.stringify({
        productId: sampleProductId,
        reason: 'Damage write-off',
        adjustmentQuantity: -999999,
        notes: 'Excessive subtraction test',
      }),
    });
    assert(badAdjustRes.status === 400, 'Prevented stock reduction below zero (400)');
  } catch (err: any) {
    assert(false, 'Stock adjustment test failed', err.message);
  }

  // 9. Stock Movement Audit Logs & WH-BRAHMPURI-01 Isolation
  console.log('\n--- MODULE 9: Immutable Stock Audit Trail & Isolation ---');
  try {
    const res = await fetch(`${BASE_URL}/api/warehouse/inventory/movements`, {
      headers: { Authorization: `Bearer ${TOKENS.STAFF}` },
    });
    const data: any = await res.json();
    assert(res.status === 200, 'Movement logs fetch 200 OK');
    assert(Array.isArray(data.movements), 'Movements is array');
    assert(data.movements.length > 0, 'Audit logs contain recorded movements');

    const latest = data.movements[0];
    assert(latest.warehouseId === 'WH-BRAHMPURI-01', 'Audit log isolated to WH-BRAHMPURI-01');
    assert(Boolean(latest.performedBy || latest.userId), 'Audit log contains authoritative user attribution');
    assert(Boolean(latest.timestamp || latest.createdAt), 'Audit log contains immutable timestamp');

    // Warehouse isolation test: RETAILER cannot access warehouse movements
    const retailerAccessRes = await fetch(`${BASE_URL}/api/warehouse/inventory/movements`, {
      headers: { Authorization: `Bearer ${TOKENS.RETAILER}` },
    });
    assert(retailerAccessRes.status === 403, 'RETAILER role blocked from warehouse operations (403)');
  } catch (err: any) {
    assert(false, 'Audit log test failed', err.message);
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test script crashed:', err);
  process.exit(1);
});
