import {
  PRACTICE_LIMITS as PRACTICE_LIMITS_V31,
  PRACTICE_OBSOLETE_INDEXES as PRACTICE_OBSOLETE_INDEXES_V31,
  PRACTICE_RECORD_VERSIONS as PRACTICE_RECORD_VERSIONS_V31,
  PRACTICE_STORE_DEFINITIONS as PRACTICE_STORE_DEFINITIONS_V31,
  QUOTA_RECOVERY_STEPS as QUOTA_RECOVERY_STEPS_V31,
} from "./practiceConstantsV31.js";

export * from "./practiceConstantsV31.js";

export const PRACTICE_DATABASE_VERSION = 12;

export const PRACTICE_RECORD_VERSIONS = Object.freeze({
  ...PRACTICE_RECORD_VERSIONS_V31,
  sessionSummary: 14,
  coachPlan: 2,
  treatmentEpisode: 1,
  treatmentResponseState: 1,
  physicalTelemetryStat: 1,
  physicalTelemetrySession: 1,
  researchEnrollment: 1,
  researchAssignment: 1,
  researchAnalysisState: 1,
});

export const PRACTICE_LIMITS = Object.freeze({
  ...PRACTICE_LIMITS_V31,
  treatmentEpisodesPerProfile: 500,
  treatmentOpenEpisodesPerContext: 64,
  treatmentResponseStatesPerProfile: 256,
  treatmentResponseSamplesPerState: 64,
  treatmentEpisodeBytes: 32 * 1024,
  treatmentClosedDays: 365,
  treatmentInvalidDays: 30,
  treatmentPreparedTtlMs: 24 * 60 * 60 * 1000,
  physicalTelemetryStatsPerContext: 2304,
  physicalTelemetryKeyStatsPerContext: 128,
  physicalTelemetryTransitionStatsPerContext: 2048,
  physicalTelemetryModifierStatsPerContext: 128,
  physicalTelemetrySessionMarkersPerProfile: 500,
  physicalTelemetrySessionMarkerDays: 180,
  physicalTelemetryRecentSamples: 32,
  physicalTelemetryStatBytes: 8 * 1024,
  researchEnrollmentsPerProfile: 32,
  researchAssignmentsPerProfile: 256,
  researchAnalysisStatesPerProfile: 64,
  researchAssignmentBytes: 48 * 1024,
  researchCompletedDays: 365,
  researchTechnicalInvalidDays: 90,
});

const existingSessionIndexes = PRACTICE_STORE_DEFINITIONS_V31.sessionSummaries.indexes;
const hasProfileContextCompleted = existingSessionIndexes.some((index) => index.name === "profileContextCompletedAt");
const hasResearchAssignment = existingSessionIndexes.some((index) => index.name === "researchAssignmentId");

