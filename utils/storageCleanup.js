const db = require('../config/db');
const storage = require('./storage');
const logger = require('./logger');

const CLEANUP_DELAY_MINUTES = 24 * 60;
const referenceColumns = Object.freeze({
  profiles: { table: 'profiles', columns: ['image_name', 'image_name_2'] },
  biodata: { table: 'profiles', columns: ['biodata_pdf_name'] },
  jathaka: { table: 'profiles', columns: ['jathaka_pdf_name'] },
  ads: { table: 'advertisements', columns: ['image_name', 'mobile_image_name'] }
});

async function scheduleCleanup(bucket, filename, delayMinutes = CLEANUP_DELAY_MINUTES) {
  if (!filename) return;
  await db.query(
    `INSERT INTO storage_cleanup (bucket,filename,run_after)
     VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ? MINUTE))
     ON DUPLICATE KEY UPDATE run_after = VALUES(run_after), attempts = 0`,
    [bucket, filename, delayMinutes]
  );
}

async function cancelCleanup(bucket, filenames) {
  const names = [...new Set((filenames || []).filter(Boolean))];
  if (!names.length) return;
  await db.query(
    `DELETE FROM storage_cleanup WHERE bucket = ? AND filename IN (${names.map(() => '?').join(',')})`,
    [bucket, ...names]
  );
}

async function deleteCleanupEntry(bucket, filename) {
  await db.query('DELETE FROM storage_cleanup WHERE bucket = ? AND filename = ?', [bucket, filename]);
}

async function rescheduleForProfileDeletion(filename, profileId) {
  await db.query(
    `UPDATE storage_cleanup
     SET run_after = (
       SELECT DATE_ADD(deleted_at, INTERVAL 1 DAY) FROM profiles WHERE id = ?
     )
     WHERE bucket IN ('profiles','biodata','jathaka') AND filename = ?`,
    [profileId, filename]
  );
}

async function purgeExpiredProfiles(limit) {
  const [profiles] = await db.query(
    `SELECT id, image_name, image_name_2, biodata_pdf_name, jathaka_pdf_name
     FROM profiles
     WHERE deleted_at <= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 DAY)
     ORDER BY deleted_at, id
     LIMIT ?`,
    [limit]
  );
  let purged = 0;
  for (const profile of profiles) {
    try {
      const removed = await db.transaction(async () => {
        const [rows] = await db.query(
          `SELECT id, image_name, image_name_2, biodata_pdf_name, jathaka_pdf_name
           FROM profiles
           WHERE id = ? AND deleted_at <= DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 DAY)
           FOR UPDATE`,
          [profile.id]
        );
        if (!rows.length) return false;
        const current = rows[0];
        for (const filename of [current.image_name, current.image_name_2]) {
          await scheduleCleanup('profiles', filename, 0);
        }
        await scheduleCleanup('biodata', current.biodata_pdf_name, 0);
        await scheduleCleanup('jathaka', current.jathaka_pdf_name, 0);
        const [result] = await db.query(
          'DELETE FROM profiles WHERE id = ? AND deleted_at IS NOT NULL',
          [current.id]
        );
        return Boolean(result.affectedRows);
      });
      if (removed) purged++;
    } catch (err) {
      logger.error({ err, profileId: profile.id }, 'Expired profile purge failed; it will be retried');
    }
  }
  return purged;
}

async function resolveReferences(bucket, filename) {
  if (bucket === 'profiles' || bucket === 'biodata' || bucket === 'jathaka') {
    const { columns } = referenceColumns[bucket];
    const [active] = await db.query(
      `SELECT id FROM profiles
       WHERE deleted_at IS NULL AND (${columns.map(column => `${column} = ?`).join(' OR ')})
       LIMIT 1`,
      columns.map(() => filename)
    );
    if (active.length) return 'retained';

    const [deleted] = await db.query(
      `SELECT id, deleted_at FROM profiles
       WHERE deleted_at IS NOT NULL AND (${columns.map(column => `${column} = ?`).join(' OR ')})
       ORDER BY deleted_at LIMIT 1`,
      columns.map(() => filename)
    );
    if (!deleted.length) return 'unreferenced';

    await rescheduleForProfileDeletion(filename, deleted[0].id);
    return 'deferred';
  }

  if (bucket === 'ads') {
    const [active] = await db.query(
      'SELECT id FROM advertisements WHERE is_active = TRUE AND (image_name = ? OR mobile_image_name = ?) LIMIT 1',
      [filename, filename]
    );
    if (active.length) return 'retained';

    const [inactive] = await db.query(
      'SELECT id FROM advertisements WHERE is_active = FALSE AND (image_name = ? OR mobile_image_name = ?) LIMIT 1',
      [filename, filename]
    );
    if (!inactive.length) return 'unreferenced';

    const [deleted] = await db.query(
      'DELETE FROM advertisements WHERE id = ? AND is_active = FALSE',
      [inactive[0].id]
    );
    if (!deleted.affectedRows) return 'retained';
    return 'unreferenced';
  }

  const spec = referenceColumns[bucket];
  if (!spec) throw new Error(`Unsupported cleanup bucket: ${bucket}`);
  const [refs] = await db.query(
    `SELECT id FROM ${spec.table} WHERE ${spec.columns.map(column => `${column} = ?`).join(' OR ')} LIMIT 1`,
    spec.columns.map(() => filename)
  );
  return refs.length ? 'retained' : 'unreferenced';
}

async function cleanupUploads(limit = 50) {
  const connection = await db.pool.getConnection();
  let locked = false;
  try {
    const [lockRows] = await connection.query("SELECT GET_LOCK('kalpavruksha_storage_cleanup', 0) AS acquired");
    if (Number(lockRows[0].acquired) !== 1) {
      return { removed: 0, retained: 0, failed: 0, skipped: true };
    }
    locked = true;

    await purgeExpiredProfiles(limit);
    const [pending] = await db.query(
      'SELECT bucket,filename FROM storage_cleanup WHERE run_after <= UTC_TIMESTAMP(6) ORDER BY run_after LIMIT ?',
      [limit]
    );
    const results = { removed: 0, retained: 0, failed: 0 };

    for (const file of pending) {
      try {
        const status = await resolveReferences(file.bucket, file.filename);
        if (status === 'retained') {
          await deleteCleanupEntry(file.bucket, file.filename);
          results.retained++;
          continue;
        }
        if (status === 'deferred') {
          results.retained++;
          continue;
        }

        await storage.deleteFile(file.bucket, file.filename);
        await deleteCleanupEntry(file.bucket, file.filename);
        results.removed++;
      } catch (err) {
        logger.error({ err, bucket: file.bucket, filename: file.filename }, 'Stored file cleanup failed; retrying later');
        results.failed++;
        await db.query(
          `UPDATE storage_cleanup
           SET attempts = attempts + 1, run_after = DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 1 HOUR)
           WHERE bucket = ? AND filename = ?`,
          [file.bucket, file.filename]
        );
      }
    }
    return results;
  } finally {
    if (locked) {
      try {
        await connection.query("SELECT RELEASE_LOCK('kalpavruksha_storage_cleanup')");
      } finally {
        connection.release();
      }
    } else {
      connection.release();
    }
  }
}

module.exports = { scheduleCleanup, cancelCleanup, cleanupUploads };
