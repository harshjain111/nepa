'use strict';

/**
 * Minimal .env loader for LOCAL dev only (no dependency).
 * On Vercel (process.env.VERCEL set), environment variables are injected
 * by the platform, so this is skipped. Existing env vars are never overwritten.
 */

const fs = require('fs');
const path = require('path');

if (!process.env.VERCEL) {
  for (const file of ['.env.local', '.env']) {
    const p = path.join(__dirname, '..', file);
    if (!fs.existsSync(p)) continue;
    for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && !(key in process.env)) process.env[key] = val;
    }
  }
}
