'use strict';

/**
 * Storage layer — dual mode.
 *  - If Supabase is configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 *    -> Supabase via PostgREST (HTTPS; serverless-safe, no pooler issues).
 *  - Otherwise -> local JSON files in /data (zero-setup local dev).
 *
 * The Supabase tables are created once via supabase/schema.sql (run in the
 * Supabase SQL editor). PostgREST can't run DDL, so that step is manual —
 * but it's a one-time paste. All methods are async and return/accept
 * camelCase objects in both modes.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const supabase = require('./supabase');

const USE_SUPABASE = supabase.enabled;

/* ---------------- JSON-file backend ---------------- */
const DATA_DIR = path.join(__dirname, '..', 'data');
const REG_FILE = path.join(DATA_DIR, 'registrations.json');
const MSG_FILE = path.join(DATA_DIR, 'messages.json');

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Datastore read failed, starting empty:', err.message);
    return [];
  }
}
function writeJson(file, rows) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rows, null, 2), 'utf8');
}

/* ---------------- Supabase (PostgREST) ---------------- */
// camelCase aliases so the API/admin get the same shape as JSON mode.
const REG_SELECT =
  'id, regId:reg_id, createdAt:created_at, fullName:full_name, mobile, email, ' +
  'organization, nepaMember:nepa_member, feeType:fee_type, delegateFee:delegate_fee, ' +
  'membershipFee:membership_fee, subtotal, gstRate:gst_rate, gstAmount:gst_amount, ' +
  'totalAmount:total_amount, paymentMethod:payment_method, referenceNo:reference_no, ' +
  'screenshotUrl:screenshot_url, note, status';

const REG_SELECT_FULL = REG_SELECT + ', archivedAt:archived_at';

const MSG_SELECT = 'id, createdAt:created_at, name, email, phone, subject, message, read';

const isNotFound = (error) => error && (error.code === 'PGRST116' || /0 rows/i.test(error.message || ''));
// True when the archived_at column hasn't been added yet (pre-migration), so
// the code degrades gracefully instead of breaking the live admin.
const isMissingArchived = (error) =>
  error && (error.code === '42703' || /archived_at/i.test(error.message || ''));

/* ============================================================
   REGISTRATIONS
   ============================================================ */
async function listRegistrations() {
  if (USE_SUPABASE) {
    const c = supabase.getClient();
    // Active records only (archived are hidden but kept). If the archived_at
    // column doesn't exist yet (pre-migration), fall back to listing all.
    const { data, error } = await c.from('registrations')
      .select(REG_SELECT).is('archived_at', null).order('created_at', { ascending: false });
    if (error) {
      if (isMissingArchived(error)) {
        const r2 = await c.from('registrations').select(REG_SELECT).order('created_at', { ascending: false });
        if (r2.error) throw new Error(r2.error.message);
        return r2.data;
      }
      throw new Error(error.message);
    }
    return data;
  }
  return readJson(REG_FILE).filter((r) => !r.archivedAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Archived (soft-deleted) records — for the admin "Archived" view / restore.
async function listArchivedRegistrations() {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.getClient()
      .from('registrations').select(REG_SELECT_FULL)
      .not('archived_at', 'is', null).order('archived_at', { ascending: false });
    if (error) return isMissingArchived(error) ? [] : Promise.reject(new Error(error.message));
    return data;
  }
  return readJson(REG_FILE).filter((r) => r.archivedAt)
    .sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt));
}

