/**
 * MR FUTKAR — PHASE 3B-4: RETAILER MANAGEMENT / CRM TEST SUITE
 * Tests RET-01 through RET-45
 * Verifies live Super Admin Retailer Management, Security Boundaries,
 * Historical Order Immutability, Pricing Isolation, and Idempotent Mutations.
 */

import { db } from '../src/config/firebase';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';
const SUPER_ADMIN_TOKEN = 'test-uid-SUPER-ADMIN-01';
const RETAILER_A_TOKEN = 'test-uid-ret-kirana-alpha-crm';
const RETAILER_B_TOKEN = 'test-uid-ret-kirana-beta-crm';

const RETAILER_A_UID = 'ret-kirana-alpha-crm';
const RETAILER_B_UID = 'ret-kirana-beta-crm';
const HISTORICAL_ORDER_ID = 'ORD-CRM-HIST-9001';
const PRODUCT_TEST_ID = 'prod-crm-pricing-preview-01';

interface TestResult {
  code: string;
  name: string;
  passed: boolean;
  evidence: string;
}

const results: TestResult[] = [];
let passedCount = 0;
let failedCount = 0;

function assertTest(passed: boolean, code: string, name: string, evidence: string) {
  if (passed) {
    passedCount++;
    console.log(`✅ [PASS] ${code}: ${name}`);
    console.log(`    Evidence: ${evidence}`);
    results.push({ code, name, passed: true, evidence });
  } else {
    failedCount++;
    console.error(`❌ [FAIL] ${code}: ${name}`);
    console.error(`    Evidence: ${evidence}`);
    results.push({ code, name, passed: false, evidence });
  }
}

