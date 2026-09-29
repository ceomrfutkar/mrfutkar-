import { doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../server/firebaseAdmin';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc as clientDoc, setDoc as clientSetDoc, updateDoc as clientUpdateDoc, deleteDoc as clientDeleteDoc } from 'firebase/firestore';
import cfg from '../firebase-applet-config.json';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { OPERATIONAL_WAREHOUSE_ID, OPERATIONAL_WAREHOUSE_NAME } from '../server/auth';
import { DeliveryPartner } from '../src/types/delivery';

const BASE_URL = 'http://localhost:3000';

// Client-side Firestore instance to test client security rule boundaries
const clientApp = initializeApp(cfg, 'dp-security-test-' + Date.now());
const clientDb = getFirestore(clientApp, cfg.firestoreDatabaseId || 'ai-studio-remixremixremixr-a3e467fd-b656-46d1-85ee-6d2085ad57fa');

export async function runDeliveryPartnerTests() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 3B-8 DELIVERY PARTNER MANAGEMENT CONSOLE TEST SUITE');
  console.log('======================================================================');

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

  // --- SETUP IDENTITIES & TEST DATA IN FIRESTORE ---
  const now = new Date().toISOString();

  // 1. Super Admin
  await setDoc(doc(db, 'adminUsers', 'SUPER-ADMIN-01'), {
    uid: 'SUPER-ADMIN-01',
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
  });

  // 2. Suspended Admin
  await setDoc(doc(db, 'adminUsers', 'ADMIN-SUSPENDED-DP-01'), {
    uid: 'ADMIN-SUSPENDED-DP-01',
    name: 'Suspended Admin',
    mobile: '+919810099991',
    email: 'suspended.admin@mrfutkar.in',
    role: 'SUPER_ADMIN',
    status: 'SUSPENDED',
    createdAt: now,
    updatedAt: now,
    createdBy: 'SYSTEM_BOOTSTRAP',
    permissionsVersion: 1,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  // 3. Test Retailer
  await setDoc(doc(db, 'retailers', 'ret-test-auth-01'), {
    retailerId: 'ret-test-auth-01',
    mobile: '9811122233',
    ownerName: 'Sunil Kumar',
    shopName: 'Kumar Kirana Store',
    isActive: true,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  // 4. Warehouse Staff User
  await setDoc(doc(db, 'warehouseUsers', 'wh-staff-dp-01'), {
    userId: 'wh-staff-dp-01',
    name: 'Ramesh Warehouse Staff',
    role: 'WAREHOUSE_STAFF',
    warehouseId: OPERATIONAL_WAREHOUSE_ID,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  // 5. Seed Test Delivery Partners
  // Partner A: Active, WH-BRAHMPURI-01
  const partnerA: DeliveryPartner = {
    partnerId: 'DP-TEST-A',
    userId: 'DP-TEST-A',
    name: 'Ravi Kumar (Fleet Alpha)',
    mobile: '9810011122',
    alternateMobile: '9810011123',
    status: 'ACTIVE',
    availabilityStatus: 'AVAILABLE',
    vehicleType: 'TATA_ACE',
    vehicleNumber: 'DL-1L-AA-5555',
    licenseNumber: 'DL-1420110055555',
    assignedWarehouseId: OPERATIONAL_WAREHOUSE_ID,
    assignedWarehouseName: OPERATIONAL_WAREHOUSE_NAME,
    serviceAreas: ['Brahmpuri', 'Karawal Nagar'],
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
  };
  await setDoc(doc(db, 'deliveryPartners', 'DP-TEST-A'), {
    ...partnerA,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  // Partner B: Inactive partner
  const partnerB: DeliveryPartner = {
    partnerId: 'DP-TEST-B',
    userId: 'DP-TEST-B',
    name: 'Vikas Singh (Fleet Beta)',
    mobile: '9810033344',
    status: 'INACTIVE',
    availabilityStatus: 'OFFLINE',
    vehicleType: 'MOTORCYCLE',
    vehicleNumber: 'DL-5S-BB-6666',
    licenseNumber: 'DL-1420150066666',
    assignedWarehouseId: OPERATIONAL_WAREHOUSE_ID,
    assignedWarehouseName: OPERATIONAL_WAREHOUSE_NAME,
    serviceAreas: ['Brahmpuri'],
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'deliveryPartners', 'DP-TEST-B'), {
    ...partnerB,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  // Partner C: Suspended partner
  const partnerC: DeliveryPartner = {
    partnerId: 'DP-TEST-C',
    userId: 'DP-TEST-C',
    name: 'Dinesh Yadav (Fleet Gamma)',
    mobile: '9810077788',
    status: 'SUSPENDED',
    availabilityStatus: 'OFFLINE',
    vehicleType: 'TEMPO',
    vehicleNumber: 'DL-1L-CC-7777',
    licenseNumber: 'DL-1420160077777',
    assignedWarehouseId: OPERATIONAL_WAREHOUSE_ID,
    assignedWarehouseName: OPERATIONAL_WAREHOUSE_NAME,
    serviceAreas: ['Karawal Nagar'],
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'deliveryPartners', 'DP-TEST-C'), {
    ...partnerC,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  // Partner D: Mismatched Warehouse Partner
  const partnerD: any = {
    partnerId: 'DP-TEST-D',
    userId: 'DP-TEST-D',
    name: 'Anil Mehra (Outer Warehouse)',
    mobile: '9810088899',
    status: 'ACTIVE',
    availabilityStatus: 'AVAILABLE',
    vehicleType: 'MOTORCYCLE',
    vehicleNumber: 'DL-1S-DD-8888',
    licenseNumber: 'DL-1420170088888',
    assignedWarehouseId: 'WH-NOIDA-02',
    assignedWarehouseName: 'MR FUTKAR — NOIDA',
    serviceAreas: ['Noida'],
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'deliveryPartners', 'DP-TEST-D'), {
    ...partnerD,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  // Partner E: Partner with an active order (for deactivation/suspension safety testing)
  const partnerE: DeliveryPartner = {
    partnerId: 'DP-TEST-E',
    userId: 'DP-TEST-E',
    name: 'Sanjay Kumar (Active Fleet)',
    mobile: '9810099900',
    status: 'ACTIVE',
    availabilityStatus: 'ON_DELIVERY',
    vehicleType: 'TATA_ACE',
    vehicleNumber: 'DL-1L-EE-9999',
    licenseNumber: 'DL-1420180099999',
    assignedWarehouseId: OPERATIONAL_WAREHOUSE_ID,
    assignedWarehouseName: OPERATIONAL_WAREHOUSE_NAME,
    serviceAreas: ['Brahmpuri'],
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(doc(db, 'deliveryPartners', 'DP-TEST-E'), {
    ...partnerE,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  // Order assigned to Partner E (Active state: OUT_FOR_DELIVERY)
  await setDoc(doc(db, 'orders', 'ORD-DP-TEST-ACTIVE-01'), {
    orderId: 'ORD-DP-TEST-ACTIVE-01',
    orderNumber: 'ORD-DP-TEST-ACTIVE-01',
    retailerId: 'ret-test-auth-01',
    retailerName: 'Kumar Kirana Store',
    shopName: 'Kumar Kirana Store',
    warehouseId: OPERATIONAL_WAREHOUSE_ID,
    grandTotal: 3450,
    paymentMethod: 'COD',
    paymentStatus: 'PENDING',
    orderStatus: 'OUT_FOR_DELIVERY',
    deliveryPartnerId: 'DP-TEST-E',
    deliveryPartnerName: 'Sanjay Kumar (Active Fleet)',
    delivery: {
      assignmentStatus: 'OUT_FOR_DELIVERY',
      assignedPartnerId: 'DP-TEST-E',
      assignedPartnerName: 'Sanjay Kumar (Active Fleet)',
      assignedAt: now,
      outForDeliveryAt: now,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      deliveryOtp: { status: 'PENDING', otpSecret: 'SECRET_SHOULD_BE_HIDDEN', otpHash: 'HASH_SHOULD_BE_HIDDEN' },
    },
    deliveryPayment: {
      method: 'COD',
      amountDue: 3450,
      amountCollected: 0,
      collectionStatus: 'PENDING',
    },
    createdAt: now,
    updatedAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  // Order assigned to Partner A (Delivered state)
  await setDoc(doc(db, 'orders', 'ORD-DP-TEST-DELIVERED-01'), {
    orderId: 'ORD-DP-TEST-DELIVERED-01',
    orderNumber: 'ORD-DP-TEST-DELIVERED-01',
    retailerId: 'ret-test-auth-01',
    retailerName: 'Kumar Kirana Store',
    shopName: 'Kumar Kirana Store',
    warehouseId: OPERATIONAL_WAREHOUSE_ID,
    grandTotal: 2100,
    paymentMethod: 'ONLINE',
    paymentStatus: 'PAID',
    orderStatus: 'DELIVERED',
    deliveryPartnerId: 'DP-TEST-A',
    deliveryPartnerName: 'Ravi Kumar (Fleet Alpha)',
    delivery: {
      assignmentStatus: 'DELIVERED',
      assignedPartnerId: 'DP-TEST-A',
      assignedPartnerName: 'Ravi Kumar (Fleet Alpha)',
      assignedAt: new Date(Date.now() - 3600000).toISOString(),
      pickedUpAt: new Date(Date.now() - 1800000).toISOString(),
      deliveredAt: now,
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
      recipientName: 'Sunil Kumar',
    },
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    deliveredAt: now,
    updatedAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  // Order assigned to Partner A (Failed delivery state)
  await setDoc(doc(db, 'orders', 'ORD-DP-TEST-FAILED-01'), {
    orderId: 'ORD-DP-TEST-FAILED-01',
    orderNumber: 'ORD-DP-TEST-FAILED-01',
    retailerId: 'ret-test-auth-01',
    retailerName: 'Kumar Kirana Store',
    shopName: 'Kumar Kirana Store',
    warehouseId: OPERATIONAL_WAREHOUSE_ID,
    grandTotal: 1500,
    paymentMethod: 'COD',
    paymentStatus: 'PENDING',
    orderStatus: 'FAILED_DELIVERY',
    deliveryPartnerId: 'DP-TEST-A',
    deliveryPartnerName: 'Ravi Kumar (Fleet Alpha)',
    delivery: {
      assignmentStatus: 'FAILED_DELIVERY',
      assignedPartnerId: 'DP-TEST-A',
      assignedPartnerName: 'Ravi Kumar (Fleet Alpha)',
      assignedAt: new Date(Date.now() - 14400000).toISOString(),
      failedAt: new Date(Date.now() - 7200000).toISOString(),
      failureReason: 'SHOP_CLOSED',
      warehouseId: OPERATIONAL_WAREHOUSE_ID,
    },
    createdAt: new Date(Date.now() - 14400000).toISOString(),
    updatedAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  // Order assigned to Partner A (Cancelled order)
  await setDoc(doc(db, 'orders', 'ORD-DP-TEST-CANCELLED-01'), {
    orderId: 'ORD-DP-TEST-CANCELLED-01',
    orderNumber: 'ORD-DP-TEST-CANCELLED-01',
    retailerId: 'ret-test-auth-01',
    warehouseId: OPERATIONAL_WAREHOUSE_ID,
    grandTotal: 1200,
    orderStatus: 'CANCELLED',
    deliveryPartnerId: 'DP-TEST-A',
    delivery: {
      assignmentStatus: 'ASSIGNED',
      assignedPartnerId: 'DP-TEST-A',
    },
    createdAt: new Date(Date.now() - 20000000).toISOString(),
    updatedAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  // Helper for admin requests
  const adminHeaders = {
    Authorization: 'Bearer test-uid-SUPER-ADMIN-01',
    'Content-Type': 'application/json',
  };

  // =========================================================================
  // TEST DP-01: SUPER_ADMIN can list delivery partners
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success === true && Array.isArray(data.partners) && data.partners.length > 0 && Boolean(data.summary),
      'DP-01',
      'SUPER_ADMIN can list delivery partners with summary metrics',
      `HTTP status ${res.status}, total partners=${data.total}, summary=${JSON.stringify(data.summary)}`
    );
  } catch (err: any) {
    assert(false, 'DP-01', 'SUPER_ADMIN failed to list delivery partners', err.message);
  }

  // =========================================================================
  // TEST DP-02: Unauthenticated user rejected
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners`, {
      method: 'GET',
    });
    const data = await res.json();
    assert(
      res.status === 401 && data.error === 'UNAUTHORIZED',
      'DP-02',
      'Unauthenticated user rejected with 401 UNAUTHORIZED',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'DP-02', 'Unauthenticated test failed', err.message);
  }

  // =========================================================================
  // TEST DP-03: Retailer rejected from Admin APIs
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-uid-ret-test-auth-01',
      },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'DP-03',
      'Retailer token blocked from Admin Delivery Partner APIs with 403 FORBIDDEN',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'DP-03', 'Retailer test failed', err.message);
  }

  // =========================================================================
  // TEST DP-04: Warehouse staff rejected from Admin APIs
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-uid-wh-staff-dp-01',
      },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'DP-04',
      'Warehouse staff rejected from Admin Delivery Partner APIs with 403 FORBIDDEN',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'DP-04', 'Warehouse staff test failed', err.message);
  }

  // =========================================================================
  // TEST DP-05: Delivery partner rejected from Admin APIs
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-uid-DP-TEST-A',
      },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'DP-05',
      'Delivery partner token rejected from Admin APIs with 403 FORBIDDEN',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'DP-05', 'Delivery partner test failed', err.message);
  }

  // =========================================================================
  // TEST DP-06: Suspended admin rejected
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-uid-ADMIN-SUSPENDED-DP-01',
      },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'DP-06',
      'Suspended admin rejected with 403 FORBIDDEN',
      `HTTP status ${res.status}, error=${data.error}, message=${data.message}`
    );
  } catch (err: any) {
    assert(false, 'DP-06', 'Suspended admin test failed', err.message);
  }

  // =========================================================================
  // TEST DP-07: Server-side search works
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners?search=Fleet%20Alpha`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const data = await res.json();
    const allMatch = data.partners?.every((p: any) =>
      p.name.toLowerCase().includes('fleet alpha') || p.partnerId.toLowerCase().includes('fleet alpha')
    );
    assert(
      res.status === 200 && data.success === true && data.partners.length > 0 && allMatch,
      'DP-07',
      'Server-side search by name/partnerId returns matched partners',
      `Found ${data.partners.length} matching partner(s)`
    );
  } catch (err: any) {
    assert(false, 'DP-07', 'Server-side search failed', err.message);
  }

  // =========================================================================
  // TEST DP-08: Server-side pagination works
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners?page=1&pageSize=2`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success === true && data.partners.length <= 2 && data.pageSize === 2 && data.page === 1,
      'DP-08',
      'Server-side pagination restricts returned items to pageSize',
      `Returned ${data.partners.length} items with pageSize=2, total=${data.total}`
    );
  } catch (err: any) {
    assert(false, 'DP-08', 'Server-side pagination failed', err.message);
  }

  // =========================================================================
  // TEST DP-09: pageSize > 100 rejected
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners?pageSize=150`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'PAGE_SIZE_EXCEEDED',
      'DP-09',
      'pageSize > 100 rejected with 400 PAGE_SIZE_EXCEEDED validation error',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'DP-09', 'pageSize > 100 test failed', err.message);
  }

  // =========================================================================
  // TEST DP-10: Partner detail works
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners/DP-TEST-A`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success === true && data.partner?.partnerId === 'DP-TEST-A' && Boolean(data.workload) && Boolean(data.historySummary),
      'DP-10',
      'Partner detail returns authoritative profile, workload, and history summary',
      `HTTP status ${res.status}, partnerId=${data.partner?.partnerId}, activeWorkload=${data.workload?.totalActiveCount}`
    );
  } catch (err: any) {
    assert(false, 'DP-10', 'Partner detail test failed', err.message);
  }

  // =========================================================================
  // TEST DP-11: Unknown partner returns 404
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners/NONEXISTENT-PARTNER-999`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const data = await res.json();
    assert(
      res.status === 404 && data.error === 'PARTNER_NOT_FOUND',
      'DP-11',
      'Nonexistent partner returns 404 PARTNER_NOT_FOUND',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'DP-11', 'Nonexistent partner test failed', err.message);
  }

  // =========================================================================
  // TEST DP-12: Partner workload is derived from existing orders
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners/DP-TEST-E`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.workload?.outForDeliveryCount === 1 && data.workload?.totalActiveCount === 1,
      'DP-12',
      'Partner workload is derived directly from existing assigned orders',
      `outForDeliveryCount=${data.workload?.outForDeliveryCount}, totalActiveCount=${data.workload?.totalActiveCount}`
    );
  } catch (err: any) {
    assert(false, 'DP-12', 'Partner workload test failed', err.message);
  }

  // =========================================================================
  // TEST DP-13: Delivered orders are not counted as active workload
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners/DP-TEST-A`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.historySummary?.deliveredCount >= 1 && data.workload?.totalActiveCount === 0,
      'DP-13',
      'Delivered orders are counted in delivery history, NOT in active workload',
      `deliveredCount=${data.historySummary?.deliveredCount}, activeCount=${data.workload?.totalActiveCount}`
    );
  } catch (err: any) {
    assert(false, 'DP-13', 'Delivered orders test failed', err.message);
  }

  // =========================================================================
  // TEST DP-14: Cancelled orders are not counted as active workload
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners/DP-TEST-A`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const data = await res.json();
    const hasCancelledInActive = data.workload?.activeOrders?.some((o: any) => o.orderStatus === 'CANCELLED');
    assert(
      res.status === 200 && !hasCancelledInActive,
      'DP-14',
      'Cancelled orders are excluded from active workload',
      `hasCancelledInActive=${hasCancelledInActive}`
    );
  } catch (err: any) {
    assert(false, 'DP-14', 'Cancelled orders test failed', err.message);
  }

  // =========================================================================
  // TEST DP-15: Failed/returned orders appear correctly
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners/DP-TEST-A`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.historySummary?.failedCount >= 1,
      'DP-15',
      'Failed/returned orders correctly reflected in partner history summary',
      `failedCount=${data.historySummary?.failedCount}`
    );
  } catch (err: any) {
    assert(false, 'DP-15', 'Failed/returned orders test failed', err.message);
  }

  // =========================================================================
  // TEST DP-16: Historical order data remains unchanged
  // =========================================================================
  try {
    const ordSnap = await getDoc(doc(db, 'orders', 'ORD-DP-TEST-DELIVERED-01'));
    const orderData = ordSnap.data();
    assert(
      ordSnap.exists() && orderData?.orderStatus === 'DELIVERED' && orderData?.grandTotal === 2100,
      'DP-16',
      'Historical order record remains immutable and unchanged',
      `status=${orderData?.orderStatus}, grandTotal=${orderData?.grandTotal}`
    );
  } catch (err: any) {
    assert(false, 'DP-16', 'Historical order test failed', err.message);
  }

  // =========================================================================
  // TEST DP-17: Partner warehouse is authoritative
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners/DP-TEST-A`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.partner?.assignedWarehouseId === OPERATIONAL_WAREHOUSE_ID,
      'DP-17',
      'Partner warehouse reflects authoritative stored warehouse ID',
      `assignedWarehouseId=${data.partner?.assignedWarehouseId}`
    );
  } catch (err: any) {
    assert(false, 'DP-17', 'Partner warehouse test failed', err.message);
  }

  // =========================================================================
  // TEST DP-18: Client cannot spoof warehouse
  // =========================================================================
  try {
    // Attempt to assign a partner belonging to WH-NOIDA-02 to an order in WH-BRAHMPURI-01
    const res = await fetch(`${BASE_URL}/api/admin/orders/ORD-DP-TEST-ACTIVE-01/assign-partner`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        partnerId: 'DP-TEST-D', // Belongs to WH-NOIDA-02
        warehouseId: OPERATIONAL_WAREHOUSE_ID, // Spoofed warehouse
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'WAREHOUSE_MISMATCH',
      'DP-18',
      'Client cannot spoof warehouse; server enforces authoritative warehouse isolation',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'DP-18', 'Warehouse spoofing test failed', err.message);
  }

  // =========================================================================
  // TEST DP-19: Client cannot spoof partner identity
  // =========================================================================
  try {
    // Delivery partner DP-TEST-A trying to access other partner by passing spoofed query/header
    const res = await fetch(`${BASE_URL}/api/delivery/profile?partnerId=DP-TEST-E`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-uid-DP-TEST-A',
      },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.partner?.partnerId === 'DP-TEST-A',
      'DP-19',
      'Partner identity derived strictly from server authentication; cannot spoof other partner',
      `Authenticated partnerId=${data.partner?.partnerId}`
    );
  } catch (err: any) {
    assert(false, 'DP-19', 'Partner identity spoofing test failed', err.message);
  }

  // =========================================================================
  // TEST DP-20: Client cannot spoof admin role
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-uid-ret-test-auth-01',
        'X-Role': 'SUPER_ADMIN',
        role: 'SUPER_ADMIN',
      },
    });
    const data = await res.json();
    assert(
      res.status === 403 && data.error === 'FORBIDDEN',
      'DP-20',
      'Client cannot spoof admin role using headers or request attributes',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'DP-20', 'Admin role spoofing test failed', err.message);
  }

  // =========================================================================
  // TEST DP-21: Nonexistent partner assignment is rejected
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/orders/ORD-DP-TEST-ACTIVE-01/assign-partner`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        partnerId: 'NONEXISTENT-PARTNER-888',
      }),
    });
    const data = await res.json();
    assert(
      res.status === 404 && data.error === 'PARTNER_NOT_FOUND',
      'DP-21',
      'Assignment to nonexistent partner is rejected with 404 PARTNER_NOT_FOUND',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'DP-21', 'Nonexistent partner assignment test failed', err.message);
  }

  // =========================================================================
  // TEST DP-22: Inactive partner assignment is rejected
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/orders/ORD-DP-TEST-ACTIVE-01/assign-partner`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        partnerId: 'DP-TEST-B', // Inactive
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'PARTNER_INACTIVE',
      'DP-22',
      'Assignment to inactive partner is rejected with 400 PARTNER_INACTIVE',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'DP-22', 'Inactive partner assignment test failed', err.message);
  }

  // =========================================================================
  // TEST DP-23: Suspended partner assignment is rejected
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/orders/ORD-DP-TEST-ACTIVE-01/assign-partner`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        partnerId: 'DP-TEST-C', // Suspended
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'PARTNER_INACTIVE',
      'DP-23',
      'Assignment to suspended partner is rejected with 400 PARTNER_INACTIVE',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'DP-23', 'Suspended partner assignment test failed', err.message);
  }

  // =========================================================================
  // TEST DP-24: Warehouse-mismatched assignment is rejected
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/orders/ORD-DP-TEST-ACTIVE-01/assign-partner`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        partnerId: 'DP-TEST-D', // Noida warehouse
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'WAREHOUSE_MISMATCH',
      'DP-24',
      'Warehouse-mismatched partner assignment is rejected with 400 WAREHOUSE_MISMATCH',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'DP-24', 'Warehouse-mismatched assignment test failed', err.message);
  }

  // =========================================================================
  // TEST DP-25: Duplicate assignment protection remains intact
  // =========================================================================
  try {
    // Assigning partner E to order ORD-DP-TEST-ACTIVE-01 which is already assigned to E
    const res = await fetch(`${BASE_URL}/api/admin/orders/ORD-DP-TEST-ACTIVE-01/assign-partner`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        partnerId: 'DP-TEST-E',
      }),
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success === true,
      'DP-25',
      'Duplicate assignment to same partner is safely idempotent',
      `HTTP status ${res.status}, partnerId=${data.deliveryPartnerId}`
    );
  } catch (err: any) {
    assert(false, 'DP-25', 'Duplicate assignment test failed', err.message);
  }

  // =========================================================================
  // TEST DP-26: Delivered order cannot be reassigned
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/orders/ORD-DP-TEST-DELIVERED-01/assign-partner`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        partnerId: 'DP-TEST-A',
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'CANNOT_ASSIGN_DELIVERED_ORDER',
      'DP-26',
      'Delivered order cannot be reassigned (400 CANNOT_ASSIGN_DELIVERED_ORDER)',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'DP-26', 'Delivered order assignment test failed', err.message);
  }

  // =========================================================================
  // TEST DP-27: Cancelled order cannot be assigned
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/orders/ORD-DP-TEST-CANCELLED-01/assign-partner`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        partnerId: 'DP-TEST-A',
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'CANNOT_ASSIGN_CANCELLED_ORDER',
      'DP-27',
      'Cancelled order cannot be assigned (400 CANNOT_ASSIGN_CANCELLED_ORDER)',
      `HTTP status ${res.status}, error=${data.error}`
    );
  } catch (err: any) {
    assert(false, 'DP-27', 'Cancelled order assignment test failed', err.message);
  }

  // =========================================================================
  // TEST DP-28: Partner activation is server-authoritative
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners/DP-TEST-B/activate`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ reason: 'Reactivated by Super Admin' }),
    });
    const data = await res.json();
    const updatedSnap = await getDoc(doc(db, 'deliveryPartners', 'DP-TEST-B'));
    assert(
      res.status === 200 && data.success === true && updatedSnap.data()?.status === 'ACTIVE',
      'DP-28',
      'Partner activation is server-authoritative and updates live database',
      `HTTP status ${res.status}, status=${updatedSnap.data()?.status}`
    );
  } catch (err: any) {
    assert(false, 'DP-28', 'Partner activation test failed', err.message);
  }

  // =========================================================================
  // TEST DP-29: Partner deactivation is server-authoritative
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners/DP-TEST-B/deactivate`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ reason: 'Deactivated for maintenance' }),
    });
    const data = await res.json();
    const updatedSnap = await getDoc(doc(db, 'deliveryPartners', 'DP-TEST-B'));
    assert(
      res.status === 200 && data.success === true && updatedSnap.data()?.status === 'INACTIVE',
      'DP-29',
      'Partner deactivation is server-authoritative and updates live database',
      `HTTP status ${res.status}, status=${updatedSnap.data()?.status}`
    );
  } catch (err: any) {
    assert(false, 'DP-29', 'Partner deactivation test failed', err.message);
  }

  // =========================================================================
  // TEST DP-30: Suspension is server-authoritative if supported
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners/DP-TEST-B/suspend`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ reason: 'Suspended for compliance review' }),
    });
    const data = await res.json();
    const updatedSnap = await getDoc(doc(db, 'deliveryPartners', 'DP-TEST-B'));
    assert(
      res.status === 200 && data.success === true && updatedSnap.data()?.status === 'SUSPENDED',
      'DP-30',
      'Partner suspension is server-authoritative and updates live database',
      `HTTP status ${res.status}, status=${updatedSnap.data()?.status}`
    );
  } catch (err: any) {
    assert(false, 'DP-30', 'Partner suspension test failed', err.message);
  }

  // =========================================================================
  // TEST DP-31: Status change is idempotent
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners/DP-TEST-B/suspend`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ reason: 'Suspended repeat call' }),
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success === true && data.isNoOp === true,
      'DP-31',
      'Status change is safely idempotent when partner already holds target status',
      `HTTP status ${res.status}, isNoOp=${data.isNoOp}`
    );
  } catch (err: any) {
    assert(false, 'DP-31', 'Idempotent status change test failed', err.message);
  }

  // =========================================================================
  // TEST DP-32: Active delivery prevents unsafe deactivation/suspension
  // =========================================================================
  try {
    // Partner E has active order ORD-DP-TEST-ACTIVE-01 in OUT_FOR_DELIVERY
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners/DP-TEST-E/deactivate`, {
      method: 'POST',
      headers: adminHeaders,
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'ACTIVE_DELIVERIES_EXIST',
      'DP-32',
      'Active delivery blocks unsafe partner deactivation/suspension with 400 ACTIVE_DELIVERIES_EXIST',
      `HTTP status ${res.status}, error=${data.error}, activeOrdersCount=${data.activeOrdersCount}`
    );
  } catch (err: any) {
    assert(false, 'DP-32', 'Active delivery safety check failed', err.message);
  }

  // =========================================================================
  // TEST DP-33: Partner history is preserved after deactivation
  // =========================================================================
  try {
    // Check partner document still exists and has valid ID and createdAt
    const partnerSnap = await getDoc(doc(db, 'deliveryPartners', 'DP-TEST-B'));
    assert(
      partnerSnap.exists() && partnerSnap.data()?.partnerId === 'DP-TEST-B',
      'DP-33',
      'Partner document and history are fully preserved after deactivation (no deletion)',
      `partnerId=${partnerSnap.data()?.partnerId}`
    );
  } catch (err: any) {
    assert(false, 'DP-33', 'Partner history preservation test failed', err.message);
  }

  // =========================================================================
  // TEST DP-34: Partner history is preserved after suspension
  // =========================================================================
  try {
    const partnerSnap = await getDoc(doc(db, 'deliveryPartners', 'DP-TEST-C'));
    assert(
      partnerSnap.exists() && partnerSnap.data()?.partnerId === 'DP-TEST-C',
      'DP-34',
      'Partner document and history are fully preserved after suspension (no deletion)',
      `partnerId=${partnerSnap.data()?.partnerId}`
    );
  } catch (err: any) {
    assert(false, 'DP-34', 'Suspension history preservation test failed', err.message);
  }

  // =========================================================================
  // TEST DP-35: Raw OTP is never exposed
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners/DP-TEST-E/orders`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const data = await res.json();
    const orderWithOtp = data.orders?.find((o: any) => o.orderId === 'ORD-DP-TEST-ACTIVE-01');
    const leaksOtp = typeof orderWithOtp?.deliveryOtp === 'string' || Boolean(orderWithOtp?.deliveryOtp?.otpSecret);
    assert(
      res.status === 200 && !leaksOtp,
      'DP-35',
      'Raw OTP and OTP secrets are never exposed in Admin Delivery Partner APIs',
      `deliveryOtp=${JSON.stringify(orderWithOtp?.deliveryOtp)}`
    );
  } catch (err: any) {
    assert(false, 'DP-35', 'Raw OTP security test failed', err.message);
  }

  // =========================================================================
  // TEST DP-36: OTP secret is never exposed
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners/DP-TEST-E`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const data = await res.json();
    const activeOrder = data.workload?.activeOrders?.find((o: any) => o.orderId === 'ORD-DP-TEST-ACTIVE-01');
    const leaksSecret = Boolean(activeOrder?.deliveryOtp?.otpSecret) || Boolean(activeOrder?.deliveryOtpHash);
    assert(
      res.status === 200 && !leaksSecret,
      'DP-36',
      'OTP secret and hash are sanitized from partner workload orders',
      `leaksSecret=${leaksSecret}`
    );
  } catch (err: any) {
    assert(false, 'DP-36', 'OTP secret security test failed', err.message);
  }

  // =========================================================================
  // TEST DP-37: POD private data is not exposed
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners/DP-TEST-A/orders`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const data = await res.json();
    const deliveredOrder = data.orders?.find((o: any) => o.orderId === 'ORD-DP-TEST-DELIVERED-01');
    const leaksPodInternalPath = Boolean(deliveredOrder?.proofOfDelivery?.rawInternalPath);
    assert(
      res.status === 200 && !leaksPodInternalPath,
      'DP-37',
      'POD private internal paths/keys are not exposed',
      `leaksPodInternalPath=${leaksPodInternalPath}`
    );
  } catch (err: any) {
    assert(false, 'DP-37', 'POD private data test failed', err.message);
  }

  // =========================================================================
  // TEST DP-38: Admin audit logs are immutable
  // =========================================================================
  try {
    let clientWriteDenied = false;
    try {
      await clientSetDoc(clientDoc(clientDb, 'adminAuditLogs', 'MALICIOUS-CLIENT-AUDIT-DP'), {
        action: 'FAKE_AUDIT',
        adminUid: 'HACKER',
      });
    } catch {
      clientWriteDenied = true;
    }
    assert(
      clientWriteDenied,
      'DP-38',
      'Admin audit logs are immutable; direct client modification is rejected by rules',
      `clientWriteDenied=${clientWriteDenied}`
    );
  } catch (err: any) {
    assert(false, 'DP-38', 'Admin audit logs immutability test failed', err.message);
  }

  // =========================================================================
  // TEST DP-39: Partner status changes create audit records
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/delivery-partners/DP-TEST-B/audit-logs`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const data = await res.json();
    const hasStatusAudit = data.auditLogs?.some((l: any) =>
      ['DELIVERY_PARTNER_ACTIVATED', 'DELIVERY_PARTNER_DEACTIVATED', 'DELIVERY_PARTNER_SUSPENDED'].includes(l.action)
    );
    assert(
      res.status === 200 && hasStatusAudit,
      'DP-39',
      'Partner status changes create immutable audit records in adminAuditLogs',
      `Found audit record for partner DP-TEST-B: ${hasStatusAudit}`
    );
  } catch (err: any) {
    assert(false, 'DP-39', 'Partner status audit test failed', err.message);
  }

  // =========================================================================
  // TEST DP-40: Partner isolation remains intact
  // =========================================================================
  try {
    // Partner A attempting to view orders through delivery API sees only their own
    const res = await fetch(`${BASE_URL}/api/delivery/profile`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-uid-DP-TEST-A',
      },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.partner?.partnerId === 'DP-TEST-A',
      'DP-40',
      'Delivery partner isolation remains intact; partner cannot access other partners via API',
      `Resolved partnerId=${data.partner?.partnerId}`
    );
  } catch (err: any) {
    assert(false, 'DP-40', 'Partner isolation test failed', err.message);
  }

  // =========================================================================
  // TEST DP-41: Existing delivery partner APIs continue working
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/delivery/session`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-uid-DP-TEST-A',
      },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success === true && data.session?.role === 'DELIVERY_PARTNER',
      'DP-41',
      'Existing delivery partner APIs (/api/delivery/session) continue working without regression',
      `HTTP status ${res.status}, role=${data.session?.role}`
    );
  } catch (err: any) {
    assert(false, 'DP-41', 'Existing delivery partner API test failed', err.message);
  }

  // =========================================================================
  // TEST DP-42: Existing order lifecycle continues working
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/orders`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success === true && Array.isArray(data.orders),
      'DP-42',
      'Existing order management endpoints continue working seamlessly',
      `HTTP status ${res.status}, returned orders count=${data.orders?.length}`
    );
  } catch (err: any) {
    assert(false, 'DP-42', 'Existing order lifecycle test failed', err.message);
  }

  // =========================================================================
  // TEST DP-43: Existing warehouse lifecycle continues working
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/warehouse`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success === true && Boolean(data.warehouse?.warehouseId),
      'DP-43',
      'Existing warehouse hub endpoints continue working seamlessly',
      `HTTP status ${res.status}, warehouseId=${data.warehouse?.warehouseId}`
    );
  } catch (err: any) {
    assert(false, 'DP-43', 'Existing warehouse lifecycle test failed', err.message);
  }

  // =========================================================================
  // TEST DP-44: Existing inventory lifecycle continues working
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/admin/inventory`, {
      method: 'GET',
      headers: adminHeaders,
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success === true && typeof data.summary?.totalProducts === 'number',
      'DP-44',
      'Existing inventory lifecycle endpoints continue working seamlessly',
      `HTTP status ${res.status}, totalProducts=${data.summary?.totalProducts}`
    );
  } catch (err: any) {
    assert(false, 'DP-44', 'Existing inventory lifecycle test failed', err.message);
  }

  // =========================================================================
  // TEST DP-45: Existing notification system continues working
  // =========================================================================
  try {
    const res = await fetch(`${BASE_URL}/api/notifications`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer test-uid-ret-test-auth-01',
      },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success === true,
      'DP-45',
      'Existing notification system continues working without regressions',
      `HTTP status ${res.status}, count=${data.notifications?.length}`
    );
  } catch (err: any) {
    assert(false, 'DP-45', 'Existing notification system test failed', err.message);
  }

  // =========================================================================
  // TEST DP-46: No second deliveryPartners collection exists
  // =========================================================================
  {
    const fileContents = fs.readFileSync('server/adminDeliveryPartnerRoutes.ts', 'utf-8');
    const hasDuplicateCollection =
      fileContents.includes("'adminDeliveryPartners'") ||
      fileContents.includes("'deliveryPartnerManagement'") ||
      fileContents.includes("'drivers'") ||
      fileContents.includes("'deliveryDrivers'");
    assert(
      !hasDuplicateCollection && fileContents.includes("'deliveryPartners'"),
      'DP-46',
      'No duplicate delivery partner collection exists; single deliveryPartners collection is reused',
      `hasDuplicateCollection=${hasDuplicateCollection}`
    );
  }

  // =========================================================================
  // TEST DP-47: No second orders collection exists
  // =========================================================================
  {
    const fileContents = fs.readFileSync('server/adminDeliveryPartnerRoutes.ts', 'utf-8');
    const hasDuplicateOrders =
      fileContents.includes("'deliveryOrders'") ||
      fileContents.includes("'driverOrders'") ||
      fileContents.includes("'partnerOrders'");
    assert(
      !hasDuplicateOrders && fileContents.includes("'orders'"),
      'DP-47',
      'No duplicate orders collection exists; single orders collection is reused',
      `hasDuplicateOrders=${hasDuplicateOrders}`
    );
  }

  // =========================================================================
  // TEST DP-48: No live GPS tracking introduced
  // =========================================================================
  {
    const routeContents = fs.readFileSync('server/adminDeliveryPartnerRoutes.ts', 'utf-8');
    const screenContents = fs.readFileSync('src/screens/admin/AdminDeliveryPartnersScreen.tsx', 'utf-8');
    const detailContents = fs.readFileSync('src/screens/admin/AdminDeliveryPartnerDetailScreen.tsx', 'utf-8');
    const allCode = routeContents + screenContents + detailContents;

    const hasGpsTracking =
      allCode.includes('watchPosition') ||
      allCode.includes('geolocation') ||
      allCode.includes('GoogleMap') ||
      allCode.includes('liveLocation');
    assert(
      !hasGpsTracking,
      'DP-48',
      'No live GPS tracking introduced; fixed destination model preserved',
      `hasGpsTracking=${hasGpsTracking}`
    );
  }

  // =========================================================================
  // TEST DP-49: TypeScript passes
  // =========================================================================
  {
    try {
      execSync('npx tsc --noEmit', { stdio: 'pipe' });
      assert(true, 'DP-49', 'TypeScript type check passes with 0 errors');
    } catch (err: any) {
      assert(false, 'DP-49', 'TypeScript check failed', err.stdout?.toString() || err.message);
    }
  }

  // =========================================================================
  // TEST DP-50: Build passes
  // =========================================================================
  {
    try {
      execSync('npm run build', { stdio: 'pipe' });
      assert(true, 'DP-50', 'Production build passes with 0 errors');
    } catch (err: any) {
      assert(false, 'DP-50', 'Production build failed', err.stdout?.toString() || err.message);
    }
  }

  // =========================================================================
  // TEST DP-51: Lint passes
  // =========================================================================
  {
    try {
      execSync('npm run lint', { stdio: 'pipe' });
      assert(true, 'DP-51', 'Linting passes with 0 errors');
    } catch (err: any) {
      assert(false, 'DP-51', 'Linting check failed', err.stdout?.toString() || err.message);
    }
  }

  console.log('======================================================================');
  console.log(`TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

// Run test if called directly
runDeliveryPartnerTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
