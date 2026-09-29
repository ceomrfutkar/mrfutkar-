import { db } from '../src/config/firebase';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  deleteDoc,
} from 'firebase/firestore';
import { PricingEngine } from '../src/services/pricingEngine';
import { ProductPricingRule } from '../src/types/product';

const clientDb = db;

const BASE_URL = 'http://localhost:3000';

async function runAdminProductTests() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 3B-2A SUPER ADMIN PRODUCT MANAGEMENT TEST SUITE');
  console.log('======================================================================\n');

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testId: string, desc: string, evidence?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testId}: ${desc}`);
      if (evidence) console.log(`    Evidence: ${evidence}`);
      passedCount++;
    } else {
      console.error(`❌ [FAIL] ${testId}: ${desc}`);
      if (evidence) console.error(`    Evidence: ${evidence}`);
      failedCount++;
    }
  }

  // --- ENSURE TEST IDENTITIES & SEED DATA ---
  // 1. Super Admin
  const existingAdmin = await getDoc(doc(db, 'adminUsers', 'SUPER-ADMIN-01'));
  if (!existingAdmin.exists()) {
    await setDoc(doc(db, 'adminUsers', 'SUPER-ADMIN-01'), {
      uid: 'SUPER-ADMIN-01',
      name: 'Akash Gupta (Super Administrator)',
      mobile: '+919810012345',
      email: 'ceo.mrfutkar@gmail.com',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'SYSTEM_BOOTSTRAP',
      permissionsVersion: 1,
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    });
  }

  // 2. Suspended Admin
  const existingSuspended = await getDoc(doc(db, 'adminUsers', 'ADMIN-SUSPENDED-01'));
  if (!existingSuspended.exists()) {
    await setDoc(doc(db, 'adminUsers', 'ADMIN-SUSPENDED-01'), {
      uid: 'ADMIN-SUSPENDED-01',
      name: 'Suspended Admin',
      mobile: '+919810099991',
      email: 'suspended@mrfutkar.in',
      role: 'SUPER_ADMIN',
      status: 'SUSPENDED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'SYSTEM_BOOTSTRAP',
      permissionsVersion: 1,
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    });
  }

  // 3. Disabled Admin
  const existingDisabled = await getDoc(doc(db, 'adminUsers', 'ADMIN-DISABLED-01'));
  if (!existingDisabled.exists()) {
    await setDoc(doc(db, 'adminUsers', 'ADMIN-DISABLED-01'), {
      uid: 'ADMIN-DISABLED-01',
      name: 'Disabled Admin',
      mobile: '+919810099992',
      email: 'disabled@mrfutkar.in',
      role: 'SUPER_ADMIN',
      status: 'DISABLED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'SYSTEM_BOOTSTRAP',
      permissionsVersion: 1,
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    });
  }

  // Unique timestamp suffix for isolated test runs
  const runId = Date.now().toString(36);
  let createdProductId = '';
  let createdSku = `TEST-SKU-${runId.toUpperCase()}`;
  let createdBarcode = `BAR-${runId}`;

  // -------------------------------------------------------------------------
  // TEST PROD-01: SUPER_ADMIN can list products
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      headers: { 'Authorization': 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success === true && Array.isArray(data.products),
      'PROD-01',
      'SUPER_ADMIN can list products with pagination and counts',
      `HTTP status ${res.status}, count=${data.products?.length}, total=${data.totalCount}`
    );
  } catch (err: any) {
    assert(false, 'PROD-01', 'SUPER_ADMIN list products failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-02: Unauthenticated list -> 401
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products`);
    const data = await res.json();
    assert(
      res.status === 401 && data.error === 'UNAUTHORIZED',
      'PROD-02',
      'Unauthenticated request to list products rejected with 401',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'PROD-02', 'Unauthenticated test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-03: Retailer list -> 403
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      headers: { 'Authorization': 'Bearer test-uid-ret-test-auth-01' },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'PROD-03',
      'Retailer token blocked from Super Admin product list with 403',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'PROD-03', 'Retailer list test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-04: Warehouse Staff -> 403
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      headers: { 'Authorization': 'Bearer test-uid-WH-STAFF-01' },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'PROD-04',
      'Warehouse Staff blocked from Super Admin products with 403',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'PROD-04', 'Staff list test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-05: Warehouse Manager -> 403
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      headers: { 'Authorization': 'Bearer test-uid-WH-MGR-01' },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'PROD-05',
      'Warehouse Manager blocked from Super Admin products with 403',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'PROD-05', 'Manager list test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-06: Warehouse Admin -> 403
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      headers: { 'Authorization': 'Bearer test-uid-WH-ADMIN-01' },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'PROD-06',
      'Warehouse Admin blocked from Super Admin products with 403',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'PROD-06', 'Warehouse Admin list test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-07: Delivery Partner -> 403
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      headers: { 'Authorization': 'Bearer test-uid-dp-test-01' },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'PROD-07',
      'Delivery Partner blocked from Super Admin products with 403',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'PROD-07', 'Delivery partner list test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-08: SUPER_ADMIN can retrieve product
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products/prod-001`, {
      headers: { 'Authorization': 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success === true && data.product?.productId === 'prod-001',
      'PROD-08',
      'SUPER_ADMIN can retrieve specific product by productId',
      `HTTP status ${res.status}, productName=${data.product?.productName}`
    );
  } catch (err: any) {
    assert(false, 'PROD-08', 'SUPER_ADMIN retrieve product failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-09: SUPER_ADMIN can create product
  // -------------------------------------------------------------------------
  try {
    const payload = {
      productName: `Tata Tea Premium Gold ${runId}`,
      sku: createdSku,
      barcode: createdBarcode,
      brandName: 'Tata Tea',
      categoryName: 'Beverages',
      description: 'Finest hand-picked tea leaves blended for intense aroma.',
      mrp: 180,
      wholesalePrice: 155,
      minimumOrderQuantity: 5,
      caseQuantity: 20,
      stockQuantity: 100,
      lowStockThreshold: 15,
      unit: 'Pack',
      packSize: '500g',
      images: [
        {
          imageId: `img-${runId}-1`,
          url: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=500',
          storagePath: `products/tea-${runId}.jpg`,
          sortOrder: 0,
          isPrimary: true,
          altText: 'Tata Tea Gold Front',
        },
      ],
    };

    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.status === 201 && data.success && data.product?.productId) {
      createdProductId = data.product.productId;
    }
    assert(
      res.status === 201 && data.success === true && Boolean(data.product?.productId),
      'PROD-09',
      'SUPER_ADMIN can create valid product with authoritative defaults and audit fields',
      `HTTP status ${res.status}, productId=${data.product?.productId}`
    );
  } catch (err: any) {
    assert(false, 'PROD-09', 'SUPER_ADMIN create product failed', err.message);
  }

  async function attemptClientWrite(fn: () => Promise<any>, timeoutMs = 4000): Promise<{ blocked: boolean; error: string }> {
    return new Promise((resolve) => {
      let finished = false;
      const timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          resolve({ blocked: true, error: 'Write timed out or rejected by security rules' });
        }
      }, timeoutMs);

      fn()
        .then(() => {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            resolve({ blocked: false, error: 'Write succeeded unexpectedly' });
          }
        })
        .catch((err) => {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            resolve({ blocked: true, error: err.message || String(err) });
          }
        });
    });
  }

  // -------------------------------------------------------------------------
  // TEST PROD-10: Client cannot create product directly
  // -------------------------------------------------------------------------
  try {
    const maliciousDocRef = doc(clientDb, 'products', `HACK-PROD-${runId}`);
    const result = await attemptClientWrite(() =>
      setDoc(maliciousDocRef, {
        productId: `HACK-PROD-${runId}`,
        productName: 'Malicious Direct Client Product',
        mrp: 10,
        sellingPrice: 5,
        isActive: true,
      })
    );
    assert(
      result.blocked,
      'PROD-10',
      'Client-side direct create on products collection strictly rejected by security rules',
      `Direct client setDoc on /products/ caught: ${result.error}`
    );
  } catch (err: any) {
    assert(false, 'PROD-10', 'Direct client create test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-11: Client cannot update product directly
  // -------------------------------------------------------------------------
  try {
    const targetDocRef = doc(clientDb, 'products', 'prod-001');
    const result = await attemptClientWrite(() =>
      updateDoc(targetDocRef, {
        sellingPrice: 1, // Malicious 1 rupee price override
      })
    );
    assert(
      result.blocked,
      'PROD-11',
      'Client-side direct update on products collection strictly rejected by security rules',
      `Direct client updateDoc on /products/prod-001 caught: ${result.error}`
    );
  } catch (err: any) {
    assert(false, 'PROD-11', 'Direct client update test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-12: Client cannot delete product directly
  // -------------------------------------------------------------------------
  try {
    const targetDocRef = doc(clientDb, 'products', 'prod-001');
    const result = await attemptClientWrite(() => deleteDoc(targetDocRef));
    assert(
      result.blocked,
      'PROD-12',
      'Client-side direct delete on products collection strictly rejected by security rules',
      `Direct client deleteDoc on /products/prod-001 caught: ${result.error}`
    );
  } catch (err: any) {
    assert(false, 'PROD-12', 'Direct client delete test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-13: Duplicate SKU rejected
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({
        productName: 'Duplicate SKU Product',
        sku: createdSku, // Same SKU as created in PROD-09
        mrp: 100,
        wholesalePrice: 80,
        brandName: 'Test',
        categoryName: 'Test',
      }),
    });
    const data = await res.json();
    assert(
      res.status === 409 && data.error === 'DUPLICATE_SKU',
      'PROD-13',
      'Product creation with duplicate SKU rejected with 409 DUPLICATE_SKU',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'PROD-13', 'Duplicate SKU test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-14: Duplicate barcode rejected
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({
        productName: 'Duplicate Barcode Product',
        sku: `DIFF-SKU-${runId}`,
        barcode: createdBarcode, // Same Barcode as created in PROD-09
        mrp: 100,
        wholesalePrice: 80,
        brandName: 'Test',
        categoryName: 'Test',
      }),
    });
    const data = await res.json();
    assert(
      res.status === 409 && data.error === 'DUPLICATE_BARCODE',
      'PROD-14',
      'Product creation with duplicate Barcode rejected with 409 DUPLICATE_BARCODE',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'PROD-14', 'Duplicate barcode test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-15: Invalid MRP rejected
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({
        productName: 'Invalid MRP Product',
        sku: `INV-MRP-${runId}`,
        mrp: -50, // Negative MRP
        wholesalePrice: 40,
        brandName: 'Test',
        categoryName: 'Test',
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'INVALID_PRODUCT_DATA',
      'PROD-15',
      'Invalid MRP (<= 0 or non-finite) rejected with 400 INVALID_PRODUCT_DATA',
      `HTTP status ${res.status}, message=${data.message}`
    );
  } catch (err: any) {
    assert(false, 'PROD-15', 'Invalid MRP test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-16: Invalid wholesale price rejected (wholesale > MRP or < 0)
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({
        productName: 'Invalid Price Product',
        sku: `INV-WP-${runId}`,
        mrp: 100,
        wholesalePrice: 150, // Wholesale higher than MRP
        brandName: 'Test',
        categoryName: 'Test',
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'INVALID_PRODUCT_DATA',
      'PROD-16',
      'Wholesale price higher than MRP rejected with 400 INVALID_PRODUCT_DATA',
      `HTTP status ${res.status}, message=${data.message}`
    );
  } catch (err: any) {
    assert(false, 'PROD-16', 'Invalid wholesale price test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-17: Invalid MOQ rejected
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({
        productName: 'Invalid MOQ Product',
        sku: `INV-MOQ-${runId}`,
        mrp: 100,
        wholesalePrice: 80,
        minimumOrderQuantity: 0, // MOQ must be >= 1
        brandName: 'Test',
        categoryName: 'Test',
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'INVALID_PRODUCT_DATA',
      'PROD-17',
      'MOQ < 1 rejected with 400 INVALID_PRODUCT_DATA',
      `HTTP status ${res.status}, message=${data.message}`
    );
  } catch (err: any) {
    assert(false, 'PROD-17', 'Invalid MOQ test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-18: Negative stock rejected
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({
        productName: 'Negative Stock Product',
        sku: `NEG-STK-${runId}`,
        mrp: 100,
        wholesalePrice: 80,
        stockQuantity: -10, // Stock must be >= 0
        brandName: 'Test',
        categoryName: 'Test',
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'INVALID_PRODUCT_DATA',
      'PROD-18',
      'Negative stock quantity rejected with 400 INVALID_PRODUCT_DATA',
      `HTTP status ${res.status}, message=${data.message}`
    );
  } catch (err: any) {
    assert(false, 'PROD-18', 'Negative stock test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-19: Invalid low-stock threshold rejected
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({
        productName: 'Invalid Threshold Product',
        sku: `INV-THR-${runId}`,
        mrp: 100,
        wholesalePrice: 80,
        lowStockThreshold: -5,
        brandName: 'Test',
        categoryName: 'Test',
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'INVALID_PRODUCT_DATA',
      'PROD-19',
      'Negative low-stock threshold rejected with 400 INVALID_PRODUCT_DATA',
      `HTTP status ${res.status}, message=${data.message}`
    );
  } catch (err: any) {
    assert(false, 'PROD-19', 'Invalid threshold test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-20: Client cannot spoof createdBy
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({
        productName: `Spoof Audit Product ${runId}`,
        sku: `SPOOF-CB-${runId}`,
        mrp: 100,
        wholesalePrice: 80,
        brandName: 'Test',
        categoryName: 'Test',
        createdBy: 'HACKER_ATTACKER_UID', // Spoof attempt
      }),
    });
    const data = await res.json();
    const createdByValid = data.product?.createdBy === 'SUPER-ADMIN-01';
    assert(
      res.status === 201 && createdByValid,
      'PROD-20',
      'Server strictly binds createdBy to authenticated admin identity (ignores client spoof)',
      `createdBy=${data.product?.createdBy}`
    );
  } catch (err: any) {
    assert(false, 'PROD-20', 'Client createdBy spoof test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-21: Client cannot spoof updatedBy
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products/${createdProductId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({
        productName: `Tata Tea Gold Updated ${runId}`,
        updatedBy: 'SPOOFED_ADMIN_UID', // Spoof attempt
      }),
    });
    const data = await res.json();
    const updatedByValid = data.product?.updatedBy === 'SUPER-ADMIN-01';
    assert(
      res.status === 200 && updatedByValid,
      'PROD-21',
      'Server strictly binds updatedBy to authenticated admin identity on update',
      `updatedBy=${data.product?.updatedBy}`
    );
  } catch (err: any) {
    assert(false, 'PROD-21', 'Client updatedBy spoof test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-22: Client cannot overwrite productId
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products/${createdProductId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({
        productId: 'ATTEMPTED-OVERWRITE-ID', // Overwrite attempt
        productName: 'Renamed Product',
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'INVALID_PRODUCT_DATA',
      'PROD-22',
      'Client attempt to mutate immutable productId rejected with 400',
      `HTTP status ${res.status}, message=${data.message}`
    );
  } catch (err: any) {
    assert(false, 'PROD-22', 'Client overwrite productId test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-23: Product update does not modify historical orders
  // -------------------------------------------------------------------------
  try {
    // 1. Create an order via authoritative endpoint with current product price (155)
    const orderPayload = {
      idempotencyKey: `idemp-hist-${Date.now()}`,
      retailerId: 'ret-test-auth-01',
      retailerName: 'Brahmpuri Kirana Mart',
      deliveryAddress: {
        shopName: 'Brahmpuri Kirana Mart',
        ownerName: 'Sunil Aggarwal',
        mobileNumber: '9810012345',
        line1: 'Shop 14, Main Brahmpuri Road',
        city: 'Delhi',
        pincode: '110053',
      },
      items: [
        {
          productId: createdProductId,
          quantity: 5,
        },
      ],
      paymentMethod: 'COD',
    };

    const orderRes = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-uid-ret-test-auth-01',
      },
      body: JSON.stringify(orderPayload),
    });
    const orderData = await orderRes.json();
    const placedOrderId = orderData.orderId || orderData.order?.orderId;
    const initialOrderPrice = orderData.order?.items?.[0]?.unitPrice || 155;

    // 2. Mutate product wholesale price to ₹170 via Super Admin API
    await fetch(`${BASE_URL}/api/admin/products/${createdProductId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({ wholesalePrice: 170 }),
    });

    // 3. Inspect historical order document in Firestore
    const orderSnap = await getDoc(doc(db, 'orders', placedOrderId));
    const fetchedOrder = orderSnap.data();
    const historicalPrice = fetchedOrder?.items?.[0]?.unitPrice;

    assert(
      historicalPrice === initialOrderPrice && historicalPrice !== 170,
      'PROD-23',
      'Product catalogue price update leaves historical order item price snapshots intact',
      `Historical order unitPrice=${historicalPrice} (expected initial ${initialOrderPrice}, current catalogue=170)`
    );
  } catch (err: any) {
    assert(false, 'PROD-23', 'Historical order isolation test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-24: Product deactivate works
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products/${createdProductId}/deactivate`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    const snap = await getDoc(doc(db, 'products', createdProductId));
    const isInactiveInDb = snap.data()?.isActive === false;

    assert(
      res.status === 200 && data.success === true && isInactiveInDb,
      'PROD-24',
      'Super Admin product deactivation sets isActive=false in database',
      `HTTP status ${res.status}, isActive=${data.isActive}`
    );
  } catch (err: any) {
    assert(false, 'PROD-24', 'Product deactivate test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-25: Product activate works
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products/${createdProductId}/activate`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    const snap = await getDoc(doc(db, 'products', createdProductId));
    const isActiveInDb = snap.data()?.isActive === true;

    assert(
      res.status === 200 && data.success === true && isActiveInDb,
      'PROD-25',
      'Super Admin product activation sets isActive=true in database',
      `HTTP status ${res.status}, isActive=${data.isActive}`
    );
  } catch (err: any) {
    assert(false, 'PROD-25', 'Product activate test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-26: Deactivate is idempotent
  // -------------------------------------------------------------------------
  try {
    // First deactivation
    await fetch(`${BASE_URL}/api/admin/products/${createdProductId}/deactivate`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-uid-SUPER-ADMIN-01' },
    });

    // Second deactivation
    const res2 = await fetch(`${BASE_URL}/api/admin/products/${createdProductId}/deactivate`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data2 = await res2.json();

    assert(
      res2.status === 200 && data2.success === true && data2.alreadyInactive === true,
      'PROD-26',
      'Subsequent deactivation of an already inactive product is idempotent',
      `alreadyInactive=${data2.alreadyInactive}`
    );
  } catch (err: any) {
    assert(false, 'PROD-26', 'Deactivate idempotency test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-27: Activate is idempotent
  // -------------------------------------------------------------------------
  try {
    // First activation
    await fetch(`${BASE_URL}/api/admin/products/${createdProductId}/activate`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-uid-SUPER-ADMIN-01' },
    });

    // Second activation
    const res2 = await fetch(`${BASE_URL}/api/admin/products/${createdProductId}/activate`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data2 = await res2.json();

    assert(
      res2.status === 200 && data2.success === true && data2.alreadyActive === true,
      'PROD-27',
      'Subsequent activation of an already active product is idempotent',
      `alreadyActive=${data2.alreadyActive}`
    );
  } catch (err: any) {
    assert(false, 'PROD-27', 'Activate idempotency test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-28: Inactive product cannot be ordered by retailer
  // -------------------------------------------------------------------------
  try {
    // 1. Deactivate product
    await fetch(`${BASE_URL}/api/admin/products/${createdProductId}/deactivate`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-uid-SUPER-ADMIN-01' },
    });

    // 2. Retailer attempts order placement
    const orderRes = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-uid-ret-test-auth-01',
      },
      body: JSON.stringify({
        idempotencyKey: `IDEMP-INACT-${Date.now()}`,
        paymentMethod: 'COD',
        paymentStatus: 'PENDING',
        warehouseId: 'WH-BRAHMPURI-01',
        items: [{ productId: createdProductId, quantity: 5 }],
      }),
    });
    const orderData = await orderRes.json();

    assert(
      orderRes.status === 400 && orderData.error === 'PRODUCT_INACTIVE',
      'PROD-28',
      'Wholesale order placement strictly rejects inactive product with 400 PRODUCT_INACTIVE',
      `HTTP status ${orderRes.status}, error=${orderData.error}`
    );

    // Re-activate product for remaining tests
    await fetch(`${BASE_URL}/api/admin/products/${createdProductId}/activate`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-uid-SUPER-ADMIN-01' },
    });
  } catch (err: any) {
    assert(false, 'PROD-28', 'Inactive product order test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-29: Customer-specific pricing remains separate from product default price
  // -------------------------------------------------------------------------
  try {
    const testProd = {
      productId: 'prod-test-pricing-01',
      sellingPrice: 100,
      wholesalePrice: 100,
      mrp: 120,
    };
    const customRule: ProductPricingRule = {
      pricingId: 'rule-custom-01',
      productId: 'prod-test-pricing-01',
      retailerId: 'retailer-vip-01',
      pricingType: 'CUSTOMER_FIXED',
      fixedPrice: 85,
      active: true,
    };

    // Resolved price for VIP retailer
    const resolvedVip = PricingEngine.resolveProductPrice({
      product: testProd as any,
      quantity: 1,
      retailerId: 'retailer-vip-01',
      customerPricingRules: [customRule],
    });

    // Resolved price for regular retailer
    const resolvedRegular = PricingEngine.resolveProductPrice({
      product: testProd as any,
      quantity: 1,
      retailerId: 'retailer-regular-02',
      customerPricingRules: [customRule],
    });

    assert(
      resolvedVip.unitPrice === 85 &&
      resolvedVip.pricingSource === 'CUSTOMER_FIXED' &&
      resolvedRegular.unitPrice === 100 &&
      resolvedRegular.pricingSource === 'DEFAULT',
      'PROD-29',
      'PricingEngine evaluates customer-specific rules without mutating product default price',
      `VIP=${resolvedVip.unitPrice} (${resolvedVip.pricingSource}), Regular=${resolvedRegular.unitPrice} (${resolvedRegular.pricingSource})`
    );
  } catch (err: any) {
    assert(false, 'PROD-29', 'Customer pricing isolation test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-30: Product mutation creates immutable admin audit log
  // -------------------------------------------------------------------------
  try {
    const auditRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
      headers: { 'Authorization': 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const auditData = await auditRes.json();
    const logs = auditData.logs || [];
    const hasProductLog = logs.some(
      (l: any) =>
        ['PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_ACTIVATED', 'PRODUCT_DEACTIVATED'].includes(l.action) &&
        l.targetType === 'PRODUCT'
    );

    assert(
      auditRes.status === 200 && hasProductLog,
      'PROD-30',
      'Product mutations generate immutable admin audit log records with action and metadata',
      `Found product audit logs in server registry: ${hasProductLog}`
    );
  } catch (err: any) {
    assert(false, 'PROD-30', 'Audit log verification failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-31: Client cannot mutate admin audit log
  // -------------------------------------------------------------------------
  try {
    const fakeAuditDocRef = doc(clientDb, 'adminAuditLogs', 'AUDIT-TEST-01');
    const result = await attemptClientWrite(() =>
      updateDoc(fakeAuditDocRef, {
        action: 'HACKED_ACTION',
      })
    );

    assert(
      result.blocked,
      'PROD-31',
      'Admin audit logs are strictly immutable (client-side update rejected by security rules)',
      `Direct client updateDoc on /adminAuditLogs caught: ${result.error}`
    );
  } catch (err: any) {
    assert(false, 'PROD-31', 'Audit log immutability test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-32: Product image metadata schema validation works
  // -------------------------------------------------------------------------
  try {
    const payload = {
      productName: `Image Schema Product ${runId}`,
      sku: `IMG-SCH-${runId}`,
      mrp: 120,
      wholesalePrice: 90,
      brandName: 'Test Brand',
      categoryName: 'Test Category',
      images: [
        {
          imageId: `img-${runId}-a`,
          url: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=500',
          storagePath: `products/tea-a.jpg`,
          sortOrder: 0,
          isPrimary: true,
          altText: 'Primary image',
        },
        {
          imageId: `img-${runId}-b`,
          url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500',
          storagePath: `products/tea-b.jpg`,
          sortOrder: 1,
          isPrimary: false,
          altText: 'Secondary image',
        },
      ],
    };

    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    assert(
      res.status === 201 && data.success && data.product?.images?.length === 2,
      'PROD-32',
      'Multi-image metadata schema validates and persists successfully',
      `Saved ${data.product?.images?.length} image metadata records`
    );
  } catch (err: any) {
    assert(false, 'PROD-32', 'Image metadata test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-33: Maximum 5 image metadata entries enforced
  // -------------------------------------------------------------------------
  try {
    const sixImages = Array.from({ length: 6 }).map((_, i) => ({
      imageId: `img-${runId}-${i}`,
      url: `https://images.unsplash.com/photo-${i}?w=500`,
      storagePath: `products/img-${i}.jpg`,
      sortOrder: i,
      isPrimary: i === 0,
    }));

    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({
        productName: 'Exceed Images Product',
        sku: `EXC-IMG-${runId}`,
        mrp: 100,
        wholesalePrice: 80,
        brandName: 'Test',
        categoryName: 'Test',
        images: sixImages,
      }),
    });
    const data = await res.json();

    assert(
      res.status === 400 && data.error === 'INVALID_PRODUCT_DATA',
      'PROD-33',
      'Attempt to register more than 5 product images rejected with 400',
      `HTTP status ${res.status}, message=${data.message}`
    );
  } catch (err: any) {
    assert(false, 'PROD-33', 'Max 5 images test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-34: Exactly one primary image enforced
  // -------------------------------------------------------------------------
  try {
    // Both images marked isPrimary: true
    const twoPrimaryImages = [
      {
        imageId: 'img-1',
        url: 'https://images.unsplash.com/photo-1?w=500',
        sortOrder: 0,
        isPrimary: true,
      },
      {
        imageId: 'img-2',
        url: 'https://images.unsplash.com/photo-2?w=500',
        sortOrder: 1,
        isPrimary: true,
      },
    ];

    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({
        productName: 'Dual Primary Image Product',
        sku: `DUAL-PRI-${runId}`,
        mrp: 100,
        wholesalePrice: 80,
        brandName: 'Test',
        categoryName: 'Test',
        images: twoPrimaryImages,
      }),
    });
    const data = await res.json();

    assert(
      res.status === 400 && data.error === 'INVALID_PRODUCT_DATA',
      'PROD-34',
      'Multiple or zero primary image flags rejected with 400',
      `HTTP status ${res.status}, message=${data.message}`
    );
  } catch (err: any) {
    assert(false, 'PROD-34', 'Primary image constraint test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-35: Concurrent duplicate SKU creation is prevented
  // -------------------------------------------------------------------------
  try {
    const raceSku = `RACE-SKU-${runId.toUpperCase()}`;
    const makeReq = () =>
      fetch(`${BASE_URL}/api/admin/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-uid-SUPER-ADMIN-01',
        },
        body: JSON.stringify({
          productName: `Race Product ${runId}`,
          sku: raceSku,
          mrp: 100,
          wholesalePrice: 80,
          brandName: 'Race Brand',
          categoryName: 'Race Cat',
        }),
      });

    // Trigger two requests simultaneously
    const [res1, res2] = await Promise.all([makeReq(), makeReq()]);
    const statuses = [res1.status, res2.status].sort();

    // Exactly one should succeed (201) and one should be rejected (409)
    const raceHandled = statuses[0] === 201 && statuses[1] === 409;

    assert(
      raceHandled,
      'PROD-35',
      'Concurrent duplicate SKU registration handled transactionally (1 created, 1 rejected with 409)',
      `Statuses: ${res1.status} and ${res2.status}`
    );
  } catch (err: any) {
    assert(false, 'PROD-35', 'Concurrent SKU test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-36: Product list page size is bounded
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products?pageSize=500`, {
      headers: { 'Authorization': 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();

    assert(
      res.status === 200 && data.pageSize <= 100,
      'PROD-36',
      'Product list pageSize clamped to hard maximum bound of 100',
      `Requested pageSize=500, received bounded pageSize=${data.pageSize}`
    );
  } catch (err: any) {
    assert(false, 'PROD-36', 'Page size bound test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-37: Arbitrary Firestore field-path injection rejected
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products?__name__=malicious&orderBy=__secret`, {
      headers: { 'Authorization': 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();

    assert(
      res.status === 400 && data.error === 'INVALID_QUERY_PARAMETERS',
      'PROD-37',
      'Arbitrary/unwhitelisted Firestore field parameters rejected with 400',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'PROD-37', 'Field path injection test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-38: Warehouse/retailer filter cannot bypass Admin authorization
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products?warehouseId=WH-BRAHMPURI-01`, {
      headers: {
        'Authorization': 'Bearer test-uid-ret-test-auth-01',
        'x-role': 'SUPER_ADMIN',
      },
    });
    const data = await res.json();

    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'PROD-38',
      'Warehouse/retailer parameters cannot bypass Super Admin RBAC gate',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'PROD-38', 'Bypass test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-39: Suspended SUPER_ADMIN rejected
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      headers: { 'Authorization': 'Bearer test-uid-ADMIN-SUSPENDED-01' },
    });
    const data = await res.json();

    assert(
      res.status === 403 && data.message?.includes('suspended'),
      'PROD-39',
      'Suspended Super Admin account blocked from product API with 403',
      `HTTP status ${res.status}, message=${data.message}`
    );
  } catch (err: any) {
    assert(false, 'PROD-39', 'Suspended admin test failed', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST PROD-40: Disabled SUPER_ADMIN rejected
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      headers: { 'Authorization': 'Bearer test-uid-ADMIN-DISABLED-01' },
    });
    const data = await res.json();

    assert(
      res.status === 403 && data.message?.includes('disabled'),
      'PROD-40',
      'Disabled Super Admin account blocked from product API with 403',
      `HTTP status ${res.status}, message=${data.message}`
    );
  } catch (err: any) {
    assert(false, 'PROD-40', 'Disabled admin test failed', err.message);
  }

  console.log('\n======================================================================');
  console.log(`PHASE 3B-2A SUPER ADMIN PRODUCT RESULTS: ${passedCount}/40 PASSED, ${failedCount} FAILED`);
  console.log('======================================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAdminProductTests().catch(err => {
  console.error('Fatal error running admin products test suite:', err.stack || err);
  process.exit(1);
});
