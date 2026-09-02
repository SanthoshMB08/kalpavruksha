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
const crypto = require('crypto');
const { URL } = require('url');
const { pool } = require('./config/db');
const Advertisement = require('./models/Advertisement');
const { getPublicUrl } = require('./utils/storage');
const logger = require('./utils/logger');
const { attachCsrfToken, invalidCsrfTokenError } = require('./middleware/csrf');
const { getTranslator, SUPPORTED_LANGS } = require('./utils/i18n');

const publicRoutes = require('./routes/public');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const superAdminRoutes = require('./routes/superadmin');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

function buildFlashHandler(req) {
  if (typeof req.flash === 'function') {
    return req.flash.bind(req);
  }

  return (type, message) => {
    if (!req.session) {
      if (typeof message === 'undefined') return [];
      return [];
    }

    if (!req.session.flash) req.session.flash = {};

    if (typeof message === 'undefined') {
      const messages = req.session.flash[type] || [];
      delete req.session.flash[type];
      return messages;
    }

    if (!req.session.flash[type]) req.session.flash[type] = [];
    req.session.flash[type].push(message);
    return req.session.flash[type];
  };
}

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
// Silenced entirely during tests — the test run's own output is what
// matters, not a wall of per-request log lines.
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/health' || isTest
    }
  })
);

// Per-request CSP nonce for inline <script> blocks. Generated fresh on every
// request and exposed to every EJS view as `nonce`, so
// <script nonce="<%= nonce %>"> is explicitly allow-listed by helmet's CSP
// below instead of relying on the blanket 'unsafe-inline' (which defeats
// CSP's main purpose — blocking injected/unauthorized inline scripts).
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

// Security headers. script-src is nonce-based (see above) — an attacker who
// manages to inject an inline <script> (e.g. via a stored-XSS field) can't
// get it to execute, since it won't carry a valid per-request nonce.
// style-src is still 'unsafe-inline' — the app uses inline style="..."
// attributes pervasively throughout the views, and de-risking those means
// moving every one to a CSS class, a much larger visual-only refactor with
// far lower security payoff (CSS injection is a narrower, lower-severity
// vector than script injection). Still gets the other real protections:
// clickjacking (frameguard), MIME sniffing (noSniff), and HSTS in production.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
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
      secure: isProduction // HTTPS-only in production; left off in dev/test since local HTTP has no TLS
    }
  })
);

app.use((req, res, next) => {
  req.flash = buildFlashHandler(req);
  next();
});

app.use(flash());
app.use(attachCsrfToken); // generates res.locals.csrfToken for every request, used by every POST form

// Language selection — cookie-based (no account setting needed, works for
// logged-out visitors too). Scoped to the member-facing entry points
// (header/footer, login, register, home, dashboard, saved profiles) — the
// Admin/Super Admin portal stays English-only since it's an internal staff
// tool. Defaults to English if no cookie is set or it holds an unknown value.
app.use((req, res, next) => {
  const lang = SUPPORTED_LANGS.includes(req.cookies.lang) ? req.cookies.lang : 'en';
  res.locals.currentLang = lang;
  res.locals.t = getTranslator(lang);
  next();
});
app.get('/lang/:code', (req, res) => {
  if (SUPPORTED_LANGS.includes(req.params.code)) {
    res.cookie('lang', req.params.code, { maxAge: 1000 * 60 * 60 * 24 * 365, sameSite: 'lax' });
  }
  res.redirect(req.get('Referrer') || '/');
});

// Make session user and flash messages available in every view
app.use((req, res, next) => {
  const flash = buildFlashHandler(req);
  res.locals.currentUser = req.session.user || null;
  res.locals.successMsg = flash('success');
  res.locals.errorMsg = flash('error');
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

// Error handler (e.g. multer file-type/size errors, CSRF token failures)
app.use((err, req, res, next) => {
  const flash = buildFlashHandler(req);

  if (res.headersSent) {
    req.log.error({ err }, 'Error occurred after response had already been sent');
    return;
  }

  // Database/infra-class errors (e.g. the DB is unreachable) can't be recovered
  // by redirecting — session middleware needs the DB on every request, so a
  // redirect just fails the same way again and again (redirect loop). Show a
  // static, self-contained page instead of trying to render/redirect further.
  const isInfraError =
    err.severity === 'FATAL' ||
    ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN'].includes(err.code) ||
    /tenant or user|connection.*(closed|terminated|refused)/i.test(err.message || '');
  if (isInfraError) {
    req.log.error({ err }, 'Infrastructure error (likely database unreachable) — showing static error page instead of redirecting');
    return res.status(503).render('service-error');
  }

  // Never redirect back to the exact URL that just failed — that's how the
  // loop above happens for any error type, not just infra ones.
  const referrer = req.get('Referrer');
  let safeTarget = referrer || '/';
  if (referrer) {
    try {
      const referrerPath = new URL(referrer).pathname;
      if (referrerPath === req.originalUrl.split('?')[0]) {
        // The referrer is the exact URL that just failed — redirecting there
        // would just fail the same way again (the loop this fix exists for).
        safeTarget = null;
      }
    } catch {
      // Malformed Referrer header — treat as absent; safeTarget stays '/' from above.
    }
  }

  if (err === invalidCsrfTokenError || err.code === 'EBADCSRFTOKEN') {
    req.log.warn({ err }, 'Rejected request with invalid/missing CSRF token');
    flash('error', 'Your session expired or this form was already submitted. Please try again.');
    return safeTarget ? res.redirect(safeTarget) : res.status(400).render('service-error');
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    // Multer's own message ("File too large") doesn't say which limit — our
    // enforceFieldSizeLimits() in middleware/upload.js already gives a
    // specific one for image-vs-PDF; this is the fallback for the rare case
    // where multer's own 15MB ceiling rejects the file first.
    flash('error', err.message !== 'File too large' ? err.message : 'File too large — images must be 5MB or smaller, PDFs 15MB or smaller.');
    return safeTarget ? res.redirect(safeTarget) : res.status(400).render('service-error');
  }
  // Routine user-input problems (bad file type from multer's fileFilter)
  // aren't server errors — log at warn so they don't get buried among (or
  // mistaken for) real bugs, but don't pollute error-level logs/alerts either.
  const isRoutineUploadError = err.name === 'MulterError' || /only .* (are|is) allowed/i.test(err.message || '');
  if (isRoutineUploadError) {
    req.log.warn({ err }, 'Rejected upload');
  } else {
    req.log.error(err);
  }
  flash('error', err.message || 'Something went wrong.');
  if (safeTarget) return res.redirect(safeTarget);
  res.status(500).render('service-error');
});

app.buildFlashHandler = buildFlashHandler;
module.exports = app;
