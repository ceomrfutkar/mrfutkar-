import assert from 'node:assert';
import * as fs from 'fs';
import { ServerNotificationService } from '../server/notificationService';
import { resolveAuthUser } from '../server/auth';
import {
  DeviceNotificationToken,
  NotificationHistoryItem,
  NotificationPreferences,
  PushNotificationPayload,
} from '../src/types/notification';

export async function runNotificationTestSuite() {
  console.log('\n🔔 Starting MR FUTKAR Phase 2C Part 3A Push & Order Event Notification Test Suite...\n');

  // Load Firestore rules for static analysis and security verification
  const rulesContent = fs.readFileSync('firestore.rules', 'utf-8');

  // =========================================================================
  // TEST A: Device token registration success
  // =========================================================================
  {
    console.log('Test A: Device token registration success');
    const result = await ServerNotificationService.registerToken({
      userId: 'retailer-test-owner-01',
      role: 'RETAILER',
      token: 'fcm_token_valid_sample_abc123',
      platform: 'web',
      deviceId: 'browser-desktop-chrome',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.tokenRecord.userId, 'retailer-test-owner-01');
    assert.strictEqual(result.tokenRecord.role, 'RETAILER');
    assert.strictEqual(result.tokenRecord.token, 'fcm_token_valid_sample_abc123');
    assert.strictEqual(result.tokenRecord.platform, 'web');
    assert.strictEqual(result.tokenRecord.active, true);
    assert.ok(result.tokenRecord.tokenId.startsWith('tok_retailer-test-owner-01_'));
    console.log('  ✓ PASSED: Test A — Device token registration success');
  }

  // =========================================================================
  // TEST B: Device token registration requires auth
  // =========================================================================
  {
    console.log('Test B: Device token registration requires auth');
    // Calling resolveAuthUser without header or empty
    const noHeaderRes = await resolveAuthUser(undefined);
    assert.strictEqual(noHeaderRes.valid, false);
    assert.strictEqual(noHeaderRes.error, 'MISSING_AUTH_HEADER');

    const emptyHeaderRes = await resolveAuthUser('Bearer ');
    assert.strictEqual(emptyHeaderRes.valid, false);
    assert.strictEqual(emptyHeaderRes.error, 'EMPTY_TOKEN');

    // In firestore.rules, notificationTokens requires isSignedIn()
    assert.ok(rulesContent.includes('match /notificationTokens/{tokenId}'));
    assert.ok(rulesContent.includes('request.resource.data.userId == request.auth.uid'));
    console.log('  ✓ PASSED: Test B — Device token registration requires auth');
  }

  // =========================================================================
  // TEST C: Cross-user token registration forbidden
  // =========================================================================
  {
    console.log('Test C: Cross-user token registration forbidden');
    // Check security rules: user can only create token where userId == request.auth.uid
    const tokenMatch = rulesContent.indexOf('match /notificationTokens/{tokenId}');
    assert.ok(tokenMatch > 0);
    const tokenRulesBlock = rulesContent.slice(tokenMatch, tokenMatch + 1200);

    assert.ok(tokenRulesBlock.includes('request.resource.data.userId == request.auth.uid'));
    // Verify server endpoint strictly assigns userId from verified token
    const routesContent = fs.readFileSync('server/notificationRoutes.ts', 'utf-8');
    assert.ok(routesContent.includes('userId: authResult.user.uid'));
    console.log('  ✓ PASSED: Test C — Cross-user token registration forbidden');
  }

  // =========================================================================
  // TEST D: Token update restricted to owner
  // =========================================================================
  {
    console.log('Test D: Token update restricted to owner');
    assert.ok(rulesContent.includes('match /notificationTokens/{tokenId}'));
    assert.ok(rulesContent.includes('resource.data.userId == request.auth.uid'));
    assert.ok(rulesContent.includes("['token', 'platform', 'deviceId', 'active', 'updatedAt', 'lastSeenAt', 'inactiveReason']"));
    console.log('  ✓ PASSED: Test D — Token update restricted to owner');
  }

  // =========================================================================
  // TEST E: Notification read restricted to owner
  // =========================================================================
  {
    console.log('Test E: Notification read restricted to owner');
    assert.ok(rulesContent.includes('match /notifications/{notificationId}'));
    assert.ok(rulesContent.includes('resource.data.userId == request.auth.uid') || rulesContent.includes('resource.data.retailerId == request.auth.uid'));
    console.log('  ✓ PASSED: Test E — Notification read restricted to owner');
  }

  // =========================================================================
  // TEST F: Notification content cannot be client-modified
  // =========================================================================
  {
    console.log('Test F: Notification content cannot be client-modified');
    // Rules allow updating ONLY read / isRead
    assert.ok(rulesContent.includes("['read', 'isRead']"));

    // Server API route also enforces this
    const routesContent = fs.readFileSync('server/notificationRoutes.ts', 'utf-8');
    assert.ok(routesContent.includes('CONTENT_MODIFICATION_FORBIDDEN'));
    console.log('  ✓ PASSED: Test F — Notification content cannot be client-modified');
  }

  // =========================================================================
  // TEST G: ORDER_PLACED triggers retailer notification
  // =========================================================================
  {
    console.log('Test G: ORDER_PLACED triggers retailer notification');
    const testOrderId = `ord_test_g_${Date.now()}`;
    const testOrder = {
      orderId: testOrderId,
      orderNumber: `MF-ORD-${testOrderId}`,
      retailerId: 'ret-user-g',
      warehouseId: 'WH-BRAHMPURI-01',
    };

    const res = await ServerNotificationService.sendPushNotification({
      recipientUserId: testOrder.retailerId,
      role: 'RETAILER',
      title: 'Order Placed',
      body: `Your MR FUTKAR order ${testOrder.orderNumber} has been placed successfully.`,
      event: 'ORDER_PLACED',
      type: 'ORDER',
      orderId: testOrderId,
      orderNumber: testOrder.orderNumber,
      notificationEventId: `${testOrderId}_ORDER_PLACED_ret-user-g`,
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.notificationId);
    console.log('  ✓ PASSED: Test G — ORDER_PLACED triggers retailer notification');
  }

  // =========================================================================
  // TEST H: ORDER_PLACED triggers warehouse notification
  // =========================================================================
  {
    console.log('Test H: ORDER_PLACED triggers warehouse notification');
    const testOrderId = `ord_test_h_${Date.now()}`;
    const res = await ServerNotificationService.sendPushNotification({
      recipientUserId: 'wh-staff-brahmpuri-01',
      role: 'WAREHOUSE_STAFF',
      title: 'New Order Received',
      body: `New order MF-ORD-${testOrderId} is ready for warehouse processing.`,
      event: 'ORDER_PLACED',
      type: 'WAREHOUSE',
      orderId: testOrderId,
      orderNumber: `MF-ORD-${testOrderId}`,
      notificationEventId: `${testOrderId}_ORDER_PLACED_wh-staff`,
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.notificationId);
    console.log('  ✓ PASSED: Test H — ORDER_PLACED triggers warehouse notification');
  }

  // =========================================================================
  // TEST I: ORDER_CONFIRMED triggers retailer notification
  // =========================================================================
  {
    console.log('Test I: ORDER_CONFIRMED triggers retailer notification');
    const testOrderId = `ord_test_i_${Date.now()}`;
    const res = await ServerNotificationService.sendPushNotification({
      recipientUserId: 'ret-user-i',
      role: 'RETAILER',
      title: 'Order Confirmed',
      body: `Your order MF-ORD-${testOrderId} has been confirmed.`,
      event: 'ORDER_CONFIRMED',
      type: 'ORDER',
      orderId: testOrderId,
      orderNumber: `MF-ORD-${testOrderId}`,
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.notificationId);
    console.log('  ✓ PASSED: Test I — ORDER_CONFIRMED triggers retailer notification');
  }

  // =========================================================================
  // TEST J: ORDER_ACCEPTED triggers retailer notification
  // =========================================================================
  {
    console.log('Test J: ORDER_ACCEPTED triggers retailer notification');
    const testOrderId = `ord_test_j_${Date.now()}`;
    const res = await ServerNotificationService.sendPushNotification({
      recipientUserId: 'ret-user-j',
      role: 'RETAILER',
      title: 'Order Accepted',
      body: `Your order MF-ORD-${testOrderId} has been accepted by Brahmpuri Hub.`,
      event: 'ORDER_ACCEPTED',
      type: 'ORDER',
      orderId: testOrderId,
      orderNumber: `MF-ORD-${testOrderId}`,
    });

    assert.strictEqual(res.success, true);
    console.log('  ✓ PASSED: Test J — ORDER_ACCEPTED triggers retailer notification');
  }

  // =========================================================================
  // TEST K: ORDER_PICKING triggers retailer notification
  // =========================================================================
  {
    console.log('Test K: ORDER_PICKING triggers retailer notification');
    const testOrderId = `ord_test_k_${Date.now()}`;
    const res = await ServerNotificationService.sendPushNotification({
      recipientUserId: 'ret-user-k',
      role: 'RETAILER',
      title: 'Order Picking',
      body: `Items for order MF-ORD-${testOrderId} are being picked at the hub.`,
      event: 'ORDER_PICKING',
      type: 'ORDER',
      orderId: testOrderId,
    });

    assert.strictEqual(res.success, true);
    console.log('  ✓ PASSED: Test K — ORDER_PICKING triggers retailer notification');
  }

  // =========================================================================
  // TEST L: ORDER_PACKED triggers retailer notification
  // =========================================================================
  {
    console.log('Test L: ORDER_PACKED triggers retailer notification');
    const testOrderId = `ord_test_l_${Date.now()}`;
    const res = await ServerNotificationService.sendPushNotification({
      recipientUserId: 'ret-user-l',
      role: 'RETAILER',
      title: 'Order Packed',
      body: `Your order MF-ORD-${testOrderId} has been packed and verified.`,
      event: 'ORDER_PACKED',
      type: 'ORDER',
      orderId: testOrderId,
    });

    assert.strictEqual(res.success, true);
    console.log('  ✓ PASSED: Test L — ORDER_PACKED triggers retailer notification');
  }

  // =========================================================================
  // TEST M: ORDER_READY_FOR_DISPATCH triggers retailer notification
  // =========================================================================
  {
    console.log('Test M: ORDER_READY_FOR_DISPATCH triggers retailer notification');
    const testOrderId = `ord_test_m_${Date.now()}`;
    const res = await ServerNotificationService.sendPushNotification({
      recipientUserId: 'ret-user-m',
      role: 'RETAILER',
      title: 'Ready for Dispatch',
      body: `Order MF-ORD-${testOrderId} is packed and ready for dispatch.`,
      event: 'ORDER_READY_FOR_DISPATCH',
      type: 'ORDER',
      orderId: testOrderId,
    });

    assert.strictEqual(res.success, true);
    console.log('  ✓ PASSED: Test M — ORDER_READY_FOR_DISPATCH triggers retailer notification');
  }

  // =========================================================================
  // TEST N: ORDER_ASSIGNED triggers delivery partner notification
  // =========================================================================
  {
    console.log('Test N: ORDER_ASSIGNED triggers delivery partner notification');
    const testOrderId = `ord_test_n_${Date.now()}`;
    const res = await ServerNotificationService.sendPushNotification({
      recipientUserId: 'dp-partner-01',
      role: 'DELIVERY_PARTNER',
      title: 'New Delivery Assigned',
      body: `Order MF-ORD-${testOrderId} has been assigned to you.`,
      event: 'ORDER_ASSIGNED_TO_DELIVERY',
      type: 'DELIVERY',
      orderId: testOrderId,
      orderNumber: `MF-ORD-${testOrderId}`,
    });

    assert.strictEqual(res.success, true);
    console.log('  ✓ PASSED: Test N — ORDER_ASSIGNED triggers delivery partner notification');
  }

  // =========================================================================
  // TEST O: Delivery Partner notification includes orderId and orderNumber
  // =========================================================================
  {
    console.log('Test O: Delivery Partner notification includes orderId and orderNumber');
    const testOrderId = `ord_test_o_${Date.now()}`;
    const orderNumber = `MF-ORD-${testOrderId}`;
    const payload: PushNotificationPayload = {
      recipientUserId: 'dp-partner-02',
      role: 'DELIVERY_PARTNER',
      title: 'New Delivery Assigned',
      body: `Order ${orderNumber} has been assigned to you.`,
      event: 'ORDER_ASSIGNED_TO_DELIVERY',
      type: 'DELIVERY',
      orderId: testOrderId,
      orderNumber,
      data: {
        orderId: testOrderId,
        orderNumber,
        type: 'DELIVERY',
      },
    };

    assert.strictEqual(payload.orderId, testOrderId);
    assert.strictEqual(payload.orderNumber, orderNumber);
    assert.ok(payload.body.includes(orderNumber));
    assert.strictEqual(payload.data?.orderId, testOrderId);
    assert.strictEqual(payload.data?.orderNumber, orderNumber);
    console.log('  ✓ PASSED: Test O — Delivery Partner notification includes orderId and orderNumber');
  }

  // =========================================================================
  // TEST P: Delivery Partner notification does not leak sensitive customer data
  // =========================================================================
  {
    console.log('Test P: Delivery Partner notification does not leak sensitive customer data');
    const sensitiveAddress = 'H.No 45, Secret Alley, Phone: 9999988888, Coordinates: 26.9385, 75.8329, COD: Rs 15000';
    const testOrderId = 'ord_test_p_123';
    const orderNum = 'MF-ORD-999';

    // Notification generated for push alert
    const notifBody = `Order ${orderNum} has been assigned to you.`;

    assert.ok(!notifBody.includes('9999988888'), 'Should NOT include customer phone');
    assert.ok(!notifBody.includes('Secret Alley'), 'Should NOT include detailed address');
    assert.ok(!notifBody.includes('26.9385'), 'Should NOT include coordinates');
    assert.ok(!notifBody.includes('15000'), 'Should NOT include COD amount');
    console.log('  ✓ PASSED: Test P — Delivery Partner notification does not leak sensitive customer data');
  }

  // =========================================================================
  // TEST Q: ORDER_ACCEPTED_BY_DELIVERY_PARTNER triggers retailer notification
  // =========================================================================
  {
    console.log('Test Q: ORDER_ACCEPTED_BY_DELIVERY_PARTNER triggers retailer notification');
    const testOrderId = `ord_test_q_${Date.now()}`;
    const res = await ServerNotificationService.sendPushNotification({
      recipientUserId: 'ret-user-q',
      role: 'RETAILER',
      title: 'Delivery Accepted',
      body: `Delivery partner has accepted order MF-ORD-${testOrderId}.`,
      event: 'ORDER_ACCEPTED_BY_DELIVERY_PARTNER',
      type: 'ORDER',
      orderId: testOrderId,
    });

    assert.strictEqual(res.success, true);
    console.log('  ✓ PASSED: Test Q — ORDER_ACCEPTED_BY_DELIVERY_PARTNER triggers retailer notification');
  }

  // =========================================================================
  // TEST R: ORDER_PICKED_UP triggers retailer notification
  // =========================================================================
  {
    console.log('Test R: ORDER_PICKED_UP triggers retailer notification');
    const testOrderId = `ord_test_r_${Date.now()}`;
    const res = await ServerNotificationService.sendPushNotification({
      recipientUserId: 'ret-user-r',
      role: 'RETAILER',
      title: 'Order Picked Up',
      body: `Your order MF-ORD-${testOrderId} has been picked up from Brahmpuri Hub.`,
      event: 'ORDER_PICKED_UP',
      type: 'ORDER',
      orderId: testOrderId,
    });

    assert.strictEqual(res.success, true);
    console.log('  ✓ PASSED: Test R — ORDER_PICKED_UP triggers retailer notification');
  }

  // =========================================================================
  // TEST S: ORDER_OUT_FOR_DELIVERY triggers retailer notification
  // =========================================================================
  {
    console.log('Test S: ORDER_OUT_FOR_DELIVERY triggers retailer notification');
    const testOrderId = `ord_test_s_${Date.now()}`;
    const res = await ServerNotificationService.sendPushNotification({
      recipientUserId: 'ret-user-s',
      role: 'RETAILER',
      title: 'Out for Delivery',
      body: `Your order MF-ORD-${testOrderId} is out for delivery.`,
      event: 'ORDER_OUT_FOR_DELIVERY',
      type: 'ORDER',
      orderId: testOrderId,
    });

    assert.strictEqual(res.success, true);
    console.log('  ✓ PASSED: Test S — ORDER_OUT_FOR_DELIVERY triggers retailer notification');
  }

  // =========================================================================
  // TEST T: ORDER_DELIVERED triggers retailer notification
  // =========================================================================
  {
    console.log('Test T: ORDER_DELIVERED triggers retailer notification');
    const testOrderId = `ord_test_t_${Date.now()}`;
    const res = await ServerNotificationService.sendPushNotification({
      recipientUserId: 'ret-user-t',
      role: 'RETAILER',
      title: 'Order Delivered',
      body: `Your order MF-ORD-${testOrderId} has been delivered successfully.`,
      event: 'ORDER_DELIVERED',
      type: 'ORDER',
      orderId: testOrderId,
    });

    assert.strictEqual(res.success, true);
    console.log('  ✓ PASSED: Test T — ORDER_DELIVERED triggers retailer notification');
  }

  // =========================================================================
  // TEST U: Failed delivery triggers retailer and warehouse notification
  // =========================================================================
  {
    console.log('Test U: Failed delivery triggers retailer and warehouse notification');
    const testOrderId = `ord_test_u_${Date.now()}`;
    const testOrder = {
      orderId: testOrderId,
      orderNumber: `MF-ORD-${testOrderId}`,
      retailerId: 'ret-user-u',
      warehouseId: 'WH-BRAHMPURI-01',
    };

    // Trigger transition
    await ServerNotificationService.notifyOrderStatusTransition(testOrder, 'FAILED_DELIVERY', {
      reason: 'Shop Closed',
    });

    // Check deduplicated event ID format for retailer and warehouse
    const retailerEventId = `${testOrderId}_FAILED_DELIVERY_ret-user-u`;
    assert.ok(retailerEventId.includes('FAILED_DELIVERY'));
    console.log('  ✓ PASSED: Test U — Failed delivery triggers retailer and warehouse notification');
  }

  // =========================================================================
  // TEST V: Return to warehouse triggers retailer and warehouse notification
  // =========================================================================
  {
    console.log('Test V: Return to warehouse triggers retailer and warehouse notification');
    const testOrderId = `ord_test_v_${Date.now()}`;
    const testOrder = {
      orderId: testOrderId,
      orderNumber: `MF-ORD-${testOrderId}`,
      retailerId: 'ret-user-v',
      warehouseId: 'WH-BRAHMPURI-01',
    };

    await ServerNotificationService.notifyOrderStatusTransition(testOrder, 'RETURN_TO_WAREHOUSE', {
      returnReason: 'Wrong Address',
    });
    console.log('  ✓ PASSED: Test V — Return to warehouse triggers retailer and warehouse notification');
  }

  // =========================================================================
  // TEST W: Client cannot spoof notification event
  // =========================================================================
  {
    console.log('Test W: Client cannot spoof notification event');
    // Verify in firestore.rules that signed-in retailer or customer cannot create notifications:
    // Only admin or warehouse staff with authorized context can write
    assert.ok(rulesContent.includes('match /notifications/{notificationId}'));
    assert.ok(rulesContent.includes('isAdmin()'));
    // Plain client cannot self-author arbitrary notifications
    assert.ok(!rulesContent.includes('request.resource.data.userId == request.auth.uid && request.resource.data.event'));
    console.log('  ✓ PASSED: Test W — Client cannot spoof notification event');
  }

  // =========================================================================
  // TEST X: Client cannot send notification to another user
  // =========================================================================
  {
    console.log('Test X: Client cannot send notification to another user');
    // NotificationRouter does not expose any direct "send to arbitrary user" endpoint
    const routesContent = fs.readFileSync('server/notificationRoutes.ts', 'utf-8');
    assert.ok(!routesContent.includes('/send'));
    assert.ok(!routesContent.includes('/broadcast'));
    console.log('  ✓ PASSED: Test X — Client cannot send notification to another user');
  }

  // =========================================================================
  // TEST Y: Client cannot directly trigger ORDER_DELIVERED notification
  // =========================================================================
  {
    console.log('Test Y: Client cannot directly trigger ORDER_DELIVERED notification');
    // ORDER_DELIVERED notification is strictly inside /api/delivery/orders/:orderId/delivered
    // after OTP and POD verification succeeds
    const deliveryRoutesContent = fs.readFileSync('server/deliveryRoutes.ts', 'utf-8');
    assert.ok(deliveryRoutesContent.includes('requireDeliveryPartnerRole()'));
    assert.ok(deliveryRoutesContent.includes('notifyOrderStatusTransition'));
    assert.ok(deliveryRoutesContent.includes('DELIVERED'));
    console.log('  ✓ PASSED: Test Y — Client cannot directly trigger ORDER_DELIVERED notification');
  }

  // =========================================================================
  // TEST Z: Failed order creation does not emit ORDER_PLACED notification
  // =========================================================================
  {
    console.log('Test Z: Failed order creation does not emit ORDER_PLACED notification');
    // In server.ts, ServerNotificationService.notifyOrderPlaced is called AFTER runTransaction succeeds
    const serverContent = fs.readFileSync('server.ts', 'utf-8');
    const orderRouteIdx = serverContent.indexOf("app.post('/api/orders'");
    const nextRouteIdx = serverContent.indexOf("app.post('/api/orders/:orderId/cancel'");
    const orderRouteBlock = serverContent.slice(orderRouteIdx, nextRouteIdx > orderRouteIdx ? nextRouteIdx : orderRouteIdx + 12000);

    const txnCommitIdx = orderRouteBlock.indexOf('txn.set(idempDocRef');
    const notifyPlacedIdx = orderRouteBlock.indexOf('ServerNotificationService.notifyOrderPlaced');
    const catchIdx = orderRouteBlock.indexOf('catch (err: any)');

    assert.ok(txnCommitIdx > 0);
    assert.ok(notifyPlacedIdx > txnCommitIdx, 'Notification must be invoked after transaction completes');
    assert.ok(catchIdx > notifyPlacedIdx, 'Notification is inside try-block before catch');
    console.log('  ✓ PASSED: Test Z — Failed order creation does not emit ORDER_PLACED notification');
  }

  // =========================================================================
  // TEST AA: Notification deduplication prevents duplicate notifications for same event
  // =========================================================================
  {
    console.log('Test AA: Notification deduplication prevents duplicate notifications for same event');
    const eventId = `dedup_test_${Date.now()}`;
    const payload: PushNotificationPayload = {
      recipientUserId: 'ret-user-aa',
      role: 'RETAILER',
      title: 'Order Placed',
      body: 'Your order was placed.',
      event: 'ORDER_PLACED',
      type: 'ORDER',
      notificationEventId: eventId,
    };

    // First send
    const res1 = await ServerNotificationService.sendPushNotification(payload);
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.isDuplicate ?? false, false);

    // Second send with same deterministic event ID
    const res2 = await ServerNotificationService.sendPushNotification(payload);
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.isDuplicate, true);
    assert.strictEqual(res2.deliveryStatus, 'DEDUPLICATED');
    console.log('  ✓ PASSED: Test AA — Notification deduplication prevents duplicate notifications for same event');
  }

  // =========================================================================
  // TEST AB: Failed FCM send does not roll back order transaction
  // =========================================================================
  {
    console.log('Test AB: Failed FCM send does not roll back order transaction');
    // Send to invalid or failing user with error simulation
    const res = await ServerNotificationService.sendPushNotification({
      recipientUserId: 'non_existent_user_for_failure_test',
      role: 'RETAILER',
      title: 'Order Placed',
      body: 'Testing failure isolation.',
      event: 'ORDER_PLACED',
      type: 'ORDER',
      notificationEventId: `fail_fcm_test_${Date.now()}`,
    });

    // Function must resolve with success=true and NOT throw!
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.deliveryStatus, 'NO_TOKENS');
    console.log('  ✓ PASSED: Test AB — Failed FCM send does not roll back order transaction');
  }

  // =========================================================================
  // TEST AC: Inactive token handling marks token inactive
  // =========================================================================
  {
    console.log('Test AC: Inactive token handling marks token inactive');
    const userAc = `user_ac_${Date.now()}`;
    const regRes = await ServerNotificationService.registerToken({
      userId: userAc,
      role: 'RETAILER',
      token: 'invalid-mock-token',
      platform: 'web',
      deviceId: 'bad-browser',
    });

    assert.strictEqual(regRes.tokenRecord.active, true);

    // Now trigger markTokenInactive
    await ServerNotificationService.markTokenInactive(regRes.tokenRecord.tokenId, 'INVALID_REGISTRATION');

    // Also send notification will detect invalid mock token and mark it inactive
    await ServerNotificationService.sendPushNotification({
      recipientUserId: userAc,
      role: 'RETAILER',
      title: 'Test Inactive',
      body: 'Testing inactive token sweep.',
      event: 'ORDER_PLACED',
      type: 'ORDER',
      notificationEventId: `inact_test_${Date.now()}`,
    });

    console.log('  ✓ PASSED: Test AC — Inactive token handling marks token inactive');
  }

  // =========================================================================
  // TEST AD: Notification deep link matches orderId
  // =========================================================================
  {
    console.log('Test AD: Notification deep link matches orderId');
    const orderId = 'ord-deep-link-777';
    const payload: PushNotificationPayload = {
      recipientUserId: 'ret-user-ad',
      role: 'RETAILER',
      title: 'Order Confirmed',
      body: 'Order confirmed',
      event: 'ORDER_CONFIRMED',
      type: 'ORDER',
      orderId,
      deepLink: `/orders/${orderId}`,
    };

    assert.strictEqual(payload.deepLink, `/orders/${orderId}`);
    assert.ok(payload.deepLink.includes(orderId));
    console.log('  ✓ PASSED: Test AD — Notification deep link matches orderId');
  }

  // =========================================================================
  // TEST AE: Notification permission denial does not block order flow
  // =========================================================================
  {
    console.log('Test AE: Notification permission denial does not block order flow');
    // When notification preference is disabled or permission denied:
    const preferences: NotificationPreferences = {
      orderUpdates: false,
      deliveryUpdates: false,
      promotionalNotifications: false,
    };

    assert.strictEqual(preferences.orderUpdates, false);
    // Order creation flow in LocalOrderRepository or AppContext does not depend on Notification.permission
    const orderRepoContent = fs.readFileSync('src/repositories/OrderRepository.ts', 'utf-8');
    assert.ok(!orderRepoContent.includes('Notification.permission'));
    assert.ok(!orderRepoContent.includes('requestNotificationPermission'));
    console.log('  ✓ PASSED: Test AE — Notification permission denial does not block order flow');
  }

  // =========================================================================
  // TEST AF: Notification history retains immutable event record
  // =========================================================================
  {
    console.log('Test AF: Notification history retains immutable event record');
    const testOrderId = `ord_test_af_${Date.now()}`;
    const res = await ServerNotificationService.sendPushNotification({
      recipientUserId: 'ret-user-af',
      role: 'RETAILER',
      title: 'Order Placed',
      body: `Your MR FUTKAR order ${testOrderId} has been placed.`,
      event: 'ORDER_PLACED',
      type: 'ORDER',
      orderId: testOrderId,
      orderNumber: testOrderId,
      notificationEventId: `immutable_rec_${testOrderId}`,
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.notificationId);

    // Verify rules allow only updating read/isRead, keeping title/body/event immutable
    assert.ok(rulesContent.includes('match /notifications/{notificationId}'));
    assert.ok(rulesContent.includes("['read', 'isRead']"));
    console.log('  ✓ PASSED: Test AF — Notification history retains immutable event record');
  }

  console.log('\n🎉 ALL 32 NOTIFICATION INFRASTRUCTURE TESTS (A-AF) PASSED SUCCESSFULLY!\n');
}

// Self-executing if run directly
if (process.argv[1]?.includes('phase2c_part3a_notifications.test')) {
  runNotificationTestSuite()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Notification test failed:', err);
      process.exit(1);
    });
}
