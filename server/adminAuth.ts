import { Request, Response, NextFunction } from 'express';
import { doc, getDoc, getDocs, query, where, setDoc, collection } from 'firebase/firestore';
import crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { db, adminAuth, SERVER_TXN_TOKEN } from './firebaseAdmin';
import { AdminUser, AdminAuditAction } from '../src/types/admin';

// Read config for Identity Toolkit fallback
let cfg: any = {};
try {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  }
} catch {
  // ignore
}

export const AUTHORITATIVE_SUPER_ADMIN_UID = 'VdVE3YVstNRH8ZZt1DZNJpquSdD2';
export const LEGACY_SUPER_ADMIN_UID = 'SUPER-ADMIN-01';
export const INITIAL_SUPER_ADMIN_UID = AUTHORITATIVE_SUPER_ADMIN_UID;

/**
 * Generate a safe, non-reversible SHA-256 fingerprint from the request
 * without storing raw sensitive IP or device strings
 */
export function generateRequestFingerprint(req?: Request): string {
  if (!req) return 'INTERNAL_SERVER_DISPATCH';
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const ua = req.headers['user-agent'] || 'unknown-client';
  return crypto.createHash('sha256').update(`${ip}:${ua}`).digest('hex').substring(0, 16);
}

/**
 * Append-only Super Admin Audit Logger
 * Stored in /adminAuditLogs/{logId} via Admin SDK with server-authoritative token
 */
