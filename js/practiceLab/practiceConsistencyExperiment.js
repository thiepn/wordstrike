import { createPracticeConsistencyGuide } from "./practiceConsistencyGuide.js";
import { analyzePracticeConsistency } from "./practiceConsistencyAnalysis.js";
import { createPracticeConsistencyRuntime } from "./practiceConsistencyRuntime.js";
import { createPracticeSustainedWindowAccumulator } from "./practiceSustainedWindowAccumulator.js";
import {
  PRACTICE_CONSISTENCY_DURATIONS_MS,
  PRACTICE_CONSISTENCY_EXPERIMENT_ID,
  PRACTICE_CONSISTENCY_POLICY_VERSION,
  PRACTICE_CONSISTENCY_VERSION,
} from "./practiceConsistencyConstants.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };

export function createPracticeConsistencyExperiment(prepared = null) {
  const accumulator = prepared ? createPracticeSustainedWindowAccumulator({ analysisStartMs: prepared.plan.analysisStartMs, windowMs: prepared.plan.windowMs, maximumWindows: Math.ceil((prepared.plan.durationMs - prepared.plan.analysisStartMs) / prepared.plan.windowMs) }) : null;
  const guide = prepared ? createPracticeConsistencyGuide() : null;
  const descriptor = {
    id: PRACTICE_CONSISTENCY_EXPERIMENT_ID,
    version: PRACTICE_CONSISTENCY_VERSION,
    sessionSchemaVersion: 1,
    title: "Consistency Trainer",
    category: "fluency",
    defaultCorrectionBehavior: "allow",
    supportedCompletionModes: ["duration"],
    resumable: false,
    retentionMeasurementKind: null,
    abilityChannel: null,
    performanceMeasurementKind: null,
    performanceReferenceChannel: null,
    evaluationMeasurementKind: null,
    validateConfiguration(config) {
      return config?.timingMode === "on-start"
        && config?.correctionBehavior === "allow"
        && config?.policyVersion === PRACTICE_CONSISTENCY_POLICY_VERSION
        && PRACTICE_CONSISTENCY_DURATIONS_MS.includes(config?.durationMs);
    },
    validateContentPlan(content) {
      return content?.completion?.mode === "duration"
        && PRACTICE_CONSISTENCY_DURATIONS_MS.includes(content.completion.value)
        && (content.targetEntities?.length ?? 0) === 0
        && content.metadata?.sourceType === "consistency-training"
        && content.metadata?.partition === "training"
        && content.metadata?.evaluationProtected === false
        && content.metadata?.coldTransfer === false;
    },
    onProcessedInput(event) { guide?.recordProcessedInput(event); return accumulator?.recordProcessedInput(event) ?? false; },
    onClosedErrorEpisode(value) { return accumulator?.recordClosedErrorEpisode(value?.episode ?? value) ?? false; },
    analyzeResult({ sessionSnapshot } = {}) {
      if (!prepared || !accumulator || !guide) return { trainingQuality: null, recommendationIds: [] };
      const activeDurationMs = sessionSnapshot?.timing?.activeDurationMs ?? prepared.plan.durationMs;
      const windowSnapshot = accumulator.finalize(activeDurationMs);
      return {
        trainingQuality: analyzePracticeConsistency({ windowSnapshot, calibration: guide.getCalibration(), scoreRange: prepared.scoreRange, durationMs: prepared.plan.durationMs }),
        recommendationIds: [],
      };
    },
  };
  Object.defineProperties(descriptor, { sustainedAccumulator: { value: accumulator, enumerable: false }, consistencyGuide: { value: guide, enumerable: false } });
  return Object.freeze(descriptor);
}

export function createPracticeConsistencyRegistration({ runtime = createPracticeConsistencyRuntime() } = {}) {
  return Object.freeze({
    experimentId: PRACTICE_CONSISTENCY_EXPERIMENT_ID,
    implementationVersion: PRACTICE_CONSISTENCY_VERSION,
    descriptorFactory: () => createPracticeConsistencyExperiment(),
    setupFactory: (setup) => runtime.prepare(setup),
    sessionFactory(prepared) {
      if (prepared?.status !== "ready") throw Object.assign(new Error("Consistency Trainer unavailable"), { code: "CONSISTENCY_UNAVAILABLE" });
      return freezeDeep({ ...prepared, experiment: createPracticeConsistencyExperiment(prepared), configuration: { timingMode: "on-start", correctionBehavior: "allow", policyVersion: PRACTICE_CONSISTENCY_POLICY_VERSION, durationMs: prepared.plan.durationMs }, contentPlan: prepared.contentPlan });
    },
    runtime,
  });
}

export function registerPracticeConsistencyExperiment(registry, options = {}) {
  if (!registry || typeof registry.register !== "function") throw new TypeError("Consistency Trainer registration requires registry");
  if (registry.hasImplementation?.(PRACTICE_CONSISTENCY_EXPERIMENT_ID)) return registry.getRegistration(PRACTICE_CONSISTENCY_EXPERIMENT_ID);
  return registry.register(createPracticeConsistencyRegistration(options));
}