export const PRACTICE_STORE_DEFINITIONS = Object.freeze({
  ...PRACTICE_STORE_DEFINITIONS_V31,
  sessionSummaries: Object.freeze({
    ...PRACTICE_STORE_DEFINITIONS_V31.sessionSummaries,
    indexes: Object.freeze([
      ...existingSessionIndexes,
      ...(hasProfileContextCompleted ? [] : [Object.freeze({ name: "profileContextCompletedAt", keyPath: ["profileId", "contextId", "completedAtUtc"] })]),
      ...(hasResearchAssignment ? [] : [Object.freeze({ name: "researchAssignmentId", keyPath: "researchBinding.researchAssignmentId" })]),
    ]),
  }),
  treatmentEpisodes: Object.freeze({
    keyPath: "treatmentEpisodeId",
    indexes: Object.freeze([
      Object.freeze({ name: "treatmentSessionId", keyPath: "treatment.treatmentSessionId", options: { unique: true } }),
      Object.freeze({ name: "profileId", keyPath: "profileId" }),
      Object.freeze({ name: "contextId", keyPath: "contextId" }),
      Object.freeze({ name: "status", keyPath: "status" }),
      Object.freeze({ name: "treatmentFamilyKey", keyPath: "treatment.treatmentFamilyKey" }),
      Object.freeze({ name: "targetStatId", keyPath: "treatment.targetStatId" }),
      Object.freeze({ name: "outcomeDomain", keyPath: "treatment.outcomeDomain" }),
      Object.freeze({ name: "completedAt", keyPath: "treatment.completedAt" }),
      Object.freeze({ name: "profileContextCompletedAt", keyPath: ["profileId", "contextId", "treatment.completedAt"] }),
    ]),
  }),
  treatmentResponseStates: Object.freeze({
    keyPath: "treatmentResponseStateId",
    indexes: Object.freeze([
      Object.freeze({ name: "profileId", keyPath: "profileId" }),
      Object.freeze({ name: "contextId", keyPath: "contextId" }),
      Object.freeze({ name: "treatmentFamilyKey", keyPath: "treatmentFamilyKey" }),
      Object.freeze({ name: "outcomeKey", keyPath: "outcomeKey" }),
      Object.freeze({ name: "delayBucket", keyPath: "delayBucket" }),
      Object.freeze({ name: "updatedAt", keyPath: "updatedAt" }),
    ]),
  }),
  physicalTelemetryStats: Object.freeze({
    keyPath: "physicalTelemetryStatId",
    indexes: Object.freeze([
      Object.freeze({ name: "profileId", keyPath: "profileId" }),
      Object.freeze({ name: "contextId", keyPath: "contextId" }),
      Object.freeze({ name: "entityType", keyPath: "entityType" }),
      Object.freeze({ name: "updatedAt", keyPath: "updatedAt" }),
      Object.freeze({ name: "profileContextEntityType", keyPath: ["profileId", "contextId", "entityType"] }),
    ]),
  }),
  physicalTelemetrySessions: Object.freeze({
    keyPath: "sessionId",
    indexes: Object.freeze([
      Object.freeze({ name: "profileId", keyPath: "profileId" }),
      Object.freeze({ name: "contextId", keyPath: "contextId" }),
      Object.freeze({ name: "status", keyPath: "status" }),
      Object.freeze({ name: "completedAt", keyPath: "completedAt" }),
      Object.freeze({ name: "appliedAt", keyPath: "appliedAt" }),
      Object.freeze({ name: "profileCompletedAt", keyPath: ["profileId", "completedAt"] }),
    ]),
  }),
  researchEnrollments: Object.freeze({
    keyPath: "researchEnrollmentId",
    indexes: Object.freeze([
      Object.freeze({ name: "profileId", keyPath: "profileId" }),
      Object.freeze({ name: "contextId", keyPath: "contextId" }),
      Object.freeze({ name: "status", keyPath: "status" }),
      Object.freeze({ name: "studyId", keyPath: "studyId" }),
      Object.freeze({ name: "profileContextStudyVersion", keyPath: ["profileId", "contextId", "studyId", "studyVersion"], options: { unique: true } }),
      Object.freeze({ name: "updatedAt", keyPath: "updatedAt" }),
    ]),
  }),
  researchAssignments: Object.freeze({
    keyPath: "researchAssignmentId",
    indexes: Object.freeze([
      Object.freeze({ name: "researchEnrollmentId", keyPath: "researchEnrollmentId" }),
      Object.freeze({ name: "profileId", keyPath: "profileId" }),
      Object.freeze({ name: "contextId", keyPath: "contextId" }),
      Object.freeze({ name: "status", keyPath: "status" }),
      Object.freeze({ name: "targetStatId", keyPath: "target.statId" }),
      Object.freeze({ name: "localDayKey", keyPath: "localDayKey" }),
      Object.freeze({ name: "enrollmentSequence", keyPath: ["researchEnrollmentId", "assignmentIndex"], options: { unique: true } }),
      Object.freeze({ name: "profileContextDay", keyPath: ["profileId", "contextId", "localDayKey"] }),
      Object.freeze({ name: "createdAt", keyPath: "createdAt" }),
    ]),
  }),
  researchAnalysisStates: Object.freeze({
    keyPath: "researchAnalysisStateId",
    indexes: Object.freeze([
      Object.freeze({ name: "researchEnrollmentId", keyPath: "researchEnrollmentId", options: { unique: true } }),
      Object.freeze({ name: "profileId", keyPath: "profileId" }),
      Object.freeze({ name: "contextId", keyPath: "contextId" }),
      Object.freeze({ name: "studyId", keyPath: "studyId" }),
      Object.freeze({ name: "updatedAt", keyPath: "updatedAt" }),
    ]),
  }),
});

export const PRACTICE_OBSOLETE_INDEXES = Object.freeze({
  ...PRACTICE_OBSOLETE_INDEXES_V31,
});

export const PRACTICE_STORE_NAMES = Object.freeze(Object.keys(PRACTICE_STORE_DEFINITIONS));

export const QUOTA_RECOVERY_STEPS = Object.freeze([
  ...QUOTA_RECOVERY_STEPS_V31.filter((step) => step !== "low-confidence-skill-stats"),
  "old-treatment-episodes",
  ...(QUOTA_RECOVERY_STEPS_V31.includes("low-confidence-skill-stats") ? ["low-confidence-skill-stats"] : []),
]);