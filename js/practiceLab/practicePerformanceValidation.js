import { PRACTICE_ABILITY_CHANNELS } from "./practiceAbilityConstants.js";
import { createPracticePerformanceStateId, isPracticeId } from "./practiceIds.js";
import {
  PRACTICE_CONTROL_METRIC_COVERAGE,
  PRACTICE_CONTROL_QUALITY_STATES,
  PRACTICE_FRONTIER_BATCH_VERSION,
  PRACTICE_FRONTIER_MODEL_VERSION,
  PRACTICE_FRONTIER_OBSERVATION_VERSION,
  PRACTICE_FRONTIER_STATUSES,
  PRACTICE_PACE_STATES,
  PRACTICE_PERFORMANCE_ANALYSIS_VERSION,
  PRACTICE_PERFORMANCE_CONFIDENCE_LEVELS,
  PRACTICE_PERFORMANCE_DELTA_TYPES,
  PRACTICE_PERFORMANCE_MEASUREMENT_KINDS,
  PRACTICE_PERFORMANCE_MEASUREMENT_STATUSES,
  PRACTICE_PERFORMANCE_STATE_MODEL_VERSION,
  PRACTICE_PERFORMANCE_STATE_POLICY_VERSION,
  PRACTICE_READINESS_BANDS,
  PRACTICE_STATE_OBSERVATION_VERSION,
  PRACTICE_WARMUP_MODEL_VERSION,
  PRACTICE_WARMUP_STATUSES,
} from "./practicePerformanceConstants.js";
import { PRACTICE_FRONTIER_POLICY_V1, PRACTICE_STATE_PROBE_POLICY_V1, PRACTICE_WARMUP_POLICY_V1 } from "./practicePerformancePolicy.js";
import { derivePracticeReadinessBand } from "./practiceStateProbe.js";

const UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const add = (errors, path, code, message) => errors.push({ path, code, message });
const finiteOrNull = (value) => value == null || Number.isFinite(value);
const byteLength = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
const approx = (a, b, tolerance = 1e-8) => a === b || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b)));

function timestamp(errors, value, path) {
  if (typeof value !== "string" || !UTC_ISO.test(value) || !Number.isFinite(Date.parse(value))) add(errors, path, "INVALID_TIMESTAMP", `${path} must be UTC ISO`);
}
function id(errors, value, path, kind) {
  if (!isPracticeId(value, kind)) add(errors, path, "INVALID_ID", `${path} is invalid`);
}
function forbiddenContent(errors, value, path = "performanceState") {
  if (!value || typeof value !== "object") return;
  const forbidden = new Set(["text", "customText", "customTextId", "eventTrace", "rawEvents", "rawEventTrace", "wordList", "containingWords", "sentenceExcerpt", "targetEntities", "entityKey"]);
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) add(errors, `${path}.${key}`, "FORBIDDEN_FIELD", `${key} is forbidden in persisted performance state`);
    forbiddenContent(errors, child, `${path}.${key}`);
  }
}

