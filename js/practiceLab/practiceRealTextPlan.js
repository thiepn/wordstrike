import { hashPracticeContent } from "./practiceIds.js";
import {
  PRACTICE_REAL_TEXT_ERRORS,
  PRACTICE_REAL_TEXT_GENERATOR_VERSION,
  PRACTICE_REAL_TEXT_POLICY_VERSION,
  PRACTICE_REAL_TEXT_SELECTION_VERSION,
  PRACTICE_REAL_TEXT_VERSION,
} from "./practiceRealTextConstants.js";
import { getPracticeRealTextRequiredGraphemes, PRACTICE_REAL_TEXT_POLICY_V1 } from "./practiceRealTextPolicy.js";
import { validatePracticeRealTextPool } from "./practiceRealTextPool.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const canonical = (value) => { if (Array.isArray(value)) return value.map(canonical); if (value && typeof value === "object") return Object.keys(value).sort().reduce((out, key) => { out[key] = canonical(value[key]); return out; }, {}); return value; };
const stableHash = (value) => hashPracticeContent(JSON.stringify(canonical(value)));
const error = (code, message, details = null) => Object.assign(new Error(message), { code, details, recoverable: true });

export function validatePracticeRealTextDuration(durationMs, policy = PRACTICE_REAL_TEXT_POLICY_V1) {
  return policy.durationsMs.includes(durationMs);
}

function rankUnit(sessionId, poolId, unitId) {
  return hashPracticeContent(`${PRACTICE_REAL_TEXT_SELECTION_VERSION}|${sessionId}|${poolId}|${unitId}`);
}

export function buildPracticeRealTextPlan({ sessionId, profileId, contextId, language = "en", durationMs, pool, policy = PRACTICE_REAL_TEXT_POLICY_V1 } = {}) {
  if (typeof sessionId !== "string" || !sessionId) throw new TypeError("Real Text plan requires sessionId");
  if (typeof profileId !== "string" || !profileId || typeof contextId !== "string" || !contextId) throw new TypeError("Real Text plan requires profile/context identity");
  if (language !== policy.language) throw error(PRACTICE_REAL_TEXT_ERRORS.UNSUPPORTED_LANGUAGE, "Real Text v1 supports English only");
  if (!validatePracticeRealTextDuration(durationMs, policy)) throw error(PRACTICE_REAL_TEXT_ERRORS.DURATION_UNSUPPORTED, "Real Text duration is unsupported", { durationMs });
  const validation = validatePracticeRealTextPool(pool, { policy });
  if (!validation.valid) throw error(PRACTICE_REAL_TEXT_ERRORS.POOL_STALE, "Real Text pool failed validation", validation.reasons);
  if (pool.status !== "ready") throw error(PRACTICE_REAL_TEXT_ERRORS.POOL_NOT_READY, "Real Text pool is not ready", pool.releaseReport?.releaseBlockers ?? []);
  const requiredGraphemes = getPracticeRealTextRequiredGraphemes(durationMs, policy);
  const ordered = pool.units.map((unit) => ({ unit, rank: rankUnit(sessionId, pool.poolId, unit.unitId) })).sort((a, b) => a.rank.localeCompare(b.rank) || a.unit.unitId.localeCompare(b.unit.unitId));
  const selected = [];
  const families = new Set();
  let capacity = 0;
  for (const { unit } of ordered) {
    if (unit.familyIds.some((familyId) => families.has(familyId))) continue;
    selected.push(unit);
    unit.familyIds.forEach((familyId) => families.add(familyId));
    capacity += unit.graphemeCount;
    if (capacity >= requiredGraphemes) break;
  }
  if (capacity < requiredGraphemes) throw error(PRACTICE_REAL_TEXT_ERRORS.INSUFFICIENT_CAPACITY, "Real Text pool cannot satisfy this duration", { durationMs, requiredGraphemes, availableGraphemes: capacity });
  const body = {
    version: PRACTICE_REAL_TEXT_VERSION,
    policyVersion: PRACTICE_REAL_TEXT_POLICY_VERSION,
    generatorVersion: PRACTICE_REAL_TEXT_GENERATOR_VERSION,
    selectionVersion: PRACTICE_REAL_TEXT_SELECTION_VERSION,
    sessionId, profileId, contextId, language,
    durationMs,
    requiredGraphemes,
    selectedGraphemeCapacity: capacity,
    poolId: pool.poolId,
    poolVersion: pool.poolVersion,
    poolChecksum: pool.checksum,
    separator: pool.separator,
    selectedUnits: selected.map((unit) => ({
      unitId: unit.unitId,
      unitVersion: unit.unitVersion,
      unitHash: unit.unitHash,
      familyIds: [...unit.familyIds],
      orderedContentIds: [...unit.orderedContentIds],
      contentHashes: { ...unit.contentHashes },
      graphemeCount: unit.graphemeCount,
    })),
    targetEntities: [],
    evidenceRole: "training",
    completionMode: "duration",
    resumable: false,
  };
  return freezeDeep({ ...body, planHash: stableHash(body) });
}

export function validatePracticeRealTextPlan(plan, pool, { policy = PRACTICE_REAL_TEXT_POLICY_V1 } = {}) {
  try {
    if (!plan || plan.version !== PRACTICE_REAL_TEXT_VERSION || plan.policyVersion !== PRACTICE_REAL_TEXT_POLICY_VERSION || plan.generatorVersion !== PRACTICE_REAL_TEXT_GENERATOR_VERSION || plan.selectionVersion !== PRACTICE_REAL_TEXT_SELECTION_VERSION) return false;
    if (!validatePracticeRealTextDuration(plan.durationMs, policy) || plan.targetEntities?.length !== 0 || plan.evidenceRole !== "training" || plan.resumable !== false) return false;
    if (plan.poolId !== pool?.poolId || plan.poolVersion !== pool?.poolVersion || plan.poolChecksum !== pool?.checksum) return false;
    const { planHash, ...body } = plan;
    return planHash === stableHash(body);
  } catch { return false; }
}
