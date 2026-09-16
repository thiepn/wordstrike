import { createPracticeBurstSprintsAccumulator } from "./practiceBurstSprintsAccumulator.js";
import { analyzePracticeBurstSprintsResult } from "./practiceBurstSprintsAnalyzer.js";
import { buildPracticeBurstAbilityMeasurement } from "./practiceBurstSprintsMeasurement.js";
import { createPracticeBurstSprintsRuntime } from "./practiceBurstSprintsRuntime.js";
import { calculatePracticeMeasurementUncertainty, getPracticeDifficultyAdjustment } from "./practiceAdjustedPerformance.js";
import { getPracticeAbilityChannelPolicy } from "./practiceAbilityPolicy.js";
import {
  PRACTICE_BURST_ESTIMATOR_VERSION,
  PRACTICE_BURST_SPRINTS_EXPERIMENT_ID,
  PRACTICE_BURST_SPRINTS_EXPERIMENT_VERSION,
  PRACTICE_BURST_SPRINTS_POLICY_VERSION,
  PRACTICE_BURST_SPRINTS_PROTOCOL_VERSION,
  PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS,
} from "./practiceBurstSprintsConstants.js";

function measurementOptions(result, foundationAnalysis) {
  const difficulty = getPracticeDifficultyAdjustment(foundationAnalysis);
  const channelPolicy = getPracticeAbilityChannelPolicy("burst");
  const individualSigmas = {};
  for (const sprint of result?.sprints ?? []) {
    if (!sprint?.eligible) continue;
    const uncertainty = calculatePracticeMeasurementUncertainty({ activeDurationMs: 10_000, accuracy: sprint.firstPassAccuracy, channelPolicy, difficulty, latencySummary: foundationAnalysis?.latency?.sessionSummary ?? null });
    individualSigmas[sprint.sprintId] = uncertainty.measurementSigmaLog;
  }
  return { difficultyAdjustmentLog: difficulty.adjustment, difficultyIndex: difficulty.difficultyIndex, difficultyModelStatus: difficulty.status, difficultyCoverage: difficulty.coverage, individualSigmas };
}

export function createPracticeBurstSprintsExperiment(prepared = null) {
  const accumulator = prepared ? createPracticeBurstSprintsAccumulator({ plan: prepared.plan }) : null;
  const descriptor = {
    id: PRACTICE_BURST_SPRINTS_EXPERIMENT_ID,
    version: PRACTICE_BURST_SPRINTS_EXPERIMENT_VERSION,
    sessionSchemaVersion: 1,
    title: "Burst Sprints",
    category: "speed",
    defaultCorrectionBehavior: "allow",
    supportedCompletionModes: ["duration"],
    resumable: false,
    abilityChannel: "burst",
    performanceMeasurementKind: null,
    performanceReferenceChannel: null,
    retentionMeasurementKind: null,
    validateConfiguration(config) { return config?.timingMode === "on-start" && config?.correctionBehavior === "allow" && config?.protocolVersion === PRACTICE_BURST_SPRINTS_PROTOCOL_VERSION && config?.policyVersion === PRACTICE_BURST_SPRINTS_POLICY_VERSION && config?.estimatorVersion === PRACTICE_BURST_ESTIMATOR_VERSION; },
    validateContentPlan(content) { return content?.completion?.mode === "duration" && content.completion.value === PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS && (content.targetEntities?.length ?? 0) === 0 && content.metadata?.sourceType === "burst-sprints-diagnostic" && content.metadata?.partition === "diagnostic" && content.metadata?.evaluationProtected === false && content.metadata?.coldTransfer === false; },
    onProcessedInput(event) { return accumulator?.recordProcessedInput(event) ?? false; },
    onClosedErrorEpisode(value) { return accumulator?.recordClosedErrorEpisode(value) ?? false; },
    buildAbilityMeasurement({ session, foundationAnalysis } = {}) { if (!accumulator || !prepared) return null; const result = accumulator.getFinalResult() ?? accumulator.finalize({ finalActiveDurationMs: session?.activeDurationMs ?? 0 }); return buildPracticeBurstAbilityMeasurement(result, measurementOptions(result, foundationAnalysis)); },
    analyzeResult({ sessionSnapshot, foundationAnalysis } = {}) { if (!accumulator || !prepared) return { trainingQuality: null, recommendationIds: [] }; const result = accumulator.getFinalResult() ?? accumulator.finalize({ finalActiveDurationMs: sessionSnapshot?.timing?.activeDurationMs ?? 0 }); return analyzePracticeBurstSprintsResult({ burstResult: result, plan: prepared.plan, foundationAnalysis, measurementOptions: measurementOptions(result, foundationAnalysis) }); },
  };
  Object.defineProperty(descriptor, "burstAccumulator", { value: accumulator, enumerable: false });
  return Object.freeze(descriptor);
}

export function registerPracticeBurstSprintsExperiment(registry, { runtime = null } = {}) {
  if (!registry) throw new TypeError("Burst Sprints registration requires registry");
  if (registry.getRegistration?.(PRACTICE_BURST_SPRINTS_EXPERIMENT_ID)) return registry.getRegistration(PRACTICE_BURST_SPRINTS_EXPERIMENT_ID);
  const burstRuntime = runtime ?? createPracticeBurstSprintsRuntime();
  return registry.register({ experimentId: PRACTICE_BURST_SPRINTS_EXPERIMENT_ID, implementationVersion: PRACTICE_BURST_SPRINTS_EXPERIMENT_VERSION, descriptorFactory: () => createPracticeBurstSprintsExperiment(), setupFactory: () => burstRuntime.prepare(), sessionFactory(prepared) { if (prepared?.status !== "ready") throw Object.assign(new Error("Burst Sprints is unavailable"), { code: "BURST_SPRINTS_UNAVAILABLE" }); return Object.freeze({ ...prepared, experiment: createPracticeBurstSprintsExperiment(prepared), configuration: Object.freeze({ timingMode: "on-start", correctionBehavior: "allow", protocolVersion: PRACTICE_BURST_SPRINTS_PROTOCOL_VERSION, policyVersion: PRACTICE_BURST_SPRINTS_POLICY_VERSION, estimatorVersion: PRACTICE_BURST_ESTIMATOR_VERSION }), contentPlan: prepared.contentPlan }); }, runtime: burstRuntime });
}
