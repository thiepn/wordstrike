import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';

const root=path.resolve(import.meta.dirname,'../..');
const out=path.join(root,'browser-artifacts/practice-secondary-modes');
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  try{res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(fs.readFileSync(file));}
  catch{res.writeHead(404);res.end();}
}).listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));

const cases=[
  {id:'common-words',action:'start-common-words-check',input:'data-common-words-input',result:'common-words-result',timed:false},
  {id:'endurance',action:'start-endurance-check',input:'data-sustained-input',result:'endurance-result',timed:true},
  {id:'punctuation-capitals',action:'start-punctuation-capitals-check',input:'data-special-domain-input',result:'special-domain-result',timed:false},
  {id:'numbers-symbols',action:'start-numbers-symbols-check',input:'data-special-domain-input',result:'special-domain-result',timed:false},
];
const cursor='.practice-lab-screen .is-current, .practice-lab-screen [aria-current="true"]';
async function remaining(page,limit=100){
  return page.locator(cursor).first().evaluate((el,limit)=>{
    let text='';
    for(let node=el;node&&text.length<limit;node=node.nextElementSibling)text+=node.querySelector('br')?'\n':node.textContent;
    return text.replaceAll('\u00a0',' ').slice(0,limit);
  },limit);
}
async function type(page,text,delay=0){
  for(const [index,line] of text.split('\n').entries()){
    if(index)await page.keyboard.press('Enter');
    await page.keyboard.type(line,{delay});
  }
}
async function summaries(page){
  return page.evaluate(async()=>{
    const {createPracticeIndexedDbStore}=await import('/js/practiceLab/practiceIndexedDbStore.js');
    const store=createPracticeIndexedDbStore();await store.open();
    try{return await store.list('sessionSummaries');}finally{store.close();}
  });
}

const browser=await chromium.launch();
const reports=[];
try{
  for(const testCase of cases){
    const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block',reducedMotion:'reduce'});
    await context.addInitScript(()=>{
      localStorage.setItem('wordstrike.onboarding.general.v3','seen');
      localStorage.setItem('secondary-preserve','keep');
      let i=0;
      for(const size of [131072,32768,8192,2048,512,128,16,1]){
        for(let attempt=0;attempt<200;attempt++){
          try{localStorage.setItem('secondary-quota-'+i,'q'.repeat(size));i++;}
          catch(error){if(error.name!=='QuotaExceededError')throw error;break;}
        }
      }
    });
    const page=await context.newPage();page.setDefaultTimeout(30000);
    const record={id:testCase.id,status:'FAIL',typed:0,errors:[]};
    page.on('pageerror',error=>record.errors.push(error.message));
    try{
      if(testCase.timed)await page.clock.install();
      await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
      await page.locator('[data-action="modes"]').click();
      await page.locator('[data-mode-id="practice"]').click();
      await page.locator(`[data-lab-drill="${testCase.id}"] button`).click();
      const start=page.locator(`[data-practice-action="${testCase.action}"]:enabled`);
      await start.waitFor({timeout:30000});
      assert.ok(!(await page.locator('.practice-lab-screen').innerText()).includes('PRACTICE_STORAGE_'),'Storage failure visible before standardized check');
      await start.click();

      const input=page.locator(`[${testCase.input}]`);
      await input.waitFor({state:'visible',timeout:30000});
      assert.ok(await input.evaluate(el=>el===document.activeElement),'Standardized check did not focus its typing input');
      await input.evaluate(el=>window.__secondaryCapture=el);

      const initial=await remaining(page,1);
      await type(page,initial==='x'?'z':'x');
      await page.keyboard.press('Backspace');
      assert.equal(await remaining(page,1),initial,'Backspace did not restore the current character');

      const result=page.locator(`[data-practice-view="${testCase.result}"]`);
      const deadline=Date.now()+180000;
      for(let step=0;step<2500&&Date.now()<deadline;step++){
        if(await result.count())break;
        if(await input.count()&&await input.isEnabled()&&await page.locator(cursor).count()){
          assert.ok(await input.evaluate(el=>el===window.__secondaryCapture),'Typing input was replaced during standardized check');
          if(!await input.evaluate(el=>el===document.activeElement))await input.focus();
          const text=await remaining(page,testCase.timed?40:120);
          assert.ok(text.length,'Active standardized check has no next character');
          await type(page,text,testCase.timed?5:12);
          record.typed+=text.length;
        }
        if(testCase.timed)await page.clock.fastForward(30000);
        else await page.waitForTimeout(25);
      }
      await result.waitFor({state:'visible',timeout:30000});

      const rows=(await summaries(page)).filter(row=>row.experimentId===testCase.id&&row.status==='completed');
      assert.equal(rows.length,1,'Standardized check did not save exactly one completed summary');
      record.sessionId=rows[0].sessionId;
      assert.equal(await page.evaluate(()=>localStorage.getItem('secondary-preserve')),'keep','Practice touched unrelated localStorage');
      assert.deepEqual(record.errors,[]);

      await page.screenshot({path:path.join(out,`${testCase.id}-result.png`),fullPage:true});
      await page.reload({waitUntil:'domcontentloaded'});
      assert.equal((await summaries(page)).filter(row=>row.sessionId===record.sessionId&&row.status==='completed').length,1,'Standardized check completion did not persist across reload');
      record.status='PASS';
    }catch(error){
      record.error=String(error);
      record.body=await page.locator('body').innerText().catch(()=>'');
      await page.screenshot({path:path.join(out,`${testCase.id}-failure.png`),fullPage:true}).catch(()=>{});
    }finally{
      reports.push(record);
      console.log(JSON.stringify(record));
      fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));
      await context.close();
    }
  }
}finally{
  await browser.close();server.close();
}
assert.equal(reports.filter(row=>row.status!=='PASS').length,0,'One or more standardized Practice checks failed');
