/**
 * MR FUTKAR — Retailer Customer Invoice Routes (Phase 5.5 Part 4)
 * Customer-facing endpoints with strict tenant-isolation and access control
 */

import { Router, Request, Response } from 'express';
import { collection, query, where, getDocs, limit, doc, getDoc } from 'firebase/firestore';
import { db } from './firebaseAdmin';
import { resolveAuthUser } from './auth';
import { InvoiceDocumentService } from './invoiceDocumentService';
import { PartyLedgerService } from './partyLedgerService';

export const retailerInvoiceRouter = Router();

// Middleware: Authenticate User
retailerInvoiceRouter.use(async (req: Request, res: Response, next) => {
  const authHeader = req.headers.authorization;
  const authResult = await resolveAuthUser(authHeader);
  if (!authResult.valid || !authResult.user) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required to access invoice document.',
    });
  }
  (req as any).authUser = authResult.user;
  next();
});

/**
 * GET /api/invoices/my-ledger
 * Retailer Self-Ledger Statement (Phase 5.7 Part 1A)
 * Derived strictly from Account 1300 Accounts Receivable & posted double-entry journals
 * Server-authoritative: Identity resolved from Firebase Auth UID.
 */
retailerInvoiceRouter.get('/my-ledger', async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).authUser;

    // Strict role check: Only registered RETAILER may access self-ledger
    if (authUser.role !== 'RETAILER') {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'Only registered retailers may access customer ledger statements.',
      });
    }

    // Authoritative retailer identity resolution:
    // Firebase Auth UID
    //       ↓
    // authoritative retailer record
    //       ↓
    // canonical retailerId
    //       ↓
    // Customer Ledger
    //       ↓
    // Only that retailer's transactions
    const authUid = authUser.uid;
    let canonicalRetailerId = await PartyLedgerService.resolveCanonicalRetailerId(authUid);

    // Fallback: check by verified mobileNumber if not found by authUid directly
    if (!canonicalRetailerId && authUser.mobile) {
      try {
        const qPhone = query(collection(db, 'retailers'), where('mobileNumber', '==', authUser.mobile), limit(1));
        const phoneSnap = await getDocs(qPhone);
        if (!phoneSnap.empty) {
          const retData = phoneSnap.docs[0].data();
          canonicalRetailerId = (retData.retailerId || phoneSnap.docs[0].id).trim();
        }
      } catch (lookupErr: any) {
        console.warn('Note resolving retailerId by mobile:', lookupErr?.message);
      }
    }

    if (!canonicalRetailerId) {
      return res.status(404).json({
        success: false,
        error: 'RETAILER_NOT_FOUND',
        message: 'No registered retailer profile found for this account.',
      });
    }

    // CROSS-TENANT SECURITY:
    // Client-supplied customerId / retailerId / authUid must NEVER override server-resolved canonical retailerId.
    // Any cross-tenant attempt returns 403 Forbidden with zero data leakage.
    const suppliedCustomerId = (req.query.customerId || req.query.retailerId) as string | undefined;
    if (suppliedCustomerId && suppliedCustomerId.trim() !== canonicalRetailerId) {
      return res.status(403).json({
        success: false,
        error: 'CROSS_TENANT_ACCESS_DENIED',
        message: 'Access denied: You cannot access or specify another retailer identity.',
      });
    }

    const suppliedAuthUid = req.query.authUid as string | undefined;
    if (suppliedAuthUid && suppliedAuthUid.trim() !== authUid) {
      return res.status(403).json({
        success: false,
        error: 'CROSS_TENANT_ACCESS_DENIED',
        message: 'Access denied: You cannot specify another auth UID.',
      });
    }

    const { fromDate, toDate, page, pageSize } = req.query;

    const rawPageSize = pageSize !== undefined ? Number(pageSize) : 50;
    if (Number.isFinite(rawPageSize) && rawPageSize > 100) {
      return res.status(400).json({
        success: false,
        error: 'PAGE_SIZE_EXCEEDED',
        message: 'Page size cannot exceed 100.',
      });
    }

    // Call authoritative party ledger service strictly using canonical retailerId
    const ledger = await PartyLedgerService.getCustomerLedger({
      customerId: canonicalRetailerId,
      fromDate: typeof fromDate === 'string' ? fromDate : undefined,
      toDate: typeof toDate === 'string' ? toDate : undefined,
      page: page !== undefined ? Number(page) : 1,
      pageSize: rawPageSize,
    });

    // Sanitize transactions: expose ONLY date, documentType, documentNumber, description, debit, credit, runningBalance
    // Do NOT expose journalId, lineId, voucherType, server tokens, or internal audit metadata
    const sanitizedRows = ledger.entries.map(e => ({
      date: e.date,
      documentType: e.documentType,
      documentNumber: e.referenceNumber || e.referenceId || 'N/A',
      description: e.narration || e.documentType,
      debit: e.debit,
      credit: e.credit,
      runningBalance: e.runningBalance,
    }));

    return res.status(200).json({
      success: true,
      customerId: canonicalRetailerId,
      retailerId: canonicalRetailerId,
      authUid,
      customer: {
        customerId: ledger.customer.customerId,
        shopName: ledger.customer.shopName,
        ownerName: ledger.customer.ownerName,
        city: ledger.customer.city,
        state: ledger.customer.state,
      },
      openingBalance: ledger.openingBalance,
      totalDebit: ledger.periodDebit,
      totalCredit: ledger.periodCredit,
      closingBalance: ledger.closingBalance,
      currentOutstanding: ledger.closingBalance,
      runningBalance: ledger.closingBalance,
      transactionCount: ledger.pagination.totalCount,
      transactions: sanitizedRows,
      rows: sanitizedRows,
      pagination: ledger.pagination,
      filter: {
        fromDate: ledger.filter.fromDate || null,
        toDate: ledger.filter.toDate || null,
      },
    });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('PAGE_SIZE_EXCEEDED')) {
      return res.status(400).json({
        success: false,
        error: 'PAGE_SIZE_EXCEEDED',
        message: 'Page size cannot exceed 100.',
      });
    }
    if (msg.includes('INVALID_DATE_FORMAT')) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_DATE_FORMAT',
        message: msg,
      });
    }
    if (msg.includes('INVALID_DATE_RANGE')) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_DATE_RANGE',
        message: msg,
      });
    }
    console.error('Failed to fetch retailer customer ledger:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to fetch customer ledger statement.',
    });
  }
});

