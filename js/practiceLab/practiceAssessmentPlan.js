import {
  PRACTICE_ASSESSMENT_EXPERIMENT_IDS,
  PRACTICE_ASSESSMENT_PLAN_VERSION,
  PRACTICE_ASSESSMENT_PROTOCOL_VERSION,
  getPracticeAssessmentBlocksForDepth,
} from "./practiceAssessmentConstants.js";
import { hashPracticeContent } from "./practiceIds.js";

const stablePlanPayload = (plan) => JSON.stringify({
  planVersion: plan.planVersion,
  assessmentRunId: plan.assessmentRunId,
  depth: plan.depth,
  protocolVersion: plan.protocolVersion,
  createdAt: plan.createdAt,
  blocks: plan.blocks,
});

export function validatePracticeAssessmentPlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return { valid: false, errors: [{ path: "plan", code: "TYPE" }] };
  if (plan.planVersion !== PRACTICE_ASSESSMENT_PLAN_VERSION) errors.push({ path: "planVersion", code: "VERSION" });
  if (plan.protocolVersion !== PRACTICE_ASSESSMENT_PROTOCOL_VERSION) errors.push({ path: "protocolVersion", code: "VERSION" });
  const canonical = getPracticeAssessmentBlocksForDepth(plan.depth);
  if (!canonical.length || !Array.isArray(plan.blocks) || plan.blocks.length !== canonical.length) errors.push({ path: "blocks", code: "SEQUENCE" });
  for (let i = 0; i < Math.min(canonical.length, plan.blocks?.length ?? 0); i += 1) {
    const expected = canonical[i];
    const actual = plan.blocks[i];
    if (actual.blockId !== expected.blockId || actual.ordinal !== expected.ordinal || actual.durationMs !== expected.durationMs || actual.blockKind !== expected.blockKind) errors.push({ path: `blocks.${i}`, code: "CANONICAL_BLOCK_MISMATCH" });
    if (Array.isArray(actual.targetEntities) && actual.targetEntities.length) errors.push({ path: `blocks.${i}.targetEntities`, code: "PERSONAL_TARGETS_FORBIDDEN" });
    for (const forbidden of ["entityKey", "skillStatId", "limiterId", "masteryStage", "learningStateId", "text", "content"]) if (Object.hasOwn(actual, forbidden)) errors.push({ path: `blocks.${i}.${forbidden}`, code: "PERSONAL_OR_CONTENT_FIELD_FORBIDDEN" });
  }
  const expectedHash = hashPracticeContent(stablePlanPayload({ ...plan, planHash: undefined }));
  if (plan.planHash !== expectedHash) errors.push({ path: "planHash", code: "HASH_MISMATCH" });
  return { valid: errors.length === 0, errors };
}

export async function buildPracticeAssessmentPlan({
  assessmentRunId,
  profileId,
  contextId,
  language,
  depth,
  availability,
  diagnosticRegistry,
  diagnosticExposureCounts = {},
  benchmarkSuite,
  transferPool = null,
  evaluationRepository,
  now = Date.now,
} = {}) {
  if (!availability?.depths?.[depth]?.available) {
    const error = new Error(`Practice assessment depth is unavailable: ${depth}`);
    error.code = "PRACTICE_ASSESSMENT_DEPTH_UNAVAILABLE";
    error.details = availability?.depths?.[depth]?.reasons ?? [];
    throw error;
  }
  if (!assessmentRunId || !profileId || !contextId || !language) throw new TypeError("Assessment plan requires run/profile/context/language identity");
  const createdAt = new Date(now()).toISOString();
  const benchmarkReservation = await evaluationRepository.reservePracticeBenchmarkForm({ profileId, contextId, suite: benchmarkSuite, now });
  let transferReservation = null;
  if (depth === "deep") transferReservation = await evaluationRepository.reservePracticeColdTransferUnit({ profileId, contextId, pool: transferPool, now });
  const blocks = getPracticeAssessmentBlocksForDepth(depth).map((block) => {
    let diagnosticFormId = null;
    let evaluationReservationId = null;
    let expectedPartition = "diagnostic";
    let expectedExperimentId = PRACTICE_ASSESSMENT_EXPERIMENT_IDS.diagnostic;
    if (block.blockKind === "benchmark") {
      evaluationReservationId = benchmarkReservation?.reservation?.reservationId ?? benchmarkReservation?.state?.activeReservations?.at?.(-1)?.reservationId ?? null;
      expectedPartition = "benchmark";
      expectedExperimentId = PRACTICE_ASSESSMENT_EXPERIMENT_IDS.benchmark;
    } else if (block.blockKind === "cold-transfer") {
      evaluationReservationId = transferReservation?.reservation?.reservationId ?? transferReservation?.state?.activeReservations?.at?.(-1)?.reservationId ?? null;
      expectedPartition = "transfer";
      expectedExperimentId = PRACTICE_ASSESSMENT_EXPERIMENT_IDS.coldTransfer;
    } else {
      const form = diagnosticRegistry.selectForm({ language, blockId: block.blockId, exposureCounts: diagnosticExposureCounts, profileId });
      diagnosticFormId = form?.formId ?? null;
    }
    return Object.freeze({
      blockId: block.blockId,
      ordinal: block.ordinal,
      durationMs: block.durationMs,
      blockKind: block.blockKind,
      diagnosticFormSetId: block.blockKind === "diagnostic" ? `${language}:${block.blockId}:v1` : null,
      diagnosticFormId,
      evaluationReservationId,
      expectedPartition,
      expectedExperimentId,
      targetEntities: Object.freeze([]),
    });
  });
  const plan = {
    planVersion: PRACTICE_ASSESSMENT_PLAN_VERSION,
    assessmentRunId,
    depth,
    protocolVersion: PRACTICE_ASSESSMENT_PROTOCOL_VERSION,
    createdAt,
    blocks,
  };
  plan.planHash = hashPracticeContent(stablePlanPayload(plan));
  const validation = validatePracticeAssessmentPlan(plan);
  if (!validation.valid) {
    const error = new Error("Practice assessment plan failed validation");
    error.code = "PRACTICE_ASSESSMENT_PLAN_INVALID";
    error.details = validation.errors;
    throw error;
  }
  return Object.freeze({ ...plan, blocks: Object.freeze(blocks) });
}

export function createPracticeAssessmentBlockBinding(plan, block) {
  if (!plan || !block) throw new TypeError("Assessment block binding requires plan and block");
  return Object.freeze({
    assessmentRunId: plan.assessmentRunId,
    blockId: block.blockId,
    blockOrdinal: block.ordinal,
    planVersion: plan.planVersion,
    planHash: plan.planHash,
    expectedExperimentId: block.expectedExperimentId,
  });
}
