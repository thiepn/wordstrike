import { PRACTICE_COACH_UTILITY_VERSION } from "./practiceCoachConstants.js";
import { PRACTICE_COACH_POLICY_V1 } from "./practiceCoachPolicy.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value) => Number.isFinite(Number(value));

export function resolvePracticeCoachBaseNeed(candidate = {}) {
  if (finite(candidate.priorityScore)) return Number(candidate.priorityScore);
  if (finite(candidate.priority)) return Number(candidate.priority);
  if (finite(candidate.weaknessScore)) return 0.75 * Number(candidate.weaknessScore);
  return 0;
}

export function resolvePracticeCoachMasteryModifier(stage, policy = PRACTICE_COACH_POLICY_V1) {
  return policy.masteryModifier[stage] ?? policy.masteryModifier.unmeasured;
}

export function resolvePracticeCoachSaturationModifier(status, policy = PRACTICE_COACH_POLICY_V1) {
  return policy.saturationModifier[status] ?? policy.saturationModifier["insufficient-data"];
}

export function resolvePracticeCoachMarginalGainModifier(band, policy = PRACTICE_COACH_POLICY_V1) {
  return policy.marginalGainModifier[band] ?? policy.marginalGainModifier.unknown;
}

export function resolvePracticeCoachHeadroom({ saturationStatus, marginalGainBand } = {}, policy = PRACTICE_COACH_POLICY_V1) {
  return Math.min(
    resolvePracticeCoachSaturationModifier(saturationStatus, policy),
    resolvePracticeCoachMarginalGainModifier(marginalGainBand, policy),
  );
}

export function resolvePracticeCoachReadinessModifier(readinessBand, { stale = false, policy = PRACTICE_COACH_POLICY_V1 } = {}) {
  if (stale) return policy.readinessModifier.stale;
  return policy.readinessModifier[readinessBand] ?? policy.readinessModifier.unknown;
}

export function calculatePracticeCoachNeedUtility({
  priorityScore = null,
  priority = null,
  weaknessScore = null,
  masteryStage = "unmeasured",
  saturationStatus = "insufficient-data",
  marginalGainBand = "unknown",
  readinessBand = "unknown",
  readinessStale = false,
  policy = PRACTICE_COACH_POLICY_V1,
} = {}) {
  const baseNeed = resolvePracticeCoachBaseNeed({ priorityScore, priority, weaknessScore });
  const masteryModifier = resolvePracticeCoachMasteryModifier(masteryStage, policy);
  const saturationModifier = resolvePracticeCoachSaturationModifier(saturationStatus, policy);
  const marginalGainModifier = resolvePracticeCoachMarginalGainModifier(marginalGainBand, policy);
  const headroom = Math.min(saturationModifier, marginalGainModifier);
  const readinessModifier = resolvePracticeCoachReadinessModifier(readinessBand, { stale: readinessStale, policy });
  const needUtility = clamp(baseNeed * masteryModifier * headroom * readinessModifier, 0, 100);
  return Object.freeze({
    utilityVersion: PRACTICE_COACH_UTILITY_VERSION,
    baseNeed,
    masteryModifier,
    saturationModifier,
    marginalGainModifier,
    headroom,
    readinessModifier,
    needUtility,
  });
}

export function calculatePracticeCoachTargetUtility(input = {}) {
  const need = calculatePracticeCoachNeedUtility(input);
  const normalizedMatch = clamp(Number(input.interventionMatch) || 0, 0, 1);
  const coachTargetUtility = clamp(need.needUtility * normalizedMatch, 0, 100);
  return Object.freeze({
    ...need,
    interventionMatch: normalizedMatch,
    coachTargetUtility,
  });
}
