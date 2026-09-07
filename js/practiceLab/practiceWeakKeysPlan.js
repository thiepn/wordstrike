import {
  PRACTICE_WEAK_KEYS_EXPERIMENT_ID,
  PRACTICE_WEAK_KEYS_EXPERIMENT_VERSION,
  PRACTICE_WEAK_KEYS_GENERATOR_VERSION,
  PRACTICE_WEAK_KEYS_PHASE_QUOTAS,
  PRACTICE_WEAK_KEYS_PHASES,
  PRACTICE_WEAK_KEYS_SELECTION_VERSION,
  PRACTICE_WEAK_KEYS_VERSION,
} from "./practiceWeakKeysConstants.js";
import { PRACTICE_WEAK_KEYS_POLICY_V1 } from "./practiceWeakKeysPolicy.js";
import { hashPracticeContent } from "./practiceIds.js";
import { normalizePracticeWeakKeyTarget } from "./practiceWeakKeysTargets.js";
import { stablePracticeWeakKeysPlanPayload, validatePracticeWeakKeysPlan } from "./practiceWeakKeysValidation.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const boundedStrings = (values, max = 32) => Object.freeze([...(new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && value)))].sort().slice(0, max));
const compactCounts = (counts = {}) => Object.freeze(Object.fromEntries(Object.entries(counts).filter(([, value]) => Number.isFinite(value) && value >= 0).map(([key, value]) => [key, Number(value)])));
const compactFeatures = (features = {}) => Object.freeze(Object.fromEntries(Object.entries(features).filter(([, value]) => value == null || Number.isFinite(value))));

function normalizeUnit(unit, phaseId, policy) {
  if (!unit || typeof unit !== "object") throw new TypeError(`Weak Keys ${phaseId} unit is invalid`);
  const targetOpportunityCount = Number(unit.targetOpportunityCount);
  if (!Number.isInteger(targetOpportunityCount) || targetOpportunityCount < 0 || targetOpportunityCount > policy.content.generatedTargetUnitOpportunityCap) throw new TypeError(`Weak Keys ${phaseId} unit target count is invalid`);
  if (phaseId !== "interleave" && targetOpportunityCount === 0) throw new TypeError(`Weak Keys ${phaseId} cannot contain neutral units`);
  const common = {
    candidateId: String(unit.candidateId || unit.generatedUnitId || unit.contentId || ""),
    kind: unit.kind,
    compositionMode: String(unit.compositionMode || ""),
    partition: "training",
    targetOpportunityCount,
    lexicalKeys: boundedStrings(unit.lexicalKeys ?? unit.wordKeys, 32),
    positionCounts: compactCounts(unit.positionCounts),
    geometryCounts: compactCounts(unit.geometryCounts),
    precedingContextCount: Number.isInteger(unit.precedingContextCount) ? unit.precedingContextCount : 0,
    followingContextCount: Number.isInteger(unit.followingContextCount) ? unit.followingContextCount : 0,
    typabilityScore: Number.isFinite(unit.typabilityScore) ? Number(unit.typabilityScore) : null,
    typabilityPercentile: Number.isFinite(unit.typabilityPercentile) ? Number(unit.typabilityPercentile) : null,
    difficultyFeatures: compactFeatures(unit.difficultyFeatures),
  };
  if (!common.candidateId || !["natural", "generated-word-sequence"].includes(common.kind)) throw new TypeError("Weak Keys unit identity is invalid");
  if (common.kind === "natural") {
    if (!unit.contentId || !unit.contentHash || !unit.familyId) throw new TypeError("Weak Keys natural unit requires content/family binding");
    return freezeDeep({
      ...common,
      contentId: String(unit.contentId),
      contentHash: String(unit.contentHash),
      familyId: String(unit.familyId),
    });
  }
  if (!unit.generatedUnitId || !Array.isArray(unit.wordKeys) || !unit.wordKeys.length) throw new TypeError("Weak Keys generated unit requires canonical word IDs");
  return freezeDeep({
    ...common,
    generatedUnitId: String(unit.generatedUnitId),
    wordKeys: boundedStrings(unit.wordKeys, 32),
    sourceContentIds: boundedStrings(unit.sourceContentIds, 32),
    sourceContentHashes: boundedStrings(unit.sourceContentHashes, 32),
    sourceFamilyIds: boundedStrings(unit.sourceFamilyIds, 16),
  });
}

function buildPhase(phase, ordinal, suppliedUnits, policy, opportunityStart) {
  const units = Object.freeze((suppliedUnits ?? []).map((unit) => normalizeUnit(unit, phase.id, policy)));
  const targetOpportunityCount = units.reduce((sum, unit) => sum + unit.targetOpportunityCount, 0);
  const opportunityQuota = PRACTICE_WEAK_KEYS_PHASE_QUOTAS[phase.id];
  if (targetOpportunityCount !== opportunityQuota) throw new RangeError(`Weak Keys ${phase.id} requires exactly ${opportunityQuota} target opportunities`);
  return freezeDeep({
    id: phase.id,
    ordinal,
    label: phase.label,
    cue: phase.cue,
    opportunityQuota,
    targetOpportunityCount,
    targetOpportunityStart: opportunityStart,
    targetOpportunityEnd: opportunityStart + opportunityQuota,
    units,
  });
}

