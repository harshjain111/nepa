'use strict';

/**
 * vCard 3.0 helpers for the ID-card QR.
 *
 * The QR encodes a vCard string: a normal phone camera recognizes it and offers
 * "Add to Contacts" with the delegate's details pre-filled. We also embed our
 * per-delegate token in the UID field so the meal scanner can identify the
 * delegate from the same QR.
 */

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function buildVCard(reg) {
  const name = esc(reg.fullName || '');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${name};;;;`, `FN:${name}`];
  if (reg.organization) lines.push(`ORG:${esc(reg.organization)}`);
  if (reg.designation) lines.push(`TITLE:${esc(reg.designation)}`);
  if (reg.mobile) lines.push(`TEL;TYPE=CELL:${esc(reg.mobile)}`);
  if (reg.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(reg.email)}`);
  if (reg.city) lines.push(`ADR;TYPE=WORK:;;;${esc(reg.city)};;;`);
  if (reg.qrToken) lines.push(`UID:NEPA26:${esc(reg.qrToken)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

// Pull our token back out of a scanned QR payload (scanner side). Accepts a raw
// vCard string or a bare token.
function tokenFromScan(text) {
  if (!text) return null;
  const s = String(text).trim();
  const m = s.match(/UID:NEPA26:([a-f0-9]+)/i);
  if (m) return m[1];
  // Bare token (e.g. manually keyed or a plain-token QR).
  if (/^[a-f0-9]{16,}$/i.test(s)) return s.toLowerCase();
  return null;
}

module.exports = { buildVCard, tokenFromScan };
