const db = require('../config/db');
const storage = require('./storage');

async function scheduleCleanup(bucket, filename, delayMinutes = 1440) {
  if (!filename) return;
  await db.query(
    'INSERT INTO storage_cleanup (bucket,filename,run_after) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ? MINUTE)) ON DUPLICATE KEY UPDATE run_after = VALUES(run_after)',
    [bucket,filename,delayMinutes]);
}
const referenceColumns = {
  profiles: ['profiles', ['image_name', 'image_name_2']],
  biodata: ['profiles', ['biodata_pdf_name']],
  jathaka: ['profiles', ['jathaka_pdf_name']],
  ads: ['advertisements', ['image_name', 'mobile_image_name']]
};
async function cleanupUploads(limit = 50) {
  const [pending] = await db.query('SELECT bucket,filename FROM storage_cleanup WHERE run_after <= UTC_TIMESTAMP(6) ORDER BY run_after LIMIT ?', [limit]);
  const results = { removed: 0, retained: 0, failed: 0 };
  for (const file of pending) {
    try {
      const spec = referenceColumns[file.bucket];
      if (!spec) throw new Error('Unsupported cleanup bucket');
      const [refs] = await db.query('SELECT id FROM ' + spec[0] + ' WHERE ' + spec[1].map(col => col + ' = ?').join(' OR ') + ' LIMIT 1', spec[1].map(() => file.filename));
      if (!refs.length) { await storage.deleteFile(file.bucket, file.filename); results.removed++; }
      else results.retained++;
      await db.query('DELETE FROM storage_cleanup WHERE bucket = ? AND filename = ?', [file.bucket,file.filename]);
    } catch {
      results.failed++;
      await db.query('UPDATE storage_cleanup SET attempts = attempts + 1, run_after = DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 1 HOUR) WHERE bucket = ? AND filename = ?', [file.bucket,file.filename]);
    }
  }
  return results;
}
module.exports = { scheduleCleanup, cleanupUploads };
