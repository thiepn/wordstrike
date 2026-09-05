import {
  PRACTICE_ABILITY_ANALYSIS_VERSION,
  PRACTICE_ABILITY_ASSESSMENT_STATUSES,
  PRACTICE_ABILITY_CHANNELS,
  PRACTICE_ABILITY_CONFIDENCE_LEVELS,
  PRACTICE_ABILITY_ESTIMATOR_VERSION,
  PRACTICE_ABILITY_OBSERVATION_VERSION,
  PRACTICE_ABILITY_POLICY_VERSION,
  PRACTICE_ABILITY_REASON_CODES,
  PRACTICE_ABILITY_SOURCE_ROLES,
  PRACTICE_ABILITY_STATUSES,
} from "./practiceAbilityConstants.js";
import { PRACTICE_ABILITY_POLICY_V1 } from "./practiceAbilityPolicy.js";
import { derivePracticeAbilityEstimate } from "./practiceAbilityEstimator.js";
import { createPracticeAbilityStateId, isPracticeId } from "./practiceIds.js";

const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const finiteOrNull = (value) => value == null || Number.isFinite(value);
const approx = (a, b, tolerance = 1e-9) => a === b || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b)));
const add = (errors, path, code, message) => errors.push({ path, code, message });
const byteLength = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

export function validatePracticeAbilityObservation(observation) {
  const errors = [];
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) return { valid: false, errors: [{ path: "observation", code: "INVALID_TYPE", message: "ability observation must be an object" }] };
  if (observation.observationVersion !== PRACTICE_ABILITY_OBSERVATION_VERSION) add(errors, "observationVersion", "INVALID_VERSION", "unsupported ability observation version");
  if (!isPracticeId(observation.sessionId, "session")) add(errors, "sessionId", "INVALID_ID", "invalid session ID");
  if (!isPracticeId(observation.profileId, "profile")) add(errors, "profileId", "INVALID_ID", "invalid profile ID");
  if (!isPracticeId(observation.contextId, "context")) add(errors, "contextId", "INVALID_ID", "invalid context ID");
  if (!PRACTICE_ABILITY_CHANNELS.includes(observation.channel)) add(errors, "channel", "INVALID_ENUM", "unsupported ability channel");
  if (!PRACTICE_ABILITY_SOURCE_ROLES.includes(observation.sourceRole) || ["custom", "unclassified"].includes(observation.sourceRole)) add(errors, "sourceRole", "INVALID_ENUM", "source role cannot update PL13 ability");
  if (typeof observation.completedAtUtc !== "string" || !UTC_ISO.test(observation.completedAtUtc) || !Number.isFinite(Date.parse(observation.completedAtUtc))) add(errors, "completedAtUtc", "INVALID_TIMESTAMP", "invalid completion timestamp");
  if (typeof observation.localDayKey !== "string" || !DAY_KEY.test(observation.localDayKey)) add(errors, "localDayKey", "INVALID_DAY", "invalid local day key");
  for (const key of ["wpm", "adjustedWpm", "adjustedLogPerformance", "accuracy", "activeDurationMs", "measurementSigmaLog", "measurementVarianceLog", "reliabilityWeight", "difficultyAdjustmentLog", "difficultyCoverage"]) if (!Number.isFinite(observation[key])) add(errors, key, "INVALID_NUMBER", `${key} must be finite`);
  if (!(observation.wpm > 0) || !(observation.adjustedWpm > 0)) add(errors, "wpm", "OUT_OF_RANGE", "ability WPM values must be positive");
  if (observation.accuracy < 0 || observation.accuracy > 100) add(errors, "accuracy", "OUT_OF_RANGE", "accuracy must be 0..100");
  if (observation.activeDurationMs < 0 || !Number.isInteger(observation.typedCharacterCount) || observation.typedCharacterCount < 0) add(errors, "volume", "OUT_OF_RANGE", "duration/typed characters are invalid");
  if (!finiteOrNull(observation.rawWpm) || !finiteOrNull(observation.difficultyIndex)) add(errors, "optionalMetrics", "INVALID_NUMBER", "optional metrics must be finite or null");
  if (!["full", "partial", "insufficient", "unsupported-language"].includes(observation.difficultyModelStatus)) add(errors, "difficultyModelStatus", "INVALID_ENUM", "invalid difficulty model status");
  if (observation.difficultyCoverage < 0 || observation.difficultyCoverage > 1) add(errors, "difficultyCoverage", "OUT_OF_RANGE", "difficulty coverage must be 0..1");
  if (observation.measurementSigmaLog < PRACTICE_ABILITY_POLICY_V1.uncertainty.sigmaFloor - 1e-12 || observation.measurementSigmaLog > PRACTICE_ABILITY_POLICY_V1.uncertainty.sigmaCeiling + 1e-12) add(errors, "measurementSigmaLog", "OUT_OF_RANGE", "measurement sigma is outside policy bounds");
  if (!approx(observation.measurementVarianceLog, observation.measurementSigmaLog ** 2)) add(errors, "measurementVarianceLog", "INVARIANT", "measurement variance must equal sigma squared");
  if (!approx(Math.log(observation.adjustedWpm), observation.adjustedLogPerformance)) add(errors, "adjustedWpm", "INVARIANT", "adjusted WPM must match log performance");
  return { valid: errors.length === 0, errors };
}

