import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultSkillStat } from "../js/practiceLab/practiceDefaults.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import {
  computePracticeAbsoluteAccuracyQuality,
  computePracticeAutomaticity,
} from "../js/practiceLab/practiceAutomaticity.js";
import {
  computePracticeBreadthScore,
  computePracticeContextRobustness,
  computePracticeRoleConsistency,
} from "../js/practiceLab/practiceContextRobustness.js";
import { evaluatePracticeEntityMastery } from "../js/practiceLab/practiceEntityMastery.js";
import { computePracticeRoleQuality } from "../js/practiceLab/practiceRoleQuality.js";
import { computePracticeTransferConfidence } from "../js/practiceLab/practiceTransferMastery.js";

const profileId = createPracticeId("profile", { uuid: () => "pl15-profile-mastery-123456" });
const contextId = createPracticeId("context", { uuid: () => "pl15-context-mastery-123456" });
const now = () => new Date("2026-09-05T17:00:00.000Z");

function aggregate(count, meanMs, recentSamples = []) {
  return { count, meanMs, m2: 0, minMs: count ? meanMs : null, maxMs: count ? meanMs : null, recentSamples: [...recentSamples] };
}

function roleLane({ opportunities = 100, errors = 1, sessions = 3, residualMeanMs = 0, residualCount = 100, timingEligible = 100, disfluent = 2 } = {}) {
  return {
    opportunityCount: opportunities,
    correctCount: opportunities - errors,
    errorCount: errors,
    timingEligibleCount: timingEligible,
    fluentCount: timingEligible - disfluent,
    disfluentCount: disfluent,
    fluentResidualCount: residualCount,
    fluentResidualMeanMs: residualMeanMs,
    fluentResidualM2: 0,
    recentResidualSamples: [],
    primaryErrorEpisodeCount: errors,
    sessionCount: sessions,
    lastObservedAt: now().toISOString(),
  };
}

function makeStat({
  entityType = "bigram",
  entityKey = "th",
  opportunities = 500,
  errors = 5,
  sessions = 10,
  days = 10,
  breadth = 60,
  roles = {
    training: roleLane(),
    diagnostic: roleLane(),
  },
} = {}) {
  const stat = createDefaultSkillStat({ profileId, contextId, entityType, entityKey, now });
  stat.updatedAt = now().toISOString();
  stat.lastObservedAt = now().toISOString();
  stat.evidence.opportunities = {
    count: opportunities,
    correctCount: opportunities - errors,
    errorCount: errors,
    directTargetedCount: opportunities / 2,
    incidentalCount: opportunities / 2,
  };
  stat.evidence.observation = {
    sessionCount: sessions,
    completedSessionCount: sessions,
    abandonedSessionCount: 0,
    dayCount: days,
    targetedSessionCount: sessions,
    breadthEvidencePoints: breadth,
    firstObservedAt: "2026-08-20T17:00:00.000Z",
    lastObservedAt: now().toISOString(),
    lastObservedDayKey: "2026-09-05",
  };
  const residuals = [-2, 2, -2, 2, -2, 2, -2, 2, -2, 2, -2, 2];
  stat.evidence.timing = {
    eligibleCount: opportunities,
    fluentCount: opportunities - 5,
    disfluentCount: 5,
    fluentLatency: aggregate(opportunities - 5, 100),
    fluentResidual: aggregate(opportunities - 5, 0, residuals),
    disfluentResidual: aggregate(5, 40),
    completeTraceSessionCount: sessions,
    retainedWindowSessionCount: 0,
  };
  stat.evidence.roles = structuredClone(roles);
  return stat;
}