export function validatePracticeStateObservation(observation) {
  const errors = [];
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) return { valid: false, errors: [{ path: "stateObservation", code: "INVALID_TYPE", message: "state observation must be an object" }] };
  if (observation.observationVersion !== PRACTICE_STATE_OBSERVATION_VERSION) add(errors, "observationVersion", "INVALID_VERSION", "state observation version is invalid");
  id(errors, observation.sessionId, "sessionId", "session");
  id(errors, observation.profileId, "profileId", "profile");
  id(errors, observation.contextId, "contextId", "context");
  if (!PRACTICE_ABILITY_CHANNELS.includes(observation.referenceChannel)) add(errors, "referenceChannel", "INVALID_ENUM", "reference channel is invalid");
  timestamp(errors, observation.measuredAt, "measuredAt");
  timestamp(errors, observation.validUntil, "validUntil");
  if (Number.isFinite(Date.parse(observation.measuredAt)) && Number.isFinite(Date.parse(observation.validUntil)) && Date.parse(observation.validUntil) <= Date.parse(observation.measuredAt)) add(errors, "validUntil", "INVARIANT", "validUntil must follow measuredAt");
  for (const key of ["adjustedWpm", "adjustedLogPerformance", "referenceAbilityWpm", "referenceAbilityVariance", "innovationLog", "relativeStateDelta", "combinedSigmaLog", "stateZ", "accuracy"]) if (!Number.isFinite(observation[key])) add(errors, key, "INVALID_NUMBER", `${key} must be finite`);
  if (!(observation.adjustedWpm > 0) || !(observation.referenceAbilityWpm > 0) || !(observation.combinedSigmaLog > 0) || observation.referenceAbilityVariance < 0) add(errors, "measurement", "OUT_OF_RANGE", "state measurement values are outside valid bounds");
  if (!finiteOrNull(observation.baselineAccuracy)) add(errors, "baselineAccuracy", "INVALID_NUMBER", "baseline accuracy must be finite or null");
  if (Number.isFinite(observation.baselineAccuracy) && (observation.baselineAccuracy < 0 || observation.baselineAccuracy > 100)) add(errors, "baselineAccuracy", "OUT_OF_RANGE", "baseline accuracy must be 0..100");
  if (!PRACTICE_PACE_STATES.includes(observation.paceState)) add(errors, "paceState", "INVALID_ENUM", "pace state is invalid");
  if (!PRACTICE_CONTROL_QUALITY_STATES.includes(observation.controlQuality)) add(errors, "controlQuality", "INVALID_ENUM", "control quality is invalid");
  if (!PRACTICE_READINESS_BANDS.includes(observation.readinessBand)) add(errors, "readinessBand", "INVALID_ENUM", "readiness band is invalid");
  if (!PRACTICE_PERFORMANCE_CONFIDENCE_LEVELS.includes(observation.measurementConfidence)) add(errors, "measurementConfidence", "INVALID_ENUM", "measurement confidence is invalid");
  if (!approx(Math.exp(observation.adjustedLogPerformance), observation.adjustedWpm)) add(errors, "adjustedWpm", "INVARIANT", "adjusted WPM must match log performance");
  if (!approx(Math.exp(observation.innovationLog) - 1, observation.relativeStateDelta)) add(errors, "relativeStateDelta", "INVARIANT", "relative state delta must match innovation");
  const expectedZ = observation.innovationLog / observation.combinedSigmaLog;
  if (!approx(expectedZ, observation.stateZ)) add(errors, "stateZ", "INVARIANT", "state z must equal innovation / combined sigma");
  const above = observation.relativeStateDelta >= PRACTICE_STATE_PROBE_POLICY_V1.minimumStateRelativeDelta && observation.stateZ >= PRACTICE_STATE_PROBE_POLICY_V1.stateZThreshold;
  const below = observation.relativeStateDelta <= -PRACTICE_STATE_PROBE_POLICY_V1.minimumStateRelativeDelta && observation.stateZ <= -PRACTICE_STATE_PROBE_POLICY_V1.stateZThreshold;
  const classifiable = observation.combinedSigmaLog <= PRACTICE_STATE_PROBE_POLICY_V1.maximumCombinedSigmaLogForClassification;
  if (observation.paceState === "above-typical" && (!classifiable || !above)) add(errors, "paceState", "INVARIANT", "above-typical does not satisfy v1 thresholds");
  if (observation.paceState === "below-typical" && (!classifiable || !below)) add(errors, "paceState", "INVARIANT", "below-typical does not satisfy v1 thresholds");
  if (observation.paceState === "typical" && (!classifiable || above || below)) add(errors, "paceState", "INVARIANT", "typical does not satisfy v1 thresholds");
  if (observation.paceState === "uncertain" && classifiable) add(errors, "paceState", "INVARIANT", "uncertain requires excessive combined uncertainty for persisted v1 state");
  const expectedReadiness = derivePracticeReadinessBand({ paceState: observation.paceState, controlQuality: observation.controlQuality, sufficientEvidence: classifiable });
  if (observation.readinessBand !== expectedReadiness) add(errors, "readinessBand", "INVARIANT", "readiness does not match pace/control mapping");
  return { valid: errors.length === 0, errors };
}

