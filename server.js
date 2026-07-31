require('dotenv').config();

// Fail fast if critical secrets are missing, rather than silently running
// with a known, publicly-visible fallback secret (which would let anyone
// forge a valid session cookie).
if (!process.env.SESSION_SECRET) {
  throw new Error(
    'SESSION_SECRET is not set. Refusing to start — set it in your .env (or your host\'s environment variables) before running the app.'
  );
}

const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const flash = require('connect-flash');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const cookieParser = require('cookie-parser');
const path = require('path');
const { pool } = require('./config/db');
const Advertisement = require('./models/Advertisement');
const { getPublicUrl } = require('./utils/storage');
const logger = require('./utils/logger');
const { attachCsrfToken, invalidCsrfTokenError } = require('./middleware/csrf');

const publicRoutes = require('./routes/public');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const superAdminRoutes = require('./routes/superadmin');

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

// Needed so `secure` cookies and req.ip work correctly behind a reverse
// proxy/load balancer (Render, Railway, Hostinger + Nginx, etc.) — without
// this, Express doesn't trust the X-Forwarded-* headers and every request
// looks like plain HTTP even when the proxy terminated real HTTPS.
app.set('trust proxy', 1);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Structured request logging (JSON in production, pretty-printed in dev).
// Attaches a per-request `req.log` that every controller's error logging
// now uses, so logs can be correlated back to the request that caused them.
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/health'
    },
    customLogLevel: (req, res, err) => {
      if (res.statusCode >= 500 || err) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    }
  })
);

// Security headers. CSP is intentionally permissive on 'unsafe-inline' for
// scripts/styles because the app currently relies on inline <script> blocks
// throughout the views (notification bell, row menus, modals, etc.) rather
// than nonced/external scripts — tightening that is a follow-up refactor,
// not a one-line change. Still gets the other real protections: clickjacking
// (frameguard), MIME sniffing (noSniff), and HSTS in production.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"]
      }
    },
    hsts: isProduction
  })
);

// Health check — no auth, not logged, used by uptime monitors/hosting
// platforms to verify the app and its database connection are alive.
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok', db: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
  } catch (err) {
    logger.error({ err }, 'Health check failed — database unreachable');
    res.status(503).json({ status: 'error', db: 'unreachable', timestamp: new Date().toISOString() });
  }
});

// Body parsing & static assets
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser()); // required by csrf-csrf, which manages its own cookie separate from the session cookie
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
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      httpOnly: true, // JS can't read the session cookie — mitigates cookie theft via XSS
      sameSite: 'lax', // sent on top-level navigation/GET, blocked on cross-site POSTs — CSRF hardening alongside csrf-csrf
      secure: isProduction // HTTPS-only in production; left off in dev since local HTTP has no TLS
    }
  })
);

app.use(flash());
app.use(attachCsrfToken); // generates res.locals.csrfToken for every request, used by every POST form

// Make session user and flash messages available in every view
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.successMsg = req.flash('success');
  res.locals.errorMsg = req.flash('error');
  // Views used to hardcode "/uploads/<bucket>/<filename>" (served from local
  // disk). Files now live wherever STORAGE_PROVIDER points (Supabase / S3-
  // compatible / local disk), so views call this helper instead, e.g.
  // fileUrl('profiles', profile.image_name).
  res.locals.fileUrl = (bucket, filename) => getPublicUrl(bucket, filename);
  next();
});

// Top-banner ads are a site-wide placement (not just the home page) — fetched
// once here so the shared header partial can render them on every page.
app.use(async (req, res, next) => {
  try {
    res.locals.topBannerAds = await Advertisement.listActiveByPlacement('top_banner');
  } catch (err) {
    req.log.error(err);
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

// Error handler (e.g. multer file-type errors, CSRF token failures)
app.use((err, req, res, next) => {
  if (err === invalidCsrfTokenError || err.code === 'EBADCSRFTOKEN') {
    req.log.warn({ err }, 'Rejected request with invalid/missing CSRF token');
    req.flash('error', 'Your session expired or this form was already submitted. Please try again.');
    return res.redirect('back');
  }
  req.log.error(err);
  req.flash('error', err.message || 'Something went wrong.');
  res.redirect('back');
});

const server = app.listen(PORT, () => {
  logger.info(`Kalpavruksha Kalyana running at http://localhost:${PORT}`);
});

// Ads also get swept lazily on every read (see Advertisement.deactivateExpired
// call sites), but this background timer makes expiry happen even on a quiet
// site with no visitors — an ad won't stay live past its expiry just because
// nobody hit a page that would've triggered the lazy sweep.
const AD_EXPIRY_SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
setInterval(() => {
  Advertisement.deactivateExpired().catch((err) => {
    logger.error({ err }, 'Ad expiry sweep failed');
  });
}, AD_EXPIRY_SWEEP_INTERVAL_MS);

// Graceful shutdown — drains in-flight requests and closes the pg pool
// cleanly instead of dropping connections mid-query on deploy/restart.
function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close(() => {
    pool.end().then(() => {
      logger.info('Postgres pool closed. Exiting.');
      process.exit(0);
    });
  });
  // Force-exit if shutdown hangs (e.g. a stuck connection)
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
