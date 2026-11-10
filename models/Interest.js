const pool = require('../config/db');
const { normalizePagination, buildPageMeta } = require('../utils/pagination');

const Interest = {
  async markSaved(userId, profileId) {
    const [result] = await pool.query('INSERT INTO interests (user_id,profile_id,is_saved,saved_at) VALUES (?,?,TRUE,UTC_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), saved_at=IF(is_saved=TRUE,saved_at,UTC_TIMESTAMP(6)), is_saved=TRUE', [userId,profileId]);
    return result.insertId;
  },
  async markUnsaved(userId, profileId) {
    await pool.query('UPDATE interests SET is_saved=FALSE,saved_at=NULL WHERE user_id=? AND profile_id=?', [userId,profileId]);
  },
  async markInterested(userId, profileId) {
    const [result] = await pool.query('INSERT INTO interests (user_id,profile_id,is_interested,interested_at) VALUES (?,?,TRUE,UTC_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), interested_at=IF(is_interested=TRUE,interested_at,UTC_TIMESTAMP(6)), is_interested=TRUE', [userId,profileId]);
    return result.insertId;
  },
  async markNotInterested(userId, profileId) {
    await pool.query('UPDATE interests SET is_interested=FALSE,interested_at=NULL WHERE user_id=? AND profile_id=?', [userId,profileId]);
  },
  async statesByUser(userId) {
    const [rows] = await pool.query('SELECT profile_id,is_saved,is_interested FROM interests WHERE user_id = ?', [userId]);
    return Object.fromEntries(rows.map(row => [String(row.profile_id), row]));
  },
  async listSavedByUser(userId, pagination = {}) {
    const { page, perPage, offset } = normalizePagination(pagination);
    const [[countRows], [rows]] = await Promise.all([
      pool.query("SELECT COUNT(*) AS total FROM interests i JOIN profiles p ON p.id=i.profile_id WHERE i.user_id = ? AND i.is_saved = TRUE AND p.deleted_at IS NULL AND p.marital_status <> 'married'", [userId]),
      pool.query(
        `SELECT p.id, p.full_name, p.image_name, p.caste, p.subcaste, p.language,
                p.occupation,
                TIMESTAMPDIFF(YEAR, p.date_of_birth, CURRENT_DATE) AS age,
                i.saved_at
         FROM interests i JOIN profiles p ON p.id = i.profile_id
         WHERE i.user_id = ? AND i.is_saved = TRUE AND p.deleted_at IS NULL AND p.marital_status <> 'married' ORDER BY i.saved_at DESC, i.id DESC LIMIT ? OFFSET ?`,
        [userId, perPage, offset]
      )
    ]);
    return { rows, ...buildPageMeta(countRows[0].total, page, perPage) };
  },

  async countSavedByUser(userId) {
    const [rows] = await pool.query("SELECT COUNT(*) AS total FROM interests i JOIN profiles p ON p.id=i.profile_id WHERE i.user_id = ? AND i.is_saved = TRUE AND p.deleted_at IS NULL AND p.marital_status <> 'married'", [userId]);
    return rows[0].total;
  },

  async listInterestedByUser(userId, pagination = {}) {
    const { page, perPage, offset } = normalizePagination(pagination);
    const [[countRows], [rows]] = await Promise.all([
      pool.query("SELECT COUNT(*) AS total FROM interests i JOIN profiles p ON p.id=i.profile_id WHERE i.user_id = ? AND i.is_interested = TRUE AND p.deleted_at IS NULL AND p.marital_status <> 'married'", [userId]),
      pool.query(
        `SELECT p.id, p.full_name, p.image_name, p.caste, p.subcaste, p.language,
                p.occupation,
                TIMESTAMPDIFF(YEAR, p.date_of_birth, CURRENT_DATE) AS age,
                i.interested_at
         FROM interests i JOIN profiles p ON p.id = i.profile_id
         WHERE i.user_id = ? AND i.is_interested = TRUE AND p.deleted_at IS NULL AND p.marital_status <> 'married' ORDER BY i.interested_at DESC, i.id DESC LIMIT ? OFFSET ?`,
        [userId, perPage, offset]
      )
    ]);
    return { rows, ...buildPageMeta(countRows[0].total, page, perPage) };
  },

  async countInterestedByUser(userId) {
    const [rows] = await pool.query("SELECT COUNT(*) AS total FROM interests i JOIN profiles p ON p.id=i.profile_id WHERE i.user_id = ? AND i.is_interested = TRUE AND p.deleted_at IS NULL AND p.marital_status <> 'married'", [userId]);
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
      `SELECT COUNT(*) AS count FROM interests
       WHERE is_interested = TRUE AND interested_at > DATE_SUB(UTC_TIMESTAMP(6), INTERVAL ? HOUR)`,
      [hours]
    );
    return rows[0].count;
  }
};

module.exports = Interest;
