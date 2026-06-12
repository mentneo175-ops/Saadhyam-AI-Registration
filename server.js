require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');
const { v2: cloudinary } = require('cloudinary');
const { getBucket, isConfigured, testConnection, COLLECTION } = require('./firebase');

// ── Cloudinary config (optional — used when CLOUDINARY_CLOUD_NAME is set) ────
const cloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
  process.env.CLOUDINARY_API_KEY?.trim() &&
  process.env.CLOUDINARY_API_SECRET?.trim()
);

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME.trim(),
    api_key:    process.env.CLOUDINARY_API_KEY.trim(),
    api_secret: process.env.CLOUDINARY_API_SECRET.trim(),
    secure: true,
  });
  console.log('[Cloudinary] Configured — photos will be stored on Cloudinary CDN');
}

const app  = express();
const PORT = process.env.PORT || 3000;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function generateRegId() {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `SAI-${ts.slice(-4)}${rand}`;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ── Upload photo — Cloudinary → Firebase Admin → local fallback ──────────────
async function uploadPhoto(file, regId) {
  // 1. Cloudinary (preferred — CDN delivery, no CORS issues)
  if (cloudinaryConfigured) {
    const folder   = process.env.CLOUDINARY_FOLDER?.trim() || 'saadhyam-ai/registrations';
    const publicId = `${folder}/${regId}/photo`;

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          overwrite: true,
          resource_type: 'image',
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        },
        (err, res) => (err ? reject(err) : resolve(res))
      );
      stream.end(file.buffer);
    });

    console.log(`[Cloudinary] Photo uploaded for ${regId} — ${result.secure_url}`);
    return result.secure_url;
  }

  // 2. Firebase Storage via Admin SDK (requires service account)
  if (isConfigured()) {
    const ext     = path.extname(file.originalname).toLowerCase() || '.jpg';
    const filePath = `registrations/${regId}/photo${ext}`;
    const fileRef  = getBucket().file(filePath);

    await fileRef.save(file.buffer, {
      metadata: { contentType: file.mimetype },
      resumable: false,
    });
    await fileRef.makePublic();

    const url = `https://storage.googleapis.com/${getBucket().name}/${filePath}`;
    console.log(`[Firebase Storage] Photo uploaded for ${regId} — ${url}`);
    return url;
  }

  // 3. Local fallback — served at /uploads/:regId/photo:ext
  const ext      = path.extname(file.originalname).toLowerCase() || '.jpg';
  const localDir = path.join(UPLOADS_DIR, regId);
  fs.mkdirSync(localDir, { recursive: true });
  fs.writeFileSync(path.join(localDir, `photo${ext}`), file.buffer);
  const url = `/uploads/${regId}/photo${ext}`;
  console.log(`[Local] Photo saved for ${regId} — ${url}`);
  return url;
}

// ── Generate certificate PDF and store it ────────────────────────────────────
async function generateAndStoreCertificate(registration) {
  try {
    const { generateCertificate } = require('./services/certificate');
    const pdfBuffer = await generateCertificate(registration);

    // Store to Cloudinary as raw PDF if configured
    if (cloudinaryConfigured) {
      const folder   = process.env.CLOUDINARY_FOLDER?.trim() || 'saadhyam-ai/registrations';
      const publicId = `${folder}/${registration.regId}/certificate`;

      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { public_id: publicId, overwrite: true, resource_type: 'raw' },
          (err, res) => (err ? reject(err) : resolve(res))
        );
        stream.end(pdfBuffer);
      });

      console.log(`[Cloudinary] Certificate stored for ${registration.regId} — ${result.secure_url}`);
      return result.secure_url;
    }

    // Store locally as fallback
    const certDir  = path.join(UPLOADS_DIR, registration.regId);
    fs.mkdirSync(certDir, { recursive: true });
    const certPath = path.join(certDir, 'certificate.pdf');
    fs.writeFileSync(certPath, pdfBuffer);
    const url = `/uploads/${registration.regId}/certificate.pdf`;
    console.log(`[Local] Certificate stored for ${registration.regId} — ${url}`);
    return url;
  } catch (err) {
    console.error(`[Certificate] Failed to generate for ${registration.regId}:`, err.message);
    return null;
  }
}

app.use(express.json());

// ── GET /js/firebase-config.js — serve config from env vars (never hardcoded) ─
// MUST be before express.static so the dynamic route takes priority
app.get('/js/firebase-config.js', (_req, res) => {
  res.set('Content-Type', 'application/javascript');
  res.send(`
// Saadhyam AI — Firebase Web SDK configuration (injected from server env)
const firebaseConfig = {
  apiKey:            ${JSON.stringify(process.env.FIREBASE_API_KEY             || '')},
  authDomain:        ${JSON.stringify(process.env.FIREBASE_AUTH_DOMAIN         || '')},
  projectId:         ${JSON.stringify(process.env.FIREBASE_PROJECT_ID          || '')},
  storageBucket:     ${JSON.stringify(process.env.FIREBASE_STORAGE_BUCKET      || '')},
  messagingSenderId: ${JSON.stringify(process.env.FIREBASE_MESSAGING_SENDER_ID || '')},
  appId:             ${JSON.stringify(process.env.FIREBASE_APP_ID              || '')},
  measurementId:     ${JSON.stringify(process.env.FIREBASE_MEASUREMENT_ID      || '')},
};

const SAADHYAM_CONFIG = {
  communityLink: ${JSON.stringify(process.env.COMMUNITY_LINK || '')},
};
`.trim());
});

