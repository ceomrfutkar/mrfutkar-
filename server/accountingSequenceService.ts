/**
 * MR FUTKAR — Accounting Voucher Sequence Generator
 * Phase 5.4 Part 2: Concurrency-Safe Sequential Voucher Counter
 */

import { doc, runTransaction } from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN } from './firebaseAdmin';
import { AccountingSequence } from '../src/types/accounting';

/**
 * Generates the next sequential voucher number atomically using Firestore transaction
 * e.g., JV-2026-00001
 */
export async function getNextJournalNumber(sequenceType: string = 'JOURNAL'): Promise<string> {
  const currentYear = new Date().getFullYear();
  const typeUpper = sequenceType.toUpperCase();
  let typePrefix = 'JV';
  if (typeUpper === 'SUPPLIER_PAYMENT' || typeUpper === 'SP') typePrefix = 'SP';
  else if (typeUpper === 'PAYMENT' || typeUpper === 'PV') typePrefix = 'PV';
  else if (typeUpper === 'RECEIPT' || typeUpper === 'RV') typePrefix = 'RV';
  else if (typeUpper === 'CONTRA' || typeUpper === 'CV') typePrefix = 'CV';
  else if (typeUpper === 'REVERSAL' || typeUpper === 'REV') typePrefix = 'REV';
  else if (typeUpper === 'CREDIT_NOTE' || typeUpper === 'CN') typePrefix = 'CN';
  else if (typeUpper === 'DEBIT_NOTE' || typeUpper === 'DN') typePrefix = 'DN';
  else if (typeUpper === 'JOURNAL' || typeUpper === 'JV') typePrefix = 'JV';
  const prefix = `${typePrefix}-${currentYear}-`;
  const padding = 5;

  const sequenceId = `seq_${typePrefix}_${currentYear}`;
  const legacySequenceId = `seq_${typeUpper}`;

  const nextNumber = await runTransaction(db, async (transaction) => {
    const seqRef = doc(db, 'accountingSequences', sequenceId);
    const seqSnap = await transaction.get(seqRef);
    let nextVal = 1;

    if (seqSnap.exists()) {
      const data = seqSnap.data() as AccountingSequence;
      nextVal = (data.currentValue || 0) + 1;
      transaction.update(seqRef, {
        currentValue: nextVal,
        updatedAt: new Date().toISOString(),
        _serverTxnToken: SERVER_TXN_TOKEN,
      });
    } else {
      // Check legacy sequence document if exists from prior un-scoped seed
      const legacyRef = doc(db, 'accountingSequences', legacySequenceId);
      const legacySnap = await transaction.get(legacyRef);
      if (legacySnap.exists()) {
        const legacyData = legacySnap.data() as AccountingSequence;
        nextVal = (legacyData.currentValue || 0) + 1;
        transaction.update(legacyRef, {
          currentValue: nextVal,
          updatedAt: new Date().toISOString(),
          _serverTxnToken: SERVER_TXN_TOKEN,
        });
      } else {
        const initSeq: AccountingSequence & { _serverTxnToken: string } = {
          sequenceId,
          sequenceType,
          currentValue: 1,
          prefix,
          padding,
          updatedAt: new Date().toISOString(),
          _serverTxnToken: SERVER_TXN_TOKEN,
        };
        transaction.set(seqRef, initSeq);
        nextVal = 1;
      }
    }

    return `${prefix}${String(nextVal).padStart(padding, '0')}`;
  });

  return nextNumber;
}
