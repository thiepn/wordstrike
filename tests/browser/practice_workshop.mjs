import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {chromium,firefox,webkit} from 'playwright';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'../..');
const out=path.join(root,'browser-artifacts/practice-workshop');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);res.end();return;}
 if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 try{res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=process.env.PRACTICE_URL??`http://127.0.0.1:${server.address().port}/`;
const browserName=process.env.PRACTICE_BROWSER??'chromium',reports=[];
const browser=await ({chromium,firefox,webkit}[browserName]).launch();
try{for(const width of (process.env.PRACTICE_WIDTHS??'1440,390,320').split(',').map(Number)){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',serviceWorkers:'block',hasTouch:width<600});
 await context.addInitScript(()=>localStorage.setItem('wordstrike.onboarding.general.v3','seen'));
 const page=await context.newPage();page.setDefaultTimeout(20000);const record={browser:browserName,width,status:'FAIL',errors:[],accessibility:[]};page.on('pageerror',error=>record.errors.push(error.message));
 const shot=async name=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'No horizontal page overflow');await page.screenshot({path:path.join(out,`${browserName}-${width}-${name}.png`),fullPage:true});};
 const home=async()=>{await page.locator('.pl-navigation [data-route="home"]').click();await page.locator('.pl-studio-home').waitFor();};
 const audit=async name=>{await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});const result=await page.evaluate(()=>axe.run('.practice-lab-screen',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));record.accessibility.push({name,violations:result.violations});assert.equal(result.violations.length,0,`${name}: ${JSON.stringify(result.violations)}`);};
 try{
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('[data-action="modes"]').click();await page.locator('[data-mode-id="practice"]').click();await page.locator('.pl-studio-home[data-lab-workshop]').waitFor();
  assert.equal(await page.locator('[data-lab-drill]').count(),17);await shot('home');await audit('cards');
  const input=page.locator('[data-lab-search]');await input.evaluate(el=>window.__search=el);
  await page.getByRole('button',{name:'Compact list view',exact:true}).click();assert.equal(await page.locator('.pl-studio-home').getAttribute('data-lab-layout'),'list');
  assert.ok(await input.evaluate(el=>el===window.__search),'Search input survives layout switches');
  await input.fill('keys');assert.equal(await page.locator('[data-lab-drill]:visible').count(),1);
  await page.locator('[data-lab-drill="weak-keys"] button').click();await page.locator('[data-lab-letter="e"]').waitFor();
  assert.equal(await page.locator('[data-lab-letter]').count(),26);assert.equal(await page.locator('[data-lab-letter][tabindex="0"]').count(),1);
  const a=page.locator('[data-lab-letter="a"]');await a.focus();await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.dataset.labLetter),'z');await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>document.activeElement.dataset.labLetter),'a');
  await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>document.activeElement.dataset.labLetter),'e');await page.keyboard.press('Enter');
  await page.locator('[data-practice-action="start-weak-keys"]:enabled').waitFor({timeout:30000});
  assert.equal(await page.locator('[data-weak-key-target]').inputValue(),'e');assert.equal(await page.locator('[data-lab-letter="e"]').getAttribute('aria-pressed'),'true');
  const undersized=await page.locator('[data-lab-letter]').evaluateAll(nodes=>nodes.filter(node=>{const r=node.getBoundingClientRect();return r.width<43.99||r.height<43.99;}).map(node=>({key:node.dataset.labLetter,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height})));
  assert.deepEqual(undersized,[],'Letter keys are at least 44px');
  if(width===1440){
   for(const edge of [361,801,820]){
    await page.setViewportSize({width:edge,height:1000});
    assert.equal(await page.locator('[data-lab-letter]').evaluateAll(nodes=>nodes.filter(node=>{const r=node.getBoundingClientRect();return r.width<43.99||r.height<43.99;}).length),0,'44px keys at intermediate widths');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Intermediate-width reflow');
   }
   await page.setViewportSize({width,height:1000});
  }
  await shot('letter-setup');await audit('letter setup');
  await page.locator('[data-practice-action="start-weak-keys"]:enabled').click();const capture=page.locator('[data-weak-keys-input]');await capture.waitFor();
  assert.equal(await page.locator('[data-lab-workshop],.pl-letter-picker,.pl-layout-switch,.pl-workflow').count(),0,'Workshop decorations do not enter the live session');await capture.evaluate(el=>window.__capture=el);
  const next=await page.locator('.is-current').first().evaluate(el=>{let text='';for(let n=el;n&&text.length<45;n=n.nextElementSibling)text+=n.textContent;return text.replaceAll('\u00a0',' ').slice(0,45);});
  await page.keyboard.type(next,{delay:40});await page.keyboard.press('Backspace');assert.ok(await capture.evaluate(el=>el===window.__capture&&el===document.activeElement),'Typing stays focused');await shot('typing');
  // Reopen the public catalog in a fresh navigation; no fixture engine state is used.
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('[data-action="modes"]').click();await page.locator('[data-mode-id="practice"]').click();await page.locator('.pl-studio-home').waitFor();
  await page.getByRole('button',{name:'Compact list view',exact:true}).click();await page.locator('[data-lab-filter="speed"]').click();assert.equal(await page.locator('[data-lab-drill]:visible').count(),1);
  await page.locator('#practice-catalog-title').scrollIntoViewIfNeeded();await shot('compact-library');await audit('compact library');
  await page.locator('[data-lab-drill="burst-sprints"] button').click();await home();assert.equal(await page.locator('.pl-studio-home').getAttribute('data-lab-layout'),'list');assert.equal(await page.locator('[data-lab-filter="speed"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-lab-filter="all"]').click();await input.fill('no-such-drill');await page.locator('[data-lab-empty]:visible').waitFor();await page.locator('[data-lab-action="reset"]').click();assert.equal(await page.locator('[data-lab-drill]:visible').count(),17);
  assert.equal(await page.locator('.pl-studio-home').getAttribute('data-lab-layout'),'list','Reset filters preserves the chosen layout');
  // A native click must survive an identical registry refresh between down/up.
  await page.evaluate(async url=>{
   const {renderPracticeLabHome,disposePracticeLabPresentation}=await import(new URL('js/practiceLab/practiceLabIdentity.js',url).href);
   const root=document.createElement('div');root.setAttribute('data-pointer-probe','');
   Object.assign(root.style,{position:'fixed',inset:'0',zIndex:'2147483647',overflow:'auto',background:'#101720'});document.body.append(root);
   const card={id:'weak-keys',title:'Weak Keys',description:'Letters',category:'precision',categoryLabel:'Precision',duration:'4 min',status:'available'};
   const view={title:'Practice Lab',helpAvailable:true,categories:[{id:'precision',title:'Precision',experiments:[card]}],analysis:[]};
   renderPracticeLabHome(root,view);globalThis.__probeClicks=0;
   root.addEventListener('click',event=>{if(event.target.closest('[data-experiment-id="weak-keys"]'))globalThis.__probeClicks++;});
   root.addEventListener('mousedown',()=>renderPracticeLabHome(root,structuredClone(view)),{once:true,capture:true});
   globalThis.__disposeProbe=()=>{disposePracticeLabPresentation(root);root.remove();};
  },base);
  await page.locator('[data-pointer-probe] [data-experiment-id="weak-keys"]').click();
  assert.equal(await page.evaluate(()=>globalThis.__probeClicks),1,'Background refresh must not swallow a native click');
  await page.evaluate(()=>globalThis.__disposeProbe());record.pointerRefresh=true;
  assert.deepEqual(record.errors,[]);record.status='PASS';
 }catch(error){record.error=String(error);record.focus=await page.evaluate(()=>({tag:document.activeElement?.tagName,key:document.activeElement?.dataset?.labLetter,html:document.activeElement?.outerHTML?.slice(0,400)})).catch(()=>null);record.body=await page.locator('body').innerText().catch(()=>'');await shot('failure').catch(()=>{});}
 finally{reports.push(record);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(record));await context.close();}
}}finally{await browser.close();server.close();}
assert.equal(reports.filter(row=>row.status!=='PASS').length,0,'Workshop UI failures');
