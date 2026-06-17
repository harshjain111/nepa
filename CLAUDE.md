# CLAUDE.md — Mustard Oil Promotion Conclave 2026 (NEPA) — Build Guide

This file gives Claude Code everything it needs to build the project, plus a **phase-by-phase prompt script** at the bottom. Drop this file in an empty project folder, open Claude Code, and paste the phase prompts one at a time in order.

---

## 1. What we are building

A complete **full-stack event registration website + admin panel** for the *Inaugural National Mustard Oil Promotion Conclave 2026* (hosted by NEPA, Guwahati).

- **Public site:** one premium scrolling landing page. No visitor login/auth. Anyone can read the event details and register.
- **Registration:** a 3-step form ending in a payment step (UPI / Bank / Cash) where the user uploads a payment screenshot (for UPI & Bank; Cash needs none).
- **Admin panel** (`/admin`): a simple ID/password gate that opens a dashboard with live stats, a registrations table, screenshot viewer, status toggle, delete, and Excel export.

### Hard rules / principles
- **No build step, no framework, no database server.** Plain Node.js + Express backend, a JSON file as the datastore, and vanilla HTML/CSS/JS frontend. It must run with just `npm install && npm start`.
- **Only two npm dependencies:** `express` and `multer`. Nothing native (so it installs anywhere). Excel export is done client-side via the SheetJS CDN.
- **Mobile-first and fully responsive.**
- **Design = minimal, premium, editorial, "heritage-luxury."** Subtle animation only. Never flashy, cheap, or cluttered.
- Keep all event copy and pricing in clearly-marked config/data spots so it's easy to edit later.

---

## 2. Tech stack & file structure

```
nepa-conclave/
├─ server.js              # Express: static hosting, REST API, uploads, admin auth
├─ package.json           # deps: express, multer ; script: start
├─ data/registrations.json   # auto-created datastore (array of records)
├─ uploads/               # auto-created; payment screenshots saved here
└─ public/
   ├─ index.html          # public website + registration modal
   ├─ admin.html          # admin dashboard (served at /admin)
   ├─ css/
   │  ├─ styles.css        # shared design system (colors, type, header, footer, buttons)
   │  ├─ home.css          # landing page + registration modal styles
   │  └─ admin.css         # admin dashboard styles
   └─ js/
      ├─ main.js           # content rendering, animations, registration flow
      └─ admin.js          # login, dashboard, table, filters, export
```

Node 16+. Run on PORT env or default 3000.

---

## 3. Brand & design system

**Palette (CSS variables):**
```
--ivory:    #FBF6EA   (page background)
--ivory-2:  #F5ECD6
--green:    #1F3D2E   (primary deep forest green)
--green-2:  #2F5D3A
--gold:     #C5A253   (hairlines, accents, eyebrows)
--gold-soft:#D8C08A
--mustard:  #E6B422   (primary CTA, active states — used sparingly)
--sienna:   #8B5E3C
--ink:      #25291F   (body text)
--muted:    #6F6B5D
```
Base = deep green + ivory. Gold for thin dividers/borders/labels. Mustard yellow only for primary CTAs and active toggles.

**Typography (Google Fonts):**
- Display headings: `Cormorant Garamond` (serif).
- Big all-caps event title only: `Cinzel`.
- Body/UI: `Inter`.
- Small-caps labels ("DATES", "VENUE") get wide letter-spacing.

**Motifs (keep faint/tasteful):** soft Mughal-arch frame in the hero, slow-floating gold/gem diamond particles, thin gold rules with small diamond end-caps as section dividers. No clip-art.

**Motion:** gentle fade-up reveal on scroll (IntersectionObserver), smooth step transitions in the form, slow particle float. Nothing bouncy or fast.

**Recurring components:** sticky translucent header with brand + anchor nav + "Register Now"; a persistent floating "Register Now" pill (bottom-right); green footer with org-logo placeholders.

---

## 4. Event content (use this exact copy)

