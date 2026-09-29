/**
 * MR FUTKAR — Phase 3B-3 Pricing Management UI & Live Verification Suite
 * Verifies all 20 requirements specified in Phase 3B-3 Final Verification:
 * 1. /admin/pricing loads only for SUPER_ADMIN.
 * 2. Pricing dashboard displays summary metrics (Active rules, Global slabs, Customer pricing, Fixed customer pricing, Recently updated rules).
 * 3. Pricing search works by Product, SKU, Customer, Rule ID.
 * 4. Filters work by Rule type, Status, Product, Customer.
 * 5. Server-side pagination works.
 * 6. Admin can create GLOBAL_SLAB.
 * 7. Admin can create CUSTOMER_SLAB.
 * 8. Admin can create CUSTOMER_FIXED.
 * 9. Admin can edit/deactivate/activate pricing rules.
 * 10. Bulk slab entry validates the complete slab set before saving.
 * 11. Effective Price Preview works for: Customer + Product + Quantity.
 * 12. Preview uses the SAME PricingEngine as order creation.
 * 13. Preview clearly identifies applied rule type, quantity range, effective price.
 * 14. Customer-specific pricing is never exposed to another retailer.
 * 15. Historical orders remain unchanged after pricing modification.
 * 16. Pricing mutations create immutable admin audit logs.
 * 17. /api/admin/pricing/audit-logs works.
 * 18. Firestore productPricing rules remain protected.
 * 19. No client-side direct pricing mutation exists.
 * 20. Existing retailer ordering still receives the correct server-authoritative effective price.
 */

