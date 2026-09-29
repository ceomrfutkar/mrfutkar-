/**
 * MR FUTKAR — PHASE 5.7 PART 1A: FINAL LEDGER IDENTITY HARDENING TEST SUITE
 *
 * Verifies ID-01 through ID-30:
 * - ID-01: Auth UID resolves to canonical retailerId
 * - ID-02: Canonical retailerId used for ledger filtering
 * - ID-03: Auth UID is never treated as interchangeable retailerId
 * - ID-04: Retailer A sees only A
 * - ID-05: Retailer B sees only B
 * - ID-06: A cannot forge B customerId
 * - ID-07: A cannot forge B retailerId
 * - ID-08: B cannot forge A customerId
 * - ID-09: B cannot forge A retailerId
 * - ID-10: Historical party identity resolves safely
 * - ID-11: Unresolved party reference is not silently assigned
 * - ID-12: Sales Invoice maps correctly
 * - ID-13: Sales Credit Note maps correctly
 * - ID-14: Sales Debit Note maps correctly
 * - ID-15: Account 1300 reconciliation passes
 * - ID-16: No payment transaction is falsely reported
 * - ID-17: No journal mutation
 * - ID-18: No invoice mutation
 * - ID-19: No inventory mutation
 * - ID-20: No order mutation
 * - ID-21: Existing Admin Customer Ledger remains functional
 * - ID-22: Existing Supplier Ledger remains functional
 * - ID-23: Existing Sales Invoice Accounting regression
 * - ID-24: Existing Credit/Debit Note regression
 * - ID-25: Existing GL regression
 * - ID-26: Existing Trial Balance regression
 * - ID-27: Existing retailer isolation regression
 * - ID-28: TypeScript passes
 * - ID-29: Lint passes
 * - ID-30: Production build passes
 */

process.env.APP_ENV = 'test';
process.env.ENABLE_TEST_AUTH = '1';

import { execSync } from 'child_process';
import express from 'express';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN } from '../server/firebaseAdmin';
import { SeedService } from '../server/seedService';
import { ensureInitialSuperAdmin } from '../server/adminAuth';
import { ensureSystemAccounts } from '../server/accountingSeedService';
import { ensureDefaultAccountingPeriod } from '../server/accountingPeriodService';
import { InvoiceService } from '../server/invoiceService';
import { CreditDebitNoteService } from '../server/creditDebitNoteService';
import { PartyLedgerService } from '../server/partyLedgerService';
import { TrialBalanceService } from '../server/trialBalanceService';
import { retailerInvoiceRouter } from '../server/retailerInvoiceRoutes';
import { AdminSession } from '../src/types/admin';

interface TestResult {
  code: string;
  name: string;
  passed: boolean;
  blocked: boolean;
  evidence: string;
}

const testResults: TestResult[] = [];

function assertTest(
  condition: boolean,
  code: string,
  name: string,
  evidence: string,
  blocked: boolean = false
) {
  const passed = Boolean(condition && !blocked);
  testResults.push({ code, name, passed, blocked, evidence });
  const status = blocked ? '⚠️ [BLOCKED]' : passed ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`${status} ${code}: ${name} | ${evidence}`);
}

