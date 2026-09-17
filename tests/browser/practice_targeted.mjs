import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const root=path.resolve(import.meta.dirname,'../..');
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.join(root,pathname==='/'?'index.html':pathname);
  try {
 for (const width of [1280, 390]) {
 const context=await browser.newContext({viewport:{width,height:900}});
 await context.addInitScript(()=>localStorage.setItem('wordstrike.onboarding.general.v3','seen'));
 const page=await context.newPage(); const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.locator('[data-action="modes"]').click();
 await page.locator('button[data-mode-id="practice"]').click();
 for (const mode of [
  {id:'weak-keys', target:'[data-weak-key-target]', value:'e', start:'start-weak-keys', input:'[data-weak-keys-input]', exit:'[data-weak-keys-session-action="abandon"]'},
  {id:'problem-words', target:'[data-problem-word-target]', value:'the', start:'start-problem-words', input:'[data-problem-words-input]', exit:'[data-problem-words-session-action="abandon"]'},
  {id:'accuracy-control', target:'[data-accuracy-recovery-target]', value:'e', start:'start-accuracy-recovery', input:'[data-accuracy-recovery-input]', exit:'[data-accuracy-recovery-session-action="abandon"]'},
 ]) {
  await page.locator(`[data-practice-action="open-experiment"][data-experiment-id="${mode.id}"]`).first().click();
  await page.locator(mode.target).fill(mode.value);
  const begin=Date.now();
  await page.locator(`[data-practice-action="${mode.start}"]:enabled`).waitFor({timeout:30000}).catch(async error=>{throw new Error(error.message+'\n'+await page.locator('body').innerText());});
  check(`${width} ${mode.id} available in ${Date.now()-begin}ms`);
  await page.locator(`[data-practice-action="${mode.start}"]`).click();
  await page.locator(mode.input).waitFor({timeout:30000});
  await page.evaluate(selector=>window.capture=document.querySelector(selector),mode.input);
  for(let i=0;i<30;i++) {
   const expected=await page.locator('.is-current').first().textContent();
   await page.keyboard.insertText(expected.replaceAll('\u00a0',' '));
  }
  assert.ok(await page.evaluate(selector=>window.capture===document.querySelector(selector),mode.input),'typing input was replaced during input');
  assert.ok(await page.locator(mode.input).evaluate(input=>document.activeElement===input),'typing focus lost');
  assert.ok(await page.locator('.practice-weak-key-char').count()<=400,'typing DOM unbounded');
  await page.locator(mode.exit).click();
  await page.locator(mode.target).waitFor();
  await page.locator('[data-practice-action="back"]').click();
  check(`${width} ${mode.id} starts, accepts typing, and exits`);
 }
 assert.deepEqual(errors,[]);await context.close();
 }
 report.status='PASS';
} catch(error){report.status='FAIL';report.error=String(error);throw error;}
finally {fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();server.close();}
