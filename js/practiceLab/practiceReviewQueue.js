import { buildPracticeRetentionEvidence } from "./practiceRetentionEvidence.js";
import { derivePracticeReviewDueStatus } from "./practiceReviewItem.js";
import { PRACTICE_REVIEW_MODEL_VERSION, PRACTICE_REVIEW_VALUE_VERSION } from "./practiceReviewConstants.js";
import { PRACTICE_REVIEW_POLICY_V1 } from "./practiceReviewPolicy.js";
import { buildPracticeReviewValue } from "./practiceReviewValue.js";

const finite = Number.isFinite;
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const identity = (type, key) => `${type}\u0000${key}`;
const dueRank = { overdue: 0, due: 1, scheduled: 2 };

function mapByEntity(values, valueSelector = (value) => value) {
  if (values instanceof Map) return values;
  const map = new Map();
  for (const value of Array.isArray(values) ? values : []) map.set(identity(value.entityType, value.entityKey), valueSelector(value));
  return map;
}

export function buildPracticeReviewQueue({
  profileId,
  contextId,
  now = new Date(),
  maxCandidates = PRACTICE_REVIEW_POLICY_V1.queue.maxCandidates,
  includeNearDue = false,
  reviewItems = [],
  masteryEntities = [],
  impactEntities = [],
  policy = PRACTICE_REVIEW_POLICY_V1,
} = {}) {
  if (typeof profileId !== "string" || typeof contextId !== "string") throw new TypeError("Practice review queue requires profileId/contextId");
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 5000) throw new TypeError("Practice review queue maxCandidates is invalid");
  const masteryMap = mapByEntity(masteryEntities);
  const impactMap = mapByEntity(impactEntities, (entry) => entry?.impact?.impactScore ?? entry?.impactScore ?? null);
  const items = (Array.isArray(reviewItems) ? reviewItems : []).filter((item) => item.profileId === profileId && item.contextId === contextId);
  const counts = {
    dueCount: 0,
    overdueCount: 0,
    nearDueCount: 0,
    suspendedCount: 0,
    reacquisitionRequiredCount: 0,
    unavailable: 0,
    unverified: 0,
    verified: 0,
    failed: 0,
    retainedEligibleCount: 0,
  };
  const candidates = [];
  for (const item of items) {
    const key = identity(item.entityType, item.entityKey);
    const mastery = masteryMap.get(key) ?? null;
    const stage = mastery?.stage ?? "unmeasured";
    const impactScore = impactMap.get(key) ?? null;
    const dueStatus = derivePracticeReviewDueStatus(item, now, policy);
    const retention = buildPracticeRetentionEvidence(item, policy);
    counts[retention.status] = (counts[retention.status] ?? 0) + 1;
    counts.retainedEligibleCount += Number(retention.eligibleForRetained);
    if (dueStatus === "overdue") counts.overdueCount += 1;
    else if (dueStatus === "due") counts.dueCount += 1;
    else if (dueStatus === "scheduled" && item.state === "active") counts.nearDueCount += 1;
    else if (dueStatus === "suspended") {
      counts.suspendedCount += 1;
      counts.reacquisitionRequiredCount += 1;
    }
    const actionable = dueStatus === "due" || dueStatus === "overdue" || (includeNearDue && dueStatus === "scheduled");
    if (!actionable || item.state !== "active") continue;
    const value = buildPracticeReviewValue({ reviewItem: item, masteryStage: stage, impactScore, now, policy });
    candidates.push({
      reviewItemId: item.reviewItemId,
      entityType: item.entityType,
      entityKey: item.entityKey,
      masteryStage: stage,
      retentionStatus: retention.status,
      retentionScore: retention.score,
      retentionConfidence: retention.confidenceScore,
      dueStatus,
      dueAtUtc: item.dueAtUtc,
      minimumMatureAtUtc: item.minimumMatureAtUtc,
      intervalDays: item.intervalDays,
      stabilityDays: item.stabilityDays,
      reviewValue: value.reviewValue,
      reviewValueBand: value.reviewValueBand,
      reviewValuePerCost: value.reviewValuePerCost,
      impactScore: finite(impactScore) ? impactScore : null,
      costUnits: value.costUnits,
      verificationNeed: value.verificationNeed,
      reacquisitionRequired: false,
      reviewBinding: {
        reviewItemId: item.reviewItemId,
        cycleId: item.cycle?.cycleId ?? null,
        referenceAtUtc: item.cycle?.referenceAtUtc ?? null,
        referenceQuality: item.cycle?.referenceQuality ?? null,
        entityType: item.entityType,
        entityKey: item.entityKey,
        dueAtUtc: item.dueAtUtc,
        minimumMatureAtUtc: item.minimumMatureAtUtc,
        excludeFamilyIds: Array.isArray(item.recentProbeFamilyIds) ? [...item.recentProbeFamilyIds] : [],
      },
    });
  }
  candidates.sort((a, b) => (
    (dueRank[a.dueStatus] ?? 9) - (dueRank[b.dueStatus] ?? 9)
    || Number(b.reviewValue || 0) - Number(a.reviewValue || 0)
    || Number(a.retentionConfidence || 0) - Number(b.retentionConfidence || 0)
    || Number(b.impactScore ?? -1) - Number(a.impactScore ?? -1)
    || String(a.dueAtUtc).localeCompare(String(b.dueAtUtc))
    || a.entityType.localeCompare(b.entityType)
    || a.entityKey.localeCompare(b.entityKey)
  ));
  return freezeDeep({
    modelVersions: {
      reviewModelVersion: PRACTICE_REVIEW_MODEL_VERSION,
      reviewValueVersion: PRACTICE_REVIEW_VALUE_VERSION,
      reviewPolicyVersion: policy.version,
    },
    profileId,
    contextId,
    generatedAt: new Date(typeof now === "function" ? now() : now).toISOString(),
    dueCount: counts.dueCount,
    overdueCount: counts.overdueCount,
    nearDueCount: counts.nearDueCount,
    suspendedCount: counts.suspendedCount,
    reacquisitionRequiredCount: counts.reacquisitionRequiredCount,
    retentionStatusCounts: {
      unavailable: counts.unavailable,
      unverified: counts.unverified,
      verified: counts.verified,
      failed: counts.failed,
    },
    retainedEligibleCount: counts.retainedEligibleCount,
    candidates: candidates.slice(0, maxCandidates),
  });
}
