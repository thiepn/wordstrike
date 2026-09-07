import { PRACTICE_COMBINATION_REPAIR_RESULT_VERSION } from "./practiceCombinationRepairConstants.js";
import { PRACTICE_LEARNING_POLICY_V1 } from "./practiceLearningPolicy.js";
import { buildPracticePhaseQuality } from "./practiceLearningQuality.js";
import { normalizePracticeCombinationRepairTarget } from "./practiceCombinationRepairValidation.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function immediateDirection(delta) {
  if (!Number.isFinite(delta)) return "not-comparable";
  if (Math.abs(delta) < 0.5) return "similar-at-check";
  return delta > 0 ? "higher-at-check" : "lower-at-check";
}

export function buildPracticeCombinationRepairResult({
  language = "en",
  entityType,
  entityKey,
  entryOpportunities = [],
  exitOpportunities = [],
  limiterContext = null,
  masteryContext = null,
  policy = PRACTICE_LEARNING_POLICY_V1,
} = {}) {
  const target = normalizePracticeCombinationRepairTarget({ entityType, entityKey, language });
  if (!target) throw new TypeError("Combination Repair result requires a canonical target");
  const entry = buildPracticePhaseQuality(target.entityType, entryOpportunities, policy);
  const exit = buildPracticePhaseQuality(target.entityType, exitOpportunities, policy);
  const immediateQualityChange = Number.isFinite(entry.quality) && Number.isFinite(exit.quality)
    ? exit.quality - entry.quality
    : null;
  return freezeDeep({
    resultVersion: PRACTICE_COMBINATION_REPAIR_RESULT_VERSION,
    target,
    entryQuality: entry.quality,
    exitQuality: exit.quality,
    entryQualityCoverage: entry.availableQualityWeight,
    exitQualityCoverage: exit.availableQualityWeight,
    immediateQualityChange,
    immediateDirection: immediateDirection(immediateQualityChange),
    entryComponents: entry.components,
    exitComponents: exit.components,
    limiterContext: limiterContext == null ? null : limiterContext,
    masteryContext: masteryContext == null ? null : masteryContext,
    interpretation: Object.freeze({
      scope: "same-session-check",
      wording: "The check reflects immediate within-session performance only.",
      doesNotEstablish: Object.freeze(["mastery", "retention", "transfer", "causal-improvement"]),
    }),
  });
}
