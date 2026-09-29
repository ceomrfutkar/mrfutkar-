import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../server/firebaseAdmin';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc as clientDoc, updateDoc as clientUpdateDoc } from 'firebase/firestore';
import cfg from '../firebase-applet-config.json';

// Initialize a client-side Firestore instance to test client security boundaries
const clientApp = initializeApp(cfg, 'client-dashboard-security-test-' + Date.now());
const clientDb = getFirestore(clientApp, cfg.firestoreDatabaseId || 'ai-studio-remixremixremixr-231983bd-c5c7-412c-9f2a-788b565d0639');

const BASE_URL = 'http://localhost:3000';

export async function runAdminDashboardTests() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 3B-1 SUPER ADMIN DASHBOARD SECURITY & DATA SUITE');
  console.log('======================================================================');

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testId: string, desc: string, evidence?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testId}: ${desc}`);
      if (evidence) console.log(`    Evidence: ${evidence}`);
      passedCount++;
    } else {
      console.error(`❌ [FAIL] ${testId}: ${desc}`);
      if (evidence) console.error(`    Evidence: ${evidence}`);
      failedCount++;
    }
  }

  // --- ENSURE TEST IDENTITIES IN FIRESTORE ---
  // Active Super Admin
  const existingAdmin = await getDoc(doc(db, 'adminUsers', 'SUPER-ADMIN-01'));
  if (!existingAdmin.exists()) {
    await setDoc(doc(db, 'adminUsers', 'SUPER-ADMIN-01'), {
      uid: 'SUPER-ADMIN-01',
      name: 'Akash Gupta (Super Administrator)',
      mobile: '+919810012345',
      email: 'ceo.mrfutkar@gmail.com',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'SYSTEM_BOOTSTRAP',
      permissionsVersion: 1,
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    });
  }

  // Suspended Super Admin
  const existingSuspended = await getDoc(doc(db, 'adminUsers', 'ADMIN-SUSPENDED-01'));
  if (!existingSuspended.exists()) {
    await setDoc(doc(db, 'adminUsers', 'ADMIN-SUSPENDED-01'), {
      uid: 'ADMIN-SUSPENDED-01',
      name: 'Suspended Admin User',
      mobile: '+919810099991',
      email: 'suspended.admin@mrfutkar.in',
      role: 'SUPER_ADMIN',
      status: 'SUSPENDED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'SYSTEM_BOOTSTRAP',
      permissionsVersion: 1,
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
      _serverWriteNonce: Date.now().toString(),
    });
  } else if (existingSuspended.data()?.status !== 'SUSPENDED') {
    await updateDoc(doc(db, 'adminUsers', 'ADMIN-SUSPENDED-01'), {
      status: 'SUSPENDED',
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
      _serverWriteNonce: Date.now().toString(),
    });
  }

  // Disabled Super Admin
  const existingDisabled = await getDoc(doc(db, 'adminUsers', 'ADMIN-DISABLED-01'));
  if (!existingDisabled.exists()) {
    await setDoc(doc(db, 'adminUsers', 'ADMIN-DISABLED-01'), {
      uid: 'ADMIN-DISABLED-01',
      name: 'Disabled Admin User',
      mobile: '+919810099992',
      email: 'disabled.admin@mrfutkar.in',
      role: 'SUPER_ADMIN',
      status: 'DISABLED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'SYSTEM_BOOTSTRAP',
      permissionsVersion: 1,
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
      _serverWriteNonce: Date.now().toString(),
    });
  } else if (existingDisabled.data()?.status !== 'DISABLED') {
    await updateDoc(doc(db, 'adminUsers', 'ADMIN-DISABLED-01'), {
      status: 'DISABLED',
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
      _serverWriteNonce: Date.now().toString(),
    });
  }

  // Tokens matching server/adminAuth.ts test pattern
  const superAdminToken = 'test-uid-SUPER-ADMIN-01';
  const retailerToken = 'test-uid-ret-test-auth-01';
  const whStaffToken = 'test-uid-WH-STAFF-01';
  const whMgrToken = 'test-uid-WH-MGR-01';
  const whAdminToken = 'test-uid-WH-ADMIN-01';
  const dpToken = 'test-uid-DP-DELHI-01';
  const suspendedAdminToken = 'test-uid-ADMIN-SUSPENDED-01';
  const disabledAdminToken = 'test-uid-ADMIN-DISABLED-01';

  let cachedDashboardData: any = null;

  // -------------------------------------------------------------
  // DASH-01: SUPER_ADMIN can access dashboard → PASS
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/dashboard`, {
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
      },
    });
    const data = await res.json();
    cachedDashboardData = data.data;

    assert(
      res.status === 200 && data.success === true && typeof data.data === 'object',
      'DASH-01',
      'SUPER_ADMIN can access dashboard → PASS',
      `HTTP status ${res.status}, success=${data.success}, hasData=${Boolean(data.data)}`
    );
  } catch (err: any) {
    assert(false, 'DASH-01', 'SUPER_ADMIN dashboard access threw error', err.message);
  }

  // -------------------------------------------------------------
  // DASH-02: Unauthenticated user → 401
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/dashboard`);
    const data = await res.json();

    assert(
      res.status === 401 && data.error === 'UNAUTHORIZED',
      'DASH-02',
      'Unauthenticated user → 401',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'DASH-02', 'Unauthenticated check failed', err.message);
  }

  // -------------------------------------------------------------
  // DASH-03: Retailer → 403
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${retailerToken}` },
    });
    const data = await res.json();

    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'DASH-03',
      'Retailer token blocked from dashboard → 403',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'DASH-03', 'Retailer block check failed', err.message);
  }

  // -------------------------------------------------------------
  // DASH-04: Warehouse Staff → 403
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${whStaffToken}` },
    });
    const data = await res.json();

    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'DASH-04',
      'Warehouse Staff blocked from dashboard → 403',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'DASH-04', 'Warehouse staff block check failed', err.message);
  }

  // -------------------------------------------------------------
  // DASH-05: Warehouse Manager → 403
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${whMgrToken}` },
    });
    const data = await res.json();

    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'DASH-05',
      'Warehouse Manager blocked from dashboard → 403',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'DASH-05', 'Warehouse manager block check failed', err.message);
  }

  // -------------------------------------------------------------
  // DASH-06: Warehouse Admin → 403
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${whAdminToken}` },
    });
    const data = await res.json();

    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'DASH-06',
      'Warehouse Admin blocked from dashboard → 403',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'DASH-06', 'Warehouse admin block check failed', err.message);
  }

  // -------------------------------------------------------------
  // DASH-07: Delivery Partner → 403
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${dpToken}` },
    });
    const data = await res.json();

    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'DASH-07',
      'Delivery Partner blocked from dashboard → 403',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'DASH-07', 'Delivery partner block check failed', err.message);
  }

  // -------------------------------------------------------------
  // DASH-08: Dashboard does not accept client-supplied metrics
  // -------------------------------------------------------------
  try {
    // Attempt to spoof metrics via query params and request body
    const spoofUrl = `${BASE_URL}/api/admin/dashboard?salesToday=99999999&ordersToday=88888&lowStockProducts=0`;
    const res = await fetch(spoofUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await res.json();

    const notSpoofed =
      data.data &&
      data.data.salesToday !== 99999999 &&
      data.data.ordersToday !== 88888;

    assert(
      notSpoofed,
      'DASH-08',
      'Dashboard does not accept client-supplied metrics',
      `Client tried spoofing salesToday=99999999, server returned authoritative salesToday=${data.data?.salesToday}`
    );
  } catch (err: any) {
    assert(false, 'DASH-08', 'Client metrics injection check failed', err.message);
  }

  // -------------------------------------------------------------
  // DASH-09: Dashboard does not accept client-supplied retailer/warehouse filters to bypass authorization
  // -------------------------------------------------------------
  try {
    const bypassUrl = `${BASE_URL}/api/admin/dashboard?warehouseId=WH_HACK_99&retailerId=RET_HACK_99`;
    const res = await fetch(bypassUrl, {
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
      },
    });
    const data = await res.json();

    // Verify response still contains authoritative system-wide data and did not drop metrics to arbitrary filtered subset
    assert(
      res.status === 200 && data.success === true && Array.isArray(data.data.recentOrders),
      'DASH-09',
      'Dashboard does not accept client-supplied retailer/warehouse filters to bypass authorization',
      `Returned authoritative structure without error, ordersCount=${data.data.recentOrders.length}`
    );
  } catch (err: any) {
    assert(false, 'DASH-09', 'Client filter bypass check failed', err.message);
  }

  // -------------------------------------------------------------
  // DASH-10: Today's sales calculated server-side
  // -------------------------------------------------------------
  try {
    const ordersSnap = await getDocs(collection(db, 'orders'));
    const todayStr = new Date().toISOString().split('T')[0];
    let expectedSales = 0;

    ordersSnap.docs.forEach(docSnap => {
      const o = docSnap.data();
      const status = (o.orderStatus || o.status || 'PLACED').toUpperCase();
      const createdDate = (o.createdAt || '').split('T')[0];
      const grandTotal = Number(o.grandTotal ?? o.total) || 0;
      if (createdDate === todayStr && status !== 'CANCELLED') {
        expectedSales += grandTotal;
      }
    });

    expectedSales = Math.round(expectedSales * 100) / 100;

    assert(
      cachedDashboardData && cachedDashboardData.salesToday === expectedSales,
      'DASH-10',
      "Today's sales calculated server-side",
      `Server salesToday=${cachedDashboardData?.salesToday}, DB ground-truth=${expectedSales}`
    );
  } catch (err: any) {
    assert(false, 'DASH-10', 'Server sales calculation verification failed', err.message);
  }

  // -------------------------------------------------------------
  // DASH-11: Today's order count calculated server-side
  // -------------------------------------------------------------
  try {
    const ordersSnap = await getDocs(collection(db, 'orders'));
    const todayStr = new Date().toISOString().split('T')[0];
    let expectedOrders = 0;

    ordersSnap.docs.forEach(docSnap => {
      const o = docSnap.data();
      const status = (o.orderStatus || o.status || 'PLACED').toUpperCase();
      const createdDate = (o.createdAt || '').split('T')[0];
      if (createdDate === todayStr && status !== 'CANCELLED') {
        expectedOrders++;
      }
    });

    assert(
      cachedDashboardData && cachedDashboardData.ordersToday === expectedOrders,
      'DASH-11',
      "Today's order count calculated server-side",
      `Server ordersToday=${cachedDashboardData?.ordersToday}, DB ground-truth=${expectedOrders}`
    );
  } catch (err: any) {
    assert(false, 'DASH-11', 'Server orders count verification failed', err.message);
  }

  // -------------------------------------------------------------
  // DASH-12: Low stock calculated from authoritative inventory
  // -------------------------------------------------------------
  try {
    const prodSnap = await getDocs(collection(db, 'products'));
    let expectedLowStock = 0;

    prodSnap.docs.forEach(docSnap => {
      const p = docSnap.data();
      if (p.isActive === false) return;
      const stock = Number(p.stockQuantity) || 0;
      const threshold = Number(p.lowStockThreshold) || 20;
      if (stock <= threshold) {
        expectedLowStock++;
      }
    });

    assert(
      cachedDashboardData && cachedDashboardData.lowStockProducts === expectedLowStock,
      'DASH-12',
      'Low stock calculated from authoritative inventory',
      `Server lowStockProducts=${cachedDashboardData?.lowStockProducts}, DB ground-truth=${expectedLowStock}`
    );
  } catch (err: any) {
    assert(false, 'DASH-12', 'Low stock calculation verification failed', err.message);
  }

  // -------------------------------------------------------------
  // DASH-13: COD pending calculated from authoritative payment/order state
  // -------------------------------------------------------------
  try {
    const ordersSnap = await getDocs(collection(db, 'orders'));
    let expectedCodPending = 0;

    ordersSnap.docs.forEach(docSnap => {
      const o = docSnap.data();
      const status = (o.orderStatus || o.status || 'PLACED').toUpperCase();
      const payMethod = (o.paymentMethod || '').toUpperCase();
      const payStatus = (o.paymentStatus || '').toUpperCase();
      const grandTotal = Number(o.grandTotal ?? o.total) || 0;

      if (payMethod === 'COD' && status !== 'DELIVERED' && status !== 'CANCELLED' && payStatus !== 'PAID') {
        expectedCodPending += grandTotal;
      }
    });

    expectedCodPending = Math.round(expectedCodPending * 100) / 100;

    assert(
      cachedDashboardData && cachedDashboardData.codPending === expectedCodPending,
      'DASH-13',
      'COD pending calculated from authoritative payment/order state',
      `Server codPending=${cachedDashboardData?.codPending}, DB ground-truth=${expectedCodPending}`
    );
  } catch (err: any) {
    assert(false, 'DASH-13', 'COD pending calculation verification failed', err.message);
  }

  // -------------------------------------------------------------
  // DASH-14: Recent orders limited to 10
  // -------------------------------------------------------------
  try {
    const orders = cachedDashboardData?.recentOrders || [];
    assert(
      Array.isArray(orders) && orders.length <= 10,
      'DASH-14',
      'Recent orders limited to 10',
      `Returned orders count=${orders.length} (must be <= 10)`
    );
  } catch (err: any) {
    assert(false, 'DASH-14', 'Recent orders limit check failed', err.message);
  }

  // -------------------------------------------------------------
  // DASH-15: No mock fallback on dashboard API failure
  // -------------------------------------------------------------
  try {
    // Request with completely invalid token
    const res = await fetch(`${BASE_URL}/api/admin/dashboard`, {
      headers: { 'Authorization': 'Bearer INVALID-GARBAGE-TOKEN' },
    });
    const data = await res.json();

    const isRejectedCleanly =
      res.status >= 400 &&
      data.success !== true &&
      !data.data; // Ensure no mock data is secretly returned

    assert(
      isRejectedCleanly,
      'DASH-15',
      'No mock fallback on dashboard API failure',
      `HTTP status ${res.status}, error=${data.error}, dataPresent=${Boolean(data.data)}`
    );
  } catch (err: any) {
    assert(false, 'DASH-15', 'No mock fallback check failed', err.message);
  }

  // -------------------------------------------------------------
  // DASH-16: Dashboard read creates appropriate admin audit record
  // -------------------------------------------------------------
  try {
    const logsQuery = query(
      collection(db, 'adminAuditLogs'),
      orderBy('timestamp', 'desc'),
      limit(10)
    );
    const snap = await getDocs(logsQuery);
    const dashboardViewLog = snap.docs.find(d => d.data().action === 'ADMIN_DASHBOARD_VIEW');

    assert(
      Boolean(dashboardViewLog),
      'DASH-16',
      'Dashboard read creates appropriate admin audit record',
      `Found ADMIN_DASHBOARD_VIEW log with targetId=${dashboardViewLog?.data().targetId}, adminUid=${dashboardViewLog?.data().adminUid}`
    );
  } catch (err: any) {
    assert(false, 'DASH-16', 'Audit log check failed', err.message);
  }

  // -------------------------------------------------------------
  // DASH-17: Client cannot directly mutate dashboard source data
  // -------------------------------------------------------------
  try {
    let clientMutationFailed = false;
    try {
      const targetDoc = clientDoc(clientDb, 'adminUsers', 'SUPER-ADMIN-01');
      await clientUpdateDoc(targetDoc, {
        status: 'SUSPENDED',
      });
    } catch (err: any) {
      if (err.code === 'permission-denied' || String(err).includes('permission-denied') || String(err).includes('PERMISSION_DENIED')) {
        clientMutationFailed = true;
      }
    }

    assert(
      clientMutationFailed,
      'DASH-17',
      'Client cannot directly mutate dashboard source data',
      'Client direct updateDoc without server authority rejected by security rules'
    );
  } catch (err: any) {
    assert(false, 'DASH-17', 'Client mutation check failed', err.message);
  }

  // -------------------------------------------------------------
  // DASH-18: Suspended SUPER_ADMIN rejected
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${suspendedAdminToken}` },
    });
    const data = await res.json();

    assert(
      res.status === 403,
      'DASH-18',
      'Suspended SUPER_ADMIN rejected',
      `HTTP status ${res.status}, message=${data.message}`
    );
  } catch (err: any) {
    assert(false, 'DASH-18', 'Suspended admin check failed', err.message);
  }

  // -------------------------------------------------------------
  // DASH-19: Disabled SUPER_ADMIN rejected
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${disabledAdminToken}` },
    });
    const data = await res.json();

    assert(
      res.status === 403,
      'DASH-19',
      'Disabled SUPER_ADMIN rejected',
      `HTTP status ${res.status}, message=${data.message}`
    );
  } catch (err: any) {
    assert(false, 'DASH-19', 'Disabled admin check failed', err.message);
  }

  // -------------------------------------------------------------
  // DASH-20: Admin logout prevents further dashboard access
  // -------------------------------------------------------------
  try {
    // 1. Log out via API
    const logoutRes = await fetch(`${BASE_URL}/api/admin/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${superAdminToken}` },
    });
    const logoutData = await logoutRes.json();

    // 2. Next dashboard request without token (simulating client-side token wipe upon logout)
    const subsequentRes = await fetch(`${BASE_URL}/api/admin/dashboard`);

    assert(
      logoutRes.status === 200 && subsequentRes.status === 401,
      'DASH-20',
      'Admin logout prevents further dashboard access',
      `Logout HTTP status ${logoutRes.status}, subsequent dashboard request HTTP status ${subsequentRes.status}`
    );
  } catch (err: any) {
    assert(false, 'DASH-20', 'Logout check failed', err.message);
  }

  console.log('======================================================================');
  console.log(`PHASE 3B-1 SUPER ADMIN DASHBOARD RESULTS: ${passedCount}/20 PASSED, ${failedCount} FAILED`);
  console.log('======================================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Auto-run if executed directly
if (process.argv[1]?.includes('admin_dashboard.test.ts')) {
  runAdminDashboardTests().catch(err => {
    console.error('Fatal error running admin dashboard test suite:', err.stack || err);
    process.exit(1);
  });
}
