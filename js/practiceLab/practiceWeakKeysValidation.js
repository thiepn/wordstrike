import {
  PRACTICE_WEAK_KEYS_EXPERIMENT_ID,
  PRACTICE_WEAK_KEYS_EXPERIMENT_VERSION,
  PRACTICE_WEAK_KEYS_GENERATOR_VERSION,
  PRACTICE_WEAK_KEYS_PHASE_QUOTAS,
  PRACTICE_WEAK_KEYS_PHASES,
  PRACTICE_WEAK_KEYS_SELECTION_VERSION,
  PRACTICE_WEAK_KEYS_TARGET_SOURCES,
  PRACTICE_WEAK_KEYS_VERSION,
} from "./practiceWeakKeysConstants.js";
import { hashPracticeContent } from "./practiceIds.js";
import { normalizePracticeWeakKeyTarget } from "./practiceWeakKeysTargets.js";

const FORBIDDEN_PERSISTED_KEYS = new Set([
  "text", "rawText", "typedText", "events", "trace", "rawTrace", "customText", "mistypedText",
]);

function findForbiddenKey(value, path = "plan") {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenKey(value[index], `${path}.${index}`);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PERSISTED_KEYS.has(key)) return `${path}.${key}`;
    const found = findForbiddenKey(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

function familyIds(unit) {
  if (unit?.familyId) return [unit.familyId];
  return Array.isArray(unit?.sourceFamilyIds) ? unit.sourceFamilyIds : [];
}

function contentIds(unit) {
  if (unit?.contentId) return [unit.contentId];
  return Array.isArray(unit?.sourceContentIds) ? unit.sourceContentIds : [];
}

function stableUnit(unit) {
  if (unit.kind === "natural") return {
    kind: unit.kind,
    candidateId: unit.candidateId,
    compositionMode: unit.compositionMode,
    contentId: unit.contentId,
    contentHash: unit.contentHash,
    familyId: unit.familyId,
    targetOpportunityCount: unit.targetOpportunityCount,
  };
  return {
    kind: unit.kind,
    candidateId: unit.candidateId,
    compositionMode: unit.compositionMode,
    generatedUnitId: unit.generatedUnitId,
    wordKeys: unit.wordKeys,
    sourceContentIds: unit.sourceContentIds,
    sourceContentHashes: unit.sourceContentHashes,
    sourceFamilyIds: unit.sourceFamilyIds,
    targetOpportunityCount: unit.targetOpportunityCount,
  };
}

export function stablePracticeWeakKeysPlanPayload(plan) {
  return JSON.stringify({
    version: plan.version,
    policyVersion: plan.policyVersion,
    generatorVersion: plan.generatorVersion,
    selectionVersion: plan.selectionVersion,
    experimentId: plan.experimentId,
    experimentVersion: plan.experimentVersion,
    sessionId: plan.sessionId,
    language: plan.language,
    target: plan.target,
    targetSource: plan.targetSource,
    targetOpportunityBudget: plan.targetOpportunityBudget,
    partition: plan.partition,
    corpusBinding: plan.corpusBinding,
    phases: (plan.phases ?? []).map((phase) => ({
      id: phase.id,
      ordinal: phase.ordinal,
      label: phase.label,
      cue: phase.cue,
      opportunityQuota: phase.opportunityQuota,
      units: (phase.units ?? []).map(stableUnit),
    })),
    contextCoveragePlan: plan.contextCoveragePlan,
    contentDescriptor: plan.contentDescriptor,
  });
}

export function validatePracticeWeakKeysPlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return { valid: false, errors: [{ path: "plan", code: "TYPE" }] };
  if (plan.version !== PRACTICE_WEAK_KEYS_VERSION) errors.push({ path: "version", code: "VERSION" });
  if (plan.generatorVersion !== PRACTICE_WEAK_KEYS_GENERATOR_VERSION) errors.push({ path: "generatorVersion", code: "VERSION" });
  if (plan.selectionVersion !== PRACTICE_WEAK_KEYS_SELECTION_VERSION) errors.push({ path: "selectionVersion", code: "VERSION" });
  if (plan.experimentId !== PRACTICE_WEAK_KEYS_EXPERIMENT_ID || plan.experimentVersion !== PRACTICE_WEAK_KEYS_EXPERIMENT_VERSION) errors.push({ path: "experimentId", code: "EXPERIMENT" });
  if (typeof plan.sessionId !== "string" || !plan.sessionId) errors.push({ path: "sessionId", code: "SESSION_ID" });
  const target = normalizePracticeWeakKeyTarget({ entityType: plan.target?.entityType, entityKey: plan.target?.entityKey, language: plan.language });
  if (!target || target.entityKey !== plan.target?.entityKey) errors.push({ path: "target", code: "UNSUPPORTED_KEY_TARGET" });
  if (!PRACTICE_WEAK_KEYS_TARGET_SOURCES.includes(plan.targetSource)) errors.push({ path: "targetSource", code: "TARGET_SOURCE" });
  if (plan.targetOpportunityBudget !== 80) errors.push({ path: "targetOpportunityBudget", code: "TOTAL_QUOTA" });
  if (plan.partition !== "training") errors.push({ path: "partition", code: "TRAINING_ONLY" });
  if (!plan.corpusBinding?.corpusId || !Number.isInteger(plan.corpusBinding?.corpusVersion) || !Number.isInteger(plan.corpusBinding?.indexVersion)) errors.push({ path: "corpusBinding", code: "CORPUS_BINDING" });
  if (plan.contentDescriptor?.type !== "generated" || plan.contentDescriptor?.generator !== "weak-keys" || plan.contentDescriptor?.generatorVersion !== PRACTICE_WEAK_KEYS_GENERATOR_VERSION) errors.push({ path: "contentDescriptor", code: "CONTENT_DESCRIPTOR" });

  if (!Array.isArray(plan.phases) || plan.phases.length !== PRACTICE_WEAK_KEYS_PHASES.length) errors.push({ path: "phases", code: "PHASE_COUNT" });
  for (let index = 0; index < Math.min(plan.phases?.length ?? 0, PRACTICE_WEAK_KEYS_PHASES.length); index += 1) {
    const expected = PRACTICE_WEAK_KEYS_PHASES[index];
    const actual = plan.phases[index];
    if (actual.id !== expected.id || actual.label !== expected.label || actual.cue !== expected.cue || actual.ordinal !== index + 1) errors.push({ path: `phases.${index}`, code: "PHASE_SEQUENCE" });
    const quota = PRACTICE_WEAK_KEYS_PHASE_QUOTAS[expected.id];
    if (actual.opportunityQuota !== quota || actual.targetOpportunityCount !== quota) errors.push({ path: `phases.${index}.targetOpportunityCount`, code: "PHASE_QUOTA" });
    if (!Array.isArray(actual.units) || !actual.units.length) errors.push({ path: `phases.${index}.units`, code: "CONTENT_REQUIRED" });
    for (const unit of actual.units ?? []) {
      if (unit.partition !== "training") errors.push({ path: `phases.${index}.units.partition`, code: "TRAINING_ONLY" });
      if (!Number.isInteger(unit.targetOpportunityCount) || unit.targetOpportunityCount < 0) errors.push({ path: `phases.${index}.units.targetOpportunityCount`, code: "UNIT_QUOTA" });
      if (!unit.candidateId || !["natural", "generated-word-sequence"].includes(unit.kind)) errors.push({ path: `phases.${index}.units`, code: "UNIT_BINDING" });
      if (unit.kind === "natural" && (!unit.contentId || !unit.contentHash || !unit.familyId)) errors.push({ path: `phases.${index}.units`, code: "NATURAL_BINDING" });
      if (unit.kind === "generated-word-sequence" && (!unit.generatedUnitId || !Array.isArray(unit.wordKeys) || !unit.wordKeys.length)) errors.push({ path: `phases.${index}.units`, code: "GENERATED_BINDING" });
    }
  }
  const total = (plan.phases ?? []).reduce((sum, phase) => sum + Number(phase.targetOpportunityCount || 0), 0);
  if (total !== PRACTICE_WEAK_KEYS_PHASE_QUOTAS.total) errors.push({ path: "phases", code: "TOTAL_QUOTA" });

  const entry = plan.phases?.[0];
  const exit = plan.phases?.[4];
  const entryFamilies = new Set((entry?.units ?? []).flatMap(familyIds));
  const exitFamilies = new Set((exit?.units ?? []).flatMap(familyIds));
  if ([...entryFamilies].some((id) => exitFamilies.has(id))) errors.push({ path: "phases", code: "PROBE_FAMILY_OVERLAP" });
  const entryContents = new Set((entry?.units ?? []).flatMap(contentIds));
  const exitContents = new Set((exit?.units ?? []).flatMap(contentIds));
  if ([...entryContents].some((id) => exitContents.has(id))) errors.push({ path: "phases", code: "PROBE_CONTENT_OVERLAP" });
  const entryMode = entry?.units?.[0]?.compositionMode ?? null;
  const exitMode = exit?.units?.[0]?.compositionMode ?? null;
  if (!entryMode || entryMode !== exitMode) errors.push({ path: "phases", code: "PROBE_COMPOSITION_MISMATCH" });

  const forbidden = findForbiddenKey(plan);
  if (forbidden) errors.push({ path: forbidden, code: "RAW_CONTENT_FORBIDDEN" });
  if (plan.planHash !== hashPracticeContent(stablePracticeWeakKeysPlanPayload(plan))) errors.push({ path: "planHash", code: "HASH_MISMATCH" });
  return { valid: errors.length === 0, errors };
}
