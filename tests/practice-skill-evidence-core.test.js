import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultSkillStat } from "../js/practiceLab/practiceDefaults.js";
import { computePracticeEvidenceConfidence } from "../js/practiceLab/practiceEvidenceConfidence.js";
import { resolvePracticeEvidenceRole } from "../js/practiceLab/practiceEvidenceRole.js";
import { createPracticeId, createSkillStatId } from "../js/practiceLab/practiceIds.js";
import { migratePracticeRecord } from "../js/practiceLab/practiceMigrations.js";
import {
  createPracticeWelfordAggregate,
  mergePracticeWelfordAggregates,
  selectPracticeSessionSamples,
  validatePracticeSkillEvidenceDelta,
} from "../js/practiceLab/practiceSkillEvidenceDelta.js";
import { createPracticeSkillEvidenceTracker } from "../js/practiceLab/practiceSkillEvidenceCollector.js";
import { mergePracticeSkillEvidence } from "../js/practiceLab/practiceSkillEvidenceMerge.js";
import { PRACTICE_SKILL_EVIDENCE_POLICY_V1 } from "../js/practiceLab/practiceSkillEvidencePolicy.js";
import { validatePracticeSkillStatV3 } from "../js/practiceLab/practiceSkillEvidenceValidation.js";

const profileId = createPracticeId("profile", { uuid: () => "pl11-profile-core-1234567890" });
const contextId = createPracticeId("context", { uuid: () => "pl11-context-core-123456789" });
const sessionId = createPracticeId("session", { uuid: () => "pl11-session-core-123456789" });
const observedAt = "2026-09-05T00:00:00.000Z";
const context = Object.freeze({
  contextId,
  profileId,
  fingerprint: "ctx-v1-test",
  dataLocale: "en",
  keyboardLayout: "qwerty",
  inputMethod: "unknown",
  hardwareProfileId: null,
});

function contentPlan(text, targetEntities = [], metadata = {}) {
  return Object.freeze({
    text,
    contentHash: `hash-${text.length}-${text.slice(0, 4)}`,
    targetEntities,
    metadata: { language: "en", ...metadata },
  });
}

function collector({ text = "bright", targetEntities = [], role = "unclassified", policy = PRACTICE_SKILL_EVIDENCE_POLICY_V1, seed = null, initialCursor = 0, metadata = {} } = {}) {
  return createPracticeSkillEvidenceTracker({
    sessionId,
    profileId,
    contextId,
    contentPlan: contentPlan(text, targetEntities, metadata),
    context,
    evidenceRole: role,
    policy,
    seed,
    initialCursor,
  });
}

function finalize(tracker, normalizedTransitions = [], { status = "completed", scope = "complete-session" } = {}) {
  return tracker.finalize({
    foundationAnalysis: {
      latency: { coverage: { scope } },
      normalization: { normalizedTransitions },
    },
    status,
    observedAt,
    localDayKey: "2026-09-05",
  });
}

function findDelta(result, entityType, entityKey) {
  return result.deltas.find((delta) => delta.entityType === entityType && delta.entityKey === entityKey);
}

test("PL11 first-pass opportunities count retries once for key, ending bigram, ending trigram and containing word", () => {
  const tracker = collector();
  assert.equal(tracker.recordInsertion({ position: 0, correctness: "correct" }), true);
  assert.equal(tracker.recordInsertion({ position: 1, correctness: "correct" }), true);
  assert.equal(tracker.recordInsertion({ position: 2, correctness: "incorrect" }), true);
  assert.equal(tracker.recordInsertion({ position: 2, correctness: "correct" }), false);
  for (let position = 3; position < 6; position += 1) assert.equal(tracker.recordInsertion({ position, correctness: "correct" }), true);
  const result = finalize(tracker);
  for (const [type, key] of [["key", "i"], ["bigram", "ri"], ["trigram", "bri"], ["word", "bright"]]) {
    const delta = findDelta(result, type, key);
    assert.ok(delta, `${type}:${key} should be present`);
    assert.equal(delta.opportunities.count, 1);
    assert.equal(delta.opportunities.errorCount, 1);
    assert.equal(delta.opportunities.correctCount, 0);
  }
});

