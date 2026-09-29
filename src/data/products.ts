import { Product } from '../types/product';
import { fmcgProducts } from './fmcgCatalogue';

export const categories = [
  'Biscuits',
  'Namkeen',
  'Chocolates',
  'Toffees',
  'Snacks',
  'Beverages',
  'Grocery',
  'Personal Care',
  'Household',
] as const;

export type CategoryName = typeof categories[number];

// Central FMCG products export sourced from the scalable catalogue repository
export const products: Product[] = fmcgProducts;
