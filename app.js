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
const MySQLSession = require('express-mysql-session')(session);
const flash = require('connect-flash');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');
const { safeRedirect } = require('./utils/security');
const { refreshSessionUser } = require('./middleware/auth');
const { pool } = require('./config/db');
const Advertisement = require('./models/Advertisement');
const Profile = require('./models/Profile');
const { AD_PLACEMENTS } = require('./utils/adPlacements');
const { getPublicUrl, getFile } = require('./utils/storage');
const logger = require('./utils/logger');
const { attachCsrfToken, invalidCsrfTokenError } = require('./middleware/csrf');
const { getTranslator, SUPPORTED_LANGS, clientMessages, catalogVersion } = require('./utils/i18n');

const publicRoutes = require('./routes/public');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const superAdminRoutes = require('./routes/superadmin');

const app = express();
const trustProxy = Number(process.env.TRUST_PROXY || 1);
if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 10) {
  throw new Error('TRUST_PROXY must be an integer from 0 to 10.');
}
app.set('trust proxy', trustProxy);
app.locals.t = getTranslator('en');
app.locals.currentLang = 'en';
app.locals.catalogVersion = catalogVersion;
app.locals.safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';
if (isProduction && (Buffer.byteLength(process.env.SESSION_SECRET, 'utf8') < 32 || /change_this|change_me|test.*secret/i.test(process.env.SESSION_SECRET))) {
  throw new Error('Production SESSION_SECRET must be a unique random secret of at least 32 bytes.');
}

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

app.set('query parser', 'simple');

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
    serializers: {
      // Query strings may contain member names/mobile numbers. Never log cookies.
      req: req => ({ id: req.id, method: req.method, url: req.url.split('?')[0] }),
      res: res => ({ statusCode: res.statusCode })
    },
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
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
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

app.get('/assets/locale/:code.js', (req,res) => {
  if (!SUPPORTED_LANGS.includes(req.params.code)) return res.sendStatus(404);
  res.set('Cache-Control','public, max-age=86400');
  res.type('application/javascript').send('window.KK_MESSAGES = '+app.locals.safeJson(req.params.code === 'kn' ? clientMessages : {})+';');
});

// Body parsing & static assets
app.use(express.urlencoded({ extended: false, limit: '64kb', parameterLimit: 100, inflate: false }));
app.use(express.json({ limit: '64kb', inflate: false }));
app.use(cookieParser()); // required by csrf-csrf, which manages its own cookie separate from the session cookie
app.use('/uploads/:bucket', (req, res, next) => {
  if (['biodata', 'jathaka', 'profiles'].includes(req.params.bucket.toLowerCase())) return res.sendStatus(404);
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// MySQL sessions use the schema imported during deployment; runtime needs no DDL grants.
const sessionStore = new MySQLSession({
  createDatabaseTable: false, clearExpired: !isTest, endConnectionOnClose: false,
  schema: { tableName: 'session', columnNames: { session_id: 'sid', expires: 'expires', data: 'sess' } }
}, pool);
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

// Sensitive member and staff pages should never be kept in browser or shared
// proxy caches, where another person using the same device could revisit them.
app.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-store, max-age=0');
  res.set('Pragma', 'no-cache');
  next();
});
app.use(refreshSessionUser);

