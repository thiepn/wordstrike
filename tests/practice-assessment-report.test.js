import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPracticeAssessmentReport } from "../js/practiceLab/practiceAssessmentReport.js";

function completedBlock(blockId, ordinal, metrics, extra = {}) {
  return {
    blockId,
    ordinal,
    status: "completed",
    durationMs: ordinal === 1 ? 60_000 : 90_000,
    diagnosticFormId: blockId.startsWith("diagnostic-") ? `form-${blockId}` : null,
    evaluationReservationId: blockId === "benchmark-natural" ? "reservation-benchmark" : null,
    childSessionId: `practice-session_${ordinal}-12345678`,
    startedAt: `2026-09-07T00:0${ordinal}:00.000Z`,
    completedAt: `2026-09-07T00:0${ordinal}:30.000Z`,
    result: {
      status: "completed",
      blockMetrics: metrics,
      coverage: { blueprintVersion: 1, coverageRatio: 1 },
      diagnosticFreshness: blockId.startsWith("diagnostic-") ? "fresh" : null,
      ...extra,
    },
  };
}

function quickRun() {
  return {
    assessmentRunId: "practice-assessment_report-12345678",
    profileId: "practice-profile_report-12345678",
    contextId: "practice-context_report-12345678",
    protocolVersion: 1,
    depth: "quick",
    status: "active",
    integrityStatus: "standard",
    startedAt: "2026-09-07T00:00:00.000Z",
    completedAt: "2026-09-07T00:04:00.000Z",
    plan: { planVersion: 1 },
    blocks: [
      completedBlock("benchmark-natural", 1, { wpm: 80, rawWpm: 84, accuracy: 0.98 }, {
        evaluationSummary: { freshnessStatus: "fresh", integrityStatus: "valid", adjustedWpm: 78, measurementSigmaLog: 0.08, comparabilityClass: "engineering-matched", abilityEligible: true },
      }),
      completedBlock("diagnostic-core-keys", 2, { typedCharacterCount: 100, firstPassOpportunityCount: 10, firstPassCorrectCount: 8, firstPassErrorCount: 2, fluentTransitionCount: 80, disfluentTransitionCount: 20, correctionInputCount: 5, correctionCharactersRemoved: 6, correctionCostMs: 500, errorEpisodeCount: 3 }),
      completedBlock("diagnostic-word-launch", 3, { typedCharacterCount: 100, firstPassOpportunityCount: 10, firstPassCorrectCount: 9, firstPassErrorCount: 1, fluentTransitionCount: 90, disfluentTransitionCount: 10, correctionInputCount: 3, correctionCharactersRemoved: 4, correctionCostMs: 300, errorEpisodeCount: 2 }),
    ],
  };
}

test("PL19 control report aggregates first-pass and disfluency counts instead of averaging percentages", () => {
  const report = buildPracticeAssessmentReport({ run: quickRun() });
  assert.equal(report.reportStatus, "complete");
  assert.equal(report.control.firstPassAccuracy, 17 / 20);
  assert.equal(report.control.disfluencyRate, 30 / 200);
  assert.equal(report.control.correctionInputsPer1000, 40);
  assert.equal(report.control.correctionCharactersPer1000, 50);
  assert.equal(report.control.correctionCostMsPer1000, 4000);
  assert.equal(report.control.errorEpisodesPer1000, 25);
});

test("PL19 Quick report is honest about dimensions it did not measure and has no universal score", () => {
  const report = buildPracticeAssessmentReport({ run: quickRun() });
  assert.equal(report.measurementCoverage["punctuation/capitalization diagnostics"], "not-measured");
  assert.equal(report.measurementCoverage["numbers/symbol diagnostics"], "not-measured");
  assert.equal(report.measurementCoverage["cold transfer"], "not-measured");
  assert.equal(report.measurementCoverage["controlled speed"], "not-measured");
  assert.equal(report.measurementCoverage.burst, "not-measured");
  assert.equal(report.measurementCoverage["common-word ability"], "not-measured");
  assert.equal(report.measurementCoverage.endurance, "not-measured");
  const serialized = JSON.stringify(report);
  for (const forbidden of ["overallScore", "typingScore", "assessmentScore", "\"grade\"", "\"rank\""]) assert.equal(serialized.includes(forbidden), false, forbidden);
});

test("PL19 report snapshots canonical PL12 limiter and PL15 mastery summaries at completion", () => {
  const report = buildPracticeAssessmentReport({
    run: quickRun(),
    limiterSnapshot: {
      primaryLimiterIds: ["stat-br"],
      candidates: [
        { statId: "stat-x", entityType: "key", entityKey: "x", primaryPhenotype: "slow", status: "possible", weaknessScore: 20, priorityScore: 10, impact: { impactScore: 30 }, evidenceConfidenceLevel: "low", hierarchy: { status: "independent" } },
        { statId: "stat-br", entityType: "bigram", entityKey: "br", primaryPhenotype: "hesitant", status: "likely", weaknessScore: 70, priorityScore: 60, impact: { impactScore: 80 }, evidenceConfidenceLevel: "medium", hierarchy: { status: "independent" } },
      ],
    },
    abilityState: { estimate: { meanLogWpm: Math.log(80), varianceLogWpm: 0.01, estimateWpm: 80, interval95LowerWpm: 65, interval95UpperWpm: 98, confidenceLevel: "medium" } },
    masterySnapshot: { counts: { stageCounts: { unmeasured: 2, learning: 3, acquired: 4, transferred: 2, robust: 1, retained: 1 }, automaticityCounts: { unmeasured: 2, developing: 3, emerging: 3, established: 3, strong: 2 } } },
  });
  assert.equal(report.limiterSnapshot[0].statId, "stat-br");
  assert.equal(report.limiterSnapshot[0].phenotype, "hesitant");
  assert.equal(report.limiterSnapshot[0].impactScore, 80);
  assert.equal(report.masterySnapshot.stages.retained, 1);
  assert.equal(report.masterySnapshot.automaticity.strong, 2);
  assert.equal(report.generalPerformance.coldNaturalAbility.estimateWpm, 80);
  assert.equal(report.generalPerformance.coldNaturalAbility.meanLogWpm, Math.log(80));
});

test("PL19 undefined control denominators remain null rather than zero or NaN", () => {
  const run = quickRun();
  run.blocks[1].result.blockMetrics = { typedCharacterCount: 0, firstPassOpportunityCount: 0, firstPassCorrectCount: 0 };
  run.blocks[2].result.blockMetrics = { typedCharacterCount: 0, firstPassOpportunityCount: 0, firstPassCorrectCount: 0 };
  const report = buildPracticeAssessmentReport({ run });
  assert.equal(report.control.firstPassAccuracy, null);
  assert.equal(report.control.disfluencyRate, null);
  assert.equal(report.control.correctionInputsPer1000, null);
});
