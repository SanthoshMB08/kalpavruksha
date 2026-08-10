const bcrypt = require('bcrypt');

// Pulls the CSRF token out of a rendered page's hidden input. Every form in
// the app embeds it the same way: <input type="hidden" name="_csrf" value="...">
function extractCsrfToken(html) {
  const match = html.match(/name="_csrf" value="([^"]+)"/);
  if (!match) throw new Error('No CSRF token found in response HTML — page may not have rendered correctly.');
  return match[1];
}

// GETs a page with the given supertest agent (which carries cookies across
// requests) and returns its CSRF token, ready to include in a POST body.
async function getCsrfToken(agent, path) {
  const res = await agent.get(path);
  return extractCsrfToken(res.text);
}

// Directly inserts a ready-to-use user row (bypassing registration/approval
// flow) for tests that need a specific role/status/gender without exercising
// the registration flow itself (that's what auth.test.js is for).
async function createUser(pool, overrides = {}) {
  const defaults = {
    name: 'Test User',
    mobile_number: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
    username: `testuser_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    password: 'Passw0rd1',
    role: 'user',
    status: 'approved',
    gender: 'female'
  };
  const data = { ...defaults, ...overrides };
  const passwordHash = await bcrypt.hash(data.password, 4); // low cost factor — tests don't need production-strength hashing, just speed
  const result = await pool.query(
    `INSERT INTO users (name, mobile_number, username, password, role, status, gender)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [data.name, data.mobile_number, data.username, passwordHash, data.role, data.status, data.gender]
  );
  return { id: result.rows[0].id, plainPassword: data.password, ...data };
}

// Logs an existing user in via the real login endpoint (member /login, admin
// /portal/admin-login, or super admin /portal/super-secure-login — all three
// share the same URL for GET and POST), so the session is populated exactly
// the way a real request would populate it, not by reaching into the session
// store directly.
async function loginAs(agent, loginPath, username, password) {
  const token = await getCsrfToken(agent, loginPath);
  return agent.post(loginPath).type('form').send({ username, password, _csrf: token });
}

module.exports = { extractCsrfToken, getCsrfToken, createUser, loginAs };