**Identity**
- Name: **The Mustard Oil Promotion Conclave 2026** (Inaugural National Mustard Oil Promotion Conclave 2026)
- Tag line under title: **"For the Authentic. For the Pure. For Bharat."**
- Edition chip: **EDITION 2026 · BY INVITATION**
- Footer strip / repeated motto: **"Pure by Tradition · Powered by Science · Proudly Indian"** and **"One Industry. One Purpose. One Collective Voice."**
- Dates: **19–20 September 2026** (Saturday & Sunday)
- Venue: **Mayfair Spring Valley Resort**, a 5-star resort, **Guwahati, Assam, North-East India**
- Attendance chip: **400+ Delegates** (Producers · Traders · Doctors · Govt.)
- Organised by: **The Mustard Oil Promotion Council — under COOIT, New Delhi**
- Hosted by: **National Edible Oil Promotion Association (NEPA), Guwahati**
- In collaboration with: **Mustard Oil Producers Association of India (MOPA)**
- Contact: **Phone 94350-40234 · Email nepaconnect2026@gmail.com**
- Secretariat: **Conclave Secretariat, NEPA, Ajit Singh Bothra & Sons, Lakhi Gali, Guwahati – 781001**

**The Invitation (about) body**
> The Mustard Oil Promotion Council — newly constituted under the Central Organization for Oil Industry & Trade (COOIT) — is honoured to invite you to the Inaugural National Mustard Oil Promotion Conclave 2026, on 19th–20th September 2026 at Guwahati, hosted by the National Edible Oil Promotion Association (NEPA).
>
> Across two days, the Conclave brings together producers, refiners, kachi ghani millers, traders, retailers, the HoReCa segment, food scientists, doctors and nutritionists, FSSAI representatives, agricultural economists, farmer leaders and Government — to make a unified case for India's most strategically important indigenous edible oil. The Conclave concludes with the public reading of the Guwahati Mustard Charter.

**Pull-quote**
> "Where mustard oil is honored, the Indian kitchen remembers itself. Where it is forgotten, both health and heritage diminish."

**The Charter — Eight Pillars** (numbered cards)
1. **Bridge between B2B Channel** — Channelise cold-pressed, single-origin mustard oil through a unified network between manufacturers and distributors.
2. **Stand with the Mustard Farmers** — Strengthen MSP support, ensure fair price discovery, and integrate the smallholder farmer into the National Mission on Edible Oils–Oilseeds.
3. **Educate & Counter Misinformation** — Articulate, with evidence, the health virtues of mustard oil — its omega-3 content, low saturated fat, and place in Ayurveda and modern nutrition.
4. **Strengthen FSSAI Standards** — Advocate robust standards, swift enforcement against adulteration, and preservation of the ban on blending in mustard oil.
5. **Build a Heritage Brand** — Pursue Geographical Indication (GI) tags for regional varieties and project Indian mustard oil on the world stage.
6. **Develop Export Markets** — Open new corridors for Indian mustard oil — to the diaspora, specialty retail, and global culinary traditions.
7. **Modernise the Ghani** — Support technology adoption in extraction, packaging, traceability and food-safety without compromising the kachi ghani process.
8. **Unify the Value Chain** — Bring producers, millers, refiners, packers, traders and retailers under one collective voice.

**The Programme** (two-day timeline)
*Day One — Saturday, 19 Sept 2026*
- 1:15 pm — Registration & Welcome Lunch
- 4:30 pm — Panel Session: Bridge between B2B Channel
- 7:30 pm — Cultural Evening: Bihu Performance & Gala Dinner

*Day Two — Sunday, 20 Sept 2026*
- 8:30 am — Registration & Breakfast
- 10:00 am — Opening & Lamp Lighting
- 10:30 am — Panel: Pure Kachi Ghani — FSSAI Standards
- 11:00 am — Presidential Address — Shri Babu Lal Data, President, COOIT
- 11:15 am — Address — Shri Kailash Kabra, President, NEPA
- 11:30 am — Address — Shri Suresh Nagpal, Chairman, COOIT
- 11:45 am — Chief Guest Address — Hon'ble Minister
- 12:45 pm — Industry–Government Dialogue
- 1:30 pm — Lunch
- 2:30 pm — Open Discussions
- 3:30 pm — Mustard Oil Excellence Awards
- 4:00 pm — The Guwahati Mustard Charter: Public Reading
- 4:30 pm — High Tea & Vote of Thanks

