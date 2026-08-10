const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

if (process.env.NODE_ENV !== 'test') {
  // Hard stop — this module truncates tables. Never let it run against
  // anything but a real test environment, even if someone imports it by
  // mistake from a non-test script.
  throw new Error('tests/helpers/db.js was loaded outside NODE_ENV=test — refusing to run.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: true }
});

// Applies the exact same schema.sql the app ships with — so tests run
// against the real production schema, not a hand-maintained test-only copy
// that could silently drift out of sync.
async function applySchema() {
  const schemaSql = fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', 'schema.sql'), 'utf8');
  await pool.query(schemaSql);
  // In production, connect-pg-simple creates this table lazily on the app's
  // first request (createTableIfMissing: true). Tests need it to exist
  // before that ever happens, since resetTables() truncates it on every
  // beforeEach — so it's created explicitly here, matching the exact schema
  // connect-pg-simple itself would create.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS session (
      sid VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
      sess JSON NOT NULL,
      expire TIMESTAMP(6) NOT NULL
    );
    CREATE INDEX IF NOT EXISTS session_expire_idx ON session (expire);
  `);
}

// Wipes all app tables between test files, but leaves the schema itself
// intact (no need to re-run migrations for every file). RESTART IDENTITY
// resets auto-increment IDs too, so tests can assert on predictable IDs.
// Also re-seeds the Super Admin account every time, since it lives in the
// same `users` table that gets truncated — mirroring how a real deployment
// always has one (via migrations/seed.js) before the app ever serves traffic.
async function resetTables() {
  await pool.query(`
    TRUNCATE TABLE
      interests, contact_messages, success_stories, advertisements,
      profiles, users, session
    RESTART IDENTITY CASCADE
  `);
  const passwordHash = await bcrypt.hash(process.env.SUPERADMIN_PASSWORD, 4); // low cost — speed, not production security
  await pool.query(
    `INSERT INTO users (name, mobile_number, username, password, role, status)
     VALUES ('Super Admin', $1, $2, $3, 'superadmin', 'approved')`,
    [process.env.SUPERADMIN_MOBILE, process.env.SUPERADMIN_USERNAME, passwordHash]
  );
}

async function closePool() {
  await pool.end();
}

module.exports = { pool, applySchema, resetTables, closePool };
