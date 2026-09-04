import { computePracticeEvidenceConfidence } from "./practiceEvidenceConfidence.js";
import {
  createEmptyPracticeWelfordAggregate,
  mergePracticeWelfordAggregates,
} from "./practiceSkillEvidenceDelta.js";
import {
  PRACTICE_EVIDENCE_ROLES,
  PRACTICE_SKILL_EVIDENCE_POLICY_V1,
  PRACTICE_SKILL_EVIDENCE_VERSION,
} from "./practiceSkillEvidencePolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

export function createEmptyPracticeTimingEvidence() {
  return {
    eligibleCount: 0,
    fluentCount: 0,
    disfluentCount: 0,
    fluentLatency: createEmptyPracticeWelfordAggregate(),
    fluentResidual: createEmptyPracticeWelfordAggregate(),
    disfluentResidual: createEmptyPracticeWelfordAggregate(),
    completeTraceSessionCount: 0,
    retainedWindowSessionCount: 0,
  };
}

export function createEmptyPracticeErrorEvidence() {
  return {
    primaryEpisodeCount: 0,
    correctedEpisodeCount: 0,
    uncorrectedEpisodeCount: 0,
    structuralCounts: {
      substitution: 0,
      insertion: 0,
      omission: 0,
      transposition: 0,
      compound: 0,
      unknown: 0,
    },
    correctionInitiation: createEmptyPracticeWelfordAggregate(),
    errorToRepair: createEmptyPracticeWelfordAggregate(),
    correctCharactersRemovedCount: 0,
  };
}

export function createEmptyPracticeSkillEvidence({ entityType = "key" } = {}) {
  return {
    opportunities: { count: 0, correctCount: 0, errorCount: 0, directTargetedCount: 0, incidentalCount: 0 },
    observation: {
      sessionCount: 0,
      completedSessionCount: 0,
      abandonedSessionCount: 0,
      dayCount: 0,
      targetedSessionCount: 0,
      breadthEvidencePoints: 0,
      firstObservedAt: null,
      lastObservedAt: null,
      lastObservedDayKey: null,
    },
    timing: createEmptyPracticeTimingEvidence(),
    launchTiming: entityType === "word" ? createEmptyPracticeTimingEvidence() : null,
    errors: createEmptyPracticeErrorEvidence(),
    roles: {},
    coverage: {
      accuracyScope: "complete-session",
      completeTimingSessionCount: 0,
      retainedWindowTimingSessionCount: 0,
      evidenceTruncatedSessionCount: 0,
      omittedObservationCount: 0,
    },
  };
}

function addCounts(target, delta, keys) {
  for (const key of keys) target[key] = Number(target[key] || 0) + Number(delta?.[key] || 0);
}

function mergeTiming(existing, delta, policy) {
  if (!existing || !delta) return existing;
  const next = clone(existing);
  addCounts(next, delta, ["eligibleCount", "fluentCount", "disfluentCount"]);
  next.fluentLatency = mergePracticeWelfordAggregates(existing.fluentLatency, delta.fluentLatency, { ringLimit: policy.maxRecentSamples });
  next.fluentResidual = mergePracticeWelfordAggregates(existing.fluentResidual, delta.fluentResidual, { ringLimit: policy.maxRecentSamples });
  next.disfluentResidual = mergePracticeWelfordAggregates(existing.disfluentResidual, delta.disfluentResidual, { ringLimit: policy.maxRecentSamples });
  const contributed = Number(delta.eligibleCount || 0) > 0;
  if (contributed && delta.traceScope === "complete-session") next.completeTraceSessionCount += 1;
  if (contributed && delta.traceScope === "retained-window") next.retainedWindowSessionCount += 1;
  return next;
}

function roleLane(existing = null) {
  return existing ? clone(existing) : {
    opportunityCount: 0,
    correctCount: 0,
    errorCount: 0,
    timingEligibleCount: 0,
    fluentCount: 0,
    disfluentCount: 0,
    fluentResidualCount: 0,
    fluentResidualMeanMs: 0,
    fluentResidualM2: 0,
    recentResidualSamples: [],
    primaryErrorEpisodeCount: 0,
    sessionCount: 0,
    lastObservedAt: null,
  };
}

function combineRoleResidual(lane, aggregates, policy) {
  const left = {
    count: lane.fluentResidualCount,
    meanMs: lane.fluentResidualMeanMs,
    m2: lane.fluentResidualM2,
    minMs: lane.fluentResidualCount ? lane.fluentResidualMeanMs : null,
    maxMs: lane.fluentResidualCount ? lane.fluentResidualMeanMs : null,
    recentSamples: lane.recentResidualSamples,
  };
  let combined = left;
  for (const aggregate of aggregates.filter(Boolean)) {
    const sampled = { ...aggregate, recentSamples: (aggregate.recentSamples ?? []).slice(0, policy.maxRoleRecentSamplesPerEntityPerSession) };
    combined = mergePracticeWelfordAggregates(combined, sampled, { ringLimit: policy.maxRoleRecentSamples });
  }
  lane.fluentResidualCount = combined.count;
  lane.fluentResidualMeanMs = combined.count ? combined.meanMs : 0;
  lane.fluentResidualM2 = combined.count ? combined.m2 : 0;
  lane.recentResidualSamples = [...combined.recentSamples].slice(-policy.maxRoleRecentSamples);
}

function hasDeltaEvidence(delta) {
  return (delta.opportunities?.count ?? 0)
    + (delta.timing?.eligibleCount ?? 0)
    + (delta.launchTiming?.eligibleCount ?? 0)
    + (delta.errors?.primaryEpisodeCount ?? 0) > 0;
}

