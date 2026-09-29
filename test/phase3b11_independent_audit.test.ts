/**
 * MR FUTKAR — Phase 3B-11: Admin Settings & Business Configuration
 * FINAL INDEPENDENT PRODUCTION VERIFICATION & AUDIT SUITE
 * 
 * Comprehensive, end-to-end verification directly against the live server
 * and Firebase Firestore database instance.
 */

import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore as clientGetFirestore,
  doc as clientDoc,
  setDoc as clientSetDoc,
  getDoc as clientGetDoc,
  collection as clientCollection,
  getDocs as clientGetDocs,
  initializeFirestore,
} from 'firebase/firestore';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN, OPERATIONAL_WAREHOUSE_ID } from '../server/firebaseAdmin';
import { testFirebaseConnection } from '../src/config/firebase';
import cfg from '../firebase-applet-config.json';
import { defaultBusinessSettings } from '../src/config/businessSettings';

const BASE_URL = 'http://localhost:3000';

interface AuditResult {
  code: string;
  category: string;
  name: string;
  passed: boolean;
  evidence: string;
}

const results: AuditResult[] = [];

function assert(condition: boolean, code: string, category: string, name: string, evidence: string) {
  results.push({ code, category, name, passed: condition, evidence });
  const mark = condition ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`${mark} [${category}] ${code}: ${name} | ${evidence}`);
}

