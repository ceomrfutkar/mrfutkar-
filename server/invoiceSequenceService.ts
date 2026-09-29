/**
 * MR FUTKAR — Invoice Sequence Generator (Phase 5.5 Part 1)
 * Concurrency-Safe Sequential Invoice Numbering for Sales (SI) and Purchase (PI)
 */

import { doc, runTransaction } from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN } from './firebaseAdmin';

export interface InvoiceSequence {
  sequenceId: string;
  invoiceType: 'SALES' | 'PURCHASE';
  currentValue: number;
  prefix: string;
  year: number;
  padding: number;
  updatedAt: string;
}

/**
 * Generates the next sequential invoice number atomically using a Firestore transaction.
 * e.g., SI-2026-00001 or PI-2026-00001
 */
export async function getNextInvoiceNumber(invoiceType: 'SALES' | 'PURCHASE', forcedYear?: number): Promise<string> {
  const currentYear = forcedYear || new Date().getFullYear();
  const typeUpper = invoiceType.toUpperCase();
  const typePrefix = typeUpper === 'PURCHASE' ? 'PI' : 'SI';
  const padding = 5;

  const sequenceId = `seq_${typePrefix}_${currentYear}`;

  const nextNumber = await runTransaction(db, async (transaction) => {
    const seqRef = doc(db, 'invoiceSequences', sequenceId);
    const seqSnap = await transaction.get(seqRef);
    let nextVal = 1;

    if (seqSnap.exists()) {
      const data = seqSnap.data() as InvoiceSequence;
      nextVal = (data.currentValue || 0) + 1;
      transaction.update(seqRef, {
        currentValue: nextVal,
        updatedAt: new Date().toISOString(),
        _serverTxnToken: SERVER_TXN_TOKEN,
      });
    } else {
      const initSeq: InvoiceSequence & { _serverTxnToken: string } = {
        sequenceId,
        invoiceType: typeUpper === 'PURCHASE' ? 'PURCHASE' : 'SALES',
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
