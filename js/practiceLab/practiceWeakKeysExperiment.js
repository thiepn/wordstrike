import {
  PRACTICE_WEAK_KEYS_EXPERIMENT_ID,
  PRACTICE_WEAK_KEYS_EXPERIMENT_VERSION,
  PRACTICE_WEAK_KEYS_GENERATOR_VERSION,
  PRACTICE_WEAK_KEYS_POLICY_VERSION,
  PRACTICE_WEAK_KEYS_VERSION,
} from "./practiceWeakKeysConstants.js";
import { analyzePracticeWeakKeysResult } from "./practiceWeakKeysAnalyzer.js";
import { createPracticeWeakKeysRuntime } from "./practiceWeakKeysRuntime.js";
import { trustPracticeWeakKeysContentPlan } from "./practiceWeakKeysTrust.js";

export const PRACTICE_WEAK_KEYS_IMPLEMENTATION_VERSION = 1;
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function createPracticeWeakKeysDescriptor({ contentPlan = null } = {}) {
  return freezeDeep({
    id: PRACTICE_WEAK_KEYS_EXPERIMENT_ID,
    version: PRACTICE_WEAK_KEYS_EXPERIMENT_VERSION,
    title: "Weak Keys",
    category: "precision",
    sessionSchemaVersion: 1,
    defaultCorrectionBehavior: "allow",
    supportedCompletionModes: ["content"],
    resumable: false,
    retentionMeasurementKind: null,
    abilityChannel: null,
    performanceMeasurementKind: null,
    performanceReferenceChannel: null,
    evaluationMeasurementKind: null,
    validateConfiguration(configuration) {
      if (configuration == null) return true;
      if (typeof configuration !== "object" || Array.isArray(configuration)) return false;
      if (configuration.weakKeysVersion != null && configuration.weakKeysVersion !== PRACTICE_WEAK_KEYS_VERSION) return false;
      if (configuration.policyVersion != null && configuration.policyVersion !== PRACTICE_WEAK_KEYS_POLICY_VERSION) return false;
      if (configuration.generatorVersion != null && configuration.generatorVersion !== PRACTICE_WEAK_KEYS_GENERATOR_VERSION) return false;
      return true;
    },
    validateContentPlan(plan) {
      const metadata = plan?.metadata?.weakKeys;
      return plan?.completion?.mode === "content"
        && plan?.metadata?.partition === "training"
        && metadata?.resumable === false
        && metadata?.completionMode === "content"
        && metadata?.targetOpportunityBudget === 80
        && Array.isArray(plan?.targetEntities)
        && plan.targetEntities.length === 1
        && plan.targetEntities[0]?.entityType === "key"
        && plan.targetEntities[0]?.directTarget === true;
    },
    ...(contentPlan ? {
      analyzeResult(input) {
        return analyzePracticeWeakKeysResult({ ...input, contentPlan });
      },
    } : {}),
  });
}

export function createPracticeWeakKeysRegistration({ runtime = createPracticeWeakKeysRuntime() } = {}) {
  return Object.freeze({
    experimentId: PRACTICE_WEAK_KEYS_EXPERIMENT_ID,
    implementationVersion: PRACTICE_WEAK_KEYS_IMPLEMENTATION_VERSION,
    descriptorFactory: () => createPracticeWeakKeysDescriptor(),
    setupFactory: (setup) => runtime.prepare(setup),
    sessionFactory(prepared) {
      if (!prepared?.contentPlan || !prepared?.plan) throw new TypeError("Weak Keys sessionFactory requires a prepared immutable plan");
      trustPracticeWeakKeysContentPlan(prepared.contentPlan, prepared.plan);
      return freezeDeep({
        experiment: createPracticeWeakKeysDescriptor({ contentPlan: prepared.contentPlan }),
        configuration: {
          correctionBehavior: "allow",
          timingMode: "on-first-input",
          weakKeysVersion: PRACTICE_WEAK_KEYS_VERSION,
          policyVersion: PRACTICE_WEAK_KEYS_POLICY_VERSION,
          generatorVersion: PRACTICE_WEAK_KEYS_GENERATOR_VERSION,
          target: { entityType: "key", entityKey: prepared.plan.target.entityKey },
          targetSource: prepared.plan.targetSource,
          targetOpportunityBudget: 80,
        },
        contentPlan: prepared.contentPlan,
        weakKeysPlan: prepared.plan,
      });
    },
    resultFactory({ input, contentPlan } = {}) {
      if (!contentPlan) throw new TypeError("Weak Keys resultFactory requires contentPlan");
      return analyzePracticeWeakKeysResult({ ...input, contentPlan });
    },
    runtime,
  });
}

export function registerPracticeWeakKeysExperiment(registry, options = {}) {
  if (!registry || typeof registry.register !== "function") throw new TypeError("Weak Keys registration requires the Practice experiment registry");
  if (registry.hasImplementation?.(PRACTICE_WEAK_KEYS_EXPERIMENT_ID)) return registry.getRegistration(PRACTICE_WEAK_KEYS_EXPERIMENT_ID);
  return registry.register(createPracticeWeakKeysRegistration(options));
}
