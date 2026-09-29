/**
 * MR FUTKAR — Admin Accounting Router
 * Phase 5.4 Part 1: Chart of Accounts & Accounting Foundation
 * Strictly SUPER_ADMIN authorized and server-authoritative
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN } from './firebaseAdmin';
import { logAdminAudit } from './adminAuth';
import { AdminUser } from '../src/types/admin';
import {
  Account,
  AccountType,
  NormalBalance,
  getRequiredNormalBalance,
  isValidNormalBalance,
  JournalEntry,
  JournalEntryLine,
  AccountingPeriod,
} from '../src/types/accounting';
import { ensureSystemAccounts } from './accountingSeedService';
import { JournalEngine } from './journalEngine';
import { ensureDefaultAccountingPeriod } from './accountingPeriodService';
import { GeneralLedgerService } from './generalLedgerService';
import { TrialBalanceService } from './trialBalanceService';
import { AccountingBalanceService } from './accountingBalanceService';
import { adminCreditDebitNoteRouter } from './adminCreditDebitNoteRoutes';
import { adminPartyLedgerRouter } from './adminPartyLedgerRoutes';
import { adminCustomerReceiptRouter } from './adminCustomerReceiptRoutes';
import { adminSupplierPaymentRouter } from './adminSupplierPaymentRoutes';
import { adminCustomerReportRouter } from './adminCustomerReportRoutes';

export const adminAccountingRouter = Router();

// Phase 5.6: Credit & Debit Notes Sub-Router
adminAccountingRouter.use('/credit-debit-notes', adminCreditDebitNoteRouter);

// Phase 5.7 Part 2A: Customer Receipts Sub-Router
adminAccountingRouter.use('/customer-receipts', adminCustomerReceiptRouter);

// Phase 5.8 Part 1: Supplier Payments Sub-Router
adminAccountingRouter.use('/supplier-payments', adminSupplierPaymentRouter);

// Phase 5.9 Part 2: Customer AR Reporting Sub-Router
adminAccountingRouter.use('/customer-reports', adminCustomerReportRouter);

// Phase 5.7 Part 1: Customer & Supplier Party Ledgers Sub-Router
adminAccountingRouter.use('/', adminPartyLedgerRouter);

const VALID_ACCOUNT_TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];

/**
 * Defensive error message sanitizer to ensure no internal tokens, credentials, or file paths leak to client
 */
function sanitizeError(error: any): string {
  if (!error) return 'Internal server error';
  let msg = typeof error === 'string' ? error : (error.message || String(error));
  msg = msg.replace(/MRFUTKAR_INTERNAL_SERVER_AUTHORITY[a-zA-Z0-9_]*/g, '[REDACTED_AUTHORITY]');
  msg = msg.replace(/[a-zA-Z0-9_\-\.]{20,}@[a-zA-Z0-9_\-\.]+/g, '[REDACTED_IDENTITY]');
  msg = msg.replace(/\/[\w\-\.\/]+\.ts:\d+:\d+/g, '');
  return msg;
}

/**
 * GET /api/admin/accounting/accounts
 * Retrieve Chart of Accounts with optional filters
 */
adminAccountingRouter.get('/accounts', async (req: Request, res: Response) => {
  try {
    // Ensure system accounts are seeded
    await ensureSystemAccounts();

    const accountsRef = collection(db, 'chartOfAccounts');
    const snapshot = await getDocs(accountsRef);

    let accounts: Account[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data() as Account;
      // Exclude internal server tokens from client response
      const { ...safeAccount } = data as any;
      delete safeAccount._serverTxnToken;
      accounts.push(safeAccount as Account);
    });

    // Optional query filters
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const typeFilter = typeof req.query.accountType === 'string' ? req.query.accountType.trim().toUpperCase() : '';
    const activeFilter = req.query.isActive !== undefined ? String(req.query.isActive).toLowerCase() === 'true' : null;

    if (search) {
      accounts = accounts.filter(
        acc =>
          acc.accountCode.toLowerCase().includes(search) ||
          acc.accountName.toLowerCase().includes(search) ||
          (acc.description && acc.description.toLowerCase().includes(search))
      );
    }

    if (typeFilter && VALID_ACCOUNT_TYPES.includes(typeFilter as AccountType)) {
      accounts = accounts.filter(acc => acc.accountType === typeFilter);
    }

    if (activeFilter !== null) {
      accounts = accounts.filter(acc => acc.isActive === activeFilter);
    }

    // Sort hierarchically/numerically by account code
    accounts.sort((a, b) => a.accountCode.localeCompare(b.accountCode, undefined, { numeric: true }));

    return res.status(200).json({
      success: true,
      accounts,
      totalCount: accounts.length,
    });
  } catch (error: any) {
    console.error('Error fetching Chart of Accounts:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve Chart of Accounts: ' + (error.message || String(error)),
    });
  }
});

