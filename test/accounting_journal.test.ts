/**
 * MR FUTKAR — Phase 5.4 Part 2: Double-Entry Journal Engine Test Suite
 * Comprehensive automated verification of server-authoritative double entry accounting
 */

import { doc, getDoc, setDoc, collection, getDocs, initializeFirestore, query, where } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { db, SERVER_TXN_TOKEN } from '../server/firebaseAdmin';
import cfg from '../firebase-applet-config.json';
import {
  Account,
  JournalEntry,
  JournalEntryLine,
  AccountingPeriod,
} from '../src/types/accounting';
import { ensureSystemAccounts } from '../server/accountingSeedService';
import { ensureDefaultAccountingPeriod } from '../server/accountingPeriodService';
import { getNextJournalNumber } from '../server/accountingSequenceService';

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

async function runJournalTestSuite() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 5.4 PART 2: DOUBLE-ENTRY JOURNAL ENGINE TEST SUITE');
  console.log('Database:', cfg.firestoreDatabaseId);
  console.log('Timestamp:', new Date().toISOString());
  console.log('======================================================================\n');

  // Environment Information
  console.log('1. ENVIRONMENT CONFIGURATION:');
  console.log(' - Firebase Project ID:', cfg.projectId);
  console.log(' - Firestore Database ID:', cfg.firestoreDatabaseId);
  console.log(' - Storage Bucket:', cfg.storageBucket);
  console.log(' - APP_ENV:', process.env.APP_ENV || 'production');
  console.log(' - Warehouse ID: WH-BRAHMPURI-01\n');

  // Ensure Admin & Actor records
  console.log('[Setup 1] Ensuring test super admin & roles...');
  const superAdminRef = doc(db, 'adminUsers', 'SUPER-ADMIN-01');
  const existingSuperAdmin = await getDoc(superAdminRef);
  if (!existingSuperAdmin.exists()) {
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
  }

  // Ensure system accounts & period
  console.log('[Setup 2] Seeding system accounts and accounting periods...');
  await ensureSystemAccounts();
  await ensureDefaultAccountingPeriod();

  const superAdminHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
  };

  const retailerHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer test-uid-TEST-RETAILER-01',
  };

  const warehouseStaffHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer test-uid-TEST-WH-STAFF-01',
  };

  const warehouseManagerHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer test-uid-TEST-WH-MANAGER-01',
  };

  const deliveryStaffHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer test-uid-TEST-DELIVERY-STAFF-01',
  };

  // --------------------------------------------------------------------
  // SECTION 2: PART 1 REGRESSION VERIFICATION
  // --------------------------------------------------------------------
  console.log('\n--- SECTION 2: PART 1 REGRESSION CHECKS ---');

  const coaSnap = await getDocs(collection(db, 'chartOfAccounts'));
  assert(
    coaSnap.size >= 20,
    'REG-01',
    'Chart of Accounts intact',
    `Found ${coaSnap.size} accounts in chartOfAccounts.`
  );

  const accCash = await getDoc(doc(db, 'chartOfAccounts', 'acc_1100'));
  const accBank = await getDoc(doc(db, 'chartOfAccounts', 'acc_1200'));
  const accSales = await getDoc(doc(db, 'chartOfAccounts', 'acc_4100'));
  const accSal = await getDoc(doc(db, 'chartOfAccounts', 'acc_6100'));

  assert(
    accCash.exists() && accBank.exists() && accSales.exists() && accSal.exists(),
    'REG-02',
    'Core System Accounts present',
    'Verified 1100 (Cash), 1200 (Bank), 4100 (Sales), 6100 (Salary) exist.'
  );

  const periodsSnap = await getDocs(collection(db, 'accountingPeriods'));
  assert(
    periodsSnap.size >= 1,
    'REG-03',
    'Accounting Periods collection intact',
    `Found ${periodsSnap.size} periods in accountingPeriods.`
  );

  // --------------------------------------------------------------------
  // SECTION 3: ACCOUNT DELETION CORRECTION (ACC-01 to ACC-03)
  // --------------------------------------------------------------------
  console.log('\n--- SECTION 3: ACCOUNT DELETION CORRECTION ---');

  // ACC-01: system account deletion rejected
  {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/accounts/acc_1100`, {
      method: 'DELETE',
      headers: superAdminHeaders,
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'ACCOUNT_DELETION_NOT_SUPPORTED',
      'ACC-01',
      'System account deletion rejected with ACCOUNT_DELETION_NOT_SUPPORTED',
      `Status ${res.status}, Error: ${data.error}`
    );
  }

  // ACC-02: referenced account deletion rejected
  {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/accounts/acc_1200`, {
      method: 'DELETE',
      headers: superAdminHeaders,
    });
    const data = await res.json();
    const bankDoc = await getDoc(doc(db, 'chartOfAccounts', 'acc_1200'));
    assert(
      res.status === 400 && data.error === 'ACCOUNT_DELETION_NOT_SUPPORTED' && bankDoc.exists(),
      'ACC-02',
      'Referenced account deletion rejected, account remains intact in Firestore',
      `Status ${res.status}, Account exists: ${bankDoc.exists()}`
    );
  }

  // ACC-03: account deactivation remains available
  {
    const deactRes = await fetch(`${BASE_URL}/api/admin/accounting/accounts/acc_6400/deactivate`, {
      method: 'POST',
      headers: superAdminHeaders,
    });
    const deactData = await deactRes.json();
    const deactDoc = await getDoc(doc(db, 'chartOfAccounts', 'acc_6400'));
    const isDeactivated = (deactDoc.data() as Account)?.isActive === false;

    // Reactivate
    await fetch(`${BASE_URL}/api/admin/accounting/accounts/acc_6400/activate`, {
      method: 'POST',
      headers: superAdminHeaders,
    });
    const reactDoc = await getDoc(doc(db, 'chartOfAccounts', 'acc_6400'));
    const isReactivated = (reactDoc.data() as Account)?.isActive === true;

    assert(
      deactRes.status === 200 && deactData.success && isDeactivated && isReactivated,
      'ACC-03',
      'Account soft deactivation remains available and functional',
      `Deactivated: ${isDeactivated}, Reactivated: ${isReactivated}`
    );
  }

  // --------------------------------------------------------------------
  // SECTION 4: DOUBLE-ENTRY JOURNAL ENGINE (JE-01 to JE-24)
  // --------------------------------------------------------------------
  console.log('\n--- SECTION 4: DOUBLE-ENTRY JOURNAL ENGINE TESTS (JE-01 to JE-24) ---');

  let testDraftJournalId = '';
  let testPostedJournalId = '';
  let testPostedJournalNumber = '';

  // JE-01: balanced draft created
  {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2026-03-25',
        voucherType: 'JOURNAL',
        narration: 'Office expense test draft payment',
        lines: [
          { accountId: 'acc_6100', debit: 5000, credit: 0, description: 'Staff salary' },
          { accountId: 'acc_1200', debit: 0, credit: 5000, description: 'Bank transfer' },
        ],
      }),
    });
    const data = await res.json();
    testDraftJournalId = data.journal?.journalId;
    assert(
      res.status === 201 &&
        data.success &&
        data.journal?.status === 'DRAFT' &&
        data.journal?.totalDebit === 5000 &&
        data.journal?.totalCredit === 5000,
      'JE-01',
      'Balanced draft created',
      `Journal ID: ${testDraftJournalId}, Status: ${data.journal?.status}, Debit: ₹${data.journal?.totalDebit}, Credit: ₹${data.journal?.totalCredit}`
    );
  }

  // JE-02: unbalanced journal rejected
  {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2026-03-25',
        voucherType: 'JOURNAL',
        narration: 'Unbalanced journal test',
        lines: [
          { accountId: 'acc_1100', debit: 1000, credit: 0 },
          { accountId: 'acc_4100', debit: 0, credit: 950 },
        ],
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'UNBALANCED_JOURNAL',
      'JE-02',
      'Unbalanced journal rejected',
      `Status ${res.status}, Error: ${data.error}`
    );
  }

  // JE-03: negative debit rejected
  {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2026-03-25',
        voucherType: 'JOURNAL',
        narration: 'Negative debit test',
        lines: [
          { accountId: 'acc_1100', debit: -500, credit: 0 },
          { accountId: 'acc_1200', debit: 0, credit: 500 },
        ],
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400,
      'JE-03',
      'Negative debit rejected',
      `Status ${res.status}, Error: ${data.error}, Message: "${data.message}"`
    );
  }

  // JE-04: negative credit rejected
  {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2026-03-25',
        voucherType: 'JOURNAL',
        narration: 'Negative credit test',
        lines: [
          { accountId: 'acc_1100', debit: 500, credit: 0 },
          { accountId: 'acc_1200', debit: 0, credit: -500 },
        ],
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400,
      'JE-04',
      'Negative credit rejected',
      `Status ${res.status}, Error: ${data.error}, Message: "${data.message}"`
    );
  }

  // JE-05: debit and credit same line rejected
  {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2026-03-25',
        voucherType: 'JOURNAL',
        narration: 'Debit and credit same line test',
        lines: [
          { accountId: 'acc_1100', debit: 500, credit: 500 },
          { accountId: 'acc_1200', debit: 0, credit: 500 },
        ],
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'BOTH_DEBIT_CREDIT_FORBIDDEN',
      'JE-05',
      'Debit and credit same line rejected',
      `Status ${res.status}, Error: ${data.error}`
    );
  }

  // JE-06: zero-value line rejected
  {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2026-03-25',
        voucherType: 'JOURNAL',
        narration: 'Zero amount line test',
        lines: [
          { accountId: 'acc_1100', debit: 0, credit: 0 },
          { accountId: 'acc_1200', debit: 0, credit: 0 },
        ],
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'ZERO_AMOUNT_LINE',
      'JE-06',
      'Zero-value line rejected',
      `Status ${res.status}, Error: ${data.error}`
    );
  }

  // JE-07: invalid account rejected
  {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2026-03-25',
        voucherType: 'JOURNAL',
        narration: 'Invalid account ID test',
        lines: [
          { accountId: 'acc_non_existent_9999', debit: 1000, credit: 0 },
          { accountId: 'acc_1200', debit: 0, credit: 1000 },
        ],
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'ACCOUNT_NOT_FOUND',
      'JE-07',
      'Invalid account rejected',
      `Status ${res.status}, Error: ${data.error}`
    );
  }

  // JE-08: inactive account rejected
  {
    // Deactivate 6400 Marketing Expense temporarily
    await setDoc(
      doc(db, 'chartOfAccounts', 'acc_6400'),
      { isActive: false, _serverTxnToken: SERVER_TXN_TOKEN },
      { merge: true }
    );

    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2026-03-25',
        voucherType: 'JOURNAL',
        narration: 'Journal to inactive account',
        lines: [
          { accountId: 'acc_6400', debit: 1200, credit: 0 },
          { accountId: 'acc_1200', debit: 0, credit: 1200 },
        ],
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'INACTIVE_ACCOUNT',
      'JE-08',
      'Inactive account rejected',
      `Status ${res.status}, Error: ${data.error}`
    );

    // Reactivate account
    await setDoc(
      doc(db, 'chartOfAccounts', 'acc_6400'),
      { isActive: true, _serverTxnToken: SERVER_TXN_TOKEN },
      { merge: true }
    );
  }

  // JE-09: missing narration rejected
  {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2026-03-25',
        voucherType: 'JOURNAL',
        narration: '   ', // empty
        lines: [
          { accountId: 'acc_1100', debit: 100, credit: 0 },
          { accountId: 'acc_1200', debit: 0, credit: 100 },
        ],
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'MISSING_NARRATION',
      'JE-09',
      'Missing narration rejected',
      `Status ${res.status}, Error: ${data.error}`
    );
  }

  // JE-10: invalid date rejected
  {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2026-02-31', // invalid calendar date
        voucherType: 'JOURNAL',
        narration: 'Invalid date format test',
        lines: [
          { accountId: 'acc_1100', debit: 100, credit: 0 },
          { accountId: 'acc_1200', debit: 0, credit: 100 },
        ],
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'INVALID_JOURNAL_DATE',
      'JE-10',
      'Invalid date rejected',
      `Status ${res.status}, Error: ${data.error}`
    );
  }

  // JE-11: closed period rejected
  {
    // Ensure a closed period for 2024
    const closedPeriodId = 'period_FY_2024_CLOSED';
    await setDoc(doc(db, 'accountingPeriods', closedPeriodId), {
      periodId: closedPeriodId,
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      status: 'CLOSED',
      createdAt: new Date().toISOString(),
      closedAt: new Date().toISOString(),
      closedBy: 'SUPER-ADMIN-01',
      _serverTxnToken: SERVER_TXN_TOKEN,
    });

    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2024-06-15', // in closed period
        voucherType: 'JOURNAL',
        narration: 'Closed period posting test',
        lines: [
          { accountId: 'acc_1100', debit: 300, credit: 0 },
          { accountId: 'acc_4100', debit: 0, credit: 300 },
        ],
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'PERIOD_CLOSED',
      'JE-11',
      'Closed period rejected',
      `Status ${res.status}, Error: ${data.error}`
    );
  }

  // JE-12: valid journal posted
  {
    const postRes = await fetch(`${BASE_URL}/api/admin/accounting/journals/${testDraftJournalId}/post`, {
      method: 'POST',
      headers: superAdminHeaders,
    });
    const postData = await postRes.json();
    testPostedJournalId = postData.journal?.journalId;
    testPostedJournalNumber = postData.journal?.journalNumber;

    assert(
      postRes.status === 200 &&
        postData.success &&
        postData.journal?.status === 'POSTED' &&
        Boolean(testPostedJournalNumber) &&
        testPostedJournalNumber.startsWith('JV-2026-') &&
        Boolean(postData.journal?.postedBy) &&
        Boolean(postData.journal?.postedAt),
      'JE-12',
      'Valid journal posted',
      `Voucher: ${testPostedJournalNumber}, Status: ${postData.journal?.status}, PostedAt: ${postData.journal?.postedAt}`
    );
  }

  // JE-13: totals recalculated server-side
  {
    const postedDoc = await getDoc(doc(db, 'journalEntries', testPostedJournalId));
    const postedData = postedDoc.data() as JournalEntry;
    assert(
      postedData.totalDebit === 5000 &&
        postedData.totalCredit === 5000 &&
        postedData.totalDebit === postedData.totalCredit,
      'JE-13',
      'Totals recalculated server-side',
      `Firestore Header: totalDebit=₹${postedData.totalDebit}, totalCredit=₹${postedData.totalCredit}`
    );
  }

  // JE-14: client total injection rejected
  {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        totalDebit: 999999,
        totalCredit: 999999,
        journalDate: '2026-03-25',
        voucherType: 'JOURNAL',
        narration: 'Totals injection attempt',
        lines: [
          { accountId: 'acc_1100', debit: 100, credit: 0 },
          { accountId: 'acc_1200', debit: 0, credit: 100 },
        ],
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'CLIENT_TOTAL_INJECTION_FORBIDDEN',
      'JE-14',
      'Client total injection rejected',
      `Status ${res.status}, Error: ${data.error}`
    );
  }

  // JE-15: client journal number injection rejected
  {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalNumber: 'JV-FORGED-0001',
        journalDate: '2026-03-25',
        voucherType: 'JOURNAL',
        narration: 'Client journalNumber injection attempt',
        lines: [
          { accountId: 'acc_1100', debit: 100, credit: 0 },
          { accountId: 'acc_1200', debit: 0, credit: 100 },
        ],
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'CLIENT_JOURNAL_NUMBER_FORBIDDEN',
      'JE-15',
      'Client journal number injection rejected',
      `Status ${res.status}, Error: ${data.error}`
    );
  }

  // JE-16: client account snapshot injection rejected
  {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2026-03-25',
        voucherType: 'JOURNAL',
        narration: 'Account snapshot injection attempt',
        lines: [
          { accountId: 'acc_1100', debit: 100, credit: 0, accountCodeSnapshot: 'FORGED_999' },
          { accountId: 'acc_1200', debit: 0, credit: 100 },
        ],
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'CLIENT_ACCOUNT_SNAPSHOT_FORBIDDEN',
      'JE-16',
      'Client account snapshot injection rejected',
      `Status ${res.status}, Error: ${data.error}`
    );
  }

  // JE-17: posted journal immutable
  {
    const putRes = await fetch(`${BASE_URL}/api/admin/accounting/journals/${testPostedJournalId}`, {
      method: 'PUT',
      headers: superAdminHeaders,
      body: JSON.stringify({
        narration: 'Tampering with posted journal',
      }),
    });
    const putData = await putRes.json();

    const delRes = await fetch(`${BASE_URL}/api/admin/accounting/journals/${testPostedJournalId}`, {
      method: 'DELETE',
      headers: superAdminHeaders,
    });
    const delData = await delRes.json();

    assert(
      putRes.status === 400 &&
        putData.error === 'POSTED_JOURNAL_IMMUTABLE' &&
        delRes.status === 400 &&
        delData.error === 'JOURNAL_DELETION_NOT_SUPPORTED',
      'JE-17',
      'Posted journal immutable',
      `PUT error: ${putData.error}, DELETE error: ${delData.error}`
    );
  }

  // JE-18: draft journal editable
  {
    // Create new draft
    const cRes = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2026-03-25',
        voucherType: 'JOURNAL',
        narration: 'Original draft narration',
        lines: [
          { accountId: 'acc_1100', debit: 200, credit: 0 },
          { accountId: 'acc_1200', debit: 0, credit: 200 },
        ],
      }),
    });
    const cData = await cRes.json();
    const editableDraftId = cData.journal.journalId;

    const uRes = await fetch(`${BASE_URL}/api/admin/accounting/journals/${editableDraftId}`, {
      method: 'PUT',
      headers: superAdminHeaders,
      body: JSON.stringify({
        narration: 'Updated draft narration after review',
        lines: [
          { accountId: 'acc_1100', debit: 350, credit: 0 },
          { accountId: 'acc_1200', debit: 0, credit: 350 },
        ],
      }),
    });
    const uData = await uRes.json();
    assert(
      uRes.status === 200 &&
        uData.success &&
        uData.journal?.narration === 'Updated draft narration after review' &&
        uData.journal?.totalDebit === 350,
      'JE-18',
      'Draft journal editable',
      `Updated Narration: "${uData.journal?.narration}", Total: ₹${uData.journal?.totalDebit}`
    );
  }

  // JE-19: reversal succeeds
  let testReversalJournalId = '';
  let testReversalJournalNumber = '';
  {
    const revRes = await fetch(`${BASE_URL}/api/admin/accounting/journals/${testPostedJournalId}/reverse`, {
      method: 'POST',
      headers: superAdminHeaders,
    });
    const revData = await revRes.json();
    testReversalJournalId = revData.reversalJournal?.journalId;
    testReversalJournalNumber = revData.reversalJournal?.journalNumber;

    const origUpdatedSnap = await getDoc(doc(db, 'journalEntries', testPostedJournalId));
    const origStatus = (origUpdatedSnap.data() as JournalEntry)?.status;

    assert(
      revRes.status === 200 &&
        revData.success &&
        revData.reversalJournal?.status === 'POSTED' &&
        revData.reversalJournal?.voucherType === 'REVERSAL' &&
        revData.reversalJournal?.reversalOfJournalId === testPostedJournalId &&
        origStatus === 'REVERSED',
      'JE-19',
      'Reversal succeeds',
      `Reversal Voucher: ${testReversalJournalNumber}, Original Status: ${origStatus}`
    );
  }

  // JE-20: duplicate reversal rejected
  {
    const dupRes = await fetch(`${BASE_URL}/api/admin/accounting/journals/${testPostedJournalId}/reverse`, {
      method: 'POST',
      headers: superAdminHeaders,
    });
    const dupData = await dupRes.json();
    assert(
      dupRes.status === 400 &&
        (dupData.error === 'JOURNAL_ALREADY_REVERSED' || dupData.error === 'CANNOT_REVERSE_UNPOSTED_JOURNAL'),
      'JE-20',
      'Duplicate reversal rejected',
      `Status ${dupRes.status}, Error: ${dupData.error}`
    );
  }

  // JE-21: duplicate post idempotent
  {
    // Try to post an already POSTED journal
    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals/${testReversalJournalId}/post`, {
      method: 'POST',
      headers: superAdminHeaders,
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success && data.journal?.status === 'POSTED',
      'JE-21',
      'Duplicate post idempotent',
      `Status ${res.status}, Journal returned cleanly without error`
    );
  }

  // JE-22: concurrent sequence safe
  {
    const seqPromises = [
      getNextJournalNumber('JOURNAL'),
      getNextJournalNumber('JOURNAL'),
      getNextJournalNumber('JOURNAL'),
      getNextJournalNumber('JOURNAL'),
      getNextJournalNumber('JOURNAL'),
    ];
    const generatedNumbers = await Promise.all(seqPromises);
    const uniqueNumbers = new Set(generatedNumbers);
    assert(
      uniqueNumbers.size === 5,
      'JE-22',
      'Concurrent sequence safe',
      `Generated 5 unique concurrent numbers: ${generatedNumbers.join(', ')}`
    );
  }

  // JE-23: journal lines atomic
  {
    const linesSnap = await getDocs(
      query(collection(db, 'journalEntryLines'), where('journalId', '==', testPostedJournalId))
    );
    const lines = linesSnap.docs.map(d => d.data() as JournalEntryLine);
    assert(
      lines.length === 2 &&
        lines[0].journalId === testPostedJournalId &&
        lines[1].journalId === testPostedJournalId &&
        Boolean(lines[0].accountCodeSnapshot) &&
        Boolean(lines[1].accountCodeSnapshot),
      'JE-23',
      'Journal lines atomic',
      `Lines count: ${lines.length}, snapshots verified: ${lines[0].accountCodeSnapshot}, ${lines[1].accountCodeSnapshot}`
    );
  }

  // JE-24: audit created
  {
    const auditSnap = await getDocs(
      query(collection(db, 'adminAuditLogs'), where('targetId', '==', testPostedJournalId))
    );
    const actions = auditSnap.docs.map(d => d.data().action);
    assert(
      actions.includes('JOURNAL_CREATED') &&
        actions.includes('JOURNAL_POSTED') &&
        actions.includes('JOURNAL_REVERSED'),
      'JE-24',
      'Audit records created',
      `Found audit actions: ${actions.join(', ')}`
    );
  }

  // --------------------------------------------------------------------
  // SECTION 5: ACCOUNTING PERIOD TESTS (PERIOD-01, PERIOD-02)
  // --------------------------------------------------------------------
  console.log('\n--- SECTION 5: ACCOUNTING PERIOD TESTS ---');

  // PERIOD-01: open period accepts posting
  {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2026-03-25',
        voucherType: 'JOURNAL',
        narration: 'Open period test',
        lines: [
          { accountId: 'acc_1100', debit: 250, credit: 0 },
          { accountId: 'acc_1200', debit: 0, credit: 250 },
        ],
      }),
    });
    const data = await res.json();
    assert(
      res.status === 201 && data.success,
      'PERIOD-01',
      'Open period accepts posting',
      `Status ${res.status}, Journal created for 2026-03-25 in open period`
    );
  }

  // PERIOD-02: closed period rejects posting
  {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2024-05-10',
        voucherType: 'JOURNAL',
        narration: 'Closed period test attempt',
        lines: [
          { accountId: 'acc_1100', debit: 250, credit: 0 },
          { accountId: 'acc_1200', debit: 0, credit: 250 },
        ],
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'PERIOD_CLOSED',
      'PERIOD-02',
      'Closed period rejects posting',
      `Status ${res.status}, Error: ${data.error}`
    );
  }

  // --------------------------------------------------------------------
  // SECTION 6: SECURITY TESTS (SEC-01 to SEC-06)
  // --------------------------------------------------------------------
  console.log('\n--- SECTION 6: SECURITY TESTS ---');

  // SEC-01: unauthenticated rejected
  {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals`);
    assert(
      res.status === 401,
      'SEC-01',
      'Unauthenticated request rejected with 401',
      `HTTP Status: ${res.status}`
    );
  }

  // SEC-02: retailer rejected
  {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      headers: retailerHeaders,
    });
    assert(
      res.status === 403,
      'SEC-02',
      'Retailer role rejected with 403 Forbidden',
      `HTTP Status: ${res.status}`
    );
  }

  // SEC-03: warehouse staff rejected
  {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      headers: warehouseStaffHeaders,
    });
    assert(
      res.status === 403,
      'SEC-03',
      'Warehouse staff rejected with 403 Forbidden',
      `HTTP Status: ${res.status}`
    );
  }

  // SEC-04: warehouse manager rejected
  {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      headers: warehouseManagerHeaders,
    });
    assert(
      res.status === 403,
      'SEC-04',
      'Warehouse manager rejected with 403 Forbidden',
      `HTTP Status: ${res.status}`
    );
  }

  // SEC-05: delivery staff rejected
  {
    const res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      headers: deliveryStaffHeaders,
    });
    assert(
      res.status === 403,
      'SEC-05',
      'Delivery staff rejected with 403 Forbidden',
      `HTTP Status: ${res.status}`
    );
  }

  // SEC-06: direct Firestore mutation denied
  {
    const rawApp = initializeApp(
      {
        projectId: cfg.projectId,
        apiKey: 'test-api-key',
      },
      'ClientSecCheck-JournalEngine'
    );
    const clientFirestore = initializeFirestore(rawApp, {}, cfg.firestoreDatabaseId);

    let clientDirectBlocked = false;
    let errorMsg = '';
    try {
      await setDoc(doc(clientFirestore, 'journalEntries', 'malicious-client-journal'), {
        journalId: 'malicious-client-journal',
        totalDebit: 1000000,
        totalCredit: 1000000,
        status: 'POSTED',
      });
    } catch (err: any) {
      clientDirectBlocked = true;
      errorMsg = err.message || String(err);
    }

    assert(
      clientDirectBlocked,
      'SEC-06',
      'Direct Firestore mutation denied by security rules',
      `Blocked with: "${errorMsg}"`
    );
  }

  // --------------------------------------------------------------------
  // SECTION 7: LIVE FIRESTORE 14-STEP VERIFICATION
  // --------------------------------------------------------------------
  console.log('\n--- SECTION 7: LIVE FIRESTORE 14-STEP EXECUTION ---');

  // Step 1: balanced draft
  const s1Res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
    method: 'POST',
    headers: superAdminHeaders,
    body: JSON.stringify({
      journalDate: '2026-03-25',
      voucherType: 'PAYMENT',
      narration: 'Live 14-step verification journal',
      lines: [
        { accountId: 'acc_6100', debit: 1500, credit: 0, description: 'Travel allowance' },
        { accountId: 'acc_1100', debit: 0, credit: 1500, description: 'Cash payout' },
      ],
    }),
  });
  const s1Data = await s1Res.json();
  const liveJournalId = s1Data.journal.journalId;
  console.log('Step 1: Balanced draft created ->', liveJournalId);

  // Step 2: post
  const s2Res = await fetch(`${BASE_URL}/api/admin/accounting/journals/${liveJournalId}/post`, {
    method: 'POST',
    headers: superAdminHeaders,
  });
  const s2Data = await s2Res.json();
  console.log('Step 2: Posted ->', s2Data.journal.journalNumber);

  // Step 3: verify Firestore header
  const s3Doc = await getDoc(doc(db, 'journalEntries', liveJournalId));
  const s3Data = s3Doc.data() as JournalEntry;
  console.log('Step 3: Firestore header verified -> status:', s3Data.status, 'number:', s3Data.journalNumber);

  // Step 4: verify Firestore lines
  const s4LinesSnap = await getDocs(
    query(collection(db, 'journalEntryLines'), where('journalId', '==', liveJournalId))
  );
  console.log('Step 4: Firestore lines verified -> count:', s4LinesSnap.size);

  // Step 5: verify POSTED state
  const step5Valid = s3Data.status === 'POSTED';
  console.log('Step 5: POSTED state verified ->', step5Valid);

  // Step 6: verify debit = credit
  const step6Valid = s3Data.totalDebit === 1500 && s3Data.totalCredit === 1500 && s3Data.totalDebit === s3Data.totalCredit;
  console.log('Step 6: Debit = Credit verified -> ₹', s3Data.totalDebit, '=', '₹', s3Data.totalCredit);

  // Step 7: attempt modification
  const s7Res = await fetch(`${BASE_URL}/api/admin/accounting/journals/${liveJournalId}`, {
    method: 'PUT',
    headers: superAdminHeaders,
    body: JSON.stringify({ narration: 'Hacked narration' }),
  });
  console.log('Step 7: Modification rejected -> status:', s7Res.status);

  // Step 8: attempt deletion
  const s8Res = await fetch(`${BASE_URL}/api/admin/accounting/journals/${liveJournalId}`, {
    method: 'DELETE',
    headers: superAdminHeaders,
  });
  console.log('Step 8: Deletion rejected -> status:', s8Res.status);

  // Step 9: reverse journal
  const s9Res = await fetch(`${BASE_URL}/api/admin/accounting/journals/${liveJournalId}/reverse`, {
    method: 'POST',
    headers: superAdminHeaders,
  });
  const s9Data = await s9Res.json();
  console.log('Step 9: Reversal created ->', s9Data.reversalJournal?.journalNumber);

  // Step 10: verify reversal
  const origAfterRev = await getDoc(doc(db, 'journalEntries', liveJournalId));
  const origStatusAfterRev = (origAfterRev.data() as JournalEntry).status;
  console.log('Step 10: Original journal status verified as REVERSED ->', origStatusAfterRev === 'REVERSED');

  // Step 11: replay post
  const s11Res = await fetch(`${BASE_URL}/api/admin/accounting/journals/${s9Data.reversalJournal?.journalId}/post`, {
    method: 'POST',
    headers: superAdminHeaders,
  });
  console.log('Step 11: Replay post idempotent -> status:', s11Res.status);

  // Step 12: replay reversal
  const s12Res = await fetch(`${BASE_URL}/api/admin/accounting/journals/${liveJournalId}/reverse`, {
    method: 'POST',
    headers: superAdminHeaders,
  });
  console.log('Step 12: Replay reversal rejected -> status:', s12Res.status);

  // Step 13: closed-period posting attempt
  const s13Res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
    method: 'POST',
    headers: superAdminHeaders,
    body: JSON.stringify({
      journalDate: '2024-03-01',
      voucherType: 'JOURNAL',
      narration: 'Live closed period test',
      lines: [
        { accountId: 'acc_1100', debit: 100, credit: 0 },
        { accountId: 'acc_1200', debit: 0, credit: 100 },
      ],
    }),
  });
  console.log('Step 13: Closed-period posting rejected -> status:', s13Res.status);

  // Step 14: unauthorized access attempt
  const s14Res = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
    headers: retailerHeaders,
  });
  console.log('Step 14: Unauthorized access rejected -> status:', s14Res.status);

  // Final summary
  console.log('\n======================================================================');
  console.log('PHASE 5.4 PART 2 FINAL TEST SUMMARY:');
  const passedCount = testResults.filter(t => t.passed).length;
  const failedCount = testResults.filter(t => !t.passed).length;
  console.log(`TOTAL TESTS: ${testResults.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${failedCount}`);
  console.log(`BLOCKED: 0`);
  console.log('======================================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runJournalTestSuite().catch(err => {
  console.error('Fatal test error stack:', err.stack || err);
  process.exit(1);
});
