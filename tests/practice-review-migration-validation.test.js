import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRACTICE_DATABASE_VERSION,
  PRACTICE_LIMITS,
  PRACTICE_RECORD_VERSIONS,
} from "../js/practiceLab/practiceConstants.js";
import {
  createDefaultReviewItem,
  createDefaultSessionSummary,
} from "../js/practiceLab/practiceDefaults.js";
import { PRACTICE_FOUNDATION_ANALYSIS_VERSION, buildPracticeFoundationAnalysis } from "../js/practiceLab/practiceFoundationAnalysis.js";
import { migratePracticeRecord } from "../js/practiceLab/practiceMigrations.js";
import { activatePracticeReviewItem, suspendPracticeReviewItem } from "../js/practiceLab/practiceReviewItem.js";
import { validatePracticeReviewItemV3 } from "../js/practiceLab/practiceReviewValidation.js";
import { validateReviewItem, validateSessionSummary } from "../js/practiceLab/practiceValidation.js";
import {
  PRACTICE_RETENTION_ANALYSIS_VERSION,
  PRACTICE_RETENTION_MODEL_VERSION,
  PRACTICE_RETENTION_POLICY_VERSION,
  PRACTICE_RETENTION_PROBE_VERSION,
  PRACTICE_RETENTION_REVIEW_DELTA_VERSION,
  PRACTICE_REVIEW_MODEL_VERSION,
  PRACTICE_REVIEW_PLAN_VERSION,
  PRACTICE_REVIEW_POLICY_VERSION,
  PRACTICE_REVIEW_VALUE_VERSION,
} from "../js/practiceLab/practiceReviewConstants.js";

const baseIdentity = {
  reviewItemId: "practice-review_pl17-migrate-12345678",
  profileId: "practice-profile_pl17-migrate-12345678",
  contextId: "practice-context_pl17-migrate-12345678",
  entityType: "bigram",
  entityKey: "br",
};

function legacyReviewV2() {
  return {
    ...baseIdentity,
    recordVersion: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    sourceExperimentId: "legacy-review",
    state: "mastered",
    priority: 91,
    lastReviewedAt: "2026-02-01T00:00:00.000Z",
    dueAtUtc: "2026-03-01T00:00:00.000Z",
    localDueDayKey: "2026-03-01",
    intervalDays: 28,
    successfulReviewCount: 15,
    failedReviewCount: 2,
    consecutiveSuccesses: 8,
    lastOutcome: "success",
    masteryState: "mastered",
  };
}

test("PL17 review contracts remain intact inside the PL18 DB6/session11/foundation9 envelope", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 6);
  assert.equal(PRACTICE_RECORD_VERSIONS.reviewItem, 3);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 11);
  assert.equal(PRACTICE_RECORD_VERSIONS.evaluationState, 1);
  assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 9);
  assert.equal(PRACTICE_LIMITS.reviewItemBytes, 32 * 1024);
  assert.deepEqual([
    PRACTICE_REVIEW_MODEL_VERSION,
    PRACTICE_REVIEW_POLICY_VERSION,
    PRACTICE_REVIEW_PLAN_VERSION,
    PRACTICE_RETENTION_PROBE_VERSION,
    PRACTICE_RETENTION_MODEL_VERSION,
    PRACTICE_RETENTION_POLICY_VERSION,
    PRACTICE_REVIEW_VALUE_VERSION,
    PRACTICE_RETENTION_ANALYSIS_VERSION,
    PRACTICE_RETENTION_REVIEW_DELTA_VERSION,
  ], Array(9).fill(1));
});

test("PL17 review v2 -> v3 preserves legacy scheduler history but creates zero canonical retention verifications", () => {
  const old = legacyReviewV2();
  const migrated = migratePracticeRecord("reviewItem", old);
  assert.equal(migrated.ok, true, JSON.stringify(migrated.error));
  assert.equal(migrated.fromVersion, 2);
  assert.equal(migrated.toVersion, 3);
  assert.deepEqual(migrated.steps, ["reviewItem:2->3"]);
  assert.equal(migrated.value.state, "inactive");
  assert.equal(migrated.value.suspensionReason, "legacy-unverified");
  assert.equal(migrated.value.dueAtUtc, null);
  assert.equal(migrated.value.cycle, null);
  assert.equal(migrated.value.retention.currentCycleVerificationCount, 0);
  assert.equal(migrated.value.retention.lifetimeVerificationCount, 0);
  assert.equal(migrated.value.retention.score, null);
  assert.equal(migrated.value.legacyReviewV2.successfulReviewCount, 15);
  assert.equal(migrated.value.legacyReviewV2.failedReviewCount, 2);
  assert.equal(migrated.value.legacyReviewV2.priority, 91);
  assert.equal(validateReviewItem(migrated.value).valid, true);
});

