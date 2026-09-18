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
const vcard = require('./lib/vcard');

const app = express();
const PORT = process.env.PORT || 3000;

/* ------------------------------------------------------------------ *
 * CONFIG — single source of truth
 * ------------------------------------------------------------------ */
const EARLY_BIRD_CUTOFF = process.env.EARLY_BIRD_CUTOFF || '2026-08-15';
const DELEGATE_FEE_EARLY = 8000;
const DELEGATE_FEE_SPOT = 10000;
const MEMBERSHIP_FEE = 3100;
const GST_RATE = 0.18; // 18% GST added on top of delegate + membership fees

// Public registration is CLOSED by default now. Set REGISTRATIONS_OPEN=true in
// the environment to reopen the public form. The admin panel can always add a
// delegate manually regardless of this flag.
const REGISTRATIONS_OPEN = process.env.REGISTRATIONS_OPEN === 'true';

const ADMIN_ID = process.env.ADMIN_ID || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'nepa2026';
// Read-only account: can view all records & screenshots, cannot edit or delete.
const VIEWER_ID = process.env.VIEWER_ID || 'viewer';
const VIEWER_PASSWORD = process.env.VIEWER_PASSWORD || 'nepa2026';
// Hotel team: manages hotels + capacity and views hotel bookings ONLY.
const HOTEL_ID = process.env.HOTEL_ID || 'hotel';
const HOTEL_PASSWORD = process.env.HOTEL_PASSWORD || 'nepa2026';
const HOTEL_PASSWORD_HASH = process.env.HOTEL_PASSWORD_HASH || '';
// Gate/catering team: runs the meal QR scanner ONLY (no registrations/money).
const GATE_ID = process.env.GATE_ID || 'gate';
const GATE_PASSWORD = process.env.GATE_PASSWORD || 'nepa2026';
const GATE_PASSWORD_HASH = process.env.GATE_PASSWORD_HASH || '';
// Preferred in production: store a scrypt hash (see `npm run hash-password`)
// so the real password is never kept in plaintext. Falls back to *_PASSWORD.
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const VIEWER_PASSWORD_HASH = process.env.VIEWER_PASSWORD_HASH || '';

// Nudge operators off insecure defaults in production.
if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
  if (!ADMIN_PASSWORD_HASH && ADMIN_PASSWORD === 'nepa2026') {
    console.warn('[security] ADMIN_PASSWORD is the default — set a strong ADMIN_PASSWORD or ADMIN_PASSWORD_HASH.');
  }
  if (!process.env.AUTH_SECRET) {
    console.warn('[security] AUTH_SECRET is not set — session tokens use a guessable fallback secret.');
  }
}