**Participation & Tariff**
- Delegate — Early Bird (up to 15 Aug 2026): **₹8,000**
- Delegate — Spot Registration (after 15 Aug): **₹10,000**
- NEPA Membership add-on (optional): **₹3,100**

Sponsorship tiers (display-only cards, **not** registrable online; button routes to Secretariat):
- **Diamond ₹15,00,000 + GST · Platinum ₹10,00,000 + GST · Gold ₹5,00,000 + GST · Silver ₹2,50,000 + GST · Bronze ₹1,00,000 + GST**
- Additional branding line: Delegate Kit ₹3,00,000 · Lanyard ₹2,00,000 · Note Pad & Pen ₹1,50,000 · Tea/Coffee Break ₹1,50,000 · Main Stage Branding ₹1,50,000 · Digital Branding ₹2,50,000.
- ⚠️ Confirm tier numbers before launch (the source deck and PDF disagreed; these are the PDF values).

**Venue / Practical**
- "A premium five-star resort amidst Guwahati's natural beauty, with easy connectivity to LGBI Airport."
- "Accommodation is available at preferential rates. Please contact NEPA directly, quoting 'Mustard Conclave 2026'."
- Empanelled hotels list — ⚠️ placeholder "to be added."
- Banking details for cheques/drafts — communicated to confirmed delegates/sponsors.

---

## 5. Pricing logic (single source of truth in server.js)

- `EARLY_BIRD_CUTOFF = "2026-08-15"` (inclusive).
- If today's date (`YYYY-MM-DD`) ≤ cutoff → feeType `"Early Bird"`, delegate fee **8000**; else feeType `"Spot"`, fee **10000**.
- Membership fee **3100** added only if the user selects Yes.
- `total = delegateFee + (member ? 3100 : 0)`.
- Expose these constants via `GET /api/config` so the frontend computes the same total and labels.

---

## 6. Data model

`data/registrations.json` is an array of records:
```json
{
  "id": "uuid",
  "regId": "NEPA26-1001",
  "createdAt": "ISO timestamp",
  "fullName": "string",
  "mobile": "10 digits",
  "email": "string",
  "organization": "string",
  "nepaMember": true,
  "feeType": "Early Bird | Spot",
  "delegateFee": 8000,
  "membershipFee": 3100,
  "totalAmount": 11100,
  "paymentMethod": "UPI | Bank | Cash",
  "referenceNo": "string | null",
  "screenshotUrl": "/uploads/xxx.png | null",
  "note": "string | null",
  "status": "Pending | Confirmed"
}
```
`regId` = `"NEPA26-" + (1000 + sequence)`.

---

