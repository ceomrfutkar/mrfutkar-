/**
 * MR FUTKAR — Credit Note & Debit Note Business Logic Service (Phase 5.6)
 * Server-authoritative double-entry accounting reversal and correction engine.
 * STRICTLY READ-ONLY with respect to original invoices, journals, inventory, and orders.
 */

import crypto from 'crypto';
import { Request } from 'express';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN, OPERATIONAL_WAREHOUSE_ID } from './firebaseAdmin';
import { logAdminAudit } from './adminAuth';
import { AdminSession, AdminUser } from '../src/types/admin';
import {
  CreditDebitNote,
  CreditDebitNoteType,
  CreditDebitNoteStatus,
  CreditDebitNoteItem,
  CreditDebitNoteItemInput,
  CreateCreditDebitNotePayload,
  UpdateCreditDebitNotePayload,
  WarehouseSnapshot,
  calculateCreditDebitNoteTotals,
} from '../src/types/creditDebitNote';
import { SalesInvoice, PurchaseInvoice, toPaise, toRupees } from '../src/types/invoice';
import { Account, JournalEntry, JournalLinePayload, VoucherType } from '../src/types/accounting';
import { getNextNoteNumber } from './creditDebitNoteSequenceService';
import { getNextJournalNumber } from './accountingSequenceService';
import { JournalEngine } from './journalEngine';
import { validatePeriodIsOpen } from './accountingPeriodService';

export interface CreditDebitNoteListFilters {
  noteType?: CreditDebitNoteType;
  status?: CreditDebitNoteStatus;
  originalInvoiceId?: string;
  originalInvoiceNumber?: string;
  customerId?: string;
  supplierId?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

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

export class CreditDebitNoteService {
  private static postNoteLocks = new Map<string, Promise<CreditDebitNote>>();

  /**
   * Helper: Resolve Chart of Accounts account by accountCode
   */
  private static async getAuthoritativeAccount(
    code: string,
    expectedType?: string,
    expectedBalance?: string
  ): Promise<Account> {
    const q = query(
      collection(db, 'chartOfAccounts'),
      where('accountCode', '==', code)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      throw new Error(`ACCOUNT_CODE_NOT_FOUND: Chart of Accounts does not contain accountCode "${code}".`);
    }

    const acc = snap.docs[0].data() as Account;
    if (!acc.isActive) {
      throw new Error(`INACTIVE_ACCOUNT: Account "${code} - ${acc.accountName}" is currently deactivated.`);
    }

    if (expectedType && acc.accountType !== expectedType) {
      throw new Error(`ACCOUNT_TYPE_MISMATCH: Account "${code}" is ${acc.accountType}, expected ${expectedType}.`);
    }

    if (expectedBalance && acc.normalBalance !== expectedBalance) {
      throw new Error(`NORMAL_BALANCE_MISMATCH: Account "${code}" is ${acc.normalBalance}, expected ${expectedBalance}.`);
    }

    return acc;
  }

  /**
   * Helper: Calculate Cumulative Adjustments already posted against a source invoice
   */
  public static async getPostedAdjustmentsForInvoice(
    originalInvoiceId: string
  ): Promise<{
    notes: CreditDebitNote[];
    totalAdjustedAmountPaise: number;
    adjustedQuantityByProductPaise: Map<string, number>;
  }> {
    const q = query(
      collection(db, 'creditDebitNotes'),
      where('originalInvoiceId', '==', originalInvoiceId)
    );
    const snap = await getDocs(q);

    const notes: CreditDebitNote[] = [];
    let totalAdjustedAmountPaise = 0;
    const adjustedQuantityByProductPaise = new Map<string, number>();

    snap.forEach((d) => {
      const note = d.data() as CreditDebitNote;
      if (note.status === 'POSTED') {
        notes.push(note);
        totalAdjustedAmountPaise += toPaise(note.grandTotal);

        if (Array.isArray(note.items)) {
          for (const item of note.items) {
            const currentQty = adjustedQuantityByProductPaise.get(item.productId) || 0;
            adjustedQuantityByProductPaise.set(item.productId, currentQty + item.quantity);
          }
        }
      }
    });

    return {
      notes,
      totalAdjustedAmountPaise,
      adjustedQuantityByProductPaise,
    };
  }

