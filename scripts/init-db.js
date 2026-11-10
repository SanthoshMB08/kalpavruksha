require('dotenv').config();
const fs=require('fs');
const path=require('path');
const {pool}=require('../config/db');
(async()=>{
  const schema=fs.readFileSync(path.join(__dirname,'../migrations/schema.sql'),'utf8').replace(/^--.*$/gm,'');
  for(const statement of schema.split(';').map(s=>s.trim()).filter(Boolean))await pool.query(statement);
  console.log('MySQL schema is ready.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>pool.end());
