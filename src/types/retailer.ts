import { Product, Brand, Category, PriceSlab, CartItem } from './product';
import { NotificationPreferences } from './notification';

export type { Product, Brand, Category, PriceSlab, CartItem, NotificationPreferences };

export interface OrderItem {
  id: string;
  productId: string;
  name: string;
  brand: string;
  image: string;
  price: number;
  mrp: number;
  unit: string;
  qty: number;
}

export type OrderStatus = 'Confirmed' | 'Processing' | 'Out for Delivery' | 'Delivered' | 'Cancelled';

export interface Order {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  savings: number;
  paymentMethod: 'COD' | 'UPI';
  paymentStatus: 'Pending' | 'Paid';
  deliveryAddress: string;
  shopName: string;
  nearestWarehouse: string;
  expectedDelivery: string;
}

export interface ShopLocation {
  latitude: number;
  longitude: number;
}

export interface ShopAddressDetails {
  addressLine1: string;
  addressLine2?: string | null;
  landmark?: string | null;
  area?: string | null;
  city: string;
  state: string;
  pincode: string;
}

export interface RetailerAddress {
  fullAddress: string;
  landmark?: string;
  city: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
}

export interface RetailerProfile {
  retailerId: string;
  mobileNumber: string;
  phone: string; // legacy alias
  ownerName: string;
  shopName: string;
  shopAddress: string;
  addressLine1?: string;
  addressLine2?: string | null;
  landmark?: string | null;
  area?: string | null;
  city: string;
  state?: string;
  pincode: string;
  gstNumber?: string;
  gstin?: string; // legacy alias
  latitude?: number;
  longitude?: number;
  shopLocation?: ShopLocation | null;
  defaultAddressId?: string;
  nearestWarehouse?: string;
  notificationsEnabled?: boolean;
  notificationPreferences?: NotificationPreferences;
  creditLimit?: number;
  availableCredit?: number;
  profilePhotoUrl?: string | null;
  isProfileComplete: boolean;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type NavigationScreen =
  | 'Splash'
  | 'Login'
  | 'ShopSetup'
  | 'Main'
  | 'Products'
  | 'Catalogue'
  | 'ProductDetail'
  | 'Cart'
  | 'Checkout'
  | 'OrderSuccess'
  | 'OrderDetail'
  | 'OrderTracking'
  | 'Warehouse'
  | 'DeliveryPartner'
  | 'Admin';

export type TabScreen = 'Home' | 'Categories' | 'Orders' | 'Cart' | 'Profile';
