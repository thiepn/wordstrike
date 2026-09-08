import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPracticeCoachReviewPreflight, createPracticeCoachReviewContentHash } from "../js/practiceLab/practiceCoachReviewGenerator.js";
import { buildPracticeLearningAnalysis } from "../js/practiceLab/practiceLearningObservation.js";
import {
  activatePracticeReviewItem,
  createInactivePracticeReviewItem,
  refreshPracticeReviewReferenceAfterDirectPractice,
} from "../js/practiceLab/practiceReviewItem.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";

const profileId = createPracticeId("profile", { uuid: () => "pl25-review-profile-12345678" });
const contextId = createPracticeId("context", { uuid: () => "pl25-review-context-12345678" });
const sessionId = createPracticeId("session", { uuid: () => "pl25-review-session-12345678" });

function binding({
  reviewItemId = createPracticeId("review", { uuid: () => "pl25-review-item-r-12345678" }),
  entityType = "key",
  entityKey = "r",
  excludeFamilyIds = ["family-old"],
} = {}) {
  return {
    reviewItemId,
    cycleId: 2,
    referenceAtUtc: "2026-09-05T10:00:00.000Z",
    referenceQuality: 80,
    entityType,
    entityKey,
    dueAtUtc: "2026-09-08T10:00:00.000Z",
    minimumMatureAtUtc: "2026-09-06T10:00:00.000Z",
    excludeFamilyIds,
  };
}

function targetIndexFixture() {
  const families = new Map([
    ["rate", "family-r1"], ["rise", "family-r2"], ["road", "family-r3"], ["real", "family-r4"], ["rest", "family-r5"],
    ["speed", "family-speed"],
  ]);
  return {
    async getTargetWordRefs({ entityType, entityKey }) {
      if (entityType === "key" && entityKey === "r") return ["rest", "real", "road", "rate", "rise"];
      if (entityType === "word" && entityKey === "speed") return ["speed"];
      return [];
    },
    async getWordSummary({ lexicalKey }) {
      const familyId = families.get(lexicalKey);
      if (!familyId) return null;
      return {
        lexicalKey,
        contents: [
          { contentId: `content-${lexicalKey}`, familyId, count: 1 },
          { contentId: `old-${lexicalKey}`, familyId: "family-old", count: 1 },
        ],
      };
    },
  };
}

function reviewPlan(bindings) {
  return {
    planVersion: 1,
    profileId,
    contextId,
    createdAt: "2026-09-08T10:00:00.000Z",
    totalCostUnits: bindings.length,
    bindings,
  };
}

test("PL25 Coach Review preflight emits exactly PL17 minimum opportunities from fresh training-derived families", async () => {
  const plan = reviewPlan([binding()]);
  const result = await buildPracticeCoachReviewPreflight({ sessionId, reviewPlan: plan, targetIndex: targetIndexFixture() });
  assert.equal(result.status, "ready");
  assert.equal(result.contentPlan.metadata.partition, "training");
  assert.equal(result.contentPlan.metadata.purpose, "retention-review");
  assert.equal(result.contentPlan.metadata.coachReview.probes.length, 1);
  assert.equal(result.contentPlan.metadata.coachReview.probes[0].opportunityCount, 5);
  assert.equal(result.contentPlan.metadata.coachReview.probes[0].familyIds.includes("family-old"), false);
  assert.equal(result.contentPlan.targetEntities.length, 1);
  assert.equal(result.contentPlan.targetEntities[0].directTarget, true);
  assert.equal(result.reviewPlan.reviewContentPlanHash, result.reviewContentPlanHash);
  assert.equal(createPracticeCoachReviewContentHash(result.contentPlan, result.reviewPlan), result.reviewContentPlanHash);
});

test("PL25 Coach Review interleaves multiple due entities instead of running acquisition-style blocks serially", async () => {
  const speedBinding = binding({
    reviewItemId: createPracticeId("review", { uuid: () => "pl25-review-item-speed-12345678" }),
    entityType: "word",
    entityKey: "speed",
    excludeFamilyIds: [],
  });
  const result = await buildPracticeCoachReviewPreflight({
    sessionId,
    reviewPlan: reviewPlan([binding(), speedBinding]),
    targetIndex: targetIndexFixture(),
  });
  assert.equal(result.status, "ready");
  assert.equal(result.contentPlan.metadata.coachReview.interleaved, true);
  const probes = result.contentPlan.metadata.coachReview.probes;
  assert.deepEqual(probes.map((probe) => probe.opportunityCount), [5, 2]);
  const reviewIds = result.contentPlan.units.map((unit) => unit.metadata.reviewItemId);
  assert.equal(reviewIds[0], binding().reviewItemId);
  assert.equal(reviewIds[1], speedBinding.reviewItemId);
  assert.equal(result.reviewPlan.bindings.length, 2);
});

