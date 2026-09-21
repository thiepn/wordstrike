import {createRequire} from 'node:module';import fs from 'node:fs';import http from 'node:http';import path from 'node:path';
const require=createRequire(import.meta.url),playwright=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const root=path.resolve(import.meta.dirname,'../..');
const server=http.createServer((req,res)=>{const file=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(req.url==='/harness'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+'<link rel="stylesheet" href="/style.css">'+fs.readdirSync(root).filter(p=>/^practiceLab.*\.css$/.test(p)).map(p=>`<link rel="stylesheet" href="/${p}">`).join('')+'<body><div id="app"></div>');return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/plain');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const report=[],out=path.join(root,'browser-artifacts/practice-completion');fs.mkdirSync(out,{recursive:true});
try{for(const name of (process.env.PRACTICE_BROWSERS??'chromium,firefox,webkit').split(',')){
 const browser=await playwright[name].launch(process.env.PRACTICE_CHROMIUM_PATH&&name==='chromium'?{executablePath:process.env.PRACTICE_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}:{});
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(process.env.PRACTICE_FULL_STORAGE==='1')await context.addInitScript(()=>{
    if(localStorage.getItem('practice-quota-test-active'))return;
    localStorage.setItem('practice-quota-test-active','1');
    let i=0;
    for(const size of [131072,32768,8192,2048,512,128,16,1])for(let j=0;j<200;j++){
      try{localStorage.setItem('practice-quota-test-'+i,'q'.repeat(size));i++;}
      catch(e){if(e.name!=='QuotaExceededError')throw e;break;}
    }
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/harness`);
  await page.evaluate(async()=>{const [{createPracticeLabController},{createPracticeFeatureGate},{createPracticeExperimentRegistry}]=await Promise.all([import('/js/practiceLab/practiceLabController.js'),import('/js/practiceLab/practiceFeatureGate.js'),import('/js/practiceLab/practiceExperimentRegistry.js')]);const gate=createPracticeFeatureGate({developerMode:true});window.lab=createPracticeLabController({root:document.querySelector('#app'),featureGate:gate,experimentRegistry:createPracticeExperimentRegistry({featureGate:gate})});lab.mount();});
  await page.locator('[data-route="skill-map"]').first().waitFor();
  for(const [route,text] of [['skill-map','No skill evidence yet'],['review-queue','No reviews scheduled'],['progress','No training history']]){await page.evaluate(route=>lab.navigate({name:route}),route);await page.getByText(text,{exact:true}).waitFor();}
  const navigate=async id=>{await page.evaluate(id=>lab.navigate({name:'experiment-detail',params:{experimentId:id}}),id);};
  await page.clock.install();
  await navigate('full-assessment');await page.locator('[data-practice-action="start-assessment"][data-assessment-depth="quick"]:enabled').click();
  for(let i=0;i<3;i++){await page.locator('[data-assessment-action="next"]').click();await page.locator('[data-assessment-input]').waitFor();const text=(await page.locator('[data-assessment-text]').innerText()).slice(0,100);await page.locator('[data-assessment-input]').pressSequentially(text,{delay:20});if(await page.locator('[data-assessment-text] span').count()>500)throw Error('Assessment DOM unbounded');await page.clock.fastForward(100000);await page.locator(i===2?'[data-assessment-action="finish"], [role="alert"]':'[data-assessment-action="next"], [role="alert"]').waitFor();if(await page.locator('[role="alert"]').count())throw Error(await page.locator('body').innerText());console.log('assessment block completed',i);}
  await page.locator('[data-assessment-action="finish"]').click();await page.getByRole('heading',{name:'Assessment results',exact:true}).waitFor();
  await navigate('real-text');await page.locator('[data-practice-action="start-real-text-natural"]:enabled').click();await page.locator('[data-real-text-input]').waitFor();await page.locator('[data-real-text-input]').pressSequentially('Natural text session',{delay:60});await page.clock.fastForward(610000);await page.locator('[data-real-text-session-action="finish"]').waitFor();if(!await page.locator('h1').evaluate(el=>el===document.activeElement))throw Error('Real Text result focus missing');await page.locator('[data-real-text-session-action="finish"]').click();await page.locator('[data-practice-action="start-real-text-natural"]').waitFor();
  for(const id of ['read-ahead','metronome-typing']){await navigate(id);await page.locator('[data-practice-action="start-preview-protocol"]').focus();await page.keyboard.press('Enter');await page.locator('[data-protocol-input]').waitFor();if(!await page.locator('[data-protocol-input]').evaluate(el=>el===document.activeElement))throw Error('Typing focus was not transferred');await page.locator('[data-protocol-text]').click();if(!await page.locator('[data-protocol-input]').evaluate(el=>el===document.activeElement))throw Error(`${id} passage click did not restore typing focus`);const text=(await page.locator('[data-protocol-text]').innerText()).slice(0,80);await page.locator('[data-protocol-input]').pressSequentially(text,{delay:40});await page.clock.fastForward(id==='read-ahead'?31000:21000);if(id==='read-ahead'){const visible=await page.locator('[data-protocol-text]').innerText();if(visible.length>200)throw Error('Read-Ahead masking failed');}else{await page.clock.fastForward(30000);await page.clock.fastForward(5000);}
   await page.clock.fastForward(610000);await page.getByRole('heading',{name:'Session complete',exact:true}).waitFor();await page.screenshot({path:path.join(out,`${name}-${width}-${id}.png`)});await page.getByRole('button',{name:'BACK TO SETUP',exact:true}).click();await page.locator('[data-practice-action="start-preview-protocol"]').waitFor();
  }
  await page.evaluate(()=>lab.navigate({name:'progress'}));await page.getByText(/saved sessions in this context/).waitFor();
  const historyRoot=page.locator('[data-practice-history]');
  const history=await historyRoot.innerText();if(!history.includes('read-ahead')||!history.includes('metronome-typing'))throw Error('Protocol persistence missing');
  const metricRows=historyRoot.locator('[data-practice-history-metrics]');if(await metricRows.count()<4)throw Error('Populated history metric rows missing');
  const metricTexts=await metricRows.allInnerTexts();
  if(metricTexts.some(text=>/— WPM|— accuracy/.test(text)))throw Error('Completed session history lost canonical WPM/accuracy: '+JSON.stringify(metricTexts));
  if(metricTexts.some(text=>/\b0\.\d+% accuracy\b/.test(text)))throw Error('History appears to expose fractional accuracy as percent: '+JSON.stringify(metricTexts));
  await page.evaluate(()=>lab.navigate({name:'skill-map'}));await page.getByRole('heading',{name:'Skill Map',exact:true}).waitFor();
  if(await page.getByText('No skill evidence yet',{exact:true}).count())throw Error('Skill Map stayed empty after completed Practice sessions');
  const skills=page.locator('[data-practice-view="skill-map"] details');
  await skills.first().waitFor({state:'visible'});
  const measuredAccuracy=await skills.evaluateAll(nodes=>nodes.some(node=>/First-pass accuracy[\\s\\S]*\\d+(?:\\.\\d+)?%/.test(node.innerText)));
  if(!measuredAccuracy)throw Error('Skill Map has no measured first-pass accuracy rendered as a percent after completed Practice sessions');
  await page.evaluate(()=>lab.navigate({name:'progress'}));await page.getByText(/saved sessions in this context/).waitFor();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw Error('Horizontal overflow');
  if(errors.length)throw Error(JSON.stringify(errors));
  await page.evaluate(()=>lab.unmount());report.push({browser:name,width,status:'PASS',journeys:['assessment quick complete','real text complete','read-ahead masked complete','metronome calibrated complete','persistent history'],errors});console.log(JSON.stringify(report.at(-1)));await context.close();
 }}finally{await browser.close();}
}}finally{server.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
