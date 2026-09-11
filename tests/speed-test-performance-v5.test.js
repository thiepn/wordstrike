import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPerformanceV5Analysis } from "../js/speedTestPerformanceV5.js";

function word(expected, { wpm = 80, durationMs = 750, effectiveChars = expected.length + 1, errors = 0, backspaces = 0, wordDeletes = 0, clean = errors === 0 && backspaces === 0 && wordDeletes === 0 } = {}) {
  return { expected, typed: expected, durationMs, effectiveChars, errors, backspaces, wordDeletes, wpm, rawWpm: wpm + 5, clean };
}
function sample({ sessionId, endedAt, wpm, cleanAlpha = false, alphaWpm = 45, mistakeCount = 1 }) {
  const words = [
    word("alpha", { wpm: alphaWpm, errors: cleanAlpha ? 0 : 1, backspaces: cleanAlpha ? 0 : 1, clean: cleanAlpha }),
    word("beta", { wpm: wpm + 4 }), word("gamma", { wpm: wpm + 2 }), word("delta", { wpm: wpm - 1 }),
  ];
  const cleanWords = words.filter((item) => item.clean).length;
  const corrections = words.reduce((sum, item) => sum + item.backspaces + item.wordDeletes, 0);
  return {
    sessionId, endedAt, wpm, accuracy: cleanAlpha ? 100 : 97, rawWpm: wpm + 6,
    wordCount: words.length, cleanWords, cleanPercent: (cleanWords / words.length) * 100,
    corrections, correctionsPerWord: corrections / words.length,
    profile: { version: 1, sessionId, words },
    timeline: { version: 1, mistakes: cleanAlpha ? [] : [{ type: "incorrect", expected: "a", typed: "s", count: mistakeCount, word: "alpha" }] },
  };
}
const samples = [
  sample({ sessionId: "r1", endedAt: 100, wpm: 70, alphaWpm: 42, mistakeCount: 1 }),
  sample({ sessionId: "r2", endedAt: 200, wpm: 76, alphaWpm: 48, mistakeCount: 2 }),
  sample({ sessionId: "current", endedAt: 300, wpm: 82, alphaWpm: 53, mistakeCount: 1 }),
];
const result = { sessionId: "current", wpm: 82, accuracy: 98, modeData: { configId: "time-60", wordSetId: "english-200" } };
const analysis = buildPerformanceV5Analysis(samples, result);
assert.equal(analysis.version, 5);
assert.equal(analysis.runCount, 3);
assert.equal(analysis.baselineEstablished, true);
assert.equal(analysis.persistentWords[0].word, "alpha");
assert.equal(analysis.persistentWords[0].runCount, 3);
assert.ok(analysis.persistentWords[0].averagePaceRatio < 1);
assert.ok(analysis.focusWords.includes("alpha"));
assert.equal(analysis.recurringConfusions[0].expected, "a");
assert.equal(analysis.recurringConfusions[0].typed, "s");
assert.equal(analysis.recurringConfusions[0].runCount, 3);
assert.equal(analysis.recurringConfusions[0].count, 4);
assert.ok(analysis.recentAverageWpm > 75);
assert.ok(analysis.wpmStandardDeviation > 0);
assert.match(analysis.insight, /Baseline established/i);
assert.match(analysis.insight, /alpha/i);
const oneRun = buildPerformanceV5Analysis([samples[2]], result);
assert.equal(oneRun.runCount, 1);
assert.equal(oneRun.baselineEstablished, false);
assert.match(oneRun.insight, /Baseline building/i);
assert.ok(oneRun.focusWords.length > 0);

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const resultsFeature = readFileSync(new URL("../js/speedTestResultsFeature.js", import.meta.url), "utf8");
assert.match(index, /js\/appBootstrap\.js\?v=20260911v8/);
assert.match(resultsFeature, /import "\.\/speedTestPerformanceV5\.js";/,
  "the semantic results feature must retain Typing Performance V5");
assert.doesNotMatch(index, /speedTestPerformanceV5\.js\?v=20260911a/,
  "historical V5 scripts must not return directly to index.html");
assert.doesNotMatch(index, /<link[^>]+typing-performance-v5\.css/,
  "V5 styling should remain lazy so unrelated screens keep certified default pixels");
const submission = readFileSync(new URL("../js/leaderboardSubmissionService.js", import.meta.url), "utf8");
assert.doesNotMatch(submission, /performanceV5|persistentWords|recurringConfusions|focusWords/,
  "V5 long-term intelligence must remain outside ranked leaderboard payloads");
console.log("Typing Performance Timeline V5 historical baseline, persistent friction, semantic bootstrap, and ranked-data isolation passed.");
