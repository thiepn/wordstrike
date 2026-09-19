import fs from 'node:fs';
import assert from 'node:assert/strict';
function replace(file,before,after){const source=fs.readFileSync(file,'utf8');assert.equal(source.split(before).length,2,`Expected one integration marker in ${file}`);fs.writeFileSync(file,source.replace(before,after));}
replace('index.html','<link rel="stylesheet" href="styles/strike-studio.css?v=20260918a">','<link rel="stylesheet" href="styles/strike-studio.css?v=20260918a">\n    <link rel="stylesheet" href="practiceLabIdentity.css?v=20260919a">');
replace('sw.js','CACHE_PREFIX + "v14"','CACHE_PREFIX + "v15"');
replace('sw.js','const APP_SHELL = [','const APP_SHELL = [\n  "./js/practiceLab/practiceLabIdentity.js",\n  "./practiceLabIdentity.css",\n  "./practiceLabIdentity.css?v=20260919a",');
replace('scripts/auditPracticePrivacySecurity.mjs','const REVIEWED_INNER_HTML = Object.freeze({','const REVIEWED_INNER_HTML = Object.freeze({\n  "js/practiceLab/practiceLabIdentity.js": [3, "HTML-escaped catalog/route strings; static allowlisted SVG diagrams; setup disclosures use textContent and move only explanatory nodes"],');
replace('tests/browser/practice_completion.mjs',`page.locator('[data-route="skill-map"]').waitFor()`,`page.locator('[data-route="skill-map"]').first().waitFor()`);
// Normalize the two compact protocol setup shells, without touching live sessions.
replace('js/practiceLab/practiceLabIdentity.js',`  const shell = screen.querySelector('.practice-lab-shell');`,`  let shell = screen.querySelector('.practice-lab-shell');`);
replace('js/practiceLab/practiceLabIdentity.js',`  if (!shell || !main) return;`,`  if (!shell || !main) return;\n  if (shell === main) {\n    const wrapper = document.createElement('div'); wrapper.className = 'practice-lab-shell';\n    main.before(wrapper); main.classList.remove('practice-lab-shell'); wrapper.append(main); shell = wrapper;\n  }`);
fs.rmSync('.github/apply-practice-studio.mjs');
