'use strict';

/**
 * Shared Supabase client (service-role, server-only).
 * Used for both data (lib/store.js) and file storage (lib/uploads.js).
 * Talks to Supabase over HTTPS (PostgREST + Storage) — serverless-safe,
 * no Postgres connection pooling / prepared-statement pitfalls.
 */

const SUPA_URL = process.env.SUPABASE_URL || '';
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

let client = null;

function getClient() {
  if (!SUPA_URL || !SUPA_KEY) return null;
  if (!client) {
    const { createClient } = require('@supabase/supabase-js');
    client = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
  }
  return client;
}

module.exports = { getClient, enabled: !!(SUPA_URL && SUPA_KEY) };
