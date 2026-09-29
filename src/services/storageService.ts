import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';

export class StorageService {
  /**
   * Generic image upload to Firebase Storage
   * Returns public download URL to be stored in Firestore
   */
  static async uploadImage(path: string, file: Blob | File): Promise<string> {
    try {
      const storageRef = ref(storage, path);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);
      return downloadUrl;
    } catch (err: any) {
      console.error('Firebase Storage upload failed:', err);
      throw new Error(err.message || 'Image upload to Firebase Storage failed');
    }
  }

  /**
   * Uploads FMCG product image
   */
  static async uploadProductImage(productId: string, file: File, filename?: string): Promise<string> {
    const name = filename || file.name || `image_${Date.now()}.jpg`;
    return this.uploadImage(`products/${productId}/${name}`, file);
  }

  /**
   * Uploads FMCG Brand Logo
   */
  static async uploadBrandLogo(brandId: string, file: File, filename?: string): Promise<string> {
    const name = filename || file.name || `logo_${Date.now()}.png`;
    return this.uploadImage(`brands/${brandId}/${name}`, file);
  }

  /**
   * Uploads Category Taxonomy Banner / Icon
   */
  static async uploadCategoryImage(categoryId: string, file: File, filename?: string): Promise<string> {
    const name = filename || file.name || `cat_${Date.now()}.jpg`;
    return this.uploadImage(`categories/${categoryId}/${name}`, file);
  }

  /**
   * Uploads Kirana Shop / Owner profile photo
   */
  static async uploadRetailerProfileImage(retailerId: string, file: File, filename?: string): Promise<string> {
    const name = filename || file.name || `shop_${Date.now()}.jpg`;
    return this.uploadImage(`retailers/${retailerId}/${name}`, file);
  }
}
