-- ============================================================
--  NEPA Conclave 2026 — Supabase schema
--  Run ONCE in Supabase → SQL Editor (paste all, click Run).
--  Safe to re-run (everything is "if not exists").
--  Data is accessed only server-side via the service-role key,
--  which bypasses RLS, so no policies are required.
-- ============================================================

create extension if not exists pgcrypto;

-- Gapless-ish registration numbers: NEPA26-1001, NEPA26-1002, ...
create sequence if not exists reg_seq start 1001;

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
