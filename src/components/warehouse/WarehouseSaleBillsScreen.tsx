import React, { useState, useEffect } from 'react';
import { useWarehouse } from '../../context/WarehouseContext';
import { WarehouseClient } from '../../services/warehouseClient';
import { SalesInvoice } from '../../types/invoice';
import { InvoiceDocumentModel } from '../../types/invoiceDocument';
import { InvoiceDocumentModal } from '../admin/accounting/InvoiceDocumentModal';
import {
  Receipt,
  Plus,
  Search,
  RefreshCw,
  FileText,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Building2,
  Package,
  ArrowRight,
  Printer,
  ChevronRight,
  IndianRupee,
} from 'lucide-react';

export const WarehouseSaleBillsScreen: React.FC = () => {
  const { warehouseId, warehouseName } = useWarehouse();

  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal State for Generating from Order
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [eligibleOrders, setEligibleOrders] = useState<any[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [orderSearch, setOrderSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Document modal
  const [previewDoc, setPreviewDoc] = useState<InvoiceDocumentModel | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleOpenDocument = async (invoiceId: string) => {
    try {
      const docModel = await WarehouseClient.getSalesInvoiceDocument(invoiceId);
      setPreviewDoc(docModel);
      setPreviewOpen(true);
    } catch (err: any) {
      setError(err.message || 'Failed to load invoice document.');
    }
  };

  const fetchInvoices = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const filters: any = {};
      if (searchTerm.trim()) filters.search = searchTerm.trim();
      if (statusFilter !== 'ALL') filters.status = statusFilter;
      const res = await WarehouseClient.listSaleBills(filters);
      setInvoices(res.invoices || []);
      setTotalCount(res.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load sale bills.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [statusFilter]);

  const loadEligibleOrders = async () => {
    setIsLoadingOrders(true);
    try {
      const orders = await WarehouseClient.listEligibleOrders(orderSearch);
      setEligibleOrders(orders || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load eligible orders.');
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const handleOpenGenerateModal = () => {
    setSelectedOrder(null);
    setIsGenerateModalOpen(true);
    loadEligibleOrders();
  };

  const handleCreateSaleBill = async () => {
    if (!selectedOrder) return;
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await WarehouseClient.createSaleBillFromOrder({
        orderId: selectedOrder.orderId,
        invoiceDate: invoiceDate || new Date().toISOString().split('T')[0],
      });

      setSuccessMessage(
        res.isIdempotentReplay
          ? `Sale Bill "${res.invoice.invoiceNumber}" already issued for Order ${selectedOrder.orderNumber || selectedOrder.orderId}.`
          : `Sale Bill "${res.invoice.invoiceNumber}" created and issued successfully.`
      );
      setIsGenerateModalOpen(false);
      setSelectedOrder(null);
      await fetchInvoices();
    } catch (err: any) {
      setError(err.message || 'Failed to generate sale bill.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-stone-900 flex items-center gap-2">
              <Receipt className="w-6 h-6 text-amber-600" />
              Warehouse Sale Bills
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-200">
              {warehouseId}
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            Server-authoritative B2B sales invoicing from existing retailer orders with zero duplicate stock deduction.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchInvoices}
            disabled={isLoading}
            className="px-3 py-2 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleOpenGenerateModal}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Generate Sale Bill from Order
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by invoice #, retailer name, or order ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchInvoices()}
            className="w-full pl-9 pr-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 bg-stone-50"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-stone-600">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs border border-stone-300 rounded-lg px-2.5 py-1.5 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="ISSUED">Issued</option>
            <option value="DRAFT">Draft</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Invoices List Table */}
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
          <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">
            Sale Bills ({totalCount})
          </span>
          <span className="text-[11px] text-stone-500">
            FMCG Wholesale Branch: {warehouseName}
          </span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-stone-400 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
            Loading Sale Bills...
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center text-stone-500 text-xs">
            <Receipt className="w-8 h-8 text-stone-300 mx-auto mb-2" />
            No sale bills found for this warehouse. Click "Generate Sale Bill from Order" to invoice an eligible wholesale order.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-100 text-stone-600 border-b border-stone-200">
                <tr>
                  <th className="py-2.5 px-4 font-bold">Invoice #</th>
                  <th className="py-2.5 px-4 font-bold">Date</th>
                  <th className="py-2.5 px-4 font-bold">Customer / Retailer</th>
                  <th className="py-2.5 px-4 font-bold">Order Ref</th>
                  <th className="py-2.5 px-4 font-bold text-right">Grand Total</th>
                  <th className="py-2.5 px-4 font-bold text-center">Status</th>
                  <th className="py-2.5 px-4 font-bold text-center">Accounting</th>
                  <th className="py-2.5 px-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {invoices.map((inv) => (
                  <tr key={inv.invoiceId} className="hover:bg-amber-50/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-stone-900">
                      {inv.invoiceNumber}
                    </td>
                    <td className="py-3 px-4 text-stone-600">
                      {inv.invoiceDate}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-stone-900">
                        {inv.billingAddressSnapshot?.businessName || inv.customerId}
                      </div>
                      <div className="text-[11px] text-stone-500">
                        {inv.billingAddressSnapshot?.contactName} • {inv.billingAddressSnapshot?.city}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {inv.sourceOrderId ? (
                        <span className="font-mono text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          {inv.sourceOrderId}
                        </span>
                      ) : (
                        <span className="text-stone-400 italic">Direct Sale</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-black text-stone-900">
                      ₹{inv.grandTotal?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          inv.invoiceStatus === 'ISSUED'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : inv.invoiceStatus === 'CANCELLED'
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {inv.invoiceStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {inv.accountingStatus === 'POSTED' ? (
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-mono font-bold border border-emerald-200">
                          {inv.accountingVoucherNumber || 'POSTED'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-stone-500 bg-stone-100 px-2 py-0.5 rounded">
                          Not Posted
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenDocument(inv.invoiceId)}
                        className="px-2.5 py-1 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded flex items-center gap-1 ml-auto cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        View / Print
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* GENERATE SALE BILL MODAL */}
      {isGenerateModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-stone-200 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 bg-stone-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-amber-400" />
                  Generate Sale Bill from Retailer Order
                </h3>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  Select an eligible order to create an authoritative Sale Bill with zero double stock deduction.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsGenerateModalOpen(false)}
                className="text-stone-400 hover:text-white text-lg font-bold px-2 py-0.5"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {!selectedOrder ? (
                <>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search orders by number or retailer..."
                        value={orderSearch}
                        onChange={(e) => setOrderSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadEligibleOrders()}
                        className="w-full pl-9 pr-3 py-2 text-xs border border-stone-300 rounded-lg bg-stone-50"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={loadEligibleOrders}
                      className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs rounded-lg"
                    >
                      Search
                    </button>
                  </div>

                  {isLoadingOrders ? (
                    <div className="p-8 text-center text-stone-400 text-xs">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-500" />
                      Loading eligible orders...
                    </div>
                  ) : eligibleOrders.length === 0 ? (
                    <div className="p-8 text-center text-stone-500 text-xs bg-stone-50 rounded-lg border border-dashed border-stone-300">
                      No eligible orders found in {warehouseId}.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {eligibleOrders.map((ord) => (
                        <div
                          key={ord.orderId}
                          onClick={() => setSelectedOrder(ord)}
                          className="p-3 rounded-lg border border-stone-200 hover:border-amber-400 hover:bg-amber-50/50 cursor-pointer flex items-center justify-between transition-all"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs text-stone-900">
                                {ord.orderNumber || ord.orderId}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 font-medium">
                                {ord.orderStatus}
                              </span>
                              {ord.alreadyInvoiced && (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                                  Already Invoiced ({ord.invoiceNumber})
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-bold text-stone-800 mt-1">
                              {ord.shopName}
                            </div>
                            <div className="text-[11px] text-stone-500">
                              {ord.retailerName} • {ord.itemsCount} items • {ord.createdAt?.split('T')[0]}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="font-black text-sm text-stone-900">
                              ₹{ord.grandTotal?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </div>
                            <span className="text-[11px] font-bold text-amber-700 flex items-center gap-1 justify-end mt-1">
                              Select <ChevronRight className="w-3 h-3" />
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                /* Selected Order Review */
                <div className="space-y-4">
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-amber-800">Selected Order</span>
                      <div className="font-mono font-black text-stone-900 text-sm">
                        {selectedOrder.orderNumber || selectedOrder.orderId}
                      </div>
                      <div className="text-xs text-stone-700 mt-0.5">
                        {selectedOrder.shopName} ({selectedOrder.retailerId})
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedOrder(null)}
                      className="px-2.5 py-1 text-xs text-stone-600 bg-white hover:bg-stone-100 rounded border border-stone-300 font-bold cursor-pointer"
                    >
                      Change Order
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-stone-600 mb-1">
                        Invoice Date:
                      </label>
                      <input
                        type="date"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        className="w-full text-xs p-2 border border-stone-300 rounded-lg bg-stone-50 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-stone-600 mb-1">
                        Fulfillment Hub:
                      </label>
                      <input
                        type="text"
                        disabled
                        value={warehouseId}
                        className="w-full text-xs p-2 border border-stone-200 rounded-lg bg-stone-100 font-mono text-stone-600 font-bold"
                      />
                    </div>
                  </div>

                  {/* Read-Only Items Breakdown from Order Snapshot */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">
                      Order Snapshot Items (Prices are Authoritative & Immutable):
                    </label>
                    <div className="border border-stone-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-stone-100 text-stone-600">
                          <tr>
                            <th className="py-1.5 px-3">Item</th>
                            <th className="py-1.5 px-3 text-center">Qty</th>
                            <th className="py-1.5 px-3 text-right">Unit Price</th>
                            <th className="py-1.5 px-3 text-right">Line Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {(selectedOrder.items || []).map((it: any, i: number) => (
                            <tr key={i}>
                              <td className="py-1.5 px-3">
                                <div className="font-bold text-stone-900">{it.productName || it.productId}</div>
                                <div className="text-[10px] text-stone-500 font-mono">{it.sku || it.productId}</div>
                              </td>
                              <td className="py-1.5 px-3 text-center font-bold">{it.quantity}</td>
                              <td className="py-1.5 px-3 text-right font-mono">₹{it.unitPrice ?? it.price ?? 0}</td>
                              <td className="py-1.5 px-3 text-right font-bold font-mono">
                                ₹{((it.quantity || 1) * (it.unitPrice ?? it.price ?? 0)).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="p-3 bg-stone-100 rounded-lg flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-700">Estimated Grand Total:</span>
                    <span className="font-black text-base text-stone-900 font-mono">
                      ₹{selectedOrder.grandTotal?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="text-[11px] text-emerald-800 bg-emerald-50 p-2.5 rounded border border-emerald-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>
                      Zero Inventory Side-Effect: Stock was already deducted when this order was placed. Sale Bill creation will not decrement stock again.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsGenerateModalOpen(false)}
                className="px-4 py-2 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-100 font-bold text-xs"
              >
                Cancel
              </button>

              {selectedOrder && (
                <button
                  type="button"
                  onClick={handleCreateSaleBill}
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Issuing Sale Bill...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Create & Issue Sale Bill
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invoice Document Modal */}
      {previewDoc && (
        <InvoiceDocumentModal
          document={previewDoc}
          isOpen={previewOpen}
          onClose={() => {
            setPreviewOpen(false);
            setPreviewDoc(null);
          }}
          isAdmin={true}
        />
      )}
    </div>
  );
};
