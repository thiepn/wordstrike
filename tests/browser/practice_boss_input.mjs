import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';

const root=path.resolve(import.meta.dirname,'../..');
const out=path.join(root,'browser-artifacts/practice-boss-input');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/harness'){
    const css=(fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<link[^>]+rel="stylesheet"[^>]*>/g)??[]).filter(tag=>!tag.includes('https://')).join('');
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'+css+'</head><body><div id="root"></div></body></html>');return;
  }
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/plain');res.end(fs.readFileSync(file));}
  catch{res.writeHead(404);res.end();}
}).listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));

const browser=await chromium.launch();
const report={status:'FAIL',checks:[]};
try{
  const width=Number(process.env.PRACTICE_WIDTH??900);
  const context=await browser.newContext({viewport:{width,height:700},hasTouch:width<600});
  const page=await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/harness`);
  const result=await page.evaluate(async()=>{
    const {renderPracticeWeaknessBossBattle}=await import('/js/practiceLab/practiceWeaknessBossUi.js');
    const root=document.querySelector('#root');
    const session={
      weaknessBossPlan:{bossTheme:{name:'The Anchor'},target:{entityType:'key',entityKey:'e'}},
      contentPlan:{text:'eeee eeee',metadata:{weaknessBoss:{phaseRanges:[{id:'break-guard',ordinal:2,label:'Break Guard',cue:'strong',startIndex:0,endIndex:9,targetPositions:[0,1,2,3,5,6,7,8]}]}}},
    };
    const render=(cursor,lifecycle='active')=>renderPracticeWeaknessBossBattle(root,{session,snapshot:{cursorIndex:cursor,lifecycleState:lifecycle,errorPositions:[]},gameplay:{bossHp:80-cursor,battle:{cleanTargetStreak:cursor}}});
    render(0);
    const capture=root.querySelector('[data-weakness-boss-input]');
    capture.focus({preventScroll:true});
    const initial={captureCount:root.querySelectorAll('[data-weakness-boss-input]').length,hasSessionClass:capture.classList.contains('practice-session-input'),hasCaptureMarker:capture.hasAttribute('data-practice-session-capture'),inlineStyle:capture.getAttribute('style')};
    render(1);
    const after=root.querySelector('[data-weakness-boss-input]');
    const stable=after===capture&&document.activeElement===capture;
    capture.blur();
    root.querySelector('.practice-weak-key-typing').click();
    await new Promise(resolve=>queueMicrotask(resolve));
    const passageRefocus=document.activeElement===capture;
    const pause=root.querySelector('[data-weakness-boss-session-action="pause"]');
    pause.focus({preventScroll:true});
    render(1,'paused');
    const controlStable=document.activeElement===pause&&pause===root.querySelector('[data-weakness-boss-session-action="resume"]');
    const captureStillStable=root.querySelector('[data-weakness-boss-input]')===capture;
    return {initial,stable,passageRefocus,controlStable,captureStillStable,inputCount:root.querySelectorAll('[data-weakness-boss-input]').length};
  });
  assert.equal(result.initial.captureCount,1);
  assert.equal(result.initial.hasSessionClass,true);
  assert.equal(result.initial.hasCaptureMarker,true);
  assert.equal(result.initial.inlineStyle,null,'Boss input should use the shared visible Practice input surface');
  assert.equal(result.stable,true,'Boss typing capture must survive cursor updates');
  assert.equal(result.passageRefocus,true,'Clicking the Boss passage must restore typing focus');
  assert.equal(result.controlStable,true,'Pause/resume controls must keep focus instead of being stolen by typing capture');
  assert.equal(result.captureStillStable,true);
  assert.equal(result.inputCount,1);
  report.status='PASS';report.result=result;
  await page.screenshot({path:path.join(out,'boss-input.png'),fullPage:true});
  await context.close();
}finally{
  await browser.close();server.close();
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}
assert.equal(report.status,'PASS');
