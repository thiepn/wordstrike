import assert from "node:assert/strict";
import { test } from "node:test";
import { comparePracticeAssessmentRuns } from "../js/practiceLab/practiceAssessmentComparison.js";

function run({ id, contextId = "practice-context_compare-12345678", depth = "quick", wpm = 70, repeat = false }) {
  const all = [
    "benchmark-natural",
    "diagnostic-core-keys",
    "diagnostic-word-launch",
    "diagnostic-combinations",
    "diagnostic-punctuation-capitals",
    "diagnostic-numbers-symbols",
    "diagnostic-lexical-extended",
    "diagnostic-combinations-extended",
    "diagnostic-mixed",
    "cold-transfer",
  ];
  const count = depth === "quick" ? 3 : depth === "standard" ? 6 : 10;
  const blocks = all.slice(0, count).map((blockId, index) => ({
    blockId,
    status: "completed",
    result: blockId === "benchmark-natural" ? {
      evaluationSummary: {
        suiteId: "suite-en",
        suiteVersion: 1,
        protocolVersion: 1,
        contextId,
        integrityStatus: "valid",
        freshnessStatus: repeat ? "repeat" : "fresh",
        comparabilityClass: "engineering-matched",
        adjustedLogPerformance: Math.log(wpm),
        measurementSigmaLog: 0.08,
      },
    } : {},
  }));
  return {
    assessmentRunId: `practice-assessment_${id}-12345678`,
    contextId,
    depth,
    protocolVersion: 1,
    blocks,
    report: {
      reportStatus: "complete",
      control: { firstPassAccuracy: 0.95, disfluencyRate: 0.08, correctionCostMsPer1000: 400 },
      diagnosticCoverage: { blueprintVersion: 1, blocks: [] },
      generalPerformance: { coldNaturalAbility: { meanLogWpm: Math.log(wpm), varianceLogWpm: 0.01 } },
    },
  };
}

test("PL19 same-context same-depth runs compare dimensions without a global improvement verdict", () => {
  const result = comparePracticeAssessmentRuns(run({ id: "a", wpm: 70 }), run({ id: "b", wpm: 75 }));
  assert.equal(result.status, "comparable");
  assert.equal(result.benchmark.quality, "comparable");
  assert.equal(result.overallImprovementVerdict, null);
});

test("PL19 Quick vs Deep compares only their common prefix", () => {
  const result = comparePracticeAssessmentRuns(run({ id: "quick", depth: "quick" }), run({ id: "deep", depth: "deep" }));
  assert.equal(result.status, "partially-comparable");
  assert.deepEqual(result.overlappingBlockIds, ["benchmark-natural", "diagnostic-core-keys", "diagnostic-word-launch"]);
});

test("PL19 direct change comparison refuses different contexts", () => {
  const result = comparePracticeAssessmentRuns(run({ id: "a" }), run({ id: "b", contextId: "practice-context_other-12345678" }));
  assert.equal(result.status, "not-comparable");
  assert.ok(result.reasons.includes("context-mismatch"));
});

test("PL19 repeated benchmark comparison preserves PL18 exposure contamination semantics", () => {
  const result = comparePracticeAssessmentRuns(run({ id: "a" }), run({ id: "b", repeat: true }));
  assert.equal(result.benchmark.quality, "exposure-contaminated");
  assert.equal(result.benchmark.status, "uncertain");
});
