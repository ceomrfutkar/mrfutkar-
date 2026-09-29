/**
 * MR FUTKAR — Admin Chart of Accounts Screen
 * Phase 5.4 Part 1: Accounting Core & Hierarchical Chart of Accounts
 * Strictly SUPER_ADMIN authorized with live server-authoritative Firestore data
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BookOpen,
  Search,
  Filter,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Lock,
  ChevronRight,
  ChevronDown,
  Edit2,
  Power,
  ShieldAlert,
  ArrowUpDown,
  FolderTree,
  Table as TableIcon,
  HelpCircle,
  Scale,
  FileText,
  Users,
  Truck,
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import { AdminJournalEntriesSection } from '../../components/admin/accounting/AdminJournalEntriesSection';
import { AdminGeneralLedgerSection } from '../../components/admin/accounting/AdminGeneralLedgerSection';
import { AdminTrialBalanceSection } from '../../components/admin/accounting/AdminTrialBalanceSection';
import { AdminCreditDebitNotesSection } from '../../components/admin/accounting/AdminCreditDebitNotesSection';
import { AdminCustomerLedgerSection } from '../../components/admin/accounting/AdminCustomerLedgerSection';
import { AdminSupplierLedgerSection } from '../../components/admin/accounting/AdminSupplierLedgerSection';
import { AdminCustomerReceiptsSection } from '../../components/admin/accounting/AdminCustomerReceiptsSection';
import { AdminSupplierPaymentsSection } from '../../components/admin/accounting/AdminSupplierPaymentsSection';
import { CashBankBalanceCard } from '../../components/accounting/CashBankBalanceCard';
import { AdminClient } from '../../services/adminClient';
import { useAdmin } from '../../context/AdminContext';
import {
  Account,
  AccountType,
  NormalBalance,
  CreateAccountPayload,
  UpdateAccountPayload,
  getRequiredNormalBalance,
} from '../../types/accounting';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';

const ACCOUNT_TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];

const TYPE_COLORS: Record<AccountType, { bg: string; text: string; border: string }> = {
  ASSET: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  LIABILITY: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  EQUITY: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  INCOME: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  EXPENSE: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
};

export const AdminAccountingScreen: React.FC = () => {
  const { session } = useAdmin();
  const isSuperAdmin = session?.role === 'SUPER_ADMIN';

  // Data states
  const [activeTab, setActiveTab] = useState<'COA' | 'JOURNALS' | 'GENERAL_LEDGER' | 'TRIAL_BALANCE' | 'NOTES' | 'CUSTOMER_LEDGER' | 'SUPPLIER_LEDGER' | 'CUSTOMER_RECEIPTS' | 'SUPPLIER_PAYMENTS'>('GENERAL_LEDGER');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const search = window.location.search;
      const pathname = window.location.pathname;
      if (pathname.includes('/accounting/notes') || search.includes('tab=notes') || search.includes('tab=credit-debit-notes')) {
        setActiveTab('NOTES');
      } else if (search.includes('tab=customer-receipts') || search.includes('tab=receipts') || search.includes('tab=payment-in')) {
        setActiveTab('CUSTOMER_RECEIPTS');
      } else if (search.includes('tab=supplier-payments') || search.includes('tab=payment-out') || search.includes('tab=payments-out')) {
        setActiveTab('SUPPLIER_PAYMENTS');
      } else if (search.includes('tab=customer-ledger') || search.includes('tab=customer') || search.includes('tab=receivables')) {
        setActiveTab('CUSTOMER_LEDGER');
      } else if (search.includes('tab=supplier-ledger') || search.includes('tab=supplier') || search.includes('tab=payables')) {
        setActiveTab('SUPPLIER_LEDGER');
      } else if (search.includes('tab=coa') || search.includes('tab=accounts')) {
        setActiveTab('COA');
      } else if (search.includes('tab=journals')) {
        setActiveTab('JOURNALS');
      } else if (search.includes('tab=gl') || search.includes('tab=general-ledger')) {
        setActiveTab('GENERAL_LEDGER');
      } else if (search.includes('tab=tb') || search.includes('tab=trial-balance')) {
        setActiveTab('TRIAL_BALANCE');
      }
    } catch {
      // ignore
    }
  }, []);

  // Filters & display
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'TREE' | 'TABLE'>('TREE');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Create Form State
  const [formCode, setFormCode] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formType, setFormType] = useState<AccountType>('EXPENSE');
  const [formParentId, setFormParentId] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');

  // Edit Form State
  const [editName, setEditName] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editParentId, setEditParentId] = useState<string>('');

  // Fetch accounts
  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await AdminClient.fetchAccounts();
      if (res.success && res.accounts) {
        setAccounts(res.accounts);
        // Default expand top-level accounts
        const initialExpanded: Record<string, boolean> = {};
        res.accounts.forEach(acc => {
          if (!acc.parentAccountId) {
            initialExpanded[acc.accountId] = true;
          }
        });
        setExpandedNodes(initialExpanded);
      } else {
        setError(res.message || 'Failed to load Chart of Accounts.');
      }
    } catch (err: any) {
      setError(err.message || 'Unexpected network error.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Derived auto normal balance for create form
  const autoNormalBalance = useMemo(() => {
    return getRequiredNormalBalance(formType);
  }, [formType]);

  // Filtered accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => {
      const matchesSearch =
        searchQuery === '' ||
        acc.accountCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        acc.accountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        acc.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesType = selectedType === 'ALL' || acc.accountType === selectedType;
      const matchesStatus =
        selectedStatus === 'ALL' ||
        (selectedStatus === 'ACTIVE' && acc.isActive) ||
        (selectedStatus === 'INACTIVE' && !acc.isActive);

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [accounts, searchQuery, selectedType, selectedStatus]);

  // Group accounts for tree view
  const { rootAccounts, childMap } = useMemo(() => {
    const roots: Account[] = [];
    const children: Record<string, Account[]> = {};

    filteredAccounts.forEach(acc => {
      if (!acc.parentAccountId) {
        roots.push(acc);
      } else {
        if (!children[acc.parentAccountId]) {
          children[acc.parentAccountId] = [];
        }
        children[acc.parentAccountId].push(acc);
      }
    });

    // Also collect orphaned accounts if their parent was filtered out
    filteredAccounts.forEach(acc => {
      if (acc.parentAccountId && !filteredAccounts.some(p => p.accountId === acc.parentAccountId)) {
        if (!roots.some(r => r.accountId === acc.accountId)) {
          roots.push(acc);
        }
      }
    });

    return { rootAccounts: roots, childMap: children };
  }, [filteredAccounts]);

  const toggleNode = (accountId: string) => {
    setExpandedNodes(prev => ({
      ...prev,
      [accountId]: !prev[accountId],
    }));
  };

  // Handle Account Creation
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!formCode.trim()) {
      setModalError('Account Code is required.');
      return;
    }
    if (!formName.trim() || formName.trim().length < 2) {
      setModalError('Account Name must be at least 2 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreateAccountPayload = {
        accountCode: formCode.trim(),
        accountName: formName.trim(),
        accountType: formType,
        normalBalance: autoNormalBalance,
        parentAccountId: formParentId.trim() || null,
        description: formDescription.trim(),
        isActive: true,
      };

      const res = await AdminClient.createAccount(payload);
      if (res.success && res.account) {
        setSuccessMessage(`Account "${res.account.accountCode} - ${res.account.accountName}" created successfully.`);
        setShowCreateModal(false);
        // Reset form
        setFormCode('');
        setFormName('');
        setFormDescription('');
        setFormParentId('');
        await loadAccounts();
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        setModalError(res.message || 'Failed to create account.');
      }
    } catch (err: any) {
      setModalError(err.message || 'Failed to communicate with server.');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (acc: Account) => {
    setEditingAccount(acc);
    setEditName(acc.accountName);
    setEditDescription(acc.description || '');
    setEditParentId(acc.parentAccountId || '');
    setModalError(null);
  };

  // Handle Edit Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    setModalError(null);

    if (!editName.trim() || editName.trim().length < 2) {
      setModalError('Account Name must be at least 2 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: UpdateAccountPayload = {
        accountName: editName.trim(),
        description: editDescription.trim(),
        parentAccountId: editParentId.trim() || null,
      };

      const res = await AdminClient.updateAccount(editingAccount.accountId, payload);
      if (res.success && res.account) {
        setSuccessMessage(`Account "${res.account.accountCode}" updated successfully.`);
        setEditingAccount(null);
        await loadAccounts();
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        setModalError(res.message || 'Failed to update account.');
      }
    } catch (err: any) {
      setModalError(err.message || 'Failed to communicate with server.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Status Toggle (Activate / Deactivate)
  const handleToggleStatus = async (acc: Account) => {
    const actionLabel = acc.isActive ? 'deactivate' : 'activate';
    const confirmPrompt = `Are you sure you want to ${actionLabel} account "${acc.accountCode} - ${acc.accountName}"?`;
    if (!window.confirm(confirmPrompt)) return;

    try {
      let res;
      if (acc.isActive) {
        res = await AdminClient.deactivateAccount(acc.accountId);
      } else {
        res = await AdminClient.activateAccount(acc.accountId);
      }

      if (res.success) {
        setSuccessMessage(`Account "${acc.accountCode}" ${actionLabel}d successfully.`);
        await loadAccounts();
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        setError(res.message || `Failed to ${actionLabel} account.`);
      }
    } catch (err: any) {
      setError(err.message || `Failed to ${actionLabel} account.`);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-center text-rose-800">
          <ShieldAlert className="w-12 h-12 mx-auto text-rose-600 mb-3" />
          <h2 className="text-xl font-bold mb-2">Restricted Access: Super Administrator Only</h2>
          <p className="text-sm text-rose-700">
            Accounting and Chart of Accounts administration is strictly restricted to active SUPER_ADMIN credentials.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Phase 6 Part 4C-B: Server-authoritative Ledger-Backed Cash & Bank Balance Card */}
      <CashBankBalanceCard
        fetchBalances={(bypassCache) => AdminClient.getAccountingBalances(bypassCache)}
        title="Admin Accounting Ledger Balances"
        subtitle="General Ledger Cash in Hand (A/C 1100) & Bank Balance (A/C 1200) • Strictly Read-Only"
      />

      {/* Top Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-stone-200 pb-3 overflow-x-auto">
        <button
          type="button"
          onClick={() => {
            setActiveTab('COA');
            try {
              window.history.replaceState(null, '', '/admin/accounting?tab=coa');
            } catch {}
          }}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'COA'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Chart of Accounts
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('JOURNALS');
            try {
              window.history.replaceState(null, '', '/admin/accounting?tab=journals');
            } catch {}
          }}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'JOURNALS'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <Scale className="w-4 h-4" />
          Journal Entries (Vouchers)
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('GENERAL_LEDGER');
            try {
              window.history.replaceState(null, '', '/admin/accounting?tab=gl');
            } catch {}
          }}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'GENERAL_LEDGER'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          General Ledger
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('TRIAL_BALANCE');
            try {
              window.history.replaceState(null, '', '/admin/accounting?tab=tb');
            } catch {}
          }}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'TRIAL_BALANCE'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <Scale className="w-4 h-4" />
          Trial Balance
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('NOTES');
            try {
              window.history.replaceState(null, '', '/admin/accounting?tab=notes');
            } catch {}
          }}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'NOTES'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Credit & Debit Notes
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('CUSTOMER_LEDGER');
            try {
              window.history.replaceState(null, '', '/admin/accounting?tab=customer-ledger');
            } catch {}
          }}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'CUSTOMER_LEDGER'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <Users className="w-4 h-4" />
          Customer Ledger (1300)
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('SUPPLIER_LEDGER');
            try {
              window.history.replaceState(null, '', '/admin/accounting?tab=supplier-ledger');
            } catch {}
          }}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'SUPPLIER_LEDGER'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <Truck className="w-4 h-4" />
          Supplier Ledger (2100)
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('CUSTOMER_RECEIPTS');
            try {
              window.history.replaceState(null, '', '/admin/accounting?tab=customer-receipts');
            } catch {}
          }}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'CUSTOMER_RECEIPTS'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <ArrowDownLeft className="w-4 h-4" />
          Payment In (Receipts)
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('SUPPLIER_PAYMENTS');
            try {
              window.history.replaceState(null, '', '/admin/accounting?tab=supplier-payments');
            } catch {}
          }}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'SUPPLIER_PAYMENTS'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
          Payment Out (Supplier)
        </button>
      </div>

      {activeTab === 'CUSTOMER_RECEIPTS' && (
        <div className="space-y-6">
          <AdminPageHeader
            title="Payment In — Customer Receipts"
            subtitle="Server-authoritative money receipt foundation (Phase 5.7 Part 2A) • Cash Dr / Accounts Receivable 1300 Cr"
            badge="Payment In"
          />
          <AdminCustomerReceiptsSection />
        </div>
      )}

      {activeTab === 'SUPPLIER_PAYMENTS' && (
        <div className="space-y-6">
          <AdminPageHeader
            title="Payment Out — Supplier Payments"
            subtitle="Server-authoritative supplier payment foundation (Phase 5.8 Part 1 & Phase 6 Part 4D) • Accounts Payable 2100 Dr / Cash-Bank Cr"
            badge="Payment Out"
          />
          <AdminSupplierPaymentsSection />
        </div>
      )}

      {activeTab === 'CUSTOMER_LEDGER' && (
        <div className="space-y-6">
          <AdminPageHeader
            title="Customer Receivable Ledger"
            subtitle="Authoritative kirana subledger derived strictly from posted sales invoices, credit notes, and debit notes (Account 1300)"
            badge="Customer Ledger"
          />
          <AdminCustomerLedgerSection />
        </div>
      )}

      {activeTab === 'SUPPLIER_LEDGER' && (
        <div className="space-y-6">
          <AdminPageHeader
            title="Supplier Payable Ledger"
            subtitle="Authoritative FMCG vendor subledger derived strictly from posted purchase bills, debit notes, and credit notes (Account 2100)"
            badge="Supplier Ledger"
          />
          <AdminSupplierLedgerSection />
        </div>
      )}

      {activeTab === 'NOTES' && (
        <div className="space-y-6">
          <AdminPageHeader
            title="Credit & Debit Notes"
            subtitle="Controlled accounting adjustments, invoice corrections, and reversals with balanced double-entry GL linkage"
            badge="Phase 5.6"
          />
          <AdminCreditDebitNotesSection />
        </div>
      )}

      {activeTab === 'GENERAL_LEDGER' && (
        <div className="space-y-6">
          <AdminPageHeader
            title="General Ledger"
            subtitle="Server-authoritative ledger accounts with exact integer-paise running balance calculation"
            badge="General Ledger"
          />
          <AdminGeneralLedgerSection accounts={accounts} />
        </div>
      )}

      {activeTab === 'TRIAL_BALANCE' && (
        <div className="space-y-6">
          <AdminPageHeader
            title="Trial Balance"
            subtitle="Server-authoritative proof of double-entry invariant: TOTAL DEBIT = TOTAL CREDIT"
            badge="Trial Balance Invariant"
          />
          <AdminTrialBalanceSection />
        </div>
      )}

      {activeTab === 'JOURNALS' && (
        <div className="space-y-6">
          <AdminPageHeader
            title="Journal Entries (Vouchers)"
            subtitle="Server-authoritative double-entry vouchers with strict DEBIT = CREDIT enforcement"
            badge="Double-Entry Engine"
          />
          <AdminJournalEntriesSection accounts={accounts} onRefreshAccounts={loadAccounts} />
        </div>
      )}

      {activeTab === 'COA' && (
        <div className="space-y-6">
          {/* Header */}
          <AdminPageHeader
            title="Chart of Accounts"
            subtitle="Manage hierarchical general ledger accounts, normal balances, and accounting categories"
            badge="Core Accounting"
            actions={
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={loadAccounts}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModalError(null);
                    setShowCreateModal(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  New Account
                </button>
              </div>
            }
          />

      {/* Success Notification */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-medium">{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-xs text-emerald-600 hover:text-emerald-800 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Global Error Banner */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs text-rose-600 hover:text-rose-800 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Summary Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {ACCOUNT_TYPES.map(type => {
          const count = accounts.filter(a => a.accountType === type).length;
          const activeCount = accounts.filter(a => a.accountType === type && a.isActive).length;
          const colors = TYPE_COLORS[type];
          return (
            <div
              key={type}
              onClick={() => setSelectedType(selectedType === type ? 'ALL' : type)}
              className={`p-3 bg-white border rounded-xl cursor-pointer transition-all hover:shadow-sm ${
                selectedType === type ? 'ring-2 ring-emerald-500 border-emerald-400' : 'border-stone-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
                  {type}
                </span>
                <span className="text-[10px] text-stone-400 font-mono">
                  {getRequiredNormalBalance(type)}
                </span>
              </div>
              <div className="text-xl font-bold text-stone-800">{count}</div>
              <div className="text-[11px] text-stone-500">{activeCount} active</div>
            </div>
          );
        })}
      </div>

      {/* Controls: Search, Filters & View Toggle */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex-1 w-full md:w-auto flex flex-col sm:flex-row items-center gap-3">
          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder="Search code, name, description..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-stone-400 hover:text-stone-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Account Type Filter */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-stone-400" />
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              className="text-xs bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-2 text-stone-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">All Types</option>
              {ACCOUNT_TYPES.map(t => (
                <option key={t} value={t}>
                  {t} ({getRequiredNormalBalance(t)})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            className="text-xs bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-2 text-stone-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-full sm:w-auto"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg border border-stone-200">
          <button
            type="button"
            onClick={() => setViewMode('TREE')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              viewMode === 'TREE'
                ? 'bg-white text-stone-800 shadow-xs font-semibold'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            Tree View
          </button>
          <button
            type="button"
            onClick={() => setViewMode('TABLE')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              viewMode === 'TABLE'
                ? 'bg-white text-stone-800 shadow-xs font-semibold'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            Flat Table
          </button>
        </div>
      </div>

      {/* Main Content: Tree View or Table View */}
      {loading ? (
        <div className="bg-white border border-stone-200 rounded-xl p-12 text-center shadow-sm">
          <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-stone-600">Loading Chart of Accounts from Firestore...</p>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-12 text-center shadow-sm">
          <BookOpen className="w-10 h-10 text-stone-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-stone-800 mb-1">No Accounts Found</h3>
          <p className="text-xs text-stone-500 max-w-sm mx-auto mb-4">
            {searchQuery || selectedType !== 'ALL' || selectedStatus !== 'ALL'
              ? 'No accounts match your search filters. Try clearing filters.'
              : 'Chart of Accounts is empty. System accounts will be initialized automatically.'}
          </p>
          {(searchQuery || selectedType !== 'ALL' || selectedStatus !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedType('ALL');
                setSelectedStatus('ALL');
              }}
              className="text-xs font-semibold text-emerald-600 hover:underline"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : viewMode === 'TREE' ? (
        <div className="bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-stone-50 border-b border-stone-200 flex items-center justify-between text-xs font-semibold text-stone-500 uppercase tracking-wider">
            <span className="w-1/2">Account Code & Name</span>
            <span className="w-1/6 text-center">Type</span>
            <span className="w-1/8 text-center">Normal Bal</span>
            <span className="w-1/8 text-center">Status</span>
            <span className="w-24 text-right">Actions</span>
          </div>

          <div className="divide-y divide-stone-100">
            {rootAccounts.map(root => (
              <AccountTreeRow
                key={root.accountId}
                account={root}
                childMap={childMap}
                level={0}
                expandedNodes={expandedNodes}
                onToggle={toggleNode}
                onEdit={openEditModal}
                onToggleStatus={handleToggleStatus}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Account Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Normal Balance</th>
                <th className="px-4 py-3">Parent</th>
                <th className="px-4 py-3 text-center">System</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredAccounts.map(acc => {
                const colors = TYPE_COLORS[acc.accountType];
                const parentAcc = accounts.find(a => a.accountId === acc.parentAccountId);
                return (
                  <tr key={acc.accountId} className="hover:bg-stone-50/80 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-stone-800">
                      {acc.accountCode}
                    </td>
                    <td className="px-4 py-3 font-medium text-stone-900">
                      <div>{acc.accountName}</div>
                      {acc.description && (
                        <div className="text-[11px] text-stone-400 font-normal">{acc.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
                        {acc.accountType}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-stone-700">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${acc.normalBalance === 'DEBIT' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                        {acc.normalBalance}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone-500 font-mono text-[11px]">
                      {parentAcc ? `${parentAcc.accountCode} - ${parentAcc.accountName}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {acc.isSystemAccount ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                          <Lock className="w-2.5 h-2.5" /> System
                        </span>
                      ) : (
                        <span className="text-[10px] text-stone-400">Custom</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${acc.isActive ? 'bg-emerald-500' : 'bg-stone-300'}`} />
                      <span className={`text-[11px] font-medium ${acc.isActive ? 'text-emerald-700' : 'text-stone-400'}`}>
                        {acc.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(acc)}
                          className="p-1 text-stone-500 hover:text-stone-800 rounded hover:bg-stone-100 cursor-pointer"
                          title="Edit Account"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(acc)}
                          className={`p-1 rounded cursor-pointer ${
                            acc.isActive ? 'text-stone-400 hover:text-rose-600 hover:bg-rose-50' : 'text-stone-400 hover:text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={acc.isActive ? 'Deactivate Account' : 'Activate Account'}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE ACCOUNT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="px-6 py-4 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-stone-900">Create New Account</h3>
                <p className="text-xs text-stone-500">Add account to hierarchical Chart of Accounts</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-stone-400 hover:text-stone-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 text-xs">
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-stone-700 font-semibold mb-1">
                    Account Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 6700"
                    value={formCode}
                    onChange={e => setFormCode(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg font-mono focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="text-[10px] text-stone-400 mt-0.5 block">Unique 2-20 alphanumeric characters</span>
                </div>

                <div>
                  <label className="block text-stone-700 font-semibold mb-1">
                    Account Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formType}
                    onChange={e => setFormType(e.target.value as AccountType)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {ACCOUNT_TYPES.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <span className="text-[10px] text-stone-400 mt-0.5 block">Determines Normal Balance</span>
                </div>
              </div>

              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Account Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Office Supplies"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-stone-700 font-semibold mb-1">
                    Normal Balance (Enforced)
                  </label>
                  <div className="px-3 py-2 bg-stone-100 border border-stone-200 rounded-lg font-mono font-bold text-stone-700 flex items-center justify-between">
                    <span>{autoNormalBalance}</span>
                    <span className="text-[10px] text-stone-400 font-sans font-normal">Auto-assigned</span>
                  </div>
                </div>

                <div>
                  <label className="block text-stone-700 font-semibold mb-1">
                    Parent Account (Optional)
                  </label>
                  <select
                    value={formParentId}
                    onChange={e => setFormParentId(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">None (Top-Level Control Account)</option>
                    {accounts
                      .filter(a => a.accountType === formType)
                      .map(a => (
                        <option key={a.accountId} value={a.accountId}>
                          {a.accountCode} - {a.accountName}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief accounting purpose or transaction type..."
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-stone-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-stone-600 hover:text-stone-800 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ACCOUNT MODAL */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="px-6 py-4 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Edit Account: {editingAccount.accountCode}
                </h3>
                <p className="text-xs text-stone-500">
                  {editingAccount.isSystemAccount ? 'System Account (Code & Type locked)' : 'Custom Ledger Account'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAccount(null)}
                className="text-stone-400 hover:text-stone-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4 text-xs">
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-stone-700 font-semibold mb-1">Account Code</label>
                  <input
                    type="text"
                    disabled
                    value={editingAccount.accountCode}
                    className="w-full px-3 py-2 bg-stone-100 border border-stone-200 rounded-lg font-mono text-stone-500 cursor-not-allowed"
                  />
                  {editingAccount.isSystemAccount && (
                    <span className="text-[10px] text-amber-600 mt-0.5 block flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" /> Immutable system code
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-stone-700 font-semibold mb-1">Account Type</label>
                  <input
                    type="text"
                    disabled
                    value={`${editingAccount.accountType} (${editingAccount.normalBalance})`}
                    className="w-full px-3 py-2 bg-stone-100 border border-stone-200 rounded-lg text-stone-500 cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Account Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Parent Account
                </label>
                <select
                  value={editParentId}
                  onChange={e => setEditParentId(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">None (Top-Level Control Account)</option>
                  {accounts
                    .filter(a => a.accountId !== editingAccount.accountId && a.accountType === editingAccount.accountType)
                    .map(a => (
                      <option key={a.accountId} value={a.accountId}>
                        {a.accountCode} - {a.accountName}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-stone-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingAccount(null)}
                  className="px-4 py-2 text-stone-600 hover:text-stone-800 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </div>
      )}
    </div>
  );
};

// Tree Row Component supporting infinite nesting
interface TreeRowProps {
  account: Account;
  childMap: Record<string, Account[]>;
  level: number;
  expandedNodes: Record<string, boolean>;
  onToggle: (id: string) => void;
  onEdit: (acc: Account) => void;
  onToggleStatus: (acc: Account) => void;
}

const AccountTreeRow: React.FC<TreeRowProps> = ({
  account,
  childMap,
  level,
  expandedNodes,
  onToggle,
  onEdit,
  onToggleStatus,
}) => {
  const children = childMap[account.accountId] || [];
  const hasChildren = children.length > 0;
  const isExpanded = !!expandedNodes[account.accountId];
  const colors = TYPE_COLORS[account.accountType];

  return (
    <div>
      <div
        className={`px-4 py-3 flex items-center justify-between text-xs hover:bg-stone-50/80 transition-colors ${
          level > 0 ? 'bg-stone-50/40' : ''
        }`}
      >
        {/* Name & Code */}
        <div className="w-1/2 flex items-center gap-2" style={{ paddingLeft: `${level * 24}px` }}>
          {hasChildren ? (
            <button
              type="button"
              onClick={() => onToggle(account.accountId)}
              className="p-1 hover:bg-stone-200 rounded text-stone-500 cursor-pointer"
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-5 inline-block" />
          )}

          <span className="font-mono font-bold text-stone-900 min-w-14">
            {account.accountCode}
          </span>

          <span className="font-semibold text-stone-800">
            {account.accountName}
          </span>

          {account.isSystemAccount && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.2 rounded">
              <Lock className="w-2.5 h-2.5" /> System
            </span>
          )}

          {account.description && (
            <span className="hidden lg:inline text-[11px] text-stone-400 truncate max-w-xs">
              — {account.description}
            </span>
          )}
        </div>

        {/* Type Badge */}
        <div className="w-1/6 text-center">
          <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
            {account.accountType}
          </span>
        </div>

        {/* Normal Balance */}
        <div className="w-1/8 text-center font-mono font-semibold">
          <span className={`px-2 py-0.5 rounded text-[10px] ${account.normalBalance === 'DEBIT' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
            {account.normalBalance}
          </span>
        </div>

        {/* Status */}
        <div className="w-1/8 text-center">
          <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${account.isActive ? 'bg-emerald-500' : 'bg-stone-300'}`} />
          <span className={`text-[11px] font-medium ${account.isActive ? 'text-emerald-700' : 'text-stone-400'}`}>
            {account.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        {/* Actions */}
        <div className="w-24 text-right">
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(account)}
              className="p-1 text-stone-500 hover:text-stone-800 rounded hover:bg-stone-100 cursor-pointer"
              title="Edit Account"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onToggleStatus(account)}
              className={`p-1 rounded cursor-pointer ${
                account.isActive ? 'text-stone-400 hover:text-rose-600 hover:bg-rose-50' : 'text-stone-400 hover:text-emerald-600 hover:bg-emerald-50'
              }`}
              title={account.isActive ? 'Deactivate Account' : 'Activate Account'}
            >
              <Power className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Render Children Recursively if Expanded */}
      {isExpanded &&
        children.map(child => (
          <AccountTreeRow
            key={child.accountId}
            account={child}
            childMap={childMap}
            level={level + 1}
            expandedNodes={expandedNodes}
            onToggle={onToggle}
            onEdit={onEdit}
            onToggleStatus={onToggleStatus}
          />
        ))}
    </div>
  );
};
