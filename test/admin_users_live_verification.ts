/**
 * MR FUTKAR — Phase 3B-12: Admin User & Access Management
 * LIVE FIREBASE & BACKEND PRODUCTION VERIFICATION SUITE
 * 
 * Verifies live behavior, RBAC gating, lockout prevention,
 * input validation, uniqueness constraints, status lifecycle,
 * and immutable audit logging against the running dev server and live Firestore database.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN, OPERATIONAL_WAREHOUSE_ID } from '../server/firebaseAdmin';
import cfg from '../firebase-applet-config.json';

const BASE_URL = 'http://localhost:3000';

interface AuditCheck {
  code: string;
  category: string;
  name: string;
  passed: boolean;
  evidence: string;
}

const checks: AuditCheck[] = [];

function record(condition: boolean, code: string, category: string, name: string, evidence: string) {
  checks.push({ code, category, name, passed: condition, evidence });
  const badge = condition ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`${badge} [${category}] ${code}: ${name} | ${evidence}`);
}

async function runLiveVerification() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 3B-12: ADMIN USER & ACCESS MANAGEMENT VERIFICATION');
  console.log('Live Database:', cfg.firestoreDatabaseId);
  console.log('Timestamp:', new Date().toISOString());
  console.log('======================================================================\n');

  const now = new Date().toISOString();
  const testId = Date.now();

  // Test Principal UIDs
  const superAdminUid = `audit-superadmin-${testId}`;
  const secondSuperAdminUid = `audit-superadmin-2-${testId}`;
  const suspendedAdminUid = `audit-suspended-${testId}`;
  const disabledAdminUid = `audit-disabled-${testId}`;
  const retailerUid = `audit-retailer-${testId}`;
  const warehouseStaffUid = `audit-staff-${testId}`;
  const deliveryPartnerUid = `audit-delivery-${testId}`;

  try {
    // -------------------------------------------------------------
    // Setup Principals in Firestore
    // -------------------------------------------------------------
    await setDoc(doc(db, 'adminUsers', superAdminUid), {
      uid: superAdminUid,
      email: `audit.superadmin.${testId}@mrfutkar.com`,
      name: 'Audit Super Admin One',
      mobile: '+919811111111',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      isActive: true,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      createdAt: now,
      updatedAt: now,
      createdBy: 'AUDIT_SUITE',
      permissionsVersion: 1,
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    });

    await setDoc(doc(db, 'adminUsers', secondSuperAdminUid), {
      uid: secondSuperAdminUid,
      email: `audit.superadmin2.${testId}@mrfutkar.com`,
      name: 'Audit Super Admin Two',
      mobile: '+919822222222',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      isActive: true,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      createdAt: now,
      updatedAt: now,
      createdBy: 'AUDIT_SUITE',
      permissionsVersion: 1,
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    });

    await setDoc(doc(db, 'adminUsers', suspendedAdminUid), {
      uid: suspendedAdminUid,
      email: `audit.suspended.${testId}@mrfutkar.com`,
      name: 'Suspended Admin',
      mobile: '+919833333333',
      role: 'SUPER_ADMIN',
      status: 'SUSPENDED',
      isActive: false,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      createdAt: now,
      updatedAt: now,
      createdBy: 'AUDIT_SUITE',
      permissionsVersion: 1,
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    });

    await setDoc(doc(db, 'adminUsers', disabledAdminUid), {
      uid: disabledAdminUid,
      email: `audit.disabled.${testId}@mrfutkar.com`,
      name: 'Disabled Admin',
      mobile: '+919844444444',
      role: 'SUPER_ADMIN',
      status: 'DISABLED',
      isActive: false,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      createdAt: now,
      updatedAt: now,
      createdBy: 'AUDIT_SUITE',
      permissionsVersion: 1,
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    });

    await setDoc(doc(db, 'retailers', retailerUid), {
      retailerId: retailerUid,
      name: 'Retailer Test Store',
      status: 'ACTIVE',
      isActive: true,
      _serverTxnToken: SERVER_TXN_TOKEN,
    });

    await setDoc(doc(db, 'warehouseUsers', warehouseStaffUid), {
      userId: warehouseStaffUid,
      role: 'WAREHOUSE_STAFF',
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      _serverTxnToken: SERVER_TXN_TOKEN,
    });

    await setDoc(doc(db, 'deliveryPartners', deliveryPartnerUid), {
      partnerId: deliveryPartnerUid,
      accountStatus: 'ACTIVE',
      assignedWarehouseId: OPERATIONAL_WAREHOUSE_ID,
      _serverTxnToken: SERVER_TXN_TOKEN,
    });

    // =============================================================
    // 1. CANONICAL SETTINGS & COLLECTIONS AUDIT
    // =============================================================
    const adminUsersDoc = await getDoc(doc(db, 'adminUsers', superAdminUid));
    record(
      adminUsersDoc.exists(),
      'SEC-01',
      'CANONICAL_IDENTITY',
      'Authoritative adminUsers/{uid} storage',
      `adminUsers document exists and contains role: ${adminUsersDoc.data()?.role}`
    );

    // =============================================================
    // 2. RBAC & IDENTITY GATING FOR /api/admin/users
    // =============================================================
    // 2.1 Unauthenticated
    const resUnauth = await fetch(`${BASE_URL}/api/admin/users`);
    record(
      resUnauth.status === 401,
      'RBAC-01',
      'AUTHENTICATION',
      'Unauthenticated request blocked',
      `Expected 401, got ${resUnauth.status}`
    );

    // 2.2 Retailer
    const resRetailer = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer test-uid-${retailerUid}` },
    });
    record(
      resRetailer.status === 403,
      'RBAC-02',
      'ROLE_GATING',
      'Retailer access blocked',
      `Expected 403, got ${resRetailer.status}`
    );

    // 2.3 Warehouse Staff
    const resStaff = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer test-uid-${warehouseStaffUid}` },
    });
    record(
      resStaff.status === 403,
      'RBAC-03',
      'ROLE_GATING',
      'Warehouse staff access blocked',
      `Expected 403, got ${resStaff.status}`
    );

    // 2.4 Delivery Partner
    const resDelivery = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer test-uid-${deliveryPartnerUid}` },
    });
    record(
      resDelivery.status === 403,
      'RBAC-04',
      'ROLE_GATING',
      'Delivery partner access blocked',
      `Expected 403, got ${resDelivery.status}`
    );

    // 2.5 Suspended Super Admin
    const resSuspended = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer test-uid-${suspendedAdminUid}` },
    });
    record(
      resSuspended.status === 403,
      'RBAC-05',
      'STATUS_GATING',
      'Suspended super admin blocked',
      `Expected 403, got ${resSuspended.status}`
    );

    // 2.6 Disabled Super Admin
    const resDisabled = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer test-uid-${disabledAdminUid}` },
    });
    record(
      resDisabled.status === 403,
      'RBAC-06',
      'STATUS_GATING',
      'Disabled super admin blocked',
      `Expected 403, got ${resDisabled.status}`
    );

    // 2.7 Valid Super Admin
    const resSuperAdmin = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const superAdminData = await resSuperAdmin.json();
    record(
      resSuperAdmin.status === 200 && superAdminData.success === true,
      'RBAC-07',
      'AUTHORIZATION',
      'Active Super Admin authorized',
      `Status 200, users count: ${superAdminData.users?.length}`
    );

    // 2.8 Spoofing attempt: x-role header spoofing
    const resSpoof = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: {
        Authorization: `Bearer test-uid-${retailerUid}`,
        'x-role': 'SUPER_ADMIN',
        'x-admin': 'true',
      },
    });
    record(
      resSpoof.status === 403,
      'RBAC-08',
      'ANTI_SPOOFING',
      'Header role spoofing rejected',
      `Expected 403, got ${resSpoof.status}`
    );

    // =============================================================
    // 3. PAGINATION & BOUNDARY VALIDATION
    // =============================================================
    // 3.1 Page size > 100 rejected
    const resExcessivePageSize = await fetch(`${BASE_URL}/api/admin/users?pageSize=150`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const excessivePageSizeData = await resExcessivePageSize.json();
    record(
      resExcessivePageSize.status === 400 && excessivePageSizeData.error === 'INVALID_PAGE_SIZE',
      'PAG-01',
      'BOUNDS_ENFORCEMENT',
      'Page size > 100 rejected with 400',
      `Expected 400, got ${resExcessivePageSize.status}: ${excessivePageSizeData.message}`
    );

    // 3.2 Bounded pagination default
    const resPaginated = await fetch(`${BASE_URL}/api/admin/users?page=1&pageSize=2`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const paginatedData = await resPaginated.json();
    record(
      resPaginated.status === 200 && paginatedData.users.length <= 2 && paginatedData.pageSize === 2,
      'PAG-02',
      'SERVER_PAGINATION',
      'Server-side pagination adheres to requested bounds',
      `Returned ${paginatedData.users.length} users with totalPages: ${paginatedData.totalPages}`
    );

    // =============================================================
    // 4. FILTERING & SEARCH
    // =============================================================
    // 4.1 Filter by status ACTIVE
    const resActiveFilter = await fetch(`${BASE_URL}/api/admin/users?status=ACTIVE`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const activeFilterData = await resActiveFilter.json();
    const allActive = activeFilterData.users.every((u: any) => u.status === 'ACTIVE');
    record(
      resActiveFilter.status === 200 && allActive,
      'FLT-01',
      'STATUS_FILTER',
      'Filtering by ACTIVE returns exclusively active accounts',
      `Count: ${activeFilterData.users.length}, all ACTIVE: ${allActive}`
    );

    // 4.2 Search by UID
    const resSearch = await fetch(`${BASE_URL}/api/admin/users?search=${superAdminUid}`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const searchData = await resSearch.json();
    record(
      resSearch.status === 200 && searchData.users.some((u: any) => u.uid === superAdminUid),
      'SRCH-01',
      'SERVER_SEARCH',
      'Server-side search matches UID accurately',
      `Search found ${searchData.users.length} matching admin users`
    );

    // 4.3 Safe Fields Leak Audit
    const sampleUser = searchData.users[0];
    const hasSecretFields =
      '_serverTxnToken' in sampleUser ||
      '_serverWriteNonce' in sampleUser ||
      'password' in sampleUser ||
      'token' in sampleUser;
    record(
      !hasSecretFields && Boolean(sampleUser.name && sampleUser.role && sampleUser.status),
      'SEC-02',
      'DATA_SANITIZATION',
      'Response does not leak server authority tokens or secrets',
      `Fields present: ${Object.keys(sampleUser).join(', ')}`
    );

    // =============================================================
    // 5. ADMIN USER DETAIL & AUDIT HISTORY
    // =============================================================
    // 5.1 Non-existent UID returns 404
    const resNotFound = await fetch(`${BASE_URL}/api/admin/users/NON_EXISTENT_UID_999`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    record(
      resNotFound.status === 404,
      'DET-01',
      'NOT_FOUND_HANDLING',
      'Non-existent admin detail returns 404',
      `Expected 404, got ${resNotFound.status}`
    );

    // 5.2 Valid Admin Detail
    const resDetail = await fetch(`${BASE_URL}/api/admin/users/${superAdminUid}`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const detailData = await resDetail.json();
    record(
      resDetail.status === 200 && detailData.admin?.uid === superAdminUid && Array.isArray(detailData.auditLogs),
      'DET-02',
      'ADMIN_DETAIL',
      'Admin details and audit records retrieved',
      `Admin: ${detailData.admin?.name}, audit logs count: ${detailData.auditLogs?.length}`
    );

    // =============================================================
    // 6. ADMIN USER PROVISIONING & UNIQUENESS
    // =============================================================
    // 6.1 Missing name rejected
    const resInvalidName = await fetch(`${BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdminUid}`,
      },
      body: JSON.stringify({
        name: 'A',
        email: `new.admin.${testId}@mrfutkar.com`,
        mobile: '9899999999',
      }),
    });
    record(
      resInvalidName.status === 400,
      'PROV-01',
      'VALIDATION',
      'Invalid short name rejected',
      `Expected 400, got ${resInvalidName.status}`
    );

    // 6.2 Invalid email rejected
    const resInvalidEmail = await fetch(`${BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdminUid}`,
      },
      body: JSON.stringify({
        name: 'Valid Name',
        email: 'not-an-email',
        mobile: '9899999999',
      }),
    });
    record(
      resInvalidEmail.status === 400,
      'PROV-02',
      'VALIDATION',
      'Malformed email rejected',
      `Expected 400, got ${resInvalidEmail.status}`
    );

    // 6.3 Invalid mobile rejected
    const resInvalidMobile = await fetch(`${BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdminUid}`,
      },
      body: JSON.stringify({
        name: 'Valid Name',
        email: `valid.${testId}@mrfutkar.com`,
        mobile: '12345',
      }),
    });
    record(
      resInvalidMobile.status === 400,
      'PROV-03',
      'VALIDATION',
      'Invalid Indian mobile rejected',
      `Expected 400, got ${resInvalidMobile.status}`
    );

    // 6.4 Successful Admin Provisioning
    const newAdminEmail = `super.lead.${testId}@mrfutkar.com`;
    const newAdminMobile = '9876543210';
    const resProvision = await fetch(`${BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdminUid}`,
      },
      body: JSON.stringify({
        name: 'Deepak Verma',
        email: newAdminEmail,
        mobile: newAdminMobile,
        role: 'SUPER_ADMIN',
        reason: 'Operations regional supervisor provisioning',
      }),
    });
    const provisionData = await resProvision.json();
    const provisionedUid = provisionData.admin?.uid;

    record(
      resProvision.status === 201 && provisionData.success && Boolean(provisionedUid),
      'PROV-04',
      'CREATION',
      'Valid Super Admin provisioning succeeds',
      `Status 201, provisioned UID: ${provisionedUid}`
    );

    // 6.5 Duplicate email rejected
    const resDuplicateEmail = await fetch(`${BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdminUid}`,
      },
      body: JSON.stringify({
        name: 'Another Admin',
        email: newAdminEmail,
        mobile: '9812345678',
      }),
    });
    record(
      resDuplicateEmail.status === 409,
      'PROV-05',
      'UNIQUENESS',
      'Duplicate email rejected with 409 Conflict',
      `Expected 409, got ${resDuplicateEmail.status}`
    );

    // 6.6 Duplicate mobile rejected
    const resDuplicateMobile = await fetch(`${BASE_URL}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdminUid}`,
      },
      body: JSON.stringify({
        name: 'Another Admin',
        email: `different.${testId}@mrfutkar.com`,
        mobile: newAdminMobile,
      }),
    });
    record(
      resDuplicateMobile.status === 409,
      'PROV-06',
      'UNIQUENESS',
      'Duplicate mobile rejected with 409 Conflict',
      `Expected 409, got ${resDuplicateMobile.status}`
    );

    // =============================================================
    // 7. STATUS LIFECYCLE & LOCKOUT PROTECTIONS
    // =============================================================
    // 7.1 Reason required for status modification
    const resMissingReason = await fetch(`${BASE_URL}/api/admin/users/${provisionedUid}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdminUid}`,
      },
      body: JSON.stringify({
        status: 'SUSPENDED',
        reason: '  ',
      }),
    });
    record(
      resMissingReason.status === 400,
      'STAT-01',
      'AUDIT_REQUIREMENT',
      'Status change without reason rejected',
      `Expected 400, got ${resMissingReason.status}`
    );

    // 7.2 Self-Lockout Prevention: caller cannot suspend own account
    const resSelfSuspend = await fetch(`${BASE_URL}/api/admin/users/${superAdminUid}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdminUid}`,
      },
      body: JSON.stringify({
        status: 'SUSPENDED',
        reason: 'Attempting self suspension',
      }),
    });
    const selfSuspendData = await resSelfSuspend.json();
    record(
      resSelfSuspend.status === 400 && selfSuspendData.error === 'SELF_LOCKOUT_FORBIDDEN',
      'LOCK-01',
      'LOCKOUT_PREVENTION',
      'Self-lockout prevented: caller cannot suspend self',
      `Expected 400 SELF_LOCKOUT_FORBIDDEN, got ${resSelfSuspend.status}: ${selfSuspendData.message}`
    );

    // 7.3 Self-Lockout Prevention: caller cannot deactivate own account
    const resSelfDeactivate = await fetch(`${BASE_URL}/api/admin/users/${superAdminUid}/deactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdminUid}`,
      },
      body: JSON.stringify({
        reason: 'Attempting self deactivation',
      }),
    });
    record(
      resSelfDeactivate.status === 400,
      'LOCK-02',
      'LOCKOUT_PREVENTION',
      'Self-lockout prevented: caller cannot deactivate self',
      `Expected 400, got ${resSelfDeactivate.status}`
    );

    // 7.4 Legitimate status transition: ACTIVE -> SUSPENDED
    const resSuspendTarget = await fetch(`${BASE_URL}/api/admin/users/${provisionedUid}/suspend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdminUid}`,
      },
      body: JSON.stringify({
        reason: 'Security audit temporary freeze',
      }),
    });
    const suspendData = await resSuspendTarget.json();
    record(
      resSuspendTarget.status === 200 && suspendData.admin?.status === 'SUSPENDED',
      'STAT-02',
      'LIFECYCLE',
      'Super Admin can suspend another admin with audit reason',
      `Updated status: ${suspendData.admin?.status}`
    );

    // Verify in Firestore database directly
    const directSnap1 = await getDoc(doc(db, 'adminUsers', provisionedUid));
    record(
      directSnap1.data()?.status === 'SUSPENDED' && directSnap1.data()?.statusReason === 'Security audit temporary freeze',
      'STAT-03',
      'LIVE_FIRESTORE',
      'Firestore reflects SUSPENDED state and audit note',
      `Status: ${directSnap1.data()?.status}, Reason: ${directSnap1.data()?.statusReason}`
    );

    // 7.5 Legitimate status transition: SUSPENDED -> ACTIVE (Reactivation)
    const resReactivate = await fetch(`${BASE_URL}/api/admin/users/${provisionedUid}/reactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdminUid}`,
      },
      body: JSON.stringify({
        reason: 'Audit resolved, clearance granted',
      }),
    });
    const reactivateData = await resReactivate.json();
    record(
      resReactivate.status === 200 && reactivateData.admin?.status === 'ACTIVE',
      'STAT-04',
      'LIFECYCLE',
      'Reactivation restores status to ACTIVE',
      `Status: ${reactivateData.admin?.status}`
    );

    // 7.6 Legitimate status transition: ACTIVE -> DISABLED
    const resDeactivate = await fetch(`${BASE_URL}/api/admin/users/${provisionedUid}/deactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${superAdminUid}`,
      },
      body: JSON.stringify({
        reason: 'Contract completion deboarding',
      }),
    });
    const deactivateData = await resDeactivate.json();
    record(
      resDeactivate.status === 200 && deactivateData.admin?.status === 'DISABLED',
      'STAT-05',
      'LIFECYCLE',
      'Deactivation transitions status to DISABLED',
      `Status: ${deactivateData.admin?.status}`
    );

    // =============================================================
    // 8. IMMUTABLE AUDIT LOGGING VERIFICATION
    // =============================================================
    const resAuditLogs = await fetch(`${BASE_URL}/api/admin/users/${provisionedUid}/audit-logs`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const auditData = await resAuditLogs.json();
    const actionsRecorded = auditData.logs?.map((l: any) => l.action) || [];

    const hasCreatedLog = actionsRecorded.includes('ADMIN_USER_CREATED');
    const hasStatusUpdatedLog = actionsRecorded.includes('ADMIN_USER_STATUS_UPDATED');
    const hasSuspendedLog = actionsRecorded.includes('ADMIN_USER_SUSPENDED');
    const hasReactivatedLog = actionsRecorded.includes('ADMIN_USER_REACTIVATED');
    const hasDeactivatedLog = actionsRecorded.includes('ADMIN_USER_DEACTIVATED');

    record(
      hasCreatedLog && hasStatusUpdatedLog && hasSuspendedLog && hasReactivatedLog && hasDeactivatedLog,
      'AUD-01',
      'AUDIT_INTEGRITY',
      'All admin lifecycle actions logged immutably to adminAuditLogs',
      `Logged actions: ${actionsRecorded.join(', ')}`
    );

    // =============================================================
    // 9. PUBLIC ENDPOINTS LEAK PREVENTION AUDIT
    // =============================================================
    const resPublic = await fetch(`${BASE_URL}/api/settings/public`);
    const publicData = await resPublic.json();
    const publicStr = JSON.stringify(publicData);
    const leaksAdminInfo =
      publicStr.includes(superAdminUid) ||
      publicStr.includes(newAdminEmail) ||
      publicStr.includes('adminUsers') ||
      publicStr.includes('SUPER_ADMIN');

    record(
      !leaksAdminInfo && resPublic.status === 200,
      'SEC-03',
      'SECRET_LEAK_PREVENTION',
      'Public settings endpoint does not leak admin accounts or roles',
      `Public keys: ${Object.keys(publicData.settings || {}).slice(0, 5).join(', ')}...`
    );

    // Clean up provisioned temporary admin
    await deleteDoc(doc(db, 'adminUsers', provisionedUid));
    await deleteDoc(doc(db, 'adminUsers', superAdminUid));
    await deleteDoc(doc(db, 'adminUsers', secondSuperAdminUid));
    await deleteDoc(doc(db, 'adminUsers', suspendedAdminUid));
    await deleteDoc(doc(db, 'adminUsers', disabledAdminUid));
    await deleteDoc(doc(db, 'retailers', retailerUid));
    await deleteDoc(doc(db, 'warehouseUsers', warehouseStaffUid));
    await deleteDoc(doc(db, 'deliveryPartners', deliveryPartnerUid));

  } catch (err: any) {
    record(false, 'FATAL-01', 'CRITICAL_ERROR', 'Unexpected test failure', err.message);
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  const total = checks.length;
  const passed = checks.filter(c => c.passed).length;
  const failed = checks.filter(c => !c.passed).length;

  console.log('\n======================================================================');
  console.log(`AUDIT RESULTS: ${passed}/${total} CHECKS PASSED (${failed} FAILED)`);
  console.log('======================================================================');

  if (failed > 0) {
    console.error(`FAILURE: ${failed} verification checks failed!`);
    process.exit(1);
  } else {
    console.log('SUCCESS: All Phase 3B-12 verification checks PASSED successfully!');
    process.exit(0);
  }
}

runLiveVerification();
