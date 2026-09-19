import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const runtime='js/practiceLab/practiceLabControllerRuntimeV31.js';
let s=fs.readFileSync(runtime,'utf8');
s=s.replace('renderPracticeLabV31, renderPracticeCustomTextDetail','renderPracticeLabV31, renderPracticeCustomTextDetail, updatePracticeCustomEditorUi');
let a=s.indexOf('    const count = root?.querySelector?.("[data-custom-text-count]")'),b=s.indexOf('    const save = ',a);
assert.ok(a>=0&&b>a);s=s.slice(0,a)+'    updatePracticeCustomEditorUi(root, { ...state, dirty: dirty() });\n'+s.slice(b);
a=s.indexOf('    const start = root?.querySelector?.("[data-practice-action=\'custom-start\']")');b=s.indexOf('    for (const button',a);assert.ok(a>=0&&b>a);s=s.slice(0,a)+s.slice(b);
const before=`    state = { ...state, starting: true, errorCode: null }; rerender();
    try {
      const registration = experimentRegistry.getRegistration(CUSTOM);
      const source = root?.querySelector?.("[data-custom-text-source]");
      const selectionRange = state.sessionMode === "selection" ? { start: source?.selectionStart ?? -1, end: source?.selectionEnd ?? -1 } : null;`;
const after=`    // Capture the user's highlighted range before the busy-state render replaces the editor.
    const source = root?.querySelector?.("[data-custom-text-source]");
    const selectionRange = state.sessionMode === "selection" ? { start: source?.selectionStart ?? -1, end: source?.selectionEnd ?? -1 } : null;
    state = { ...state, starting: true, errorCode: null }; rerender();
    try {
      const registration = experimentRegistry.getRegistration(CUSTOM);`;
assert.ok(s.includes(before));s=s.replace(before,after);fs.writeFileSync(runtime,s);
const helper='js/practiceLab/practiceLabWorkshop.js';s=fs.readFileSync(helper,'utf8');
const marker='  enhanceLetterPicker(screen, document);';assert.equal(s.split(marker).length,2);
s=s.replace(marker,`  if (['numbers-symbols','punctuation-capitals'].includes(view.experimentId)) {
    const sections = [...main.querySelectorAll(':scope > section.practice-lab-empty-state')];
    if (sections.length === 2 && sections.every(section => section.querySelector('button[data-practice-action]'))) {
      const active = document.activeElement;
      const pair = node(document,'div','pl-dual-setup');
      sections[0].before(pair); pair.append(...sections);
      if (pair.contains(active)) active.focus({preventScroll:true});
    }
  }
  enhanceLetterPicker(screen, document);`);fs.writeFileSync(helper,s);