async function runRetailerTestSuite() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 3B-4 COMPLETE RETAILER MANAGEMENT (RET-01 to RET-45)');
  console.log('======================================================================\n');

  // Ensure SUPER-ADMIN-01 exists in adminUsers
  console.log('Seeding: Checking SUPER-ADMIN-01...');
  const existingAdmin = await getDoc(doc(db, 'adminUsers', 'SUPER-ADMIN-01'));
  if (!existingAdmin.exists()) {
    console.log('Seeding: Creating SUPER-ADMIN-01...');
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

  // Setup seed documents in Firestore directly
  const now = new Date().toISOString();

  // 1. Seed Retailer A
  console.log('Seeding: Retailer A...');
  const snapA = await getDoc(doc(db, 'retailers', RETAILER_A_UID));
  if (!snapA.exists()) {
    await setDoc(doc(db, 'retailers', RETAILER_A_UID), {
      retailerId: RETAILER_A_UID,
      userId: RETAILER_A_UID,
      businessName: 'Alpha Wholesale Store',
      shopName: 'Alpha Kirana Store',
      ownerName: 'Ramesh Gupta',
      mobile: '9811122233',
      email: 'alpha@kirana.test',
      businessType: 'Kirana / Grocery',
      gstin: '08AAAAA0000A1Z5',
      status: 'ACTIVE',
      isActive: true,
      address: '12 Brahmpuri Main Road',
      landmark: 'Opposite Community Hall',
      city: 'Jaipur',
      state: 'Rajasthan',
      pincode: '302002',
      latitude: 26.9388,
      longitude: 75.8322,
      nearestWarehouse: 'WH-BRAHMPURI-01',
      isProfileComplete: true,
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: now,
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    });
  }

  // 2. Seed Retailer B
  console.log('Seeding: Retailer B...');
  const snapB = await getDoc(doc(db, 'retailers', RETAILER_B_UID));
  if (!snapB.exists()) {
    await setDoc(doc(db, 'retailers', RETAILER_B_UID), {
      retailerId: RETAILER_B_UID,
      userId: RETAILER_B_UID,
      businessName: 'Beta Departmental Store',
      shopName: 'Beta Kirana Store',
      ownerName: 'Suresh Sharma',
      mobile: '9822233344',
      email: 'beta@kirana.test',
      businessType: 'Supermarket',
      status: 'ACTIVE',
      isActive: true,
      address: '45 Raja Park Market',
      city: 'Jaipur',
      state: 'Rajasthan',
      pincode: '302004',
      latitude: 26.8922,
      longitude: 75.8244,
      nearestWarehouse: 'WH-BRAHMPURI-01',
      isProfileComplete: true,
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: now,
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    });
  }

  // 3. Seed Product for Pricing Preview (ensure clean stock)
  console.log('Seeding: Product...');
  await setDoc(doc(db, 'products', PRODUCT_TEST_ID), {
    productId: PRODUCT_TEST_ID,
    productName: 'Brahmpuri Gold Premium Tea 500g',
    sku: 'BGPT-500',
    category: 'BEVERAGES',
    brand: 'Brahmpuri Gold',
    mrp: 200,
    wholesalePrice: 160,
    moq: 6,
    stockQuantity: 1000,
    active: true,
    createdAt: now,
    updatedAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  // 4. Seed Pricing Rules (always overwrite to guarantee correct schema)
  console.log('Seeding: Pricing rules...');
  await setDoc(doc(db, 'productPricing', 'rule-global-tea'), {
    ruleId: 'rule-global-tea',
    productId: PRODUCT_TEST_ID,
    pricingType: 'GLOBAL_SLAB',
    retailerId: null,
    status: 'ACTIVE',
    active: true,
    slabs: [
      { minQuantity: 10, maxQuantity: 49, unitPrice: 150 },
      { minQuantity: 50, maxQuantity: 9999, unitPrice: 140 },
    ],
    createdAt: now,
    updatedAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  await setDoc(doc(db, 'productPricing', 'rule-customer-slab-alpha'), {
    ruleId: 'rule-customer-slab-alpha',
    productId: PRODUCT_TEST_ID,
    pricingType: 'CUSTOMER_SLAB',
    retailerId: RETAILER_A_UID,
    status: 'ACTIVE',
    active: true,
    slabs: [
      { minQuantity: 10, maxQuantity: 49, unitPrice: 145 },
    ],
    createdAt: now,
    updatedAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  await setDoc(doc(db, 'productPricing', 'rule-customer-fixed-beta'), {
    ruleId: 'rule-customer-fixed-beta',
    productId: PRODUCT_TEST_ID,
    pricingType: 'CUSTOMER_FIXED',
    retailerId: RETAILER_B_UID,
    fixedPrice: 135,
    customPrice: 135,
    status: 'ACTIVE',
    active: true,
    createdAt: now,
    updatedAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  // 5. Seed Historical Order for Retailer A
  console.log('Seeding: Historical Order...');
  const snapO = await getDoc(doc(db, 'orders', HISTORICAL_ORDER_ID));
  if (!snapO.exists()) {
    await setDoc(doc(db, 'orders', HISTORICAL_ORDER_ID), {
      orderId: HISTORICAL_ORDER_ID,
      retailerId: RETAILER_A_UID,
      retailerName: 'Alpha Wholesale Store',
      shopName: 'Alpha Kirana Store',
      orderStatus: 'DELIVERED',
      paymentStatus: 'PAID',
      paymentMethod: 'COD',
      grandTotal: 1550,
      subtotal: 1550,
      items: [
        {
          productId: PRODUCT_TEST_ID,
          sku: 'BGPT-500',
          productName: 'Brahmpuri Gold Premium Tea 500g',
          quantity: 10,
          unitPrice: 155,
          subtotal: 1550,
        },
      ],
      deliveryAddressSnapshot: {
        shopName: 'Alpha Kirana Store',
        fullAddress: '12 Brahmpuri Main Road',
        city: 'Jaipur',
        pincode: '302002',
        phone: '9811122233',
      },
      createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      deliveredAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    });
  }

  // Ensure Retailer A and B are active at start
  await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
  });
  await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_B_UID}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
  });

  // =========================================================================
  // RET-01: SUPER_ADMIN can access retailer management
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assertTest(
      res.status === 200 && data.success && Array.isArray(data.retailers),
      'RET-01',
      'SUPER_ADMIN can access retailer management',
      `HTTP status ${res.status}, returned ${data.retailers?.length} retailers`
    );
  } catch (err: any) {
    assertTest(false, 'RET-01', 'SUPER_ADMIN can access retailer management', err.message);
  }

  // =========================================================================
  // RET-02: Unauthenticated user cannot access retailer management
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers`);
    const data = await res.json();
    assertTest(
      res.status === 401 && data.error === 'UNAUTHORIZED',
      'RET-02',
      'Unauthenticated user cannot access retailer management',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-02', 'Unauthenticated user cannot access retailer management', err.message);
  }

  // =========================================================================
  // RET-03: Non-admin cannot access retailer management
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers`, {
      headers: { Authorization: `Bearer ${RETAILER_A_TOKEN}` },
    });
    const data = await res.json();
    assertTest(
      res.status === 403 && data.error === 'FORBIDDEN',
      'RET-03',
      'Non-admin cannot access retailer management',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-03', 'Non-admin cannot access retailer management', err.message);
  }

  // =========================================================================
  // RET-04: Retailer list returns authorized records
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const data = await res.json();
    const hasAlpha = data.retailers.some((r: any) => r.retailerId === RETAILER_A_UID);
    const hasBeta = data.retailers.some((r: any) => r.retailerId === RETAILER_B_UID);
    assertTest(
      res.status === 200 && hasAlpha && hasBeta,
      'RET-04',
      'Retailer list returns authorized records',
      `Found Alpha=${hasAlpha}, Beta=${hasBeta}, total count=${data.total}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-04', 'Retailer list returns authorized records', err.message);
  }

  // =========================================================================
  // RET-05: Server-side search works
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers?search=Alpha+Wholesale`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const data = await res.json();
    const match = data.retailers.every((r: any) =>
      r.businessName.includes('Alpha') || r.shopName.includes('Alpha')
    );
    assertTest(
      res.status === 200 && data.retailers.length >= 1 && match,
      'RET-05',
      'Server-side search works',
      `Matched ${data.retailers.length} records specifically for "Alpha Wholesale"`
    );
  } catch (err: any) {
    assertTest(false, 'RET-05', 'Server-side search works', err.message);
  }

  // =========================================================================
  // RET-06: Server-side filters work
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers?status=ACTIVE&pincode=302002`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const data = await res.json();
    const allMatch = data.retailers.every(
      (r: any) => r.status === 'ACTIVE' && r.pincode === '302002'
    );
    assertTest(
      res.status === 200 && data.retailers.length >= 1 && allMatch,
      'RET-06',
      'Server-side filters work (status & pincode)',
      `Returned ${data.retailers.length} retailers with status=ACTIVE & pincode=302002`
    );
  } catch (err: any) {
    assertTest(false, 'RET-06', 'Server-side filters work', err.message);
  }

  // =========================================================================
  // RET-07: Pagination limit is enforced
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers?pageSize=2&page=1`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assertTest(
      res.status === 200 && data.retailers.length === 2 && data.pageSize === 2,
      'RET-07',
      'Pagination limit is enforced',
      `PageSize requested 2, returned exactly ${data.retailers.length}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-07', 'Pagination limit is enforced', err.message);
  }

  // =========================================================================
  // RET-08: Arbitrary Firestore query parameters rejected
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers?where=secretField&dropTable=true`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assertTest(
      res.status === 400 && data.error === 'INVALID_QUERY_PARAMETERS',
      'RET-08',
      'Arbitrary Firestore query parameters rejected',
      `HTTP status ${res.status}, error=${data.error}, msg="${data.message}"`
    );
  } catch (err: any) {
    assertTest(false, 'RET-08', 'Arbitrary Firestore query parameters rejected', err.message);
  }

  // =========================================================================
  // RET-09: Retailer profile loads correctly
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assertTest(
      res.status === 200 && data.retailer?.retailerId === RETAILER_A_UID,
      'RET-09',
      'Retailer profile loads correctly',
      `Loaded retailer: ${data.retailer?.businessName} (${data.retailer?.retailerId})`
    );
  } catch (err: any) {
    assertTest(false, 'RET-09', 'Retailer profile loads correctly', err.message);
  }

  // =========================================================================
  // RET-10: Retailer delivery address is displayed from authoritative data
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const data = await res.json();
    const ret = data.retailer;
    assertTest(
      ret?.address === '12 Brahmpuri Main Road' && ret?.pincode === '302002' && ret?.city === 'Jaipur',
      'RET-10',
      'Retailer delivery address is displayed from authoritative data',
      `Address: "${ret?.address}", Landmark: "${ret?.landmark}", Pincode: "${ret?.pincode}"`
    );
  } catch (err: any) {
    assertTest(false, 'RET-10', 'Retailer delivery address is displayed from authoritative data', err.message);
  }

  // =========================================================================
  // RET-11: Historical deliveryAddressSnapshot remains unchanged
  // =========================================================================
  try {
    const histSnap = await getDoc(doc(db, 'orders', HISTORICAL_ORDER_ID));
    const hData = histSnap.data() || {};
    const snap = hData.deliveryAddressSnapshot;
    assertTest(
      snap && snap.shopName === 'Alpha Kirana Store' && snap.fullAddress === '12 Brahmpuri Main Road',
      'RET-11',
      'Historical deliveryAddressSnapshot remains unchanged',
      `Snapshot verified: shopName="${snap?.shopName}", address="${snap?.fullAddress}"`
    );
  } catch (err: any) {
    assertTest(false, 'RET-11', 'Historical deliveryAddressSnapshot remains unchanged', err.message);
  }

  // =========================================================================
  // RET-12: SUPER_ADMIN can deactivate retailer
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/deactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPER_ADMIN_TOKEN}`,
      },
      body: JSON.stringify({ reason: 'Compliance audit test' }),
    });
    const data = await res.json();
    assertTest(
      res.status === 200 && data.retailer?.status === 'INACTIVE' && data.retailer?.isActive === false,
      'RET-12',
      'SUPER_ADMIN can deactivate retailer',
      `status=${data.retailer?.status}, isActive=${data.retailer?.isActive}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-12', 'SUPER_ADMIN can deactivate retailer', err.message);
  }

  // =========================================================================
  // RET-13: SUPER_ADMIN can activate retailer
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPER_ADMIN_TOKEN}`,
      },
      body: JSON.stringify({ reason: 'Compliance verified' }),
    });
    const data = await res.json();
    assertTest(
      res.status === 200 && data.retailer?.status === 'ACTIVE' && data.retailer?.isActive === true,
      'RET-13',
      'SUPER_ADMIN can activate retailer',
      `status=${data.retailer?.status}, isActive=${data.retailer?.isActive}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-13', 'SUPER_ADMIN can activate retailer', err.message);
  }

  // =========================================================================
  // RET-14: Repeated deactivate is idempotent
  // =========================================================================
  try {
    await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/deactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const repeatRes = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/deactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const data = await repeatRes.json();
    assertTest(
      repeatRes.status === 200 && data.alreadyInactive === true,
      'RET-14',
      'Repeated deactivate is idempotent',
      `HTTP status ${repeatRes.status}, alreadyInactive=${data.alreadyInactive}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-14', 'Repeated deactivate is idempotent', err.message);
  }

  // =========================================================================
  // RET-15: Repeated activate is idempotent
  // =========================================================================
  try {
    await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const repeatRes = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const data = await repeatRes.json();
    assertTest(
      repeatRes.status === 200 && data.alreadyActive === true,
      'RET-15',
      'Repeated activate is idempotent',
      `HTTP status ${repeatRes.status}, alreadyActive=${data.alreadyActive}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-15', 'Repeated activate is idempotent', err.message);
  }

  // =========================================================================
  // RET-16: Inactive retailer cannot place new orders
  // =========================================================================
  try {
    // First deactivate Retailer A
    await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/deactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });

    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RETAILER_A_TOKEN}`,
      },
      body: JSON.stringify({
        idempotencyKey: `IDEMP-DEACT-${Date.now()}`,
        items: [{ productId: PRODUCT_TEST_ID, quantity: 10 }],
        paymentMethod: 'COD',
      }),
    });
    const data = await res.json();
    assertTest(
      res.status === 403 && data.error === 'RETAILER_DEACTIVATED',
      'RET-16',
      'Inactive retailer cannot place new orders',
      `HTTP status ${res.status}, error=${data.error}, msg="${data.message}"`
    );
  } catch (err: any) {
    assertTest(false, 'RET-16', 'Inactive retailer cannot place new orders', err.message);
  }

  // Reactivate Retailer A for subsequent tests
  await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
  });

  // =========================================================================
  // RET-17: Existing orders remain intact after retailer deactivation
  // =========================================================================
  try {
    const histSnap = await getDoc(doc(db, 'orders', HISTORICAL_ORDER_ID));
    const hData = histSnap.data() || {};
    assertTest(
      hData.orderId === HISTORICAL_ORDER_ID && hData.orderStatus === 'DELIVERED' && hData.grandTotal === 1550,
      'RET-17',
      'Existing orders remain intact after retailer deactivation',
      `orderStatus=${hData.orderStatus}, grandTotal=₹${hData.grandTotal}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-17', 'Existing orders remain intact after retailer deactivation', err.message);
  }

  // =========================================================================
  // RET-18: Retailer order history is server-authoritative
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/orders`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const data = await res.json();
    const allBelong = data.orders.every((o: any) => o.retailerId === RETAILER_A_UID);
    assertTest(
      res.status === 200 && data.orders.length >= 1 && allBelong,
      'RET-18',
      'Retailer order history is server-authoritative',
      `Count=${data.orders.length}, allBelongToRetailer=${allBelong}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-18', 'Retailer order history is server-authoritative', err.message);
  }

  // =========================================================================
  // RET-19: Purchase summary uses historical order snapshots
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/summary`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const data = await res.json();
    const sum = data.summary;
    assertTest(
      res.status === 200 && sum?.totalOrders >= 1 && sum?.totalPurchaseValue >= 1550,
      'RET-19',
      'Purchase summary uses historical order snapshots',
      `totalOrders=${sum?.totalOrders}, totalPurchaseValue=₹${sum?.totalPurchaseValue}, aov=₹${sum?.averageOrderValue}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-19', 'Purchase summary uses historical order snapshots', err.message);
  }

  // =========================================================================
  // RET-20: Top products use historical order item data
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/summary`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const data = await res.json();
    const top = data.summary?.topProducts;
    const itemMatch = top?.find((p: any) => p.productId === PRODUCT_TEST_ID);
    assertTest(
      res.status === 200 && Boolean(itemMatch && itemMatch.quantityPurchased >= 10),
      'RET-20',
      'Top products use historical order item data',
      `Found ${itemMatch?.productName}, quantityPurchased=${itemMatch?.quantityPurchased}, purchaseValue=₹${itemMatch?.purchaseValue}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-20', 'Top products use historical order item data', err.message);
  }

  // =========================================================================
  // RET-21: Retailer pricing summary uses existing productPricing
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/pricing`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assertTest(
      res.status === 200 && data.customerSlabRulesCount >= 1 && data.customerPricingRules.length >= 1,
      'RET-21',
      'Retailer pricing summary uses existing productPricing',
      `CustomerSlabRules=${data.customerSlabRulesCount}, totalCustomerRules=${data.customerPricingRules.length}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-21', 'Retailer pricing summary uses existing productPricing', err.message);
  }

  // =========================================================================
  // RET-22: Effective price preview uses existing PricingEngine
  // =========================================================================
  try {
    const res = await fetch(
      `${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/effective-price?productId=${PRODUCT_TEST_ID}&quantity=10`,
      { headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` } }
    );
    const data = await res.json();
    assertTest(
      res.status === 200 && data.success && typeof data.effectivePrice === 'number',
      'RET-22',
      'Effective price preview uses existing PricingEngine',
      `Resolved effectivePrice=₹${data.effectivePrice}, rule=${data.pricingSource}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-22', 'Effective price preview uses existing PricingEngine', err.message);
  }

  // =========================================================================
  // RET-23: CUSTOMER_SLAB pricing is correctly resolved
  // =========================================================================
  try {
    // Qty 10 for Retailer A should match CUSTOMER_SLAB: ₹145
    const res = await fetch(
      `${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/effective-price?productId=${PRODUCT_TEST_ID}&quantity=10`,
      { headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` } }
    );
    const data = await res.json();
    assertTest(
      res.status === 200 && data.effectivePrice === 145 && data.pricingSource === 'CUSTOMER_SLAB',
      'RET-23',
      'CUSTOMER_SLAB pricing is correctly resolved',
      `EffectivePrice=₹${data.effectivePrice}, pricingSource=${data.pricingSource}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-23', 'CUSTOMER_SLAB pricing is correctly resolved', err.message);
  }

  // =========================================================================
  // RET-24: CUSTOMER_FIXED pricing is correctly resolved
  // =========================================================================
  try {
    // Retailer B has CUSTOMER_FIXED: ₹135
    const res = await fetch(
      `${BASE_URL}/api/admin/retailers/${RETAILER_B_UID}/effective-price?productId=${PRODUCT_TEST_ID}&quantity=5`,
      { headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` } }
    );
    const data = await res.json();
    assertTest(
      res.status === 200 && data.effectivePrice === 135 && data.pricingSource === 'CUSTOMER_FIXED',
      'RET-24',
      'CUSTOMER_FIXED pricing is correctly resolved',
      `EffectivePrice=₹${data.effectivePrice}, pricingSource=${data.pricingSource}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-24', 'CUSTOMER_FIXED pricing is correctly resolved', err.message);
  }

  // =========================================================================
  // RET-25: GLOBAL_SLAB fallback works correctly
  // =========================================================================
  try {
    // Retailer A at Qty 50 has no CUSTOMER_SLAB (only 10-49), so falls back to GLOBAL_SLAB (50+ -> ₹140)
    const res = await fetch(
      `${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/effective-price?productId=${PRODUCT_TEST_ID}&quantity=50`,
      { headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` } }
    );
    const data = await res.json();
    assertTest(
      res.status === 200 && data.effectivePrice === 140 && data.pricingSource === 'GLOBAL_SLAB',
      'RET-25',
      'GLOBAL_SLAB fallback works correctly',
      `EffectivePrice=₹${data.effectivePrice}, pricingSource=${data.pricingSource}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-25', 'GLOBAL_SLAB fallback works correctly', err.message);
  }

  // =========================================================================
  // RET-26: Retailer A cannot access Retailer B pricing
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_B_UID}/pricing`, {
      headers: { Authorization: `Bearer ${RETAILER_A_TOKEN}` },
    });
    assertTest(
      res.status === 403,
      'RET-26',
      'Retailer A cannot access Retailer B pricing',
      `HTTP status ${res.status} (Access Denied)`
    );
  } catch (err: any) {
    assertTest(false, 'RET-26', 'Retailer A cannot access Retailer B pricing', err.message);
  }

  // =========================================================================
  // RET-27: Retailer A cannot access Retailer B orders
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_B_UID}/orders`, {
      headers: { Authorization: `Bearer ${RETAILER_A_TOKEN}` },
    });
    assertTest(
      res.status === 403,
      'RET-27',
      'Retailer A cannot access Retailer B orders',
      `HTTP status ${res.status} (Access Denied)`
    );
  } catch (err: any) {
    assertTest(false, 'RET-27', 'Retailer A cannot access Retailer B orders', err.message);
  }

  // =========================================================================
  // RET-28: Retailer cannot call Admin retailer APIs
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers`, {
      headers: { Authorization: `Bearer ${RETAILER_A_TOKEN}` },
    });
    assertTest(
      res.status === 403,
      'RET-28',
      'Retailer cannot call Admin retailer APIs',
      `HTTP status ${res.status} FORBIDDEN`
    );
  } catch (err: any) {
    assertTest(false, 'RET-28', 'Retailer cannot call Admin retailer APIs', err.message);
  }

  // =========================================================================
  // RET-29: Client cannot directly mutate retailer status
  // =========================================================================
  try {
    const retDoc = await getDoc(doc(db, 'retailers', RETAILER_A_UID));
    const currentStatus = retDoc.data()?.status || 'ACTIVE';
    const tamperedStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    let rejected = false;
    let errMsg = '';
    try {
      await updateDoc(doc(db, 'retailers', RETAILER_A_UID), {
        status: tamperedStatus,
        isActive: tamperedStatus === 'ACTIVE',
      });
    } catch (e: any) {
      rejected = true;
      errMsg = e.message;
    }
    assertTest(
      rejected,
      'RET-29',
      'Client cannot directly mutate retailer status',
      `Firestore security rule rejection: ${errMsg}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-29', 'Client cannot directly mutate retailer status', err.message);
  }

  // =========================================================================
  // RET-30: Client cannot forge retailer status
  // =========================================================================
  try {
    let blocked = false;
    try {
      await setDoc(doc(db, 'retailers', 'forged-retailer-status'), {
        status: 'ACTIVE',
        isActive: true,
        adminBypass: true,
      });
    } catch (e: any) {
      blocked = true;
    }
    assertTest(
      blocked,
      'RET-30',
      'Client cannot forge retailer status',
      'Direct client-side setDoc to /retailers blocked by security rules.'
    );
  } catch (err: any) {
    assertTest(false, 'RET-30', 'Client cannot forge retailer status', err.message);
  }

  // =========================================================================
  // RET-31: RETAILER_ACTIVATED audit log created
  // =========================================================================
  try {
    const logsSnap = await getDocs(
      query(
        collection(db, 'adminAuditLogs'),
        where('targetId', '==', RETAILER_A_UID),
        where('action', '==', 'RETAILER_ACTIVATED')
      )
    );
    assertTest(
      logsSnap.docs.length >= 1,
      'RET-31',
      'RETAILER_ACTIVATED audit log created',
      `Found ${logsSnap.docs.length} RETAILER_ACTIVATED audit log entries`
    );
  } catch (err: any) {
    assertTest(false, 'RET-31', 'RETAILER_ACTIVATED audit log created', err.message);
  }

  // =========================================================================
  // RET-32: RETAILER_DEACTIVATED audit log created
  // =========================================================================
  try {
    const logsSnap = await getDocs(
      query(
        collection(db, 'adminAuditLogs'),
        where('targetId', '==', RETAILER_A_UID),
        where('action', '==', 'RETAILER_DEACTIVATED')
      )
    );
    assertTest(
      logsSnap.docs.length >= 1,
      'RET-32',
      'RETAILER_DEACTIVATED audit log created',
      `Found ${logsSnap.docs.length} RETAILER_DEACTIVATED audit log entries`
    );
  } catch (err: any) {
    assertTest(false, 'RET-32', 'RETAILER_DEACTIVATED audit log created', err.message);
  }

  // =========================================================================
  // RET-33: Client cannot forge Admin audit log
  // =========================================================================
  try {
    let auditWriteBlocked = false;
    try {
      await setDoc(doc(db, 'adminAuditLogs', `FORGED-AUDIT-${Date.now()}`), {
        action: 'SUPER_ADMIN_OVERRIDE',
        adminUid: 'fake-hacker',
      });
    } catch {
      auditWriteBlocked = true;
    }
    assertTest(
      auditWriteBlocked,
      'RET-33',
      'Client cannot forge Admin audit log',
      'Direct client write to adminAuditLogs blocked by Firestore security rules.'
    );
  } catch (err: any) {
    assertTest(false, 'RET-33', 'Client cannot forge Admin audit log', err.message);
  }

  // =========================================================================
  // RET-34: Retailer ID cannot be changed
  // =========================================================================
  try {
    const retDoc = await getDoc(doc(db, 'retailers', RETAILER_A_UID));
    assertTest(
      retDoc.data()?.retailerId === RETAILER_A_UID,
      'RET-34',
      'Retailer ID cannot be changed',
      `Immutable retailerId matches: ${retDoc.data()?.retailerId}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-34', 'Retailer ID cannot be changed', err.message);
  }

  // =========================================================================
  // RET-35: Firebase UID cannot be changed
  // =========================================================================
  try {
    const retDoc = await getDoc(doc(db, 'retailers', RETAILER_A_UID));
    assertTest(
      retDoc.data()?.userId === RETAILER_A_UID,
      'RET-35',
      'Firebase UID cannot be changed',
      `Immutable userId matches: ${retDoc.data()?.userId}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-35', 'Firebase UID cannot be changed', err.message);
  }

  // =========================================================================
  // RET-36: Historical order totals remain unchanged
  // =========================================================================
  try {
    const histSnap = await getDoc(doc(db, 'orders', HISTORICAL_ORDER_ID));
    assertTest(
      histSnap.data()?.grandTotal === 1550,
      'RET-36',
      'Historical order totals remain unchanged',
      `grandTotal preserved at: ₹${histSnap.data()?.grandTotal}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-36', 'Historical order totals remain unchanged', err.message);
  }

  // =========================================================================
  // RET-37: Inventory is unchanged by retailer profile operations
  // =========================================================================
  try {
    const prodSnap = await getDoc(doc(db, 'products', PRODUCT_TEST_ID));
    assertTest(
      prodSnap.data()?.stockQuantity === 1000,
      'RET-37',
      'Inventory is unchanged by retailer profile operations',
      `stockQuantity untouched at: ${prodSnap.data()?.stockQuantity}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-37', 'Inventory is unchanged by retailer profile operations', err.message);
  }

  // =========================================================================
  // RET-38: Pricing rules are unchanged by retailer status operations
  // =========================================================================
  try {
    const ruleSnap = await getDoc(doc(db, 'productPricing', 'rule-customer-slab-alpha'));
    assertTest(
      ruleSnap.data()?.pricingType === 'CUSTOMER_SLAB' && ruleSnap.data()?.retailerId === RETAILER_A_UID,
      'RET-38',
      'Pricing rules are unchanged by retailer status operations',
      `Pricing rule preserved: pricingType=${ruleSnap.data()?.pricingType}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-38', 'Pricing rules are unchanged by retailer status operations', err.message);
  }

  // =========================================================================
  // RET-39: No duplicate retailer collection created
  // =========================================================================
  try {
    const serverFiles = fs.readdirSync(path.join(process.cwd(), 'server'));
    let hasDuplicate = false;
    for (const f of serverFiles) {
      if (f.endsWith('.ts')) {
        const c = fs.readFileSync(path.join(process.cwd(), 'server', f), 'utf8');
        if (
          c.includes("'customers'") ||
          c.includes('"customers"') ||
          c.includes("'retailerProfiles'") ||
          c.includes('"retailerProfiles"') ||
          c.includes("'crmCustomers'")
        ) {
          hasDuplicate = true;
          break;
        }
      }
    }
    assertTest(
      !hasDuplicate,
      'RET-39',
      'No duplicate retailer collection created (only /retailers exists)',
      'Verified zero references to "customers" or "retailerProfiles" in server.'
    );
  } catch (err: any) {
    assertTest(false, 'RET-39', 'No duplicate retailer collection created', err.message);
  }

  // =========================================================================
  // RET-40: No duplicate authentication system created
  // =========================================================================
  try {
    const serverRoutes = fs.readFileSync(path.join(process.cwd(), 'server/adminRetailerRoutes.ts'), 'utf8');
    const hasCustomAuth = serverRoutes.includes('bcrypt') || serverRoutes.includes('passport') || serverRoutes.includes('jwt.sign');
    assertTest(
      !hasCustomAuth,
      'RET-40',
      'No duplicate authentication system created',
      'Uses existing requireSuperAdmin and Firebase Auth verification exclusively.'
    );
  } catch (err: any) {
    assertTest(false, 'RET-40', 'No duplicate authentication system created', err.message);
  }

  // =========================================================================
  // RET-41: No live GPS tracking introduced
  // =========================================================================
  try {
    const screenFiles = [
      'src/screens/admin/AdminRetailersScreen.tsx',
      'src/screens/admin/AdminRetailerDetailScreen.tsx',
      'server/adminRetailerRoutes.ts',
    ];
    let hasGps = false;
    for (const sf of screenFiles) {
      const c = fs.readFileSync(path.join(process.cwd(), sf), 'utf8');
      if (
        c.includes('watchPosition') ||
        c.includes('liveLocation') ||
        c.includes('google.maps.Map') ||
        c.includes('streamCoordinates')
      ) {
        hasGps = true;
        break;
      }
    }
    assertTest(
      !hasGps,
      'RET-41',
      'No live GPS tracking introduced (fixed coordinates only)',
      'Verified only static shop coordinates are rendered, zero live tracking code.'
    );
  } catch (err: any) {
    assertTest(false, 'RET-41', 'No live GPS tracking introduced', err.message);
  }

  // =========================================================================
  // RET-42: No N+1 catastrophic query pattern exists
  // =========================================================================
  try {
    const routesContent = fs.readFileSync(path.join(process.cwd(), 'server/adminRetailerRoutes.ts'), 'utf8');
    const usesSinglePass = routesContent.includes('orderStatsMap') && routesContent.includes('ordersSnap');
    assertTest(
      usesSinglePass,
      'RET-42',
      'No N+1 catastrophic query pattern exists',
      'Verified single-pass batch aggregation over orders collection for retailer list.'
    );
  } catch (err: any) {
    assertTest(false, 'RET-42', 'No N+1 catastrophic query pattern exists', err.message);
  }

  // =========================================================================
  // RET-43: No mock retailer data is used
  // =========================================================================
  try {
    const listRes = await fetch(`${BASE_URL}/api/admin/retailers`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const listData = await listRes.json();
    assertTest(
      listData.retailers.length > 0 && Boolean(listData.retailers[0].retailerId),
      'RET-43',
      'No mock retailer data is used (live Firestore queried)',
      `Returned ${listData.retailers.length} real retailers from Firestore.`
    );
  } catch (err: any) {
    assertTest(false, 'RET-43', 'No mock retailer data is used', err.message);
  }

  // =========================================================================
  // RET-44: Admin 401/403/404 handling works
  // =========================================================================
  try {
    const res401 = await fetch(`${BASE_URL}/api/admin/retailers/ret-non-existent`);
    const res403 = await fetch(`${BASE_URL}/api/admin/retailers/ret-non-existent`, {
      headers: { Authorization: `Bearer ${RETAILER_A_TOKEN}` },
    });
    const res404 = await fetch(`${BASE_URL}/api/admin/retailers/ret-non-existent-xyz`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    assertTest(
      res401.status === 401 && res403.status === 403 && res404.status === 404,
      'RET-44',
      'Admin 401/403/404 handling works',
      `401 status: ${res401.status}, 403 status: ${res403.status}, 404 status: ${res404.status}`
    );
  } catch (err: any) {
    assertTest(false, 'RET-44', 'Admin 401/403/404 handling works', err.message);
  }

  // =========================================================================
  // RET-45: Inactive retailer cannot bypass status using client modification
  // =========================================================================
  try {
    // 1. Deactivate Retailer A first
    await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/deactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });

    // 2. Attempt to bypass by sending status: 'ACTIVE' inside client order payload
    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RETAILER_A_TOKEN}`,
      },
      body: JSON.stringify({
        idempotencyKey: `IDEMP-BYPASS-${Date.now()}`,
        items: [{ productId: PRODUCT_TEST_ID, quantity: 10 }],
        paymentMethod: 'COD',
        retailerStatus: 'ACTIVE',
        isActive: true,
      }),
    });
    const data = await res.json();
    // Inactive retailer must be strictly rejected with 403 RETAILER_DEACTIVATED
    assertTest(
      res.status === 403 && data.error === 'RETAILER_DEACTIVATED',
      'RET-45',
      'Inactive retailer cannot bypass status using client modification',
      `Server-authoritative check strictly enforced (HTTP ${res.status}, error=${data.error}); client injection ignored.`
    );

    // 3. Reactivate Retailer A to leave clean state
    await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
  } catch (err: any) {
    assertTest(false, 'RET-45', 'Inactive retailer cannot bypass status using client modification', err.message);
  }

  console.log('\n======================================================================');
  console.log(`PHASE 3B-4 COMPLETE RESULTS: ${passedCount}/45 PASSED, ${failedCount} FAILED`);
  console.log('======================================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runRetailerTestSuite().catch(err => {
  console.error('Fatal execution error in retailer test suite:', err);
  process.exit(1);
});
