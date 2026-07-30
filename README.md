# Kalpavruksha Kalyana

Matrimony service exclusively for Lingayats — Node.js + Express + EJS +
Postgres.

The app is written to be **provider-portable** on both of its external
dependencies:

- **Database** — plain `pg` (node-postgres) against any standard Postgres
  13+ connection string. Nothing Supabase-specific in the schema or queries.
- **File storage** (profile photos, jathaka PDFs, biodata PDFs, ad images) —
  a pluggable storage layer (`utils/storage/`) with drivers for Supabase
  Storage, any S3-compatible provider (AWS S3, Cloudflare R2, Backblaze B2,
  DigitalOcean Spaces, Wasabi, self-hosted MinIO), or plain local disk.
  Switching providers is a `.env` change, not a code change.

## Setup (new install)

1. **Install dependencies**
   ```
   npm install
   ```
   Requires **Node.js 18+** (the storage migration script uses the built-in
   `fetch`).

2. **Create a Postgres database**
   Any provider works — [Supabase](https://supabase.com), [Neon](https://neon.tech),
   [Railway](https://railway.app), Render Postgres, AWS RDS, or a local
   Postgres install. Get its connection string (URI form).

3. **Create your `.env` file**
   ```
   cp .env.example .env
   ```
   Paste your connection string into `DATABASE_URL`. The app runs on
   **port 5000** by default. See `.env.example` for every option, including
   the storage section below.

4. **Create the database schema**
   One file, safe to run on a brand-new database:
   ```
   psql "$DATABASE_URL" -f migrations/schema.sql
   ```
   (Or paste its contents into your provider's SQL editor, e.g. Supabase's
   **SQL Editor**.) This single file replaces the old sequence of
   `schema.sql` + `002_upgrade_features.sql` + `003_stage2_superadmin.sql` +
   `004_biodata_upload.sql` + `005_ad_slot_expiry.sql` — those four are kept
   in `migrations/archive/` for history only; don't run them.

5. **Set up file storage** — pick ONE:

   **Option A — Supabase Storage** (`STORAGE_PROVIDER=supabase`, the default)
   - In the Supabase dashboard → **Storage**, create four **Public** buckets:
     `profiles`, `jathaka`, `biodata`, `ads`.
   - In **Project Settings → API**, copy the **Project URL** and
     **service_role secret key** into `SUPABASE_URL` and
     `SUPABASE_SERVICE_ROLE_KEY`. Use the service_role key, not the anon key —
     uploads run server-side and need to bypass bucket RLS.

   **Option B — S3-compatible** (`STORAGE_PROVIDER=s3`) — AWS S3, Cloudflare
   R2, Backblaze B2, DigitalOcean Spaces, Wasabi, self-hosted MinIO, etc.
   - Create one bucket (e.g. `kalpavruksha-uploads`) on your provider of
     choice and make it publicly readable (a bucket policy, since most
     providers now reject ACLs — see your provider's docs for "public read
     bucket policy").
   - Fill in `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`,
     `S3_SECRET_ACCESS_KEY` in `.env`. Only set `S3_ENDPOINT` if you're
     **not** using real AWS S3 (R2/Spaces/MinIO all need it — see their docs
     for the exact endpoint URL). Set `S3_FORCE_PATH_STYLE=true` if your
     provider needs path-style URLs (commonly MinIO).

   **Option C — local disk** (`STORAGE_PROVIDER=local`) — no cloud account
   needed; files save under `public/uploads/`. Only use this if your host has
   a **persistent** filesystem (a VPS, or a PaaS volume) — most PaaS hosts
   (Render, Railway, Heroku free/hobby tiers, etc.) wipe the filesystem on
   every deploy/restart, which would silently delete uploaded photos/PDFs.

6. **Seed the first Super Admin account**
   ```
   npm run seed
   ```
   This reads `SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD` / `SUPERADMIN_MOBILE`
   from `.env` and creates the account. Change the password after first login.

7. **Add your logo**
   Two placeholder SVGs ship in `public/assets/logo/` so the header renders
   correctly out of the box:
   - `logo-desktop.svg` — wide horizontal lockup, shown ≥901px wide
   - `logo-mobile.svg` — compact icon-only mark, shown ≤900px wide
   Replace either file with your real artwork (same filename, similar
   proportions) and it picks up automatically — no template changes needed.
   If your real logo is a raster image (PNG/JPG) instead of SVG, either file
   can just as easily be `logo-desktop.png` / `logo-mobile.png`; update the
   two `<img src="...">` paths in `views/partials/header.ejs` to match.

8. **Run the app**
   ```
   npm start
   ```
   or, for auto-reload during development:
   ```
   npm run dev
   ```
   Visit http://localhost:5000

## Migrating an existing install

### Moving to a different Postgres provider

Because the app only ever uses a standard `DATABASE_URL` connection string
(via plain `pg`), moving databases is provider-agnostic:

1. Dump the old database: `pg_dump "$OLD_DATABASE_URL" -Fc -f backup.dump`
2. Create the new database on the new provider, and run
   `migrations/schema.sql` against it (step 4 above) — or skip this and let
   the restore recreate everything, then just re-run `schema.sql` afterwards
   to pick up anything the dump might have missed.
3. Restore: `pg_restore -d "$NEW_DATABASE_URL" --no-owner --no-privileges backup.dump`
4. Update `DATABASE_URL` in `.env` (or your host's environment variables) to
   the new connection string and restart the app.
5. `session` table: it's fine either way — `connect-pg-simple` recreates it
   automatically on first boot (`createTableIfMissing: true`) if the dump
   didn't include it or you'd rather start logged-out sessions fresh.

### Moving to a different file-storage provider

1. Set up the destination provider's `.env` variables (see Setup step 5
   above) **without removing** the current/source provider's variables yet —
   the migration script needs both at once.
2. Run the generic migration script, telling it the two providers by name
   (`supabase` | `s3` | `local`):
   ```
   MIGRATE_FROM=supabase MIGRATE_TO=s3 node scripts/migrate-storage.js
   ```
   This reads the database for every file actually referenced (profile
   photos, jathaka/biodata PDFs, ad images), downloads each from the old
   provider, and re-uploads it to the new one **under the exact same
   filename** — so no database rows need updating. It's safe to re-run.
3. Once it finishes without failures, set `STORAGE_PROVIDER` in `.env` to the
   new provider's name and restart the app.
4. Confirm a few profile photos/PDFs load correctly, then you can remove the
   old provider's credentials from `.env` and delete the old bucket/files.

(There's also `scripts/migrate-uploads-to-supabase.js`, the original
one-directional "local disk → Supabase" script from before this storage
layer existed. It still works for that one specific case; the new
`migrate-storage.js` above is the general-purpose one for any pair of
providers, including local disk as either the source or destination.)

## Portals

| Portal | URL | Notes |
|---|---|---|
| Public site | `/` | Home, registration, login |
| User dashboard | `/dashboard` | Requires an **approved** account |
| Admin portal | `/portal/admin-login` | Approve users, upload profiles, view interest activity |
| Super Admin portal | `/portal/super-secure-login` | Manage sub-admins, manage ads, view platform stats |

Admin and Super Admin accounts are **not** created through public registration —
create the first Super Admin via `npm run seed`, then use the Super Admin
dashboard to create Admin (sub-admin) accounts.

## Folder structure

```
config/           DB pool (config/db.js) + Supabase client (config/supabase.js, only used by the supabase storage driver)
middleware/       auth guards + multer upload handlers
models/           raw SQL query modules (User, Profile, Interest, Advertisement)
controllers/      route handlers
routes/           Express routers (public, user, admin, superadmin)
views/            EJS templates
public/           CSS, JS, uploaded files (if STORAGE_PROVIDER=local), logo assets
public/assets/logo/  placeholder desktop + mobile logo SVGs (see Setup step 7)
utils/storage/    pluggable file-storage layer — index.js picks the driver via STORAGE_PROVIDER
migrations/       schema.sql (single consolidated migration) + seed.js
migrations/archive/  superseded step-by-step migration files, kept for history only
scripts/          one-off maintenance scripts (storage migration, etc.)
```

## Notes / things to revisit

- Passwords are hashed with **bcrypt** before storage.
- If `STORAGE_PROVIDER=local`, uploaded files live on this server's own disk
  under `public/uploads/`. Most PaaS hosts wipe this on every deploy/restart
  unless you attach a persistent volume — see Setup step 5, Option C.
- The `/portal/...` routes are unlisted, not authenticated by obscurity alone —
  real role-based session middleware (`middleware/auth.js`) guards every route.
- The contact form on the home page currently just shows a confirmation flash
  message; wire it up to email/CRM as needed.
- The logo files in `public/assets/logo/` are placeholders (a simple diya
  emblem + wordmark in the site's existing colors) — swap them for real
  designed artwork whenever it's ready.

## Recent updates

**Admin/Super Admin UX:** "Create User" / "Create Sub-Admin" / "Upload
Advertisement" now open in a modal instead of sitting inline on the page
permanently. Each row in a management table has a "⋮" action menu (Change
Password, Delete User, Remove Admin, etc.) instead of separate always-visible
buttons/forms per row.

**Mobile layout, sidebar portals, more ad slots, YouTube-style search,
saved/interested tabs:**

1. **Mobile-friendly.** The public nav, admin/super admin portals, search bar,
   and profile grids all collapse to single/two-column layouts with a
   hamburger menu below ~900px, down to small phones (~400px). The header
   logo also swaps to a compact mobile mark at that same breakpoint.

2. **Professional Admin & Super Admin portals.** Both are now a sidebar +
   page layout instead of one long scrolling dashboard:
   - **Admin:** Overview, User Approvals, Profiles, Success Stories.
   - **Super Admin:** Overview, Sub-Admins, Advertisements, Success Stories.
   Both admins and super admins can add/edit/hide/delete the "Success
   Stories" shown on the home page (previously hard-coded in the template).

3. **More ad placements.** Beyond the original Top Banner / Sidebar spots,
   the home page now has Middle-of-page and Bottom-of-page ad banners, plus
   a dedicated **"after search results" banner** on the Find Matches page —
   always a clearly-labeled "Sponsored" banner, never mixed in with member
   profile cards. Manage all of this from Super Admin → Advertisements.

4. **YouTube/LinkedIn-style search.** The "Find Matches" page now has a top
   search bar (search by name/occupation/city) with a **Filters** dropdown
   for Caste, Language, Age Range, Religion, Sub-caste, and Gender.

   **Saved vs. Interested are now independent.** Saving a profile no longer
   overwrites an "Express Interest" on that same profile (or vice versa) —
   each member has a **Saved** tab and a separate **Interested** tab on the
   "My Profiles" page.
