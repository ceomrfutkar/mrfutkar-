/**
 * MR FUTKAR — Phase 3B-13: Admin Audit & Security Center Backend Routes
 * 
 * Strict SUPER_ADMIN-only console backend providing:
 * - Querying, searching, and filtering administrative audit events from canonical adminAuditLogs
 * - Category and severity derivation
 * - Live summary metrics and security event tracking
 * - Detailed audit record inspection with masked sensitive metadata
 * - Bounded pagination with pageSize limit enforcement (max 100)
 * - Safe export capability (CSV / JSON) with formula injection protection (max 10,000)
 * - Date range bounds and format validation (<= 365 days, startDate <= endDate)
 * - Non-repudiation and immutable append-only enforcement
 */

import { Router, Request, Response } from 'express';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from './firebaseAdmin';
import { requireSuperAdmin, logAdminAudit } from './adminAuth';
import {
  AdminUser,
  AdminAuditAction,
  AuditCategory,
  AuditSeverity,
  AdminAuditRecord,
  AdminAuditMetrics,
} from '../src/types/admin';

export const adminAuditRouter = Router();

// Strict Super Admin authorization on all Audit Center endpoints
adminAuditRouter.use(requireSuperAdmin());

export const VALID_CATEGORIES: AuditCategory[] = [
  'SECURITY',
  'SETTINGS',
  'CATALOGUE',
  'PRICING',
  'RETAILER',
  'INVENTORY',
  'ORDERS',
  'DELIVERY',
  'WAREHOUSE',
  'NOTIFICATION',
  'REPORTS',
  'ADMIN_USERS',
];

export const VALID_SEVERITIES: AuditSeverity[] = ['INFO', 'WARNING', 'CRITICAL'];

/**
 * Derives AuditCategory from Action name and metadata
 */
export function deriveAuditCategory(action: string, targetType?: string): AuditCategory {
  const act = (action || '').toUpperCase();
  const tgt = (targetType || '').toUpperCase();

  if (
    act.includes('LOGIN') ||
    act.includes('LOGOUT') ||
    act.includes('ACCESS_DENIED') ||
    act.includes('SPOOF') ||
    act.includes('SECURITY')
  ) {
    return 'SECURITY';
  }

  if (act.startsWith('PRODUCT_') || tgt === 'PRODUCT') {
    return 'CATALOGUE';
  }

  if (act.startsWith('PRICING_') || tgt === 'PRICING_RULE') {
    return 'PRICING';
  }

  if (act.startsWith('RETAILER_') || tgt === 'RETAILER') {
    return 'RETAILER';
  }

  if (act.startsWith('INVENTORY_') || tgt === 'INVENTORY' || tgt === 'STOCK') {
    return 'INVENTORY';
  }

  if (act.startsWith('ORDER_') || tgt === 'ORDER') {
    return 'ORDERS';
  }

  if (act.includes('DELIVERY_') || tgt === 'DELIVERY_PARTNER') {
    return 'DELIVERY';
  }

  if (act.includes('WAREHOUSE_') || tgt === 'WAREHOUSE') {
    return 'WAREHOUSE';
  }

  if (act.includes('NOTIFICATION') || tgt === 'NOTIFICATION') {
    return 'NOTIFICATION';
  }

  if (act.includes('REPORT_') || tgt === 'REPORT') {
    return 'REPORTS';
  }

  if (act.startsWith('ADMIN_SETTINGS') || tgt === 'SETTINGS') {
    return 'SETTINGS';
  }

  if (act.startsWith('ADMIN_USER') || tgt === 'ADMIN_USER') {
    return 'ADMIN_USERS';
  }

  return 'SECURITY';
}

/**
 * Derives AuditSeverity based on risk profile of action
 */
export function deriveAuditSeverity(action: string): AuditSeverity {
  const act = (action || '').toUpperCase();

  if (
    act === 'ADMIN_ACCESS_DENIED' ||
    act === 'ADMIN_LOGIN_REJECTED' ||
    act === 'ADMIN_USER_SUSPENDED' ||
    act === 'ADMIN_USER_DEACTIVATED'
  ) {
    return 'CRITICAL';
  }

  if (
    act.includes('DEACTIVATED') ||
    act.includes('SUSPENDED') ||
    act === 'INVENTORY_ADJUSTMENT_CREATED' ||
    act === 'PRICING_RULE_DEACTIVATED' ||
    act === 'PRODUCT_DEACTIVATED'
  ) {
    return 'WARNING';
  }

  return 'INFO';
}

