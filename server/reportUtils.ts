import { ReportDatePreset } from '../src/types/report';

export const IST_TIMEZONE = 'Asia/Kolkata';
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +05:30 in milliseconds

export interface ResolvedDateRange {
  success: boolean;
  dateFrom: string; // YYYY-MM-DD in IST
  dateTo: string;   // YYYY-MM-DD in IST
  startUtcMs: number;
  endUtcMs: number;
  preset: ReportDatePreset;
  error?: string;
  message?: string;
}

/**
 * Format a timestamp or date into IST YYYY-MM-DD
 */
export function getIstDateString(dateVal?: any): string {
  const ts = parseTimestamp(dateVal);
  if (ts === null) return '';
  const istDate = new Date(ts + IST_OFFSET_MS);
  const y = istDate.getUTCFullYear();
  const m = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(istDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse date or timestamp safely into UTC ms
 */
export function parseTimestamp(val: any): number | null {
  if (!val) return null;
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return isNaN(parsed) ? null : parsed;
  }
  if (val instanceof Date) {
    const t = val.getTime();
    return isNaN(t) ? null : t;
  }
  if (typeof val === 'object' && val !== null) {
    if (typeof val.toDate === 'function') {
      return val.toDate().getTime();
    }
    if (typeof val._seconds === 'number') {
      return val._seconds * 1000;
    }
  }
  return null;
}

/**
 * Check if a date falls within [startUtcMs, endUtcMs] inclusive
 */
export function isDateInRange(val: any, startUtcMs: number, endUtcMs: number): boolean {
  const ts = parseTimestamp(val);
  if (ts === null) return false;
  return ts >= startUtcMs && ts <= endUtcMs;
}

/**
 * Convert an IST YYYY-MM-DD string into start of day UTC ms
 */
export function istDateStringToStartUtcMs(dateStr: string): number | null {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return Date.UTC(y, m, d, 0, 0, 0, 0) - IST_OFFSET_MS;
}

/**
 * Convert an IST YYYY-MM-DD string into end of day UTC ms
 */
export function istDateStringToEndUtcMs(dateStr: string): number | null {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return Date.UTC(y, m, d, 23, 59, 59, 999) - IST_OFFSET_MS;
}

/**
 * Resolve and validate date range presets and custom boundaries
 * Guarantees IST timezone boundaries and maximum 365-day range window
 */
export function resolveDateRange(
  presetParam?: any,
  dateFromParam?: any,
  dateToParam?: any
): ResolvedDateRange {
  const VALID_PRESETS: ReportDatePreset[] = [
    'TODAY',
    'YESTERDAY',
    'LAST_7_DAYS',
    'LAST_30_DAYS',
    'THIS_MONTH',
    'LAST_MONTH',
    'CUSTOM',
  ];

  const rawPreset = typeof presetParam === 'string' ? presetParam.toUpperCase().trim() : '';
  const preset: ReportDatePreset = VALID_PRESETS.includes(rawPreset as any)
    ? (rawPreset as ReportDatePreset)
    : 'LAST_30_DAYS';

  const nowUtc = Date.now();
  const nowIst = new Date(nowUtc + IST_OFFSET_MS);
  const curY = nowIst.getUTCFullYear();
  const curM = nowIst.getUTCMonth();
  const curD = nowIst.getUTCDate();

  let startUtcMs = 0;
  let endUtcMs = 0;
  let dateFrom = '';
  let dateTo = '';

  if (preset === 'TODAY') {
    startUtcMs = Date.UTC(curY, curM, curD, 0, 0, 0, 0) - IST_OFFSET_MS;
    endUtcMs = Date.UTC(curY, curM, curD, 23, 59, 59, 999) - IST_OFFSET_MS;
    dateFrom = getIstDateString(startUtcMs);
    dateTo = getIstDateString(endUtcMs);
  } else if (preset === 'YESTERDAY') {
    const yestIst = new Date(Date.UTC(curY, curM, curD - 1));
    const yY = yestIst.getUTCFullYear();
    const yM = yestIst.getUTCMonth();
    const yD = yestIst.getUTCDate();
    startUtcMs = Date.UTC(yY, yM, yD, 0, 0, 0, 0) - IST_OFFSET_MS;
    endUtcMs = Date.UTC(yY, yM, yD, 23, 59, 59, 999) - IST_OFFSET_MS;
    dateFrom = getIstDateString(startUtcMs);
    dateTo = getIstDateString(endUtcMs);
  } else if (preset === 'LAST_7_DAYS') {
    const startIst = new Date(Date.UTC(curY, curM, curD - 6));
    startUtcMs = Date.UTC(startIst.getUTCFullYear(), startIst.getUTCMonth(), startIst.getUTCDate(), 0, 0, 0, 0) - IST_OFFSET_MS;
    endUtcMs = Date.UTC(curY, curM, curD, 23, 59, 59, 999) - IST_OFFSET_MS;
    dateFrom = getIstDateString(startUtcMs);
    dateTo = getIstDateString(endUtcMs);
  } else if (preset === 'LAST_30_DAYS') {
    const startIst = new Date(Date.UTC(curY, curM, curD - 29));
    startUtcMs = Date.UTC(startIst.getUTCFullYear(), startIst.getUTCMonth(), startIst.getUTCDate(), 0, 0, 0, 0) - IST_OFFSET_MS;
    endUtcMs = Date.UTC(curY, curM, curD, 23, 59, 59, 999) - IST_OFFSET_MS;
    dateFrom = getIstDateString(startUtcMs);
    dateTo = getIstDateString(endUtcMs);
  } else if (preset === 'THIS_MONTH') {
    startUtcMs = Date.UTC(curY, curM, 1, 0, 0, 0, 0) - IST_OFFSET_MS;
    endUtcMs = Date.UTC(curY, curM, curD, 23, 59, 59, 999) - IST_OFFSET_MS;
    dateFrom = getIstDateString(startUtcMs);
    dateTo = getIstDateString(endUtcMs);
  } else if (preset === 'LAST_MONTH') {
    const prevMonthDate = new Date(Date.UTC(curY, curM - 1, 1));
    const pY = prevMonthDate.getUTCFullYear();
    const pM = prevMonthDate.getUTCMonth();
    // Last day of previous month
    const lastDayPrevMonth = new Date(Date.UTC(curY, curM, 0)).getUTCDate();
    startUtcMs = Date.UTC(pY, pM, 1, 0, 0, 0, 0) - IST_OFFSET_MS;
    endUtcMs = Date.UTC(pY, pM, lastDayPrevMonth, 23, 59, 59, 999) - IST_OFFSET_MS;
    dateFrom = getIstDateString(startUtcMs);
    dateTo = getIstDateString(endUtcMs);
  } else if (preset === 'CUSTOM') {
    if (!dateFromParam || !dateToParam) {
      return {
        success: false,
        error: 'INVALID_DATE_RANGE',
        message: 'Both dateFrom and dateTo are required for CUSTOM date preset.',
        dateFrom: '',
        dateTo: '',
        startUtcMs: 0,
        endUtcMs: 0,
        preset: 'CUSTOM',
      };
    }

    const cleanFrom = String(dateFromParam).trim().substring(0, 10);
    const cleanTo = String(dateToParam).trim().substring(0, 10);

    const sUtc = istDateStringToStartUtcMs(cleanFrom);
    const eUtc = istDateStringToEndUtcMs(cleanTo);

    if (sUtc === null || eUtc === null) {
      return {
        success: false,
        error: 'INVALID_DATE_RANGE',
        message: 'Invalid date format. Expected YYYY-MM-DD.',
        dateFrom: cleanFrom,
        dateTo: cleanTo,
        startUtcMs: 0,
        endUtcMs: 0,
        preset: 'CUSTOM',
      };
    }

    if (sUtc > eUtc) {
      return {
        success: false,
        error: 'INVALID_DATE_RANGE',
        message: 'dateFrom cannot be greater than dateTo.',
        dateFrom: cleanFrom,
        dateTo: cleanTo,
        startUtcMs: sUtc,
        endUtcMs: eUtc,
        preset: 'CUSTOM',
      };
    }

    // Maximum 365 days check (allow 366 days for leap year cushion)
    const diffDays = (eUtc - sUtc) / (24 * 60 * 60 * 1000);
    if (diffDays > 366) {
      return {
        success: false,
        error: 'INVALID_DATE_RANGE',
        message: 'Date range cannot exceed 365 days.',
        dateFrom: cleanFrom,
        dateTo: cleanTo,
        startUtcMs: sUtc,
        endUtcMs: eUtc,
        preset: 'CUSTOM',
      };
    }

    startUtcMs = sUtc;
    endUtcMs = eUtc;
    dateFrom = cleanFrom;
    dateTo = cleanTo;
  }

  return {
    success: true,
    dateFrom,
    dateTo,
    startUtcMs,
    endUtcMs,
    preset,
  };
}

/**
 * Format currency to 2 decimal places safe number
 */
export function roundCurrency(val: number): number {
  if (isNaN(val) || !isFinite(val)) return 0;
  return Math.round(val * 100) / 100;
}

/**
 * Sanitize CSV cell and escape quotes
 * Protects against CSV / Spreadsheet Formula Injection (OWASP: =,+,-,@,\t,\r)
 */
function escapeCsvCell(cell: any): string {
  if (cell === null || cell === undefined) return '';
  let str = String(cell);
  // Neutralize formula execution in Excel / Google Sheets
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  // If string contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build CSV string from array of headers and rows with optional metadata headers
 */
export function generateCsv(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
  metadataHeaderLines: string[] = []
): string {
  const lines: string[] = [];

  for (const meta of metadataHeaderLines) {
    lines.push(`# ${meta}`);
  }

  lines.push(headers.map(escapeCsvCell).join(','));

  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }

  return lines.join('\r\n');
}
