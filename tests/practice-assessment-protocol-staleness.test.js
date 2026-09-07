import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultPracticeAssessmentRun } from "../js/practiceLab/practiceAssessmentRun.js";
import { createPracticeAssessmentService } from "../js/practiceLab/practiceAssessmentService.js";
import { getPracticeAssessmentBlocksForDepth } from "../js/practiceLab/practiceAssessmentConstants.js";
import { hashPracticeContent } from "../js/practiceLab/practiceIds.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

function plan(runId) {
  const blocks = getPracticeAssessmentBlocksForDepth("quick").map((block) => ({
    ...block,
    diagnosticFormSetId: block.blockKind === "diagnostic" ? `en:${block.blockId}:v1` : null,
    diagnosticFormId: block.blockKind === "diagnostic" ? `form-${block.blockId}` : null,
    evaluationReservationId: block.blockKind === "benchmark" ? "practice-evaluation-reservation_stale-12345678" : null,
    evaluationArtifactId: block.blockKind === "benchmark" ? "suite-en" : null,
    evaluationArtifactVersion: block.blockKind === "benchmark" ? 1 : null,
    expectedPartition: block.blockKind === "benchmark" ? "benchmark" : "diagnostic",
    expectedExperimentId: block.blockKind === "benchmark" ? "full-assessment-benchmark" : "full-assessment-diagnostic",
    targetEntities: [],
  }));
  const value = { planVersion: 1, assessmentRunId: runId, language: "en", depth: "quick", protocolVersion: 1, createdAt: "2026-09-01T00:00:00.000Z", blocks };
  value.planHash = hashPracticeContent(JSON.stringify({ planVersion: value.planVersion, assessmentRunId: value.assessmentRunId, language: value.language, depth: value.depth, protocolVersion: value.protocolVersion, createdAt: value.createdAt, blocks: value.blocks }));
  return value;
}

test("PL19 incompatible completed assessment protocol reconciles as stale rather than incomplete", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl19-protocol-stale" });
  const runId = "practice-assessment_protocol-stale-12345678";
  const p = plan(runId);
  const base = createDefaultPracticeAssessmentRun({ assessmentRunId: runId, profileId: harness.profileId, contextId: harness.contextId, depth: "quick", plan: p, now: () => new Date("2026-09-01T00:00:00.000Z") });
  const completed = {
    ...base,
    protocolVersion: 0,
    status: "completed",
    startedAt: "2026-09-01T00:00:01.000Z",
    completedAt: "2026-09-01T00:04:00.000Z",
    progress: { currentBlockIndex: 3, completedBlockCount: 3, terminalBlockCount: 3 },
    blocks: base.blocks.map((block, index) => ({ ...block, status: "completed", childSessionId: `practice-session_stale-${index}-12345678`, startedAt: "2026-09-01T00:00:01.000Z", completedAt: "2026-09-01T00:04:00.000Z", result: { status: "completed", blockMetrics: {} } })),
    report: { reportVersion: 1, reportStatus: "complete", integrity: { status: "standard" } },
  };
  await harness.repository.saveAssessmentRun(completed);
  const service = createPracticeAssessmentService({
    repository: harness.repository,
    benchmarkRegistry: { listReadySuites: () => [] },
    transferRegistry: { listReadyPools: () => [] },
    diagnosticRegistry: { getArtifact: () => null },
    now: () => new Date("2026-09-02T00:00:00.000Z"),
  });
  const state = await service.reconcileAssessmentState({ profileId: harness.profileId, contextId: harness.contextId });
  assert.equal(state.state, "stale");
  assert.equal(state.reason, "protocol-outdated");
  assert.equal(state.assessmentRunId, runId);
});
