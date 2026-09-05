import { PRACTICE_LIMITS, PRACTICE_RECORD_VERSIONS } from "./practiceConstants.js";
import { createPracticeLearningStateId, createSkillStatId, isPracticeId } from "./practiceIds.js";
import {
  PRACTICE_LEARNING_ANALYSIS_VERSION,
  PRACTICE_LEARNING_CURVE_CONFIDENCE_LEVELS,
  PRACTICE_LEARNING_CURVE_STATUSES,
  PRACTICE_LEARNING_CURVE_VERSION,
  PRACTICE_LEARNING_MODEL_VERSION,
  PRACTICE_LEARNING_OBSERVATION_KINDS,
  PRACTICE_LEARNING_OBSERVATION_VERSION,
  PRACTICE_LEARNING_POLICY_VERSION,
  PRACTICE_MARGINAL_GAIN_STATUSES,
} from "./practiceLearningConstants.js";
import { PRACTICE_LEARNING_POLICY_V1 } from "./practiceLearningPolicy.js";

const finite = Number.isFinite;
const FORBIDDEN_KEYS = new Set(["text", "contentText", "customText", "passage", "passageText", "rawEvents", "eventTrace", "targetPositions", "containingWords"]);

function push(errors, path, code, message) { errors.push({ path, code, message }); }
function inRange(value, min, max) { return finite(value) && value >= min && value <= max; }
function validTimestamp(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function validDay(value) { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value); }

function scanForbidden(value, errors, path = "learningState") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) push(errors, `${path}.${key}`, "FORBIDDEN_FIELD", `${key} is forbidden in PL16 learning records`);
    scanForbidden(child, errors, `${path}.${key}`);
  }
}

function validateCurve(curve, path, errors) {
  if (!curve || typeof curve !== "object" || Array.isArray(curve)) return push(errors, path, "INVALID_TYPE", "learning curve must be an object");
  if (curve.curveVersion !== PRACTICE_LEARNING_CURVE_VERSION) push(errors, `${path}.curveVersion`, "UNSUPPORTED_VERSION", "unsupported learning curve version");
  if (!PRACTICE_LEARNING_CURVE_STATUSES.includes(curve.status)) push(errors, `${path}.status`, "INVALID_ENUM", "invalid learning curve status");
  if (!PRACTICE_LEARNING_CURVE_CONFIDENCE_LEVELS.includes(curve.confidence)) push(errors, `${path}.confidence`, "INVALID_ENUM", "invalid learning curve confidence");
  if (!PRACTICE_LEARNING_CURVE_CONFIDENCE_LEVELS.includes(curve.recentConfidence)) push(errors, `${path}.recentConfidence`, "INVALID_ENUM", "invalid recent learning curve confidence");
  if (!PRACTICE_MARGINAL_GAIN_STATUSES.includes(curve.marginalGainStatus)) push(errors, `${path}.marginalGainStatus`, "INVALID_ENUM", "invalid marginal gain status");
  if (!["full-history", "recent-window"].includes(curve.scope)) push(errors, `${path}.scope`, "INVALID_ENUM", "invalid learning curve scope");
  for (const key of ["pointCount", "sessionCount", "dayCount"]) if (!Number.isInteger(curve[key]) || curve[key] < 0) push(errors, `${path}.${key}`, "OUT_OF_RANGE", `${key} must be non-negative integer`);
  if (!inRange(curve.doseSpan, 0, Infinity)) push(errors, `${path}.doseSpan`, "OUT_OF_RANGE", "doseSpan is invalid");
  for (const key of ["improvingPairFraction", "worseningPairFraction"]) if (curve[key] != null && !inRange(curve[key], 0, 1)) push(errors, `${path}.${key}`, "OUT_OF_RANGE", `${key} must be 0..1 or null`);
  for (const key of ["firstQuality", "recentQuality"]) if (curve[key] != null && !inRange(curve[key], 0, 100)) push(errors, `${path}.${key}`, "OUT_OF_RANGE", `${key} must be 0..100 or null`);
  const quantiles = [curve.slopeP10, curve.medianSlopePointsPerDose, curve.slopeP90];
  if (quantiles.every(finite) && !(quantiles[0] <= quantiles[1] + 1e-12 && quantiles[1] <= quantiles[2] + 1e-12)) push(errors, path, "QUANTILE_ORDER", "learning curve slope quantiles are inconsistent");
  if (curve.status === "insufficient-data" && curve.confidence !== "none") push(errors, `${path}.confidence`, "IMPOSSIBLE_RELATIONSHIP", "insufficient curve must have none confidence");
}

