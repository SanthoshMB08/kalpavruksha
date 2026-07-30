const path = require('path');
const supabase = require('../../config/supabase');

// Bucket names match the old local folder names exactly:
// public/uploads/profiles -> "profiles"
// public/uploads/jathaka  -> "jathaka"
// public/uploads/biodata  -> "biodata"
// public/uploads/ads      -> "ads"
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

// Uploads a single in-memory file (from multer memoryStorage) to the given
// bucket. Returns just the filename (not the full URL) so it can be stored
// in the DB exactly like the old multer-disk `file.filename` was.
async function uploadFile(bucketKey, file) {
  const bucket = BUCKETS[bucketKey];
  if (!bucket) throw new Error(`Unknown upload bucket: ${bucketKey}`);
  const filename = makeFilename(file.originalname);

  const { error } = await supabase.storage.from(bucket).upload(filename, file.buffer, {
    contentType: file.mimetype,
    upsert: false
  });
  if (error) throw new Error(`Supabase upload failed (${bucket}/${filename}): ${error.message}`);

  return filename;
}

function getPublicUrl(bucketKey, filename) {
  if (!filename) return null;
  const bucket = BUCKETS[bucketKey];
  const { data } = supabase.storage.from(bucket).getPublicUrl(filename);
  return data.publicUrl;
}

async function deleteFile(bucketKey, filename) {
  if (!filename) return;
  const bucket = BUCKETS[bucketKey];
  const { error } = await supabase.storage.from(bucket).remove([filename]);
  if (error) console.error(`Supabase delete failed (${bucket}/${filename}):`, error.message);
}

// Uploads with an EXACT, caller-given filename (no random name generated) —
// used by scripts/migrate-storage.js so a file keeps the same filename across
// providers and no DB rows need updating.
async function uploadBuffer(bucketKey, filename, buffer, contentType) {
  const bucket = BUCKETS[bucketKey];
  if (!bucket) throw new Error(`Unknown upload bucket: ${bucketKey}`);
  const { error } = await supabase.storage.from(bucket).upload(filename, buffer, {
    contentType: contentType || 'application/octet-stream',
    upsert: true
  });
  if (error) throw new Error(`Supabase upload failed (${bucket}/${filename}): ${error.message}`);
  return filename;
}

module.exports = { BUCKETS, uploadFile, uploadBuffer, getPublicUrl, deleteFile };
