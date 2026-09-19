import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import {chromium,firefox,webkit} from 'playwright';
const root=path.resolve(import.meta.dirname,'../..');
const out=path.join(root,'browser-artifacts/practice-editor-ui');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const target=fs.existsSync(file)&&fs.statSync(file).isDirectory()?path.join(file,'index.html'):file;
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(target)]??'application/octet-stream');res.end(fs.readFileSync(target));}catch{res.writeHead(404);res.end();}
}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base=process.env.PRACTICE_URL??`http://127.0.0.1:${server.address().port}/`;
const name=process.env.PRACTICE_BROWSER??'chromium';
const browser=await ({chromium,firefox,webkit}[name]).launch(process.env.PRACTICE_EXECUTABLE?{executablePath:process.env.PRACTICE_EXECUTABLE}:{});
const reports=[];
const isEnabled=async button=>{await button.waitFor();await button.page().waitForFunction(selector=>!document.querySelector(selector)?.disabled,await button.evaluate(el=>`[data-practice-action="${el.dataset.practiceAction}"]`));};
async function records(page,table){return page.evaluate(async({base,table})=>{
 const {createPracticeIndexedDbStore}=await import(new URL('js/practiceLab/practiceIndexedDbStore.js',base).href);
 const store=createPracticeIndexedDbStore();await store.open();try{return await store.list(table);}finally{store.close();}
},{base,table});}
try{for(const width of (process.env.PRACTICE_WIDTHS??'1440,768,390,320').split(',').map(Number)){
 const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',reducedMotion:'reduce',hasTouch:width<600});
 await context.addInitScript(()=>localStorage.setItem('wordstrike.onboarding.general.v3','seen'));
 const page=await context.newPage();page.setDefaultTimeout(15000);
 const report={browser:name,width,status:'FAIL',errors:[],accessibility:[]};page.on('pageerror',e=>report.errors.push(e.message));
 const screenshot=async label=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Horizontal page overflow');await page.screenshot({path:path.join(out,`${name}-${width}-${label}.png`),fullPage:true});};
 try{
  await page.goto(base);await page.locator('[data-action="modes"]').click();await page.locator('[data-mode-id="practice"]').click();
  await page.locator('[data-lab-drill="numbers-symbols"] button').click();
  await page.locator('.pl-dual-setup').waitFor();assert.equal(await page.locator('.pl-dual-setup>section').count(),2);
  await screenshot('numbers-setup');
  await page.locator('.pl-navigation [data-route="home"]').click();
  await page.locator('[data-lab-drill="custom-text"] button').click();
  const input=page.locator('[data-custom-text-source]');const start=page.locator('[data-practice-action="custom-start"]');
  await input.waitFor();assert.ok(await start.isDisabled());
  assert.match(await page.locator('[data-custom-text-error]').innerText(),/Paste or import/);
  assert.equal(await page.locator('.practice-custom-workspace .pl-custom-sidebar').count(),1);
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const a11y=await page.evaluate(()=>axe.run('.practice-lab-screen',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));
  report.accessibility=a11y.violations;assert.deepEqual(a11y.violations,[],'Custom editor accessibility violations');
  await screenshot('editor-empty');
  await input.fill('brief');await page.waitForFunction(()=>document.querySelector('[data-custom-text-error]').textContent.includes('Add more text'));
  assert.ok(await start.isDisabled());
  const prefix='Do not include this opening. ';const selected='Only this highlighted passage is practiced.\nThis is the second line.';const suffix=' Do not include this ending.';
  const passage=prefix+selected+suffix;
  await input.fill(passage);await isEnabled(start);
  await input.evaluate(el=>{window.__editor=el;el.setSelectionRange(5,15);});
  await page.waitForTimeout(250);
  assert.deepEqual(await input.evaluate(el=>[el===window.__editor,el.selectionStart,el.selectionEnd]),[true,5,15],'Feedback must not replace the editor or selection');
  assert.equal((await records(page,'customTexts')).length,0,'Editing must not silently save source text');
  await page.locator('[data-custom-mode="timed"]').click();
  assert.ok(await start.isDisabled());assert.match(await page.locator('[data-custom-text-error]').innerText(),/duration needs/);
  await input.fill('A longer passage for timed practice. '.repeat(80));
  const minute=page.locator('[data-practice-action="custom-duration"][data-duration-ms="60000"]');
  await page.waitForFunction(()=>!document.querySelector('[data-practice-action="custom-duration"][data-duration-ms="60000"]').disabled);
  await minute.click();await isEnabled(start);
  assert.equal(await minute.getAttribute('aria-pressed'),'true');
  await screenshot('editor-timed');
  await page.locator('[data-custom-mode="selection"]').click();await input.fill(passage);await isEnabled(start);
  await input.focus();await input.evaluate(el=>el.setSelectionRange(0,5));await start.click();
  await page.waitForFunction(()=>document.querySelector('[data-custom-text-error]')?.textContent.includes('try starting again'));
  assert.ok(await start.isEnabled(),'Invalid selection must allow a corrected retry');
  await input.focus();await input.evaluate((el,{start,end})=>el.setSelectionRange(start,end),{start:prefix.length,end:prefix.length+selected.length});
  await start.click();
  const capture=page.locator('[data-custom-text-session-input]');await capture.waitFor({state:'visible'});
  assert.equal(await page.locator('.pl-custom-sidebar,.pl-dual-setup').count(),0,'Setup must not enter the live session');
  assert.ok((await page.locator('.practice-custom-text-window').innerText()).includes('Only this highlighted'));
  const lines=selected.split('\n');
  for(let i=0;i<lines.length;i++){if(i)await page.keyboard.press('Enter');await page.keyboard.type(lines[i],{delay:30});}
  await page.locator('[data-practice-view="custom-text-result"]').waitFor();
  const saved=await records(page,'sessionSummaries');assert.equal(saved.filter(row=>row.status==='completed').length,1);
  assert.equal((await records(page,'customTexts')).length,0,'Completion must not save the private source');
  await screenshot('selection-result');
  await page.getByRole('button',{name:/^BACK TO /}).last().click();
  await input.waitFor();await page.locator('[data-custom-text-title]').fill('My saved practice passage');
  await page.locator('[data-practice-action="custom-save"]:enabled').click();
  await page.waitForFunction(()=>document.querySelector('[data-custom-text-dirty]')?.textContent==='Saved on this device');
  assert.equal((await records(page,'customTexts')).length,1);
  await page.locator('[data-practice-action="custom-new"]').click();await input.waitFor();
  assert.equal(await input.inputValue(),'');
  await page.locator('[data-practice-action="custom-open"]').click();
  await page.waitForFunction(expected=>document.querySelector('[data-custom-text-source]')?.value===expected,passage);
  assert.equal(await input.inputValue(),passage);
  await screenshot('saved-library');
  assert.deepEqual(report.errors,[]);report.status='PASS';
 }catch(error){report.error=String(error);report.body=await page.locator('body').innerText().catch(()=>'');await screenshot('failure').catch(()=>{});}
 finally{reports.push(report);console.log(JSON.stringify(report));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));await context.close();}
}}finally{await browser.close();server.close();}
assert.equal(reports.filter(row=>row.status!=='PASS').length,0,'Editor UI regressions');
