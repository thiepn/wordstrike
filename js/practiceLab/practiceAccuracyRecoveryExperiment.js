import {
  PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_ID,
  PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_VERSION,
  PRACTICE_ACCURACY_RECOVERY_FEEDBACK_VERSION,
  PRACTICE_ACCURACY_RECOVERY_GENERATOR_VERSION,
  PRACTICE_ACCURACY_RECOVERY_POLICY_VERSION,
  PRACTICE_ACCURACY_RECOVERY_VERSION,
} from "./practiceAccuracyRecoveryConstants.js";
import { analyzePracticeAccuracyRecoveryResult } from "./practiceAccuracyRecoveryAnalyzer.js";
import { createPracticeAccuracyRecoveryFeedbackTracker } from "./practiceAccuracyRecoveryFeedback.js";
import { createPracticeAccuracyRecoveryRuntime } from "./practiceAccuracyRecoveryRuntime.js";
import { getPracticePrimaryErrorPosition } from "./practicePrimaryErrorAttribution.js";
import { trustPracticeAccuracyRecoveryContentPlan } from "./practiceAccuracyRecoveryTrust.js";

export const PRACTICE_ACCURACY_RECOVERY_IMPLEMENTATION_VERSION = 1;
const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
function episodeIsInRepairPhase(contentPlan, episode) {
  const position = getPracticePrimaryErrorPosition(episode);
  if (position == null) return false;
  const repair = contentPlan?.metadata?.accuracyRecovery?.phaseRanges?.find((phase) => phase?.id === "repair") ?? null;
  return Boolean(repair && position >= repair.startIndex && position < repair.endIndex);
}

export function createPracticeAccuracyRecoveryDescriptor({ contentPlan = null, feedbackTracker = null } = {}) {
  return freezeDeep({
    id: PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_ID,
    version: PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_VERSION,
    title: "Accuracy & Recovery",
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
      if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) return false;
      return configuration.accuracyRecoveryVersion === PRACTICE_ACCURACY_RECOVERY_VERSION
        && configuration.policyVersion === PRACTICE_ACCURACY_RECOVERY_POLICY_VERSION
        && configuration.generatorVersion === PRACTICE_ACCURACY_RECOVERY_GENERATOR_VERSION
        && configuration.feedbackVersion === PRACTICE_ACCURACY_RECOVERY_FEEDBACK_VERSION
        && configuration.correctionBehavior === "allow"
        && configuration.target?.entityType
        && configuration.target?.entityKey;
    },
    validateContentPlan(plan) {
      const metadata = plan?.metadata?.accuracyRecovery;
      return plan?.completion?.mode === "content"
        && plan?.metadata?.partition === "training"
        && metadata?.resumable === false
        && metadata?.completionMode === "content"
        && Array.isArray(plan?.targetEntities)
        && plan.targetEntities.length === 1
        && plan.targetEntities[0]?.directTarget === true;
    },
    ...(feedbackTracker ? {
      onClosedErrorEpisode({ episode, attribution }) {
        if (!episodeIsInRepairPhase(contentPlan, episode)) return null;
        return feedbackTracker.consume({ episode, attribution, target: contentPlan?.metadata?.accuracyRecovery?.target });
      },
      getRepairFeedbackSnapshot() { return feedbackTracker.getSnapshot(); },
    } : {}),
    ...(contentPlan ? { analyzeResult(input) { return analyzePracticeAccuracyRecoveryResult({ ...input, contentPlan }); } } : {}),
  });
}

export function createPracticeAccuracyRecoveryRegistration({ runtime = createPracticeAccuracyRecoveryRuntime() } = {}) {
  return Object.freeze({
    experimentId: PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_ID,
    implementationVersion: PRACTICE_ACCURACY_RECOVERY_IMPLEMENTATION_VERSION,
    descriptorFactory: () => createPracticeAccuracyRecoveryDescriptor(),
    setupFactory: (setup) => runtime.prepare(setup),
    sessionFactory(prepared) {
      if (!prepared?.contentPlan || !prepared?.plan) throw new TypeError("Accuracy & Recovery sessionFactory requires a prepared immutable plan");
      trustPracticeAccuracyRecoveryContentPlan(prepared.contentPlan, prepared.plan);
      const feedbackTracker = createPracticeAccuracyRecoveryFeedbackTracker();
      return freezeDeep({
        experiment: createPracticeAccuracyRecoveryDescriptor({ contentPlan: prepared.contentPlan, feedbackTracker }),
        configuration: {
          correctionBehavior: "allow",
          timingMode: "on-first-input",
          accuracyRecoveryVersion: PRACTICE_ACCURACY_RECOVERY_VERSION,
          policyVersion: PRACTICE_ACCURACY_RECOVERY_POLICY_VERSION,
          generatorVersion: PRACTICE_ACCURACY_RECOVERY_GENERATOR_VERSION,
          feedbackVersion: PRACTICE_ACCURACY_RECOVERY_FEEDBACK_VERSION,
          target: { ...prepared.plan.target },
          targetSource: prepared.plan.targetSource,
          targetOpportunityBudget: prepared.plan.targetOpportunityBudget,
        },
        contentPlan: prepared.contentPlan,
        accuracyRecoveryPlan: prepared.plan,
      });
    },
    resultFactory({ input, contentPlan } = {}) { if (!contentPlan) throw new TypeError("Accuracy & Recovery resultFactory requires contentPlan"); return analyzePracticeAccuracyRecoveryResult({ ...input, contentPlan }); },
    runtime,
  });
}

export function registerPracticeAccuracyRecoveryExperiment(registry, options = {}) {
  if (!registry || typeof registry.register !== "function") throw new TypeError("Accuracy & Recovery registration requires Practice registry");
  if (registry.hasImplementation?.(PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_ID)) return registry.getRegistration(PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_ID);
  return registry.register(createPracticeAccuracyRecoveryRegistration(options));
}
