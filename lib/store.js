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
const HOTELS_FILE = path.join(DATA_DIR, 'hotels.json');
const HBOOK_FILE = path.join(DATA_DIR, 'hotel_bookings.json');
const MEALS_FILE = path.join(DATA_DIR, 'meals.json');
const REDEEM_FILE = path.join(DATA_DIR, 'meal_redemptions.json');

// Unguessable per-delegate token embedded in the ID-card QR (vCard UID) and
// used by the meal scanner to identify the delegate.
const newToken = () => crypto.randomBytes(10).toString('hex');

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
const REG_SELECT_BASE =
  'id, regId:reg_id, createdAt:created_at, fullName:full_name, mobile, email, ' +
  'organization, nepaMember:nepa_member, feeType:fee_type, delegateFee:delegate_fee, ' +
  'membershipFee:membership_fee, subtotal, gstRate:gst_rate, gstAmount:gst_amount, ' +
  'totalAmount:total_amount, paymentMethod:payment_method, referenceNo:reference_no, ' +
  'screenshotUrl:screenshot_url, note, status';

// gst_number + the ID-card fields are newer optional columns; the *_BASE variant
// omits them so the app degrades gracefully if the columns haven't been added to
// the live DB yet (isMissingCol -> fall back to REG_SELECT_BASE).
const REG_SELECT = REG_SELECT_BASE +
  ', gstNumber:gst_number, designation, city, source, qrToken:qr_token, cardPrintedAt:card_printed_at';
const REG_SELECT_FULL = REG_SELECT + ', archivedAt:archived_at';

const MSG_SELECT = 'id, createdAt:created_at, name, email, phone, subject, message, read';

const isNotFound = (error) => error && (error.code === 'PGRST116' || /0 rows/i.test(error.message || ''));
// The hotel tables haven't been created yet (schema.sql not run for hotels).
const isMissingTable = (error) =>
  error && (error.code === 'PGRST205' || error.code === '42P01' ||
    /Could not find the table|schema cache|relation .* does not exist/i.test(error.message || ''));
function hotelErr(error) {
  if (isMissingTable(error)) {
    const e = new Error('Hotel tables are not set up yet — run the hotel section of supabase/schema.sql in the Supabase SQL editor.');
    e.code = 'NEEDS_MIGRATION';
    return e;
  }
  return new Error(error.message);
}
// True when the archived_at column hasn't been added yet (pre-migration), so
// the code degrades gracefully instead of breaking the live admin.
const isMissingArchived = (error) => error && /archived_at/i.test(error.message || '');
// A referenced column doesn't exist yet (e.g. gst_number before its migration).
const isMissingCol = (error) =>
  error && (error.code === '42703' || error.code === 'PGRST204' ||
    /Could not find the .* column|column .* does not exist/i.test(error.message || ''));

/* ============================================================
   REGISTRATIONS
   ============================================================ */
