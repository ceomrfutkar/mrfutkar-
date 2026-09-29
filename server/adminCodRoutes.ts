/**
 * MR FUTKAR — PHASE 6 PART 4B: ADMIN COD HANDOVER & CUSTODY TRANSFER ROUTES
 * Protected by Super Admin authorization.
 * 
 * Supports:
 * - Listing submitted COD cash handovers destined for Admin
 * - Viewing Admin operational cash custody balance
 * - Accepting cash handover with actual physical count verification
 * - Rejecting cash handover with reason
 * - Discrepancy tracking without write-offs or accounting mutations
 */

import { Router, Request, Response } from 'express';
import { AdminUser } from '../src/types/admin';
import {
  listAdminHandovers,
  getAdminCashCustody,
  acceptCodHandover,
  rejectCodHandover,
} from './codHandoverService';

export const adminCodRouter = Router();

/**
 * GET /api/admin/cod/handovers
 * Lists all COD cash handovers directed to ADMIN
 */
adminCodRouter.get('/handovers', async (req: Request, res: Response) => {
  try {
    const handovers = await listAdminHandovers();
    return res.status(200).json({
      success: true,
      count: handovers.length,
      handovers,
    });
  } catch (err: any) {
    console.error('Error fetching admin COD handovers:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/cod/custody
 * Fetches current operational physical cash custody balance for the authenticated admin
 */
adminCodRouter.get('/custody', async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser as AdminUser;
    const custody = await getAdminCashCustody(adminUser.uid);
    return res.status(200).json({
      success: true,
      ...custody,
    });
  } catch (err: any) {
    console.error('Error fetching admin cash custody:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/cod/handovers/:handoverId/accept
 * Verifies physical cash count and atomically accepts handover into Admin cash custody
 */
adminCodRouter.post('/handovers/:handoverId/accept', async (req: Request, res: Response) => {
  try {
    const { handoverId } = req.params;
    const { receivedAmountPaise, receivedAmountRupees, notes } = req.body;
    const adminUser = (req as any).adminUser as AdminUser;

    const amountPaise = receivedAmountPaise !== undefined
      ? Number(receivedAmountPaise)
      : Math.round(Number(receivedAmountRupees || 0) * 100);

    const result = await acceptCodHandover({
      handoverId,
      receiverId: adminUser.uid,
      receiverRole: 'SUPER_ADMIN',
      destinationTypeExpected: 'ADMIN',
      receivedAmountPaise: amountPaise,
      notes,
    });

    return res.status(200).json({
      message: result.isIdempotentReplay
        ? 'Handover was already accepted.'
        : `Handover accepted successfully into Admin cash custody (₹${result.handover.acceptedAmountPaise! / 100}).`,
      ...result,
    });
  } catch (err: any) {
    const isValidation =
      err.message.startsWith('INVALID') ||
      err.message.startsWith('INSUFFICIENT') ||
      err.message.startsWith('DESTINATION_MISMATCH') ||
      err.message.startsWith('HANDOVER_NOT_FOUND');
    const isForbidden = err.message.startsWith('SELF_APPROVAL_FORBIDDEN') || err.message.startsWith('FORBIDDEN');
    return res.status(isForbidden ? 403 : isValidation ? 400 : 500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/admin/cod/handovers/:handoverId/reject
 * Rejects a submitted COD cash handover request directed to ADMIN
 */
adminCodRouter.post('/handovers/:handoverId/reject', async (req: Request, res: Response) => {
  try {
    const { handoverId } = req.params;
    const { reason } = req.body;
    const adminUser = (req as any).adminUser as AdminUser;

    const rejected = await rejectCodHandover({
      handoverId,
      receiverId: adminUser.uid,
      destinationTypeExpected: 'ADMIN',
      reason,
    });

    return res.status(200).json({
      success: true,
      message: 'Handover rejected successfully.',
      handover: rejected,
    });
  } catch (err: any) {
    const isValidation =
      err.message.startsWith('INVALID') ||
      err.message.startsWith('ACCEPTED') ||
      err.message.startsWith('DESTINATION_MISMATCH') ||
      err.message.startsWith('HANDOVER_NOT_FOUND');
    return res.status(isValidation ? 400 : 500).json({
      success: false,
      error: err.message,
    });
  }
});
