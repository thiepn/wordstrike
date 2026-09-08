import { getPracticeTransferPoolExposure } from "./practiceEvaluationState.js";
import { PRACTICE_REAL_TEXT_DURATIONS_MS, PRACTICE_REAL_TEXT_ERRORS } from "./practiceRealTextConstants.js";
import { getPracticeRealTextRequiredGraphemes, PRACTICE_REAL_TEXT_POLICY_V1 } from "./practiceRealTextPolicy.js";
import { validatePracticeRealTextPool } from "./practiceRealTextPool.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };

export function getRealTextPracticeAvailability({ pool, language = "en", policy = PRACTICE_REAL_TEXT_POLICY_V1 } = {}) {
  if (language !== policy.language) return freezeDeep({ status: "unavailable", poolStatus: pool?.status ?? null, languageSupported: false, supportedDurationsMs: [], reasons: [PRACTICE_REAL_TEXT_ERRORS.UNSUPPORTED_LANGUAGE] });
  const validation = validatePracticeRealTextPool(pool, { policy });
  if (!validation.valid) return freezeDeep({ status: "unavailable", poolStatus: pool?.status ?? null, languageSupported: true, supportedDurationsMs: [], reasons: [PRACTICE_REAL_TEXT_ERRORS.POOL_STALE, ...validation.reasons] });
  if (pool.status !== "ready") return freezeDeep({ status: "unavailable", poolStatus: pool.status, languageSupported: true, supportedDurationsMs: [], reasons: [PRACTICE_REAL_TEXT_ERRORS.POOL_NOT_READY, ...(pool.releaseReport?.releaseBlockers ?? [])] });
  const totalCapacity = pool.units.reduce((sum, unit) => sum + unit.graphemeCount, 0);
  const supportedDurationsMs = PRACTICE_REAL_TEXT_DURATIONS_MS.filter((durationMs) => totalCapacity >= getPracticeRealTextRequiredGraphemes(durationMs, policy));
  return freezeDeep({
    status: supportedDurationsMs.length ? "ready" : "unavailable",
    poolStatus: pool.status,
    languageSupported: true,
    supportedDurationsMs,
    reasons: supportedDurationsMs.length ? [] : [PRACTICE_REAL_TEXT_ERRORS.INSUFFICIENT_CAPACITY],
    totalCapacity,
  });
}

export function getRealTextColdTransferAvailability({ pool, evaluationState, language = "en" } = {}) {
  if (!pool || pool.status !== "ready" || pool.language !== language || !Array.isArray(pool.units) || !pool.units.length) return freezeDeep({ status: "unavailable", reason: PRACTICE_REAL_TEXT_ERRORS.COLD_TRANSFER_UNAVAILABLE, freshUnitAvailable: false, strictColdEligible: false });
  if (evaluationState?.historyStatus !== "complete") return freezeDeep({ status: "unavailable", reason: PRACTICE_REAL_TEXT_ERRORS.COLD_TRANSFER_HISTORY_PARTIAL, freshUnitAvailable: false, strictColdEligible: false });
  const exposure = getPracticeTransferPoolExposure(evaluationState, pool.poolId, pool.poolVersion);
  const claimed = new Set(exposure?.claimedUnitIds ?? []);
  const reserved = new Set((evaluationState?.activeReservations ?? []).filter((entry) => entry.kind === "cold-transfer" && entry.poolId === pool.poolId && entry.poolVersion === pool.poolVersion).map((entry) => entry.selectedUnitId));
  const freshUnitAvailable = pool.units.some((unit) => !claimed.has(unit.unitId) && !reserved.has(unit.unitId));
  return freezeDeep({
    status: freshUnitAvailable ? "ready" : "unavailable",
    reason: freshUnitAvailable ? null : PRACTICE_REAL_TEXT_ERRORS.COLD_TRANSFER_EXHAUSTED,
    freshUnitAvailable,
    strictColdEligible: freshUnitAvailable,
  });
}