/* ---- Brute-force protection: per-IP+id sliding lockout (in-memory) ---- */
const LOGIN_MAX_FAILS = 6;            // failures allowed within the window
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000; // lock duration once tripped
const loginAttempts = new Map();
function loginKey(req, id) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip').split(',')[0].trim();
  return `${ip}:${String(id || '').toLowerCase()}`;
}
function loginLock(key) {
  const rec = loginAttempts.get(key);
  if (rec && rec.lockUntil > Date.now()) return rec.lockUntil - Date.now();
  return 0;
}
function loginNoteFail(key) {
  const now = Date.now();
  let rec = loginAttempts.get(key);
  if (!rec || now - rec.first > LOGIN_WINDOW_MS) rec = { fails: 0, first: now, lockUntil: 0 };
  rec.fails += 1;
  if (rec.fails >= LOGIN_MAX_FAILS) rec.lockUntil = now + LOGIN_LOCK_MS;
  loginAttempts.set(key, rec);
  if (loginAttempts.size > 5000) loginAttempts.clear(); // crude memory cap
}

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
app.use(express.json({ limit: '4mb' })); // headroom for bulk Excel imports
// Local-disk uploads (no-op on Vercel, where Blob serves absolute URLs).
app.use('/uploads', express.static(uploads.UPLOAD_DIR));
app.use(express.static(PUBLIC_DIR, {
  setHeaders(res, filePath) {
    // Heavy media rarely changes → cache a week (big repeat-visit win).
    if (/\.(?:mp4|jpe?g|png|gif|svg|webp|woff2?|ico)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 days
    } else if (/\.(?:css|js|html?)$/i.test(filePath)) {
      // Code/markup must always reflect the latest deploy → revalidate via
      // ETag (cheap 304s) so updates show immediately, no 30-day staleness.
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^\d{10}$/;
const VALID_METHODS = ['UPI', 'Bank', 'Cash'];

// Wrap async handlers so rejected promises become clean JSON errors.
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((err) => {
  console.error(err);
  if (res.headersSent) return;
  // Surface a helpful message when a table hasn't been created yet.
  if (err && err.code === 'NEEDS_MIGRATION') return res.status(503).json({ ok: false, error: err.message });
  res.status(500).json({ ok: false, error: 'Server error' });
});

/* ------------------------------------------------------------------ *
 * ROUTES
 * ------------------------------------------------------------------ */

// Pricing constants + cutoff
app.get('/api/config', (req, res) => {
  const { feeType, delegateFee } = currentFee();
  res.json({ earlyBirdCutoff: EARLY_BIRD_CUTOFF, feeType, delegateFee, membershipFee: MEMBERSHIP_FEE, gstRate: GST_RATE, registrationsOpen: REGISTRATIONS_OPEN });
});

// Public registration (multipart: optional "screenshot")
app.post('/api/register', (req, res) => {
  // multer calls this callback with (err) only — so we must use the route's
  // own req/res (not wrap's args) and catch async errors ourselves, otherwise
  // a storage failure crashes the function and the platform returns non-JSON.
  upload.single('screenshot')(req, res, (err) => {
    handleRegister(req, res, err).catch((e) => {
      console.error('register failed:', e);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: 'Could not save your registration. Please try again or contact the Secretariat.' });
      }
    });
  });
});

async function handleRegister(req, res, err) {
    if (err) return res.status(400).json({ ok: false, error: err.message });

    // Public registration is closed — new delegates are added by the admin only.
    if (!REGISTRATIONS_OPEN) {
      return res.status(403).json({ ok: false, closed: true, error: 'Registrations are now closed.' });
    }

    const b = req.body || {};
    const fullName = (b.fullName || '').trim();
    const mobile = (b.mobile || '').trim();
    const email = (b.email || '').trim();
    const organization = (b.organization || '').trim();
    const gstNumber = (b.gstNumber || '').trim().toUpperCase();
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

    // One registration per mobile number. If a delegate needs to change
    // anything, the admin must delete their existing entry first — only then
    // can the number register again. Check before uploading the screenshot.
    const DUP_MSG = 'This mobile number is already registered. If you need to correct or change your details, please contact the Secretariat (94350-40234) — they will remove the existing entry so you can register again.';
    const existing = await store.findRegistrationByMobile(mobile);
    if (existing) return res.status(409).json({ ok: false, error: DUP_MSG });

    const { feeType, delegateFee } = currentFee();
    const membershipFee = nepaMember ? MEMBERSHIP_FEE : 0;
    const subtotal = delegateFee + membershipFee;
    const gstAmount = Math.round(subtotal * GST_RATE);
    const totalAmount = subtotal + gstAmount;
    const screenshotUrl = req.file ? await uploads.saveUpload(req.file) : null;

    let record;
    try {
      record = await store.addRegistration({
        fullName, mobile, email, organization, gstNumber: gstNumber || null, nepaMember, feeType,
        delegateFee, membershipFee, subtotal, gstRate: GST_RATE, gstAmount, totalAmount,
        paymentMethod, referenceNo: referenceNo || null, screenshotUrl, note: note || null,
      });
    } catch (e) {
      // Race: two submits with the same number at once — DB unique index wins.
      if (e && e.code === 'DUPLICATE_MOBILE') {
        if (screenshotUrl) await uploads.deleteUpload(screenshotUrl); // don't orphan the file
        return res.status(409).json({ ok: false, error: DUP_MSG });
      }
      throw e;
    }

    res.json({
      ok: true,
      regId: record.regId,
      totalAmount: record.totalAmount,
      feeType: record.feeType,
      fullName: record.fullName,
    });
}

// Health / storage diagnostics — actually probes the datastore so it reflects
// real connectivity (not just whether env vars are present).
app.get('/api/health', async (req, res) => {
  let db = 'ok';
  let dbError = null;
  try {
    await store.listMessages(); // cheap read; throws if the table/connection is broken
  } catch (err) {
    db = 'error';
    dbError = err.message;
  }
  res.json({
    ok: db === 'ok',
    store: store.backend,        // 'supabase' or 'json-file'
    uploads: uploads.backend,    // 'supabase-storage' | 'vercel-blob' | 'disk'
    persistent: store.backend !== 'json-file',
    db,                          // 'ok' or 'error'
    dbError,                     // surfaces the real reason if db === 'error'
  });
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

// Admin login -> stateless token. Hardened: lockout + constant-time + hashing.
app.post('/api/admin/login', wrap(async (req, res) => {
  const { id, password } = req.body || {};
  const key = loginKey(req, id);

  const lockedMs = loginLock(key);
  if (lockedMs > 0) {
    return res.status(429).json({
      ok: false,
      error: `Too many failed attempts. Try again in ${Math.ceil(lockedMs / 60000)} minute(s).`,
    });
  }

  // Small fixed delay blunts rapid online guessing.
  await new Promise((r) => setTimeout(r, 250));

  const idStr = String(id == null ? '' : id);
  const pwStr = String(password == null ? '' : password);

  const adminOk = auth.safeEqual(idStr, ADMIN_ID) &&
    auth.verifyPassword(pwStr, ADMIN_PASSWORD_HASH || ADMIN_PASSWORD);
  const viewerOk = !adminOk && auth.safeEqual(idStr, VIEWER_ID) &&
    auth.verifyPassword(pwStr, VIEWER_PASSWORD_HASH || VIEWER_PASSWORD);
  const hotelOk = !adminOk && !viewerOk && auth.safeEqual(idStr, HOTEL_ID) &&
    auth.verifyPassword(pwStr, HOTEL_PASSWORD_HASH || HOTEL_PASSWORD);
  const gateOk = !adminOk && !viewerOk && !hotelOk && auth.safeEqual(idStr, GATE_ID) &&
    auth.verifyPassword(pwStr, GATE_PASSWORD_HASH || GATE_PASSWORD);

  if (adminOk) {
    loginAttempts.delete(key);
    return res.json({ ok: true, role: 'admin', token: auth.sign('admin') });
  }
  if (viewerOk) {
    loginAttempts.delete(key);
    return res.json({ ok: true, role: 'viewer', token: auth.sign('viewer') });
  }
  if (hotelOk) {
    loginAttempts.delete(key);
    return res.json({ ok: true, role: 'hotel', token: auth.sign('hotel') });
  }
  if (gateOk) {
    loginAttempts.delete(key);
    return res.json({ ok: true, role: 'gate', token: auth.sign('gate') });
  }

  // Dynamic users created from the admin panel (e.g. 'print' operators).
  if (!adminOk && !viewerOk && !hotelOk && !gateOk) {
    let u = null;
    try { u = await store.findAdminUserByUsername(idStr); } catch (e) { u = null; }
    if (u && auth.verifyPassword(pwStr, u.passwordHash)) {
      loginAttempts.delete(key);
      return res.json({ ok: true, role: u.role, uid: u.id, token: auth.sign(u.role, { uid: u.id }) });
    }
  }

  loginNoteFail(key);
  res.status(401).json({ ok: false, error: 'Invalid credentials' });
}));

/* ---- Admin user management (create 'print' operators, etc.) ---- */
const RESERVED_IDS = [ADMIN_ID, VIEWER_ID, HOTEL_ID, GATE_ID].map((s) => String(s).toLowerCase());

app.get('/api/admin/users', auth.middleware, auth.requireRole('admin'), wrap(async (req, res) => {
  res.json({ ok: true, users: await store.listAdminUsers() });
}));

app.post('/api/admin/users', auth.middleware, auth.requireRole('admin'), wrap(async (req, res) => {
  const b = req.body || {};
  const username = String(b.username || '').trim();
  const password = String(b.password || '');
  const label = String(b.label || '').trim();
  const role = 'staff'; // staff = ID cards + party help desk + on-spot + scanner
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    return res.status(400).json({ ok: false, error: 'Username: 3–32 letters, numbers, dot, dash or underscore.' });
  }
  if (RESERVED_IDS.includes(username.toLowerCase())) {
    return res.status(400).json({ ok: false, error: 'That username is reserved. Choose another.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters.' });
  }
  try {
    const user = await store.addAdminUser({ username, passwordHash: auth.hashPassword(password), label, role });
    res.json({ ok: true, user });
  } catch (e) {
    if (e && e.code === 'DUPLICATE') return res.status(409).json({ ok: false, error: e.message });
    throw e;
  }
}));

app.delete('/api/admin/users/:id', auth.middleware, auth.requireRole('admin'), wrap(async (req, res) => {
  const removed = await store.deleteAdminUser(req.params.id);
  if (!removed) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, deleted: true });
}));

/* ---- Backups (full snapshots) + clearing live data (admin only) ---- */
app.get('/api/admin/backups', auth.middleware, auth.requireRole('admin'), wrap(async (req, res) => {
  res.json({ ok: true, backups: await store.listBackups() });
}));

app.post('/api/admin/backups', auth.middleware, auth.requireRole('admin'), wrap(async (req, res) => {
  const label = String((req.body || {}).label || '').trim() || null;
  const backup = await store.addBackup(label);
  res.json({ ok: true, backup });
}));

app.get('/api/admin/backups/:id', auth.middleware, auth.requireRole('admin'), wrap(async (req, res) => {
  const backup = await store.getBackup(req.params.id);
  if (!backup) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, backup });
}));

