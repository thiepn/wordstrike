import fs from 'node:fs';
import assert from 'node:assert/strict';
const path='sw.js';let source=fs.readFileSync(path,'utf8');
assert.equal(source.split('CACHE_PREFIX + "v21"').length,2);
assert.equal(source.split('const APP_SHELL = [').length,2);
source=source.replace('CACHE_PREFIX + "v21"','CACHE_PREFIX + "v22-assessment-input"').replace('const APP_SHELL = [','const APP_SHELL = [\n  "./js/practiceLab/practiceAssessmentInput.js",');
fs.writeFileSync(path,source);fs.unlinkSync('.github/apply-assessment-offline.mjs');
