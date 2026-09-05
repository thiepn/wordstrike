import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultReviewItem, createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";
import { buildPracticeLearningAnalysis } from "../js/practiceLab/practiceLearningObservation.js";
import { activatePracticeReviewItem } from "../js/practiceLab/practiceReviewItem.js";
import { commitCompletedPracticeRetentionSession } from "../js/practiceLab/practiceRetentionCommit.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

function reviewDelta(item, sessionId, reviewedAtUtc, overrides = {}) {
  return {
    deltaVersion: 1,
    sessionId,
    profileId: item.profileId,
    contextId: item.contextId,
    reviewItemId: item.reviewItemId,
    cycleId: item.cycle.cycleId,
    expectedReferenceAtUtc: item.cycle.referenceAtUtc,
    entityType: item.entityType,
    entityKey: item.entityKey,
    reviewedAtUtc,
    localDayKey: reviewedAtUtc.slice(0, 10),
    measurementStatus: "measured",
    probeQuality: 80,
    referenceQuality: item.cycle.referenceQuality,
    retentionScore: 80,
    outcome: "pass",
    opportunityCount: 5,
    qualityCoverage: 1,
    plannedIntervalDays: item.intervalDays,
    elapsedDays: 1,
    mature: true,
    noveltyStatus: "fresh",
    familyIds: ["family-a"],
    verificationEligible: true,
    ...overrides,
  };
}

function completedSummary(harness, sessionId, completedAtUtc) {
  return createDefaultSessionSummary({
    profileId: harness.profileId,
    contextId: harness.contextId,
    sessionId,
    now: () => new Date(completedAtUtc),
    overrides: {
      status: "completed",
      completionReason: "content-complete",
      startedAtUtc: completedAtUtc,
      completedAtUtc,
      createdAt: completedAtUtc,
      updatedAt: completedAtUtc,
      localDayKey: completedAtUtc.slice(0, 10),
      retentionReviewSummary: {
        analysisVersion: 1,
        probeVersion: 1,
        targetCount: 1,
        measuredCount: 1,
        verificationEligibleCount: 1,
        strongCount: 0,
        passCount: 1,
        fragileCount: 0,
        failCount: 0,
        prematureCount: 0,
        insufficientCount: 0,
        nonVerifyingCount: 0,
      },
    },
  });
}

test("PL17 retention review delta merges in the same canonical completed-session commit and duplicate session cannot double-count", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl17-atomic" });
  let review = activatePracticeReviewItem(createDefaultReviewItem({
    reviewItemId: "practice-review_pl17-atomic-12345678",
    profileId: harness.profileId,
    contextId: harness.contextId,
    entityType: "key",
    entityKey: "a",
    now: () => new Date("2026-07-01T00:00:00.000Z"),
  }), {
    masteryStage: "acquired",
    referenceAtUtc: "2026-07-01T00:00:00.000Z",
    referenceQuality: 80,
    now: () => new Date("2026-07-01T00:00:00.000Z"),
  });
  await harness.repository.saveReviewItem(review);
  const sessionId = "practice-session_pl17-atomic-review-1";
  const summary = completedSummary(harness, sessionId, "2026-07-02T00:00:00.000Z");
  const delta = reviewDelta(review, sessionId, "2026-07-02T00:00:00.000Z");
  const committed = await commitCompletedPracticeRetentionSession({ repository: harness.repository, sessionSummary: summary, retentionReviewDeltas: [delta] });
  assert.equal(committed.retentionReviewUpdated, 1);
  review = await harness.repository.getReviewItem(review.reviewItemId);
  assert.equal(review.retention.currentCycleVerificationCount, 1);
  assert.equal(review.retention.currentCycleSuccessfulCount, 1);
  assert.equal((await harness.repository.getSessionSummary(sessionId)).retentionReviewSummary.passCount, 1);

  const replay = await commitCompletedPracticeRetentionSession({ repository: harness.repository, sessionSummary: summary, retentionReviewDeltas: [delta] });
  assert.equal(replay.idempotent, true);
  review = await harness.repository.getReviewItem(review.reviewItemId);
  assert.equal(review.retention.currentCycleVerificationCount, 1);
});

