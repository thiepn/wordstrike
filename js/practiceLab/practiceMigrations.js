import {
  PRACTICE_MANIFEST_VERSION,
  PRACTICE_RECORD_VERSIONS,
} from "./practiceConstants.js";
import { PRACTICE_RECORD_TYPES } from "./practiceSchemas.js";
import {
  normalizeCustomTextMetadata,
  normalizePracticeManifest,
  normalizeSessionSummary,
  normalizeSkillStat,
  validateCheckpoint,
  validateCustomText,
  validatePracticeContext,
  validatePracticeManifest,
  validatePracticeProfile,
  validatePreset,
  validateSessionSummary,
  validateSkillStat,
} from "./practiceValidation.js";
import { validatePracticeReviewItemV3 } from "./practiceReviewValidation.js";
import { validatePracticeAbilityState } from "./practiceAbilityValidation.js";
import { validatePracticePerformanceState } from "./practicePerformanceValidation.js";
import { validatePracticeLearningState } from "./practiceLearningValidation.js";
import { validatePracticeEvaluationState } from "./practiceEvaluationValidation.js";
import { createEmptyPracticeRetentionState } from "./practiceReviewItem.js";
import {
  createDefaultPracticeContextId,
  createSkillStatId,
} from "./practiceIds.js";
import { migratePracticeSkillStatV2ToV3 } from "./practiceSkillEvidenceMigration.js";
import {
  PRACTICE_STORAGE_ERROR_CODES,
  clonePracticeValue,
  practiceStorageError,
} from "./practiceStorageContract.js";

const validators = Object.freeze({
  context: validatePracticeContext,
  profile: validatePracticeProfile,
  skillStat: validateSkillStat,
  abilityState: validatePracticeAbilityState,
  performanceState: validatePracticePerformanceState,
  learningState: validatePracticeLearningState,
  evaluationState: validatePracticeEvaluationState,
  sessionSummary: validateSessionSummary,
  reviewItem: validatePracticeReviewItemV3,
  customText: validateCustomText,
  preset: validatePreset,
  checkpoint: validateCheckpoint,
});

const normalizers = Object.freeze({
  context: (value) => value,
  profile: (value) => value,
  skillStat: normalizeSkillStat,
  abilityState: (value) => value,
  performanceState: (value) => value,
  learningState: (value) => value,
  evaluationState: (value) => value,
  sessionSummary: normalizeSessionSummary,
  reviewItem: (value) => value,
  customText: normalizeCustomTextMetadata,
  preset: (value) => value,
  checkpoint: (value) => value,
});

function migrateReviewV2ToV3(value) {
  return {
    reviewItemId: value.reviewItemId,
    profileId: value.profileId,
    contextId: value.contextId,
    recordVersion: 3,
    entityType: value.entityType,
    entityKey: value.entityKey,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    state: "inactive",
    dueAtUtc: null,
    localDueDayKey: null,
    intervalDays: null,
    stabilityDays: null,
    minimumMatureAtUtc: null,
    lastScheduledAt: null,
    suspensionReason: "legacy-unverified",
    cycle: null,
    retention: createEmptyPracticeRetentionState(),
    recentProbeFamilyIds: [],
    legacyReviewV2: {
      sourceExperimentId: value.sourceExperimentId ?? null,
      state: value.state ?? null,
      priority: value.priority ?? null,
      lastReviewedAt: value.lastReviewedAt ?? null,
      dueAtUtc: value.dueAtUtc ?? null,
      localDueDayKey: value.localDueDayKey ?? null,
      intervalDays: value.intervalDays ?? null,
      successfulReviewCount: value.successfulReviewCount ?? 0,
      failedReviewCount: value.failedReviewCount ?? 0,
      consecutiveSuccesses: value.consecutiveSuccesses ?? 0,
      lastOutcome: value.lastOutcome ?? null,
      masteryState: value.masteryState ?? null,
    },
  };
}