app.get('/media/profiles/:filename', async (req, res, next) => {
  const viewer = req.session?.user;
  if (!viewer || viewer.status !== 'approved' ||
      !['user', 'admin', 'superadmin'].includes(viewer.role) ||
      !/^[a-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(req.params.filename)) {
    return res.sendStatus(404);
  }

  try {
    const profile = await Profile.findByImageFilename(req.params.filename);
    if (!profile || (viewer.role === 'user' && (
      profile.deleted_at ||
      (profile.marital_status === 'married' && String(profile.user_id) !== String(viewer.id))
    ))) {
      return res.sendStatus(404);
    }

    const file = await getFile('profiles', req.params.filename);
    res.set({
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Type': file.contentType,
      'Content-Length': file.buffer.length,
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.send(file.buffer);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'INVALID_FILE_TYPE' ||
        error.code === 'FILE_TOO_LARGE' || error.code === 'NoSuchKey') {
      return res.sendStatus(404);
    }
    return next(error);
  }
});

app.use((req, res, next) => {
  req.flash = buildFlashHandler(req);
  next();
});

app.use(flash());
app.use(attachCsrfToken); // generates res.locals.csrfToken for every request, used by every POST form

app.use((req,res,next) => {
  const preferred = req.session.user?.locale || req.cookies.lang;
  const lang = SUPPORTED_LANGS.includes(preferred) ? preferred : (req.acceptsLanguages('en','kn') || 'en');
  res.locals.currentLang = lang;
  res.locals.t = req.t = getTranslator(lang);
  res.locals.currentPath = req.path;
  res.locals.currentTab = req.query.tab;
  const languageReturnTo = safeRedirect(req, req.originalUrl, '/');
  res.locals.languageUrl = code => `/lang/${SUPPORTED_LANGS.includes(code) ? code : 'en'}?next=${encodeURIComponent(languageReturnTo)}`;
  res.locals.formatDate = (value, options={dateStyle:'medium'}) => value ? new Intl.DateTimeFormat(lang === 'kn' ? 'kn-IN' : 'en-IN', {timeZone:'Asia/Kolkata',...options}).format(new Date(value)) : '';
  next();
});
app.get('/lang/:code', async (req,res,next) => {
  try {
    if(SUPPORTED_LANGS.includes(req.params.code)) {
      if(req.session.user) await require('./config/db').query('UPDATE users SET locale = ? WHERE id = ?', [req.params.code,req.session.user.id]);
      if(req.session.user) req.session.user.locale = req.params.code;
      res.cookie('lang', req.params.code, { maxAge:31536000000,sameSite:'lax',secure:isProduction });
    }
    const roleHome = req.session.user?.role === 'superadmin' ? '/portal/super-secure-dashboard'
      : req.session.user?.role === 'admin' ? '/portal/admin-dashboard'
        : req.session.user ? '/dashboard' : '/';
    const referrerTarget = safeRedirect(req, req.get('Referrer'), roleHome);
    res.redirect(safeRedirect(req, req.query.next, referrerTarget));
  } catch(error) { next(error); }
});

// Make session user and flash messages available in every view
app.use((req, res, next) => {
  const flash = buildFlashHandler(req);
  res.locals.currentUser = req.session.user || null;
  res.locals.successMsg = flash('success');
  res.locals.errorMsg = flash('error');
  // Views use this helper for files stored on local disk or S3-compatible
  // storage instead of hardcoding upload paths, e.g.
  // fileUrl('profiles', profile.image_name).
  res.locals.adPlacements = AD_PLACEMENTS;
  res.locals.fileUrl = (bucket, filename) => getPublicUrl(bucket, filename);
  next();
});

// Top-banner ads are a site-wide placement (not just the home page) — fetched
// once here so the shared header partial can render them on every page.
app.use(async (req, res, next) => {
  try {
    res.locals.topBannerAds = req.method === 'GET' && !req.path.startsWith('/portal') && !req.path.endsWith('/modal')
      ? await Advertisement.listActiveByPlacement('top_banner') : [];
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
  const translate = res.locals.t || app.locals.t;
  const flash = buildFlashHandler(req);

  if (res.headersSent) {
    req.log.error({ err }, 'Error occurred after response had already been sent');
    return next(err);
  }

  // Database/infra-class errors (e.g. the DB is unreachable) can't be recovered
  // by redirecting — session middleware needs the DB on every request, so a
  // redirect just fails the same way again and again (redirect loop). Show a
  // static, self-contained page instead of trying to render/redirect further.
  const isInfraError =
    err.severity === 'FATAL' ||
    ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN', 'ER_CON_COUNT_ERROR', 'PROTOCOL_CONNECTION_LOST'].includes(err.code) ||
    /tenant or user|connection.*(closed|terminated|refused)/i.test(err.message || '');
  if (isInfraError) {
    req.log.error({ err }, 'Infrastructure error (likely database unreachable) — showing static error page instead of redirecting');
    return res.status(503).render('service-error');
  }

  if (err === invalidCsrfTokenError || err.code === 'EBADCSRFTOKEN') {
    req.log.warn({
      csrfDiagnostics: {
        secureRequest: req.secure,
        proxyReportsHttps: String(req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase() === 'https',
        sessionPresent: Boolean(req.session && req.session.id),
        sessionCookiePresent: Boolean(req.cookies && req.cookies.kalpavruksha_sid),
        csrfCookiePresent: Boolean(req.cookies && req.cookies.kalpavruksha_csrf)
      }
    }, 'Rejected request with invalid/missing CSRF token');
    return res.status(403).type('text').send(translate('Your session expired or the form token is invalid. Reload the page and try again.'));
  }
  if (err.code === 'LIMIT_FILE_SIZE' || err.code === 'INVALID_FILE_TYPE' || err.name === 'MulterError') {
    req.log.warn({ code: err.code }, 'Rejected upload');
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Images must be 5MB or smaller; PDFs must be 15MB or smaller.'
      : err.code === 'INVALID_FILE_TYPE' ? 'Only genuine JPG, PNG, WEBP images or PDF documents are allowed.' : 'Invalid upload. Check the files and form fields.';
    flash('error', message);
    return res.status(400).type('text').send(translate(message));
  }
  if (['entity.too.large', 'parameters.too.many'].includes(err.type)) return res.status(413).type('text').send(translate('Request is too large.'));
  if (err.type === 'encoding.unsupported') return res.status(415).type('text').send(translate('Compressed request bodies are not supported.'));
  if (err.type === 'entity.parse.failed') return res.status(400).type('text').send(translate('Invalid request body.'));
  req.log.error({ err }, 'Request failed');
  return res.status(500).render('service-error');
});

app.buildFlashHandler = buildFlashHandler;
module.exports = app;
