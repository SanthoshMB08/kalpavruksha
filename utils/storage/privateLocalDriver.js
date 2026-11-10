const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

const BUCKETS = Object.freeze({ biodata: 'biodata', jathaka: 'jathaka' });
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const PRIVATE_ROOT = path.resolve(process.env.PRIVATE_STORAGE_DIR || path.join(__dirname, '..', '..', 'private-uploads'));
const PUBLIC_ROOT = path.resolve(__dirname, '..', '..', 'public');
const PUBLIC_RELATIVE_PATH = path.relative(PUBLIC_ROOT, PRIVATE_ROOT);

if (PUBLIC_RELATIVE_PATH === '' || (PUBLIC_RELATIVE_PATH !== '..' &&
    !PUBLIC_RELATIVE_PATH.startsWith('..' + path.sep) && !path.isAbsolute(PUBLIC_RELATIVE_PATH))) {
  throw new Error('PRIVATE_STORAGE_DIR must be outside the public directory.');
}

function folderFor(bucketKey) {
  const folder = BUCKETS[bucketKey];
  if (!folder) throw new Error(`Unknown private storage bucket: ${bucketKey}`);
  return folder;
}

function validateFilename(filename) {
  if (typeof filename !== 'string' || !/^[a-f0-9-]+\.pdf$/i.test(filename)) {
    const error = new Error('Invalid private document filename.');
    error.code = 'INVALID_FILE_TYPE';
    throw error;
  }
  return filename;
}

function validatePdf(file) {
  if (!file || file.mimetype !== 'application/pdf' || !Buffer.isBuffer(file.buffer) ||
      file.buffer.length < 8 || file.buffer.length > MAX_PDF_BYTES ||
      !/^%PDF-[12]\.\d/.test(file.buffer.toString('ascii', 0, 8))) {
    const error = new Error('Private documents must be valid PDF files no larger than 15 MB.');
    error.code = 'INVALID_FILE_TYPE';
    throw error;
  }
}

async function uploadBuffer(bucketKey, filename, buffer, contentType = 'application/pdf') {
  folderFor(bucketKey);
  validateFilename(filename);
  const file = { buffer, mimetype: contentType };
  validatePdf(file);
  const directory = path.join(PRIVATE_ROOT, bucketKey);
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.promises.writeFile(path.join(directory, filename), buffer, { flag: 'wx', mode: 0o600 });
  return filename;
}

async function uploadFile(bucketKey, file) {
  folderFor(bucketKey);
  validatePdf(file);
  const filename = `${randomUUID()}.pdf`;
  return uploadBuffer(bucketKey, filename, file.buffer, file.mimetype);
}

function getPublicUrl(bucketKey, filename) {
  folderFor(bucketKey);
  if (!filename) return null;
  validateFilename(filename);
  return `/portal/admin-dashboard/private-files/${bucketKey}/${encodeURIComponent(filename)}`;
}

function getFilePath(bucketKey, filename) {
  folderFor(bucketKey);
  validateFilename(filename);
  const filePath = path.resolve(PRIVATE_ROOT, bucketKey, filename);
  if (!filePath.startsWith(PRIVATE_ROOT + path.sep)) throw new Error('Invalid private document path.');
  return filePath;
}

async function deleteFile(bucketKey, filename) {
  const filePath = getFilePath(bucketKey, filename);
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

module.exports = { BUCKETS, PRIVATE_ROOT, uploadFile, uploadBuffer, getPublicUrl, getFilePath, deleteFile };