function validateQuality(value, path, errors, { nullable = true } = {}) {
  if (value == null && nullable) return;
  if (!inRange(value, 0, 100)) push(errors, path, "OUT_OF_RANGE", `${path} must be 0..100`);
}

function validateAcquisitionObservation(observation, path, errors, policy, { persisted }) {
  if (!observation || typeof observation !== "object") return push(errors, path, "INVALID_TYPE", "acquisition observation is required");
  if (observation.kind !== "acquisition") push(errors, `${path}.kind`, "INVALID_ENUM", "acquisition observation kind mismatch");
  if (!isPracticeId(observation.sessionId, "session")) push(errors, `${path}.sessionId`, "INVALID_ID", "invalid acquisition sessionId");
  if (!validTimestamp(observation.completedAtUtc)) push(errors, `${path}.completedAtUtc`, "INVALID_TIMESTAMP", "invalid acquisition timestamp");
  if (!validDay(observation.localDayKey)) push(errors, `${path}.localDayKey`, "INVALID_DAY", "invalid acquisition day key");
  if (!Number.isInteger(observation.opportunityCount) || observation.opportunityCount <= 0) push(errors, `${path}.opportunityCount`, "OUT_OF_RANGE", "acquisition opportunityCount must be positive integer");
  if (!finite(observation.doseUnits) || observation.doseUnits <= 0) push(errors, `${path}.doseUnits`, "OUT_OF_RANGE", "acquisition doseUnits must be positive");
  for (const key of ["wholeQuality", "entryQuality", "exitQuality"]) validateQuality(observation[key], `${path}.${key}`, errors);
  if (!inRange(observation.qualityCoverage, 0, 1)) push(errors, `${path}.qualityCoverage`, "OUT_OF_RANGE", "qualityCoverage must be 0..1");
  if (finite(observation.entryQuality) && finite(observation.exitQuality)) {
    if (!finite(observation.practiceGain) || Math.abs(observation.practiceGain - (observation.exitQuality - observation.entryQuality)) > 1e-9) push(errors, `${path}.practiceGain`, "IMPOSSIBLE_RELATIONSHIP", "practiceGain must equal exitQuality - entryQuality");
  } else if (observation.practiceGain != null) push(errors, `${path}.practiceGain`, "IMPOSSIBLE_RELATIONSHIP", "practiceGain requires entry and exit quality");
  if (persisted) {
    if (!finite(observation.cumulativeDoseBefore) || !finite(observation.cumulativeDoseAfter)) push(errors, path, "CUMULATIVE_DOSE", "persisted acquisition observation requires cumulative dose");
    else if (Math.abs(observation.cumulativeDoseAfter - observation.cumulativeDoseBefore - observation.doseUnits) > 1e-9) push(errors, `${path}.cumulativeDoseAfter`, "IMPOSSIBLE_RELATIONSHIP", "cumulativeDoseAfter must equal before + doseUnits");
  } else if (observation.cumulativeDoseBefore != null || observation.cumulativeDoseAfter != null) push(errors, path, "TRANSIENT_DOSE", "transient acquisition delta must not pre-stamp cumulative dose");
}

