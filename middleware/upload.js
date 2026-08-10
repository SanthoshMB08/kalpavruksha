const multer = require('multer');
const path = require('path');
const { uploadFile } = require('../utils/storage');

// Files are held in memory only (never touch local disk here) and then
// streamed straight to the active storage provider (see utils/storage —
// Supabase / S3-compatible / local disk, chosen via STORAGE_PROVIDER).
// Bucket per fieldname:
//   profile_image / profile_image_2 -> "profiles"
//   jathaka_pdf                     -> "jathaka"
//   biodata_pdf                     -> "biodata"
//   ad_image                        -> "ads"
const memoryStorage = multer.memoryStorage();

const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const PDF_MAX_BYTES = 15 * 1024 * 1024; // 15 MB

const imageFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp/;
  const ok = allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype);
  if (ok) return cb(null, true);
  cb(new Error('Only JPG, PNG, or WEBP images are allowed.'));
};

const pdfFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') return cb(null, true);
  cb(new Error('Only PDF files are allowed for this document.'));
};

// Multer's `limits.fileSize` is a single ceiling per multer() call — it
// can't natively enforce a different size per field within one .fields()
// request. Set it to the larger of the two (PDF) so multer doesn't reject a
// legitimate PDF, then enforceFieldSizeLimits() below checks each field
// against its own correct limit right after upload.
const multerProfileAssets = multer({
  storage: memoryStorage,
  limits: { fileSize: PDF_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'jathaka_pdf' || file.fieldname === 'biodata_pdf') return pdfFilter(req, file, cb);
    return imageFilter(req, file, cb);
  }
}).fields([
  { name: 'profile_image', maxCount: 1 },
  { name: 'profile_image_2', maxCount: 1 },
  { name: 'jathaka_pdf', maxCount: 1 },
  { name: 'biodata_pdf', maxCount: 1 }
]);

const multerAdImage = multer({
  storage: memoryStorage,
  limits: { fileSize: IMAGE_MAX_BYTES },
  fileFilter: imageFilter
}).single('ad_image');

const IMAGE_FIELDS = new Set(['profile_image', 'profile_image_2', 'ad_image']);
const PDF_FIELDS = new Set(['jathaka_pdf', 'biodata_pdf']);

// Enforces the correct per-field-type limit (5MB images / 15MB PDFs) on
// whatever multer already accepted under its single 15MB ceiling.
function enforceFieldSizeLimits(files) {
  for (const field of Object.keys(files)) {
    for (const file of files[field]) {
      if (IMAGE_FIELDS.has(field) && file.size > IMAGE_MAX_BYTES) {
        const err = new Error(`${file.originalname} is too large — images must be 5MB or smaller.`);
        err.code = 'LIMIT_FILE_SIZE';
        throw err;
      }
      if (PDF_FIELDS.has(field) && file.size > PDF_MAX_BYTES) {
        const err = new Error(`${file.originalname} is too large — PDFs must be 15MB or smaller.`);
        err.code = 'LIMIT_FILE_SIZE';
        throw err;
      }
    }
  }
}

const FIELD_TO_BUCKET = {
  profile_image: 'profiles',
  profile_image_2: 'profiles',
  jathaka_pdf: 'jathaka',
  biodata_pdf: 'biodata'
};

// Runs after multerProfileAssets. Uploads whichever fields were present to
// their Supabase bucket, then sets file.filename on each — same shape multer
// gives you with diskStorage — so controllers (which read
// files.profile_image[0].filename etc.) don't need any changes.
async function uploadProfileAssets(req, res, next) {
  multerProfileAssets(req, res, async (err) => {
    if (err) return next(err);
    try {
      const files = req.files || {};
      enforceFieldSizeLimits(files);
      for (const field of Object.keys(files)) {
        const bucket = FIELD_TO_BUCKET[field];
        for (const file of files[field]) {
          file.filename = await uploadFile(bucket, file);
        }
      }
      next();
    } catch (uploadErr) {
      next(uploadErr);
    }
  });
}

// Runs after multerAdImage. Same idea for the single ad_image field.
async function uploadAdImage(req, res, next) {
  multerAdImage(req, res, async (err) => {
    if (err) return next(err);
    try {
      if (req.file) {
        req.file.filename = await uploadFile('ads', req.file);
      }
      next();
    } catch (uploadErr) {
      next(uploadErr);
    }
  });
}

module.exports = { uploadProfileAssets, uploadAdImage };