async function listRegistrations() {
  if (USE_SUPABASE) {
    const c = supabase.getClient();
    // Active records only (archived are hidden but kept). If the archived_at
    // column doesn't exist yet (pre-migration), fall back to listing all.
    let { data, error } = await c.from('registrations')
      .select(REG_SELECT).is('archived_at', null).order('created_at', { ascending: false });
    // gst_number column not added yet → fall back to base columns.
    if (error && isMissingCol(error) && !isMissingArchived(error)) {
      ({ data, error } = await c.from('registrations').select(REG_SELECT_BASE).is('archived_at', null).order('created_at', { ascending: false }));
    }
    // archived_at column not added yet → list all.
    if (error && isMissingArchived(error)) {
      ({ data, error } = await c.from('registrations').select(REG_SELECT_BASE).order('created_at', { ascending: false }));
    }
    if (error) throw new Error(error.message);
    return data;
  }
  return readJson(REG_FILE).filter((r) => !r.archivedAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Archived (soft-deleted) records — for the admin "Archived" view / restore.
async function listArchivedRegistrations() {
  if (USE_SUPABASE) {
    const c = supabase.getClient();
    let { data, error } = await c.from('registrations').select(REG_SELECT_FULL)
      .not('archived_at', 'is', null).order('archived_at', { ascending: false });
    if (error && isMissingCol(error) && !isMissingArchived(error)) {
      ({ data, error } = await c.from('registrations').select(REG_SELECT_BASE + ', archivedAt:archived_at')
        .not('archived_at', 'is', null).order('archived_at', { ascending: false }));
    }
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
    if (error && isMissingCol(error) && !isMissingArchived(error)) {
      ({ data, error } = await c.from('registrations').select(REG_SELECT_BASE + ', archivedAt:archived_at').order('created_at', { ascending: false }));
    }
    if (error && isMissingArchived(error)) {
      ({ data, error } = await c.from('registrations').select(REG_SELECT_BASE).order('created_at', { ascending: false }));
    }
    if (error) throw new Error(error.message);
    return data;
  }
  return readJson(REG_FILE).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function addRegistration(data) {
  if (USE_SUPABASE) {
    // id, reg_id, created_at, status come from table defaults.
    // qr_token is filled by the DB default (encode(gen_random_bytes,'hex')).
    const row = {
      full_name: data.fullName, mobile: data.mobile, email: data.email,
      organization: data.organization, gst_number: data.gstNumber || null,
      designation: data.designation || null, city: data.city || null,
      source: data.source || 'web',
      nepa_member: data.nepaMember, fee_type: data.feeType,
      delegate_fee: data.delegateFee, membership_fee: data.membershipFee,
      subtotal: data.subtotal, gst_rate: data.gstRate, gst_amount: data.gstAmount,
      total_amount: data.totalAmount, payment_method: data.paymentMethod,
      reference_no: data.referenceNo, screenshot_url: data.screenshotUrl, note: data.note,
    };
    const sel = 'id, regId:reg_id, totalAmount:total_amount, feeType:fee_type, fullName:full_name, qrToken:qr_token';
    let { data: ins, error } = await supabase.getClient()
      .from('registrations').insert(row).select(sel).single();
    // Graceful degradation: if the newer optional columns haven't been added
    // yet, drop them and retry with only the always-present fields.
    if (error && isMissingCol(error)) {
      delete row.gst_number; delete row.designation; delete row.city; delete row.source;
      ({ data: ins, error } = await supabase.getClient()
        .from('registrations').insert(row)
        .select('id, regId:reg_id, totalAmount:total_amount, feeType:fee_type, fullName:full_name').single());
    }
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
    qrToken: newToken(),
    source: 'web',
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
      .select('id, regId:reg_id, status').eq('mobile', mobile).is('archived_at', null).limit(1);
    if (error && isMissingArchived(error)) {
      ({ data, error } = await c.from('registrations').select('id, regId:reg_id, status').eq('mobile', mobile).limit(1));
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

/* ============================================================
   HOTELS  (managed by the hotel team) + HOTEL BOOKINGS
   ============================================================ */
const HOTEL_SELECT =
  'id, createdAt:created_at, name, address, totalRooms:total_rooms, ' +
  'singlePrice:single_price, doublePrice:double_price, active, sort';

const HBOOK_SELECT =
  'id, bookingId:booking_id, createdAt:created_at, hotelId:hotel_id, hotelName:hotel_name, ' +
  'occupancy, guestName:guest_name, fullName:full_name, firm, address, mobile, email, ' +
  'roomPrice:room_price, subtotal, gstRate:gst_rate, gstAmount:gst_amount, totalAmount:total_amount, ' +
  'paymentMethod:payment_method, referenceNo:reference_no, screenshotUrl:screenshot_url, note, status';
const HBOOK_SELECT_FULL = HBOOK_SELECT + ', archivedAt:archived_at';

// Rooms used per hotel = count of ACTIVE (non-archived) bookings, each = 1 room.
async function activeBookingCounts() {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.getClient()
      .from('hotel_bookings').select('hotelId:hotel_id').is('archived_at', null);
    if (error) throw hotelErr(error);
    const counts = {};
    (data || []).forEach((b) => { if (b.hotelId) counts[b.hotelId] = (counts[b.hotelId] || 0) + 1; });
    return counts;
  }
  const counts = {};
  readJson(HBOOK_FILE).forEach((b) => { if (!b.archivedAt && b.hotelId) counts[b.hotelId] = (counts[b.hotelId] || 0) + 1; });
  return counts;
}

function withRoomCounts(hotel, counts) {
  const used = counts[hotel.id] || 0;
  return { ...hotel, roomsUsed: used, roomsRemaining: Math.max(0, (hotel.totalRooms || 0) - used) };
}

async function listHotels() {
  const counts = await activeBookingCounts();
  if (USE_SUPABASE) {
    const { data, error } = await supabase.getClient()
      .from('hotels').select(HOTEL_SELECT).order('sort', { ascending: true }).order('name', { ascending: true });
    if (error) throw hotelErr(error);
    return (data || []).map((h) => withRoomCounts(h, counts));
  }
  return readJson(HOTELS_FILE)
    .sort((a, b) => (a.sort - b.sort) || String(a.name).localeCompare(b.name))
    .map((h) => withRoomCounts(h, counts));
}

async function listHotelsPublic() {
  return (await listHotels()).filter((h) => h.active);
}

async function getHotel(id) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.getClient().from('hotels').select(HOTEL_SELECT).eq('id', id).single();
    if (error) return isNotFound(error) ? null : Promise.reject(hotelErr(error));
    return data;
  }
  return readJson(HOTELS_FILE).find((h) => h.id === id) || null;
}

async function addHotel(data) {
  const row = {
    name: data.name, address: data.address || null,
    total_rooms: data.totalRooms || 0, single_price: data.singlePrice || 0,
    double_price: data.doublePrice || 0, active: data.active !== false, sort: data.sort || 0,
  };
  if (USE_SUPABASE) {
    const { data: ins, error } = await supabase.getClient().from('hotels').insert(row).select(HOTEL_SELECT).single();
    if (error) throw hotelErr(error);
    return ins;
  }
  const rows = readJson(HOTELS_FILE);
  const rec = {
    id: crypto.randomUUID(), createdAt: new Date().toISOString(),
    name: row.name, address: row.address, totalRooms: row.total_rooms,
    singlePrice: row.single_price, doublePrice: row.double_price, active: row.active, sort: row.sort,
  };
  rows.push(rec); writeJson(HOTELS_FILE, rows);
  return rec;
}

async function updateHotel(id, fields) {
  const map = { name: 'name', address: 'address', totalRooms: 'total_rooms', singlePrice: 'single_price', doublePrice: 'double_price', active: 'active', sort: 'sort' };
  if (USE_SUPABASE) {
    const patch = {};
    for (const k of Object.keys(map)) if (k in fields) patch[map[k]] = fields[k];
    const { data, error } = await supabase.getClient().from('hotels').update(patch).eq('id', id).select(HOTEL_SELECT).single();
    if (error) return isNotFound(error) ? null : Promise.reject(new Error(error.message));
    return data;
  }
  const rows = readJson(HOTELS_FILE);
  const rec = rows.find((h) => h.id === id);
  if (!rec) return null;
  for (const k of Object.keys(map)) if (k in fields) rec[k] = fields[k];
  writeJson(HOTELS_FILE, rows);
  return rec;
}

async function deleteHotel(id) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.getClient().from('hotels').delete().eq('id', id).select('id').single();
    if (error) return isNotFound(error) ? null : Promise.reject(new Error(error.message));
    return data;
  }
  const rows = readJson(HOTELS_FILE);
  const idx = rows.findIndex((h) => h.id === id);
  if (idx === -1) return null;
  rows.splice(idx, 1); writeJson(HOTELS_FILE, rows);
  return { id };
}

async function listHotelBookings() {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.getClient()
      .from('hotel_bookings').select(HBOOK_SELECT).is('archived_at', null).order('created_at', { ascending: false });
    if (error) throw hotelErr(error);
    return data;
  }
  return readJson(HBOOK_FILE).filter((b) => !b.archivedAt).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function listArchivedHotelBookings() {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.getClient()
      .from('hotel_bookings').select(HBOOK_SELECT_FULL).not('archived_at', 'is', null).order('archived_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  }
  return readJson(HBOOK_FILE).filter((b) => b.archivedAt).sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt));
}

