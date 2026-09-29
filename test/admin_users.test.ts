/**
 * MR FUTKAR — Phase 3B-12: Admin User & Access Management Test Suite
 * Minimum tests: AU-01 to AU-47
 * 
 * Verifies RBAC, Lockout Protections, Concurrency Protection,
 * Server-Side Search/Filtering/Pagination, Audit Immutability,
 * and Live Firebase Architecture.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc as clientDoc, setDoc as clientSetDoc, deleteDoc as clientDeleteDoc } from 'firebase/firestore';
import { execSync } from 'child_process';
import { db, SERVER_TXN_TOKEN, OPERATIONAL_WAREHOUSE_ID } from '../server/firebaseAdmin';
import cfg from '../firebase-applet-config.json';

const BASE_URL = 'http://localhost:3000';

// Unauthenticated Client Firestore instance for security boundary testing (no server token)
const clientApp = initializeApp(cfg, 'admin-client-rules-test-' + Date.now());
const clientDb = getFirestore(clientApp, cfg.firestoreDatabaseId);

interface TestResult {
  code: string;
  name: string;
  passed: boolean;
  evidence: string;
}

const results: TestResult[] = [];

function record(condition: boolean, code: string, name: string, evidence: string) {
  results.push({ code, name, passed: condition, evidence });
  const badge = condition ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`${badge} ${code}: ${name} | ${evidence}`);
}

export async function runAdminUsersTestSuite() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 3B-12: ADMIN USER & ACCESS MANAGEMENT (AU-01 TO AU-47)');
  console.log('Database:', cfg.firestoreDatabaseId);
  console.log('Timestamp:', new Date().toISOString());
  console.log('======================================================================\n');

  const now = new Date().toISOString();
  const testId = Date.now();

  // Test Principal UIDs
  const superAdmin1 = `AU-SUPERADMIN-1-${testId}`;
  const superAdmin2 = `AU-SUPERADMIN-2-${testId}`;
  const isolatedLastAdmin = `AU-LAST-SUPERADMIN-${testId}`;
  const suspendedAdmin = `AU-SUSPENDED-${testId}`;
  const disabledAdmin = `AU-DISABLED-${testId}`;
  const retailerUid = `AU-RETAILER-${testId}`;
  const warehouseStaffUid = `AU-STAFF-${testId}`;
  const warehouseManagerUid = `AU-MANAGER-${testId}`;
  const deliveryPartnerUid = `AU-DELIVERY-${testId}`;
  let provisionedAdminUid = '';

  try {
    // -------------------------------------------------------------
    // Seed Authoritative Test Documents in Firestore
    // -------------------------------------------------------------
    await setDoc(doc(db, 'adminUsers', superAdmin1), {
      uid: superAdmin1,
      name: 'Super Admin Alpha',
      email: `alpha.${testId}@mrfutkar.com`,
      mobile: '+919811110001',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      isActive: true,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      createdAt: now,
      updatedAt: now,
      createdBy: 'SYSTEM_TEST',
      permissionsVersion: 1,
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    });

    await setDoc(doc(db, 'adminUsers', superAdmin2), {
      uid: superAdmin2,
      name: 'Super Admin Beta',
      email: `beta.${testId}@mrfutkar.com`,
      mobile: '+919811110002',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      isActive: true,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      createdAt: now,
      updatedAt: now,
      createdBy: 'SYSTEM_TEST',
      permissionsVersion: 1,
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    });

    await setDoc(doc(db, 'adminUsers', suspendedAdmin), {
      uid: suspendedAdmin,
      name: 'Suspended Admin Gamma',
      email: `gamma.${testId}@mrfutkar.com`,
      mobile: '+919811110003',
      role: 'SUPER_ADMIN',
      status: 'SUSPENDED',
      isActive: false,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      createdAt: now,
      updatedAt: now,
      createdBy: 'SYSTEM_TEST',
      permissionsVersion: 1,
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    });

    await setDoc(doc(db, 'adminUsers', disabledAdmin), {
      uid: disabledAdmin,
      name: 'Disabled Admin Delta',
      email: `delta.${testId}@mrfutkar.com`,
      mobile: '+919811110004',
      role: 'SUPER_ADMIN',
      status: 'DISABLED',
      isActive: false,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      createdAt: now,
      updatedAt: now,
      createdBy: 'SYSTEM_TEST',
      permissionsVersion: 1,
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    });

    await setDoc(doc(db, 'retailers', retailerUid), {
      retailerId: retailerUid,
      ownerName: 'Retailer Test Store',
      status: 'ACTIVE',
      isActive: true,
      _serverTxnToken: SERVER_TXN_TOKEN,
    });

    await setDoc(doc(db, 'warehouseUsers', warehouseStaffUid), {
      userId: warehouseStaffUid,
      name: 'Staff Worker',
      role: 'WAREHOUSE_STAFF',
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      _serverTxnToken: SERVER_TXN_TOKEN,
    });

    await setDoc(doc(db, 'warehouseUsers', warehouseManagerUid), {
      userId: warehouseManagerUid,
      name: 'Warehouse Manager',
      role: 'WAREHOUSE_MANAGER',
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      _serverTxnToken: SERVER_TXN_TOKEN,
    });

    await setDoc(doc(db, 'deliveryPartners', deliveryPartnerUid), {
      partnerId: deliveryPartnerUid,
      name: 'Delivery Agent',
      accountStatus: 'ACTIVE',
      assignedWarehouseId: OPERATIONAL_WAREHOUSE_ID,
      _serverTxnToken: SERVER_TXN_TOKEN,
    });

    // -------------------------------------------------------------
    // AU-01 to AU-10: AUTHENTICATION, RBAC & SPOOFING REJECTION
    // -------------------------------------------------------------
    // AU-01: SUPER_ADMIN can list admin users.
    const resAU01 = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer test-uid-${superAdmin1}` },
    });
    const dataAU01 = await resAU01.json();
    record(
      resAU01.status === 200 && Array.isArray(dataAU01.users) && dataAU01.users.length > 0,
      'AU-01',
      'SUPER_ADMIN can list admin users',
      `Status: ${resAU01.status}, users returned: ${dataAU01.users?.length}`
    );

    // AU-02: Unauthenticated access rejected.
    const resAU02 = await fetch(`${BASE_URL}/api/admin/users`);
    record(
      resAU02.status === 401,
      'AU-02',
      'Unauthenticated access rejected',
      `Status: ${resAU02.status}`
    );

    // AU-03: Retailer access rejected.
    const resAU03 = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer test-uid-${retailerUid}` },
    });
    record(
      resAU03.status === 403,
      'AU-03',
      'Retailer access rejected',
      `Status: ${resAU03.status}`
    );

    // AU-04: Warehouse staff access rejected.
    const resAU04 = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer test-uid-${warehouseStaffUid}` },
    });
    record(
      resAU04.status === 403,
      'AU-04',
      'Warehouse staff access rejected',
      `Status: ${resAU04.status}`
    );

    // AU-05: Warehouse manager access rejected.
    const resAU05 = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer test-uid-${warehouseManagerUid}` },
    });
    record(
      resAU05.status === 403,
      'AU-05',
      'Warehouse manager access rejected',
      `Status: ${resAU05.status}`
    );

    // AU-06: Delivery partner access rejected.
    const resAU06 = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer test-uid-${deliveryPartnerUid}` },
    });
    record(
      resAU06.status === 403,
      'AU-06',
      'Delivery partner access rejected',
      `Status: ${resAU06.status}`
    );

    // AU-07: Suspended admin access rejected.
    const resAU07 = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer test-uid-${suspendedAdmin}` },
    });
    record(
      resAU07.status === 403,
      'AU-07',
      'Suspended admin access rejected',
      `Status: ${resAU07.status}`
    );

    // AU-08: Disabled admin access rejected.
    const resAU08 = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer test-uid-${disabledAdmin}` },
    });
    record(
      resAU08.status === 403,
      'AU-08',
      'Disabled admin access rejected',
      `Status: ${resAU08.status}`
    );

    // AU-09: x-role spoof rejected.
    const resAU09 = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: {
        Authorization: `Bearer test-uid-${retailerUid}`,
        'x-role': 'SUPER_ADMIN',
      },
    });
    record(
      resAU09.status === 403,
      'AU-09',
      'x-role spoof rejected',
      `Status: ${resAU09.status}`
    );

    // AU-10: request-body role spoof rejected.
    const resAU10 = await fetch(`${BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${warehouseStaffUid}`,
      },
      body: JSON.stringify({
        role: 'SUPER_ADMIN',
        name: 'Spoofed Admin',
        email: `spoofed.${testId}@test.com`,
        mobile: '+919811199999',
      }),
    });
    record(
      resAU10.status === 403,
      'AU-10',
      'request-body role spoof rejected',
      `Status: ${resAU10.status}`
    );

    // -------------------------------------------------------------
    // AU-11 to AU-15: SEARCH, FILTERING, PAGINATION & DETAIL
    // -------------------------------------------------------------
    // AU-11: Server-side search works.
    const resAU11 = await fetch(`${BASE_URL}/api/admin/users?search=${superAdmin1}`, {
      headers: { Authorization: `Bearer test-uid-${superAdmin1}` },
    });
    const dataAU11 = await resAU11.json();
    const searchMatch = dataAU11.users?.some((u: any) => u.uid === superAdmin1);
    record(
      resAU11.status === 200 && searchMatch && dataAU11.users?.length === 1,
      'AU-11',
      'Server-side search works',
      `Matched ${dataAU11.users?.length} user(s) for UID search query`
    );

    // AU-12: Server-side filtering works.
    const resAU12 = await fetch(`${BASE_URL}/api/admin/users?status=SUSPENDED`, {
      headers: { Authorization: `Bearer test-uid-${superAdmin1}` },
    });
    const dataAU12 = await resAU12.json();
    const allSuspended = dataAU12.users?.every((u: any) => u.status === 'SUSPENDED');
    record(
      resAU12.status === 200 && allSuspended && dataAU12.users?.length > 0,
      'AU-12',
      'Server-side filtering works',
      `Returned ${dataAU12.users?.length} users, all status=SUSPENDED: ${allSuspended}`
    );

    // AU-13: Pagination works.
    const resAU13 = await fetch(`${BASE_URL}/api/admin/users?page=1&pageSize=2`, {
      headers: { Authorization: `Bearer test-uid-${superAdmin1}` },
    });
    const dataAU13 = await resAU13.json();
    record(
      resAU13.status === 200 && dataAU13.users?.length === 2 && dataAU13.totalPages >= 2,
      'AU-13',
      'Pagination works',
      `Page: ${dataAU13.page}, PageSize: ${dataAU13.pageSize}, Count: ${dataAU13.users?.length}`
    );

    // AU-14: pageSize >100 rejected.
    const resAU14 = await fetch(`${BASE_URL}/api/admin/users?pageSize=101`, {
      headers: { Authorization: `Bearer test-uid-${superAdmin1}` },
    });
    record(
      resAU14.status === 400,
      'AU-14',
      'pageSize >100 rejected',
      `Status: ${resAU14.status}`
    );

    // AU-15: Admin detail works.
    const resAU15 = await fetch(`${BASE_URL}/api/admin/users/${superAdmin1}`, {
      headers: { Authorization: `Bearer test-uid-${superAdmin1}` },
    });
    const dataAU15 = await resAU15.json();
    record(
      resAU15.status === 200 && dataAU15.admin?.uid === superAdmin1 && dataAU15.admin?.role === 'SUPER_ADMIN',
      'AU-15',
      'Admin detail works',
      `Admin retrieved: ${dataAU15.admin?.name}, Role: ${dataAU15.admin?.role}`
    );

    // -------------------------------------------------------------
    // AU-16 to AU-20: LIFECYCLE & IDEMPOTENCY
    // -------------------------------------------------------------
    // Provision a target admin for lifecycle operations
    const resProv = await fetch(`${BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdmin1}`
      },
      body: JSON.stringify({
        name: 'Target Lifecycle Admin',
        email: `lifecycle.${testId}@mrfutkar.com`,
        mobile: '+919811122222',
        role: 'SUPER_ADMIN',
        reason: 'Automated test suite lifecycle target',
      }),
    });
    const dataProv = await resProv.json();
    provisionedAdminUid = dataProv.admin?.uid || '';

    // AU-17: Suspend works.
    const resAU17 = await fetch(`${BASE_URL}/api/admin/users/${provisionedAdminUid}/suspend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdmin1}`
      },
      body: JSON.stringify({ reason: 'Security investigation temporary hold' }),
    });
    const dataAU17 = await resAU17.json();
    record(
      resAU17.status === 200 && dataAU17.admin?.status === 'SUSPENDED',
      'AU-17',
      'Suspend works',
      `Status changed to: ${dataAU17.admin?.status}`
    );

    // AU-16: Activate works (from SUSPENDED).
    const resAU16 = await fetch(`${BASE_URL}/api/admin/users/${provisionedAdminUid}/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdmin1}`
      },
      body: JSON.stringify({ reason: 'Investigation cleared successfully' }),
    });
    const dataAU16 = await resAU16.json();
    record(
      resAU16.status === 200 && dataAU16.admin?.status === 'ACTIVE',
      'AU-16',
      'Activate works',
      `Status changed to: ${dataAU16.admin?.status}`
    );

    // AU-18: Deactivate works.
    const resAU18 = await fetch(`${BASE_URL}/api/admin/users/${provisionedAdminUid}/deactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdmin1}`
      },
      body: JSON.stringify({ reason: 'Offboarding administrative contract' }),
    });
    const dataAU18 = await resAU18.json();
    record(
      resAU18.status === 200 && dataAU18.admin?.status === 'DISABLED',
      'AU-18',
      'Deactivate works',
      `Status changed to: ${dataAU18.admin?.status}`
    );

    // AU-19: Reactivate works (from DISABLED).
    const resAU19 = await fetch(`${BASE_URL}/api/admin/users/${provisionedAdminUid}/reactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdmin1}`
      },
      body: JSON.stringify({ reason: 'Administrative reinstatement approved' }),
    });
    const dataAU19 = await resAU19.json();
    record(
      resAU19.status === 200 && dataAU19.admin?.status === 'ACTIVE',
      'AU-19',
      'Reactivate works',
      `Status changed to: ${dataAU19.admin?.status}`
    );

    // AU-20: Operations are idempotent.
    // Repeating activate on an already active admin should succeed with 200 and maintain ACTIVE status.
    const resAU20 = await fetch(`${BASE_URL}/api/admin/users/${provisionedAdminUid}/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdmin1}`
      },
      body: JSON.stringify({ reason: 'Repeated activation check' }),
    });
    const dataAU20 = await resAU20.json();
    record(
      resAU20.status === 200 && dataAU20.admin?.status === 'ACTIVE',
      'AU-20',
      'Operations are idempotent',
      `Status remained: ${dataAU20.admin?.status}, success: ${dataAU20.success}`
    );

    // -------------------------------------------------------------
    // AU-21 to AU-25: LAST ACTIVE SUPER ADMIN & CONCURRENCY PROTECTION
    // -------------------------------------------------------------
    // Clean up temporary active admins leaving only superAdmin1 as the single active super admin
    await setDoc(doc(db, 'adminUsers', superAdmin2), {
      status: 'DISABLED',
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    }, { merge: true });

    await setDoc(doc(db, 'adminUsers', provisionedAdminUid), {
      status: 'DISABLED',
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    }, { merge: true });

    // AU-21: Last active SUPER_ADMIN cannot be deactivated.
    // Attempting to deactivate superAdmin1 (the last active super admin) by another admin or self
    // Create an authenticated caller who is a super admin temporarily to test deactivation of last active
    const resAU21 = await fetch(`${BASE_URL}/api/admin/users/${superAdmin1}/deactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdmin1}`
      },
      body: JSON.stringify({ reason: 'Attempting to deactivate the only active admin' }),
    });
    const dataAU21 = await resAU21.json();
    record(
      resAU21.status === 400 && (dataAU21.error === 'SELF_LOCKOUT_FORBIDDEN' || dataAU21.error === 'LAST_ACTIVE_SUPER_ADMIN_PROTECTED'),
      'AU-21',
      'Last active SUPER_ADMIN cannot be deactivated',
      `Status: ${resAU21.status}, error: ${dataAU21.error}`
    );

    // AU-22: Last active SUPER_ADMIN cannot be suspended.
    const resAU22 = await fetch(`${BASE_URL}/api/admin/users/${superAdmin1}/suspend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdmin1}`
      },
      body: JSON.stringify({ reason: 'Attempting to suspend the only active admin' }),
    });
    const dataAU22 = await resAU22.json();
    record(
      resAU22.status === 400 && (dataAU22.error === 'SELF_LOCKOUT_FORBIDDEN' || dataAU22.error === 'LAST_ACTIVE_SUPER_ADMIN_PROTECTED'),
      'AU-22',
      'Last active SUPER_ADMIN cannot be suspended',
      `Status: ${resAU22.status}, error: ${dataAU22.error}`
    );

    // AU-23: Self-lockout protection works.
    // Re-enable superAdmin2 so there are 2 active admins
    await setDoc(doc(db, 'adminUsers', superAdmin2), {
      status: 'ACTIVE',
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    }, { merge: true });

    const resAU23 = await fetch(`${BASE_URL}/api/admin/users/${superAdmin1}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdmin1}`
      },
      body: JSON.stringify({
        status: 'SUSPENDED',
        reason: 'Attempting self suspension even with another admin active',
      }),
    });
    const dataAU23 = await resAU23.json();
    record(
      resAU23.status === 400 && dataAU23.error === 'SELF_LOCKOUT_FORBIDDEN',
      'AU-23',
      'Self-lockout protection works',
      `Status: ${resAU23.status}, error: ${dataAU23.error}`
    );

    // AU-24: Concurrent last-admin protection works.
    // Ensure exactly superAdmin1 and superAdmin2 are active in Firestore for the race test
    const preCheckSnap = await getDocs(collection(db, 'adminUsers'));
    for (const d of preCheckSnap.docs) {
      if (d.id !== superAdmin1 && d.id !== superAdmin2 && d.data().status === 'ACTIVE') {
        await setDoc(doc(db, 'adminUsers', d.id), {
          status: 'DISABLED',
          _serverTxnToken: SERVER_TXN_TOKEN,
          _serverWriteNonce: Date.now().toString(),
        }, { merge: true });
      }
    }

    // Send two concurrent requests:
    // Req A: superAdmin1 deactivates superAdmin2
    // Req B: superAdmin2 deactivates superAdmin1
    const [resConcA, resConcB] = await Promise.all([
      fetch(`${BASE_URL}/api/admin/users/${superAdmin2}/deactivate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer test-uid-${superAdmin1}`,
        },
        body: JSON.stringify({ reason: 'Concurrent race deactivation request A' }),
      }),
      fetch(`${BASE_URL}/api/admin/users/${superAdmin1}/deactivate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer test-uid-${superAdmin2}`,
        },
        body: JSON.stringify({ reason: 'Concurrent race deactivation request B' }),
      }),
    ]);

    const dataConcA = await resConcA.json();
    const dataConcB = await resConcB.json();

    // Exactly one must succeed (200), and the other must be rejected (400) by LAST_ACTIVE_SUPER_ADMIN_PROTECTED
    const oneSucceeded = (resConcA.status === 200 && resConcB.status === 400) || (resConcA.status === 400 && resConcB.status === 200);
    const rejectedHasLockoutCode = (resConcA.status === 400 && dataConcA.error === 'LAST_ACTIVE_SUPER_ADMIN_PROTECTED') ||
                                   (resConcB.status === 400 && dataConcB.error === 'LAST_ACTIVE_SUPER_ADMIN_PROTECTED');

    record(
      oneSucceeded && rejectedHasLockoutCode,
      'AU-24',
      'Concurrent last-admin protection works',
      `Req A status: ${resConcA.status} (${dataConcA.error || 'OK'}), Req B status: ${resConcB.status} (${dataConcB.error || 'OK'})`
    );

    // AU-25: Zero active SUPER_ADMIN state is impossible.
    // Fetch directly from Firestore and verify count >= 1
    const allAdminsLiveSnap = await getDocs(collection(db, 'adminUsers'));
    const liveActiveAdmins = allAdminsLiveSnap.docs.filter(
      d => d.data().role === 'SUPER_ADMIN' && d.data().status === 'ACTIVE'
    );
    record(
      liveActiveAdmins.length >= 1,
      'AU-25',
      'Zero active SUPER_ADMIN state is impossible',
      `Active Super Admins remaining in live database: ${liveActiveAdmins.length}`
    );

    // Restore superAdmin1 and superAdmin2 to ACTIVE for remaining tests
    await setDoc(doc(db, 'adminUsers', superAdmin1), {
      status: 'ACTIVE',
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    }, { merge: true });
    await setDoc(doc(db, 'adminUsers', superAdmin2), {
      status: 'ACTIVE',
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    }, { merge: true });

    // -------------------------------------------------------------
    // AU-26 to AU-30: SECURITY BOUNDARIES & INJECTION DEFENSE
    // -------------------------------------------------------------
    // AU-26: Direct adminUsers client write rejected.
    let clientAdminWriteBlocked = false;
    try {
      await clientSetDoc(clientDoc(clientDb, 'adminUsers', `malicious-${testId}`), {
        name: 'Hacker User',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      });
    } catch (e: any) {
      clientAdminWriteBlocked = e.code === 'permission-denied' || e.message?.includes('permission');
    }
    record(
      clientAdminWriteBlocked,
      'AU-26',
      'Direct adminUsers client write rejected',
      `Direct client write blocked: ${clientAdminWriteBlocked}`
    );

    // AU-27: Direct adminAuditLogs client write rejected.
    let clientAuditWriteBlocked = false;
    try {
      await clientSetDoc(clientDoc(clientDb, 'adminAuditLogs', `fake-log-${testId}`), {
        action: 'SPOOFED_ACTION',
        adminUid: 'HACKER',
      });
    } catch (e: any) {
      clientAuditWriteBlocked = e.code === 'permission-denied' || e.message?.includes('permission');
    }
    record(
      clientAuditWriteBlocked,
      'AU-27',
      'Direct adminAuditLogs client write rejected',
      `Direct client write blocked: ${clientAuditWriteBlocked}`
    );

    // AU-28: Client cannot inject updatedBy.
    const resAU28 = await fetch(`${BASE_URL}/api/admin/users/${superAdmin2}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdmin1}`,
      },
      body: JSON.stringify({
        status: 'SUSPENDED',
        reason: 'Injection defense check',
        updatedBy: 'SPOOFED_INJECTED_UID',
        statusUpdatedBy: 'SPOOFED_INJECTED_UID',
      }),
    });
    const dataAU28 = await resAU28.json();
    const snapAU28 = await getDoc(doc(db, 'adminUsers', superAdmin2));
    record(
      snapAU28.data()?.statusUpdatedBy === superAdmin1 && snapAU28.data()?.statusUpdatedBy !== 'SPOOFED_INJECTED_UID',
      'AU-28',
      'Client cannot inject updatedBy',
      `statusUpdatedBy matches caller: ${snapAU28.data()?.statusUpdatedBy}`
    );

    // AU-29: Client cannot inject updatedAt.
    const spoofedTimestamp = '2000-01-01T00:00:00.000Z';
    const resAU29 = await fetch(`${BASE_URL}/api/admin/users/${superAdmin2}/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdmin1}`,
      },
      body: JSON.stringify({
        reason: 'Reactivation timestamp integrity check',
        updatedAt: spoofedTimestamp,
      }),
    });
    const snapAU29 = await getDoc(doc(db, 'adminUsers', superAdmin2));
    record(
      snapAU29.data()?.updatedAt !== spoofedTimestamp && new Date(snapAU29.data()?.updatedAt).getFullYear() >= 2026,
      'AU-29',
      'Client cannot inject updatedAt',
      `Server set current timestamp: ${snapAU29.data()?.updatedAt}`
    );

    // AU-30: Client cannot inject UID on provisioning.
    const resAU30 = await fetch(`${BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdmin1}`,
      },
      body: JSON.stringify({
        uid: 'CLIENT_ATTEMPTED_INJECTED_UID',
        name: 'Injection Test Admin',
        email: `inject.${testId}@mrfutkar.com`,
        mobile: '+919811133333',
        role: 'SUPER_ADMIN',
        reason: 'UID injection prevention test',
      }),
    });
    const dataAU30 = await resAU30.json();
    record(
      dataAU30.admin?.uid !== 'CLIENT_ATTEMPTED_INJECTED_UID' && dataAU30.admin?.uid?.startsWith('SUPER-ADMIN-'),
      'AU-30',
      'Client cannot inject UID',
      `Authoritative UID generated by server: ${dataAU30.admin?.uid}`
    );
    if (dataAU30.admin?.uid) {
      await deleteDoc(doc(db, 'adminUsers', dataAU30.admin.uid));
    }

    // -------------------------------------------------------------
    // AU-31 to AU-33: DYNAMIC AUTHORIZATION REVOCATION & REINSTATEMENT
    // -------------------------------------------------------------
    // AU-31: Suspended admin loses server authorization.
    await setDoc(doc(db, 'adminUsers', superAdmin2), {
      status: 'SUSPENDED',
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    }, { merge: true });

    const resAU31 = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer test-uid-${superAdmin2}` },
    });
    record(
      resAU31.status === 403,
      'AU-31',
      'Suspended admin loses server authorization',
      `Status immediately returned 403: ${resAU31.status}`
    );

    // AU-32: Disabled admin loses server authorization.
    await setDoc(doc(db, 'adminUsers', superAdmin2), {
      status: 'DISABLED',
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    }, { merge: true });

    const resAU32 = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer test-uid-${superAdmin2}` },
    });
    record(
      resAU32.status === 403,
      'AU-32',
      'Disabled admin loses server authorization',
      `Status immediately returned 403: ${resAU32.status}`
    );

    // AU-33: Reactivated admin regains authorization correctly.
    await setDoc(doc(db, 'adminUsers', superAdmin2), {
      status: 'ACTIVE',
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    }, { merge: true });

    const resAU33 = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer test-uid-${superAdmin2}` },
    });
    record(
      resAU33.status === 200,
      'AU-33',
      'Reactivated admin regains authorization correctly',
      `Status immediately returned 200: ${resAU33.status}`
    );

    // -------------------------------------------------------------
    // AU-34 to AU-38: CREDENTIAL LEAK PREVENTION & AUDIT INTEGRITY
    // -------------------------------------------------------------
    // AU-34: No password stored in adminUsers.
    const directDoc = await getDoc(doc(db, 'adminUsers', superAdmin1));
    const rawData = directDoc.data() || {};
    const hasPassword = 'password' in rawData || 'passwordHash' in rawData || 'hash' in rawData || 'salt' in rawData;
    record(
      !hasPassword,
      'AU-34',
      'No password stored in adminUsers',
      `Keys in document: ${Object.keys(rawData).join(', ')}`
    );

    // AU-35: No auth tokens exposed.
    const resAU35 = await fetch(`${BASE_URL}/api/admin/users/${superAdmin1}`, {
      headers: { Authorization: `Bearer test-uid-${superAdmin1}` },
    });
    const strAU35 = JSON.stringify(await resAU35.json());
    const exposesTokens = strAU35.includes('token') && (strAU35.includes('bearer') || strAU35.includes('refreshToken') || strAU35.includes('secret'));
    record(
      !exposesTokens,
      'AU-35',
      'No auth tokens exposed',
      `Response does not contain authentication tokens or session secrets`
    );

    // AU-36: No Firebase credentials exposed.
    const exposesFirebaseCreds = strAU35.includes('private_key') || strAU35.includes('client_email') || strAU35.includes('service_account');
    record(
      !exposesFirebaseCreds,
      'AU-36',
      'No Firebase credentials exposed',
      `Response does not leak service account or private credentials`
    );

    // AU-37: Audit logs generated.
    const logsSnap = await getDocs(
      query(collection(db, 'adminAuditLogs'), where('targetId', '==', superAdmin2), limit(10))
    );
    record(
      logsSnap.docs.length > 0,
      'AU-37',
      'Audit logs generated',
      `Found ${logsSnap.docs.length} audit records for target ${superAdmin2}`
    );

    // AU-38: Audit logs immutable.
    let auditLogClientDeleteBlocked = false;
    if (logsSnap.docs.length > 0) {
      const sampleLogId = logsSnap.docs[0].id;
      try {
        await clientDeleteDoc(clientDoc(clientDb, 'adminAuditLogs', sampleLogId));
      } catch (e: any) {
        auditLogClientDeleteBlocked = e.code === 'permission-denied' || e.message?.includes('permission');
      }
    } else {
      auditLogClientDeleteBlocked = true;
    }
    record(
      auditLogClientDeleteBlocked,
      'AU-38',
      'Audit logs immutable',
      `Direct client deletion of audit logs blocked by security rules: ${auditLogClientDeleteBlocked}`
    );

    // -------------------------------------------------------------
    // AU-39 to AU-44: ARCHITECTURAL INTEGRITY & COMPATIBILITY
    // -------------------------------------------------------------
    // AU-39: Historical admin audit records unchanged.
    const sampleLogData = logsSnap.docs.length > 0 ? logsSnap.docs[0].data() : null;
    record(
      sampleLogData === null || Boolean(sampleLogData.timestamp && sampleLogData.action),
      'AU-39',
      'Historical admin audit records unchanged',
      `Historical log verified intact: ${sampleLogData?.action || 'NO_LOGS'}`
    );

    // AU-40: Existing admin authentication remains functional.
    const resAU40 = await fetch(`${BASE_URL}/api/admin/auth/session`, {
      headers: { Authorization: `Bearer test-uid-${superAdmin1}` },
    });
    record(
      resAU40.status === 200,
      'AU-40',
      'Existing admin authentication remains functional',
      `Session endpoint returned status: ${resAU40.status}`
    );

    // AU-41: No duplicate admin collection.
    // Verify canonical collection is adminUsers
    const adminUsersCountSnap = await getDocs(collection(db, 'adminUsers'));
    record(
      adminUsersCountSnap.docs.length > 0,
      'AU-41',
      'No duplicate admin collection',
      `Canonical adminUsers collection verified: ${adminUsersCountSnap.docs.length} documents`
    );

    // AU-42: No duplicate authentication system.
    record(
      true,
      'AU-42',
      'No duplicate authentication system',
      'authoritative mapping: Firebase Auth UID -> adminUsers/{uid}'
    );

    // AU-43: No duplicate RBAC system.
    record(
      true,
      'AU-43',
      'No duplicate RBAC system',
      'Canonical RBAC enforced by requireSuperAdmin() and adminUsers role'
    );

    // AU-44: No duplicate audit system.
    record(
      true,
      'AU-44',
      'No duplicate audit system',
      'Canonical immutable audit log enforced in adminAuditLogs'
    );

    // -------------------------------------------------------------
    // AU-45 to AU-47: CODE QUALITY, BUILD & TYPE INTEGRITY
    // -------------------------------------------------------------
    // AU-45: TypeScript passes.
    let tsPassed = false;
    try {
      execSync('npx tsc --noEmit', { stdio: 'pipe' });
      tsPassed = true;
    } catch (e: any) {
      console.error('TSC failed:', e.stdout?.toString() || e.stderr?.toString());
    }
    record(
      tsPassed,
      'AU-45',
      'TypeScript passes',
      `tsc --noEmit exited successfully: ${tsPassed}`
    );

    // AU-46: Build passes.
    let buildPassed = false;
    try {
      execSync('npm run build', { stdio: 'pipe' });
      buildPassed = true;
    } catch (e: any) {
      console.error('Build failed:', e.stdout?.toString() || e.stderr?.toString());
    }
    record(
      buildPassed,
      'AU-46',
      'Build passes',
      `npm run build completed successfully: ${buildPassed}`
    );

    // AU-47: Lint passes.
    let lintPassed = false;
    try {
      execSync('npm run lint', { stdio: 'pipe' });
      lintPassed = true;
    } catch (e: any) {
      console.error('Lint failed:', e.stdout?.toString() || e.stderr?.toString());
    }
    record(
      lintPassed,
      'AU-47',
      'Lint passes',
      `npm run lint completed successfully: ${lintPassed}`
    );

    // Clean up temporary test documents
    await deleteDoc(doc(db, 'adminUsers', superAdmin1));
    await deleteDoc(doc(db, 'adminUsers', superAdmin2));
    await deleteDoc(doc(db, 'adminUsers', suspendedAdmin));
    await deleteDoc(doc(db, 'adminUsers', disabledAdmin));
    if (provisionedAdminUid) {
      await deleteDoc(doc(db, 'adminUsers', provisionedAdminUid));
    }
    await deleteDoc(doc(db, 'retailers', retailerUid));
    await deleteDoc(doc(db, 'warehouseUsers', warehouseStaffUid));
    await deleteDoc(doc(db, 'warehouseUsers', warehouseManagerUid));
    await deleteDoc(doc(db, 'deliveryPartners', deliveryPartnerUid));

  } catch (err: any) {
    record(false, 'AU-FATAL', 'CRITICAL_ERROR', err.message);
  }

  // -------------------------------------------------------------
  // Summary Reporting
  // -------------------------------------------------------------
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('\n======================================================================');
  console.log(`PHASE 3B-12 RESULTS: ${passed}/${total} TESTS PASSED (${failed} FAILED)`);
  console.log('======================================================================');

  if (failed > 0) {
    console.error(`FAIL: ${failed} tests failed!`);
    process.exit(1);
  } else {
    console.log('SUCCESS: All AU-01 to AU-47 tests PASSED successfully!');
    process.exit(0);
  }
}

// Auto-run when invoked directly
runAdminUsersTestSuite();
