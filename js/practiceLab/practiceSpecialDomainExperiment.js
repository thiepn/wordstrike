import { createPracticeSpecialDomainAccumulator } from "./practiceSpecialDomainAccumulator.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function createPracticeSpecialDomainDescriptor({
  prepared = null,
  flow = "practice",
  visibleExperimentId,
  checkExperimentId,
  version,
  policyVersion,
  title,
  checkTitle,
  category,
  practiceDurationsMs,
  primaryCategories,
  abilityChannel,
  sourceTypes,
  analyze,
  buildAbilityMeasurement,
} = {}) {
  const check = flow === "check";
  const accumulator = prepared ? createPracticeSpecialDomainAccumulator({
    annotations: prepared.form.annotations,
    primaryCategories,
  }) : null;
  const descriptor = {
    id: check ? checkExperimentId : visibleExperimentId,
    version,
    sessionSchemaVersion: 1,
    title: check ? checkTitle : title,
    category,
    defaultCorrectionBehavior: "allow",
    supportedCompletionModes: [check ? "content" : "duration"],
    resumable: false,
    retentionMeasurementKind: null,
    abilityChannel: check ? abilityChannel : null,
    performanceMeasurementKind: null,
    performanceReferenceChannel: null,
    evaluationMeasurementKind: null,
    validateConfiguration(config) {
      const durationValid = check ? config?.durationMs == null : practiceDurationsMs.includes(config?.durationMs);
      return config?.timingMode === "on-start"
        && config?.correctionBehavior === "allow"
        && config?.flow === flow
        && config?.policyVersion === policyVersion
        && durationValid;
    },
    validateContentPlan(content) {
      const completionValid = check
        ? content?.completion?.mode === "content"
        : content?.completion?.mode === "duration" && practiceDurationsMs.includes(content?.completion?.value);
      return completionValid
        && (content.targetEntities?.length ?? 0) === 0
        && content.metadata?.sourceType === (check ? sourceTypes.check : sourceTypes.practice)
        && content.metadata?.partition === (check ? "diagnostic" : "training")
        && content.metadata?.flow === flow
        && content.metadata?.formId === prepared?.form?.formId
        && content.metadata?.formHash === prepared?.form?.formHash
        && content.metadata?.annotationHash === prepared?.form?.annotations?.annotationHash
        && content.metadata?.evaluationProtected === false
        && content.metadata?.coldTransfer === false;
    },
    onProcessedInput(event) { return accumulator?.recordProcessedInput(event) ?? false; },
    onClosedErrorEpisode(value) { return accumulator?.recordClosedErrorEpisode(value?.episode ?? value) ?? false; },
    ...(check ? {
      buildAbilityMeasurement({ session, foundationAnalysis } = {}) {
        if (!prepared || !accumulator) return null;
        return buildAbilityMeasurement({
          accumulatorSnapshot: accumulator.getSnapshot(),
          session,
          foundationAnalysis,
        });
      },
    } : {}),
    analyzeResult({ sessionSnapshot } = {}) {
      if (!prepared || !accumulator) return { trainingQuality: null, recommendationIds: [] };
      return {
        trainingQuality: analyze({
          accumulatorSnapshot: accumulator.finalize(),
          flow,
          sessionSnapshot,
        }),
        recommendationIds: [],
      };
    },
  };
  Object.defineProperty(descriptor, "specialDomainAccumulator", { value: accumulator, enumerable: false });
  return Object.freeze(descriptor);
}

export function createPracticeSpecialDomainRegistration({
  experimentId,
  version,
  runtime,
  createPracticeDescriptor,
  createCheckDescriptor,
  policyVersion,
  practiceDurationsMs,
  unavailableCode,
} = {}) {
  return Object.freeze({
    experimentId,
    implementationVersion: version,
    descriptorFactory: () => createPracticeDescriptor(),
    setupFactory: (setup) => runtime.prepare(setup),
    sessionFactory(prepared) {
      if (prepared?.status !== "ready") throw Object.assign(new Error("PL30 domain unavailable"), { code: unavailableCode });
      const check = prepared.flow === "check";
      return freezeDeep({
        ...prepared,
        experiment: check ? createCheckDescriptor(prepared) : createPracticeDescriptor(prepared),
        configuration: {
          timingMode: "on-start",
          correctionBehavior: "allow",
          flow: prepared.flow,
          policyVersion,
          durationMs: check ? null : prepared.plan.durationMs,
        },
        contentPlan: prepared.contentPlan,
      });
    },
    runtime,
  });
}