// Insert a booking after a capacity re-check (room count < total_rooms).
async function addHotelBooking(data) {
  const hotel = await getHotel(data.hotelId);
  if (!hotel || !hotel.active) { const e = new Error('That hotel is no longer available. Please pick another.'); e.code = 'HOTEL_UNAVAILABLE'; throw e; }
  const counts = await activeBookingCounts();
  if ((counts[hotel.id] || 0) >= (hotel.totalRooms || 0)) {
    const e = new Error(`${hotel.name} is fully booked. Please choose another hotel.`); e.code = 'HOTEL_FULL'; throw e;
  }
  const row = {
    hotel_id: hotel.id, hotel_name: hotel.name, occupancy: data.occupancy,
    guest_name: data.guestName || null, full_name: data.fullName, firm: data.firm || null,
    address: data.address || null, mobile: data.mobile, email: data.email || null,
    room_price: data.roomPrice, subtotal: data.subtotal, gst_rate: data.gstRate,
    gst_amount: data.gstAmount, total_amount: data.totalAmount, payment_method: data.paymentMethod,
    reference_no: data.referenceNo || null, screenshot_url: data.screenshotUrl || null, note: data.note || null,
  };
  if (USE_SUPABASE) {
    const { data: ins, error } = await supabase.getClient()
      .from('hotel_bookings').insert(row)
      .select('bookingId:booking_id, totalAmount:total_amount, hotelName:hotel_name, fullName:full_name, occupancy').single();
    if (error) throw hotelErr(error);
    return ins;
  }
  const rows = readJson(HBOOK_FILE);
  const rec = {
    id: crypto.randomUUID(), bookingId: `HB26-${2000 + rows.length + 1}`, createdAt: new Date().toISOString(),
    hotelId: hotel.id, hotelName: hotel.name, occupancy: data.occupancy, guestName: data.guestName || null,
    fullName: data.fullName, firm: data.firm || null, address: data.address || null, mobile: data.mobile,
    email: data.email || null, roomPrice: data.roomPrice, subtotal: data.subtotal, gstRate: data.gstRate,
    gstAmount: data.gstAmount, totalAmount: data.totalAmount, paymentMethod: data.paymentMethod,
    referenceNo: data.referenceNo || null, screenshotUrl: data.screenshotUrl || null, note: data.note || null, status: 'Pending',
  };
  rows.push(rec); writeJson(HBOOK_FILE, rows);
  return rec;
}

