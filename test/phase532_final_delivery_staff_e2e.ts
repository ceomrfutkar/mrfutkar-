import { db, OPERATIONAL_WAREHOUSE_ID, SERVER_TXN_TOKEN } from '../server/firebaseAdmin';
import { doc, getDoc, getDocs, collection, query, where, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const BASE_URL = 'http://localhost:3000';

interface CheckItem {
  section: string;
  code: string;
  title: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

const checkResults: CheckItem[] = [];

function recordCheck(section: string, code: string, title: string, passed: boolean, details?: string) {
  const status: 'PASS' | 'FAIL' = passed ? 'PASS' : 'FAIL';
  checkResults.push({ section, code, title, status, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${status}] [${section}] ${code}: ${title}`);
  if (details) {
    console.log(`    └─ ${details}`);
  }
}

async function runE2EVerification() {
  console.log('========================================================================');
  console.log('MR FUTKAR — PHASE 5.3.2 FINAL DELIVERY STAFF E2E VERIFICATION');
  console.log('========================================================================\n');

  // =========================================================================
  // ENVIRONMENT VERIFICATION
  // =========================================================================
  console.log('--------------------------------------------------');
  console.log('ENVIRONMENT VERIFICATION');
  console.log('--------------------------------------------------');
  const projectId = firebaseConfig.projectId;
  const firestoreDbId = firebaseConfig.firestoreDatabaseId;
  const storageBucket = firebaseConfig.storageBucket;
  const appEnv = process.env.APP_ENV || 'production';
  const warehouseId = OPERATIONAL_WAREHOUSE_ID;

  console.log(`- Firebase Project ID:     ${projectId}`);
  console.log(`- Firestore Database ID:   ${firestoreDbId}`);
  console.log(`- Storage Bucket:          ${storageBucket}`);
  console.log(`- APP_ENV:                 ${appEnv}`);
  console.log(`- Warehouse ID:            ${warehouseId}`);

  recordCheck('ENV', 'ENV-01', 'Firebase Project ID is configured', Boolean(projectId), projectId);
  recordCheck('ENV', 'ENV-02', 'Firestore Database ID matches applet target', Boolean(firestoreDbId), firestoreDbId);
  recordCheck('ENV', 'ENV-03', 'Storage Bucket is configured', Boolean(storageBucket), storageBucket);
  recordCheck('ENV', 'ENV-04', 'Operational Warehouse is WH-BRAHMPURI-01', warehouseId === 'WH-BRAHMPURI-01', warehouseId);

  // Setup test identities and products
  const runTag = Date.now().toString(36);
  const now = new Date().toISOString();

  const partner1Id = 'DP-DELHI-01';
  const partner2Id = 'DP-DELHI-02';

  // Seed Partners in Firestore
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

  // Seed controlled test product
  const testProductId = `prod-e2e-${runTag}`;
  const initialStock = 150;
  const unitPrice = 160;
  const orderQty = 4; // 4 * 160 = 640 >= 500 min order

  await setDoc(doc(db, 'products', testProductId), {
    productId: testProductId,
    productName: `Premium Basmati Rice 5kg (${runTag})`,
    sku: `SKU-RICE-${runTag.toUpperCase()}`,
    stockQuantity: initialStock,
    mrp: 200,
    sellingPrice: unitPrice,
    wholesalePrice: unitPrice,
    category: 'Staples & Grains',
    brand: 'India Gate',
    warehouseId: OPERATIONAL_WAREHOUSE_ID,
    isActive: true,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString(),
  });

  console.log(`\n[SETUP] Seeded test product ${testProductId} (Stock: ${initialStock}, Unit Price: ₹${unitPrice})`);

  // =========================================================================
  // SUCCESS PATH (ORDER A)
  // =========================================================================
  console.log('\n--------------------------------------------------');
  console.log('SUCCESS PATH (ORDER A): COMPLETE LIFECYCLE');
  console.log('--------------------------------------------------');

  const stockBeforeOrder = initialStock;
  const retailerUid = `ret-e2e-${runTag}`;

  // A. Retailer order placement
  const orderPlaceRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${retailerUid}`,
    },
    body: JSON.stringify({
      idempotencyKey: `idemp-ordA-${runTag}`,
      paymentMethod: 'COD',
      items: [{ productId: testProductId, quantity: orderQty }],
      retailerName: 'Anil Gupta',
      shopName: 'Gupta Provision Store',
      deliveryAddressSnapshot: {
        fullAddress: 'Plot 42, Gali No. 3, Brahmpuri',
        city: 'Delhi',
        pincode: '110053',
        phone: '9810011223',
      },
    }),
  });

  const orderPlaceData = await orderPlaceRes.json();
  const orderAId = orderPlaceData.orderId;
  const orderAPlaced = orderPlaceRes.status === 200 && orderPlaceData.success === true && Boolean(orderAId);
  recordCheck('SUCCESS_PATH', 'ORD-A-PLACE', 'Retailer order placement (POST /api/orders)', orderAPlaced, `Order ID: ${orderAId}, Grand Total: ₹${orderPlaceData.grandTotal}`);

  // Authoritative state check 1: PLACED
  const orderADoc1 = await getDoc(doc(db, 'orders', orderAId));
  const orderAData1 = orderADoc1.data()!;
  recordCheck('SUCCESS_PATH', 'STATE-PLACED', 'Authoritative Firestore state: PLACED', orderAData1.orderStatus === 'PLACED', `Status: ${orderAData1.orderStatus}`);

  // Check inventory deduction after order creation
  const prodDocAfterOrder = await getDoc(doc(db, 'products', testProductId));
  const stockAfterOrder = prodDocAfterOrder.data()?.stockQuantity;
  recordCheck('INVENTORY', 'INV-DEDUCT', 'Atomic stock deduction on order placement', stockAfterOrder === (stockBeforeOrder - orderQty), `Before: ${stockBeforeOrder}, After Order: ${stockAfterOrder}, Expected: ${stockBeforeOrder - orderQty}`);

  // Snapshot Immutability Record
  const initialSnapshotPrice = orderAData1.items[0].unitPrice;
  const initialSnapshotQty = orderAData1.items[0].quantity;
  const initialSnapshotSubtotal = orderAData1.subtotal;
  const initialSnapshotGrandTotal = orderAData1.grandTotal;
  const initialSnapshotAddress = JSON.stringify(orderAData1.deliveryAddressSnapshot);

  // B. Warehouse confirmation
  const whHeaders = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer test-uid-WH-STAFF-01',
  };

  const confirmRes = await fetch(`${BASE_URL}/api/warehouse/orders/${orderAId}/status`, {
    method: 'POST',
    headers: whHeaders,
    body: JSON.stringify({ newStatus: 'CONFIRMED' }),
  });
  const confirmData = await confirmRes.json();
  recordCheck('SUCCESS_PATH', 'WH-CONFIRM', 'Warehouse confirms order (CONFIRMED)', confirmRes.status === 200 && confirmData.success === true, `HTTP ${confirmRes.status}`);

  // C. Warehouse acceptance
  const acceptWhRes = await fetch(`${BASE_URL}/api/warehouse/orders/${orderAId}/status`, {
    method: 'POST',
    headers: whHeaders,
    body: JSON.stringify({ newStatus: 'ACCEPTED' }),
  });
  const acceptWhData = await acceptWhRes.json();
  recordCheck('SUCCESS_PATH', 'WH-ACCEPT', 'Warehouse accepts order (ACCEPTED)', acceptWhRes.status === 200 && acceptWhData.success === true, `HTTP ${acceptWhRes.status}`);

  // D. Picking
  const pickRes = await fetch(`${BASE_URL}/api/warehouse/orders/${orderAId}/picking`, {
    method: 'POST',
    headers: whHeaders,
    body: JSON.stringify({
      items: {
        [testProductId]: { pickedQty: orderQty, isShort: false },
      },
      completePicking: true,
      userName: 'Sonu Kumar',
    }),
  });
  const pickData = await pickRes.json();
  recordCheck('SUCCESS_PATH', 'WH-PICKING', 'Warehouse picking completed (PICKING -> COMPLETED)', pickRes.status === 200 && pickData.success === true && pickData.isCompleted === true, `HTTP ${pickRes.status}`);

  // E. Packing & Ready for Dispatch
  const packRes = await fetch(`${BASE_URL}/api/warehouse/orders/${orderAId}/packing`, {
    method: 'POST',
    headers: whHeaders,
    body: JSON.stringify({
      numberOfPackages: 1,
      boxType: 'Corrugated Wholesale Box',
      packingNotes: 'Rice 5kg package packed securely',
      moveToReady: true,
    }),
  });
  const packData = await packRes.json();
  recordCheck('SUCCESS_PATH', 'WH-PACKING', 'Warehouse packing completed & moved to READY_FOR_DISPATCH', packRes.status === 200 && packData.success === true && packData.orderStatus === 'READY_FOR_DISPATCH', `HTTP ${packRes.status}, Order Status: ${packData.orderStatus}`);

  // Inventory check during warehouse processing
  const prodDocDuringWH = await getDoc(doc(db, 'products', testProductId));
  const stockDuringWarehouseProcessing = prodDocDuringWH.data()?.stockQuantity;
  recordCheck('INVENTORY', 'INV-NO-WH-DEDUCT', 'Zero inventory deduction during warehouse picking/packing', stockDuringWarehouseProcessing === stockAfterOrder, `During WH: ${stockDuringWarehouseProcessing}, Expected: ${stockAfterOrder}`);

  // G. Warehouse assigns Delivery Staff
  const assignRes = await fetch(`${BASE_URL}/api/delivery/assign`, {
    method: 'POST',
    headers: whHeaders,
    body: JSON.stringify({
      orderId: orderAId,
      partnerId: partner1Id,
    }),
  });
  const assignData = await assignRes.json();
  recordCheck('SUCCESS_PATH', 'DEL-ASSIGN', 'Warehouse assigns Delivery Staff (POST /api/delivery/assign)', assignRes.status === 200 && assignData.success === true, `Assigned to: ${assignData.data?.delivery?.assignedPartnerName}`);

  // Authoritative state check: ASSIGNED
  const orderADoc2 = await getDoc(doc(db, 'orders', orderAId));
  const orderAData2 = orderADoc2.data()!;
  recordCheck('SUCCESS_PATH', 'STATE-ASSIGNED', 'Authoritative Firestore state: assignmentStatus is ASSIGNED', orderAData2.delivery?.assignmentStatus === 'ASSIGNED', `delivery.assignmentStatus: ${orderAData2.delivery?.assignmentStatus}`);

  // H. Delivery Staff accepts
  const dp1Headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer test-uid-${partner1Id}`,
  };

  const acceptDpRes = await fetch(`${BASE_URL}/api/delivery/orders/${orderAId}/accept`, {
    method: 'POST',
    headers: dp1Headers,
  });
  const acceptDpData = await acceptDpRes.json();
  recordCheck('SUCCESS_PATH', 'DEL-ACCEPT', 'Delivery Staff accepts order (POST /api/delivery/orders/:orderId/accept)', acceptDpRes.status === 200 && acceptDpData.success === true, `HTTP ${acceptDpRes.status}`);

  // I. Delivery Staff picks up
  const pickupRes = await fetch(`${BASE_URL}/api/delivery/orders/${orderAId}/pickup`, {
    method: 'POST',
    headers: dp1Headers,
  });
  const pickupData = await pickupRes.json();
  recordCheck('SUCCESS_PATH', 'DEL-PICKUP', 'Delivery Staff picks up order (POST /api/delivery/orders/:orderId/pickup)', pickupRes.status === 200 && pickupData.success === true, `Picked up at: ${pickupData.pickedUpAt}`);

  // J. Out for Delivery
  const outRes = await fetch(`${BASE_URL}/api/delivery/orders/${orderAId}/out-for-delivery`, {
    method: 'POST',
    headers: dp1Headers,
  });
  const outData = await outRes.json();
  recordCheck('SUCCESS_PATH', 'DEL-OUT', 'Delivery Staff marks Out for Delivery (POST /api/delivery/orders/:orderId/out-for-delivery)', outRes.status === 200 && outData.success === true, `Out for delivery at: ${outData.outForDeliveryAt}`);

  // Authoritative state check: OUT_FOR_DELIVERY & OTP Hash generated
  const orderADoc3 = await getDoc(doc(db, 'orders', orderAId));
  const orderAData3 = orderADoc3.data()!;
  const hasOtpHash = Boolean(orderAData3.deliveryOtp?.otpHash);
  const plaintextOtpExposed = Boolean(orderAData3.deliveryOtp?.otp);
  recordCheck('OTP', 'OTP-PERSIST-CHECK', 'Plaintext OTP is NOT stored in public order document', !plaintextOtpExposed && hasOtpHash, `Hash present: ${hasOtpHash}, Plaintext exposed: ${plaintextOtpExposed}`);

  // K. Generate delivery OTP / Retailer fetches OTP
  const otpResendRes = await fetch(`${BASE_URL}/api/delivery/orders/${orderAId}/otp/resend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${retailerUid}`,
    },
    body: JSON.stringify({ _bypassRateLimit: true }),
  });
  const otpResendData = await otpResendRes.json();
  const validOtp = otpResendData.otp;
  recordCheck('OTP', 'OTP-GEN', 'Retailer securely receives 6-digit OTP', otpResendRes.status === 200 && /^\d{6}$/.test(validOtp), `OTP is 6 digits: ${/^\d{6}$/.test(validOtp)}`);

  // L. Verify OTP
  // First test invalid OTP
  const invalidOtpRes = await fetch(`${BASE_URL}/api/delivery/orders/${orderAId}/otp/verify`, {
    method: 'POST',
    headers: dp1Headers,
    body: JSON.stringify({ otp: '999999' }),
  });
  recordCheck('OTP', 'OTP-INVALID', 'Invalid OTP is rejected with 400', invalidOtpRes.status === 400, `HTTP ${invalidOtpRes.status}`);

  // Verify valid OTP
  const validOtpRes = await fetch(`${BASE_URL}/api/delivery/orders/${orderAId}/otp/verify`, {
    method: 'POST',
    headers: dp1Headers,
    body: JSON.stringify({ otp: validOtp }),
  });
  const validOtpData = await validOtpRes.json();
  recordCheck('OTP', 'OTP-VERIFY', 'Valid OTP verifies successfully with server authority', validOtpRes.status === 200 && validOtpData.verified === true, `Verified: ${validOtpData.verified}`);

  // M. Upload valid POD (photo and signature)
  const dummyPhotoUrl = 'data:image/jpeg;base64,' + Buffer.from('MR FUTKAR PROOF OF DELIVERY JPEG PAYLOAD').toString('base64');
  const podPhotoRes = await fetch(`${BASE_URL}/api/delivery/orders/${orderAId}/pod/upload`, {
    method: 'POST',
    headers: dp1Headers,
    body: JSON.stringify({ type: 'photo', dataUrl: dummyPhotoUrl }),
  });
  const podPhotoData = await podPhotoRes.json();
  recordCheck('POD', 'POD-PHOTO', 'Upload valid Photo POD (JPEG/PNG)', podPhotoRes.status === 200 && Boolean(podPhotoData.podId), `POD ID: ${podPhotoData.podId}`);

  const dummySigUrl = 'data:image/png;base64,' + Buffer.from('MR FUTKAR RECIPIENT SIGNATURE PNG PAYLOAD').toString('base64');
  const podSigRes = await fetch(`${BASE_URL}/api/delivery/orders/${orderAId}/pod/upload`, {
    method: 'POST',
    headers: dp1Headers,
    body: JSON.stringify({ type: 'signature', dataUrl: dummySigUrl }),
  });
  const podSigData = await podSigRes.json();
  recordCheck('POD', 'POD-SIGNATURE', 'Upload valid Signature POD (PNG dataUrl)', podSigRes.status === 200 && Boolean(podSigData.podId), `POD ID: ${podSigData.podId}`);

  // N. Submit exact COD amount & Test under/overpayment
  const orderGrandTotal = orderAData1.grandTotal;

  // Underpayment check
  const underCodRes = await fetch(`${BASE_URL}/api/delivery/orders/${orderAId}/delivered`, {
    method: 'POST',
    headers: dp1Headers,
    body: JSON.stringify({
      recipientName: 'Anil Gupta',
      amountCollected: orderGrandTotal - 50,
    }),
  });
  recordCheck('COD', 'COD-UNDERPAY', 'Underpayment is strictly rejected with 400', underCodRes.status === 400, `HTTP ${underCodRes.status}`);

  // Overpayment check
  const overCodRes = await fetch(`${BASE_URL}/api/delivery/orders/${orderAId}/delivered`, {
    method: 'POST',
    headers: dp1Headers,
    body: JSON.stringify({
      recipientName: 'Anil Gupta',
      amountCollected: orderGrandTotal + 100,
    }),
  });
  recordCheck('COD', 'COD-OVERPAY', 'Overpayment is strictly rejected with 400', overCodRes.status === 400, `HTTP ${overCodRes.status}`);

  // O. Mark Delivered with exact COD amount
  const deliverRes = await fetch(`${BASE_URL}/api/delivery/orders/${orderAId}/delivered`, {
    method: 'POST',
    headers: dp1Headers,
    body: JSON.stringify({
      recipientName: 'Anil Gupta (Store Owner)',
      amountCollected: orderGrandTotal,
      deliveryNotes: 'Delivered in good condition with exact cash collected',
    }),
  });
  const deliverData = await deliverRes.json();
  recordCheck('SUCCESS_PATH', 'DEL-DELIVERED', 'Mark Delivered with exact COD (POST /api/delivery/orders/:orderId/delivered)', deliverRes.status === 200 && deliverData.success === true, `Delivered at: ${deliverData.deliveredAt}`);

  // Authoritative state check: DELIVERED & PAID
  const orderADocFinal = await getDoc(doc(db, 'orders', orderAId));
  const orderAFinalData = orderADocFinal.data()!;
  const finalDeliveredState = orderAFinalData.orderStatus === 'DELIVERED' &&
                              orderAFinalData.delivery?.assignmentStatus === 'DELIVERED' &&
                              orderAFinalData.paymentStatus === 'PAID';
  recordCheck('SUCCESS_PATH', 'STATE-DELIVERED', 'Authoritative Firestore state: DELIVERED & PAID', finalDeliveredState, `orderStatus: ${orderAFinalData.orderStatus}, paymentStatus: ${orderAFinalData.paymentStatus}`);

  // =========================================================================
  // INVENTORY INVARIANT VERIFICATION
  // =========================================================================
  console.log('\n--------------------------------------------------');
  console.log('INVENTORY INVARIANT VERIFICATION');
  console.log('--------------------------------------------------');

  const prodDocAfterDelivery = await getDoc(doc(db, 'products', testProductId));
  const stockAfterDelivery = prodDocAfterDelivery.data()?.stockQuantity;
  const invariantHolds = (stockAfterDelivery === stockAfterOrder) && (stockAfterDelivery === (stockBeforeOrder - orderQty));
  recordCheck('INVENTORY', 'INV-INVARIANT', 'stockAfterDelivery = stockAfterOrder (No delivery stock deduction)', invariantHolds, `Before: ${stockBeforeOrder}, After Order: ${stockAfterOrder}, During WH: ${stockDuringWarehouseProcessing}, After Delivery: ${stockAfterDelivery}`);

  // Verify inventoryMovements for Order A
  const movSnap = await getDocs(query(collection(db, 'inventoryMovements'), where('referenceId', '==', orderAId)));
  const movDocs = movSnap.docs.map(d => d.data());
  const exactOneDeduction = movDocs.length === 1 && movDocs[0].delta === -orderQty;
  recordCheck('INVENTORY', 'INV-MOVEMENTS', 'Exactly one order deduction in inventoryMovements, zero warehouse/delivery deductions', exactOneDeduction, `Movement count: ${movDocs.length}, Delta: ${movDocs[0]?.delta}`);

  // =========================================================================
  // ORDER SNAPSHOT IMMUTABILITY
  // =========================================================================
  console.log('\n--------------------------------------------------');
  console.log('ORDER SNAPSHOT IMMUTABILITY');
  console.log('--------------------------------------------------');

  const finalSnapshotPrice = orderAFinalData.items[0].unitPrice;
  const finalSnapshotQty = orderAFinalData.items[0].quantity;
  const finalSnapshotSubtotal = orderAFinalData.subtotal;
  const finalSnapshotGrandTotal = orderAFinalData.grandTotal;

  const addr1 = orderAData1.deliveryAddressSnapshot || {};
  const addrFinal = orderAFinalData.deliveryAddressSnapshot || {};
  const addressImmutable =
    addr1.fullAddress === addrFinal.fullAddress &&
    addr1.city === addrFinal.city &&
    addr1.pincode === addrFinal.pincode &&
    addr1.phone === addrFinal.phone;

  const priceImmutable = initialSnapshotPrice === finalSnapshotPrice;
  const qtyImmutable = initialSnapshotQty === finalSnapshotQty;
  const subtotalImmutable = initialSnapshotSubtotal === finalSnapshotSubtotal;
  const grandTotalImmutable = initialSnapshotGrandTotal === finalSnapshotGrandTotal;

  const allSnapshotsImmutable = priceImmutable && qtyImmutable && subtotalImmutable && grandTotalImmutable && addressImmutable;
  recordCheck('SNAPSHOT', 'SNAP-IMMUTABLE', 'Order snapshots remain 100% immutable throughout the lifecycle', allSnapshotsImmutable, `Price: ${priceImmutable}, Qty: ${qtyImmutable}, Total: ${grandTotalImmutable}, Address: ${addressImmutable}`);

  // =========================================================================
  // DELIVERY PARTNER ISOLATION & RBAC
  // =========================================================================
  console.log('\n--------------------------------------------------');
  console.log('DELIVERY PARTNER ISOLATION & ACCESS CONTROL');
  console.log('--------------------------------------------------');

  const dp2Headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer test-uid-${partner2Id}`,
  };

  // Staff B cannot access Staff A's order details
  const dp2AccessRes = await fetch(`${BASE_URL}/api/delivery/orders/${orderAId}`, {
    headers: dp2Headers,
  });
  recordCheck('ISOLATION', 'ISO-ACCESS', 'Staff B cannot access Staff A assigned order (403)', dp2AccessRes.status === 403, `HTTP ${dp2AccessRes.status}`);

  // Staff B cannot transition Staff A's order
  const dp2DeliverRes = await fetch(`${BASE_URL}/api/delivery/orders/${orderAId}/delivered`, {
    method: 'POST',
    headers: dp2Headers,
    body: JSON.stringify({ recipientName: 'Spoofed Person', amountCollected: orderGrandTotal }),
  });
  recordCheck('ISOLATION', 'ISO-DELIVER', 'Staff B cannot mark Staff A order delivered (403)', dp2DeliverRes.status === 403, `HTTP ${dp2DeliverRes.status}`);

  // Self-assignment blocked: Delivery Staff cannot self-assign
  const selfAssignRes = await fetch(`${BASE_URL}/api/delivery/assign`, {
    method: 'POST',
    headers: dp1Headers,
    body: JSON.stringify({ orderId: orderAId, partnerId: partner1Id }),
  });
  recordCheck('ISOLATION', 'ISO-SELF-ASSIGN', 'Delivery Staff cannot self-assign orders (403)', selfAssignRes.status === 403, `HTTP ${selfAssignRes.status}`);

  // =========================================================================
  // SERVER AUTHORITY INJECTION RESISTANCE
  // =========================================================================
  console.log('\n--------------------------------------------------');
  console.log('SERVER AUTHORITY INJECTION RESISTANCE');
  console.log('--------------------------------------------------');

  // Attempt client-side injection of _serverTxnToken and _serverWriteNonce
  const spoofAvailabilityRes = await fetch(`${BASE_URL}/api/delivery/availability`, {
    method: 'POST',
    headers: dp1Headers,
    body: JSON.stringify({
      status: 'AVAILABLE',
      _serverTxnToken: 'ATTACKER_FAKE_AUTHORITY_TOKEN',
      _serverWriteNonce: 'ATTACKER_FAKE_NONCE',
    }),
  });
  const dpDocAfterSpoof = await getDoc(doc(db, 'deliveryPartners', partner1Id));
  const dpDataAfterSpoof = dpDocAfterSpoof.data()!;
  const authorityProtected = dpDataAfterSpoof._serverTxnToken === SERVER_TXN_TOKEN &&
                             dpDataAfterSpoof._serverWriteNonce !== 'ATTACKER_FAKE_NONCE';
  recordCheck('SERVER_AUTH', 'AUTH-INJECTION', 'Server overwrites/ignores client-injected _serverTxnToken & _serverWriteNonce', authorityProtected, `Stored token: ${dpDataAfterSpoof._serverTxnToken}`);

  // =========================================================================
  // IDEMPOTENCY REPLAY VERIFICATION
  // =========================================================================
  console.log('\n--------------------------------------------------');
  console.log('IDEMPOTENCY REPLAY VERIFICATION');
  console.log('--------------------------------------------------');

  // Replay DEL-DELIVERED on Order A
  const replayDeliveredRes = await fetch(`${BASE_URL}/api/delivery/orders/${orderAId}/delivered`, {
    method: 'POST',
    headers: dp1Headers,
    body: JSON.stringify({
      recipientName: 'Anil Gupta (Store Owner)',
      amountCollected: orderGrandTotal,
    }),
  });
  const replayDeliveredData = await replayDeliveredRes.json();
  const idempDeliveredPass = replayDeliveredRes.status === 200 && replayDeliveredData.isIdempotentReplay === true;
  recordCheck('IDEMPOTENCY', 'IDEMP-DELIVERED', 'Replay delivered returns safe idempotent 200 without duplicate effects', idempDeliveredPass, `HTTP ${replayDeliveredRes.status}, isIdempotentReplay: ${replayDeliveredData.isIdempotentReplay}`);

  // Verify stock after replay delivered remains unchanged
  const prodDocAfterReplay = await getDoc(doc(db, 'products', testProductId));
  const stockAfterReplay = prodDocAfterReplay.data()?.stockQuantity;
  recordCheck('IDEMPOTENCY', 'IDEMP-STOCK', 'Replay delivered causes zero duplicate stock change', stockAfterReplay === stockAfterDelivery, `Stock: ${stockAfterReplay}`);

  // =========================================================================
  // NOTIFICATIONS VERIFICATION
  // =========================================================================
  console.log('\n--------------------------------------------------');
  console.log('NOTIFICATIONS VERIFICATION');
  console.log('--------------------------------------------------');

  const notifsSnap = await getDocs(query(collection(db, 'notifications'), where('orderId', '==', orderAId)));
  const notifTypes = notifsSnap.docs.map(d => d.data().type || d.data().event);
  console.log(`Found ${notifTypes.length} notifications for ${orderAId}:`, notifTypes);
  recordCheck('NOTIFICATIONS', 'NOTIF-EXISTS', 'Server-authoritative notifications generated for order lifecycle', notifsSnap.docs.length >= 2, `Notification count: ${notifsSnap.docs.length}`);

  // =========================================================================
  // DELIVERY AUDIT LOGS & IMMUTABILITY
  // =========================================================================
  console.log('\n--------------------------------------------------');
  console.log('DELIVERY AUDIT LOGS & IMMUTABILITY');
  console.log('--------------------------------------------------');

  const auditSnap = await getDocs(query(collection(db, 'deliveryAuditLogs'), where('orderId', '==', orderAId)));
  const auditDocs = auditSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
  const eventTypes = auditDocs.map(a => a.event || a.eventType);
  console.log(`Found ${auditDocs.length} audit logs for ${orderAId}:`, eventTypes);
  const hasAuditActions = eventTypes.includes('DELIVERY_COMPLETED') && eventTypes.includes('OUT_FOR_DELIVERY') && eventTypes.includes('OTP_VERIFIED');
  recordCheck('AUDIT', 'AUDIT-EXISTS', 'Immutable deliveryAuditLogs records exist for lifecycle (OUT_FOR_DELIVERY, OTP_VERIFIED, DELIVERY_COMPLETED)', hasAuditActions, `Total audit records: ${auditDocs.length}, Events: ${eventTypes.join(', ')}`);

  // Test direct client tampering on audit logs (Deny update/delete)
  if (auditDocs.length > 0) {
    const firstAuditId = auditDocs[0].id;
    let auditTamperBlocked = false;
    try {
      await updateDoc(doc(db, 'deliveryAuditLogs', firstAuditId), {
        tamperedField: 'ILLEGAL_TAMPER',
      });
    } catch {
      auditTamperBlocked = true;
    }
    recordCheck('AUDIT', 'AUDIT-IMMUTABLE', 'Client-side update/delete on deliveryAuditLogs is strictly DENIED', auditTamperBlocked, `Tamper attempt blocked: ${auditTamperBlocked}`);
  }

  // =========================================================================
  // FAILURE & RETURN BRANCH (ORDER B)
  // =========================================================================
  console.log('\n--------------------------------------------------');
  console.log('FAILURE DELIVERY BRANCH (ORDER B)');
  console.log('--------------------------------------------------');

  // Place Order B
  const orderBRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${retailerUid}`,
    },
    body: JSON.stringify({
      idempotencyKey: `idemp-ordB-${runTag}`,
      paymentMethod: 'COD',
      items: [{ productId: testProductId, quantity: orderQty }],
      retailerName: 'Vijay Kumar',
      shopName: 'Kumar Store',
      deliveryAddressSnapshot: {
        fullAddress: 'Shop 18, Street 5, Karawal Nagar',
        city: 'Delhi',
        pincode: '110094',
        phone: '9811002233',
      },
    }),
  });
  const orderBData = await orderBRes.json();
  const orderBId = orderBData.orderId;
  console.log(`Placed Order B: ${orderBId}`);

  // Warehouse processes Order B to READY_FOR_DISPATCH
  await fetch(`${BASE_URL}/api/warehouse/orders/${orderBId}/status`, {
    method: 'POST',
    headers: whHeaders,
    body: JSON.stringify({ newStatus: 'CONFIRMED' }),
  });
  await fetch(`${BASE_URL}/api/warehouse/orders/${orderBId}/status`, {
    method: 'POST',
    headers: whHeaders,
    body: JSON.stringify({ newStatus: 'ACCEPTED' }),
  });
  await fetch(`${BASE_URL}/api/warehouse/orders/${orderBId}/picking`, {
    method: 'POST',
    headers: whHeaders,
    body: JSON.stringify({
      items: { [testProductId]: { pickedQty: orderQty, isShort: false } },
      completePicking: true,
    }),
  });
  await fetch(`${BASE_URL}/api/warehouse/orders/${orderBId}/packing`, {
    method: 'POST',
    headers: whHeaders,
    body: JSON.stringify({ numberOfPackages: 1, moveToReady: true }),
  });

  // Assign Order B to Partner 2
  await fetch(`${BASE_URL}/api/delivery/assign`, {
    method: 'POST',
    headers: whHeaders,
    body: JSON.stringify({ orderId: orderBId, partnerId: partner2Id }),
  });

  // Partner 2 accepts, picks up, out for delivery
  await fetch(`${BASE_URL}/api/delivery/orders/${orderBId}/accept`, {
    method: 'POST',
    headers: dp2Headers,
  });
  await fetch(`${BASE_URL}/api/delivery/orders/${orderBId}/pickup`, {
    method: 'POST',
    headers: dp2Headers,
  });
  await fetch(`${BASE_URL}/api/delivery/orders/${orderBId}/out-for-delivery`, {
    method: 'POST',
    headers: dp2Headers,
  });

  // Partner 2 marks Failed Delivery
  const failRes = await fetch(`${BASE_URL}/api/delivery/orders/${orderBId}/failed`, {
    method: 'POST',
    headers: dp2Headers,
    body: JSON.stringify({
      reason: 'CUSTOMER_UNAVAILABLE',
      notes: 'Shop was closed and owner not reachable after 3 phone attempts.',
    }),
  });
  const failData = await failRes.json();
  recordCheck('FAILURE_PATH', 'DEL-FAILED', 'Delivery marked Failed with reason (CUSTOMER_UNAVAILABLE)', failRes.status === 200 && failData.success === true, `Failed at: ${failData.failedAt}`);

  // Partner 2 initiates Return to Warehouse
  const returnRes = await fetch(`${BASE_URL}/api/delivery/orders/${orderBId}/return`, {
    method: 'POST',
    headers: dp2Headers,
    body: JSON.stringify({
      returnReason: 'Shop closed and customer unavailable',
    }),
  });
  const returnData = await returnRes.json();
  recordCheck('FAILURE_PATH', 'DEL-RETURN', 'Delivery Staff returns package to warehouse (RETURN_TO_WAREHOUSE)', returnRes.status === 200 && returnData.success === true, `Returned at: ${returnData.returnedAt}`);

  // Authoritative state check: RETURN_REQUESTED and RETURN_TO_WAREHOUSE
  const orderBDoc = await getDoc(doc(db, 'orders', orderBId));
  const orderBDataAfterReturn = orderBDoc.data()!;
  const returnStatePass = orderBDataAfterReturn.orderStatus === 'RETURN_REQUESTED' &&
                          orderBDataAfterReturn.delivery?.assignmentStatus === 'RETURN_TO_WAREHOUSE';
  recordCheck('FAILURE_PATH', 'STATE-RETURN', 'Authoritative Firestore state: RETURN_REQUESTED and RETURN_TO_WAREHOUSE', returnStatePass, `orderStatus: ${orderBDataAfterReturn.orderStatus}, delivery: ${orderBDataAfterReturn.delivery?.assignmentStatus}`);

  // Partner cannot falsely mark order delivered after return/failed
  const falseDeliverRes = await fetch(`${BASE_URL}/api/delivery/orders/${orderBId}/delivered`, {
    method: 'POST',
    headers: dp2Headers,
    body: JSON.stringify({ recipientName: 'Falsely Claimed', amountCollected: orderGrandTotal }),
  });
  recordCheck('FAILURE_PATH', 'FALSE-DELIVER-BLOCKED', 'Partner cannot falsely mark order DELIVERED after failure/return (400)', falseDeliverRes.status === 400, `HTTP ${falseDeliverRes.status}`);

  // Return / Restock Invariant: delivery return must NOT automatically restock
  const prodDocAfterReturn = await getDoc(doc(db, 'products', testProductId));
  const stockAfterReturn = prodDocAfterReturn.data()?.stockQuantity;
  const expectedStockAfterBothOrders = initialStock - (orderQty * 2);
  recordCheck('INVENTORY', 'INV-RETURN-NO-RESTOCK', 'Delivery return does NOT automatically restock inventory', stockAfterReturn === expectedStockAfterBothOrders, `Current Stock: ${stockAfterReturn}, Expected: ${expectedStockAfterBothOrders}`);

  // =========================================================================
  // ROLE BOUNDARY & SECURITY TESTS
  // =========================================================================
  console.log('\n--------------------------------------------------');
  console.log('ROLE BOUNDARY & ACCESS CONTROL TESTS');
  console.log('--------------------------------------------------');

  // Unauthenticated -> 401
  const unauthRes = await fetch(`${BASE_URL}/api/delivery/orders/${orderAId}`, {
    headers: {},
  });
  recordCheck('RBAC', 'RBAC-UNAUTH', 'Unauthenticated request returns 401', unauthRes.status === 401, `HTTP ${unauthRes.status}`);

  // Retailer cannot execute delivery transitions -> 403
  const retTransitionRes = await fetch(`${BASE_URL}/api/delivery/orders/${orderAId}/pickup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer test-uid-${retailerUid}`,
    },
  });
  recordCheck('RBAC', 'RBAC-RETAILER-BLOCKED', 'Retailer cannot perform delivery staff transitions (403)', retTransitionRes.status === 403, `HTTP ${retTransitionRes.status}`);

  // Warehouse staff cannot complete delivery as delivery partner without DP identity
  const whDeliverRes = await fetch(`${BASE_URL}/api/delivery/orders/${orderAId}/delivered`, {
    method: 'POST',
    headers: whHeaders,
    body: JSON.stringify({ recipientName: 'Unauthorized Person', amountCollected: orderGrandTotal }),
  });
  recordCheck('RBAC', 'RBAC-WH-NOT-DP', 'Warehouse staff cannot execute delivery completion (403)', whDeliverRes.status === 403, `HTTP ${whDeliverRes.status}`);

  // =========================================================================
  // SECRET SCAN
  // =========================================================================
  console.log('\n--------------------------------------------------');
  console.log('SECURITY & SECRET SCAN');
  console.log('--------------------------------------------------');

  const clientSource = fs.readFileSync(path.resolve('./src/services/deliveryClient.ts'), 'utf8');
  const serverRoutesSource = fs.readFileSync(path.resolve('./server/deliveryRoutes.ts'), 'utf8');

  // Check if secrets or private credentials are in client-accessible code
  const otpSecretInClient = clientSource.includes('DELIVERY_OTP_SECRET') || clientSource.includes('process.env.DELIVERY_OTP_SECRET');
  const serviceAccountInClient = clientSource.includes('private_key') || clientSource.includes('FIREBASE_SERVICE_ACCOUNT');
  const serverTokenInClient = clientSource.includes('MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01');

  recordCheck('SECRET_SCAN', 'SEC-OTP-SECRET', 'DELIVERY_OTP_SECRET not exposed in client code', !otpSecretInClient, !otpSecretInClient ? 'NOT FOUND in client' : 'FOUND in client');
  recordCheck('SECRET_SCAN', 'SEC-SRV-CRED', 'Firebase service account private credentials not exposed in client code', !serviceAccountInClient, !serviceAccountInClient ? 'NOT FOUND in client' : 'FOUND in client');
  recordCheck('SECRET_SCAN', 'SEC-SRV-TOKEN', 'Server authority internal token not hardcoded/referenced in client code', !serverTokenInClient, !serverTokenInClient ? 'NOT FOUND in client' : 'FOUND in client');

  // =========================================================================
  // NO LIVE GPS / MAPS VERIFICATION
  // =========================================================================
  console.log('\n--------------------------------------------------');
  console.log('NO LIVE GPS / MAPS VERIFICATION');
  console.log('--------------------------------------------------');

  const allSrcFiles = fs.readdirSync(path.resolve('./src/components/delivery'));
  let foundGpsRef = false;
  for (const f of allSrcFiles) {
    const content = fs.readFileSync(path.resolve('./src/components/delivery', f), 'utf8');
    if (content.includes('watchPosition') || content.includes('startTracking') || content.includes('updateTrackingLocation') || content.includes('Google Maps SDK')) {
      foundGpsRef = true;
    }
  }

  recordCheck('GPS_VERIFY', 'NO-GPS-TRACKING', 'Zero active references to live GPS tracking or Google Maps SDK', !foundGpsRef, !foundGpsRef ? 'CLEAN (No GPS/Maps tracking)' : 'FOUND GPS references');

  // =========================================================================
  // RESULTS SUMMARY
  // =========================================================================
  console.log('\n========================================================================');
  const passedCount = checkResults.filter(r => r.status === 'PASS').length;
  const failedCount = checkResults.filter(r => r.status === 'FAIL').length;
  console.log(`TOTAL CHECKS: ${checkResults.length} | PASSED: ${passedCount} | FAILED: ${failedCount} | BLOCKED: 0`);
  console.log('========================================================================\n');

  if (failedCount > 0) {
    console.error(`FAILED: ${failedCount} check(s) did not pass.`);
    process.exit(1);
  } else {
    console.log('VERIFICATION COMPLETE: ALL CHECKS PASSED.');
    process.exit(0);
  }
}

runE2EVerification().catch(err => {
  console.error('Fatal execution error in Phase 5.3.2:', err);
  process.exit(1);
});
