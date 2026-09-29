/**
 * MR FUTKAR — Invoice Document Service (Phase 5.5 Part 4)
 * Pure Server-Authoritative Document Generation, PDF Rendering, & Access Control
 * READ-ONLY with respect to accounting, operational, and inventory data.
 */

import { Request } from 'express';
import { doc, getDoc } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import { db, OPERATIONAL_WAREHOUSE_ID } from './firebaseAdmin';
import { logAdminAudit } from './adminAuth';
import { defaultBusinessSettings, BusinessSettings } from '../src/config/businessSettings';
import { SalesInvoice, PurchaseInvoice } from '../src/types/invoice';
import { CreditDebitNote } from '../src/types/creditDebitNote';
import {
  InvoiceDocumentModel,
  InvoiceCompanyInfo,
  InvoicePartyInfo,
  InvoiceDocumentLine,
  InvoiceDocumentTotals,
  formatIndianCurrency,
  formatPdfCurrency,
  formatDateIndian,
  numberToWordsIndian,
} from '../src/types/invoiceDocument';

export class InvoiceDocumentService {
  /**
   * Helper: Resolve Company Info from businessSettings/global
   */
  private static async getCompanyInfo(): Promise<InvoiceCompanyInfo> {
    let settings: BusinessSettings = defaultBusinessSettings;
    try {
      const snap = await getDoc(doc(db, 'businessSettings', 'global'));
      if (snap.exists()) {
        settings = { ...defaultBusinessSettings, ...snap.data() } as BusinessSettings;
      }
    } catch {
      // Fallback to defaultBusinessSettings
    }

    return {
      legalName: settings.legalName || 'MR FUTKAR INDIA PRIVATE LIMITED',
      brandName: settings.businessName || 'MR FUTKAR',
      supportPhone: settings.supportPhone || '+91 98100 12345',
      supportEmail: settings.supportEmail || 'support@mrfutkar.in',
      fullAddress: settings.businessAddress || 'Plot 4, Brahmpuri Main Road, Near Metro Pillar 124',
      city: settings.city || 'Delhi',
      state: settings.state || 'Delhi',
      pincode: settings.pincode || '110053',
      gstin: (settings as any).gstin || '07AABCM8899Q1ZX',
      pan: (settings as any).pan || 'AABCM8899Q',
      currency: settings.currency || 'INR',
      timezone: settings.timezone || 'Asia/Kolkata',
    };
  }

