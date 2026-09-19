import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium,firefox,webkit} from 'playwright';
const root=path.resolve(import.meta.dirname,'../..');
const out=path.join(root,'browser-artifacts/storage-native');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/harness'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><title>Storage integrity test</title><body>Storage integrity test</body></html>');return;}
 const file=path.resolve(root,'.'+decodeURIComponent(pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'application/json');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const name=process.env.PRACTICE_BROWSER??'chromium';
const browser=await ({chromium,firefox,webkit}[name]).launch();
const report={browser:name,status:'FAIL',errors:[]};
try{
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.addInitScript(()=>{globalThis.__rejections=[];addEventListener('unhandledrejection',e=>globalThis.__rejections.push(e.reason?.message??String(e.reason)));});
 const pages=await Promise.all([context.newPage(),context.newPage()]);
 for(const page of pages)page.on('pageerror',e=>report.errors.push(e.message));
 await Promise.all(pages.map(page=>page.goto(`http://127.0.0.1:${server.address().port}/harness`)));
 report.fillers=await pages[0].evaluate(()=>{let i=0;localStorage.setItem('other-app-sentinel','keep');for(const size of [131072,32768,8192,2048,512,128,16,1])for(let j=0;j<200;j++){try{localStorage.setItem('native-quota-'+i,'q'.repeat(size));i++;}catch(e){if(e.name!=='QuotaExceededError')throw e;break;}}return i;});
 const init=await Promise.all(pages.map(page=>page.evaluate(async()=>{
  const [{createPracticeIndexedDbStore},{createPracticeManifestStore},{createPracticeRepository}]=await Promise.all([import('/js/practiceLab/practiceIndexedDbStore.js'),import('/js/practiceLab/practiceManifestStore.js'),import('/js/practiceLab/practiceRepository.js')]);
  const store=createPracticeIndexedDbStore({databaseName:'native-practice-integrity'}),manifest=createPracticeManifestStore();
  const repository=createPracticeRepository({dataStore:store,manifestStore:manifest});
  const initialized=await repository.initializePracticeStorage();
  globalThis.__resources={store,manifest,repository,initialized};
  return {profileId:initialized.profile.profileId,contextId:initialized.context.contextId};
 })));
 assert.equal(init[0].profileId,init[1].profileId,'Concurrent first visits must not create separate identities');
 assert.equal(init[0].contextId,init[1].contextId);
 const created=await Promise.all(pages.map((page,index)=>page.evaluate(async minutes=>{
  const {createPracticeCoachPlanRecord}=await import('/js/practiceLab/practiceCoachPlan.js');
  const {repository,initialized}=globalThis.__resources;
  const plan=createPracticeCoachPlanRecord({profileId:initialized.profile.profileId,contextId:initialized.context.contextId,localDayKey:'2026-09-19',requestedMinutes:minutes,inputFingerprint:String(minutes),blocks:[]});
  const result=await repository.createCoachPlan(plan);
  return {created:result.created,hash:result.plan.planHash,minutes:result.plan.requestedMinutes};
 },index?15:5)));
 assert.equal(created.filter(row=>row.created).length,1);
 assert.equal(created[0].hash,created[1].hash,'A racing writer must not replace the frozen plan');
 const rollback=await pages[0].evaluate(async()=>{
  const {store}=globalThis.__resources;const plan=(await store.list('coachPlans'))[0];
  let transactionError=null,singleError=null;
  try{await store.runTransaction(['meta','coachPlans'],'readwrite',async tx=>{
   await tx.put('meta',{key:'must-rollback',value:true});
   await tx.put('coachPlans',{...plan,coachPlanId:plan.coachPlanId+'-collision'});
  });}catch(error){transactionError={code:error.code,cause:error.cause?.name};}
  try{await store.put('coachPlans',{...plan,coachPlanId:plan.coachPlanId+'-collision'});}catch(error){singleError=error.name;}
  return {transactionError,singleError,partial:await store.get('meta','must-rollback'),plans:await store.list('coachPlans'),profiles:(await store.list('profiles')).length};
 });
 assert.equal(rollback.transactionError?.code,'PRACTICE_STORAGE_TRANSACTION_FAILED');
 assert.equal(rollback.transactionError?.cause,'ConstraintError');
 assert.equal(rollback.singleError,'ConstraintError');assert.equal(rollback.partial,undefined);
 assert.equal(rollback.plans.length,1);assert.equal(rollback.plans[0].planHash,created[0].hash);assert.equal(rollback.profiles,1);
 await pages[0].evaluate(async()=>{const {manifest}=globalThis.__resources;const current=manifest.load().manifest;await manifest.saveDurable({...current,settings:{...current.settings,dailySessionLengthMinutes:8}});});
 await pages[1].evaluate(async()=>{const {manifest}=globalThis.__resources;const current=manifest.load().manifest;await manifest.saveDurable({...current,settings:{...current.settings,soundEnabled:true}});});
 const settings=await pages[0].evaluate(async()=>{const {manifest,store}=globalThis.__resources;await manifest.initialize(store);return manifest.load().manifest.settings;});
 assert.equal(settings.dailySessionLengthMinutes,8);assert.equal(settings.soundEnabled,true);
 await pages[0].waitForTimeout(100);
 for(const page of pages){
  assert.deepEqual(await page.evaluate(()=>globalThis.__rejections),[],'Storage failures must not generate unhandled secondary rejections');
  assert.equal(await page.evaluate(()=>localStorage.getItem('other-app-sentinel')),'keep');
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('native-quota-')).length),report.fillers);
  await page.evaluate(()=>globalThis.__resources.store.close());
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';
 report.checks=['concurrent fresh initialization at full localStorage','concurrent immutable daily-plan creation','native ConstraintError rollback','single-store failure propagation','no unhandled rejections','cross-tab preference merging','unrelated localStorage preserved'];
 await context.close();
}catch(error){report.error=String(error);throw error;}
finally{await browser.close();server.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