app.delete('/api/admin/backups/:id', auth.middleware, auth.requireRole('admin'), wrap(async (req, res) => {
  const removed = await store.deleteBackup(req.params.id);
  if (!removed) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, deleted: true });
}));

// Back up everything, then clear the chosen live data. Always snapshots first
// so nothing is ever lost. scope: 'registrations' | 'hotels' | 'all'.
app.post('/api/admin/clear', auth.middleware, auth.requireRole('admin'), wrap(async (req, res) => {
  const scope = ['registrations', 'hotels', 'all'].includes((req.body || {}).scope) ? req.body.scope : 'all';
  const backup = await store.addBackup(`Auto backup before clearing ${scope}`);
  const cleared = {};
  if (scope === 'registrations' || scope === 'all') { await store.clearAllRegistrations(); cleared.registrations = true; }
  if (scope === 'hotels' || scope === 'all') { await store.clearAllHotelBookings(); cleared.hotels = true; }
  res.json({ ok: true, backup, cleared });
}));

/* ---- Parties (paid delegate allocations) + help-desk delegate entry ---- */
const helpTeam = [auth.middleware, auth.requireRole('admin', 'print', 'staff')];
const upper = (s) => String(s == null ? '' : s).trim().toUpperCase();

// List all parties with live filled/remaining counts (admin + help desk).
app.get('/api/parties', ...helpTeam, wrap(async (req, res) => {
  res.json({ ok: true, parties: await store.listParties() });
}));

