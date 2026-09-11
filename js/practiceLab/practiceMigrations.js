import {
  migratePracticeManifest as migratePracticeManifestBase,
  migratePracticeRecord as migratePracticeRecordBase,
} from "./practiceMigrationsBaseV32.js";
import { PRACTICE_RECORD_VERSIONS } from "./practiceConstants.js";
import { migratePracticeCoachPlanV1ToV2, validatePracticeCoachPlan } from "./practiceCoachPlan.js";
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

export function migratePracticeRecord(recordType, record) {
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
