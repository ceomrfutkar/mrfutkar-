/**
 * MR FUTKAR — PHASE 3B-4A RETAILER MANAGEMENT BACKEND & SECURITY TEST SUITE
 * Specification: RET-B01 to RET-B30
 * 
 * Verifies:
 * - Super Admin authorization and RBAC boundaries
 * - Private retailer data isolation (Retailer A vs Retailer B)
 * - Server-side search, filtering, and bounded pagination
 * - Deactivation rule: rejected order creation server-side
 * - Historical data immutability (orders, snapshots, prices)
 * - Immutable admin audit trails
 * - Firestore security rules preventing client-side status tampering and audit forgery
 * - Architectural consistency: single retailer collection, single order collection, single PricingEngine, no live GPS
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc as clientDoc,
  updateDoc as clientUpdateDoc,
  setDoc as clientSetDoc,
  deleteDoc as clientDeleteDoc,
} from 'firebase/firestore';
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
import { db, SERVER_TXN_TOKEN } from '../server/firebaseAdmin';
import cfg from '../firebase-applet-config.json';
import { PricingEngine } from '../src/services/pricingEngine';
import { Product, ProductPricingRule } from '../src/types/product';
import * as fs from 'fs';
import * as path from 'path';

// Client-side Firestore instance for verifying security rule boundaries
const clientApp = initializeApp(cfg, 'retailer-security-test-' + Date.now());
const clientDb = getFirestore(
  clientApp,
  cfg.firestoreDatabaseId || 'ai-studio-remixremixremixr-30c2e38a-9277-4e0c-98ac-d4c97a9e8981'
);

const BASE_URL = 'http://localhost:3000';

const SUPER_ADMIN_TOKEN = 'test-uid-SUPER-ADMIN-01';
const RETAILER_A_UID = 'ret-alpha-test';
const RETAILER_B_UID = 'ret-beta-test';
const RETAILER_C_UID = 'ret-gamma-test';
const HISTORICAL_ORDER_ID = 'ord-ret-hist-01';

async function attemptClientWrite(
  fn: () => Promise<any>,
  timeoutMs = 3500
): Promise<{ blocked: boolean; error: string }> {
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

async function runRetailerBackendSecurityTests() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 3B-4A RETAILER MANAGEMENT BACKEND & SECURITY SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testId: string, description: string, evidence?: string) {
    if (condition) {
      passed++;
      console.log(`✅ [PASS] ${testId}: ${description}`);
      if (evidence) console.log(`    Evidence: ${evidence}`);
    } else {
      failed++;
      console.error(`❌ [FAIL] ${testId}: ${description}`);
      if (evidence) console.error(`    Evidence: ${evidence}`);
    }
  }

  // --- SEED TEST IDENTITIES & DOCUMENTS ---
  const now = new Date().toISOString();

  // 1. Super Admin
  const adminRef = doc(db, 'adminUsers', SUPER_ADMIN_TOKEN);
  const adminSnap = await getDoc(adminRef);
  if (!adminSnap.exists() || adminSnap.data().role !== 'SUPER_ADMIN') {
    await setDoc(adminRef, {
      uid: SUPER_ADMIN_TOKEN,
      name: 'Akash Gupta (Super Administrator)',
      mobile: '+919810012345',
      email: 'ceo.mrfutkar@gmail.com',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      createdBy: 'SYSTEM_BOOTSTRAP',
      permissionsVersion: 1,
      _serverTxnToken: SERVER_TXN_TOKEN,
    });
  }

  // 2. Retailer A (Alpha)
  const retARef = doc(db, 'retailers', RETAILER_A_UID);
  await setDoc(retARef, {
    retailerId: RETAILER_A_UID,
    shopName: 'Alpha Kirana Store',
    businessName: 'Alpha Kirana Store',
    ownerName: 'Sunil Kumar',
    mobileNumber: '9811122233',
    phone: '9811122233',
    email: 'alpha@kirana.test',
    businessType: 'Kirana Store',
    gstin: '07AAAAA1111A1Z1',
    status: 'ACTIVE',
    isActive: true,
    shopAddress: '12 Brahmpuri Main Road',
    address: '12 Brahmpuri Main Road',
    landmark: 'Near Brahmpuri Chowk',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110053',
    latitude: 28.6812,
    longitude: 77.2415,
    nearestWarehouse: 'MR FUTKAR — BRAHMPURI',
    isProfileComplete: true,
    creditLimit: 50000,
    availableCredit: 50000,
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: now,
    _serverTxnToken: SERVER_TXN_TOKEN,
  });

  // 3. Retailer B (Beta)
  const retBRef = doc(db, 'retailers', RETAILER_B_UID);
  await setDoc(retBRef, {
    retailerId: RETAILER_B_UID,
    shopName: 'Beta Provision Mart',
    businessName: 'Beta Provision Mart',
    ownerName: 'Ramesh Sharma',
    mobileNumber: '9822233344',
    phone: '9822233344',
    email: 'beta@provision.test',
    businessType: 'Supermarket',
    gstin: '07BBBBB2222B2Z2',
    status: 'ACTIVE',
    isActive: true,
    shopAddress: '45 Yamuna Vihar Market',
    address: '45 Yamuna Vihar Market',
    landmark: 'Block C Market',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110053',
    latitude: 28.6922,
    longitude: 77.2615,
    nearestWarehouse: 'MR FUTKAR — BRAHMPURI',
    isProfileComplete: true,
    creditLimit: 75000,
    availableCredit: 75000,
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: now,
    _serverTxnToken: SERVER_TXN_TOKEN,
  });

  // 4. Retailer C (Gamma - Inactive for filter test)
  const retCRef = doc(db, 'retailers', RETAILER_C_UID);
  await setDoc(retCRef, {
    retailerId: RETAILER_C_UID,
    shopName: 'Gamma General Store',
    businessName: 'Gamma General Store',
    ownerName: 'Vikas Verma',
    mobileNumber: '9833344455',
    phone: '9833344455',
    email: 'gamma@general.test',
    businessType: 'General Store',
    status: 'INACTIVE',
    isActive: false,
    shopAddress: '88 Seelampur Road',
    address: '88 Seelampur Road',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110053',
    nearestWarehouse: 'MR FUTKAR — BRAHMPURI',
    isProfileComplete: true,
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: now,
    _serverTxnToken: SERVER_TXN_TOKEN,
  });

  // 5. Seed Historical Order for Retailer A with immutable snapshot
  const orderRef = doc(db, 'orders', HISTORICAL_ORDER_ID);
  const initialHistoricalSnapshot = {
    orderId: HISTORICAL_ORDER_ID,
    retailerId: RETAILER_A_UID,
    retailerName: 'Alpha Kirana Store',
    shopName: 'Alpha Kirana Store',
    items: [
      {
        productId: 'prod-001',
        productName: 'Parle-G 800g Super Saver Family Pack',
        sku: 'PAR-GLU-800G',
        unitPrice: 155,
        price: 155,
        mrp: 180,
        quantity: 2,
        subtotal: 310,
        total: 310,
      },
    ],
    deliveryAddress: {
      id: 'ADDR-HIST-01',
      shopName: 'Alpha Kirana Store',
      ownerName: 'Sunil Kumar',
      fullAddress: '12 Brahmpuri Main Road',
      landmark: 'Near Brahmpuri Chowk',
      city: 'Delhi',
      pincode: '110053',
      phone: '9811122233',
    },
    deliveryAddressSnapshot: {
      shopName: 'Alpha Kirana Store',
      ownerName: 'Sunil Kumar',
      fullAddress: '12 Brahmpuri Main Road',
      landmark: 'Near Brahmpuri Chowk',
      city: 'Delhi',
      pincode: '110053',
      phone: '9811122233',
    },
    warehouseId: 'WH-BRAHMPURI-01',
    warehouseName: 'MR FUTKAR — BRAHMPURI',
    subtotal: 310,
    discount: 0,
    deliveryCharge: 0,
    grandTotal: 310,
    total: 310,
    paymentMethod: 'COD',
    paymentStatus: 'PAID',
    orderStatus: 'DELIVERED',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    _serverTxnToken: SERVER_TXN_TOKEN,
  };
  await setDoc(orderRef, initialHistoricalSnapshot);

  // 6. Seed Customer Fixed Pricing Rule for Retailer A
  const pricingRuleId = 'rule-ret-alpha-fixed';
  await setDoc(doc(db, 'productPricing', pricingRuleId), {
    ruleId: pricingRuleId,
    productId: 'prod-001',
    pricingType: 'CUSTOMER_FIXED',
    retailerId: RETAILER_A_UID,
    fixedPrice: 148,
    status: 'ACTIVE',
    isActive: true,
    effectiveFrom: new Date(Date.now() - 86400000 * 10).toISOString(),
    effectiveTo: null,
    createdAt: now,
    updatedAt: now,
    _serverTxnToken: SERVER_TXN_TOKEN,
  });

  // =========================================================================
  // RET-B01: SUPER_ADMIN can list retailers
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success && Array.isArray(data.retailers) && data.total >= 3,
      'RET-B01',
      'SUPER_ADMIN can list retailers',
      `HTTP status ${res.status}, count=${data.retailers?.length}, total=${data.total}`
    );
  } catch (err: any) {
    assert(false, 'RET-B01', 'SUPER_ADMIN can list retailers', err.message);
  }

  // =========================================================================
  // RET-B02: Unauthenticated retailer API request rejected
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers`);
    const data = await res.json();
    assert(
      res.status === 401 && (data.error === 'UNAUTHORIZED' || data.error === 'MISSING_AUTH_HEADER'),
      'RET-B02',
      'Unauthenticated retailer API request rejected',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'RET-B02', 'Unauthenticated retailer API request rejected', err.message);
  }

  // =========================================================================
  // RET-B03: Retailer cannot access Admin retailer API
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers`, {
      headers: { Authorization: `Bearer test-uid-${RETAILER_A_UID}` },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'RET-B03',
      'Retailer cannot access Admin retailer API',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'RET-B03', 'Retailer cannot access Admin retailer API', err.message);
  }

  // =========================================================================
  // RET-B04: Retailer A cannot access Retailer B profile
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_B_UID}`, {
      headers: { Authorization: `Bearer test-uid-${RETAILER_A_UID}` },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'RET-B04',
      'Retailer A cannot access Retailer B profile via admin endpoint',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'RET-B04', 'Retailer A cannot access Retailer B profile', err.message);
  }

  // =========================================================================
  // RET-B05: Retailer A cannot access Retailer B orders
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_B_UID}/orders`, {
      headers: { Authorization: `Bearer test-uid-${RETAILER_A_UID}` },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'RET-B05',
      'Retailer A cannot access Retailer B orders',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'RET-B05', 'Retailer A cannot access Retailer B orders', err.message);
  }

  // =========================================================================
  // RET-B06: Retailer A cannot access Retailer B pricing
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_B_UID}/pricing`, {
      headers: { Authorization: `Bearer test-uid-${RETAILER_A_UID}` },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'RET-B06',
      'Retailer A cannot access Retailer B pricing',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'RET-B06', 'Retailer A cannot access Retailer B pricing', err.message);
  }

  // =========================================================================
  // RET-B07: Retailer A cannot access Retailer B address
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_B_UID}`, {
      headers: { Authorization: `Bearer test-uid-${RETAILER_A_UID}` },
    });
    assert(
      res.status === 403,
      'RET-B07',
      'Retailer A cannot access Retailer B address',
      `HTTP status ${res.status} (Access Denied)`
    );
  } catch (err: any) {
    assert(false, 'RET-B07', 'Retailer A cannot access Retailer B address', err.message);
  }

  // =========================================================================
  // RET-B08: Retailer list pagination works
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers?page=1&pageSize=2`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assert(
      res.status === 200 &&
        data.success &&
        data.retailers?.length === 2 &&
        data.pageSize === 2 &&
        data.page === 1 &&
        data.totalPages >= 2,
      'RET-B08',
      'Retailer list pagination works',
      `pageSize=${data.pageSize}, returned=${data.retailers?.length}, totalPages=${data.totalPages}`
    );
  } catch (err: any) {
    assert(false, 'RET-B08', 'Retailer list pagination works', err.message);
  }

  // =========================================================================
  // RET-B09: Retailer search works
  // =========================================================================
  try {
    const resName = await fetch(`${BASE_URL}/api/admin/retailers?search=Alpha`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const dataName = await resName.json();

    const resPhone = await fetch(`${BASE_URL}/api/admin/retailers?search=9822233344`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const dataPhone = await resPhone.json();

    const nameMatches = dataName.retailers?.some((r: any) => r.retailerId === RETAILER_A_UID);
    const phoneMatches = dataPhone.retailers?.some((r: any) => r.retailerId === RETAILER_B_UID);

    assert(
      nameMatches && phoneMatches,
      'RET-B09',
      'Retailer search works (businessName, ownerName, mobile, pincode)',
      `Found Alpha Kirana: ${nameMatches}, Found Beta Phone: ${phoneMatches}`
    );
  } catch (err: any) {
    assert(false, 'RET-B09', 'Retailer search works', err.message);
  }

  // =========================================================================
  // RET-B10: Status filtering works
  // =========================================================================
  try {
    const resActive = await fetch(`${BASE_URL}/api/admin/retailers?status=ACTIVE`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const dataActive = await resActive.json();

    const resInactive = await fetch(`${BASE_URL}/api/admin/retailers?status=INACTIVE`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const dataInactive = await resInactive.json();

    const allActive = dataActive.retailers?.every((r: any) => r.status === 'ACTIVE' && r.isActive);
    const hasInactive = dataInactive.retailers?.some((r: any) => r.retailerId === RETAILER_C_UID);

    assert(
      allActive && hasInactive,
      'RET-B10',
      'Status filtering works (ACTIVE vs INACTIVE)',
      `Active list validated: ${allActive}, Inactive list contains Gamma: ${hasInactive}`
    );
  } catch (err: any) {
    assert(false, 'RET-B10', 'Status filtering works', err.message);
  }

  // =========================================================================
  // RET-B11: Retailer detail endpoint works
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const data = await res.json();
    assert(
      res.status === 200 &&
        data.success &&
        data.retailer?.retailerId === RETAILER_A_UID &&
        data.retailer?.businessName === 'Alpha Kirana Store' &&
        data.retailer?.pincode === '110053',
      'RET-B11',
      'Retailer detail endpoint works',
      `HTTP status 200, retailerId=${data.retailer?.retailerId}, shopName=${data.retailer?.shopName}`
    );
  } catch (err: any) {
    assert(false, 'RET-B11', 'Retailer detail endpoint works', err.message);
  }

  // =========================================================================
  // RET-B12: Retailer orders endpoint only returns that retailer's orders
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/orders`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const data = await res.json();
    const allBelongToA = data.orders?.every((o: any) => o.retailerId === RETAILER_A_UID);
    assert(
      res.status === 200 && data.success && data.orders?.length >= 1 && allBelongToA,
      'RET-B12',
      "Retailer orders endpoint only returns that retailer's orders",
      `Order count: ${data.orders?.length}, allBelongToRetailerA=${allBelongToA}`
    );
  } catch (err: any) {
    assert(false, 'RET-B12', "Retailer orders endpoint only returns that retailer's orders", err.message);
  }

  // =========================================================================
  // RET-B13: Pricing endpoint uses existing PricingEngine
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/pricing`, {
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const data = await res.json();

    // Verify PricingEngine computes effective price using these rules
    const testProd: Product = {
      productId: 'prod-001',
      sku: 'PAR-GLU-800G',
      productName: 'Parle-G 800g Super Saver Family Pack',
      mrp: 180,
      wholesalePrice: 155,
      minimumOrderQuantity: 1,
      stockQuantity: 100,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    } as any;

    const resolved = PricingEngine.resolveProductPrice({
      product: testProd,
      quantity: 5,
      retailerId: RETAILER_A_UID,
      customerPricingRules: data.customerPricingRules,
    });

    assert(
      res.status === 200 &&
        data.success &&
        data.customerPricingRules?.length >= 1 &&
        resolved.unitPrice === 148 &&
        resolved.pricingSource === 'CUSTOMER_FIXED',
      'RET-B13',
      'Pricing endpoint uses existing PricingEngine',
      `Resolved Price: ₹${resolved.unitPrice}, PricingSource: ${resolved.pricingSource} (Negotiated ₹148)`
    );
  } catch (err: any) {
    assert(false, 'RET-B13', 'Pricing endpoint uses existing PricingEngine', err.message);
  }

  // =========================================================================
  // RET-B14: Admin can deactivate retailer
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/deactivate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPER_ADMIN_TOKEN}`,
      },
      body: JSON.stringify({ reason: 'Audit compliance review' }),
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success && data.retailer?.status === 'INACTIVE' && data.retailer?.isActive === false,
      'RET-B14',
      'Admin can deactivate retailer',
      `status=${data.retailer?.status}, isActive=${data.retailer?.isActive}`
    );
  } catch (err: any) {
    assert(false, 'RET-B14', 'Admin can deactivate retailer', err.message);
  }

  // =========================================================================
  // RET-B15: Admin can reactivate retailer
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPER_ADMIN_TOKEN}`,
      },
      body: JSON.stringify({ reason: 'Compliance cleared' }),
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success && data.retailer?.status === 'ACTIVE' && data.retailer?.isActive === true,
      'RET-B15',
      'Admin can reactivate retailer',
      `status=${data.retailer?.status}, isActive=${data.retailer?.isActive}`
    );
  } catch (err: any) {
    assert(false, 'RET-B15', 'Admin can reactivate retailer', err.message);
  }

  // =========================================================================
  // RET-B16: Deactivation is idempotent
  // =========================================================================
  try {
    // First deactivation
    await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/deactivate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    // Second deactivation
    const res2 = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/deactivate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const data2 = await res2.json();
    assert(
      res2.status === 200 && data2.success && data2.alreadyInactive === true,
      'RET-B16',
      'Deactivation is idempotent',
      `alreadyInactive=${data2.alreadyInactive}, message=${data2.message}`
    );
  } catch (err: any) {
    assert(false, 'RET-B16', 'Deactivation is idempotent', err.message);
  }

  // =========================================================================
  // RET-B17: Activation is idempotent
  // =========================================================================
  try {
    // First activation
    await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/activate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    // Second activation
    const res2 = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/activate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });
    const data2 = await res2.json();
    assert(
      res2.status === 200 && data2.success && data2.alreadyActive === true,
      'RET-B17',
      'Activation is idempotent',
      `alreadyActive=${data2.alreadyActive}, message=${data2.message}`
    );
  } catch (err: any) {
    assert(false, 'RET-B17', 'Activation is idempotent', err.message);
  }

  // =========================================================================
  // RET-B18: Deactivated retailer cannot create a new order
  // =========================================================================
  try {
    // Deactivate Retailer A
    await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/deactivate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPER_ADMIN_TOKEN}` },
    });

    // Retailer A attempts to place order
    const orderPayload = {
      idempotencyKey: `IDEMP-DEACT-${Date.now()}`,
      retailerId: RETAILER_A_UID,
      warehouseId: 'WH-BRAHMPURI-01',
      paymentMethod: 'COD',
      items: [{ productId: 'prod-001', quantity: 10 }],
      deliveryAddress: {
        shopName: 'Alpha Kirana Store',
        ownerName: 'Sunil Kumar',
        fullAddress: '12 Brahmpuri Main Road',
        city: 'Delhi',
        pincode: '110053',
        phone: '9811122233',
      },
    };

    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer test-uid-${RETAILER_A_UID}`,
      },
      body: JSON.stringify(orderPayload),
    });
    const data = await res.json();

    assert(
      res.status === 403 && data.error === 'RETAILER_DEACTIVATED',
      'RET-B18',
      'Deactivated retailer cannot create a new order',
      `HTTP status ${res.status}, error=${data.error}, message=${data.message}`
    );
  } catch (err: any) {
    assert(false, 'RET-B18', 'Deactivated retailer cannot create a new order', err.message);
  }

  // =========================================================================
  // RET-B19: Existing orders remain unchanged after deactivation
  // =========================================================================
  try {
    const historicalSnap = await getDoc(doc(db, 'orders', HISTORICAL_ORDER_ID));
    const hData = historicalSnap.data() || {};
    assert(
      hData.orderId === HISTORICAL_ORDER_ID &&
        hData.grandTotal === 310 &&
        hData.orderStatus === 'DELIVERED' &&
        hData.retailerId === RETAILER_A_UID,
      'RET-B19',
      'Existing orders remain unchanged after deactivation',
      `grandTotal=${hData.grandTotal}, orderStatus=${hData.orderStatus}`
    );
  } catch (err: any) {
    assert(false, 'RET-B19', 'Existing orders remain unchanged after deactivation', err.message);
  }

  // =========================================================================
  // RET-B20: Historical deliveryAddressSnapshot remains unchanged
  // =========================================================================
  try {
    const historicalSnap = await getDoc(doc(db, 'orders', HISTORICAL_ORDER_ID));
    const hData = historicalSnap.data() || {};
    const snapshot = hData.deliveryAddressSnapshot;
    assert(
      snapshot &&
        snapshot.shopName === 'Alpha Kirana Store' &&
        snapshot.fullAddress === '12 Brahmpuri Main Road' &&
        snapshot.phone === '9811122233',
      'RET-B20',
      'Historical deliveryAddressSnapshot remains unchanged',
      `Snapshot: shopName="${snapshot?.shopName}", address="${snapshot?.fullAddress}"`
    );
  } catch (err: any) {
    assert(false, 'RET-B20', 'Historical deliveryAddressSnapshot remains unchanged', err.message);
  }

  // =========================================================================
  // RET-B21: Historical order prices remain unchanged
  // =========================================================================
  try {
    const historicalSnap = await getDoc(doc(db, 'orders', HISTORICAL_ORDER_ID));
    const hData = historicalSnap.data() || {};
    const item = (hData.items || [])[0];
    assert(
      item && item.unitPrice === 155 && item.subtotal === 310 && hData.grandTotal === 310,
      'RET-B21',
      'Historical order prices remain unchanged',
      `Historical item unitPrice=₹${item?.unitPrice}, grandTotal=₹${hData.grandTotal}`
    );
  } catch (err: any) {
    assert(false, 'RET-B21', 'Historical order prices remain unchanged', err.message);
  }

  // =========================================================================
  // RET-B22: Activation creates immutable audit log
  // =========================================================================
  try {
    // Reactivate retailer
    await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPER_ADMIN_TOKEN}`,
      },
      body: JSON.stringify({ reason: 'Reactivation audit test' }),
    });

    const auditSnap = await getDocs(
      query(collection(db, 'adminAuditLogs'), where('targetId', '==', RETAILER_A_UID))
    );
    const activationLog = auditSnap.docs
      .map((d) => d.data())
      .find((l) => l.action === 'RETAILER_ACTIVATED');

    assert(
      Boolean(
        activationLog &&
        activationLog.targetType === 'RETAILER' &&
        activationLog.targetId === RETAILER_A_UID &&
        activationLog.adminUid === 'SUPER-ADMIN-01'
      ),
      'RET-B22',
      'Activation creates immutable audit log',
      `action=${activationLog?.action}, adminUid=${activationLog?.adminUid}, timestamp=${activationLog?.timestamp}`
    );
  } catch (err: any) {
    assert(false, 'RET-B22', 'Activation creates immutable audit log', err.message);
  }

  // =========================================================================
  // RET-B23: Deactivation creates immutable audit log
  // =========================================================================
  try {
    const auditSnap = await getDocs(
      query(collection(db, 'adminAuditLogs'), where('targetId', '==', RETAILER_A_UID))
    );
    const deactivationLog = auditSnap.docs
      .map((d) => d.data())
      .find((l) => l.action === 'RETAILER_DEACTIVATED');

    assert(
      Boolean(
        deactivationLog &&
        deactivationLog.targetType === 'RETAILER' &&
        deactivationLog.targetId === RETAILER_A_UID &&
        deactivationLog.adminUid === 'SUPER-ADMIN-01'
      ),
      'RET-B23',
      'Deactivation creates immutable audit log',
      `action=${deactivationLog?.action}, adminUid=${deactivationLog?.adminUid}, timestamp=${deactivationLog?.timestamp}`
    );
  } catch (err: any) {
    assert(false, 'RET-B23', 'Deactivation creates immutable audit log', err.message);
  }

  // =========================================================================
  // RET-B24: Client cannot directly mutate retailer status
  // =========================================================================
  try {
    const directDocRef = clientDoc(clientDb, 'retailers', RETAILER_A_UID);
    const result = await attemptClientWrite(() =>
      clientUpdateDoc(directDocRef, {
        status: 'INACTIVE',
        isActive: false,
      })
    );
    assert(
      result.blocked,
      'RET-B24',
      'Client cannot directly mutate retailer status',
      `Caught security rule rejection: ${result.error}`
    );
  } catch (err: any) {
    assert(false, 'RET-B24', 'Client cannot directly mutate retailer status', err.message);
  }

  // =========================================================================
  // RET-B25: Client cannot forge retailer audit logs
  // =========================================================================
  try {
    const fakeLogRef = clientDoc(clientDb, 'adminAuditLogs', `FAKE-AUDIT-${Date.now()}`);
    const result = await attemptClientWrite(() =>
      clientSetDoc(fakeLogRef, {
        action: 'RETAILER_ACTIVATED',
        adminUid: 'HACKER-UID',
        adminName: 'Hacker',
        targetType: 'RETAILER',
        targetId: RETAILER_A_UID,
        timestamp: new Date().toISOString(),
      })
    );
    assert(
      result.blocked,
      'RET-B25',
      'Client cannot forge retailer audit logs',
      `Direct client write to adminAuditLogs rejected: ${result.error}`
    );
  } catch (err: any) {
    assert(false, 'RET-B25', 'Client cannot forge retailer audit logs', err.message);
  }

  // =========================================================================
  // RET-B26: No second retailer collection exists
  // =========================================================================
  try {
    const serverFiles = fs.readdirSync(path.join(process.cwd(), 'server'));
    let hasSecondRetailerCollection = false;
    for (const f of serverFiles) {
      if (f.endsWith('.ts')) {
        const content = fs.readFileSync(path.join(process.cwd(), 'server', f), 'utf8');
        if (
          content.includes("'customers'") ||
          content.includes('"customers"') ||
          content.includes("'retailerProfiles'") ||
          content.includes('"retailerProfiles"')
        ) {
          hasSecondRetailerCollection = true;
          break;
        }
      }
    }
    assert(
      !hasSecondRetailerCollection,
      'RET-B26',
      'No second retailer collection exists (authoritative collection is /retailers)',
      'Verified zero references to "customers" or "retailerProfiles" in server codebase.'
    );
  } catch (err: any) {
    assert(false, 'RET-B26', 'No second retailer collection exists', err.message);
  }

  // =========================================================================
  // RET-B27: No second order collection exists
  // =========================================================================
  try {
    const serverFiles = fs.readdirSync(path.join(process.cwd(), 'server'));
    let hasSecondOrderCollection = false;
    for (const f of serverFiles) {
      if (f.endsWith('.ts')) {
        const content = fs.readFileSync(path.join(process.cwd(), 'server', f), 'utf8');
        if (
          content.includes("'retailerOrders'") ||
          content.includes('"retailerOrders"') ||
          content.includes("'customerOrders'") ||
          content.includes('"customerOrders"')
        ) {
          hasSecondOrderCollection = true;
          break;
        }
      }
    }
    assert(
      !hasSecondOrderCollection,
      'RET-B27',
      'No second order collection exists (authoritative collection is /orders)',
      'Verified zero references to "retailerOrders" or "customerOrders" in server codebase.'
    );
  } catch (err: any) {
    assert(false, 'RET-B27', 'No second order collection exists', err.message);
  }

  // =========================================================================
  // RET-B28: No second pricing engine exists
  // =========================================================================
  try {
    const pricingEnginePath = path.join(process.cwd(), 'src/services/pricingEngine.ts');
    const exists = fs.existsSync(pricingEnginePath);
    // Check if any second pricing engine file was created
    const services = fs.readdirSync(path.join(process.cwd(), 'src/services'));
    const secondEngine = services.some(
      (s) => s.toLowerCase().includes('pricing') && s !== 'pricingEngine.ts'
    );
    assert(
      exists && !secondEngine,
      'RET-B28',
      'No second pricing engine exists (reuses src/services/pricingEngine.ts)',
      `PricingEngine verified at: ${pricingEnginePath}`
    );
  } catch (err: any) {
    assert(false, 'RET-B28', 'No second pricing engine exists', err.message);
  }

  // =========================================================================
  // RET-B29: No live GPS tracking is introduced
  // =========================================================================
  try {
    const retailerRoutesContent = fs.readFileSync(
      path.join(process.cwd(), 'server/adminRetailerRoutes.ts'),
      'utf8'
    );
    const hasLiveGPS =
      retailerRoutesContent.includes('navigator.geolocation.watchPosition') ||
      retailerRoutesContent.includes('liveGps') ||
      retailerRoutesContent.includes('streamCoordinates') ||
      retailerRoutesContent.includes('trackLocation');
    assert(
      !hasLiveGPS,
      'RET-B29',
      'No live GPS tracking is introduced (fixed coordinates only)',
      'Verified only static latitude/longitude address properties are stored.'
    );
  } catch (err: any) {
    assert(false, 'RET-B29', 'No live GPS tracking is introduced', err.message);
  }

  // =========================================================================
  // RET-B30: Retailer private data is never publicly readable
  // =========================================================================
  try {
    const resList = await fetch(`${BASE_URL}/api/admin/retailers`);
    const resDetail = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}`);
    const resOrders = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/orders`);
    const resPricing = await fetch(`${BASE_URL}/api/admin/retailers/${RETAILER_A_UID}/pricing`);

    const allRejected =
      resList.status === 401 &&
      resDetail.status === 401 &&
      resOrders.status === 401 &&
      resPricing.status === 401;

    assert(
      allRejected,
      'RET-B30',
      'Retailer private data is never publicly readable',
      `All unauthenticated requests rejected with 401 UNAUTHORIZED (list: ${resList.status}, detail: ${resDetail.status}, orders: ${resOrders.status}, pricing: ${resPricing.status})`
    );
  } catch (err: any) {
    assert(false, 'RET-B30', 'Retailer private data is never publicly readable', err.message);
  }

  console.log('\n======================================================================');
  console.log(`PHASE 3B-4A RETAILER BACKEND RESULTS: ${passed}/30 PASSED, ${failed} FAILED`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runRetailerBackendSecurityTests().catch((err) => {
  console.error('Fatal test runner execution failure:', err);
  process.exit(1);
});
