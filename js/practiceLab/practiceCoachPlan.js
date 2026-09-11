import { PRACTICE_LIMITS, PRACTICE_RECORD_VERSIONS } from "./practiceConstants.js";
import {
  PRACTICE_COACH_BLOCK_KINDS,
  PRACTICE_COACH_BLOCK_STATUSES,
  PRACTICE_COACH_BLOCK_VERSION,
  PRACTICE_COACH_PLAN_STATUSES,
  PRACTICE_COACH_PLAN_VERSION,
  PRACTICE_COACH_PLANNER_VERSION,
  PRACTICE_COACH_POLICY_VERSION,
} from "./practiceCoachConstants.js";
import {
  PRACTICE_COACH_PERSONALIZATION_POLICY_VERSION,
  PRACTICE_COACH_PERSONALIZATION_VERSION,
  PRACTICE_COACH_TREATMENT_OPTIONS_VERSION,
} from "./practiceCoachPersonalizationConstants.js";
import { PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION } from "./practiceTreatmentConstants.js";
import { createPracticeCoachPlanId, hashPracticeContent, isPracticeId } from "./practiceIds.js";
import { isValidPracticeDayKey, isValidPracticeUtcIso } from "./practiceTime.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const plain = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const byteSize = (value) => { try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; } catch { return Infinity; } };

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.keys(value).sort().reduce((out, key) => { out[key] = canonical(value[key]); return out; }, {});
  return value;
}

export function createPracticeCoachFingerprint(value) {
  return hashPracticeContent(JSON.stringify(canonical(value ?? null)));
}

export function isPracticeCoachBlockTerminal(status) {
  return ["completed", "skipped", "blocked", "invalid"].includes(status);
}

export function calculatePracticeCoachCompletion(blocks = []) {
  const result = { completedCount: 0, skippedCount: 0, blockedCount: 0, invalidCount: 0 };
  for (const block of blocks) {
    if (block?.status === "completed") result.completedCount += 1;
    else if (block?.status === "skipped") result.skippedCount += 1;
    else if (block?.status === "blocked") result.blockedCount += 1;
    else if (block?.status === "invalid") result.invalidCount += 1;
  }
  return Object.freeze(result);
}

export function calculatePracticeCoachCoverage(plannedMinutes, requestedMinutes) {
  const requested = Number(requestedMinutes);
  const coverage = requested > 0 ? Math.max(0, Math.min(1, Number(plannedMinutes) / requested)) : 0;
  const label = coverage >= 0.80 ? "full" : coverage >= 0.50 ? "partial" : "sparse";
  return Object.freeze({ coverage, label });
}

function compactDecisionForHash(decision) {
  if (!decision) return null;
  return {
    version: decision.version,
    personalizationPolicyVersion: decision.personalizationPolicyVersion,
    treatmentFamilyKey: decision.treatmentFamilyKey,
    sourceScope: decision.sourceScope,
    responseModifier: decision.responseModifier,
    sourceResponseStateId: decision.sourceResponseStateId,
    sourceResponseStateUpdatedAt: decision.sourceResponseStateUpdatedAt,
    evidenceInputs: (decision.evidenceInputs ?? []).map((entry) => ({
      treatmentFamilyKey: entry.treatmentFamilyKey,
      treatmentResponseStateId: entry.treatmentResponseStateId,
      updatedAt: entry.updatedAt,
      responseModifier: entry.responseModifier,
    })),
  };
}

function compactBlockForHash(block) {
  return {
    blockVersion: block.blockVersion,
    blockId: block.blockId,
    ordinal: block.ordinal,
    kind: block.kind,
    experimentId: block.experimentId,
    experimentVersion: block.experimentVersion,
    plannedSessionId: block.plannedSessionId,
    estimatedMinutes: block.estimatedMinutes,
    target: block.target,
    targetSource: block.targetSource,
    reviewPlan: block.reviewPlan ? {
      planVersion: block.reviewPlan.planVersion,
      bindings: (block.reviewPlan.bindings ?? []).map((binding) => ({
        reviewItemId: binding.reviewItemId,
        cycleId: binding.cycleId,
        referenceAtUtc: binding.referenceAtUtc,
        entityType: binding.entityType,
        entityKey: binding.entityKey,
      })),
      reviewContentPlanHash: block.reviewPlan.reviewContentPlanHash ?? null,
    } : null,
    realTextDurationMs: block.realTextDurationMs,
    baseUtilityScore: block.baseUtilityScore,
    personalizedUtilityScore: block.personalizedUtilityScore,
    responseInformed: block.responseInformed === true,
    personalizationDecision: compactDecisionForHash(block.personalizationDecision),
  };
}

