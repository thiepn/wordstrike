import test from "node:test";
import assert from "node:assert/strict";
import {
  orderPracticeWeakKeysLexicalCoverage,
  selectPracticeWeakKeysExactQuota,
} from "../js/practiceLab/practiceWeakKeysComposer.js";
import {
  scorePracticeWeakKeysProbePair,
  selectPracticeWeakKeysProbePair,
} from "../js/practiceLab/practiceWeakKeysProbeMatch.js";

const baseOptions = Object.freeze({
  sessionId: "practice-session_pl21-composer-fixture",
  entityKey: "r",
  generatorVersion: 1,
  policyVersion: 1,
  salt: "fixture",
});

function candidate(id, count, familyId, lexicalKey, extra = {}) {
  return Object.freeze({
    candidateId: id,
    targetOpportunityCount: count,
    familyId,
    lexicalKey,
    lexicalKeys: [lexicalKey],
    positionClasses: ["word-middle"],
    precedingGraphemes: [lexicalKey[0] ?? "a"],
    followingGraphemes: [lexicalKey.at(-1) ?? "b"],
    geometryClasses: ["same-side-near"],
    typabilityPercentile: 50,
    ...extra,
  });
}

test("PL21 exact composer reaches the exact target quota instead of greedy overshoot", () => {
  const source = [
    candidate("a", 4, "f1", "rain"),
    candidate("b", 3, "f2", "river"),
    candidate("c", 2, "f3", "road"),
    candidate("d", 1, "f4", "green"),
  ];
  const selected = selectPracticeWeakKeysExactQuota(source, 6, baseOptions);
  assert.ok(selected);
  assert.equal(selected.targetOpportunityCount, 6);
  assert.equal(selected.units.reduce((sum, item) => sum + item.targetOpportunityCount, 0), 6);
});

test("PL21 exact composer is deterministic for identical inputs", () => {
  const source = [
    candidate("a", 2, "f1", "rain"),
    candidate("b", 2, "f2", "river"),
    candidate("c", 2, "f3", "road"),
    candidate("d", 2, "f4", "green"),
  ];
  const first = selectPracticeWeakKeysExactQuota(source, 4, baseOptions);
  const second = selectPracticeWeakKeysExactQuota([...source].reverse(), 4, baseOptions);
  assert.deepEqual(first.units.map((item) => item.candidateId), second.units.map((item) => item.candidateId));
  assert.equal(first.solutionHash, second.solutionHash);
});

test("PL21 exact composer prefers the more diverse valid solution", () => {
  const source = [
    candidate("repeat-a", 2, "same-family", "rain"),
    candidate("repeat-b", 2, "same-family", "rain"),
    candidate("diverse-a", 2, "family-a", "river", { positionClasses: ["word-start"], precedingGraphemes: ["a"] }),
    candidate("diverse-b", 2, "family-b", "road", { positionClasses: ["word-end"], precedingGraphemes: ["o"] }),
  ];
  const selected = selectPracticeWeakKeysExactQuota(source, 4, baseOptions);
  assert.equal(selected.metrics.uniqueFamilyCount, 2);
  assert.equal(selected.metrics.distinctLexicalCount, 2);
  assert.equal(selected.metrics.positionClassCount, 2);
});

test("PL21 lexical ordering visits every selected word before beginning a repetition round", () => {
  const units = [
    candidate("a1", 1, "f1", "rain"),
    candidate("a2", 1, "f1", "rain"),
    candidate("b1", 1, "f2", "road"),
    candidate("b2", 1, "f2", "road"),
    candidate("c1", 1, "f3", "river"),
    candidate("c2", 1, "f3", "river"),
  ];
  const ordered = orderPracticeWeakKeysLexicalCoverage(units, baseOptions);
  assert.equal(new Set(ordered.slice(0, 3).map((unit) => unit.lexicalKey)).size, 3);
  assert.equal(new Set(ordered.slice(3, 6).map((unit) => unit.lexicalKey)).size, 3);
});

function probeUnit({ id, family, content, positionCounts, geometryCounts, typability = 0.5, featureShift = 0 }) {
  return Object.freeze({
    candidateId: id,
    kind: "natural",
    compositionMode: "natural-text-bundle",
    familyId: family,
    contentId: content,
    targetOpportunityCount: 4,
    positionCounts,
    geometryCounts,
    typabilityScore: typability,
    difficultyFeatures: {
      meanWordLength: 4 + featureShift,
      p90WordLength: 6,
      uppercaseRatio: 0,
      punctuationRatio: 0,
      digitRatio: 0,
      symbolRatio: 0,
      lexicalRarityScore: 0.2,
      bigramRarityScore: 0.2,
    },
  });
}

