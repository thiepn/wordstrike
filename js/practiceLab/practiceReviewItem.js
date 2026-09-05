import { PRACTICE_RECORD_VERSIONS } from "./practiceConstants.js";
import { PRACTICE_MASTERY_STAGE_RANK } from "./practiceMasteryConstants.js";
import { PRACTICE_REVIEW_POLICY_V1 } from "./practiceReviewPolicy.js";
import { getPracticeTimeContext, toPracticeUtcIso } from "./practiceTime.js";

const DAY_MS = 86_400_000;
const finite = Number.isFinite;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function iso(value) {
  const source = typeof value === "function" ? value() : value;
  const date = source instanceof Date ? source : new Date(source);
  if (!Number.isFinite(date.getTime())) throw new TypeError("Practice review time is invalid");
  return date.toISOString();
}

export function createEmptyPracticeRetentionState() {
  return {
    status: "unverified",
    score: null,
    confidenceScore: 0,
    confidenceLevel: "none",
    currentCycleVerificationCount: 0,
    currentCycleSuccessfulCount: 0,
    currentCycleFragileCount: 0,
    currentCycleFailedCount: 0,
    currentCycleDistinctReviewDays: 0,
    currentCycleDistinctSuccessfulDays: 0,
    currentCycleMaxSuccessfulDelayDays: 0,
    currentCycleDistinctSuccessfulFamilies: 0,
    lifetimeVerificationCount: 0,
    lifetimeSuccessCount: 0,
    lifetimeFailureCount: 0,
    lastProbeAt: null,
    lastVerifiedAt: null,
    lastOutcome: null,
    recentProbes: [],
  };
}

export function practiceInitialReviewIntervalDays(stage, policy = PRACTICE_REVIEW_POLICY_V1) {
  const value = policy.initialIntervalsDays?.[stage];
  return finite(value) && value > 0 ? value : null;
}

export function practiceMaturityDelayDays(intervalDays, policy = PRACTICE_REVIEW_POLICY_V1) {
  if (!finite(intervalDays) || intervalDays <= 0) return null;
  return Math.max(policy.maturity.minimumDays, policy.maturity.intervalFraction * intervalDays);
}

export function createPracticeReviewCycle({
  cycleId = 1,
  startedAt,
  resetReason = "initial-eligibility",
  referenceAtUtc,
  referenceQuality,
  initialMasteryStage,
  initialIntervalDays,
} = {}) {
  if (!Number.isInteger(cycleId) || cycleId < 1) throw new TypeError("Practice review cycleId must be positive integer");
  if (!finite(referenceQuality) || referenceQuality < 0 || referenceQuality > 100) throw new TypeError("Practice review reference quality is invalid");
  if (!finite(initialIntervalDays) || initialIntervalDays <= 0) throw new TypeError("Practice review initial interval is invalid");
  return freezeDeep({
    cycleId,
    startedAt: iso(startedAt ?? referenceAtUtc),
    resetReason: String(resetReason || "cycle-reset").slice(0, 80),
    referenceAtUtc: iso(referenceAtUtc),
    referenceQuality,
    initialMasteryStage,
    initialIntervalDays,
  });
}

export function createInactivePracticeReviewItem({
  reviewItemId,
  profileId,
  contextId,
  entityType,
  entityKey,
  now = () => new Date(),
  suspensionReason = null,
  legacyReviewV2 = null,
} = {}) {
  const timestamp = toPracticeUtcIso(now);
  return freezeDeep({
    reviewItemId,
    profileId,
    contextId,
    entityType,
    entityKey,
    recordVersion: PRACTICE_RECORD_VERSIONS.reviewItem,
    createdAt: timestamp,
    updatedAt: timestamp,
    state: "inactive",
    dueAtUtc: null,
    localDueDayKey: null,
    intervalDays: null,
    stabilityDays: null,
    minimumMatureAtUtc: null,
    lastScheduledAt: null,
    suspensionReason,
    cycle: null,
    retention: createEmptyPracticeRetentionState(),
    recentProbeFamilyIds: [],
    legacyReviewV2,
  });
}

