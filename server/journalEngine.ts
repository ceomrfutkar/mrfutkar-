/**
 * MR FUTKAR — Double-Entry Journal Accounting Engine
 * Phase 5.4 Part 2: Server-Authoritative Accounting Engine
 */

import crypto from 'crypto';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN } from './firebaseAdmin';
import { logAdminAudit } from './adminAuth';
import { AdminUser } from '../src/types/admin';
import {
  Account,
  JournalEntry,
  JournalEntryLine,
  JournalStatus,
  VoucherType,
  CreateJournalPayload,
  UpdateJournalPayload,
  JournalLinePayload,
  parseAndValidatePaise,
  paiseToRupees,
  isValidDateFormat,
  validateAccountForPosting,
} from '../src/types/accounting';
import { validatePeriodIsOpen } from './accountingPeriodService';
import { getNextJournalNumber } from './accountingSequenceService';

export interface ValidatedLineItem {
  accountId: string;
  accountCodeSnapshot: string;
  accountNameSnapshot: string;
  debitPaise: number;
  creditPaise: number;
  debit: number;
  credit: number;
  description: string;
  customerId: string | null;
  supplierId: string | null;
  productId: string | null;
  lineNumber: number;
}

export class JournalEngine {
  /**
   * Validate journal lines and compute totals in safe integer paise
   */
  static async validateAndPrepareLines(
    rawLines: JournalLinePayload[],
    requireActiveAccounts: boolean = true
  ): Promise<{
    lines: ValidatedLineItem[];
    totalDebitPaise: number;
    totalCreditPaise: number;
    totalDebit: number;
    totalCredit: number;
  }> {
    if (!Array.isArray(rawLines) || rawLines.length < 2) {
      throw new Error('INSUFFICIENT_LINES: A journal entry must contain at least 2 valid line items.');
    }

    // 1. Static line validation (No DB reads)
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const lineNum = i + 1;

      if (!line.accountId) {
        throw new Error(`MISSING_ACCOUNT_ID: Line ${lineNum}: Missing accountId.`);
      }

      // Reject client snapshot injection (JE-16)
      if ((line as any).accountCodeSnapshot !== undefined || (line as any).accountNameSnapshot !== undefined) {
        throw new Error(`CLIENT_ACCOUNT_SNAPSHOT_FORBIDDEN: Line ${lineNum}: accountCodeSnapshot and accountNameSnapshot cannot be supplied by client.`);
      }

      // Money precision verification
      const debitPaise = parseAndValidatePaise(line.debit ?? 0, `Line ${lineNum} Debit`);
      const creditPaise = parseAndValidatePaise(line.credit ?? 0, `Line ${lineNum} Credit`);

      // Reject debit AND credit on same line
      if (debitPaise > 0 && creditPaise > 0) {
        throw new Error(`BOTH_DEBIT_CREDIT_FORBIDDEN: Line ${lineNum}: A line cannot have both Debit and Credit amounts.`);
      }

      // Reject debit == 0 AND credit == 0
      if (debitPaise === 0 && creditPaise === 0) {
        throw new Error(`ZERO_AMOUNT_LINE: Line ${lineNum}: Line must have either a Debit or a Credit amount greater than zero.`);
      }
    }

    let totalDebitPaise = 0;
    let totalCreditPaise = 0;
    const validatedLines: ValidatedLineItem[] = [];

    // 2. Relational Validation: Fetch distinct account IDs from Firestore
    const accountIds = Array.from(new Set(rawLines.map(l => l.accountId).filter(Boolean)));
    const accountMap = new Map<string, Account>();

    for (const accId of accountIds) {
      const accRef = doc(db, 'chartOfAccounts', accId);
      const accSnap = await getDoc(accRef);
      if (!accSnap.exists()) {
        throw new Error(`ACCOUNT_NOT_FOUND: Account "${accId}" not found in Chart of Accounts.`);
      }
      const accData = accSnap.data() as Account;
      if (requireActiveAccounts && !accData.isActive) {
        throw new Error(`INACTIVE_ACCOUNT: Cannot use inactive account: ${accData.accountCode} - ${accData.accountName}`);
      }
      accountMap.set(accId, accData);
    }

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const lineNum = i + 1;
      const account = accountMap.get(line.accountId);
      if (!account) {
        throw new Error(`ACCOUNT_NOT_FOUND: Line ${lineNum}: Account "${line.accountId}" does not exist.`);
      }