test("PL25 retention-measurement sessions explicitly suppress PL16 acquisition observations even with direct training targets", () => {
  const analysis = buildPracticeLearningAnalysis({
    foundationAnalysis: {
      skills: {
        deltas: [{
          sessionId,
          profileId,
          contextId,
          statId: "practice-stat_review-r",
          entityType: "key",
          entityKey: "r",
          evidenceRole: "training",
          directTarget: true,
          observedAt: "2026-09-08T10:05:00.000Z",
          localDayKey: "2026-09-08",
          opportunities: { count: 5, errorCount: 0 },
        }],
      },
    },
    contentPlan: { metadata: { partition: "training" }, targetEntities: [{ entityType: "key", entityKey: "r", directTarget: true }] },
    profileId,
    contextId,
    experimentId: "daily-coach-review",
    evidenceRole: "training",
    retentionMeasurementKind: "entity-review",
  });
  assert.equal(analysis.summary.acquisitionObservationCount, 0);
  assert.equal(analysis.summary.transferObservationCount, 0);
  assert.equal(analysis.summary.learningStateUpdateCount, 0);
  assert.equal(analysis.summary.skippedCount, 1);
  assert.deepEqual(analysis.observationDeltas, []);
});

test("PL25 intervening direct practice refreshes PL17 reference/due/maturity without erasing cycle verification history", () => {
  const reviewItemId = createPracticeId("review", { uuid: () => "pl25-clock-review-12345678" });
  const inactive = createInactivePracticeReviewItem({
    reviewItemId,
    profileId,
    contextId,
    entityType: "key",
    entityKey: "r",
    now: () => new Date("2026-09-01T10:00:00.000Z"),
  });
  const active = activatePracticeReviewItem(inactive, {
    masteryStage: "acquired",
    referenceAtUtc: "2026-09-05T10:00:00.000Z",
    referenceQuality: 80,
    now: () => new Date("2026-09-05T10:00:00.000Z"),
  });
  const seeded = JSON.parse(JSON.stringify(active));
  seeded.retention.currentCycleVerificationCount = 3;
  seeded.retention.currentCycleSuccessfulCount = 2;
  seeded.retention.currentCycleDistinctReviewDays = 2;
  seeded.retention.lifetimeVerificationCount = 5;
  seeded.retention.recentProbes = [{ sessionId: "old-probe", cycleId: active.cycle.cycleId, verificationEligible: true }];
  seeded.recentProbeFamilyIds = ["family-a", "family-b"];
  const refreshed = refreshPracticeReviewReferenceAfterDirectPractice(seeded, {
    referenceAtUtc: "2026-09-08T10:00:00.000Z",
    now: () => new Date("2026-09-08T10:00:00.000Z"),
  });
  assert.equal(refreshed.cycle.cycleId, active.cycle.cycleId);
  assert.equal(refreshed.cycle.referenceAtUtc, "2026-09-08T10:00:00.000Z");
  assert.equal(refreshed.dueAtUtc, "2026-09-09T10:00:00.000Z");
  assert.equal(refreshed.minimumMatureAtUtc, "2026-09-09T04:00:00.000Z");
  assert.equal(refreshed.retention.currentCycleVerificationCount, 3);
  assert.equal(refreshed.retention.currentCycleSuccessfulCount, 2);
  assert.equal(refreshed.retention.currentCycleDistinctReviewDays, 2);
  assert.equal(refreshed.retention.lifetimeVerificationCount, 5);
  assert.deepEqual(refreshed.retention.recentProbes, seeded.retention.recentProbes);
  assert.deepEqual(refreshed.recentProbeFamilyIds, ["family-a", "family-b"]);
});

test("PL25 stale/older direct practice cannot move a PL17 review reference backward", () => {
  const inactive = createInactivePracticeReviewItem({
    reviewItemId: createPracticeId("review", { uuid: () => "pl25-clock-old-review-12345678" }),
    profileId,
    contextId,
    entityType: "key",
    entityKey: "r",
    now: () => new Date("2026-09-01T10:00:00.000Z"),
  });
  const active = activatePracticeReviewItem(inactive, {
    masteryStage: "acquired",
    referenceAtUtc: "2026-09-08T10:00:00.000Z",
    referenceQuality: 80,
    now: () => new Date("2026-09-08T10:00:00.000Z"),
  });
  const same = refreshPracticeReviewReferenceAfterDirectPractice(active, {
    referenceAtUtc: "2026-09-07T10:00:00.000Z",
    now: () => new Date("2026-09-08T12:00:00.000Z"),
  });
  assert.equal(same, active);
});
