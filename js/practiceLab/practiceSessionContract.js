import {
  ENTITY_TYPES,
} from "./practiceConstants.js";
import { PRACTICE_ABILITY_CHANNELS } from "./practiceAbilityConstants.js";
import { PRACTICE_PERFORMANCE_MEASUREMENT_KINDS } from "./practicePerformanceConstants.js";
import { PRACTICE_RETENTION_MEASUREMENT_KINDS } from "./practiceReviewConstants.js";
import { hashPracticeContent } from "./practiceIds.js";
import {
  PRACTICE_COMPLETION_MODES,
  PRACTICE_CONTENT_PLAN_VERSION,
  PRACTICE_CORRECTION_POLICIES,
  PRACTICE_INPUT_TYPES,
  PRACTICE_SESSION_ERROR_CODES,
  PRACTICE_SESSION_LIMITS,
  PRACTICE_TIMING_MODES,
} from "./practiceSessionConstants.js";
import { isValidPracticeUtcIso } from "./practiceTime.js";
import {
  createPracticeSegmenter,
  isPracticeWordLikeGrapheme,
} from "./practiceTextSegmentation.js";
import { validatePracticeSerializable } from "./practiceValidation.js";

export { createPracticeSegmenter } from "./practiceTextSegmentation.js";

export class PracticeSessionError extends Error {
  constructor(code, message, {
    operation = null,
    sessionId = null,
    lifecycleState = null,
    recoverable = false,
    cause = null,
    details = null,
  } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "PracticeSessionError";
    this.code = code;
    this.operation = operation;
    this.sessionId = sessionId;
    this.lifecycleState = lifecycleState;
    this.recoverable = recoverable;
    this.details = details;
  }
}

export function practiceSessionError(code, message, details = {}) {
  return new PracticeSessionError(code, message, details);
}

const plainObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

const clone = (value) => JSON.parse(JSON.stringify(value));

export function validatePracticeExperimentDescriptor(descriptor) {
  const errors = [];
  if (!plainObject(descriptor)) return { valid: false, errors: [{ path: "experiment", code: "INVALID_TYPE", message: "experiment must be a plain object" }] };
  if (!/^[a-z0-9][a-z0-9-]{1,99}$/.test(descriptor.id || "")) errors.push({ path: "id", code: "INVALID_ID", message: "experiment id must be a stable slug" });
  for (const key of ["version", "sessionSchemaVersion"]) if (!Number.isInteger(descriptor[key]) || descriptor[key] < 1) errors.push({ path: key, code: "INVALID_VERSION", message: `${key} must be a positive integer` });
  for (const key of ["title", "category"]) if (typeof descriptor[key] !== "string" || !descriptor[key] || descriptor[key].length > 100) errors.push({ path: key, code: "INVALID_STRING", message: `${key} must be bounded text` });
  if (!PRACTICE_CORRECTION_POLICIES.includes(descriptor.defaultCorrectionBehavior)) errors.push({ path: "defaultCorrectionBehavior", code: "INVALID_ENUM", message: "unsupported correction behavior" });
  if (!Array.isArray(descriptor.supportedCompletionModes) || descriptor.supportedCompletionModes.some((mode) => !PRACTICE_COMPLETION_MODES.includes(mode))) errors.push({ path: "supportedCompletionModes", code: "INVALID_ENUM", message: "unsupported completion mode" });
  if (typeof descriptor.resumable !== "boolean") errors.push({ path: "resumable", code: "INVALID_TYPE", message: "resumable must be boolean" });
  if (descriptor.abilityChannel != null && !PRACTICE_ABILITY_CHANNELS.includes(descriptor.abilityChannel)) errors.push({ path: "abilityChannel", code: "INVALID_ENUM", message: "unsupported ability channel" });
  const performanceKind = descriptor.performanceMeasurementKind ?? null;
  const performanceChannel = descriptor.performanceReferenceChannel ?? null;
  const retentionKind = descriptor.retentionMeasurementKind ?? null;
  if (performanceKind != null && !PRACTICE_PERFORMANCE_MEASUREMENT_KINDS.includes(performanceKind)) errors.push({ path: "performanceMeasurementKind", code: "INVALID_ENUM", message: "unsupported performance measurement kind" });
  if (!PRACTICE_RETENTION_MEASUREMENT_KINDS.includes(retentionKind)) errors.push({ path: "retentionMeasurementKind", code: "INVALID_ENUM", message: "unsupported retention measurement kind" });
  if (descriptor.abilityChannel != null && performanceKind != null) errors.push({ path: "performanceMeasurementKind", code: "CONFLICT", message: "PL14 v1 cannot combine ability and performance measurement roles" });
  if (retentionKind != null && descriptor.abilityChannel != null) errors.push({ path: "retentionMeasurementKind", code: "CONFLICT", message: "PL17 v1 retention review cannot also be an ability measurement" });
  if (retentionKind != null && performanceKind != null) errors.push({ path: "retentionMeasurementKind", code: "CONFLICT", message: "PL17 v1 retention review cannot also be a PL14 performance measurement" });
  if (retentionKind != null && descriptor.defaultCorrectionBehavior !== "allow") errors.push({ path: "defaultCorrectionBehavior", code: "CONFLICT", message: "PL17 retention review requires correctionBehavior=allow" });
  if (performanceKind == null && performanceChannel != null) errors.push({ path: "performanceReferenceChannel", code: "CONFLICT", message: "performance reference channel requires a performance measurement" });
  if (performanceKind === "state-probe" && !PRACTICE_ABILITY_CHANNELS.includes(performanceChannel)) errors.push({ path: "performanceReferenceChannel", code: "INVALID_ENUM", message: "state probe requires a canonical ability reference channel" });
  if (performanceKind === "control-frontier" && performanceChannel !== "controlled-speed") errors.push({ path: "performanceReferenceChannel", code: "INVALID_ENUM", message: "control frontier must reference controlled-speed" });
  if (performanceKind === "control-frontier" && typeof descriptor.buildPerformanceMeasurement !== "function") errors.push({ path: "buildPerformanceMeasurement", code: "REQUIRED", message: "control frontier requires a trusted measurement callback" });
  if (performanceKind !== "control-frontier" && descriptor.buildPerformanceMeasurement != null) errors.push({ path: "buildPerformanceMeasurement", code: "FORBIDDEN_FIELD", message: "frontier measurement callback is allowed only for control-frontier" });
  return { valid: errors.length === 0, errors };
}

