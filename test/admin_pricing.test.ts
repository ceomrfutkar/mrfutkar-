/**
 * MR FUTKAR — Phase 3B-3 Super Admin Pricing Management Test Suite
 * Live runtime integration + Authoritative business logic verification.
 */

import { db } from '../src/config/firebase';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  deleteDoc,
} from 'firebase/firestore';
import {
  validatePricingRulePayload,
  checkPricingConflicts,
  roundToTwoDecimals,
  validateSlabsArray,
} from '../server/adminPricingValidation';
import { PricingEngine } from '../src/services/pricingEngine';
import { ProductPricingRule, Product, PriceSlab } from '../src/types/product';

const BASE_URL = 'http://localhost:3000';

async function runAdminPricingTests() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 3B-3 SUPER ADMIN PRICING MANAGEMENT TEST SUITE');
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

  // --- ENSURE TEST IDENTITIES & SEED DATA ---
  // 1. Super Admin
  const existingAdmin = await getDoc(doc(db, 'adminUsers', 'SUPER-ADMIN-01'));
  if (!existingAdmin.exists()) {
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

  // 2. Suspended Admin
  const existingSuspended = await getDoc(doc(db, 'adminUsers', 'ADMIN-SUSPENDED-01'));
  if (!existingSuspended.exists()) {
    await setDoc(doc(db, 'adminUsers', 'ADMIN-SUSPENDED-01'), {
      uid: 'ADMIN-SUSPENDED-01',
      name: 'Suspended Admin',
      mobile: '+919810099991',
      email: 'suspended@mrfutkar.in',
      role: 'SUPER_ADMIN',
      status: 'SUSPENDED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'SYSTEM_BOOTSTRAP',
      permissionsVersion: 1,
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    });
  }

  // 3. Disabled Admin
  const existingDisabled = await getDoc(doc(db, 'adminUsers', 'ADMIN-DISABLED-01'));
  if (!existingDisabled.exists()) {
    await setDoc(doc(db, 'adminUsers', 'ADMIN-DISABLED-01'), {
      uid: 'ADMIN-DISABLED-01',
      name: 'Disabled Admin',
      mobile: '+919810099992',
      email: 'disabled@mrfutkar.in',
      role: 'SUPER_ADMIN',
      status: 'DISABLED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'SYSTEM_BOOTSTRAP',
      permissionsVersion: 1,
      _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
    });
  }

  const runId = Date.now().toString(36);
  const testProductId = `prod-pricing-test-${runId}`;
  const customerAlpha = `retailer-alpha-${runId}`;
  const customerBeta = `retailer-beta-${runId}`;

  // Seed test product in firestore
  await setDoc(doc(db, 'products', testProductId), {
    id: testProductId,
    productId: testProductId,
    productName: `Tata Tea Gold 500g Test ${runId}`,
    brandName: 'Tata Tea',
    category: 'Beverages',
    subCategory: 'Tea',
    sku: `SKU-TEA-${runId.toUpperCase()}`,
    barcode: `890100${Date.now().toString().slice(-7)}`,
    mrp: 140,
    wholesalePrice: 115,
    sellingPrice: 115,
    packSize: '500g',
    unit: 'pack',
    moq: 1,
    caseQuantity: 20,
    stockQuantity: 200,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    _serverTxnToken: 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01',
  });

  // -------------------------------------------------------------------------
  // 1. Validation & Boundary Enforcement Logic
  // -------------------------------------------------------------------------
  console.log('--- 1. Validation & Boundary Enforcement ---');

  // V-01: Reject quantityFrom < 1
  const v1 = validateSlabsArray([
    { minQuantity: 0, maxQuantity: 10, unitPrice: 80 },
  ]);
  assert(
    !v1.valid && v1.errors.some(e => e.message.includes('greater than or equal to 1')),
    'PRICING-VAL-01',
    'Reject quantityFrom < 1',
    `Rejected with error: ${v1.errors[0]?.message}`
  );

  // V-02: Reject quantityTo <= quantityFrom
  const v2 = validateSlabsArray([
    { minQuantity: 10, maxQuantity: 5, unitPrice: 80 },
  ]);
  assert(
    !v2.valid && v2.errors.some(e => e.message.includes('strictly greater')),
    'PRICING-VAL-02',
    'Reject quantityTo <= quantityFrom',
    `Rejected with error: ${v2.errors[0]?.message}`
  );

  // V-03: Allow open-ended slab (quantityTo == null) on the highest slab
  const v3 = validateSlabsArray([
    { minQuantity: 1, maxQuantity: 10, unitPrice: 80 },
    { minQuantity: 11, maxQuantity: null, unitPrice: 75 },
  ]);
  assert(
    v3.valid && v3.slabs?.[1]?.maxQuantity === null,
    'PRICING-VAL-03',
    'Allow open-ended slab with null maxQuantity on highest tier',
    'Slabs validated successfully with open upper bound'
  );

  // V-04: Disallow open-ended slab if followed by subsequent slabs
  const v4 = validateSlabsArray([
    { minQuantity: 1, maxQuantity: null, unitPrice: 80 },
    { minQuantity: 11, maxQuantity: 20, unitPrice: 75 },
  ]);
  assert(
    !v4.valid && v4.errors.some(e => e.message.includes('must be the last slab')),
    'PRICING-VAL-04',
    'Disallow open-ended slab if followed by subsequent slabs',
    `Rejected with error: ${v4.errors[0]?.message}`
  );

  // V-05: Reject negative slab unit price
  const v5 = validateSlabsArray([
    { minQuantity: 1, maxQuantity: 10, unitPrice: -5 },
  ]);
  assert(
    !v5.valid && v5.errors.some(e => e.message.includes('non-negative')),
    'PRICING-VAL-05',
    'Reject negative slab unit price',
    `Rejected negative price: ${v5.errors[0]?.message}`
  );

  // V-06: Reject internal overlap within slab set (e.g. 1-10 and 8-20)
  const v6 = validateSlabsArray([
    { minQuantity: 1, maxQuantity: 10, unitPrice: 80 },
    { minQuantity: 8, maxQuantity: 20, unitPrice: 75 },
  ]);
  assert(
    !v6.valid && v6.errors.some(e => e.message.includes('Overlap detected')),
    'PRICING-VAL-06',
    'Reject internal overlaps between slab ranges',
    `Overlap detected: ${v6.errors[0]?.message}`
  );

  // V-07: Round prices strictly to 2 decimal places
  const rounded = roundToTwoDecimals(75.3456);
  assert(
    rounded === 75.35,
    'PRICING-VAL-07',
    'Strict 2-decimal monetary rounding',
    `75.3456 rounded to: ₹${rounded}`
  );

  // V-08: CUSTOMER_SLAB payload requires customer (retailerId)
  const v8 = validatePricingRulePayload({
    productId: testProductId,
    pricingType: 'CUSTOMER_SLAB',
    retailerId: '',
    slabs: [{ minQuantity: 1, maxQuantity: 10, unitPrice: 70 }],
  });
  assert(
    !v8.success && v8.errors.some(e => e.field === 'retailerId'),
    'PRICING-VAL-08',
    'Customer-specific rules require non-empty retailerId',
    `Validation error: ${v8.errorSummary}`
  );

  // V-09: CUSTOMER_FIXED requires non-negative fixedPrice
  const v9 = validatePricingRulePayload({
    productId: testProductId,
    pricingType: 'CUSTOMER_FIXED',
    retailerId: 'ret-123',
    fixedPrice: -10,
  });
  assert(
    !v9.success && v9.errors.some(e => e.field === 'fixedPrice'),
    'PRICING-VAL-09',
    'CUSTOMER_FIXED rejects negative fixedPrice',
    `Validation error: ${v9.errorSummary}`
  );

  // -------------------------------------------------------------------------
  // 2. Conflict & Overlap Detection Across Active Rules
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Conflict & Overlap Detection ---');

  const existingGlobalRule: ProductPricingRule = {
    id: 'rule-global-01',
    productId: testProductId,
    pricingType: 'GLOBAL_SLAB',
    slabs: [
      { minQuantity: 1, maxQuantity: 10, unitPrice: 110 },
      { minQuantity: 11, maxQuantity: null, unitPrice: 105 },
    ],
    active: true,
  };

  const existingCustSlabRule: ProductPricingRule = {
    id: 'rule-cust-slab-01',
    productId: testProductId,
    retailerId: customerAlpha,
    pricingType: 'CUSTOMER_SLAB',
    slabs: [
      { minQuantity: 1, maxQuantity: 20, unitPrice: 100 },
      { minQuantity: 21, maxQuantity: null, unitPrice: 95 },
    ],
    active: true,
  };

  const existingRules = [existingGlobalRule, existingCustSlabRule];

  // C-01: Detect overlap when creating a second active GLOBAL_SLAB with overlapping ranges
  const c1 = checkPricingConflicts({
    existingRules,
    productId: testProductId,
    retailerId: null,
    pricingType: 'GLOBAL_SLAB',
    slabs: [{ minQuantity: 5, maxQuantity: 15, unitPrice: 108 }],
  });
  assert(
    c1.hasConflict && c1.conflictingRuleId === 'rule-global-01',
    'PRICING-CONF-01',
    'Detect conflict with existing active GLOBAL_SLAB overlapping ranges',
    c1.conflictReason
  );

  // C-02: Allow global slab if existing rule is excluded (self-update)
  const c2 = checkPricingConflicts({
    existingRules,
    ruleIdToExclude: 'rule-global-01',
    productId: testProductId,
    retailerId: null,
    pricingType: 'GLOBAL_SLAB',
    slabs: [{ minQuantity: 1, maxQuantity: 10, unitPrice: 109 }],
  });
  assert(
    !c2.hasConflict,
    'PRICING-CONF-02',
    'Allow updating existing rule by excluding self from conflict check',
    'No false-positive conflict detected'
  );

  // C-03: Detect conflict when creating duplicate active CUSTOMER_FIXED for customerAlpha
  const c3 = checkPricingConflicts({
    existingRules: [
      ...existingRules,
      {
        id: 'rule-cust-fixed-01',
        productId: testProductId,
        retailerId: customerAlpha,
        pricingType: 'CUSTOMER_FIXED',
        fixedPrice: 102,
        active: true,
      },
    ],
    productId: testProductId,
    retailerId: customerAlpha,
    pricingType: 'CUSTOMER_FIXED',
    fixedPrice: 98,
  });
  assert(
    c3.hasConflict && c3.conflictingRuleId === 'rule-cust-fixed-01',
    'PRICING-CONF-03',
    'Detect duplicate active CUSTOMER_FIXED conflict for same customer and product',
    c3.conflictReason
  );

  // C-04: Permit rules for different customers without conflict
  const c4 = checkPricingConflicts({
    existingRules,
    productId: testProductId,
    retailerId: customerBeta,
    pricingType: 'CUSTOMER_SLAB',
    slabs: [{ minQuantity: 1, maxQuantity: 10, unitPrice: 102 }],
  });
  assert(
    !c4.hasConflict,
    'PRICING-CONF-04',
    'Permit rules for different customers without conflict',
    'CustomerBeta allowed separate negotiated slab'
  );

  // -------------------------------------------------------------------------
  // 3. Authoritative Pricing Precedence Hierarchy
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Authoritative Pricing Precedence Hierarchy ---');

  const testProductObj: any = {
    id: testProductId,
    productId: testProductId,
    productName: 'Tata Tea Gold 500g Test',
    brandName: 'Tata Tea',
    category: 'Beverages',
    subcategoryName: 'Tea',
    sku: 'TEA-TEST',
    barcode: '890100TEST',
    mrp: 140,
    wholesalePrice: 115,
    packSize: '500g',
    unit: 'pack',
    moq: 1,
    caseQuantity: 20,
    stockQuantity: 200,
    isActive: true,
  };

  const hierarchyRules: ProductPricingRule[] = [
    {
      id: 'rule-h-global',
      productId: testProductId,
      pricingType: 'GLOBAL_SLAB',
      slabs: [
        { minQuantity: 1, maxQuantity: 10, unitPrice: 110 },
        { minQuantity: 11, maxQuantity: null, unitPrice: 105 },
      ],
      active: true,
    },
    {
      id: 'rule-h-cust-fixed',
      productId: testProductId,
      retailerId: customerAlpha,
      pricingType: 'CUSTOMER_FIXED',
      fixedPrice: 102,
      active: true,
    },
    {
      id: 'rule-h-cust-slab',
      productId: testProductId,
      retailerId: customerAlpha,
      pricingType: 'CUSTOMER_SLAB',
      slabs: [
        { minQuantity: 1, maxQuantity: 5, unitPrice: 98 },
        { minQuantity: 6, maxQuantity: null, unitPrice: 95 },
      ],
      active: true,
    },
  ];

  // H-01: Tier 1 CUSTOMER_SLAB overrides Tier 2 CUSTOMER_FIXED and Tier 3 GLOBAL_SLAB
  const r1 = PricingEngine.resolveProductPrice({
    product: testProductObj,
    quantity: 2,
    retailerId: customerAlpha,
    customerPricingRules: hierarchyRules,
  });
  assert(
    r1.pricingSource === 'CUSTOMER_SLAB' && r1.unitPrice === 98 && r1.pricingId === 'rule-h-cust-slab',
    'PRICING-PREC-01',
    'CUSTOMER_SLAB has top precedence over CUSTOMER_FIXED and GLOBAL_SLAB',
    `Resolved source: ${r1.pricingSource}, Unit Price: ₹${r1.unitPrice}`
  );

  // H-02: If CUSTOMER_SLAB is deactivated, CUSTOMER_FIXED takes precedence over GLOBAL_SLAB
  const rulesWithoutCustSlab = hierarchyRules.map(r =>
    r.pricingType === 'CUSTOMER_SLAB' ? { ...r, active: false } : r
  );
  const r2 = PricingEngine.resolveProductPrice({
    product: testProductObj,
    quantity: 2,
    retailerId: customerAlpha,
    customerPricingRules: rulesWithoutCustSlab,
  });
  assert(
    r2.pricingSource === 'CUSTOMER_FIXED' && r2.unitPrice === 102 && r2.pricingId === 'rule-h-cust-fixed',
    'PRICING-PREC-02',
    'CUSTOMER_FIXED takes precedence when CUSTOMER_SLAB is inactive',
    `Resolved source: ${r2.pricingSource}, Unit Price: ₹${r2.unitPrice}`
  );

  // H-03: For customerBeta (no custom contract), GLOBAL_SLAB applies
  const r3 = PricingEngine.resolveProductPrice({
    product: testProductObj,
    quantity: 15,
    retailerId: customerBeta,
    customerPricingRules: hierarchyRules,
  });
  assert(
    r3.pricingSource === 'GLOBAL_SLAB' && r3.unitPrice === 105 && r3.pricingId === 'rule-h-global',
    'PRICING-PREC-03',
    'GLOBAL_SLAB applies when customer has no custom contract',
    `Resolved source: ${r3.pricingSource}, Unit Price: ₹${r3.unitPrice} for Qty 15`
  );

  // H-04: If no rules match or exist, DEFAULT catalogue wholesalePrice applies
  const r4 = PricingEngine.resolveProductPrice({
    product: testProductObj,
    quantity: 5,
    retailerId: 'unmatched-retailer',
    customerPricingRules: [],
  });
  assert(
    r4.pricingSource === 'DEFAULT' && r4.unitPrice === testProductObj.wholesalePrice,
    'PRICING-PREC-04',
    'DEFAULT applies when no pricing rules exist',
    `Resolved source: ${r4.pricingSource}, Unit Price: ₹${r4.unitPrice}`
  );

  // -------------------------------------------------------------------------
  // 4. Live API Authorization & RBAC Enforcement
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Live API Authorization & RBAC ---');

  // RBAC-01: Unauthenticated request rejected with 401
  const resUnauth = await fetch(`${BASE_URL}/api/admin/pricing`);
  const dataUnauth = await resUnauth.json();
  assert(
    resUnauth.status === 401 && dataUnauth.error === 'UNAUTHORIZED',
    'PRICING-RBAC-01',
    'Unauthenticated access rejected with 401 UNAUTHORIZED',
    `HTTP Status: ${resUnauth.status}`
  );

  // RBAC-02: Retailer token rejected with 403
  const resRetailer = await fetch(`${BASE_URL}/api/admin/pricing`, {
    headers: { Authorization: 'Bearer test-uid-retailer-001' },
  });
  const dataRetailer = await resRetailer.json();
  assert(
    resRetailer.status === 403 && dataRetailer.error === 'FORBIDDEN',
    'PRICING-RBAC-02',
    'Retailer blocked from Super Admin pricing with 403 FORBIDDEN',
    `HTTP Status: ${resRetailer.status}`
  );

  // RBAC-03: Suspended admin rejected with 403
  const resSuspended = await fetch(`${BASE_URL}/api/admin/pricing`, {
    headers: { Authorization: 'Bearer test-uid-ADMIN-SUSPENDED-01' },
  });
  assert(
    resSuspended.status === 403,
    'PRICING-RBAC-03',
    'Suspended Super Admin blocked with 403',
    `HTTP Status: ${resSuspended.status}`
  );

  // RBAC-04: Disabled admin rejected with 403
  const resDisabled = await fetch(`${BASE_URL}/api/admin/pricing`, {
    headers: { Authorization: 'Bearer test-uid-ADMIN-DISABLED-01' },
  });
  assert(
    resDisabled.status === 403,
    'PRICING-RBAC-04',
    'Disabled Super Admin blocked with 403',
    `HTTP Status: ${resDisabled.status}`
  );

  // RBAC-05: SUPER_ADMIN can list pricing rules
  const adminHeaders = {
    Authorization: 'Bearer test-uid-SUPER-ADMIN-01',
    'Content-Type': 'application/json',
  };
  const resList = await fetch(`${BASE_URL}/api/admin/pricing`, { headers: adminHeaders });
  const dataList = await resList.json();
  const total = dataList.totalCount ?? dataList.pagination?.total ?? 0;
  assert(
    resList.status === 200 && dataList.success === true && Array.isArray(dataList.rules),
    'PRICING-RBAC-05',
    'SUPER_ADMIN can list pricing rules with pagination',
    `Found ${dataList.rules.length} rules, total: ${total}`
  );

  // -------------------------------------------------------------------------
  // 5. Query Security & Pagination Hard Bounds
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Query Security & Pagination Bounds ---');

  // SEC-01: Unwhitelisted query param rejected with 400
  const resBadParam = await fetch(`${BASE_URL}/api/admin/pricing?arbitraryInjection=hack`, {
    headers: adminHeaders,
  });
  const dataBadParam = await resBadParam.json();
  assert(
    resBadParam.status === 400 && dataBadParam.error === 'INVALID_QUERY_PARAMETERS',
    'PRICING-SEC-01',
    'Unwhitelisted query parameters strictly rejected with 400',
    `Error: ${dataBadParam.message}`
  );

  // SEC-02: Page size clamped to maximum bound of 100
  const resBigPage = await fetch(`${BASE_URL}/api/admin/pricing?pageSize=500`, {
    headers: adminHeaders,
  });
  const dataBigPage = await resBigPage.json();
  assert(
    resBigPage.status === 200 && dataBigPage.pagination.pageSize === 100,
    'PRICING-SEC-02',
    'Page size clamped to maximum allowed 100',
    `Requested 500, received: ${dataBigPage.pagination.pageSize}`
  );

  // -------------------------------------------------------------------------
  // 6. Live Rule Creation, Update, Conflict Detection, and Lifecycle
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Live Rule Creation & Lifecycle ---');

  let createdGlobalRuleId = '';
  let createdCustSlabRuleId = '';
  let createdCustFixedRuleId = '';

  // CRUD-01: Create GLOBAL_SLAB via API
  const resCreateGlobal = await fetch(`${BASE_URL}/api/admin/pricing`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      productId: testProductId,
      pricingType: 'GLOBAL_SLAB',
      slabs: [
        { minQuantity: 1, maxQuantity: 5, unitPrice: 112 },
        { minQuantity: 6, maxQuantity: 12, unitPrice: 108 },
        { minQuantity: 13, maxQuantity: null, unitPrice: 104 },
      ],
      priority: 1,
      notes: 'Test Global Slab',
    }),
  });
  const dataCreateGlobal = await resCreateGlobal.json();
  createdGlobalRuleId = dataCreateGlobal.rule?.id || dataCreateGlobal.rule?.pricingId;
  assert(
    resCreateGlobal.status === 201 && dataCreateGlobal.success === true && !!createdGlobalRuleId,
    'PRICING-CRUD-01',
    'Create valid GLOBAL_SLAB rule via API',
    `Rule ID: ${createdGlobalRuleId}`
  );

  // CRUD-02: Conflict check prevents overlapping active GLOBAL_SLAB
  const resDupGlobal = await fetch(`${BASE_URL}/api/admin/pricing`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      productId: testProductId,
      pricingType: 'GLOBAL_SLAB',
      slabs: [{ minQuantity: 4, maxQuantity: 10, unitPrice: 109 }],
    }),
  });
  const dataDupGlobal = await resDupGlobal.json();
  assert(
    resDupGlobal.status === 409 && dataDupGlobal.error === 'CONFLICTING_PRICING_RULE',
    'PRICING-CRUD-02',
    'Server rejects overlapping active GLOBAL_SLAB with 409 CONFLICTING_PRICING_RULE',
    dataDupGlobal.message
  );

  // CRUD-03: Create CUSTOMER_SLAB via API for customerAlpha
  const resCreateCustSlab = await fetch(`${BASE_URL}/api/admin/pricing`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      productId: testProductId,
      pricingType: 'CUSTOMER_SLAB',
      retailerId: customerAlpha,
      customerName: 'Alpha Kirana Store',
      slabs: [
        { minQuantity: 1, maxQuantity: 10, unitPrice: 100 },
        { minQuantity: 11, maxQuantity: null, unitPrice: 95 },
      ],
      priority: 10,
    }),
  });
  const dataCreateCustSlab = await resCreateCustSlab.json();
  createdCustSlabRuleId = dataCreateCustSlab.rule?.id || dataCreateCustSlab.rule?.pricingId;
  assert(
    resCreateCustSlab.status === 201 && dataCreateCustSlab.success === true && !!createdCustSlabRuleId,
    'PRICING-CRUD-03',
    'Create valid CUSTOMER_SLAB rule via API',
    `Rule ID: ${createdCustSlabRuleId}`
  );

  // CRUD-04: Create CUSTOMER_FIXED via API for customerAlpha
  const resCreateCustFixed = await fetch(`${BASE_URL}/api/admin/pricing`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      productId: testProductId,
      pricingType: 'CUSTOMER_FIXED',
      retailerId: customerAlpha,
      fixedPrice: 103,
      priority: 5,
    }),
  });
  const dataCreateCustFixed = await resCreateCustFixed.json();
  createdCustFixedRuleId = dataCreateCustFixed.rule?.id || dataCreateCustFixed.rule?.pricingId;
  assert(
    resCreateCustFixed.status === 201 && dataCreateCustFixed.success === true && !!createdCustFixedRuleId,
    'PRICING-CRUD-04',
    'Create valid CUSTOMER_FIXED rule via API',
    `Rule ID: ${createdCustFixedRuleId}`
  );

  // CRUD-05: Duplicate active CUSTOMER_FIXED for customerAlpha rejected with 409
  const resDupCustFixed = await fetch(`${BASE_URL}/api/admin/pricing`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      productId: testProductId,
      pricingType: 'CUSTOMER_FIXED',
      retailerId: customerAlpha,
      fixedPrice: 99,
    }),
  });
  const dataDupCustFixed = await resDupCustFixed.json();
  assert(
    resDupCustFixed.status === 409 && dataDupCustFixed.error === 'CONFLICTING_PRICING_RULE',
    'PRICING-CRUD-05',
    'Server rejects duplicate active CUSTOMER_FIXED for same customer with 409',
    dataDupCustFixed.message
  );

  // CRUD-06: Authoritative Effective-Price Preview Tool
  const resPreviewCustAlpha = await fetch(`${BASE_URL}/api/admin/pricing/preview`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      productId: testProductId,
      retailerId: customerAlpha,
      quantity: 5,
    }),
  });
  const dataPreviewCustAlpha = await resPreviewCustAlpha.json();
  assert(
    resPreviewCustAlpha.status === 200 &&
      dataPreviewCustAlpha.effectivePrice === 100 &&
      dataPreviewCustAlpha.pricingSource === 'CUSTOMER_SLAB',
    'PRICING-PREV-01',
    'Preview tool correctly resolves CUSTOMER_SLAB (₹100) over CUSTOMER_FIXED (₹103) & GLOBAL_SLAB',
    `Source: ${dataPreviewCustAlpha.pricingSource}, Price: ₹${dataPreviewCustAlpha.effectivePrice}`
  );

  // CRUD-07: Deactivate CUSTOMER_SLAB rule via PATCH /status
  const resDeactivate = await fetch(`${BASE_URL}/api/admin/pricing/${createdCustSlabRuleId}/status`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ active: false, reason: 'Deactivating slab to test fixed fallback' }),
  });
  const dataDeactivate = await resDeactivate.json();
  assert(
    resDeactivate.status === 200 && dataDeactivate.active === false,
    'PRICING-LIFECYCLE-01',
    'Deactivate rule via status patch',
    `Rule ${createdCustSlabRuleId} active: ${dataDeactivate.active}`
  );

  // CRUD-08: Effective price preview now resolves CUSTOMER_FIXED (₹103)
  const resPreviewAfterDeact = await fetch(`${BASE_URL}/api/admin/pricing/preview`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      productId: testProductId,
      retailerId: customerAlpha,
      quantity: 5,
    }),
  });
  const dataPreviewAfterDeact = await resPreviewAfterDeact.json();
  assert(
    resPreviewAfterDeact.status === 200 &&
      dataPreviewAfterDeact.effectivePrice === 103 &&
      dataPreviewAfterDeact.pricingSource === 'CUSTOMER_FIXED',
    'PRICING-PREV-02',
    'After CUSTOMER_SLAB deactivation, Preview resolves CUSTOMER_FIXED (₹103)',
    `Source: ${dataPreviewAfterDeact.pricingSource}, Price: ₹${dataPreviewAfterDeact.effectivePrice}`
  );

  // CRUD-09: Reactivate CUSTOMER_SLAB rule via PATCH /status
  const resReactivate = await fetch(`${BASE_URL}/api/admin/pricing/${createdCustSlabRuleId}/status`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ active: true, reason: 'Reactivating custom slab' }),
  });
  const dataReactivate = await resReactivate.json();
  assert(
    resReactivate.status === 200 && dataReactivate.active === true,
    'PRICING-LIFECYCLE-02',
    'Reactivate rule via status patch',
    `Rule ${createdCustSlabRuleId} active: ${dataReactivate.active}`
  );

  // -------------------------------------------------------------------------
  // 7. Security: Direct Client Writes & Audit Logs
  // -------------------------------------------------------------------------
  console.log('\n--- 7. Security Rules & Audit Logging ---');

  // SEC-03: Direct client-side write to productPricing rejected without server authority
  let directWriteCaught = false;
  try {
    await setDoc(doc(db, 'productPricing', 'direct-client-hack'), {
      productId: testProductId,
      pricingType: 'CUSTOMER_FIXED',
      fixedPrice: 1,
      active: true,
      // No server authority token
    });
  } catch (err: any) {
    directWriteCaught = true;
    assert(
      err.message.includes('permission') || err.message.includes('PERMISSION_DENIED'),
      'PRICING-SEC-03',
      'Client-side direct write to productPricing rejected by Firestore security rules',
      err.message
    );
  }
  if (!directWriteCaught) {
    assert(false, 'PRICING-SEC-03', 'Direct client write should have been rejected');
  }

  // SEC-04: Customer isolation - Customer Beta preview only receives GLOBAL_SLAB or DEFAULT
  const resPreviewBeta = await fetch(`${BASE_URL}/api/admin/pricing/preview`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      productId: testProductId,
      retailerId: customerBeta,
      quantity: 5,
    }),
  });
  const dataPreviewBeta = await resPreviewBeta.json();
  assert(
    resPreviewBeta.status === 200 &&
      dataPreviewBeta.pricingSource === 'GLOBAL_SLAB' &&
      dataPreviewBeta.effectivePrice === 112,
    'PRICING-ISOLATION-01',
    'Customer Beta receives GLOBAL_SLAB (₹112) without leaking Customer Alpha negotiated rates',
    `Source: ${dataPreviewBeta.pricingSource}, Price: ₹${dataPreviewBeta.effectivePrice}`
  );

  // AUDIT-01: Verify audit logs written for pricing mutations
  const resAuditLogs = await fetch(`${BASE_URL}/api/admin/pricing/audit-logs?targetId=${createdGlobalRuleId}`, {
    headers: adminHeaders,
  });
  const dataAuditLogs = await resAuditLogs.json();
  assert(
    resAuditLogs.status === 200 && dataAuditLogs.success === true && Array.isArray(dataAuditLogs.auditLogs),
    'PRICING-AUDIT-01',
    'Audit logs recorded for pricing mutations and retrievable by Super Admin',
    `Found ${dataAuditLogs.auditLogs.length} audit logs`
  );

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`Phase 3B-3 Pricing Tests Complete: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runAdminPricingTests().catch(err => {
  console.error('Fatal error in pricing test suite:', err);
  process.exit(1);
});
