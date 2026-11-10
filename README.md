# Kalpavruksha Kalyana

A server-rendered matrimony application using Node.js 22+, Express, EJS and MySQL/MariaDB. Member, admin and superadmin workflows, approvals, detailed profiles, independent Saved/Interested lists, sharing, documents, success stories, contact messages and trash/restore are retained.

## Hostinger setup

Use a Hostinger plan that supports Node.js applications. Web/Cloud databases may run MariaDB even when the control panel calls them MySQL. This schema targets MySQL 8.0.16+ and MariaDB 10.6+.

1. Create a **new, empty database** and database user in Hostinger.
2. Select that database in phpMyAdmin and import [migrations/schema.sql](migrations/schema.sql). It includes application tables, indexes, constraints, sessions and advertisement slots. It does not require permission to create a database.
3. Configure your application's environment using `.env.example`. Replace the previous PostgreSQL `DATABASE_URL` with your MySQL URL, or remove it and use `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
4. Use `DB_HOST=127.0.0.1` for Hostinger's local database endpoint when specified by your plan. Use TLS with certificate verification for remote production connections.
5. Set `NODE_ENV=production`, a random `SESSION_SECRET` of at least 32 bytes, and `TRUST_PROXY=1` when requests reach Express through exactly one trusted hosting proxy. If Hostinger uses a different proxy chain, set the verified hop count they provide; do not use `true`.
6. Deploy with `npm ci --omit=dev`; startup command: `npm start`. The platform supplies `PORT`.
7. For a fresh installation, set a strong `SUPERADMIN_PASSWORD` and run `npm run seed`. Do not seed before importing existing records.
8. Check `/health`, all three login flows, file access and an advertisement on mobile/desktop.

### Login says the session or form token is invalid

Open the app using its HTTPS temporary-domain URL, then reload the login page before submitting. If the error persists, confirm `NODE_ENV=production`, `SESSION_SECRET` is a stable random value (do not regenerate it on each start), and `TRUST_PROXY=1` matches Hostinger's proxy chain. Express needs to recognize the original HTTPS request to issue its secure session cookie. Do not set `TRUST_PROXY=true`; use only the verified hop count for the hosting proxy. After changing environment values, restart the Node.js app and clear cookies for the temporary domain before trying again. CSRF rejection logs include only booleans indicating whether the request, session, and cookies were present; they do not log cookie/token contents.

Example connection string: `mysql://USER:URL_ENCODED_PASSWORD@127.0.0.1:3306/DATABASE`. Percent-encode reserved characters in URL credentials; separate DB variables avoid that requirement. Never commit real environment files.

Uploads use local disk by default (`STORAGE_PROVIDER=local`); optionally use an S3-compatible provider with `STORAGE_PROVIDER=s3` and the S3 settings in `.env.example`. Local storage requires a persistent upload directory across deployments. Use `npm run migrate-storage` to copy referenced files between local, S3, and Hostinger FTP storage before switching providers; both source and destination must remain available until the copy is verified.

### Cloud Startup capacity and safeguards

The current app is a reasonable starting point for about 1,000 registered accounts and 10,000 profile rows, but those counts do not guarantee support for 1,000 simultaneous visitors. Hostinger resource limits, database connection limits, image traffic, and request mix determine concurrency; verify the exact Cloud Startup quotas in hPanel and load-test a staging copy before advertising a concurrency target. Keep the MySQL pool at its conservative default of 10 unless Hostinger confirms a higher database connection allowance.

The member dashboard caches distinct profile-filter values for 60 seconds and coalesces simultaneous refreshes; profile writes invalidate that cache. Multipart image/PDF uploads are admitted two at a time per Node.js process to bound memory and image-processing pressure; excess upload requests receive HTTP 503 with `Retry-After`. This upload limit is process-local, not shared between multiple app instances. Keep a single app instance while private documents use local disk; multiple instances require a shared, private persistent document store first. Set and back up `PRIVATE_STORAGE_DIR` outside the public web root, retain database/file backups, monitor memory and 5xx/503 responses, and rehearse restoring both database records and private documents.

Profile lists are paginated (up to 100 rows per page); page numbers are capped to prevent unbounded SQL offsets. Search text filters remain substring matches and can still scan rows, so measure query latency and MySQL CPU as the profile table grows. The `/health` endpoint checks the database, not remote FTPS reachability or whether private-file backups are current.

Deleted profiles and deactivated advertisements have a 24-hour recovery window. Restore/reactivate them within that window; afterward the cleanup worker permanently removes the record and its stored files. The worker runs at startup and every 15 minutes while the Node.js server is running. It uses a MySQL advisory lock so multiple app instances do not process the same cleanup batch concurrently. Ensure the Hostinger app stays running; if it is stopped during a due cleanup, processing resumes at the next startup.

### Hostinger FTP image storage

For local development with uploads sent directly to Hostinger, set `PORT=3000` and `STORAGE_PROVIDER=hostinger-ftp` in your local `.env`, then fill in `HOSTINGER_FTP_HOST`, `HOSTINGER_FTP_PORT`, `HOSTINGER_FTP_USER`, `HOSTINGER_FTP_PASSWORD`, and `HOSTINGER_FTP_PUBLIC_URL` using the FTP account details and website HTTPS origin from Hostinger hPanel. Keep these values backend-only; never add them to browser code. The provider requires verified explicit FTPS and does not retry using plaintext FTP.

