import dotenv from 'dotenv';
dotenv.config({ override: true, quiet: true });
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { doc, getDoc, getDocs, setDoc, query, where, runTransaction, collection } from 'firebase/firestore';
import { db, adminAuth, SERVER_TXN_TOKEN, OPERATIONAL_WAREHOUSE_ID } from './server/firebaseAdmin';
import cfg from './firebase-applet-config.json';
import { BusinessSettings, defaultBusinessSettings } from './src/config/businessSettings';
import { SeedService } from './server/seedService';
import { warehouseRouter } from './server/warehouseRoutes';
import { deliveryRouter } from './server/deliveryRoutes';
import { pricingRouter } from './server/pricingRoutes';
import { notificationRouter } from './server/notificationRoutes';
import { retailerInvoiceRouter } from './server/retailerInvoiceRoutes';
import { retailerReturnRouter } from './server/retailerReturnRoutes';
import { adminRouter } from './server/adminRoutes';
import { ensureInitialSuperAdmin } from './server/adminAuth';
import { ensureSystemAccounts } from './server/accountingSeedService';
import { ServerNotificationService } from './server/notificationService';
import { resolveAuthUser, cancelOrderAndRestoreStock } from './server/auth';
import { PricingEngine } from './src/services/pricingEngine';
import { ProductPricingRule } from './src/types/product';

interface TokenVerificationResult {
  valid: boolean;
  uid: string;
  error?: string;
}

/**
 * Authoritative Server-Side Token Verification
 * In production: Validates with Google Identity Toolkit REST API
 * In dev/test: Supports explicit test UIDs strictly when ENABLE_TEST_AUTH is true
 */
