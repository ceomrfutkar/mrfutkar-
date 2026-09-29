import { Product } from '../types/product';
import { fmcgProducts } from '../data/fmcgCatalogue';
import { collection, getDocs, doc, getDoc, query, where, limit } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface ProductFilterOptions {
  category?: string;
  categoryId?: string;
  subcategory?: string;
  subcategoryId?: string;
  brand?: string;
  brandId?: string;
  brands?: string[];
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  offersOnly?: boolean;
  hotSellingOnly?: boolean;
  searchQuery?: string;
  sortBy?: 'popular' | 'newest' | 'price-asc' | 'price-desc' | 'discount-desc';
}

export interface IProductRepository {
  getAll(): Promise<Product[]>;
  getById(id: string): Promise<Product | undefined>;
  getByCategory(categoryNameOrId: string): Promise<Product[]>;
  getBySubcategory(subcategoryIdOrName: string): Promise<Product[]>;
  getByBrand(brandNameOrId: string): Promise<Product[]>;
  searchAndFilter(filters?: ProductFilterOptions): Promise<Product[]>;
  getTodaysDeals(): Promise<Product[]>;
  getHotSelling(): Promise<Product[]>;
  getBuyAgain(): Promise<Product[]>;
  getRecentlyOrdered(): Promise<Product[]>;
  getRecommended(): Promise<Product[]>;
  getRelatedProducts(product: Product, max?: number): Promise<Product[]>;
  getSuggestions(query: string, max?: number): Promise<string[]>;
}

export class LocalProductRepository implements IProductRepository {
  protected products: Product[] = fmcgProducts;

  async getAll(): Promise<Product[]> {
    return this.products.filter(p => p.isActive !== false);
  }

  async getById(id: string): Promise<Product | undefined> {
    return this.products.find(p => p.productId === id || p.id === id);
  }

  async getByCategory(categoryNameOrId: string): Promise<Product[]> {
    if (!categoryNameOrId || categoryNameOrId === 'All') {
      return this.getAll();
    }
    const lower = categoryNameOrId.toLowerCase();
    return this.products.filter(
      p =>
        p.categoryName.toLowerCase() === lower ||
        p.categoryId.toLowerCase() === lower ||
        p.category?.toLowerCase() === lower
    );
  }

  async getBySubcategory(subcategoryIdOrName: string): Promise<Product[]> {
    const lower = subcategoryIdOrName.toLowerCase();
    return this.products.filter(
      p =>
        p.subcategoryId?.toLowerCase() === lower ||
        p.subcategoryName?.toLowerCase() === lower
    );
  }

  async getByBrand(brandNameOrId: string): Promise<Product[]> {
    const lower = brandNameOrId.toLowerCase();
    return this.products.filter(
      p =>
        p.brandName.toLowerCase() === lower ||
        p.brandId.toLowerCase() === lower ||
        p.brand?.toLowerCase() === lower
    );
  }

  async searchAndFilter(filters: ProductFilterOptions = {}): Promise<Product[]> {
    let results = await this.getAll();

    if (filters.searchQuery && filters.searchQuery.trim().length > 0) {
      const q = filters.searchQuery.trim().toLowerCase();
      results = results.filter(p => {
        return (
          p.productName.toLowerCase().includes(q) ||
          p.shortName?.toLowerCase().includes(q) ||
          p.brandName.toLowerCase().includes(q) ||
          p.categoryName.toLowerCase().includes(q) ||
          p.subcategoryName?.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcode.includes(q) ||
          p.description.toLowerCase().includes(q)
        );
      });
    }

    if (filters.category && filters.category !== 'All') {
      const catLower = filters.category.toLowerCase();
      results = results.filter(
        p =>
          p.categoryName.toLowerCase() === catLower ||
          p.categoryId.toLowerCase() === catLower
      );
    }

    if (filters.subcategory && filters.subcategory !== 'All') {
      const subLower = filters.subcategory.toLowerCase();
      results = results.filter(
        p =>
          p.subcategoryName?.toLowerCase() === subLower ||
          p.subcategoryId?.toLowerCase() === subLower
      );
    }

    if (filters.brand && filters.brand !== 'All') {
      const brandLower = filters.brand.toLowerCase();
      results = results.filter(
        p =>
          p.brandName.toLowerCase() === brandLower ||
          p.brandId.toLowerCase() === brandLower
      );
    }

    if (filters.brands && filters.brands.length > 0) {
      const lowerBrands = filters.brands.map(b => b.toLowerCase());
      results = results.filter(
        p =>
          lowerBrands.includes(p.brandName.toLowerCase()) ||
          lowerBrands.includes(p.brandId.toLowerCase())
      );
    }

    if (filters.inStockOnly) {
      results = results.filter(p => p.isInStock && p.stockQuantity > 0);
    }

    if (filters.offersOnly) {
      results = results.filter(p => p.isTodaysDeal || p.discountPercent >= 15);
    }

    if (filters.hotSellingOnly) {
      results = results.filter(p => p.isHotSelling);
    }

    if (typeof filters.minPrice === 'number') {
      results = results.filter(p => p.sellingPrice >= filters.minPrice!);
    }
    if (typeof filters.maxPrice === 'number') {
      results = results.filter(p => p.sellingPrice <= filters.maxPrice!);
    }

    switch (filters.sortBy) {
      case 'price-asc':
        results.sort((a, b) => a.sellingPrice - b.sellingPrice);
        break;
      case 'price-desc':
        results.sort((a, b) => b.sellingPrice - a.sellingPrice);
        break;
      case 'discount-desc':
        results.sort((a, b) => b.discountPercent - a.discountPercent);
        break;
      case 'newest':
        results.sort((a, b) => b.productId.localeCompare(a.productId));
        break;
      case 'popular':
      default:
        results.sort((a, b) => {
          const scoreA = (a.isHotSelling ? 2 : 0) + (a.isFeatured ? 1 : 0);
          const scoreB = (b.isHotSelling ? 2 : 0) + (b.isFeatured ? 1 : 0);
          return scoreB - scoreA;
        });
        break;
    }

    return results;
  }

