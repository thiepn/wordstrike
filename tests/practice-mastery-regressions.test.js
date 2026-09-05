import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import { createDefaultSkillStat } from "../js/practiceLab/practiceDefaults.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import { evaluatePracticeEntityMastery } from "../js/practiceLab/practiceEntityMastery.js";
import { PRACTICE_MASTERY_POLICY_V1 } from "../js/practiceLab/practiceMasteryPolicy.js";
import { createPracticeMasteryService } from "../js/practiceLab/practiceMasteryService.js";
import { buildPracticeMasterySnapshot } from "../js/practiceLab/practiceMasterySnapshot.js";

const profileId = createPracticeId("profile", { uuid: () => "pl15-regression-profile-123456" });
const contextId = createPracticeId("context", { uuid: () => "pl15-regression-context-123456" });
const nowIso = "2026-09-05T18:30:00.000Z";
const now = () => new Date(nowIso);

function aggregate(count, meanMs, recentSamples = []) {
  return {
    count,
    meanMs,
    m2: 0,
    minMs: count ? meanMs : null,
    maxMs: count ? meanMs : null,
    recentSamples: [...recentSamples],
  };
}

function roleLane({
  opportunities = 120,
  errors = 1,
  sessions = 4,
  residualMeanMs = 0,
  residualCount = opportunities,
  timingEligible = opportunities,
  disfluent = 2,
} = {}) {
  return {
    opportunityCount: opportunities,
    correctCount: opportunities - errors,
    errorCount: errors,
    timingEligibleCount: timingEligible,
    fluentCount: Math.max(0, timingEligible - disfluent),
    disfluentCount: disfluent,
    fluentResidualCount: residualCount,
    fluentResidualMeanMs: residualMeanMs,
    fluentResidualM2: 0,
    recentResidualSamples: [],
    primaryErrorEpisodeCount: errors,
    sessionCount: sessions,
    lastObservedAt: nowIso,
  };
}

function makeStat({
  entityType = "bigram",
  entityKey = "th",
  opportunities = 600,
  errors = 6,
  sessions = 12,
  days = 10,
  breadth = 60,
  roles = {
    training: roleLane(),
    diagnostic: roleLane(),
    transfer: roleLane(),
  },
} = {}) {
  const stat = createDefaultSkillStat({ profileId, contextId, entityType, entityKey, now });
  stat.updatedAt = nowIso;
  stat.lastObservedAt = nowIso;
  stat.evidence.opportunities = {
    count: opportunities,
    correctCount: opportunities - errors,
    errorCount: errors,
    directTargetedCount: Math.floor(opportunities / 2),
    incidentalCount: opportunities - Math.floor(opportunities / 2),
  };
  stat.evidence.observation = {
    sessionCount: sessions,
    completedSessionCount: sessions,
    abandonedSessionCount: 0,
    dayCount: days,
    targetedSessionCount: sessions,
    breadthEvidencePoints: breadth,
    firstObservedAt: "2026-08-20T18:30:00.000Z",
    lastObservedAt: nowIso,
    lastObservedDayKey: "2026-09-05",
  };
  const recent = [-2, 2, -2, 2, -2, 2, -2, 2, -2, 2, -2, 2];
  stat.evidence.timing = {
    eligibleCount: opportunities,
    fluentCount: opportunities - 6,
    disfluentCount: 6,
    fluentLatency: aggregate(opportunities - 6, 100),
    fluentResidual: aggregate(opportunities - 6, 0, recent),
    disfluentResidual: aggregate(6, 35),
    completeTraceSessionCount: sessions,
    retainedWindowSessionCount: 0,
  };
  stat.evidence.roles = structuredClone(roles);
  return stat;
}

function dimension(type, severityScore = 0, status = "not-elevated") {
  return {
    type,
    severityScore,
    status,
    evidenceConfidenceScore: status === "confirmed" ? 90 : 75,
    evidenceConfidenceLevel: status === "confirmed" ? "high" : "medium",
  };
}

