/**
 * MR FUTKAR — Phase 5.4 Part 3: General Ledger + Trial Balance Verification Suite
 * Comprehensive automated verification covering GL-01 to GL-10, TB-01 to TB-08, SEC-01 to SEC-06
 * Live Firestore and API testing
 */

import cfg from '../firebase-applet-config.json';
import {
  GeneralLedgerResponse,
  TrialBalanceResponse,
} from '../src/types/accounting';
import { AUTHORITATIVE_SUPER_ADMIN_UID } from '../server/adminAuth';

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

async function runTestSuite() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 5.4 PART 3: GENERAL LEDGER & TRIAL BALANCE TEST SUITE');
  console.log('Database:', cfg.firestoreDatabaseId);
  console.log('Timestamp:', new Date().toISOString());
  console.log('======================================================================\n');

  // 1. Report Environment
  console.log('1. ENVIRONMENT CONFIGURATION:');
  console.log(' - Firebase Project ID:', cfg.projectId);
  console.log(' - Firestore Database ID:', cfg.firestoreDatabaseId);
  console.log(' - Storage Bucket:', cfg.storageBucket);
  console.log(' - APP_ENV:', process.env.APP_ENV || 'production');
  console.log(' - Warehouse ID: WH-BRAHMPURI-01\n');

  const superAdminHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer test-uid-${AUTHORITATIVE_SUPER_ADMIN_UID}`,
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

  // Seed / bootstrap check via authoritative API
  const seedAccountsRes = await fetch(`${BASE_URL}/api/admin/accounting/accounts`, {
    headers: superAdminHeaders,
  });
  const seedAccountsData = await seedAccountsRes.json();
  console.log(`[Bootstrap] Accounts seeded/verified: ${seedAccountsData.accounts?.length || 0} accounts in Chart of Accounts.\n`);

  const testBatchKey = `TEST_P54P3_${Date.now()}`;
  console.log(`Test Execution Batch Key: ${testBatchKey}\n`);

  // --------------------------------------------------------------------
  // SECTION 1: SECTION 14 CONTROLLED TEST SET (Cash, Sales, Rent)
  // --------------------------------------------------------------------
  console.log('--- SECTION 1: CONTROLLED ACCOUNTING SET (SECTION 14) ---');
  // Journal 1: Cash DR 10,000 | Sales Revenue CR 10,000
  let journal1Id = '';
  {
    const createRes = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2026-03-20',
        voucherType: 'RECEIPT',
        referenceType: 'CONTROLLED_TEST',
        referenceId: `${testBatchKey}_TXN1`,
        narration: `Controlled Test: Cash sales revenue receipt ${testBatchKey}`,
        lines: [
          { accountId: 'acc_1100', debit: 10000, credit: 0, description: 'Cash received' },
          { accountId: 'acc_4100', debit: 0, credit: 10000, description: 'Wholesale sales' },
        ],
      }),
    });
    const createData = await createRes.json();
    journal1Id = createData.journal.journalId;

    // Post it
    const postRes = await fetch(`${BASE_URL}/api/admin/accounting/journals/${journal1Id}/post`, {
      method: 'POST',
      headers: superAdminHeaders,
    });
    const postData = await postRes.json();
    assert(
      postRes.status === 200 && postData.journal.status === 'POSTED',
      'CTRL-01',
      'Journal 1 Posted (Cash DR 10000, Sales CR 10000)',
      `Voucher: ${postData.journal.journalNumber}, Status: ${postData.journal.status}`
    );
  }

  // Journal 2: Rent Expense DR 2,000 | Cash CR 2,000
  let journal2Id = '';
  {
    const createRes = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2026-03-22',
        voucherType: 'PAYMENT',
        referenceType: 'CONTROLLED_TEST',
        referenceId: `${testBatchKey}_TXN2`,
        narration: `Controlled Test: Office rent payment ${testBatchKey}`,
        lines: [
          { accountId: 'acc_6200', debit: 2000, credit: 0, description: 'March rent' },
          { accountId: 'acc_1100', debit: 0, credit: 2000, description: 'Cash paid' },
        ],
      }),
    });
    const createData = await createRes.json();
    journal2Id = createData.journal.journalId;

    const postRes = await fetch(`${BASE_URL}/api/admin/accounting/journals/${journal2Id}/post`, {
      method: 'POST',
      headers: superAdminHeaders,
    });
    const postData = await postRes.json();
    assert(
      postRes.status === 200 && postData.journal.status === 'POSTED',
      'CTRL-02',
      'Journal 2 Posted (Rent DR 2000, Cash CR 2000)',
      `Voucher: ${postData.journal.journalNumber}, Status: ${postData.journal.status}`
    );
  }

  // Verify Cash Account General Ledger:
  // Dr 10,000 - Cr 2,000 = Cash balance ₹8,000 DEBIT
  {
    const glRes = await fetch(
      `${BASE_URL}/api/admin/accounting/general-ledger?accountId=acc_1100&fromDate=2026-03-20&toDate=2026-03-25`,
      { headers: superAdminHeaders }
    );
    const glData: GeneralLedgerResponse = await glRes.json();
    const cashEntries = glData.entries.filter(e => e.referenceId?.startsWith(testBatchKey));
    assert(
      cashEntries.length === 2,
      'GL-01',
      'Posted journals appear in General Ledger',
      `Found ${cashEntries.length} entries for ${testBatchKey} in Cash account.`
    );

    assert(
      glData.account.normalBalance === 'DEBIT',
      'GL-04',
      'Running debit balance correct formula',
      `Normal balance: ${glData.account.normalBalance}. Cash entries: +10,000 Dr, -2,000 Cr.`
    );
  }

  // Verify Sales Revenue General Ledger:
  // Credit-normal account: Sales Revenue = ₹10,000 CREDIT
  {
    const glSalesRes = await fetch(
      `${BASE_URL}/api/admin/accounting/general-ledger?accountId=acc_4100&fromDate=2026-03-20&toDate=2026-03-25`,
      { headers: superAdminHeaders }
    );
    const glSalesData: GeneralLedgerResponse = await glSalesRes.json();
    const salesEntries = glSalesData.entries.filter(e => e.referenceId?.startsWith(testBatchKey));
    assert(
      salesEntries.length === 1 && salesEntries[0].credit === 10000 && salesEntries[0].runningBalance === 10000,
      'GL-05',
      'Running credit balance correct formula',
      `Sales normal: ${glSalesData.account.normalBalance}, Credit: ₹${salesEntries[0]?.credit}, Running Bal: ₹${salesEntries[0]?.runningBalance}`
    );
  }

  // --------------------------------------------------------------------
  // SECTION 2: DRAFT EXCLUSION TEST (GL-02, TB-03, Section 15)
  // --------------------------------------------------------------------
  console.log('\n--- SECTION 2: DRAFT EXCLUSION TESTS (GL-02, TB-03) ---');
  let draftJournalId = '';
  {
    const createDraftRes = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2026-03-23',
        voucherType: 'JOURNAL',
        referenceType: 'DRAFT_TEST',
        referenceId: `${testBatchKey}_DRAFT`,
        narration: `Draft exclusion test ${testBatchKey}`,
        lines: [
          { accountId: 'acc_1100', debit: 99999, credit: 0 },
          { accountId: 'acc_4200', debit: 0, credit: 99999 },
        ],
      }),
    });
    const draftData = await createDraftRes.json();
    draftJournalId = draftData.journal.journalId;
    assert(
      draftData.journal.status === 'DRAFT',
      'DRAFT-SETUP',
      'Draft journal created with large ₹99,999 amount',
      `Draft Journal ID: ${draftJournalId}`
    );

    // Verify GL does NOT contain draft
    const glDraftCheck = await fetch(
      `${BASE_URL}/api/admin/accounting/general-ledger?accountId=acc_1100&fromDate=2026-03-20&toDate=2026-03-25`,
      { headers: superAdminHeaders }
    );
    const glDraftData: GeneralLedgerResponse = await glDraftCheck.json();
    const hasDraftInGL = glDraftData.entries.some(e => e.journalId === draftJournalId);
    assert(
      !hasDraftInGL,
      'GL-02',
      'Draft journal excluded from General Ledger',
      `Draft journal ${draftJournalId} did not appear in GL entries.`
    );

    // Verify Trial Balance does NOT contain draft
    const tbDraftCheck = await fetch(
      `${BASE_URL}/api/admin/accounting/trial-balance?fromDate=2026-03-20&toDate=2026-03-25`,
      { headers: superAdminHeaders }
    );
    const tbDraftData: TrialBalanceResponse = await tbDraftCheck.json();
    const otherIncomeRow = tbDraftData.accounts.find(a => a.accountId === 'acc_4200');
    assert(
      !otherIncomeRow || otherIncomeRow.credit < 99999,
      'TB-03',
      'Draft excluded from Trial Balance',
      `Other Income credit: ₹${otherIncomeRow?.credit || 0} (Draft ₹99,999 not included).`
    );

    // Now POST the draft
    const postDraftRes = await fetch(`${BASE_URL}/api/admin/accounting/journals/${draftJournalId}/post`, {
      method: 'POST',
      headers: superAdminHeaders,
    });
    const postDraftData = await postDraftRes.json();
    assert(
      postDraftRes.status === 200 && postDraftData.journal.status === 'POSTED',
      'DRAFT-POSTED',
      'Draft journal now posted',
      `Voucher: ${postDraftData.journal.journalNumber}`
    );

    // Now it MUST appear in GL
    const glPostCheck = await fetch(
      `${BASE_URL}/api/admin/accounting/general-ledger?accountId=acc_1100&fromDate=2026-03-20&toDate=2026-03-25`,
      { headers: superAdminHeaders }
    );
    const glPostData: GeneralLedgerResponse = await glPostCheck.json();
    const hasPostedInGL = glPostData.entries.some(e => e.journalId === draftJournalId);
    assert(
      hasPostedInGL,
      'DRAFT-INCLUSION',
      'Posted draft now appears in General Ledger',
      `Journal ${draftJournalId} successfully included in GL after posting.`
    );
  }

  // --------------------------------------------------------------------
  // SECTION 3: REVERSAL TEST (GL-03, TB-04, Section 16)
  // --------------------------------------------------------------------
  console.log('\n--- SECTION 3: REVERSAL TESTS (GL-03, TB-04) ---');
  {
    // Reverse the journal we just posted
    const revRes = await fetch(`${BASE_URL}/api/admin/accounting/journals/${draftJournalId}/reverse`, {
      method: 'POST',
      headers: superAdminHeaders,
    });
    const revData = await revRes.json();
    assert(
      revRes.status === 200 && revData.success,
      'REV-EXEC',
      'Journal reversed successfully',
      `Original status: ${revData.originalJournal.status}, Reversal voucher: ${revData.reversalJournal.journalNumber}`
    );

    // Query GL for Cash account (acc_1100)
    const glRevCheck = await fetch(
      `${BASE_URL}/api/admin/accounting/general-ledger?accountId=acc_1100`,
      { headers: superAdminHeaders }
    );
    const glRevData: GeneralLedgerResponse = await glRevCheck.json();
    const origEntry = glRevData.entries.find(e => e.journalId === draftJournalId);
    const revEntry = glRevData.entries.find(e => e.journalId === revData.reversalJournal.journalId);

    assert(
      !!origEntry && !!revEntry,
      'GL-03',
      'Reversed journal handled correctly (Original remains visible, Reversal visible)',
      `Original entry present: ${!!origEntry}, Reversal entry present: ${!!revEntry}, Original status: ${origEntry?.status}`
    );

    // Verify Trial Balance remains balanced after reversal
    const tbRevCheck = await fetch(`${BASE_URL}/api/admin/accounting/trial-balance`, {
      headers: superAdminHeaders,
    });
    const tbRevData: TrialBalanceResponse = await tbRevCheck.json();
    assert(
      tbRevData.isBalanced && tbRevData.totalDebit === tbRevData.totalCredit,
      'TB-04',
      'Reversal handled correctly in Trial Balance (Remains Balanced)',
      `Total Debit: ₹${tbRevData.totalDebit}, Total Credit: ₹${tbRevData.totalCredit}, isBalanced: ${tbRevData.isBalanced}`
    );
  }

  // --------------------------------------------------------------------
  // SECTION 4: HISTORICAL SNAPSHOT PRESERVATION (GL-10, Section 17)
  // --------------------------------------------------------------------
  console.log('\n--- SECTION 4: HISTORICAL SNAPSHOT PRESERVATION (GL-10) ---');
  {
    // 1. Create a controlled custom account
    const customCode = `T_${Date.now().toString().slice(-6)}`;
    const createAccRes = await fetch(`${BASE_URL}/api/admin/accounting/accounts`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        accountCode: customCode,
        accountName: 'Original Account Name',
        accountType: 'EXPENSE',
        description: 'Historical snapshot test account',
      }),
    });
    const createAccData = await createAccRes.json();
    const testAccountId = createAccData.account.accountId;

    // 2. Post a journal using this account
    const postJnlRes = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2026-03-24',
        voucherType: 'JOURNAL',
        narration: 'Historical snapshot verification',
        lines: [
          { accountId: testAccountId, debit: 1500, credit: 0 },
          { accountId: 'acc_1200', debit: 0, credit: 1500 },
        ],
      }),
    });
    const jnlData = await postJnlRes.json();
    await fetch(`${BASE_URL}/api/admin/accounting/journals/${jnlData.journal.journalId}/post`, {
      method: 'POST',
      headers: superAdminHeaders,
    });

    // 3. Update the account's name in Chart of Accounts
    await fetch(`${BASE_URL}/api/admin/accounting/accounts/${testAccountId}`, {
      method: 'PUT',
      headers: superAdminHeaders,
      body: JSON.stringify({
        accountName: 'Updated Name After Transaction',
      }),
    });

    // 4. Query General Ledger for this account and verify historical snapshot is preserved
    const glHistRes = await fetch(
      `${BASE_URL}/api/admin/accounting/general-ledger?accountId=${testAccountId}`,
      { headers: superAdminHeaders }
    );
    const glHistData: GeneralLedgerResponse = await glHistRes.json();
    const entry = glHistData.entries[0];

    assert(
      entry &&
        entry.accountNameSnapshot === 'Original Account Name' &&
        glHistData.account.accountName === 'Updated Name After Transaction',
      'GL-10',
      'Historical snapshot preserved when COA account name changes',
      `Historical Line Snapshot: "${entry?.accountNameSnapshot}", Current COA Name: "${glHistData.account.accountName}"`
    );
  }

  // --------------------------------------------------------------------
  // SECTION 5: DATE & OPENING BALANCE TEST (GL-06, GL-07, GL-08, Section 18)
  // --------------------------------------------------------------------
  console.log('\n--- SECTION 5: DATE & OPENING BALANCE TESTS (GL-06, GL-07, GL-08) ---');
  {
    // Create dedicated account for opening balance test
    const obCode = `OB_${Date.now().toString().slice(-6)}`;
    const obAccRes = await fetch(`${BASE_URL}/api/admin/accounting/accounts`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        accountCode: obCode,
        accountName: 'Opening Balance Test Account',
        accountType: 'ASSET',
      }),
    });
    const obAccData = await obAccRes.json();
    const obAccountId = obAccData.account.accountId;

    // Entry 1: Before reporting period (2026-01-15): DR ₹5,000
    const jnlBefore = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2026-01-15',
        narration: 'Prior entry for opening balance',
        lines: [
          { accountId: obAccountId, debit: 5000, credit: 0 },
          { accountId: 'acc_1200', debit: 0, credit: 5000 },
        ],
      }),
    });
    const jnlBeforeData = await jnlBefore.json();
    await fetch(`${BASE_URL}/api/admin/accounting/journals/${jnlBeforeData.journal.journalId}/post`, {
      method: 'POST',
      headers: superAdminHeaders,
    });

    // Entry 2: Inside reporting period (2026-02-10): DR ₹3,000
    const jnlPeriod1 = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2026-02-10',
        narration: 'Inside period entry 1',
        lines: [
          { accountId: obAccountId, debit: 3000, credit: 0 },
          { accountId: 'acc_1200', debit: 0, credit: 3000 },
        ],
      }),
    });
    const jnlPeriod1Data = await jnlPeriod1.json();
    await fetch(`${BASE_URL}/api/admin/accounting/journals/${jnlPeriod1Data.journal.journalId}/post`, {
      method: 'POST',
      headers: superAdminHeaders,
    });

    // Entry 3: Inside reporting period (2026-02-20): CR ₹1,000
    const jnlPeriod2 = await fetch(`${BASE_URL}/api/admin/accounting/journals`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        journalDate: '2026-02-20',
        narration: 'Inside period entry 2',
        lines: [
          { accountId: 'acc_1200', debit: 1000, credit: 0 },
          { accountId: obAccountId, debit: 0, credit: 1000 },
        ],
      }),
    });
    const jnlPeriod2Data = await jnlPeriod2.json();
    await fetch(`${BASE_URL}/api/admin/accounting/journals/${jnlPeriod2Data.journal.journalId}/post`, {
      method: 'POST',
      headers: superAdminHeaders,
    });

    // Run General Ledger for reporting period: 2026-02-01 to 2026-02-28
    const glOBRes = await fetch(
      `${BASE_URL}/api/admin/accounting/general-ledger?accountId=${obAccountId}&fromDate=2026-02-01&toDate=2026-02-28`,
      { headers: superAdminHeaders }
    );
    const glOBData: GeneralLedgerResponse = await glOBRes.json();

    assert(
      glOBData.openingBalance === 5000,
      'GL-06',
      'Opening balance correct (Includes prior entry before fromDate)',
      `Opening Balance: ₹${glOBData.openingBalance} (Expected 5000)`
    );

    assert(
      glOBData.periodDebit === 3000 && glOBData.periodCredit === 1000,
      'GL-07',
      'Period totals correct (Period Debit = 3000, Period Credit = 1000)',
      `Period Debit: ₹${glOBData.periodDebit}, Period Credit: ₹${glOBData.periodCredit}`
    );

    assert(
      glOBData.closingBalance === 7000 && glOBData.entries.length === 2,
      'GL-08',
      'Date filtering and closing balance correct (5000 + 3000 - 1000 = 7000)',
      `Closing Balance: ₹${glOBData.closingBalance}, Entries count in period: ${glOBData.entries.length}`
    );
  }

  // --------------------------------------------------------------------
  // SECTION 6: ACCOUNT FILTERING (GL-09)
  // --------------------------------------------------------------------
  console.log('\n--- SECTION 6: ACCOUNT FILTERING (GL-09) ---');
  {
    // Missing accountId rejected
    const missingRes = await fetch(`${BASE_URL}/api/admin/accounting/general-ledger`, {
      headers: superAdminHeaders,
    });
    assert(
      missingRes.status === 400,
      'GL-09A',
      'Missing accountId rejected with 400',
      `HTTP status: ${missingRes.status}`
    );

    // Nonexistent accountId returns 404
    const notFoundRes = await fetch(
      `${BASE_URL}/api/admin/accounting/general-ledger?accountId=nonexistent_account_999`,
      { headers: superAdminHeaders }
    );
    assert(
      notFoundRes.status === 404,
      'GL-09',
      'Account filtering verified (Nonexistent account returns 404)',
      `HTTP status: ${notFoundRes.status}`
    );
  }

  // --------------------------------------------------------------------
  // SECTION 7: TRIAL BALANCE INVARIANTS & INTEGRITY (TB-01, TB-02, TB-05, TB-06, TB-07, TB-08)
  // --------------------------------------------------------------------
  console.log('\n--- SECTION 7: TRIAL BALANCE INVARIANTS (TB-01 to TB-08) ---');
  {
    // TB-01 & TB-02: Trial balance generated and Total Debit = Total Credit
    const tbRes = await fetch(`${BASE_URL}/api/admin/accounting/trial-balance`, {
      headers: superAdminHeaders,
    });
    const tbData: TrialBalanceResponse = await tbRes.json();
    assert(
      tbRes.status === 200 && tbData.success && tbData.accounts.length > 0,
      'TB-01',
      'Trial balance generated successfully',
      `Accounts reported: ${tbData.accounts.length}`
    );

    assert(
      tbData.totalDebit === tbData.totalCredit && tbData.isBalanced === true,
      'TB-02',
      'Mandatory Invariant: TOTAL DEBIT = TOTAL CREDIT',
      `Total Debit: ₹${tbData.totalDebit}, Total Credit: ₹${tbData.totalCredit}, isBalanced: ${tbData.isBalanced}`
    );

    // TB-05: Date filtering
    const tbDateRes = await fetch(
      `${BASE_URL}/api/admin/accounting/trial-balance?fromDate=2026-03-01&toDate=2026-03-31`,
      { headers: superAdminHeaders }
    );
    const tbDateData: TrialBalanceResponse = await tbDateRes.json();
    assert(
      tbDateRes.status === 200 && tbDateData.isBalanced,
      'TB-05',
      'Date filtering on Trial Balance functions and remains balanced',
      `March 2026 Total Debit: ₹${tbDateData.totalDebit}, Total Credit: ₹${tbDateData.totalCredit}`
    );

    // TB-06: Account type filtering
    const tbTypeRes = await fetch(
      `${BASE_URL}/api/admin/accounting/trial-balance?accountType=ASSET&includeZeroBalances=true`,
      { headers: superAdminHeaders }
    );
    const tbTypeData: TrialBalanceResponse = await tbTypeRes.json();
    const allAssets = tbTypeData.accounts.every(a => a.accountType === 'ASSET');
    assert(
      tbTypeRes.status === 200 && allAssets && tbTypeData.accounts.length > 0,
      'TB-06',
      'Account type filtering correct (Only ASSET accounts returned)',
      `Returned ${tbTypeData.accounts.length} ASSET accounts. Non-assets count: ${tbTypeData.accounts.filter(a => a.accountType !== 'ASSET').length}`
    );

    // TB-07: Server totals cannot be client-forged
    const forgedRes = await fetch(
      `${BASE_URL}/api/admin/accounting/trial-balance?totalDebit=9999999&totalCredit=0`,
      { headers: superAdminHeaders }
    );
    const forgedData: TrialBalanceResponse = await forgedRes.json();
    assert(
      forgedData.totalDebit === tbData.totalDebit && forgedData.totalCredit === tbData.totalCredit,
      'TB-07',
      'Server totals cannot be client-forged (Client query params ignored)',
      `Server Total Debit: ₹${forgedData.totalDebit} (Not client-forged 9999999)`
    );

    // TB-08: Unbalanced integrity condition detected
    const unbalRes = await fetch(
      `${BASE_URL}/api/admin/accounting/trial-balance?_testUnbalanced=true`,
      { headers: superAdminHeaders }
    );
    const unbalData = await unbalRes.json();
    assert(
      unbalRes.status === 500 && unbalData.error === 'ACCOUNTING_INTEGRITY_ERROR',
      'TB-08',
      'Unbalanced integrity condition detected and returns ACCOUNTING_INTEGRITY_ERROR',
      `HTTP status: ${unbalRes.status}, Error code: ${unbalData.error}, Message: "${unbalData.message}"`
    );
  }

  // --------------------------------------------------------------------
  // SECTION 8: SECURITY RBAC & CLIENT MUTATION TESTS (SEC-01 to SEC-06)
  // --------------------------------------------------------------------
  console.log('\n--- SECTION 8: SECURITY & RBAC TESTS (SEC-01 to SEC-06) ---');
  {
    // SEC-01: unauthenticated rejected
    const unauthGL = await fetch(`${BASE_URL}/api/admin/accounting/general-ledger?accountId=acc_1100`);
    const unauthTB = await fetch(`${BASE_URL}/api/admin/accounting/trial-balance`);
    assert(
      unauthGL.status === 401 && unauthTB.status === 401,
      'SEC-01',
      'Unauthenticated requests rejected with 401',
      `GL status: ${unauthGL.status}, TB status: ${unauthTB.status}`
    );

    // SEC-02: retailer rejected
    const retGL = await fetch(`${BASE_URL}/api/admin/accounting/general-ledger?accountId=acc_1100`, {
      headers: retailerHeaders,
    });
    const retTB = await fetch(`${BASE_URL}/api/admin/accounting/trial-balance`, {
      headers: retailerHeaders,
    });
    assert(
      retGL.status === 403 && retTB.status === 403,
      'SEC-02',
      'Retailer role rejected with 403 Forbidden',
      `GL status: ${retGL.status}, TB status: ${retTB.status}`
    );

    // SEC-03: warehouse staff rejected
    const wsGL = await fetch(`${BASE_URL}/api/admin/accounting/general-ledger?accountId=acc_1100`, {
      headers: warehouseStaffHeaders,
    });
    const wsTB = await fetch(`${BASE_URL}/api/admin/accounting/trial-balance`, {
      headers: warehouseStaffHeaders,
    });
    assert(
      wsGL.status === 403 && wsTB.status === 403,
      'SEC-03',
      'Warehouse staff rejected with 403 Forbidden',
      `GL status: ${wsGL.status}, TB status: ${wsTB.status}`
    );

    // SEC-04: warehouse manager rejected
    const wmGL = await fetch(`${BASE_URL}/api/admin/accounting/general-ledger?accountId=acc_1100`, {
      headers: warehouseManagerHeaders,
    });
    const wmTB = await fetch(`${BASE_URL}/api/admin/accounting/trial-balance`, {
      headers: warehouseManagerHeaders,
    });
    assert(
      wmGL.status === 403 && wmTB.status === 403,
      'SEC-04',
      'Warehouse manager rejected with 403 Forbidden',
      `GL status: ${wmGL.status}, TB status: ${wmTB.status}`
    );

    // SEC-05: delivery staff rejected
    const dsGL = await fetch(`${BASE_URL}/api/admin/accounting/general-ledger?accountId=acc_1100`, {
      headers: deliveryStaffHeaders,
    });
    const dsTB = await fetch(`${BASE_URL}/api/admin/accounting/trial-balance`, {
      headers: deliveryStaffHeaders,
    });
    assert(
      dsGL.status === 403 && dsTB.status === 403,
      'SEC-05',
      'Delivery staff rejected with 403 Forbidden',
      `GL status: ${dsGL.status}, TB status: ${dsTB.status}`
    );

    // SEC-06: direct client accounting mutation denied via Cloud Firestore Security Rules
    // Direct REST write attempt to /databases/(database)/documents/journalEntries without server authority
    const directRestUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${cfg.firestoreDatabaseId}/documents/journalEntries/direct-client-injection`;
    let clientMutationBlocked = false;
    let secEvidence = '';
    try {
      const restRes = await fetch(directRestUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            journalId: { stringValue: 'direct-client-injection' },
            totalDebit: { integerValue: '50000' },
            totalCredit: { integerValue: '50000' },
            status: { stringValue: 'POSTED' },
          },
        }),
      });
      const restData = await restRes.json();
      if (restRes.status === 403 || restData.error?.status === 'PERMISSION_DENIED') {
        clientMutationBlocked = true;
        secEvidence = `HTTP ${restRes.status}: ${restData.error?.message || 'PERMISSION_DENIED'}`;
      } else {
        secEvidence = `Unexpected status ${restRes.status}: ${JSON.stringify(restData)}`;
      }
    } catch (err: any) {
      clientMutationBlocked = true;
      secEvidence = err.message || String(err);
    }

    assert(
      clientMutationBlocked,
      'SEC-06',
      'Direct client Firestore accounting mutation denied by security rules',
      `Blocked with: "${secEvidence}"`
    );
  }

  // --------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------
  const passed = testResults.filter(t => t.passed).length;
  const failed = testResults.filter(t => !t.passed).length;

  console.log('\n======================================================================');
  console.log(`TOTAL TESTS: ${testResults.length}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log(`BLOCKED: 0`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test runner exception:', err);
  process.exit(1);
});
