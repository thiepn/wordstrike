import { analyzePracticeEndurance } from "./practiceEnduranceAnalysis.js";
import { buildPracticeEnduranceAbilityMeasurement } from "./practiceEnduranceAbilityMeasurement.js";
import { createPracticeEnduranceRuntime } from "./practiceEnduranceRuntime.js";
import { createPracticeSustainedWindowAccumulator } from "./practiceSustainedWindowAccumulator.js";
import {
  PRACTICE_ENDURANCE_CHECK_DURATION_MS,
  PRACTICE_ENDURANCE_CHECK_EXPERIMENT_ID,
  PRACTICE_ENDURANCE_EXPERIMENT_ID,
  PRACTICE_ENDURANCE_POLICY_VERSION,
  PRACTICE_ENDURANCE_PRACTICE_DURATIONS_MS,
  PRACTICE_ENDURANCE_VERSION,
} from "./practiceEnduranceConstants.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };

function createDescriptor(prepared = null, flow = "practice") {
  const check = flow === "check";
  const accumulator = prepared ? createPracticeSustainedWindowAccumulator({ analysisStartMs: prepared.plan.analysisStartMs, windowMs: prepared.plan.windowMs, maximumWindows: Math.ceil((prepared.plan.durationMs - prepared.plan.analysisStartMs) / prepared.plan.windowMs) }) : null;
  const descriptor = {
    id: check ? PRACTICE_ENDURANCE_CHECK_EXPERIMENT_ID : PRACTICE_ENDURANCE_EXPERIMENT_ID,
    version: PRACTICE_ENDURANCE_VERSION,
    sessionSchemaVersion: 1,
    title: check ? "Endurance Check" : "Endurance",
    category: "fluency",
    defaultCorrectionBehavior: "allow",
    supportedCompletionModes: ["duration"],
    resumable: false,
    retentionMeasurementKind: null,
    abilityChannel: check ? "endurance" : null,
    performanceMeasurementKind: null,
    performanceReferenceChannel: null,
    evaluationMeasurementKind: null,
    validateConfiguration(config) {
      const durationValid = check ? config?.durationMs === PRACTICE_ENDURANCE_CHECK_DURATION_MS : PRACTICE_ENDURANCE_PRACTICE_DURATIONS_MS.includes(config?.durationMs);
      return config?.timingMode === "on-start" && config?.correctionBehavior === "allow" && config?.flow === flow && config?.policyVersion === PRACTICE_ENDURANCE_POLICY_VERSION && durationValid;
    },
    validateContentPlan(content) {
      const durationValid = check ? content?.completion?.value === PRACTICE_ENDURANCE_CHECK_DURATION_MS : PRACTICE_ENDURANCE_PRACTICE_DURATIONS_MS.includes(content?.completion?.value);
      return content?.completion?.mode === "duration"
        && durationValid
        && (content.targetEntities?.length ?? 0) === 0
        && content.metadata?.sourceType === (check ? "endurance-diagnostic" : "endurance-training")
        && content.metadata?.partition === (check ? "diagnostic" : "training")
        && content.metadata?.evaluationProtected === false
        && content.metadata?.coldTransfer === false;
    },
    onProcessedInput(event) { return accumulator?.recordProcessedInput(event) ?? false; },
    onClosedErrorEpisode(value) { return accumulator?.recordClosedErrorEpisode(value?.episode ?? value) ?? false; },
    ...(check ? { buildAbilityMeasurement({ session } = {}) { if (!prepared || !accumulator) return null; return buildPracticeEnduranceAbilityMeasurement({ windowSnapshot: accumulator.getSnapshot(session?.activeDurationMs ?? PRACTICE_ENDURANCE_CHECK_DURATION_MS), scoreRange: prepared.scoreRange }); } } : {}),
    analyzeResult({ sessionSnapshot } = {}) {
      if (!prepared || !accumulator) return { trainingQuality: null, recommendationIds: [] };
      const activeDurationMs = sessionSnapshot?.timing?.activeDurationMs ?? prepared.plan.durationMs;
      return { trainingQuality: analyzePracticeEndurance({ windowSnapshot: accumulator.finalize(activeDurationMs), scoreRange: prepared.scoreRange, flow, durationMs: prepared.plan.durationMs }), recommendationIds: [] };
    },
  };
  Object.defineProperty(descriptor, "sustainedAccumulator", { value: accumulator, enumerable: false });
  return Object.freeze(descriptor);
}

export const createPracticeEnduranceExperiment = (prepared = null) => createDescriptor(prepared, "practice");
export const createPracticeEnduranceCheckDescriptor = (prepared = null) => createDescriptor(prepared, "check");

export function createPracticeEnduranceRegistration({ runtime = createPracticeEnduranceRuntime() } = {}) {
  return Object.freeze({
    experimentId: PRACTICE_ENDURANCE_EXPERIMENT_ID,
    implementationVersion: PRACTICE_ENDURANCE_VERSION,
    descriptorFactory: () => createPracticeEnduranceExperiment(),
    setupFactory: (setup) => runtime.prepare(setup),
    sessionFactory(prepared) {
      if (prepared?.status !== "ready") throw Object.assign(new Error("Endurance unavailable"), { code: "ENDURANCE_UNAVAILABLE" });
      const check = prepared.flow === "check";
      return freezeDeep({ ...prepared, experiment: check ? createPracticeEnduranceCheckDescriptor(prepared) : createPracticeEnduranceExperiment(prepared), configuration: { timingMode: "on-start", correctionBehavior: "allow", flow: prepared.flow, policyVersion: PRACTICE_ENDURANCE_POLICY_VERSION, durationMs: prepared.plan.durationMs }, contentPlan: prepared.contentPlan });
    },
    runtime,
  });
}

export function registerPracticeEnduranceExperiment(registry, options = {}) {
  if (!registry || typeof registry.register !== "function") throw new TypeError("Endurance registration requires registry");
  if (registry.hasImplementation?.(PRACTICE_ENDURANCE_EXPERIMENT_ID)) return registry.getRegistration(PRACTICE_ENDURANCE_EXPERIMENT_ID);
  return registry.register(createPracticeEnduranceRegistration(options));
}