The provided FTP account is rooted at `public_html`, so `HOSTINGER_FTP_ROOT=.` stores profile photos under `uploads/profiles` and ad creatives under `uploads/advertisements` without creating a duplicate `public_html` directory. The provider also supports `success-stories` for a future image upload route; the current app has no story-image upload field. The frontend image URL is built from `HOSTINGER_FTP_PUBLIC_URL` and the generated upload path. Biodata and jathaka PDFs are never sent to Hostinger's public FTP folders; they remain on the backend's private filesystem under `PRIVATE_STORAGE_DIR` (defaults to `private-uploads/`, outside `public/`) and are served only through the admin-protected route. This private path is not a remote Hostinger backup. Persistent private storage must be configured and verified separately before deploying or switching providers. See [HOSTINGER_STORAGE.md](HOSTINGER_STORAGE.md) for setup and manual tests.

Before switching `STORAGE_PROVIDER`, copy existing public files from the current backend, for example `MIGRATE_FROM=local MIGRATE_TO=hostinger-ftp node scripts/migrate-storage.js` (use `MIGRATE_FROM=s3` if that's where the current images live). The command preserves filenames, skips biodata/jathaka PDFs, and requires the app's MySQL and Hostinger FTPS settings to be available in the local environment.

## Migrate existing PostgreSQL records

The application runtime no longer uses PostgreSQL. The development-only `pg` dependency supports a one-time, read-only source export.

- Back up PostgreSQL and storage. Rehearse using a separate target database.
- Install development dependencies on the migration machine with `npm ci`.
- Set `SOURCE_DATABASE_URL` to PostgreSQL. Remote source TLS is verified; use `SOURCE_DB_SSL_CA_PATH` for a private CA.
- Run `npm run db:export -- .local/postgres-export.json`. The destination file must not already exist. The export uses a consistent read-only transaction and includes checksums.
- Import the MySQL schema into the empty target and set `DATABASE_URL` to that target.
- Run `npm run db:import -- .local/postgres-export.json`. It refuses nonempty application tables and imports in a transaction, preserving IDs, password hashes, Unicode, soft deletion and independent Saved/Interested flags. It does not rerun legacy backfills.
- Check counts, representative field values, account roles, matching, documents and all file references. Active phone/username conflicts must be resolved deliberately if the import reports them.
- Schedule a write freeze for the final export/import and application switch. Users sign in again because PostgreSQL sessions are not transferred.
- Keep the source backup. Rollback after accepting new MySQL writes requires reconciling those writes before switching back.

Exports contain sensitive records and password hashes. Keep them outside version control and remove the transfer copy after backup/cutover requirements are satisfied. The ignored `.local` folder is suitable for local rehearsals.

## Advertisements

The superadmin ad manager displays exact recommended frame sizes and live previews:

| Placement | Desktop artwork | Mobile artwork |
|---|---|---|
| Top banner | 1440 × 180 px | 720 × 240 px |
| Home ads corner | 600 × 500 px | 720 × 600 px |
| Home middle | 1200 × 300 px | 720 × 360 px |
| Home bottom | 1200 × 300 px | 720 × 360 px |
| After search results | 1200 × 300 px | 720 × 360 px |

Upload JPG, PNG or WEBP, at most 5 MB per image. A mobile image is optional; otherwise the desktop artwork is fitted into the mobile frame without cropping. Images are optimized to WEBP on upload. Keep text inside the frame edges.

Expiry inputs and displayed dates use India time (Asia/Kolkata); the database stores UTC. Expired ads are excluded by the selection query, so correctness does not depend on a timer. Slot changes use transactions and stable placement locks. An invalid replacement leaves the existing advertisement active.

Schedule `npm run cleanup-uploads` hourly using the hosting plan's scheduler, from the project directory. This retries removal of unreferenced uploads; files still referenced by profiles or inactive advertisements are retained.

## Languages and interface

English and Kannada apply across public/member/staff views, forms, dialogs, validation and legal pages. Locale preference is stored for signed-in accounts and in a cookie for visitors, with browser-language fallback. Catalogs are local: no translation API charges or page-render translation calls.

Edit `utils/locales/kn.json` for interface text. The existing semantic keys remain in `utils/i18n.js`. Canonical database values stay unchanged; their display labels are localized. Member names and authored free-text content are preserved. Kannada fonts are bundled under the SIL Open Font License in `public/fonts`.

Shared responsive components live in `public/css/experience.css` and `public/js/dashboard.js`. Members and staff have mobile bottom navigation; profile details retain browsing position, and Saved/Interested actions update without reloading. Server forms remain the fallback.

## Validation

```text
npm run lint
npm audit --omit=dev
```

Run `npm run db:init` to import the fresh schema through Node when phpMyAdmin is unavailable. Before launch, manually verify `/health`, sign-in, profile search, uploads, private document access, and mobile layouts on a staging deployment.
