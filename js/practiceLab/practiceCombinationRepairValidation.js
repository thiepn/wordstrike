import {
  PRACTICE_COMBINATION_REPAIR_ENTITY_TYPES,
  PRACTICE_COMBINATION_REPAIR_ERRORS,
  PRACTICE_COMBINATION_REPAIR_PHASE_QUOTAS,
  PRACTICE_COMBINATION_REPAIR_PHASES,
  PRACTICE_COMBINATION_REPAIR_TARGET_SOURCES,
  PRACTICE_COMBINATION_REPAIR_VERSION,
} from "./practiceCombinationRepairConstants.js";
import { hashPracticeContent } from "./practiceIds.js";

const LETTER = /^\p{L}$/u;
const FORBIDDEN_PERSISTED_KEYS = new Set(["text", "content", "rawText", "typedText", "events", "trace", "rawTrace", "customText"]);

export function normalizePracticeCombinationRepairTarget({ entityType, entityKey, language = "en" } = {}) {
  if (!PRACTICE_COMBINATION_REPAIR_ENTITY_TYPES.includes(entityType) || typeof entityKey !== "string") return null;
  let normalized;
  try { normalized = entityKey.normalize("NFC").toLocaleLowerCase(language || undefined); }
  catch { normalized = entityKey.normalize("NFC").toLowerCase(); }
  const graphemes = Array.from(normalized);
  const expectedLength = entityType === "bigram" ? 2 : 3;
  if (graphemes.length !== expectedLength || !graphemes.every((value) => LETTER.test(value))) return null;
  if (entityKey.normalize("NFC") !== normalized) return null;
  return Object.freeze({ entityType, entityKey: normalized });
}

export function createPracticeCombinationRepairError(code, message, details = null) {
  if (!Object.values(PRACTICE_COMBINATION_REPAIR_ERRORS).includes(code)) throw new TypeError(`Unknown Combination Repair error: ${code}`);
  const error = new Error(message || code);
  error.code = code;
  error.details = details;
  return error;
}

function findForbiddenKey(value, path = "plan") {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = findForbiddenKey(value[i], `${path}.${i}`);
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

export function stablePracticeCombinationRepairPlanPayload(plan) {
  return JSON.stringify({
    version: plan.version,
    policyVersion: plan.policyVersion,
    generatorVersion: plan.generatorVersion,
    selectionVersion: plan.selectionVersion,
    experimentId: plan.experimentId,
    experimentVersion: plan.experimentVersion,
    language: plan.language,
    target: plan.target,
    targetSource: plan.targetSource,
    partition: plan.partition,
    corpusBinding: plan.corpusBinding,
    phases: plan.phases,
  });
}

export function validatePracticeCombinationRepairPlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return { valid: false, errors: [{ path: "plan", code: "TYPE" }] };
  if (plan.version !== PRACTICE_COMBINATION_REPAIR_VERSION) errors.push({ path: "version", code: "VERSION" });
  const target = normalizePracticeCombinationRepairTarget({ ...plan.target, language: plan.language });
  if (!target || target.entityKey !== plan.target?.entityKey) errors.push({ path: "target", code: PRACTICE_COMBINATION_REPAIR_ERRORS.UNSUPPORTED_COMBINATION_TARGET });
  if (!PRACTICE_COMBINATION_REPAIR_TARGET_SOURCES.includes(plan.targetSource)) errors.push({ path: "targetSource", code: "TARGET_SOURCE" });
  if (plan.partition !== "training") errors.push({ path: "partition", code: "TRAINING_ONLY" });
  if (!plan.corpusBinding || typeof plan.corpusBinding !== "object" || !plan.corpusBinding.corpusId || !Number.isInteger(plan.corpusBinding.corpusVersion) || !Number.isInteger(plan.corpusBinding.indexVersion)) errors.push({ path: "corpusBinding", code: "CORPUS_BINDING" });
  const canonicalPhases = PRACTICE_COMBINATION_REPAIR_PHASES;
  if (!Array.isArray(plan.phases) || plan.phases.length !== canonicalPhases.length) errors.push({ path: "phases", code: "PHASE_COUNT" });
  for (let index = 0; index < Math.min(plan.phases?.length ?? 0, canonicalPhases.length); index += 1) {
    const expected = canonicalPhases[index];
    const actual = plan.phases[index];
    if (actual.id !== expected.id || actual.label !== expected.label || actual.cue !== expected.cue || actual.ordinal !== index + 1) errors.push({ path: `phases.${index}`, code: "PHASE_SEQUENCE" });
    const quota = PRACTICE_COMBINATION_REPAIR_PHASE_QUOTAS[plan.target?.entityType]?.[expected.id];
    if (actual.opportunityQuota !== quota || actual.targetOpportunityCount !== quota) errors.push({ path: `phases.${index}.targetOpportunityCount`, code: "PHASE_QUOTA" });
    if (!Array.isArray(actual.units) || !actual.units.length) errors.push({ path: `phases.${index}.units`, code: "CONTENT_REQUIRED" });
    for (const unit of actual.units || []) {
      if (unit.partition !== "training") errors.push({ path: `phases.${index}.units.partition`, code: "TRAINING_ONLY" });
      if (!unit.contentId || !unit.contentHash || !unit.familyId || !Number.isInteger(unit.targetOpportunityCount) || unit.targetOpportunityCount < 0) errors.push({ path: `phases.${index}.units`, code: "UNIT_BINDING" });
    }
  }
  const total = (plan.phases || []).reduce((sum, phase) => sum + (Number(phase.targetOpportunityCount) || 0), 0);
  const expectedTotal = PRACTICE_COMBINATION_REPAIR_PHASE_QUOTAS[plan.target?.entityType]?.total;
  if (total !== expectedTotal) errors.push({ path: "phases", code: "TOTAL_QUOTA" });
  const entryFamilies = new Set(plan.phases?.[0]?.units?.map((unit) => unit.familyId) || []);
  const exitFamilies = new Set(plan.phases?.[4]?.units?.map((unit) => unit.familyId) || []);
  if ([...entryFamilies].some((familyId) => exitFamilies.has(familyId))) errors.push({ path: "phases", code: "PROBE_FAMILY_OVERLAP" });
  const forbiddenPath = findForbiddenKey(plan);
  if (forbiddenPath) errors.push({ path: forbiddenPath, code: "RAW_CONTENT_FORBIDDEN" });
  if (plan.planHash !== hashPracticeContent(stablePracticeCombinationRepairPlanPayload(plan))) errors.push({ path: "planHash", code: "HASH_MISMATCH" });
  return { valid: errors.length === 0, errors };
}