const css='practiceLabWorkshop.css';
fs.appendFileSync(css,`

/* Session setup controls: clear grouping, usable field sizes, visible selected states. */
.practice-lab-screen[data-lab-workshop] .practice-lab-detail fieldset {
  min-inline-size: 0;
  margin: 22px 0;
  padding: 0;
  border: 0;
}
.practice-lab-screen[data-lab-workshop] .practice-lab-detail legend {
  margin-bottom: 10px;
  padding: 0;
  color: var(--pl-muted);
  font: 600 12px/1.6 var(--font-ui,system-ui,sans-serif);
}
.practice-lab-screen[data-lab-workshop] .practice-lab-duration-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.practice-lab-screen[data-lab-workshop] .practice-lab-duration-grid button {
  min-height: 48px;
  min-width: 64px;
  border-radius: 6px;
  background: var(--color-bg,#0a0e14);
  font-variant-numeric: tabular-nums;
}
.practice-lab-screen[data-lab-workshop] .practice-lab-duration-grid button[aria-pressed='true'] {
  background: var(--pl-raised);
  border-color: var(--pl-skill);
  color: var(--pl-ink);
  box-shadow: inset 0 -3px var(--pl-skill);
}
.practice-lab-screen[data-lab-workshop] .practice-lab-detail input:is([type='text'],[type='number']) {
  min-height: 48px;
  padding: 10px 13px;
  max-width: 100%;
}
.practice-lab-screen[data-lab-workshop] .practice-lab-detail select { max-width:100%; }
.practice-lab-screen[data-lab-workshop] .practice-lab-detail label { color: var(--pl-muted); }
.practice-lab-screen[data-lab-workshop] .practice-lab-detail .practice-lab-primary-action:not(:disabled) {
  background: var(--pl-skill);
  border-color: var(--pl-skill);
  color: #101720;
}
.pl-dual-setup {
  display: grid;
  grid-template-columns: minmax(0,1.15fr) minmax(0,1fr);
  gap: 22px;
  align-items: stretch;
  margin-block: 24px;
}
.practice-lab-screen .pl-dual-setup > section { margin:0; min-width:0; border-radius:8px; }
.practice-lab-screen .pl-dual-setup > section:first-child { border-top:3px solid var(--pl-skill); }
.practice-lab-screen .pl-dual-setup > section:last-child { background:transparent; }

/* Custom Text: a writing desk beside the session controls, not a long settings form. */
.practice-lab-screen[data-practice-view='custom-text-detail'] .practice-custom-workspace {
  grid-template-columns: minmax(0,1fr) minmax(265px,310px);
  gap: 22px;
  margin-top: 24px;
}
.practice-lab-screen .pl-custom-sidebar { display:grid; gap:20px; min-width:0; }
.practice-lab-screen .pl-custom-configuration {
  border:1px solid var(--pl-rule);
  border-top:3px solid var(--pl-skill);
  padding:22px;
  border-radius:8px;
  background:var(--pl-surface);
  min-width:0;
}
.practice-lab-screen .pl-custom-configuration h2 { margin:8px 0 22px; font-size:26px; }
.practice-lab-screen .practice-lab-detail .practice-custom-editor {
  padding:24px;
  border-radius:8px;
  background:var(--pl-surface);
  min-width:0;
}
.pl-custom-section-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:20px; }
.practice-lab-screen .pl-custom-section-heading h2 { font-size:28px; margin:8px 0 0; }
.practice-lab-screen .practice-custom-editor label { position:relative; margin-block:18px; font-size:13px; font-weight:600; gap:9px; }
.pl-field-optional { position:absolute; right:0; top:0; color:var(--pl-quiet); font-size:11px; font-weight:400; }
.practice-lab-screen .practice-custom-editor textarea {
  min-height:300px;
  max-height:65dvh;
  padding:20px;
  font:400 16px/1.85 var(--font-game,ui-monospace,monospace);
  border-radius:6px;
  resize:vertical;
  tab-size:4;
}
.practice-lab-screen .practice-custom-editor input { border-radius:6px; }
.practice-lab-screen .practice-custom-editor-meta { opacity:1; color:var(--pl-muted); font-size:12px; gap:8px 14px; }
.practice-lab-screen .practice-custom-editor-meta [data-custom-text-dirty] { color:var(--pl-skill); }
.practice-lab-screen .pl-custom-hint { font-size:12px; line-height:1.7; color:var(--pl-quiet); margin-block:12px 18px; }
.practice-lab-screen .practice-custom-toolbar {
  justify-content:flex-start;
  margin-top:22px;
  padding-top:18px;
  border-top:1px solid var(--pl-rule);
  gap:8px;
}
.practice-lab-screen .practice-custom-toolbar [data-practice-action='custom-save']:not(:disabled) { color:var(--pl-skill); border-color:var(--pl-skill); }
.practice-lab-screen .practice-custom-toolbar .pl-custom-delete { margin-left:auto; }
.practice-lab-screen .practice-custom-toolbar .pl-custom-delete:not(:disabled):hover { color:var(--color-danger,#ff969e); border-color:currentColor; background:transparent; }
.practice-lab-screen .pl-custom-modes .practice-lab-duration-grid { display:grid; grid-template-columns:1fr; }
.practice-lab-screen .pl-custom-modes button { display:grid; gap:5px; position:relative; padding:14px 36px 14px 14px; text-align:left; letter-spacing:0; }
.practice-lab-screen .pl-custom-modes button strong { font-size:14px; font-weight:650; }
.practice-lab-screen .pl-custom-modes button span { font-size:12px; line-height:1.6; font-weight:400; color:var(--pl-muted); }
.practice-lab-screen .pl-custom-modes button::after { content:''; position:absolute; top:17px; right:14px; width:12px; height:12px; border:1px solid var(--pl-quiet); border-radius:50%; }
.practice-lab-screen .pl-custom-modes button[aria-pressed='true']::after { border:3px solid var(--pl-skill); background:var(--pl-ink); }
.practice-lab-screen .pl-custom-configuration [data-custom-text-error] { padding:13px 14px; margin-block:18px; font-size:12px; line-height:1.7; border:1px dashed var(--pl-rule); border-radius:6px; color:var(--pl-muted); overflow-wrap:anywhere; }
.practice-lab-screen .pl-custom-configuration [data-state='ready'] { border-style:solid; border-left:3px solid var(--pl-skill); }
.practice-lab-screen .pl-custom-configuration [data-state='error'] { border-style:solid; border-color:var(--color-danger,#ff969e); }
.practice-lab-screen .pl-custom-configuration [data-practice-action='custom-start'] { width:100%; }
.practice-lab-screen .practice-lab-detail .practice-custom-library { padding:20px; border-radius:8px; max-height:300px; overflow:auto; }
.practice-lab-screen .practice-custom-library h2 { font-size:20px; margin:0; }
.practice-lab-screen .practice-custom-library-item { background:transparent; border-color:transparent; gap:6px; margin:10px 0 0; padding:12px; border-radius:6px; }
.practice-lab-screen .practice-custom-library-item strong { overflow-wrap:anywhere; }
.practice-lab-screen .practice-custom-library-item span { color:var(--pl-muted); opacity:1; }
.practice-lab-screen .practice-custom-library-item[aria-current='true'] { outline:none; border-color:var(--pl-skill); background:var(--pl-raised); }
.practice-lab-screen .pl-custom-privacy { display:grid; gap:5px; border-left-color:var(--pl-skill); background:var(--pl-surface); }
.practice-lab-screen .pl-custom-privacy strong { color:var(--pl-ink); font-size:14px; }
.practice-lab-screen .pl-custom-privacy span { font-size:12px; line-height:1.7; }
@media(max-width:850px) {
  .pl-dual-setup { grid-template-columns:1fr; }
  .practice-lab-screen[data-practice-view='custom-text-detail'] .practice-custom-workspace { grid-template-columns:1fr; }
  .practice-lab-screen .pl-custom-sidebar { grid-template-columns:minmax(0,1.2fr) minmax(0,1fr); align-items:start; }
}
@media(max-width:600px) {
  .practice-lab-screen .pl-custom-sidebar { grid-template-columns:1fr; }
  .practice-lab-screen .practice-lab-detail .practice-custom-editor,.practice-lab-screen .pl-custom-configuration { padding:17px; }
  .practice-lab-screen .pl-custom-section-heading h2 { font-size:25px; }
  .practice-lab-screen .practice-custom-editor textarea { min-height:220px; padding:14px; }
  .practice-lab-screen .practice-custom-toolbar button { padding-inline:10px; font-size:11px; }
  .practice-lab-screen .practice-custom-toolbar .pl-custom-delete { margin-left:0; }
  .practice-lab-screen .practice-custom-editor-meta { font-size:11px; }
  .practice-lab-screen .pl-custom-section-heading { flex-wrap:wrap; }
  .practice-lab-screen .pl-dual-setup .practice-lab-primary-action { width:100%; }
}
@media(forced-colors:active) {
  .practice-lab-screen .pl-custom-modes button[aria-pressed='true'] { outline:2px solid Highlight; }
  .practice-lab-screen .pl-custom-modes button[aria-pressed='true']::after { background:Highlight; border-color:Highlight; }
}
`);
const sw='sw.js';s=fs.readFileSync(sw,'utf8');assert.ok(s.includes('CACHE_PREFIX + "v16"'));fs.writeFileSync(sw,s.replace('CACHE_PREFIX + "v16"','CACHE_PREFIX + "v17"'));
fs.appendFileSync('docs/practice-lab-workshop.md',`\n## Editor and setup continuation\n\nCustom Text now separates the writing desk from the session settings and saved library. Selection modes have descriptions, source feedback explains how to proceed instead of exposing error codes, and timed readiness follows the existing capacity checks. The highlighted range is captured before a busy-state render, so Selection practices the intended excerpt. Numbers/Symbols and Punctuation/Capitals present practice and standardized checks side by side on wide screens. Setup fields and duration choices use consistently sized controls. No live host, score, schema, or stored source policy is changed.\n\nReferences checked during this continuation: W3C form notifications (https://www.w3.org/WAI/tutorials/forms/notifications/) for actionable error text and associated controls; W3C keyboard-interface guidance (https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) for native controls and visible focus; Monkeytype (https://monkeytype.com/) as a focus-first typing reference. These are design inputs, not evidence of measured learning gains.\n`);
execFileSync('git',['add',runtime,helper,css,sw,'docs/practice-lab-workshop.md']);
fs.unlinkSync('.github/apply-practice-workshop.mjs');
