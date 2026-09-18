-- ============================================================
--  NEPA Conclave 2026 — Supabase schema
--  Run in Supabase → SQL Editor (paste all, click Run).
--  Idempotent AND self-repairing: safe to run on a fresh project
--  OR on one where an earlier version already made the tables.
--  Data is accessed server-side via the service-role key (bypasses
--  RLS), so no policies are required.
-- ============================================================

create extension if not exists pgcrypto;

-- Gapless-ish registration numbers: NEPA26-1001, NEPA26-1002, ...
create sequence if not exists reg_seq start 1001;

-- ---- fresh-project creation ----
create table if not exists registrations (
  id             uuid primary key default gen_random_uuid(),
  reg_id         text unique not null default ('NEPA26-' || nextval('reg_seq')),
  created_at     timestamptz not null default now(),
  full_name      text not null,
  mobile         text not null,
  email          text not null,
  organization   text not null,
  nepa_member    boolean not null default false,
  fee_type       text not null,
  delegate_fee   integer not null default 0,
  membership_fee integer not null default 0,
  subtotal       integer not null default 0,
  gst_rate       numeric not null default 0,
  gst_amount     integer not null default 0,
  total_amount   integer not null default 0,
  payment_method text not null,
  reference_no   text,
  screenshot_url text,
  note           text,
  status         text not null default 'Pending'
);

create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  email       text not null,
  phone       text,
  subject     text,
  message     text not null,
  read        boolean not null default false
);

-- ---- repair an older table (all no-ops if already correct) ----
alter table registrations alter column id     set default gen_random_uuid();
alter table registrations alter column reg_id set default ('NEPA26-' || nextval('reg_seq'));
alter table registrations alter column created_at set default now();
alter table registrations alter column status set default 'Pending';
alter table registrations add column if not exists subtotal   integer not null default 0;
alter table registrations add column if not exists gst_rate    numeric not null default 0;
alter table registrations add column if not exists gst_amount  integer not null default 0;
-- Optional GST number supplied by the registrant.
alter table registrations add column if not exists gst_number  text;
-- Links a delegate to the paying "party" (from the allocation list), if any.
alter table registrations add column if not exists party_id    uuid;
-- Audit: which helpdesk user created this registration.
alter table registrations add column if not exists registered_by text;
-- Help-desk delegates may not have a phone/email; the public form still
-- validates them at the API. Relax the DB constraints so those entries save.
alter table registrations alter column mobile drop not null;
alter table registrations alter column email  drop not null;
-- ID-card fields (filled by admin / bulk import; not on the public form).
alter table registrations add column if not exists designation text;
alter table registrations add column if not exists city        text;
-- Where the record came from: 'web' (public form) or 'offline-import' (Excel).
alter table registrations add column if not exists source      text not null default 'web';
-- When this delegate's ID card was last printed (nullable).
alter table registrations add column if not exists card_printed_at timestamptz;
-- Per-delegate QR token: unguessable id embedded in the ID-card QR (vCard UID)
-- and used by the meal scanner to identify the delegate. gen_random_bytes needs
-- pgcrypto (created above). Backfill existing rows, then default new ones.
alter table registrations add column if not exists qr_token    text;
update registrations set qr_token = encode(gen_random_bytes(10), 'hex') where qr_token is null;
alter table registrations alter column qr_token set default encode(gen_random_bytes(10), 'hex');
create unique index if not exists registrations_qr_token_unique on registrations (qr_token);
-- Soft-delete: the admin "delete" sets archived_at instead of removing the row,
-- so registrations are never lost and can be restored.
alter table registrations add column if not exists archived_at timestamptz;

alter table messages alter column id         set default gen_random_uuid();
alter table messages alter column created_at set default now();

-- One registration per mobile number — but only among ACTIVE rows, so an
-- archived registration frees the number for re-registration. (Fails only if
-- duplicate active mobiles already exist — clean those up first if so.)
drop index if exists registrations_mobile_unique;
create unique index if not exists registrations_mobile_active_unique
  on registrations (mobile) where archived_at is null;

-- ============================================================
--  HOTEL ACCOMMODATION (managed by the 'hotel' team role)
-- ============================================================

-- Hotel booking numbers: HB26-2001, HB26-2002, ...
create sequence if not exists hotel_booking_seq start 2001;

-- Hotels the team manages: capacity (rooms) + per-hotel package prices.
create table if not exists hotels (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  name         text not null,
  address      text,
  total_rooms  integer not null default 0,
  single_price integer not null default 8000,
  double_price integer not null default 10000,
  active       boolean not null default true,
  sort         integer not null default 0
);

-- Each booking uses ONE room (single = 1 guest, double = 2 sharing 1 room).
create table if not exists hotel_bookings (
  id             uuid primary key default gen_random_uuid(),
  booking_id     text unique not null default ('HB26-' || nextval('hotel_booking_seq')),
  created_at     timestamptz not null default now(),
  hotel_id       uuid references hotels(id) on delete set null,
  hotel_name     text,                         -- snapshot, survives hotel deletion
  occupancy      text not null,                -- 'Single' | 'Double'
  guest_name     text,                         -- optional 2nd guest (double)
  full_name      text not null,
  firm           text,
  address        text,
  mobile         text not null,
  email          text,
  room_price     integer not null default 0,
  subtotal       integer not null default 0,
  gst_rate       numeric not null default 0,
  gst_amount     integer not null default 0,
  total_amount   integer not null default 0,
  payment_method text not null,
  reference_no   text,
  screenshot_url text,
  note           text,
  status         text not null default 'Pending',
  archived_at    timestamptz                   -- soft-delete; frees the room
);

