import { practiceMad, practiceMedian } from "./practiceRobustStats.js";
import { calculatePracticePhysicalTelemetryConfidence } from "./practicePhysicalTelemetryConfidence.js";

const rate = (numerator, denominator) => Number(denominator) > 0 ? Number(numerator || 0) / Number(denominator) : null;
const byEntityKey = (a, b) => a.entityKey.localeCompare(b.entityKey);

function summarize(record) {
  const observation = record.observation ?? {};
  const residual = record.recent?.residualMs ?? [];
  const fluentLatency = record.recent?.fluentLatencyMs ?? [];
  const timingEligible = Number(observation.timingEligibleCount) || 0;
  const item = {
    entityType: record.entityType,
    entityKey: record.entityKey,
    observation,
    confidence: calculatePracticePhysicalTelemetryConfidence(record),
    medianResidualMs: residual.length ? practiceMedian(residual) : null,
    madResidualMs: residual.length ? practiceMad(residual) : null,
    medianFluentLatencyMs: fluentLatency.length ? practiceMedian(fluentLatency) : null,
    disfluencyRate: timingEligible > 0 && Number(observation.fluentCount || 0) + Number(observation.disfluentCount || 0) > 0
      ? rate(observation.disfluentCount, Number(observation.fluentCount || 0) + Number(observation.disfluentCount || 0))
      : null,
    observedMisstrikeOriginRate: record.entityType === "physical-key" ? rate(observation.firstPassErrorOriginCount, observation.firstPassActivationCount) : null,
    updatedAt: record.updatedAt,
  };
  return Object.freeze(item);
}

export function buildPracticePhysicalTelemetrySnapshot({ stats = [], sessions = [] } = {}) {
  const validStats = (Array.isArray(stats) ? stats : []).filter((record) => record?.entityType && record?.entityKey);
  const applied = (Array.isArray(sessions) ? sessions : []).filter((record) => record?.status === "applied");
  const keys = validStats.filter((record) => record.entityType === "physical-key").map(summarize).sort(byEntityKey);
  const transitions = validStats.filter((record) => record.entityType === "physical-transition").map(summarize).sort(byEntityKey);
  const modifierRoutes = validStats.filter((record) => record.entityType === "modifier-route").map(summarize).sort(byEntityKey);
  const latest = [...validStats.map((record) => record.updatedAt), ...applied.map((record) => record.appliedAt)].filter(Boolean).sort().at(-1) ?? null;
  return Object.freeze({
    coverage: Object.freeze({
      eligibleSessions: applied.length,
      physicalKeyActivations: keys.reduce((sum, item) => sum + Number(item.observation.activationCount || 0), 0),
      physicalCodesObserved: keys.length,
      transitionsObserved: transitions.length,
      latestTelemetryDate: latest,
    }),
    keys: Object.freeze(keys),
    transitions: Object.freeze(transitions),
    modifierRoutes: Object.freeze(modifierRoutes),
    updatedAt: latest,
  });
}
