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
  if (name === "practice-context-migration-hardening.test.js") {
    source = source.replace("assert.equal(migratedSkill.recordVersion, 2);", "assert.equal(migratedSkill.recordVersion, 3);");
  }
  if (name === "practice-error-foundation.test.js") {
    source = source.replaceAll("assert.equal(foundation.version, 3);", "assert.equal(foundation.version, 4);");
    source = source.replace("foundation analysis v3", "foundation analysis v4");
  }
  if (name === "practice-normalization-session-integration.test.js") {
    source = source.replace("assert.equal(result.summary.recordVersion, 5);", "assert.equal(result.summary.recordVersion, 6);");
    source = source.replace("assert.equal(received.foundationAnalysis.version, 3);", "assert.equal(received.foundationAnalysis.version, 4);");
    source = source.replace("foundationAnalysis v3", "foundationAnalysis v4");
  }
  if (source !== original) {
    fs.writeFileSync(file, source);
    changed += 1;
    console.log(`updated ${name}`);
  }
}
console.log(`PL11 current-version assertions updated in ${changed} test files`);
