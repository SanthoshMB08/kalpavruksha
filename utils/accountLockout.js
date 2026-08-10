const bcrypt = require('bcrypt');
const User = require('../models/User');

function parseLockoutTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const text = String(value).trim();
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}[ T]/.test(text) && !/[zZ]$/.test(text)) {
    const normalized = text.includes('T') ? text : text.replace(' ', 'T');
    return new Date(`${normalized}Z`);
  }

  return new Date(text);
}

// Checks a submitted password against a user record, applying the account
// lockout policy along the way. Only ever called for role IN ('user',
// 'admin') — Super Admin login never goes through this, so it has no
// attempt limit (it's the account that unlocks everyone else).
//
// Returns one of:
//   { outcome: 'locked', message }              — already locked, still waiting out the window
//   { outcome: 'invalid', message }              — bad password, records the failure
//   { outcome: 'locked_now', message }           — this failure was the one that triggered the lock
//   { outcome: 'ok' }                            — password correct, failure counter cleared
async function checkLogin(user, password) {
  const lockedUntil = parseLockoutTimestamp(user.locked_until);
  if (lockedUntil && lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((lockedUntil - new Date()) / 60000);
    return {
      outcome: 'locked',
      message: `This account is temporarily locked after too many failed attempts. Try again in ${minutesLeft} minute(s), or contact a Super Admin to unlock it.`
    };
  }

  const match = await bcrypt.compare(password, user.password);
  if (match) {
    if (user.failed_login_attempts > 0) await User.clearFailedLogins(user.id);
    return { outcome: 'ok' };
  }

  const result = await User.registerFailedLogin(user.id);
  if (result.locked) {
    return {
      outcome: 'locked_now',
      message: `Too many failed attempts. This account is now locked for ${result.lockoutMinutes} minutes, or until a Super Admin unlocks it.`
    };
  }
  return {
    outcome: 'invalid',
    message: `Invalid username or password. ${result.remaining} attempt(s) remaining before this account is temporarily locked.`
  };
}

module.exports = { checkLogin };
