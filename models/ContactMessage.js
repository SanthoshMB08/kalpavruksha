const pool = require('../config/db');

const ContactMessage = {
  async create({ name, mobile, message }) {
    const [result] = await pool.query(
      'INSERT INTO contact_messages (name, mobile, message) VALUES (?, ?, ?)',
      [name, mobile, message]
    );
    return result.insertId;
  },

  async listAll() {
    const [rows] = await pool.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
    return rows;
  },

  async markRead(id) {
    await pool.query('UPDATE contact_messages SET is_read = TRUE WHERE id = ?', [id]);
  },

  async deleteById(id) {
    await pool.query('DELETE FROM contact_messages WHERE id = ?', [id]);
  },

  async countUnread() {
    const [rows] = await pool.query('SELECT COUNT(*) AS count FROM contact_messages WHERE is_read = FALSE');
    return rows[0].count;
  }
};

module.exports = ContactMessage;
