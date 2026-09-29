/**
 * MR FUTKAR — Initial System Accounts Bootstrapper
 * Phase 5.4 Part 1: Chart of Accounts Foundation
 */

import { doc, getDocs, setDoc, collection } from 'firebase/firestore';
import { db, SERVER_TXN_TOKEN } from './firebaseAdmin';
import { Account, AccountType, NormalBalance, getRequiredNormalBalance } from '../src/types/accounting';

export interface SystemAccountSeed {
  code: string;
  name: string;
  type: AccountType;
  parentCode: string | null;
  description: string;
}

export const INITIAL_SYSTEM_ACCOUNTS: SystemAccountSeed[] = [
  // 1000 Assets
  { code: '1000', name: 'Assets', type: 'ASSET', parentCode: null, description: 'Master Assets Control Account' },
  { code: '1100', name: 'Cash', type: 'ASSET', parentCode: '1000', description: 'Liquid cash in hand / store till' },
  { code: '1200', name: 'Bank', type: 'ASSET', parentCode: '1000', description: 'Current bank accounts and deposits' },
  { code: '1300', name: 'Accounts Receivable', type: 'ASSET', parentCode: '1000', description: 'Retailer Kirana outstanding balances' },
  { code: '1400', name: 'Inventory', type: 'ASSET', parentCode: '1000', description: 'Wholesale FMCG stock value at Brahmpuri Hub' },

  // 2000 Liabilities
  { code: '2000', name: 'Liabilities', type: 'LIABILITY', parentCode: null, description: 'Master Liabilities Control Account' },
  { code: '2100', name: 'Accounts Payable', type: 'LIABILITY', parentCode: '2000', description: 'Vendor / FMCG distributor payables' },
  { code: '2200', name: 'Output GST', type: 'LIABILITY', parentCode: '2000', description: 'GST collected on wholesale sales' },
  { code: '2300', name: 'Input GST', type: 'LIABILITY', parentCode: '2000', description: 'Input GST / Tax credit on procurement purchases' },

  // 3000 Equity
  { code: '3000', name: 'Equity', type: 'EQUITY', parentCode: null, description: 'Master Owners Equity Control Account' },
  { code: '3100', name: 'Owner Capital', type: 'EQUITY', parentCode: '3000', description: 'Owner initial and invested capital' },
  { code: '3200', name: 'Retained Earnings', type: 'EQUITY', parentCode: '3000', description: 'Accumulated profits and earnings' },

  // 4000 Income
  { code: '4000', name: 'Income', type: 'INCOME', parentCode: null, description: 'Master Income Control Account' },
  { code: '4100', name: 'Sales Revenue', type: 'INCOME', parentCode: '4000', description: 'Revenue from FMCG wholesale supply' },
  { code: '4200', name: 'Other Income', type: 'INCOME', parentCode: '4000', description: 'Discounts, commissions and miscellaneous income' },

  // 5000 Direct Costs
  { code: '5000', name: 'Direct Costs', type: 'EXPENSE', parentCode: null, description: 'Master Direct Costs Control Account' },
  { code: '5100', name: 'Cost of Goods Sold', type: 'EXPENSE', parentCode: '5000', description: 'Direct procurement and purchase costs of sold goods' },

  // 6000 Expenses
  { code: '6000', name: 'Expenses', type: 'EXPENSE', parentCode: null, description: 'Master Operating Expenses Control Account' },
  { code: '6100', name: 'Salary Expense', type: 'EXPENSE', parentCode: '6000', description: 'Warehouse and administrative employee wages' },
  { code: '6200', name: 'Rent Expense', type: 'EXPENSE', parentCode: '6000', description: 'Warehouse facility and office rent' },
  { code: '6300', name: 'Delivery Expense', type: 'EXPENSE', parentCode: '6000', description: 'Fleet delivery and dispatch transportation costs' },
  { code: '6400', name: 'Marketing Expense', type: 'EXPENSE', parentCode: '6000', description: 'Retailer acquisition and promotions' },
  { code: '6500', name: 'Bank Charges', type: 'EXPENSE', parentCode: '6000', description: 'Payment gateway fees and bank service charges' },
  { code: '6600', name: 'Other Operating Expenses', type: 'EXPENSE', parentCode: '6000', description: 'Utilities, packaging, and office supplies' },
];

export async function ensureSystemAccounts(): Promise<{ createdCount: number; existingCount: number }> {
  let createdCount = 0;
  let existingCount = 0;
  const now = new Date().toISOString();

  const accountsSnap = await getDocs(collection(db, 'chartOfAccounts'));
  const existingMap = new Set<string>();
  accountsSnap.forEach(d => existingMap.add(d.id));

  for (const item of INITIAL_SYSTEM_ACCOUNTS) {
    const accountId = `acc_${item.code}`;
    if (existingMap.has(accountId)) {
      existingCount++;
      continue;
    }

    const parentAccountId = item.parentCode ? `acc_${item.parentCode}` : null;
    const normalBal: NormalBalance = getRequiredNormalBalance(item.type);

    const docRef = doc(db, 'chartOfAccounts', accountId);
    const accountData: Account & { _serverTxnToken: string } = {
      accountId,
      accountCode: item.code,
      accountName: item.name,
      accountType: item.type,
      parentAccountId,
      normalBalance: normalBal,
      isSystemAccount: true,
      isActive: true,
      description: item.description,
      createdAt: now,
      updatedAt: now,
      createdBy: 'SYSTEM_BOOTSTRAP',
      updatedBy: 'SYSTEM_BOOTSTRAP',
      _serverTxnToken: SERVER_TXN_TOKEN,
    };

    await setDoc(docRef, accountData);
    createdCount++;
  }

  return { createdCount, existingCount };
}
