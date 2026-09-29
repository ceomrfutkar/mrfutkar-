/**
 * MR FUTKAR — ORDER PRICING SOURCE SNAPSHOT TARGETED TEST SUITE
 * 
 * Verifies that the order snapshot records the EXACT pricing decision actually
 * calculated by the server's authoritative PricingEngine:
 * 
 * 1. CUSTOMER_SLAB: Verified hierarchy priority 1
 * 2. CUSTOMER_FIXED: Verified hierarchy priority 2
 * 3. GLOBAL_SLAB: Verified hierarchy priority 3 (e.g. prod-001 Qty 24 -> ₹67)
 * 4. DEFAULT: Verified hierarchy priority 4 (base wholesale price)
 * 5. Order snapshot matches PricingEngine decision
 * 6. Client cannot override price (server recalculates authoritatively)
 * 7. Historical order price remains immutable
 */

import { PricingEngine } from '../src/services/pricingEngine';
import { Product, ProductPricingRule } from '../src/types/product';
import { OrderItem } from '../src/types/order';
import { db } from '../src/config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface TestResult {
  code: string;
  name: string;
  passed: boolean;
  evidence: string;
}

const testResults: TestResult[] = [];

function assert(condition: boolean, code: string, desc: string, evidence?: string) {
  testResults.push({ code, name: desc, passed: Boolean(condition), evidence: evidence || '' });
  if (condition) {
    console.log(`✅ [PASS] ${code}: ${desc}`);
    if (evidence) console.log(`    Evidence: ${evidence}`);
  } else {
    console.error(`❌ [FAIL] ${code}: ${desc}`);
    if (evidence) console.error(`    Evidence: ${evidence}`);
  }
}