export function validatePracticeWarmupObservation(observation) {
  const errors = [];
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) return { valid: false, errors: [{ path: "warmupObservation", code: "INVALID_TYPE", message: "warm-up observation must be an object" }] };
  if (observation.version !== PRACTICE_WARMUP_MODEL_VERSION) add(errors, "version", "INVALID_VERSION", "warm-up observation version is invalid");
  id(errors, observation.sessionId, "sessionId", "session");
  timestamp(errors, observation.completedAtUtc, "completedAtUtc");
  if (!DAY_KEY.test(observation.localDayKey || "")) add(errors, "localDayKey", "INVALID_DAY", "warm-up local day is invalid");
  if (!PRACTICE_ABILITY_CHANNELS.includes(observation.referenceChannel)) add(errors, "referenceChannel", "INVALID_ENUM", "warm-up reference channel is invalid");
  for (const key of ["earlyFirstPassWpm", "lateFirstPassWpm", "warmupGainLog", "warmupGainRelative", "earlyAccuracy", "lateAccuracy"]) if (!Number.isFinite(observation[key])) add(errors, key, "INVALID_NUMBER", `${key} must be finite`);
  if (observation.earlyFirstPassWpm <= 0 || observation.lateFirstPassWpm <= 0) add(errors, "pace", "OUT_OF_RANGE", "warm-up pace must be positive");
  if (!approx(Math.exp(observation.warmupGainLog) - 1, observation.warmupGainRelative)) add(errors, "warmupGainRelative", "INVARIANT", "warm-up gain must match log gain");
  if (!finiteOrNull(observation.fluentSpeedGainLog) || !finiteOrNull(observation.warmupDurationMs)) add(errors, "optional", "INVALID_NUMBER", "optional warm-up metrics must be finite or null");
  if (Number.isFinite(observation.warmupDurationMs) && (observation.warmupDurationMs < 0 || observation.warmupDurationMs >= PRACTICE_WARMUP_POLICY_V1.maximumAnalysisDurationMs)) add(errors, "warmupDurationMs", "OUT_OF_RANGE", "warm-up duration is outside analysis horizon");
  if (typeof observation.controlDegraded !== "boolean") add(errors, "controlDegraded", "INVALID_TYPE", "controlDegraded must be boolean");
  if (!PRACTICE_PERFORMANCE_CONFIDENCE_LEVELS.includes(observation.confidence)) add(errors, "confidence", "INVALID_ENUM", "warm-up confidence is invalid");
  return { valid: errors.length === 0, errors };
}

export function validatePracticeWarmupModel(model) {
  const errors = [];
  if (!model || typeof model !== "object" || Array.isArray(model)) return { valid: false, errors: [{ path: "warmupModel", code: "INVALID_TYPE", message: "warm-up model must be an object" }] };
  if (model.modelVersion !== PRACTICE_WARMUP_MODEL_VERSION) add(errors, "modelVersion", "INVALID_VERSION", "warm-up model version is invalid");
  if (!PRACTICE_WARMUP_STATUSES.includes(model.status) || !PRACTICE_PERFORMANCE_CONFIDENCE_LEVELS.includes(model.confidence)) add(errors, "status", "INVALID_ENUM", "warm-up status/confidence is invalid");
  for (const key of ["sampleCount", "dayCount"]) if (!Number.isInteger(model[key]) || model[key] < 0) add(errors, key, "INVALID_COUNT", `${key} must be a non-negative integer`);
  for (const key of ["typicalWarmupGainLog", "typicalWarmupGainRelative", "warmupGainMadLog", "typicalWarmupDurationMs", "plateauEstimateFraction", "controlDegradedFraction"]) if (!finiteOrNull(model[key])) add(errors, key, "INVALID_NUMBER", `${key} must be finite or null`);
  if (model.sampleCount === 0 && (model.status !== "insufficient-data" || [model.typicalWarmupGainLog, model.typicalWarmupGainRelative, model.typicalWarmupDurationMs].some((value) => value != null))) add(errors, "sampleCount", "INVARIANT", "empty warm-up model must remain insufficient/null");
  return { valid: errors.length === 0, errors };
}

