import { doc, getDoc, setDoc, getDocs, collection, limit, query } from 'firebase/firestore';
import { db } from '../src/config/firebase';
import { sampleBrands, sampleCategories } from '../src/data/categoriesAndBrands';
import { fmcgProducts } from '../src/data/fmcgCatalogue';
import { defaultBusinessSettings } from '../src/config/businessSettings';

export class SeedService {
  /**
   * Safe, repeatable seed function for development and production testing
   * Only populates collections if they are empty
   */
  static async seedIfEmpty(): Promise<{ seeded: boolean; summary: string }> {
    try {
      // 1. Check if canonical catalogue exists (brands and products)
      const brandCheck = await getDocs(query(collection(db, 'brands'), limit(1)));
      const productCheck = await getDocs(query(collection(db, 'products'), limit(1)));
      if (!brandCheck.empty && !productCheck.empty) {
        return { seeded: false, summary: 'Firestore database already populated with catalogue data.' };
      }

      console.log('Seeding initial FMCG wholesale data to Firestore...');

      // 2. Seed Business Settings if not existing
      const settingsRef = doc(db, 'businessSettings', 'global');
      const settingsSnap = await getDoc(settingsRef);
      if (!settingsSnap.exists()) {
        await setDoc(settingsRef, {
          ...defaultBusinessSettings,
          _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
          _serverWriteNonce: Date.now().toString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      // 3. Seed Primary Brahmpuri Hub Warehouse
      const warehouseRef = doc(db, 'warehouses', 'WH-BRAHMPURI-01');
      await setDoc(warehouseRef, {
        warehouseId: 'WH-BRAHMPURI-01',
        name: 'MR FUTKAR — BRAHMPURI',
        branch: 'Brahmpuri Branch',
        city: 'Delhi',
        pincode: '110053',
        address: 'Main Brahmpuri Road, Near Brahmpuri Bus Terminal, North East Delhi',
        serviceAreas: ['Brahmpuri', 'Karawal Nagar', 'Yamuna Vihar', 'Seelampur', 'Shahdara', 'Bhajanpura'],
        isActive: true,
        phone: '+91 11 22981000',
        latitude: 28.6812,
        longitude: 77.2625,
        _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
        _serverWriteNonce: Date.now().toString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      // 4. Seed Brands (Top 15 FMCG Brands)
      for (const b of sampleBrands.slice(0, 15)) {
        const brandRef = doc(db, 'brands', b.brandId);
        await setDoc(brandRef, {
          brandId: b.brandId,
          brandName: b.brandName || '',
          logoUrl: b.logoUrl || '',
          isActive: b.isActive !== false,
          sortOrder: Number(b.sortOrder) || 1,
          _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
          _serverWriteNonce: Date.now().toString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }

      // 5. Seed Categories
      for (const c of sampleCategories) {
        const catRef = doc(db, 'categories', c.categoryId);
        await setDoc(catRef, {
          categoryId: c.categoryId,
          name: c.name || '',
          imageUrl: c.imageUrl || '',
          parentCategoryId: c.parentCategoryId || null,
          sortOrder: Number(c.sortOrder) || 1,
          isActive: c.isActive !== false,
          _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
          _serverWriteNonce: Date.now().toString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }

      // 6. Seed representative FMCG products across key categories (30 top products)
      const selectedProducts = fmcgProducts.slice(0, 30);
      for (const p of selectedProducts) {
        const prodRef = doc(db, 'products', p.productId);
        await setDoc(prodRef, {
          productId: p.productId,
          sku: p.sku || '',
          barcode: p.barcode || '',
          productName: p.productName || '',
          shortName: p.shortName || p.productName || '',
          brandId: p.brandId || '',
          brandName: p.brandName || '',
          categoryId: p.categoryId || '',
          categoryName: p.categoryName || '',
          subcategoryId: p.subcategoryId || '',
          subcategoryName: p.subcategoryName || '',
          description: p.description || '',
          imageUrl: p.imageUrl || '',
          thumbnailUrl: p.imageUrl || '',
          mrp: Number(p.mrp) || 0,
          sellingPrice: Number(p.sellingPrice) || 0,
          discountPercent: Number(p.discountPercent) || 0,
          discountAmount: Number(p.discountAmount) || 0,
          minimumOrderQuantity: Number(p.minimumOrderQuantity) || 1,
          unit: p.unit || 'Pack',
          packSize: p.packSize || '',
          caseQuantity: Number(p.caseQuantity) || 1,
          priceSlabs: p.priceSlabs || [],
          stockQuantity: typeof p.stockQuantity === 'number' ? p.stockQuantity : 100,
          stockUnit: p.stockUnit || 'Packs',
          isInStock: p.isInStock !== false,
          lowStockThreshold: Number(p.lowStockThreshold) || 10,
          isFeatured: Boolean(p.isFeatured),
          isHotSelling: Boolean(p.isHotSelling),
          isTodaysDeal: Boolean(p.isTodaysDeal),
          isRecommended: Boolean(p.isRecommended),
          isBuyAgainEligible: Boolean(p.isBuyAgainEligible),
          warehouseId: 'WH-BRAHMPURI-01',
          warehouseName: 'MR FUTKAR — BRAHMPURI',
          isActive: p.isActive !== false,
          _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
          _serverWriteNonce: Date.now().toString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }

      // 7. Seed Authoritative Warehouse Staff Roles (WH-BRAHMPURI-01)
      const warehouseStaff = [
        {
          userId: 'WH-ADMIN-01',
          name: 'Akash Gupta (Hub In-charge)',
          email: 'akash@mrfutkar.in',
          role: 'WAREHOUSE_ADMIN',
          warehouseId: 'WH-BRAHMPURI-01',
          warehouseName: 'MR FUTKAR — BRAHMPURI',
          branchName: 'Brahmpuri Branch',
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          userId: 'WH-MGR-01',
          name: 'Rahul Verma (Warehouse Manager)',
          email: 'rahul@mrfutkar.in',
          role: 'WAREHOUSE_MANAGER',
          warehouseId: 'WH-BRAHMPURI-01',
          warehouseName: 'MR FUTKAR — BRAHMPURI',
          branchName: 'Brahmpuri Branch',
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          userId: 'WH-STAFF-01',
          name: 'Sonu Kumar (Picking & Packing Staff)',
          email: 'sonu@mrfutkar.in',
          role: 'WAREHOUSE_STAFF',
          warehouseId: 'WH-BRAHMPURI-01',
          warehouseName: 'MR FUTKAR — BRAHMPURI',
          branchName: 'Brahmpuri Branch',
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      for (const u of warehouseStaff) {
        const uRef = doc(db, 'warehouseUsers', u.userId);
        await setDoc(uRef, {
          ...u,
          _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
        }, { merge: true });
      }

      console.log('Successfully seeded Firestore with FMCG products, brands, categories, settings & warehouse users.');
      return { seeded: true, summary: 'Seeded 30 products, 15 brands, categories, business settings, and warehouse staff.' };
    } catch (err: any) {
      return { seeded: false, summary: err?.message || 'Seed skipped' };
    }
  }

  /**
   * Directly seed or update warehouseUsers for role-based authorization
   */
  static async seedWarehouseUsers(): Promise<void> {
    try {
      const warehouseStaff = [
        {
          userId: 'WH-ADMIN-01',
          name: 'Akash Gupta (Hub In-charge)',
          email: 'akash@mrfutkar.in',
          role: 'WAREHOUSE_ADMIN',
          warehouseId: 'WH-BRAHMPURI-01',
          warehouseName: 'MR FUTKAR — BRAHMPURI',
          branchName: 'Brahmpuri Branch',
          isActive: true,
          updatedAt: new Date().toISOString(),
        },
        {
          userId: 'WH-MGR-01',
          name: 'Rahul Verma (Warehouse Manager)',
          email: 'rahul@mrfutkar.in',
          role: 'WAREHOUSE_MANAGER',
          warehouseId: 'WH-BRAHMPURI-01',
          warehouseName: 'MR FUTKAR — BRAHMPURI',
          branchName: 'Brahmpuri Branch',
          isActive: true,
          updatedAt: new Date().toISOString(),
        },
        {
          userId: 'WH-STAFF-01',
          name: 'Sonu Kumar (Picking & Packing Staff)',
          email: 'sonu@mrfutkar.in',
          role: 'WAREHOUSE_STAFF',
          warehouseId: 'WH-BRAHMPURI-01',
          warehouseName: 'MR FUTKAR — BRAHMPURI',
          branchName: 'Brahmpuri Branch',
          isActive: true,
          updatedAt: new Date().toISOString(),
        },
      ];

      for (const u of warehouseStaff) {
        const uRef = doc(db, 'warehouseUsers', u.userId);
        await setDoc(uRef, {
          ...u,
          _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
        }, { merge: true });
      }
    } catch {
      // Non-blocking fallback
    }
  }
}
