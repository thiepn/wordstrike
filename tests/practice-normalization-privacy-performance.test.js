import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createPracticeContentPlan } from "../js/practiceLab/practiceSessionContract.js";
import { analyzePracticeNormalization } from "../js/practiceLab/practiceNormalizationAnalysis.js";

const context = Object.freeze({
  contextId: "context_fixture",
  fingerprint: "v1|locale:en|layout:qwerty|input:unknown|hardware:none",
  dataLocale: "en",
  keyboardLayout: "qwerty",
  inputMethod: "unknown",
  hardwareProfileId: null,
});

function latencyAnalysis(transitions = [], fluentMedianMs = null, scope = "complete-session") {
  return {
    coverage: { scope },
    classifiedTransitions: transitions,
    sessionSummary: { fluentMedianMs },
  };
}

const readJson = async (relative) => JSON.parse(await readFile(new URL(`../${relative}`, import.meta.url), "utf8"));

test("PL10 custom/generated text persists only compact aggregate metadata and never the raw text", () => {
  const secret = "PRIVATE-CUSTOM-TEXT-DO-NOT-PERSIST 917364";
  const contentPlan = createPracticeContentPlan({
    contentId: "practice-content_private-fixture",
    text: `alpha ${secret} omega`,
    completion: { mode: "manual", value: null },
    metadata: { sourceType: "custom", language: "en" },
  });
  const result = analyzePracticeNormalization({ latencyAnalysis: latencyAnalysis(), contentPlan, context });
  const durable = JSON.stringify(result.sessionSummary);
  assert.equal(durable.includes(secret), false);
  assert.equal(Object.hasOwn(result.sessionSummary, "features"), false);
  assert.equal(Object.hasOwn(result.sessionSummary, "normalizedTransitions"), false);
  assert.equal(result.sessionSummary.textDifficulty.staticMetadataUsed, false);
  assert.equal(result.sessionSummary.textDifficulty.corpusId, null);
  assert.equal(result.sessionSummary.textDifficulty.corpusVersion, null);
  assert.ok(Buffer.byteLength(durable, "utf8") < 16 * 1024);
});

test("PL10 unsupported-language typability fails safely without fake numeric difficulty", () => {
  const contentPlan = createPracticeContentPlan({
    contentId: "practice-content_de-fixture",
    text: "Schwierige Wörter und Zeichen.",
    completion: { mode: "manual", value: null },
    metadata: { sourceType: "generated", language: "de" },
  });
  const result = analyzePracticeNormalization({
    latencyAnalysis: latencyAnalysis(),
    contentPlan,
    context: { ...context, dataLocale: "de-DE", keyboardLayout: "qwertz" },
  });
  assert.equal(result.sessionSummary.textDifficulty.status, "unsupported-language");
  assert.equal(result.sessionSummary.textDifficulty.difficultyIndex, null);
  assert.equal(result.sessionSummary.textDifficulty.relativeDifficultyPercentile, null);
});

test("PL10 static typability metadata is used only under exact corpus/content/hash binding", async () => {
  const corpus = await readJson("data/practice/training/en-v1.json");
  const item = corpus.items[0];
  const exact = createPracticeContentPlan({
    contentId: "practice-content_static-binding",
    text: item.text,
    completion: { mode: "manual", value: null },
    metadata: {
      sourceType: "practice-corpus",
      language: "en",
      corpusId: corpus.corpusId,
      corpusVersion: corpus.corpusVersion,
      sourceContentId: item.contentId,
      sourceContentHash: item.contentHash,
    },
  });
  const exactResult = analyzePracticeNormalization({ latencyAnalysis: latencyAnalysis(), contentPlan: exact, context });
  assert.equal(exactResult.textDifficulty.source, "precomputed-static");
  assert.equal(exactResult.sessionSummary.textDifficulty.staticMetadataUsed, true);
  assert.equal(exactResult.sessionSummary.textDifficulty.corpusId, corpus.corpusId);
  assert.equal(exactResult.sessionSummary.textDifficulty.contentId, item.contentId);

  const stale = createPracticeContentPlan({
    ...exact,
    metadata: { ...exact.metadata, sourceContentHash: `sha256-${"0".repeat(64)}` },
  });
  const staleResult = analyzePracticeNormalization({ latencyAnalysis: latencyAnalysis(), contentPlan: stale, context });
  assert.equal(staleResult.textDifficulty.source, "dynamic");
  assert.equal(staleResult.sessionSummary.textDifficulty.staticMetadataUsed, false);
  assert.equal(staleResult.sessionSummary.textDifficulty.corpusId, null);
});

test("PL10 large retained-window traces keep normalization coverage honest and durable output bounded", () => {
  const text = "a".repeat(5001);
  const contentPlan = createPracticeContentPlan({
    contentId: "practice-content_large-normalization",
    text,
    completion: { mode: "manual", value: null },
    metadata: { sourceType: "generated", language: "en" },
  });
  const transitions = Array.from({ length: 5000 }, (_, index) => ({
    eventIndex: index + 1,
    textPosition: index + 1,
    latencyMs: 100,
    classification: "fluent",
    correctness: "correct",
  }));
  const result = analyzePracticeNormalization({
    latencyAnalysis: latencyAnalysis(transitions, 100, "retained-window"),
    contentPlan,
    context,
  });
  assert.equal(result.normalizedTransitions.length, 5000);
  assert.equal(result.sessionSummary.transitionNormalization.coverage.traceScope, "retained-window");
  assert.equal(result.sessionSummary.transitionNormalization.normalizableTransitionCount, 5000);
  assert.equal(result.sessionSummary.transitionNormalization.frequencyCoverageRate, 0);
  assert.equal(result.sessionSummary.textDifficulty.status, "partial");
  const durable = JSON.stringify(result.sessionSummary);
  assert.equal(durable.includes("normalizedTransitions"), false);
  assert.ok(Buffer.byteLength(durable, "utf8") < 16 * 1024);
});

test("PL10 complete-session and retained-window scopes do not alter text difficulty for identical content", () => {
  const contentPlan = createPracticeContentPlan({
    contentId: "practice-content_scope-invariance",
    text: "alpha beta gamma delta",
    completion: { mode: "manual", value: null },
    metadata: { sourceType: "generated", language: "en" },
  });
  const complete = analyzePracticeNormalization({ latencyAnalysis: latencyAnalysis([], null, "complete-session"), contentPlan, context });
  const truncated = analyzePracticeNormalization({ latencyAnalysis: latencyAnalysis([], null, "retained-window"), contentPlan, context });
  assert.deepEqual(complete.sessionSummary.textDifficulty, truncated.sessionSummary.textDifficulty);
});
