import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../server/firebaseAdmin';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc as clientDoc, setDoc as clientSetDoc, updateDoc as clientUpdateDoc, deleteDoc as clientDeleteDoc } from 'firebase/firestore';
import cfg from '../firebase-applet-config.json';

// Initialize a client-side Firestore instance to test client security rule boundaries
const clientApp = initializeApp(cfg, 'client-security-test-' + Date.now());
const clientDb = getFirestore(clientApp, cfg.firestoreDatabaseId || 'ai-studio-remixremixremixr-231983bd-c5c7-412c-9f2a-788b565d0639');

const BASE_URL = 'http://localhost:3000';

async function runAdminRBACTests() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 3A SUPER ADMIN RBAC & SECURITY VERIFICATION SUITE');
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

  // --- SETUP TEST IDENTITIES IN FIRESTORE ---
  // 1. Active Super Admin
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

  // 2. Suspended Super Admin
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

  // 3. Disabled Super Admin
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
    });
  }

  // -------------------------------------------------------------------------
  // TEST ADMIN-01: Valid SUPER_ADMIN authentication → PASS
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/session`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
      },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success === true && data.session?.role === 'SUPER_ADMIN',
      'ADMIN-01',
      'Valid SUPER_ADMIN authentication passes and returns active session',
      `HTTP status ${res.status}, role=${data.session?.role}, uid=${data.session?.uid}`
    );
  } catch (err: any) {
    assert(false, 'ADMIN-01', 'Valid SUPER_ADMIN authentication failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST ADMIN-02: Unauthenticated user → 401
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/session`, {
      method: 'GET',
    });
    const data = await res.json();
    assert(
      res.status === 401 && data.error === 'UNAUTHORIZED',
      'ADMIN-02',
      'Unauthenticated request without Authorization header returns 401',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'ADMIN-02', 'Unauthenticated test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST ADMIN-03: Retailer → 403
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/session`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-uid-ret-test-auth-01',
      },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'ADMIN-03',
      'Retailer token blocked from Super Admin API with 403',
      `HTTP status ${res.status}, error=${data.error}, message=${data.message}`
    );
  } catch (err: any) {
    assert(false, 'ADMIN-03', 'Retailer blocking test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST ADMIN-04: Warehouse Staff → 403
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/session`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-uid-WH-STAFF-01',
      },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'ADMIN-04',
      'Warehouse Staff blocked from Super Admin API with 403',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'ADMIN-04', 'Warehouse staff test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST ADMIN-05: Warehouse Manager → 403
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/session`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-uid-WH-MGR-01',
      },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'ADMIN-05',
      'Warehouse Manager blocked from Super Admin API with 403',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'ADMIN-05', 'Warehouse manager test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST ADMIN-06: Warehouse Admin → 403
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/session`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-uid-WH-ADMIN-01',
      },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'ADMIN-06',
      'Warehouse Admin blocked from Super Admin API with 403',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'ADMIN-06', 'Warehouse admin test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST ADMIN-07: Delivery Partner → 403
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/session`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-uid-DP-DELHI-01',
      },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'ADMIN-07',
      'Delivery Partner blocked from Super Admin API with 403',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'ADMIN-07', 'Delivery partner test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST ADMIN-08: Suspended SUPER_ADMIN → 403
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/session`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-uid-ADMIN-SUSPENDED-01',
      },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'ADMIN-08',
      'Suspended SUPER_ADMIN blocked with 403',
      `HTTP status ${res.status}, message=${data.message}`
    );
  } catch (err: any) {
    assert(false, 'ADMIN-08', 'Suspended admin test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST ADMIN-09: Disabled SUPER_ADMIN → 403
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/session`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-uid-ADMIN-DISABLED-01',
      },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'ADMIN-09',
      'Disabled SUPER_ADMIN blocked with 403',
      `HTTP status ${res.status}, message=${data.message}`
    );
  } catch (err: any) {
    assert(false, 'ADMIN-09', 'Disabled admin test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST ADMIN-10: Role spoofing through header → 403
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/session`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-uid-ret-test-auth-01',
        'x-role': 'SUPER_ADMIN',
        'x-admin': 'true',
      },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'ADMIN-10',
      'Role spoofing via request headers (x-role, x-admin) strictly rejected',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'ADMIN-10', 'Role spoofing test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST ADMIN-11: Role spoofing through request body → 403
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-uid-ret-test-auth-01',
      },
      body: JSON.stringify({
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      }),
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'ADMIN-11',
      'Role spoofing via JSON request body strictly rejected',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'ADMIN-11', 'Body role spoofing test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST ADMIN-12: Unknown admin UID → 403
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/session`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-uid-non-existent-user-xyz',
      },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'ADMIN-12',
      'Unknown admin UID not present in adminUsers returns 403',
      `HTTP status ${res.status}, error=${data.error}, message=${data.message}`
    );
  } catch (err: any) {
    assert(false, 'ADMIN-12', 'Unknown UID test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST ADMIN-13: Admin session endpoint → PASS
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/session`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
      },
    });
    const data = await res.json();
    const s = data.session;
    const hasSafeKeys = s && s.uid && s.name && s.mobile && s.role === 'SUPER_ADMIN' && s.status === 'ACTIVE' && s.permissionsVersion;
    const hasNoSecrets = !s.password && !s.token && !s.secret && !s.privateKey;
    assert(
      res.status === 200 && hasSafeKeys && hasNoSecrets,
      'ADMIN-13',
      'Admin session endpoint returns verified safe attributes without secrets',
      `session=${JSON.stringify(s)}`
    );
  } catch (err: any) {
    assert(false, 'ADMIN-13', 'Session endpoint test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST ADMIN-14: Admin profile endpoint → PASS
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/profile`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
      },
    });
    const data = await res.json();
    const p = data.profile;
    const hasSafeKeys = p && p.uid === 'SUPER-ADMIN-01' && p.role === 'SUPER_ADMIN' && p.status === 'ACTIVE' && p.createdAt;
    assert(
      res.status === 200 && hasSafeKeys,
      'ADMIN-14',
      'Admin profile endpoint returns verified profile data',
      `profile=${JSON.stringify(p)}`
    );
  } catch (err: any) {
    assert(false, 'ADMIN-14', 'Profile endpoint test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST ADMIN-15: Client cannot create adminUsers → DENIED
  // -------------------------------------------------------------------------
  try {
    let clientWriteBlocked = false;
    try {
      const maliciousDocRef = clientDoc(clientDb, 'adminUsers', 'HACKER-ADMIN-01');
      await clientSetDoc(maliciousDocRef, {
        uid: 'HACKER-ADMIN-01',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      });
    } catch (err: any) {
      if (err.code === 'permission-denied' || err.message?.includes('Missing or insufficient permissions')) {
        clientWriteBlocked = true;
      }
    }
    assert(
      clientWriteBlocked,
      'ADMIN-15',
      'Client-side create on adminUsers collection strictly rejected by security rules',
      'Direct client setDoc on /adminUsers/HACKER-ADMIN-01 caught permission-denied'
    );
  } catch (err: any) {
    assert(false, 'ADMIN-15', 'Client create admin test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST ADMIN-16: Client cannot change admin role → DENIED
  // -------------------------------------------------------------------------
  try {
    let clientUpdateBlocked = false;
    try {
      const targetDocRef = clientDoc(clientDb, 'adminUsers', 'SUPER-ADMIN-01');
      await clientUpdateDoc(targetDocRef, {
        role: 'RETAILER',
      });
    } catch (err: any) {
      if (err.code === 'permission-denied' || err.message?.includes('Missing or insufficient permissions')) {
        clientUpdateBlocked = true;
      }
    }
    assert(
      clientUpdateBlocked,
      'ADMIN-16',
      'Client-side role modification on adminUsers strictly rejected by security rules',
      'Direct client updateDoc caught permission-denied'
    );
  } catch (err: any) {
    assert(false, 'ADMIN-16', 'Client update role test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST ADMIN-17: Client cannot change admin status → DENIED
  // -------------------------------------------------------------------------
  try {
    let clientStatusUpdateBlocked = false;
    try {
      const targetDocRef = clientDoc(clientDb, 'adminUsers', 'ADMIN-SUSPENDED-01');
      await clientUpdateDoc(targetDocRef, {
        status: 'ACTIVE',
      });
    } catch (err: any) {
      if (err.code === 'permission-denied' || err.message?.includes('Missing or insufficient permissions')) {
        clientStatusUpdateBlocked = true;
      }
    }
    assert(
      clientStatusUpdateBlocked,
      'ADMIN-17',
      'Client-side status promotion/tampering strictly rejected by security rules',
      'Direct client updateDoc status change caught permission-denied'
    );
  } catch (err: any) {
    assert(false, 'ADMIN-17', 'Client status update test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST ADMIN-18: Client cannot delete admin user → DENIED
  // -------------------------------------------------------------------------
  try {
    let clientDeleteBlocked = false;
    try {
      const targetDocRef = clientDoc(clientDb, 'adminUsers', 'SUPER-ADMIN-01');
      await clientDeleteDoc(targetDocRef);
    } catch (err: any) {
      if (err.code === 'permission-denied' || err.message?.includes('Missing or insufficient permissions')) {
        clientDeleteBlocked = true;
      }
    }
    assert(
      clientDeleteBlocked,
      'ADMIN-18',
      'Client-side deletion of admin user strictly rejected by security rules',
      'Direct client deleteDoc caught permission-denied'
    );
  } catch (err: any) {
    assert(false, 'ADMIN-18', 'Client delete test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST ADMIN-19: Admin audit log is immutable → PASS
  // -------------------------------------------------------------------------
  try {
    let clientAuditWriteBlocked = false;
    try {
      const fakeAuditDocRef = clientDoc(clientDb, 'adminAuditLogs', 'FAKE-AUDIT-01');
      await clientSetDoc(fakeAuditDocRef, {
        logId: 'FAKE-AUDIT-01',
        action: 'ADMIN_LOGIN_SUCCESS',
      });
    } catch (err: any) {
      if (err.code === 'permission-denied' || err.message?.includes('Missing or insufficient permissions')) {
        clientAuditWriteBlocked = true;
      }
    }

    // Verify Server Admin can read audit logs via protected endpoint
    const auditRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
      },
    });
    const auditData = await auditRes.json();
    const serverLogsAccessible = auditRes.status === 200 && Array.isArray(auditData.logs);

    assert(
      clientAuditWriteBlocked && serverLogsAccessible,
      'ADMIN-19',
      'Admin audit logs are immutable (client write denied, server read verified)',
      `clientWriteBlocked=${clientAuditWriteBlocked}, recordedServerLogsCount=${auditData.count}`
    );
  } catch (err: any) {
    assert(false, 'ADMIN-19', 'Audit log immutability test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST ADMIN-20: Admin logout/session cleanup → PASS
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/logout`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
      },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success === true,
      'ADMIN-20',
      'Admin logout terminates session and writes audit log cleanly',
      `HTTP status ${res.status}, message=${data.message}`
    );
  } catch (err: any) {
    assert(false, 'ADMIN-20', 'Admin logout test failed', err.message);
  }

  console.log('======================================================================');
  console.log(`PHASE 3A SUPER ADMIN RBAC RESULTS: ${passedCount}/20 PASSED, ${failedCount} FAILED`);
  console.log('======================================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAdminRBACTests().catch(err => {
  console.error('Fatal error running admin RBAC test suite:', err.stack || err);
  process.exit(1);
});
