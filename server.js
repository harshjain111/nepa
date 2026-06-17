'use strict';

/**
 * NEPA — Mustard Oil Promotion Conclave 2026
 * Express backend: static hosting, REST API, file uploads, admin auth.
 * No database server — a JSON file is the datastore.
 *
 * Run: npm install && npm start  (PORT env or 3000)
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

/* ------------------------------------------------------------------ *
 * CONFIG — single source of truth (see CLAUDE.md §5, §11)
 * ------------------------------------------------------------------ */
const EARLY_BIRD_CUTOFF = '2026-08-15'; // inclusive (YYYY-MM-DD)
const DELEGATE_FEE_EARLY = 8000;
const DELEGATE_FEE_SPOT = 10000;
const MEMBERSHIP_FEE = 3100;

// Admin credentials — override via env in production (see README placeholders).
const ADMIN_ID = process.env.ADMIN_ID || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'nepa2026';

/* ------------------------------------------------------------------ *
 * PATHS
 * ------------------------------------------------------------------ */
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'registrations.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/* ------------------------------------------------------------------ *
 * TINY JSON DATASTORE
 * ------------------------------------------------------------------ */
function readRecords() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE, 'utf8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to read datastore, starting empty:', err.message);
    return [];
  }
}

function writeRecords(records) {
  // Serialized synchronous write keeps the single-file store consistent.
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), 'utf8');
}

function nextRegId(records) {
  // regId = "NEPA26-" + (1000 + sequence). Sequence is the count so far.
  const seq = 1000 + records.length + 1;
  return `NEPA26-${seq}`;
}

/* ------------------------------------------------------------------ *
 * PRICING
 * ------------------------------------------------------------------ */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function currentFee() {
  const isEarly = todayISO() <= EARLY_BIRD_CUTOFF;
  return {
    feeType: isEarly ? 'Early Bird' : 'Spot',
    delegateFee: isEarly ? DELEGATE_FEE_EARLY : DELEGATE_FEE_SPOT,
  };
}

/* ------------------------------------------------------------------ *
 * MULTER — image uploads only, 8 MB, random filenames
 * ------------------------------------------------------------------ */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase().slice(0, 10);
    const safeExt = /^\.(png|jpg|jpeg|webp|gif|heic|heif)$/.test(ext) ? ext : '.png';
    cb(null, crypto.randomBytes(16).toString('hex') + safeExt);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
});

/* ------------------------------------------------------------------ *
 * ADMIN TOKENS (in-memory)
 * ------------------------------------------------------------------ */
const tokens = new Set();

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match && match[1];
  if (!token || !tokens.has(token)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

/* ------------------------------------------------------------------ *
 * APP SETUP
 * ------------------------------------------------------------------ */
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(PUBLIC_DIR));

/* ------------------------------------------------------------------ *
 * VALIDATION HELPERS
 * ------------------------------------------------------------------ */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^\d{10}$/;
const VALID_METHODS = ['UPI', 'Bank', 'Cash'];

/* ------------------------------------------------------------------ *
 * ROUTES
 * ------------------------------------------------------------------ */

// Pricing constants + cutoff
app.get('/api/config', (req, res) => {
  const { feeType, delegateFee } = currentFee();
  res.json({
    earlyBirdCutoff: EARLY_BIRD_CUTOFF,
    feeType,
    delegateFee,
    membershipFee: MEMBERSHIP_FEE,
  });
});

// Public registration (multipart: optional "screenshot")
app.post('/api/register', (req, res) => {
  upload.single('screenshot')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }

    const cleanupUpload = () => {
      if (req.file) {
        fs.unlink(path.join(UPLOAD_DIR, req.file.filename), () => {});
      }
    };

    const body = req.body || {};
    const fullName = (body.fullName || '').trim();
    const mobile = (body.mobile || '').trim();
    const email = (body.email || '').trim();
    const organization = (body.organization || '').trim();
    const paymentMethod = (body.paymentMethod || '').trim();
    const referenceNo = (body.referenceNo || '').trim();
    const note = (body.note || '').trim();
    const nepaMember = body.nepaMember === 'true' || body.nepaMember === true;

    // --- validation ---
    if (!fullName) return fail('Full name is required');
    if (!MOBILE_RE.test(mobile)) return fail('Mobile must be exactly 10 digits');
    if (!EMAIL_RE.test(email)) return fail('A valid email is required');
    if (!organization) return fail('Organization is required');
    if (!VALID_METHODS.includes(paymentMethod)) return fail('Invalid payment method');

    if ((paymentMethod === 'UPI' || paymentMethod === 'Bank') && !req.file) {
      return fail('Payment screenshot is required for UPI and Bank Transfer');
    }

    function fail(message) {
      cleanupUpload();
      return res.status(400).json({ ok: false, error: message });
    }

    // --- build record ---
    const { feeType, delegateFee } = currentFee();
    const membershipFee = nepaMember ? MEMBERSHIP_FEE : 0;
    const totalAmount = delegateFee + membershipFee;

    const records = readRecords();
    const record = {
      id: crypto.randomUUID(),
      regId: nextRegId(records),
      createdAt: new Date().toISOString(),
      fullName,
      mobile,
      email,
      organization,
      nepaMember,
      feeType,
      delegateFee,
      membershipFee,
      totalAmount,
      paymentMethod,
      referenceNo: referenceNo || null,
      screenshotUrl: req.file ? `/uploads/${req.file.filename}` : null,
      note: note || null,
      status: 'Pending',
    };

    records.push(record);
    writeRecords(records);

    res.json({
      ok: true,
      regId: record.regId,
      totalAmount: record.totalAmount,
      feeType: record.feeType,
      fullName: record.fullName,
    });
  });
});

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { id, password } = req.body || {};
  if (id === ADMIN_ID && password === ADMIN_PASSWORD) {
    const token = crypto.randomBytes(24).toString('hex');
    tokens.add(token);
    return res.json({ ok: true, token });
  }
  res.status(401).json({ ok: false, error: 'Invalid credentials' });
});

// Admin logout
app.post('/api/admin/logout', requireAuth, (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  tokens.delete(token);
  res.json({ ok: true });
});

// All registrations, newest first
app.get('/api/registrations', requireAuth, (req, res) => {
  const records = readRecords()
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ ok: true, registrations: records });
});

// Toggle / set status
app.patch('/api/registrations/:id/status', requireAuth, (req, res) => {
  const records = readRecords();
  const rec = records.find((r) => r.id === req.params.id);
  if (!rec) return res.status(404).json({ ok: false, error: 'Not found' });

  const requested = (req.body && req.body.status) || null;
  if (requested === 'Pending' || requested === 'Confirmed') {
    rec.status = requested;
  } else {
    rec.status = rec.status === 'Confirmed' ? 'Pending' : 'Confirmed';
  }
  writeRecords(records);
  res.json({ ok: true, status: rec.status });
});

// Delete a record + its screenshot file
app.delete('/api/registrations/:id', requireAuth, (req, res) => {
  const records = readRecords();
  const idx = records.findIndex((r) => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, error: 'Not found' });

  const [removed] = records.splice(idx, 1);
  writeRecords(records);

  if (removed.screenshotUrl) {
    const file = path.join(UPLOAD_DIR, path.basename(removed.screenshotUrl));
    fs.unlink(file, () => {});
  }
  res.json({ ok: true });
});

// Admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`NEPA Conclave server running on http://localhost:${PORT}`);
});
