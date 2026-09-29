/**
 * MR FUTKAR — Admin Customer Receipt Router (Phase 5.7 Part 2A)
 * Strictly SUPER_ADMIN authorized and server-authoritative
 */

import { Router, Request, Response } from 'express';
import { requireSuperAdmin } from './adminAuth';
import { AdminSession } from '../src/types/admin';
import { CustomerReceiptService } from './customerReceiptService';
import { CustomerReceiptPaymentMethod, CustomerReceiptStatus } from '../src/types/customerReceipt';
import { CodReceiptBridgeService } from './codReceiptBridgeService';

export const adminCustomerReceiptRouter = Router();

// Enforce Super Admin authorization on all customer receipt routes
adminCustomerReceiptRouter.use(requireSuperAdmin());

function sanitizeError(error: any): string {
  if (!error) return 'Internal server error';
  let msg = typeof error === 'string' ? error : error.message || String(error);
  msg = msg.replace(/MRFUTKAR_INTERNAL_SERVER_AUTHORITY[a-zA-Z0-9_]*/g, '[REDACTED_AUTHORITY]');
  msg = msg.replace(/[a-zA-Z0-9_\-\.]{20,}@[a-zA-Z0-9_\-\.]+/g, '[REDACTED_IDENTITY]');
  msg = msg.replace(/\/[\w\-\.\/]+\.ts:\d+:\d+/g, '');
  return msg;
}

/**
 * GET /api/admin/accounting/customer-receipts
 * List customer receipts with optional pagination, customer, payment method, status, date and search filters
 */