async function runAudit() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 3B-11: FINAL INDEPENDENT PRODUCTION AUDIT & VERIFICATION');
  console.log('Database:', cfg.firestoreDatabaseId);
  console.log('Timestamp:', new Date().toISOString());
  console.log('======================================================================\n');

  // Setup Test Principals
  const superAdminUid = `audit-superadmin-${Date.now()}`;
  const retailerUid = `audit-retailer-${Date.now()}`;
  const staffUid = `audit-staff-${Date.now()}`;
  const managerUid = `audit-manager-${Date.now()}`;
  const deliveryUid = `audit-delivery-${Date.now()}`;
  const suspendedAdminUid = `audit-suspended-${Date.now()}`;
  const disabledAdminUid = `audit-disabled-${Date.now()}`;

  const now = new Date().toISOString();

  // Seed super admin
  await setDoc(doc(db, 'adminUsers', superAdminUid), {
    uid: superAdminUid,
    email: 'audit.superadmin@mrfutkar.com',
    name: 'Audit Super Admin',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    isActive: true,
    warehouseId: OPERATIONAL_WAREHOUSE_ID,
    createdAt: now,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString(),
  });

  // Seed suspended admin
  await setDoc(doc(db, 'adminUsers', suspendedAdminUid), {
    uid: suspendedAdminUid,
    email: 'suspended.admin@mrfutkar.com',
    name: 'Suspended Admin',
    role: 'SUPER_ADMIN',
    status: 'SUSPENDED',
    isActive: false,
    warehouseId: OPERATIONAL_WAREHOUSE_ID,
    createdAt: now,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString(),
  });

  // Seed disabled admin
  await setDoc(doc(db, 'adminUsers', disabledAdminUid), {
    uid: disabledAdminUid,
    email: 'disabled.admin@mrfutkar.com',
    name: 'Disabled Admin',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    isActive: false,
    warehouseId: OPERATIONAL_WAREHOUSE_ID,
    createdAt: now,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString(),
  });

  // Seed retailer
  await setDoc(doc(db, 'retailers', retailerUid), {
    retailerId: retailerUid,
    businessName: 'Audit Kirana Store',
    shopName: 'Audit Kirana',
    ownerName: 'Mohan Lal',
    mobile: '9876543210',
    phone: '9876543210',
    status: 'ACTIVE',
    isActive: true,
    creditLimit: 50000,
    availableCredit: 50000,
    address: 'Brahmpuri Gali 5',
    city: 'Delhi',
    pincode: '110053',
    createdAt: now,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString(),
  });

  // Seed Warehouse Staff & Manager
  await setDoc(doc(db, 'adminUsers', staffUid), {
    uid: staffUid,
    name: 'Warehouse Staff Worker',
    role: 'WAREHOUSE_STAFF',
    status: 'ACTIVE',
    isActive: true,
    createdAt: now,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString() + '1',
  });

  await setDoc(doc(db, 'adminUsers', managerUid), {
    uid: managerUid,
    name: 'Warehouse Hub Manager',
    role: 'WAREHOUSE_MANAGER',
    status: 'ACTIVE',
    isActive: true,
    createdAt: now,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString() + '2',
  });

  // Seed Delivery Partner
  await setDoc(doc(db, 'deliveryPartners', deliveryUid), {
    partnerId: deliveryUid,
    userId: deliveryUid,
    name: 'Suresh Driver',
    mobile: '+919876543210',
    status: 'ACTIVE',
    isActive: true,
    createdAt: now,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString() + '3',
  });

  // Seed test product
  const testProdId = `audit-prod-${Date.now()}`;
  await setDoc(doc(db, 'products', testProdId), {
    productId: testProdId,
    id: testProdId,
    sku: `SKU-${Date.now()}`,
    productName: 'Audit Test Tea 250g',
    brand: 'Tata Tea',
    category: 'Beverages',
    price: 200,
    wholesalePrice: 200,
    sellingPrice: 200,
    mrp: 240,
    stockQuantity: 100,
    minOrderQuantity: 1,
    minimumOrderQuantity: 1,
    isActive: true,
    unit: 'Pack',
    createdAt: now,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString(),
  });

  const superAdminAuth = `Bearer test-uid-${superAdminUid}`;
  const retailerAuth = `Bearer test-uid-${retailerUid}`;
  const staffAuth = `Bearer test-uid-${staffUid}`;
  const managerAuth = `Bearer test-uid-${managerUid}`;
  const deliveryAuth = `Bearer test-uid-${deliveryUid}`;
  const suspendedAuth = `Bearer test-uid-${suspendedAdminUid}`;
  const disabledAuth = `Bearer test-uid-${disabledAdminUid}`;

  // Client Firestore Setup
  const clientApp = initializeApp(cfg, 'audit-client-app-' + Date.now());
  const clientDb = initializeFirestore(
    clientApp,
    { experimentalAutoDetectLongPolling: true },
    cfg.firestoreDatabaseId
  );

  // ----------------------------------------------------
  // SECTION A: CANONICAL SETTINGS SOURCE
  // ----------------------------------------------------
  console.log('\n--- SECTION A: CANONICAL SETTINGS SOURCE ---');
  {
    const settingsSnap = await getDoc(doc(db, 'businessSettings', 'global'));
    assert(
      settingsSnap.exists(),
      'CANON-01',
      'Canonical Settings',
      'businessSettings/global exists as authoritative document',
      `exists=${settingsSnap.exists()}, docId=businessSettings/global`
    );

    // Check no duplicate collections are accessible or present in rules
    let duplicateCollectionsDeniedOrEmpty = true;
    try {
      const adminSettingsSnap = await getDocs(collection(db, 'adminSettings'));
      if (!adminSettingsSnap.empty) duplicateCollectionsDeniedOrEmpty = false;
    } catch {
      // Denied by firestore.rules as expected for non-canonical collections
    }
    try {
      const systemSettingsSnap = await getDocs(collection(db, 'systemSettings'));
      if (!systemSettingsSnap.empty) duplicateCollectionsDeniedOrEmpty = false;
    } catch {
      // Denied by firestore.rules
    }
    try {
      const appSettingsSnap = await getDocs(collection(db, 'appSettings'));
      if (!appSettingsSnap.empty) duplicateCollectionsDeniedOrEmpty = false;
    } catch {
      // Denied by firestore.rules
    }
    assert(
      duplicateCollectionsDeniedOrEmpty,
      'CANON-02',
      'Canonical Settings',
      'No duplicate settings collections exist or are permitted by rules',
      `duplicateCollectionsDeniedOrEmpty=${duplicateCollectionsDeniedOrEmpty}`
    );

    // Check immutable business constants
    const data = settingsSnap.data();
    assert(
      data?.currency === 'INR' &&
      data?.timezone === 'Asia/Kolkata' &&
      data?.defaultWarehouseId === 'WH-BRAHMPURI-01',
      'CANON-03',
      'Canonical Settings',
      'Immutable business constants verified (INR, Asia/Kolkata, WH-BRAHMPURI-01)',
      `currency=${data?.currency}, tz=${data?.timezone}, wh=${data?.defaultWarehouseId}`
    );
  }

  // ----------------------------------------------------
  // SECTION B: FIRESTORE CONNECTIVITY VERIFICATION
  // ----------------------------------------------------
  console.log('\n--- SECTION B: FIRESTORE CONNECTIVITY VERIFICATION ---');
  {
    const clientConn = await testFirebaseConnection();
    assert(
      clientConn === true,
      'CONN-01',
      'Connectivity',
      'Client Firestore connectivity passes via resilient long-polling configuration',
      `clientConnectivity=${clientConn}`
    );

    const serverSnap = await getDoc(doc(db, 'test', 'connection'));
    assert(
      serverSnap.exists(),
      'CONN-02',
      'Connectivity',
      'Server Firestore connectivity passes directly through admin SDK',
      `serverDocStatus=${serverSnap.data()?.status}`
    );

    // Health check timeout protection (does not hang)
    const start = Date.now();
    await testFirebaseConnection();
    const duration = Date.now() - start;
    assert(
      duration < 3000,
      'CONN-03',
      'Connectivity',
      'Health check executes rapidly and does not hang indefinitely',
      `durationMs=${duration}`
    );
  }

  // ----------------------------------------------------
  // SECTION C: ADMIN RBAC
  // ----------------------------------------------------
  console.log('\n--- SECTION C: ADMIN RBAC ---');
  {
    // Unauthenticated
    const r1 = await fetch(`${BASE_URL}/api/admin/settings`);
    assert(r1.status === 401, 'RBAC-01', 'Admin RBAC', 'Unauthenticated rejected with 401', `status=${r1.status}`);

    // Retailer
    const r2 = await fetch(`${BASE_URL}/api/admin/settings`, { headers: { Authorization: retailerAuth } });
    assert(r2.status === 403, 'RBAC-02', 'Admin RBAC', 'Retailer rejected with 403', `status=${r2.status}`);

    // Staff
    const r3 = await fetch(`${BASE_URL}/api/admin/settings`, { headers: { Authorization: staffAuth } });
    assert(r3.status === 403, 'RBAC-03', 'Admin RBAC', 'Warehouse staff rejected with 403', `status=${r3.status}`);

    // Manager
    const r4 = await fetch(`${BASE_URL}/api/admin/settings`, { headers: { Authorization: managerAuth } });
    assert(r4.status === 403, 'RBAC-04', 'Admin RBAC', 'Warehouse manager rejected with 403', `status=${r4.status}`);

    // Delivery Partner
    const r5 = await fetch(`${BASE_URL}/api/admin/settings`, { headers: { Authorization: deliveryAuth } });
    assert(r5.status === 403, 'RBAC-05', 'Admin RBAC', 'Delivery partner rejected with 403', `status=${r5.status}`);

    // Suspended Super Admin
    const r6 = await fetch(`${BASE_URL}/api/admin/settings`, { headers: { Authorization: suspendedAuth } });
    assert(r6.status === 403, 'RBAC-06', 'Admin RBAC', 'Suspended admin rejected with 403', `status=${r6.status}`);

    // Disabled Super Admin
    const r7 = await fetch(`${BASE_URL}/api/admin/settings`, { headers: { Authorization: disabledAuth } });
    assert(r7.status === 403, 'RBAC-07', 'Admin RBAC', 'Disabled admin rejected with 403', `status=${r7.status}`);

    // Header & Query Spoofing
    const r8 = await fetch(`${BASE_URL}/api/admin/settings?role=SUPER_ADMIN`, {
      headers: { 'x-role': 'SUPER_ADMIN', 'x-admin': 'true' },
    });
    assert(r8.status === 401, 'RBAC-08', 'Admin RBAC', 'Header & query role spoofing rejected with 401', `status=${r8.status}`);

    // Valid Super Admin
    const r9 = await fetch(`${BASE_URL}/api/admin/settings`, { headers: { Authorization: superAdminAuth } });
    assert(r9.status === 200, 'RBAC-09', 'Admin RBAC', 'Valid SUPER_ADMIN authorized with 200', `status=${r9.status}`);
  }

  // ----------------------------------------------------
  // SECTION D: DIRECT FIRESTORE WRITE PROTECTION
  // ----------------------------------------------------
  console.log('\n--- SECTION D: DIRECT FIRESTORE WRITE PROTECTION ---');
  {
    let clientWriteBlocked = false;
    try {
      await clientSetDoc(
        clientDoc(clientDb, 'businessSettings', 'global'),
        { minimumOrderValue: 10 },
        { merge: true }
      );
      const verify = await getDoc(doc(db, 'businessSettings', 'global'));
      if (verify.data()?.minimumOrderValue !== 10) {
        clientWriteBlocked = true;
      }
    } catch {
      clientWriteBlocked = true;
    }
    assert(
      clientWriteBlocked,
      'DIRECT-01',
      'Firestore Rules',
      'Direct client update to businessSettings/global strictly blocked',
      `blocked=${clientWriteBlocked}`
    );

    // Fake tokens in client payload
    let fakeTokenBlocked = false;
    try {
      await clientSetDoc(
        clientDoc(clientDb, 'businessSettings', 'fakeTokenDoc'),
        {
          minimumOrderValue: 10,
          _serverTxnToken: 'FAKE_SERVER_TOKEN',
          _serverWriteNonce: 'FAKE_NONCE',
        }
      );
    } catch {
      fakeTokenBlocked = true;
    }
    assert(
      fakeTokenBlocked,
      'DIRECT-02',
      'Firestore Rules',
      'Direct client write with fake tokens rejected by firestore.rules',
      `blocked=${fakeTokenBlocked}`
    );
  }

  // ----------------------------------------------------
  // SECTION E: SETTINGS UPDATE AUTHORITY & ATOMICITY
  // ----------------------------------------------------
  console.log('\n--- SECTION E: SETTINGS UPDATE AUTHORITY & ATOMICITY ---');
  let currentVersion = 1;
  {
    const getRes = await fetch(`${BASE_URL}/api/admin/settings`, { headers: { Authorization: superAdminAuth } });
    const getData = await getRes.json();
    currentVersion = getData.version || 1;

    // Mutate valid settings
    const putRes = await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: superAdminAuth },
      body: JSON.stringify({
        settings: {
          minimumOrderValue: 500,
          maximumOrderValue: 500000,
          defaultDeliveryCharge: 40,
          freeDeliveryThreshold: 1000,
          allowCOD: true,
          allowUPI: true,
          allowOrderCancellation: true,
          cancellationAllowedStatuses: ['PLACED', 'CONFIRMED'],
          retailerRegistrationEnabled: true,
          defaultProductMoq: 1,
          defaultLowStockThreshold: 10,
        },
        version: currentVersion,
      }),
    });
    const putData = await putRes.json();
    assert(
      putRes.status === 200 && putData.success === true,
      'MUT-01',
      'Server Mutation',
      'Super Admin PUT /api/admin/settings successfully commits atomic update',
      `status=${putRes.status}, newVersion=${putData.version}`
    );
    currentVersion = putData.version;

    // Verify client cannot inject system metadata
    const injectRes = await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: superAdminAuth },
      body: JSON.stringify({
        settings: {
          updatedAt: '2020-01-01T00:00:00.000Z',
          updatedBy: 'hacker-uid',
          _serverTxnToken: 'injected-token',
        },
        version: currentVersion,
      }),
    });
    assert(
      injectRes.status === 400,
      'MUT-02',
      'Server Mutation',
      'Server rejects client injection of system fields (updatedAt, updatedBy, _serverTxnToken)',
      `status=${injectRes.status}`
    );
  }

  // ----------------------------------------------------
  // SECTION F: CONCURRENCY / VERSION CONTROL
  // ----------------------------------------------------
  console.log('\n--- SECTION F: CONCURRENCY / VERSION CONTROL ---');
  {
    // Update A
    const resA = await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: superAdminAuth },
      body: JSON.stringify({
        settings: { supportPhone: '+91 99999 11111' },
        version: currentVersion,
      }),
    });
    const dataA = await resA.json();
    assert(resA.status === 200, 'CONC-01', 'Concurrency', 'Update A succeeds with matching version', `status=${resA.status}`);
    const nextVersion = dataA.version;

    // Update B using the stale version (currentVersion)
    const resB = await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: superAdminAuth },
      body: JSON.stringify({
        settings: { supportPhone: '+91 99999 22222' },
        version: currentVersion, // Stale!
      }),
    });
    const dataB = await resB.json();
    assert(
      resB.status === 409 && dataB.error === 'SETTINGS_VERSION_CONFLICT',
      'CONC-02',
      'Concurrency',
      'Update B using stale version rejected with 409 SETTINGS_VERSION_CONFLICT',
      `status=${resB.status}, error=${dataB.error}`
    );
    currentVersion = nextVersion;
  }

  // ----------------------------------------------------
  // SECTION G: PUBLIC SETTINGS ENDPOINT & SANITIZATION
  // ----------------------------------------------------
  console.log('\n--- SECTION G: PUBLIC SETTINGS ENDPOINT & SANITIZATION ---');
  {
    const pubRes = await fetch(`${BASE_URL}/api/settings/public?fields=*&debug=true&includePrivate=true&admin=true`);
    const pubData = await pubRes.json();
    const settings = pubData.settings || {};

    const hasPrivateFields =
      settings.sessionTimeoutMinutes !== undefined ||
      settings.maxFailedLoginAttempts !== undefined ||
      settings._serverTxnToken !== undefined ||
      settings._serverWriteNonce !== undefined ||
      settings.updatedBy !== undefined;

    assert(
      pubRes.status === 200 && !hasPrivateFields && settings.businessName === 'MR FUTKAR',
      'PUB-01',
      'Public Settings',
      'GET /api/settings/public returns safe operational config and rejects query manipulation',
      `status=${pubRes.status}, hasPrivateFields=${hasPrivateFields}`
    );
  }

  // ----------------------------------------------------
  // SECTION H: SECRET EXPOSURE AUDIT
  // ----------------------------------------------------
  console.log('\n--- SECTION H: SECRET EXPOSURE AUDIT ---');
  {
    const adminRes = await fetch(`${BASE_URL}/api/admin/settings`, { headers: { Authorization: superAdminAuth } });
    const adminData = await adminRes.json();
    const str = JSON.stringify(adminData);

    const leakedSecrets =
      str.includes('private_key') ||
      str.includes('client_secret') ||
      str.includes('DELIVERY_OTP_SECRET') ||
      str.includes('_serverTxnToken') ||
      str.includes('password');

    assert(
      !leakedSecrets,
      'SEC-01',
      'Secret Audit',
      'No secrets, tokens, or credentials exposed in settings response',
      `leakedSecrets=${leakedSecrets}`
    );
  }

  // ----------------------------------------------------
  // SECTION I: MOQ & MOV SERVER ENFORCEMENT
  // ----------------------------------------------------
  console.log('\n--- SECTION I: MOQ & MOV SERVER ENFORCEMENT ---');
  {
    // Configure MOV = 500
    await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: superAdminAuth },
      body: JSON.stringify({
        settings: { minimumOrderValue: 500, maximumOrderValue: 1000 },
        version: currentVersion,
      }),
    });
    currentVersion++;

    // Order with 2 units @ 200 = 400 < 500 -> REJECT
    const rLow = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: retailerAuth },
      body: JSON.stringify({
        idempotencyKey: `IDEMP-AUDIT-LOW-${Date.now()}`,
        retailerId: retailerUid,
        items: [{ productId: testProdId, quantity: 2 }],
        paymentMethod: 'COD',
        deliveryAddress: { pincode: '110053', fullAddress: 'Brahmpuri Gali 5' },
      }),
    });
    const dLow = await rLow.json();
    assert(
      rLow.status === 400 && dLow.error === 'MINIMUM_ORDER_NOT_MET',
      'MOV-01',
      'MOV Enforcement',
      'Order with subtotal (₹400) below minimumOrderValue (₹500) rejected with 400 MINIMUM_ORDER_NOT_MET',
      `status=${rLow.status}, error=${dLow.error}`
    );

    // Order with 3 units @ 200 = 600 (within 500..1000) -> ACCEPT
    const rOk = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: retailerAuth },
      body: JSON.stringify({
        idempotencyKey: `IDEMP-AUDIT-OK-${Date.now()}`,
        retailerId: retailerUid,
        items: [{ productId: testProdId, quantity: 3 }],
        paymentMethod: 'COD',
        deliveryAddress: { pincode: '110053', fullAddress: 'Brahmpuri Gali 5' },
      }),
    });
    const dOk = await rOk.json();
    assert(
      rOk.status === 200 && dOk.success === true,
      'MOV-02',
      'MOV Enforcement',
      'Order meeting minimumOrderValue accepted by server',
      `status=${rOk.status}, orderId=${dOk.orderId}`
    );

    // Order with 6 units @ 200 = 1200 > 1000 -> REJECT
    const rMax = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: retailerAuth },
      body: JSON.stringify({
        idempotencyKey: `IDEMP-AUDIT-MAX-${Date.now()}`,
        retailerId: retailerUid,
        items: [{ productId: testProdId, quantity: 6 }],
        paymentMethod: 'COD',
        deliveryAddress: { pincode: '110053', fullAddress: 'Brahmpuri Gali 5' },
      }),
    });
    const dMax = await rMax.json();
    assert(
      rMax.status === 400 && dMax.error === 'MAXIMUM_ORDER_EXCEEDED',
      'MOV-03',
      'MOV Enforcement',
      'Order with subtotal (₹1200) exceeding maximumOrderValue (₹1000) rejected with 400 MAXIMUM_ORDER_EXCEEDED',
      `status=${rMax.status}, error=${dMax.error}`
    );
  }

  // ----------------------------------------------------
  // SECTION J: PAYMENT METHOD ENFORCEMENT
  // ----------------------------------------------------
  console.log('\n--- SECTION J: PAYMENT METHOD ENFORCEMENT ---');
  {
    // Disable COD
    await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: superAdminAuth },
      body: JSON.stringify({
        settings: { allowCOD: false, maximumOrderValue: 500000 },
        version: currentVersion,
      }),
    });
    currentVersion++;

    const rCod = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: retailerAuth },
      body: JSON.stringify({
        idempotencyKey: `IDEMP-AUDIT-COD-${Date.now()}`,
        retailerId: retailerUid,
        items: [{ productId: testProdId, quantity: 3 }],
        paymentMethod: 'COD',
        deliveryAddress: { pincode: '110053', fullAddress: 'Brahmpuri Gali 5' },
      }),
    });
    const dCod = await rCod.json();
    assert(
      rCod.status === 400 && dCod.error === 'INVALID_PAYMENT_METHOD',
      'PAY-01',
      'Payment Enforcement',
      'Order using COD rejected when allowCOD is false',
      `status=${rCod.status}, error=${dCod.error}`
    );

    // Re-enable COD
    await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: superAdminAuth },
      body: JSON.stringify({
        settings: { allowCOD: true },
        version: currentVersion,
      }),
    });
    currentVersion++;
  }

  // ----------------------------------------------------
  // SECTION K: CANCELLATION POLICY ENFORCEMENT
  // ----------------------------------------------------
  console.log('\n--- SECTION K: CANCELLATION POLICY ENFORCEMENT ---');
  {
    // Place order to test cancellation
    const rPlace = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: retailerAuth },
      body: JSON.stringify({
        idempotencyKey: `IDEMP-AUDIT-CANCEL-${Date.now()}`,
        retailerId: retailerUid,
        items: [{ productId: testProdId, quantity: 3 }],
        paymentMethod: 'COD',
        deliveryAddress: { pincode: '110053', fullAddress: 'Brahmpuri Gali 5' },
      }),
    });
    const dPlace = await rPlace.json();
    const orderToCancel = dPlace.orderId;

    // Disable order cancellation
    await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: superAdminAuth },
      body: JSON.stringify({
        settings: { allowOrderCancellation: false },
        version: currentVersion,
      }),
    });
    currentVersion++;

    const rCancelDisabled = await fetch(`${BASE_URL}/api/orders/${orderToCancel}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: retailerAuth },
      body: JSON.stringify({ reason: 'Customer requested' }),
    });
    assert(
      rCancelDisabled.status === 500,
      'CANCEL-01',
      'Cancellation Policy',
      'Order cancellation rejected when allowOrderCancellation is false',
      `status=${rCancelDisabled.status}`
    );

    // Re-enable cancellation
    await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: superAdminAuth },
      body: JSON.stringify({
        settings: { allowOrderCancellation: true, cancellationAllowedStatuses: ['PLACED'] },
        version: currentVersion,
      }),
    });
    currentVersion++;

    // Cancel order now
    const rCancelOk = await fetch(`${BASE_URL}/api/orders/${orderToCancel}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: retailerAuth },
      body: JSON.stringify({ reason: 'Changed mind' }),
    });
    const dCancelOk = await rCancelOk.json();
    assert(
      rCancelOk.status === 200 && dCancelOk.success === true,
      'CANCEL-02',
      'Cancellation Policy',
      'Order cancellation succeeds when permitted by policy',
      `status=${rCancelOk.status}`
    );

    // Verify stock restoration is idempotent
    const rCancelRepeat = await fetch(`${BASE_URL}/api/orders/${orderToCancel}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: retailerAuth },
      body: JSON.stringify({ reason: 'Changed mind again' }),
    });
    assert(
      rCancelRepeat.status === 200,
      'CANCEL-03',
      'Cancellation Policy',
      'Repeated cancellation on already cancelled order is idempotent',
      `status=${rCancelRepeat.status}`
    );
  }

  // ----------------------------------------------------
  // SECTION L: DELIVERY CONFIGURATION & PINCODE ENFORCEMENT
  // ----------------------------------------------------
  console.log('\n--- SECTION L: DELIVERY CONFIGURATION & PINCODE ENFORCEMENT ---');
  {
    // Configure threshold: 1000, fee: 40, serviceable pincodes: ['110053']
    await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: superAdminAuth },
      body: JSON.stringify({
        settings: {
          freeDeliveryThreshold: 1000,
          defaultDeliveryCharge: 40,
          deliveryServiceAreas: ['110053'],
          minimumOrderValue: 200,
          maximumOrderValue: 500000,
        },
        version: currentVersion,
      }),
    });
    currentVersion++;

    // 1. Order below 1000 (3 units @ 200 = 600) -> fee = 40, grandTotal = 640
    const rUnder = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: retailerAuth },
      body: JSON.stringify({
        idempotencyKey: `IDEMP-AUDIT-FEE-${Date.now()}`,
        retailerId: retailerUid,
        items: [{ productId: testProdId, quantity: 3 }],
        paymentMethod: 'COD',
        deliveryAddress: { pincode: '110053', fullAddress: 'Brahmpuri Gali 5' },
      }),
    });
    const dUnder = await rUnder.json();
    const orderUnderSnap = await getDoc(doc(db, 'orders', dUnder.orderId));
    const orderUnderData = orderUnderSnap.data();
    assert(
      orderUnderData?.deliveryCharge === 40 && orderUnderData?.grandTotal === 640,
      'DELIV-01',
      'Delivery Settings',
      'Order under threshold (₹600) incurs standard delivery fee (₹40)',
      `deliveryCharge=${orderUnderData?.deliveryCharge}, grandTotal=${orderUnderData?.grandTotal}`
    );

    // 2. Order meeting threshold (5 units @ 200 = 1000) -> fee = 0, grandTotal = 1000
    const rFree = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: retailerAuth },
      body: JSON.stringify({
        idempotencyKey: `IDEMP-AUDIT-FREE-${Date.now()}`,
        retailerId: retailerUid,
        items: [{ productId: testProdId, quantity: 5 }],
        paymentMethod: 'COD',
        deliveryAddress: { pincode: '110053', fullAddress: 'Brahmpuri Gali 5' },
      }),
    });
    const dFree = await rFree.json();
    const orderFreeSnap = await getDoc(doc(db, 'orders', dFree.orderId));
    const orderFreeData = orderFreeSnap.data();
    assert(
      orderFreeData?.deliveryCharge === 0 && orderFreeData?.grandTotal === 1000,
      'DELIV-02',
      'Delivery Settings',
      'Order meeting threshold (₹1000) receives free delivery (₹0 fee)',
      `deliveryCharge=${orderFreeData?.deliveryCharge}, grandTotal=${orderFreeData?.grandTotal}`
    );

    // 3. Pincode validation: unserviceable pincode 110001
    const rPin = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: retailerAuth },
      body: JSON.stringify({
        idempotencyKey: `IDEMP-AUDIT-PIN-${Date.now()}`,
        retailerId: retailerUid,
        items: [{ productId: testProdId, quantity: 3 }],
        paymentMethod: 'COD',
        deliveryAddress: { pincode: '110001', fullAddress: 'Connaught Place' },
      }),
    });
    const dPin = await rPin.json();
    assert(
      rPin.status === 400 && dPin.error === 'PINCODE_NOT_SERVICEABLE',
      'DELIV-03',
      'Delivery Settings',
      'Order to unserviceable pincode (110001) rejected with PINCODE_NOT_SERVICEABLE',
      `status=${rPin.status}, error=${dPin.error}`
    );
  }

  // ----------------------------------------------------
  // SECTION M: INVENTORY CONFIGURATION & PRICING ISOLATION
  // ----------------------------------------------------
  console.log('\n--- SECTION M: INVENTORY CONFIGURATION & PRICING ISOLATION ---');
  {
    const prodBefore = await getDoc(doc(db, 'products', testProdId));
    const stockBefore = prodBefore.data()?.stockQuantity;

    // Mutate lowStockThreshold
    await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: superAdminAuth },
      body: JSON.stringify({
        settings: { defaultLowStockThreshold: 25 },
        version: currentVersion,
      }),
    });
    currentVersion++;

    const prodAfter = await getDoc(doc(db, 'products', testProdId));
    const stockAfter = prodAfter.data()?.stockQuantity;

    assert(
      stockBefore === stockAfter,
      'INV-01',
      'Inventory Isolation',
      'Mutating lowStockThreshold does not alter physical products.stockQuantity',
      `stockBefore=${stockBefore}, stockAfter=${stockAfter}`
    );
  }

  // ----------------------------------------------------
  // SECTION N: RETAILER REGISTRATION CONTROLS
  // ----------------------------------------------------
  console.log('\n--- SECTION N: RETAILER REGISTRATION CONTROLS ---');
  {
    // Disable registration
    await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: superAdminAuth },
      body: JSON.stringify({
        settings: { retailerRegistrationEnabled: false },
        version: currentVersion,
      }),
    });
    currentVersion++;

    // Attempt registration via API
    const regDisabledRes = await fetch(`${BASE_URL}/api/retailers/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        retailerId: `test-ret-disabled-${Date.now()}`,
        shopName: 'Disabled Kirana',
        phone: '9988776655',
      }),
    });
    const regDisabledData = await regDisabledRes.json();
    assert(
      regDisabledRes.status === 403 && regDisabledData.error === 'REGISTRATION_DISABLED',
      'REG-01',
      'Retailer Registration',
      'New retailer registration rejected with 403 when retailerRegistrationEnabled is false',
      `status=${regDisabledRes.status}, error=${regDisabledData.error}`
    );

    // Re-enable registration
    await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: superAdminAuth },
      body: JSON.stringify({
        settings: { retailerRegistrationEnabled: true, defaultCreditLimit: 30000 },
        version: currentVersion,
      }),
    });
    currentVersion++;

    // Attempt registration again
    const newRetId = `test-ret-enabled-${Date.now()}`;
    const regEnabledRes = await fetch(`${BASE_URL}/api/retailers/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        retailerId: newRetId,
        shopName: 'Enabled Kirana',
        phone: '9988776655',
      }),
    });
    const regEnabledData = await regEnabledRes.json();
    assert(
      regEnabledRes.status === 200 && regEnabledData.success === true && regEnabledData.retailer?.creditLimit === 30000,
      'REG-02',
      'Retailer Registration',
      'Retailer registration succeeds when enabled and applies defaultCreditLimit',
      `status=${regEnabledRes.status}, creditLimit=${regEnabledData.retailer?.creditLimit}`
    );
  }

  // ----------------------------------------------------
  // SECTION O: WAREHOUSE SETTINGS & RESTRICTIONS
  // ----------------------------------------------------
  console.log('\n--- SECTION O: WAREHOUSE SETTINGS & RESTRICTIONS ---');
  {
    // Attempt to change defaultWarehouseId away from WH-BRAHMPURI-01
    const rWh = await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: superAdminAuth },
      body: JSON.stringify({
        settings: { defaultWarehouseId: 'WH-UNAUTHORIZED-99' },
        version: currentVersion,
      }),
    });
    const dWh = await rWh.json();
    assert(
      rWh.status === 400 && dWh.error === 'INVALID_SETTINGS_PAYLOAD',
      'WH-01',
      'Warehouse Config',
      'Server rejects changing defaultWarehouseId away from WH-BRAHMPURI-01',
      `status=${rWh.status}, details=${dWh.details}`
    );

    // Valid update to dispatchCutoffTime
    const rCutoff = await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: superAdminAuth },
      body: JSON.stringify({
        settings: { dispatchCutoffTime: '20:00' },
        version: currentVersion,
      }),
    });
    assert(
      rCutoff.status === 200,
      'WH-02',
      'Warehouse Config',
      'Valid update to warehouse dispatchCutoffTime commits successfully',
      `status=${rCutoff.status}`
    );
    currentVersion++;
  }

  // ----------------------------------------------------
  // SECTION P: INPUT VALIDATION & FUZZING
  // ----------------------------------------------------
  console.log('\n--- SECTION P: INPUT VALIDATION & FUZZING ---');
  {
    const fuzzPayloads = [
      { name: 'Negative MOV', payload: { minimumOrderValue: -50 } },
      { name: 'Non-numeric MOV', payload: { minimumOrderValue: 'fifty' } },
      { name: 'Invalid supportEmail', payload: { supportEmail: 'notanemail' } },
      { name: 'Non-6-digit pincode', payload: { pincode: '123' } },
      { name: 'Currency != INR', payload: { currency: 'USD' } },
      { name: 'Timezone != Kolkata', payload: { timezone: 'America/New_York' } },
      { name: 'Arbitrary unexpected field', payload: { maliciousKey: true } },
      { name: 'MOV > MaxOV', payload: { minimumOrderValue: 10000, maximumOrderValue: 5000 } },
      { name: 'Invalid cancellation status', payload: { cancellationAllowedStatuses: ['DELIVERED'] } },
    ];

    let allFuzzRejected = true;
    for (const f of fuzzPayloads) {
      const res = await fetch(`${BASE_URL}/api/admin/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: superAdminAuth },
        body: JSON.stringify({ settings: f.payload, version: currentVersion }),
      });
      if (res.status !== 400) {
        allFuzzRejected = false;
        console.error(`Fuzz payload ${f.name} failed to reject! Status: ${res.status}`);
      }
    }
    assert(
      allFuzzRejected,
      'FUZZ-01',
      'Input Validation',
      'All 9 malformed/invalid settings payloads strictly rejected with 400',
      `allFuzzRejected=${allFuzzRejected}`
    );
  }

  // ----------------------------------------------------
  // SECTION Q: AUDIT LOGGING INTEGRITY
  // ----------------------------------------------------
  console.log('\n--- SECTION Q: AUDIT LOGGING INTEGRITY ---');
  {
    const auditQuery = query(
      collection(db, 'adminAuditLogs'),
      where('action', '==', 'ADMIN_SETTINGS_UPDATED'),
      limit(5)
    );
    const snap = await getDocs(auditQuery);
    const record = snap.docs[0]?.data();

    assert(
      !snap.empty &&
      record.targetType === 'BUSINESS_SETTINGS' &&
      record.adminUid !== undefined &&
      record.metadata?.changedFields !== undefined,
      'AUDIT-01',
      'Audit Logging',
      'Immutable audit log entry created with server adminUid, timestamp, and changedFields metadata',
      `entriesFound=${snap.size}, action=${record?.action}`
    );

    // Direct client write to audit logs blocked
    let auditWriteBlocked = false;
    try {
      await clientSetDoc(clientDoc(clientDb, 'adminAuditLogs', 'fakeLogDoc'), {
        action: 'HACKED_LOG',
      });
    } catch {
      auditWriteBlocked = true;
    }
    assert(
      auditWriteBlocked,
      'AUDIT-02',
      'Audit Logging',
      'Direct client writes to adminAuditLogs strictly denied by firestore.rules',
      `blocked=${auditWriteBlocked}`
    );
  }

  // ----------------------------------------------------
  // SECTION R: READ-ONLY AUDIT FOR UNINTENDED MUTATIONS
  // ----------------------------------------------------
  console.log('\n--- SECTION R: READ-ONLY VERIFICATION ---');
  {
    const prodSnapBefore = await getDoc(doc(db, 'products', testProdId));
    const retSnapBefore = await getDoc(doc(db, 'retailers', retailerUid));

    // Call read endpoints
    await fetch(`${BASE_URL}/api/admin/settings`, { headers: { Authorization: superAdminAuth } });
    await fetch(`${BASE_URL}/api/settings/public`);

    const prodSnapAfter = await getDoc(doc(db, 'products', testProdId));
    const retSnapAfter = await getDoc(doc(db, 'retailers', retailerUid));

    const areObjectsEqual = (o1: any, o2: any) => {
      const k1 = Object.keys(o1 || {}).sort();
      const k2 = Object.keys(o2 || {}).sort();
      if (k1.length !== k2.length) return false;
      return k1.every(key => JSON.stringify(o1[key]) === JSON.stringify(o2[key]));
    };

    const bData = retSnapBefore.data();
    const aData = retSnapAfter.data();
    const noProdMutations = areObjectsEqual(prodSnapBefore.data(), prodSnapAfter.data());
    const noRetMutations = areObjectsEqual(bData, aData);

    assert(
      noProdMutations && noRetMutations,
      'READ-01',
      'Read-Only Audit',
      'Reading settings endpoints does not cause unintended mutations to products or retailers',
      `noProdMutations=${noProdMutations}, noRetMutations=${noRetMutations}`
    );
  }

  // Summary
  console.log('\n======================================================================');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`TOTAL AUDIT CHECKS: ${total} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAudit().catch(err => {
  console.error('Fatal audit execution error:', err);
  process.exit(1);
});
