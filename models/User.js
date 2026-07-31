const pool = require('../config/db');
const { normalizePagination, buildPageMeta } = require('../utils/pagination');

const User = {
  async findByUsername(username) {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    return rows[0];
  },

  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0];
  },

  async mobileOrUsernameExists(mobile, username) {
    const [rows] = await pool.query(
      'SELECT id FROM users WHERE mobile_number = ? OR username = ?',
      [mobile, username]
    );
    return rows.length > 0;
  },

  async create({ name, mobile_number, username, passwordHash, role = 'user', status = 'pending', gender = null }) {
    const [result] = await pool.query(
      `INSERT INTO users (name, mobile_number, username, password, role, status, gender)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [name, mobile_number, username, passwordHash, role, status, gender]
    );
    return result.insertId;
  },

  async listPending() {
    const [rows] = await pool.query(
      `SELECT id, name, mobile_number, username, gender, created_at
       FROM users WHERE status = 'pending' AND role = 'user' ORDER BY created_at ASC`
    );
    return rows;
  },

  // Approved members only — used by the admin "manage users" list (password resets etc).
  // Paginated (was: no LIMIT, pulled every approved member on every page load).
  async listApprovedUsers(pagination = {}) {
    const { page, perPage, offset } = normalizePagination(pagination);
    const [[countRows], [rows]] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS total FROM users WHERE role = 'user' AND status = 'approved'"),
      pool.query(
        `SELECT id, name, mobile_number, username, gender, status, created_at
         FROM users WHERE role = 'user' AND status = 'approved' ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [perPage, offset]
      )
    ]);
    return { rows, ...buildPageMeta(countRows[0].total, page, perPage) };
  },

  async updateStatus(id, status) {
    await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
  },

  async updatePassword(id, passwordHash) {
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [passwordHash, id]);
  },

  async listAll({ role } = {}) {
    if (role) {
      const [rows] = await pool.query(
        'SELECT id, name, mobile_number, username, role, status, gender, created_at FROM users WHERE role = ? ORDER BY created_at DESC',
        [role]
      );
      return rows;
    }
    const [rows] = await pool.query(
      'SELECT id, name, mobile_number, username, role, status, gender, created_at FROM users ORDER BY created_at DESC'
    );
    return rows;
  },

  async deleteById(id) {
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
  },

  async counts() {
    const [rows] = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE role = 'user')::int AS total_users,
         COUNT(*) FILTER (WHERE role = 'user' AND status = 'pending')::int AS pending_users,
         COUNT(*) FILTER (WHERE role = 'user' AND status = 'approved')::int AS approved_users,
         COUNT(*) FILTER (WHERE role = 'admin')::int AS total_admins
       FROM users`
    );
    return rows[0];
  }
};

module.exports = User;
