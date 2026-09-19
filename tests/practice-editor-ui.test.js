import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {practiceCustomEditorFeedback,updatePracticeCustomEditorUi,renderPracticeCustomTextDetail} from '../js/practiceLab/practiceLabRendererV31.js';
const view=overrides=>({status:'ready',editor:{title:'',sourceText:''},sessionMode:'full-text',timedDurationMs:300000,sourceGraphemeCount:80,validationErrorCode:null,errorCode:null,texts:[],...overrides});
test('initial and validation messages explain how to proceed without raw error codes',()=>{
 for(const code of ['CUSTOM_TEXT_EMPTY','CUSTOM_TEXT_TOO_SHORT','CUSTOM_TEXT_TOO_LARGE']) {
  const result=practiceCustomEditorFeedback(view({validationErrorCode:code}));
  assert.equal(result.blocked,true);assert.ok(result.message.length>20);assert.ok(!result.message.includes('CUSTOM_TEXT_'));
 }
 assert.equal(practiceCustomEditorFeedback(view()).state,'ready');
 assert.equal(practiceCustomEditorFeedback(view({status:'loading'})).blocked,true);
});
test('timed readiness mirrors actual capacity and selected duration, not just total source length',()=>{
 const state=view({sessionMode:'timed',timedDurationMs:300000,timedAvailability:[{durationMs:60000,available:true},{durationMs:300000,available:false}]});
 assert.equal(practiceCustomEditorFeedback(state).blocked,true);assert.match(practiceCustomEditorFeedback(state).message,/11,000/);
 assert.equal(practiceCustomEditorFeedback({...state,timedDurationMs:60000}).blocked,false);
});
test('feedback never exposes untrusted error codes or markup',()=>{
 const result=practiceCustomEditorFeedback(view({errorCode:'<script>not trusted</script>'}));
 assert.equal(result.state,'error');assert.equal(result.message.includes('<script>'),false);
});
test('feedback updates preserve the editor and only patch dedicated text and control state',()=>{
 const count={},dirty={},error={setAttribute(k,v){this[k]=v;}},start={};
 const elements={'[data-custom-text-count]':count,'[data-custom-text-dirty]':dirty,'[data-custom-text-error]':error,"[data-practice-action='custom-start']":start};
 const root={querySelector:selector=>elements[selector]};
 updatePracticeCustomEditorUi(root,view({sourceGraphemeCount:2400,contextDataLocale:'en',dirty:true}));
 assert.equal(count.textContent,'2,400 characters · en');assert.equal(dirty.textContent,'Unsaved changes');assert.equal(start.disabled,false);assert.equal(error.role,'status');
 updatePracticeCustomEditorUi(root,view({validationErrorCode:'CUSTOM_TEXT_TOO_SHORT'}));assert.equal(start.disabled,true);
});
test('source text stays out of HTML and form controls keep labeled descriptions',()=>{
 const root={innerHTML:'',querySelector:()=>null};
 renderPracticeCustomTextDetail(root,view({editor:{title:'<img src=x onerror=alert(1)>',sourceText:'<script>private</script>'}}));
 assert.ok(!root.innerHTML.includes('onerror=alert'));assert.ok(!root.innerHTML.includes('<script>private'));
 assert.ok(root.innerHTML.includes('aria-describedby="pl-custom-source-help pl-custom-feedback"'));
 assert.ok(root.innerHTML.includes('aria-labelledby="pl-custom-session-title"'));
 assert.ok(root.innerHTML.includes('aria-pressed="true"'));
});
test('the highlighted range is read before the busy render',()=>{
 const controller=fs.readFileSync(new URL('../js/practiceLab/practiceLabControllerRuntimeV31.js',import.meta.url),'utf8');
 const start=controller.slice(controller.indexOf('  async function startCustom()'),controller.indexOf('  function input(event)'));
 assert.ok(start.indexOf('const selectionRange') < start.indexOf('rerender()'));
});
