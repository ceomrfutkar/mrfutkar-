import { Brand } from '../types/product';
import { sampleBrands } from '../data/categoriesAndBrands';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface IBrandRepository {
  getAll(): Promise<Brand[]>;
  getById(brandId: string): Promise<Brand | undefined>;
  search(query: string): Promise<Brand[]>;
}

export class LocalBrandRepository implements IBrandRepository {
  protected brands: Brand[] = sampleBrands;

  async getAll(): Promise<Brand[]> {
    return this.brands.filter(b => b.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getById(brandId: string): Promise<Brand | undefined> {
    return this.brands.find(b => b.brandId === brandId);
  }

  async search(searchQuery: string): Promise<Brand[]> {
    const q = searchQuery.toLowerCase();
    return this.brands.filter(b => b.brandName.toLowerCase().includes(q));
  }
}

export class FirebaseBrandRepository extends LocalBrandRepository implements IBrandRepository {
  private cache: Brand[] | null = null;
  private cacheTime = 0;
  private TTL = 60000;

  override async getAll(): Promise<Brand[]> {
    const now = Date.now();
    if (this.cache && now - this.cacheTime < this.TTL) {
      return this.cache;
    }

    try {
      const q = query(collection(db, 'brands'), where('isActive', '==', true));
      const snap = await getDocs(q);
      if (snap.empty) {
        return super.getAll();
      }

      const list: Brand[] = [];
      snap.forEach(d => {
        const data = d.data();
        list.push({
          brandId: data.brandId || d.id,
          brandName: data.brandName || '',
          logoUrl: data.logoUrl || '',
          isActive: data.isActive ?? true,
          sortOrder: data.sortOrder ?? 0,
        });
      });

      list.sort((a, b) => a.sortOrder - b.sortOrder);
      this.cache = list;
      this.cacheTime = now;
      this.brands = list;
      return list;
    } catch (err) {
      console.warn('Firestore brands fetch failed, using local fallback:', err);
      return super.getAll();
    }
  }

  override async getById(brandId: string): Promise<Brand | undefined> {
    try {
      const docRef = doc(db, 'brands', brandId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return {
          brandId: data.brandId || snap.id,
          brandName: data.brandName || '',
          logoUrl: data.logoUrl || '',
          isActive: data.isActive ?? true,
          sortOrder: data.sortOrder ?? 0,
        };
      }
    } catch {
      // fallback
    }
    return super.getById(brandId);
  }
}

export const brandRepository: IBrandRepository = new FirebaseBrandRepository();
export { LocalBrandRepository as BrandRepository };
