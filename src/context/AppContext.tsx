import React, { createContext, useContext, useEffect, useMemo, useState, useRef } from 'react';
import { Product, NavigationScreen, TabScreen, RetailerProfile } from '../types/retailer';
import { Order, OrderItem, OrderStatus, PaymentMethod, PaymentStatus, DeliveryAddress } from '../types/order';
import { PricingEngine } from '../services/pricingEngine';
import { orderRepository, RepeatOrderResult } from '../repositories/OrderRepository';
import { BusinessSettings, BusinessSettingsService } from '../config/businessSettings';
import { productRepository } from '../repositories/ProductRepository';
import { retailerRepository } from '../repositories/RetailerRepository';
import { AuthService } from '../services/authService';
import { NotificationService } from '../services/notificationService';
import { auth, db } from '../config/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ProductPricingRule, PriceSlab } from '../types/product';

export interface CartLine extends Product {
  productId: string;
  productName: string;
  imageUrl: string;
  quantity: number;
  qty: number;
  unit: string;
  packSize: string;
  caseQuantity: number;
  unitPrice: number;
  price: number;
  mrp: number;
  discount: number;
  subtotal: number;
  stockQuantity: number;
  orderMode?: 'units' | 'cases'; // B2B ordering mode toggle
  pricingSource?: 'CUSTOMER_SLAB' | 'CUSTOMER_FIXED' | 'GLOBAL_SLAB' | 'DEFAULT';
  pricingId?: string;
  isCustomerSpecific?: boolean;
  activeSlab?: PriceSlab;
  applicableSlabs?: PriceSlab[];
}

export type NavigationParams = {
  category?: string;
  id?: string;
  orderId?: string;
  onlyAvailable?: boolean;
  repeatResult?: RepeatOrderResult;
};

interface AppContextType {
  // Cart
  cart: CartLine[];
  addToCart: (p: Product, quantity?: number) => void;
  addCasesToCart: (p: Product, cases?: number) => void;
  removeFromCart: (id: string) => void;
  changeQty: (id: string, delta: number) => void;
  setQuantity: (id: string, qty: number) => void;
  toggleItemPackagingMode: (id: string) => void;
  getItemQuantity: (id: string) => number;
  clearCart: () => void;
  cartCount: number; // total units count
  uniqueProductsCount: number; // total unique products
  totalQuantity: number; // total units across all lines
  subtotal: number;
  totalMrp: number;
  totalSavings: number;
  deliveryFee: number;
  grandTotal: number;
  isMinOrderMet: boolean;
  remainingForMinOrder: number;
  isFreeDelivery: boolean;

  // Settings
  settings: BusinessSettings;
  updateSettings: (newSettings: Partial<BusinessSettings>) => void;

  // Delivery Addresses
  savedAddresses: DeliveryAddress[];
  selectedAddress: DeliveryAddress;
  selectAddress: (id: string) => void;
  addAddress: (addr: Omit<DeliveryAddress, 'id'>) => DeliveryAddress;
  updateAddress: (id: string, addr: Partial<DeliveryAddress>) => void;

  // Navigation
  activeScreen: NavigationScreen;
  activeTab: TabScreen;
  screenParams: NavigationParams;
  history: { screen: NavigationScreen; params?: NavigationParams }[];
  navigate: (screen: NavigationScreen, params?: NavigationParams) => void;
  replace: (screen: NavigationScreen, params?: NavigationParams) => void;
  goBack: () => void;
  switchTab: (tab: TabScreen) => void;

  // Profile
  profile: RetailerProfile;
  updateProfile: (data: Partial<RetailerProfile>) => void;
  isLoggedIn: boolean;
  login: (phone: string, uid?: string) => void;
  logout: () => void;

  // Orders
  orders: Order[];
  lastPlacedOrder: Order | null;
  placeOrder: (paymentMethod: PaymentMethod, orderNotes?: string, idempotencyKey?: string) => Promise<Order>;
  cancelOrder: (orderId: string, reason: string) => Promise<Order>;
  repeatOrder: (orderId: string) => Promise<RepeatOrderResult>;
  refreshOrders: () => Promise<void>;

