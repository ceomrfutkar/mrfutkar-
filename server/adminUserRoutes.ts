/**
 * MR FUTKAR — Admin User & Access Management Routes
 * Phase 3B-12: Super Admin User Management Backend + API + Security
 * 
 * Strict server-authoritative endpoints for:
 * - Listing admin users (search, filtering, pagination)
 * - Admin user details and activity info
 * - Admin account lifecycle (activate, deactivate, suspend, reactivate)
 * - Secure admin creation/provisioning with mobile/email uniqueness
 * - Lockout prevention (prevent self-lockout, prevent locking out last active super admin)
 * - Mandatory reason on status changes
 * - Append-only audit logging to adminAuditLogs
 */

import { Router, Request, Response } from 'express';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import crypto from 'crypto';
import { db, SERVER_TXN_TOKEN } from './firebaseAdmin';
import { requireSuperAdmin, logAdminAudit } from './adminAuth';
import {
  AdminUser,
  AdminUserRow,
  AdminStatus,
  AdminRole,
  AdminActivityStatus,
  AdminAuditAction,
} from '../src/types/admin';

export const adminUserRouter = Router();

// Strict SUPER_ADMIN enforcement on all admin user management routes
adminUserRouter.use(requireSuperAdmin());

/**
 * Derives dynamic activity status based on timestamps
 */
function deriveActivityStatus(lastLoginAt?: string, updatedAt?: string): AdminActivityStatus {
  const ts = lastLoginAt || updatedAt;
  if (!ts) return 'INACTIVE';
  const time = new Date(ts).getTime();
  if (isNaN(time)) return 'INACTIVE';

  const diffMs = Date.now() - time;
  const diffMins = diffMs / (1000 * 60);
  const diffHours = diffMins / 60;
  const diffDays = diffHours / 24;

  if (diffMins <= 30) return 'ONLINE';
  if (diffHours <= 24) return 'ACTIVE_TODAY';
  if (diffDays <= 7) return 'RECENT';
  return 'INACTIVE';
}

/**
 * Sanitizes raw admin doc into safe AdminUserRow (no secrets, no internal tokens)
 */
function sanitizeAdminUser(docData: any, docId: string): AdminUserRow {
  const uid = docData.uid || docId;
  const rawStatus = (docData.status || 'ACTIVE').toUpperCase();
  const status: AdminStatus =
    rawStatus === 'SUSPENDED' ? 'SUSPENDED' :
    rawStatus === 'DISABLED' ? 'DISABLED' : 'ACTIVE';
  const role: AdminRole = 'SUPER_ADMIN';
  const isActive = status === 'ACTIVE' && docData.isActive !== false;

  return {
    uid,
    name: docData.name || 'Admin User',
    mobile: docData.mobile || '',
    email: docData.email || '',
    role,
    status,
    isActive,
    createdAt: docData.createdAt || new Date().toISOString(),
    updatedAt: docData.updatedAt || docData.createdAt || new Date().toISOString(),
    lastLoginAt: docData.lastLoginAt,
    createdBy: docData.createdBy || 'SYSTEM',
    permissionsVersion: Number(docData.permissionsVersion) || 1,
    activityStatus: deriveActivityStatus(docData.lastLoginAt, docData.updatedAt),
    statusReason: docData.statusReason,
    statusUpdatedBy: docData.statusUpdatedBy,
  };
}

/**
 * Normalizes Indian mobile number
 */
function normalizeMobile(mobile: string): string {
  const clean = mobile.replace(/[^0-9+]/g, '');
  if (clean.startsWith('+91') && clean.length === 13) return clean;
  if (clean.startsWith('91') && clean.length === 12) return `+${clean}`;
  if (clean.length === 10) return `+91${clean}`;
  return clean;
}

/**
 * Validates Indian 10-digit mobile
 */
function isValidIndianMobile(mobile: string): boolean {
  const clean = normalizeMobile(mobile);
  return /^\+91[6-9]\d{9}$/.test(clean);
}

