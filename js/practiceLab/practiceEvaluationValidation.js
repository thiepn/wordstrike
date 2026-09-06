import { PRACTICE_LIMITS, PRACTICE_RECORD_VERSIONS } from "./practiceConstants.js";
import { createPracticeEvaluationStateId } from "./practiceIds.js";
import {
  PRACTICE_BENCHMARK_COMPARABILITY_CLASSES,
  PRACTICE_BENCHMARK_FORM_VERSION,
  PRACTICE_BENCHMARK_SUITE_SCHEMA_VERSION,
  PRACTICE_BENCHMARK_SUITE_STATUSES,
  PRACTICE_EVALUATION_HISTORY_STATUSES,
  PRACTICE_EVALUATION_INTEGRITY_REASON_CODES,
  PRACTICE_EVALUATION_INTEGRITY_STATUSES,
  PRACTICE_EVALUATION_KINDS,
  PRACTICE_EVALUATION_LIMITS,
  PRACTICE_EVALUATION_RESERVATION_VERSION,
  PRACTICE_EVALUATION_SELECTION_POLICY_VERSION,
  PRACTICE_EVALUATION_STATE_VERSION,
  PRACTICE_EVALUATION_FRESHNESS_STATUSES,
  PRACTICE_TRANSFER_POOL_SCHEMA_VERSION,
  PRACTICE_TRANSFER_UNIT_VERSION,
} from "./practiceEvaluationConstants.js";

const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const isIso = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const push = (errors, path, code, message) => errors.push({ path, code, message });
const plainObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const forbiddenTargetFields = new Set([
  "entityType", "entityKey", "targetEntity", "targetEntities", "limiterId", "limiterIds",
  "weaknessScore", "priority", "mastery", "masteryTarget", "skillStats", "learningStates",
  "limiterSnapshot", "masterySnapshot",
]);

export function assertPracticeEvaluationOptionsTargetBlind(options, allowedFields) {
  if (!plainObject(options)) throw new TypeError("Practice protected evaluation options must be an object");
  for (const key of Object.keys(options)) {
    if (forbiddenTargetFields.has(key)) {
      const error = new TypeError(`Protected evaluation selection cannot accept target-specific field: ${key}`);
      error.code = "PRACTICE_EVALUATION_TARGET_INPUT_FORBIDDEN";
      throw error;
    }
    if (allowedFields && !allowedFields.has(key)) {
      const error = new TypeError(`Unknown protected evaluation selection field: ${key}`);
      error.code = "PRACTICE_EVALUATION_UNKNOWN_SELECTION_FIELD";
      throw error;
    }
  }
  return true;
}

export function validatePracticeEvaluationReservation(reservation) {
  const errors = [];
  if (!plainObject(reservation)) return { valid: false, errors: [{ path: "", code: "TYPE", message: "reservation must be an object" }] };
  if (reservation.reservationVersion !== PRACTICE_EVALUATION_RESERVATION_VERSION) push(errors, "reservationVersion", "VERSION", "unsupported reservation version");
  if (typeof reservation.reservationId !== "string" || !reservation.reservationId) push(errors, "reservationId", "IDENTITY", "reservationId is required");
  if (typeof reservation.profileId !== "string" || !reservation.profileId) push(errors, "profileId", "IDENTITY", "profileId is required");
  if (!PRACTICE_EVALUATION_KINDS.includes(reservation.kind)) push(errors, "kind", "ENUM", "evaluation kind is invalid");
  if (typeof reservation.protocolId !== "string" || !reservation.protocolId) push(errors, "protocolId", "IDENTITY", "protocolId is required");
  if (!Number.isInteger(reservation.protocolVersion) || reservation.protocolVersion < 1) push(errors, "protocolVersion", "VERSION", "protocolVersion is invalid");
  if (typeof reservation.selectedUnitId !== "string" || !reservation.selectedUnitId) push(errors, "selectedUnitId", "IDENTITY", "selectedUnitId is required");
  if (!isIso(reservation.createdAt) || !isIso(reservation.reservedAtUtc) || !isIso(reservation.expiresAt)) push(errors, "time", "TIMESTAMP", "reservation timestamps are invalid");
  if (isIso(reservation.createdAt) && isIso(reservation.expiresAt) && Date.parse(reservation.expiresAt) <= Date.parse(reservation.createdAt)) push(errors, "expiresAt", "ORDER", "reservation must expire after creation");
  if (reservation.selectionPolicyVersion !== PRACTICE_EVALUATION_SELECTION_POLICY_VERSION) push(errors, "selectionPolicyVersion", "VERSION", "selection policy version is invalid");
  for (const key of forbiddenTargetFields) if (Object.hasOwn(reservation, key)) push(errors, key, "FORBIDDEN", "target-specific reservation fields are forbidden");
  return { valid: errors.length === 0, errors };
}