function limiter({
  slow = 0,
  slowStatus = "not-elevated",
  inaccurate = 0,
  inaccurateStatus = "not-elevated",
  unstable = 0,
  unstableStatus = "not-elevated",
  hesitant = 0,
  hesitantStatus = "not-elevated",
  recovery = 0,
  recoveryStatus = "not-elevated",
  launch = 0,
  launchStatus = "insufficient-evidence",
} = {}) {
  const dim = (type, severityScore, status) => ({
    type,
    severityScore,
    status,
    evidenceConfidenceScore: status === "confirmed" ? 90 : 70,
    evidenceConfidenceLevel: status === "confirmed" ? "high" : "medium",
  });
  return {
    dimensions: {
      slow: dim("slow", slow, slowStatus),
      hesitant: dim("hesitant", hesitant, hesitantStatus),
      inaccurate: dim("inaccurate", inaccurate, inaccurateStatus),
      "recovery-heavy": dim("recovery-heavy", recovery, recoveryStatus),
      unstable: dim("unstable", unstable, unstableStatus),
      "launch-limited": dim("launch-limited", launch, launchStatus),
    },
  };
}

test("PL15 absolute first-pass accuracy uses exact entity-type engineering ranges", () => {
  const cases = [
    ["key", 0.015, 0.08],
    ["bigram", 0.02, 0.10],
    ["trigram", 0.03, 0.12],
    ["word", 0.05, 0.20],
  ];
  for (const [entityType, perfect, zero] of cases) {
    const atPerfect = makeStat({ entityType, entityKey: `${entityType}-perfect`, opportunities: 1000, errors: perfect * 1000 });
    const atZero = makeStat({ entityType, entityKey: `${entityType}-zero`, opportunities: 1000, errors: zero * 1000 });
    assert.equal(computePracticeAbsoluteAccuracyQuality(atPerfect).score, 100);
    assert.equal(computePracticeAbsoluteAccuracyQuality(atZero).score, 0);
  }
});

test("PL15 role quality uses 45/40/15 weights, renormalizes only with >=60% coverage, and respects evidence minimums", () => {
  const stat = makeStat({ roles: { training: roleLane({ residualMeanMs: 0, disfluent: 2 }) } });
  const full = computePracticeRoleQuality(stat, "training");
  assert.equal(full.score, 100);
  assert.equal(full.availableWeight, 1);

  stat.evidence.roles.training.fluentResidualCount = 0;
  const noSpeed = computePracticeRoleQuality(stat, "training");
  assert.equal(noSpeed.availableWeight, 0.60);
  assert.equal(noSpeed.score, 100);

  stat.evidence.roles.training.timingEligibleCount = 0;
  const accuracyOnly = computePracticeRoleQuality(stat, "training");
  assert.equal(accuracyOnly.score, null);

  const thin = makeStat({ roles: { training: roleLane({ opportunities: 2 }) } });
  assert.equal(computePracticeRoleQuality(thin, "training").status, "insufficient");
});

test("PL15 breadth, role consistency and single-role robustness follow the v1 formulas", () => {
  assert.ok(Math.abs(computePracticeBreadthScore(12) - 100 * (1 - Math.exp(-1))) < 1e-12);
  assert.equal(computePracticeRoleConsistency([{ score: 95 }, { score: 55 }]), 35);

  const stat = makeStat({ breadth: 1000, roles: { training: roleLane() } });
  const robustness = computePracticeContextRobustness(stat);
  assert.equal(robustness.eligibleRoleCount, 1);
  assert.ok(robustness.score <= 70);
});

test("PL15 transfer confidence is quantity/session confidence, while quality remains role performance", () => {
  const stat = makeStat({
    roles: {
      training: roleLane({ opportunities: 100, sessions: 3 }),
      transfer: roleLane({ opportunities: 20, sessions: 2 }),
    },
  });
  const confidence = computePracticeTransferConfidence(stat);
  const expected = 100 * (0.65 * (1 - Math.exp(-1)) + 0.35 * (1 - Math.exp(-1)));
  assert.ok(Math.abs(confidence.score - expected) < 1e-12);
  assert.equal(confidence.level, "medium");
});

