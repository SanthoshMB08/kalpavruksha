const User = require('../models/User');
const { credentialVersion, sessionUser } = require('../utils/security');

// Refresh authorization from the database on every dynamic authenticated request.
// Old sessions and sessions predating a password reset fail closed.
async function refreshSessionUser(req, res, next) {
  if (!req.session || !req.session.user) return next();
  try {
    const user = await User.findById(req.session.user.id);
    if (!user || user.deleted_at || user.status === 'rejected' ||
        !['user', 'admin', 'superadmin'].includes(user.role) ||
        req.session.credentialVersion !== credentialVersion(user)) {
      await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
    } else {
      req.session.user = sessionUser(user);
    }
    next();
  } catch (err) {
    next(err);
  }
}

// Session-based auth guards. req.session.user is set on login and holds
// { id, name, username, role, status, gender }.

function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) return next();
  req.flash('error', 'Please log in to continue.');
  return res.redirect('/login');
}

function isApprovedUser(req, res, next) {
  if (!req.session || !req.session.user) {
    req.flash('error', 'Please log in to continue.');
    return res.redirect('/login');
  }
  if (['admin', 'superadmin'].includes(req.session.user.role) && req.session.user.status === 'approved') return next();
  if (req.session.user.role !== 'user') return res.sendStatus(403);
  if (req.session.user.status !== 'approved') {
    return res.redirect('/pending-approval');
  }
  return next();
}

function isAdmin(req, res, next) {
  if (
    req.session &&
    req.session.user &&
    req.session.user.status === 'approved' &&
    (req.session.user.role === 'admin' || req.session.user.role === 'superadmin')
  ) {
    return next();
  }
  req.flash('error', 'Admin access required.');
  return res.redirect('/portal/admin-login');
}

function isSuperAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'superadmin' && req.session.user.status === 'approved') {
    return next();
  }
  req.flash('error', 'Super admin access required.');
  return res.redirect('/portal/super-secure-login');
}

// Prevents a logged-in user from re-visiting login/register pages.
function redirectIfLoggedIn(req, res, next) {
  if (req.session && req.session.user) {
    const role = req.session.user.role;
    if (role === 'superadmin') return res.redirect('/portal/super-secure-dashboard');
    if (role === 'admin') return res.redirect('/portal/admin-dashboard');
    return res.redirect('/dashboard');
  }
  return next();
}

module.exports = { refreshSessionUser, isAuthenticated, isApprovedUser, isAdmin, isSuperAdmin, redirectIfLoggedIn };
