import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
function replace(path,before,after){const source=fs.readFileSync(path,'utf8');assert.equal(source.split(before).length,2,`Expected one reviewed site: ${path} / ${before.slice(0,50)}`);fs.writeFileSync(path,source.replace(before,after));}
const helper='js/practiceLab/practiceLabWorkshop.js';
replace(helper,"'pace-ladder':'speed'","'pace-ladder':'advanced'");
replace(helper,'function node(',`/** Preserve only the new picker focus across existing asynchronous setup refreshes. */
export function capturePracticeWorkshopFocus(root) {
  const active = root.ownerDocument?.activeElement;
  return active?.matches?.('[data-lab-letter]') && root.contains?.(active) && /^[a-z]$/.test(active.dataset.labLetter)
    ? active.dataset.labLetter : null;
}
export function restorePracticeWorkshopFocus(root, letter) {
  if (!/^[a-z]$/.test(letter ?? '')) return;
  const button = root.querySelector?.(\`[data-lab-letter="\${letter}"]\`);
  if (!button) return;
  for (const key of root.querySelectorAll('[data-lab-letter]')) key.tabIndex = key === button ? 0 : -1;
  button.focus({preventScroll:true});
}
function node(`);
replace(helper,"  group.addEventListener('keydown', event => {","  group.addEventListener('click', event => {\n    const button = event.target.closest?.('[data-lab-letter]');\n    if (button && group.contains(button)) button.focus({preventScroll:true});\n  }, true);\n  group.addEventListener('keydown', event => {");
const runtime='js/practiceLab/practiceLabControllerRuntimeV40.js';
replace(runtime,'import { renderPracticeLabHome',"import { capturePracticeWorkshopFocus, restorePracticeWorkshopFocus } from './practiceLabWorkshop.js';\nimport { renderPracticeLabHome");
replace(runtime,'  function renderer(renderRoot,view,renderOptions={}) {','  function renderContent(renderRoot,view,renderOptions={}) {');
replace(runtime,'  // DOM navigation must traverse every versioned controller so route loading hooks run.',`  function renderer(renderRoot,view,renderOptions={}) {
    const focus = options.renderer ? null : capturePracticeWorkshopFocus(renderRoot);
    const result = renderContent(renderRoot,view,renderOptions);
    if (!options.renderer) restorePracticeWorkshopFocus(renderRoot,focus);
    return result;
  }
  // DOM navigation must traverse every versioned controller so route loading hooks run.`);
const css='practiceLabWorkshop.css';
replace(css,'.pl-letter-picker{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px;','.pl-letter-picker{display:grid;grid-template-columns:repeat(auto-fit,minmax(44px,1fr));gap:7px;');
replace(css,'.pl-letter-picker{grid-template-columns:repeat(9,minmax(0,1fr))}','');
replace(css,'.pl-letter-picker{grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}','.pl-letter-picker{gap:8px}');
replace(css,'.pl-letter-picker{grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}','.pl-letter-picker{gap:6px}');
const browser='tests/browser/practice_workshop.mjs';
replace(browser,"assert.equal(await page.locator('[data-lab-drill]:visible').count(),2)","assert.equal(await page.locator('[data-lab-drill]:visible').count(),1)");
replace(browser,"await page.locator('[data-lab-drill=\"pace-ladder\"] button').click();await home();","await page.locator('[data-lab-drill=\"burst-sprints\"] button').click();await home();");
replace(browser,"const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',serviceWorkers:'block'});","const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',serviceWorkers:'block',hasTouch:width<600});");
replace(browser,'record.error=String(error);record.body=',"record.error=String(error);record.focus=await page.evaluate(()=>({tag:document.activeElement?.tagName,key:document.activeElement?.dataset?.labLetter,html:document.activeElement?.outerHTML?.slice(0,400)})).catch(()=>null);record.body=");
replace(browser,"assert.deepEqual(undersized,[],'Letter keys are at least 44px');",`assert.deepEqual(undersized,[],'Letter keys are at least 44px');
  if(width===1440){
   for(const edge of [361,801,820]){
    await page.setViewportSize({width:edge,height:1000});
    assert.equal(await page.locator('[data-lab-letter]').evaluateAll(nodes=>nodes.filter(node=>{const r=node.getBoundingClientRect();return r.width<43.99||r.height<43.99;}).length),0,'44px keys at intermediate widths');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Intermediate-width reflow');
   }
   await page.setViewportSize({width,height:1000});
  }
  `);
const tests='tests/practice-workshop.test.js';
replace(tests,'enhancePracticeWorkshop,disposePracticeWorkshop}','enhancePracticeWorkshop,disposePracticeWorkshop,capturePracticeWorkshopFocus,restorePracticeWorkshopFocus}');
replace(tests,"import fs from 'node:fs';","import fs from 'node:fs';\nimport {PRACTICE_EXPERIMENT_CATALOG} from '../js/practiceLab/practiceExperimentCatalog.js';");
fs.appendFileSync(tests,`\ntest('setup accent families match the actual catalog categories',()=>{
 for(const entry of PRACTICE_EXPERIMENT_CATALOG)assert.equal(practiceWorkshopFamily(entry.id),entry.category,entry.id);
});
test('only letter-picker focus is captured and restored across setup renders',()=>{
 let focused=null;
 const a={dataset:{labLetter:'a'},tabIndex:0,focus(){focused=this;}};
 const z={dataset:{labLetter:'z'},tabIndex:-1,focus(){focused=this;}};
 const active={dataset:{labLetter:'z'},matches:selector=>selector==='[data-lab-letter]'};
 const root={ownerDocument:{activeElement:active},contains:e=>e===active,querySelector:s=>s==='[data-lab-letter="z"]'?z:null,querySelectorAll:()=>[a,z]};
 const snapshot=capturePracticeWorkshopFocus(root);assert.equal(snapshot,'z');
 restorePracticeWorkshopFocus(root,snapshot);assert.equal(focused,z);assert.equal(a.tabIndex,-1);assert.equal(z.tabIndex,0);
 root.ownerDocument.activeElement={matches:()=>false};assert.equal(capturePracticeWorkshopFocus(root),null);
 focused=null;restorePracticeWorkshopFocus(root,null);restorePracticeWorkshopFocus(root,'<script>');assert.equal(focused,null);
});
`);
const doc='docs/practice-lab-workshop.md';
replace(doc,'- Letter selection dispatches existing','- The outer setup renderer preserves picker focus when recommendations finish loading; live keyboard captures remain outside this path.\n- Letter selection dispatches existing');
for(const file of [helper,runtime,browser,tests])execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
execFileSync('git',['add',helper,runtime,css,browser,tests,doc],{stdio:'inherit'});
fs.unlinkSync('.github/apply-practice-workshop.mjs');
