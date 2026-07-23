// Session-based auth guards. req.session.user is set on login and holds
// { id, name, username, role, status, viewMode } where viewMode is only
// used for the admin dual-view toggle ('admin' | 'user').

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
  if (req.session.user.role !== 'user') return next(); // admins can browse too
  if (req.session.user.status !== 'approved') {
    return res.redirect('/pending-approval');
  }
  return next();
}

function isAdmin(req, res, next) {
  if (
    req.session &&
    req.session.user &&
    (req.session.user.role === 'admin' || req.session.user.role === 'superadmin')
  ) {
    return next();
  }
  req.flash('error', 'Admin access required.');
  return res.redirect('/portal/admin-login');
}

function isSuperAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'superadmin') {
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

module.exports = { isAuthenticated, isApprovedUser, isAdmin, isSuperAdmin, redirectIfLoggedIn };
