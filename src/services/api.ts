import { Product, Order, RetailerProfile } from '../types/retailer';
import { products } from '../data/products';

// Central API Service Contract shared between Retailer, Sales, Warehouse & Admin apps
const STORAGE_PREFIX = 'mrfutkar_';

export const api = {
  // Products catalog
  getProducts: async (category?: string, search?: string): Promise<Product[]> => {
    let result = [...products];
    if (category && category !== 'All') {
      result = result.filter(p => p.category.toLowerCase() === category.toLowerCase());
    }
    if (search && search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    }
    return result;
  },

  getProductById: async (id: string): Promise<Product | undefined> => {
    return products.find(p => p.id === id);
  },

  // Orders contract
  getOrders: async (): Promise<Order[]> => {
    try {
      const saved = localStorage.getItem(`${STORAGE_PREFIX}orders`);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    // Default initial demo order
    return [
      {
        id: 'ord-101',
        orderNumber: 'MF-2026-8921',
        createdAt: 'Today, 10:15 AM',
        status: 'Out for Delivery',
        items: [
          {
            id: '1',
            productId: '1',
            name: 'Aloo Bhujia 200g',
            brand: 'Haldiram',
            image: 'https://images.unsplash.com/photo-1599490659213-e2b9527bd087?w=500&auto=format&fit=crop&q=80',
            price: 58,
            mrp: 65,
            unit: 'Pack',
            qty: 10,
          },
          {
            id: '2',
            productId: '2',
            name: 'Parle-G 800g Super Saver',
            brand: 'Parle',
            image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500&auto=format&fit=crop&q=80',
            price: 72,
            mrp: 80,
            unit: 'Pack',
            qty: 12,
          },
        ],
        subtotal: 1444,
        deliveryFee: 0,
        total: 1444,
        savings: 166,
        paymentMethod: 'COD',
        paymentStatus: 'Pending',
        deliveryAddress: 'Shop #4, Shree Krishna Kirana, Tonk Road, Jaipur',
        shopName: 'Shree Krishna Kirana & General Store',
        nearestWarehouse: 'Jaipur North Central Hub',
        expectedDelivery: 'Today by 4:00 PM',
      },
    ];
  },

  saveOrders: async (orders: Order[]): Promise<void> => {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}orders`, JSON.stringify(orders));
    } catch {
      // ignore
    }
  },

  // Retailer profile contract
  getProfile: async (): Promise<RetailerProfile> => {
    try {
      const saved = localStorage.getItem(`${STORAGE_PREFIX}profile`);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return {
      retailerId: 'ret-brahmpuri-01',
      mobileNumber: '9810012345',
      phone: '9810012345',
      shopName: 'Shree Krishna Kirana & General Store',
      ownerName: 'Ramesh Kumar Gupta',
      shopAddress: 'Shop #4, Main Brahmpuri Road, Near Brahmpuri Bus Stand',
      city: 'Delhi',
      pincode: '110053',
      gstin: '07ABCDE1234F1Z5',
      nearestWarehouse: 'MR FUTKAR — BRAHMPURI (1.2 km)',
      notificationsEnabled: true,
      creditLimit: 25000,
      availableCredit: 23556,
      isProfileComplete: true,
    };
  },

  saveProfile: async (profile: RetailerProfile): Promise<void> => {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}profile`, JSON.stringify(profile));
    } catch {
      // ignore
    }
  },
};
