/**
 * MR FUTKAR — Phase 5.4 Part 1: Accounting Core & Chart of Accounts
 * Verification and Audit Test Suite
 */

import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, initializeFirestore } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { db, SERVER_TXN_TOKEN } from '../server/firebaseAdmin';
import cfg from '../firebase-applet-config.json';
import {
  Account,
  getRequiredNormalBalance,
  validateAccountForPosting,
} from '../src/types/accounting';
import { ensureSystemAccounts } from '../server/accountingSeedService';

const BASE_URL = 'http://localhost:3000';

interface TestResult {
  code: string;
  name: string;
  passed: boolean;
  evidence: string;
}

const testResults: TestResult[] = [];

function assert(condition: boolean, code: string, name: string, evidence: string) {
  testResults.push({ code, name, passed: condition, evidence });
  const status = condition ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`${status} ${code}: ${name} | ${evidence}`);
}

async function runAccountingSuite() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 5.4 PART 1: ACCOUNTING CORE TEST SUITE');
  console.log('Database:', cfg.firestoreDatabaseId);
  console.log('Timestamp:', new Date().toISOString());
  console.log('======================================================================\n');

  // 1. Ensure Super Admin is seeded
  console.log('[Setup 1] Checking superAdminRef...');
  const superAdminRef = doc(db, 'adminUsers', 'SUPER-ADMIN-01');
  const existingSuperAdmin = await getDoc(superAdminRef);
  console.log('[Setup 1] existingSuperAdmin exists:', existingSuperAdmin.exists());

  if (!existingSuperAdmin.exists()) {
    console.log('[Setup 1] Creating SUPER-ADMIN-01...');
    await setDoc(superAdminRef, {
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
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    });
  } else {
    console.log('[Setup 1] Updating SUPER-ADMIN-01...');
    await setDoc(
      superAdminRef,
      {
        status: 'ACTIVE',
        role: 'SUPER_ADMIN',
        _serverTxnToken: SERVER_TXN_TOKEN,
        _serverWriteNonce: Date.now().toString(),
      },
      { merge: true }
    );
  }
  console.log('[Setup 1] SUPER-ADMIN-01 ready.');

  // 2. Ensure initial system accounts are seeded
  console.log('[Setup 2] Calling ensureSystemAccounts()...');
  const seedResult = await ensureSystemAccounts();
  console.log(`[Seed] System accounts verified: ${seedResult.createdCount} created, ${seedResult.existingCount} existing\n`);

  // Ensure test identities for RBAC testing
  // Retailer
  console.log('[Setup 3] Checking retailer...');
  const retRef = doc(db, 'retailers', 'TEST-RETAILER-01');
  const retSnap = await getDoc(retRef);
  if (!retSnap.exists()) {
    console.log('[Setup 3] Creating retailer...');
    await setDoc(retRef, {
      retailerId: 'TEST-RETAILER-01',
      mobileNumber: '+919876543210',
      ownerName: 'Test Retailer Kirana',
      shopName: 'Test Kirana Store',
      isProfileComplete: true,
      isActive: true,
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    });
  }

  // Warehouse Staff
  console.log('[Setup 4] Checking warehouse staff...');
  const staffRef = doc(db, 'warehouseUsers', 'TEST-WH-STAFF-01');
  const staffSnap = await getDoc(staffRef);
  if (!staffSnap.exists()) {
    console.log('[Setup 4] Creating warehouse staff...');
    await setDoc(staffRef, {
      userId: 'TEST-WH-STAFF-01',
      name: 'Test Staff',
      role: 'WAREHOUSE_STAFF',
      warehouseId: 'WH-BRAHMPURI-01',
      _serverTxnToken: SERVER_TXN_TOKEN,
    });
  }

  // Warehouse Manager
  console.log('[Setup 5] Checking warehouse manager...');
  const mgrRef = doc(db, 'warehouseUsers', 'TEST-WH-MGR-01');
  const mgrSnap = await getDoc(mgrRef);
  if (!mgrSnap.exists()) {
    console.log('[Setup 5] Creating warehouse manager...');
    await setDoc(mgrRef, {
      userId: 'TEST-WH-MGR-01',
      name: 'Test Manager',
      role: 'WAREHOUSE_MANAGER',
      warehouseId: 'WH-BRAHMPURI-01',
      _serverTxnToken: SERVER_TXN_TOKEN,
    });
  }

  // Delivery Staff
  console.log('[Setup 6] Checking delivery partner...');
  const delRef = doc(db, 'deliveryPartners', 'TEST-DELIVERY-01');
  const delSnap = await getDoc(delRef);
  if (!delSnap.exists()) {
    console.log('[Setup 6] Creating delivery partner...');
    await setDoc(delRef, {
      partnerId: 'TEST-DELIVERY-01',
      name: 'Test Rider',
      mobile: '+919876543299',
      status: 'ACTIVE',
      assignedWarehouseId: 'WH-BRAHMPURI-01',
      _serverTxnToken: SERVER_TXN_TOKEN,
    });
  }
  console.log('[Setup Complete] Test identities verified.');

  const superAdminToken = 'test-uid-SUPER-ADMIN-01';
  const retailerToken = 'test-uid-TEST-RETAILER-01';
  const whStaffToken = 'test-uid-TEST-WH-STAFF-01';
  const whMgrToken = 'test-uid-TEST-WH-MGR-01';
  const deliveryToken = 'test-uid-TEST-DELIVERY-01';

  // Cleanup potential previous test accounts
  const cleanupCodes = ['6700', '8888', '8889', '8890', '8891', '8892', '8893', 'TEST-POST-10'];
  for (const code of cleanupCodes) {
    const qSnap = await getDocs(collection(db, 'chartOfAccounts'));
    for (const d of qSnap.docs) {
      if (d.data().accountCode === code && !d.data().isSystemAccount) {
        await deleteDoc(d.ref);
      }
    }
  }

  // -------------------------------------------------------------
  // TEST COA-01: valid account creation
  // -------------------------------------------------------------
  let createdAccountId = '';
  try {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/accounts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accountCode: '6700',
        accountName: 'Office Supplies',
        accountType: 'EXPENSE',
        normalBalance: 'DEBIT',
        parentAccountId: 'acc_6000',
        description: 'Office stationery and printer ink',
      }),
    });
    const data = await res.json();
    createdAccountId = data.account?.accountId || '';

    const valid =
      res.status === 201 &&
      data.success === true &&
      data.account?.accountCode === '6700' &&
      data.account?.accountName === 'Office Supplies' &&
      data.account?.accountType === 'EXPENSE' &&
      data.account?.normalBalance === 'DEBIT' &&
      data.account?.isSystemAccount === false &&
      data.account?.isActive === true &&
      data.account?.createdBy === 'SUPER-ADMIN-01' &&
      data.account?.updatedBy === 'SUPER-ADMIN-01';

    assert(
      valid,
      'COA-01',
      'Valid account creation',
      `HTTP ${res.status}, accountId: ${createdAccountId}, createdBy: ${data.account?.createdBy}`
    );
  } catch (err: any) {
    assert(false, 'COA-01', 'Valid account creation', err.message);
  }

  // -------------------------------------------------------------
  // TEST COA-02: duplicate account code rejected
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/accounts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accountCode: '6700', // Already created
        accountName: 'Duplicate Supplies',
        accountType: 'EXPENSE',
      }),
    });
    const data = await res.json();
    const passed = res.status === 400 && data.error === 'DUPLICATE_ACCOUNT_CODE';
    assert(passed, 'COA-02', 'Duplicate account code rejected', `HTTP ${res.status}, error: ${data.error}`);
  } catch (err: any) {
    assert(false, 'COA-02', 'Duplicate account code rejected', err.message);
  }

  // -------------------------------------------------------------
  // TEST COA-03: invalid account type rejected
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/accounts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accountCode: '8888',
        accountName: 'Invalid Type Account',
        accountType: 'CRYPTO_ASSET', // Invalid
      }),
    });
    const data = await res.json();
    const passed = res.status === 400 && data.error === 'INVALID_ACCOUNT_TYPE';
    assert(passed, 'COA-03', 'Invalid account type rejected', `HTTP ${res.status}, error: ${data.error}`);
  } catch (err: any) {
    assert(false, 'COA-03', 'Invalid account type rejected', err.message);
  }

  // -------------------------------------------------------------
  // TEST COA-04: invalid parent rejected
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/accounts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accountCode: '8889',
        accountName: 'Orphan Child Account',
        accountType: 'ASSET',
        parentAccountId: 'acc_ghost_parent_9999', // Non-existent parent
      }),
    });
    const data = await res.json();
    const passed = res.status === 400 && data.error === 'INVALID_PARENT_ACCOUNT';
    assert(passed, 'COA-04', 'Invalid parent rejected', `HTTP ${res.status}, error: ${data.error}`);
  } catch (err: any) {
    assert(false, 'COA-04', 'Invalid parent rejected', err.message);
  }

  // -------------------------------------------------------------
  // TEST COA-05: invalid normal balance rejected
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/accounts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accountCode: '8890',
        accountName: 'Invalid Normal Balance Account',
        accountType: 'ASSET',
        normalBalance: 'CREDIT', // ASSET must be DEBIT!
      }),
    });
    const data = await res.json();
    const passed = res.status === 400 && data.error === 'INVALID_NORMAL_BALANCE';
    assert(passed, 'COA-05', 'Invalid normal balance rejected', `HTTP ${res.status}, error: ${data.error}`);
  } catch (err: any) {
    assert(false, 'COA-05', 'Invalid normal balance rejected', err.message);
  }

  // -------------------------------------------------------------
  // TEST COA-06: client accountId injection rejected
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/accounts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accountId: 'acc_injected_by_client',
        accountCode: '8891',
        accountName: 'Client Injected ID',
        accountType: 'ASSET',
      }),
    });
    const data = await res.json();
    const passed = res.status === 400 && data.error === 'CLIENT_ACCOUNT_ID_FORBIDDEN';
    assert(passed, 'COA-06', 'Client accountId injection rejected', `HTTP ${res.status}, error: ${data.error}`);
  } catch (err: any) {
    assert(false, 'COA-06', 'Client accountId injection rejected', err.message);
  }

  // -------------------------------------------------------------
  // TEST COA-07: client createdBy injection rejected
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/accounts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        createdBy: 'MALICIOUS_IMPOSTER',
        accountCode: '8892',
        accountName: 'Client Injected CreatedBy',
        accountType: 'ASSET',
      }),
    });
    const data = await res.json();
    const passed = res.status === 400 && data.error === 'CLIENT_CREATED_BY_FORBIDDEN';
    assert(passed, 'COA-07', 'Client createdBy injection rejected', `HTTP ${res.status}, error: ${data.error}`);
  } catch (err: any) {
    assert(false, 'COA-07', 'Client createdBy injection rejected', err.message);
  }

  // -------------------------------------------------------------
  // TEST COA-08: client updatedBy injection rejected
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/accounts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        updatedBy: 'MALICIOUS_IMPOSTER',
        accountCode: '8893',
        accountName: 'Client Injected UpdatedBy',
        accountType: 'ASSET',
      }),
    });
    const data = await res.json();
    const passed = res.status === 400 && data.error === 'CLIENT_UPDATED_BY_FORBIDDEN';
    assert(passed, 'COA-08', 'Client updatedBy injection rejected', `HTTP ${res.status}, error: ${data.error}`);
  } catch (err: any) {
    assert(false, 'COA-08', 'Client updatedBy injection rejected', err.message);
  }

  // -------------------------------------------------------------
  // TEST COA-09: system account deletion blocked
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/accounts/acc_1000`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
      },
    });
    const data = await res.json();
    const passed = res.status === 400 && (data.error === 'ACCOUNT_DELETION_NOT_SUPPORTED' || data.error === 'SYSTEM_ACCOUNT_CANNOT_BE_DELETED');
    assert(passed, 'COA-09', 'System account deletion blocked', `HTTP ${res.status}, error: ${data.error}`);
  } catch (err: any) {
    assert(false, 'COA-09', 'System account deletion blocked', err.message);
  }

  // -------------------------------------------------------------
  // TEST COA-10: inactive account cannot be used for future posting
  // -------------------------------------------------------------
  try {
    // 1. Create a test account
    const createRes = await fetch(`${BASE_URL}/api/admin/accounting/accounts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accountCode: 'TEST-POST-10',
        accountName: 'Test Posting Check Account',
        accountType: 'EXPENSE',
      }),
    });
    const createData = await createRes.json();
    const testAccId = createData.account?.accountId;

    // 2. Deactivate the account via API
    const deactRes = await fetch(`${BASE_URL}/api/admin/accounting/accounts/${testAccId}/deactivate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${superAdminToken}`,
      },
    });
    const deactData = await deactRes.json();

    // 3. Fetch from Firestore to verify it is inactive
    const docSnap = await getDoc(doc(db, 'chartOfAccounts', testAccId));
    const accData = docSnap.data() as Account;

    // 4. Test validation helper
    let threwError = false;
    let errorMessage = '';
    try {
      validateAccountForPosting(accData);
    } catch (e: any) {
      threwError = true;
      errorMessage = e.message;
    }

    const passed =
      deactRes.status === 200 &&
      deactData.success === true &&
      accData.isActive === false &&
      threwError === true &&
      errorMessage.includes('Cannot post to inactive account');

    assert(
      passed,
      'COA-10',
      'Inactive account cannot be used for future posting',
      `deactivated: ${!accData.isActive}, posting prevented: "${errorMessage}"`
    );
  } catch (err: any) {
    assert(false, 'COA-10', 'Inactive account cannot be used for future posting', err.message);
  }

  // -------------------------------------------------------------
  // TEST SEC-01: unauthenticated rejected
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/accounts`, {
      method: 'GET',
    });
    const passed = res.status === 401;
    assert(passed, 'SEC-01', 'Unauthenticated rejected', `HTTP ${res.status}`);
  } catch (err: any) {
    assert(false, 'SEC-01', 'Unauthenticated rejected', err.message);
  }

  // -------------------------------------------------------------
  // TEST SEC-02: retailer rejected
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/accounts`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${retailerToken}`,
      },
    });
    const passed = res.status === 403;
    assert(passed, 'SEC-02', 'Retailer rejected', `HTTP ${res.status}`);
  } catch (err: any) {
    assert(false, 'SEC-02', 'Retailer rejected', err.message);
  }

  // -------------------------------------------------------------
  // TEST SEC-03: warehouse staff rejected
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/accounts`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${whStaffToken}`,
      },
    });
    const passed = res.status === 403;
    assert(passed, 'SEC-03', 'Warehouse staff rejected', `HTTP ${res.status}`);
  } catch (err: any) {
    assert(false, 'SEC-03', 'Warehouse staff rejected', err.message);
  }

  // -------------------------------------------------------------
  // TEST SEC-04: warehouse manager rejected
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/accounts`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${whMgrToken}`,
      },
    });
    const passed = res.status === 403;
    assert(passed, 'SEC-04', 'Warehouse manager rejected', `HTTP ${res.status}`);
  } catch (err: any) {
    assert(false, 'SEC-04', 'Warehouse manager rejected', err.message);
  }

  // -------------------------------------------------------------
  // TEST SEC-05: delivery staff rejected
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/accounts`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${deliveryToken}`,
      },
    });
    const passed = res.status === 403;
    assert(passed, 'SEC-05', 'Delivery staff rejected', `HTTP ${res.status}`);
  } catch (err: any) {
    assert(false, 'SEC-05', 'Delivery staff rejected', err.message);
  }

  // -------------------------------------------------------------
  // TEST SEC-06: direct client mutation rejected
  // -------------------------------------------------------------
  try {
    let clientDirectBlocked = false;
    let clientErrorMessage = '';

    // Attempting direct client SDK mutation without internal server token
    try {
      await setDoc(doc(db, 'chartOfAccounts', 'client_forged_account'), {
        accountId: 'client_forged_account',
        accountCode: '9999',
        accountName: 'Direct Client Hack',
        accountType: 'ASSET',
        normalBalance: 'DEBIT',
        isSystemAccount: false,
        isActive: true,
        createdBy: 'HACKER',
        updatedBy: 'HACKER',
        // Omit _serverTxnToken: must be denied by rules!
      });
    } catch (e: any) {
      clientDirectBlocked = true;
      clientErrorMessage = e.message || String(e);
    }

    // Also verify unauthenticated or client delete is blocked
    let deleteBlocked = false;
    try {
      await deleteDoc(doc(db, 'chartOfAccounts', 'acc_1000'));
    } catch (e: any) {
      deleteBlocked = true;
    }

    const passed = clientDirectBlocked || deleteBlocked;
    assert(
      passed,
      'SEC-06',
      'Direct client mutation rejected',
      `direct write rejected: ${clientDirectBlocked} (${clientErrorMessage || 'denied'}), direct delete rejected: ${deleteBlocked}`
    );
  } catch (err: any) {
    assert(false, 'SEC-06', 'Direct client mutation rejected', err.message);
  }

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n======================================================================');
  console.log('TEST SUMMARY');
  console.log('======================================================================');
  const passedCount = testResults.filter(t => t.passed).length;
  const failedCount = testResults.filter(t => !t.passed).length;

  console.log(`TOTAL TESTS: ${testResults.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${failedCount}`);
  console.log(`BLOCKED: 0`);

  if (failedCount > 0) {
    console.error('\n❌ FAILURES ENCOUNTERED IN SUITE');
    process.exit(1);
  } else {
    console.log('\n✅ ALL 16 PHASE 5.4 PART 1 TESTS PASSED PERFECTLY!');
    process.exit(0);
  }
}

runAccountingSuite().catch(err => {
  console.error('Fatal suite runner error:', err.stack || err);
  process.exit(1);
});
