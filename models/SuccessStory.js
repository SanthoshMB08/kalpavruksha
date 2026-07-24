const pool = require('../config/db');

const SuccessStory = {
  async listActive() {
    const [rows] = await pool.query(
      'SELECT * FROM success_stories WHERE is_active = TRUE ORDER BY display_order ASC, created_at ASC'
    );
    return rows;
  },

  async listAll() {
    const [rows] = await pool.query(
      'SELECT * FROM success_stories ORDER BY display_order ASC, created_at ASC'
    );
    return rows;
  },

  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM success_stories WHERE id = ?', [id]);
    return rows[0];
  },

  async create({ couple_names, story_text, display_order, created_by }) {
    const [result] = await pool.query(
      `INSERT INTO success_stories (couple_names, story_text, display_order, created_by)
       VALUES (?, ?, ?, ?) RETURNING id`,
      [couple_names, story_text, display_order || 0, created_by || null]
    );
    return result.insertId;
  },

  async update(id, { couple_names, story_text, display_order }) {
    await pool.query(
      'UPDATE success_stories SET couple_names = ?, story_text = ?, display_order = ? WHERE id = ?',
      [couple_names, story_text, display_order || 0, id]
    );
  },

  async toggleActive(id) {
    await pool.query('UPDATE success_stories SET is_active = NOT is_active WHERE id = ?', [id]);
  },

  async deleteById(id) {
    await pool.query('DELETE FROM success_stories WHERE id = ?', [id]);
  }
};

module.exports = SuccessStory;