const migrations = Object.freeze({
  profile: Object.freeze({
    0: (value) => ({ ...value, recordVersion: 1 }),
    1: (value) => ({ ...value, recordVersion: 2, lastTrainingDayKey: value.lastTrainingDayKey ?? null }),
    2: (value) => ({ ...value, recordVersion: 3, activeContextId: createDefaultPracticeContextId(value.profileId) }),
  }),
  skillStat: Object.freeze({
    1: (value) => {
      const contextId = createDefaultPracticeContextId(value.profileId);
      return { ...value, recordVersion: 2, contextId, statId: createSkillStatId(value.profileId, contextId, value.entityType, value.entityKey) };
    },
    2: (value) => migratePracticeSkillStatV2ToV3(value),
  }),
  sessionSummary: Object.freeze({
    1: (value) => ({ ...value, recordVersion: 2, contextId: createDefaultPracticeContextId(value.profileId) }),
    2: (value) => ({ ...value, recordVersion: 3, fluencySummary: null }),
    3: (value) => ({ ...value, recordVersion: 4, errorSummary: null }),
    4: (value) => ({ ...value, recordVersion: 5, normalizationSummary: null }),
    5: (value) => ({ ...value, recordVersion: 6, skillEvidenceSummary: null }),
    6: (value) => ({ ...value, recordVersion: 7, abilityMeasurementSummary: null }),
    7: (value) => ({ ...value, recordVersion: 8, performanceMeasurementSummary: null }),
    8: (value) => ({ ...value, recordVersion: 9, learningEvidenceSummary: null }),
    9: (value) => ({ ...value, recordVersion: 10, retentionReviewSummary: null }),
    10: (value) => ({ ...value, recordVersion: 11, evaluationSummary: null }),
  }),
  reviewItem: Object.freeze({
    1: (value) => ({ ...value, recordVersion: 2, contextId: createDefaultPracticeContextId(value.profileId) }),
    2: (value) => migrateReviewV2ToV3(value),
  }),
  checkpoint: Object.freeze({
    1: (value) => ({ ...value, recordVersion: 2, contextId: createDefaultPracticeContextId(value.profileId) }),
    2: (value) => ({ ...value, recordVersion: 3, metricsSnapshot: { ...(value.metricsSnapshot ?? {}), skillEvidenceTrackerSnapshot: null } }),
  }),
});

function createLegacySkillStatId(profileId, entityType, entityKey) {
  return "practice-stat_" + encodeURIComponent(profileId) + "_" + encodeURIComponent(entityType) + "_" + encodeURIComponent(entityKey);
}

function validateHistoricalRecord(type, value, version) {
  const errors = [];
  if (type === "skillStat" && version === 1) {
    const validIdentity = typeof value.profileId === "string"
      && typeof value.entityType === "string"
      && typeof value.entityKey === "string"
      && value.statId === createLegacySkillStatId(value.profileId, value.entityType, value.entityKey);
    if (!validIdentity) errors.push({ path: "statId", code: "IDENTITY_MISMATCH", message: "legacy statId does not match the historical profile/entity identity" });
  }
  return errors;
}

function promoteForCurrentValidation(type, value, version) {
  if (type === "profile" && version <= 2) return {
    ...value,
    recordVersion: PRACTICE_RECORD_VERSIONS.profile,
    lastTrainingDayKey: value.lastTrainingDayKey ?? null,
    activeContextId: createDefaultPracticeContextId(value.profileId),
  };
  if (type === "skillStat" && version === 1) {
    const contextId = createDefaultPracticeContextId(value.profileId);
    return migratePracticeSkillStatV2ToV3({ ...value, recordVersion: 2, contextId, statId: createSkillStatId(value.profileId, contextId, value.entityType, value.entityKey) });
  }
  if (type === "skillStat" && version === 2) return migratePracticeSkillStatV2ToV3(value);
  if (type === "sessionSummary" && version <= 10) return {
    ...value,
    recordVersion: PRACTICE_RECORD_VERSIONS.sessionSummary,
    contextId: version === 1 ? createDefaultPracticeContextId(value.profileId) : value.contextId,
    fluencySummary: version <= 2 ? null : value.fluencySummary ?? null,
    errorSummary: version <= 3 ? null : value.errorSummary ?? null,
    normalizationSummary: version <= 4 ? null : value.normalizationSummary ?? null,
    skillEvidenceSummary: version <= 5 ? null : value.skillEvidenceSummary ?? null,
    abilityMeasurementSummary: version <= 6 ? null : value.abilityMeasurementSummary ?? null,
    performanceMeasurementSummary: version <= 7 ? null : value.performanceMeasurementSummary ?? null,
    learningEvidenceSummary: version <= 8 ? null : value.learningEvidenceSummary ?? null,
    retentionReviewSummary: version <= 9 ? null : value.retentionReviewSummary ?? null,
    evaluationSummary: null,
  };
  if (type === "reviewItem" && version === 1) return migrateReviewV2ToV3({ ...value, recordVersion: 2, contextId: createDefaultPracticeContextId(value.profileId) });
  if (type === "reviewItem" && version === 2) return migrateReviewV2ToV3(value);
  if (type === "checkpoint" && version <= 2) return {
    ...value,
    recordVersion: PRACTICE_RECORD_VERSIONS.checkpoint,
    contextId: version === 1 ? createDefaultPracticeContextId(value.profileId) : value.contextId,
    metricsSnapshot: { ...(value.metricsSnapshot ?? {}), skillEvidenceTrackerSnapshot: null },
  };
  return value;
}

