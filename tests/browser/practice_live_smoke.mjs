import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'../..');
const base='https://thiepn.dev/wordstrike/';
const out=path.join(root,'browser-artifacts/practice-live');
fs.mkdirSync(out,{recursive:true});
const width=Number(process.env.PRACTICE_WIDTH??1280);
const report={url:base,width,commit:process.env.GITHUB_SHA??null,status:'FAIL',assets:[],errors:[]};
const assetPaths=['index.html','sw.js','practiceLabPlayability.css','js/practiceLab/practiceHostDom.js','js/practiceLab/practiceEntityResolver.js','js/practiceLab/practiceTargetSessionRendering.js'];
let browser;
try{
 const deadline=Date.now()+5400000;
 for(;;){
  const matches=await Promise.all(assetPaths.map(async file=>{
   try{
    const response=await fetch(new URL(file+'?release='+report.commit,base),{signal:AbortSignal.timeout(15000)});
    return {file,ok:response.ok&&(await response.text())===fs.readFileSync(path.join(root,file),'utf8')};
   }catch(error){return {file,ok:false,error:String(error)};}
  }));
  report.assets=matches;
  if(matches.every(result=>result.ok))break;
  assert.ok(Date.now()<deadline,'Production did not serve this release before the smoke-test deadline');
  await delay(10000);
 }
 browser=await chromium.launch();
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<600,serviceWorkers:'block'});
 await context.addInitScript(()=>localStorage.setItem('wordstrike.onboarding.general.v3','seen'));
 const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>report.errors.push(error.message));
 await page.goto(base,{waitUntil:'domcontentloaded'});
 const titleModes=page.locator('[data-action="modes"]').first();
 const practiceMode=page.locator('button[data-mode-id="practice"]').first();
 let entryState=null;
 try{
  entryState=await Promise.any([
   titleModes.waitFor({state:'visible',timeout:90000}).then(()=> 'title'),
   practiceMode.waitFor({state:'visible',timeout:90000}).then(()=> 'mode-select'),
  ]);
 }catch(error){
  report.startup=await page.evaluate(()=>({
   readyState:document.readyState,
   title:document.title,
   href:location.href,
   appText:(document.querySelector('#app')?.innerText??'').slice(0,2000),
   appHtml:(document.querySelector('#app')?.innerHTML??'').slice(0,4000),
  }));
  throw new Error(`Production app did not reach title or mode select: ${JSON.stringify(report.startup)}\n${error.message}`);
 }
 report.entryState=entryState;
 if(entryState==='title')await titleModes.click();
 await practiceMode.waitFor({state:'visible',timeout:30000});
 await practiceMode.click();
 await page.locator('[data-practice-action="open-experiment"][data-experiment-id="custom-text"]').first().click();
 const passage='Practice is ready. Correct a mistake, then continue.\nThe second line saves with the completed session.';
 await page.locator('[data-custom-text-source]').fill(passage);
 await page.locator('[data-practice-action="custom-start"]:enabled').click();
 const input=page.locator('[data-custom-text-session-input]');await input.waitFor({state:'visible'});
 assert.ok(await input.evaluate(node=>node===document.activeElement));
 await page.keyboard.type('x');await page.keyboard.press('Backspace');
 assert.equal(await page.locator('.practice-lab-screen .is-current').first().textContent(),'P');
 for(const [index,line] of passage.split('\n').entries()){
  if(index)await page.keyboard.press('Enter');
  await page.keyboard.type(line,{delay:30});
 }
 await page.locator('[data-practice-view="custom-text-result"]').waitFor();
 await page.screenshot({path:path.join(out,`production-result-${width}.png`)});
 const summaries=()=>page.evaluate(async()=>{
  const {createPracticeIndexedDbStore}=await import(new URL('js/practiceLab/practiceIndexedDbStore.js',location.href).href);
  const store=createPracticeIndexedDbStore();await store.open();
  try{return await store.list('sessionSummaries');}finally{store.close();}
 });
 const saved=await summaries();assert.equal(saved.filter(row=>row.status==='completed').length,1);
 const id=saved.find(row=>row.status==='completed').sessionId;
 await page.reload();assert.equal((await summaries()).filter(row=>row.sessionId===id&&row.status==='completed').length,1);
 assert.deepEqual(report.errors,[]);
 report.status='PASS';report.savedSessionId=id;report.checkedAt=new Date().toISOString();
}catch(error){report.error=String(error);throw error;}
finally{await browser?.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
