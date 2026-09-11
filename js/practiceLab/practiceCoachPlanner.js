import {
  PRACTICE_COACH_PLANNER_VERSION,
  PRACTICE_COACH_REVIEW_COST_MINUTES,
  PRACTICE_COACH_REVIEW_EXPERIMENT_ID,
  PRACTICE_COACH_SECOND_TARGET_UTILITY,
  PRACTICE_COACH_TARGET_COST_MINUTES,
} from "./practiceCoachConstants.js";
import { PRACTICE_COACH_POLICY_V1, normalizePracticeCoachRequestedMinutes } from "./practiceCoachPolicy.js";
import { createPracticeCoachPlanRecord } from "./practiceCoachPlan.js";
import { practiceCoachTargetsOverlap } from "./practiceCoachTargets.js";
import { hashPracticeContent } from "./practiceIds.js";

const entityIdentity = (target) => `${target?.entityType ?? ""}\u0000${target?.entityKey ?? ""}`;

function plannedSessionId(profileId, contextId, localDayKey, blockId) {
  const hash = hashPracticeContent(`${profileId}|${contextId}|${localDayKey}|${blockId}|1`).slice(-8);
  return `practice-session_coach-${hash}-${blockId}`;
}

export function shouldIncludePracticeCoachReview(queue, requestedMinutes, policy = PRACTICE_COACH_POLICY_V1) {
  const candidates = Array.isArray(queue?.candidates) ? queue.candidates.filter((candidate) => ["due", "overdue"].includes(candidate?.dueStatus)) : [];
  if (!candidates.length) return false;
  const overdue = candidates.some((candidate) => candidate.dueStatus === "overdue");
  const maximumValue = Math.max(...candidates.map((candidate) => Number(candidate.reviewValue || 0)), 0);
  if (requestedMinutes === 5) return overdue || maximumValue >= policy.review.urgentValue;
  if (requestedMinutes === 8) return overdue || maximumValue >= 50;
  return maximumValue >= policy.review.moderateValue;
}

function selectSecondTarget(targets, first, policy) {
  const eligible = targets.filter((candidate) => candidate !== first
    && Number(candidate.baseUtilityScore ?? candidate.utilityScore) >= Math.max(PRACTICE_COACH_SECOND_TARGET_UTILITY, policy.secondTargetUtility)
    && !practiceCoachTargetsOverlap(first, candidate));
  if (!eligible.length) return null;
  const top = eligible[0];
  const diversityWindow = eligible.filter((candidate) => Number(top.personalizedUtilityScore ?? top.utilityScore) - Number(candidate.personalizedUtilityScore ?? candidate.utilityScore) <= policy.diversityWindow);
  const distinct = diversityWindow.find((candidate) => candidate.experimentId !== first.experimentId);
  return distinct ?? top;
}

function largestRealTextMinutes(remaining, supportedMinutes, policy) {
  const supported = new Set((supportedMinutes ?? policy.realTextMinutes).map(Number));
  return policy.realTextMinutes.find((minutes) => minutes <= remaining && supported.has(minutes)) ?? null;
}

function createReviewBlock({ profileId, contextId, localDayKey, reviewPlan }) {
  return {
    blockId: "review",
    kind: "review",
    experimentId: PRACTICE_COACH_REVIEW_EXPERIMENT_ID,
    experimentVersion: 1,
    plannedSessionId: plannedSessionId(profileId, contextId, localDayKey, "review"),
    estimatedMinutes: PRACTICE_COACH_REVIEW_COST_MINUTES,
    reviewPlan,
    personalizationDecision: null,
    responseInformed: false,
    reasonCodes: [reviewPlan?.hasOverdue ? "overdue-review" : "high-review-value"],
  };
}

function createTargetBlock({ profileId, contextId, localDayKey, candidate, index }) {
  const blockId = `target-${index}`;
  return {
    blockId,
    kind: "targeted-intervention",
    experimentId: candidate.experimentId,
    experimentVersion: candidate.experimentVersion ?? 1,
    plannedSessionId: plannedSessionId(profileId, contextId, localDayKey, blockId),
    estimatedMinutes: PRACTICE_COACH_TARGET_COST_MINUTES,
    target: { entityType: candidate.entityType, entityKey: candidate.entityKey, statId: candidate.statId ?? null },
    targetSource: "external-plan",
    baseUtilityScore: candidate.baseUtilityScore ?? candidate.utilityScore,
    personalizedUtilityScore: candidate.personalizedUtilityScore ?? candidate.utilityScore,
    utilityScore: candidate.personalizedUtilityScore ?? candidate.utilityScore,
    personalizationDecision: candidate.personalizationDecision ?? null,
    responseInformed: candidate.responseInformed === true,
    reasonCodes: candidate.reasonCodes ?? [],
  };
}

