/**
 * MR FUTKAR — Admin Customer AR Reporting Router (Phase 5.9 Part 2)
 * Strictly SUPER_ADMIN authorized and server-authoritative read-only customer reports.
 */

import { Router, Request, Response } from 'express';
import { requireSuperAdmin } from './adminAuth';
import { AdminSession } from '../src/types/admin';
import { CustomerReportService } from './customerReportService';
import {
  CustomerStatementTransactionType,
} from '../src/types/customerReport';
import {
  CustomerReceiptPaymentMethod,
  CustomerReceiptStatus,
} from '../src/types/customerReceipt';

export const adminCustomerReportRouter = Router();

// Enforce Super Admin authorization on all customer report routes
adminCustomerReportRouter.use(requireSuperAdmin());

function sanitizeError(error: any): string {
  if (!error) return 'Internal server error';
  let msg = typeof error === 'string' ? error : error.message || String(error);
  msg = msg.replace(/MRFUTKAR_INTERNAL_SERVER_AUTHORITY[a-zA-Z0-9_]*/g, '[REDACTED_AUTHORITY]');
  msg = msg.replace(/[a-zA-Z0-9_\-\.]{20,}@[a-zA-Z0-9_\-\.]+/g, '[REDACTED_IDENTITY]');
  msg = msg.replace(/\/[\w\-\.\/]+\.ts:\d+:\d+/g, '');
  return msg;
}

// =========================================================================
// PHASE 5.9 PART 3: CUSTOMER ACCOUNTING REPORT EXPORT ENDPOINTS
// Defined before parameterized wildcard routes to prevent route collisions
// =========================================================================

/**
 * GET /api/admin/accounting/customer-reports/export/statement/:customerId?
 * Download read-only CSV statement of account for a customer
 */
adminCustomerReportRouter.get('/export/statement/:customerId?', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const customerId = (req.params.customerId || req.query.customerId || '') as string;

    const filter = {
      customerId,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      transactionType: req.query.transactionType as CustomerStatementTransactionType | undefined,
      status: req.query.status as string | undefined,
    };

    const result = await CustomerReportService.exportCustomerStatementCsv(adminSession, filter);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.status(200).send(result.csv);
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error exporting customer statement CSV:', msg);

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: sanitizeError(msg) });
    }
    if (
      msg.includes('MISSING_CUSTOMER_ID') ||
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
 * GET /api/admin/accounting/customer-reports/export/receipt-history/:customerId?
 * GET /api/admin/accounting/customer-reports/export/history
 * Download read-only CSV customer receipt history
 */
const handleExportReceiptHistory = async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const rawCustomerId = req.params.customerId || req.query.customerId;
    const customerId = rawCustomerId !== undefined ? String(rawCustomerId).trim() : undefined;

    const filter = {
      customerId,
      paymentMethod: req.query.paymentMethod as CustomerReceiptPaymentMethod | undefined,
      status: req.query.status as CustomerReceiptStatus | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      search: req.query.search as string | undefined,
    };

    const result = await CustomerReportService.exportCustomerReceiptHistoryCsv(adminSession, filter);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.status(200).send(result.csv);
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error exporting customer receipt history CSV:', msg);

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
};

adminCustomerReportRouter.get('/export/receipt-history/:customerId?', handleExportReceiptHistory);
adminCustomerReportRouter.get('/export/history', handleExportReceiptHistory);

/**
 * GET /api/admin/accounting/customer-reports/export/outstanding-invoices/:customerId
 * Download read-only CSV outstanding sales invoices
 */
adminCustomerReportRouter.get('/export/outstanding-invoices/:customerId', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const customerId = req.params.customerId || (req.query.customerId as string);

    const result = await CustomerReportService.exportOutstandingSalesInvoicesCsv(adminSession, customerId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.status(200).send(result.csv);
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error exporting outstanding sales invoices CSV:', msg);

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: sanitizeError(msg) });
    }
    if (msg.includes('MISSING_CUSTOMER_ID')) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: sanitizeError(msg) });
    }
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: sanitizeError(msg) });
  }
});

