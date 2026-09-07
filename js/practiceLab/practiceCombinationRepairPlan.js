import {
  PRACTICE_COMBINATION_REPAIR_EXPERIMENT_ID,
  PRACTICE_COMBINATION_REPAIR_EXPERIMENT_VERSION,
  PRACTICE_COMBINATION_REPAIR_GENERATOR_VERSION,
  PRACTICE_COMBINATION_REPAIR_PHASE_QUOTAS,
  PRACTICE_COMBINATION_REPAIR_PHASES,
  PRACTICE_COMBINATION_REPAIR_SELECTION_VERSION,
  PRACTICE_COMBINATION_REPAIR_VERSION,
} from "./practiceCombinationRepairConstants.js";
import { PRACTICE_COMBINATION_REPAIR_POLICY_V1 } from "./practiceCombinationRepairPolicy.js";
import {
  normalizePracticeCombinationRepairTarget,
  stablePracticeCombinationRepairPlanPayload,
  validatePracticeCombinationRepairPlan,
} from "./practiceCombinationRepairValidation.js";
import { hashPracticeContent } from "./practiceIds.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function unitTargetCap(phaseId, policy) {
  return phaseId === "acquire"
    ? policy.content.acquireMaxTargetOpportunitiesPerUnit
    : policy.content.maxTargetOpportunitiesPerUnit;
}

function normalizeUnit(unit, phaseId, policy) {
  if (!unit || typeof unit !== "object") throw new TypeError(`Combination Repair ${phaseId} unit is invalid`);
  const targetOpportunityCount = Number(unit.targetOpportunityCount);
  const cap = unitTargetCap(phaseId, policy);
  if (!Number.isInteger(targetOpportunityCount) || targetOpportunityCount < 0 || targetOpportunityCount > cap) throw new TypeError(`Combination Repair ${phaseId} unit exceeds target opportunity cap`);
  if (unit.partition !== "training") throw new TypeError("Combination Repair content must come from the training partition");
  if (!unit.contentId || !unit.contentHash || !unit.familyId) throw new TypeError("Combination Repair unit requires content/family binding");
  return freezeDeep({
    contentId: String(unit.contentId),
    contentHash: String(unit.contentHash),
    familyId: String(unit.familyId),
    partition: "training",
    targetOpportunityCount,
    typabilityScore: Number.isFinite(unit.typabilityScore) ? Number(unit.typabilityScore) : null,
    difficultyFeatures: unit.difficultyFeatures && typeof unit.difficultyFeatures === "object"
      ? Object.fromEntries(Object.entries(unit.difficultyFeatures).filter(([, value]) => value == null || Number.isFinite(value)))
      : {},
  });
}

function buildPhase(phase, ordinal, entityType, suppliedUnits, policy) {
  const units = (suppliedUnits || []).map((unit) => normalizeUnit(unit, phase.id, policy));
  const targetOpportunityCount = units.reduce((sum, unit) => sum + unit.targetOpportunityCount, 0);
  const opportunityQuota = PRACTICE_COMBINATION_REPAIR_PHASE_QUOTAS[entityType][phase.id];
  if (targetOpportunityCount !== opportunityQuota) throw new RangeError(`Combination Repair ${phase.id} requires exactly ${opportunityQuota} target opportunities`);
  return freezeDeep({
    id: phase.id,
    ordinal,
    label: phase.label,
    cue: phase.cue,
    opportunityQuota,
    targetOpportunityCount,
    units,
  });
}

export function buildPracticeCombinationRepairPlan({
  language = "en",
  entityType,
  entityKey,
  targetSource = "manual",
  corpusBinding,
  phaseUnits = {},
  policy = PRACTICE_COMBINATION_REPAIR_POLICY_V1,
} = {}) {
  const target = normalizePracticeCombinationRepairTarget({ entityType, entityKey, language });
  if (!target) throw new TypeError("Combination Repair requires one canonical lowercase bigram or trigram target");
  if (!corpusBinding || !corpusBinding.corpusId || !Number.isInteger(corpusBinding.corpusVersion) || !Number.isInteger(corpusBinding.indexVersion)) throw new TypeError("Combination Repair requires corpus/index binding");
  const phases = PRACTICE_COMBINATION_REPAIR_PHASES.map((phase, index) => buildPhase(phase, index + 1, target.entityType, phaseUnits[phase.id], policy));
  const plan = {
    version: PRACTICE_COMBINATION_REPAIR_VERSION,
    policyVersion: policy.version,
    generatorVersion: PRACTICE_COMBINATION_REPAIR_GENERATOR_VERSION,
    selectionVersion: PRACTICE_COMBINATION_REPAIR_SELECTION_VERSION,
    experimentId: PRACTICE_COMBINATION_REPAIR_EXPERIMENT_ID,
    experimentVersion: PRACTICE_COMBINATION_REPAIR_EXPERIMENT_VERSION,
    language,
    target,
    targetSource,
    partition: "training",
    corpusBinding: {
      corpusId: String(corpusBinding.corpusId),
      corpusVersion: corpusBinding.corpusVersion,
      indexVersion: corpusBinding.indexVersion,
      manifestHash: corpusBinding.manifestHash ? String(corpusBinding.manifestHash) : null,
    },
    phases,
  };
  plan.planHash = hashPracticeContent(stablePracticeCombinationRepairPlanPayload(plan));
  const validation = validatePracticeCombinationRepairPlan(plan);
  if (!validation.valid) {
    const error = new TypeError(`Combination Repair plan is invalid: ${validation.errors[0]?.code || "UNKNOWN"}`);
    error.code = "PRACTICE_COMBINATION_REPAIR_PLAN_INVALID";
    error.details = validation.errors;
    throw error;
  }
  return freezeDeep(plan);
}

export function createPracticeCombinationRepairContentPlanMetadata(plan) {
  const validation = validatePracticeCombinationRepairPlan(plan);
  if (!validation.valid) throw new TypeError("Combination Repair content metadata requires a valid frozen plan");
  return freezeDeep({
    combinationRepair: {
      version: plan.version,
      policyVersion: plan.policyVersion,
      generatorVersion: plan.generatorVersion,
      selectionVersion: plan.selectionVersion,
      planHash: plan.planHash,
      targetSource: plan.targetSource,
      phaseSequence: plan.phases.map((phase) => ({ id: phase.id, ordinal: phase.ordinal, cue: phase.cue, opportunityQuota: phase.opportunityQuota })),
      totalTargetOpportunities: PRACTICE_COMBINATION_REPAIR_PHASE_QUOTAS[plan.target.entityType].total,
      resumable: false,
      completionMode: "content",
    },
    targetEntities: [{ entityType: plan.target.entityType, entityKey: plan.target.entityKey, directTarget: true }],
    partition: "training",
    corpusBinding: { ...plan.corpusBinding },
  });
}

export function getPracticeCombinationRepairPhaseForOpportunity(plan, opportunityOrdinal) {
  if (!Number.isInteger(opportunityOrdinal) || opportunityOrdinal < 1) return null;
  let cursor = 0;
  for (const phase of plan?.phases || []) {
    cursor += phase.opportunityQuota;
    if (opportunityOrdinal <= cursor) return phase;
  }
  return null;
}
