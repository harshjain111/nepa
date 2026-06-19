'use strict';

/**
 * Stateless admin auth — an HMAC-signed token with an expiry.
 * No server-side store, so it works across serverless invocations
 * (unlike an in-memory Set, which doesn't survive on Vercel).
 */

const crypto = require('crypto');

const SECRET =
  process.env.AUTH_SECRET ||
  process.env.ADMIN_PASSWORD ||
  'nepa-dev-secret-change-me';

const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function sign() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

function middleware(req, res, next) {
  const m = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!m || !verify(m[1])) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

module.exports = { sign, verify, middleware };
