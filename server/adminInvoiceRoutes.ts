/**
 * MR FUTKAR — Super Admin Invoice Management Endpoints (Phase 5.5 Part 1)
 * Authoritative Sales & Purchase Invoice REST API
 */

import { Router, Request, Response } from 'express';
import { requireSuperAdmin } from './adminAuth';
import { InvoiceService } from './invoiceService';
import { InvoiceDocumentService } from './invoiceDocumentService';

export const adminInvoiceRouter = Router();

// Strictly enforce Super Admin access across all invoice endpoints
adminInvoiceRouter.use(requireSuperAdmin());

// =========================================================================
// SALES INVOICE APIS
// =========================================================================

/**
 * GET /api/admin/invoices/sales
 * List sales invoices with search, filters, pagination
 */
adminInvoiceRouter.get('/sales', async (req: Request, res: Response) => {
  try {
    const { search, status, fromDate, toDate, customerId, invoiceNumber, sourceOrderId, page, pageSize } = req.query;

    const requestedPageSize = Number(pageSize || 20);
    if (requestedPageSize > 100) {
      return res.status(400).json({
        success: false,
        error: 'PAGE_SIZE_EXCEEDED',
        message: 'Maximum page size allowed is 100.',
      });
    }

    const result = await InvoiceService.listSalesInvoices({
      search: search ? String(search) : undefined,
      status: status ? String(status) : undefined,
      fromDate: fromDate ? String(fromDate) : undefined,
      toDate: toDate ? String(toDate) : undefined,
      customerId: customerId ? String(customerId) : undefined,
      invoiceNumber: invoiceNumber ? String(invoiceNumber) : undefined,
      sourceOrderId: sourceOrderId ? String(sourceOrderId) : undefined,
      page: page ? Number(page) : 1,
      pageSize: requestedPageSize,
    });

    return res.status(200).json({
      success: true,
      invoices: result.invoices,
      total: result.total,
      page: Number(page || 1),
      pageSize: requestedPageSize,
    });
  } catch (err: any) {
    console.error('Failed to list sales invoices:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to list sales invoices.',
    });
  }
});

/**
 * GET /api/admin/invoices/sales/:invoiceId
 * Retrieve single sales invoice with full immutable snapshot details
 */
