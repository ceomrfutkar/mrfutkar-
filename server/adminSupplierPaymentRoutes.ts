/**
 * MR FUTKAR — Admin Supplier Payment Router (Phase 5.8 Part 1)
 * Strictly SUPER_ADMIN authorized and server-authoritative
 */

import { Router, Request, Response } from 'express';
import { requireSuperAdmin } from './adminAuth';
import { AdminSession } from '../src/types/admin';
import { SupplierPaymentService } from './supplierPaymentService';
import { SupplierPaymentReportService } from './supplierPaymentReportService';
import {
  SupplierPaymentPaymentMethod,
  SupplierPaymentStatus,
  SupplierStatementTransactionType,
} from '../src/types/supplierPayment';

export const adminSupplierPaymentRouter = Router();

// Enforce Super Admin authorization on all supplier payment routes
adminSupplierPaymentRouter.use(requireSuperAdmin());

function sanitizeError(error: any): string {
  if (!error) return 'Internal server error';
  let msg = typeof error === 'string' ? error : error.message || String(error);
  msg = msg.replace(/MRFUTKAR_INTERNAL_SERVER_AUTHORITY[a-zA-Z0-9_]*/g, '[REDACTED_AUTHORITY]');
  msg = msg.replace(/[a-zA-Z0-9_\-\.]{20,}@[a-zA-Z0-9_\-\.]+/g, '[REDACTED_IDENTITY]');
  msg = msg.replace(/\/[\w\-\.\/]+\.ts:\d+:\d+/g, '');
  return msg;
}

/**
 * GET /api/admin/accounting/supplier-payments
 * List supplier payments with optional pagination and filters
 */
adminSupplierPaymentRouter.get('/', async (req: Request, res: Response) => {
  try {
    const filters = {
      supplierId: req.query.supplierId as string | undefined,
      paymentMethod: req.query.paymentMethod as SupplierPaymentPaymentMethod | undefined,
      status: req.query.status as SupplierPaymentStatus | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? parseInt(String(req.query.page), 10) : undefined,
      pageSize: req.query.pageSize ? parseInt(String(req.query.pageSize), 10) : undefined,
    };

    const result = await SupplierPaymentService.listSupplierPayments(filters);
    return res.status(200).json(result);
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error listing supplier payments:', msg);

    if (
      msg.includes('PAGE_SIZE_EXCEEDED') ||
      msg.includes('INVALID_DATE_FORMAT') ||
      msg.includes('INVALID_DATE_RANGE')
    ) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: sanitizeError(msg),
      });
    }

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: sanitizeError(msg),
    });
  }
});

// =========================================================================
// PHASE 5.8 PART 4: SUPPLIER PAYMENT REPORTING & LEDGER ENDPOINTS
// Defined BEFORE /:paymentId to prevent parameterized route collision
// =========================================================================

/**
 * GET /api/admin/accounting/supplier-payments/statement/:supplierId?
 * Read-only server-authoritative supplier statement
 */
adminSupplierPaymentRouter.get('/statement/:supplierId?', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const supplierId = (req.params.supplierId || req.query.supplierId || '') as string;

    const filter = {
      supplierId,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      transactionType: req.query.transactionType as SupplierStatementTransactionType | undefined,
      status: req.query.status as string | undefined,
      page: req.query.page ? parseInt(String(req.query.page), 10) : undefined,
      pageSize: req.query.pageSize ? parseInt(String(req.query.pageSize), 10) : undefined,
    };

    const statement = await SupplierPaymentReportService.getSupplierStatement(adminSession, filter);
    return res.status(200).json(statement);
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error fetching supplier statement:', msg);

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: sanitizeError(msg),
      });
    }

    if (
      msg.includes('MISSING_SUPPLIER_ID') ||
      msg.includes('INVALID_SUPPLIER_ID') ||
      msg.includes('CLIENT_FIELD_INJECTION_FORBIDDEN') ||
      msg.includes('INVALID_DATE_FORMAT') ||
      msg.includes('INVALID_DATE_RANGE') ||
      msg.includes('PAGE_SIZE_EXCEEDED')
    ) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: sanitizeError(msg),
      });
    }

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: sanitizeError(msg),
    });
  }
});