export function calculatePracticeCoachPlanHash(plan) {
  return createPracticeCoachFingerprint({
    coachPlanVersion: plan.coachPlanVersion,
    plannerVersion: plan.plannerVersion,
    policyVersion: plan.policyVersion,
    profileId: plan.profileId,
    contextId: plan.contextId,
    localDayKey: plan.localDayKey,
    requestedMinutes: plan.requestedMinutes,
    inputFingerprint: plan.inputFingerprint,
    personalization: plan.personalization,
    blocks: (plan.blocks ?? []).map(compactBlockForHash),
  });
}

function validateDecision(decision, path, error) {
  if (decision == null) return;
  if (!plain(decision)) { error(path, "TYPE", "Coach personalization decision must be an object or null"); return; }
  if (decision.version !== PRACTICE_COACH_PERSONALIZATION_VERSION) error(`${path}.version`, "VERSION", "Coach personalization version is unsupported");
  if (decision.personalizationPolicyVersion !== PRACTICE_COACH_PERSONALIZATION_POLICY_VERSION) error(`${path}.personalizationPolicyVersion`, "VERSION", "Coach personalization policy version is unsupported");
  if (!["exact-target", "family", "none"].includes(decision.sourceScope)) error(`${path}.sourceScope`, "ENUM", "Coach personalization scope is invalid");
  if (!Number.isFinite(decision.responseModifier) || decision.responseModifier < 0.80 || decision.responseModifier > 1.20) error(`${path}.responseModifier`, "RANGE", "Coach response modifier is outside the v1 bound");
  if (!Number.isFinite(decision.baseInterventionMatch) || !Number.isFinite(decision.personalizedInterventionMatch)) error(path, "MATCH", "Coach intervention matches are invalid");
  if (decision.responseModelVersion !== PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION) error(`${path}.responseModelVersion`, "VERSION", "Coach response model version is unsupported");
  if (!Array.isArray(decision.evidenceInputs) || decision.evidenceInputs.length > 4) error(`${path}.evidenceInputs`, "ARRAY", "Coach personalization evidence inputs are invalid");
}