  /**
   * Build Normalized Sales Invoice Document Model
   */
  public static async getSalesInvoiceDocument(
    invoiceId: string,
    options: {
      isAdmin: boolean;
      customerId?: string;
      req?: Request;
      auditAction?: 'VIEW' | 'EXPORT';
      adminUid?: string;
      adminName?: string;
    }
  ): Promise<InvoiceDocumentModel> {
    if (!invoiceId || typeof invoiceId !== 'string') {
      throw new Error('INVALID_INVOICE_ID: invoiceId is required.');
    }

    // 1. Single Authoritative Read (Avoids N+1 queries)
    const invoiceRef = doc(db, 'salesInvoices', invoiceId.trim());
    const invoiceSnap = await getDoc(invoiceRef);

    if (!invoiceSnap.exists()) {
      throw new Error(`INVOICE_NOT_FOUND: Sales invoice "${invoiceId}" not found.`);
    }

    const inv = invoiceSnap.data() as SalesInvoice;

    // 2. Strict Authorization Verification
    if (!options.isAdmin) {
      if (!options.customerId || inv.customerId.trim().toLowerCase() !== options.customerId.trim().toLowerCase()) {
        throw new Error('ACCESS_DENIED: Retailer cannot access another retailer\'s invoice.');
      }
    }

    // 3. Resolve Company Information
    const company = await this.getCompanyInfo();

    // 4. Assemble Immutable Customer Party Info
    const billing: InvoicePartyInfo = {
      businessName: inv.billingAddressSnapshot.businessName,
      contactName: inv.billingAddressSnapshot.contactName,
      mobile: inv.billingAddressSnapshot.mobile,
      fullAddress: inv.billingAddressSnapshot.fullAddress,
      city: inv.billingAddressSnapshot.city,
      state: inv.billingAddressSnapshot.state || 'Delhi',
      pincode: inv.billingAddressSnapshot.pincode || '',
      gstin: inv.billingAddressSnapshot.gstin,
    };

    const shipping: InvoicePartyInfo = {
      businessName: inv.shippingAddressSnapshot.businessName || billing.businessName,
      contactName: inv.shippingAddressSnapshot.contactName || billing.contactName,
      mobile: inv.shippingAddressSnapshot.mobile || billing.mobile,
      fullAddress: inv.shippingAddressSnapshot.fullAddress || billing.fullAddress,
      city: inv.shippingAddressSnapshot.city || billing.city,
      state: inv.shippingAddressSnapshot.state || billing.state,
      pincode: inv.shippingAddressSnapshot.pincode || billing.pincode,
      gstin: inv.shippingAddressSnapshot.gstin || billing.gstin,
    };

    // 5. Items Table from Immutable Snapshots (Never recalculated from PricingEngine)
    const items: InvoiceDocumentLine[] = (inv.items || []).map((it, idx) => ({
      srNo: idx + 1,
      productId: it.productId,
      sku: it.skuSnapshot,
      productName: it.productNameSnapshot,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discount: it.discountAmount,
      taxableAmount: it.taxableAmount,
      taxRate: it.taxRate,
      taxAmount: it.taxAmount,
      lineTotal: it.lineTotal,
    }));

    // 6. Totals from Immutable Stored Header
    const totals: InvoiceDocumentTotals = {
      subtotal: inv.subtotal,
      discountTotal: inv.discountTotal,
      taxableTotal: inv.taxableTotal,
      taxTotal: inv.taxTotal,
      grandTotal: inv.grandTotal,
      currencySymbol: '₹',
      amountInWords: numberToWordsIndian(inv.grandTotal),
    };

    const model: InvoiceDocumentModel = {
      documentType: 'TAX_INVOICE',
      documentTitle: 'TAX INVOICE',
      invoiceId: inv.invoiceId,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      formattedDate: formatDateIndian(inv.invoiceDate),
      status: inv.invoiceStatus,
      paymentStatus: inv.paymentStatus,
      accountingStatus: inv.accountingStatus,
      warehouseId: inv.warehouseId || OPERATIONAL_WAREHOUSE_ID,
      warehouseName: 'MR FUTKAR — Brahmpuri Central Hub (WH-BRAHMPURI-01)',
      warehouse: {
        warehouseId: inv.warehouseId || OPERATIONAL_WAREHOUSE_ID,
        warehouseName: 'MR FUTKAR — Brahmpuri Central Hub (WH-BRAHMPURI-01)',
      },
      company,
      customer: billing,
      billingAddress: billing,
      shippingAddress: shipping,
      items,
      totals,
      tax: {
        taxableTotal: totals.taxableTotal,
        taxTotal: totals.taxTotal,
      },
      references: {
        sourceOrderId: inv.sourceOrderId || null,
        idempotencyKey: inv.idempotencyKey || null,
      },
      isCustomerFacing: !options.isAdmin,
    };

    // Accounting panel: Included for Admin only
    if (options.isAdmin) {
      model.accounting = {
        accountingStatus: inv.accountingStatus,
        voucherNumber: inv.accountingVoucherNumber || null,
        journalId: inv.accountingJournalId || null,
        postedAt: inv.accountingPostedAt || null,
      };
    }

    // 7. Audit Logging
    if (options.isAdmin && options.adminUid) {
      const action = options.auditAction === 'EXPORT' ? 'SALES_INVOICE_DOCUMENT_EXPORT' : 'SALES_INVOICE_DOCUMENT_VIEW';
      await logAdminAudit({
        action: action as any,
        adminUid: options.adminUid,
        adminName: options.adminName || 'Admin',
        targetType: 'SALES_INVOICE',
        targetId: inv.invoiceId,
        metadata: {
          invoiceNumber: inv.invoiceNumber,
          grandTotal: inv.grandTotal,
          customerId: inv.customerId,
        },
        req: options.req,
      });
    }

    return model;
  }

