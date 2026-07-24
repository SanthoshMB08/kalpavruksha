# Kalpavruksha Kalyana

Matrimony service exclusively for Lingayats — Node.js + Express + EJS +
Supabase (Postgres).

File uploads (profile photos, jathaka PDFs, ad images) are stored on the
**local filesystem** under `public/uploads/`, same as before — only the
database was migrated to Supabase. Supabase Storage is not used.

## Setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Create a Supabase project**
   Go to [supabase.com](https://supabase.com), create a project, then open
   **Project Settings -> Database -> Connection string -> URI** and copy it.

3. **Create your `.env` file**
   ```
   cp .env.example .env
   ```
   Paste your Supabase connection string into `DATABASE_URL`. The app runs on
   **port 5000** by default.

4. **Create the database schema**
   Run the SQL in `migrations/schema.sql` against your Supabase database —
   easiest way is to paste it into the Supabase dashboard's **SQL Editor** and
   run it, or from the command line:
   ```
   psql "$DATABASE_URL" -f migrations/schema.sql
   ```

5. **Seed the first Super Admin account**
   ```
   npm run seed
   ```
   This reads `SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD` / `SUPERADMIN_MOBILE`
   from `.env` and creates the account. Change the password after first login.

6. **Run the app**
   ```
   npm start
   ```
   or, for auto-reload during development:
   ```
   npm run dev
   ```
   Visit http://localhost:5000

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
config/       Supabase (Postgres) connection pool
middleware/   auth guards + multer upload handlers
models/       raw SQL query modules (User, Profile, Interest, Advertisement)
controllers/  route handlers
routes/       Express routers (public, user, admin, superadmin)
views/        EJS templates
public/       CSS, JS, and uploaded files (profiles/ads/jathaka)
migrations/   schema.sql + seed.js
```

## Notes / things to revisit

- Passwords are hashed with **bcrypt** before storage.
- Uploaded profile photos, jathaka PDFs, and ad images are stored on disk under
  `public/uploads/`, by design — only the SQL database moved to Supabase.
  If you deploy to a platform with an ephemeral filesystem (e.g. most
  serverless hosts), these files won't persist across deploys/restarts, so
  deploy this on a host with a persistent disk (a VM, Railway/Render with a
  volume, etc.), or revisit this decision later.
- The `/portal/...` routes are unlisted, not authenticated by obscurity alone —
  real role-based session middleware (`middleware/auth.js`) guards every route.
- The contact form on the home page currently just shows a confirmation flash
  message; wire it up to email/CRM as needed.

## Recent update: mobile layout, sidebar portals, more ad slots, YouTube-style search, saved/interested tabs

If you're upgrading an existing database (already ran the original `schema.sql`),
run the additive migration first so no data is lost:

```
psql "$DATABASE_URL" -f migrations/002_upgrade_features.sql
```

(Brand-new installs just run the updated `migrations/schema.sql` as before.)

What changed:

1. **Mobile-friendly.** The public nav, admin/super admin portals, search bar,
   and profile grids all collapse to single/two-column layouts with a
   hamburger menu below ~900px, down to small phones (~400px).

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