export function validatePracticeCoachPlan(plan, { maxBytes = PRACTICE_LIMITS.coachPlanBytes } = {}) {
  const errors = [];
  const error = (path, code, message) => errors.push({ path, code, message });
  if (!plain(plan)) return { valid: false, errors: [{ path: "coachPlan", code: "TYPE", message: "Coach plan must be an object" }] };
  if (plan.recordVersion !== PRACTICE_RECORD_VERSIONS.coachPlan) error("recordVersion", "VERSION", "Coach plan record version is unsupported");
  if (plan.coachPlanVersion !== PRACTICE_COACH_PLAN_VERSION) error("coachPlanVersion", "VERSION", "Coach plan version is unsupported");
  if (![1, PRACTICE_COACH_PLANNER_VERSION].includes(plan.plannerVersion)) error("plannerVersion", "VERSION", "Coach planner version is unsupported");
  if (![1, PRACTICE_COACH_POLICY_VERSION].includes(plan.policyVersion)) error("policyVersion", "VERSION", "Coach policy version is unsupported");
  if (plan.plannerVersion === 1) {
    if (plan.personalization !== null) error("personalization", "LEGACY", "Legacy Coach plans must not gain personalization decisions");
  } else {
    if (!plain(plan.personalization)) error("personalization", "TYPE", "Coach v2 personalization metadata is required");
    else {
      if (plan.personalization.personalizationVersion !== PRACTICE_COACH_PERSONALIZATION_VERSION) error("personalization.personalizationVersion", "VERSION", "Coach personalization version is unsupported");
      if (plan.personalization.personalizationPolicyVersion !== PRACTICE_COACH_PERSONALIZATION_POLICY_VERSION) error("personalization.personalizationPolicyVersion", "VERSION", "Coach personalization policy version is unsupported");
      if (plan.personalization.treatmentOptionsVersion !== PRACTICE_COACH_TREATMENT_OPTIONS_VERSION) error("personalization.treatmentOptionsVersion", "VERSION", "Coach treatment-options version is unsupported");
      if (plan.personalization.responseModelVersion !== PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION) error("personalization.responseModelVersion", "VERSION", "Coach response model version is unsupported");
    }
  }
  if (!isPracticeId(plan.profileId, "profile")) error("profileId", "IDENTITY", "Coach profileId is invalid");
  if (!isPracticeId(plan.contextId, "context")) error("contextId", "IDENTITY", "Coach contextId is invalid");
  if (!isValidPracticeDayKey(plan.localDayKey)) error("localDayKey", "DAY", "Coach local day is invalid");
  let expectedId = null;
  try { expectedId = createPracticeCoachPlanId(plan.profileId, plan.contextId, plan.localDayKey); } catch {}
  if (plan.coachPlanId !== expectedId) error("coachPlanId", "IDENTITY", "Coach plan ID does not match profile/context/day");
  for (const field of ["createdAt", "updatedAt"]) if (!isValidPracticeUtcIso(plan[field])) error(field, "TIME", `${field} must be UTC ISO time`);
  if (!PRACTICE_COACH_PLAN_STATUSES.includes(plan.status)) error("status", "ENUM", "Coach plan status is invalid");
  if (![5, 8, 12, 15].includes(plan.requestedMinutes)) error("requestedMinutes", "RANGE", "Coach requested minutes must be 5, 8, 12, or 15");
  if (!Number.isFinite(plan.plannedMinutes) || plan.plannedMinutes < 0 || plan.plannedMinutes > plan.requestedMinutes) error("plannedMinutes", "RANGE", "Coach planned minutes exceed budget");
  if (typeof plan.inputFingerprint !== "string" || plan.inputFingerprint.length > 100) error("inputFingerprint", "REQUIRED", "Coach input fingerprint is invalid");
  if (!plain(plan.decisionContext)) error("decisionContext", "TYPE", "Coach decision context must be an object");
  if (!plain(plan.suggestions)) error("suggestions", "TYPE", "Coach suggestions must be an object");
  if (!Array.isArray(plan.blocks) || plan.blocks.length > 4) error("blocks", "ARRAY", "Coach supports at most four blocks");
  else {
    const ids = new Set();
    let active = 0;
    for (let index = 0; index < plan.blocks.length; index += 1) {
      const block = plan.blocks[index];
      const path = `blocks[${index}]`;
      if (!plain(block)) { error(path, "TYPE", "Coach block must be an object"); continue; }
      if (block.blockVersion !== PRACTICE_COACH_BLOCK_VERSION) error(`${path}.blockVersion`, "VERSION", "Coach block version is unsupported");
      if (typeof block.blockId !== "string" || !block.blockId || ids.has(block.blockId)) error(`${path}.blockId`, "IDENTITY", "Coach block ID is missing or duplicated");
      ids.add(block.blockId);
      if (block.ordinal !== index + 1) error(`${path}.ordinal`, "ORDER", "Coach block ordinal is not canonical");
      if (!PRACTICE_COACH_BLOCK_KINDS.includes(block.kind)) error(`${path}.kind`, "ENUM", "Coach block kind is invalid");
      if (!PRACTICE_COACH_BLOCK_STATUSES.includes(block.status)) error(`${path}.status`, "ENUM", "Coach block status is invalid");
      if (block.status === "active") active += 1;
      if (!isPracticeId(block.plannedSessionId, "session")) error(`${path}.plannedSessionId`, "IDENTITY", "Coach plannedSessionId is invalid");
      if (!Number.isFinite(block.estimatedMinutes) || block.estimatedMinutes <= 0 || block.estimatedMinutes > 15) error(`${path}.estimatedMinutes`, "RANGE", "Coach block estimate is invalid");
      if (block.kind === "review") {
        if (block.experimentId !== "daily-coach-review" || !plain(block.reviewPlan) || !Array.isArray(block.reviewPlan.bindings) || block.reviewPlan.bindings.length < 1 || block.reviewPlan.bindings.length > 4) error(`${path}.reviewPlan`, "REVIEW", "Coach review block is invalid");
        if (block.target != null || block.realTextDurationMs != null) error(path, "CONFLICT", "Review block contains incompatible fields");
        if (block.personalizationDecision != null || block.responseInformed === true) error(path, "PERSONALIZATION", "Review blocks cannot be personalized");
      } else if (block.kind === "targeted-intervention") {
        if (!["weak-keys", "combination-repair", "problem-words", "accuracy-control"].includes(block.experimentId)) error(`${path}.experimentId`, "EXPERIMENT", "Coach target experiment is unsupported");
        if (!plain(block.target) || !["key", "bigram", "trigram", "word"].includes(block.target.entityType) || typeof block.target.entityKey !== "string" || !block.target.entityKey) error(`${path}.target`, "TARGET", "Coach target is invalid");
        if (block.targetSource !== "external-plan") error(`${path}.targetSource`, "TARGET_SOURCE", "Coach target source must be external-plan");
        if (block.reviewPlan != null || block.realTextDurationMs != null) error(path, "CONFLICT", "Target block contains incompatible fields");
        if (!Number.isFinite(block.baseUtilityScore) || !Number.isFinite(block.personalizedUtilityScore) || block.utilityScore !== block.personalizedUtilityScore) error(path, "UTILITY", "Coach target utility audit fields are invalid");
        validateDecision(block.personalizationDecision, `${path}.personalizationDecision`, error);
      } else if (block.kind === "real-text") {
        if (block.experimentId !== "real-text" || ![180000, 300000, 600000].includes(block.realTextDurationMs)) error(`${path}.realTextDurationMs`, "DURATION", "Coach Real Text duration is invalid");
        if (block.target != null || block.reviewPlan != null) error(path, "CONFLICT", "Real Text block contains target/review data");
        if (block.personalizationDecision != null || block.responseInformed === true) error(path, "PERSONALIZATION", "Real Text cannot be personalized by PL33 v1");
      }
    }
    if (active > 1) error("blocks", "ACTIVE_COUNT", "Only one Coach block may be active");
    const reviewIndex = plan.blocks.findIndex((block) => block.kind === "review");
    if (reviewIndex > 0) error("blocks", "REVIEW_ORDER", "Coach review must be first");
  }
  if (!plain(plan.completion)) error("completion", "TYPE", "Coach completion summary is required");
  else {
    const expected = calculatePracticeCoachCompletion(plan.blocks ?? []);
    for (const key of Object.keys(expected)) if (plan.completion[key] !== expected[key]) error(`completion.${key}`, "COUNT", "Coach completion count is inconsistent");
  }
  if (plan.planHash !== calculatePracticeCoachPlanHash(plan)) error("planHash", "HASH", "Coach plan hash is stale");
  const serialized = JSON.stringify(plan);
  for (const token of ["rawEvents", "rawEventTrace", "mistypedStrings", "wrongStrings", "protectedTransferText", "customText", "customTextHash", "privateNotes"]) if (serialized.includes(`\"${token}\"`)) error("coachPlan", "PRIVACY", `Coach plan contains forbidden ${token}`);
  if (byteSize(plan) > maxBytes) error("coachPlan", "SIZE", "Coach plan exceeds 64 KiB");
  return { valid: errors.length === 0, errors };
}

