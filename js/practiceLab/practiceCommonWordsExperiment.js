import {
  PRACTICE_COMMON_WORDS_EXPERIMENT_ID,
  PRACTICE_COMMON_WORD_CHECK_EXPERIMENT_ID,
  PRACTICE_COMMON_WORDS_VERSION,
  PRACTICE_COMMON_WORDS_POLICY_VERSION,
  PRACTICE_COMMON_WORD_REFERENCE_VERSION,
  PRACTICE_COMMON_WORD_BANK_VERSION,
  PRACTICE_COMMON_WORD_PRACTICE_GENERATOR_VERSION,
  PRACTICE_COMMON_WORD_CHECK_SCHEMA_VERSION,
  PRACTICE_COMMON_WORD_CHECK_GENERATOR_VERSION,
} from "./practiceCommonWordsConstants.js";
import { analyzePracticeCommonWordsPracticeResult, analyzePracticeCommonWordCheckResult } from "./practiceCommonWordsAnalyzer.js";
import { createPracticeCommonWordsRuntime } from "./practiceCommonWordsRuntime.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };

export function createPracticeCommonWordsDescriptor({ prepared = null } = {}) {
  return freezeDeep({
    id: PRACTICE_COMMON_WORDS_EXPERIMENT_ID,
    version: 1,
    sessionSchemaVersion: 1,
    title: "Common Words",
    category: "fluency",
    defaultCorrectionBehavior: "allow",
    supportedCompletionModes: ["word-count"],
    resumable: false,
    retentionMeasurementKind: null,
    abilityChannel: null,
    performanceMeasurementKind: null,
    performanceReferenceChannel: null,
    evaluationMeasurementKind: null,
    validateConfiguration(config) {
      return config?.correctionBehavior === "allow"
        && config?.commonWordsVersion === PRACTICE_COMMON_WORDS_VERSION
        && config?.flow === "practice"
        && [80, 160, 240].includes(config?.wordCount);
    },
    validateContentPlan(plan) {
      return plan?.completion?.mode === "word-count"
        && [80, 160, 240].includes(plan.completion.value)
        && plan?.metadata?.partition === "training"
        && plan?.metadata?.commonWords?.flow === "practice"
        && (plan.targetEntities?.length ?? 0) === 0;
    },
    ...(prepared ? { analyzeResult(input) { return analyzePracticeCommonWordsPracticeResult({ ...input, contentPlan: prepared.contentPlan, commonWordsPlan: prepared.plan }); } } : {}),
  });
}

export function createPracticeCommonWordCheckDescriptor({ prepared = null } = {}) {
  return freezeDeep({
    id: PRACTICE_COMMON_WORD_CHECK_EXPERIMENT_ID,
    version: 1,
    sessionSchemaVersion: 1,
    title: "Typing Breadth Check",
    category: "fluency",
    defaultCorrectionBehavior: "allow",
    supportedCompletionModes: ["word-count"],
    resumable: false,
    retentionMeasurementKind: null,
    abilityChannel: "common-words",
    performanceMeasurementKind: null,
    performanceReferenceChannel: null,
    evaluationMeasurementKind: null,
    validateConfiguration(config) {
      return config?.correctionBehavior === "allow"
        && config?.commonWordsVersion === PRACTICE_COMMON_WORDS_VERSION
        && config?.flow === "check"
        && config?.formSetVersion === PRACTICE_COMMON_WORD_CHECK_SCHEMA_VERSION;
    },
    validateContentPlan(plan) {
      const metadata = plan?.metadata?.commonWords;
      return plan?.completion?.mode === "word-count"
        && plan.completion.value === 200
        && plan?.metadata?.partition === "diagnostic"
        && metadata?.flow === "check"
        && typeof metadata?.formId === "string"
        && typeof metadata?.formHash === "string"
        && (plan.targetEntities?.length ?? 0) === 0;
    },
    ...(prepared ? { analyzeResult(input) { return analyzePracticeCommonWordCheckResult({ ...input, contentPlan: prepared.contentPlan }); } } : {}),
  });
}

export function createPracticeCommonWordsRegistration({ runtime = createPracticeCommonWordsRuntime() } = {}) {
  return Object.freeze({
    experimentId: PRACTICE_COMMON_WORDS_EXPERIMENT_ID,
    implementationVersion: 1,
    descriptorFactory: () => createPracticeCommonWordsDescriptor(),
    setupFactory: (setup) => runtime.prepare(setup),
    sessionFactory(prepared) {
      if (!prepared?.contentPlan || !prepared?.plan) throw new TypeError("Common Words sessionFactory requires prepared content");
      const check = prepared.flow === "check";
      return freezeDeep({
        experiment: check ? createPracticeCommonWordCheckDescriptor({ prepared }) : createPracticeCommonWordsDescriptor({ prepared }),
        configuration: check ? {
          correctionBehavior: "allow", timingMode: "on-first-input", commonWordsVersion: PRACTICE_COMMON_WORDS_VERSION, flow: "check",
          referenceVersion: PRACTICE_COMMON_WORD_REFERENCE_VERSION, formSetVersion: PRACTICE_COMMON_WORD_CHECK_SCHEMA_VERSION,
          checkGeneratorVersion: PRACTICE_COMMON_WORD_CHECK_GENERATOR_VERSION, formId: prepared.plan.formId,
        } : {
          correctionBehavior: "allow", timingMode: "on-first-input", commonWordsVersion: PRACTICE_COMMON_WORDS_VERSION, flow: "practice",
          referenceVersion: PRACTICE_COMMON_WORD_REFERENCE_VERSION, bankVersion: PRACTICE_COMMON_WORD_BANK_VERSION,
          policyVersion: PRACTICE_COMMON_WORDS_POLICY_VERSION, generatorVersion: PRACTICE_COMMON_WORD_PRACTICE_GENERATOR_VERSION, wordCount: prepared.plan.wordCount,
        },
        contentPlan: prepared.contentPlan,
        commonWordsPlan: prepared.plan,
        flow: prepared.flow,
        breadthSnapshotBefore: prepared.breadthSnapshotBefore,
      });
    },
    runtime,
  });
}

export function registerPracticeCommonWordsExperiment(registry, options = {}) {
  if (!registry || typeof registry.register !== "function") throw new TypeError("Common Words registration requires registry");
  if (registry.hasImplementation?.(PRACTICE_COMMON_WORDS_EXPERIMENT_ID)) return registry.getRegistration(PRACTICE_COMMON_WORDS_EXPERIMENT_ID);
  return registry.register(createPracticeCommonWordsRegistration(options));
}
