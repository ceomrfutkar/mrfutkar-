/**
 * MR FUTKAR — Accounting Core & Double-Entry Journal Engine
 * Phase 5.4 Part 1 & Part 2 Domain Types
 */

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

export type NormalBalance = 'DEBIT' | 'CREDIT';

export interface Account {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  parentAccountId: string | null;
  normalBalance: NormalBalance;
  isSystemAccount: boolean;
  isActive: boolean;
  description: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export type PeriodStatus = 'OPEN' | 'CLOSED';

export interface AccountingPeriod {
  periodId: string;
  periodName?: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  createdAt: string;
  closedAt?: string | null;
  closedBy?: string | null;
}

export type JournalStatus = 'DRAFT' | 'POSTED' | 'REVERSED';

export type VoucherType = 'JOURNAL' | 'PAYMENT' | 'RECEIPT' | 'CONTRA' | 'REVERSAL' | 'PV' | 'CN' | 'DN' | 'CREDIT_NOTE' | 'DEBIT_NOTE';

export interface JournalEntry {
  journalId: string;
  journalNumber: string;
  journalDate: string; // YYYY-MM-DD
  voucherType: VoucherType;
  referenceType?: string;
  referenceId?: string;
  narration: string;
  status: JournalStatus;
  totalDebit: number;
  totalCredit: number;
  totalDebitPaise?: number;
  totalCreditPaise?: number;
  lines?: JournalEntryLine[];
  createdBy: string;
  postedBy?: string | null;
  createdAt: string;
  postedAt?: string | null;
  reversalOfJournalId?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  paymentMethod?: string | null;
  isBalanced?: boolean;
  updatedAt?: string;
}

export interface JournalEntryLine {
  lineId: string;
  journalId: string;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  accountCodeSnapshot?: string;
  accountNameSnapshot?: string;
  debit: number;
  credit: number;
  debitPaise?: number;
  creditPaise?: number;
  description?: string;
  customerId?: string | null;
  supplierId?: string | null;
  productId?: string | null;
  lineNumber: number;
}

export interface AccountingSequence {
  sequenceId: string;
  sequenceType: string;
  currentValue: number;
  prefix: string;
  padding: number;
  updatedAt: string;
}

export interface GeneralLedgerEntry {
  date: string;
  journalId: string;
  journalNumber: string;
  voucherType: VoucherType | string;
  referenceType?: string;
  referenceId?: string;
  narration: string;
  lineId: string;
  accountId: string;
  accountCodeSnapshot: string;
  accountNameSnapshot: string;
  debit: number;
  credit: number;
  runningBalance: number;
  customerId?: string | null;
  supplierId?: string | null;
  productId?: string | null;
  status: JournalStatus;
}

export interface GeneralLedgerFilter {
  accountId: string;
  fromDate?: string;
  toDate?: string;
  voucherType?: string;
  referenceType?: string;
  customerId?: string;
  supplierId?: string;
}

export interface GeneralLedgerResponse {
  success: boolean;
  account: {
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: AccountType;
    normalBalance: NormalBalance;
    isActive: boolean;
  };
  filter: GeneralLedgerFilter;
  openingBalance: number;
  periodDebit: number;
  periodCredit: number;
  closingBalance: number;
  entries: GeneralLedgerEntry[];
  totalCount: number;
}

export interface TrialBalanceAccountRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  debit: number;
  credit: number;
  closingBalance: number;
  netDebit: number;
  netCredit: number;
}

export interface TrialBalanceFilter {
  fromDate?: string;
  toDate?: string;
  accountType?: AccountType;
  includeZeroBalances?: boolean;
}

export interface TrialBalanceResponse {
  success: boolean;
  accounts: TrialBalanceAccountRow[];
  totalDebit: number;
  totalCredit: number;
  totalDebitPaise: number;
  totalCreditPaise: number;
  isBalanced: boolean;
  filter: TrialBalanceFilter;
}

