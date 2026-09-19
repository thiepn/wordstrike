import fs from 'node:fs';
import assert from 'node:assert/strict';
const audit='scripts/auditPracticePrivacySecurity.mjs';let source=fs.readFileSync(audit,'utf8');
for(const name of ['AccuracyRecovery','BurstSprints','CombinationRepair','CommonWords','CustomText','PaceLadder','ProblemWords','SpecialDomain','Sustained','WeakKeys']){
 const marker=`"js/practiceLab/practice${name}SessionHost.js":`;
 assert.ok(source.includes(marker),name);source=source.split('\n').filter(line=>!line.includes(marker)).join('\n');
}
source=source.replace('const REVIEWED_INNER_HTML = Object.freeze({','const REVIEWED_INNER_HTML = Object.freeze({\n  "js/practiceLab/practiceHostDom.js": [2, "central host reconciler and non-DOM test fallback; markup supplied exclusively by escaped session renderers, never raw typed input; private Custom Text graphemes use textContent"],');
fs.writeFileSync(audit,source);
const test='tests/browser/practice_end_to_end.mjs';let code=fs.readFileSync(test,'utf8');
code=code.replace('   await page.clock.install();','   if(timed) await page.clock.install();');
code=code.replace('await page.clock.fastForward(2000);','await (timed ? page.clock.fastForward(2000) : page.waitForTimeout(150));');
code=code.replace('await page.clock.fastForward(750);','await (timed ? page.clock.fastForward(750) : page.waitForTimeout(750));');
code=code.replace('step<420','step<2000').replace('else await page.clock.runFor(100);','else await page.waitForTimeout(50);');
assert.ok(code.includes('res.end(fs.readFileSync(file));'));
code=code.replace('res.end(fs.readFileSync(file));','res.end(browserSource(file));');
const diagnostic=`\n// The test server exposes read-only engine diagnostics; engine behavior is unchanged.\nfunction browserSource(file){\n const bytes=fs.readFileSync(file);\n if(!file.endsWith('/js/practiceLab/practiceSessionEngine.js')) return bytes;\n return bytes.toString().replace('export function createPracticeSessionEngine(options = {}) {','function createInstrumentedPracticeSessionEngine(options = {}) {')+\n \`\\nexport function createPracticeSessionEngine(options={}) {\n const engine=createInstrumentedPracticeSessionEngine({...options,logger:{warn(...args){(globalThis.__practiceWarnings??=[]).push(args.map(x=>x?.code??x?.message??String(x)));}}});\n globalThis.__practiceEngine=engine;return engine;\n }\`;\n}\n`;
code=code.replace('const cases=[',diagnostic+'\nconst cases=[');
code=code.replace("record.error=String(e);record.body=", "record.error=String(e);record.diagnostics=await page.evaluate(()=>({snapshot:globalThis.__practiceEngine?.getSnapshot?.(),warnings:globalThis.__practiceWarnings??[]})).catch(()=>null);record.body=");
fs.writeFileSync(test,code);
const workflow='.github/workflows/practice-playability.yml';let yml=fs.readFileSync(workflow,'utf8');
yml=yml.replace("if: always() && matrix.browser != 'webkit'","if: ${{ !cancelled() && matrix.browser != 'webkit' }}");
yml=yml.replace('      - name: Assessment and protected protocol regression\n        if: always()', '      - name: Assessment and protected protocol regression\n        if: ${{ !cancelled() }}');
fs.writeFileSync(workflow,yml);
