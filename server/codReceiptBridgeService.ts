/**
 * MR FUTKAR — PHASE 6 PART 4C-A: COD COLLECTION TO CUSTOMER RECEIPT / AR SETTLEMENT BRIDGE
 * 
 * Bridges operational COD collections (Phase 6 Part 4A/4B) to the canonical
 * Customer Receipt and Accounts Receivable accounting architecture (Phase 5.7):
 * - Exactly ONE canonical Customer Receipt per collected COD order
 * - Server-authoritative collection amount (integer paise); client amount rejected
 * - Canonical retailer identity resolved via PartyLedgerService; client identity rejected
 * - Dual-track payment method mapping: CASH (1100 Cash in Hand) vs UPI (1200 Bank)
 * - Strict double-entry accounting posting via JournalEngine (Debit Cash/Bank, Credit 1300 AR)
 * - Optional auto-allocation to authoritative Sales Invoice for the order
 * - Deterministic idempotency preventing duplicate receipts on retry
 * - Reversal architecture integration: receipt reversal restores AR without deleting COD custody trail
 * - Strict separation: Warehouse/Admin handovers do NOT create customer receipts or affect AR
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN, OPERATIONAL_WAREHOUSE_ID } from './firebaseAdmin';
import { AdminSession } from '../src/types/admin';
import {
  CustomerReceipt,
  CustomerReceiptPaymentMethod,
  CustomerReceiptAllocation,
} from '../src/types/customerReceipt';
import { CODCollectionRecord, CODPaymentMethod } from '../src/types/delivery';
import { SalesInvoice } from '../src/types/invoice';
import { JournalEntry } from '../src/types/accounting';
import { CustomerReceiptService } from './customerReceiptService';
import { PartyLedgerService } from './partyLedgerService';
import { validatePeriodIsOpen } from './accountingPeriodService';
import { getNextJournalNumber } from './accountingSequenceService';
import { JournalEngine } from './journalEngine';
import crypto from 'crypto';

export const SYSTEM_COD_ADMIN_SESSION: AdminSession = {
  uid: 'mrfutkar_admin_root_super',
  email: 'ceo.mrfutkar@gmail.com',
  name: 'COD Settlement Engine',
  mobile: '+919810012345',
  role: 'SUPER_ADMIN',
  status: 'ACTIVE',
  permissionsVersion: 1,
};

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

export interface CreateOrLinkCodReceiptParams {
  orderId: string;
  collectionId?: string;
  deliveryPartnerId?: string;
  actorSession?: AdminSession;
  autoPost?: boolean;
  autoAllocateInvoice?: boolean;
  idempotencyKey?: string;
}

export interface CodReceiptBridgeResult {
  success: boolean;
  receipt: CustomerReceipt;
  journal?: JournalEntry | null;
  allocation?: {
    invoiceId: string;
    allocatedAmountPaise: number;
    invoicePaymentStatus: string;
  } | null;
  isIdempotentReplay: boolean;
  message?: string;
}

export class CodReceiptBridgeService {
  private static orderLocks = new Map<string, Promise<CodReceiptBridgeResult>>();

  /**
   * Helper: Record audit log for COD receipt events
   */
  private static async recordAudit(
    event: string,
    orderId: string,
    receiptId: string,
    metadata?: Record<string, any>
  ) {
    try {
      const now = new Date().toISOString();
      const logRef = doc(collection(db, 'deliveryAuditLogs'));
      await setDoc(logRef, {
        logId: logRef.id,
        orderId,
        receiptId,
        event,
        eventType: event,
        timestamp: now,
        createdAt: now,
        warehouseId: OPERATIONAL_WAREHOUSE_ID,
        metadata: metadata || {},
        _serverTxnToken: SERVER_TXN_TOKEN,
      });
    } catch (err: any) {
      console.warn('Note recording COD receipt audit:', err.message);
    }
  }

  /**
   * Authoritative entry point:
   * Create or Link exactly ONE canonical Customer Receipt for a collected COD order.
   * Concurrency-synchronized per orderId to strictly prevent duplicate receipts or journals.
   */
  public static async createOrLinkCodCustomerReceipt(
    params: CreateOrLinkCodReceiptParams
  ): Promise<CodReceiptBridgeResult> {
    const cleanOrderId = (params.orderId || '').trim();
    if (!cleanOrderId) {
      throw new Error('INVALID_ORDER_ID: orderId is required.');
    }

    const existingLock = this.orderLocks.get(cleanOrderId);
    if (existingLock) {
      await existingLock.catch(() => {});
    }

    const taskPromise = this.executeCreateOrLinkCodCustomerReceipt(params);
    this.orderLocks.set(cleanOrderId, taskPromise);

    try {
      return await taskPromise;
    } finally {
      this.orderLocks.delete(cleanOrderId);
    }
  }

  /**
   * Internal authoritative execution of COD Customer Receipt creation & settlement
   */
  private static async executeCreateOrLinkCodCustomerReceipt(
    params: CreateOrLinkCodReceiptParams
  ): Promise<CodReceiptBridgeResult> {
    const {
      orderId,
      deliveryPartnerId,
      actorSession = SYSTEM_COD_ADMIN_SESSION,
      autoPost = true,
      autoAllocateInvoice = true,
      idempotencyKey: rawIdempKey,
    } = params;

    if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
      throw new Error('INVALID_ORDER_ID: orderId is required.');
    }
    const cleanOrderId = orderId.trim();
    const cleanCollectionId = params.collectionId ? params.collectionId.trim() : `COL-${cleanOrderId}`;

    // 1. Idempotency Check: Existing receipt for this COD collection or order
    const existingReceipt = await this.getCodCustomerReceiptByOrderId(cleanOrderId);
    if (existingReceipt) {
      let existingJournal: JournalEntry | null = null;
      if (existingReceipt.journalId) {
        try {
          const jSnap = await getDoc(doc(db, 'journalEntries', existingReceipt.journalId));
          if (jSnap.exists()) {
            const { _serverTxnToken: _j, ...safeJ } = jSnap.data() as any;
            existingJournal = safeJ as JournalEntry;
          }
        } catch {
          // ignore
        }
      }

      return {
        success: true,
        receipt: existingReceipt,
        journal: existingJournal,
        isIdempotentReplay: true,
        message: existingReceipt.status === 'REVERSED'
          ? 'Canonical Customer Receipt for this COD collection is already REVERSED and cannot be replaced.'
          : 'Canonical Customer Receipt already exists for this COD collection.',
      };
    }

    // Secondary check: query customerReceipts by codCollectionId
    const qCol = query(
      collection(db, 'customerReceipts'),
      where('_serverTxnToken', '==', SERVER_TXN_TOKEN),
      where('codCollectionId', '==', cleanCollectionId)
    );
    const snapCol = await getDocs(qCol);
    if (!snapCol.empty) {
      const { _serverTxnToken, ...safeReceipt } = snapCol.docs[0].data() as any;
      return {
        success: true,
        receipt: safeReceipt as CustomerReceipt,
        isIdempotentReplay: true,
        message: 'Canonical Customer Receipt already linked to this COD collection.',
      };
    }

    // 2. Fetch authoritative Order
    const orderRef = doc(db, 'orders', cleanOrderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) {
      throw new Error(`ORDER_NOT_FOUND: Order "${cleanOrderId}" not found.`);
    }
    const orderData = orderSnap.data();

    // Verify order is COD
    const isCod = orderData.paymentMethod === 'COD' || orderData.payment?.method === 'COD';
    if (!isCod) {
      throw new Error(`NOT_COD_ORDER: Order "${cleanOrderId}" is not a Cash on Delivery order.`);
    }

    // 3. Fetch authoritative COD Collection record
    const colRef = doc(db, 'codCollections', cleanCollectionId);
    const colSnap = await getDoc(colRef);

    let authoritativePaymentMethod: CODPaymentMethod = 'CASH';
    let authoritativeAmountPaise = 0;
    let authoritativeRetailerId = orderData.retailerId;
    let referenceId: string | null = null;

    if (colSnap.exists()) {
      const colData = colSnap.data() as CODCollectionRecord;
      if (colData.collectionStatus !== 'COLLECTED') {
        throw new Error(
          `COD_NOT_COLLECTED: COD collection "${cleanCollectionId}" is in "${colData.collectionStatus}" status. Receipt requires COLLECTED status.`
        );
      }
      authoritativePaymentMethod = colData.paymentMethod || 'CASH';
      authoritativeAmountPaise = Number(colData.amountCollectedPaise || 0);
      authoritativeRetailerId = colData.retailerId || authoritativeRetailerId;
      referenceId = colData.referenceId || null;
    } else {
      // Fallback to order deliveryPayment snapshot if collection record is being created in same flow
      const deliveryPayment = orderData.deliveryPayment;
      if (deliveryPayment?.collectionStatus !== 'COLLECTED' && orderData.paymentStatus !== 'PAID') {
        throw new Error(
          `COD_NOT_COLLECTED: Order "${cleanOrderId}" has not been marked as COLLECTED/PAID.`
        );
      }

      authoritativePaymentMethod = deliveryPayment?.method === 'UPI' ? 'UPI' : 'CASH';
      const grandTotal = Number(orderData.grandTotal ?? orderData.total ?? 0);
      authoritativeAmountPaise = Math.round(grandTotal * 100);
      referenceId = deliveryPayment?.referenceId || null;
    }

    // Validate Authoritative Amount (positive integer paise > 0)
    if (
      !Number.isInteger(authoritativeAmountPaise) ||
      authoritativeAmountPaise <= 0
    ) {
      throw new Error(
        `INVALID_AUTHORITATIVE_AMOUNT: Authoritative COD amount must be a positive integer in paise. Found: ${authoritativeAmountPaise}`
      );
    }

    // 4. Resolve Canonical Retailer Identity
    if (!authoritativeRetailerId || typeof authoritativeRetailerId !== 'string') {
      throw new Error(`INVALID_RETAILER_ID: Order "${cleanOrderId}" lacks a valid retailerId.`);
    }
    const canonicalRetailerId =
      (await PartyLedgerService.resolveCanonicalRetailerId(authoritativeRetailerId)) ||
      authoritativeRetailerId.trim();

    // 5. Dual-Track Payment Method & Account Resolution
    const receiptPaymentMethod: CustomerReceiptPaymentMethod =
      authoritativePaymentMethod === 'UPI' ? 'UPI' : 'CASH';
    const cashBankAccountCode = receiptPaymentMethod === 'CASH' ? '1100' : '1200';

    // 6. Validate Accounting Period for Today's Date in Asia/Kolkata
    const receiptDate = CustomerReceiptService.getKolkataTodayDate();
    await validatePeriodIsOpen(receiptDate);

    // 7. Check or Record Deterministic Idempotency Key (Preferred: receipt_order_{orderId})
    const idempotencyKey =
      rawIdempKey || `receipt_order_${cleanOrderId}`;

    const cleanRefNum =
      referenceId ||
      (receiptPaymentMethod === 'UPI' ? `UPI-COL-${cleanOrderId}` : `COD-COL-${cleanOrderId}`);
    const notes = `COD collection payment for Order ${orderData.orderNumber || cleanOrderId} via ${receiptPaymentMethod}`;

    // 8. Create Customer Receipt via existing CustomerReceiptService (DRAFT)
    const createResult = await CustomerReceiptService.createCustomerReceipt(
      actorSession,
      {
        customerId: canonicalRetailerId,
        receiptDate,
        amountPaise: authoritativeAmountPaise,
        paymentMethod: receiptPaymentMethod,
        cashBankAccountCode,
        referenceNumber: cleanRefNum,
        notes,
        idempotencyKey,
        sourceOrderId: cleanOrderId,
        codCollectionId: cleanCollectionId,
      }
    );

    let postedReceipt: CustomerReceipt = createResult.receipt;
    let createdJournal: JournalEntry | null = null;

    // 9. Accounting Settlement: Post Receipt to Double-Entry Accounting via CustomerReceiptService
    if (autoPost && postedReceipt.status === 'DRAFT') {
      try {
        const postResult = await CustomerReceiptService.postCustomerReceipt(
          actorSession,
          postedReceipt.receiptId,
          { idempotencyKey: `post_${idempotencyKey}` }
        );
        postedReceipt = postResult.receipt;
        createdJournal = postResult.journal;
      } catch (err: any) {
        console.warn('Note posting COD receipt to accounting:', err.message);
        // Fallback: receipt remains in DRAFT for manual or async posting
      }
    }

    // 10. Invoice Settlement: Auto-allocate to Sales Invoice if one exists
    let allocationSummary: any = null;
    if (autoAllocateInvoice && postedReceipt.status === 'POSTED') {
      try {
        // Query salesInvoices for sourceOrderId
        const qInv = query(
          collection(db, 'salesInvoices'),
          where('_serverTxnToken', '==', SERVER_TXN_TOKEN),
          where('sourceOrderId', '==', cleanOrderId)
        );
        const invSnap = await getDocs(qInv);

        if (!invSnap.empty) {
          const invDoc = invSnap.docs[0].data() as SalesInvoice;
          const isInvoiceActive = invDoc.invoiceStatus === 'ISSUED' || invDoc.accountingStatus === 'POSTED';
          if (isInvoiceActive) {
            const invGrandTotalPaise = Math.round(Number(invDoc.grandTotal || 0) * 100);
            const invOutstandingPaise =
              typeof invDoc.outstandingAmountPaise === 'number'
                ? invDoc.outstandingAmountPaise
                : invGrandTotalPaise - Number(invDoc.paidAmountPaise || 0);

            if (invOutstandingPaise > 0) {
              const allocateAmtPaise = Math.min(
                postedReceipt.unallocatedAmountPaise,
                invOutstandingPaise
              );

              if (allocateAmtPaise > 0) {
                const allocRes = await CustomerReceiptService.allocateCustomerReceipt(
                  actorSession,
                  postedReceipt.receiptId,
                  {
                    allocations: [
                      {
                        invoiceId: invDoc.invoiceId,
                        amountPaise: allocateAmtPaise,
                      },
                    ],
                    idempotencyKey: `alloc_${idempotencyKey}`,
                  }
                );
                postedReceipt = allocRes.receipt;
                allocationSummary = {
                  invoiceId: invDoc.invoiceId,
                  allocatedAmountPaise: allocateAmtPaise,
                  invoicePaymentStatus:
                    allocateAmtPaise >= invOutstandingPaise ? 'PAID' : 'PARTIALLY_PAID',
                };
              }
            }
          }
        }
      } catch (err: any) {
        console.warn('Note auto-allocating COD receipt to invoice:', err.message);
      }
    }

    // 11. Link Customer Receipt to COD Collection & Order
    const now = new Date().toISOString();
    try {
      if (colSnap.exists()) {
        await updateDoc(colRef, {
          customerReceiptId: postedReceipt.receiptId,
          customerReceiptNumber: postedReceipt.receiptNumber,
          updatedAt: now,
        });
      }

      await updateDoc(orderRef, {
        'deliveryPayment.customerReceiptId': postedReceipt.receiptId,
        'deliveryPayment.customerReceiptNumber': postedReceipt.receiptNumber,
        customerReceiptId: postedReceipt.receiptId,
        updatedAt: now,
      });
    } catch (err: any) {
      console.warn('Note updating order/collection with customerReceiptId:', err.message);
    }

    // 12. Audit Log
    await this.recordAudit('COD_CUSTOMER_RECEIPT_LINKED', cleanOrderId, postedReceipt.receiptId, {
      receiptNumber: postedReceipt.receiptNumber,
      amountPaise: authoritativeAmountPaise,
      paymentMethod: receiptPaymentMethod,
      customerId: canonicalRetailerId,
      status: postedReceipt.status,
      journalId: postedReceipt.journalId,
      deliveryPartnerId,
    });

    const { _serverTxnToken, ...safeReceipt } = postedReceipt as any;

    return {
      success: true,
      receipt: safeReceipt as CustomerReceipt,
      journal: createdJournal,
      allocation: allocationSummary,
      isIdempotentReplay: Boolean(createResult.isIdempotentReplay),
      message: 'Canonical Customer Receipt created and linked successfully.',
    };
  }

  /**
   * Retrieve the canonical Customer Receipt for a given Order ID
   */
  public static async getCodCustomerReceiptByOrderId(
    orderId: string
  ): Promise<CustomerReceipt | null> {
    if (!orderId || typeof orderId !== 'string') return null;
    const cleanId = orderId.trim();

    // 1. Direct query on customerReceipts by sourceOrderId
    const q = query(
      collection(db, 'customerReceipts'),
      where('_serverTxnToken', '==', SERVER_TXN_TOKEN),
      where('sourceOrderId', '==', cleanId)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const { _serverTxnToken, ...safeReceipt } = snap.docs[0].data() as any;
      return safeReceipt as CustomerReceipt;
    }

    // 2. Query through codCollections
    try {
      const colSnap = await getDoc(doc(db, 'codCollections', `COL-${cleanId}`));
      if (colSnap.exists()) {
        const colData = colSnap.data() as CODCollectionRecord;
        if (colData.customerReceiptId) {
          const rSnap = await getDoc(doc(db, 'customerReceipts', colData.customerReceiptId));
          if (rSnap.exists()) {
            const { _serverTxnToken, ...safeReceipt } = rSnap.data() as any;
            return safeReceipt as CustomerReceipt;
          }
        }
      }
    } catch {
      // ignore
    }

    return null;
  }

  /**
   * Retrieve the canonical Customer Receipt for a given COD Collection ID
   */
  public static async getCodCustomerReceiptByCollectionId(
    collectionId: string
  ): Promise<CustomerReceipt | null> {
    if (!collectionId || typeof collectionId !== 'string') return null;
    const cleanId = collectionId.trim();

    const q = query(
      collection(db, 'customerReceipts'),
      where('_serverTxnToken', '==', SERVER_TXN_TOKEN),
      where('codCollectionId', '==', cleanId)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const { _serverTxnToken, ...safeReceipt } = snap.docs[0].data() as any;
      return safeReceipt as CustomerReceipt;
    }

    // Check directly by looking up collection record
    try {
      const colSnap = await getDoc(doc(db, 'codCollections', cleanId));
      if (colSnap.exists()) {
        const colData = colSnap.data() as CODCollectionRecord;
        if (colData.customerReceiptId) {
          const rSnap = await getDoc(doc(db, 'customerReceipts', colData.customerReceiptId));
          if (rSnap.exists()) {
            const { _serverTxnToken, ...safeReceipt } = rSnap.data() as any;
            return safeReceipt as CustomerReceipt;
          }
        }
      }
    } catch {
      // ignore
    }

    return null;
  }

  /**
   * Reversal: Reverse a COD Customer Receipt through existing CustomerReceiptService reversal architecture.
   * STRICT GUARANTEE: Does NOT delete or alter COD Collection record or delivery physical custody!
   */
  public static async reverseCodCustomerReceipt(params: {
    receiptId: string;
    reason: string;
    adminSession: AdminSession;
    idempotencyKey?: string;
  }): Promise<{
    receipt: CustomerReceipt;
    reversalJournal?: JournalEntry;
    isIdempotentReplay?: boolean;
    codCollectionIntact: boolean;
  }> {
    const { receiptId, reason, adminSession, idempotencyKey } = params;

    // Execute standard CustomerReceipt reversal
    const result = await CustomerReceiptService.reverseCustomerReceipt(
      adminSession,
      receiptId,
      { reason, idempotencyKey }
    );

    // Verify operational COD collection remains untouched and intact
    let codCollectionIntact = true;
    if (result.receipt.sourceOrderId) {
      try {
        const colSnap = await getDoc(
          doc(db, 'codCollections', `COL-${result.receipt.sourceOrderId}`)
        );
        if (colSnap.exists()) {
          const colData = colSnap.data() as CODCollectionRecord;
          // Operational collection status must remain COLLECTED (physical handover history preserved)
          codCollectionIntact = colData.collectionStatus === 'COLLECTED';
        }
      } catch {
        // ignore
      }
    }

    return {
      receipt: result.receipt,
      reversalJournal: result.reversalJournal,
      isIdempotentReplay: result.isIdempotentReplay,
      codCollectionIntact,
    };
  }
}
