import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const axePath=process.env.PRACTICE_AXE_PATH??require.resolve('axe-core/axe.min.js');
const root=path.resolve(import.meta.dirname,'../..');
const output=path.join(root,'browser-artifacts/practice-accessibility');
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
 for(const width of [1280,390,320]) {
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/harness`);
  await page.evaluate(async()=>{const [{createPracticeLabController},{createPracticeFeatureGate},{createPracticeExperimentRegistry}]=await Promise.all([import('/js/practiceLab/practiceLabController.js'),import('/js/practiceLab/practiceFeatureGate.js'),import('/js/practiceLab/practiceExperimentRegistry.js')]);const featureGate=createPracticeFeatureGate({developerMode:true});window.lab=createPracticeLabController({root:document.querySelector('#app'),featureGate,experimentRegistry:createPracticeExperimentRegistry({featureGate})});lab.mount();});
  await page.addScriptTag({path:axePath});
  const audit=async name=>{
   await page.screenshot({path:path.join(output,`${width}-${name}.png`),fullPage:true});
   const results=await page.evaluate(async()=>{const r=await axe.run(document.querySelector('#app'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary,checks:n.any}))})),overflow:document.documentElement.scrollWidth>innerWidth+2};});
   // Axe cannot resolve native textarea paint in some Chromium builds. Resolve only
   // opaque, unobscured controls with no ancestor opacity/filter; retain every other incomplete.
   const nativeContrast=[];
   for(const item of results.incomplete.filter(i=>i.id==='color-contrast')) {
    for(const node of item.nodes) {
     if(node.checks.some(c=>c.data?.messageKey!=='elmPartiallyObscured'))continue;
     const measured=await page.locator(node.target.join(' ')).evaluate(el=>{
      const isTypingField=el.tagName==='TEXTAREA';
      const isScrollableRoute=el.tagName==='BUTTON'&&Boolean(el.closest('.pl-navigation'));
      if(!isTypingField&&!isScrollableRoute)return null;
      el.scrollIntoView({block:'nearest',inline:'nearest'});
      for(let p=el;p;p=p.parentElement){const s=getComputedStyle(p);if(s.opacity!=='1'||s.filter!=='none')return null;}
      const rgba=value=>{
       const numbers=value.match(/[\d.]+/g)?.map(Number);
       if(!numbers||numbers.length<3)return null;
       return [numbers[0],numbers[1],numbers[2],numbers.length>3?numbers[3]:1];
      };
      const style=getComputedStyle(el),fg=rgba(style.color);
      let background=null,backgroundSource=el;
      for(let p=el;p&&!background;p=p.parentElement){
       const candidate=rgba(getComputedStyle(p).backgroundColor);
       if(candidate&&candidate[3]>=.999){background=candidate;backgroundSource=p;}
      }
      if(!fg||fg[3]<.999||!background)return null;
      const luminance=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      const a=luminance(fg),b=luminance(background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05),rect=el.getBoundingClientRect();
      const points=isTypingField
       ? [[rect.left+5,rect.top+5],[rect.right-5,rect.top+5],[rect.left+rect.width/2,rect.top+rect.height/2]]
       : [[rect.left+rect.width/2,rect.top+rect.height/2]];
      const clear=points.every(([x,y])=>document.elementFromPoint(x,y)===el||el.contains(document.elementFromPoint(x,y)));
      return {ratio,clear,foreground:style.color,background:getComputedStyle(backgroundSource).backgroundColor,kind:isTypingField?'textarea':'scrollable-route'};
     });
     if(measured?.clear&&measured.ratio>=4.5){nativeContrast.push({target:node.target,...measured});node.resolved=true;}
    }
   }
   results.incomplete=results.incomplete.map(i=>({...i,nodes:i.nodes.filter(n=>!n.resolved)})).filter(i=>i.nodes.length);
   results.nativeContrast=nativeContrast;
   report.push({width,name,...results});console.log(JSON.stringify(report.at(-1)));
  };
  await page.locator('.pl-navigation [data-route="skill-map"]').waitFor();await audit('home');
  for(const [route,text] of [['skill-map','No skill evidence yet'],['review-queue','No reviews scheduled'],['progress','No training history']]){await page.evaluate(name=>lab.navigate({name}),route);await page.getByText(text,{exact:true}).waitFor();await audit(route);if(route!=='progress'&&!await page.locator('h1').evaluate(el=>el===document.activeElement))throw Error(`${route} lost focus while loading`);}
  for(const id of ['full-assessment','real-text','read-ahead','metronome-typing']){
   await page.evaluate(id=>lab.navigate({name:'experiment-detail',params:{experimentId:id}}),id);
   const selector=id==='full-assessment'?'[data-practice-action="start-assessment"][data-assessment-depth="quick"]':id==='real-text'?'[data-practice-action="start-real-text-natural"]':'[data-practice-action="start-preview-protocol"]';
   await page.locator(selector+':enabled').waitFor();await audit(id+'-setup');
   await page.locator(selector).focus();await page.keyboard.press('Enter');
   if(id==='full-assessment')await page.locator('[data-assessment-action="next"]').click();
   const input=id==='full-assessment'?'[data-assessment-input]':id==='real-text'?'[data-real-text-input]':'[data-protocol-input]';
   await page.locator(input).waitFor();await audit(id+'-active');
   if(!await page.locator(input).evaluate(el=>el===document.activeElement))throw Error(`${id} input did not receive focus`);
   await page.locator(input).press('Tab');
   await page.getByRole('button',{name:id==='full-assessment'?'END ASSESSMENT':id==='real-text'?'STOP':'END SESSION',exact:true}).focus();await page.keyboard.press('Enter');
   await page.locator(selector).waitFor();
  }
  if(errors.length)throw Error(errors.join('\n'));
  await page.evaluate(()=>lab.unmount());await context.close();
 }
} finally {await browser.close();server.close();fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));}
if(report.some(r=>r.violations.length||r.incomplete.length||r.overflow))throw Error('Accessibility audit failed; see report.json');
