import React, { useState, useEffect } from 'react';
import { useWarehouse } from '../../context/WarehouseContext';
import { WarehouseClient } from '../../services/warehouseClient';
import { PurchaseInvoice } from '../../types/invoice';
import { InvoiceDocumentModel } from '../../types/invoiceDocument';
import { InvoiceDocumentModal } from '../admin/accounting/InvoiceDocumentModal';
import {
  FileSpreadsheet,
  Plus,
  Search,
  RefreshCw,
  FileText,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Boxes,
  Truck,
  Building2,
  ChevronRight,
  ArrowDownToLine,
} from 'lucide-react';

interface PurchaseItemRow {
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitCost: number;
  taxRate: number;
}

export const WarehousePurchaseBillsScreen: React.FC = () => {
  const { warehouseId, warehouseName, inventory } = useWarehouse();

  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal State for New Inward Purchase Bill
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PurchaseItemRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Document Modal
  const [previewDoc, setPreviewDoc] = useState<InvoiceDocumentModel | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleOpenDocument = async (invoiceId: string) => {
    try {
      const docModel = await WarehouseClient.getPurchaseInvoiceDocument(invoiceId);
      setPreviewDoc(docModel);
      setPreviewOpen(true);
    } catch (err: any) {
      setError(err.message || 'Failed to load purchase invoice document.');
    }
  };

  const fetchInvoices = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const filters: any = {};
      if (searchTerm.trim()) filters.search = searchTerm.trim();
      if (statusFilter !== 'ALL') filters.status = statusFilter;
      const res = await WarehouseClient.listPurchaseBills(filters);
      setInvoices(res.invoices || []);
      setTotalCount(res.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load purchase bills.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [statusFilter]);

  const loadSuppliers = async () => {
    try {
      const sups = await WarehouseClient.listSuppliers();
      setSuppliers(sups || []);
      if (sups && sups.length > 0 && !selectedSupplierId) {
        setSelectedSupplierId(sups[0].supplierId);
      }
    } catch {
      // ignore
    }
  };

  const handleOpenModal = () => {
    loadSuppliers();
    setSupplierInvoiceNumber('');
    setNotes('');
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    // Start with 1 empty row
    if (inventory && inventory.length > 0) {
      const first = inventory[0];
      setItems([
        {
          productId: first.productId,
          sku: first.sku,
          productName: first.productName,
          quantity: 10,
          unitCost: Math.round(Number(first.sellingPrice || 50) * 0.85),
          taxRate: 5,
        },
      ]);
    } else {
      setItems([]);
    }
    setIsModalOpen(true);
  };

  const handleAddItemRow = () => {
    if (inventory.length === 0) return;
    const prod = inventory[0];
    setItems((prev) => [
      ...prev,
      {
        productId: prod.productId,
        sku: prod.sku,
        productName: prod.productName,
        quantity: 10,
        unitCost: Math.round(Number(prod.sellingPrice || 50) * 0.85),
        taxRate: 5,
      },
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleProductChange = (index: number, productId: string) => {
    const prod = inventory.find((p) => p.productId === productId);
    if (!prod) return;
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        productId: prod.productId,
        sku: prod.sku,
        productName: prod.productName,
        unitCost: Math.round(Number(prod.sellingPrice || 50) * 0.85),
      };
      return updated;
    });
  };

  const handleRowChange = (index: number, field: keyof PurchaseItemRow, value: any) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value,
      };
      return updated;
    });
  };

  // Preview Totals
  const previewTotals = items.reduce(
    (acc, row) => {
      const lineTaxable = Math.max(0, row.quantity * row.unitCost);
      const lineTax = (lineTaxable * row.taxRate) / 100;
      acc.taxable += lineTaxable;
      acc.tax += lineTax;
      acc.grandTotal += lineTaxable + lineTax;
      return acc;
    },
    { taxable: 0, tax: 0, grandTotal: 0 }
  );

  const handleCreatePurchaseBill = async () => {
    if (!selectedSupplierId) {
      setError('Please select a valid supplier.');
      return;
    }
    if (items.length === 0) {
      setError('Please add at least one line item.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const payload = {
        supplierId: selectedSupplierId,
        supplierInvoiceNumber: supplierInvoiceNumber.trim() || undefined,
        invoiceDate,
        notes: notes.trim() || undefined,
        items: items.map((it) => ({
          productId: it.productId,
          quantity: Number(it.quantity),
          unitCost: Number(it.unitCost),
          taxRate: Number(it.taxRate),
          skuSnapshot: it.sku,
          productNameSnapshot: it.productName,
        })),
      };

      const res = await WarehouseClient.createPurchaseBill(payload);

      setSuccessMessage(
        res.isIdempotentReplay
          ? `Purchase Bill "${res.invoice.invoiceNumber}" was already processed.`
          : `Purchase Bill "${res.invoice.invoiceNumber}" created, posted to accounting, and inventory received successfully.`
      );
      setIsModalOpen(false);
      await fetchInvoices();
    } catch (err: any) {
      setError(err.message || 'Failed to create purchase bill.');
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
              <FileSpreadsheet className="w-6 h-6 text-amber-600" />
              Warehouse Purchase Bills (Inward Goods)
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-200">
              {warehouseId}
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            Record FMCG vendor inward consignments with double-entry Accounts Payable and atomic stock increments.
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
            onClick={handleOpenModal}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Purchase Bill (Inward)
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
            placeholder="Search by invoice #, supplier, or reference..."
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
            <option value="POSTED">Posted</option>
            <option value="DRAFT">Draft</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Invoices List Table */}
      <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
          <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">
            Purchase Bills ({totalCount})
          </span>
          <span className="text-[11px] text-stone-500">
            FMCG Receiving Branch: {warehouseName}
          </span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-stone-400 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
            Loading Purchase Bills...
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center text-stone-500 text-xs">
            <FileSpreadsheet className="w-8 h-8 text-stone-300 mx-auto mb-2" />
            No purchase bills recorded yet for this warehouse. Click "New Purchase Bill" to inward a new supplier consignment.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-100 text-stone-600 border-b border-stone-200">
                <tr>
                  <th className="py-2.5 px-4 font-bold">Bill #</th>
                  <th className="py-2.5 px-4 font-bold">Date</th>
                  <th className="py-2.5 px-4 font-bold">Supplier / Vendor</th>
                  <th className="py-2.5 px-4 font-bold">Supplier Ref #</th>
                  <th className="py-2.5 px-4 font-bold text-center">Items</th>
                  <th className="py-2.5 px-4 font-bold text-right">Grand Total</th>
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
                        {inv.billingAddressSnapshot?.businessName || inv.supplierId || 'FMCG Vendor'}
                      </div>
                      <div className="text-[11px] text-stone-500">
                        {inv.supplierId}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {inv.supplierInvoiceNumber ? (
                        <span className="font-mono text-[11px] text-stone-700 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                          {inv.supplierInvoiceNumber}
                        </span>
                      ) : (
                        <span className="text-stone-400 italic">None</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center font-bold">
                      {inv.items?.length || 0}
                    </td>
                    <td className="py-3 px-4 text-right font-black text-stone-900">
                      ₹{inv.grandTotal?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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

      {/* NEW INWARD PURCHASE BILL MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-stone-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 bg-stone-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm flex items-center gap-2">
                  <ArrowDownToLine className="w-4 h-4 text-amber-400" />
                  New Purchase Bill — Inward Consignment
                </h3>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  Receiving stock into {warehouseId} • Increases stock & posts to AP ledger (Dr 5100, Dr 2300, Cr 2100).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-stone-400 hover:text-white text-lg font-bold px-2 py-0.5"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {/* Header details grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">
                    Select Supplier / Vendor:
                  </label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    className="w-full text-xs p-2 border border-stone-300 rounded-lg bg-stone-50 text-stone-900 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {suppliers.map((s) => (
                      <option key={s.supplierId} value={s.supplierId}>
                        {s.name} ({s.supplierId})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">
                    Supplier Invoice Ref #:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. INV-ADANI-2026-0901"
                    value={supplierInvoiceNumber}
                    onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                    className="w-full text-xs p-2 border border-stone-300 rounded-lg bg-stone-50 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-600 mb-1">
                    Invoice Date:
                  </label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full text-xs p-2 border border-stone-300 rounded-lg bg-stone-50 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Items Section */}
              <div className="border border-stone-200 rounded-lg p-3 bg-stone-50/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Boxes className="w-4 h-4 text-amber-600" />
                    Consignment Items & Received Quantities
                  </span>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="px-2.5 py-1 bg-white hover:bg-stone-100 border border-stone-300 text-stone-800 text-xs font-bold rounded flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Product
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs bg-white rounded-lg border border-stone-200 overflow-hidden">
                    <thead className="bg-stone-100 text-stone-600 border-b border-stone-200">
                      <tr>
                        <th className="py-2 px-3 font-bold">Product</th>
                        <th className="py-2 px-3 font-bold w-24 text-center">Inward Qty</th>
                        <th className="py-2 px-3 font-bold w-28 text-right">Unit Cost (₹)</th>
                        <th className="py-2 px-3 font-bold w-24 text-center">GST %</th>
                        <th className="py-2 px-3 font-bold w-28 text-right">Line Total</th>
                        <th className="py-2 px-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {items.map((row, idx) => {
                        const lineGross = row.quantity * row.unitCost;
                        const lineTax = (lineGross * row.taxRate) / 100;
                        const lineTotal = lineGross + lineTax;

                        return (
                          <tr key={idx} className="hover:bg-stone-50">
                            <td className="py-2 px-3">
                              <select
                                value={row.productId}
                                onChange={(e) => handleProductChange(idx, e.target.value)}
                                className="w-full text-xs p-1 border border-stone-200 rounded bg-white text-stone-900 font-bold"
                              >
                                {inventory.map((p) => (
                                  <option key={p.productId} value={p.productId}>
                                    {p.productName} ({p.sku})
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <input
                                type="number"
                                min="1"
                                value={row.quantity}
                                onChange={(e) =>
                                  handleRowChange(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))
                                }
                                className="w-20 text-xs p-1 border border-stone-200 rounded text-center font-bold"
                              />
                            </td>
                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={row.unitCost}
                                onChange={(e) =>
                                  handleRowChange(idx, 'unitCost', Math.max(0, parseFloat(e.target.value) || 0))
                                }
                                className="w-24 text-xs p-1 border border-stone-200 rounded text-right font-mono"
                              />
                            </td>
                            <td className="py-2 px-3 text-center">
                              <select
                                value={row.taxRate}
                                onChange={(e) =>
                                  handleRowChange(idx, 'taxRate', parseFloat(e.target.value) || 0)
                                }
                                className="w-20 text-xs p-1 border border-stone-200 rounded bg-white text-center font-mono"
                              >
                                <option value="0">0%</option>
                                <option value="5">5%</option>
                                <option value="12">12%</option>
                                <option value="18">18%</option>
                                <option value="28">28%</option>
                              </select>
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-stone-900">
                              ₹{lineTotal.toFixed(2)}
                            </td>
                            <td className="py-2 px-2 text-center">
                              {items.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItemRow(idx)}
                                  className="text-stone-400 hover:text-rose-600 p-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] font-bold text-stone-600 mb-1">
                  Consignment Notes (optional):
                </label>
                <input
                  type="text"
                  placeholder="e.g. Received via Vehicle DL1A-1234, Batch #774B"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full text-xs p-2 border border-stone-300 rounded-lg bg-stone-50"
                />
              </div>

              {/* Totals Summary */}
              <div className="p-4 bg-stone-100 rounded-lg flex items-center justify-between">
                <div className="space-y-0.5 text-xs text-stone-600">
                  <div>Taxable Subtotal: <span className="font-bold text-stone-900 font-mono">₹{previewTotals.taxable.toFixed(2)}</span></div>
                  <div>Input GST: <span className="font-bold text-stone-900 font-mono">₹{previewTotals.tax.toFixed(2)}</span></div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-stone-500 font-bold uppercase">Estimated Payable:</div>
                  <div className="font-black text-lg text-stone-900 font-mono">
                    ₹{previewTotals.grandTotal.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-amber-900 bg-amber-50 p-2.5 rounded border border-amber-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-amber-600" />
                <span>
                  Authoritative Inward Guarantee: Posting this bill atomically increases warehouse product stock in the catalogue and writes immutable entries to the stock movement ledger.
                </span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border border-stone-300 rounded-lg text-stone-700 hover:bg-stone-100 font-bold text-xs"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleCreatePurchaseBill}
                disabled={isSubmitting || items.length === 0}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Inwarding Consignment...
                  </>
                ) : (
                  <>
                    <ArrowDownToLine className="w-4 h-4" />
                    Create & Post Inward Bill
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Modal */}
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