async function setHotelBookingStatus(id, requested) {
  if (USE_SUPABASE) {
    const c = supabase.getClient();
    let next = requested;
    if (next !== 'Pending' && next !== 'Confirmed') {
      const { data: cur, error: e1 } = await c.from('hotel_bookings').select('status').eq('id', id).single();
      if (e1) return isNotFound(e1) ? null : Promise.reject(new Error(e1.message));
      next = cur.status === 'Confirmed' ? 'Pending' : 'Confirmed';
    }
    const { data, error } = await c.from('hotel_bookings').update({ status: next }).eq('id', id).select('status').single();
    if (error) return isNotFound(error) ? null : Promise.reject(new Error(error.message));
    return data.status;
  }
  const rows = readJson(HBOOK_FILE);
  const rec = rows.find((b) => b.id === id);
  if (!rec) return null;
  rec.status = (requested === 'Pending' || requested === 'Confirmed') ? requested : (rec.status === 'Confirmed' ? 'Pending' : 'Confirmed');
  writeJson(HBOOK_FILE, rows);
  return rec.status;
}

async function archiveHotelBooking(id) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.getClient()
      .from('hotel_bookings').update({ archived_at: new Date().toISOString() }).eq('id', id).is('archived_at', null).select('id').single();
    if (error) return isNotFound(error) ? null : Promise.reject(new Error(error.message));
    return data;
  }
  const rows = readJson(HBOOK_FILE);
  const rec = rows.find((b) => b.id === id && !b.archivedAt);
  if (!rec) return null;
  rec.archivedAt = new Date().toISOString(); writeJson(HBOOK_FILE, rows);
  return { id };
}

