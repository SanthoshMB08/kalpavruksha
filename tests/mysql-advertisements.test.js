const request=require('supertest');
const sharp=require('sharp');
const app=require('../app');
const db=require('../config/db');
const Ad=require('../models/Advertisement');
const Profile=require('../models/Profile');
const Interest=require('../models/Interest');
const {AD_PLACEMENTS,parseAdExpiry}=require('../utils/adPlacements');
const storage=require('../utils/storage');
const {cleanupUploads}=require('../utils/storageCleanup');
const {pool,applySchema,resetTables,closePool}=require('./helpers/db');
const {createUser,loginAs,getCsrfToken}=require('./helpers/auth');
const {getTranslator}=require('../utils/i18n');

beforeAll(applySchema);
beforeEach(resetTables);
afterAll(closePool);
const future=()=>new Date(Date.now()+86400000);
async function profile() {
  const [r]=await pool.query("INSERT INTO profiles (full_name,gender,image_name,religion,date_of_birth,language,father_name,father_occupation,mother_name,mother_occupation,phone_number,address,city,assets,rashi,nakshatra) VALUES ('Sample Candidate','male','fixture.png','hindu','1995-01-01','Kannada','Father','Teacher','Mother','Teacher','9876501234','Address','Bengaluru','Home','Mesha','Ashwini')");
  return r.insertId;
}
describe('MySQL invariants',()=>{
  it('preserves large IDs, decimals, booleans and UTC timestamps',async()=>{
    const [rows]=await db.query("SELECT CAST('9007199254740993' AS UNSIGNED) AS id, CAST('1234567890.12' AS DECIMAL(12,2)) AS salary, CAST('2026-01-01 01:02:03.123456' AS DATETIME(6)) AS created_at");
    expect(String(rows[0].id)).toBe('9007199254740993');
    expect(rows[0].salary).toBe('1234567890.12');
    expect(rows[0].created_at).toBe('2026-01-01T01:02:03.123456Z');
    const counts=await db.query('SELECT COUNT(*) AS total FROM users');
    expect(counts[0][0].total).toBe(1);
  });
  it('rolls back account creation when a later write fails',async()=>{
    await expect(db.transaction(async()=>{
      await db.query("INSERT INTO users (name,mobile_number,username,password) VALUES ('Transaction User','9111100000','transaction_user','hash')");
      await db.query("INSERT INTO profiles (full_name) VALUES ('Invalid')");
    })).rejects.toThrow();
    expect((await db.query("SELECT id FROM users WHERE username='transaction_user'"))[0]).toHaveLength(0);
  });
  it('atomically retains Saved and Interested during concurrent requests',async()=>{
    const user=await createUser(pool);
    const id=await profile();
    await Promise.all(Array.from({length:8},(_,i)=>i%2?Interest.markSaved(user.id,id):Interest.markInterested(user.id,id)));
    const [rows]=await db.query('SELECT * FROM interests WHERE user_id=? AND profile_id=?',[user.id,id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].is_saved).toBe(true);
    expect(rows[0].is_interested).toBe(true);
    await Promise.all([Interest.markUnsaved(user.id,id),Interest.markNotInterested(user.id,id)]);
    const [cleared]=await db.query('SELECT is_saved,is_interested,saved_at,interested_at FROM interests WHERE user_id=? AND profile_id=?',[user.id,id]);
    expect(cleared[0].is_saved).toBe(false);
    expect(cleared[0].is_interested).toBe(false);
    expect(cleared[0].saved_at).toBeNull();
    expect(cleared[0].interested_at).toBeNull();
    expect((await Interest.listSavedByUser(user.id)).total).toBe(0);
    expect((await Interest.listInterestedByUser(user.id)).total).toBe(0);
    await db.query('UPDATE profiles SET deleted_at=UTC_TIMESTAMP(6) WHERE id=?',[id]);
    expect((await Interest.listSavedByUser(user.id)).total).toBe(0);
  });
});
describe('Advertisement lifecycle',()=>{
  it.each(Object.keys(AD_PLACEMENTS))('supports placement %s',async placement=>{
    await Ad.create({ad_title:'Sponsor',placement,image_name:'desktop.webp',mobile_image_name:'mobile.webp',expiresAt:future()});
    expect(await Ad.listActiveByPlacement(placement)).toHaveLength(1);
  });
  it('preserves the current advertisement when replacement fails',async()=>{
    const id=await Ad.create({ad_title:'Original',placement:'top_banner',image_name:'a.webp',expiresAt:future()});
    await expect(Ad.create({ad_title:'x'.repeat(101),placement:'top_banner',image_name:'b.webp',expiresAt:future()})).rejects.toThrow();
    expect(String((await Ad.listActiveByPlacement('top_banner'))[0].id)).toBe(String(id));
  });
  it('serializes concurrent replacement into one active slot',async()=>{
    await Promise.all(Array.from({length:5},(_,i)=>Ad.create({ad_title:'Sponsor '+i,placement:'sidebar',image_name:'a.webp',expiresAt:future()})));
    expect(await Ad.listActiveByPlacement('sidebar')).toHaveLength(1);
    expect(await Ad.listAll()).toHaveLength(5);
  });
  it('hides expired ads without a sweep and supports reactivation',async()=>{
    const id=await Ad.create({ad_title:'Sponsor',placement:'home_middle',image_name:'a.webp',expiresAt:future()});
    await db.query('UPDATE advertisements SET expires_at=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 MINUTE) WHERE id=?',[id]);
    expect(await Ad.listActiveByPlacement('home_middle')).toHaveLength(0);
    await Ad.reactivateWithNewExpiry(id,future());
    expect(await Ad.listActiveByPlacement('home_middle')).toHaveLength(1);
    await Ad.deleteById(id);
    expect(await Ad.listActiveByPlacement('home_middle')).toHaveLength(0);
    expect((await db.query("SELECT filename FROM storage_cleanup WHERE bucket='ads'"))[0]).toHaveLength(1);
  });
  it('keeps deactivated ad images for 24 hours and cancels cleanup on reactivation',async()=>{
    const id=await Ad.create({ad_title:'Sponsor',placement:'home_middle',image_name:'desktop.webp',mobile_image_name:'mobile.webp',expiresAt:future()});
    await Ad.toggleActive(id);
    const [queued]=await db.query("SELECT filename,run_after > UTC_TIMESTAMP(6) AS pending FROM storage_cleanup WHERE bucket='ads' ORDER BY filename");
    expect(queued).toHaveLength(2);
    expect(queued.every(file=>Boolean(Number(file.pending)))).toBe(true);

    await Ad.reactivateWithNewExpiry(id,future());
    expect((await db.query("SELECT filename FROM storage_cleanup WHERE bucket='ads'"))[0]).toHaveLength(0);
    expect(String((await Ad.listActiveByPlacement('home_middle'))[0].id)).toBe(String(id));
  });
  it('purges a deactivated ad and its images after the cleanup deadline',async()=>{
    const id=await Ad.create({ad_title:'Sponsor',placement:'home_middle',image_name:'desktop.webp',mobile_image_name:'mobile.webp',expiresAt:future()});
    await Ad.toggleActive(id);
    await db.query("UPDATE storage_cleanup SET run_after=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 MINUTE) WHERE bucket='ads'");
    const deleteFile=jest.spyOn(storage,'deleteFile').mockResolvedValue();

    await cleanupUploads();

    expect((await db.query('SELECT id FROM advertisements WHERE id=?',[id]))[0]).toHaveLength(0);
    expect(deleteFile).toHaveBeenCalledTimes(2);
    deleteFile.mockRestore();
  });
  it('purges a deleted profile and all its files after 24 hours',async()=>{
    const id=await profile();
    await db.query('UPDATE profiles SET image_name_2=?,biodata_pdf_name=?,jathaka_pdf_name=? WHERE id=?',
      ['second.webp','bio.pdf','chart.pdf',id]);
    await Profile.deleteById(id);
    expect((await db.query('SELECT filename FROM storage_cleanup'))[0]).toHaveLength(4);
    expect(await Profile.restoreById(id)).toBe(true);
    expect((await db.query('SELECT filename FROM storage_cleanup'))[0]).toHaveLength(0);
    await Profile.deleteById(id);
    await db.query('UPDATE profiles SET deleted_at=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 DAY) WHERE id=?',[id]);
    await db.query('UPDATE storage_cleanup SET run_after=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 MINUTE)');
    const deleteFile=jest.spyOn(storage,'deleteFile').mockResolvedValue();

    await cleanupUploads();

    expect((await db.query('SELECT id FROM profiles WHERE id=?',[id]))[0]).toHaveLength(0);
    expect(deleteFile).toHaveBeenCalledTimes(4);
    expect((await db.query('SELECT filename FROM storage_cleanup'))[0]).toHaveLength(0);
    deleteFile.mockRestore();
  });
  it('refuses to restore a profile after its 24-hour recovery window',async()=>{
    const id=await profile();
    await Profile.deleteById(id);
    await db.query('UPDATE profiles SET deleted_at=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 DAY) WHERE id=?',[id]);

    expect(await Profile.restoreById(id)).toBe(false);
    expect((await db.query('SELECT deleted_at FROM profiles WHERE id=?',[id]))[0][0].deleted_at).not.toBeNull();
  });
  it('refuses to reactivate an ad after its 24-hour recovery window',async()=>{
    const id=await Ad.create({ad_title:'Sponsor',placement:'home_middle',image_name:'desktop.webp',expiresAt:future()});
    await Ad.toggleActive(id);
    await db.query("UPDATE storage_cleanup SET run_after=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 MINUTE) WHERE bucket='ads'");

    await expect(Ad.reactivateWithNewExpiry(id,future())).rejects.toMatchObject({code:'AD_DEACTIVATION_EXPIRED'});
    expect(await Ad.listActiveByPlacement('home_middle')).toHaveLength(0);
  });
  it('parses labelled India time consistently and rejects impossible dates',()=>{
    expect(parseAdExpiry('2099-01-01T12:00').toISOString()).toBe('2099-01-01T06:30:00.000Z');
    expect(parseAdExpiry('2099-02-31T12:00')).toBeNull();
    expect(parseAdExpiry('2020-01-01T12:00')).toBeNull();
  });
  it('validates metadata before persistence and stores responsive variants',async()=>{
    const agent=request.agent(app);
    await loginAs(agent,'/portal/super-secure-login',process.env.SUPERADMIN_USERNAME,process.env.SUPERADMIN_PASSWORD);
    const token=await getCsrfToken(agent,'/portal/super-secure-dashboard/ads');
    const png=await sharp({create:{width:100,height:100,channels:3,background:'#17654f'}}).png().toBuffer();
    await agent.post('/portal/super-secure-dashboard/ads').field('_csrf',token).field('ad_title','Bad URL').field('placement','top_banner').field('expires_at','2099-01-01T12:00').field('target_url','javascript:alert(1)').attach('ad_image',png,'image.png');
    expect((await db.query('SELECT COUNT(*) AS total FROM storage_cleanup'))[0][0].total).toBe(0);
    const response=await agent.post('/portal/super-secure-dashboard/ads').field('_csrf',token).field('ad_title','Sponsor').field('placement','top_banner').field('expires_at','2099-01-01T12:00').attach('ad_image',png,'image.png');
    expect(response.status).toBe(303);
    const [ad]=await Ad.listActiveByPlacement('top_banner');
    expect(ad.mobile_image_name).toMatch(/\.webp$/);
    const desktop=await sharp('public/uploads/ads/'+ad.image_name).metadata();
    const mobile=await sharp('public/uploads/ads/'+ad.mobile_image_name).metadata();
    expect([desktop.width,desktop.height]).toEqual(AD_PLACEMENTS.top_banner.desktop);
    expect([mobile.width,mobile.height]).toEqual(AD_PLACEMENTS.top_banner.mobile);
  });
});
describe('Localization',()=>{
  it('renders member, staff, validation and legal messages in Kannada',()=>{
    const t=getTranslator('kn');
    for(const key of ['My Profile','Advertisements','Family Details','Privacy Policy','Full Name is required.','Never Married'])expect(t(key)).not.toBe(key);
    expect(t('never_married')).toBe(t('Never Married'));
    expect(t('Unknown content')).toBe('Unknown content');
  });
  it('persists an authenticated locale choice and localizes the next page',async()=>{
    const agent=request.agent(app);
    await loginAs(agent,'/portal/super-secure-login',process.env.SUPERADMIN_USERNAME,process.env.SUPERADMIN_PASSWORD);
    await agent.get('/lang/kn');
    const page=await agent.get('/portal/super-secure-dashboard/ads');
    expect(page.status).toBe(200);
    expect(page.text).toContain('lang="kn"');
    expect(page.text).toContain(getTranslator('kn')('Ad manager'));
    expect((await db.query("SELECT locale FROM users WHERE role='superadmin'"))[0][0].locale).toBe('kn');
  });
});
