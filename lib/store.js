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

const MSG_SELECT = 'id, createdAt:created_at, name, email, phone, subject, message, read';

const isNotFound = (error) => error && (error.code === 'PGRST116' || /0 rows/i.test(error.message || ''));

/* ============================================================
   REGISTRATIONS
   ============================================================ */
async function listRegistrations() {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.getClient()
      .from('registrations').select(REG_SELECT).order('created_at', { ascending: false });
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
    const { data, error } = await supabase.getClient()
      .from('registrations').select('regId:reg_id, status').eq('mobile', mobile).limit(1);
    if (error) throw new Error(error.message);
    return (data && data[0]) || null;
  }
  return readJson(REG_FILE).find((r) => r.mobile === mobile) || null;
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

async function deleteRegistration(id) {
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
  listRegistrations, addRegistration, findRegistrationByMobile, setRegistrationStatus, deleteRegistration,
  listMessages, addMessage, setMessageRead, deleteMessage,
};
