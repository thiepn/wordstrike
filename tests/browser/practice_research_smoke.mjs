import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';

const root=path.resolve(import.meta.dirname,'../..');
const out=path.join(root,'browser-artifacts/practice-research-smoke');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  try{res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
}).listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));

const browser=await chromium.launch();
const report={status:'FAIL',errors:[]};
async function rows(page,storeName){return page.evaluate(async storeName=>{
  const {createPracticeIndexedDbStore}=await import('/js/practiceLab/practiceIndexedDbStore.js');
  const store=createPracticeIndexedDbStore();await store.open();
  try{return await store.list(storeName);}finally{store.close();}
},storeName);}
async function openLab(page){
  await page.locator('[data-action="modes"]').click();
  await page.locator('[data-mode-id="practice"]').click();
  await page.locator('.pl-studio-home').waitFor();
}
async function openResearch(page){
  await page.locator('.pl-navigation [data-route="research"]').click();
  await page.locator('[data-practice-view="research"]').waitFor();
  await page.waitForFunction(()=>!document.querySelector('[data-practice-view="research"] [role="status"]')?.textContent.includes('Loading local research state'));
}
try{
  const width=Number(process.env.PRACTICE_WIDTH??1280);
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<600,serviceWorkers:'block'});
  await context.addInitScript(()=>{
    localStorage.setItem('wordstrike.onboarding.general.v3','seen');
    localStorage.setItem('practice-research-preserve','keep');
    let i=0;
    for(const size of [131072,32768,8192,2048,512,128,16,1])for(let j=0;j<200;j++){
      try{localStorage.setItem('research-quota-'+i,'q'.repeat(size));i++;}
      catch(error){if(error.name!=='QuotaExceededError')throw error;break;}
    }
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
  await openLab(page);
  report.fillers=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('research-quota-')).length);
  // Practice home is intentionally lazy and may not create a profile until a
  // data-backed route opens. Research is the operation under test, so assert
  // canonical profile creation after that route has initialized its repository.
  await openResearch(page);
  await page.locator('[data-research-action="enroll"]').waitFor();
  const initialProfiles=await rows(page,'profiles');assert.equal(initialProfiles.length,1);
  report.profileId=initialProfiles[0].profileId;
  assert.ok(!(await page.locator('.practice-lab-screen').innerText()).includes('PRACTICE_STORAGE_'));
  await page.locator('[data-research-action="enroll"]').click();
  await page.locator('[data-research-action="pause"]').waitFor();
  await page.locator('[data-research-action="new-assignment"]').waitFor();
  let enrollments=await rows(page,'researchEnrollments');assert.equal(enrollments.length,1);assert.equal(enrollments[0].status,'active');
  report.enrollmentId=enrollments[0].researchEnrollmentId;

  await page.locator('[data-research-action="pause"]').click();
  await page.locator('[data-research-action="resume"]').waitFor();
  enrollments=await rows(page,'researchEnrollments');assert.equal(enrollments[0].status,'paused');
  await page.locator('[data-research-action="resume"]').click();
  await page.locator('[data-research-action="pause"]').waitFor();
  enrollments=await rows(page,'researchEnrollments');assert.equal(enrollments[0].status,'active');
  await page.screenshot({path:path.join(out,'research-enrolled.png'),fullPage:true});

  await page.reload({waitUntil:'domcontentloaded'});await openLab(page);await openResearch(page);
  await page.locator('[data-research-action="pause"]').waitFor();
  assert.equal((await rows(page,'researchEnrollments'))[0].researchEnrollmentId,report.enrollmentId,'Enrollment lost after reload');
  assert.equal((await rows(page,'profiles'))[0].profileId,report.profileId,'Research changed the Practice profile');

  await page.evaluate(()=>{window.confirm=()=>true;});
  await page.locator('[data-research-action="delete"]').click();
  await page.locator('[data-research-action="enroll"]').waitFor();
  assert.equal((await rows(page,'researchEnrollments')).length,0);
  assert.equal((await rows(page,'researchAssignments')).length,0);
  assert.equal((await rows(page,'profiles')).length,1);
  assert.equal((await rows(page,'profiles'))[0].profileId,report.profileId);
  assert.equal(await page.evaluate(()=>localStorage.getItem('practice-research-preserve')),'keep');
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('research-quota-')).length),report.fillers,'Research must not free unrelated localStorage');
  assert.deepEqual(report.errors,[]);
  report.status='PASS';
  await page.screenshot({path:path.join(out,'research-clean.png'),fullPage:true});
  await context.close();
}finally{
  await browser.close();server.close();
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}
assert.equal(report.status,'PASS');
