import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultPracticeAssessmentRun } from "../js/practiceLab/practiceAssessmentRun.js";
import { createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";
import { getPracticeAssessmentBlocksForDepth } from "../js/practiceLab/practiceAssessmentConstants.js";
import { hashPracticeContent } from "../js/practiceLab/practiceIds.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

function plan(runId) {
  const blocks = getPracticeAssessmentBlocksForDepth("quick").map((block) => ({
    ...block,
    diagnosticFormSetId: block.blockKind === "diagnostic" ? `en:${block.blockId}:v1` : null,
    diagnosticFormId: block.blockKind === "diagnostic" ? `form-${block.blockId}` : null,
    evaluationReservationId: block.blockKind === "benchmark" ? "practice-evaluation-reservation_expiry-12345678" : null,
    evaluationArtifactId: block.blockKind === "benchmark" ? "suite-en" : null,
    evaluationArtifactVersion: block.blockKind === "benchmark" ? 1 : null,
    expectedPartition: block.blockKind === "benchmark" ? "benchmark" : "diagnostic",
    expectedExperimentId: block.blockKind === "benchmark" ? "full-assessment-benchmark" : "full-assessment-diagnostic",
    targetEntities: [],
  }));
  const value = { planVersion: 1, assessmentRunId: runId, language: "en", depth: "quick", protocolVersion: 1, createdAt: "2026-01-01T00:00:00.000Z", blocks };
  value.planHash = hashPracticeContent(JSON.stringify({ planVersion: value.planVersion, assessmentRunId: value.assessmentRunId, language: value.language, depth: value.depth, protocolVersion: value.protocolVersion, createdAt: value.createdAt, blocks: value.blocks }));
  return value;
}

test("PL19 child finishing after parent TTL persists its typing session but invalidates the assessment block", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl19-parent-expiry" });
  const runId = "practice-assessment_parent-expiry-12345678";
  const sessionId = "practice-session_parent-expiry-12345678";
  const p = plan(runId);
  const base = createDefaultPracticeAssessmentRun({ assessmentRunId: runId, profileId: harness.profileId, contextId: harness.contextId, depth: "quick", plan: p, now: () => new Date("2026-01-01T00:00:00.000Z") });
  const active = {
    ...base,
    status: "active",
    startedAt: "2026-01-01T00:00:01.000Z",
    expiresAt: "2026-01-01T00:00:02.000Z",
    blocks: base.blocks.map((block, index) => index === 0 ? { ...block, status: "active", childSessionId: sessionId, startedAt: "2026-01-01T00:00:01.000Z" } : block),
  };
  await harness.repository.saveAssessmentRun(active);

  const summary = createDefaultSessionSummary({
    sessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    now: () => new Date("2026-09-07T00:01:00.000Z"),
    overrides: {
      status: "completed",
      completionReason: "time-complete",
      startedAtUtc: "2026-09-07T00:00:00.000Z",
      completedAtUtc: "2026-09-07T00:01:00.000Z",
      activeDurationMs: 60_000,
      wallDurationMs: 60_000,
      assessmentBinding: { assessmentRunId: runId, blockId: "benchmark-natural", blockOrdinal: 1, protocolVersion: 1 },
    },
  });
  const commit = await harness.repository.commitCompletedPracticeSession({
    sessionSummary: summary,
    assessmentBlockDelta: {
      deltaVersion: 1,
      assessmentRunId: runId,
      blockId: "benchmark-natural",
      blockOrdinal: 1,
      sessionId,
      profileId: harness.profileId,
      contextId: harness.contextId,
      completedAtUtc: "2026-09-07T00:01:00.000Z",
      status: "completed",
      blockMetrics: { activeDurationMs: 60_000 },
      coverage: null,
      evaluationSummary: null,
      diagnosticFormId: null,
      diagnosticFreshness: null,
    },
  });
  assert.equal(commit.committed, true);
  assert.equal(commit.assessmentInvalidatedByExpiry, true);
  assert.ok(await harness.repository.getSessionSummary(sessionId));
  const parent = await harness.repository.getAssessmentRun(runId);
  assert.equal(parent.status, "expired");
  assert.equal(parent.integrityStatus, "partial");
  assert.equal(parent.blocks[0].status, "invalid");
  assert.equal(parent.blocks[0].result.reason, "parent-expired");
  assert.equal(commit.mergedSkillStatCount, 0);
  assert.equal(commit.learningUpdated, 0);
  assert.equal(commit.abilityUpdated, false);
});
