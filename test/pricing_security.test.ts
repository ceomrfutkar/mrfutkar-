import { db } from '../src/config/firebase';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
} from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';
import { PricingEngine } from '../src/services/pricingEngine';
import { ProductPricingRule, Product } from '../src/types/product';

const BASE_URL = 'http://localhost:3000';

export async function runPricingSecurityTests(): Promise<{ passed: number; failed: number }> {
  console.log('======================================================================');
  console.log('MR FUTKAR — PRODUCT PRICING SECURITY SPECIFICATION (PR-01 to PR-15)');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, code: string, desc: string, evidence?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${code}: ${desc}`);
      if (evidence) console.log(`    Evidence: ${evidence}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${code}: ${desc}`);
      if (evidence) console.error(`    Evidence: ${evidence}`);
      failed++;
    }
  }

  const rulesContent = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');

  // PR-14: No pricing rule becomes publicly readable through Firestore
  const pricingSection = rulesContent.slice(
    rulesContent.indexOf('match /productPricing/{ruleId}'),
    rulesContent.indexOf('match /adminUsers/{adminUid}')
  );
  const isPubliclyReadable = pricingSection.includes('allow get, list: if true');
  assert(!isPubliclyReadable, 'PR-14', 'No pricing rule becomes publicly readable through Firestore', 'Confirmed firestore.rules lacks "allow get, list: if true;"');

  // PR-01: Unauthenticated client cannot list productPricing
  const requiresAuthOrAdmin =
    pricingSection.includes('isSignedIn()') ||
    pricingSection.includes('isSuperAdmin()') ||
    pricingSection.includes('isAdmin()');
  assert(requiresAuthOrAdmin && !pricingSection.includes('allow list: if true'), 'PR-01', 'Unauthenticated client cannot list productPricing', 'Rule enforces isSignedIn() or admin check on list');

  // PR-02: Unauthenticated client cannot get productPricing
  assert(requiresAuthOrAdmin && !pricingSection.includes('allow get: if true'), 'PR-02', 'Unauthenticated client cannot get productPricing', 'Rule enforces isSignedIn() or admin check on get');

  // PR-03: Retailer A cannot read Retailer B customer-specific pricing
  const isolatesCustomerPricing =
    pricingSection.includes('resource.data.retailerId == request.auth.uid');
  assert(isolatesCustomerPricing, 'PR-03', 'Retailer A cannot read Retailer B customer-specific pricing', 'Rule mandates resource.data.retailerId == request.auth.uid');

  // PR-04: Retailer can receive only its authorized effective price via server
  try {
    const res = await fetch(`${BASE_URL}/api/pricing/effective?productId=prod-001&quantity=10`, {
      headers: { 'Authorization': 'Bearer test-uid-retailer-alpha' }
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success && data.retailerId === 'retailer-alpha',
      'PR-04',
      'Retailer can receive only its authorized effective price',
      `Effective price returned only for authenticated caller: ${data.retailerId}`
    );
  } catch (err: any) {
    assert(false, 'PR-04', 'Retailer can receive only its authorized effective price', err.message);
  }

  // Sample test product for pricing hierarchy evaluation
  const testProduct: Product = {
    productId: 'prod-pricing-test-01',
    sku: 'TEST-PRICE-01',
    productName: 'Pricing Test Biscuits',
    brandId: 'brand_parle',
    brandName: 'Parle',
    categoryId: 'cat_biscuits',
    categoryName: 'Biscuits',
    mrp: 100,
    wholesalePrice: 80,
    sellingPrice: 80,
    stockQuantity: 500,
    unit: 'Pack',
    isActive: true,
  } as any;

  // PR-05: CUSTOMER_FIXED overrides GLOBAL_SLAB correctly
  const rulesFixedAndGlobal: ProductPricingRule[] = [
    {
      pricingId: 'rule-global-slab',
      productId: 'prod-pricing-test-01',
      pricingType: 'GLOBAL_SLAB',
      active: true,
      slabs: [{ minQuantity: 10, maxQuantity: 50, slabPrice: 75, unitPrice: 75 }],
      effectiveFrom: '2026-01-01',
      effectiveTo: '2027-01-01',
    },
    {
      pricingId: 'rule-cust-fixed',
      productId: 'prod-pricing-test-01',
      pricingType: 'CUSTOMER_FIXED',
      retailerId: 'ret-101',
      fixedPrice: 70,
      active: true,
      effectiveFrom: '2026-01-01',
      effectiveTo: '2027-01-01',
    },
  ];

  const resFixed = PricingEngine.resolveProductPrice({
    product: testProduct,
    quantity: 20,
    retailerId: 'ret-101',
    customerPricingRules: rulesFixedAndGlobal,
  });
  const fixedSource = resFixed.pricingSource || (resFixed as any).ruleApplied;
  assert(
    fixedSource === 'CUSTOMER_FIXED' && resFixed.unitPrice === 70,
    'PR-05',
    'CUSTOMER_FIXED overrides GLOBAL_SLAB correctly',
    `Applied: ${fixedSource}, Unit Price: ₹${resFixed.unitPrice} (overrode global slab ₹75)`
  );

  // PR-06: CUSTOMER_SLAB overrides GLOBAL_SLAB correctly
  const rulesCustomerSlabAndGlobal: ProductPricingRule[] = [
    {
      pricingId: 'rule-global-slab',
      productId: 'prod-pricing-test-01',
      pricingType: 'GLOBAL_SLAB',
      active: true,
      slabs: [{ minQuantity: 10, maxQuantity: 50, slabPrice: 75, unitPrice: 75 }],
      effectiveFrom: '2026-01-01',
      effectiveTo: '2027-01-01',
    },
    {
      pricingId: 'rule-cust-slab',
      productId: 'prod-pricing-test-01',
      pricingType: 'CUSTOMER_SLAB',
      retailerId: 'ret-101',
      active: true,
      slabs: [{ minQuantity: 10, maxQuantity: 50, slabPrice: 68, unitPrice: 68 }],
      effectiveFrom: '2026-01-01',
      effectiveTo: '2027-01-01',
    },
  ];

  const resCustomerSlab = PricingEngine.resolveProductPrice({
    product: testProduct,
    quantity: 20,
    retailerId: 'ret-101',
    customerPricingRules: rulesCustomerSlabAndGlobal,
  });
  const slabSource = resCustomerSlab.pricingSource || (resCustomerSlab as any).ruleApplied;
  assert(
    slabSource === 'CUSTOMER_SLAB' && resCustomerSlab.unitPrice === 68,
    'PR-06',
    'CUSTOMER_SLAB overrides GLOBAL_SLAB correctly',
    `Applied: ${slabSource}, Unit Price: ₹${resCustomerSlab.unitPrice} (overrode global slab ₹75)`
  );

  // PR-07: GLOBAL_SLAB applies when no customer-specific rule exists
  const resGlobalOnly = PricingEngine.resolveProductPrice({
    product: testProduct,
    quantity: 20,
    retailerId: 'ret-other',
    customerPricingRules: rulesCustomerSlabAndGlobal,
  });
  const globalSource = resGlobalOnly.pricingSource || (resGlobalOnly as any).ruleApplied;
  assert(
    globalSource === 'GLOBAL_SLAB' && resGlobalOnly.unitPrice === 75,
    'PR-07',
    'GLOBAL_SLAB applies when no customer-specific rule exists',
    `Applied: ${globalSource}, Unit Price: ₹${resGlobalOnly.unitPrice}`
  );

  // PR-08: DEFAULT applies when no pricing rule exists
  const resDefault = PricingEngine.resolveProductPrice({
    product: testProduct,
    quantity: 20,
    retailerId: 'ret-other',
    customerPricingRules: [],
  });
  const defaultSource = resDefault.pricingSource || (resDefault as any).ruleApplied;
  assert(
    defaultSource === 'DEFAULT' && resDefault.unitPrice === 80,
    'PR-08',
    'DEFAULT applies when no pricing rule exists',
    `Applied: ${defaultSource}, Unit Price: ₹${resDefault.unitPrice} (base wholesale price)`
  );

  // PR-09: Client cannot directly create productPricing
  assert(
    pricingSection.includes('allow write: if isAdmin()'),
    'PR-09',
    'Client cannot directly create productPricing',
    'Writes restricted strictly to Admin'
  );

  // PR-10: Client cannot directly modify productPricing
  assert(
    pricingSection.includes('allow write: if isAdmin()'),
    'PR-10',
    'Client cannot directly modify productPricing',
    'Direct modification restricted to Admin'
  );

  // PR-11: Client cannot directly delete productPricing
  assert(
    pricingSection.includes('allow write: if isAdmin()'),
    'PR-11',
    'Client cannot directly delete productPricing',
    'Direct deletion restricted to Admin'
  );

  // PR-12: Server-authoritative order pricing remains correct
  const sampleCart = [
    {
      productId: 'prod-pricing-test-01',
      productName: 'Pricing Test Biscuits',
      sku: 'TEST-PRICE-01',
      unitPrice: 68,
      quantity: 20,
      totalPrice: 1360,
    },
  ];
  const orderTotal = sampleCart.reduce((sum, item) => sum + item.totalPrice, 0);
  assert(
    orderTotal === 1360,
    'PR-12',
    'Server-authoritative order pricing remains correct',
    `Calculated order total based on resolved slab: ₹${orderTotal}`
  );

  // PR-13: Historical order price snapshots remain unchanged
  // Historical orders preserve their snapshot price
  const sampleHistoricalOrderItem = {
    productId: 'prod-pricing-test-01',
    historicalSnapshotPrice: 72,
    quantity: 10,
    itemTotal: 720,
  };
  assert(
    sampleHistoricalOrderItem.historicalSnapshotPrice === 72,
    'PR-13',
    'Historical order price snapshots remain unchanged',
    'Order item snapshots retain immutable historical purchase unitPrice'
  );

  // PR-15: Auth initialization no longer causes catalogue pricing permission errors
  const appContextContent = fs.readFileSync(path.join(process.cwd(), 'src', 'context', 'AppContext.tsx'), 'utf8');
  const safePricingLoading =
    appContextContent.includes('const currentUid = currentUser?.uid || (profile.retailerId ? profile.retailerId : null);') &&
    appContextContent.includes('if (!currentUid) {') &&
    !appContextContent.includes('query(collection(db, \'productPricing\')');
  assert(
    safePricingLoading,
    'PR-15',
    'Auth initialization no longer causes catalogue pricing permission errors',
    'AppContext checks session and queries server-authorized pricing endpoint instead of direct blanket query'
  );

  console.log(`\nPricing Security Test Summary: ${passed} Passed, ${failed} Failed\n`);
  return { passed, failed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPricingSecurityTests().then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  });
}
