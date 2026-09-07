import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activatePracticeAssessmentRun,
  abandonPracticeAssessmentRun,
  createDefaultPracticeAssessmentRun,
  markPracticeAssessmentBlockStarted,
  mergePracticeAssessmentBlockDelta,
  reconcilePracticeAssessmentRunExpiry,
  validatePracticeAssessmentRun,
} from "../js/practiceLab/practiceAssessmentRun.js";
import { getPracticeAssessmentBlocksForDepth } from "../js/practiceLab/practiceAssessmentConstants.js";
import { hashPracticeContent } from "../js/practiceLab/practiceIds.js";

function quickPlan() {
  const blocks = getPracticeAssessmentBlocksForDepth("quick").map((block) => ({
    ...block,
    diagnosticFormSetId: block.blockKind === "diagnostic" ? `en:${block.blockId}:v1` : null,
    diagnosticFormId: block.blockKind === "diagnostic" ? `form-${block.blockId}` : null,
    evaluationReservationId: block.blockKind === "benchmark" ? "practice-evaluation-reservation_bench-12345678" : null,
    evaluationArtifactId: block.blockKind === "benchmark" ? "suite-en" : null,
    evaluationArtifactVersion: block.blockKind === "benchmark" ? 1 : null,
    expectedPartition: block.blockKind === "benchmark" ? "benchmark" : "diagnostic",
    expectedExperimentId: block.blockKind === "benchmark" ? "full-assessment-benchmark" : "full-assessment-diagnostic",
    targetEntities: [],
  }));
  const plan = {
    planVersion: 1,
    assessmentRunId: "practice-assessment_run-12345678",
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

function activeRun() {
  const plan = quickPlan();
  const created = createDefaultPracticeAssessmentRun({
    assessmentRunId: plan.assessmentRunId,
    profileId: "practice-profile_run-12345678",
    contextId: "practice-context_run-12345678",
    depth: "quick",
    plan,
    now: () => new Date("2026-09-07T00:00:00.000Z"),
  });
  return activatePracticeAssessmentRun(created, { now: () => new Date("2026-09-07T00:00:01.000Z") });
}

test("PL19 assessment run starts one block at a time and completed block cannot replay", () => {
  let run = activeRun();
  run = markPracticeAssessmentBlockStarted(run, {
    blockId: "benchmark-natural",
    childSessionId: "practice-session_block-1-12345678",
    now: () => new Date("2026-09-07T00:00:02.000Z"),
  });
  assert.equal(run.blocks[0].status, "active");
  assert.throws(() => markPracticeAssessmentBlockStarted(run, {
    blockId: "diagnostic-core-keys",
    childSessionId: "practice-session_block-2-12345678",
  }), /out of order|replayed/i);

  run = mergePracticeAssessmentBlockDelta(run, {
    assessmentRunId: run.assessmentRunId,
    blockId: "benchmark-natural",
    blockOrdinal: 1,
    sessionId: "practice-session_block-1-12345678",
    completedAtUtc: "2026-09-07T00:01:02.000Z",
    status: "completed",
  });
  assert.equal(run.blocks[0].status, "completed");
  assert.equal(run.progress.currentBlockIndex, 1);
  assert.equal(run.progress.completedBlockCount, 1);
  assert.throws(() => markPracticeAssessmentBlockStarted(run, {
    blockId: "benchmark-natural",
    childSessionId: "practice-session_replay-12345678",
  }), /out of order|replayed/i);
  assert.equal(validatePracticeAssessmentRun(run).valid, true);
});

test("PL19 unfinished run expires by comparison without timers", () => {
  const run = activeRun();
  const before = reconcilePracticeAssessmentRunExpiry(run, { now: () => new Date("2026-09-07T01:59:59.000Z") });
  assert.equal(before.status, "active");
  const expired = reconcilePracticeAssessmentRunExpiry(run, { now: () => new Date("2026-09-07T02:00:01.000Z") });
  assert.equal(expired.status, "expired");
  assert.equal(expired.integrityStatus, "partial");
});

test("PL19 explicit abandonment retains completed blocks and invalidates an active child", () => {
  let run = activeRun();
  run = markPracticeAssessmentBlockStarted(run, {
    blockId: "benchmark-natural",
    childSessionId: "practice-session_abandon-12345678",
    now: () => new Date("2026-09-07T00:00:02.000Z"),
  });
  const abandoned = abandonPracticeAssessmentRun(run, { now: () => new Date("2026-09-07T00:00:10.000Z") });
  assert.equal(abandoned.status, "abandoned");
  assert.equal(abandoned.integrityStatus, "partial");
  assert.equal(abandoned.blocks[0].status, "invalid");
});
