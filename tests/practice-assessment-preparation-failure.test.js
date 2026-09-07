import assert from "node:assert/strict";
import { test } from "node:test";
import { createPracticeAssessmentService } from "../js/practiceLab/practiceAssessmentService.js";
import { createDefaultPracticeAssessmentRun } from "../js/practiceLab/practiceAssessmentRun.js";
import { getPracticeAssessmentBlocksForDepth } from "../js/practiceLab/practiceAssessmentConstants.js";
import { hashPracticeContent } from "../js/practiceLab/practiceIds.js";

function activeBenchmarkRun() {
  const runId = "practice-assessment_claim-failure-12345678";
  const blocks = getPracticeAssessmentBlocksForDepth("quick").map((block) => ({
    ...block,
    diagnosticFormSetId: block.blockKind === "diagnostic" ? `en:${block.blockId}:v1` : null,
    diagnosticFormId: block.blockKind === "diagnostic" ? `form-${block.blockId}` : null,
    evaluationReservationId: block.blockKind === "benchmark" ? "practice-evaluation-reservation_claim-failure-12345678" : null,
    evaluationArtifactId: block.blockKind === "benchmark" ? "suite-en" : null,
    evaluationArtifactVersion: block.blockKind === "benchmark" ? 1 : null,
    expectedPartition: block.blockKind === "benchmark" ? "benchmark" : "diagnostic",
    expectedExperimentId: block.blockKind === "benchmark" ? "full-assessment-benchmark" : "full-assessment-diagnostic",
    targetEntities: [],
  }));
  const plan = { planVersion: 1, assessmentRunId: runId, language: "en", depth: "quick", protocolVersion: 1, createdAt: "2026-09-07T00:00:00.000Z", blocks };
  plan.planHash = hashPracticeContent(JSON.stringify({ planVersion: plan.planVersion, assessmentRunId: plan.assessmentRunId, language: plan.language, depth: plan.depth, protocolVersion: plan.protocolVersion, createdAt: plan.createdAt, blocks: plan.blocks }));
  const base = createDefaultPracticeAssessmentRun({ assessmentRunId: runId, profileId: "practice-profile_claim-12345678", contextId: "practice-context_claim-12345678", depth: "quick", plan, now: () => new Date("2026-09-07T00:00:00.000Z") });
  return { ...base, status: "active", startedAt: "2026-09-07T00:00:01.000Z" };
}

test("PL19 post-claim preparation failure invalidates the frozen block and cannot silently retry it", async () => {
  let run = activeBenchmarkRun();
  let claimAttempts = 0;
  const repository = {
    listAssessmentRuns: async () => [run],
    createAssessmentRun: async () => {},
    getAssessmentRun: async () => run,
    saveAssessmentRun: async (next) => { run = next; return next; },
    async claimPracticeEvaluationReservation() {
      claimAttempts += 1;
      const error = new Error("content source unavailable after protected claim");
      error.code = "PRACTICE_EVALUATION_CLAIMED_LOAD_FAILED";
      throw error;
    },
  };
  const benchmarkRegistry = {
    listReadySuites: () => [],
    getSuite: (id) => id === "suite-en" ? { status: "ready", language: "en", suiteId: "suite-en", suiteVersion: 1, forms: [] } : null,
    loadSuite: async () => null,
  };
  const service = createPracticeAssessmentService({
    repository,
    benchmarkRegistry,
    transferRegistry: { listReadyPools: () => [], getPool: () => null, loadPool: async () => null },
    diagnosticRegistry: { getArtifact: () => null, listArtifacts: () => [] },
    now: () => new Date("2026-09-07T00:00:02.000Z"),
  });

  await assert.rejects(
    () => service.prepareNextBlock({ assessmentRunId: run.assessmentRunId, sessionId: "practice-session_claim-failure-12345678" }),
    /content source unavailable after protected claim/,
  );
  assert.equal(claimAttempts, 1);
  assert.equal(run.blocks[0].status, "invalid");
  assert.equal(run.progress.currentBlockIndex, 1);
  assert.equal(run.integrityStatus, "partial");
  assert.equal(run.blocks[0].result.reason, "PRACTICE_EVALUATION_CLAIMED_LOAD_FAILED");
  assert.notEqual(run.blocks[run.progress.currentBlockIndex].blockId, "benchmark-natural");
});
