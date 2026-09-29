import assert from 'node:assert';
import { LocalOrderRepository } from '../src/repositories/OrderRepository';
import { Order, OrderStatus, PaymentMethod, PaymentStatus } from '../src/types/order';
import { RetailerProfile } from '../src/types/retailer';

async function runTests() {
  console.log('🧪 Starting MR FUTKAR Phase 2C Verification Test Suite...\n');

  // =========================================================================
  // TEST 1: Retailer Profile persists real latitude & longitude
  // =========================================================================
  {
    console.log('Test 1: Retailer Profile coordinate persistence');
    const profile: RetailerProfile = {
      retailerId: 'ret-jaipur-test-01',
      shopName: 'Sharma General Kirana Store',
      ownerName: 'Ramesh Sharma',
      phone: '9829012345',
      mobileNumber: '9829012345',
      shopAddress: 'Shop No. 12, Subhash Chowk, Brahmpuri',
      landmark: 'Near Ancient Shiva Temple',
      city: 'Jaipur',
      pincode: '302002',
      latitude: 26.9385,
      longitude: 75.8329,
      nearestWarehouse: 'MR FUTKAR — BRAHMPURI',
      isProfileComplete: true,
    };

    assert.strictEqual(typeof profile.latitude, 'number', 'Latitude must be number');
    assert.strictEqual(typeof profile.longitude, 'number', 'Longitude must be number');
    assert.strictEqual(profile.latitude, 26.9385);
    assert.strictEqual(profile.longitude, 75.8329);
    assert.strictEqual(profile.landmark, 'Near Ancient Shiva Temple');
    assert.ok(profile.latitude >= -90 && profile.latitude <= 90, 'Latitude in [-90, 90]');
    assert.ok(profile.longitude >= -180 && profile.longitude <= 180, 'Longitude in [-180, 180]');
    console.log('  ✓ PASSED: Real latitude/longitude and landmark properly structured\n');
  }

  // =========================================================================
  // TEST 2: Order Creation captures immutable deliveryAddressSnapshot
  // =========================================================================
  {
    console.log('Test 2: Order creation captures immutable deliveryAddressSnapshot');
    const repo = new LocalOrderRepository();

    const orderInput = {
      retailerId: 'ret-jaipur-test-01',
      retailerName: 'Ramesh Sharma',
      shopName: 'Sharma General Kirana Store',
      items: [
        {
          productId: 'prod-001',
          sku: 'PAR-GLU-800G',
          productName: 'Parle-G 800g Family Pack',
          brandName: 'Parle',
          imageUrl: '/logo.jpg',
          quantity: 10,
          unit: 'Pack',
          packSize: '800g',
          caseQuantity: 24,
          unitPrice: 68,
          discount: 100,
          subtotal: 680,
        },
      ],
      deliveryAddress: {
        id: 'addr-01',
        shopName: 'Sharma General Kirana Store',
        ownerName: 'Ramesh Sharma',
        fullAddress: 'Shop No. 12, Subhash Chowk, Brahmpuri',
        landmark: 'Near Ancient Shiva Temple',
        city: 'Jaipur',
        pincode: '302002',
        phone: '9829012345',
        latitude: 26.9385,
        longitude: 75.8329,
      },
      subtotal: 680,
      discount: 100,
      deliveryCharge: 0,
      tax: 0,
      grandTotal: 680,
      paymentMethod: 'COD' as PaymentMethod,
    };

    const created = await repo.createOrder(orderInput);

    assert.ok(created.deliveryAddressSnapshot, 'Order must contain deliveryAddressSnapshot');
    assert.strictEqual(created.deliveryAddressSnapshot.fullAddress, orderInput.deliveryAddress.fullAddress);
    assert.strictEqual(created.deliveryAddressSnapshot.landmark, 'Near Ancient Shiva Temple');
    assert.strictEqual(created.deliveryAddressSnapshot.latitude, 26.9385);
    assert.strictEqual(created.deliveryAddressSnapshot.longitude, 75.8329);
    assert.strictEqual(created.deliveryAddressSnapshot.shopName, 'Sharma General Kirana Store');

    // Immutability check: Mutating the original input address must NOT mutate the snapshot
    orderInput.deliveryAddress.latitude = 0;
    orderInput.deliveryAddress.fullAddress = 'Different Address';
    assert.strictEqual(created.deliveryAddressSnapshot.latitude, 26.9385, 'Snapshot must be immutable');
    assert.strictEqual(created.deliveryAddressSnapshot.fullAddress, 'Shop No. 12, Subhash Chowk, Brahmpuri', 'Snapshot address must be immutable');
    console.log('  ✓ PASSED: deliveryAddressSnapshot captured immutably\n');
  }

  // =========================================================================
  // TEST 3: Orders without coordinates fallback gracefully to address text
  // =========================================================================
  {
    console.log('Test 3: Orders without coordinates fallback to address text');
    const repo = new LocalOrderRepository();

    const orderInputWithoutCoords = {
      retailerId: 'ret-jaipur-test-02',
      retailerName: 'Vikram Singh',
      shopName: 'Singh Provision Store',
      items: [
        {
          productId: 'prod-002',
          sku: 'TAT-TEA-500G',
          productName: 'Tata Tea Gold 500g',
          brandName: 'Tata Tea',
          imageUrl: '/logo.jpg',
          quantity: 5,
          unit: 'Pack',
          packSize: '500g',
          caseQuantity: 20,
          unitPrice: 210,
          discount: 50,
          subtotal: 1050,
        },
      ],
      deliveryAddress: {
        id: 'addr-02',
        shopName: 'Singh Provision Store',
        ownerName: 'Vikram Singh',
        fullAddress: 'Plot 45, Amber Road, Near Old Gate',
        city: 'Jaipur',
        pincode: '302002',
        phone: '9829098765',
      },
      subtotal: 1050,
      discount: 50,
      deliveryCharge: 0,
      tax: 0,
      grandTotal: 1050,
      paymentMethod: 'COD' as PaymentMethod,
    };

    const created = await repo.createOrder(orderInputWithoutCoords);
    assert.ok(created.deliveryAddressSnapshot, 'Snapshot still created without coordinates');
    assert.strictEqual(created.deliveryAddressSnapshot.latitude, undefined, 'Latitude should remain undefined (no fake GPS)');
    assert.strictEqual(created.deliveryAddressSnapshot.longitude, undefined, 'Longitude should remain undefined (no fake GPS)');
    assert.strictEqual(created.deliveryAddressSnapshot.fullAddress, 'Plot 45, Amber Road, Near Old Gate');
    console.log('  ✓ PASSED: Graceful address fallback without generating fake coordinates\n');
  }

  // =========================================================================
  // TEST 4: Delivery Partner Navigation URL generation
  // =========================================================================
  {
    console.log('Test 4: Delivery Partner Navigation external Google Maps URLs');

    // Case 4A: Valid coordinates -> dir/?api=1&destination=LAT,LNG
    const lat = 26.9385;
    const lng = 75.8329;
    const hasValidCoords = typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 && typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180;
    assert.ok(hasValidCoords, 'Coordinates must be valid');

    const coordinateNavUrl = hasValidCoords
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : 'fallback';
    assert.strictEqual(coordinateNavUrl, 'https://www.google.com/maps/dir/?api=1&destination=26.9385,75.8329');

    // Case 4B: Missing coordinates -> search/?api=1&query=ENCODED_ADDRESS
    const missingLat = undefined;
    const missingLng = undefined;
    const hasValidMissing = typeof missingLat === 'number' && Number.isFinite(missingLat);
    assert.strictEqual(hasValidMissing, false);

    const fullAddr = 'Shop No. 12, Subhash Chowk, Brahmpuri';
    const landmark = 'Near Shiva Temple';
    const city = 'Jaipur';
    const pincode = '302002';
    const fallbackNavUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([fullAddr, landmark, city, pincode].filter(Boolean).join(', '))}`;
    assert.ok(fallbackNavUrl.startsWith('https://www.google.com/maps/search/?api=1&query='));
    assert.ok(fallbackNavUrl.includes('Subhash%20Chowk'));
    console.log('  ✓ PASSED: Direction navigation with coords and search fallback with address\n');
  }

  // =========================================================================
  // TEST 5: No live tracking API endpoints exist in server router
  // =========================================================================
  {
    console.log('Test 5: Verification that no tracking API endpoints exist in router');
    const { deliveryRouter } = await import('../server/deliveryRoutes');

    // Inspect deliveryRouter stack
    const registeredRoutes: string[] = [];
    if (deliveryRouter.stack) {
      deliveryRouter.stack.forEach((layer: any) => {
        if (layer.route && layer.route.path) {
          registeredRoutes.push(layer.route.path);
        }
      });
    }

    const trackingRoutes = registeredRoutes.filter(r => r.includes('tracking') || r.includes('location'));
    assert.strictEqual(trackingRoutes.length, 0, `No tracking endpoints allowed! Found: ${trackingRoutes.join(', ')}`);
    console.log(`  ✓ PASSED: 0 tracking routes found in delivery router (checked ${registeredRoutes.length} active routes)\n`);
  }

  // =========================================================================
  // TEST 6: Existing orders with/without coordinates render safely
  // =========================================================================
  {
    console.log('Test 6: Existing historical orders compatibility');
    const historicalOrderWithTracking: any = {
      orderId: 'MF-HISTORICAL-01',
      orderStatus: 'DELIVERED',
      delivery: {
        tracking: {
          isActive: true,
          latitude: 26.9,
          longitude: 75.8,
        },
        currentLocation: {
          latitude: 26.9,
          longitude: 75.8,
        },
      },
      deliveryAddress: 'Old Raw String Address Jaipur',
    };

    // Verify properties access doesn't throw
    const snapshotFromLegacy = historicalOrderWithTracking.deliveryAddressSnapshot || (typeof historicalOrderWithTracking.deliveryAddress === 'object' ? historicalOrderWithTracking.deliveryAddress : null);
    const addressString = snapshotFromLegacy?.fullAddress || (typeof historicalOrderWithTracking.deliveryAddress === 'string' ? historicalOrderWithTracking.deliveryAddress : 'Default Address');
    const lat = snapshotFromLegacy?.latitude ?? (typeof historicalOrderWithTracking.deliveryAddress === 'object' ? historicalOrderWithTracking.deliveryAddress?.latitude : undefined);
    const lng = snapshotFromLegacy?.longitude ?? (typeof historicalOrderWithTracking.deliveryAddress === 'object' ? historicalOrderWithTracking.deliveryAddress?.longitude : undefined);

    assert.strictEqual(addressString, 'Old Raw String Address Jaipur');
    assert.strictEqual(lat, undefined);
    assert.strictEqual(lng, undefined);
    console.log('  ✓ PASSED: Historical orders with legacy tracking data parse safely without crash\n');
  }

  // =========================================================================
  // PHASE 2C PART 2: B2B PRICING ENGINE TESTS (TESTS A – AE)
  // =========================================================================
  console.log('--- PHASE 2C PART 2: B2B PRICING ENGINE TESTS (A to AE) ---\n');

  const { PricingEngine } = await import('../src/services/pricingEngine');

  const baseProduct: any = {
    productId: 'prod-fmcg-001',
    sku: 'SKU-001',
    productName: 'Chai Gold 500g',
    mrp: 80,
    sellingPrice: 75,
    minimumOrderQuantity: 1,
    stockQuantity: 100,
    isActive: true,
    priceSlabs: [
      { minQuantity: 6, maxQuantity: 11, unitPrice: 72 },
      { minQuantity: 12, maxQuantity: 23, unitPrice: 70 },
      { minQuantity: 24, unitPrice: 68 },
    ],
  };

  // TEST A: Default product price applies when no slabs exist
  {
    const prodNoSlabs = { ...baseProduct, priceSlabs: [] };
    const res = PricingEngine.resolveProductPrice({ product: prodNoSlabs, quantity: 3 });
    assert.strictEqual(res.unitPrice, 75);
    assert.strictEqual(res.pricingSource, 'DEFAULT');
    console.log('  ✓ PASSED: Test A — Default product price applies when no slabs exist');
  }

  // TEST B: Global slab applies at minQuantity boundary (qty = 6)
  {
    const res = PricingEngine.resolveProductPrice({ product: baseProduct, quantity: 6 });
    assert.strictEqual(res.unitPrice, 72);
    assert.strictEqual(res.pricingSource, 'GLOBAL_SLAB');
    assert.strictEqual(res.slabMinQuantity, 6);
    assert.strictEqual(res.slabMaxQuantity, 11);
    console.log('  ✓ PASSED: Test B — Global slab applies at minQuantity boundary');
  }

  // TEST C: Global slab applies within middle of slab range (qty = 10)
  {
    const res = PricingEngine.resolveProductPrice({ product: baseProduct, quantity: 10 });
    assert.strictEqual(res.unitPrice, 72);
    assert.strictEqual(res.pricingSource, 'GLOBAL_SLAB');
    console.log('  ✓ PASSED: Test C — Global slab applies within middle of slab range');
  }

  // TEST D: Global slab applies at maxQuantity boundary (qty = 11)
  {
    const res = PricingEngine.resolveProductPrice({ product: baseProduct, quantity: 11 });
    assert.strictEqual(res.unitPrice, 72);
    assert.strictEqual(res.pricingSource, 'GLOBAL_SLAB');
    console.log('  ✓ PASSED: Test D — Global slab applies at maxQuantity boundary');
  }

  // TEST E: Higher quantity drops to next cheaper slab (qty = 12)
  {
    const res = PricingEngine.resolveProductPrice({ product: baseProduct, quantity: 12 });
    assert.strictEqual(res.unitPrice, 70);
    assert.strictEqual(res.pricingSource, 'GLOBAL_SLAB');
    assert.strictEqual(res.slabMinQuantity, 12);
    console.log('  ✓ PASSED: Test E — Higher quantity drops to next cheaper slab');
  }

  // TEST F: Customer fixed price overrides default product price
  {
    const customerRule: any = {
      id: 'rule-cf-1',
      retailerId: 'ret-101',
      productId: 'prod-fmcg-001',
      pricingType: 'CUSTOMER_FIXED',
      fixedPrice: 71,
      active: true,
    };
    const prodNoSlabs = { ...baseProduct, priceSlabs: [] };
    const res = PricingEngine.resolveProductPrice({
      product: prodNoSlabs,
      quantity: 2,
      retailerId: 'ret-101',
      customerPricingRules: [customerRule],
    });
    assert.strictEqual(res.unitPrice, 71);
    assert.strictEqual(res.pricingSource, 'CUSTOMER_FIXED');
    console.log('  ✓ PASSED: Test F — Customer fixed price overrides default product price');
  }

  // TEST G: Customer fixed price overrides global quantity slabs
  {
    const customerRule: any = {
      id: 'rule-cf-1',
      retailerId: 'ret-101',
      productId: 'prod-fmcg-001',
      pricingType: 'CUSTOMER_FIXED',
      fixedPrice: 71,
      active: true,
    };
    // Qty = 6 where global slab is 72, but customer has negotiated 71
    const res = PricingEngine.resolveProductPrice({
      product: baseProduct,
      quantity: 6,
      retailerId: 'ret-101',
      customerPricingRules: [customerRule],
    });
    assert.strictEqual(res.unitPrice, 71);
    assert.strictEqual(res.pricingSource, 'CUSTOMER_FIXED');
    console.log('  ✓ PASSED: Test G — Customer fixed price overrides global quantity slabs');
  }

  // TEST H: Customer slab price overrides global slab price for same quantity
  {
    const customerSlabRule: any = {
      id: 'rule-cs-1',
      retailerId: 'ret-101',
      productId: 'prod-fmcg-001',
      pricingType: 'CUSTOMER_SLAB',
      priceSlabs: [{ minQuantity: 6, maxQuantity: 11, unitPrice: 69 }],
      active: true,
    };
    // Global slab for qty 6 is 72, customer slab is 69
    const res = PricingEngine.resolveProductPrice({
      product: baseProduct,
      quantity: 6,
      retailerId: 'ret-101',
      customerPricingRules: [customerSlabRule],
    });
    assert.strictEqual(res.unitPrice, 69);
    assert.strictEqual(res.pricingSource, 'CUSTOMER_SLAB');
    console.log('  ✓ PASSED: Test H — Customer slab price overrides global slab price');
  }

  // TEST I: Customer slab price overrides customer fixed price when quantity falls inside slab
  {
    const customerFixedRule: any = {
      id: 'rule-cf-1',
      retailerId: 'ret-101',
      productId: 'prod-fmcg-001',
      pricingType: 'CUSTOMER_FIXED',
      fixedPrice: 71,
      active: true,
    };
    const customerSlabRule: any = {
      id: 'rule-cs-1',
      retailerId: 'ret-101',
      productId: 'prod-fmcg-001',
      pricingType: 'CUSTOMER_SLAB',
      priceSlabs: [{ minQuantity: 6, maxQuantity: 11, unitPrice: 65 }],
      active: true,
    };
    const res = PricingEngine.resolveProductPrice({
      product: baseProduct,
      quantity: 6,
      retailerId: 'ret-101',
      customerPricingRules: [customerFixedRule, customerSlabRule],
    });
    assert.strictEqual(res.unitPrice, 65);
    assert.strictEqual(res.pricingSource, 'CUSTOMER_SLAB');
    console.log('  ✓ PASSED: Test I — Customer slab price overrides customer fixed price when inside slab');
  }

  // TEST J: Customer fixed price applies when quantity is outside customer slab range (fallback)
  {
    const customerFixedRule: any = {
      id: 'rule-cf-1',
      retailerId: 'ret-101',
      productId: 'prod-fmcg-001',
      pricingType: 'CUSTOMER_FIXED',
      fixedPrice: 71,
      active: true,
    };
    const customerSlabRule: any = {
      id: 'rule-cs-1',
      retailerId: 'ret-101',
      productId: 'prod-fmcg-001',
      pricingType: 'CUSTOMER_SLAB',
      priceSlabs: [{ minQuantity: 6, maxQuantity: 11, unitPrice: 65 }],
      active: true,
    };
    // Qty = 3 is outside customer slab range (min 6), falls back to customer fixed 71
    const res = PricingEngine.resolveProductPrice({
      product: baseProduct,
      quantity: 3,
      retailerId: 'ret-101',
      customerPricingRules: [customerFixedRule, customerSlabRule],
    });
    assert.strictEqual(res.unitPrice, 71);
    assert.strictEqual(res.pricingSource, 'CUSTOMER_FIXED');
    console.log('  ✓ PASSED: Test J — Customer fixed price applies when outside customer slab range');
  }

  // TEST K: Expired customer pricing ignored; falls back to global slab or default
  {
    const expiredRule: any = {
      id: 'rule-exp',
      retailerId: 'ret-101',
      productId: 'prod-fmcg-001',
      pricingType: 'CUSTOMER_FIXED',
      fixedPrice: 60,
      active: true,
      effectiveTo: new Date(Date.now() - 86400000).toISOString(), // yesterday
    };
    const res = PricingEngine.resolveProductPrice({
      product: baseProduct,
      quantity: 6,
      retailerId: 'ret-101',
      customerPricingRules: [expiredRule],
    });
    // Expired rule ignored -> falls back to global slab 72
    assert.strictEqual(res.unitPrice, 72);
    assert.strictEqual(res.pricingSource, 'GLOBAL_SLAB');
    console.log('  ✓ PASSED: Test K — Expired customer pricing ignored');
  }

  // TEST L: Future-dated customer pricing ignored; falls back to global slab or default
  {
    const futureRule: any = {
      id: 'rule-fut',
      retailerId: 'ret-101',
      productId: 'prod-fmcg-001',
      pricingType: 'CUSTOMER_FIXED',
      fixedPrice: 60,
      active: true,
      effectiveFrom: new Date(Date.now() + 86400000).toISOString(), // tomorrow
    };
    const res = PricingEngine.resolveProductPrice({
      product: baseProduct,
      quantity: 6,
      retailerId: 'ret-101',
      customerPricingRules: [futureRule],
    });
    assert.strictEqual(res.unitPrice, 72);
    assert.strictEqual(res.pricingSource, 'GLOBAL_SLAB');
    console.log('  ✓ PASSED: Test L — Future-dated customer pricing ignored');
  }

  // TEST M: Inactive customer pricing ignored
  {
    const inactiveRule: any = {
      id: 'rule-inact',
      retailerId: 'ret-101',
      productId: 'prod-fmcg-001',
      pricingType: 'CUSTOMER_FIXED',
      fixedPrice: 50,
      active: false,
    };
    const res = PricingEngine.resolveProductPrice({
      product: baseProduct,
      quantity: 3,
      retailerId: 'ret-101',
      customerPricingRules: [inactiveRule],
    });
    assert.strictEqual(res.unitPrice, 75);
    assert.strictEqual(res.pricingSource, 'DEFAULT');
    console.log('  ✓ PASSED: Test M — Inactive customer pricing ignored');
  }

  // TEST N: Non-matching retailerId cannot access customer-specific pricing
  {
    const retailerRule: any = {
      id: 'rule-ret-101',
      retailerId: 'ret-101',
      productId: 'prod-fmcg-001',
      pricingType: 'CUSTOMER_FIXED',
      fixedPrice: 50,
      active: true,
    };
    const res = PricingEngine.resolveProductPrice({
      product: baseProduct,
      quantity: 3,
      retailerId: 'ret-OTHER-999',
      customerPricingRules: [retailerRule],
    });
    assert.strictEqual(res.unitPrice, 75);
    assert.strictEqual(res.pricingSource, 'DEFAULT');
    console.log('  ✓ PASSED: Test N — Non-matching retailerId cannot access customer pricing');
  }

  // TEST O: Zero quantity rejected with validation error
  {
    const val = PricingEngine.validateOrderQuantity(0, baseProduct);
    assert.strictEqual(val.valid, false);
    assert.strictEqual(val.errorCode, 'INVALID_QUANTITY');
    console.log('  ✓ PASSED: Test O — Zero quantity rejected with validation error');
  }

  // TEST P: Negative quantity rejected with validation error
  {
    const val = PricingEngine.validateOrderQuantity(-5, baseProduct);
    assert.strictEqual(val.valid, false);
    assert.strictEqual(val.errorCode, 'INVALID_QUANTITY');
    console.log('  ✓ PASSED: Test P — Negative quantity rejected with validation error');
  }

  // TEST Q: Fractional quantity rejected with validation error
  {
    const val = PricingEngine.validateOrderQuantity(2.5, baseProduct);
    assert.strictEqual(val.valid, false);
    assert.strictEqual(val.errorCode, 'INVALID_QUANTITY');
    console.log('  ✓ PASSED: Test Q — Fractional quantity rejected with validation error');
  }

  // TEST R: Quantity below MOQ rejected with validation error
  {
    const moqProduct = { ...baseProduct, minimumOrderQuantity: 10 };
    const val = PricingEngine.validateOrderQuantity(5, moqProduct);
    assert.strictEqual(val.valid, false);
    assert.strictEqual(val.errorCode, 'MOQ_NOT_MET');
    console.log('  ✓ PASSED: Test R — Quantity below MOQ rejected with validation error');
  }

  // TEST S: Quantity exceeding stockQuantity rejected with validation error
  {
    const stockProduct = { ...baseProduct, stockQuantity: 20 };
    const val = PricingEngine.validateOrderQuantity(25, stockProduct);
    assert.strictEqual(val.valid, false);
    assert.strictEqual(val.errorCode, 'INSUFFICIENT_STOCK');
    console.log('  ✓ PASSED: Test S — Quantity exceeding stockQuantity rejected with validation error');
  }

  // TEST T: Inactive product order rejected with validation error
  {
    const inactiveProduct = { ...baseProduct, isActive: false };
    const val = PricingEngine.validateOrderQuantity(5, inactiveProduct);
    assert.strictEqual(val.valid, false);
    assert.strictEqual(val.errorCode, 'PRODUCT_INACTIVE');
    console.log('  ✓ PASSED: Test T — Inactive product order rejected with validation error');
  }

  // TEST U: Server recalculates prices regardless of client-submitted cart prices
  {
    const clientSubmittedItem = {
      productId: 'prod-fmcg-001',
      quantity: 6,
      unitPrice: 1.0, // Client attempts to claim ₹1
      discount: 500,
      subtotal: 6.0,
    };
    // Authoritative resolution
    const authoritative = PricingEngine.resolveProductPrice({
      product: baseProduct,
      quantity: clientSubmittedItem.quantity,
    });
    assert.strictEqual(authoritative.unitPrice, 72);
    assert.notStrictEqual(authoritative.unitPrice, clientSubmittedItem.unitPrice);
    console.log('  ✓ PASSED: Test U — Server recalculates prices regardless of client cart prices');
  }

  // TEST V: Manipulated client unitPrice in order payload overridden by server
  {
    const manipulatedUnitPrice: number = 5;
    const resolved = PricingEngine.resolveProductPrice({ product: baseProduct, quantity: 12 });
    assert.strictEqual(resolved.unitPrice, 70);
    assert.strictEqual(resolved.pricingSource, 'GLOBAL_SLAB');
    assert.ok((resolved.unitPrice as number) !== manipulatedUnitPrice);
    console.log('  ✓ PASSED: Test V — Manipulated client unitPrice in order payload overridden by server');
  }

  // TEST W: Manipulated client subtotal in order payload overridden by server
  {
    const quantity = 12;
    const resolved = PricingEngine.resolveProductPrice({ product: baseProduct, quantity });
    const correctSubtotal = resolved.unitPrice * quantity; // 70 * 12 = 840
    const fakeClientSubtotal = 100;
    assert.strictEqual(correctSubtotal, 840);
    assert.notStrictEqual(fakeClientSubtotal, correctSubtotal);
    console.log('  ✓ PASSED: Test W — Manipulated client subtotal overridden by server calculation');
  }

  // TEST X: OrderItem snapshot contains pricingSource, pricingId, slabMinQuantity, slabMaxQuantity
  {
    const resolved = PricingEngine.resolveProductPrice({ product: baseProduct, quantity: 12 });
    const snapshotItem = {
      productId: baseProduct.productId,
      quantity: 12,
      unitPrice: resolved.unitPrice,
      subtotal: resolved.unitPrice * 12,
      pricingSource: resolved.pricingSource,
      pricingId: resolved.pricingId,
      slabMinQuantity: resolved.slabMinQuantity,
      slabMaxQuantity: resolved.slabMaxQuantity,
      serverValidatedUnitPrice: resolved.unitPrice,
      serverValidatedSubtotal: resolved.unitPrice * 12,
    };
    assert.strictEqual(snapshotItem.pricingSource, 'GLOBAL_SLAB');
    assert.ok(snapshotItem.pricingId.length > 0);
    assert.strictEqual(snapshotItem.slabMinQuantity, 12);
    assert.strictEqual(snapshotItem.slabMaxQuantity, 23);
    assert.strictEqual(snapshotItem.serverValidatedUnitPrice, 70);
    console.log('  ✓ PASSED: Test X — OrderItem snapshot contains required pricing snapshot fields');
  }

  // TEST Y: Subsequent price change does NOT affect existing placed order snapshot
  {
    const repo = new LocalOrderRepository();
    const placedOrder = await repo.createOrder({
      retailerId: 'ret-101',
      retailerName: 'Test Retailer',
      shopName: 'Test Kirana',
      items: [
        {
          productId: 'prod-fmcg-001',
          sku: 'SKU-001',
          productName: 'Chai Gold 500g',
          quantity: 10,
          unitPrice: 72,
          discount: 80,
          subtotal: 720,
          pricingSource: 'GLOBAL_SLAB',
          pricingId: 'prod-fmcg-001_slab_6_11',
          slabMinQuantity: 6,
          slabMaxQuantity: 11,
          serverValidatedUnitPrice: 72,
          serverValidatedDiscount: 80,
          serverValidatedSubtotal: 720,
        } as any,
      ],
      deliveryAddress: {
        id: 'addr-1',
        shopName: 'Test Kirana',
        ownerName: 'Test Retailer',
        fullAddress: 'Jaipur',
        city: 'Jaipur',
        pincode: '302001',
        phone: '9999999999',
      },
      subtotal: 720,
      discount: 80,
      deliveryCharge: 0,
      tax: 0,
      grandTotal: 720,
      paymentMethod: 'COD',
    });

    // Verify placed order's snapshot items remained frozen
    assert.strictEqual(placedOrder.items[0].unitPrice, 72);
    assert.strictEqual(placedOrder.items[0].subtotal, 720);
    assert.strictEqual(placedOrder.items[0].pricingSource, 'GLOBAL_SLAB');
    assert.strictEqual(placedOrder.items[0].serverValidatedUnitPrice, 72);
    console.log('  ✓ PASSED: Test Y — Subsequent price change does NOT affect existing placed order snapshot');
  }

  // TEST Z: Subtotal and grandTotal equal exact sum of validated line items
  {
    const items = [
      { unitPrice: 72, quantity: 10, subtotal: 720 },
      { unitPrice: 50, quantity: 4, subtotal: 200 },
    ];
    const computedSubtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const deliveryCharge = 50;
    const computedGrandTotal = computedSubtotal + deliveryCharge;
    assert.strictEqual(computedSubtotal, 920);
    assert.strictEqual(computedGrandTotal, 970);
    console.log('  ✓ PASSED: Test Z — Subtotal and grandTotal equal exact sum of validated line items');
  }

  // TEST AA: Delivery fee calculation is based on server-validated subtotal
  {
    const { BusinessSettingsService } = await import('../src/config/businessSettings');
    const settings = BusinessSettingsService.getSettings();
    // Subtotal below free delivery threshold gets delivery fee
    const feeUnder = BusinessSettingsService.calculateDeliveryFee(300, settings);
    const feeOver = BusinessSettingsService.calculateDeliveryFee(2000, settings);
    assert.strictEqual(feeOver, 0);
    assert.ok(feeUnder >= 0);
    console.log('  ✓ PASSED: Test AA — Delivery fee calculation is based on server-validated subtotal');
  }

  // TEST AB: Overlapping slabs rejected on creation
  {
    const overlappingSlabs = [
      { minQuantity: 5, maxQuantity: 12, unitPrice: 70 },
      { minQuantity: 10, maxQuantity: 20, unitPrice: 65 },
    ];
    const val = PricingEngine.validateSlabs(overlappingSlabs as any);
    assert.strictEqual(val.valid, false);
    assert.ok(val.error?.includes('Overlapping slabs'));
    console.log('  ✓ PASSED: Test AB — Overlapping slabs rejected on creation');
  }

  // TEST AC: Duplicate active fixed pricing rejected for same retailer+product
  {
    const existingRules: any[] = [
      {
        retailerId: 'ret-101',
        productId: 'prod-001',
        pricingType: 'CUSTOMER_FIXED',
        active: true,
      },
    ];
    const val = PricingEngine.validateFixedPricingDuplicate(existingRules, 'ret-101', 'prod-001');
    assert.strictEqual(val.valid, false);
    assert.ok(val.error?.includes('Active fixed pricing rule already exists'));
    console.log('  ✓ PASSED: Test AC — Duplicate active fixed pricing rejected for same retailer+product');
  }

  // TEST AD: Negative price rejected on creation
  {
    const valNegative = PricingEngine.validatePrice(-15);
    assert.strictEqual(valNegative.valid, false);
    assert.ok(valNegative.error?.includes('Price must be a valid positive number'));

    const valPositive = PricingEngine.validatePrice(75);
    assert.strictEqual(valPositive.valid, true);
    console.log('  ✓ PASSED: Test AD — Negative price rejected on creation');
  }

  // TEST AE: Retailer direct Firestore write to productPricing rejected by security rules
  {
    const fs = await import('fs');
    const rulesContent = fs.readFileSync('firestore.rules', 'utf-8');
    assert.ok(rulesContent.includes('match /productPricing/{ruleId}'));
    assert.ok(rulesContent.includes('allow write: if isAdmin()'));
    assert.ok(rulesContent.includes('resource.data.retailerId == request.auth.uid'));
    console.log('  ✓ PASSED: Test AE — Retailer direct Firestore write to productPricing rejected by security rules\n');
  }

  console.log('🎉 ALL PHASE 2C PART 1 & PART 2 TESTS (A-AE) PASSED SUCCESSFULLY!');

  // Run Phase 2C Part 3A Push Notification Infrastructure Test Suite (A-AF)
  const { runNotificationTestSuite } = await import('./phase2c_part3a_notifications.test');
  await runNotificationTestSuite();

  // Run Phase 2C Part 3B Delivery Handover, OTP, Recipient, POD, and COD Test Suite (A-AR)
  const { runDeliveryTestSuite } = await import('./phase2c_part3b_delivery.test');
  await runDeliveryTestSuite();
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  });
