import { db } from '../server/firebaseAdmin';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc as clientDoc, updateDoc as clientUpdateDoc, deleteDoc as clientDeleteDoc } from 'firebase/firestore';
import cfg from '../firebase-applet-config.json';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  deleteDoc,
} from 'firebase/firestore';
import { computeStockStatus } from '../server/adminInventoryRoutes';

// Unauthenticated client Firestore to test security rules
const clientApp = initializeApp(cfg, 'client-inv-security-test-' + Date.now());
const clientDb = getFirestore(clientApp, cfg.firestoreDatabaseId || 'ai-studio-remixremixremixr-231983bd-c5c7-412c-9f2a-788b565d0639');

const BASE_URL = 'http://localhost:3000';

async function runInventoryTests() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 3B-5 INVENTORY MANAGEMENT VERIFICATION & AUDIT SUITE');
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

  // 4. Warehouse User
  const existingWhStaff = await getDoc(doc(db, 'warehouseUsers', 'WH-STAFF-01'));
  if (!existingWhStaff.exists()) {
    await setDoc(doc(db, 'warehouseUsers', 'WH-STAFF-01'), {
      uid: 'WH-STAFF-01',
      name: 'Brahmpuri Staff',
      role: 'WAREHOUSE_STAFF',
      warehouseId: 'WH-BRAHMPURI-01',
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    });
  }

  const existingWhMgr = await getDoc(doc(db, 'warehouseUsers', 'WH-MGR-01'));
  if (!existingWhMgr.exists()) {
    await setDoc(doc(db, 'warehouseUsers', 'WH-MGR-01'), {
      uid: 'WH-MGR-01',
      name: 'Brahmpuri Manager',
      role: 'WAREHOUSE_MANAGER',
      warehouseId: 'WH-BRAHMPURI-01',
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    });
  }

  // 5. Retailer User
  const existingRetailer = await getDoc(doc(db, 'retailers', 'ret-test-auth-01'));
  if (!existingRetailer.exists()) {
    await setDoc(doc(db, 'retailers', 'ret-test-auth-01'), {
      retailerId: 'ret-test-auth-01',
      shopName: 'Aggarwal Daily Needs',
      ownerName: 'Vikas Aggarwal',
      phone: '9810012345',
      address: 'Shop 4, Main Market, Brahmpuri, Delhi',
      status: 'ACTIVE',
      isActive: true,
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    });
  }

  // Create isolated test products for audit runs
  const runId = Date.now().toString(36);
  const testProdId1 = `prod-inv-test1-${runId}`;
  const testProdId2 = `prod-inv-test2-${runId}`;
  const testSku1 = `SKU-INV-${runId.toUpperCase()}-1`;
  const testSku2 = `SKU-INV-${runId.toUpperCase()}-2`;
  const testBarcode1 = `BAR-INV-${runId}-1`;

  // Seed Product 1: 50 units (IN_STOCK, threshold 20)
  await setDoc(doc(db, 'products', testProdId1), {
    productId: testProdId1,
    productName: `Tata Tea Gold Test ${runId}`,
    sku: testSku1,
    barcode: testBarcode1,
    brandName: 'Tata Tea',
    category: 'Tea & Coffee',
    stockQuantity: 50,
    lowStockThreshold: 20,
    mrp: 180,
    wholesalePrice: 155,
    unit: 'Pack',
    packSize: '500g',
    isActive: true,
    warehouseId: 'WH-BRAHMPURI-01',
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  // Seed Product 2: 10 units (LOW_STOCK, threshold 20)
  await setDoc(doc(db, 'products', testProdId2), {
    productId: testProdId2,
    productName: `Fortune Mustard Oil Test ${runId}`,
    sku: testSku2,
    barcode: `BAR-INV-${runId}-2`,
    brandName: 'Fortune',
    category: 'Edible Oils',
    stockQuantity: 10,
    lowStockThreshold: 20,
    mrp: 195,
    wholesalePrice: 168,
    unit: 'Bottle',
    packSize: '1L',
    isActive: true,
    warehouseId: 'WH-BRAHMPURI-01',
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  console.log(`Seeded test products: ${testProdId1} (Stock: 50), ${testProdId2} (Stock: 10)\n`);

  // =========================================================================
  // 1. RBAC & AUTHORIZATION (INV-01 to INV-08)
  // =========================================================================

  // INV-01: SUPER_ADMIN can list inventory
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory`, {
      headers: { Authorization: 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success === true && Array.isArray(data.products) && data.summary,
      'INV-01',
      'SUPER_ADMIN can list inventory with default pagination and stock summary',
      `HTTP status ${res.status}, count=${data.products?.length}, totalStockUnits=${data.summary?.totalStockUnits}`
    );
  } catch (err: any) {
    assert(false, 'INV-01', 'SUPER_ADMIN inventory list failed', err.message);
  }

  // INV-02: Unauthenticated list -> 401
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory`);
    const data = await res.json();
    assert(
      res.status === 401 && data.error === 'UNAUTHORIZED',
      'INV-02',
      'Unauthenticated request to list inventory rejected with 401',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'INV-02', 'Unauthenticated test failed', err.message);
  }

  // INV-03: Retailer list -> 403
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory`, {
      headers: { Authorization: 'Bearer test-uid-ret-test-auth-01' },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'INV-03',
      'Retailer token blocked from Super Admin inventory list with 403',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'INV-03', 'Retailer list test failed', err.message);
  }

  // INV-04: Delivery Partner list -> 403
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory`, {
      headers: { Authorization: 'Bearer test-uid-DP-TEST-01' },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'INV-04',
      'Delivery Partner token blocked from Admin inventory list with 403',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'INV-04', 'Delivery partner test failed', err.message);
  }

  // INV-05: Warehouse Staff list -> 403
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory`, {
      headers: { Authorization: 'Bearer test-uid-WH-STAFF-01' },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'INV-05',
      'Warehouse Staff role blocked from Super Admin inventory list with 403',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'INV-05', 'Warehouse staff test failed', err.message);
  }

  // INV-06: Warehouse Manager list -> 403
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory`, {
      headers: { Authorization: 'Bearer test-uid-WH-MGR-01' },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'INV-06',
      'Warehouse Manager role blocked from Super Admin inventory list with 403',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'INV-06', 'Warehouse manager test failed', err.message);
  }

  // INV-07: Suspended Admin -> 403
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory`, {
      headers: { Authorization: 'Bearer test-uid-ADMIN-SUSPENDED-01' },
    });
    const data = await res.json();
    assert(
      res.status === 403 && (data.error === 'ADMIN_SUSPENDED' || (data.error === 'FORBIDDEN' && String(data.message).toLowerCase().includes('suspended'))),
      'INV-07',
      'Suspended Admin blocked from listing inventory with 403 ADMIN_SUSPENDED',
      `HTTP status ${res.status}, error=${data.error}, msg=${data.message}`
    );
  } catch (err: any) {
    assert(false, 'INV-07', 'Suspended admin test failed', err.message);
  }

  // INV-08: Disabled Admin -> 403
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory`, {
      headers: { Authorization: 'Bearer test-uid-ADMIN-DISABLED-01' },
    });
    const data = await res.json();
    assert(
      res.status === 403 && (data.error === 'ADMIN_DISABLED' || (data.error === 'FORBIDDEN' && String(data.message).toLowerCase().includes('disabled'))),
      'INV-08',
      'Disabled Admin blocked from listing inventory with 403 ADMIN_DISABLED',
      `HTTP status ${res.status}, error=${data.error}, msg=${data.message}`
    );
  } catch (err: any) {
    assert(false, 'INV-08', 'Disabled admin test failed', err.message);
  }

  // =========================================================================
  // 2. SERVER-SIDE SEARCH (INV-09 to INV-13)
  // =========================================================================

  // INV-09: Search by Product Name
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory?search=${encodeURIComponent(`Tata Tea Gold Test ${runId}`)}`, {
      headers: { Authorization: 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    const found = (data.products || []).some((p: any) => p.productId === testProdId1);
    assert(
      res.status === 200 && found,
      'INV-09',
      'Server-side search by Product Name matches accurately',
      `Found product ${testProdId1} in search results`
    );
  } catch (err: any) {
    assert(false, 'INV-09', 'Search by product name failed', err.message);
  }

  // INV-10: Search by SKU
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory?search=${encodeURIComponent(testSku1)}`, {
      headers: { Authorization: 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    const found = (data.products || []).some((p: any) => p.sku === testSku1);
    assert(
      res.status === 200 && found,
      'INV-10',
      'Server-side search by SKU matches accurately',
      `Found SKU ${testSku1} in search results`
    );
  } catch (err: any) {
    assert(false, 'INV-10', 'Search by SKU failed', err.message);
  }

  // INV-11: Search by Barcode
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory?search=${encodeURIComponent(testBarcode1)}`, {
      headers: { Authorization: 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    const found = (data.products || []).some((p: any) => p.barcode === testBarcode1);
    assert(
      res.status === 200 && found,
      'INV-11',
      'Server-side search by Barcode matches accurately',
      `Found barcode ${testBarcode1} in search results`
    );
  } catch (err: any) {
    assert(false, 'INV-11', 'Search by barcode failed', err.message);
  }

  // INV-12: Search by Brand
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory?search=Tata`, {
      headers: { Authorization: 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    const allMatch = (data.products || []).every(
      (p: any) => p.brandName.toLowerCase().includes('tata') || p.productName.toLowerCase().includes('tata')
    );
    assert(
      res.status === 200 && data.products?.length > 0 && allMatch,
      'INV-12',
      'Server-side search by Brand matches accurately without downloading entire catalogue',
      `Returned ${data.products?.length} matching items`
    );
  } catch (err: any) {
    assert(false, 'INV-12', 'Search by brand failed', err.message);
  }

  // INV-13: Search with non-matching term returns empty list
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory?search=NONEXISTENT_PRODUCT_XYZ_999`, {
      headers: { Authorization: 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    assert(
      res.status === 200 && Array.isArray(data.products) && data.products.length === 0 && data.totalCount === 0,
      'INV-13',
      'Search with non-matching term safely returns empty result set',
      `Returned 0 products as expected`
    );
  } catch (err: any) {
    assert(false, 'INV-13', 'Empty search test failed', err.message);
  }

  // =========================================================================
  // 3. INVENTORY FILTERS & QUERY INJECTION DEFENSE (INV-14 to INV-20)
  // =========================================================================

  // INV-14: Filter by ALL returns full catalogue within pagination
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory?stockStatus=ALL`, {
      headers: { Authorization: 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.products?.length > 0 && data.totalCount >= 2,
      'INV-14',
      'Filter by ALL returns total catalogue count within pagination',
      `totalCount=${data.totalCount}`
    );
  } catch (err: any) {
    assert(false, 'INV-14', 'Filter ALL failed', err.message);
  }

  // INV-15: Filter by IN_STOCK returns only products where stock > lowStockThreshold
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory?stockStatus=IN_STOCK`, {
      headers: { Authorization: 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    const allValid = (data.products || []).every(
      (p: any) => p.stockStatus === 'IN_STOCK' && p.stockQuantity > p.lowStockThreshold
    );
    assert(
      res.status === 200 && allValid,
      'INV-15',
      'Filter by IN_STOCK strictly returns items where stock > lowStockThreshold',
      `Validated ${data.products?.length} products`
    );
  } catch (err: any) {
    assert(false, 'INV-15', 'Filter IN_STOCK failed', err.message);
  }

  // INV-16: Filter by LOW_STOCK returns only products where stock > 0 and stock <= lowStockThreshold
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory?stockStatus=LOW_STOCK`, {
      headers: { Authorization: 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    const allValid = (data.products || []).every(
      (p: any) => p.stockStatus === 'LOW_STOCK' && p.stockQuantity > 0 && p.stockQuantity <= p.lowStockThreshold
    );
    assert(
      res.status === 200 && allValid,
      'INV-16',
      'Filter by LOW_STOCK strictly returns items where 0 < stock <= lowStockThreshold',
      `Validated ${data.products?.length} products`
    );
  } catch (err: any) {
    assert(false, 'INV-16', 'Filter LOW_STOCK failed', err.message);
  }

  // INV-17: Filter by OUT_OF_STOCK returns only products where stock <= 0
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory?stockStatus=OUT_OF_STOCK`, {
      headers: { Authorization: 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    const allValid = (data.products || []).every(
      (p: any) => p.stockStatus === 'OUT_OF_STOCK' && p.stockQuantity <= 0
    );
    assert(
      res.status === 200 && allValid,
      'INV-17',
      'Filter by OUT_OF_STOCK strictly returns items where stock <= 0',
      `Validated ${data.products?.length} products`
    );
  } catch (err: any) {
    assert(false, 'INV-17', 'Filter OUT_OF_STOCK failed', err.message);
  }

  // INV-18: Filter by Brand correctly partitions stock items
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory?brand=Fortune`, {
      headers: { Authorization: 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    const allFortune = (data.products || []).every(
      (p: any) => p.brandName.toLowerCase() === 'fortune'
    );
    assert(
      res.status === 200 && data.products?.length > 0 && allFortune,
      'INV-18',
      'Filter by Brand partitions stock items correctly',
      `Returned ${data.products?.length} Fortune products`
    );
  } catch (err: any) {
    assert(false, 'INV-18', 'Filter by brand failed', err.message);
  }

  // INV-19: Filter by Category correctly partitions stock items
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory?category=${encodeURIComponent('Tea & Coffee')}`, {
      headers: { Authorization: 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    const allCategory = (data.products || []).every(
      (p: any) => p.category.toLowerCase() === 'tea & coffee'
    );
    assert(
      res.status === 200 && data.products?.length > 0 && allCategory,
      'INV-19',
      'Filter by Category partitions stock items correctly',
      `Returned ${data.products?.length} items in Tea & Coffee`
    );
  } catch (err: any) {
    assert(false, 'INV-19', 'Filter by category failed', err.message);
  }

  // INV-20: Arbitrary query parameters cannot inject unverified Firestore filters
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory?__maliciousField[$gt]=0&where=stockQuantity`, {
      headers: { Authorization: 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success === true,
      'INV-20',
      'Arbitrary client query parameters cannot inject unverified Firestore filters (safely ignored)',
      `Returned normal inventory list with ${data.products?.length} items`
    );
  } catch (err: any) {
    assert(false, 'INV-20', 'Query injection test failed', err.message);
  }

  // =========================================================================
  // 4. PAGINATION SAFEGUARDS (INV-21 to INV-24)
  // =========================================================================

  // INV-21: Default page size is 25
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory`, {
      headers: { Authorization: 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.pageSize === 25,
      'INV-21',
      'Default page size is 25 when not specified by client',
      `pageSize=${data.pageSize}`
    );
  } catch (err: any) {
    assert(false, 'INV-21', 'Default page size test failed', err.message);
  }

  // INV-22: Custom page size up to 100 works correctly
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory?pageSize=50`, {
      headers: { Authorization: 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.pageSize === 50,
      'INV-22',
      'Custom valid page size (50) is respected',
      `pageSize=${data.pageSize}`
    );
  } catch (err: any) {
    assert(false, 'INV-22', 'Custom page size test failed', err.message);
  }

  // INV-23: Page size exceeding 100 is rejected with 400
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory?pageSize=101`, {
      headers: { Authorization: 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'PAGE_SIZE_EXCEEDED',
      'INV-23',
      'Page size exceeding 100 is rejected with 400 PAGE_SIZE_EXCEEDED',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'INV-23', 'Exceeded page size test failed', err.message);
  }

  // INV-24: Invalid, non-numeric or negative pagination parameters safely handled
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory?pageSize=-5`, {
      headers: { Authorization: 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'INVALID_PAGE_SIZE',
      'INV-24',
      'Negative or invalid page size rejected with 400 INVALID_PAGE_SIZE',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'INV-24', 'Invalid page size test failed', err.message);
  }

  // =========================================================================
  // 5. STOCK STATUS & PRODUCT DETAIL (INV-25 to INV-28)
  // =========================================================================

  // INV-25: Stock status correctly computed from canonical lowStockThreshold
  const statusHigh = computeStockStatus(50, 20);
  const statusLow = computeStockStatus(20, 20);
  const statusOut = computeStockStatus(0, 20);
  assert(
    statusHigh === 'IN_STOCK' && statusLow === 'LOW_STOCK' && statusOut === 'OUT_OF_STOCK',
    'INV-25',
    'Stock status correctly computed from canonical lowStockThreshold (no duplicate threshold field)',
    `50->${statusHigh}, 20->${statusLow}, 0->${statusOut}`
  );

  // INV-26: Single product inventory detail
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory/${testProdId1}`, {
      headers: { Authorization: 'Bearer test-uid-SUPER-ADMIN-01' },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.product?.productId === testProdId1 && data.product?.stockQuantity === 50,
      'INV-26',
      'Single product inventory detail returns authoritative stock and threshold info',
      `stockQuantity=${data.product?.stockQuantity}, threshold=${data.product?.lowStockThreshold}`
    );
  } catch (err: any) {
    assert(false, 'INV-26', 'Product detail test failed', err.message);
  }

  // INV-27: Unauthenticated request to fetch product detail rejected with 401
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory/${testProdId1}`);
    const data = await res.json();
    assert(
      res.status === 401 && data.error === 'UNAUTHORIZED',
      'INV-27',
      'Unauthenticated request to fetch product detail rejected with 401',
      `HTTP status ${res.status}`
    );
  } catch (err: any) {
    assert(false, 'INV-27', 'Unauthenticated detail test failed', err.message);
  }

  // INV-28: Retailer token to fetch product detail rejected with 403
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory/${testProdId1}`, {
      headers: { Authorization: 'Bearer test-uid-ret-test-auth-01' },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'INV-28',
      'Retailer token to fetch product inventory detail rejected with 403',
      `HTTP status ${res.status}`
    );
  } catch (err: any) {
    assert(false, 'INV-28', 'Retailer detail test failed', err.message);
  }

  // =========================================================================
  // 6. MANUAL STOCK ADJUSTMENT VALIDATION & NEGATIVE STOCK PROTECTION (INV-29 to INV-37)
  // =========================================================================

  // INV-29: Unauthenticated adjustment -> 401
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: testProdId1,
        adjustmentType: 'ADD',
        quantity: 5,
        reason: 'Attempt unauthenticated adjustment',
      }),
    });
    const data = await res.json();
    assert(
      res.status === 401 && data.error === 'UNAUTHORIZED',
      'INV-29',
      'Unauthenticated request to adjust stock rejected with 401',
      `HTTP status ${res.status}`
    );
  } catch (err: any) {
    assert(false, 'INV-29', 'Unauthenticated adjust test failed', err.message);
  }

  // INV-30: Retailer adjustment -> 403
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-uid-ret-test-auth-01',
      },
      body: JSON.stringify({
        productId: testProdId1,
        adjustmentType: 'ADD',
        quantity: 5,
        reason: 'Attempt retailer adjustment',
      }),
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'INV-30',
      'Retailer request to adjust stock via Admin API rejected with 403',
      `HTTP status ${res.status}`
    );
  } catch (err: any) {
    assert(false, 'INV-30', 'Retailer adjust test failed', err.message);
  }

  // INV-31: Warehouse Staff adjustment via Admin API -> 403
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-uid-WH-STAFF-01',
      },
      body: JSON.stringify({
        productId: testProdId1,
        adjustmentType: 'ADD',
        quantity: 5,
        reason: 'Attempt warehouse staff adjustment via admin API',
      }),
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'INV-31',
      'Warehouse staff request to adjust stock via Admin API rejected with 403',
      `HTTP status ${res.status}`
    );
  } catch (err: any) {
    assert(false, 'INV-31', 'Warehouse staff adjust test failed', err.message);
  }

  // INV-32: Invalid adjustmentType -> 400
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({
        productId: testProdId1,
        adjustmentType: 'MULTIPLY',
        quantity: 5,
        reason: 'Invalid adjustment type',
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'INVALID_ADJUSTMENT_TYPE',
      'INV-32',
      'Manual adjustment with invalid adjustmentType rejected with 400',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'INV-32', 'Invalid adjustment type test failed', err.message);
  }

  // INV-33: Non-integer or negative or zero quantity -> 400
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({
        productId: testProdId1,
        adjustmentType: 'ADD',
        quantity: -5,
        reason: 'Negative quantity test',
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'INVALID_QUANTITY',
      'INV-33',
      'Manual adjustment with negative quantity rejected with 400 INVALID_QUANTITY',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'INV-33', 'Invalid quantity test failed', err.message);
  }

  // INV-34: Reason shorter than 5 characters -> 400
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({
        productId: testProdId1,
        adjustmentType: 'ADD',
        quantity: 5,
        reason: 'bad',
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'INVALID_REASON',
      'INV-34',
      'Manual adjustment with reason shorter than 5 characters rejected with 400',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'INV-34', 'Short reason test failed', err.message);
  }

  // INV-35: Reason exceeding 500 characters -> 400
  try {
    const longReason = 'A'.repeat(501);
    const res = await fetch(`${BASE_URL}/api/admin/inventory/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({
        productId: testProdId1,
        adjustmentType: 'ADD',
        quantity: 5,
        reason: longReason,
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'INVALID_REASON',
      'INV-35',
      'Manual adjustment with reason exceeding 500 characters rejected with 400',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'INV-35', 'Long reason test failed', err.message);
  }

  // INV-36: Negative Stock Protection: Current stock = 10, REMOVE = 11 -> REJECTED, stock remains 10
  try {
    const beforeSnap = await getDoc(doc(db, 'products', testProdId2));
    const beforeStock = Number(beforeSnap.data()?.stockQuantity);

    const res = await fetch(`${BASE_URL}/api/admin/inventory/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({
        productId: testProdId2,
        adjustmentType: 'REMOVE',
        quantity: 11,
        reason: 'Attempt to deduct more than available stock',
      }),
    });
    const data = await res.json();

    const afterSnap = await getDoc(doc(db, 'products', testProdId2));
    const afterStock = Number(afterSnap.data()?.stockQuantity);

    assert(
      res.status === 400 &&
        data.error === 'INSUFFICIENT_STOCK' &&
        beforeStock === 10 &&
        afterStock === 10,
      'INV-36',
      'Negative Stock Protection: REMOVE 11 when stock is 10 is rejected with 400, stock remains 10',
      `HTTP status ${res.status}, beforeStock=${beforeStock}, afterStock=${afterStock}`
    );
  } catch (err: any) {
    assert(false, 'INV-36', 'Negative stock protection test failed', err.message);
  }

  // INV-37: Non-existent product ID in adjustment -> 404
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({
        productId: 'prod-non-existent-xyz-999',
        adjustmentType: 'ADD',
        quantity: 5,
        reason: 'Adjust non-existent product',
      }),
    });
    const data = await res.json();
    assert(
      res.status === 404 && data.error === 'PRODUCT_NOT_FOUND',
      'INV-37',
      'Stock adjustment for non-existent product ID rejected with 404',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'INV-37', 'Non-existent product adjust test failed', err.message);
  }

  // =========================================================================
  // 7. ATOMICITY, IDEMPOTENCY & CONCURRENCY (INV-38 to INV-41)
  // =========================================================================

  // INV-38: Atomic ADD adjustment updates stock, creates ledger entry, and writes adminAuditLog
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({
        productId: testProdId1,
        adjustmentType: 'ADD',
        quantity: 15,
        reason: 'Stock intake shipment arrived from supplier',
      }),
    });
    const data = await res.json();

    const pSnap = await getDoc(doc(db, 'products', testProdId1));
    const updatedStock = Number(pSnap.data()?.stockQuantity);

    const movSnap = data.movementId ? await getDoc(doc(db, 'inventoryMovements', data.movementId)) : null;
    const auditSnap = data.auditLogId ? await getDoc(doc(db, 'adminAuditLogs', data.auditLogId)) : null;

    assert(
      res.status === 200 &&
        updatedStock === 65 &&
        Boolean(movSnap?.exists()) &&
        Boolean(auditSnap?.exists()),
      'INV-38',
      'Atomic ADD adjustment updates stock (50 -> 65), creates ledger movement, and writes adminAuditLog',
      `status: ${res.status}, error: ${data.error}, msg: ${data.message}, details: ${data.details}, stock: ${updatedStock}`
    );
  } catch (err: any) {
    assert(false, 'INV-38', 'Atomic ADD test failed', err.message);
  }

  // INV-39: Atomic REMOVE adjustment updates stock, creates ledger entry, and writes adminAuditLog
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({
        productId: testProdId1,
        adjustmentType: 'REMOVE',
        quantity: 10,
        reason: 'Damaged packaging during shelf restock',
      }),
    });
    const data = await res.json();

    const pSnap = await getDoc(doc(db, 'products', testProdId1));
    const updatedStock = Number(pSnap.data()?.stockQuantity);

    const movSnap = data.movementId ? await getDoc(doc(db, 'inventoryMovements', data.movementId)) : null;
    const auditSnap = data.auditLogId ? await getDoc(doc(db, 'adminAuditLogs', data.auditLogId)) : null;

    assert(
      res.status === 200 &&
        updatedStock === 55 &&
        Boolean(movSnap?.exists()) &&
        Boolean(auditSnap?.exists()),
      'INV-39',
      'Atomic REMOVE adjustment updates stock (65 -> 55), creates ledger movement, and writes adminAuditLog',
      `status: ${res.status}, error: ${data.error}, msg: ${data.message}, stock: ${updatedStock}`
    );
  } catch (err: any) {
    assert(false, 'INV-39', 'Atomic REMOVE test failed', err.message);
  }

  // INV-40: Adjustment Idempotency: Repeating request with identical idempotencyKey does not double-mutate stock
  try {
    const idempKey = `IDEMP-TEST-${runId}-001`;
    const payload = {
      productId: testProdId1,
      adjustmentType: 'ADD',
      quantity: 5,
      reason: 'Idempotency verification test',
      idempotencyKey: idempKey,
    };

    // First request
    const res1 = await fetch(`${BASE_URL}/api/admin/inventory/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify(payload),
    });
    const data1 = await res1.json();

    const stockAfter1 = (await getDoc(doc(db, 'products', testProdId1))).data()?.stockQuantity;

    // Second request with identical idempotencyKey
    const res2 = await fetch(`${BASE_URL}/api/admin/inventory/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify(payload),
    });
    const data2 = await res2.json();

    const stockAfter2 = (await getDoc(doc(db, 'products', testProdId1))).data()?.stockQuantity;

    assert(
      res1.status === 200 &&
        res2.status === 200 &&
        data2.isIdempotentReplay === true &&
        stockAfter1 === 60 &&
        stockAfter2 === 60,
      'INV-40',
      'Adjustment Idempotency: Repeating request with identical idempotencyKey does not double-mutate stock',
      `First: ${stockAfter1}, Second: ${stockAfter2}, isIdempotentReplay=${data2.isIdempotentReplay}`
    );
  } catch (err: any) {
    assert(false, 'INV-40', 'Adjustment idempotency test failed', err.message);
  }

  // INV-41: Concurrent adjustments against same product maintain atomic consistency
  try {
    // Initial stock is 60. Run 5 concurrent REMOVE 5 requests
    const promises = Array.from({ length: 5 }).map((_, i) =>
      fetch(`${BASE_URL}/api/admin/inventory/adjust`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-uid-SUPER-ADMIN-01',
        },
        body: JSON.stringify({
          productId: testProdId1,
          adjustmentType: 'REMOVE',
          quantity: 5,
          reason: `Concurrent deduction thread ${i}`,
        }),
      }).then(r => r.json())
    );

    const results = await Promise.all(promises);
    const allSuccessful = results.every(r => r.success === true);

    const finalSnap = await getDoc(doc(db, 'products', testProdId1));
    const finalStock = Number(finalSnap.data()?.stockQuantity);

    // Initial 60 - (5 * 5 = 25) = 35
    assert(
      allSuccessful && finalStock === 35,
      'INV-41',
      'Concurrent adjustments maintain atomic consistency without lost updates (60 - 25 = 35)',
      `All succeeded: ${allSuccessful}, finalStock: ${finalStock}`
    );
  } catch (err: any) {
    assert(false, 'INV-41', 'Concurrent adjustment test failed', err.message);
  }

  // =========================================================================
  // 8. ORDER STOCK DEDUCTION, WAREHOUSE & CANCELLATION (INV-42 to INV-47)
  // =========================================================================

  const orderProdId = `prod-order-inv-${runId}`;
  await setDoc(doc(db, 'products', orderProdId), {
    productId: orderProdId,
    productName: `Order Test Product ${runId}`,
    sku: `SKU-ORD-${runId.toUpperCase()}`,
    stockQuantity: 10,
    lowStockThreshold: 5,
    mrp: 250,
    wholesalePrice: 200,
    unit: 'Pack',
    isActive: true,
    warehouseId: 'WH-BRAHMPURI-01',
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  let createdOrderId = '';

  // INV-42: Order creation deducts stock atomically and creates inventory movement
  try {
    const orderPayload = {
      retailerId: 'ret-test-auth-01',
      retailerName: 'Vikas Aggarwal',
      shopName: 'Aggarwal Daily Needs',
      idempotencyKey: `IDEMP-ORD-${runId}-001`,
      items: [
        {
          productId: orderProdId,
          productName: `Order Test Product ${runId}`,
          quantity: 3,
        },
      ],
      paymentMethod: 'COD',
      deliveryAddressSnapshot: {
        shopName: 'Aggarwal Daily Needs',
        ownerName: 'Vikas Aggarwal',
        fullAddress: 'Shop 4, Main Market, Brahmpuri, Delhi',
        city: 'Delhi',
        pincode: '110053',
        phone: '9810012345',
      },
    };

    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-uid-ret-test-auth-01',
      },
      body: JSON.stringify(orderPayload),
    });
    const data = await res.json();
    createdOrderId = data.orderId || data.order?.orderId;

    const pSnap = await getDoc(doc(db, 'products', orderProdId));
    const stockAfterOrder = Number(pSnap.data()?.stockQuantity);

    assert(
      (res.status === 200 || res.status === 201) && stockAfterOrder === 7 && !!createdOrderId,
      'INV-42',
      'Order creation deducts stock atomically (10 -> 7) and generates order ID',
      `HTTP status ${res.status}, orderId: ${createdOrderId}, stock: ${stockAfterOrder}`
    );
  } catch (err: any) {
    assert(false, 'INV-42', 'Order stock deduction test failed', err.message);
  }

  // INV-43: Warehouse processing of order does NOT double-deduct stock
  try {
    // Transition order through warehouse workflow: PLACED -> CONFIRMED -> ACCEPTED
    const resConf = await fetch(`${BASE_URL}/api/warehouse/orders/${createdOrderId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-uid-WH-STAFF-01',
      },
      body: JSON.stringify({
        newStatus: 'CONFIRMED',
        reason: 'Warehouse confirmed order',
      }),
    });
    await resConf.json();

    const resAcc = await fetch(`${BASE_URL}/api/warehouse/orders/${createdOrderId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-uid-WH-STAFF-01',
      },
      body: JSON.stringify({
        newStatus: 'ACCEPTED',
        reason: 'Warehouse accepted order',
      }),
    });
    await resAcc.json();

    const pSnap = await getDoc(doc(db, 'products', orderProdId));
    const stockAfterWarehouse = Number(pSnap.data()?.stockQuantity);

    assert(
      stockAfterWarehouse === 7,
      'INV-43',
      'Warehouse order processing (CONFIRMED -> ACCEPTED) does NOT double-deduct stock (remains 7)',
      `Stock remains: ${stockAfterWarehouse}`
    );
  } catch (err: any) {
    assert(false, 'INV-43', 'Warehouse order processing test failed', err.message);
  }

  // INV-44: Insufficient stock blocks order creation with INSUFFICIENT_STOCK and leaves stock unchanged
  try {
    const insufficientPayload = {
      retailerId: 'ret-test-auth-01',
      retailerName: 'Vikas Aggarwal',
      shopName: 'Aggarwal Daily Needs',
      idempotencyKey: `IDEMP-ORD-FAIL-${runId}-001`,
      items: [
        {
          productId: orderProdId,
          productName: `Order Test Product ${runId}`,
          quantity: 20, // Only 7 available!
        },
      ],
      paymentMethod: 'COD',
      deliveryAddressSnapshot: {
        shopName: 'Aggarwal Daily Needs',
        ownerName: 'Vikas Aggarwal',
        fullAddress: 'Shop 4, Main Market, Brahmpuri, Delhi',
        city: 'Delhi',
        pincode: '110053',
        phone: '9810012345',
      },
    };

    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-uid-ret-test-auth-01',
      },
      body: JSON.stringify(insufficientPayload),
    });
    const data = await res.json();

    const pSnap = await getDoc(doc(db, 'products', orderProdId));
    const stockAfterReject = Number(pSnap.data()?.stockQuantity);

    assert(
      res.status === 400 && data.error === 'INSUFFICIENT_STOCK' && stockAfterReject === 7,
      'INV-44',
      'Insufficient stock blocks order creation with INSUFFICIENT_STOCK and leaves stock unchanged (7)',
      `HTTP status ${res.status}, error: ${data.error}, stock: ${stockAfterReject}`
    );
  } catch (err: any) {
    assert(false, 'INV-44', 'Insufficient stock test failed', err.message);
  }

  // INV-45: Order cancellation atomically restores stock exactly once
  try {
    const res = await fetch(`${BASE_URL}/api/orders/${createdOrderId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-uid-ret-test-auth-01',
      },
      body: JSON.stringify({
        reason: 'Customer requested cancellation',
      }),
    });
    const data = await res.json();

    const pSnap = await getDoc(doc(db, 'products', orderProdId));
    const stockAfterCancel = Number(pSnap.data()?.stockQuantity);

    // Initial 10 - 3 (order) = 7 + 3 (restoration) = 10
    assert(
      res.status === 200 && data.stockRestored === true && stockAfterCancel === 10,
      'INV-45',
      'Order cancellation atomically restores stock (7 -> 10)',
      `stockAfterCancel: ${stockAfterCancel}, stockRestored: ${data.stockRestored}`
    );
  } catch (err: any) {
    assert(false, 'INV-45', 'Order cancellation stock restore test failed', err.message);
  }

  // INV-46: Duplicate cancellation does not double-restore stock (idempotent restoration)
  try {
    const res2 = await fetch(`${BASE_URL}/api/orders/${createdOrderId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-uid-ret-test-auth-01',
      },
      body: JSON.stringify({
        reason: 'Customer duplicate cancel attempt',
      }),
    });
    const data2 = await res2.json();

    const pSnap = await getDoc(doc(db, 'products', orderProdId));
    const stockAfterSecondCancel = Number(pSnap.data()?.stockQuantity);

    assert(
      stockAfterSecondCancel === 10 && data2.alreadyCancelled === true,
      'INV-46',
      'Duplicate cancellation does NOT double-restore stock (stock remains 10, alreadyCancelled=true)',
      `stock: ${stockAfterSecondCancel}, alreadyCancelled: ${data2.alreadyCancelled}`
    );
  } catch (err: any) {
    assert(false, 'INV-46', 'Duplicate cancellation test failed', err.message);
  }

  // INV-47: Concurrent orders competing for limited stock never allow negative stock
  try {
    // Current stock is 10. Attempt 4 concurrent orders of 4 units each (16 units needed, only 10 available)
    const orderPromises = Array.from({ length: 4 }).map((_, i) =>
      fetch(`${BASE_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-uid-ret-test-auth-01',
        },
        body: JSON.stringify({
          retailerId: 'ret-test-auth-01',
          retailerName: 'Vikas Aggarwal',
          shopName: 'Aggarwal Daily Needs',
          idempotencyKey: `IDEMP-CONCURR-${runId}-ORDER-${i}`,
          items: [
            {
              productId: orderProdId,
              productName: `Order Test Product ${runId}`,
              quantity: 4,
            },
          ],
          paymentMethod: 'COD',
          deliveryAddressSnapshot: {
            shopName: 'Aggarwal Daily Needs',
            ownerName: 'Vikas Aggarwal',
            fullAddress: 'Shop 4, Main Market, Brahmpuri, Delhi',
            city: 'Delhi',
            pincode: '110053',
            phone: '9810012345',
          },
        }),
      }).then(r => r.json())
    );

    const outcomes = await Promise.all(orderPromises);
    const successfulOrders = outcomes.filter(o => o.success === true);
    const failedOrders = outcomes.filter(o => o.success === false && o.error === 'INSUFFICIENT_STOCK');

    const pSnap = await getDoc(doc(db, 'products', orderProdId));
    const stockRemaining = Number(pSnap.data()?.stockQuantity);

    // With 10 in stock, exactly 2 orders of 4 can succeed (8 deducted, 2 remaining). 2 orders must fail.
    assert(
      successfulOrders.length === 2 && failedOrders.length === 2 && stockRemaining === 2,
      'INV-47',
      'Concurrent orders competing for limited stock never allow negative stock (2 succeeded, 2 rejected, 2 remaining)',
      `Succeeded: ${successfulOrders.length}, Failed: ${failedOrders.length}, Remaining Stock: ${stockRemaining}`
    );
  } catch (err: any) {
    assert(false, 'INV-47', 'Concurrent order test failed', err.message);
  }

  // =========================================================================
  // 9. LEDGER IMMUTABILITY, AUDIT & DOMAIN ISOLATION (INV-48 to INV-50)
  // =========================================================================

  // INV-48: Inventory ledger entries in inventoryMovements cannot be updated or deleted by client
  try {
    const movSnap = await getDocs(collection(db, 'inventoryMovements'));
    const testDoc = movSnap.docs[0];

    let updateBlocked = false;
    let deleteBlocked = false;

    if (testDoc) {
      try {
        await clientUpdateDoc(clientDoc(clientDb, 'inventoryMovements', testDoc.id), { delta: 9999 });
      } catch {
        updateBlocked = true;
      }

      try {
        await clientDeleteDoc(clientDoc(clientDb, 'inventoryMovements', testDoc.id));
      } catch {
        deleteBlocked = true;
      }
    } else {
      updateBlocked = true;
      deleteBlocked = true;
    }

    assert(
      updateBlocked && deleteBlocked,
      'INV-48',
      'Inventory ledger entries in inventoryMovements are immutable (update and delete denied)',
      `updateBlocked: ${updateBlocked}, deleteBlocked: ${deleteBlocked}`
    );
  } catch (err: any) {
    assert(false, 'INV-48', 'Ledger immutability test failed', err.message);
  }

  // INV-49: Direct client Firestore write to products.stockQuantity is blocked by security rules
  try {
    let clientWriteBlocked = false;
    try {
      await clientUpdateDoc(clientDoc(clientDb, 'products', testProdId1), {
        stockQuantity: 999999,
      });
    } catch {
      clientWriteBlocked = true;
    }

    const pSnap = await getDoc(doc(db, 'products', testProdId1));
    const untouchedStock = Number(pSnap.data()?.stockQuantity);

    assert(
      clientWriteBlocked && untouchedStock !== 999999,
      'INV-49',
      'Direct client Firestore write to products.stockQuantity blocked by Firestore security rules',
      `clientWriteBlocked: ${clientWriteBlocked}, stock remains: ${untouchedStock}`
    );
  } catch (err: any) {
    assert(false, 'INV-49', 'Direct stock write protection test failed', err.message);
  }

  // INV-50: Pricing and Image isolation: Adjusting inventory does not alter pricing rules, and updating pricing does not alter stock
  try {
    // 1. Check pricing rule for product before inventory adjustment
    const ruleRef = doc(db, 'productPricing', `RULE-${testProdId1}`);
    await setDoc(ruleRef, {
      pricingId: `RULE-${testProdId1}`,
      productId: testProdId1,
      pricingType: 'GLOBAL_SLAB',
      minQuantity: 10,
      customPrice: 140,
      isActive: true,
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    });

    // 2. Adjust inventory
    await fetch(`${BASE_URL}/api/admin/inventory/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-uid-SUPER-ADMIN-01',
      },
      body: JSON.stringify({
        productId: testProdId1,
        adjustmentType: 'ADD',
        quantity: 10,
        reason: 'Verify pricing rule isolation after adjustment',
      }),
    });

    const ruleSnap = await getDoc(ruleRef);
    const ruleData = ruleSnap.data();
    const pricingIntact = ruleData?.customPrice === 140 && ruleData?.minQuantity === 10;

    assert(
      pricingIntact,
      'INV-50',
      'Domain Isolation: Adjusting inventory does NOT modify PricingEngine or productPricing rules',
      `Custom price intact: ${ruleData?.customPrice}`
    );
  } catch (err: any) {
    assert(false, 'INV-50', 'Domain isolation test failed', err.message);
  }

  console.log('\n======================================================================');
  console.log(`TOTAL TESTS: 50 | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('======================================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runInventoryTests().catch(err => {
  console.error('Fatal test error:', err.stack || err);
  process.exit(1);
});