function createRealTextBlock({ profileId, contextId, localDayKey, minutes, reasonCodes = [] }) {
  return {
    blockId: "integration",
    kind: "real-text",
    experimentId: "real-text",
    experimentVersion: 1,
    plannedSessionId: plannedSessionId(profileId, contextId, localDayKey, "integration"),
    estimatedMinutes: minutes,
    realTextDurationMs: minutes * 60_000,
    personalizationDecision: null,
    responseInformed: false,
    reasonCodes: ["broad-integration", ...reasonCodes].slice(0, 4),
  };
}

function orderBlocks({ review, firstTarget, secondTarget, realText, readinessBand, warmupStatus }) {
  const blocks = [];
  if (review) blocks.push(review);
  const broadFirst = Boolean(realText && (readinessBand === "reduced" || warmupStatus === "observed"));
  if (broadFirst) {
    blocks.push(realText);
    if (firstTarget) blocks.push(firstTarget);
    if (secondTarget) blocks.push(secondTarget);
    return blocks;
  }
  if (firstTarget) blocks.push(firstTarget);
  if (secondTarget) {
    if (realText) blocks.push(realText);
    blocks.push(secondTarget);
  } else if (realText) blocks.push(realText);
  return blocks;
}

export function buildPracticeCoachDailyPlan({
  profileId,
  contextId,
  localDayKey,
  requestedMinutes,
  inputFingerprint,
  decisionContext = {},
  suggestions = {},
  reviewQueue = null,
  reviewPlan = null,
  targetCandidates = [],
  realTextSupportedMinutes = [10, 5, 3],
  readinessBand = decisionContext.readinessBand ?? "unknown",
  warmupStatus = decisionContext.warmupStatus ?? "unknown",
  now = () => new Date(),
  policy = PRACTICE_COACH_POLICY_V1,
} = {}) {
  const budget = normalizePracticeCoachRequestedMinutes(requestedMinutes, policy);
  const minutes = budget.minutes;
  const reviewIncluded = Boolean(reviewPlan?.bindings?.length) && shouldIncludePracticeCoachReview(reviewQueue, minutes, policy);
  const reviewedEntities = new Set((reviewIncluded ? reviewPlan.bindings : []).map(entityIdentity));
  const readyTargets = (Array.isArray(targetCandidates) ? targetCandidates : [])
    .filter((candidate) => candidate?.availabilityStatus === undefined || candidate.availabilityStatus === "ready")
    .filter((candidate) => !reviewedEntities.has(entityIdentity(candidate)))
    .filter((candidate) => Number(candidate.baseUtilityScore ?? candidate.utilityScore) >= policy.actionableUtility);

  let remaining = minutes;
  let reviewBlock = null;
  if (reviewIncluded) {
    reviewBlock = createReviewBlock({ profileId, contextId, localDayKey, reviewPlan });
    remaining -= reviewBlock.estimatedMinutes;
  }

  const maxTargets = reviewIncluded && minutes === 5 ? 0 : policy.maxTargetBlocksByMinutes[minutes] ?? 0;
  let firstTarget = null;
  let secondTarget = null;
  if (maxTargets >= 1 && remaining >= PRACTICE_COACH_TARGET_COST_MINUTES && readyTargets.length) {
    firstTarget = createTargetBlock({ profileId, contextId, localDayKey, candidate: readyTargets[0], index: 1 });
    remaining -= PRACTICE_COACH_TARGET_COST_MINUTES;
  }
  if (minutes === 15 && maxTargets >= 2 && firstTarget && remaining >= PRACTICE_COACH_TARGET_COST_MINUTES) {
    const second = selectSecondTarget(readyTargets, readyTargets[0], policy);
    if (second) {
      secondTarget = createTargetBlock({ profileId, contextId, localDayKey, candidate: second, index: 2 });
      remaining -= PRACTICE_COACH_TARGET_COST_MINUTES;
    }
  }

  const realTextMinutes = largestRealTextMinutes(remaining, realTextSupportedMinutes, policy);
  const orderReasons = readinessBand === "reduced" ? ["readiness-reduced"] : warmupStatus === "observed" ? ["warmup-observed"] : [];
  const realText = realTextMinutes ? createRealTextBlock({ profileId, contextId, localDayKey, minutes: realTextMinutes, reasonCodes: orderReasons }) : null;
  const blocks = orderBlocks({ review: reviewBlock, firstTarget, secondTarget, realText, readinessBand, warmupStatus });
  const modelVersions = decisionContext.modelVersions ?? {};
  return createPracticeCoachPlanRecord({
    profileId,
    contextId,
    localDayKey,
    requestedMinutes: minutes,
    inputFingerprint,
    decisionContext: {
      ...decisionContext,
      readinessBand,
      warmupStatus,
      modelVersions,
      budgetDiagnostic: budget.diagnostic,
    },
    suggestions,
    blocks,
    now,
  });
}
