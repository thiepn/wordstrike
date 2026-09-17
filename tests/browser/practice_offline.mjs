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
  try {res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]??'application/octet-stream');res.end(fs.readFileSync(file));}
  catch {res.writeHead(404);res.end();}
}).listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const browser=await chromium.launch(process.env.PRACTICE_CHROMIUM_PATH?{executablePath:process.env.PRACTICE_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}:{});
const out=path.join(root,'browser-artifacts/practice-offline');fs.mkdirSync(out,{recursive:true});
const report={checks:[]};
const check=message=>{report.checks.push(message);console.log(message);};
try {
 const context=await browser.newContext();
 await context.addInitScript(()=>localStorage.setItem('wordstrike.onboarding.general.v3','seen'));
 let page=await context.newPage();
 const base=`http://127.0.0.1:${server.address().port}/`;
 await page.goto(base);
 await page.locator('.menu-screen').waitFor();
 // Explicit registration enables loopback testing; production registers on HTTPS/localhost.
 await page.evaluate(async()=>{await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;});
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 check('fresh service worker install');
 await context.setOffline(true);
 await page.close();page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('requestfailed',r=>{if(r.url().startsWith(base))(report.failedRequests??=[]).push(r.url());});
 await page.goto(base);
 await page.locator('.menu-screen').waitFor({timeout:15000});
 check('fresh offline document boots production shell');
 await page.locator('[data-action="modes"]').click();
 await page.locator('button[data-mode-id="practice"]').click();
 await page.locator('[data-route="skill-map"]').waitFor();
 assert.ok(!page.url().includes('dev='));
 check('public offline navigation opens Practice Lab without developer flags');
 await page.locator('[data-practice-action="open-experiment"][data-experiment-id="full-assessment"]').first().click();
 await page.locator('[data-practice-action="start-assessment"][data-assessment-depth="quick"]:enabled').click();
 await page.locator('[data-assessment-action="next"]').click();
 await page.locator('[data-assessment-input]').waitFor({timeout:15000});
 await page.locator('[data-assessment-input]').pressSequentially('Offline assessment',{delay:30});
 await page.locator('[data-assessment-action="exit"]').click();
 check('protected assessment starts offline');
 await page.locator('[data-practice-action="back"]').click();
 await page.locator('[data-practice-action="open-experiment"][data-experiment-id="real-text"]').click();
 await page.locator('[data-practice-action="start-real-text-natural"]:enabled').click({timeout:15000}).catch(async error=>{throw new Error(error.message+'\n'+await page.locator('body').innerText());});
 await page.locator('[data-real-text-input]').waitFor({timeout:15000});
 await page.locator('[data-real-text-input]').pressSequentially('Offline natural text',{delay:30});
 await page.locator('[data-real-text-session-action="stop"]').click();
 check('natural Real Text starts offline');
 await page.locator('[data-practice-action="back"]').click();
 for(const id of ['read-ahead','metronome-typing']){
  await page.locator(`[data-practice-action="open-experiment"][data-experiment-id="${id}"]`).click();
  await page.locator('[data-practice-action="start-preview-protocol"]').click();
  await page.locator('[data-protocol-input]').waitFor({timeout:15000});
  const passage=(await page.locator('[data-protocol-text]').innerText()).slice(0,120);
  await page.locator('[data-protocol-input]').pressSequentially(passage,{delay:30});
  check(`${id} starts with previously unopened content offline`);
  await page.getByRole('button',{name:'END SESSION',exact:true}).click();
  await page.locator('[data-practice-action="back"]').click();
 }
 await page.reload();
 await page.locator('[data-action="modes"]').click();
 await page.locator('button[data-mode-id="practice"]').click();
 await page.locator('[data-route="progress"]').click();
 const history=page.locator('[data-practice-history]');
 await history.getByText(/read-ahead/).first().waitFor({timeout:15000}).catch(async error=>{throw new Error(error.message+'\n'+await page.locator('body').innerText());});
 assert.match(await history.innerText(),/metronome-typing/);
 check('offline session history survives full reload');
 await context.setOffline(false);
 assert.equal(await page.evaluate(async()=> (await fetch('./manifest.webmanifest')).ok),true);
 check('network recovery succeeds');
 assert.deepEqual(errors,[]);
 assert.deepEqual(report.failedRequests??[],[]);
 report.status='PASS';
 await page.screenshot({path:path.join(out,'offline.png')});
 await context.close();
} catch(error){report.status='FAIL';report.error=String(error);throw error;}
finally {fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();server.close();}
