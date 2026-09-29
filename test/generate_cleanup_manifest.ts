import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import * as fs from 'fs';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

interface ManifestItem {
  collection: string;
  documentId: string;
  reason: string;
  associatedRecords: {
    inventoryMovements?: string[];
    notifications?: string[];
    deliveryRecords?: string[];
    auditRecords?: string[];
  };
}

async function generateManifest() {
  console.log('Generating Review-Only Test Data Manifest...');

  const manifest: ManifestItem[] = [];

  // 1. Inspect Orders
  const ordersSnap = await getDocs(collection(db, 'orders'));
  const testOrderIds: string[] = [];

  for (const docSnap of ordersSnap.docs) {
    const id = docSnap.id;
    const data = docSnap.data();
    const isTestOrder =
      id.startsWith('MF-20260924-') ||
      id.startsWith('MF-20260925-') ||
      id.startsWith('TEST-') ||
      id.includes('AUDIT') ||
      (data.retailerId && String(data.retailerId).startsWith('MASTER-RET')) ||
      (data.retailerId && String(data.retailerId).includes('test-')) ||
      (data.retailerId && String(data.retailerId).includes('SETTINGS-TEST'));

    if (isTestOrder) {
      testOrderIds.push(id);
      
      // Find associated movements
      const movSnap = await getDocs(query(collection(db, 'inventoryMovements'), where('referenceId', '==', id)));
      const movIds = movSnap.docs.map(m => m.id);

      // Find associated notifications
      const notifSnap = await getDocs(query(collection(db, 'notifications'), where('orderId', '==', id)));
      const notifIds = notifSnap.docs.map(n => n.id);

      // Find associated delivery audit logs
      const delivAuditSnap = await getDocs(query(collection(db, 'deliveryAuditLogs'), where('orderId', '==', id)));
      const delivAuditIds = delivAuditSnap.docs.map(a => a.id);

      manifest.push({
        collection: 'orders',
        documentId: id,
        reason: `Automated test artifact from integration/e2e test suite (retailer: ${data.retailerId || 'N/A'}, status: ${data.orderStatus || data.status})`,
        associatedRecords: {
          inventoryMovements: movIds,
          notifications: notifIds,
          deliveryRecords: delivAuditIds,
        }
      });
    }
  }

  // 2. Inspect Known Test Products
  const knownTestProductIds = [
    'PROD-REPORT-OIL-01',
    'PROD-REPORT-TEA-01',
    'PROD-SETTINGS-TEST-TEA-01',
    'prod-test-tea-01',
    'prod-test-rice-01'
  ];

  for (const prodId of knownTestProductIds) {
    const prodDoc = await getDoc(doc(db, 'products', prodId));
    if (prodDoc.exists()) {
      const pData = prodDoc.data();
      // Associated inventory movements
      const movSnap = await getDocs(query(collection(db, 'inventoryMovements'), where('productId', '==', prodId)));
      const movIds = movSnap.docs.map(m => m.id);

      manifest.push({
        collection: 'products',
        documentId: prodId,
        reason: `Test catalog item created for test suite assertions (name: '${pData.productName}', active: ${pData.isActive})`,
        associatedRecords: {
          inventoryMovements: movIds
        }
      });
    }
  }

  // 3. Inspect Test Admin Users
  const adminsSnap = await getDocs(collection(db, 'adminUsers'));
  for (const aDoc of adminsSnap.docs) {
    const id = aDoc.id;
    const aData = aDoc.data();
    if (id.startsWith('MASTER-SUPERADMIN-') || id.includes('TEST-ADMIN')) {
      manifest.push({
        collection: 'adminUsers',
        documentId: id,
        reason: `Isolated test administrative account generated during integration audit (role: ${aData.role}, email: ${aData.email})`,
        associatedRecords: {}
      });
    }
  }

  // 4. Inspect Test Retailers
  const retSnap = await getDocs(collection(db, 'retailers'));
  for (const rDoc of retSnap.docs) {
    const id = rDoc.id;
    const rData = rDoc.data();
    if (id.startsWith('MASTER-RET-') || id.startsWith('test-ret-')) {
      manifest.push({
        collection: 'retailers',
        documentId: id,
        reason: `Synthetic retailer principal created for integration testing (shop: '${rData.shopName}', mobile: ${rData.mobile})`,
        associatedRecords: {}
      });
    }
  }

  // 5. Inspect Test Delivery Partners
  const dpSnap = await getDocs(collection(db, 'deliveryPartners'));
  for (const dDoc of dpSnap.docs) {
    const id = dDoc.id;
    const dData = dDoc.data();
    if (id.startsWith('MASTER-DP-') || id.startsWith('test-dp-')) {
      manifest.push({
        collection: 'deliveryPartners',
        documentId: id,
        reason: `Synthetic delivery partner principal created for integration testing (name: '${dData.name}', vehicle: ${dData.vehicleType})`,
        associatedRecords: {}
      });
    }
  }

  console.log(`\n======================================================`);
  console.log(`TOTAL TEST ITEMS IN MANIFEST: ${manifest.length}`);
  console.log(`======================================================`);
  manifest.forEach((m, idx) => {
    console.log(`[${idx + 1}] Collection: ${m.collection.padEnd(16)} | ID: ${m.documentId.padEnd(30)}`);
    console.log(`    Reason: ${m.reason}`);
    if (m.associatedRecords.inventoryMovements?.length) {
      console.log(`    Associated Movements (${m.associatedRecords.inventoryMovements.length}): ${m.associatedRecords.inventoryMovements.join(', ')}`);
    }
    if (m.associatedRecords.notifications?.length) {
      console.log(`    Associated Notifications (${m.associatedRecords.notifications.length}): ${m.associatedRecords.notifications.join(', ')}`);
    }
    if (m.associatedRecords.deliveryRecords?.length) {
      console.log(`    Associated Delivery Audits (${m.associatedRecords.deliveryRecords.length}): ${m.associatedRecords.deliveryRecords.join(', ')}`);
    }
  });

  fs.writeFileSync('test/test_data_cleanup_manifest.json', JSON.stringify(manifest, null, 2));
  console.log('\nManifest written to test/test_data_cleanup_manifest.json (REVIEW ONLY - NO DELETIONS EXECUTED)');
  process.exit(0);
}

generateManifest().catch(e => {
  console.error(e);
  process.exit(1);
});
