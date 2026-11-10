const rateLimit = require('express-rate-limit').default;
const { ipKeyGenerator } = require('express-rate-limit');

function limiter(windowMs, limit, message, keyGenerator) {
  return rateLimit({
    windowMs, limit, standardHeaders: true, legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: (req, res) => res.status(429).type('text').send(message)
  });
}

// The network cap also stops username rotation/password spraying.
const loginIpLimiter = limiter(15 * 60 * 1000, 100, 'Too many login attempts. Please wait 15 minutes.');
const loginLimiter = limiter(15 * 60 * 1000, 10, 'Too many login attempts. Please wait 15 minutes.',
  req => ipKeyGenerator(req.ip) + ':' + (typeof req.body?.username === 'string' ? req.body.username.trim().slice(0, 50) : ''));
const registerLimiter = limiter(60 * 60 * 1000, 15, 'Too many registration attempts. Please try again later.');
const contactLimiter = limiter(60 * 60 * 1000, 10, 'Too many messages. Please try again later.');
const profileActionLimiter = limiter(10 * 60 * 1000, 30, 'Too many profile actions. Please try again later.',
  req => req.session?.user ? 'user:' + req.session.user.id : ipKeyGenerator(req.ip));
const uploadLimiter = limiter(10 * 60 * 1000, 20, 'Too many uploads. Please try again later.',
  req => req.session?.user ? 'user:' + req.session.user.id : ipKeyGenerator(req.ip));

module.exports = { loginIpLimiter, loginLimiter, registerLimiter, contactLimiter, profileActionLimiter, uploadLimiter };