async function restoreHotelBooking(id) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.getClient()
      .from('hotel_bookings').update({ archived_at: null }).eq('id', id).select('id').single();
    if (error) return isNotFound(error) ? null : Promise.reject(new Error(error.message));
    return data;
  }
  const rows = readJson(HBOOK_FILE);
  const rec = rows.find((b) => b.id === id);
  if (!rec) return null;
  delete rec.archivedAt; writeJson(HBOOK_FILE, rows);
  return { id };
}

async function purgeHotelBooking(id) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.getClient()
      .from('hotel_bookings').delete().eq('id', id).select('screenshotUrl:screenshot_url').single();
    if (error) return isNotFound(error) ? null : Promise.reject(new Error(error.message));
    return data;
  }
  const rows = readJson(HBOOK_FILE);
  const idx = rows.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  const [removed] = rows.splice(idx, 1); writeJson(HBOOK_FILE, rows);
  return removed;
}

/* ============================================================
   REGISTRATION EDIT / CARD HELPERS
   ============================================================ */

// Admin edits — correct details or fill designation/city for ID cards.
async function updateRegistration(id, fields) {
  const map = {
    fullName: 'full_name', mobile: 'mobile', email: 'email', organization: 'organization',
    gstNumber: 'gst_number', designation: 'designation', city: 'city',
  };
  if (USE_SUPABASE) {
    const patch = {};
    for (const k of Object.keys(map)) if (k in fields) patch[map[k]] = fields[k];
    let { data, error } = await supabase.getClient()
      .from('registrations').update(patch).eq('id', id).select(REG_SELECT).single();
    if (error && isMissingCol(error)) {
      delete patch.gst_number; delete patch.designation; delete patch.city;
      ({ data, error } = await supabase.getClient()
        .from('registrations').update(patch).eq('id', id).select(REG_SELECT_BASE).single());
    }
    if (error) return isNotFound(error) ? null : Promise.reject(new Error(error.message));
    return data;
  }
  const rows = readJson(REG_FILE);
  const rec = rows.find((r) => r.id === id);
  if (!rec) return null;
  for (const k of Object.keys(map)) if (k in fields) rec[k] = fields[k];
  writeJson(REG_FILE, rows);
  return rec;
}

// Full record by id (used to render one ID card).
async function getRegistration(id) {
  if (USE_SUPABASE) {
    let { data, error } = await supabase.getClient().from('registrations').select(REG_SELECT).eq('id', id).single();
    if (error && isMissingCol(error)) {
      ({ data, error } = await supabase.getClient().from('registrations').select(REG_SELECT_BASE).eq('id', id).single());
    }
    if (error) return isNotFound(error) ? null : Promise.reject(new Error(error.message));
    return data;
  }
  return readJson(REG_FILE).find((r) => r.id === id) || null;
}

// Mark one or more delegates' ID cards as printed (best-effort; never throws
// on a missing column so printing still works pre-migration).
async function markCardPrinted(ids) {
  const list = Array.isArray(ids) ? ids : [ids];
  const when = new Date().toISOString();
  if (USE_SUPABASE) {
    const { error } = await supabase.getClient()
      .from('registrations').update({ card_printed_at: when }).in('id', list);
    if (error && !isMissingCol(error)) throw new Error(error.message);
    return { ok: true, count: list.length };
  }
  const rows = readJson(REG_FILE);
  let n = 0;
  rows.forEach((r) => { if (list.includes(r.id)) { r.cardPrintedAt = when; n++; } });
  writeJson(REG_FILE, rows);
  return { ok: true, count: n };
}