export function validatePracticeFrontierPoint(point) {
  const errors = [];
  if (!point || typeof point !== "object" || Array.isArray(point)) return { valid: false, errors: [{ path: "frontierPoint", code: "INVALID_TYPE", message: "frontier point must be an object" }] };
  if (point.observationVersion !== PRACTICE_FRONTIER_OBSERVATION_VERSION) add(errors, "observationVersion", "INVALID_VERSION", "frontier observation version is invalid");
  id(errors, point.sessionId, "sessionId", "session");
  id(errors, point.profileId, "profileId", "profile");
  id(errors, point.contextId, "contextId", "context");
  if (typeof point.stageId !== "string" || !point.stageId || point.stageId.length > 80) add(errors, "stageId", "INVALID_ID", "stageId is invalid");
  if (!Number.isInteger(point.stageOrdinal) || point.stageOrdinal < 0) add(errors, "stageOrdinal", "INVALID_ORDINAL", "stage ordinal is invalid");
  timestamp(errors, point.completedAtUtc, "completedAtUtc");
  for (const key of ["observedWpm", "adjustedWpm", "accuracy", "activeDurationMs", "difficultyAdjustmentLog"]) if (!Number.isFinite(point[key])) add(errors, key, "INVALID_NUMBER", `${key} must be finite`);
  if (!Number.isInteger(point.typedCharacterCount) || point.typedCharacterCount < 0) add(errors, "typedCharacterCount", "INVALID_COUNT", "typed character count is invalid");
  for (const key of ["plannedPaceWpm", "disfluencyRate", "correctionCostRate"]) if (!finiteOrNull(point[key])) add(errors, key, "INVALID_NUMBER", `${key} must be finite or null`);
  if (typeof point.valid !== "boolean") add(errors, "valid", "INVALID_TYPE", "valid must be boolean");
  if (point.valid && (point.activeDurationMs < PRACTICE_FRONTIER_POLICY_V1.minimumStageDurationMs || point.typedCharacterCount < PRACTICE_FRONTIER_POLICY_V1.minimumStageCharacters || point.accuracy < PRACTICE_FRONTIER_POLICY_V1.minimumStageAccuracy || point.observedWpm <= 0 || point.adjustedWpm <= 0)) add(errors, "valid", "INVARIANT", "valid frontier point does not satisfy minimum stage evidence");
  return { valid: errors.length === 0, errors };
}

export function validatePracticeFrontierBatch(batch) {
  const errors = [];
  if (!batch || typeof batch !== "object" || Array.isArray(batch)) return { valid: false, errors: [{ path: "frontierBatch", code: "INVALID_TYPE", message: "frontier batch must be an object" }] };
  if (batch.batchVersion !== PRACTICE_FRONTIER_BATCH_VERSION) add(errors, "batchVersion", "INVALID_VERSION", "frontier batch version is invalid");
  id(errors, batch.sessionId, "sessionId", "session");
  id(errors, batch.profileId, "profileId", "profile");
  id(errors, batch.contextId, "contextId", "context");
  if (batch.channel !== PRACTICE_FRONTIER_POLICY_V1.channel) add(errors, "channel", "INVALID_ENUM", "frontier batch channel must be controlled-speed");
  if (!Array.isArray(batch.points) || batch.points.length > PRACTICE_FRONTIER_POLICY_V1.maximumStagesPerSession) add(errors, "points", "ARRAY_LIMIT", "frontier batch points exceed cap");
  const ids = new Set();
  let ordinal = -1;
  for (const [index, point] of (batch.points ?? []).entries()) {
    const validation = validatePracticeFrontierPoint(point);
    errors.push(...validation.errors.map((entry) => ({ ...entry, path: `points[${index}].${entry.path}` })));
    if (point?.sessionId !== batch.sessionId || point?.profileId !== batch.profileId || point?.contextId !== batch.contextId) add(errors, `points[${index}]`, "IDENTITY_MISMATCH", "frontier point does not match batch identity");
    if (ids.has(point?.stageId)) add(errors, `points[${index}].stageId`, "DUPLICATE", "frontier stage is duplicated");
    ids.add(point?.stageId);
    if (Number.isInteger(point?.stageOrdinal) && point.stageOrdinal <= ordinal) add(errors, `points[${index}].stageOrdinal`, "ORDER", "frontier stage ordinals must increase");
    ordinal = Number.isInteger(point?.stageOrdinal) ? point.stageOrdinal : ordinal;
  }
  return { valid: errors.length === 0, errors };
}

