const pool = require('../config/db');
const { normalizePagination, buildPageMeta } = require('../utils/pagination');

// Lockout policy — applies to role IN ('user', 'admin') only. Super Admin is
// exempt (never locks itself out) and is the one who can unlock a locked
// account early, before this window elapses on its own.
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;

const User = {
  // Login lookup — excludes soft-deleted accounts, so a deleted user can't
  // log in even if their session/cookie somehow survives.
  async findByUsername(username) {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = $1 AND deleted_at IS NULL', [username]);
    return rows[0];
  },

  // Unfiltered by design — used for admin lookups (Trash page, profile
  // detail "created by") where finding a soft-deleted user is expected.
  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0];
  },

  async findMemberById(id) {
    const [rows] = await pool.query(
      "SELECT id, name, mobile_number, username, gender, status FROM users WHERE id = $1 AND role = 'user' AND deleted_at IS NULL",
      [id]
    );
    return rows[0] || null;
  },

  // Registration uniqueness check — only checks active accounts, since a
  // soft-deleted user's mobile/username is intentionally free to reuse (see
  // the partial unique indexes in schema.sql).
  async mobileOrUsernameExists(mobile, username) {
    const [rows] = await pool.query(
      'SELECT id FROM users WHERE (mobile_number = ? OR username = ?) AND deleted_at IS NULL',
      [mobile, username]
    );
    return rows.length > 0;
  },

  // Used by the admin "add profile" form's phone-number check/autofill step:
  // an existing account (any role) is linked to the new profile instead of
  // creating a duplicate. Soft-deleted accounts don't count as "existing".
  async findByMobile(mobile) {
    const [rows] = await pool.query(
      'SELECT id, name, gender, username, role FROM users WHERE mobile_number = ? AND deleted_at IS NULL',
      [mobile]
    );
    return rows[0] || null;
  },

  async create({ name, mobile_number, username, passwordHash, role = 'user', status = 'pending', gender = null }) {
    const [result] = await pool.query(
      `INSERT INTO users (name, mobile_number, username, password, role, status, gender)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [name, mobile_number, username, passwordHash, role, status, gender]
    );
    return result.insertId;
  },

  // Derives a login username from name + gender when the admin's "add
  // profile" flow creates a brand-new account and never collected one
  // explicitly. Retries with a fresh random suffix on the rare collision.
  async generateUniqueUsername(name, gender) {
    const base = String(name || 'member')
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .trim()
      .split(/\s+/)[0] || 'member';
    const genderTag = gender === 'female' ? 'f' : gender === 'male' ? 'm' : '';
    for (let attempt = 0; attempt < 8; attempt++) {
      const suffix = Math.floor(1000 + Math.random() * 9000);
      const candidate = `${base}${genderTag}${suffix}`.slice(0, 50);
      const [rows] = await pool.query(
        'SELECT id FROM users WHERE username = ? AND deleted_at IS NULL',
        [candidate]
      );
      if (rows.length === 0) return candidate;
    }
    // Astronomically unlikely fallback — timestamp guarantees uniqueness.
    return `${base}${genderTag}${Date.now()}`.slice(0, 50);
  },

  async listPending(pagination = {}) {
    const { page, perPage, offset } = normalizePagination(pagination);
    const [[countRows], [rows]] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS total FROM users WHERE status = 'pending' AND role = 'user' AND deleted_at IS NULL"),
      pool.query(
        `SELECT id, name, mobile_number, username, gender, created_at
         FROM users WHERE status = 'pending' AND role = 'user' AND deleted_at IS NULL
         ORDER BY created_at ASC LIMIT ? OFFSET ?`,
        [perPage, offset]
      )
    ]);
    return { rows, ...buildPageMeta(countRows[0].total, page, perPage) };
  },

  // Approved members only — used by the admin "manage users" list (password resets etc).
  async listApprovedUsers(pagination = {}) {
    const { page, perPage, offset } = normalizePagination(pagination);
    const [[countRows], [rows]] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS total FROM users WHERE role = 'user' AND status = 'approved' AND deleted_at IS NULL"),
      pool.query(
        `SELECT id, name, mobile_number, username, gender, status, locked_until, created_at
         FROM users WHERE role = 'user' AND status = 'approved' AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [perPage, offset]
      )
    ]);
    return { rows, ...buildPageMeta(countRows[0].total, page, perPage) };
  },

  async updateStatus(id, status) {
    await pool.query('UPDATE users SET status = $1 WHERE id = $2', [status, id]);
  },

  async updatePassword(id, passwordHash) {
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [passwordHash, id]);
  },

  async listAll({ role } = {}, pagination = {}) {
    const { page, perPage, offset } = normalizePagination(pagination);
    const clauses = ['deleted_at IS NULL'];
    const params = [];
    if (role) {
      clauses.push('role = ?');
      params.push(role);
    }
    const where = `WHERE ${clauses.join(' AND ')}`;
    const [[countRows], [rows]] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM users ${where}`, params),
      pool.query(
        `SELECT id, name, mobile_number, username, role, status, gender, locked_until, created_at
         FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, perPage, offset]
      )
    ]);
    return { rows, ...buildPageMeta(countRows[0].total, page, perPage) };
  },

  // --- Soft delete / Trash ---

  async deleteById(id) {
    await pool.query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [id]);
  },

  async restoreById(id) {
    await pool.query('UPDATE users SET deleted_at = NULL WHERE id = $1', [id]);
  },

  // Only allowed on rows already soft-deleted — a real safety backstop
  // against ever hard-deleting an active account by accident.
  async purgeById(id) {
    await pool.query('DELETE FROM users WHERE id = ? AND deleted_at IS NOT NULL', [id]);
  },

  async listDeleted(pagination = {}) {
    const { page, perPage, offset } = normalizePagination(pagination);
    const [[countRows], [rows]] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS total FROM users WHERE deleted_at IS NOT NULL AND role = 'user'"),
      pool.query(
        `SELECT id, name, mobile_number, username, gender, deleted_at
         FROM users WHERE deleted_at IS NOT NULL AND role = 'user'
         ORDER BY deleted_at DESC LIMIT ? OFFSET ?`,
        [perPage, offset]
      )
    ]);
    return { rows, ...buildPageMeta(countRows[0].total, page, perPage) };
  },

  // --- Account lockout (User + Admin only; Super Admin never locks) ---

  async registerFailedLogin(id) {
  const [rows] = await pool.query(
    `UPDATE users
     SET failed_login_attempts = failed_login_attempts + 1
     WHERE id = $1
     RETURNING failed_login_attempts`,
    [id]
  );

  const attempts = rows[0].failed_login_attempts;
  let locked = false;

  if (attempts >= MAX_FAILED_ATTEMPTS) {
    await pool.query(
      `UPDATE users
       SET locked_until = NOW() + ($1 * INTERVAL '1 minute')
       WHERE id = $2`,
      [LOCKOUT_MINUTES, id]
    );

    locked = true;
  }

  return {
    attempts,
    remaining: Math.max(0, MAX_FAILED_ATTEMPTS - attempts),
    locked,
    lockoutMinutes: LOCKOUT_MINUTES
  };
},
  async clearFailedLogins(id) {
    await pool.query(
  'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
  [id]
);
  },

  // Super Admin action — unlocks immediately, ahead of the automatic window.
  async unlockAccount(id) {
    await pool.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [id]);
  },

  async listLocked() {
  const [rows] = await pool.query(
  `SELECT id, name, username, role, failed_login_attempts, locked_until
   FROM users
   WHERE locked_until IS NOT NULL
     AND locked_until > NOW()
     AND deleted_at IS NULL
   ORDER BY locked_until DESC`
);

return rows;
  },

  async counts() {
   const [rows] = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE role = 'user' AND deleted_at IS NULL)::int AS total_users,
         COUNT(*) FILTER (WHERE role = 'user' AND status = 'pending' AND deleted_at IS NULL)::int AS pending_users,
         COUNT(*) FILTER (WHERE role = 'user' AND status = 'approved' AND deleted_at IS NULL)::int AS approved_users,
         COUNT(*) FILTER (WHERE role = 'admin' AND deleted_at IS NULL)::int AS total_admins
       FROM users`
    );
    return rows[0];
  }
};

module.exports = User;
