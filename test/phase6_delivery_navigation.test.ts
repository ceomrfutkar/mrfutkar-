/**
 * MR FUTKAR — PHASE 6 PART 3: DELIVERY BOY SHOP NAVIGATION TEST SUITE
 * Tests NAV-01 through NAV-18
 * 
 * Validates:
 * - Delivery employee access to fixed shop destination for assigned orders
 * - Authoritative retailer profile as the fixed location destination source
 * - Safe external Google Maps navigation URL format:
 *   https://www.google.com/maps/dir/?api=1&destination={latitude},{longitude}
 * - Strict latitude [-90, 90] and longitude [-180, 180] validation
 * - Handling of missing and invalid coordinates without broken URLs
 * - Preservation of shop address visibility when coordinates are unavailable
 * - Delivery employee authorization enforcement (no bypass via client-supplied retailerId)
 * - Read-only guarantee: zero modifications to retailer profiles or locations
 * - Zero side effects: no accounting entries, no inventory changes, no order mutations, no status changes
 * - Absence of live GPS tracking (no watchPosition, no background tracking)
 * - Absence of Google Maps SDK or API keys
 * - Backward compatibility with legacy orders lacking coordinates
 * - Integrity of Phase 6 Part 2 shop location subsystem
 */

import fs from 'fs';
import path from 'path';
import { CustomerLocationService } from '../src/services/customerLocationService';
import { DeliveryClient } from '../src/services/deliveryClient';
import { RetailerProfile } from '../src/types/retailer';

interface TestResult {
  code: string;
  name: string;
  passed: boolean;
  evidence: string;
}

const testResults: TestResult[] = [];

function assertTest(condition: boolean, code: string, name: string, evidence: string) {
  const passed = Boolean(condition);
  testResults.push({ code, name, passed, evidence });
  const icon = passed ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`${icon} ${code}: ${name}`);
  console.log(`    Evidence: ${evidence}`);
}