adminInvoiceRouter.get('/sales/:invoiceId', async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const adminSession = (req as any).adminUser;

    const invoice = await InvoiceService.getSalesInvoiceById(invoiceId, adminSession, req);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'INVOICE_NOT_FOUND',
        message: `Sales invoice with ID "${invoiceId}" was not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      invoice,
      accountingStatus: invoice.accountingStatus,
      accountingJournalId: invoice.accountingJournalId,
      accountingVoucherNumber: invoice.accountingVoucherNumber,
      accountingPostedAt: invoice.accountingPostedAt,
    });
  } catch (err: any) {
    console.error('Failed to get sales invoice:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to get sales invoice.',
    });
  }
});

/**
 * POST /api/admin/invoices/sales
 * Create a new draft sales invoice
 */
adminInvoiceRouter.post('/sales', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser;
    const {
      invoiceDate,
      customerId,
      sourceOrderId,
      items,
      billingAddressSnapshot,
      shippingAddressSnapshot,
      idempotencyKey,
      totalDebit,
      totalCredit,
      grandTotal,
      subtotal,
    } = req.body;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_CUSTOMER_ID',
        message: 'customerId is required to create a sales invoice.',
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'EMPTY_ITEMS',
        message: 'Sales invoice must have at least one line item.',
      });
    }

    // Client total injection check: Reject if client tries to dictate any totals
    if (
      grandTotal !== undefined ||
      subtotal !== undefined ||
      req.body.discountTotal !== undefined ||
      req.body.taxableTotal !== undefined ||
      req.body.taxTotal !== undefined ||
      totalDebit !== undefined ||
      totalCredit !== undefined
    ) {
      return res.status(400).json({
        success: false,
        error: 'CLIENT_TOTAL_INJECTION_FORBIDDEN',
        message: 'Client-supplied totals are forbidden. Totals are server-calculated.',
      });
    }

    const invoice = await InvoiceService.createSalesInvoice(
      adminSession,
      {
        invoiceDate,
        customerId,
        sourceOrderId,
        items,
        billingAddressSnapshot,
        shippingAddressSnapshot,
        idempotencyKey,
      },
      req
    );

    return res.status(201).json({
      success: true,
      invoice,
      message: `Sales invoice "${invoice.invoiceNumber}" created successfully.`,
    });
  } catch (err: any) {
    const msg = err.message || '';
    if (
      msg.includes('CUSTOMER_NOT_FOUND') ||
      msg.includes('PRODUCT_NOT_FOUND') ||
      msg.includes('ORDER_NOT_FOUND') ||
      msg.includes('ORDER_CUSTOMER_MISMATCH') ||
      msg.includes('ORDER_WAREHOUSE_MISMATCH') ||
      msg.includes('ORDER_NOT_ELIGIBLE') ||
      msg.includes('INVALID_ITEM') ||
      msg.includes('EMPTY_ITEMS') ||
      msg.includes('EXCESSIVE_DISCOUNT') ||
      msg.includes('INVALID_MONEY_VALUE') ||
      msg.includes('INACTIVE_ACCOUNT') ||
      msg.includes('ACCOUNT_NOT_FOUND') ||
      msg.includes('PERIOD_NOT_OPEN')
    ) {
      return res.status(400).json({
        success: false,
        error: msg.split(':')[0] || 'BAD_REQUEST',
        message: msg,
      });
    }

    console.error('Failed to create sales invoice:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to create sales invoice.',
    });
  }
});

/**
 * PUT /api/admin/invoices/sales/:invoiceId
 * Update draft sales invoice
 */
adminInvoiceRouter.put('/sales/:invoiceId', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser;
    const { invoiceId } = req.params;
    const { invoiceDate, items, billingAddressSnapshot, shippingAddressSnapshot } = req.body;

    const invoice = await InvoiceService.updateSalesInvoice(
      adminSession,
      invoiceId,
      {
        invoiceDate,
        items,
        billingAddressSnapshot,
        shippingAddressSnapshot,
      },
      req
    );

    return res.status(200).json({
      success: true,
      invoice,
      message: `Sales invoice "${invoice.invoiceNumber}" updated successfully.`,
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
    if (msg.includes('INVOICE_IMMUTABLE') || msg.includes('INVALID_ITEM') || msg.includes('EXCESSIVE_DISCOUNT')) {
      return res.status(400).json({
        success: false,
        error: msg.split(':')[0] || 'BAD_REQUEST',
        message: msg,
      });
    }

    console.error('Failed to update sales invoice:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to update sales invoice.',
    });
  }
});

/**
 * POST /api/admin/invoices/sales/:invoiceId/issue
 * Transition sales invoice from DRAFT to ISSUED
 */
adminInvoiceRouter.post('/sales/:invoiceId/issue', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser;
    const { invoiceId } = req.params;

    const invoice = await InvoiceService.issueSalesInvoice(adminSession, invoiceId, req);

    return res.status(200).json({
      success: true,
      invoice,
      accountingStatus: invoice.accountingStatus,
      accountingJournalId: invoice.accountingJournalId,
      accountingVoucherNumber: invoice.accountingVoucherNumber,
      accountingPostedAt: invoice.accountingPostedAt,
      message: `Sales invoice "${invoice.invoiceNumber}" issued and posted to accounting successfully.`,
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
    if (msg.includes('INVOICE_ALREADY_ISSUED') || msg.includes('CANNOT_ISSUE_CANCELLED_INVOICE')) {
      return res.status(400).json({
        success: false,
        error: msg.split(':')[0] || 'BAD_REQUEST',
        message: msg,
      });
    }

    console.error('Failed to issue sales invoice:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to issue sales invoice.',
    });
  }
});

/**
 * POST /api/admin/invoices/sales/:invoiceId/cancel
 * Cancel a sales invoice
 */
adminInvoiceRouter.post('/sales/:invoiceId/cancel', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser;
    const { invoiceId } = req.params;
    const { reason } = req.body || {};

    const invoice = await InvoiceService.cancelSalesInvoice(adminSession, invoiceId, reason, req);

    return res.status(200).json({
      success: true,
      invoice,
      message: `Sales invoice "${invoice.invoiceNumber}" cancelled successfully.`,
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

    console.error('Failed to cancel sales invoice:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to cancel sales invoice.',
    });
  }
});

// =========================================================================
// PURCHASE INVOICE APIS
// =========================================================================

/**
 * GET /api/admin/invoices/purchase
 * List purchase invoices with search, filters, pagination
 */
adminInvoiceRouter.get('/purchase', async (req: Request, res: Response) => {
  try {
    const { search, status, fromDate, toDate, supplierId, invoiceNumber, page, pageSize } = req.query;

    const requestedPageSize = Number(pageSize || 20);
    if (requestedPageSize > 100) {
      return res.status(400).json({
        success: false,
        error: 'PAGE_SIZE_EXCEEDED',
        message: 'Maximum page size allowed is 100.',
      });
    }

    const result = await InvoiceService.listPurchaseInvoices({
      search: search ? String(search) : undefined,
      status: status ? String(status) : undefined,
      fromDate: fromDate ? String(fromDate) : undefined,
      toDate: toDate ? String(toDate) : undefined,
      supplierId: supplierId ? String(supplierId) : undefined,
      invoiceNumber: invoiceNumber ? String(invoiceNumber) : undefined,
      page: page ? Number(page) : 1,
      pageSize: requestedPageSize,
    });

    return res.status(200).json({
      success: true,
      invoices: result.invoices,
      total: result.total,
      page: Number(page || 1),
      pageSize: requestedPageSize,
    });
  } catch (err: any) {
    console.error('Failed to list purchase invoices:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to list purchase invoices.',
    });
  }
});

/**
 * GET /api/admin/invoices/purchase/:invoiceId
 * Retrieve single purchase invoice
 */
adminInvoiceRouter.get('/purchase/:invoiceId', async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const adminSession = (req as any).adminUser;

    const invoice = await InvoiceService.getPurchaseInvoiceById(invoiceId, adminSession, req);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'INVOICE_NOT_FOUND',
        message: `Purchase invoice with ID "${invoiceId}" was not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      invoice,
    });
  } catch (err: any) {
    console.error('Failed to get purchase invoice:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to get purchase invoice.',
    });
  }
});

