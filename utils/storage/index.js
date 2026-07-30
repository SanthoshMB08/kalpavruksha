// Pluggable file-storage layer. Every driver exposes the exact same
// interface: { BUCKETS, uploadFile(bucketKey, file), getPublicUrl(bucketKey,
// filename), deleteFile(bucketKey, filename) } — so switching providers is a
// one-line env var change with no code changes anywhere else in the app.
//
// STORAGE_PROVIDER=supabase   (default) — Supabase Storage buckets
// STORAGE_PROVIDER=s3         — any S3-compatible provider: AWS S3, Cloudflare
//                               R2, Backblaze B2, DigitalOcean Spaces, Wasabi,
//                               self-hosted MinIO, etc. (see s3Driver.js for
//                               its env vars)
// STORAGE_PROVIDER=local      — save to this server's own disk under
//                               public/uploads/ (no cloud account needed;
//                               see localDriver.js for caveats)
//
// Each driver file only requires its own SDK/config when it's actually the
// active provider, so e.g. you don't need AWS credentials set just because
// the s3Driver.js file exists in the repo.

const provider = (process.env.STORAGE_PROVIDER || 'supabase').toLowerCase();

let driver;
switch (provider) {
  case 's3':
    driver = require('./s3Driver');
    break;
  case 'local':
    driver = require('./localDriver');
    break;
  case 'supabase':
    driver = require('./supabaseDriver');
    break;
  default:
    console.warn(`Unknown STORAGE_PROVIDER "${provider}" — falling back to "supabase".`);
    driver = require('./supabaseDriver');
}

module.exports = driver;