// Scanner lookup: a delegate by their QR token, with the meals they've availed.
async function findRegistrationByToken(token) {
  if (!token) return null;
  if (USE_SUPABASE) {
    const c = supabase.getClient();
    let { data, error } = await c.from('registrations')
      .select('id, regId:reg_id, fullName:full_name, organization, designation, city, mobile, email')
      .eq('qr_token', token).is('archived_at', null).limit(1);
    if (error) return (isMissingCol(error) || isMissingArchived(error)) ? null : Promise.reject(new Error(error.message));
    const reg = data && data[0];
    if (!reg) return null;
    const { data: reds } = await c.from('meal_redemptions')
      .select('mealId:meal_id, redeemedAt:redeemed_at').eq('registration_id', reg.id);
    return { ...reg, redemptions: reds || [] };
  }
  const reg = readJson(REG_FILE).find((r) => r.qrToken === token && !r.archivedAt);
  if (!reg) return null;
  const reds = readJson(REDEEM_FILE)
    .filter((r) => r.registrationId === reg.id)
    .map((r) => ({ mealId: r.mealId, redeemedAt: r.redeemedAt }));
  return {
    id: reg.id, regId: reg.regId, fullName: reg.fullName, organization: reg.organization,
    designation: reg.designation, city: reg.city, mobile: reg.mobile, email: reg.email, redemptions: reds,
  };
}

// Bulk import offline registrants from an uploaded Excel (parsed to rows).
// opts.onDuplicate: 'skip' (default) | 'update'. Returns a per-row report.
async function bulkImportRegistrations(records, opts = {}) {
  const onDuplicate = opts.onDuplicate === 'update' ? 'update' : 'skip';
  const results = { inserted: 0, updated: 0, skipped: 0, failed: 0, rows: [] };
  for (let i = 0; i < records.length; i++) {
    const rec = records[i] || {};
    const rowNo = rec.__row || i + 1;
    try {
      const mobile = String(rec.mobile || '').replace(/\D/g, '');
      const fullName = String(rec.fullName || '').trim();
      if (!fullName || !/^\d{10}$/.test(mobile)) {
        results.failed++;
        results.rows.push({ row: rowNo, status: 'failed', name: fullName, reason: 'Missing name or invalid 10-digit mobile' });
        continue;
      }
      const existing = await findRegistrationByMobile(mobile);
      if (existing) {
        if (onDuplicate === 'update' && existing.id) {
          await updateRegistration(existing.id, {
            fullName, email: String(rec.email || '').trim(), organization: String(rec.organization || '').trim(),
            designation: String(rec.designation || '').trim() || null, city: String(rec.city || '').trim() || null,
            gstNumber: String(rec.gstNumber || '').trim() || null,
          });
          results.updated++;
          results.rows.push({ row: rowNo, status: 'updated', name: fullName, regId: existing.regId });
        } else {
          results.skipped++;
          results.rows.push({ row: rowNo, status: 'skipped', name: fullName, regId: existing.regId, reason: 'Mobile already registered' });
        }
        continue;
      }
      const payload = {
        fullName, mobile, email: String(rec.email || '').trim(),
        organization: String(rec.organization || '').trim(),
        designation: String(rec.designation || '').trim() || null,
        city: String(rec.city || '').trim() || null,
        gstNumber: String(rec.gstNumber || '').trim() || null,
        nepaMember: rec.nepaMember === true || /^(yes|true|1)$/i.test(String(rec.nepaMember || '')),
        feeType: rec.feeType || 'Offline',
        delegateFee: Number(rec.delegateFee) || 0, membershipFee: Number(rec.membershipFee) || 0,
        subtotal: Number(rec.subtotal) || 0, gstRate: Number(rec.gstRate) || 0, gstAmount: Number(rec.gstAmount) || 0,
        totalAmount: Number(rec.totalAmount) || 0,
        paymentMethod: rec.paymentMethod || 'Offline',
        referenceNo: rec.referenceNo || null, screenshotUrl: null, note: rec.note || null,
        source: 'offline-import',
      };
      const ins = await addRegistration(payload);
      if (ins && ins.id) { try { await setRegistrationStatus(ins.id, 'Confirmed'); } catch { /* non-fatal */ } }
      results.inserted++;
      results.rows.push({ row: rowNo, status: 'inserted', name: fullName, regId: ins.regId });
    } catch (e) {
      if (e && e.code === 'DUPLICATE_MOBILE') {
        results.skipped++;
        results.rows.push({ row: rowNo, status: 'skipped', name: String(rec.fullName || ''), reason: 'Mobile already registered' });
      } else {
        results.failed++;
        results.rows.push({ row: rowNo, status: 'failed', name: String(rec.fullName || ''), reason: e.message });
      }
    }
  }
  return results;
}

