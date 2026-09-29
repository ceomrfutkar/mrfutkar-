/**
 * MR FUTKAR — Supplier Payment Service (Phase 5.8 Part 1)
 * Represents server-authoritative double-entry supplier payment foundation.
 * STRICTLY integer paise accounting. Reuses canonical party and accounting architecture.
 */

import crypto from 'crypto';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  runTransaction,
} from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN } from './firebaseAdmin';
import { logAdminAudit } from './adminAuth';
import { AdminSession, AdminUser } from '../src/types/admin';
import { Account, isValidDateFormat, paiseToRupees, JournalEntry, JournalLinePayload } from '../src/types/accounting';
import {
  SupplierPayment,
  SupplierPaymentPaymentMethod,
  SupplierSnapshot,
  SupplierPaymentCashAccountInfo,
  CreateSupplierPaymentPayload,
  PostSupplierPaymentPayload,
  PostSupplierPaymentResponse,
  AllocateSupplierPaymentPayload,
  AllocateSupplierPaymentResponse,
  EligiblePurchaseInvoiceForAllocation,
  SupplierPaymentAllocation,
  SupplierPaymentAllocationStatus,
  SupplierPaymentStatus,
  SupplierPaymentAccountingStatus,
  ReverseSupplierPaymentPayload,
  ReverseSupplierPaymentResponse,
  SupplierPaymentListFilters,
  SupplierPaymentListResponse,
  ALLOWED_SUPPLIER_PAYMENT_METHODS,
} from '../src/types/supplierPayment';
import { PurchaseInvoice, InvoicePaymentStatus } from '../src/types/invoice';
import { CreditDebitNote } from '../src/types/creditDebitNote';
import { PartyLedgerService } from './partyLedgerService';
import { getNextJournalNumber } from './accountingSequenceService';
import { validatePeriodIsOpen } from './accountingPeriodService';
import { JournalEngine } from './journalEngine';

