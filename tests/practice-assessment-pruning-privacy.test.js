import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultPracticeAssessmentRun } from "../js/practiceLab/practiceAssessmentRun.js";
import { buildPracticeAssessmentReport } from "../js/practiceLab/practiceAssessmentReport.js";
import { getPracticeAssessmentBlocksForDepth } from "../js/practiceLab/practiceAssessmentConstants.js";
import { hashPracticeContent } from "../js/practiceLab/practiceIds.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

function plan(runId, depth = "quick") {
  const blocks = getPracticeAssessmentBlocksForDepth(depth).map((block) => ({
    ...block,
    diagnosticFormSetId: block.blockKind === "diagnostic" ? `en:${block.blockId}:v1` : null,
    diagnosticFormId: block.blockKind === "diagnostic" ? `form-${block.blockId}` : null,
    evaluationReservationId: block.blockKind === "benchmark" ? `practice-evaluation-reservation_bench-${runId.slice(-8)}-12345678` : block.blockKind === "cold-transfer" ? `practice-evaluation-reservation_transfer-${runId.slice(-8)}-12345678` : null,
    evaluationArtifactId: block.blockKind === "benchmark" ? "suite-en" : block.blockKind === "cold-transfer" ? "pool-en" : null,
    evaluationArtifactVersion: ["benchmark", "cold-transfer"].includes(block.blockKind) ? 1 : null,
    expectedPartition: block.blockKind === "benchmark" ? "benchmark" : block.blockKind === "cold-transfer" ? "transfer" : "diagnostic",
    expectedExperimentId: block.blockKind === "benchmark" ? "full-assessment-benchmark" : block.blockKind === "cold-transfer" ? "full-assessment-transfer" : "full-assessment-diagnostic",
    targetEntities: [],
  }));
  const value = { planVersion: 1, assessmentRunId: runId, language: "en", depth, protocolVersion: 1, createdAt: "2026-01-01T00:00:00.000Z", blocks };
  value.planHash = hashPracticeContent(JSON.stringify({ planVersion: value.planVersion, assessmentRunId: value.assessmentRunId, language: value.language, depth: value.depth, protocolVersion: value.protocolVersion, createdAt: value.createdAt, blocks: value.blocks }));
  return value;
}

function completedRun({ runId, profileId, contextId, index, depth = "quick" }) {
  const p = plan(runId, depth);
  const createdAt = new Date(Date.UTC(2026, 0, 1 + index)).toISOString();
  const completedAt = new Date(Date.UTC(2026, 0, 1 + index, 0, 15)).toISOString();
  const base = createDefaultPracticeAssessmentRun({ assessmentRunId: runId, profileId, contextId, depth, plan: p, now: () => new Date(createdAt) });
  const blocks = base.blocks.map((block, blockIndex) => ({
    ...block,
    status: "completed",
    childSessionId: `practice-session_prune-${index}-${blockIndex}-12345678`,
    startedAt: new Date(Date.parse(createdAt) + blockIndex * 60_000).toISOString(),
    completedAt: new Date(Date.parse(createdAt) + (blockIndex + 1) * 60_000).toISOString(),
    result: {
      status: "completed",
      blockMetrics: { typedCharacterCount: 500, firstPassOpportunityCount: 100, firstPassCorrectCount: 95 },
      coverage: block.blockId.startsWith("diagnostic-") ? { blueprintVersion: 1, coverageRatio: 0.5, entityTypeCounts: { key: 26, bigram: 80, trigram: 40, word: 60, punctuation: 8, numeric: 10, symbol: 8 } } : null,
      evaluationSummary: block.blockId === "benchmark-natural" ? { freshnessStatus: "fresh", integrityStatus: "valid", adjustedWpm: 80 } : block.blockId === "cold-transfer" ? { freshnessStatus: "fresh", integrityStatus: "valid", adjustedWpm: 76 } : null,
    },
  }));
  const run = {
    ...base,
    status: "completed",
    integrityStatus: "standard",
    createdAt,
    startedAt: createdAt,
    completedAt,
    progress: { currentBlockIndex: blocks.length, completedBlockCount: blocks.length, terminalBlockCount: blocks.length },
    blocks,
    report: { reportVersion: 1, reportStatus: "complete", integrity: { status: "standard" } },
  };
  return run;
}

