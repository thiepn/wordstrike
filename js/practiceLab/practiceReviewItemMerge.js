import { PRACTICE_REVIEW_POLICY_V1 } from "./practiceReviewPolicy.js";
import {
  PRACTICE_REVIEW_DAY_MS,
  practiceMaturityDelayDays,
} from "./practiceReviewItem.js";
import {
  medianPracticeRetentionScores,
  practiceRetentionConfidence,
  updatePracticeRetentionStability,
} from "./practiceRetentionQuality.js";
import { getPracticeTimeContext } from "./practiceTime.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const success = (outcome) => outcome === "strong" || outcome === "pass";

function compactProbe(delta) {
  return {
    sessionId: delta.sessionId,
    cycleId: delta.cycleId,
    reviewedAtUtc: delta.reviewedAtUtc,
    localDayKey: delta.localDayKey,
    measurementStatus: delta.measurementStatus,
    probeQuality: delta.probeQuality,
    retentionScore: delta.retentionScore,
    outcome: delta.outcome,
    opportunityCount: delta.opportunityCount,
    elapsedDays: delta.elapsedDays,
    mature: delta.mature,
    noveltyStatus: delta.noveltyStatus,
    verificationEligible: delta.verificationEligible === true,
    familyIds: Array.isArray(delta.familyIds) ? [...delta.familyIds] : [],
  };
}

function appendFamilyRing(existing, familyIds, max) {
  const ring = Array.isArray(existing) ? [...existing] : [];
  for (const familyId of familyIds ?? []) {
    const index = ring.indexOf(familyId);
    if (index >= 0) ring.splice(index, 1);
    ring.push(familyId);
  }
  return ring.slice(-max);
}

function currentCycleProbes(recentProbes, cycleId) {
  return recentProbes.filter((probe) => probe.cycleId === cycleId && probe.verificationEligible === true);
}

export function mergePracticeRetentionReviewDelta(item, delta, policy = PRACTICE_REVIEW_POLICY_V1) {
  if (!item || item.state !== "active" || !item.cycle) throw new TypeError("Practice retention merge requires active review item");
  if (delta.reviewItemId !== item.reviewItemId || delta.cycleId !== item.cycle.cycleId || delta.expectedReferenceAtUtc !== item.cycle.referenceAtUtc) {
    return Object.freeze({ stale: true, item });
  }
  const retention = { ...item.retention };
  const recentProbes = [
    ...(Array.isArray(retention.recentProbes) ? retention.recentProbes : []),
    compactProbe(delta),
  ].slice(-policy.reviewItem.maxRecentProbes);
  retention.recentProbes = recentProbes;
  retention.lastProbeAt = delta.reviewedAtUtc;
  const recentProbeFamilyIds = appendFamilyRing(item.recentProbeFamilyIds, delta.familyIds, policy.reviewItem.maxRecentProbeFamilies);

  if (delta.verificationEligible !== true) {
    return Object.freeze({
      stale: false,
      item: freezeDeep({
        ...item,
        updatedAt: delta.reviewedAtUtc,
        retention,
        recentProbeFamilyIds,
      }),
    });
  }

  const outcome = delta.outcome;
  if (!["strong", "pass", "fragile", "fail"].includes(outcome)) throw new TypeError("Verified retention delta requires canonical outcome");
  retention.currentCycleVerificationCount = Number(retention.currentCycleVerificationCount || 0) + 1;
  retention.currentCycleSuccessfulCount = Number(retention.currentCycleSuccessfulCount || 0) + Number(success(outcome));
  retention.currentCycleFragileCount = Number(retention.currentCycleFragileCount || 0) + Number(outcome === "fragile");
  retention.currentCycleFailedCount = Number(retention.currentCycleFailedCount || 0) + Number(outcome === "fail");
  retention.lifetimeVerificationCount = Number(retention.lifetimeVerificationCount || 0) + 1;
  retention.lifetimeSuccessCount = Number(retention.lifetimeSuccessCount || 0) + Number(success(outcome));
  retention.lifetimeFailureCount = Number(retention.lifetimeFailureCount || 0) + Number(outcome === "fail");
  retention.lastVerifiedAt = delta.reviewedAtUtc;
  retention.lastOutcome = outcome;
  retention.status = outcome === "fail" ? "failed" : "verified";

  const cycleProbes = currentCycleProbes(recentProbes, item.cycle.cycleId);
  retention.currentCycleDistinctReviewDays = new Set(cycleProbes.map((probe) => probe.localDayKey)).size;
  const successfulProbes = cycleProbes.filter((probe) => success(probe.outcome));
  retention.currentCycleDistinctSuccessfulDays = new Set(successfulProbes.map((probe) => probe.localDayKey)).size;
  retention.currentCycleMaxSuccessfulDelayDays = successfulProbes.reduce((max, probe) => Math.max(max, Number(probe.elapsedDays) || 0), 0);
  retention.currentCycleDistinctSuccessfulFamilies = new Set(successfulProbes.flatMap((probe) => probe.familyIds ?? [])).size;
  const aggregateScores = cycleProbes
    .map((probe) => probe.retentionScore)
    .filter(Number.isFinite)
    .slice(-policy.retentionAggregate.latestScoreCount);
  retention.score = medianPracticeRetentionScores(aggregateScores);
  const confidence = practiceRetentionConfidence({
    verificationCount: retention.currentCycleVerificationCount,
    distinctReviewDays: retention.currentCycleDistinctReviewDays,
    maxSuccessfulDelayDays: retention.currentCycleMaxSuccessfulDelayDays,
  }, policy);
  retention.confidenceScore = confidence.score;
  retention.confidenceLevel = confidence.level;

  const stabilityDays = updatePracticeRetentionStability(item.stabilityDays, delta.elapsedDays, outcome, policy);
  if (!Number.isFinite(stabilityDays)) throw new TypeError("Practice retention stability update failed");
  if (outcome === "fail") {
    return Object.freeze({
      stale: false,
      item: freezeDeep({
        ...item,
        updatedAt: delta.reviewedAtUtc,
        state: "suspended",
        dueAtUtc: null,
        localDueDayKey: null,
        minimumMatureAtUtc: null,
        stabilityDays,
        suspensionReason: "retention-failed",
        retention,
        recentProbeFamilyIds,
      }),
    });
  }

  const intervalDays = stabilityDays;
  const referenceAtUtc = delta.reviewedAtUtc;
  const referenceQuality = success(outcome)
    ? Math.max(Number(item.cycle.referenceQuality), Number(delta.probeQuality))
    : item.cycle.referenceQuality;
  const dueAtUtc = new Date(Date.parse(referenceAtUtc) + intervalDays * PRACTICE_REVIEW_DAY_MS).toISOString();
  const maturityDays = practiceMaturityDelayDays(intervalDays, policy);
  const minimumMatureAtUtc = new Date(Date.parse(referenceAtUtc) + maturityDays * PRACTICE_REVIEW_DAY_MS).toISOString();
  return Object.freeze({
    stale: false,
    item: freezeDeep({
      ...item,
      updatedAt: delta.reviewedAtUtc,
      state: "active",
      dueAtUtc,
      localDueDayKey: getPracticeTimeContext(new Date(dueAtUtc)).localDayKey,
      intervalDays,
      stabilityDays,
      minimumMatureAtUtc,
      lastScheduledAt: delta.reviewedAtUtc,
      suspensionReason: null,
      cycle: {
        ...item.cycle,
        referenceAtUtc,
        referenceQuality,
      },
      retention,
      recentProbeFamilyIds,
    }),
  });
}
