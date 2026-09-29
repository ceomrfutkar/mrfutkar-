import React, { useState, useEffect, useCallback } from 'react';
import { DeliveryClient } from '../../services/deliveryClient';
import { CODCollectionRecord, CODHandoverRecord, CODHandoverDestinationType } from '../../types/delivery';
import {
  IndianRupee,
  Send,
  Building2,
  Shield,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  RotateCw,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export const DeliveryCodHandoverSection: React.FC = () => {
  const [cashCustodyRupees, setCashCustodyRupees] = useState<number>(0);
  const [eligibleCollections, setEligibleCollections] = useState<CODCollectionRecord[]>([]);
  const [handovers, setHandovers] = useState<CODHandoverRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form State
  const [destinationType, setDestinationType] = useState<CODHandoverDestinationType>('WAREHOUSE');
  const [amountRupees, setAmountRupees] = useState<string>('');
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [custodyRes, collections, handoverList] = await Promise.all([
        DeliveryClient.getCashCustody().catch(() => ({ cashBalanceRupees: 0 })),
        DeliveryClient.getEligibleCollections().catch(() => []),
        DeliveryClient.getPartnerHandovers().catch(() => []),
      ]);

      setCashCustodyRupees(custodyRes?.cashBalanceRupees || 0);
      setEligibleCollections(collections || []);
      setHandovers(handoverList || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Compute available unhanded cash from eligible collections or custody
  const availableEligibleRupees = eligibleCollections.reduce(
    (sum, c) => sum + (c.amountCollectedPaise || 0) / 100,
    0
  );
  // Authoritative operational cap is custody balance
  const availableForHandoverRupees = Math.min(cashCustodyRupees, availableEligibleRupees > 0 ? availableEligibleRupees : cashCustodyRupees);

  const handleOpenCreate = () => {
    setAmountRupees(availableForHandoverRupees > 0 ? String(availableForHandoverRupees) : '');
    setSelectedCollectionIds(eligibleCollections.map(c => c.collectionId));
    setNotes('');
    setFeedback(null);
    setShowCreateModal(true);
  };

  const handleToggleCollection = (id: string, amountRps: number) => {
    let next: string[];
    if (selectedCollectionIds.includes(id)) {
      next = selectedCollectionIds.filter(c => c !== id);
    } else {
      next = [...selectedCollectionIds, id];
    }
    setSelectedCollectionIds(next);

    // Sum selected
    const sum = eligibleCollections
      .filter(c => next.includes(c.collectionId))
      .reduce((acc, c) => acc + (c.amountCollectedPaise || 0) / 100, 0);
    setAmountRupees(String(sum));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amountRupees);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFeedback({ type: 'error', message: 'Please enter a valid positive handover amount.' });
      return;
    }

    const requestedAmountPaise = Math.round(parsedAmount * 100);
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await DeliveryClient.submitCodHandover({
        destinationType,
        requestedAmountPaise,
        collectionIds: selectedCollectionIds.length > 0 ? selectedCollectionIds : undefined,
        notes: notes.trim() || undefined,
      });

      if (res.success) {
        setFeedback({
          type: 'success',
          message: `Handover request of ₹${parsedAmount.toLocaleString('en-IN')} submitted successfully to ${destinationType}.`,
        });
        setShowCreateModal(false);
        await fetchData();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to submit handover request.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Submission failed.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelHandover = async (handoverId: string) => {
    if (!confirm('Are you sure you want to cancel this pending handover request?')) return;
    try {
      const res = await DeliveryClient.cancelCodHandover(handoverId);
      if (res.success) {
        setFeedback({ type: 'success', message: 'Handover request cancelled.' });
        await fetchData();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to cancel handover.' });
    }
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm space-y-4">
      {/* Header & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
            <IndianRupee className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-black text-stone-900 tracking-tight uppercase">
              COD Cash Handover & Custody
            </h2>
            <p className="text-[11px] text-stone-500">
              Operational physical cash transfer to Warehouse or Admin
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="p-1.5 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 cursor-pointer disabled:opacity-50"
            title="Refresh handovers"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-600' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            disabled={availableForHandoverRupees <= 0}
            className="px-3.5 py-1.5 rounded-lg bg-[#0d1d25] hover:bg-stone-800 text-[#f5b024] text-xs font-black tracking-wide uppercase flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-3 h-3" />
            <span>Create Handover</span>
          </button>
        </div>
      </div>

      {/* Custody & Available Bento */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
          <div className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
            Cash in Custody
          </div>
          <div className="text-xl font-black text-stone-900 font-mono mt-0.5">
            ₹{cashCustodyRupees.toLocaleString('en-IN')}
          </div>
          <div className="text-[10px] text-stone-500 mt-0.5">Operational physical cash held</div>
        </div>

        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3">
          <div className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">
            Available for Handover
          </div>
          <div className="text-xl font-black text-amber-950 font-mono mt-0.5">
            ₹{availableForHandoverRupees.toLocaleString('en-IN')}
          </div>
          <div className="text-[10px] text-amber-700 mt-0.5">
            {eligibleCollections.length} cash collection(s) ready
          </div>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between border ${
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
            className="text-stone-400 hover:text-stone-600 text-xs px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Submitted Handovers Queue */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-stone-700 uppercase tracking-wider">
          Submitted Handovers ({handovers.length})
        </div>

        {handovers.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-stone-200 rounded-xl text-stone-400 text-xs">
            No COD cash handovers submitted yet.
          </div>
        ) : (
          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {handovers.map(h => {
              const reqRupees = (h.requestedAmountPaise || 0) / 100;
              const accRupees = h.acceptedAmountPaise !== null ? h.acceptedAmountPaise / 100 : null;
              const discRupees = (h.discrepancyAmountPaise || 0) / 100;

              return (
                <div
                  key={h.handoverId}
                  className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-stone-900">{h.handoverId}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-stone-200 text-stone-700 flex items-center gap-1">
                        {h.destinationType === 'WAREHOUSE' ? (
                          <>
                            <Building2 className="w-3 h-3 text-amber-600" />
                            <span>WH-BRAHMPURI-01</span>
                          </>
                        ) : (
                          <>
                            <Shield className="w-3 h-3 text-purple-600" />
                            <span>ADMIN</span>
                          </>
                        )}
                      </span>
                    </div>

                    {/* Status Badge */}
                    <div>
                      {h.status === 'SUBMITTED' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span>SUBMITTED</span>
                        </span>
                      )}
                      {h.status === 'ACCEPTED' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>ACCEPTED</span>
                        </span>
                      )}
                      {h.status === 'REJECTED' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-900 border border-rose-300 flex items-center gap-1">
                          <XCircle className="w-3 h-3 text-rose-600" />
                          <span>REJECTED</span>
                        </span>
                      )}
                      {h.status === 'CANCELLED' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-stone-200 text-stone-700">
                          CANCELLED
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Amounts row */}
                  <div className="flex items-center justify-between text-stone-600 pt-1 border-t border-stone-200/60">
                    <div>
                      <span>Requested: </span>
                      <strong className="text-stone-900 font-mono">₹{reqRupees.toLocaleString('en-IN')}</strong>
                      {accRupees !== null && (
                        <span className="ml-2 text-emerald-700 font-bold">
                          • Accepted: ₹{accRupees.toLocaleString('en-IN')}
                        </span>
                      )}
                    </div>

                    {/* Action or Date */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-stone-400">
                        {new Date(h.submittedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {h.status === 'SUBMITTED' && (
                        <button
                          type="button"
                          onClick={() => handleCancelHandover(h.handoverId)}
                          className="px-2 py-0.5 rounded text-[10px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Discrepancy Notice if accepted with discrepancy */}
                  {h.status === 'ACCEPTED' && discRupees > 0 && (
                    <div className="bg-amber-100/70 border border-amber-300 rounded-lg p-2 text-[11px] text-amber-900 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span>
                        Discrepancy: Short by <strong>₹{discRupees.toLocaleString('en-IN')}</strong>. Remainder remains in your unresolved cash custody.
                      </span>
                    </div>
                  )}

                  {/* Rejection Note */}
                  {h.status === 'REJECTED' && h.rejectionReason && (
                    <div className="text-[11px] text-rose-700 bg-rose-50 rounded-lg p-2 border border-rose-200">
                      Reason: {h.rejectionReason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Handover Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-amber-600" />
                <h3 className="text-base font-black text-stone-900">Create COD Cash Handover</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-stone-400 hover:text-stone-600 text-sm p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Destination Selector */}
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  Handover Destination
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDestinationType('WAREHOUSE')}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 cursor-pointer transition-all ${
                      destinationType === 'WAREHOUSE'
                        ? 'border-amber-500 bg-amber-50/50 ring-1 ring-amber-500'
                        : 'border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-black text-stone-900">
                      <Building2 className="w-3.5 h-3.5 text-amber-600" />
                      <span>Warehouse</span>
                    </div>
                    <div className="text-[10px] text-stone-500 font-mono">WH-BRAHMPURI-01</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDestinationType('ADMIN')}
                    className={`p-3 rounded-xl border text-left flex flex-col gap-1 cursor-pointer transition-all ${
                      destinationType === 'ADMIN'
                        ? 'border-purple-500 bg-purple-50/50 ring-1 ring-purple-500'
                        : 'border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-black text-stone-900">
                      <Shield className="w-3.5 h-3.5 text-purple-600" />
                      <span>Super Admin</span>
                    </div>
                    <div className="text-[10px] text-stone-500">Central Office</div>
                  </button>
                </div>
              </div>

              {/* Handover Amount */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                    Amount to Hand Over (₹)
                  </label>
                  <span className="text-[10px] text-stone-500 font-mono">
                    Max: ₹{availableForHandoverRupees.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-stone-400 font-bold text-sm">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max={availableForHandoverRupees}
                    value={amountRupees}
                    onChange={e => setAmountRupees(e.target.value)}
                    required
                    className="w-full pl-7 pr-3 py-2 text-sm font-bold font-mono border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Related Collections Selector */}
              {eligibleCollections.length > 0 && (
                <div>
                  <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">
                    Select Related Cash Collections ({selectedCollectionIds.length}/{eligibleCollections.length})
                  </label>
                  <div className="max-h-32 overflow-y-auto space-y-1.5 border border-stone-200 rounded-xl p-2 bg-stone-50/50">
                    {eligibleCollections.map(col => {
                      const colRps = (col.amountCollectedPaise || 0) / 100;
                      const isSelected = selectedCollectionIds.includes(col.collectionId);
                      return (
                        <div
                          key={col.collectionId}
                          onClick={() => handleToggleCollection(col.collectionId, colRps)}
                          className={`flex items-center justify-between p-1.5 rounded-lg border text-xs cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-amber-100/60 border-amber-300 text-stone-900 font-semibold'
                              : 'bg-white border-stone-200 text-stone-600'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="rounded text-amber-600"
                            />
                            <span className="font-mono text-[11px]">{col.orderId || col.collectionId}</span>
                          </div>
                          <span className="font-mono font-bold">₹{colRps.toLocaleString('en-IN')}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Optional Notes */}
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Optional Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g., Handed over at evening dispatch bay"
                  maxLength={150}
                  className="w-full px-3 py-2 text-xs border border-stone-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl border border-stone-200 text-xs font-bold text-stone-600 hover:bg-stone-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#0d1d25] hover:bg-stone-800 text-[#f5b024] text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Submit Handover</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
