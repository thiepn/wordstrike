import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

const root=path.resolve(import.meta.dirname,'../..');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/harness'){
    res.setHeader('Content-Type','text/html');
    res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>');
    return;
  }
  let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{res.setHeader('Content-Type',mime[path.extname(file)]??'text/plain');res.end(fs.readFileSync(file));}
  catch{res.writeHead(404);res.end();}
}).listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));

const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.goto(`http://127.0.0.1:${server.address().port}/harness`);
  await page.evaluate(async()=>{
    const [
      {createPracticeLabController},
      {createPracticeFeatureGate},
      {createPracticeExperimentRegistry},
      {createPracticeLabRoute,PRACTICE_LAB_ROUTES},
    ]=await Promise.all([
      import('/js/practiceLab/practiceLabControllerRuntimeV25.js'),
      import('/js/practiceLab/practiceFeatureGate.js'),
      import('/js/practiceLab/practiceExperimentRegistry.js'),
      import('/js/practiceLab/practiceLabRoutes.js'),
    ]);

    let resolveRuntime;
    const runtimePromise=new Promise(resolve=>{resolveRuntime=resolve;});
    let createdRequestedMinutes=null;
    const initialized={
      profile:{profileId:'practice-profile_budget-race-12345678'},
      context:{contextId:'practice-context_budget-race-12345678',dataLocale:'en'},
    };
    const service={
      async getTodayPracticeCoachPlan(){return null;},
      async createTodayPracticeCoachPlan({requestedMinutes}){
        createdRequestedMinutes=requestedMinutes;
        return {plan:{
          coachPlanId:'practice-coach_budget-race-12345678',
          status:'finished',
          requestedMinutes,
          plannedMinutes:0,
          coverage:{label:'underfilled'},
          blocks:[],
          completion:{completedCount:0},
          suggestions:{},
          personalization:{responseInformed:false},
        }};
      },
    };
    const repository={getPracticeSettings(){return {dailySessionLengthMinutes:12};}};
    const gate=createPracticeFeatureGate({developerMode:true});
    const registry=createPracticeExperimentRegistry({featureGate:gate});
    const controller=createPracticeLabController({
      root:document.querySelector('#app'),
      featureGate:gate,
      experimentRegistry:registry,
      coachRuntimeProvider:()=>runtimePromise,
    });
    controller.mount(createPracticeLabRoute(PRACTICE_LAB_ROUTES.DAILY_TRAINING));
    globalThis.__budgetRace={controller,resolveRuntime,service,repository,initialized,getCreated:()=>createdRequestedMinutes};
  });

  await page.locator('[data-coach-minutes="5"]').waitFor();
  await page.locator('[data-coach-minutes="5"]').click();
  assert.equal(await page.evaluate(()=>globalThis.__budgetRace.controller.getSnapshot().dailyCoach.requestedMinutes),5,'click must update the pending budget immediately');

  await page.evaluate(()=>globalThis.__budgetRace.resolveRuntime({
    service:globalThis.__budgetRace.service,
    repository:globalThis.__budgetRace.repository,
    initialized:globalThis.__budgetRace.initialized,
    dataStore:{close(){}},
  }));
  await page.waitForFunction(()=>globalThis.__budgetRace.controller.getSnapshot().dailyCoach.status==='ready');
  assert.equal(await page.evaluate(()=>globalThis.__budgetRace.controller.getSnapshot().dailyCoach.requestedMinutes),5,'async settings load must not overwrite an explicit budget');

  await page.locator('[data-practice-action="create-coach-plan"]:enabled').click();
  await page.waitForFunction(()=>globalThis.__budgetRace.getCreated()!==null);
  assert.equal(await page.evaluate(()=>globalThis.__budgetRace.getCreated()),5,'plan creation must snapshot the selected budget before awaiting runtime work');
  assert.equal(await page.evaluate(()=>globalThis.__budgetRace.controller.getSnapshot().dailyCoach.requestedMinutes),5);

  await page.evaluate(()=>globalThis.__budgetRace.controller.unmount());
  console.log(JSON.stringify({status:'PASS',requestedMinutes:5,createdRequestedMinutes:5}));
}finally{
  await browser.close();
  server.close();
}