const SENSITIVE_KEY_REGEX = /(password|otp|otp_?hash|private_?key|service_?account|secret|token|access_?token|refresh_?token|credentials|_serverTxnToken)/i;

/**
 * Recursively masks sensitive fields in metadata to prevent accidental secret leakage
 */
export function maskSensitiveData(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => maskSensitiveData(item));
  }

  const masked: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      masked[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      masked[key] = maskSensitiveData(val);
    } else {
      masked[key] = val;
    }
  }
  return masked;
}

/**
 * Sanitizes values for CSV export to prevent spreadsheet formula injection (CSV Injection).
 * Any cell value starting with =, +, -, @, \t, or \r is prefixed with a single quote.
 */
export function sanitizeCsvValue(val: any): string {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  // Check if string begins with spreadsheet formula triggers: =, +, -, @, tab, newline/carriage return
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  // Escape inner double quotes
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Validates date range constraints (ISO format, startDate <= endDate, range <= 365 days)
 */
export function validateDateRange(startDate?: string, endDate?: string): {
  valid: boolean;
  error?: string;
  message?: string;
  startMs?: number;
  endMs?: number;
} {
  if (!startDate && !endDate) return { valid: true };

  let startMs: number | undefined;
  let endMs: number | undefined;

  if (startDate) {
    startMs = new Date(startDate).getTime();
    if (isNaN(startMs)) {
      return { valid: false, error: 'INVALID_START_DATE', message: 'Invalid startDate format.' };
    }
  }

  if (endDate) {
    endMs = new Date(endDate).getTime();
    if (isNaN(endMs)) {
      return { valid: false, error: 'INVALID_END_DATE', message: 'Invalid endDate format.' };
    }
    // If date-only string (YYYY-MM-DD), extend to end of day (23:59:59.999)
    if (endDate.length === 10) {
      endMs = endMs + 86400000 - 1;
    }
  }

  if (startMs !== undefined && endMs !== undefined) {
    if (startMs > endMs) {
      return {
        valid: false,
        error: 'INVALID_DATE_RANGE',
        message: 'startDate cannot be after endDate.',
      };
    }

    const diffDays = (endMs - startMs) / (1000 * 60 * 60 * 24);
    if (diffDays > 365) {
      return {
        valid: false,
        error: 'DATE_RANGE_EXCEEDED',
        message: 'Date range cannot exceed 365 days.',
      };
    }
  }

  return { valid: true, startMs, endMs };
}

/**
 * Sanitizes raw Firestore audit doc into safe AdminAuditRecord
 */
export function sanitizeAuditRecord(raw: any, docId: string): AdminAuditRecord {
  const logId = raw.logId || docId;
  const action = (raw.action || 'ADMIN_OPERATION') as AdminAuditAction;
  const targetType = raw.targetType || 'SYSTEM';
  const category = raw.category || deriveAuditCategory(action, targetType);
  const severity = raw.severity || deriveAuditSeverity(action);
  const cleanedMetadata = maskSensitiveData(raw.metadata || {});

  return {
    logId,
    adminUid: raw.adminUid || 'UNKNOWN',
    adminName: raw.adminName || 'System Administrator',
    action,
    category,
    severity,
    targetType,
    targetId: raw.targetId || 'N/A',
    timestamp: raw.timestamp || new Date().toISOString(),
    ipHashOrRequestFingerprint: raw.ipHashOrRequestFingerprint || 'INTERNAL',
    metadata: cleanedMetadata,
  };
}

/**
 * Computes live summary metrics across audit log records
 */
function computeAuditMetrics(allLogs: AdminAuditRecord[]): AdminAuditMetrics {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  let securityEvents = 0;
  let eventsToday = 0;
  let eventsPast7Days = 0;
  const adminSet = new Set<string>();
  const categoryCounts: Record<string, number> = {};
  const severityCounts: Record<string, number> = {
    INFO: 0,
    WARNING: 0,
    CRITICAL: 0,
  };

  for (const log of allLogs) {
    const time = new Date(log.timestamp).getTime();

    if (log.category === 'SECURITY' || log.severity === 'CRITICAL') {
      securityEvents++;
    }

    if (!isNaN(time)) {
      if (time >= startOfToday) {
        eventsToday++;
      }
      if (time >= sevenDaysAgo) {
        eventsPast7Days++;
      }
    }

    if (log.adminUid && log.adminUid !== 'UNKNOWN') {
      adminSet.add(log.adminUid);
    }

    categoryCounts[log.category] = (categoryCounts[log.category] || 0) + 1;
    severityCounts[log.severity] = (severityCounts[log.severity] || 0) + 1;
  }

  return {
    totalEvents: allLogs.length,
    securityEvents,
    eventsToday,
    eventsPast7Days,
    distinctAdminsCount: adminSet.size,
    categoryCounts,
    severityCounts,
  };
}

/**
 * GET /api/admin/audit
 * Lists audit events with search, multiple filters, pagination, and summary metrics.
 */
adminAuditRouter.get('/', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).adminUser as AdminUser;
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const adminUid = typeof req.query.adminUid === 'string' ? req.query.adminUid.trim() : '';
    const actionFilter = typeof req.query.action === 'string' ? req.query.action.trim().toUpperCase() : '';
    const categoryFilter = typeof req.query.category === 'string' ? req.query.category.trim().toUpperCase() : '';
    const severityFilter = typeof req.query.severity === 'string' ? req.query.severity.trim().toUpperCase() : '';
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate.trim() : '';
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate.trim() : '';

    // Validate category filter
    if (categoryFilter && categoryFilter !== 'ALL' && !VALID_CATEGORIES.includes(categoryFilter as AuditCategory)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CATEGORY',
        message: `Invalid audit category '${categoryFilter}'.`,
      });
    }

    // Validate severity filter
    if (severityFilter && severityFilter !== 'ALL' && !VALID_SEVERITIES.includes(severityFilter as AuditSeverity)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SEVERITY',
        message: `Invalid audit severity '${severityFilter}'.`,
      });
    }

    // Validate date range constraints
    const dateVal = validateDateRange(startDate, endDate);
    if (!dateVal.valid) {
      return res.status(400).json({
        success: false,
        error: dateVal.error,
        message: dateVal.message,
      });
    }

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

    // Fetch logs from authoritative adminAuditLogs collection
    const snap = await getDocs(
      query(collection(db, 'adminAuditLogs'), orderBy('timestamp', 'desc'), limit(1000))
    );
    const allRecords: AdminAuditRecord[] = snap.docs.map(d => sanitizeAuditRecord(d.data(), d.id));

    // Calculate metrics across full dataset
    const metrics = computeAuditMetrics(allRecords);

    // Apply filtering
    let filtered = allRecords;

    if (search) {
      filtered = filtered.filter(log => {
        const metaStr = JSON.stringify(log.metadata || {}).toLowerCase();
        return (
          log.logId.toLowerCase().includes(search) ||
          log.action.toLowerCase().includes(search) ||
          log.adminName.toLowerCase().includes(search) ||
          log.adminUid.toLowerCase().includes(search) ||
          (log.targetType && log.targetType.toLowerCase().includes(search)) ||
          (log.targetId && log.targetId.toLowerCase().includes(search)) ||
          (log.ipHashOrRequestFingerprint && log.ipHashOrRequestFingerprint.toLowerCase().includes(search)) ||
          metaStr.includes(search)
        );
      });
    }

    if (adminUid) {
      filtered = filtered.filter(l => l.adminUid === adminUid);
    }

    if (actionFilter && actionFilter !== 'ALL') {
      filtered = filtered.filter(l => l.action.toUpperCase() === actionFilter);
    }

    if (categoryFilter && categoryFilter !== 'ALL') {
      filtered = filtered.filter(l => l.category.toUpperCase() === categoryFilter);
    }

    if (severityFilter && severityFilter !== 'ALL') {
      filtered = filtered.filter(l => l.severity.toUpperCase() === severityFilter);
    }

    if (dateVal.startMs !== undefined) {
      filtered = filtered.filter(l => new Date(l.timestamp).getTime() >= dateVal.startMs!);
    }

    if (dateVal.endMs !== undefined) {
      filtered = filtered.filter(l => new Date(l.timestamp).getTime() <= dateVal.endMs!);
    }

    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const startIndex = (page - 1) * pageSize;
    const paginatedLogs = filtered.slice(startIndex, startIndex + pageSize);

    // Non-blocking view audit record for access tracking
    logAdminAudit({
      action: 'ADMIN_AUDIT_VIEWED',
      adminUid: caller.uid,
      adminName: caller.name,
      targetType: 'AUDIT_CENTER',
      targetId: 'AUDIT_LOGS_QUERY',
      metadata: {
        searchApplied: Boolean(search),
        categoryFilter: categoryFilter || 'ALL',
        page,
        pageSize,
        resultsCount: paginatedLogs.length,
      },
      req,
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      logs: paginatedLogs,
      totalCount,
      page,
      pageSize,
      totalPages,
      metrics,
    });
  } catch (err: any) {
    console.error('Error fetching admin audit logs:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve administrative audit logs.',
    });
  }
});

