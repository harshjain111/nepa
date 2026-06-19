'use strict';

/**
 * NEPA — Mustard Oil Promotion Conclave 2026
 * Express backend: static hosting, REST API, file uploads, admin auth.
 *
 * Storage is pluggable (see lib/store.js & lib/uploads.js):
 *   - Local dev  -> JSON files + /uploads disk   (zero setup; `npm start`)
 *   - Vercel     -> Postgres + Vercel Blob        (set DATABASE_URL + BLOB_READ_WRITE_TOKEN)
 *
 * This module exports the Express `app`. It only calls listen() when run
 * directly (node server.js); on Vercel, api/index.js imports the app.
 */

require('./lib/env'); // load .env.local for local dev (no-op on Vercel)

const path = require('path');
const express = require('express');
const multer = require('multer');

const store = require('./lib/store');
const uploads = require('./lib/uploads');
const auth = require('./lib/auth');

const app = express();
const PORT = process.env.PORT || 3000;

/* ------------------------------------------------------------------ *
 * CONFIG — single source of truth
 * ------------------------------------------------------------------ */
const EARLY_BIRD_CUTOFF = process.env.EARLY_BIRD_CUTOFF || '2026-08-15';
const DELEGATE_FEE_EARLY = 8000;
const DELEGATE_FEE_SPOT = 10000;
const MEMBERSHIP_FEE = 3100;

const ADMIN_ID = process.env.ADMIN_ID || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'nepa2026';

const PUBLIC_DIR = path.join(__dirname, 'public');

/* ------------------------------------------------------------------ *
 * PRICING
 * ------------------------------------------------------------------ */
function currentFee() {
  const today = new Date().toISOString().slice(0, 10);
  const isEarly = today <= EARLY_BIRD_CUTOFF;
  return {
    feeType: isEarly ? 'Early Bird' : 'Spot',
    delegateFee: isEarly ? DELEGATE_FEE_EARLY : DELEGATE_FEE_SPOT,
  };
}

/* ------------------------------------------------------------------ *
 * UPLOADS — in-memory (buffer goes to Blob or disk via lib/uploads)
 * ------------------------------------------------------------------ */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
});

/* ------------------------------------------------------------------ *
 * APP SETUP
 * ------------------------------------------------------------------ */
app.use(express.json());
// Local-disk uploads (no-op on Vercel, where Blob serves absolute URLs).
app.use('/uploads', express.static(uploads.UPLOAD_DIR));
app.use(express.static(PUBLIC_DIR));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^\d{10}$/;
const VALID_METHODS = ['UPI', 'Bank', 'Cash'];

// Wrap async handlers so rejected promises become clean 500s.
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((err) => {
  console.error(err);
  if (!res.headersSent) res.status(500).json({ ok: false, error: 'Server error' });
});

/* ------------------------------------------------------------------ *
 * ROUTES
 * ------------------------------------------------------------------ */

// Pricing constants + cutoff
app.get('/api/config', (req, res) => {
  const { feeType, delegateFee } = currentFee();
  res.json({ earlyBirdCutoff: EARLY_BIRD_CUTOFF, feeType, delegateFee, membershipFee: MEMBERSHIP_FEE });
});

