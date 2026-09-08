import { hashPracticeContent } from "./practiceIds.js";
import {
  PRACTICE_PACE_GUIDE_VERSION,
  PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION,
  PRACTICE_PACE_LADDER_FORM_SCHEMA_VERSION,
  PRACTICE_PACE_LADDER_GENERATOR_VERSION,
  PRACTICE_PACE_LADDER_POLICY_VERSION,
  PRACTICE_PACE_LADDER_RATIOS,
  PRACTICE_PACE_LADDER_REFERENCE_DURATION_MS,
  PRACTICE_PACE_LADDER_RESULT_VERSION,
  PRACTICE_PACE_LADDER_STAGE_IDS,
  PRACTICE_PACE_LADDER_STAGE_VERSION,
  PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS,
  PRACTICE_PACE_LADDER_VERSION,
} from "./practicePaceLadderConstants.js";
import { PRACTICE_PACE_LADDER_POLICY_V1 } from "./practicePaceLadderPolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function target(rawAnchorWpm, ratio, policy) {
  return rawAnchorWpm == null ? null : clamp(rawAnchorWpm * ratio, policy.targetMinimumWpm, policy.targetMaximumWpm);
}

function schedule(rawAnchorWpm, policy) {
  const stages = [{
    stageVersion: PRACTICE_PACE_LADDER_STAGE_VERSION,
    stageId: "reference",
    stageOrdinal: 0,
    startMs: 0,
    endMs: PRACTICE_PACE_LADDER_REFERENCE_DURATION_MS,
    durationMs: PRACTICE_PACE_LADDER_REFERENCE_DURATION_MS,
    ratio: null,
    plannedPaceWpm: null,
  }];
  PRACTICE_PACE_LADDER_RATIOS.forEach((ratio, index) => {
    const startMs = PRACTICE_PACE_LADDER_REFERENCE_DURATION_MS + index * policy.rungDurationMs;
    stages.push({
      stageVersion: PRACTICE_PACE_LADDER_STAGE_VERSION,
      stageId: `rung-${index + 1}`,
      stageOrdinal: index + 1,
      startMs,
      endMs: startMs + policy.rungDurationMs,
      durationMs: policy.rungDurationMs,
      ratio,
      plannedPaceWpm: target(rawAnchorWpm, ratio, policy),
    });
  });
  return stages;
}

function hashBasis({ sessionId, formSetId, formSetVersion, formId, formHash, anchor }) {
  return {
    version: PRACTICE_PACE_LADDER_VERSION,
    policyVersion: PRACTICE_PACE_LADDER_POLICY_VERSION,
    formSchemaVersion: PRACTICE_PACE_LADDER_FORM_SCHEMA_VERSION,
    generatorVersion: PRACTICE_PACE_LADDER_GENERATOR_VERSION,
    anchorPolicyVersion: PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION,
    stageVersion: PRACTICE_PACE_LADDER_STAGE_VERSION,
    paceGuideVersion: PRACTICE_PACE_GUIDE_VERSION,
    resultVersion: PRACTICE_PACE_LADDER_RESULT_VERSION,
    sessionId,
    formSetId,
    formSetVersion,
    formId,
    formHash,
    referenceDurationMs: PRACTICE_PACE_LADDER_REFERENCE_DURATION_MS,
    rungDurationMs: PRACTICE_PACE_LADDER_POLICY_V1.rungDurationMs,
    ratios: [...PRACTICE_PACE_LADDER_RATIOS],
    anchorSource: anchor.source,
    preResolvedRawAnchorWpm: anchor.source === "control-frontier" ? anchor.rawReferenceWpm : null,
    paceGuideToleranceSeconds: PRACTICE_PACE_LADDER_POLICY_V1.onPaceToleranceSeconds,
  };
}

export function createPracticePaceLadderPlan({
  sessionId,
  formSetId,
  formSetVersion = 1,
  formId,
  formHash,
  anchor,
  policy = PRACTICE_PACE_LADDER_POLICY_V1,
} = {}) {
  if (typeof sessionId !== "string" || !sessionId || typeof formId !== "string" || !formId || typeof formHash !== "string" || !formHash || !anchor) throw new TypeError("Pace Ladder plan identity/anchor is incomplete");
  const rawAnchorWpm = anchor.source === "control-frontier" ? anchor.rawReferenceWpm : null;
  const basis = hashBasis({ sessionId, formSetId, formSetVersion, formId, formHash, anchor });
  const stages = schedule(rawAnchorWpm, policy);
  const referenceStage = stages[0];
  const rungSchedule = stages.slice(1);
  return freezeDeep({
    version: PRACTICE_PACE_LADDER_VERSION,
    policyVersion: PRACTICE_PACE_LADDER_POLICY_VERSION,
    formSchemaVersion: PRACTICE_PACE_LADDER_FORM_SCHEMA_VERSION,
    generatorVersion: PRACTICE_PACE_LADDER_GENERATOR_VERSION,
    anchorPolicyVersion: PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION,
    sessionId,
    formSetId,
    formSetVersion,
    formId,
    formHash,
    referenceStage,
    rungSchedule,
    anchor,
    totalActiveDurationMs: PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS,
    paceRangeClipped: rungSchedule.some((stage) => stage.plannedPaceWpm === policy.targetMaximumWpm || stage.plannedPaceWpm === policy.targetMinimumWpm),
    planHash: hashPracticeContent(JSON.stringify(basis)),
  });
}

export function resolvePracticePaceLadderPlanCalibration(plan, calibration, policy = PRACTICE_PACE_LADDER_POLICY_V1) {
  if (plan?.anchor?.source !== "in-session-calibration") return plan;
  if (!calibration?.eligible || !Number.isFinite(calibration.rawReferenceWpm)) throw new TypeError("Pace Ladder calibration is insufficient");
  const rawReferenceWpm = calibration.rawReferenceWpm;
  const stages = schedule(rawReferenceWpm, policy);
  const rungSchedule = stages.slice(1);
  return freezeDeep({
    ...plan,
    referenceStage: stages[0],
    rungSchedule,
    anchor: {
      ...plan.anchor,
      rawReferenceWpm,
      adjustedReferenceWpm: null,
      difficultyAdjustmentStatus: "in-session-calibration",
      difficultyAdjustmentLog: 0,
    },
    paceRangeClipped: rungSchedule.some((stage) => stage.plannedPaceWpm === policy.targetMaximumWpm || stage.plannedPaceWpm === policy.targetMinimumWpm),
  });
}

export function getPracticePaceLadderStageForActiveMs(plan, activeMs) {
  if (!plan || !Number.isFinite(activeMs) || activeMs < 0) return null;
  const schedule = [plan.referenceStage, ...(plan.rungSchedule ?? []).filter((stage) => stage.stageId !== "reference")];
  return schedule.find((stage) => activeMs >= stage.startMs && activeMs < stage.endMs) ?? (activeMs === plan.totalActiveDurationMs ? schedule.at(-1) : null);
}

export function validatePracticePaceLadderPlan(plan) {
  if (!plan || plan.version !== PRACTICE_PACE_LADDER_VERSION || plan.policyVersion !== PRACTICE_PACE_LADDER_POLICY_VERSION) return false;
  if (plan.totalActiveDurationMs !== PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS || plan.rungSchedule?.length !== 8) return false;
  const stages = [plan.referenceStage, ...plan.rungSchedule];
  return PRACTICE_PACE_LADDER_STAGE_IDS.every((id, index) => stages[index]?.stageId === id);
}
