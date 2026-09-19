import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium,firefox,webkit} from 'playwright';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'browser-artifacts/practice-end-to-end');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{let file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]??'application/octet-stream');res.end(browserSource(file));}catch{res.writeHead(404);res.end();}}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));
// Read-only test diagnostics; production source and engine behavior are unchanged.
function browserSource(file){
 const bytes=fs.readFileSync(file);
 if(!file.endsWith('/js/practiceLab/practiceSessionEngine.js')) return bytes;
 return bytes.toString().replace('export function createPracticeSessionEngine(options = {}) {','function createInstrumentedPracticeSessionEngine(options = {}) {')+
 `\nexport function createPracticeSessionEngine(options={}) {
 const engine=createInstrumentedPracticeSessionEngine({...options,logger:{warn(...args){(globalThis.__practiceWarnings??=[]).push(args.map(x=>x?.code??x?.message??String(x)));}}});
 globalThis.__practiceEngine=engine;return engine;
 }`;
}
const cases=[
 ['weak-keys','start-weak-keys','data-weak-keys-input','[data-weak-key-target]','e',false],
 ['combination-repair','prepare-combination-repair','data-combination-input','[data-combination-target]','th',false],
 ['problem-words','start-problem-words','data-problem-words-input','[data-problem-word-target]','the',false],
 ['accuracy-control','start-accuracy-recovery','data-accuracy-recovery-input','[data-accuracy-recovery-target]','e',false],
 ['burst-sprints','start-burst-sprints','data-burst-input',null,null,true],
 ['pace-ladder','start-pace-ladder','data-pace-input',null,null,true],
 ['common-words','start-common-words-practice','data-common-words-input',null,null,false],
 ['real-text','start-real-text-natural','data-real-text-input',null,null,true],
 ['consistency-trainer','start-consistency','data-sustained-input',null,null,true],
 ['metronome-typing','start-preview-protocol','data-protocol-input',null,null,true],
 ['read-ahead','start-preview-protocol','data-protocol-input',null,null,true],
 ['endurance','start-endurance-practice','data-sustained-input',null,null,true],
 ['punctuation-capitals','start-punctuation-capitals-practice','data-special-domain-input',null,null,true],
 ['numbers-symbols','start-numbers-symbols-practice','data-special-domain-input',null,null,true],
 ['custom-text','custom-start','data-custom-text-session-input','[data-custom-text-source]','First line, then press Enter.\nSecond line: numbers 123 and symbols + = !\nLast line ends here.',false],
];
const reports=[];
const cursor='.practice-lab-screen .is-current, .practice-lab-screen [aria-current="true"]';
async function remaining(page,limit=80){return page.locator(cursor).first().evaluate((e,limit)=>{let text='';for(let n=e;n&&text.length<limit;n=n.nextElementSibling)text+=n.querySelector('br')?'\n':n.textContent;return text.replaceAll('\u00a0',' ').slice(0,limit);},limit);}
async function type(page,text,delay=0){const lines=text.split('\n');for(let i=0;i<lines.length;i++){if(i)await page.keyboard.press('Enter');await page.keyboard.type(lines[i],{delay});}}
async function saved(page){return page.evaluate(async()=>{const {createPracticeIndexedDbStore}=await import('/js/practiceLab/practiceIndexedDbStore.js');const store=createPracticeIndexedDbStore();await store.open();try{return await store.list('sessionSummaries');}finally{store.close();}});}
try{for(const browserName of (process.env.PRACTICE_BROWSERS??'chromium,firefox').split(',')){
 const browser=await ({chromium,firefox,webkit}[browserName]).launch();
 try{for(const [id,action,attribute,target,value,timed] of cases){
  if(process.env.PRACTICE_CASES&&!process.env.PRACTICE_CASES.split(',').includes(id))continue;
  const width=Number(process.env.PRACTICE_WIDTH??1280);
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',hasTouch:width<600});
  await context.addInitScript(()=>{
   localStorage.setItem('wordstrike.onboarding.general.v3','seen');
   globalThis.__practiceRejections=[];
   addEventListener('unhandledrejection',event=>globalThis.__practiceRejections.push({message:event.reason?.message,code:event.reason?.code,details:event.reason?.details,stack:event.reason?.stack}));
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);
  const record={browser:browserName,width,id,status:'FAIL',typed:0,errors:[]};page.on('pageerror',e=>record.errors.push(e.message));
  try{
   if(timed) await page.clock.install();
   await page.goto(`http://127.0.0.1:${server.address().port}/`);
   await page.locator('[data-action="modes"]').click();await page.locator('button[data-mode-id="practice"]').click();
   await page.locator(`[data-practice-action="open-experiment"][data-experiment-id="${id}"]`).first().click();
   if(target)await page.locator(target).fill(value);
   await page.locator(`[data-practice-action="${action}"]:enabled`).first().click();
   const input=page.locator(`[${attribute}]`);await input.waitFor({state:'visible',timeout:30000});
   assert.ok(await input.evaluate(e=>e===document.activeElement),'Initial input focus missing');
   await page.evaluate(attr=>{window.__capture=document.querySelector(`[${attr}]`);},attribute);
   const initial=await remaining(page,1);
   await type(page,initial==='x'?'z':'x');await page.keyboard.press('Backspace');
   assert.equal(await remaining(page,1),initial,'Backspace did not restore the expected character');
   const pause=page.getByRole('button',{name:'PAUSE',exact:true});
   if(await pause.count()){
    await pause.click();const held=await remaining(page,20);await (timed ? page.clock.fastForward(2000) : page.waitForTimeout(150));
    await page.getByRole('button',{name:'RESUME',exact:true}).click();
    assert.equal(await remaining(page,20),held,'Pause changed the passage');
    assert.ok(await input.evaluate(e=>e===document.activeElement),'Resume did not restore typing focus');
    record.pauseResume=true;
   }
   const starter=await remaining(page,80);await type(page,starter,25);record.typed+=starter.length;
   const button=page.getByRole('button',{name:/^(STOP|EXIT SESSION|END SESSION)$/}).first();
   if(await button.count()){
    await button.focus();await (timed ? page.clock.fastForward(750) : page.waitForTimeout(750));
    assert.ok(await button.evaluate(e=>e===document.activeElement),'Timer steals control focus');
    await input.click();
   }
   // Long generated passages can exceed 4,400 characters. At the deliberately
   // bounded typing rate, WebKit may need more than two minutes to finish them.
   // Keep every completion/persistence assertion; do not truncate the passage.
   const deadline=Date.now()+180000;
   for(let step=0;step<2000&&Date.now()<deadline;step++){
    assert.deepEqual(record.errors,[],'Unexpected browser runtime error');
    const results=await saved(page);if(results.some(r=>r.status==='completed'))break;
    if(await input.count()&&await input.isEnabled()&&await page.locator(cursor).count()){
     if(id!=='burst-sprints')assert.ok(await page.evaluate(attr=>window.__capture===document.querySelector(`[${attr}]`),attribute),'Capture replaced during a phase transition');
     const text=await remaining(page,timed?32:100);assert.ok(text.length,'No next character while session active');
     // Count sessions use real time and stay below the schema's 1000-WPM ceiling.
     await type(page,text,timed?0:15);record.typed+=text.length;
    }
    if(timed)await page.clock.fastForward(id==='burst-sprints'?5000:30000);
    else await page.waitForTimeout(50);
   }
   const rows=await saved(page);record.summaries=rows.map(r=>({sessionId:r.sessionId,status:r.status,experimentId:r.experimentId}));
   assert.equal(rows.filter(r=>r.status==='completed').length,1,'Exactly one completed session must be saved');
   await input.waitFor({state:'detached'});
   await page.screenshot({path:path.join(out,`${browserName}-${id}-result.png`)});
   const back=page.getByRole('button',{name:/^BACK TO /}).last();await back.click();
   await page.locator(`[data-practice-action="${action}"]`).first().waitFor();
   assert.deepEqual(record.errors,[]);
   const sessionId=rows.find(r=>r.status==='completed').sessionId;
   await page.reload();assert.equal((await saved(page)).filter(r=>r.sessionId===sessionId&&r.status==='completed').length,1,'Completed result lost or duplicated on reload');
   record.status='PASS';
  }catch(e){record.error=String(e);record.diagnostics=await page.evaluate(()=>({snapshot:globalThis.__practiceEngine?.getSnapshot?.(),warnings:globalThis.__practiceWarnings??[],rejections:globalThis.__practiceRejections??[]})).catch(()=>null);record.body=await page.locator('body').innerText().catch(()=>'');await page.screenshot({path:path.join(out,`${browserName}-${id}-failure.png`)}).catch(()=>{});}
  finally{reports.push(record);console.log(JSON.stringify(record));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));await context.close();}
 }}finally{await browser.close();}
}}finally{server.close();}
assert.equal(reports.filter(r=>r.status!=='PASS').length,0,'Practice end-to-end failures: inspect report.json');
