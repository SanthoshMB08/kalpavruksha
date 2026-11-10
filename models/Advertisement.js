const db = require('../config/db');
const { scheduleCleanup } = require('../utils/storageCleanup');
const { AD_PLACEMENTS } = require('../utils/adPlacements');

async function lockPlacement(placement) {
  if (!AD_PLACEMENTS[placement]) throw new Error('Invalid advertisement placement.');
  await db.query('SELECT placement FROM ad_placements WHERE placement = ? FOR UPDATE', [placement]);
}
function adError(code, message) { return Object.assign(new Error(message), { code }); }
async function lockedAd(id) {
  const [found] = await db.query('SELECT placement FROM advertisements WHERE id = ?', [id]);
  if (!found[0]) throw adError('AD_NOT_FOUND', 'Advertisement not found.');
  await lockPlacement(found[0].placement);
  const [rows] = await db.query('SELECT * FROM advertisements WHERE id = ? FOR UPDATE', [id]);
  if (!rows[0]) throw adError('AD_NOT_FOUND', 'Advertisement not found.');
  return rows[0];
}
async function retireSlot(placement) {
  await db.query('UPDATE advertisements SET is_active = FALSE WHERE placement = ? AND is_active = TRUE', [placement]);
}

const Advertisement = {
  async listActiveByPlacement(placement) {
    return (await Advertisement.listActiveGroupedByPlacements([placement]))[placement] || [];
  },
  async listActiveGroupedByPlacements(placements) {
    const keys = [...new Set(placements)].filter(key => AD_PLACEMENTS[key]);
    const grouped = Object.fromEntries(keys.map(key => [key, []]));
    if (!keys.length) return grouped;
    const [rows] = await db.query(
      'SELECT * FROM advertisements WHERE placement IN (' + keys.map(() => '?').join(',') +
      ') AND is_active = TRUE AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP(6)) ORDER BY created_at DESC, id DESC', keys);
    for (const row of rows) if (!grouped[row.placement].length) grouped[row.placement].push(row);
    return grouped;
  },
  async listAll() {
    const [rows] = await db.query('SELECT * FROM advertisements ORDER BY created_at DESC, id DESC');
    return rows;
  },
  async create({ ad_title, image_name, mobile_image_name = null, placement, target_url, expiresAt }) {
    return db.transaction(async () => {
      await lockPlacement(placement);
      if (!(expiresAt instanceof Date) || !Number.isFinite(+expiresAt) || expiresAt <= new Date()) {
        throw adError('AD_EXPIRED', 'Expiry must be a valid date/time in the future.');
      }
      await retireSlot(placement);
      const [result] = await db.query(
        'INSERT INTO advertisements (ad_title,image_name,mobile_image_name,placement,target_url,expires_at,is_active) VALUES (?,?,?,?,?,?,TRUE)',
        [ad_title, image_name, mobile_image_name, placement, target_url || null, expiresAt]);
      return result.insertId;
    });
  },
  async toggleActive(id) {
    return db.transaction(async () => {
      const ad = await lockedAd(id);
      if (ad.is_active) {
        await db.query('UPDATE advertisements SET is_active = FALSE WHERE id = ?', [id]);
      } else {
        if (ad.expires_at && new Date(ad.expires_at) <= new Date()) {
          throw adError('AD_EXPIRED', 'This advertisement has expired. Set a new expiry to activate it.');
        }
        await retireSlot(ad.placement);
        await db.query('UPDATE advertisements SET is_active = TRUE WHERE id = ?', [id]);
      }
    });
  },
  async reactivateWithNewExpiry(id, expiresAt) {
    return db.transaction(async () => {
      const ad = await lockedAd(id);
      if (!(expiresAt instanceof Date) || !Number.isFinite(+expiresAt) || expiresAt <= new Date()) {
        throw adError('AD_EXPIRED', 'Expiry must be a valid date/time in the future.');
      }
      await retireSlot(ad.placement);
      await db.query('UPDATE advertisements SET is_active = TRUE, expires_at = ? WHERE id = ?', [expiresAt, id]);
    });
  },
  async deleteById(id) {
    return db.transaction(async () => {
      const ad = await lockedAd(id);
      await scheduleCleanup('ads', ad.image_name, 0);
      await scheduleCleanup('ads', ad.mobile_image_name, 0);
      await db.query('DELETE FROM advertisements WHERE id = ?', [id]);
    });
  }
};
module.exports = Advertisement;
