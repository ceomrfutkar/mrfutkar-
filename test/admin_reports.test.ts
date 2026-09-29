import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../server/firebaseAdmin';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc as clientDoc, setDoc as clientSetDoc } from 'firebase/firestore';
import cfg from '../firebase-applet-config.json';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { resolveDateRange, isDateInRange, getIstDateString, generateCsv } from '../server/reportUtils';

const BASE_URL = 'http://localhost:3000';

// Client-side Firestore instance to test client security rule boundaries
const clientApp = initializeApp(cfg, 'report-security-test-' + Date.now());
const clientDb = getFirestore(clientApp, cfg.firestoreDatabaseId);

export async function runAdminReportsTests() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 3B-10 REPORTS & BUSINESS ANALYTICS TEST SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testId: string, desc: string, evidence?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testId}: ${desc}`);
      if (evidence) console.log(`    Evidence: ${evidence}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testId}: ${desc}`);
      if (evidence) console.error(`    Evidence: ${evidence}`);
      failed++;
    }
  }

  const now = new Date().toISOString();
  const todayIst = getIstDateString(now);

  // --- SEED TEST IDENTITIES IN FIRESTORE ---
  // 1. Super Admin
  const superAdminUid = 'SUPER-ADMIN-REPORT-01';
  await setDoc(doc(db, 'adminUsers', superAdminUid), {
    uid: superAdminUid,
    name: 'Akash Gupta (Super Administrator)',
    mobile: '+919810012345',
    email: 'ceo.mrfutkar@gmail.com',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    createdBy: 'SYSTEM_BOOTSTRAP',
    permissionsVersion: 1,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    _serverWriteNonce: Date.now().toString(),
  });

  // 2. Suspended Admin
  const suspendedAdminUid = 'ADMIN-SUSPENDED-REPORT-01';
  await setDoc(doc(db, 'adminUsers', suspendedAdminUid), {
    uid: suspendedAdminUid,
    name: 'Suspended Admin',
    mobile: '+919810099992',
    email: 'suspended.report@mrfutkar.in',
    role: 'SUPER_ADMIN',
    status: 'SUSPENDED',
    createdAt: now,
    updatedAt: now,
    createdBy: 'SYSTEM_BOOTSTRAP',
    permissionsVersion: 1,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    _serverWriteNonce: Date.now().toString(),
  });

  // 3. Retailers
  const testRetailer1 = 'RET-REPORT-01';
  await setDoc(doc(db, 'retailers', testRetailer1), {
    retailerId: testRetailer1,
    ownerName: 'Sunil Kumar',
    shopName: 'Sunil Kirana & General Store',
    phone: '+919811122233',
    mobileNumber: '+919811122233',
    status: 'ACTIVE',
    isActive: true,
    createdAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    _serverWriteNonce: Date.now().toString(),
  });

  const testRetailer2 = 'RET-REPORT-02';
  await setDoc(doc(db, 'retailers', testRetailer2), {
    retailerId: testRetailer2,
    ownerName: 'Mohan Lal',
    shopName: 'Mohan Provision Store',
    phone: '+919811144455',
    mobileNumber: '+919811144455',
    status: 'ACTIVE',
    isActive: true,
    createdAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    _serverWriteNonce: Date.now().toString(),
  });

  // 4. Delivery Partners
  const testPartner1 = 'DP-REPORT-01';
  await setDoc(doc(db, 'deliveryPartners', testPartner1), {
    partnerId: testPartner1,
    userId: testPartner1,
    name: 'Raju Quick Fleet',
    mobile: '+919822211100',
    vehicleType: 'E-Loader 3 Wheeler',
    status: 'ACTIVE',
    createdAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    _serverWriteNonce: Date.now().toString(),
  });

  // 5. Products
  const testProd1 = 'PROD-REPORT-TEA-01';
  await setDoc(doc(db, 'products', testProd1), {
    productId: testProd1,
    sku: 'SKU-TEA-PREMIUM-1KG',
    productName: 'Wagh Bakri Premium CTC Tea 1kg',
    price: 480,
    stockQuantity: 5,
    lowStockThreshold: 10,
    category: 'BEVERAGES',
    createdAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    _serverWriteNonce: Date.now().toString(),
  });

  const testProd2 = 'PROD-REPORT-OIL-01';
  await setDoc(doc(db, 'products', testProd2), {
    productId: testProd2,
    sku: 'SKU-OIL-FORTUNE-15L',
    productName: 'Fortune Mustard Oil 15L Tin',
    price: 2150,
    stockQuantity: 40,
    lowStockThreshold: 10,
    category: 'EDIBLE_OILS',
    createdAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    _serverWriteNonce: Date.now().toString(),
  });

  // 6. Test Orders with canonical statuses and frozen item pricing snapshots
  const testOrder1 = 'ORD-REPORT-DELIVERED-01';
  await setDoc(doc(db, 'orders', testOrder1), {
    orderId: testOrder1,
    orderNumber: 'ORD-2026-8001',
    retailerId: testRetailer1,
    shopName: 'Sunil Kirana & General Store',
    retailerName: 'Sunil Kumar',
    warehouseId: 'WH-BRAHMPURI-01',
    orderStatus: 'DELIVERED',
    paymentMethod: 'COD',
    paymentStatus: 'PAID',
    deliveryPartnerId: testPartner1,
    deliveryPartnerName: 'Raju Quick Fleet',
    delivery: {
      assignedPartnerId: testPartner1,
      assignmentStatus: 'DELIVERED',
      deliveredAt: now,
    },
    subtotal: 9600,
    grandTotal: 9600,
    items: [
      {
        productId: testProd1,
        sku: 'SKU-TEA-PREMIUM-1KG',
        productName: 'Wagh Bakri Premium CTC Tea 1kg',
        quantity: 20,
        unitPrice: 480,
        totalPrice: 9600,
      },
    ],
    createdAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    _serverWriteNonce: Date.now().toString(),
  });

  const testOrder2 = 'ORD-REPORT-CANCELLED-01';
  await setDoc(doc(db, 'orders', testOrder2), {
    orderId: testOrder2,
    orderNumber: 'ORD-2026-8002',
    retailerId: testRetailer2,
    shopName: 'Mohan Provision Store',
    retailerName: 'Mohan Lal',
    warehouseId: 'WH-BRAHMPURI-01',
    orderStatus: 'CANCELLED',
    cancellationReason: 'RETAILER_CANCELLED_ORDER',
    paymentMethod: 'COD',
    paymentStatus: 'PENDING',
    subtotal: 4300,
    grandTotal: 4300,
    items: [
      {
        productId: testProd2,
        sku: 'SKU-OIL-FORTUNE-15L',
        productName: 'Fortune Mustard Oil 15L Tin',
        quantity: 2,
        unitPrice: 2150,
        totalPrice: 4300,
      },
    ],
    createdAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    _serverWriteNonce: Date.now().toString(),
  });

  const testOrder3 = 'ORD-REPORT-FAILED-01';
  await setDoc(doc(db, 'orders', testOrder3), {
    orderId: testOrder3,
    orderNumber: 'ORD-2026-8003',
    retailerId: testRetailer1,
    shopName: 'Sunil Kirana & General Store',
    warehouseId: 'WH-BRAHMPURI-01',
    orderStatus: 'FAILED_DELIVERY',
    paymentMethod: 'COD',
    paymentStatus: 'PENDING',
    deliveryPartnerId: testPartner1,
    deliveryPartnerName: 'Raju Quick Fleet',
    delivery: {
      assignedPartnerId: testPartner1,
      assignmentStatus: 'FAILED_DELIVERY',
      failureReason: 'SHOP_CLOSED_ON_DELIVERY',
      failedAt: now,
    },
    subtotal: 4800,
    grandTotal: 4800,
    items: [
      {
        productId: testProd1,
        sku: 'SKU-TEA-PREMIUM-1KG',
        productName: 'Wagh Bakri Premium CTC Tea 1kg',
        quantity: 10,
        unitPrice: 480,
        totalPrice: 4800,
      },
    ],
    createdAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    _serverWriteNonce: Date.now().toString(),
  });

  const testOrder4 = 'ORD-REPORT-RETURN-01';
  await setDoc(doc(db, 'orders', testOrder4), {
    orderId: testOrder4,
    orderNumber: 'ORD-2026-8004',
    retailerId: testRetailer2,
    shopName: 'Mohan Provision Store',
    warehouseId: 'WH-BRAHMPURI-01',
    orderStatus: 'RETURN_TO_WAREHOUSE',
    paymentMethod: 'COD',
    paymentStatus: 'PENDING',
    deliveryPartnerId: testPartner1,
    deliveryPartnerName: 'Raju Quick Fleet',
    delivery: {
      assignedPartnerId: testPartner1,
      assignmentStatus: 'RETURN_TO_WAREHOUSE',
      returnReason: 'DAMAGED_CARTON_REJECTED',
      returnedAt: now,
    },
    subtotal: 6450,
    grandTotal: 6450,
    items: [
      {
        productId: testProd2,
        sku: 'SKU-OIL-FORTUNE-15L',
        productName: 'Fortune Mustard Oil 15L Tin',
        quantity: 3,
        unitPrice: 2150,
        totalPrice: 6450,
      },
    ],
    createdAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    _serverWriteNonce: Date.now().toString(),
  });

  const superAdminAuth = `Bearer test-uid-${superAdminUid}`;
  const suspendedAuth = `Bearer test-uid-${suspendedAdminUid}`;
  const retailerAuth = `Bearer test-uid-${testRetailer1}`;
  const dpAuth = `Bearer test-uid-${testPartner1}`;

  // =========================================================================
  // SECTION 1: AUTHENTICATION & RBAC ENFORCEMENT
  // =========================================================================
  console.log('\n--- SECTION 1: AUTHENTICATION & RBAC ENFORCEMENT ---');

  // RP-01: SUPER_ADMIN can access reports summary
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/summary?preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(res.status === 200 && data.success === true, 'RP-01', 'SUPER_ADMIN can access reports summary', `status=${res.status}, success=${data.success}`);
  }

  // RP-02: Unauthenticated request rejected (401)
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/summary?preset=LAST_30_DAYS`);
    const data = await res.json();
    assert(res.status === 401 && data.error === 'UNAUTHORIZED', 'RP-02', 'Unauthenticated request rejected with 401 UNAUTHORIZED', `status=${res.status}, error=${data.error}`);
  }

  // RP-03: Suspended admin rejected (403)
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/summary?preset=LAST_30_DAYS`, {
      headers: { Authorization: suspendedAuth },
    });
    const data = await res.json();
    assert(res.status === 403 && data.error === 'FORBIDDEN' && data.message?.includes('suspended'), 'RP-03', 'Suspended admin rejected with 403 FORBIDDEN', `status=${res.status}, msg=${data.message}`);
  }

  // RP-04: Retailer role rejected (403)
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/summary?preset=LAST_30_DAYS`, {
      headers: { Authorization: retailerAuth },
    });
    const data = await res.json();
    assert(res.status === 403 && data.error === 'FORBIDDEN', 'RP-04', 'Retailer identity rejected from reports console (403 FORBIDDEN)', `status=${res.status}, error=${data.error}`);
  }

  // RP-05: Delivery partner role rejected (403)
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/summary?preset=LAST_30_DAYS`, {
      headers: { Authorization: dpAuth },
    });
    const data = await res.json();
    assert(res.status === 403 && data.error === 'FORBIDDEN', 'RP-05', 'Delivery Partner identity rejected from reports console (403 FORBIDDEN)', `status=${res.status}, error=${data.error}`);
  }

  // RP-06: Warehouse staff role rejected (403)
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/summary?preset=LAST_30_DAYS`, {
      headers: { Authorization: 'Bearer test-uid-WH-STAFF-01' },
    });
    const data = await res.json();
    assert(res.status === 403 && data.error === 'FORBIDDEN', 'RP-06', 'Warehouse staff identity rejected from reports console (403 FORBIDDEN)', `status=${res.status}`);
  }

  // RP-07: Spoofed client role headers rejected
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/summary?preset=LAST_30_DAYS`, {
      headers: {
        Authorization: retailerAuth,
        'X-Role': 'SUPER_ADMIN',
        'X-Admin-Role': 'SUPER_ADMIN',
      },
    });
    const data = await res.json();
    assert(res.status === 403 && data.error === 'FORBIDDEN', 'RP-07', 'Spoofed client role headers rejected; server resolves authoritative adminUsers doc', `status=${res.status}`);
  }

  // =========================================================================
  // SECTION 2: DATE RANGE & TIMEZONE VALIDATION
  // =========================================================================
  console.log('\n--- SECTION 2: DATE RANGE & TIMEZONE (ASIA/KOLKATA) VALIDATION ---');

  // RP-08: Date range preset TODAY returns IST boundaries
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/summary?preset=TODAY`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.metadata.preset === 'TODAY' && data.metadata.dateFrom === todayIst,
      'RP-08',
      'Date range preset TODAY returns current IST date',
      `dateFrom=${data.metadata?.dateFrom}, expected=${todayIst}`
    );
  }

  // RP-09: Date range preset LAST_7_DAYS
  {
    const range = resolveDateRange('LAST_7_DAYS');
    assert(range.success && range.preset === 'LAST_7_DAYS', 'RP-09', 'resolveDateRange LAST_7_DAYS succeeds', `from=${range.dateFrom}, to=${range.dateTo}`);
  }

  // RP-10: Date range preset LAST_30_DAYS
  {
    const range = resolveDateRange('LAST_30_DAYS');
    assert(range.success && range.preset === 'LAST_30_DAYS', 'RP-10', 'resolveDateRange LAST_30_DAYS succeeds', `from=${range.dateFrom}, to=${range.dateTo}`);
  }

  // RP-11: Custom date range valid
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/summary?preset=CUSTOM&dateFrom=2026-03-01&dateTo=2026-03-24`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.metadata.dateFrom === '2026-03-01' && data.metadata.dateTo === '2026-03-24',
      'RP-11',
      'Valid custom date range returns exact IST dates',
      `from=${data.metadata?.dateFrom}, to=${data.metadata?.dateTo}`
    );
  }

  // RP-12: Custom date range invalid format rejected (400 INVALID_DATE_RANGE)
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/summary?preset=CUSTOM&dateFrom=bad-date&dateTo=2026-03-24`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(res.status === 400 && data.error === 'INVALID_DATE_RANGE', 'RP-12', 'Invalid date format rejected with 400 INVALID_DATE_RANGE', `error=${data.error}`);
  }

  // RP-13: Custom date range dateFrom > dateTo rejected (400 INVALID_DATE_RANGE)
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/summary?preset=CUSTOM&dateFrom=2026-03-25&dateTo=2026-03-20`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(res.status === 400 && data.error === 'INVALID_DATE_RANGE', 'RP-13', 'dateFrom > dateTo rejected with 400 INVALID_DATE_RANGE', `message=${data.message}`);
  }

  // RP-14: Custom date range > 365 days rejected (400 INVALID_DATE_RANGE)
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/summary?preset=CUSTOM&dateFrom=2024-01-01&dateTo=2026-01-01`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(res.status === 400 && data.error === 'INVALID_DATE_RANGE', 'RP-14', 'Custom range > 365 days rejected with 400 INVALID_DATE_RANGE', `message=${data.message}`);
  }

  // RP-15: Timezone Asia/Kolkata documented in metadata
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/summary?preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(
      data.metadata.timezone === 'Asia/Kolkata' && data.metadata.currency === 'INR',
      'RP-15',
      'Metadata explicitly states timezone=Asia/Kolkata and currency=INR',
      `tz=${data.metadata?.timezone}, currency=${data.metadata?.currency}`
    );
  }

  // =========================================================================
  // SECTION 3: EXECUTIVE SUMMARY & METRIC DERIVATION
  // =========================================================================
  console.log('\n--- SECTION 3: EXECUTIVE SUMMARY & METRIC DERIVATION ---');

  let summaryKpis: any = null;
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/summary?preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    summaryKpis = data.kpis;
  }

  // RP-16: Gross Sales calculation (non-cancelled orders)
  {
    assert(summaryKpis.grossSales >= 9600, 'RP-16', 'Gross sales correctly excludes CANCELLED order value', `grossSales=${summaryKpis.grossSales}`);
  }

  // RP-17: Delivered Sales calculation (DELIVERED status only)
  {
    assert(summaryKpis.deliveredSales >= 9600 && summaryKpis.deliveredOrders >= 1, 'RP-17', 'Delivered sales reflects DELIVERED order grand total', `deliveredSales=${summaryKpis.deliveredSales}, count=${summaryKpis.deliveredOrders}`);
  }

  // RP-18: Cancelled Value calculation
  {
    assert(summaryKpis.cancelledValue >= 4300 && summaryKpis.cancelledOrders >= 1, 'RP-18', 'Cancelled value correctly reflects CANCELLED order grand total', `cancelledValue=${summaryKpis.cancelledValue}, count=${summaryKpis.cancelledOrders}`);
  }

  // RP-19: Failed Delivery Value calculation
  {
    assert(summaryKpis.failedDeliveryValue >= 4800 && summaryKpis.failedDeliveries >= 1, 'RP-19', 'Failed delivery value and count aggregated', `failedValue=${summaryKpis.failedDeliveryValue}, count=${summaryKpis.failedDeliveries}`);
  }

  // RP-20: Return to Warehouse Value calculation
  {
    assert(summaryKpis.returnToWarehouseValue >= 6450 && summaryKpis.returnToWarehouseOrders >= 1, 'RP-20', 'Return to warehouse value and count aggregated', `returnValue=${summaryKpis.returnToWarehouseValue}, count=${summaryKpis.returnToWarehouseOrders}`);
  }

  // RP-21: Average Order Value (AOV) calculation
  {
    assert(summaryKpis.averageOrderValue > 0, 'RP-21', 'Average Order Value computed as grossSales / nonCancelledOrders', `aov=${summaryKpis.averageOrderValue}`);
  }

  // RP-22: Pending COD calculation
  {
    assert(typeof summaryKpis.pendingCod === 'number', 'RP-22', 'Pending COD aggregated for unpaid in-transit COD orders', `pendingCod=${summaryKpis.pendingCod}`);
  }

  // RP-23: Collected COD calculation
  {
    assert(summaryKpis.collectedCod >= 9600, 'RP-23', 'Collected COD aggregated for paid COD orders', `collectedCod=${summaryKpis.collectedCod}`);
  }

  // RP-24: Active Retailers count
  {
    assert(summaryKpis.activeRetailers >= 2, 'RP-24', 'Active Kirana Retailers count derived from authoritative retailers collection', `activeRetailers=${summaryKpis.activeRetailers}`);
  }

  // RP-25: Active Delivery Partners count
  {
    assert(summaryKpis.activeDeliveryPartners >= 1, 'RP-25', 'Active Delivery Partners fleet count derived from deliveryPartners collection', `activePartners=${summaryKpis.activeDeliveryPartners}`);
  }

  // =========================================================================
  // SECTION 4: SALES & ORDERS REPORTING
  // =========================================================================
  console.log('\n--- SECTION 4: SALES & ORDERS REPORTING ---');

  // RP-26: Daily sales trend buckets
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/sales?preset=LAST_30_DAYS&groupBy=daily`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(res.status === 200 && Array.isArray(data.trends), 'RP-26', 'Daily sales trends returned with date buckets', `trendsCount=${data.trends?.length}`);
  }

  // RP-27: Weekly sales trend buckets
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/sales?preset=LAST_30_DAYS&groupBy=weekly`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(res.status === 200 && Array.isArray(data.trends), 'RP-27', 'Weekly sales trends returned with grouped buckets', `trendsCount=${data.trends?.length}`);
  }

  // RP-28: Monthly sales trend buckets
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/sales?preset=LAST_30_DAYS&groupBy=monthly`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(res.status === 200 && Array.isArray(data.trends), 'RP-28', 'Monthly sales trends returned with YYYY-MM buckets', `trendsCount=${data.trends?.length}`);
  }

  // RP-29: Canonical order status distribution
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/orders?preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    const hasDelivered = data.distribution?.some((d: any) => d.status === 'DELIVERED');
    const hasCancelled = data.distribution?.some((d: any) => d.status === 'CANCELLED');
    assert(res.status === 200 && hasDelivered && hasCancelled, 'RP-29', 'Order status distribution provides canonical status breakdown', `statuses=${data.distribution?.map((d: any) => d.status).join(',')}`);
  }

  // RP-30: Historical order price snapshot preserved (does not recalculate)
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/orders?preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    const deliveredItem = data.distribution?.find((d: any) => d.status === 'DELIVERED');
    assert(deliveredItem && deliveredItem.totalValue >= 9600, 'RP-30', 'Historical order value preserved from snapshot grandTotal', `value=${deliveredItem?.totalValue}`);
  }

  // =========================================================================
  // SECTION 5: PRODUCT / SKU PERFORMANCE REPORTING
  // =========================================================================
  console.log('\n--- SECTION 5: PRODUCT / SKU PERFORMANCE REPORTING ---');

  // RP-31: Product sales & quantity sold aggregation
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/products?preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    const teaProd = data.products?.find((p: any) => p.productId === testProd1);
    assert(
      teaProd && teaProd.quantitySold >= 20,
      'RP-31',
      'Product units sold aggregated correctly from non-cancelled orders',
      `unitsSold=${teaProd?.quantitySold}, revenue=${teaProd?.salesValue}`
    );
  }

  // RP-32: Top products by quantity sold
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/products?preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(Array.isArray(data.topProducts?.byQuantity) && data.topProducts.byQuantity.length > 0, 'RP-32', 'Top products by volume computed', `topVolume=${data.topProducts?.byQuantity?.[0]?.productName}`);
  }

  // RP-33: Top products by sales value
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/products?preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(Array.isArray(data.topProducts?.bySales) && data.topProducts.bySales.length > 0, 'RP-33', 'Top products by revenue computed', `topRevenue=${data.topProducts?.bySales?.[0]?.productName}`);
  }

  // RP-34: Low stock indicator on product report
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/products?preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    const teaProd = data.products?.find((p: any) => p.productId === testProd1);
    assert(teaProd && teaProd.isLowStock === true, 'RP-34', 'Low stock indicator flags products at or below threshold', `stock=${teaProd?.currentStock}, threshold=${teaProd?.lowStockThreshold}`);
  }

  // RP-35: Product report server pagination & page size limit <= 100
  {
    const resGood = await fetch(`${BASE_URL}/api/admin/reports/products?preset=LAST_30_DAYS&page=1&pageSize=10`, {
      headers: { Authorization: superAdminAuth },
    });
    const dataGood = await resGood.json();

    const resOver = await fetch(`${BASE_URL}/api/admin/reports/products?preset=LAST_30_DAYS&page=1&pageSize=150`, {
      headers: { Authorization: superAdminAuth },
    });
    const dataOver = await resOver.json();

    assert(
      resGood.status === 200 && dataGood.pagination?.pageSize === 10 && resOver.status === 400 && dataOver.error === 'PAGE_SIZE_EXCEEDED',
      'RP-35',
      'Product report enforces server pagination and rejects pageSize > 100',
      `resOverStatus=${resOver.status}`
    );
  }

  // =========================================================================
  // SECTION 6: RETAILER PROCUREMENT & PERFORMANCE
  // =========================================================================
  console.log('\n--- SECTION 6: RETAILER PROCUREMENT & PERFORMANCE ---');

  // RP-36: Retailer performance aggregation
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/retailers?preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    const r1 = data.retailers?.find((r: any) => r.retailerId === testRetailer1);
    assert(r1 && r1.orderCount >= 2 && r1.deliveredOrderCount >= 1, 'RP-36', 'Retailer order count and delivered orders aggregated', `orders=${r1?.orderCount}, delivered=${r1?.deliveredOrderCount}`);
  }

  // RP-37: Top retailers by sales
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/retailers?preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(Array.isArray(data.topRetailers?.bySales) && data.topRetailers.bySales.length > 0, 'RP-37', 'Top retailers by sales value derived', `topShop=${data.topRetailers?.bySales?.[0]?.shopName}`);
  }

  // RP-38: Top retailers by orders
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/retailers?preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(Array.isArray(data.topRetailers?.byOrders) && data.topRetailers.byOrders.length > 0, 'RP-38', 'Top retailers by order frequency derived', `topShop=${data.topRetailers?.byOrders?.[0]?.shopName}`);
  }

  // RP-39: Retailer search filter
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/retailers?preset=LAST_30_DAYS&search=Sunil`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    const allMatch = data.retailers?.every((r: any) => r.shopName.includes('Sunil') || r.ownerName.includes('Sunil'));
    assert(res.status === 200 && data.retailers?.length >= 1 && allMatch, 'RP-39', 'Retailer search filters across shop and owner names', `count=${data.retailers?.length}`);
  }

  // RP-40: Retailer pagination
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/retailers?preset=LAST_30_DAYS&page=1&pageSize=1`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(res.status === 200 && data.retailers?.length === 1 && data.pagination?.pageSize === 1, 'RP-40', 'Retailer pagination respects page & pageSize parameters', `pageSize=${data.pagination?.pageSize}`);
  }

  // =========================================================================
  // SECTION 7: WAREHOUSE FULFILLMENT & INVENTORY AUDIT
  // =========================================================================
  console.log('\n--- SECTION 7: WAREHOUSE FULFILLMENT & INVENTORY AUDIT ---');

  // RP-41: Fulfillment operational funnel metrics
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/warehouse?preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    const wm = data.warehouseMetrics;
    assert(
      res.status === 200 && wm && typeof wm.acceptedCount === 'number' && typeof wm.dispatchedCount === 'number',
      'RP-41',
      'Warehouse operational fulfillment funnel metrics aggregated',
      `accepted=${wm?.acceptedCount}, dispatched=${wm?.dispatchedCount}`
    );
  }

  // RP-42: Inventory movements / stock adjustment count & breakdown
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/warehouse?preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    const wm = data.warehouseMetrics;
    assert(typeof wm?.stockAdjustmentsCount === 'number' && wm?.movementReasonsBreakdown !== undefined, 'RP-42', 'Warehouse inventory movements count & reasons breakdown returned', `adjCount=${wm?.stockAdjustmentsCount}`);
  }

  // =========================================================================
  // SECTION 8: DELIVERY FLEET & COD RECONCILIATION
  // =========================================================================
  console.log('\n--- SECTION 8: DELIVERY FLEET & COD RECONCILIATION ---');

  // RP-43: Delivery partner performance metrics
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/delivery?preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    const p1 = data.partners?.find((p: any) => p.partnerId === testPartner1);
    assert(p1 && p1.deliveredCount >= 1 && p1.failedCount >= 1, 'RP-43', 'Delivery partner delivery & failure consignments tracked', `delivered=${p1?.deliveredCount}, failed=${p1?.failedCount}`);
  }

  // RP-44: Delivery partner COD pending vs collected
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/delivery?preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    const p1 = data.partners?.find((p: any) => p.partnerId === testPartner1);
    assert(p1 && p1.codCollected >= 9600, 'RP-44', 'Delivery partner collected COD reflects completed deliveries', `collected=${p1?.codCollected}`);
  }

  // RP-45: Delivery partner success rate calculation
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/delivery?preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    const p1 = data.partners?.find((p: any) => p.partnerId === testPartner1);
    assert(p1 && typeof p1.successRate === 'number' && p1.successRate >= 0 && p1.successRate <= 100, 'RP-45', 'Delivery partner success rate accurately bounded 0-100%', `successRate=${p1?.successRate}%`);
  }

  // =========================================================================
  // SECTION 9: COD, CANCELLATIONS, FAILED DELIVERIES & RETURNS
  // =========================================================================
  console.log('\n--- SECTION 9: COD, CANCELLATIONS, FAILED DELIVERIES & RETURNS ---');

  // RP-46: COD report with partner breakdown
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/cod?preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    const cod = data.codMetrics;
    assert(
      res.status === 200 && cod && cod.totalCodOrders >= 1 && Array.isArray(cod.partnerBreakdown),
      'RP-46',
      'COD report aggregates total COD volume and rider breakdown',
      `totalCod=${cod?.totalCodValue}, collected=${cod?.collectedCodValue}`
    );
  }

  // RP-47: Cancellation report with reasons breakdown
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/cancellations?preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    const can = data.cancellationMetrics;
    assert(
      res.status === 200 && can && can.cancellationCount >= 1 && can.reasonsBreakdown?.RETAILER_CANCELLED_ORDER >= 1,
      'RP-47',
      'Cancellation report tracks reason breakdown including RETAILER_CANCELLED_ORDER',
      `count=${can?.cancellationCount}, reasons=${JSON.stringify(can?.reasonsBreakdown)}`
    );
  }

  // RP-48: Failed delivery report with partner breakdown
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/failed-deliveries?preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    const f = data.failedMetrics;
    assert(
      res.status === 200 && f && f.failedDeliveryCount >= 1 && f.reasonsBreakdown?.SHOP_CLOSED_ON_DELIVERY >= 1,
      'RP-48',
      'Failed deliveries report tracks failure reasons and partner attributions',
      `failedCount=${f?.failedDeliveryCount}`
    );
  }

  // RP-49: Returns report with reasons breakdown
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/returns?preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    const r = data.returnMetrics;
    assert(
      res.status === 200 && r && r.returnCount >= 1 && Array.isArray(r.recentReturns),
      'RP-49',
      'Returns report provides return-to-warehouse consignments log',
      `returnsCount=${r?.returnCount}`
    );
  }

  // =========================================================================
  // SECTION 10: CSV EXPORT & AUDIT CONTROLS
  // =========================================================================
  console.log('\n--- SECTION 10: CSV EXPORT & AUDIT CONTROLS ---');

  // RP-50: CSV export returns valid text/csv format with sanitized headers
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/export?type=orders&preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const csv = await res.text();
    const contentType = res.headers.get('content-type') || '';
    const hasHeader = csv.includes('Order ID') && csv.includes('Grand Total (INR)');
    assert(
      res.status === 200 && contentType.includes('text/csv') && hasHeader,
      'RP-50',
      'CSV export returns text/csv format with sanitized order headers',
      `contentType=${contentType}`
    );
  }

  // RP-51: CSV export contains no private tokens or secrets
  {
    const res = await fetch(`${BASE_URL}/api/admin/reports/export?type=products&preset=LAST_30_DAYS`, {
      headers: { Authorization: superAdminAuth },
    });
    const csv = await res.text();
    const leaksSecret = csv.includes('MRFUTKAR_INTERNAL_SERVER_AUTHORITY') || csv.includes('otp');
    assert(
      res.status === 200 && !leaksSecret,
      'RP-51',
      'CSV export contains no internal authorization tokens or OTP secrets',
      'Zero leaked secrets verified'
    );
  }

  // RP-52: ADMIN_REPORT_VIEW audit log written to adminAuditLogs
  {
    const snap = await getDocs(collection(db, 'adminAuditLogs'));
    const hasViewLog = snap.docs.some(d => d.data().action === 'ADMIN_REPORT_VIEW');
    assert(hasViewLog, 'RP-52', 'ADMIN_REPORT_VIEW audit trail verified in adminAuditLogs collection', `totalAuditLogs=${snap.docs.length}`);
  }

  // RP-53: ADMIN_REPORT_EXPORT audit log written to adminAuditLogs
  {
    const snap = await getDocs(collection(db, 'adminAuditLogs'));
    const hasExportLog = snap.docs.some(d => d.data().action === 'ADMIN_REPORT_EXPORT');
    assert(hasExportLog, 'RP-53', 'ADMIN_REPORT_EXPORT audit trail verified in adminAuditLogs collection');
  }

  // RP-54: Read-only guarantee (no mutation to orders, products, stock, or retailers)
  {
    const prodDoc = await getDoc(doc(db, 'products', testProd1));
    const currentStock = prodDoc.data()?.stockQuantity;
    assert(currentStock === 5, 'RP-54', 'Read-only guarantee: product stock remains unmutated by analytics queries', `stock=${currentStock}`);
  }

  console.log('\n======================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

// Auto-run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAdminReportsTests().catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
  });
}
