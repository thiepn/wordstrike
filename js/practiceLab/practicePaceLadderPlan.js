import { hashPracticeContent } from "./practiceIds.js";
import {
  PRACTICE_PACE_LADDER_FORM_SCHEMA_VERSION,
  PRACTICE_PACE_LADDER_GENERATOR_VERSION,
  PRACTICE_PACE_LADDER_POLICY_VERSION,
  PRACTICE_PACE_LADDER_PROTOCOL_VERSION,
  PRACTICE_PACE_LADDER_RATIOS,
  PRACTICE_PACE_LADDER_REFERENCE_DURATION_MS,
  PRACTICE_PACE_LADDER_RUNG_DURATION_MS,
  PRACTICE_PACE_LADDER_STAGE_IDS,
  PRACTICE_PACE_LADDER_STAGE_VERSION,
  PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS,
  PRACTICE_PACE_LADDER_VERSION,
} from "./practicePaceLadderConstants.js";
import { PRACTICE_PACE_LADDER_POLICY_V1 } from "./practicePaceLadderPolicy.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const roundTarget = (value, precision) => Math.round(value / precision) * precision;
const target = (anchor, ratio, policy) => Number.isFinite(anchor)
  ? roundTarget(clamp(anchor * ratio, policy.targetMinimumWpm, policy.targetMaximumWpm), policy.targetPrecisionWpm)
  : null;

export function buildPracticePaceLadderSchedule(rawAnchorWpm = null, policy = PRACTICE_PACE_LADDER_POLICY_V1) {
  if (rawAnchorWpm != null && (!Number.isFinite(rawAnchorWpm) || rawAnchorWpm <= 0)) throw new TypeError("Pace Ladder raw anchor must be positive or pending");
  const stages = [];
  let cursor = 0;
  stages.push({ stageVersion: PRACTICE_PACE_LADDER_STAGE_VERSION, stageId: "reference", stageOrdinal: 0, kind: "reference", startMs: cursor, endMs: cursor + PRACTICE_PACE_LADDER_REFERENCE_DURATION_MS, durationMs: PRACTICE_PACE_LADDER_REFERENCE_DURATION_MS, ratio: 1, targetWpm: null });
  cursor += PRACTICE_PACE_LADDER_REFERENCE_DURATION_MS;
  PRACTICE_PACE_LADDER_RATIOS.forEach((ratio, index) => {
    stages.push({ stageVersion: PRACTICE_PACE_LADDER_STAGE_VERSION, stageId: `rung-${index + 1}`, stageOrdinal: index + 1, kind: "rung", startMs: cursor, endMs: cursor + PRACTICE_PACE_LADDER_RUNG_DURATION_MS, durationMs: PRACTICE_PACE_LADDER_RUNG_DURATION_MS, ratio, targetWpm: target(rawAnchorWpm, ratio, policy) });
    cursor += PRACTICE_PACE_LADDER_RUNG_DURATION_MS;
  });
  return freezeDeep(stages);
}

export function createPracticePaceLadderPlan({ sessionId, profileId, contextId, formSetId, formSetVersion = 1, formId, formFamilyId, formOrdinal, formHash, anchor = null, policy = PRACTICE_PACE_LADDER_POLICY_V1 } = {}) {
  if (!sessionId || !profileId || !contextId || !formId || !formHash) throw new TypeError("Pace Ladder plan identity is incomplete");
  const rawAnchorWpm = Number.isFinite(anchor?.rawAnchorWpm) && anchor.rawAnchorWpm > 0 ? anchor.rawAnchorWpm : null;
  const stages = buildPracticePaceLadderSchedule(rawAnchorWpm, policy);
  const basis = { version: PRACTICE_PACE_LADDER_VERSION, protocolVersion: PRACTICE_PACE_LADDER_PROTOCOL_VERSION, policyVersion: PRACTICE_PACE_LADDER_POLICY_VERSION, sessionId, profileId, contextId, formSetId, formSetVersion, formId, formFamilyId, formOrdinal, formHash, anchorSource: anchor?.source ?? "in-session-reference", rawAnchorWpm, stages: stages.map(({ stageId, durationMs, ratio, targetWpm }) => ({ stageId, durationMs, ratio, targetWpm })) };
  return freezeDeep({
    version: PRACTICE_PACE_LADDER_VERSION,
    protocolVersion: PRACTICE_PACE_LADDER_PROTOCOL_VERSION,
    policyVersion: PRACTICE_PACE_LADDER_POLICY_VERSION,
    formSchemaVersion: PRACTICE_PACE_LADDER_FORM_SCHEMA_VERSION,
    generatorVersion: PRACTICE_PACE_LADDER_GENERATOR_VERSION,
    sessionId, profileId, contextId, formSetId, formSetVersion, formId, formFamilyId, formOrdinal, formHash,
    anchor: anchor ?? freezeDeep({ source: "in-session-reference", status: "pending", rawAnchorWpm: null, effectiveWpm: null }),
    stages,
    referenceStage: stages[0],
    rungSchedule: stages.slice(1),
    validationStage: null,
    totalActiveDurationMs: PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS,
    paceRangeClipped: stages.some((stage) => Number.isFinite(stage.targetWpm) && (stage.targetWpm === policy.targetMaximumWpm || stage.targetWpm === policy.targetMinimumWpm)),
    planHash: hashPracticeContent(JSON.stringify(basis)),
  });
}

export function getPracticePaceLadderStageForActiveMs(plan, activeMs) {
  if (!plan || !Number.isFinite(activeMs) || activeMs < 0) return null;
  return plan.stages.find((stage) => activeMs >= stage.startMs && activeMs < stage.endMs) ?? (activeMs >= plan.totalActiveDurationMs ? plan.stages.at(-1) : null);
}

export function validatePracticePaceLadderPlan(plan) {
  if (!plan || plan.version !== PRACTICE_PACE_LADDER_VERSION || plan.protocolVersion !== PRACTICE_PACE_LADDER_PROTOCOL_VERSION || plan.policyVersion !== PRACTICE_PACE_LADDER_POLICY_VERSION || plan.totalActiveDurationMs !== 190_000 || plan.stages?.length !== 9) return false;
  if (!PRACTICE_PACE_LADDER_STAGE_IDS.every((id, index) => plan.stages[index]?.stageId === id)) return false;
  if (plan.validationStage != null || plan.stages.some((stage) => stage.kind === "validation" || stage.kind === "calibration")) return false;
  if (plan.stages[0].durationMs !== 30_000 || plan.stages[0].kind !== "reference") return false;
  return plan.stages.slice(1).every((stage, index) => stage.durationMs === 20_000 && stage.ratio === PRACTICE_PACE_LADDER_RATIOS[index]);
}
