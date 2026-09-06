import test from "node:test";
import assert from "node:assert/strict";
import { buildPracticeBenchmarkSuiteArtifact, buildPracticeTransferPoolArtifact } from "../js/practiceLab/practiceEvaluationArtifacts.js";
import { comparePracticeBenchmarkMeasurements } from "../js/practiceLab/practiceBenchmarkComparison.js";

const longText = (seed) => Array.from({ length: 280 }, (_, i) => `${seed}${i}`).join(" ");
const corpus = (partition, count) => ({ partition, language: "en", items: Array.from({ length: count }, (_, i) => ({ contentId: `${partition}-${i}`, familyId: `${partition}-family-${i}`, partition, language: "en", reviewStatus: "approved", contentType: "passage", text: longText(String.fromCharCode(97 + i)), contentHash: `hash-${partition}-${i}` })) });
const score = () => ({ features: {}, textDifficulty: { availableModelWeight: 1, difficultyIndex: 0, relativeDifficultyPercentile: 50, standardizedFeatures: { meanWordLength: 0, p90WordLength: 0, uppercaseRatio: 0, punctuationRatio: 0, digitRatio: 0, symbolRatio: 0 } } });

test("PL18 benchmark/transfer builders are deterministic and preserve family uniqueness", () => {
  const benchA = buildPracticeBenchmarkSuiteArtifact({ corpus: corpus("benchmark", 8), typabilityArtifact: { items: [] }, scoreComposite: score });
  const benchB = buildPracticeBenchmarkSuiteArtifact({ corpus: corpus("benchmark", 8), typabilityArtifact: { items: [] }, scoreComposite: score });
  assert.deepEqual(benchA, benchB);
  assert.equal(new Set(benchA.forms.flatMap((form) => form.familyIds)).size, benchA.forms.flatMap((form) => form.familyIds).length);
  const transferA = buildPracticeTransferPoolArtifact({ corpus: corpus("transfer", 32), typabilityArtifact: { items: [] }, scoreComposite: score });
  const transferB = buildPracticeTransferPoolArtifact({ corpus: corpus("transfer", 32), typabilityArtifact: { items: [] }, scoreComposite: score });
  assert.deepEqual(transferA, transferB);
  assert.equal(new Set(transferA.units.flatMap((unit) => unit.familyIds)).size, transferA.units.flatMap((unit) => unit.familyIds).length);
});

test("PL18 builders reject cross-partition candidates by producing no protected forms/units", () => {
  assert.equal(buildPracticeBenchmarkSuiteArtifact({ corpus: corpus("transfer", 8), typabilityArtifact: { items: [] }, scoreComposite: score }).forms.length, 0);
  assert.equal(buildPracticeTransferPoolArtifact({ corpus: corpus("benchmark", 32), typabilityArtifact: { items: [] }, scoreComposite: score }).units.length, 0);
});

test("PL18 benchmark comparison uses adjusted log performance and combined uncertainty without improvement labels", () => {
  const a = { suiteId: "S", suiteVersion: 1, protocolVersion: 1, contextId: "C", integrityStatus: "valid", freshnessStatus: "fresh", comparabilityClass: "engineering-matched", adjustedLogPerformance: Math.log(60), measurementSigmaLog: 0.02 };
  const b = { ...a, adjustedLogPerformance: Math.log(66), measurementSigmaLog: 0.02 };
  const comparison = comparePracticeBenchmarkMeasurements(a, b);
  assert.equal(comparison.quality, "comparable");
  assert.equal(comparison.status, "higher");
  assert.ok(comparison.relativeDifference > 0.09 && comparison.relativeDifference < 0.11);
  assert.ok(!Object.values(comparison).includes("improved"));
  assert.equal(comparePracticeBenchmarkMeasurements(a, { ...b, freshnessStatus: "repeat" }).quality, "exposure-contaminated");
  assert.equal(comparePracticeBenchmarkMeasurements(a, { ...b, contextId: "OTHER" }).reason, "context-mismatch");
});
