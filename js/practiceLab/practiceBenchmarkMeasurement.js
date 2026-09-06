import { PRACTICE_ABILITY_POLICY_V1 } from "./practiceAbilityPolicy.js";
import { buildPracticeAdjustedPerformanceObservation } from "./practiceAdjustedPerformance.js";
import { PRACTICE_BENCHMARK_COMPARABILITY_CLASSES } from "./practiceEvaluationConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function buildPracticeBenchmarkMeasurement({
  plan,
  integrity,
  session,
  foundationAnalysis,
  suite,
  policy = PRACTICE_ABILITY_POLICY_V1,
} = {}) {
  if (plan?.binding?.kind !== "benchmark") throw new TypeError("Benchmark measurement requires benchmark evaluation binding");
  const form = suite?.forms?.find((entry) => entry.formId === plan.binding.formId);
  if (!form) throw new TypeError("Benchmark measurement form is unavailable");
  if (!PRACTICE_BENCHMARK_COMPARABILITY_CLASSES.includes(suite.comparabilityClass)) throw new TypeError("Benchmark comparability class is invalid");
  const channelPolicy = policy.channels?.["cold-natural-text"];
  const core = buildPracticeAdjustedPerformanceObservation({
    wpm: session.wpm,
    rawWpm: session.rawWpm,
    accuracy: session.accuracy,
    activeDurationMs: session.activeDurationMs,
    typedCharacterCount: session.typedCharacterCount,
    foundationAnalysis,
    channelPolicy,
    policy,
  });
  return freezeDeep({
    suiteId: suite.suiteId,
    suiteVersion: suite.suiteVersion,
    formId: form.formId,
    formVersion: form.formVersion,
    comparabilityClass: suite.comparabilityClass,
    contextId: session.contextId,
    protocolId: plan.measurementProtocol.protocolId,
    protocolVersion: plan.measurementProtocol.protocolVersion,
    exposureOrdinal: plan.binding.exposureOrdinal,
    freshnessStatus: plan.binding.freshnessStatus,
    integrityStatus: integrity.status,
    rawWpm: core.rawWpm,
    wpm: core.wpm,
    accuracy: core.accuracy,
    adjustedWpm: core.adjustedWpm,
    adjustedLogPerformance: core.adjustedLogPerformance,
    measurementSigmaLog: core.measurementSigmaLog,
    difficultyIndex: core.difficultyIndex,
    difficultyCoverage: core.difficultyCoverage,
    abilityEligible: integrity.abilityEligible,
    measuredAtUtc: session.completedAtUtc,
  });
}
