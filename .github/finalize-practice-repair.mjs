import fs from 'node:fs';
import assert from 'node:assert/strict';
const base='js/practiceLab/';
for(const name of fs.readdirSync(base).filter(n=>n.endsWith('SessionHost.js'))){
 const file=base+name;let source=fs.readFileSync(file,'utf8');
 source=source.replaceAll('./practiceSessionDom.js','./practiceHostDom.js');
 if(['practiceRealTextSessionHost.js','practicePreviewProtocolSessionHost.js','practiceAssessmentSessionHost.js'].includes(name)){
  assert.ok(!source.includes('wirePracticeKeyboardCorrections'),name);
  source='import { wirePracticeKeyboardCorrections } from "./practiceHostDom.js";\n'+source;
  source=source.replace(/(export async function mount[^\n]+\{)\n/, '$1\n  wirePracticeKeyboardCorrections(root);\n');
 }
 if(name==='practiceSpecialDomainSessionHost.js'){
  const marker='} else if (event.inputType === "deleteContentBackward")';assert.ok(source.includes(marker));
  source=source.replace(marker,'} else if (["insertLineBreak", "insertParagraph"].includes(event.inputType)) engine.handleInput(normalizedInput("character", "\\n"));\n    else if (event.inputType === "deleteContentBackward")');
 }
 if(name==='practicePreviewProtocolSessionHost.js')source=source.replace("else if(e.inputType==='deleteContentBackward')send('backspace','');", "else if(e.inputType==='deleteContentBackward')send('backspace','');else if(e.inputType==='deleteWordBackward')send('word-delete','');");
 if(name==='practiceAssessmentSessionHost.js')source=source.replace("else if(event.inputType==='deleteContentBackward')send('backspace','');", "else if(event.inputType==='deleteContentBackward')send('backspace','');else if(event.inputType==='deleteWordBackward')send('word-delete','');");
 fs.writeFileSync(file,source);
}
fs.rmSync(base+'practiceSessionDom.js',{force:true});
let sw=fs.readFileSync('sw.js','utf8');assert.ok(sw.includes('CACHE_PREFIX + "v13"'));
sw=sw.replace('CACHE_PREFIX + "v13"','CACHE_PREFIX + "v14"').replace('const APP_SHELL = [','const APP_SHELL = [\n  "./js/practiceLab/practiceHostDom.js",\n  "./practiceLabPlayability.css",\n  "./practiceLabPlayability.css?v=20260919a",');fs.writeFileSync('sw.js',sw);
const test='tests/browser/practice_end_to_end.mjs';let code=fs.readFileSync(test,'utf8');
code=code.replace('   await page.clock.install();\n','').replace('   await page.goto(', '   await page.clock.install();\n   await page.goto(');
code=code.replace('else await page.waitForTimeout(10);','else await page.clock.runFor(100);');
code=code.replace('Date.now()+60000','Date.now()+120000');
fs.writeFileSync(test,code);