test("PL19 assessment run pruning respects cap and preserves active plus first/latest valid assessment per context", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl19-pruning" });
  const firstId = "practice-assessment_prune-0000-12345678";
  const latestId = "practice-assessment_prune-0054-12345678";
  for (let index = 0; index < 55; index += 1) {
    const runId = `practice-assessment_prune-${String(index).padStart(4, "0")}-12345678`;
    await harness.repository.saveAssessmentRun(completedRun({ runId, profileId: harness.profileId, contextId: harness.contextId, index }));
  }
  const activeId = "practice-assessment_prune-active-12345678";
  const activePlan = plan(activeId);
  const activeBase = createDefaultPracticeAssessmentRun({ assessmentRunId: activeId, profileId: harness.profileId, contextId: harness.contextId, depth: "quick", plan: activePlan, now: () => new Date("2026-03-01T00:00:00.000Z") });
  await harness.repository.saveAssessmentRun({ ...activeBase, status: "active", startedAt: "2026-03-01T00:00:01.000Z", expiresAt: "2099-03-01T02:00:00.000Z" });

  const result = await harness.repository.pruneAssessmentRuns(harness.profileId);
  assert.equal(result.deleted.length, 6);
  const remaining = await harness.repository.listAssessmentRuns(harness.profileId);
  assert.equal(remaining.length, 50);
  const ids = new Set(remaining.map((run) => run.assessmentRunId));
  assert.equal(ids.has(activeId), true);
  assert.equal(ids.has(firstId), true);
  assert.equal(ids.has(latestId), true);
});

test("PL19 worst-case-shaped Deep run and report remain below 128 KiB and contain no raw assessment text or traces", () => {
  const runId = "practice-assessment_privacy-deep-12345678";
  const p = plan(runId, "deep");
  const base = createDefaultPracticeAssessmentRun({ assessmentRunId: runId, profileId: "practice-profile_privacy-12345678", contextId: "practice-context_privacy-12345678", depth: "deep", plan: p, now: () => new Date("2026-01-01T00:00:00.000Z") });
  const blocks = base.blocks.map((block, index) => ({
    ...block,
    status: "completed",
    childSessionId: `practice-session_privacy-${index}-12345678`,
    startedAt: `2026-01-01T00:${String(index).padStart(2, "0")}:00.000Z`,
    completedAt: `2026-01-01T00:${String(index).padStart(2, "0")}:59.000Z`,
    result: {
      deltaVersion: 1,
      status: "completed",
      blockMetrics: {
        activeDurationMs: block.durationMs,
        typedCharacterCount: 4_400,
        wpm: 120,
        rawWpm: 124,
        accuracy: 0.985,
        firstPassOpportunityCount: 600,
        firstPassCorrectCount: 585,
        firstPassErrorCount: 15,
        fluentTransitionCount: 3_000,
        disfluentTransitionCount: 150,
        correctionInputCount: 30,
        correctionCharactersRemoved: 40,
        correctionCostMs: 4_000,
        errorEpisodeCount: 20,
        wordLaunchResidualMedianMs: 12,
      },
      coverage: block.blockId.startsWith("diagnostic-") ? {
        blueprintVersion: 1,
        expectedCoverage: { categoryCount: 32 },
        observedCoverage: { categoryCount: 30 },
        coverageRatio: 0.9375,
        entityTypeCounts: { key: 26, bigram: 256, trigram: 128, word: 180, punctuation: 12, numeric: 10, symbol: 12 },
        missingRequiredCategories: [],
      } : null,
      evaluationSummary: block.blockKind === "benchmark" ? { freshnessStatus: "fresh", integrityStatus: "valid", adjustedWpm: 118, measurementSigmaLog: 0.08 } : block.blockKind === "cold-transfer" ? { freshnessStatus: "fresh", integrityStatus: "valid", adjustedWpm: 112, validTransferEvidenceEntityCount: 100 } : null,
      diagnosticFormId: block.diagnosticFormId,
      diagnosticFreshness: block.blockKind === "diagnostic" ? "fresh" : null,
    },
  }));
  const run = { ...base, status: "active", startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:12:00.000Z", progress: { currentBlockIndex: 10, completedBlockCount: 10, terminalBlockCount: 10 }, blocks };
  const report = buildPracticeAssessmentReport({
    run,
    limiterSnapshot: { primaryLimiterIds: Array.from({ length: 8 }, (_, i) => `stat-${i}`), candidates: Array.from({ length: 8 }, (_, i) => ({ statId: `stat-${i}`, entityType: "bigram", entityKey: `k${i}`, primaryPhenotype: "slow", status: "likely", weaknessScore: 80, priorityScore: 70, impact: { impactScore: 60 }, evidenceConfidenceLevel: "high", hierarchy: { status: "independent" } })) },
    masterySnapshot: { counts: { stageCounts: { unmeasured: 100, learning: 100, acquired: 100, transferred: 100, robust: 100, retained: 100 }, automaticityCounts: { developing: 100, emerging: 100, established: 100, strong: 100 } } },
  });
  const persisted = { ...run, status: "completed", report };
  const bytes = new TextEncoder().encode(JSON.stringify(persisted)).byteLength;
  assert.ok(bytes < 128 * 1024, `assessment run is ${bytes} bytes`);
  const serialized = JSON.stringify(persisted).toLowerCase();
  for (const forbidden of ["protected benchmark text", "transfer passage text", "diagnostic passage text", "rawevents", "eventtrace", "mistypedstring", "customtext"]) assert.equal(serialized.includes(forbidden), false, forbidden);
  assert.equal(serialized.includes("overallscore"), false);
  assert.equal(serialized.includes("typingscore"), false);
});
