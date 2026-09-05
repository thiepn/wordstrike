import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPracticeContentUse } from "../js/practiceLab/practiceCorpusUseGuard.js";
import { createDefaultReviewItem } from "../js/practiceLab/practiceDefaults.js";
import { activatePracticeReviewItem } from "../js/practiceLab/practiceReviewItem.js";
import { buildPracticeReviewPlan, validatePracticeReviewPlanForPreparation } from "../js/practiceLab/practiceReviewPlan.js";
import { buildPracticeReviewQueue } from "../js/practiceLab/practiceReviewQueue.js";
import {
  createGenericPracticeExperimentDescriptor,
  validatePracticeExperimentDescriptor,
  validatePracticeSessionConfiguration,
} from "../js/practiceLab/practiceSessionContract.js";

const profileId = "practice-profile_pl17-queue-12345678";
const contextId = "practice-context_pl17-queue-12345678";

function item(entityType, entityKey, referenceAtUtc, intervalStage = "acquired", referenceQuality = 80) {
  return activatePracticeReviewItem(createDefaultReviewItem({
    reviewItemId: `practice-review_${entityType}-${entityKey}-12345678`,
    profileId,
    contextId,
    entityType,
    entityKey,
    now: () => new Date(referenceAtUtc),
  }), {
    masteryStage: intervalStage,
    referenceAtUtc,
    referenceQuality,
    now: () => new Date(referenceAtUtc),
  });
}

function mastery(reviewItem, stage = "acquired") {
  return { statId: `stat-${reviewItem.entityType}-${reviewItem.entityKey}`, entityType: reviewItem.entityType, entityKey: reviewItem.entityKey, stage };
}

test("PL17 queue defaults to due/overdue, puts overdue first and uses deterministic value ordering", () => {
  const overdue = item("key", "a", "2026-01-01T00:00:00.000Z");
  const dueHigh = item("key", "b", "2026-01-01T12:00:00.000Z");
  const dueLow = item("word", "cat", "2026-01-01T12:00:00.000Z");
  const near = item("bigram", "br", "2026-01-02T00:00:00.000Z");
  const reviewItems = [overdue, dueHigh, dueLow, near];
  const masteryEntities = reviewItems.map((entry) => mastery(entry));
  const impactEntities = [
    { entityType: "key", entityKey: "a", impact: { impactScore: 50 } },
    { entityType: "key", entityKey: "b", impact: { impactScore: 90 } },
    { entityType: "word", entityKey: "cat", impact: { impactScore: 10 } },
    { entityType: "bigram", entityKey: "br", impact: { impactScore: 60 } },
  ];
  const queue = buildPracticeReviewQueue({ profileId, contextId, now: new Date("2026-01-02T12:00:00.000Z"), reviewItems, masteryEntities, impactEntities });
  assert.equal(queue.candidates.some((candidate) => candidate.entityKey === "br"), false);
  assert.equal(queue.candidates[0].dueStatus, "overdue");
  assert.equal(queue.candidates[0].entityKey, "a");
  const due = queue.candidates.filter((candidate) => candidate.dueStatus === "due");
  assert.equal(due[0].entityKey, "b");
  assert.ok(due[0].reviewValue > due[1].reviewValue);
});

test("PL17 optional near-due includes mature scheduled items without changing default", () => {
  const near = item("bigram", "br", "2026-01-02T00:00:00.000Z");
  const args = { profileId, contextId, now: new Date("2026-01-02T20:00:00.000Z"), reviewItems: [near], masteryEntities: [mastery(near)], impactEntities: [] };
  assert.equal(buildPracticeReviewQueue(args).candidates.length, 0);
  const included = buildPracticeReviewQueue({ ...args, includeNearDue: true });
  assert.equal(included.candidates.length, 1);
  assert.equal(included.candidates[0].dueStatus, "scheduled");
});

