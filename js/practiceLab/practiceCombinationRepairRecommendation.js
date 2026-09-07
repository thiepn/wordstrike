import { PRACTICE_MASTERY_STAGE_RANK } from "./practiceMasteryConstants.js";
import { PRACTICE_COMBINATION_REPAIR_POLICY_V1 } from "./practiceCombinationRepairPolicy.js";
import { normalizePracticeCombinationRepairTarget } from "./practiceCombinationRepairValidation.js";

const finite = Number.isFinite;
const statusStrength = Object.freeze({ "insufficient-data": 0, "not-elevated": 0, possible: 1, likely: 2, confirmed: 3 });

function masteryNeed(entity) {
  if (!entity || entity.stage === "unmeasured") return 0;
  if (entity.stage === "learning") return 100;
  const rank = PRACTICE_MASTERY_STAGE_RANK[entity.stage] ?? 0;
  return Math.max(0, 80 - rank * 15);
}

function evidenceConfidence(limiter, mastery) {
  const values = [
    limiter?.evidenceConfidenceScore,
    limiter?.evidenceMetadata?.generalConfidenceScore,
    mastery?.evidenceSummary?.generalConfidenceScore,
  ].filter(finite);
  return values.length ? Math.max(...values) : 0;
}

export function buildPracticeCombinationRepairRecommendations({
  profileId,
  contextId,
  language = "en",
  skillStats = [],
  limiterSnapshot = null,
  masterySnapshot = null,
  maxResults = PRACTICE_COMBINATION_REPAIR_POLICY_V1.recommendation.maxResults,
} = {}) {
  if (typeof profileId !== "string" || typeof contextId !== "string") throw new TypeError("Combination Repair recommendations require profile/context identity");
  if (limiterSnapshot && (limiterSnapshot.profileId !== profileId || limiterSnapshot.contextId !== contextId)) throw new TypeError("Combination Repair limiter snapshot context mismatch");
  if (masterySnapshot && (masterySnapshot.profileId !== profileId || masterySnapshot.contextId !== contextId)) throw new TypeError("Combination Repair mastery snapshot context mismatch");
  const limiterByStat = new Map((limiterSnapshot?.candidates || []).map((entry) => [entry.statId, entry]));
  const masteryByStat = new Map((masterySnapshot?.entities || []).map((entry) => [entry.statId, entry]));
  const candidates = [];
  for (const stat of Array.isArray(skillStats) ? skillStats : []) {
    if (stat?.profileId !== profileId || stat?.contextId !== contextId) continue;
    if (!["bigram", "trigram"].includes(stat.entityType) || stat.customDerived === true || stat.sourceKind === "custom") continue;
    const target = normalizePracticeCombinationRepairTarget({ entityType: stat.entityType, entityKey: stat.entityKey, language });
    if (!target) continue;
    const limiter = limiterByStat.get(stat.statId) || null;
    const mastery = masteryByStat.get(stat.statId) || null;
    const confidence = evidenceConfidence(limiter, mastery);
    const limiterStrength = statusStrength[limiter?.status] ?? 0;
    const priority = finite(limiter?.priorityScore)
      ? limiter.priorityScore
      : finite(limiter?.weaknessScore) ? limiter.weaknessScore * confidence / 100 : 0;
    const need = masteryNeed(mastery);
    if (limiterStrength === 0 && need === 0) continue;
    if (confidence <= 0) continue;
    const score = (0.7 * priority + 0.3 * need) * confidence / 100;
    candidates.push(Object.freeze({
      statId: stat.statId,
      entityType: target.entityType,
      entityKey: target.entityKey,
      recommendationScore: score,
      evidenceConfidenceScore: confidence,
      limiterStatus: limiter?.status ?? "insufficient-data",
      limiterPriorityScore: finite(limiter?.priorityScore) ? limiter.priorityScore : null,
      weaknessScore: finite(limiter?.weaknessScore) ? limiter.weaknessScore : null,
      masteryStage: mastery?.stage ?? "unmeasured",
      targetSource: "recommended",
    }));
  }
  candidates.sort((a, b) => b.recommendationScore - a.recommendationScore
    || b.evidenceConfidenceScore - a.evidenceConfidenceScore
    || a.entityType.localeCompare(b.entityType)
    || a.entityKey.localeCompare(b.entityKey)
    || a.statId.localeCompare(b.statId));
  const bounded = Math.max(0, Math.min(Number.isInteger(maxResults) ? maxResults : 0, PRACTICE_COMBINATION_REPAIR_POLICY_V1.recommendation.maxResults));
  return Object.freeze(candidates.slice(0, bounded));
}
