/**
 * MR FUTKAR — Admin Credit & Debit Notes Router (Phase 5.6)
 * Strictly SUPER_ADMIN authorized and server-authoritative
 */

import { Router, Request, Response } from 'express';
import { requireSuperAdmin, logAdminAudit } from './adminAuth';
import { AdminSession } from '../src/types/admin';
import { CreditDebitNoteService } from './creditDebitNoteService';
import { InvoiceDocumentService } from './invoiceDocumentService';
import { CreditDebitNoteType, CreditDebitNoteStatus } from '../src/types/creditDebitNote';

export const adminCreditDebitNoteRouter = Router();

// Enforce Super Admin authorization on all credit-debit-note routes
adminCreditDebitNoteRouter.use(requireSuperAdmin());

function sanitizeError(error: any): string {
  if (!error) return 'Internal server error';
  let msg = typeof error === 'string' ? error : error.message || String(error);
  msg = msg.replace(/MRFUTKAR_INTERNAL_SERVER_AUTHORITY[a-zA-Z0-9_]*/g, '[REDACTED_AUTHORITY]');
  msg = msg.replace(/[a-zA-Z0-9_\-\.]{20,}@[a-zA-Z0-9_\-\.]+/g, '[REDACTED_IDENTITY]');
  msg = msg.replace(/\/[\w\-\.\/]+\.ts:\d+:\d+/g, '');
  return msg;
}

/**
 * GET /api/admin/accounting/credit-debit-notes
 * List credit and debit notes with optional filters
 */
adminCreditDebitNoteRouter.get('/', async (req: Request, res: Response) => {
  try {
    const filters = {
      noteType: req.query.noteType as CreditDebitNoteType | undefined,
      status: req.query.status as CreditDebitNoteStatus | undefined,
      originalInvoiceId: req.query.originalInvoiceId as string | undefined,
      originalInvoiceNumber: req.query.originalInvoiceNumber as string | undefined,
      customerId: req.query.customerId as string | undefined,
      supplierId: req.query.supplierId as string | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? parseInt(String(req.query.page), 10) : undefined,
      pageSize: req.query.pageSize ? parseInt(String(req.query.pageSize), 10) : undefined,
    };

    const result = await CreditDebitNoteService.listCreditDebitNotes(filters);
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Error listing credit/debit notes:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: sanitizeError(error),
    });
  }
});

/**
 * POST /api/admin/accounting/credit-debit-notes
 * Create a new DRAFT Credit or Debit Note
 */