test("PL11 perfect word remains one correct opportunity and direct targeting never propagates down the unit hierarchy", () => {
  const tracker = collector({ targetEntities: [{ entityType: "bigram", entityKey: "br" }] });
  for (let position = 0; position < 6; position += 1) tracker.recordInsertion({ position, correctness: "correct" });
  const result = finalize(tracker);
  assert.equal(findDelta(result, "word", "bright").opportunities.correctCount, 1);
  assert.equal(findDelta(result, "bigram", "br").opportunities.directTargetedCount, 1);
  assert.equal(findDelta(result, "key", "r").opportunities.incidentalCount, 1);
  assert.equal(findDelta(result, "key", "r").opportunities.directTargetedCount, 0);
});

test("PL11 timing keeps fluent raw latency, fluent residual, disfluent residual, retries excluded and word launch separate", () => {
  const tracker = collector({ text: "a bright" });
  for (let position = 0; position < 8; position += 1) tracker.recordInsertion({ position, correctness: "correct" });
  const result = finalize(tracker, [
    { textPosition: 2, isFirstAttempt: true, correctness: "correct", latencyClass: "fluent", observedLatencyMs: 120, residualLatencyMs: 20 },
    { textPosition: 3, isFirstAttempt: true, correctness: "correct", latencyClass: "fluent", observedLatencyMs: 90, residualLatencyMs: -10 },
    { textPosition: 4, isFirstAttempt: true, correctness: "correct", latencyClass: "disfluent", observedLatencyMs: 180, residualLatencyMs: 60 },
    { textPosition: 5, isFirstAttempt: false, correctness: "correct", latencyClass: "fluent", observedLatencyMs: 999, residualLatencyMs: 899 },
    { textPosition: 6, isFirstAttempt: true, correctness: "correct", latencyClass: "interruption", observedLatencyMs: 2000, residualLatencyMs: null },
  ]);
  const bright = findDelta(result, "word", "bright");
  assert.equal(bright.launchTiming.fluentCount, 1);
  assert.equal(bright.launchTiming.fluentLatency.meanMs, 120);
  assert.equal(bright.launchTiming.fluentResidual.meanMs, 20);
  assert.equal(bright.timing.fluentCount, 1);
  assert.equal(bright.timing.fluentLatency.meanMs, 90);
  assert.equal(bright.timing.fluentResidual.meanMs, -10);
  assert.equal(bright.timing.disfluentCount, 1);
  assert.equal(bright.timing.disfluentResidual.meanMs, 60);
  assert.equal(bright.timing.eligibleCount, 2);
  assert.equal(bright.timing.fluentLatency.maxMs, 90);
});

test("PL11 Welford merge equals direct recomputation and deterministic sampling spans the session", () => {
  const leftValues = [10, 20, 30, 40];
  const rightValues = [50, 60, 70];
  const merged = mergePracticeWelfordAggregates(createPracticeWelfordAggregate(leftValues), createPracticeWelfordAggregate(rightValues));
  const direct = createPracticeWelfordAggregate([...leftValues, ...rightValues]);
  assert.equal(merged.count, direct.count);
  assert.ok(Math.abs(merged.meanMs - direct.meanMs) < 1e-12);
  assert.ok(Math.abs(merged.m2 - direct.m2) < 1e-9);
  const hundred = Array.from({ length: 100 }, (_, index) => index);
  const selected = selectPracticeSessionSamples(hundred, 8);
  assert.equal(selected.length, 8);
  assert.ok(selected[0] < 10);
  assert.ok(selected.at(-1) > 90);
  assert.deepEqual(selected, selectPracticeSessionSamples(hundred, 8));
});

test("PL11 confidence is evidence confidence: one huge session is not high, multi-session/day breadth increases confidence, dimensions can differ", () => {
  const oneSession = createDefaultSkillStat({ profileId, contextId, entityType: "bigram", entityKey: "th", now: () => new Date(observedAt) });
  oneSession.evidence.opportunities.count = 2000;
  oneSession.evidence.opportunities.correctCount = 2000;
  oneSession.evidence.roles.unclassified = {
    opportunityCount: 2000, correctCount: 2000, errorCount: 0,
    timingEligibleCount: 0, fluentCount: 0, disfluentCount: 0,
    fluentResidualCount: 0, fluentResidualMeanMs: 0, fluentResidualM2: 0,
    recentResidualSamples: [], primaryErrorEpisodeCount: 0, sessionCount: 1, lastObservedAt: observedAt,
  };
  oneSession.evidence.observation.sessionCount = 1;
  oneSession.evidence.observation.dayCount = 1;
  oneSession.evidence.observation.breadthEvidencePoints = 1;
  const single = computePracticeEvidenceConfidence(oneSession);
  assert.notEqual(single.level, "high");

  const diverse = structuredClone(oneSession);
  diverse.evidence.observation.sessionCount = 8;
  diverse.evidence.observation.dayCount = 8;
  diverse.evidence.observation.breadthEvidencePoints = 24;
  diverse.evidence.timing.fluentCount = 1;
  diverse.evidence.timing.eligibleCount = 1;
  diverse.evidence.timing.fluentLatency = createPracticeWelfordAggregate([100]);
  diverse.evidence.timing.fluentResidual = createPracticeWelfordAggregate([10]);
  const general = computePracticeEvidenceConfidence(diverse, "accuracy");
  const residual = computePracticeEvidenceConfidence(diverse, "normalized-residual");
  assert.equal(general.level, "high");
  assert.ok(general.score > residual.score);
});