async function verifyAuthToken(authHeader?: string): Promise<TokenVerificationResult> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, uid: '', error: 'UNAUTHORIZED' };
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return { valid: false, uid: '', error: 'UNAUTHORIZED' };
  }

  const appEnv = process.env.APP_ENV?.toLowerCase();
  const isTestAuthEnabled = String(process.env.ENABLE_TEST_AUTH).toLowerCase() === 'true' || process.env.ENABLE_TEST_AUTH === '1';

  // Explicit test mode token bypass for automated test runner only (never enabled in production)
  if (token.startsWith('test-uid-')) {
    if (!appEnv || appEnv === 'production' || !isTestAuthEnabled) {
      return { valid: false, uid: '', error: 'TEST_AUTH_FORBIDDEN' };
    }
    const testUid = token.replace('test-uid-', '').trim();
    if (testUid) {
      return { valid: true, uid: testUid };
    }
  }

  // Authoritative Google Identity Toolkit Token Verification
  try {
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      if (decoded && decoded.uid) {
        return { valid: true, uid: decoded.uid };
      }
    } catch {
      // Fallback to Identity Toolkit REST API
      const lookupUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${cfg.apiKey}`;
      const resp = await fetch(lookupUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      });

      const data = await resp.json();
      if (resp.ok && data.users && data.users.length > 0) {
        return { valid: true, uid: data.users[0].localId };
      }
    }

    return { valid: false, uid: '', error: 'UNAUTHORIZED' };
  } catch (err: any) {
    return { valid: false, uid: '', error: 'UNAUTHORIZED' };
  }
}

async function startServer() {
  // P1-02: Strict startup environment validation
  const appEnv = process.env.APP_ENV?.toLowerCase();
  if (!appEnv) {
    console.error('FATAL: APP_ENV environment variable is missing.');
    process.exit(1);
  }
  const isTestAuthEnabled = String(process.env.ENABLE_TEST_AUTH).toLowerCase() === 'true' || process.env.ENABLE_TEST_AUTH === '1';
  if (appEnv === 'production') {
    if (isTestAuthEnabled) {
      console.error('FATAL: Test authentication cannot be enabled in production environment.');
      process.exit(1);
    }
    if (!process.env.DELIVERY_OTP_SECRET || process.env.DELIVERY_OTP_SECRET.trim().length < 32) {
      console.error('FATAL: DELIVERY_OTP_SECRET is required in production environment with minimum 32 characters (256-bit cryptographically secure string) and no fallback salt.');
      process.exit(1);
    }
  }

  const app = express();
  const PORT = 3000;

  // Authoritative CORS Configuration
  const configuredAppUrl = process.env.APP_URL?.trim();
  const allowedOrigins = new Set(
    [
      configuredAppUrl,
      'https://ais-dev-ci6pgmqqp3r23b4ogfx5ph-63244015853.asia-southeast1.run.app',
      'https://ais-pre-ci6pgmqqp3r23b4ogfx5ph-63244015853.asia-southeast1.run.app',
      'https://ais-dev-ke5kyo6stwi6lqt55oqota-837038211827.asia-southeast1.run.app',
      'https://ais-pre-ke5kyo6stwi6lqt55oqota-837038211827.asia-southeast1.run.app',
    ].filter(Boolean) as string[]
  );

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      if (
        allowedOrigins.has(origin) ||
        origin.endsWith('.run.app') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')
      ) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Idempotency-Key');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  // JSON & URL-encoded Body Parser (supports image upload payloads up to 10MB)
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Serve static uploaded media
  app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));

  // API Health Check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'MR FUTKAR Wholesale Order Backend',
      timestamp: new Date().toISOString(),
      environment: process.env.APP_ENV || 'development',
    });
  });

  // Warehouse / Hub Management API Endpoints
  app.use('/api/warehouse', warehouseRouter);

  // Delivery Partner Management API Endpoints (Phase 2A)
  app.use('/api/delivery', deliveryRouter);

  // B2B Pricing Management API Endpoints (Phase 2C Part 2)
  app.use('/api/pricing', pricingRouter);

  // Push & In-App Notification API Endpoints (Phase 2C Part 3A)
  app.use('/api/notifications', notificationRouter);

  // Customer-facing Retailer Invoice API Endpoints (Phase 5.5 Part 4)
  app.use('/api/invoices', retailerInvoiceRouter);

  // Retailer Self-Service Return Claims API Endpoints (Phase 6 Part 6)
  app.use('/api/retailer', retailerReturnRouter);

  // Super Admin Management & RBAC API Endpoints (Phase 3A)
  app.use('/api/admin', adminRouter);

  /**
   * POST /api/orders
   * Authoritative B2B Wholesale Order Creation Endpoint
   * Implements:
   * 1. Server-side token verification (uid validation)
   * 2. Order idempotency key deduplication
   * 3. Authoritative price, discount, tax, delivery fee calculation
   * 4. Stock availability check & MOQ enforcement
   * 5. Atomic Firestore transaction: stock decrement + order snapshot + idempotency record
   */
  app.post('/api/orders', async (req, res) => {
    try {
      // 1. Authenticate Request
      const authHeader = req.headers.authorization;
      const authResult = await verifyAuthToken(authHeader);

      if (!authResult.valid || !authResult.uid) {
        return res.status(401).json({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'You must be signed in to place a wholesale order. Please verify your login.',
        });
      }

      const uid = authResult.uid;

      // 1.5 Validate Retailer Activation Status (Phase 3B-4A: Requirement 14 & RET-B18)
      // When a retailer is deactivated or inactive, new wholesale order creation is strictly blocked.
      const retailerDocRef = doc(db, 'retailers', uid);
      const retailerDocSnap = await getDoc(retailerDocRef);
      if (retailerDocSnap.exists()) {
        const retData = retailerDocSnap.data();
        const rawStatus = (retData.status || '').toUpperCase();
        if (
          rawStatus === 'INACTIVE' ||
          rawStatus === 'DEACTIVATED' ||
          rawStatus === 'SUSPENDED' ||
          retData.isActive === false
        ) {
          return res.status(403).json({
            success: false,
            error: 'RETAILER_DEACTIVATED',
            message: 'Your retailer account is currently deactivated or inactive. New order creation is not permitted. Please contact support.',
          });
        }
      }

      // 2. Validate Idempotency Key (Blocker 5)
      const idempotencyKey = req.body.idempotencyKey;
      if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 5) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_IDEMPOTENCY_KEY',
          message: 'A valid idempotency key is required to ensure order deduplication.',
        });
      }

      // Check if idempotency key already processed
      const idempDocRef = doc(db, 'idempotencyKeys', idempotencyKey.trim());
      const existingIdemp = await getDoc(idempDocRef);

      if (existingIdemp.exists()) {
        const idempData = existingIdemp.data();
        const existingOrderId = idempData.orderId;

        // Fetch the corresponding order
        const existingOrderDoc = await getDoc(doc(db, 'orders', existingOrderId));
        if (existingOrderDoc.exists()) {
          const ord = existingOrderDoc.data();
          return res.status(200).json({
            success: true,
            orderId: ord.orderId,
            orderStatus: ord.orderStatus,
            grandTotal: ord.grandTotal,
            subtotal: ord.subtotal,
            createdAt: ord.createdAt,
            isIdempotentReplay: true,
            message: 'This order has already been processed.',
          });
        }
      }

      // 2.5 Validate warehouse allocation: All orders are served exclusively by WH-BRAHMPURI-01
      // Reject any client attempt to specify an unauthorized warehouse
      if (req.body.warehouseId && req.body.warehouseId !== 'WH-BRAHMPURI-01') {
        return res.status(400).json({
          success: false,
          error: 'INVALID_WAREHOUSE',
          message: 'All wholesale orders are fulfilled exclusively through WH-BRAHMPURI-01 (MR FUTKAR — BRAHMPURI).',
        });
      }

      // 3. Validate Cart Items Array
      const items = req.body.items;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PRODUCT',
          message: 'One or more products in your cart could not be found. Please check your cart.',
        });
      }

      // 4. Fetch Authoritative Business Settings
      let settings = defaultBusinessSettings;
      try {
        const settingsSnap = await getDoc(doc(db, 'businessSettings', 'global'));
        if (settingsSnap.exists()) {
          settings = { ...defaultBusinessSettings, ...settingsSnap.data() };
        }
      } catch (err) {
        console.warn('Failed to load global business settings, using defaults');
      }

      // Check maxOrderItemsCount
      const maxItems = Number(settings.maxOrderItemsCount) || 100;
      if (items.length > maxItems) {
        return res.status(400).json({
          success: false,
          error: 'MAX_ITEMS_EXCEEDED',
          message: `Orders cannot exceed ${maxItems} items. Please split your order.`,
        });
      }

      // 5. Validate Payment Method
      const requestedPaymentMethod = req.body.paymentMethod;
      const validPaymentMethods = ['COD', 'UPI', 'ONLINE'];
      if (!validPaymentMethods.includes(requestedPaymentMethod)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PAYMENT_METHOD',
          message: 'The selected payment method is not available. Please choose another payment method.',
        });
      }

      if (requestedPaymentMethod === 'COD' && !settings.allowCOD) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PAYMENT_METHOD',
          message: 'Cash on Delivery is currently unavailable. Please choose UPI.',
        });
      }
      if (requestedPaymentMethod === 'UPI' && !settings.allowUPI) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PAYMENT_METHOD',
          message: 'UPI payment is currently unavailable. Please choose Cash on Delivery.',
        });
      }
      if (requestedPaymentMethod === 'ONLINE' && settings.allowOnlinePayment === false) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PAYMENT_METHOD',
          message: 'Online payment is currently unavailable. Please choose Cash on Delivery or UPI.',
        });
      }

      // Reject client attempts to inject paymentStatus = 'PAID' (Blocker 1 & Test 8)
      if (req.body.paymentStatus && req.body.paymentStatus !== 'PENDING') {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PAYMENT_STATUS',
          message: 'Retailers cannot mark orders as PAID. Online payments require verified gateway integration.',
        });
      }

      // Reject client attempts to inject operational orderStatus (Blocker 1 & Test 9)
      if (req.body.orderStatus && req.body.orderStatus !== 'PLACED') {
        return res.status(400).json({
          success: false,
          error: 'INVALID_ORDER_STATUS',
          message: 'Retailers cannot set operational status. Orders must begin with status PLACED.',
        });
      }

      // 6. Authoritative Product Validation and Price Recalculation (Phase 2C Part 2)
      let pricingRules: ProductPricingRule[] = [];
      try {
        const pricingSnap = await getDocs(collection(db, 'productPricing'));
        pricingRules = pricingSnap.docs.map(d => {
          const data = d.data();
          const rawSlabs = data.slabs || data.priceSlabs || [];
          const normalizedSlabs = rawSlabs.map((s: any) => ({
            minQuantity: s.minQuantity,
            maxQuantity: s.maxQuantity ?? null,
            unitPrice: typeof s.unitPrice === 'number' ? s.unitPrice : (typeof s.pricePerUnit === 'number' ? s.pricePerUnit : (typeof s.price === 'number' ? s.price : 0)),
          }));
          return {
            ...data,
            id: d.id,
            pricingId: d.id,
            ruleId: d.id,
            active: data.active !== false && data.status !== 'INACTIVE',
            slabs: normalizedSlabs,
            priceSlabs: normalizedSlabs,
            fixedPrice: typeof data.fixedPrice === 'number' ? data.fixedPrice : (typeof data.customPrice === 'number' ? data.customPrice : undefined),
          } as unknown as ProductPricingRule;
        }).filter(r => r.active);
      } catch (err) {
        console.warn('Note: loading productPricing rules:', err);
      }

      const validatedSnapshotItems: any[] = [];
      let authoritativeSubtotal = 0;
      let authoritativeDiscount = 0;

      for (const item of items) {
        if (!item.productId || typeof item.productId !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'INVALID_PRODUCT',
            message: 'One or more products in your cart could not be found. Please check your cart.',
          });
        }

        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity <= 0) {
          return res.status(400).json({
            success: false,
            error: 'INVALID_PRODUCT',
            message: 'Product quantities must be positive whole numbers.',
          });
        }

        // Fetch product authoritative document from Firestore
        const prodDoc = await getDoc(doc(db, 'products', item.productId));
        if (!prodDoc.exists()) {
          return res.status(400).json({
            success: false,
            error: 'INVALID_PRODUCT',
            message: 'One or more products in your cart could not be found. Please check your cart.',
          });
        }

        const product = prodDoc.data();

        // Check active status
        if (product.isActive === false) {
          return res.status(400).json({
            success: false,
            error: 'PRODUCT_INACTIVE',
            message: `Some products are currently inactive or unavailable. Please review your cart.`,
          });
        }

        // Enforce Minimum Order Quantity (MOQ)
        const moq = Number(product.minimumOrderQuantity) || 1;
        if (quantity < moq) {
          return res.status(400).json({
            success: false,
            error: 'MOQ_NOT_MET',
            message: `Minimum order quantity for ${product.productName} is ${moq} packs. Please adjust quantities.`,
          });
        }

        // Check initial stock availability
        const currentStock = Number(product.stockQuantity) || 0;
        if (quantity > currentStock) {
          return res.status(400).json({
            success: false,
            error: 'INSUFFICIENT_STOCK',
            message: `Some products are no longer available in the requested quantity. Please review your cart.`,
          });
        }

        // AUTHORITATIVE PRICING: Calculate based purely on authoritative rules & exact priority:
        // 1. Customer-specific quantity pricing (CUSTOMER_SLAB)
        // 2. Customer-specific fixed price (CUSTOMER_FIXED)
        // 3. Global quantity slab pricing (GLOBAL_SLAB)
        // 4. Product default wholesale price (DEFAULT)
        // Any client-provided unitPrice, discount, subtotal, grandTotal or pricingSource is strictly discarded!
        const resolved = PricingEngine.resolveProductPrice({
          product: product as any,
          quantity,
          retailerId: uid, // Strictly from authenticated token, never from body!
          customerPricingRules: pricingRules,
          now: new Date(),
        });

        const authoritativeUnitPrice = resolved.unitPrice;
        const mrp = Number(product.mrp) || authoritativeUnitPrice;
        const unitSavings = Math.max(0, mrp - authoritativeUnitPrice);
        const lineDiscount = Math.round(unitSavings * quantity * 100) / 100;
        const lineSubtotal = Math.round(authoritativeUnitPrice * quantity * 100) / 100;

        authoritativeSubtotal += lineSubtotal;
        authoritativeDiscount += lineDiscount;

        validatedSnapshotItems.push({
          productId: product.productId,
          sku: product.sku || `SKU-${product.productId}`,
          productName: product.productName,
          brandName: product.brandName || '',
          imageUrl: product.imageUrl || '',
          quantity,
          unit: product.unit || 'Pack',
          packSize: product.packSize || '',
          caseQuantity: Number(product.caseQuantity) || 1,
          unitPrice: authoritativeUnitPrice,
          discount: lineDiscount,
          subtotal: lineSubtotal,
          pricingSource: resolved.pricingSource,
          pricingId: resolved.pricingId,
          slabMinQuantity: resolved.slabMinQuantity,
          slabMaxQuantity: resolved.slabMaxQuantity ?? null,
          serverValidatedUnitPrice: authoritativeUnitPrice,
          serverValidatedDiscount: lineDiscount,
          serverValidatedSubtotal: lineSubtotal,
        });
      }

      // Validate Minimum Order Value
      const minOrderValue = Number(settings.minimumOrderValue) ?? 500;
      if (authoritativeSubtotal < minOrderValue) {
        return res.status(400).json({
          success: false,
          error: 'MINIMUM_ORDER_NOT_MET',
          message: `Minimum order value of ₹${minOrderValue} not met. Current subtotal is ₹${authoritativeSubtotal.toFixed(2)}.`,
        });
      }

      // Validate Maximum Order Value (Phase 3B-11)
      const maxOrderValue = Number(settings.maximumOrderValue) || 500000;
      if (authoritativeSubtotal > maxOrderValue) {
        return res.status(400).json({
          success: false,
          error: 'MAXIMUM_ORDER_EXCEEDED',
          message: `Maximum single order limit is ₹${maxOrderValue}. Current subtotal is ₹${authoritativeSubtotal.toFixed(2)}.`,
        });
      }

      // Validate COD Order Value Bounds (Phase 3B-11)
      if (requestedPaymentMethod === 'COD') {
        const minCod = Number(settings.minCodOrderValue) || 0;
        const maxCod = Number(settings.maxCodOrderValue) || 50000;
        if (authoritativeSubtotal < minCod) {
          return res.status(400).json({
            success: false,
            error: 'MIN_COD_ORDER_NOT_MET',
            message: `Minimum order value for Cash on Delivery is ₹${minCod}.`,
          });
        }
        if (authoritativeSubtotal > maxCod) {
          return res.status(400).json({
            success: false,
            error: 'MAX_COD_ORDER_EXCEEDED',
            message: `Cash on Delivery is limited to orders up to ₹${maxCod}. Please choose UPI or Online payment.`,
          });
        }
      }

      // Calculate authoritative delivery fee
      const freeDeliveryThreshold = Number(settings.freeDeliveryThreshold) || 1000;
      const defaultDeliveryCharge = Number(settings.defaultDeliveryCharge) || 40;
      const authoritativeDeliveryCharge = authoritativeSubtotal >= freeDeliveryThreshold ? 0 : defaultDeliveryCharge;

      // Calculate authoritative grand total
      const authoritativeGrandTotal = Math.round((authoritativeSubtotal + authoritativeDeliveryCharge) * 100) / 100;

      // Generate secure unique Order ID (or honor client-provided idempotent ID)
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
      const orderId = (typeof req.body.orderId === 'string' && req.body.orderId.trim().length > 3)
        ? req.body.orderId.trim()
        : `MF-${datePart}-${randomSuffix}`;
      const now = new Date().toISOString();

      // Server Authoritative Order Destination Snapshot validation (Phase 2C Part E & F)
      const rawAddr = req.body.deliveryAddressSnapshot || req.body.deliveryAddress || {};
      let validatedLat: number | null = null;
      let validatedLng: number | null = null;

      const rawLat = rawAddr.latitude !== undefined ? Number(rawAddr.latitude) : (req.body.latitude !== undefined ? Number(req.body.latitude) : undefined);
      const rawLng = rawAddr.longitude !== undefined ? Number(rawAddr.longitude) : (req.body.longitude !== undefined ? Number(req.body.longitude) : undefined);

      if (rawLat !== undefined && Number.isFinite(rawLat) && rawLat >= -90 && rawLat <= 90) {
        validatedLat = rawLat;
      }
      if (rawLng !== undefined && Number.isFinite(rawLng) && rawLng >= -180 && rawLng <= 180) {
        validatedLng = rawLng;
      }

      const deliveryAddressSnapshot = {
        fullAddress: String(rawAddr.fullAddress || rawAddr.addressLine1 || rawAddr.line1 || rawAddr.address || rawAddr.shopAddress || 'Shop Address').trim(),
        landmark: rawAddr.landmark ? String(rawAddr.landmark).trim() : '',
        city: String(rawAddr.city || 'Delhi').trim(),
        pincode: String(rawAddr.pincode || '110053').trim(),
        latitude: validatedLat,
        longitude: validatedLng,
        shopName: String(rawAddr.shopName || req.body.shopName || 'Retailer Shop').trim(),
        ownerName: String(rawAddr.ownerName || req.body.retailerName || 'Retailer Owner').trim(),
        phone: String(rawAddr.phone || '').trim(),
      };

      // Serviceable delivery areas / pincodes validation against authoritative businessSettings (Phase 3B-11)
      const allowedPincodes: string[] = Array.isArray(settings.serviceablePincodes)
        ? settings.serviceablePincodes.map((p: any) => String(p).trim().toLowerCase()).filter(Boolean)
        : [];
      const allowedAreas: string[] = Array.isArray(settings.deliveryServiceAreas)
        ? settings.deliveryServiceAreas.map((p: any) => String(p).trim().toLowerCase()).filter(Boolean)
        : [];

      if (allowedPincodes.length > 0 || allowedAreas.length > 0) {
        const pincode = deliveryAddressSnapshot.pincode.toLowerCase();
        const fullAddr = deliveryAddressSnapshot.fullAddress.toLowerCase();
        const city = deliveryAddressSnapshot.city.toLowerCase();
        const landmark = deliveryAddressSnapshot.landmark.toLowerCase();

        const isPincodeServiceable = allowedPincodes.length > 0 && allowedPincodes.includes(pincode);
        const isAreaServiceable = allowedAreas.length > 0 && allowedAreas.some(area =>
          pincode === area ||
          fullAddr.includes(area) ||
          city.includes(area) ||
          landmark.includes(area)
        );

        const isServiceable = isPincodeServiceable || isAreaServiceable;

        if (!isServiceable) {
          const allowedDisplay = [...allowedPincodes, ...(settings.deliveryServiceAreas || [])].join(', ');
          return res.status(400).json({
            success: false,
            error: 'PINCODE_NOT_SERVICEABLE',
            message: `Delivery is currently not available for this address (${deliveryAddressSnapshot.pincode}). Serviceable areas: ${allowedDisplay}.`,
          });
        }
      }

      const finalDeliveryAddress = {
        id: rawAddr.id || `ADDR-${orderId}`,
        shopName: deliveryAddressSnapshot.shopName,
        ownerName: deliveryAddressSnapshot.ownerName,
        fullAddress: deliveryAddressSnapshot.fullAddress,
        landmark: deliveryAddressSnapshot.landmark,
        city: deliveryAddressSnapshot.city,
        pincode: deliveryAddressSnapshot.pincode,
        phone: deliveryAddressSnapshot.phone,
        latitude: validatedLat,
        longitude: validatedLng,
      };

      const newOrderDoc = {
        orderId,
        retailerId: uid,
        retailerName: req.body.retailerName || 'Retailer',
        shopName: req.body.shopName || req.body.deliveryAddress?.shopName || 'Retailer Shop',
        items: validatedSnapshotItems,
        deliveryAddress: finalDeliveryAddress,
        deliveryAddressSnapshot,
        warehouseId: OPERATIONAL_WAREHOUSE_ID,
        warehouseName: 'MR FUTKAR — BRAHMPURI',
        branchName: 'Brahmpuri Branch',
        subtotal: authoritativeSubtotal,
        discount: authoritativeDiscount,
        deliveryCharge: authoritativeDeliveryCharge,
        tax: 0,
        grandTotal: authoritativeGrandTotal,
        total: authoritativeGrandTotal,
        savings: authoritativeDiscount,
        paymentMethod: requestedPaymentMethod,
        paymentStatus: 'PENDING', // CRITICAL: NEVER trust client paymentStatus. Always initialized to PENDING.
        orderStatus: 'PLACED',   // CRITICAL: NEVER trust client orderStatus. Always initialized to PLACED.
        orderNotes: typeof req.body.orderNotes === 'string' ? req.body.orderNotes.trim() : '',
        estimatedDeliveryTime: settings.defaultEstimatedDelivery || 'Today within 4 hours (Brahmpuri Hub)',
        createdAt: now,
        updatedAt: now,
        _serverTxnToken: SERVER_TXN_TOKEN,
        _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      };

      // 7. Atomic Firestore Transaction (Blocker 2 & Blocker 5)
      // Deducts stock atomically and writes order + idempotency key in a single transaction
      await runTransaction(db, async (txn) => {
        // Double check idempotency within transaction
        const idempCheck = await txn.get(idempDocRef);
        if (idempCheck.exists()) {
          throw new Error('ORDER_ALREADY_EXISTS');
        }

        // Read all product docs to verify current stock inside transaction lock
        const stockUpdates: {
          ref: any;
          previousStock: number;
          newStock: number;
          productName: string;
          productId: string;
          sku: string;
          quantity: number;
        }[] = [];

        for (const item of validatedSnapshotItems) {
          const prodRef = doc(db, 'products', item.productId);
          const pSnap = await txn.get(prodRef);

          if (!pSnap.exists()) {
            throw new Error(`PRODUCT_MISSING:${item.productId}`);
          }

          const currentStock = Number(pSnap.data().stockQuantity) || 0;
          if (currentStock < item.quantity) {
            throw new Error(`INSUFFICIENT_STOCK:${item.productName}`);
          }

          stockUpdates.push({
            ref: prodRef,
            previousStock: currentStock,
            newStock: currentStock - item.quantity,
            productName: item.productName,
            productId: item.productId,
            sku: item.sku || (pSnap.data() as any).sku || `SKU-${item.productId}`,
            quantity: item.quantity,
          });
        }

        // Apply all stock deductions and record immutable audit logs
        for (const update of stockUpdates) {
          txn.update(update.ref, {
            stockQuantity: update.newStock,
            updatedAt: now,
            _serverTxnToken: SERVER_TXN_TOKEN,
            _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          });

          // Immutable inventory movement audit record
          const movRef = doc(collection(db, 'inventoryMovements'));
          const movData = {
            movementId: movRef.id,
            warehouseId: OPERATIONAL_WAREHOUSE_ID,
            productId: update.productId,
            productName: update.productName,
            sku: update.sku,
            previousStock: update.previousStock,
            previousQuantity: update.previousStock,
            delta: -update.quantity,
            adjustmentQuantity: -update.quantity,
            newStock: update.newStock,
            newQuantity: update.newStock,
            reason: 'Order fulfillment deduction',
            notes: `Fulfillment deduction for wholesale order ${orderId}`,
            performedBy: uid,
            performedByRole: 'SYSTEM_ORDER_TRANSACTION',
            userId: uid,
            userName: req.body.retailerName || 'Retailer',
            createdAt: now,
            timestamp: now,
            referenceType: 'ORDER',
            referenceId: orderId,
            _serverTxnToken: SERVER_TXN_TOKEN,
            _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          };
          txn.set(movRef, JSON.parse(JSON.stringify(movData)));
        }

        // Write order document (sanitized against undefined)
        const orderRef = doc(db, 'orders', orderId);
        txn.set(orderRef, JSON.parse(JSON.stringify(newOrderDoc)));

        // Write idempotency record
        const idempData = {
          idempotencyKey,
          orderId,
          retailerId: uid,
          grandTotal: authoritativeGrandTotal,
          createdAt: now,
          _serverTxnToken: SERVER_TXN_TOKEN,
          _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        };
        txn.set(idempDocRef, JSON.parse(JSON.stringify(idempData)));
      });

      // 8. Server-Authoritative Notifications Trigger (Failure-isolated)
      ServerNotificationService.notifyOrderPlaced(newOrderDoc).catch(notifErr => {
        console.warn('Note emitting ORDER_PLACED notification:', notifErr.message);
      });

      // 9. Order Successfully Placed and Committed
      return res.status(200).json({
        success: true,
        orderId: newOrderDoc.orderId,
        orderStatus: newOrderDoc.orderStatus,
        grandTotal: newOrderDoc.grandTotal,
        subtotal: newOrderDoc.subtotal,
        discount: newOrderDoc.discount,
        deliveryCharge: newOrderDoc.deliveryCharge,
        createdAt: newOrderDoc.createdAt,
      });
    } catch (err: any) {
      console.error('Order creation error:', err?.message || err);
      const errMsg = String(err?.message || err || '');

      if (
        errMsg.includes('INSUFFICIENT_STOCK') ||
        errMsg.includes('insufficient stock') ||
        errMsg.includes('PERMISSION_DENIED') ||
        errMsg.includes('permission-denied')
      ) {
        return res.status(409).json({
          success: false,
          error: 'INSUFFICIENT_STOCK',
          message: 'Some products are no longer available in the requested quantity. Please review your cart.',
        });
      }

      if (errMsg.includes('ORDER_ALREADY_EXISTS')) {
        try {
          const idempotencyKey = req.body.idempotencyKey;
          if (idempotencyKey) {
            const recheckIdemp = await getDoc(doc(db, 'idempotencyKeys', idempotencyKey.trim()));
            if (recheckIdemp.exists()) {
              const existingOrderId = recheckIdemp.data().orderId;
              const ordDoc = await getDoc(doc(db, 'orders', existingOrderId));
              if (ordDoc.exists()) {
                const ord = ordDoc.data();
                return res.status(200).json({
                  success: true,
                  orderId: ord.orderId,
                  orderStatus: ord.orderStatus,
                  grandTotal: ord.grandTotal,
                  subtotal: ord.subtotal,
                  createdAt: ord.createdAt,
                  isIdempotentReplay: true,
                  message: 'This order has already been processed.',
                });
              }
            }
          }
        } catch {
          // Fall through to 409 if unable to read existing order
        }

        return res.status(409).json({
          success: false,
          error: 'ORDER_ALREADY_EXISTS',
          message: 'This order has already been processed.',
        });
      }

      return res.status(500).json({
        success: false,
        error: 'SERVER_ERROR',
        message: 'Unable to process wholesale order at the warehouse. Please try again.',
      });
    }
  });

  /**
   * POST /api/orders/:orderId/cancel
   * Authoritative, transactional order cancellation with idempotent stock restoration
   */
  app.post('/api/orders/:orderId/cancel', async (req: express.Request, res: express.Response) => {
    try {
      const { orderId } = req.params;
      const { reason } = req.body;
      const authHeader = req.headers.authorization;
      const authResult = await resolveAuthUser(authHeader);

      if (!authResult.valid || !authResult.user) {
        return res.status(401).json({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Valid Authorization Bearer token is required.',
        });
      }

      const user = authResult.user;
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);

      if (!orderSnap.exists()) {
        return res.status(404).json({
          success: false,
          error: 'ORDER_NOT_FOUND',
          message: `Order ${orderId} does not exist.`,
        });
      }

      const orderData = orderSnap.data();

      // Retailer Isolation: Retailer can only cancel their own order
      if (user.role === 'RETAILER' && orderData.retailerId !== user.uid) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'You cannot cancel an order belonging to another retailer.',
        });
      }

      const cancelResult = await cancelOrderAndRestoreStock(
        orderId,
        user.uid,
        user.role,
        reason || 'Cancelled by retailer'
      );

      // Server-Authoritative Notifications Trigger
      ServerNotificationService.notifyOrderStatusTransition(
        { ...orderData, orderId, orderStatus: 'CANCELLED' },
        'CANCELLED',
        { reason: reason || 'Cancelled by retailer' }
      ).catch(notifErr => {
        console.warn('Note emitting CANCELLED notification:', notifErr.message);
      });

      return res.status(200).json({
        success: true,
        orderId,
        orderStatus: 'CANCELLED',
        alreadyCancelled: cancelResult.alreadyCancelled,
        stockRestored: cancelResult.stockRestored,
        message: cancelResult.message,
      });
    } catch (err: any) {
      if (err.message?.includes('CANNOT_CANCEL_STATUS_')) {
        return res.status(400).json({
          success: false,
          error: 'CANNOT_CANCEL_ORDER',
          message: err.message,
        });
      }
      return res.status(500).json({
        success: false,
        error: 'CANCEL_FAILED',
        message: err.message,
      });
    }
  });

  let cachedServerSettings: BusinessSettings = defaultBusinessSettings;
  let lastSettingsFetchTime = 0;

  async function getServerBusinessSettings(): Promise<BusinessSettings> {
    if (lastSettingsFetchTime > 0 && Date.now() - lastSettingsFetchTime < 30000) {
      return cachedServerSettings;
    }
    try {
      const snap = await getDoc(doc(db, 'businessSettings', 'global'));
      if (snap.exists()) {
        cachedServerSettings = { ...defaultBusinessSettings, ...snap.data() };
        lastSettingsFetchTime = Date.now();
        return cachedServerSettings;
      }
    } catch {
      // Gracefully fall back to cached or default settings without logging noisy warning
    }
    return cachedServerSettings;
  }

  /**
   * GET /api/settings/public
   * Public-safe business configuration for Kirana retailers and mobile clients
   * Strictly filters out all admin, security, and internal operational configurations
   */
  app.get('/api/settings/public', async (req: express.Request, res: express.Response) => {
    try {
      const settings = await getServerBusinessSettings();

      // Safe public configuration whitelist
      const publicSettings = {
        businessName: settings.businessName || 'MR FUTKAR',
        supportPhone: settings.supportPhone || '+91 11 22981000',
        supportEmail: settings.supportEmail || 'support@mrfutkar.com',
        businessAddress: settings.businessAddress || '',
        city: settings.city || 'Delhi',
        state: settings.state || 'Delhi',
        pincode: settings.pincode || '110053',
        currency: settings.currency || 'INR',
        timezone: settings.timezone || 'Asia/Kolkata',
        minimumOrderValue: settings.minimumOrderValue ?? 500,
        maximumOrderValue: settings.maximumOrderValue ?? 500000,
        defaultDeliveryCharge: settings.defaultDeliveryCharge ?? 40,
        freeDeliveryThreshold: settings.freeDeliveryThreshold ?? 1000,
        defaultEstimatedDelivery: settings.defaultEstimatedDelivery || 'Today within 4 hours (Brahmpuri Hub)',
        deliveryServiceAreas: settings.deliveryServiceAreas || [],
        allowCOD: settings.allowCOD ?? true,
        allowUPI: settings.allowUPI ?? true,
        allowOnlinePayment: settings.allowOnlinePayment ?? true,
        minCodOrderValue: settings.minCodOrderValue ?? 0,
        maxCodOrderValue: settings.maxCodOrderValue ?? 50000,
        allowOrderCancellation: settings.allowOrderCancellation ?? true,
        cancellationAllowedStatuses: settings.cancellationAllowedStatuses || ['PLACED', 'CONFIRMED', 'ACCEPTED'],
        retailerRegistrationEnabled: settings.retailerRegistrationEnabled ?? true,
        defaultWarehouseId: settings.defaultWarehouseId || 'WH-BRAHMPURI-01',
        defaultWarehouseName: settings.defaultWarehouseName || 'MR FUTKAR — BRAHMPURI',
        taxPercentage: settings.taxPercentage ?? 0,
        version: settings.version || 1,
      };

      return res.status(200).json({
        success: true,
        settings: publicSettings,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: 'PUBLIC_SETTINGS_ERROR',
        message: 'Unable to retrieve store settings.',
      });
    }
  });

  // Retailer Registration Endpoint (Respects businessSettings.retailerRegistrationEnabled)
  app.post('/api/retailers/register', async (req: express.Request, res: express.Response) => {
    try {
      const settings = await getServerBusinessSettings();

      if (settings.retailerRegistrationEnabled === false) {
        return res.status(403).json({
          success: false,
          error: 'REGISTRATION_DISABLED',
          message: 'Retailer registration is currently disabled by store policy.',
        });
      }

      const { retailerId, shopName, ownerName, phone, mobileNumber, address, pincode } = req.body;
      if (!retailerId || typeof retailerId !== 'string' || retailerId.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_RETAILER_ID',
          message: 'A valid retailerId is required.',
        });
      }

      const cleanPhone = phone || mobileNumber || '';
      const now = new Date().toISOString();
      const defaultCredit = Number(settings.defaultCreditLimit) || 25000;

      const newProfile: any = {
        retailerId: retailerId.trim(),
        shopName: String(shopName || 'Retailer Shop').trim(),
        ownerName: String(ownerName || 'Retailer Owner').trim(),
        phone: String(cleanPhone).trim(),
        mobileNumber: String(cleanPhone).trim(),
        address: String(address || '').trim(),
        pincode: String(pincode || '110053').trim(),
        creditLimit: defaultCredit,
        availableCredit: defaultCredit,
        status: 'ACTIVE',
        isActive: true,
        createdAt: now,
        updatedAt: now,
        _serverTxnToken: SERVER_TXN_TOKEN,
        _serverWriteNonce: `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      };

      await setDoc(doc(db, 'retailers', retailerId.trim()), newProfile);

      const { _serverTxnToken, _serverWriteNonce, ...safeProfile } = newProfile;
      return res.status(200).json({
        success: true,
        retailer: safeProfile,
        message: 'Retailer registered successfully.',
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: 'REGISTRATION_FAILED',
        message: err.message || 'Failed to register retailer.',
      });
    }
  });

  // Background check to seed catalogue and business settings if empty
  SeedService.seedIfEmpty().catch(err => {
    console.warn('Initial catalogue check:', err?.message || err);
  });

  // Background check to provision initial Super Admin if not present
  ensureInitialSuperAdmin().catch(err => {
    console.warn('Initial Super Admin check:', err?.message || err);
  });

  // Background check to provision initial System Accounts for Accounting Core (Phase 5.4 Part 1)
  ensureSystemAccounts().catch(err => {
    console.warn('Initial System Accounts check:', err?.message || err);
  });

  // Seed health check document for client connectivity verification
  setDoc(doc(db, 'test', 'connection'), {
    status: 'online',
    warehouseId: OPERATIONAL_WAREHOUSE_ID,
    timestamp: new Date().toISOString(),
    _serverTxnToken: SERVER_TXN_TOKEN,
  }).catch(() => {});

  // Authoritative catch-all for unmatched /api/* routes: MUST return JSON, NEVER HTML!
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      success: false,
      error: 'ROUTE_NOT_FOUND',
      message: `API endpoint ${req.method} ${req.originalUrl} not found.`,
    });
  });

  // Authoritative JSON Error Handler for /api/* requests: Ensures errors never emit HTML
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api') || req.url.startsWith('/api')) {
      console.error('Unhandled API Server Error:', err?.message || err);
      return res.status(err.status || 500).json({
        success: false,
        error: err.code || 'INTERNAL_SERVER_ERROR',
        message: err.message || 'An unexpected error occurred while processing the API request.',
      });
    }
    next(err);
  });

  // Vite Middleware for Frontend Serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MR FUTKAR Retailer Server running on port ${PORT}`);
  });
}

startServer();
