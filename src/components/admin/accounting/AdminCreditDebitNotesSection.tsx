/**
 * MR FUTKAR — Credit & Debit Notes Section
 * Phase 5.6: Controlled Double-Entry Accounting Corrections & Reversals
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  Plus,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Eye,
  Download,
  Printer,
  ShieldCheck,
  ChevronRight,
  BookOpen,
  DollarSign,
  Layers,
  ChevronDown,
} from 'lucide-react';
import {
  CreditDebitNote,
  CreditDebitNoteType,
  CreditDebitNoteStatus,
  CreditDebitNoteItemInput,
} from '../../../types/creditDebitNote';
import { InvoiceDocumentModel } from '../../../types/invoiceDocument';
import { AdminClient } from '../../../services/adminClient';
import { InvoiceClient } from '../../../services/invoiceClient';
import { SalesInvoice, PurchaseInvoice } from '../../../types/invoice';
import { InvoiceDocumentModal } from './InvoiceDocumentModal';

type TabType = 'ALL' | 'SALES_CREDIT_NOTE' | 'SALES_DEBIT_NOTE' | 'PURCHASE_CREDIT_NOTE' | 'PURCHASE_DEBIT_NOTE';

export const AdminCreditDebitNotesSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('ALL');
  const [notes, setNotes] = useState<CreditDebitNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'POSTED'>('ALL');

  // Document presentation modal
  const [selectedDoc, setSelectedDoc] = useState<InvoiceDocumentModel | null>(null);
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [docLoading, setDocLoading] = useState(false);

  // Post action state
  const [postingNoteId, setPostingNoteId] = useState<string | null>(null);

  // 7-Step Create Wizard States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [wizardNoteType, setWizardNoteType] = useState<CreditDebitNoteType>('SALES_CREDIT_NOTE');
  const [availableInvoices, setAvailableInvoices] = useState<Array<SalesInvoice | PurchaseInvoice>>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | PurchaseInvoice | null>(null);
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');

  // Items selection state: map of productId -> selected quantity
  const [itemSelections, setItemSelections] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [wizardSubmitting, setWizardSubmitting] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);

  // Fetch Notes
  const loadNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await AdminClient.fetchCreditDebitNotes({
        noteType: activeTab === 'ALL' ? undefined : activeTab,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        search: searchQuery.trim() || undefined,
      });

      if (res.success && res.notes) {
        setNotes(res.notes);
      } else {
        setError(res.message || 'Failed to load notes');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, [activeTab, statusFilter, searchQuery]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Load Invoices for Step 2
  const loadInvoicesForWizard = useCallback(async (type: CreditDebitNoteType) => {
    setLoadingInvoices(true);
    setWizardError(null);
    try {
      if (type === 'SALES_CREDIT_NOTE' || type === 'SALES_DEBIT_NOTE') {
        const res = await InvoiceClient.getSalesInvoices({
          status: 'ISSUED',
          pageSize: 50,
        });
        if (res && res.invoices) {
          // Only show invoices with accountingStatus POSTED
          setAvailableInvoices(res.invoices.filter((i: SalesInvoice) => i.accountingStatus === 'POSTED'));
        }
      } else {
        const res = await InvoiceClient.getPurchaseInvoices({
          status: 'POSTED',
          pageSize: 50,
        });
        if (res && res.invoices) {
          setAvailableInvoices(res.invoices.filter((i: PurchaseInvoice) => i.accountingStatus === 'POSTED'));
        }
      }
    } catch (err: any) {
      setWizardError('Failed to load eligible source invoices.');
    } finally {
      setLoadingInvoices(false);
    }
  }, []);

  const openCreateModal = () => {
    setCurrentStep(1);
    setWizardNoteType('SALES_CREDIT_NOTE');
    setSelectedInvoice(null);
    setItemSelections({});
    setReason('');
    setWizardError(null);
    setIsCreateModalOpen(true);
  };

  const handleStep1SelectType = (type: CreditDebitNoteType) => {
    setWizardNoteType(type);
    setSelectedInvoice(null);
    setItemSelections({});
    loadInvoicesForWizard(type);
    setCurrentStep(2);
  };

  const handleStep2SelectInvoice = (inv: SalesInvoice | PurchaseInvoice) => {
    setSelectedInvoice(inv);
    // Initialize item selections with full eligible quantity by default
    const initial: Record<string, number> = {};
    for (const it of inv.items) {
      initial[it.productId] = it.quantity;
    }
    setItemSelections(initial);
    setCurrentStep(3);
  };

  // Preview calculations based on itemSelections
  const previewData = useMemo(() => {
    if (!selectedInvoice) return null;

    let subtotal = 0;
    let discountTotal = 0;
    let taxableTotal = 0;
    let taxTotal = 0;
    let grandTotal = 0;
    const selectedLineItems: CreditDebitNoteItemInput[] = [];

    for (const it of selectedInvoice.items) {
      const qty = itemSelections[it.productId] || 0;
      if (qty <= 0) continue;

      const unitPrice = (it as any).unitPrice !== undefined ? (it as any).unitPrice : (it as any).unitCost;
      const discount = it.discountAmount ? Number(((it.discountAmount / it.quantity) * qty).toFixed(2)) : 0;
      const gross = Math.round(unitPrice * qty * 100) / 100;
      const lineTaxable = gross - discount;
      const taxRate = it.taxRate || 0;
      const lineTax = Math.round((lineTaxable * (taxRate / 100)) * 100) / 100;
      const lineTot = lineTaxable + lineTax;

      subtotal += gross;
      discountTotal += discount;
      taxableTotal += lineTaxable;
      taxTotal += lineTax;
      grandTotal += lineTot;

      selectedLineItems.push({
        productId: it.productId,
        quantity: qty,
        unitPrice,
        discountAmount: discount,
        taxRate,
      });
    }

    return {
      subtotal: Number(subtotal.toFixed(2)),
      discountTotal: Number(discountTotal.toFixed(2)),
      taxableTotal: Number(taxableTotal.toFixed(2)),
      taxTotal: Number(taxTotal.toFixed(2)),
      grandTotal: Number(grandTotal.toFixed(2)),
      lineItems: selectedLineItems,
    };
  }, [selectedInvoice, itemSelections]);

  const handleCreateDraft = async (postImmediately: boolean = false) => {
    if (!selectedInvoice || !previewData || previewData.lineItems.length === 0) {
      setWizardError('Please select at least one item with quantity > 0.');
      return;
    }
    if (!reason.trim() || reason.trim().length < 3) {
      setWizardError('Please enter a valid reason (minimum 3 characters).');
      return;
    }

    setWizardSubmitting(true);
    setWizardError(null);

    try {
      const createRes = await AdminClient.createCreditDebitNote({
        noteType: wizardNoteType,
        originalInvoiceId: selectedInvoice.invoiceId,
        reason: reason.trim(),
        items: previewData.lineItems,
      });

      if (!createRes.success || !createRes.note) {
        setWizardError(createRes.message || 'Failed to create note');
        setWizardSubmitting(false);
        return;
      }

      const createdNote = createRes.note;

      if (postImmediately) {
        const postRes = await AdminClient.postCreditDebitNote(createdNote.noteId);
        if (!postRes.success) {
          setSuccessMessage(`Note ${createdNote.noteNumber} created as DRAFT, but auto-post failed: ${postRes.message}`);
        } else {
          setSuccessMessage(`Note ${createdNote.noteNumber} created and POSTED to General Ledger (Voucher: ${postRes.note?.accountingVoucherNumber}).`);
        }
      } else {
        setSuccessMessage(`Note ${createdNote.noteNumber} created successfully in DRAFT status.`);
      }

      setIsCreateModalOpen(false);
      loadNotes();
    } catch (err: any) {
      setWizardError(err.message || 'Network error');
    } finally {
      setWizardSubmitting(false);
    }
  };

  const handlePostNote = async (noteId: string) => {
    setPostingNoteId(noteId);
    setError(null);
    try {
      const res = await AdminClient.postCreditDebitNote(noteId);
      if (res.success && res.note) {
        setSuccessMessage(`Note ${res.note.noteNumber} successfully POSTED to Accounting Journal (Voucher: ${res.note.accountingVoucherNumber}).`);
        loadNotes();
      } else {
        setError(res.message || 'Failed to post note');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setPostingNoteId(null);
    }
  };

  const handleViewDocument = async (noteId: string) => {
    setDocLoading(true);
    try {
      const res = await AdminClient.fetchCreditDebitNoteDocument(noteId);
      if (res.success && res.document) {
        setSelectedDoc(res.document);
        setIsDocModalOpen(true);
      } else {
        setError(res.message || 'Failed to load document');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setDocLoading(false);
    }
  };

  const filteredInvoices = useMemo(() => {
    if (!invoiceSearchQuery.trim()) return availableInvoices;
    const q = invoiceSearchQuery.toLowerCase();
    return availableInvoices.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        (inv.billingAddressSnapshot?.businessName &&
          inv.billingAddressSnapshot.businessName.toLowerCase().includes(q))
    );
  }, [availableInvoices, invoiceSearchQuery]);

  const getTypeBadge = (type: CreditDebitNoteType) => {
    switch (type) {
      case 'SALES_CREDIT_NOTE':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">Sales Credit (CN)</span>;
      case 'SALES_DEBIT_NOTE':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Sales Debit (DN)</span>;
      case 'PURCHASE_DEBIT_NOTE':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Purchase Debit (DN)</span>;
      case 'PURCHASE_CREDIT_NOTE':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">Purchase Credit (CN)</span>;
      default:
        return <span>{type}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-stone-200 rounded-xl p-4 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-600" />
            Credit & Debit Notes Architecture
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Strictly controlled accounting adjustments, price corrections, and returns with balanced double-entry GL linkage.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => loadNotes()}
            disabled={loading}
            className="p-2 border border-stone-200 hover:bg-stone-50 text-stone-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Refresh Notes"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={openCreateModal}
            className="flex-1 sm:flex-initial px-4 py-2 bg-stone-900 hover:bg-black text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create Note
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs px-4 py-3 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="font-semibold">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-700 font-bold ml-2">
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-4 py-3 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span className="font-semibold">{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700 font-bold ml-2">
            ✕
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-xs">
        <div className="border-b border-stone-200 px-4 py-2 bg-stone-50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1">
            {[
              { id: 'ALL', label: 'All Notes' },
              { id: 'SALES_CREDIT_NOTE', label: 'Sales Credit Notes (AR ↓)' },
              { id: 'SALES_DEBIT_NOTE', label: 'Sales Debit Notes (AR ↑)' },
              { id: 'PURCHASE_DEBIT_NOTE', label: 'Purchase Debit Notes (AP ↓)' },
              { id: 'PURCHASE_CREDIT_NOTE', label: 'Purchase Credit Notes (AP ↑)' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-white border border-stone-300 rounded-lg px-2.5 py-1 text-xs text-stone-700 font-medium"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">DRAFT</option>
              <option value="POSTED">POSTED</option>
            </select>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-stone-200 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-stone-400" />
            <input
              type="text"
              placeholder="Search by Note #, Original Invoice #, Customer/Supplier name, or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400"
            />
          </div>
        </div>

        {/* Notes Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-100 text-stone-600 font-bold uppercase text-[10px] tracking-wider border-b border-stone-200">
              <tr>
                <th className="py-2.5 px-4">Note Number</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Source Invoice</th>
                <th className="py-2.5 px-3">Party (Customer/Supplier)</th>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Accounting</th>
                <th className="py-2.5 px-3">Voucher #</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-stone-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-stone-400" />
                    Loading credit & debit notes...
                  </td>
                </tr>
              ) : notes.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-stone-400 font-medium">
                    No credit or debit notes found matching the selected filters.
                  </td>
                </tr>
              ) : (
                notes.map((note) => {
                  const partyName =
                    note.customerSnapshot?.businessName ||
                    note.supplierSnapshot?.businessName ||
                    note.customerId ||
                    note.supplierId ||
                    '—';

                  return (
                    <tr key={note.noteId} className="hover:bg-stone-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-stone-900">
                        {note.noteNumber}
                      </td>
                      <td className="py-3 px-3">
                        {getTypeBadge(note.noteType)}
                      </td>
                      <td className="py-3 px-3 font-mono text-stone-700">
                        {note.originalInvoiceNumber}
                      </td>
                      <td className="py-3 px-3 font-medium text-stone-800 max-w-[180px] truncate" title={partyName}>
                        {partyName}
                      </td>
                      <td className="py-3 px-3 text-stone-500 whitespace-nowrap">
                        {note.createdAt ? note.createdAt.substring(0, 10) : '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-stone-950 whitespace-nowrap">
                        ₹{note.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            note.status === 'POSTED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {note.status}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            note.accountingStatus === 'POSTED'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-stone-100 text-stone-600'
                          }`}
                        >
                          {note.accountingStatus}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-stone-700 text-[11px]">
                        {note.accountingVoucherNumber || '—'}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleViewDocument(note.noteId)}
                            className="p-1.5 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                            title="View / Print Document"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {note.status === 'DRAFT' && (
                            <button
                              onClick={() => handlePostNote(note.noteId)}
                              disabled={postingNoteId === note.noteId}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1 shadow-xs"
                            >
                              {postingNoteId === note.noteId ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3 h-3" />
                              )}
                              Post
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 7-STEP CREATE NOTE MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-3xl flex flex-col max-h-[92vh] overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-stone-900 text-base">
                  Create Controlled Financial Note
                </h3>
                <p className="text-xs text-stone-500">
                  Step {currentStep} of 5 • {currentStep === 1 ? 'Select Type' : currentStep === 2 ? 'Select Source Invoice' : currentStep === 3 ? 'Adjust Items & Quantities' : currentStep === 4 ? 'Enter Reason & Review' : 'Preview Accounting & Create'}
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 text-sm font-bold p-1 rounded-md"
              >
                ✕
              </button>
            </div>

            {/* Modal Error */}
            {wizardError && (
              <div className="bg-rose-50 border-b border-rose-200 px-6 py-2.5 text-xs text-rose-800 font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                {wizardError}
              </div>
            )}

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {/* STEP 1: SELECT NOTE TYPE */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <p className="text-xs text-stone-600">
                    Choose the direction and financial impact of this accounting correction:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleStep1SelectType('SALES_CREDIT_NOTE')}
                      className="p-4 border-2 border-stone-200 hover:border-rose-500 hover:bg-rose-50/40 rounded-xl text-left transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm text-stone-900 group-hover:text-rose-700">
                          Sales Credit Note (SCN)
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800">
                          AR Reduction
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 leading-relaxed">
                        Issued to customer. Reduces Accounts Receivable & reverses Sales Revenue + Output GST.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStep1SelectType('SALES_DEBIT_NOTE')}
                      className="p-4 border-2 border-stone-200 hover:border-blue-500 hover:bg-blue-50/40 rounded-xl text-left transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm text-stone-900 group-hover:text-blue-700">
                          Sales Debit Note (SDN)
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-800">
                          AR Increase
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 leading-relaxed">
                        Issued to customer for under-billing. Increases Accounts Receivable & records additional Revenue.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStep1SelectType('PURCHASE_DEBIT_NOTE')}
                      className="p-4 border-2 border-stone-200 hover:border-amber-500 hover:bg-amber-50/40 rounded-xl text-left transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm text-stone-900 group-hover:text-amber-700">
                          Purchase Debit Note (PDN)
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-800">
                          AP Reduction
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 leading-relaxed">
                        Issued to supplier for purchase return or discount. Reduces Accounts Payable & reverses Direct Costs + Input GST.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStep1SelectType('PURCHASE_CREDIT_NOTE')}
                      className="p-4 border-2 border-stone-200 hover:border-purple-500 hover:bg-purple-50/40 rounded-xl text-left transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm text-stone-900 group-hover:text-purple-700">
                          Purchase Credit Note (PCN)
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-purple-100 text-purple-800">
                          AP Increase
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 leading-relaxed">
                        Received from supplier or entered for under-billed purchase. Increases Accounts Payable & Direct Costs.
                      </p>
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: SELECT SOURCE INVOICE */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-stone-800">
                        Select eligible source invoice for {wizardNoteType.replace(/_/g, ' ')}:
                      </span>
                      <p className="text-[11px] text-stone-500">
                        Only invoices with status ISSUED / POSTED and posted double-entry journals can be corrected.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(1)}
                      className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1 cursor-pointer font-medium"
                    >
                      <ArrowLeft className="w-3 h-3" /> Back
                    </button>
                  </div>

                  {/* Search source invoices */}
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-stone-400" />
                    <input
                      type="text"
                      placeholder="Search source invoice by invoice # or partner name..."
                      value={invoiceSearchQuery}
                      onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs"
                    />
                  </div>

                  <div className="border border-stone-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                    {loadingInvoices ? (
                      <div className="p-6 text-center text-xs text-stone-500">
                        <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-stone-400" />
                        Loading eligible invoices...
                      </div>
                    ) : filteredInvoices.length === 0 ? (
                      <div className="p-6 text-center text-xs text-stone-400">
                        No eligible issued/posted invoices found.
                      </div>
                    ) : (
                      <div className="divide-y divide-stone-200">
                        {filteredInvoices.map((inv) => (
                          <div
                            key={inv.invoiceId}
                            onClick={() => handleStep2SelectInvoice(inv)}
                            className="p-3 hover:bg-amber-50/50 cursor-pointer flex items-center justify-between transition-colors text-xs"
                          >
                            <div>
                              <div className="font-mono font-bold text-stone-900 flex items-center gap-2">
                                {inv.invoiceNumber}
                                <span className="text-[10px] px-1.5 py-0.2 bg-emerald-50 text-emerald-700 rounded font-semibold border border-emerald-200">
                                  {inv.invoiceStatus}
                                </span>
                              </div>
                              <div className="text-stone-600 mt-0.5">
                                {inv.billingAddressSnapshot?.businessName || 'Valued Partner'} • Date: {inv.invoiceDate}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono font-bold text-stone-900">
                                ₹{inv.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </div>
                              <span className="text-[11px] text-amber-700 font-bold flex items-center gap-0.5 justify-end">
                                Select <ChevronRight className="w-3 h-3" />
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 3: SELECT ITEMS & QUANTITIES */}
              {currentStep === 3 && selectedInvoice && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-stone-800">
                        Source Invoice: {selectedInvoice.invoiceNumber} (Total: ₹{selectedInvoice.grandTotal})
                      </span>
                      <p className="text-[11px] text-stone-500">
                        Specify the units you want to credit or debit. Quantities cannot exceed eligible invoice balance.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(2)}
                      className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1 cursor-pointer font-medium"
                    >
                      <ArrowLeft className="w-3 h-3" /> Back
                    </button>
                  </div>

                  <div className="border border-stone-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-stone-100 text-stone-600 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="py-2 px-3">Product Name</th>
                          <th className="py-2 px-2 text-right">Unit Price</th>
                          <th className="py-2 px-2 text-center">Orig Qty</th>
                          <th className="py-2 px-3 text-center">Adjust Qty</th>
                          <th className="py-2 px-2 text-center">Tax %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-200">
                        {selectedInvoice.items.map((item) => {
                          const unitPrice =
                            (item as any).unitPrice !== undefined
                              ? (item as any).unitPrice
                              : (item as any).unitCost;
                          const currentQty = itemSelections[item.productId] ?? 0;

                          return (
                            <tr key={item.productId} className="hover:bg-stone-50">
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-stone-900">{item.productNameSnapshot}</div>
                                <div className="text-[10px] text-stone-500 font-mono">{item.skuSnapshot}</div>
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono text-stone-700">
                                ₹{unitPrice.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-2 text-center font-bold text-stone-700">
                                {item.quantity}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  max={item.quantity}
                                  value={currentQty}
                                  onChange={(e) => {
                                    const val = Math.max(
                                      0,
                                      Math.min(item.quantity, parseInt(e.target.value, 10) || 0)
                                    );
                                    setItemSelections((prev) => ({
                                      ...prev,
                                      [item.productId]: val,
                                    }));
                                  }}
                                  className="w-16 px-2 py-1 text-center bg-white border border-stone-300 rounded font-mono font-bold text-xs"
                                />
                              </td>
                              <td className="py-2.5 px-2 text-center text-stone-500">
                                {item.taxRate}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {previewData && (
                    <div className="bg-stone-50 p-3 rounded-xl border border-stone-200 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-stone-500">Taxable Total: </span>
                        <span className="font-mono font-bold text-stone-800">₹{previewData.taxableTotal}</span>
                        <span className="text-stone-400 mx-2">•</span>
                        <span className="text-stone-500">Tax Total: </span>
                        <span className="font-mono font-bold text-stone-800">₹{previewData.taxTotal}</span>
                      </div>
                      <div>
                        <span className="text-stone-500">Total Note Amount: </span>
                        <span className="font-mono font-black text-amber-700 text-sm">
                          ₹{previewData.grandTotal}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!previewData || previewData.lineItems.length === 0) {
                          setWizardError('Please select at least one item with quantity > 0.');
                          return;
                        }
                        setWizardError(null);
                        setCurrentStep(4);
                      }}
                      className="px-4 py-2 bg-stone-900 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-black"
                    >
                      Next: Reason & Notes <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: ENTER REASON */}
              {currentStep === 4 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-stone-800">
                        Reason for {wizardNoteType.replace(/_/g, ' ')}
                      </span>
                      <p className="text-[11px] text-stone-500">
                        This reason is recorded permanently in the financial audit log and invoice snapshot.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(3)}
                      className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1 cursor-pointer font-medium"
                    >
                      <ArrowLeft className="w-3 h-3" /> Back
                    </button>
                  </div>

                  <div>
                    <textarea
                      rows={3}
                      placeholder="e.g., Goods damaged during transit; Agreed post-sale quantity rate discount; Billing rate correction..."
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-400"
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!reason.trim() || reason.trim().length < 3) {
                          setWizardError('Please enter a descriptive reason (minimum 3 characters).');
                          return;
                        }
                        setWizardError(null);
                        setCurrentStep(5);
                      }}
                      className="px-4 py-2 bg-stone-900 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-black"
                    >
                      Next: Accounting Preview <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 5: DOUBLE-ENTRY ACCOUNTING PREVIEW */}
              {currentStep === 5 && previewData && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-stone-800">
                        Double-Entry Accounting Preview (Informational)
                      </span>
                      <p className="text-[11px] text-stone-500">
                        Final journal lines will be server-authoritatively verified against open accounting periods.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(4)}
                      className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1 cursor-pointer font-medium"
                    >
                      <ArrowLeft className="w-3 h-3" /> Back
                    </button>
                  </div>

                  {/* Informational Accounting Table per Section 33 */}
                  <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
                    <div className="text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-2">
                      Projected Journal Voucher Lines:
                    </div>

                    <div className="space-y-1.5 text-xs font-mono">
                      {wizardNoteType === 'SALES_CREDIT_NOTE' && (
                        <>
                          <div className="flex justify-between text-rose-700 bg-rose-50/50 p-2 rounded">
                            <span>DR 4100 — Sales Revenue</span>
                            <span>₹{previewData.taxableTotal.toFixed(2)}</span>
                          </div>
                          {previewData.taxTotal > 0 && (
                            <div className="flex justify-between text-rose-700 bg-rose-50/50 p-2 rounded">
                              <span>DR 2200 — Output GST</span>
                              <span>₹{previewData.taxTotal.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-emerald-700 bg-emerald-50/50 p-2 rounded">
                            <span>CR 1300 — Accounts Receivable</span>
                            <span>₹{previewData.grandTotal.toFixed(2)}</span>
                          </div>
                        </>
                      )}

                      {wizardNoteType === 'SALES_DEBIT_NOTE' && (
                        <>
                          <div className="flex justify-between text-emerald-700 bg-emerald-50/50 p-2 rounded">
                            <span>DR 1300 — Accounts Receivable</span>
                            <span>₹{previewData.grandTotal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-rose-700 bg-rose-50/50 p-2 rounded">
                            <span>CR 4100 — Sales Revenue</span>
                            <span>₹{previewData.taxableTotal.toFixed(2)}</span>
                          </div>
                          {previewData.taxTotal > 0 && (
                            <div className="flex justify-between text-rose-700 bg-rose-50/50 p-2 rounded">
                              <span>CR 2200 — Output GST</span>
                              <span>₹{previewData.taxTotal.toFixed(2)}</span>
                            </div>
                          )}
                        </>
                      )}

                      {wizardNoteType === 'PURCHASE_DEBIT_NOTE' && (
                        <>
                          <div className="flex justify-between text-emerald-700 bg-emerald-50/50 p-2 rounded">
                            <span>DR 2100 — Accounts Payable</span>
                            <span>₹{previewData.grandTotal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-rose-700 bg-rose-50/50 p-2 rounded">
                            <span>CR 5100 — COGS / Direct Costs</span>
                            <span>₹{previewData.taxableTotal.toFixed(2)}</span>
                          </div>
                          {previewData.taxTotal > 0 && (
                            <div className="flex justify-between text-rose-700 bg-rose-50/50 p-2 rounded">
                              <span>CR 2300 — Input GST</span>
                              <span>₹{previewData.taxTotal.toFixed(2)}</span>
                            </div>
                          )}
                        </>
                      )}

                      {wizardNoteType === 'PURCHASE_CREDIT_NOTE' && (
                        <>
                          <div className="flex justify-between text-rose-700 bg-rose-50/50 p-2 rounded">
                            <span>DR 5100 — COGS / Direct Costs</span>
                            <span>₹{previewData.taxableTotal.toFixed(2)}</span>
                          </div>
                          {previewData.taxTotal > 0 && (
                            <div className="flex justify-between text-rose-700 bg-rose-50/50 p-2 rounded">
                              <span>DR 2300 — Input GST</span>
                              <span>₹{previewData.taxTotal.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-emerald-700 bg-emerald-50/50 p-2 rounded">
                            <span>CR 2100 — Accounts Payable</span>
                            <span>₹{previewData.grandTotal.toFixed(2)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
                    <button
                      type="button"
                      disabled={wizardSubmitting}
                      onClick={() => handleCreateDraft(false)}
                      className="px-4 py-2 border border-stone-300 hover:bg-stone-50 text-stone-700 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Save as DRAFT
                    </button>
                    <button
                      type="button"
                      disabled={wizardSubmitting}
                      onClick={() => handleCreateDraft(true)}
                      className="px-5 py-2 bg-stone-900 hover:bg-black text-white rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                    >
                      {wizardSubmitting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Processing...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Create & POST to GL
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invoice Document Modal for View/Print/PDF */}
      <InvoiceDocumentModal
        document={selectedDoc}
        isOpen={isDocModalOpen}
        onClose={() => {
          setIsDocModalOpen(false);
          setSelectedDoc(null);
        }}
        isAdmin={true}
      />
    </div>
  );
};
