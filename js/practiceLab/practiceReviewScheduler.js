import { PRACTICE_LIMITS } from "./practiceConstants.js";
import { buildPracticePersistentExecutionQuality } from "./practiceExecutionQuality.js";
import { createPracticePeerReferenceIndex } from "./practicePeerReference.js";
import { evaluatePracticeLimiterDimensions } from "./practiceLimiterDimensions.js";
import { PRACTICE_LIMITER_POLICY_V1 } from "./practiceLimiterPolicy.js";
import { buildPracticeMasteryEvaluationSet } from "./practiceMasterySnapshot.js";
import { PRACTICE_MASTERY_STAGE_RANK } from "./practiceMasteryConstants.js";
import { createPracticeRetentionEvidenceMap } from "./practiceRetentionEvidence.js";
import {
  activatePracticeReviewItem,
  createInactivePracticeReviewItem,
  suspendPracticeReviewItem,
} from "./practiceReviewItem.js";
import { PRACTICE_REVIEW_POLICY_V1 } from "./practiceReviewPolicy.js";
import { createPracticeReviewItemId } from "./practiceIds.js";

const rank = PRACTICE_MASTERY_STAGE_RANK;
const confidenceRank = Object.freeze({ none: 0, low: 1, medium: 2, high: 3 });
const identity = (type, key) => `${type}\u0000${key}`;
const laterThan = (candidate, reference) => Boolean(candidate && (!reference || Date.parse(candidate) > Date.parse(reference)));

function getImpactMap(snapshot) {
  return new Map((snapshot?.candidates ?? []).map((entry) => [entry.statId, Number.isFinite(entry?.impact?.impactScore) ? entry.impact.impactScore : null]));
}

function candidateSort(a, b) {
  return (rank[b.mastery.stage] ?? 0) - (rank[a.mastery.stage] ?? 0)
    || Number(b.impactScore ?? -1) - Number(a.impactScore ?? -1)
    || Number(b.stat.evidence?.observation?.targetedSessionCount || 0) - Number(a.stat.evidence?.observation?.targetedSessionCount || 0)
    || Number(b.mastery.evidenceSummary?.generalConfidenceScore || 0) - Number(a.mastery.evidenceSummary?.generalConfidenceScore || 0)
    || a.stat.entityType.localeCompare(b.stat.entityType)
    || a.stat.entityKey.localeCompare(b.stat.entityKey)
    || a.stat.statId.localeCompare(b.stat.statId);
}

function admissionEligible({ stat, mastery, executionQuality, impactScore }, policy) {
  return (rank[mastery?.stage] ?? 0) >= rank.acquired
    && (confidenceRank[mastery?.evidenceSummary?.generalConfidenceLevel] ?? 0) >= confidenceRank[policy.admission.minimumGeneralConfidence]
    && Number(executionQuality?.score) >= policy.admission.minimumReferenceQuality
    && (
      Number(stat?.evidence?.observation?.targetedSessionCount || 0) > 0
      || Number(impactScore) >= policy.admission.minimumImpactScore
    );
}

function currentReferenceTime(stat, now) {
  return stat?.lastObservedAt ?? stat?.evidence?.observation?.lastObservedAt ?? new Date(typeof now === "function" ? now() : now).toISOString();
}

async function listContextReviewItems(repository, profileId, contextId) {
  if (typeof repository.listReviewItems === "function") return repository.listReviewItems(profileId, contextId);
  const all = await repository.listReviewItemsAcrossContexts(profileId);
  return all.filter((item) => item.contextId === contextId);
}

