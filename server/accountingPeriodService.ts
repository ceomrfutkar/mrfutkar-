/**
 * MR FUTKAR — Accounting Periods Service
 * Phase 5.4 Part 2: Fiscal Period Boundaries
 */

import { doc, getDoc, getDocs, setDoc, collection, query, where } from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN } from './firebaseAdmin';
import { AccountingPeriod, PeriodStatus } from '../src/types/accounting';

export const DEFAULT_PERIOD_ID = 'FY2026';
export const LEGACY_PERIOD_ID = 'period_FY_2026';

/**
 * Ensures an active open canonical accounting period exists covering current dates
 */
export async function ensureDefaultAccountingPeriod(): Promise<AccountingPeriod> {
  // Check canonical FY2026 first
  const periodRef = doc(db, 'accountingPeriods', DEFAULT_PERIOD_ID);
  const snap = await getDoc(periodRef);

  if (snap.exists()) {
    return snap.data() as AccountingPeriod;
  }

  // Check legacy period if already provisioned
  const legacyRef = doc(db, 'accountingPeriods', LEGACY_PERIOD_ID);
  const legacySnap = await getDoc(legacyRef);
  if (legacySnap.exists()) {
    return legacySnap.data() as AccountingPeriod;
  }

  const periodData: AccountingPeriod & { _serverTxnToken: string } = {
    periodId: DEFAULT_PERIOD_ID,
    periodName: 'FY2026',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    status: 'OPEN',
    createdAt: new Date().toISOString(),
    closedAt: null,
    closedBy: null,
    _serverTxnToken: SERVER_TXN_TOKEN,
  };
  await setDoc(periodRef, periodData);
  return periodData;
}

/**
 * Finds the accounting period for a given date string (YYYY-MM-DD)
 */
export async function findPeriodForDate(dateStr: string): Promise<AccountingPeriod | null> {
  const periodsRef = collection(db, 'accountingPeriods');
  const snap = await getDocs(periodsRef);

  for (const docSnap of snap.docs) {
    const period = docSnap.data() as AccountingPeriod;
    if (dateStr >= period.startDate && dateStr <= period.endDate) {
      return period;
    }
  }

  // If no date range matches, check default period
  const defaultPeriod = await ensureDefaultAccountingPeriod();
  if (dateStr >= defaultPeriod.startDate && dateStr <= defaultPeriod.endDate) {
    return defaultPeriod;
  }

  return null;
}

/**
 * Validates that an accounting period is open for posting
 */
export async function validatePeriodIsOpen(dateStr: string): Promise<AccountingPeriod> {
  const period = await findPeriodForDate(dateStr);
  if (!period) {
    throw new Error(`PERIOD_CLOSED: No open accounting period found for date "${dateStr}". Posting is not permitted in closed or undefined periods.`);
  }

  if (period.status === 'CLOSED') {
    throw new Error(`PERIOD_CLOSED: Cannot post journal to CLOSED accounting period: ${period.periodId} (${period.startDate} to ${period.endDate})`);
  }

  return period;
}
