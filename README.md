# The Mustard Oil Promotion Conclave 2026 — Registration Site & Admin

A self-contained **event registration website + admin panel** for the *Inaugural National
Mustard Oil Promotion Conclave 2026* (hosted by NEPA, Guwahati).

- **Public site** (`/`) — a premium single-page landing site with a 3-step registration modal
  ending in a payment step (UPI / Bank Transfer / Cash). No visitor login.
- **Admin panel** (`/admin`) — ID/password gate → dashboard with live stats, a searchable /
  filterable registrations table, screenshot viewer, status toggle, delete, and Excel export.

No build step, no framework, no database server. Plain **Node.js + Express**, a **JSON file**
datastore, and **vanilla HTML/CSS/JS**. Only two npm dependencies: `express` and `multer`
(Excel export uses the SheetJS CDN, client-side).

---

## Quick start

```bash
npm install
npm start
```

Then open:

- Public site → <http://localhost:3000>
- Admin panel → <http://localhost:3000/admin>  (default login **admin / nepa2026**)

Runs on `PORT` (env) or **3000**. Requires **Node 16+** (developed on Node 24).

Optional — populate ~8 demo registrations so the admin looks alive:

```bash
npm run seed
```

To wipe demo/test data, set `data/registrations.json` back to `[]` (or delete rows in the admin).

---

## How registration works

The modal is a 3-step flow:

1. **Details** — full name, 10-digit mobile, email, organization (all validated).
2. **Membership** — optional NEPA membership (+₹3,100). A live price summary shows the delegate
   fee (Early Bird / Spot label) and the running total in Indian currency format.
3. **Payment** — pick **UPI**, **Bank Transfer**, or **Cash**:
   - **UPI** → QR + UPI ID placeholders, **screenshot upload required**.
   - **Bank** → NEFT detail placeholders, optional reference/UTR, **screenshot upload required**.
   - **Cash** → "pay at the desk" note, optional note field, no upload.
   - On submit you get a confirmation with your **Registration ID**, fee type, and amount.

### Pricing logic (single source of truth — `server.js`)

- `EARLY_BIRD_CUTOFF = "2026-08-15"` (inclusive).
- Today ≤ cutoff → **Early Bird** ₹8,000; otherwise → **Spot** ₹10,000.
- NEPA membership adds **₹3,100** only when selected.
- `total = delegateFee + (member ? 3100 : 0)`. The frontend reads these via `GET /api/config`
  so it always matches the server.

---

## How the admin works

- **Login** → token stored in `sessionStorage`; the dashboard auto-opens if a token exists.
  Logout clears it. Tokens are held in memory server-side and reset on restart.
- **Stat cards** (count-up): Total Registrations, NEPA Members, Early Bird / Spot, Total
  Revenue, Confirmed (+pending).
- **Breakdown panels**: Payment Method, Membership, Status.
- **Table**: name+RegID, org, mobile, email, NEPA, fee, amount, method, ref no., screenshot
  (View → lightbox), registered date, status (click to toggle Pending ↔ Confirmed), delete
  (with confirm). Newest first. All user-supplied text is HTML-escaped (XSS-safe).
- **Filters**: search (name/mobile/org/email), method dropdown, status dropdown.
- **Export to Excel**: exports the **currently-filtered** rows to a real `.xlsx` (RegID, all
  fields, full screenshot URL, status, formatted date) via SheetJS.

---

## API reference (`server.js`)

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/config` | public | pricing constants + cutoff |
| POST | `/api/register` | public | multipart (`screenshot`); validate; save; returns `{ok, regId, totalAmount, feeType, fullName}` |
| POST | `/api/admin/login` | public | `{id,password}` → `{ok, token}` |
| POST | `/api/admin/logout` | bearer | invalidate token |
| GET | `/api/registrations` | bearer | all records, newest first |
| PATCH | `/api/registrations/:id/status` | bearer | toggle/set Pending↔Confirmed |
| DELETE | `/api/registrations/:id` | bearer | delete record + its screenshot file |
| GET | `/admin` | public | serve `admin.html` |

**Upload rules:** images only, 8 MB limit, random filenames in `uploads/`, served at `/uploads`.
Screenshot is **required** for UPI and Bank, not for Cash.

---

## Project structure

```
nepa-conclave/
├─ server.js                 # Express: static hosting, REST API, uploads, admin auth
├─ package.json              # deps: express, multer ; scripts: start, seed
├─ scripts/seed.js           # optional demo data (npm run seed)
├─ data/registrations.json   # datastore (auto-created; array of records)
├─ uploads/                  # payment screenshots (auto-created)
└─ public/
   ├─ index.html             # public landing page + registration modal
   ├─ admin.html             # admin dashboard (served at /admin)
   ├─ css/{styles,home,admin}.css
   └─ js/{main,admin}.js
```

---

## ⚠️ Placeholders to replace before going live

These are intentionally left editable (search the codebase for them):

| Item | Where |
|---|---|
| **Admin ID / password** | `server.js` → `ADMIN_ID`, `ADMIN_PASSWORD` (or set env vars) |
| **UPI QR image + UPI ID** | `public/index.html` → `.qr-placeholder`, `#upiId` |
| **Bank / NEFT details** (A/c name, A/c no., IFSC, branch) | `public/index.html` → `.bank-box` rows |
| **NEPA / COOIT / MOPA logos** | `public/index.html` footer → `.logo-chip` placeholders |
| **Empanelled hotels list** | `public/index.html` venue card ("to be added") |
| **Early-bird cutoff** | `server.js` → `EARLY_BIRD_CUTOFF` |
| **Sponsorship tier values** | `public/js/main.js` → `SPONSORS` (confirm figures with the Secretariat) |

Set production admin credentials via environment variables rather than editing code:

```bash
PORT=8080 ADMIN_ID=youradmin ADMIN_PASSWORD='a-strong-secret' npm start
```

---

## Deployment notes

Deploy to any Node host (Render, Railway, a VPS, etc.):

1. `npm install && npm start` (or set the start command to `node server.js`).
2. Set `ADMIN_ID` / `ADMIN_PASSWORD` env vars; let the host set `PORT`.
3. **Persist `data/` and `uploads/` on a persistent disk/volume.** On ephemeral filesystems
   (some free tiers) these are wiped on redeploy/restart — mount a persistent volume so
   registrations and screenshots survive.
4. Admin login tokens live in memory, so admins re-authenticate after a restart (expected).

---

© 2026 National Edible Oil Promotion Association (NEPA), Guwahati.
