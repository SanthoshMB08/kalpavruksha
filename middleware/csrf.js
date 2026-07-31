const { doubleCsrf } = require('csrf-csrf');

const { invalidCsrfTokenError, generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET,
  // Ties each CSRF token to the visitor's session, so a token can't be lifted
  // and replayed against a different session.
  getSessionIdentifier: (req) => (req.session && req.session.id) || '',
  cookieName: 'kalpavruksha_csrf',
  cookieOptions: {
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  },
  // The app posts forms as application/x-www-form-urlencoded — this is where
  // csrf-csrf looks for the token on incoming requests.
  getCsrfTokenFromRequest: (req) => req.body._csrf
});

// Generates (or reuses) this request's token and makes it available to every
// EJS view as `csrfToken`, so `<input type="hidden" name="_csrf" value="<%= csrfToken %>">`
// works the same way in every form across the app.
function attachCsrfToken(req, res, next) {
  res.locals.csrfToken = generateCsrfToken(req, res);
  next();
}

module.exports = { doubleCsrfProtection, attachCsrfToken, invalidCsrfTokenError };
