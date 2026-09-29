/**
 * MR FUTKAR — Admin Customer & Supplier Ledger Router (Phase 5.7 Part 1)
 * Strictly SUPER_ADMIN authorized and server-authoritative
 */

import { Router, Request, Response } from 'express';
import { requireSuperAdmin, logAdminAudit } from './adminAuth';
import { AdminSession } from '../src/types/admin';
import { PartyLedgerService } from './partyLedgerService';

export const adminPartyLedgerRouter = Router();

// Enforce Super Admin authorization on party ledger routes
adminPartyLedgerRouter.use(requireSuperAdmin());

function sanitizeError(error: any): string {
  if (!error) return 'Internal server error';
  let msg = typeof error === 'string' ? error : error.message || String(error);
  msg = msg.replace(/MRFUTKAR_INTERNAL_SERVER_AUTHORITY[a-zA-Z0-9_]*/g, '[REDACTED_AUTHORITY]');
  msg = msg.replace(/[a-zA-Z0-9_\-\.]{20,}@[a-zA-Z0-9_\-\.]+/g, '[REDACTED_IDENTITY]');
  msg = msg.replace(/\/[\w\-\.\/]+\.ts:\d+:\d+/g, '');
  return msg;
}

// =========================================================================
// CUSTOMER LEDGER ROUTES
// =========================================================================

/**
 * GET /api/admin/accounting/customer-ledger/summary
 * Summary of all kirana customer receivables and GL 1300 reconciliation
 */
adminPartyLedgerRouter.get('/customer-ledger/summary', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const filters = {
      search: typeof req.query.search === 'string' ? req.query.search.trim() : undefined,
      fromDate: typeof req.query.fromDate === 'string' ? req.query.fromDate.trim() : undefined,
      toDate: typeof req.query.toDate === 'string' ? req.query.toDate.trim() : undefined,
    };

    const result = await PartyLedgerService.getCustomerLedgerSummary(filters);

    if (adminSession) {
      await logAdminAudit({
        action: 'CUSTOMER_LEDGER_VIEWED' as any,
        adminUid: adminSession.uid,
        adminName: adminSession.name,
        targetType: 'CUSTOMER_LEDGER',
        targetId: 'ALL_CUSTOMERS_SUMMARY',
        metadata: {
          search: filters.search || null,
          totalCustomers: result.totalCount,
          totalOutstandingReceivable: result.aggregate.totalOutstandingReceivable,
        },
        req,
      });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    const msg = error.message || String(error);
    const errorCode = msg.includes(':') ? msg.split(':')[0].trim() : 'CUSTOMER_LEDGER_SUMMARY_ERROR';
    return res.status(400).json({
      success: false,
      error: errorCode,
      message: sanitizeError(msg),
    });
  }
});

/**
 * GET /api/admin/accounting/customer-ledger/:customerId
 * Detailed customer ledger statement for a specific customer
 */
adminPartyLedgerRouter.get('/customer-ledger/:customerId', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const customerId = req.params.customerId;

    const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate.trim() : undefined;
    const toDate = typeof req.query.toDate === 'string' ? req.query.toDate.trim() : undefined;
    const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
    const pageSize = req.query.pageSize ? parseInt(String(req.query.pageSize), 10) : undefined;

    const result = await PartyLedgerService.getCustomerLedger({
      customerId,
      fromDate,
      toDate,
      page,
      pageSize,
    });

    if (adminSession) {
      await logAdminAudit({
        action: 'CUSTOMER_LEDGER_VIEWED' as any,
        adminUid: adminSession.uid,
        adminName: adminSession.name,
        targetType: 'CUSTOMER_LEDGER',
        targetId: customerId,
        metadata: {
          customerId,
          shopName: result.customer.shopName,
          openingBalance: result.openingBalance,
          closingBalance: result.closingBalance,
          entriesCount: result.entries.length,
        },
        req,
      });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    const msg = error.message || String(error);
    const errorCode = msg.includes(':') ? msg.split(':')[0].trim() : 'CUSTOMER_LEDGER_ERROR';
    let status = 400;
    if (errorCode === 'PAGE_SIZE_EXCEEDED') status = 400;
    else if (errorCode === 'ACCOUNT_NOT_FOUND') status = 404;

    return res.status(status).json({
      success: false,
      error: errorCode,
      message: sanitizeError(msg),
    });
  }
});