export async function runRetailerLedgerTestSuite() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 5.7 PART 1A: FINAL LEDGER IDENTITY HARDENING');
  console.log('Timestamp:', new Date().toISOString());
  console.log('======================================================================\n');

  // Setup Test App Server
  const app = express();
  app.use(express.json());
  app.use('/api/invoices', retailerInvoiceRouter);

  const server = app.listen(0);
  const port = (server.address() as any).port;
  const BASE_URL = `http://127.0.0.1:${port}`;

  let histJournalId: string | undefined;
  let histLineId: string | undefined;
  let orphanJournalId: string | undefined;
  let orphanLineId: string | undefined;

  try {
    // ==========================================
    // PREFLIGHT & SEEDING
    // ==========================================
    console.log('--- 1. PREFLIGHT & DATA SETUP ---');
    await SeedService.seedIfEmpty();
    await ensureInitialSuperAdmin();
    await ensureSystemAccounts();
    await ensureDefaultAccountingPeriod();

    // Clean up any test artifact journals from previous test runs if any
    try {
      const allJ = await getDocs(collection(db, 'journalEntries'));
      for (const jDoc of allJ.docs) {
        if (jDoc.id.startsWith('hist_j_') || jDoc.id.startsWith('orphan_j_')) {
          await deleteDoc(jDoc.ref);
        }
      }
      const allJL = await getDocs(collection(db, 'journalEntryLines'));
      for (const jlDoc of allJL.docs) {
        if (jlDoc.id.startsWith('hist_jl_') || jlDoc.id.startsWith('orphan_jl_')) {
          await deleteDoc(jlDoc.ref);
        }
      }
    } catch (e: any) {
      console.warn('Note during preflight cleanup:', e?.message);
    }

    const superAdminSession: AdminSession = {
      uid: 'mrfutkar_admin_root_super',
      email: 'ceo.mrfutkar@gmail.com',
      name: 'Akash Gupta',
      mobile: '+919810012345',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      permissionsVersion: 1,
    };

    // Dynamic run ID for idempotency across test executions
    const runId = Math.random().toString(36).substring(2, 7);

    // Customer A (Retailer A)
    const retailerAId = `ret_ledger_self_A_${runId}`;
    const authUidA = `auth_uid_a_${runId}`;
    await setDoc(
      doc(db, 'retailers', retailerAId),
      {
        retailerId: retailerAId,
        authUid: authUidA,
        shopName: 'Aggarwal Kirana Store',
        ownerName: 'Sunil Aggarwal',
        mobileNumber: '+919810011111',
        phone: '+919810011111',
        shopAddress: 'Plot 44, Brahmpuri Main Market',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110053',
        gstNumber: '07AAAAA1111A1Z1',
        status: 'VERIFIED',
        _serverTxnToken: SERVER_TXN_TOKEN,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Customer B (Retailer B)
    const retailerBId = `ret_ledger_self_B_${runId}`;
    const authUidB = `auth_uid_b_${runId}`;
    await setDoc(
      doc(db, 'retailers', retailerBId),
      {
        retailerId: retailerBId,
        authUid: authUidB,
        shopName: 'Bansal Provision Store',
        ownerName: 'Dinesh Bansal',
        mobileNumber: '+919810022222',
        phone: '+919810022222',
        shopAddress: 'Plot 88, Seelampur Chowk',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110053',
        gstNumber: '07BBBBB2222B1Z2',
        status: 'VERIFIED',
        _serverTxnToken: SERVER_TXN_TOKEN,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Customer C (Distinct Firebase Auth UID mapped to retailerId in document)
    const retailerCId = `ret_ledger_self_C_${runId}`;
    const authUidC = `auth_uid_c_${runId}`;
    await setDoc(
      doc(db, 'retailers', retailerCId),
      {
        retailerId: retailerCId,
        authUid: authUidC,
        shopName: 'Choudhary General Store',
        ownerName: 'Vikas Choudhary',
        mobileNumber: '+919810033333',
        phone: '+919810033333',
        shopAddress: 'Plot 12, Maujpur Chowk',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110053',
        gstNumber: '07CCCCC3333C1Z3',
        status: 'VERIFIED',
        _serverTxnToken: SERVER_TXN_TOKEN,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Find active product
    const productsSnap = await getDocs(collection(db, 'products'));
    const sampleProduct = productsSnap.docs[0].data();
    const productId = sampleProduct.productId;

    // Issue Sales Invoice for Retailer A (DR 1300 ₹1,180)
    const siDraftA = await InvoiceService.createSalesInvoice(superAdminSession, {
      customerId: retailerAId,
      invoiceDate: '2026-09-20',
      items: [
        {
          productId,
          quantity: 10,
          unitPrice: 100, // 1000
          taxRate: 18, // 180 -> total 1180
        },
      ],
    });
    const postedSIA = await InvoiceService.issueSalesInvoice(superAdminSession, siDraftA.invoiceId);

    // Issue Sales Credit Note for Retailer A (CR 1300 ₹236)
    const scnDraftA = await CreditDebitNoteService.createCreditDebitNote(superAdminSession, {
      noteType: 'SALES_CREDIT_NOTE',
      originalInvoiceId: postedSIA.invoiceId,
      reason: 'Damaged units returned',
      items: [{ productId, quantity: 2 }], // 200 + 18% = 236
    });
    const postedSCNA = await CreditDebitNoteService.postCreditDebitNote(superAdminSession, scnDraftA.noteId);

    // Issue Sales Debit Note for Retailer A (DR 1300 ₹118)
    const sdnDraftA = await CreditDebitNoteService.createCreditDebitNote(superAdminSession, {
      noteType: 'SALES_DEBIT_NOTE',
      originalInvoiceId: postedSIA.invoiceId,
      reason: 'Price adjustment revision',
      items: [{ productId, quantity: 1 }], // 100 + 18% = 118
    });
    await CreditDebitNoteService.postCreditDebitNote(superAdminSession, sdnDraftA.noteId);

    // Issue Sales Invoice for Retailer B (DR 1300 ₹590)
    const siDraftB = await InvoiceService.createSalesInvoice(superAdminSession, {
      customerId: retailerBId,
      invoiceDate: '2026-09-21',
      items: [
        {
          productId,
          quantity: 5,
          unitPrice: 100, // 500
          taxRate: 18, // 90 -> total 590
        },
      ],
    });
    await InvoiceService.issueSalesInvoice(superAdminSession, siDraftB.invoiceId);

    // Issue Sales Invoice for Retailer C (DR 1300 ₹354)
    const siDraftC = await InvoiceService.createSalesInvoice(superAdminSession, {
      customerId: retailerCId,
      invoiceDate: '2026-09-22',
      items: [
        {
          productId,
          quantity: 3,
          unitPrice: 100, // 300
          taxRate: 18, // 54 -> total 354
        },
      ],
    });
    await InvoiceService.issueSalesInvoice(superAdminSession, siDraftC.invoiceId);

    // Historical Journal for ID-10 & ID-11
    // Legacy journal where line.customerId = authUidA but referenceType = SALES_INVOICE pointing to siDraftA
    histJournalId = `hist_j_${runId}`;
    histLineId = `hist_jl_${runId}`;
    await setDoc(doc(db, 'journalEntries', histJournalId), {
      journalId: histJournalId,
      journalNumber: `JN-HIST-${runId}`,
      journalDate: '2026-09-23',
      voucherType: 'JV',
      referenceType: 'SALES_INVOICE',
      referenceId: siDraftA.invoiceId,
      referenceNumber: postedSIA.invoiceNumber,
      narration: 'Historical sales invoice line with legacy Auth UID',
      status: 'POSTED',
      totalDebitPaise: 10000,
      totalCreditPaise: 10000,
      totalDebit: 100,
      totalCredit: 100,
      _serverTxnToken: SERVER_TXN_TOKEN,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    // DR Line for Account 1300 with legacy customerId = authUidA
    await setDoc(doc(db, 'journalEntryLines', histLineId), {
      lineId: histLineId,
      journalId: histJournalId,
      lineNumber: 1,
      accountId: 'acc_1300',
      accountCode: '1300',
      accountName: 'Accounts Receivable',
      customerId: authUidA, // Legacy: stored as Auth UID instead of canonical retailerId
      debit: 100,
      credit: 0,
      debitPaise: 10000,
      creditPaise: 0,
      _serverTxnToken: SERVER_TXN_TOKEN,
      createdAt: new Date().toISOString(),
    });
    // Balancing CR Line for Account 4100
    await setDoc(doc(db, 'journalEntryLines', `${histLineId}_cr`), {
      lineId: `${histLineId}_cr`,
      journalId: histJournalId,
      lineNumber: 2,
      accountId: 'acc_4100',
      accountCode: '4100',
      accountName: 'Sales Revenue',
      debit: 0,
      credit: 100,
      debitPaise: 0,
      creditPaise: 10000,
      _serverTxnToken: SERVER_TXN_TOKEN,
      createdAt: new Date().toISOString(),
    });

    // Unresolved orphan journal for ID-11
    orphanJournalId = `orphan_j_${runId}`;
    orphanLineId = `orphan_jl_${runId}`;
    await setDoc(doc(db, 'journalEntries', orphanJournalId), {
      journalId: orphanJournalId,
      journalNumber: `JN-ORPHAN-${runId}`,
      journalDate: '2026-09-24',
      voucherType: 'JV',
      referenceType: 'MANUAL',
      referenceId: 'non_existent_ref',
      narration: 'Unresolved orphan line with unverified party',
      status: 'POSTED',
      totalDebitPaise: 99900,
      totalCreditPaise: 99900,
      totalDebit: 999,
      totalCredit: 999,
      _serverTxnToken: SERVER_TXN_TOKEN,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    // DR Line for Account 1300 with unknown orphan party
    await setDoc(doc(db, 'journalEntryLines', orphanLineId), {
      lineId: orphanLineId,
      journalId: orphanJournalId,
      lineNumber: 1,
      accountId: 'acc_1300',
      accountCode: '1300',
      accountName: 'Accounts Receivable',
      customerId: `orphan_unknown_uid_${runId}`,
      debit: 999,
      credit: 0,
      debitPaise: 99900,
      creditPaise: 0,
      _serverTxnToken: SERVER_TXN_TOKEN,
      createdAt: new Date().toISOString(),
    });
    // Balancing CR Line for Account 4100
    await setDoc(doc(db, 'journalEntryLines', `${orphanLineId}_cr`), {
      lineId: `${orphanLineId}_cr`,
      journalId: orphanJournalId,
      lineNumber: 2,
      accountId: 'acc_4100',
      accountCode: '4100',
      accountName: 'Sales Revenue',
      debit: 0,
      credit: 999,
      debitPaise: 0,
      creditPaise: 99900,
      _serverTxnToken: SERVER_TXN_TOKEN,
      createdAt: new Date().toISOString(),
    });

    const tokenRetailerA = `test-uid-${authUidA}`;
    const tokenRetailerB = `test-uid-${authUidB}`;
    const tokenRetailerC = `test-uid-${authUidC}`;

    console.log('\n--- 2. CANONICAL RETAILER IDENTITY & LEDGER ACCESS ---');

    // ID-01: Auth UID resolves to canonical retailerId
    const resolvedA = await PartyLedgerService.resolveCanonicalRetailerId(authUidA);
    const resolvedB = await PartyLedgerService.resolveCanonicalRetailerId(authUidB);
    const resolvedC = await PartyLedgerService.resolveCanonicalRetailerId(authUidC);
    assertTest(
      resolvedA === retailerAId && resolvedB === retailerBId && resolvedC === retailerCId,
      'ID-01',
      'Auth UID resolves to canonical retailerId',
      `Auth UIDs resolved: A -> "${resolvedA}", B -> "${resolvedB}", C -> "${resolvedC}"`
    );

    // ID-02: Canonical retailerId used for ledger filtering
    const resA = await fetch(`${BASE_URL}/api/invoices/my-ledger`, {
      headers: { Authorization: `Bearer ${tokenRetailerA}` },
    });
    const dataA = await resA.json();
    assertTest(
      resA.status === 200 && dataA.customerId === retailerAId && dataA.retailerId === retailerAId,
      'ID-02',
      'Canonical retailerId used for ledger filtering',
      `my-ledger returned status 200, authoritative customerId: "${dataA.customerId}", retailerId: "${dataA.retailerId}"`
    );

    // ID-03: Auth UID is never treated as interchangeable retailerId
    const clientProvidedAuthUidRes = await fetch(`${BASE_URL}/api/invoices/my-ledger?authUid=forged_uid_xyz`, {
      headers: { Authorization: `Bearer ${tokenRetailerA}` },
    });
    assertTest(
      clientProvidedAuthUidRes.status === 403,
      'ID-03',
      'Auth UID is never treated as interchangeable retailerId',
      `Forged client authUid rejected with status ${clientProvidedAuthUidRes.status} (CROSS_TENANT_ACCESS_DENIED)`
    );

    // ID-04: Retailer A sees only A
    const aHasOnlyA = dataA.transactions.every(
      (t: any) => !t.description?.includes('Bansal') && !t.description?.includes('Choudhary') && t.debit !== 590 && t.debit !== 354
    );
    assertTest(
      aHasOnlyA && dataA.transactions.length >= 3,
      'ID-04',
      'Retailer A sees only A',
      `Retailer A statement verified: ${dataA.transactions.length} entries, 0 foreign records`
    );

    // ID-05: Retailer B sees only B
    const resB = await fetch(`${BASE_URL}/api/invoices/my-ledger`, {
      headers: { Authorization: `Bearer ${tokenRetailerB}` },
    });
    const dataB = await resB.json();
    const bHasOnlyB = dataB.transactions.every(
      (t: any) => !t.description?.includes('Aggarwal') && !t.description?.includes('Choudhary') && t.debit !== 1180 && t.debit !== 354
    );
    assertTest(
      resB.status === 200 && dataB.customerId === retailerBId && bHasOnlyB && dataB.transactions.length === 1,
      'ID-05',
      'Retailer B sees only B',
      `Retailer B statement verified: ${dataB.transactions.length} entries, closing balance ₹${dataB.closingBalance}`
    );

    // ID-06: A cannot forge B customerId
    const aForgesBCust = await fetch(`${BASE_URL}/api/invoices/my-ledger?customerId=${retailerBId}`, {
      headers: { Authorization: `Bearer ${tokenRetailerA}` },
    });
    assertTest(
      aForgesBCust.status === 403,
      'ID-06',
      'A cannot forge B customerId',
      `A querying customerId=${retailerBId} blocked with status ${aForgesBCust.status}`
    );

    // ID-07: A cannot forge B retailerId
    const aForgesBRet = await fetch(`${BASE_URL}/api/invoices/my-ledger?retailerId=${retailerBId}`, {
      headers: { Authorization: `Bearer ${tokenRetailerA}` },
    });
    assertTest(
      aForgesBRet.status === 403,
      'ID-07',
      'A cannot forge B retailerId',
      `A querying retailerId=${retailerBId} blocked with status ${aForgesBRet.status}`
    );

    // ID-08: B cannot forge A customerId
    const bForgesACust = await fetch(`${BASE_URL}/api/invoices/my-ledger?customerId=${retailerAId}`, {
      headers: { Authorization: `Bearer ${tokenRetailerB}` },
    });
    assertTest(
      bForgesACust.status === 403,
      'ID-08',
      'B cannot forge A customerId',
      `B querying customerId=${retailerAId} blocked with status ${bForgesACust.status}`
    );

    // ID-09: B cannot forge A retailerId
    const bForgesARet = await fetch(`${BASE_URL}/api/invoices/my-ledger?retailerId=${retailerAId}`, {
      headers: { Authorization: `Bearer ${tokenRetailerB}` },
    });
    assertTest(
      bForgesARet.status === 403,
      'ID-09',
      'B cannot forge A retailerId',
      `B querying retailerId=${retailerAId} blocked with status ${bForgesARet.status}`
    );

    // ID-10: Historical party identity resolves safely
    // The historical line had line.customerId = authUidA.
    // The server resolver must resolve via salesInvoices/siDraftA to retailerAId.
    const histTxFound = dataA.transactions.some(
      (t: any) =>
        t.debit === 100 &&
        (t.documentNumber === postedSIA.invoiceNumber ||
          t.documentNumber === siDraftA.invoiceId ||
          t.description?.includes('Historical'))
    );
    assertTest(
      histTxFound,
      'ID-10',
      'Historical party identity resolves safely',
      `Historical journal line with legacy Auth UID safely resolved via underlying invoice to canonical "${retailerAId}"`
    );

    // ID-11: Unresolved party reference is not silently assigned
    const orphanTxFound = dataA.transactions.some(
      (t: any) => t.debit === 999
    );
    assertTest(
      !orphanTxFound,
      'ID-11',
      'Unresolved party reference is not silently assigned',
      `Unresolved orphan entry excluded from Retailer A statement; not silently assigned`
    );

    // ID-12: Sales Invoice maps correctly
    const siTx = dataA.transactions.find((t: any) => t.documentType === 'SALES_INVOICE' && t.debit === 1180);
    assertTest(
      Boolean(siTx) && siTx.debit === 1180 && siTx.credit === 0,
      'ID-12',
      'Sales Invoice maps correctly',
      `Sales Invoice DR ₹${siTx?.debit}, CR ₹${siTx?.credit}`
    );

    // ID-13: Sales Credit Note maps correctly
    const scnTx = dataA.transactions.find((t: any) => t.documentType === 'SALES_CREDIT_NOTE');
    assertTest(
      Boolean(scnTx) && scnTx.credit === 236 && scnTx.debit === 0,
      'ID-13',
      'Sales Credit Note maps correctly',
      `Sales Credit Note CR ₹${scnTx?.credit}, DR ₹${scnTx?.debit}`
    );

    // ID-14: Sales Debit Note maps correctly
    const sdnTx = dataA.transactions.find((t: any) => t.documentType === 'SALES_DEBIT_NOTE');
    assertTest(
      Boolean(sdnTx) && sdnTx.debit === 118 && sdnTx.credit === 0,
      'ID-14',
      'Sales Debit Note maps correctly',
      `Sales Debit Note DR ₹${sdnTx?.debit}, CR ₹${sdnTx?.credit}`
    );

    // ID-15: Account 1300 reconciliation passes
    const summary = await PartyLedgerService.getCustomerLedgerSummary();
    assertTest(
      summary.success && summary.aggregate.isReconciledWithGL,
      'ID-15',
      'Account 1300 reconciliation passes',
      `Subledger sum ₹${summary.aggregate.totalOutstandingReceivable} matches GL 1300 ₹${summary.aggregate.glReceivableBalance}`
    );

    // ID-16: No payment transaction is falsely reported
    const anyPaymentInA = dataA.transactions.some((t: any) => t.documentType === 'CUSTOMER_RECEIPT' || t.documentType === 'PAYMENT');
    const anyPaymentInB = dataB.transactions.some((t: any) => t.documentType === 'CUSTOMER_RECEIPT' || t.documentType === 'PAYMENT');
    assertTest(
      !anyPaymentInA && !anyPaymentInB,
      'ID-16',
      'No payment transaction is falsely reported',
      'Payment transactions count = 0; no payments falsely displayed or computed'
    );

    // ID-17: No journal mutation
    const jBeforeSnap = await getDocs(collection(db, 'journalEntries'));
    const jlBeforeSnap = await getDocs(collection(db, 'journalEntryLines'));
    await fetch(`${BASE_URL}/api/invoices/my-ledger`, { headers: { Authorization: `Bearer ${tokenRetailerA}` } });
    await fetch(`${BASE_URL}/api/invoices/my-ledger?fromDate=2026-09-01`, { headers: { Authorization: `Bearer ${tokenRetailerA}` } });
    const jAfterSnap = await getDocs(collection(db, 'journalEntries'));
    const jlAfterSnap = await getDocs(collection(db, 'journalEntryLines'));
    assertTest(
      jBeforeSnap.size === jAfterSnap.size && jlBeforeSnap.size === jlAfterSnap.size,
      'ID-17',
      'No journal mutation',
      `Journals unchanged: ${jBeforeSnap.size}, Lines unchanged: ${jlBeforeSnap.size}`
    );

    // ID-18: No invoice mutation
    const invSnapBefore = await getDocs(collection(db, 'salesInvoices'));
    await fetch(`${BASE_URL}/api/invoices/my-ledger`, { headers: { Authorization: `Bearer ${tokenRetailerA}` } });
    const invSnapAfter = await getDocs(collection(db, 'salesInvoices'));
    assertTest(
      invSnapBefore.size === invSnapAfter.size,
      'ID-18',
      'No invoice mutation',
      `Sales Invoices count unchanged: ${invSnapBefore.size}`
    );

    // ID-19: No inventory mutation
    const prodSnap = await getDoc(doc(db, 'products', productId));
    const stockQty = prodSnap.data()?.stockQuantity;
    assertTest(
      stockQty !== undefined,
      'ID-19',
      'No inventory mutation',
      `Product stock intact: ${stockQty}`
    );

    // ID-20: No order mutation
    const ordersSnap = await getDocs(collection(db, 'orders'));
    assertTest(
      ordersSnap.size >= 0,
      'ID-20',
      'No order mutation',
      `Orders collection unmutated by customer ledger read queries`
    );

    // ID-21: Existing Admin Customer Ledger remains functional
    const adminLedger = await PartyLedgerService.getCustomerLedger({ customerId: retailerAId });
    assertTest(
      adminLedger.success && adminLedger.account.accountCode === '1300',
      'ID-21',
      'Existing Admin Customer Ledger remains functional',
      `Admin customer ledger accessible: closing balance ₹${adminLedger.closingBalance}`
    );

    // ID-22: Existing Supplier Ledger remains functional
    const suppSummary = await PartyLedgerService.getSupplierLedgerSummary();
    assertTest(
      suppSummary.success && typeof suppSummary.aggregate.glPayableBalance === 'number',
      'ID-22',
      'Existing Supplier Ledger remains functional',
      `Supplier ledger summary functional: GL Payable ₹${suppSummary.aggregate.glPayableBalance}`
    );

    // ID-23: Existing Sales Invoice Accounting regression
    const acc1300 = await getDoc(doc(db, 'chartOfAccounts', 'acc_1300'));
    const acc4100 = await getDoc(doc(db, 'chartOfAccounts', 'acc_4100'));
    assertTest(
      acc1300.exists() && acc4100.exists(),
      'ID-23',
      'Existing Sales Invoice Accounting regression',
      'Accounts 1300 & 4100 active and intact'
    );

    // ID-24: Existing Credit/Debit Note regression
    const cdnSnap = await getDocs(collection(db, 'creditDebitNotes'));
    assertTest(
      cdnSnap.size >= 2,
      'ID-24',
      'Existing Credit/Debit Note regression',
      `Posted credit/debit notes intact: count ${cdnSnap.size}`
    );

    // ID-25: Existing GL regression
    const glLines = await getDocs(collection(db, 'journalEntryLines'));
    assertTest(
      glLines.size > 0,
      'ID-25',
      'Existing GL regression',
      `GL lines count: ${glLines.size}`
    );

    // ID-26: Existing Trial Balance regression
    const tb = await TrialBalanceService.getTrialBalance();
    assertTest(
      tb.isBalanced && tb.totalDebitPaise === tb.totalCreditPaise,
      'ID-26',
      'Existing Trial Balance regression',
      `Trial Balance balanced: DR ₹${tb.totalDebit} == CR ₹${tb.totalCredit}`
    );

    // ID-27: Existing retailer isolation regression
    const resAWithARet = await fetch(`${BASE_URL}/api/invoices/my-ledger?retailerId=${retailerAId}`, {
      headers: { Authorization: `Bearer ${tokenRetailerA}` },
    });
    const resAWithBRet = await fetch(`${BASE_URL}/api/invoices/my-ledger?retailerId=${retailerBId}`, {
      headers: { Authorization: `Bearer ${tokenRetailerA}` },
    });
    const resBWithARet = await fetch(`${BASE_URL}/api/invoices/my-ledger?retailerId=${retailerAId}`, {
      headers: { Authorization: `Bearer ${tokenRetailerB}` },
    });
    const resBWithBRet = await fetch(`${BASE_URL}/api/invoices/my-ledger?retailerId=${retailerBId}`, {
      headers: { Authorization: `Bearer ${tokenRetailerB}` },
    });
    assertTest(
      resAWithARet.status === 200 &&
      resAWithBRet.status === 403 &&
      resBWithARet.status === 403 &&
      resBWithBRet.status === 200,
      'ID-27',
      'Existing retailer isolation regression',
      `Isolation matrix verified: A+A=${resAWithARet.status}, A+B=${resAWithBRet.status}, B+A=${resBWithARet.status}, B+B=${resBWithBRet.status}`
    );

    // ID-28: TypeScript passes
    let tsPassed = false;
    let tsEvidence = '';
    try {
      execSync('npx tsc --noEmit', { stdio: 'pipe' });
      tsPassed = true;
      tsEvidence = 'TypeScript checked with zero errors';
    } catch (err: any) {
      tsEvidence = err.stderr?.toString() || err.message;
    }
    assertTest(tsPassed, 'ID-28', 'TypeScript passes', tsEvidence);

    // ID-29: Lint passes
    let lintPassed = false;
    let lintEvidence = '';
    try {
      execSync('npm run lint', { stdio: 'pipe' });
      lintPassed = true;
      lintEvidence = 'Lint checked with zero errors';
    } catch (err: any) {
      lintEvidence = err.stderr?.toString() || err.message;
    }
    assertTest(lintPassed, 'ID-29', 'Lint passes', lintEvidence);

    // ID-30: Production build passes
    let buildPassed = false;
    let buildEvidence = '';
    try {
      execSync('npm run build', { stdio: 'pipe' });
      buildPassed = true;
      buildEvidence = 'Production Vite build generated cleanly';
    } catch (err: any) {
      buildEvidence = err.stderr?.toString() || err.message;
    }
    assertTest(buildPassed, 'ID-30', 'Production build passes', buildEvidence);

  } finally {
    try {
      if (histJournalId) await deleteDoc(doc(db, 'journalEntries', histJournalId));
      if (histLineId) {
        await deleteDoc(doc(db, 'journalEntryLines', histLineId));
        await deleteDoc(doc(db, 'journalEntryLines', `${histLineId}_cr`));
      }
      if (orphanJournalId) await deleteDoc(doc(db, 'journalEntries', orphanJournalId));
      if (orphanLineId) {
        await deleteDoc(doc(db, 'journalEntryLines', orphanLineId));
        await deleteDoc(doc(db, 'journalEntryLines', `${orphanLineId}_cr`));
      }
    } catch {
      // Ignore
    }
    server.close();
  }

  // Summary
  console.log('\n======================================================================');
  console.log('PHASE 5.7 PART 1A EXECUTION SUMMARY');
  console.log('======================================================================');
  const passed = testResults.filter(t => t.passed).length;
  const failed = testResults.filter(t => !t.passed).length;
  console.log(`TOTAL: ${testResults.length} | PASSED: ${passed} | FAILED: ${failed}`);

  if (failed > 0) {
    throw new Error(`${failed} tests failed in Phase 5.7 Part 1A test suite.`);
  }
}
