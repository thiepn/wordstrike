import {
  PRACTICE_PROBLEM_WORDS_EXPERIMENT_ID,
  PRACTICE_PROBLEM_WORDS_EXPERIMENT_VERSION,
  PRACTICE_PROBLEM_WORDS_GENERATOR_VERSION,
  PRACTICE_PROBLEM_WORDS_POLICY_VERSION,
  PRACTICE_PROBLEM_WORDS_VERSION,
} from "./practiceProblemWordsConstants.js";
import { analyzePracticeProblemWordsResult } from "./practiceProblemWordsAnalyzer.js";
import { createPracticeProblemWordsRuntime } from "./practiceProblemWordsRuntime.js";
import { trustPracticeProblemWordsContentPlan } from "./practiceProblemWordsTrust.js";

export const PRACTICE_PROBLEM_WORDS_IMPLEMENTATION_VERSION = 1;
const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };

export function createPracticeProblemWordsDescriptor({ contentPlan = null } = {}) {
  return freezeDeep({
    id: PRACTICE_PROBLEM_WORDS_EXPERIMENT_ID,
    version: PRACTICE_PROBLEM_WORDS_EXPERIMENT_VERSION,
    title: "Problem Words",
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
      if (configuration.problemWordsVersion != null && configuration.problemWordsVersion !== PRACTICE_PROBLEM_WORDS_VERSION) return false;
      if (configuration.policyVersion != null && configuration.policyVersion !== PRACTICE_PROBLEM_WORDS_POLICY_VERSION) return false;
      if (configuration.generatorVersion != null && configuration.generatorVersion !== PRACTICE_PROBLEM_WORDS_GENERATOR_VERSION) return false;
      return true;
    },
    validateContentPlan(plan) {
      const metadata = plan?.metadata?.problemWords;
      return plan?.completion?.mode === "content"
        && plan?.metadata?.partition === "training"
        && metadata?.resumable === false
        && metadata?.completionMode === "content"
        && metadata?.targetOpportunityBudget === 15
        && Array.isArray(plan?.targetEntities)
        && plan.targetEntities.length === 1
        && plan.targetEntities[0]?.entityType === "word"
        && plan.targetEntities[0]?.directTarget === true;
    },
    ...(contentPlan ? { analyzeResult(input) { return analyzePracticeProblemWordsResult({ ...input, contentPlan }); } } : {}),
  });
}

export function createPracticeProblemWordsRegistration({ runtime = createPracticeProblemWordsRuntime() } = {}) {
  return Object.freeze({
    experimentId: PRACTICE_PROBLEM_WORDS_EXPERIMENT_ID,
    implementationVersion: PRACTICE_PROBLEM_WORDS_IMPLEMENTATION_VERSION,
    descriptorFactory: () => createPracticeProblemWordsDescriptor(),
    setupFactory: (setup) => runtime.prepare(setup),
    sessionFactory(prepared) {
      if (!prepared?.contentPlan || !prepared?.plan) throw new TypeError("Problem Words sessionFactory requires a prepared immutable plan");
      trustPracticeProblemWordsContentPlan(prepared.contentPlan, prepared.plan);
      return freezeDeep({
        experiment: createPracticeProblemWordsDescriptor({ contentPlan: prepared.contentPlan }),
        configuration: {
          correctionBehavior: "allow",
          timingMode: "on-first-input",
          problemWordsVersion: PRACTICE_PROBLEM_WORDS_VERSION,
          policyVersion: PRACTICE_PROBLEM_WORDS_POLICY_VERSION,
          generatorVersion: PRACTICE_PROBLEM_WORDS_GENERATOR_VERSION,
          target: { entityType: "word", entityKey: prepared.plan.target.entityKey },
          targetSource: prepared.plan.targetSource,
          targetOpportunityBudget: 15,
        },
        contentPlan: prepared.contentPlan,
        problemWordsPlan: prepared.plan,
      });
    },
    resultFactory({ input, contentPlan } = {}) { if (!contentPlan) throw new TypeError("Problem Words resultFactory requires contentPlan"); return analyzePracticeProblemWordsResult({ ...input, contentPlan }); },
    runtime,
  });
}

export function registerPracticeProblemWordsExperiment(registry, options = {}) {
  if (!registry || typeof registry.register !== "function") throw new TypeError("Problem Words registration requires the Practice experiment registry");
  if (registry.hasImplementation?.(PRACTICE_PROBLEM_WORDS_EXPERIMENT_ID)) return registry.getRegistration(PRACTICE_PROBLEM_WORDS_EXPERIMENT_ID);
  return registry.register(createPracticeProblemWordsRegistration(options));
}
