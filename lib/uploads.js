'use strict';

/**
 * Upload layer — pluggable, chosen by what's configured:
 *   1. Supabase Storage  (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 *   2. Vercel Blob       (BLOB_READ_WRITE_TOKEN)
 *   3. local /uploads disk (zero-setup local dev)
 *
 * Works with multer memoryStorage: the file buffer is in memory and we
 * write it to the active backend, returning a URL to store on the record.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const supabase = require('./supabase');

const SUPA_BUCKET = process.env.SUPABASE_BUCKET || 'screenshots';
const USE_SUPABASE = supabase.enabled;
const USE_BLOB = !USE_SUPABASE && !!process.env.BLOB_READ_WRITE_TOKEN;

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

function safeName(originalName) {
  const ext = (path.extname(originalName || '') || '').toLowerCase().slice(0, 10);
  const safeExt = /^\.(png|jpg|jpeg|webp|gif|heic|heif)$/.test(ext) ? ext : '.png';
  return crypto.randomBytes(16).toString('hex') + safeExt;
}

let bucketReady = null;
function ensureBucket() {
  if (!bucketReady) {
    bucketReady = supabase.getClient()
      .storage.createBucket(SUPA_BUCKET, { public: true })
      .then(({ error }) => {
        if (error && !/exist/i.test(error.message || '')) {
          console.error('Supabase createBucket:', error.message);
        }
      })
      .catch((err) => { console.error('Supabase createBucket:', err.message); });
  }
  return bucketReady;
}

async function saveUpload(file) {
  if (!file) return null;
  const name = safeName(file.originalname);

  if (USE_SUPABASE) {
    await ensureBucket();
    const { error } = await supabase.getClient()
      .storage.from(SUPA_BUCKET)
      .upload(name, file.buffer, { contentType: file.mimetype, upsert: false });
    if (error) throw new Error('Upload failed: ' + error.message);
    return supabase.getClient().storage.from(SUPA_BUCKET).getPublicUrl(name).data.publicUrl;
  }

  if (USE_BLOB) {
    const { put } = require('@vercel/blob');
    const blob = await put(`uploads/${name}`, file.buffer, { access: 'public', contentType: file.mimetype });
    return blob.url;
  }

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, name), file.buffer);
  return `/uploads/${name}`;
}

async function deleteUpload(url) {
  if (!url) return;
  try {
    if (USE_SUPABASE && url.includes('/storage/v1/object/public/')) {
      const key = url.split(`/public/${SUPA_BUCKET}/`)[1];
      if (key) await supabase.getClient().storage.from(SUPA_BUCKET).remove([decodeURIComponent(key)]);
    } else if (USE_BLOB && /^https?:\/\//.test(url)) {
      const { del } = require('@vercel/blob');
      await del(url);
    } else if (!/^https?:\/\//.test(url)) {
      fs.unlink(path.join(UPLOAD_DIR, path.basename(url)), () => {});
    }
  } catch (err) {
    console.error('Upload delete failed (non-fatal):', err.message);
  }
}

module.exports = {
  saveUpload,
  deleteUpload,
  UPLOAD_DIR,
  backend: USE_SUPABASE ? 'supabase-storage' : USE_BLOB ? 'vercel-blob' : 'disk',
};
