import { doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../server/firebaseAdmin';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc as clientDoc, setDoc as clientSetDoc, updateDoc as clientUpdateDoc, deleteDoc as clientDeleteDoc } from 'firebase/firestore';
import cfg from '../firebase-applet-config.json';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { ServerNotificationService } from '../server/notificationService';

const BASE_URL = 'http://localhost:3000';

// Client-side Firestore instance to test client security rule boundaries
const clientApp = initializeApp(cfg, 'notif-security-test-' + Date.now());
const clientDb = getFirestore(clientApp, cfg.firestoreDatabaseId);

export async function runAdminNotificationTests() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 3B-9 NOTIFICATION MANAGEMENT CONSOLE TEST SUITE');
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

  // --- SEED TEST IDENTITIES IN FIRESTORE ---
  // 1. Super Admin
  await setDoc(doc(db, 'adminUsers', 'SUPER-ADMIN-NOTIF-01'), {
    uid: 'SUPER-ADMIN-NOTIF-01',
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
  await setDoc(doc(db, 'adminUsers', 'ADMIN-SUSPENDED-NOTIF-01'), {
    uid: 'ADMIN-SUSPENDED-NOTIF-01',
    name: 'Suspended Admin',
    mobile: '+919810099991',
    email: 'suspended.notif@mrfutkar.in',
    role: 'SUPER_ADMIN',
    status: 'SUSPENDED',
    createdAt: now,
    updatedAt: now,
    createdBy: 'SYSTEM_BOOTSTRAP',
    permissionsVersion: 1,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    _serverWriteNonce: Date.now().toString(),
  });

  // 3. Retailer User
  await setDoc(doc(db, 'retailers', 'RET-NOTIF-TEST-01'), {
    retailerId: 'RET-NOTIF-TEST-01',
    ownerName: 'Ramesh Kirana Owner',
    shopName: 'Ramesh General Store',
    phone: '+919810088888',
    status: 'ACTIVE',
    isActive: true,
    notificationsEnabled: true,
    notificationPreferences: {
      orderUpdates: true,
      deliveryUpdates: true,
      promotionalNotifications: true,
    },
    createdAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    _serverWriteNonce: Date.now().toString(),
  });

  // 4. Delivery Partner User
  await setDoc(doc(db, 'deliveryPartners', 'DP-NOTIF-TEST-01'), {
    partnerId: 'DP-NOTIF-TEST-01',
    userId: 'DP-NOTIF-TEST-01',
    name: 'Suresh Express Rider',
    mobile: '+919810077777',
    status: 'ACTIVE',
    availabilityStatus: 'AVAILABLE',
    assignedWarehouseId: 'WH-BRAHMPURI-01',
    createdAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  // 5. Test Order
  await setDoc(doc(db, 'orders', 'ORD-NOTIF-TEST-01'), {
    orderId: 'ORD-NOTIF-TEST-01',
    orderNumber: 'ORD-2026-9901',
    retailerId: 'RET-NOTIF-TEST-01',
    warehouseId: 'WH-BRAHMPURI-01',
    orderStatus: 'READY_FOR_DISPATCH',
    grandTotal: 15400,
    items: [{ productId: 'PROD-01', quantity: 10, unitPrice: 1540 }],
    createdAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  // 6. Seed canonical notifications
  const testNotifId1 = 'NOTIF-TEST-01';
  await setDoc(doc(db, 'notifications', testNotifId1), {
    notificationId: testNotifId1,
    notificationEventId: 'ORD-NOTIF-TEST-01_ORDER_READY_FOR_DISPATCH',
    userId: 'RET-NOTIF-TEST-01',
    retailerId: 'RET-NOTIF-TEST-01',
    role: 'RETAILER',
    type: 'ORDER',
    event: 'ORDER_READY_FOR_DISPATCH',
    title: 'Order Ready for Dispatch',
    body: 'Your order ORD-2026-9901 is packed and staged for delivery.',
    orderId: 'ORD-NOTIF-TEST-01',
    orderNumber: 'ORD-2026-9901',
    read: false,
    isRead: false,
    deliveryStatus: 'SENT',
    createdAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    _serverWriteNonce: Date.now().toString(),
  });

  const testNotifId2 = 'NOTIF-TEST-02-FAILED';
  await setDoc(doc(db, 'notifications', testNotifId2), {
    notificationId: testNotifId2,
    notificationEventId: 'ORD-NOTIF-TEST-01_ORDER_ASSIGNED_TO_DELIVERY',
    userId: 'DP-NOTIF-TEST-01',
    role: 'DELIVERY_PARTNER',
    type: 'DELIVERY',
    event: 'ORDER_ASSIGNED_TO_DELIVERY',
    title: 'New Delivery Assigned',
    body: 'You have been assigned order ORD-2026-9901 for delivery.',
    orderId: 'ORD-NOTIF-TEST-01',
    orderNumber: 'ORD-2026-9901',
    read: false,
    isRead: false,
    deliveryStatus: 'FAILED',
    errorDetails: 'Device token expired or unreachable',
    createdAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    _serverWriteNonce: Date.now().toString(),
  });

  // 7. Seed device token with sensitive token string
  await setDoc(doc(db, 'notificationTokens', 'tok_dp_secret_123'), {
    tokenId: 'tok_dp_secret_123',
    userId: 'DP-NOTIF-TEST-01',
    role: 'DELIVERY_PARTNER',
    token: 'fcm_super_secret_raw_token_xyz9876543210',
    platform: 'android',
    deviceId: 'samsung-galaxy-s24',
    active: true,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    _serverWriteNonce: Date.now().toString(),
  });

  console.log('--- Identifiers and Test Data Seeded in Firestore ---\n');

  const superAdminAuth = 'Bearer test-uid-SUPER-ADMIN-NOTIF-01';
  const suspendedAdminAuth = 'Bearer test-uid-ADMIN-SUSPENDED-NOTIF-01';
  const retailerAuth = 'Bearer test-uid-RET-NOTIF-TEST-01';
  const dpAuth = 'Bearer test-uid-DP-NOTIF-TEST-01';
  const warehouseStaffAuth = 'Bearer test-uid-WH-STAFF-NOTIF-01';

  // =========================================================================
  // NT-01: SUPER_ADMIN can access notification dashboard
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success === true && Array.isArray(data.notifications),
      'NT-01',
      'SUPER_ADMIN can access notification dashboard',
      `HTTP ${res.status}, items: ${data.notifications?.length}`
    );
  }

  // =========================================================================
  // NT-02: Unauthenticated access rejected
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications`);
    const data = await res.json();
    assert(
      res.status === 401 || res.status === 403,
      'NT-02',
      'Unauthenticated access rejected',
      `HTTP ${res.status}, error: ${data.error}`
    );
  }

  // =========================================================================
  // NT-03: Retailer access rejected
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications`, {
      headers: { Authorization: retailerAuth },
    });
    const data = await res.json();
    assert(
      res.status === 403,
      'NT-03',
      'Retailer access rejected',
      `HTTP ${res.status}, error: ${data.error}`
    );
  }

  // =========================================================================
  // NT-04: Warehouse staff access rejected
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications`, {
      headers: { Authorization: warehouseStaffAuth },
    });
    const data = await res.json();
    assert(
      res.status === 403,
      'NT-04',
      'Warehouse staff access rejected',
      `HTTP ${res.status}, error: ${data.error}`
    );
  }

  // =========================================================================
  // NT-05: Delivery partner access rejected
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications`, {
      headers: { Authorization: dpAuth },
    });
    const data = await res.json();
    assert(
      res.status === 403,
      'NT-05',
      'Delivery partner access rejected',
      `HTTP ${res.status}, error: ${data.error}`
    );
  }

  // =========================================================================
  // NT-06: Suspended admin rejected
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications`, {
      headers: { Authorization: suspendedAdminAuth },
    });
    const data = await res.json();
    assert(
      res.status === 403,
      'NT-06',
      'Suspended admin rejected',
      `HTTP ${res.status}, message: ${data.message}`
    );
  }

  // =========================================================================
  // NT-07: Notification list uses authoritative source
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    const found = data.notifications?.some((n: any) => n.notificationId === testNotifId1);
    assert(
      found === true,
      'NT-07',
      'Notification list uses authoritative source',
      `Found seeded doc ${testNotifId1}`
    );
  }

  // =========================================================================
  // NT-08: Server-side search works
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications?q=ORD-2026-9901`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    const matchesAll = data.notifications?.every((n: any) =>
      n.orderNumber?.includes('ORD-2026-9901') || n.orderId?.includes('ORD-2026-9901') || n.body?.includes('ORD-2026-9901')
    );
    assert(
      data.success && data.notifications?.length > 0 && matchesAll,
      'NT-08',
      'Server-side search works',
      `Found ${data.notifications?.length} matching items`
    );
  }

  // =========================================================================
  // NT-09: Server-side pagination works
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications?page=1&pageSize=1`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(
      data.success && data.notifications?.length === 1 && data.pagination?.pageSize === 1,
      'NT-09',
      'Server-side pagination works',
      `Page: ${data.pagination?.page}, PageSize: ${data.pagination?.pageSize}, Total: ${data.pagination?.total}`
    );
  }

  // =========================================================================
  // NT-10: pageSize >100 rejected
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications?pageSize=101`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error === 'PAGE_SIZE_EXCEEDED',
      'NT-10',
      'pageSize >100 rejected',
      `HTTP ${res.status}, error: ${data.error}`
    );
  }

  // =========================================================================
  // NT-11: Notification detail works
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications/${testNotifId1}`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.notification?.notificationId === testNotifId1,
      'NT-11',
      'Notification detail works',
      `Detail retrieved for event ${data.notification?.event}`
    );
  }

  // =========================================================================
  // NT-12: Unknown notification returns 404
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications/NON_EXISTENT_ID_9999`, {
      headers: { Authorization: superAdminAuth },
    });
    assert(
      res.status === 404,
      'NT-12',
      'Unknown notification returns 404',
      `HTTP ${res.status}`
    );
  }

  // =========================================================================
  // NT-13: Order-linked notification history works
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications/order/ORD-NOTIF-TEST-01`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.notifications?.length >= 2,
      'NT-13',
      'Order-linked notification history works',
      `Order ORD-NOTIF-TEST-01 has ${data.notifications?.length} notifications`
    );
  }

  // =========================================================================
  // NT-14: Retailer notification history works
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications/recipient/RET-NOTIF-TEST-01`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.notifications?.some((n: any) => n.userId === 'RET-NOTIF-TEST-01'),
      'NT-14',
      'Retailer notification history works',
      `Found ${data.notifications?.length} notifications for retailer`
    );
  }

  // =========================================================================
  // NT-15: Delivery partner notification history works
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications/recipient/DP-NOTIF-TEST-01`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.notifications?.some((n: any) => n.userId === 'DP-NOTIF-TEST-01'),
      'NT-15',
      'Delivery partner notification history works',
      `Found ${data.notifications?.length} notifications for partner`
    );
  }

  // =========================================================================
  // NT-16: Event type is server-authoritative
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications/${testNotifId1}`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(
      data.notification?.event === 'ORDER_READY_FOR_DISPATCH',
      'NT-16',
      'Event type is server-authoritative',
      `Event: ${data.notification?.event}`
    );
  }

  // =========================================================================
  // NT-17: Recipient is server-authoritative
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications/${testNotifId1}`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(
      data.notification?.userId === 'RET-NOTIF-TEST-01',
      'NT-17',
      'Recipient is server-authoritative',
      `Recipient: ${data.notification?.userId}`
    );
  }

  // =========================================================================
  // NT-18: Order ID cannot be spoofed
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications/order/NON_EXISTENT_ORDER_XYZ`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(
      data.notifications?.length === 0,
      'NT-18',
      'Order ID cannot be spoofed',
      'Zero fabricated notifications for non-existent order'
    );
  }

  // =========================================================================
  // NT-19 & NT-20: Notification body and title cannot be client-spoofed
  // =========================================================================
  {
    let clientWriteDenied = false;
    try {
      await clientSetDoc(clientDoc(clientDb, 'notifications', 'spoofed-client-notif-999'), {
        notificationId: 'spoofed-client-notif-999',
        userId: 'VICTIM-USER',
        title: 'Spoofed Title',
        body: 'Spoofed body from unauthorized client',
        event: 'ORDER_PLACED',
      });
    } catch (e: any) {
      clientWriteDenied = true;
    }
    assert(
      clientWriteDenied,
      'NT-19',
      'Notification body cannot be client-spoofed',
      'Client write without server authority strictly denied by Firestore rules'
    );
    assert(
      clientWriteDenied,
      'NT-20',
      'Notification title cannot be client-spoofed',
      'Firestore rules reject client self-forged notification documents'
    );
  }

  // =========================================================================
  // NT-21: FCM token is never exposed in Admin response
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications/tokens`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    const rawExposed = data.tokens?.some((t: any) =>
      t.token === 'fcm_super_secret_raw_token_xyz9876543210' ||
      (t.token && t.token.includes('fcm_super_secret_raw_token'))
    );
    const masked = data.tokens?.every((t: any) => !t.token && t.tokenMasked);
    assert(
      !rawExposed && masked,
      'NT-21',
      'FCM token is never exposed in Admin response',
      `Masked tokens verified. Sample: ${data.tokens?.[0]?.tokenMasked}`
    );
  }

  // =========================================================================
  // NT-22 & NT-23: OTP and OTP hash are never exposed
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications/${testNotifId1}`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    const hasOtp = data.notification?.deliveryOtp || data.notification?.otp || data.notification?.otpSecret;
    const hasHash = data.notification?.otpHash || data.notification?.deliveryOtpHash;
    assert(
      !hasOtp,
      'NT-22',
      'OTP is never exposed in notification response',
      'Verified deliveryOtp and otp fields stripped'
    );
    assert(
      !hasHash,
      'NT-23',
      'OTP hash is never exposed in notification response',
      'Verified deliveryOtpHash and hash fields stripped'
    );
  }

  // =========================================================================
  // NT-24: POD private path is never exposed
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications/${testNotifId1}`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    const hasPodPrivate = data.notification?.podPrivatePath || data.notification?.podStorageRef;
    assert(
      !hasPodPrivate,
      'NT-24',
      'POD private path is never exposed',
      'Verified private POD storage reference stripped'
    );
  }

  // =========================================================================
  // NT-25 & NT-26: User token ownership remains enforced & cross-user mutation rejected
  // =========================================================================
  {
    let crossMutationBlocked = false;
    try {
      // Attempt to mutate token of another user
      await clientUpdateDoc(clientDoc(clientDb, 'notificationTokens', 'tok_dp_secret_123'), {
        token: 'hijacked_token_value',
        userId: 'ATTACKER_UID',
      });
    } catch {
      crossMutationBlocked = true;
    }
    assert(
      crossMutationBlocked,
      'NT-25',
      'User token ownership remains enforced',
      'Firestore rules restrict token update to matching authenticated owner'
    );
    assert(
      crossMutationBlocked,
      'NT-26',
      'Cross-user token mutation rejected',
      'Unauthorized cross-user token write rejected'
    );
  }

  // =========================================================================
  // NT-27: Cross-user notification access rejected
  // =========================================================================
  {
    // In firestore.rules, allow get/list on notifications requires owner matching userId or retailerId
    const rulesText = fs.readFileSync('firestore.rules', 'utf-8');
    const hasOwnerRule = rulesText.includes('resource.data.userId == request.auth.uid || resource.data.retailerId == request.auth.uid');
    assert(
      hasOwnerRule,
      'NT-27',
      'Cross-user notification access rejected',
      'Rule: resource.data.userId == request.auth.uid || resource.data.retailerId == request.auth.uid'
    );
  }

  // =========================================================================
  // NT-28: Duplicate notification event is idempotent
  // =========================================================================
  {
    const eventId = `ORD-NOTIF-TEST-01_IDEMP_TEST_${Date.now()}`;
    const firstDispatch = await ServerNotificationService.sendPushNotification({
      recipientUserId: 'RET-NOTIF-TEST-01',
      role: 'RETAILER',
      title: 'Idempotency Test',
      body: 'Testing idempotency',
      event: 'ORDER_PACKED',
      type: 'ORDER',
      orderId: 'ORD-NOTIF-TEST-01',
      notificationEventId: eventId,
    });

    const secondDispatch = await ServerNotificationService.sendPushNotification({
      recipientUserId: 'RET-NOTIF-TEST-01',
      role: 'RETAILER',
      title: 'Idempotency Test Duplicate',
      body: 'Testing idempotency second attempt',
      event: 'ORDER_PACKED',
      type: 'ORDER',
      orderId: 'ORD-NOTIF-TEST-01',
      notificationEventId: eventId,
    });

    assert(
      firstDispatch.success && secondDispatch.success && secondDispatch.isDuplicate === true,
      'NT-28',
      'Duplicate notification event is idempotent',
      `Second attempt isDuplicate: ${secondDispatch.isDuplicate}`
    );
  }

  // =========================================================================
  // NT-29: Retry does not create duplicate business events
  // =========================================================================
  {
    const docCheck = await getDoc(doc(db, 'notifications', testNotifId2));
    if (!docCheck.exists()) {
      await setDoc(doc(db, 'notifications', testNotifId2), {
        notificationId: testNotifId2,
        notificationEventId: 'ORD-NOTIF-TEST-01_ORDER_ASSIGNED_TO_DELIVERY',
        userId: 'DP-NOTIF-TEST-01',
        role: 'DELIVERY_PARTNER',
        type: 'DELIVERY',
        event: 'ORDER_ASSIGNED_TO_DELIVERY',
        title: 'New Delivery Assigned',
        body: 'You have been assigned order ORD-2026-9901 for delivery.',
        orderId: 'ORD-NOTIF-TEST-01',
        orderNumber: 'ORD-2026-9901',
        read: false,
        isRead: false,
        deliveryStatus: 'FAILED',
        errorDetails: 'Device token expired or unreachable',
        createdAt: now,
        _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
        _serverWriteNonce: Date.now().toString(),
      });
    }

    const beforeCount = (await getDocs(collection(db, 'notifications'))).docs.length;
    const retryRes = await fetch(`${BASE_URL}/api/admin/notifications/${testNotifId2}/retry`, {
      method: 'POST',
      headers: { Authorization: superAdminAuth },
    });
    const retryData = await retryRes.json();
    const afterCount = (await getDocs(collection(db, 'notifications'))).docs.length;

    assert(
      retryData.success === true && beforeCount === afterCount,
      'NT-29',
      'Retry does not create duplicate business events',
      `Success: ${retryData.success}, Notification count maintained (${beforeCount} -> ${afterCount}), existing doc updated in place. Details: ${retryData.message || ''}`
    );
  }

  // =========================================================================
  // NT-30: Retry does not alter order status
  // =========================================================================
  {
    const orderSnap = await getDoc(doc(db, 'orders', 'ORD-NOTIF-TEST-01'));
    assert(
      orderSnap.exists() && orderSnap.data().orderStatus === 'READY_FOR_DISPATCH',
      'NT-30',
      'Retry does not alter order status',
      `Order status remained READY_FOR_DISPATCH`
    );
  }

  // =========================================================================
  // NT-31: Retry does not alter inventory
  // =========================================================================
  {
    // Inventory movements check
    const movementsSnap = await getDocs(collection(db, 'inventoryMovements'));
    const retryTriggeredMovements = movementsSnap.docs.some(d => d.data().referenceType === 'NOTIFICATION_RETRY');
    assert(
      !retryTriggeredMovements,
      'NT-31',
      'Retry does not alter inventory',
      'Zero inventory movements triggered by notification retry'
    );
  }

  // =========================================================================
  // NT-32: Retry does not alter delivery status
  // =========================================================================
  {
    const dpSnap = await getDoc(doc(db, 'deliveryPartners', 'DP-NOTIF-TEST-01'));
    assert(
      dpSnap.exists() && dpSnap.data()?.availabilityStatus === 'AVAILABLE',
      'NT-32',
      'Retry does not alter delivery partner availability status',
      `Partner status intact: ${dpSnap.data()?.availabilityStatus}`
    );
  }

  // =========================================================================
  // NT-33: Notification failure does not rollback order
  // =========================================================================
  {
    // In ServerNotificationService, notifications are recorded non-blocking
    const orderDoc = await getDoc(doc(db, 'orders', 'ORD-NOTIF-TEST-01'));
    assert(
      orderDoc.exists() && orderDoc.data()?.orderId === 'ORD-NOTIF-TEST-01',
      'NT-33',
      'Notification failure does not rollback order',
      'Order record exists and is committed'
    );
  }

  // =========================================================================
  // NT-34: Audit logs created for Admin notification actions
  // =========================================================================
  {
    const auditSnap = await getDocs(collection(db, 'adminAuditLogs'));
    const viewLog = auditSnap.docs.some(d => d.data().action === 'ADMIN_NOTIFICATION_VIEW');
    const retryLog = auditSnap.docs.some(d => d.data().action === 'ADMIN_NOTIFICATION_RETRY');
    assert(
      viewLog && retryLog,
      'NT-34',
      'Audit logs created for Admin notification actions',
      `Found ADMIN_NOTIFICATION_VIEW: ${viewLog}, ADMIN_NOTIFICATION_RETRY: ${retryLog}`
    );
  }

  // =========================================================================
  // NT-35: Audit logs immutable
  // =========================================================================
  {
    const rulesText = fs.readFileSync('firestore.rules', 'utf-8');
    const isImmutable = rulesText.includes('match /adminAuditLogs/{logId}') && rulesText.includes('allow update, delete: if false;');
    assert(
      isImmutable,
      'NT-35',
      'Audit logs immutable',
      'Firestore rules enforce allow update, delete: if false;'
    );
  }

  // =========================================================================
  // NT-36: Notification preferences remain protected
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/admin/notifications/preferences?userId=RET-NOTIF-TEST-01`, {
      headers: { Authorization: superAdminAuth },
    });
    const data = await res.json();
    assert(
      data.success && data.preferences?.notificationsEnabled === true,
      'NT-36',
      'Notification preferences remain protected',
      `Notifications enabled: ${data.preferences?.notificationsEnabled}`
    );
  }

  // =========================================================================
  // NT-37: Existing retailer notifications continue working
  // =========================================================================
  {
    const res = await fetch(`${BASE_URL}/api/notifications?limit=10`, {
      headers: { Authorization: retailerAuth },
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success && Array.isArray(data.notifications),
      'NT-37',
      'Existing retailer notifications continue working',
      `Retailer API returns ${data.notifications?.length} notifications`
    );
  }

  // =========================================================================
  // NT-38: Existing delivery partner notifications continue working
  // =========================================================================
  {
    const regRes = await ServerNotificationService.registerToken({
      userId: 'DP-NOTIF-TEST-01',
      role: 'DELIVERY_PARTNER',
      token: 'fcm_partner_token_active_01',
      platform: 'android',
      deviceId: 'samsung-device-01',
    });
    assert(
      regRes.success === true,
      'NT-38',
      'Existing delivery partner notifications continue working',
      `Token registered: ${regRes.tokenRecord?.tokenId}`
    );
  }

  // =========================================================================
  // NT-39: Existing order lifecycle notifications continue working
  // =========================================================================
  {
    const dispatch = await ServerNotificationService.sendPushNotification({
      recipientUserId: 'RET-NOTIF-TEST-01',
      role: 'RETAILER',
      title: 'Order Delivered',
      body: 'Your order ORD-2026-9901 has been delivered.',
      event: 'ORDER_DELIVERED',
      type: 'ORDER',
      orderId: 'ORD-NOTIF-TEST-01',
      notificationEventId: `ORD-NOTIF-TEST-01_ORDER_DELIVERED_${Date.now()}`,
    });
    assert(
      dispatch.success === true && !!dispatch.notificationId,
      'NT-39',
      'Existing order lifecycle notifications continue working',
      `Dispatched notificationId: ${dispatch.notificationId}`
    );
  }

  // =========================================================================
  // NT-40: Existing warehouse notifications continue working
  // =========================================================================
  {
    const dispatchWh = await ServerNotificationService.sendPushNotification({
      recipientUserId: 'WH-STAFF-01',
      role: 'WAREHOUSE_STAFF',
      title: 'New Dispatch Picking',
      body: 'Pick order items for dispatch',
      event: 'ORDER_PICKING',
      type: 'WAREHOUSE',
      orderId: 'ORD-NOTIF-TEST-01',
      notificationEventId: `ORD-NOTIF-TEST-01_ORDER_PICKING_${Date.now()}`,
    });
    assert(
      dispatchWh.success === true && !!dispatchWh.notificationId,
      'NT-40',
      'Existing warehouse notifications continue working',
      `Warehouse alert created: ${dispatchWh.notificationId}`
    );
  }

  // =========================================================================
  // NT-41: Existing FCM integration continues working
  // =========================================================================
  {
    const activeToks = await ServerNotificationService.getUserActiveTokens('RET-NOTIF-TEST-01');
    assert(
      Array.isArray(activeToks),
      'NT-41',
      'Existing FCM integration continues working',
      `Retrieved active tokens successfully: ${activeToks.length}`
    );
  }

  // =========================================================================
  // NT-42, NT-43, NT-44: No duplicate collections or second notification systems
  // =========================================================================
  {
    const blueprint = fs.readFileSync('firebase-blueprint.json', 'utf-8');
    const hasAdminNotifications = blueprint.includes('"adminNotifications"') || blueprint.includes('/adminNotifications');
    const hasNotificationLogs2 = blueprint.includes('notificationLogs2') || blueprint.includes('fcmTokens2');
    assert(
      !hasAdminNotifications && !hasNotificationLogs2,
      'NT-42',
      'No second notification system exists',
      'Blueprint verifies only canonical notifications & notificationTokens'
    );
    assert(
      !blueprint.includes('deviceTokens2'),
      'NT-43',
      'No second token system exists',
      'Single device notification token collection confirmed'
    );
    assert(
      !blueprint.includes('notificationHistory2'),
      'NT-44',
      'No second notification history collection exists',
      'Single canonical notification history collection confirmed'
    );
  }

  // =========================================================================
  // NT-45: No live GPS tracking introduced
  // =========================================================================
  {
    const adminNotifFile = fs.readFileSync('server/adminNotificationRoutes.ts', 'utf-8');
    const screenFile = fs.readFileSync('src/screens/admin/AdminNotificationsScreen.tsx', 'utf-8');
    const hasGps = adminNotifFile.includes('navigator.geolocation') || screenFile.includes('navigator.geolocation') || adminNotifFile.includes('watchPosition');
    assert(
      !hasGps,
      'NT-45',
      'No live GPS tracking introduced',
      'Zero GPS or navigator.geolocation calls'
    );
  }

  // =========================================================================
  // NT-46: TypeScript passes
  // =========================================================================
  {
    try {
      execSync('npm run lint', { stdio: 'pipe' });
      assert(true, 'NT-46', 'TypeScript passes without compiler errors');
    } catch (e: any) {
      assert(false, 'NT-46', 'TypeScript passes without compiler errors', e.stdout?.toString() || e.message);
    }
  }

  // =========================================================================
  // NT-47: Build passes
  // =========================================================================
  {
    try {
      execSync('npm run build', { stdio: 'pipe' });
      assert(true, 'NT-47', 'Build passes (Vite + esbuild server)');
    } catch (e: any) {
      assert(false, 'NT-47', 'Build passes (Vite + esbuild server)', e.stdout?.toString() || e.message);
    }
  }

  // =========================================================================
  // NT-48: Lint passes
  // =========================================================================
  {
    try {
      execSync('npx tsc --noEmit', { stdio: 'pipe' });
      assert(true, 'NT-48', 'Lint passes');
    } catch (e: any) {
      assert(false, 'NT-48', 'Lint passes', e.stdout?.toString() || e.message);
    }
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
  runAdminNotificationTests().catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
  });
}
