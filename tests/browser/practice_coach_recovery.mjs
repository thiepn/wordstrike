import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";

const root=path.resolve(import.meta.dirname,"../..");
const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml",".woff2":"font/woff2"};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,"http://localhost");
  if(url.pathname==="/harness"){res.setHeader("Content-Type","text/html");res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div></body></html>');return;}
  const file=path.resolve(root,"."+decodeURIComponent(url.pathname));
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{res.setHeader("Content-Type",mime[path.extname(file)]??"text/plain");res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
}).listen(0,"127.0.0.1");
await new Promise(resolve=>server.once("listening",resolve));

const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  page.on("dialog",dialog=>void dialog.accept());
  await page.goto(`http://127.0.0.1:${server.address().port}/harness`);
  await page.evaluate(async()=>{
    const [{createPracticeLabController},{createPracticeFeatureGate},{createPracticeExperimentRegistry},{createPracticeLabRoute,PRACTICE_LAB_ROUTES}]=await Promise.all([
      import("/js/practiceLab/practiceLabControllerRuntimeV25.js"),
      import("/js/practiceLab/practiceFeatureGate.js"),
      import("/js/practiceLab/practiceExperimentRegistryRuntime.js"),
      import("/js/practiceLab/practiceLabRoutes.js"),
    ]);
    const active={
      coachPlanId:"practice-coach-plan_phase5-recovery-12345678",
      profileId:"practice-profile_phase5-recovery-12345678",
      contextId:"practice-context_phase5-recovery-12345678",
      status:"active",requestedMinutes:5,plannedMinutes:5,coverage:{label:"full"},
      blocks:[{blockId:"target-1",ordinal:1,kind:"targeted-intervention",experimentId:"weak-keys",estimatedMinutes:5,status:"active",target:{entityType:"key",entityKey:"r"},reasonCodes:["key-foundation"],responseInformed:false}],
      completion:{completedCount:0,skippedCount:0,blockedCount:0,invalidCount:0},suggestions:{},personalization:{responseInformed:false},decisionContext:{},
    };
    const recovered=structuredClone(active);
    recovered.status="finished";
    recovered.blocks[0].status="invalid";
    recovered.blocks[0].blockResult={reason:"interrupted-nonresumable"};
    recovered.completion.invalidCount=1;
    let recoverCalls=0;
    const service={
      async getTodayPracticeCoachPlan(){return active;},
      async reconcilePracticeCoachPlan(){return active;},
      async recoverInterruptedPracticeCoachBlock(){recoverCalls+=1;return {updated:true,plan:recovered};},
    };
    const initialized={profile:{profileId:active.profileId},context:{contextId:active.contextId,dataLocale:"en"}};
    const gate=createPracticeFeatureGate({developerMode:true});
    const registry=createPracticeExperimentRegistry({featureGate:gate});
    const controller=createPracticeLabController({
      root:document.querySelector("#app"),featureGate:gate,experimentRegistry:registry,
      coachRuntimeProvider:async()=>({service,repository:{getPracticeSettings(){return {dailySessionLengthMinutes:5};}},initialized,dataStore:{close(){}}}),
    });
    controller.mount(createPracticeLabRoute(PRACTICE_LAB_ROUTES.DAILY_TRAINING));
    globalThis.__phase5={controller,getRecoverCalls:()=>recoverCalls};
  });

  await page.locator('[data-practice-action="recover-coach-active"]').waitFor();
  assert.match(await page.locator("main").innerText(),/interrupted Daily Training block/i);
  await page.locator('[data-practice-action="recover-coach-active"]').click();
  await page.waitForFunction(()=>globalThis.__phase5.controller.getSnapshot().dailyCoach.planStatus==="finished");
  assert.equal(await page.evaluate(()=>globalThis.__phase5.getRecoverCalls()),1);
  assert.match(await page.locator("main").innerText(),/Interrupted/);
  assert.equal(await page.locator('[data-practice-action="recover-coach-active"]').count(),0);
  await page.evaluate(()=>globalThis.__phase5.controller.unmount());

  // A child host can fail after the service has already activated its frozen block.
  // That must reconcile automatically instead of stranding the Coach in "active".
  await page.evaluate(async()=>{
    const [{createPracticeLabController},{createPracticeFeatureGate},{createPracticeExperimentRegistry},{createPracticeLabRoute,PRACTICE_LAB_ROUTES}]=await Promise.all([
      import("/js/practiceLab/practiceLabControllerRuntimeV25.js"),
      import("/js/practiceLab/practiceFeatureGate.js"),
      import("/js/practiceLab/practiceExperimentRegistryRuntime.js"),
      import("/js/practiceLab/practiceLabRoutes.js"),
    ]);
    const pending={
      coachPlanId:"practice-coach-plan_phase5-mount-failure-12345678",
      profileId:"practice-profile_phase5-mount-failure-12345678",
      contextId:"practice-context_phase5-mount-failure-12345678",
      status:"planned",requestedMinutes:5,plannedMinutes:5,coverage:{label:"full"},
      blocks:[{blockId:"target-1",ordinal:1,kind:"targeted-intervention",experimentId:"missing-child-host",estimatedMinutes:5,status:"pending",target:{entityType:"key",entityKey:"r"},reasonCodes:["key-foundation"],responseInformed:false}],
      completion:{completedCount:0,skippedCount:0,blockedCount:0,invalidCount:0},suggestions:{},personalization:{responseInformed:false},decisionContext:{},
    };
    const active=structuredClone(pending);
    active.status="active";active.blocks[0].status="active";active.blocks[0].childSessionId="practice-session_phase5-child-12345678";
    const recovered=structuredClone(active);
    recovered.status="finished";recovered.blocks[0].status="invalid";recovered.blocks[0].blockResult={reason:"interrupted-nonresumable"};recovered.completion.invalidCount=1;
    let recoverCalls=0,startCalls=0;
    const service={
      async getTodayPracticeCoachPlan(){return pending;},
      async reconcilePracticeCoachPlan(){return pending;},
      async startPracticeCoachBlock(){startCalls+=1;return {started:true,plan:active,block:active.blocks[0],session:{sessionId:active.blocks[0].childSessionId}};},
      async recoverInterruptedPracticeCoachBlock(){recoverCalls+=1;return {updated:true,plan:recovered};},
    };
    const initialized={profile:{profileId:pending.profileId},context:{contextId:pending.contextId,dataLocale:"en"}};
    const gate=createPracticeFeatureGate({developerMode:true});
    const registry=createPracticeExperimentRegistry({featureGate:gate});
    const controller=createPracticeLabController({
      root:document.querySelector("#app"),featureGate:gate,experimentRegistry:registry,
      coachRuntimeProvider:async()=>({service,repository:{getPracticeSettings(){return {dailySessionLengthMinutes:5};}},initialized,dataStore:{close(){}}}),
    });
    controller.mount(createPracticeLabRoute(PRACTICE_LAB_ROUTES.DAILY_TRAINING));
    globalThis.__phase5Mount={controller,getRecoverCalls:()=>recoverCalls,getStartCalls:()=>startCalls};
  });
  await page.locator('[data-practice-action="start-coach-next"]').waitFor();
  await page.locator('[data-practice-action="start-coach-next"]').click();
  await page.waitForFunction(()=>globalThis.__phase5Mount.controller.getSnapshot().dailyCoach.planStatus==="finished");
  assert.equal(await page.evaluate(()=>globalThis.__phase5Mount.getStartCalls()),1);
  assert.equal(await page.evaluate(()=>globalThis.__phase5Mount.getRecoverCalls()),1);
  assert.match(await page.locator("main").innerText(),/could not start/i);
  assert.match(await page.locator("main").innerText(),/Interrupted/);
  await page.evaluate(()=>globalThis.__phase5Mount.controller.unmount());

  console.log(JSON.stringify({status:"PASS",recovered:true,mountFailureRecovered:true}));
}finally{
  await browser.close();
  server.close();
}
