const pool = require('../config/db');

const Interest = {
  // Marks a profile as "saved" for a user without touching is_interested.
  async markSaved(userId, profileId) {
    const [existing] = await pool.query(
      'SELECT id FROM interests WHERE user_id = ? AND profile_id = ?',
      [userId, profileId]
    );
    if (existing.length > 0) {
      await pool.query(
        'UPDATE interests SET is_saved = TRUE, saved_at = CURRENT_TIMESTAMP WHERE id = ?',
        [existing[0].id]
      );
      return existing[0].id;
    }
    const [result] = await pool.query(
      `INSERT INTO interests (user_id, profile_id, is_saved, saved_at)
       VALUES (?, ?, TRUE, CURRENT_TIMESTAMP) RETURNING id`,
      [userId, profileId]
    );
    return result.insertId;
  },

  // Marks "Express Interest" for a user without touching is_saved.
  async markInterested(userId, profileId) {
    const [existing] = await pool.query(
      'SELECT id FROM interests WHERE user_id = ? AND profile_id = ?',
      [userId, profileId]
    );
    if (existing.length > 0) {
      await pool.query(
        'UPDATE interests SET is_interested = TRUE, interested_at = CURRENT_TIMESTAMP WHERE id = ?',
        [existing[0].id]
      );
      return existing[0].id;
    }
    const [result] = await pool.query(
      `INSERT INTO interests (user_id, profile_id, is_interested, interested_at)
       VALUES (?, ?, TRUE, CURRENT_TIMESTAMP) RETURNING id`,
      [userId, profileId]
    );
    return result.insertId;
  },

  async listSavedByUser(userId) {
    const [rows] = await pool.query(
      `SELECT p.id, p.full_name, p.image_name, p.caste, p.subcaste, p.language,
              p.occupation, p.annual_salary,
              DATE_PART('year', AGE(CURRENT_DATE, p.date_of_birth)) AS age,
              i.saved_at
       FROM interests i JOIN profiles p ON p.id = i.profile_id
       WHERE i.user_id = ? AND i.is_saved = TRUE ORDER BY i.saved_at DESC`,
      [userId]
    );
    return rows;
  },

  async listInterestedByUser(userId) {
    const [rows] = await pool.query(
      `SELECT p.id, p.full_name, p.image_name, p.caste, p.subcaste, p.language,
              p.occupation, p.annual_salary,
              DATE_PART('year', AGE(CURRENT_DATE, p.date_of_birth)) AS age,
              i.interested_at
       FROM interests i JOIN profiles p ON p.id = i.profile_id
       WHERE i.user_id = ? AND i.is_interested = TRUE ORDER BY i.interested_at DESC`,
      [userId]
    );
    return rows;
  },

  // Recent "Express Interest" activity for the admin activity stream.
  async recentExpressed(limit = 20) {
    const [rows] = await pool.query(
      `SELECT i.id, i.interested_at AS created_at, u.name AS user_name, u.mobile_number AS user_mobile,
              p.full_name AS profile_name, p.phone_number AS profile_phone
       FROM interests i
       JOIN users u ON u.id = i.user_id
       JOIN profiles p ON p.id = i.profile_id
       WHERE i.is_interested = TRUE
       ORDER BY i.interested_at DESC LIMIT ?`,
      [limit]
    );
    return rows;
  }
};

module.exports = Interest;