export function validatePracticeAbilityMeasurementSummary(summary) {
  const errors = [];
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return { valid: false, errors: [{ path: "abilityMeasurementSummary", code: "INVALID_TYPE", message: "ability measurement summary must be an object" }] };
  if (summary.analysisVersion !== PRACTICE_ABILITY_ANALYSIS_VERSION || summary.observationVersion !== PRACTICE_ABILITY_OBSERVATION_VERSION) add(errors, "version", "INVALID_VERSION", "ability measurement summary version is invalid");
  if (!PRACTICE_ABILITY_CHANNELS.includes(summary.channel)) add(errors, "channel", "INVALID_ENUM", "ability measurement channel is invalid");
  if (!PRACTICE_ABILITY_ASSESSMENT_STATUSES.includes(summary.status) || summary.status === "not-requested") add(errors, "status", "INVALID_ENUM", "persisted ability measurement status is invalid");
  if (!Array.isArray(summary.reasons) || summary.reasons.length > PRACTICE_ABILITY_REASON_CODES.length || summary.reasons.some((reason) => !PRACTICE_ABILITY_REASON_CODES.includes(reason))) add(errors, "reasons", "INVALID_ENUM", "ability measurement reasons are invalid");
  if (summary.status === "eligible") {
    if (!PRACTICE_ABILITY_SOURCE_ROLES.includes(summary.sourceRole) || ["custom", "unclassified"].includes(summary.sourceRole)) add(errors, "sourceRole", "INVALID_ENUM", "eligible ability source role is invalid");
    for (const key of ["adjustedWpm", "measurementSigmaLog", "reliabilityWeight", "difficultyAdjustmentLog"]) if (!Number.isFinite(summary[key])) add(errors, key, "INVALID_NUMBER", `${key} must be finite for eligible measurement`);
  }
  if (summary.status === "not-eligible" && ["adjustedWpm", "measurementSigmaLog", "reliabilityWeight", "difficultyAdjustmentLog"].some((key) => summary[key] != null)) add(errors, "metrics", "INVARIANT", "ineligible measurement must not persist observation metrics");
  if (summary.difficultyModelStatus != null && !["full", "partial", "insufficient", "unsupported-language"].includes(summary.difficultyModelStatus)) add(errors, "difficultyModelStatus", "INVALID_ENUM", "invalid difficulty model status");
  return { valid: errors.length === 0, errors };
}

