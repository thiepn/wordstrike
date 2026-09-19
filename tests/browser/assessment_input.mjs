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
const name=process.env.PRACTICE_BROWSER??'chromium',report={browser:name,url:base,status:'FAIL',checks:[],errors:[]};
let browser,page;
try{
 browser=await ({chromium,firefox,webkit}[name]).launch();
 const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
 await context.addInitScript(()=>localStorage.setItem('wordstrike.onboarding.general.v3','seen'));
 page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.locator('[data-action="modes"]').click();await page.locator('[data-mode-id="practice"]').click();
 await page.locator('[data-lab-drill="full-assessment"] button').click();
 await page.locator('[data-practice-action="start-assessment"][data-assessment-depth="quick"]:enabled').click();
 await page.locator('[data-assessment-action="next"]').click();await page.locator('[data-assessment-input]').waitFor();
 const input=page.locator('[data-assessment-input]'),passage=page.locator('[data-assessment-text]');
 const state=async()=>page.evaluate(()=>({active:document.activeElement?.outerHTML.slice(0,300),cursor:document.querySelector('[data-assessment-text]')?.dataset.cursor,value:document.querySelector('[data-assessment-input]')?.value,elapsed:document.querySelector('[data-assessment-time]')?.textContent}));
 report.initial=await state();assert.ok(await input.evaluate(e=>e===document.activeElement),'Initial focus must enter the actual typing input');
 const text=(await passage.innerText()).slice(0,60);
 await page.keyboard.type(text.slice(0,20),{delay:45});report.immediate=await state();
 report.checks.push({name:'typing immediately after block start',pass:Number(report.immediate.cursor)===20});
 report.checks.push({name:'visible current-character styling',pass:await passage.locator('.practice-real-text-char.is-current').count()===1});
 await page.locator('[data-assessment-action="exit"]').focus();
 await passage.click();report.afterPassageClick=await state();
 report.checks.push({name:'clicking passage restores typing focus',pass:await input.evaluate(e=>e===document.activeElement)});
 await page.keyboard.type(text.slice(20,40),{delay:45});report.afterPassageTyping=await state();
 report.checks.push({name:'keyboard works after passage click',pass:Number(report.afterPassageTyping.cursor)===40});
 await page.screenshot({path:path.join(out,`${name}-assessment.png`),fullPage:true});
 assert.deepEqual(report.errors,[]);assert.ok(report.checks.every(c=>c.pass),JSON.stringify(report.checks));report.status='PASS';
}catch(error){report.error=String(error);if(page){report.body=await page.locator('body').innerText().catch(()=>'');await page.screenshot({path:path.join(out,`${name}-failure.png`),fullPage:true}).catch(()=>{});}}
finally{await browser?.close();server.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
assert.equal(report.status,'PASS','Assessment input regression; inspect report.json');