/**
 * GET /api/admin/accounting/supplier-payments/history
 * Read-only supplier payment history with allocation and reversal tracking
 */
adminSupplierPaymentRouter.get('/history', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;

    const filter = {
      supplierId: req.query.supplierId as string | undefined,
      paymentMethod: req.query.paymentMethod as SupplierPaymentPaymentMethod | undefined,
      status: req.query.status as SupplierPaymentStatus | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? parseInt(String(req.query.page), 10) : undefined,
      pageSize: req.query.pageSize ? parseInt(String(req.query.pageSize), 10) : undefined,
    };

    const result = await SupplierPaymentReportService.getSupplierPaymentHistory(adminSession, filter);
    return res.status(200).json(result);
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error fetching supplier payment history:', msg);

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: sanitizeError(msg),
      });
    }

    if (
      msg.includes('CLIENT_FIELD_INJECTION_FORBIDDEN') ||
      msg.includes('INVALID_DATE_FORMAT') ||
      msg.includes('INVALID_DATE_RANGE') ||
      msg.includes('PAGE_SIZE_EXCEEDED')
    ) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: sanitizeError(msg),
      });
    }

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: sanitizeError(msg),
    });
  }
});

/**
 * GET /api/admin/accounting/supplier-payments/outstanding-invoices/:supplierId
 * Read-only outstanding purchase invoices for a canonical supplier
 */
adminSupplierPaymentRouter.get('/outstanding-invoices/:supplierId', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const supplierId = req.params.supplierId;

    const result = await SupplierPaymentReportService.getOutstandingPurchaseInvoices(adminSession, supplierId);
    return res.status(200).json(result);
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error fetching outstanding invoices:', msg);

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('MISSING_SUPPLIER_ID')) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: sanitizeError(msg),
      });
    }

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: sanitizeError(msg),
    });
  }
});

/**
 * GET /api/admin/accounting/supplier-payments/summary/:supplierId?
 * Read-only supplier accounting summary
 */
adminSupplierPaymentRouter.get('/summary/:supplierId?', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const supplierId = (req.params.supplierId || req.query.supplierId) as string | undefined;

    const filters = {
      supplierId: supplierId ? String(supplierId).trim() : undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    };

    const summary = await SupplierPaymentReportService.getSupplierAccountingSummary(adminSession, filters);
    return res.status(200).json(summary);
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error fetching supplier accounting summary:', msg);

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: sanitizeError(msg),
      });
    }

    if (
      msg.includes('CLIENT_FIELD_INJECTION_FORBIDDEN') ||
      msg.includes('INVALID_DATE_FORMAT') ||
      msg.includes('INVALID_DATE_RANGE')
    ) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: sanitizeError(msg),
      });
    }

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: sanitizeError(msg),
    });
  }
});

// =========================================================================
// PHASE 5.8 PART 6: SUPPLIER ACCOUNTING REPORT EXPORT ENDPOINTS
// Defined BEFORE /:paymentId to prevent parameterized route collision
// =========================================================================

/**
 * GET /api/admin/accounting/supplier-payments/export/statement/:supplierId?
 * Download read-only CSV statement of account for a supplier
 */
adminSupplierPaymentRouter.get('/export/statement/:supplierId?', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const supplierId = (req.params.supplierId || req.query.supplierId || '') as string;

    const filter = {
      supplierId,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      transactionType: req.query.transactionType as SupplierStatementTransactionType | undefined,
      status: req.query.status as string | undefined,
    };

    const result = await SupplierPaymentReportService.exportSupplierStatementCsv(adminSession, filter);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.status(200).send(result.csv);
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error exporting supplier statement CSV:', msg);

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: sanitizeError(msg) });
    }
    if (
      msg.includes('MISSING_SUPPLIER_ID') ||
      msg.includes('CLIENT_FIELD_INJECTION_FORBIDDEN') ||
      msg.includes('INVALID_DATE_FORMAT') ||
      msg.includes('INVALID_DATE_RANGE')
    ) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: sanitizeError(msg) });
    }
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: sanitizeError(msg) });
  }
});

