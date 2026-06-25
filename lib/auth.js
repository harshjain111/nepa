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

module.exports = { sign, verify, middleware, requireWrite };
