# Deploying to Vercel

This app is **serverless-ready**. On Vercel it stores data in **Postgres** and
payment screenshots in **Vercel Blob**; admin auth uses a stateless signed token.
Locally (no env vars) it falls back to JSON files + the `uploads/` folder, so
`npm start` still works with zero setup.

> The Express app is exposed as one serverless function (`api/index.js`); the
> static site in `public/` is served by Vercel's CDN. Routing is in `vercel.json`.

---

## 1. Provision storage (one-time, in the Vercel dashboard)

In your Vercel project → **Storage**:

1. **Create a Postgres database** (Vercel Postgres / Neon). When you connect it to
   the project, Vercel auto-adds `POSTGRES_URL` (and friends) to the project's
   environment variables. The app reads `DATABASE_URL` **or** `POSTGRES_URL`, and
   **creates its tables automatically** on first request — no manual SQL needed.
2. **Create a Blob store**. Connecting it auto-adds `BLOB_READ_WRITE_TOKEN`.

## 2. Set the remaining environment variables

In your Vercel project → **Settings → Environment Variables** (Production + Preview):

| Variable | Value | Notes |
|---|---|---|
| `ADMIN_ID` | your admin username | defaults to `admin` if unset |
| `ADMIN_PASSWORD` | a strong password | **change this** from the `nepa2026` default |
| `AUTH_SECRET` | a long random string | signs admin tokens; e.g. `openssl rand -hex 32` |
| `EARLY_BIRD_CUTOFF` | `2026-08-15` | optional; overrides the early-bird date |
| `POSTGRES_URL` / `DATABASE_URL` | *(auto from step 1)* | the pooled connection string |
| `BLOB_READ_WRITE_TOKEN` | *(auto from step 1)* | |

## 3. Deploy

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
npm start            # http://localhost:3000  (store: json-file, uploads: disk)
```

To test the **Postgres/Blob** path locally, pull the env vars and run:
```bash
vercel env pull .env.local
# load .env.local into your shell, then:
npm start            # now uses store: postgres, uploads: vercel-blob
```

## Notes
- `npm run seed` only populates the **local JSON** backend (demo data); it does
  not write to Postgres.
- Admin tokens are stateless and expire after 12h; "logout" just clears the
  browser session.
- Free Postgres/Blob tiers are ample for an event of this size.