// One-time import of the allocation list (admin). Replaces the parties list.
app.post('/api/admin/parties/import', auth.middleware, auth.requireRole('admin'), wrap(async (req, res) => {
  const rows = Array.isArray((req.body || {}).rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ ok: false, error: 'No party rows to import' });
  if (rows.length > 5000) return res.status(400).json({ ok: false, error: 'Too many rows' });
  const result = await store.importParties(rows);
  res.json({ ok: true, ...result });
}));

// Set/raise a party's paid delegate count (accountant flow).
app.patch('/api/parties/:id/count', ...helpTeam, wrap(async (req, res) => {
  const count = Number((req.body || {}).count);
  if (!Number.isFinite(count) || count < 0 || count > 999) return res.status(400).json({ ok: false, error: 'Enter a valid number of delegates.' });
  const party = await store.setPartyCount(req.params.id, count);
  if (!party) return res.status(404).json({ ok: false, error: 'Party not found' });
  res.json({ ok: true, party });
}));

// Add a delegate against a party's paid pass (help desk). Uppercased; capped.
app.post('/api/parties/:id/delegates', ...helpTeam, wrap(async (req, res) => {
  const b = req.body || {};
  const fullName = upper(b.fullName);
  const organization = upper(b.organization);
  const designation = upper(b.designation);
  const mobile = String(b.mobile || '').replace(/\D/g, '');
  if (!fullName) return res.status(400).json({ ok: false, error: 'Name is required' });
  if (mobile && !MOBILE_RE.test(mobile)) return res.status(400).json({ ok: false, error: 'Phone must be 10 digits (or leave it blank)' });
  try {
    const reg = await store.addPartyDelegate(req.params.id, { fullName, organization, designation, mobile: mobile || null });
    res.json({ ok: true, registration: reg });
  } catch (e) {
    if (e && ['NO_PARTY', 'NO_COUNT', 'PARTY_FULL'].includes(e.code)) return res.status(409).json({ ok: false, error: e.message });
    if (e && e.code === 'DUPLICATE_MOBILE') return res.status(409).json({ ok: false, error: 'That phone is already registered.' });
    throw e;
  }
}));

// Logout — tokens are stateless; the client clears its own session.
app.post('/api/admin/logout', auth.middleware, (req, res) => res.json({ ok: true }));

// Registrations (active list) — admin + viewer + print (for ID cards)
app.get('/api/registrations', auth.middleware, auth.requireRole('admin', 'viewer', 'print', 'staff'), wrap(async (req, res) => {
  res.json({ ok: true, registrations: await store.listRegistrations() });
}));

// Archived (soft-deleted) registrations — recoverable
app.get('/api/registrations/archived', auth.middleware, auth.requireRole('admin', 'viewer'), wrap(async (req, res) => {
  res.json({ ok: true, registrations: await store.listArchivedRegistrations() });
}));

app.patch('/api/registrations/:id/status', auth.middleware, auth.requireRole('admin'), wrap(async (req, res) => {
  const status = await store.setRegistrationStatus(req.params.id, (req.body && req.body.status) || null);
  if (status === null) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, status });
}));

// "Delete" now ARCHIVES — the record is hidden but kept and recoverable.
// Nothing is ever permanently removed here, and the screenshot is preserved.
app.delete('/api/registrations/:id', auth.middleware, auth.requireRole('admin'), wrap(async (req, res) => {
  let removed;
  try {
    removed = await store.archiveRegistration(req.params.id);
  } catch (err) {
    if (err && err.code === 'NEEDS_MIGRATION') return res.status(409).json({ ok: false, error: err.message });
    throw err;
  }
  if (!removed) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, archived: true });
}));

// Restore an archived registration back to the active list
app.post('/api/registrations/:id/restore', auth.middleware, auth.requireRole('admin'), wrap(async (req, res) => {
  const restored = await store.restoreRegistration(req.params.id);
  if (!restored) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, restored: true });
}));

// Permanent removal — only meaningful for already-archived records.
app.delete('/api/registrations/:id/purge', auth.middleware, auth.requireRole('admin'), wrap(async (req, res) => {
  const removed = await store.purgeRegistration(req.params.id);
  if (!removed) return res.status(404).json({ ok: false, error: 'Not found' });
  if (removed.screenshotUrl) await uploads.deleteUpload(removed.screenshotUrl);
  res.json({ ok: true, purged: true });
}));

// One-click full backup (active + archived + enquiries) as downloadable JSON
app.get('/api/admin/backup', auth.middleware, auth.requireRole('admin', 'viewer'), wrap(async (req, res) => {
  const [registrations, messages] = await Promise.all([
    store.allRegistrationsForBackup(),
    store.listMessages(),
  ]);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  res.setHeader('Content-Disposition', `attachment; filename="nepa-backup-${stamp}.json"`);
  res.json({ takenAt: new Date().toISOString(), backend: store.backend, counts: { registrations: registrations.length, messages: messages.length }, registrations, messages });
}));

