import { createPracticeCustomTextRuntime } from "./practiceCustomTextRuntime.js";
import { analyzePracticeCustomTextResult } from "./practiceCustomTextAnalyzer.js";
import {
  PRACTICE_CUSTOM_TEXT_EXPERIMENT_ID,
  PRACTICE_CUSTOM_TEXT_POLICY_VERSION,
  PRACTICE_CUSTOM_TEXT_PROJECTION_VERSION,
  PRACTICE_CUSTOM_TEXT_SESSION_MODES,
  PRACTICE_CUSTOM_TEXT_TIMED_DURATIONS_MS,
  PRACTICE_CUSTOM_TEXT_VERSION,
} from "./practiceCustomTextConstants.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };

export function createPracticeCustomTextExperiment(prepared = null) {
  const plan = prepared?.customTextPlan ?? null;
  return Object.freeze({
    id: PRACTICE_CUSTOM_TEXT_EXPERIMENT_ID,
    version: PRACTICE_CUSTOM_TEXT_VERSION,
    sessionSchemaVersion: 1,
    title: "Custom Text",
    category: "custom",
    defaultCorrectionBehavior: "allow",
    supportedCompletionModes: ["content", "duration"],
    resumable: false,
    retentionMeasurementKind: null,
    abilityChannel: null,
    performanceMeasurementKind: null,
    performanceReferenceChannel: null,
    evaluationMeasurementKind: null,
    validateConfiguration(config) {
      return config?.timingMode === "on-first-input"
        && config?.correctionBehavior === "allow"
        && config?.policyVersion === PRACTICE_CUSTOM_TEXT_POLICY_VERSION
        && config?.projectionVersion === PRACTICE_CUSTOM_TEXT_PROJECTION_VERSION
        && ["saved", "ephemeral"].includes(config?.sourceKind)
        && PRACTICE_CUSTOM_TEXT_SESSION_MODES.includes(config?.sessionMode)
        && (config.sessionMode !== "timed" || PRACTICE_CUSTOM_TEXT_TIMED_DURATIONS_MS.includes(config.timedDurationMs));
    },
    validateContentPlan(content) {
      const meta = content?.metadata?.customText;
      const completionValid = plan?.sessionMode === "timed"
        ? content?.completion?.mode === "duration" && content.completion.value === plan.timedDurationMs
        : content?.completion?.mode === "content";
      return completionValid
        && (content?.targetEntities?.length ?? 0) === 0
        && content?.metadata?.sourceType === "user-local"
        && content?.metadata?.contentPurpose === "custom"
        && content?.metadata?.evidenceRole === "custom"
        && content?.metadata?.partition == null
        && content?.metadata?.corpusPartition == null
        && content?.metadata?.corpusContentId == null
        && meta?.policyVersion === PRACTICE_CUSTOM_TEXT_POLICY_VERSION
        && meta?.projectionVersion === PRACTICE_CUSTOM_TEXT_PROJECTION_VERSION
        && (!plan || (meta.sourceHash === plan.sourceHash && meta.typingHash === plan.typingHash && meta.planHash === plan.planHash));
    },
    analyzeResult(input = {}) {
      return analyzePracticeCustomTextResult({ ...input, contentPlan: prepared?.contentPlan ?? null, customTextPlan: plan });
    },
  });
}

export function createPracticeCustomTextRegistration({ runtime = createPracticeCustomTextRuntime() } = {}) {
  return Object.freeze({
    experimentId: PRACTICE_CUSTOM_TEXT_EXPERIMENT_ID,
    implementationVersion: PRACTICE_CUSTOM_TEXT_VERSION,
    descriptorFactory: () => createPracticeCustomTextExperiment(),
    setupFactory: (setup) => runtime.prepare(setup),
    sessionFactory(prepared) {
      if (prepared?.status !== "ready") throw Object.assign(new Error("Custom Text unavailable"), { code: "CUSTOM_TEXT_UNAVAILABLE" });
      const plan = prepared.customTextPlan;
      return freezeDeep({
        ...prepared,
        experiment: createPracticeCustomTextExperiment(prepared),
        configuration: {
          timingMode: "on-first-input",
          correctionBehavior: "allow",
          policyVersion: PRACTICE_CUSTOM_TEXT_POLICY_VERSION,
          projectionVersion: PRACTICE_CUSTOM_TEXT_PROJECTION_VERSION,
          sourceKind: plan.sourceKind,
          customTextId: plan.sourceKind === "saved" ? plan.customTextId : null,
          revision: plan.sourceKind === "saved" ? plan.revision : null,
          sourceHash: plan.sourceHash,
          typingHash: plan.typingHash,
          sessionMode: plan.sessionMode,
          timedDurationMs: plan.timedDurationMs,
          selectionRange: plan.selectionRange,
          planHash: plan.planHash,
        },
        contentPlan: prepared.contentPlan,
      });
    },
    runtime,
  });
}

export function registerPracticeCustomTextExperiment(registry, options = {}) {
  if (!registry || typeof registry.register !== "function") throw new TypeError("Custom Text registration requires registry");
  if (registry.hasImplementation?.(PRACTICE_CUSTOM_TEXT_EXPERIMENT_ID)) return registry.getRegistration(PRACTICE_CUSTOM_TEXT_EXPERIMENT_ID);
  return registry.register(createPracticeCustomTextRegistration(options));
}
