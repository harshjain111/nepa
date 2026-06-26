#!/usr/bin/env node
'use strict';

/**
 * Generate a scrypt hash for the admin (or viewer) password, so the real
 * password is never stored in plaintext on the server / in env vars.
 *
 *   npm run hash-password -- 'YourStr0ng!Passphrase'
 *
 * Copy the printed value into the Vercel env var:
 *   ADMIN_PASSWORD_HASH=scrypt$....
 *   (or VIEWER_PASSWORD_HASH=... for the read-only account)
 *
 * Then you can remove the plaintext ADMIN_PASSWORD.
 */

const auth = require('../lib/auth');

const pw = process.argv.slice(2).join(' ');
if (!pw) {
  console.error("Usage: npm run hash-password -- '<password>'");
  process.exit(1);
}

const issues = auth.passwordIssues(pw);
if (issues.length) {
  console.error('\n⚠  Weak password. To make it strong: ' + issues.join('; ') + '.');
  console.error('   (Hashing anyway — but consider a stronger one.)\n');
}

const hash = auth.hashPassword(pw);
console.log('\nAdd ONE of these to your environment (Vercel → Settings → Environment Variables):\n');
console.log('  ADMIN_PASSWORD_HASH=' + hash);
console.log('  # or, for the read-only account:');
console.log('  VIEWER_PASSWORD_HASH=' + hash);
console.log('\nThen delete the plaintext ADMIN_PASSWORD / VIEWER_PASSWORD.\n');
