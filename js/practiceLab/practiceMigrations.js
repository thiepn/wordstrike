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
  validateReviewItem,
  validateSessionSummary,
  validateSkillStat,
} from "./practiceValidation.js";
import {
  createDefaultPracticeContextId,
  createSkillStatId,
} from "./practiceIds.js";
import {
  PRACTICE_STORAGE_ERROR_CODES,
  clonePracticeValue,
  practiceStorageError,
} from "./practiceStorageContract.js";

const validators = Object.freeze({
  context: validatePracticeContext,
  profile: validatePracticeProfile,
  skillStat: validateSkillStat,
  sessionSummary: validateSessionSummary,
  reviewItem: validateReviewItem,
  customText: validateCustomText,
  preset: validatePreset,
  checkpoint: validateCheckpoint,
});

const normalizers = Object.freeze({
  context: (value) => value,
  profile: (value) => value,
  skillStat: normalizeSkillStat,
  sessionSummary: normalizeSessionSummary,
  reviewItem: (value) => value,
  customText: normalizeCustomTextMetadata,
  preset: (value) => value,
  checkpoint: (value) => value,
});

const migrations = Object.freeze({
  profile: Object.freeze({
    0: (value) => ({ ...value, recordVersion: 1 }),
    1: (value) => ({ ...value, recordVersion: 2, lastTrainingDayKey: value.lastTrainingDayKey ?? null }),
    2: (value) => ({
      ...value,
      recordVersion: 3,
      activeContextId: createDefaultPracticeContextId(value.profileId),
    }),
  }),
  skillStat: Object.freeze({
    1: (value) => {
      const contextId = createDefaultPracticeContextId(value.profileId);
      return {
        ...value,
        recordVersion: 2,
        contextId,
        statId: createSkillStatId(value.profileId, contextId, value.entityType, value.entityKey),
      };
    },
  }),
  sessionSummary: Object.freeze({
    1: (value) => ({
      ...value,
      recordVersion: 2,
      contextId: createDefaultPracticeContextId(value.profileId),
    }),
  }),
  reviewItem: Object.freeze({
    1: (value) => ({
      ...value,
      recordVersion: 2,
      contextId: createDefaultPracticeContextId(value.profileId),
    }),
  }),
  checkpoint: Object.freeze({
    1: (value) => ({
      ...value,
      recordVersion: 2,
      contextId: createDefaultPracticeContextId(value.profileId),
    }),
  }),
});

function promoteForCurrentValidation(type, value, version) {
  if (type === "profile" && version <= 2) return {
    ...value,
    recordVersion: PRACTICE_RECORD_VERSIONS.profile,
    lastTrainingDayKey: value.lastTrainingDayKey ?? null,
    activeContextId: createDefaultPracticeContextId(value.profileId),
  };
  if (type === "skillStat" && version === 1) {
    const contextId = createDefaultPracticeContextId(value.profileId);
    return {
      ...value,
      recordVersion: PRACTICE_RECORD_VERSIONS.skillStat,
      contextId,
      statId: createSkillStatId(value.profileId, contextId, value.entityType, value.entityKey),
    };
  }
  if (["sessionSummary", "reviewItem", "checkpoint"].includes(type) && version === 1) return {
    ...value,
    recordVersion: PRACTICE_RECORD_VERSIONS[type],
    contextId: createDefaultPracticeContextId(value.profileId),
  };
  return value;
}

function validateIntermediate(type, value, version, validate) {
  try {
    return validate(promoteForCurrentValidation(type, value, version));
  } catch (cause) {
    return {
      valid: false,
      errors: [{ path: type, code: "TRANSITIONAL_VALIDATION_FAILED", message: cause?.message || "Historical Practice record could not be validated" }],
    };
  }
}

function failure(code, message, details = {}) {
  return {
    ok: false,
    error: practiceStorageError(code, message, {
      operation: "migrate",
      recoverable: code !== PRACTICE_STORAGE_ERROR_CODES.UNSUPPORTED_VERSION,
      ...details,
    }),
  };
}

function migrate({ input, type, versionField, targetVersion, normalize, validate }) {
  let value;
  try { value = clonePracticeValue(input); } catch (cause) {
    return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, `Unable to clone ${type}`, { cause });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, `${type} must be an object`);
  const suppliedVersion = value[versionField];
  const fromVersion = suppliedVersion == null ? 0 : Number(suppliedVersion);
  if (!Number.isInteger(fromVersion) || fromVersion < 0) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, `${type} has an invalid version`);
  if (fromVersion > targetVersion) return failure(PRACTICE_STORAGE_ERROR_CODES.UNSUPPORTED_VERSION, `${type} version ${fromVersion} is newer than supported version ${targetVersion}`);
  const steps = [];
  let currentVersion = fromVersion;
  while (currentVersion < targetVersion) {
    const migrateStep = migrations[type]?.[currentVersion]
      ?? (currentVersion === 0 ? (current) => ({ ...current, [versionField]: 1 }) : null);
    if (!migrateStep) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, `${type} has no migration from version ${currentVersion}`);
    const previousVersion = currentVersion;
    try { value = migrateStep(value); } catch (cause) {
      return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, `${type} migration from version ${previousVersion} failed`, { cause });
    }
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
