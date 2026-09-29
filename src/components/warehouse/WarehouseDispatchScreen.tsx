import React, { useState } from 'react';
import { useWarehouse } from '../../context/WarehouseContext';
import { WarehouseOrder } from '../../types/warehouse';
import { WarehouseDispatchAssignModal } from './WarehouseDispatchAssignModal';
import { WarehouseOutboundManifestModal } from './WarehouseOutboundManifestModal';
import {
  Truck,
  PackageCheck,
  CheckCircle2,
  MapPin,
  Phone,
  Building2,
  Send,
  Boxes,
  Clock,
  Layers,
  UserCheck,
  FileSpreadsheet,
  AlertCircle,
  RotateCw,
} from 'lucide-react';

export const WarehouseDispatchScreen: React.FC = () => {
  const {
    orders,
    transitionOrderStatus,
    selectOrder,
    warehouseId,
    warehouseName,
    isLoading,
    refreshOrders,
  } = useWarehouse();

  // Modal States
  const [assignModalOpen, setAssignModalOpen] = useState<boolean>(false);
  const [selectedOrderForAssign, setSelectedOrderForAssign] = useState<WarehouseOrder | null>(null);
  const [manifestModalOpen, setManifestModalOpen] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter orders that are packed, ready for dispatch, or dispatched
  const dispatchOrders = orders.filter(o =>
    ['PACKED', 'READY_FOR_DISPATCH', 'DISPATCHED'].includes(o.orderStatus)
  );

  const handleStageForDispatch = async (orderId: string) => {
    await transitionOrderStatus(
      orderId,
      'READY_FOR_DISPATCH',
      'Consignment inspected, packed and staged in Dispatch Bay'
    );
  };

  const handleDispatchOrder = async (orderId: string) => {
    await transitionOrderStatus(
      orderId,
      'DISPATCHED',
      'Consignment manifested and released from WH-BRAHMPURI-01 Dispatch Bay'
    );
  };

  const handleDeliverOrder = async (orderId: string) => {
    await transitionOrderStatus(
      orderId,
      'DELIVERED',
      'Delivered & verified by retailer signature'
    );
  };

  const openAssignModal = (order: WarehouseOrder) => {
    setSelectedOrderForAssign(order);
    setAssignModalOpen(true);
  };

  const handleAssignSuccess = (res: any) => {
    const partnerName = res.data?.delivery?.assignedPartnerName || res.data?.deliveryPartnerName || 'Fleet Partner';
    setSuccessMessage(`Order #${res.data?.orderId} successfully assigned to ${partnerName}.`);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-stone-900">Warehouse Outbound & Dispatch Staging Bay</h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-teal-100 text-teal-800 font-bold">
              {warehouseId}
            </span>
          </div>
          <p className="text-xs text-stone-500">
            Consignment staging manifest & dispatch queue for {warehouseName} ({dispatchOrders.length} active consignments)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setManifestModalOpen(true)}
            className="px-3 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-teal-400" />
            <span>Outbound Trip Manifest</span>
          </button>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 bg-stone-50 p-2 rounded-lg border border-stone-200">
            <Truck className="w-4 h-4 text-teal-600" />
            <span>Brahmpuri & Karawal Nagar Corridor</span>
          </div>
        </div>
      </div>

      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs font-bold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Orders Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {dispatchOrders.length === 0 ? (
          <div className="col-span-2 bg-white p-12 rounded-xl border border-stone-200 text-center text-stone-500 text-xs">
            No orders currently staged in Dispatch Bay. Pack orders to ready them for dispatch.
          </div>
        ) : (
          dispatchOrders.map(order => {
            const isKarawal = (order.deliveryAddress?.fullAddress || '').toLowerCase().includes('karawal');
            const pkgCount = order.packing?.numberOfPackages || 1;
            const boxType = order.packing?.boxType || 'Standard Corrugated Carton';
            const assignedPartner = order.delivery?.assignedPartnerName || order.deliveryPartnerName;
            const assignedPartnerMobile = order.delivery?.assignedPartnerMobile;
            const assignedStatus = order.delivery?.assignmentStatus;

            return (
              <div
                key={order.orderId}
                className="bg-white rounded-xl border border-stone-200 shadow-xs p-5 space-y-4 flex flex-col justify-between"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 border-b border-stone-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-stone-900 text-sm">{order.orderId}</span>
                      <span
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                          order.orderStatus === 'DISPATCHED'
                            ? 'bg-cyan-100 text-cyan-800'
                            : order.orderStatus === 'READY_FOR_DISPATCH'
                            ? 'bg-teal-100 text-teal-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {order.orderStatus}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-stone-800 mt-1">{order.shopName || order.retailerName}</p>
                    <p className="text-[11px] text-stone-500 flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {order.deliveryAddress?.phone || 'No phone'}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-black text-stone-900 font-mono block">
                      ₹{(order.grandTotal || 0).toLocaleString('en-IN')}
                    </span>
                    <span className="text-[10px] text-stone-500">{(order.items || []).length} SKUs</span>
                  </div>
                </div>

                {/* Staging & Package details */}
                <div className="grid grid-cols-2 gap-2 text-xs bg-stone-50 p-3 rounded-lg border border-stone-200/70">
                  <div>
                    <span className="text-[10px] uppercase text-stone-400 font-bold block">Delivery Corridor</span>
                    <div className="flex items-center gap-1 font-semibold text-stone-800 mt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-stone-500" />
                      <span>{order.deliveryAddress?.city || 'Brahmpuri'}</span>
                      {isKarawal && (
                        <span className="text-[9px] bg-amber-100 text-amber-900 px-1 py-0.2 rounded font-bold">
                          Karawal Ngr
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase text-stone-400 font-bold block">Consignment Packaging</span>
                    <p className="font-semibold text-stone-800 mt-0.5">
                      {pkgCount} Box(es) • <span className="text-stone-500 font-normal">{boxType}</span>
                    </p>
                  </div>
                </div>

                {/* Phase 6 Part 5: Authoritative Delivery Partner Assignment State */}
                {assignedPartner ? (
                  <div className="text-xs bg-teal-50 p-3 rounded-lg border border-teal-200 text-teal-950 flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 font-bold text-teal-900">
                        <UserCheck className="w-4 h-4 text-teal-700" />
                        <span>Assigned to: {assignedPartner}</span>
                      </div>
                      <p className="text-[11px] text-teal-700 font-mono">
                        {assignedPartnerMobile ? `Mobile: ${assignedPartnerMobile}` : 'On-Duty Fleet Partner'}
                        {assignedStatus && ` • Status: ${assignedStatus}`}
                      </p>
                    </div>

                    {order.orderStatus !== 'DISPATCHED' && (
                      <button
                        type="button"
                        onClick={() => openAssignModal(order)}
                        className="text-[11px] font-bold text-teal-700 hover:text-teal-900 underline cursor-pointer"
                      >
                        Reassign
                      </button>
                    )}
                  </div>
                ) : order.orderStatus === 'READY_FOR_DISPATCH' ? (
                  <div className="text-xs bg-amber-50 p-3 rounded-lg border border-amber-200 text-amber-950 flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900">
                        <Boxes className="w-3.5 h-3.5 text-amber-700" />
                        <span>Staged in Outbound Bay — Awaiting Driver</span>
                      </div>
                      <p className="text-[11px] text-amber-800">
                        Consignment packed & sealed. Assign delivery employee to initiate transit.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => openAssignModal(order)}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Assign Partner</span>
                    </button>
                  </div>
                ) : null}

                {order.orderStatus === 'DISPATCHED' && (
                  <div className="text-xs bg-cyan-50 p-2.5 rounded-lg border border-cyan-200 text-cyan-900 flex items-center justify-between">
                    <span className="font-semibold">Outbound Consignment Released</span>
                    <span className="text-[10px] font-mono text-cyan-700">En route with {assignedPartner || 'Driver'}</span>
                  </div>
                )}

                {/* Actions Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={() => selectOrder(order.orderId, 'ORDER_DETAIL')}
                    className="text-xs text-stone-600 hover:text-stone-900 font-bold cursor-pointer"
                  >
                    View Manifest →
                  </button>

                  <div className="flex items-center gap-2">
                    {order.orderStatus === 'PACKED' && (
                      <button
                        type="button"
                        onClick={() => handleStageForDispatch(order.orderId)}
                        disabled={isLoading}
                        className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        Stage for Dispatch
                      </button>
                    )}

                    {order.orderStatus === 'READY_FOR_DISPATCH' && (
                      <>
                        {!assignedPartner ? (
                          <button
                            type="button"
                            onClick={() => openAssignModal(order)}
                            disabled={isLoading}
                            className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Assign Partner</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDispatchOrder(order.orderId)}
                            disabled={isLoading}
                            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                            title="Release consignment from outbound bay"
                          >
                            <Send className="w-3 h-3" />
                            <span>Release Consignment</span>
                          </button>
                        )}
                      </>
                    )}

                    {order.orderStatus === 'DISPATCHED' && (
                      <button
                        type="button"
                        onClick={() => handleDeliverOrder(order.orderId)}
                        disabled={isLoading}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Confirm Delivered</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Assignment Modal */}
      <WarehouseDispatchAssignModal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        order={selectedOrderForAssign}
        onSuccess={handleAssignSuccess}
      />

      {/* Outbound Trip Manifest Modal */}
      <WarehouseOutboundManifestModal
        isOpen={manifestModalOpen}
        onClose={() => setManifestModalOpen(false)}
        orders={orders}
        warehouseId={warehouseId}
        warehouseName={warehouseName}
      />
    </div>
  );
};

