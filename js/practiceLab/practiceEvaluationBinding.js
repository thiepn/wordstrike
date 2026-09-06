import {
  PRACTICE_EVALUATION_FRAMEWORK_VERSION,
  PRACTICE_EVALUATION_FRESHNESS_STATUSES,
} from "./practiceEvaluationConstants.js";
import { cleanupExpiredPracticeEvaluationReservations } from "./practiceEvaluationState.js";
import { validatePracticeEvaluationBinding } from "./practiceEvaluationValidation.js";
import { toPracticeUtcIso } from "./practiceTime.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const clone = (value) => JSON.parse(JSON.stringify(value));

function claimError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function benchmarkClaim(state, reservation, artifact, now) {
  const form = artifact?.forms?.find((entry) => entry.formId === reservation.selectedUnitId);
  if (!form || artifact.suiteId !== reservation.suiteId || artifact.suiteVersion !== reservation.suiteVersion) throw claimError("PRACTICE_EVALUATION_BINDING_MISMATCH", "Benchmark reservation no longer matches suite");
  const lanes = clone(state.benchmarkSuites ?? []);
  let lane = lanes.find((entry) => entry.suiteId === artifact.suiteId && entry.suiteVersion === artifact.suiteVersion);
  if (!lane) {
    lane = { suiteId: artifact.suiteId, suiteVersion: artifact.suiteVersion, formExposures: [], lastExposedFormId: null, totalClaims: 0 };
    lanes.push(lane);
  }
  let exposure = lane.formExposures.find((entry) => entry.formId === form.formId);
  const priorCount = Number(exposure?.exposureCount ?? 0);
  const claimedAtUtc = toPracticeUtcIso(now);
  if (!exposure) {
    exposure = { formId: form.formId, exposureCount: 0, firstExposedAt: null, lastExposedAt: null };
    lane.formExposures.push(exposure);
  }
  exposure.exposureCount = priorCount + 1;
  exposure.firstExposedAt ??= claimedAtUtc;
  exposure.lastExposedAt = claimedAtUtc;
  lane.lastExposedFormId = form.formId;
  lane.totalClaims = Number(lane.totalClaims || 0) + 1;
  const freshnessStatus = priorCount > 0 ? "repeat" : state.historyStatus === "complete" ? "fresh" : "unknown";
  return { lanes, form, exposureOrdinal: priorCount + 1, freshnessStatus, claimedAtUtc };
}

function transferClaim(state, reservation, artifact, now) {
  const unit = artifact?.units?.find((entry) => entry.unitId === reservation.selectedUnitId);
  if (!unit || artifact.poolId !== reservation.poolId || artifact.poolVersion !== reservation.poolVersion) throw claimError("PRACTICE_EVALUATION_BINDING_MISMATCH", "Transfer reservation no longer matches pool");
  const lanes = clone(state.transferPools ?? []);
  let lane = lanes.find((entry) => entry.poolId === artifact.poolId && entry.poolVersion === artifact.poolVersion);
  if (!lane) {
    lane = { poolId: artifact.poolId, poolVersion: artifact.poolVersion, claimedUnitIds: [], claimedCount: 0, exhaustedAt: null };
    lanes.push(lane);
  }
  if (lane.claimedUnitIds.includes(unit.unitId)) throw claimError("PRACTICE_TRANSFER_REPEAT", "A cold-transfer unit cannot be claimed twice");
  const claimedAtUtc = toPracticeUtcIso(now);
  lane.claimedUnitIds.push(unit.unitId);
  lane.claimedCount = lane.claimedUnitIds.length;
  if (lane.claimedCount >= artifact.units.length) lane.exhaustedAt = claimedAtUtc;
  const freshnessStatus = state.historyStatus === "complete" ? "fresh" : "unknown";
  return { lanes, unit, exposureOrdinal: 1, freshnessStatus, claimedAtUtc };
}

export function claimPracticeEvaluationReservationState({
  evaluationState,
  profileId,
  contextId,
  reservationId,
  sessionId,
  artifact,
  now = () => new Date(),
} = {}) {
  const state = cleanupExpiredPracticeEvaluationReservations(evaluationState, now);
  const reservation = state.activeReservations.find((entry) => entry.reservationId === reservationId);
  if (!reservation) throw claimError("PRACTICE_EVALUATION_RESERVATION_NOT_FOUND", "Evaluation reservation is missing or expired");
  if (reservation.profileId !== profileId || typeof contextId !== "string" || !contextId) throw claimError("PRACTICE_EVALUATION_CLAIM_IDENTITY", "Evaluation reservation profile/context mismatch");
  if (typeof sessionId !== "string" || !sessionId) throw claimError("PRACTICE_EVALUATION_CLAIM_IDENTITY", "Evaluation claim requires sessionId");
  const claim = reservation.kind === "benchmark"
    ? benchmarkClaim(state, reservation, artifact, now)
    : transferClaim(state, reservation, artifact, now);
  if (!PRACTICE_EVALUATION_FRESHNESS_STATUSES.includes(claim.freshnessStatus)) throw claimError("PRACTICE_EVALUATION_FRESHNESS_INVALID", "Evaluation freshness could not be resolved");
  const binding = freezeDeep({
    frameworkVersion: PRACTICE_EVALUATION_FRAMEWORK_VERSION,
    reservationId,
    profileId,
    contextId,
    sessionId,
    kind: reservation.kind,
    protocolId: reservation.protocolId,
    protocolVersion: reservation.protocolVersion,
    suiteId: reservation.kind === "benchmark" ? reservation.suiteId : null,
    suiteVersion: reservation.kind === "benchmark" ? reservation.suiteVersion : null,
    formId: reservation.kind === "benchmark" ? reservation.selectedUnitId : null,
    formVersion: reservation.kind === "benchmark" ? claim.form.formVersion : null,
    poolId: reservation.kind === "cold-transfer" ? reservation.poolId : null,
    poolVersion: reservation.kind === "cold-transfer" ? reservation.poolVersion : null,
    unitId: reservation.kind === "cold-transfer" ? reservation.selectedUnitId : null,
    unitVersion: reservation.kind === "cold-transfer" ? claim.unit.unitVersion : null,
    exposureOrdinal: claim.exposureOrdinal,
    freshnessStatus: claim.freshnessStatus,
    reservedAtUtc: reservation.reservedAtUtc,
    claimedAtUtc: claim.claimedAtUtc,
    contentBindingHash: reservation.kind === "benchmark" ? claim.form.formHash : claim.unit.unitHash,
  });
  const validation = validatePracticeEvaluationBinding(binding);
  if (!validation.valid) throw claimError("PRACTICE_EVALUATION_BINDING_INVALID", validation.errors[0]?.message ?? "Evaluation binding is invalid");
  const next = clone(state);
  next.updatedAt = claim.claimedAtUtc;
  next.activeReservations = next.activeReservations.filter((entry) => entry.reservationId !== reservationId);
  if (reservation.kind === "benchmark") next.benchmarkSuites = claim.lanes;
  else next.transferPools = claim.lanes;
  return freezeDeep({ binding, state: next });
}