      const debitPaise = parseAndValidatePaise(line.debit ?? 0, `Line ${lineNum} Debit`);
      const creditPaise = parseAndValidatePaise(line.credit ?? 0, `Line ${lineNum} Credit`);

      totalDebitPaise += debitPaise;
      totalCreditPaise += creditPaise;

      validatedLines.push({
        accountId: account.accountId,
        accountCodeSnapshot: account.accountCode,
        accountNameSnapshot: account.accountName,
        debitPaise,
        creditPaise,
        debit: paiseToRupees(debitPaise),
        credit: paiseToRupees(creditPaise),
        description: typeof line.description === 'string' ? line.description.trim() : '',
        customerId: line.customerId || null,
        supplierId: line.supplierId || null,
        productId: line.productId || null,
        lineNumber: lineNum,
      });
    }

    return {
      lines: validatedLines,
      totalDebitPaise,
      totalCreditPaise,
      totalDebit: paiseToRupees(totalDebitPaise),
      totalCredit: paiseToRupees(totalCreditPaise),
    };
  }

  /**
   * Create a DRAFT journal entry
   */
  static async createDraftJournal(
    adminUser: AdminUser,
    payload: CreateJournalPayload,
    req?: any
  ): Promise<{ journal: JournalEntry; lines: JournalEntryLine[] }> {
    // 1. Client injection checks
    const body = payload as any;
    if (body.journalId !== undefined) {
      throw new Error('CLIENT_JOURNAL_ID_FORBIDDEN: journalId is server-generated.');
    }
    if (body.journalNumber !== undefined) {
      throw new Error('CLIENT_JOURNAL_NUMBER_FORBIDDEN: journalNumber is server-generated.');
    }
    if (body.createdBy !== undefined || body.postedBy !== undefined) {
      throw new Error('CLIENT_AUDIT_METADATA_FORBIDDEN: createdBy/postedBy cannot be supplied by client.');
    }
    if (body.totalDebit !== undefined || body.totalCredit !== undefined) {
      throw new Error('CLIENT_TOTAL_INJECTION_FORBIDDEN: Journal totals are recalculated server-side.');
    }

    // 2. Validate Date
    if (!payload.journalDate || !isValidDateFormat(payload.journalDate)) {
      throw new Error('INVALID_JOURNAL_DATE: Date must be valid YYYY-MM-DD format.');
    }

    // 3. Validate Narration
    const narration = typeof payload.narration === 'string' ? payload.narration.trim() : '';
    if (!narration || narration.length < 2) {
      throw new Error('MISSING_NARRATION: Journal narration cannot be empty.');
    }

    // 4. Validate Period
    await validatePeriodIsOpen(payload.journalDate);

    // 5. Validate Lines
    const { lines: preparedLines, totalDebitPaise, totalCreditPaise, totalDebit, totalCredit } =
      await this.validateAndPrepareLines(payload.lines, true);

    // Draft journals must also be balanced per specification (JE-01, JE-02)
    if (totalDebitPaise !== totalCreditPaise) {
      throw new Error(`UNBALANCED_JOURNAL: Total Debit (₹${totalDebit}) must equal Total Credit (₹${totalCredit}).`);
    }

    const journalId = `jnl_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    const voucherType: VoucherType = payload.voucherType || 'JOURNAL';

    const journal: JournalEntry & { _serverTxnToken: string } = {
      journalId,
      journalNumber: '', // Drafts do not consume voucher sequences until posted
      journalDate: payload.journalDate,
      voucherType,
      referenceType: payload.referenceType || '',
      referenceId: payload.referenceId || '',
      narration,
      status: 'DRAFT',
      totalDebit,
      totalCredit,
      createdBy: adminUser.uid,
      postedBy: null,
      createdAt: now,
      postedAt: null,
      reversalOfJournalId: null,
      customerId: payload.customerId || null,
      supplierId: payload.supplierId || null,
      paymentMethod: payload.paymentMethod || null,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'journalEntries', journalId), journal);

    const savedLines: JournalEntryLine[] = [];
    for (const line of preparedLines) {
      const lineId = `line_${journalId}_${line.lineNumber}`;
      const lineDoc: JournalEntryLine & { _serverTxnToken: string } = {
        lineId,
        journalId,
        accountId: line.accountId,
        accountCodeSnapshot: line.accountCodeSnapshot,
        accountNameSnapshot: line.accountNameSnapshot,
        debit: line.debit,
        credit: line.credit,
        description: line.description,
        customerId: line.customerId,
        supplierId: line.supplierId,
        productId: line.productId,
        lineNumber: line.lineNumber,
        _serverTxnToken: SERVER_TXN_TOKEN,
      };
      batch.set(doc(db, 'journalEntryLines', lineId), lineDoc);
      const { _serverTxnToken, ...safeLine } = lineDoc;
      savedLines.push(safeLine);
    }

    await batch.commit();

    await logAdminAudit({
      action: 'JOURNAL_CREATED' as any,
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'ACCOUNTING_JOURNAL',
      targetId: journalId,
      metadata: {
        journalDate: payload.journalDate,
        voucherType,
        totalDebit,
        totalCredit,
        status: 'DRAFT',
      },
      req,
    });

    const { _serverTxnToken, ...safeJournal } = journal;
    return { journal: safeJournal, lines: savedLines };
  }

  /**
   * Update an existing DRAFT journal entry
   */
  static async updateDraftJournal(
    adminUser: AdminUser,
    journalId: string,
    payload: UpdateJournalPayload,
    req?: any
  ): Promise<{ journal: JournalEntry; lines: JournalEntryLine[] }> {
    const journalRef = doc(db, 'journalEntries', journalId);
    const snap = await getDoc(journalRef);
    if (!snap.exists()) {
      throw new Error(`JOURNAL_NOT_FOUND: Journal "${journalId}" not found.`);
    }

    const existing = snap.data() as JournalEntry;
    if (existing.status !== 'DRAFT') {
      throw new Error(`POSTED_JOURNAL_IMMUTABLE: Cannot edit journal with status "${existing.status}". Posted journals are immutable.`);
    }

    // Client injection checks
    const body = payload as any;
    if (body.journalId !== undefined || body.journalNumber !== undefined) {
      throw new Error('CLIENT_IMMUTABLE_FIELD: journalId and journalNumber cannot be modified.');
    }
    if (body.status !== undefined && body.status !== 'DRAFT') {
      throw new Error('INVALID_STATUS_UPDATE: Use dedicated /post endpoint to post a journal.');
    }

    const journalDate = payload.journalDate || existing.journalDate;
    if (!isValidDateFormat(journalDate)) {
      throw new Error('INVALID_JOURNAL_DATE: Date must be valid YYYY-MM-DD format.');
    }

    await validatePeriodIsOpen(journalDate);

    const narration = payload.narration !== undefined ? payload.narration.trim() : existing.narration;
    if (!narration || narration.length < 2) {
      throw new Error('MISSING_NARRATION: Journal narration cannot be empty.');
    }

    let finalTotalDebit = existing.totalDebit;
    let finalTotalCredit = existing.totalCredit;
    let finalLines: ValidatedLineItem[] = [];

    const batch = writeBatch(db);

    if (payload.lines && Array.isArray(payload.lines)) {
      const { lines: preparedLines, totalDebitPaise, totalCreditPaise, totalDebit, totalCredit } =
        await this.validateAndPrepareLines(payload.lines, true);

      if (totalDebitPaise !== totalCreditPaise) {
        throw new Error(`UNBALANCED_JOURNAL: Total Debit (₹${totalDebit}) must equal Total Credit (₹${totalCredit}).`);
      }

      finalTotalDebit = totalDebit;
      finalTotalCredit = totalCredit;
      finalLines = preparedLines;

      // Delete existing lines
      const oldLinesQuery = query(collection(db, 'journalEntryLines'), where('journalId', '==', journalId));
      const oldLinesSnap = await getDocs(oldLinesQuery);
      oldLinesSnap.forEach(d => batch.delete(d.ref));

      // Add new lines
      for (const line of preparedLines) {
        const lineId = `line_${journalId}_${line.lineNumber}`;
        const lineDoc: JournalEntryLine & { _serverTxnToken: string } = {
          lineId,
          journalId,
          accountId: line.accountId,
          accountCodeSnapshot: line.accountCodeSnapshot,
          accountNameSnapshot: line.accountNameSnapshot,
          debit: line.debit,
          credit: line.credit,
          description: line.description,
          customerId: line.customerId,
          supplierId: line.supplierId,
          productId: line.productId,
          lineNumber: line.lineNumber,
          _serverTxnToken: SERVER_TXN_TOKEN,
        };
        batch.set(doc(db, 'journalEntryLines', lineId), lineDoc);
      }
    }

    const updatedJournal: JournalEntry & { _serverTxnToken: string } = {
      ...existing,
      journalDate,
      voucherType: payload.voucherType || existing.voucherType,
      referenceType: payload.referenceType !== undefined ? payload.referenceType : existing.referenceType,
      referenceId: payload.referenceId !== undefined ? payload.referenceId : existing.referenceId,
      narration,
      totalDebit: finalTotalDebit,
      totalCredit: finalTotalCredit,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    batch.set(journalRef, updatedJournal);
    await batch.commit();

    await logAdminAudit({
      action: 'JOURNAL_UPDATED',
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'ACCOUNTING_JOURNAL',
      targetId: journalId,
      metadata: {
        journalDate,
        voucherType: updatedJournal.voucherType,
        totalDebit: finalTotalDebit,
        totalCredit: finalTotalCredit,
      },
      req,
    });

    const { _serverTxnToken, ...safeJournal } = updatedJournal;
    const lines = await this.getJournalLines(journalId);
    return { journal: safeJournal, lines };
  }

  /**
   * Post a DRAFT journal entry
   * Server-authoritative: recalculates totals, validates active accounts, assigns voucher number atomically
   */
  static async postJournal(
    adminUser: AdminUser,
    journalId: string,
    req?: any
  ): Promise<{ journal: JournalEntry; lines: JournalEntryLine[] }> {
    const journalRef = doc(db, 'journalEntries', journalId);
    const snap = await getDoc(journalRef);
    if (!snap.exists()) {
      throw new Error(`JOURNAL_NOT_FOUND: Journal "${journalId}" not found.`);
    }

    const journal = snap.data() as JournalEntry;

    // Idempotency check: if already POSTED, return cleanly
    if (journal.status === 'POSTED') {
      const lines = await this.getJournalLines(journalId);
      const { _serverTxnToken, ...safeJournal } = journal as any;
      return { journal: safeJournal, lines };
    }

    if (journal.status === 'REVERSED') {
      throw new Error('CANNOT_POST_REVERSED_JOURNAL: A reversed journal cannot be posted.');
    }

    // 1. Verify Accounting Period is OPEN
    await validatePeriodIsOpen(journal.journalDate);

    // 2. Fetch all existing lines
    const lines = await this.getJournalLines(journalId);
    if (lines.length < 2) {
      throw new Error('INSUFFICIENT_LINES: A journal entry must contain at least 2 lines to post.');
    }

    // 3. Re-read all accounts server-side, check active status, recalculate totals
    let totalDebitPaise = 0;
    let totalCreditPaise = 0;
    const accountSnapshots = new Map<string, { code: string; name: string }>();

    for (const line of lines) {
      const accRef = doc(db, 'chartOfAccounts', line.accountId);
      const accSnap = await getDoc(accRef);
      if (!accSnap.exists()) {
        throw new Error(`ACCOUNT_NOT_FOUND: Account "${line.accountId}" does not exist in Chart of Accounts.`);
      }
      const acc = accSnap.data() as Account;
      validateAccountForPosting(acc);

      accountSnapshots.set(line.accountId, {
        code: acc.accountCode,
        name: acc.accountName,
      });

      const dPaise = parseAndValidatePaise(line.debit, `Line ${line.lineNumber} Debit`);
      const cPaise = parseAndValidatePaise(line.credit, `Line ${line.lineNumber} Credit`);

      if (dPaise > 0 && cPaise > 0) {
        throw new Error(`Line ${line.lineNumber}: Cannot have both Debit and Credit amounts.`);
      }
      if (dPaise === 0 && cPaise === 0) {
        throw new Error(`Line ${line.lineNumber}: Line amount must be greater than zero.`);
      }

      totalDebitPaise += dPaise;
      totalCreditPaise += cPaise;
    }

    // 4. Verify Total Debit = Total Credit
    if (totalDebitPaise !== totalCreditPaise) {
      throw new Error(`UNBALANCED_JOURNAL: Total Debit (₹${paiseToRupees(totalDebitPaise)}) does not equal Total Credit (₹${paiseToRupees(totalCreditPaise)}).`);
    }

    // 5. Generate authoritative voucher sequence number
    const journalNumber = journal.journalNumber || (await getNextJournalNumber(journal.voucherType || 'JOURNAL'));
    const now = new Date().toISOString();

    const batch = writeBatch(db);

    // Update lines with latest authoritative account code and name snapshots
    for (const line of lines) {
      const snapshot = accountSnapshots.get(line.accountId)!;
      const lineRef = doc(db, 'journalEntryLines', line.lineId);
      batch.update(lineRef, {
        accountCodeSnapshot: snapshot.code,
        accountNameSnapshot: snapshot.name,
        _serverTxnToken: SERVER_TXN_TOKEN,
      });
    }

    // Update header to POSTED
    const postedJournalData: Partial<JournalEntry> & { _serverTxnToken: string } = {
      journalNumber,
      status: 'POSTED',
      totalDebit: paiseToRupees(totalDebitPaise),
      totalCredit: paiseToRupees(totalCreditPaise),
      postedBy: adminUser.uid,
      postedAt: now,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    batch.update(journalRef, postedJournalData);
    await batch.commit();

    await logAdminAudit({
      action: 'JOURNAL_POSTED' as any,
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'ACCOUNTING_JOURNAL',
      targetId: journalId,
      metadata: {
        journalNumber,
        journalDate: journal.journalDate,
        totalDebit: paiseToRupees(totalDebitPaise),
        totalCredit: paiseToRupees(totalCreditPaise),
      },
      req,
    });

    const updatedSnap = await getDoc(journalRef);
    const { _serverTxnToken, ...safeJournal } = updatedSnap.data() as any;
    const updatedLines = await this.getJournalLines(journalId);

    return { journal: safeJournal, lines: updatedLines };
  }

  /**
   * Reverse a POSTED journal entry
   * Creates a new POSTED journal with reversed debit/credit and references the original
   */
  static async reverseJournal(
    adminUser: AdminUser,
    journalId: string,
    req?: any,
    options?: {
      referenceType?: string;
      referenceId?: string;
      customerId?: string | null;
      supplierId?: string | null;
    }
  ): Promise<{ reversalJournal: JournalEntry; reversalLines: JournalEntryLine[]; originalJournal: JournalEntry }> {
    const origRef = doc(db, 'journalEntries', journalId);
    const snap = await getDoc(origRef);
    if (!snap.exists()) {
      throw new Error(`JOURNAL_NOT_FOUND: Journal "${journalId}" not found.`);
    }

    const original = snap.data() as JournalEntry;

    if (original.status !== 'POSTED') {
      throw new Error(`CANNOT_REVERSE_UNPOSTED_JOURNAL: Only POSTED journals can be reversed. Current status: "${original.status}".`);
    }

    // Check if already reversed (duplicate reversal check JE-20)
    const existingReversalQuery = query(
      collection(db, 'journalEntries'),
      where('reversalOfJournalId', '==', journalId)
    );
    const revSnap = await getDocs(existingReversalQuery);
    if (!revSnap.empty) {
      throw new Error(`JOURNAL_ALREADY_REVERSED: Journal "${original.journalNumber || journalId}" has already been reversed.`);
    }

    // Fetch original lines
    const originalLines = await this.getJournalLines(journalId);
    if (originalLines.length < 2) {
      throw new Error('Original journal has insufficient lines to reverse.');
    }

    // Generate reversal journal details with deterministic ID to prevent duplicate reversals
    const reversalJournalId = `rev_${journalId}`;
    const revDocRef = doc(db, 'journalEntries', reversalJournalId);
    const revDocSnap = await getDoc(revDocRef);
    if (revDocSnap.exists()) {
      throw new Error(`JOURNAL_ALREADY_REVERSED: Journal "${original.journalNumber || journalId}" has already been reversed.`);
    }

    const reversalJournalNumber = await getNextJournalNumber('REVERSAL');
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    // Verify current period is open for posting reversal
    await validatePeriodIsOpen(today);

    const finalReferenceType = options?.referenceType || original.referenceType || 'JOURNAL_REVERSAL';
    const finalReferenceId = options?.referenceId || (original.referenceType ? original.referenceId : journalId);
    const finalCustomerId = options?.customerId !== undefined ? options.customerId : (original.customerId || null);
    const finalSupplierId = options?.supplierId !== undefined ? options.supplierId : (original.supplierId || null);

    // Construct reversed lines (swap debit and credit)
    const reversalLines: (JournalEntryLine & { _serverTxnToken: string })[] = [];
    let totalDebitPaise = 0;
    let totalCreditPaise = 0;

    for (const line of originalLines) {
      const newLineId = `line_${reversalJournalId}_${line.lineNumber}`;
      // SWAP debit and credit
      const newDebit = line.credit;
      const newCredit = line.debit;

      totalDebitPaise += parseAndValidatePaise(newDebit, 'Reversal Debit');
      totalCreditPaise += parseAndValidatePaise(newCredit, 'Reversal Credit');

      reversalLines.push({
        lineId: newLineId,
        journalId: reversalJournalId,
        accountId: line.accountId,
        accountCodeSnapshot: line.accountCodeSnapshot,
        accountNameSnapshot: line.accountNameSnapshot,
        debit: newDebit,
        credit: newCredit,
        description: `Reversal: ${line.description || original.narration}`,
        customerId: options?.customerId || line.customerId || original.customerId || null,
        supplierId: options?.supplierId || line.supplierId || original.supplierId || null,
        productId: line.productId || null,
        lineNumber: line.lineNumber,
        _serverTxnToken: SERVER_TXN_TOKEN,
      });
    }

    const reversalJournal: JournalEntry & { _serverTxnToken: string } = {
      journalId: reversalJournalId,
      journalNumber: reversalJournalNumber,
      journalDate: today,
      voucherType: 'REVERSAL',
      referenceType: finalReferenceType,
      referenceId: finalReferenceId,
      narration: `Reversal of Journal ${original.journalNumber || journalId}: ${original.narration}`,
      status: 'POSTED',
      totalDebit: paiseToRupees(totalDebitPaise),
      totalCredit: paiseToRupees(totalCreditPaise),
      createdBy: adminUser.uid,
      postedBy: adminUser.uid,
      createdAt: now,
      postedAt: now,
      reversalOfJournalId: journalId,
      customerId: finalCustomerId,
      supplierId: finalSupplierId,
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    const batch = writeBatch(db);

    // Save reversal journal
    batch.set(doc(db, 'journalEntries', reversalJournalId), reversalJournal);

    // Save reversal lines
    for (const rLine of reversalLines) {
      batch.set(doc(db, 'journalEntryLines', rLine.lineId), rLine);
    }

    // Mark original journal as REVERSED
    batch.update(origRef, {
      status: 'REVERSED',
      _serverTxnToken: SERVER_TXN_TOKEN,
    });

    await batch.commit();

    await logAdminAudit({
      action: 'JOURNAL_REVERSED' as any,
      adminUid: adminUser.uid,
      adminName: adminUser.name,
      targetType: 'ACCOUNTING_JOURNAL',
      targetId: journalId,
      metadata: {
        originalJournalNumber: original.journalNumber,
        reversalJournalId,
        reversalJournalNumber,
      },
      req,
    });

    const { _serverTxnToken: _t1, ...safeReversal } = reversalJournal;
    const { _serverTxnToken: _t2, ...safeOriginal } = { ...original, status: 'REVERSED' as JournalStatus } as any;
    const safeLines = reversalLines.map(({ _serverTxnToken, ...l }) => l);

    return {
      reversalJournal: safeReversal,
      reversalLines: safeLines,
      originalJournal: safeOriginal,
    };
  }

  /**
   * Fetch lines for a journal sorted by lineNumber
   */
  static async getJournalLines(journalId: string): Promise<JournalEntryLine[]> {
    const linesRef = collection(db, 'journalEntryLines');
    const q = query(linesRef, where('journalId', '==', journalId));
    const snap = await getDocs(q);

    const lines: JournalEntryLine[] = [];
    snap.forEach(d => {
      const data = d.data() as JournalEntryLine;
      const { _serverTxnToken, ...safeLine } = data as any;
      lines.push(safeLine as JournalEntryLine);
    });

    lines.sort((a, b) => a.lineNumber - b.lineNumber);
    return lines;
  }
}