function planPersonalization(blocks) {
  return {
    personalizationVersion: PRACTICE_COACH_PERSONALIZATION_VERSION,
    personalizationPolicyVersion: PRACTICE_COACH_PERSONALIZATION_POLICY_VERSION,
    treatmentOptionsVersion: PRACTICE_COACH_TREATMENT_OPTIONS_VERSION,
    responseModelVersion: PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION,
    responseInformed: blocks.some((block) => block.responseInformed === true),
  };
}

export function createPracticeCoachPlanRecord({
  profileId,
  contextId,
  localDayKey,
  requestedMinutes,
  inputFingerprint,
  decisionContext = {},
  suggestions = {},
  blocks = [],
  now = () => new Date(),
  status = "planned",
} = {}) {
  const timestamp = new Date(typeof now === "function" ? now() : now).toISOString();
  const canonicalBlocks = clone(blocks).map((block, index) => ({
    blockVersion: PRACTICE_COACH_BLOCK_VERSION,
    blockId: block.blockId,
    ordinal: index + 1,
    kind: block.kind,
    experimentId: block.experimentId,
    experimentVersion: block.experimentVersion ?? 1,
    plannedSessionId: block.plannedSessionId,
    estimatedMinutes: block.estimatedMinutes,
    status: block.status ?? "pending",
    target: block.target ?? null,
    targetSource: block.targetSource ?? null,
    reviewPlan: block.reviewPlan ?? null,
    realTextDurationMs: block.realTextDurationMs ?? null,
    baseUtilityScore: block.kind === "targeted-intervention" && Number.isFinite(block.baseUtilityScore ?? block.utilityScore) ? Number(block.baseUtilityScore ?? block.utilityScore) : null,
    personalizedUtilityScore: block.kind === "targeted-intervention" && Number.isFinite(block.personalizedUtilityScore ?? block.utilityScore) ? Number(block.personalizedUtilityScore ?? block.utilityScore) : null,
    utilityScore: block.kind === "targeted-intervention" && Number.isFinite(block.personalizedUtilityScore ?? block.utilityScore) ? Number(block.personalizedUtilityScore ?? block.utilityScore) : null,
    personalizationDecision: block.kind === "targeted-intervention" ? block.personalizationDecision ?? null : null,
    responseInformed: block.kind === "targeted-intervention" && block.responseInformed === true,
    reasonCodes: Array.isArray(block.reasonCodes) ? [...new Set(block.reasonCodes)].slice(0, 4) : [],
    startedAt: block.startedAt ?? null,
    completedAt: block.completedAt ?? null,
    childSessionId: block.childSessionId ?? null,
    blockResult: block.blockResult ?? null,
  }));
  const plannedMinutes = canonicalBlocks.reduce((sum, block) => sum + Number(block.estimatedMinutes || 0), 0);
  const plan = {
    coachPlanId: createPracticeCoachPlanId(profileId, contextId, localDayKey),
    profileId,
    contextId,
    localDayKey,
    recordVersion: PRACTICE_RECORD_VERSIONS.coachPlan,
    coachPlanVersion: PRACTICE_COACH_PLAN_VERSION,
    plannerVersion: PRACTICE_COACH_PLANNER_VERSION,
    policyVersion: PRACTICE_COACH_POLICY_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    status,
    requestedMinutes,
    plannedMinutes,
    coverage: calculatePracticeCoachCoverage(plannedMinutes, requestedMinutes),
    inputFingerprint,
    decisionContext: clone(decisionContext),
    suggestions: clone(suggestions),
    personalization: planPersonalization(canonicalBlocks),
    blocks: canonicalBlocks,
    completion: calculatePracticeCoachCompletion(canonicalBlocks),
    planHash: null,
  };
  plan.planHash = calculatePracticeCoachPlanHash(plan);
  const validation = validatePracticeCoachPlan(plan);
  if (!validation.valid) {
    const cause = new TypeError("Invalid Practice Coach plan");
    cause.details = validation.errors;
    throw cause;
  }
  return freezeDeep(plan);
}