function validateIntermediate(type, value, version, validate) {
  const historicalErrors = validateHistoricalRecord(type, value, version);
  if (historicalErrors.length) return { valid: false, errors: historicalErrors };
  try { return validate(promoteForCurrentValidation(type, value, version)); }
  catch (cause) { return { valid: false, errors: [{ path: type, code: "TRANSITIONAL_VALIDATION_FAILED", message: cause?.message || "Historical Practice record could not be validated" }] }; }
}

function failure(code, message, details = {}) {
  return { ok: false, error: practiceStorageError(code, message, { operation: "migrate", recoverable: code !== PRACTICE_STORAGE_ERROR_CODES.UNSUPPORTED_VERSION, ...details }) };
}

function migrate({ input, type, versionField, targetVersion, normalize, validate }) {
  let value;
  try { value = clonePracticeValue(input); } catch (cause) { return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, `Unable to clone ${type}`, { cause }); }
  if (!value || typeof value !== "object" || Array.isArray(value)) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, `${type} must be an object`);
  const suppliedVersion = value[versionField];
  const fromVersion = suppliedVersion == null ? 0 : Number(suppliedVersion);
  if (!Number.isInteger(fromVersion) || fromVersion < 0) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, `${type} has an invalid version`);
  if (fromVersion > targetVersion) return failure(PRACTICE_STORAGE_ERROR_CODES.UNSUPPORTED_VERSION, `${type} version ${fromVersion} is newer than supported version ${targetVersion}`);
  const steps = [];
  let currentVersion = fromVersion;
  while (currentVersion < targetVersion) {
    const historicalErrors = validateHistoricalRecord(type, value, currentVersion);
    if (historicalErrors.length) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, type + " failed historical validation before version " + (currentVersion + 1), { cause: historicalErrors });
    const migrateStep = migrations[type]?.[currentVersion] ?? (currentVersion === 0 ? (current) => ({ ...current, [versionField]: 1 }) : null);
    if (!migrateStep) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, `${type} has no migration from version ${currentVersion}`);
    const previousVersion = currentVersion;
    try { value = migrateStep(value); } catch (cause) { return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, `${type} migration from version ${previousVersion} failed`, { cause }); }
    currentVersion = Number(value[versionField]);
    if (!Number.isInteger(currentVersion) || currentVersion !== previousVersion + 1) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, `${type} migration did not advance sequentially`);
    const intermediate = validateIntermediate(type, value, currentVersion, validate);
    if (!intermediate.valid) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, `${type} failed validation after version ${currentVersion}`, { cause: intermediate.errors });
    steps.push(`${type}:${previousVersion}->${currentVersion}`);
  }
  value = normalize(value);
  const validation = validate(value);
  if (!validation.valid) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, `${type} failed validation after migration`, { cause: validation.errors });
  return { ok: true, value, fromVersion, toVersion: targetVersion, migrated: steps.length > 0, steps };
}

export function migratePracticeManifest(record) {
  return migrate({ input: record, type: "manifest", versionField: "manifestVersion", targetVersion: PRACTICE_MANIFEST_VERSION, normalize: normalizePracticeManifest, validate: validatePracticeManifest });
}

export function migratePracticeRecord(recordType, record) {
  if (!PRACTICE_RECORD_TYPES[recordType] || !validators[recordType]) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, `Unknown Practice record type: ${recordType}`);
  return migrate({ input: record, type: recordType, versionField: "recordVersion", targetVersion: PRACTICE_RECORD_VERSIONS[recordType], normalize: normalizers[recordType], validate: validators[recordType] });
}
