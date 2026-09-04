import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzePracticeText } from "../js/practiceLab/practiceTextAnalysis.js";
import {
  PRACTICE_CONTEXT_POLICY_V1,
  normalizePracticeContextLatency,
} from "../js/practiceLab/practiceContextNormalizer.js";

const context = Object.freeze({
  contextId: "context_fixture",
  fingerprint: "ctxfp:v1:fixture",
  dataLocale: "en",
  keyboardLayout: "qwerty",
  inputMethod: "unknown",
  hardwareProfileId: null,
});

function latencyAnalysis(transitions, fluentMedianMs = 120, scope = "complete-session") {
  return {
    coverage: { scope },
    classifiedTransitions: transitions,
    sessionSummary: { fluentMedianMs },
  };
}

function transition(eventIndex, textPosition, latencyMs, classification = "fluent", correctness = "correct") {
  return { eventIndex, textPosition, latencyMs, classification, correctness };
}

test("PL10 hierarchical context model uses PL8 fluent median, minimum n=4, K=12 and recursive shrinkage", () => {
  assert.equal(PRACTICE_CONTEXT_POLICY_V1.minimumBucketSamples, 4);
  assert.equal(PRACTICE_CONTEXT_POLICY_V1.priorStrength, 12);
  const contentAnalysis = analyzePracticeText({ text: "aaaaaaaa", language: "en" });
  const transitions = [1, 2, 3, 4].map((position, index) => transition(index + 1, position, 100));
  const result = normalizePracticeContextLatency({ latencyAnalysis: latencyAnalysis(transitions, 120), contentAnalysis, context });
  assert.equal(result.globalFluentMedianMs, 120);
  assert.equal(result.fitFluentTransitionCount, 4);
  for (const row of result.normalizedTransitions) {
    assert.equal(row.contextLevelUsed, 2);
    assert.ok(Math.abs(row.expectedLatencyMs - 111.25) < 1e-12);
    assert.ok(Math.abs(row.residualLatencyMs + 11.25) < 1e-12);
  }
});

test("PL10 underpowered buckets fall back safely to the global PL8 fluent baseline", () => {
  const contentAnalysis = analyzePracticeText({ text: "aaaaaaaa", language: "en" });
  const transitions = [1, 2, 3].map((position, index) => transition(index + 1, position, 100));
  const result = normalizePracticeContextLatency({ latencyAnalysis: latencyAnalysis(transitions, 120), contentAnalysis, context });
  for (const row of result.normalizedTransitions) {
    assert.equal(row.contextLevelUsed, 0);
    assert.equal(row.expectedLatencyMs, 120);
  }
});

test("PL10 disfluent transitions can be scored but never fit the expected-latency baseline", () => {
  const contentAnalysis = analyzePracticeText({ text: "aaaaaaaa", language: "en" });
  const transitions = [
    transition(1, 1, 100), transition(2, 2, 100), transition(3, 3, 100), transition(4, 4, 100),
    transition(5, 5, 400, "disfluent"),
  ];
  const result = normalizePracticeContextLatency({ latencyAnalysis: latencyAnalysis(transitions, 120), contentAnalysis, context });
  assert.equal(result.fitFluentTransitionCount, 4);
  const disfluent = result.normalizedTransitions.at(-1);
  assert.equal(disfluent.contextLevelUsed, 2);
  assert.ok(disfluent.residualLatencyMs > 250);
});

test("PL10 interruption and excluded transitions are never assigned residuals", () => {
  const contentAnalysis = analyzePracticeText({ text: "abcdef", language: "en" });
  const result = normalizePracticeContextLatency({
    latencyAnalysis: latencyAnalysis([
      transition(1, 1, 2100, "interruption"),
      transition(2, 2, null, "excluded"),
    ], 100),
    contentAnalysis,
    context,
  });
  for (const row of result.normalizedTransitions) {
    assert.equal(row.expectedLatencyMs, null);
    assert.equal(row.residualLatencyMs, null);
    assert.equal(row.residualRatio, null);
    assert.equal(row.contextLevelUsed, null);
  }
});