export function validatePracticeControlFrontier(model) {
  const errors = [];
  if (!model || typeof model !== "object" || Array.isArray(model)) return { valid: false, errors: [{ path: "controlFrontier", code: "INVALID_TYPE", message: "control frontier must be an object" }] };
  if (model.modelVersion !== PRACTICE_FRONTIER_MODEL_VERSION || model.policyVersion !== PRACTICE_FRONTIER_POLICY_V1.version) add(errors, "version", "INVALID_VERSION", "frontier model version is invalid");
  if (!PRACTICE_FRONTIER_STATUSES.includes(model.status) || !PRACTICE_PERFORMANCE_CONFIDENCE_LEVELS.includes(model.confidence)) add(errors, "status", "INVALID_ENUM", "frontier status/confidence is invalid");
  if (model.channel !== PRACTICE_FRONTIER_POLICY_V1.channel) add(errors, "channel", "INVALID_ENUM", "frontier channel is invalid");
  for (const key of ["validPointCount", "sessionCount"]) if (!Number.isInteger(model[key]) || model[key] < 0) add(errors, key, "INVALID_COUNT", `${key} must be a non-negative integer`);
  for (const key of ["minimumObservedWpm", "maximumObservedWpm", "observedSpeedRangeWpm", "baselineAccuracy", "baselineDisfluencyRate", "baselineCorrectionCostRate", "frontierWpm", "frontierLowerWpm", "frontierUpperWpm"]) if (!finiteOrNull(model[key])) add(errors, key, "INVALID_NUMBER", `${key} must be finite or null`);
  if (typeof model.frontierIsLowerBound !== "boolean") add(errors, "frontierIsLowerBound", "INVALID_TYPE", "frontierIsLowerBound must be boolean");
  if (!model.controlMetricCoverage || !PRACTICE_CONTROL_METRIC_COVERAGE.includes(model.controlMetricCoverage.status)) add(errors, "controlMetricCoverage", "INVALID_ENUM", "control metric coverage is invalid");
  if (model.status === "unmeasured" && [model.frontierWpm, model.frontierLowerWpm, model.frontierUpperWpm, model.minimumObservedWpm, model.maximumObservedWpm].some((value) => value != null)) add(errors, "status", "INVARIANT", "unmeasured frontier must not expose WPM estimates");
  if (model.status === "bracketed" && !(Number.isFinite(model.frontierLowerWpm) && Number.isFinite(model.frontierWpm) && Number.isFinite(model.frontierUpperWpm) && model.frontierLowerWpm <= model.frontierWpm && model.frontierWpm <= model.frontierUpperWpm && model.frontierIsLowerBound === false)) add(errors, "frontierWpm", "INVARIANT", "bracketed frontier bounds are invalid");
  if (model.frontierIsLowerBound && (model.status !== "lower-bound" || model.frontierUpperWpm != null || !Number.isFinite(model.frontierWpm) || !approx(model.frontierWpm, model.frontierLowerWpm))) add(errors, "frontierIsLowerBound", "INVARIANT", "lower-bound frontier contract is invalid");
  return { valid: errors.length === 0, errors };
}

export function validatePracticePerformanceStateDelta(delta) {
  const errors = [];
  if (!delta || typeof delta !== "object" || Array.isArray(delta)) return { valid: false, errors: [{ path: "performanceStateDelta", code: "INVALID_TYPE", message: "performance state delta must be an object" }] };
  if (!PRACTICE_PERFORMANCE_DELTA_TYPES.includes(delta.type)) add(errors, "type", "INVALID_ENUM", "performance delta type is invalid");
  id(errors, delta.sessionId, "sessionId", "session");
  id(errors, delta.profileId, "profileId", "profile");
  id(errors, delta.contextId, "contextId", "context");
  if (delta.type === "state-probe") {
    if (delta.currentStateObservation == null && delta.warmupObservation == null) add(errors, "state-probe", "EMPTY_DELTA", "state-probe delta must contain state or warm-up evidence");
    if (delta.currentStateObservation != null) errors.push(...validatePracticeStateObservation(delta.currentStateObservation).errors.map((entry) => ({ ...entry, path: `currentStateObservation.${entry.path}` })));
    if (delta.warmupObservation != null) errors.push(...validatePracticeWarmupObservation(delta.warmupObservation).errors.map((entry) => ({ ...entry, path: `warmupObservation.${entry.path}` })));
    for (const observation of [delta.currentStateObservation, delta.warmupObservation].filter(Boolean)) if (observation.sessionId !== delta.sessionId) add(errors, "sessionId", "IDENTITY_MISMATCH", "state-probe evidence session does not match delta");
  }
  if (delta.type === "frontier") {
    const validation = validatePracticeFrontierBatch(delta.frontierObservationBatch);
    errors.push(...validation.errors.map((entry) => ({ ...entry, path: `frontierObservationBatch.${entry.path}` })));
    if (delta.frontierObservationBatch?.sessionId !== delta.sessionId || delta.frontierObservationBatch?.profileId !== delta.profileId || delta.frontierObservationBatch?.contextId !== delta.contextId) add(errors, "frontierObservationBatch", "IDENTITY_MISMATCH", "frontier batch does not match delta identity");
  }
  return { valid: errors.length === 0, errors };
}

