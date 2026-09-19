import fs from 'node:fs';
import assert from 'node:assert/strict';
function replace(path, before, after) {
 const source=fs.readFileSync(path,'utf8');
 assert.equal(source.split(before).length,2,`Expected one reviewed integration site: ${path}`);
 fs.writeFileSync(path,source.replace(before,after));
}
const identity='js/practiceLab/practiceLabIdentity.js';
replace(identity,'/** Practice Studio:',"import { enhancePracticeWorkshop, disposePracticeWorkshop } from './practiceLabWorkshop.js';\n/** Practice Studio:");
replace(identity,'  roots.get(root)?.dispose(); roots.delete(root);','  disposePracticeWorkshop(root); roots.get(root)?.dispose(); roots.delete(root);');
replace(identity,'  applyFilters(root, state);\n  const target =','  applyFilters(root, state);\n  enhancePracticeWorkshop(root, view);\n  const target =');
replace(identity,'    section.replaceWith(details);\n  }\n}','    section.replaceWith(details);\n  }\n  enhancePracticeWorkshop(root, view);\n}');
replace('index.html','    <link rel="stylesheet" href="practiceLabIdentity.css?v=20260919a">','    <link rel="stylesheet" href="practiceLabIdentity.css?v=20260919a">\n    <link rel="stylesheet" href="practiceLabWorkshop.css?v=20260919b">');
replace('sw.js','CACHE_PREFIX + "v15"','CACHE_PREFIX + "v16"');
replace('sw.js','const APP_SHELL = [','const APP_SHELL = [\n  "./js/practiceLab/practiceLabWorkshop.js",\n  "./practiceLabWorkshop.css",\n  "./practiceLabWorkshop.css?v=20260919b",');
fs.unlinkSync('.github/apply-practice-workshop.mjs');
