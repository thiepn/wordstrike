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

await patch("js/practiceLab/practiceAssessmentPlan.js", (text) => {
  if (text.includes("displayName: block.displayName")) return text;
  return text.replace(
    "      blockKind: block.blockKind,\n      diagnosticFormSetId:",
    "      blockKind: block.blockKind,\n      displayName: block.displayName,\n      diagnosticFormSetId:",
  );
});

await patch("js/practiceLab/practiceAssessmentService.js", (text) => {
  let next = text;
  next = next.replace(
    /const compatible = runs\n\s*\.filter\(\(run\) => run\.status === "completed" && run\.report\?\.reportStatus === "complete" && run\.protocolVersion === PRACTICE_ASSESSMENT_PROTOCOL_VERSION\)\n\s*\.sort\(\(a, b\) => String\(b\.completedAt \?\? ""\)\.localeCompare\(String\(a\.completedAt \?\? ""\)\)\);\n\s*if \(!compatible\.length\) return freezeDeep\(\{ state: "incomplete", latestCompletedAt: null, assessmentRunId: runs\[0\]\?\.assessmentRunId \?\? null \}\);/,
    `const completed = runs\n      .filter((run) => run.status === "completed" && run.report?.reportStatus === "complete")\n      .sort((a, b) => String(b.completedAt ?? "").localeCompare(String(a.completedAt ?? "")));\n    if (!completed.length) return freezeDeep({ state: "incomplete", latestCompletedAt: null, assessmentRunId: runs[0]?.assessmentRunId ?? null });\n    const compatible = completed.filter((run) => run.protocolVersion === PRACTICE_ASSESSMENT_PROTOCOL_VERSION);\n    if (!compatible.length) {\n      const latestCompleted = completed[0];\n      return freezeDeep({ state: "stale", latestCompletedAt: latestCompleted.completedAt, assessmentRunId: latestCompleted.assessmentRunId, reason: "protocol-outdated" });\n    }`,
  );
  return next;
});

await patch("js/practiceLab/practiceRepository.js", (text) => {
  let next = text;
  next = next.replace(
    `      run = reconcilePracticeAssessmentRunExpiry(run, { now });\n      if (run.status !== "active") throw fail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Assessment parent run is no longer active", { assessmentRunId: run.assessmentRunId, status: run.status });`,
    `      run = reconcilePracticeAssessmentRunExpiry(run, { now });\n      const parentExpired = run.status === "expired";\n      if (run.status !== "active" && !parentExpired) throw fail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Assessment parent run is no longer active", { assessmentRunId: run.assessmentRunId, status: run.status });`,
  );
  next = next.replace(
    `      run = mergePracticeAssessmentBlockDelta(run, assessmentBlockDelta);\n      const runValidation = validatePracticeAssessmentRun(run);`,
    `      if (parentExpired) {\n        const blockIndex = run.blocks.findIndex((block) => block.blockId === assessmentBlockDelta.blockId && block.ordinal === assessmentBlockDelta.blockOrdinal);\n        const currentBlock = blockIndex >= 0 ? run.blocks[blockIndex] : null;\n        if (!currentBlock || currentBlock.status !== "active" || currentBlock.childSessionId !== sessionSummary.sessionId) throw fail(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Expired assessment parent block identity mismatch");\n        const expiredRun = JSON.parse(JSON.stringify(run));\n        expiredRun.blocks[blockIndex].status = "invalid";\n        expiredRun.blocks[blockIndex].completedAt = assessmentBlockDelta.completedAtUtc;\n        expiredRun.blocks[blockIndex].result = { ...assessmentBlockDelta, status: "invalid", reason: "parent-expired" };\n        expiredRun.progress.terminalBlockCount += 1;\n        expiredRun.progress.currentBlockIndex = Math.min(blockIndex + 1, expiredRun.blocks.length);\n        if (expiredRun.integrityStatus !== "invalid") expiredRun.integrityStatus = "partial";\n        run = expiredRun;\n      } else {\n        run = mergePracticeAssessmentBlockDelta(run, assessmentBlockDelta);\n      }\n      const runValidation = validatePracticeAssessmentRun(run);`,
  );
  next = next.replace(
    `      for (const stat of mergedStats) await transaction.put("skillStats", stat);\n      if (mergedAbility) await transaction.put("abilityStates", mergedAbility);\n      for (const learning of mergedLearning) await transaction.put("learningStates", learning);`,
    `      if (!parentExpired) {\n        for (const stat of mergedStats) await transaction.put("skillStats", stat);\n        if (mergedAbility) await transaction.put("abilityStates", mergedAbility);\n        for (const learning of mergedLearning) await transaction.put("learningStates", learning);\n      }`,
  );
  next = next.replace(
    `      return { committed: true, idempotent: false, assessmentUpdated: true, mergedSkillStatCount: mergedStats.length, learningUpdated: mergedLearning.length, abilityUpdated: Boolean(mergedAbility) };`,
    `      return { committed: true, idempotent: false, assessmentUpdated: true, assessmentInvalidatedByExpiry: parentExpired, mergedSkillStatCount: parentExpired ? 0 : mergedStats.length, learningUpdated: parentExpired ? 0 : mergedLearning.length, abilityUpdated: parentExpired ? false : Boolean(mergedAbility) };`,
  );
  return next;
});

await patch("tests/practice-assessment-cross-profile.test.js", (text) => text.replace(
  'import { createDefaultPracticeContext, createDefaultPracticeProfile, createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";',
  'import { createDefaultPracticeProfile, createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";\nimport { createDefaultPracticeContext } from "../js/practiceLab/practiceContext.js";',
));
await patch("tests/practice-assessment-pruning-privacy.test.js", (text) => text.replace(
  'await harness.repository.saveAssessmentRun({ ...activeBase, status: "active", startedAt: "2026-03-01T00:00:01.000Z" });',
  'await harness.repository.saveAssessmentRun({ ...activeBase, status: "active", startedAt: "2026-03-01T00:00:01.000Z", expiresAt: "2099-03-01T02:00:00.000Z" });',
));
await patch("tests/practice-assessment-preparation-failure.test.js", (text) => text.replace(
  /\n\s*assert\.throws\(\n\s*\(\) => run\.blocks\[run\.progress\.currentBlockIndex\]\.blockId === "benchmark-natural"[\s\S]*?\n\s*\);\n\s*assert\.notEqual\(run\.blocks\[run\.progress\.currentBlockIndex\]\.blockId, "benchmark-natural"\);/,
  '\n  assert.notEqual(run.blocks[run.progress.currentBlockIndex].blockId, "benchmark-natural");',
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

await rm(path.join(root, ".github/workflows/pl19-hardening-sweep.yml"), { force: true });
await rm(path.join(root, "scripts/pl19HardeningSweep.mjs"), { force: true });
console.log("PL19 final orchestration hardening complete");
