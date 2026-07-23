const pool = require('../config/db');

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

  async create({ name, mobile_number, username, passwordHash, role = 'user', status = 'pending' }) {
    const [result] = await pool.query(
      `INSERT INTO users (name, mobile_number, username, password, role, status)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      [name, mobile_number, username, passwordHash, role, status]
    );
    return result.insertId;
  },

  async listPending() {
    const [rows] = await pool.query(
      `SELECT id, name, mobile_number, username, created_at
       FROM users WHERE status = 'pending' AND role = 'user' ORDER BY created_at ASC`
    );
    return rows;
  },

  async updateStatus(id, status) {
    await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
  },

  async listAll({ role } = {}) {
    if (role) {
      const [rows] = await pool.query(
        'SELECT id, name, mobile_number, username, role, status, created_at FROM users WHERE role = ? ORDER BY created_at DESC',
        [role]
      );
      return rows;
    }
    const [rows] = await pool.query(
      'SELECT id, name, mobile_number, username, role, status, created_at FROM users ORDER BY created_at DESC'
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