export async function logAdminAudit(params: {
  action: AdminAuditAction;
  adminUid?: string;
  adminName?: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, any>;
  req?: Request;
}): Promise<string> {
  const logId = `AUDIT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  try {
    const logRef = doc(db, 'adminAuditLogs', logId);
    const fingerprint = generateRequestFingerprint(params.req);
    const auditRecord: any = {
      logId,
      adminUid: params.adminUid || 'UNKNOWN',
      adminName: params.adminName || 'System / Unverified',
      action: params.action,
      targetType: params.targetType || 'ADMIN_OPERATION',
      targetId: params.targetId || 'N/A',
      timestamp: new Date().toISOString(),
      ipHashOrRequestFingerprint: fingerprint,
      metadata: params.metadata || {},
    };
    if (params.action !== 'CUSTOMER_RECEIPT_POSTED') {
      auditRecord._serverTxnToken = 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01';
    }
    await setDoc(logRef, auditRecord);
    return logId;
  } catch (err: any) {
    console.error('Failed to write admin audit log:', err.message);
    return logId;
  }
}

/**
 * Bootstrap & Migration provisioning of authoritative Super Admin
 * - Sets/preserves adminUsers/VdVE3YVstNRH8ZZt1DZNJpquSdD2 as authoritative
 * - Preserves legitimate profile metadata (name, mobile, createdAt, etc.)
 * - Safely archives legacy adminUsers/SUPER-ADMIN-01
 * - Runs strictly server-side
 * - Idempotent
 */
export async function ensureInitialSuperAdmin(): Promise<void> {
  try {
    const authAdminRef = doc(db, 'adminUsers', AUTHORITATIVE_SUPER_ADMIN_UID);
    const authAdminSnap = await getDoc(authAdminRef);

    const legacyAdminRef = doc(db, 'adminUsers', LEGACY_SUPER_ADMIN_UID);
    const legacyAdminSnap = await getDoc(legacyAdminRef);
    const legacyData = legacyAdminSnap.exists() ? (legacyAdminSnap.data() as Partial<AdminUser>) : null;

    const now = new Date().toISOString();

    if (!authAdminSnap.exists()) {
      const superAdminRecord: AdminUser = {
        uid: AUTHORITATIVE_SUPER_ADMIN_UID,
        name: legacyData?.name || 'Akash Gupta (Super Administrator)',
        mobile: legacyData?.mobile || '+919810012345',
        email: 'ceo.mrfutkar@gmail.com',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        createdAt: legacyData?.createdAt || now,
        updatedAt: now,
        lastLoginAt: legacyData?.lastLoginAt || now,
        createdBy: 'SYSTEM_BOOTSTRAP',
        permissionsVersion: 1,
      };

      await setDoc(authAdminRef, {
        ...superAdminRecord,
        _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
      });
      console.log(`[SuperAdmin] Authoritative SUPER_ADMIN provisioned: ${AUTHORITATIVE_SUPER_ADMIN_UID}`);
    } else {
      // Ensure role is strictly SUPER_ADMIN and status is ACTIVE
      const current = authAdminSnap.data() as AdminUser;
      if (current.role !== 'SUPER_ADMIN' || current.status !== 'ACTIVE' || current.email !== 'ceo.mrfutkar@gmail.com') {
        await setDoc(authAdminRef, {
          ...current,
          uid: AUTHORITATIVE_SUPER_ADMIN_UID,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          email: 'ceo.mrfutkar@gmail.com',
          updatedAt: now,
          _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
          _serverWriteNonce: Date.now().toString(),
        }, { merge: true });
      }
    }

    // Safely archive legacy bootstrap record so there are never two active Super Admins for the same person
    if (legacyAdminSnap.exists()) {
      const legacy = legacyAdminSnap.data() as AdminUser;
      if (legacy.status === 'ACTIVE') {
        await setDoc(legacyAdminRef, {
          ...legacy,
          status: 'ARCHIVED',
          isActive: false,
          archivedAt: now,
          archivedReason: `SUPER_ADMIN_MIGRATED_TO_FIREBASE_AUTH_UID_${AUTHORITATIVE_SUPER_ADMIN_UID}`,
          _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
          _serverWriteNonce: Date.now().toString(),
        }, { merge: true });
        console.log(`[SuperAdmin] Legacy bootstrap record ${LEGACY_SUPER_ADMIN_UID} safely archived.`);
      }
    }
  } catch (err: any) {
    console.warn('[SuperAdmin] Bootstrap migration check note:', err.message);
  }
}

export interface AdminAuthResult {
  valid: boolean;
  status: number;
  adminUser?: AdminUser;
  error?: string;
  message?: string;
}

/**
 * Authoritative Server-side Super Admin Resolution
 * Verifies Firebase ID Token, checks Firestore adminUsers/{uid}, validates SUPER_ADMIN role & ACTIVE status.
 * Rejects role spoofing attempts via headers or request bodies.
 */
export async function resolveAdminUser(authHeader?: string, req?: Request): Promise<AdminAuthResult> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      valid: false,
      status: 401,
      error: 'UNAUTHORIZED',
      message: 'Valid Authorization Bearer token is required.',
    };
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return {
      valid: false,
      status: 401,
      error: 'EMPTY_TOKEN',
      message: 'Authentication token cannot be empty.',
    };
  }

  const appEnv = process.env.APP_ENV?.toLowerCase();
  const isTestAuthEnabled = String(process.env.ENABLE_TEST_AUTH).toLowerCase() === 'true' || process.env.ENABLE_TEST_AUTH === '1';
  let uid = '';

  let tokenEmail = '';

  // Server-authoritative internal dispatch token
  if (token === SERVER_TXN_TOKEN) {
    uid = AUTHORITATIVE_SUPER_ADMIN_UID;
  } else if (token.startsWith('test-role-')) {
    const roleKey = token.replace('test-role-', '').trim();
    if (roleKey === 'RETAILER') uid = 'TEST-RETAILER-01';
    else if (roleKey === 'WAREHOUSE_STAFF') uid = 'TEST-WH-STAFF-01';
    else if (roleKey === 'WAREHOUSE_MANAGER') uid = 'TEST-WH-MANAGER-01';
    else if (roleKey === 'DELIVERY_STAFF') uid = 'TEST-DELIVERY-01';
  } else if (token.startsWith('test-uid-')) {
    if (!appEnv || appEnv === 'production' || !isTestAuthEnabled) {
      await logAdminAudit({
        action: 'ADMIN_ACCESS_DENIED',
        adminUid: token.replace('test-uid-', '').trim() || 'ANONYMOUS',
        targetType: 'SECURITY_GATE',
        targetId: 'TEST_AUTH_PROBE',
        metadata: { reason: 'TEST_AUTH_FORBIDDEN_IN_PRODUCTION' },
        req,
      });
      return {
        valid: false,
        status: 401,
        error: 'TEST_AUTH_FORBIDDEN',
        message: 'Test authentication is strictly forbidden in production environment.',
      };
    }
    uid = token.replace('test-uid-', '').trim();
  } else {
    // Authoritative Token Verification: Firebase Admin SDK with Identity Toolkit fallback
    try {
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        uid = decoded.uid;
        tokenEmail = decoded.email || '';
      } catch {
        const lookupUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${cfg.apiKey}`;
        const resp = await fetch(lookupUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: token }),
        });
        const data = await resp.json();
        if (resp.ok && data.users && data.users.length > 0) {
          uid = data.users[0].localId;
          tokenEmail = data.users[0].email || '';
        } else {
          await logAdminAudit({
            action: 'ADMIN_ACCESS_DENIED',
            adminUid: 'UNVERIFIED',
            targetType: 'SECURITY_GATE',
            targetId: 'INVALID_TOKEN_PROBE',
            metadata: { reason: 'INVALID_TOKEN' },
            req,
          });
          return {
            valid: false,
            status: 401,
            error: 'INVALID_TOKEN',
            message: 'Token verification failed. Token is invalid or expired.',
          };
        }
      }
    } catch {
      return {
        valid: false,
        status: 401,
        error: 'TOKEN_VERIFICATION_FAILED',
        message: 'Unable to verify authentication token.',
      };
    }
  }

  if (!uid) {
    return {
      valid: false,
      status: 401,
      error: 'INVALID_UID',
      message: 'Unable to derive user identity from token.',
    };
  }

  // Authoritative Lookup in adminUsers/{uid} collection
  try {
    const adminDocRef = doc(db, 'adminUsers', uid);
    let adminSnap = await getDoc(adminDocRef);

    if (!adminSnap.exists() && tokenEmail) {
      try {
        const qSnap = await getDocs(query(collection(db, 'adminUsers'), where('email', '==', tokenEmail.toLowerCase())));
        if (!qSnap.empty) {
          adminSnap = qSnap.docs[0];
        }
      } catch (qErr: any) {
        console.warn('Note searching adminUsers by email:', qErr.message);
      }
    }

    // If account signed in via authoritative CEO/governance email, provision or link adminUsers record
    const isAuthorizedAdminEmail = tokenEmail && (
      tokenEmail.toLowerCase() === 'ceo.mrfutkar@gmail.com' ||
      tokenEmail.toLowerCase() === 'akashgupta30037@gmail.com'
    );

    if (!adminSnap.exists() && isAuthorizedAdminEmail) {
      const now = new Date().toISOString();
      const adminRecord: AdminUser = {
        uid,
        name: 'Akash Gupta (Super Administrator)',
        mobile: '+919810012345',
        email: tokenEmail,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
        createdBy: 'AUTHORITATIVE_GOOGLE_AUTH_LOGIN',
        permissionsVersion: 1,
      };
      await setDoc(adminDocRef, {
        ...adminRecord,
        _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
      });
      adminSnap = await getDoc(adminDocRef);
    }

    if (!adminSnap.exists()) {
      await logAdminAudit({
        action: 'ADMIN_ACCESS_DENIED',
        adminUid: uid,
        targetType: 'SECURITY_GATE',
        targetId: uid,
        metadata: { reason: 'UNKNOWN_ADMIN_UID', attemptedUid: uid },
        req,
      });
      return {
        valid: false,
        status: 403,
        error: 'FORBIDDEN',
        message: 'Admin access is not authorized for this account.',
      };
    }

    const adminData = adminSnap.data() as AdminUser;

    // 1. Verify Role is strictly SUPER_ADMIN
    // Client role headers (x-role) and request body roles are strictly ignored
    if (adminData.role !== 'SUPER_ADMIN') {
      await logAdminAudit({
        action: 'ADMIN_ACCESS_DENIED',
        adminUid: uid,
        adminName: adminData.name,
        targetType: 'SECURITY_GATE',
        targetId: uid,
        metadata: { reason: 'INSUFFICIENT_ADMIN_ROLE', foundRole: adminData.role },
        req,
      });
      return {
        valid: false,
        status: 403,
        error: 'FORBIDDEN',
        message: 'Insufficient admin privileges. Operation requires SUPER_ADMIN role.',
      };
    }

    // 2. Verify Account Status
    if (adminData.status === 'SUSPENDED') {
      await logAdminAudit({
        action: 'ADMIN_ACCESS_DENIED',
        adminUid: uid,
        adminName: adminData.name,
        targetType: 'SECURITY_GATE',
        targetId: uid,
        metadata: { reason: 'ACCOUNT_SUSPENDED' },
        req,
      });
      return {
        valid: false,
        status: 403,
        error: 'FORBIDDEN',
        message: 'Admin account is suspended. Contact system administrator.',
      };
    }

    if (adminData.status === 'DISABLED' || (adminData as any).isActive === false) {
      await logAdminAudit({
        action: 'ADMIN_ACCESS_DENIED',
        adminUid: uid,
        adminName: adminData.name,
        targetType: 'SECURITY_GATE',
        targetId: uid,
        metadata: { reason: 'ACCOUNT_DISABLED' },
        req,
      });
      return {
        valid: false,
        status: 403,
        error: 'FORBIDDEN',
        message: 'Admin account is disabled.',
      };
    }

    if (adminData.status !== 'ACTIVE') {
      await logAdminAudit({
        action: 'ADMIN_ACCESS_DENIED',
        adminUid: uid,
        adminName: adminData.name,
        targetType: 'SECURITY_GATE',
        targetId: uid,
        metadata: { reason: 'ACCOUNT_NOT_ACTIVE', status: adminData.status },
        req,
      });
      return {
        valid: false,
        status: 403,
        error: 'FORBIDDEN',
        message: 'Admin account is not active.',
      };
    }

    return {
      valid: true,
      status: 200,
      adminUser: {
        ...adminData,
        uid,
      },
    };
  } catch (err: any) {
    if (
      err.code === 'permission-denied' ||
      err.code === 'not-found' ||
      err.message?.includes('Missing or insufficient permissions')
    ) {
      await logAdminAudit({
        action: 'ADMIN_ACCESS_DENIED',
        adminUid: uid,
        targetType: 'SECURITY_GATE',
        targetId: uid,
        metadata: { reason: 'UNAUTHORIZED_OR_NONEXISTENT_ADMIN', attemptedUid: uid },
        req,
      });
      return {
        valid: false,
        status: 403,
        error: 'FORBIDDEN',
        message: 'Admin access is not authorized for this account.',
      };
    }
    console.error('Error querying adminUsers collection:', err.message);
    return {
      valid: false,
      status: 500,
      error: 'SERVER_ERROR',
      message: 'An internal server error occurred while verifying admin privileges.',
    };
  }
}

/**
 * Express Middleware: Requires caller to be an authenticated active SUPER_ADMIN
 */
export function requireSuperAdmin() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const authResult = await resolveAdminUser(authHeader, req);

    if (!authResult.valid || !authResult.adminUser) {
      return res.status(authResult.status).json({
        success: false,
        error: authResult.error || 'FORBIDDEN',
        message: authResult.message || 'Access denied.',
      });
    }

    // Attach validated admin user to request
    (req as any).adminUser = authResult.adminUser;
    next();
  };
}
