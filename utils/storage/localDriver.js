const fs = require('fs');
const path = require('path');

// Saves straight to public/uploads/<bucket>/<filename> on the server's own
// disk and serves it back via the app's existing express.static("public")
// middleware — no cloud storage account needed at all. Good for local
// development, or a fully self-hosted deployment with no cloud dependency.
//
// Caveat: on most hosting platforms (Render, Railway, Heroku, etc.) the
// filesystem is EPHEMERAL — anything written here is lost on redeploy/restart
// unless the host gives you a persistent volume. Fine for a VPS with real
// disk, not fine for typical PaaS free/hobby tiers.

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'public', 'uploads');

const BUCKETS = {
  profiles: 'profiles',
  jathaka: 'jathaka',
  biodata: 'biodata',
  ads: 'ads'
};

function makeFilename(originalname) {
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `${unique}${path.extname(originalname)}`;
}

async function uploadFile(bucketKey, file) {
  const folder = BUCKETS[bucketKey];
  if (!folder) throw new Error(`Unknown upload bucket: ${bucketKey}`);
  const filename = makeFilename(file.originalname);
  const dir = path.join(UPLOAD_ROOT, folder);

  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, filename), file.buffer);

  return filename;
}

function getPublicUrl(bucketKey, filename) {
  if (!filename) return null;
  const folder = BUCKETS[bucketKey];
  return `/uploads/${folder}/${filename}`;
}

async function deleteFile(bucketKey, filename) {
  if (!filename) return;
  const folder = BUCKETS[bucketKey];
  try {
    await fs.promises.unlink(path.join(UPLOAD_ROOT, folder, filename));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`Local delete failed (${folder}/${filename}):`, err.message);
  }
}

// Uploads with an EXACT, caller-given filename (no random name generated) —
// used by scripts/migrate-storage.js so a file keeps the same filename across
// providers and no DB rows need updating.
async function uploadBuffer(bucketKey, filename, buffer) {
  const folder = BUCKETS[bucketKey];
  if (!folder) throw new Error(`Unknown upload bucket: ${bucketKey}`);
  const dir = path.join(UPLOAD_ROOT, folder);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, filename), buffer);
  return filename;
}

module.exports = { BUCKETS, uploadFile, uploadBuffer, getPublicUrl, deleteFile };
