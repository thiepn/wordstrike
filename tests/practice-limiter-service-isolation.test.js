import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import { PRACTICE_DATABASE_VERSION, PRACTICE_RECORD_VERSIONS, PRACTICE_LIMITS } from "../js/practiceLab/practiceConstants.js";
import { PRACTICE_FOUNDATION_ANALYSIS_VERSION } from "../js/practiceLab/practiceFoundationAnalysis.js";
import { PRACTICE_SKILL_EVIDENCE_POLICY_V1 } from "../js/practiceLab/practiceSkillEvidencePolicy.js";
import {
  PRACTICE_LIMITER_MODEL_VERSION,
  PRACTICE_LIMITER_POLICY_VERSION,
  PRACTICE_IMPACT_MODEL_VERSION,
  PRACTICE_HIERARCHY_MODEL_VERSION,
  PRACTICE_PREVALENCE_MODEL_VERSION,
} from "../js/practiceLab/practiceLimiterPolicy.js";
import { buildPracticeLimiterSnapshot } from "../js/practiceLab/practiceLimiterSnapshot.js";
import { createPracticeLimiterModel } from "../js/practiceLab/practiceLimiterService.js";
import { buildPracticeRetentionPlan } from "../js/practiceLab/practiceRetention.js";

const profileId = "practice-profile_pl12-service-123456789";
const contextA = "practice-context_pl12-service-a-123456789";
const contextB = "practice-context_pl12-service-b-123456789";
const stamp = "2026-09-05T10:30:00.000Z";

function aggregate(count, meanMs, recentSamples = []) {
  if (!count) return { count: 0, meanMs: 0, m2: 0, minMs: null, maxMs: null, recentSamples: [] };
  return { count, meanMs, m2: 0, minMs: meanMs, maxMs: meanMs, recentSamples: [...recentSamples] };
}

function canonicalStat({ contextId = contextA, entityType = "key", entityKey = "a", index = 0, residualMeanMs = 10, opportunities = 100, errors = 5, updatedAt = stamp } = {}) {
  return {
    statId: `practice-stat_pl12-${contextId.slice(-6)}-${entityType}-${index}-${entityKey}`,
    profileId,
    contextId,
    entityType,
    entityKey,
    recordVersion: 3,
    createdAt: "2026-08-20T10:30:00.000Z",
    updatedAt,
    evidenceVersion: 1,
    confidenceScore: 0,
    confidenceLevel: "none",
    lastObservedAt: updatedAt,
    lastPractisedAt: null,
    recentTrend: "insufficient-data",
    weaknessScore: 999,
    priority: 999,
    masteryState: "unmeasured",
    successfulReviewCount: 0,
    failedReviewCount: 0,
    legacyEvidenceV2: null,
    evidence: {
      opportunities: { count: opportunities, correctCount: opportunities - errors, errorCount: errors, directTargetedCount: 0, incidentalCount: opportunities },
      observation: {
        sessionCount: 8, completedSessionCount: 8, abandonedSessionCount: 0, dayCount: 8, targetedSessionCount: 0, breadthEvidencePoints: 24,
        firstObservedAt: "2026-08-20T10:30:00.000Z", lastObservedAt: updatedAt, lastObservedDayKey: "2026-09-05",
      },
      timing: {
        eligibleCount: 100, fluentCount: 95, disfluentCount: 5,
        fluentLatency: aggregate(95, 100 + residualMeanMs),
        fluentResidual: aggregate(95, residualMeanMs, [-5, 5, -5, 5, -5, 5, -5, 5]),
        disfluentResidual: aggregate(5, 50), completeTraceSessionCount: 8, retainedWindowSessionCount: 0,
      },
      launchTiming: entityType === "word" ? {
        eligibleCount: 100, fluentCount: 100, disfluentCount: 0,
        fluentLatency: aggregate(100, 100), fluentResidual: aggregate(100, 0), disfluentResidual: aggregate(0, 0),
        completeTraceSessionCount: 8, retainedWindowSessionCount: 0,
      } : null,
      errors: {
        primaryEpisodeCount: errors, correctedEpisodeCount: errors, uncorrectedEpisodeCount: 0,
        structuralCounts: { substitution: errors, insertion: 0, omission: 0, transposition: 0, compound: 0, unknown: 0 },
        correctionInitiation: errors ? aggregate(errors, 150) : aggregate(0, 0),
        errorToRepair: errors ? aggregate(errors, 500) : aggregate(0, 0),
        correctCharactersRemovedCount: 0,
      },
      roles: {},
      coverage: { accuracyScope: "complete-session", completeTimingSessionCount: 8, retainedWindowTimingSessionCount: 0, evidenceTruncatedSessionCount: 0, omittedObservationCount: 0 },
    },
  };
}

