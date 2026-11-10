const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

// Saves to public/uploads/<bucket>/<filename> on the server's own disk. Profile
// images are blocked from static access and served through an authenticated
// route; ads remain public. No cloud storage account is required.
//
// Caveat: on most hosting platforms (Render, Railway, Heroku, etc.) the
// filesystem is EPHEMERAL — anything written here is lost on redeploy/restart
// unless the host gives you a persistent volume. Fine for a VPS with real
// disk, not fine for typical PaaS free/hobby tiers.

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'public', 'uploads');
const MAX_PROFILE_IMAGE_BYTES = 10 * 1024 * 1024;

const BUCKETS = {
  profiles: 'profiles',
  jathaka: 'jathaka',
  biodata: 'biodata',
  ads: 'ads'
};

function makeFilename(originalname) {
  const unique = randomUUID();
  return `${unique}${path.extname(originalname).toLowerCase()}`;
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
  if (bucketKey === 'profiles') {
    if (!/^[a-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(filename)) {
      const error = new Error('Invalid profile image filename.');
      error.code = 'INVALID_FILE_TYPE';
      throw error;
    }
    return `/media/profiles/${encodeURIComponent(filename)}`;
  }
  return `/uploads/${folder}/${filename}`;
}

async function deleteFile(bucketKey, filename) {
  if (!filename) return;
  const folder = BUCKETS[bucketKey];
  try {
    await fs.promises.unlink(path.join(UPLOAD_ROOT, folder, filename));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
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

async function getFile(bucketKey, filename) {
  const folder = BUCKETS[bucketKey];
  if (bucketKey !== 'profiles' || !folder || !/^[a-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(filename || '')) {
    const error = new Error('Invalid profile image filename.');
    error.code = 'INVALID_FILE_TYPE';
    throw error;
  }
  const filePath = path.resolve(UPLOAD_ROOT, folder, filename);
  if (!filePath.startsWith(path.resolve(UPLOAD_ROOT, folder) + path.sep)) {
    const error = new Error('Invalid profile image path.');
    error.code = 'INVALID_FILE_TYPE';
    throw error;
  }
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile() || stat.size > MAX_PROFILE_IMAGE_BYTES) {
    const error = new Error('Stored profile image is unavailable.');
    error.code = 'FILE_TOO_LARGE';
    throw error;
  }
  const buffer = await fs.promises.readFile(filePath);
  const extension = path.extname(filename).toLowerCase();
  const contentType = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg';
  return { buffer, contentType };
}

async function protectProfileFiles() {
  const directory = path.join(UPLOAD_ROOT, BUCKETS.profiles);
  await fs.promises.mkdir(directory, { recursive: true });
  await fs.promises.writeFile(path.join(directory, '.htaccess'), [
    '<IfModule mod_authz_core.c>',
    'Require all denied',
    '</IfModule>',
    '<IfModule !mod_authz_core.c>',
    'Order allow,deny',
    'Deny from all',
    '</IfModule>',
    ''
  ].join('\n'), { mode: 0o644 });
}

module.exports = { BUCKETS, uploadFile, uploadBuffer, getPublicUrl, getFile, protectProfileFiles, deleteFile };