function matchedProbes() {
  const positionsA = { "word-start": 2, "word-middle": 1, "word-end": 1, "single-character-word": 0 };
  const positionsB = { "word-start": 2, "word-middle": 1, "word-end": 1, "single-character-word": 0 };
  const geometryA = { "same-key": 0, "same-side-near": 2, "same-side-far": 1, "cross-side": 1 };
  const geometryB = { "same-key": 0, "same-side-near": 2, "same-side-far": 1, "cross-side": 1 };
  return {
    entry: {
      probeId: "entry",
      compositionMode: "natural-text-bundle",
      units: [
        probeUnit({ id: "e1", family: "entry-a", content: "entry-1", positionCounts: positionsA, geometryCounts: geometryA }),
        probeUnit({ id: "e2", family: "entry-b", content: "entry-2", positionCounts: positionsA, geometryCounts: geometryA }),
      ],
    },
    exit: {
      probeId: "exit",
      compositionMode: "natural-text-bundle",
      units: [
        probeUnit({ id: "x1", family: "exit-a", content: "exit-1", positionCounts: positionsB, geometryCounts: geometryB, typability: 0.6, featureShift: 0.1 }),
        probeUnit({ id: "x2", family: "exit-b", content: "exit-2", positionCounts: positionsB, geometryCounts: geometryB, typability: 0.6, featureShift: 0.1 }),
      ],
    },
  };
}

test("PL21 probe matcher requires exact 8/8 and family/content disjointness", () => {
  const { entry, exit } = matchedProbes();
  const score = scorePracticeWeakKeysProbePair(entry, exit);
  assert.equal(score.valid, true);
  assert.equal(score.entryOpportunityCount, 8);
  assert.equal(score.exitOpportunityCount, 8);
  assert.deepEqual(score.familyOverlap, []);
  assert.deepEqual(score.contentOverlap, []);
  assert.equal(score.compositionMode, "natural-text-bundle");
});

test("PL21 probe matcher enforces position-profile distance", () => {
  const { entry, exit } = matchedProbes();
  const altered = {
    ...exit,
    units: exit.units.map((unit) => ({
      ...unit,
      positionCounts: { "word-start": 0, "word-middle": 0, "word-end": 4, "single-character-word": 0 },
    })),
  };
  const score = scorePracticeWeakKeysProbePair(entry, altered);
  assert.equal(score.valid, false);
  assert.ok(score.positionProfileDistance > 0.25);
});

test("PL21 probe matcher enforces geometry-profile distance when geometry is available", () => {
  const { entry, exit } = matchedProbes();
  const altered = {
    ...exit,
    units: exit.units.map((unit) => ({
      ...unit,
      geometryCounts: { "same-key": 4, "same-side-near": 0, "same-side-far": 0, "cross-side": 0 },
    })),
  };
  const score = scorePracticeWeakKeysProbePair(entry, altered);
  assert.equal(score.valid, false);
  assert.ok(score.geometryProfileDistance > 0.35);
});

test("unknown geometry does not invalidate an otherwise responsible probe pair", () => {
  const { entry, exit } = matchedProbes();
  const unknown = (probe) => ({
    ...probe,
    units: probe.units.map((unit) => ({ ...unit, geometryCounts: { "same-key": 0, "same-side-near": 0, "same-side-far": 0, "cross-side": 0, unknown: 4 } })),
  });
  const score = scorePracticeWeakKeysProbePair(unknown(entry), unknown(exit));
  assert.equal(score.valid, true);
  assert.equal(score.geometryProfileDistance, null);
  assert.equal(score.geometryProfileCoverage, "unavailable");
});

test("PL21 probe matcher enforces typability and feature thresholds", () => {
  const { entry, exit } = matchedProbes();
  const tooDifferentTypability = { ...exit, units: exit.units.map((unit) => ({ ...unit, typabilityScore: 1.0 })) };
  assert.equal(scorePracticeWeakKeysProbePair(entry, tooDifferentTypability).valid, false);
  const tooDifferentFeatures = { ...exit, units: exit.units.map((unit) => ({ ...unit, difficultyFeatures: { ...unit.difficultyFeatures, meanWordLength: 10 } })) };
  assert.equal(scorePracticeWeakKeysProbePair(entry, tooDifferentFeatures).valid, false);
});

test("PL21 selects the best deterministic valid matched probe pair", () => {
  const { entry, exit } = matchedProbes();
  const badExit = { ...exit, probeId: "bad", units: exit.units.map((unit) => ({ ...unit, familyId: "entry-a" })) };
  const selected = selectPracticeWeakKeysProbePair({ entryCandidates: [entry], exitCandidates: [badExit, exit] });
  assert.ok(selected);
  assert.equal(selected.entry.probeId, "entry");
  assert.equal(selected.exit.probeId, "exit");
});
