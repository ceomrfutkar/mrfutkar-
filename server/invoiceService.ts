/**
 * MR FUTKAR — Sales & Purchase Invoice Service (Phase 5.5 Part 1)
 * Authoritative Business Logic, Snapshots, Lifecycle State Machine, & Audit Integration
 */

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
import { AdminSession } from '../src/types/admin';
import {
  SalesInvoice,
  SalesInvoiceItem,
  SalesInvoiceItemInput,
  PurchaseInvoice,
  PurchaseInvoiceItem,
  PurchaseInvoiceItemInput,
  InvoiceAddressSnapshot,
  calculateSalesInvoiceTotals,
  calculatePurchaseInvoiceTotals,
} from '../src/types/invoice';
import { getNextInvoiceNumber } from './invoiceSequenceService';
import { PricingEngine } from '../src/services/pricingEngine';
import { Product, ProductPricingRule } from '../src/types/product';
import {
  Account,
  AccountType,
  NormalBalance,
  JournalEntry,
  JournalLinePayload,
} from '../src/types/accounting';
import { AdminUser } from '../src/types/admin';
import { JournalEngine } from './journalEngine';
import { validatePeriodIsOpen } from './accountingPeriodService';

export interface SalesInvoiceListFilters {
  search?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  customerId?: string;
  invoiceNumber?: string;
  sourceOrderId?: string;
  page?: number;
  pageSize?: number;
}

export interface PurchaseInvoiceListFilters {
  search?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  supplierId?: string;
  invoiceNumber?: string;
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

export class InvoiceService {
  /**
   * Helper: Resolve Customer and create Authoritative Address Snapshots
   */
  private static async resolveCustomerSnapshot(
    customerId: string,
    billingInput?: Partial<InvoiceAddressSnapshot>,
    shippingInput?: Partial<InvoiceAddressSnapshot>
  ): Promise<{
    retailerData: any;
    billingSnapshot: InvoiceAddressSnapshot;
    shippingSnapshot: InvoiceAddressSnapshot;
  }> {
    if (!customerId || typeof customerId !== 'string' || !customerId.trim()) {
      throw new Error('INVALID_CUSTOMER_ID: customerId is required.');
    }

    const trimmedId = customerId.trim();
    const retailerRef = doc(db, 'retailers', trimmedId);
    const retailerSnap = await getDoc(retailerRef);

    if (!retailerSnap.exists()) {
      throw new Error(`CUSTOMER_NOT_FOUND: Retailer "${trimmedId}" does not exist in authoritative customer master.`);
    }

    const data = retailerSnap.data();

    const billingSnapshot: InvoiceAddressSnapshot = {
      businessName: (billingInput?.businessName || data.shopName || data.ownerName || 'Kirana Store').trim(),
      contactName: (billingInput?.contactName || data.ownerName || 'Kirana Owner').trim(),
      mobile: (billingInput?.mobile || data.mobileNumber || data.phone || '').trim(),
      fullAddress: (billingInput?.fullAddress || data.shopAddress || data.deliveryAddress || 'Delhi').trim(),
      city: (billingInput?.city || data.city || 'Delhi').trim(),
      state: (billingInput?.state || data.state || 'Delhi').trim(),
      pincode: (billingInput?.pincode || data.pincode || '110053').trim(),
    };
    if (billingInput?.landmark || data.landmark) {
      billingSnapshot.landmark = (billingInput?.landmark || data.landmark)?.trim();
    }
    if (billingInput?.gstin || data.gstNumber || data.gstin) {
      billingSnapshot.gstin = (billingInput?.gstin || data.gstNumber || data.gstin)?.trim();
    }

    const shippingSnapshot: InvoiceAddressSnapshot = {
      businessName: (shippingInput?.businessName || billingSnapshot.businessName).trim(),
      contactName: (shippingInput?.contactName || billingSnapshot.contactName).trim(),
      mobile: (shippingInput?.mobile || billingSnapshot.mobile).trim(),
      fullAddress: (shippingInput?.fullAddress || billingSnapshot.fullAddress).trim(),
      city: (shippingInput?.city || billingSnapshot.city).trim(),
      state: (shippingInput?.state || billingSnapshot.state || 'Delhi').trim(),
      pincode: (shippingInput?.pincode || billingSnapshot.pincode).trim(),
    };
    if (shippingInput?.landmark || billingSnapshot.landmark) {
      shippingSnapshot.landmark = (shippingInput?.landmark || billingSnapshot.landmark)?.trim();
    }
    if (shippingInput?.gstin || billingSnapshot.gstin) {
      shippingSnapshot.gstin = (shippingInput?.gstin || billingSnapshot.gstin)?.trim();
    }

    return { retailerData: data, billingSnapshot, shippingSnapshot };
  }

  /**
   * Helper: Resolve Authoritative Account from Chart of Accounts
   */
  private static async getAuthoritativeAccount(
    code: string,
    expectedType?: AccountType,
    expectedNormalBalance?: NormalBalance
  ): Promise<Account> {
    const q = query(
      collection(db, 'chartOfAccounts'),
      where('accountCode', '==', code)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      throw new Error(`ACCOUNT_NOT_FOUND: Required account "${code}" not found in Chart of Accounts.`);
    }
    const account = snap.docs[0].data() as Account;
    if (!account.isActive) {
      throw new Error(`INACTIVE_ACCOUNT: Account "${code}" (${account.accountName}) is marked inactive.`);
    }
    if (expectedType && account.accountType !== expectedType) {
      throw new Error(
        `ACCOUNT_TYPE_MISMATCH: Account "${code}" expected type ${expectedType}, found ${account.accountType}.`
      );
    }
    if (expectedNormalBalance && account.normalBalance !== expectedNormalBalance) {
      throw new Error(
        `NORMAL_BALANCE_MISMATCH: Account "${code}" expected normal balance ${expectedNormalBalance}, found ${account.normalBalance}.`
      );
    }
    return account;
  }

  /**
   * Helper: Resolve Product Snapshots for sales line items with PricingEngine integration
   */
  private static async resolveSalesProductSnapshots(
    items: SalesInvoiceItemInput[],
    customerId?: string
  ): Promise<SalesInvoiceItem[]> {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('INVALID_ITEMS: Sales invoice must contain at least one item.');
    }

