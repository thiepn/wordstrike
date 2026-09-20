import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';

const root=path.resolve(import.meta.dirname,'../..');
const out=path.join(root,'browser-artifacts/practice-boss-journey');
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

const width=Number(process.env.PRACTICE_WIDTH??390);
const browser=await chromium.launch();
const report={status:'FAIL',width,errors:[],phases:[],savedSessionId:null};

async function saved(page){
  return page.evaluate(async()=>{
    const {createPracticeIndexedDbStore}=await import('/js/practiceLab/practiceIndexedDbStore.js');
    const store=createPracticeIndexedDbStore();await store.open();
    try{return await store.list('sessionSummaries');}finally{store.close();}
  });
}
async function bossCursor(page){
  const current=page.locator('.practice-weak-key-typing .is-current').first();
  if(!await current.count())return null;
  return current.evaluate(el=>({
    index:Number(el.getAttribute('data-char-index')),
    phase:el.closest('[data-practice-view="weakness-boss-session"]')?.querySelector('.practice-weak-key-phase-card .practice-lab-card-meta span')?.textContent??null,
  }));
}
async function remainingBossText(page,limit=220){
  const current=page.locator('.practice-weak-key-typing .is-current').first();
  if(!await current.count())return '';
  return current.evaluate((el,limit)=>{
    let text='';
    for(let node=el;node&&Array.from(text).length<limit;node=node.nextElementSibling){
      text+=node.querySelector?.('br')?'\n':node.textContent;
    }
    return Array.from(text.replaceAll('\u00a0',' ')).slice(0,limit).join('');
  },limit);
}

async function typeNatural(page,text){
  let buffer='',virtualChars=0;
  const advance=async()=>{
    if(virtualChars<60)return;
    await page.clock.fastForward(Math.ceil(virtualChars/50*1000));
    virtualChars=0;
  };
  const flush=async()=>{
    if(!buffer)return;
    await page.keyboard.type(buffer);
    virtualChars+=Array.from(buffer).length;
    buffer='';
    await advance();
  };
  for(const char of Array.from(text.replaceAll('\u00a0',' '))){
    if(char==='\n'){
      await flush();
      await page.keyboard.press('Enter');
      virtualChars+=1;
      await advance();
    }else{
      buffer+=char;
      if(Array.from(buffer).length>=60)await flush();
    }
  }
  await flush();
  if(virtualChars)await page.clock.fastForward(Math.ceil(virtualChars/50*1000));
}

