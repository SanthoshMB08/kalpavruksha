
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {execFile}=require('child_process'),{promisify}=require('util');
const run=promisify(execFile);
const db=require('../config/db');
const {applySchema,resetTables,closePool}=require('./helpers/db');
const TABLES=require('../migrations/source-columns.json');
const filename=path.resolve('.local','migration-test-'+crypto.randomUUID()+'.json');
beforeAll(async()=>{fs.mkdirSync(path.dirname(filename),{recursive:true});await applySchema();});
beforeEach(resetTables);
afterAll(async()=>{if(fs.existsSync(filename))fs.unlinkSync(filename);await closePool();});
function write(data,checksum){fs.writeFileSync(filename,JSON.stringify({format:1,checksum:checksum||crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex'),data}));}
function importFile(){return run(process.execPath,['scripts/migrate-postgres.js','import',filename],{env:process.env});}
async function snapshot(){
await db.query("INSERT INTO users (id,name,mobile_number,username,password,created_at) VALUES ('9007199254740993',?,'9888800000','unicode_user','preserved-password-hash','2020-01-02 03:04:05.123456')",['\u0cb8\u0ccc\u0cae\u0ccd\u0caf\u0cbe']);
await db.query("INSERT INTO profiles (id,full_name,gender,image_name,religion,date_of_birth,language,father_name,father_occupation,mother_name,mother_occupation,phone_number,address,city,assets,rashi,nakshatra,annual_salary,user_id,created_by) VALUES (200,'Sample Profile','male','original.webp','hindu','1990-02-03','Kannada','Father','Teacher','Mother','Teacher','9876600000','Address','City','House','Mesha','Ashwini','1234567890.12','9007199254740993',1)");
await db.query("INSERT INTO interests (user_id,profile_id,is_saved,is_interested,saved_at) VALUES ('9007199254740993',200,TRUE,FALSE,'2021-01-01 00:00:00.123456')");
await db.query("INSERT INTO advertisements (ad_title,image_name,placement,expires_at) VALUES ('Sponsor','legacy.webp','top_banner','2099-01-01 00:00:00')");
await db.query("INSERT INTO success_stories (couple_names,story_text,created_by) VALUES ('Sample Couple','Their story',1)");
await db.query("INSERT INTO contact_messages (name,mobile,message,is_read) VALUES ('Sample Contact','9876600000','Please call',TRUE)");
const data={};for(const [table,columns] of Object.entries(TABLES))data[table]=(await db.query('SELECT '+columns.join(',')+' FROM '+table+' ORDER BY id'))[0];
return data;
}
async function empty(){await resetTables();await db.query('DELETE FROM users');}
it('imports all six source tables preserving exact values and foreign keys',async()=>{
const data=await snapshot();await empty();write(data);await importFile();
for(const [table,columns] of Object.entries(TABLES)){
const [actual]=await db.query('SELECT '+columns.join(',')+' FROM '+table+' ORDER BY id');
expect(actual).toEqual(data[table]);
}
const [fresh]=await db.query("INSERT INTO users (name,mobile_number,username,password) VALUES ('Next User','9888800001','next_user','hash')");
expect(BigInt(fresh.insertId)).toBeGreaterThan(9007199254740993n);
});
it('rejects corrupt exports before writing records',async()=>{
const data=await snapshot();await empty();write(data,'invalid');
await expect(importFile()).rejects.toThrow('Invalid snapshot format/checksum');
expect((await db.query('SELECT COUNT(*) AS total FROM users'))[0][0].total).toBe(0);
});
it('refuses nonempty targets without changing existing data',async()=>{
const data=await snapshot();write(data);
await expect(importFile()).rejects.toThrow('empty application tables');
expect((await db.query('SELECT COUNT(*) AS total FROM users'))[0][0].total).toBe(data.users.length);
});
it('rolls back every table if a late imported record violates a constraint',async()=>{
const data=await snapshot();await empty();data.contact_messages.push({...data.contact_messages[0]});write(data);
await expect(importFile()).rejects.toThrow();
for(const table of Object.keys(TABLES))expect((await db.query('SELECT COUNT(*) AS total FROM '+table))[0][0].total).toBe(0);
});
