const rateLimit = require('express-rate-limit').default;
const { ipKeyGenerator } = require('express-rate-limit');

// Applied to all three login POST routes (member /login, admin
// /portal/admin-login, super admin /portal/super-secure-login). Keyed by IP +
// the submitted username, so one person mistyping their own password
// repeatedly doesn't lock out everyone else behind the same NAT/office IP,
// while still throttling a targeted brute-force attempt against one account.
// Uses ipKeyGenerator() rather than raw req.ip so IPv6 addresses are
// normalized correctly (otherwise an IPv6 client could vary their address
// slightly on each request and bypass the limit entirely).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${(req.body && req.body.username) || ''}`,
  handler: (req, res) => {
    req.flash('error', 'Too many login attempts. Please wait 15 minutes and try again.');
    res.redirect(429, 'back');
  }
});

// Looser limit for registration — prevents scripted mass account creation
// without punishing a real person who mistypes the form a few times.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'Too many registration attempts from this network. Please try again later.');
    res.status(429).redirect('back');
  }
});

module.exports = { loginLimiter, registerLimiter };