export function migratePracticeCoachPlanV1ToV2(input) {
  const value = clone(input);
  const blocks = (Array.isArray(value.blocks) ? value.blocks : []).map((block, index) => ({
    ...block,
    blockVersion: PRACTICE_COACH_BLOCK_VERSION,
    ordinal: block.ordinal ?? index + 1,
    baseUtilityScore: block.kind === "targeted-intervention" && Number.isFinite(block.utilityScore) ? block.utilityScore : null,
    personalizedUtilityScore: block.kind === "targeted-intervention" && Number.isFinite(block.utilityScore) ? block.utilityScore : null,
    utilityScore: block.kind === "targeted-intervention" && Number.isFinite(block.utilityScore) ? block.utilityScore : null,
    personalizationDecision: null,
    responseInformed: false,
  }));
  const migrated = {
    ...value,
    recordVersion: PRACTICE_RECORD_VERSIONS.coachPlan,
    coachPlanVersion: PRACTICE_COACH_PLAN_VERSION,
    plannerVersion: 1,
    policyVersion: 1,
    personalization: null,
    blocks,
    completion: calculatePracticeCoachCompletion(blocks),
    planHash: null,
  };
  migrated.planHash = calculatePracticeCoachPlanHash(migrated);
  const validation = validatePracticeCoachPlan(migrated);
  if (!validation.valid) {
    const error = new TypeError("Legacy Coach plan could not be promoted to v2");
    error.details = validation.errors;
    throw error;
  }
  return freezeDeep(migrated);
}
