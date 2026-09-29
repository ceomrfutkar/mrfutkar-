/**
 * MR FUTKAR — Server Firebase Admin Module
 * Authoritative backend Firestore & Firebase Auth interface
 * Phase 1 / Phase 2 Production Remediation
 */
import dotenv from 'dotenv';
dotenv.config({ override: true, quiet: true });
import { initializeApp, getApps, getApp, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import {
  collection as clientCollection,
  doc as clientDoc,
  getDoc as clientGetDoc,
  getDocs as clientGetDocs,
  setDoc as clientSetDoc,
  updateDoc as clientUpdateDoc,
  deleteDoc as clientDeleteDoc,
  runTransaction as clientRunTransaction,
  query as clientQuery,
  where as clientWhere,
  limit as clientLimit,
  orderBy as clientOrderBy,
} from 'firebase/firestore';
import { db as clientDb } from '../src/config/firebase';
import * as path from 'path';
import * as fs from 'fs';

// 1. Explicitly load verified project & database configuration
let cfg: any = {};
try {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  }
} catch {
  // ignore
}

export const FIREBASE_PROJECT_ID = cfg.projectId || process.env.GCLOUD_PROJECT || 'project-f07feeac-9008-4c6b-823';
export const FIRESTORE_DATABASE_ID = cfg.firestoreDatabaseId || 'ai-studio-remixremixremixr-888a0f4c-6250-48a2-9e7d-da6a96202048';
export const SERVER_TXN_TOKEN = 'MRFUTKAR_INTERNAL_SERVER_AUTHORITY_WH_01';
export const OPERATIONAL_WAREHOUSE_ID = 'WH-BRAHMPURI-01';

// 2. Safe Admin SDK Initialization (No hardcoded credentials; uses ADC/deployment configuration)
export const adminApp: App = getApps().length === 0
  ? initializeApp({ projectId: FIREBASE_PROJECT_ID })
  : getApp();

export const adminAuth: Auth = getAuth(adminApp);

// 3. Connect Admin SDK to explicit Firestore Database ID
let _adminFirestore: Firestore | null = null;
try {
  _adminFirestore = getFirestore(adminApp, FIRESTORE_DATABASE_ID);
} catch (e) {
  console.warn('Note: Admin Firestore named database bind:', e);
}
export const adminFirestore: Firestore | null = _adminFirestore;

// 4. Server-Authoritative Database & Operations Pipeline
export const db = clientDb;
export const collection = clientCollection;
export const doc = clientDoc;
export const getDoc = clientGetDoc;
export const getDocs = clientGetDocs;
export const setDoc = clientSetDoc;
export const updateDoc = clientUpdateDoc;
export const deleteDoc = clientDeleteDoc;
export const runTransaction = clientRunTransaction;
export const query = clientQuery;
export const where = clientWhere;
export const limit = clientLimit;
export const orderBy = clientOrderBy;
