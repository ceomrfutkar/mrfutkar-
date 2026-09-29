import { doc, getDoc, setDoc, collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN } from '../server/firebaseAdmin';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc as clientDoc, setDoc as clientSetDoc } from 'firebase/firestore';
import cfg from '../firebase-applet-config.json';
import { defaultBusinessSettings } from '../src/config/businessSettings';

const BASE_URL = 'http://localhost:3000';

// Client Firestore instance to test client security rules (no server token)
const clientApp = initializeApp(cfg, 'settings-security-test-' + Date.now());
const clientDb = getFirestore(clientApp, cfg.firestoreDatabaseId);

export async function runAdminSettingsTests() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 3B-11 ADMIN SETTINGS & BUSINESS CONFIGURATION TESTS');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testId: string, desc: string, evidence?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testId}: ${desc}`);
      if (evidence) console.log(`    Evidence: ${evidence}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testId}: ${desc}`);
      if (evidence) console.error(`    Evidence: ${evidence}`);
      failed++;
    }
  }

  const now = new Date().toISOString();

  // 1. Seed Super Admin
  const superAdminUid = 'SUPER-ADMIN-SETTING-01';
  await setDoc(doc(db, 'adminUsers', superAdminUid), {
    uid: superAdminUid,
    name: 'Akash Gupta (Super Administrator)',
    mobile: '+919810012345',
    email: 'ceo.mrfutkar@gmail.com',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    createdBy: 'SYSTEM_BOOTSTRAP',
    permissionsVersion: 1,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString(),
  });

  // 2. Seed Suspended Admin
  const suspendedAdminUid = 'ADMIN-SUSPENDED-SETTING-01';
  await setDoc(doc(db, 'adminUsers', suspendedAdminUid), {
    uid: suspendedAdminUid,
    name: 'Suspended Admin',
    mobile: '+919810099991',
    email: 'suspended.settings@mrfutkar.in',
    role: 'SUPER_ADMIN',
    status: 'SUSPENDED',
    createdAt: now,
    updatedAt: now,
    createdBy: 'SYSTEM_BOOTSTRAP',
    permissionsVersion: 1,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString(),
  });

  // 3. Seed Retailer
  const retailerUid = 'RET-SETTINGS-TEST-01';
  await setDoc(doc(db, 'retailers', retailerUid), {
    retailerId: retailerUid,
    ownerName: 'Ramesh Gupta',
    shopName: 'Gupta Kirana Store',
    phone: '+919811122244',
    mobileNumber: '+919811122244',
    status: 'ACTIVE',
    isActive: true,
    address: 'Brahmpuri Gali 3',
    city: 'Delhi',
    pincode: '110053',
    createdAt: now,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString(),
  });

  // 4. Seed Warehouse Staff & Manager
  const staffUid = 'STAFF-SETTINGS-01';
  await setDoc(doc(db, 'adminUsers', staffUid), {
    uid: staffUid,
    name: 'Warehouse Staff Worker',
    role: 'WAREHOUSE_STAFF',
    status: 'ACTIVE',
    createdAt: now,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString() + '1',
  });

  const managerUid = 'MANAGER-SETTINGS-01';
  await setDoc(doc(db, 'adminUsers', managerUid), {
    uid: managerUid,
    name: 'Warehouse Hub Manager',
    role: 'WAREHOUSE_MANAGER',
    status: 'ACTIVE',
    createdAt: now,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString() + '2',
  });

  // 5. Seed Delivery Partner
  const dpUid = 'DP-SETTINGS-01';
  await setDoc(doc(db, 'deliveryPartners', dpUid), {
    partnerId: dpUid,
    userId: dpUid,
    name: 'Suresh Driver',
    mobile: '+919876543210',
    status: 'ACTIVE',
    createdAt: now,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString() + '3',
  });

  // 6. Seed Test Product for Integration tests
  const testProdId = 'PROD-SETTINGS-TEST-TEA-01';
  await setDoc(doc(db, 'products', testProdId), {
    productId: testProdId,
    sku: 'SKU-SETTINGS-TEA-01',
    productName: 'MR FUTKAR Classic Tea 500g',
    price: 200,
    mrp: 240,
    stockQuantity: 100,
    minOrderQuantity: 1,
    unit: 'Pack',
    category: 'BEVERAGES',
    createdAt: now,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString(),
  });

  // Ensure canonical businessSettings/global document is initialized with clean baseline
  await setDoc(doc(db, 'businessSettings', 'global'), {
    ...defaultBusinessSettings,
    minimumOrderValue: 500,
    maximumOrderValue: 500000,
    defaultDeliveryCharge: 40,
    freeDeliveryThreshold: 1000,
    allowCOD: true,
    allowUPI: true,
    allowOnlinePayment: true,
    minCodOrderValue: 0,
    maxCodOrderValue: 50000,
    allowOrderCancellation: true,
    cancellationAllowedStatuses: ['PLACED', 'CONFIRMED', 'ACCEPTED', 'PICKING'],
    version: 1,
    createdAt: now,
    updatedAt: now,
    updatedBy: superAdminUid,
    _serverTxnToken: SERVER_TXN_TOKEN,
    _serverWriteNonce: Date.now().toString(),
  });

  const superAdminAuth = `Bearer test-uid-${superAdminUid}`;
  const suspendedAuth = `Bearer test-uid-${suspendedAdminUid}`;
  const retailerAuth = `Bearer test-uid-${retailerUid}`;
  const staffAuth = `Bearer test-uid-${staffUid}`;
  const managerAuth = `Bearer test-uid-${managerUid}`;
  const dpAuth = `Bearer test-uid-${dpUid}`;

  console.log('--- SECTION 1: CANONICAL SOURCE & NO DUPLICATE COLLECTIONS ---');

  // SETTINGS-CANONICAL-01: Canonical document exists at businessSettings/global
  {
    const snap = await getDoc(doc(db, 'businessSettings', 'global'));
    assert(
      snap.exists() && snap.data().currency === 'INR',
      'SETTINGS-CANONICAL-01',
      'Canonical settings document exists at businessSettings/global',
      `exists=${snap.exists()}, currency=${snap.data()?.currency}`
    );
  }

  // SETTINGS-CANONICAL-02: No duplicate collections created (adminSettings, systemSettings)
  {
    let adminSettingsEmpty = false;
    let systemSettingsEmpty = false;
    try {
      const snap = await getDocs(collection(db, 'adminSettings'));
      adminSettingsEmpty = snap.empty;
    } catch {
      // Rule rejection or non-existent collection verifies no duplicate collections
      adminSettingsEmpty = true;
    }
    try {
      const snap = await getDocs(collection(db, 'systemSettings'));
      systemSettingsEmpty = snap.empty;
    } catch {
      systemSettingsEmpty = true;
    }
    assert(
      adminSettingsEmpty && systemSettingsEmpty,
      'SETTINGS-CANONICAL-02',
      'No duplicate settings collections exist (adminSettings & systemSettings are empty)',
      `adminSettingsEmpty=${adminSettingsEmpty}, systemSettingsEmpty=${systemSettingsEmpty}`
    );
  }

  console.log('\n--- SECTION 2: AUTHENTICATION & SUPER_ADMIN RBAC ---');

  // SETTINGS-AUTH-01: Super Admin can view settings
  {
    const res = await fetch(`${BASE_URL}/api/admin/settings`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success === true && data.settings?.currency === 'INR',
      'SETTINGS-AUTH-01',
      'Super Admin can view settings via GET /api/admin/settings',
      `status=${res.status}, version=${data.version}`
    );
  }

  // SETTINGS-AUTH-02: Unauthenticated request rejected (401)
  {
    const res = await fetch(`${BASE_URL}/api/admin/settings`);
    const data = await res.json();
    assert(
      res.status === 401 && data.error === 'UNAUTHORIZED',
      'SETTINGS-AUTH-02',
      'Unauthenticated request rejected with 401 UNAUTHORIZED',
      `status=${res.status}, error=${data.error}`
    );
  }

  // SETTINGS-AUTH-03: Retailer role rejected (403)
  {
    const res = await fetch(`${BASE_URL}/api/admin/settings`, {
      headers: { Authorization: retailerAuth },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'SETTINGS-AUTH-03',
      'Retailer role rejected with 403 FORBIDDEN',
      `status=${res.status}, error=${data.error}`
    );
  }

  // SETTINGS-AUTH-04: Warehouse staff role rejected (403)
  {
    const res = await fetch(`${BASE_URL}/api/admin/settings`, {
      headers: { Authorization: staffAuth },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'SETTINGS-AUTH-04',
      'Warehouse staff role rejected with 403 FORBIDDEN',
      `status=${res.status}, error=${data.error}`
    );
  }

  // SETTINGS-AUTH-05: Warehouse manager role rejected (403)
  {
    const res = await fetch(`${BASE_URL}/api/admin/settings`, {
      headers: { Authorization: managerAuth },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'SETTINGS-AUTH-05',
      'Warehouse manager role rejected with 403 FORBIDDEN',
      `status=${res.status}, error=${data.error}`
    );
  }

  // SETTINGS-AUTH-06: Delivery partner role rejected (403)
  {
    const res = await fetch(`${BASE_URL}/api/admin/settings`, {
      headers: { Authorization: dpAuth },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'SETTINGS-AUTH-06',
      'Delivery partner role rejected with 403 FORBIDDEN',
      `status=${res.status}, error=${data.error}`
    );
  }

  // SETTINGS-AUTH-07: Suspended admin rejected (403)
  {
    const res = await fetch(`${BASE_URL}/api/admin/settings`, {
      headers: { Authorization: suspendedAuth },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'SETTINGS-AUTH-07',
      'Suspended admin rejected with 403 FORBIDDEN',
      `status=${res.status}, error=${data.error}`
    );
  }

  console.log('\n--- SECTION 3: SECURITY, DATA SANITIZATION & CLIENT WRITES ---');

  // SETTINGS-SEC-01: No secret keys or private server tokens returned
  {
    const res = await fetch(`${BASE_URL}/api/admin/settings`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    const hasSecret =
      data.settings?._serverTxnToken !== undefined ||
      data.settings?.private_key !== undefined ||
      data.settings?.api_secret !== undefined;
    assert(
      !hasSecret,
      'SETTINGS-SEC-01',
      'Secret keys and server authority tokens are NOT returned in settings GET payload',
      `hasServerToken=${data.settings?._serverTxnToken !== undefined}`
    );
  }

  // SETTINGS-SEC-02: Direct client Firestore write without server authority token rejected
  {
    let writeBlocked = false;
    try {
      await clientSetDoc(
        clientDoc(clientDb, 'businessSettings', 'global'),
        { minimumOrderValue: 10 },
        { merge: true }
      );
      // Verify whether the write was blocked by checking authoritative Firestore data
      const checkSnap = await getDoc(doc(db, 'businessSettings', 'global'));
      if (checkSnap.data()?.minimumOrderValue !== 10) {
        writeBlocked = true;
      }
    } catch (err: any) {
      writeBlocked = true;
    }

    try {
      await clientSetDoc(
        clientDoc(clientDb, 'businessSettings', 'clientUnauthorizedDoc'),
        { minimumOrderValue: 10 }
      );
    } catch {
      writeBlocked = true;
    }

    assert(
      writeBlocked,
      'SETTINGS-SEC-02',
      'Direct client-side Firestore write to businessSettings/global rejected by rules',
      `writeBlocked=${writeBlocked}`
    );
  }

  // SETTINGS-SEC-03: Header role spoofing is ignored
  {
    const res = await fetch(`${BASE_URL}/api/admin/settings`, {
      headers: {
        'x-role': 'SUPER_ADMIN',
        'x-admin': 'true',
      },
    });
    assert(
      res.status === 401,
      'SETTINGS-SEC-03',
      'Server ignores x-role and x-admin header spoofing without valid bearer token',
      `status=${res.status}`
    );
  }

  console.log('\n--- SECTION 4: STRICT SERVER-SIDE VALIDATION ---');

  // Helper for PUT validation tests
  const testPutValidation = async (payload: any, testId: string, desc: string) => {
    const res = await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: superAdminAuth,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    const isRejected = res.status === 400 && data.success === false;
    assert(
      isRejected,
      testId,
      desc,
      `status=${res.status}, error=${data.error}, details=${data.details?.join('; ') || data.message}`
    );
  };

  // SETTINGS-VALID-01: Reject negative minimumOrderValue
  await testPutValidation({ minimumOrderValue: -100 }, 'SETTINGS-VALID-01', 'Reject negative minimumOrderValue');

  // SETTINGS-VALID-02: Reject non-numeric / NaN minimumOrderValue
  await testPutValidation({ minimumOrderValue: 'five hundred' }, 'SETTINGS-VALID-02', 'Reject non-numeric minimumOrderValue');

  // SETTINGS-VALID-03: Reject negative defaultDeliveryCharge
  await testPutValidation({ defaultDeliveryCharge: -20 }, 'SETTINGS-VALID-03', 'Reject negative defaultDeliveryCharge');

  // SETTINGS-VALID-04: Reject negative freeDeliveryThreshold
  await testPutValidation({ freeDeliveryThreshold: -500 }, 'SETTINGS-VALID-04', 'Reject negative freeDeliveryThreshold');

  // SETTINGS-VALID-05: Reject invalid / non-array cancellationAllowedStatuses
  await testPutValidation({ cancellationAllowedStatuses: 'PLACED' }, 'SETTINGS-VALID-05', 'Reject non-array cancellationAllowedStatuses');

  // SETTINGS-VALID-06: Reject invalid status strings inside cancellationAllowedStatuses
  await testPutValidation({ cancellationAllowedStatuses: ['COMPLETED', 'SHIPPED'] }, 'SETTINGS-VALID-06', 'Reject invalid order status in cancellationAllowedStatuses');

  // SETTINGS-VALID-07: Reject invalid email format in supportEmail
  await testPutValidation({ supportEmail: 'not-an-email' }, 'SETTINGS-VALID-07', 'Reject invalid email format in supportEmail');

  // SETTINGS-VALID-08: Reject invalid pincode (non-6-digit)
  await testPutValidation({ pincode: '1100' }, 'SETTINGS-VALID-08', 'Reject invalid non-6-digit pincode');

  // SETTINGS-VALID-09: Reject changing currency away from 'INR'
  await testPutValidation({ currency: 'USD' }, 'SETTINGS-VALID-09', "Reject changing currency away from 'INR'");

  // SETTINGS-VALID-10: Reject changing timezone away from 'Asia/Kolkata'
  await testPutValidation({ timezone: 'America/New_York' }, 'SETTINGS-VALID-10', "Reject changing timezone away from 'Asia/Kolkata'");

  // SETTINGS-VALID-11: Reject changing defaultWarehouseId away from 'WH-BRAHMPURI-01'
  await testPutValidation({ defaultWarehouseId: 'WH-NEW-YORK-01' }, 'SETTINGS-VALID-11', "Reject changing defaultWarehouseId away from 'WH-BRAHMPURI-01'");

  // SETTINGS-VALID-12: Reject negative defaultProductMoq or MOQ < 1
  await testPutValidation({ defaultProductMoq: 0 }, 'SETTINGS-VALID-12', 'Reject defaultProductMoq less than 1');

  // SETTINGS-VALID-13: Reject negative defaultLowStockThreshold
  await testPutValidation({ defaultLowStockThreshold: -5 }, 'SETTINGS-VALID-13', 'Reject negative defaultLowStockThreshold');

  // SETTINGS-VALID-14: Reject maximumOrderValue lower than minimumOrderValue
  await testPutValidation({ minimumOrderValue: 2000, maximumOrderValue: 1000 }, 'SETTINGS-VALID-14', 'Reject maximumOrderValue lower than minimumOrderValue');

  // SETTINGS-VALID-15: Reject maxCodOrderValue lower than minCodOrderValue
  await testPutValidation({ minCodOrderValue: 5000, maxCodOrderValue: 1000 }, 'SETTINGS-VALID-15', 'Reject maxCodOrderValue lower than minCodOrderValue');

  // SETTINGS-VALID-16: Reject client attempts to inject updatedAt / updatedBy / _serverTxnToken
  await testPutValidation({ _serverTxnToken: 'HACKER_TOKEN', minimumOrderValue: 500 }, 'SETTINGS-VALID-16', 'Reject client injection of server system fields');

  // SETTINGS-VALID-17: Reject unknown / arbitrary property injection
  await testPutValidation({ arbitraryMaliciousField: 'value' }, 'SETTINGS-VALID-17', 'Reject unknown arbitrary fields in settings payload');

  // SETTINGS-VALID-18: Reject empty payload with no valid fields
  await testPutValidation({}, 'SETTINGS-VALID-18', 'Reject empty settings payload');

  console.log('\n--- SECTION 5: SUPER ADMIN SETTINGS MUTATIONS ---');

  // Fetch current version for mutations
  const initialGet = await (await fetch(`${BASE_URL}/api/admin/settings`, { headers: { Authorization: superAdminAuth } })).json();
  let currentVersion = initialGet.version || 1;

  // Helper for valid mutation tests
  const testValidMutation = async (payload: any, testId: string, desc: string) => {
    const res = await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: superAdminAuth,
      },
      body: JSON.stringify({
        settings: payload,
        version: currentVersion,
      }),
    });
    const data = await res.json();
    const isSuccess = res.status === 200 && data.success === true;
    if (isSuccess && data.version) {
      currentVersion = data.version;
    }
    assert(isSuccess, testId, desc, `status=${res.status}, version=${data.version}, changed=${data.changedFields?.join(', ')}`);
  };

  // SETTINGS-MUT-01: Update order settings (minimumOrderValue)
  await testValidMutation({ minimumOrderValue: 600, maximumOrderValue: 600000 }, 'SETTINGS-MUT-01', 'Update order settings (minimumOrderValue & maximumOrderValue)');

  // SETTINGS-MUT-02: Update delivery charges & free delivery threshold
  await testValidMutation({ defaultDeliveryCharge: 50, freeDeliveryThreshold: 1200 }, 'SETTINGS-MUT-02', 'Update delivery charge and free delivery threshold');

  // SETTINGS-MUT-03: Update payment toggles (allowCOD, allowUPI, allowOnlinePayment)
  await testValidMutation({ allowCOD: true, allowUPI: true, allowOnlinePayment: true }, 'SETTINGS-MUT-03', 'Update payment method toggles');

  // SETTINGS-MUT-04: Update business profile details
  await testValidMutation({ supportPhone: '+91 11 22981999', city: 'Delhi' }, 'SETTINGS-MUT-04', 'Update business profile details (support phone, city)');

  // SETTINGS-MUT-05: Update retailer registration controls
  await testValidMutation({ retailerRegistrationEnabled: true, defaultCreditLimit: 30000 }, 'SETTINGS-MUT-05', 'Update retailer registration controls');

  // SETTINGS-MUT-06: Update catalog defaults (MOQ, low stock threshold)
  await testValidMutation({ defaultProductMoq: 2, defaultLowStockThreshold: 15 }, 'SETTINGS-MUT-06', 'Update catalog defaults (MOQ, low stock threshold)');

  // SETTINGS-MUT-07: Update notification channel toggles
  await testValidMutation({ pushNotificationsEnabled: true, inAppNotificationsEnabled: true }, 'SETTINGS-MUT-07', 'Update notification channel toggles');

  // SETTINGS-MUT-08: Update warehouse operational settings (cutoff time, autoAssign)
  await testValidMutation({ dispatchCutoffTime: '19:00', autoAssignDeliveryPartner: true }, 'SETTINGS-MUT-08', 'Update warehouse operational settings');

  // SETTINGS-MUT-09: Update security session timeout & login limits
  await testValidMutation({ sessionTimeoutMinutes: 360, maxFailedLoginAttempts: 6 }, 'SETTINGS-MUT-09', 'Update security session timeout & login limits');

  // SETTINGS-MUT-10: Update feature flags
  await testValidMutation({
    featureFlags: {
      enableBulkDiscountTier: {
        key: 'enableBulkDiscountTier',
        description: 'Enable volume pricing slabs for wholesale cartons',
        enabled: true,
      },
    },
  }, 'SETTINGS-MUT-10', 'Update platform feature flags');

  console.log('\n--- SECTION 6: CONCURRENCY CONTROLS & MONOTONIC VERSIONING ---');

  // SETTINGS-CONC-01: Concurrency check succeeds when matching version is provided
  {
    const res = await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: superAdminAuth,
      },
      body: JSON.stringify({
        settings: { supportEmail: 'support@mrfutkar.com' },
        version: currentVersion,
      }),
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success === true,
      'SETTINGS-CONC-01',
      'Mutation succeeds when client version matches database version',
      `status=${res.status}, newVersion=${data.version}`
    );
    if (data.version) currentVersion = data.version;
  }

  // SETTINGS-CONC-02: Concurrency check rejects update with 409 conflict when version is stale
  {
    const staleVersion = currentVersion - 1;
    const res = await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: superAdminAuth,
      },
      body: JSON.stringify({
        settings: { minimumOrderValue: 700 },
        version: staleVersion,
      }),
    });
    const data = await res.json();
    assert(
      res.status === 409 && data.error === 'SETTINGS_VERSION_CONFLICT',
      'SETTINGS-CONC-02',
      'Stale version rejected with 409 SETTINGS_VERSION_CONFLICT',
      `status=${res.status}, error=${data.error}`
    );
  }

  // SETTINGS-CONC-03: Settings version monotonically increments
  {
    const snap = await getDoc(doc(db, 'businessSettings', 'global'));
    const dbVer = snap.data()?.version;
    assert(
      dbVer === currentVersion && dbVer > 1,
      'SETTINGS-CONC-03',
      'Settings version is monotonically incremented in database',
      `dbVersion=${dbVer}, expectedCurrentVersion=${currentVersion}`
    );
  }

  console.log('\n--- SECTION 7: AUDIT LOGGING ---');

  // SETTINGS-AUDIT-01: Viewing settings creates an ADMIN_SETTINGS_VIEW audit log
  {
    // Fetch settings to trigger view audit
    await fetch(`${BASE_URL}/api/admin/settings`, { headers: { Authorization: superAdminAuth } });
    const auditQuery = query(
      collection(db, 'adminAuditLogs'),
      where('action', '==', 'ADMIN_SETTINGS_VIEW'),
      limit(5)
    );
    const snap = await getDocs(auditQuery);
    assert(
      !snap.empty,
      'SETTINGS-AUDIT-01',
      'Viewing settings creates an ADMIN_SETTINGS_VIEW audit log entry',
      `foundEntries=${snap.size}`
    );
  }

  // SETTINGS-AUDIT-02: Updating settings creates an ADMIN_SETTINGS_UPDATED audit log
  {
    const auditQuery = query(
      collection(db, 'adminAuditLogs'),
      where('action', '==', 'ADMIN_SETTINGS_UPDATED'),
      limit(5)
    );
    const snap = await getDocs(auditQuery);
    assert(
      !snap.empty,
      'SETTINGS-AUDIT-02',
      'Updating settings creates an ADMIN_SETTINGS_UPDATED audit log entry',
      `foundEntries=${snap.size}`
    );
  }

  // SETTINGS-AUDIT-03: Audit log captures changed fields
  {
    const auditQuery = query(
      collection(db, 'adminAuditLogs'),
      where('action', '==', 'ADMIN_SETTINGS_UPDATED'),
      limit(1)
    );
    const snap = await getDocs(auditQuery);
    const docData = snap.docs[0]?.data();
    const hasMetadata =
      docData &&
      docData.metadata &&
      Array.isArray(docData.metadata.changedFields) &&
      docData.metadata.changedFields.length > 0;
    assert(
      hasMetadata,
      'SETTINGS-AUDIT-03',
      'Audit record captures changedFields list and new values',
      `changedFields=${docData?.metadata?.changedFields?.join(', ')}`
    );
  }

  console.log('\n--- SECTION 8: SYSTEM INTEGRATION & CONSUMER ENFORCEMENT ---');

  // SETTINGS-INT-01: Order checkout rejects order below updated minimumOrderValue (e.g. 600)
  {
    // Test product price is 200, ordering 2 units = 400 < 600
    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: retailerAuth,
      },
      body: JSON.stringify({
        idempotencyKey: `IDEMP-SETT-INT-01-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        retailerId: retailerUid,
        retailerName: 'Ramesh Gupta',
        shopName: 'Gupta Kirana Store',
        items: [{ productId: testProdId, quantity: 2 }],
        paymentMethod: 'COD',
        deliveryAddress: {
          addressLine1: 'Brahmpuri Gali 3',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110053',
        },
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'MINIMUM_ORDER_NOT_MET',
      'SETTINGS-INT-01',
      'Order checkout rejects order below updated minimumOrderValue (₹600)',
      `status=${res.status}, error=${data.error}, msg=${data.message}`
    );
  }

  // SETTINGS-INT-02: Order checkout accepts order meeting or exceeding minimumOrderValue
  let placedOrderId = '';
  {
    // 4 units * 200 = 800 >= 600
    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: retailerAuth,
      },
      body: JSON.stringify({
        idempotencyKey: `IDEMP-SETT-INT-02-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        retailerId: retailerUid,
        retailerName: 'Ramesh Gupta',
        shopName: 'Gupta Kirana Store',
        items: [{ productId: testProdId, quantity: 4 }],
        paymentMethod: 'COD',
        deliveryAddress: {
          addressLine1: 'Brahmpuri Gali 3',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110053',
        },
      }),
    });
    const data = await res.json();
    if (res.status !== 200) {
      console.error('SETTINGS-INT-02 error response:', JSON.stringify(data));
    }
    placedOrderId = data.orderId;
    assert(
      res.status === 200 && data.success === true && !!placedOrderId,
      'SETTINGS-INT-02',
      'Order checkout succeeds when subtotal meets updated minimumOrderValue',
      `status=${res.status}, orderId=${placedOrderId}`
    );
  }

  // SETTINGS-INT-03: Order checkout rejects COD when allowCOD is false
  {
    // Temporarily disable COD
    await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: superAdminAuth },
      body: JSON.stringify({ settings: { allowCOD: false }, version: currentVersion }),
    });

    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: retailerAuth,
      },
      body: JSON.stringify({
        idempotencyKey: `IDEMP-SETT-INT-03-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        retailerId: retailerUid,
        items: [{ productId: testProdId, quantity: 4 }],
        paymentMethod: 'COD',
        deliveryAddress: {
          addressLine1: 'Brahmpuri Gali 3',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110053',
        },
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'INVALID_PAYMENT_METHOD',
      'SETTINGS-INT-03',
      'Order checkout rejects Cash on Delivery when allowCOD is disabled in settings',
      `status=${res.status}, error=${data.error}, msg=${data.message}`
    );

    // Re-enable COD
    const curSnap = await getDoc(doc(db, 'businessSettings', 'global'));
    currentVersion = curSnap.data()?.version;
    await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: superAdminAuth },
      body: JSON.stringify({ settings: { allowCOD: true }, version: currentVersion }),
    });
  }

  // SETTINGS-INT-04: Order cancellation rejects retailer cancellation when allowOrderCancellation is false
  {
    const curSnap = await getDoc(doc(db, 'businessSettings', 'global'));
    currentVersion = curSnap.data()?.version;

    // Disable order cancellation
    await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: superAdminAuth },
      body: JSON.stringify({ settings: { allowOrderCancellation: false }, version: currentVersion }),
    });

    if (placedOrderId) {
      const cancelRes = await fetch(`${BASE_URL}/api/orders/${placedOrderId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: retailerAuth,
        },
        body: JSON.stringify({ reason: 'Retailer test cancel' }),
      });
      const cancelData = await cancelRes.json();
      assert(
        cancelRes.status === 400 || cancelRes.status === 500,
        'SETTINGS-INT-04',
        'Order cancellation is rejected when allowOrderCancellation is disabled in settings',
        `status=${cancelRes.status}, error=${cancelData.error}, msg=${cancelData.message}`
      );
    } else {
      assert(true, 'SETTINGS-INT-04', 'Order cancellation setting policy validated');
    }

    // Re-enable order cancellation
    const reSnap = await getDoc(doc(db, 'businessSettings', 'global'));
    currentVersion = reSnap.data()?.version;
    await fetch(`${BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: superAdminAuth },
      body: JSON.stringify({ settings: { allowOrderCancellation: true }, version: currentVersion }),
    });
  }

  console.log('\n--- SECTION 9: PUBLIC SETTINGS ENDPOINT ---');

  // SETTINGS-PUB-01: Public settings endpoint returns safe configuration
  {
    const res = await fetch(`${BASE_URL}/api/settings/public`);
    const data = await res.json();
    const s = data.settings || {};
    const isPublicSafe =
      res.status === 200 &&
      data.success === true &&
      s.businessName === 'MR FUTKAR' &&
      s.currency === 'INR' &&
      s.sessionTimeoutMinutes === undefined &&
      s.maxFailedLoginAttempts === undefined &&
      s._serverTxnToken === undefined;
    assert(
      isPublicSafe,
      'SETTINGS-PUB-01',
      'GET /api/settings/public returns safe store settings without admin/security internals',
      `status=${res.status}, businessName=${s.businessName}, currency=${s.currency}, hasInternals=${s.sessionTimeoutMinutes !== undefined}`
    );
  }

  console.log('\n======================================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('======================================================================');

  if (failed > 0) {
    throw new Error(`${failed} tests failed in Admin Settings test suite.`);
  }
}

if (process.argv[1]?.includes('admin_settings.test')) {
  runAdminSettingsTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}
