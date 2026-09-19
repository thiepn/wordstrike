import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {practiceWorkshopFamily,practiceWorkshopLayout,practiceLetterIndex,enhancePracticeWorkshop,disposePracticeWorkshop} from '../js/practiceLab/practiceLabWorkshop.js';
test('workshop families are explicit and unknown IDs cannot become style or markup',()=>{
 assert.equal(practiceWorkshopFamily('weak-keys'),'precision');assert.equal(practiceWorkshopFamily('numbers-symbols'),'real-world');
 for(const value of ['toString','<script>',null,undefined])assert.equal(practiceWorkshopFamily(value),'general');
});
test('layout values are restricted to card and compact list modes',()=>{
 assert.equal(practiceWorkshopLayout('list'),'list');for(const value of ['cards','grid','__proto__',null])assert.equal(practiceWorkshopLayout(value),'cards');
});
test('alphabetical picker has bounded, cyclic horizontal keyboard navigation',()=>{
 for(let index=0;index<26;index++){
  assert.equal(practiceLetterIndex(index,'Home'),0);assert.equal(practiceLetterIndex(index,'End'),25);
  assert.equal(practiceLetterIndex(index,'ArrowRight'),(index+1)%26);assert.equal(practiceLetterIndex(index,'ArrowLeft'),(index+25)%26);
  assert.equal(practiceLetterIndex(index,'a'),index);
 }
});
test('presentation gracefully skips non-DOM renderers and teardown is idempotent',()=>{
 const root={querySelector:()=>null};assert.doesNotThrow(()=>{enhancePracticeWorkshop(root);disposePracticeWorkshop(root);disposePracticeWorkshop(root);});
});
test('presentation has no HTML sinks, persistent state, frame loops, or session dependency',()=>{
 const source=fs.readFileSync(new URL('../js/practiceLab/practiceLabWorkshop.js',import.meta.url),'utf8');
 for(const forbidden of ['innerHTML','outerHTML','insertAdjacentHTML','localStorage','sessionStorage','indexedDB','setInterval','setTimeout','requestAnimationFrame','MutationObserver','practiceSessionEngine'])assert.ok(!source.includes(forbidden),forbidden);
 assert.ok(source.includes("button.dataset.practiceAction = 'choose-weak-key'"),'letter selection reuses existing validated actions');
 assert.ok(!source.includes("setAttribute('maxlength'"),'validation remains in the original controller');
});