export function validatePracticeEvaluationState(state) {
  const errors = [];
  if (!plainObject(state)) return { valid: false, errors: [{ path: "", code: "TYPE", message: "evaluation state must be an object" }] };
  if (state.recordVersion !== PRACTICE_RECORD_VERSIONS.evaluationState) push(errors, "recordVersion", "VERSION", "evaluation state record version is invalid");
  if (state.stateVersion !== PRACTICE_EVALUATION_STATE_VERSION) push(errors, "stateVersion", "VERSION", "evaluation state version is invalid");
  if (state.selectionPolicyVersion !== PRACTICE_EVALUATION_SELECTION_POLICY_VERSION) push(errors, "selectionPolicyVersion", "VERSION", "selection policy version is invalid");
  if (typeof state.profileId !== "string" || !state.profileId) push(errors, "profileId", "IDENTITY", "profileId is required");
  else if (state.evaluationStateId !== createPracticeEvaluationStateId(state.profileId)) push(errors, "evaluationStateId", "IDENTITY_MISMATCH", "evaluation state ID does not match profile");
  if (!isIso(state.createdAt) || !isIso(state.updatedAt)) push(errors, "timestamps", "TIMESTAMP", "evaluation state timestamps are invalid");
  if (!PRACTICE_EVALUATION_HISTORY_STATUSES.includes(state.historyStatus)) push(errors, "historyStatus", "ENUM", "history status is invalid");
  if (!Array.isArray(state.activeReservations) || state.activeReservations.length > PRACTICE_EVALUATION_LIMITS.activeReservations) push(errors, "activeReservations", "LIMIT", "active reservations exceed limit");
  else state.activeReservations.forEach((entry, index) => {
    const validation = validatePracticeEvaluationReservation(entry);
    validation.errors.forEach((error) => push(errors, `activeReservations.${index}.${error.path}`, error.code, error.message));
    if (entry.profileId !== state.profileId) push(errors, `activeReservations.${index}.profileId`, "OWNERSHIP", "reservation belongs to another profile");
  });
  if (!Array.isArray(state.benchmarkSuites) || state.benchmarkSuites.length > PRACTICE_EVALUATION_LIMITS.benchmarkSuites) push(errors, "benchmarkSuites", "LIMIT", "benchmark suite state exceeds limit");
  if (!Array.isArray(state.transferPools) || state.transferPools.length > PRACTICE_EVALUATION_LIMITS.transferPools) push(errors, "transferPools", "LIMIT", "transfer pool state exceeds limit");
  for (const suite of state.benchmarkSuites ?? []) {
    if (!Array.isArray(suite.formExposures) || suite.formExposures.length > PRACTICE_EVALUATION_LIMITS.benchmarkFormsPerSuite) push(errors, "benchmarkSuites.formExposures", "LIMIT", "benchmark form exposures exceed limit");
  }
  for (const pool of state.transferPools ?? []) {
    if (!Array.isArray(pool.claimedUnitIds) || pool.claimedUnitIds.length > PRACTICE_EVALUATION_LIMITS.transferUnitsPerPool) push(errors, "transferPools.claimedUnitIds", "LIMIT", "claimed transfer units exceed limit");
    if (new Set(pool.claimedUnitIds ?? []).size !== (pool.claimedUnitIds ?? []).length) push(errors, "transferPools.claimedUnitIds", "DUPLICATE", "claimed transfer units must be unique");
  }
  const cap = PRACTICE_LIMITS.evaluationStateBytes ?? PRACTICE_EVALUATION_LIMITS.stateBytes;
  if (bytes(state) > cap) push(errors, "", "SIZE", "evaluation state exceeds configured byte limit");
  const json = JSON.stringify(state);
  for (const forbidden of ["typedText", "contentText", "mistyped", "eventTrace", "rawEvents"]) if (json.includes(`"${forbidden}"`)) push(errors, forbidden, "PRIVACY", "raw/private evaluation payload is forbidden");
  return { valid: errors.length === 0, errors };
}

