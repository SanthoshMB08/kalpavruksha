const { Pool, types } = require('pg');
const fs = require('fs');
require('dotenv').config();
const logger = require('../utils/logger');

// The app was originally written against mysql2, which (with dateStrings:true)
// returns DATE/TIME/TIMESTAMP columns as plain strings like "1995-06-15".
// node-postgres returns JS Date objects for those OIDs by default, which would
// break the EJS views that print date_of_birth / time_of_birth directly.
// Registering identity parsers keeps the exact same "plain string" behavior.
types.setTypeParser(1082, (val) => val); // date
types.setTypeParser(1083, (val) => val); // time
types.setTypeParser(1114, (val) => val); // timestamp without time zone
types.setTypeParser(1184, (val) => val); // timestamptz
types.setTypeParser(1266, (val) => val); // timetz

if (!process.env.DATABASE_URL) {
  logger.warn('DATABASE_URL is not set. Set it to your Postgres connection string in .env');
}

// Verify database certificates by default. Private CAs should use DB_SSL_CA_PATH.
function buildSslConfig() {
  if (process.env.DB_SSL === 'false') return false;
  if (process.env.NODE_ENV === 'production' && process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false') {
    throw new Error('Disabling Postgres certificate verification is not allowed in production; configure DB_SSL_CA_PATH.');
  }
  const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
  return process.env.DB_SSL_CA_PATH
    ? { rejectUnauthorized, ca: fs.readFileSync(process.env.DB_SSL_CA_PATH, 'utf8') }
    : { rejectUnauthorized };
}

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildSslConfig(),
  max: 20, // max simultaneous connections in the pool
  idleTimeoutMillis: 30000, // close idle connections after 30s
  connectionTimeoutMillis: 5000, // fail fast if the DB is unreachable, rather than hanging
  statement_timeout: 15000 // kill any single query that runs over 15s instead of blocking the pool indefinitely
});

pgPool.on('error', (err) => {
  logger.error({ err }, 'Unexpected Postgres pool error');
});

// Converts mysql-style '?' positional placeholders to Postgres-style $1, $2, ...
function toPgPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// mysql2/promise-compatible query wrapper: models throughout this app do
//   const [rows] = await pool.query('SELECT ...', [params]);
//   const [result] = await pool.query('INSERT ... RETURNING id', [params]);
//   result.insertId
// This wrapper preserves that call shape on top of node-postgres, so model
// files only needed their SQL text updated (RETURNING id, function names),
// not their call sites.
async function query(sql, params = []) {
  const text = toPgPlaceholders(sql);
  const result = await pgPool.query(text, params);


  
  const rows = result.rows;
  if (/^\s*INSERT/i.test(sql) && rows.length && Object.prototype.hasOwnProperty.call(rows[0], 'id')) {
    rows.insertId = rows[0].id;
  }
  return [rows, result.fields];
}

module.exports = { query, pool: pgPool };