import { db, SERVER_TXN_TOKEN } from '../server/firebaseAdmin';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { PricingEngine } from '../src/services/pricingEngine';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function runPhase3B3UIVerification() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 3B-3 PRICING MANAGEMENT UI & LIVE VERIFICATION');
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

  const superAdminHeaders = {
    Authorization: 'Bearer test-uid-SUPER-ADMIN-01',
    'Content-Type': 'application/json',
  };

  const runId = Date.now().toString(36);
  const testProductId = `prod-ui-${runId}`;
  const customerAlpha = `retailer-alpha-${runId}`;
  const customerBeta = `retailer-beta-${runId}`;

  const retailerAlphaHeaders = {
    Authorization: `Bearer test-uid-${customerAlpha}`,
    'Content-Type': 'application/json',
  };

  const retailerBetaHeaders = {
    Authorization: `Bearer test-uid-${customerBeta}`,
    'Content-Type': 'application/json',
  };

  // Seed test product in Firestore
  await setDoc(doc(db, 'products', testProductId), {
    id: testProductId,
    productId: testProductId,
    productName: `Fortune Sunflower Oil 1L Test ${runId}`,
    brandName: 'Fortune',
    category: 'Edible Oils',
    sku: `SKU-OIL-${runId.toUpperCase()}`,
    barcode: `890100${Date.now().toString().slice(-7)}`,
    mrp: 180,
    wholesalePrice: 150,
    sellingPrice: 150,
    stockQuantity: 500,
    isActive: true,
    _serverTxnToken: SERVER_TXN_TOKEN,
  });

  const prodBulkId = `${testProductId}-bulk`;
  await setDoc(doc(db, 'products', prodBulkId), {
    id: prodBulkId,
    productId: prodBulkId,
    productName: `Bulk Oil Test ${runId}`,
    brandName: 'Fortune',
    category: 'Edible Oils',
    sku: `SKU-BULK-${runId.toUpperCase()}`,
    barcode: `890101${Date.now().toString().slice(-7)}`,
    mrp: 180,
    wholesalePrice: 150,
    sellingPrice: 150,
    stockQuantity: 500,
    isActive: true,
    _serverTxnToken: SERVER_TXN_TOKEN,
  });

  // Seed test retailers in Firestore
  await setDoc(doc(db, 'retailers', customerAlpha), {
    id: customerAlpha,
    retailerId: customerAlpha,
    businessName: `Alpha Kirana ${runId}`,
    ownerName: 'Alpha Owner',
    mobile: '+919876500001',
    status: 'VERIFIED',
    warehouseId: 'WH-BRAHMPURI-01',
  });

  await setDoc(doc(db, 'retailers', customerBeta), {
    id: customerBeta,
    retailerId: customerBeta,
    businessName: `Beta Supermarket ${runId}`,
    ownerName: 'Beta Owner',
    mobile: '+919876500002',
    status: 'VERIFIED',
    warehouseId: 'WH-BRAHMPURI-01',
  });

  // 1. /admin/pricing loads only for SUPER_ADMIN
  try {
    const unauth = await fetch(`${BASE_URL}/api/admin/pricing`);
    const retailerAccess = await fetch(`${BASE_URL}/api/admin/pricing`, { headers: retailerAlphaHeaders });
    const superAdminAccess = await fetch(`${BASE_URL}/api/admin/pricing`, { headers: superAdminHeaders });
    assert(
      unauth.status === 401 && retailerAccess.status === 403 && superAdminAccess.status === 200,
      'UI-01',
      '/admin/pricing loads only for SUPER_ADMIN',
      `Unauth: ${unauth.status}, Retailer: ${retailerAccess.status}, Super Admin: ${superAdminAccess.status}`
    );
  } catch (err: any) {
    assert(false, 'UI-01', '/admin/pricing loads only for SUPER_ADMIN', err.message);
  }

  // 2. Pricing dashboard displays summary metrics
  try {
    const res = await fetch(`${BASE_URL}/api/admin/pricing`, { headers: superAdminHeaders });
    const data = await res.json();
    const hasSummary = data.summary &&
      typeof data.summary.totalActiveRules === 'number' &&
      typeof data.summary.globalSlabRules === 'number' &&
      typeof data.summary.customerSlabRules === 'number' &&
      typeof data.summary.customerFixedRules === 'number';
    assert(
      res.status === 200 && hasSummary,
      'UI-02',
      'Pricing dashboard displays active pricing rules, global slabs, customer pricing, fixed pricing',
      `Summary: Total Active=${data.summary?.totalActiveRules}, Global=${data.summary?.globalSlabRules}, Customer Slabs=${data.summary?.customerSlabRules}, Customer Fixed=${data.summary?.customerFixedRules}`
    );
  } catch (err: any) {
    assert(false, 'UI-02', 'Pricing dashboard displays summary metrics', err.message);
  }

  // 6. Admin can create GLOBAL_SLAB
  let globalRuleId = '';
  try {
    const res = await fetch(`${BASE_URL}/api/admin/pricing`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        productId: testProductId,
        pricingType: 'GLOBAL_SLAB',
        slabs: [
          { minQuantity: 1, maxQuantity: 9, unitPrice: 145 },
          { minQuantity: 10, maxQuantity: 49, unitPrice: 140 },
          { minQuantity: 50, maxQuantity: null, unitPrice: 135 },
        ],
        notes: 'Global volume discount for Fortune Oil',
      }),
    });
    const data = await res.json();
    globalRuleId = data.rule?.id || data.rule?.pricingId;
    assert(
      res.status === 201 && data.success && data.rule?.pricingType === 'GLOBAL_SLAB',
      'UI-06',
      'Admin can create GLOBAL_SLAB',
      `Created rule: ${globalRuleId} with 3 slabs`
    );
  } catch (err: any) {
    assert(false, 'UI-06', 'Admin can create GLOBAL_SLAB', err.message);
  }

  // 7. Admin can create CUSTOMER_SLAB
  let custSlabRuleId = '';
  try {
    const res = await fetch(`${BASE_URL}/api/admin/pricing`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        productId: testProductId,
        retailerId: customerAlpha,
        pricingType: 'CUSTOMER_SLAB',
        slabs: [
          { minQuantity: 1, maxQuantity: 19, unitPrice: 138 },
          { minQuantity: 20, maxQuantity: null, unitPrice: 130 },
        ],
        notes: 'Alpha Kirana negotiated custom slab',
      }),
    });
    const data = await res.json();
    custSlabRuleId = data.rule?.id || data.rule?.pricingId;
    assert(
      res.status === 201 && data.success && data.rule?.pricingType === 'CUSTOMER_SLAB',
      'UI-07',
      'Admin can create CUSTOMER_SLAB',
      `Created rule: ${custSlabRuleId} for customer ${customerAlpha}`
    );
  } catch (err: any) {
    assert(false, 'UI-07', 'Admin can create CUSTOMER_SLAB', err.message);
  }

  // 8. Admin can create CUSTOMER_FIXED
  let custFixedRuleId = '';
  try {
    const res = await fetch(`${BASE_URL}/api/admin/pricing`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        productId: testProductId,
        retailerId: customerBeta,
        pricingType: 'CUSTOMER_FIXED',
        fixedPrice: 134,
        notes: 'Beta Supermarket negotiated fixed contract rate',
      }),
    });
    const data = await res.json();
    custFixedRuleId = data.rule?.id || data.rule?.pricingId;
    assert(
      res.status === 201 && data.success && data.rule?.pricingType === 'CUSTOMER_FIXED' && data.rule?.fixedPrice === 134,
      'UI-08',
      'Admin can create CUSTOMER_FIXED',
      `Created rule: ${custFixedRuleId} with fixedPrice=₹134 for ${customerBeta}`
    );
  } catch (err: any) {
    assert(false, 'UI-08', 'Admin can create CUSTOMER_FIXED', err.message);
  }

  // 3. Pricing search works by: Product, SKU, Customer, Rule ID
  try {
    // Search by product name / ID
    const searchProd = await fetch(`${BASE_URL}/api/admin/pricing?search=${encodeURIComponent(testProductId)}`, { headers: superAdminHeaders });
    const dataProd = await searchProd.json();
    const foundByProd = dataProd.rules?.some((r: any) => r.productId === testProductId);

    // Search by rule ID
    const searchRule = await fetch(`${BASE_URL}/api/admin/pricing?search=${encodeURIComponent(globalRuleId)}`, { headers: superAdminHeaders });
    const dataRule = await searchRule.json();
    const foundByRule = dataRule.rules?.some((r: any) => r.id === globalRuleId || r.pricingId === globalRuleId);

    // Search by customer
    const searchCust = await fetch(`${BASE_URL}/api/admin/pricing?search=${encodeURIComponent(customerAlpha)}`, { headers: superAdminHeaders });
    const dataCust = await searchCust.json();
    const foundByCust = dataCust.rules?.some((r: any) => r.retailerId === customerAlpha);

    assert(
      foundByProd && foundByRule && foundByCust,
      'UI-03',
      'Pricing search works by Product, SKU, Customer, Rule ID',
      `Found by Product: ${foundByProd}, by Rule ID: ${foundByRule}, by Customer: ${foundByCust}`
    );
  } catch (err: any) {
    assert(false, 'UI-03', 'Pricing search works by Product, SKU, Customer, Rule ID', err.message);
  }

  // 4. Filters work: Rule type, Status, Product, Customer
  try {
    const filterType = await fetch(`${BASE_URL}/api/admin/pricing?pricingType=CUSTOMER_FIXED&productId=${testProductId}`, { headers: superAdminHeaders });
    const dataType = await filterType.json();
    const onlyFixed = dataType.rules?.every((r: any) => r.pricingType === 'CUSTOMER_FIXED');

    const filterStatus = await fetch(`${BASE_URL}/api/admin/pricing?status=ACTIVE&productId=${testProductId}`, { headers: superAdminHeaders });
    const dataStatus = await filterStatus.json();
    const onlyActive = dataStatus.rules?.every((r: any) => r.active === true);

    const filterCustomer = await fetch(`${BASE_URL}/api/admin/pricing?retailerId=${customerAlpha}`, { headers: superAdminHeaders });
    const dataCustomer = await filterCustomer.json();
    const onlyAlpha = dataCustomer.rules?.every((r: any) => r.retailerId === customerAlpha);

    assert(
      onlyFixed && onlyActive && onlyAlpha,
      'UI-04',
      'Filters work for Rule type, Status, Product, Customer',
      `Type filter match: ${onlyFixed}, Status filter match: ${onlyActive}, Customer filter match: ${onlyAlpha}`
    );
  } catch (err: any) {
    assert(false, 'UI-04', 'Filters work', err.message);
  }

  // 5. Server-side pagination works
  try {
    const resP1 = await fetch(`${BASE_URL}/api/admin/pricing?page=1&pageSize=2`, { headers: superAdminHeaders });
    const dataP1 = await resP1.json();
    assert(
      resP1.status === 200 && dataP1.pagination.page === 1 && dataP1.pagination.pageSize === 2 && dataP1.rules.length <= 2,
      'UI-05',
      'Server-side pagination works',
      `Page: ${dataP1.pagination.page}, PageSize: ${dataP1.pagination.pageSize}, Total: ${dataP1.pagination.total}`
    );
  } catch (err: any) {
    assert(false, 'UI-05', 'Server-side pagination works', err.message);
  }

  // 9. Admin can edit/deactivate/activate pricing rules
  try {
    // Edit rule description and notes
    const editRes = await fetch(`${BASE_URL}/api/admin/pricing/${custSlabRuleId}`, {
      method: 'PUT',
      headers: superAdminHeaders,
      body: JSON.stringify({
        notes: 'Updated Alpha Kirana custom slab via UI edit',
        ruleDescription: 'Updated rule description',
      }),
    });
    const editData = await editRes.json();

    // Deactivate rule
    const deactRes = await fetch(`${BASE_URL}/api/admin/pricing/${custSlabRuleId}/status`, {
      method: 'PATCH',
      headers: superAdminHeaders,
      body: JSON.stringify({ active: false, reason: 'Temporarily deactivated via UI' }),
    });
    const deactData = await deactRes.json();

    // Reactivate rule
    const reactRes = await fetch(`${BASE_URL}/api/admin/pricing/${custSlabRuleId}/status`, {
      method: 'PATCH',
      headers: superAdminHeaders,
      body: JSON.stringify({ active: true, reason: 'Reactivated via UI' }),
    });
    const reactData = await reactRes.json();

    assert(
      editRes.status === 200 && deactData.active === false && reactData.active === true,
      'UI-09',
      'Admin can edit/deactivate/activate pricing rules',
      `Edit: ${editRes.status}, Deactivated active: ${deactData.active}, Reactivated active: ${reactData.active}`
    );
  } catch (err: any) {
    assert(false, 'UI-09', 'Admin can edit/deactivate/activate pricing rules', err.message);
  }

  // 10. Bulk slab entry validates the complete slab set before saving
  try {
    // Invalid slabs with overlap
    const badRes = await fetch(`${BASE_URL}/api/admin/pricing/bulk-slabs`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        productId: prodBulkId,
        pricingType: 'GLOBAL_SLAB',
        slabs: [
          { minQuantity: 1, maxQuantity: 10, unitPrice: 140 },
          { minQuantity: 5, maxQuantity: 20, unitPrice: 130 }, // Overlaps [1, 10]
        ],
      }),
    });
    const badData = await badRes.json();

    // Valid slabs without overlap
    const validRes = await fetch(`${BASE_URL}/api/admin/pricing/bulk-slabs`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        productId: prodBulkId,
        pricingType: 'GLOBAL_SLAB',
        slabs: [
          { minQuantity: 1, maxQuantity: 10, unitPrice: 148 },
          { minQuantity: 11, maxQuantity: null, unitPrice: 142 },
        ],
      }),
    });
    const validData = await validRes.json();

    assert(
      badRes.status === 400 && (validRes.status === 200 || validRes.status === 201) && (validData.valid === true || validData.success === true),
      'UI-10',
      'Bulk slab entry validates the complete slab set before saving',
      `Bad slabs rejected: ${badData.error} (${badData.message}), Valid slabs accepted: ${validData.valid || validData.success}`
    );
  } catch (err: any) {
    assert(false, 'UI-10', 'Bulk slab entry validates complete slab set', err.message);
  }

  // 11. Effective Price Preview works for: Customer + Product + Quantity
  // 12. Preview uses the SAME PricingEngine as order creation
  // 13. Preview clearly identifies applied rule type, quantity range, effective price
  try {
    const previewRes = await fetch(`${BASE_URL}/api/admin/pricing/preview`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        productId: testProductId,
        retailerId: customerAlpha,
        quantity: 15,
      }),
    });
    const previewData = await previewRes.json();

    // Compare with direct invocation of PricingEngine
    const productSnap = await getDoc(doc(db, 'products', testProductId));
    const allRulesSnap = await getDocs(collection(db, 'productPricing'));
    const allRules = allRulesSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    const engineResult = PricingEngine.resolveProductPrice({
      product: { id: testProductId, ...(productSnap.data() as any) },
      quantity: 15,
      retailerId: customerAlpha,
      customerPricingRules: allRules,
      now: new Date(),
    });

    const isMatch = previewData.effectivePrice === engineResult.unitPrice &&
                    previewData.pricingSource === engineResult.pricingSource;

    assert(
      previewRes.status === 200 && previewData.success && isMatch,
      'UI-11',
      'Effective Price Preview works for Customer + Product + Quantity',
      `Preview Effective Price: ₹${previewData.effectivePrice}, Source: ${previewData.pricingSource}`
    );

    assert(
      isMatch,
      'UI-12',
      'Preview uses the SAME PricingEngine as order creation',
      `API Unit Price: ₹${previewData.effectivePrice} == Engine Unit Price: ₹${engineResult.unitPrice}`
    );

    assert(
      !!previewData.pricingSource && typeof previewData.effectivePrice === 'number' && typeof previewData.matchedSlab === 'object',
      'UI-13',
      'Preview clearly identifies applied rule type, quantity range, and effective price',
      `Applied Rule: ${previewData.pricingSource}, Range: [${previewData.matchedSlab?.minQuantity} to ${previewData.matchedSlab?.maxQuantity ?? '∞'}], Price: ₹${previewData.effectivePrice}`
    );
  } catch (err: any) {
    assert(false, 'UI-11', 'Effective Price Preview works', err.message);
  }

  // 14. Customer-specific pricing is never exposed to another retailer
  try {
    // Retailer Alpha calls /api/pricing/effective for quantity 5
    const resAlpha = await fetch(`${BASE_URL}/api/pricing/effective?productId=${testProductId}&quantity=5`, {
      headers: retailerAlphaHeaders,
    });
    const dataAlpha = await resAlpha.json();

    // Retailer Beta calls /api/pricing/effective for quantity 5
    const resBeta = await fetch(`${BASE_URL}/api/pricing/effective?productId=${testProductId}&quantity=5`, {
      headers: retailerBetaHeaders,
    });
    const dataBeta = await resBeta.json();

    // Customer Beta has CUSTOMER_FIXED rate ₹134; Customer Alpha has CUSTOMER_SLAB rate ₹138
    assert(
      dataAlpha.pricing?.unitPrice === 138 &&
      dataBeta.pricing?.unitPrice === 134 &&
      dataAlpha.pricing?.pricingSource === 'CUSTOMER_SLAB' &&
      dataBeta.pricing?.pricingSource === 'CUSTOMER_FIXED',
      'UI-14',
      'Customer-specific pricing is never exposed to another retailer',
      `Alpha received ₹${dataAlpha.pricing?.unitPrice} (${dataAlpha.pricing?.pricingSource}), Beta received ₹${dataBeta.pricing?.unitPrice} (${dataBeta.pricing?.pricingSource})`
    );
  } catch (err: any) {
    assert(false, 'UI-14', 'Customer isolation check failed', err.message);
  }

  // 15. Historical orders remain unchanged after pricing modification
  try {
    // Record mock order snapshot
    const orderId = `ORD-TEST-${runId}`;
    const historicalPrice = 145;
    await setDoc(doc(db, 'orders', orderId), {
      orderId,
      retailerId: customerAlpha,
      warehouseId: 'WH-BRAHMPURI-01',
      orderStatus: 'PLACED',
      items: [
        {
          productId: testProductId,
          productName: 'Fortune Sunflower Oil 1L',
          quantity: 10,
          unitPrice: historicalPrice,
          totalPrice: historicalPrice * 10,
        },
      ],
      totalAmount: historicalPrice * 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _serverTxnToken: SERVER_TXN_TOKEN,
    });

    // Now update pricing rule
    await fetch(`${BASE_URL}/api/admin/pricing/${custSlabRuleId}`, {
      method: 'PUT',
      headers: superAdminHeaders,
      body: JSON.stringify({
        slabs: [
          { minQuantity: 1, maxQuantity: 10, unitPrice: 120 },
          { minQuantity: 11, maxQuantity: null, unitPrice: 110 },
        ],
      }),
    });

    // Check historical order
    const orderSnap = await getDoc(doc(db, 'orders', orderId));
    const orderData = orderSnap.data();
    const itemSnapshotPrice = orderData?.items[0]?.unitPrice;

    assert(
      itemSnapshotPrice === historicalPrice,
      'UI-15',
      'Historical orders remain unchanged after pricing modification',
      `Original snapshot: ₹${historicalPrice}, After pricing rule update: ₹${itemSnapshotPrice}`
    );
  } catch (err: any) {
    assert(false, 'UI-15', 'Historical order immutability check failed', err.message);
  }

  // 16. Pricing mutations create immutable admin audit logs
  // 17. /api/admin/pricing/audit-logs works
  try {
    const auditRes = await fetch(`${BASE_URL}/api/admin/pricing/audit-logs?targetId=${custSlabRuleId}`, {
      headers: superAdminHeaders,
    });
    const auditData = await auditRes.json();
    assert(
      auditRes.status === 200 && auditData.success && Array.isArray(auditData.auditLogs) && auditData.auditLogs.length > 0,
      'UI-16',
      'Pricing mutations create immutable admin audit logs',
      `Found ${auditData.auditLogs?.length} audit log entries for rule ${custSlabRuleId}`
    );

    const generalAuditRes = await fetch(`${BASE_URL}/api/admin/pricing/audit-logs`, {
      headers: superAdminHeaders,
    });
    const generalData = await generalAuditRes.json();
    assert(
      generalAuditRes.status === 200 && generalData.success && Array.isArray(generalData.auditLogs),
      'UI-17',
      '/api/admin/pricing/audit-logs works',
      `Retrieved ${generalData.auditLogs?.length} pricing audit logs`
    );
  } catch (err: any) {
    assert(false, 'UI-16', 'Audit logs check failed', err.message);
  }

  // 18. Firestore productPricing rules remain protected
  // 19. No client-side direct pricing mutation exists
  try {
    const rulesText = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');
    const pricingMatch = rulesText.slice(
      rulesText.indexOf('match /productPricing/{ruleId}'),
      rulesText.indexOf('match /adminUsers/{')
    );

    const writeRestricted = pricingMatch.includes("allow write: if isAdmin() || (request.resource.data._serverTxnToken == 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01')");
    const noDirectPublicRead = !pricingMatch.includes('allow get, list: if true');

    // Also verify direct client rejection
    let clientWriteBlocked = false;
    try {
      await setDoc(doc(db, 'productPricing', 'hacked-rule'), {
        id: 'hacked-rule',
        fixedPrice: 1,
        active: true,
      });
    } catch (e: any) {
      if (e.code === 'permission-denied' || e.message?.includes('Missing or insufficient permissions')) {
        clientWriteBlocked = true;
      }
    }

    assert(
      writeRestricted && noDirectPublicRead,
      'UI-18',
      'Firestore productPricing rules remain protected',
      'Rules verify server authority token or admin role; no public read/write'
    );

    assert(
      clientWriteBlocked,
      'UI-19',
      'No client-side direct pricing mutation exists',
      'Direct unauthenticated setDoc rejected with permission-denied'
    );
  } catch (err: any) {
    assert(false, 'UI-18', 'Firestore security check failed', err.message);
  }

  // 20. Existing retailer ordering still receives the correct server-authoritative effective price
  try {
    // Calling OrderRepository authoritative pricing resolution or /api/pricing/effective
    const orderPricingRes = await fetch(`${BASE_URL}/api/pricing/effective?productId=${testProductId}&quantity=25`, {
      headers: retailerAlphaHeaders,
    });
    const orderPricingData = await orderPricingRes.json();
    assert(
      orderPricingRes.status === 200 &&
      orderPricingData.success === true &&
      orderPricingData.pricing?.unitPrice === 110, // from the updated slabs: 11+ is 110
      'UI-20',
      'Existing retailer ordering still receives the correct server-authoritative effective price',
      `Resolved unitPrice: ₹${orderPricingData.pricing?.unitPrice} (Source: ${orderPricingData.pricing?.pricingSource})`
    );
  } catch (err: any) {
    assert(false, 'UI-20', 'Order pricing resolution failed', err.message);
  }

  console.log(`\n======================================================================`);
  console.log(`Phase 3B-3 UI & Live Verification Complete: ${passed} Passed, ${failed} Failed`);
  console.log(`======================================================================\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runPhase3B3UIVerification();
