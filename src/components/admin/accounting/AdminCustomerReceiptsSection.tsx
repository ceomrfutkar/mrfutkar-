/**
 * MR FUTKAR — Admin Customer Receipts Section (Phase 5.7 Part 2A)
 * Management console for browsing and creating DRAFT Customer Receipts.
 * Strictly integer paise accounting with server-authoritative double-entry foundation.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Receipt,
  Search,
  Filter,
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
  ArrowDownLeft,
} from 'lucide-react';
import { AdminClient } from '../../../services/adminClient';
import {
  CustomerReceipt,
  CustomerReceiptPaymentMethod,
  CustomerReceiptStatus,
  ALLOWED_PAYMENT_METHODS,
  EligibleInvoiceForAllocation,
  AllocateCustomerReceiptPayload,
} from '../../../types/customerReceipt';

export const AdminCustomerReceiptsSection: React.FC = () => {
  const [receipts, setReceipts] = useState<CustomerReceipt[]>([]);
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
  const [selectedReceipt, setSelectedReceipt] = useState<CustomerReceipt | null>(null);

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [createCustomerId, setCreateCustomerId] = useState<string>('');
  const [createAmountRupees, setCreateAmountRupees] = useState<string>('');
  const [createPaymentMethod, setCreatePaymentMethod] = useState<CustomerReceiptPaymentMethod>('UPI');
  const [createCashBankAccountCode, setCreateCashBankAccountCode] = useState<string>('1200');
  const [createReceiptDate, setCreateReceiptDate] = useState<string>('');
  const [createReferenceNumber, setCreateReferenceNumber] = useState<string>('');
  const [createNotes, setCreateNotes] = useState<string>('');
  const [createSubmitting, setCreateSubmitting] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Post Actions
  const [postSubmitting, setPostSubmitting] = useState<boolean>(false);
  const [postError, setPostError] = useState<string | null>(null);

  // Reversal Actions
  const [reverseSubmitting, setReverseSubmitting] = useState<boolean>(false);
  const [reverseError, setReverseError] = useState<string | null>(null);

  // Allocation Modal State (Phase 5.9 Part 1)
  const [allocatingReceipt, setAllocatingReceipt] = useState<CustomerReceipt | null>(null);
  const [eligibleInvoices, setEligibleInvoices] = useState<EligibleInvoiceForAllocation[]>([]);
  const [eligibleLoading, setEligibleLoading] = useState<boolean>(false);
  const [eligibleError, setEligibleError] = useState<string | null>(null);
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});
  const [allocateSubmitting, setAllocateSubmitting] = useState<boolean>(false);
  const [allocateError, setAllocateError] = useState<string | null>(null);

  const isEligibleForAllocation = (r: CustomerReceipt | null | undefined): boolean => {
    if (!r) return false;
    return r.status === 'POSTED' && (r.unallocatedAmountPaise || 0) > 0;
  };

  const openAllocateModal = async (receipt: CustomerReceipt) => {
    setAllocatingReceipt(receipt);
    setEligibleInvoices([]);
    setAllocationAmounts({});
    setAllocateError(null);
    setEligibleError(null);
    setEligibleLoading(true);

    const res = await AdminClient.getEligibleInvoicesForReceipt(receipt.receiptId);
    setEligibleLoading(false);

    if (res.success && res.invoices) {
      setEligibleInvoices(res.invoices);
    } else {
      setEligibleError(res.message || res.error || 'Failed to retrieve eligible sales invoices.');
    }
  };

  // Compute entered amounts in paise
  const computedAllocations = Object.entries(allocationAmounts)
    .map(([invoiceId, strVal]) => {
      const trimmed = strVal.trim();
      const num = parseFloat(trimmed);
      const paise = !isNaN(num) && num > 0 ? Math.round(num * 100) : 0;
      return { invoiceId, amountPaise: paise, amountRupees: num, rawInput: trimmed };
    })
    .filter((a) => a.amountPaise > 0);

  const totalSelectedPaise = computedAllocations.reduce((sum, a) => sum + a.amountPaise, 0);
  const receiptUnallocatedPaise = allocatingReceipt?.unallocatedAmountPaise || 0;
  const remainingAfterAllocationPaise = receiptUnallocatedPaise - totalSelectedPaise;

  const validateAllocationInput = (): string | null => {
    if (!allocatingReceipt) return 'No receipt selected for allocation.';
    if (computedAllocations.length === 0) {
      return 'Please enter an allocation amount for at least one eligible invoice.';
    }

    // Check for negative or non-numeric raw inputs
    for (const [invId, rawVal] of Object.entries(allocationAmounts)) {
      if (!rawVal || !rawVal.trim()) continue;
      const num = Number(rawVal);
      if (isNaN(num) || num <= 0) {
        return `Allocation amount for invoice ${invId} must be a valid positive number greater than ₹0.`;
      }
      // Check decimal precision (max 2 decimal places)
      if (rawVal.includes('.') && rawVal.split('.')[1].length > 2) {
        return `Allocation amount for invoice ${invId} has excessive precision (max 2 decimal places).`;
      }
    }

    if (totalSelectedPaise <= 0) {
      return 'Total allocation amount must be greater than zero.';
    }

    if (totalSelectedPaise > receiptUnallocatedPaise) {
      return `Total allocation (₹${(totalSelectedPaise / 100).toFixed(2)}) exceeds receipt unallocated balance of ₹${(receiptUnallocatedPaise / 100).toFixed(2)}.`;
    }

    for (const item of computedAllocations) {
      const inv = eligibleInvoices.find((i) => i.invoiceId === item.invoiceId);
      if (!inv) {
        return `Selected invoice "${item.invoiceId}" is not in the list of eligible invoices.`;
      }
      if (item.amountPaise > inv.outstandingAmountPaise) {
        return `Allocation for ${inv.invoiceNumber} (₹${(item.amountPaise / 100).toFixed(2)}) exceeds its outstanding balance of ₹${(inv.outstandingAmountPaise / 100).toFixed(2)}.`;
      }
    }

    return null;
  };

  const handleAutoFillFifo = () => {
    if (!allocatingReceipt || eligibleInvoices.length === 0) return;
    let budgetRemainingPaise = allocatingReceipt.unallocatedAmountPaise || 0;
    const newAmounts: Record<string, string> = {};

    for (const inv of eligibleInvoices) {
      if (budgetRemainingPaise <= 0) {
        newAmounts[inv.invoiceId] = '';
        continue;
      }
      const toAllocatePaise = Math.min(budgetRemainingPaise, inv.outstandingAmountPaise);
      if (toAllocatePaise > 0) {
        newAmounts[inv.invoiceId] = (toAllocatePaise / 100).toFixed(2);
        budgetRemainingPaise -= toAllocatePaise;
      } else {
        newAmounts[inv.invoiceId] = '';
      }
    }
    setAllocationAmounts(newAmounts);
    setAllocateError(null);
  };

  const handleSetMaxForInvoice = (invoiceId: string) => {
    if (!allocatingReceipt) return;
    const inv = eligibleInvoices.find((i) => i.invoiceId === invoiceId);
    if (!inv) return;

    // Sum currently entered allocations for other invoices
    const otherAllocatedPaise = Object.entries(allocationAmounts)
      .filter(([id]) => id !== invoiceId)
      .reduce((sum, [, rawVal]) => {
        const num = parseFloat(rawVal);
        return sum + (!isNaN(num) && num > 0 ? Math.round(num * 100) : 0);
      }, 0);

    const availableBudgetPaise = Math.max(0, (allocatingReceipt.unallocatedAmountPaise || 0) - otherAllocatedPaise);
    const allocPaise = Math.min(inv.outstandingAmountPaise, availableBudgetPaise);

    setAllocationAmounts((prev) => ({
      ...prev,
      [invoiceId]: allocPaise > 0 ? (allocPaise / 100).toFixed(2) : '',
    }));
    setAllocateError(null);
  };

  const handleClearAllocationAmounts = () => {
    setAllocationAmounts({});
    setAllocateError(null);
  };

  const mapAllocationError = (msg: string): string => {
    if (msg.includes('SUPER_ADMIN_REQUIRED') || msg.includes('UNAUTHORIZED') || msg.includes('FORBIDDEN')) {
      return 'Unauthorized: Super Admin permissions required to allocate customer receipts.';
    }
    if (msg.includes('INVALID_RECEIPT_STATUS')) {
      return 'Invalid receipt status: Only POSTED customer receipts can be allocated.';
    }
    if (msg.includes('INVALID_INVOICE_STATUS') || msg.includes('INVOICE_NOT_POSTED')) {
      return 'Invalid invoice status: Only ISSUED/POSTED sales invoices can receive allocations.';
    }
    if (msg.includes('CROSS_RETAILER_ALLOCATION_FORBIDDEN')) {
      return 'Cross-customer allocation forbidden: Invoice belongs to a different customer.';
    }
    if (msg.includes('DUPLICATE_INVOICE_IN_ALLOCATION')) {
      return 'Duplicate invoice in allocation request.';
    }
    if (msg.includes('ALLOCATION_EXCEEDS_RECEIPT_AMOUNT')) {
      return 'Total allocation amount exceeds the remaining unallocated balance of this receipt.';
    }
    if (msg.includes('ALLOCATION_EXCEEDS_INVOICE_OUTSTANDING')) {
      return 'Allocation amount exceeds the outstanding balance of the invoice.';
    }
    if (msg.includes('CLIENT_FIELD_INJECTION_FORBIDDEN')) {
      return 'Client cannot inject server-authoritative fields.';
    }
    if (msg.includes('RECEIPT_NOT_FOUND')) {
      return 'Customer receipt not found on server.';
    }
    if (msg.includes('INVOICE_NOT_FOUND')) {
      return 'One or more selected invoices were not found on server.';
    }
    return msg;
  };

  const handleAllocateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAllocateError(null);

    const validationErr = validateAllocationInput();
    if (validationErr) {
      setAllocateError(validationErr);
      return;
    }

    if (!allocatingReceipt) return;

    setAllocateSubmitting(true);

    const idempotencyKey = `rcpt_alloc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const payload: AllocateCustomerReceiptPayload = {
      allocations: computedAllocations.map((a) => ({
        invoiceId: a.invoiceId,
        amountPaise: a.amountPaise,
      })),
      idempotencyKey,
    };

    const res = await AdminClient.allocateCustomerReceipt(allocatingReceipt.receiptId, payload);
    setAllocateSubmitting(false);

    if (res.success && res.receipt) {
      const formattedTotal = (totalSelectedPaise / 100).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      setSuccessMessage(
        `Successfully allocated ₹${formattedTotal} across ${computedAllocations.length} sales invoice(s) for Receipt ${res.receipt.receiptNumber}.`
      );
      setAllocatingReceipt(null);
      if (selectedReceipt && selectedReceipt.receiptId === res.receipt.receiptId) {
        setSelectedReceipt(res.receipt);
      }
      fetchReceipts();
    } else {
      const rawMsg = res.message || res.error || 'Failed to allocate customer receipt.';
      setAllocateError(mapAllocationError(rawMsg));
    }
  };

  const handleReverseReceipt = async (receiptId: string) => {
    const reason = window.prompt('Enter reason for reversing this customer receipt:');
    if (reason === null) {
      return;
    }
    setReverseSubmitting(true);
    setReverseError(null);

    const idempotencyKey = `cr_rev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const res = await AdminClient.reverseCustomerReceipt(receiptId, {
      reason: reason.trim() || undefined,
      idempotencyKey,
    });

    setReverseSubmitting(false);

    if (res.success && res.receipt) {
      setSuccessMessage(`Customer Receipt ${res.receipt.receiptNumber} successfully reversed.`);
      setSelectedReceipt(res.receipt);
      fetchReceipts();
    } else {
      setReverseError(res.message || res.error || 'Failed to reverse customer receipt.');
    }
  };

  const handlePostReceipt = async (receiptId: string) => {
    if (!window.confirm('Post this customer receipt to double-entry accounting? This will debit Cash/Bank and credit Accounts Receivable.')) {
      return;
    }
    setPostSubmitting(true);
    setPostError(null);

    const idempotencyKey = `cr_post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const res = await AdminClient.postCustomerReceipt(receiptId, { idempotencyKey });

    setPostSubmitting(false);

    if (res.success && res.receipt) {
      setSuccessMessage(`Customer Receipt ${res.receipt.receiptNumber} successfully posted (Voucher: ${res.receipt.voucherNumber || '—'}).`);
      setSelectedReceipt(res.receipt);
      fetchReceipts();
    } else {
      setPostError(res.message || res.error || 'Failed to post customer receipt.');
    }
  };

  const fetchReceipts = useCallback(async () => {
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

    const res = await AdminClient.fetchCustomerReceipts(filters);
    if (res.success && res.data) {
      setReceipts(res.data.receipts);
      setTotalPages(res.data.pagination.totalPages);
      setTotalCount(res.data.pagination.totalCount);
    } else {
      setError(res.message || res.error || 'Failed to load customer receipts.');
    }
    setLoading(false);
  }, [page, pageSize, search, paymentMethodFilter, statusFilter, fromDate, toDate]);

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!createCustomerId.trim()) {
      setCreateError('Customer ID is required.');
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

    const idempotencyKey = `cr_idemp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const res = await AdminClient.createCustomerReceipt({
      customerId: createCustomerId.trim(),
      amountPaise,
      paymentMethod: createPaymentMethod,
      cashBankAccountCode: createCashBankAccountCode.trim() || undefined,
      receiptDate: createReceiptDate || undefined,
      referenceNumber: createReferenceNumber.trim() || undefined,
      notes: createNotes.trim() || undefined,
      idempotencyKey,
    });

    setCreateSubmitting(false);

    if (res.success && res.receipt) {
      setSuccessMessage(`Customer Receipt ${res.receipt.receiptNumber} created successfully in DRAFT state.`);
      setShowCreateModal(false);
      // Reset form
      setCreateCustomerId('');
      setCreateAmountRupees('');
      setCreateReferenceNumber('');
      setCreateNotes('');
      fetchReceipts();
    } else {
      setCreateError(res.message || res.error || 'Failed to create customer receipt.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
            <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
            Payment In (Customer Receipts)
          </h2>
          <p className="text-xs text-stone-500">
            Money received from Kirana retailers • Cash (A/C 1100) / Bank (A/C 1200) Debit • Accounts Receivable (A/C 1300) Credit
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => fetchReceipts()}
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
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            New Customer Receipt
          </button>
        </div>
      </div>

      {/* COD Protection Notice Banner */}
      <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-start gap-2.5">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold">Payment In & COD Canonical Architecture:</span>
          <p className="text-emerald-700 leading-relaxed">
            All customer money receipts post directly to double-entry accounting (Dr Cash 1100 / Bank 1200, Cr AR 1300).
            COD order collections automatically create canonical Customer Receipts upon verification. Existing COD orders and collections are protected against duplicate receipt creation.
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

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="text-rose-700 font-bold">
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
              placeholder="Search receipt #, reference, customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
              className="w-full px-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">All Methods</option>
              {ALLOWED_PAYMENT_METHODS.map((m) => (
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
              className="w-full px-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">DRAFT</option>
              <option value="POSTED">POSTED</option>
              <option value="REVERSED">REVERSED</option>
            </select>
          </div>

          {/* Clear Filters */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setPaymentMethodFilter('ALL');
                setStatusFilter('ALL');
                setFromDate('');
                setToDate('');
                setPage(1);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-stone-600 border border-stone-300 rounded-lg hover:bg-stone-50 transition w-full"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Date Filter Range */}
        <div className="flex items-center gap-2 pt-2 border-t border-stone-100 text-xs text-stone-500">
          <Calendar className="w-3.5 h-3.5 text-stone-400" />
          <span>Date Range:</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
            className="px-2 py-1 bg-stone-50 border border-stone-200 rounded text-xs"
          />
          <span>to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
            className="px-2 py-1 bg-stone-50 border border-stone-200 rounded text-xs"
          />
        </div>
      </div>

      {/* Receipts Table */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Receipt #</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4">Account</th>
                <th className="py-3 px-4 text-right">Amount (₹)</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-stone-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-stone-300" />
                    Loading customer receipts...
                  </td>
                </tr>
              ) : receipts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-stone-400">
                    No customer receipts found.
                  </td>
                </tr>
              ) : (
                receipts.map((r) => (
                  <tr key={r.receiptId} className="hover:bg-stone-50/70 transition">
                    <td className="py-3 px-4 font-mono font-bold text-stone-900">
                      {r.receiptNumber}
                    </td>
                    <td className="py-3 px-4 text-stone-600">{r.receiptDate}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-stone-900">
                        {r.customerSnapshot?.businessName || r.customerId}
                      </div>
                      <div className="text-[10px] text-stone-400">
                        {r.customerSnapshot?.ownerName ? `${r.customerSnapshot.ownerName} • ` : ''}
                        {r.customerId}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700 text-[10px] font-medium">
                        {r.paymentMethod.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-stone-700">{r.cashBankAccountCode}</span>
                      <span className="text-[10px] text-stone-400 ml-1">
                        ({r.cashBankAccountInfo?.accountName || 'Cash/Bank'})
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-stone-900 font-mono">
                      ₹{(r.amountPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.status === 'POSTED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : r.status === 'REVERSED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedReceipt(r)}
                          className="px-2.5 py-1 text-xs bg-stone-100 hover:bg-stone-200 text-stone-700 rounded font-medium transition cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 inline mr-1" />
                          View
                        </button>
                        {isEligibleForAllocation(r) && (
                          <button
                            type="button"
                            onClick={() => openAllocateModal(r)}
                            className="px-2.5 py-1 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded font-medium transition cursor-pointer flex items-center gap-1"
                          >
                            <ArrowDownLeft className="w-3.5 h-3.5" />
                            Allocate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="py-3 px-4 bg-stone-50 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-stone-600">
          <div>
            Showing <span className="font-semibold">{receipts.length}</span> of{' '}
            <span className="font-semibold">{totalCount}</span> receipts
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1 border border-stone-300 rounded hover:bg-white disabled:opacity-40 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>
              Page <span className="font-bold">{page}</span> of{' '}
              <span className="font-bold">{totalPages || 1}</span>
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1 border border-stone-300 rounded hover:bg-white disabled:opacity-40 transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-emerald-600" />
                  {selectedReceipt.receiptNumber}
                </h3>
                <p className="text-xs text-stone-400">ID: {selectedReceipt.receiptId}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="text-stone-400 hover:text-stone-600 p-1 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-stone-50 rounded-lg">
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Amount</span>
                <span className="font-mono text-base font-bold text-emerald-700">
                  ₹{(selectedReceipt.amountPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-stone-400 block font-mono">
                  {selectedReceipt.amountPaise} paise
                </span>
              </div>

              <div className="p-3 bg-stone-50 rounded-lg">
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Status</span>
                <span
                  className={`inline-block px-2 py-0.5 mt-1 rounded text-[10px] font-bold ${
                    selectedReceipt.status === 'POSTED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {selectedReceipt.status}
                </span>
                <span className="text-[10px] text-stone-400 block mt-0.5">
                  Unallocated: ₹{(selectedReceipt.unallocatedAmountPaise / 100).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="p-3 bg-stone-50 rounded-lg space-y-1 text-xs">
              <span className="text-stone-400 block text-[10px] uppercase font-bold">Customer Snapshot</span>
              <div className="font-bold text-stone-900">
                {selectedReceipt.customerSnapshot?.businessName || selectedReceipt.customerId}
              </div>
              <div className="text-stone-600">
                {selectedReceipt.customerSnapshot?.ownerName} • {selectedReceipt.customerSnapshot?.mobile}
              </div>
              <div className="text-stone-500 text-[11px]">
                {selectedReceipt.customerSnapshot?.billingAddress}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-stone-400 block text-[10px] uppercase">Payment Method</span>
                <span className="font-semibold text-stone-800">
                  {selectedReceipt.paymentMethod.replace('_', ' ')}
                </span>
              </div>
              <div>
                <span className="text-stone-400 block text-[10px] uppercase">Receipt Date</span>
                <span className="font-semibold text-stone-800">{selectedReceipt.receiptDate}</span>
              </div>
              <div>
                <span className="text-stone-400 block text-[10px] uppercase">Cash/Bank Account</span>
                <span className="font-mono text-stone-800">
                  {selectedReceipt.cashBankAccountCode} - {selectedReceipt.cashBankAccountInfo?.accountName || 'Cash/Bank'}
                </span>
              </div>
              <div>
                <span className="text-stone-400 block text-[10px] uppercase">Reference #</span>
                <span className="font-mono text-stone-800">
                  {selectedReceipt.referenceNumber || 'None'}
                </span>
              </div>
            </div>

            {selectedReceipt.notes && (
              <div className="p-2.5 bg-stone-50 rounded text-xs text-stone-700">
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Notes</span>
                {selectedReceipt.notes}
              </div>
            )}

            {selectedReceipt.status === 'POSTED' && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1.5 text-xs">
                <span className="text-emerald-700 block text-[10px] uppercase font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Accounting Posting Linked
                </span>
                <div className="grid grid-cols-2 gap-2 text-stone-800">
                  <div>
                    <span className="text-stone-500 block text-[10px]">Voucher #</span>
                    <span className="font-mono font-bold">{selectedReceipt.voucherNumber || '—'}</span>
                  </div>
                  <div>
                    <span className="text-stone-500 block text-[10px]">Journal ID</span>
                    <span className="font-mono">{selectedReceipt.journalId || '—'}</span>
                  </div>
                  {selectedReceipt.postedAt && (
                    <div className="col-span-2">
                      <span className="text-stone-500 block text-[10px]">Posted At</span>
                      <span>{new Date(selectedReceipt.postedAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {selectedReceipt.status === 'REVERSED' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1.5 text-xs">
                <span className="text-amber-800 block text-[10px] uppercase font-bold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  Receipt Reversed / Cancelled
                </span>
                <div className="grid grid-cols-2 gap-2 text-stone-800">
                  <div>
                    <span className="text-stone-500 block text-[10px]">Reversal Journal</span>
                    <span className="font-mono font-bold text-amber-900">{selectedReceipt.reversalJournalId || '—'}</span>
                  </div>
                  {selectedReceipt.reversedAt && (
                    <div>
                      <span className="text-stone-500 block text-[10px]">Reversed At</span>
                      <span>{new Date(selectedReceipt.reversedAt).toLocaleString()}</span>
                    </div>
                  )}
                  {selectedReceipt.reversalReason && (
                    <div className="col-span-2">
                      <span className="text-stone-500 block text-[10px]">Reason</span>
                      <span className="text-stone-700">{selectedReceipt.reversalReason}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {postError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{postError}</span>
              </div>
            )}

            {reverseError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{reverseError}</span>
              </div>
            )}

            {selectedReceipt.status === 'DRAFT' && (
              <div className="pt-2 border-t border-stone-100">
                <button
                  type="button"
                  disabled={postSubmitting}
                  onClick={() => handlePostReceipt(selectedReceipt.receiptId)}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 text-xs"
                >
                  {postSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Posting to Double-Entry Accounting...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Post Customer Receipt to Accounting
                    </>
                  )}
                </button>
              </div>
            )}

            {selectedReceipt.status === 'POSTED' && (
              <div className="pt-2 border-t border-stone-100 flex flex-col gap-2">
                {isEligibleForAllocation(selectedReceipt) && (
                  <button
                    type="button"
                    onClick={() => {
                      const rcpt = selectedReceipt;
                      setSelectedReceipt(null);
                      openAllocateModal(rcpt);
                    }}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer text-xs"
                  >
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                    Allocate to Sales Invoices (₹{((selectedReceipt.unallocatedAmountPaise || 0) / 100).toFixed(2)} Available)
                  </button>
                )}

                <button
                  type="button"
                  disabled={reverseSubmitting}
                  onClick={() => handleReverseReceipt(selectedReceipt.receiptId)}
                  className="w-full py-2 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 text-xs"
                >
                  {reverseSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Reversing Customer Receipt...
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                      Reverse / Cancel Customer Receipt
                    </>
                  )}
                </button>
              </div>
            )}

            <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400">
              <span>Created by: {selectedReceipt.createdBy}</span>
              <span>{new Date(selectedReceipt.createdAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Allocate Customer Receipt Modal (Phase 5.9 Part 1) */}
      {allocatingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 space-y-4 shadow-xl border border-stone-200 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                  <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
                  Allocate Customer Receipt
                </h3>
                <p className="text-xs text-stone-500">
                  Receipt #{allocatingReceipt.receiptNumber} • Customer: {allocatingReceipt.customerSnapshot?.businessName || allocatingReceipt.customerId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAllocatingReceipt(null)}
                className="text-stone-400 hover:text-stone-600 p-1 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Receipt Summary & Allocation Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 bg-stone-50 rounded-lg">
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Total Receipt</span>
                <span className="font-mono text-sm font-bold text-stone-800">
                  ₹{(allocatingReceipt.amountPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-stone-400 block">
                  {allocatingReceipt.paymentMethod.replace('_', ' ')}
                </span>
              </div>

              <div className="p-2.5 bg-stone-50 rounded-lg">
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Already Allocated</span>
                <span className="font-mono text-sm font-bold text-stone-600">
                  ₹{(((allocatingReceipt.allocatedAmountPaise ?? (allocatingReceipt.amountPaise - allocatingReceipt.unallocatedAmountPaise))) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-lg">
                <span className="text-emerald-700 block text-[10px] uppercase font-bold">Available to Allocate</span>
                <span className="font-mono text-sm font-bold text-emerald-800">
                  ₹{(receiptUnallocatedPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div
                className={`p-2.5 rounded-lg border ${
                  remainingAfterAllocationPaise < 0
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : 'bg-stone-50 border-stone-200 text-stone-800'
                }`}
              >
                <span className="block text-[10px] uppercase font-bold">Remaining After</span>
                <span className="font-mono text-sm font-bold">
                  ₹{(remainingAfterAllocationPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] block opacity-75">
                  Selected: ₹{(totalSelectedPaise / 100).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Error notifications */}
            {allocateError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{allocateError}</span>
                </div>
                <button type="button" onClick={() => setAllocateError(null)} className="text-rose-700 font-bold ml-2">
                  ✕
                </button>
              </div>
            )}

            {/* Invoices List / Form */}
            <div className="flex-1 overflow-y-auto space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="text-xs font-bold text-stone-800 flex items-center gap-2">
                  <span>Eligible Outstanding Sales Invoices</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600 text-[10px]">
                    {eligibleInvoices.length}
                  </span>
                </div>

                {!eligibleLoading && eligibleInvoices.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAutoFillFifo}
                      className="px-2.5 py-1 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded font-medium transition cursor-pointer flex items-center gap-1"
                    >
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                      Auto-fill (FIFO)
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllocationAmounts}
                      className="px-2 py-1 text-xs bg-stone-100 hover:bg-stone-200 text-stone-600 rounded font-medium transition cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {eligibleLoading && (
                <div className="py-12 flex flex-col items-center justify-center text-stone-400 text-xs">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-600 mb-2" />
                  <span>Loading eligible sales invoices from server...</span>
                </div>
              )}

              {eligibleError && (
                <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  <div>
                    <span className="font-bold block">Failed to load invoices</span>
                    <span>{eligibleError}</span>
                  </div>
                </div>
              )}

              {!eligibleLoading && !eligibleError && eligibleInvoices.length === 0 && (
                <div className="py-12 text-center text-stone-400 text-xs bg-stone-50 rounded-xl border border-dashed border-stone-200 p-6">
                  <p className="font-semibold text-stone-600 mb-1">No Eligible Sales Invoices Found</p>
                  <p>There are no outstanding or unpaid sales invoices for this customer.</p>
                </div>
              )}

              {!eligibleLoading && !eligibleError && eligibleInvoices.length > 0 && (
                <div className="overflow-x-auto border border-stone-200 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 border-b border-stone-200 text-[10px] text-stone-500 uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">Invoice #</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3 text-right">Invoice Total</th>
                        <th className="py-2.5 px-3 text-right">Adjusted</th>
                        <th className="py-2.5 px-3 text-right">Outstanding</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                        <th className="py-2.5 px-3 text-right">Allocation (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {eligibleInvoices.map((inv) => {
                        const enteredVal = allocationAmounts[inv.invoiceId] || '';
                        const enteredNum = parseFloat(enteredVal);
                        const isEntered = !isNaN(enteredNum) && enteredNum > 0;
                        const enteredPaise = isEntered ? Math.round(enteredNum * 100) : 0;
                        const isExceeded = enteredPaise > inv.outstandingAmountPaise;

                        return (
                          <tr key={inv.invoiceId} className={`hover:bg-stone-50/60 ${isEntered ? 'bg-emerald-50/30' : ''}`}>
                            <td className="py-2.5 px-3 font-semibold text-stone-900 font-mono">
                              {inv.invoiceNumber}
                            </td>
                            <td className="py-2.5 px-3 text-stone-500 whitespace-nowrap">
                              {inv.invoiceDate}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-stone-600">
                              ₹{(inv.grandTotalPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-stone-600">
                              ₹{(inv.adjustedTotalPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                              ₹{(inv.outstandingAmountPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  inv.paymentStatus === 'PARTIALLY_PAID'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-stone-100 text-stone-700'
                                }`}
                              >
                                {inv.paymentStatus}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center gap-1.5 justify-end">
                                <div className="relative w-28">
                                  <span className="absolute left-2 top-1.5 text-stone-400 text-xs">₹</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max={(inv.outstandingAmountPaise / 100).toFixed(2)}
                                    placeholder="0.00"
                                    value={enteredVal}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setAllocationAmounts((prev) => ({ ...prev, [inv.invoiceId]: val }));
                                      setAllocateError(null);
                                    }}
                                    className={`w-full pl-5 pr-2 py-1 bg-stone-50 border rounded text-right font-mono text-xs focus:outline-none focus:ring-1 ${
                                      isExceeded
                                        ? 'border-rose-300 text-rose-700 focus:ring-rose-500'
                                        : 'border-stone-200 text-stone-900 focus:ring-emerald-500'
                                    }`}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleSetMaxForInvoice(inv.invoiceId)}
                                  className="px-2 py-1 text-[11px] bg-stone-100 hover:bg-stone-200 text-stone-700 rounded font-medium transition cursor-pointer"
                                  title="Allocate maximum available for this invoice"
                                >
                                  Max
                                </button>
                              </div>
                              {isExceeded && (
                                <span className="text-[10px] text-rose-600 block mt-0.5">
                                  Exceeds outstanding!
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="text-stone-500 text-[11px]">
                {computedAllocations.length > 0 ? (
                  <span>
                    Allocating <span className="font-bold text-emerald-700">₹{(totalSelectedPaise / 100).toFixed(2)}</span> across <span className="font-bold text-stone-800">{computedAllocations.length}</span> invoice(s).
                  </span>
                ) : (
                  <span>Enter amounts above or use Auto-fill (FIFO).</span>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setAllocatingReceipt(null)}
                  disabled={allocateSubmitting}
                  className="flex-1 sm:flex-none px-4 py-2 border border-stone-200 text-stone-600 rounded-lg hover:bg-stone-50 font-medium transition cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleAllocateSubmit}
                  disabled={
                    allocateSubmitting ||
                    totalSelectedPaise <= 0 ||
                    totalSelectedPaise > receiptUnallocatedPaise ||
                    Boolean(eligibleError) ||
                    eligibleLoading
                  }
                  className="flex-1 sm:flex-none px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {allocateSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Allocating...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Confirm Allocation (₹{(totalSelectedPaise / 100).toFixed(2)})
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Customer Receipt Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-stone-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-600" />
                New Customer Receipt (DRAFT)
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-stone-400 hover:text-stone-600 p-1 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Customer ID / Retailer ID <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. ret_123 or select customer"
                  value={createCustomerId}
                  onChange={(e) => setCreateCustomerId(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-700 font-semibold mb-1">
                    Amount (₹) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="e.g. 500.00"
                    value={createAmountRupees}
                    onChange={(e) => setCreateAmountRupees(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-stone-700 font-semibold mb-1">Payment Method</label>
                  <select
                    value={createPaymentMethod}
                    onChange={(e) => {
                      const m = e.target.value as CustomerReceiptPaymentMethod;
                      setCreatePaymentMethod(m);
                      if (m === 'CASH') setCreateCashBankAccountCode('1100');
                      else setCreateCashBankAccountCode('1200');
                    }}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                  >
                    {ALLOWED_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-700 font-semibold mb-1">
                    Cash/Bank Account
                  </label>
                  <select
                    value={createCashBankAccountCode}
                    onChange={(e) => setCreateCashBankAccountCode(e.target.value)}
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs font-mono"
                  >
                    <option value="1100">1100 - Cash in Hand</option>
                    <option value="1200">1200 - Bank Account</option>
                  </select>
                </div>

                <div>
                  <label className="block text-stone-700 font-semibold mb-1">Receipt Date</label>
                  <input
                    type="date"
                    value={createReceiptDate}
                    onChange={(e) => setCreateReceiptDate(e.target.value)}
                    placeholder="Defaults to today"
                    className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-stone-700 font-semibold mb-1">
                  Reference # (e.g. UPI / Cheque / Bank Ref)
                </label>
                <input
                  type="text"
                  placeholder="Optional reference number"
                  maxLength={100}
                  value={createReferenceNumber}
                  onChange={(e) => setCreateReferenceNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                />
              </div>

              <div>
                <label className="block text-stone-700 font-semibold mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Optional accounting notes (max 500 chars)"
                  maxLength={500}
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                />
              </div>

              <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-stone-600 hover:bg-stone-50 rounded-lg font-medium transition cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold transition cursor-pointer disabled:opacity-50 text-xs shadow-xs"
                >
                  {createSubmitting ? 'Creating...' : 'Create Draft Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
