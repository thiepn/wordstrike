import { PRACTICE_LEARNING_POLICY_V1 } from "./practiceLearningPolicy.js";
import { buildPracticeSessionExecutionQuality } from "./practiceExecutionQuality.js";

const finite = Number.isFinite;

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
} = {}) {
  return buildPracticeSessionExecutionQuality({
    entityType,
    opportunityCount,
    errorCount,
    timingEligibleCount,
    disfluentCount,
    fluentLatencyMeanMs,
    fluentResidualMeanMs,
    fluentResidualCount,
    weights: policy.quality.weights,
    minimumAvailableWeight: policy.quality.minimumAvailableWeight,
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