// Public registration (multipart: optional "screenshot")
app.post('/api/register', (req, res) => {
  upload.single('screenshot')(req, res, wrap(async (err) => {
    if (err) return res.status(400).json({ ok: false, error: err.message });

    const b = req.body || {};
    const fullName = (b.fullName || '').trim();
    const mobile = (b.mobile || '').trim();
    const email = (b.email || '').trim();
    const organization = (b.organization || '').trim();
    const paymentMethod = (b.paymentMethod || '').trim();
    const referenceNo = (b.referenceNo || '').trim();
    const note = (b.note || '').trim();
    const nepaMember = b.nepaMember === 'true' || b.nepaMember === true;

    if (!fullName) return res.status(400).json({ ok: false, error: 'Full name is required' });
    if (!MOBILE_RE.test(mobile)) return res.status(400).json({ ok: false, error: 'Mobile must be exactly 10 digits' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'A valid email is required' });
    if (!organization) return res.status(400).json({ ok: false, error: 'Organization is required' });
    if (!VALID_METHODS.includes(paymentMethod)) return res.status(400).json({ ok: false, error: 'Invalid payment method' });
    if ((paymentMethod === 'UPI' || paymentMethod === 'Bank') && !req.file) {
      return res.status(400).json({ ok: false, error: 'Payment screenshot is required for UPI and Bank Transfer' });
    }

    const { feeType, delegateFee } = currentFee();
    const membershipFee = nepaMember ? MEMBERSHIP_FEE : 0;
    const screenshotUrl = req.file ? await uploads.saveUpload(req.file) : null;

    const record = await store.addRegistration({
      fullName, mobile, email, organization, nepaMember, feeType,
      delegateFee, membershipFee, totalAmount: delegateFee + membershipFee,
      paymentMethod, referenceNo: referenceNo || null, screenshotUrl, note: note || null,
    });

    res.json({
      ok: true,
      regId: record.regId,
      totalAmount: record.totalAmount,
      feeType: record.feeType,
      fullName: record.fullName,
    });
  }));
});

// Public contact / enquiry form
app.post('/api/contact', wrap(async (req, res) => {
  const b = req.body || {};
  const name = (b.name || '').trim();
  const email = (b.email || '').trim();
  const phone = (b.phone || '').trim();
  const subject = (b.subject || '').trim();
  const message = (b.message || '').trim();

  if (!name) return res.status(400).json({ ok: false, error: 'Name is required' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'A valid email is required' });
  if (!message) return res.status(400).json({ ok: false, error: 'Message is required' });
  if (phone && !/^\d{7,15}$/.test(phone)) return res.status(400).json({ ok: false, error: 'Phone must be 7–15 digits' });

  await store.addMessage({ name, email, phone: phone || null, subject: subject || null, message });
  res.json({ ok: true });
}));

// Admin login -> stateless token
app.post('/api/admin/login', (req, res) => {
  const { id, password } = req.body || {};
  if (id === ADMIN_ID && password === ADMIN_PASSWORD) {
    return res.json({ ok: true, token: auth.sign() });
  }
  res.status(401).json({ ok: false, error: 'Invalid credentials' });
});

// Logout — tokens are stateless; the client clears its own session.
app.post('/api/admin/logout', auth.middleware, (req, res) => res.json({ ok: true }));

// Registrations
app.get('/api/registrations', auth.middleware, wrap(async (req, res) => {
  res.json({ ok: true, registrations: await store.listRegistrations() });
}));

app.patch('/api/registrations/:id/status', auth.middleware, wrap(async (req, res) => {
  const status = await store.setRegistrationStatus(req.params.id, (req.body && req.body.status) || null);
  if (status === null) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, status });
}));

app.delete('/api/registrations/:id', auth.middleware, wrap(async (req, res) => {
  const removed = await store.deleteRegistration(req.params.id);
  if (!removed) return res.status(404).json({ ok: false, error: 'Not found' });
  if (removed.screenshotUrl) await uploads.deleteUpload(removed.screenshotUrl);
  res.json({ ok: true });
}));

// Enquiry messages
app.get('/api/messages', auth.middleware, wrap(async (req, res) => {
  res.json({ ok: true, messages: await store.listMessages() });
}));

app.patch('/api/messages/:id/read', auth.middleware, wrap(async (req, res) => {
  const read = await store.setMessageRead(req.params.id, req.body && typeof req.body.read === 'boolean' ? req.body.read : undefined);
  if (read === null) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, read });
}));

app.delete('/api/messages/:id', auth.middleware, wrap(async (req, res) => {
  const ok = await store.deleteMessage(req.params.id);
  if (!ok) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true });
}));

// Admin page (local convenience; on Vercel, vercel.json rewrites /admin -> /admin.html)
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));

/* ------------------------------------------------------------------ *
 * START (only when run directly; on Vercel the app is imported)
 * ------------------------------------------------------------------ */
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`NEPA Conclave server running on http://localhost:${PORT}  [store: ${store.backend}, uploads: ${uploads.backend}]`);
  });
}

module.exports = app;