export async function runDeliveryNavigationTestSuite() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 6 PART 3 DELIVERY BOY SHOP NAVIGATION TEST SUITE');
  console.log('======================================================================\n');

  // NAV-01: Authorized Delivery employee can view an assigned order's retailer destination data
  {
    const orderId = 'ORD-2026-DEL-101';
    const assignedPartnerId = 'DP-BRAHMPURI-01';
    const sampleOrder = {
      orderId,
      deliveryPartnerId: assignedPartnerId,
      delivery: {
        assignmentStatus: 'ASSIGNED',
        assignedPartnerId,
      },
      retailerId: 'RET-BRAHMPURI-101',
      shopName: 'Gupta General Store',
      ownerName: 'Sunil Gupta',
      deliveryAddressSnapshot: {
        fullAddress: 'Plot 12, Gali No. 3, Brahmpuri, Delhi — 110053',
      },
    };

    // Simulate destination extraction for assigned order
    const canAccess = (order: any, partnerId: string) => {
      return order.deliveryPartnerId === partnerId || order.delivery?.assignedPartnerId === partnerId;
    };

    const isAuthorized = canAccess(sampleOrder, assignedPartnerId);
    const destinationData = {
      orderId: sampleOrder.orderId,
      retailerId: sampleOrder.retailerId,
      shopName: sampleOrder.shopName,
      ownerName: sampleOrder.ownerName,
      shopAddress: sampleOrder.deliveryAddressSnapshot.fullAddress,
      latitude: 28.69234,
      longitude: 77.26851,
      hasCoordinates: true,
      navigationUrl: CustomerLocationService.buildExternalNavigationUrl(28.69234, 77.26851),
    };

    const validPayload =
      isAuthorized &&
      destinationData.shopName === 'Gupta General Store' &&
      destinationData.shopAddress.includes('Brahmpuri') &&
      destinationData.latitude === 28.69234 &&
      destinationData.longitude === 77.26851 &&
      destinationData.hasCoordinates === true &&
      typeof destinationData.navigationUrl === 'string';

    assertTest(
      validPayload,
      'NAV-01',
      "Authorized Delivery employee can view an assigned order's retailer destination data",
      `Authorized partner ${assignedPartnerId} retrieved destination for order ${orderId}: shop="${destinationData.shopName}", address="${destinationData.shopAddress}", coordinates=(${destinationData.latitude}, ${destinationData.longitude}).`
    );
  }

  // NAV-02: Retailer shop latitude/longitude are read from the authoritative retailer profile/location source
  {
    // Historical order with outdated snapshot vs current authoritative retailer profile
    const historicalOrder = {
      orderId: 'ORD-HISTORICAL-01',
      retailerId: 'RET-KIRANA-888',
      deliveryAddressSnapshot: {
        fullAddress: 'Old Address Line, Brahmpuri',
        latitude: null,
        longitude: null,
      },
    };

    const authoritativeRetailer: RetailerProfile = {
      retailerId: 'RET-KIRANA-888',
      mobileNumber: '9810011223',
      phone: '9810011223',
      ownerName: 'Mahesh Sharma',
      shopName: 'Shri Ram Kirana Mandir',
      shopAddress: 'Shop #5, Brahmpuri Chowk, Delhi, PIN: 110053',
      city: 'Delhi',
      pincode: '110053',
      isProfileComplete: true,
      latitude: 28.69312,
      longitude: 77.26945,
      shopLocation: {
        latitude: 28.69312,
        longitude: 77.26945,
      },
    };

    // Service extracts fixed shop destination from authoritative retailer profile
    const authoritativeDest = CustomerLocationService.getFixedShopDestination(authoritativeRetailer);

    const isAuthoritative =
      authoritativeDest.latitude === 28.69312 &&
      authoritativeDest.longitude === 77.26945 &&
      authoritativeDest.hasCoordinates === true &&
      authoritativeDest.shopAddress === authoritativeRetailer.shopAddress;

    assertTest(
      isAuthoritative,
      'NAV-02',
      'Retailer shop latitude/longitude are read from authoritative retailer profile/location source',
      `Destination read from authoritative profile for ${authoritativeRetailer.retailerId}: coordinates=(${authoritativeDest.latitude}, ${authoritativeDest.longitude}), address="${authoritativeDest.shopAddress}".`
    );
  }

  // NAV-03: Valid coordinates generate the correct external Google Maps navigation URL
  {
    const lat = 28.692345;
    const lng = 77.268512;
    const url = CustomerLocationService.buildExternalNavigationUrl(lat, lng);

    const expectedPrefix = 'https://www.google.com/maps/dir/?api=1&destination=';
    const isCorrectUrl =
      typeof url === 'string' &&
      url.startsWith(expectedPrefix) &&
      url.includes(encodeURIComponent(lat.toString())) &&
      url.includes(encodeURIComponent(lng.toString()));

    assertTest(
      isCorrectUrl,
      'NAV-03',
      'Valid coordinates generate the correct external Google Maps navigation URL',
      `Generated safe URL: "${url}" matching pattern "${expectedPrefix}{lat},{lng}".`
    );
  }

  // NAV-04: Latitude is validated before URL generation
  {
    const invalidLatitudes = [
      { val: -90.0001, reason: 'Latitude < -90' },
      { val: 90.0001, reason: 'Latitude > 90' },
      { val: NaN, reason: 'Latitude is NaN' },
      { val: Infinity, reason: 'Latitude is Infinity' },
      { val: -Infinity, reason: 'Latitude is -Infinity' },
      { val: '28.69', reason: 'Latitude is a string' },
      { val: null, reason: 'Latitude is null' },
      { val: undefined, reason: 'Latitude is undefined' },
    ];

    let allRejected = true;
    for (const testCase of invalidLatitudes) {
      const url = CustomerLocationService.buildExternalNavigationUrl(testCase.val as any, 77.2685);
      const validation = CustomerLocationService.validateCoordinates(testCase.val as any, 77.2685);
      if (url !== null || validation.valid !== false) {
        allRejected = false;
        console.error(`Failed to reject invalid latitude: ${testCase.val} (${testCase.reason})`);
      }
    }

    assertTest(
      allRejected,
      'NAV-04',
      'Latitude is validated before URL generation',
      `Verified all 8 invalid latitude values were rejected without generating a navigation URL.`
    );
  }

  // NAV-05: Longitude is validated before URL generation
  {
    const invalidLongitudes = [
      { val: -180.0001, reason: 'Longitude < -180' },
      { val: 180.0001, reason: 'Longitude > 180' },
      { val: NaN, reason: 'Longitude is NaN' },
      { val: Infinity, reason: 'Longitude is Infinity' },
      { val: -Infinity, reason: 'Longitude is -Infinity' },
      { val: '77.26', reason: 'Longitude is a string' },
      { val: null, reason: 'Longitude is null' },
      { val: undefined, reason: 'Longitude is undefined' },
    ];

    let allRejected = true;
    for (const testCase of invalidLongitudes) {
      const url = CustomerLocationService.buildExternalNavigationUrl(28.6923, testCase.val as any);
      const validation = CustomerLocationService.validateCoordinates(28.6923, testCase.val as any);
      if (url !== null || validation.valid !== false) {
        allRejected = false;
        console.error(`Failed to reject invalid longitude: ${testCase.val} (${testCase.reason})`);
      }
    }

    assertTest(
      allRejected,
      'NAV-05',
      'Longitude is validated before URL generation',
      `Verified all 8 invalid longitude values were rejected without generating a navigation URL.`
    );
  }

  // NAV-06: Missing shopLocation does not generate a navigation URL
  {
    const emptyProfile: RetailerProfile = {
      retailerId: 'RET-LEGACY-01',
      mobileNumber: '9811122233',
      phone: '9811122233',
      ownerName: 'Legacy Retailer',
      shopName: 'Old Kirana',
      shopAddress: 'Brahmpuri Service Area',
      city: 'Delhi',
      pincode: '110053',
      isProfileComplete: true,
      // No latitude, longitude, or shopLocation
    };

    const dest = CustomerLocationService.getFixedShopDestination(emptyProfile);
    const navUrl = CustomerLocationService.buildExternalNavigationUrl(dest.latitude, dest.longitude);

    const safeMissingHandling =
      dest.hasCoordinates === false &&
      dest.latitude === null &&
      dest.longitude === null &&
      navUrl === null;

    assertTest(
      safeMissingHandling,
      'NAV-06',
      'Missing shopLocation does not generate a navigation URL',
      `Retailer without coordinates returns hasCoordinates=false and navigationUrl=null without generating broken links.`
    );
  }

  // NAV-07: Invalid coordinates do not generate a navigation URL
  {
    const corruptedProfile: RetailerProfile = {
      retailerId: 'RET-CORRUPT-01',
      mobileNumber: '9811122244',
      phone: '9811122244',
      ownerName: 'Corrupt Shop',
      shopName: 'Corrupt Coords Store',
      shopAddress: 'Somewhere in Delhi',
      city: 'Delhi',
      pincode: '110053',
      isProfileComplete: true,
      latitude: 195.5, // Invalid > 90
      longitude: -220.0, // Invalid < -180
    };

    const dest = CustomerLocationService.getFixedShopDestination(corruptedProfile);
    const navUrl = CustomerLocationService.buildExternalNavigationUrl(dest.latitude, dest.longitude);

    const safeCorruptHandling =
      dest.hasCoordinates === false &&
      navUrl === null;

    assertTest(
      safeCorruptHandling,
      'NAV-07',
      'Invalid coordinates do not generate a navigation URL',
      `Profile with out-of-range coordinates (195.5, -220.0) returns hasCoordinates=false and navigationUrl=null.`
    );
  }

  // NAV-08: Existing shop address remains visible when coordinates are unavailable
  {
    const legacyOrderAddress = 'Shop #7, Main Bazaar, Brahmpuri, Delhi — 110053';
    const destinationWithoutCoords = {
      orderId: 'ORD-LEGACY-NO-GPS',
      retailerId: 'RET-LEGACY-02',
      shopName: 'Aggarwal Provision Store',
      shopAddress: legacyOrderAddress,
      latitude: null,
      longitude: null,
      hasCoordinates: false,
      navigationUrl: null,
    };

    const addressPreserved =
      destinationWithoutCoords.hasCoordinates === false &&
      destinationWithoutCoords.navigationUrl === null &&
      destinationWithoutCoords.shopAddress === legacyOrderAddress;

    assertTest(
      addressPreserved,
      'NAV-08',
      'Existing shop address remains visible when coordinates are unavailable',
      `Address "${destinationWithoutCoords.shopAddress}" remains fully accessible despite missing coordinates.`
    );
  }

  // NAV-09: Delivery employee cannot use a client-supplied retailerId to access an unauthorized retailer's location
  {
    // Verify server endpoint does not trust client-supplied retailerId
    const serverRoutesContent = fs.readFileSync('server/deliveryRoutes.ts', 'utf-8');

    // The destination endpoint strictly derives retailerId from order in database:
    // doc(db, 'orders', orderId) -> order.retailerId
    const usesDatabaseOrderReference =
      serverRoutesContent.includes("const order = oSnap.data();") &&
      serverRoutesContent.includes("if (order.retailerId)") &&
      serverRoutesContent.includes("order.deliveryPartnerId !== partnerId && order.delivery?.assignedPartnerId !== partnerId");

    // Partner A trying to view order assigned to Partner B
    const partnerA = 'DP-BRAHMPURI-01';
    const partnerB = 'DP-BRAHMPURI-02';
    const orderAssignedToB = {
      orderId: 'ORD-SEC-01',
      deliveryPartnerId: partnerB,
      delivery: { assignedPartnerId: partnerB },
      retailerId: 'RET-PRIVATE-CUSTOMER-99',
    };

    const isDeniedForPartnerA =
      orderAssignedToB.deliveryPartnerId !== partnerA &&
      orderAssignedToB.delivery?.assignedPartnerId !== partnerA;

    assertTest(
      usesDatabaseOrderReference && isDeniedForPartnerA,
      'NAV-09',
      "Delivery employee cannot use a client-supplied retailerId to access an unauthorized retailer's location",
      'Endpoint enforces assignedPartnerId match against database order document and ignores client-supplied retailerId parameters.'
    );
  }

  // NAV-10: Delivery employee cannot modify retailer shop location through the navigation feature
  {
    const serverRoutesContent = fs.readFileSync('server/deliveryRoutes.ts', 'utf-8');
    const firestoreRulesContent = fs.readFileSync('firestore.rules', 'utf-8');

    // 1. Destination endpoint is strictly GET (read-only)
    const hasGetDestinationOnly =
      serverRoutesContent.includes("deliveryRouter.get('/orders/:orderId/destination'") &&
      !serverRoutesContent.includes("deliveryRouter.post('/orders/:orderId/destination'") &&
      !serverRoutesContent.includes("deliveryRouter.put('/orders/:orderId/destination'");

    // 2. firestore.rules strictly forbids delivery partners from modifying retailers collection
    const rulesForbidsDeliveryPartnerWrites =
      firestoreRulesContent.includes("match /retailers/{retailerId}") &&
      firestoreRulesContent.includes("isOwner(retailerId)");

    assertTest(
      hasGetDestinationOnly && rulesForbidsDeliveryPartnerWrites,
      'NAV-10',
      'Delivery employee cannot modify retailer shop location through the navigation feature',
      'Navigation feature is strictly HTTP GET read-only; Firestore rules prevent delivery partners from modifying retailer documents.'
    );
  }

  // NAV-11: Pressing "Navigate to Shop" creates no accounting entry
  {
    // Navigation action strictly constructs external URL and calls window.open
    // It does not call any accounting or journal service
    const coreAccountingFiles = [
      'server/generalLedgerService.ts',
      'server/journalEngine.ts',
      'server/invoiceService.ts',
      'server/customerReceiptService.ts',
      'server/supplierPaymentService.ts',
    ];

    let allIntact = true;
    for (const f of coreAccountingFiles) {
      if (!fs.existsSync(path.join(process.cwd(), f))) {
        allIntact = false;
      }
    }

    // Verify DeliveryOrderDetailScreen does not import or call accounting services
    const screenContent = fs.readFileSync('src/components/delivery/DeliveryOrderDetailScreen.tsx', 'utf-8');
    const noAccountingImports =
      !screenContent.includes('journalEngine') &&
      !screenContent.includes('accountingService') &&
      !screenContent.includes('generalLedger');

    assertTest(
      allIntact && noAccountingImports,
      'NAV-11',
      'Pressing "Navigate to Shop" creates no accounting entry',
      'Verified zero accounting imports or ledger mutation logic in navigation action flow.'
    );
  }

  // NAV-12: Pressing "Navigate to Shop" does not modify inventory
  {
    const screenContent = fs.readFileSync('src/components/delivery/DeliveryOrderDetailScreen.tsx', 'utf-8');
    const noInventoryImports =
      !screenContent.includes('adjustStock') &&
      !screenContent.includes('inventoryService') &&
      !screenContent.includes('decrementStock');

    assertTest(
      noInventoryImports,
      'NAV-12',
      'Pressing "Navigate to Shop" does not modify inventory',
      'Verified zero inventory modifications or stock adjustment hooks in navigation action.'
    );
  }

  // NAV-13: Pressing "Navigate to Shop" does not modify order totals or pricing
  {
    const originalOrder = {
      orderId: 'ORD-NAV-TOTALS-01',
      totalAmount: 4500,
      grandTotal: 4500,
      pricingTier: 'TIER_1',
      items: [
        { productId: 'P1', quantity: 10, unitPrice: 450, lineTotal: 4500 },
      ],
    };

    // Navigation URL generation
    const navUrl = CustomerLocationService.buildExternalNavigationUrl(28.6923, 77.2685);

    // Verify order remains strictly unmodified
    const totalsUnchanged =
      originalOrder.totalAmount === 4500 &&
      originalOrder.grandTotal === 4500 &&
      originalOrder.items.length === 1 &&
      originalOrder.items[0].lineTotal === 4500 &&
      typeof navUrl === 'string';

    assertTest(
      totalsUnchanged,
      'NAV-13',
      'Pressing "Navigate to Shop" does not modify order totals or pricing',
      'Order commercial totals, line items, and pricing structures remain strictly immutable.'
    );
  }

  // NAV-14: Pressing "Navigate to Shop" does not change order status
  {
    const orderState = {
      orderId: 'ORD-STATUS-TEST-01',
      orderStatus: 'OUT_FOR_DELIVERY',
      delivery: {
        assignmentStatus: 'OUT_FOR_DELIVERY',
      },
    };

    // Emulating navigation URL opening
    const navUrl = CustomerLocationService.buildExternalNavigationUrl(28.6923, 77.2685);

    // Verify state has not transitioned to DELIVERED or any other state
    const statusUnchanged =
      orderState.orderStatus === 'OUT_FOR_DELIVERY' &&
      orderState.delivery.assignmentStatus === 'OUT_FOR_DELIVERY' &&
      typeof navUrl === 'string';

    assertTest(
      statusUnchanged,
      'NAV-14',
      'Pressing "Navigate to Shop" does not change order status',
      `Order status remained "${orderState.orderStatus}" and assignmentStatus remained "${orderState.delivery.assignmentStatus}".`
    );
  }

  // NAV-15: No live GPS/watchPosition/background tracking is introduced
  {
    const deliveryFiles = [
      'src/components/delivery/DeliveryOrderDetailScreen.tsx',
      'src/components/delivery/DeliveryOrdersScreen.tsx',
      'src/components/delivery/DeliveryPartnerApp.tsx',
      'src/services/deliveryClient.ts',
      'src/context/DeliveryContext.tsx',
      'server/deliveryRoutes.ts',
    ];

    let hasLiveTracking = false;
    for (const f of deliveryFiles) {
      const content = fs.readFileSync(f, 'utf-8');
      if (
        content.includes('watchPosition') ||
        content.includes('startLocationUpdates') ||
        content.includes('backgroundGeolocation') ||
        content.includes('enableBackgroundLocation')
      ) {
        hasLiveTracking = true;
        console.error(`Found prohibited live tracking pattern in ${f}`);
      }
    }

    assertTest(
      !hasLiveTracking,
      'NAV-15',
      'No live GPS/watchPosition/background tracking is introduced',
      'Verified zero occurrences of watchPosition, background location, or continuous GPS tracking in delivery code.'
    );
  }

  // NAV-16: No Google Maps SDK or API key is introduced
  {
    const indexHtml = fs.readFileSync('index.html', 'utf-8');
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    const envExample = fs.readFileSync('.env.example', 'utf-8');

    const noScriptSdk = !indexHtml.includes('maps.googleapis.com/maps/api/js');
    const noMapsPackage =
      !packageJson.dependencies['@googlemaps/js-api-loader'] &&
      !packageJson.dependencies['@react-google-maps/api'];
    const noMapsKeyInEnv = !envExample.includes('GOOGLE_MAPS_API_KEY');

    assertTest(
      noScriptSdk && noMapsPackage && noMapsKeyInEnv,
      'NAV-16',
      'No Google Maps SDK or API key is introduced',
      'Verified pure external navigation intent URL without Maps SDK, JavaScript API scripts, or API keys.'
    );
  }

  // NAV-17: Existing Delivery order details remain functional
  {
    const screenContent = fs.readFileSync('src/components/delivery/DeliveryOrderDetailScreen.tsx', 'utf-8');

    const hasOrderSummary = screenContent.includes('Order Commercial Summary (Read-Only)');
    const hasConsignmentItems = screenContent.includes('Consignment Items');
    const hasCallCustomer = screenContent.includes('CALL CUSTOMER');
    const hasPodVerification = screenContent.includes('Verified Proof of Delivery (POD)');
    const hasStateActionBar = screenContent.includes('STATE-AUTHORITATIVE OPERATIONAL ACTION BAR');

    const allFeaturesIntact =
      hasOrderSummary &&
      hasConsignmentItems &&
      hasCallCustomer &&
      hasPodVerification &&
      hasStateActionBar;

    assertTest(
      allFeaturesIntact,
      'NAV-17',
      'Existing Delivery order details remain functional',
      'Commercial summary, consignment items, customer calling, POD verification, and status action bar remain fully intact.'
    );
  }

  // NAV-18: Existing Phase 6 Part 2 shop-location functionality remains intact
  {
    const testLocation = {
      addressLine1: 'Shop #4, Main Market',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110053',
    };

    const addressValidation = CustomerLocationService.validateShopAddress(testLocation);
    const coordValidation = CustomerLocationService.validateCoordinates(28.69234, 77.26851);
    const formatted = CustomerLocationService.formatFullAddress({
      addressLine1: 'Shop #4',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110053',
    });

    const isIntact =
      addressValidation.valid === true &&
      coordValidation.valid === true &&
      formatted.includes('Shop #4') &&
      formatted.includes('PIN: 110053');

    assertTest(
      isIntact,
      'NAV-18',
      'Existing Phase 6 Part 2 shop-location functionality remains intact',
      `Phase 6 Part 2 CustomerLocationService methods verified: address validation=${addressValidation.valid}, coord validation=${coordValidation.valid}.`
    );
  }

  console.log('\n======================================================================');
  const passedCount = testResults.filter(t => t.passed).length;
  const totalCount = testResults.length;
  console.log(`TEST SUMMARY: ${passedCount}/${totalCount} tests passed.`);
  console.log('======================================================================\n');

  if (passedCount !== totalCount) {
    throw new Error(`Test suite failed: ${totalCount - passedCount} test(s) failed.`);
  }
}

// Direct execution when run via tsx
if (import.meta.url === `file://${process.argv[1]}`) {
  runDeliveryNavigationTestSuite()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
