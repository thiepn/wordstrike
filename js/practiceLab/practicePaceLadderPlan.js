import { hashPracticeContent } from "./practiceIds.js";
import {
  PRACTICE_PACE_LADDER_CALIBRATION_DURATION_MS,
  PRACTICE_PACE_LADDER_FORM_SCHEMA_VERSION,
  PRACTICE_PACE_LADDER_GENERATOR_VERSION,
  PRACTICE_PACE_LADDER_POLICY_VERSION,
  PRACTICE_PACE_LADDER_RATIOS,
  PRACTICE_PACE_LADDER_STAGE_DURATION_MS,
  PRACTICE_PACE_LADDER_STAGE_IDS,
  PRACTICE_PACE_LADDER_STAGE_VERSION,
  PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS,
  PRACTICE_PACE_LADDER_VALIDATION_DURATION_MS,
  PRACTICE_PACE_LADDER_VERSION,
} from "./practicePaceLadderConstants.js";
import { PRACTICE_PACE_LADDER_POLICY_V1 } from "./practicePaceLadderPolicy.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const target = (anchor, ratio, policy) => clamp(anchor * ratio, policy.targetMinimumWpm, policy.targetMaximumWpm);

export function buildPracticePaceLadderSchedule(anchorWpm, policy = PRACTICE_PACE_LADDER_POLICY_V1) {
  if (!Number.isFinite(anchorWpm) || anchorWpm <= 0) throw new TypeError("Pace Ladder requires a finite anchor");
  const stages = [];
  let cursor = 0;
  stages.push({ stageVersion: PRACTICE_PACE_LADDER_STAGE_VERSION, stageId: "calibration", stageOrdinal: 0, kind: "calibration", startMs: cursor, endMs: cursor + PRACTICE_PACE_LADDER_CALIBRATION_DURATION_MS, durationMs: PRACTICE_PACE_LADDER_CALIBRATION_DURATION_MS, ratio: 1, targetWpm: anchorWpm });
  cursor += PRACTICE_PACE_LADDER_CALIBRATION_DURATION_MS;
  PRACTICE_PACE_LADDER_RATIOS.forEach((ratio, index) => {
    stages.push({ stageVersion: PRACTICE_PACE_LADDER_STAGE_VERSION, stageId: `stage-${index + 1}`, stageOrdinal: index + 1, kind: "main", startMs: cursor, endMs: cursor + PRACTICE_PACE_LADDER_STAGE_DURATION_MS, durationMs: PRACTICE_PACE_LADDER_STAGE_DURATION_MS, ratio, targetWpm: target(anchorWpm, ratio, policy) });
    cursor += PRACTICE_PACE_LADDER_STAGE_DURATION_MS;
  });
  stages.push({ stageVersion: PRACTICE_PACE_LADDER_STAGE_VERSION, stageId: "validation", stageOrdinal: 6, kind: "validation", startMs: cursor, endMs: cursor + PRACTICE_PACE_LADDER_VALIDATION_DURATION_MS, durationMs: PRACTICE_PACE_LADDER_VALIDATION_DURATION_MS, ratio: 1, targetWpm: anchorWpm });
  return freezeDeep(stages);
}

export function createPracticePaceLadderPlan({ sessionId, profileId, contextId, formSetId, formSetVersion = 1, formId, formFamilyId, formOrdinal, formHash, anchor, policy = PRACTICE_PACE_LADDER_POLICY_V1 } = {}) {
  if (!sessionId || !profileId || !contextId || !formId || !formHash || !anchor || !Number.isFinite(anchor.effectiveWpm)) throw new TypeError("Pace Ladder plan identity/anchor is incomplete");
  const stages = buildPracticePaceLadderSchedule(anchor.effectiveWpm, policy);
  const basis = { version: PRACTICE_PACE_LADDER_VERSION, policyVersion: PRACTICE_PACE_LADDER_POLICY_VERSION, sessionId, profileId, contextId, formSetId, formSetVersion, formId, formFamilyId, formOrdinal, formHash, anchorSource: anchor.source, anchorWpm: anchor.effectiveWpm, stages: stages.map(({ stageId, durationMs, ratio, targetWpm }) => ({ stageId, durationMs, ratio, targetWpm })) };
  return freezeDeep({
    version: PRACTICE_PACE_LADDER_VERSION,
    policyVersion: PRACTICE_PACE_LADDER_POLICY_VERSION,
    formSchemaVersion: PRACTICE_PACE_LADDER_FORM_SCHEMA_VERSION,
    generatorVersion: PRACTICE_PACE_LADDER_GENERATOR_VERSION,
    sessionId, profileId, contextId, formSetId, formSetVersion, formId, formFamilyId, formOrdinal, formHash,
    anchor,
    stages,
    referenceStage: stages[0],
    rungSchedule: stages.slice(1, 6),
    validationStage: stages[6],
    totalActiveDurationMs: PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS,
    paceRangeClipped: stages.some((stage) => stage.targetWpm === policy.targetMaximumWpm || stage.targetWpm === policy.targetMinimumWpm),
    planHash: hashPracticeContent(JSON.stringify(basis)),
  });
}

export function getPracticePaceLadderStageForActiveMs(plan, activeMs) {
  if (!plan || !Number.isFinite(activeMs) || activeMs < 0) return null;
  return plan.stages.find((stage) => activeMs >= stage.startMs && activeMs < stage.endMs) ?? (activeMs >= plan.totalActiveDurationMs ? plan.stages.at(-1) : null);
}

export function validatePracticePaceLadderPlan(plan) {
  if (!plan || plan.version !== PRACTICE_PACE_LADDER_VERSION || plan.policyVersion !== PRACTICE_PACE_LADDER_POLICY_VERSION || plan.totalActiveDurationMs !== 190_000 || plan.stages?.length !== 7) return false;
  if (!PRACTICE_PACE_LADDER_STAGE_IDS.every((id, index) => plan.stages[index]?.stageId === id)) return false;
  return plan.stages.slice(1, 6).every((stage, index) => stage.durationMs === 25_000 && stage.ratio === PRACTICE_PACE_LADDER_RATIOS[index] && stage.ratio <= 1.25) && plan.stages[0].durationMs === 25_000 && plan.stages[6].durationMs === 40_000;
}