/**
 * GET /api/admin/accounting/customer-ledger
 * Route dispatcher:
 * - If customerId is provided in query: returns detailed statement
 * - If not: returns summary across all customers
 */
adminPartyLedgerRouter.get('/customer-ledger', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const customerId = typeof req.query.customerId === 'string' ? req.query.customerId.trim() : '';

    if (customerId) {
      const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate.trim() : undefined;
      const toDate = typeof req.query.toDate === 'string' ? req.query.toDate.trim() : undefined;
      const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
      const pageSize = req.query.pageSize ? parseInt(String(req.query.pageSize), 10) : undefined;

      const result = await PartyLedgerService.getCustomerLedger({
        customerId,
        fromDate,
        toDate,
        page,
        pageSize,
      });

      if (adminSession) {
        await logAdminAudit({
          action: 'CUSTOMER_LEDGER_VIEWED' as any,
          adminUid: adminSession.uid,
          adminName: adminSession.name,
          targetType: 'CUSTOMER_LEDGER',
          targetId: customerId,
          metadata: {
            customerId,
            shopName: result.customer.shopName,
            closingBalance: result.closingBalance,
          },
          req,
        });
      }

      return res.status(200).json(result);
    }

    // Default: summary
    const filters = {
      search: typeof req.query.search === 'string' ? req.query.search.trim() : undefined,
      fromDate: typeof req.query.fromDate === 'string' ? req.query.fromDate.trim() : undefined,
      toDate: typeof req.query.toDate === 'string' ? req.query.toDate.trim() : undefined,
    };

    const result = await PartyLedgerService.getCustomerLedgerSummary(filters);
    return res.status(200).json(result);
  } catch (error: any) {
    const msg = error.message || String(error);
    const errorCode = msg.includes(':') ? msg.split(':')[0].trim() : 'CUSTOMER_LEDGER_ERROR';
    let status = 400;
    if (errorCode === 'PAGE_SIZE_EXCEEDED') status = 400;

    return res.status(status).json({
      success: false,
      error: errorCode,
      message: sanitizeError(msg),
    });
  }
});

// =========================================================================
// SUPPLIER LEDGER ROUTES
// =========================================================================

/**
 * GET /api/admin/accounting/supplier-ledger/summary
 * Summary of all FMCG supplier payables and GL 2100 reconciliation
 */
adminPartyLedgerRouter.get('/supplier-ledger/summary', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const filters = {
      search: typeof req.query.search === 'string' ? req.query.search.trim() : undefined,
      fromDate: typeof req.query.fromDate === 'string' ? req.query.fromDate.trim() : undefined,
      toDate: typeof req.query.toDate === 'string' ? req.query.toDate.trim() : undefined,
    };

    const result = await PartyLedgerService.getSupplierLedgerSummary(filters);

    if (adminSession) {
      await logAdminAudit({
        action: 'SUPPLIER_LEDGER_VIEWED' as any,
        adminUid: adminSession.uid,
        adminName: adminSession.name,
        targetType: 'SUPPLIER_LEDGER',
        targetId: 'ALL_SUPPLIERS_SUMMARY',
        metadata: {
          search: filters.search || null,
          totalSuppliers: result.totalCount,
          totalOutstandingPayable: result.aggregate.totalOutstandingPayable,
        },
        req,
      });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    const msg = error.message || String(error);
    const errorCode = msg.includes(':') ? msg.split(':')[0].trim() : 'SUPPLIER_LEDGER_SUMMARY_ERROR';
    return res.status(400).json({
      success: false,
      error: errorCode,
      message: sanitizeError(msg),
    });
  }
});