test("PL17 plan respects 8-item / 8-cost budget and greedy value-per-cost selection", () => {
  const reviewItems = Array.from({ length: 12 }, (_, index) => item("key", String.fromCharCode(97 + index), "2026-01-01T00:00:00.000Z"));
  const queue = buildPracticeReviewQueue({
    profileId,
    contextId,
    now: new Date("2026-01-03T00:00:00.000Z"),
    reviewItems,
    masteryEntities: reviewItems.map((entry) => mastery(entry)),
    impactEntities: reviewItems.map((entry, index) => ({ entityType: entry.entityType, entityKey: entry.entityKey, impact: { impactScore: 100 - index } })),
    maxCandidates: 100,
  });
  const plan = buildPracticeReviewPlan({ queue });
  assert.ok(plan.bindings.length <= 8);
  assert.ok(plan.totalCostUnits <= 8 + 1e-12);
  assert.equal(plan.bindings.length, 8);
});

test("PL17 review plan is bound to current item cycle/reference and canonical content targets", async () => {
  const review = item("bigram", "br", "2026-01-01T00:00:00.000Z");
  const queue = buildPracticeReviewQueue({ profileId, contextId, now: new Date("2026-01-03T00:00:00.000Z"), reviewItems: [review], masteryEntities: [mastery(review)], impactEntities: [] });
  const plan = buildPracticeReviewPlan({ queue });
  const repository = { async listReviewItemsAcrossContexts() { return [review]; } };
  const contentPlan = { targetEntities: [{ entityType: "bigram", entityKey: "br" }] };
  assert.equal((await validatePracticeReviewPlanForPreparation({ plan, repository, profileId, contextId, contentPlan })).valid, true);
  const missingTarget = await validatePracticeReviewPlanForPreparation({ plan, repository, profileId, contextId, contentPlan: { targetEntities: [] } });
  assert.equal(missingTarget.valid, false);
  assert.equal(missingTarget.code, "PRACTICE_REVIEW_PLAN_TARGET_MISMATCH");
  const changed = { ...review, cycle: { ...review.cycle, cycleId: review.cycle.cycleId + 1 } };
  const staleRepo = { async listReviewItemsAcrossContexts() { return [changed]; } };
  const stale = await validatePracticeReviewPlanForPreparation({ plan, repository: staleRepo, profileId, contextId, contentPlan });
  assert.equal(stale.valid, false);
  assert.equal(stale.code, "PRACTICE_REVIEW_PLAN_STALE");
});

test("PL17 corpus purpose retention-review is training-only and rejects protected partitions", () => {
  const training = { contentId: "practice-content_training", partition: "training" };
  assert.equal(assertPracticeContentUse({ item: training, purpose: "retention-review" }), training);
  assert.throws(() => assertPracticeContentUse({ item: { contentId: "practice-content_transfer", partition: "transfer" }, purpose: "retention-review" }), /must come from training/);
  assert.throws(() => assertPracticeContentUse({ item: { contentId: "practice-content_benchmark", partition: "benchmark" }, purpose: "retention-review" }), /must come from training/);
});

test("PL17 retentionMeasurementKind is trusted metadata and cannot combine with PL13/PL14 measurement roles", () => {
  const review = createGenericPracticeExperimentDescriptor({ id: "retention-review-test", retentionMeasurementKind: "entity-review" });
  assert.equal(validatePracticeExperimentDescriptor(review).valid, true);
  assert.equal(validatePracticeExperimentDescriptor({ ...review, abilityChannel: "controlled-speed" }).valid, false);
  assert.equal(validatePracticeExperimentDescriptor({ ...review, performanceMeasurementKind: "state-probe", performanceReferenceChannel: "controlled-speed" }).valid, false);
  assert.equal(validatePracticeExperimentDescriptor({ ...review, defaultCorrectionBehavior: "disabled" }).valid, false);
  assert.equal(validatePracticeSessionConfiguration({ retentionMeasurementKind: "entity-review" }).valid, false);
});
