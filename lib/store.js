'use strict';

/**
 * Storage layer — dual mode.
 *  - If DATABASE_URL is set  -> Postgres (serverless-safe, persistent on Vercel).
 *  - Otherwise               -> local JSON files in /data (zero-setup local dev).
 *
 * All methods are async and return/accept camelCase objects in both modes,
 * so the routes don't care which backend is active.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Accept either DATABASE_URL (generic / Neon) or POSTGRES_URL (Vercel Postgres).
const PG_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const USE_PG = !!PG_URL;

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

/* ---------------- Postgres backend ---------------- */
let pool = null;
let schemaReady = null;

function getPool() {
  if (!pool) {
    const { Pool } = require('pg');
    const cs = PG_URL;
    const local = /localhost|127\.0\.0\.1/.test(cs);
    pool = new Pool({
      connectionString: cs,
      ssl: local ? false : { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

function ensureSchema() {
  if (!USE_PG) return Promise.resolve();
  if (!schemaReady) {
    schemaReady = getPool().query(`
      create table if not exists registrations (
        id uuid primary key,
        reg_id text unique not null,
        created_at timestamptz not null default now(),
        full_name text not null,
        mobile text not null,
        email text not null,
        organization text not null,
        nepa_member boolean not null,
        fee_type text not null,
        delegate_fee integer not null,
        membership_fee integer not null,
        total_amount integer not null,
        payment_method text not null,
        reference_no text,
        screenshot_url text,
        note text,
        status text not null default 'Pending'
      );
      create sequence if not exists reg_seq start 1001;
      create table if not exists messages (
        id uuid primary key,
        created_at timestamptz not null default now(),
        name text not null,
        email text not null,
        phone text,
        subject text,
        message text not null,
        read boolean not null default false
      );
    `).catch((err) => { schemaReady = null; throw err; });
  }
  return schemaReady;
}

const REG_COLS = `
  id, reg_id as "regId", created_at as "createdAt", full_name as "fullName",
  mobile, email, organization, nepa_member as "nepaMember", fee_type as "feeType",
  delegate_fee as "delegateFee", membership_fee as "membershipFee",
  total_amount as "totalAmount", payment_method as "paymentMethod",
  reference_no as "referenceNo", screenshot_url as "screenshotUrl", note, status`;

const MSG_COLS = `id, created_at as "createdAt", name, email, phone, subject, message, read`;

/* ============================================================
   REGISTRATIONS
   ============================================================ */
async function listRegistrations() {
  if (USE_PG) {
    await ensureSchema();
    const { rows } = await getPool().query(
      `select ${REG_COLS} from registrations order by created_at desc`
    );
    return rows;
  }
  return readJson(REG_FILE)
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function addRegistration(data) {
  if (USE_PG) {
    await ensureSchema();
    const p = getPool();
    const seq = (await p.query(`select nextval('reg_seq') as n`)).rows[0].n;
    const id = crypto.randomUUID();
    const regId = `NEPA26-${seq}`;
    await p.query(
      `insert into registrations
       (id, reg_id, full_name, mobile, email, organization, nepa_member, fee_type,
        delegate_fee, membership_fee, total_amount, payment_method, reference_no,
        screenshot_url, note, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'Pending')`,
      [id, regId, data.fullName, data.mobile, data.email, data.organization,
       data.nepaMember, data.feeType, data.delegateFee, data.membershipFee,
       data.totalAmount, data.paymentMethod, data.referenceNo, data.screenshotUrl, data.note]
    );
    return { id, regId, status: 'Pending', ...data };
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

async function setRegistrationStatus(id, requested) {
  if (USE_PG) {
    await ensureSchema();
    const p = getPool();
    const cur = await p.query(`select status from registrations where id = $1`, [id]);
    if (!cur.rowCount) return null;
    const next = (requested === 'Pending' || requested === 'Confirmed')
      ? requested
      : (cur.rows[0].status === 'Confirmed' ? 'Pending' : 'Confirmed');
    await p.query(`update registrations set status = $1 where id = $2`, [next, id]);
    return next;
  }
  const rows = readJson(REG_FILE);
  const rec = rows.find((r) => r.id === id);
  if (!rec) return null;
  rec.status = (requested === 'Pending' || requested === 'Confirmed')
    ? requested
    : (rec.status === 'Confirmed' ? 'Pending' : 'Confirmed');
  writeJson(REG_FILE, rows);
  return rec.status;
}

async function deleteRegistration(id) {
  if (USE_PG) {
    await ensureSchema();
    const { rows } = await getPool().query(
      `delete from registrations where id = $1 returning screenshot_url as "screenshotUrl"`, [id]
    );
    return rows[0] || null;
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
  if (USE_PG) {
    await ensureSchema();
    const { rows } = await getPool().query(
      `select ${MSG_COLS} from messages order by created_at desc`
    );
    return rows;
  }
  return readJson(MSG_FILE)
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function addMessage(data) {
  if (USE_PG) {
    await ensureSchema();
    const id = crypto.randomUUID();
    await getPool().query(
      `insert into messages (id, name, email, phone, subject, message, read)
       values ($1,$2,$3,$4,$5,$6,false)`,
      [id, data.name, data.email, data.phone, data.subject, data.message]
    );
    return { id };
  }
  const rows = readJson(MSG_FILE);
  rows.push({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...data,
    read: false,
  });
  writeJson(MSG_FILE, rows);
  return { ok: true };
}

async function setMessageRead(id, requested) {
  if (USE_PG) {
    await ensureSchema();
    const p = getPool();
    const cur = await p.query(`select read from messages where id = $1`, [id]);
    if (!cur.rowCount) return null;
    const next = typeof requested === 'boolean' ? requested : !cur.rows[0].read;
    await p.query(`update messages set read = $1 where id = $2`, [next, id]);
    return next;
  }
  const rows = readJson(MSG_FILE);
  const msg = rows.find((m) => m.id === id);
  if (!msg) return null;
  msg.read = typeof requested === 'boolean' ? requested : !msg.read;
  writeJson(MSG_FILE, rows);
  return msg.read;
}

async function deleteMessage(id) {
  if (USE_PG) {
    await ensureSchema();
    const { rowCount } = await getPool().query(`delete from messages where id = $1`, [id]);
    return rowCount > 0;
  }
  const rows = readJson(MSG_FILE);
  const idx = rows.findIndex((m) => m.id === id);
  if (idx === -1) return false;
  rows.splice(idx, 1);
  writeJson(MSG_FILE, rows);
  return true;
}

module.exports = {
  backend: USE_PG ? 'postgres' : 'json-file',
  listRegistrations, addRegistration, setRegistrationStatus, deleteRegistration,
  listMessages, addMessage, setMessageRead, deleteMessage,
};