function validateTransferObservation(observation, path, errors, { persisted }) {
  if (!observation || typeof observation !== "object") return push(errors, path, "INVALID_TYPE", "transfer observation is required");
  if (observation.kind !== "transfer") push(errors, `${path}.kind`, "INVALID_ENUM", "transfer observation kind mismatch");
  if (!isPracticeId(observation.sessionId, "session")) push(errors, `${path}.sessionId`, "INVALID_ID", "invalid transfer sessionId");
  if (!validTimestamp(observation.completedAtUtc)) push(errors, `${path}.completedAtUtc`, "INVALID_TIMESTAMP", "invalid transfer timestamp");
  if (!validDay(observation.localDayKey)) push(errors, `${path}.localDayKey`, "INVALID_DAY", "invalid transfer day key");
  if (!Number.isInteger(observation.opportunityCount) || observation.opportunityCount <= 0) push(errors, `${path}.opportunityCount`, "OUT_OF_RANGE", "transfer opportunityCount must be positive integer");
  validateQuality(observation.quality, `${path}.quality`, errors, { nullable: false });
  if (!inRange(observation.qualityCoverage, 0, 1)) push(errors, `${path}.qualityCoverage`, "OUT_OF_RANGE", "transfer qualityCoverage must be 0..1");
  if (persisted) {
    if (!finite(observation.cumulativeDoseAtObservation) || observation.cumulativeDoseAtObservation < 0) push(errors, `${path}.cumulativeDoseAtObservation`, "OUT_OF_RANGE", "transfer cumulative dose must be non-negative");
    if (observation.timeSincePreviousAcquisitionMs != null && (!finite(observation.timeSincePreviousAcquisitionMs) || observation.timeSincePreviousAcquisitionMs < 0)) push(errors, `${path}.timeSincePreviousAcquisitionMs`, "OUT_OF_RANGE", "transfer delay must be non-negative");
  } else if (observation.cumulativeDoseAtObservation != null) push(errors, `${path}.cumulativeDoseAtObservation`, "TRANSIENT_DOSE", "transient transfer delta must not pre-stamp cumulative dose");
}

export function validatePracticeLearningObservationDelta(delta, policy = PRACTICE_LEARNING_POLICY_V1) {
  const errors = [];
  if (!delta || typeof delta !== "object" || Array.isArray(delta)) return { valid: false, errors: [{ path: "delta", code: "INVALID_TYPE", message: "learning observation delta must be an object" }] };
  if (delta.observationVersion !== PRACTICE_LEARNING_OBSERVATION_VERSION) push(errors, "observationVersion", "UNSUPPORTED_VERSION", "unsupported learning observation version");
  if (!PRACTICE_LEARNING_OBSERVATION_KINDS.includes(delta.kind)) push(errors, "kind", "INVALID_ENUM", "invalid learning observation kind");
  for (const [key, kind] of [["sessionId", "session"], ["profileId", "profile"], ["contextId", "context"]]) if (!isPracticeId(delta[key], kind)) push(errors, key, "INVALID_ID", `invalid ${key}`);
  if (!["key", "bigram", "trigram", "word"].includes(delta.entityType) || typeof delta.entityKey !== "string" || !delta.entityKey) push(errors, "entityKey", "INVALID_ENTITY", "invalid learning entity");
  if (delta.statId !== createSkillStatId(delta.profileId, delta.contextId, delta.entityType, delta.entityKey)) push(errors, "statId", "IDENTITY_MISMATCH", "learning statId does not match identity");
  if (delta.kind === "acquisition" && delta.evidenceRole !== "training") push(errors, "evidenceRole", "ROLE_MISMATCH", "acquisition observations require training role");
  if (delta.kind === "transfer" && delta.evidenceRole !== "transfer") push(errors, "evidenceRole", "ROLE_MISMATCH", "transfer observations require transfer role");
  if (typeof delta.experimentId !== "string" || !delta.experimentId || delta.experimentId.length > 100) push(errors, "experimentId", "INVALID_STRING", "experimentId must be bounded");
  if (delta.kind === "acquisition") {
    validateAcquisitionObservation(delta.observation, "observation", errors, policy, { persisted: false });
    const scale = policy.doseScales?.[delta.entityType];
    if (finite(scale) && Math.abs(delta.observation?.doseUnits - delta.observation?.opportunityCount / scale) > 1e-9) push(errors, "observation.doseUnits", "DOSE_INVARIANT", "doseUnits must equal target opportunities / entity dose scale");
  } else if (delta.kind === "transfer") validateTransferObservation(delta.observation, "observation", errors, { persisted: false });
  scanForbidden(delta, errors, "delta");
  return { valid: errors.length === 0, errors };
}

