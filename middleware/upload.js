const multer = require('multer');
const path = require('path');
const fs = require('fs');

function ensureDir(subfolder) {
  const dest = path.join(__dirname, '..', 'public', 'uploads', subfolder);
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  return dest;
}

function makeStorage(subfolder) {
  const dest = ensureDir(subfolder);
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dest),
    filename: (req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${path.extname(file.originalname)}`);
    }
  });
}

// Profile uploads have two fields that must land in different folders:
// profile_image -> uploads/profiles, jathaka_pdf -> uploads/jathaka
const profileDir = ensureDir('profiles');
const jathakaDir = ensureDir('jathaka');
const profileAssetsStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, file.fieldname === 'jathaka_pdf' ? jathakaDir : profileDir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  }
});

const imageFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp/;
  const ok = allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype);
  if (ok) return cb(null, true);
  cb(new Error('Only JPG, PNG, or WEBP images are allowed.'));
};

const pdfFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') return cb(null, true);
  cb(new Error('Only PDF files are allowed for the jathaka document.'));
};

const uploadProfileAssets = multer({
  storage: profileAssetsStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'jathaka_pdf') return pdfFilter(req, file, cb);
    return imageFilter(req, file, cb);
  }
}).fields([
  { name: 'profile_image', maxCount: 1 },
  { name: 'jathaka_pdf', maxCount: 1 }
]);

const uploadAdImage = multer({
  storage: makeStorage('ads'),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: imageFilter
}).single('ad_image');

module.exports = { uploadProfileAssets, uploadAdImage };
