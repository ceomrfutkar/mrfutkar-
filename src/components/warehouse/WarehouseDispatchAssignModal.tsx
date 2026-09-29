import React, { useState, useEffect } from 'react';
import { WarehouseOrder } from '../../types/warehouse';
import { WarehouseClient } from '../../services/warehouseClient';
import {
  Truck,
  X,
  UserCheck,
  AlertCircle,
  CheckCircle2,
  Package,
  MapPin,
  Phone,
  IndianRupee,
  RefreshCw,
  Send,
  Boxes,
  ShieldCheck,
} from 'lucide-react';

interface WarehouseDispatchAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: WarehouseOrder | null;
  onSuccess: (result: any) => void;
}

export const WarehouseDispatchAssignModal: React.FC<WarehouseDispatchAssignModalProps> = ({
  isOpen,
  onClose,
  order,
  onSuccess,
}) => {
  const [partners, setPartners] = useState<any[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [moveToDispatched, setMoveToDispatched] = useState<boolean>(true);
  const [isLoadingPartners, setIsLoadingPartners] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSelectedPartnerId(order?.delivery?.assignedPartnerId || order?.deliveryPartnerId || '');
      loadEligiblePartners();
    }
  }, [isOpen, order]);

  const loadEligiblePartners = async () => {
    setIsLoadingPartners(true);
    setError(null);
    try {
      const list = await WarehouseClient.getDeliveryPartners();
      setPartners(list || []);
      // If none selected yet and partners exist, preselect first available partner
      if (!selectedPartnerId && list && list.length > 0) {
        const available = list.find((p: any) => p.availabilityStatus === 'AVAILABLE') || list[0];
        setSelectedPartnerId(available.partnerId);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load delivery partners for WH-BRAHMPURI-01.');
    } finally {
      setIsLoadingPartners(false);
    }
  };

  if (!isOpen || !order) return null;

  const orderId = order.orderId;
  const isCod = (order.paymentMethod || 'COD') === 'COD';
  const pkgCount = order.packing?.numberOfPackages || 1;
  const boxType = order.packing?.boxType || 'Standard Carton';

  const handleAssign = async () => {
    if (!selectedPartnerId) {
      setError('Please select a delivery partner for consignment dispatch.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await WarehouseClient.assignDeliveryPartner(orderId, selectedPartnerId, moveToDispatched);
      onSuccess(res);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to assign consignment to delivery partner.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-stone-200 bg-stone-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-stone-900">Assign Consignment to Fleet Partner</h2>
              <p className="text-xs text-stone-500 font-mono">
                Order #{orderId} • WH-BRAHMPURI-01 Outbound Bay
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <div>
                <p className="font-bold">Assignment Rejection</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Consignment Order Snapshot Summary */}
          <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">Retailer & Destination</span>
                <p className="text-sm font-black text-stone-900 mt-0.5">{order.shopName || order.retailerName}</p>
                <p className="text-xs text-stone-600 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  <span>{order.deliveryAddress?.fullAddress || order.deliveryAddress?.city || 'Brahmpuri & Karawal Nagar Corridor'}</span>
                </p>
                {order.deliveryAddress?.phone && (
                  <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5 font-mono">
                    <Phone className="w-3 h-3 text-stone-400 shrink-0" />
                    <span>{order.deliveryAddress.phone}</span>
                  </p>
                )}
              </div>

              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">Order Value</span>
                <span className="text-base font-black text-stone-900 font-mono block">
                  ₹{(order.grandTotal || 0).toLocaleString('en-IN')}
                </span>
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider mt-1 ${
                    isCod
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                  }`}
                >
                  {isCod ? 'Cash on Delivery (COD)' : 'Prepaid / Online'}
                </span>
              </div>
            </div>

            <div className="pt-2.5 border-t border-stone-200/80 flex items-center justify-between text-xs text-stone-600">
              <span className="flex items-center gap-1.5">
                <Boxes className="w-3.5 h-3.5 text-stone-500" />
                <span>Consignment: <strong>{pkgCount}</strong> Box(es) ({boxType})</span>
              </span>
              <span>SKUs: <strong>{(order.items || []).length}</strong> items</span>
            </div>
          </div>

          {/* Delivery Partner Selection List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-teal-600" />
                <span>Select On-Duty Delivery Partner (Brahmpuri Fleet)</span>
              </label>
              <button
                type="button"
                onClick={loadEligiblePartners}
                disabled={isLoadingPartners}
                className="text-[11px] font-bold text-stone-500 hover:text-stone-800 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingPartners ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {isLoadingPartners ? (
              <div className="py-8 text-center text-stone-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
                <span>Loading eligible fleet partners...</span>
              </div>
            ) : partners.length === 0 ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-center text-amber-900 text-xs">
                No active delivery partners currently registered for WH-BRAHMPURI-01. Please activate a delivery partner in Admin Console.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {partners.map(p => {
                  const isSelected = selectedPartnerId === p.partnerId;
                  const isAvailable = p.availabilityStatus === 'AVAILABLE';

                  return (
                    <div
                      key={p.partnerId}
                      onClick={() => setSelectedPartnerId(p.partnerId)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-teal-600 bg-teal-50/50 shadow-xs ring-1 ring-teal-500'
                          : 'border-stone-200 hover:border-stone-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isSelected ? 'border-teal-600 bg-teal-600' : 'border-stone-300 bg-white'
                          }`}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-stone-900">{p.name}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                isAvailable
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-blue-100 text-blue-800 border border-blue-200'
                              }`}
                            >
                              {p.availabilityStatus}
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-500 font-mono mt-0.5">
                            {p.mobile} • {p.vehicleType || 'TATA_ACE'} ({p.vehicleNumber || 'Unassigned'})
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-stone-400 font-bold block">Corridor</span>
                        <span className="text-[10px] font-bold text-stone-700">
                          {(p.serviceAreas || ['Brahmpuri', 'Karawal Nagar']).join(', ')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Outbound Release Toggle */}
          <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-stone-900">Outbound Dispatch Release</p>
              <p className="text-[11px] text-stone-500">
                Immediately release consignment from dispatch bay and transition order status to <strong>DISPATCHED</strong>.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={moveToDispatched}
                onChange={e => setMoveToDispatched(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-stone-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
            </label>
          </div>

          {/* Compliance & Zero Accounting / Inventory side-effects notice */}
          <div className="p-3 bg-stone-100/70 rounded-xl border border-stone-200/80 text-[11px] text-stone-600 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
            <p>
              Operational consignment assignment only. Inventory deduction occurred upon order confirmation. Zero second stock decrement. Zero double-entry accounting mutations.
            </p>
          </div>
        </div>

        {/* Modal Actions Footer */}
        <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-100 font-bold text-xs transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleAssign}
            disabled={isSubmitting || !selectedPartnerId || isLoadingPartners}
            className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-stone-300 text-white font-bold text-xs shadow-md shadow-teal-600/20 flex items-center gap-2 transition-all cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Assigning Consignment...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Confirm Consignment Handover</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
