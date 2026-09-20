import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium, firefox, webkit } from 'playwright';
const root=path.resolve(import.meta.dirname,'../..');
const out=path.join(root,'browser-artifacts/assessment-input');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]??'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=process.env.PRACTICE_URL??`http://127.0.0.1:${server.address().port}/`;
const name=process.env.PRACTICE_BROWSER??'chromium',reports=[];
async function rows(page,table){return page.evaluate(async({base,table})=>{
 const {createPracticeIndexedDbStore}=await import(new URL('js/practiceLab/practiceIndexedDbStore.js',base));
 const store=createPracticeIndexedDbStore();await store.open();try{return await store.list(table);}finally{store.close();}
},{base,table});}
async function enterAssessment(page,depth){
 await page.locator('[data-action="modes"]').click();await page.locator('[data-mode-id="practice"]').click();
 await page.locator('[data-lab-drill="full-assessment"] button').click();
 await page.locator(`[data-practice-action="start-assessment"][data-assessment-depth="${depth}"]:enabled`).click();
}
async function type(page,text){
 for(const [i,line] of text.split('\n').entries()){
  if(i)await page.keyboard.press('Enter');await page.keyboard.type(line,{delay:40});
 }
}
const browser=await ({chromium,firefox,webkit}[name]).launch();
try{for(const [depth,count] of [['quick',3],['standard',6],['deep',10]]){
 const report={browser:name,url:base,depth,expectedBlocks:count,status:'FAIL',blocks:[],errors:[],fullLocalStorage:process.env.PRACTICE_FULL_STORAGE==='1'};
 const width=Number(process.env.PRACTICE_WIDTH??(name==='webkit'?390:1280));
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<600,serviceWorkers:process.env.PRACTICE_URL?'allow':'block'});
 await context.addInitScript(()=>localStorage.setItem('wordstrike.onboarding.general.v3','seen'));
 const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));
 try{
  await page.clock.install();await page.goto(base,{waitUntil:'domcontentloaded'});
  if(report.fullLocalStorage)report.fillerCount=await page.evaluate(()=>{
   let i=0;for(const n of [131072,32768,8192,2048,512,128,16,1])for(let k=0;k<200;k++){
    try{localStorage.setItem('assessment-quota-'+i,'x'.repeat(n));i++;}catch(e){if(e.name!=='QuotaExceededError')throw e;break;}
   }
   return i;
  });
  await enterAssessment(page,depth);
  for(let block=0;block<count;block++){
   await page.locator('[data-assessment-action="next"]').click();
   const input=page.locator('[data-assessment-input]'),passage=page.locator('[data-assessment-text]');
   await input.waitFor({state:'visible'});
   // locator.pressSequentially/fill would focus the input and conceal this bug.
   assert.ok(await input.evaluate(e=>e===document.activeElement),'Block must focus keyboard capture without test help');
   await input.evaluate(e=>{window.__assessmentCapture=e;});
   const time=await page.locator('[data-assessment-time]').innerText();
   await page.clock.fastForward(1500);
   assert.equal(await page.locator('[data-assessment-time]').innerText(),time,'Timer must wait for first input');
   const text=(await passage.innerText()).slice(0,60);
   await type(page,text.slice(0,12));
   assert.equal(await passage.getAttribute('data-cursor'),'12','Immediate physical keyboard typing must advance');
   assert.equal(await passage.locator('.practice-real-text-char.is-current').count(),1,'Cursor must use the styled character class');
   assert.notEqual(await passage.locator('.is-current').evaluate(e=>getComputedStyle(e).boxShadow),'none','Caret is actually visible');
   await page.keyboard.type(text[12]==='x'?'z':'x');
   assert.equal(await passage.locator('.is-error').count(),1,'Wrong input must be visible');
   await page.keyboard.press('Backspace');
   assert.equal(await passage.getAttribute('data-cursor'),'12','Backspace corrects exactly one character');
   assert.equal(await passage.locator('.is-error').count(),0);
   const exit=page.locator('[data-assessment-action="exit"]');await exit.focus();await page.clock.fastForward(700);
   assert.ok(await exit.evaluate(e=>e===document.activeElement),'Timer must not steal focus from controls');
   if(width<600)await passage.tap();else await passage.click();
   assert.ok(await input.evaluate(e=>e===document.activeElement),'Click/tap on passage must restore keyboard input');
   await type(page,text.slice(12,36));
   assert.equal(await passage.getAttribute('data-cursor'),'36','Typing must keep working after passage click');
   assert.ok(await input.evaluate(e=>e===window.__assessmentCapture),'Typing capture must not be replaced during updates');
   const pasteBlocked=await input.evaluate(e=>!e.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertFromPaste',data:'pasted text'})));
   assert.ok(pasteBlocked);assert.equal(await passage.getAttribute('data-cursor'),'36','Pasting cannot become measured typing');
   if(block===0){
    await input.evaluate(e=>{
     e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));
     e.value='e\u0301';e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'e\u0301',isComposing:true}));
     e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'e\u0301'}));
     e.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertFromComposition',data:'e\u0301'}));
    });
    assert.equal(await passage.getAttribute('data-cursor'),'37','Composition must be committed once');
    await page.keyboard.press('Backspace');assert.equal(await passage.getAttribute('data-cursor'),'36');
    await input.evaluate(e=>{e.value='Q';e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'Q'}));});
    assert.equal(await passage.getAttribute('data-cursor'),'37','Native input fallback must not depend on beforeinput');
    await page.keyboard.press('Backspace');
    await page.screenshot({path:path.join(out,`${name}-${depth}-typing.png`),fullPage:true});
   }
   await page.clock.fastForward(130000);
   await page.locator(`[data-assessment-action="${block===count-1?'finish':'next'}"]`).waitFor({state:'visible'});
   assert.equal(await input.count(),0,'Finished block must remove the typing capture');
   const summaries=await rows(page,'sessionSummaries');
   assert.equal(summaries.filter(s=>s.status==='completed').length,block+1,'Each completed block saves exactly once');
   report.blocks.push({ordinal:block+1,typing:true,passageFocus:true,visibleCaret:true,correction:true,saved:true});
  }
  await page.locator('[data-assessment-action="finish"]').click();
  await page.getByRole('heading',{name:'Assessment results',exact:true}).waitFor();
  const runs=await rows(page,'assessmentRuns');assert.equal(runs.length,1);assert.equal(runs[0].status,'completed');assert.equal(runs[0].blocks.filter(b=>b.status==='completed').length,count);
  report.assessmentRunId=runs[0].assessmentRunId;await page.screenshot({path:path.join(out,`${name}-${depth}-results.png`),fullPage:true});
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal((await rows(page,'assessmentRuns'))[0].assessmentRunId,report.assessmentRunId);
  assert.equal((await rows(page,'sessionSummaries')).filter(s=>s.status==='completed').length,count);
  if(report.fullLocalStorage)assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('assessment-quota-')).length),report.fillerCount);
  assert.deepEqual(report.errors,[]);report.status='PASS';
 }catch(error){report.error=String(error);report.body=await page.locator('body').innerText().catch(()=>'');await page.screenshot({path:path.join(out,`${name}-${depth}-failure.png`),fullPage:true}).catch(()=>{});}
 finally{reports.push(report);console.log(JSON.stringify(report));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));await context.close();}
}}finally{await browser.close();server.close();}
assert.equal(reports.filter(r=>r.status!=='PASS').length,0,'Assessment input/completion regressions: inspect report.json');