export function mergePracticeSkillEvidence(stat, delta, policy = PRACTICE_SKILL_EVIDENCE_POLICY_V1) {
  if (!stat || !delta) throw new TypeError("Practice evidence merge requires stat and delta");
  for (const key of ["statId", "profileId", "contextId", "entityType", "entityKey"]) {
    if (stat[key] !== delta[key]) throw new TypeError(`Practice skill evidence identity mismatch: ${key}`);
  }
  if (!PRACTICE_EVIDENCE_ROLES.includes(delta.evidenceRole)) throw new TypeError("Practice skill evidence role is invalid");
  if (!hasDeltaEvidence(delta)) throw new TypeError("Practice skill evidence delta contains no evidence");
  const next = clone(stat);
  next.evidenceVersion = PRACTICE_SKILL_EVIDENCE_VERSION;
  next.evidence = next.evidence ?? createEmptyPracticeSkillEvidence({ entityType: next.entityType });

  addCounts(next.evidence.opportunities, delta.opportunities, ["count", "correctCount", "errorCount", "directTargetedCount", "incidentalCount"]);
  next.evidence.timing = mergeTiming(next.evidence.timing, delta.timing, policy);
  if (next.entityType === "word") next.evidence.launchTiming = mergeTiming(next.evidence.launchTiming ?? createEmptyPracticeTimingEvidence(), delta.launchTiming, policy);

  addCounts(next.evidence.errors, delta.errors, ["primaryEpisodeCount", "correctedEpisodeCount", "uncorrectedEpisodeCount", "correctCharactersRemovedCount"]);
  addCounts(next.evidence.errors.structuralCounts, delta.errors?.structuralCounts, ["substitution", "insertion", "omission", "transposition", "compound", "unknown"]);
  next.evidence.errors.correctionInitiation = mergePracticeWelfordAggregates(next.evidence.errors.correctionInitiation, delta.errors.correctionInitiation, { ringLimit: policy.maxRecentSamples });
  next.evidence.errors.errorToRepair = mergePracticeWelfordAggregates(next.evidence.errors.errorToRepair, delta.errors.errorToRepair, { ringLimit: policy.maxRecentSamples });

  const observation = next.evidence.observation;
  observation.sessionCount += 1;
  observation.completedSessionCount += Number(delta.observation.completedSessionCount || 0);
  observation.abandonedSessionCount += Number(delta.observation.abandonedSessionCount || 0);
  observation.targetedSessionCount += Number(delta.observation.targetedSessionCount || 0);
  observation.breadthEvidencePoints += Number(delta.observation.breadthEvidencePoints || 0);
  if (observation.firstObservedAt == null) observation.firstObservedAt = delta.observedAt;
  observation.lastObservedAt = !observation.lastObservedAt || Date.parse(delta.observedAt) >= Date.parse(observation.lastObservedAt) ? delta.observedAt : observation.lastObservedAt;
  if (observation.lastObservedDayKey == null) {
    observation.dayCount = 1;
    observation.lastObservedDayKey = delta.localDayKey;
  } else if (delta.localDayKey > observation.lastObservedDayKey) {
    observation.dayCount += 1;
    observation.lastObservedDayKey = delta.localDayKey;
  }

  const role = delta.evidenceRole;
  const lane = roleLane(next.evidence.roles[role]);
  lane.opportunityCount += delta.opportunities.count;
  lane.correctCount += delta.opportunities.correctCount;
  lane.errorCount += delta.opportunities.errorCount;
  const timingEligible = (delta.timing?.eligibleCount ?? 0) + (delta.launchTiming?.eligibleCount ?? 0);
  const fluentCount = (delta.timing?.fluentCount ?? 0) + (delta.launchTiming?.fluentCount ?? 0);
  const disfluentCount = (delta.timing?.disfluentCount ?? 0) + (delta.launchTiming?.disfluentCount ?? 0);
  lane.timingEligibleCount += timingEligible;
  lane.fluentCount += fluentCount;
  lane.disfluentCount += disfluentCount;
  combineRoleResidual(lane, [delta.timing?.fluentResidual, delta.launchTiming?.fluentResidual], policy);
  lane.primaryErrorEpisodeCount += delta.errors.primaryEpisodeCount;
  lane.sessionCount += 1;
  lane.lastObservedAt = delta.observedAt;
  next.evidence.roles[role] = lane;

  if (delta.coverage.accuracyScope === "partial-session") next.evidence.coverage.accuracyScope = "partial-session";
  if (timingEligible > 0 && delta.coverage.timingScope === "complete-session") next.evidence.coverage.completeTimingSessionCount += 1;
  if (timingEligible > 0 && delta.coverage.timingScope === "retained-window") next.evidence.coverage.retainedWindowTimingSessionCount += 1;
  if (delta.coverage.evidenceTruncated) next.evidence.coverage.evidenceTruncatedSessionCount += 1;
  next.evidence.coverage.omittedObservationCount += Number(delta.coverage.omittedObservationCount || 0);

  next.updatedAt = delta.observedAt;
  next.lastObservedAt = delta.observedAt;
  if (delta.directTarget && delta.opportunities.count > 0) next.lastPractisedAt = delta.observedAt;
  const confidence = computePracticeEvidenceConfidence(next, "general", policy);
  next.confidenceScore = confidence.score;
  next.confidenceLevel = confidence.level;
  return freezeDeep(next);
}