/**
 * Cross-tenant path access explicitly blocked
 */
retailerInvoiceRouter.get('/my-ledger/:customerId', (_req: Request, res: Response) => {
  return res.status(403).json({
    success: false,
    error: 'ACCESS_DENIED',
    message: 'Cross-tenant customer ledger access via path parameter is strictly forbidden.',
  });
});

retailerInvoiceRouter.get('/customer/:customerId/ledger', (_req: Request, res: Response) => {
  return res.status(403).json({
    success: false,
    error: 'ACCESS_DENIED',
    message: 'Cross-tenant customer ledger access via path parameter is strictly forbidden.',
  });
});

/**
 * Supplier ledger access on retailer router is strictly forbidden
 */
retailerInvoiceRouter.use('/supplier-ledger', async (_req: Request, res: Response) => {
  return res.status(403).json({
    success: false,
    error: 'ACCESS_DENIED',
    message: 'Supplier ledger is restricted to Super Admin administrators.',
  });
});

/**
 * GET /api/invoices/my-receipts
 * Secure retailer self-view of their own posted customer receipts and allocations
 */
retailerInvoiceRouter.get('/my-receipts', async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).authUser;
    if (authUser.role !== 'RETAILER') {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'Only registered retailers may access customer receipts.',
      });
    }

    const authUid = authUser.uid;
    let canonicalRetailerId = await PartyLedgerService.resolveCanonicalRetailerId(authUid);
    if (!canonicalRetailerId && authUser.mobile) {
      try {
        const qPhone = query(collection(db, 'retailers'), where('mobileNumber', '==', authUser.mobile), limit(1));
        const phoneSnap = await getDocs(qPhone);
        if (!phoneSnap.empty) {
          const retData = phoneSnap.docs[0].data();
          canonicalRetailerId = (retData.retailerId || phoneSnap.docs[0].id).trim();
        }
      } catch (lookupErr: any) {
        console.warn('Note resolving retailerId by mobile:', lookupErr?.message);
      }
    }

    if (!canonicalRetailerId) {
      return res.status(404).json({
        success: false,
        error: 'RETAILER_NOT_FOUND',
        message: 'No registered retailer profile found for this account.',
      });
    }

    // Cross-tenant protection
    const suppliedCustomerId = (req.query.customerId || req.query.retailerId) as string | undefined;
    if (suppliedCustomerId && suppliedCustomerId.trim() !== canonicalRetailerId) {
      return res.status(403).json({
        success: false,
        error: 'CROSS_TENANT_ACCESS_DENIED',
        message: 'Access denied: You cannot access or specify another retailer identity.',
      });
    }

    const qReceipts = query(
      collection(db, 'customerReceipts'),
      where('customerId', '==', canonicalRetailerId)
    );
    const snap = await getDocs(qReceipts);

    const receipts: any[] = [];
    snap.forEach((d) => {
      const data = d.data() as any;
      if (data.status === 'POSTED') {
        receipts.push({
          receiptId: data.receiptId,
          receiptNumber: data.receiptNumber,
          receiptDate: data.receiptDate,
          amount: data.amountPaise / 100,
          amountPaise: data.amountPaise,
          paymentMethod: data.paymentMethod,
          referenceNumber: data.referenceNumber || null,
          allocations: (data.allocations || []).map((a: any) => ({
            receiptId: a.receiptId || data.receiptId,
            invoiceId: a.invoiceId,
            invoiceNumber: a.invoiceNumber,
            retailerId: a.retailerId || canonicalRetailerId,
            customerId: a.customerId || canonicalRetailerId,
            allocatedAmount: a.allocatedAmountPaise / 100,
            allocatedAmountPaise: a.allocatedAmountPaise,
            createdAt: a.createdAt || a.allocatedAt,
            allocatedAt: a.allocatedAt || a.createdAt,
          })),
          allocatedAmount: (data.allocatedAmountPaise || 0) / 100,
          allocatedAmountPaise: data.allocatedAmountPaise || 0,
          unallocatedAmount: (data.unallocatedAmountPaise ?? data.amountPaise) / 100,
          unallocatedAmountPaise: data.unallocatedAmountPaise ?? data.amountPaise,
          allocationStatus: data.allocationStatus || (data.unallocatedAmountPaise === 0 ? 'FULLY_ALLOCATED' : (data.allocatedAmountPaise ? 'PARTIALLY_ALLOCATED' : 'UNALLOCATED')),
          postedAt: data.postedAt,
        });
      }
    });

    receipts.sort((a, b) => b.receiptDate.localeCompare(a.receiptDate) || (b.postedAt || '').localeCompare(a.postedAt || ''));

    return res.status(200).json({
      success: true,
      customerId: canonicalRetailerId,
      receipts,
    });
  } catch (err: any) {
    console.error('Failed to fetch retailer customer receipts:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to fetch customer receipts.',
    });
  }
});