// Enquiry messages
app.get('/api/messages', auth.middleware, auth.requireRole('admin', 'viewer'), wrap(async (req, res) => {
  res.json({ ok: true, messages: await store.listMessages() });
}));

app.patch('/api/messages/:id/read', auth.middleware, auth.requireRole('admin'), wrap(async (req, res) => {
  const read = await store.setMessageRead(req.params.id, req.body && typeof req.body.read === 'boolean' ? req.body.read : undefined);
  if (read === null) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, read });
}));

app.delete('/api/messages/:id', auth.middleware, auth.requireRole('admin'), wrap(async (req, res) => {
  const ok = await store.deleteMessage(req.params.id);
  if (!ok) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true });
}));

/* ============================================================
   HOTEL ACCOMMODATION
   ============================================================ */

// PUBLIC — active hotels for the booking form (id, prices, rooms left).
app.get('/api/hotels', wrap(async (req, res) => {
  const hotels = (await store.listHotelsPublic()).map((h) => ({
    id: h.id, name: h.name, address: h.address,
    singlePrice: h.singlePrice, doublePrice: h.doublePrice,
    totalRooms: h.totalRooms, roomsRemaining: h.roomsRemaining,
    full: h.roomsRemaining <= 0,
  }));
  res.json({ ok: true, hotels, gstRate: GST_RATE });
}));

// PUBLIC — create a hotel booking (multipart: optional "screenshot")
app.post('/api/hotel-bookings', (req, res) => {
  upload.single('screenshot')(req, res, (err) => {
    handleHotelBooking(req, res, err).catch((e) => {
      console.error('hotel booking failed:', e);
      if (!res.headersSent) res.status(500).json({ ok: false, error: 'Could not save your booking. Please try again or contact the Secretariat.' });
    });
  });
});

async function handleHotelBooking(req, res, err) {
  if (err) return res.status(400).json({ ok: false, error: err.message });
  const b = req.body || {};
  const hotelId = (b.hotelId || '').trim();
  const occupancy = (b.occupancy || '').trim();
  const fullName = (b.fullName || '').trim();
  const firm = (b.firm || '').trim();
  const address = (b.address || '').trim();
  const mobile = (b.mobile || '').trim();
  const email = (b.email || '').trim();
  const guestName = (b.guestName || '').trim();
  const paymentMethod = (b.paymentMethod || '').trim();
  const referenceNo = (b.referenceNo || '').trim();
  const note = (b.note || '').trim();

  if (!hotelId) return res.status(400).json({ ok: false, error: 'Please choose a hotel' });
  if (occupancy !== 'Single' && occupancy !== 'Double') return res.status(400).json({ ok: false, error: 'Please choose an occupancy' });
  if (!fullName) return res.status(400).json({ ok: false, error: 'Full name is required' });
  if (!firm) return res.status(400).json({ ok: false, error: 'Firm name is required' });
  if (!address) return res.status(400).json({ ok: false, error: 'Address is required' });
  if (!MOBILE_RE.test(mobile)) return res.status(400).json({ ok: false, error: 'Mobile must be exactly 10 digits' });
  if (email && !EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'Enter a valid email or leave it blank' });
  if (!VALID_METHODS.includes(paymentMethod)) return res.status(400).json({ ok: false, error: 'Invalid payment method' });
  if ((paymentMethod === 'UPI' || paymentMethod === 'Bank') && !req.file) {
    return res.status(400).json({ ok: false, error: 'Payment screenshot is required for UPI and Bank Transfer' });
  }

  const hotel = await store.getHotel(hotelId);
  if (!hotel || !hotel.active) return res.status(400).json({ ok: false, error: 'That hotel is no longer available. Please pick another.' });

  // Price is computed server-side from the hotel record (never trust the client).
  const roomPrice = occupancy === 'Single' ? hotel.singlePrice : hotel.doublePrice;
  const subtotal = roomPrice;
  const gstAmount = Math.round(subtotal * GST_RATE);
  const totalAmount = subtotal + gstAmount;
  const screenshotUrl = req.file ? await uploads.saveUpload(req.file) : null;

  let booking;
  try {
    booking = await store.addHotelBooking({
      hotelId, occupancy, guestName: occupancy === 'Double' ? guestName : null,
      fullName, firm, address, mobile, email,
      roomPrice, subtotal, gstRate: GST_RATE, gstAmount, totalAmount,
      paymentMethod, referenceNo, screenshotUrl, note,
    });
  } catch (e) {
    if (e && (e.code === 'HOTEL_FULL' || e.code === 'HOTEL_UNAVAILABLE')) {
      if (screenshotUrl) await uploads.deleteUpload(screenshotUrl);
      return res.status(409).json({ ok: false, error: e.message });
    }
    throw e;
  }

  res.json({ ok: true, bookingId: booking.bookingId, hotelName: booking.hotelName, occupancy: booking.occupancy, totalAmount: booking.totalAmount });
}

/* ---- Hotel management + bookings (admin + hotel roles) ---- */
const hotelTeam = [auth.middleware, auth.requireRole('admin', 'hotel')];

