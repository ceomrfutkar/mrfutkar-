import dotenv from 'dotenv';
dotenv.config({ override: true, quiet: true });
import crypto from 'crypto';

export function getOtpSecret(): string {
  const secret = process.env.DELIVERY_OTP_SECRET;
  if (process.env.APP_ENV === 'production') {
    if (!secret || secret.trim().length < 32) {
      throw new Error('FATAL: DELIVERY_OTP_SECRET is required in production environment with minimum 32 characters (256-bit cryptographically secure string) and no fallback salt permitted.');
    }
    return secret.trim();
  }
  return secret || 'MR_FUTKAR_DELIVERY_OTP_SALT_WH01';
}

export interface DeliveryOtpRecord {
  status: 'PENDING' | 'VERIFIED' | 'EXPIRED' | 'BLOCKED';
  createdAt: string;
  expiresAt: string;
  attemptCount: number;
  verifiedAt: string | null;
  otpHash: string;
}

/**
 * Generates a 6-digit cryptographically secure random Delivery OTP.
 * Uses CSPRNG rather than pseudo-random number generators.
 */
export function generateCryptoOtp(): string {
  // Returns a 6-digit string between 100000 and 999999
  const num = crypto.randomInt(100000, 1000000);
  return num.toString();
}

/**
 * Computes SHA-256 hash of (orderId + otp + salt)
 * Plaintext OTP is never stored directly in Firestore documents.
 */
export function hashDeliveryOtp(orderId: string, otp: string): string {
  const secret = getOtpSecret();
  return crypto
    .createHash('sha256')
    .update(`${orderId}:${otp.trim()}:${secret}`)
    .digest('hex');
}

/**
 * Validates whether the submitted OTP matches the stored hash
 */
export function verifyOtpHash(orderId: string, inputOtp: string, storedHash: string): boolean {
  if (!inputOtp || !storedHash) return false;
  const computedHash = hashDeliveryOtp(orderId, inputOtp);
  return crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(storedHash));
}

/**
 * Validates recipient name
 * Must be non-empty, trimmed, 2-100 characters, without HTML or script tags.
 */
export function validateRecipientName(name: unknown): { valid: boolean; cleanName: string; error?: string } {
  if (typeof name !== 'string') {
    return { valid: false, cleanName: '', error: 'Recipient name must be a string.' };
  }
  const clean = name.trim();
  if (clean.length < 2) {
    return { valid: false, cleanName: '', error: 'Recipient name is required (minimum 2 characters).' };
  }
  if (clean.length > 100) {
    return { valid: false, cleanName: '', error: 'Recipient name cannot exceed 100 characters.' };
  }
  if (/<[^>]*>|javascript:|alert\(|script/i.test(clean)) {
    return { valid: false, cleanName: '', error: 'Recipient name contains invalid characters or HTML.' };
  }
  return { valid: true, cleanName: clean };
}

/**
 * Validates POD media (photo or signature)
 * Allowed types: JPEG, PNG, WebP
 * Size limit: 5MB
 */
export function validatePodMedia(
  type: string,
  dataUrl: unknown
): { valid: boolean; mimeType: string; sizeBytes: number; error?: string } {
  if (type !== 'photo' && type !== 'signature') {
    return { valid: false, mimeType: '', sizeBytes: 0, error: "Type must be either 'photo' or 'signature'." };
  }

  if (typeof dataUrl !== 'string' || !dataUrl.trim()) {
    return { valid: false, mimeType: '', sizeBytes: 0, error: 'A valid image dataUrl is required.' };
  }

  const clean = dataUrl.trim();

  // Check URL vs Data URL
  if (clean.startsWith('https://')) {
    // Cloud storage reference
    return { valid: true, mimeType: 'image/jpeg', sizeBytes: 1024 };
  }

  const match = clean.match(/^data:(image\/(jpeg|jpg|png|webp));base64,(.+)$/i);
  if (!match) {
    return {
      valid: false,
      mimeType: '',
      sizeBytes: 0,
      error: 'Invalid image format. Allowed formats: JPEG, PNG, WebP.',
    };
  }

  const mimeType = match[1].toLowerCase();
  const base64Data = match[3];
  // Calculate size in bytes
  const sizeBytes = Math.floor((base64Data.length * 3) / 4);

  // 5MB limit = 5 * 1024 * 1024 bytes
  if (sizeBytes > 5 * 1024 * 1024) {
    return {
      valid: false,
      mimeType,
      sizeBytes,
      error: 'Uploaded file cannot exceed 5MB.',
    };
  }

  return { valid: true, mimeType, sizeBytes };
}

/**
 * Validates COD collected amount against order.grandTotal
 */
export function validateCodCollection(
  expectedAmount: number,
  collectedInput: unknown
): { valid: boolean; collectedNum: number; error?: string } {
  if (collectedInput === undefined || collectedInput === null || collectedInput === '') {
    return {
      valid: false,
      collectedNum: 0,
      error: 'AMOUNT_COLLECTED_REQUIRED: Exact amount collected must be specified for COD orders.',
    };
  }

  const collectedNum = Number(collectedInput);
  if (isNaN(collectedNum) || !Number.isFinite(collectedNum) || collectedNum < 0) {
    return {
      valid: false,
      collectedNum: 0,
      error: 'INVALID_COLLECTED_AMOUNT: Collected amount must be a positive number.',
    };
  }

  if (collectedNum > expectedAmount) {
    return {
      valid: false,
      collectedNum,
      error: `OVERCOLLECTION_NOT_PERMITTED: Collected amount (₹${collectedNum}) cannot exceed amount due (₹${expectedAmount}).`,
    };
  }

  if (collectedNum < expectedAmount) {
    return {
      valid: false,
      collectedNum,
      error: `UNDERCOLLECTION_NOT_PERMITTED: Full payment of ₹${expectedAmount} required for COD delivery handover.`,
    };
  }

  return { valid: true, collectedNum };
}
