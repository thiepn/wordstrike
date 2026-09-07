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
  language: plan.language,
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
  if (typeof plan.language !== "string" || !plan.language) errors.push({ path: "language", code: "REQUIRED" });
  const canonical = getPracticeAssessmentBlocksForDepth(plan.depth);
  if (!canonical.length || !Array.isArray(plan.blocks) || plan.blocks.length !== canonical.length) errors.push({ path: "blocks", code: "SEQUENCE" });
  for (let i = 0; i < Math.min(canonical.length, plan.blocks?.length ?? 0); i += 1) {
    const expected = canonical[i];
    const actual = plan.blocks[i];
    if (actual.blockId !== expected.blockId || actual.ordinal !== expected.ordinal || actual.durationMs !== expected.durationMs || actual.blockKind !== expected.blockKind) errors.push({ path: `blocks.${i}`, code: "CANONICAL_BLOCK_MISMATCH" });
    if (Array.isArray(actual.targetEntities) && actual.targetEntities.length) errors.push({ path: `blocks.${i}.targetEntities`, code: "PERSONAL_TARGETS_FORBIDDEN" });
    if (["benchmark", "cold-transfer"].includes(actual.blockKind) && (!actual.evaluationReservationId || !actual.evaluationArtifactId || !Number.isInteger(actual.evaluationArtifactVersion))) errors.push({ path: `blocks.${i}.evaluationReservationId`, code: "PROTECTED_ARTIFACT_REQUIRED" });
    if (actual.blockKind === "diagnostic" && (!actual.diagnosticFormId || !actual.diagnosticFormSetId)) errors.push({ path: `blocks.${i}.diagnosticFormId`, code: "DIAGNOSTIC_FORM_REQUIRED" });
    for (const forbidden of ["entityKey", "skillStatId", "limiterId", "masteryStage", "learningStateId", "text", "content"]) if (Object.hasOwn(actual, forbidden)) errors.push({ path: `blocks.${i}.${forbidden}`, code: "PERSONAL_OR_CONTENT_FIELD_FORBIDDEN" });
  }
  const expectedHash = hashPracticeContent(stablePlanPayload(plan));
  if (plan.planHash !== expectedHash) errors.push({ path: "planHash", code: "HASH_MISMATCH" });
  return { valid: errors.length === 0, errors };
}

async function abandonReservation(repository, profileId, contextId, reservationId, now) {
  if (!reservationId || typeof repository?.abandonPracticeEvaluationReservation !== "function") return;
  try { await repository.abandonPracticeEvaluationReservation({ profileId, contextId, reservationId, now }); } catch {}
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
  now = () => new Date(),
} = {}) {
  if (!availability?.depths?.[depth]?.available) {
    const error = new Error(`Practice assessment depth is unavailable: ${depth}`);
    error.code = "PRACTICE_ASSESSMENT_DEPTH_UNAVAILABLE";
    error.details = availability?.depths?.[depth]?.reasons ?? [];
    throw error;
  }
  if (!assessmentRunId || !profileId || !contextId || !language) throw new TypeError("Assessment plan requires run/profile/context/language identity");
  if (!evaluationRepository || typeof evaluationRepository.reservePracticeBenchmarkForm !== "function") throw new TypeError("Assessment plan requires protected evaluation reservation service");
  const createdAt = new Date(typeof now === "function" ? now() : now).toISOString();
  let benchmarkReservation = null;
  let transferReservation = null;
  try {
    benchmarkReservation = await evaluationRepository.reservePracticeBenchmarkForm({ profileId, contextId, suite: benchmarkSuite, now });
    if (depth === "deep") transferReservation = await evaluationRepository.reservePracticeColdTransferUnit({ profileId, contextId, pool: transferPool, now });
    const blocks = getPracticeAssessmentBlocksForDepth(depth).map((block) => {
      let diagnosticFormId = null;
      let evaluationReservationId = null;
      let evaluationArtifactId = null;
      let evaluationArtifactVersion = null;
      let expectedPartition = "diagnostic";
      let expectedExperimentId = PRACTICE_ASSESSMENT_EXPERIMENT_IDS.diagnostic;
      if (block.blockKind === "benchmark") {
        evaluationReservationId = benchmarkReservation?.reservation?.reservationId ?? null;
        evaluationArtifactId = benchmarkSuite?.suiteId ?? null;
        evaluationArtifactVersion = benchmarkSuite?.suiteVersion ?? null;
        expectedPartition = "benchmark";
        expectedExperimentId = PRACTICE_ASSESSMENT_EXPERIMENT_IDS.benchmark;
      } else if (block.blockKind === "cold-transfer") {
        evaluationReservationId = transferReservation?.reservation?.reservationId ?? null;
        evaluationArtifactId = transferPool?.poolId ?? null;
        evaluationArtifactVersion = transferPool?.poolVersion ?? null;
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
        evaluationArtifactId,
        evaluationArtifactVersion,
        expectedPartition,
        expectedExperimentId,
        targetEntities: Object.freeze([]),
      });
    });
    const plan = {
      planVersion: PRACTICE_ASSESSMENT_PLAN_VERSION,
      assessmentRunId,
      language,
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
  } catch (cause) {
    await abandonReservation(evaluationRepository, profileId, contextId, transferReservation?.reservation?.reservationId, now);
    await abandonReservation(evaluationRepository, profileId, contextId, benchmarkReservation?.reservation?.reservationId, now);
    throw cause;
  }
}

export function createPracticeAssessmentBlockBinding(plan, block, { diagnosticFreshness = null } = {}) {
  if (!plan || !block) throw new TypeError("Assessment block binding requires plan and block");
  return Object.freeze({
    assessmentRunId: plan.assessmentRunId,
    blockId: block.blockId,
    blockOrdinal: block.ordinal,
    protocolVersion: plan.protocolVersion,
    planVersion: plan.planVersion,
    planHash: plan.planHash,
    expectedExperimentId: block.expectedExperimentId,
    diagnosticFreshness: block.blockKind === "diagnostic" ? diagnosticFreshness : null,
  });
}