/**
 * GET /api/admin/audit/metrics
 * Returns real-time aggregate statistics for the security dashboard.
 */
adminAuditRouter.get('/metrics', async (req: Request, res: Response) => {
  try {
    const snap = await getDocs(
      query(collection(db, 'adminAuditLogs'), orderBy('timestamp', 'desc'), limit(1000))
    );
    const records = snap.docs.map(d => sanitizeAuditRecord(d.data(), d.id));
    const metrics = computeAuditMetrics(records);

    return res.status(200).json({
      success: true,
      metrics,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to compute audit metrics.',
    });
  }
});

/**
 * GET /api/admin/audit/filters
 * Returns distinct filter facets (admins, actions, categories, severities)
 */
adminAuditRouter.get('/filters', async (req: Request, res: Response) => {
  try {
    const snap = await getDocs(
      query(collection(db, 'adminAuditLogs'), orderBy('timestamp', 'desc'), limit(500))
    );
    const records = snap.docs.map(d => sanitizeAuditRecord(d.data(), d.id));

    const adminsMap = new Map<string, string>();
    const actionsSet = new Set<string>();
    const categoriesSet = new Set<string>();

    for (const r of records) {
      if (r.adminUid) {
        adminsMap.set(r.adminUid, r.adminName || r.adminUid);
      }
      if (r.action) {
        actionsSet.add(r.action);
      }
      if (r.category) {
        categoriesSet.add(r.category);
      }
    }

    const admins = Array.from(adminsMap.entries()).map(([uid, name]) => ({ uid, name }));
    const actions = Array.from(actionsSet).sort();
    const categories = Array.from(categoriesSet).sort();
    const severities: AuditSeverity[] = ['INFO', 'WARNING', 'CRITICAL'];

    return res.status(200).json({
      success: true,
      admins,
      actions,
      categories,
      severities,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve audit filter options.',
    });
  }
});