test("PL11 skillStat v2 migration preserves nonzero legacy data without converting it into canonical first-pass evidence", () => {
  const statId = createSkillStatId(profileId, contextId, "bigram", "th");
  const legacy = {
    statId, profileId, contextId, entityType: "bigram", entityKey: "th",
    recordVersion: 2,
    createdAt: observedAt, updatedAt: observedAt,
    sampleCount: 100, correctCount: 90, errorCount: 10, correctedErrorCount: 8, uncorrectedErrorCount: 2,
    latencyCount: 100, latencyMeanMs: 120, latencyM2: 2500, latencyMinMs: 70, latencyMaxMs: 240, latencyEmaMs: 115,
    latencyHistogram: [0, 10, 60, 20, 10, 0, 0, 0], recentLatencySamples: [100, 120, 140],
    confidenceScore: 99, confidenceLevel: "high", lastObservedAt: observedAt, lastPractisedAt: observedAt,
    recentTrend: "insufficient-data", weaknessScore: 0, priority: 0, masteryState: "unmeasured", successfulReviewCount: 0, failedReviewCount: 0,
  };
  const migrated = migratePracticeRecord("skillStat", legacy);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.value.recordVersion, 3);
  assert.equal(migrated.value.evidence.opportunities.count, 0);
  assert.equal(migrated.value.confidenceScore, 0);
  assert.equal(migrated.value.confidenceLevel, "none");
  assert.equal(migrated.value.legacyEvidenceV2.sampleCount, 100);
  assert.equal(migrated.value.legacyEvidenceV2.latencyMeanMs, 120);
  assert.equal(Object.hasOwn(migrated.value, "sampleCount"), false);
  assert.equal(validatePracticeSkillStatV3(migrated.value).valid, true);
});

test("PL11 pristine v2 migration stores no legacy blob", () => {
  const statId = createSkillStatId(profileId, contextId, "key", "a");
  const legacy = {
    statId, profileId, contextId, entityType: "key", entityKey: "a", recordVersion: 2,
    createdAt: observedAt, updatedAt: observedAt,
    sampleCount: 0, correctCount: 0, errorCount: 0, correctedErrorCount: 0, uncorrectedErrorCount: 0,
    latencyCount: 0, latencyMeanMs: 0, latencyM2: 0, latencyMinMs: null, latencyMaxMs: null, latencyEmaMs: null,
    latencyHistogram: [0, 0, 0, 0, 0, 0, 0, 0], recentLatencySamples: [],
    confidenceScore: 0, confidenceLevel: "none", lastObservedAt: null, lastPractisedAt: null,
    recentTrend: "insufficient-data", weaknessScore: 0, priority: 0, masteryState: "unmeasured", successfulReviewCount: 0, failedReviewCount: 0,
  };
  const migrated = migratePracticeRecord("skillStat", legacy);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.value.legacyEvidenceV2, null);
  assert.equal(migrated.value.evidence.opportunities.count, 0);
});

test("PL11 default Custom Text policy persists short motor sequences but not private word entities", () => {
  const secret = "ThisIsAnExtremelyPrivateUniqueSecret";
  const tracker = collector({ text: secret, role: "custom", metadata: { contentSource: "custom", privacy: "local-only" } });
  for (let position = 0; position < [...secret].length; position += 1) tracker.recordInsertion({ position, correctness: "correct" });
  const result = finalize(tracker);
  assert.equal(result.deltas.some((delta) => delta.entityType === "word"), false);
  assert.equal(result.deltas.some((delta) => delta.entityType === "key"), true);
  assert.equal(result.deltas.some((delta) => delta.entityType === "bigram"), true);
  assert.equal(result.deltas.some((delta) => delta.entityKey === secret.toLowerCase()), false);
});