/* ============================================================
   MEALS + CHECK-IN (meal redemptions)
   ============================================================ */
const MEAL_SELECT = 'id, createdAt:created_at, name, mealDay:meal_day, maxPerPerson:max_per_person, active, sort';

function mealErr(error) {
  if (isMissingTable(error)) {
    const e = new Error('Meal tables are not set up yet — run the latest supabase/schema.sql in the Supabase SQL editor.');
    e.code = 'NEEDS_MIGRATION';
    return e;
  }
  return new Error(error.message);
}

async function listMeals() {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.getClient()
      .from('meals').select(MEAL_SELECT).order('sort', { ascending: true }).order('created_at', { ascending: true });
    if (error) throw mealErr(error);
    return data;
  }
  return readJson(MEALS_FILE).slice().sort((a, b) => (a.sort - b.sort) || (new Date(a.createdAt) - new Date(b.createdAt)));
}

async function addMeal(data) {
  const row = {
    name: data.name, meal_day: data.mealDay || null,
    max_per_person: Number(data.maxPerPerson) || 1, active: data.active !== false, sort: Number(data.sort) || 0,
  };
  if (USE_SUPABASE) {
    const { data: ins, error } = await supabase.getClient().from('meals').insert(row).select(MEAL_SELECT).single();
    if (error) throw mealErr(error);
    return ins;
  }
  const rows = readJson(MEALS_FILE);
  const rec = {
    id: crypto.randomUUID(), createdAt: new Date().toISOString(), name: row.name,
    mealDay: row.meal_day, maxPerPerson: row.max_per_person, active: row.active, sort: row.sort,
  };
  rows.push(rec); writeJson(MEALS_FILE, rows);
  return rec;
}

async function updateMeal(id, fields) {
  const map = { name: 'name', mealDay: 'meal_day', maxPerPerson: 'max_per_person', active: 'active', sort: 'sort' };
  if (USE_SUPABASE) {
    const patch = {};
    for (const k of Object.keys(map)) if (k in fields) patch[map[k]] = fields[k];
    const { data, error } = await supabase.getClient().from('meals').update(patch).eq('id', id).select(MEAL_SELECT).single();
    if (error) return isNotFound(error) ? null : Promise.reject(mealErr(error));
    return data;
  }
  const rows = readJson(MEALS_FILE);
  const rec = rows.find((m) => m.id === id);
  if (!rec) return null;
  for (const k of Object.keys(map)) if (k in fields) rec[k] = fields[k];
  writeJson(MEALS_FILE, rows);
  return rec;
}

async function deleteMeal(id) {
  if (USE_SUPABASE) {
    const { data, error } = await supabase.getClient().from('meals').delete().eq('id', id).select('id').single();
    if (error) return isNotFound(error) ? null : Promise.reject(mealErr(error));
    return data;
  }
  const rows = readJson(MEALS_FILE);
  const idx = rows.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  rows.splice(idx, 1); writeJson(MEALS_FILE, rows);
  writeJson(REDEEM_FILE, readJson(REDEEM_FILE).filter((r) => r.mealId !== id));
  return { id };
}

// Meals with a redeemed count (for the admin catering dashboard).
async function mealStats() {
  const meals = await listMeals();
  const counts = {};
  if (USE_SUPABASE) {
    const { data, error } = await supabase.getClient().from('meal_redemptions').select('mealId:meal_id');
    if (!error) (data || []).forEach((r) => { counts[r.mealId] = (counts[r.mealId] || 0) + 1; });
  } else {
    readJson(REDEEM_FILE).forEach((r) => { counts[r.mealId] = (counts[r.mealId] || 0) + 1; });
  }
  return meals.map((m) => ({ ...m, redeemed: counts[m.id] || 0 }));
}