try{
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<600,serviceWorkers:'block',reducedMotion:'reduce'});
  await context.addInitScript(()=>localStorage.setItem('wordstrike.onboarding.general.v3','seen'));
  const page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});

  await page.evaluate(async()=>{
    const [
      {createPracticeLabController},
      {createPracticeFeatureGate},
      {createPracticeExperimentRegistry},
      {createPracticeLabRoute,PRACTICE_LAB_ROUTES},
      {createPracticeIndexedDbStore},
      {createPracticeManifestStore},
      {createPracticeRepository},
      {createPracticeIndexLoader},
      {createPracticeTargetIndex},
      {buildPracticeWeaknessBossEncounter},
      {createPracticeSessionId},
      {PRACTICE_WEAKNESS_BOSS_ARCHETYPES},
    ]=await Promise.all([
      import('/js/practiceLab/practiceLabControllerRuntimeV40.js'),
      import('/js/practiceLab/practiceFeatureGate.js'),
      import('/js/practiceLab/practiceExperimentRegistryRuntime.js'),
      import('/js/practiceLab/practiceLabRoutes.js'),
      import('/js/practiceLab/practiceIndexedDbStore.js'),
      import('/js/practiceLab/practiceManifestStore.js'),
      import('/js/practiceLab/practiceRepository.js'),
      import('/js/practiceLab/practiceIndexLoader.js'),
      import('/js/practiceLab/practiceTargetIndex.js'),
      import('/js/practiceLab/practiceWeaknessBossGenerator.js'),
      import('/js/practiceLab/practiceIds.js'),
      import('/js/practiceLab/practiceWeaknessBossConstants.js'),
    ]);

    const dataStore=createPracticeIndexedDbStore();
    const manifestStore=createPracticeManifestStore();
    const repository=createPracticeRepository({dataStore,manifestStore});
    const initialized=await repository.initializePracticeStorage();
    const fetchImpl=(input,init)=>fetch(input,init);
    const indexLoader=createPracticeIndexLoader({fetchImpl,baseUrl:'data/practice/indexes'});
    const [corpusManifest,trainingCorpus,indexManifest]=await Promise.all([
      fetch('/data/practice/manifests/en-v1.manifest.json').then(r=>r.json()),
      fetch('/data/practice/training/en-v1.json').then(r=>r.json()),
      indexLoader.loadManifest({language:'en',corpusVersion:1}),
    ]);
    const targetIndex=createPracticeTargetIndex({loader:indexLoader,corpusManifest,indexManifest});
    const candidate=Object.freeze({
      statId:'skill:word:the',entityType:'word',entityKey:'the',
      limiterStatus:'confirmed',phenotype:'launch-limited',hierarchyStatus:'independent',
      priorityScore:90,impactScore:80,limiterConfidence:.95,weaknessScore:90,
      masteryStage:'learning',saturationStatus:'not-detected',marginalGainBand:'high',
      bossTargetUtility:90,contentReady:true,
      bossTheme:Object.freeze({...PRACTICE_WEAKNESS_BOSS_ARCHETYPES['launch-limited']}),
      reasonCodes:Object.freeze(['confirmed-limiter','high-impact','learning-headroom','independent-limiter','launch-pattern']),
    });
    const corpusBinding=Object.freeze({
      corpusId:corpusManifest.corpusId,
      corpusVersion:corpusManifest.corpusVersion,
      indexVersion:indexManifest.indexSchemaVersion,
      manifestHash:corpusManifest.buildChecksum,
      language:'en',
    });
    const weaknessBossRuntime=Object.freeze({
      async loadCandidates(){
        return Object.freeze({status:'ready',available:true,candidateCount:1,candidates:Object.freeze([candidate]),recommendedCandidate:candidate,profileId:initialized.profile.profileId,contextId:initialized.context.contextId});
      },
      async prepare({statId=null,targetSource=null,sessionId=createPracticeSessionId()}={}){
        if(statId!=null&&statId!==candidate.statId)throw new Error('Unexpected Weakness Boss candidate');
        const encounter=await buildPracticeWeaknessBossEncounter({
          sessionId,context:initialized.context,targetIndex,contentItems:trainingCorpus.items,corpusBinding,
          target:candidate,targetSource:targetSource??'recommended',language:initialized.context.dataLocale,
        });
        return Object.freeze({
          experimentTarget:candidate,targetSource:targetSource??'recommended',sessionId,
          plan:encounter.plan,contentPlan:encounter.contentPlan,
          context:Object.freeze({contextId:initialized.context.contextId,dataLocale:initialized.context.dataLocale,keyboardLayout:initialized.context.keyboardLayout,inputMethod:initialized.context.inputMethod}),
        });
      },
      close(){try{dataStore.close();}catch{}},
    });

    const featureGate=createPracticeFeatureGate({publicEnabled:true});
    const registry=createPracticeExperimentRegistry({featureGate});
    const app=document.querySelector('#app');
    window.__bossLab=createPracticeLabController({
      root:app,featureGate,experimentRegistry:registry,weaknessBossRuntime,
      appNavigation:{exit(){}},
    });
    window.__bossLab.mount(createPracticeLabRoute(PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL,{experimentId:'weakness-boss'}));
  });

  await page.locator('[data-practice-view="weakness-boss-detail"]').waitFor();
  const start=page.locator('[data-practice-action="weakness-boss-start"]').first();
  await start.waitFor({state:'visible'});
  await page.clock.install();
  await start.click();

  const input=page.locator('[data-weakness-boss-input]');
  try {
    await input.waitFor({state:'visible',timeout:30000});
  } catch (error) {
    const diagnostics=await page.evaluate(()=>({
      weaknessBoss:window.__bossLab?.getSnapshot?.().weaknessBoss??null,
      view:document.querySelector('[data-practice-view]')?.getAttribute('data-practice-view')??null,
      alert:document.querySelector('[role="alert"]')?.textContent??null,
      body:document.body.innerText.slice(0,4000),
    }));
    throw new Error(`Weakness Boss did not mount its typing session: ${JSON.stringify(diagnostics)}\n${error.message}`);
  }
  assert.ok(await input.evaluate(node=>node===document.activeElement),'Weakness Boss must focus its typing capture automatically');

  const current=page.locator('.practice-weak-key-typing .is-current').first();
  const expected=await current.textContent();
  await page.keyboard.type(expected==='x'?'z':'x');
  assert.equal(await page.locator('.practice-weak-key-typing .is-error').count(),1,'Wrong Boss input must be visible');
  await page.keyboard.press('Backspace');
  assert.equal(await page.locator('.practice-weak-key-typing .is-error').count(),0,'Backspace must clear the Boss error');
  assert.ok(await input.evaluate(node=>node===document.activeElement),'Correction must preserve Boss typing focus');

  let previousCursor=-1;
  for(let guard=0;guard<240;guard++){
    if(await page.locator('[data-practice-view="weakness-boss-result"]').count())break;
    const passage=page.locator('.practice-weak-key-typing');
    await passage.waitFor({state:'visible'});
    let cursor=await bossCursor(page);
    if(!cursor){
      await page.locator('[data-practice-view="weakness-boss-result"]').waitFor({state:'visible',timeout:5000});
      break;
    }
    assert.ok(Number.isInteger(cursor.index),'Active Boss session must expose one current character');
    assert.ok(cursor.index>previousCursor,`Boss cursor stalled at ${cursor.index} during ${cursor.phase}`);
    previousCursor=cursor.index;
    const text=await remainingBossText(page);
    assert.ok(text.length>0,`Boss cursor ${cursor.index} has no remaining visible text`);
    report.phases.push({phase:cursor.phase,cursor:cursor.index,characters:Array.from(text).length});
    await passage.click();
    assert.ok(await input.evaluate(node=>node===document.activeElement),'Boss passage click must restore typing focus');
    await typeNatural(page,text);
    await page.waitForTimeout(0);
  }

  await page.locator('[data-practice-view="weakness-boss-result"]').waitFor({timeout:30000});
  await page.getByRole('heading',{name:/Boss Defeated|Encounter Incomplete/}).waitFor();
  assert.ok((await page.getByRole('heading',{name:'Boss Defeated',exact:true}).count())===1,'A complete canonical Boss dose should defeat the Boss');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'Weakness Boss result must not overflow horizontally');

  const rows=await saved(page);
  const completed=rows.filter(row=>row.experimentId==='weakness-boss'&&row.status==='completed');
  assert.equal(completed.length,1,'Weakness Boss must save exactly one completed session');
  report.savedSessionId=completed[0].sessionId;
  await page.screenshot({path:path.join(out,`boss-result-${width}.png`),fullPage:true});

  await page.reload({waitUntil:'domcontentloaded'});
  const persisted=await saved(page);
  assert.equal(persisted.filter(row=>row.sessionId===report.savedSessionId&&row.experimentId==='weakness-boss'&&row.status==='completed').length,1,'Weakness Boss completion must survive reload');
  assert.deepEqual(report.errors,[]);
  report.status='PASS';
  await context.close();
}finally{
  await browser.close();server.close();
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}
assert.equal(report.status,'PASS','Weakness Boss full browser journey failed; inspect report.json');
