const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const { scheduleCleanup } = require('../utils/storageCleanup');
const { AD_PLACEMENTS } = require('../utils/adPlacements');
const { validationResult } = require('express-validator');
const { uploadFiles, deleteFile } = require('../utils/storage');

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const PDF_MAX_BYTES = 15 * 1024 * 1024;
const MAX_CONCURRENT_UPLOADS = 2;
let activeUploads = 0;
const IMAGE_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const FIELD_TO_BUCKET = { profile_image: 'profiles', profile_image_2: 'profiles', jathaka_pdf: 'jathaka', biodata_pdf: 'biodata', ad_image: 'ads', ad_mobile_image: 'ads' };

function invalidFile() {
  const err = new Error('Only genuine JPG, PNG, WEBP images or PDF documents with matching file extensions are allowed.');
  err.code = 'INVALID_FILE_TYPE';
  return err;
}

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const document = ['jathaka_pdf', 'biodata_pdf'].includes(file.fieldname);
  const expected = document ? ext === '.pdf' && 'application/pdf' : IMAGE_TYPES[ext];
  cb(expected && file.mimetype === expected ? null : invalidFile(), Boolean(expected && file.mimetype === expected));
}

function validateFiles(files) {
  for (const file of files) {
    const bytes = file.buffer;
    const document = ['jathaka_pdf', 'biodata_pdf'].includes(file.fieldname);
    if (bytes.length > (document ? PDF_MAX_BYTES : IMAGE_MAX_BYTES)) {
      const err = new Error('Images must be 5MB or smaller; PDFs must be 15MB or smaller.');
      err.code = 'LIMIT_FILE_SIZE';
      throw err;
    }
    const signatures = {
      'image/jpeg': bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
      'image/png': bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      'image/webp': bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
      'application/pdf': /^%PDF-[12]\.\d/.test(bytes.toString('ascii', 0, 8))
    };
    if (!signatures[file.mimetype]) throw invalidFile();
  }
}

const limits = { fieldNameSize: 100, fieldSize: 16 * 1024, fields: 100 };
const parseProfileAssets = multer({
  storage: multer.memoryStorage(), fileFilter,
  limits: { ...limits, fileSize: PDF_MAX_BYTES, files: 4, parts: 104 }
}).fields([
  { name: 'profile_image', maxCount: 1 }, { name: 'profile_image_2', maxCount: 1 },
  { name: 'jathaka_pdf', maxCount: 1 }, { name: 'biodata_pdf', maxCount: 1 }
]);
const parseAdImage = multer({
  storage: multer.memoryStorage(), fileFilter,
  limits: { ...limits, fileSize: IMAGE_MAX_BYTES, files: 2, parts: 102 }
}).fields([{ name: 'ad_image', maxCount: 1 }, { name: 'ad_mobile_image', maxCount: 1 }]);

function uploadCapacity(req, res, next) {
  if (activeUploads >= MAX_CONCURRENT_UPLOADS) {
    res.set('Retry-After', '30');
    return res.status(503).type('text').send('Uploads are busy. Please try again in a moment.');
  }

  activeUploads += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeUploads -= 1;
  };
  res.once('finish', release);
  res.once('close', release);
  next();
}

// Routes must parse multipart, check CSRF and form validation, then persist.
// Validate the entire batch before the first write; clean up partial writes.
async function persist(req, res, next, files) {
  if (!validationResult(req).isEmpty()) return next();
  const uploaded = [];
  try {
    validateFiles(files);
    const batches = new Map();
    for (const file of files) {
      const bucket = FIELD_TO_BUCKET[file.fieldname];
      if (!batches.has(bucket)) batches.set(bucket, []);
      batches.get(bucket).push(file);
    }
    for (const [bucket, batch] of batches) {
      const filenames = await uploadFiles(bucket, batch);
      if (!Array.isArray(filenames) || filenames.length !== batch.length ||
          filenames.some(filename => typeof filename !== 'string')) {
        if (Array.isArray(filenames)) {
          uploaded.push(...filenames.filter(filename => typeof filename === 'string')
            .map(filename => ({ bucket, filename })));
        }
        throw new Error('Storage returned an unexpected upload count.');
      }
      for (const [index, file] of batch.entries()) {
        file.filename = filenames[index];
        uploaded.push({ bucket, filename: file.filename });
        await scheduleCleanup(bucket, file.filename);
      }
    }
    next();
  } catch (err) {
    await Promise.allSettled(uploaded.map(file => deleteFile(file.bucket, file.filename)));
    next(err);
  }
}

function uploadProfileAssets(req, res, next) {
  return persist(req, res, next, Object.values(req.files || {}).flat());
}
async function uploadAdImage(req, res, next) {
  const files = Object.values(req.files || {}).flat();
  try {
    validateFiles(files);
    const frame = AD_PLACEMENTS[req.body.placement];
    const desktop = req.files?.ad_image?.[0];
    if (!desktop || !frame) return next(invalidFile());
    const mobile = req.files?.ad_mobile_image?.[0] || desktop;
    const optimized = [];
    for (const [kind, original] of [['desktop', desktop], ['mobile', mobile]]) {
      const [width,height] = frame[kind];
      const buffer = await sharp(original.buffer, { limitInputPixels: 36000000 }).rotate().resize(width,height,{fit:'contain',background:'#ffffff'}).webp({quality:84}).toBuffer();
      optimized.push({ buffer,originalname:kind+'.webp',mimetype:'image/webp',fieldname:kind === 'desktop' ? 'ad_image' : 'ad_mobile_image' });
    }
    req.file = optimized[0]; req.mobileAdFile = optimized[1];
    return persist(req,res,next,optimized);
  } catch(err) { if (!err.code) err.code = 'INVALID_FILE_TYPE'; next(err); }
}

module.exports = { parseProfileAssets, parseAdImage, uploadCapacity, uploadProfileAssets, uploadAdImage };
