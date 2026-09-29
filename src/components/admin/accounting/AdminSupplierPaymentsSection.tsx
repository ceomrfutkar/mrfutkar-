/**
 * MR FUTKAR — Admin Supplier Payments Section (Phase 6 Part 4D: Payment Out Foundation)
 * Controlled Payment Out workflow reusing canonical SupplierPaymentService and JournalEngine.
 * Strictly integer paise accounting with server-authoritative double-entry foundation.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  Search,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Calendar,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Building2,
  Wallet,
  Clock,
  ArrowUpRight,
  ShieldAlert,
  RotateCcw,
  FileText,
  Info,
} from 'lucide-react';
import { AdminClient } from '../../../services/adminClient';
import {
  SupplierPayment,
  SupplierPaymentPaymentMethod,
  SupplierPaymentStatus,
  SupplierPaymentHistoryItem,
  ALLOWED_SUPPLIER_PAYMENT_METHODS,
  EligiblePurchaseInvoiceForAllocation,
} from '../../../types/supplierPayment';

function formatPaise(paise: number | undefined): string {
  if (paise === undefined || isNaN(paise)) return '₹0.00';
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const AdminSupplierPaymentsSection: React.FC = () => {
  const [payments, setPayments] = useState<SupplierPaymentHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Detail Modal
  const [selectedPayment, setSelectedPayment] = useState<SupplierPaymentHistoryItem | null>(null);

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [createSupplierId, setCreateSupplierId] = useState<string>('');
  const [createAmountRupees, setCreateAmountRupees] = useState<string>('');
  const [createPaymentMethod, setCreatePaymentMethod] = useState<SupplierPaymentPaymentMethod>('BANK_TRANSFER');
  const [createCashBankAccountCode, setCreateCashBankAccountCode] = useState<string>('1200');
  const [createPaymentDate, setCreatePaymentDate] = useState<string>('');
  const [createReferenceNumber, setCreateReferenceNumber] = useState<string>('');
  const [createNotes, setCreateNotes] = useState<string>('');
  const [createSubmitting, setCreateSubmitting] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Post Actions
  const [postSubmitting, setPostSubmitting] = useState<boolean>(false);
  const [postError, setPostError] = useState<string | null>(null);

  // Reversal Actions
  const [reversePayment, setReversePayment] = useState<SupplierPaymentHistoryItem | null>(null);
  const [reverseReason, setReverseReason] = useState<string>('');
  const [reverseSubmitting, setReverseSubmitting] = useState<boolean>(false);
  const [reverseError, setReverseError] = useState<string | null>(null);

  // Allocation Modal State
  const [allocatingPayment, setAllocatingPayment] = useState<SupplierPaymentHistoryItem | null>(null);
  const [eligibleInvoices, setEligibleInvoices] = useState<EligiblePurchaseInvoiceForAllocation[]>([]);
  const [eligibleLoading, setEligibleLoading] = useState<boolean>(false);
  const [eligibleError, setEligibleError] = useState<string | null>(null);
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});
  const [allocateSubmitting, setAllocateSubmitting] = useState<boolean>(false);
  const [allocateError, setAllocateError] = useState<string | null>(null);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(null);

    const filters: any = {
      page,
      pageSize,
    };
    if (search.trim()) filters.search = search.trim();
    if (paymentMethodFilter !== 'ALL') filters.paymentMethod = paymentMethodFilter;
    if (statusFilter !== 'ALL') filters.status = statusFilter;
    if (fromDate) filters.fromDate = fromDate;
    if (toDate) filters.toDate = toDate;

    const res = await AdminClient.fetchSupplierPaymentHistory(filters);
    if (res.success && res.data) {
      setPayments(res.data.payments);
      setTotalPages(res.data.totalPages);
      setTotalCount(res.data.totalCount);
    } else {
      setError(res.message || res.error || 'Failed to load supplier payments.');
    }
    setLoading(false);
  }, [page, pageSize, search, paymentMethodFilter, statusFilter, fromDate, toDate]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!createSupplierId.trim()) {
      setCreateError('Supplier ID is required.');
      return;
    }

    const amtRupees = parseFloat(createAmountRupees);
    if (isNaN(amtRupees) || amtRupees <= 0) {
      setCreateError('Amount must be a positive number greater than ₹0.');
      return;
    }

    // Convert rupees to exact integer paise
    const amountPaise = Math.round(amtRupees * 100);

    setCreateSubmitting(true);

    const idempotencyKey = `sp_idemp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const res = await AdminClient.createSupplierPayment({
      supplierId: createSupplierId.trim(),
      amountPaise,
      paymentMethod: createPaymentMethod,
      cashBankAccountCode: createCashBankAccountCode.trim() || undefined,
      paymentDate: createPaymentDate || undefined,
      referenceNumber: createReferenceNumber.trim() || undefined,
      notes: createNotes.trim() || undefined,
      idempotencyKey,
    });

    setCreateSubmitting(false);

    if (res.success && res.payment) {
      setSuccessMessage(
        res.isIdempotentReplay
          ? `Supplier Payment ${res.payment.paymentNumber} already existed (idempotent replay).`
          : `Supplier Payment ${res.payment.paymentNumber} created successfully in DRAFT.`
      );
      setShowCreateModal(false);
      setCreateAmountRupees('');
      setCreateReferenceNumber('');
      setCreateNotes('');
      fetchPayments();
    } else {
      setCreateError(res.message || res.error || 'Failed to create supplier payment.');
    }
  };

  const handlePostPayment = async (paymentId: string) => {
    setPostSubmitting(true);
    setPostError(null);

    const idempotencyKey = `sp_post_${paymentId}_${Date.now()}`;
    const res = await AdminClient.postSupplierPayment(paymentId, { idempotencyKey });
    setPostSubmitting(false);

    if (res.success && res.payment) {
      setSuccessMessage(`Supplier Payment ${res.payment.paymentNumber} posted to General Ledger (Account 2100 Debit / Cash-Bank Credit).`);
      fetchPayments();
      if (selectedPayment?.paymentId === paymentId) {
        setSelectedPayment(res.payment as any);
      }
    } else {
      setPostError(res.message || res.error || 'Failed to post supplier payment.');
    }
  };

  const openAllocateModal = async (payment: SupplierPaymentHistoryItem) => {
    setAllocatingPayment(payment);
    setEligibleInvoices([]);
    setAllocationAmounts({});
    setAllocateError(null);
    setEligibleError(null);
    setEligibleLoading(true);

    const res = await AdminClient.getEligibleInvoicesForSupplierPayment(payment.paymentId);
    setEligibleLoading(false);

    if (res.success && res.invoices) {
      setEligibleInvoices(res.invoices);
    } else {
      setEligibleError(res.message || res.error || 'Failed to fetch eligible purchase invoices for allocation.');
    }
  };

  const handleAllocateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocatingPayment) return;
    setAllocateError(null);

    const allocations = Object.entries(allocationAmounts)
      .map(([invId, amtStr]) => {
        const num = parseFloat(amtStr);
        if (isNaN(num) || num <= 0) return null;
        return {
          invoiceId: invId,
          amountPaise: Math.round(num * 100),
        };
      })
      .filter((a): a is { invoiceId: string; amountPaise: number } => a !== null);

    if (allocations.length === 0) {
      setAllocateError('Please enter at least one positive allocation amount.');
      return;
    }

    const totalAllocPaise = allocations.reduce((sum, a) => sum + a.amountPaise, 0);
    const unallocPaise = allocatingPayment.unallocatedAmountPaise || 0;
    if (totalAllocPaise > unallocPaise) {
      setAllocateError(`Total allocated (${formatPaise(totalAllocPaise)}) cannot exceed unallocated amount (${formatPaise(unallocPaise)}).`);
      return;
    }

    setAllocateSubmitting(true);
    const idempotencyKey = `sp_alloc_${allocatingPayment.paymentId}_${Date.now()}`;
    const res = await AdminClient.allocateSupplierPayment(allocatingPayment.paymentId, {
      allocations,
      idempotencyKey,
    });
    setAllocateSubmitting(false);

    if (res.success && res.payment) {
      setSuccessMessage(`Supplier Payment ${res.payment.paymentNumber} allocated successfully.`);
      setAllocatingPayment(null);
      fetchPayments();
      if (selectedPayment?.paymentId === allocatingPayment.paymentId) {
        setSelectedPayment(res.payment as any);
      }
    } else {
      setAllocateError(res.message || res.error || 'Failed to allocate payment.');
    }
  };

  const handleReverseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversePayment) return;
    setReverseError(null);

    if (!reverseReason.trim()) {
      setReverseError('Reversal reason is required.');
      return;
    }

    setReverseSubmitting(true);
    const idempotencyKey = `sp_rev_${reversePayment.paymentId}_${Date.now()}`;
    const res = await AdminClient.reverseSupplierPayment(reversePayment.paymentId, {
      reason: reverseReason.trim(),
      idempotencyKey,
    });
    setReverseSubmitting(false);

    if (res.success && res.payment) {
      setSuccessMessage(`Supplier Payment ${res.payment.paymentNumber} reversed successfully.`);
      setReversePayment(null);
      setReverseReason('');
      fetchPayments();
      if (selectedPayment?.paymentId === reversePayment.paymentId) {
        setSelectedPayment(res.payment as any);
      }
    } else {
      setReverseError(res.message || res.error || 'Failed to reverse supplier payment.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
            <ArrowUpRight className="w-5 h-5 text-indigo-600" />
            Payment Out (Supplier Payments)
          </h2>
          <p className="text-xs text-stone-500">
            Company disbursements to FMCG vendors • Accounts Payable (A/C 2100) Dr • Cash (1100) / Bank (1200) Cr
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => fetchPayments()}
            disabled={loading}
            className="p-2 border border-stone-300 rounded-lg hover:bg-stone-50 text-stone-600 disabled:opacity-50 transition cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setShowCreateModal(true);
            }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            New Supplier Payment
          </button>
        </div>
      </div>

      {/* Distinction Notice Banner */}
      <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-xs flex items-start gap-2.5">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold">Payment Out Policy:</span>
          <p className="text-blue-700 leading-relaxed">
            This console processes server-authoritative <strong>Supplier Payments</strong> to FMCG distributors against Accounts Payable (2100).
            Other operational disbursements (Rent 6200, Staff Salaries 6100, Utilities 6600, etc.) are recorded via formal Journal Vouchers; standalone generic expense payment-out is not currently active in this phase.
          </p>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button type="button" onClick={() => setSuccessMessage(null)} className="text-emerald-700 font-bold">
            ✕
          </button>
        </div>
      )}

      {(error || postError) && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error || postError}</span>
          </div>
          <button type="button" onClick={() => { setError(null); setPostError(null); }} className="text-rose-700 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Search */}
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-stone-400" />
            <input
              type="text"
              placeholder="Search voucher #, reference, supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Payment Method Filter */}
          <div>
            <select
              value={paymentMethodFilter}
              onChange={(e) => {
                setPaymentMethodFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Methods</option>
              {ALLOWED_SUPPLIER_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="POSTED">Posted</option>
              <option value="REVERSED">Reversed</option>
            </select>
          </div>

          {/* Date Filters */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
              title="From Date"
            />
            <span className="text-stone-400 text-xs">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
              title="To Date"
            />
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 uppercase font-semibold">
              <tr>
                <th className="py-3 px-4">Voucher / ID</th>
                <th className="py-3 px-4">Supplier / Vendor</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Method & Account</th>
                <th className="py-3 px-4 text-right">Amount (₹)</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Allocation</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-mono text-stone-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-stone-400 font-sans">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                      <span>Loading supplier payments...</span>
                    </div>
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-stone-400 font-sans">
                    No supplier payments found.
                  </td>
                </tr>
              ) : (
                payments.map((p) => {
                  const isDraft = p.status === 'DRAFT';
                  const isPosted = p.status === 'POSTED';
                  const isReversed = p.status === 'REVERSED';
                  const hasUnallocated = (p.unallocatedAmountPaise || 0) > 0;

                  return (
                    <tr key={p.paymentId} className="hover:bg-stone-50 transition-colors">
                      <td className="py-3 px-4 font-sans">
                        <div className="font-bold text-stone-900">{p.paymentNumber}</div>
                        <div className="text-[10px] text-stone-400 font-mono">{p.paymentId}</div>
                      </td>
                      <td className="py-3 px-4 font-sans">
                        <div className="font-semibold text-stone-900">{p.supplierSnapshot?.businessName || p.supplierId}</div>
                        <div className="text-[10px] text-stone-500 font-mono">
                          {p.supplierSnapshot?.contactName || 'Vendor'} • {p.supplierId}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-stone-600">
                        {p.paymentDate}
                      </td>
                      <td className="py-3 px-4 font-sans">
                        <div className="font-medium text-stone-800">{p.paymentMethod.replace('_', ' ')}</div>
                        <div className="text-[10px] text-stone-500 font-mono">
                          A/C {p.cashBankAccountCode} {p.cashBankAccountCode === '1100' ? '(Cash)' : '(Bank)'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-indigo-700">
                        {formatPaise(p.amountPaise)}
                      </td>
                      <td className="py-3 px-4 text-center font-sans">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-full ${
                            isPosted
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : isDraft
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-sans">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded ${
                            p.allocationStatus === 'FULLY_ALLOCATED'
                              ? 'bg-blue-50 text-blue-700'
                              : p.allocationStatus === 'PARTIALLY_ALLOCATED'
                              ? 'bg-purple-50 text-purple-700'
                              : 'bg-stone-100 text-stone-600'
                          }`}
                        >
                          {p.allocationStatus || 'UNALLOCATED'}
                        </span>
                        {p.unallocatedAmountPaise !== undefined && p.unallocatedAmountPaise > 0 && isPosted && (
                          <div className="text-[9px] text-stone-400 font-mono mt-0.5">
                            Unallocated: {formatPaise(p.unallocatedAmountPaise)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center font-sans">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedPayment(p)}
                            className="p-1 text-stone-500 hover:text-stone-800 rounded hover:bg-stone-100 cursor-pointer"
                            title="View Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {isDraft && (
                            <button
                              type="button"
                              onClick={() => handlePostPayment(p.paymentId)}
                              disabled={postSubmitting}
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-semibold cursor-pointer disabled:opacity-50"
                              title="Post to Accounting"
                            >
                              Post
                            </button>
                          )}

                          {isPosted && hasUnallocated && (
                            <button
                              type="button"
                              onClick={() => openAllocateModal(p)}
                              className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-[10px] font-semibold cursor-pointer"
                              title="Allocate to Purchase Invoices"
                            >
                              Allocate
                            </button>
                          )}

                          {isPosted && (
                            <button
                              type="button"
                              onClick={() => {
                                setReversePayment(p);
                                setReverseReason('');
                                setReverseError(null);
                              }}
                              className="p-1 text-stone-400 hover:text-rose-600 rounded hover:bg-rose-50 cursor-pointer"
                              title="Reverse Payment"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
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

        {/* Pagination Bar */}
        <div className="p-3 border-t border-stone-200 flex items-center justify-between text-xs text-stone-500 font-sans">
          <div>
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} payments
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 border border-stone-300 rounded disabled:opacity-50 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono text-stone-800">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1 border border-stone-300 rounded disabled:opacity-50 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-stone-900">Record Supplier Payment (Out)</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-stone-400 hover:text-stone-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-stone-600 font-semibold mb-1">Supplier ID *</label>
                <input
                  type="text"
                  placeholder="e.g. SUP-PARLE-01 or SUP-BRITANNIA-01"
                  value={createSupplierId}
                  onChange={(e) => setCreateSupplierId(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-600 font-semibold mb-1">Amount (₹ INR) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="e.g. 5000"
                    value={createAmountRupees}
                    onChange={(e) => setCreateAmountRupees(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-stone-600 font-semibold mb-1">Payment Method *</label>
                  <select
                    value={createPaymentMethod}
                    onChange={(e) => {
                      const m = e.target.value as SupplierPaymentPaymentMethod;
                      setCreatePaymentMethod(m);
                      if (m === 'CASH') {
                        setCreateCashBankAccountCode('1100');
                      } else {
                        setCreateCashBankAccountCode('1200');
                      }
                    }}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {ALLOWED_SUPPLIER_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-600 font-semibold mb-1">Cash / Bank Account</label>
                  <input
                    type="text"
                    value={createCashBankAccountCode}
                    onChange={(e) => setCreateCashBankAccountCode(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-100 border border-stone-200 rounded-lg focus:outline-none font-mono"
                    placeholder="1100 or 1200"
                  />
                  <span className="text-[10px] text-stone-400">1100 = Cash in Hand, 1200 = Operational Bank</span>
                </div>

                <div>
                  <label className="block text-stone-600 font-semibold mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={createPaymentDate}
                    onChange={(e) => setCreatePaymentDate(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="text-[10px] text-stone-400">Defaults to today</span>
                </div>
              </div>

              <div>
                <label className="block text-stone-600 font-semibold mb-1">Reference / UTR / Cheque #</label>
                <input
                  type="text"
                  placeholder="e.g. UTR-HDFC-98765432"
                  value={createReferenceNumber}
                  onChange={(e) => setCreateReferenceNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-stone-600 font-semibold mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Bulk biscuits procurement payment via RTGS"
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-stone-300 rounded-lg text-stone-600 hover:bg-stone-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {createSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Draft Payment'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-stone-900">{selectedPayment.paymentNumber}</h3>
                <span className="text-[10px] text-stone-400 font-mono">{selectedPayment.paymentId}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPayment(null)}
                className="text-stone-400 hover:text-stone-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs font-sans">
              <div className="grid grid-cols-2 gap-4 p-3 bg-stone-50 rounded-xl">
                <div>
                  <span className="text-stone-500 font-medium">Supplier / Vendor:</span>
                  <div className="font-bold text-stone-900">{selectedPayment.supplierSnapshot?.businessName || selectedPayment.supplierId}</div>
                  <div className="text-[11px] text-stone-600 font-mono">{selectedPayment.supplierId}</div>
                </div>
                <div>
                  <span className="text-stone-500 font-medium">Payment Amount:</span>
                  <div className="font-extrabold text-indigo-700 text-sm font-mono">
                    {formatPaise(selectedPayment.amountPaise)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <span className="text-stone-500">Payment Date:</span>
                  <div className="font-mono font-medium">{selectedPayment.paymentDate}</div>
                </div>
                <div>
                  <span className="text-stone-500">Method:</span>
                  <div className="font-medium">{selectedPayment.paymentMethod.replace('_', ' ')}</div>
                </div>
                <div>
                  <span className="text-stone-500">Cash/Bank A/C:</span>
                  <div className="font-mono font-medium">A/C {selectedPayment.cashBankAccountCode}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <span className="text-stone-500">Accounting Status:</span>
                  <div>
                    <span className="font-bold px-2 py-0.5 rounded text-[10px] bg-stone-100 text-stone-800">
                      {selectedPayment.status}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-stone-500">Allocation:</span>
                  <div>
                    <span className="font-medium text-[10px] text-indigo-700">
                      {selectedPayment.allocationStatus || 'UNALLOCATED'}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-stone-500">Journal ID:</span>
                  <div className="font-mono text-[10px] truncate">
                    {selectedPayment.journalId || '—'}
                  </div>
                </div>
              </div>

              {selectedPayment.referenceNumber && (
                <div>
                  <span className="text-stone-500">Reference Number:</span>
                  <div className="font-mono font-medium">{selectedPayment.referenceNumber}</div>
                </div>
              )}

              {selectedPayment.notes && (
                <div>
                  <span className="text-stone-500">Notes:</span>
                  <div className="text-stone-700 bg-stone-50 p-2 rounded">{selectedPayment.notes}</div>
                </div>
              )}

              {/* Allocations Breakdown */}
              {Array.isArray(selectedPayment.allocations) && selectedPayment.allocations.length > 0 && (
                <div className="pt-2 border-t border-stone-100">
                  <span className="font-bold text-stone-800 block mb-1">Invoice Allocations</span>
                  <div className="space-y-1">
                    {selectedPayment.allocations.map((a, idx) => (
                      <div key={idx} className="flex justify-between p-2 bg-stone-50 rounded text-[11px] font-mono">
                        <span>Invoice: {a.invoiceNumber || a.invoiceId}</span>
                        <span className="font-bold">{formatPaise(a.allocatedAmountPaise)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setSelectedPayment(null)}
                className="px-4 py-2 border border-stone-300 rounded-lg text-stone-600 hover:bg-stone-50 cursor-pointer text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ALLOCATE MODAL */}
      {allocatingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-stone-900">Allocate Supplier Payment</h3>
                <span className="text-xs text-stone-500">
                  Available unallocated: <strong className="text-indigo-700 font-mono">{formatPaise(allocatingPayment.unallocatedAmountPaise)}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAllocatingPayment(null)}
                className="text-stone-400 hover:text-stone-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {allocateError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{allocateError}</span>
              </div>
            )}

            <form onSubmit={handleAllocateSubmit} className="space-y-4 text-xs font-sans">
              {eligibleLoading ? (
                <div className="py-8 text-center text-stone-400 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                  <span>Loading eligible purchase invoices...</span>
                </div>
              ) : eligibleInvoices.length === 0 ? (
                <div className="py-8 text-center text-stone-400">
                  No eligible outstanding purchase invoices found for this supplier.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {eligibleInvoices.map((inv) => (
                    <div key={inv.invoiceId} className="p-2.5 bg-stone-50 rounded-lg border border-stone-200 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-stone-900">{inv.invoiceNumber}</span>
                        <span className="font-mono text-stone-500">{inv.invoiceDate}</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] text-stone-600">
                        <span>Total: {formatPaise(inv.grandTotalPaise)}</span>
                        <span>Outstanding: <strong className="text-indigo-700 font-mono">{formatPaise(inv.outstandingAmountPaise)}</strong></span>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-stone-500">Allocate (₹):</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={inv.outstandingAmountPaise / 100}
                          value={allocationAmounts[inv.invoiceId] || ''}
                          onChange={(e) => setAllocationAmounts({ ...allocationAmounts, [inv.invoiceId]: e.target.value })}
                          className="flex-1 px-2 py-1 bg-white border border-stone-300 rounded font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setAllocatingPayment(null)}
                  className="px-4 py-2 border border-stone-300 rounded-lg text-stone-600 hover:bg-stone-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={allocateSubmitting || eligibleInvoices.length === 0}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {allocateSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Allocating...
                    </>
                  ) : (
                    'Confirm Allocation'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REVERSAL MODAL */}
      {reversePayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-rose-600" />
                <h3 className="text-base font-bold text-stone-900">Reverse Supplier Payment</h3>
              </div>
              <button
                type="button"
                onClick={() => setReversePayment(null)}
                className="text-stone-400 hover:text-stone-600 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-stone-600">
              This will create a server-authoritative reversing journal entry (Cr 2100 Accounts Payable / Dr Cash-Bank), restoring supplier liability without altering history.
            </p>

            {reverseError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{reverseError}</span>
              </div>
            )}

            <form onSubmit={handleReverseSubmit} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-stone-600 font-semibold mb-1">Reason for Reversal *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g. Duplicate wire transfer reversed by bank"
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setReversePayment(null)}
                  className="px-4 py-2 border border-stone-300 rounded-lg text-stone-600 hover:bg-stone-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reverseSubmitting}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {reverseSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Reversing...
                    </>
                  ) : (
                    'Confirm Reversal'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