export function validatePracticeLearningObservationBatch(deltas, { sessionId, profileId, contextId, policy = PRACTICE_LEARNING_POLICY_V1 } = {}) {
  const errors = [];
  if (!Array.isArray(deltas) || deltas.length > 1024) return { valid: false, errors: [{ path: "learningObservationDeltas", code: "ARRAY_LIMIT", message: "learning observation batch is invalid or oversized" }] };
  const seen = new Set();
  for (let index = 0; index < deltas.length; index += 1) {
    const delta = deltas[index];
    const validation = validatePracticeLearningObservationDelta(delta, policy);
    for (const entry of validation.errors) errors.push({ ...entry, path: `learningObservationDeltas[${index}].${entry.path}` });
    const key = `${delta?.kind}|${delta?.statId}`;
    if (seen.has(key)) push(errors, `learningObservationDeltas[${index}]`, "DUPLICATE", "duplicate entity/kind learning observation in session");
    seen.add(key);
    if (sessionId != null && delta?.sessionId !== sessionId) push(errors, `learningObservationDeltas[${index}].sessionId`, "SESSION_MISMATCH", "learning sessionId mismatch");
    if (profileId != null && delta?.profileId !== profileId) push(errors, `learningObservationDeltas[${index}].profileId`, "PROFILE_MISMATCH", "learning profileId mismatch");
    if (contextId != null && delta?.contextId !== contextId) push(errors, `learningObservationDeltas[${index}].contextId`, "CONTEXT_MISMATCH", "learning contextId mismatch");
  }
  return { valid: errors.length === 0, errors };
}

export function validatePracticeLearningEvidenceSummary(summary) {
  const errors = [];
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return { valid: false, errors: [{ path: "learningEvidenceSummary", code: "INVALID_TYPE", message: "learningEvidenceSummary must be an object" }] };
  if (summary.analysisVersion !== PRACTICE_LEARNING_ANALYSIS_VERSION) push(errors, "analysisVersion", "UNSUPPORTED_VERSION", "unsupported learning analysis version");
  if (summary.observationVersion !== PRACTICE_LEARNING_OBSERVATION_VERSION) push(errors, "observationVersion", "UNSUPPORTED_VERSION", "unsupported learning observation version");
  for (const key of ["acquisitionObservationCount", "transferObservationCount", "completePhaseObservationCount", "partialPhaseObservationCount", "skippedCount", "learningStateUpdateCount"]) if (!Number.isInteger(summary[key]) || summary[key] < 0) push(errors, key, "OUT_OF_RANGE", `${key} must be non-negative integer`);
  if (summary.learningStateUpdateCount !== summary.acquisitionObservationCount + summary.transferObservationCount) push(errors, "learningStateUpdateCount", "COUNT_MISMATCH", "learningStateUpdateCount must equal acquisition + transfer observations");
  const allowed = new Set(["analysisVersion", "observationVersion", "acquisitionObservationCount", "transferObservationCount", "completePhaseObservationCount", "partialPhaseObservationCount", "skippedCount", "learningStateUpdateCount"]);
  for (const key of Object.keys(summary)) if (!allowed.has(key)) push(errors, key, "FORBIDDEN_FIELD", "learningEvidenceSummary may contain counts only");
  return { valid: errors.length === 0, errors };
}

