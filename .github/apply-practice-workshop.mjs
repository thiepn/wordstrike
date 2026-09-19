import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
function replace(file,before,after){const s=fs.readFileSync(file,'utf8');assert.equal(s.split(before).length,2,file);fs.writeFileSync(file,s.replace(before,after));}
const renderer='js/practiceLab/practiceLabRendererV31.js';
replace(renderer,`  const code = view.errorCode ?? view.validationErrorCode;
  if (code) return { state: view.errorCode ? "error" : "waiting", message: Object.hasOwn(messages, code) ? messages[code] : "This action could not be completed. Check the passage and try again.", blocked: true };`, `  const code = view.errorCode ?? view.validationErrorCode;
  const blocked = Boolean(view.validationErrorCode || view.localeMismatch || !["ready", "editing"].includes(view.status) ||
    (view.sessionMode === "timed" && !view.timedAvailability?.some(row => row.durationMs === view.timedDurationMs && row.available)));
  if (code) {
    const message = view.errorCode === "CUSTOM_TEXT_TOO_SHORT" && view.sessionMode === "selection"
      ? "Highlight at least 20 characters in the editor, then try starting again."
      : Object.hasOwn(messages, code) ? messages[code] : "This action could not be completed. Check the passage and try again.";
    // An operation error explains a failed attempt; it must not lock out a valid retry.
    return { state: view.errorCode ? "error" : "waiting", message, blocked };
  }`);
const unit='tests/practice-editor-ui.test.js';fs.appendFileSync(unit,`\ntest('an invalid selection can be corrected and retried without editing the passage',()=>{
 const result=practiceCustomEditorFeedback(view({sessionMode:'selection',errorCode:'CUSTOM_TEXT_TOO_SHORT'}));
 assert.equal(result.state,'error');assert.equal(result.blocked,false);assert.match(result.message,/Highlight/);
 assert.equal(practiceCustomEditorFeedback(view({errorCode:'CUSTOM_TEXT_SAVE_FAILED'})).blocked,false);
});
`);
const browser='tests/browser/practice_editor_ui.mjs';
replace(browser,`  await input.focus();await input.evaluate((el,{start,end})=>el.setSelectionRange(start,end),{start:prefix.length,end:prefix.length+selected.length});`,`  await input.focus();await input.evaluate(el=>el.setSelectionRange(0,5));await start.click();
  await page.waitForFunction(()=>document.querySelector('[data-custom-text-error]')?.textContent.includes('try starting again'));
  assert.ok(await start.isEnabled(),'Invalid selection must allow a corrected retry');
  await input.focus();await input.evaluate((el,{start,end})=>el.setSelectionRange(start,end),{start:prefix.length,end:prefix.length+selected.length});`);
replace(browser,`await page.locator('[data-practice-action="custom-open"]').click();assert.equal(await input.inputValue(),passage);`,`await page.locator('[data-practice-action="custom-open"]').click();
  await page.waitForFunction(expected=>document.querySelector('[data-custom-text-source]')?.value===expected,passage);
  assert.equal(await input.inputValue(),passage);`);
replace(browser,"import http from 'node:http';","import http from 'node:http';\nimport {createRequire} from 'node:module';\nconst require=createRequire(import.meta.url);");
replace(browser,"const report={browser:name,width,status:'FAIL',errors:[]}","const report={browser:name,width,status:'FAIL',errors:[],accessibility:[]}");
replace(browser,"  await screenshot('editor-empty');",`  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const a11y=await page.evaluate(()=>axe.run('.practice-lab-screen',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));
  report.accessibility=a11y.violations;assert.deepEqual(a11y.violations,[],'Custom editor accessibility violations');
  await screenshot('editor-empty');`);
const css='practiceLabWorkshop.css';fs.appendFileSync(css,`
/* Keep the mobile setup header and writing desk compact without shrinking targets. */
.practice-lab-screen[data-lab-workshop] .practice-lab-shell > .practice-lab-header {
  display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
}
@media(max-width:600px) {
  .practice-lab-screen .practice-custom-editor textarea { height:260px; }
}
`);
execFileSync('git',['add',renderer,unit,browser,css]);
fs.unlinkSync('.github/apply-practice-workshop.mjs');
