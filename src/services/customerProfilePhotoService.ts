import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, auth } from '../config/firebase';
import { retailerRepository } from '../repositories/RetailerRepository';
import { AuthService } from './authService';

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates profile image format and size constraints.
 * Allowed: image/jpeg, image/png, image/webp.
 * Maximum file size: 5 MB.
 */
export function validateProfileImage(file: Blob | File | null | undefined): ImageValidationResult {
  if (!file) {
    return { valid: false, error: 'No image file selected.' };
  }

  const type = file.type?.toLowerCase();
  if (!type || !ALLOWED_IMAGE_TYPES.includes(type)) {
    return {
      valid: false,
      error: 'Invalid file format. Only JPG, PNG, and WebP images are allowed.',
    };
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    const sizeInMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File is too large (${sizeInMb}MB). Profile photo cannot exceed 5MB.`,
    };
  }

  return { valid: true };
}

/**
 * Extracts storage relative path from a full Firebase Storage download URL or raw path.
 */
export function extractStoragePath(urlOrPath: string): string {
  if (!urlOrPath) return '';
  if (urlOrPath.startsWith('data:')) {
    return urlOrPath;
  }
  if (!urlOrPath.startsWith('http://') && !urlOrPath.startsWith('https://')) {
    return urlOrPath;
  }

  try {
    const url = new URL(urlOrPath);
    // Typical Firebase Storage URL: .../o/customerProfiles%2F<uid>%2Fprofile.jpg?alt=media&...
    const match = url.pathname.match(/\/o\/([^?#]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  } catch {
    // ignore
  }

  return urlOrPath;
}

/**
 * Verifies whether a given Storage path or URL belongs to the authenticated user's UID.
 */
export function isOwnedStoragePath(urlOrPath: string, uid: string): boolean {
  if (!urlOrPath || !uid) return false;
  if (urlOrPath.startsWith('data:')) {
    return true;
  }
  const path = extractStoragePath(urlOrPath);
  return (
    path.startsWith(`customerProfiles/${uid}/`) ||
    path.startsWith(`retailers/${uid}/`)
  );
}

export class CustomerProfilePhotoService {
  /**
   * Helper to ensure an authenticated Firebase User is present.
   */
  private static async getAuthenticatedUser(): Promise<{ uid: string }> {
    let currentUser = auth.currentUser;
    if (currentUser && currentUser.uid) {
      return currentUser;
    }

    try {
      currentUser = await AuthService.ensureAuthenticatedUser();
      if (currentUser && currentUser.uid) {
        return currentUser;
      }
    } catch (err) {
      console.warn('Auto auth resolution notice:', err);
    }

    if (!currentUser || !currentUser.uid) {
      throw new Error('You must be signed in to update your profile photo.');
    }

    return currentUser;
  }

  /**
   * Converts an image file to an optimized, compact data URL if Firebase Storage is unavailable.
   */
  static async fileToOptimizedDataUrl(file: Blob | File): Promise<string> {
    const mimeType = file.type || 'image/jpeg';
    if (typeof FileReader !== 'undefined') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          try {
            if (typeof document !== 'undefined') {
              const img = new Image();
              img.onload = () => {
                try {
                  const canvas = document.createElement('canvas');
                  const maxDim = 400;
                  let width = img.width;
                  let height = img.height;
                  if (width > height) {
                    if (width > maxDim) {
                      height = Math.round((height * maxDim) / width);
                      width = maxDim;
                    }
                  } else {
                    if (height > maxDim) {
                      width = Math.round((width * maxDim) / height);
                      height = maxDim;
                    }
                  }
                  canvas.width = width;
                  canvas.height = height;
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    resolve(dataUrl);
                    return;
                  }
                  resolve(result);
                } catch {
                  resolve(result);
                }
              };
              img.onerror = () => resolve(result);
              img.src = result;
            } else {
              resolve(result);
            }
          } catch {
            resolve(result);
          }
        };
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(file);
      });
    }

    // Node.js buffer conversion fallback for test runners
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return `data:${mimeType};base64,${base64}`;
  }

  /**
   * Uploads an image to Firebase Storage under the authenticated customer's own directory.
   * Path: customerProfiles/{uid}/profile_{timestamp}.{ext}
   */
  static async uploadProfilePhoto(
    file: File | Blob,
    onProgress?: (progressPercent: number) => void
  ): Promise<{ downloadUrl: string; storagePath: string }> {
    let currentUser = auth.currentUser;
    if (!currentUser || !currentUser.uid) {
      try {
        currentUser = await AuthService.ensureAuthenticatedUser();
      } catch (err) {
        console.warn('Auto auth resolution notice:', err);
      }
    }

    if (!currentUser || !currentUser.uid) {
      throw new Error('You must be signed in to upload a profile photo.');
    }

    const validation = validateProfileImage(file);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid image file.');
    }

    const uid = currentUser.uid;
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const filename = `profile_${Date.now()}.${ext}`;
    const storagePath = `customerProfiles/${uid}/${filename}`;
    const storageRef = ref(storage, storagePath);

    let downloadUrl: string | null = null;

    try {
      if (onProgress && typeof uploadBytesResumable === 'function') {
        downloadUrl = await new Promise((resolve, reject) => {
          const uploadTask = uploadBytesResumable(storageRef, file, {
            contentType: file.type,
          });

          uploadTask.on(
            'state_changed',
            snapshot => {
              if (snapshot.totalBytes > 0) {
                const pct = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                onProgress(Math.min(100, Math.round(pct)));
              }
            },
            err => {
              console.warn('Firebase Storage upload task notice:', err);
              reject(err);
            },
            async () => {
              try {
                const url = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(url);
              } catch (err) {
                reject(err);
              }
            }
          );
        });
      } else {
        const snapshot = await uploadBytes(storageRef, file, {
          contentType: file.type,
        });
        downloadUrl = await getDownloadURL(snapshot.ref);
      }
    } catch (storageErr) {
      console.warn('Firebase Storage upload error, falling back to optimized inline data URL:', storageErr);
      if (onProgress) onProgress(100);
      downloadUrl = await this.fileToOptimizedDataUrl(file);
    }

    if (!downloadUrl) {
      throw new Error('Failed to process image upload.');
    }

    return { downloadUrl, storagePath };
  }

  /**
   * Complete partial-failure-safe DP update flow:
   * 1. Upload new image to customerProfiles/{uid}/
   * 2. Commit reference to Firestore profile
   * 3. If Firestore commit fails, delete orphan new image and keep old DP intact!
   * 4. Only after Firestore commit succeeds, delete previous DP from storage.
   */
  static async updateCustomerProfilePhoto(
    file: File | Blob,
    currentPhotoUrl?: string | null,
    onProgress?: (progressPercent: number) => void
  ): Promise<string> {
    const user = await this.getAuthenticatedUser();
    const uid = user.uid;

    // 1. Upload new image
    const { downloadUrl: newPhotoUrl, storagePath } = await this.uploadProfilePhoto(file, onProgress);

    // 2. Commit to Firestore
    try {
      await retailerRepository.updateProfilePhoto(uid, newPhotoUrl);
    } catch (firestoreError: any) {
      console.error('Firestore profile reference update failed, rolling back new image:', firestoreError);
      // Clean up orphaned newly uploaded file
      if (newPhotoUrl && !newPhotoUrl.startsWith('data:')) {
        try {
          const orphanRef = ref(storage, storagePath);
          await deleteObject(orphanRef);
        } catch (cleanupErr) {
          console.warn('Could not remove orphaned upload:', cleanupErr);
        }
      }
      throw new Error('Failed to update profile with new photo. Please try again.');
    }

    // 3. Only delete old photo after new profile reference is committed
    if (currentPhotoUrl && currentPhotoUrl !== newPhotoUrl && !currentPhotoUrl.startsWith('data:')) {
      try {
        await this.deletePhotoFromStorage(currentPhotoUrl, uid);
      } catch (deleteOldErr) {
        console.warn('Non-fatal: could not delete old profile photo from storage:', deleteOldErr);
      }
    }

    return newPhotoUrl;
  }

  /**
   * Removes customer's profile photo:
   * 1. Updates Firestore profile reference to null
   * 2. Deletes current photo from Storage if owned by this user
   */
  static async removeCustomerProfilePhoto(currentPhotoUrl?: string | null): Promise<void> {
    let currentUser = auth.currentUser;
    if (!currentUser || !currentUser.uid) {
      try {
        currentUser = await AuthService.ensureAuthenticatedUser();
      } catch (err) {
        console.warn('Auto auth resolution notice:', err);
      }
    }

    if (!currentUser || !currentUser.uid) {
      throw new Error('You must be signed in to remove your profile photo.');
    }

    const uid = currentUser.uid;

    // Update Firestore first
    await retailerRepository.updateProfilePhoto(uid, null);

    // If storage URL exists and is not data URL, delete from storage
    if (currentPhotoUrl && !currentPhotoUrl.startsWith('data:')) {
      try {
        await this.deletePhotoFromStorage(currentPhotoUrl, uid);
      } catch (err) {
        console.warn('Non-fatal: could not delete photo from storage:', err);
      }
    }
  }

  /**
   * Safely deletes an image from Firebase Storage only if ownership is verified.
   */
  static async deletePhotoFromStorage(urlOrPath: string, expectedUid: string): Promise<boolean> {
    if (!urlOrPath || !expectedUid) return false;
    if (urlOrPath.startsWith('data:')) {
      return true;
    }

    // Strict ownership verification: Prevent deleting files outside own UID directory
    if (!isOwnedStoragePath(urlOrPath, expectedUid)) {
      console.warn('Rejected attempt to delete storage object outside user directory:', urlOrPath);
      throw new Error('Unauthorized: You cannot delete photos belonging to another user.');
    }

    try {
      const storageRef = ref(storage, urlOrPath);
      await deleteObject(storageRef);
      return true;
    } catch (err: any) {
      if (err.code === 'storage/object-not-found') {
        return false;
      }
      console.warn('Delete storage photo notice:', err);
      return false;
    }
  }
}