export function validatePracticeAbilityState(state, { maxBytes = 32 * 1024, policy = PRACTICE_ABILITY_POLICY_V1 } = {}) {
  const errors = [];
  if (!state || typeof state !== "object" || Array.isArray(state)) return { valid: false, errors: [{ path: "abilityState", code: "INVALID_TYPE", message: "ability state must be an object" }] };
  if (!isPracticeId(state.profileId, "profile") || !isPracticeId(state.contextId, "context")) add(errors, "identity", "INVALID_ID", "ability state profile/context identity is invalid");
  if (!PRACTICE_ABILITY_CHANNELS.includes(state.channel)) add(errors, "channel", "INVALID_ENUM", "ability state channel is invalid");
  if (state.abilityStateId !== createPracticeAbilityStateId(state.profileId, state.contextId, state.channel)) add(errors, "abilityStateId", "IDENTITY_MISMATCH", "ability state ID does not match identity");
  if (state.recordVersion !== 1 || state.estimatorVersion !== PRACTICE_ABILITY_ESTIMATOR_VERSION || state.estimatorPolicyVersion !== PRACTICE_ABILITY_POLICY_VERSION) add(errors, "versions", "INVALID_VERSION", "ability state version is invalid");
  for (const key of ["createdAt", "updatedAt"]) if (typeof state[key] !== "string" || !UTC_ISO.test(state[key]) || !Number.isFinite(Date.parse(state[key]))) add(errors, key, "INVALID_TIMESTAMP", `${key} is invalid`);
  const evidence = state.evidence;
  for (const key of ["observationCount", "sessionCount", "dayCount", "totalTypedCharacters", "downweightedObservationCount"]) if (!Number.isInteger(evidence?.[key]) || evidence[key] < 0) add(errors, `evidence.${key}`, "INVALID_COUNT", `${key} must be a non-negative integer`);
  if (!Number.isFinite(evidence?.totalActiveDurationMs) || evidence.totalActiveDurationMs < 0) add(errors, "evidence.totalActiveDurationMs", "INVALID_NUMBER", "totalActiveDurationMs must be finite and non-negative");
  if (evidence?.sessionCount !== evidence?.observationCount) add(errors, "evidence.sessionCount", "INVARIANT", "v1 sessionCount must equal observationCount");
  if (evidence?.dayCount > evidence?.observationCount || evidence?.downweightedObservationCount > evidence?.observationCount) add(errors, "evidence", "INVARIANT", "ability evidence counts are inconsistent");
  const roles = evidence?.sourceRoleCounts;
  if (!roles || PRACTICE_ABILITY_SOURCE_ROLES.some((role) => !Number.isInteger(roles[role]) || roles[role] < 0)) add(errors, "evidence.sourceRoleCounts", "INVALID_COUNT", "source role counts are invalid");
  else if (PRACTICE_ABILITY_SOURCE_ROLES.reduce((sum, role) => sum + roles[role], 0) !== evidence.observationCount) add(errors, "evidence.sourceRoleCounts", "INVARIANT", "source role counts must sum to observation count");
  if (evidence?.observationCount === 0) {
    if (evidence.firstObservedAt != null || evidence.lastObservedAt != null || evidence.lastObservedDayKey != null) add(errors, "evidence", "INVARIANT", "unmeasured evidence timestamps must be null");
  } else if (!UTC_ISO.test(evidence?.firstObservedAt || "") || !UTC_ISO.test(evidence?.lastObservedAt || "") || !DAY_KEY.test(evidence?.lastObservedDayKey || "")) add(errors, "evidence", "INVALID_TIMESTAMP", "measured evidence timestamps are invalid");
  if (!Array.isArray(state.recentObservations) || state.recentObservations.length > policy.recentObservationLimit) add(errors, "recentObservations", "SIZE_LIMIT", "recent observations exceed bound");
  else for (const item of state.recentObservations) {
    if (!isPracticeId(item?.sessionId, "session") || item?.channel !== state.channel || !PRACTICE_ABILITY_SOURCE_ROLES.includes(item?.sourceRole)) add(errors, "recentObservations", "INVALID_ENTRY", "recent observation identity is invalid");
    for (const key of ["adjustedWpm", "accuracy", "activeDurationMs", "typedCharacterCount", "measurementSigmaLog", "reliabilityWeight"]) if (!Number.isFinite(item?.[key])) add(errors, `recentObservations.${key}`, "INVALID_NUMBER", "recent observation metric must be finite");
    if (!finiteOrNull(item?.rawWpm) || !finiteOrNull(item?.difficultyIndex) || !finiteOrNull(item?.innovationLog)) add(errors, "recentObservations.optional", "INVALID_NUMBER", "recent optional metric must be finite or null");
  }
  const estimate = state.estimate;
  if (!PRACTICE_ABILITY_STATUSES.includes(estimate?.status) || !PRACTICE_ABILITY_CONFIDENCE_LEVELS.includes(estimate?.confidenceLevel)) add(errors, "estimate", "INVALID_ENUM", "ability estimate status/confidence is invalid");
  let expected = null;
  try { expected = derivePracticeAbilityEstimate({ meanLogWpm: estimate?.meanLogWpm, varianceLogWpm: estimate?.varianceLogWpm, evidence, policy }); } catch (cause) { add(errors, "estimate", "INVALID_ESTIMATE", cause.message); }
  if (expected) for (const key of ["status", "meanLogWpm", "varianceLogWpm", "estimateWpm", "interval95LowerWpm", "interval95UpperWpm", "relativeIntervalWidth", "confidenceLevel", "smallestReliableRelativeChange", "smallestReliableChangeWpm"]) {
    if (typeof expected[key] === "number" ? !approx(estimate?.[key], expected[key]) : estimate?.[key] !== expected[key]) add(errors, `estimate.${key}`, "INVARIANT", `${key} does not match estimator policy`);
  }
  if (Number.isFinite(estimate?.estimateWpm) && !(estimate.interval95LowerWpm <= estimate.estimateWpm && estimate.estimateWpm <= estimate.interval95UpperWpm)) add(errors, "estimate.interval", "INVARIANT", "ability estimate must lie inside model interval");
  try { if (byteLength(state) > maxBytes) add(errors, "abilityState", "SIZE_LIMIT", "ability state exceeds serialized size cap"); } catch { add(errors, "abilityState", "UNSERIALIZABLE", "ability state must be JSON serializable"); }
  return { valid: errors.length === 0, errors };
}