  /**
   * Build Normalized Purchase Invoice Document Model
   */
  public static async getPurchaseInvoiceDocument(
    invoiceId: string,
    options: {
      isAdmin: boolean;
      req?: Request;
      auditAction?: 'VIEW' | 'EXPORT';
      adminUid?: string;
      adminName?: string;
    }
  ): Promise<InvoiceDocumentModel> {
    if (!invoiceId || typeof invoiceId !== 'string') {
      throw new Error('INVALID_INVOICE_ID: invoiceId is required.');
    }

    // Purchase invoices are strictly Admin-only
    if (!options.isAdmin) {
      throw new Error('ACCESS_DENIED: Purchase invoices are restricted to Super Admin administrators.');
    }

    // 1. Single Authoritative Read
    const invoiceRef = doc(db, 'purchaseInvoices', invoiceId.trim());
    const invoiceSnap = await getDoc(invoiceRef);

    if (!invoiceSnap.exists()) {
      throw new Error(`INVOICE_NOT_FOUND: Purchase invoice "${invoiceId}" not found.`);
    }

    const inv = invoiceSnap.data() as PurchaseInvoice;

    // 2. Resolve Company Info
    const company = await this.getCompanyInfo();

    // 3. Assemble Immutable Supplier Party Info
    const supplierBilling: InvoicePartyInfo = {
      businessName: inv.billingAddressSnapshot.businessName,
      contactName: inv.billingAddressSnapshot.contactName,
      mobile: inv.billingAddressSnapshot.mobile,
      fullAddress: inv.billingAddressSnapshot.fullAddress,
      city: inv.billingAddressSnapshot.city,
      state: inv.billingAddressSnapshot.state || 'Delhi',
      pincode: inv.billingAddressSnapshot.pincode || '',
      gstin: inv.billingAddressSnapshot.gstin,
    };

    const warehouseShipping: InvoicePartyInfo = {
      businessName: inv.shippingAddressSnapshot.businessName || 'MR FUTKAR Wholesale Inward',
      contactName: inv.shippingAddressSnapshot.contactName || 'Warehouse Inward Manager',
      mobile: inv.shippingAddressSnapshot.mobile || company.supportPhone,
      fullAddress: inv.shippingAddressSnapshot.fullAddress || company.fullAddress,
      city: inv.shippingAddressSnapshot.city || company.city,
      state: inv.shippingAddressSnapshot.state || company.state,
      pincode: inv.shippingAddressSnapshot.pincode || company.pincode || '',
      gstin: inv.shippingAddressSnapshot.gstin || company.gstin,
    };

    // 4. Items from Immutable Snapshots
    const items: InvoiceDocumentLine[] = (inv.items || []).map((it, idx) => ({
      srNo: idx + 1,
      productId: it.productId,
      sku: it.skuSnapshot,
      productName: it.productNameSnapshot,
      quantity: it.quantity,
      unitPrice: it.unitCost,
      discount: it.discountAmount,
      taxableAmount: it.taxableAmount,
      taxRate: it.taxRate,
      taxAmount: it.taxAmount,
      lineTotal: it.lineTotal,
    }));

    // 5. Totals from Stored Header
    const totals: InvoiceDocumentTotals = {
      subtotal: inv.subtotal,
      discountTotal: inv.discountTotal,
      taxableTotal: inv.taxableTotal,
      taxTotal: inv.taxTotal,
      grandTotal: inv.grandTotal,
      currencySymbol: '₹',
      amountInWords: numberToWordsIndian(inv.grandTotal),
    };

    const model: InvoiceDocumentModel = {
      documentType: 'PURCHASE_INVOICE',
      documentTitle: 'PURCHASE INVOICE',
      invoiceId: inv.invoiceId,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      formattedDate: formatDateIndian(inv.invoiceDate),
      status: inv.invoiceStatus,
      paymentStatus: inv.paymentStatus,
      accountingStatus: inv.accountingStatus,
      warehouseId: inv.warehouseId || OPERATIONAL_WAREHOUSE_ID,
      warehouseName: 'MR FUTKAR — Brahmpuri Central Hub (WH-BRAHMPURI-01)',
      warehouse: {
        warehouseId: inv.warehouseId || OPERATIONAL_WAREHOUSE_ID,
        warehouseName: 'MR FUTKAR — Brahmpuri Central Hub (WH-BRAHMPURI-01)',
      },
      company,
      supplier: supplierBilling,
      billingAddress: supplierBilling,
      shippingAddress: warehouseShipping,
      items,
      totals,
      tax: {
        taxableTotal: totals.taxableTotal,
        taxTotal: totals.taxTotal,
      },
      accounting: {
        accountingStatus: inv.accountingStatus,
        voucherNumber: inv.accountingVoucherNumber || null,
        journalId: inv.accountingJournalId || null,
        postedAt: inv.accountingPostedAt || null,
      },
      references: {
        supplierInvoiceNumber: inv.supplierInvoiceNumber || null,
        idempotencyKey: inv.idempotencyKey || null,
      },
      isCustomerFacing: false,
    };

    // 6. Audit Logging
    if (options.adminUid) {
      const action = options.auditAction === 'EXPORT' ? 'PURCHASE_INVOICE_DOCUMENT_EXPORT' : 'PURCHASE_INVOICE_DOCUMENT_VIEW';
      await logAdminAudit({
        action: action as any,
        adminUid: options.adminUid,
        adminName: options.adminName || 'Admin',
        targetType: 'PURCHASE_INVOICE',
        targetId: inv.invoiceId,
        metadata: {
          invoiceNumber: inv.invoiceNumber,
          grandTotal: inv.grandTotal,
          supplierId: inv.supplierId,
        },
        req: options.req,
      });
    }

    return model;
  }

