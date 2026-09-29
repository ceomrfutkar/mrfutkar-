import { db } from './src/config/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const BASE_URL = 'http://localhost:3000';
const TEST_UID = 'test-retailer-audit-01';
const AUTH_HEADER = `Bearer test-uid-${TEST_UID}`;

async function runAudit() {
  console.log('====================================================');
  console.log('MR FUTKAR — PRODUCTION BLOCKERS AUDIT TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // Health check first
  try {
    const health = await fetch(`${BASE_URL}/api/health`).then(r => r.json());
    assert(health.status === 'ok', 'Health Check', `Status: ${health.status}`);
  } catch (err: any) {
    console.error('Server not reachable:', err.message);
    process.exit(1);
  }

  // Check product in Firestore
  const testProdId = 'prod-001'; // Parle-G 800g
  const prodRef = doc(db, 'products', testProdId);
  const prodSnap = await getDoc(prodRef);
  if (!prodSnap.exists()) {
    console.error(`Test product ${testProdId} not found in Firestore. Make sure seed has run.`);
    process.exit(1);
  }
  const originalProd = prodSnap.data();
  console.log(`Target Product: ${originalProd.productName}, Price: ₹${originalProd.sellingPrice}, Stock: ${originalProd.stockQuantity}, MOQ: ${originalProd.minimumOrderQuantity}\n`);

  // Ensure stock is sufficient for tests
  await updateDoc(prodRef, {
    stockQuantity: 200,
    isActive: true,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  // --------------------------------------------------------------------------
  // TEST 1: Price tampering attempt
  // Client attempts to submit unitPrice: 1, discount: 0, subtotal: 10, grandTotal: 10
  // Expected: Server overwrites with Firestore authoritative price (₹68 * 24 = ₹1632)
  // --------------------------------------------------------------------------
  console.log('Running TEST 1: Price tampering attempt...');
  const key1 = `test-idemp-1-${Date.now()}`;
  const res1 = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH_HEADER },
    body: JSON.stringify({
      idempotencyKey: key1,
      paymentMethod: 'COD',
      items: [{ productId: testProdId, quantity: 24, unitPrice: 1, subtotal: 24, grandTotal: 24 }],
      grandTotal: 24,
      subtotal: 24,
    }),
  });
  const data1 = await res1.json();
  const authoritativeOverridden = data1.subtotal > 24 && data1.subtotal >= 1600;
  assert(
    res1.status === 200 && data1.success === true && authoritativeOverridden && data1.grandTotal >= data1.subtotal,
    'TEST 1: Price tampering attempt',
    `Expected server to overwrite tampered ₹24 with authoritative subtotal (>= ₹1600), received ₹${data1.subtotal}, status: ${res1.status}`
  );

  // --------------------------------------------------------------------------
  // TEST 2: Stock reduction test
  // Product stock in Firestore decrements correctly
  // --------------------------------------------------------------------------
  console.log('\nRunning TEST 2: Stock reduction test...');
  const prodAfter1 = (await getDoc(prodRef)).data();
  assert(
    prodAfter1?.stockQuantity === 200 - 24,
    'TEST 2: Stock reduction test',
    `Expected stock ${200 - 24}, got ${prodAfter1?.stockQuantity}`
  );

  // --------------------------------------------------------------------------
  // TEST 3: Insufficient stock
  // Quantity exceeds available stock. Expected: Order rejected (409 or 400). No stock change.
  // --------------------------------------------------------------------------
  console.log('\nRunning TEST 3: Insufficient stock...');
  const stockBefore3 = (await getDoc(prodRef)).data()?.stockQuantity;
  const key3 = `test-idemp-3-${Date.now()}`;
  const res3 = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH_HEADER },
    body: JSON.stringify({
      idempotencyKey: key3,
      paymentMethod: 'COD',
      items: [{ productId: testProdId, quantity: stockBefore3 + 50 }],
    }),
  });
  const data3 = await res3.json();
  const stockAfter3 = (await getDoc(prodRef)).data()?.stockQuantity;
  assert(
    (res3.status === 400 || res3.status === 409) && data3.success === false && data3.error === 'INSUFFICIENT_STOCK' && stockAfter3 === stockBefore3,
    'TEST 3: Insufficient stock',
    `Expected 400/409 INSUFFICIENT_STOCK, got ${res3.status} ${data3.error}. Stock before: ${stockBefore3}, after: ${stockAfter3}`
  );

  // --------------------------------------------------------------------------
  // TEST 4: MOQ violation
  // Product MOQ is enforced (e.g., ordering 1 when MOQ is 24)
  // Expected: Order rejected with MOQ_NOT_MET
  // --------------------------------------------------------------------------
  console.log('\nRunning TEST 4: MOQ violation...');
  const key4 = `test-idemp-4-${Date.now()}`;
  const res4 = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH_HEADER },
    body: JSON.stringify({
      idempotencyKey: key4,
      paymentMethod: 'COD',
      items: [{ productId: testProdId, quantity: 1 }], // MOQ is 24
    }),
  });
  const data4 = await res4.json();
  assert(
    res4.status === 400 && data4.success === false && data4.error === 'MOQ_NOT_MET',
    'TEST 4: MOQ violation',
    `Expected 400 MOQ_NOT_MET, got ${res4.status} ${data4.error}`
  );

  // --------------------------------------------------------------------------
  // TEST 5: Same idempotency key submitted twice
  // Expected: Same order returned. No duplicate order. No duplicate stock deduction.
  // --------------------------------------------------------------------------
  console.log('\nRunning TEST 5: Order Idempotency...');
  const key5 = `test-idemp-5-dedup-${Date.now()}`;
  const stockBefore5 = (await getDoc(prodRef)).data()?.stockQuantity;
  
  // First submission
  const res5a = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH_HEADER },
    body: JSON.stringify({
      idempotencyKey: key5,
      paymentMethod: 'COD',
      items: [{ productId: testProdId, quantity: 24 }],
    }),
  });
  const data5a = await res5a.json();

  // Second submission with identical key
  const res5b = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH_HEADER },
    body: JSON.stringify({
      idempotencyKey: key5,
      paymentMethod: 'COD',
      items: [{ productId: testProdId, quantity: 24 }],
    }),
  });
  const data5b = await res5b.json();
  const stockAfter5 = (await getDoc(prodRef)).data()?.stockQuantity;

  assert(
    res5a.status === 200 &&
    res5b.status === 200 &&
    data5a.orderId === data5b.orderId &&
    stockAfter5 === stockBefore5 - 24, // Stock was deducted ONLY ONCE!
    'TEST 5: Idempotency deduplication',
    `Order A: ${data5a.orderId}, Order B: ${data5b.orderId}, Stock before: ${stockBefore5}, after: ${stockAfter5}`
  );

  // --------------------------------------------------------------------------
  // TEST 6: Atomic transaction behavior
  // Multi-item order where 2nd item fails stock check
  // Expected: Entire transaction aborts. 1st item stock is NOT decremented.
  // --------------------------------------------------------------------------
  console.log('\nRunning TEST 6: Atomic transaction rollback...');
  const stockBefore6 = (await getDoc(prodRef)).data()?.stockQuantity;
  const key6 = `test-idemp-6-${Date.now()}`;
  const res6 = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH_HEADER },
    body: JSON.stringify({
      idempotencyKey: key6,
      paymentMethod: 'COD',
      items: [
        { productId: testProdId, quantity: 24 }, // valid
        { productId: 'prod-002', quantity: 999999 }, // exceeds stock!
      ],
    }),
  });
  const data6 = await res6.json();
  const stockAfter6 = (await getDoc(prodRef)).data()?.stockQuantity;
  assert(
    (res6.status === 400 || res6.status === 409) && data6.success === false && stockAfter6 === stockBefore6,
    'TEST 6: Atomic rollback on failure',
    `Expected status 400/409, got ${res6.status}. Stock before: ${stockBefore6}, after: ${stockAfter6}`
  );

  // --------------------------------------------------------------------------
  // TEST 7: Unauthenticated order creation
  // Expected: Rejected (401 UNAUTHORIZED)
  // --------------------------------------------------------------------------
  console.log('\nRunning TEST 7: Unauthenticated order creation...');
  const key7 = `test-idemp-7-${Date.now()}`;
  const res7 = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer invalid-token-xyz' },
    body: JSON.stringify({
      idempotencyKey: key7,
      paymentMethod: 'COD',
      items: [{ productId: testProdId, quantity: 24 }],
    }),
  });
  const data7 = await res7.json();
  assert(
    res7.status === 401 && data7.success === false && data7.error === 'UNAUTHORIZED',
    'TEST 7: Unauthenticated order rejected',
    `Expected 401 UNAUTHORIZED, got ${res7.status} ${data7.error}`
  );

  // --------------------------------------------------------------------------
  // TEST 8: Retailer attempts to set paymentStatus = PAID
  // Expected: Rejected with INVALID_PAYMENT_STATUS
  // --------------------------------------------------------------------------
  console.log('\nRunning TEST 8: Retailer injects paymentStatus = PAID...');
  const key8 = `test-idemp-8-${Date.now()}`;
  const res8 = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH_HEADER },
    body: JSON.stringify({
      idempotencyKey: key8,
      paymentMethod: 'COD',
      paymentStatus: 'PAID', // Malicious tamper
      items: [{ productId: testProdId, quantity: 24 }],
    }),
  });
  const data8 = await res8.json();
  assert(
    res8.status === 400 && data8.success === false && data8.error === 'INVALID_PAYMENT_STATUS',
    'TEST 8: paymentStatus tampering rejected',
    `Expected 400 INVALID_PAYMENT_STATUS, got ${res8.status} ${data8.error}`
  );

  // --------------------------------------------------------------------------
  // TEST 9: Retailer attempts to set orderStatus = DELIVERED
  // Expected: Rejected with INVALID_ORDER_STATUS
  // --------------------------------------------------------------------------
  console.log('\nRunning TEST 9: Retailer injects orderStatus = DELIVERED...');
  const key9 = `test-idemp-9-${Date.now()}`;
  const res9 = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH_HEADER },
    body: JSON.stringify({
      idempotencyKey: key9,
      paymentMethod: 'COD',
      orderStatus: 'DELIVERED', // Malicious tamper
      items: [{ productId: testProdId, quantity: 24 }],
    }),
  });
  const data9 = await res9.json();
  assert(
    res9.status === 400 && data9.success === false && data9.error === 'INVALID_ORDER_STATUS',
    'TEST 9: orderStatus tampering rejected',
    `Expected 400 INVALID_ORDER_STATUS, got ${res9.status} ${data9.error}`
  );

  // --------------------------------------------------------------------------
  // TEST 10: Retailer attempts to order negative or zero quantity
  // Expected: Rejected with INVALID_PRODUCT
  // --------------------------------------------------------------------------
  console.log('\nRunning TEST 10: Negative/zero quantity order...');
  const key10 = `test-idemp-10-${Date.now()}`;
  const res10 = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH_HEADER },
    body: JSON.stringify({
      idempotencyKey: key10,
      paymentMethod: 'COD',
      items: [{ productId: testProdId, quantity: -5 }],
    }),
  });
  const data10 = await res10.json();
  assert(
    res10.status === 400 && data10.success === false && data10.error === 'INVALID_PRODUCT',
    'TEST 10: Negative quantity rejected',
    `Expected 400 INVALID_PRODUCT, got ${res10.status} ${data10.error}`
  );

  // --------------------------------------------------------------------------
  // TEST 11: Retailer attempts to order non-existent product
  // Expected: Rejected with INVALID_PRODUCT
  // --------------------------------------------------------------------------
  console.log('\nRunning TEST 11: Non-existent product order...');
  const key11 = `test-idemp-11-${Date.now()}`;
  const res11 = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH_HEADER },
    body: JSON.stringify({
      idempotencyKey: key11,
      paymentMethod: 'COD',
      items: [{ productId: 'non-existent-prod-999', quantity: 24 }],
    }),
  });
  const data11 = await res11.json();
  assert(
    res11.status === 400 && data11.success === false && data11.error === 'INVALID_PRODUCT',
    'TEST 11: Non-existent product rejected',
    `Expected 400 INVALID_PRODUCT, got ${res11.status} ${data11.error}`
  );

  // --------------------------------------------------------------------------
  // TEST 12: Retailer attempts to order inactive product
  // Expected: Rejected with PRODUCT_INACTIVE
  // --------------------------------------------------------------------------
  console.log('\nRunning TEST 12: Inactive product order...');
  // Mark prod-002 as inactive for this test
  const prod2Ref = doc(db, 'products', 'prod-002');
  await updateDoc(prod2Ref, {
    isActive: false,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  const key12 = `test-idemp-12-${Date.now()}`;
  const res12 = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH_HEADER },
    body: JSON.stringify({
      idempotencyKey: key12,
      paymentMethod: 'COD',
      items: [{ productId: 'prod-002', quantity: 12 }],
    }),
  });
  const data12 = await res12.json();
  // Restore prod-002 active status
  await updateDoc(prod2Ref, {
    isActive: true,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  assert(
    res12.status === 400 && data12.success === false && data12.error === 'PRODUCT_INACTIVE',
    'TEST 12: Inactive product rejected',
    `Expected 400 PRODUCT_INACTIVE, got ${res12.status} ${data12.error}`
  );

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED (Total: ${passed + failed})`);
  console.log('====================================================');

  // Restore test product stock
  await updateDoc(prodRef, {
    stockQuantity: 200,
    isActive: true,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runAudit().catch(err => {
  console.error('Audit run crashed:', err);
  process.exit(1);
});
