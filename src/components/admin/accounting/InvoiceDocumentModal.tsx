import React, { useState } from 'react';
import {
  Printer,
  Download,
  X,
  FileText,
  ShieldCheck,
  CheckCircle2,
  Building,
  Calendar,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import {
  InvoiceDocumentModel,
  formatIndianCurrency,
} from '../../../types/invoiceDocument';
import { InvoiceClient } from '../../../services/invoiceClient';
import { AdminClient } from '../../../services/adminClient';

interface InvoiceDocumentModalProps {
  document: InvoiceDocumentModel | null;
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
}

export const InvoiceDocumentModal: React.FC<InvoiceDocumentModalProps> = ({
  document: doc,
  isOpen,
  onClose,
  isAdmin = true,
}) => {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  if (!isOpen || !doc) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      if (doc.documentType === 'TAX_INVOICE') {
        if (isAdmin) {
          await InvoiceClient.downloadSalesInvoicePdf(doc.invoiceId, doc.invoiceNumber);
        } else {
          await InvoiceClient.downloadRetailerSalesInvoicePdf(doc.invoiceId, doc.invoiceNumber);
        }
      } else if (doc.documentType === 'PURCHASE_INVOICE') {
        await InvoiceClient.downloadPurchaseInvoicePdf(doc.invoiceId, doc.invoiceNumber);
      } else {
        await AdminClient.downloadCreditDebitNotePdf(doc.invoiceId, doc.invoiceNumber);
      }
    } catch (err: any) {
      setDownloadError(err.message || 'Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  };

  const party = doc.customer || doc.supplier || doc.billingAddress;
  const partyTitle =
    doc.documentType === 'TAX_INVOICE' || doc.documentType.startsWith('SALES_')
      ? 'Customer / Retailer Details'
      : 'Supplier / Vendor Information';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Controls Bar (Hidden during Print) */}
        <div className="no-print bg-slate-950 border-b border-slate-800 px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#f5b024]" />
            <div>
              <span className="font-bold text-white text-sm">
                {doc.documentTitle} — {doc.invoiceNumber}
              </span>
              <span className="text-[11px] text-slate-400 block">
                Official Business Document Preview • Read-Only
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Print Invoice (A4 Layout)"
            >
              <Printer className="w-4 h-4 text-slate-300" />
              <span>Print</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="px-3.5 py-1.5 bg-[#f5b024] hover:bg-[#e5a014] text-slate-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Download Server-Authoritative PDF"
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>{downloading ? 'Generating...' : 'Download PDF'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer transition-colors ml-2"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {downloadError && (
          <div className="no-print bg-rose-500/10 border-b border-rose-500/30 px-4 py-2 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{downloadError}</span>
          </div>
        )}

        {/* Scrollable Printable Document Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-stone-100 text-stone-900 printable-invoice-document">
          <div className="max-w-[780px] mx-auto bg-white rounded-xl shadow-xs border border-stone-200 p-6 sm:p-8 space-y-6">
            {/* Top Brand Bar */}
            <div className="h-1.5 bg-[#f5b024] rounded-t-sm -mt-6 -mx-6 sm:-mt-8 sm:-mx-8 mb-6" />

            {/* Header Section */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b border-stone-200 pb-5">
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-stone-950 tracking-tight">
                  {doc.company.legalName}
                </h1>
                <p className="text-xs font-semibold text-stone-600 mt-1">
                  Brand: {doc.company.brandName} • Wholesale FMCG Supply
                </p>
                <p className="text-[11px] text-stone-500 mt-0.5 leading-relaxed max-w-md">
                  {doc.company.fullAddress}, {doc.company.city}, {doc.company.state} - {doc.company.pincode}
                </p>
                <p className="text-[11px] text-stone-600 mt-1">
                  Phone: {doc.company.supportPhone} • Email: {doc.company.supportEmail}
                </p>
                {doc.company.gstin && (
                  <p className="text-[11px] font-bold text-stone-900 mt-0.5">
                    GSTIN: {doc.company.gstin}
                  </p>
                )}
              </div>

              <div className="sm:text-right shrink-0">
                <div className="inline-block px-3 py-1 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 font-black text-base uppercase tracking-wider">
                  {doc.documentTitle}
                </div>
                <div className="text-[11px] font-semibold text-stone-500 mt-1">
                  {doc.isCustomerFacing ? 'Original for Recipient' : 'Authoritative Office Copy'}
                </div>
                <div className="font-mono text-xs font-bold text-stone-900 mt-2">
                  Inv #: {doc.invoiceNumber}
                </div>
                <div className="text-xs text-stone-600">
                  Date: {doc.formattedDate}
                </div>
              </div>
            </div>

            {/* Metadata & Party Details Card */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Left Column: Invoice Meta */}
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-2">
                <div className="font-bold text-stone-800 uppercase tracking-wider text-[10px] pb-1 border-b border-stone-200">
                  Invoice & Fulfillment Details
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <span className="text-stone-500">Invoice No:</span>
                  <span className="col-span-2 font-mono font-bold text-stone-950">{doc.invoiceNumber}</span>

                  <span className="text-stone-500">Invoice Date:</span>
                  <span className="col-span-2 text-stone-800">{doc.formattedDate}</span>

                  <span className="text-stone-500">Payment:</span>
                  <span className="col-span-2 font-semibold text-stone-900 uppercase">{doc.paymentStatus}</span>

                  <span className="text-stone-500">Status:</span>
                  <span className="col-span-2 font-semibold text-stone-900">{doc.status}</span>

                  {doc.references.sourceOrderId && (
                    <>
                      <span className="text-stone-500">Order Ref:</span>
                      <span className="col-span-2 font-mono text-stone-800">{doc.references.sourceOrderId}</span>
                    </>
                  )}

                  {doc.references.supplierInvoiceNumber && (
                    <>
                      <span className="text-stone-500">Supplier Bill:</span>
                      <span className="col-span-2 font-mono text-stone-800">{doc.references.supplierInvoiceNumber}</span>
                    </>
                  )}

                  {doc.references.originalInvoiceNumber && (
                    <>
                      <span className="text-stone-500">Orig Invoice:</span>
                      <span className="col-span-2 font-mono font-bold text-stone-900">{doc.references.originalInvoiceNumber}</span>
                    </>
                  )}

                  {doc.references.reason && (
                    <>
                      <span className="text-stone-500">Reason:</span>
                      <span className="col-span-2 text-stone-800 italic">{doc.references.reason}</span>
                    </>
                  )}

                  <span className="text-stone-500">Warehouse:</span>
                  <span className="col-span-2 text-stone-800 truncate">{doc.warehouseName}</span>
                </div>
              </div>

              {/* Right Column: Customer / Supplier Snapshot */}
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-2">
                <div className="font-bold text-stone-800 uppercase tracking-wider text-[10px] pb-1 border-b border-stone-200">
                  {partyTitle}
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-stone-950 text-sm">
                    {party.businessName || 'Business Entity'}
                  </div>
                  <div className="text-stone-700">
                    Contact: {party.contactName || '—'} ({party.mobile || '—'})
                  </div>
                  <div className="text-stone-600 leading-relaxed text-[11px]">
                    {party.fullAddress}, {party.city}, {party.state} - {party.pincode}
                  </div>
                  {party.gstin && (
                    <div className="font-bold text-amber-800 pt-0.5 text-[11px]">
                      GSTIN: {party.gstin}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="border border-stone-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-900 text-white font-bold text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 w-8 text-center">#</th>
                    <th className="py-2.5 px-3">Item Description & SKU</th>
                    <th className="py-2.5 px-3 text-right w-14">Qty</th>
                    <th className="py-2.5 px-3 text-right w-20">Unit Rate</th>
                    <th className="py-2.5 px-3 text-right w-16">Discount</th>
                    <th className="py-2.5 px-3 text-right w-20">Taxable</th>
                    <th className="py-2.5 px-3 text-right w-16">Tax (GST)</th>
                    <th className="py-2.5 px-3 text-right w-24">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 text-stone-800">
                  {doc.items.map((it) => (
                    <tr key={it.srNo} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-2.5 px-3 text-center font-mono text-stone-500">{it.srNo}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-stone-950">{it.productName}</div>
                        <div className="text-[10px] text-stone-500 font-mono">SKU: {it.sku}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold">{it.quantity}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{formatIndianCurrency(it.unitPrice)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-stone-600">
                        {it.discount > 0 ? `-${formatIndianCurrency(it.discount)}` : '0.00'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">{formatIndianCurrency(it.taxableAmount)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-stone-600">
                        {formatIndianCurrency(it.taxAmount)} ({it.taxRate}%)
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-stone-950">
                        {formatIndianCurrency(it.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals & Words Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start text-xs pt-1">
              {/* Words Box */}
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-2">
                <span className="font-bold text-stone-600 uppercase tracking-wider text-[10px] block">
                  Amount Chargeable (in words)
                </span>
                <p className="font-bold text-stone-950 italic text-sm leading-relaxed">
                  {doc.totals.amountInWords || 'Zero Rupees Only'}
                </p>
                <div className="text-[10px] text-stone-500 pt-2 border-t border-stone-200 mt-2">
                  E. & O.E. • Subject to Delhi Jurisdiction
                </div>
              </div>

              {/* Numerical Totals Box */}
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-stone-600">
                  <span>Subtotal:</span>
                  <span className="font-mono font-semibold text-stone-900">{formatIndianCurrency(doc.totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-stone-600">
                  <span>Discount:</span>
                  <span className="font-mono font-semibold text-stone-900">
                    -{formatIndianCurrency(doc.totals.discountTotal)}
                  </span>
                </div>
                <div className="flex justify-between text-stone-600">
                  <span>Taxable Amount:</span>
                  <span className="font-mono font-semibold text-stone-900">{formatIndianCurrency(doc.totals.taxableTotal)}</span>
                </div>
                <div className="flex justify-between text-stone-600">
                  <span>Total Tax (GST):</span>
                  <span className="font-mono font-semibold text-stone-900">{formatIndianCurrency(doc.totals.taxTotal)}</span>
                </div>
                <div className="flex justify-between items-center text-sm font-black text-amber-900 bg-amber-100/70 p-2 rounded-lg border border-amber-300 mt-2">
                  <span>Grand Total:</span>
                  <span className="font-mono text-base">{formatIndianCurrency(doc.totals.grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Admin-Only Accounting Panel (Section 7: not exposed on customer-facing documents) */}
            {isAdmin && !doc.isCustomerFacing && doc.accounting && (
              <div className="no-print bg-slate-900 text-white rounded-xl p-4 border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#f5b024]" />
                    <span className="font-bold text-xs uppercase tracking-wider text-slate-300">
                      Authoritative General Ledger Linkage (Admin Only)
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {doc.accounting.accountingStatus}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Voucher Number</span>
                    <span className="font-mono font-bold text-white">
                      {doc.accounting.voucherNumber || '— (Pending)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Journal Entry ID</span>
                    <span className="font-mono text-slate-300 text-[11px] truncate block">
                      {doc.accounting.journalId || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Posted Timestamp</span>
                    <span className="text-slate-300">
                      {doc.accounting.postedAt
                        ? new Date(doc.accounting.postedAt).toLocaleString('en-IN')
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Footer Declarations */}
            <div className="border-t border-stone-200 pt-4 text-[10px] text-stone-500 flex flex-col sm:flex-row justify-between items-center gap-2">
              <div>
                Declaration: We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
              </div>
              <div className="font-bold text-stone-800 text-right shrink-0">
                For {doc.company.legalName}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