export async function reconcilePracticeReviewSchedule({
  repository,
  profileId,
  contextId,
  now = () => new Date(),
  limiterService = null,
  policy = PRACTICE_REVIEW_POLICY_V1,
  limiterPolicy = PRACTICE_LIMITER_POLICY_V1,
} = {}) {
  if (!repository || typeof repository.listSkillStats !== "function" || typeof repository.listLearningStates !== "function") throw new TypeError("Practice review reconciliation requires repository batch reads");
  const [context, skillStats, reviewItems, learningStates, limiterSnapshot] = await Promise.all([
    repository.getPracticeContext(contextId),
    repository.listSkillStats(profileId, contextId),
    listContextReviewItems(repository, profileId, contextId),
    repository.listLearningStates(profileId, contextId),
    limiterService?.buildContextLimiterSnapshot?.({ profileId, contextId, maxCandidates: 4096 }) ?? Promise.resolve(null),
  ]);
  if (!context || context.profileId !== profileId) throw new TypeError("Practice review reconciliation context mismatch");

  const reviewByEntity = new Map(reviewItems.map((item) => [identity(item.entityType, item.entityKey), item]));
  const learningByStat = new Map(learningStates.map((state) => [state.statId, state]));
  const retentionMapByEntity = createPracticeRetentionEvidenceMap(reviewItems, policy);
  const retentionByStat = new Map(skillStats.map((stat) => [stat.statId, retentionMapByEntity.get(identity(stat.entityType, stat.entityKey))]));
  const masteryResults = buildPracticeMasteryEvaluationSet({ skillStats, context, retentionEvidenceMap: retentionByStat, limiterPolicy });
  const masteryByStat = new Map(masteryResults.map((entry) => [entry.statId, entry]));
  const impactByStat = getImpactMap(limiterSnapshot);
  const peerIndex = createPracticePeerReferenceIndex(skillStats, limiterPolicy);
  const evaluated = skillStats.map((stat) => {
    const limiterEvaluation = evaluatePracticeLimiterDimensions(stat, peerIndex.forStat(stat), limiterPolicy);
    const executionQuality = buildPracticePersistentExecutionQuality({ stat, limiterEvaluation, reviewPolicy: policy });
    return {
      stat,
      mastery: masteryByStat.get(stat.statId),
      limiterEvaluation,
      executionQuality,
      impactScore: impactByStat.get(stat.statId) ?? null,
      learning: learningByStat.get(stat.statId) ?? null,
      existing: reviewByEntity.get(identity(stat.entityType, stat.entityKey)) ?? null,
    };
  });

  const statsByEntity = new Map(skillStats.map((stat) => [identity(stat.entityType, stat.entityKey), stat]));
  const changes = [];
  let orphanDeleted = 0;
  for (const item of reviewItems) {
    if (statsByEntity.has(identity(item.entityType, item.entityKey))) continue;
    if (typeof repository.deleteReviewItem === "function") await repository.deleteReviewItem(item.reviewItemId);
    orphanDeleted += 1;
  }

  for (const entry of evaluated.filter((value) => value.existing)) {
    const item = entry.existing;
    const masteryStage = entry.mastery?.stage ?? "unmeasured";
    const acquired = (rank[masteryStage] ?? 0) >= rank.acquired;
    if (item.state === "active" && !acquired) {
      const next = suspendPracticeReviewItem(item, "mastery-below-acquired", { now });
      await repository.saveReviewItem(next);
      changes.push({ action: "suspended", reviewItemId: item.reviewItemId, reason: "mastery-below-acquired" });
      continue;
    }
    if (item.state === "suspended") {
      const threshold = item.retention?.lastVerifiedAt ?? item.cycle?.startedAt ?? item.updatedAt;
      const reacquired = laterThan(entry.learning?.acquisition?.lastObservedAt, threshold);
      if (reacquired && acquired && Number(entry.executionQuality?.score) >= policy.admission.minimumReferenceQuality) {
        const next = activatePracticeReviewItem(item, {
          masteryStage,
          referenceAtUtc: currentReferenceTime(entry.stat, now),
          referenceQuality: entry.executionQuality.score,
          resetReason: "reacquisition",
          now,
          policy,
        });
        await repository.saveReviewItem(next);
        changes.push({ action: "reactivated", reviewItemId: item.reviewItemId, cycleId: next.cycle.cycleId });
      }
      continue;
    }
    if (item.state === "inactive" && admissionEligible(entry, policy)) {
      const next = activatePracticeReviewItem(item, {
        masteryStage,
        referenceAtUtc: currentReferenceTime(entry.stat, now),
        referenceQuality: entry.executionQuality.score,
        resetReason: "eligible",
        now,
        policy,
      });
      await repository.saveReviewItem(next);
      changes.push({ action: "activated", reviewItemId: item.reviewItemId, cycleId: next.cycle.cycleId });
      continue;
    }
    if (item.state === "active" && acquired) {
      const upgraded = Number(entry.executionQuality?.score) >= Number(item.cycle?.referenceQuality) + policy.referenceUpgradeThreshold;
      const acquisitionAfterCycleStart = laterThan(entry.learning?.acquisition?.lastObservedAt, item.cycle?.startedAt);
      if (upgraded && acquisitionAfterCycleStart) {
        const next = activatePracticeReviewItem(item, {
          masteryStage,
          referenceAtUtc: currentReferenceTime(entry.stat, now),
          referenceQuality: entry.executionQuality.score,
          resetReason: "material-reference-upgrade",
          now,
          policy,
        });
        await repository.saveReviewItem(next);
        changes.push({ action: "cycle-reset", reviewItemId: item.reviewItemId, cycleId: next.cycle.cycleId, reason: "material-reference-upgrade" });
      }
    }
  }

  const existingCount = reviewItems.length - orphanDeleted;
  const availableSlots = Math.max(0, PRACTICE_LIMITS.reviewItems - existingCount);
  const newCandidates = evaluated
    .filter((entry) => !entry.existing && admissionEligible(entry, policy))
    .sort(candidateSort)
    .slice(0, Math.min(policy.admission.maxNewItemsPerReconciliation, availableSlots));
  for (const entry of newCandidates) {
    const inactive = createInactivePracticeReviewItem({
      reviewItemId: createPracticeReviewItemId(),
      profileId,
      contextId,
      entityType: entry.stat.entityType,
      entityKey: entry.stat.entityKey,
      now,
    });
    const next = activatePracticeReviewItem(inactive, {
      masteryStage: entry.mastery.stage,
      referenceAtUtc: currentReferenceTime(entry.stat, now),
      referenceQuality: entry.executionQuality.score,
      resetReason: "initial-eligibility",
      now,
      policy,
    });
    await repository.saveReviewItem(next);
    changes.push({ action: "created", reviewItemId: next.reviewItemId, cycleId: next.cycle.cycleId });
  }

  return Object.freeze({
    profileId,
    contextId,
    reconciledAt: new Date(typeof now === "function" ? now() : now).toISOString(),
    evaluatedSkillCount: skillStats.length,
    existingReviewCount: reviewItems.length,
    createdCount: newCandidates.length,
    orphanDeletedCount: orphanDeleted,
    changes: Object.freeze(changes),
  });
}