adminCreditDebitNoteRouter.post('/', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const note = await CreditDebitNoteService.createCreditDebitNote(adminSession, req.body, req);

    return res.status(201).json({
      success: true,
      note,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error creating credit/debit note:', msg);

    if (
      msg.includes('CLIENT_ACCOUNTING_INJECTION_FORBIDDEN') ||
      msg.includes('CLIENT_TOTAL_INJECTION_FORBIDDEN') ||
      msg.includes('INVALID_NOTE_TYPE') ||
      msg.includes('MISSING_REASON') ||
      msg.includes('INVALID_SOURCE_INVOICE_ID') ||
      msg.includes('INVALID_ITEM_QUANTITY') ||
      msg.includes('PRODUCT_NOT_IN_SOURCE_INVOICE')
    ) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: sanitizeError(msg),
      });
    }

    if (msg.includes('INVALID_SOURCE_INVOICE_TYPE') || msg.includes('INVALID_SOURCE_INVOICE_STATUS')) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SOURCE_INVOICE',
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

    if (msg.includes('CUMULATIVE_LIMIT_EXCEEDED') || msg.includes('CUMULATIVE_QUANTITY_EXCEEDED') || msg.includes('INVOICE_FULLY_ADJUSTED')) {
      return res.status(422).json({
        success: false,
        error: 'CUMULATIVE_LIMIT_EXCEEDED',
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
 * GET /api/admin/accounting/credit-debit-notes/:noteId
 * Get a single note by ID
 */
adminCreditDebitNoteRouter.get('/:noteId', async (req: Request, res: Response) => {
  try {
    const { noteId } = req.params;
    const note = await CreditDebitNoteService.getCreditDebitNote(noteId);
    return res.status(200).json({
      success: true,
      note,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    if (msg.includes('NOTE_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: 'NOTE_NOT_FOUND',
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
 * PUT /api/admin/accounting/credit-debit-notes/:noteId
 * Update DRAFT note only (POSTED notes return NOTE_IMMUTABLE per specification)
 */
adminCreditDebitNoteRouter.put('/:noteId', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const { noteId } = req.params;

    const note = await CreditDebitNoteService.updateCreditDebitNote(adminSession, noteId, req.body, req);
    return res.status(200).json({
      success: true,
      note,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    if (msg.includes('NOTE_IMMUTABLE')) {
      return res.status(409).json({
        success: false,
        error: 'NOTE_IMMUTABLE',
        message: 'Cannot modify a POSTED note. Posted credit/debit notes are immutable.',
      });
    }
    if (msg.includes('NOTE_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: 'NOTE_NOT_FOUND',
        message: sanitizeError(msg),
      });
    }
    if (msg.includes('CUMULATIVE_LIMIT_EXCEEDED') || msg.includes('CUMULATIVE_QUANTITY_EXCEEDED')) {
      return res.status(422).json({
        success: false,
        error: 'CUMULATIVE_LIMIT_EXCEEDED',
        message: sanitizeError(msg),
      });
    }
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: sanitizeError(msg),
    });
  }
});

/**
 * POST /api/admin/accounting/credit-debit-notes/:noteId/post
 * Post a DRAFT note atomically to Double-Entry General Ledger
 */
adminCreditDebitNoteRouter.post('/:noteId/post', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const { noteId } = req.params;

    const note = await CreditDebitNoteService.postCreditDebitNote(adminSession, noteId, req);
    return res.status(200).json({
      success: true,
      note,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    console.error('Error posting note:', msg);

    if (msg.includes('NOTE_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: 'NOTE_NOT_FOUND',
        message: sanitizeError(msg),
      });
    }
    if (msg.includes('ACCOUNTING_PERIOD_CLOSED')) {
      return res.status(422).json({
        success: false,
        error: 'ACCOUNTING_PERIOD_CLOSED',
        message: 'The accounting period for this note is closed. Postings are forbidden in closed periods.',
      });
    }
    if (msg.includes('CUMULATIVE_LIMIT_EXCEEDED') || msg.includes('CUMULATIVE_QUANTITY_EXCEEDED')) {
      return res.status(422).json({
        success: false,
        error: 'CUMULATIVE_LIMIT_EXCEEDED',
        message: sanitizeError(msg),
      });
    }
    return res.status(400).json({
      success: false,
      error: 'POSTING_ERROR',
      message: sanitizeError(msg),
    });
  }
});

/**
 * GET /api/admin/accounting/credit-debit-notes/:noteId/document
 * Presentation document model
 */
adminCreditDebitNoteRouter.get('/:noteId/document', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const { noteId } = req.params;

    const document = await InvoiceDocumentService.getCreditDebitNoteDocument(noteId, {
      isAdmin: true,
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      req,
      auditAction: 'VIEW',
    });

    return res.status(200).json({
      success: true,
      document,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    if (msg.includes('NOTE_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: 'NOTE_NOT_FOUND',
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
 * GET /api/admin/accounting/credit-debit-notes/:noteId/pdf
 * PDF export
 */
adminCreditDebitNoteRouter.get('/:noteId/pdf', async (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).adminUser as AdminSession;
    const { noteId } = req.params;

    const pdfBuffer = await InvoiceDocumentService.generateCreditDebitNotePdf(noteId, {
      isAdmin: true,
      adminUid: adminSession.uid,
      adminName: adminSession.name,
      req,
    });

    const note = await CreditDebitNoteService.getCreditDebitNote(noteId);
    const filename = `${note.noteNumber || note.noteId}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    return res.status(200).send(pdfBuffer);
  } catch (error: any) {
    const msg = error.message || String(error);
    return res.status(500).json({
      success: false,
      error: 'PDF_GENERATION_FAILED',
      message: sanitizeError(msg),
    });
  }
});
