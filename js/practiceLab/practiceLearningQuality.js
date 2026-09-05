import { PRACTICE_MASTERY_POLICY_V1 } from "./practiceMasteryPolicy.js";
import {
  computePracticeDisfluencyRateQuality,
  computePracticeRelativeResidualQuality,
  computePracticeRoleAccuracyQuality,
} from "./practiceRoleQuality.js";
import { PRACTICE_LEARNING_POLICY_V1 } from "./practiceLearningPolicy.js";

const finite = Number.isFinite;
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function buildPracticeSessionEntityQuality({
  entityType,
  opportunityCount = 0,
  errorCount = 0,
  timingEligibleCount = 0,
  disfluentCount = 0,
  fluentLatencyMeanMs = null,
  fluentResidualMeanMs = null,
  fluentResidualCount = 0,
  policy = PRACTICE_LEARNING_POLICY_V1,
  masteryPolicy = PRACTICE_MASTERY_POLICY_V1,
} = {}) {
  const opportunities = Math.max(0, Number(opportunityCount) || 0);
  const errors = Math.max(0, Number(errorCount) || 0);
  const timingEligible = Math.max(0, Number(timingEligibleCount) || 0);
  const disfluent = Math.max(0, Number(disfluentCount) || 0);
  const accuracy = opportunities > 0
    ? computePracticeRoleAccuracyQuality(entityType, opportunities, errors, masteryPolicy)
    : null;
  const expectedApproxMs = finite(fluentLatencyMeanMs) && finite(fluentResidualMeanMs)
    ? fluentLatencyMeanMs - fluentResidualMeanMs
    : null;
  const relativeResidual = expectedApproxMs > 0 && Number(fluentResidualCount) > 0
    ? fluentResidualMeanMs / expectedApproxMs
    : null;
  const speed = computePracticeRelativeResidualQuality(relativeResidual, masteryPolicy);
  const disfluencyRate = timingEligible > 0 ? disfluent / timingEligible : null;
  const disfluency = computePracticeDisfluencyRateQuality(disfluencyRate, masteryPolicy);
  const components = { accuracy, speed, disfluency };
  const weights = policy.quality.weights;
  const availableQualityWeight = Object.entries(weights)
    .filter(([key]) => finite(components[key]))
    .reduce((sum, [, weight]) => sum + weight, 0);
  const quality = availableQualityWeight + 1e-12 < policy.quality.minimumAvailableWeight
    ? null
    : Object.entries(weights)
        .filter(([key]) => finite(components[key]))
        .reduce((sum, [key, weight]) => sum + weight * components[key], 0) / availableQualityWeight;
  return freezeDeep({
    quality: finite(quality) ? Math.max(0, Math.min(100, quality)) : null,
    availableQualityWeight,
    components,
    metrics: {
      firstPassErrorRate: opportunities > 0 ? errors / opportunities : null,
      relativeResidual,
      disfluencyRate,
      expectedApproxMs: expectedApproxMs > 0 ? expectedApproxMs : null,
    },
    evidence: {
      opportunityCount: opportunities,
      errorCount: errors,
      timingEligibleCount: timingEligible,
      disfluentCount: disfluent,
      fluentResidualCount: Math.max(0, Number(fluentResidualCount) || 0),
    },
  });
}

function mean(values) {
  const finiteValues = (Array.isArray(values) ? values : []).filter(finite);
  return finiteValues.length ? finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length : null;
}

export function buildPracticePhaseQuality(entityType, opportunities, policy = PRACTICE_LEARNING_POLICY_V1) {
  const records = Array.isArray(opportunities) ? opportunities : [];
  const timingRecords = records.flatMap((record) => Array.isArray(record.timing) ? record.timing : []);
  const fluent = timingRecords.filter((record) => record.latencyClass === "fluent" && finite(record.observedLatencyMs));
  const residual = fluent.filter((record) => finite(record.residualLatencyMs));
  const disfluent = timingRecords.filter((record) => record.latencyClass === "disfluent");
  return buildPracticeSessionEntityQuality({
    entityType,
    opportunityCount: records.length,
    errorCount: records.filter((record) => record.correct !== true).length,
    timingEligibleCount: fluent.length + disfluent.length,
    disfluentCount: disfluent.length,
    fluentLatencyMeanMs: mean(fluent.map((record) => record.observedLatencyMs)),
    fluentResidualMeanMs: mean(residual.map((record) => record.residualLatencyMs)),
    fluentResidualCount: residual.length,
    policy,
  });
}

export function buildPracticeDeltaQuality(delta, policy = PRACTICE_LEARNING_POLICY_V1) {
  const timing = delta?.timing;
  return buildPracticeSessionEntityQuality({
    entityType: delta?.entityType,
    opportunityCount: delta?.opportunities?.count,
    errorCount: delta?.opportunities?.errorCount,
    timingEligibleCount: timing?.eligibleCount,
    disfluentCount: timing?.disfluentCount,
    fluentLatencyMeanMs: timing?.fluentLatency?.count > 0 ? timing.fluentLatency.meanMs : null,
    fluentResidualMeanMs: timing?.fluentResidual?.count > 0 ? timing.fluentResidual.meanMs : null,
    fluentResidualCount: timing?.fluentResidual?.count ?? 0,
    policy,
  });
}
