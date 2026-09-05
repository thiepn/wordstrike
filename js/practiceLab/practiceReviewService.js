import { buildPracticeMasteryEvaluationSet } from "./practiceMasterySnapshot.js";
import { createPracticeRetentionEvidenceMap } from "./practiceRetentionEvidence.js";
import { buildPracticeReviewPlan } from "./practiceReviewPlan.js";
import { buildPracticeReviewQueue } from "./practiceReviewQueue.js";
import { reconcilePracticeReviewSchedule } from "./practiceReviewScheduler.js";
import { PRACTICE_REVIEW_POLICY_V1 } from "./practiceReviewPolicy.js";

async function listContextReviewItems(repository, profileId, contextId) {
  if (typeof repository.listReviewItems === "function") return repository.listReviewItems(profileId, contextId);
  const all = await repository.listReviewItemsAcrossContexts(profileId);
  return all.filter((item) => item.contextId === contextId);
}

export function createPracticeReviewService({
  repository,
  limiterService = null,
  now = () => new Date(),
  policy = PRACTICE_REVIEW_POLICY_V1,
} = {}) {
  if (!repository || typeof repository.listSkillStats !== "function") throw new TypeError("Practice review service requires repository");

  const queue = async ({ profileId, contextId, maxCandidates = policy.queue.maxCandidates, includeNearDue = false, reconcile = true } = {}) => {
    if (reconcile) {
      try {
        await reconcilePracticeReviewSchedule({ repository, limiterService, profileId, contextId, now, policy });
      } catch {
        // Scheduling reconciliation is reconstructable. Queue reads remain useful and a later pass can repair it.
      }
    }
    const [context, skillStats, reviewItems, limiterSnapshot] = await Promise.all([
      repository.getPracticeContext(contextId),
      repository.listSkillStats(profileId, contextId),
      listContextReviewItems(repository, profileId, contextId),
      limiterService?.buildContextLimiterSnapshot?.({ profileId, contextId, maxCandidates: 4096 }) ?? Promise.resolve(null),
    ]);
    if (!context || context.profileId !== profileId) throw new TypeError("Practice review queue context mismatch");
    const retentionByEntity = createPracticeRetentionEvidenceMap(reviewItems, policy);
    const retentionByStat = new Map(skillStats.map((stat) => [stat.statId, retentionByEntity.get(`${stat.entityType}\u0000${stat.entityKey}`)]));
    const masteryEntities = buildPracticeMasteryEvaluationSet({ skillStats, context, retentionEvidenceMap: retentionByStat });
    const impactEntities = limiterSnapshot?.candidates ?? [];
    return buildPracticeReviewQueue({
      profileId,
      contextId,
      now: now(),
      maxCandidates,
      includeNearDue,
      reviewItems,
      masteryEntities,
      impactEntities,
      policy,
    });
  };

  return Object.freeze({
    reconcile(options) { return reconcilePracticeReviewSchedule({ repository, limiterService, now, policy, ...options }); },
    buildPracticeReviewQueue: queue,
    async buildPracticeReviewPlan(options = {}) {
      const snapshot = options.queue ?? await queue(options);
      return buildPracticeReviewPlan({ queue: snapshot, maxItems: options.maxItems, maxCostUnits: options.maxCostUnits, includeNearDue: options.includeNearDue, policy });
    },
  });
}