function validateUnit(unit, graphemes, seenIds, previousEnd, segment) {
  const errors = [];
  if (!plainObject(unit)) return [{ path: "units", code: "INVALID_UNIT", message: "units must be plain objects" }];
  if (typeof unit.unitId !== "string" || !unit.unitId || seenIds.has(unit.unitId)) errors.push({ path: "units.unitId", code: "INVALID_ID", message: "unit IDs must be unique" });
  seenIds.add(unit.unitId);
  if (!["word", "sentence", "paragraph", "segment"].includes(unit.type)) errors.push({ path: `units.${unit.unitId}.type`, code: "INVALID_ENUM", message: "unsupported unit type" });
  if (!Number.isInteger(unit.startIndex) || !Number.isInteger(unit.endIndex) || unit.startIndex < 0 || unit.endIndex <= unit.startIndex || unit.endIndex > graphemes.length) errors.push({ path: `units.${unit.unitId}.range`, code: "INVALID_RANGE", message: "unit range is invalid" });
  if (unit.startIndex < previousEnd) errors.push({ path: `units.${unit.unitId}.startIndex`, code: "OVERLAP", message: "unit ranges may not overlap" });
  if (Number.isInteger(unit.startIndex) && Number.isInteger(unit.endIndex) && segment(unit.text || "").join("") !== graphemes.slice(unit.startIndex, unit.endIndex).join("")) errors.push({ path: `units.${unit.unitId}.text`, code: "CONTENT_MISMATCH", message: "unit text does not match content" });
  if (!validatePracticeSerializable(unit.metadata || {}).valid) errors.push({ path: `units.${unit.unitId}.metadata`, code: "UNSERIALIZABLE", message: "unit metadata is not JSON-safe" });
  return errors;
}

