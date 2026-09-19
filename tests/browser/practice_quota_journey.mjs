import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium,firefox,webkit} from 'playwright';
const root=path.resolve(import.meta.dirname,'../..');
const out=path.join(root,'browser-artifacts/practice-quota-journey');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]??'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=process.env.PRACTICE_URL??`http://127.0.0.1:${server.address().port}/`;
const browserName=process.env.PRACTICE_BROWSER??'chromium';
const browser=await ({chromium,firefox,webkit}[browserName]).launch();const reports=[];
async function rows(page,table){return page.evaluate(async({base,table})=>{const {createPracticeIndexedDbStore}=await import(new URL('js/practiceLab/practiceIndexedDbStore.js',base));const s=createPracticeIndexedDbStore();await s.open();try{return await s.list(table);}finally{s.close();}},{base,table});}
async function openCoach(page){await page.locator('[data-action="modes"]').click();await page.locator('[data-mode-id="practice"]').click();await page.locator('.pl-navigation [data-route="daily-training"]').click();}
try{for(const mode of ['fresh-full','existing-full']){
 const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
 await context.addInitScript(()=>{if(!localStorage.getItem('wordstrike.onboarding.general.v3'))localStorage.setItem('wordstrike.onboarding.general.v3','seen');});
 const page=await context.newPage();page.setDefaultTimeout(20000);const report={mode,browser:browserName,status:'FAIL',errors:[]};page.on('pageerror',e=>report.errors.push(e.message));
 try{
  await page.clock.install();await page.goto(base,{waitUntil:'domcontentloaded'});
  if(mode==='existing-full')await page.evaluate(async base=>{const {createPracticeRepository}=await import(new URL('js/practiceLab/practiceRepository.js',base));const {createPracticeManifestStore}=await import(new URL('js/practiceLab/practiceManifestStore.js',base));const {createPracticeIndexedDbStore}=await import(new URL('js/practiceLab/practiceIndexedDbStore.js',base));const s=createPracticeIndexedDbStore();try{await createPracticeRepository({dataStore:s,manifestStore:createPracticeManifestStore()}).initializePracticeStorage();}finally{s.close();}},base);
  report.fillers=await page.evaluate(()=>{let i=0;localStorage.setItem('another-hub-app-test','preserve me');for(const size of [131072,32768,8192,2048,512,128,16,1]){for(let j=0;j<200;j++){try{localStorage.setItem('quota-fixture-'+i,'q'.repeat(size));i++;}catch(e){if(e.name!=='QuotaExceededError')throw e;break;}}}let full=false;try{localStorage.setItem('quota-probe','q'.repeat(1024));}catch(e){full=e.name==='QuotaExceededError';}if(!full)throw Error('Quota fixture did not fill localStorage');return i;});
  await openCoach(page);await page.locator('[data-coach-minutes="5"]').click();await page.locator('[data-practice-action="create-coach-plan"]:enabled').click();
  await page.locator('[data-practice-action="start-coach-next"]:enabled').waitFor({timeout:30000});
  const plans=await rows(page,'coachPlans');assert.equal(plans.length,1);assert.ok(plans[0].blocks.length>0,'An empty plan is not usable practice');report.planId=plans[0].coachPlanId;report.profileId=plans[0].profileId;
  await page.locator('[data-practice-action="start-coach-next"]').click();const input=page.locator('[data-real-text-input]');await input.waitFor({state:'visible'});
  const text=await page.locator('.is-current').first().evaluate(el=>{let s='';for(let n=el;n&&s.length<100;n=n.nextElementSibling)s+=n.textContent;return s.replaceAll('\u00a0',' ').slice(0,100);});
  await page.keyboard.type(text,{delay:35});await page.clock.fastForward(301000);
  await page.locator('[data-real-text-session-action="finish"]').waitFor({timeout:30000});await page.locator('[data-real-text-session-action="finish"]').click();
  const after=await rows(page,'coachPlans');assert.equal(after.length,1);assert.equal(after[0].status,'finished');assert.equal(after[0].completion.completedCount,1);
  const sessions=await rows(page,'sessionSummaries');assert.equal(sessions.filter(s=>s.status==='completed'&&s.coachBinding?.coachPlanId===report.planId).length,1);
  await page.screenshot({path:path.join(out,`${browserName}-${mode}-complete.png`),fullPage:true});
  await page.reload({waitUntil:'domcontentloaded'});await openCoach(page);
  await page.waitForFunction(()=>document.querySelector('[data-practice-action="create-coach-plan"]')===null&&document.querySelector('.practice-coach-block'));
  assert.equal((await rows(page,'profiles')).length,1,'Reload must not create a different profile');assert.equal((await rows(page,'coachPlans'))[0].coachPlanId,report.planId);
  assert.equal(await page.evaluate(()=>localStorage.getItem('another-hub-app-test')),'preserve me');
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('quota-fixture-')).length),report.fillers,'Never delete another app\'s stored data');
  assert.deepEqual(report.errors,[]);report.status='PASS';
 }catch(error){report.error=String(error);report.body=await page.locator('body').innerText().catch(()=>'');await page.screenshot({path:path.join(out,`${browserName}-${mode}-failure.png`)}).catch(()=>{});}
 finally{reports.push(report);console.log(JSON.stringify(report));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));await context.close();}
}}finally{await browser.close();server.close();}
assert.equal(reports.filter(r=>r.status!=='PASS').length,0,'Full-storage Daily Coach journeys failed');
