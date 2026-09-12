import {
  PRACTICE_WEAKNESS_BOSS_EXPERIMENT_ID,
  PRACTICE_WEAKNESS_BOSS_EXPERIMENT_VERSION,
  PRACTICE_WEAKNESS_BOSS_GAMEPLAY_VERSION,
  PRACTICE_WEAKNESS_BOSS_GENERATOR_VERSION,
  PRACTICE_WEAKNESS_BOSS_POLICY_VERSION,
  PRACTICE_WEAKNESS_BOSS_PROBE_VERSION,
  PRACTICE_WEAKNESS_BOSS_QUOTAS,
  PRACTICE_WEAKNESS_BOSS_VERSION,
} from "./practiceWeaknessBossConstants.js";
import { analyzePracticeWeaknessBossFoundationResult } from "./practiceWeaknessBossAnalyzer.js";
import { createPracticeWeaknessBossRuntime } from "./practiceWeaknessBossRuntime.js";
import { trustPracticeWeaknessBossContentPlan } from "./practiceWeaknessBossTrust.js";

export const PRACTICE_WEAKNESS_BOSS_IMPLEMENTATION_VERSION = 1;
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function createPracticeWeaknessBossDescriptor({ plan = null, contentPlan = null } = {}) {
  return freezeDeep({
    id: PRACTICE_WEAKNESS_BOSS_EXPERIMENT_ID,
    version: PRACTICE_WEAKNESS_BOSS_EXPERIMENT_VERSION,
    title: "Weakness Boss",
    category: "advanced",
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
      if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) return false;
      return configuration.weaknessBossVersion === PRACTICE_WEAKNESS_BOSS_VERSION
        && configuration.policyVersion === PRACTICE_WEAKNESS_BOSS_POLICY_VERSION
        && configuration.generatorVersion === PRACTICE_WEAKNESS_BOSS_GENERATOR_VERSION
        && configuration.probeVersion === PRACTICE_WEAKNESS_BOSS_PROBE_VERSION
        && configuration.gameplayVersion === PRACTICE_WEAKNESS_BOSS_GAMEPLAY_VERSION
        && configuration.themeVersion == null;
    },
    validateContentPlan(candidate) {
      const metadata = candidate?.metadata?.weaknessBoss;
      const target = candidate?.targetEntities?.[0];
      const quotas = PRACTICE_WEAKNESS_BOSS_QUOTAS[target?.entityType];
      return candidate?.completion?.mode === "content"
        && candidate?.metadata?.partition === "training"
        && metadata?.resumable === false
        && metadata?.completionMode === "content"
        && Array.isArray(candidate?.targetEntities)
        && candidate.targetEntities.length === 1
        && target?.directTarget === true
        && Boolean(quotas)
        && metadata?.acquisitionDose?.opportunities === quotas?.battle
        && metadata?.phaseRanges?.length === 5;
    },
    ...(contentPlan && plan ? {
      analyzeResult(input) {
        return analyzePracticeWeaknessBossFoundationResult({ ...input, plan, contentPlan });
      },
    } : {}),
  });
}

export function createPracticeWeaknessBossRegistration({ runtime = createPracticeWeaknessBossRuntime() } = {}) {
  return Object.freeze({
    experimentId: PRACTICE_WEAKNESS_BOSS_EXPERIMENT_ID,
    implementationVersion: PRACTICE_WEAKNESS_BOSS_IMPLEMENTATION_VERSION,
    descriptorFactory: () => createPracticeWeaknessBossDescriptor(),
    setupFactory: (setup) => runtime.prepare(setup),
    sessionFactory(prepared) {
      if (!prepared?.contentPlan || !prepared?.plan) throw new TypeError("Weakness Boss sessionFactory requires a prepared immutable encounter");
      trustPracticeWeaknessBossContentPlan(prepared.contentPlan, prepared.plan);
      return freezeDeep({
        experiment: createPracticeWeaknessBossDescriptor({ plan: prepared.plan, contentPlan: prepared.contentPlan }),
        configuration: {
          correctionBehavior: "allow",
          timingMode: "on-first-input",
          weaknessBossVersion: PRACTICE_WEAKNESS_BOSS_VERSION,
          policyVersion: PRACTICE_WEAKNESS_BOSS_POLICY_VERSION,
          generatorVersion: PRACTICE_WEAKNESS_BOSS_GENERATOR_VERSION,
          probeVersion: PRACTICE_WEAKNESS_BOSS_PROBE_VERSION,
          gameplayVersion: PRACTICE_WEAKNESS_BOSS_GAMEPLAY_VERSION,
          target: { entityType: prepared.plan.target.entityType, entityKey: prepared.plan.target.entityKey },
          targetSource: prepared.plan.target.targetSource,
          targetOpportunityBudget: prepared.plan.targetOpportunityTotal,
          acquisitionDoseOpportunities: prepared.plan.acquisitionDose.opportunities,
        },
        contentPlan: prepared.contentPlan,
        weaknessBossPlan: prepared.plan,
      });
    },
    resultFactory({ input, plan, contentPlan } = {}) {
      if (!plan || !contentPlan) throw new TypeError("Weakness Boss resultFactory requires plan and contentPlan");
      return analyzePracticeWeaknessBossFoundationResult({ ...input, plan, contentPlan });
    },
    runtime,
  });
}

export function registerPracticeWeaknessBossExperiment(registry, options = {}) {
  if (!registry || typeof registry.register !== "function") throw new TypeError("Weakness Boss registration requires the Practice experiment registry");
  if (registry.hasImplementation?.(PRACTICE_WEAKNESS_BOSS_EXPERIMENT_ID)) return registry.getRegistration(PRACTICE_WEAKNESS_BOSS_EXPERIMENT_ID);
  return registry.register(createPracticeWeaknessBossRegistration(options));
}
