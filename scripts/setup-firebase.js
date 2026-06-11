/**
 * Reads a Firebase service account JSON and writes credentials to .env
 * Usage: node scripts/setup-firebase.js path/to/serviceAccountKey.json
 */
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const configDir = path.join(projectRoot, 'config');
const targetKey = path.join(configDir, 'serviceAccountKey.json');
const envPath = path.join(projectRoot, '.env');

const inputPath = process.argv[2];

if (!inputPath) {
  console.error('\nUsage: npm run setup:firebase -- path/to/downloaded-service-account.json\n');
  console.error('Steps:');
  console.error('  1. Firebase Console → Project Settings → Service Accounts');
  console.error('  2. Click "Generate new private key" and download JSON');
  console.error('  3. Run: npm run setup:firebase -- "C:\\Downloads\\your-key.json"\n');
  process.exit(1);
}

const resolvedInput = path.resolve(inputPath);
if (!fs.existsSync(resolvedInput)) {
  console.error(`File not found: ${resolvedInput}`);
  process.exit(1);
}

const account = JSON.parse(fs.readFileSync(resolvedInput, 'utf8'));
const { project_id, client_email, private_key } = account;

if (!project_id || !client_email || !private_key) {
  console.error('Invalid service account JSON.');
  process.exit(1);
}

if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

fs.copyFileSync(resolvedInput, targetKey);
console.log(`✓ Saved service account → config/serviceAccountKey.json`);

const escapedKey = private_key.replace(/\n/g, '\\n');
const storageBucket = `${project_id}.appspot.com`;

let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

const updates = {
  FIREBASE_PROJECT_ID: project_id,
  FIREBASE_STORAGE_BUCKET: storageBucket,
  FIREBASE_CLIENT_EMAIL: client_email,
  FIREBASE_PRIVATE_KEY: `"${escapedKey}"`,
  FIREBASE_SERVICE_ACCOUNT_PATH: './config/serviceAccountKey.json',
};

for (const [key, value] of Object.entries(updates)) {
  const regex = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}=${value}`;
  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, line);
  } else {
    envContent += `\n${line}`;
  }
}

fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
console.log(`✓ Updated .env with Firebase credentials`);
console.log(`\n  Project ID:  ${project_id}`);
console.log(`  Storage:     ${storageBucket}`);
console.log(`  Client:      ${client_email}`);
console.log('\nNext: enable Firestore + Storage in Firebase Console, then run: npm start\n');