app.get('/api/admin/hotels', ...hotelTeam, wrap(async (req, res) => {
  res.json({ ok: true, hotels: await store.listHotels() });
}));

app.post('/api/admin/hotels', ...hotelTeam, wrap(async (req, res) => {
  const b = req.body || {};
  const name = (b.name || '').trim();
  if (!name) return res.status(400).json({ ok: false, error: 'Hotel name is required' });
  const hotel = await store.addHotel({
    name, address: (b.address || '').trim() || null,
    totalRooms: Math.max(0, parseInt(b.totalRooms, 10) || 0),
    singlePrice: Math.max(0, parseInt(b.singlePrice, 10) || 0),
    doublePrice: Math.max(0, parseInt(b.doublePrice, 10) || 0),
    active: b.active !== false && b.active !== 'false',
    sort: parseInt(b.sort, 10) || 0,
  });
  res.json({ ok: true, hotel });
}));

app.patch('/api/admin/hotels/:id', ...hotelTeam, wrap(async (req, res) => {
  const b = req.body || {};
  const fields = {};
  if ('name' in b) { const n = String(b.name).trim(); if (!n) return res.status(400).json({ ok: false, error: 'Hotel name cannot be empty' }); fields.name = n; }
  if ('address' in b) fields.address = String(b.address || '').trim() || null;
  if ('totalRooms' in b) fields.totalRooms = Math.max(0, parseInt(b.totalRooms, 10) || 0);
  if ('singlePrice' in b) fields.singlePrice = Math.max(0, parseInt(b.singlePrice, 10) || 0);
  if ('doublePrice' in b) fields.doublePrice = Math.max(0, parseInt(b.doublePrice, 10) || 0);
  if ('active' in b) fields.active = b.active === true || b.active === 'true';
  if ('sort' in b) fields.sort = parseInt(b.sort, 10) || 0;
  const hotel = await store.updateHotel(req.params.id, fields);
  if (!hotel) return res.status(404).json({ ok: false, error: 'Hotel not found' });
  res.json({ ok: true, hotel });
}));

app.delete('/api/admin/hotels/:id', ...hotelTeam, wrap(async (req, res) => {
  const removed = await store.deleteHotel(req.params.id);
  if (!removed) return res.status(404).json({ ok: false, error: 'Hotel not found' });
  res.json({ ok: true });
}));

app.get('/api/hotel-bookings', ...hotelTeam, wrap(async (req, res) => {
  res.json({ ok: true, bookings: await store.listHotelBookings() });
}));

app.get('/api/hotel-bookings/archived', ...hotelTeam, wrap(async (req, res) => {
  res.json({ ok: true, bookings: await store.listArchivedHotelBookings() });
}));

app.patch('/api/hotel-bookings/:id/status', ...hotelTeam, wrap(async (req, res) => {
  const status = await store.setHotelBookingStatus(req.params.id, (req.body && req.body.status) || null);
  if (status === null) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, status });
}));

app.delete('/api/hotel-bookings/:id', ...hotelTeam, wrap(async (req, res) => {
  const archived = await store.archiveHotelBooking(req.params.id);
  if (!archived) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, archived: true });
}));

app.post('/api/hotel-bookings/:id/restore', ...hotelTeam, wrap(async (req, res) => {
  const restored = await store.restoreHotelBooking(req.params.id);
  if (!restored) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, restored: true });
}));

app.delete('/api/hotel-bookings/:id/purge', ...hotelTeam, wrap(async (req, res) => {
  const removed = await store.purgeHotelBooking(req.params.id);
  if (!removed) return res.status(404).json({ ok: false, error: 'Not found' });
  if (removed.screenshotUrl) await uploads.deleteUpload(removed.screenshotUrl);
  res.json({ ok: true, purged: true });
}));

/* ------------------------------------------------------------------ *
 * ID CARDS — edit details, bulk import, mark printed (admin only)
 * ------------------------------------------------------------------ */
const adminOnly = [auth.middleware, auth.requireRole('admin')];

// Edit a registrant (fill designation/city, correct details). Admin + print.
app.patch('/api/registrations/:id', auth.middleware, auth.requireRole('admin', 'print', 'staff'), wrap(async (req, res) => {
  const b = req.body || {};
  const allowed = ['fullName', 'mobile', 'email', 'organization', 'gstNumber', 'designation', 'city'];
  const fields = {};
  for (const k of allowed) {
    if (k in b) fields[k] = typeof b[k] === 'string' ? b[k].trim() : b[k];
  }
  if (fields.mobile && !MOBILE_RE.test(String(fields.mobile))) {
    return res.status(400).json({ ok: false, error: 'Mobile must be exactly 10 digits' });
  }
  const updated = await store.updateRegistration(req.params.id, fields);
  if (!updated) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, registration: updated });
}));

