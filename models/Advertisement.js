const pool = require('../config/db');

const Advertisement = {
  async listActiveByPlacement(placement) {
    const [rows] = await pool.query(
      'SELECT * FROM advertisements WHERE placement = ? AND is_active = TRUE ORDER BY created_at DESC',
      [placement]
    );
    return rows;
  },

  async listAll() {
    const [rows] = await pool.query('SELECT * FROM advertisements ORDER BY created_at DESC');
    return rows;
  },

  async create({ ad_title, image_name, placement, target_url }) {
    const [result] = await pool.query(
      `INSERT INTO advertisements (ad_title, image_name, placement, target_url, is_active)
       VALUES (?, ?, ?, ?, TRUE) RETURNING id`,
      [ad_title, image_name, placement, target_url || null]
    );
    return result.insertId;
  },

  async toggleActive(id) {
    await pool.query('UPDATE advertisements SET is_active = NOT is_active WHERE id = ?', [id]);
  },

  async deleteById(id) {
    await pool.query('DELETE FROM advertisements WHERE id = ?', [id]);
  }
};

module.exports = Advertisement;