function peerSet(contextId = contextA, residualMeanMs = 0) {
  return Array.from({ length: 9 }, (_, index) => canonicalStat({ contextId, entityType: "key", entityKey: String.fromCharCode(97 + index), index, residualMeanMs }));
}

test("PL12 model contracts remain unchanged inside the current PL17 storage/session/foundation envelope", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 5);
  assert.equal(PRACTICE_RECORD_VERSIONS.skillStat, 3);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 10);
  assert.equal(PRACTICE_RECORD_VERSIONS.reviewItem, 3);
  assert.equal(PRACTICE_RECORD_VERSIONS.checkpoint, 3);
  assert.equal(PRACTICE_RECORD_VERSIONS.learningState, 1);
  assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 8);
  assert.equal(PRACTICE_LIMITER_MODEL_VERSION, 1);
  assert.equal(PRACTICE_LIMITER_POLICY_VERSION, 1);
  assert.equal(PRACTICE_IMPACT_MODEL_VERSION, 1);
  assert.equal(PRACTICE_HIERARCHY_MODEL_VERSION, 1);
  assert.equal(PRACTICE_PREVALENCE_MODEL_VERSION, 1);
  assert.equal(PRACTICE_SKILL_EVIDENCE_POLICY_V1.allowCustomWordEvidence, false);
});

test("PL12 service reads only context + skillStats, performs no repository writes, reuses unchanged snapshots, and invalidates on evidence/reference changes", async () => {
  let stats = peerSet(contextA, 0);
  stats[0] = canonicalStat({ contextId: contextA, entityType: "key", entityKey: "a", index: 0, residualMeanMs: 35 });
  const calls = { context: 0, stats: 0, prevalence: 0, writes: 0, now: 0 };
  let prevalenceRevision = "p1";
  const repository = {
    async getPracticeContext(id) {
      calls.context += 1;
      assert.equal(id, contextA);
      return { profileId, contextId: id, dataLocale: "en-US" };
    },
    async listSkillStats(requestProfile, requestContext) {
      calls.stats += 1;
      assert.equal(requestProfile, profileId);
      assert.equal(requestContext, contextA);
      return stats;
    },
    async saveSkillStat() { calls.writes += 1; throw new Error("unexpected write"); },
    async saveSessionSummary() { calls.writes += 1; throw new Error("unexpected write"); },
    async saveCustomText() { calls.writes += 1; throw new Error("unexpected write"); },
  };
  const prevalenceProvider = {
    getFingerprint() { return prevalenceRevision; },
    async getEntityPrevalence({ language }) {
      calls.prevalence += 1;
      assert.equal(language, "en");
      return { status: "reference", opportunitiesPer1000Graphemes: 50, quality: 1, sourceId: "fixture", referenceVersion: 1 };
    },
  };
  const model = createPracticeLimiterModel({
    repository,
    prevalenceProvider,
    now: () => {
      calls.now += 1;
      return new Date(Date.parse(stamp) + calls.now * 1000);
    },
  });
  assert.equal(calls.context + calls.stats + calls.prevalence + calls.writes + calls.now, 0, "construction must be side-effect free");

  const first = await model.buildContextLimiterSnapshot({ profileId, contextId: contextA });
  const prevalenceAfterFirst = calls.prevalence;
  const second = await model.buildContextLimiterSnapshot({ profileId, contextId: contextA });
  assert.strictEqual(second, first);
  assert.equal(calls.prevalence, prevalenceAfterFirst);
  assert.equal(calls.now, 1);
  assert.equal(calls.writes, 0);

  stats = stats.map((value, index) => index === 0 ? canonicalStat({ contextId: contextA, entityType: "key", entityKey: "a", index: 0, residualMeanMs: 45, opportunities: 101, updatedAt: "2026-09-05T10:31:00.000Z" }) : value);
  const evidenceChanged = await model.buildContextLimiterSnapshot({ profileId, contextId: contextA });
  assert.notStrictEqual(evidenceChanged, first);
  assert.equal(calls.now, 2);

  prevalenceRevision = "p2";
  const referenceChanged = await model.buildContextLimiterSnapshot({ profileId, contextId: contextA });
  assert.notStrictEqual(referenceChanged, evidenceChanged);
  assert.equal(calls.now, 3);
  assert.equal(calls.writes, 0);
});

