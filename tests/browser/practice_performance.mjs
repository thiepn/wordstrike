import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const root=path.resolve(import.meta.dirname,'../..');
const output=path.join(root,'browser-artifacts/practice-performance');
fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/harness') {res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><head><title>Practice Lab accessibility verification</title><meta name="viewport" content="width=device-width,initial-scale=1">'+(fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<link[^>]+rel="stylesheet"[^>]*>/g)??[]).filter(tag=>!tag.includes('https://')).join('')+'</head><body><div id="app"></div></body></html>');return;}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try {res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/plain');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch(process.env.PRACTICE_CHROMIUM_PATH?{executablePath:process.env.PRACTICE_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}:{});
const report=[];
try {
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/harness`);
 console.log('Page loaded');
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Performance.enable');console.log('CPU throttle configured');
 await page.evaluate(async()=>{const [{createPracticeLabController},{createPracticeFeatureGate},{createPracticeExperimentRegistry}]=await Promise.all([import('/js/practiceLab/practiceLabController.js'),import('/js/practiceLab/practiceFeatureGate.js'),import('/js/practiceLab/practiceExperimentRegistry.js')]);const featureGate=createPracticeFeatureGate({developerMode:true});window.lab=createPracticeLabController({root:document.querySelector('#app'),featureGate,experimentRegistry:createPracticeExperimentRegistry({featureGate})});lab.mount();window.inputDurations=[];let start;document.addEventListener('beforeinput',()=>start=performance.now(),true);window.addEventListener('beforeinput',()=>inputDurations.push(performance.now()-start));});
 await page.locator('.pl-navigation [data-route="skill-map"]').waitFor();console.log('Practice ready');
 const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
 for(const id of ['read-ahead','metronome-typing']) {
  await page.evaluate(id=>lab.navigate({name:'experiment-detail',params:{experimentId:id}}),id);
  await page.locator('[data-practice-action="start-preview-protocol"]').click();await page.locator('[data-protocol-input]').waitFor();console.log('Protocol ready',id);
  await page.evaluate(()=>inputDurations=[]);const before=await metrics();console.log('Metrics ready',id);let maxNodes=0,characters=0;const began=Date.now();
  while(await page.locator('[data-protocol-input]').count()) {
   if(Date.now()-began>240000)throw Error('Protocol exceeded real-time duration budget: '+await page.locator('main').innerText());
   if(await page.locator('[data-protocol-input]').isEnabled()) {
    try {
     const character=await page.locator('[data-protocol-text] [aria-current]').textContent({timeout:1000});
     await page.locator('[data-protocol-input]').pressSequentially(character,{timeout:1000});characters++;
    } catch(error) {
     if(await page.getByRole('heading',{name:'Session complete',exact:true}).count())break;
     throw error;
    }
   }
   maxNodes=Math.max(maxNodes,await page.locator('#app *').count());await page.waitForTimeout(200);
  }
  await page.getByRole('heading',{name:'Session complete',exact:true}).waitFor();
  const durations=await page.evaluate(()=>inputDurations.sort((a,b)=>a-b));const after=await metrics();
  const result={id,viewport:390,cpuThrottle:4,clock:'real',elapsedMs:Date.now()-began,characters,inputP95Ms:durations[Math.floor(durations.length*.95)],maxNodes,heapGrowthBytes:after.JSHeapUsedSize-before.JSHeapUsedSize};report.push(result);console.log(JSON.stringify(result));
  if(result.inputP95Ms>100||maxNodes>2000||result.heapGrowthBytes>24*1024*1024)throw Error('Controlled desktop performance budget exceeded');
  await page.getByRole('button',{name:'BACK TO SETUP',exact:true}).click();
 }
 if(errors.length)throw Error(errors.join('\n'));await page.evaluate(()=>lab.unmount());await context.close();
} finally {await browser.close();server.close();fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));}
