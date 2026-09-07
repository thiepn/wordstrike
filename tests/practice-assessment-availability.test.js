import assert from "node:assert/strict";
import { test } from "node:test";
import { getPracticeAssessmentAvailability } from "../js/practiceLab/practiceAssessmentAvailability.js";

const benchmark = { status: "ready", language: "en", suiteId: "suite-en", suiteVersion: 1 };
const transfer = { status: "ready", language: "en", poolId: "pool-en", poolVersion: 1 };
const allBlocks = new Set([
  "diagnostic-core-keys",
  "diagnostic-word-launch",
  "diagnostic-combinations",
  "diagnostic-punctuation-capitals",
  "diagnostic-numbers-symbols",
  "diagnostic-lexical-extended",
  "diagnostic-combinations-extended",
  "diagnostic-mixed",
]);
const registry = (ready = allBlocks) => ({
  getArtifact(language) { return language === "en" ? { status: "ready", language: "en" } : null; },
  isBlockReady(language, blockId) { return language === "en" && ready.has(blockId); },
});

test("PL19 recommends Deep only when every Deep dependency is ready", () => {
  const result = getPracticeAssessmentAvailability({ language: "en", benchmarkSuites: [benchmark], transferPools: [transfer], transferReservable: true, diagnosticRegistry: registry() });
  assert.equal(result.depths.quick.available, true);
  assert.equal(result.depths.standard.available, true);
  assert.equal(result.depths.deep.available, true);
  assert.equal(result.recommendedDepth, "deep");
});

test("PL19 falls back to Standard when transfer is unavailable without weakening Standard", () => {
  const result = getPracticeAssessmentAvailability({ language: "en", benchmarkSuites: [benchmark], transferPools: [], transferReservable: false, diagnosticRegistry: registry() });
  assert.equal(result.depths.quick.available, true);
  assert.equal(result.depths.standard.available, true);
  assert.equal(result.depths.deep.available, false);
  assert.equal(result.recommendedDepth, "standard");
  assert.ok(result.depths.deep.reasons.includes("Cold-transfer pool unavailable"));
});

test("PL19 can leave Quick available when a Standard-only diagnostic set is missing", () => {
  const ready = new Set(allBlocks);
  ready.delete("diagnostic-numbers-symbols");
  const result = getPracticeAssessmentAvailability({ language: "en", benchmarkSuites: [benchmark], transferPools: [transfer], transferReservable: true, diagnosticRegistry: registry(ready) });
  assert.equal(result.depths.quick.available, true);
  assert.equal(result.depths.standard.available, false);
  assert.equal(result.depths.deep.available, false);
  assert.equal(result.recommendedDepth, "quick");
});

test("PL19 does not fake unsupported-language assessment availability", () => {
  const result = getPracticeAssessmentAvailability({ language: "de", benchmarkSuites: [benchmark], transferPools: [transfer], transferReservable: true, diagnosticRegistry: registry() });
  assert.equal(result.depths.quick.available, false);
  assert.equal(result.depths.standard.available, false);
  assert.equal(result.depths.deep.available, false);
  assert.equal(result.recommendedDepth, null);
});
