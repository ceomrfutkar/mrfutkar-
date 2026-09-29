import { Category } from '../types/product';
import { sampleCategories } from '../data/categoriesAndBrands';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface ICategoryRepository {
  getMainCategories(): Promise<Category[]>;
  getSubcategories(parentCategoryId: string): Promise<Category[]>;
  getAll(): Promise<Category[]>;
  getById(id: string): Promise<Category | undefined>;
  getHierarchy(): Promise<Category[]>;
}

export class LocalCategoryRepository implements ICategoryRepository {
  protected categories: Category[] = sampleCategories;

  async getMainCategories(): Promise<Category[]> {
    return this.categories
      .filter(c => c.parentCategoryId === null && c.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getSubcategories(parentCategoryId: string): Promise<Category[]> {
    return this.categories
      .filter(c => c.parentCategoryId === parentCategoryId && c.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getAll(): Promise<Category[]> {
    return this.categories.filter(c => c.isActive);
  }

  async getById(id: string): Promise<Category | undefined> {
    return this.categories.find(c => c.categoryId === id || c.name.toLowerCase() === id.toLowerCase());
  }

  async getHierarchy(): Promise<Category[]> {
    const mains = await this.getMainCategories();
    return Promise.all(
      mains.map(async main => {
        const subs = await this.getSubcategories(main.categoryId);
        return {
          ...main,
          subcategories: subs,
        };
      })
    );
  }
}

export class FirebaseCategoryRepository extends LocalCategoryRepository implements ICategoryRepository {
  private cache: Category[] | null = null;
  private cacheTime = 0;
  private TTL = 60000;

  override async getAll(): Promise<Category[]> {
    const now = Date.now();
    if (this.cache && now - this.cacheTime < this.TTL) {
      return this.cache;
    }

    try {
      const q = query(collection(db, 'categories'), where('isActive', '==', true));
      const snap = await getDocs(q);
      if (snap.empty) {
        return super.getAll();
      }

      const list: Category[] = [];
      snap.forEach(d => {
        const data = d.data();
        list.push({
          categoryId: data.categoryId || d.id,
          name: data.name || '',
          imageUrl: data.imageUrl || '',
          parentCategoryId: data.parentCategoryId ?? null,
          sortOrder: data.sortOrder ?? 0,
          isActive: data.isActive ?? true,
        });
      });

      this.cache = list;
      this.cacheTime = now;
      this.categories = list;
      return list;
    } catch (err) {
      console.warn('Firestore categories fetch failed, using local fallback:', err);
      return super.getAll();
    }
  }

  override async getMainCategories(): Promise<Category[]> {
    const all = await this.getAll();
    return all
      .filter(c => c.parentCategoryId === null && c.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  override async getSubcategories(parentCategoryId: string): Promise<Category[]> {
    const all = await this.getAll();
    return all
      .filter(c => c.parentCategoryId === parentCategoryId && c.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  override async getById(id: string): Promise<Category | undefined> {
    try {
      const docRef = doc(db, 'categories', id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return {
          categoryId: data.categoryId || snap.id,
          name: data.name || '',
          imageUrl: data.imageUrl || '',
          parentCategoryId: data.parentCategoryId ?? null,
          sortOrder: data.sortOrder ?? 0,
          isActive: data.isActive ?? true,
        };
      }
    } catch {
      // fallback
    }
    return super.getById(id);
  }
}

export const categoryRepository: ICategoryRepository = new FirebaseCategoryRepository();
export { LocalCategoryRepository as CategoryRepository };
