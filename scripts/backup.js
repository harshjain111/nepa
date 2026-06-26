#!/usr/bin/env node
'use strict';

/**
 * Download a full backup (all registrations incl. archived + enquiries) to a
 * local timestamped JSON file. Run anytime:
 *
 *   SITE_URL=https://www.nepaconnect.in ADMIN_ID=admin ADMIN_PASSWORD=... \
 *     npm run backup
 *
 * Defaults: SITE_URL=https://www.nepaconnect.in, ADMIN_ID=admin.
 * Files are written to ./backups/ (git-ignored — they hold personal data).
 */

const fs = require('fs');
const path = require('path');

const SITE = (process.env.SITE_URL || 'https://www.nepaconnect.in').replace(/\/+$/, '');
const ID = process.env.ADMIN_ID || 'admin';
const PASSWORD = process.env.ADMIN_PASSWORD;

async function main() {
  if (!PASSWORD) {
    console.error('Set ADMIN_PASSWORD (and optionally SITE_URL / ADMIN_ID).');
    process.exit(1);
  }
  const login = await fetch(`${SITE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: ID, password: PASSWORD }),
  }).then((r) => r.json());
  if (!login.ok || !login.token) throw new Error('Login failed: ' + (login.error || 'bad credentials'));

  const res = await fetch(`${SITE}/api/admin/backup`, {
    headers: { Authorization: `Bearer ${login.token}` },
  });
  if (!res.ok) throw new Error('Backup request failed: HTTP ' + res.status);
  const data = await res.json();

  const dir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(dir, `nepa-backup-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Saved ${data.counts.registrations} registrations + ${data.counts.messages} enquiries to ${file}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
