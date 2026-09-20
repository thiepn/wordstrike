import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';

const root=path.resolve(import.meta.dirname,'../..');
const out=path.join(root,'browser-artifacts/practice-research-probe-input');fs.mkdirSync(out,{recursive:true});
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
const report={status:'FAIL'};
try{
  const width=Number(process.env.PRACTICE_WIDTH??900);\n  const context=await browser.newContext({viewport:{width,height:700},hasTouch:width<600});
  const page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/harness`);
  const result=await page.evaluate(async()=>{
    const {renderPracticeResearchProbeSnapshot}=await import('/js/practiceLab/practiceResearchProbeSessionHost.js');
    const root=document.querySelector('#root');
    const contentPlan={text:'measure this text'};
    const render=(cursor,lifecycle='active')=>renderPracticeResearchProbeSnapshot(root,{contentPlan,snapshot:{cursorIndex:cursor,lifecycleState:lifecycle,errorPositions:[],content:{expectedLength:17}},phase:'baseline'});
    render(0);
    const capture=root.querySelector('[data-research-probe-input]');capture.focus({preventScroll:true});
    const initial={count:root.querySelectorAll('[data-research-probe-input]').length,sessionClass:capture.classList.contains('practice-session-input'),captureMarker:capture.hasAttribute('data-practice-session-capture'),inlineStyle:capture.getAttribute('style')};
    render(1);
    const stable=root.querySelector('[data-research-probe-input]')===capture&&document.activeElement===capture;
    capture.blur();root.querySelector('.practice-research-probe-typing').click();await new Promise(resolve=>queueMicrotask(resolve));
    const passageRefocus=document.activeElement===capture;
    const pause=root.querySelector('[data-research-probe-action="pause"]');pause.focus({preventScroll:true});render(1,'paused');
    const controlStable=document.activeElement===pause&&pause===root.querySelector('[data-research-probe-action="resume"]');
    return {initial,stable,passageRefocus,controlStable,captureStillStable:root.querySelector('[data-research-probe-input]')===capture,count:root.querySelectorAll('[data-research-probe-input]').length};
  });
  assert.equal(result.initial.count,1);
  assert.equal(result.initial.sessionClass,true);
  assert.equal(result.initial.captureMarker,true);
  assert.equal(result.initial.inlineStyle,null);
  assert.equal(result.stable,true);
  assert.equal(result.passageRefocus,true);
  assert.equal(result.controlStable,true);
  assert.equal(result.captureStillStable,true);
  assert.equal(result.count,1);
  report.status='PASS';report.result=result;
  await page.screenshot({path:path.join(out,'research-probe-input.png'),fullPage:true});
  await context.close();
}finally{await browser.close();server.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
assert.equal(report.status,'PASS');
