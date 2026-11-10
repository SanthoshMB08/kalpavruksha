/* Browser verification uses a disposable _test database; never production. */
require('../tests/helpers/loadTestEnv');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('@playwright/test');
const sharp=require('sharp');
const app=require('../app');
const db=require('../config/db');
const {applySchema,resetTables}=require('../tests/helpers/db');
const {createUser}=require('../tests/helpers/auth');
const Ad=require('../models/Advertisement');
const errors=[],checks=[],consoleErrors=[];
async function main(){
await applySchema();await resetTables();
const user=await createUser(db.pool,{username:'browser_member',name:'Demo Member'});
const admin=await createUser(db.pool,{username:'browser_admin',role:'admin',name:'Demo Administrator'});
const png=await sharp({create:{width:600,height:700,channels:3,background:'#d8e6de'}}).png().toBuffer();
await fs.promises.mkdir('public/uploads/profiles',{recursive:true});
await fs.promises.mkdir('.local/screenshots',{recursive:true});
await fs.promises.writeFile('public/uploads/profiles/browser-fixture.png',png);
const candidates=[];
for(let i=0;i<3;i++){
const [r]=await db.query("INSERT INTO profiles (full_name,gender,image_name,religion,caste,date_of_birth,language,occupation,education,father_name,father_occupation,mother_name,mother_occupation,phone_number,address,city,state,country,assets,rashi,nakshatra,family_type,family_values,family_status,eating_habit,smoking_habit,drinking_habit,created_by,user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
[i===2?'\u0cb8\u0ccc\u0cae\u0ccd\u0caf\u0cbe':'Demo Candidate '+(i+1),i===2?'female':'male','browser-fixture.png','hindu','Lingayat','1995-01-01','Kannada','Engineer','BE','Father','Teacher','Mother','Teacher','98765012'+(30+i),'Sample address','Bengaluru','Karnataka','India','Home','Mesha','Ashwini','Nuclear','Traditional','Middle Class','Vegetarian','No','No',admin.id,i===2?user.id:null]);
candidates.push(r.insertId);
}
await db.query("INSERT INTO success_stories (couple_names,story_text) VALUES ('Demo Couple','A sample success story for layout verification.')");
await db.query("INSERT INTO contact_messages (name,mobile,message) VALUES ('Demo Contact','9876500000','Please share more information.')");
const server=app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({...process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{},headless:true});
try{
async function context(){const ctx=await browser.newContext({viewport:{width:390,height:844},locale:'en-IN'});const page=await ctx.newPage();page.on('pageerror',e=>errors.push({url:page.url(),error:e.message}));page.on('console',msg=>{if(msg.type()==='error'&&!/net::ERR|404/.test(msg.text()))consoleErrors.push({url:page.url(),error:msg.text()});});page.setDefaultTimeout(10000);return {ctx,page};}
async function assertScrollableSuggestions(page,selector,label){
const input=page.locator(selector);
await input.focus();
await input.fill('');
const listId=await input.getAttribute('aria-controls');
assert(listId,label+' custom searchable list initialized');
const list=page.locator('#'+listId);
const metrics=await list.evaluate(el=>{el.scrollTop=el.scrollHeight;return {clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,scrollTop:el.scrollTop};});
assert(metrics.scrollHeight>metrics.clientHeight,label+' suggestions scroll when they exceed the popup height');
assert(metrics.scrollTop>0,label+' suggestions can be scrolled to the bottom');
}
async function visit(page,route,label,width){
await page.setViewportSize({width,height:width>700?1000:844});
const response=await page.goto(base+route,{waitUntil:'networkidle'});
assert.equal(response.status(),200,label+' response');
if(route==='/portal/admin-dashboard/profiles/new'){
await page.locator('#religionSelect').selectOption('hindu');
await assertScrollableSuggestions(page,'#casteInput',label+' caste');
await page.locator('#casteInput').fill('Yad');
await page.locator('#'+await page.locator('#casteInput').getAttribute('aria-controls')+' [role="option"]').filter({hasText:'Yadav'}).click();
assert.equal(await page.locator('#casteInput').inputValue(),'Yadav',label+' caste option selection');
for(const selector of ['input[name="education"]','input[name="occupation"]','#countryInput','input[name="state"]']){
await assertScrollableSuggestions(page,selector,label+' '+selector);
}
}
if(route.split('?')[0]==='/dashboard'){
assert.equal(await page.locator('.member-sidebar').count(),0,label+' no member side navigation');
assert.equal(await page.locator('.mobile-bottom-nav').isVisible(),width<=1000,label+' member bottom navigation');
if(width<=700){
assert(await page.locator('.member-app-navbar').isVisible(),label+' member top navigation');
assert(await page.locator('.member-top-profile').isVisible(),label+' member profile shortcut');
assert.equal(await page.locator('.member-app-navbar').evaluate(el=>getComputedStyle(el).position),'sticky',label+' sticky member top navigation');
const destinations=await page.locator('.mobile-bottom-nav a').allTextContents();
assert.deepEqual(destinations.map(text=>text.trim()),['Liked Profiles','Saved Profiles','Home','Find Match','User Profile'],label+' member bottom destinations');
assert.equal(await page.locator('[data-member-destination="find"]').getAttribute('aria-current'),'page',label+' Find Match active state');
await page.locator('[data-member-destination="home"]').click();
assert.equal(new URL(page.url()).pathname,'/',label+' Home destination');
assert.equal(await page.locator('[data-member-destination="home"]').getAttribute('aria-current'),'page',label+' Home active state');
await page.locator('[data-member-destination="find"]').click();
assert.equal(new URL(page.url()).pathname,'/dashboard',label+' Find Match destination');
assert.equal(new URL(page.url()).hash,'#matchSearch',label+' Find Match destination');
assert.equal(await page.locator('[data-member-destination="find"]').getAttribute('aria-current'),'page',label+' Find Match active state');
}
}
if(route==='/'&&width<=700){
assert.equal(await page.locator('.navbar').evaluate(el=>getComputedStyle(el).position),'sticky','mobile landing navbar positioning');
const hero=await page.locator('.hero-banner').evaluate(el=>({bottom:el.getBoundingClientRect().bottom,cardBottom:el.querySelector('.hero-register-card').getBoundingClientRect().bottom}));
const aboutTop=await page.locator('.about-section').evaluate(el=>el.getBoundingClientRect().top);
assert(hero.cardBottom<=hero.bottom+1,'mobile landing hero contains the full match/register card');
assert(aboutTop>=hero.bottom-1,'mobile About section starts below the hero card');
await page.evaluate(()=>window.scrollTo(0,Math.max(document.documentElement.scrollHeight-innerHeight,500)));
await page.waitForTimeout(100);
assert(Math.abs(await page.locator('.navbar').evaluate(el=>el.getBoundingClientRect().top))<2,'mobile landing navbar stays at viewport top');
}
if(route.startsWith('/portal/admin-dashboard')&&width>980){
assert.equal(await page.locator('.portal-sidebar').evaluate(el=>getComputedStyle(el).position),'fixed',label+' fixed admin sidebar');
await page.evaluate(()=>window.scrollTo(0,Math.max(document.documentElement.scrollHeight-innerHeight,500)));
await page.waitForTimeout(100);
assert(Math.abs(await page.locator('.portal-sidebar').evaluate(el=>el.getBoundingClientRect().top))<2,label+' admin sidebar stays at viewport top');
}
if(route.split('?')[0]==='/saved-profiles'&&width<=700){
const liked=new URL(page.url()).searchParams.get('tab')==='interested';
assert.equal(await page.locator('[data-member-destination="'+(liked?'liked':'saved')+'"]').getAttribute('aria-current'),'page',label+' saved-list active state');
}
if(route==='/my-profile'&&width<=700){
assert.equal(await page.locator('[data-member-destination="profile"]').getAttribute('aria-current'),'page',label+' User Profile active state');
}
if(route==='/'){
const creator=page.locator('.footer-credit a[href="https://www.linkedin.com/in/santhosh-m-86724035a"]');
assert.equal(await creator.getAttribute('rel'),'noopener noreferrer','LinkedIn creator link safety');
assert.equal(await creator.innerText().then(text=>text.trim()),'Santhosh M','LinkedIn creator attribution');
}
const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,bad:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width&&r.right>innerWidth+2&&s.position!=='fixed'&&!e.closest('.portal-sidebar,.nav-drawer,.notif-panel,.modal-overlay,.fc-select-menu');}).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,right:Math.round(e.getBoundingClientRect().right)}))}));
checks.push({label,width,scroll:layout.scroll});
if(layout.scroll>width+2)errors.push({label,width,overflow:layout});
if(/dashboard|ads/.test(label))await page.screenshot({path:'.local/screenshots/'+label+'-'+width+'.png',fullPage:false});
}
async function login(page,route,credentials){
await page.goto(base+route);
await page.locator('[name=username]').fill(credentials.username);
await page.locator('[name=password]').fill(credentials.password);
await Promise.all([page.waitForURL(url=>!url.pathname.endsWith('login')),page.locator('form[action="'+route+'"] button[type=submit]').click()]);
}
const guest=await context();
for(const width of [390,1440])for(const route of ['/','/login','/register','/privacy','/terms'])await visit(guest.page,route,'public'+route.replaceAll('/','-'),width);
const member=await context();await login(member.page,'/login',user);
for(const width of [320,390,1440])for(const route of ['/dashboard','/saved-profiles','/saved-profiles?tab=interested','/my-profile'])await visit(member.page,route,'member'+route.replaceAll('/','-'),width);
await member.page.setViewportSize({width:390,height:844});
await member.page.goto(base+'/dashboard?keyword=Demo');
await member.page.locator('#navToggle').click();
await member.page.locator('.nav-lang-switch a[lang=kn]').click();
assert.equal(new URL(member.page.url()).pathname,'/dashboard','member language switch path');
assert.equal(new URL(member.page.url()).searchParams.get('keyword'),'Demo','member language switch query');
assert.equal(await member.page.locator('html').getAttribute('lang'),'kn','member language switch locale');
await member.page.locator('#navToggle').click();
await member.page.locator('.nav-lang-switch a[lang=en]').click();
await member.page.goto(base+'/dashboard');
await member.page.locator('#fcControls > summary').click();
assert(await member.page.locator('.fc-filter-sheet').isVisible(),'member filter sheet visible');
assert(await member.page.locator('body').evaluate(el=>el.classList.contains('filter-sheet-open')),'member filter sheet locks body');
await member.page.screenshot({path:'.local/screenshots/member-filter-sheet-390.png',fullPage:false});
await member.page.locator('.fc-sheet-header [data-close-filters]').click();
assert(!(await member.page.locator('#fcControls').evaluate(el=>el.open)),'member filter sheet closes');
const opener=member.page.locator('[data-open-profile-id]').first();await opener.click();
await member.page.locator('#modalContent .profile-modal-hero').waitFor();
assert(await member.page.locator('#modalOverlay').evaluate(el=>el.contains(document.activeElement)),'modal focus');
await member.page.keyboard.press('Escape');assert(!(await member.page.locator('#modalOverlay').evaluate(el=>el.classList.contains('open'))));
await opener.click();await member.page.locator('#modalContent .profile-modal-hero').waitFor();
const before=member.page.url();
await member.page.locator('#modalContent form[action$="/save"] button').first().click();
await member.page.waitForFunction(()=>document.querySelector('#modalContent form[action$="/unsave"] button.is-selected'));
assert.equal(member.page.url(),before);
await member.page.locator('#modalContent form[action$="/unsave"] button').click();
await member.page.waitForFunction(()=>document.querySelector('#modalContent form[action$="/save"] button:not(.is-selected)'));
await member.page.keyboard.press('Escape');
await member.page.locator('form[action$="/express-interest"] button:visible').first().click();
await member.page.waitForFunction(()=>document.querySelector('form[action$="/withdraw-interest"] button.is-selected'));
await member.page.locator('form[action$="/withdraw-interest"] button:visible').first().click();
await member.page.waitForFunction(()=>document.querySelector('form[action$="/express-interest"] button:not(.is-selected)'));
await member.page.locator('form.profile-save-action button:visible').first().click();
await member.page.waitForFunction(()=>document.querySelector('form.profile-save-action[action$="/unsave"]'));
await member.page.goto(base+'/saved-profiles?tab=saved');
await member.page.locator('.saved-list-remove-action button').first().click();
await member.page.waitForURL(/\/saved-profiles\?tab=saved/);
assert(await member.page.locator('.member-empty-state').isVisible(),'Unsave removes profile from saved list');
await member.page.goto(base+'/dashboard');
await member.page.locator('form.profile-interest-action button:visible').first().click();
await member.page.waitForFunction(()=>document.querySelector('form.profile-interest-action[action$="/withdraw-interest"]'));
await member.page.goto(base+'/saved-profiles?tab=interested');
await member.page.locator('.saved-list-remove-action button').first().click();
await member.page.waitForURL(/\/saved-profiles\?tab=interested/);
assert(await member.page.locator('.member-empty-state').isVisible(),'Unlike removes profile from interested list');
await member.page.goto(base+'/lang/kn');
for(const route of ['/dashboard','/saved-profiles','/my-profile'])await visit(member.page,route,'kn-member'+route.replaceAll('/','-'),390);
assert.equal(await member.page.locator('html').getAttribute('lang'),'kn');
const staff=await context();await login(staff.page,'/portal/admin-login',admin);
const staffRoutes=['/portal/admin-dashboard','/portal/admin-dashboard/users','/portal/admin-dashboard/profiles','/portal/admin-dashboard/profiles/new','/portal/admin-dashboard/profiles/'+candidates[0],'/portal/admin-dashboard/stories'];
for(const width of [390,1440])for(const route of staffRoutes)await visit(staff.page,route,'admin-'+route.split('/').at(-1),width);
await staff.page.setViewportSize({width:390,height:844});await staff.page.goto(base+'/portal/admin-dashboard/profiles?keyword=Demo');
await staff.page.locator('.portal-language a[lang=kn]').click();
assert.equal(new URL(staff.page.url()).pathname,'/portal/admin-dashboard/profiles','admin language switch path');
assert.equal(new URL(staff.page.url()).searchParams.get('keyword'),'Demo','admin language switch query');
assert.equal(await staff.page.locator('html').getAttribute('lang'),'kn','admin language switch locale');
await staff.page.locator('.portal-language a[lang=en]').click();
await staff.page.goto(base+'/portal/admin-dashboard');
await staff.page.locator('[data-portal-menu]').first().click();
assert(await staff.page.locator('.portal-sidebar').evaluate(el=>el.contains(document.activeElement)),'sidebar focus');
await staff.page.keyboard.press('Escape');assert(!(await staff.page.locator('#portalSidebarToggle').isChecked()));
await staff.page.goto(base+'/lang/kn');
await visit(staff.page,'/portal/admin-dashboard/profiles/new','kn-admin-form',390);
await staff.page.locator('[name=full_name]').fill('\u0cb8\u0ccc\u0cae\u0ccd\u0caf\u0cbe');
assert(await staff.page.locator('[name=full_name]').evaluate(el=>el.checkValidity()),'Kannada input accepted');
await staff.page.locator('.portal-language a[lang=en]').click();assert.equal(await staff.page.locator('html').getAttribute('lang'),'kn','dirty form retains locale');
const pdf=await staff.ctx.request.get(base+'/portal/admin-dashboard/profiles/'+candidates[2]+'/pdf');
assert.equal(pdf.status(),200,'Kannada PDF response');const pdfBytes=await pdf.body();assert.equal(pdfBytes.subarray(0,4).toString(),'%PDF');fs.writeFileSync('.local/profile-kn.pdf',pdfBytes);
const superadmin=await context();await login(superadmin.page,'/portal/super-secure-login',{username:process.env.SUPERADMIN_USERNAME,password:process.env.SUPERADMIN_PASSWORD});
const superRoutes=['/portal/super-secure-dashboard','/portal/super-secure-dashboard/admins','/portal/super-secure-dashboard/ads','/portal/super-secure-dashboard/stories','/portal/super-secure-dashboard/messages','/portal/super-secure-dashboard/trash','/portal/super-secure-dashboard/profiles/'+candidates[0]+'/edit'];
for(const width of [390,1440])for(const route of superRoutes)await visit(superadmin.page,route,'super-'+route.split('/').at(-1),width);
await superadmin.page.goto(base+'/portal/super-secure-dashboard/ads');
await superadmin.page.locator('#adTitle').fill('Demo sponsor');
await superadmin.page.locator('#adExpiry').fill('2099-01-01T12:00');
await superadmin.page.locator('#adDesktop').setInputFiles({name:'demo.png',mimeType:'image/png',buffer:png});
await superadmin.page.waitForFunction(()=>document.querySelector('#desktopPreview img').naturalWidth>0);
assert.match(await superadmin.page.locator('#desktopSize').innerText(),/1440/);
await Promise.all([superadmin.page.waitForNavigation(),superadmin.page.locator('#adUploadForm button[type=submit]').click()]);
assert.equal((await Ad.listActiveByPlacement('top_banner')).length,1,'Published ad');
for(const width of [390,1440]){
await visit(guest.page,'/','published-ad-home',width);
assert(await guest.page.locator('.ad-frame img').first().evaluate(el=>el.naturalWidth>0),'ad image loads');
assert((await guest.page.locator('.ad-frame img').first().getAttribute('src')).endsWith('.webp'));
}
await superadmin.page.goto(base+'/lang/kn');
await visit(superadmin.page,'/portal/super-secure-dashboard/ads','kn-super-ads',390);
const report={checks,errors,consoleErrors};fs.writeFileSync('.local/browser-results.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
assert.equal(errors.length+consoleErrors.length,0,'Browser diagnostics');
}finally{fs.writeFileSync('.local/browser-results.json',JSON.stringify({checks,errors,consoleErrors},null,2));await browser.close();await new Promise(resolve=>server.close(resolve));await db.pool.end();}
}
main().catch(async e=>{console.error(e);await db.pool.end().catch(()=>{});process.exitCode=1;});