/**
 * GET /api/invoices/my-invoices
 * Secure retailer self-view of their own issued sales invoices, paid amounts, and outstanding balances
 * Authoritative: strictly derived from accounting state.
 */
retailerInvoiceRouter.get('/my-invoices', async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).authUser;
    if (authUser.role !== 'RETAILER') {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'Only registered retailers may access sales invoices.',
      });
    }

    const authUid = authUser.uid;
    let canonicalRetailerId = await PartyLedgerService.resolveCanonicalRetailerId(authUid);
    if (!canonicalRetailerId && authUser.mobile) {
      try {
        const qPhone = query(collection(db, 'retailers'), where('mobileNumber', '==', authUser.mobile), limit(1));
        const phoneSnap = await getDocs(qPhone);
        if (!phoneSnap.empty) {
          const retData = phoneSnap.docs[0].data();
          canonicalRetailerId = (retData.retailerId || phoneSnap.docs[0].id).trim();
        }
      } catch (lookupErr: any) {
        console.warn('Note resolving retailerId by mobile:', lookupErr?.message);
      }
    }

    if (!canonicalRetailerId) {
      return res.status(404).json({
        success: false,
        error: 'RETAILER_NOT_FOUND',
        message: 'No registered retailer profile found for this account.',
      });
    }

    // Cross-tenant protection
    const suppliedCustomerId = (req.query.customerId || req.query.retailerId) as string | undefined;
    if (suppliedCustomerId && suppliedCustomerId.trim() !== canonicalRetailerId) {
      return res.status(403).json({
        success: false,
        error: 'CROSS_TENANT_ACCESS_DENIED',
        message: 'Access denied: You cannot access or specify another retailer identity.',
      });
    }

    const qInvoices = query(
      collection(db, 'salesInvoices'),
      where('customerId', '==', canonicalRetailerId)
    );
    const snap = await getDocs(qInvoices);

    const invoices: any[] = [];
    snap.forEach((d) => {
      const data = d.data() as any;
      if (data.invoiceStatus === 'ISSUED' && data.accountingStatus === 'POSTED') {
        const grandTotalPaise = Math.round((data.grandTotal || 0) * 100);
        const paidAmountPaise = data.paidAmountPaise || 0;
        const outstandingAmountPaise =
          data.outstandingAmountPaise !== undefined
            ? data.outstandingAmountPaise
            : Math.max(0, grandTotalPaise - paidAmountPaise);

        invoices.push({
          invoiceId: data.invoiceId,
          invoiceNumber: data.invoiceNumber,
          invoiceDate: data.invoiceDate,
          dueDate: data.dueDate,
          grandTotal: data.grandTotal,
          grandTotalPaise,
          paidAmount: paidAmountPaise / 100,
          paidAmountPaise,
          outstandingAmount: outstandingAmountPaise / 100,
          outstandingAmountPaise,
          paymentStatus:
            data.paymentStatus ||
            (outstandingAmountPaise === 0
              ? 'PAID'
              : paidAmountPaise > 0
              ? 'PARTIALLY_PAID'
              : 'UNPAID'),
          allocations: data.allocations || [],
          postedAt: data.postedAt,
        });
      }
    });

    invoices.sort(
      (a, b) =>
        b.invoiceDate.localeCompare(a.invoiceDate) ||
        (b.postedAt || '').localeCompare(a.postedAt || '')
    );

    return res.status(200).json({
      success: true,
      customerId: canonicalRetailerId,
      invoices,
    });
  } catch (err: any) {
    console.error('Failed to fetch retailer sales invoices:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to fetch sales invoices.',
    });
  }
});

