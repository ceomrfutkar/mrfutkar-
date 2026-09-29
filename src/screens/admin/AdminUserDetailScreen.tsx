import React, { useState, useEffect, useCallback } from 'react';
import { AdminClient } from '../../services/adminClient';
import { useAdmin } from '../../context/AdminContext';
import { AdminUserRow, AdminStatus } from '../../types/admin';

interface AdminUserDetailScreenProps {
  uid: string;
  onBack: () => void;
}

export const AdminUserDetailScreen: React.FC<AdminUserDetailScreenProps> = ({ uid, onBack }) => {
  const { session } = useAdmin();

  const [admin, setAdmin] = useState<AdminUserRow | null>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [activityMetrics, setActivityMetrics] = useState<{
    totalAuditActions: number;
    lastActionTimestamp?: string;
  }>({ totalAuditActions: 0 });

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Status Change Modal
  const [isStatusModalOpen, setIsStatusModalOpen] = useState<boolean>(false);
  const [targetNewStatus, setTargetNewStatus] = useState<AdminStatus>('ACTIVE');
  const [statusReason, setStatusReason] = useState<string>('');
  const [statusModalError, setStatusModalError] = useState<string | null>(null);
  const [isSubmittingStatus, setIsSubmittingStatus] = useState<boolean>(false);

  // Load Admin Detail
  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await AdminClient.fetchAdminUserDetail(uid);
      if (res.success && res.admin) {
        setAdmin(res.admin);
        setRecentActivity(res.recentActivity || []);
        setAuditLogs(res.auditLogs || []);
        if (res.activityMetrics) {
          setActivityMetrics(res.activityMetrics);
        }
      } else {
        setError(res.message || 'Failed to load administrator details.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred while loading admin details.');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const openStatusModal = (newStatus: AdminStatus) => {
    setTargetNewStatus(newStatus);
    setStatusReason('');
    setStatusModalError(null);
    setIsStatusModalOpen(true);
  };

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!admin) return;
    setStatusModalError(null);

    if (!statusReason.trim() || statusReason.trim().length < 3) {
      setStatusModalError('A valid reason (minimum 3 characters) is required for modifying status.');
      return;
    }

    if (session?.uid === admin.uid && targetNewStatus !== 'ACTIVE') {
      setStatusModalError('Self-lockout protection: You cannot deactivate or suspend your own account.');
      return;
    }

    setIsSubmittingStatus(true);
    try {
      const res = await AdminClient.updateAdminUserStatus(admin.uid, targetNewStatus, statusReason.trim());
      if (res.success) {
        setIsStatusModalOpen(false);
        setSuccessMessage(res.message || `Admin status changed to ${targetNewStatus}.`);
        setTimeout(() => setSuccessMessage(null), 5000);
        loadDetail();
      } else {
        setStatusModalError(res.message || res.error || 'Failed to update admin status.');
      }
    } catch (err: any) {
      setStatusModalError(err.message || 'Failed to update admin status.');
    } finally {
      setIsSubmittingStatus(false);
    }
  };

  const isCurrentAdmin = session?.uid === admin?.uid;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Back Button & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition shadow-xs"
            title="Back to Admin Users"
          >
            ← Back
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Admin Profile</h1>
              {admin && (
                <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-slate-100 text-slate-800 border border-slate-300">
                  {admin.role}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{uid}</p>
          </div>
        </div>

        {/* Top Actions */}
        {admin && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadDetail()}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-xs"
            >
              🔄 Refresh
            </button>

            {admin.status === 'ACTIVE' ? (
              <>
                <button
                  onClick={() => openStatusModal('SUSPENDED')}
                  disabled={isCurrentAdmin}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition ${
                    isCurrentAdmin ? 'opacity-40 cursor-not-allowed' : ''
                  }`}
                  title={isCurrentAdmin ? 'Cannot suspend self' : 'Suspend account'}
                >
                  Suspend Account
                </button>
                <button
                  onClick={() => openStatusModal('DISABLED')}
                  disabled={isCurrentAdmin}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 transition ${
                    isCurrentAdmin ? 'opacity-40 cursor-not-allowed' : ''
                  }`}
                  title={isCurrentAdmin ? 'Cannot deactivate self' : 'Deactivate account'}
                >
                  Deactivate Account
                </button>
              </>
            ) : (
              <button
                onClick={() => openStatusModal('ACTIVE')}
                className="px-4 py-1.5 text-xs font-bold rounded-lg border border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700 transition"
              >
                Reactivate Account
              </button>
            )}
          </div>
        )}
      </div>

      {/* Success Notification Banner */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-emerald-600 font-bold">✓</span>
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-900 font-bold text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-rose-600 font-bold">⚠️</span>
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-900 font-bold text-xs">
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className="p-16 text-center text-slate-500 bg-white rounded-xl border border-slate-200 shadow-xs">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-slate-200 border-t-[#f5b024] rounded-full mb-3" />
          <p className="text-sm font-medium">Loading administrator profile & audit records...</p>
        </div>
      ) : !admin ? (
        <div className="p-16 text-center text-slate-500 bg-white rounded-xl border border-slate-200 shadow-xs">
          <div className="text-3xl mb-2">❌</div>
          <p className="text-base font-bold text-slate-800">Admin Account Not Found</p>
          <p className="text-xs text-slate-500 mt-1">The specified administrator UID does not exist in Firestore.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top Identity Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-900 text-[#f5b024] text-2xl font-black flex items-center justify-center shadow-inner">
                  {admin.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-900">{admin.name}</h2>
                    {isCurrentAdmin && (
                      <span className="px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-800 rounded">
                        CURRENT SESSION
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">{admin.uid}</div>
                  <div className="flex items-center gap-2 mt-2">
                    {admin.status === 'ACTIVE' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <span className="w-2 h-2 rounded-full bg-emerald-600" />
                        ACTIVE
                      </span>
                    ) : admin.status === 'SUSPENDED' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        <span className="w-2 h-2 rounded-full bg-amber-600" />
                        SUSPENDED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-0.5 text-xs font-bold rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                        <span className="w-2 h-2 rounded-full bg-rose-600" />
                        DISABLED
                      </span>
                    )}

                    <span className="text-xs text-slate-500">•</span>
                    <span className="text-xs font-semibold text-slate-600">
                      Activity: {admin.activityStatus}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Reason / Note */}
              {admin.statusReason && (
                <div className="md:max-w-xs bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                  <div className="font-bold text-slate-600 uppercase text-[10px] tracking-wider">
                    Status Note / Reason
                  </div>
                  <div className="text-slate-800 mt-1 italic">"{admin.statusReason}"</div>
                  {admin.statusUpdatedBy && (
                    <div className="text-[10px] text-slate-400 mt-1">
                      Updated by: <span className="font-mono">{admin.statusUpdatedBy}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Grid of Profile Metadata */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100 text-xs">
              <div>
                <div className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  Mobile Number
                </div>
                <div className="font-bold text-slate-900 text-sm mt-0.5">{admin.mobile || '—'}</div>
              </div>

              <div>
                <div className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  Email Address
                </div>
                <div className="font-bold text-slate-900 text-sm mt-0.5">{admin.email || '—'}</div>
              </div>

              <div>
                <div className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  Role & Version
                </div>
                <div className="font-bold text-slate-900 text-sm mt-0.5">
                  {admin.role} (v{admin.permissionsVersion})
                </div>
              </div>

              <div>
                <div className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  Created By & Date
                </div>
                <div className="font-bold text-slate-900 text-sm mt-0.5">
                  {admin.createdAt ? new Date(admin.createdAt).toLocaleDateString('en-IN') : '—'}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">{admin.createdBy || 'SYSTEM'}</div>
              </div>
            </div>
          </div>

          {/* Activity Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-xs font-semibold uppercase text-slate-500">Total Audit Actions</div>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {activityMetrics.totalAuditActions}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Recorded in immutable audit logs</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="text-xs font-semibold uppercase text-slate-500">Last Login</div>
              <div className="text-sm font-bold text-slate-900 mt-1 truncate">
                {admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString('en-IN') : 'Never logged in'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Session verification timestamp</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs col-span-2 sm:col-span-1">
              <div className="text-xs font-semibold uppercase text-slate-500">Last Profile Update</div>
              <div className="text-sm font-bold text-slate-900 mt-1 truncate">
                {admin.updatedAt ? new Date(admin.updatedAt).toLocaleString('en-IN') : '—'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Server authoritative update</div>
            </div>
          </div>

          {/* Audit History Log Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🛡️</span>
                <h3 className="font-bold text-slate-900 text-sm">Security & Administrative Audit Trail</h3>
              </div>
              <span className="text-xs text-slate-500">
                {auditLogs.length} recent events
              </span>
            </div>

            {auditLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No audit events currently associated with this administrator.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-2.5 px-4">Action</th>
                      <th className="py-2.5 px-4">Initiator / Target</th>
                      <th className="py-2.5 px-4">Timestamp</th>
                      <th className="py-2.5 px-4">Fingerprint</th>
                      <th className="py-2.5 px-4">Metadata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditLogs.map((log, idx) => (
                      <tr key={log.logId || idx} className="hover:bg-slate-50 transition">
                        <td className="py-2.5 px-4 font-mono font-bold text-slate-800">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-slate-900">{log.adminName || 'System'}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {log.adminUid || 'INTERNAL'}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">
                          {log.timestamp ? new Date(log.timestamp).toLocaleString('en-IN') : '—'}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[10px] text-slate-500">
                          {log.ipHashOrRequestFingerprint || '—'}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 max-w-xs truncate">
                          {log.metadata ? JSON.stringify(log.metadata) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status Change Modal */}
      {isStatusModalOpen && admin && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="text-xl">
                  {targetNewStatus === 'ACTIVE' ? '🟢' : targetNewStatus === 'SUSPENDED' ? '🟠' : '🔴'}
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {targetNewStatus === 'ACTIVE'
                      ? 'Reactivate Admin'
                      : targetNewStatus === 'SUSPENDED'
                      ? 'Suspend Admin'
                      : 'Deactivate Admin'}
                  </h3>
                  <p className="text-xs text-slate-500">{admin.name}</p>
                </div>
              </div>
              <button
                onClick={() => setIsStatusModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleStatusSubmit} className="p-5 space-y-4">
              {statusModalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                  {statusModalError}
                </div>
              )}

              {isCurrentAdmin && targetNewStatus !== 'ACTIVE' && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg font-medium">
                  ⚠️ <strong>Self-Lockout Protection:</strong> You cannot deactivate or suspend your own account.
                </div>
              )}

              <div className="text-xs text-slate-600">
                You are modifying administrative account status from{' '}
                <span className="font-bold">{admin.status}</span> to{' '}
                <span className="font-bold">{targetNewStatus}</span>.
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Mandatory Audit Reason *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Explain why this status transition is being applied..."
                  value={statusReason}
                  onChange={e => setStatusReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#f5b024] focus:outline-none"
                />
                <div className="text-[11px] text-slate-400 mt-1">
                  Required by security audit policy (minimum 3 characters).
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsStatusModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingStatus}
                  className={`px-5 py-2 text-sm font-bold rounded-lg transition disabled:opacity-50 ${
                    targetNewStatus === 'ACTIVE'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : targetNewStatus === 'SUSPENDED'
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-rose-600 hover:bg-rose-700 text-white'
                  }`}
                >
                  {isSubmittingStatus ? 'Updating...' : `Confirm ${targetNewStatus}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
