/**
 * MR FUTKAR — Credit & Debit Note Sequence Generator (Phase 5.6)
 * Dedicated, Concurrency-Safe Sequential Note Numbering
 * Formats: SCN-YYYY-#####, SDN-YYYY-#####, PCN-YYYY-#####, PDN-YYYY-#####
 */

import { doc, runTransaction } from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN } from './firebaseAdmin';
import { CreditDebitNoteType } from '../src/types/creditDebitNote';

export interface CreditDebitNoteSequence {
  sequenceId: string;
  noteType: CreditDebitNoteType;
  currentValue: number;
  prefix: string;
  year: number;
  padding: number;
  updatedAt: string;
}

export function getPrefixForNoteType(noteType: CreditDebitNoteType): string {
  switch (noteType) {
    case 'SALES_CREDIT_NOTE':
      return 'SCN';
    case 'SALES_DEBIT_NOTE':
      return 'SDN';
    case 'PURCHASE_CREDIT_NOTE':
      return 'PCN';
    case 'PURCHASE_DEBIT_NOTE':
      return 'PDN';
    default:
      throw new Error(`UNKNOWN_NOTE_TYPE: Invalid note type "${noteType}".`);
  }
}

/**
 * Generates the next sequential note number atomically using a Firestore transaction.
 * e.g., SCN-2026-00001, SDN-2026-00001, PCN-2026-00001, PDN-2026-00001
 */
export async function getNextNoteNumber(noteType: CreditDebitNoteType, forcedYear?: number): Promise<string> {
  const currentYear = forcedYear || new Date().getFullYear();
  const typePrefix = getPrefixForNoteType(noteType);
  const padding = 5;

  const sequenceId = `seq_${typePrefix}_${currentYear}`;

  const nextNumber = await runTransaction(db, async (transaction) => {
    const seqRef = doc(db, 'creditDebitNoteSequences', sequenceId);
    const seqSnap = await transaction.get(seqRef);
    let nextVal = 1;

    if (seqSnap.exists()) {
      const data = seqSnap.data() as CreditDebitNoteSequence;
      nextVal = (data.currentValue || 0) + 1;
      transaction.update(seqRef, {
        currentValue: nextVal,
        updatedAt: new Date().toISOString(),
        _serverTxnToken: SERVER_TXN_TOKEN,
      });
    } else {
      const initSeq: CreditDebitNoteSequence & { _serverTxnToken: string } = {
        sequenceId,
        noteType,
        currentValue: 1,
        prefix: `${typePrefix}-${currentYear}-`,
        year: currentYear,
        padding,
        updatedAt: new Date().toISOString(),
        _serverTxnToken: SERVER_TXN_TOKEN,
      };
      transaction.set(seqRef, initSeq);
      nextVal = 1;
    }

    return `${typePrefix}-${currentYear}-${String(nextVal).padStart(padding, '0')}`;
  });

  return nextNumber;
}