  // Display Settings
  isMobileFrame: boolean;
  toggleMobileFrame: () => void;
  showCodeModal: boolean;
  setShowCodeModal: (val: boolean) => void;

  // Pricing Engine (Phase 2C Part 2)
  customerPricingRules: ProductPricingRule[];
  refreshPricingRules: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

function buildCartItem(
  product: Product,
  quantity: number,
  orderMode: 'units' | 'cases' = 'units',
  retailerId?: string,
  customerPricingRules?: ProductPricingRule[]
): CartLine {
  const maxStock = product.stockQuantity ?? product.stock ?? 9999;
  const clampedQty = Math.max(1, Math.min(quantity, maxStock));
  const pricing = PricingEngine.getPricingBreakdown(
    product,
    clampedQty,
    retailerId,
    customerPricingRules
  );

  const productId = product.productId || product.id;
  const productName = product.productName || product.name;
  const brandName = product.brandName || product.brand;
  const imageUrl = product.imageUrl || product.image;

  return {
    ...product,
    id: productId,
    productId,
    name: productName,
    productName,
    brand: brandName,
    brandName,
    image: imageUrl,
    imageUrl,
    quantity: clampedQty,
    qty: clampedQty,
    unit: product.unit || 'Pack',
    packSize: product.packSize || '',
    caseQuantity: product.caseQuantity || 1,
    unitPrice: pricing.unitPrice,
    price: pricing.unitPrice,
    mrp: product.mrp,
    discount: Math.max(0, product.mrp - pricing.unitPrice) * clampedQty,
    subtotal: pricing.subtotal,
    stockQuantity: maxStock,
    orderMode,
    pricingSource: pricing.pricingSource,
    pricingId: pricing.pricingId,
    isCustomerSpecific: pricing.isCustomerSpecific,
    activeSlab: pricing.activeSlab,
    applicableSlabs: pricing.applicableSlabs,
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  // Business Settings
  const [settings, setSettings] = useState<BusinessSettings>(() => BusinessSettingsService.getSettings());

  const updateSettings = (newSettings: Partial<BusinessSettings>) => {
    const updated = BusinessSettingsService.updateSettings(newSettings);
    setSettings(updated);
  };

  // Cart State
  const [cart, setCart] = useState<CartLine[]>(() => {
    try {
      const saved = localStorage.getItem('mrfutkar_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Navigation Stack State
  const [activeScreen, setActiveScreen] = useState<NavigationScreen>('Splash');
  const [activeTab, setActiveTab] = useState<TabScreen>('Home');
  const [screenParams, setScreenParams] = useState<NavigationParams>({});
  const [history, setHistory] = useState<{ screen: NavigationScreen; params?: NavigationParams }[]>([
    { screen: 'Splash' },
  ]);

  // Profile
  const isDev = !import.meta.env?.PROD && process.env.NODE_ENV !== 'production' && process.env.APP_ENV !== 'production';
  const [isLoggedIn, setIsLoggedIn] = useState(true);
  const [profile, setProfile] = useState<RetailerProfile>(() => {
    try {
      const saved = localStorage.getItem('mrfutkar_retailer_profile');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {
      retailerId: '',
      mobileNumber: '9829012345',
      phone: '9829012345',
      shopName: 'Shree Krishna Kirana & General Store',
      ownerName: 'Radhey Shyam Gupta',
      shopAddress: 'Shop #4, Main Market, Tonk Road, Near City Bus Stop',
      city: 'Jaipur',
      state: 'Rajasthan',
      pincode: '302015',
      gstNumber: '08ABCDE1234F1Z5',
      gstin: '08ABCDE1234F1Z5',
      nearestWarehouse: 'MR FUTKAR — BRAHMPURI',
      notificationsEnabled: true,
      creditLimit: 50000,
      availableCredit: 42500,
      isProfileComplete: true,
      isActive: true,
    };
  });

  // Addresses
  const [savedAddresses, setSavedAddresses] = useState<DeliveryAddress[]>(() => {
    try {
      const saved = localStorage.getItem('mrfutkar_addresses');
      if (saved) return JSON.parse(saved);
    } catch {
      // Fallback
    }
    return [
      {
        id: 'addr-1',
        shopName: 'Shree Krishna Kirana & General Store',
        ownerName: 'Radhey Shyam Gupta',
        fullAddress: 'Shop #4, Main Market, Tonk Road, Near City Bus Stop',
        city: 'Jaipur',
        pincode: '302015',
        phone: '9829012345',
        isDefault: true,
      },
      {
        id: 'addr-2',
        shopName: 'Shree Krishna Kirana Godown #2',
        ownerName: 'Radhey Shyam Gupta',
        fullAddress: 'Plot 18, Sanganer Industrial Area, Gate No. 2',
        city: 'Jaipur',
        pincode: '302029',
        phone: '9829012345',
        isDefault: false,
      },
    ];
  });

  const [selectedAddressId, setSelectedAddressId] = useState<string>('addr-1');

  const selectedAddress = useMemo(() => {
    const found = savedAddresses.find(a => a.id === selectedAddressId);
    const base = found || savedAddresses[0] || {
      id: 'addr-default',
      shopName: profile.shopName,
      ownerName: profile.ownerName,
      fullAddress: profile.shopAddress,
      landmark: profile.landmark || undefined,
      city: profile.city || 'Jaipur',
      pincode: profile.pincode,
      phone: profile.phone || profile.mobileNumber,
      latitude: profile.latitude,
      longitude: profile.longitude,
      isDefault: true,
    };
    return {
      ...base,
      landmark: (base.landmark || profile.landmark) || undefined,
      latitude: typeof base.latitude === 'number' ? base.latitude : profile.latitude,
      longitude: typeof base.longitude === 'number' ? base.longitude : profile.longitude,
    };
  }, [savedAddresses, selectedAddressId, profile]);

  const selectAddress = (id: string) => {
    setSelectedAddressId(id);
  };

  const addAddress = (addrInput: Omit<DeliveryAddress, 'id'>): DeliveryAddress => {
    const newAddr: DeliveryAddress = {
      ...addrInput,
      id: `addr-${Date.now()}`,
    };
    const updated = [...savedAddresses, newAddr];
    setSavedAddresses(updated);
    setSelectedAddressId(newAddr.id);
    try {
      localStorage.setItem('mrfutkar_addresses', JSON.stringify(updated));
    } catch {
      // Fallback
    }
    return newAddr;
  };

  const updateAddress = (id: string, addrUpdate: Partial<DeliveryAddress>) => {
    const updated = savedAddresses.map(a => (a.id === id ? { ...a, ...addrUpdate } : a));
    setSavedAddresses(updated);
    try {
      localStorage.setItem('mrfutkar_addresses', JSON.stringify(updated));
    } catch {
      // Fallback
    }
  };

  // Orders State
  const [orders, setOrders] = useState<Order[]>([]);
  const [lastPlacedOrder, setLastPlacedOrder] = useState<Order | null>(null);
  const [isMobileFrame, setIsMobileFrame] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);

  const refreshOrders = async () => {
    const currentUid = profile.retailerId || auth.currentUser?.uid;
    const loaded = await orderRepository.getOrders(currentUid);
    setOrders(loaded);
  };

  // Firebase Startup Initialization: Auth state, Remote Settings, and Catalogue Seed
  useEffect(() => {
    // 1. Fetch live business settings from Firestore
    BusinessSettingsService.fetchSettings().then(s => setSettings(s));

    // 2. Listen to Firebase Auth state
    const unsubscribeAuth = AuthService.onAuthStateChanged(async user => {
      if (user) {
        setIsLoggedIn(true);
        const remoteProfile = await retailerRepository.getProfile(user.uid);
        if (remoteProfile) {
          setProfile(remoteProfile);
        } else {
          // New authenticated user
          setProfile(prev => ({
            ...prev,
            retailerId: user.uid,
            mobileNumber: user.phoneNumber?.replace('+91', '') || prev.mobileNumber,
            phone: user.phoneNumber?.replace('+91', '') || prev.phone,
          }));
        }
      }
    });

    // Proactively initialize authenticated Firebase session for the retailer
    AuthService.ensureAuthenticatedUser().catch(err => {
      console.warn('Initial Firebase auth setup notice:', err?.message);
    });

    return () => unsubscribeAuth();
  }, []);

  // Real-time listener for Orders via FirebaseOrderRepository
  useEffect(() => {
    const currentUid = auth.currentUser?.uid || profile.retailerId || '';
    if (!currentUid) {
      setOrders([]);
      return;
    }
    const unsubscribeOrders = orderRepository.subscribeToOrders(currentUid, updatedOrders => {
      if (updatedOrders) {
        setOrders(updatedOrders);
      }
    });

    return () => {
      if (typeof unsubscribeOrders === 'function') {
        unsubscribeOrders();
      }
    };
  }, [profile.retailerId]);

  // Customer Pricing Rules (Phase 2C Part 2)
  const [customerPricingRules, setCustomerPricingRules] = useState<ProductPricingRule[]>([]);

  const refreshPricingRules = async () => {
    // Only attempt authorized pricing fetch when a retailer session/user is established
    const currentUser = auth.currentUser;
    const currentUid = currentUser?.uid || (profile.retailerId ? profile.retailerId : null);
    if (!currentUid) {
      setCustomerPricingRules([]);
      return;
    }

    try {
      const token = currentUser ? await currentUser.getIdToken().catch(() => null) : null;
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      } else if (currentUid) {
        headers['Authorization'] = `Bearer dev-token-${currentUid}`;
      }

      const res = await fetch(`/api/pricing/rules?retailerId=${encodeURIComponent(currentUid)}`, {
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.rules)) {
          setCustomerPricingRules(data.rules);
          return;
        }
      }
    } catch {
      // In unauthenticated or offline scenarios, rely safely on base catalogue pricing
    }
  };

  useEffect(() => {
    refreshPricingRules();
  }, [profile.retailerId]);

  // Recalculate cart items when pricing rules or retailer profile change
  useEffect(() => {
    setCart(currentCart => {
      if (currentCart.length === 0) return currentCart;
      return currentCart.map(item =>
        buildCartItem(
          item,
          item.quantity,
          item.orderMode || 'units',
          profile.retailerId,
          customerPricingRules
        )
      );
    });
  }, [customerPricingRules, profile.retailerId]);

  // Persist cart
  useEffect(() => {
    try {
      localStorage.setItem('mrfutkar_cart', JSON.stringify(cart));
    } catch {
      // ignore
    }
  }, [cart]);

  // Cart operations
  const addToCart = (p: Product, quantity = 1) => {
    const pId = p.productId || p.id;
    const maxStock = p.stockQuantity ?? p.stock ?? 9999;
    if (maxStock <= 0 || p.isInStock === false || p.inStock === false) {
      return;
    }

    setCart(old => {
      const existing = old.find(x => x.id === pId || x.productId === pId);
      const minOrder = p.minimumOrderQuantity || p.moq || 1;
      const currentQty = existing ? existing.quantity : 0;
      const targetQty = existing ? currentQty + quantity : Math.max(quantity, minOrder);
      const clampedQty = Math.min(targetQty, maxStock);

      const updatedItem = buildCartItem(
        p,
        clampedQty,
        existing?.orderMode || 'units',
        profile.retailerId,
        customerPricingRules
      );

      if (existing) {
        return old.map(x => (x.id === pId || x.productId === pId ? updatedItem : x));
      }
      return [...old, updatedItem];
    });
  };

  const addCasesToCart = (p: Product, cases = 1) => {
    const caseUnits = PricingEngine.convertCasesToUnits(p, cases);
    const pId = p.productId || p.id;
    setCart(old => {
      const existing = old.find(x => x.id === pId || x.productId === pId);
      const currentQty = existing ? existing.quantity : 0;
      const newQty = currentQty + caseUnits;
      const updated = buildCartItem(
        p,
        newQty,
        'cases',
        profile.retailerId,
        customerPricingRules
      );
      if (existing) {
        return old.map(x => (x.id === pId || x.productId === pId ? updated : x));
      }
      return [...old, updated];
    });
  };

  const toggleItemPackagingMode = (id: string) => {
    setCart(old => {
      const item = old.find(x => x.id === id || x.productId === id);
      if (!item || item.caseQuantity <= 1) return old;

      const newMode = item.orderMode === 'cases' ? 'units' : 'cases';
      let newQty = item.quantity;

      if (newMode === 'cases') {
        const cases = Math.max(1, Math.round(item.quantity / item.caseQuantity));
        newQty = cases * item.caseQuantity;
      }

      const maxStock = item.stockQuantity || 9999;
      const clampedQty = Math.min(newQty, maxStock);
      const updated = buildCartItem(
        item,
        clampedQty,
        newMode,
        profile.retailerId,
        customerPricingRules
      );

      return old.map(x => (x.id === id || x.productId === id ? updated : x));
    });
  };

  const removeFromCart = (id: string) => {
    setCart(old => old.filter(x => x.id !== id && x.productId !== id));
  };

  const changeQty = (id: string, delta: number) => {
    setCart(old => {
      const existing = old.find(x => x.id === id || x.productId === id);
      if (!existing) return old;

      const step = existing.orderMode === 'cases' && existing.caseQuantity > 1 ? existing.caseQuantity : 1;
      const newQty = existing.quantity + delta * step;

      if (newQty <= 0) {
        return old.filter(x => x.id !== id && x.productId !== id);
      }

      const maxStock = existing.stockQuantity ?? 9999;
      const clampedQty = Math.min(newQty, maxStock);
      const updated = buildCartItem(
        existing,
        clampedQty,
        existing.orderMode,
        profile.retailerId,
        customerPricingRules
      );

      return old.map(x => (x.id === id || x.productId === id ? updated : x));
    });
  };

  const setQuantity = (id: string, qty: number) => {
    setCart(old => {
      if (qty <= 0) {
        return old.filter(x => x.id !== id && x.productId !== id);
      }
      const existing = old.find(x => x.id === id || x.productId === id);
      if (!existing) return old;

      const maxStock = existing.stockQuantity ?? 9999;
      const clampedQty = Math.min(qty, maxStock);
      const updated = buildCartItem(
        existing,
        clampedQty,
        existing.orderMode,
        profile.retailerId,
        customerPricingRules
      );

      return old.map(x => (x.id === id || x.productId === id ? updated : x));
    });
  };

  const getItemQuantity = (id: string): number => {
    const found = cart.find(x => x.id === id || x.productId === id);
    return found ? found.quantity : 0;
  };

  const clearCart = () => {
    setCart([]);
  };

  // Cart Calculations
  const uniqueProductsCount = cart.length;
  const totalQuantity = useMemo(() => cart.reduce((s, x) => s + (x.quantity || x.qty || 0), 0), [cart]);
  const cartCount = totalQuantity;
  const subtotal = useMemo(() => cart.reduce((s, x) => s + (x.subtotal || x.price * x.qty), 0), [cart]);
  const totalMrp = useMemo(() => cart.reduce((s, x) => s + (x.mrp || x.price) * (x.quantity || x.qty), 0), [cart]);
  const totalSavings = Math.max(0, Math.round((totalMrp - subtotal) * 100) / 100);

  const deliveryFee = useMemo(
    () => BusinessSettingsService.calculateDeliveryFee(subtotal, settings),
    [subtotal, settings]
  );
  const isMinOrderMet = useMemo(
    () => BusinessSettingsService.isMinimumOrderMet(subtotal, settings),
    [subtotal, settings]
  );
  const remainingForMinOrder = useMemo(
    () => BusinessSettingsService.getRemainingForMinimumOrder(subtotal, settings),
    [subtotal, settings]
  );
  const isFreeDelivery = deliveryFee === 0 && subtotal > 0;
  const grandTotal = subtotal + deliveryFee;

  // Navigation helpers
  const navigate = (screen: NavigationScreen, params?: NavigationParams) => {
    setHistory(prev => [...prev, { screen, params }]);
    setActiveScreen(screen);
    if (params) setScreenParams(params);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const replace = (screen: NavigationScreen, params?: NavigationParams) => {
    setHistory(prev => [...prev.slice(0, -1), { screen, params }]);
    setActiveScreen(screen);
    if (params) setScreenParams(params);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    if (history.length > 1) {
      const nextHistory = history.slice(0, -1);
      const prev = nextHistory[nextHistory.length - 1];
      setHistory(nextHistory);
      setActiveScreen(prev.screen);
      setScreenParams(prev.params || {});
    } else {
      setActiveScreen('Main');
    }
  };

  const switchTab = (tab: TabScreen) => {
    setActiveScreen('Main');
    setActiveTab(tab);
    setScreenParams({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Profile operations
  const updateProfile = (data: Partial<RetailerProfile>) => {
    const lat = typeof data.latitude === 'number'
      ? data.latitude
      : (typeof data.shopLocation?.latitude === 'number' ? data.shopLocation.latitude : profile.latitude);
    const lng = typeof data.longitude === 'number'
      ? data.longitude
      : (typeof data.shopLocation?.longitude === 'number' ? data.shopLocation.longitude : profile.longitude);

    const updated: RetailerProfile = {
      ...profile,
      ...data,
      retailerId: data.retailerId || profile.retailerId || auth.currentUser?.uid || '',
      mobileNumber: data.mobileNumber || data.phone || profile.mobileNumber || profile.phone,
      phone: data.mobileNumber || data.phone || profile.phone || profile.mobileNumber,
      latitude: lat,
      longitude: lng,
      shopLocation: (typeof lat === 'number' && typeof lng === 'number')
        ? { latitude: lat, longitude: lng }
        : (data.shopLocation ?? profile.shopLocation ?? null),
    };
    setProfile(updated);
    // Keep saved address in sync with profile coordinates and details
    setSavedAddresses(prev => {
      if (!prev || prev.length === 0) return prev;
      const copy = [...prev];
      copy[0] = {
        ...copy[0],
        shopName: updated.shopName || copy[0].shopName,
        ownerName: updated.ownerName || copy[0].ownerName,
        fullAddress: updated.shopAddress || copy[0].fullAddress,
        landmark: (updated.landmark || copy[0].landmark) || undefined,
        city: updated.city || copy[0].city,
        pincode: updated.pincode || copy[0].pincode,
        latitude: typeof updated.latitude === 'number' ? updated.latitude : copy[0].latitude,
        longitude: typeof updated.longitude === 'number' ? updated.longitude : copy[0].longitude,
      };
      try {
        localStorage.setItem('mrfutkar_addresses', JSON.stringify(copy));
      } catch {}
      return copy;
    });
    // Persist to Firestore & local cache
    retailerRepository.saveProfile(updated).catch(err => {
      console.warn('Failed to save profile to Firestore:', err);
    });
  };

  const login = async (phone: string, uid?: string) => {
    setIsLoggedIn(true);
    const targetUid = uid || auth.currentUser?.uid || (phone ? `ret-${phone}` : '');

    // Attempt to load profile from Firestore
    const existing = await retailerRepository.getProfile(targetUid);
    if (existing) {
      setProfile(existing);
    } else {
      updateProfile({
        retailerId: targetUid,
        phone,
        mobileNumber: phone,
      });
    }
  };

  const logout = async () => {
    try {
      await AuthService.logout();
    } catch {
      // ignore
    }
    setIsLoggedIn(false);
    navigate('Login');
  };

  // Orders operations
  const placeOrder = async (
    paymentMethod: PaymentMethod,
    orderNotes?: string,
    idempotencyKey?: string
  ): Promise<Order> => {
    // 1. Validation Checks
    if (cart.length === 0) {
      throw new Error('Your wholesale cart is empty.');
    }
    if (!selectedAddress) {
      throw new Error('Please select or enter a valid delivery address.');
    }
    if (!isMinOrderMet) {
      throw new Error(`Minimum order value of ₹${settings.minimumOrderValue} not met. Add ₹${remainingForMinOrder.toFixed(2)} more.`);
    }

    // Check quantities & stock
    for (const item of cart) {
      if (item.quantity <= 0) {
        throw new Error(`Invalid quantity for ${item.productName}`);
      }
      if (item.quantity > (item.stockQuantity || 9999)) {
        throw new Error(`Insufficient stock for ${item.productName}. Maximum available: ${item.stockQuantity}`);
      }
    }

    // 2. Build Order Items snapshot (snapshot actual price at order time!)
    const orderItems: OrderItem[] = cart.map(item => ({
      productId: item.productId || item.id,
      sku: item.sku || `SKU-${item.id}`,
      productName: item.productName || item.name,
      brandName: item.brandName || item.brand,
      imageUrl: item.imageUrl || item.image,
      quantity: item.quantity,
      unit: item.unit,
      packSize: item.packSize || item.unit,
      caseQuantity: item.caseQuantity || 1,
      unitPrice: item.unitPrice,
      discount: item.discount,
      subtotal: item.subtotal,
      pricingSource: item.pricingSource,
      pricingId: item.pricingId,
      slabMinQuantity: item.activeSlab?.minQuantity,
      slabMaxQuantity: item.activeSlab?.maxQuantity ?? null,
      serverValidatedUnitPrice: item.unitPrice,
      serverValidatedDiscount: item.discount,
      serverValidatedSubtotal: item.subtotal,
    }));

    // 3. Create Order via OrderRepository
    const effectiveRetailerId = auth.currentUser?.uid || profile.retailerId || '';
    if (!effectiveRetailerId) {
      throw new Error('You must be signed in to place a wholesale order. Please verify your login.');
    }

    const newOrder = await orderRepository.createOrder({
      retailerId: effectiveRetailerId,
      retailerName: profile.ownerName || 'Retailer Owner',
      shopName: selectedAddress.shopName || profile.shopName,
      items: orderItems,
      deliveryAddress: selectedAddress,
      subtotal,
      discount: totalSavings,
      deliveryCharge: deliveryFee,
      tax: 0,
      grandTotal,
      paymentMethod,
      orderNotes,
      idempotencyKey,
    });

    // 4. Update state and clear cart ONLY on success (Server-authoritative notifications triggered automatically)
    setLastPlacedOrder(newOrder);
    clearCart();
    await refreshOrders();

    return newOrder;
  };

  const cancelOrder = async (orderId: string, reason: string): Promise<Order> => {
    const updated = await orderRepository.cancelOrder(orderId, reason);

    await refreshOrders();
    return updated;
  };

  const repeatOrder = async (orderId: string): Promise<RepeatOrderResult> => {
    const result = await orderRepository.repeatOrder(orderId);

    // Add available items to cart using CURRENT catalogue pricing
    for (const item of result.addedItems) {
      const product = await productRepository.getById(item.productId);
      if (product) {
        addToCart(product, item.quantity);
      }
    }

    return result;
  };

  const toggleMobileFrame = () => {
    setIsMobileFrame(prev => !prev);
  };

  const value = useMemo(
    () => ({
      cart,
      addToCart,
      addCasesToCart,
      removeFromCart,
      changeQty,
      setQuantity,
      toggleItemPackagingMode,
      getItemQuantity,
      clearCart,
      cartCount,
      uniqueProductsCount,
      totalQuantity,
      subtotal,
      totalMrp,
      totalSavings,
      deliveryFee,
      grandTotal,
      isMinOrderMet,
      remainingForMinOrder,
      isFreeDelivery,

      settings,
      updateSettings,

      savedAddresses,
      selectedAddress,
      selectAddress,
      addAddress,
      updateAddress,

      activeScreen,
      activeTab,
      screenParams,
      history,
      navigate,
      replace,
      goBack,
      switchTab,

      profile,
      updateProfile,
      isLoggedIn,
      login,
      logout,

      orders,
      lastPlacedOrder,
      placeOrder,
      cancelOrder,
      repeatOrder,
      refreshOrders,

      isMobileFrame,
      toggleMobileFrame,
      showCodeModal,
      setShowCodeModal,

      customerPricingRules,
      refreshPricingRules,
    }),
    [
      cart,
      cartCount,
      uniqueProductsCount,
      totalQuantity,
      subtotal,
      totalMrp,
      totalSavings,
      deliveryFee,
      grandTotal,
      isMinOrderMet,
      remainingForMinOrder,
      isFreeDelivery,
      settings,
      savedAddresses,
      selectedAddress,
      activeScreen,
      activeTab,
      screenParams,
      history,
      profile,
      isLoggedIn,
      orders,
      lastPlacedOrder,
      isMobileFrame,
      showCodeModal,
      customerPricingRules,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const v = useContext(AppContext);
  if (!v) throw new Error('AppProvider missing');
  return v;
}