/**
 * GET /api/admin/accounting/supplier-payments/export/history
 * Download read-only CSV supplier payment history
 */
adminSupplierPaymentRouter.get('/export/history', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;

    const filter = {
      supplierId: req.query.supplierId as string | undefined,
      paymentMethod: req.query.paymentMethod as SupplierPaymentPaymentMethod | undefined,
      status: req.query.status as SupplierPaymentStatus | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      search: req.query.search as string | undefined,
    };

    const result = await SupplierPaymentReportService.exportSupplierPaymentHistoryCsv(adminSession, filter);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.status(200).send(result.csv);
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error exporting supplier payments CSV:', msg);

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: sanitizeError(msg) });
    }
    if (
      msg.includes('CLIENT_FIELD_INJECTION_FORBIDDEN') ||
      msg.includes('INVALID_DATE_FORMAT') ||
      msg.includes('INVALID_DATE_RANGE')
    ) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: sanitizeError(msg) });
    }
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: sanitizeError(msg) });
  }
});

/**
 * GET /api/admin/accounting/supplier-payments/export/outstanding-invoices/:supplierId
 * Download read-only CSV outstanding purchase invoices
 */
adminSupplierPaymentRouter.get('/export/outstanding-invoices/:supplierId', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const supplierId = req.params.supplierId;

    const result = await SupplierPaymentReportService.exportOutstandingPurchaseInvoicesCsv(adminSession, supplierId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.status(200).send(result.csv);
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error exporting outstanding purchase invoices CSV:', msg);

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: sanitizeError(msg) });
    }
    if (msg.includes('MISSING_SUPPLIER_ID')) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: sanitizeError(msg) });
    }
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: sanitizeError(msg) });
  }
});

/**
 * GET /api/admin/accounting/supplier-payments/export/summary/:supplierId?
 * Download read-only CSV supplier accounting summary
 */
adminSupplierPaymentRouter.get('/export/summary/:supplierId?', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const supplierId = (req.params.supplierId || req.query.supplierId) as string | undefined;

    const filters = {
      supplierId: supplierId ? String(supplierId).trim() : undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    };

    const result = await SupplierPaymentReportService.exportSupplierAccountingSummaryCsv(adminSession, filters);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.status(200).send(result.csv);
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error exporting supplier summary CSV:', msg);

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: sanitizeError(msg) });
    }
    if (
      msg.includes('CLIENT_FIELD_INJECTION_FORBIDDEN') ||
      msg.includes('INVALID_DATE_FORMAT') ||
      msg.includes('INVALID_DATE_RANGE')
    ) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: sanitizeError(msg) });
    }
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: sanitizeError(msg) });
  }
});

/**
 * GET /api/admin/accounting/supplier-payments/:paymentId
 * Get details of a single supplier payment
 */