export function validatePracticePerformanceMeasurementSummary(summary) {
  const errors = [];
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return { valid: false, errors: [{ path: "performanceMeasurementSummary", code: "INVALID_TYPE", message: "performance measurement summary must be an object" }] };
  if (summary.analysisVersion !== PRACTICE_PERFORMANCE_ANALYSIS_VERSION) add(errors, "analysisVersion", "INVALID_VERSION", "performance analysis version is invalid");
  if (!PRACTICE_PERFORMANCE_MEASUREMENT_KINDS.includes(summary.measurementKind)) add(errors, "measurementKind", "INVALID_ENUM", "measurement kind is invalid");
  if (!PRACTICE_PERFORMANCE_MEASUREMENT_STATUSES.includes(summary.status) || summary.status === "not-requested") add(errors, "status", "INVALID_ENUM", "persisted performance status is invalid");
  if (summary.measurementKind === "state-probe") {
    if (!PRACTICE_ABILITY_CHANNELS.includes(summary.referenceChannel)) add(errors, "referenceChannel", "INVALID_ENUM", "state summary reference channel is invalid");
    if (!PRACTICE_PACE_STATES.includes(summary.paceState) || !PRACTICE_CONTROL_QUALITY_STATES.includes(summary.controlQuality) || !PRACTICE_READINESS_BANDS.includes(summary.readinessBand)) add(errors, "state", "INVALID_ENUM", "state summary labels are invalid");
    for (const key of ["relativeStateDelta", "stateZ", "warmupGainRelative"]) if (!finiteOrNull(summary[key])) add(errors, key, "INVALID_NUMBER", `${key} must be finite or null`);
    if (!PRACTICE_PERFORMANCE_CONFIDENCE_LEVELS.includes(summary.measurementConfidence)) add(errors, "measurementConfidence", "INVALID_ENUM", "state summary confidence is invalid");
    if (typeof summary.warmupObserved !== "boolean") add(errors, "warmupObserved", "INVALID_TYPE", "warmupObserved must be boolean");
  } else {
    if (!Number.isInteger(summary.validPointCount) || summary.validPointCount < 0) add(errors, "validPointCount", "INVALID_COUNT", "frontier summary point count is invalid");
    for (const key of ["observedSpeedRangeWpm", "frontierWpm", "frontierLowerWpm", "frontierUpperWpm"]) if (!finiteOrNull(summary[key])) add(errors, key, "INVALID_NUMBER", `${key} must be finite or null`);
    if (!PRACTICE_FRONTIER_STATUSES.includes(summary.frontierStatus) || !PRACTICE_PERFORMANCE_CONFIDENCE_LEVELS.includes(summary.frontierConfidence)) add(errors, "frontier", "INVALID_ENUM", "frontier summary status/confidence is invalid");
  }
  return { valid: errors.length === 0, errors };
}