/**
 * Validates email format
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.toLowerCase());
}

/**
 * GET /api/admin/users
 * Lists admin users with server-side search, filtering, and pagination.
 */
adminUserRouter.get('/', async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : '';
    const roleFilter = typeof req.query.role === 'string' ? req.query.role.trim().toUpperCase() : '';

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const rawPageSize = parseInt(req.query.pageSize as string, 10) || 25;

    // Strict boundary enforcement: max 100 per page
    if (rawPageSize > 100 || rawPageSize < 1) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PAGE_SIZE',
        message: 'Page size must be an integer between 1 and 100.',
      });
    }
    const pageSize = rawPageSize;

    // Fetch all admins from adminUsers collection
    const snap = await getDocs(collection(db, 'adminUsers'));
    let allAdmins = snap.docs.map(d => sanitizeAdminUser(d.data(), d.id));

    // Summary counts calculated across entire dataset before search/filter
    const summary = {
      total: allAdmins.length,
      active: allAdmins.filter(u => u.status === 'ACTIVE').length,
      suspended: allAdmins.filter(u => u.status === 'SUSPENDED').length,
      disabled: allAdmins.filter(u => u.status === 'DISABLED').length,
    };

    // Apply role filter if specified
    if (roleFilter && roleFilter !== 'ALL') {
      allAdmins = allAdmins.filter(u => u.role === roleFilter);
    }

    // Apply status filter if specified
    if (statusFilter && statusFilter !== 'ALL') {
      allAdmins = allAdmins.filter(u => u.status === statusFilter);
    }

    // Apply search filter (name, email, mobile, uid)
    if (search) {
      allAdmins = allAdmins.filter(u =>
        u.name.toLowerCase().includes(search) ||
        (u.email && u.email.toLowerCase().includes(search)) ||
        u.mobile.toLowerCase().includes(search) ||
        u.uid.toLowerCase().includes(search)
      );
    }

    // Sort by createdAt descending
    allAdmins.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalCount = allAdmins.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const paginatedUsers = allAdmins.slice(startIndex, startIndex + pageSize);

    return res.status(200).json({
      success: true,
      users: paginatedUsers,
      totalCount,
      page,
      pageSize,
      totalPages,
      summary,
    });
  } catch (err: any) {
    console.error('Error fetching admin users:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve admin users list.',
    });
  }
});

/**
 * GET /api/admin/users/:uid
 * Returns safe admin details, activity metrics, and recent audit logs
 */
adminUserRouter.get('/:uid', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).adminUser as AdminUser;
    const targetUid = req.params.uid;

    if (!targetUid || typeof targetUid !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_UID',
        message: 'Admin UID parameter is required.',
      });
    }

    const adminDocRef = doc(db, 'adminUsers', targetUid);
    const snap = await getDoc(adminDocRef);

    if (!snap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'ADMIN_NOT_FOUND',
        message: `Admin user with UID '${targetUid}' does not exist.`,
      });
    }

    const admin = sanitizeAdminUser(snap.data(), snap.id);

    // Fetch recent audit logs for this admin (either performed by this admin or targeting this admin)
    let auditLogs: any[] = [];
    let recentActivity: any[] = [];
    try {
      const logsSnap = await getDocs(
        query(collection(db, 'adminAuditLogs'), orderBy('timestamp', 'desc'), limit(100))
      );
      const allLogs = logsSnap.docs.map(d => d.data());

      auditLogs = allLogs.filter(l => l.targetId === targetUid || l.adminUid === targetUid).slice(0, 30);
      recentActivity = allLogs.filter(l => l.adminUid === targetUid).slice(0, 20);
    } catch (e: any) {
      console.warn('Note: Non-blocking audit fetch note for admin detail:', e.message);
    }

    const activityMetrics = {
      totalAuditActions: recentActivity.length,
      lastActionTimestamp: recentActivity[0]?.timestamp || admin.lastLoginAt || admin.updatedAt,
    };

    // Record non-blocking view audit log
    logAdminAudit({
      action: 'ADMIN_USER_VIEWED',
      adminUid: caller.uid,
      adminName: caller.name,
      targetType: 'ADMIN_USER',
      targetId: targetUid,
      metadata: { targetName: admin.name, targetRole: admin.role },
      req,
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      admin,
      recentActivity,
      auditLogs,
      activityMetrics,
    });
  } catch (err: any) {
    console.error('Error fetching admin user detail:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve admin user details.',
    });
  }
});