/**
 * GET /api/admin/accounting/customer-reports/export/summary/:customerId?
 * Download read-only CSV customer accounting summary
 */
adminCustomerReportRouter.get('/export/summary/:customerId?', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const rawCustomerId = req.params.customerId || req.query.customerId;
    const customerId = rawCustomerId !== undefined ? String(rawCustomerId).trim() : undefined;

    const filters = {
      customerId,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    };

    const result = await CustomerReportService.exportCustomerAccountingSummaryCsv(adminSession, filters);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.status(200).send(result.csv);
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error exporting customer summary CSV:', msg);

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
 * GET /api/admin/accounting/customer-reports/statement/:customerId?
 * Read-only server-authoritative customer statement derived from Account 1300
 */
adminCustomerReportRouter.get('/statement/:customerId?', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const customerId = (req.params.customerId || req.query.customerId || '') as string;

    const filter = {
      customerId,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      transactionType: req.query.transactionType as CustomerStatementTransactionType | undefined,
      status: req.query.status as string | undefined,
      page: req.query.page ? parseInt(String(req.query.page), 10) : undefined,
      pageSize: req.query.pageSize ? parseInt(String(req.query.pageSize), 10) : undefined,
    };

    const statement = await CustomerReportService.getCustomerStatement(adminSession, filter);
    return res.status(200).json(statement);
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error fetching customer statement:', msg);

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: sanitizeError(msg),
      });
    }

    if (
      msg.includes('MISSING_CUSTOMER_ID') ||
      msg.includes('INVALID_CUSTOMER_ID') ||
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
 * GET /api/admin/accounting/customer-reports/receipt-history/:customerId?
 * Read-only customer receipt history with allocation and reversal tracking
 */
adminCustomerReportRouter.get('/receipt-history/:customerId?', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const rawCustomerId = req.params.customerId || req.query.customerId;
    const customerId = rawCustomerId !== undefined ? String(rawCustomerId).trim() : undefined;

    const filter = {
      customerId,
      paymentMethod: req.query.paymentMethod as CustomerReceiptPaymentMethod | undefined,
      status: req.query.status as CustomerReceiptStatus | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? parseInt(String(req.query.page), 10) : undefined,
      pageSize: req.query.pageSize ? parseInt(String(req.query.pageSize), 10) : undefined,
    };

    const result = await CustomerReportService.getCustomerReceiptHistory(adminSession, filter);
    return res.status(200).json(result);
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error fetching customer receipt history:', msg);

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: sanitizeError(msg),
      });
    }

    if (
      msg.includes('MISSING_CUSTOMER_ID') ||
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
 * GET /api/admin/accounting/customer-reports/outstanding-invoices/:customerId
 * Read-only outstanding sales invoices for a canonical customer
 */
adminCustomerReportRouter.get('/outstanding-invoices/:customerId', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const customerId = req.params.customerId || (req.query.customerId as string);

    const result = await CustomerReportService.getOutstandingSalesInvoices(adminSession, customerId);
    return res.status(200).json(result);
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error fetching outstanding sales invoices:', msg);

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('MISSING_CUSTOMER_ID')) {
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
 * GET /api/admin/accounting/customer-reports/summary/:customerId?
 * Read-only customer accounting summary
 */
adminCustomerReportRouter.get('/summary/:customerId?', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const rawCustomerId = req.params.customerId || req.query.customerId;
    const customerId = rawCustomerId !== undefined ? String(rawCustomerId).trim() : undefined;

    const filters = {
      customerId,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    };

    const summary = await CustomerReportService.getCustomerAccountingSummary(adminSession, filters);
    return res.status(200).json(summary);
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error fetching customer accounting summary:', msg);

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: sanitizeError(msg),
      });
    }

    if (
      msg.includes('MISSING_CUSTOMER_ID') ||
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
