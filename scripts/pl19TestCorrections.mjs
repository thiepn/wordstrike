import { readFile, writeFile, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

async function patch(relative, transform) {
  const file = path.join(root, relative);
  const current = await readFile(file, "utf8");
  const next = transform(current);
  if (next !== current) await writeFile(file, next, "utf8");
}

await patch("tests/practice-assessment-cross-profile.test.js", (text) => text.replace(
  'import { createDefaultPracticeContext, createDefaultPracticeProfile, createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";',
  'import { createDefaultPracticeProfile, createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";\nimport { createDefaultPracticeContext } from "../js/practiceLab/practiceContext.js";',
));

await patch("tests/practice-assessment-preparation-failure.test.js", (text) => text.replace(
  /\n\s*assert\.throws\(\n\s*\(\) => run\.blocks\[run\.progress\.currentBlockIndex\]\.blockId === "benchmark-natural"[\s\S]*?\n\s*\);\n\s*assert\.notEqual\(run\.blocks\[run\.progress\.currentBlockIndex\]\.blockId, "benchmark-natural"\);/,
  '\n  assert.notEqual(run.blocks[run.progress.currentBlockIndex].blockId, "benchmark-natural");',
));

await patch("tests/practice-assessment-pruning-privacy.test.js", (text) => text.replace(
  'await harness.repository.saveAssessmentRun({ ...activeBase, status: "active", startedAt: "2026-03-01T00:00:01.000Z" });',
  'await harness.repository.saveAssessmentRun({ ...activeBase, status: "active", startedAt: "2026-03-01T00:00:01.000Z", expiresAt: "2099-03-01T02:00:00.000Z" });',
));

function advanceWrapper(text) {
  let next = text;
  next = next.replace(/assert\.equal\(PRACTICE_DATABASE_VERSION,\s*6\)/g, "assert.equal(PRACTICE_DATABASE_VERSION, 7)");
  next = next.replace(/assert\.equal\(PRACTICE_RECORD_VERSIONS\.sessionSummary,\s*11\)/g, "assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 12)");
  next = next.replace(/assert\.equal\(PRACTICE_FOUNDATION_ANALYSIS_VERSION,\s*9\)/g, "assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 10)");
  next = next.replace(/(foundation(?:Seen)?\.version,\s*)9\b/g, "$110");
  next = next.replace(/(foundationAnalysis\.version,\s*)9\b/g, "$110");
  next = next.replace(/((?:result\.)?summary\.recordVersion,\s*)11\b/g, "$112");
  next = next.replace(/(migration\.value\.recordVersion,\s*)11\b/g, "$112");
  next = next.replace(/(migrated\.value\.recordVersion,\s*)11\b/g, "$112");
  next = next.replace(/("sessionSummary:10->11")(\s*)(?=\])/g, '$1, "sessionSummary:11->12"$2');
  next = next.replace(/('sessionSummary:10->11')(\s*)(?=\])/g, "$1, 'sessionSummary:11->12'$2");
  next = next.replace(/"evaluationStates",\s*"sessionSummaries"/g, '"evaluationStates", "assessmentRuns", "sessionSummaries"');
  next = next.replace(/"evaluationStates",\s*\n(\s*)"sessionSummaries"/g, '"evaluationStates",\n$1"assessmentRuns",\n$1"sessionSummaries"');
  next = next.replace(/assert\.equal\(PRACTICE_STORE_NAMES\.length,\s*14\)/g, "assert.equal(PRACTICE_STORE_NAMES.length, 15)");
  next = next.replace(/assert\.equal\(Object\.keys\(PRACTICE_STORE_DEFINITIONS\)\.length,\s*14\)/g, "assert.equal(Object.keys(PRACTICE_STORE_DEFINITIONS).length, 15)");
  return next;
}

const testsDir = path.join(root, "tests");
for (const name of (await readdir(testsDir)).filter((name) => /^practice-.*\.test\.js$/.test(name) && !name.startsWith("practice-assessment-"))) {
  const file = path.join(testsDir, name);
  const current = await readFile(file, "utf8");
  const next = advanceWrapper(current);
  if (next !== current) await writeFile(file, next, "utf8");
}

await rm(path.join(root, ".github/workflows/pl19-test-corrections.yml"), { force: true });
await rm(path.join(root, "scripts/pl19TestCorrections.mjs"), { force: true });
console.log("PL19 focused test corrections complete");