// The core check-in. Finds the delegate (by QR token, or reg id as a fallback),
// enforces max_per_person, and records the redemption.
// Returns { status: 'ok' | 'already' | 'notfound' | 'nomeal' | 'inactive', ... }.
async function redeemMeal({ token, regId, mealId, by }) {
  const scan = (reg) => ({
    id: reg.id, regId: reg.regId, fullName: reg.fullName, organization: reg.organization,
    designation: reg.designation, city: reg.city, mobile: reg.mobile,
  });
  if (USE_SUPABASE) {
    const c = supabase.getClient();
    const { data: meal, error: me } = await c.from('meals')
      .select('id, name, maxPerPerson:max_per_person, active').eq('id', mealId).single();
    if (me) return isNotFound(me) ? { status: 'nomeal' } : Promise.reject(mealErr(me));
    if (!meal.active) return { status: 'inactive', meal };

    let q = c.from('registrations')
      .select('id, regId:reg_id, fullName:full_name, organization, designation, city, mobile')
      .is('archived_at', null).limit(1);
    q = token ? q.eq('qr_token', token) : q.eq('reg_id', regId);
    const { data: regs, error: re } = await q;
    if (re) return Promise.reject(new Error(re.message));
    const reg = regs && regs[0];
    if (!reg) return { status: 'notfound' };

    const { data: prior, error: pe } = await c.from('meal_redemptions')
      .select('redeemedAt:redeemed_at').eq('registration_id', reg.id).eq('meal_id', mealId)
      .order('redeemed_at', { ascending: false });
    if (pe) return Promise.reject(mealErr(pe));
    const used = (prior || []).length;
    if (used >= (meal.maxPerPerson || 1)) {
      return { status: 'already', registrant: scan(reg), meal, used, max: meal.maxPerPerson || 1, lastAt: prior[0] && prior[0].redeemedAt };
    }
    const { error: ie } = await c.from('meal_redemptions')
      .insert({ registration_id: reg.id, meal_id: mealId, redeemed_by: by || null });
    if (ie) return Promise.reject(mealErr(ie));
    return { status: 'ok', registrant: scan(reg), meal, used: used + 1, max: meal.maxPerPerson || 1 };
  }
  // JSON mode
  const meal = readJson(MEALS_FILE).find((m) => m.id === mealId);
  if (!meal) return { status: 'nomeal' };
  if (meal.active === false) return { status: 'inactive', meal };
  const reg = readJson(REG_FILE).find((r) => !r.archivedAt && (token ? r.qrToken === token : r.regId === regId));
  if (!reg) return { status: 'notfound' };
  const redemptions = readJson(REDEEM_FILE);
  const prior = redemptions
    .filter((x) => x.registrationId === reg.id && x.mealId === mealId)
    .sort((a, b) => new Date(b.redeemedAt) - new Date(a.redeemedAt));
  if (prior.length >= (meal.maxPerPerson || 1)) {
    return { status: 'already', registrant: scan(reg), meal, used: prior.length, max: meal.maxPerPerson || 1, lastAt: prior[0].redeemedAt };
  }
  redemptions.push({ id: crypto.randomUUID(), registrationId: reg.id, mealId, redeemedAt: new Date().toISOString(), redeemedBy: by || null });
  writeJson(REDEEM_FILE, redemptions);
  return { status: 'ok', registrant: scan(reg), meal, used: prior.length + 1, max: meal.maxPerPerson || 1 };
}

module.exports = {
  backend: USE_SUPABASE ? 'supabase' : 'json-file',
  listRegistrations, listArchivedRegistrations, allRegistrationsForBackup,
  addRegistration, findRegistrationByMobile, setRegistrationStatus,
  archiveRegistration, restoreRegistration, purgeRegistration,
  updateRegistration, getRegistration, markCardPrinted,
  findRegistrationByToken, bulkImportRegistrations,
  listMeals, addMeal, updateMeal, deleteMeal, mealStats, redeemMeal,
  listMessages, addMessage, setMessageRead, deleteMessage,
  // hotels + bookings
  listHotels, listHotelsPublic, getHotel, addHotel, updateHotel, deleteHotel,
  listHotelBookings, listArchivedHotelBookings, addHotelBooking,
  setHotelBookingStatus, archiveHotelBooking, restoreHotelBooking, purgeHotelBooking,
};
