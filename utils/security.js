/* eslint-disable no-control-regex -- Reject control characters in redirect targets. */
const { URL } = require('url');
const crypto = require('crypto');

const PASSWORD_MESSAGE = 'Password must be 8+ characters with uppercase, lowercase, and a number, and no more than 72 UTF-8 bytes.';

function validPassword(value) {
  return typeof value === 'string' && value.length >= 8 &&
    Buffer.byteLength(value, 'utf8') <= 72 &&
    /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value);
}

function validateLogin(req, res, next) {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !username.trim() || username.trim().length > 50 ||
      typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).type('text').send(req.t('Invalid username or password.'));
  }
  req.body.username = username.trim();
  next();
}

// Return only a local path, even when the input is an absolute Referrer URL.
function safeRedirect(req, target, fallback = '/') {
  if (typeof target !== 'string' || /[\\\x00-\x20\x7f]/.test(target)) return fallback;
  try {
    const base = new URL(req.protocol + '://' + req.get('host'));
    const url = new URL(target, base);
    const decodedPath = decodeURIComponent(url.pathname);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base.origin ||
        url.username || url.password || !target.startsWith('/') && !/^https?:\/\//i.test(target) ||
        decodedPath.startsWith('//') || /[\\\x00-\x1f\x7f]/.test(decodedPath)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

function credentialVersion(user) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET)
    .update(String(user.id) + ':' + user.password).digest('hex');
}

function sessionUser(user) {
  const { id, name, username, role, status, gender, locale } = user;
  return { id, name, username, role, status, gender, locale };
}

async function establishSession(req, user) {
  await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
  req.session.user = sessionUser(user);
  req.session.credentialVersion = credentialVersion(user);
  await new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
}

function logout(req, res, next, destination) {
  req.session.destroy(err => {
    if (err) return next(err);
    const options = { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' };
    res.clearCookie('kalpavruksha_sid', options);
    res.clearCookie('kalpavruksha_csrf', options);
    res.redirect(destination);
  });
}

module.exports = { PASSWORD_MESSAGE, validPassword, validateLogin, safeRedirect, credentialVersion, sessionUser, establishSession, logout };