## 7. API spec (server.js)

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/config` | public | pricing constants + cutoff |
| POST | `/api/register` | public | multipart (Multer `screenshot`); validate; save record; return `{ ok, regId, totalAmount, feeType, fullName }` |
| POST | `/api/admin/login` | public | `{id,password}` → `{ok, token}`; store token in an in-memory Set |
| POST | `/api/admin/logout` | bearer | invalidate token |
| GET | `/api/registrations` | bearer | all records, newest first |
| PATCH | `/api/registrations/:id/status` | bearer | toggle/set Pending↔Confirmed |
| DELETE | `/api/registrations/:id` | bearer | delete record + its screenshot file |
| GET | `/admin` | public | serve admin.html |

**Validation on `/api/register`:** require fullName, email, organization; mobile must match `^\d{10}$`; email must look valid; paymentMethod ∈ {UPI,Bank,Cash}; **screenshot required when method is UPI or Bank**. Multer: images only, 8 MB limit, save to `uploads/` with a random filename. Serve `/uploads` statically.

**Admin auth:** `ADMIN_ID` (default `admin`) and `ADMIN_PASSWORD` (default `nepa2026`) from env or constants. Token = random hex; protected routes check `Authorization: Bearer <token>` against the Set.

---

## 8. Registration flow (frontend, in a modal)

Stepper `01 Details · 02 Membership · 03 Payment`.

- **Step 1 — Details:** Full Name, Mobile (10-digit, strip non-digits, maxlength 10), Email, Organization. Validate before advancing.
- **Step 2 — Membership:** "Want to become a NEPA member?" → Yes/No toggle buttons (required). Helper: "NEPA Membership fee: ₹3,100 (one-time)." Live **price summary** panel: delegate fee (with Early Bird/Spot label) + membership row (shown only if Yes) + bold total.
- **Step 3 — Payment:** show amount payable. Three method toggle cards: **UPI**, **Bank Transfer**, **Cash / At Venue**.
  - UPI → QR placeholder + UPI ID placeholder + **required** screenshot upload.
  - Bank → NEFT details placeholders + optional reference no. + **required** screenshot upload.
  - Cash → note "Pay at the registration desk; seat provisionally reserved." + optional note field. No upload.
  - Submit → POST FormData → on success show **confirmation** (name, Registration ID, amount, fee type, "we'll confirm payment shortly").
- Close on overlay click / Esc; reset state on close. Currency formatted Indian style (`₹8,000`, `₹11,100`, `₹15,00,000`).

---

## 9. Admin dashboard (frontend)

- **Login gate** card: lock icon, "Admin Access", ID + Password, Sign In. Store token in `sessionStorage`; auto-open dashboard if a token exists. Logout clears it.
- **Stat cards** (count-up on load): Total Registrations, NEPA Members, Early Bird / Spot, Total Revenue (sum of totalAmount), Confirmed (+pending count).
- **Breakdown panels** (green cards): Payment Method (UPI/Bank/Cash), Membership (Yes/No), Status (Confirmed/Pending).
- **Table** columns: Name, Organization, Mobile, Email, NEPA, Fee, Amount, Method, Ref No., Screenshot (View → lightbox), Registered (formatted date), Status (toggle button), Actions (delete w/ confirm). Sort newest first. Escape all user-supplied strings (XSS-safe).
- **Filters:** search (name/mobile/org/email), method dropdown, status dropdown — all re-render the table.
- **Export to Excel:** SheetJS (`XLSX`) from CDN; export the **currently-filtered** rows to a real `.xlsx` (include regId, all fields, full screenshot URL, status, formatted date).

---

## 10. Acceptance criteria (test before declaring done)

Run `npm install && npm start`, then verify (curl is fine; backgrounding may not persist between shells, so start server + test in one session):
- `GET /api/config` returns the four constants.
- Register **UPI** with screenshot + member=Yes → `totalAmount` 11100, feeType "Early Bird".
- Register **Cash** member=No → 8000, no screenshot needed.
- Register **Bank** with ref + screenshot → 11100; reference stored.
- Bad mobile (`123`) → **400**. UPI **without** screenshot → **400**.
- Admin login wrong password → **401**; correct → token. `GET /api/registrations` without token → **401**, with token → list.
- Uploaded screenshots land in `uploads/` and `View` opens them in the admin.
- `node --check` passes for server.js, main.js, admin.js. Every `#id` referenced in JS exists in the matching HTML.
- Landing page is responsive at 380px, 768px, 1280px. No console errors.

---

## 11. ⚠️ Placeholders to leave clearly editable

Admin ID/password · UPI QR image + UPI ID · Bank/NEFT details (A/c name, A/c no., IFSC, branch) · NEPA/COOIT/MOPA logos · empanelled-hotels list · `EARLY_BIRD_CUTOFF`. Document these in a README.

---

# 12. PHASE-BY-PHASE BUILD PROMPTS

> Paste these into Claude Code **one at a time, in order**. Wait for each phase to finish (and pass its checks) before sending the next. Each phase references the spec sections above.

