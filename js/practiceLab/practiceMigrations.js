import {
  migratePracticeManifest as migratePracticeManifestBase,
  migratePracticeRecord as migratePracticeRecordBase,
} from "./practiceMigrationsBaseV32.js";
import { PRACTICE_RECORD_VERSIONS } from "./practiceConstants.js";
import { migratePracticeCoachPlanV1ToV2, validatePracticeCoachPlan } from "./practiceCoachPlan.js";
import { createDefaultPracticeContextId } from "./practiceIds.js";
import { normalizeSessionSummary, validateSessionSummary } from "./practiceValidation.js";
import {
  PRACTICE_STORAGE_ERROR_CODES,
  clonePracticeValue,
  practiceStorageError,
} from "./practiceStorageContract.js";

function failure(code, message, details = {}) {
  return { ok: false, error: practiceStorageError(code, message, { operation: "migrate", recoverable: code !== PRACTICE_STORAGE_ERROR_CODES.UNSUPPORTED_VERSION, ...details }) };
}

export function migratePracticeManifest(record) {
  return migratePracticeManifestBase(record);
}

function migrateSessionSummary(record) {
  let value;
  try { value = clonePracticeValue(record); }
  catch (cause) { return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, "Unable to clone sessionSummary", { cause }); }
  if (!value || typeof value !== "object" || Array.isArray(value)) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, "sessionSummary must be an object");
  const supplied = value.recordVersion;
  let version = supplied == null ? 0 : Number(supplied);
  if (!Number.isInteger(version) || version < 0) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, "sessionSummary has an invalid version");
  const target = PRACTICE_RECORD_VERSIONS.sessionSummary;
  if (version > target) return failure(PRACTICE_STORAGE_ERROR_CODES.UNSUPPORTED_VERSION, `sessionSummary version ${version} is newer than supported version ${target}`);
  const steps = [];
  const advance = (next) => { steps.push(`sessionSummary:${version}->${version + 1}`); value = next; version += 1; };
  try {
    if (version === 0) advance({ ...value, recordVersion: 1 });
    if (version === 1) advance({ ...value, recordVersion: 2, contextId: createDefaultPracticeContextId(value.profileId) });
    if (version === 2) advance({ ...value, recordVersion: 3, fluencySummary: null });
    if (version === 3) advance({ ...value, recordVersion: 4, errorSummary: null });
    if (version === 4) advance({ ...value, recordVersion: 5, normalizationSummary: null });
    if (version === 5) advance({ ...value, recordVersion: 6, skillEvidenceSummary: null });
    if (version === 6) advance({ ...value, recordVersion: 7, abilityMeasurementSummary: null });
    if (version === 7) advance({ ...value, recordVersion: 8, performanceMeasurementSummary: null });
    if (version === 8) advance({ ...value, recordVersion: 9, learningEvidenceSummary: null });
    if (version === 9) advance({ ...value, recordVersion: 10, retentionReviewSummary: null });
    if (version === 10) advance({ ...value, recordVersion: 11, evaluationSummary: null });
    if (version === 11) advance({ ...value, recordVersion: 12, assessmentBinding: null });
    if (version === 12) advance({ ...value, recordVersion: 13, coachBinding: null });
    if (version === 13) advance({ ...value, recordVersion: 14, researchBinding: null });
  } catch (cause) {
    return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, "sessionSummary migration failed", { cause });
  }
  value = normalizeSessionSummary(value);
  const validation = validateSessionSummary(value);
  if (!validation.valid) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, "sessionSummary failed validation after migration", { cause: validation.errors });
  return { ok: true, value, fromVersion: supplied == null ? 0 : Number(supplied), toVersion: target, migrated: steps.length > 0, steps };
}

export function migratePracticeRecord(recordType, record) {
  if (recordType === "sessionSummary") return migrateSessionSummary(record);
  if (recordType !== "coachPlan") return migratePracticeRecordBase(recordType, record);
  let value;
  try { value = clonePracticeValue(record); }
  catch (cause) { return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, "Unable to clone coachPlan", { cause }); }
  if (!value || typeof value !== "object" || Array.isArray(value)) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, "coachPlan must be an object");
  const supplied = value.recordVersion;
  let fromVersion = supplied == null ? 0 : Number(supplied);
  if (!Number.isInteger(fromVersion) || fromVersion < 0) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, "coachPlan has an invalid version");
  if (fromVersion > PRACTICE_RECORD_VERSIONS.coachPlan) return failure(PRACTICE_STORAGE_ERROR_CODES.UNSUPPORTED_VERSION, `coachPlan version ${fromVersion} is newer than supported version ${PRACTICE_RECORD_VERSIONS.coachPlan}`);
  const steps = [];
  try {
    if (fromVersion === 0) {
      value = { ...value, recordVersion: 1 };
      steps.push("coachPlan:0->1");
      fromVersion = 0;
    }
    if (value.recordVersion === 1) {
      value = migratePracticeCoachPlanV1ToV2(value);
      steps.push("coachPlan:1->2");
    }
  } catch (cause) {
    return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, "coachPlan migration failed", { cause: cause?.details ?? cause });
  }
  const validation = validatePracticeCoachPlan(value);
  if (!validation.valid) return failure(PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED, "coachPlan failed validation after migration", { cause: validation.errors });
  return {
    ok: true,
    value,
    fromVersion: supplied == null ? 0 : Number(supplied),
    toVersion: PRACTICE_RECORD_VERSIONS.coachPlan,
    migrated: steps.length > 0,
    steps,
  };
}
