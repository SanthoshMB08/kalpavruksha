const mysql = require('mysql2');
const fs = require('fs');
const { AsyncLocalStorage } = require('async_hooks');
require('dotenv').config();
const logger = require('../utils/logger');

function connectionOptions(env = process.env) {
  let credentials;
  if (env.DATABASE_URL) {
    const url = new URL(env.DATABASE_URL);
    if (!['mysql:', 'mariadb:'].includes(url.protocol)) {
      throw new Error('DATABASE_URL must use mysql:// or mariadb://. Import migrations/schema.sql into a new Hostinger database first.');
    }
    credentials = { host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password), database: decodeURIComponent(url.pathname.slice(1)) };
  } else {
    credentials = { host: env.DB_HOST || '127.0.0.1', port: Number(env.DB_PORT || 3306),
      user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME };
  }
  if (!credentials.user || !credentials.database) throw new Error('Set DB_USER and DB_NAME, or a MySQL DATABASE_URL.');
  const local = ['127.0.0.1', 'localhost', '::1'].includes(credentials.host);
  const useTls = env.DB_SSL === 'true' || (env.DB_SSL !== 'false' && !local);
  if (!local && env.NODE_ENV === 'production' && !useTls) throw new Error('Remote production database connections require TLS.');
  const ssl = useTls ? { rejectUnauthorized: true,
    ...(env.DB_SSL_CA_PATH ? { ca: fs.readFileSync(env.DB_SSL_CA_PATH, 'utf8') } : {}) } : undefined;
  return { ...credentials, ssl, charset: 'utf8mb4_unicode_ci', timezone: 'Z',
    supportBigNumbers: true, bigNumberStrings: true, decimalNumbers: false,
    waitForConnections: true, connectionLimit: Number(env.DB_POOL_SIZE || 10),
    queueLimit: 100, connectTimeout: 10000, enableKeepAlive: true, multipleStatements: false,
    dateStrings: true
  };
}

const rawPool = mysql.createPool(connectionOptions());
rawPool.on('connection', connection => {
  // This command is queued before the connection is handed to application work.
  connection.query("SET time_zone = '+00:00'");
});
rawPool.on('error', err => logger.error({ err }, 'MySQL pool error'));
const pool = rawPool.promise();
const context = new AsyncLocalStorage();

async function query(sql, params = []) {
  const [rows,fields] = await (context.getStore() || pool).execute(sql, params);
  if (Array.isArray(rows)) for (const row of rows) for (const field of fields) {
    const value = row[field.name];
    if (value === null) continue;
    if (field.columnType === 1 && field.columnLength === 1) row[field.name] = Boolean(Number(value));
    else if ([7,12].includes(field.columnType) && typeof value === 'string') row[field.name] = value.replace(' ', 'T') + 'Z';
    else if (/^(count|total|total_users|pending_users|approved_users|total_admins)$/.test(field.name)) row[field.name] = Number(value);
  }
  return [rows,fields];
}
async function transaction(work) {
  if (context.getStore()) return work();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await context.run(connection, work);
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}
module.exports = { query, transaction, pool, connectionOptions };
