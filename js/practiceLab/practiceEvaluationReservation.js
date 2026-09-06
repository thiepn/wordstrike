import { hashPracticeContent, createPracticeEvaluationReservationId } from "./practiceIds.js";
import {
  PRACTICE_EVALUATION_LIMITS,
  PRACTICE_EVALUATION_PROTOCOL_V1,
  PRACTICE_EVALUATION_RESERVATION_VERSION,
  PRACTICE_EVALUATION_SELECTION_POLICY_VERSION,
} from "./practiceEvaluationConstants.js";
import {
  assertPracticeEvaluationOptionsTargetBlind,
  validatePracticeEvaluationReservation,
} from "./practiceEvaluationValidation.js";
import {
  cleanupExpiredPracticeEvaluationReservations,
  getPracticeBenchmarkSuiteExposure,
  withPracticeEvaluationReservation,
  withoutPracticeEvaluationReservation,
} from "./practiceEvaluationState.js";
import { selectPracticeColdTransferUnit } from "./practiceTransferSelection.js";
import { toPracticeUtcIso } from "./practiceTime.js";

const BENCHMARK_ALLOWED = new Set(["profileId", "contextId", "suiteId", "suite", "evaluationState", "now"]);
const TRANSFER_ALLOWED = new Set(["profileId", "contextId", "poolId", "pool", "evaluationState", "now"]);
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function addMs(iso, ms) {
  return new Date(Date.parse(iso) + ms).toISOString();
}

function benchmarkRank(profileId, suiteId, formId) {
  return hashPracticeContent(`${PRACTICE_EVALUATION_SELECTION_POLICY_VERSION}|${profileId}|${suiteId}|${formId}`);
}

function benchmarkExposureCount(lane, formId) {
  return Number(lane?.formExposures?.find((entry) => entry.formId === formId)?.exposureCount ?? 0);
}

export function selectPracticeBenchmarkForm(options = {}) {
  assertPracticeEvaluationOptionsTargetBlind(options, BENCHMARK_ALLOWED);
  const { profileId, suiteId, suite, evaluationState } = options;
  if (!suite || suite.suiteId !== suiteId || suite.status !== "ready") {
    const error = new Error("Benchmark suite is not ready");
    error.code = "PRACTICE_BENCHMARK_SUITE_NOT_READY";
    throw error;
  }
  const lane = getPracticeBenchmarkSuiteExposure(evaluationState, suiteId, suite.suiteVersion);
  const reserved = new Set((evaluationState?.activeReservations ?? [])
    .filter((entry) => entry.kind === "benchmark" && entry.suiteId === suiteId)
    .map((entry) => entry.selectedUnitId));
  let candidates = suite.forms.filter((form) => !reserved.has(form.formId));
  if (!candidates.length) {
    const error = new Error("All benchmark forms are currently reserved");
    error.code = "PRACTICE_BENCHMARK_ALL_FORMS_RESERVED";
    throw error;
  }
  const minExposure = Math.min(...candidates.map((form) => benchmarkExposureCount(lane, form.formId)));
  candidates = candidates.filter((form) => benchmarkExposureCount(lane, form.formId) === minExposure);
  if (candidates.length > 1 && lane?.lastExposedFormId) {
    const withoutImmediateRepeat = candidates.filter((form) => form.formId !== lane.lastExposedFormId);
    if (withoutImmediateRepeat.length) candidates = withoutImmediateRepeat;
  }
  candidates = candidates
    .map((form) => ({ form, rank: benchmarkRank(profileId, suiteId, form.formId) }))
    .sort((a, b) => a.rank.localeCompare(b.rank) || a.form.formId.localeCompare(b.form.formId));
  const form = candidates[0].form;
  return Object.freeze({
    status: "selected",
    suiteId,
    suiteVersion: suite.suiteVersion,
    formId: form.formId,
    formVersion: form.formVersion,
    selectionPolicyVersion: PRACTICE_EVALUATION_SELECTION_POLICY_VERSION,
  });
}

function createReservation({ profileId, kind, selection, now }) {
  const createdAt = toPracticeUtcIso(now);
  const protocol = PRACTICE_EVALUATION_PROTOCOL_V1[kind];
  const reservation = {
    reservationId: createPracticeEvaluationReservationId(),
    reservationVersion: PRACTICE_EVALUATION_RESERVATION_VERSION,
    profileId,
    kind,
    protocolId: protocol.protocolId,
    protocolVersion: protocol.protocolVersion,
    selectedUnitId: kind === "benchmark" ? selection.formId : selection.unitId,
    suiteId: kind === "benchmark" ? selection.suiteId : null,
    suiteVersion: kind === "benchmark" ? selection.suiteVersion : null,
    poolId: kind === "cold-transfer" ? selection.poolId : null,
    poolVersion: kind === "cold-transfer" ? selection.poolVersion : null,
    createdAt,
    reservedAtUtc: createdAt,
    expiresAt: addMs(createdAt, PRACTICE_EVALUATION_LIMITS.reservationTtlMs),
    selectionPolicyVersion: PRACTICE_EVALUATION_SELECTION_POLICY_VERSION,
  };
  const validation = validatePracticeEvaluationReservation(reservation);
  if (!validation.valid) throw new TypeError(`Practice evaluation reservation is invalid: ${validation.errors[0]?.message ?? "unknown"}`);
  return freezeDeep(reservation);
}

export function reservePracticeBenchmarkFormState(options = {}) {
  assertPracticeEvaluationOptionsTargetBlind(options, BENCHMARK_ALLOWED);
  const now = options.now ?? (() => new Date());
  const cleaned = cleanupExpiredPracticeEvaluationReservations(options.evaluationState, now);
  const selection = selectPracticeBenchmarkForm({ ...options, evaluationState: cleaned });
  const reservation = createReservation({ profileId: options.profileId, kind: "benchmark", selection, now });
  return freezeDeep({ reservation, state: withPracticeEvaluationReservation(cleaned, reservation, now) });
}

export function reservePracticeColdTransferUnitState(options = {}) {
  assertPracticeEvaluationOptionsTargetBlind(options, TRANSFER_ALLOWED);
  const now = options.now ?? (() => new Date());
  const cleaned = cleanupExpiredPracticeEvaluationReservations(options.evaluationState, now);
  const selection = selectPracticeColdTransferUnit({
    profileId: options.profileId,
    contextId: options.contextId,
    poolId: options.poolId,
    pool: options.pool,
    evaluationState: cleaned,
  });
  const reservation = createReservation({ profileId: options.profileId, kind: "cold-transfer", selection, now });
  return freezeDeep({ reservation, state: withPracticeEvaluationReservation(cleaned, reservation, now) });
}

export function abandonPracticeEvaluationReservationState({ evaluationState, reservationId, now = () => new Date() } = {}) {
  if (typeof reservationId !== "string" || !reservationId) throw new TypeError("Practice evaluation reservationId is required");
  return withoutPracticeEvaluationReservation(evaluationState, reservationId, now);
}
