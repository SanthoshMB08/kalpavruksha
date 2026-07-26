// One-time migration: uploads everything currently sitting in
// public/uploads/<folder> to the Supabase Storage bucket of the same name,
// preserving filenames exactly. Because filenames are preserved, existing
// DB rows (which store only the bare filename, e.g. profiles.image_name)
// keep working unchanged — no DB update needed.
//
// Usage:
//   1. In the Supabase dashboard, create four PUBLIC buckets named exactly:
//      profiles, jathaka, biodata, ads
//   2. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
//   3. node scripts/migrate-uploads-to-supabase.js
//
// Safe to re-run: files that already exist in the bucket are skipped.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const supabase = require('../config/supabase');

const UPLOADS_ROOT = path.join(__dirname, '..', 'public', 'uploads');
const FOLDERS = ['profiles', 'jathaka', 'biodata', 'ads']; // folder name === bucket name

async function migrateFolder(folder) {
  const dir = path.join(UPLOADS_ROOT, folder);
  if (!fs.existsSync(dir)) {
    console.log(`[skip] ${folder}: no local folder at ${dir}`);
    return { uploaded: 0, skipped: 0, failed: 0 };
  }

  const files = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile());
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const filename of files) {
    const filePath = path.join(dir, filename);
    const buffer = fs.readFileSync(filePath);
    const contentType = mime.lookup(filename) || 'application/octet-stream';

    const { error } = await supabase.storage.from(folder).upload(filename, buffer, {
      contentType,
      upsert: false
    });

    if (error) {
      if (/already exists/i.test(error.message)) {
        skipped++;
        console.log(`[skip]   ${folder}/${filename} (already in bucket)`);
      } else {
        failed++;
        console.error(`[fail]   ${folder}/${filename}: ${error.message}`);
      }
    } else {
      uploaded++;
      console.log(`[ok]     ${folder}/${filename}`);
    }
  }

  return { uploaded, skipped, failed };
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env before running this.');
    process.exit(1);
  }

  const totals = { uploaded: 0, skipped: 0, failed: 0 };
  for (const folder of FOLDERS) {
    console.log(`\n--- Migrating ${folder} -> bucket "${folder}" ---`);
    const result = await migrateFolder(folder);
    totals.uploaded += result.uploaded;
    totals.skipped += result.skipped;
    totals.failed += result.failed;
  }

  console.log(`\nDone. Uploaded: ${totals.uploaded}, already-existed: ${totals.skipped}, failed: ${totals.failed}`);
  if (totals.failed > 0) {
    console.error('Some files failed to upload — check bucket names/permissions above and re-run (it is safe to re-run).');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