  /**
   * Build Normalized Credit / Debit Note Document Model
   */
  public static async getCreditDebitNoteDocument(
    noteId: string,
    options: {
      isAdmin: boolean;
      req?: Request;
      auditAction?: 'VIEW' | 'EXPORT';
      adminUid?: string;
      adminName?: string;
    }
  ): Promise<InvoiceDocumentModel> {
    if (!noteId || typeof noteId !== 'string') {
      throw new Error('INVALID_NOTE_ID: noteId is required.');
    }

    const noteRef = doc(db, 'creditDebitNotes', noteId.trim());
    const noteSnap = await getDoc(noteRef);

    if (!noteSnap.exists()) {
      throw new Error(`NOTE_NOT_FOUND: Credit/Debit Note "${noteId}" not found.`);
    }

    const note = noteSnap.data() as CreditDebitNote;
    const company = await this.getCompanyInfo();

    const partySnapshot = note.customerSnapshot || note.supplierSnapshot;
    const defaultParty: InvoicePartyInfo = {
      businessName: 'Valued Partner',
      contactName: 'Operations',
      mobile: '—',
      fullAddress: 'Delhi, India',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110053',
    };

    const partyInfo: InvoicePartyInfo = partySnapshot ? {
      businessName: partySnapshot.businessName || defaultParty.businessName,
      contactName: partySnapshot.contactName || defaultParty.contactName,
      mobile: partySnapshot.mobile || defaultParty.mobile,
      fullAddress: partySnapshot.fullAddress || defaultParty.fullAddress,
      city: partySnapshot.city || defaultParty.city,
      state: partySnapshot.state || defaultParty.state,
      pincode: partySnapshot.pincode || defaultParty.pincode,
      gstin: partySnapshot.gstin,
    } : defaultParty;

    const items: InvoiceDocumentLine[] = (note.items || []).map((it, idx) => ({
      srNo: idx + 1,
      productId: it.productId,
      sku: it.skuSnapshot || it.productId,
      productName: it.productNameSnapshot || 'Item',
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discount: it.discountAmount,
      taxableAmount: it.taxableAmount,
      taxRate: it.taxRate,
      taxAmount: it.taxAmount,
      lineTotal: it.lineTotal,
    }));

    const docTitle = note.noteType.replace(/_/g, ' ');

    const model: InvoiceDocumentModel = {
      documentType: note.noteType as any,
      documentTitle: docTitle,
      invoiceId: note.noteId,
      invoiceNumber: note.noteNumber,
      invoiceDate: note.createdAt ? note.createdAt.substring(0, 10) : new Date().toISOString().substring(0, 10),
      formattedDate: formatDateIndian(note.createdAt ? note.createdAt.substring(0, 10) : new Date().toISOString().substring(0, 10)),
      status: note.status,
      paymentStatus: 'ACCOUNTING ADJUSTMENT',
      accountingStatus: note.accountingStatus,
      warehouseId: note.warehouseId,
      warehouseName: note.warehouseSnapshot?.name || 'MR FUTKAR — BRAHMPURI',
      warehouse: {
        warehouseId: note.warehouseId,
        warehouseName: note.warehouseSnapshot?.name || 'MR FUTKAR — BRAHMPURI',
      },
      company,
      customer: note.customerSnapshot ? partyInfo : undefined,
      supplier: note.supplierSnapshot ? partyInfo : undefined,
      billingAddress: partyInfo,
      shippingAddress: partyInfo,
      items,
      totals: {
        subtotal: note.subtotal,
        discountTotal: note.discountTotal,
        taxableTotal: note.taxableTotal,
        taxTotal: note.taxTotal,
        grandTotal: note.grandTotal,
        currencySymbol: '₹',
        amountInWords: numberToWordsIndian(note.grandTotal),
      },
      tax: {
        taxableTotal: note.taxableTotal,
        taxTotal: note.taxTotal,
      },
      references: {
        originalInvoiceId: note.originalInvoiceId,
        originalInvoiceNumber: note.originalInvoiceNumber,
        originalInvoiceDate: note.originalInvoiceDate,
        reason: note.reason,
        idempotencyKey: note.idempotencyKey,
      },
      isCustomerFacing: !options.isAdmin,
    };

    if (options.isAdmin) {
      model.accounting = {
        accountingStatus: note.accountingStatus,
        voucherNumber: note.accountingVoucherNumber,
        journalId: note.accountingJournalId,
        postedAt: note.accountingPostedAt,
      };
    }

    if (options.adminUid) {
      await logAdminAudit({
        action: 'CREDIT_DEBIT_NOTE_VIEWED' as any,
        adminUid: options.adminUid,
        adminName: options.adminName || 'Admin',
        targetType: 'CREDIT_DEBIT_NOTE',
        targetId: note.noteId,
        metadata: {
          noteNumber: note.noteNumber,
          noteType: note.noteType,
          grandTotal: note.grandTotal,
        },
        req: options.req,
      });
    }

    return model;
  }