export function validatePracticeEvaluationBinding(binding) {
  const errors = [];
  if (!plainObject(binding)) return { valid: false, errors: [{ path: "", code: "TYPE", message: "evaluation binding must be an object" }] };
  if (!PRACTICE_EVALUATION_KINDS.includes(binding.kind)) push(errors, "kind", "ENUM", "binding kind is invalid");
  if (!PRACTICE_EVALUATION_FRESHNESS_STATUSES.includes(binding.freshnessStatus)) push(errors, "freshnessStatus", "ENUM", "freshness status is invalid");
  for (const key of ["reservationId", "profileId", "contextId", "sessionId", "protocolId", "contentBindingHash"]) if (typeof binding[key] !== "string" || !binding[key]) push(errors, key, "IDENTITY", `${key} is required`);
  if (!isIso(binding.reservedAtUtc) || !isIso(binding.claimedAtUtc)) push(errors, "time", "TIMESTAMP", "binding timestamps are invalid");
  if (!Number.isInteger(binding.exposureOrdinal) || binding.exposureOrdinal < 1) push(errors, "exposureOrdinal", "RANGE", "exposureOrdinal must be positive");
  if (binding.kind === "benchmark") {
    if (typeof binding.suiteId !== "string" || typeof binding.formId !== "string") push(errors, "benchmark", "IDENTITY", "benchmark binding requires suite/form");
    if (binding.poolId != null || binding.unitId != null) push(errors, "transfer", "KIND_MISMATCH", "benchmark binding cannot contain transfer identity");
  } else if (binding.kind === "cold-transfer") {
    if (typeof binding.poolId !== "string" || typeof binding.unitId !== "string") push(errors, "transfer", "IDENTITY", "transfer binding requires pool/unit");
    if (binding.suiteId != null || binding.formId != null) push(errors, "benchmark", "KIND_MISMATCH", "transfer binding cannot contain benchmark identity");
    if (binding.freshnessStatus === "repeat") push(errors, "freshnessStatus", "TRANSFER_REPEAT", "cold transfer cannot be repeated");
  }
  return { valid: errors.length === 0, errors };
}

export function validatePracticeEvaluationIntegrity(integrity) {
  const errors = [];
  if (!plainObject(integrity)) return { valid: false, errors: [{ path: "", code: "TYPE", message: "integrity must be an object" }] };
  if (!PRACTICE_EVALUATION_INTEGRITY_STATUSES.includes(integrity.status)) push(errors, "status", "ENUM", "integrity status is invalid");
  if (!Array.isArray(integrity.reasons) || integrity.reasons.some((reason) => !PRACTICE_EVALUATION_INTEGRITY_REASON_CODES.includes(reason))) push(errors, "reasons", "ENUM", "integrity reasons are invalid");
  for (const key of ["skillEvidenceEligible", "abilityEligible", "transferEvidenceEligible", "benchmarkComparisonEligible", "coldVerificationEligible"]) if (typeof integrity[key] !== "boolean") push(errors, key, "TYPE", `${key} must be boolean`);
  return { valid: errors.length === 0, errors };
}

export function validatePracticeBenchmarkSuite(suite) {
  const errors = [];
  if (!plainObject(suite)) return { valid: false, errors: [{ path: "", code: "TYPE", message: "benchmark suite must be an object" }] };
  if (suite.suiteSchemaVersion !== PRACTICE_BENCHMARK_SUITE_SCHEMA_VERSION) push(errors, "suiteSchemaVersion", "VERSION", "benchmark suite schema version is invalid");
  if (!PRACTICE_BENCHMARK_SUITE_STATUSES.includes(suite.status)) push(errors, "status", "ENUM", "benchmark suite status is invalid");
  if (!PRACTICE_BENCHMARK_COMPARABILITY_CLASSES.includes(suite.comparabilityClass)) push(errors, "comparabilityClass", "ENUM", "comparability class is invalid");
  if (suite.comparabilityClass === "empirically-calibrated" && suite.calibration == null) push(errors, "calibration", "REQUIRED", "empirically calibrated suite requires calibration");
  if (suite.comparabilityClass === "engineering-matched" && suite.calibration != null) push(errors, "calibration", "UNSUPPORTED", "PL18 engineering-matched suite must not claim empirical calibration");
  if (!Array.isArray(suite.forms) || suite.forms.length > PRACTICE_EVALUATION_LIMITS.benchmarkFormsPerSuite) push(errors, "forms", "LIMIT", "benchmark forms invalid");
  for (const form of suite.forms ?? []) if (form.formVersion !== PRACTICE_BENCHMARK_FORM_VERSION) push(errors, "forms.formVersion", "VERSION", "benchmark form version is invalid");
  return { valid: errors.length === 0, errors };
}

