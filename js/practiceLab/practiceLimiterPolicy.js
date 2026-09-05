export const PRACTICE_LIMITER_SNAPSHOT_VERSION = 1;
export const PRACTICE_LIMITER_MODEL_VERSION = 1;
export const PRACTICE_LIMITER_POLICY_VERSION = 1;
export const PRACTICE_IMPACT_MODEL_VERSION = 1;
export const PRACTICE_HIERARCHY_MODEL_VERSION = 1;
export const PRACTICE_PREVALENCE_MODEL_VERSION = 1;

export const PRACTICE_LIMITER_DIMENSIONS = Object.freeze([
  "slow",
  "hesitant",
  "inaccurate",
  "recovery-heavy",
  "launch-limited",
  "unstable",
]);

export const PRACTICE_LIMITER_DIMENSION_STATUSES = Object.freeze([
  "insufficient-evidence",
  "not-elevated",
  "possible",
  "likely",
  "confirmed",
]);

export const PRACTICE_LIMITER_PHENOTYPES = Object.freeze([
  "none",
  ...PRACTICE_LIMITER_DIMENSIONS,
  "mixed",
  "insufficient-data",
]);

export const PRACTICE_LIMITER_CANDIDATE_STATUSES = Object.freeze([
  "insufficient-data",
  "not-elevated",
  "possible",
  "likely",
  "confirmed",
]);

export const PRACTICE_LIMITER_SNAPSHOT_STATUSES = Object.freeze([
  "ready",
  "partial",
  "insufficient-data",
  "unsupported-context",
]);

export const PRACTICE_HIERARCHY_STATUSES = Object.freeze([
  "independent",
  "partially-explained",
  "explained",
]);

export const PRACTICE_PREVALENCE_STATUSES = Object.freeze([
  "reference",
  "practice-proxy",
  "unavailable",
]);

export const PRACTICE_IMPACT_STATUSES = Object.freeze([
  "full",
  "partial",
  "prevalence-proxy",
  "unavailable",
]);

export const PRACTICE_LIMITER_REASON_CODES = Object.freeze([
  "positive-residual",
  "elevated-disfluency",
  "elevated-error-rate",
  "slow-recovery",
  "word-launch",
  "high-variability",
  "low-evidence",
  "prevalence-unavailable",
  "hierarchy-explained",
]);

export const PRACTICE_LIMITER_POLICY_V1 = Object.freeze({
  version: PRACTICE_LIMITER_POLICY_VERSION,
  modelVersion: PRACTICE_LIMITER_MODEL_VERSION,
  impactModelVersion: PRACTICE_IMPACT_MODEL_VERSION,
  hierarchyModelVersion: PRACTICE_HIERARCHY_MODEL_VERSION,
  prevalenceModelVersion: PRACTICE_PREVALENCE_MODEL_VERSION,
  minimumPeerEntities: 8,
  minimumPeerOpportunities: 200,
  minimumPeerRecoveryEpisodes: 12,
  minimumPeerVariabilityEntities: 8,
  minimumPeerGeneralConfidence: 25,
  minimumRecentResidualSamples: 8,
  minimumObservationSessions: 2,
  status: Object.freeze({
    minimumConfidence: 25,
    possibleSeverity: 20,
    likelySeverity: 35,
    likelyConfidence: 50,
    confirmedSeverity: 50,
    confirmedConfidence: 80,
  }),
  slow: Object.freeze({
    shrinkageK: 12,
    deadband: 0.03,
    fullSeverity: 0.30,
    fallbackMinimumEntities: 8,
    fallbackScaleFloorMs: 10,
    fallbackDeadbandZ: 0.5,
    fallbackFullSeverityZ: 3.0,
  }),
  hesitant: Object.freeze({ shrinkageK: 20, deadband: 0.02, fullSeverity: 0.15, residualShrinkageK: 12 }),
  inaccurate: Object.freeze({ shrinkageK: 30, deadband: 0.01, fullSeverity: 0.08 }),
  recovery: Object.freeze({
    deadbandRatio: 0.25,
    fullSeverityRatio: 1.50,
    overDeletionThreshold: 1,
    maximumOverDeletionBoost: 15,
  }),
  launch: Object.freeze({
    shrinkageK: 12,
    candidateSeverity: 35,
    internalHealthySeverity: 20,
    minimumSeverityLead: 20,
    disfluencyModifierFullRate: 0.20,
    maximumDisfluencyBoost: 15,
  }),
  unstable: Object.freeze({ ratioDeadband: 1.5, ratioFullSeverity: 3.0, scaleFloorMs: 5 }),
  mixed: Object.freeze({ minimumWeightedSeverity: 35, secondToFirstRatio: 0.80, maximumTypes: 2 }),
  prevalenceQualityWeights: Object.freeze({ reference: 1, "practice-proxy": 0.60, unavailable: 0 }),
  impactCoverageWeights: Object.freeze({ slow: 0.35, hesitant: 0.25, recovery: 0.25, launch: 0.15 }),
  hierarchy: Object.freeze({
    confidenceTolerance: 10,
    partialThreshold: 0.35,
    explainedThreshold: 0.65,
    maxExplainers: 3,
    penalties: Object.freeze({ independent: 1, "partially-explained": 0.75, explained: 0.40 }),
  }),
  maxCandidates: 256,
  perTypeCandidateCaps: Object.freeze({ key: 64, bigram: 96, trigram: 64, word: 64 }),
});

