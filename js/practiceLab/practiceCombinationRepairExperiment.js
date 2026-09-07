import {
  PRACTICE_COMBINATION_REPAIR_EXPERIMENT_ID,
  PRACTICE_COMBINATION_REPAIR_EXPERIMENT_VERSION,
} from "./practiceCombinationRepairConstants.js";
import { analyzePracticeCombinationRepairResult } from "./practiceCombinationRepairAnalyzer.js";
import { createPracticeCombinationRepairRuntime } from "./practiceCombinationRepairRuntime.js";

export const PRACTICE_COMBINATION_REPAIR_IMPLEMENTATION_VERSION = 1;

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function createPracticeCombinationRepairDescriptor({ contentPlan = null } = {}) {
  return freezeDeep({
    id: PRACTICE_COMBINATION_REPAIR_EXPERIMENT_ID,
    version: PRACTICE_COMBINATION_REPAIR_EXPERIMENT_VERSION,
    title: "Combination Repair",
    category: "precision",
    sessionSchemaVersion: 1,
    defaultCorrectionBehavior: "allow",
    supportedCompletionModes: ["content"],
    resumable: false,
    retentionMeasurementKind: null,
    abilityChannel: null,
    performanceMeasurementKind: null,
    performanceReferenceChannel: null,
    validateConfiguration(configuration) {
      return configuration == null || typeof configuration === "object";
    },
    validateContentPlan(plan) {
      const metadata = plan?.metadata?.combinationRepair;
      return plan?.completion?.mode === "content"
        && plan?.metadata?.partition === "training"
        && metadata?.resumable === false
        && metadata?.completionMode === "content"
        && Array.isArray(plan?.targetEntities)
        && plan.targetEntities.length === 1
        && plan.targetEntities[0]?.directTarget === true;
    },
    ...(contentPlan ? {
      analyzeResult(input) {
        return analyzePracticeCombinationRepairResult({ ...input, contentPlan });
      },
    } : {}),
  });
}

export function createPracticeCombinationRepairRegistration({
  runtime = createPracticeCombinationRepairRuntime(),
} = {}) {
  return Object.freeze({
    experimentId: PRACTICE_COMBINATION_REPAIR_EXPERIMENT_ID,
    implementationVersion: PRACTICE_COMBINATION_REPAIR_IMPLEMENTATION_VERSION,
    descriptorFactory: () => createPracticeCombinationRepairDescriptor(),
    setupFactory: (setup) => runtime.prepare(setup),
    sessionFactory(prepared) {
      if (!prepared?.contentPlan || !prepared?.plan) throw new TypeError("Combination Repair sessionFactory requires a prepared plan");
      return freezeDeep({
        experiment: createPracticeCombinationRepairDescriptor({ contentPlan: prepared.contentPlan }),
        configuration: {
          correctionBehavior: "allow",
          timingMode: "on-first-input",
        },
        contentPlan: prepared.contentPlan,
        combinationRepairPlan: prepared.plan,
      });
    },
    resultFactory({ input, contentPlan } = {}) {
      if (!contentPlan) throw new TypeError("Combination Repair resultFactory requires contentPlan");
      return analyzePracticeCombinationRepairResult({ ...input, contentPlan });
    },
    runtime,
  });
}

export function registerPracticeCombinationRepairExperiment(registry, options = {}) {
  if (!registry || typeof registry.register !== "function") throw new TypeError("Combination Repair registration requires the Practice experiment registry");
  if (registry.hasImplementation?.(PRACTICE_COMBINATION_REPAIR_EXPERIMENT_ID)) return registry.getRegistration(PRACTICE_COMBINATION_REPAIR_EXPERIMENT_ID);
  return registry.register(createPracticeCombinationRepairRegistration(options));
}