function cleanDocData<T extends Record<string, any>>(obj: T): T {
  const result: any = Array.isArray(obj) ? [] : {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val === undefined) {
      continue;
    } else if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
      result[key] = cleanDocData(val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

export class SupplierPaymentService {
  /**
   * Helper: Resolve Authoritative Cash/Bank Account from Chart of Accounts
   * Validates account exists, is active, is ASSET, and is not AR, AP, Revenue, COGS, GST, Inventory.
   */
  private static async getAuthoritativeCashBankAccount(code: string): Promise<Account> {
    const cleanCode = code.trim();

    // 1. Direct document lookup by ID
    let accDoc = await getDoc(doc(db, 'chartOfAccounts', `acc_${cleanCode}`));
    let accData: Account | null = accDoc.exists() ? (accDoc.data() as Account) : null;

    if (!accData) {
      const q = query(
        collection(db, 'chartOfAccounts'),
        where('accountCode', '==', cleanCode)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        accData = snap.docs[0].data() as Account;
      }
    }

    if (!accData) {
      throw new Error(`ACCOUNT_NOT_FOUND: Account "${cleanCode}" not found in Chart of Accounts.`);
    }

    if (accData.isActive === false) {
      throw new Error(`INACTIVE_ACCOUNT: Account "${cleanCode}" (${accData.accountName}) is currently deactivated.`);
    }

    // Specific prohibited account validation
    if (cleanCode === '1300' || accData.accountName.toLowerCase().includes('accounts receivable')) {
      throw new Error(`PROHIBITED_CASH_ACCOUNT: Accounts Receivable (1300) cannot be used as a cash/bank payment account.`);
    }
    if (cleanCode === '2100' || accData.accountType === 'LIABILITY' || accData.accountName.toLowerCase().includes('accounts payable')) {
      throw new Error(`PROHIBITED_CASH_ACCOUNT: Accounts Payable (2100) or liability accounts cannot be used as a cash/bank payment account.`);
    }
    if (cleanCode === '4100' || cleanCode === '4200' || accData.accountType === 'INCOME') {
      throw new Error(`PROHIBITED_CASH_ACCOUNT: Revenue accounts (4100 / Income) cannot be used as a cash/bank payment account.`);
    }
    if (cleanCode === '5100' || accData.accountType === 'EXPENSE') {
      throw new Error(`PROHIBITED_CASH_ACCOUNT: Cost of Goods Sold (5100) or expense accounts cannot be used as a cash/bank payment account.`);
    }
    if (cleanCode === '2200' || cleanCode === '2300' || accData.accountName.toLowerCase().includes('gst')) {
      throw new Error(`PROHIBITED_CASH_ACCOUNT: GST accounts (2200 / 2300) cannot be used as a cash/bank payment account.`);
    }
    if (cleanCode === '1400' || accData.accountName.toLowerCase().includes('inventory')) {
      throw new Error(`PROHIBITED_CASH_ACCOUNT: Inventory asset account (1400) cannot be used as a cash/bank payment account.`);
    }
    if (accData.accountType !== 'ASSET') {
      throw new Error(`INVALID_CASH_BANK_ACCOUNT: Account "${cleanCode}" is ${accData.accountType}. Cash/Bank accounts must be ASSET accounts.`);
    }

    return accData;
  }

  /**
   * Helper: Resolve Authoritative Accounts Payable (2100) from Chart of Accounts
   */
  private static async getAuthoritativeApAccount(): Promise<Account> {
    let accDoc = await getDoc(doc(db, 'chartOfAccounts', 'acc_2100'));
    let accData: Account | null = accDoc.exists() ? (accDoc.data() as Account) : null;

    if (!accData) {
      const q = query(
        collection(db, 'chartOfAccounts'),
        where('accountCode', '==', '2100')
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        accData = snap.docs[0].data() as Account;
      }
    }

    if (!accData) {
      throw new Error('ACCOUNT_NOT_FOUND: Accounts Payable (2100) not found in Chart of Accounts.');
    }

    if (accData.isActive === false) {
      throw new Error('INACTIVE_ACCOUNT: Accounts Payable (2100) is currently deactivated.');
    }

    if (accData.accountType !== 'LIABILITY') {
      throw new Error(`ACCOUNT_TYPE_MISMATCH: Accounts Payable (2100) must be a LIABILITY account. Found: ${accData.accountType}`);
    }

    return accData;
  }

  /**
   * Helper: Resolves today's date in Asia/Kolkata timezone (YYYY-MM-DD)
   */
  public static getKolkataTodayDate(): string {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
    return formatter.format(new Date());
  }

  /**
   * Create a new Supplier Payment (DRAFT)
   * Strictly SUPER_ADMIN authorized
   */
  public static async createSupplierPayment(
    adminSession: AdminSession,
    payload: CreateSupplierPaymentPayload
  ): Promise<{ payment: SupplierPayment; isIdempotentReplay?: boolean }> {
    // 1. Enforce SUPER_ADMIN Role
    if (!adminSession || adminSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED: Only Super Admin users can create supplier payments.');
    }

    const rawPayload = payload as any;

    // 2. Strict Client Injection Guards
    if (
      rawPayload.createdBy !== undefined ||
      rawPayload.paymentId !== undefined ||
      rawPayload.paymentNumber !== undefined ||
      rawPayload.journalId !== undefined ||
      rawPayload.voucherNumber !== undefined ||
      rawPayload.status !== undefined ||
      rawPayload.accountingStatus !== undefined ||
      rawPayload.postedAt !== undefined ||
      rawPayload.reversedAt !== undefined ||
      rawPayload.reversalJournalId !== undefined ||
      rawPayload.allocations !== undefined ||
      rawPayload.allocatedAmountPaise !== undefined ||
      rawPayload.unallocatedAmountPaise !== undefined ||
      rawPayload.version !== undefined ||
      rawPayload.supplierSnapshot !== undefined ||
      rawPayload.cashBankAccountInfo !== undefined ||
      rawPayload._serverTxnToken !== undefined
    ) {
      throw new Error(
        'CLIENT_FIELD_INJECTION_FORBIDDEN: Client cannot inject server-authoritative fields (createdBy, paymentId, paymentNumber, journalId, voucherNumber, status, accountingStatus, postedAt, reversedAt, reversalJournalId, allocations, allocatedAmountPaise, unallocatedAmountPaise, version, supplierSnapshot, cashBankAccountInfo).'
      );
    }

    // 3. Validate Supplier ID & Canonical Identity Resolution
    if (!payload.supplierId || typeof payload.supplierId !== 'string' || !payload.supplierId.trim()) {
      throw new Error('INVALID_SUPPLIER_ID: supplierId is required.');
    }
    const rawSupplierId = payload.supplierId.trim();

    // Canonical supplier resolution
    const canonicalSupplierId = (await PartyLedgerService.resolveCanonicalSupplierId(rawSupplierId)) || rawSupplierId;

    // Verify supplier exists in suppliers master, purchase invoices, or credit/debit notes
    let supplierExists = false;
    try {
      const suppDocRef = doc(db, 'suppliers', canonicalSupplierId);
      const suppSnap = await getDoc(suppDocRef);
      if (suppSnap.exists()) {
        supplierExists = true;
      }
    } catch {
      // ignore
    }

    if (!supplierExists) {
      const qPI = query(collection(db, 'purchaseInvoices'), where('supplierId', '==', canonicalSupplierId));
      const snapPI = await getDocs(qPI);
      if (!snapPI.empty) {
        supplierExists = true;
      }
    }

    if (!supplierExists) {
      const qCDN = query(collection(db, 'creditDebitNotes'), where('supplierId', '==', canonicalSupplierId));
      const snapCDN = await getDocs(qCDN);
      if (!snapCDN.empty) {
        supplierExists = true;
      }
    }

    if (!supplierExists) {
      throw new Error(`SUPPLIER_NOT_FOUND: Supplier "${rawSupplierId}" not found in supplier master or purchase invoices.`);
    }

    // Fetch server-authoritative snapshot
    const snapInfo = await PartyLedgerService.resolveSupplierSnapshot(canonicalSupplierId);
    const supplierSnapshot: SupplierSnapshot = {
      supplierId: canonicalSupplierId,
      businessName: snapInfo.businessName || `Supplier (${canonicalSupplierId})`,
      contactName: snapInfo.contactName,
      mobile: snapInfo.mobile,
      fullAddress: snapInfo.fullAddress,
      city: snapInfo.city || 'Delhi',
      state: snapInfo.state || 'Delhi',
      pincode: snapInfo.pincode,
      gstin: snapInfo.gstin,
    };

    // 4. Validate Amount in Integer Paise
    const rawAmount = payload.amountPaise;
    if (
      typeof rawAmount !== 'number' ||
      !Number.isFinite(rawAmount) ||
      !Number.isInteger(rawAmount) ||
      rawAmount <= 0
    ) {
      throw new Error(`INVALID_AMOUNT: amountPaise must be a positive integer greater than zero. Received: ${rawAmount}`);
    }
    const amountPaise = rawAmount;

    // 5. Validate Payment Method
    const method = payload.paymentMethod;
    if (!method || !ALLOWED_SUPPLIER_PAYMENT_METHODS.includes(method as SupplierPaymentPaymentMethod)) {
      throw new Error(`INVALID_PAYMENT_METHOD: paymentMethod must be one of ${ALLOWED_SUPPLIER_PAYMENT_METHODS.join(', ')}.`);
    }
    const paymentMethod: SupplierPaymentPaymentMethod = method;

    // 6. Validate & Resolve Cash/Bank Account
    let accountCode = typeof payload.cashBankAccountCode === 'string' ? payload.cashBankAccountCode.trim() : '';
    if (!accountCode) {
      if (paymentMethod === 'CASH') {
        accountCode = '1100'; // Cash in hand
      } else {
        accountCode = '1200'; // Bank account
      }
    }

    const authoritativeAccount = await this.getAuthoritativeCashBankAccount(accountCode);
    const cashBankAccountInfo: SupplierPaymentCashAccountInfo = {
      accountCode: authoritativeAccount.accountCode,
      accountName: authoritativeAccount.accountName,
      accountType: authoritativeAccount.accountType,
    };

    // 7. Validate Date and Accounting Period
    let paymentDate = typeof payload.paymentDate === 'string' ? payload.paymentDate.trim() : '';
    if (!paymentDate) {
      paymentDate = this.getKolkataTodayDate();
    } else {
      if (!isValidDateFormat(paymentDate)) {
        throw new Error('INVALID_DATE_FORMAT: paymentDate must be in valid YYYY-MM-DD format.');
      }
    }

    // Verify accounting period is open for paymentDate
    await validatePeriodIsOpen(paymentDate);

    // 8. Validate Reference Number
    let referenceNumber: string | null = null;
    if (payload.referenceNumber !== undefined && payload.referenceNumber !== null) {
      const refStr = String(payload.referenceNumber).trim();
      if (refStr.length > 100) {
        throw new Error('REFERENCE_NUMBER_TOO_LONG: referenceNumber cannot exceed 100 characters.');
      }
      referenceNumber = refStr || null;
    }

    // 9. Validate Notes
    let notes: string | null = null;
    if (payload.notes !== undefined && payload.notes !== null) {
      const noteStr = String(payload.notes).trim();
      if (noteStr.length > 500) {
        throw new Error('NOTES_TOO_LONG: notes cannot exceed 500 characters.');
      }
      notes = noteStr || null;
    }

    // 10. Idempotency Foundation
    const idempotencyKey = typeof payload.idempotencyKey === 'string' ? payload.idempotencyKey.trim() : null;
    if (idempotencyKey) {
      if (idempotencyKey.length < 5) {
        throw new Error('INVALID_IDEMPOTENCY_KEY: idempotencyKey must be at least 5 characters.');
      }

      const idempDocRef = doc(db, 'idempotencyKeys', `supplier_payment_${idempotencyKey}`);
      const idempSnap = await getDoc(idempDocRef);

      if (idempSnap.exists()) {
        const idempData = idempSnap.data();

        if (
          idempData.supplierId !== canonicalSupplierId ||
          idempData.amountPaise !== amountPaise ||
          (idempData.paymentMethod && idempData.paymentMethod !== paymentMethod)
        ) {
          throw new Error(
            `IDEMPOTENCY_CONFLICT: Idempotency key "${idempotencyKey}" was previously used with conflicting parameters.`
          );
        }

        const existingPaymentRef = doc(db, 'supplierPayments', idempData.paymentId);
        const existingPaymentSnap = await getDoc(existingPaymentRef);
        if (existingPaymentSnap.exists()) {
          const existingData = existingPaymentSnap.data() as SupplierPayment;
          const { _serverTxnToken, ...safePayment } = existingData as any;
          return { payment: safePayment as SupplierPayment, isIdempotentReplay: true };
        }
      }

      // Secondary check: query supplierPayments by idempotencyKey
      const qIdemp = query(
        collection(db, 'supplierPayments'),
        where('_serverTxnToken', '==', SERVER_TXN_TOKEN),
        where('idempotencyKey', '==', idempotencyKey)
      );
      const snapIdemp = await getDocs(qIdemp);
      if (!snapIdemp.empty) {
        const existingPayment = snapIdemp.docs[0].data() as SupplierPayment;

        if (
          existingPayment.supplierId !== canonicalSupplierId ||
          existingPayment.amountPaise !== amountPaise
        ) {
          throw new Error(
            `IDEMPOTENCY_CONFLICT: Idempotency key "${idempotencyKey}" was previously used with conflicting parameters.`
          );
        }

        const { _serverTxnToken, ...safePayment } = existingPayment as any;
        return { payment: safePayment as SupplierPayment, isIdempotentReplay: true };
      }
    }

    // 11. Generate Server-Authoritative Payment Number & ID
    const paymentNumber = await getNextJournalNumber('SUPPLIER_PAYMENT');
    const paymentId = `sp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    // 12. Assemble Supplier Payment Document
    const paymentDoc: SupplierPayment & { _serverTxnToken: string } = {
      paymentId,
      paymentNumber,
      supplierId: canonicalSupplierId,
      supplierSnapshot,
      paymentDate,
      amountPaise,
      paymentMethod,
      cashBankAccountCode: authoritativeAccount.accountCode,
      cashBankAccountInfo,
      referenceNumber,
      notes,
      status: 'DRAFT',
      accountingStatus: 'PENDING',
      journalId: null,
      voucherNumber: null,
      createdBy: adminSession.uid,
      createdAt: now,
      postedAt: null,
      reversedAt: null,
      reversalJournalId: null,
      idempotencyKey,
      version: 1,
      allocations: [],
      allocatedAmountPaise: 0,
      unallocatedAmountPaise: amountPaise,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    // Save to supplierPayments collection
    await setDoc(doc(db, 'supplierPayments', paymentId), cleanDocData(paymentDoc));

    // Store idempotency record if key was provided
    if (idempotencyKey) {
      await setDoc(doc(db, 'idempotencyKeys', `supplier_payment_${idempotencyKey}`), {
        key: idempotencyKey,
        targetType: 'SUPPLIER_PAYMENT',
        paymentId,
        supplierId: canonicalSupplierId,
        amountPaise,
        paymentMethod,
        paymentNumber,
        createdAt: now,
        _serverTxnToken: SERVER_TXN_TOKEN,
      });
    }

    // 13. Audit Log Event
    await logAdminAudit({
      action: 'SUPPLIER_PAYMENT_CREATED' as any,
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'SUPPLIER_PAYMENT',
      targetId: paymentId,
      metadata: {
        paymentId,
        paymentNumber,
        supplierId: canonicalSupplierId,
        amountPaise,
        paymentMethod,
        cashBankAccountCode: authoritativeAccount.accountCode,
        status: 'DRAFT',
        paymentDate,
      },
    });

    const { _serverTxnToken, ...safePayment } = paymentDoc as any;
    return { payment: safePayment as SupplierPayment, isIdempotentReplay: false };
  }

  /**
   * Post a Supplier Payment (DRAFT -> POSTED)
   * Creates exactly one double-entry journal:
   * AP 2100 DR / Cash or Bank CR
   * Strictly SUPER_ADMIN authorized and atomic
   */
  public static async postSupplierPayment(
    adminSession: AdminSession,
    paymentId: string,
    payload?: PostSupplierPaymentPayload,
    req?: any
  ): Promise<PostSupplierPaymentResponse> {
    // 1. Enforce SUPER_ADMIN Role
    if (!adminSession || adminSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED: Only Super Admin users can post supplier payments.');
    }

    if (!paymentId || typeof paymentId !== 'string' || !paymentId.trim()) {
      throw new Error('INVALID_PAYMENT_ID: paymentId is required.');
    }
    const cleanId = paymentId.trim();

    // 2. Strict Client Injection Guards
    const rawPayload = (payload || {}) as any;
    if (
      rawPayload.amountPaise !== undefined ||
      rawPayload.supplierId !== undefined ||
      rawPayload.paymentId !== undefined ||
      rawPayload.paymentNumber !== undefined ||
      rawPayload.journalId !== undefined ||
      rawPayload.voucherNumber !== undefined ||
      rawPayload.status !== undefined ||
      rawPayload.accountingStatus !== undefined ||
      rawPayload.postedAt !== undefined ||
      rawPayload.reversedAt !== undefined ||
      rawPayload.reversalJournalId !== undefined ||
      rawPayload.supplierSnapshot !== undefined ||
      rawPayload.cashBankAccountCode !== undefined ||
      rawPayload.cashBankAccountInfo !== undefined ||
      rawPayload._serverTxnToken !== undefined
    ) {
      throw new Error(
        'CLIENT_FIELD_INJECTION_FORBIDDEN: Client cannot inject authoritative parameters (amountPaise, supplierId, status, journalId, voucherNumber, etc.).'
      );
    }

    // 3. Idempotency Check on Post
    const idempotencyKey = typeof rawPayload?.idempotencyKey === 'string' ? rawPayload.idempotencyKey.trim() : null;
    if (idempotencyKey) {
      if (idempotencyKey.length < 5) {
        throw new Error('INVALID_IDEMPOTENCY_KEY: idempotencyKey must be at least 5 characters.');
      }

      const idempDocRef = doc(db, 'idempotencyKeys', `supplier_payment_post_${idempotencyKey}`);
      const idempSnap = await getDoc(idempDocRef);

      if (idempSnap.exists()) {
        const idempData = idempSnap.data();
        if (idempData.paymentId !== cleanId) {
          throw new Error(
            `IDEMPOTENCY_CONFLICT: Idempotency key "${idempotencyKey}" was previously used for payment "${idempData.paymentId}".`
          );
        }

        const paymentSnap = await getDoc(doc(db, 'supplierPayments', cleanId));
        if (paymentSnap.exists()) {
          const payData = paymentSnap.data() as SupplierPayment;
          const { _serverTxnToken, ...safePayment } = payData as any;

          let journalData: any = null;
          if (payData.journalId) {
            const jSnap = await getDoc(doc(db, 'journalEntries', payData.journalId));
            if (jSnap.exists()) {
              const { _serverTxnToken: _j, ...safeJ } = jSnap.data() as any;
              journalData = safeJ;
            }
          }

          return {
            payment: safePayment as SupplierPayment,
            journal: journalData,
            isIdempotentReplay: true,
          };
        }
      }
    }

    // 4. Load Supplier Payment from Firestore
    const paymentRef = doc(db, 'supplierPayments', cleanId);
    let paymentSnap;
    try {
      paymentSnap = await getDoc(paymentRef);
    } catch (err: any) {
      if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
        throw new Error(`PAYMENT_NOT_FOUND: Supplier payment "${cleanId}" not found.`);
      }
      throw err;
    }

    if (!paymentSnap.exists()) {
      throw new Error(`PAYMENT_NOT_FOUND: Supplier payment "${cleanId}" not found.`);
    }

    const payment = paymentSnap.data() as SupplierPayment;

    // 5. Verify Payment Status
    if (payment.status !== 'DRAFT') {
      if (payment.status === 'POSTED') {
        let journalData: any = null;
        if (payment.journalId) {
          const jSnap = await getDoc(doc(db, 'journalEntries', payment.journalId));
          if (jSnap.exists()) {
            const { _serverTxnToken: _j, ...safeJ } = jSnap.data() as any;
            journalData = safeJ;
          }
        }
        const { _serverTxnToken, ...safePayment } = payment as any;
        return {
          payment: safePayment as SupplierPayment,
          journal: journalData,
          isIdempotentReplay: true,
        };
      }
      throw new Error(
        `INVALID_PAYMENT_STATUS: Cannot post supplier payment "${cleanId}". Only DRAFT payments can be posted (current status: "${payment.status}").`
      );
    }

    // 6. Verify Supplier Identity
    if (!payment.supplierId || typeof payment.supplierId !== 'string' || !payment.supplierId.trim()) {
      throw new Error(`INVALID_SUPPLIER_ID: Payment does not contain a valid supplierId.`);
    }
    const rawSupplierId = payment.supplierId.trim();
    const canonicalSupplierId =
      (await PartyLedgerService.resolveCanonicalSupplierId(rawSupplierId)) || rawSupplierId;

    // 7. Verify AmountPaise
    const amountPaise = payment.amountPaise;
    if (
      typeof amountPaise !== 'number' ||
      !Number.isFinite(amountPaise) ||
      !Number.isInteger(amountPaise) ||
      amountPaise <= 0
    ) {
      throw new Error(`INVALID_AMOUNT: Payment amountPaise must be a positive integer. Found: ${amountPaise}`);
    }
    const amountRupees = paiseToRupees(amountPaise);

    // 8. Verify Payment Method
    const paymentMethod = payment.paymentMethod;
    if (!paymentMethod || !ALLOWED_SUPPLIER_PAYMENT_METHODS.includes(paymentMethod)) {
      throw new Error(`INVALID_PAYMENT_METHOD: Payment method "${paymentMethod}" is invalid.`);
    }

    // 9. Revalidate Cash/Bank Account against Chart of Accounts
    if (!payment.cashBankAccountCode || typeof payment.cashBankAccountCode !== 'string') {
      throw new Error(`MISSING_CASH_BANK_ACCOUNT: Payment is missing cashBankAccountCode.`);
    }
    const authoritativeCashAccount = await this.getAuthoritativeCashBankAccount(payment.cashBankAccountCode);

    // 10. Revalidate AP 2100 Account against Chart of Accounts
    const apAccount = await this.getAuthoritativeApAccount();

    // 11. Verify Payment Date & Accounting Period
    if (!payment.paymentDate || !isValidDateFormat(payment.paymentDate)) {
      throw new Error(`INVALID_DATE_FORMAT: Payment paymentDate "${payment.paymentDate}" is invalid.`);
    }
    await validatePeriodIsOpen(payment.paymentDate);

    // 12. Build Double-Entry Journal Lines
    // AP 2100 Dr amountRupees (Reduces accounts payable)
    // Cash/Bank Cr amountRupees (Reduces liquid cash/bank)
    const journalLines: JournalLinePayload[] = [
      {
        accountId: apAccount.accountId,
        debit: amountRupees,
        credit: 0,
        description: `Accounts Payable debit for Supplier Payment ${payment.paymentNumber} to ${payment.supplierSnapshot?.businessName || canonicalSupplierId}`,
        supplierId: canonicalSupplierId,
      },
      {
        accountId: authoritativeCashAccount.accountId,
        debit: 0,
        credit: amountRupees,
        description: `Cash/Bank credit for Supplier Payment ${payment.paymentNumber} via ${paymentMethod} to ${payment.supplierSnapshot?.businessName || canonicalSupplierId}`,
        supplierId: canonicalSupplierId,
      },
    ];

    // 13. Create & Post Journal via JournalEngine
    const adminUserObj: AdminUser = {
      uid: adminSession.uid,
      email: adminSession.email || 'admin@mrfutkar.in',
      name: adminSession.name || 'Authoritative Admin',
      mobile: adminSession.mobile || '+919999999999',
      role: (adminSession.role as any) || 'SUPER_ADMIN',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'SYSTEM',
    };

    // Check if an existing journal was already initiated for this payment
    let journal: JournalEntry;
    const existingJournalQuery = query(
      collection(db, 'journalEntries'),
      where('referenceType', '==', 'SUPPLIER_PAYMENT'),
      where('referenceId', '==', cleanId)
    );
    const existingJournalsSnap = await getDocs(existingJournalQuery);

    if (!existingJournalsSnap.empty) {
      const existingJ = existingJournalsSnap.docs[0].data() as JournalEntry;
      if (existingJ.status === 'POSTED') {
        journal = existingJ;
      } else {
        const postedRes = await JournalEngine.postJournal(adminUserObj, existingJ.journalId, req);
        journal = postedRes.journal;
      }
    } else {
      const draftRes = await JournalEngine.createDraftJournal(
        adminUserObj,
        {
          journalDate: payment.paymentDate,
          voucherType: 'PAYMENT',
          referenceType: 'SUPPLIER_PAYMENT',
          referenceId: cleanId,
          narration: `Supplier Payment ${payment.paymentNumber} to ${payment.supplierSnapshot?.businessName || canonicalSupplierId} via ${paymentMethod}`,
          lines: journalLines,
          supplierId: canonicalSupplierId,
          paymentMethod: paymentMethod,
        },
        req
      );

      const postedRes = await JournalEngine.postJournal(adminUserObj, draftRes.journal.journalId, req);
      journal = postedRes.journal;
    }

    // 14. Update Payment Document Atomically
    const now = new Date().toISOString();
    const postedPayment: SupplierPayment & { _serverTxnToken: string } = {
      ...payment,
      status: 'POSTED',
      accountingStatus: 'POSTED',
      journalId: journal.journalId,
      voucherNumber: journal.journalNumber,
      postedAt: journal.postedAt || now,
      version: (payment.version || 1) + 1,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    await setDoc(paymentRef, cleanDocData(postedPayment));

    // 15. Store persistent idempotency record
    if (idempotencyKey) {
      await setDoc(doc(db, 'idempotencyKeys', `supplier_payment_post_${idempotencyKey}`), {
        key: idempotencyKey,
        targetType: 'SUPPLIER_PAYMENT_POST',
        paymentId: cleanId,
        status: 'POSTED',
        journalId: journal.journalId,
        voucherNumber: journal.journalNumber,
        postedAt: journal.postedAt || now,
        _serverTxnToken: SERVER_TXN_TOKEN,
      });
    }

    // 16. Audit Log
    await logAdminAudit({
      action: 'SUPPLIER_PAYMENT_POSTED' as any,
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'SUPPLIER_PAYMENT',
      targetId: cleanId,
      metadata: {
        paymentId: cleanId,
        paymentNumber: payment.paymentNumber,
        supplierId: canonicalSupplierId,
        amountPaise,
        paymentMethod,
        journalId: journal.journalId,
        voucherNumber: journal.journalNumber,
        cashBankAccountCode: authoritativeCashAccount.accountCode,
        status: 'POSTED',
        paymentDate: payment.paymentDate,
      },
    });

    const { _serverTxnToken, ...safePayment } = postedPayment as any;
    return {
      payment: safePayment as SupplierPayment,
      journal,
      isIdempotentReplay: false,
    };
  }

  /**
   * Get single Supplier Payment by ID
   */
  public static async getSupplierPaymentById(paymentId: string): Promise<SupplierPayment | null> {
    if (!paymentId || typeof paymentId !== 'string') return null;
    const cleanId = paymentId.trim();

    try {
      const snap = await getDoc(doc(db, 'supplierPayments', cleanId));
      if (!snap.exists()) return null;
      const data = snap.data() as SupplierPayment;
      const { _serverTxnToken, ...safePayment } = data as any;
      return safePayment as SupplierPayment;
    } catch {
      return null;
    }
  }

  /**
   * List Supplier Payments with in-memory filtering and pagination
   */
  public static async listSupplierPayments(
    filters: SupplierPaymentListFilters = {}
  ): Promise<SupplierPaymentListResponse> {
    const page = Math.max(1, typeof filters.page === 'number' && Number.isFinite(filters.page) ? Math.floor(filters.page) : 1);
    const rawPageSize = filters.pageSize !== undefined ? Number(filters.pageSize) : 50;
    if (rawPageSize > 100) {
      throw new Error('PAGE_SIZE_EXCEEDED: Page size cannot exceed 100.');
    }
    const pageSize = Math.max(1, Number.isFinite(rawPageSize) ? Math.floor(rawPageSize) : 50);

    if (filters.fromDate && !isValidDateFormat(filters.fromDate)) {
      throw new Error('INVALID_DATE_FORMAT: fromDate must be valid YYYY-MM-DD format.');
    }
    if (filters.toDate && !isValidDateFormat(filters.toDate)) {
      throw new Error('INVALID_DATE_FORMAT: toDate must be valid YYYY-MM-DD format.');
    }
    if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
      throw new Error('INVALID_DATE_RANGE: fromDate cannot be after toDate.');
    }

    let targetSupplierId: string | undefined = undefined;
    if (typeof filters.supplierId === 'string' && filters.supplierId.trim()) {
      const rawSupp = filters.supplierId.trim();
      targetSupplierId = (await PartyLedgerService.resolveCanonicalSupplierId(rawSupp)) || rawSupp;
    }

    // Fetch Payments using authoritative server token query
    const paymentsRef = collection(db, 'supplierPayments');
    const qPayments = query(paymentsRef, where('_serverTxnToken', '==', SERVER_TXN_TOKEN));
    const snap = await getDocs(qPayments);

    let allPayments: SupplierPayment[] = [];
    snap.forEach((d) => {
      const data = d.data() as SupplierPayment;
      const { _serverTxnToken, ...safePayment } = data as any;
      allPayments.push(safePayment as SupplierPayment);
    });

    // Apply in-memory filters
    if (targetSupplierId) {
      allPayments = allPayments.filter((p) => p.supplierId === targetSupplierId);
    }
    if (filters.paymentMethod) {
      allPayments = allPayments.filter((p) => p.paymentMethod === filters.paymentMethod);
    }
    if (filters.status) {
      allPayments = allPayments.filter((p) => p.status === filters.status);
    }
    if (filters.fromDate) {
      allPayments = allPayments.filter((p) => p.paymentDate >= filters.fromDate!);
    }
    if (filters.toDate) {
      allPayments = allPayments.filter((p) => p.paymentDate <= filters.toDate!);
    }
    if (filters.search) {
      const s = filters.search.trim().toLowerCase();
      allPayments = allPayments.filter((p) =>
        (p.paymentNumber && p.paymentNumber.toLowerCase().includes(s)) ||
        (p.supplierId && p.supplierId.toLowerCase().includes(s)) ||
        (p.supplierSnapshot?.businessName && p.supplierSnapshot.businessName.toLowerCase().includes(s)) ||
        (p.referenceNumber && p.referenceNumber.toLowerCase().includes(s))
      );
    }

    // Sort descending by paymentDate, then createdAt
    allPayments.sort((a, b) => {
      const dCmp = (b.paymentDate || '').localeCompare(a.paymentDate || '');
      if (dCmp !== 0) return dCmp;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    const total = allPayments.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const start = (page - 1) * pageSize;
    const paginated = allPayments.slice(start, start + pageSize);

    return {
      payments: paginated,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * Helper: Get Eligible Outstanding Purchase Invoices for Supplier Payment
   * Strictly server-authoritative outstanding calculation derived from posted purchase invoices and credit/debit notes.
   */
  public static async getEligibleInvoicesForPayment(
    adminSession: AdminSession,
    paymentId: string
  ): Promise<EligiblePurchaseInvoiceForAllocation[]> {
    if (!adminSession || adminSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED: Only Super Admin users can view eligible purchase invoices for allocation.');
    }
    const cleanId = (paymentId || '').trim();
    if (!cleanId) {
      throw new Error('INVALID_PAYMENT_ID: paymentId is required.');
    }
    const paymentRef = doc(db, 'supplierPayments', cleanId);
    let paymentSnap;
    try {
      paymentSnap = await getDoc(paymentRef);
    } catch (err: any) {
      if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
        throw new Error(`PAYMENT_NOT_FOUND: Supplier payment "${cleanId}" not found.`);
      }
      throw err;
    }
    if (!paymentSnap.exists()) {
      throw new Error(`PAYMENT_NOT_FOUND: Supplier payment "${cleanId}" not found.`);
    }
    const payment = paymentSnap.data() as SupplierPayment;

    if (payment.status !== 'POSTED') {
      throw new Error(
        `INVALID_PAYMENT_STATUS: Cannot allocate payment with status "${payment.status}". Only POSTED supplier payments can be allocated.`
      );
    }

    const rawSupplierId = payment.supplierId.trim();
    const canonicalSupplierId =
      (await PartyLedgerService.resolveCanonicalSupplierId(rawSupplierId)) || rawSupplierId;

    // Query purchaseInvoices for this supplier
    const qInvoices = query(
      collection(db, 'purchaseInvoices'),
      where('supplierId', '==', canonicalSupplierId)
    );
    const invSnap = await getDocs(qInvoices);

    // Query all posted credit/debit notes for this supplier
    const qNotes = query(
      collection(db, 'creditDebitNotes'),
      where('supplierId', '==', canonicalSupplierId)
    );
    const notesSnap = await getDocs(qNotes);
    const notesByInvoice = new Map<string, CreditDebitNote[]>();
    notesSnap.forEach((d) => {
      const note = d.data() as CreditDebitNote;
      if (note.status === 'POSTED' && note.originalInvoiceId) {
        const list = notesByInvoice.get(note.originalInvoiceId) || [];
        list.push(note);
        notesByInvoice.set(note.originalInvoiceId, list);
      }
    });

    // Query all posted supplier payments for this supplier to sum existing allocations
    const allocatedByInvoice = new Map<string, number>();
    try {
      const qPayments = query(
        collection(db, 'supplierPayments'),
        where('supplierId', '==', canonicalSupplierId)
      );
      const paymentsSnap = await getDocs(qPayments);
      paymentsSnap.forEach((d) => {
        const pay = d.data() as SupplierPayment;
        if (pay.status === 'POSTED' && Array.isArray(pay.allocations)) {
          for (const alloc of pay.allocations) {
            if (alloc.invoiceId && alloc.allocatedAmountPaise > 0) {
              const current = allocatedByInvoice.get(alloc.invoiceId) || 0;
              allocatedByInvoice.set(alloc.invoiceId, current + alloc.allocatedAmountPaise);
            }
          }
        }
      });
    } catch {
      // Blanket collection query restricted without client auth token; fallback to invoice-level tracking
    }

    const eligibleList: EligiblePurchaseInvoiceForAllocation[] = [];
    for (const d of invSnap.docs) {
      const inv = d.data() as PurchaseInvoice;
      if (inv.invoiceStatus !== 'POSTED' || inv.accountingStatus !== 'POSTED') {
        continue;
      }
      const grandTotalPaise = Math.round((inv.grandTotal || 0) * 100);
      let adjustedTotalPaise = grandTotalPaise;

      // Apply credit/debit notes
      const notes = notesByInvoice.get(inv.invoiceId) || [];
      for (const note of notes) {
        const notePaise = Math.round((note.grandTotal || 0) * 100);
        if (note.noteType === 'PURCHASE_DEBIT_NOTE') {
          adjustedTotalPaise -= notePaise;
        } else if (note.noteType === 'PURCHASE_CREDIT_NOTE') {
          adjustedTotalPaise += notePaise;
        }
      }
      adjustedTotalPaise = Math.max(0, adjustedTotalPaise);

      // Apply already allocated payments
      const alreadyAllocatedPaise = Math.max(
        allocatedByInvoice.get(inv.invoiceId) || 0,
        inv.paidAmountPaise || 0
      );
      const outstandingAmountPaise = Math.max(0, adjustedTotalPaise - alreadyAllocatedPaise);

      if (outstandingAmountPaise > 0) {
        eligibleList.push({
          invoiceId: inv.invoiceId,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate,
          grandTotal: inv.grandTotal,
          grandTotalPaise,
          adjustedTotalPaise,
          alreadyAllocatedPaise,
          outstandingAmountPaise,
          paymentStatus: inv.paymentStatus || 'UNPAID',
        });
      }
    }

    // Sort by invoiceDate ascending (FIFO)
    eligibleList.sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.invoiceNumber.localeCompare(b.invoiceNumber));
    return eligibleList;
  }

  private static allocatePaymentLocks = new Map<
    string,
    Promise<AllocateSupplierPaymentResponse>
  >();

  /**
   * Allocate Supplier Payment against one or more eligible Purchase Invoices
   * Concurrency-controlled with in-memory lock AND atomic Firestore runTransaction
   */
  public static async allocateSupplierPayment(
    adminSession: AdminSession,
    paymentId: string,
    payload: AllocateSupplierPaymentPayload,
    req?: any
  ): Promise<AllocateSupplierPaymentResponse> {
    const cleanId = (paymentId || '').trim();
    if (!cleanId) {
      throw new Error('INVALID_PAYMENT_ID: paymentId is required.');
    }

    const existingLock = this.allocatePaymentLocks.get(cleanId);
    if (existingLock) {
      await existingLock.catch(() => {});
    }

    const allocatePromise = this.executeAllocateSupplierPayment(adminSession, cleanId, payload, req);
    this.allocatePaymentLocks.set(cleanId, allocatePromise);

    try {
      return await allocatePromise;
    } finally {
      this.allocatePaymentLocks.delete(cleanId);
    }
  }

  /**
   * Internal authoritative execution of supplier payment allocation
   */
  private static async executeAllocateSupplierPayment(
    adminSession: AdminSession,
    paymentId: string,
    payload: AllocateSupplierPaymentPayload,
    req?: any
  ): Promise<AllocateSupplierPaymentResponse> {
    // 1. Super Admin Authentication check
    if (!adminSession || adminSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED: Only Super Admin users can allocate supplier payments.');
    }

    const rawPayload = (payload || {}) as any;

    // 2. Client field injection defense
    const forbiddenKeys = [
      'supplierId',
      'paymentId',
      'invoiceId',
      'allocationId',
      'allocatedAmountPaise',
      'createdAt',
      'createdBy',
      'amountPaise',
      'amount',
      'paymentNumber',
      'paymentDate',
      'status',
      'accountingStatus',
      'unallocatedAmountPaise',
      'allocationStatus',
      'invoiceOutstanding',
      'outstandingAmountPaise',
      'paidAmountPaise',
      'apBalance',
      'grandTotal',
      'journalId',
      'voucherNumber',
      '_serverTxnToken',
    ];
    for (const key of forbiddenKeys) {
      if (rawPayload[key] !== undefined) {
        throw new Error(
          `CLIENT_FIELD_INJECTION_FORBIDDEN: Client cannot inject authoritative parameters ("${key}").`
        );
      }
    }

    // 3. Idempotency Key validation
    const idempotencyKey =
      typeof rawPayload.idempotencyKey === 'string' && rawPayload.idempotencyKey.trim()
        ? rawPayload.idempotencyKey.trim()
        : null;

    if (idempotencyKey) {
      if (idempotencyKey.length < 5) {
        throw new Error('INVALID_IDEMPOTENCY_KEY: idempotencyKey must be at least 5 characters.');
      }

      const idempDocRef = doc(db, 'idempotencyKeys', `supplier_payment_alloc_${idempotencyKey}`);
      const idempSnap = await getDoc(idempDocRef);

      if (idempSnap.exists()) {
        const idempData = idempSnap.data();
        if (idempData.paymentId !== paymentId) {
          throw new Error(
            `IDEMPOTENCY_CONFLICT: Idempotency key "${idempotencyKey}" was previously used for payment "${idempData.paymentId}".`
          );
        }

        const paymentSnap = await getDoc(doc(db, 'supplierPayments', paymentId));
        if (paymentSnap.exists()) {
          const payData = paymentSnap.data() as SupplierPayment;
          const { _serverTxnToken, ...safePayment } = payData as any;
          return {
            success: true,
            payment: safePayment as SupplierPayment,
            isIdempotentReplay: true,
          };
        }
      }
    }

    // 4. Validate allocations array input
    const requestedAllocations = rawPayload.allocations;
    if (!Array.isArray(requestedAllocations) || requestedAllocations.length === 0) {
      throw new Error('INVALID_ALLOCATIONS: allocations must be a non-empty array.');
    }

    const seenInvoiceIds = new Set<string>();
    let totalRequestedPaise = 0;

    for (let i = 0; i < requestedAllocations.length; i++) {
      const item = requestedAllocations[i];
      if (!item || typeof item !== 'object') {
        throw new Error(`INVALID_ALLOCATION_ITEM: Allocation at index ${i} is invalid.`);
      }
      const invId = typeof item.invoiceId === 'string' ? item.invoiceId.trim() : '';
      if (!invId) {
        throw new Error(`MISSING_INVOICE_ID: Allocation at index ${i} is missing invoiceId.`);
      }
      if (seenInvoiceIds.has(invId)) {
        throw new Error(
          `DUPLICATE_INVOICE_IN_ALLOCATION: Invoice "${invId}" appears more than once in allocation request. Combine into a single allocation.`
        );
      }
      seenInvoiceIds.add(invId);

      const amtPaise =
        typeof item.amountPaise === 'number'
          ? item.amountPaise
          : typeof (item as any).allocatedAmountPaise === 'number'
          ? (item as any).allocatedAmountPaise
          : item.amountPaise;
      if (
        typeof amtPaise !== 'number' ||
        !Number.isFinite(amtPaise) ||
        !Number.isInteger(amtPaise) ||
        amtPaise <= 0
      ) {
        throw new Error(
          `INVALID_ALLOCATION_AMOUNT: Allocation amount for invoice "${invId}" must be a positive integer in paise.`
        );
      }
      totalRequestedPaise += amtPaise;
    }

    // 5. Pre-transaction: Load payment and verify state
    const paymentRef = doc(db, 'supplierPayments', paymentId);
    let paymentSnap;
    try {
      paymentSnap = await getDoc(paymentRef);
    } catch (err: any) {
      if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
        throw new Error(`PAYMENT_NOT_FOUND: Supplier payment "${paymentId}" not found.`);
      }
      throw err;
    }
    if (!paymentSnap.exists()) {
      throw new Error(`PAYMENT_NOT_FOUND: Supplier payment "${paymentId}" not found.`);
    }
    const payment = paymentSnap.data() as SupplierPayment;

    if (payment.status !== 'POSTED') {
      throw new Error(
        `INVALID_PAYMENT_STATUS: Only POSTED supplier payments can be allocated to invoices (current status: "${payment.status}").`
      );
    }

    const existingAllocations: SupplierPaymentAllocation[] = Array.isArray(payment.allocations) ? payment.allocations : [];
    const currentAllocatedPaise = existingAllocations.reduce((sum, a) => sum + (a.allocatedAmountPaise || 0), 0);
    const currentUnallocatedPaise = Math.max(0, payment.amountPaise - currentAllocatedPaise);

    if (totalRequestedPaise > currentUnallocatedPaise) {
      throw new Error(
        `ALLOCATION_EXCEEDS_PAYMENT_AMOUNT: Requested allocation total of ₹${paiseToRupees(totalRequestedPaise)} exceeds payment unallocated amount of ₹${paiseToRupees(currentUnallocatedPaise)}.`
      );
    }

    // Resolve canonical supplier ID
    const canonicalSupplierId =
      (await PartyLedgerService.resolveCanonicalSupplierId(payment.supplierId)) || payment.supplierId.trim();

    // 6. Pre-transaction: Verify invoices and calculate live balances
    const invoiceAllocationsMap = new Map<string, number>();
    try {
      const qAllPayments = query(collection(db, 'supplierPayments'), where('supplierId', '==', canonicalSupplierId));
      const allPaymentsSnap = await getDocs(qAllPayments);
      allPaymentsSnap.forEach((d) => {
        const p = d.data() as SupplierPayment;
        if (p.status === 'POSTED' && Array.isArray(p.allocations)) {
          for (const a of p.allocations) {
            if (a.invoiceId && a.allocatedAmountPaise > 0) {
              const prev = invoiceAllocationsMap.get(a.invoiceId) || 0;
              invoiceAllocationsMap.set(a.invoiceId, prev + a.allocatedAmountPaise);
            }
          }
        }
      });
    } catch {
      // Blanket collection query restricted without client auth token; fallback to invoice-level tracking
    }

    const qNotes = query(collection(db, 'creditDebitNotes'), where('supplierId', '==', canonicalSupplierId));
    const notesSnap = await getDocs(qNotes);
    const notesByInvoice = new Map<string, CreditDebitNote[]>();
    notesSnap.forEach((d) => {
      const n = d.data() as CreditDebitNote;
      if (n.status === 'POSTED' && n.originalInvoiceId) {
        const list = notesByInvoice.get(n.originalInvoiceId) || [];
        list.push(n);
        notesByInvoice.set(n.originalInvoiceId, list);
      }
    });

    const targetInvoices: {
      invDoc: PurchaseInvoice;
      invRef: any;
      requestedPaise: number;
      initialGrandTotalPaise: number;
      adjustedTotalPaise: number;
      previouslyAllocatedPaise: number;
      outstandingBeforePaise: number;
      outstandingAfterPaise: number;
    }[] = [];

    for (const allocItem of requestedAllocations) {
      const invRef = doc(db, 'purchaseInvoices', allocItem.invoiceId);
      const invSnap = await getDoc(invRef);
      if (!invSnap.exists()) {
        throw new Error(`INVOICE_NOT_FOUND: Purchase invoice "${allocItem.invoiceId}" not found.`);
      }
      const inv = invSnap.data() as PurchaseInvoice;

      if (inv.invoiceStatus !== 'POSTED') {
        throw new Error(
          `INVALID_INVOICE_STATUS: Cannot allocate against purchase invoice "${inv.invoiceNumber}" with status "${inv.invoiceStatus}". Only POSTED purchase invoices can be allocated.`
        );
      }
      if (inv.accountingStatus !== 'POSTED') {
        throw new Error(
          `INVOICE_NOT_POSTED: Purchase invoice "${inv.invoiceNumber}" has not been posted to accounting.`
        );
      }

      const invCanonicalSupplierId =
        (await PartyLedgerService.resolveCanonicalSupplierId(inv.supplierId || '')) || (inv.supplierId || '').trim();
      if (!invCanonicalSupplierId || invCanonicalSupplierId !== canonicalSupplierId) {
        throw new Error(
          `CROSS_SUPPLIER_ALLOCATION_FORBIDDEN: Purchase invoice "${inv.invoiceNumber}" belongs to supplier "${inv.supplierId}", which does not match payment supplier "${payment.supplierId}".`
        );
      }

      const initialGrandTotalPaise = Math.round((inv.grandTotal || 0) * 100);
      let adjustedTotalPaise = initialGrandTotalPaise;

      const notes = notesByInvoice.get(inv.invoiceId) || [];
      for (const note of notes) {
        const notePaise = Math.round((note.grandTotal || 0) * 100);
        if (note.noteType === 'PURCHASE_DEBIT_NOTE') {
          adjustedTotalPaise -= notePaise;
        } else if (note.noteType === 'PURCHASE_CREDIT_NOTE') {
          adjustedTotalPaise += notePaise;
        }
      }
      adjustedTotalPaise = Math.max(0, adjustedTotalPaise);

      const previouslyAllocatedPaise = Math.max(
        invoiceAllocationsMap.get(inv.invoiceId) || 0,
        inv.paidAmountPaise || 0
      );
      const outstandingBeforePaise = Math.max(0, adjustedTotalPaise - previouslyAllocatedPaise);

      if (outstandingBeforePaise <= 0) {
        throw new Error(
          `INVOICE_ALREADY_FULLY_PAID: Purchase invoice "${inv.invoiceNumber}" is already fully paid.`
        );
      }

      if (allocItem.amountPaise > outstandingBeforePaise) {
        throw new Error(
          `ALLOCATION_EXCEEDS_INVOICE_OUTSTANDING: Requested allocation of ₹${paiseToRupees(allocItem.amountPaise)} exceeds invoice "${inv.invoiceNumber}" outstanding balance of ₹${paiseToRupees(outstandingBeforePaise)}.`
        );
      }

      targetInvoices.push({
        invDoc: inv,
        invRef,
        requestedPaise: allocItem.amountPaise,
        initialGrandTotalPaise,
        adjustedTotalPaise,
        previouslyAllocatedPaise,
        outstandingBeforePaise,
        outstandingAfterPaise: outstandingBeforePaise - allocItem.amountPaise,
      });
    }

    // 7. Atomic Database Transaction (optimistic concurrency and over-allocation defense)
    const now = new Date().toISOString();
    let updatedPaymentResult: SupplierPayment | null = null;

    await runTransaction(db, async (txn) => {
      // Re-read payment doc inside txn
      const txnPaymentSnap = await txn.get(paymentRef);
      if (!txnPaymentSnap.exists()) {
        throw new Error(`PAYMENT_NOT_FOUND: Supplier payment "${paymentId}" not found in transaction.`);
      }
      const txnPayment = txnPaymentSnap.data() as SupplierPayment;

      if (txnPayment.status !== 'POSTED') {
        throw new Error(
          `INVALID_PAYMENT_STATUS: Payment status changed to "${txnPayment.status}". Only POSTED payments can be allocated.`
        );
      }

      const txnExistingAllocations = Array.isArray(txnPayment.allocations) ? txnPayment.allocations : [];
      const txnAllocatedPaise = txnExistingAllocations.reduce((sum, a) => sum + (a.allocatedAmountPaise || 0), 0);
      const txnUnallocatedPaise = Math.max(0, txnPayment.amountPaise - txnAllocatedPaise);

      if (totalRequestedPaise > txnUnallocatedPaise) {
        throw new Error(
          `ALLOCATION_EXCEEDS_PAYMENT_AMOUNT: Requested allocation total of ₹${paiseToRupees(totalRequestedPaise)} exceeds payment unallocated amount of ₹${paiseToRupees(txnUnallocatedPaise)}.`
        );
      }

      // Re-read target invoice docs inside txn
      for (const item of targetInvoices) {
        const txnInvSnap = await txn.get(item.invRef);
        if (!txnInvSnap.exists()) {
          throw new Error(`INVOICE_NOT_FOUND: Purchase invoice "${item.invDoc.invoiceId}" not found in transaction.`);
        }
      }

      // Build new allocation records
      const newAllocationRecords: SupplierPaymentAllocation[] = targetInvoices.map((item) => ({
        paymentId,
        invoiceId: item.invDoc.invoiceId,
        invoiceNumber: item.invDoc.invoiceNumber,
        supplierId: canonicalSupplierId,
        allocatedAmountPaise: item.requestedPaise,
        createdAt: now,
        allocatedAt: now,
      }));

      const mergedAllocations = [...txnExistingAllocations, ...newAllocationRecords];
      const newTotalAllocatedPaise = txnAllocatedPaise + totalRequestedPaise;
      const newUnallocatedPaise = txnPayment.amountPaise - newTotalAllocatedPaise;
      const newAllocationStatus: SupplierPaymentAllocationStatus =
        newUnallocatedPaise === 0 ? 'FULLY_ALLOCATED' : 'PARTIALLY_ALLOCATED';

      const updatedPaymentDoc = {
        ...txnPayment,
        allocations: mergedAllocations,
        allocatedAmountPaise: newTotalAllocatedPaise,
        unallocatedAmountPaise: newUnallocatedPaise,
        allocationStatus: newAllocationStatus,
        version: (txnPayment.version || 1) + 1,
        updatedAt: now,
        _serverTxnToken: SERVER_TXN_TOKEN,
      };

      txn.update(paymentRef, cleanDocData(updatedPaymentDoc));
      updatedPaymentResult = updatedPaymentDoc as SupplierPayment;

      // Update each invoice
      for (const item of targetInvoices) {
        const newPaidAmountPaise = item.previouslyAllocatedPaise + item.requestedPaise;
        const newOutstandingPaise = item.outstandingAfterPaise;
        const newPaymentStatus: InvoicePaymentStatus =
          newOutstandingPaise === 0 ? 'PAID' : 'PARTIALLY_PAID';

        const existingInvoiceAllocations = Array.isArray((item.invDoc as any).allocations)
          ? [...(item.invDoc as any).allocations]
          : [];
        existingInvoiceAllocations.push({
          paymentId,
          paymentNumber: txnPayment.paymentNumber,
          allocatedAmountPaise: item.requestedPaise,
          createdAt: now,
        });

        txn.update(item.invRef, cleanDocData({
          paymentStatus: newPaymentStatus,
          paidAmountPaise: newPaidAmountPaise,
          outstandingAmountPaise: newOutstandingPaise,
          allocations: existingInvoiceAllocations,
          updatedAt: now,
          updatedBy: adminSession.uid,
          _serverTxnToken: SERVER_TXN_TOKEN,
        }));
      }

      // Record idempotency key if provided
      if (idempotencyKey) {
        const idempRef = doc(db, 'idempotencyKeys', `supplier_payment_alloc_${idempotencyKey}`);
        txn.set(idempRef, {
          key: idempotencyKey,
          targetType: 'SUPPLIER_PAYMENT_ALLOCATION',
          paymentId,
          supplierId: canonicalSupplierId,
          totalAllocatedPaise: totalRequestedPaise,
          allocatedAt: now,
          _serverTxnToken: SERVER_TXN_TOKEN,
        });
      }
    });

    // 8. Immutable Admin Audit Logging
    await logAdminAudit({
      action: 'SUPPLIER_PAYMENT_ALLOCATED' as any,
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'SUPPLIER_PAYMENT',
      targetId: paymentId,
      metadata: {
        paymentId,
        paymentNumber: payment.paymentNumber,
        supplierId: canonicalSupplierId,
        allocatedAmountPaise: totalRequestedPaise,
        allocationsCount: requestedAllocations.length,
        allocations: requestedAllocations,
      },
      req,
    });

    const { _serverTxnToken, ...safePayment } = (updatedPaymentResult || payment) as any;
    return {
      success: true,
      payment: safePayment as SupplierPayment,
      isIdempotentReplay: false,
    };
  }

  private static reversePaymentLocks = new Map<
    string,
    Promise<ReverseSupplierPaymentResponse>
  >();

  /**
   * Reverse Supplier Payment (Entrypoint with concurrency synchronization)
   * Phase 5.8 Part 3: Supplier Payment Reversal
   */
  public static async reverseSupplierPayment(
    adminSession: AdminSession,
    paymentId: string,
    payload?: ReverseSupplierPaymentPayload,
    req?: any
  ): Promise<ReverseSupplierPaymentResponse> {
    const cleanId = (paymentId || '').trim();
    if (!cleanId) {
      throw new Error('INVALID_PAYMENT_ID: paymentId is required.');
    }

    const existingLock = this.reversePaymentLocks.get(cleanId);
    if (existingLock) {
      await existingLock.catch(() => {});
    }

    const reversePromise = this.executeReverseSupplierPayment(adminSession, cleanId, payload, req);
    this.reversePaymentLocks.set(cleanId, reversePromise);

    try {
      return await reversePromise;
    } finally {
      this.reversePaymentLocks.delete(cleanId);
    }
  }

  /**
   * Internal authoritative execution of supplier payment reversal
   */
  private static async executeReverseSupplierPayment(
    adminSession: AdminSession,
    paymentId: string,
    payload?: ReverseSupplierPaymentPayload,
    req?: any
  ): Promise<ReverseSupplierPaymentResponse> {
    // 1. Super Admin Authentication check
    if (!adminSession || adminSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED: Only Super Admin users can reverse supplier payments.');
    }

    const rawPayload = (payload || {}) as any;

    // 2. Client field injection defense
    const forbiddenKeys = [
      'amountPaise',
      'amount',
      'supplierId',
      'paymentId',
      'paymentNumber',
      'journalId',
      'voucherNumber',
      'reversalJournalId',
      'status',
      'accountingStatus',
      'paidAmountPaise',
      'outstandingAmountPaise',
      'paymentStatus',
      'allocations',
      'allocatedAmountPaise',
      'unallocatedAmountPaise',
      'allocationStatus',
      'createdBy',
      'postedAt',
      'reversedAt',
      'reversedBy',
      'supplierSnapshot',
      'cashBankAccountCode',
      'cashBankAccountInfo',
      '_serverTxnToken',
      'lines',
      'debit',
      'credit',
      'totalDebit',
      'totalCredit',
      'accountCode',
      'accountCodes',
    ];
    for (const key of forbiddenKeys) {
      if (rawPayload[key] !== undefined) {
        throw new Error(
          `CLIENT_FIELD_INJECTION_FORBIDDEN: Client cannot inject authoritative parameters ("${key}").`
        );
      }
    }

    // 3. Validate reason if provided
    const reason =
      typeof rawPayload.reason === 'string' && rawPayload.reason.trim()
        ? rawPayload.reason.trim()
        : null;
    if (reason && reason.length > 500) {
      throw new Error('INVALID_REASON: Reason cannot exceed 500 characters.');
    }

    // 4. Idempotency Key validation
    const idempotencyKey =
      typeof rawPayload.idempotencyKey === 'string' && rawPayload.idempotencyKey.trim()
        ? rawPayload.idempotencyKey.trim()
        : null;

    if (idempotencyKey) {
      if (idempotencyKey.length < 5) {
        throw new Error('INVALID_IDEMPOTENCY_KEY: idempotencyKey must be at least 5 characters.');
      }

      const idempDocRef = doc(db, 'idempotencyKeys', `supp_pay_rev_${idempotencyKey}`);
      const idempSnap = await getDoc(idempDocRef);

      if (idempSnap.exists()) {
        const idempData = idempSnap.data();
        if (idempData.paymentId !== paymentId) {
          throw new Error(
            `IDEMPOTENCY_CONFLICT: Idempotency key "${idempotencyKey}" was previously used for payment "${idempData.paymentId}".`
          );
        }

        const paymentSnap = await getDoc(doc(db, 'supplierPayments', paymentId));
        if (paymentSnap.exists()) {
          const payData = paymentSnap.data() as SupplierPayment;
          const { _serverTxnToken, ...safePayment } = payData as any;

          let reversalJournalData: any = null;
          if (payData.reversalJournalId) {
            const jSnap = await getDoc(doc(db, 'journalEntries', payData.reversalJournalId));
            if (jSnap.exists()) {
              const { _serverTxnToken: _j, ...safeJ } = jSnap.data() as any;
              reversalJournalData = safeJ;
            }
          }

          return {
            success: true,
            payment: safePayment as SupplierPayment,
            reversalJournal: reversalJournalData,
            isIdempotentReplay: true,
          };
        }
      }
    }

    // 5. Fetch Supplier Payment from Firestore
    const paymentRef = doc(db, 'supplierPayments', paymentId);
    let paymentSnap;
    try {
      paymentSnap = await getDoc(paymentRef);
    } catch (err: any) {
      if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
        throw new Error(`PAYMENT_NOT_FOUND: Supplier payment "${paymentId}" not found.`);
      }
      throw err;
    }

    if (!paymentSnap.exists()) {
      throw new Error(`PAYMENT_NOT_FOUND: Supplier payment "${paymentId}" not found.`);
    }

    const payment = paymentSnap.data() as SupplierPayment;

    // 6. Verify Status
    if (payment.status === 'DRAFT') {
      throw new Error(
        `CANNOT_REVERSE_DRAFT_PAYMENT: Supplier payment "${paymentId}" is DRAFT and cannot be reversed. Only POSTED payments can be reversed.`
      );
    }

    if (payment.status === 'REVERSED') {
      throw new Error(
        `PAYMENT_ALREADY_REVERSED: Supplier payment "${paymentId}" has already been reversed.`
      );
    }

    if (payment.status !== 'POSTED') {
      throw new Error(
        `INVALID_PAYMENT_STATUS: Cannot reverse supplier payment "${paymentId}". Only POSTED payments can be reversed (current status: "${payment.status}").`
      );
    }

    if (!payment.journalId) {
      throw new Error(`MISSING_PAYMENT_JOURNAL: Posted supplier payment "${paymentId}" has no linked accounting journal.`);
    }

    // 7. Resolve Canonical Supplier Identity
    const rawSupplierId = (payment.supplierId || '').trim();
    if (!rawSupplierId) {
      throw new Error(`INVALID_SUPPLIER_ID: Payment "${paymentId}" does not have a valid supplierId.`);
    }
    const canonicalSupplierId =
      (await PartyLedgerService.resolveCanonicalSupplierId(rawSupplierId)) || rawSupplierId;

    // 8. Validate Accounting Period for Today (Reversal Date)
    const today = new Date().toISOString().slice(0, 10);
    await validatePeriodIsOpen(today);

    // 9. Analyze affected allocations and purchase invoices
    const allocations = Array.isArray(payment.allocations) ? payment.allocations : [];
    const allocationsByInvoice = new Map<string, number>();
    for (const alloc of allocations) {
      if (alloc.invoiceId && alloc.allocatedAmountPaise > 0) {
        const cur = allocationsByInvoice.get(alloc.invoiceId) || 0;
        allocationsByInvoice.set(alloc.invoiceId, cur + alloc.allocatedAmountPaise);
      }
    }

    // Verify all affected purchase invoices exist and belong to the same canonical supplier
    const targetInvoices: {
      invRef: any;
      invDoc: PurchaseInvoice;
      allocatedFromPaymentPaise: number;
    }[] = [];

    for (const [invId, allocatedPaise] of allocationsByInvoice.entries()) {
      const invRef = doc(db, 'purchaseInvoices', invId);
      const invSnap = await getDoc(invRef);
      if (!invSnap.exists()) {
        throw new Error(`INVOICE_NOT_FOUND: Purchase invoice "${invId}" linked to payment allocation not found.`);
      }
      const invDoc = invSnap.data() as PurchaseInvoice;
      const invCanonicalSupplierId =
        (await PartyLedgerService.resolveCanonicalSupplierId(invDoc.supplierId || '')) || (invDoc.supplierId || '').trim();

      if (invCanonicalSupplierId !== canonicalSupplierId) {
        throw new Error(
          `CROSS_SUPPLIER_INVOICE_MISMATCH: Purchase invoice "${invDoc.invoiceNumber}" belongs to supplier "${invDoc.supplierId}", which does not match payment supplier "${payment.supplierId}".`
        );
      }

      targetInvoices.push({
        invRef,
        invDoc,
        allocatedFromPaymentPaise: allocatedPaise,
      });
    }

    // 10. Create Reversal Journal via JournalEngine
    const adminUserObj: AdminUser = {
      uid: adminSession.uid,
      email: adminSession.email || 'admin@mrfutkar.in',
      name: adminSession.name || 'Authoritative Admin',
      mobile: adminSession.mobile || '+919999999999',
      role: (adminSession.role as any) || 'SUPER_ADMIN',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'SYSTEM',
    };

    let reversalJournal: JournalEntry;
    const existingReversalQuery = query(
      collection(db, 'journalEntries'),
      where('reversalOfJournalId', '==', payment.journalId)
    );
    const revSnap = await getDocs(existingReversalQuery);
    if (!revSnap.empty) {
      reversalJournal = revSnap.docs[0].data() as JournalEntry;
      if (!reversalJournal.supplierId || reversalJournal.referenceType !== 'SUPPLIER_PAYMENT') {
        reversalJournal.supplierId = canonicalSupplierId;
        reversalJournal.referenceType = 'SUPPLIER_PAYMENT';
        reversalJournal.referenceId = payment.paymentId;
      }
    } else {
      const revRes = await JournalEngine.reverseJournal(adminUserObj, payment.journalId, req, {
        referenceType: 'SUPPLIER_PAYMENT',
        referenceId: payment.paymentId,
        supplierId: canonicalSupplierId,
      });
      reversalJournal = revRes.reversalJournal;
    }

    // 11. Atomic Firestore Transaction for Payment and Invoices
    const now = new Date().toISOString();
    let updatedPaymentResult: SupplierPayment | null = null;

    await runTransaction(db, async (txn) => {
      // Re-read payment doc inside txn
      const txnPaymentSnap = await txn.get(paymentRef);
      if (!txnPaymentSnap.exists()) {
        throw new Error(`PAYMENT_NOT_FOUND: Supplier payment "${paymentId}" not found in transaction.`);
      }
      const txnPayment = txnPaymentSnap.data() as SupplierPayment;

      if (txnPayment.status === 'REVERSED') {
        throw new Error(`PAYMENT_ALREADY_REVERSED: Supplier payment "${paymentId}" has already been reversed.`);
      }
      if (txnPayment.status !== 'POSTED') {
        throw new Error(`INVALID_PAYMENT_STATUS: Payment status changed to "${txnPayment.status}". Reversal aborted.`);
      }

      // 1. First Phase: Read all affected invoices (All reads before all writes)
      const invoiceUpdates: {
        invRef: any;
        updateData: any;
      }[] = [];

      for (const item of targetInvoices) {
        const txnInvSnap = await txn.get(item.invRef);
        if (!txnInvSnap.exists()) {
          throw new Error(`INVOICE_NOT_FOUND: Purchase invoice "${item.invDoc.invoiceId}" not found in transaction.`);
        }
        const currentInv = txnInvSnap.data() as PurchaseInvoice;

        const currentPaidPaise = currentInv.paidAmountPaise || 0;
        const restoredPaidPaise = Math.max(0, currentPaidPaise - item.allocatedFromPaymentPaise);
        const grandTotalPaise = Math.round((currentInv.grandTotal || 0) * 100);

        const currentOutstandingPaise =
          currentInv.outstandingAmountPaise !== undefined
            ? currentInv.outstandingAmountPaise
            : Math.max(0, grandTotalPaise - currentPaidPaise);
        const restoredOutstandingPaise = Math.max(0, currentOutstandingPaise + item.allocatedFromPaymentPaise);

        const restoredPaymentStatus: InvoicePaymentStatus =
          restoredOutstandingPaise === 0
            ? 'PAID'
            : restoredPaidPaise > 0
            ? 'PARTIALLY_PAID'
            : 'UNPAID';

        // Separate active vs reversed allocations for audit history
        const existingInvAllocations = Array.isArray(currentInv.allocations) ? currentInv.allocations : [];
        const remainingActiveAllocations = existingInvAllocations.filter((a) => a.paymentId !== paymentId);
        const reversedAllocationsList = [
          ...((currentInv as any).reversedAllocations || []),
          ...existingInvAllocations
            .filter((a) => a.paymentId === paymentId)
            .map((a) => ({
              ...a,
              reversedAt: now,
              reversalReason: reason || null,
              reversalJournalId: reversalJournal.journalId,
            })),
        ];

        invoiceUpdates.push({
          invRef: item.invRef,
          updateData: cleanDocData({
            paymentStatus: restoredPaymentStatus,
            paidAmountPaise: restoredPaidPaise,
            outstandingAmountPaise: restoredOutstandingPaise,
            allocations: remainingActiveAllocations,
            reversedAllocations: reversedAllocationsList,
            updatedAt: now,
            _serverTxnToken: SERVER_TXN_TOKEN,
          }),
        });
      }

      // 2. Second Phase: Execute all writes
      for (const invUp of invoiceUpdates) {
        txn.update(invUp.invRef, invUp.updateData);
      }

      // Update payment doc to REVERSED
      const updatedPaymentDoc = {
        ...txnPayment,
        status: 'REVERSED' as SupplierPaymentStatus,
        accountingStatus: 'REVERSED' as SupplierPaymentAccountingStatus,
        reversedAt: now,
        reversedBy: adminSession.uid,
        reversalJournalId: reversalJournal.journalId,
        reversalReason: reason || null,
        version: (txnPayment.version || 1) + 1,
        updatedAt: now,
        _serverTxnToken: SERVER_TXN_TOKEN,
      };

      txn.update(paymentRef, cleanDocData(updatedPaymentDoc));
      updatedPaymentResult = updatedPaymentDoc as SupplierPayment;

      // Store persistent idempotency record
      if (idempotencyKey) {
        const idempRef = doc(db, 'idempotencyKeys', `supp_pay_rev_${idempotencyKey}`);
        txn.set(idempRef, {
          key: idempotencyKey,
          targetType: 'SUPPLIER_PAYMENT_REVERSAL',
          paymentId,
          status: 'REVERSED',
          reversalJournalId: reversalJournal.journalId,
          reversedAt: now,
          reversedBy: adminSession.uid,
          _serverTxnToken: SERVER_TXN_TOKEN,
        });
      }
    });

    // 12. Audit Log Event (Requirement 21)
    await logAdminAudit({
      action: 'SUPPLIER_PAYMENT_REVERSED' as any,
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'SUPPLIER_PAYMENT',
      targetId: paymentId,
      metadata: {
        paymentId,
        paymentNumber: payment.paymentNumber,
        supplierId: canonicalSupplierId,
        originalJournalId: payment.journalId,
        reversalJournalId: reversalJournal.journalId,
        reversalReason: reason || null,
        reversedAt: now,
        allocatedAmountPaise: payment.allocatedAmountPaise || 0,
        allocationsCount: allocations.length,
      },
      req,
    });

    const { _serverTxnToken, ...safePayment } = (updatedPaymentResult || payment) as any;
    const { _serverTxnToken: _tj, ...safeReversalJournal } = reversalJournal as any;

    return {
      success: true,
      payment: safePayment as SupplierPayment,
      reversalJournal: safeReversalJournal,
      isIdempotentReplay: false,
    };
  }
}