test("PL11 custom role is explicit and arbitrary generated benchmark metadata cannot spoof a protected role", () => {
  assert.equal(resolvePracticeEvidenceRole({ contentPlan: contentPlan("abc", [], { contentSource: "custom", privacy: "local-only" }), context }), "custom");
  assert.equal(resolvePracticeEvidenceRole({ contentPlan: contentPlan("abc", [], { partition: "benchmark" }), context }), "unclassified");
});

test("PL11 admission caps reserve direct-target capacity and report truncation honestly", () => {
  const policy = {
    ...PRACTICE_SKILL_EVIDENCE_POLICY_V1,
    admissionLimits: { ...PRACTICE_SKILL_EVIDENCE_POLICY_V1.admissionLimits, trigram: 2 },
  };
  const tracker = collector({
    text: "abcdefg",
    targetEntities: [{ entityType: "trigram", entityKey: "efg" }],
    policy,
  });
  for (let position = 0; position < 7; position += 1) tracker.recordInsertion({ position, correctness: "correct" });
  const result = finalize(tracker);
  const trigrams = result.deltas.filter((delta) => delta.entityType === "trigram");
  assert.equal(trigrams.length, 2);
  assert.ok(trigrams.some((delta) => delta.entityKey === "efg" && delta.directTarget));
  assert.equal(result.summary.entityCoverageTruncated, true);
  assert.ok(result.summary.omittedObservationCount > 0);
});

test("PL11 checkpoint compaction is deterministic and truncated restore cannot claim complete-session accuracy", () => {
  const policy = { ...PRACTICE_SKILL_EVIDENCE_POLICY_V1, checkpointEntityCap: 2 };
  const tracker = collector({ text: "abcdef", policy });
  for (let position = 0; position < 6; position += 1) tracker.recordInsertion({ position, correctness: "correct" });
  const snapshot = tracker.checkpointSnapshot();
  assert.equal(snapshot.trackerVersion, 1);
  assert.equal(snapshot.evidenceRole, "unclassified");
  assert.equal(snapshot.entries.length, 2);
  assert.equal(snapshot.checkpointEvidenceTruncated, true);
  const restored = collector({ text: "abcdef", policy, seed: snapshot, initialCursor: 6 });
  assert.equal(restored.recordInsertion({ position: 5, correctness: "correct" }), false);
  const result = finalize(restored);
  assert.equal(result.summary.accuracyScope, "partial-session");
});

test("PL11 primary transposition attribution resolves to the expected ending bigram without overlapping explosion", () => {
  const tracker = collector({ text: "th" });
  tracker.recordClosedEpisode({
    episodeId: 1,
    primaryPosition: 0,
    affectedStart: 0,
    affectedEnd: 1,
    editClass: "transposition",
    confidence: "high",
    corrected: false,
    correctionInitiationMs: null,
    errorToRepairMs: null,
    correctCharactersRemoved: 0,
  });
  const result = finalize(tracker);
  const bigram = findDelta(result, "bigram", "th");
  assert.ok(bigram);
  assert.equal(bigram.errors.primaryEpisodeCount, 1);
  assert.equal(bigram.errors.structuralCounts.transposition, 1);
  assert.equal(result.deltas.filter((delta) => delta.entityType === "bigram" && delta.errors.primaryEpisodeCount).length, 1);
});

test("PL11 merge preserves judgments while confidence comes only from canonical v3 evidence", () => {
  const stat = createDefaultSkillStat({ profileId, contextId, entityType: "key", entityKey: "a", now: () => new Date(observedAt), overrides: { weaknessScore: 7, priority: 4, masteryState: "developing", successfulReviewCount: 2 } });
  const tracker = collector({ text: "a" });
  tracker.recordInsertion({ position: 0, correctness: "correct" });
  const delta = findDelta(finalize(tracker), "key", "a");
  assert.equal(validatePracticeSkillEvidenceDelta(delta).valid, true);
  const merged = mergePracticeSkillEvidence(stat, delta);
  assert.equal(merged.weaknessScore, 7);
  assert.equal(merged.priority, 4);
  assert.equal(merged.masteryState, "developing");
  assert.equal(merged.successfulReviewCount, 2);
  assert.equal(merged.evidence.opportunities.count, 1);
  assert.ok(merged.confidenceScore > 0);
  assert.equal(validatePracticeSkillStatV3(merged).valid, true);
});
