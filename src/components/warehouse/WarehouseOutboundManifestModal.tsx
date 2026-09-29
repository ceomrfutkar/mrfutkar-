import React, { useState } from 'react';
import { WarehouseOrder } from '../../types/warehouse';
import {
  Printer,
  X,
  Truck,
  Building2,
  Calendar,
  Package,
  IndianRupee,
  MapPin,
  Phone,
  FileSpreadsheet,
  CheckCircle2,
} from 'lucide-react';

interface WarehouseOutboundManifestModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: WarehouseOrder[];
  warehouseId: string;
  warehouseName: string;
}

export const WarehouseOutboundManifestModal: React.FC<WarehouseOutboundManifestModalProps> = ({
  isOpen,
  onClose,
  orders,
  warehouseId,
  warehouseName,
}) => {
  // Extract distinct delivery partners present in active/dispatched orders
  const partnerMap = new Map<string, string>();
  orders.forEach(o => {
    const pId = o.delivery?.assignedPartnerId || o.deliveryPartnerId;
    const pName = o.delivery?.assignedPartnerName || o.deliveryPartnerName;
    if (pId && pName) {
      partnerMap.set(pId, pName);
    }
  });

  const availablePartners = Array.from(partnerMap.entries()).map(([id, name]) => ({ id, name }));
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>(
    availablePartners.length > 0 ? availablePartners[0].id : 'ALL'
  );

  if (!isOpen) return null;

  // Filter orders by selected partner or all dispatched/assigned orders
  const manifestOrders = orders.filter(o => {
    const isDispatchedOrReady = ['READY_FOR_DISPATCH', 'DISPATCHED', 'OUT_FOR_DELIVERY'].includes(o.orderStatus);
    if (!isDispatchedOrReady) return false;

    const pId = o.delivery?.assignedPartnerId || o.deliveryPartnerId;
    if (selectedPartnerId === 'ALL') return Boolean(pId);
    return pId === selectedPartnerId;
  });

  const selectedPartnerName = availablePartners.find(p => p.id === selectedPartnerId)?.name || 'All Active Fleet Partners';

  // Compute summary totals
  const totalConsignments = manifestOrders.length;
  const totalValuePaise = manifestOrders.reduce((acc, o) => acc + Math.round(Number(o.grandTotal || 0) * 100), 0);
  const totalCodPaise = manifestOrders
    .filter(o => (o.paymentMethod || 'COD') === 'COD')
    .reduce((acc, o) => acc + Math.round(Number(o.grandTotal || 0) * 100), 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Top Bar (Hidden on print) */}
        <div className="px-6 py-4 border-b border-stone-200 bg-stone-50 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-stone-900">Outbound Consignment Handover Manifest</h2>
              <p className="text-xs text-stone-500 font-mono">
                {warehouseName} • {warehouseId} (Operational Dispatch Manifest)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {availablePartners.length > 1 && (
              <select
                value={selectedPartnerId}
                onChange={e => setSelectedPartnerId(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-stone-300 text-xs font-bold text-stone-800 bg-white"
              >
                <option value="ALL">All Delivery Partners</option>
                {availablePartners.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 rounded-lg bg-stone-900 text-white font-bold text-xs flex items-center gap-1.5 hover:bg-stone-800 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Manifest</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Manifest Document Sheet */}
        <div className="p-8 overflow-y-auto flex-1 space-y-6 print:p-0 print:space-y-4">
          {/* Manifest Header */}
          <div className="border-b-2 border-stone-900 pb-4 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-stone-900">MR FUTKAR</span>
                <span className="text-xs px-2 py-0.5 rounded bg-teal-100 text-teal-800 font-bold border border-teal-200 font-mono">
                  {warehouseId}
                </span>
              </div>
              <p className="text-xs font-bold text-stone-700 mt-1">{warehouseName} — Brahmpuri & Karawal Nagar Corridor</p>
              <p className="text-[11px] text-stone-500">Outbound Consignment Handover Trip Sheet</p>
            </div>

            <div className="text-right text-xs text-stone-600 space-y-0.5 font-mono">
              <p><strong>Manifest Date:</strong> {new Date().toLocaleDateString('en-IN')}</p>
              <p><strong>Time:</strong> {new Date().toLocaleTimeString('en-IN')}</p>
              <p><strong>Fleet Executive:</strong> {selectedPartnerName}</p>
            </div>
          </div>

          {/* Consignments Table */}
          {manifestOrders.length === 0 ? (
            <div className="py-12 text-center text-stone-400 text-xs border border-dashed border-stone-300 rounded-xl">
              No consignments currently assigned or dispatched for the selected fleet partner.
            </div>
          ) : (
            <div className="border border-stone-300 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-100 border-b border-stone-300 text-[10px] font-black uppercase text-stone-700">
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3">Order ID</th>
                    <th className="py-2.5 px-3">Retailer & Destination</th>
                    <th className="py-2.5 px-3">Contact</th>
                    <th className="py-2.5 px-3 text-center">Boxes</th>
                    <th className="py-2.5 px-3">Payment</th>
                    <th className="py-2.5 px-3 text-right">Order Total</th>
                    <th className="py-2.5 px-3 text-right">COD Due</th>
                    <th className="py-2.5 px-3 text-center">Signature</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {manifestOrders.map((ord, idx) => {
                    const isCod = (ord.paymentMethod || 'COD') === 'COD';
                    const boxes = ord.packing?.numberOfPackages || 1;
                    const total = Number(ord.grandTotal || 0);
                    const codDue = isCod ? total : 0;

                    return (
                      <tr key={ord.orderId} className="hover:bg-stone-50/50">
                        <td className="py-3 px-3 text-center font-mono text-stone-500">{idx + 1}</td>
                        <td className="py-3 px-3 font-mono font-bold text-stone-900">{ord.orderId}</td>
                        <td className="py-3 px-3">
                          <p className="font-bold text-stone-900">{ord.shopName || ord.retailerName}</p>
                          <p className="text-[11px] text-stone-500 truncate max-w-xs">
                            {ord.deliveryAddress?.fullAddress || ord.deliveryAddress?.city || 'Brahmpuri'}
                          </p>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-stone-600">
                          {ord.deliveryAddress?.phone || '—'}
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-stone-800">{boxes}</td>
                        <td className="py-3 px-3 font-semibold">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${
                              isCod ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'
                            }`}
                          >
                            {isCod ? 'COD' : 'ONLINE'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-stone-900">
                          ₹{total.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-amber-900">
                          {codDue > 0 ? `₹${codDue.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="py-3 px-3 text-center border-l border-stone-200">
                          <div className="w-16 h-6 border-b border-stone-300 mx-auto"></div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Manifest Totals & Signatures */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Totals Summary */}
            <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 text-xs space-y-2">
              <h4 className="font-black text-stone-900 uppercase text-[11px] tracking-wider border-b border-stone-200 pb-1.5">
                Consignment Batch Summary
              </h4>
              <div className="flex justify-between text-stone-700">
                <span>Total Consignments:</span>
                <strong className="font-mono">{totalConsignments}</strong>
              </div>
              <div className="flex justify-between text-stone-700">
                <span>Total Consignment Value:</span>
                <strong className="font-mono">₹{(totalValuePaise / 100).toLocaleString('en-IN')}</strong>
              </div>
              <div className="flex justify-between text-amber-900 font-bold border-t border-stone-200 pt-1.5">
                <span>Total Expected COD Collection:</span>
                <strong className="font-mono text-sm">₹{(totalCodPaise / 100).toLocaleString('en-IN')}</strong>
              </div>
            </div>

            {/* Handover Signatures */}
            <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 text-xs space-y-4">
              <h4 className="font-black text-stone-900 uppercase text-[11px] tracking-wider border-b border-stone-200 pb-1.5">
                Outbound Handover Verification
              </h4>
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="space-y-6">
                  <div className="border-b border-stone-400 h-8"></div>
                  <div>
                    <p className="font-bold text-stone-800">Warehouse Dispatcher</p>
                    <p className="text-[10px] text-stone-500">Sign & Stamp</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="border-b border-stone-400 h-8"></div>
                  <div>
                    <p className="font-bold text-stone-800">{selectedPartnerName}</p>
                    <p className="text-[10px] text-stone-500">Delivery Fleet Partner</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Operational Footnote */}
          <p className="text-[10px] text-stone-400 text-center pt-2">
            Operational trip sheet only. Stock decremented at order placement. Zero second inventory deduction.
          </p>
        </div>
      </div>
    </div>
  );
};
