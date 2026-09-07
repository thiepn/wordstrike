import {
  PRACTICE_WEAK_KEYS_MAX_NEUTRAL_CANDIDATES,
  PRACTICE_WEAK_KEYS_MAX_RECOMMENDATIONS,
  PRACTICE_WEAK_KEYS_MAX_TARGET_CANDIDATES,
  PRACTICE_WEAK_KEYS_MIN_QUALITY_COVERAGE,
  PRACTICE_WEAK_KEYS_PHASE_QUOTAS,
  PRACTICE_WEAK_KEYS_POLICY_VERSION,
  PRACTICE_WEAK_KEYS_PROBE_FEATURE_RMS_MAX,
  PRACTICE_WEAK_KEYS_PROBE_GEOMETRY_TV_MAX,
  PRACTICE_WEAK_KEYS_PROBE_POSITION_TV_MAX,
  PRACTICE_WEAK_KEYS_PROBE_TYPOABILITY_DELTA_MAX,
} from "./practiceWeakKeysConstants.js";

export const PRACTICE_WEAK_KEYS_POLICY_V1 = Object.freeze({
  version: PRACTICE_WEAK_KEYS_POLICY_VERSION,
  language: Object.freeze({
    supported: Object.freeze(["en"]),
    englishLowercasePattern: "^[a-z]$",
  }),
  quotas: PRACTICE_WEAK_KEYS_PHASE_QUOTAS,
  recommendation: Object.freeze({
    maxResults: PRACTICE_WEAK_KEYS_MAX_RECOMMENDATIONS,
    preferredLimiterStatuses: Object.freeze(["confirmed", "likely"]),
    secondaryLimiterStatuses: Object.freeze(["possible"]),
    preferredMasteryStages: Object.freeze(["learning", "acquired"]),
    normallyExcludedMasteryStages: Object.freeze(["robust", "retained"]),
    saturationFactors: Object.freeze({
      likely: 0.55,
      supported: 0.35,
      resolved: 0.20,
    }),
  }),
  content: Object.freeze({
    maxTargetCandidates: PRACTICE_WEAK_KEYS_MAX_TARGET_CANDIDATES,
    maxNeutralCandidates: PRACTICE_WEAK_KEYS_MAX_NEUTRAL_CANDIDATES,
    focusPreferredWordLengthMin: 2,
    focusPreferredWordLengthMax: 6,
    focusPreferredTypabilityPercentileMin: 20,
    focusPreferredTypabilityPercentileMax: 65,
    focusMaxTargetOpportunitiesPerLexicalItem: 2,
    generatedTargetUnitOpportunityCap: 4,
    ordinaryTargetUnitOpportunityCap: 4,
    maxIdenticalWordRepetitionsBeforeCoverage: 2,
    focusPreferredDistinctTargetWords: 8,
    hardMinimumTargetWords: 5,
    hardMinimumTargetBearingFamilies: 4,
    neutralTargetBearingRatio: 1,
    preferredDistinctNeutralWords: 6,
    minimumContextPositionClassesWhenAvailable: 2,
    preferredContextPositionClasses: 3,
    preferredDistinctPrecedingGraphemes: 6,
    preferredDistinctFollowingGraphemes: 6,
    preferredDistinctGeometryClasses: 3,
  }),
  probes: Object.freeze({
    targetOpportunityCount: 8,
    typabilityDeltaMax: PRACTICE_WEAK_KEYS_PROBE_TYPOABILITY_DELTA_MAX,
    featureRmsMax: PRACTICE_WEAK_KEYS_PROBE_FEATURE_RMS_MAX,
    positionProfileTvMax: PRACTICE_WEAK_KEYS_PROBE_POSITION_TV_MAX,
    geometryProfileTvMax: PRACTICE_WEAK_KEYS_PROBE_GEOMETRY_TV_MAX,
    preferredNaturalFamilyCount: 2,
    preferredGeneratedDistinctLexicalItems: 6,
  }),
  quality: Object.freeze({
    minimumAvailableWeight: PRACTICE_WEAK_KEYS_MIN_QUALITY_COVERAGE,
  }),
  session: Object.freeze({
    resumable: false,
    completionMode: "content",
    correctionBehavior: "allow",
    estimatedDurationMinutes: Object.freeze({ minimum: 4, recommended: 5, maximum: 6 }),
  }),
});

export function validatePracticeWeakKeysPolicy(policy = PRACTICE_WEAK_KEYS_POLICY_V1) {
  if (!policy || policy.version !== PRACTICE_WEAK_KEYS_POLICY_VERSION) throw new TypeError("Unsupported Weak Keys policy version");
  if (policy.quotas?.total !== 80) throw new TypeError("Weak Keys v1 requires an 80-opportunity dose");
  const phaseTotal = ["entry-probe", "focus", "context", "interleave", "exit-probe"]
    .reduce((sum, id) => sum + Number(policy.quotas?.[id] || 0), 0);
  if (phaseTotal !== policy.quotas.total) throw new TypeError("Weak Keys phase quotas must sum to the total dose");
  if (policy.quality?.minimumAvailableWeight !== 0.60) throw new TypeError("Weak Keys v1 quality coverage threshold must remain 0.60");
  if (!Number.isInteger(policy.content?.maxTargetCandidates) || policy.content.maxTargetCandidates < 1 || policy.content.maxTargetCandidates > 512) throw new TypeError("Weak Keys target candidate bound is invalid");
  if (!Number.isInteger(policy.content?.maxNeutralCandidates) || policy.content.maxNeutralCandidates < 1 || policy.content.maxNeutralCandidates > 256) throw new TypeError("Weak Keys neutral candidate bound is invalid");
  return policy;
}
