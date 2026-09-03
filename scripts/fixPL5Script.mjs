import fs from "node:fs";
const file = "scripts/applyPL5.mjs";
let source = fs.readFileSync(file, "utf8");
source = source.replace('const legacyStat = { ...stat, recordVersion: 1, statId: `legacy-${stat.statId}` };', 'const legacyStat = { ...stat, recordVersion: 1, statId: "legacy-" + stat.statId };');
source = source.replace(
  'console.log("PL5 patch applied.");',
  `replaceOnce("tests/practice-foundation-contract.test.js",\n  \`  assert.equal(PRACTICE_DATABASE_VERSION, 1);\\n  assert.equal(PRACTICE_RECORD_VERSIONS.profile, 2);\\n  assert.equal(PRACTICE_STORE_NAMES.length, 9);\`,\n  \`  assert.equal(PRACTICE_DATABASE_VERSION, 2);\\n  assert.equal(PRACTICE_RECORD_VERSIONS.profile, 3);\\n  assert.equal(PRACTICE_STORE_NAMES.length, 10);\`);\n\nconsole.log("PL5 patch applied.");`
);
source = source.replace(/(?<!\\)\$\{/g, "\\${");
fs.writeFileSync(file, source);