  async getTodaysDeals(): Promise<Product[]> {
    return this.products.filter(p => p.isTodaysDeal);
  }

  async getHotSelling(): Promise<Product[]> {
    return this.products.filter(p => p.isHotSelling);
  }

  async getBuyAgain(): Promise<Product[]> {
    return this.products.filter(p => p.isBuyAgainEligible);
  }

  async getRecentlyOrdered(): Promise<Product[]> {
    return this.products.filter(p => p.isBuyAgainEligible || p.isHotSelling).slice(0, 8);
  }

  async getRecommended(): Promise<Product[]> {
    return this.products.filter(p => p.isRecommended);
  }

  async getRelatedProducts(product: Product, limitCount = 6): Promise<Product[]> {
    return this.products
      .filter(
        p =>
          p.productId !== product.productId &&
          (p.categoryId === product.categoryId || p.brandId === product.brandId)
      )
      .slice(0, limitCount);
  }

  async getSuggestions(queryStr: string, limitCount = 5): Promise<string[]> {
    if (!queryStr || queryStr.trim().length < 2) return [];
    const q = queryStr.trim().toLowerCase();
    const suggestions = new Set<string>();

    for (const p of this.products) {
      if (p.brandName.toLowerCase().startsWith(q)) {
        suggestions.add(p.brandName);
      }
      if (p.productName.toLowerCase().includes(q)) {
        suggestions.add(p.shortName || p.productName);
      }
      if (p.categoryName.toLowerCase().startsWith(q)) {
        suggestions.add(p.categoryName);
      }
      if (suggestions.size >= limitCount) break;
    }

    return Array.from(suggestions).slice(0, limitCount);
  }
}

export class FirebaseProductRepository extends LocalProductRepository implements IProductRepository {
  private cache: Product[] | null = null;
  private cacheTimestamp = 0;
  private CACHE_TTL_MS = 60000; // 1 minute client cache

  private async fetchFromFirestore(): Promise<Product[]> {
    const now = Date.now();
    if (this.cache && now - this.cacheTimestamp < this.CACHE_TTL_MS) {
      return this.cache;
    }

    try {
      const q = query(collection(db, 'products'), where('isActive', '==', true));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        // Not yet seeded or empty in Firestore, fall back to local sample catalogue
        return super.getAll();
      }

      const products: Product[] = [];
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        const p: Product = {
          ...(d as any),
          productId: d.productId || docSnap.id,
          id: d.productId || docSnap.id,
          productName: d.productName || d.name || '',
          name: d.productName || d.name || '',
          brandName: d.brandName || d.brand || '',
          brand: d.brandName || d.brand || '',
          categoryName: d.categoryName || d.category || '',
          category: d.categoryName || d.category || '',
          sellingPrice: d.sellingPrice ?? d.price ?? 0,
          price: d.sellingPrice ?? d.price ?? 0,
          imageUrl: d.imageUrl || d.image || '',
          image: d.imageUrl || d.image || '',
          stockQuantity: d.stockQuantity ?? d.stock ?? 0,
          stock: d.stockQuantity ?? d.stock ?? 0,
          isInStock: d.isInStock ?? (d.stockQuantity > 0),
          inStock: d.isInStock ?? (d.stockQuantity > 0),
          isActive: d.isActive ?? true,
        };
        products.push(p);
      });

      this.cache = products;
      this.cacheTimestamp = now;
      this.products = products;
      return products;
    } catch (err) {
      console.warn('Firestore products fetch failed, using local catalogue:', err);
      return super.getAll();
    }
  }

  override async getAll(): Promise<Product[]> {
    return this.fetchFromFirestore();
  }

  override async getById(id: string): Promise<Product | undefined> {
    try {
      const docRef = doc(db, 'products', id);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        const d = snapshot.data();
        return {
          ...(d as any),
          productId: d.productId || snapshot.id,
          id: d.productId || snapshot.id,
          productName: d.productName || d.name || '',
          name: d.productName || d.name || '',
          brandName: d.brandName || d.brand || '',
          brand: d.brandName || d.brand || '',
          categoryName: d.categoryName || d.category || '',
          category: d.categoryName || d.category || '',
          sellingPrice: d.sellingPrice ?? d.price ?? 0,
          price: d.sellingPrice ?? d.price ?? 0,
          imageUrl: d.imageUrl || d.image || '',
          image: d.imageUrl || d.image || '',
          stockQuantity: d.stockQuantity ?? d.stock ?? 0,
          stock: d.stockQuantity ?? d.stock ?? 0,
          isInStock: d.isInStock ?? (d.stockQuantity > 0),
          inStock: d.isInStock ?? (d.stockQuantity > 0),
          isActive: d.isActive ?? true,
        };
      }
    } catch {
      // fallback
    }
    return super.getById(id);
  }

  override async searchAndFilter(filters: ProductFilterOptions = {}): Promise<Product[]> {
    // Ensure data is freshly synced
    await this.fetchFromFirestore();
    return super.searchAndFilter(filters);
  }
}

export const productRepository: IProductRepository = new FirebaseProductRepository();
export { LocalProductRepository as ProductRepository };