/**
 * GET /api/invoices/sales/:invoiceId/document
 * Customer-Facing Sales Invoice Document Model
 */
retailerInvoiceRouter.get('/sales/:invoiceId/document', async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).authUser;
    const { invoiceId } = req.params;

    // Disallow non-retailer operational roles from accessing customer invoices via this route
    if (authUser.role !== 'RETAILER') {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'Delivery staff and warehouse staff cannot access customer sales invoices.',
      });
    }

    const document = await InvoiceDocumentService.getSalesInvoiceDocument(invoiceId, {
      isAdmin: false,
      customerId: authUser.uid,
      req,
      auditAction: 'VIEW',
    });

    return res.status(200).json({
      success: true,
      document,
    });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('INVOICE_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: 'INVOICE_NOT_FOUND',
        message: msg,
      });
    }
    if (msg.includes('ACCESS_DENIED')) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: msg,
      });
    }
    console.error('Failed to fetch sales invoice document for retailer:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to fetch invoice document.',
    });
  }
});

/**
 * GET /api/invoices/sales/:invoiceId/pdf
 * Customer-Facing Sales Invoice PDF Download
 */
retailerInvoiceRouter.get('/sales/:invoiceId/pdf', async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).authUser;
    const { invoiceId } = req.params;

    if (authUser.role !== 'RETAILER') {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'Delivery staff and warehouse staff cannot access customer sales invoices.',
      });
    }

    const document = await InvoiceDocumentService.getSalesInvoiceDocument(invoiceId, {
      isAdmin: false,
      customerId: authUser.uid,
      req,
      auditAction: 'EXPORT',
    });

    const pdfBuffer = InvoiceDocumentService.generateInvoicePdf(document);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${document.invoiceNumber}.pdf"`
    );
    return res.status(200).send(pdfBuffer);
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('INVOICE_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: 'INVOICE_NOT_FOUND',
        message: msg,
      });
    }
    if (msg.includes('ACCESS_DENIED')) {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: msg,
      });
    }
    console.error('Failed to generate sales invoice PDF for retailer:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to generate PDF.',
    });
  }
});

/**
 * GET /api/invoices/by-order/:orderId
 * Find sales invoice metadata associated with a retailer order
 */
retailerInvoiceRouter.get('/by-order/:orderId', async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).authUser;
    const { orderId } = req.params;

    if (authUser.role !== 'RETAILER') {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'Only registered retailers may access sales invoices.',
      });
    }

    const q = query(
      collection(db, 'salesInvoices'),
      where('sourceOrderId', '==', orderId),
      where('customerId', '==', authUser.uid),
      limit(1)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      return res.status(404).json({
        success: false,
        error: 'INVOICE_NOT_FOUND',
        message: `No sales invoice found for order "${orderId}".`,
      });
    }

    const invDoc = snap.docs[0];
    const invData = invDoc.data();

    return res.status(200).json({
      success: true,
      invoiceId: invDoc.id,
      invoiceNumber: invData.invoiceNumber,
      invoiceDate: invData.invoiceDate,
      grandTotal: invData.grandTotal,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to query invoice for order.',
    });
  }
});

/**
 * Any Purchase Invoice access on retailer router is strictly forbidden
 */
retailerInvoiceRouter.use('/purchase', async (_req: Request, res: Response) => {
  return res.status(403).json({
    success: false,
    error: 'ACCESS_DENIED',
    message: 'Purchase invoices are restricted to Super Admin administrators.',
  });
});
