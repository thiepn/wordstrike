import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

const rootDir=path.resolve(import.meta.dirname,'../..');
const out=path.join(rootDir,'browser-artifacts/practice-focus-ownership');
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/harness'){
    const css=(fs.readFileSync(path.join(rootDir,'index.html'),'utf8').match(/<link[^>]+rel="stylesheet"[^>]*>/g)??[]).filter(tag=>!tag.includes('https://')).join('');
    res.setHeader('Content-Type','text/html');
    res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'+css+'</head><body><div id="root"></div></body></html>');
    return;
  }
  const file=path.resolve(rootDir,'.'+decodeURIComponent(url.pathname));
  if(file!==rootDir&&!file.startsWith(rootDir+path.sep)){res.writeHead(403);res.end();return;}
  try{res.setHeader('Content-Type',mime[path.extname(file)]??'text/plain');res.end(fs.readFileSync(file));}
  catch{res.writeHead(404);res.end();}
}).listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));

const browser=await chromium.launch();
const report={status:'FAIL',checks:[]};
try{
  const context=await browser.newContext({viewport:{width:1000,height:760}});
  const page=await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/harness`);

  for(const type of ['boss','research','coach-review']){
    const result=await page.evaluate(async type=>{
      const root=document.querySelector('#root');
      root.replaceChildren();
      const state={cursorIndex:0,lifecycleState:'active',errorPositions:[],content:{expectedLength:9}};
      let subscriber=null;
      const snapshot=()=>({...state,errorPositions:[...state.errorPositions],content:{...state.content}});
      const engine={
        async prepare(){},
        subscribe(listener){subscriber=listener;return()=>{subscriber=null;};},
        async start(){return snapshot();},
        getSnapshot(){return snapshot();},
        handleInput(){return {accepted:true,position:state.cursorIndex,correctness:'correct'};},
        async pause(){state.lifecycleState='paused';subscriber?.(snapshot(),'paused');return snapshot();},
        async resume(){state.lifecycleState='active';subscriber?.(snapshot(),'resumed');return snapshot();},
        async abandon(){state.lifecycleState='abandoned';return snapshot();},
        async complete(){return {summary:{}};},
        async handleVisibilityState(){return snapshot();},
        async destroy(){},
        emitActive(){state.lifecycleState='active';state.cursorIndex=Math.min(8,state.cursorIndex+1);subscriber?.(snapshot(),'tick');},
      };
      const initialized={profile:{profileId:'practice-profile_focus-owner-12345678'},context:{contextId:'practice-context_focus-owner-12345678',fingerprint:'focus-owner-fingerprint',dataLocale:'en',keyboardLayout:'qwerty',inputMethod:'physical',hardwareProfileId:null}};
      const dependencies={initialized,repository:{},dataStore:{close(){}},manifestStore:{},engineFactory:()=>engine};

      let host,inputSelector,pauseSelector,resumeSelector,controlSelector;
      if(type==='boss'){
        const {mountPracticeWeaknessBossSession}=await import('/js/practiceLab/practiceWeaknessBossSessionHost.js');
        const contextBinding={...initialized.context};
        host=await mountPracticeWeaknessBossSession({
          root,
          session:{
            experiment:{id:'weakness-boss'},configuration:{},
            weaknessBossPlan:{sessionId:'practice-session_focus-boss-12345678',target:{entityType:'key',entityKey:'e'},bossTheme:{name:'The Anchor'},contextBinding},
            contentPlan:{text:'eeee eeee',metadata:{weaknessBoss:{phaseRanges:[{id:'break-guard',ordinal:2,label:'Break Guard',cue:'strong',startIndex:0,endIndex:9,targetPositions:[0,1,2,3,5,6,7,8]}]}}},
          },
          dependencies,
        });
        inputSelector='[data-weakness-boss-input]';pauseSelector='[data-weakness-boss-session-action="pause"]';resumeSelector='[data-weakness-boss-session-action="resume"]';controlSelector='[data-weakness-boss-session-action="abandon"]';
      }else if(type==='research'){
        const {mountPracticeResearchProbeSession}=await import('/js/practiceLab/practiceResearchProbeSessionHost.js');
        host=await mountPracticeResearchProbeSession({
          root,
          session:{experiment:{id:'research-probe'},configuration:{},sessionId:'practice-session_focus-research-12345678',researchProbePlan:{phase:'baseline'},contentPlan:{text:'abcdefghi'}},
          dependencies,
        });
        inputSelector='[data-research-probe-input]';pauseSelector='[data-research-probe-action="pause"]';resumeSelector='[data-research-probe-action="resume"]';controlSelector='[data-research-probe-action="exit"]';
      }else{
        const {mountPracticeCoachReviewSession}=await import('/js/practiceLab/practiceCoachReviewSessionHost.js');
        host=await mountPracticeCoachReviewSession({
          root,
          session:{experiment:{id:'daily-coach-review'},configuration:{},sessionId:'practice-session_focus-review-12345678',reviewPlan:{bindings:[]},contentPlan:{text:'abcdefghi'}},
          dependencies,
        });
        inputSelector='[data-coach-review-input]';pauseSelector='[data-coach-review-action="pause"]';resumeSelector='[data-coach-review-action="resume"]';controlSelector='[data-coach-review-action="abandon"]';
      }

      await new Promise(resolve=>queueMicrotask(resolve));
      const input=root.querySelector(inputSelector);
      const initialFocus=document.activeElement===input;

      const control=root.querySelector(controlSelector);
      control.focus({preventScroll:true});
      engine.emitActive();
      await new Promise(resolve=>queueMicrotask(resolve));
      const controlSurvived=document.activeElement===control;

      root.querySelector(pauseSelector).click();
      await new Promise(resolve=>queueMicrotask(resolve));
      const resume=root.querySelector(resumeSelector);
      const pausedRendered=Boolean(resume);
      resume?.click();
      await Promise.resolve();
      await new Promise(resolve=>queueMicrotask(resolve));
      const resumeRestoredTyping=document.activeElement===root.querySelector(inputSelector);

      await host.exit();
      return {type,initialFocus,controlSurvived,pausedRendered,resumeRestoredTyping};
    },type);
    assert.equal(result.initialFocus,true,`${type}: initial typing focus missing`);
    assert.equal(result.controlSurvived,true,`${type}: active snapshot stole focus from a control`);
    assert.equal(result.pausedRendered,true,`${type}: pause did not render Resume`);
    assert.equal(result.resumeRestoredTyping,true,`${type}: Resume did not intentionally restore typing focus`);
    report.checks.push(result);
  }

  report.status='PASS';
  await page.screenshot({path:path.join(out,'focus-ownership.png'),fullPage:true});
  await context.close();
}finally{
  await browser.close();server.close();
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}
assert.equal(report.status,'PASS');