export function validatePracticePerformanceState(state, { maxBytes = 64 * 1024 } = {}) {
  const errors = [];
  if (!state || typeof state !== "object" || Array.isArray(state)) return { valid: false, errors: [{ path: "performanceState", code: "INVALID_TYPE", message: "performance state must be an object" }] };
  id(errors, state.profileId, "profileId", "profile");
  id(errors, state.contextId, "contextId", "context");
  if (state.performanceStateId !== createPracticePerformanceStateId(state.profileId, state.contextId)) add(errors, "performanceStateId", "IDENTITY_MISMATCH", "performance state ID does not match profile/context");
  if (state.recordVersion !== 1 || state.modelVersion !== PRACTICE_PERFORMANCE_STATE_MODEL_VERSION || state.policyVersion !== PRACTICE_PERFORMANCE_STATE_POLICY_VERSION) add(errors, "versions", "INVALID_VERSION", "performance state version is invalid");
  timestamp(errors, state.createdAt, "createdAt");
  timestamp(errors, state.updatedAt, "updatedAt");
  for (const [mapName, map] of [["currentStates", state.currentStates], ["warmupModels", state.warmupModels], ["warmupEvidence", state.warmupEvidence]]) {
    if (!map || typeof map !== "object" || Array.isArray(map)) add(errors, mapName, "INVALID_TYPE", `${mapName} must be an object`);
    else for (const key of Object.keys(map)) if (!PRACTICE_ABILITY_CHANNELS.includes(key)) add(errors, `${mapName}.${key}`, "INVALID_CHANNEL", `${mapName} contains an unknown channel`);
  }
  for (const [channel, observation] of Object.entries(state.currentStates ?? {})) {
    const validation = validatePracticeStateObservation(observation);
    errors.push(...validation.errors.map((entry) => ({ ...entry, path: `currentStates.${channel}.${entry.path}` })));
    if (observation?.referenceChannel !== channel || observation?.profileId !== state.profileId || observation?.contextId !== state.contextId) add(errors, `currentStates.${channel}`, "IDENTITY_MISMATCH", "current state does not match record identity/channel");
  }
  for (const [channel, model] of Object.entries(state.warmupModels ?? {})) errors.push(...validatePracticeWarmupModel(model).errors.map((entry) => ({ ...entry, path: `warmupModels.${channel}.${entry.path}` })));
  for (const [channel, observations] of Object.entries(state.warmupEvidence ?? {})) {
    if (!Array.isArray(observations) || observations.length > PRACTICE_WARMUP_POLICY_V1.maximumObservationsPerChannel) add(errors, `warmupEvidence.${channel}`, "ARRAY_LIMIT", "warm-up evidence exceeds channel cap");
    else for (const observation of observations) {
      errors.push(...validatePracticeWarmupObservation(observation).errors.map((entry) => ({ ...entry, path: `warmupEvidence.${channel}.${entry.path}` })));
      if (observation.referenceChannel !== channel) add(errors, `warmupEvidence.${channel}`, "IDENTITY_MISMATCH", "warm-up evidence channel mismatch");
    }
  }
  errors.push(...validatePracticeControlFrontier(state.controlFrontier).errors.map((entry) => ({ ...entry, path: `controlFrontier.${entry.path}` })));
  if (!Array.isArray(state.frontierEvidence) || state.frontierEvidence.length > PRACTICE_FRONTIER_POLICY_V1.maximumPersistedPoints) add(errors, "frontierEvidence", "ARRAY_LIMIT", "frontier evidence exceeds ring cap");
  else {
    const seen = new Set();
    for (const point of state.frontierEvidence) {
      errors.push(...validatePracticeFrontierPoint(point).errors.map((entry) => ({ ...entry, path: `frontierEvidence.${entry.path}` })));
      if (point.profileId !== state.profileId || point.contextId !== state.contextId || !point.valid) add(errors, "frontierEvidence", "IDENTITY_MISMATCH", "persisted frontier point must be valid and match context");
      const key = `${point.sessionId}\u0000${point.stageId}`;
      if (seen.has(key)) add(errors, "frontierEvidence", "DUPLICATE", "frontier evidence contains duplicate session/stage");
      seen.add(key);
    }
  }
  forbiddenContent(errors, state);
  try { if (byteLength(state) > maxBytes) add(errors, "performanceState", "SIZE_LIMIT", "performance state exceeds serialized size cap"); } catch { add(errors, "performanceState", "UNSERIALIZABLE", "performance state must be JSON serializable"); }
  return { valid: errors.length === 0, errors };
}