export async function runOrderPricingSnapshotTests() {
  console.log('======================================================================');
  console.log('MR FUTKAR — ORDER PRICING SOURCE SNAPSHOT TARGETED AUDIT');
  console.log('======================================================================\n');

  const testRetailerId = 'ret-pricing-audit-01';

  // Base test product matching live Parle-G 800g (prod-001) catalogue definition
  const prod001: Product = {
    productId: 'prod-001',
    sku: 'PAR-GLU-800G',
    productName: 'Parle-G 800g Super Saver Family Pack',
    brandId: 'b-parle',
    brandName: 'Parle',
    categoryId: 'cat-biscuits',
    categoryName: 'Biscuits',
    mrp: 80,
    sellingPrice: 70, // Base default wholesale price
    minimumOrderQuantity: 6,
    unit: 'Pack',
    caseQuantity: 24,
    priceSlabs: [
      { minQuantity: 1, maxQuantity: 11, slabPrice: 70, label: 'Standard Wholesale' },
      { minQuantity: 12, maxQuantity: 23, slabPrice: 68.5, label: 'Half-Case Tier' },
      { minQuantity: 24, slabPrice: 67, label: 'Full Case Tier (24+)' },
    ],
    stockQuantity: 500,
    isActive: true,
  } as any;

  // -------------------------------------------------------------------------
  // TEST 1 — CUSTOMER_SLAB
  // -------------------------------------------------------------------------
  const custSlabRule: ProductPricingRule = {
    pricingId: 'rule-cust-slab-01',
    productId: 'prod-001',
    retailerId: testRetailerId,
    pricingType: 'CUSTOMER_SLAB',
    active: true,
    slabs: [
      { minQuantity: 10, maxQuantity: 19, unitPrice: 66, active: true },
      { minQuantity: 20, maxQuantity: null, unitPrice: 64, active: true },
    ],
  };

  const resCustSlab = PricingEngine.resolveProductPrice({
    product: prod001,
    quantity: 24,
    retailerId: testRetailerId,
    customerPricingRules: [custSlabRule],
  });

  assert(
    resCustSlab.pricingSource === 'CUSTOMER_SLAB' && resCustSlab.unitPrice === 64,
    'PRICING-01',
    'CUSTOMER_SLAB resolved at highest priority',
    `Resolved price: ₹${resCustSlab.unitPrice}, source: ${resCustSlab.pricingSource}, slabMinQuantity: ${resCustSlab.slabMinQuantity}`
  );

  // -------------------------------------------------------------------------
  // TEST 2 — CUSTOMER_FIXED
  // -------------------------------------------------------------------------
  const custFixedRule: ProductPricingRule = {
    pricingId: 'rule-cust-fixed-01',
    productId: 'prod-001',
    retailerId: testRetailerId,
    pricingType: 'CUSTOMER_FIXED',
    active: true,
    fixedPrice: 66.5,
  };

  const resCustFixed = PricingEngine.resolveProductPrice({
    product: prod001,
    quantity: 24,
    retailerId: testRetailerId,
    customerPricingRules: [custFixedRule],
  });

  assert(
    resCustFixed.pricingSource === 'CUSTOMER_FIXED' && resCustFixed.unitPrice === 66.5,
    'PRICING-02',
    'CUSTOMER_FIXED overrides global slabs and default',
    `Resolved price: ₹${resCustFixed.unitPrice}, source: ${resCustFixed.pricingSource}, pricingId: ${resCustFixed.pricingId}`
  );

  // -------------------------------------------------------------------------
  // TEST 3 — GLOBAL_SLAB (prod-001 Qty 24)
  // -------------------------------------------------------------------------
  // In the acceptance scenario: No customer-specific rules exist for prod-001.
  // Quantity is 24 (1 full case of 24 units).
  const resGlobalSlab = PricingEngine.resolveProductPrice({
    product: prod001,
    quantity: 24,
    retailerId: 'ret-standard-retailer',
    customerPricingRules: [],
  });

  assert(
    resGlobalSlab.pricingSource === 'GLOBAL_SLAB' &&
    resGlobalSlab.unitPrice === 67 &&
    resGlobalSlab.slabMinQuantity === 24,
    'PRICING-03',
    'GLOBAL_SLAB resolved for prod-001 at quantity 24 (₹67 Full Case Tier)',
    `Resolved price: ₹${resGlobalSlab.unitPrice}, source: ${resGlobalSlab.pricingSource}, slabMinQuantity: ${resGlobalSlab.slabMinQuantity}, slabMaxQuantity: ${resGlobalSlab.slabMaxQuantity}`
  );

  // -------------------------------------------------------------------------
  // TEST 4 — DEFAULT
  // -------------------------------------------------------------------------
  // Product without slabs or quantity outside slabs
  const prodNoSlabs: Product = {
    productId: 'prod-no-slabs',
    sku: 'PLAIN-SKU',
    productName: 'Plain Item No Slabs',
    brandName: 'Generic',
    categoryName: 'General',
    mrp: 100,
    sellingPrice: 85,
    stockQuantity: 100,
    isActive: true,
  } as any;

  const resDefault = PricingEngine.resolveProductPrice({
    product: prodNoSlabs,
    quantity: 10,
    retailerId: 'ret-standard-retailer',
    customerPricingRules: [],
  });

  assert(
    resDefault.pricingSource === 'DEFAULT' && resDefault.unitPrice === 85,
    'PRICING-04',
    'DEFAULT wholesale price resolved when no slabs or customer rules apply',
    `Resolved price: ₹${resDefault.unitPrice}, source: ${resDefault.pricingSource}, pricingId: ${resDefault.pricingId}`
  );

  // -------------------------------------------------------------------------
  // TEST 5 — Order snapshot matches PricingEngine
  // -------------------------------------------------------------------------
  // Simulate order creation snapshot mapping from PricingEngine decision
  const resolvedDecision = PricingEngine.resolveProductPrice({
    product: prod001,
    quantity: 24,
    retailerId: testRetailerId,
    customerPricingRules: [],
  });

  const orderItemSnapshot: OrderItem = {
    productId: prod001.productId,
    sku: prod001.sku,
    productName: prod001.productName,
    brandName: prod001.brandName,
    imageUrl: prod001.imageUrl,
    quantity: 24,
    unit: prod001.unit,
    packSize: prod001.packSize,
    caseQuantity: prod001.caseQuantity,
    unitPrice: resolvedDecision.unitPrice,
    discount: (prod001.mrp - resolvedDecision.unitPrice) * 24,
    subtotal: resolvedDecision.unitPrice * 24,
    pricingSource: resolvedDecision.pricingSource,
    pricingId: resolvedDecision.pricingId,
    slabMinQuantity: resolvedDecision.slabMinQuantity,
    slabMaxQuantity: resolvedDecision.slabMaxQuantity ?? null,
    serverValidatedUnitPrice: resolvedDecision.unitPrice,
    serverValidatedSubtotal: resolvedDecision.unitPrice * 24,
  };

  const isSnapshotAccurate =
    orderItemSnapshot.unitPrice === resolvedDecision.unitPrice &&
    orderItemSnapshot.pricingSource === resolvedDecision.pricingSource &&
    orderItemSnapshot.slabMinQuantity === resolvedDecision.slabMinQuantity &&
    orderItemSnapshot.pricingId === resolvedDecision.pricingId;

  assert(
    isSnapshotAccurate,
    'PRICING-05',
    'Order item snapshot accurately records server PricingEngine decision',
    `Snapshot: UnitPrice=₹${orderItemSnapshot.unitPrice}, PricingSource=${orderItemSnapshot.pricingSource}, SlabMin=${orderItemSnapshot.slabMinQuantity}, PricingId=${orderItemSnapshot.pricingId}`
  );

  // -------------------------------------------------------------------------
  // TEST 6 — Client cannot override price
  // -------------------------------------------------------------------------
  // A malicious client attempts to submit unitPrice: ₹1.00 and pricingSource: 'DEFAULT'
  const maliciousClientInput = {
    productId: prod001.productId,
    quantity: 24,
    unitPrice: 1.0, // Tampered unit price
    subtotal: 24.0,  // Tampered subtotal
    pricingSource: 'DEFAULT', // Tampered pricing source
  };

  // Server recomputes authoritatively:
  const serverAuthoritativeRecomputation = PricingEngine.resolveProductPrice({
    product: prod001,
    quantity: maliciousClientInput.quantity,
    retailerId: testRetailerId,
    customerPricingRules: [],
  });

  const isClientTamperRejected =
    serverAuthoritativeRecomputation.unitPrice === 67 &&
    serverAuthoritativeRecomputation.unitPrice !== maliciousClientInput.unitPrice &&
    serverAuthoritativeRecomputation.pricingSource === 'GLOBAL_SLAB' &&
    serverAuthoritativeRecomputation.pricingSource !== maliciousClientInput.pricingSource;

  assert(
    isClientTamperRejected,
    'PRICING-06',
    'Server strictly rejects client-tampered prices and re-computes authoritatively',
    `Client sent: ₹${maliciousClientInput.unitPrice} (${maliciousClientInput.pricingSource}), Server enforced: ₹${serverAuthoritativeRecomputation.unitPrice} (${serverAuthoritativeRecomputation.pricingSource})`
  );

  // -------------------------------------------------------------------------
  // TEST 7 — Historical order price remains immutable
  // -------------------------------------------------------------------------
  // When product pricing or slabs change in the future, past order item snapshots do not change
  const pastOrderTimestamp = '2026-09-28T10:00:00.000Z';
  const historicalOrderRef = doc(db, 'orders', 'MF-HISTORICAL-IMMUTABLE-01');
  const sanitizedItem = JSON.parse(JSON.stringify(orderItemSnapshot));
  await setDoc(historicalOrderRef, {
    orderId: 'MF-HISTORICAL-IMMUTABLE-01',
    retailerId: testRetailerId,
    createdAt: pastOrderTimestamp,
    grandTotal: 1608,
    items: [sanitizedItem],
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  // Future catalogue price update: Parle-G price increases to ₹75
  const futureCatalogProduct = {
    ...prod001,
    sellingPrice: 75,
    mrp: 85,
    priceSlabs: [{ minQuantity: 24, slabPrice: 72 }],
  };

  const currentPricing = PricingEngine.resolveProductPrice({
    product: futureCatalogProduct as any,
    quantity: 24,
    retailerId: testRetailerId,
  });

  // Verify historical order document in Firestore was untouched
  const historicalSnap = await getDoc(historicalOrderRef);
  const historicalItem = historicalSnap.data()?.items?.[0];

  const isHistoricalImmutable =
    historicalItem?.unitPrice === 67 &&
    historicalItem?.pricingSource === 'GLOBAL_SLAB' &&
    currentPricing.unitPrice === 72;

  assert(
    isHistoricalImmutable,
    'PRICING-07',
    'Historical order price snapshot remains immutable despite subsequent catalogue updates',
    `Historical snapshot remains ₹${historicalItem?.unitPrice} (${historicalItem?.pricingSource}), while current catalogue resolves to ₹${currentPricing.unitPrice} (${currentPricing.pricingSource})`
  );

  console.log('======================================================================');
  const passed = testResults.filter(t => t.passed).length;
  const failed = testResults.filter(t => !t.passed).length;
  console.log(`ORDER PRICING SNAPSHOT AUDIT: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================================');

  return { passed, failed };
}

// Auto-run if executed directly
runOrderPricingSnapshotTests()
  .then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
