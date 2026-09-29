import React, { useState, useEffect, useCallback } from 'react';
import { WarehouseClient } from '../../services/warehouseClient';
import { CODHandoverRecord } from '../../types/delivery';
import {
  IndianRupee,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RotateCw,
  Building2,
  Send,
  Loader2,
  User,
  Package,
} from 'lucide-react';

export const WarehouseCodHandoverQueue: React.FC = () => {
  const [handovers, setHandovers] = useState<CODHandoverRecord[]>([]);
  const [warehouseCustodyRupees, setWarehouseCustodyRupees] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED'>('ALL');

  // Accept Modal State
  const [acceptingHandover, setAcceptingHandover] = useState<CODHandoverRecord | null>(null);
  const [receivedAmountRupees, setReceivedAmountRupees] = useState<string>('');
  const [acceptNotes, setAcceptNotes] = useState<string>('');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Reject Modal State
  const [rejectingHandover, setRejectingHandover] = useState<CODHandoverRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [handoverList, custodyRes] = await Promise.all([
        WarehouseClient.getCodHandovers().catch(() => []),
        WarehouseClient.getWarehouseCashCustody().catch(() => ({ cashBalanceRupees: 0 })),
      ]);
      setHandovers(handoverList || []);
      setWarehouseCustodyRupees(custodyRes?.cashBalanceRupees || 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenAccept = (h: CODHandoverRecord) => {
    setAcceptingHandover(h);
    setReceivedAmountRupees(String((h.requestedAmountPaise || 0) / 100));
    setAcceptNotes('');
    setFeedback(null);
  };

  const handleOpenReject = (h: CODHandoverRecord) => {
    setRejectingHandover(h);
    setRejectionReason('');
    setFeedback(null);
  };

  const handleConfirmAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptingHandover) return;

    const parsed = parseFloat(receivedAmountRupees);
    if (isNaN(parsed) || parsed < 0) {
      setFeedback({ type: 'error', message: 'Please enter a valid non-negative received amount.' });
      return;
    }

    const receivedAmountPaise = Math.round(parsed * 100);
    setSubmittingAction(true);
    setFeedback(null);

    try {
      const res = await WarehouseClient.acceptCodHandover(
        acceptingHandover.handoverId,
        receivedAmountPaise,
        acceptNotes.trim() || undefined
      );

      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Handover ${acceptingHandover.handoverId} accepted successfully into WH-BRAHMPURI-01 custody.`,
        });
        setAcceptingHandover(null);
        await fetchData();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to accept handover.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Acceptance failed.' });
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingHandover) return;

    setSubmittingAction(true);
    setFeedback(null);

    try {
      const res = await WarehouseClient.rejectCodHandover(
        rejectingHandover.handoverId,
        rejectionReason.trim() || undefined
      );

      if (res.success) {
        setFeedback({
          type: 'success',
          message: `Handover ${rejectingHandover.handoverId} rejected successfully.`,
        });
        setRejectingHandover(null);
        await fetchData();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to reject handover.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Rejection failed.' });
    } finally {
      setSubmittingAction(false);
    }
  };

  const filteredHandovers = handovers.filter(h => {
    if (filter === 'ALL') return true;
    return h.status === filter;
  });

  const pendingCount = handovers.filter(h => h.status === 'SUBMITTED').length;

  return (
    <div className="space-y-4">
      {/* Top Banner & Custody Card */}
      <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black tracking-widest text-amber-600 uppercase">
              OPERATIONAL CASH CUSTODY
            </span>
            <span className="text-stone-300">•</span>
            <span className="text-xs font-mono text-stone-500 font-bold">WH-BRAHMPURI-01</span>
          </div>
          <h2 className="text-xl font-black text-stone-900 mt-0.5">
            COD Cash Handover Queue
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Verify actual cash counts from delivery fleet employees before transferring into hub custody.
          </p>
        </div>

        <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 flex items-center gap-4 self-stretch sm:self-auto">
          <div>
            <div className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
              Warehouse Cash Balance
            </div>
            <div className="text-2xl font-black text-stone-900 font-mono mt-0.5">
              ₹{warehouseCustodyRupees.toLocaleString('en-IN')}
            </div>
            <div className="text-[10px] text-stone-500 mt-0.5">Physical cash at Brahmpuri hub</div>
          </div>
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 cursor-pointer disabled:opacity-50"
            title="Refresh handovers"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-stone-400 hover:text-stone-600 text-xs px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-stone-200 pb-2">
        {(['ALL', 'SUBMITTED', 'ACCEPTED', 'REJECTED'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setFilter(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filter === tab
                ? 'bg-stone-900 text-white'
                : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            <span>{tab === 'ALL' ? 'All Handovers' : tab}</span>
            {tab === 'SUBMITTED' && pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-500 text-stone-950">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Handovers List */}
      {filteredHandovers.length === 0 ? (
        <div className="bg-white border border-dashed border-stone-200 rounded-2xl p-10 text-center space-y-1">
          <Clock className="w-8 h-8 text-stone-300 mx-auto" />
          <p className="text-xs font-bold text-stone-600">No handovers found</p>
          <p className="text-[11px] text-stone-400">
            {filter === 'SUBMITTED'
              ? 'No pending cash handover requests from delivery employees.'
              : 'No matching handover records in this category.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredHandovers.map(h => {
            const reqRupees = (h.requestedAmountPaise || 0) / 100;
            const accRupees = h.acceptedAmountPaise !== null ? h.acceptedAmountPaise / 100 : null;
            const discRupees = (h.discrepancyAmountPaise || 0) / 100;

            return (
              <div
                key={h.handoverId}
                className="bg-white border border-stone-200 rounded-xl p-4 shadow-xs space-y-3"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-2.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-stone-100 text-stone-700 flex items-center justify-center font-bold">
                      <User className="w-4 h-4 text-stone-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-xs text-stone-900">
                          {h.deliveryPartnerName || h.deliveryPartnerId}
                        </span>
                        <span className="font-mono text-[10px] text-stone-400">
                          ({h.deliveryPartnerId})
                        </span>
                      </div>
                      <div className="text-[10px] text-stone-500 font-mono mt-0.5">
                        ID: {h.handoverId} • Submitted:{' '}
                        {new Date(h.submittedAt).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        ({new Date(h.submittedAt).toLocaleDateString('en-IN')})
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="self-start sm:self-auto">
                    {h.status === 'SUBMITTED' && (
                      <span className="px-2.5 py-1 rounded-md text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-600" />
                        <span>AWAITING VERIFICATION</span>
                      </span>
                    )}
                    {h.status === 'ACCEPTED' && (
                      <span className="px-2.5 py-1 rounded-md text-[11px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>ACCEPTED</span>
                      </span>
                    )}
                    {h.status === 'REJECTED' && (
                      <span className="px-2.5 py-1 rounded-md text-[11px] font-black bg-rose-100 text-rose-900 border border-rose-300 flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-rose-600" />
                        <span>REJECTED</span>
                      </span>
                    )}
                    {h.status === 'CANCELLED' && (
                      <span className="px-2.5 py-1 rounded-md text-[11px] font-black bg-stone-100 text-stone-700">
                        CANCELLED BY FLEET
                      </span>
                    )}
                  </div>
                </div>

                {/* Amounts & Details Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-stone-50 rounded-lg p-2.5 border border-stone-100">
                    <span className="text-[10px] uppercase font-bold text-stone-400">
                      Requested Handover Amount
                    </span>
                    <div className="text-base font-black text-stone-900 font-mono mt-0.5">
                      ₹{reqRupees.toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div className="bg-stone-50 rounded-lg p-2.5 border border-stone-100">
                    <span className="text-[10px] uppercase font-bold text-stone-400">
                      Accepted Hub Amount
                    </span>
                    <div className="text-base font-black text-stone-900 font-mono mt-0.5">
                      {accRupees !== null ? (
                        <span className="text-emerald-700">₹{accRupees.toLocaleString('en-IN')}</span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </div>
                  </div>

                  <div className="bg-stone-50 rounded-lg p-2.5 border border-stone-100">
                    <span className="text-[10px] uppercase font-bold text-stone-400">
                      Related Collections / Orders
                    </span>
                    <div className="text-[11px] text-stone-700 font-mono mt-0.5 truncate">
                      {h.orderIds && h.orderIds.length > 0
                        ? h.orderIds.join(', ')
                        : `${h.collectionIds?.length || 0} collection(s)`}
                    </div>
                  </div>
                </div>

                {/* Discrepancy Note */}
                {h.status === 'ACCEPTED' && discRupees > 0 && (
                  <div className="bg-amber-50 border border-amber-300 rounded-lg p-2.5 text-xs text-amber-900 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      <strong>Discrepancy of ₹{discRupees.toLocaleString('en-IN')} flagged:</strong> Delivery
                      employee submitted ₹{reqRupees.toLocaleString('en-IN')} but actual verified cash was
                      ₹{accRupees?.toLocaleString('en-IN')}. Shortage of ₹{discRupees.toLocaleString('en-IN')} remains
                      with employee. Zero automatic accounting write-off.
                    </span>
                  </div>
                )}

                {/* Rejection Note */}
                {h.status === 'REJECTED' && (
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-xs text-rose-800">
                    <strong>Rejection Reason:</strong> {h.rejectionReason || 'Rejected by warehouse'}
                  </div>
                )}

                {/* Optional Notes */}
                {h.notes && (
                  <div className="text-[11px] text-stone-500 italic">
                    Notes: {h.notes}
                  </div>
                )}

                {/* Actions for SUBMITTED handovers */}
                {h.status === 'SUBMITTED' && (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                    <button
                      type="button"
                      onClick={() => handleOpenReject(h)}
                      className="px-3.5 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold cursor-pointer transition-all"
                    >
                      Reject Handover
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenAccept(h)}
                      className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Confirm Receipt</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm Receipt & Physical Count Modal */}
      {acceptingHandover && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <h3 className="text-base font-black text-stone-900">
                  Verify Physical Cash Handover
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAcceptingHandover(null)}
                className="text-stone-400 hover:text-stone-600 text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmAccept} className="space-y-3.5 text-xs">
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 space-y-1">
                <div className="flex justify-between">
                  <span className="text-stone-500">Delivery Employee:</span>
                  <strong className="text-stone-900">
                    {acceptingHandover.deliveryPartnerName || acceptingHandover.deliveryPartnerId}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Requested Amount:</span>
                  <strong className="text-stone-900 font-mono">
                    ₹{((acceptingHandover.requestedAmountPaise || 0) / 100).toLocaleString('en-IN')}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Receiving Destination:</span>
                  <strong className="text-amber-700 font-mono">WH-BRAHMPURI-01</strong>
                </div>
              </div>

              {/* Actual Received Input */}
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Actual Physical Cash Received (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-stone-400 font-bold text-sm">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={(acceptingHandover.requestedAmountPaise || 0) / 100}
                    value={receivedAmountRupees}
                    onChange={e => setReceivedAmountRupees(e.target.value)}
                    required
                    className="w-full pl-7 pr-3 py-2 text-sm font-bold font-mono border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Live Discrepancy Preview */}
              {(() => {
                const req = (acceptingHandover.requestedAmountPaise || 0) / 100;
                const rec = parseFloat(receivedAmountRupees) || 0;
                const diff = req - rec;

                if (diff > 0) {
                  return (
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-amber-900 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Discrepancy: Short by ₹{diff.toLocaleString('en-IN')}</span>
                      </div>
                      <p className="text-[11px] text-amber-800">
                        Delivery partner custody will ONLY be decreased by ₹{rec.toLocaleString('en-IN')}. The
                        unaccepted shortage (₹{diff.toLocaleString('en-IN')}) will remain with the employee. No
                        automatic write-off or GL entry will occur.
                      </p>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Optional Notes */}
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Verification Notes (Optional)
                </label>
                <input
                  type="text"
                  value={acceptNotes}
                  onChange={e => setAcceptNotes(e.target.value)}
                  placeholder="e.g., Physical notes counted and verified at Cash Desk 1"
                  maxLength={150}
                  className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setAcceptingHandover(null)}
                  disabled={submittingAction}
                  className="px-4 py-2 rounded-xl border border-stone-200 text-xs font-bold text-stone-600 hover:bg-stone-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {submittingAction ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>Confirm Custody Transfer</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Handover Modal */}
      {rejectingHandover && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-600" />
                <h3 className="text-base font-black text-stone-900">
                  Reject COD Cash Handover
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRejectingHandover(null)}
                className="text-stone-400 hover:text-stone-600 text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmReject} className="space-y-3.5 text-xs">
              <p className="text-stone-600">
                Are you sure you want to reject the handover request of{' '}
                <strong className="font-mono text-stone-900">
                  ₹{((rejectingHandover.requestedAmountPaise || 0) / 100).toLocaleString('en-IN')}
                </strong>{' '}
                from{' '}
                <strong>
                  {rejectingHandover.deliveryPartnerName || rejectingHandover.deliveryPartnerId}
                </strong>
                ? No cash custody transfer will take place.
              </p>

              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Rejection Reason
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  placeholder="e.g., Physical cash not presented, severe note damage, or employee absent"
                  rows={3}
                  required
                  className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setRejectingHandover(null)}
                  disabled={submittingAction}
                  className="px-4 py-2 rounded-xl border border-stone-200 text-xs font-bold text-stone-600 hover:bg-stone-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {submittingAction ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  <span>Confirm Rejection</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