// Admin manually registers one delegate (works even when public reg is closed).
// On-spot registration by staff/admin (multipart: "screenshot" for non-cash).
// Fixed Spot rate + GST. Non-cash requires a screenshot; cash requires the
// name of who received it. Works even though public registration is closed.
app.post('/api/registrations/onspot', auth.middleware, auth.requireRole('admin', 'staff', 'print'), (req, res) => {
  upload.single('screenshot')(req, res, (err) => {
    handleOnspot(req, res, err).catch((e) => {
      console.error('onspot failed:', e);
      if (!res.headersSent) res.status(500).json({ ok: false, error: 'Could not save. Please try again.' });
    });
  });
});
async function handleOnspot(req, res, err) {
  if (err) return res.status(400).json({ ok: false, error: err.message });
  const b = req.body || {};
  const fullName = upper(b.fullName);
  const organization = upper(b.organization);
  const designation = upper(b.designation);
  const city = upper(b.city);
  const mobile = String(b.mobile || '').replace(/\D/g, '');
  const paymentMethod = String(b.paymentMethod || '').trim();
  const cashCollectedBy = upper(b.cashCollectedBy);
  const referenceNo = String(b.referenceNo || '').trim();
  if (!fullName) return res.status(400).json({ ok: false, error: 'Name is required' });
  if (mobile && !MOBILE_RE.test(mobile)) return res.status(400).json({ ok: false, error: 'Phone must be 10 digits (or leave it blank)' });
  if (!VALID_METHODS.includes(paymentMethod)) return res.status(400).json({ ok: false, error: 'Choose a payment method' });
  if ((paymentMethod === 'UPI' || paymentMethod === 'Bank') && !req.file) {
    return res.status(400).json({ ok: false, error: 'Upload the payment screenshot for UPI / Bank' });
  }
  if (paymentMethod === 'Cash' && !cashCollectedBy) {
    return res.status(400).json({ ok: false, error: 'Enter who received the cash' });
  }
  const subtotal = DELEGATE_FEE_SPOT;               // fixed Spot rate
  const gstAmount = Math.round(subtotal * GST_RATE);
  const totalAmount = subtotal + gstAmount;
  const screenshotUrl = req.file ? await uploads.saveUpload(req.file) : null;
  const note = paymentMethod === 'Cash' ? `Cash received by: ${cashCollectedBy}` : null;
  let record;
  try {
    record = await store.addRegistration({
      fullName, mobile: mobile || null, email: null, organization: organization || null,
      designation: designation || null, city: city || null, gstNumber: null, nepaMember: false,
      feeType: 'Spot', delegateFee: DELEGATE_FEE_SPOT, membershipFee: 0, subtotal, gstRate: GST_RATE,
      gstAmount, totalAmount, paymentMethod, referenceNo: referenceNo || null, screenshotUrl, note, source: 'onspot',
    });
  } catch (e) {
    if (e && e.code === 'DUPLICATE_MOBILE') {
      if (screenshotUrl) await uploads.deleteUpload(screenshotUrl);
      return res.status(409).json({ ok: false, error: 'That phone is already registered.' });
    }
    throw e;
  }
  if (record && record.id) { try { await store.setRegistrationStatus(record.id, 'Confirmed'); } catch (e) { /* non-fatal */ } }
  res.json({ ok: true, registration: record });
}

app.post('/api/registrations/manual', ...adminOnly, wrap(async (req, res) => {
  const b = req.body || {};
  const fullName = (b.fullName || '').trim();
  const mobile = (b.mobile || '').replace(/\D/g, '');
  const email = (b.email || '').trim();
  const organization = (b.organization || '').trim();
  const gstNumber = (b.gstNumber || '').trim().toUpperCase();
  const designation = (b.designation || '').trim();
  const city = (b.city || '').trim();
  const note = (b.note || '').trim();
  const nepaMember = b.nepaMember === true || b.nepaMember === 'true';
  const paymentMethod = (b.paymentMethod || 'Offline').trim();
  const status = b.status === 'Pending' ? 'Pending' : 'Confirmed';

  if (!fullName) return res.status(400).json({ ok: false, error: 'Full name is required' });
  if (!MOBILE_RE.test(mobile)) return res.status(400).json({ ok: false, error: 'Mobile must be exactly 10 digits' });
  if (email && !EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'Enter a valid email or leave it blank' });

  const existing = await store.findRegistrationByMobile(mobile);
  if (existing) return res.status(409).json({ ok: false, error: `That mobile is already registered (${existing.regId || 'existing delegate'}).` });

  const { feeType, delegateFee } = currentFee();
  const membershipFee = nepaMember ? MEMBERSHIP_FEE : 0;
  const subtotal = delegateFee + membershipFee;
  const gstAmount = Math.round(subtotal * GST_RATE);
  const totalAmount = subtotal + gstAmount;

  let record;
  try {
    record = await store.addRegistration({
      fullName, mobile, email, organization, gstNumber: gstNumber || null,
      designation: designation || null, city: city || null, source: 'manual',
      nepaMember, feeType, delegateFee, membershipFee, subtotal, gstRate: GST_RATE, gstAmount, totalAmount,
      paymentMethod, referenceNo: null, screenshotUrl: null, note: note || null,
    });
  } catch (e) {
    if (e && e.code === 'DUPLICATE_MOBILE') return res.status(409).json({ ok: false, error: 'That mobile is already registered.' });
    throw e;
  }
  if (status === 'Confirmed' && record && record.id) { try { await store.setRegistrationStatus(record.id, 'Confirmed'); } catch { /* non-fatal */ } }
  res.json({ ok: true, registration: record });
}));