test("PL10 unknown keyboard geometry falls back to coarser context instead of inventing geometry", () => {
  const contentAnalysis = analyzePracticeText({ text: "abcdefgh", language: "en" });
  const unknownContext = { ...context, keyboardLayout: "unsupported-layout" };
  const transitions = [1, 2, 3, 4].map((position, index) => transition(index + 1, position, 100));
  const result = normalizePracticeContextLatency({ latencyAnalysis: latencyAnalysis(transitions, 120), contentAnalysis, context: unknownContext });
  assert.equal(result.sessionSummary.geometryCoverageRate, 0);
  assert.equal(result.normalizedTransitions.every((row) => row.features.geometryClass === "unknown"), true);
  assert.equal(result.normalizedTransitions.every((row) => row.contextLevelUsed === 1), true);
});

test("PL10 mandatory slow-target preservation: repeated BR remains slow relative to equivalent context", () => {
  const text = "abra atya abra atya abra atya abra atya";
  const contentAnalysis = analyzePracticeText({ text, language: "en" });
  const transitions = [];
  const labels = [];
  for (let position = 1; position < contentAnalysis.graphemes.length; position += 1) {
    const bigram = contentAnalysis.graphemes[position - 1] + contentAnalysis.graphemes[position];
    if (bigram === "br" || bigram === "ty") {
      labels.push(bigram);
      transitions.push(transition(transitions.length + 1, position, bigram === "br" ? 130 : 100));
    }
  }
  assert.deepEqual(labels, ["br", "ty", "br", "ty", "br", "ty", "br", "ty"]);
  const result = normalizePracticeContextLatency({ latencyAnalysis: latencyAnalysis(transitions, 115), contentAnalysis, context });
  const brRows = result.normalizedTransitions.filter((_, index) => labels[index] === "br");
  const tyRows = result.normalizedTransitions.filter((_, index) => labels[index] === "ty");
  assert.equal(brRows.every((row) => row.features.structuralClass === "within-word" && row.features.wordPositionClass === "word-middle" && row.features.geometryClass === "cross-side"), true);
  assert.equal(tyRows.every((row) => row.features.structuralClass === "within-word" && row.features.wordPositionClass === "word-middle" && row.features.geometryClass === "cross-side"), true);
  assert.equal(brRows.every((row) => row.residualLatencyMs > 0), true);
  assert.equal(tyRows.every((row) => row.residualLatencyMs < 0), true);
  const predictorJson = JSON.stringify(result.normalizedTransitions.map((row) => row.features));
  for (const forbidden of ["entityType", "entityKey", "targetEntity", "weakness", "mastery", "priority"]) assert.equal(predictorJson.includes(forbidden), false);
  assert.equal(predictorJson.includes('"br"'), false);
  assert.equal(predictorJson.includes('"ty"'), false);
});

test("PL10 context coverage and hierarchy counts remain internally consistent", () => {
  const contentAnalysis = analyzePracticeText({ text: "aaaaaaaa", language: "en" });
  const transitions = [1, 2, 3, 4, 5].map((position, index) => transition(index + 1, position, 100));
  const result = normalizePracticeContextLatency({ latencyAnalysis: latencyAnalysis(transitions, 100, "retained-window"), contentAnalysis, context });
  const coverage = result.sessionSummary.coverage;
  assert.equal(coverage.traceScope, "retained-window");
  assert.equal(coverage.normalizableTransitionCount, coverage.totalClassifiableTransitionCount);
  assert.equal(coverage.contextLevelCounts.global + coverage.contextLevelCounts.level1 + coverage.contextLevelCounts.level2 + coverage.contextLevelCounts.level3, coverage.normalizableTransitionCount);
  assert.equal(coverage.frequencyKnownCount, 0);
  assert.equal(coverage.frequencyCoverageRate, 0);
});
