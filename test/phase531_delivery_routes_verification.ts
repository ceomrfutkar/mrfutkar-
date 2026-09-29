import { db, OPERATIONAL_WAREHOUSE_ID, SERVER_TXN_TOKEN } from '../server/firebaseAdmin';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const BASE_URL = 'http://localhost:3000';

interface VerificationResult {
  code: string;
  name: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

const results: VerificationResult[] = [];

function record(code: string, name: string, pass: boolean, details?: string) {
  const status = pass ? 'PASS' : 'FAIL';
  results.push({ code, name, status, details });
  const icon = pass ? '✅' : '❌';
  console.log(`${icon} [${status}] ${code}: ${name}`);
  if (details) {
    console.log(`    Detail: ${details}`);
  }
}

async function runPhase531Verification() {
  console.log('========================================================================');
  console.log('MR FUTKAR — PHASE 5.3.1 DELIVERY ROUTES SERVER-AUTHORITY VERIFICATION');
  console.log('========================================================================\n');

  const now = new Date().toISOString();
  const runId = Date.now().toString(36);

  // 1. Seed identities and product
  const testProdId = `prod-p531-${runId}`;
  const initialStock = 200;

  await setDoc(doc(db, 'products', testProdId), {
    productId: testProdId,
    productName: `Delivery Test Item ${runId}`,
    sku: `SKU-P531-${runId.toUpperCase()}`,
    stockQuantity: initialStock,
    mrp: 100,
    sellingPrice: 80,
    warehouseId: OPERATIONAL_WAREHOUSE_ID,
    isActive: true,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString(),
  });

  const partner1Id = 'DP-DELHI-01';
  const partner2Id = 'DP-DELHI-02';

  // Seed Partner 1 & 2
  await setDoc(doc(db, 'deliveryPartners', partner1Id), {
    partnerId: partner1Id,
    userId: partner1Id,
    name: 'Mukesh Sharma (Fleet Partner)',
    mobile: '9876543210',
    status: 'ACTIVE',
    availabilityStatus: 'AVAILABLE',
    vehicleType: 'TATA_ACE',
    vehicleNumber: 'DL-1L-AA-1234',
    licenseNumber: 'DL-1420110012345',
    assignedWarehouseId: OPERATIONAL_WAREHOUSE_ID,
    assignedWarehouseName: 'MR FUTKAR — BRAHMPURI',
    serviceAreas: ['Brahmpuri', 'Karawal Nagar'],
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString(),
  });

  await setDoc(doc(db, 'deliveryPartners', partner2Id), {
    partnerId: partner2Id,
    userId: partner2Id,
    name: 'Sunil Verma (Fleet Partner)',
    mobile: '9876543211',
    status: 'ACTIVE',
    availabilityStatus: 'AVAILABLE',
    vehicleType: 'MOTORCYCLE',
    vehicleNumber: 'DL-5S-BB-5678',
    licenseNumber: 'DL-1420150098765',
    assignedWarehouseId: OPERATIONAL_WAREHOUSE_ID,
    assignedWarehouseName: 'MR FUTKAR — BRAHMPURI',
    serviceAreas: ['Brahmpuri', 'Karawal Nagar'],
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString(),
  });

  // Seed Order 1 (Happy path delivery with COD)
  const order1Id = `ORD-P531-HP-${runId}`;
  await setDoc(doc(db, 'orders', order1Id), {
    orderId: order1Id,
    warehouseId: OPERATIONAL_WAREHOUSE_ID,
    warehouseName: 'MR FUTKAR — BRAHMPURI',
    retailerId: 'ret-p531-retailer',
    retailerName: 'Gupta Kirana Store',
    shopName: 'Gupta General Store',
    orderStatus: 'READY_FOR_DISPATCH',
    paymentMethod: 'COD',
    grandTotal: 1200,
    subtotal: 1200,
    items: [{ productId: testProdId, quantity: 10, unitPrice: 120, subtotal: 1200 }],
    createdAt: now,
    updatedAt: now,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString(),
  });

  // Seed Order 2 (Failed & Return path)
  const order2Id = `ORD-P531-FAIL-${runId}`;
  await setDoc(doc(db, 'orders', order2Id), {
    orderId: order2Id,
    warehouseId: OPERATIONAL_WAREHOUSE_ID,
    warehouseName: 'MR FUTKAR — BRAHMPURI',
    retailerId: 'ret-p531-retailer',
    retailerName: 'Gupta Kirana Store',
    shopName: 'Gupta General Store',
    orderStatus: 'READY_FOR_DISPATCH',
    paymentMethod: 'COD',
    grandTotal: 850,
    subtotal: 850,
    items: [{ productId: testProdId, quantity: 5, unitPrice: 170, subtotal: 850 }],
    createdAt: now,
    updatedAt: now,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString(),
  });

  console.log(`[SETUP] Seeded test product ${testProdId}, orders ${order1Id} & ${order2Id}\n`);

  // =========================================================================
  // 1. AUTHENTICATION & ACCESS CONTROL TESTS
  // =========================================================================
  console.log('--- 1. AUTH & ACCESS CONTROL TESTS ---');

  // Unauthenticated -> 401
  const unauthRes = await fetch(`${BASE_URL}/api/delivery/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: order1Id, partnerId: partner1Id }),
  });
  record('AUTH-01', 'Unauthenticated request rejected with 401', unauthRes.status === 401, `Status: ${unauthRes.status}`);

  // Retailer attempting warehouse assign -> 403
  const retailerAssignRes = await fetch(`${BASE_URL}/api/delivery/assign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-uid-ret-p531-retailer',
    },
    body: JSON.stringify({ orderId: order1Id, partnerId: partner1Id }),
  });
  record('AUTH-02', 'Retailer attempting assign rejected with 403', retailerAssignRes.status === 403, `Status: ${retailerAssignRes.status}`);

  // Delivery partner attempting self-assignment -> 403 (Delivery partner lacks warehouse dispatch role)
  const dpSelfAssignRes = await fetch(`${BASE_URL}/api/delivery/assign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner1Id}`,
    },
    body: JSON.stringify({ orderId: order1Id, partnerId: partner1Id }),
  });
  record('AUTH-03', 'Delivery partner self-assignment rejected with 403', dpSelfAssignRes.status === 403, `Status: ${dpSelfAssignRes.status}`);

  // =========================================================================
  // 2. HAPPY PATH DELIVERY LIFECYCLE (DEL-ASSIGN -> DELIVERED)
  // =========================================================================
  console.log('\n--- 2. HAPPY PATH DELIVERY LIFECYCLE ---');

  // Verify stock before delivery lifecycle
  const prodDocBefore = await getDoc(doc(db, 'products', testProdId));
  const stockBeforeDelivery = prodDocBefore.data()?.stockQuantity;

  // DEL-ASSIGN
  const assignRes = await fetch(`${BASE_URL}/api/delivery/assign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-uid-WH-STAFF-01',
    },
    body: JSON.stringify({ orderId: order1Id, partnerId: partner1Id }),
  });
  const assignData = await assignRes.json();
  const assignPass = assignRes.status === 200 && assignData.success === true && assignData.data?.delivery?.assignmentStatus === 'ASSIGNED';
  record('DEL-ASSIGN', 'POST /api/delivery/assign succeeds with server authority', assignPass, `HTTP ${assignRes.status}`);

  // Order isolation: Partner 2 cannot view or accept Order 1
  const partner2AcceptRes = await fetch(`${BASE_URL}/api/delivery/orders/${order1Id}/accept`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner2Id}`,
    },
  });
  record('ISOLATION-01', 'Unassigned partner cannot accept order (403)', partner2AcceptRes.status === 403, `Status: ${partner2AcceptRes.status}`);

  // DEL-ACCEPT
  const acceptRes = await fetch(`${BASE_URL}/api/delivery/orders/${order1Id}/accept`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner1Id}`,
    },
  });
  const acceptData = await acceptRes.json();
  const acceptPass = acceptRes.status === 200 && acceptData.success === true && acceptData.order?.delivery?.assignmentStatus === 'ACCEPTED';
  record('DEL-ACCEPT', 'POST /api/delivery/orders/:orderId/accept succeeds', acceptPass, `HTTP ${acceptRes.status}`);

  // Replay DEL-ACCEPT immediately
  const replayAcceptRes = await fetch(`${BASE_URL}/api/delivery/orders/${order1Id}/accept`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner1Id}`,
    },
  });
  const replayAcceptData = await replayAcceptRes.json();
  record('IDEMP-ACCEPT', 'Replay accept returns safe idempotent response', replayAcceptRes.status === 200 && replayAcceptData.isIdempotentReplay === true, `HTTP ${replayAcceptRes.status}`);

  // DEL-PICKUP
  const pickupRes = await fetch(`${BASE_URL}/api/delivery/orders/${order1Id}/pickup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner1Id}`,
    },
  });
  const pickupData = await pickupRes.json();
  const pickupPass = pickupRes.status === 200 && pickupData.success === true && Boolean(pickupData.pickedUpAt);
  record('DEL-PICKUP', 'POST /api/delivery/orders/:orderId/pickup succeeds', pickupPass, `HTTP ${pickupRes.status}`);

  // Replay DEL-PICKUP immediately
  const replayPickupRes = await fetch(`${BASE_URL}/api/delivery/orders/${order1Id}/pickup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner1Id}`,
    },
  });
  const replayPickupData = await replayPickupRes.json();
  record('IDEMP-PICKUP', 'Replay pickup returns safe idempotent response', replayPickupRes.status === 200 && replayPickupData.isIdempotentReplay === true, `HTTP ${replayPickupRes.status}`);

  // DEL-OUT (Out For Delivery)
  const outRes = await fetch(`${BASE_URL}/api/delivery/orders/${order1Id}/out-for-delivery`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner1Id}`,
    },
  });
  const outData = await outRes.json();
  const outPass = outRes.status === 200 && outData.success === true && Boolean(outData.outForDeliveryAt);
  record('DEL-OUT', 'POST /api/delivery/orders/:orderId/out-for-delivery succeeds', outPass, `HTTP ${outRes.status}`);

  // Replay DEL-OUT immediately
  const replayOutRes = await fetch(`${BASE_URL}/api/delivery/orders/${order1Id}/out-for-delivery`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner1Id}`,
    },
  });
  const replayOutData = await replayOutRes.json();
  record('IDEMP-OUT', 'Replay out-for-delivery returns safe idempotent response', replayOutRes.status === 200 && replayOutData.isIdempotentReplay === true, `HTTP ${replayOutRes.status}`);

  // OTP Verification
  // Retailer requests OTP resend to retrieve plaintext OTP
  const resendRes = await fetch(`${BASE_URL}/api/delivery/orders/${order1Id}/otp/resend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-uid-ret-p531-retailer',
    },
    body: JSON.stringify({ _bypassRateLimit: true }),
  });
  const resendData = await resendRes.json();
  const validOtp = resendData.otp;

  // Invalid OTP test
  const invalidOtpRes = await fetch(`${BASE_URL}/api/delivery/orders/${order1Id}/otp/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner1Id}`,
    },
    body: JSON.stringify({ otp: '000000' }),
  });
  record('OTP-INVALID', 'Invalid OTP verification fails with 400', invalidOtpRes.status === 400, `Status: ${invalidOtpRes.status}`);

  // Valid OTP test
  const validOtpRes = await fetch(`${BASE_URL}/api/delivery/orders/${order1Id}/otp/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner1Id}`,
    },
    body: JSON.stringify({ otp: validOtp }),
  });
  const validOtpData = await validOtpRes.json();
  const otpPass = validOtpRes.status === 200 && validOtpData.verified === true;
  record('DEL-OTP', 'Delivery OTP verification succeeds with server authority', otpPass, `Status: ${validOtpRes.status}`);

  // DEL-POD (Upload Proof of Delivery)
  const dummyPhotoUrl = 'data:image/jpeg;base64,' + Buffer.from('dummy jpeg binary image payload').toString('base64');
  const podRes = await fetch(`${BASE_URL}/api/delivery/orders/${order1Id}/pod/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner1Id}`,
    },
    body: JSON.stringify({
      type: 'photo',
      dataUrl: dummyPhotoUrl,
    }),
  });
  const podData = await podRes.json();
  const podPass = podRes.status === 200 && podData.success === true && Boolean(podData.podId);
  record('DEL-POD', 'Proof of delivery photo upload succeeds', podPass, `Status: ${podRes.status}`);

  // COD Collection Validation checks:
  // Underpayment
  const underCodRes = await fetch(`${BASE_URL}/api/delivery/orders/${order1Id}/delivered`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner1Id}`,
    },
    body: JSON.stringify({
      recipientName: 'Ramesh Gupta',
      amountCollected: 1000, // Underpayment: 1000 vs 1200 due
    }),
  });
  record('COD-UNDER', 'Underpayment rejected with 400', underCodRes.status === 400, `Status: ${underCodRes.status}`);

  // Overpayment
  const overCodRes = await fetch(`${BASE_URL}/api/delivery/orders/${order1Id}/delivered`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner1Id}`,
    },
    body: JSON.stringify({
      recipientName: 'Ramesh Gupta',
      amountCollected: 1500, // Overpayment: 1500 vs 1200 due
    }),
  });
  record('COD-OVER', 'Overpayment rejected with 400', overCodRes.status === 400, `Status: ${overCodRes.status}`);

  // Recipient name validation (< 2 characters)
  const invalidNameRes = await fetch(`${BASE_URL}/api/delivery/orders/${order1Id}/delivered`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner1Id}`,
    },
    body: JSON.stringify({
      recipientName: 'A',
      amountCollected: 1200,
    }),
  });
  record('RECIPIENT-VAL', 'Recipient name < 2 chars rejected with 400', invalidNameRes.status === 400, `Status: ${invalidNameRes.status}`);

  // DEL-DELIVERED (Successful delivery completion)
  const deliveredRes = await fetch(`${BASE_URL}/api/delivery/orders/${order1Id}/delivered`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner1Id}`,
    },
    body: JSON.stringify({
      recipientName: 'Ramesh Gupta (Store Owner)',
      amountCollected: 1200, // Exact COD match
      deliveryNotes: 'Delivered at store counter with cash received',
    }),
  });
  const deliveredData = await deliveredRes.json();
  const deliveredPass = deliveredRes.status === 200 && deliveredData.success === true && Boolean(deliveredData.deliveredAt);
  record('DEL-DELIVERED', 'POST /api/delivery/orders/:orderId/delivered succeeds', deliveredPass, `Status: ${deliveredRes.status}`);

  // Verify Firestore Order state
  const deliveredDoc = await getDoc(doc(db, 'orders', order1Id));
  const deliveredOrderData = deliveredDoc.data();
  const stateCheckPass = deliveredOrderData?.orderStatus === 'DELIVERED' &&
                         deliveredOrderData?.delivery?.assignmentStatus === 'DELIVERED' &&
                         deliveredOrderData?.paymentStatus === 'PAID';
  record('FIRESTORE-STATE', 'Order in Firestore reflects DELIVERED & PAID', stateCheckPass, `orderStatus=${deliveredOrderData?.orderStatus}, paymentStatus=${deliveredOrderData?.paymentStatus}`);

  // =========================================================================
  // 3. INVENTORY INVARIANT VERIFICATION
  // =========================================================================
  console.log('\n--- 3. INVENTORY INVARIANT VERIFICATION ---');

  const prodDocAfter = await getDoc(doc(db, 'products', testProdId));
  const stockAfterDelivery = prodDocAfter.data()?.stockQuantity;
  const stockUnchanged = stockBeforeDelivery === stockAfterDelivery;
  record('INV-SAFETY', 'Product stock remains 100% unchanged through delivery lifecycle', stockUnchanged, `Before: ${stockBeforeDelivery}, After: ${stockAfterDelivery}`);

  // =========================================================================
  // 4. IDEMPOTENCY VERIFICATION
  // =========================================================================
  console.log('\n--- 4. IDEMPOTENCY REPLAY DELIVERED TEST ---');

  // Replay delivered
  const replayDeliveredRes = await fetch(`${BASE_URL}/api/delivery/orders/${order1Id}/delivered`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner1Id}`,
    },
    body: JSON.stringify({
      recipientName: 'Ramesh Gupta (Store Owner)',
      amountCollected: 1200,
    }),
  });
  const replayDeliveredData = await replayDeliveredRes.json();
  record('IDEMP-DELIVERED', 'Replay delivered returns safe idempotent response without duplicating collection', replayDeliveredRes.status === 200 && replayDeliveredData.isIdempotentReplay === true, `HTTP ${replayDeliveredRes.status}`);

  // =========================================================================
  // 5. FAILURE & RETURN LIFECYCLE (Order 2)
  // =========================================================================
  console.log('\n--- 5. FAILURE & RETURN LIFECYCLE ---');

  // Assign Order 2 to Partner 2
  await fetch(`${BASE_URL}/api/delivery/assign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-uid-WH-STAFF-01',
    },
    body: JSON.stringify({ orderId: order2Id, partnerId: partner2Id }),
  });

  // Partner 2 accepts Order 2
  await fetch(`${BASE_URL}/api/delivery/orders/${order2Id}/accept`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner2Id}`,
    },
  });

  // Partner 2 picks up Order 2
  await fetch(`${BASE_URL}/api/delivery/orders/${order2Id}/pickup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner2Id}`,
    },
  });

  // Partner 2 marks out for delivery
  await fetch(`${BASE_URL}/api/delivery/orders/${order2Id}/out-for-delivery`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner2Id}`,
    },
  });

  // DEL-FAILED
  const failedRes = await fetch(`${BASE_URL}/api/delivery/orders/${order2Id}/failed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner2Id}`,
    },
    body: JSON.stringify({
      reason: 'CUSTOMER_UNAVAILABLE',
      notes: 'Shop closed upon arrival, phone switched off.',
    }),
  });
  const failedData = await failedRes.json();
  const failedPass = failedRes.status === 200 && failedData.success === true && Boolean(failedData.failedAt);
  record('DEL-FAILED', 'POST /api/delivery/orders/:orderId/failed succeeds', failedPass, `HTTP ${failedRes.status}`);

  // Replay failed
  const replayFailedRes = await fetch(`${BASE_URL}/api/delivery/orders/${order2Id}/failed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner2Id}`,
    },
    body: JSON.stringify({
      reason: 'CUSTOMER_UNAVAILABLE',
    }),
  });
  const replayFailedData = await replayFailedRes.json();
  record('IDEMP-FAILED', 'Replay failed returns safe idempotent response', replayFailedRes.status === 200 && replayFailedData.isIdempotentReplay === true, `HTTP ${replayFailedRes.status}`);

  // DEL-RETURN
  const returnRes = await fetch(`${BASE_URL}/api/delivery/orders/${order2Id}/return`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner2Id}`,
    },
    body: JSON.stringify({
      returnReason: 'Shop closed and customer phone switched off',
    }),
  });
  const returnData = await returnRes.json();
  const returnPass = returnRes.status === 200 && returnData.success === true && Boolean(returnData.returnedAt);
  record('DEL-RETURN', 'POST /api/delivery/orders/:orderId/return succeeds', returnPass, `HTTP ${returnRes.status}`);

  // Replay return
  const replayReturnRes = await fetch(`${BASE_URL}/api/delivery/orders/${order2Id}/return`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner2Id}`,
    },
    body: JSON.stringify({
      returnReason: 'Shop closed and customer phone switched off',
    }),
  });
  const replayReturnData = await replayReturnRes.json();
  record('IDEMP-RETURN', 'Replay return returns safe idempotent response', replayReturnRes.status === 200 && replayReturnData.isIdempotentReplay === true, `HTTP ${replayReturnRes.status}`);

  // Verify Order 2 Firestore status
  const order2Doc = await getDoc(doc(db, 'orders', order2Id));
  const order2Data = order2Doc.data();
  const order2Pass = order2Data?.orderStatus === 'RETURN_REQUESTED' &&
                     order2Data?.delivery?.assignmentStatus === 'RETURN_TO_WAREHOUSE';
  record('RETURN-STATE', 'Order 2 reflects RETURN_REQUESTED and RETURN_TO_WAREHOUSE in Firestore', order2Pass, `orderStatus=${order2Data?.orderStatus}, deliveryStatus=${order2Data?.delivery?.assignmentStatus}`);

  // =========================================================================
  // 6. CLIENT TOKEN TAMPERING RESISTANCE SCAN
  // =========================================================================
  console.log('\n--- 6. SECURITY SCAN (TOKEN INJECTION IMMUNITY) ---');

  // Client attempts to pass spoofed tokens in body
  const spoofRes = await fetch(`${BASE_URL}/api/delivery/availability`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${partner1Id}`,
    },
    body: JSON.stringify({
      status: 'AVAILABLE',
      _serverTxnToken: 'ATTACKER_INJECTED_TOKEN',
      _serverWriteNonce: 'ATTACKER_INJECTED_NONCE',
    }),
  });
  const partnerDocAfter = await getDoc(doc(db, 'deliveryPartners', partner1Id));
  const storedPartner = partnerDocAfter.data();
  const secureServerAuthority = storedPartner?._serverTxnToken === SERVER_TXN_TOKEN &&
                                storedPartner?._serverWriteNonce !== 'ATTACKER_INJECTED_NONCE';
  record('SEC-TAMPER', 'Server overwrites/rejects client-injected _serverTxnToken & _serverWriteNonce', secureServerAuthority, `Stored token=${storedPartner?._serverTxnToken}`);

  // Summary
  const passedCount = results.filter(r => r.status === 'PASS').length;
  console.log('\n========================================================================');
  console.log(`TOTAL: ${passedCount} / ${results.length} TESTS PASSED`);
  console.log('========================================================================\n');

  if (passedCount < results.length) {
    console.error(`FAILED: ${results.length - passedCount} test(s) failed.`);
    process.exit(1);
  } else {
    console.log('SUCCESS: All delivery routes and server-authority requirements verified!');
    process.exit(0);
  }
}

runPhase531Verification().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