export function validatePracticeTransferPool(pool) {
  const errors = [];
  if (!plainObject(pool)) return { valid: false, errors: [{ path: "", code: "TYPE", message: "transfer pool must be an object" }] };
  if (pool.poolSchemaVersion !== PRACTICE_TRANSFER_POOL_SCHEMA_VERSION) push(errors, "poolSchemaVersion", "VERSION", "transfer pool schema version is invalid");
  if (!["draft", "review", "ready", "retired"].includes(pool.status)) push(errors, "status", "ENUM", "transfer pool status is invalid");
  if (!Array.isArray(pool.units) || pool.units.length > PRACTICE_EVALUATION_LIMITS.transferUnitsPerPool) push(errors, "units", "LIMIT", "transfer units invalid");
  for (const unit of pool.units ?? []) if (unit.unitVersion !== PRACTICE_TRANSFER_UNIT_VERSION) push(errors, "units.unitVersion", "VERSION", "transfer unit version is invalid");
  return { valid: errors.length === 0, errors };
}

export function validatePracticeEvaluationSummary(summary) {
  const errors = [];
  if (!plainObject(summary)) return { valid: false, errors: [{ path: "", code: "TYPE", message: "evaluation summary must be an object" }] };
  if (!PRACTICE_EVALUATION_KINDS.includes(summary.kind)) push(errors, "kind", "ENUM", "evaluation summary kind is invalid");
  if (!PRACTICE_EVALUATION_FRESHNESS_STATUSES.includes(summary.freshnessStatus)) push(errors, "freshnessStatus", "ENUM", "evaluation summary freshness is invalid");
  if (!PRACTICE_EVALUATION_INTEGRITY_STATUSES.includes(summary.integrityStatus)) push(errors, "integrityStatus", "ENUM", "evaluation summary integrity is invalid");
  if (!Array.isArray(summary.integrityReasons) || summary.integrityReasons.some((reason) => !PRACTICE_EVALUATION_INTEGRITY_REASON_CODES.includes(reason))) push(errors, "integrityReasons", "ENUM", "evaluation summary integrity reasons are invalid");
  if (!Number.isInteger(summary.analysisVersion) || summary.analysisVersion < 1) push(errors, "analysisVersion", "VERSION", "evaluation analysis version is invalid");
  if (!Number.isInteger(summary.frameworkVersion) || summary.frameworkVersion < 1) push(errors, "frameworkVersion", "VERSION", "evaluation framework version is invalid");
  if (typeof summary.protocolId !== "string" || !summary.protocolId || !Number.isInteger(summary.protocolVersion) || summary.protocolVersion < 1) push(errors, "protocol", "IDENTITY", "evaluation protocol identity is invalid");
  if (!Number.isInteger(summary.exposureOrdinal) || summary.exposureOrdinal < 1) push(errors, "exposureOrdinal", "RANGE", "evaluation exposure ordinal is invalid");
  for (const key of ["skillEvidenceEligible", "transferEvidenceEligible", "abilityEligible", "benchmarkComparisonEligible"]) if (typeof summary[key] !== "boolean") push(errors, key, "TYPE", `${key} must be boolean`);
  for (const key of ["wpm", "accuracy", "adjustedWpm", "measurementSigmaLog"]) if (summary[key] != null && !Number.isFinite(summary[key])) push(errors, key, "TYPE", `${key} must be finite or null`);
  if (summary.kind === "benchmark") {
    if (typeof summary.suiteId !== "string" || typeof summary.formId !== "string") push(errors, "benchmark", "IDENTITY", "benchmark evaluation summary requires suite/form identity");
    if (summary.poolId != null || summary.unitId != null) push(errors, "transfer", "KIND_MISMATCH", "benchmark summary cannot contain transfer identity");
  } else if (summary.kind === "cold-transfer") {
    if (typeof summary.poolId !== "string" || typeof summary.unitId !== "string") push(errors, "transfer", "IDENTITY", "transfer evaluation summary requires pool/unit identity");
    if (summary.suiteId != null || summary.formId != null) push(errors, "benchmark", "KIND_MISMATCH", "transfer summary cannot contain benchmark identity");
    if (summary.freshnessStatus === "repeat") push(errors, "freshnessStatus", "TRANSFER_REPEAT", "cold transfer cannot be repeated");
  }
  return { valid: errors.length === 0, errors };
}