export function activatePracticeReviewItem(item, {
  masteryStage,
  referenceAtUtc,
  referenceQuality,
  resetReason = "initial-eligibility",
  now = () => new Date(),
  policy = PRACTICE_REVIEW_POLICY_V1,
} = {}) {
  const intervalDays = practiceInitialReviewIntervalDays(masteryStage, policy);
  if (intervalDays == null || (PRACTICE_MASTERY_STAGE_RANK[masteryStage] ?? -1) < PRACTICE_MASTERY_STAGE_RANK.acquired) {
    throw new TypeError("Practice review activation requires Acquired+ mastery");
  }
  if (!finite(referenceQuality) || referenceQuality < policy.admission.minimumReferenceQuality || referenceQuality > 100) {
    throw new TypeError("Practice review activation requires valid reference quality");
  }
  const referenceIso = iso(referenceAtUtc ?? now);
  const cycleId = Number(item?.cycle?.cycleId || 0) + 1;
  const maturityDelay = practiceMaturityDelayDays(intervalDays, policy);
  const dueAtUtc = new Date(Date.parse(referenceIso) + intervalDays * DAY_MS).toISOString();
  const minimumMatureAtUtc = new Date(Date.parse(referenceIso) + maturityDelay * DAY_MS).toISOString();
  const cycle = createPracticeReviewCycle({
    cycleId,
    startedAt: now,
    resetReason,
    referenceAtUtc: referenceIso,
    referenceQuality,
    initialMasteryStage: masteryStage,
    initialIntervalDays: intervalDays,
  });
  const previousRetention = item?.retention ?? createEmptyPracticeRetentionState();
  const retention = createEmptyPracticeRetentionState();
  retention.lifetimeVerificationCount = Number(previousRetention.lifetimeVerificationCount || 0);
  retention.lifetimeSuccessCount = Number(previousRetention.lifetimeSuccessCount || 0);
  retention.lifetimeFailureCount = Number(previousRetention.lifetimeFailureCount || 0);
  retention.recentProbes = Array.isArray(previousRetention.recentProbes)
    ? previousRetention.recentProbes.slice(-policy.reviewItem.maxRecentProbes)
    : [];
  retention.lastProbeAt = previousRetention.lastProbeAt ?? null;
  retention.lastVerifiedAt = previousRetention.lastVerifiedAt ?? null;
  retention.lastOutcome = previousRetention.lastOutcome ?? null;
  return freezeDeep({
    ...item,
    recordVersion: PRACTICE_RECORD_VERSIONS.reviewItem,
    updatedAt: toPracticeUtcIso(now),
    state: "active",
    dueAtUtc,
    localDueDayKey: getPracticeTimeContext(new Date(dueAtUtc)).localDayKey,
    intervalDays,
    stabilityDays: intervalDays,
    minimumMatureAtUtc,
    lastScheduledAt: toPracticeUtcIso(now),
    suspensionReason: null,
    cycle,
    retention,
    recentProbeFamilyIds: [],
  });
}

export function suspendPracticeReviewItem(item, reason, { now = () => new Date() } = {}) {
  return freezeDeep({
    ...item,
    updatedAt: toPracticeUtcIso(now),
    state: "suspended",
    dueAtUtc: null,
    localDueDayKey: null,
    minimumMatureAtUtc: null,
    suspensionReason: String(reason || "suspended").slice(0, 80),
  });
}

export function derivePracticeReviewDueStatus(item, now = new Date(), policy = PRACTICE_REVIEW_POLICY_V1) {
  if (!item || item.state === "inactive") return "inactive";
  if (item.state === "suspended") return "suspended";
  if (item.state !== "active") return "inactive";
  const nowMs = new Date(typeof now === "function" ? now() : now).getTime();
  const matureMs = Date.parse(item.minimumMatureAtUtc);
  const dueMs = Date.parse(item.dueAtUtc);
  const referenceMs = Date.parse(item.cycle?.referenceAtUtc ?? item.cycle?.startedAt);
  if (![nowMs, matureMs, dueMs, referenceMs].every(finite)) return "inactive";
  if (nowMs < matureMs) return "not-mature";
  if (nowMs < dueMs) return "scheduled";
  const plannedMs = Math.max(policy.stability.minimumDays * DAY_MS, Number(item.intervalDays) * DAY_MS);
  const elapsedRatio = (nowMs - referenceMs) / plannedMs;
  return elapsedRatio + 1e-12 >= policy.overdueRatio ? "overdue" : "due";
}

export function practiceReviewElapsedDays(item, at = new Date()) {
  const referenceMs = Date.parse(item?.cycle?.referenceAtUtc ?? "");
  const atMs = new Date(typeof at === "function" ? at() : at).getTime();
  return finite(referenceMs) && finite(atMs) ? Math.max(0, (atMs - referenceMs) / DAY_MS) : null;
}

export function clampPracticeStabilityDays(value, policy = PRACTICE_REVIEW_POLICY_V1) {
  return clamp(Number(value), policy.stability.minimumDays, policy.stability.maximumDays);
}

export { DAY_MS as PRACTICE_REVIEW_DAY_MS };