test("PL15 automaticity does not renormalize a missing component and is capped by conjunctive evidence confidence", () => {
  const stat = makeStat();
  const result = computePracticeAutomaticity({
    stat,
    speedQuality: 100,
    accuracyQuality: 100,
    stabilityQuality: null,
    contextRobustness: 100,
  });
  assert.equal(result.coreScore, 80);
  assert.ok(result.score <= result.confidenceScore);
  assert.ok(result.score <= 80);

  const thin = makeStat({ opportunities: 5, errors: 0, sessions: 1, days: 1, breadth: 1, roles: { training: roleLane({ opportunities: 5, sessions: 1 }) } });
  thin.evidence.timing.eligibleCount = 5;
  thin.evidence.timing.fluentCount = 5;
  thin.evidence.timing.fluentResidual = aggregate(5, 0, [0, 0, 0, 0, 0]);
  const low = computePracticeAutomaticity({
    stat: thin,
    speedQuality: 100,
    accuracyQuality: 100,
    stabilityQuality: 100,
    contextRobustness: 100,
  });
  assert.ok(low.score < 70);
});

test("PL15 high-exposure poor accuracy or speed cannot become automatic or Acquired", () => {
  const stat = makeStat({ opportunities: 5000, errors: 1000, sessions: 30, days: 30, breadth: 100 });
  const inaccurate = evaluatePracticeEntityMastery({ stat, limiterEvaluation: limiter({ inaccurate: 75, inaccurateStatus: "confirmed" }) });
  assert.ok(inaccurate.automaticity.score <= 50);
  assert.equal(inaccurate.stage, "learning");

  const slow = evaluatePracticeEntityMastery({ stat: makeStat(), limiterEvaluation: limiter({ slow: 70, slowStatus: "confirmed" }) });
  assert.ok(slow.automaticity.score <= 50);
  assert.equal(slow.stage, "learning");
});

test("PL15 stage gates distinguish Acquired, Transferred, Robust and future Retained", () => {
  const acquiredStat = makeStat({ roles: { training: roleLane(), diagnostic: roleLane() } });
  const acquired = evaluatePracticeEntityMastery({ stat: acquiredStat, limiterEvaluation: limiter() });
  assert.equal(acquired.stage, "acquired");
  assert.equal(acquired.availableWeight, 75);

  const transferRoles = {
    training: roleLane({ opportunities: 100, sessions: 3 }),
    transfer: roleLane({ opportunities: 100, sessions: 3 }),
    diagnostic: roleLane({ opportunities: 100, sessions: 3 }),
  };
  const transferredStat = makeStat({ roles: transferRoles });
  const transferred = evaluatePracticeEntityMastery({
    stat: transferredStat,
    limiterEvaluation: limiter({ unstable: 35, unstableStatus: "likely" }),
  });
  assert.equal(transferred.stage, "transferred");

  const robustStat = makeStat({ roles: transferRoles });
  const robust = evaluatePracticeEntityMastery({ stat: robustStat, limiterEvaluation: limiter() });
  assert.equal(robust.stage, "robust");
  assert.equal(robust.anchorEligibility.eligible, true);

  const retained = evaluatePracticeEntityMastery({
    stat: robustStat,
    limiterEvaluation: limiter(),
    retentionEvidence: {
      status: "verified",
      score: 85,
      confidenceScore: 70,
      confidenceLevel: "medium",
      verificationCount: 1,
      lastVerifiedAt: "2026-09-20T17:00:00.000Z",
      eligibleForRetained: true,
    },
  });
  assert.equal(retained.stage, "retained");

  const sameSessionMock = evaluatePracticeEntityMastery({
    stat: robustStat,
    limiterEvaluation: limiter(),
    retentionEvidence: {
      status: "verified",
      score: 95,
      confidenceScore: 90,
      confidenceLevel: "high",
      verificationCount: 1,
      eligibleForRetained: false,
    },
  });
  assert.equal(sameSessionMock.stage, "robust");
});