/**
 * POST /api/admin/invoices/purchase
 * Create a new draft purchase invoice
 */
adminInvoiceRouter.post('/purchase', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser;
    const {
      invoiceDate,
      supplierId,
      supplierType,
      supplierInvoiceNumber,
      items,
      billingAddressSnapshot,
      shippingAddressSnapshot,
      idempotencyKey,
    } = req.body || {};

    const rawBody = req.body || {};
    if (
      rawBody.totalDebit !== undefined ||
      rawBody.totalCredit !== undefined ||
      rawBody.accountingJournalId !== undefined ||
      rawBody.accountingVoucherNumber !== undefined ||
      rawBody.accountingStatus !== undefined ||
      rawBody.accountingPostedAt !== undefined
    ) {
      return res.status(400).json({
        success: false,
        error: 'CLIENT_ACCOUNTING_INJECTION_FORBIDDEN',
        message: 'Client cannot supply accounting metadata.',
      });
    }

    if (
      rawBody.grandTotal !== undefined ||
      rawBody.subtotal !== undefined ||
      rawBody.taxTotal !== undefined ||
      rawBody.taxableTotal !== undefined ||
      rawBody.discountTotal !== undefined
    ) {
      return res.status(400).json({
        success: false,
        error: 'CLIENT_TOTAL_INJECTION_FORBIDDEN',
        message: 'Purchase invoice totals are calculated server-side.',
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'EMPTY_ITEMS',
        message: 'Purchase invoice must have at least one line item.',
      });
    }

    const invoice = await InvoiceService.createPurchaseInvoice(
      adminSession,
      {
        invoiceDate,
        supplierId,
        supplierType,
        supplierInvoiceNumber,
        items,
        billingAddressSnapshot,
        shippingAddressSnapshot,
        idempotencyKey,
      },
      req
    );

    return res.status(201).json({
      success: true,
      invoice,
      message: `Purchase invoice "${invoice.invoiceNumber}" created successfully.`,
    });
  } catch (err: any) {
    const msg = err.message || '';
    if (
      msg.includes('CLIENT_ACCOUNTING_INJECTION_FORBIDDEN') ||
      msg.includes('CLIENT_TOTAL_INJECTION_FORBIDDEN') ||
      msg.includes('INVALID_ITEM') ||
      msg.includes('EMPTY_ITEMS') ||
      msg.includes('EXCESSIVE_DISCOUNT') ||
      msg.includes('INVALID_MONEY_VALUE')
    ) {
      return res.status(400).json({
        success: false,
        error: msg.split(':')[0] || 'BAD_REQUEST',
        message: msg,
      });
    }

    console.error('Failed to create purchase invoice:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to create purchase invoice.',
    });
  }
});

