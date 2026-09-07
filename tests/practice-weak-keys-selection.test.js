import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWeakKeyCandidates,
  getWeakKeyManualSaturationWarning,
} from "../js/practiceLab/practiceWeakKeysSelection.js";

const profileId = "practice-profile_pl21-selection-fixture";
const contextId = "practice-context_pl21-selection-fixture";

function stat(statId, entityKey) {
  return Object.freeze({ statId, profileId, contextId, entityType: "key", entityKey });
}

function limiter(statId, entityType, entityKey, {
  status = "likely",
  priorityScore = 60,
  weaknessScore = 70,
  confidence = 80,
  phenotype = "slow",
  explainedBy = [],
} = {}) {
  return Object.freeze({
    statId,
    entityType,
    entityKey,
    status,
    priorityScore,
    weaknessScore,
    primaryPhenotype: phenotype,
    evidenceConfidenceScore: confidence,
    evidenceMetadata: { primaryDimensionConfidenceScore: confidence, generalConfidenceScore: confidence },
    hierarchy: { status: explainedBy.length ? "explained" : "independent", explainedBy },
  });
}

function mastery(statId, stage = "learning") {
  return Object.freeze({ statId, stage, limiterGuard: { confirmedCritical: false, likelyCritical: false } });
}

function resolvedLearningState(statId) {
  return Object.freeze({
    statId,
    acquisition: {
      observationCount: 6,
      observations: [],
      curve: {
        status: "flat",
        confidence: "medium",
        pointCount: 6,
        dayCount: 4,
        doseSpan: 4,
        recentQuality: 100,
        recentSlopePointsPerDose: 0,
        medianSlopePointsPerDose: 0,
        medianPracticeGain: 0,
      },
    },
    transfer: {
      observationCount: 0,
      curve: { status: "insufficient-data", confidence: "none", pointCount: 0, dayCount: 0, recentQuality: null, recentSlopePointsPerDose: null },
    },
  });
}

test("PL21 recommendations include only key-level limiter candidates and cap output at eight", () => {
  const stats = Array.from({ length: 10 }, (_, index) => stat(`key-${index}`, String.fromCharCode(97 + index)));
  const limiterSnapshot = {
    profileId,
    contextId,
    candidates: stats.map((entry, index) => limiter(entry.statId, "key", entry.entityKey, { priorityScore: 100 - index })),
  };
  const masterySnapshot = { profileId, contextId, entities: stats.map((entry) => mastery(entry.statId)) };
  const result = buildWeakKeyCandidates({ profileId, contextId, language: "en", skillStats: stats, limiterSnapshot, masterySnapshot });
  assert.equal(result.length, 8);
  assert.ok(result.every((entry) => entry.entityType === "key"));
  assert.deepEqual(result.map((entry) => entry.entityKey), ["a", "b", "c", "d", "e", "f", "g", "h"]);
});

test("PL21 recommendations expose bounded downstream hierarchy relevance without causal wording", () => {
  const key = stat("key-r", "r");
  const limiterSnapshot = {
    profileId,
    contextId,
    candidates: [
      limiter(key.statId, "key", "r", { priorityScore: 70 }),
      limiter("bi-tr", "bigram", "tr", { status: "confirmed", explainedBy: [{ statId: key.statId }] }),
      limiter("tri-str", "trigram", "str", { status: "likely", explainedBy: [{ statId: key.statId }] }),
      limiter("word-river", "word", "river", { status: "likely", explainedBy: [{ statId: key.statId }] }),
      limiter("word-possible", "word", "rare", { status: "possible", explainedBy: [{ statId: key.statId }] }),
    ],
  };
  const masterySnapshot = { profileId, contextId, entities: [mastery(key.statId)] };
  const [result] = buildWeakKeyCandidates({ profileId, contextId, language: "en", skillStats: [key], limiterSnapshot, masterySnapshot });
  assert.equal(result.downstreamExplainedCount, 3);
  assert.equal(result.bigramCount, 1);
  assert.equal(result.trigramCount, 1);
  assert.equal(result.wordCount, 1);
});

test("PL16 saturation de-emphasizes an otherwise high-priority key recommendation", () => {
  const r = stat("key-r", "r");
  const q = stat("key-q", "q");
  const limiterSnapshot = {
    profileId,
    contextId,
    candidates: [
      limiter(r.statId, "key", "r", { priorityScore: 60, status: "likely" }),
      limiter(q.statId, "key", "q", { priorityScore: 100, status: "confirmed" }),
    ],
  };
  const masterySnapshot = { profileId, contextId, entities: [mastery(r.statId, "learning"), mastery(q.statId, "acquired")] };
  const result = buildWeakKeyCandidates({
    profileId,
    contextId,
    language: "en",
    skillStats: [r, q],
    limiterSnapshot,
    masterySnapshot,
    learningStates: [resolvedLearningState(q.statId)],
  });
  const saturated = result.find((entry) => entry.entityKey === "q");
  assert.equal(saturated.saturationStatus, "resolved");
  assert.equal(saturated.saturationDeemphasized, true);
  assert.ok(saturated.effectivePriorityScore < 60);
  assert.equal(result[0].entityKey, "r");
});

test("robust and retained mastery are not normally recommended, but learning/acquired remain eligible", () => {
  const stats = [stat("a", "a"), stat("b", "b"), stat("c", "c"), stat("d", "d")];
  const limiterSnapshot = { profileId, contextId, candidates: stats.map((entry) => limiter(entry.statId, "key", entry.entityKey)) };
  const masterySnapshot = {
    profileId,
    contextId,
    entities: [mastery("a", "learning"), mastery("b", "acquired"), mastery("c", "robust"), mastery("d", "retained")],
  };
  const result = buildWeakKeyCandidates({ profileId, contextId, language: "en", skillStats: stats, limiterSnapshot, masterySnapshot });
  assert.deepEqual(result.map((entry) => entry.entityKey).sort(), ["a", "b"]);
});

test("possible limiter evidence may appear secondarily and not-elevated evidence is excluded", () => {
  const a = stat("a", "a");
  const b = stat("b", "b");
  const limiterSnapshot = {
    profileId,
    contextId,
    candidates: [
      limiter(a.statId, "key", "a", { status: "possible", priorityScore: 20 }),
      limiter(b.statId, "key", "b", { status: "not-elevated", priorityScore: 90 }),
    ],
  };
  const masterySnapshot = { profileId, contextId, entities: [mastery(a.statId), mastery(b.statId)] };
  const result = buildWeakKeyCandidates({ profileId, contextId, language: "en", skillStats: [a, b], limiterSnapshot, masterySnapshot });
  assert.deepEqual(result.map((entry) => entry.entityKey), ["a"]);
});

test("manual saturated practice remains allowed with a warning instead of being blocked", () => {
  const q = stat("key-q", "q");
  const limiterSnapshot = { profileId, contextId, candidates: [limiter(q.statId, "key", "q", { status: "confirmed" })] };
  const masterySnapshot = { profileId, contextId, entities: [mastery(q.statId, "acquired")] };
  const warning = getWeakKeyManualSaturationWarning({
    statId: q.statId,
    limiterSnapshot,
    masterySnapshot,
    learningStates: [resolvedLearningState(q.statId)],
  });
  assert.ok(warning);
  assert.equal(warning.status, "resolved");
  assert.match(warning.message, /manual practice is still allowed/i);
});