test("PL17 session v9 retention migration remains null through the current PL18 v11 wrapper", () => {
  const current = createDefaultSessionSummary({
    profileId: baseIdentity.profileId,
    contextId: baseIdentity.contextId,
    sessionId: "practice-session_pl17-session-migrate",
    now: () => new Date("2026-02-01T00:00:00.000Z"),
  });
  const v9 = { ...current, recordVersion: 9 };
  delete v9.retentionReviewSummary;
  delete v9.evaluationSummary;
  const migrated = migratePracticeRecord("sessionSummary", v9);
  assert.equal(migrated.ok, true, JSON.stringify(migrated.error));
  assert.deepEqual(migrated.steps, ["sessionSummary:9->10", "sessionSummary:10->11"]);
  assert.equal(migrated.value.recordVersion, 11);
  assert.equal(migrated.value.retentionReviewSummary, null);
  assert.equal(migrated.value.evaluationSummary, null);
  assert.equal(validateSessionSummary(migrated.value).valid, true);
});

test("PL17 review validation enforces active and suspended invariants", () => {
  const inactive = createDefaultReviewItem({ ...baseIdentity, now: () => new Date("2026-01-01T00:00:00.000Z") });
  assert.equal(validatePracticeReviewItemV3(inactive).valid, true);
  const active = activatePracticeReviewItem(inactive, {
    masteryStage: "transferred",
    referenceAtUtc: "2026-01-01T00:00:00.000Z",
    referenceQuality: 82,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });
  assert.equal(validateReviewItem(active).valid, true);
  assert.equal(validateReviewItem({ ...active, cycle: null }).valid, false);
  assert.equal(validateReviewItem({ ...active, intervalDays: 0 }).valid, false);
  const suspended = suspendPracticeReviewItem(active, "retention-failed", { now: () => new Date("2026-01-03T00:00:00.000Z") });
  assert.equal(validateReviewItem(suspended).valid, true);
  assert.equal(validateReviewItem({ ...suspended, dueAtUtc: "2026-01-04T00:00:00.000Z" }).valid, false);
  assert.equal(validateReviewItem({ ...suspended, suspensionReason: null }).valid, false);
});

test("PL17 review validation enforces bounded family/probe history and rejects raw private payload", () => {
  const inactive = createDefaultReviewItem({ ...baseIdentity, now: () => new Date("2026-01-01T00:00:00.000Z") });
  assert.equal(validateReviewItem({ ...inactive, recentProbeFamilyIds: Array.from({ length: 9 }, (_, i) => `family-${i}`) }).valid, false);
  const invalidHistory = {
    ...inactive,
    retention: {
      ...inactive.retention,
      recentProbes: Array.from({ length: 13 }, (_, i) => ({ id: i })),
    },
  };
  assert.equal(validateReviewItem(invalidHistory).valid, false);
  assert.equal(validateReviewItem({ ...inactive, rawEvents: [{ key: "x" }] }).valid, false);
  assert.equal(validateReviewItem({ ...inactive, customText: "private passage" }).valid, false);
});

test("PL17 retention component remains explicit inside PL18 foundation analysis v9", () => {
  const foundation = buildPracticeFoundationAnalysis({ events: [], traceMetadata: { truncated: false } });
  assert.equal(foundation.version, 9);
  assert.equal(foundation.retention.version, 1);
  assert.equal(foundation.retention.measurementKind, null);
  assert.equal(foundation.retention.status, "not-requested");
  assert.deepEqual(foundation.retention.probeResults, []);
  assert.deepEqual(foundation.retention.reviewDeltas, []);
  assert.equal(foundation.evaluation.status, "not-requested");
});
