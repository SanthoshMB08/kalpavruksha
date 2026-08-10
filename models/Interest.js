const pool = require('../config/db');
const { normalizePagination, buildPageMeta } = require('../utils/pagination');

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

  async listSavedByUser(userId, pagination = {}) {
    const { page, perPage, offset } = normalizePagination(pagination);
    const [[countRows], [rows]] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM interests WHERE user_id = ? AND is_saved = TRUE', [userId]),
      pool.query(
        `SELECT p.id, p.full_name, p.image_name, p.caste, p.subcaste, p.language,
                p.occupation,
                DATE_PART('year', AGE(CURRENT_DATE, p.date_of_birth)) AS age,
                i.saved_at
         FROM interests i JOIN profiles p ON p.id = i.profile_id
         WHERE i.user_id = ? AND i.is_saved = TRUE ORDER BY i.saved_at DESC LIMIT ? OFFSET ?`,
        [userId, perPage, offset]
      )
    ]);
    return { rows, ...buildPageMeta(countRows[0].total, page, perPage) };
  },

  async countSavedByUser(userId) {
    const [rows] = await pool.query('SELECT COUNT(*)::int AS total FROM interests WHERE user_id = ? AND is_saved = TRUE', [userId]);
    return rows[0].total;
  },

  async listInterestedByUser(userId, pagination = {}) {
    const { page, perPage, offset } = normalizePagination(pagination);
    const [[countRows], [rows]] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM interests WHERE user_id = ? AND is_interested = TRUE', [userId]),
      pool.query(
        `SELECT p.id, p.full_name, p.image_name, p.caste, p.subcaste, p.language,
                p.occupation,
                DATE_PART('year', AGE(CURRENT_DATE, p.date_of_birth)) AS age,
                i.interested_at
         FROM interests i JOIN profiles p ON p.id = i.profile_id
         WHERE i.user_id = ? AND i.is_interested = TRUE ORDER BY i.interested_at DESC LIMIT ? OFFSET ?`,
        [userId, perPage, offset]
      )
    ]);
    return { rows, ...buildPageMeta(countRows[0].total, page, perPage) };
  },

  async countInterestedByUser(userId) {
    const [rows] = await pool.query('SELECT COUNT(*)::int AS total FROM interests WHERE user_id = ? AND is_interested = TRUE', [userId]);
    return rows[0].total;
  },

  // Recent "Express Interest" activity for the admin activity stream.
  // Paginated (offset/limit) so it can back both the dashboard panel and the
  // scrollable top notification tab.
  async recentExpressed(limit = 20, offset = 0) {
    const [rows] = await pool.query(
      `SELECT i.id, i.interested_at AS created_at, u.name AS user_name, u.mobile_number AS user_mobile,
              p.id AS profile_id, p.full_name AS profile_name, p.phone_number AS profile_phone
       FROM interests i
       JOIN users u ON u.id = i.user_id
       JOIN profiles p ON p.id = i.profile_id
       WHERE i.is_interested = TRUE
       ORDER BY i.interested_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    return rows;
  },

  // Count of interests expressed in the last 24 hours — powers the badge
  // count on the notification bell.
  async countRecent(hours = 24) {
    const [rows] = await pool.query(
      `SELECT COUNT(*)::int AS count FROM interests
       WHERE is_interested = TRUE AND interested_at > NOW() - (?::text || ' hours')::interval`,
      [hours]
    );
    return rows[0].count;
  }
};

module.exports = Interest;
