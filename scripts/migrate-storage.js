// Copies every file the database currently references (profile photos,
// jathaka PDFs, biodata PDFs, ad images) from one storage provider to
// another, preserving filenames exactly — so no DB rows need updating
// afterwards. Once this finishes, just change STORAGE_PROVIDER in .env to
// the new provider and restart the app.
//
// This walks the DATABASE for the list of files to move (not the old
// provider's bucket listing), since the DB is the source of truth for which
// files are actually in use.
//
// Usage:
//   MIGRATE_FROM=supabase MIGRATE_TO=s3 node scripts/migrate-storage.js
//
// MIGRATE_FROM / MIGRATE_TO: supabase | s3 | local
//
// Set the env vars for BOTH providers before running (e.g. SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY for the "from" side, S3_BUCKET/S3_ACCESS_KEY_ID/
// etc. for the "to" side) — see README.md for the full list per provider.
//
// Safe to re-run: re-uploading an already-migrated file just overwrites it
// with the same bytes.

require('dotenv').config();
const { query } = require('../config/db');
const mime = require('mime-types');

const FROM = (process.env.MIGRATE_FROM || '').toLowerCase();
const TO = (process.env.MIGRATE_TO || '').toLowerCase();
const VALID = ['supabase', 's3', 'local'];

function loadDriver(name) {
  if (name === 'supabase') return require('../utils/storage/supabaseDriver');
  if (name === 's3') return require('../utils/storage/s3Driver');
  if (name === 'local') return require('../utils/storage/localDriver');
  throw new Error(`Unknown provider "${name}" — must be one of: ${VALID.join(', ')}`);
}

// Every (bucketKey, filename) pair currently referenced by the database.
async function collectReferencedFiles() {
  const files = [];

  const [profiles] = await query(
    `SELECT image_name, image_name_2, jathaka_pdf_name, biodata_pdf_name FROM profiles`
  );
  for (const p of profiles) {
    if (p.image_name) files.push({ bucketKey: 'profiles', filename: p.image_name });
    if (p.image_name_2) files.push({ bucketKey: 'profiles', filename: p.image_name_2 });
    if (p.jathaka_pdf_name) files.push({ bucketKey: 'jathaka', filename: p.jathaka_pdf_name });
    if (p.biodata_pdf_name) files.push({ bucketKey: 'biodata', filename: p.biodata_pdf_name });
  }

  const [ads] = await query(`SELECT image_name FROM advertisements`);
  for (const a of ads) {
    if (a.image_name) files.push({ bucketKey: 'ads', filename: a.image_name });
  }

  return files;
}

async function main() {
  if (!VALID.includes(FROM) || !VALID.includes(TO)) {
    console.error(`Set MIGRATE_FROM and MIGRATE_TO to one of: ${VALID.join(', ')}`);
    console.error('Example: MIGRATE_FROM=supabase MIGRATE_TO=s3 node scripts/migrate-storage.js');
    process.exit(1);
  }
  if (FROM === TO) {
    console.error('MIGRATE_FROM and MIGRATE_TO are the same — nothing to do.');
    process.exit(1);
  }

  const fromDriver = loadDriver(FROM);
  const toDriver = loadDriver(TO);

  const files = await collectReferencedFiles();
  console.log(`Found ${files.length} file(s) referenced in the database.\n`);

  let ok = 0;
  let failed = 0;

  for (const { bucketKey, filename } of files) {
    const label = `${bucketKey}/${filename}`;
    try {
      const url = fromDriver.getPublicUrl(bucketKey, filename);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch failed (${res.status}) from ${FROM}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = mime.lookup(filename) || 'application/octet-stream';

      await toDriver.uploadBuffer(bucketKey, filename, buffer, contentType);
      console.log(`[ok]   ${label}`);
      ok++;
    } catch (err) {
      console.error(`[fail] ${label}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Copied: ${ok}, failed: ${failed}.`);
  if (failed > 0) {
    console.error('Some files failed — check errors above and re-run (safe to re-run).');
    process.exit(1);
  }
  console.log(`\nNext step: set STORAGE_PROVIDER=${TO} in .env and restart the app.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