test("PL12 context snapshots are isolated even for the same entity key", async () => {
  const statsByContext = new Map([
    [contextA, peerSet(contextA, 0).map((value, index) => index === 0 ? canonicalStat({ contextId: contextA, entityKey: "a", index, residualMeanMs: 35 }) : value)],
    [contextB, peerSet(contextB, 0).map((value, index) => index === 0 ? canonicalStat({ contextId: contextB, entityKey: "a", index, residualMeanMs: -10 }) : value)],
  ]);
  const repository = {
    async getPracticeContext(id) { return { profileId, contextId: id, dataLocale: "en-US" }; },
    async listSkillStats(_profileId, id) { return statsByContext.get(id); },
  };
  const prevalenceProvider = {
    getFingerprint() { return "context-isolation-ref"; },
    async getEntityPrevalence() { return { status: "reference", opportunitiesPer1000Graphemes: 50, quality: 1, sourceId: "fixture", referenceVersion: 1 }; },
  };
  const model = createPracticeLimiterModel({ repository, prevalenceProvider, now: () => new Date(stamp) });
  const a = await model.buildContextLimiterSnapshot({ profileId, contextId: contextA });
  const b = await model.buildContextLimiterSnapshot({ profileId, contextId: contextB });
  assert.equal(a.contextId, contextA);
  assert.equal(b.contextId, contextB);
  assert.notDeepEqual(a.candidates, b.candidates);
});

test("PL12 retention ignores legacy priority/sampleCount and prunes by canonical PL11 evidence/confidence/recency", () => {
  const records = Array.from({ length: PRACTICE_LIMITS.bigramStats + 1 }, (_, index) => ({
    statId: `practice-stat_retention-${index}`,
    profileId,
    contextId: contextA,
    entityType: "bigram",
    entityKey: `bg${index}`,
    recordVersion: 3,
    confidenceScore: 50,
    priority: index === 0 ? 999999 : 0,
    updatedAt: index === 0 ? "2026-01-01T00:00:00.000Z" : "2026-09-01T00:00:00.000Z",
    lastObservedAt: index === 0 ? "2026-01-01T00:00:00.000Z" : "2026-09-01T00:00:00.000Z",
    evidence: {
      opportunities: { count: index === 0 ? 1 : 100 },
      timing: { eligibleCount: index === 0 ? 0 : 100 },
      launchTiming: null,
      errors: { primaryEpisodeCount: 0 },
      observation: { targetedSessionCount: 0 },
    },
  }));
  assert.equal(records.some((record) => Object.hasOwn(record, "sampleCount")), false);
  const plan = buildPracticeRetentionPlan({ skillStats: records, now: Date.parse(stamp) });
  assert.deepEqual(plan.skillStats, ["practice-stat_retention-0"]);
});

