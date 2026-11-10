// Pluggable file-storage layer. Drivers expose upload, URL, retrieval, and
// delete operations; profile images use private delivery, while ad images stay
// public across providers.
//
// STORAGE_PROVIDER=s3         — any S3-compatible provider: AWS S3, Cloudflare
//                               R2, Backblaze B2, DigitalOcean Spaces, Wasabi,
//                               self-hosted MinIO, etc. (see s3Driver.js for
//                               its env vars)
// STORAGE_PROVIDER=local     — save to this server's own disk under
//                              public/uploads/ (see localDriver.js for caveats)
// STORAGE_PROVIDER=hostinger-ftp — send images to Hostinger over FTPS.
//                                  Profile delivery is authenticated; PDFs use
//                                  PRIVATE_STORAGE_PROVIDER.
//
// Each driver file only requires its own SDK/config when it's actually the
// active provider, so e.g. you don't need AWS credentials set just because
// the s3Driver.js file exists in the repo.

const provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
const privateBuckets = new Set(['biodata', 'jathaka']);

function withPrivateStorage(publicDriver) {
  const privateDriver = require('./privateLocalDriver');
  const selectDriver = bucketKey => privateBuckets.has(bucketKey) ? privateDriver : publicDriver;
  return {
    BUCKETS: { ...publicDriver.BUCKETS, ...privateDriver.BUCKETS },
    uploadFile: (bucketKey, file) => selectDriver(bucketKey).uploadFile(bucketKey, file),
    uploadFiles: (bucketKey, files) => {
      const selected = selectDriver(bucketKey);
      if (typeof selected.uploadFiles === 'function') return selected.uploadFiles(bucketKey, files);
      return (async () => {
        const filenames = [];
        try {
          for (const file of files) filenames.push(await selected.uploadFile(bucketKey, file));
          return filenames;
        } catch (error) {
          await Promise.allSettled(filenames.map(filename => selected.deleteFile(bucketKey, filename)));
          throw error;
        }
      })();
    },
    uploadBuffer: (bucketKey, filename, buffer, contentType) =>
      selectDriver(bucketKey).uploadBuffer(bucketKey, filename, buffer, contentType),
    getPublicUrl: (bucketKey, filename) => {
      if (!privateBuckets.has(bucketKey) && bucketKey !== 'profiles' &&
          typeof filename === 'string' && /^https:\/\//i.test(filename)) return filename;
      return selectDriver(bucketKey).getPublicUrl(bucketKey, filename);
    },
    getFile: (bucketKey, filename) => {
      if (typeof publicDriver.getFile === 'function' && bucketKey === 'profiles') {
        return publicDriver.getFile(bucketKey, filename);
      }
      return privateDriver.getFile(bucketKey, filename);
    },
    protectProfileFiles: () => typeof publicDriver.protectProfileFiles === 'function'
      ? publicDriver.protectProfileFiles()
      : Promise.resolve(),
    getFilePath: (bucketKey, filename) => {
      if (typeof privateDriver.getFilePath !== 'function') throw new Error('Private file serving is not supported by this storage provider.');
      return privateDriver.getFilePath(bucketKey, filename);
    },
    deleteFile: (bucketKey, filename) => selectDriver(bucketKey).deleteFile(bucketKey, filename)
  };
}

let driver;
switch (provider) {
  case 's3':
    driver = require('./s3Driver');
    break;
  case 'local':
    driver = withPrivateStorage(require('./localDriver'));
    break;
  case 'hostinger-ftp': {
    const publicDriver = require('./hostingerFtpDriver');
    const privateProvider = (process.env.PRIVATE_STORAGE_PROVIDER || 'local').toLowerCase();
    if (privateProvider !== 'local') {
      throw new Error('Hostinger public FTP cannot store private PDFs. PRIVATE_STORAGE_PROVIDER must be "local" until a private backend is configured.');
    }
    driver = withPrivateStorage(publicDriver);
    break;
  }
  default:
    throw new Error(`Unknown STORAGE_PROVIDER "${provider}" — expected "local", "s3", or "hostinger-ftp".`);
}

module.exports = {
  ...driver,
  getPublicUrl: (bucketKey, filename) => {
    if (!privateBuckets.has(bucketKey) && bucketKey !== 'profiles' &&
        typeof filename === 'string' && /^https:\/\//i.test(filename)) return filename;
    return driver.getPublicUrl(bucketKey, filename);
  },
  getFile: (bucketKey, filename) => {
    if (typeof driver.getFile !== 'function') {
      throw new Error('Private profile image retrieval is not supported by this storage provider.');
    }
    return driver.getFile(bucketKey, filename);
  },
  protectProfileFiles: () => typeof driver.protectProfileFiles === 'function'
    ? driver.protectProfileFiles()
    : Promise.resolve(),
  getPrivateFilePath: (bucketKey, filename) => {
    if (!privateBuckets.has(bucketKey) || typeof driver.getFilePath !== 'function') {
      throw new Error('Private file serving is not supported for this bucket.');
    }
    return driver.getFilePath(bucketKey, filename);
  }
};