  /**
   * Helper: Fetch and validate source invoice
   */
  public static async resolveSourceInvoice(
    noteType: CreditDebitNoteType,
    invoiceId: string
  ): Promise<{
    invoiceType: 'SALES' | 'PURCHASE';
    invoiceData: SalesInvoice | PurchaseInvoice;
    invoiceNumber: string;
    invoiceDate: string;
    warehouseId: string;
    items: Array<any>;
    grandTotal: number;
    taxableTotal: number;
    taxTotal: number;
    customerId: string | null;
    supplierId: string | null;
    customerSnapshot: any;
    supplierSnapshot: any;
  }> {
    if (!invoiceId || typeof invoiceId !== 'string' || !invoiceId.trim()) {
      throw new Error('INVALID_SOURCE_INVOICE_ID: originalInvoiceId is required.');
    }
    const cleanId = invoiceId.trim();

    const isSalesNote = noteType === 'SALES_CREDIT_NOTE' || noteType === 'SALES_DEBIT_NOTE';
    const isPurchaseNote = noteType === 'PURCHASE_CREDIT_NOTE' || noteType === 'PURCHASE_DEBIT_NOTE';

    if (isSalesNote) {
      // Check salesInvoices collection
      const salesRef = doc(db, 'salesInvoices', cleanId);
      const salesSnap = await getDoc(salesRef);

      if (!salesSnap.exists()) {
        // Check if user accidentally passed purchase invoice ID
        const purchaseCheck = await getDoc(doc(db, 'purchaseInvoices', cleanId));
        if (purchaseCheck.exists()) {
          throw new Error('INVALID_SOURCE_INVOICE_TYPE: Sales Credit/Debit Notes cannot reference a Purchase Invoice.');
        }
        throw new Error(`INVOICE_NOT_FOUND: Source sales invoice "${cleanId}" not found.`);
      }

      const inv = salesSnap.data() as SalesInvoice;

      // Status requirement: ISSUED and accountingStatus POSTED
      if (inv.invoiceStatus === 'DRAFT' || inv.accountingStatus !== 'POSTED') {
        throw new Error(`INVALID_SOURCE_INVOICE_STATUS: Cannot issue a note against an invoice with status "${inv.invoiceStatus}" and accounting status "${inv.accountingStatus}". Invoices must be ISSUED with posted accounting.`);
      }
      if (inv.invoiceStatus === 'CANCELLED') {
        throw new Error('INVALID_SOURCE_INVOICE_STATUS: Cannot issue a note against a CANCELLED invoice.');
      }

      return {
        invoiceType: 'SALES',
        invoiceData: inv,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        warehouseId: inv.warehouseId || OPERATIONAL_WAREHOUSE_ID,
        items: inv.items,
        grandTotal: inv.grandTotal,
        taxableTotal: inv.taxableTotal,
        taxTotal: inv.taxTotal,
        customerId: inv.customerId,
        supplierId: null,
        customerSnapshot: inv.billingAddressSnapshot,
        supplierSnapshot: null,
      };
    } else if (isPurchaseNote) {
      // Check purchaseInvoices collection
      const purchaseRef = doc(db, 'purchaseInvoices', cleanId);
      const purchaseSnap = await getDoc(purchaseRef);

      if (!purchaseSnap.exists()) {
        // Check if user accidentally passed sales invoice ID
        const salesCheck = await getDoc(doc(db, 'salesInvoices', cleanId));
        if (salesCheck.exists()) {
          throw new Error('INVALID_SOURCE_INVOICE_TYPE: Purchase Credit/Debit Notes cannot reference a Sales Invoice.');
        }
        throw new Error(`INVOICE_NOT_FOUND: Source purchase invoice "${cleanId}" not found.`);
      }

      const inv = purchaseSnap.data() as PurchaseInvoice;

      // Status requirement: POSTED and accountingStatus POSTED
      if (inv.invoiceStatus === 'DRAFT' || inv.accountingStatus !== 'POSTED') {
        throw new Error(`INVALID_SOURCE_INVOICE_STATUS: Cannot issue a note against a purchase invoice with status "${inv.invoiceStatus}" and accounting status "${inv.accountingStatus}". Invoices must be POSTED with posted accounting.`);
      }
      if (inv.invoiceStatus === 'CANCELLED') {
        throw new Error('INVALID_SOURCE_INVOICE_STATUS: Cannot issue a note against a CANCELLED invoice.');
      }

      return {
        invoiceType: 'PURCHASE',
        invoiceData: inv,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        warehouseId: inv.warehouseId || OPERATIONAL_WAREHOUSE_ID,
        items: inv.items,
        grandTotal: inv.grandTotal,
        taxableTotal: inv.taxableTotal,
        taxTotal: inv.taxTotal,
        customerId: null,
        supplierId: inv.supplierId,
        customerSnapshot: null,
        supplierSnapshot: inv.billingAddressSnapshot,
      };
    } else {
      throw new Error(`UNKNOWN_NOTE_TYPE: Invalid note type "${noteType}".`);
    }
  }

  /**
   * Helper: Resolve warehouse snapshot
   */
  private static async resolveWarehouseSnapshot(warehouseId: string): Promise<WarehouseSnapshot> {
    try {
      const snap = await getDoc(doc(db, 'warehouses', warehouseId));
      if (snap.exists()) {
        const data = snap.data();
        return {
          warehouseId,
          name: data.name || 'MR FUTKAR — BRAHMPURI',
          city: data.city || 'Delhi',
          branch: data.branch || 'Brahmpuri Branch',
          address: data.address,
          pincode: data.pincode,
        };
      }
    } catch {
      // Fallback
    }

    return {
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      name: 'MR FUTKAR — BRAHMPURI',
      city: 'Delhi',
      branch: 'Brahmpuri Branch',
    };
  }

