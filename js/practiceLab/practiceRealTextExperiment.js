import {
  PRACTICE_REAL_TEXT_EXPERIMENT_ID,
  PRACTICE_REAL_TEXT_EXPERIMENT_VERSION,
  PRACTICE_REAL_TEXT_GENERATOR_VERSION,
  PRACTICE_REAL_TEXT_POLICY_VERSION,
  PRACTICE_REAL_TEXT_VERSION,
} from "./practiceRealTextConstants.js";
import { analyzePracticeRealTextResult } from "./practiceRealTextAnalyzer.js";
import { createPracticeRealTextRuntime } from "./practiceRealTextRuntime.js";
import { registerPracticeTrustedRealTextBinding } from "./practiceRealTextTrust.js";

export const PRACTICE_REAL_TEXT_IMPLEMENTATION_VERSION = 1;
const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };

export function createPracticeRealTextDescriptor({ contentPlan = null } = {}) {
  return freezeDeep({
    id: PRACTICE_REAL_TEXT_EXPERIMENT_ID,
    version: PRACTICE_REAL_TEXT_EXPERIMENT_VERSION,
    title: "Real Text",
    category: "real-world",
    sessionSchemaVersion: 1,
    defaultCorrectionBehavior: "allow",
    supportedCompletionModes: ["duration"],
    resumable: false,
    retentionMeasurementKind: null,
    abilityChannel: null,
    performanceMeasurementKind: null,
    performanceReferenceChannel: null,
    evaluationMeasurementKind: null,
    validateConfiguration(configuration) {
      return configuration?.realTextVersion === PRACTICE_REAL_TEXT_VERSION
        && configuration?.policyVersion === PRACTICE_REAL_TEXT_POLICY_VERSION
        && configuration?.generatorVersion === PRACTICE_REAL_TEXT_GENERATOR_VERSION
        && configuration?.correctionBehavior === "allow"
        && [180_000, 300_000, 600_000].includes(configuration?.durationMs)
        && !Object.hasOwn(configuration ?? {}, "target");
    },
    validateContentPlan(plan) {
      return plan?.completion?.mode === "duration"
        && plan?.metadata?.partition === "training"
        && plan?.metadata?.sourceType === "real-text-training"
        && Array.isArray(plan?.targetEntities)
        && plan.targetEntities.length === 0;
    },
    ...(contentPlan ? { analyzeResult(input) { return analyzePracticeRealTextResult(input); } } : {}),
  });
}

export function createPracticeRealTextRegistration({ runtime = createPracticeRealTextRuntime() } = {}) {
  return Object.freeze({
    experimentId: PRACTICE_REAL_TEXT_EXPERIMENT_ID,
    implementationVersion: PRACTICE_REAL_TEXT_IMPLEMENTATION_VERSION,
    descriptorFactory: () => createPracticeRealTextDescriptor(),
    setupFactory: (setup) => runtime.prepare(setup),
    sessionFactory(prepared) {
      if (!prepared?.contentPlan || !prepared?.plan) throw new TypeError("Real Text sessionFactory requires a prepared plan");
      registerPracticeTrustedRealTextBinding(prepared.contentPlan, { experimentId: PRACTICE_REAL_TEXT_EXPERIMENT_ID, partition: "training", evidenceRole: "training", targetEntities: [], planHash: prepared.plan.planHash });
      return freezeDeep({
        experiment: createPracticeRealTextDescriptor({ contentPlan: prepared.contentPlan }),
        configuration: {
          correctionBehavior: "allow",
          timingMode: "on-first-input",
          realTextVersion: PRACTICE_REAL_TEXT_VERSION,
          policyVersion: PRACTICE_REAL_TEXT_POLICY_VERSION,
          generatorVersion: PRACTICE_REAL_TEXT_GENERATOR_VERSION,
          poolId: prepared.plan.poolId,
          poolVersion: prepared.plan.poolVersion,
          durationMs: prepared.plan.durationMs,
        },
        contentPlan: prepared.contentPlan,
        realTextPlan: prepared.plan,
      });
    },
    resultFactory({ input } = {}) { return analyzePracticeRealTextResult(input); },
    runtime,
  });
}

export function registerPracticeRealTextExperiment(registry, options = {}) {
  if (!registry || typeof registry.register !== "function") throw new TypeError("Real Text registration requires Practice registry");
  if (registry.hasImplementation?.(PRACTICE_REAL_TEXT_EXPERIMENT_ID)) return registry.getRegistration(PRACTICE_REAL_TEXT_EXPERIMENT_ID);
  return registry.register(createPracticeRealTextRegistration(options));
}
