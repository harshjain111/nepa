'use strict';

/**
 * Stateless admin auth — an HMAC-signed token carrying a role + expiry.
 * No server-side store, so it works across serverless invocations.
 *
 * Roles:
 *   'admin'  — full access (view + change status + delete)
 *   'viewer' — read-only (view records & screenshots; no edits/deletes)
 */

const crypto = require('crypto');

const SECRET =
  process.env.AUTH_SECRET ||
  process.env.ADMIN_PASSWORD ||
  'nepa-dev-secret-change-me';

const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function sign(role) {
  const payload = Buffer
    .from(JSON.stringify({ exp: Date.now() + TTL_MS, role: role || 'admin' }))
    .toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

// Returns the decoded payload ({ exp, role }) on success, or null.
function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof data.exp !== 'number' || data.exp <= Date.now()) return null;
    return { exp: data.exp, role: data.role || 'admin' };
  } catch {
    return null;
  }
}

// Any authenticated user (admin or viewer). Attaches req.auth = { exp, role }.
function middleware(req, res, next) {
  const m = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  const payload = m && verify(m[1]);
  if (!payload) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  req.auth = payload;
  next();
}

// Mutations (status change, delete) — viewers are blocked.
function requireWrite(req, res, next) {
  if (!req.auth || req.auth.role === 'viewer') {
    return res.status(403).json({ ok: false, error: 'Read-only access — this account cannot make changes.' });
  }
  next();
}

/* ============================================================
   PASSWORD HARDENING
   - Constant-time comparison (no timing side-channels)
   - scrypt hashing (built-in crypto, no native deps) so the
     real password is never stored in plaintext
   - Strength validation for choosing a strong admin password
   ============================================================ */

const SCRYPT_KEYLEN = 64;

// Timing-safe string compare that never short-circuits on length.
function safeEqual(a, b) {
  const ab = Buffer.from(String(a == null ? '' : a));
  const bb = Buffer.from(String(b == null ? '' : b));
  if (ab.length !== bb.length) {
    // burn an equal-length compare so timing doesn't leak the length
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

// Produce a portable hash string: "scrypt$<saltHex>$<keyHex>".
function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(plain), salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

// Verify a candidate against either a scrypt hash or (dev) a plaintext value.
function verifyPassword(plain, stored) {
  if (!stored) return false;
  if (typeof stored === 'string' && stored.startsWith('scrypt$')) {
    const [, saltHex, keyHex] = stored.split('$');
    if (!saltHex || !keyHex) return false;
    let derived;
    try { derived = crypto.scryptSync(String(plain), Buffer.from(saltHex, 'hex'), SCRYPT_KEYLEN); }
    catch { return false; }
    const expected = Buffer.from(keyHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  }
  // plaintext fallback (local dev) — still constant-time
  return safeEqual(plain, stored);
}

// Returns a list of human-readable reasons a password is weak ([] = strong).
function passwordIssues(pw) {
  pw = String(pw == null ? '' : pw);
  const issues = [];
  if (pw.length < 12) issues.push('use at least 12 characters');
  if (!/[a-z]/.test(pw)) issues.push('add a lowercase letter');
  if (!/[A-Z]/.test(pw)) issues.push('add an uppercase letter');
  if (!/[0-9]/.test(pw)) issues.push('add a number');
  if (!/[^A-Za-z0-9]/.test(pw)) issues.push('add a symbol');
  if (/^(nepa|admin|password|12345|qwerty)/i.test(pw)) issues.push('avoid common words');
  return issues;
}

module.exports = {
  sign, verify, middleware, requireWrite,
  safeEqual, hashPassword, verifyPassword, passwordIssues,
};
