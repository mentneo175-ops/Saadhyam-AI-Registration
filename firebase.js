require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const DEFAULT_KEY_PATHS = [
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  path.join(__dirname, 'config', 'serviceAccountKey.json'),
  path.join(__dirname, 'firebase-service-account.json'),
  path.join(__dirname, 'serviceAccountKey.json'),
].filter(Boolean);

const COLLECTION = process.env.FIREBASE_COLLECTION || 'registrations';

let cached = null;

function loadServiceAccountFromFile() {
  for (const filePath of DEFAULT_KEY_PATHS) {
    const resolved = path.resolve(filePath);
    if (fs.existsSync(resolved)) {
      const json = JSON.parse(fs.readFileSync(resolved, 'utf8'));
      return { account: json, source: resolved };
    }
  }
  return null;
}

function loadServiceAccountFromEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();

  if (!projectId || projectId.includes('your-') || !clientEmail || !privateKey || privateKey.includes('YOUR_')) {
    return null;
  }

  return {
    account: {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n'),
    },
    source: '.env',
  };
}

function resolveStorageBucket(projectId) {
  const fromEnv = process.env.FIREBASE_STORAGE_BUCKET?.trim();
  if (fromEnv && !fromEnv.includes('your-project')) return fromEnv;
  return `${projectId}.appspot.com`;
}

function getFirebase() {
  if (cached) return cached;

  const fromFile = loadServiceAccountFromFile();
  const fromEnv = loadServiceAccountFromEnv();
  const loaded = fromFile || fromEnv;

  if (!loaded) {
    const err = new Error(
      'Firebase not configured. Download service account JSON from Firebase Console, ' +
      'then run: npm run setup:firebase -- path/to/key.json'
    );
    err.code = 'FIREBASE_NOT_CONFIGURED';
    throw err;
  }

  const { project_id, client_email, private_key } = loaded.account;
  const storageBucket = resolveStorageBucket(project_id);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: project_id,
        clientEmail: client_email,
        privateKey: private_key,
      }),
      storageBucket,
    });
  }

  console.log(`[Firebase] Connected — project: ${project_id} (via ${loaded.source})`);

  cached = {
    admin,
    db: admin.firestore(),
    bucket: admin.storage().bucket(),
    projectId: project_id,
    storageBucket: admin.storage().bucket().name,
    source: loaded.source,
  };

  return cached;
}

async function testConnection() {
  const { db, projectId, storageBucket, source } = getFirebase();
  await db.collection(COLLECTION).limit(1).get();
  return {
    connected: true,
    projectId,
    collection: COLLECTION,
    storageBucket,
    source,
  };
}

function isConfigured() {
  return Boolean(loadServiceAccountFromFile() || loadServiceAccountFromEnv());
}

module.exports = {
  COLLECTION,
  testConnection,
  isConfigured,
  getFirebase,
  getDb: () => getFirebase().db,
  getBucket: () => getFirebase().bucket,
};