/**
 * PUT /api/admin/invoices/purchase/:invoiceId
 * Update draft purchase invoice
 */
adminInvoiceRouter.put('/purchase/:invoiceId', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser;
    const { invoiceId } = req.params;
    const {
      invoiceDate,
      supplierId,
      supplierType,
      supplierInvoiceNumber,
      items,
      billingAddressSnapshot,
      shippingAddressSnapshot,
    } = req.body || {};

    const rawBody = req.body || {};
    if (
      rawBody.totalDebit !== undefined ||
      rawBody.totalCredit !== undefined ||
      rawBody.accountingJournalId !== undefined ||
      rawBody.accountingVoucherNumber !== undefined ||
      rawBody.accountingStatus !== undefined ||
      rawBody.accountingPostedAt !== undefined
    ) {
      return res.status(400).json({
        success: false,
        error: 'CLIENT_ACCOUNTING_INJECTION_FORBIDDEN',
        message: 'Client cannot supply accounting metadata.',
      });
    }

    if (
      rawBody.grandTotal !== undefined ||
      rawBody.subtotal !== undefined ||
      rawBody.taxTotal !== undefined ||
      rawBody.taxableTotal !== undefined ||
      rawBody.discountTotal !== undefined
    ) {
      return res.status(400).json({
        success: false,
        error: 'CLIENT_TOTAL_INJECTION_FORBIDDEN',
        message: 'Purchase invoice totals are calculated server-side.',
      });
    }

    const invoice = await InvoiceService.updatePurchaseInvoice(
      adminSession,
      invoiceId,
      {
        invoiceDate,
        supplierId,
        supplierType,
        supplierInvoiceNumber,
        items,
        billingAddressSnapshot,
        shippingAddressSnapshot,
      },
      req
    );

    return res.status(200).json({
      success: true,
      invoice,
      message: `Purchase invoice "${invoice.invoiceNumber}" updated successfully.`,
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
    if (
      msg.includes('CLIENT_ACCOUNTING_INJECTION_FORBIDDEN') ||
      msg.includes('CLIENT_TOTAL_INJECTION_FORBIDDEN') ||
      msg.includes('INVOICE_IMMUTABLE') ||
      msg.includes('INVALID_ITEM') ||
      msg.includes('EXCESSIVE_DISCOUNT')
    ) {
      return res.status(400).json({
        success: false,
        error: msg.split(':')[0] || 'BAD_REQUEST',
        message: msg,
      });
    }

    console.error('Failed to update purchase invoice:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to update purchase invoice.',
    });
  }
});

/**
 * POST /api/admin/invoices/purchase/:invoiceId/post
 * Transition purchase invoice from DRAFT to POSTED
 */