export interface CreateAccountPayload {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  parentAccountId?: string | null;
  normalBalance?: NormalBalance;
  description?: string;
  isActive?: boolean;
}

export interface UpdateAccountPayload {
  accountName?: string;
  description?: string;
  parentAccountId?: string | null;
  isActive?: boolean;
}

export interface JournalLinePayload {
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
  customerId?: string | null;
  supplierId?: string | null;
  productId?: string | null;
}

export interface CreateJournalPayload {
  journalDate: string;
  voucherType?: VoucherType;
  referenceType?: string;
  referenceId?: string;
  narration: string;
  lines: JournalLinePayload[];
  customerId?: string | null;
  supplierId?: string | null;
  paymentMethod?: string | null;
}

export interface UpdateJournalPayload {
  journalDate?: string;
  voucherType?: VoucherType;
  referenceType?: string;
  referenceId?: string;
  narration?: string;
  lines?: JournalLinePayload[];
}

/**
 * Normal Balance Enforcer:
 * ASSET = DEBIT
 * EXPENSE = DEBIT
 * LIABILITY = CREDIT
 * EQUITY = CREDIT
 * INCOME = CREDIT
 */
export function getRequiredNormalBalance(accountType: AccountType): NormalBalance {
  switch (accountType) {
    case 'ASSET':
    case 'EXPENSE':
      return 'DEBIT';
    case 'LIABILITY':
    case 'EQUITY':
    case 'INCOME':
      return 'CREDIT';
    default:
      throw new Error(`Unknown account type: ${accountType}`);
  }
}

export function isValidNormalBalance(accountType: AccountType, normalBalance: NormalBalance): boolean {
  try {
    return getRequiredNormalBalance(accountType) === normalBalance;
  } catch {
    return false;
  }
}

/**
 * Validate that an account is active and can be used for posting
 * (COA-10 & JE-08: Inactive account cannot be used for posting)
 */
export function validateAccountForPosting(account: Account): void {
  if (!account) {
    throw new Error('ACCOUNT_NOT_FOUND: Account does not exist.');
  }
  if (!account.isActive) {
    throw new Error(`INACTIVE_ACCOUNT: Cannot post to inactive account: ${account.accountCode} - ${account.accountName}`);
  }
}

/**
 * Safe decimal / integer paise helper functions
 * Rejects negative amounts, NaN, Infinity, more than 2 decimal places, empty values
 */
export function parseAndValidatePaise(val: any, fieldName: string): number {
  if (val === null || val === undefined || val === '') {
    throw new Error(`${fieldName} cannot be empty.`);
  }
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num) || Number.isNaN(num)) {
    throw new Error(`${fieldName} must be a valid finite number.`);
  }
  if (num < 0) {
    throw new Error(`${fieldName} cannot be negative.`);
  }
  const str = num.toString();
  if (str.includes('.')) {
    const decimals = str.split('.')[1];
    if (decimals.length > 2) {
      throw new Error(`${fieldName} cannot have more than 2 decimal places.`);
    }
  }
  return Math.round(num * 100);
}

export function paiseToRupees(paise: number): number {
  return Number((paise / 100).toFixed(2));
}

export function isValidDateFormat(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
}

/**
 * PHASE 6 PART 4C-B: Server-Authoritative Ledger-Backed Cash & Bank Balance Interface
 */
export const CASH_ACCOUNT_CODE = '1100';
export const BANK_ACCOUNT_CODE = '1200';

export interface AccountingBalanceAccountInfo {
  accountCode: string;
  accountName: string;
  accountId: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
}

export interface AccountingBalanceResponse {
  success: boolean;
  cashBalancePaise: number;
  bankBalancePaise: number;
  cashBalanceRupees: number;
  bankBalanceRupees: number;
  asOf: string;
  currency: 'INR';
  cashAccount: AccountingBalanceAccountInfo;
  bankAccount: AccountingBalanceAccountInfo;
  error?: string;
  message?: string;
}
