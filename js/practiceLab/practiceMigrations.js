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
  validatePracticeManifest,
  validatePracticeProfile,
  validatePreset,
  validateReviewItem,
  validateSessionSummary,
  validateSkillStat,
} from "./practiceValidation.js";
import {
  PRACTICE_STORAGE_ERROR_CODES,
  clonePracticeValue,
  practiceStorageError,
} from "./practiceStorageContract.js";

const validators = Object.freeze({
  profile: validatePracticeProfile,
  skillStat: validateSkillStat,
  sessionSummary: validateSessionSummary,
  reviewItem: validateReviewItem,
  customText: validateCustomText,
  preset: validatePreset,
  checkpoint: validateCheckpoint,
});

const normalizers = Object.freeze({
  profile: (value) => value,
  skillStat: normalizeSkillStat,
  sessionSummary: normalizeSessionSummary,
  reviewItem: (value) => value,
  customText: normalizeCustomTextMetadata,
  preset: (value) => value,
  checkpoint: (value) => value,
});

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

function migrate({
  input,
  type,
  versionField,
  targetVersion,
  normalize,
  validate,
}) {
  let value;
  try {
    value = clonePracticeValue(input);
  } catch (cause) {
    return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, `Unable to clone ${type}`, { cause });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, `${type} must be an object`);
  }
  const suppliedVersion = value[versionField];
  const fromVersion = suppliedVersion == null ? 0 : Number(suppliedVersion);
  if (!Number.isInteger(fromVersion) || fromVersion < 0) {
    return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, `${type} has an invalid version`);
  }
  if (fromVersion > targetVersion) {
    return failure(PRACTICE_STORAGE_ERROR_CODES.UNSUPPORTED_VERSION, `${type} version ${fromVersion} is newer than supported version ${targetVersion}`);
  }
  const steps = [];
  if (fromVersion === 0) {
    value[versionField] = 1;
    steps.push(`${type}:0->1`);
  }
  value = normalize(value);
  const validation = validate(value);
  if (!validation.valid) {
    return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, `${type} failed validation after migration`, {
      cause: validation.errors,
    });
  }
  return {
    ok: true,
    value,
    fromVersion,
    toVersion: targetVersion,
    migrated: steps.length > 0,
    steps,
  };
}

export function migratePracticeManifest(record) {
  return migrate({
    input: record,
    type: "manifest",
    versionField: "manifestVersion",
    targetVersion: PRACTICE_MANIFEST_VERSION,
    normalize: normalizePracticeManifest,
    validate: validatePracticeManifest,
  });
}

export function migratePracticeRecord(recordType, record) {
  if (!PRACTICE_RECORD_TYPES[recordType] || !validators[recordType]) {
    return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, `Unknown Practice record type: ${recordType}`);
  }
  return migrate({
    input: record,
    type: recordType,
    versionField: "recordVersion",
    targetVersion: PRACTICE_RECORD_VERSIONS[recordType],
    normalize: normalizers[recordType],
    validate: validators[recordType],
  });
}

