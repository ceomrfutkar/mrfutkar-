/**
 * MR FUTKAR — Customer Receipt Foundation Service (Phase 5.7 Part 2A)
 * Represents server-authoritative double-entry money receipt foundation.
 * STRICTLY integer paise accounting. Reuses canonical architecture.
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
  CustomerReceipt,
  CustomerReceiptPaymentMethod,
  CustomerReceiptCustomerSnapshot,
  CustomerReceiptCashAccountInfo,
  CustomerReceiptAllocation,
  CustomerReceiptAllocationInput,
  CustomerReceiptAllocationStatus,
  CreateCustomerReceiptPayload,
  PostCustomerReceiptPayload,
  PostCustomerReceiptResponse,
  AllocateCustomerReceiptPayload,
  AllocateCustomerReceiptResponse,
  ReverseCustomerReceiptPayload,
  ReverseCustomerReceiptResponse,
  EligibleInvoiceForAllocation,
  CustomerReceiptListFilters,
  CustomerReceiptListResponse,
  CustomerReceiptReconciliationFilters,
  CustomerReceiptReconciliationResult,
  ALLOWED_PAYMENT_METHODS,
} from '../src/types/customerReceipt';
import { SalesInvoice, InvoicePaymentStatus } from '../src/types/invoice';
import { CreditDebitNote } from '../src/types/creditDebitNote';
import { PartyLedgerService } from './partyLedgerService';
import { getNextJournalNumber } from './accountingSequenceService';
import { validatePeriodIsOpen } from './accountingPeriodService';
import { JournalEngine } from './journalEngine';
import {
  CustomerReceiptReconciliationService,
  CustomerReceiptReconciliationOptions,
} from './customerReceiptReconciliationService';

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

export class CustomerReceiptService {
  /**
   * Helper: Resolve Authoritative Account from Chart of Accounts
   * Validates account exists, is active, is ASSET, and is not AR, AP, Revenue, COGS, GST, Inventory.
   */
  private static async getAuthoritativeCashBankAccount(code: string): Promise<Account> {
    const cleanCode = code.trim();

    // 1. Direct document lookup by ID
    let accDoc = await getDoc(doc(db, 'chartOfAccounts', `acc_${cleanCode}`));
    let accData: Account | null = accDoc.exists() ? (accDoc.data() as Account) : null;

    if (!accData) {
      // Secondary query by accountCode field
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
      throw new Error(`PROHIBITED_CASH_ACCOUNT: Accounts Receivable (1300) cannot be used as a cash/bank receiving account.`);
    }
    if (cleanCode === '2100' || accData.accountType === 'LIABILITY' || accData.accountName.toLowerCase().includes('accounts payable')) {
      throw new Error(`PROHIBITED_CASH_ACCOUNT: Accounts Payable (2100) or liability accounts cannot be used as a cash/bank receiving account.`);
    }
    if (cleanCode === '4100' || cleanCode === '4200' || accData.accountType === 'INCOME') {
      throw new Error(`PROHIBITED_CASH_ACCOUNT: Revenue accounts (4100 / Income) cannot be used as a cash/bank receiving account.`);
    }
    if (cleanCode === '5100' || accData.accountType === 'EXPENSE') {
      throw new Error(`PROHIBITED_CASH_ACCOUNT: Cost of Goods Sold (5100) or expense accounts cannot be used as a cash/bank receiving account.`);
    }
    if (cleanCode === '2200' || cleanCode === '2300' || accData.accountName.toLowerCase().includes('gst')) {
      throw new Error(`PROHIBITED_CASH_ACCOUNT: GST accounts (2200 / 2300) cannot be used as a cash/bank receiving account.`);
    }
    if (cleanCode === '1400' || accData.accountName.toLowerCase().includes('inventory')) {
      throw new Error(`PROHIBITED_CASH_ACCOUNT: Inventory asset account (1400) cannot be used as a cash/bank receiving account.`);
    }
    if (accData.accountType !== 'ASSET') {
      throw new Error(`INVALID_CASH_BANK_ACCOUNT: Account "${cleanCode}" is ${accData.accountType}. Cash/Bank receiving accounts must be ASSET accounts.`);
    }

    return accData;
  }

  /**
   * Helper: Resolve Authoritative Accounts Receivable (1300) from Chart of Accounts
   */
  private static async getAuthoritativeArAccount(): Promise<Account> {
    let accDoc = await getDoc(doc(db, 'chartOfAccounts', 'acc_1300'));
    let accData: Account | null = accDoc.exists() ? (accDoc.data() as Account) : null;

    if (!accData) {
      const q = query(
        collection(db, 'chartOfAccounts'),
        where('accountCode', '==', '1300')
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        accData = snap.docs[0].data() as Account;
      }
    }

    if (!accData) {
      throw new Error('ACCOUNT_NOT_FOUND: Accounts Receivable (1300) not found in Chart of Accounts.');
    }

    if (accData.isActive === false) {
      throw new Error('INACTIVE_ACCOUNT: Accounts Receivable (1300) is currently deactivated.');
    }

    if (accData.accountType !== 'ASSET') {
      throw new Error(`ACCOUNT_TYPE_MISMATCH: Accounts Receivable (1300) must be an ASSET account. Found: ${accData.accountType}`);
    }

    return accData;
  }

  /**
   * Helper: Resolves today's date in Asia/Kolkata timezone
   */
  public static getKolkataTodayDate(): string {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
    return formatter.format(new Date());
  }

  /**
   * Create a new Customer Receipt (DRAFT)
   */
  public static async createCustomerReceipt(
    adminSession: AdminSession,
    payload: CreateCustomerReceiptPayload
  ): Promise<{ receipt: CustomerReceipt; isIdempotentReplay?: boolean }> {
    const rawPayload = payload as any;

    // 1. Strict Client Injection Guards (RCF-15, RCF-16, RCF-17, RCF-18)
    if (
      rawPayload.createdBy !== undefined ||
      rawPayload.receiptId !== undefined ||
      rawPayload.receiptNumber !== undefined ||
      rawPayload.journalId !== undefined ||
      rawPayload.voucherNumber !== undefined ||
      rawPayload.status !== undefined ||
      rawPayload.accountingStatus !== undefined ||
      rawPayload.postedAt !== undefined ||
      rawPayload.reversedAt !== undefined ||
      rawPayload.reversalJournalId !== undefined ||
      rawPayload.allocations !== undefined ||
      rawPayload.unallocatedAmountPaise !== undefined ||
      rawPayload.version !== undefined ||
      rawPayload.customerSnapshot !== undefined ||
      rawPayload.cashBankAccountInfo !== undefined ||
      rawPayload._serverTxnToken !== undefined
    ) {
      throw new Error(
        'CLIENT_FIELD_INJECTION_FORBIDDEN: Client cannot inject server-authoritative fields (createdBy, receiptId, receiptNumber, journalId, voucherNumber, status, accountingStatus, postedAt, reversedAt, reversalJournalId, allocations, unallocatedAmountPaise, version, customerSnapshot, cashBankAccountInfo).'
      );
    }

    // 2. Validate Customer ID & Canonical Identity Resolution (Section 6, RCF-02, RCF-03)
    if (!payload.customerId || typeof payload.customerId !== 'string' || !payload.customerId.trim()) {
      throw new Error('INVALID_CUSTOMER_ID: customerId is required.');
    }
    const rawCustomerId = payload.customerId.trim();

    // Canonical retailer resolution: Firebase Auth UID or retailerId -> canonical retailerId
    const canonicalRetailerId = (await PartyLedgerService.resolveCanonicalRetailerId(rawCustomerId)) || rawCustomerId;

    // Verify retailer exists in authoritative master
    const retailerRef = doc(db, 'retailers', canonicalRetailerId);
    const retailerSnap = await getDoc(retailerRef);

    if (!retailerSnap.exists()) {
      // Check query by retailerId field if doc ID differs
      const qRet = query(collection(db, 'retailers'), where('retailerId', '==', canonicalRetailerId));
      const snapRet = await getDocs(qRet);
      if (snapRet.empty) {
        throw new Error(`CUSTOMER_NOT_FOUND: Retailer "${rawCustomerId}" not found in customer master.`);
      }
    }

    const retailerData = retailerSnap.exists()
      ? retailerSnap.data()
      : (await getDocs(query(collection(db, 'retailers'), where('retailerId', '==', canonicalRetailerId)))).docs[0]?.data() || {};

    const rawStatus = (retailerData.status || '').toUpperCase();
    const isCustomerActive = retailerData.isActive !== false && rawStatus !== 'INACTIVE' && rawStatus !== 'DEACTIVATED';

    // 3. Create Server-Authoritative Customer Snapshot (Section 7, RCF-13, RCF-14)
    const customerSnapshot: CustomerReceiptCustomerSnapshot = {
      retailerId: canonicalRetailerId,
      businessName: (retailerData.shopName || retailerData.businessName || retailerData.ownerName || 'Kirana Store').trim(),
      ownerName: (retailerData.ownerName || retailerData.contactName || 'Kirana Owner').trim(),
      mobile: (retailerData.mobileNumber || retailerData.phone || retailerData.mobile || '').trim(),
      billingAddress: (retailerData.shopAddress || retailerData.address || retailerData.fullAddress || 'Delhi').trim(),
      city: (retailerData.city || 'Delhi').trim(),
      state: (retailerData.state || 'Delhi').trim(),
      pincode: String(retailerData.pincode || '110053').trim(),
      gstin: retailerData.gstNumber || retailerData.gstin || undefined,
      isActive: isCustomerActive,
    };

    // 4. Validate Amount in Integer Paise (Section 10, RCF-04, RCF-05, RCF-06)
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

    // 5. Validate Payment Method (Section 8, RCF-07)
    const method = payload.paymentMethod;
    if (!method || !ALLOWED_PAYMENT_METHODS.includes(method as CustomerReceiptPaymentMethod)) {
      throw new Error(`INVALID_PAYMENT_METHOD: paymentMethod must be one of ${ALLOWED_PAYMENT_METHODS.join(', ')}.`);
    }
    const paymentMethod: CustomerReceiptPaymentMethod = method;

    // 6. Validate & Resolve Cash/Bank Account (Section 9, RCF-08, RCF-09, RCF-10, RCF-11, RCF-12)
    let accountCode = typeof payload.cashBankAccountCode === 'string' ? payload.cashBankAccountCode.trim() : '';
    if (!accountCode) {
      // Default account resolution based on payment method
      if (paymentMethod === 'CASH') {
        accountCode = '1100'; // Cash in hand
      } else {
        accountCode = '1200'; // Bank account (for BANK_TRANSFER, UPI, CHEQUE, OTHER)
      }
    }

    const authoritativeAccount = await this.getAuthoritativeCashBankAccount(accountCode);
    const cashBankAccountInfo: CustomerReceiptCashAccountInfo = {
      accountCode: authoritativeAccount.accountCode,
      accountName: authoritativeAccount.accountName,
      accountType: authoritativeAccount.accountType,
    };

    // 7. Validate Date and Accounting Period (Section 11, RCF-27)
    let receiptDate = typeof payload.receiptDate === 'string' ? payload.receiptDate.trim() : '';
    if (!receiptDate) {
      receiptDate = this.getKolkataTodayDate();
    } else {
      if (!isValidDateFormat(receiptDate)) {
        throw new Error('INVALID_DATE_FORMAT: receiptDate must be in valid YYYY-MM-DD format.');
      }
    }

    // Verify accounting period is open for receiptDate
    await validatePeriodIsOpen(receiptDate);

    // 8. Validate Reference Number (Section 12)
    let referenceNumber: string | null = null;
    if (payload.referenceNumber !== undefined && payload.referenceNumber !== null) {
      const refStr = String(payload.referenceNumber).trim();
      if (refStr.length > 100) {
        throw new Error('REFERENCE_NUMBER_TOO_LONG: referenceNumber cannot exceed 100 characters.');
      }
      referenceNumber = refStr || null;
    }

    // 9. Validate Notes (Section 13)
    let notes: string | null = null;
    if (payload.notes !== undefined && payload.notes !== null) {
      const noteStr = String(payload.notes).trim();
      if (noteStr.length > 500) {
        throw new Error('NOTES_TOO_LONG: notes cannot exceed 500 characters.');
      }
      notes = noteStr || null;
    }

    // 10. Idempotency Foundation (Section 14, RCF-29, RCF-30)
    const idempotencyKey = typeof payload.idempotencyKey === 'string' ? payload.idempotencyKey.trim() : null;
    if (idempotencyKey) {
      if (idempotencyKey.length < 5) {
        throw new Error('INVALID_IDEMPOTENCY_KEY: idempotencyKey must be at least 5 characters.');
      }

      // Check existing in idempotencyKeys collection
      const idempDocRef = doc(db, 'idempotencyKeys', `receipt_${idempotencyKey}`);
      const idempSnap = await getDoc(idempDocRef);

      if (idempSnap.exists()) {
        const idempData = idempSnap.data();

        // Check for conflicting reuse
        if (
          idempData.customerId !== canonicalRetailerId ||
          idempData.amountPaise !== amountPaise ||
          (idempData.paymentMethod && idempData.paymentMethod !== paymentMethod)
        ) {
          throw new Error(
            `IDEMPOTENCY_CONFLICT: Idempotency key "${idempotencyKey}" was previously used with conflicting parameters.`
          );
        }

        // Return existing receipt
        const existingReceiptRef = doc(db, 'customerReceipts', idempData.receiptId);
        const existingReceiptSnap = await getDoc(existingReceiptRef);
        if (existingReceiptSnap.exists()) {
          const existingData = existingReceiptSnap.data() as CustomerReceipt;
          const { _serverTxnToken, ...safeReceipt } = existingData as any;
          return { receipt: safeReceipt as CustomerReceipt, isIdempotentReplay: true };
        }
      }

      // Secondary check: query customerReceipts by idempotencyKey
      const qIdemp = query(
        collection(db, 'customerReceipts'),
        where('_serverTxnToken', '==', SERVER_TXN_TOKEN),
        where('idempotencyKey', '==', idempotencyKey)
      );
      const snapIdemp = await getDocs(qIdemp);
      if (!snapIdemp.empty) {
        const existingReceipt = snapIdemp.docs[0].data() as CustomerReceipt;

        if (
          existingReceipt.customerId !== canonicalRetailerId ||
          existingReceipt.amountPaise !== amountPaise
        ) {
          throw new Error(
            `IDEMPOTENCY_CONFLICT: Idempotency key "${idempotencyKey}" was previously used with conflicting parameters.`
          );
        }

        const { _serverTxnToken, ...safeReceipt } = existingReceipt as any;
        return { receipt: safeReceipt as CustomerReceipt, isIdempotentReplay: true };
      }
    }

    // 10b. COD & Source Order Deduplication: Ensure exactly ONE canonical Customer Receipt per order / COD collection
    if (payload.sourceOrderId) {
      const cleanOrderId = String(payload.sourceOrderId).trim();
      const qOrder = query(
        collection(db, 'customerReceipts'),
        where('_serverTxnToken', '==', SERVER_TXN_TOKEN),
        where('sourceOrderId', '==', cleanOrderId)
      );
      const snapOrder = await getDocs(qOrder);
      if (!snapOrder.empty) {
        const existingReceipt = snapOrder.docs[0].data() as CustomerReceipt;
        const { _serverTxnToken, ...safeReceipt } = existingReceipt as any;
        return { receipt: safeReceipt as CustomerReceipt, isIdempotentReplay: true };
      }

      // Check if order has a COD collection with linked customerReceiptId
      try {
        const colSnap = await getDoc(doc(db, 'codCollections', `COL-${cleanOrderId}`));
        if (colSnap.exists()) {
          const colData = colSnap.data();
          if (colData.customerReceiptId) {
            const rSnap = await getDoc(doc(db, 'customerReceipts', colData.customerReceiptId));
            if (rSnap.exists()) {
              const { _serverTxnToken, ...safeReceipt } = rSnap.data() as any;
              return { receipt: safeReceipt as CustomerReceipt, isIdempotentReplay: true };
            }
          }
        }
      } catch {
        // ignore
      }
    }

    if (payload.codCollectionId) {
      const cleanColId = String(payload.codCollectionId).trim();
      const qCol = query(
        collection(db, 'customerReceipts'),
        where('_serverTxnToken', '==', SERVER_TXN_TOKEN),
        where('codCollectionId', '==', cleanColId)
      );
      const snapCol = await getDocs(qCol);
      if (!snapCol.empty) {
        const existingReceipt = snapCol.docs[0].data() as CustomerReceipt;
        const { _serverTxnToken, ...safeReceipt } = existingReceipt as any;
        return { receipt: safeReceipt as CustomerReceipt, isIdempotentReplay: true };
      }
    }

    // 11. Generate Server-Authoritative Receipt Number & ID (Section 3 & 5)
    // Uses existing accounting sequence mechanism for RV (RV-YYYY-XXXXX)
    const receiptNumber = await getNextJournalNumber('RECEIPT');
    const receiptId = `cr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    // 12. Assemble Customer Receipt Document
    const receiptDoc: CustomerReceipt & { _serverTxnToken: string } = {
      receiptId,
      receiptNumber,
      customerId: canonicalRetailerId,
      customerSnapshot,
      receiptDate,
      amountPaise,
      paymentMethod,
      cashBankAccountCode: authoritativeAccount.accountCode,
      cashBankAccountInfo,
      referenceNumber,
      notes,
      sourceOrderId: payload.sourceOrderId ? String(payload.sourceOrderId).trim() : null,
      codCollectionId: payload.codCollectionId ? String(payload.codCollectionId).trim() : null,
      allocations: [],
      allocatedAmountPaise: 0,
      unallocatedAmountPaise: amountPaise,
      allocationStatus: 'UNALLOCATED',
      status: 'DRAFT',
      journalId: null,
      voucherNumber: null,
      createdBy: adminSession.uid,
      createdAt: now,
      postedAt: null,
      reversedAt: null,
      reversalJournalId: null,
      idempotencyKey,
      version: 1,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    // Save to customerReceipts collection
    await setDoc(doc(db, 'customerReceipts', receiptId), cleanDocData(receiptDoc));

    // Store idempotency record if key was provided
    if (idempotencyKey) {
      await setDoc(doc(db, 'idempotencyKeys', `receipt_${idempotencyKey}`), {
        key: idempotencyKey,
        targetType: 'CUSTOMER_RECEIPT',
        receiptId,
        customerId: canonicalRetailerId,
        amountPaise,
        paymentMethod,
        receiptNumber,
        createdAt: now,
        _serverTxnToken: SERVER_TXN_TOKEN,
      });
    }

    // 13. Audit Log Event (Section 21)
    await logAdminAudit({
      action: 'CUSTOMER_RECEIPT_CREATED',
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'CUSTOMER_RECEIPT',
      targetId: receiptId,
      metadata: {
        receiptId,
        receiptNumber,
        customerId: canonicalRetailerId,
        amountPaise,
        paymentMethod,
        cashBankAccountCode: authoritativeAccount.accountCode,
        status: 'DRAFT',
        receiptDate,
      },
    });

    const { _serverTxnToken, ...safeReceipt } = receiptDoc as any;
    return { receipt: safeReceipt as CustomerReceipt, isIdempotentReplay: false };
  }

  /**
   * Retrieve Customer Receipt by ID (Section 23)
   */
  public static async getCustomerReceipt(receiptId: string): Promise<CustomerReceipt> {
    if (!receiptId || typeof receiptId !== 'string' || !receiptId.trim()) {
      throw new Error('INVALID_RECEIPT_ID: receiptId is required.');
    }
    const cleanId = receiptId.trim();

    const receiptRef = doc(db, 'customerReceipts', cleanId);
    let snap;
    try {
      snap = await getDoc(receiptRef);
    } catch (err: any) {
      if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
        throw new Error(`RECEIPT_NOT_FOUND: Customer receipt "${cleanId}" not found.`);
      }
      throw err;
    }

    if (!snap.exists()) {
      throw new Error(`RECEIPT_NOT_FOUND: Customer receipt "${cleanId}" not found.`);
    }

    const data = snap.data() as CustomerReceipt;
    const { _serverTxnToken, ...safeReceipt } = data as any;
    return safeReceipt as CustomerReceipt;
  }

  /**
   * List Customer Receipts with server-side filtering & pagination (Section 22, RCF-22, RCF-23, RCF-24, RCF-25, RCF-26, RCF-27, RCF-28)
   */
  public static async listCustomerReceipts(
    filters: CustomerReceiptListFilters
  ): Promise<CustomerReceiptListResponse> {
    // 1. Pagination Validation (RCF-22, RCF-23)
    const rawPageSize = filters.pageSize !== undefined ? Number(filters.pageSize) : 50;
    if (Number.isFinite(rawPageSize) && rawPageSize > 100) {
      throw new Error('PAGE_SIZE_EXCEEDED: Page size cannot exceed 100.');
    }
    const pageSize = Math.max(1, Math.min(100, Number.isFinite(rawPageSize) ? Math.floor(rawPageSize) : 50));
    const rawPage = filters.page !== undefined ? Number(filters.page) : 1;
    const page = Math.max(1, Number.isFinite(rawPage) ? Math.floor(rawPage) : 1);

    // 2. Date Filter Validation
    const fromDate = typeof filters.fromDate === 'string' && filters.fromDate.trim() ? filters.fromDate.trim() : undefined;
    const toDate = typeof filters.toDate === 'string' && filters.toDate.trim() ? filters.toDate.trim() : undefined;

    if (fromDate && !isValidDateFormat(fromDate)) {
      throw new Error('INVALID_DATE_FORMAT: fromDate must be valid YYYY-MM-DD format.');
    }
    if (toDate && !isValidDateFormat(toDate)) {
      throw new Error('INVALID_DATE_FORMAT: toDate must be valid YYYY-MM-DD format.');
    }
    if (fromDate && toDate && fromDate > toDate) {
      throw new Error('INVALID_DATE_RANGE: fromDate cannot be after toDate.');
    }

    // 3. Resolve Customer ID if provided
    let targetCustomerId: string | undefined = undefined;
    if (typeof filters.customerId === 'string' && filters.customerId.trim()) {
      const rawCustomer = filters.customerId.trim();
      targetCustomerId = (await PartyLedgerService.resolveCanonicalRetailerId(rawCustomer)) || rawCustomer;
    }

    // 4. Fetch Receipts (using authoritative server token query)
    const receiptsRef = collection(db, 'customerReceipts');
    const qReceipts = query(receiptsRef, where('_serverTxnToken', '==', SERVER_TXN_TOKEN));
    const snap = await getDocs(qReceipts);

    let allReceipts: CustomerReceipt[] = [];
    snap.forEach((d) => {
      const data = d.data() as CustomerReceipt;
      const { _serverTxnToken, ...safeReceipt } = data as any;
      allReceipts.push(safeReceipt as CustomerReceipt);
    });

    // 5. Apply In-Memory Filters
    if (targetCustomerId) {
      allReceipts = allReceipts.filter((r) => r.customerId === targetCustomerId);
    }

    if (filters.paymentMethod) {
      const pm = filters.paymentMethod;
      allReceipts = allReceipts.filter((r) => r.paymentMethod === pm);
    }

    if (filters.status) {
      const st = filters.status;
      allReceipts = allReceipts.filter((r) => r.status === st);
    }

    if (fromDate) {
      allReceipts = allReceipts.filter((r) => r.receiptDate >= fromDate);
    }

    if (toDate) {
      allReceipts = allReceipts.filter((r) => r.receiptDate <= toDate);
    }

    if (filters.search && typeof filters.search === 'string') {
      const term = filters.search.trim().toLowerCase();
      if (term) {
        allReceipts = allReceipts.filter((r) => {
          const numMatch = (r.receiptNumber || '').toLowerCase().includes(term);
          const refMatch = (r.referenceNumber || '').toLowerCase().includes(term);
          const notesMatch = (r.notes || '').toLowerCase().includes(term);
          const custNameMatch = (r.customerSnapshot?.businessName || '').toLowerCase().includes(term);
          const custIdMatch = (r.customerId || '').toLowerCase().includes(term);
          return numMatch || refMatch || notesMatch || custNameMatch || custIdMatch;
        });
      }
    }

    // 6. Chronological Sort (descending by receiptDate and createdAt)
    allReceipts.sort((a, b) => {
      const dateCmp = b.receiptDate.localeCompare(a.receiptDate);
      if (dateCmp !== 0) return dateCmp;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    // 7. Paginate
    const totalCount = allReceipts.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const pagedReceipts = allReceipts.slice(startIndex, startIndex + pageSize);

    return {
      success: true,
      receipts: pagedReceipts,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
      },
    };
  }

  private static postReceiptLocks = new Map<
    string,
    Promise<{ receipt: CustomerReceipt; journal: JournalEntry; isIdempotentReplay?: boolean }>
  >();

  /**
   * Post Customer Receipt (Entrypoint with concurrency synchronization)
   * Phase 5.7 Part 2B: Customer Receipt Accounting Posting
   */
  public static async postCustomerReceipt(
    adminSession: AdminSession,
    receiptId: string,
    payload?: PostCustomerReceiptPayload,
    req?: any
  ): Promise<{ receipt: CustomerReceipt; journal: JournalEntry; isIdempotentReplay?: boolean }> {
    const cleanId = (receiptId || '').trim();
    if (!cleanId) {
      throw new Error('INVALID_RECEIPT_ID: receiptId is required.');
    }

    const existingLock = this.postReceiptLocks.get(cleanId);
    if (existingLock) {
      // Wait for the active posting process to resolve before proceeding
      await existingLock.catch(() => {});
    }

    const postPromise = this.executePostCustomerReceipt(adminSession, cleanId, payload, req);
    this.postReceiptLocks.set(cleanId, postPromise);

    try {
      return await postPromise;
    } finally {
      this.postReceiptLocks.delete(cleanId);
    }
  }

  /**
   * Authoritative Customer Receipt Accounting Posting Execution
   */
  private static async executePostCustomerReceipt(
    adminSession: AdminSession,
    receiptId: string,
    payload?: PostCustomerReceiptPayload,
    req?: any
  ): Promise<{ receipt: CustomerReceipt; journal: JournalEntry; isIdempotentReplay?: boolean }> {
    // 1. Authenticate & Require SUPER_ADMIN (Section 6, CRA-04, CRA-05)
    if (!adminSession || adminSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED: Only Super Admin users can post customer receipts to accounting.');
    }

    const rawPayload = (payload || {}) as any;

    // 2. Client Injection Defense (Section 5, CRA-28, CRA-29, CRA-30, CRA-31)
    const forbiddenKeys = [
      'debit',
      'credit',
      'journalId',
      'voucherNumber',
      'accountCode',
      'accountCodes',
      'cashBankAccountCode',
      'customerId',
      'amountPaise',
      'amount',
      'receiptNumber',
      'postedAt',
      'lines',
      'totalDebit',
      'totalCredit',
      'status',
      'accountingStatus',
      '_serverTxnToken',
    ];
    for (const key of forbiddenKeys) {
      if (rawPayload[key] !== undefined) {
        throw new Error(
          `CLIENT_FIELD_INJECTION_FORBIDDEN: Client cannot inject authoritative accounting parameters ("${key}"). All posting data is derived server-side from the authoritative receipt.`
        );
      }
    }

    // 3. Validate Idempotency Key if provided (Section 13, CRA-32, CRA-34)
    const idempotencyKey =
      typeof rawPayload.idempotencyKey === 'string' && rawPayload.idempotencyKey.trim()
        ? rawPayload.idempotencyKey.trim()
        : null;

    if (idempotencyKey) {
      if (idempotencyKey.length < 5) {
        throw new Error('INVALID_IDEMPOTENCY_KEY: idempotencyKey must be at least 5 characters.');
      }

      // Check persistent idempotency store
      const idempDocRef = doc(db, 'idempotencyKeys', `receipt_post_${idempotencyKey}`);
      const idempSnap = await getDoc(idempDocRef);

      if (idempSnap.exists()) {
        const idempData = idempSnap.data();

        // Check for conflicting reuse
        if (idempData.receiptId !== receiptId) {
          throw new Error(
            `IDEMPOTENCY_CONFLICT: Idempotency key "${idempotencyKey}" was previously used for receipt "${idempData.receiptId}".`
          );
        }

        // Return authoritative existing receipt and journal
        const receiptSnap = await getDoc(doc(db, 'customerReceipts', receiptId));
        if (receiptSnap.exists()) {
          const recData = receiptSnap.data() as CustomerReceipt;
          const { _serverTxnToken, ...safeReceipt } = recData as any;

          let journalData: any = null;
          if (recData.journalId) {
            const jSnap = await getDoc(doc(db, 'journalEntries', recData.journalId));
            if (jSnap.exists()) {
              const { _serverTxnToken: _j, ...safeJ } = jSnap.data() as any;
              journalData = safeJ;
            }
          }

          return {
            receipt: safeReceipt as CustomerReceipt,
            journal: journalData,
            isIdempotentReplay: true,
          };
        }
      }
    }

    // 4. Load Customer Receipt from Firestore (Section 6, CRA-01, CRA-02)
    const receiptRef = doc(db, 'customerReceipts', receiptId);
    let receiptSnap;
    try {
      receiptSnap = await getDoc(receiptRef);
    } catch (err: any) {
      if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
        throw new Error(`RECEIPT_NOT_FOUND: Customer receipt "${receiptId}" not found.`);
      }
      throw err;
    }

    if (!receiptSnap.exists()) {
      throw new Error(`RECEIPT_NOT_FOUND: Customer receipt "${receiptId}" not found.`);
    }

    const receipt = receiptSnap.data() as CustomerReceipt;

    // 5. Verify Receipt Status (Section 6, CRA-03, CRA-32)
    if (receipt.status !== 'DRAFT') {
      throw new Error(
        `INVALID_RECEIPT_STATUS: Cannot post customer receipt "${receiptId}". Only DRAFT receipts can be posted (current status: "${receipt.status}").`
      );
    }

    // 6. Verify Customer Identity (Section 6)
    if (!receipt.customerId || typeof receipt.customerId !== 'string' || !receipt.customerId.trim()) {
      throw new Error(`INVALID_CUSTOMER_ID: Receipt does not contain a valid customerId.`);
    }
    const rawCustomerId = receipt.customerId.trim();
    const canonicalRetailerId =
      (await PartyLedgerService.resolveCanonicalRetailerId(rawCustomerId)) || rawCustomerId;

    const retailerRef = doc(db, 'retailers', canonicalRetailerId);
    const retailerSnap = await getDoc(retailerRef);
    if (!retailerSnap.exists()) {
      const qRet = query(collection(db, 'retailers'), where('retailerId', '==', canonicalRetailerId));
      const snapRet = await getDocs(qRet);
      if (snapRet.empty) {
        throw new Error(`CUSTOMER_NOT_FOUND: Retailer "${rawCustomerId}" not found in customer master.`);
      }
    }

    // 7. Verify AmountPaise (Section 11, CRA-08, CRA-09)
    const amountPaise = receipt.amountPaise;
    if (
      typeof amountPaise !== 'number' ||
      !Number.isFinite(amountPaise) ||
      !Number.isInteger(amountPaise) ||
      amountPaise <= 0
    ) {
      throw new Error(`INVALID_AMOUNT: Receipt amountPaise must be a positive integer. Found: ${amountPaise}`);
    }
    const amountRupees = paiseToRupees(amountPaise);

    // 8. Verify Payment Method (Section 6)
    const paymentMethod = receipt.paymentMethod;
    if (!paymentMethod || !ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
      throw new Error(`INVALID_PAYMENT_METHOD: Receipt payment method "${paymentMethod}" is invalid.`);
    }

    // 9. Revalidate Cash/Bank Account against Chart of Accounts (Section 10, CRA-06, CRA-07, CRA-09)
    if (!receipt.cashBankAccountCode || typeof receipt.cashBankAccountCode !== 'string') {
      throw new Error(`MISSING_CASH_BANK_ACCOUNT: Receipt is missing cashBankAccountCode.`);
    }
    const authoritativeCashAccount = await this.getAuthoritativeCashBankAccount(receipt.cashBankAccountCode);

    // 10. Revalidate AR 1300 Account against Chart of Accounts (Section 2, CRA-08)
    const arAccount = await this.getAuthoritativeArAccount();

    // 11. Verify Receipt Date & Accounting Period (Section 12, CRA-23, CRA-24)
    if (!receipt.receiptDate || !isValidDateFormat(receipt.receiptDate)) {
      throw new Error(`INVALID_DATE_FORMAT: Receipt receiptDate "${receipt.receiptDate}" is invalid.`);
    }
    await validatePeriodIsOpen(receipt.receiptDate);

    // 12. Build Double-Entry Journal Lines (Section 2, 3, 16, CRA-08, CRA-09, CRA-10)
    // Cash/Bank Dr amount
    // AR 1300 Cr amount
    const journalLines: JournalLinePayload[] = [
      {
        accountId: authoritativeCashAccount.accountId,
        debit: amountRupees,
        credit: 0,
        description: `Customer Receipt ${receipt.receiptNumber} via ${paymentMethod} from ${receipt.customerSnapshot?.businessName || canonicalRetailerId}`,
        customerId: canonicalRetailerId,
      },
      {
        accountId: arAccount.accountId,
        debit: 0,
        credit: amountRupees,
        description: `Accounts Receivable credit for Receipt ${receipt.receiptNumber} from ${receipt.customerSnapshot?.businessName || canonicalRetailerId}`,
        customerId: canonicalRetailerId,
      },
    ];

    // 13. Create & Post Journal via JournalEngine (Section 7, 8, 9, CRA-20, CRA-21, CRA-22)
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

    // Check if an existing journal was already initiated for this receipt
    let journal: JournalEntry;
    const existingJournalQuery = query(
      collection(db, 'journalEntries'),
      where('referenceType', '==', 'CUSTOMER_RECEIPT'),
      where('referenceId', '==', receiptId)
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
          journalDate: receipt.receiptDate,
          voucherType: 'RECEIPT',
          referenceType: 'CUSTOMER_RECEIPT',
          referenceId: receiptId,
          narration: `Customer Receipt ${receipt.receiptNumber} from ${receipt.customerSnapshot?.businessName || canonicalRetailerId} via ${paymentMethod}`,
          lines: journalLines,
          customerId: canonicalRetailerId,
          paymentMethod: paymentMethod,
        },
        req
      );

      const postedRes = await JournalEngine.postJournal(adminUserObj, draftRes.journal.journalId, req);
      journal = postedRes.journal;
    }

    // 14. Update Receipt Document Atomically (Section 6, 8, 15, CRA-01, CRA-36)
    const now = new Date().toISOString();
    const postedReceipt: CustomerReceipt & { _serverTxnToken: string } = {
      ...receipt,
      status: 'POSTED',
      journalId: journal.journalId,
      voucherNumber: journal.journalNumber,
      postedAt: journal.postedAt || now,
      allocatedAmountPaise: receipt.allocatedAmountPaise ?? 0,
      unallocatedAmountPaise: receipt.unallocatedAmountPaise ?? amountPaise,
      allocationStatus: receipt.allocationStatus ?? 'UNALLOCATED',
      version: (receipt.version || 1) + 1,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    await setDoc(receiptRef, cleanDocData(postedReceipt));

    // 15. Store persistent idempotency record (Section 13, CRA-32, CRA-33)
    if (idempotencyKey) {
      await setDoc(doc(db, 'idempotencyKeys', `receipt_post_${idempotencyKey}`), {
        key: idempotencyKey,
        targetType: 'CUSTOMER_RECEIPT_POST',
        receiptId,
        status: 'POSTED',
        journalId: journal.journalId,
        voucherNumber: journal.journalNumber,
        postedAt: journal.postedAt || now,
        _serverTxnToken: SERVER_TXN_TOKEN,
      });
    }

    // 16. Audit Log (Section 18, CRA-47, CRA-48)
    await logAdminAudit({
      action: 'CUSTOMER_RECEIPT_POSTED' as any,
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'CUSTOMER_RECEIPT',
      targetId: receiptId,
      metadata: {
        receiptId,
        receiptNumber: receipt.receiptNumber,
        customerId: canonicalRetailerId,
        amountPaise,
        paymentMethod,
        cashBankAccountCode: authoritativeCashAccount.accountCode,
        journalId: journal.journalId,
        voucherNumber: journal.journalNumber,
        status: 'POSTED',
      },
      req,
    });

    const { _serverTxnToken, ...safeReceipt } = postedReceipt as any;
    const { _serverTxnToken: _j, ...safeJournal } = journal as any;

    return {
      receipt: safeReceipt as CustomerReceipt,
      journal: safeJournal,
      isIdempotentReplay: false,
    };
  }

  /**
   * Ensure POSTED receipt is immutable (Section 16, CRA-25)
   */
  public static async updateCustomerReceipt(
    adminSession: AdminSession,
    receiptId: string,
    updates: any
  ): Promise<CustomerReceipt> {
    const receiptRef = doc(db, 'customerReceipts', receiptId);
    let snap;
    try {
      snap = await getDoc(receiptRef);
    } catch (err: any) {
      if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
        throw new Error(`RECEIPT_NOT_FOUND: Customer receipt "${receiptId}" not found.`);
      }
      throw err;
    }
    if (!snap.exists()) {
      throw new Error(`RECEIPT_NOT_FOUND: Customer receipt "${receiptId}" not found.`);
    }
    const receipt = snap.data() as CustomerReceipt;

    if (receipt.status === 'POSTED') {
      throw new Error(`POSTED_RECEIPT_IMMUTABLE: Customer receipt "${receiptId}" is POSTED and strictly immutable.`);
    }

    throw new Error('RECEIPT_UPDATE_NOT_SUPPORTED: Receipt editing is not supported.');
  }

  /**
   * Ensure Customer receipt cannot be deleted (Section 16, CRA-25)
   */
  public static async deleteCustomerReceipt(
    adminSession: AdminSession,
    receiptId: string
  ): Promise<void> {
    const receiptRef = doc(db, 'customerReceipts', receiptId);
    let snap;
    try {
      snap = await getDoc(receiptRef);
    } catch (err: any) {
      if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
        throw new Error(`RECEIPT_NOT_FOUND: Customer receipt "${receiptId}" not found.`);
      }
      throw err;
    }
    if (!snap.exists()) {
      throw new Error(`RECEIPT_NOT_FOUND: Customer receipt "${receiptId}" not found.`);
    }
    const receipt = snap.data() as CustomerReceipt;

    if (receipt.status === 'POSTED') {
      throw new Error(`POSTED_RECEIPT_IMMUTABLE: Cannot delete POSTED customer receipt "${receiptId}".`);
    }

    throw new Error('DELETE_RECEIPT_FORBIDDEN: Customer receipts cannot be deleted.');
  }

  /**
   * Helper: Get Eligible Outstanding Sales Invoices for Receipt Customer
   * Strictly server-authoritative outstanding calculation derived from posted transactions.
   */
  public static async getEligibleInvoicesForReceipt(
    adminSession: AdminSession,
    receiptId: string
  ): Promise<EligibleInvoiceForAllocation[]> {
    if (!adminSession || adminSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED: Only Super Admin users can view eligible invoices for allocation.');
    }
    const cleanId = (receiptId || '').trim();
    if (!cleanId) {
      throw new Error('INVALID_RECEIPT_ID: receiptId is required.');
    }
    const receiptRef = doc(db, 'customerReceipts', cleanId);
    let receiptSnap;
    try {
      receiptSnap = await getDoc(receiptRef);
    } catch (err: any) {
      if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
        throw new Error(`RECEIPT_NOT_FOUND: Customer receipt "${cleanId}" not found.`);
      }
      throw err;
    }
    if (!receiptSnap.exists()) {
      throw new Error(`RECEIPT_NOT_FOUND: Customer receipt "${cleanId}" not found.`);
    }
    const receipt = receiptSnap.data() as CustomerReceipt;
    const rawCustomerId = receipt.customerId.trim();
    const canonicalCustomerId =
      (await PartyLedgerService.resolveCanonicalRetailerId(rawCustomerId)) || rawCustomerId;

    // Query salesInvoices for this customer
    const qInvoices = query(
      collection(db, 'salesInvoices'),
      where('customerId', '==', canonicalCustomerId)
    );
    const invSnap = await getDocs(qInvoices);

    // Query all posted credit/debit notes for this customer
    const qNotes = query(
      collection(db, 'creditDebitNotes'),
      where('customerId', '==', canonicalCustomerId)
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

    // Query all posted customer receipts for this customer to sum existing allocations
    const allocatedByInvoice = new Map<string, number>();
    try {
      const qReceipts = query(
        collection(db, 'customerReceipts'),
        where('customerId', '==', canonicalCustomerId)
      );
      const receiptsSnap = await getDocs(qReceipts);
      receiptsSnap.forEach((d) => {
        const rec = d.data() as CustomerReceipt;
        if (rec.status === 'POSTED' && Array.isArray(rec.allocations)) {
          for (const alloc of rec.allocations) {
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

    const eligibleList: EligibleInvoiceForAllocation[] = [];
    for (const d of invSnap.docs) {
      const inv = d.data() as SalesInvoice;
      if (inv.invoiceStatus !== 'ISSUED' || inv.accountingStatus !== 'POSTED') {
        continue;
      }
      const grandTotalPaise = Math.round((inv.grandTotal || 0) * 100);
      let adjustedTotalPaise = grandTotalPaise;

      // Apply credit/debit notes
      const notes = notesByInvoice.get(inv.invoiceId) || [];
      for (const note of notes) {
        const notePaise = Math.round((note.grandTotal || 0) * 100);
        if (note.noteType === 'SALES_CREDIT_NOTE') {
          adjustedTotalPaise -= notePaise;
        } else if (note.noteType === 'SALES_DEBIT_NOTE') {
          adjustedTotalPaise += notePaise;
        }
      }
      adjustedTotalPaise = Math.max(0, adjustedTotalPaise);

      // Apply already allocated receipts
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

  private static allocateReceiptLocks = new Map<
    string,
    Promise<AllocateCustomerReceiptResponse>
  >();

  /**
   * Allocate Customer Receipt against one or more eligible Sales Invoices
   * Concurrency-controlled with in-memory lock AND atomic Firestore runTransaction
   */
  public static async allocateCustomerReceipt(
    adminSession: AdminSession,
    receiptId: string,
    payload: AllocateCustomerReceiptPayload,
    req?: any
  ): Promise<AllocateCustomerReceiptResponse> {
    const cleanId = (receiptId || '').trim();
    if (!cleanId) {
      throw new Error('INVALID_RECEIPT_ID: receiptId is required.');
    }

    const existingLock = this.allocateReceiptLocks.get(cleanId);
    if (existingLock) {
      await existingLock.catch(() => {});
    }

    const allocatePromise = this.executeAllocateCustomerReceipt(adminSession, cleanId, payload, req);
    this.allocateReceiptLocks.set(cleanId, allocatePromise);

    try {
      return await allocatePromise;
    } finally {
      this.allocateReceiptLocks.delete(cleanId);
    }
  }

  /**
   * Internal authoritative execution of receipt allocation
   */
  private static async executeAllocateCustomerReceipt(
    adminSession: AdminSession,
    receiptId: string,
    payload: AllocateCustomerReceiptPayload,
    req?: any
  ): Promise<AllocateCustomerReceiptResponse> {
    // 1. Super Admin Authentication check
    if (!adminSession || adminSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED: Only Super Admin users can allocate customer receipts.');
    }

    const rawPayload = (payload || {}) as any;

    // 2. Client field injection defense
    const forbiddenKeys = [
      'customerId',
      'retailerId',
      'amountPaise',
      'amount',
      'receiptNumber',
      'receiptDate',
      'status',
      'unallocatedAmountPaise',
      'allocatedAmountPaise',
      'allocationStatus',
      'invoiceOutstanding',
      'outstandingAmountPaise',
      'arBalance',
      'grandTotal',
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

      const idempDocRef = doc(db, 'idempotencyKeys', `receipt_alloc_${idempotencyKey}`);
      const idempSnap = await getDoc(idempDocRef);

      if (idempSnap.exists()) {
        const idempData = idempSnap.data();
        if (idempData.receiptId !== receiptId) {
          throw new Error(
            `IDEMPOTENCY_CONFLICT: Idempotency key "${idempotencyKey}" was previously used for receipt "${idempData.receiptId}".`
          );
        }

        const receiptSnap = await getDoc(doc(db, 'customerReceipts', receiptId));
        if (receiptSnap.exists()) {
          const recData = receiptSnap.data() as CustomerReceipt;
          const { _serverTxnToken, ...safeReceipt } = recData as any;
          return {
            success: true,
            receipt: safeReceipt as CustomerReceipt,
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

      const amtPaise = item.amountPaise;
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

    // 5. Pre-transaction: Load receipt and verify state
    const receiptRef = doc(db, 'customerReceipts', receiptId);
    let receiptSnap;
    try {
      receiptSnap = await getDoc(receiptRef);
    } catch (err: any) {
      if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
        throw new Error(`RECEIPT_NOT_FOUND: Customer receipt "${receiptId}" not found.`);
      }
      throw err;
    }
    if (!receiptSnap.exists()) {
      throw new Error(`RECEIPT_NOT_FOUND: Customer receipt "${receiptId}" not found.`);
    }
    const receipt = receiptSnap.data() as CustomerReceipt;

    if (receipt.status !== 'POSTED') {
      throw new Error(
        `INVALID_RECEIPT_STATUS: Only POSTED customer receipts can be allocated to invoices (current status: "${receipt.status}").`
      );
    }

    const existingAllocations: CustomerReceiptAllocation[] = Array.isArray(receipt.allocations) ? receipt.allocations : [];
    const currentAllocatedPaise = existingAllocations.reduce((sum, a) => sum + (a.allocatedAmountPaise || 0), 0);
    const currentUnallocatedPaise = Math.max(0, receipt.amountPaise - currentAllocatedPaise);

    if (totalRequestedPaise > currentUnallocatedPaise) {
      throw new Error(
        `ALLOCATION_EXCEEDS_RECEIPT_AMOUNT: Requested allocation total of ₹${paiseToRupees(totalRequestedPaise)} exceeds receipt unallocated amount of ₹${paiseToRupees(currentUnallocatedPaise)}.`
      );
    }

    // Resolve canonical retailer ID
    const canonicalCustomerId =
      (await PartyLedgerService.resolveCanonicalRetailerId(receipt.customerId)) || receipt.customerId.trim();

    // 6. Pre-transaction: Verify invoices and calculate live balances
    const invoiceAllocationsMap = new Map<string, number>();
    try {
      const qAllReceipts = query(collection(db, 'customerReceipts'), where('customerId', '==', canonicalCustomerId));
      const allReceiptsSnap = await getDocs(qAllReceipts);
      allReceiptsSnap.forEach((d) => {
        const r = d.data() as CustomerReceipt;
        if (r.status === 'POSTED' && Array.isArray(r.allocations)) {
          for (const a of r.allocations) {
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

    const qNotes = query(collection(db, 'creditDebitNotes'), where('customerId', '==', canonicalCustomerId));
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
      invDoc: SalesInvoice;
      invRef: any;
      requestedPaise: number;
      initialGrandTotalPaise: number;
      adjustedTotalPaise: number;
      previouslyAllocatedPaise: number;
      outstandingBeforePaise: number;
      outstandingAfterPaise: number;
    }[] = [];

    for (const allocItem of requestedAllocations) {
      const invRef = doc(db, 'salesInvoices', allocItem.invoiceId);
      const invSnap = await getDoc(invRef);
      if (!invSnap.exists()) {
        throw new Error(`INVOICE_NOT_FOUND: Sales Invoice "${allocItem.invoiceId}" not found.`);
      }
      const inv = invSnap.data() as SalesInvoice;

      if (inv.invoiceStatus !== 'ISSUED') {
        throw new Error(
          `INVALID_INVOICE_STATUS: Cannot allocate against invoice "${inv.invoiceNumber}" with status "${inv.invoiceStatus}".`
        );
      }
      if (inv.accountingStatus !== 'POSTED') {
        throw new Error(
          `INVOICE_NOT_POSTED: Sales Invoice "${inv.invoiceNumber}" has not been posted to accounting.`
        );
      }

      const invCanonicalCustomerId =
        (await PartyLedgerService.resolveCanonicalRetailerId(inv.customerId)) || inv.customerId.trim();
      if (invCanonicalCustomerId !== canonicalCustomerId) {
        throw new Error(
          `CROSS_RETAILER_ALLOCATION_FORBIDDEN: Invoice "${inv.invoiceNumber}" belongs to retailer "${inv.customerId}", which does not match receipt customer "${receipt.customerId}".`
        );
      }

      const initialGrandTotalPaise = Math.round((inv.grandTotal || 0) * 100);
      let adjustedTotalPaise = initialGrandTotalPaise;

      const notes = notesByInvoice.get(inv.invoiceId) || [];
      for (const note of notes) {
        const notePaise = Math.round((note.grandTotal || 0) * 100);
        if (note.noteType === 'SALES_CREDIT_NOTE') {
          adjustedTotalPaise -= notePaise;
        } else if (note.noteType === 'SALES_DEBIT_NOTE') {
          adjustedTotalPaise += notePaise;
        }
      }
      adjustedTotalPaise = Math.max(0, adjustedTotalPaise);

      const previouslyAllocatedPaise = Math.max(
        invoiceAllocationsMap.get(inv.invoiceId) || 0,
        inv.paidAmountPaise || 0
      );
      const outstandingBeforePaise = Math.max(0, adjustedTotalPaise - previouslyAllocatedPaise);

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
    let updatedReceiptResult: CustomerReceipt | null = null;

    await runTransaction(db, async (txn) => {
      // Re-read receipt doc inside txn
      const txnReceiptSnap = await txn.get(receiptRef);
      if (!txnReceiptSnap.exists()) {
        throw new Error(`RECEIPT_NOT_FOUND: Customer receipt "${receiptId}" not found in transaction.`);
      }
      const txnReceipt = txnReceiptSnap.data() as CustomerReceipt;
      const txnExistingAllocations = Array.isArray(txnReceipt.allocations) ? txnReceipt.allocations : [];
      const txnAllocatedPaise = txnExistingAllocations.reduce((sum, a) => sum + (a.allocatedAmountPaise || 0), 0);
      const txnUnallocatedPaise = Math.max(0, txnReceipt.amountPaise - txnAllocatedPaise);

      if (totalRequestedPaise > txnUnallocatedPaise) {
        throw new Error(
          `ALLOCATION_EXCEEDS_RECEIPT_AMOUNT: Requested allocation total of ₹${paiseToRupees(totalRequestedPaise)} exceeds receipt unallocated amount of ₹${paiseToRupees(txnUnallocatedPaise)}.`
        );
      }

      // Re-read target invoice docs inside txn
      for (const item of targetInvoices) {
        const txnInvSnap = await txn.get(item.invRef);
        if (!txnInvSnap.exists()) {
          throw new Error(`INVOICE_NOT_FOUND: Sales Invoice "${item.invDoc.invoiceId}" not found in transaction.`);
        }
      }

      // Build new allocation records
      const newAllocationRecords: CustomerReceiptAllocation[] = targetInvoices.map((item) => ({
        receiptId,
        invoiceId: item.invDoc.invoiceId,
        invoiceNumber: item.invDoc.invoiceNumber,
        retailerId: canonicalCustomerId,
        customerId: canonicalCustomerId,
        allocatedAmountPaise: item.requestedPaise,
        createdAt: now,
        allocatedAt: now,
      }));

      const mergedAllocations = [...txnExistingAllocations, ...newAllocationRecords];
      const newTotalAllocatedPaise = txnAllocatedPaise + totalRequestedPaise;
      const newUnallocatedPaise = txnReceipt.amountPaise - newTotalAllocatedPaise;
      const newAllocationStatus: CustomerReceiptAllocationStatus =
        newUnallocatedPaise === 0 ? 'FULLY_ALLOCATED' : 'PARTIALLY_ALLOCATED';

      const updatedReceiptDoc = {
        ...txnReceipt,
        allocations: mergedAllocations,
        allocatedAmountPaise: newTotalAllocatedPaise,
        unallocatedAmountPaise: newUnallocatedPaise,
        allocationStatus: newAllocationStatus,
        version: (txnReceipt.version || 1) + 1,
        updatedAt: now,
        _serverTxnToken: SERVER_TXN_TOKEN,
      };

      txn.update(receiptRef, cleanDocData(updatedReceiptDoc));
      updatedReceiptResult = updatedReceiptDoc as CustomerReceipt;

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
          receiptId,
          receiptNumber: txnReceipt.receiptNumber,
          allocatedAmountPaise: item.requestedPaise,
          createdAt: now,
        });

        txn.update(item.invRef, {
          paymentStatus: newPaymentStatus,
          paidAmountPaise: newPaidAmountPaise,
          outstandingAmountPaise: newOutstandingPaise,
          allocations: existingInvoiceAllocations,
          updatedAt: now,
          _serverTxnToken: SERVER_TXN_TOKEN,
        });
      }

      // Record idempotency key if provided
      if (idempotencyKey) {
        const idempRef = doc(db, 'idempotencyKeys', `receipt_alloc_${idempotencyKey}`);
        txn.set(idempRef, {
          key: idempotencyKey,
          targetType: 'CUSTOMER_RECEIPT_ALLOCATION',
          receiptId,
          totalAllocatedPaise: totalRequestedPaise,
          allocatedAt: now,
          _serverTxnToken: SERVER_TXN_TOKEN,
        });
      }
    });

    // 8. Immutable Admin Audit Logging
    await logAdminAudit({
      action: 'CUSTOMER_RECEIPT_ALLOCATED' as any,
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'CUSTOMER_RECEIPT',
      targetId: receiptId,
      metadata: {
        receiptId,
        receiptNumber: receipt.receiptNumber,
        customerId: canonicalCustomerId,
        allocatedAmountPaise: totalRequestedPaise,
        allocationsCount: requestedAllocations.length,
        allocations: requestedAllocations,
      },
      req,
    });

    const { _serverTxnToken, ...safeReceipt } = (updatedReceiptResult || receipt) as any;
    return {
      success: true,
      receipt: safeReceipt as CustomerReceipt,
      isIdempotentReplay: false,
    };
  }

  private static reverseReceiptLocks = new Map<
    string,
    Promise<ReverseCustomerReceiptResponse>
  >();

  /**
   * Reverse Customer Receipt (Entrypoint with concurrency synchronization)
   * Phase 5.7 Part 2D: Customer Receipt Reversal / Cancellation
   */
  public static async reverseCustomerReceipt(
    adminSession: AdminSession,
    receiptId: string,
    payload?: ReverseCustomerReceiptPayload,
    req?: any
  ): Promise<ReverseCustomerReceiptResponse> {
    const cleanId = (receiptId || '').trim();
    if (!cleanId) {
      throw new Error('INVALID_RECEIPT_ID: receiptId is required.');
    }

    const existingLock = this.reverseReceiptLocks.get(cleanId);
    if (existingLock) {
      await existingLock.catch(() => {});
    }

    const reversePromise = this.executeReverseCustomerReceipt(adminSession, cleanId, payload, req);
    this.reverseReceiptLocks.set(cleanId, reversePromise);

    try {
      return await reversePromise;
    } finally {
      this.reverseReceiptLocks.delete(cleanId);
    }
  }

  /**
   * Internal authoritative execution of receipt reversal
   */
  private static async executeReverseCustomerReceipt(
    adminSession: AdminSession,
    receiptId: string,
    payload?: ReverseCustomerReceiptPayload,
    req?: any
  ): Promise<ReverseCustomerReceiptResponse> {
    // 1. Super Admin Authentication check (Requirement 2)
    if (!adminSession || adminSession.role !== 'SUPER_ADMIN') {
      throw new Error('SUPER_ADMIN_REQUIRED: Only Super Admin users can reverse customer receipts.');
    }

    const rawPayload = (payload || {}) as any;

    // 2. Client field injection defense (Requirement 12)
    const forbiddenKeys = [
      'customerId',
      'retailerId',
      'amountPaise',
      'amount',
      'receiptNumber',
      'receiptDate',
      'status',
      'unallocatedAmountPaise',
      'allocatedAmountPaise',
      'allocationStatus',
      'invoiceOutstanding',
      'outstandingAmountPaise',
      'paidAmountPaise',
      'paymentStatus',
      'arBalance',
      'grandTotal',
      'journalId',
      'voucherNumber',
      'reversalJournalId',
      'reversedAt',
      'reversedBy',
      'createdBy',
      'postedAt',
      '_serverTxnToken',
      'totalDebit',
      'totalCredit',
      'lines',
      'debit',
      'credit',
      'accountCode',
      'accountCodes',
      'allocations',
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

    // 4. Idempotency Key validation (Requirement 4 & 14)
    const idempotencyKey =
      typeof rawPayload.idempotencyKey === 'string' && rawPayload.idempotencyKey.trim()
        ? rawPayload.idempotencyKey.trim()
        : null;

    if (idempotencyKey) {
      if (idempotencyKey.length < 5) {
        throw new Error('INVALID_IDEMPOTENCY_KEY: idempotencyKey must be at least 5 characters.');
      }

      const idempDocRef = doc(db, 'idempotencyKeys', `receipt_rev_${idempotencyKey}`);
      const idempSnap = await getDoc(idempDocRef);

      if (idempSnap.exists()) {
        const idempData = idempSnap.data();
        if (idempData.receiptId !== receiptId) {
          throw new Error(
            `IDEMPOTENCY_CONFLICT: Idempotency key "${idempotencyKey}" was previously used for receipt "${idempData.receiptId}".`
          );
        }

        const receiptSnap = await getDoc(doc(db, 'customerReceipts', receiptId));
        if (receiptSnap.exists()) {
          const recData = receiptSnap.data() as CustomerReceipt;
          const { _serverTxnToken, ...safeReceipt } = recData as any;

          let reversalJournalData: any = null;
          if (recData.reversalJournalId) {
            const jSnap = await getDoc(doc(db, 'journalEntries', recData.reversalJournalId));
            if (jSnap.exists()) {
              const { _serverTxnToken: _j, ...safeJ } = jSnap.data() as any;
              reversalJournalData = safeJ;
            }
          }

          return {
            success: true,
            receipt: safeReceipt as CustomerReceipt,
            reversalJournal: reversalJournalData,
            isIdempotentReplay: true,
          };
        }
      }
    }

    // 5. Fetch Customer Receipt from Firestore (Requirement 3, 5, 6)
    const receiptRef = doc(db, 'customerReceipts', receiptId);
    let receiptSnap;
    try {
      receiptSnap = await getDoc(receiptRef);
    } catch (err: any) {
      if (err?.code === 'permission-denied' || err?.message?.includes('Missing or insufficient permissions')) {
        throw new Error(`RECEIPT_NOT_FOUND: Customer receipt "${receiptId}" not found.`);
      }
      throw err;
    }

    if (!receiptSnap.exists()) {
      throw new Error(`RECEIPT_NOT_FOUND: Customer receipt "${receiptId}" not found.`);
    }

    const receipt = receiptSnap.data() as CustomerReceipt;

    // 6. Verify Status: DRAFT cannot be reversed; already REVERSED cannot be reversed twice (Requirement 3 & 12)
    if (receipt.status === 'DRAFT') {
      throw new Error(
        `CANNOT_REVERSE_DRAFT_RECEIPT: Customer receipt "${receiptId}" is DRAFT and cannot be reversed. Only POSTED receipts can be reversed.`
      );
    }

    if (receipt.status === 'REVERSED') {
      throw new Error(
        `RECEIPT_ALREADY_REVERSED: Customer receipt "${receiptId}" has already been reversed.`
      );
    }

    if (receipt.status !== 'POSTED') {
      throw new Error(
        `INVALID_RECEIPT_STATUS: Cannot reverse customer receipt "${receiptId}". Only POSTED receipts can be reversed (current status: "${receipt.status}").`
      );
    }

    if (!receipt.journalId) {
      throw new Error(`MISSING_RECEIPT_JOURNAL: Posted customer receipt "${receiptId}" has no linked accounting journal.`);
    }

    const rawCustomerId = receipt.customerId.trim();
    const canonicalCustomerId =
      (await PartyLedgerService.resolveCanonicalRetailerId(rawCustomerId)) || rawCustomerId;

    // 7. Verify Period for Reversal Date (Requirement 21)
    const today = new Date().toISOString().slice(0, 10);
    await validatePeriodIsOpen(today);

    // 8. Analyze affected allocations and invoices (Requirement 10 & 11)
    const allocations = Array.isArray(receipt.allocations) ? receipt.allocations : [];
    const allocationsByInvoice = new Map<string, number>();
    for (const alloc of allocations) {
      if (alloc.invoiceId && alloc.allocatedAmountPaise > 0) {
        const cur = allocationsByInvoice.get(alloc.invoiceId) || 0;
        allocationsByInvoice.set(alloc.invoiceId, cur + alloc.allocatedAmountPaise);
      }
    }

    // Verify all affected invoices exist and belong to the same customer
    const targetInvoices: {
      invRef: any;
      invDoc: SalesInvoice;
      allocatedFromReceiptPaise: number;
    }[] = [];

    for (const [invId, allocatedPaise] of allocationsByInvoice.entries()) {
      const invRef = doc(db, 'salesInvoices', invId);
      const invSnap = await getDoc(invRef);
      if (!invSnap.exists()) {
        throw new Error(`INVOICE_NOT_FOUND: Sales invoice "${invId}" linked to receipt allocation not found.`);
      }
      const invDoc = invSnap.data() as SalesInvoice;
      const invCanonicalCustomerId =
        (await PartyLedgerService.resolveCanonicalRetailerId(invDoc.customerId)) || invDoc.customerId.trim();

      if (invCanonicalCustomerId !== canonicalCustomerId) {
        throw new Error(
          `CROSS_RETAILER_INVOICE_MISMATCH: Invoice "${invDoc.invoiceNumber}" belongs to "${invDoc.customerId}", not matching receipt customer "${receipt.customerId}".`
        );
      }

      targetInvoices.push({
        invRef,
        invDoc,
        allocatedFromReceiptPaise: allocatedPaise,
      });
    }

    // 9. Reversal Journal Creation (Requirement 8, 9, 21)
    // Uses JournalEngine.reverseJournal to create exact opposite journal entry
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
    // Check if reversal journal was already created (e.g. idempotency or recovery)
    const existingReversalQuery = query(
      collection(db, 'journalEntries'),
      where('reversalOfJournalId', '==', receipt.journalId)
    );
    const revSnap = await getDocs(existingReversalQuery);
    if (!revSnap.empty) {
      reversalJournal = revSnap.docs[0].data() as JournalEntry;
      if (!reversalJournal.customerId || reversalJournal.referenceType !== 'CUSTOMER_RECEIPT') {
        reversalJournal.customerId = canonicalCustomerId;
        reversalJournal.referenceType = 'CUSTOMER_RECEIPT';
        reversalJournal.referenceId = receipt.receiptId;
      }
    } else {
      const revRes = await JournalEngine.reverseJournal(adminUserObj, receipt.journalId, req, {
        referenceType: 'CUSTOMER_RECEIPT',
        referenceId: receipt.receiptId,
        customerId: canonicalCustomerId,
      });
      reversalJournal = revRes.reversalJournal;
    }

    // 10. Atomic Firestore Transaction for Receipt and Invoices (Requirement 7, 10, 13)
    const now = new Date().toISOString();
    let updatedReceiptResult: CustomerReceipt | null = null;

    await runTransaction(db, async (txn) => {
      // Re-read receipt doc inside txn
      const txnReceiptSnap = await txn.get(receiptRef);
      if (!txnReceiptSnap.exists()) {
        throw new Error(`RECEIPT_NOT_FOUND: Customer receipt "${receiptId}" not found in transaction.`);
      }
      const txnReceipt = txnReceiptSnap.data() as CustomerReceipt;

      if (txnReceipt.status === 'REVERSED') {
        throw new Error(`RECEIPT_ALREADY_REVERSED: Customer receipt "${receiptId}" has already been reversed.`);
      }
      if (txnReceipt.status !== 'POSTED') {
        throw new Error(`INVALID_RECEIPT_STATUS: Receipt status changed to "${txnReceipt.status}". Reversal aborted.`);
      }

      // 1. First Phase: Read all affected invoices (All reads before all writes)
      const invoiceUpdates: {
        invRef: any;
        updateData: any;
      }[] = [];

      for (const item of targetInvoices) {
        const txnInvSnap = await txn.get(item.invRef);
        if (!txnInvSnap.exists()) {
          throw new Error(`INVOICE_NOT_FOUND: Sales invoice "${item.invDoc.invoiceId}" not found in transaction.`);
        }
        const currentInv = txnInvSnap.data() as SalesInvoice;

        const currentPaidPaise = currentInv.paidAmountPaise || 0;
        const restoredPaidPaise = Math.max(0, currentPaidPaise - item.allocatedFromReceiptPaise);
        const grandTotalPaise = Math.round((currentInv.grandTotal || 0) * 100);

        const currentOutstandingPaise =
          currentInv.outstandingAmountPaise !== undefined
            ? currentInv.outstandingAmountPaise
            : Math.max(0, grandTotalPaise - currentPaidPaise);
        const restoredOutstandingPaise = Math.max(0, currentOutstandingPaise + item.allocatedFromReceiptPaise);

        const restoredPaymentStatus: InvoicePaymentStatus =
          restoredOutstandingPaise === 0
            ? 'PAID'
            : restoredPaidPaise > 0
            ? 'PARTIALLY_PAID'
            : 'UNPAID';

        // Separate active vs reversed allocations for audit history
        const existingInvAllocations = Array.isArray(currentInv.allocations) ? currentInv.allocations : [];
        const remainingActiveAllocations = existingInvAllocations.filter((a) => a.receiptId !== receiptId);
        const reversedAllocationsList = [
          ...((currentInv as any).reversedAllocations || []),
          ...existingInvAllocations
            .filter((a) => a.receiptId === receiptId)
            .map((a) => ({
              ...a,
              reversedAt: now,
              reversalReason: reason || null,
              reversalJournalId: reversalJournal.journalId,
            })),
        ];

        invoiceUpdates.push({
          invRef: item.invRef,
          updateData: {
            paymentStatus: restoredPaymentStatus,
            paidAmountPaise: restoredPaidPaise,
            outstandingAmountPaise: restoredOutstandingPaise,
            allocations: remainingActiveAllocations,
            reversedAllocations: reversedAllocationsList,
            updatedAt: now,
            _serverTxnToken: SERVER_TXN_TOKEN,
          },
        });
      }

      // 2. Second Phase: Execute all writes
      for (const invUp of invoiceUpdates) {
        txn.update(invUp.invRef, invUp.updateData);
      }

      // Update receipt doc to REVERSED (Requirement 5, 6, 7, 11)
      const updatedReceiptDoc = {
        ...txnReceipt,
        status: 'REVERSED',
        reversedAt: now,
        reversedBy: adminSession.uid,
        reversalJournalId: reversalJournal.journalId,
        reversalReason: reason || null,
        version: (txnReceipt.version || 1) + 1,
        updatedAt: now,
        _serverTxnToken: SERVER_TXN_TOKEN,
      };

      txn.update(receiptRef, cleanDocData(updatedReceiptDoc));
      updatedReceiptResult = updatedReceiptDoc as CustomerReceipt;

      // Store persistent idempotency record (Requirement 14)
      if (idempotencyKey) {
        const idempRef = doc(db, 'idempotencyKeys', `receipt_rev_${idempotencyKey}`);
        txn.set(idempRef, {
          key: idempotencyKey,
          targetType: 'CUSTOMER_RECEIPT_REVERSAL',
          receiptId,
          status: 'REVERSED',
          reversalJournalId: reversalJournal.journalId,
          reversedAt: now,
          reason: reason || null,
          _serverTxnToken: SERVER_TXN_TOKEN,
        });
      }
    });

    // 11. Immutable Audit Logging (Requirement 15)
    await logAdminAudit({
      action: 'CUSTOMER_RECEIPT_REVERSED' as any,
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'CUSTOMER_RECEIPT',
      targetId: receiptId,
      metadata: {
        receiptId,
        receiptNumber: receipt.receiptNumber,
        retailerId: canonicalCustomerId,
        customerId: canonicalCustomerId,
        originalVoucherNumber: receipt.voucherNumber || receipt.receiptNumber,
        originalJournalId: receipt.journalId,
        reversalJournalId: reversalJournal.journalId,
        reversalJournalNumber: reversalJournal.journalNumber,
        amountPaise: receipt.amountPaise,
        reason: reason || null,
        affectedInvoicesCount: targetInvoices.length,
        status: 'REVERSED',
        timestamp: now,
      },
      req,
    });

    const { _serverTxnToken, ...safeReceipt } = (updatedReceiptResult || receipt) as any;
    const { _serverTxnToken: _j, ...safeReversalJournal } = reversalJournal as any;

    return {
      success: true,
      receipt: safeReceipt as CustomerReceipt,
      reversalJournal: safeReversalJournal,
      isIdempotentReplay: false,
    };
  }

  /**
   * Reconcile Customer Receipts (Phase 5.7 Part 2E)
   * Server-authoritative, read-only reconciliation against:
   * - Customer receipt records
   * - Receipt allocations
   * - Sales invoice paid/outstanding balances
   * - Customer AR ledger
   * - Accounting journals
   */
  public static async reconcileCustomerReceipts(
    adminSession: AdminSession,
    filters?: CustomerReceiptReconciliationFilters,
    options?: CustomerReceiptReconciliationOptions
  ): Promise<CustomerReceiptReconciliationResult> {
    return CustomerReceiptReconciliationService.reconcileReceipts(
      adminSession,
      filters,
      options
    );
  }
}
