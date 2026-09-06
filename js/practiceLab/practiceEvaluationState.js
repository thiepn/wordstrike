import { PRACTICE_RECORD_VERSIONS } from "./practiceConstants.js";
import { createPracticeEvaluationStateId } from "./practiceIds.js";
import {
  PRACTICE_EVALUATION_HISTORY_STATUSES,
  PRACTICE_EVALUATION_LIMITS,
  PRACTICE_EVALUATION_SELECTION_POLICY_VERSION,
  PRACTICE_EVALUATION_STATE_VERSION,
} from "./practiceEvaluationConstants.js";
import { toPracticeUtcIso } from "./practiceTime.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const clone = (value) => JSON.parse(JSON.stringify(value));

export function createDefaultPracticeEvaluationState({
  profileId,
  now = () => new Date(),
  historyStatus = "complete",
} = {}) {
  if (typeof profileId !== "string" || !profileId) throw new TypeError("Practice evaluation state requires profileId");
  if (!PRACTICE_EVALUATION_HISTORY_STATUSES.includes(historyStatus)) throw new TypeError("Practice evaluation history status is invalid");
  const timestamp = toPracticeUtcIso(now);
  return freezeDeep({
    evaluationStateId: createPracticeEvaluationStateId(profileId),
    profileId,
    recordVersion: PRACTICE_RECORD_VERSIONS.evaluationState,
    createdAt: timestamp,
    updatedAt: timestamp,
    stateVersion: PRACTICE_EVALUATION_STATE_VERSION,
    selectionPolicyVersion: PRACTICE_EVALUATION_SELECTION_POLICY_VERSION,
    activeReservations: [],
    benchmarkSuites: [],
    transferPools: [],
    historyStatus,
  });
}

export function cleanupExpiredPracticeEvaluationReservations(state, now = () => new Date()) {
  const currentMs = new Date(typeof now === "function" ? now() : now).getTime();
  if (!Number.isFinite(currentMs)) throw new TypeError("Practice evaluation cleanup time is invalid");
  const activeReservations = (state?.activeReservations ?? []).filter((reservation) => Date.parse(reservation.expiresAt) > currentMs);
  if (activeReservations.length === (state?.activeReservations ?? []).length) return state;
  return freezeDeep({ ...clone(state), updatedAt: new Date(currentMs).toISOString(), activeReservations });
}

export function getPracticeBenchmarkSuiteExposure(state, suiteId, suiteVersion = null) {
  return (state?.benchmarkSuites ?? []).find((entry) => (
    entry.suiteId === suiteId && (suiteVersion == null || entry.suiteVersion === suiteVersion)
  )) ?? null;
}

export function getPracticeTransferPoolExposure(state, poolId, poolVersion = null) {
  return (state?.transferPools ?? []).find((entry) => (
    entry.poolId === poolId && (poolVersion == null || entry.poolVersion === poolVersion)
  )) ?? null;
}

export function withPracticeEvaluationReservation(state, reservation, now = () => new Date()) {
  const cleaned = cleanupExpiredPracticeEvaluationReservations(state, now);
  const reservations = cleaned.activeReservations ?? [];
  if (reservations.length >= PRACTICE_EVALUATION_LIMITS.activeReservations) {
    const error = new Error("Practice evaluation reservation limit reached");
    error.code = "PRACTICE_EVALUATION_RESERVATION_LIMIT";
    throw error;
  }
  if (reservations.some((entry) => entry.reservationId === reservation.reservationId)) {
    const error = new Error("Practice evaluation reservation already exists");
    error.code = "PRACTICE_EVALUATION_RESERVATION_DUPLICATE";
    throw error;
  }
  return freezeDeep({
    ...clone(cleaned),
    updatedAt: toPracticeUtcIso(now),
    activeReservations: [...reservations, clone(reservation)],
  });
}

export function withoutPracticeEvaluationReservation(state, reservationId, now = () => new Date()) {
  const next = (state?.activeReservations ?? []).filter((entry) => entry.reservationId !== reservationId);
  return freezeDeep({ ...clone(state), updatedAt: toPracticeUtcIso(now), activeReservations: next });
}

export function markPracticeEvaluationHistoryPartial(state, now = () => new Date()) {
  return freezeDeep({ ...clone(state), updatedAt: toPracticeUtcIso(now), historyStatus: "partial" });
}

export function reconstructPracticeEvaluationStateFromSessionSummaries({
  profileId,
  sessionSummaries = [],
  now = () => new Date(),
} = {}) {
  const state = JSON.parse(JSON.stringify(createDefaultPracticeEvaluationState({ profileId, now, historyStatus: "partial" })));
  let latestAt = state.updatedAt;
  const ordered = [...sessionSummaries]
    .filter((summary) => summary?.profileId === profileId && summary?.evaluationSummary)
    .sort((a, b) => String(a.completedAtUtc ?? "").localeCompare(String(b.completedAtUtc ?? "")) || String(a.sessionId).localeCompare(String(b.sessionId)));
  for (const summary of ordered) {
    const evaluation = summary.evaluationSummary;
    const at = summary.completedAtUtc ?? summary.updatedAt ?? state.updatedAt;
    if (Date.parse(at) > Date.parse(latestAt)) latestAt = at;
    if (evaluation.kind === "benchmark" && evaluation.suiteId && evaluation.formId) {
      let lane = state.benchmarkSuites.find((entry) => entry.suiteId === evaluation.suiteId && entry.suiteVersion === (evaluation.suiteVersion ?? 1));
      if (!lane) {
        lane = { suiteId: evaluation.suiteId, suiteVersion: evaluation.suiteVersion ?? 1, formExposures: [], lastExposedFormId: null, totalClaims: 0 };
        state.benchmarkSuites.push(lane);
      }
      let exposure = lane.formExposures.find((entry) => entry.formId === evaluation.formId);
      if (!exposure) {
        exposure = { formId: evaluation.formId, exposureCount: 0, firstExposedAt: null, lastExposedAt: null };
        lane.formExposures.push(exposure);
      }
      exposure.exposureCount = Math.max(exposure.exposureCount, Number(evaluation.exposureOrdinal || 1));
      exposure.firstExposedAt ??= at;
      exposure.lastExposedAt = at;
      lane.lastExposedFormId = evaluation.formId;
      lane.totalClaims = Math.max(Number(lane.totalClaims || 0), lane.formExposures.reduce((sum, entry) => sum + Number(entry.exposureCount || 0), 0));
    }
    if (evaluation.kind === "cold-transfer" && evaluation.poolId && evaluation.unitId) {
      let lane = state.transferPools.find((entry) => entry.poolId === evaluation.poolId && entry.poolVersion === (evaluation.poolVersion ?? 1));
      if (!lane) {
        lane = { poolId: evaluation.poolId, poolVersion: evaluation.poolVersion ?? 1, claimedUnitIds: [], claimedCount: 0, exhaustedAt: null };
        state.transferPools.push(lane);
      }
      if (!lane.claimedUnitIds.includes(evaluation.unitId)) lane.claimedUnitIds.push(evaluation.unitId);
      lane.claimedCount = lane.claimedUnitIds.length;
    }
  }
  state.updatedAt = latestAt;
  return freezeDeep(state);
}
