import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium, firefox } from 'playwright';
const root=path.resolve(import.meta.dirname,'../..');
const out=path.join(root,'browser-artifacts/practice-playability');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{let file=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]??'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const cases=[
 ['weak-keys','start-weak-keys','data-weak-keys-input','[data-weak-key-target]','e'],
 ['combination-repair','prepare-combination-repair','data-combination-input','[data-combination-target]','th'],
 ['problem-words','start-problem-words','data-problem-words-input','[data-problem-word-target]','the'],
 ['accuracy-control','start-accuracy-recovery','data-accuracy-recovery-input','[data-accuracy-recovery-target]','e'],
 ['burst-sprints','start-burst-sprints','data-burst-input'],
 ['pace-ladder','start-pace-ladder','data-pace-input'],
 ['common-words','start-common-words-practice','data-common-words-input'],
 ['real-text','start-real-text-natural','data-real-text-input'],
 ['consistency-trainer','start-consistency','data-sustained-input'],
 ['metronome-typing','start-preview-protocol','data-protocol-input'],
 ['read-ahead','start-preview-protocol','data-protocol-input'],
 ['endurance','start-endurance-practice','data-sustained-input'],
 ['punctuation-capitals','start-punctuation-capitals-practice','data-special-domain-input'],
 ['numbers-symbols','start-numbers-symbols-practice','data-special-domain-input'],
 ['custom-text','custom-start','data-custom-text-session-input','[data-custom-text-source]','This is a local practice passage. Type each word carefully, correct mistakes, and keep a steady rhythm. The next line is also part of this exercise.\nThen finish the final sentence.'],
];
const reports=[];
try{for(const name of (process.env.PRACTICE_BROWSERS??'chromium').split(',')){
 const browser=await ({chromium,firefox}[name]).launch();
 try{for(const [id,action,attribute,target,value] of cases){
  const context=await browser.newContext({viewport:{width:1280,height:900}});await context.addInitScript(()=>localStorage.setItem('wordstrike.onboarding.general.v3','seen'));
  const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[],record={browser:name,id,status:'FAIL'};page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.locator('[data-action="modes"]').click();await page.locator('button[data-mode-id="practice"]').click();await page.locator(`[data-practice-action="open-experiment"][data-experiment-id="${id}"]`).first().click();
   if(target){await page.locator(target).fill(value);}
   const start=page.locator(`[data-practice-action="${action}"]:enabled`).first();await start.waitFor({timeout:30000});record.setup=await page.locator('body').innerText();const started=Date.now();await start.click();
   const input=page.locator(`[${attribute}]`);await input.waitFor({state:'attached',timeout:30000});record.startMs=Date.now()-started;
   await page.evaluate(attr=>{window.__practiceCapture=document.querySelector(`[${attr}]`);window.__acceptedInputs=0;document.addEventListener('beforeinput',()=>window.__acceptedInputs++,true);},attribute);
   record.focusBefore=await input.evaluate(e=>e===document.activeElement);
   const current=page.locator('.is-current,[aria-current="true"]').first();await current.waitFor();
   const text=await current.evaluate(e=>{let result='';for(let n=e;n&&result.length<100;n=n.nextElementSibling)result+=n.textContent;return result.replaceAll('\u00a0',' ');});
   record.initialText=text;await page.keyboard.type(text.slice(0,80),{delay:25});await page.waitForTimeout(300);
   record.inputStable=await page.evaluate(attr=>window.__practiceCapture===document.querySelector(`[${attr}]`),attribute);
   record.focusAfter=await input.evaluate(e=>e===document.activeElement);record.typed=await page.locator('.is-typed').count();record.inputEvents=await page.evaluate(()=>window.__acceptedInputs);
   record.currentAfter=await current.textContent();record.runtime=await page.locator('body').innerText();
   await page.screenshot({path:path.join(out,`${name}-${id}.png`)});
   assert.ok(record.inputStable,'Typing input is replaced during typing/timer ticks');assert.ok(record.focusAfter,'Typing focus lost');assert.ok(record.inputEvents>=Math.min(80,text.length),'Keystrokes did not reach the input');assert.deepEqual(errors,[]);
   record.status='PASS';
  }catch(error){record.error=String(error);record.body=await page.locator('body').innerText().catch(()=>'(unavailable)');await page.screenshot({path:path.join(out,`${name}-${id}-failure.png`)}).catch(()=>{});}
  finally{record.errors=errors;reports.push(record);console.log(JSON.stringify(record));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));await context.close();}
 }}finally{await browser.close();}
}}finally{server.close();}
assert.equal(reports.filter(r=>r.status!=='PASS').length,0,'Public practice playability failures; inspect report.json');