/**
 * POST /api/admin/users
 * Creates / provisions a new Super Admin account.
 * Validates inputs, enforces uniqueness of mobile and email across all admin users.
 */
adminUserRouter.post('/', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).adminUser as AdminUser;
    const { name, email, mobile, role, reason } = req.body || {};

    // 1. Validate Name
    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_NAME',
        message: 'Admin full name is required (between 2 and 100 characters).',
      });
    }
    const cleanName = name.trim();

    // 2. Validate Email
    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_EMAIL',
        message: 'A valid email address is required.',
      });
    }
    const cleanEmail = email.trim().toLowerCase();

    // 3. Validate Mobile
    if (!mobile || typeof mobile !== 'string' || !isValidIndianMobile(mobile)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_MOBILE',
        message: 'A valid 10-digit Indian mobile number is required.',
      });
    }
    const cleanMobile = normalizeMobile(mobile);

    // 4. Validate Role: must be SUPER_ADMIN
    const targetRole: AdminRole = (role || 'SUPER_ADMIN').toUpperCase();
    if (targetRole !== 'SUPER_ADMIN') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ROLE',
        message: 'Only SUPER_ADMIN role is supported in the current administrative architecture.',
      });
    }

    // 5. Uniqueness Check across adminUsers collection
    const snap = await getDocs(collection(db, 'adminUsers'));
    const existingAdmins = snap.docs.map(d => d.data());

    const duplicateEmail = existingAdmins.find(
      u => u.email && u.email.trim().toLowerCase() === cleanEmail
    );
    if (duplicateEmail) {
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE_EMAIL',
        message: `An admin account with email '${cleanEmail}' already exists.`,
      });
    }

    const duplicateMobile = existingAdmins.find(
      u => u.mobile && normalizeMobile(u.mobile) === cleanMobile
    );
    if (duplicateMobile) {
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE_MOBILE',
        message: `An admin account with mobile '${cleanMobile}' already exists.`,
      });
    }

    // 6. Generate authoritative UID
    const newUid = `SUPER-ADMIN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const now = new Date().toISOString();

    const newAdminData: AdminUser = {
      uid: newUid,
      name: cleanName,
      email: cleanEmail,
      mobile: cleanMobile,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      createdBy: caller.uid,
      permissionsVersion: 1,
    };

    // 7. Write to Firestore adminUsers with server authority
    await setDoc(doc(db, 'adminUsers', newUid), {
      ...newAdminData,
      statusReason: reason ? String(reason).trim() : 'Initial admin provisioning',
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    });

    // 8. Immutable Audit Log
    await logAdminAudit({
      action: 'ADMIN_USER_CREATED',
      adminUid: caller.uid,
      adminName: caller.name,
      targetType: 'ADMIN_USER',
      targetId: newUid,
      metadata: {
        newAdminUid: newUid,
        name: cleanName,
        email: cleanEmail,
        mobile: cleanMobile,
        role: 'SUPER_ADMIN',
        reason: reason || 'Initial provisioning',
      },
      req,
    });

    return res.status(201).json({
      success: true,
      message: `Super Admin account for ${cleanName} successfully created.`,
      admin: sanitizeAdminUser(newAdminData, newUid),
    });
  } catch (err: any) {
    console.error('Error creating admin user:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to create admin user.',
    });
  }
});

// Serialized mutex for atomic concurrency protection during admin status transitions
let statusMutex = Promise.resolve();
function withStatusLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = statusMutex.then(fn, fn);
  statusMutex = next.then(() => {}, () => {});
  return next;
}

/**
 * Core Status Transition Handler with Lockout Protections & Audit Logging
 */
async function handleStatusTransition(
  caller: AdminUser,
  targetUid: string,
  newStatus: AdminStatus,
  reason: string,
  req: Request,
  res: Response
) {
  return withStatusLock(async () => {
    // 1. Validate reason: required, minimum 3 characters
    if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: 'REASON_REQUIRED',
        message: 'A valid reason (minimum 3 characters) is required for modifying admin account status.',
      });
    }
    const cleanReason = reason.trim();

    // 2. Lockout Protection #1: Self-lockout prevention
    // A Super Admin CANNOT deactivate or suspend their own account!
    if (caller.uid === targetUid && newStatus !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        error: 'SELF_LOCKOUT_FORBIDDEN',
        message: 'Self-lockout prevention: Administrators cannot deactivate or suspend their own account.',
      });
    }

    // 3. Fetch target admin doc
    const adminDocRef = doc(db, 'adminUsers', targetUid);
    const snap = await getDoc(adminDocRef);

    if (!snap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'ADMIN_NOT_FOUND',
        message: `Admin user with UID '${targetUid}' does not exist.`,
      });
    }

    const currentData = snap.data();
    const currentStatus = (currentData.status || 'ACTIVE').toUpperCase() as AdminStatus;

    // 4. Check if already in target status (Idempotency requirement AU-20)
    if (currentStatus === newStatus) {
      return res.status(200).json({
        success: true,
        message: `Admin account is already in '${newStatus}' status.`,
        admin: sanitizeAdminUser(currentData, targetUid),
      });
    }

    // 5. Lockout Protection #2: Last active Super Admin check
    if (newStatus !== 'ACTIVE') {
      const allAdminsSnap = await getDocs(collection(db, 'adminUsers'));
      const activeSuperAdmins = allAdminsSnap.docs.filter(d => {
        const data = d.data();
        return data.role === 'SUPER_ADMIN' && data.status === 'ACTIVE';
      });

      if (activeSuperAdmins.length <= 1 && currentStatus === 'ACTIVE') {
        return res.status(400).json({
          success: false,
          error: 'LAST_ACTIVE_SUPER_ADMIN_PROTECTED',
          message: 'Lockout prevention: Cannot deactivate or suspend the only active Super Admin in the system.',
        });
      }
    }

    // 6. Update target admin in Firestore
    const now = new Date().toISOString();
    await updateDoc(adminDocRef, {
      status: newStatus,
      updatedAt: now,
      statusReason: cleanReason,
      statusUpdatedBy: caller.uid,
      _serverTxnToken: SERVER_TXN_TOKEN,
      _serverWriteNonce: Date.now().toString(),
    });

    // 7. Determine specific audit actions
    let specificAction: AdminAuditAction = 'ADMIN_USER_STATUS_UPDATED';
    if (newStatus === 'ACTIVE') {
      specificAction = currentStatus === 'SUSPENDED' ? 'ADMIN_USER_REACTIVATED' : 'ADMIN_USER_ACTIVATED';
    } else if (newStatus === 'SUSPENDED') {
      specificAction = 'ADMIN_USER_SUSPENDED';
    } else if (newStatus === 'DISABLED') {
      specificAction = 'ADMIN_USER_DEACTIVATED';
    }

    // 8. Immutable Audit Trail
    await logAdminAudit({
      action: specificAction,
      adminUid: caller.uid,
      adminName: caller.name,
      targetType: 'ADMIN_USER',
      targetId: targetUid,
      metadata: {
        targetName: currentData.name,
        oldStatus: currentStatus,
        newStatus,
        reason: cleanReason,
        updatedBy: caller.uid,
      },
      req,
    });

    await logAdminAudit({
      action: 'ADMIN_USER_STATUS_UPDATED',
      adminUid: caller.uid,
      adminName: caller.name,
      targetType: 'ADMIN_USER',
      targetId: targetUid,
      metadata: {
        targetName: currentData.name,
        oldStatus: currentStatus,
        newStatus,
        reason: cleanReason,
      },
      req,
    });

    const updatedAdmin: AdminUserRow = sanitizeAdminUser({
      ...currentData,
      status: newStatus,
      updatedAt: now,
      statusReason: cleanReason,
      statusUpdatedBy: caller.uid,
    }, targetUid);

    return res.status(200).json({
      success: true,
      message: `Admin user '${currentData.name}' status successfully changed to ${newStatus}.`,
      admin: updatedAdmin,
    });
  });
}

/**
 * POST /api/admin/users/:uid/status
 * Updates status (ACTIVE, SUSPENDED, DISABLED) with mandatory reason and lockout protection.
 */
adminUserRouter.post('/:uid/status', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).adminUser as AdminUser;
    const targetUid = req.params.uid;
    const { status, reason } = req.body || {};

    const rawStatus = typeof status === 'string' ? status.trim().toUpperCase() : '';
    if (!['ACTIVE', 'SUSPENDED', 'DISABLED'].includes(rawStatus)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS',
        message: "Status must be one of: 'ACTIVE', 'SUSPENDED', 'DISABLED'.",
      });
    }

    return await handleStatusTransition(caller, targetUid, rawStatus as AdminStatus, reason, req, res);
  } catch (err: any) {
    console.error('Error updating admin user status:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to update admin user status.',
    });
  }
});

/**
 * POST /api/admin/users/:uid/activate
 */
adminUserRouter.post('/:uid/activate', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).adminUser as AdminUser;
    const targetUid = req.params.uid;
    const { reason = 'Account activation' } = req.body || {};
    return await handleStatusTransition(caller, targetUid, 'ACTIVE', reason, req, res);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/admin/users/:uid/deactivate
 */
adminUserRouter.post('/:uid/deactivate', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).adminUser as AdminUser;
    const targetUid = req.params.uid;
    const { reason = 'Account deactivation by Super Admin' } = req.body || {};
    return await handleStatusTransition(caller, targetUid, 'DISABLED', reason, req, res);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/admin/users/:uid/suspend
 */
adminUserRouter.post('/:uid/suspend', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).adminUser as AdminUser;
    const targetUid = req.params.uid;
    const { reason = 'Account suspension by Super Admin' } = req.body || {};
    return await handleStatusTransition(caller, targetUid, 'SUSPENDED', reason, req, res);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /api/admin/users/:uid/reactivate
 */
adminUserRouter.post('/:uid/reactivate', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).adminUser as AdminUser;
    const targetUid = req.params.uid;
    const { reason = 'Account reactivation' } = req.body || {};
    return await handleStatusTransition(caller, targetUid, 'ACTIVE', reason, req, res);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * GET /api/admin/users/:uid/audit-logs
 * Returns audit trail specifically related to this admin user.
 */
adminUserRouter.get('/:uid/audit-logs', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).adminUser as AdminUser;
    const targetUid = req.params.uid;

    const logsSnap = await getDocs(
      query(collection(db, 'adminAuditLogs'), orderBy('timestamp', 'desc'), limit(100))
    );
    const allLogs = logsSnap.docs.map(d => d.data());
    const userLogs = allLogs.filter(l => l.targetId === targetUid || l.adminUid === targetUid);

    // Non-blocking view audit log
    logAdminAudit({
      action: 'ADMIN_USER_AUDIT_VIEWED',
      adminUid: caller.uid,
      adminName: caller.name,
      targetType: 'ADMIN_USER',
      targetId: targetUid,
      metadata: { logsRetrievedCount: userLogs.length },
      req,
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      logs: userLogs,
      count: userLogs.length,
    });
  } catch (err: any) {
    console.error('Error fetching admin user audit logs:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve admin user audit logs.',
    });
  }
});