test("PL15 transfer gap guard blocks transfer and natural skill needs no training lane", () => {
  const badGap = makeStat({
    roles: {
      training: roleLane({ errors: 0, residualMeanMs: 0, disfluent: 0 }),
      transfer: roleLane({ opportunities: 100, sessions: 3, errors: 8, residualMeanMs: 20, disfluent: 10 }),
      diagnostic: roleLane(),
    },
  });
  const gapResult = evaluatePracticeEntityMastery({ stat: badGap, limiterEvaluation: limiter() });
  assert.ok(gapResult.transfer.gap > 20);
  assert.equal(gapResult.stage, "acquired");

  const natural = makeStat({
    roles: {
      transfer: roleLane({ opportunities: 100, sessions: 3 }),
      diagnostic: roleLane({ opportunities: 100, sessions: 3 }),
    },
  });
  const naturalResult = evaluatePracticeEntityMastery({
    stat: natural,
    limiterEvaluation: limiter({ unstable: 25, unstableStatus: "possible" }),
  });
  assert.ok(["transferred", "robust"].includes(naturalResult.stage));
  assert.equal(naturalResult.transfer.gap, null);
});

test("PL15 likely and confirmed critical limiter guards cap stages independently of impact", () => {
  const roles = {
    training: roleLane(),
    transfer: roleLane(),
    diagnostic: roleLane(),
  };
  const likely = evaluatePracticeEntityMastery({
    stat: makeStat({ roles }),
    limiterEvaluation: limiter({ hesitant: 60, hesitantStatus: "likely" }),
  });
  assert.equal(likely.stage, "acquired");

  const confirmed = evaluatePracticeEntityMastery({
    stat: makeStat({ roles }),
    limiterEvaluation: limiter({ hesitant: 60, hesitantStatus: "confirmed" }),
  });
  assert.equal(confirmed.stage, "learning");
});

test("PL15 mastery is pure derived state: later durable evidence can demote/recover, while PL13/PL14 labels are ignored", () => {
  const roles = { training: roleLane(), transfer: roleLane(), diagnostic: roleLane() };
  const stat = makeStat({ roles });
  const baseline = evaluatePracticeEntityMastery({ stat, limiterEvaluation: limiter() });
  assert.equal(baseline.stage, "robust");

  const decorated = structuredClone(stat);
  decorated.abilityState = { estimateWpm: 150 };
  decorated.performanceState = { currentStates: ["readiness-reduced"] };
  const independent = evaluatePracticeEntityMastery({ stat: decorated, limiterEvaluation: limiter() });
  assert.deepEqual(independent, baseline);

  const degraded = structuredClone(stat);
  degraded.evidence.opportunities.errorCount = 150;
  degraded.evidence.opportunities.correctCount = degraded.evidence.opportunities.count - 150;
  const demoted = evaluatePracticeEntityMastery({
    stat: degraded,
    limiterEvaluation: limiter({ inaccurate: 80, inaccurateStatus: "confirmed" }),
  });
  assert.equal(demoted.stage, "learning");

  const recovered = evaluatePracticeEntityMastery({ stat, limiterEvaluation: limiter() });
  assert.equal(recovered.stage, "robust");
});

test("PL15 hierarchy metadata can require lower-level support without itself rewriting the stage", () => {
  const result = evaluatePracticeEntityMastery({
    stat: makeStat(),
    limiterEvaluation: limiter(),
    hierarchy: {
      status: "explained",
      explanationRatio: 0.8,
      explainedBy: [{ statId: "skill:lower-1" }, { statId: "skill:lower-2" }, { statId: "skill:lower-3" }, { statId: "skill:lower-4" }],
    },
  });
  assert.equal(result.stage, "acquired");
  assert.equal(result.hierarchyReadiness.lowerLevelSupportRequired, true);
  assert.equal(result.hierarchyReadiness.blockingEntityIds.length, 3);
  assert.equal(result.hierarchyReadiness.promotionEligible, true);
});