    const enriched = await Promise.all(
      items.map(async (item, idx) => {
        const lineNum = idx + 1;
        if (!item.productId || typeof item.productId !== 'string' || !item.productId.trim()) {
          throw new Error(`INVALID_ITEM_PRODUCT: Item at line ${lineNum} is missing productId.`);
        }
        const pId = item.productId.trim();

        const pRef = doc(db, 'products', pId);
        const pSnap = await getDoc(pRef);
        if (!pSnap.exists()) {
          throw new Error(`PRODUCT_NOT_FOUND: Product "${pId}" at line ${lineNum} not found in authoritative products collection.`);
        }
        const pData = pSnap.data() as Product;

        const qty = Number(item.quantity);
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new Error(`INVALID_ITEM_QUANTITY: Line ${lineNum} quantity must be a positive number greater than zero.`);
        }

        // Authoritative pricing resolution via PricingEngine
        let unitPrice: number;
        if (item.unitPrice !== undefined && item.unitPrice !== null) {
          const p = Number(item.unitPrice);
          if (!Number.isFinite(p) || p < 0) {
            throw new Error(`INVALID_ITEM_PRICE: Line ${lineNum} unitPrice must be a non-negative number.`);
          }
          unitPrice = p;
        } else {
          let rules: ProductPricingRule[] = [];
          try {
            const qRules = query(
              collection(db, 'productPricing'),
              where('productId', '==', pId),
              where('active', '==', true)
            );
            const rulesSnap = await getDocs(qRules);
            rules = rulesSnap.docs.map(d => d.data() as ProductPricingRule);
          } catch {
            // rules remains empty
          }

          const resolved = PricingEngine.resolveProductPrice({
            product: pData,
            quantity: qty,
            retailerId: customerId,
            customerPricingRules: rules,
          });
          unitPrice = resolved.unitPrice;
        }

        const sku = item.skuSnapshot || pData.sku || pId;
        const name = item.productNameSnapshot || pData.productName || pData.shortName || (pData as any).name || 'Product';
        const discountAmount = Math.max(0, Number(item.discountAmount) || 0);
        const taxRate = Math.max(0, Number(item.taxRate) || 0);

        return {
          productId: pId,
          skuSnapshot: sku,
          productNameSnapshot: name,
          quantity: qty,
          unitPrice,
          discountAmount,
          taxRate,
          taxableAmount: 0,
          taxAmount: 0,
          lineTotal: 0,
        };
      })
    );

