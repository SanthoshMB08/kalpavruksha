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
//   MIGRATE_FROM=local MIGRATE_TO=s3 node scripts/migrate-storage.js
//
// MIGRATE_FROM / MIGRATE_TO: s3 | local | hostinger-ftp
//
// Set the S3 environment variables for the S3 side. See README.md for details.
//
// Safe to re-run: re-uploading an already-migrated file just overwrites it
// with the same bytes.

require('dotenv').config();
const { query } = require('../config/db');
const mime = require('mime-types');
const fs = require('fs/promises');
const path = require('path');

const FROM = (process.env.MIGRATE_FROM || '').toLowerCase();
const TO = (process.env.MIGRATE_TO || '').toLowerCase();
const VALID = ['s3', 'local', 'hostinger-ftp'];
const PRIVATE_BUCKETS = new Set(['biodata', 'jathaka']);

function loadDriver(name, bucketKey) {
  if (name === 'hostinger-ftp' && PRIVATE_BUCKETS.has(bucketKey)) {
    name = (process.env.PRIVATE_STORAGE_PROVIDER || 'local').toLowerCase();
  }
  if (name === 'hostinger-ftp') return require('../utils/storage/hostingerFtpDriver');
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

  const [ads] = await query(`SELECT image_name, mobile_image_name FROM advertisements`);
  for (const a of ads) {
    if (a.image_name) files.push({ bucketKey: 'ads', filename: a.image_name });
    if (a.mobile_image_name) files.push({bucketKey:'ads',filename:a.mobile_image_name});
  }

  return files;
}

async function main() {
  if (!VALID.includes(FROM) || !VALID.includes(TO)) {
    console.error(`Set MIGRATE_FROM and MIGRATE_TO to one of: ${VALID.join(', ')}`);
    console.error('Example: MIGRATE_FROM=local MIGRATE_TO=hostinger-ftp node scripts/migrate-storage.js');
    process.exit(1);
  }
  if (FROM === TO) {
    console.error('MIGRATE_FROM and MIGRATE_TO are the same — nothing to do.');
    process.exit(1);
  }

  const files = await collectReferencedFiles();
  const transferable = TO === 'hostinger-ftp'
    ? files.filter(file => !PRIVATE_BUCKETS.has(file.bucketKey))
    : files;
  const skippedPrivate = files.length - transferable.length;
  console.log(`Found ${transferable.length} transferable file(s) referenced in the database.`);
  if (skippedPrivate) console.log(`Keeping ${skippedPrivate} private biodata/jathaka document(s) on the private storage provider.`);
  console.log('');

  let ok = 0;
  let failed = 0;

  for (const { bucketKey, filename } of transferable) {
    const label = `${bucketKey}/${filename}`;
    try {
      const sourceProvider = FROM === 'hostinger-ftp' && PRIVATE_BUCKETS.has(bucketKey)
        ? (process.env.PRIVATE_STORAGE_PROVIDER || 'local').toLowerCase()
        : FROM;
      const fromDriver = loadDriver(FROM, bucketKey);
      const toDriver = loadDriver(TO, bucketKey);
      const url = fromDriver.getPublicUrl(bucketKey, filename);
      let buffer;
      if(sourceProvider === 'local'){
        const root=path.resolve(__dirname,'../public/uploads');
        const source=path.resolve(root,fromDriver.BUCKETS[bucketKey],filename);
        if(!source.startsWith(root+path.sep))throw new Error('Invalid upload path');
        buffer=await fs.readFile(source);
      }else{
        const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
        if(!response.ok)throw new Error('Source download failed: '+response.status);
        buffer=Buffer.from(await response.arrayBuffer());
      }
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
