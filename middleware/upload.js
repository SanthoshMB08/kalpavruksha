const multer = require('multer');
const path = require('path');
const { uploadFile } = require('../utils/supabaseStorage');

// Files are held in memory only (never touch local disk) and then streamed
// straight to the matching Supabase Storage bucket. Bucket per fieldname:
//   profile_image / profile_image_2 -> "profiles"
//   jathaka_pdf                     -> "jathaka"
//   biodata_pdf                     -> "biodata"
//   ad_image                        -> "ads"
const memoryStorage = multer.memoryStorage();

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

const multerProfileAssets = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
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
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: imageFilter
}).single('ad_image');

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