adminInvoiceRouter.post('/purchase/:invoiceId/post', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser;
    const { invoiceId } = req.params;

    const invoice = await InvoiceService.postPurchaseInvoice(adminSession, invoiceId, req);

    return res.status(200).json({
      success: true,
      invoice,
      message: `Purchase invoice "${invoice.invoiceNumber}" posted successfully.`,
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
    if (
      msg.includes('INVOICE_ALREADY_POSTED') ||
      msg.includes('CANNOT_POST_CANCELLED_INVOICE') ||
      msg.includes('ACCOUNT_NOT_FOUND') ||
      msg.includes('INACTIVE_ACCOUNT') ||
      msg.includes('PERIOD_CLOSED') ||
      msg.includes('UNBALANCED_JOURNAL') ||
      msg.includes('ACCOUNTING_INTEGRITY_ERROR') ||
      msg.includes('INVALID_ITEMS') ||
      msg.includes('INVALID_INVOICE_NUMBER')
    ) {
      return res.status(400).json({
        success: false,
        error: msg.split(':')[0] || 'BAD_REQUEST',
        message: msg,
      });
    }

    console.error('Failed to post purchase invoice:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to post purchase invoice.',
    });
  }
});

/**
 * POST /api/admin/invoices/purchase/:invoiceId/cancel
 * Cancel a purchase invoice
 */
adminInvoiceRouter.post('/purchase/:invoiceId/cancel', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser;
    const { invoiceId } = req.params;
    const { reason } = req.body || {};

    const invoice = await InvoiceService.cancelPurchaseInvoice(adminSession, invoiceId, reason, req);

    return res.status(200).json({
      success: true,
      invoice,
      message: `Purchase invoice "${invoice.invoiceNumber}" cancelled successfully.`,
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
    if (msg.includes('ACCOUNTING_REVERSAL_REQUIRED')) {
      return res.status(400).json({
        success: false,
        error: 'ACCOUNTING_REVERSAL_REQUIRED',
        message: msg,
      });
    }

    console.error('Failed to cancel purchase invoice:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to cancel purchase invoice.',
    });
  }
});

// =========================================================================
// PHASE 5.5 PART 4: DOCUMENT & PDF ENDPOINTS
// =========================================================================

/**
 * GET /api/admin/invoices/sales/:invoiceId/document
 * Normalized Sales Invoice Document Model (Admin View)
 */
adminInvoiceRouter.get('/sales/:invoiceId/document', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser;
    const { invoiceId } = req.params;

    const document = await InvoiceDocumentService.getSalesInvoiceDocument(invoiceId, {
      isAdmin: true,
      req,
      auditAction: 'VIEW',
      adminUid: adminSession.uid,
      adminName: adminSession.name,
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
    console.error('Failed to fetch sales invoice document:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to fetch sales invoice document.',
    });
  }
});

/**
 * GET /api/admin/invoices/sales/:invoiceId/pdf
 * Download / View Sales Invoice PDF
 */
adminInvoiceRouter.get('/sales/:invoiceId/pdf', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser;
    const { invoiceId } = req.params;

    const document = await InvoiceDocumentService.getSalesInvoiceDocument(invoiceId, {
      isAdmin: true,
      req,
      auditAction: 'EXPORT',
      adminUid: adminSession.uid,
      adminName: adminSession.name,
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
    console.error('Failed to generate sales invoice PDF:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to generate PDF.',
    });
  }
});

/**
 * GET /api/admin/invoices/purchase/:invoiceId/document
 * Normalized Purchase Invoice Document Model (Admin View)
 */
adminInvoiceRouter.get('/purchase/:invoiceId/document', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser;
    const { invoiceId } = req.params;

    const document = await InvoiceDocumentService.getPurchaseInvoiceDocument(invoiceId, {
      isAdmin: true,
      req,
      auditAction: 'VIEW',
      adminUid: adminSession.uid,
      adminName: adminSession.name,
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
    console.error('Failed to fetch purchase invoice document:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to fetch purchase invoice document.',
    });
  }
});

/**
 * GET /api/admin/invoices/purchase/:invoiceId/pdf
 * Download / View Purchase Invoice PDF
 */
adminInvoiceRouter.get('/purchase/:invoiceId/pdf', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser;
    const { invoiceId } = req.params;

    const document = await InvoiceDocumentService.getPurchaseInvoiceDocument(invoiceId, {
      isAdmin: true,
      req,
      auditAction: 'EXPORT',
      adminUid: adminSession.uid,
      adminName: adminSession.name,
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
    console.error('Failed to generate purchase invoice PDF:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: err.message || 'Failed to generate PDF.',
    });
  }
});
