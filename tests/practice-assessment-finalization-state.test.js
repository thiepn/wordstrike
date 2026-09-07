import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultPracticeAssessmentRun } from "../js/practiceLab/practiceAssessmentRun.js";
import { createPracticeAssessmentService } from "../js/practiceLab/practiceAssessmentService.js";
import { getPracticeAssessmentBlocksForDepth } from "../js/practiceLab/practiceAssessmentConstants.js";
import { hashPracticeContent } from "../js/practiceLab/practiceIds.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

function plan(runId, depth = "quick") {
  const blocks = getPracticeAssessmentBlocksForDepth(depth).map((block) => ({
    ...block,
    diagnosticFormSetId: block.blockKind === "diagnostic" ? `en:${block.blockId}:v1` : null,
    diagnosticFormId: block.blockKind === "diagnostic" ? `form-${block.blockId}` : null,
    evaluationReservationId: block.blockKind === "benchmark" ? `practice-evaluation-reservation_${runId.slice(-12)}-12345678` : block.blockKind === "cold-transfer" ? `practice-evaluation-reservation_transfer-${runId.slice(-8)}-12345678` : null,
    evaluationArtifactId: block.blockKind === "benchmark" ? "suite-en" : block.blockKind === "cold-transfer" ? "pool-en" : null,
    evaluationArtifactVersion: ["benchmark", "cold-transfer"].includes(block.blockKind) ? 1 : null,
    expectedPartition: block.blockKind === "benchmark" ? "benchmark" : block.blockKind === "cold-transfer" ? "transfer" : "diagnostic",
    expectedExperimentId: block.blockKind === "benchmark" ? "full-assessment-benchmark" : block.blockKind === "cold-transfer" ? "full-assessment-transfer" : "full-assessment-diagnostic",
    targetEntities: [],
  }));
  const value = { planVersion: 1, assessmentRunId: runId, language: "en", depth, protocolVersion: 1, createdAt: "2026-08-01T00:00:00.000Z", blocks };
  value.planHash = hashPracticeContent(JSON.stringify({ planVersion: value.planVersion, assessmentRunId: value.assessmentRunId, language: value.language, depth: value.depth, protocolVersion: value.protocolVersion, createdAt: value.createdAt, blocks: value.blocks }));
  return value;
}

function terminalRun({ runId, profileId, contextId, completedAt, report = null }) {
  const frozenPlan = plan(runId);
  const base = createDefaultPracticeAssessmentRun({ assessmentRunId: runId, profileId, contextId, depth: "quick", plan: frozenPlan, now: () => new Date("2026-08-01T00:00:00.000Z") });
  return {
    ...base,
    status: report ? "completed" : "active",
    startedAt: "2026-08-01T00:00:01.000Z",
    completedAt: report ? completedAt : null,
    progress: { currentBlockIndex: 3, completedBlockCount: 3, terminalBlockCount: 3 },
    blocks: base.blocks.map((block, index) => ({
      ...block,
      status: "completed",
      childSessionId: `practice-session_final-${index}-${runId.slice(-8)}-12345678`,
      startedAt: `2026-08-01T00:0${index + 1}:00.000Z`,
      completedAt: `2026-08-01T00:0${index + 1}:30.000Z`,
      result: { status: "completed", blockMetrics: {}, coverage: null },
    })),
    integrityStatus: "standard",
    report,
  };
}

const registries = {
  benchmarkRegistry: { listReadySuites: () => [] },
  transferRegistry: { listReadyPools: () => [] },
  diagnosticRegistry: { getArtifact: () => null },
};

test("PL19 first valid completion sets first timestamp once and later completion only advances lastAssessmentAt", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl19-finalization" });
  const firstId = "practice-assessment_first-final-12345678";
  await harness.repository.saveAssessmentRun(terminalRun({ runId: firstId, profileId: harness.profileId, contextId: harness.contextId, completedAt: "2026-08-01T00:04:00.000Z" }));
  const firstReport = { reportVersion: 1, reportStatus: "complete", integrity: { status: "standard" } };
  await harness.repository.finalizeAssessmentRun({ assessmentRunId: firstId, report: firstReport, completedAt: "2026-08-01T00:04:00.000Z" });
  let profile = await harness.repository.getPracticeProfile();
  assert.equal(profile.firstAssessmentCompleted, true);
  assert.equal(profile.firstAssessmentCompletedAt, "2026-08-01T00:04:00.000Z");
  assert.equal(profile.lastAssessmentAt, "2026-08-01T00:04:00.000Z");

  const secondId = "practice-assessment_second-final-12345678";
  await harness.repository.saveAssessmentRun(terminalRun({ runId: secondId, profileId: harness.profileId, contextId: harness.contextId, completedAt: "2026-08-20T00:04:00.000Z" }));
  await harness.repository.finalizeAssessmentRun({ assessmentRunId: secondId, report: firstReport, completedAt: "2026-08-20T00:04:00.000Z" });
  profile = await harness.repository.getPracticeProfile();
  assert.equal(profile.firstAssessmentCompletedAt, "2026-08-01T00:04:00.000Z");
  assert.equal(profile.lastAssessmentAt, "2026-08-20T00:04:00.000Z");
});

test("PL19 partial first run does not satisfy first-assessment completion", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl19-partial-finalization" });
  const runId = "practice-assessment_partial-final-12345678";
  await harness.repository.saveAssessmentRun(terminalRun({ runId, profileId: harness.profileId, contextId: harness.contextId, completedAt: "2026-08-01T00:04:00.000Z" }));
  await harness.repository.finalizeAssessmentRun({ assessmentRunId: runId, report: { reportVersion: 1, reportStatus: "partial", integrity: { status: "partial" } }, completedAt: "2026-08-01T00:04:00.000Z" });
  const profile = await harness.repository.getPracticeProfile();
  assert.equal(profile.firstAssessmentCompleted, false);
  assert.equal(profile.firstAssessmentCompletedAt, null);
  assert.equal(profile.lastAssessmentAt, null);
});

test("PL19 context state is context-specific and becomes stale after 30 days without gating Practice", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl19-context-state" });
  const runId = "practice-assessment_context-state-12345678";
  const report = { reportVersion: 1, reportStatus: "complete", integrity: { status: "standard" } };
  await harness.repository.saveAssessmentRun(terminalRun({ runId, profileId: harness.profileId, contextId: harness.contextId, completedAt: "2026-08-01T00:04:00.000Z", report }));

  const serviceFresh = createPracticeAssessmentService({ repository: harness.repository, ...registries, now: () => new Date("2026-08-20T00:00:00.000Z") });
  const fresh = await serviceFresh.reconcileAssessmentState({ profileId: harness.profileId, contextId: harness.contextId });
  assert.equal(fresh.state, "complete");

  const other = await harness.repository.createPracticeContext({ profileId: harness.profileId, inputMethod: "physical" });
  const otherState = await serviceFresh.reconcileAssessmentState({ profileId: harness.profileId, contextId: other.context.contextId });
  assert.equal(otherState.state, "never-started");

  const serviceStale = createPracticeAssessmentService({ repository: harness.repository, ...registries, now: () => new Date("2026-09-02T00:04:01.000Z") });
  const stale = await serviceStale.reconcileAssessmentState({ profileId: harness.profileId, contextId: harness.contextId });
  assert.equal(stale.state, "stale");
});
