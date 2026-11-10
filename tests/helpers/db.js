const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
if (process.env.NODE_ENV !== 'test') throw new Error('Integration tests require NODE_ENV=test.');
const database = process.env.DATABASE_URL ? decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)) : process.env.DB_NAME;
if (!database || !database.endsWith('_test')) throw new Error('Refusing destructive tests outside a dedicated _test database.');
const { pool } = require('../../config/db');
async function applySchema() {
  const sql = fs.readFileSync(path.join(__dirname, '../../migrations/schema.sql'), 'utf8').replace(/^--.*$/gm, '');
  for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await pool.query(statement);
}
async function resetTables() {
  const connection = await pool.getConnection();
  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of ['interests','contact_messages','success_stories','advertisements','profiles','users','session','storage_cleanup']) {
      await connection.query('TRUNCATE TABLE ' + table);
    }
  } finally {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    connection.release();
  }
  const hash = await bcrypt.hash(process.env.SUPERADMIN_PASSWORD, 4);
  await pool.execute("INSERT INTO users (name,mobile_number,username,password,role,status) VALUES ('Super Admin',?,?,?,'superadmin','approved')",
    [process.env.SUPERADMIN_MOBILE,process.env.SUPERADMIN_USERNAME,hash]);
}
async function closePool() { await pool.end(); }
module.exports = { pool, applySchema, resetTables, closePool };