export function validatePracticeLimiterPolicy(policy = PRACTICE_LIMITER_POLICY_V1) {
  if (!policy || policy.version !== PRACTICE_LIMITER_POLICY_VERSION) throw new TypeError("Unsupported Practice limiter policy version");
  for (const key of ["minimumPeerEntities", "minimumPeerOpportunities", "minimumPeerRecoveryEpisodes", "minimumPeerVariabilityEntities", "minimumRecentResidualSamples", "minimumObservationSessions", "maxCandidates"]) {
    if (!Number.isInteger(policy[key]) || policy[key] < 1) throw new TypeError(`Practice limiter policy ${key} must be a positive integer`);
  }
  if (!Number.isFinite(policy.minimumPeerGeneralConfidence) || policy.minimumPeerGeneralConfidence < 0 || policy.minimumPeerGeneralConfidence > 100) throw new TypeError("Practice limiter peer confidence threshold is invalid");
  for (const pair of [
    [policy.slow.deadband, policy.slow.fullSeverity],
    [policy.hesitant.deadband, policy.hesitant.fullSeverity],
    [policy.inaccurate.deadband, policy.inaccurate.fullSeverity],
    [policy.recovery.deadbandRatio, policy.recovery.fullSeverityRatio],
    [policy.unstable.ratioDeadband, policy.unstable.ratioFullSeverity],
  ]) if (!Number.isFinite(pair[0]) || !Number.isFinite(pair[1]) || pair[0] < 0 || pair[1] <= pair[0]) throw new TypeError("Practice limiter severity scale is invalid");
  if (Math.abs(Object.values(policy.prevalenceQualityWeights).reduce((sum, value) => sum + Number(value), 0) - 1.6) > 1e-12) throw new TypeError("Practice prevalence quality weights are invalid");
  const wordCoverageWeight = policy.impactCoverageWeights.slow + policy.impactCoverageWeights.hesitant + policy.impactCoverageWeights.recovery + policy.impactCoverageWeights.launch;
  if (Math.abs(wordCoverageWeight - 1) > 1e-12) throw new TypeError("Practice impact coverage weights must sum to one for words");
  if (!Number.isFinite(policy.hierarchy.partialThreshold) || !Number.isFinite(policy.hierarchy.explainedThreshold) || policy.hierarchy.partialThreshold <= 0 || policy.hierarchy.explainedThreshold <= policy.hierarchy.partialThreshold || policy.hierarchy.explainedThreshold > 1) throw new TypeError("Practice hierarchy thresholds are invalid");
  return policy;
}

export function scalePracticeLimiterSeverity(value, deadband, fullSeverity) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= deadband) return 0;
  if (numeric >= fullSeverity) return 100;
  return Math.max(0, Math.min(100, 100 * (numeric - deadband) / (fullSeverity - deadband)));
}
