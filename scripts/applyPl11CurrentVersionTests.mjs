import fs from "node:fs";
import path from "node:path";

const root = path.resolve("tests");
const files = fs.readdirSync(root).filter((name) => name.endsWith(".test.js"));
const replacements = [
  [/assert\.equal\(PRACTICE_RECORD_VERSIONS\.skillStat, 2\);/g, "assert.equal(PRACTICE_RECORD_VERSIONS.skillStat, 3);"],
  [/assert\.equal\(PRACTICE_RECORD_VERSIONS\.sessionSummary, 5\);/g, "assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 6);"],
  [/assert\.equal\(PRACTICE_RECORD_VERSIONS\.checkpoint, 2\);/g, "assert.equal(PRACTICE_RECORD_VERSIONS.checkpoint, 3);"],
  [/assert\.equal\(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 3\);/g, "assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 4);"],
];
let changed = 0;
for (const name of files) {
  const file = path.join(root, name);
  let source = fs.readFileSync(file, "utf8");
  const original = source;
  for (const [pattern, replacement] of replacements) source = source.replace(pattern, replacement);
  if (name === "practice-context-identity.test.js") {
    source = source.replace("assert.equal(stat.recordVersion, 2);", "assert.equal(stat.recordVersion, 3);");
    source = source.replace('assert.deepEqual(migratedStat.steps, ["skillStat:1->2"]);', 'assert.deepEqual(migratedStat.steps, ["skillStat:1->2", "skillStat:2->3"]);');
    source = source.replace("assert.equal(migratedStat.value.sampleCount, stat.sampleCount);", "assert.equal(migratedStat.value.evidence.opportunities.count, 0);\nassert.equal(migratedStat.value.legacyEvidenceV2, null);");
  }
  if (source !== original) {
    fs.writeFileSync(file, source);
    changed += 1;
    console.log(`updated ${name}`);
  }
}
console.log(`PL11 current-version assertions updated in ${changed} test files`);