// Everything (active + archived) — used for full backups.
async function allRegistrationsForBackup() {
  if (USE_SUPABASE) {
    const c = supabase.getClient();
    let { data, error } = await c.from('registrations').select(REG_SELECT_FULL).order('created_at', { ascending: false });
    if (error && isMissingArchived(error)) {
      ({ data, error } = await c.from('registrations').select(REG_SELECT).order('created_at', { ascending: false }));
    }
    if (error) throw new Error(error.message);
    return data;
  }
  return readJson(REG_FILE).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function addRegistration(data) {
  if (USE_SUPABASE) {
    // id, reg_id, created_at, status come from table defaults.
    const row = {
      full_name: data.fullName, mobile: data.mobile, email: data.email,
      organization: data.organization, nepa_member: data.nepaMember, fee_type: data.feeType,
      delegate_fee: data.delegateFee, membership_fee: data.membershipFee,
      subtotal: data.subtotal, gst_rate: data.gstRate, gst_amount: data.gstAmount,
      total_amount: data.totalAmount, payment_method: data.paymentMethod,
      reference_no: data.referenceNo, screenshot_url: data.screenshotUrl, note: data.note,
    };
    const { data: ins, error } = await supabase.getClient()
      .from('registrations').insert(row)
      .select('regId:reg_id, totalAmount:total_amount, feeType:fee_type, fullName:full_name').single();
    if (error) {
      if (error.code === '23505') { const e = new Error('Mobile already registered'); e.code = 'DUPLICATE_MOBILE'; throw e; }
      throw new Error(error.message);
    }
    return ins;
  }
  const rows = readJson(REG_FILE);
  const record = {
    id: crypto.randomUUID(),
    regId: `NEPA26-${1000 + rows.length + 1}`,
    createdAt: new Date().toISOString(),
    ...data,
    status: 'Pending',
  };
  rows.push(record);
  writeJson(REG_FILE, rows);
  return record;
}

async function findRegistrationByMobile(mobile) {
  if (USE_SUPABASE) {
    const c = supabase.getClient();
    // Only an ACTIVE registration blocks re-use of a mobile; archived ones don't.
    let { data, error } = await c.from('registrations')
      .select('regId:reg_id, status').eq('mobile', mobile).is('archived_at', null).limit(1);
    if (error && isMissingArchived(error)) {
      ({ data, error } = await c.from('registrations').select('regId:reg_id, status').eq('mobile', mobile).limit(1));
    }
    if (error) throw new Error(error.message);
    return (data && data[0]) || null;
  }
  return readJson(REG_FILE).find((r) => r.mobile === mobile && !r.archivedAt) || null;
}

async function setRegistrationStatus(id, requested) {
  if (USE_SUPABASE) {
    const c = supabase.getClient();
    let next = requested;
    if (next !== 'Pending' && next !== 'Confirmed') {
      const { data: cur, error: e1 } = await c.from('registrations').select('status').eq('id', id).single();
      if (e1) return isNotFound(e1) ? null : Promise.reject(new Error(e1.message));
      next = cur.status === 'Confirmed' ? 'Pending' : 'Confirmed';
    }
    const { data, error } = await c.from('registrations').update({ status: next }).eq('id', id).select('status').single();
    if (error) return isNotFound(error) ? null : Promise.reject(new Error(error.message));
    return data.status;
  }
  const rows = readJson(REG_FILE);
  const rec = rows.find((r) => r.id === id);
  if (!rec) return null;
  rec.status = (requested === 'Pending' || requested === 'Confirmed')
    ? requested : (rec.status === 'Confirmed' ? 'Pending' : 'Confirmed');
  writeJson(REG_FILE, rows);
  return rec.status;
}

// Soft-delete: mark archived (recoverable). The screenshot file is kept.
async function archiveRegistration(id) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.getClient()
      .from('registrations').update({ archived_at: new Date().toISOString() })
      .eq('id', id).is('archived_at', null).select('id').single();
    if (error) {
      if (isMissingArchived(error)) {
        const e = new Error('Safe archiving needs a one-time DB migration — run the latest supabase/schema.sql in Supabase.');
        e.code = 'NEEDS_MIGRATION';
        throw e;
      }
      return isNotFound(error) ? null : Promise.reject(new Error(error.message));
    }
    return data;
  }
  const rows = readJson(REG_FILE);
  const rec = rows.find((r) => r.id === id && !r.archivedAt);
  if (!rec) return null;
  rec.archivedAt = new Date().toISOString();
  writeJson(REG_FILE, rows);
  return { id: rec.id };
}

// Bring an archived record back to the active list.
async function restoreRegistration(id) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.getClient()
      .from('registrations').update({ archived_at: null }).eq('id', id).select('id').single();
    if (error) return isNotFound(error) ? null : Promise.reject(new Error(error.message));
    return data;
  }
  const rows = readJson(REG_FILE);
  const rec = rows.find((r) => r.id === id);
  if (!rec) return null;
  delete rec.archivedAt;
  writeJson(REG_FILE, rows);
  return { id: rec.id };
}

// Permanent removal — only used to purge an already-archived record.
async function purgeRegistration(id) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.getClient()
      .from('registrations').delete().eq('id', id).select('screenshotUrl:screenshot_url').single();
    if (error) return isNotFound(error) ? null : Promise.reject(new Error(error.message));
    return data;
  }
  const rows = readJson(REG_FILE);
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const [removed] = rows.splice(idx, 1);
  writeJson(REG_FILE, rows);
  return removed;
}

/* ============================================================
   MESSAGES
   ============================================================ */
async function listMessages() {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.getClient()
      .from('messages').select(MSG_SELECT).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  }
  return readJson(MSG_FILE).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function addMessage(data) {
  if (USE_SUPABASE) {
    const { error } = await supabase.getClient().from('messages').insert({
      name: data.name, email: data.email, phone: data.phone, subject: data.subject, message: data.message,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  }
  const rows = readJson(MSG_FILE);
  rows.push({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...data, read: false });
  writeJson(MSG_FILE, rows);
  return { ok: true };
}

async function setMessageRead(id, requested) {
  if (USE_SUPABASE) {
    const c = supabase.getClient();
    let next = requested;
    if (typeof next !== 'boolean') {
      const { data: cur, error: e1 } = await c.from('messages').select('read').eq('id', id).single();
      if (e1) return isNotFound(e1) ? null : Promise.reject(new Error(e1.message));
      next = !cur.read;
    }
    const { data, error } = await c.from('messages').update({ read: next }).eq('id', id).select('read').single();
    if (error) return isNotFound(error) ? null : Promise.reject(new Error(error.message));
    return data.read;
  }
  const rows = readJson(MSG_FILE);
  const msg = rows.find((m) => m.id === id);
  if (!msg) return null;
  msg.read = typeof requested === 'boolean' ? requested : !msg.read;
  writeJson(MSG_FILE, rows);
  return msg.read;
}

async function deleteMessage(id) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.getClient()
      .from('messages').delete().eq('id', id).select('id').single();
    if (error) return isNotFound(error) ? false : Promise.reject(new Error(error.message));
    return !!data;
  }
  const rows = readJson(MSG_FILE);
  const idx = rows.findIndex((m) => m.id === id);
  if (idx === -1) return false;
  rows.splice(idx, 1);
  writeJson(MSG_FILE, rows);
  return true;
}

module.exports = {
  backend: USE_SUPABASE ? 'supabase' : 'json-file',
  listRegistrations, listArchivedRegistrations, allRegistrationsForBackup,
  addRegistration, findRegistrationByMobile, setRegistrationStatus,
  archiveRegistration, restoreRegistration, purgeRegistration,
  listMessages, addMessage, setMessageRead, deleteMessage,
};