adminSupplierPaymentRouter.get('/:paymentId', async (req: Request, res: Response) => {
  try {
    const paymentId = req.params.paymentId;
    const payment = await SupplierPaymentService.getSupplierPaymentById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: `Supplier payment "${paymentId}" not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      payment,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error fetching supplier payment:', msg);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: sanitizeError(msg),
    });
  }
});

/**
 * POST /api/admin/accounting/supplier-payments
 * Create a new draft supplier payment
 */
adminSupplierPaymentRouter.post('/', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const result = await SupplierPaymentService.createSupplierPayment(adminSession, req.body);

    const statusCode = result.isIdempotentReplay ? 200 : 201;
    return res.status(statusCode).json({
      success: true,
      payment: result.payment,
      isIdempotentReplay: result.isIdempotentReplay || false,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error creating supplier payment:', msg);

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: sanitizeError(msg),
      });
    }

    if (
      msg.includes('CLIENT_FIELD_INJECTION_FORBIDDEN') ||
      msg.includes('INVALID_SUPPLIER_ID') ||
      msg.includes('SUPPLIER_NOT_FOUND') ||
      msg.includes('INVALID_AMOUNT') ||
      msg.includes('INVALID_PAYMENT_METHOD') ||
      msg.includes('PROHIBITED_CASH_ACCOUNT') ||
      msg.includes('INVALID_CASH_BANK_ACCOUNT') ||
      msg.includes('ACCOUNT_NOT_FOUND') ||
      msg.includes('INACTIVE_ACCOUNT') ||
      msg.includes('INVALID_DATE_FORMAT') ||
      msg.includes('ACCOUNTING_PERIOD_CLOSED') ||
      msg.includes('REFERENCE_NUMBER_TOO_LONG') ||
      msg.includes('NOTES_TOO_LONG') ||
      msg.includes('INVALID_IDEMPOTENCY_KEY')
    ) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('IDEMPOTENCY_CONFLICT')) {
      return res.status(409).json({
        success: false,
        error: 'IDEMPOTENCY_CONFLICT',
        message: sanitizeError(msg),
      });
    }

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: sanitizeError(msg),
    });
  }
});

/**
 * POST /api/admin/accounting/supplier-payments/:paymentId/post
 * Post a supplier payment (DRAFT -> POSTED)
 * Generates AP 2100 DR / Cash or Bank CR double-entry journal atomically
 */
adminSupplierPaymentRouter.post('/:paymentId/post', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const paymentId = req.params.paymentId;

    const result = await SupplierPaymentService.postSupplierPayment(
      adminSession,
      paymentId,
      req.body,
      req
    );

    return res.status(200).json({
      success: true,
      payment: result.payment,
      journal: result.journal,
      isIdempotentReplay: result.isIdempotentReplay || false,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error posting supplier payment:', msg);

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('PAYMENT_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: sanitizeError(msg),
      });
    }

    if (
      msg.includes('CLIENT_FIELD_INJECTION_FORBIDDEN') ||
      msg.includes('INVALID_PAYMENT_STATUS') ||
      msg.includes('INVALID_AMOUNT') ||
      msg.includes('INVALID_PAYMENT_METHOD') ||
      msg.includes('ACCOUNTING_PERIOD_CLOSED') ||
      msg.includes('UNBALANCED_JOURNAL') ||
      msg.includes('INVALID_IDEMPOTENCY_KEY')
    ) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('IDEMPOTENCY_CONFLICT')) {
      return res.status(409).json({
        success: false,
        error: 'IDEMPOTENCY_CONFLICT',
        message: sanitizeError(msg),
      });
    }

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: sanitizeError(msg),
    });
  }
});

/**
 * GET /api/admin/accounting/supplier-payments/:paymentId/eligible-invoices
 * Get eligible outstanding purchase invoices for supplier payment allocation
 */
adminSupplierPaymentRouter.get('/:paymentId/eligible-invoices', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const paymentId = req.params.paymentId;

    const invoices = await SupplierPaymentService.getEligibleInvoicesForPayment(adminSession, paymentId);

    return res.status(200).json({
      success: true,
      invoices,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error fetching eligible invoices for supplier payment:', msg);

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('PAYMENT_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: sanitizeError(msg),
      });
    }

    if (
      msg.includes('INVALID_PAYMENT_ID') ||
      msg.includes('INVALID_PAYMENT_STATUS')
    ) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: sanitizeError(msg),
      });
    }

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: sanitizeError(msg),
    });
  }
});

/**
 * POST /api/admin/accounting/supplier-payments/:paymentId/allocate
 * Allocate a posted supplier payment against one or more purchase invoices
 */
adminSupplierPaymentRouter.post('/:paymentId/allocate', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const paymentId = req.params.paymentId;

    const result = await SupplierPaymentService.allocateSupplierPayment(
      adminSession,
      paymentId,
      req.body,
      req
    );

    return res.status(200).json({
      success: true,
      payment: result.payment,
      isIdempotentReplay: result.isIdempotentReplay || false,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error allocating supplier payment:', msg);

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: sanitizeError(msg),
      });
    }

    if (
      msg.includes('PAYMENT_NOT_FOUND') ||
      msg.includes('INVOICE_NOT_FOUND')
    ) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('IDEMPOTENCY_CONFLICT')) {
      return res.status(409).json({
        success: false,
        error: 'IDEMPOTENCY_CONFLICT',
        message: sanitizeError(msg),
      });
    }

    if (
      msg.includes('CLIENT_FIELD_INJECTION_FORBIDDEN') ||
      msg.includes('INVALID_ALLOCATIONS') ||
      msg.includes('INVALID_ALLOCATION_ITEM') ||
      msg.includes('MISSING_INVOICE_ID') ||
      msg.includes('DUPLICATE_INVOICE_IN_ALLOCATION') ||
      msg.includes('INVALID_ALLOCATION_AMOUNT') ||
      msg.includes('INVALID_PAYMENT_STATUS') ||
      msg.includes('ALLOCATION_EXCEEDS_PAYMENT_AMOUNT') ||
      msg.includes('INVALID_INVOICE_STATUS') ||
      msg.includes('INVOICE_NOT_POSTED') ||
      msg.includes('CROSS_SUPPLIER_ALLOCATION_FORBIDDEN') ||
      msg.includes('ALLOCATION_EXCEEDS_INVOICE_OUTSTANDING') ||
      msg.includes('INVOICE_ALREADY_FULLY_PAID') ||
      msg.includes('INVALID_IDEMPOTENCY_KEY') ||
      msg.includes('INVALID_PAYMENT_ID')
    ) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: sanitizeError(msg),
      });
    }

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: sanitizeError(msg),
    });
  }
});

/**
 * POST /api/admin/accounting/supplier-payments/:paymentId/reverse
 * Authoritatively reverses a posted supplier payment and restores invoice balances.
 * Strictly SUPER_ADMIN only.
 */
adminSupplierPaymentRouter.post('/:paymentId/reverse', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const paymentId = req.params.paymentId;

    const result = await SupplierPaymentService.reverseSupplierPayment(
      adminSession,
      paymentId,
      req.body,
      req
    );

    return res.status(200).json({
      success: true,
      payment: result.payment,
      reversalJournal: result.reversalJournal,
      isIdempotentReplay: result.isIdempotentReplay || false,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error reversing supplier payment:', msg);

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: sanitizeError(msg),
      });
    }

    if (
      msg.includes('PAYMENT_NOT_FOUND') ||
      msg.includes('INVOICE_NOT_FOUND')
    ) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('IDEMPOTENCY_CONFLICT')) {
      return res.status(409).json({
        success: false,
        error: 'IDEMPOTENCY_CONFLICT',
        message: sanitizeError(msg),
      });
    }

    if (
      msg.includes('CLIENT_FIELD_INJECTION_FORBIDDEN') ||
      msg.includes('CANNOT_REVERSE_DRAFT_PAYMENT') ||
      msg.includes('PAYMENT_ALREADY_REVERSED') ||
      msg.includes('INVALID_PAYMENT_STATUS') ||
      msg.includes('MISSING_PAYMENT_JOURNAL') ||
      msg.includes('INVALID_SUPPLIER_ID') ||
      msg.includes('CROSS_SUPPLIER_INVOICE_MISMATCH') ||
      msg.includes('INVALID_REASON') ||
      msg.includes('INVALID_IDEMPOTENCY_KEY') ||
      msg.includes('INVALID_PAYMENT_ID') ||
      msg.includes('ACCOUNTING_PERIOD_CLOSED') ||
      msg.includes('PERIOD_CLOSED')
    ) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: sanitizeError(msg),
      });
    }

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: sanitizeError(msg),
    });
  }
});
