const { randomUUID } = require('crypto');
const path = require('path');
const { Readable } = require('stream');
const { Client } = require('basic-ftp');
const logger = require('../logger');

const BUCKETS = Object.freeze({
  profiles: 'profiles',
  ads: 'advertisements',
  'success-stories': 'success-stories'
});
const MIME_EXTENSIONS = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
});
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FTP_TIMEOUT_MS = 30000;

function configuration() {
  const host = (process.env.HOSTINGER_FTP_HOST || '').trim();
  const user = process.env.HOSTINGER_FTP_USER;
  const password = process.env.HOSTINGER_FTP_PASSWORD;
  const port = Number(process.env.HOSTINGER_FTP_PORT || 21);
  const publicUrl = (process.env.HOSTINGER_FTP_PUBLIC_URL || '').trim();
  const ftpRoot = (process.env.HOSTINGER_FTP_ROOT || '.').trim();
  const secure = String(process.env.HOSTINGER_FTP_SECURE || 'true').toLowerCase();

  if (!host || /[/:\\\s]/.test(host) || !user || !password ||
      !Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error('Set valid HOSTINGER_FTP_HOST, HOSTINGER_FTP_PORT, HOSTINGER_FTP_USER, and HOSTINGER_FTP_PASSWORD values.');
    error.code = 'HOSTINGER_FTP_CONFIG';
    throw error;
  }
  if (!['true', '1'].includes(secure)) {
    const error = new Error('Hostinger storage requires FTPS. HOSTINGER_FTP_SECURE cannot be disabled.');
    error.code = 'HOSTINGER_FTP_CONFIG';
    throw error;
  }
  if (!ftpRoot || (ftpRoot !== '.' && (ftpRoot.startsWith('/') || ftpRoot.startsWith('\\') ||
      ftpRoot.split(/[\\/]+/).some(part => part === '..' || part === '.')))) {
    const error = new Error('HOSTINGER_FTP_ROOT must be a relative directory without traversal segments.');
    error.code = 'HOSTINGER_FTP_CONFIG';
    throw error;
  }

  let base;
  try {
    base = new URL(publicUrl);
  } catch {
    const error = new Error('Set HOSTINGER_FTP_PUBLIC_URL to your public HTTPS website URL.');
    error.code = 'HOSTINGER_FTP_CONFIG';
    throw error;
  }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    const error = new Error('HOSTINGER_FTP_PUBLIC_URL must be an HTTPS URL without credentials, query, or fragment.');
    error.code = 'HOSTINGER_FTP_CONFIG';
    throw error;
  }

  return { host, user, password, port, ftpRoot, publicBase: publicUrl.replace(/\/+$/, '') };
}

function folderFor(bucketKey) {
  const folder = BUCKETS[bucketKey];
  if (!folder) {
    const error = new Error(`Hostinger FTP does not accept uploads for "${bucketKey}". Private documents must use the private storage provider.`);
    error.code = 'HOSTINGER_FTP_BUCKET';
    throw error;
  }
  return folder;
}

function validateFilename(filename) {
  if (typeof filename !== 'string' || !filename || filename === '.' || filename === '..' || /[\\/]/.test(filename)) {
    throw new Error('Invalid upload filename.');
  }
  return filename;
}

function hasValidImageSignature(file) {
  if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0 || file.buffer.length > MAX_IMAGE_BYTES) return false;
  if (file.mimetype === 'image/jpeg') {
    return file.buffer.length >= 3 && file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
  }
  if (file.mimetype === 'image/png') {
    return file.buffer.length >= 8 && file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (file.mimetype === 'image/webp') {
    return file.buffer.length >= 12 && file.buffer.toString('ascii', 0, 4) === 'RIFF' &&
      file.buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

async function withClient(bucketKey, work) {
  const config = configuration();
  const folder = folderFor(bucketKey);
  const root = config.ftpRoot === '.' ? '' : config.ftpRoot.replace(/[\\/]+$/, '');
  const remoteDirectory = [root, 'uploads', folder].filter(Boolean).join('/');
  const client = new Client(FTP_TIMEOUT_MS);
  client.ftp.verbose = false;
  client.ftp.timeout = FTP_TIMEOUT_MS;

  try {
    await client.access({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      secure: true,
      secureOptions: { rejectUnauthorized: true, minVersion: 'TLSv1.2' }
    });
    await client.ensureDir(remoteDirectory);
    return await work(client, config, remoteDirectory);
  } catch (err) {
    logger.error({ err, bucketKey, remoteDirectory }, 'Hostinger FTPS storage operation failed');
    const error = new Error('Hostinger FTPS operation failed. Verify the FTPS connection and public_html upload permissions.');
    error.code = 'HOSTINGER_FTPS_ERROR';
    throw error;
  } finally {
    client.close();
  }
}

async function uploadBuffer(bucketKey, filename, buffer, contentType, cleanPartialOnFailure = false) {
  folderFor(bucketKey);
  validateFilename(filename);
  const file = { buffer, mimetype: contentType };
  if (!MIME_EXTENSIONS[contentType] || path.extname(filename).toLowerCase() !== MIME_EXTENSIONS[contentType] ||
      !hasValidImageSignature(file)) {
    const error = new Error('Hostinger public folders accept valid JPG, PNG, or WEBP images up to 5 MB only.');
    error.code = 'INVALID_FILE_TYPE';
    throw error;
  }
  return withClient(bucketKey, async client => {
    try {
      await client.uploadFrom(Readable.from([buffer]), filename);
    } catch (error) {
      if (cleanPartialOnFailure) await client.remove(filename, true).catch(() => {});
      throw error;
    }
    return filename;
  });
}

async function uploadFiles(bucketKey, files) {
  folderFor(bucketKey);
  if (!Array.isArray(files) || files.length === 0 || files.some(file =>
    !file || !MIME_EXTENSIONS[file.mimetype] || !hasValidImageSignature(file))) {
    const error = new Error('Hostinger public folders accept valid JPG, PNG, or WEBP images up to 5 MB only.');
    error.code = 'INVALID_FILE_TYPE';
    throw error;
  }
  const uploads = files.map(file => ({
    filename: `${randomUUID()}${MIME_EXTENSIONS[file.mimetype]}`,
    buffer: file.buffer
  }));
  return withClient(bucketKey, async client => {
    const completed = [];
    let activeFilename;
    try {
      for (const upload of uploads) {
        activeFilename = upload.filename;
        await client.uploadFrom(Readable.from([upload.buffer]), upload.filename);
        completed.push(upload.filename);
      }
      return uploads.map(upload => upload.filename);
    } catch (error) {
      await Promise.all([...completed, activeFilename].filter(Boolean)
        .map(filename => client.remove(filename, true).catch(() => {})));
      throw error;
    }
  });
}

async function uploadFile(bucketKey, file) {
  return (await uploadFiles(bucketKey, [file]))[0];
}

function getPublicUrl(bucketKey, filename) {
  const folder = folderFor(bucketKey);
  if (!filename) return null;
  if (typeof filename === 'string' && /^https:\/\//i.test(filename)) return filename;
  validateFilename(filename);
  const { publicBase } = configuration();
  return `${publicBase}/uploads/${folder}/${encodeURIComponent(filename)}`;
}

async function deleteFile(bucketKey, filename) {
  if (!filename) return;
  validateFilename(filename);
  return withClient(bucketKey, async client => {
    await client.remove(filename);
  });
}

module.exports = { BUCKETS, uploadFile, uploadFiles, uploadBuffer, getPublicUrl, deleteFile };