/**
 * GET /api/admin/accounting/supplier-ledger/:supplierId
 * Detailed supplier ledger statement for a specific supplier
 */
adminPartyLedgerRouter.get('/supplier-ledger/:supplierId', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const supplierId = req.params.supplierId;

    const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate.trim() : undefined;
    const toDate = typeof req.query.toDate === 'string' ? req.query.toDate.trim() : undefined;
    const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
    const pageSize = req.query.pageSize ? parseInt(String(req.query.pageSize), 10) : undefined;

    const result = await PartyLedgerService.getSupplierLedger({
      supplierId,
      fromDate,
      toDate,
      page,
      pageSize,
    });

    if (adminSession) {
      await logAdminAudit({
        action: 'SUPPLIER_LEDGER_VIEWED' as any,
        adminUid: adminSession.uid,
        adminName: adminSession.name,
        targetType: 'SUPPLIER_LEDGER',
        targetId: supplierId,
        metadata: {
          supplierId,
          businessName: result.supplier.businessName,
          openingBalance: result.openingBalance,
          closingBalance: result.closingBalance,
          entriesCount: result.entries.length,
        },
        req,
      });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    const msg = error.message || String(error);
    const errorCode = msg.includes(':') ? msg.split(':')[0].trim() : 'SUPPLIER_LEDGER_ERROR';
    let status = 400;
    if (errorCode === 'PAGE_SIZE_EXCEEDED') status = 400;
    else if (errorCode === 'ACCOUNT_NOT_FOUND') status = 404;

    return res.status(status).json({
      success: false,
      error: errorCode,
      message: sanitizeError(msg),
    });
  }
});

/**
 * GET /api/admin/accounting/supplier-ledger
 * Route dispatcher:
 * - If supplierId is provided in query: returns detailed statement
 * - If not: returns summary across all suppliers
 */
adminPartyLedgerRouter.get('/supplier-ledger', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const supplierId = typeof req.query.supplierId === 'string' ? req.query.supplierId.trim() : '';

    if (supplierId) {
      const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate.trim() : undefined;
      const toDate = typeof req.query.toDate === 'string' ? req.query.toDate.trim() : undefined;
      const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
      const pageSize = req.query.pageSize ? parseInt(String(req.query.pageSize), 10) : undefined;

      const result = await PartyLedgerService.getSupplierLedger({
        supplierId,
        fromDate,
        toDate,
        page,
        pageSize,
      });

      if (adminSession) {
        await logAdminAudit({
          action: 'SUPPLIER_LEDGER_VIEWED' as any,
          adminUid: adminSession.uid,
          adminName: adminSession.name,
          targetType: 'SUPPLIER_LEDGER',
          targetId: supplierId,
          metadata: {
            supplierId,
            businessName: result.supplier.businessName,
            closingBalance: result.closingBalance,
          },
          req,
        });
      }

      return res.status(200).json(result);
    }

    const filters = {
      search: typeof req.query.search === 'string' ? req.query.search.trim() : undefined,
      fromDate: typeof req.query.fromDate === 'string' ? req.query.fromDate.trim() : undefined,
      toDate: typeof req.query.toDate === 'string' ? req.query.toDate.trim() : undefined,
    };

    const result = await PartyLedgerService.getSupplierLedgerSummary(filters);
    return res.status(200).json(result);
  } catch (error: any) {
    const msg = error.message || String(error);
    const errorCode = msg.includes(':') ? msg.split(':')[0].trim() : 'SUPPLIER_LEDGER_ERROR';
    let status = 400;
    if (errorCode === 'PAGE_SIZE_EXCEEDED') status = 400;

    return res.status(status).json({
      success: false,
      error: errorCode,
      message: sanitizeError(msg),
    });
  }
});