// Bulk import offline registrants parsed from an Excel file (client sends rows).
app.post('/api/registrations/bulk-import', ...adminOnly, wrap(async (req, res) => {
  const b = req.body || {};
  const rows = Array.isArray(b.rows) ? b.rows : [];
  if (!rows.length) return res.status(400).json({ ok: false, error: 'No rows to import' });
  if (rows.length > 5000) return res.status(400).json({ ok: false, error: 'Too many rows (max 5000 per import)' });
  const report = await store.bulkImportRegistrations(rows, { onDuplicate: b.onDuplicate });
  res.json({ ok: true, report });
}));

// Mark one or more delegates' ID cards as printed. Admin + print.
app.post('/api/registrations/mark-printed', auth.middleware, auth.requireRole('admin', 'print', 'staff'), wrap(async (req, res) => {
  const ids = Array.isArray((req.body || {}).ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ ok: false, error: 'No ids' });
  const result = await store.markCardPrinted(ids);
  res.json({ ok: true, ...result });
}));

/* ------------------------------------------------------------------ *
 * MEALS + CHECK-IN
 *   - admin manages the meal catalog
 *   - the 'gate' role (and admin) run the scanner + redeem
 * ------------------------------------------------------------------ */
const gateTeam = [auth.middleware, auth.requireRole('admin', 'gate', 'staff')];

// List meals (with redeemed counts) — gate picks which meal to man.
app.get('/api/meals', ...gateTeam, wrap(async (req, res) => {
  res.json({ ok: true, meals: await store.mealStats() });
}));

app.post('/api/meals', ...adminOnly, wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.name || !String(b.name).trim()) return res.status(400).json({ ok: false, error: 'Meal name is required' });
  const meal = await store.addMeal({
    name: String(b.name).trim(), mealDay: b.mealDay, kind: b.kind, maxPerPerson: b.maxPerPerson, active: b.active, sort: b.sort,
  });
  res.json({ ok: true, meal });
}));

app.patch('/api/meals/:id', ...adminOnly, wrap(async (req, res) => {
  const updated = await store.updateMeal(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, meal: updated });
}));

app.delete('/api/meals/:id', ...adminOnly, wrap(async (req, res) => {
  const removed = await store.deleteMeal(req.params.id);
  if (!removed) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, deleted: true });
}));

// Look up a delegate by scanned QR token (verify-only, no redemption).
app.get('/api/lookup', ...gateTeam, wrap(async (req, res) => {
  const token = vcard.tokenFromScan(req.query.token || req.query.q || '');
  if (!token) return res.status(400).json({ ok: false, error: 'No token' });
  const reg = await store.findRegistrationByToken(token);
  if (!reg) return res.status(404).json({ ok: false, error: 'Not a valid delegate QR' });
  res.json({ ok: true, registrant: reg });
}));

// The check-in. Body: { token | regId, mealId, by }. token may be a raw vCard.
app.post('/api/redeem', ...gateTeam, wrap(async (req, res) => {
  const b = req.body || {};
  const mealId = b.mealId;
  if (!mealId) return res.status(400).json({ ok: false, error: 'Pick a meal first' });
  const token = b.token ? vcard.tokenFromScan(b.token) : null;
  const regId = b.regId ? String(b.regId).trim() : null;
  if (!token && !regId) return res.status(400).json({ ok: false, error: 'No QR / delegate id' });
  const result = await store.redeemMeal({ token, regId, mealId, by: b.by || req.auth.role });
  res.json({ ok: true, ...result });
}));

// Check-in log: who was served, when, by which gate. Optional ?mealId=
app.get('/api/redemptions', auth.middleware, auth.requireRole('admin', 'viewer'), wrap(async (req, res) => {
  const redemptions = await store.listRedemptions({ mealId: req.query.mealId || null });
  res.json({ ok: true, redemptions });
}));

// Delete one check-in (undo a mistaken scan) — admin or gate.
app.delete('/api/redemptions/:id', auth.middleware, auth.requireRole('admin', 'gate'), wrap(async (req, res) => {
  const removed = await store.deleteRedemption(req.params.id);
  if (!removed) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, deleted: true });
}));

// Clean URLs for the static sub-pages (Vercel mirrors these via vercel.json rewrites)
const PAGES = { '/admin': 'admin.html', '/sponsorship': 'sponsorship.html', '/people': 'people.html', '/register': 'register.html', '/hotel': 'hotel.html', '/scan': 'scan.html' };
for (const [route, file] of Object.entries(PAGES)) {
  app.get(route, (req, res) => res.sendFile(path.join(PUBLIC_DIR, file)));
}

/* ------------------------------------------------------------------ *
 * START (only when run directly; on Vercel the app is imported)
 * ------------------------------------------------------------------ */
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`NEPA Conclave server running on http://localhost:${PORT}  [store: ${store.backend}, uploads: ${uploads.backend}]`);
  });
}

module.exports = app;