    return enriched;
  }

  /**
   * Helper: Resolve Product Snapshots for generic / purchase invoice line items
   */
  private static async resolveProductSnapshots(
    items: Array<{ productId: string; skuSnapshot?: string; productNameSnapshot?: string; [key: string]: any }>
  ): Promise<Array<any>> {
    const enriched = await Promise.all(
      items.map(async (item, idx) => {
        if (!item.productId || typeof item.productId !== 'string') {
          throw new Error(`INVALID_ITEM_PRODUCT: Item at line ${idx + 1} is missing productId.`);
        }
        const pId = item.productId.trim();
        let sku = item.skuSnapshot;
        let name = item.productNameSnapshot;

        try {
          const pRef = doc(db, 'products', pId);
          const pSnap = await getDoc(pRef);
          if (pSnap.exists()) {
            const pData = pSnap.data();
            sku = sku || pData.sku || pId;
            name = name || pData.productName || pData.name || pData.title || 'Product';
          }
        } catch {
          // Fallback to provided or generic
        }

        return {
          ...item,
          productId: pId,
          skuSnapshot: sku || pId,
          productNameSnapshot: name || `Product ${pId}`,
        };
      })
    );

    return enriched;
  }

  // =========================================================================
  // SALES INVOICES
  // =========================================================================

  /**
   * Create a new Sales Invoice (DRAFT)
   */
  public static async createSalesInvoice(
    adminSession: AdminSession,
    payload: {
      invoiceDate?: string;
      customerId: string;
      sourceOrderId?: string | null;
      items: SalesInvoiceItemInput[];
      billingAddressSnapshot?: Partial<InvoiceAddressSnapshot>;
      shippingAddressSnapshot?: Partial<InvoiceAddressSnapshot>;
      idempotencyKey?: string | null;
    },
    req?: Request
  ): Promise<SalesInvoice> {
    // 1. Idempotency Check
    const trimmedIdempKey = payload.idempotencyKey ? String(payload.idempotencyKey).trim() : null;
    if (trimmedIdempKey) {
      const q = query(
        collection(db, 'salesInvoices'),
        where('idempotencyKey', '==', trimmedIdempKey)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const existing = snap.docs[0].data() as SalesInvoice;
        return existing;
      }
    }

    // 2. Validate and Snapshot Customer
    const { billingSnapshot, shippingSnapshot } = await this.resolveCustomerSnapshot(
      payload.customerId,
      payload.billingAddressSnapshot,
      payload.shippingAddressSnapshot
    );

    // 3. Source Order Verification (if provided)
    let verifiedSourceOrderId: string | null = null;
    if (payload.sourceOrderId && typeof payload.sourceOrderId === 'string' && payload.sourceOrderId.trim()) {
      const oId = payload.sourceOrderId.trim();
      const orderRef = doc(db, 'orders', oId);
      const orderSnap = await getDoc(orderRef);

      if (!orderSnap.exists()) {
        throw new Error(`ORDER_NOT_FOUND: Source order "${oId}" does not exist in authoritative orders collection.`);
      }

      const orderData = orderSnap.data();
      const orderRetailerId = orderData.retailerId || orderData.customerId;
      if (orderRetailerId && orderRetailerId !== payload.customerId.trim()) {
        throw new Error(
          `ORDER_CUSTOMER_MISMATCH: Order "${oId}" belongs to retailer "${orderRetailerId}", not customer "${payload.customerId}".`
        );
      }
      if (orderData.warehouseId && orderData.warehouseId !== OPERATIONAL_WAREHOUSE_ID) {
        throw new Error(
          `ORDER_WAREHOUSE_MISMATCH: Order "${oId}" warehouse "${orderData.warehouseId}" does not match hub "${OPERATIONAL_WAREHOUSE_ID}".`
        );
      }
      if (orderData.orderStatus === 'CANCELLED') {
        throw new Error(`ORDER_NOT_ELIGIBLE: Cannot invoice cancelled order "${oId}".`);
      }
      verifiedSourceOrderId = oId;
    }

    // 4. Validate Items and Compute Authoritative Totals
    const enrichedItems = await this.resolveSalesProductSnapshots(payload.items || [], payload.customerId);
    const calculated = calculateSalesInvoiceTotals(enrichedItems);

    // 5. Generate Server-Authoritative Invoice Number
    const invoiceNumber = await getNextInvoiceNumber('SALES');

    // 6. Assemble Immutable Snapshot Record
    const now = new Date().toISOString();
    const invoiceDate = (payload.invoiceDate || now.split('T')[0]).trim();
    const invoiceId = `inv_sales_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const newInvoice: SalesInvoice & { _serverTxnToken: string } = {
      invoiceId,
      invoiceNumber,
      invoiceDate,
      invoiceStatus: 'DRAFT',
      customerId: payload.customerId.trim(),
      customerType: 'RETAILER',
      sourceOrderId: verifiedSourceOrderId,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      billingAddressSnapshot: billingSnapshot,
      shippingAddressSnapshot: shippingSnapshot,
      items: calculated.items,
      subtotal: calculated.subtotal,
      discountTotal: calculated.discountTotal,
      taxableTotal: calculated.taxableTotal,
      taxTotal: calculated.taxTotal,
      grandTotal: calculated.grandTotal,
      paymentStatus: 'UNPAID',
      accountingStatus: 'NOT_POSTED',
      createdAt: now,
      createdBy: adminSession.uid,
      updatedAt: now,
      updatedBy: adminSession.uid,
      version: 1,
      idempotencyKey: trimmedIdempKey,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    // 7. Persist to Firestore
    await setDoc(doc(db, 'salesInvoices', invoiceId), cleanDocData(newInvoice));

    // 8. Audit Log
    await logAdminAudit({
      action: 'SALES_INVOICE_CREATED',
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'SALES_INVOICE',
      targetId: invoiceId,
      metadata: {
        invoiceNumber,
        customerId: newInvoice.customerId,
        sourceOrderId: newInvoice.sourceOrderId,
        grandTotal: newInvoice.grandTotal,
      },
      req,
    });

    const { _serverTxnToken, ...sanitized } = newInvoice;
    return sanitized;
  }

  /**
   * Update an existing Sales Invoice (Draft only)
   */
  public static async updateSalesInvoice(
    adminSession: AdminSession,
    invoiceId: string,
    payload: {
      invoiceDate?: string;
      items?: SalesInvoiceItemInput[];
      billingAddressSnapshot?: Partial<InvoiceAddressSnapshot>;
      shippingAddressSnapshot?: Partial<InvoiceAddressSnapshot>;
    },
    req?: Request
  ): Promise<SalesInvoice> {
    const invoiceRef = doc(db, 'salesInvoices', invoiceId);
    const invoiceSnap = await getDoc(invoiceRef);

    if (!invoiceSnap.exists()) {
      throw new Error(`INVOICE_NOT_FOUND: Sales invoice "${invoiceId}" not found.`);
    }

    const current = invoiceSnap.data() as SalesInvoice;

    if (current.invoiceStatus === 'ISSUED' || current.invoiceStatus === 'CANCELLED') {
      throw new Error(
        `INVOICE_IMMUTABLE: Cannot update sales invoice "${current.invoiceNumber}" with status "${current.invoiceStatus}".`
      );
    }

    const now = new Date().toISOString();
    let updatedItems = current.items;
    let totals = {
      subtotal: current.subtotal,
      discountTotal: current.discountTotal,
      taxableTotal: current.taxableTotal,
      taxTotal: current.taxTotal,
      grandTotal: current.grandTotal,
    };

    if (payload.items && payload.items.length > 0) {
      const enrichedItems = await this.resolveSalesProductSnapshots(payload.items, current.customerId);
      const calculated = calculateSalesInvoiceTotals(enrichedItems);
      updatedItems = calculated.items;
      totals = {
        subtotal: calculated.subtotal,
        discountTotal: calculated.discountTotal,
        taxableTotal: calculated.taxableTotal,
        taxTotal: calculated.taxTotal,
        grandTotal: calculated.grandTotal,
      };
    }

    const updatedBilling = payload.billingAddressSnapshot
      ? { ...current.billingAddressSnapshot, ...payload.billingAddressSnapshot }
      : current.billingAddressSnapshot;

    const updatedShipping = payload.shippingAddressSnapshot
      ? { ...current.shippingAddressSnapshot, ...payload.shippingAddressSnapshot }
      : current.shippingAddressSnapshot;

    const updatedInvoice: SalesInvoice & { _serverTxnToken: string } = {
      ...current,
      invoiceDate: payload.invoiceDate ? payload.invoiceDate.trim() : current.invoiceDate,
      billingAddressSnapshot: updatedBilling,
      shippingAddressSnapshot: updatedShipping,
      items: updatedItems,
      ...totals,
      updatedAt: now,
      updatedBy: adminSession.uid,
      version: (current.version || 1) + 1,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    await setDoc(invoiceRef, cleanDocData(updatedInvoice));

    await logAdminAudit({
      action: 'SALES_INVOICE_UPDATED',
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'SALES_INVOICE',
      targetId: invoiceId,
      metadata: {
        invoiceNumber: current.invoiceNumber,
        grandTotal: updatedInvoice.grandTotal,
      },
      req,
    });

    const { _serverTxnToken, ...sanitized } = updatedInvoice;
    return sanitized;
  }

  private static issueInvoiceLocks = new Map<string, Promise<SalesInvoice>>();

  /**
   * Transition Sales Invoice from DRAFT to ISSUED and atomically post to Double-Entry Accounting Journal
   */
  public static async issueSalesInvoice(
    adminSession: AdminSession,
    invoiceId: string,
    req?: Request
  ): Promise<SalesInvoice> {
    if (this.issueInvoiceLocks.has(invoiceId)) {
      return await this.issueInvoiceLocks.get(invoiceId)!;
    }

    const promise = this.executeIssueSalesInvoice(adminSession, invoiceId, req);
    this.issueInvoiceLocks.set(invoiceId, promise);
    try {
      return await promise;
    } finally {
      this.issueInvoiceLocks.delete(invoiceId);
    }
  }

  private static async executeIssueSalesInvoice(
    adminSession: AdminSession,
    invoiceId: string,
    req?: Request
  ): Promise<SalesInvoice> {
    const invoiceRef = doc(db, 'salesInvoices', invoiceId);
    const invoiceSnap = await getDoc(invoiceRef);

    if (!invoiceSnap.exists()) {
      throw new Error(`INVOICE_NOT_FOUND: Sales invoice "${invoiceId}" not found.`);
    }

    const current = invoiceSnap.data() as SalesInvoice;

    // Idempotency: If already issued and accounting is posted, return cleanly
    if (current.invoiceStatus === 'ISSUED' && current.accountingStatus === 'POSTED') {
      const { _serverTxnToken, ...sanitized } = current as any;
      return sanitized;
    }

    if (current.invoiceStatus === 'CANCELLED') {
      throw new Error(`CANNOT_ISSUE_CANCELLED_INVOICE: Cannot issue a cancelled sales invoice.`);
    }

    // 1. Verify Customer exists in authoritative customer master
    const customerSnap = await getDoc(doc(db, 'retailers', current.customerId));
    if (!customerSnap.exists()) {
      throw new Error(`CUSTOMER_NOT_FOUND: Customer retailer "${current.customerId}" does not exist in authoritative customer master.`);
    }

    // 2. Verify Invoice Number exists
    if (!current.invoiceNumber || !current.invoiceNumber.trim()) {
      throw new Error('INVALID_INVOICE_NUMBER: Invoice number is missing or empty.');
    }

    // 3. Verify Items and Recalculate Totals Server-Side
    if (!Array.isArray(current.items) || current.items.length === 0) {
      throw new Error('INVALID_ITEMS: Sales invoice must contain at least one valid item to issue.');
    }
    const calculated = calculateSalesInvoiceTotals(current.items);

    // 4. Verify Accounting Period is OPEN
    await validatePeriodIsOpen(current.invoiceDate);

    // 5. Account Mapping: Resolve Accounts by accountCode
    const accReceivable = await this.getAuthoritativeAccount('1300', 'ASSET', 'DEBIT');
    const accRevenue = await this.getAuthoritativeAccount('4100', 'INCOME', 'CREDIT');
    let accOutputGst: Account | null = null;
    if (calculated.taxTotal > 0) {
      accOutputGst = await this.getAuthoritativeAccount('2200', 'LIABILITY', 'CREDIT');
    }

    // 6. Idempotent Accounting Journal Generation
    const qExisting = query(
      collection(db, 'journalEntries'),
      where('referenceType', '==', 'SALES_INVOICE'),
      where('referenceId', '==', invoiceId)
    );
    const existingJournalSnap = await getDocs(qExisting);
    let journal: JournalEntry;

    if (!existingJournalSnap.empty) {
      journal = existingJournalSnap.docs[0].data() as JournalEntry;
      if (journal.status === 'DRAFT') {
        const postedRes = await JournalEngine.postJournal(
          {
            uid: adminSession.uid,
            email: adminSession.email || 'admin@mrfutkar.in',
            name: adminSession.name || 'Authoritative Admin',
            mobile: adminSession.mobile || '+919999999999',
            role: (adminSession.role as any) || 'SUPER_ADMIN',
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: 'SYSTEM',
          },
          journal.journalId,
          req
        );
        journal = postedRes.journal;
      }
    } else {
      // Build double-entry lines
      const journalLines: JournalLinePayload[] = [];
      if (calculated.taxTotal > 0) {
        journalLines.push({
          accountId: accReceivable.accountId,
          debit: calculated.grandTotal,
          credit: 0,
          description: `Accounts Receivable for Sales Invoice ${current.invoiceNumber}`,
          customerId: current.customerId,
        });
        journalLines.push({
          accountId: accRevenue.accountId,
          debit: 0,
          credit: calculated.taxableTotal,
          description: `Sales Revenue for Sales Invoice ${current.invoiceNumber}`,
          customerId: current.customerId,
        });
        journalLines.push({
          accountId: accOutputGst!.accountId,
          debit: 0,
          credit: calculated.taxTotal,
          description: `Output GST on Sales Invoice ${current.invoiceNumber}`,
          customerId: current.customerId,
        });
      } else {
        journalLines.push({
          accountId: accReceivable.accountId,
          debit: calculated.grandTotal,
          credit: 0,
          description: `Accounts Receivable for Sales Invoice ${current.invoiceNumber}`,
          customerId: current.customerId,
        });
        journalLines.push({
          accountId: accRevenue.accountId,
          debit: 0,
          credit: calculated.grandTotal,
          description: `Sales Revenue for Sales Invoice ${current.invoiceNumber}`,
          customerId: current.customerId,
        });
      }

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

      const draftResult = await JournalEngine.createDraftJournal(
        adminUserObj,
        {
          journalDate: current.invoiceDate,
          voucherType: 'JOURNAL',
          referenceType: 'SALES_INVOICE',
          referenceId: invoiceId,
          narration: `Sales Invoice ${current.invoiceNumber} for ${current.billingAddressSnapshot?.businessName || current.customerId}`,
          lines: journalLines,
        },
        req
      );

      const postedResult = await JournalEngine.postJournal(adminUserObj, draftResult.journal.journalId, req);
      journal = postedResult.journal;
    }

    // 7. Update Sales Invoice document atomically with accounting linkage
    const now = new Date().toISOString();
    const issuedInvoice: SalesInvoice & { _serverTxnToken: string } = {
      ...current,
      invoiceStatus: 'ISSUED',
      accountingStatus: 'POSTED',
      accountingJournalId: journal.journalId,
      accountingVoucherNumber: journal.journalNumber,
      accountingPostedAt: journal.postedAt || now,
      updatedAt: now,
      updatedBy: adminSession.uid,
      version: (current.version || 1) + 1,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    await setDoc(invoiceRef, cleanDocData(issuedInvoice));

    // 8. Audits
    await logAdminAudit({
      action: 'SALES_INVOICE_ISSUED' as any,
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'SALES_INVOICE',
      targetId: invoiceId,
      metadata: {
        invoiceNumber: current.invoiceNumber,
        grandTotal: current.grandTotal,
      },
      req,
    });

    await logAdminAudit({
      action: 'SALES_INVOICE_ACCOUNTING_POSTED' as any,
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'SALES_INVOICE',
      targetId: invoiceId,
      metadata: {
        invoiceId,
        invoiceNumber: current.invoiceNumber,
        journalId: journal.journalId,
        voucherNumber: journal.journalNumber,
        grandTotal: current.grandTotal,
        adminUid: adminSession.uid,
      },
      req,
    });

    const { _serverTxnToken, ...sanitized } = issuedInvoice;
    return sanitized;
  }

  /**
   * Cancel a Sales Invoice (Idempotent & Audited, never deletes document)
   */
  public static async cancelSalesInvoice(
    adminSession: AdminSession,
    invoiceId: string,
    reason?: string,
    req?: Request
  ): Promise<SalesInvoice> {
    const invoiceRef = doc(db, 'salesInvoices', invoiceId);
    const invoiceSnap = await getDoc(invoiceRef);

    if (!invoiceSnap.exists()) {
      throw new Error(`INVOICE_NOT_FOUND: Sales invoice "${invoiceId}" not found.`);
    }

    const current = invoiceSnap.data() as SalesInvoice;

    if (current.invoiceStatus === 'CANCELLED') {
      return current; // Idempotent
    }

    const now = new Date().toISOString();
    const cancelledInvoice: SalesInvoice & { _serverTxnToken: string } = {
      ...current,
      invoiceStatus: 'CANCELLED',
      updatedAt: now,
      updatedBy: adminSession.uid,
      version: (current.version || 1) + 1,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    await setDoc(invoiceRef, cleanDocData(cancelledInvoice));

    await logAdminAudit({
      action: 'SALES_INVOICE_CANCELLED',
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'SALES_INVOICE',
      targetId: invoiceId,
      metadata: {
        invoiceNumber: current.invoiceNumber,
        reason: reason || 'Admin cancelled',
      },
      req,
    });

    const { _serverTxnToken, ...sanitized } = cancelledInvoice;
    return sanitized;
  }

  /**
   * Get Sales Invoice by ID
   */
  public static async getSalesInvoiceById(
    invoiceId: string,
    adminSession?: AdminSession,
    req?: Request
  ): Promise<SalesInvoice | null> {
    const invoiceRef = doc(db, 'salesInvoices', invoiceId);
    const invoiceSnap = await getDoc(invoiceRef);

    if (!invoiceSnap.exists()) {
      return null;
    }

    const data = invoiceSnap.data() as SalesInvoice & { _serverTxnToken?: string };
    const { _serverTxnToken, ...sanitized } = data;

    if (adminSession) {
      await logAdminAudit({
        action: 'SALES_INVOICE_VIEWED',
        adminUid: adminSession.uid,
        adminName: adminSession.name,
        targetType: 'SALES_INVOICE',
        targetId: invoiceId,
        req,
      });
    }

    return sanitized;
  }

  /**
   * List Sales Invoices with Server-Side Filtering and Pagination (Max 100)
   */
  public static async listSalesInvoices(
    filters: SalesInvoiceListFilters
  ): Promise<{ invoices: SalesInvoice[]; total: number }> {
    const pageSize = Math.min(Math.max(Number(filters.pageSize || 20), 1), 100);
    const page = Math.max(Number(filters.page || 1), 1);

    // Fetch snapshot
    const q = query(collection(db, 'salesInvoices'), orderBy('createdAt', 'desc'), limit(300));
    const snap = await getDocs(q);

    let all: SalesInvoice[] = [];
    snap.forEach((d) => {
      const data = d.data() as SalesInvoice & { _serverTxnToken?: string };
      const { _serverTxnToken, ...clean } = data;
      all.push(clean);
    });

    // Apply Server-Side Filters
    if (filters.status) {
      const st = filters.status.toUpperCase();
      all = all.filter((inv) => inv.invoiceStatus === st);
    }

    if (filters.customerId) {
      const cId = filters.customerId.trim().toLowerCase();
      all = all.filter((inv) => inv.customerId.toLowerCase() === cId);
    }

    if (filters.invoiceNumber) {
      const num = filters.invoiceNumber.trim().toUpperCase();
      all = all.filter((inv) => inv.invoiceNumber.toUpperCase().includes(num));
    }

    if (filters.sourceOrderId) {
      const oId = filters.sourceOrderId.trim();
      all = all.filter((inv) => inv.sourceOrderId === oId);
    }

    if (filters.fromDate) {
      all = all.filter((inv) => inv.invoiceDate >= filters.fromDate!);
    }

    if (filters.toDate) {
      all = all.filter((inv) => inv.invoiceDate <= filters.toDate!);
    }

    if (filters.search) {
      const s = filters.search.trim().toLowerCase();
      all = all.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(s) ||
          inv.billingAddressSnapshot.businessName.toLowerCase().includes(s) ||
          inv.billingAddressSnapshot.contactName.toLowerCase().includes(s) ||
          inv.customerId.toLowerCase().includes(s) ||
          (inv.sourceOrderId && inv.sourceOrderId.toLowerCase().includes(s))
      );
    }

    const total = all.length;
    const startIndex = (page - 1) * pageSize;
    const paginated = all.slice(startIndex, startIndex + pageSize);

    return { invoices: paginated, total };
  }

  // =========================================================================
  // PURCHASE INVOICES
  // =========================================================================

  /**
   * Create a new Purchase Invoice (DRAFT)
   */
  public static async createPurchaseInvoice(
    adminSession: AdminSession,
    payload: {
      invoiceDate?: string;
      supplierId?: string | null;
      supplierType?: string;
      supplierInvoiceNumber?: string | null;
      items: PurchaseInvoiceItemInput[];
      billingAddressSnapshot?: Partial<InvoiceAddressSnapshot>;
      shippingAddressSnapshot?: Partial<InvoiceAddressSnapshot>;
      idempotencyKey?: string | null;
    },
    req?: Request
  ): Promise<PurchaseInvoice> {
    // 0. Injection checks
    const rawPayload = payload as any;
    if (
      rawPayload.totalDebit !== undefined ||
      rawPayload.totalCredit !== undefined ||
      rawPayload.accountingJournalId !== undefined ||
      rawPayload.accountingVoucherNumber !== undefined ||
      rawPayload.accountingStatus !== undefined ||
      rawPayload.accountingPostedAt !== undefined
    ) {
      throw new Error(
        'CLIENT_ACCOUNTING_INJECTION_FORBIDDEN: Client cannot inject accounting fields (totalDebit, totalCredit, accountingJournalId, accountingVoucherNumber, accountingStatus, accountingPostedAt).'
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
        'CLIENT_TOTAL_INJECTION_FORBIDDEN: Purchase invoice totals are calculated server-side.'
      );
    }

    // 1. Idempotency Check
    const trimmedIdempKey = payload.idempotencyKey ? String(payload.idempotencyKey).trim() : null;
    if (trimmedIdempKey) {
      const q = query(
        collection(db, 'purchaseInvoices'),
        where('idempotencyKey', '==', trimmedIdempKey)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const existing = snap.docs[0].data() as PurchaseInvoice;
        return existing;
      }
    }

    // 2. Validate Items and Compute Authoritative Totals
    const enrichedItems = await this.resolveProductSnapshots(payload.items || []);
    const calculated = calculatePurchaseInvoiceTotals(enrichedItems);

    // 3. Generate Server-Authoritative Invoice Number
    const invoiceNumber = await getNextInvoiceNumber('PURCHASE');

    // 4. Address Snapshots (Warehouse Receiving Address Default)
    const billingSnapshot: InvoiceAddressSnapshot = {
      businessName: payload.billingAddressSnapshot?.businessName || 'MR FUTKAR Wholesale Central',
      contactName: payload.billingAddressSnapshot?.contactName || 'Akash Gupta',
      mobile: payload.billingAddressSnapshot?.mobile || '+919810012345',
      fullAddress: payload.billingAddressSnapshot?.fullAddress || 'Plot 4, Brahmpuri Main Road',
      city: payload.billingAddressSnapshot?.city || 'Delhi',
      state: payload.billingAddressSnapshot?.state || 'Delhi',
      pincode: payload.billingAddressSnapshot?.pincode || '110053',
    };
    if (payload.billingAddressSnapshot?.gstin) {
      billingSnapshot.gstin = payload.billingAddressSnapshot.gstin.trim();
    }
    if (payload.billingAddressSnapshot?.landmark) {
      billingSnapshot.landmark = payload.billingAddressSnapshot.landmark.trim();
    }

    const shippingSnapshot: InvoiceAddressSnapshot = {
      businessName: payload.shippingAddressSnapshot?.businessName || 'Brahmpuri Fulfillment Hub (WH-BRAHMPURI-01)',
      contactName: payload.shippingAddressSnapshot?.contactName || 'Warehouse Inward Manager',
      mobile: payload.shippingAddressSnapshot?.mobile || '+919810012345',
      fullAddress: payload.shippingAddressSnapshot?.fullAddress || 'Warehouse WH-BRAHMPURI-01, Brahmpuri',
      city: payload.shippingAddressSnapshot?.city || 'Delhi',
      state: payload.shippingAddressSnapshot?.state || 'Delhi',
      pincode: payload.shippingAddressSnapshot?.pincode || '110053',
    };
    if (payload.shippingAddressSnapshot?.landmark) {
      shippingSnapshot.landmark = payload.shippingAddressSnapshot.landmark.trim();
    }

    // 5. Assemble Immutable Snapshot Record
    const now = new Date().toISOString();
    const invoiceDate = (payload.invoiceDate || now.split('T')[0]).trim();
    const invoiceId = `inv_purchase_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const newInvoice: PurchaseInvoice & { _serverTxnToken: string } = {
      invoiceId,
      invoiceNumber,
      invoiceDate,
      invoiceStatus: 'DRAFT',
      supplierId: payload.supplierId ? String(payload.supplierId).trim() : null,
      supplierType: payload.supplierType ? String(payload.supplierType).trim() : 'DISTRIBUTOR',
      supplierInvoiceNumber: payload.supplierInvoiceNumber ? String(payload.supplierInvoiceNumber).trim() : null,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      billingAddressSnapshot: billingSnapshot,
      shippingAddressSnapshot: shippingSnapshot,
      items: calculated.items,
      subtotal: calculated.subtotal,
      discountTotal: calculated.discountTotal,
      taxableTotal: calculated.taxableTotal,
      taxTotal: calculated.taxTotal,
      grandTotal: calculated.grandTotal,
      paymentStatus: 'UNPAID',
      accountingStatus: 'NOT_POSTED',
      createdAt: now,
      createdBy: adminSession.uid,
      updatedAt: now,
      updatedBy: adminSession.uid,
      version: 1,
      idempotencyKey: trimmedIdempKey,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    // 6. Persist to Firestore
    await setDoc(doc(db, 'purchaseInvoices', invoiceId), cleanDocData(newInvoice));

    // 7. Audit Log
    await logAdminAudit({
      action: 'PURCHASE_INVOICE_CREATED',
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'PURCHASE_INVOICE',
      targetId: invoiceId,
      metadata: {
        invoiceNumber,
        supplierId: newInvoice.supplierId,
        supplierInvoiceNumber: newInvoice.supplierInvoiceNumber,
        grandTotal: newInvoice.grandTotal,
      },
      req,
    });

    const { _serverTxnToken, ...sanitized } = newInvoice;
    return sanitized;
  }

  /**
   * Update an existing Purchase Invoice (Draft only)
   */
  public static async updatePurchaseInvoice(
    adminSession: AdminSession,
    invoiceId: string,
    payload: {
      invoiceDate?: string;
      supplierId?: string | null;
      supplierType?: string;
      supplierInvoiceNumber?: string | null;
      items?: PurchaseInvoiceItemInput[];
      billingAddressSnapshot?: Partial<InvoiceAddressSnapshot>;
      shippingAddressSnapshot?: Partial<InvoiceAddressSnapshot>;
    },
    req?: Request
  ): Promise<PurchaseInvoice> {
    const rawPayload = payload as any;
    if (
      rawPayload.totalDebit !== undefined ||
      rawPayload.totalCredit !== undefined ||
      rawPayload.accountingJournalId !== undefined ||
      rawPayload.accountingVoucherNumber !== undefined ||
      rawPayload.accountingStatus !== undefined ||
      rawPayload.accountingPostedAt !== undefined
    ) {
      throw new Error(
        'CLIENT_ACCOUNTING_INJECTION_FORBIDDEN: Client cannot inject accounting fields (totalDebit, totalCredit, accountingJournalId, accountingVoucherNumber, accountingStatus, accountingPostedAt).'
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
        'CLIENT_TOTAL_INJECTION_FORBIDDEN: Purchase invoice totals are calculated server-side.'
      );
    }

    const invoiceRef = doc(db, 'purchaseInvoices', invoiceId);
    const invoiceSnap = await getDoc(invoiceRef);

    if (!invoiceSnap.exists()) {
      throw new Error(`INVOICE_NOT_FOUND: Purchase invoice "${invoiceId}" not found.`);
    }

    const current = invoiceSnap.data() as PurchaseInvoice;

    if (current.invoiceStatus === 'POSTED' || current.accountingStatus === 'POSTED' || current.invoiceStatus === 'CANCELLED') {
      throw new Error(
        `INVOICE_IMMUTABLE: Cannot update purchase invoice "${current.invoiceNumber}" with status "${current.invoiceStatus}".`
      );
    }

    const now = new Date().toISOString();
    let updatedItems = current.items;
    let totals = {
      subtotal: current.subtotal,
      discountTotal: current.discountTotal,
      taxableTotal: current.taxableTotal,
      taxTotal: current.taxTotal,
      grandTotal: current.grandTotal,
    };

    if (payload.items && payload.items.length > 0) {
      const enrichedItems = await this.resolveProductSnapshots(payload.items);
      const calculated = calculatePurchaseInvoiceTotals(enrichedItems);
      updatedItems = calculated.items;
      totals = {
        subtotal: calculated.subtotal,
        discountTotal: calculated.discountTotal,
        taxableTotal: calculated.taxableTotal,
        taxTotal: calculated.taxTotal,
        grandTotal: calculated.grandTotal,
      };
    }

    const updatedInvoice: PurchaseInvoice & { _serverTxnToken: string } = {
      ...current,
      invoiceDate: payload.invoiceDate ? payload.invoiceDate.trim() : current.invoiceDate,
      supplierId: payload.supplierId !== undefined ? payload.supplierId : current.supplierId,
      supplierType: payload.supplierType || current.supplierType,
      supplierInvoiceNumber:
        payload.supplierInvoiceNumber !== undefined
          ? payload.supplierInvoiceNumber
          : current.supplierInvoiceNumber,
      items: updatedItems,
      ...totals,
      updatedAt: now,
      updatedBy: adminSession.uid,
      version: (current.version || 1) + 1,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    await setDoc(invoiceRef, cleanDocData(updatedInvoice));

    await logAdminAudit({
      action: 'PURCHASE_INVOICE_UPDATED',
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'PURCHASE_INVOICE',
      targetId: invoiceId,
      metadata: {
        invoiceNumber: current.invoiceNumber,
        grandTotal: updatedInvoice.grandTotal,
      },
      req,
    });

    const { _serverTxnToken, ...sanitized } = updatedInvoice;
    return sanitized;
  }

  private static postPurchaseInvoiceLocks = new Map<string, Promise<PurchaseInvoice>>();

  /**
   * Transition Purchase Invoice from DRAFT to POSTED and atomically post to Double-Entry Accounting Journal
   */
  public static async postPurchaseInvoice(
    adminSession: AdminSession,
    invoiceId: string,
    req?: Request
  ): Promise<PurchaseInvoice> {
    if (this.postPurchaseInvoiceLocks.has(invoiceId)) {
      return await this.postPurchaseInvoiceLocks.get(invoiceId)!;
    }

    const promise = this.executePostPurchaseInvoice(adminSession, invoiceId, req);
    this.postPurchaseInvoiceLocks.set(invoiceId, promise);
    try {
      return await promise;
    } finally {
      this.postPurchaseInvoiceLocks.delete(invoiceId);
    }
  }

  private static async executePostPurchaseInvoice(
    adminSession: AdminSession,
    invoiceId: string,
    req?: Request
  ): Promise<PurchaseInvoice> {
    const invoiceRef = doc(db, 'purchaseInvoices', invoiceId);
    const invoiceSnap = await getDoc(invoiceRef);

    if (!invoiceSnap.exists()) {
      throw new Error(`INVOICE_NOT_FOUND: Purchase invoice "${invoiceId}" not found.`);
    }

    const current = invoiceSnap.data() as PurchaseInvoice;

    // Idempotency: If already posted and accounting is posted, return cleanly
    if (current.invoiceStatus === 'POSTED' && current.accountingStatus === 'POSTED') {
      const { _serverTxnToken, ...sanitized } = current as any;
      return sanitized;
    }

    if (current.invoiceStatus === 'CANCELLED') {
      throw new Error(`CANNOT_POST_CANCELLED_INVOICE: Cannot post a cancelled purchase invoice.`);
    }

    // 1. Verify Invoice Number exists
    if (!current.invoiceNumber || !current.invoiceNumber.trim()) {
      throw new Error('INVALID_INVOICE_NUMBER: Invoice number is missing or empty.');
    }

    // 2. Verify Items and Recalculate Totals Server-Side using integer paise
    if (!Array.isArray(current.items) || current.items.length === 0) {
      throw new Error('INVALID_ITEMS: Purchase invoice must contain at least one valid item to post.');
    }
    const calculated = calculatePurchaseInvoiceTotals(current.items);

    // 3. Verify Accounting Period is OPEN
    await validatePeriodIsOpen(current.invoiceDate);

    // 4. Account Mapping: Resolve Accounts by accountCode
    const accPayable = await this.getAuthoritativeAccount('2100', 'LIABILITY', 'CREDIT');
    const accDirectCosts = await this.getAuthoritativeAccount('5100', 'EXPENSE', 'DEBIT');
    let accInputGst: Account | null = null;
    if (calculated.taxTotal > 0) {
      accInputGst = await this.getAuthoritativeAccount('2300');
    }

    // 5. Idempotent Accounting Journal Generation
    const qExisting = query(
      collection(db, 'journalEntries'),
      where('referenceType', '==', 'PURCHASE_INVOICE'),
      where('referenceId', '==', invoiceId)
    );
    const existingJournalSnap = await getDocs(qExisting);
    let journal: JournalEntry;

    if (!existingJournalSnap.empty) {
      journal = existingJournalSnap.docs[0].data() as JournalEntry;
      if (journal.status === 'DRAFT') {
        const postedRes = await JournalEngine.postJournal(
          {
            uid: adminSession.uid,
            email: adminSession.email || 'admin@mrfutkar.in',
            name: adminSession.name || 'Authoritative Admin',
            mobile: adminSession.mobile || '+919999999999',
            role: (adminSession.role as any) || 'SUPER_ADMIN',
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: 'SYSTEM',
          },
          journal.journalId,
          req
        );
        journal = postedRes.journal;
      }
    } else {
      // Build double-entry lines per prompt specification
      const journalLines: JournalLinePayload[] = [];
      if (calculated.taxTotal > 0) {
        // Line 1: 5100 Direct Costs DR taxableTotal
        journalLines.push({
          accountId: accDirectCosts.accountId,
          debit: calculated.taxableTotal,
          credit: 0,
          description: `Direct Costs for Purchase Invoice ${current.invoiceNumber}`,
          supplierId: current.supplierId || null,
        });
        // Line 2: 2300 Input GST DR taxTotal
        journalLines.push({
          accountId: accInputGst!.accountId,
          debit: calculated.taxTotal,
          credit: 0,
          description: `Input GST on Purchase Invoice ${current.invoiceNumber}`,
          supplierId: current.supplierId || null,
        });
        // Line 3: 2100 Accounts Payable CR grandTotal
        journalLines.push({
          accountId: accPayable.accountId,
          debit: 0,
          credit: calculated.grandTotal,
          description: `Accounts Payable for Purchase Invoice ${current.invoiceNumber}`,
          supplierId: current.supplierId || null,
        });
      } else {
        // Line 1: 5100 Direct Costs DR grandTotal
        journalLines.push({
          accountId: accDirectCosts.accountId,
          debit: calculated.grandTotal,
          credit: 0,
          description: `Direct Costs for Purchase Invoice ${current.invoiceNumber}`,
          supplierId: current.supplierId || null,
        });
        // Line 2: 2100 Accounts Payable CR grandTotal
        journalLines.push({
          accountId: accPayable.accountId,
          debit: 0,
          credit: calculated.grandTotal,
          description: `Accounts Payable for Purchase Invoice ${current.invoiceNumber}`,
          supplierId: current.supplierId || null,
        });
      }

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

      const draftResult = await JournalEngine.createDraftJournal(
        adminUserObj,
        {
          journalDate: current.invoiceDate,
          voucherType: 'PV',
          referenceType: 'PURCHASE_INVOICE',
          referenceId: invoiceId,
          narration: `Purchase Invoice ${current.invoiceNumber}${current.supplierId ? ` from ${current.supplierId}` : ''}`,
          lines: journalLines,
        },
        req
      );

      const postedResult = await JournalEngine.postJournal(adminUserObj, draftResult.journal.journalId, req);
      journal = postedResult.journal;
    }

    // 6. Update Purchase Invoice document atomically with accounting linkage
    const now = new Date().toISOString();
    const postedInvoice: PurchaseInvoice & { _serverTxnToken: string } = {
      ...current,
      invoiceStatus: 'POSTED',
      accountingStatus: 'POSTED',
      accountingJournalId: journal.journalId,
      accountingVoucherNumber: journal.journalNumber,
      accountingPostedAt: journal.postedAt || now,
      updatedAt: now,
      updatedBy: adminSession.uid,
      version: (current.version || 1) + 1,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    await setDoc(invoiceRef, cleanDocData(postedInvoice));

    // 7. Audits
    await logAdminAudit({
      action: 'PURCHASE_INVOICE_ISSUED' as any,
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'PURCHASE_INVOICE',
      targetId: invoiceId,
      metadata: {
        invoiceNumber: current.invoiceNumber,
        grandTotal: current.grandTotal,
      },
      req,
    });

    await logAdminAudit({
      action: 'PURCHASE_INVOICE_POSTED' as any,
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'PURCHASE_INVOICE',
      targetId: invoiceId,
      metadata: {
        invoiceNumber: current.invoiceNumber,
        grandTotal: current.grandTotal,
      },
      req,
    });

    await logAdminAudit({
      action: 'PURCHASE_INVOICE_ACCOUNTING_POSTED' as any,
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'PURCHASE_INVOICE',
      targetId: invoiceId,
      metadata: {
        purchaseInvoiceId: invoiceId,
        invoiceId,
        invoiceNumber: current.invoiceNumber,
        journalId: journal.journalId,
        voucherNumber: journal.journalNumber,
        supplierId: current.supplierId || null,
        grandTotal: current.grandTotal,
        adminUid: adminSession.uid,
        timestamp: now,
      },
      req,
    });

    const { _serverTxnToken, ...sanitized } = postedInvoice;
    return sanitized;
  }

  /**
   * Cancel a Purchase Invoice (Idempotent & Audited, never deletes document)
   */
  public static async cancelPurchaseInvoice(
    adminSession: AdminSession,
    invoiceId: string,
    reason?: string,
    req?: Request
  ): Promise<PurchaseInvoice> {
    const invoiceRef = doc(db, 'purchaseInvoices', invoiceId);
    const invoiceSnap = await getDoc(invoiceRef);

    if (!invoiceSnap.exists()) {
      throw new Error(`INVOICE_NOT_FOUND: Purchase invoice "${invoiceId}" not found.`);
    }

    const current = invoiceSnap.data() as PurchaseInvoice;

    if (current.invoiceStatus === 'CANCELLED') {
      return current; // Idempotent
    }

    if (current.invoiceStatus === 'POSTED' || current.accountingStatus === 'POSTED') {
      throw new Error(
        'ACCOUNTING_REVERSAL_REQUIRED: Posted purchase invoice with active accounting journal cannot be cancelled without an accounting reversal.'
      );
    }

    const now = new Date().toISOString();
    const cancelledInvoice: PurchaseInvoice & { _serverTxnToken: string } = {
      ...current,
      invoiceStatus: 'CANCELLED',
      updatedAt: now,
      updatedBy: adminSession.uid,
      version: (current.version || 1) + 1,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    await setDoc(invoiceRef, cleanDocData(cancelledInvoice));

    await logAdminAudit({
      action: 'PURCHASE_INVOICE_CANCELLED',
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      targetType: 'PURCHASE_INVOICE',
      targetId: invoiceId,
      metadata: {
        invoiceNumber: current.invoiceNumber,
        reason: reason || 'Admin cancelled',
      },
      req,
    });

    const { _serverTxnToken, ...sanitized } = cancelledInvoice;
    return sanitized;
  }

  /**
   * Get Purchase Invoice by ID
   */
  public static async getPurchaseInvoiceById(
    invoiceId: string,
    adminSession?: AdminSession,
    req?: Request
  ): Promise<PurchaseInvoice | null> {
    const invoiceRef = doc(db, 'purchaseInvoices', invoiceId);
    const invoiceSnap = await getDoc(invoiceRef);

    if (!invoiceSnap.exists()) {
      return null;
    }

    const data = invoiceSnap.data() as PurchaseInvoice & { _serverTxnToken?: string };
    const { _serverTxnToken, ...sanitized } = data;

    if (adminSession) {
      await logAdminAudit({
        action: 'PURCHASE_INVOICE_VIEWED',
        adminUid: adminSession.uid,
        adminName: adminSession.name,
        targetType: 'PURCHASE_INVOICE',
        targetId: invoiceId,
        req,
      });
    }

    return sanitized;
  }

  /**
   * List Purchase Invoices with Server-Side Filtering and Pagination (Max 100)
   */
  public static async listPurchaseInvoices(
    filters: PurchaseInvoiceListFilters
  ): Promise<{ invoices: PurchaseInvoice[]; total: number }> {
    const pageSize = Math.min(Math.max(Number(filters.pageSize || 20), 1), 100);
    const page = Math.max(Number(filters.page || 1), 1);

    const q = query(collection(db, 'purchaseInvoices'), orderBy('createdAt', 'desc'), limit(300));
    const snap = await getDocs(q);

    let all: PurchaseInvoice[] = [];
    snap.forEach((d) => {
      const data = d.data() as PurchaseInvoice & { _serverTxnToken?: string };
      const { _serverTxnToken, ...clean } = data;
      all.push(clean);
    });

    if (filters.status) {
      const st = filters.status.toUpperCase();
      all = all.filter((inv) => inv.invoiceStatus === st);
    }

    if (filters.supplierId) {
      const supId = filters.supplierId.trim().toLowerCase();
      all = all.filter((inv) => (inv.supplierId || '').toLowerCase() === supId);
    }

    if (filters.invoiceNumber) {
      const num = filters.invoiceNumber.trim().toUpperCase();
      all = all.filter((inv) => inv.invoiceNumber.toUpperCase().includes(num));
    }

    if (filters.fromDate) {
      all = all.filter((inv) => inv.invoiceDate >= filters.fromDate!);
    }

    if (filters.toDate) {
      all = all.filter((inv) => inv.invoiceDate <= filters.toDate!);
    }

    if (filters.search) {
      const s = filters.search.trim().toLowerCase();
      all = all.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(s) ||
          (inv.supplierInvoiceNumber && inv.supplierInvoiceNumber.toLowerCase().includes(s)) ||
          (inv.supplierId && inv.supplierId.toLowerCase().includes(s))
      );
    }

    const total = all.length;
    const startIndex = (page - 1) * pageSize;
    const paginated = all.slice(startIndex, startIndex + pageSize);

    return { invoices: paginated, total };
  }
}
