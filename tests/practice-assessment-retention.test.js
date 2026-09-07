import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";
import { createDefaultPracticeAssessmentRun } from "../js/practiceLab/practiceAssessmentRun.js";
import { getPracticeAssessmentBlocksForDepth } from "../js/practiceLab/practiceAssessmentConstants.js";
import { hashPracticeContent } from "../js/practiceLab/practiceIds.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

function quickPlan(runId) {
  const blocks = getPracticeAssessmentBlocksForDepth("quick").map((block) => ({
    ...block,
    diagnosticFormSetId: block.blockKind === "diagnostic" ? `en:${block.blockId}:v1` : null,
    diagnosticFormId: block.blockKind === "diagnostic" ? `form-${block.blockId}` : null,
    evaluationReservationId: block.blockKind === "benchmark" ? "practice-evaluation-reservation_retention-12345678" : null,
    evaluationArtifactId: block.blockKind === "benchmark" ? "suite-en" : null,
    evaluationArtifactVersion: block.blockKind === "benchmark" ? 1 : null,
    expectedPartition: block.blockKind === "benchmark" ? "benchmark" : "diagnostic",
    expectedExperimentId: block.blockKind === "benchmark" ? "full-assessment-benchmark" : "full-assessment-diagnostic",
    targetEntities: [],
  }));
  const plan = {
    planVersion: 1,
    assessmentRunId: runId,
    language: "en",
    depth: "quick",
    protocolVersion: 1,
    createdAt: "2026-09-07T00:00:00.000Z",
    blocks,
  };
  plan.planHash = hashPracticeContent(JSON.stringify({
    planVersion: plan.planVersion,
    assessmentRunId: plan.assessmentRunId,
    language: plan.language,
    depth: plan.depth,
    protocolVersion: plan.protocolVersion,
    createdAt: plan.createdAt,
    blocks: plan.blocks,
  }));
  return plan;
}

test("PL19 ordinary retention preserves child summaries only while their assessment run is active", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl19-retention" });
  const runId = "practice-assessment_retention-12345678";
  const sessionId = "practice-session_retention-child-12345678";
  const plan = quickPlan(runId);
  const base = createDefaultPracticeAssessmentRun({
    assessmentRunId: runId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    depth: "quick",
    plan,
    now: () => new Date("2026-09-07T00:00:00.000Z"),
  });
  const active = {
    ...base,
    status: "active",
    startedAt: "2026-09-07T00:00:01.000Z",
    progress: { currentBlockIndex: 1, completedBlockCount: 1, terminalBlockCount: 1 },
    blocks: base.blocks.map((block, index) => index === 0 ? {
      ...block,
      status: "completed",
      childSessionId: sessionId,
      startedAt: "2026-09-07T00:00:01.000Z",
      completedAt: "2026-09-07T00:01:01.000Z",
      result: { status: "completed", blockMetrics: {} },
    } : block),
  };
  await harness.repository.saveAssessmentRun(active);

  const oldSummary = createDefaultSessionSummary({
    sessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    now: () => new Date("2024-01-01T00:00:00.000Z"),
    overrides: {
      status: "completed",
      completionReason: "time-complete",
      startedAtUtc: "2024-01-01T00:00:00.000Z",
      completedAtUtc: "2024-01-01T00:01:00.000Z",
      updatedAt: "2024-01-01T00:01:00.000Z",
      assessmentBinding: { assessmentRunId: runId, blockId: "benchmark-natural", blockOrdinal: 1, protocolVersion: 1 },
    },
  });
  await harness.dataStore.put("sessionSummaries", oldSummary);

  const protectedPlan = await harness.repository.runPracticeRetention();
  assert.ok(protectedPlan.preserveSessionIds.includes(sessionId));
  assert.ok(await harness.repository.getSessionSummary(sessionId));

  await harness.repository.saveAssessmentRun({ ...active, status: "abandoned", integrityStatus: "partial" });
  const ordinaryPlan = await harness.repository.runPracticeRetention();
  assert.equal(ordinaryPlan.preserveSessionIds.includes(sessionId), false);
  assert.equal(await harness.repository.getSessionSummary(sessionId), null);
});