  /**
   * Create a DRAFT Credit or Debit Note
   */
  public static async createCreditDebitNote(
    adminSession: AdminSession,
    payload: CreateCreditDebitNotePayload,
    req?: Request
  ): Promise<CreditDebitNote> {
    const rawPayload = payload as any;

    // Strict client injection guards (CDN-48)
    if (
      rawPayload.noteNumber !== undefined ||
      rawPayload.journalId !== undefined ||
      rawPayload.voucherNumber !== undefined ||
      rawPayload.accountingStatus !== undefined ||
      rawPayload.accountingJournalId !== undefined ||
      rawPayload.accountingVoucherNumber !== undefined ||
      rawPayload.accountingPostedAt !== undefined ||
      rawPayload.totalDebit !== undefined ||
      rawPayload.totalCredit !== undefined ||
      rawPayload.createdBy !== undefined ||
      rawPayload.postedBy !== undefined
    ) {
      throw new Error(
        'CLIENT_ACCOUNTING_INJECTION_FORBIDDEN: Client cannot inject accounting fields (noteNumber, journalId, voucherNumber, accountingStatus, accountingJournalId, accountingVoucherNumber, accountingPostedAt, totalDebit, totalCredit, createdBy, postedBy).'
      );
    }
    if (
      rawPayload.grandTotal !== undefined ||
      rawPayload.subtotal !== undefined ||
      rawPayload.taxTotal !== undefined ||
      rawPayload.taxableTotal !== undefined ||
      rawPayload.discountTotal !== undefined
    ) {
      throw new Error(
        'CLIENT_TOTAL_INJECTION_FORBIDDEN: Note totals are calculated server-side from source invoice snapshots.'
      );
    }

    // 1. Validate Note Type
    const validNoteTypes: CreditDebitNoteType[] = [
      'SALES_CREDIT_NOTE',
      'SALES_DEBIT_NOTE',
      'PURCHASE_CREDIT_NOTE',
      'PURCHASE_DEBIT_NOTE',
    ];
    if (!payload.noteType || !validNoteTypes.includes(payload.noteType)) {
      throw new Error(`INVALID_NOTE_TYPE: noteType must be one of ${validNoteTypes.join(', ')}.`);
    }

    // 2. Validate Reason
    const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
    if (!reason || reason.length < 3) {
      throw new Error('MISSING_REASON: A descriptive reason for the credit/debit note is required (minimum 3 characters).');
    }

    // 3. Idempotency Check
    if (payload.idempotencyKey) {
      const qIdemp = query(
        collection(db, 'creditDebitNotes'),
        where('idempotencyKey', '==', payload.idempotencyKey.trim())
      );
      const snapIdemp = await getDocs(qIdemp);
      if (!snapIdemp.empty) {
        const existing = snapIdemp.docs[0].data() as CreditDebitNote;
        const { _serverTxnToken, ...sanitized } = existing as any;
        return sanitized;
      }
    }

    // 4. Source Invoice Resolution & Snapshot Copying
    const source = await this.resolveSourceInvoice(payload.noteType, payload.originalInvoiceId);

    // 5. Cumulative Adjustment Check: Calculate already posted adjustments
    const postedAdjustments = await this.getPostedAdjustmentsForInvoice(payload.originalInvoiceId);

    // 6. Item Snapshot Extraction & Partial Quantity / Cumulative Limit Validation
    const sourceItemMap = new Map<string, any>();
    for (const item of source.items) {
      sourceItemMap.set(item.productId, item);
    }

    let itemsToProcess: Array<{
      productId: string;
      skuSnapshot: string;
      productNameSnapshot: string;
      quantity: number;
      unitPrice: number;
      discountAmount: number;
      taxRate: number;
    }> = [];

    if (payload.items && Array.isArray(payload.items) && payload.items.length > 0) {
      // Partial or specific lines selected
      for (const itemInput of payload.items) {
        if (!itemInput.productId || !sourceItemMap.has(itemInput.productId)) {
          throw new Error(`PRODUCT_NOT_IN_SOURCE_INVOICE: Product "${itemInput.productId}" does not exist in original invoice ${source.invoiceNumber}.`);
        }

        const sourceItem = sourceItemMap.get(itemInput.productId);
        const qty = Number(itemInput.quantity);
        if (!Number.isInteger(qty) || qty <= 0) {
          throw new Error(`INVALID_ITEM_QUANTITY: Quantity for product "${sourceItem.productNameSnapshot || sourceItem.productId}" must be a positive integer.`);
        }

        // Cumulative Quantity Limit Check (CDN-30, CDN-31, CDN-33, CDN-34)
        const alreadyAdjustedQty = postedAdjustments.adjustedQuantityByProductPaise.get(itemInput.productId) || 0;
        const remainingQty = sourceItem.quantity - alreadyAdjustedQty;

        if (payload.noteType === 'SALES_CREDIT_NOTE' || payload.noteType === 'PURCHASE_DEBIT_NOTE') {
          if (qty > remainingQty) {
            throw new Error(`CUMULATIVE_QUANTITY_EXCEEDED: Requested quantity (${qty}) exceeds remaining eligible quantity (${remainingQty}) for product "${sourceItem.productNameSnapshot || sourceItem.productId}". Original: ${sourceItem.quantity}, Already adjusted: ${alreadyAdjustedQty}.`);
          }
        }

        // Proportionate discount from original line
        const unitPrice = sourceItem.unitPrice !== undefined ? sourceItem.unitPrice : sourceItem.unitCost;
        const itemDiscountTotal = sourceItem.discountAmount || 0;
        const proportionateDiscount = sourceItem.quantity > 0
          ? Number(((itemDiscountTotal / sourceItem.quantity) * qty).toFixed(2))
          : 0;

        itemsToProcess.push({
          productId: sourceItem.productId,
          skuSnapshot: sourceItem.skuSnapshot || sourceItem.productId,
          productNameSnapshot: sourceItem.productNameSnapshot || 'Product',
          quantity: qty,
          unitPrice,
          discountAmount: proportionateDiscount,
          taxRate: sourceItem.taxRate || 0,
        });
      }
    } else {
      // Entire invoice (or remaining eligible portion)
      for (const sourceItem of source.items) {
        const alreadyAdjustedQty = postedAdjustments.adjustedQuantityByProductPaise.get(sourceItem.productId) || 0;
        const remainingQty = sourceItem.quantity - alreadyAdjustedQty;

        if (remainingQty <= 0) {
          continue; // All units of this item were already credited/debited
        }

        const unitPrice = sourceItem.unitPrice !== undefined ? sourceItem.unitPrice : sourceItem.unitCost;
        const itemDiscountTotal = sourceItem.discountAmount || 0;
        const proportionateDiscount = sourceItem.quantity > 0
          ? Number(((itemDiscountTotal / sourceItem.quantity) * remainingQty).toFixed(2))
          : 0;

        itemsToProcess.push({
          productId: sourceItem.productId,
          skuSnapshot: sourceItem.skuSnapshot || sourceItem.productId,
          productNameSnapshot: sourceItem.productNameSnapshot || 'Product',
          quantity: remainingQty,
          unitPrice,
          discountAmount: proportionateDiscount,
          taxRate: sourceItem.taxRate || 0,
        });
      }

      if (itemsToProcess.length === 0) {
        throw new Error(`INVOICE_FULLY_ADJUSTED: Source invoice ${source.invoiceNumber} has already been fully adjusted. No remaining eligible items.`);
      }
    }

    // 7. Recalculate Totals Server-Side using integer paise
    const calculated = calculateCreditDebitNoteTotals(itemsToProcess);

    // Cumulative Total Limit Check (CDN-31, CDN-32, CDN-33, CDN-34)
    if (payload.noteType === 'SALES_CREDIT_NOTE' || payload.noteType === 'PURCHASE_DEBIT_NOTE') {
      const remainingEligiblePaise = toPaise(source.grandTotal) - postedAdjustments.totalAdjustedAmountPaise;
      const proposedGrandTotalPaise = toPaise(calculated.grandTotal);

      if (proposedGrandTotalPaise > remainingEligiblePaise) {
        throw new Error(`CUMULATIVE_LIMIT_EXCEEDED: Proposed note grand total (₹${calculated.grandTotal}) exceeds remaining eligible invoice total (₹${toRupees(remainingEligiblePaise)}). Original: ₹${source.grandTotal}, Previously adjusted: ₹${toRupees(postedAdjustments.totalAdjustedAmountPaise)}.`);
      }
    }

    // 8. Generate Note Number & ID
    const noteNumber = await getNextNoteNumber(payload.noteType);
    const noteId = `cdn_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const warehouseSnapshot = await this.resolveWarehouseSnapshot(source.warehouseId);
    const now = new Date().toISOString();

    const noteDoc: CreditDebitNote & { _serverTxnToken: string } = {
      noteId,
      noteNumber,
      noteType: payload.noteType,
      status: 'DRAFT',
      originalInvoiceId: payload.originalInvoiceId.trim(),
      originalInvoiceNumber: source.invoiceNumber,
      originalInvoiceDate: source.invoiceDate,
      customerId: source.customerId,
      supplierId: source.supplierId,
      customerSnapshot: source.customerSnapshot,
      supplierSnapshot: source.supplierSnapshot,
      warehouseId: source.warehouseId,
      warehouseSnapshot,
      reason,
      items: calculated.items,
      subtotal: calculated.subtotal,
      discountTotal: calculated.discountTotal,
      taxableTotal: calculated.taxableTotal,
      taxTotal: calculated.taxTotal,
      grandTotal: calculated.grandTotal,
      accountingStatus: 'NOT_POSTED',
      accountingJournalId: null,
      accountingVoucherNumber: null,
      accountingPostedAt: null,
      createdBy: adminSession.uid,
      createdAt: now,
      updatedBy: adminSession.uid,
      updatedAt: now,
      version: 1,
      idempotencyKey: payload.idempotencyKey ? payload.idempotencyKey.trim() : null,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    await setDoc(doc(db, 'creditDebitNotes', noteId), cleanDocData(noteDoc));

    await logAdminAudit({
      action: 'CREDIT_DEBIT_NOTE_CREATED',
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'CREDIT_DEBIT_NOTE',
      targetId: noteId,
      metadata: {
        noteId,
        noteNumber,
        noteType: payload.noteType,
        originalInvoiceId: payload.originalInvoiceId,
        originalInvoiceNumber: source.invoiceNumber,
        grandTotal: noteDoc.grandTotal,
        adminUid: adminSession.uid,
      },
      req,
    });

    const { _serverTxnToken, ...sanitized } = noteDoc;
    return sanitized;
  }

  /**
   * Update an existing DRAFT Credit or Debit Note
   */
  public static async updateCreditDebitNote(
    adminSession: AdminSession,
    noteId: string,
    payload: UpdateCreditDebitNotePayload,
    req?: Request
  ): Promise<CreditDebitNote> {
    const rawPayload = payload as any;

    if (
      rawPayload.noteNumber !== undefined ||
      rawPayload.journalId !== undefined ||
      rawPayload.voucherNumber !== undefined ||
      rawPayload.accountingStatus !== undefined ||
      rawPayload.accountingJournalId !== undefined ||
      rawPayload.accountingVoucherNumber !== undefined ||
      rawPayload.accountingPostedAt !== undefined ||
      rawPayload.totalDebit !== undefined ||
      rawPayload.totalCredit !== undefined
    ) {
      throw new Error(
        'CLIENT_ACCOUNTING_INJECTION_FORBIDDEN: Client cannot inject accounting fields.'
      );
    }
    if (
      rawPayload.grandTotal !== undefined ||
      rawPayload.subtotal !== undefined ||
      rawPayload.taxTotal !== undefined ||
      rawPayload.taxableTotal !== undefined ||
      rawPayload.discountTotal !== undefined
    ) {
      throw new Error('CLIENT_TOTAL_INJECTION_FORBIDDEN: Note totals are calculated server-side.');
    }

    const noteRef = doc(db, 'creditDebitNotes', noteId.trim());
    const noteSnap = await getDoc(noteRef);

    if (!noteSnap.exists()) {
      throw new Error(`NOTE_NOT_FOUND: Credit/Debit Note "${noteId}" not found.`);
    }

    const current = noteSnap.data() as CreditDebitNote;

    // Strict immutability guard for posted notes (CDN-29)
    if (current.status === 'POSTED' || current.accountingStatus === 'POSTED') {
      throw new Error('NOTE_IMMUTABLE: Cannot edit a POSTED Credit/Debit Note. Posted notes are immutable.');
    }
    if (current.status === 'CANCELLED') {
      throw new Error('NOTE_IMMUTABLE: Cannot edit a CANCELLED Credit/Debit Note.');
    }

    const source = await this.resolveSourceInvoice(current.noteType, current.originalInvoiceId);
    const postedAdjustments = await this.getPostedAdjustmentsForInvoice(current.originalInvoiceId);

    const sourceItemMap = new Map<string, any>();
    for (const item of source.items) {
      sourceItemMap.set(item.productId, item);
    }

    let updatedItems = current.items;
    let totals = {
      subtotal: current.subtotal,
      discountTotal: current.discountTotal,
      taxableTotal: current.taxableTotal,
      taxTotal: current.taxTotal,
      grandTotal: current.grandTotal,
    };

    if (payload.items && Array.isArray(payload.items) && payload.items.length > 0) {
      const itemsToProcess: Array<any> = [];

      for (const itemInput of payload.items) {
        if (!itemInput.productId || !sourceItemMap.has(itemInput.productId)) {
          throw new Error(`PRODUCT_NOT_IN_SOURCE_INVOICE: Product "${itemInput.productId}" does not exist in original invoice.`);
        }

        const sourceItem = sourceItemMap.get(itemInput.productId);
        const qty = Number(itemInput.quantity);
        if (!Number.isInteger(qty) || qty <= 0) {
          throw new Error(`INVALID_ITEM_QUANTITY: Quantity for product "${sourceItem.productNameSnapshot}" must be a positive integer.`);
        }

        const alreadyAdjustedQty = postedAdjustments.adjustedQuantityByProductPaise.get(itemInput.productId) || 0;
        const remainingQty = sourceItem.quantity - alreadyAdjustedQty;

        if (current.noteType === 'SALES_CREDIT_NOTE' || current.noteType === 'PURCHASE_DEBIT_NOTE') {
          if (qty > remainingQty) {
            throw new Error(`CUMULATIVE_QUANTITY_EXCEEDED: Requested quantity (${qty}) exceeds remaining eligible quantity (${remainingQty}) for product "${sourceItem.productNameSnapshot}".`);
          }
        }

        const unitPrice = sourceItem.unitPrice !== undefined ? sourceItem.unitPrice : sourceItem.unitCost;
        const itemDiscountTotal = sourceItem.discountAmount || 0;
        const proportionateDiscount = sourceItem.quantity > 0
          ? Number(((itemDiscountTotal / sourceItem.quantity) * qty).toFixed(2))
          : 0;

        itemsToProcess.push({
          productId: sourceItem.productId,
          skuSnapshot: sourceItem.skuSnapshot || sourceItem.productId,
          productNameSnapshot: sourceItem.productNameSnapshot || 'Product',
          quantity: qty,
          unitPrice,
          discountAmount: proportionateDiscount,
          taxRate: sourceItem.taxRate || 0,
        });
      }

      const calculated = calculateCreditDebitNoteTotals(itemsToProcess);

      if (current.noteType === 'SALES_CREDIT_NOTE' || current.noteType === 'PURCHASE_DEBIT_NOTE') {
        const remainingEligiblePaise = toPaise(source.grandTotal) - postedAdjustments.totalAdjustedAmountPaise;
        if (toPaise(calculated.grandTotal) > remainingEligiblePaise) {
          throw new Error(`CUMULATIVE_LIMIT_EXCEEDED: Proposed note grand total exceeds remaining eligible invoice total.`);
        }
      }

      updatedItems = calculated.items;
      totals = {
        subtotal: calculated.subtotal,
        discountTotal: calculated.discountTotal,
        taxableTotal: calculated.taxableTotal,
        taxTotal: calculated.taxTotal,
        grandTotal: calculated.grandTotal,
      };
    }

    const now = new Date().toISOString();
    const updatedNote: CreditDebitNote & { _serverTxnToken: string } = {
      ...current,
      reason: payload.reason !== undefined ? payload.reason.trim() : current.reason,
      items: updatedItems,
      ...totals,
      updatedAt: now,
      updatedBy: adminSession.uid,
      version: (current.version || 1) + 1,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    await setDoc(noteRef, cleanDocData(updatedNote));

    await logAdminAudit({
      action: 'CREDIT_DEBIT_NOTE_UPDATED',
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'CREDIT_DEBIT_NOTE',
      targetId: noteId,
      metadata: {
        noteNumber: current.noteNumber,
        grandTotal: updatedNote.grandTotal,
      },
      req,
    });

    const { _serverTxnToken, ...sanitized } = updatedNote;
    return sanitized;
  }

  /**
   * Transition Credit or Debit Note from DRAFT to POSTED and atomically post Double-Entry Journal
   */
  public static async postCreditDebitNote(
    adminSession: AdminSession,
    noteId: string,
    req?: Request
  ): Promise<CreditDebitNote> {
    const cleanId = noteId.trim();

    // Concurrency Mutex Lock (CDN-36)
    if (this.postNoteLocks.has(cleanId)) {
      return this.postNoteLocks.get(cleanId)!;
    }

    const lockPromise = this.executePostCreditDebitNote(adminSession, cleanId, req);
    this.postNoteLocks.set(cleanId, lockPromise);

    try {
      const result = await lockPromise;
      return result;
    } finally {
      this.postNoteLocks.delete(cleanId);
    }
  }

  /**
   * Internal authoritative implementation of posting note with double-entry journal linkage
   */
  private static async executePostCreditDebitNote(
    adminSession: AdminSession,
    noteId: string,
    req?: Request
  ): Promise<CreditDebitNote> {
    const noteRef = doc(db, 'creditDebitNotes', noteId);
    const noteSnap = await getDoc(noteRef);

    if (!noteSnap.exists()) {
      throw new Error(`NOTE_NOT_FOUND: Credit/Debit Note "${noteId}" not found.`);
    }

    const current = noteSnap.data() as CreditDebitNote;

    // Idempotency: If already POSTED, return current state without creating a second journal or voucher (CDN-35)
    if (current.status === 'POSTED' && current.accountingStatus === 'POSTED') {
      const { _serverTxnToken, ...sanitized } = current as any;
      return sanitized;
    }

    if (current.status === 'CANCELLED') {
      throw new Error('CANNOT_POST_CANCELLED_NOTE: A cancelled note cannot be posted.');
    }

    // 1. Verify source invoice still valid
    const source = await this.resolveSourceInvoice(current.noteType, current.originalInvoiceId);

    // 2. Cumulative Limit Re-Verification (Server-authoritative check before write)
    const postedAdjustments = await this.getPostedAdjustmentsForInvoice(current.originalInvoiceId);

    if (current.noteType === 'SALES_CREDIT_NOTE' || current.noteType === 'PURCHASE_DEBIT_NOTE') {
      const remainingEligiblePaise = toPaise(source.grandTotal) - postedAdjustments.totalAdjustedAmountPaise;
      if (toPaise(current.grandTotal) > remainingEligiblePaise) {
        throw new Error(`CUMULATIVE_LIMIT_EXCEEDED: Cannot post note. Grand total (₹${current.grandTotal}) exceeds remaining eligible amount (₹${toRupees(remainingEligiblePaise)}).`);
      }

      for (const item of current.items) {
        const sourceItem = source.items.find((si: any) => si.productId === item.productId);
        if (sourceItem) {
          const alreadyQty = postedAdjustments.adjustedQuantityByProductPaise.get(item.productId) || 0;
          const remainingQty = sourceItem.quantity - alreadyQty;
          if (item.quantity > remainingQty) {
            throw new Error(`CUMULATIVE_QUANTITY_EXCEEDED: Cannot post note. Item "${item.productNameSnapshot}" quantity (${item.quantity}) exceeds remaining eligible quantity (${remainingQty}).`);
          }
        }
      }
    }

    // 3. Accounting Period Verification (CDN-20)
    const noteDate = current.originalInvoiceDate || new Date().toISOString().substring(0, 10);
    await validatePeriodIsOpen(noteDate);

    // 4. Resolve Double-Entry Accounts Dynamically by accountCode (CDN-21 to CDN-26)
    const accReceivable = await this.getAuthoritativeAccount('1300', 'ASSET', 'DEBIT');
    const accSalesRevenue = await this.getAuthoritativeAccount('4100', 'INCOME', 'CREDIT');
    const accOutputGst = await this.getAuthoritativeAccount('2200', 'LIABILITY', 'CREDIT');
    const accPayable = await this.getAuthoritativeAccount('2100', 'LIABILITY', 'CREDIT');
    const accCogsDirectCosts = await this.getAuthoritativeAccount('5100', 'EXPENSE', 'DEBIT');
    const accInputGst = await this.getAuthoritativeAccount('2300');

    // 5. Construct Double-Entry Lines per canonical note type
    const journalLines: JournalLinePayload[] = [];
    const hasTax = current.taxTotal > 0;

    switch (current.noteType) {
      case 'SALES_CREDIT_NOTE':
        // Sales Revenue Reversal (DR) & Output GST Reversal (DR) & Accounts Receivable Reduction (CR)
        if (hasTax) {
          journalLines.push({
            accountId: accSalesRevenue.accountId,
            debit: current.taxableTotal,
            credit: 0,
            description: `Sales Revenue reduction for ${current.noteNumber} (Invoice ${current.originalInvoiceNumber})`,
            customerId: current.customerId,
          });
          journalLines.push({
            accountId: accOutputGst.accountId,
            debit: current.taxTotal,
            credit: 0,
            description: `Output GST reduction for ${current.noteNumber} (Invoice ${current.originalInvoiceNumber})`,
            customerId: current.customerId,
          });
          journalLines.push({
            accountId: accReceivable.accountId,
            debit: 0,
            credit: current.grandTotal,
            description: `Accounts Receivable credit for ${current.noteNumber} (Invoice ${current.originalInvoiceNumber})`,
            customerId: current.customerId,
          });
        } else {
          journalLines.push({
            accountId: accSalesRevenue.accountId,
            debit: current.grandTotal,
            credit: 0,
            description: `Sales Revenue reduction for ${current.noteNumber} (Invoice ${current.originalInvoiceNumber})`,
            customerId: current.customerId,
          });
          journalLines.push({
            accountId: accReceivable.accountId,
            debit: 0,
            credit: current.grandTotal,
            description: `Accounts Receivable credit for ${current.noteNumber} (Invoice ${current.originalInvoiceNumber})`,
            customerId: current.customerId,
          });
        }
        break;

      case 'SALES_DEBIT_NOTE':
        // Accounts Receivable Increase (DR) & Sales Revenue Increase (CR) & Output GST Increase (CR)
        if (hasTax) {
          journalLines.push({
            accountId: accReceivable.accountId,
            debit: current.grandTotal,
            credit: 0,
            description: `Accounts Receivable debit for ${current.noteNumber} (Invoice ${current.originalInvoiceNumber})`,
            customerId: current.customerId,
          });
          journalLines.push({
            accountId: accSalesRevenue.accountId,
            debit: 0,
            credit: current.taxableTotal,
            description: `Sales Revenue increase for ${current.noteNumber} (Invoice ${current.originalInvoiceNumber})`,
            customerId: current.customerId,
          });
          journalLines.push({
            accountId: accOutputGst.accountId,
            debit: 0,
            credit: current.taxTotal,
            description: `Output GST increase for ${current.noteNumber} (Invoice ${current.originalInvoiceNumber})`,
            customerId: current.customerId,
          });
        } else {
          journalLines.push({
            accountId: accReceivable.accountId,
            debit: current.grandTotal,
            credit: 0,
            description: `Accounts Receivable debit for ${current.noteNumber} (Invoice ${current.originalInvoiceNumber})`,
            customerId: current.customerId,
          });
          journalLines.push({
            accountId: accSalesRevenue.accountId,
            debit: 0,
            credit: current.grandTotal,
            description: `Sales Revenue increase for ${current.noteNumber} (Invoice ${current.originalInvoiceNumber})`,
            customerId: current.customerId,
          });
        }
        break;

      case 'PURCHASE_DEBIT_NOTE':
        // Accounts Payable Reduction (DR) & COGS/Direct Cost Reversal (CR) & Input GST Reversal (CR)
        if (hasTax) {
          journalLines.push({
            accountId: accPayable.accountId,
            debit: current.grandTotal,
            credit: 0,
            description: `Accounts Payable reduction for ${current.noteNumber} (Invoice ${current.originalInvoiceNumber})`,
            supplierId: current.supplierId,
          });
          journalLines.push({
            accountId: accCogsDirectCosts.accountId,
            debit: 0,
            credit: current.taxableTotal,
            description: `Direct Costs reduction for ${current.noteNumber} (Invoice ${current.originalInvoiceNumber})`,
            supplierId: current.supplierId,
          });
          journalLines.push({
            accountId: accInputGst.accountId,
            debit: 0,
            credit: current.taxTotal,
            description: `Input GST reduction for ${current.noteNumber} (Invoice ${current.originalInvoiceNumber})`,
            supplierId: current.supplierId,
          });
        } else {
          journalLines.push({
            accountId: accPayable.accountId,
            debit: current.grandTotal,
            credit: 0,
            description: `Accounts Payable reduction for ${current.noteNumber} (Invoice ${current.originalInvoiceNumber})`,
            supplierId: current.supplierId,
          });
          journalLines.push({
            accountId: accCogsDirectCosts.accountId,
            debit: 0,
            credit: current.grandTotal,
            description: `Direct Costs reduction for ${current.noteNumber} (Invoice ${current.originalInvoiceNumber})`,
            supplierId: current.supplierId,
          });
        }
        break;

      case 'PURCHASE_CREDIT_NOTE':
        // COGS/Direct Costs Increase (DR) & Input GST Increase (DR) & Accounts Payable Increase (CR)
        if (hasTax) {
          journalLines.push({
            accountId: accCogsDirectCosts.accountId,
            debit: current.taxableTotal,
            credit: 0,
            description: `Direct Costs increase for ${current.noteNumber} (Invoice ${current.originalInvoiceNumber})`,
            supplierId: current.supplierId,
          });
          journalLines.push({
            accountId: accInputGst.accountId,
            debit: current.taxTotal,
            credit: 0,
            description: `Input GST increase for ${current.noteNumber} (Invoice ${current.originalInvoiceNumber})`,
            supplierId: current.supplierId,
          });
          journalLines.push({
            accountId: accPayable.accountId,
            debit: 0,
            credit: current.grandTotal,
            description: `Accounts Payable increase for ${current.noteNumber} (Invoice ${current.originalInvoiceNumber})`,
            supplierId: current.supplierId,
          });
        } else {
          journalLines.push({
            accountId: accCogsDirectCosts.accountId,
            debit: current.grandTotal,
            credit: 0,
            description: `Direct Costs increase for ${current.noteNumber} (Invoice ${current.originalInvoiceNumber})`,
            supplierId: current.supplierId,
          });
          journalLines.push({
            accountId: accPayable.accountId,
            debit: 0,
            credit: current.grandTotal,
            description: `Accounts Payable increase for ${current.noteNumber} (Invoice ${current.originalInvoiceNumber})`,
            supplierId: current.supplierId,
          });
        }
        break;

      default:
        throw new Error(`UNKNOWN_NOTE_TYPE: Invalid note type "${current.noteType}".`);
    }

    // 6. Voucher Sequence Type Selection (CN for credit notes, DN for debit notes)
    const isCredit = current.noteType === 'SALES_CREDIT_NOTE' || current.noteType === 'PURCHASE_CREDIT_NOTE';
    const voucherType: VoucherType = isCredit ? 'CN' : 'DN';

    // 7. Idempotent Journal Generation
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

    const draftJournalRes = await JournalEngine.createDraftJournal(
      adminUserObj,
      {
        journalDate: noteDate,
        voucherType,
        referenceType: 'CREDIT_DEBIT_NOTE',
        referenceId: noteId,
        narration: `${current.noteType} ${current.noteNumber} for ${current.originalInvoiceNumber}: ${current.reason}`,
        lines: journalLines,
      },
      req
    );

    const postedJournalRes = await JournalEngine.postJournal(
      adminUserObj,
      draftJournalRes.journal.journalId,
      req
    );
    const journal = postedJournalRes.journal;

    // 8. Update Note Document atomically
    const now = new Date().toISOString();
    const postedNote: CreditDebitNote & { _serverTxnToken: string } = {
      ...current,
      status: 'POSTED',
      accountingStatus: 'POSTED',
      accountingJournalId: journal.journalId,
      accountingVoucherNumber: journal.journalNumber,
      accountingPostedAt: journal.postedAt || now,
      updatedAt: now,
      updatedBy: adminSession.uid,
      version: (current.version || 1) + 1,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    await setDoc(noteRef, cleanDocData(postedNote));

    // 9. Audits (CDN-50, CDN-51)
    await logAdminAudit({
      action: 'CREDIT_DEBIT_NOTE_POSTED',
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'CREDIT_DEBIT_NOTE',
      targetId: noteId,
      metadata: {
        noteId,
        noteNumber: current.noteNumber,
        noteType: current.noteType,
        grandTotal: current.grandTotal,
        originalInvoiceNumber: current.originalInvoiceNumber,
      },
      req,
    });

    await logAdminAudit({
      action: 'CREDIT_DEBIT_NOTE_ACCOUNTING_POSTED',
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'CREDIT_DEBIT_NOTE',
      targetId: noteId,
      metadata: {
        noteId,
        noteNumber: current.noteNumber,
        noteType: current.noteType,
        originalInvoiceId: current.originalInvoiceId,
        originalInvoiceNumber: current.originalInvoiceNumber,
        journalId: journal.journalId,
        voucherNumber: journal.journalNumber,
        grandTotal: current.grandTotal,
        adminUid: adminSession.uid,
        timestamp: now,
      },
      req,
    });

    const { _serverTxnToken, ...sanitized } = postedNote;
    return sanitized;
  }

  /**
   * Retrieve Single Note by ID
   */
  public static async getCreditDebitNote(
    noteId: string
  ): Promise<CreditDebitNote> {
    if (!noteId || typeof noteId !== 'string') {
      throw new Error('INVALID_NOTE_ID: noteId is required.');
    }

    const snap = await getDoc(doc(db, 'creditDebitNotes', noteId.trim()));
    if (!snap.exists()) {
      throw new Error(`NOTE_NOT_FOUND: Credit/Debit Note "${noteId}" not found.`);
    }

    const data = snap.data() as CreditDebitNote;
    const { _serverTxnToken, ...sanitized } = data as any;
    return sanitized;
  }

  /**
   * List Notes with Filters and Pagination
   */
  public static async listCreditDebitNotes(
    filters: CreditDebitNoteListFilters = {}
  ): Promise<{ notes: CreditDebitNote[]; totalCount: number; page: number; pageSize: number }> {
    const notesRef = collection(db, 'creditDebitNotes');
    const snap = await getDocs(notesRef);

    let allNotes: CreditDebitNote[] = [];
    snap.forEach((d) => {
      const data = d.data() as CreditDebitNote;
      const { _serverTxnToken, ...sanitized } = data as any;
      allNotes.push(sanitized);
    });

    // Filtering
    if (filters.noteType) {
      allNotes = allNotes.filter((n) => n.noteType === filters.noteType);
    }
    if (filters.status) {
      allNotes = allNotes.filter((n) => n.status === filters.status);
    }
    if (filters.originalInvoiceId) {
      allNotes = allNotes.filter((n) => n.originalInvoiceId === filters.originalInvoiceId);
    }
    if (filters.originalInvoiceNumber) {
      allNotes = allNotes.filter((n) =>
        n.originalInvoiceNumber.toLowerCase().includes(filters.originalInvoiceNumber!.toLowerCase())
      );
    }
    if (filters.customerId) {
      allNotes = allNotes.filter((n) => n.customerId === filters.customerId);
    }
    if (filters.supplierId) {
      allNotes = allNotes.filter((n) => n.supplierId === filters.supplierId);
    }
    if (filters.fromDate) {
      allNotes = allNotes.filter((n) => (n.createdAt ? n.createdAt.substring(0, 10) >= filters.fromDate! : true));
    }
    if (filters.toDate) {
      allNotes = allNotes.filter((n) => (n.createdAt ? n.createdAt.substring(0, 10) <= filters.toDate! : true));
    }
    if (filters.search) {
      const s = filters.search.trim().toLowerCase();
      allNotes = allNotes.filter(
        (n) =>
          n.noteNumber.toLowerCase().includes(s) ||
          n.originalInvoiceNumber.toLowerCase().includes(s) ||
          (n.customerSnapshot?.businessName && n.customerSnapshot.businessName.toLowerCase().includes(s)) ||
          (n.supplierSnapshot?.businessName && n.supplierSnapshot.businessName.toLowerCase().includes(s)) ||
          n.reason.toLowerCase().includes(s)
      );
    }

    // Sort descending by createdAt
    allNotes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const totalCount = allNotes.length;
    const page = Math.max(1, Number(filters.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize || 50)));
    const startIndex = (page - 1) * pageSize;
    const paginatedNotes = allNotes.slice(startIndex, startIndex + pageSize);

    return {
      notes: paginatedNotes,
      totalCount,
      page,
      pageSize,
    };
  }
}
