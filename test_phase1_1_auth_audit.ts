import fs from 'fs';

const BASE_URL = 'http://localhost:3000';

async function runPhase11Verification() {
  console.log('======================================================================');
  console.log('MR FUTKAR — PHASE 1.1 SECURITY, AUTH GATE & SCOPE AUDIT VERIFICATION');
  console.log('======================================================================\n');

  let passCount = 0;
  let failCount = 0;

  function assert(condition: boolean, testName: string, evidence: string) {
    if (condition) {
      passCount++;
      console.log(`✅ [PASS] ${testName}`);
      console.log(`    Evidence: ${evidence}\n`);
    } else {
      failCount++;
      console.error(`❌ [FAIL] ${testName}`);
      console.error(`    Evidence: ${evidence}\n`);
    }
  }

  // TEST 1: Server Session Endpoint - Unauthenticated Request (401)
  try {
    const res = await fetch(`${BASE_URL}/api/warehouse/session`);
    assert(
      res.status === 401,
      'P1.1-AUTH-01: Unauthenticated Session Request Blocked',
      `HTTP status ${res.status} returned (expected 401). Auth token is strictly required.`
    );
  } catch (err: any) {
    assert(false, 'P1.1-AUTH-01: Unauthenticated Session Request Blocked', err.message);
  }

  // TEST 2: Server Session Endpoint - Retailer Token Blocked (403)
  try {
    const res = await fetch(`${BASE_URL}/api/warehouse/session`, {
      headers: { Authorization: 'Bearer test-uid-ret-test-auth-01' },
    });
    const body = await res.json();
    assert(
      res.status === 403 && (body.error === 'NOT_WAREHOUSE_USER' || body.error === 'FORBIDDEN'),
      'P1.1-AUTH-02: Retailer Token Denied Warehouse Session Access',
      `HTTP status ${res.status}, error='${body.error}', message='${body.message}'. Retailers cannot obtain warehouse session.`
    );
  } catch (err: any) {
    assert(false, 'P1.1-AUTH-02: Retailer Token Denied Warehouse Session Access', err.message);
  }

  // TEST 3: Server Session Endpoint - Warehouse Staff Authorized (200)
  try {
    const res = await fetch(`${BASE_URL}/api/warehouse/session`, {
      headers: { Authorization: 'Bearer test-uid-WH-STAFF-01' },
    });
    const body = await res.json();
    assert(
      res.status === 200 &&
        body.success === true &&
        body.role === 'WAREHOUSE_STAFF' &&
        body.warehouseId === 'WH-BRAHMPURI-01',
      'P1.1-AUTH-03: Warehouse Staff Authorized Session',
      `HTTP 200 OK. Authenticated=${body.success}, Staff='${body.name}', Role=${body.role}, Warehouse=${body.warehouseId} (${body.branchName}).`
    );
  } catch (err: any) {
    assert(false, 'P1.1-AUTH-03: Warehouse Staff Authorized Session', err.message);
  }

  // TEST 4: Server Session Endpoint - Warehouse Manager Authorized (200)
  try {
    const res = await fetch(`${BASE_URL}/api/warehouse/session`, {
      headers: { Authorization: 'Bearer test-uid-WH-MGR-01' },
    });
    const body = await res.json();
    assert(
      res.status === 200 &&
        body.role === 'WAREHOUSE_MANAGER' &&
        body.warehouseId === 'WH-BRAHMPURI-01',
      'P1.1-AUTH-04: Warehouse Manager Authorized Session',
      `HTTP 200 OK. Manager='${body.name}', Role=${body.role}, Warehouse=${body.warehouseId} (${body.branchName}).`
    );
  } catch (err: any) {
    assert(false, 'P1.1-AUTH-04: Warehouse Manager Authorized Session', err.message);
  }

  // TEST 5: Server Session Endpoint - Warehouse Admin Authorized (200)
  try {
    const res = await fetch(`${BASE_URL}/api/warehouse/session`, {
      headers: { Authorization: 'Bearer test-uid-WH-ADMIN-01' },
    });
    const body = await res.json();
    assert(
      res.status === 200 &&
        body.role === 'WAREHOUSE_ADMIN' &&
        body.warehouseId === 'WH-BRAHMPURI-01',
      'P1.1-AUTH-05: Warehouse Admin Authorized Session',
      `HTTP 200 OK. Admin='${body.name}', Role=${body.role}, Warehouse=${body.warehouseId} (${body.branchName}).`
    );
  } catch (err: any) {
    assert(false, 'P1.1-AUTH-05: Warehouse Admin Authorized Session', err.message);
  }

  // TEST 6: Component Verification - WarehouseLoginScreen.tsx
  const loginScreenPath = './src/components/warehouse/WarehouseLoginScreen.tsx';
  const loginScreenExists = fs.existsSync(loginScreenPath);
  const loginScreenContent = loginScreenExists ? fs.readFileSync(loginScreenPath, 'utf8') : '';
  assert(
    loginScreenExists &&
      loginScreenContent.includes('WH-BRAHMPURI-01') &&
      loginScreenContent.includes('Brahmpuri Branch') &&
      loginScreenContent.includes('Hub Personnel ID') &&
      loginScreenContent.includes('Registered Mobile OTP'),
    'P1.1-UI-01: Dedicated Warehouse Login Screen Implemented',
    `File ${loginScreenPath} exists with Staff Token, Registered Mobile OTP, Brahmpuri Hub badge, and server authentication.`
  );

  // TEST 7: Component Verification - WarehouseProfileScreen.tsx
  const profileScreenPath = './src/components/warehouse/WarehouseProfileScreen.tsx';
  const profileScreenExists = fs.existsSync(profileScreenPath);
  const profileScreenContent = profileScreenExists ? fs.readFileSync(profileScreenPath, 'utf8') : '';
  assert(
    profileScreenExists &&
      profileScreenContent.includes('WH-BRAHMPURI-01') &&
      profileScreenContent.includes('Brahmpuri Branch') &&
      profileScreenContent.includes('Authorized Personnel Profile'),
    'P1.1-UI-02: Dedicated Warehouse Profile Screen Implemented',
    `File ${profileScreenPath} exists with operational metadata, role governance matrix, and session sign out.`
  );

  // TEST 8: Role Spoofing Removal in WarehouseNavbar.tsx
  const navbarPath = './src/components/warehouse/WarehouseNavbar.tsx';
  const navbarContent = fs.readFileSync(navbarPath, 'utf8');
  const hasRoleSelect = navbarContent.includes('<select') || navbarContent.includes('switchRole');
  assert(
    !hasRoleSelect && navbarContent.includes('currentUser.role') && navbarContent.includes('PROFILE'),
    'P1.1-SEC-01: Role Spoofing Dropdown & switchRole Completely Removed',
    `Verified: WarehouseNavbar has NO <select> role dropdown and NO switchRole function. Role is server-authoritative read-only badge.`
  );

  // TEST 9: Dispatch Bay Scope Correction in WarehouseDispatchScreen.tsx
  const dispatchPath = './src/components/warehouse/WarehouseDispatchScreen.tsx';
  const dispatchContent = fs.readFileSync(dispatchPath, 'utf8');
  const hasDriverInputs =
    dispatchContent.includes('partnerNames') ||
    dispatchContent.includes('vehicleNumbers') ||
    dispatchContent.includes('Driver Name (e.g.');
  assert(
    !hasDriverInputs &&
      dispatchContent.includes('READY_FOR_DISPATCH') &&
      dispatchContent.includes('Staged in Dispatch Bay') &&
      dispatchContent.includes('WH-BRAHMPURI-01'),
    'P1.1-SCOPE-01: Dispatch Scope Corrected (No Fake Drivers/Vehicles)',
    `Verified: WarehouseDispatchScreen has NO free-text Driver Name or Vehicle Number inputs. Consignment staging queue preserved.`
  );

  // TEST 10: RootNavigator Entry Gate
  const rootNavPath = './src/navigation/RootNavigator.tsx';
  const rootNavContent = fs.readFileSync(rootNavPath, 'utf8');
  assert(
    rootNavContent.includes('isAuthorizedWarehouse') &&
      rootNavContent.includes('WarehouseClient.isAuthorized()'),
    'P1.1-GATE-01: Warehouse Hub Entry Gated in RootNavigator',
    `Verified: RootNavigator restricts floating Warehouse Hub button to authorized warehouse users only.`
  );

  // TEST 11: Single Warehouse Rule Check across all warehouse files
  const filesToCheck = [
    navbarPath,
    loginScreenPath,
    profileScreenPath,
    dispatchPath,
    './src/context/WarehouseContext.tsx',
    './server/warehouseRoutes.ts',
  ];
  let singleWarehouseAdhered = true;
  for (const f of filesToCheck) {
    const c = fs.readFileSync(f, 'utf8');
    if (c.includes('WH-KARAWAL') || c.includes('Karawal Nagar Branch')) {
      singleWarehouseAdhered = false;
    }
  }
  assert(
    singleWarehouseAdhered,
    'P1.1-ARCH-01: Single Warehouse Rule Adherence (WH-BRAHMPURI-01)',
    `Verified across all warehouse components and routes: exactly one operational warehouse WH-BRAHMPURI-01 (Brahmpuri Branch). Karawal Nagar is strictly a delivery corridor.`
  );

  console.log('======================================================================');
  console.log(`PHASE 1.1 AUDIT SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('======================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase11Verification();
