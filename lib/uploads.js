'use strict';

/**
 * Upload layer — dual mode.
 *  - If BLOB_READ_WRITE_TOKEN is set -> Vercel Blob (persistent on Vercel).
 *  - Otherwise                       -> local /uploads disk (zero-setup local dev).
 *
 * Works with multer memoryStorage: the file buffer is in memory and we
 * write it to the active backend, returning a URL to store on the record.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

function safeName(originalName) {
  const ext = (path.extname(originalName || '') || '').toLowerCase().slice(0, 10);
  const safeExt = /^\.(png|jpg|jpeg|webp|gif|heic|heif)$/.test(ext) ? ext : '.png';
  return crypto.randomBytes(16).toString('hex') + safeExt;
}

async function saveUpload(file) {
  if (!file) return null;
  const name = safeName(file.originalname);
  if (USE_BLOB) {
    const { put } = require('@vercel/blob');
    const blob = await put(`uploads/${name}`, file.buffer, {
      access: 'public',
      contentType: file.mimetype,
    });
    return blob.url; // absolute https URL
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, name), file.buffer);
  return `/uploads/${name}`;
}

async function deleteUpload(url) {
  if (!url) return;
  try {
    if (USE_BLOB && /^https?:\/\//.test(url)) {
      const { del } = require('@vercel/blob');
      await del(url);
    } else if (!/^https?:\/\//.test(url)) {
      fs.unlink(path.join(UPLOAD_DIR, path.basename(url)), () => {});
    }
  } catch (err) {
    console.error('Upload delete failed (non-fatal):', err.message);
  }
}

module.exports = { saveUpload, deleteUpload, UPLOAD_DIR, backend: USE_BLOB ? 'vercel-blob' : 'disk' };
