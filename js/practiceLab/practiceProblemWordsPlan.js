import { hashPracticeContent } from "./practiceIds.js";
import {
  PRACTICE_PROBLEM_WORDS_GENERATOR_VERSION,
  PRACTICE_PROBLEM_WORDS_PHASE_CUES,
  PRACTICE_PROBLEM_WORDS_PHASE_IDS,
  PRACTICE_PROBLEM_WORDS_PHASE_LABELS,
  PRACTICE_PROBLEM_WORDS_PHASE_QUOTAS,
  PRACTICE_PROBLEM_WORDS_POLICY_VERSION,
  PRACTICE_PROBLEM_WORDS_VERSION,
} from "./practiceProblemWordsConstants.js";
import { validatePracticeProblemWordsPlan } from "./practiceProblemWordsValidation.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const contextBinding = (context) => Object.freeze({
  contextId: context?.contextId ?? null,
  fingerprint: context?.fingerprint ?? null,
  dataLocale: context?.dataLocale ?? null,
  keyboardLayout: context?.keyboardLayout ?? null,
  inputMethod: context?.inputMethod ?? null,
  hardwareProfileId: context?.hardwareProfileId ?? null,
});
function unitIdentity(unit) {
  return [unit?.candidateId, unit?.generatedUnitId, unit?.contentId, unit?.contentHash, ...(unit?.wordKeys ?? []), ...(unit?.sourceContentIds ?? [])].filter(Boolean).join(":");
}

export function buildPracticeProblemWordsPlan({
  sessionId,
  context,
  language = "en",
  entityKey,
  targetSource = "manual",
  corpusBinding,
  phaseUnits,
  contextCoveragePlan = null,
  probeMatch = null,
} = {}) {
  if (!sessionId || !entityKey || !context?.contextId || !context?.fingerprint) throw new TypeError("Problem Words plan requires session, target, and complete Practice context identity");
  const phases = PRACTICE_PROBLEM_WORDS_PHASE_IDS.map((id, index) => freezeDeep({
    id,
    ordinal: index + 1,
    label: PRACTICE_PROBLEM_WORDS_PHASE_LABELS[id],
    cue: PRACTICE_PROBLEM_WORDS_PHASE_CUES[id],
    opportunityQuota: PRACTICE_PROBLEM_WORDS_PHASE_QUOTAS[id],
    units: Object.freeze([...(phaseUnits?.[id] ?? [])]),
  }));
  const hashPayload = JSON.stringify({
    v: PRACTICE_PROBLEM_WORDS_VERSION,
    g: PRACTICE_PROBLEM_WORDS_GENERATOR_VERSION,
    p: PRACTICE_PROBLEM_WORDS_POLICY_VERSION,
    sessionId,
    context: contextBinding(context),
    target: entityKey,
    targetSource,
    corpusBinding,
    quotas: PRACTICE_PROBLEM_WORDS_PHASE_QUOTAS,
    cues: PRACTICE_PROBLEM_WORDS_PHASE_CUES,
    phases: phases.map((phase) => ({ id: phase.id, units: phase.units.map(unitIdentity) })),
    probeMatch,
  });
  const plan = {
    version: PRACTICE_PROBLEM_WORDS_VERSION,
    generatorVersion: PRACTICE_PROBLEM_WORDS_GENERATOR_VERSION,
    policyVersion: PRACTICE_PROBLEM_WORDS_POLICY_VERSION,
    sessionId,
    language,
    target: { entityType: "word", entityKey },
    targetSource,
    targetOpportunityBudget: PRACTICE_PROBLEM_WORDS_PHASE_QUOTAS.total,
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
    contextCoveragePlan: contextCoveragePlan ? freezeDeep({ ...contextCoveragePlan }) : null,
    probeMatch: probeMatch ? freezeDeep({ ...probeMatch }) : null,
    contentDescriptor: freezeDeep({ type: "generated", generator: "problem-words", generatorVersion: PRACTICE_PROBLEM_WORDS_GENERATOR_VERSION }),
    planHash: hashPracticeContent(hashPayload),
  };
  freezeDeep(plan);
  const validation = validatePracticeProblemWordsPlan(plan);
  if (!validation.valid) throw new TypeError(`Invalid Problem Words plan: ${validation.errors.join(", ")}`);
  return plan;
}

export function createPracticeProblemWordsContentPlanMetadata(plan) {
  const validation = validatePracticeProblemWordsPlan(plan);
  if (!validation.valid) throw new TypeError("Problem Words content metadata requires a valid immutable plan");
  return freezeDeep({
    partition: "training",
    contentPurpose: "training",
    corpusBinding: { ...plan.corpusBinding },
    targetEntities: [{ entityType: "word", entityKey: plan.target.entityKey, directTarget: true }],
    problemWords: {
      version: plan.version,
      generatorVersion: plan.generatorVersion,
      policyVersion: plan.policyVersion,
      planHash: plan.planHash,
      targetOpportunityBudget: plan.targetOpportunityBudget,
      contextBinding: { ...plan.contextBinding },
      contextCoveragePlan: plan.contextCoveragePlan,
      resumable: false,
      completionMode: "content",
      learningPhaseBounds: {
        entryPhaseId: "entry-probe",
        exitPhaseId: "exit-probe",
      },
    },
  });
}
