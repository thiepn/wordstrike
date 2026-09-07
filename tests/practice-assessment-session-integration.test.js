import assert from "node:assert/strict";
import { test } from "node:test";
import { createPracticeSessionEngine } from "../js/practiceLab/practiceSessionEngine.js";
import { createPracticeContentPlan } from "../js/practiceLab/practiceSessionContract.js";
import {
  createPracticeAssessmentBlockBinding,
} from "../js/practiceLab/practiceAssessmentPlan.js";
import {
  PRACTICE_ASSESSMENT_CHILD_DESCRIPTORS,
  registerPracticeTrustedAssessmentBinding,
} from "../js/practiceLab/practiceAssessmentRegistry.js";
import { createDefaultPracticeAssessmentRun } from "../js/practiceLab/practiceAssessmentRun.js";
import { getPracticeAssessmentBlocksForDepth } from "../js/practiceLab/practiceAssessmentConstants.js";
import { hashPracticeContent } from "../js/practiceLab/practiceIds.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

function plan(runId) {
  const blocks = getPracticeAssessmentBlocksForDepth("quick").map((block) => ({
    ...block,
    diagnosticFormSetId: block.blockKind === "diagnostic" ? `en:${block.blockId}:v1` : null,
    diagnosticFormId: block.blockKind === "diagnostic" ? `form-${block.blockId}` : null,
    evaluationReservationId: block.blockKind === "benchmark" ? "practice-evaluation-reservation_benchmark-12345678" : null,
    evaluationArtifactId: block.blockKind === "benchmark" ? "suite-en" : null,
    evaluationArtifactVersion: block.blockKind === "benchmark" ? 1 : null,
    expectedPartition: block.blockKind === "benchmark" ? "benchmark" : "diagnostic",
    expectedExperimentId: block.blockKind === "benchmark" ? "full-assessment-benchmark" : "full-assessment-diagnostic",
    targetEntities: [],
  }));
  const value = {
    planVersion: 1,
    assessmentRunId: runId,
    language: "en",
    depth: "quick",
    protocolVersion: 1,
    createdAt: "2026-09-07T00:00:00.000Z",
    blocks,
  };
  value.planHash = hashPracticeContent(JSON.stringify({
    planVersion: value.planVersion,
    assessmentRunId: value.assessmentRunId,
    language: value.language,
    depth: value.depth,
    protocolVersion: value.protocolVersion,
    createdAt: value.createdAt,
    blocks: value.blocks,
  }));
  return value;
}

async function typeSome(engine, harness, text) {
  for (const character of [...text]) {
    const result = engine.handleInput(harness.input(character === " " ? "space" : "character", character));
    assert.equal(result.accepted, true);
    await harness.time.advance(100, { runTimers: false });
  }
}

test("PL19 trusted diagnostic child atomically completes its parent block, stays diagnostic, and adds zero acquisition dose", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl19-assessment-child" });
  const runId = "practice-assessment_child-12345678";
  const frozenPlan = plan(runId);
  const baseRun = createDefaultPracticeAssessmentRun({
    assessmentRunId: runId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    depth: "quick",
    plan: frozenPlan,
    now: () => new Date("2026-09-07T00:00:00.000Z"),
  });
  const run = {
    ...baseRun,
    status: "active",
    startedAt: "2026-09-07T00:00:01.000Z",
    progress: { currentBlockIndex: 1, completedBlockCount: 1, terminalBlockCount: 1 },
    blocks: baseRun.blocks.map((block, index) => index === 0 ? {
      ...block,
      status: "completed",
      childSessionId: "practice-session_prior-benchmark-12345678",
      startedAt: "2026-09-07T00:00:01.000Z",
      completedAt: "2026-09-07T00:01:01.000Z",
      result: { status: "completed", blockMetrics: {} },
    } : block),
  };
  await harness.repository.saveAssessmentRun(run);

  const text = "abcdefghijklmnopqrstuvwxyz ".repeat(150);
  const contentPlan = createPracticeContentPlan({
    contentId: "practice-content_pl19-diagnostic-core",
    contentGeneratorVersion: 1,
    text,
    targetEntities: [],
    completion: { mode: "duration", value: 90_000 },
    metadata: { sourceType: "assessment-diagnostic", partition: "diagnostic", assessmentDiagnosticFormId: "form-diagnostic-core-keys" },
  });
  const binding = createPracticeAssessmentBlockBinding(frozenPlan, frozenPlan.blocks[1], { diagnosticFreshness: "fresh" });
  registerPracticeTrustedAssessmentBinding(contentPlan, binding);

  const sessionId = "practice-session_pl19-child-12345678";
  const engine = createPracticeSessionEngine({
    repository: harness.repository,
    sessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });
  await engine.prepare({
    experiment: PRACTICE_ASSESSMENT_CHILD_DESCRIPTORS.diagnostic,
    configuration: {},
    contentPlan,
  });
  const startedParent = await harness.repository.getAssessmentRun(runId);
  assert.equal(startedParent.blocks[1].status, "active");
  assert.equal(startedParent.blocks[1].childSessionId, sessionId);

  await engine.start();
  await typeSome(engine, harness, "abcdefghijklmnopqrstuvwxyz abcdefghijklmnopqrstuvwxyz ");
  await harness.time.advance(90_000, { runTimers: false });
  const result = await engine.complete("time-complete");

  assert.deepEqual(result.summary.assessmentBinding, {
    assessmentRunId: runId,
    blockId: "diagnostic-core-keys",
    blockOrdinal: 2,
    protocolVersion: 1,
  });
  const completedParent = await harness.repository.getAssessmentRun(runId);
  assert.equal(completedParent.blocks[1].status, "completed");
  assert.equal(completedParent.progress.currentBlockIndex, 2);
  assert.equal(completedParent.progress.completedBlockCount, 2);

  const a = await harness.repository.getSkillStat(harness.profileId, harness.contextId, "key", "a");
  assert.ok(a);
  assert.ok((a.evidence.roles.diagnostic?.sessionCount ?? 0) >= 1);
  assert.equal(a.lastPractisedAt, null);
  assert.deepEqual(await harness.repository.listLearningStates(harness.profileId, harness.contextId), []);
});