test("PL12 module imports have zero storage/network/listener/timer side effects", async () => {
  const calls = { storage: 0, indexedDb: 0, fetch: 0, listeners: 0, timers: 0 };
  const original = {
    localStorage: globalThis.localStorage,
    indexedDB: globalThis.indexedDB,
    fetch: globalThis.fetch,
    document: globalThis.document,
    window: globalThis.window,
    setTimeout: globalThis.setTimeout,
    setInterval: globalThis.setInterval,
  };
  Object.defineProperties(globalThis, {
    localStorage: { configurable: true, value: { getItem() { calls.storage += 1; }, setItem() { calls.storage += 1; }, removeItem() { calls.storage += 1; } } },
    indexedDB: { configurable: true, value: { open() { calls.indexedDb += 1; throw new Error("unexpected IndexedDB open"); } } },
    fetch: { configurable: true, value: async () => { calls.fetch += 1; throw new Error("unexpected fetch"); } },
    document: { configurable: true, value: { addEventListener() { calls.listeners += 1; } } },
    window: { configurable: true, value: { addEventListener() { calls.listeners += 1; } } },
    setTimeout: { configurable: true, value: (...args) => { calls.timers += 1; return original.setTimeout(...args); } },
    setInterval: { configurable: true, value: (...args) => { calls.timers += 1; return original.setInterval(...args); } },
  });
  try {
    for (const module of [
      "practiceLimiterPolicy.js",
      "practicePeerReference.js",
      "practiceLimiterDimensions.js",
      "practiceEntityPrevalence.js",
      "practiceImpactModel.js",
      "practiceEntityHierarchy.js",
      "practiceLimiterSnapshot.js",
      "practiceLimiterService.js",
    ]) await import(new URL(`../js/practiceLab/${module}?pl12=${encodeURIComponent(module)}`, import.meta.url));
    assert.deepEqual(calls, { storage: 0, indexedDb: 0, fetch: 0, listeners: 0, timers: 0 });
  } finally {
    for (const [key, value] of Object.entries(original)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
});

test("PL12 pure/runtime modules have no session-engine, raw-event, custom-text, ranked or Supabase dependency", async () => {
  const modules = [
    "practiceLimiterPolicy.js", "practicePeerReference.js", "practiceLimiterDimensions.js", "practiceEntityPrevalence.js",
    "practiceImpactModel.js", "practiceEntityHierarchy.js", "practiceLimiterSnapshot.js", "practiceLimiterService.js",
  ];
  const forbiddenImport = /practiceSessionEngine|practiceCustomText|supabase|leaderboard|ranked/iu;
  for (const module of modules) {
    const source = await readFile(new URL(`../js/practiceLab/${module}`, import.meta.url), "utf8");
    const specifiers = [
      ...[...source.matchAll(/from\s+["']([^"']+)["']/gu)].map((match) => match[1]),
      ...[...source.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/gu)].map((match) => match[1]),
    ];
    for (const specifier of specifiers) assert.equal(forbiddenImport.test(specifier), false, `${module} must not import ${specifier}`);
    assert.equal(/eventTrace/u.test(source), false, `${module} must not consume raw eventTrace`);
    assert.equal(/customTexts/u.test(source), false, `${module} must not consume custom text storage`);
  }
});

test("PL12 10k-stat snapshot stays bounded and linear enough for the explicit CI guard", () => {
  const stats = Array.from({ length: 10_000 }, (_, index) => canonicalStat({ contextId: contextA, entityType: index % 3 === 0 ? "bigram" : "key", entityKey: `k${index}`, index, residualMeanMs: index % 17 }));
  const started = performance.now();
  const snapshot = buildPracticeLimiterSnapshot({
    skillStats: stats,
    context: { profileId, contextId: contextA, dataLocale: "en" },
    prevalenceByStat: new Map(),
    generatedAt: new Date(stamp),
    maxCandidates: 512,
  });
  const elapsed = performance.now() - started;
  assert.ok(snapshot.candidates.length <= 512);
  assert.equal(snapshot.evidenceSummary.evaluatedEntityCount, 10_000);
  assert.ok(elapsed < 8_000, `snapshot took ${elapsed.toFixed(1)} ms`);
});