export function validatePracticeLearningState(state, { policy = PRACTICE_LEARNING_POLICY_V1, maxBytes = PRACTICE_LIMITS.learningStateBytes } = {}) {
  const errors = [];
  if (!state || typeof state !== "object" || Array.isArray(state)) return { valid: false, errors: [{ path: "learningState", code: "INVALID_TYPE", message: "learningState must be an object" }] };
  if (state.recordVersion !== PRACTICE_RECORD_VERSIONS.learningState) push(errors, "recordVersion", "UNSUPPORTED_VERSION", "unsupported learningState record version");
  if (state.modelVersion !== PRACTICE_LEARNING_MODEL_VERSION || state.policyVersion !== PRACTICE_LEARNING_POLICY_VERSION) push(errors, "modelVersion", "UNSUPPORTED_VERSION", "unsupported learning model/policy version");
  if (!isPracticeId(state.profileId, "profile") || !isPracticeId(state.contextId, "context")) push(errors, "profileId", "INVALID_ID", "learning state profile/context identity is invalid");
  if (!["key", "bigram", "trigram", "word"].includes(state.entityType) || typeof state.entityKey !== "string" || !state.entityKey) push(errors, "entityKey", "INVALID_ENTITY", "invalid learning entity");
  if (state.learningStateId !== createPracticeLearningStateId(state.profileId, state.contextId, state.entityType, state.entityKey)) push(errors, "learningStateId", "IDENTITY_MISMATCH", "learningStateId does not match identity");
  if (state.statId !== createSkillStatId(state.profileId, state.contextId, state.entityType, state.entityKey)) push(errors, "statId", "IDENTITY_MISMATCH", "learning statId does not match identity");
  for (const key of ["createdAt", "updatedAt"]) if (!validTimestamp(state[key])) push(errors, key, "INVALID_TIMESTAMP", `invalid ${key}`);

  const acquisition = state.acquisition;
  if (!acquisition || typeof acquisition !== "object") push(errors, "acquisition", "INVALID_TYPE", "acquisition state is required");
  else {
    for (const key of ["cumulativeTargetOpportunities", "observationCount", "sessionCount", "dayCount"]) if (!Number.isInteger(acquisition[key]) || acquisition[key] < 0) push(errors, `acquisition.${key}`, "OUT_OF_RANGE", `${key} must be non-negative integer`);
    if (!finite(acquisition.cumulativeDoseUnits) || acquisition.cumulativeDoseUnits < 0) push(errors, "acquisition.cumulativeDoseUnits", "OUT_OF_RANGE", "cumulativeDoseUnits is invalid");
    if (!Array.isArray(acquisition.observations) || acquisition.observations.length > policy.rings.acquisition) push(errors, "acquisition.observations", "ARRAY_LIMIT", "acquisition observation ring exceeds limit");
    else {
      let previousTime = -Infinity;
      let previousDose = -Infinity;
      for (const [index, observation] of acquisition.observations.entries()) {
        validateAcquisitionObservation(observation, `acquisition.observations[${index}]`, errors, policy, { persisted: true });
        const time = Date.parse(observation.completedAtUtc);
        if (time < previousTime) push(errors, `acquisition.observations[${index}]`, "OUT_OF_ORDER", "acquisition ring must remain chronological");
        if (finite(observation.cumulativeDoseBefore) && observation.cumulativeDoseBefore < previousDose - 1e-9) push(errors, `acquisition.observations[${index}].cumulativeDoseBefore`, "OUT_OF_ORDER", "acquisition cumulative dose must not decrease");
        previousTime = time;
        previousDose = observation.cumulativeDoseBefore;
      }
    }
    validateCurve(acquisition.curve, "acquisition.curve", errors);
  }

  const transfer = state.transfer;
  if (!transfer || typeof transfer !== "object") push(errors, "transfer", "INVALID_TYPE", "transfer state is required");
  else {
    for (const key of ["observationCount", "sessionCount", "dayCount"]) if (!Number.isInteger(transfer[key]) || transfer[key] < 0) push(errors, `transfer.${key}`, "OUT_OF_RANGE", `${key} must be non-negative integer`);
    if (!Array.isArray(transfer.observations) || transfer.observations.length > policy.rings.transfer) push(errors, "transfer.observations", "ARRAY_LIMIT", "transfer observation ring exceeds limit");
    else {
      let previousTime = -Infinity;
      let previousDose = -Infinity;
      for (const [index, observation] of transfer.observations.entries()) {
        validateTransferObservation(observation, `transfer.observations[${index}]`, errors, { persisted: true });
        const time = Date.parse(observation.completedAtUtc);
        if (time < previousTime) push(errors, `transfer.observations[${index}]`, "OUT_OF_ORDER", "transfer ring must remain chronological");
        if (finite(observation.cumulativeDoseAtObservation) && observation.cumulativeDoseAtObservation < previousDose - 1e-9) push(errors, `transfer.observations[${index}].cumulativeDoseAtObservation`, "OUT_OF_ORDER", "transfer cumulative dose must not decrease");
        previousTime = time;
        previousDose = observation.cumulativeDoseAtObservation;
      }
    }
    validateCurve(transfer.curve, "transfer.curve", errors);
  }
  scanForbidden(state, errors);
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(state)).byteLength;
    if (bytes > maxBytes) push(errors, "learningState", "SERIALIZED_SIZE", `learningState exceeds ${maxBytes} bytes`);
  } catch { push(errors, "learningState", "UNSERIALIZABLE", "learningState is not JSON-safe"); }
  return { valid: errors.length === 0, errors };
}