export function buildPracticeWeakKeysPlan({
  sessionId,
  context = null,
  language = context?.dataLocale ?? "en",
  entityKey,
  targetSource = "manual",
  corpusBinding,
  phaseUnits = {},
  contextCoveragePlan = {},
  policy = PRACTICE_WEAK_KEYS_POLICY_V1,
} = {}) {
  const target = normalizePracticeWeakKeyTarget({ entityType: "key", entityKey, language });
  if (!target) throw new TypeError("Weak Keys requires one canonical English lowercase letter target");
  if (typeof sessionId !== "string" || !sessionId) throw new TypeError("Weak Keys plan requires sessionId");
  if (!corpusBinding?.corpusId || !Number.isInteger(corpusBinding?.corpusVersion) || !Number.isInteger(corpusBinding?.indexVersion)) throw new TypeError("Weak Keys requires corpus/index binding");
  let opportunityCursor = 0;
  const phases = PRACTICE_WEAK_KEYS_PHASES.map((phase, index) => {
    const built = buildPhase(phase, index + 1, phaseUnits[phase.id], policy, opportunityCursor);
    opportunityCursor += built.opportunityQuota;
    return built;
  });
  const plan = {
    version: PRACTICE_WEAK_KEYS_VERSION,
    policyVersion: policy.version,
    generatorVersion: PRACTICE_WEAK_KEYS_GENERATOR_VERSION,
    selectionVersion: PRACTICE_WEAK_KEYS_SELECTION_VERSION,
    experimentId: PRACTICE_WEAK_KEYS_EXPERIMENT_ID,
    experimentVersion: PRACTICE_WEAK_KEYS_EXPERIMENT_VERSION,
    sessionId,
    language: String(language).trim().replace(/_/g, "-").toLowerCase().split("-")[0],
    target,
    targetSource,
    targetOpportunityBudget: PRACTICE_WEAK_KEYS_PHASE_QUOTAS.total,
    partition: "training",
    corpusBinding: {
      corpusId: String(corpusBinding.corpusId),
      corpusVersion: corpusBinding.corpusVersion,
      indexVersion: corpusBinding.indexVersion,
      manifestHash: corpusBinding.manifestHash ? String(corpusBinding.manifestHash) : null,
    },
    phases,
    phaseBoundaries: phases.map((phase) => ({
      id: phase.id,
      ordinal: phase.ordinal,
      targetOpportunityStart: phase.targetOpportunityStart,
      targetOpportunityEnd: phase.targetOpportunityEnd,
    })),
    contextCoveragePlan: freezeDeep({ ...contextCoveragePlan }),
    contentDescriptor: {
      type: "generated",
      generator: "weak-keys",
      generatorVersion: PRACTICE_WEAK_KEYS_GENERATOR_VERSION,
    },
  };
  plan.planHash = hashPracticeContent(stablePracticeWeakKeysPlanPayload(plan));
  const validation = validatePracticeWeakKeysPlan(plan);
  if (!validation.valid) {
    const error = new TypeError(`Weak Keys plan is invalid: ${validation.errors[0]?.code || "UNKNOWN"}`);
    error.code = "PRACTICE_WEAK_KEYS_PLAN_INVALID";
    error.details = validation.errors;
    throw error;
  }
  return freezeDeep(plan);
}

export function createPracticeWeakKeysContentPlanMetadata(plan) {
  const validation = validatePracticeWeakKeysPlan(plan);
  if (!validation.valid) throw new TypeError("Weak Keys content metadata requires a valid immutable plan");
  return freezeDeep({
    weakKeys: {
      version: plan.version,
      policyVersion: plan.policyVersion,
      generatorVersion: plan.generatorVersion,
      selectionVersion: plan.selectionVersion,
      planHash: plan.planHash,
      targetSource: plan.targetSource,
      targetOpportunityBudget: plan.targetOpportunityBudget,
      phaseSequence: plan.phases.map((phase) => ({ id: phase.id, ordinal: phase.ordinal, cue: phase.cue, opportunityQuota: phase.opportunityQuota })),
      contextCoveragePlan: plan.contextCoveragePlan,
      resumable: false,
      completionMode: "content",
    },
    targetEntities: [{ entityType: "key", entityKey: plan.target.entityKey, directTarget: true }],
    partition: "training",
    corpusBinding: { ...plan.corpusBinding },
    contentDescriptor: { ...plan.contentDescriptor },
  });
}
