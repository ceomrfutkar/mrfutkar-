/**
 * MR FUTKAR — Admin Journal Entries Section
 * Phase 5.4 Part 2: Double-Entry Journal Engine Management
 * Strictly SUPER_ADMIN authorized with live server-authoritative Firestore data
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  Search,
  Filter,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Lock,
  ArrowRightLeft,
  Check,
  RotateCcw,
  Calendar,
  Eye,
  Trash2,
  DollarSign,
  Scale,
} from 'lucide-react';
import { AdminClient } from '../../../services/adminClient';
import {
  Account,
  JournalEntry,
  JournalEntryLine,
  JournalStatus,
  VoucherType,
  CreateJournalPayload,
  JournalLinePayload,
} from '../../../types/accounting';

interface AdminJournalEntriesSectionProps {
  accounts: Account[];
  onRefreshAccounts: () => void;
}

const VOUCHER_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  JOURNAL: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  PAYMENT: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  RECEIPT: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  CONTRA: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  REVERSAL: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
};

const STATUS_BADGES: Record<JournalStatus, { bg: string; text: string; border: string }> = {
  DRAFT: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  POSTED: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  REVERSED: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
};

export const AdminJournalEntriesSection: React.FC<AdminJournalEntriesSectionProps> = ({
  accounts,
  onRefreshAccounts,
}) => {
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [viewingJournalId, setViewingJournalId] = useState<string | null>(null);
  const [viewingJournal, setViewingJournal] = useState<JournalEntry | null>(null);
  const [viewingLines, setViewingLines] = useState<JournalEntryLine[]>([]);
  const [modalLoading, setModalLoading] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Create Form State
  const [formDate, setFormDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [formType, setFormType] = useState<VoucherType>('JOURNAL');
  const [formNarration, setFormNarration] = useState<string>('');
  const [formRefType, setFormRefType] = useState<string>('');
  const [formRefId, setFormRefId] = useState<string>('');
  const [formLines, setFormLines] = useState<JournalLinePayload[]>([
    { accountId: '', debit: 0, credit: 0, description: '' },
    { accountId: '', debit: 0, credit: 0, description: '' },
  ]);

  // Load Journals
  const loadJournals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await AdminClient.fetchJournals({
        search: searchQuery || undefined,
        status: selectedStatus !== 'ALL' ? (selectedStatus as JournalStatus) : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });

      if (res.success && res.journals) {
        setJournals(res.journals);
      } else {
        setError(res.message || 'Failed to load journals.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to communicate with server.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedStatus, fromDate, toDate]);

  useEffect(() => {
    loadJournals();
  }, [loadJournals]);

  // Filtered by type in client if requested
  const filteredJournals = useMemo(() => {
    if (selectedType === 'ALL') return journals;
    return journals.filter(j => j.voucherType === selectedType);
  }, [journals, selectedType]);

  // Stats calculation
  const stats = useMemo(() => {
    const total = journals.length;
    const drafts = journals.filter(j => j.status === 'DRAFT').length;
    const posted = journals.filter(j => j.status === 'POSTED').length;
    const reversed = journals.filter(j => j.status === 'REVERSED').length;
    const postedVolume = journals
      .filter(j => j.status === 'POSTED')
      .reduce((sum, j) => sum + (j.totalDebit || 0), 0);
    return { total, drafts, posted, reversed, postedVolume };
  }, [journals]);

  // Active accounts for selector
  const activeAccounts = useMemo(() => {
    return accounts.filter(a => a.isActive);
  }, [accounts]);

  // Form Live Totals & Balance Check
  const { totalDebit, totalCredit, difference, isBalanced } = useMemo(() => {
    let d = 0;
    let c = 0;
    formLines.forEach(l => {
      d += Number(l.debit) || 0;
      c += Number(l.credit) || 0;
    });
    d = Number(d.toFixed(2));
    c = Number(c.toFixed(2));
    const diff = Number(Math.abs(d - c).toFixed(2));
    return {
      totalDebit: d,
      totalCredit: c,
      difference: diff,
      isBalanced: diff === 0 && d > 0,
    };
  }, [formLines]);

  // Line item change handler
  const handleLineChange = (index: number, field: keyof JournalLinePayload, value: any) => {
    setFormLines(prev => {
      const next = [...prev];
      const current = { ...next[index] };

      if (field === 'debit') {
        const val = Math.max(0, Number(value) || 0);
        current.debit = val;
        if (val > 0) current.credit = 0; // mutually exclusive
      } else if (field === 'credit') {
        const val = Math.max(0, Number(value) || 0);
        current.credit = val;
        if (val > 0) current.debit = 0; // mutually exclusive
      } else {
        (current as any)[field] = value;
      }

      next[index] = current;
      return next;
    });
  };

  const addLine = () => {
    setFormLines(prev => [...prev, { accountId: '', debit: 0, credit: 0, description: '' }]);
  };

  const removeLine = (index: number) => {
    if (formLines.length <= 2) {
      alert('A journal entry must contain at least 2 line items.');
      return;
    }
    setFormLines(prev => prev.filter((_, i) => i !== index));
  };

  // Submit Draft or Post
  const handleCreateSubmit = async (shouldPostDirectly: boolean) => {
    setModalError(null);

    if (!formNarration.trim()) {
      setModalError('Narration is required.');
      return;
    }

    if (formLines.length < 2) {
      setModalError('A journal entry requires at least 2 lines.');
      return;
    }

    for (let i = 0; i < formLines.length; i++) {
      const l = formLines[i];
      if (!l.accountId) {
        setModalError(`Line ${i + 1}: Select an account.`);
        return;
      }
      if (l.debit === 0 && l.credit === 0) {
        setModalError(`Line ${i + 1}: Must have either Debit or Credit greater than 0.`);
        return;
      }
    }

    if (!isBalanced) {
      setModalError(`Journal is unbalanced. Total Debit (₹${totalDebit}) must equal Total Credit (₹${totalCredit}).`);
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreateJournalPayload = {
        journalDate: formDate,
        voucherType: formType,
        narration: formNarration.trim(),
        referenceType: formRefType.trim() || undefined,
        referenceId: formRefId.trim() || undefined,
        lines: formLines.map(l => ({
          accountId: l.accountId,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          description: l.description?.trim() || undefined,
        })),
      };

      if (editingDraftId) {
        // Update existing draft
        const res = await AdminClient.updateJournal(editingDraftId, payload);
        if (!res.success || !res.journal) {
          setModalError(res.message || 'Failed to update draft journal entry.');
          return;
        }

        if (shouldPostDirectly) {
          const postRes = await AdminClient.postJournal(editingDraftId);
          if (!postRes.success) {
            setModalError(postRes.message || 'Draft was updated, but posting failed.');
            await loadJournals();
            return;
          }
          setSuccessMessage(`Journal "${postRes.journal?.journalNumber || editingDraftId}" posted successfully!`);
        } else {
          setSuccessMessage(`Draft journal "${editingDraftId}" updated successfully.`);
        }
      } else {
        // Create new draft
        const res = await AdminClient.createDraftJournal(payload);
        if (!res.success || !res.journal) {
          setModalError(res.message || 'Failed to create journal entry.');
          return;
        }

        const createdId = res.journal.journalId;

        if (shouldPostDirectly) {
          const postRes = await AdminClient.postJournal(createdId);
          if (!postRes.success) {
            setModalError(postRes.message || 'Journal was saved as DRAFT, but posting failed.');
            await loadJournals();
            return;
          }
          setSuccessMessage(`Journal "${postRes.journal?.journalNumber || createdId}" posted successfully!`);
        } else {
          setSuccessMessage(`Draft journal "${createdId}" saved successfully.`);
        }
      }

      setShowCreateModal(false);
      resetCreateForm();
      await loadJournals();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setModalError(err.message || 'Error saving journal entry.');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditDraftModal = async (journal: JournalEntry) => {
    setEditingDraftId(journal.journalId);
    setModalError(null);
    setFormDate(journal.journalDate);
    setFormType(journal.voucherType || 'JOURNAL');
    setFormNarration(journal.narration);
    setFormRefType(journal.referenceType || '');
    setFormRefId(journal.referenceId || '');

    // Fetch lines for this journal
    try {
      const res = await AdminClient.getJournal(journal.journalId);
      if (res.success && res.lines && res.lines.length >= 2) {
        setFormLines(
          res.lines.map((l: JournalEntryLine) => ({
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            description: l.description || '',
          }))
        );
      }
    } catch {
      // Fallback
    }
    setViewingJournalId(null);
    setShowCreateModal(true);
  };

  const resetCreateForm = () => {
    setEditingDraftId(null);
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormType('JOURNAL');
    setFormNarration('');
    setFormRefType('');
    setFormRefId('');
    setFormLines([
      { accountId: '', debit: 0, credit: 0, description: '' },
      { accountId: '', debit: 0, credit: 0, description: '' },
    ]);
    setModalError(null);
  };

  // Open Journal Details Modal
  const openViewModal = async (journalId: string) => {
    setViewingJournalId(journalId);
    setModalLoading(true);
    setModalError(null);
    try {
      const res = await AdminClient.getJournal(journalId);
      if (res.success && res.journal) {
        setViewingJournal(res.journal);
        setViewingLines(res.lines || []);
      } else {
        setModalError(res.message || 'Failed to load journal details.');
      }
    } catch (err: any) {
      setModalError(err.message || 'Failed to fetch journal.');
    } finally {
      setModalLoading(false);
    }
  };

  // Handle Post from View Modal
  const handlePostJournal = async (journalId: string) => {
    if (!window.confirm('Post this journal entry authoritatively to the general ledger? Once posted, it becomes immutable.')) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await AdminClient.postJournal(journalId);
      if (res.success && res.journal) {
        setSuccessMessage(`Journal "${res.journal.journalNumber}" posted successfully.`);
        setViewingJournal(res.journal);
        setViewingLines(res.lines || []);
        await loadJournals();
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        setModalError(res.message || 'Failed to post journal.');
      }
    } catch (err: any) {
      setModalError(err.message || 'Posting failed.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Reversal from View Modal
  const handleReverseJournal = async (journalId: string) => {
    if (!window.confirm('Are you sure you want to reverse this posted journal entry? A new reversal voucher with swapped debit/credit entries will be generated, and this journal will be marked as REVERSED.')) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await AdminClient.reverseJournal(journalId);
      if (res.success && res.reversalJournal) {
        setSuccessMessage(`Journal reversed successfully. Reversal voucher "${res.reversalJournal.journalNumber}" created.`);
        setViewingJournalId(null);
        await loadJournals();
        setTimeout(() => setSuccessMessage(null), 4000);
      } else {
        setModalError(res.message || 'Failed to reverse journal.');
      }
    } catch (err: any) {
      setModalError(err.message || 'Reversal failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Notifications */}
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

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div
          onClick={() => setSelectedStatus('ALL')}
          className={`p-3 bg-white border rounded-xl cursor-pointer transition-all hover:shadow-sm ${
            selectedStatus === 'ALL' ? 'ring-2 ring-emerald-500 border-emerald-400' : 'border-stone-200'
          }`}
        >
          <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
            Total Journals
          </div>
          <div className="text-xl font-bold text-stone-900">{stats.total}</div>
          <div className="text-[11px] text-stone-400">All vouchers</div>
        </div>

        <div
          onClick={() => setSelectedStatus('POSTED')}
          className={`p-3 bg-white border rounded-xl cursor-pointer transition-all hover:shadow-sm ${
            selectedStatus === 'POSTED' ? 'ring-2 ring-emerald-500 border-emerald-400' : 'border-stone-200'
          }`}
        >
          <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider mb-1">
            Posted
          </div>
          <div className="text-xl font-bold text-emerald-800">{stats.posted}</div>
          <div className="text-[11px] text-emerald-600">Authoritative ledger</div>
        </div>

        <div
          onClick={() => setSelectedStatus('DRAFT')}
          className={`p-3 bg-white border rounded-xl cursor-pointer transition-all hover:shadow-sm ${
            selectedStatus === 'DRAFT' ? 'ring-2 ring-amber-500 border-amber-400' : 'border-stone-200'
          }`}
        >
          <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider mb-1">
            Drafts
          </div>
          <div className="text-xl font-bold text-amber-800">{stats.drafts}</div>
          <div className="text-[11px] text-amber-600">Pending review & post</div>
        </div>

        <div
          onClick={() => setSelectedStatus('REVERSED')}
          className={`p-3 bg-white border rounded-xl cursor-pointer transition-all hover:shadow-sm ${
            selectedStatus === 'REVERSED' ? 'ring-2 ring-purple-500 border-purple-400' : 'border-stone-200'
          }`}
        >
          <div className="text-[11px] font-bold text-purple-700 uppercase tracking-wider mb-1">
            Reversed
          </div>
          <div className="text-xl font-bold text-purple-800">{stats.reversed}</div>
          <div className="text-[11px] text-purple-600">Corrected vouchers</div>
        </div>

        <div className="p-3 bg-white border border-stone-200 rounded-xl">
          <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-1">
            Posted Volume
          </div>
          <div className="text-xl font-bold text-stone-900 font-mono">
            ₹{stats.postedVolume.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-stone-400">Total ledger turnover</div>
        </div>
      </div>

      {/* Action / Filter Bar */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex-1 w-full flex flex-col sm:flex-row items-center gap-3">
          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder="Search voucher #, narration, ref ID..."
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

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-stone-400" />
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="text-xs bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-2 text-stone-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="POSTED">Posted Only</option>
              <option value="DRAFT">Draft Only</option>
              <option value="REVERSED">Reversed Only</option>
            </select>
          </div>

          {/* Voucher Type Filter */}
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
            className="text-xs bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-2 text-stone-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="ALL">All Voucher Types</option>
            <option value="JOURNAL">JOURNAL (JV)</option>
            <option value="PAYMENT">PAYMENT (PV)</option>
            <option value="RECEIPT">RECEIPT (RV)</option>
            <option value="CONTRA">CONTRA (CV)</option>
            <option value="REVERSAL">REVERSAL (REV)</option>
          </select>

          {/* Date Range Filter */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <Calendar className="w-3.5 h-3.5 text-stone-400" />
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="text-xs bg-stone-50 border border-stone-200 rounded-lg px-2 py-1.5 text-stone-700 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
              title="From Date"
            />
            <span className="text-xs text-stone-400">to</span>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="text-xs bg-stone-50 border border-stone-200 rounded-lg px-2 py-1.5 text-stone-700 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
              title="To Date"
            />
            {(fromDate || toDate) && (
              <button
                type="button"
                onClick={() => { setFromDate(''); setToDate(''); }}
                className="text-xs text-stone-400 hover:text-stone-600 font-bold px-1"
                title="Clear Date Filter"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={loadJournals}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              resetCreateForm();
              setShowCreateModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Journal Entry
          </button>
        </div>
      </div>

      {/* Journals Table */}
      {loading ? (
        <div className="p-12 text-center bg-white border border-stone-200 rounded-xl shadow-sm">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
          <p className="text-xs text-stone-500 font-medium">Loading journals from general ledger...</p>
        </div>
      ) : filteredJournals.length === 0 ? (
        <div className="p-12 text-center bg-white border border-stone-200 rounded-xl shadow-sm">
          <Scale className="w-12 h-12 mx-auto text-stone-300 mb-3" />
          <h3 className="text-sm font-semibold text-stone-800 mb-1">No Journal Entries Found</h3>
          <p className="text-xs text-stone-500 mb-4 max-w-md mx-auto">
            No journal vouchers match your selected filters. Create a new journal entry or reset filters to view ledger records.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedStatus('ALL');
              setSelectedType('ALL');
            }}
            className="text-xs font-semibold text-emerald-600 hover:underline"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Voucher #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Narration & Reference</th>
                <th className="px-4 py-3 text-right">Debit (₹)</th>
                <th className="px-4 py-3 text-right">Credit (₹)</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredJournals.map(journal => {
                const typeColor = VOUCHER_TYPE_COLORS[journal.voucherType] || VOUCHER_TYPE_COLORS.JOURNAL;
                const statusBadge = STATUS_BADGES[journal.status];
                return (
                  <tr key={journal.journalId} className="hover:bg-stone-50/80 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-stone-800">
                      {journal.journalNumber ? (
                        <span className="text-stone-900">{journal.journalNumber}</span>
                      ) : (
                        <span className="text-amber-600 italic">DRAFT</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-stone-600 whitespace-nowrap">
                      {journal.journalDate}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded border ${typeColor.bg} ${typeColor.text} ${typeColor.border}`}>
                        {journal.voucherType}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-medium text-stone-800 truncate" title={journal.narration}>
                        {journal.narration}
                      </div>
                      {journal.referenceId && (
                        <div className="text-[11px] text-stone-400 font-mono">
                          Ref: {journal.referenceType ? `${journal.referenceType}: ` : ''}{journal.referenceId}
                        </div>
                      )}
                      {journal.reversalOfJournalId && (
                        <div className="text-[11px] text-purple-600 font-mono">
                          Reversal of {journal.reversalOfJournalId}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-stone-800">
                      ₹{journal.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-stone-800">
                      ₹{journal.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusBadge.bg} ${statusBadge.text} ${statusBadge.border}`}>
                        {journal.status === 'POSTED' && <Check className="w-2.5 h-2.5" />}
                        {journal.status === 'REVERSED' && <RotateCcw className="w-2.5 h-2.5" />}
                        {journal.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openViewModal(journal.journalId)}
                          className="p-1 text-stone-500 hover:text-stone-800 rounded hover:bg-stone-100 cursor-pointer"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {journal.status === 'DRAFT' && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditDraftModal(journal)}
                              className="px-2 py-0.5 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded border border-amber-200 cursor-pointer"
                              title="Edit Draft"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePostJournal(journal.journalId)}
                              className="px-2 py-0.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200 cursor-pointer"
                              title="Post Journal"
                            >
                              Post
                            </button>
                          </>
                        )}
                        {journal.status === 'POSTED' && (
                          <button
                            type="button"
                            onClick={() => handleReverseJournal(journal.journalId)}
                            className="px-2 py-0.5 text-[11px] font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded border border-purple-200 cursor-pointer"
                            title="Reverse Journal"
                          >
                            Reverse
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE NEW JOURNAL MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-200 pb-4">
              <div>
                <h3 className="text-lg font-bold text-stone-900">
                  {editingDraftId ? 'Edit Draft Journal Entry' : 'New Double-Entry Journal Entry'}
                </h3>
                <p className="text-xs text-stone-500">
                  Every posted entry strictly requires Total Debit = Total Credit with at least 2 balanced lines.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-stone-400 hover:text-stone-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            {/* Header Form */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-stone-50 p-4 rounded-xl border border-stone-200 text-xs">
              <div>
                <label className="block text-stone-600 font-semibold mb-1">Journal Date *</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-stone-600 font-semibold mb-1">Voucher Type *</label>
                <select
                  value={formType}
                  onChange={e => setFormType(e.target.value as VoucherType)}
                  className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="JOURNAL">JOURNAL (JV)</option>
                  <option value="PAYMENT">PAYMENT (PV)</option>
                  <option value="RECEIPT">RECEIPT (RV)</option>
                  <option value="CONTRA">CONTRA (CV)</option>
                </select>
              </div>

              <div>
                <label className="block text-stone-600 font-semibold mb-1">Ref Type (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. INVOICE, EXPENSE"
                  value={formRefType}
                  onChange={e => setFormRefType(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-stone-600 font-semibold mb-1">Ref ID (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. INV-1002"
                  value={formRefId}
                  onChange={e => setFormRefId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-stone-600 font-semibold mb-1">Narration *</label>
                <input
                  type="text"
                  placeholder="Brief description of the financial transaction..."
                  value={formNarration}
                  onChange={e => setFormNarration(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  required
                />
              </div>
            </div>

            {/* Lines Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                  Journal Lines ({formLines.length})
                </h4>
                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Row
                </button>
              </div>

              <div className="border border-stone-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-100 text-stone-600 font-semibold uppercase text-[11px]">
                    <tr>
                      <th className="px-3 py-2 w-12 text-center">#</th>
                      <th className="px-3 py-2 w-1/3">Account *</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 w-28 text-right">Debit (₹)</th>
                      <th className="px-3 py-2 w-28 text-right">Credit (₹)</th>
                      <th className="px-3 py-2 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 bg-white">
                    {formLines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-stone-50">
                        <td className="px-3 py-2 text-center font-mono text-stone-400 font-bold">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={line.accountId}
                            onChange={e => handleLineChange(idx, 'accountId', e.target.value)}
                            className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs font-mono"
                            required
                          >
                            <option value="">-- Select Account --</option>
                            {activeAccounts.map(acc => (
                              <option key={acc.accountId} value={acc.accountId}>
                                {acc.accountCode} - {acc.accountName} ({acc.accountType})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            placeholder="Line narration..."
                            value={line.description || ''}
                            onChange={e => handleLineChange(idx, 'description', e.target.value)}
                            className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={line.debit || ''}
                            onChange={e => handleLineChange(idx, 'debit', e.target.value)}
                            className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-right font-mono font-semibold"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={line.credit || ''}
                            onChange={e => handleLineChange(idx, 'credit', e.target.value)}
                            className="w-full px-2 py-1 bg-stone-50 border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-right font-mono font-semibold"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          {formLines.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="text-stone-400 hover:text-rose-600 p-1 cursor-pointer"
                              title="Delete Row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totals & Balance Bar */}
                  <tfoot className="bg-stone-50 font-bold border-t border-stone-200">
                    <tr>
                      <td colSpan={3} className="px-3 py-2.5 text-right uppercase text-[11px] text-stone-600">
                        Total:
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-stone-900">
                        ₹{totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-stone-900">
                        ₹{totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Real-time Balancing Indicator */}
              <div className="flex items-center justify-between p-3 rounded-xl border text-xs">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-stone-500" />
                  <span className="font-semibold text-stone-700">Ledger Balance Status:</span>
                  {isBalanced ? (
                    <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      <Check className="w-3 h-3" /> BALANCED (Debit = Credit)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                      <AlertCircle className="w-3 h-3" /> UNBALANCED (Difference: ₹{difference})
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-stone-400">
                  Minimum 2 lines required
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                disabled={submitting}
                className="px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleCreateSubmit(false)}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg cursor-pointer disabled:opacity-50"
              >
                Save as Draft
              </button>
              <button
                type="button"
                onClick={() => handleCreateSubmit(true)}
                disabled={submitting || !isBalanced}
                className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                Save & Post to Ledger
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW JOURNAL DETAIL MODAL */}
      {viewingJournalId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            {modalLoading ? (
              <div className="p-12 text-center">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
                <p className="text-xs text-stone-500">Loading journal details...</p>
              </div>
            ) : viewingJournal ? (
              <>
                <div className="flex items-start justify-between border-b border-stone-200 pb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold text-stone-900 font-mono">
                        {viewingJournal.journalNumber || viewingJournal.journalId}
                      </h3>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${STATUS_BADGES[viewingJournal.status].bg} ${STATUS_BADGES[viewingJournal.status].text} ${STATUS_BADGES[viewingJournal.status].border}`}>
                        {viewingJournal.status}
                      </span>
                      {viewingJournal.status === 'POSTED' && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-stone-100 text-stone-700 border border-stone-300 tracking-wider">
                          READ ONLY
                        </span>
                      )}
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${VOUCHER_TYPE_COLORS[viewingJournal.voucherType]?.bg} ${VOUCHER_TYPE_COLORS[viewingJournal.voucherType]?.text} ${VOUCHER_TYPE_COLORS[viewingJournal.voucherType]?.border}`}>
                        {viewingJournal.voucherType}
                      </span>
                    </div>
                    <p className="text-xs text-stone-600 font-medium">
                      {viewingJournal.narration}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewingJournalId(null)}
                    className="text-stone-400 hover:text-stone-600 p-1 rounded-lg"
                  >
                    ✕
                  </button>
                </div>

                {modalError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{modalError}</span>
                  </div>
                )}

                {/* Audit & Reference Metadata Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-stone-50 p-4 rounded-xl border border-stone-200 text-xs">
                  <div>
                    <span className="text-[11px] text-stone-400 block">Date</span>
                    <span className="font-mono font-semibold text-stone-800">{viewingJournal.journalDate}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-stone-400 block">Reference</span>
                    <span className="font-mono text-stone-800">
                      {viewingJournal.referenceId ? `${viewingJournal.referenceType || ''} ${viewingJournal.referenceId}` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-stone-400 block">Created By</span>
                    <span className="font-mono text-stone-800 truncate block">{viewingJournal.createdBy}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-stone-400 block">Posted By</span>
                    <span className="font-mono text-stone-800 truncate block">{viewingJournal.postedBy || '—'}</span>
                  </div>
                  {viewingJournal.reversalOfJournalId && (
                    <div className="sm:col-span-4 p-2 bg-purple-50 border border-purple-200 rounded-lg text-purple-800 text-[11px] flex items-center gap-2">
                      <RotateCcw className="w-3.5 h-3.5 text-purple-600" />
                      <span>This entry is an authoritative reversal of original journal <strong>{viewingJournal.reversalOfJournalId}</strong>.</span>
                    </div>
                  )}
                </div>

                {/* Lines Table */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                    Authoritative Journal Lines
                  </h4>
                  <div className="border border-stone-200 rounded-xl overflow-hidden shadow-xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-stone-100 text-stone-600 font-semibold uppercase text-[11px]">
                        <tr>
                          <th className="px-3 py-2 w-10 text-center">#</th>
                          <th className="px-3 py-2 w-24">Account Code</th>
                          <th className="px-3 py-2">Account Name</th>
                          <th className="px-3 py-2">Description</th>
                          <th className="px-3 py-2 w-28 text-right">Debit (₹)</th>
                          <th className="px-3 py-2 w-28 text-right">Credit (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 bg-white">
                        {viewingLines.map(line => (
                          <tr key={line.lineId} className="hover:bg-stone-50">
                            <td className="px-3 py-2 text-center font-mono text-stone-400 font-bold">
                              {line.lineNumber}
                            </td>
                            <td className="px-3 py-2 font-mono font-bold text-stone-800">
                              {line.accountCodeSnapshot}
                            </td>
                            <td className="px-3 py-2 font-medium text-stone-800">
                              {line.accountNameSnapshot}
                            </td>
                            <td className="px-3 py-2 text-stone-500">
                              {line.description || '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-stone-900">
                              {line.debit > 0 ? `₹${line.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-semibold text-stone-900">
                              {line.credit > 0 ? `₹${line.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-stone-50 font-bold border-t border-stone-200">
                        <tr>
                          <td colSpan={4} className="px-3 py-2.5 text-right uppercase text-[11px] text-stone-600">
                            Total:
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-stone-900">
                            ₹{viewingJournal.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-stone-900">
                            ₹{viewingJournal.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Modal Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-stone-200">
                  <div className="text-[11px] text-stone-400">
                    {viewingJournal.status === 'POSTED' && 'This posted journal is immutable in the general ledger.'}
                    {viewingJournal.status === 'DRAFT' && 'This draft journal has not affected account balances.'}
                    {viewingJournal.status === 'REVERSED' && 'This journal was reversed.'}
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setViewingJournalId(null)}
                      className="px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded-lg cursor-pointer"
                    >
                      Close
                    </button>
                    {viewingJournal.status === 'DRAFT' && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditDraftModal(viewingJournal)}
                          disabled={submitting}
                          className="px-4 py-2 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                        >
                          Edit Draft
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePostJournal(viewingJournal.journalId)}
                          disabled={submitting}
                          className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Post Journal Now
                        </button>
                      </>
                    )}
                    {viewingJournal.status === 'POSTED' && (
                      <button
                        type="button"
                        onClick={() => handleReverseJournal(viewingJournal.journalId)}
                        disabled={submitting}
                        className="px-4 py-2 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reverse Journal Entry
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
