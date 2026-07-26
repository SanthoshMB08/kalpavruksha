require('dotenv').config();
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const flash = require('connect-flash');
const path = require('path');
const { pool } = require('./config/db');
const Advertisement = require('./models/Advertisement');
const { getPublicUrl } = require('./utils/supabaseStorage');

const publicRoutes = require('./routes/public');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const superAdminRoutes = require('./routes/superadmin');

const app = express();
const PORT = process.env.PORT || 5000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body parsing & static assets
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Sessions (stored in Supabase Postgres so admins stay logged in across restarts)
const sessionStore = new PgSession({
  pool,
  tableName: 'session',
  createTableIfMissing: true
});
app.use(
  session({
    key: 'kalpavruksha_sid',
    secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 days
  })
);

app.use(flash());

// Make session user and flash messages available in every view
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.successMsg = req.flash('success');
  res.locals.errorMsg = req.flash('error');
  // Views used to hardcode "/uploads/<bucket>/<filename>" (served from local
  // disk). Files now live in Supabase Storage, so views call this helper
  // instead, e.g. fileUrl('profiles', profile.image_name).
  res.locals.fileUrl = (bucket, filename) => getPublicUrl(bucket, filename);
  next();
});

// Top-banner ads are a site-wide placement (not just the home page) — fetched
// once here so the shared header partial can render them on every page.
app.use(async (req, res, next) => {
  try {
    res.locals.topBannerAds = await Advertisement.listActiveByPlacement('top_banner');
  } catch (err) {
    console.error(err);
    res.locals.topBannerAds = [];
  }
  next();
});

// Routes
app.use('/', publicRoutes);
app.use('/', userRoutes);
app.use('/portal', adminRoutes);
app.use('/portal', superAdminRoutes);

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

// Error handler (e.g. multer file-type errors)
app.use((err, req, res, next) => {
  console.error(err);
  req.flash('error', err.message || 'Something went wrong.');
  res.redirect('back');
});

app.listen(PORT, () => {
  console.log(`Kalpavruksha Kalyana running at http://localhost:${PORT}`);
});

// Ads also get swept lazily on every read (see Advertisement.deactivateExpired
// call sites), but this background timer makes expiry happen even on a quiet
// site with no visitors — an ad won't stay live past its expiry just because
// nobody hit a page that would've triggered the lazy sweep.
const AD_EXPIRY_SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
setInterval(() => {
  Advertisement.deactivateExpired().catch((err) => {
    console.error('Ad expiry sweep failed:', err);
  });
}, AD_EXPIRY_SWEEP_INTERVAL_MS);
