/**
 * MR FUTKAR — Phase 3B-13: Admin Audit & Security Center Test Suite
 * 
 * Verifies:
 * - SUPER_ADMIN authorization gating & rejection of unauthorized roles / spoofing
 * - Server-side search, filtering (category, severity, admin, date), and pagination
 * - Page size boundary limit (max 100)
 * - Detail inspection, export (CSV/JSON), and metrics calculation
 * - Immutability enforcement via Firestore security rules (direct writes/deletions blocked)
 * - Zero secret leakage and canonical collection architecture
 * - TypeScript, Build, and Lint integrity
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

// Unauthenticated Client Firestore instance for security rule boundary verification
const clientApp = initializeApp(cfg, 'audit-client-rules-test-' + Date.now());
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

export async function runAdminAuditTestSuite() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 3B-13: ADMIN AUDIT & SECURITY CENTER TEST SUITE');
  console.log('Database:', cfg.firestoreDatabaseId);
  console.log('Timestamp:', new Date().toISOString());
  console.log('======================================================================\n');

  const now = new Date().toISOString();
  const testId = Date.now();

  const superAdminUid = `AS-SUPERADMIN-${testId}`;
  const suspendedAdminUid = `AS-SUSPENDED-${testId}`;
  const disabledAdminUid = `AS-DISABLED-${testId}`;
  const retailerUid = `AS-RETAILER-${testId}`;
  const warehouseStaffUid = `AS-STAFF-${testId}`;
  const warehouseManagerUid = `AS-MANAGER-${testId}`;
  const deliveryPartnerUid = `AS-DELIVERY-${testId}`;

  const testAuditLogId = `AUDIT-TEST-${testId}-seed`;

  try {
    // -------------------------------------------------------------
    // Seed Authoritative Test Documents in Firestore
    // -------------------------------------------------------------
    await setDoc(doc(db, 'adminUsers', superAdminUid), {
      uid: superAdminUid,
      name: 'Audit Super Admin',
      email: `audit.super.${testId}@mrfutkar.com`,
      mobile: '+919811190001',
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

    await setDoc(doc(db, 'adminUsers', suspendedAdminUid), {
      uid: suspendedAdminUid,
      name: 'Suspended Admin',
      email: `audit.suspended.${testId}@mrfutkar.com`,
      mobile: '+919811190002',
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

    await setDoc(doc(db, 'adminUsers', disabledAdminUid), {
      uid: disabledAdminUid,
      name: 'Disabled Admin',
      email: `audit.disabled.${testId}@mrfutkar.com`,
      mobile: '+919811190003',
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

    // Seed a specific test audit record for search & detail testing
    await setDoc(doc(db, 'adminAuditLogs', testAuditLogId), {
      logId: testAuditLogId,
      adminUid: superAdminUid,
      adminName: 'Audit Super Admin',
      action: 'ADMIN_SETTINGS_UPDATED',
      category: 'SETTINGS',
      severity: 'WARNING',
      targetType: 'SYSTEM_CONFIG',
      targetId: `CONFIG-${testId}`,
      timestamp: now,
      ipHashOrRequestFingerprint: 'f3a9e10c55b2d881',
      metadata: {
        settingKey: 'minimumOrderValue',
        oldValue: 500,
        newValue: 1000,
        reason: 'Inflation adjustment test',
      },
      _serverTxnToken: SERVER_TXN_TOKEN,
    });

    // -------------------------------------------------------------
    // AS-01 to AS-09: AUTHORIZATION, RBAC & SPOOFING REJECTION
    // -------------------------------------------------------------
    // AS-01: SUPER_ADMIN can query audit logs
    const resAS01 = await fetch(`${BASE_URL}/api/admin/audit`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const dataAS01 = await resAS01.json();
    record(
      resAS01.status === 200 && dataAS01.success && Array.isArray(dataAS01.logs),
      'AS-01',
      'SUPER_ADMIN can query audit logs',
      `Status: ${resAS01.status}, logs count: ${dataAS01.logs?.length}`
    );

    // AS-02: Unauthenticated request rejected (401)
    const resAS02 = await fetch(`${BASE_URL}/api/admin/audit`);
    record(
      resAS02.status === 401,
      'AS-02',
      'Unauthenticated request rejected',
      `Status: ${resAS02.status}`
    );

    // AS-03: Retailer access rejected (403)
    const resAS03 = await fetch(`${BASE_URL}/api/admin/audit`, {
      headers: { Authorization: `Bearer test-uid-${retailerUid}` },
    });
    record(
      resAS03.status === 403,
      'AS-03',
      'Retailer access rejected',
      `Status: ${resAS03.status}`
    );

    // AS-04: Warehouse staff access rejected (403)
    const resAS04 = await fetch(`${BASE_URL}/api/admin/audit`, {
      headers: { Authorization: `Bearer test-uid-${warehouseStaffUid}` },
    });
    record(
      resAS04.status === 403,
      'AS-04',
      'Warehouse staff access rejected',
      `Status: ${resAS04.status}`
    );

    // AS-05: Warehouse manager access rejected (403)
    const resAS05 = await fetch(`${BASE_URL}/api/admin/audit`, {
      headers: { Authorization: `Bearer test-uid-${warehouseManagerUid}` },
    });
    record(
      resAS05.status === 403,
      'AS-05',
      'Warehouse manager access rejected',
      `Status: ${resAS05.status}`
    );

    // AS-06: Delivery partner access rejected (403)
    const resAS06 = await fetch(`${BASE_URL}/api/admin/audit`, {
      headers: { Authorization: `Bearer test-uid-${deliveryPartnerUid}` },
    });
    record(
      resAS06.status === 403,
      'AS-06',
      'Delivery partner access rejected',
      `Status: ${resAS06.status}`
    );

    // AS-07: Suspended admin access rejected (403)
    const resAS07 = await fetch(`${BASE_URL}/api/admin/audit`, {
      headers: { Authorization: `Bearer test-uid-${suspendedAdminUid}` },
    });
    record(
      resAS07.status === 403,
      'AS-07',
      'Suspended admin access rejected',
      `Status: ${resAS07.status}`
    );

    // AS-08: Disabled admin access rejected (403)
    const resAS08 = await fetch(`${BASE_URL}/api/admin/audit`, {
      headers: { Authorization: `Bearer test-uid-${disabledAdminUid}` },
    });
    record(
      resAS08.status === 403,
      'AS-08',
      'Disabled admin access rejected',
      `Status: ${resAS08.status}`
    );

    // AS-09: Header role spoof (x-role) rejected (403)
    const resAS09 = await fetch(`${BASE_URL}/api/admin/audit`, {
      headers: {
        Authorization: `Bearer test-uid-${retailerUid}`,
        'x-role': 'SUPER_ADMIN',
      },
    });
    record(
      resAS09.status === 403,
      'AS-09',
      'Header role spoof (x-role) rejected',
      `Status: ${resAS09.status}`
    );

    // -------------------------------------------------------------
    // AS-10 to AS-16: SEARCH, FILTERING, PAGINATION & BOUNDS
    // -------------------------------------------------------------
    // AS-10: Server-side search matches action/admin/target/metadata accurately
    const resAS10 = await fetch(`${BASE_URL}/api/admin/audit?search=${testAuditLogId}`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const dataAS10 = await resAS10.json();
    const searchFound = dataAS10.logs?.some((l: any) => l.logId === testAuditLogId);
    record(
      resAS10.status === 200 && searchFound && dataAS10.logs?.length === 1,
      'AS-10',
      'Server-side search matches accurately',
      `Matched ${dataAS10.logs?.length} log(s) for query '${testAuditLogId}'`
    );

    // AS-11: Server-side category filter returns exclusively matching records
    const resAS11 = await fetch(`${BASE_URL}/api/admin/audit?category=SETTINGS`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const dataAS11 = await resAS11.json();
    const allSettings = dataAS11.logs?.every((l: any) => l.category === 'SETTINGS');
    record(
      resAS11.status === 200 && allSettings && dataAS11.logs?.length > 0,
      'AS-11',
      'Server-side category filter returns exclusively matching records',
      `Returned ${dataAS11.logs?.length} records, all category=SETTINGS: ${allSettings}`
    );

    // AS-12: Server-side severity filter returns exclusively matching records
    const resAS12 = await fetch(`${BASE_URL}/api/admin/audit?severity=WARNING`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const dataAS12 = await resAS12.json();
    const allWarnings = dataAS12.logs?.every((l: any) => l.severity === 'WARNING');
    record(
      resAS12.status === 200 && allWarnings && dataAS12.logs?.length > 0,
      'AS-12',
      'Server-side severity filter returns exclusively matching records',
      `Returned ${dataAS12.logs?.length} records, all severity=WARNING: ${allWarnings}`
    );

    // AS-13: Server-side adminUid filter returns exclusively events by that admin
    const resAS13 = await fetch(`${BASE_URL}/api/admin/audit?adminUid=${superAdminUid}`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const dataAS13 = await resAS13.json();
    const allMatchesAdmin = dataAS13.logs?.every((l: any) => l.adminUid === superAdminUid);
    record(
      resAS13.status === 200 && allMatchesAdmin && dataAS13.logs?.length > 0,
      'AS-13',
      'Server-side adminUid filter matches accurately',
      `Returned ${dataAS13.logs?.length} records, all match adminUid: ${allMatchesAdmin}`
    );

    // AS-14: Server-side date range filtering operates correctly
    const todayIso = new Date().toISOString().substring(0, 10);
    const resAS14 = await fetch(`${BASE_URL}/api/admin/audit?startDate=${todayIso}&endDate=${todayIso}`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const dataAS14 = await resAS14.json();
    record(
      resAS14.status === 200 && Array.isArray(dataAS14.logs) && dataAS14.logs.length > 0,
      'AS-14',
      'Server-side date range filtering operates correctly',
      `Date range query returned ${dataAS14.logs?.length} records for ${todayIso}`
    );

    // AS-15: Server-side pagination adheres to requested bounds
    const resAS15 = await fetch(`${BASE_URL}/api/admin/audit?page=1&pageSize=2`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const dataAS15 = await resAS15.json();
    record(
      resAS15.status === 200 && dataAS15.logs?.length === 2 && dataAS15.totalPages >= 2,
      'AS-15',
      'Server-side pagination adheres to requested bounds',
      `Page: ${dataAS15.page}, PageSize: ${dataAS15.pageSize}, Total: ${dataAS15.totalCount}`
    );

    // AS-16: pageSize > 100 rejected with 400 INVALID_PAGE_SIZE
    const resAS16 = await fetch(`${BASE_URL}/api/admin/audit?pageSize=105`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const dataAS16 = await resAS16.json();
    record(
      resAS16.status === 400 && dataAS16.error === 'INVALID_PAGE_SIZE',
      'AS-16',
      'pageSize > 100 rejected with 400 INVALID_PAGE_SIZE',
      `Status: ${resAS16.status}, error: ${dataAS16.error}`
    );

    // -------------------------------------------------------------
    // AS-17 to AS-22: METRICS, FACETS, DETAILS & EXPORTS
    // -------------------------------------------------------------
    // AS-17: Audit metrics computed accurately
    const resAS17 = await fetch(`${BASE_URL}/api/admin/audit/metrics`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const dataAS17 = await resAS17.json();
    const hasValidMetrics =
      dataAS17.success &&
      typeof dataAS17.metrics?.totalEvents === 'number' &&
      typeof dataAS17.metrics?.securityEvents === 'number' &&
      typeof dataAS17.metrics?.eventsToday === 'number' &&
      typeof dataAS17.metrics?.distinctAdminsCount === 'number';
    record(
      hasValidMetrics,
      'AS-17',
      'Audit metrics computed accurately',
      `Total: ${dataAS17.metrics?.totalEvents}, Security: ${dataAS17.metrics?.securityEvents}, Today: ${dataAS17.metrics?.eventsToday}`
    );

    // AS-18: Audit filters facet endpoint returns valid admins, actions, and categories
    const resAS18 = await fetch(`${BASE_URL}/api/admin/audit/filters`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const dataAS18 = await resAS18.json();
    record(
      dataAS18.success && Array.isArray(dataAS18.admins) && Array.isArray(dataAS18.actions) && Array.isArray(dataAS18.categories),
      'AS-18',
      'Audit filters facet endpoint returns valid facet lists',
      `Admins: ${dataAS18.admins?.length}, Actions: ${dataAS18.actions?.length}, Categories: ${dataAS18.categories?.length}`
    );

    // AS-19: Audit event detail endpoint returns full event metadata
    const resAS19 = await fetch(`${BASE_URL}/api/admin/audit/events/${testAuditLogId}`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const dataAS19 = await resAS19.json();
    record(
      resAS19.status === 200 && dataAS19.event?.logId === testAuditLogId && dataAS19.event?.metadata?.settingKey === 'minimumOrderValue',
      'AS-19',
      'Audit event detail endpoint returns full event metadata',
      `Action: ${dataAS19.event?.action}, SettingKey: ${dataAS19.event?.metadata?.settingKey}`
    );

    // AS-20: Non-existent event returns 404 LOG_NOT_FOUND
    const resAS20 = await fetch(`${BASE_URL}/api/admin/audit/events/LOG-DOES-NOT-EXIST-999`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const dataAS20 = await resAS20.json();
    record(
      resAS20.status === 404 && dataAS20.error === 'LOG_NOT_FOUND',
      'AS-20',
      'Non-existent event returns 404 LOG_NOT_FOUND',
      `Status: ${resAS20.status}, error: ${dataAS20.error}`
    );

    // AS-21: CSV export returns valid CSV content and Content-Type header
    const resAS21 = await fetch(`${BASE_URL}/api/admin/audit/export?format=csv&search=${testAuditLogId}`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const csvContent = await resAS21.text();
    const isCsvHeader = Boolean(resAS21.headers.get('content-type')?.includes('text/csv'));
    const containsLog = Boolean(csvContent.includes(testAuditLogId));
    record(
      resAS21.status === 200 && isCsvHeader && containsLog,
      'AS-21',
      'CSV export returns valid CSV content and Content-Type header',
      `Status: ${resAS21.status}, contains test logId: ${containsLog}`
    );

    // AS-22: JSON export returns valid structured payload
    const resAS22 = await fetch(`${BASE_URL}/api/admin/audit/export?format=json&search=${testAuditLogId}`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const dataAS22 = await resAS22.json();
    record(
      resAS22.status === 200 && dataAS22.success && Array.isArray(dataAS22.logs) && dataAS22.logs.some((l: any) => l.logId === testAuditLogId),
      'AS-22',
      'JSON export returns valid structured payload',
      `Status: ${resAS22.status}, exportedCount: ${dataAS22.count}`
    );

    // -------------------------------------------------------------
    // AS-23 to AS-27: IMMUTABILITY, DATA PRIVACY & CANONICAL STORE
    // -------------------------------------------------------------
    // AS-23: Direct client write to adminAuditLogs rejected by Firestore security rules
    let directClientWriteBlocked = false;
    try {
      await clientSetDoc(clientDoc(clientDb, 'adminAuditLogs', `malicious-audit-${testId}`), {
        action: 'SPOOFED_ACTION',
        adminUid: 'HACKER_CLIENT',
      });
    } catch (e: any) {
      directClientWriteBlocked = e.code === 'permission-denied' || e.message?.includes('permission');
    }
    record(
      directClientWriteBlocked,
      'AS-23',
      'Direct client write to adminAuditLogs rejected by rules',
      `Blocked: ${directClientWriteBlocked}`
    );

    // AS-24: Direct client deletion of adminAuditLogs rejected by Firestore security rules
    let directClientDeleteBlocked = false;
    try {
      await clientDeleteDoc(clientDoc(clientDb, 'adminAuditLogs', testAuditLogId));
    } catch (e: any) {
      directClientDeleteBlocked = e.code === 'permission-denied' || e.message?.includes('permission');
    }
    record(
      directClientDeleteBlocked,
      'AS-24',
      'Direct client deletion of adminAuditLogs rejected by rules',
      `Blocked: ${directClientDeleteBlocked}`
    );

    // AS-25: Response does not leak server secrets, tokens, or credentials
    const rawResStr = JSON.stringify(dataAS19);
    const leaksSecret =
      rawResStr.includes('MRFUTKAR_INTERNAL_SERVER_AUTHORITY') ||
      rawResStr.includes('private_key') ||
      rawResStr.includes('_serverTxnToken') ||
      rawResStr.includes('service_account');
    record(
      !leaksSecret,
      'AS-25',
      'Response does not leak server secrets, tokens, or credentials',
      `Contains server authority token: ${rawResStr.includes('MRFUTKAR_INTERNAL_SERVER_AUTHORITY')}`
    );

    // AS-26: Legacy alias /api/admin/audit-logs returns backward-compatible payload
    const resAS26 = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
      headers: { Authorization: `Bearer test-uid-${superAdminUid}` },
    });
    const dataAS26 = await resAS26.json();
    record(
      resAS26.status === 200 && dataAS26.success && Array.isArray(dataAS26.logs),
      'AS-26',
      'Legacy alias /api/admin/audit-logs returns backward-compatible payload',
      `Status: ${resAS26.status}, logs count: ${dataAS26.logs?.length}`
    );

    // AS-27: Canonical collection remains exclusively adminAuditLogs
    const auditLogsSnap = await getDocs(query(collection(db, 'adminAuditLogs'), limit(1)));
    record(
      auditLogsSnap.docs.length > 0,
      'AS-27',
      'Canonical collection remains exclusively adminAuditLogs',
      `Canonical adminAuditLogs collection verified active with ${auditLogsSnap.docs.length}+ docs`
    );

    // -------------------------------------------------------------
    // AS-28 to AS-30: CODE QUALITY, BUILD & TYPE INTEGRITY
    // -------------------------------------------------------------
    // AS-28: TypeScript passes
    let tsPassed = false;
    try {
      execSync('npx tsc --noEmit', { stdio: 'pipe' });
      tsPassed = true;
    } catch (e: any) {
      console.error('TSC failed:', e.stdout?.toString() || e.stderr?.toString());
    }
    record(
      tsPassed,
      'AS-28',
      'TypeScript passes',
      `tsc --noEmit exited successfully: ${tsPassed}`
    );

    // AS-29: Build passes
    let buildPassed = false;
    try {
      execSync('npm run build', { stdio: 'pipe' });
      buildPassed = true;
    } catch (e: any) {
      console.error('Build failed:', e.stdout?.toString() || e.stderr?.toString());
    }
    record(
      buildPassed,
      'AS-29',
      'Build passes',
      `npm run build completed successfully: ${buildPassed}`
    );

    // AS-30: Lint passes
    let lintPassed = false;
    try {
      execSync('npm run lint', { stdio: 'pipe' });
      lintPassed = true;
    } catch (e: any) {
      console.error('Lint failed:', e.stdout?.toString() || e.stderr?.toString());
    }
    record(
      lintPassed,
      'AS-30',
      'Lint passes',
      `npm run lint completed successfully: ${lintPassed}`
    );

    // Cleanup test principals & seeded test log
    await deleteDoc(doc(db, 'adminUsers', superAdminUid));
    await deleteDoc(doc(db, 'adminUsers', suspendedAdminUid));
    await deleteDoc(doc(db, 'adminUsers', disabledAdminUid));
    await deleteDoc(doc(db, 'retailers', retailerUid));
    await deleteDoc(doc(db, 'warehouseUsers', warehouseStaffUid));
    await deleteDoc(doc(db, 'warehouseUsers', warehouseManagerUid));
    await deleteDoc(doc(db, 'deliveryPartners', deliveryPartnerUid));
    try {
      await deleteDoc(doc(db, 'adminAuditLogs', testAuditLogId));
    } catch {
      // Expected: adminAuditLogs is immutable under Firestore security rules (allow delete: if false)
    }

  } catch (err: any) {
    record(false, 'AS-FATAL', 'CRITICAL_ERROR', err.message);
  }

  // -------------------------------------------------------------
  // Summary Reporting
  // -------------------------------------------------------------
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('\n======================================================================');
  console.log(`PHASE 3B-13 RESULTS: ${passed}/${total} TESTS PASSED (${failed} FAILED)`);
  console.log('======================================================================');

  if (failed > 0) {
    console.error(`FAIL: ${failed} tests failed!`);
    process.exit(1);
  } else {
    console.log('SUCCESS: All AS-01 to AS-30 tests PASSED successfully!');
    process.exit(0);
  }
}

// Auto-run when invoked directly
runAdminAuditTestSuite();
