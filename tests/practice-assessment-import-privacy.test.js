import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPracticeAssessmentAnalysis } from "../js/practiceLab/practiceAssessmentAnalysis.js";

const MODULES = [
  "practiceAssessmentConstants.js",
  "practiceAssessmentAvailability.js",
  "practiceAssessmentPlan.js",
  "practiceAssessmentRun.js",
  "practiceAssessmentDiagnostics.js",
  "practiceAssessmentAnalysis.js",
  "practiceAssessmentReport.js",
  "practiceAssessmentComparison.js",
  "practiceAssessmentRegistry.js",
  "practiceAssessmentService.js",
];

test("PL19 pure/runtime module imports have zero IndexedDB, storage, fetch, timer or listener side effects", async () => {
  const calls = { indexedDb: 0, storage: 0, fetch: 0, timers: 0, listeners: 0 };
  const original = {
    indexedDB: globalThis.indexedDB,
    localStorage: globalThis.localStorage,
    fetch: globalThis.fetch,
    setTimeout: globalThis.setTimeout,
    setInterval: globalThis.setInterval,
    document: globalThis.document,
    window: globalThis.window,
  };
  Object.defineProperties(globalThis, {
    indexedDB: { configurable: true, value: { open() { calls.indexedDb += 1; throw new Error("unexpected IndexedDB open"); } } },
    localStorage: { configurable: true, value: { getItem() { calls.storage += 1; }, setItem() { calls.storage += 1; }, removeItem() { calls.storage += 1; } } },
    fetch: { configurable: true, value: async () => { calls.fetch += 1; throw new Error("unexpected fetch"); } },
    setTimeout: { configurable: true, value: (...args) => { calls.timers += 1; return original.setTimeout(...args); } },
    setInterval: { configurable: true, value: (...args) => { calls.timers += 1; return original.setInterval(...args); } },
    document: { configurable: true, value: { addEventListener() { calls.listeners += 1; } } },
    window: { configurable: true, value: { addEventListener() { calls.listeners += 1; } } },
  });
  try {
    for (const module of MODULES) await import(new URL(`../js/practiceLab/${module}?pl19-import=${encodeURIComponent(module)}`, import.meta.url));
    assert.deepEqual(calls, { indexedDb: 0, storage: 0, fetch: 0, timers: 0, listeners: 0 });
  } finally {
    for (const [key, value] of Object.entries(original)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
});

test("PL19 diagnostic coverage stores bounded counts only, never entity lists or typed text", () => {
  const analysis = buildPracticeAssessmentAnalysis({
    binding: { assessmentRunId: "practice-assessment_coverage-12345678", blockId: "diagnostic-combinations", blockOrdinal: 4 },
    blockKind: "diagnostic",
    summary: {
      sessionId: "practice-session_coverage-12345678",
      profileId: "practice-profile_coverage-12345678",
      contextId: "practice-context_coverage-12345678",
      status: "completed",
      completionReason: "time-complete",
      completedAtUtc: "2026-09-07T00:00:00.000Z",
      activeDurationMs: 120_000,
      typedCharacterCount: 2_000,
      wpm: 100,
      rawWpm: 103,
      accuracy: 0.98,
    },
    foundationAnalysis: {
      skills: {
        summary: { firstPassOpportunityCount: 4, firstPassCorrectCount: 4 },
        deltas: [
          { entityType: "key", entityKey: "a" },
          { entityType: "key", entityKey: "a" },
          { entityType: "bigram", entityKey: "br" },
          { entityType: "bigram", entityKey: "er" },
          { entityType: "trigram", entityKey: "the" },
          { entityType: "word", entityKey: "there" },
          { entityType: "punctuation-transition", entityKey: "comma-space" },
          { entityType: "number-pattern", entityKey: "12" },
          { entityType: "symbol-pattern", entityKey: "@" },
        ],
      },
      latency: { counts: { fluent: 3, disfluent: 1 } },
      errors: { counts: {} },
      normalization: {},
    },
  });
  assert.deepEqual(analysis.coverage.entityTypeCounts, { key: 1, bigram: 2, trigram: 1, word: 1, punctuation: 1, numeric: 1, symbol: 1 });
  assert.equal(analysis.coverage.coverageRatio, null);
  const serialized = JSON.stringify(analysis.coverage);
  assert.equal(serialized.includes("br"), false);
  assert.equal(serialized.includes("there"), false);
  assert.equal(serialized.includes("entityKey"), false);
});