export function validatePracticeContentPlan(plan, { segmenter } = {}) {
  const segment = createPracticeSegmenter(segmenter);
  const errors = [];
  if (!plainObject(plan)) return { valid: false, errors: [{ path: "contentPlan", code: "INVALID_TYPE", message: "content plan must be a plain object" }] };
  if (plan.contentPlanVersion !== PRACTICE_CONTENT_PLAN_VERSION) errors.push({ path: "contentPlanVersion", code: "INVALID_VERSION", message: "unsupported content-plan version" });
  if (!/^practice-content_[a-z0-9._-]+$/i.test(plan.contentId || "")) errors.push({ path: "contentId", code: "INVALID_ID", message: "contentId must be namespaced" });
  if (!Number.isInteger(plan.contentGeneratorVersion) || plan.contentGeneratorVersion < 1) errors.push({ path: "contentGeneratorVersion", code: "INVALID_VERSION", message: "generator version must be positive" });
  if (typeof plan.text !== "string") errors.push({ path: "text", code: "INVALID_TYPE", message: "content text must be a string" });
  const graphemes = typeof plan.text === "string" ? segment(plan.text) : [];
  if (graphemes.length > PRACTICE_SESSION_LIMITS.contentGraphemes) errors.push({ path: "text", code: "SIZE_LIMIT", message: "active content exceeds 500,000 graphemes" });
  const units = Array.isArray(plan.units) ? plan.units : [];
  if (!Array.isArray(plan.units)) errors.push({ path: "units", code: "INVALID_TYPE", message: "units must be an array" });
  let previousEnd = 0;
  const seenIds = new Set();
  for (const unit of units) {
    errors.push(...validateUnit(unit, graphemes, seenIds, previousEnd, segment));
    previousEnd = Number.isInteger(unit?.endIndex) ? unit.endIndex : previousEnd;
  }
  if (!plainObject(plan.completion) || !PRACTICE_COMPLETION_MODES.includes(plan.completion?.mode)) errors.push({ path: "completion.mode", code: "INVALID_ENUM", message: "unsupported completion mode" });
  if (plan.completion?.mode === "duration" && (!Number.isFinite(plan.completion.value) || plan.completion.value <= 0)) errors.push({ path: "completion.value", code: "OUT_OF_RANGE", message: "duration completion requires positive milliseconds" });
  if (plan.completion?.mode === "word-count" && (!Number.isInteger(plan.completion.value) || plan.completion.value <= 0)) errors.push({ path: "completion.value", code: "OUT_OF_RANGE", message: "word-count completion requires a positive integer" });
  if (!Array.isArray(plan.targetEntities) || plan.targetEntities.some((target) => !ENTITY_TYPES.includes(target?.entityType) || typeof target.entityKey !== "string")) errors.push({ path: "targetEntities", code: "INVALID_TARGET", message: "target entities are invalid" });
  if (!validatePracticeSerializable(plan.metadata || {}).valid) errors.push({ path: "metadata", code: "UNSERIALIZABLE", message: "content metadata is not JSON-safe" });
  if (plan.contentHash !== hashPracticeContent(plan.text || "")) errors.push({ path: "contentHash", code: "CONTENT_MISMATCH", message: "content hash does not match text" });
  return { valid: errors.length === 0, errors, graphemes };
}

export function createPracticeContentPlan(input, options = {}) {
  const rawSafety = validatePracticeSerializable({
    units: input.units ?? [],
    targetEntities: input.targetEntities ?? [],
    completion: input.completion ?? { mode: "content", value: null },
    metadata: input.metadata ?? {},
  }, { path: "contentPlan", maxBytes: 128 * 1024 });
  if (!rawSafety.valid) throw practiceSessionError(PRACTICE_SESSION_ERROR_CODES.INVALID_CONTENT, "Content plan contains unsafe metadata", { operation: "create-content", details: rawSafety.errors });
  const segment = createPracticeSegmenter(options.segmenter);
  const text = String(input.text ?? "");
  const graphemes = segment(text);
  const fallbackUnits = [];
  if (input.units == null) {
    let start = null;
    for (let index = 0; index <= graphemes.length; index += 1) {
      const wordLike = index < graphemes.length && isPracticeWordLikeGrapheme(graphemes[index]);
      if (wordLike && start == null) start = index;
      if (!wordLike && start != null) {
        fallbackUnits.push({ unitId: `word_${fallbackUnits.length + 1}`, type: "word", startIndex: start, endIndex: index, text: graphemes.slice(start, index).join(""), metadata: { derived: true } });
        start = null;
      }
    }
  }
  const value = {
    contentPlanVersion: PRACTICE_CONTENT_PLAN_VERSION,
    contentId: input.contentId,
    contentGeneratorVersion: input.contentGeneratorVersion ?? 1,
    text,
    units: clone(input.units ?? fallbackUnits),
    targetEntities: clone(input.targetEntities || []),
    completion: clone(input.completion || { mode: "content", value: null }),
    metadata: clone(input.metadata || {}),
    contentHash: hashPracticeContent(text),
  };
  const validation = validatePracticeContentPlan(value, options);
  if (!validation.valid) throw practiceSessionError(PRACTICE_SESSION_ERROR_CODES.INVALID_CONTENT, "Invalid Practice content plan", { operation: "create-content", details: validation.errors });
  return freezeDeep(value);
}

export function appendPracticeContentPlan(plan, addition, options = {}) {
  const segment = createPracticeSegmenter(options.segmenter);
  const baseLength = segment(plan.text).length;
  const appendedText = String(addition.text ?? "");
  const derived = addition.units == null
    ? createPracticeContentPlan({ contentId: "practice-content_append-fragment", text: appendedText, completion: { mode: "manual", value: null }, metadata: {} }, options).units
    : addition.units;
  const units = derived.map((unit, index) => ({
    ...clone(unit),
    unitId: addition.units == null ? `unit_${plan.units.length + index + 1}` : unit.unitId,
    startIndex: unit.startIndex + baseLength,
    endIndex: unit.endIndex + baseLength,
  }));
  return createPracticeContentPlan({
    ...plan,
    text: plan.text + appendedText,
    units: [...plan.units, ...units],
    targetEntities: [...plan.targetEntities, ...(addition.targetEntities || [])],
    metadata: { ...plan.metadata, ...(addition.metadata || {}) },
  }, options);
}