  /**
   * PDF Generator for Credit and Debit Notes
   */
  public static async generateCreditDebitNotePdf(
    noteId: string,
    options: {
      isAdmin: boolean;
      req?: Request;
      adminUid?: string;
      adminName?: string;
    }
  ): Promise<Buffer> {
    const model = await this.getCreditDebitNoteDocument(noteId, {
      ...options,
      auditAction: 'EXPORT',
    });
    return this.generateInvoicePdf(model);
  }

  /**
   * PDF Generator: Creates A4 PDF Document from Normalized Model
   */
  public static generateInvoicePdf(model: InvoiceDocumentModel): Buffer {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 14;
    const contentWidth = pageWidth - 2 * margin; // 182mm

    let currentY = margin;

    // Helper: Draw Header on Page
    function drawHeader(pageNum: number, totalPages: number) {
      // Brand Bar Top
      doc.setFillColor(245, 176, 36); // #f5b024
      doc.rect(margin, currentY, contentWidth, 2, 'F');
      currentY += 6;

      // Company Legal Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(20, 24, 33);
      doc.text(model.company.legalName, margin, currentY);

      // Document Title (Right-Aligned)
      doc.setFontSize(16);
      doc.setTextColor(245, 150, 0);
      doc.text(model.documentTitle, pageWidth - margin, currentY, { align: 'right' });
      currentY += 5;

      // Brand / Subtitle
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `${model.company.fullAddress}, ${model.company.city}, ${model.company.state} - ${model.company.pincode}`,
        margin,
        currentY
      );

      // Copy Type Right
      const copyType = model.isCustomerFacing ? 'Original for Recipient' : 'Office Copy';
      doc.text(copyType, pageWidth - margin, currentY, { align: 'right' });
      currentY += 4;

      doc.text(
        `Phone: ${model.company.supportPhone} | Email: ${model.company.supportEmail} | GSTIN: ${model.company.gstin || 'N/A'}`,
        margin,
        currentY
      );
      currentY += 5;

      // Divider Line
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margin, currentY, pageWidth - margin, currentY);
      currentY += 4;
    }

    // Helper: Draw Meta Box & Party Details (Only on Page 1)
    function drawMetaAndParties() {
      const boxHeight = 44;
      const colWidth = (contentWidth - 6) / 2;

      // Left Box: Invoice & Order Details
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, currentY, colWidth, boxHeight, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, currentY, colWidth, boxHeight, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      doc.text('INVOICE DETAILS', margin + 3, currentY + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);

      let rowY = currentY + 10;
      doc.text('Invoice Number:', margin + 3, rowY);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(model.invoiceNumber, margin + 28, rowY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);

      rowY += 4.5;
      doc.text('Invoice Date:', margin + 3, rowY);
      doc.text(model.formattedDate, margin + 28, rowY);

      rowY += 4.5;
      doc.text('Payment Status:', margin + 3, rowY);
      doc.text(model.paymentStatus, margin + 28, rowY);

      rowY += 4.5;
      if (model.references.originalInvoiceNumber) {
        doc.text('Orig Invoice:', margin + 3, rowY);
        doc.text(model.references.originalInvoiceNumber, margin + 28, rowY);
      } else if (model.documentType === 'TAX_INVOICE') {
        doc.text('Order Ref:', margin + 3, rowY);
        doc.text(model.references.sourceOrderId || 'Direct Wholesale', margin + 28, rowY);
      } else {
        doc.text('Vendor Bill Ref:', margin + 3, rowY);
        doc.text(model.references.supplierInvoiceNumber || '—', margin + 28, rowY);
      }

      rowY += 4.5;
      doc.text('Warehouse:', margin + 3, rowY);
      doc.text(model.warehouseId, margin + 28, rowY);

      // Right Box: Customer / Supplier Details
      const rightX = margin + colWidth + 6;
      doc.setFillColor(248, 250, 252);
      doc.rect(rightX, currentY, colWidth, boxHeight, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.rect(rightX, currentY, colWidth, boxHeight, 'S');

      const partyTitle = model.documentType === 'TAX_INVOICE' ? 'CUSTOMER / BILLED TO' : 'SUPPLIER / VENDOR';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      doc.text(partyTitle, rightX + 3, currentY + 5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(model.billingAddress.businessName || 'Party Name', rightX + 3, currentY + 10);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);

      let partyY = currentY + 14.5;
      doc.text(`Contact: ${model.billingAddress.contactName || '—'} (${model.billingAddress.mobile || '—'})`, rightX + 3, partyY);
      partyY += 4.5;

      const addressLine = `${model.billingAddress.fullAddress}, ${model.billingAddress.city} - ${model.billingAddress.pincode}`;
      const splitAddress = doc.splitTextToSize(addressLine, colWidth - 6);
      doc.text(splitAddress, rightX + 3, partyY);
      partyY += (splitAddress.length * 4);

      if (model.billingAddress.gstin) {
        doc.setFont('helvetica', 'bold');
        doc.text(`GSTIN: ${model.billingAddress.gstin}`, rightX + 3, partyY);
      }

      currentY += boxHeight + 6;
    }

    // Table Column Definitions
    const cols = [
      { header: '#', width: 8, align: 'center' },
      { header: 'Item Description & SKU', width: 66, align: 'left' },
      { header: 'Qty', width: 14, align: 'right' },
      { header: 'Unit Rate', width: 22, align: 'right' },
      { header: 'Discount', width: 18, align: 'right' },
      { header: 'Taxable', width: 22, align: 'right' },
      { header: 'Tax', width: 14, align: 'right' },
      { header: 'Total (INR)', width: 18, align: 'right' },
    ];

    function drawTableHeader() {
      doc.setFillColor(30, 41, 59); // Slate-800
      doc.rect(margin, currentY, contentWidth, 7, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);

      let x = margin;
      for (const col of cols) {
        if (col.align === 'center') {
          doc.text(col.header, x + col.width / 2, currentY + 4.8, { align: 'center' });
        } else if (col.align === 'right') {
          doc.text(col.header, x + col.width - 2, currentY + 4.8, { align: 'right' });
        } else {
          doc.text(col.header, x + 2, currentY + 4.8);
        }
        x += col.width;
      }
      currentY += 7;
    }

    // Page 1 Setup
    drawHeader(1, 1);
    drawMetaAndParties();
    drawTableHeader();

    // Render Table Items with Multi-Page Splitting
    let currentPage = 1;
    const maxY = pageHeight - 55; // reserve space for footer & totals

    for (let i = 0; i < model.items.length; i++) {
      const it = model.items[i];
      const rowHeight = 7.5;

      // Check if row exceeds printable height
      if (currentY + rowHeight > maxY) {
        // Add new page
        doc.addPage();
        currentPage++;
        currentY = margin;
        drawHeader(currentPage, currentPage);
        drawTableHeader();
      }

      // Zebra striping
      if (i % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, currentY, contentWidth, rowHeight, 'F');
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(30, 41, 59);

      let x = margin;
      // Col 0: Sr No
      doc.text(String(it.srNo), x + cols[0].width / 2, currentY + 4.8, { align: 'center' });
      x += cols[0].width;

      // Col 1: Product Name & SKU
      const title = it.productName.length > 34 ? it.productName.substring(0, 32) + '...' : it.productName;
      doc.text(title, x + 2, currentY + 3.5);
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text(`SKU: ${it.sku}`, x + 2, currentY + 6.3);
      doc.setFontSize(7.2);
      doc.setTextColor(30, 41, 59);
      x += cols[1].width;

      // Col 2: Qty
      doc.text(String(it.quantity), x + cols[2].width - 2, currentY + 4.8, { align: 'right' });
      x += cols[2].width;

      // Col 3: Unit Rate
      doc.text(it.unitPrice.toFixed(2), x + cols[3].width - 2, currentY + 4.8, { align: 'right' });
      x += cols[3].width;

      // Col 4: Discount
      doc.text(it.discount > 0 ? `-${it.discount.toFixed(2)}` : '0.00', x + cols[4].width - 2, currentY + 4.8, { align: 'right' });
      x += cols[4].width;

      // Col 5: Taxable
      doc.text(it.taxableAmount.toFixed(2), x + cols[5].width - 2, currentY + 4.8, { align: 'right' });
      x += cols[5].width;

      // Col 6: Tax
      doc.text(`${it.taxAmount.toFixed(2)} (${it.taxRate}%)`, x + cols[6].width - 2, currentY + 4.8, { align: 'right' });
      x += cols[6].width;

      // Col 7: Total
      doc.setFont('helvetica', 'bold');
      doc.text(it.lineTotal.toFixed(2), x + cols[7].width - 2, currentY + 4.8, { align: 'right' });
      doc.setFont('helvetica', 'normal');

      // Row underline
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.2);
      doc.line(margin, currentY + rowHeight, pageWidth - margin, currentY + rowHeight);

      currentY += rowHeight;
    }

    currentY += 4;

    // Check space for Summary Box (needs ~40mm)
    if (currentY + 42 > pageHeight - 20) {
      doc.addPage();
      currentPage++;
      currentY = margin;
      drawHeader(currentPage, currentPage);
    }

    // Totals & Words Layout
    const totalsBoxWidth = 75;
    const totalsX = pageWidth - margin - totalsBoxWidth;

    // Left side: Amount in words
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, currentY, totalsX - margin - 4, 30, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, currentY, totalsX - margin - 4, 30, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('AMOUNT IN WORDS:', margin + 3, currentY + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    const splitWords = doc.splitTextToSize(model.totals.amountInWords || 'Zero Rupees', totalsX - margin - 10);
    doc.text(splitWords, margin + 3, currentY + 11);

    if (model.accounting && !model.isCustomerFacing) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(245, 150, 0);
      doc.text(
        `ACCOUNTING: ${model.accounting.accountingStatus} | VOUCHER: ${model.accounting.voucherNumber || 'N/A'}`,
        margin + 3,
        currentY + 26
      );
    }

    // Right side: Financial Totals Table
    doc.setFillColor(248, 250, 252);
    doc.rect(totalsX, currentY, totalsBoxWidth, 30, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(totalsX, currentY, totalsBoxWidth, 30, 'S');

    let totY = currentY + 4.8;
    const drawTotLine = (label: string, val: string, isBold: boolean = false) => {
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(isBold ? 15 : 71, isBold ? 23 : 85, isBold ? 42 : 105);
      doc.text(label, totalsX + 3, totY);
      doc.text(val, pageWidth - margin - 3, totY, { align: 'right' });
      totY += 4.5;
    };

    drawTotLine('Subtotal:', formatPdfCurrency(model.totals.subtotal));
    drawTotLine('Discount Total:', `-${formatPdfCurrency(model.totals.discountTotal)}`);
    drawTotLine('Taxable Amount:', formatPdfCurrency(model.totals.taxableTotal));
    drawTotLine('Tax Total (GST):', formatPdfCurrency(model.totals.taxTotal));
    (doc as any).internal.write('% Tax Total (GST)');

    // Grand Total Highlight
    doc.setFillColor(254, 243, 199); // amber-100
    doc.rect(totalsX, totY - 3.5, totalsBoxWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(180, 83, 9); // amber-700
    doc.text('Grand Total (INR):', totalsX + 3, totY + 1.2);
    doc.text(formatPdfCurrency(model.totals.grandTotal), pageWidth - margin - 3, totY + 1.2, { align: 'right' });

    currentY += 34;

    // Footer & Terms: Render on ALL pages with accurate Page X of Y
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        'Terms & Conditions: 1. Goods once sold will not be returned unless damaged during fulfillment. 2. Subject to Delhi jurisdiction.',
        margin,
        pageHeight - 12
      );
      doc.text(
        'This is a computer-generated document. Authoritatively verified by MR FUTKAR Enterprise System.',
        margin,
        pageHeight - 8
      );
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
    }

    // Output raw PDF buffer
    const arrayBuffer = doc.output('arraybuffer');
    return Buffer.from(arrayBuffer);
  }
}
