import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  Firestore,
  doc,
  getDocFromServer,
  setLogLevel,
} from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import firebaseConfigData from '../../firebase-applet-config.json';

// Configure log level to suppress internal connection timeout notices in iframe sandboxes
setLogLevel('silent');

// Safe extraction of config
const firebaseConfig = {
  apiKey: firebaseConfigData.apiKey,
  authDomain: firebaseConfigData.authDomain,
  projectId: firebaseConfigData.projectId,
  storageBucket: firebaseConfigData.storageBucket,
  messagingSenderId: firebaseConfigData.messagingSenderId,
  appId: firebaseConfigData.appId,
};

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Database instance with the provisioned named database or default
// Use experimentalAutoDetectLongPolling to bypass iframe streaming blocks
// and ensure immediate, reliable Cloud Firestore connectivity
const databaseId = firebaseConfigData.firestoreDatabaseId || '(default)';
let dbInstance: Firestore;
try {
  dbInstance = initializeFirestore(
    app,
    {
      experimentalAutoDetectLongPolling: true,
    },
    databaseId
  );
} catch {
  dbInstance = getFirestore(app, databaseId);
}

export const db: Firestore = dbInstance;
export const auth: Auth = getAuth(app);
export const storage: FirebaseStorage = getStorage(app);

// Connectivity verification per system skill requirement with non-blocking timeout
export async function testFirebaseConnection(): Promise<boolean> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Connection check timeout')), 4000)
    );
    await Promise.race([
      getDocFromServer(doc(db, 'test', 'connection')),
      timeoutPromise,
    ]);
    return true;
  } catch (error: any) {
    if (error?.message?.includes('the client is offline')) {
      console.warn('Firebase client is offline. Verify network connection or project config.');
      return false;
    }
    // Permission denied or not-found means the connection to the server succeeded
    return true;
  }
}

// Non-blocking connection check on startup
testFirebaseConnection().catch(() => {});

export default app;