app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOADS_DIR));

// ── POST /api/upload-photo — upload only, returns { photoUrl, regId } ────────
app.post('/api/upload-photo', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Photo is required.' });
    }

    const regId    = req.body.regId || generateRegId();
    const photoUrl = await uploadPhoto(req.file, regId);

    res.json({ ok: true, regId, photoUrl });
  } catch (err) {
    console.error('[Upload] Error:', err.message);
    res.status(500).json({ error: 'Photo upload failed. Please try again.' });
  }
});

// ── POST /api/generate-certificate — generate, store, return URL ─────────────
app.post('/api/generate-certificate', async (req, res) => {
  try {
    const registration = req.body;
    if (!registration?.regId || !registration?.fullName) {
      return res.status(400).json({ error: 'Invalid registration data.' });
    }

    const certificateUrl = await generateAndStoreCertificate(registration);

    if (!certificateUrl) {
      return res.status(500).json({ ok: false, error: 'Certificate generation failed.' });
    }

    // If Admin SDK is available, update Firestore directly from the server
    if (isConfigured()) {
      try {
        const { getDb } = require('./firebase');
        await getDb().collection(COLLECTION).doc(registration.regId).update({
          certificateGenerated:   true,
          certificateGeneratedAt: new Date().toISOString(),
          certificateUrl,
        });
        console.log(`[Certificate] Firestore updated for ${registration.regId}`);
      } catch (updateErr) {
        console.warn(`[Certificate] Firestore update skipped (no admin):`, updateErr.message);
      }
    }

    res.json({ ok: true, certificateUrl });
  } catch (err) {
    console.error('[Certificate API] Error:', err.message);
    res.status(500).json({ error: 'Certificate generation failed.' });
  }
});

// ── POST /api/download-card — receives PNG data, returns as file download ──────
app.post('/api/download-card', express.json({ limit: '10mb' }), (req, res) => {
  try {
    const { dataUrl, filename } = req.body;
    if (!dataUrl || !dataUrl.startsWith('data:image/png;base64,')) {
      return res.status(400).json({ error: 'Invalid image data' });
    }
    const base64 = dataUrl.replace('data:image/png;base64,', '');
    const buffer = Buffer.from(base64, 'base64');
    const safe   = (filename || 'Saadhyam_AI_ID').replace(/[^a-zA-Z0-9_\-]/g, '_');
    res.set({
      'Content-Type':        'image/png',
      'Content-Disposition': `attachment; filename="${safe}.png"`,
      'Content-Length':      buffer.length,
    });
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/qr/:regId', async (req, res) => {
  try {
    const QRCode = require('qrcode');
    const dataUrl = await QRCode.toDataURL(req.params.regId, {
      width: 300,
      margin: 1,
      color: { dark: '#0f0f1a', light: '#ffffff' },
      errorCorrectionLevel: 'L',
    });
    res.json({ ok: true, dataUrl });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});
app.get('/api/firebase/status', async (_req, res) => {
  const clientConfig = {
    projectId:       process.env.FIREBASE_PROJECT_ID,
    storageBucket:   process.env.FIREBASE_STORAGE_BUCKET,
    authDomain:      process.env.FIREBASE_AUTH_DOMAIN,
    clientConfigured: Boolean(process.env.FIREBASE_API_KEY),
    cloudinaryConfigured,
  };

  if (!isConfigured()) {
    return res.json({
      ok: true,
      mode: 'client',
      adminConfigured: false,
      ...clientConfig,
      message: 'Using Firebase Web SDK (client mode).',
    });
  }

  try {
    const status = await testConnection();
    res.json({ ok: true, mode: 'admin', adminConfigured: true, ...clientConfig, ...status });
  } catch (err) {
    res.json({ ok: true, mode: 'client', adminConfigured: false, ...clientConfig, adminError: err.message });
  }
});

app.listen(PORT, async () => {
  console.log(`Saadhyam AI Registration running at http://localhost:${PORT}`);
  console.log(`Firebase collection: ${COLLECTION}`);

  if (isConfigured()) {
    try {
      const status = await testConnection();
      console.log(`[Firebase] Admin OK — project: ${status.projectId} · storage: ${status.storageBucket}`);
    } catch (err) {
      console.error('[Firebase] Admin connection failed:', err.message);
    }
  } else {
    console.log('[Firebase] Client SDK mode — Firestore reads/writes handled by browser');
    console.log('[Firebase] Add service account to config/ for server-side Firebase Storage');
  }

  exec(`start msedge http://localhost:${PORT}`);
});