export function validatePracticeNormalizedInput(input, { segmenter } = {}) {
  const errors = [];
  if (!plainObject(input)) return { valid: false, errors: [{ path: "input", code: "INVALID_TYPE", message: "input must be a plain object" }] };
  if (!PRACTICE_INPUT_TYPES.includes(input.type)) errors.push({ path: "type", code: "INVALID_ENUM", message: "unsupported input type" });
  const segment = createPracticeSegmenter(segmenter);
  if (input.type === "character" && (typeof input.value !== "string" || segment(input.value).length !== 1)) errors.push({ path: "value", code: "INVALID_CHARACTER", message: "character input must contain one grapheme" });
  if (input.type === "space" && input.value !== " ") errors.push({ path: "value", code: "INVALID_SPACE", message: "space input must equal one space" });
  if (["backspace", "word-delete"].includes(input.type) && !["", null, undefined].includes(input.value)) errors.push({ path: "value", code: "INVALID_VALUE", message: "correction input value must be empty" });
  if (typeof input.source !== "string" || !input.source || input.source.length > 50) errors.push({ path: "source", code: "INVALID_SOURCE", message: "input source is required" });
  if (!Number.isFinite(input.monotonicTimestampMs) || input.monotonicTimestampMs < 0) errors.push({ path: "monotonicTimestampMs", code: "INVALID_TIMESTAMP", message: "monotonic timestamp must be finite and non-negative" });
  if (!isValidPracticeUtcIso(input.wallTimestampUtc)) errors.push({ path: "wallTimestampUtc", code: "INVALID_TIMESTAMP", message: "wall timestamp must be UTC ISO" });
  if (!plainObject(input.modifiers) || ["ctrl", "meta", "alt", "shift"].some((key) => typeof input.modifiers[key] !== "boolean")) errors.push({ path: "modifiers", code: "INVALID_MODIFIERS", message: "all modifier flags are required" });
  return { valid: errors.length === 0, errors };
}

export function validatePracticeSessionConfiguration(configuration) {
  const validation = validatePracticeSerializable(configuration, { path: "configuration" });
  const errors = [...validation.errors];
  if (configuration?.timingMode != null && !PRACTICE_TIMING_MODES.includes(configuration.timingMode)) errors.push({ path: "timingMode", code: "INVALID_ENUM", message: "unsupported timing mode" });
  if (configuration?.correctionBehavior != null && !PRACTICE_CORRECTION_POLICIES.includes(configuration.correctionBehavior)) errors.push({ path: "correctionBehavior", code: "INVALID_ENUM", message: "unsupported correction behavior" });
  if (Object.hasOwn(configuration ?? {}, "abilityChannel")) errors.push({ path: "abilityChannel", code: "FORBIDDEN_FIELD", message: "abilityChannel is trusted experiment metadata and cannot be configured per session" });
  if (Object.hasOwn(configuration ?? {}, "performanceMeasurementKind")) errors.push({ path: "performanceMeasurementKind", code: "FORBIDDEN_FIELD", message: "performanceMeasurementKind is trusted experiment metadata and cannot be configured per session" });
  if (Object.hasOwn(configuration ?? {}, "performanceReferenceChannel")) errors.push({ path: "performanceReferenceChannel", code: "FORBIDDEN_FIELD", message: "performanceReferenceChannel is trusted experiment metadata and cannot be configured per session" });
  if (Object.hasOwn(configuration ?? {}, "retentionMeasurementKind")) errors.push({ path: "retentionMeasurementKind", code: "FORBIDDEN_FIELD", message: "retentionMeasurementKind is trusted experiment metadata and cannot be configured per session" });
  return { valid: errors.length === 0, errors };
}

export function createGenericPracticeExperimentDescriptor(overrides = {}) {
  return Object.freeze({
    id: "generic-practice",
    version: 1,
    title: "Generic Practice",
    category: "foundation",
    sessionSchemaVersion: 1,
    defaultCorrectionBehavior: "allow",
    supportedCompletionModes: [...PRACTICE_COMPLETION_MODES],
    resumable: true,
    abilityChannel: null,
    performanceMeasurementKind: null,
    performanceReferenceChannel: null,
    retentionMeasurementKind: null,
    buildPerformanceMeasurement: null,
    ...overrides,
  });
}