function limiter({ slow = 0, inaccurate = 0, unstable = 0 } = {}) {
  return {
    dimensions: {
      slow: dimension("slow", slow, slow >= 50 ? "confirmed" : slow >= 35 ? "likely" : slow >= 20 ? "possible" : "not-elevated"),
      hesitant: dimension("hesitant"),
      inaccurate: dimension("inaccurate", inaccurate, inaccurate >= 50 ? "confirmed" : inaccurate >= 35 ? "likely" : inaccurate >= 20 ? "possible" : "not-elevated"),
      "recovery-heavy": dimension("recovery-heavy"),
      "launch-limited": dimension("launch-limited", 0, "insufficient-evidence"),
      unstable: dimension("unstable", unstable, unstable >= 50 ? "confirmed" : unstable >= 35 ? "likely" : unstable >= 20 ? "possible" : "not-elevated"),
    },
  };
}

const verifiedRetention = Object.freeze({
  status: "verified",
  score: 84,
  confidenceScore: 72,
  confidenceLevel: "medium",
  verificationCount: 2,
  lastVerifiedAt: "2026-09-20T18:30:00.000Z",
  eligibleForRetained: true,
});

test("PL15 exact 25/20/15/15/15/10 mastery weighting and 75-point acquisition normalization are preserved", () => {
  const result = evaluatePracticeEntityMastery({
    stat: makeStat(),
    limiterEvaluation: limiter({ slow: 15, inaccurate: 10, unstable: 20 }),
    retentionEvidence: verifiedRetention,
  });
  const d = result.dimensions;
  const expectedMastery = (
    25 * d.accuracy.score
    + 20 * d.speed.score
    + 15 * d.stability.score
    + 15 * d.contextRobustness.score
    + 15 * d.transfer.score
    + 10 * d.retention.score
  ) / 100;
  const expectedAcquisition = (
    25 * d.accuracy.score
    + 20 * d.speed.score
    + 15 * d.stability.score
    + 15 * d.contextRobustness.score
  ) / 75;
  assert.ok(Math.abs(result.masteryScore - expectedMastery) < 1e-10);
  assert.ok(Math.abs(result.acquisitionScore - expectedAcquisition) < 1e-10);
  assert.equal(result.availableWeight, 100);
  assert.deepEqual(PRACTICE_MASTERY_POLICY_V1.masteryWeights, {
    accuracy: 25,
    speed: 20,
    stability: 15,
    contextRobustness: 15,
    transfer: 15,
    retention: 10,
  });
});

test("PL15 evaluator does not mutate skill, limiter, retention or hierarchy inputs and is deterministic", () => {
  const stat = makeStat();
  const limiterEvaluation = limiter();
  const retentionEvidence = structuredClone(verifiedRetention);
  const hierarchy = {
    status: "partially-explained",
    explanationRatio: 0.6,
    explainedBy: [{ statId: "skill:lower-a" }, { statId: "skill:lower-b" }],
  };
  const before = {
    stat: structuredClone(stat),
    limiter: structuredClone(limiterEvaluation),
    retention: structuredClone(retentionEvidence),
    hierarchy: structuredClone(hierarchy),
  };
  const first = evaluatePracticeEntityMastery({ stat, limiterEvaluation, retentionEvidence, hierarchy });
  const second = evaluatePracticeEntityMastery({ stat, limiterEvaluation, retentionEvidence, hierarchy });
  assert.deepEqual(first, second);
  assert.deepEqual(stat, before.stat);
  assert.deepEqual(limiterEvaluation, before.limiter);
  assert.deepEqual(retentionEvidence, before.retention);
  assert.deepEqual(hierarchy, before.hierarchy);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.dimensions), true);
  assert.equal(Object.isFrozen(first.hierarchyReadiness), true);
});

