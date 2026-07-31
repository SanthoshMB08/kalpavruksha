const pool = require('../config/db');

const Advertisement = {
  // Flips any ad whose expiry has passed over to inactive. Has no placement
  // filter, so calling it from anywhere sweeps the whole table — cheap
  // (indexed on is_active) and safe to call on every read.
  async deactivateExpired() {
    await pool.query(
      `UPDATE advertisements SET is_active = FALSE
       WHERE is_active = TRUE AND expires_at IS NOT NULL AND expires_at <= NOW()`
    );
  },

  async listActiveByPlacement(placement) {
    await Advertisement.deactivateExpired();
    const [rows] = await pool.query(
      `SELECT * FROM advertisements
       WHERE placement = ? AND is_active = TRUE
       ORDER BY created_at DESC LIMIT 1`,
      [placement]
    );
    return rows;
  },

  async listAll() {
    await Advertisement.deactivateExpired();
    const [rows] = await pool.query('SELECT * FROM advertisements ORDER BY created_at DESC');
    return rows;
  },

  // Returns { placementName: [ads...] } for every placement requested, so the
  // home page can fill several ad slots (top banner, mid-page, footer, etc.)
  // with a single round-trip. Each array holds at most one ad — a placement
  // is a single slot, not a rotating list.
  async listActiveGroupedByPlacements(placements) {
    const grouped = {};
    for (const placement of placements) {
      grouped[placement] = await Advertisement.listActiveByPlacement(placement);
    }
    return grouped;
  },

  // A newly-uploaded ad goes live immediately, which means it takes over its
  // placement's single slot — so any ad currently occupying that placement
  // is deactivated first. The partial unique index backs this up at the DB
  // level in case of a race.
  async create({ ad_title, image_name, placement, target_url, expiresAt }) {
    await pool.query(
      'UPDATE advertisements SET is_active = FALSE WHERE placement = ? AND is_active = TRUE',
      [placement]
    );
    const [result] = await pool.query(
      `INSERT INTO advertisements (ad_title, image_name, placement, target_url, expires_at, is_active)
       VALUES (?, ?, ?, ?, ?, TRUE) RETURNING id`,
      [ad_title, image_name, placement, target_url || null, expiresAt]
    );
    return result.insertId;
  },

  // Toggling an ad ON claims its placement's single slot, so any other ad
  // active in that same placement is deactivated first. Throws if the ad's
  // own expiry has already passed — an expired ad can't be turned back on
  // without setting a fresh expiry first.
  async toggleActive(id) {
    const [rows] = await pool.query('SELECT placement, is_active, expires_at FROM advertisements WHERE id = ?', [id]);
    const ad = rows[0];
    if (!ad) return;

    if (ad.is_active) {
      await pool.query('UPDATE advertisements SET is_active = FALSE WHERE id = ?', [id]);
    } else {
      if (ad.expires_at && new Date(ad.expires_at) <= new Date()) {
        const err = new Error('This ad expired and can\'t be reactivated — edit its expiry first.');
        err.code = 'AD_EXPIRED';
        throw err;
      }
      await pool.query(
        'UPDATE advertisements SET is_active = FALSE WHERE placement = ? AND is_active = TRUE AND id <> ?',
        [ad.placement, id]
      );
      await pool.query('UPDATE advertisements SET is_active = TRUE WHERE id = ?', [id]);
    }
  },

  async deleteById(id) {
    await pool.query('DELETE FROM advertisements WHERE id = ?', [id]);
  },

  // Reactivating an EXPIRED ad needs a new expiry date supplied by the admin
  // (see toggleActive's AD_EXPIRED guard above) — this sets that new expiry
  // and activates in one step, claiming the placement's slot the same way
  // toggleActive does.
  async reactivateWithNewExpiry(id, expiresAt) {
    const [rows] = await pool.query('SELECT placement FROM advertisements WHERE id = ?', [id]);
    const ad = rows[0];
    if (!ad) {
      const err = new Error('Ad not found.');
      err.code = 'AD_NOT_FOUND';
      throw err;
    }
    await pool.query(
      'UPDATE advertisements SET is_active = FALSE WHERE placement = ? AND is_active = TRUE AND id <> ?',
      [ad.placement, id]
    );
    await pool.query('UPDATE advertisements SET is_active = TRUE, expires_at = ? WHERE id = ?', [expiresAt, id]);
  }
};

module.exports = Advertisement;
