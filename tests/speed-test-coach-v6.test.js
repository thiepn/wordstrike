import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  activateTypingCoachPlan,
  buildTypingCoachV6,
  completeTypingCoachRetest,
  getTypingCoachCycleForRetestSession,
  loadActiveTypingCoachCycle,
  markTypingCoachPracticeCompleted,
  markTypingCoachRetestRequested,
  summarizeTypingCoachProfile,
  TYPING_COACH_V6_ACTIVE_KEY,
  TYPING_COACH_V6_HISTORY_KEY,
} from "../js/speedTestCoachV6.js";

const memory = new Map();
globalThis.localStorage = {
  getItem(key) { return memory.has(key) ? memory.get(key) : null; },
  setItem(key, value) { memory.set(key, String(value)); },
  removeItem(key) { memory.delete(key); },
};

function word(expected, { wpm = 80, errors = 0, corrections = 0, clean = true } = {}) {
  return {
    index: 1,
    expected,
    typed: expected,
    durationMs: 800,
    effectiveChars: expected.length + 1,
    rawChars: expected.length + 1 + errors,
    errors,
    backspaces: corrections,
    wordDeletes: 0,
    wpm,
    rawWpm: wpm + 5,
    accuracy: errors ? 90 : 100,
    clean,
  };
}

const result = {
  sessionId: "current",
  endedAt: 300,
  wpm: 82,
  accuracy: 98.2,
  modeData: { configId: "time-60", wordSetId: "english-200", rawWpm: 88 },
};
const currentProfile = {
  words: [
    word("because", { wpm: 52, errors: 1, corrections: 1, clean: false }),
    word("through", { wpm: 60, clean: false }),
    word("people", { wpm: 90 }),
  ],
};
const samples = [
  {
    sessionId: "previous",
    endedAt: 100,
    wpm: 78,
    accuracy: 97.5,
    rawWpm: 84,
    cleanPercent: 67,
    correctionsPerWord: 0.33,
    profile: { words: [word("because", { wpm: 48, errors: 1, corrections: 1, clean: false }), word("people", { wpm: 82 })] },
    timeline: { mistakes: [{ type: "incorrect", expected: "e", typed: "r", count: 2 }] },
  },
  {
    sessionId: "current",
    endedAt: 300,
    wpm: 82,
    accuracy: 98.2,
    rawWpm: 88,
    cleanPercent: 33.3,
    correctionsPerWord: 0.33,
    profile: currentProfile,
    timeline: { mistakes: [{ type: "incorrect", expected: "e", typed: "r", count: 2 }] },
  },
];

const summary = summarizeTypingCoachProfile(currentProfile);
assert.equal(summary.wordCount, 3);
assert.equal(summary.cleanWords, 1);
assert.equal(summary.correctionsPerWord, 0.33);

const coach = buildTypingCoachV6({ samples, result, profile: currentProfile });
assert.equal(coach.version, 6);
assert.equal(coach.primaryDrillType, "weak-words");
assert.equal(coach.primaryDrill.experimentId, "problem-words");
assert.equal(coach.primaryDrill.target, "because");
assert.ok(coach.drills.some((drill) => drill.type === "mistake-patterns" && drill.target === "e"));
assert.ok(coach.drills.some((drill) => drill.type === "accuracy-recovery"));
assert.ok(coach.focusWords.includes("because"));

const correctionHeavyProfile = { words: [
  word("their", { corrections: 2, clean: false }),
  word("before", { corrections: 2, clean: false }),
] };
const correctionHeavy = buildTypingCoachV6({
  samples: [{
    sessionId: "heavy",
    endedAt: 1,
    wpm: 70,
    accuracy: 95,
    rawWpm: 82,
    cleanPercent: 0,
    correctionsPerWord: 2,
    profile: correctionHeavyProfile,
    timeline: { mistakes: [] },
  }],
  result: { ...result, sessionId: "heavy", wpm: 70, accuracy: 95 },
  profile: correctionHeavyProfile,
});
assert.equal(correctionHeavy.primaryDrillType, "accuracy-recovery");

const cycle = activateTypingCoachPlan(coach, "weak-words");
assert.ok(cycle?.cycleId);
assert.equal(loadActiveTypingCoachCycle().drill.target, "because");
markTypingCoachPracticeCompleted();
markTypingCoachRetestRequested();
const retest = {
  sessionId: "retest",
  wpm: 88,
  accuracy: 99.1,
  modeData: { configId: "time-60", wordSetId: "english-200", rawWpm: 92 },
};
const retestProfile = { words: [word("because", { wpm: 70 }), word("people", { wpm: 95 })] };
const completed = completeTypingCoachRetest(retest, retestProfile);
assert.equal(completed.after.sessionId, "retest");
assert.equal(completed.comparison.wpmDelta, 6);
assert.equal(completed.comparison.accuracyDelta, 0.9);
assert.ok(completed.practiceCompletedAt);
assert.equal(loadActiveTypingCoachCycle(), null);
assert.equal(getTypingCoachCycleForRetestSession("retest")?.cycleId, completed.cycleId);
assert.ok(memory.has(TYPING_COACH_V6_HISTORY_KEY));
assert.ok(!memory.has(TYPING_COACH_V6_ACTIVE_KEY));

memory.set(TYPING_COACH_V6_ACTIVE_KEY, "{not-json");
assert.equal(loadActiveTypingCoachCycle(), null);

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.match(index, /js\/speedTestResultsV6\.js\?v=20260911a/);
assert.doesNotMatch(index, /<link[^>]+typing-coach-v6\.css/,
  "V6 coach styling should remain lazy and not change unrelated screens");
const submission = readFileSync(new URL("../js/leaderboardSubmissionService.js", import.meta.url), "utf8");
assert.doesNotMatch(submission, /typingCoach|coachCycle|focusWords|practiceCompletedAt/,
  "Typing Coach V6 data must stay outside ranked leaderboard payloads");

console.log("Typing Coach V6 recommendations, practice-cycle comparison, storage bounds, and ranked-data isolation passed.");
