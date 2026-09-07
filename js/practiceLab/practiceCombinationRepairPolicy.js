import {
  PRACTICE_COMBINATION_REPAIR_ACQUIRE_UNIT_TARGET_CAP,
  PRACTICE_COMBINATION_REPAIR_DEFAULT_UNIT_TARGET_CAP,
  PRACTICE_COMBINATION_REPAIR_MAX_NEUTRAL_CANDIDATES,
  PRACTICE_COMBINATION_REPAIR_MAX_RECOMMENDATIONS,
  PRACTICE_COMBINATION_REPAIR_MAX_TARGET_CONTENT_CANDIDATES,
  PRACTICE_COMBINATION_REPAIR_MIN_QUALITY_COVERAGE,
  PRACTICE_COMBINATION_REPAIR_PHASE_QUOTAS,
  PRACTICE_COMBINATION_REPAIR_PHASES,
  PRACTICE_COMBINATION_REPAIR_POLICY_VERSION,
  PRACTICE_COMBINATION_REPAIR_PROBE_FEATURE_RMS_MAX,
  PRACTICE_COMBINATION_REPAIR_PROBE_TYPOABILITY_DELTA_MAX,
} from "./practiceCombinationRepairConstants.js";
import { PRACTICE_LEARNING_POLICY_V1 } from "./practiceLearningPolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export const PRACTICE_COMBINATION_REPAIR_POLICY_V1 = freezeDeep({
  version: PRACTICE_COMBINATION_REPAIR_POLICY_VERSION,
  partition: "training",
  entityTypes: ["bigram", "trigram"],
  phases: PRACTICE_COMBINATION_REPAIR_PHASES.map((phase) => ({ ...phase })),
  quotas: {
    bigram: { ...PRACTICE_COMBINATION_REPAIR_PHASE_QUOTAS.bigram },
    trigram: { ...PRACTICE_COMBINATION_REPAIR_PHASE_QUOTAS.trigram },
  },
  content: {
    maxTargetCandidates: PRACTICE_COMBINATION_REPAIR_MAX_TARGET_CONTENT_CANDIDATES,
    maxNeutralCandidates: PRACTICE_COMBINATION_REPAIR_MAX_NEUTRAL_CANDIDATES,
    maxTargetOpportunitiesPerUnit: PRACTICE_COMBINATION_REPAIR_DEFAULT_UNIT_TARGET_CAP,
    acquireMaxTargetOpportunitiesPerUnit: PRACTICE_COMBINATION_REPAIR_ACQUIRE_UNIT_TARGET_CAP,
  },
  probes: {
    requireFamilyDisjoint: true,
    requireOpportunityMatch: true,
    typabilityDeltaMax: PRACTICE_COMBINATION_REPAIR_PROBE_TYPOABILITY_DELTA_MAX,
    featureRmsMax: PRACTICE_COMBINATION_REPAIR_PROBE_FEATURE_RMS_MAX,
  },
  recommendation: {
    maxResults: PRACTICE_COMBINATION_REPAIR_MAX_RECOMMENDATIONS,
  },
  quality: {
    weights: { ...PRACTICE_LEARNING_POLICY_V1.quality.weights },
    minimumAvailableWeight: PRACTICE_COMBINATION_REPAIR_MIN_QUALITY_COVERAGE,
  },
  completion: {
    mode: "content",
    resumable: false,
    timeBased: false,
  },
});

export function getPracticeCombinationRepairDoseUnits(entityType, policy = PRACTICE_COMBINATION_REPAIR_POLICY_V1) {
  const quota = policy.quotas?.[entityType]?.total;
  const scale = PRACTICE_LEARNING_POLICY_V1.doseScales?.[entityType];
  return Number.isFinite(quota) && Number.isFinite(scale) && scale > 0 ? quota / scale : null;
}

export function validatePracticeCombinationRepairPolicy(policy = PRACTICE_COMBINATION_REPAIR_POLICY_V1) {
  const errors = [];
  if (!policy || typeof policy !== "object") return { valid: false, errors: [{ path: "policy", code: "TYPE" }] };
  if (policy.version !== PRACTICE_COMBINATION_REPAIR_POLICY_VERSION) errors.push({ path: "version", code: "VERSION" });
  if (policy.partition !== "training") errors.push({ path: "partition", code: "TRAINING_ONLY" });
  if (policy.completion?.mode !== "content" || policy.completion?.resumable !== false || policy.completion?.timeBased !== false) errors.push({ path: "completion", code: "FIXED_COMPLETION" });
  const expectedPhaseIds = PRACTICE_COMBINATION_REPAIR_PHASES.map((phase) => phase.id);
  if (JSON.stringify(policy.phases?.map((phase) => phase.id)) !== JSON.stringify(expectedPhaseIds)) errors.push({ path: "phases", code: "PHASE_SEQUENCE" });
  for (const entityType of ["bigram", "trigram"]) {
    const quotas = policy.quotas?.[entityType];
    const phaseTotal = expectedPhaseIds.reduce((sum, phaseId) => sum + (Number(quotas?.[phaseId]) || 0), 0);
    if (phaseTotal !== quotas?.total) errors.push({ path: `quotas.${entityType}`, code: "QUOTA_TOTAL" });
    if (getPracticeCombinationRepairDoseUnits(entityType, policy) !== 1) errors.push({ path: `quotas.${entityType}.total`, code: "ONE_DOSE_REQUIRED" });
  }
  const expectedWeights = PRACTICE_LEARNING_POLICY_V1.quality.weights;
  for (const key of ["accuracy", "speed", "disfluency"]) if (policy.quality?.weights?.[key] !== expectedWeights[key]) errors.push({ path: `quality.weights.${key}`, code: "SHARED_QUALITY_REQUIRED" });
  if (policy.quality?.minimumAvailableWeight !== PRACTICE_COMBINATION_REPAIR_MIN_QUALITY_COVERAGE) errors.push({ path: "quality.minimumAvailableWeight", code: "QUALITY_COVERAGE" });
  return { valid: errors.length === 0, errors };
}