### Phase 0 — Scaffold
```
Read CLAUDE.md fully. Create the project structure exactly as in section 2: package.json (deps express + multer, "start": "node server.js", type commonjs), and empty folders data/, uploads/, public/css/, public/js/. Create a .gitignore for node_modules, data/*.json and uploads/* (keep the folders with .gitkeep). Then run npm install. Do not write any app code yet — just scaffold and confirm install succeeds.
```

### Phase 1 — Backend (server.js)
```
Build server.js per sections 5, 6, and 7 of CLAUDE.md. Implement: a tiny JSON datastore (read/serialized-write to data/registrations.json, auto-create if missing), Multer disk upload (images only, 8 MB, random filenames into uploads/, served at /uploads), in-memory admin token auth, and all endpoints in the section 7 table with the exact validation rules. Expose pricing via /api/config and compute Early Bird vs Spot from EARLY_BIRD_CUTOFF=2026-08-15. Serve public/ statically and /admin → admin.html. Then test with curl in a single shell session (start server in background, run the section 10 backend checks, kill it) and show me the results.
```

### Phase 2 — Design system + landing page
```
Create public/css/styles.css (shared design system: CSS variables from section 3, Google Fonts Cinzel/Cormorant Garamond/Inter, sticky header, footer, buttons, .reveal animation, .eyebrow, .gold-rule). Then build public/index.html and public/css/home.css implementing the full landing page using the EXACT content in section 4, in this order: sticky header + floating Register CTA, hero (Cinzel title, taglines, info chips, gem particles, faint Mughal-arch frame), The Invitation + pull-quote + organiser/host/collaborator row, The Charter (8 numbered cards on a green section), The Programme (two-day timeline, two columns), Participation & Tariff (highlighted delegate card + 5 display-only sponsor cards + additional-branding line), Venue & Secretariat (two cards) + final CTA banner, and the green footer with logo placeholders. Leave the registration modal markup in the HTML but it can be inert for now. Mobile-first responsive. No frameworks.
```

### Phase 3 — Registration flow (main.js)
```
Create public/js/main.js per sections 5 and 8. Render the Charter, Programme and Sponsor cards from JS data arrays. Add IntersectionObserver reveal-on-scroll and the floating hero gem particles. Fetch /api/config and implement the 3-step registration modal: validation per step, the live price summary (Early Bird/Spot label + optional membership row + total, Indian currency formatting), the Yes/No membership toggle, the UPI/Bank/Cash method toggles showing the right panel, required screenshot for UPI & Bank, submit via FormData to /api/register, and a confirmation screen showing the returned Registration ID and amount. Wire open/close (overlay click + Esc) and reset on close. Confirm every #id used here exists in index.html.
```

### Phase 4 — Admin panel
```
Build public/admin.html, public/css/admin.css and public/js/admin.js per section 9. Login gate (token in sessionStorage, auto-login if present, logout). Dashboard with count-up stat cards, three green breakdown panels, and a searchable/filterable registrations table (method + status dropdowns). Screenshot "View" opens a lightbox; per-row status toggle (PATCH) and delete (with confirm). Excel export of the currently-filtered rows using SheetJS from the CDN. Escape all user strings to prevent XSS. Match the site's green/gold/ivory theme. Reuse styles.css.
```

### Phase 5 — End-to-end test, README & polish
```
Do a full pass: start the server and run the entire section 10 acceptance checklist (backend curl tests + node --check on all JS + verify every JS #id exists in its HTML). Fix anything that fails. Reset data/registrations.json to [] and clear test files from uploads/. Write a README.md covering how to run it, how registration & admin work, and the section 11 placeholders to replace before going live (admin password, UPI QR/ID, bank details, logos, hotels list, early-bird cutoff). Report what you tested and the results.
```

### Optional Phase 6 — Seed data & deployment
```
Add an optional seed script (npm run seed) that inserts ~8 realistic sample registrations across UPI/Bank/Cash and member Yes/No so the admin looks populated for a demo, and a clear note on deploying to a Node host (Render/Railway/VPS) with data/ and uploads/ on persistent storage. Keep seed data easy to wipe.
```