/**
 * POST /api/admin/accounting/accounts
 * Create new account in Chart of Accounts
 * Server-authoritative ID, audit, and hierarchy validation
 */
adminAccountingRouter.post('/accounts', async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser as AdminUser;
    const body = req.body || {};

    // 1. Check for client metadata injection (COA-06, COA-07, COA-08)
    if (body.accountId !== undefined) {
      return res.status(400).json({
        success: false,
        error: 'CLIENT_ACCOUNT_ID_FORBIDDEN',
        message: 'Client cannot supply accountId. Account IDs are strictly server-generated.',
      });
    }

    if (body.createdBy !== undefined) {
      return res.status(400).json({
        success: false,
        error: 'CLIENT_CREATED_BY_FORBIDDEN',
        message: 'Client cannot supply createdBy. Audit metadata is strictly server-authoritative.',
      });
    }

    if (body.updatedBy !== undefined) {
      return res.status(400).json({
        success: false,
        error: 'CLIENT_UPDATED_BY_FORBIDDEN',
        message: 'Client cannot supply updatedBy. Audit metadata is strictly server-authoritative.',
      });
    }

    // 2. Validate Account Code (COA-02)
    const rawCode = typeof body.accountCode === 'string' ? body.accountCode.trim() : '';
    if (!rawCode || !/^[a-zA-Z0-9_-]{2,20}$/.test(rawCode)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ACCOUNT_CODE',
        message: 'Account code must be 2-20 alphanumeric characters.',
      });
    }

    // Check code uniqueness across chartOfAccounts
    const codeQuery = query(collection(db, 'chartOfAccounts'), where('accountCode', '==', rawCode));
    const codeSnap = await getDocs(codeQuery);
    if (!codeSnap.empty) {
      return res.status(400).json({
        success: false,
        error: 'DUPLICATE_ACCOUNT_CODE',
        message: `Account code "${rawCode}" already exists in the Chart of Accounts.`,
      });
    }

    // 3. Validate Account Name
    const rawName = typeof body.accountName === 'string' ? body.accountName.trim() : '';
    if (!rawName || rawName.length < 2 || rawName.length > 120) {
      return res.status(400).json({
        success: false,
        error: 'EMPTY_ACCOUNT_NAME',
        message: 'Account name cannot be empty and must be between 2 and 120 characters.',
      });
    }

    // 4. Validate Account Type (COA-03)
    const rawType = typeof body.accountType === 'string' ? (body.accountType.trim().toUpperCase() as AccountType) : null;
    if (!rawType || !VALID_ACCOUNT_TYPES.includes(rawType)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ACCOUNT_TYPE',
        message: `Invalid account type "${body.accountType}". Allowed: ${VALID_ACCOUNT_TYPES.join(', ')}`,
      });
    }

    // 5. Enforce Normal Balance (COA-05)
    const requiredNormalBal = getRequiredNormalBalance(rawType);
    if (body.normalBalance !== undefined) {
      const rawNormalBal = String(body.normalBalance).trim().toUpperCase() as NormalBalance;
      if (rawNormalBal !== requiredNormalBal) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_NORMAL_BALANCE',
          message: `Invalid normal balance "${body.normalBalance}" for account type "${rawType}". Required: "${requiredNormalBal}".`,
        });
      }
    }

    // 6. Validate Parent Account (COA-04)
    let parentAccountId: string | null = null;
    if (body.parentAccountId && typeof body.parentAccountId === 'string' && body.parentAccountId.trim() !== '') {
      const targetParentId = body.parentAccountId.trim();
      // Check if parent exists by accountId
      const parentRef = doc(db, 'chartOfAccounts', targetParentId);
      const parentSnap = await getDoc(parentRef);
      if (!parentSnap.exists()) {
        // Also allow matching by parent accountCode for ease of use
        const parentByCodeQuery = query(collection(db, 'chartOfAccounts'), where('accountCode', '==', targetParentId));
        const parentByCodeSnap = await getDocs(parentByCodeQuery);
        if (parentByCodeSnap.empty) {
          return res.status(400).json({
            success: false,
            error: 'INVALID_PARENT_ACCOUNT',
            message: `Parent account "${targetParentId}" does not exist in Chart of Accounts.`,
          });
        }
        parentAccountId = parentByCodeSnap.docs[0].id;
      } else {
        parentAccountId = targetParentId;
      }
    }

    // 7. Server-Generate Immutable Identifiers & Audit Metadata
    const accountId = `acc_${rawCode}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();
    const isSystemAccount = false;
    const isActive = body.isActive !== undefined ? Boolean(body.isActive) : true;
    const description = typeof body.description === 'string' ? body.description.trim() : '';

    const newAccount: Account & { _serverTxnToken: string } = {
      accountId,
      accountCode: rawCode,
      accountName: rawName,
      accountType: rawType,
      parentAccountId,
      normalBalance: requiredNormalBal,
      isSystemAccount,
      isActive,
      description,
      createdAt: now,
      updatedAt: now,
      createdBy: adminUser.uid,
      updatedBy: adminUser.uid,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    const docRef = doc(db, 'chartOfAccounts', accountId);
    await setDoc(docRef, newAccount);

    // Audit log
    await logAdminAudit({
      action: 'ACCOUNT_CREATED' as any,
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'ACCOUNTING_ACCOUNT',
      targetId: accountId,
      metadata: {
        accountCode: rawCode,
        accountName: rawName,
        accountType: rawType,
        normalBalance: requiredNormalBal,
        parentAccountId,
      },
      req,
    });

    const { _serverTxnToken, ...responseAccount } = newAccount;
    return res.status(201).json({
      success: true,
      account: responseAccount,
      message: `Account "${rawCode} - ${rawName}" successfully created.`,
    });
  } catch (error: any) {
    console.error('Error creating account:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to create account: ' + (error.message || String(error)),
    });
  }
});

/**
 * PUT /api/admin/accounting/accounts/:accountId
 * Update existing account
 */
adminAccountingRouter.put('/accounts/:accountId', async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser as AdminUser;
    const { accountId } = req.params;
    const body = req.body || {};

    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_ACCOUNT_ID',
        message: 'Account ID is required.',
      });
    }

    // Check for client metadata injection
    if (body.createdBy !== undefined) {
      return res.status(400).json({
        success: false,
        error: 'CLIENT_CREATED_BY_FORBIDDEN',
        message: 'Client cannot supply createdBy.',
      });
    }
    if (body.updatedBy !== undefined) {
      return res.status(400).json({
        success: false,
        error: 'CLIENT_UPDATED_BY_FORBIDDEN',
        message: 'Client cannot supply updatedBy.',
      });
    }

    const docRef = doc(db, 'chartOfAccounts', accountId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'ACCOUNT_NOT_FOUND',
        message: `Account "${accountId}" not found.`,
      });
    }

    const existing = snap.data() as Account;

    // Check modifications to system accounts
    if (existing.isSystemAccount) {
      if (body.accountCode && body.accountCode !== existing.accountCode) {
        return res.status(400).json({
          success: false,
          error: 'SYSTEM_ACCOUNT_IMMUTABLE_FIELD',
          message: 'Account code of system accounts cannot be modified.',
        });
      }
      if (body.accountType && body.accountType !== existing.accountType) {
        return res.status(400).json({
          success: false,
          error: 'SYSTEM_ACCOUNT_IMMUTABLE_FIELD',
          message: 'Account type of system accounts cannot be modified.',
        });
      }
    }

    const updates: Partial<Account> & { _serverTxnToken: string } = {
      updatedAt: new Date().toISOString(),
      updatedBy: adminUser.uid,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    if (body.accountName !== undefined) {
      const rawName = String(body.accountName).trim();
      if (!rawName || rawName.length < 2) {
        return res.status(400).json({
          success: false,
          error: 'EMPTY_ACCOUNT_NAME',
          message: 'Account name cannot be empty and must be at least 2 characters.',
        });
      }
      updates.accountName = rawName;
    }

    if (body.description !== undefined) {
      updates.description = String(body.description).trim();
    }

    if (body.parentAccountId !== undefined) {
      const targetParent = body.parentAccountId ? String(body.parentAccountId).trim() : null;
      if (targetParent) {
        if (targetParent === accountId || targetParent === existing.accountCode) {
          return res.status(400).json({
            success: false,
            error: 'INVALID_PARENT_ACCOUNT',
            message: 'An account cannot be its own parent.',
          });
        }
        const parentRef = doc(db, 'chartOfAccounts', targetParent);
        const parentSnap = await getDoc(parentRef);
        if (!parentSnap.exists()) {
          return res.status(400).json({
            success: false,
            error: 'INVALID_PARENT_ACCOUNT',
            message: `Parent account "${targetParent}" does not exist.`,
          });
        }
        updates.parentAccountId = targetParent;
      } else {
        updates.parentAccountId = null;
      }
    }

    if (body.isActive !== undefined) {
      if (body.isActive === false && existing.isSystemAccount) {
        return res.status(400).json({
          success: false,
          error: 'SYSTEM_ACCOUNT_CANNOT_BE_DEACTIVATED',
          message: `System account "${existing.accountCode} - ${existing.accountName}" is protected and cannot be deactivated.`,
        });
      }
      updates.isActive = Boolean(body.isActive);
    }

    await setDoc(docRef, { ...existing, ...updates }, { merge: true });

    await logAdminAudit({
      action: 'ACCOUNT_UPDATED' as any,
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'ACCOUNTING_ACCOUNT',
      targetId: accountId,
      metadata: {
        accountCode: existing.accountCode,
        changes: Object.keys(updates).filter(k => k !== '_serverTxnToken'),
      },
      req,
    });

    const updatedAccount = { ...existing, ...updates };
    delete (updatedAccount as any)._serverTxnToken;

    return res.status(200).json({
      success: true,
      account: updatedAccount,
      message: `Account "${existing.accountCode}" successfully updated.`,
    });
  } catch (error: any) {
    console.error('Error updating account:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to update account: ' + (error.message || String(error)),
    });
  }
});

/**
 * POST /api/admin/accounting/accounts/:accountId/activate
 */
adminAccountingRouter.post('/accounts/:accountId/activate', async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser as AdminUser;
    const { accountId } = req.params;

    const docRef = doc(db, 'chartOfAccounts', accountId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'ACCOUNT_NOT_FOUND',
        message: `Account "${accountId}" not found.`,
      });
    }

    const account = snap.data() as Account;
    const now = new Date().toISOString();

    await setDoc(
      docRef,
      {
        isActive: true,
        updatedAt: now,
        updatedBy: adminUser.uid,
        _serverTxnToken: SERVER_TXN_TOKEN,
      },
      { merge: true }
    );

    await logAdminAudit({
      action: 'ACCOUNT_ACTIVATED' as any,
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'ACCOUNTING_ACCOUNT',
      targetId: accountId,
      metadata: { accountCode: account.accountCode },
      req,
    });

    return res.status(200).json({
      success: true,
      message: `Account "${account.accountCode} - ${account.accountName}" activated successfully.`,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to activate account: ' + (error.message || String(error)),
    });
  }
});

/**
 * POST /api/admin/accounting/accounts/:accountId/deactivate
 */
adminAccountingRouter.post('/accounts/:accountId/deactivate', async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser as AdminUser;
    const { accountId } = req.params;

    const docRef = doc(db, 'chartOfAccounts', accountId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'ACCOUNT_NOT_FOUND',
        message: `Account "${accountId}" not found.`,
      });
    }

    const account = snap.data() as Account;

    if (account.isSystemAccount) {
      return res.status(400).json({
        success: false,
        error: 'SYSTEM_ACCOUNT_CANNOT_BE_DEACTIVATED',
        message: `System account "${account.accountCode} - ${account.accountName}" is protected and cannot be deactivated.`,
      });
    }

    const now = new Date().toISOString();

    await setDoc(
      docRef,
      {
        isActive: false,
        updatedAt: now,
        updatedBy: adminUser.uid,
        _serverTxnToken: SERVER_TXN_TOKEN,
      },
      { merge: true }
    );

    await logAdminAudit({
      action: 'ACCOUNT_DEACTIVATED' as any,
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'ACCOUNTING_ACCOUNT',
      targetId: accountId,
      metadata: { accountCode: account.accountCode },
      req,
    });

    return res.status(200).json({
      success: true,
      message: `Account "${account.accountCode} - ${account.accountName}" deactivated successfully.`,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to deactivate account: ' + (error.message || String(error)),
    });
  }
});

/**
 * DELETE /api/admin/accounting/accounts/:accountId
 * Section 3: Physical account deletion is NOT supported to preserve historical ledger integrity.
 * Returns controlled rejection ACCOUNT_DELETION_NOT_SUPPORTED.
 */
adminAccountingRouter.delete('/accounts/:accountId', async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;

    const docRef = doc(db, 'chartOfAccounts', accountId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'ACCOUNT_NOT_FOUND',
        message: `Account "${accountId}" not found.`,
      });
    }

    const account = snap.data() as Account;

    return res.status(400).json({
      success: false,
      error: 'ACCOUNT_DELETION_NOT_SUPPORTED',
      message: `Account "${account.accountCode} - ${account.accountName}" cannot be physically deleted to preserve historical ledger integrity. Use deactivation instead.`,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to process account deletion request: ' + (error.message || String(error)),
    });
  }
});

// ==========================================
// PHASE 5.4 PART 2: DOUBLE-ENTRY JOURNAL ENGINE ROUTES
// ==========================================

/**
 * GET /api/admin/accounting/journals
 * List journal entries with optional search, status, and date range filters
 */
adminAccountingRouter.get('/journals', async (req: Request, res: Response) => {
  try {
    const journalsRef = collection(db, 'journalEntries');
    const snapshot = await getDocs(journalsRef);

    let journals: JournalEntry[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data() as JournalEntry;
      const { ...safeJournal } = data as any;
      delete safeJournal._serverTxnToken;
      journals.push(safeJournal as JournalEntry);
    });

    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : '';
    const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate.trim() : '';
    const toDate = typeof req.query.toDate === 'string' ? req.query.toDate.trim() : '';

    if (search) {
      journals = journals.filter(
        j =>
          (j.journalNumber && j.journalNumber.toLowerCase().includes(search)) ||
          j.journalId.toLowerCase().includes(search) ||
          j.narration.toLowerCase().includes(search) ||
          (j.referenceId && j.referenceId.toLowerCase().includes(search))
      );
    }

    if (statusFilter && ['DRAFT', 'POSTED', 'REVERSED'].includes(statusFilter)) {
      journals = journals.filter(j => j.status === statusFilter);
    }

    if (fromDate) {
      journals = journals.filter(j => j.journalDate >= fromDate);
    }

    if (toDate) {
      journals = journals.filter(j => j.journalDate <= toDate);
    }

    // Sort descending by journalDate, then createdAt
    journals.sort((a, b) => {
      const dateCmp = b.journalDate.localeCompare(a.journalDate);
      if (dateCmp !== 0) return dateCmp;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    return res.status(200).json({
      success: true,
      journals,
      totalCount: journals.length,
    });
  } catch (error: any) {
    console.error('Error fetching journals:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve journals: ' + (error.message || String(error)),
    });
  }
});

/**
 * GET /api/admin/accounting/journals/:journalId
 * Get single journal with its authoritative lines
 */
adminAccountingRouter.get('/journals/:journalId', async (req: Request, res: Response) => {
  try {
    const { journalId } = req.params;
    const docRef = doc(db, 'journalEntries', journalId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'JOURNAL_NOT_FOUND',
        message: `Journal "${journalId}" not found.`,
      });
    }

    const { _serverTxnToken, ...safeJournal } = snap.data() as any;
    const lines = await JournalEngine.getJournalLines(journalId);

    return res.status(200).json({
      success: true,
      journal: safeJournal,
      lines,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve journal details: ' + (error.message || String(error)),
    });
  }
});

/**
 * POST /api/admin/accounting/journals
 * Create DRAFT journal entry
 */
adminAccountingRouter.post('/journals', async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser as AdminUser;
    const body = req.body || {};

    const result = await JournalEngine.createDraftJournal(adminUser, body, req);
    return res.status(201).json({
      success: true,
      journal: result.journal,
      lines: result.lines,
      message: 'Draft journal entry created successfully.',
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    const errorCode = msg.includes(':') ? msg.split(':')[0].trim() : 'INVALID_JOURNAL';
    return res.status(400).json({
      success: false,
      error: errorCode,
      message: msg,
    });
  }
});

/**
 * PUT /api/admin/accounting/journals/:journalId
 * Update DRAFT journal entry (immutable once POSTED)
 */
adminAccountingRouter.put('/journals/:journalId', async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser as AdminUser;
    const { journalId } = req.params;
    const body = req.body || {};

    const result = await JournalEngine.updateDraftJournal(adminUser, journalId, body, req);
    return res.status(200).json({
      success: true,
      journal: result.journal,
      lines: result.lines,
      message: 'Draft journal entry updated successfully.',
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    const errorCode = msg.includes(':') ? msg.split(':')[0].trim() : 'UPDATE_JOURNAL_FAILED';
    const status = errorCode === 'JOURNAL_NOT_FOUND' ? 404 : 400;
    return res.status(status).json({
      success: false,
      error: errorCode,
      message: msg,
    });
  }
});

/**
 * POST /api/admin/accounting/journals/:journalId/post
 * Authoritatively post a DRAFT journal entry (enforcing DEBIT = CREDIT, active accounts, sequence)
 */
adminAccountingRouter.post('/journals/:journalId/post', async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser as AdminUser;
    const { journalId } = req.params;

    const result = await JournalEngine.postJournal(adminUser, journalId, req);
    return res.status(200).json({
      success: true,
      journal: result.journal,
      lines: result.lines,
      message: `Journal "${result.journal.journalNumber || journalId}" posted successfully.`,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    const errorCode = msg.includes(':') ? msg.split(':')[0].trim() : 'POSTING_FAILED';
    const status = errorCode === 'JOURNAL_NOT_FOUND' ? 404 : 400;
    return res.status(status).json({
      success: false,
      error: errorCode,
      message: msg,
    });
  }
});

/**
 * POST /api/admin/accounting/journals/:journalId/reverse
 * Reverse a POSTED journal entry
 */
adminAccountingRouter.post('/journals/:journalId/reverse', async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser as AdminUser;
    const { journalId } = req.params;

    const result = await JournalEngine.reverseJournal(adminUser, journalId, req);
    return res.status(200).json({
      success: true,
      reversalJournal: result.reversalJournal,
      reversalLines: result.reversalLines,
      originalJournal: result.originalJournal,
      message: `Journal "${result.originalJournal.journalNumber || journalId}" reversed successfully with voucher "${result.reversalJournal.journalNumber}".`,
    });
  } catch (error: any) {
    const msg = error.message || String(error);
    const errorCode = msg.includes(':') ? msg.split(':')[0].trim() : 'REVERSAL_FAILED';
    const status = errorCode === 'JOURNAL_NOT_FOUND' ? 404 : 400;
    return res.status(status).json({
      success: false,
      error: errorCode,
      message: msg,
    });
  }
});

/**
 * DELETE /api/admin/accounting/journals/:journalId
 * Section 10: Journals cannot be deleted. Returns controlled rejection JOURNAL_DELETION_NOT_SUPPORTED.
 */
adminAccountingRouter.delete('/journals/:journalId', async (req: Request, res: Response) => {
  return res.status(400).json({
    success: false,
    error: 'JOURNAL_DELETION_NOT_SUPPORTED',
    message: 'Journals cannot be physically deleted to maintain an immutable general ledger. Reverse the journal instead.',
  });
});

// ==========================================
// ACCOUNTING PERIODS ROUTES
// ==========================================

/**
 * GET /api/admin/accounting/periods
 * List accounting periods
 */
adminAccountingRouter.get('/periods', async (req: Request, res: Response) => {
  try {
    await ensureDefaultAccountingPeriod();
    const periodsRef = collection(db, 'accountingPeriods');
    const snap = await getDocs(periodsRef);
    const periods: AccountingPeriod[] = [];
    snap.forEach(d => {
      const { _serverTxnToken, ...safeP } = d.data() as any;
      periods.push(safeP as AccountingPeriod);
    });
    return res.status(200).json({ success: true, periods });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: error.message });
  }
});

/**
 * POST /api/admin/accounting/periods/:periodId/close
 */
adminAccountingRouter.post('/periods/:periodId/close', async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser as AdminUser;
    const { periodId } = req.params;
    const pRef = doc(db, 'accountingPeriods', periodId);
    const snap = await getDoc(pRef);
    if (!snap.exists()) {
      return res.status(404).json({ success: false, error: 'PERIOD_NOT_FOUND' });
    }
    const periodData = snap.data() as AccountingPeriod;
    await setDoc(pRef, {
      status: 'CLOSED',
      closedAt: new Date().toISOString(),
      closedBy: adminUser.uid,
      _serverTxnToken: SERVER_TXN_TOKEN,
    }, { merge: true });

    await logAdminAudit({
      action: 'ACCOUNTING_PERIOD_CLOSED' as any,
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'ACCOUNTING_PERIOD',
      targetId: periodId,
      metadata: {
        periodId,
        startDate: periodData.startDate,
        endDate: periodData.endDate,
      },
      req,
    });

    return res.status(200).json({ success: true, message: `Period ${periodId} closed.` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: sanitizeError(error) });
  }
});

/**
 * POST /api/admin/accounting/periods/:periodId/open
 */
adminAccountingRouter.post('/periods/:periodId/open', async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser as AdminUser;
    const { periodId } = req.params;
    const pRef = doc(db, 'accountingPeriods', periodId);
    const snap = await getDoc(pRef);
    if (!snap.exists()) {
      return res.status(404).json({ success: false, error: 'PERIOD_NOT_FOUND' });
    }
    const periodData = snap.data() as AccountingPeriod;
    await setDoc(pRef, {
      status: 'OPEN',
      closedAt: null,
      closedBy: null,
      _serverTxnToken: SERVER_TXN_TOKEN,
    }, { merge: true });

    await logAdminAudit({
      action: 'ACCOUNTING_PERIOD_OPENED' as any,
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'ACCOUNTING_PERIOD',
      targetId: periodId,
      metadata: {
        periodId,
        startDate: periodData.startDate,
        endDate: periodData.endDate,
      },
      req,
    });

    return res.status(200).json({ success: true, message: `Period ${periodId} reopened.` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: sanitizeError(error) });
  }
});

// ==========================================
// PHASE 5.4 PART 3: GENERAL LEDGER & TRIAL BALANCE ROUTES
// ==========================================

/**
 * GET /api/admin/accounting/general-ledger
 * Server-authoritative General Ledger query
 * Required: accountId
 * Optional: fromDate, toDate, voucherType, referenceType, customerId, supplierId
 */
adminAccountingRouter.get('/general-ledger', async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser as AdminUser;
    const rawAccountId = typeof req.query.accountId === 'string' ? req.query.accountId.trim() : '';
    if (!rawAccountId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_ACCOUNT_ID',
        message: 'accountId query parameter is required for General Ledger.',
      });
    }

    const fromDate = typeof req.query.fromDate === 'string' && req.query.fromDate.trim() ? req.query.fromDate.trim() : undefined;
    const toDate = typeof req.query.toDate === 'string' && req.query.toDate.trim() ? req.query.toDate.trim() : undefined;
    const voucherType = typeof req.query.voucherType === 'string' && req.query.voucherType.trim() ? req.query.voucherType.trim() : undefined;
    const referenceType = typeof req.query.referenceType === 'string' && req.query.referenceType.trim() ? req.query.referenceType.trim() : undefined;
    const customerId = typeof req.query.customerId === 'string' && req.query.customerId.trim() ? req.query.customerId.trim() : undefined;
    const supplierId = typeof req.query.supplierId === 'string' && req.query.supplierId.trim() ? req.query.supplierId.trim() : undefined;

    const result = await GeneralLedgerService.getLedger({
      accountId: rawAccountId,
      fromDate,
      toDate,
      voucherType,
      referenceType,
      customerId,
      supplierId,
    });

    if (adminUser) {
      await logAdminAudit({
        action: 'GENERAL_LEDGER_VIEWED' as any,
        adminUid: adminUser.uid,
        adminName: adminUser.name,
        targetType: 'GENERAL_LEDGER',
        targetId: rawAccountId,
        metadata: {
          accountId: rawAccountId,
          fromDate: fromDate || null,
          toDate: toDate || null,
          voucherType: voucherType || null,
          entriesCount: result.entries.length,
        },
        req,
      });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    const msg = error.message || String(error);
    const errorCode = msg.includes(':') ? msg.split(':')[0].trim() : 'GENERAL_LEDGER_ERROR';
    let status = 400;
    if (errorCode === 'ACCOUNT_NOT_FOUND') status = 404;
    else if (errorCode === 'SERVER_ERROR') status = 500;

    return res.status(status).json({
      success: false,
      error: errorCode,
      message: sanitizeError(msg),
    });
  }
});

/**
 * GET /api/admin/accounting/trial-balance
 * Server-authoritative Trial Balance computation
 * Optional: fromDate, toDate, accountType, includeZeroBalances
 * Mandatory Invariant: TOTAL DEBIT = TOTAL CREDIT
 */
adminAccountingRouter.get('/trial-balance', async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).adminUser as AdminUser;
    const fromDate = typeof req.query.fromDate === 'string' && req.query.fromDate.trim() ? req.query.fromDate.trim() : undefined;
    const toDate = typeof req.query.toDate === 'string' && req.query.toDate.trim() ? req.query.toDate.trim() : undefined;
    const accountType = typeof req.query.accountType === 'string' && req.query.accountType.trim() ? (req.query.accountType.trim().toUpperCase() as AccountType) : undefined;
    const includeZeroBalances = req.query.includeZeroBalances !== undefined ? String(req.query.includeZeroBalances).toLowerCase() === 'true' : false;
    const simulateUnbalanced = req.query._testUnbalanced === 'true';

    const result = await TrialBalanceService.getTrialBalance(
      {
        fromDate,
        toDate,
        accountType,
        includeZeroBalances,
      },
      { simulateUnbalanced }
    );

    if (adminUser) {
      await logAdminAudit({
        action: 'TRIAL_BALANCE_VIEWED' as any,
        adminUid: adminUser.uid,
        adminName: adminUser.name,
        targetType: 'TRIAL_BALANCE',
        targetId: 'ALL_ACCOUNTS',
        metadata: {
          fromDate: fromDate || null,
          toDate: toDate || null,
          accountType: accountType || 'ALL',
          totalDebit: result.totalDebit,
          totalCredit: result.totalCredit,
          isBalanced: result.isBalanced,
        },
        req,
      });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    const msg = error.message || String(error);
    const errorCode = error.code || (msg.includes(':') ? msg.split(':')[0].trim() : 'TRIAL_BALANCE_ERROR');
    const status = errorCode === 'ACCOUNTING_INTEGRITY_ERROR' ? 500 : 400;

    return res.status(status).json({
      success: false,
      error: errorCode,
      message: sanitizeError(msg),
      totalDebit: error.totalDebit !== undefined ? error.totalDebit : undefined,
      totalCredit: error.totalCredit !== undefined ? error.totalCredit : undefined,
      isBalanced: false,
    });
  }
});

/**
 * GET /api/admin/accounting/balances
 * Phase 6 Part 4C-B: Server-authoritative read-only Cash in Hand (1100) and Bank Balance (1200)
 * Derived strictly from posted journal entries in the General Ledger.
 * Protected by requireSuperAdmin().
 */
adminAccountingRouter.get('/balances', async (req: Request, res: Response) => {
  try {
    const toDate = typeof req.query.toDate === 'string' && req.query.toDate.trim() ? req.query.toDate.trim() : undefined;
    const bypassCache = req.query.bypassCache === 'true' || req.query.refresh === 'true';

    const result = await AccountingBalanceService.getLedgerBalances({ toDate, bypassCache });
    return res.status(200).json(result);
  } catch (error: any) {
    const msg = error.message || String(error);
    return res.status(500).json({
      success: false,
      error: 'ACCOUNTING_BALANCE_ERROR',
      message: 'Failed to retrieve ledger balances: ' + sanitizeError(msg),
    });
  }
});


