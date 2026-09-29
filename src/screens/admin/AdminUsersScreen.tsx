import React, { useState, useEffect, useCallback } from 'react';
import { AdminClient } from '../../services/adminClient';
import { useAdmin } from '../../context/AdminContext';
import { AdminUserRow, AdminStatus, AdminUserListSummary } from '../../types/admin';

interface AdminUsersScreenProps {
  onSelectAdmin?: (uid: string) => void;
}

export const AdminUsersScreen: React.FC<AdminUsersScreenProps> = ({ onSelectAdmin }) => {
  const { session } = useAdmin();

  // State
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [summary, setSummary] = useState<AdminUserListSummary>({
    total: 0,
    active: 0,
    suspended: 0,
    disabled: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [newAdminName, setNewAdminName] = useState<string>('');
  const [newAdminEmail, setNewAdminEmail] = useState<string>('');
  const [newAdminMobile, setNewAdminMobile] = useState<string>('');
  const [newAdminReason, setNewAdminReason] = useState<string>('');
  const [addModalError, setAddModalError] = useState<string | null>(null);
  const [isSubmittingAdd, setIsSubmittingAdd] = useState<boolean>(false);

  // Status Change Modal
  const [statusTargetAdmin, setStatusTargetAdmin] = useState<AdminUserRow | null>(null);
  const [targetNewStatus, setTargetNewStatus] = useState<AdminStatus>('ACTIVE');
  const [statusChangeReason, setStatusChangeReason] = useState<string>('');
  const [statusModalError, setStatusModalError] = useState<string | null>(null);
  const [isSubmittingStatus, setIsSubmittingStatus] = useState<boolean>(false);

  // Fetch Users
  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await AdminClient.fetchAdminUsers({
        search,
        status: statusFilter,
        page,
        pageSize,
      });

      if (res.success && res.users) {
        setUsers(res.users);
        setTotalCount(res.totalCount || 0);
        setTotalPages(res.totalPages || 1);
        if (res.summary) {
          setSummary(res.summary);
        }
      } else {
        setError(res.message || 'Failed to load administrator accounts.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred while loading admins.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page, pageSize]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Handle Add Admin Submit
  const handleAddAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddModalError(null);

    if (!newAdminName.trim() || newAdminName.trim().length < 2) {
      setAddModalError('Please enter a valid administrator name (min 2 characters).');
      return;
    }
    if (!newAdminEmail.trim() || !newAdminEmail.includes('@')) {
      setAddModalError('Please enter a valid email address.');
      return;
    }
    const cleanMobile = newAdminMobile.replace(/\D/g, '');
    if (cleanMobile.length < 10) {
      setAddModalError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    setIsSubmittingAdd(true);
    try {
      const res = await AdminClient.createAdminUser({
        name: newAdminName.trim(),
        email: newAdminEmail.trim().toLowerCase(),
        mobile: cleanMobile.length === 10 ? `+91${cleanMobile}` : `+${cleanMobile}`,
        role: 'SUPER_ADMIN',
        reason: newAdminReason.trim() || 'Admin management console provisioning',
      });

      if (res.success) {
        setIsAddModalOpen(false);
        setNewAdminName('');
        setNewAdminEmail('');
        setNewAdminMobile('');
        setNewAdminReason('');
        setSuccessMessage(res.message || 'Super Admin account provisioned successfully.');
        setTimeout(() => setSuccessMessage(null), 5000);
        loadUsers();
      } else {
        setAddModalError(res.message || res.error || 'Failed to create admin user.');
      }
    } catch (err: any) {
      setAddModalError(err.message || 'Failed to create admin user.');
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  // Open Status Change Modal
  const openStatusModal = (admin: AdminUserRow, newStatus: AdminStatus) => {
    setStatusTargetAdmin(admin);
    setTargetNewStatus(newStatus);
    setStatusChangeReason('');
    setStatusModalError(null);
  };

  // Handle Status Change Submit
  const handleStatusChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusTargetAdmin) return;
    setStatusModalError(null);

    if (!statusChangeReason.trim() || statusChangeReason.trim().length < 3) {
      setStatusModalError('A valid reason (minimum 3 characters) is required for modifying status.');
      return;
    }

    // Client-side self-lockout warning
    if (session?.uid === statusTargetAdmin.uid && targetNewStatus !== 'ACTIVE') {
      setStatusModalError('Self-lockout protection: You cannot deactivate or suspend your own account.');
      return;
    }

    setIsSubmittingStatus(true);
    try {
      const res = await AdminClient.updateAdminUserStatus(
        statusTargetAdmin.uid,
        targetNewStatus,
        statusChangeReason.trim()
      );

      if (res.success) {
        setStatusTargetAdmin(null);
        setSuccessMessage(res.message || `Admin status changed to ${targetNewStatus}.`);
        setTimeout(() => setSuccessMessage(null), 5000);
        loadUsers();
      } else {
        setStatusModalError(res.message || res.error || 'Failed to update admin status.');
      }
    } catch (err: any) {
      setStatusModalError(err.message || 'Failed to update admin status.');
    } finally {
      setIsSubmittingStatus(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Admin Users & Access</h1>
            <span className="px-2 py-0.5 text-xs font-bold bg-[#f5b024]/20 text-[#b57a07] border border-[#f5b024]/40 rounded">
              SUPER_ADMIN ONLY
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Authoritative admin accounts directory, role enforcement, status lifecycles, and audit logging.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadUsers()}
            disabled={loading}
            className="px-3.5 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition shadow-xs flex items-center gap-1.5"
          >
            <span>🔄</span> Refresh
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 text-sm font-bold text-slate-950 bg-[#f5b024] hover:bg-[#e5a019] rounded-lg transition shadow-xs flex items-center gap-1.5"
          >
            <span>➕</span> Add Super Admin
          </button>
        </div>
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

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold uppercase text-slate-500">Total Admins</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{summary.total}</div>
          <div className="text-[11px] text-slate-400 mt-1">Super Admin accounts</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
          <div className="text-xs font-semibold uppercase text-emerald-700">Active Admins</div>
          <div className="text-2xl font-black text-emerald-800 mt-1">{summary.active}</div>
          <div className="text-[11px] text-emerald-600/80 mt-1">Authorized for operations</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs">
          <div className="text-xs font-semibold uppercase text-amber-700">Suspended</div>
          <div className="text-2xl font-black text-amber-800 mt-1">{summary.suspended}</div>
          <div className="text-[11px] text-amber-600/80 mt-1">Temporarily blocked</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/20 shadow-xs">
          <div className="text-xs font-semibold uppercase text-rose-700">Disabled</div>
          <div className="text-2xl font-black text-rose-800 mt-1">{summary.disabled}</div>
          <div className="text-[11px] text-rose-600/80 mt-1">Access revoked</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div className="flex-1 relative">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            🔍
          </span>
          <input
            type="text"
            placeholder="Search by name, email, mobile, or UID..."
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#f5b024] focus:border-[#f5b024]"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600">Status:</label>
            <select
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#f5b024]"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="DISABLED">DISABLED</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600">Page Size:</label>
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="px-2.5 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#f5b024]"
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Admin List Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-slate-200 border-t-[#f5b024] rounded-full mb-3" />
            <p className="text-sm font-medium">Loading administrator directory...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <div className="text-3xl mb-2">🛡️</div>
            <p className="text-base font-semibold text-slate-800">No administrator accounts found</p>
            <p className="text-xs text-slate-500 mt-1">Try modifying your search query or status filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Admin User</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Activity</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4">Last Login</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {users.map(u => {
                  const isCurrent = session?.uid === u.uid;
                  return (
                    <tr
                      key={u.uid}
                      className={`hover:bg-slate-50/80 transition ${isCurrent ? 'bg-amber-50/20' : ''}`}
                    >
                      {/* Name & UID */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-800 text-[#f5b024] font-bold flex items-center justify-center text-xs">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              {u.name}
                              {isCurrent && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded">
                                  YOU
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400">{u.uid}</div>
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="py-3.5 px-4">
                        <div className="text-slate-800 font-medium">{u.mobile}</div>
                        <div className="text-xs text-slate-400">{u.email || '—'}</div>
                      </td>

                      {/* Role */}
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 text-xs font-bold rounded bg-slate-100 text-slate-800 border border-slate-300">
                          {u.role}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {u.status === 'ACTIVE' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                            ACTIVE
                          </span>
                        ) : u.status === 'SUSPENDED' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                            SUSPENDED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                            DISABLED
                          </span>
                        )}
                      </td>

                      {/* Activity Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-xs font-semibold ${
                            u.activityStatus === 'ONLINE'
                              ? 'text-emerald-600 font-bold'
                              : u.activityStatus === 'ACTIVE_TODAY'
                              ? 'text-blue-600'
                              : u.activityStatus === 'RECENT'
                              ? 'text-slate-600'
                              : 'text-slate-400'
                          }`}
                        >
                          {u.activityStatus === 'ONLINE'
                            ? '🟢 Online'
                            : u.activityStatus === 'ACTIVE_TODAY'
                            ? 'Today'
                            : u.activityStatus === 'RECENT'
                            ? 'Recent'
                            : 'Inactive'}
                        </span>
                      </td>

                      {/* Created Date */}
                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-IN') : '—'}
                      </td>

                      {/* Last Login */}
                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-IN') : 'Never'}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onSelectAdmin?.(u.uid)}
                            className="px-2.5 py-1 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition"
                            title="View Profile & Audit"
                          >
                            Details
                          </button>

                          {/* Quick Lifecycle Actions */}
                          {u.status === 'ACTIVE' ? (
                            <>
                              <button
                                onClick={() => openStatusModal(u, 'SUSPENDED')}
                                disabled={isCurrent}
                                className={`px-2 py-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded border border-amber-200 transition ${
                                  isCurrent ? 'opacity-40 cursor-not-allowed' : ''
                                }`}
                                title={isCurrent ? 'Cannot suspend yourself' : 'Suspend Admin'}
                              >
                                Suspend
                              </button>
                              <button
                                onClick={() => openStatusModal(u, 'DISABLED')}
                                disabled={isCurrent}
                                className={`px-2 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded border border-rose-200 transition ${
                                  isCurrent ? 'opacity-40 cursor-not-allowed' : ''
                                }`}
                                title={isCurrent ? 'Cannot deactivate yourself' : 'Deactivate Admin'}
                              >
                                Deactivate
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => openStatusModal(u, 'ACTIVE')}
                              className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200 transition"
                              title="Reactivate Account"
                            >
                              Activate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {users.length > 0 && (
          <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500">
            <div>
              Showing <span className="font-bold text-slate-800">{(page - 1) * pageSize + 1}</span> to{' '}
              <span className="font-bold text-slate-800">{Math.min(page * pageSize, totalCount)}</span> of{' '}
              <span className="font-bold text-slate-800">{totalCount}</span> admin users
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 border border-slate-300 rounded font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Previous
              </button>
              <span className="px-3 py-1.5 font-bold text-slate-800">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 border border-slate-300 rounded font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Admin Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="text-xl">🛡️</span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Provision Super Admin</h3>
                  <p className="text-xs text-slate-500">Grant full administrative command authority</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddAdminSubmit} className="p-5 space-y-4">
              {addModalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                  {addModalError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={newAdminName}
                  onChange={e => setNewAdminName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#f5b024] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. rahul@mrfutkar.com"
                  value={newAdminEmail}
                  onChange={e => setNewAdminEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#f5b024] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Indian Mobile Number *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="10-digit mobile (e.g. 9810012345)"
                  value={newAdminMobile}
                  onChange={e => setNewAdminMobile(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#f5b024] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Provisioning Reason / Audit Note
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Core operations lead provisioning"
                  value={newAdminReason}
                  onChange={e => setNewAdminReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#f5b024] focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdd}
                  className="px-5 py-2 text-sm font-bold text-slate-950 bg-[#f5b024] hover:bg-[#e5a019] rounded-lg transition disabled:opacity-50"
                >
                  {isSubmittingAdd ? 'Provisioning...' : 'Provision Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Status Change Modal */}
      {statusTargetAdmin && (
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
                  <p className="text-xs text-slate-500">{statusTargetAdmin.name}</p>
                </div>
              </div>
              <button
                onClick={() => setStatusTargetAdmin(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleStatusChangeSubmit} className="p-5 space-y-4">
              {statusModalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                  {statusModalError}
                </div>
              )}

              {session?.uid === statusTargetAdmin.uid && targetNewStatus !== 'ACTIVE' && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg font-medium">
                  ⚠️ <strong>Self-Lockout Protection:</strong> You cannot deactivate or suspend your own account. This action will be rejected by the server.
                </div>
              )}

              <div className="text-xs text-slate-600">
                You are about to change the administrative account status of{' '}
                <strong className="text-slate-900">{statusTargetAdmin.name}</strong> from{' '}
                <span className="font-bold">{statusTargetAdmin.status}</span> to{' '}
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
                  value={statusChangeReason}
                  onChange={e => setStatusChangeReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#f5b024] focus:outline-none"
                />
                <div className="text-[11px] text-slate-400 mt-1">
                  Required by security audit policy (minimum 3 characters).
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStatusTargetAdmin(null)}
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