test("PL15 custom-derived n-grams can be evaluated without custom role establishing transfer/robustness or leaking source text", () => {
  const stat = makeStat({
    entityKey: "qx",
    roles: { custom: roleLane({ opportunities: 200, sessions: 5 }) },
  });
  stat.privateSourceText = "PRIVATE_CUSTOM_SENTENCE_SHOULD_NOT_ESCAPE";
  const result = evaluatePracticeEntityMastery({ stat, limiterEvaluation: limiter() });
  assert.equal(result.entityType, "bigram");
  assert.equal(result.entityKey, "qx");
  assert.equal(result.transfer.score, null);
  assert.ok(["learning", "acquired"].includes(result.stage));
  assert.equal(result.evidenceSummary.eligibleRoleCount, 0);
  assert.equal(JSON.stringify(result).includes("PRIVATE_CUSTOM_SENTENCE_SHOULD_NOT_ESCAPE"), false);
});

test("PL15 cache invalidates independently for PL12 identity and retention-provider evidence identity", async () => {
  const stat = makeStat({ roles: { training: roleLane(), diagnostic: roleLane() } });
  const repository = {
    async getPracticeContext(requestContextId) {
      return { contextId: requestContextId, profileId, dataLocale: "en" };
    },
    async listSkillStats() {
      return [stat];
    },
  };
  let limiterFingerprint = "pl12-a";
  let retentionFingerprint = "retention-a";
  const limiterService = {
    async getFingerprint() { return limiterFingerprint; },
  };
  const retentionProvider = {
    version: 1,
    async getFingerprint() { return retentionFingerprint; },
    async getPracticeRetentionEvidence() {
      return {
        status: "unverified",
        score: null,
        confidenceScore: 0,
        confidenceLevel: "none",
        verificationCount: 0,
        lastVerifiedAt: null,
        eligibleForRetained: false,
      };
    },
  };
  const service = createPracticeMasteryService({ repository, limiterService, retentionProvider, now });
  const a = await service.buildContextMasterySnapshot({ profileId, contextId });
  const cached = await service.buildContextMasterySnapshot({ profileId, contextId });
  assert.equal(cached, a);

  limiterFingerprint = "pl12-b";
  const b = await service.buildContextMasterySnapshot({ profileId, contextId });
  assert.notEqual(b, a);

  retentionFingerprint = "retention-b";
  const c = await service.buildContextMasterySnapshot({ profileId, contextId });
  assert.notEqual(c, b);
});

test("PL15 context snapshot is deterministic for identical evidence/time and exposes no cross-entity global mastery score", () => {
  const stats = [makeStat({ entityKey: "th" }), makeStat({ entityKey: "he" })];
  const context = { contextId, profileId, dataLocale: "en" };
  const first = buildPracticeMasterySnapshot({ skillStats: stats, context, generatedAt: nowIso });
  const second = buildPracticeMasterySnapshot({ skillStats: stats, context, generatedAt: nowIso });
  assert.deepEqual(first, second);
  assert.equal("masteryScore" in first, false);
  assert.equal(first.entities.length, 2);
});

test("PL15 full-context evaluation stays bounded and approximately linear at 2,500 skill stats", () => {
  const stats = Array.from({ length: 2500 }, (_, index) => makeStat({
    entityKey: `x${index}`,
    opportunities: 120,
    errors: 1,
    sessions: 4,
    days: 4,
    breadth: 16,
    roles: { training: roleLane({ opportunities: 120, sessions: 4 }) },
  }));
  const context = { contextId, profileId, dataLocale: "en" };
  const started = performance.now();
  const snapshot = buildPracticeMasterySnapshot({
    skillStats: stats,
    context,
    generatedAt: nowIso,
    maxEntities: 512,
  });
  const elapsedMs = performance.now() - started;
  assert.equal(snapshot.diagnostics.evaluatedEntityCount, 2500);
  assert.equal(snapshot.entities.length, 512);
  assert.ok(elapsedMs < 8000, `PL15 2,500-stat snapshot took ${elapsedMs.toFixed(1)} ms`);
});
