import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPerformanceV4Analysis } from "../js/speedTestPerformanceV4.js";

const profile = {
  version: 1,
  sessionId: "current",
  configId: "time-60",
  wordSetId: "english-200",
  activeDurationMs: 6000,
  words: [
    { index: 1, expected: "the", typed: "the", exact: true, durationMs: 450, effectiveChars: 4, rawChars: 4, incorrectChars: 0, missingCharacters: 0, errors: 0, backspaces: 0, wordDeletes: 0, wpm: 106.7, rawWpm: 106.7, accuracy: 100, clean: true },
    { index: 2, expected: "quick", typed: "quick", exact: true, durationMs: 720, effectiveChars: 6, rawChars: 6, incorrectChars: 0, missingCharacters: 0, errors: 0, backspaces: 0, wordDeletes: 0, wpm: 100, rawWpm: 100, accuracy: 100, clean: true },
    { index: 3, expected: "brown", typed: "brown", exact: true, durationMs: 1000, effectiveChars: 6, rawChars: 7, incorrectChars: 1, missingCharacters: 0, errors: 1, backspaces: 1, wordDeletes: 0, wpm: 72, rawWpm: 84, accuracy: 85.7, clean: false },
    { index: 4, expected: "fox", typed: "fox", exact: true, durationMs: 520, effectiveChars: 4, rawChars: 4, incorrectChars: 0, missingCharacters: 0, errors: 0, backspaces: 0, wordDeletes: 0, wpm: 92.3, rawWpm: 92.3, accuracy: 100, clean: true },
    { index: 5, expected: "because", typed: "becaus", exact: false, durationMs: 1500, effectiveChars: 6, rawChars: 9, incorrectChars: 1, missingCharacters: 1, errors: 2, backspaces: 2, wordDeletes: 0, wpm: 48, rawWpm: 72, accuracy: 75, clean: false },
    { index: 6, expected: "jumps", typed: "jumps", exact: true, durationMs: 760, effectiveChars: 6, rawChars: 6, incorrectChars: 0, missingCharacters: 0, errors: 0, backspaces: 0, wordDeletes: 0, wpm: 94.7, rawWpm: 94.7, accuracy: 100, clean: true },
  ],
};

const timeline = {
  version: 1,
  bucketMs: 1000,
  activeDurationMs: 6000,
  points: Array.from({ length: 6 }, (_, index) => ({ second: index + 1, durationMs: 1000, wpm: 80, rawWpm: 88 })),
  mistakes: [
    { timeMs: 2100, second: 3, type: "incorrect", count: 1, expected: "o", typed: "i", word: "brown" },
    { timeMs: 4300, second: 5, type: "extra", count: 1, expected: "", typed: "e", word: "because" },
    { timeMs: 4900, second: 5, type: "missed", count: 2, expected: "se", typed: "becaus", word: "because" },
  ],
};

const analysis = buildPerformanceV4Analysis(profile, timeline, { wpm: 80 });
assert.equal(analysis.version, 4);
assert.equal(analysis.wordCount, 6);
assert.equal(analysis.cleanWords, 4);
assert.equal(analysis.cleanPercent, 66.7);
assert.equal(analysis.longestCleanStreak, 2);
assert.equal(analysis.correctionsPerWord, 0.5);
assert.equal(analysis.medianWordWpm, 93.5);
assert.equal(analysis.problems[0].word, "because");
assert.equal(analysis.words[4].paceBand, "drop");
assert.equal(analysis.fingerprint.total, 4);
assert.equal(analysis.fingerprint.breakdown.incorrect, 1);
assert.equal(analysis.fingerprint.breakdown.extra, 1);
assert.equal(analysis.fingerprint.breakdown.missed, 2);
assert.ok(analysis.fingerprint.confusions.length >= 3);
assert.match(analysis.insight, /because/i);
assert.match(analysis.insight, /clean/i);

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.match(index, /js\/speedTestPerformanceV4\.js\?v=20260911a/);
assert.doesNotMatch(index, /<link[^>]+typing-performance-v4\.css/,
  "V4 styling should remain lazy so unrelated screens keep certified default pixels");

const submission = readFileSync(new URL("../js/leaderboardSubmissionService.js", import.meta.url), "utf8");
assert.doesNotMatch(submission, /wordProfile|performanceV4|problemWords|mistakeFingerprint/,
  "V4 deep-dive analytics must remain outside ranked leaderboard payloads");

console.log("Typing Performance Timeline V4 word pace, friction, mistake fingerprint, and ranked-data isolation passed.");
