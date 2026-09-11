import {
  PRACTICE_TREATMENT_BASELINE_POLICY_VERSION,
  PRACTICE_TREATMENT_POLICY,
} from "./practiceTreatmentConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const finite = Number.isFinite;
const finiteOrNull = (value) => finite(value) ? value : null;

export function createPendingPracticeTreatmentBaseline({ kind, observedAt = null, probeIdentity = null } = {}) {
  return freezeDeep({
    policyVersion: PRACTICE_TREATMENT_BASELINE_POLICY_VERSION,
    kind,
    status: "pending",
    observedAt,
    probeIdentity,
    metrics: null,
    abilityState: null,
    consistencyState: null,
    frontierState: null,
  });
}

export function buildPracticeTargetBaseline({ metrics, observedAt, probeIdentity = null } = {}) {
  const opportunityCount = Number.isInteger(metrics?.opportunityCount) ? metrics.opportunityCount : 0;
  const qualityCoverage = finiteOrNull(metrics?.qualityCoverage);
  const quality = finiteOrNull(metrics?.quality);
  const eligible = quality != null && qualityCoverage != null && qualityCoverage >= PRACTICE_TREATMENT_POLICY.baselineQualityCoverageMinimum && opportunityCount > 0;
  return freezeDeep({
    policyVersion: PRACTICE_TREATMENT_BASELINE_POLICY_VERSION,
    kind: "target",
    status: eligible ? "available" : "ineligible",
    observedAt: observedAt ?? null,
    probeIdentity,
    metrics: {
      quality,
      qualityCoverage,
      opportunityCount,
      firstPassAccuracy: finiteOrNull(metrics?.firstPassAccuracy),
      normalizedResidualMedianMs: finiteOrNull(metrics?.normalizedResidualMedianMs),
      disfluencyRate: finiteOrNull(metrics?.disfluencyRate),
      launchResidualMedianMs: finiteOrNull(metrics?.launchResidualMedianMs),
      launchDisfluencyRate: finiteOrNull(metrics?.launchDisfluencyRate),
      internalResidualMedianMs: finiteOrNull(metrics?.internalResidualMedianMs),
      internalDisfluencyRate: finiteOrNull(metrics?.internalDisfluencyRate),
    },
    abilityState: null,
    consistencyState: null,
    frontierState: null,
  });
}

export function buildPracticeAbilityBaseline({ state, observedAt } = {}) {
  const estimate = state?.estimate ?? state?.currentEstimate ?? null;
  const muLog = finiteOrNull(estimate?.meanLogWpm ?? estimate?.muLog ?? state?.muLog);
  const variance = finiteOrNull(estimate?.varianceLog ?? estimate?.variance ?? state?.variance);
  if (muLog == null || variance == null || variance < 0) {
    return freezeDeep({ ...createPendingPracticeTreatmentBaseline({ kind: "ability", observedAt }), status: "missing" });
  }
  return freezeDeep({
    policyVersion: PRACTICE_TREATMENT_BASELINE_POLICY_VERSION,
    kind: "ability",
    status: "available",
    observedAt: observedAt ?? state?.updatedAt ?? null,
    probeIdentity: null,
    metrics: null,
    abilityState: {
      muLog,
      variance,
      confidence: estimate?.confidenceLevel ?? state?.confidenceLevel ?? "none",
      observationCount: Number.isInteger(state?.evidence?.observationCount) ? state.evidence.observationCount : Number.isInteger(state?.observationCount) ? state.observationCount : 0,
      updatedAt: state?.updatedAt ?? null,
      abilityModelVersion: state?.estimatorVersion ?? null,
      channel: state?.channel ?? null,
    },
    consistencyState: null,
    frontierState: null,
  });
}

export function buildPracticeConsistencyBaseline({ result, observedAt } = {}) {
  if (!result || !finite(result.paceVariationPercent)) return freezeDeep({ ...createPendingPracticeTreatmentBaseline({ kind: "consistency", observedAt }), status: "missing" });
  return freezeDeep({
    policyVersion: PRACTICE_TREATMENT_BASELINE_POLICY_VERSION,
    kind: "consistency",
    status: "available",
    observedAt: observedAt ?? result.completedAt ?? null,
    probeIdentity: null,
    metrics: null,
    abilityState: null,
    consistencyState: {
      analysisVersion: result.analysisVersion ?? null,
      durationMs: finiteOrNull(result.durationMs),
      paceVariationPercent: result.paceVariationPercent,
      paceDriftPercent: finiteOrNull(result.paceDriftPercent),
      medianAdjustedGrossWpm: finiteOrNull(result.medianAdjustedGrossWpm),
      firstPassAccuracyMedian: finiteOrNull(result.firstPassAccuracyMedian),
      disfluencyMedian: finiteOrNull(result.disfluencyMedian),
      correctionCostMedian: finiteOrNull(result.correctionCostMedian),
    },
    frontierState: null,
  });
}

export function buildPracticeFrontierBaseline({ frontier, observedAt } = {}) {
  if (!frontier) return freezeDeep({ ...createPendingPracticeTreatmentBaseline({ kind: "control-frontier", observedAt }), status: "missing" });
  const scalarEligible = frontier.status === "bracketed" && ["medium", "high"].includes(frontier.confidence) && finite(frontier.frontierWpm);
  return freezeDeep({
    policyVersion: PRACTICE_TREATMENT_BASELINE_POLICY_VERSION,
    kind: "control-frontier",
    status: scalarEligible || frontier.status === "lower-bound" ? "available" : "ineligible",
    observedAt: observedAt ?? frontier.updatedAt ?? null,
    probeIdentity: null,
    metrics: null,
    abilityState: null,
    consistencyState: null,
    frontierState: {
      modelVersion: frontier.modelVersion ?? null,
      policyVersion: frontier.policyVersion ?? null,
      status: frontier.status ?? null,
      confidence: frontier.confidence ?? null,
      frontierWpm: finiteOrNull(frontier.frontierWpm),
      lowerBoundWpm: finiteOrNull(frontier.lowerBoundWpm),
      scalarEligible,
    },
  });
}
