import {
  PRACTICE_DATABASE_NAME,
  PRACTICE_DATABASE_VERSION,
  PRACTICE_MANIFEST_VERSION,
  PRACTICE_RECORD_VERSIONS,
  PRACTICE_STORE_DEFINITIONS,
} from "./practiceConstants.js";

export const PRACTICE_SCHEMA = Object.freeze({
  manifestVersion: PRACTICE_MANIFEST_VERSION,
  databaseName: PRACTICE_DATABASE_NAME,
  databaseVersion: PRACTICE_DATABASE_VERSION,
  recordVersions: PRACTICE_RECORD_VERSIONS,
  stores: PRACTICE_STORE_DEFINITIONS,
  experimentConfigurationVersion: 1,
  contentGeneratorVersion: 1,
  sessionSchemaVersion: 1,
});

export const PRACTICE_RECORD_TYPES = Object.freeze({
  profile: Object.freeze({ storeName: "profiles", versionField: "recordVersion" }),
  skillStat: Object.freeze({ storeName: "skillStats", versionField: "recordVersion" }),
  sessionSummary: Object.freeze({ storeName: "sessionSummaries", versionField: "recordVersion" }),
  reviewItem: Object.freeze({ storeName: "reviewItems", versionField: "recordVersion" }),
  customText: Object.freeze({ storeName: "customTexts", versionField: "recordVersion" }),
  preset: Object.freeze({ storeName: "presets", versionField: "recordVersion" }),
  checkpoint: Object.freeze({ storeName: "activeSessionCheckpoints", versionField: "recordVersion" }),
  quarantine: Object.freeze({ storeName: "quarantine", versionField: "recordVersion" }),
});
