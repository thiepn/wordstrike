import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {chromium,firefox,webkit} from 'playwright';
const require=createRequire(import.meta.url);
const root=path.resolve(import.meta.dirname,'../..');
const out=path.join(root,'browser-artifacts/practice-identity');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);res.end();return;}if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');try{res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));
const reports=[],base=process.env.PRACTICE_URL??`http://127.0.0.1:${server.address().port}/`,browserName=process.env.PRACTICE_BROWSER??'chromium';
const widths=(process.env.PRACTICE_WIDTHS??'1440,768,390,320').split(',').map(Number);
const browser=await ({chromium,firefox,webkit}[browserName]).launch();
try{for(const width of widths){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',serviceWorkers:'block',hasTouch:width<600});
 await context.addInitScript(()=>localStorage.setItem('wordstrike.onboarding.general.v3','seen'));
 const page=await context.newPage();page.setDefaultTimeout(20000);
 const record={browser:browserName,width,status:'FAIL',errors:[],a11y:[],setups:[]};page.on('pageerror',error=>record.errors.push(error.message));
 const shot=async name=>page.screenshot({path:path.join(out,`${browserName}-${width}-${name}.png`),fullPage:false});
 async function noOverflow(stage){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),`Horizontal page overflow at ${stage}`);}
 async function home(){
  const nav=page.locator('.pl-navigation [data-route="home"]');
  await nav.waitFor({state:'visible'});
  await nav.click();
  try{await page.locator('.pl-studio-home').waitFor({timeout:4000});}
  catch{
   // Firefox can replace an availability-driven setup between pointer actionability
   // checks and click dispatch. Retry once against the current navigation node.
   await page.locator('.pl-navigation [data-route="home"]').click({force:true});
   await page.locator('.pl-studio-home').waitFor();
  }
 }
 async function audit(stage){await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});const result=await page.evaluate(async()=>axe.run('.practice-lab-screen',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));record.a11y.push({stage,violations:result.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});assert.equal(result.violations.length,0,`Accessibility violations at ${stage}: ${JSON.stringify(record.a11y.at(-1))}`);}
 try{
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('[data-action="modes"]').click();await page.locator('button[data-mode-id="practice"]').click();await page.locator('.pl-studio-home').waitFor();
  const catalog=page.locator('[data-lab-drill]');record.catalogSize=await catalog.count();assert.equal(record.catalogSize,17,'All registered experiments remain discoverable');assert.equal(await catalog.locator('svg').count(),17);
  await noOverflow('home');await shot('home');if(width===1440||width===390)await audit('home');
  const search=page.locator('[data-lab-search]');await search.evaluate(e=>window.__search=e);await search.fill('keys');assert.equal(await page.locator('[data-lab-drill]:visible').count(),1);assert.ok(await search.evaluate(e=>e===window.__search&&e===document.activeElement));
  await page.locator('[data-lab-filter="speed"]').click();await page.locator('[data-lab-empty]:visible').waitFor();await shot('no-matches');await page.locator('[data-lab-action="reset"]').click();assert.equal(await search.inputValue(),'');assert.equal(await page.locator('[data-lab-drill]:visible').count(),17);
  await page.locator('[data-lab-filter="precision"]').click();assert.equal(await page.locator('[data-lab-drill]:visible').count(),4);await page.locator('[data-lab-drill="weak-keys"] button').focus();assert.ok(await page.locator('[data-lab-drill="weak-keys"]').evaluate(e=>e.contains(document.activeElement)));await page.keyboard.press('Enter');await page.locator('[data-weak-key-target]').waitFor();
  await home();assert.equal(await page.locator('[data-lab-filter="precision"]').getAttribute('aria-pressed'),'true');await page.locator('[data-lab-filter="all"]').click();await page.locator('[data-lab-action="library"]').click();assert.ok(await page.locator('#practice-catalog-title').evaluate(e=>e===document.activeElement));await shot('library');
  const smallTargets=await page.locator('.pl-studio-home button:visible').evaluateAll(nodes=>nodes.filter(n=>{const r=n.getBoundingClientRect();return r.width<43||r.height<43}).map(n=>({text:n.textContent,rect:n.getBoundingClientRect().toJSON()})));assert.deepEqual(smallTargets,[],'Home controls provide 44px targets');
  const ids=await catalog.evaluateAll(nodes=>nodes.map(n=>n.dataset.labDrill));
  for(const id of ids){await page.locator(`[data-lab-drill="${id}"] button`).click();await page.locator('.pl-navigation').waitFor();await page.locator('.practice-lab-detail h1').first().waitFor();await noOverflow(id);record.setups.push({id,title:await page.locator('.practice-lab-screen h1').first().innerText()});if(['weak-keys','custom-text','full-assessment','numbers-symbols'].includes(id)){await shot(`${id}-setup`);await page.screenshot({path:path.join(out,`${browserName}-${width}-${id}-full.png`),fullPage:true});}assert.equal(await page.locator('.pl-method-note input,.pl-method-note button,.pl-method-note select,.pl-method-note textarea').count(),0,'Setup controls are never collapsed');await home();}
  for(const route of ['daily-training','skill-map','review-queue','progress']){await page.locator(`.pl-navigation [data-route="${route}"]`).click();await page.locator('.pl-navigation').waitFor();await noOverflow(route);await shot(route);assert.equal(await page.locator(`.pl-navigation [data-route="${route}"]`).getAttribute('aria-current'),'page',`Current route ${route}`);await home();}
  await page.locator('[data-lab-drill="custom-text"] button').click();await page.locator('[data-custom-text-source]').fill('Practice is deliberate. Keep the cursor in view.\nA second line checks Enter and a saved result.');await page.locator('[data-practice-action="custom-start"]:enabled').click();
  const input=page.locator('[data-custom-text-session-input]');await input.waitFor({state:'visible'});assert.equal(await page.locator('.pl-navigation').count(),0,'Catalog navigation stays out of the live typing workspace');await input.evaluate(e=>window.__capture=e);await page.keyboard.type('x');await page.keyboard.press('Backspace');assert.equal(await page.locator('.practice-lab-screen .is-current').first().textContent(),'P');await page.keyboard.type('Practice is deliberate. ',{delay:35});await noOverflow('live typing');await shot('typing');assert.ok(await input.evaluate(e=>window.__capture===e&&e===document.activeElement));await page.keyboard.type('Keep the cursor in view.',{delay:35});await page.keyboard.press('Enter');await page.keyboard.type('A second line checks Enter and a saved result.',{delay:35});await page.locator('[data-practice-view="custom-text-result"]').waitFor();await noOverflow('result');await shot('result');if(width===1440||width===390)await audit('result');assert.deepEqual(record.errors,[]);record.status='PASS';
 }catch(error){record.error=String(error);record.body=await page.locator('body').innerText().catch(()=>'');await shot('failure').catch(()=>{});}
 finally{reports.push(record);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(record));await context.close();}
}}finally{await browser.close();server.close();}
assert.equal(reports.filter(r=>r.status!=='PASS').length,0,'Practice Studio UI regression failure');
