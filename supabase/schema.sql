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
