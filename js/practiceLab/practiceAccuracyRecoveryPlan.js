import { hashPracticeContent } from "./practiceIds.js";
import {
  PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_ID,
  PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_VERSION,
  PRACTICE_ACCURACY_RECOVERY_FEEDBACK_VERSION,
  PRACTICE_ACCURACY_RECOVERY_GENERATOR_VERSION,
  PRACTICE_ACCURACY_RECOVERY_PHASE_CUES,
  PRACTICE_ACCURACY_RECOVERY_PHASE_IDS,
  PRACTICE_ACCURACY_RECOVERY_PHASE_LABELS,
  PRACTICE_ACCURACY_RECOVERY_PHASE_QUOTAS,
  PRACTICE_ACCURACY_RECOVERY_POLICY_VERSION,
  PRACTICE_ACCURACY_RECOVERY_SELECTION_VERSION,
  PRACTICE_ACCURACY_RECOVERY_VERSION,
} from "./practiceAccuracyRecoveryConstants.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const contextBinding = (context) => Object.freeze({ contextId: context?.contextId ?? null, fingerprint: context?.fingerprint ?? null, dataLocale: context?.dataLocale ?? null, keyboardLayout: context?.keyboardLayout ?? null, inputMethod: context?.inputMethod ?? null, hardwareProfileId: context?.hardwareProfileId ?? null });

export function buildPracticeAccuracyRecoveryPlan({ sessionId, context, target, targetSource = "manual", corpusBinding, baseIntervention, basePlanHash = null, neutralDescriptor = null } = {}) {
  if (!sessionId || !context?.contextId || !context?.fingerprint || !target?.entityType || !target?.entityKey) throw new TypeError("Accuracy & Recovery plan requires session, context, and one canonical target");
  const quotas = PRACTICE_ACCURACY_RECOVERY_PHASE_QUOTAS[target.entityType]; if (!quotas) throw new TypeError("Unsupported Accuracy & Recovery entity type");
  const phases = PRACTICE_ACCURACY_RECOVERY_PHASE_IDS.map((id, index) => freezeDeep({ id, ordinal: index + 1, label: PRACTICE_ACCURACY_RECOVERY_PHASE_LABELS[id], cue: PRACTICE_ACCURACY_RECOVERY_PHASE_CUES[id], opportunityQuota: quotas[id] }));
  const payload = JSON.stringify({ v: PRACTICE_ACCURACY_RECOVERY_VERSION, g: PRACTICE_ACCURACY_RECOVERY_GENERATOR_VERSION, p: PRACTICE_ACCURACY_RECOVERY_POLICY_VERSION, s: PRACTICE_ACCURACY_RECOVERY_SELECTION_VERSION, f: PRACTICE_ACCURACY_RECOVERY_FEEDBACK_VERSION, experiment: [PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_ID, PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_VERSION], sessionId, context: contextBinding(context), target, targetSource, corpusBinding, baseIntervention, basePlanHash, neutralDescriptor, quotas, cues: PRACTICE_ACCURACY_RECOVERY_PHASE_CUES });
  return freezeDeep({
    version: PRACTICE_ACCURACY_RECOVERY_VERSION,
    policyVersion: PRACTICE_ACCURACY_RECOVERY_POLICY_VERSION,
    generatorVersion: PRACTICE_ACCURACY_RECOVERY_GENERATOR_VERSION,
    selectionVersion: PRACTICE_ACCURACY_RECOVERY_SELECTION_VERSION,
    feedbackVersion: PRACTICE_ACCURACY_RECOVERY_FEEDBACK_VERSION,
    experimentId: PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_ID,
    experimentVersion: PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_VERSION,
    sessionId,
    language: "en",
    target: freezeDeep({ ...target }),
    targetSource,
    targetOpportunityBudget: quotas.total,
    partition: "training",
    evidenceRole: "training",
    contentPurpose: "training",
    resumable: false,
    correctionBehavior: "allow",
    completionMode: "content",
    abilityChannel: null,
    performanceMeasurementKind: null,
    retentionMeasurementKind: null,
    evaluationMeasurementKind: null,
    assessmentBinding: null,
    contextBinding: contextBinding(context),
    corpusBinding: freezeDeep({ ...(corpusBinding ?? {}) }),
    phases: Object.freeze(phases),
    baseIntervention,
    basePlanHash,
    neutralDescriptor: neutralDescriptor ? freezeDeep({ ...neutralDescriptor }) : null,
    repairFeedbackPolicy: freezeDeep({ version: PRACTICE_ACCURACY_RECOVERY_FEEDBACK_VERSION, displayDurationMs: 700, cooldownMs: 1000 }),
    contentDescriptor: freezeDeep({ type: "generated", generator: "accuracy-recovery", generatorVersion: PRACTICE_ACCURACY_RECOVERY_GENERATOR_VERSION }),
    planHash: hashPracticeContent(payload),
  });
}

export function createPracticeAccuracyRecoveryContentMetadata(plan, phaseRanges) {
  if (!plan?.planHash || plan.partition !== "training") throw new TypeError("Accuracy & Recovery metadata requires a training plan");
  return freezeDeep({
    partition: "training",
    contentPurpose: "training",
    corpusBinding: { ...plan.corpusBinding },
    language: plan.language,
    accuracyRecovery: {
      version: plan.version,
      policyVersion: plan.policyVersion,
      generatorVersion: plan.generatorVersion,
      selectionVersion: plan.selectionVersion,
      feedbackVersion: plan.feedbackVersion,
      planHash: plan.planHash,
      target: { ...plan.target },
      targetOpportunityBudget: plan.targetOpportunityBudget,
      targetSource: plan.targetSource,
      contextBinding: { ...plan.contextBinding },
      phaseRanges,
      repairFeedbackPolicy: { ...plan.repairFeedbackPolicy },
      resumable: false,
      completionMode: "content",
      learningPhaseBounds: { entryPhaseId: "baseline", exitPhaseId: "check" },
    },
  });
}