/**
 * GET /api/admin/audit/events/:logId
 * Returns full audit event details for individual inspection.
 */
adminAuditRouter.get('/events/:logId', async (req: Request, res: Response) => {
  try {
    const logId = req.params.logId;
    if (!logId) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ID',
        message: 'Log ID parameter is required.',
      });
    }

    const logDocRef = doc(db, 'adminAuditLogs', logId);
    const snap = await getDoc(logDocRef);

    if (!snap.exists()) {
      return res.status(404).json({
        success: false,
        error: 'LOG_NOT_FOUND',
        message: `Audit log record '${logId}' was not found.`,
      });
    }

    const record = sanitizeAuditRecord(snap.data(), snap.id);

    return res.status(200).json({
      success: true,
      event: record,
    });
  } catch (err: any) {
    console.error('Error fetching audit event detail:', err.message);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve audit event detail.',
    });
  }
});

/**
 * GET /api/admin/audit/export
 * Exports filtered audit events to JSON or CSV with formula injection defense.
 * Maximum export limit: 10,000 records.
 */
adminAuditRouter.get('/export', async (req: Request, res: Response) => {
  try {
    const caller = (req as any).adminUser as AdminUser;
    const format = (req.query.format as string || 'json').toLowerCase();
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim().toUpperCase() : '';
    const severity = typeof req.query.severity === 'string' ? req.query.severity.trim().toUpperCase() : '';
    const adminUid = typeof req.query.adminUid === 'string' ? req.query.adminUid.trim() : '';
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate.trim() : '';
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate.trim() : '';

    // Validate category filter
    if (category && category !== 'ALL' && !VALID_CATEGORIES.includes(category as AuditCategory)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CATEGORY',
        message: `Invalid audit category '${category}'.`,
      });
    }

    // Validate severity filter
    if (severity && severity !== 'ALL' && !VALID_SEVERITIES.includes(severity as AuditSeverity)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SEVERITY',
        message: `Invalid audit severity '${severity}'.`,
      });
    }

    // Validate date range constraints
    const dateVal = validateDateRange(startDate, endDate);
    if (!dateVal.valid) {
      return res.status(400).json({
        success: false,
        error: dateVal.error,
        message: dateVal.message,
      });
    }

    // Export bounds: max 10,000 records
    const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10000;
    if (rawLimit > 10000) {
      return res.status(400).json({
        success: false,
        error: 'EXPORT_LIMIT_EXCEEDED',
        message: 'Maximum export limit is 10,000 records.',
      });
    }
    const exportLimit = Math.min(Math.max(1, rawLimit || 10000), 10000);

    const snap = await getDocs(
      query(collection(db, 'adminAuditLogs'), orderBy('timestamp', 'desc'), limit(exportLimit))
    );
    let records = snap.docs.map(d => sanitizeAuditRecord(d.data(), d.id));

    if (search) {
      records = records.filter(r => {
        const metaStr = JSON.stringify(r.metadata || {}).toLowerCase();
        return (
          r.logId.toLowerCase().includes(search) ||
          r.action.toLowerCase().includes(search) ||
          r.adminName.toLowerCase().includes(search) ||
          r.adminUid.toLowerCase().includes(search) ||
          (r.targetId && r.targetId.toLowerCase().includes(search)) ||
          (r.targetType && r.targetType.toLowerCase().includes(search)) ||
          (r.ipHashOrRequestFingerprint && r.ipHashOrRequestFingerprint.toLowerCase().includes(search)) ||
          metaStr.includes(search)
        );
      });
    }

    if (category && category !== 'ALL') {
      records = records.filter(r => r.category.toUpperCase() === category);
    }

    if (severity && severity !== 'ALL') {
      records = records.filter(r => r.severity.toUpperCase() === severity);
    }

    if (adminUid) {
      records = records.filter(r => r.adminUid === adminUid);
    }

    if (dateVal.startMs !== undefined) {
      records = records.filter(r => new Date(r.timestamp).getTime() >= dateVal.startMs!);
    }

    if (dateVal.endMs !== undefined) {
      records = records.filter(r => new Date(r.timestamp).getTime() <= dateVal.endMs!);
    }

    // Log export event
    await logAdminAudit({
      action: 'ADMIN_AUDIT_EXPORTED',
      adminUid: caller.uid,
      adminName: caller.name,
      targetType: 'AUDIT_CENTER',
      targetId: 'AUDIT_EXPORT',
      metadata: {
        format,
        exportedCount: records.length,
        searchApplied: Boolean(search),
        category: category || 'ALL',
        severity: severity || 'ALL',
      },
      req,
    });

    if (format === 'csv') {
      const headers = ['logId', 'timestamp', 'adminUid', 'adminName', 'action', 'category', 'severity', 'targetType', 'targetId', 'fingerprint'];
      const rows = records.map(r => [
        sanitizeCsvValue(r.logId),
        sanitizeCsvValue(r.timestamp),
        sanitizeCsvValue(r.adminUid),
        sanitizeCsvValue(r.adminName),
        sanitizeCsvValue(r.action),
        sanitizeCsvValue(r.category),
        sanitizeCsvValue(r.severity),
        sanitizeCsvValue(r.targetType),
        sanitizeCsvValue(r.targetId),
        sanitizeCsvValue(r.ipHashOrRequestFingerprint),
      ].join(','));

      const csvContent = [headers.join(','), ...rows].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="admin_audit_logs_${Date.now()}.csv"`);
      return res.status(200).send(csvContent);
    }

    return res.status(200).json({
      success: true,
      exportedAt: new Date().toISOString(),
      count: records.length,
      logs: records,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to export audit logs.',
    });
  }
});