adminCustomerReceiptRouter.get('/', async (req: Request, res: Response) => {
  try {
    const filters = {
      customerId: req.query.customerId as string | undefined,
      paymentMethod: req.query.paymentMethod as CustomerReceiptPaymentMethod | undefined,
      status: req.query.status as CustomerReceiptStatus | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? parseInt(String(req.query.page), 10) : undefined,
      pageSize: req.query.pageSize ? parseInt(String(req.query.pageSize), 10) : undefined,
    };

    const result = await CustomerReceiptService.listCustomerReceipts(filters);
    return res.status(200).json(result);
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error listing customer receipts:', msg);

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

/**
 * GET /api/admin/accounting/customer-receipts/reconcile
 * Server-authoritative Customer Receipt Reconciliation (Phase 5.7 Part 2E)
 * Strictly SUPER_ADMIN authorized and read-only
 */
adminCustomerReceiptRouter.get('/reconcile', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const filters = {
      customerId: req.query.customerId as string | undefined,
      receiptId: req.query.receiptId as string | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      status: req.query.status as CustomerReceiptStatus | undefined,
    };

    const result = await CustomerReceiptService.reconcileCustomerReceipts(adminSession, filters);
    return res.status(200).json(result);
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error reconciling customer receipts:', msg);

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: sanitizeError(msg),
      });
    }

    if (
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

/**
 * GET /api/admin/accounting/customer-receipts/:receiptId
 * Retrieve detail of a single Customer Receipt
 */
adminCustomerReceiptRouter.get('/:receiptId', async (req: Request, res: Response) => {
  try {
    const receipt = await CustomerReceiptService.getCustomerReceipt(req.params.receiptId);
    return res.status(200).json({
      success: true,
      receipt,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error getting customer receipt:', msg);

    if (msg.includes('RECEIPT_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: 'RECEIPT_NOT_FOUND',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('INVALID_RECEIPT_ID')) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_RECEIPT_ID',
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
 * POST /api/admin/accounting/customer-receipts
 * Create a new DRAFT Customer Receipt
 */
adminCustomerReceiptRouter.post('/', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const result = await CustomerReceiptService.createCustomerReceipt(adminSession, req.body);

    const statusCode = result.isIdempotentReplay ? 200 : 201;
    return res.status(statusCode).json({
      success: true,
      receipt: result.receipt,
      isIdempotentReplay: result.isIdempotentReplay,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error creating customer receipt:', msg);

    if (
      msg.includes('CLIENT_FIELD_INJECTION_FORBIDDEN') ||
      msg.includes('INVALID_CUSTOMER_ID') ||
      msg.includes('INVALID_AMOUNT') ||
      msg.includes('INVALID_PAYMENT_METHOD') ||
      msg.includes('INVALID_DATE_FORMAT') ||
      msg.includes('PERIOD_CLOSED') ||
      msg.includes('PROHIBITED_CASH_ACCOUNT') ||
      msg.includes('INVALID_CASH_BANK_ACCOUNT') ||
      msg.includes('INACTIVE_ACCOUNT') ||
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

    if (msg.includes('CUSTOMER_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: 'CUSTOMER_NOT_FOUND',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('ACCOUNT_NOT_FOUND')) {
      return res.status(400).json({
        success: false,
        error: 'ACCOUNT_NOT_FOUND',
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
 * POST /api/admin/accounting/customer-receipts/:receiptId/post
 * Post an authoritative DRAFT Customer Receipt to double-entry accounting
 */
adminCustomerReceiptRouter.post('/:receiptId/post', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const result = await CustomerReceiptService.postCustomerReceipt(
      adminSession,
      req.params.receiptId,
      req.body,
      req
    );

    return res.status(200).json({
      success: true,
      receipt: result.receipt,
      journal: result.journal,
      isIdempotentReplay: result.isIdempotentReplay,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error posting customer receipt:', msg);

    if (
      msg.includes('CLIENT_FIELD_INJECTION_FORBIDDEN') ||
      msg.includes('INVALID_RECEIPT_ID') ||
      msg.includes('INVALID_AMOUNT') ||
      msg.includes('INVALID_PAYMENT_METHOD') ||
      msg.includes('INVALID_DATE_FORMAT') ||
      msg.includes('PERIOD_CLOSED') ||
      msg.includes('INVALID_CUSTOMER_ID') ||
      msg.includes('PROHIBITED_CASH_ACCOUNT') ||
      msg.includes('INVALID_CASH_BANK_ACCOUNT') ||
      msg.includes('INACTIVE_ACCOUNT') ||
      msg.includes('INVALID_IDEMPOTENCY_KEY') ||
      msg.includes('INVALID_RECEIPT_STATUS') ||
      msg.includes('UNBALANCED_JOURNAL')
    ) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('RECEIPT_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: 'RECEIPT_NOT_FOUND',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('CUSTOMER_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: 'CUSTOMER_NOT_FOUND',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('ACCOUNT_NOT_FOUND')) {
      return res.status(400).json({
        success: false,
        error: 'ACCOUNT_NOT_FOUND',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
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
 * GET /api/admin/accounting/customer-receipts/:receiptId/eligible-invoices
 * Retrieve outstanding eligible sales invoices for the receipt's customer
 */
adminCustomerReceiptRouter.get('/:receiptId/eligible-invoices', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const invoices = await CustomerReceiptService.getEligibleInvoicesForReceipt(
      adminSession,
      req.params.receiptId
    );
    return res.status(200).json({
      success: true,
      invoices,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error fetching eligible invoices for receipt:', msg);

    if (msg.includes('RECEIPT_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: 'RECEIPT_NOT_FOUND',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('INVALID_RECEIPT_ID')) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_RECEIPT_ID',
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
 * POST /api/admin/accounting/customer-receipts/:receiptId/allocate
 * Allocate a posted customer receipt to one or more eligible sales invoices
 */
adminCustomerReceiptRouter.post('/:receiptId/allocate', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const result = await CustomerReceiptService.allocateCustomerReceipt(
      adminSession,
      req.params.receiptId,
      req.body,
      req
    );

    return res.status(200).json({
      success: true,
      receipt: result.receipt,
      isIdempotentReplay: result.isIdempotentReplay,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error allocating customer receipt:', msg);

    if (
      msg.includes('CLIENT_FIELD_INJECTION_FORBIDDEN') ||
      msg.includes('INVALID_RECEIPT_ID') ||
      msg.includes('INVALID_ALLOCATIONS') ||
      msg.includes('INVALID_ALLOCATION_ITEM') ||
      msg.includes('MISSING_INVOICE_ID') ||
      msg.includes('DUPLICATE_INVOICE_IN_ALLOCATION') ||
      msg.includes('INVALID_ALLOCATION_AMOUNT') ||
      msg.includes('INVALID_RECEIPT_STATUS') ||
      msg.includes('INVALID_INVOICE_STATUS') ||
      msg.includes('INVOICE_NOT_POSTED') ||
      msg.includes('ALLOCATION_EXCEEDS_RECEIPT_AMOUNT') ||
      msg.includes('ALLOCATION_EXCEEDS_INVOICE_OUTSTANDING') ||
      msg.includes('INVALID_IDEMPOTENCY_KEY')
    ) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('CROSS_RETAILER_ALLOCATION_FORBIDDEN')) {
      return res.status(403).json({
        success: false,
        error: 'CROSS_RETAILER_ALLOCATION_FORBIDDEN',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('SUPER_ADMIN_REQUIRED')) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('RECEIPT_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: 'RECEIPT_NOT_FOUND',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('INVOICE_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: 'INVOICE_NOT_FOUND',
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
 * POST /api/admin/accounting/customer-receipts/:receiptId/reverse
 * Reverse an authoritative POSTED customer receipt and restore invoice balances
 */
adminCustomerReceiptRouter.post('/:receiptId/reverse', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const result = await CustomerReceiptService.reverseCustomerReceipt(
      adminSession,
      req.params.receiptId,
      req.body,
      req
    );

    return res.status(200).json({
      success: true,
      receipt: result.receipt,
      reversalJournal: result.reversalJournal,
      isIdempotentReplay: result.isIdempotentReplay,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error reversing customer receipt:', msg);

    if (
      msg.includes('CLIENT_FIELD_INJECTION_FORBIDDEN') ||
      msg.includes('INVALID_RECEIPT_ID') ||
      msg.includes('CANNOT_REVERSE_DRAFT_RECEIPT') ||
      msg.includes('INVALID_RECEIPT_STATUS') ||
      msg.includes('RECEIPT_ALREADY_REVERSED') ||
      msg.includes('JOURNAL_ALREADY_REVERSED') ||
      msg.includes('INVALID_IDEMPOTENCY_KEY') ||
      msg.includes('INVALID_REASON') ||
      msg.includes('PERIOD_CLOSED')
    ) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: sanitizeError(msg),
      });
    }

    if (
      msg.includes('CROSS_RETAILER_INVOICE_MISMATCH') ||
      msg.includes('SUPER_ADMIN_REQUIRED')
    ) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('RECEIPT_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: 'RECEIPT_NOT_FOUND',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('INVOICE_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: 'INVOICE_NOT_FOUND',
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
 * GET /api/admin/accounting/customer-receipts/by-order/:orderId
 * Phase 6 Part 4C-A: Retrieve canonical Customer Receipt linked to a COD order
 */
adminCustomerReceiptRouter.get('/by-order/:orderId', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.orderId;
    const receipt = await CodReceiptBridgeService.getCodCustomerReceiptByOrderId(orderId);

    if (!receipt) {
      return res.status(404).json({
        success: false,
        error: 'RECEIPT_NOT_FOUND',
        message: `No Customer Receipt found for order "${orderId}".`,
      });
    }

    return res.status(200).json({
      success: true,
      receipt,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: sanitizeError(msg),
    });
  }
});

/**
 * GET /api/admin/accounting/customer-receipts/by-collection/:collectionId
 * Phase 6 Part 4C-A: Retrieve canonical Customer Receipt linked to a COD collection
 */
adminCustomerReceiptRouter.get('/by-collection/:collectionId', async (req: Request, res: Response) => {
  try {
    const collectionId = req.params.collectionId;
    const receipt = await CodReceiptBridgeService.getCodCustomerReceiptByCollectionId(collectionId);

    if (!receipt) {
      return res.status(404).json({
        success: false,
        error: 'RECEIPT_NOT_FOUND',
        message: `No Customer Receipt found for COD collection "${collectionId}".`,
      });
    }

    return res.status(200).json({
      success: true,
      receipt,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: sanitizeError(msg),
    });
  }
});

/**
 * POST /api/admin/accounting/customer-receipts/create-from-cod
 * Phase 6 Part 4C-A: Create/link canonical Customer Receipt from an existing COD collection
 */
adminCustomerReceiptRouter.post('/create-from-cod', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const { orderId, collectionId, autoPost = true, autoAllocateInvoice = true, idempotencyKey } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'orderId is required.',
      });
    }

    const result = await CodReceiptBridgeService.createOrLinkCodCustomerReceipt({
      orderId,
      collectionId,
      actorSession: adminSession,
      autoPost,
      autoAllocateInvoice,
      idempotencyKey,
    });

    return res.status(result.isIdempotentReplay ? 200 : 201).json(result);
  } catch (error: any) {
    const msg = error.message || String(error);
    if (
      msg.includes('ORDER_NOT_FOUND') ||
      msg.includes('CUSTOMER_NOT_FOUND')
    ) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: sanitizeError(msg),
      });
    }

    if (
      msg.includes('NOT_COD_ORDER') ||
      msg.includes('COD_NOT_COLLECTED') ||
      msg.includes('INVALID_ORDER_ID') ||
      msg.includes('INVALID_AUTHORITATIVE_AMOUNT')
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
 * POST /api/admin/accounting/customer-receipts/reverse-cod/:receiptId
 * Phase 6 Part 4C-A: Reverse a COD Customer Receipt through reversal architecture
 */
adminCustomerReceiptRouter.post('/reverse-cod/:receiptId', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const receiptId = req.params.receiptId;
    const { reason, idempotencyKey } = req.body;

    const result = await CodReceiptBridgeService.reverseCodCustomerReceipt({
      receiptId,
      reason,
      adminSession,
      idempotencyKey,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    if (msg.includes('RECEIPT_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: 'RECEIPT_NOT_FOUND',
        message: sanitizeError(msg),
      });
    }

    if (
      msg.includes('CANNOT_REVERSE') ||
      msg.includes('INVALID_RECEIPT_STATUS') ||
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
