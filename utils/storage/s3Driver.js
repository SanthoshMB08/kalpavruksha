const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');

// Works with ANY S3-compatible provider — AWS S3, Cloudflare R2, Backblaze B2,
// DigitalOcean Spaces, Wasabi, MinIO (self-hosted), etc. — by pointing
// S3_ENDPOINT at that provider. One bucket, with a folder-per-type prefix
// (profiles/ jathaka/ biodata/ ads/) so you only need to create one bucket
// on the new provider instead of four.
//
// Required env vars:
//   S3_BUCKET              e.g. "kalpavruksha-uploads"
//   S3_REGION              e.g. "us-east-1" (AWS) or "auto" (R2)
//   S3_ACCESS_KEY_ID
//   S3_SECRET_ACCESS_KEY
// Optional env vars:
//   S3_ENDPOINT            custom endpoint URL (leave unset for real AWS S3)
//   S3_FORCE_PATH_STYLE    "true" for MinIO / some providers that need
//                          path-style URLs instead of virtual-hosted-style
//   S3_PUBLIC_URL_BASE     public base URL to build file links from, e.g.
//                          "https://cdn.example.com" or a bucket's public
//                          endpoint URL. If unset, falls back to
//                          "<endpoint or AWS default>/<bucket>"

const BUCKETS = {
  profiles: 'profiles',
  jathaka: 'jathaka',
  biodata: 'biodata',
  ads: 'ads'
};

let client;
function getClient() {
  if (client) return client;
  if (!process.env.S3_BUCKET || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
    console.warn(
      'Warning: S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are not fully set. ' +
      'File uploads will fail until these are set in .env (STORAGE_PROVIDER=s3).'
    );
  }
  client = new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
    }
  });
  return client;
}

function makeFilename(originalname) {
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `${unique}${path.extname(originalname)}`;
}

function objectKey(bucketKey, filename) {
  const folder = BUCKETS[bucketKey];
  if (!folder) throw new Error(`Unknown upload bucket: ${bucketKey}`);
  return `${folder}/${filename}`;
}

async function uploadFile(bucketKey, file) {
  const filename = makeFilename(file.originalname);
  const key = objectKey(bucketKey, filename);

  await getClient().send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype
    // Note: no ACL is set here. Most modern providers (R2, recent S3 buckets
    // with "Object Ownership: Bucket owner enforced") reject ACLs entirely
    // and expect public access to be granted via a bucket policy instead.
    // Set one up once in your provider's console/CLI; see README.md.
  }));

  return filename;
}

function getPublicUrl(bucketKey, filename) {
  if (!filename) return null;
  const folder = BUCKETS[bucketKey];
  const key = `${folder}/${filename}`;

  if (process.env.S3_PUBLIC_URL_BASE) {
    return `${process.env.S3_PUBLIC_URL_BASE.replace(/\/$/, '')}/${key}`;
  }
  if (process.env.S3_ENDPOINT) {
    // Path-style fallback: <endpoint>/<bucket>/<key>
    return `${process.env.S3_ENDPOINT.replace(/\/$/, '')}/${process.env.S3_BUCKET}/${key}`;
  }
  // Real AWS S3 virtual-hosted-style default
  return `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION || 'us-east-1'}.amazonaws.com/${key}`;
}

async function deleteFile(bucketKey, filename) {
  if (!filename) return;
  const key = objectKey(bucketKey, filename);
  try {
    await getClient().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
  } catch (err) {
    console.error(`S3 delete failed (${key}):`, err.message);
  }
}

// Uploads with an EXACT, caller-given filename (no random name generated) —
// used by scripts/migrate-storage.js so a file keeps the same filename across
// providers and no DB rows need updating.
async function uploadBuffer(bucketKey, filename, buffer, contentType) {
  const key = objectKey(bucketKey, filename);
  await getClient().send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream'
  }));
  return filename;
}

module.exports = { BUCKETS, uploadFile, uploadBuffer, getPublicUrl, deleteFile };
