import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
function replace(path,before,after){const source=fs.readFileSync(path,'utf8');assert.equal(source.split(before).length,2,`Expected one reviewed site: ${path}`);fs.writeFileSync(path,source.replace(before,after));}
const identity='js/practiceLab/practiceLabIdentity.js';
replace(identity,'  root.innerHTML = homeMarkup(view); // Every model string is escaped; art is a fixed allowlist.',`  const markup = homeMarkup(view);
  // Registry refreshes with identical visible data must not replace a pressed
  // button or the focused search. Keep the existing catalog and its listeners.
  const existing = root.querySelector?.('.pl-studio-home');
  if (existing && state.homeScreen === existing && state.homeMarkup === markup) {
    if (focusSelector) root.querySelector?.(focusSelector)?.focus?.({preventScroll:true});
    return true;
  }
  root.innerHTML = markup; // Every model string is escaped; art is a fixed allowlist.
  state.homeMarkup = markup;
  state.homeScreen = root.querySelector?.('.pl-studio-home');`);
const unit='tests/practice-lab-identity.test.js';
fs.appendFileSync(unit,`\ntest('identical background refreshes preserve the mounted catalog but changed data is rendered',()=>{
 const root=rootFixture();let current=null,writes=0,html='';
 Object.defineProperty(root,'innerHTML',{get:()=>html,set:value=>{html=value;current={};writes++;}});
 root.querySelector=selector=>selector==='.pl-studio-home'?current:null;
 const view=fixture();renderPracticeLabHome(root,view);const mounted=current;
 renderPracticeLabHome(root,view);renderPracticeLabHome(root,structuredClone(view));
 assert.equal(writes,1);assert.equal(current,mounted);
 const changed=fixture();changed.categories[0].experiments=[{...card,title:'Updated title'}];
 renderPracticeLabHome(root,changed);assert.equal(writes,2);assert.ok(html.includes('Updated title'));
 disposePracticeLabPresentation(root);
});
`);
const browser='tests/browser/practice_workshop.mjs';
replace(browser,"  assert.deepEqual(record.errors,[]);record.status='PASS';",`  // A native click must survive an identical registry refresh between down/up.
  await page.evaluate(async url=>{
   const {renderPracticeLabHome,disposePracticeLabPresentation}=await import(new URL('js/practiceLab/practiceLabIdentity.js',url).href);
   const root=document.createElement('div');root.setAttribute('data-pointer-probe','');
   Object.assign(root.style,{position:'fixed',inset:'0',zIndex:'2147483647',overflow:'auto',background:'#101720'});document.body.append(root);
   const card={id:'weak-keys',title:'Weak Keys',description:'Letters',category:'precision',categoryLabel:'Precision',duration:'4 min',status:'available'};
   const view={title:'Practice Lab',helpAvailable:true,categories:[{id:'precision',title:'Precision',experiments:[card]}],analysis:[]};
   renderPracticeLabHome(root,view);globalThis.__probeClicks=0;
   root.addEventListener('click',event=>{if(event.target.closest('[data-experiment-id="weak-keys"]'))globalThis.__probeClicks++;});
   root.addEventListener('mousedown',()=>renderPracticeLabHome(root,structuredClone(view)),{once:true,capture:true});
   globalThis.__disposeProbe=()=>{disposePracticeLabPresentation(root);root.remove();};
  },base);
  await page.locator('[data-pointer-probe] [data-experiment-id="weak-keys"]').click();
  assert.equal(await page.evaluate(()=>globalThis.__probeClicks),1,'Background refresh must not swallow a native click');
  await page.evaluate(()=>globalThis.__disposeProbe());record.pointerRefresh=true;
  assert.deepEqual(record.errors,[]);record.status='PASS';`);
const doc='docs/practice-lab-workshop.md';
fs.appendFileSync(doc,'\n## Interaction hardening\n\nAn identical catalog refresh used to replace the button between pointer-down and click. A native-browser regression reproduced zero activations before the fix and one afterward. Identical visible catalog updates now keep the mounted DOM, search field, layout controls, and button alive; changed catalog data still renders normally. This adds no timers, observers, or early pointer-down activation.\n');
for(const file of [identity,unit,browser])execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
execFileSync('git',['add',identity,unit,browser,doc],{stdio:'inherit'});
fs.unlinkSync('.github/apply-practice-workshop.mjs');