test("PL17 stale review delta commits the valid typing session but cannot overwrite the newer schedule", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl17-stale" });
  let review = activatePracticeReviewItem(createDefaultReviewItem({
    reviewItemId: "practice-review_pl17-stale-12345678",
    profileId: harness.profileId,
    contextId: harness.contextId,
    entityType: "key",
    entityKey: "a",
    now: () => new Date("2026-07-01T00:00:00.000Z"),
  }), { masteryStage: "acquired", referenceAtUtc: "2026-07-01T00:00:00.000Z", referenceQuality: 80, now: () => new Date("2026-07-01T00:00:00.000Z") });
  await harness.repository.saveReviewItem(review);
  const staleBasis = review;
  const firstId = "practice-session_pl17-stale-first";
  await commitCompletedPracticeRetentionSession({
    repository: harness.repository,
    sessionSummary: completedSummary(harness, firstId, "2026-07-02T00:00:00.000Z"),
    retentionReviewDeltas: [reviewDelta(review, firstId, "2026-07-02T00:00:00.000Z")],
  });
  review = await harness.repository.getReviewItem(review.reviewItemId);
  const currentReference = review.cycle.referenceAtUtc;
  const secondId = "practice-session_pl17-stale-second";
  const stale = await commitCompletedPracticeRetentionSession({
    repository: harness.repository,
    sessionSummary: completedSummary(harness, secondId, "2026-07-03T00:00:00.000Z"),
    retentionReviewDeltas: [reviewDelta(staleBasis, secondId, "2026-07-03T00:00:00.000Z")],
  });
  assert.equal(stale.staleReviewDeltaCount, 1);
  assert.equal(stale.retentionReviewUpdated, 0);
  assert.ok(await harness.repository.getSessionSummary(secondId));
  review = await harness.repository.getReviewItem(review.reviewItemId);
  assert.equal(review.cycle.referenceAtUtc, currentReference);
  assert.equal(review.retention.currentCycleVerificationCount, 1);
});

test("PL17 structurally invalid review delta fails before session write", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl17-invalid-delta" });
  const review = activatePracticeReviewItem(createDefaultReviewItem({
    reviewItemId: "practice-review_pl17-invalid-12345678",
    profileId: harness.profileId,
    contextId: harness.contextId,
    entityType: "key",
    entityKey: "a",
    now: () => new Date("2026-07-01T00:00:00.000Z"),
  }), { masteryStage: "acquired", referenceAtUtc: "2026-07-01T00:00:00.000Z", referenceQuality: 80, now: () => new Date("2026-07-01T00:00:00.000Z") });
  await harness.repository.saveReviewItem(review);
  const sessionId = "practice-session_pl17-invalid-delta";
  const invalid = reviewDelta(review, sessionId, "2026-07-02T00:00:00.000Z", { familyIds: ["1", "2", "3", "4", "5"] });
  await assert.rejects(() => commitCompletedPracticeRetentionSession({ repository: harness.repository, sessionSummary: completedSummary(harness, sessionId, "2026-07-02T00:00:00.000Z"), retentionReviewDeltas: [invalid] }), /failed validation/i);
  assert.equal(await harness.repository.getSessionSummary(sessionId), null);
  assert.equal((await harness.repository.getReviewItem(review.reviewItemId)).retention.currentCycleVerificationCount, 0);
});

test("PL17 valid review delta plus invalid canonical skill evidence rolls back the whole session transaction", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl17-rollback" });
  const review = activatePracticeReviewItem(createDefaultReviewItem({
    reviewItemId: "practice-review_pl17-rollback-12345678",
    profileId: harness.profileId,
    contextId: harness.contextId,
    entityType: "key",
    entityKey: "a",
    now: () => new Date("2026-07-01T00:00:00.000Z"),
  }), { masteryStage: "acquired", referenceAtUtc: "2026-07-01T00:00:00.000Z", referenceQuality: 80, now: () => new Date("2026-07-01T00:00:00.000Z") });
  await harness.repository.saveReviewItem(review);
  const sessionId = "practice-session_pl17-rollback";
  await assert.rejects(() => commitCompletedPracticeRetentionSession({
    repository: harness.repository,
    sessionSummary: completedSummary(harness, sessionId, "2026-07-02T00:00:00.000Z"),
    retentionReviewDeltas: [reviewDelta(review, sessionId, "2026-07-02T00:00:00.000Z")],
    skillEvidenceDeltas: [{ invalid: true }],
  }));
  assert.equal(await harness.repository.getSessionSummary(sessionId), null);
  assert.equal((await harness.repository.getReviewItem(review.reviewItemId)).retention.currentCycleVerificationCount, 0);
});

test("PL17 retention-review purpose produces zero PL16 acquisition dose while ordinary PL11 skill evidence remains independent", () => {
  const foundationAnalysis = {
    skills: {
      deltas: [{
        sessionId: "practice-session_pl17-dose",
        profileId: "practice-profile_pl17-dose",
        contextId: "practice-context_pl17-dose",
        statId: "practice-stat_pl17-dose",
        entityType: "key",
        entityKey: "a",
        evidenceRole: "training",
        directTarget: true,
        observedAt: "2026-07-02T00:00:00.000Z",
        localDayKey: "2026-07-02",
        opportunities: { count: 80, errorCount: 0 },
      }],
    },
    normalization: { normalizedTransitions: [] },
  };
  const learning = buildPracticeLearningAnalysis({
    foundationAnalysis,
    contentPlan: { targetEntities: [{ entityType: "key", entityKey: "a" }], metadata: { language: "en" } },
    profileId: "practice-profile_pl17-dose",
    contextId: "practice-context_pl17-dose",
    experimentId: "retention-review-test",
    evidenceRole: "training",
    retentionMeasurementKind: "entity-review",
  });
  assert.equal(learning.summary.acquisitionObservationCount, 0);
  assert.equal(learning.observationDeltas.length, 0);
  assert.equal(learning.summary.skippedCount, 1);
  assert.equal(foundationAnalysis.skills.deltas.length, 1);
});
