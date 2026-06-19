# Deploying with Supabase + Vercel

This app is **serverless-ready**. It stores data in **Supabase Postgres** and
payment screenshots in **Supabase Storage**; admin auth uses a stateless signed
token. Locally (no env vars) it falls back to JSON files + the `uploads/` folder,
so `npm start` still works with zero setup.

> The Express app is exposed as one serverless function (`api/index.js`); the
> static site in `public/` is served by Vercel's CDN. Routing is in `vercel.json`.

---

## 1. Set up Supabase (one-time)

Create a **new Supabase project** for the Conclave (keep it separate from any
other app). Then collect three values:

1. **Database URL** — Project Settings → Database → *Connection string* → **URI**.
   Use the **Transaction pooler** string (host `...pooler.supabase.com:6543`) for
   serverless. This becomes `DATABASE_URL`.
2. **Project URL** — Project Settings → API → *Project URL* → `SUPABASE_URL`.
3. **service_role key** — Project Settings → API → *service_role* secret →
   `SUPABASE_SERVICE_ROLE_KEY` (server-only; never expose to the browser).

The app **creates its tables automatically** on first request, and **creates the
Storage bucket** (`screenshots`, public) automatically too — no manual SQL or
bucket setup needed.

## 2. Test locally against Supabase (optional but recommended)

Put the values in `nepa/.env.local` (see `.env.example`), then:
```bash
npm install
npm start     # should log  [store: postgres, uploads: supabase-storage]
```
Register a test delegate with a screenshot, then check the row in Supabase
(Table editor → registrations) and the file in Storage → screenshots.

## 3. Set environment variables in Vercel

Vercel project → **Settings → Environment Variables** (Production + Preview):

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Supabase Transaction-pooler URI |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role secret |
| `SUPABASE_BUCKET` | `screenshots` (optional; this is the default) |
| `ADMIN_ID` | your admin username (default `admin`) |
| `ADMIN_PASSWORD` | **change this** from the `nepa2026` default |
| `AUTH_SECRET` | a long random string (`openssl rand -hex 32`) |
| `EARLY_BIRD_CUTOFF` | `2026-08-15` (optional) |

## 4. Deploy

**Option A — Vercel CLI (from this folder):**
```bash
cd nepa
vercel            # first run links/creates the project
vercel --prod     # production deploy
```

**Option B — GitHub:** push this folder to a new GitHub repo, then "Import Project"
in Vercel. Framework preset: **Other**. No build command. Output dir: default.

After deploy:
- Public site → `https://<your-project>.vercel.app`
- Admin → `https://<your-project>.vercel.app/admin`

---

## Local development

```bash
npm install
npm start            # no .env.local -> http://localhost:3000  (store: json-file, uploads: disk)
```

With a `nepa/.env.local` present (see `.env.example`), `npm start` auto-loads it
and switches to `store: postgres, uploads: supabase-storage`.

## Notes
- `npm run seed` only populates the **local JSON** backend (demo data); it does
  not write to Supabase.
- Admin tokens are stateless and expire after 12h; "logout" just clears the
  browser session.
- The free Supabase tier is ample for an event of this size.
- `DATABASE_URL`/`POSTGRES_URL` and `BLOB_READ_WRITE_TOKEN` are also supported,
  so the app works on Vercel Postgres/Blob too if you ever switch.
