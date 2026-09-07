import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPracticeAssessmentAnalysis } from "../js/practiceLab/practiceAssessmentAnalysis.js";

const binding = {
  assessmentRunId: "practice-assessment_analysis-12345678",
  blockId: "diagnostic-core-keys",
  blockOrdinal: 2,
};
const summary = {
  sessionId: "practice-session_analysis-12345678",
  profileId: "practice-profile_analysis-12345678",
  contextId: "practice-context_analysis-12345678",
  status: "completed",
  completionReason: "time-complete",
  completedAtUtc: "2026-09-07T00:02:00.000Z",
  activeDurationMs: 90_000,
  typedCharacterCount: 500,
  wpm: 66,
  rawWpm: 70,
  accuracy: 0.97,
};
const foundation = {
  skills: { summary: { firstPassOpportunityCount: 100, firstPassCorrectCount: 94 } },
  latency: { counts: { fluent: 80, disfluent: 20 } },
  errors: { counts: { correctionActions: 5, charactersRemoved: 7, episodes: 3 }, timing: { correctionCostMs: 800 } },
  normalization: {},
};

test("PL19 child analysis derives compact first-pass metrics from canonical evidence", () => {
  const analysis = buildPracticeAssessmentAnalysis({ binding, blockKind: "diagnostic", summary, foundationAnalysis: foundation, diagnosticFormId: "form-core", diagnosticFreshness: "fresh" });
  assert.equal(analysis.status, "measured");
  assert.equal(analysis.blockMetrics.firstPassOpportunityCount, 100);
  assert.equal(analysis.blockMetrics.firstPassCorrectCount, 94);
  assert.equal(analysis.blockMetrics.firstPassErrorCount, 6);
  assert.equal(analysis.blockMetrics.firstPassAccuracy, 0.94);
  assert.equal(analysis.blockMetrics.disfluencyRate, 0.2);
  assert.equal(analysis.assessmentBlockDelta.status, "completed");
});

test("PL19 pause, visibility interruption, append, restore or manual stop invalidates the child block", () => {
  for (const runtime of [
    { pauseObserved: true },
    { contentAppendObserved: true },
    { restoredFromCheckpoint: true },
  ]) {
    const analysis = buildPracticeAssessmentAnalysis({ binding, blockKind: "diagnostic", summary, foundationAnalysis: foundation, runtime });
    assert.equal(analysis.status, "invalid");
    assert.equal(analysis.assessmentBlockDelta.status, "invalid");
  }
  const manual = buildPracticeAssessmentAnalysis({ binding, blockKind: "diagnostic", summary: { ...summary, completionReason: "manual-stop" }, foundationAnalysis: foundation });
  assert.equal(manual.status, "invalid");
});

test("PL19 repeated protected benchmark is usable but explicitly nonstandard", () => {
  const analysis = buildPracticeAssessmentAnalysis({
    binding: { ...binding, blockId: "benchmark-natural", blockOrdinal: 1 },
    blockKind: "benchmark",
    summary,
    foundationAnalysis: foundation,
    evaluationSummary: { status: "measured", freshnessStatus: "repeat", integrityStatus: "valid" },
  });
  assert.equal(analysis.status, "nonstandard");
  assert.equal(analysis.assessmentBlockDelta.status, "completed");
});

test("PL19 failed protected measurement cannot become a usable assessment block", () => {
  const analysis = buildPracticeAssessmentAnalysis({
    binding: { ...binding, blockId: "cold-transfer", blockOrdinal: 10 },
    blockKind: "cold-transfer",
    summary,
    foundationAnalysis: foundation,
    evaluationSummary: { status: "invalid", freshnessStatus: "fresh", integrityStatus: "invalid" },
  });
  assert.equal(analysis.status, "measurement-failed");
  assert.equal(analysis.assessmentBlockDelta.status, "invalid");
});
