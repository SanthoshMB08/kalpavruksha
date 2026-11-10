// One-time transfer tool. PostgreSQL is a development-only dependency.
require('dotenv').config();
const fs = require('fs');
const { createHash } = require('crypto');
const TABLES = require('../migrations/source-columns.json');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function exportPostgres(filename) {
  if (!process.env.SOURCE_DATABASE_URL) throw new Error('Set SOURCE_DATABASE_URL to the PostgreSQL source.');
  const { Client, types } = require('pg');
  for (const oid of [1082,1083,1114,1184]) types.setTypeParser(oid, value => value);
  const url = new URL(process.env.SOURCE_DATABASE_URL);
  const local = ['localhost','127.0.0.1','::1'].includes(url.hostname);
  const source = new Client({ connectionString:process.env.SOURCE_DATABASE_URL,
    ssl:local ? false : { rejectUnauthorized:true, ...(process.env.SOURCE_DB_SSL_CA_PATH ? {ca:fs.readFileSync(process.env.SOURCE_DB_SSL_CA_PATH,'utf8')} : {}) } });
  await source.connect();
  try {
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await source.query("SET LOCAL TIME ZONE 'UTC'");
    const data={};
    for(const [table,columns] of Object.entries(TABLES)) {
      data[table]=(await source.query('SELECT '+columns.join(',')+' FROM '+table+' ORDER BY id')).rows;
    }
    await source.query('COMMIT');
    const result={format:1,exportedAt:new Date().toISOString(),checksum:digest(data),data};
    fs.writeFileSync(filename,JSON.stringify(result),{flag:'wx',mode:0o600});
    console.log('Exported consistent snapshot: '+Object.entries(data).map(([t,r])=>t+'='+r.length).join(', '));
  } catch(error) {
    await source.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally { await source.end(); }
}
function mysqlValue(column,value) {
  if (value === undefined || value === null) return null;
  if (/_at$/.test(column) || column === 'locked_until') {
    // Export is explicitly UTC; preserve six fractional digits rather than
    // converting via JS Date (which would discard microseconds).
    return String(value).replace('T',' ').replace(/(?:Z|\+00(?::00)?)$/,'');
  }
  return value;
}
async function importMysql(filename) {
  const snapshot=JSON.parse(fs.readFileSync(filename,'utf8'));
  if(snapshot.format!==1 || snapshot.checksum!==digest(snapshot.data)) throw new Error('Invalid snapshot format/checksum.');
  for(const table of Object.keys(TABLES)) if(!Array.isArray(snapshot.data[table])) throw new Error('Missing source table: '+table);
  const db=require('../config/db');
  try {
    await db.transaction(async()=>{
      for(const table of Object.keys(TABLES)) {
        const [rows]=await db.query('SELECT id FROM '+table+' LIMIT 1');
        if(rows.length)throw new Error('Import requires empty application tables. Refusing to overwrite '+table+'.');
      }
      for(const [table,columns] of Object.entries(TABLES)) {
        const sql='INSERT INTO '+table+' ('+columns.join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')';
        for(const row of snapshot.data[table]) {
          if(!row.id)throw new Error('Source row missing ID.');
          await db.query(sql,columns.map(column=>mysqlValue(column,row[column])));
        }
        const [count]=await db.query('SELECT COUNT(*) AS total FROM '+table);
        if(count[0].total!==snapshot.data[table].length)throw new Error('Row count mismatch: '+table);
      }
    });
    console.log('Imported all application records. Password hashes and IDs preserved. Sessions must be recreated by signing in.');
  } finally { await db.pool.end(); }
}
async function main() {
  const [action,filename]=process.argv.slice(2);
  if(!filename || !['export','import'].includes(action))throw new Error('Usage: node scripts/migrate-postgres.js export|import PATH.json');
  await (action==='export'?exportPostgres(filename):importMysql(filename));
}
if(require.main===module) main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={mysqlValue};