-- repair no-ops (safe on pre-existing tables)
alter table hotels alter column id set default gen_random_uuid();
alter table hotels alter column created_at set default now();
alter table hotel_bookings alter column id set default gen_random_uuid();
alter table hotel_bookings alter column booking_id set default ('HB26-' || nextval('hotel_booking_seq'));
alter table hotel_bookings alter column created_at set default now();
alter table hotel_bookings add column if not exists archived_at timestamptz;

-- ============================================================
--  MEALS / CATERING CHECK-IN (managed by admin; scanned by the 'gate' role)
-- ============================================================

-- The catalog of scannable sessions: meals (Day 1 Lunch) AND events
-- (Afternoon Seminar). max_per_person is how many times ONE delegate may
-- avail/attend this session (usually 1). kind = 'meal' | 'event'.
create table if not exists meals (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  name           text not null,
  meal_day       text,                          -- free label, e.g. 'Day 1' / date
  kind           text not null default 'meal',  -- 'meal' | 'event'
  max_per_person integer not null default 1,
  active         boolean not null default true,
  sort           integer not null default 0
);

-- One row per time a delegate avails a meal. Counting rows per (delegate, meal)
-- enforces the max_per_person limit in the app.
create table if not exists meal_redemptions (
  id              uuid primary key default gen_random_uuid(),
  registration_id uuid references registrations(id) on delete cascade,
  meal_id         uuid references meals(id) on delete cascade,
  redeemed_at     timestamptz not null default now(),
  redeemed_by     text                           -- which gate/staffer scanned
);

-- repair no-ops
alter table meals alter column id set default gen_random_uuid();
alter table meals alter column created_at set default now();
alter table meals add column if not exists kind text not null default 'meal';
alter table meal_redemptions alter column id set default gen_random_uuid();
alter table meal_redemptions alter column redeemed_at set default now();

create index if not exists meal_redemptions_reg_idx  on meal_redemptions (registration_id);
create index if not exists meal_redemptions_meal_idx on meal_redemptions (meal_id);

-- ============================================================
--  ADMIN USERS — extra logins created from the admin panel
--  (e.g. 'print' operators who print ID cards). Passwords are
--  stored as scrypt hashes, never plaintext.
-- ============================================================
create table if not exists admin_users (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  username      text unique not null,
  password_hash text not null,
  label         text,
  role          text not null default 'print',
  active        boolean not null default true
);
alter table admin_users alter column id set default gen_random_uuid();
alter table admin_users alter column created_at set default now();

-- ============================================================
--  BACKUPS — full point-in-time snapshots of registrations,
--  hotel bookings, meals, check-ins & enquiries (kept even after
--  the live data is cleared). `data` holds the whole snapshot.
-- ============================================================
create table if not exists backups (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  label      text,
  counts     jsonb,
  data       jsonb
);
alter table backups alter column id set default gen_random_uuid();
alter table backups alter column created_at set default now();

-- ============================================================
--  PARTIES — paying parties from the allocation list. Each has a
--  number of paid delegate passes (paid_count, null = ask accountant).
--  Delegates entered at the help desk link back via registrations.party_id.
-- ============================================================
create table if not exists parties (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text not null,
  category   text,               -- 'full' | 'free' | 'action'
  paid_count integer,            -- null = unknown (call accountant)
  amount     integer,
  notes      text,
  sort       integer not null default 0,
  active     boolean not null default true
);
alter table parties alter column id set default gen_random_uuid();
alter table parties alter column created_at set default now();
-- Audit for manually-confirmed delegate counts (blank-in-Excel parties).
alter table parties add column if not exists original_paid text;   -- raw Excel value
alter table parties add column if not exists confirmed_by  text;   -- who confirmed the count
alter table parties add column if not exists confirmed_at  timestamptz;
create index if not exists registrations_party_idx on registrations (party_id);

-- Atomically claim a paid delegate slot for a party. Locks the party row so
-- two devices can never over-fill (final count can never exceed paid_count).
create or replace function claim_party_slot(
  p_party_id uuid, p_full_name text, p_org text, p_mobile text, p_designation text, p_by text
) returns table(id uuid, reg_id text, qr_token text)
language plpgsql as $$
declare v_cap integer; v_filled integer;
begin
  select paid_count into v_cap from parties where parties.id = p_party_id for update;
  if not found then raise exception 'NO_PARTY'; end if;
  if v_cap is null then raise exception 'NO_COUNT'; end if;
  select count(*) into v_filled from registrations
    where registrations.party_id = p_party_id and registrations.archived_at is null;
  if v_filled >= v_cap then raise exception 'PARTY_FULL'; end if;
  return query
  insert into registrations (full_name, mobile, organization, designation, source, party_id,
                             fee_type, payment_method, status, registered_by)
  values (p_full_name, nullif(p_mobile,''), nullif(p_org,''), nullif(p_designation,''), 'helpdesk', p_party_id,
          'Prepaid', 'Prepaid', 'Confirmed', nullif(p_by,''))
  returning registrations.id, registrations.reg_id, registrations.qr_token;
end $$;
