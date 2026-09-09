import { createPracticePaceStageAccumulator } from "./practicePaceStageAccumulator.js";
import { buildPracticePaceLadderPerformanceMeasurement } from "./practicePaceLadderMeasurement.js";
import { analyzePracticePaceLadderResult } from "./practicePaceLadderAnalyzer.js";
import { createPracticePaceLadderRuntime } from "./practicePaceLadderRuntime.js";
import { PRACTICE_PACE_LADDER_EXPERIMENT_ID, PRACTICE_PACE_LADDER_EXPERIMENT_VERSION, PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS } from "./practicePaceLadderConstants.js";

export function createPracticePaceLadderExperiment(prepared = null) {
  const accumulator = prepared ? createPracticePaceStageAccumulator({ plan: prepared.plan }) : null;
  const descriptor = {
    id: PRACTICE_PACE_LADDER_EXPERIMENT_ID,
    version: PRACTICE_PACE_LADDER_EXPERIMENT_VERSION,
    sessionSchemaVersion: 1,
    title: "Pace Ladder",
    category: "advanced",
    defaultCorrectionBehavior: "allow",
    supportedCompletionModes: ["duration"],
    resumable: false,
    performanceMeasurementKind: "control-frontier",
    performanceReferenceChannel: "controlled-speed",
    validateConfiguration(config) { return config?.timingMode === "on-start" && config?.correctionBehavior === "allow"; },
    validateContentPlan(content) { return content?.completion?.mode === "duration" && content.completion.value === PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS && (content.targetEntities?.length ?? 0) === 0 && content.metadata?.sourceType === "pace-ladder-diagnostic" && content.metadata?.partition === "diagnostic" && content.metadata?.evaluationProtected === false && content.metadata?.coldTransfer === false; },
    onProcessedInput(event) { return accumulator?.recordProcessedInput(event) ?? false; },
    onClosedErrorEpisode(value) { return accumulator?.recordClosedErrorEpisode(value) ?? false; },
    buildPerformanceMeasurement({ sessionSnapshot } = {}) {
      if (!accumulator) return { stages: [] };
      const result = accumulator.getFinalResult() ?? accumulator.finalize({ finalActiveDurationMs: sessionSnapshot?.timing?.activeDurationMs ?? 0 });
      return buildPracticePaceLadderPerformanceMeasurement(result, { difficultyAdjustmentLog: prepared?.difficultyAdjustmentLog ?? 0 });
    },
    analyzeResult({ sessionSnapshot, foundationAnalysis } = {}) {
      if (!accumulator || !prepared) return { trainingQuality: null, recommendationIds: [] };
      const result = accumulator.getFinalResult() ?? accumulator.finalize({ finalActiveDurationMs: sessionSnapshot?.timing?.activeDurationMs ?? 0 });
      return analyzePracticePaceLadderResult({ paceResult: result, plan: prepared.plan, foundationAnalysis, startedAt: prepared.preparedAt, completedAt: null });
    },
  };
  Object.defineProperty(descriptor, "paceAccumulator", { value: accumulator, enumerable: false });
  return Object.freeze(descriptor);
}

export function registerPracticePaceLadderExperiment(registry, { runtime = null } = {}) {
  if (!registry) throw new TypeError("Pace Ladder registration requires registry");
  if (registry.getRegistration?.(PRACTICE_PACE_LADDER_EXPERIMENT_ID)) return registry.getRegistration(PRACTICE_PACE_LADDER_EXPERIMENT_ID);
  const paceRuntime = runtime ?? createPracticePaceLadderRuntime();
  return registry.register({
    experimentId: PRACTICE_PACE_LADDER_EXPERIMENT_ID,
    implementationVersion: 1,
    descriptorFactory: () => createPracticePaceLadderExperiment(),
    setupFactory: (options = {}) => paceRuntime.prepare(options),
    sessionFactory(prepared) {
      if (prepared?.status !== "ready") throw Object.assign(new Error("Pace Ladder is unavailable"), { code: "PACE_LADDER_UNAVAILABLE" });
      return Object.freeze({ ...prepared, experiment: createPracticePaceLadderExperiment(prepared), configuration: Object.freeze({ timingMode: "on-start", correctionBehavior: "allow", anchorWpm: prepared.plan.anchor.effectiveWpm }), contentPlan: prepared.contentPlan });
    },
    runtime: paceRuntime,
  });
}
