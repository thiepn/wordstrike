import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildTypingCoachV7,
  clearTypingCoachV7Plan,
  completeTypingCoachV7Retest,
  ensureTypingCoachV7Plan,
  getTypingCoachV7History,
  getTypingCoachV7Progress,
  isTypingCoachV7StepAvailable,
  loadTypingCoachV7Plan,
  markTypingCoachV7PracticeCompleted,
  markTypingCoachV7RetestRequested,
  markTypingCoachV7StepStarted,
  skipTypingCoachV7Step,
  TYPING_COACH_V7_HISTORY_KEY,
  TYPING_COACH_V7_PLAN_KEY,
} from "../js/speedTestCoachV7.js";

const memory = new Map();
globalThis.localStorage = {
  getItem(key) { return memory.has(key) ? memory.get(key) : null; },
  setItem(key, value) { memory.set(key, String(value)); },
  removeItem(key) { memory.delete(key); },
};

const v6Plan = {
  version: 6,
  sourceSessionId: "source-1",
  configId: "time-60",
  wordSetId: "english-200",
  primaryDrillType: "weak-words",
  primaryDrill: {
    type: "weak-words",
    title: "Weak Words",
    experimentId: "problem-words",
    targetType: "word",
    target: "because",
    rationale: "because is recurring across multiple same-test runs.",
  },
  drills: [
    {
      type: "weak-words",
      title: "Weak Words",
      experimentId: "problem-words",
      targetType: "word",
      target: "because",
      rationale: "because is recurring across multiple same-test runs.",
    },
    {
      type: "mistake-patterns",
      title: "Mistake Patterns",
      experimentId: "weak-keys",
      targetType: "key",
      target: "e",
      rationale: "e→r appeared repeatedly.",
    },
    {
      type: "accuracy-recovery",
      title: "Accuracy Recovery",
      experimentId: "accuracy-control",
      targetType: "word",
      target: "because",
      rationale: "Train a cleaner first pass.",
    },
  ],
  focusWords: ["because", "through", "people"],
  estimatedMinutes: 2,
  baseline: {
    sessionId: "source-1",
    wpm: 82,
    accuracy: 98.2,
    rawWpm: 88,
    cleanPercent: 80,
    correctionsPerWord: 0.2,
  },
  performance: {
    runCount: 4,
    stdDevWpm: 2.6,
  },
};

const plan = buildTypingCoachV7(v6Plan, { now: new Date("2026-09-11T10:00:00Z") });
assert.equal(plan.version, 7);
assert.equal(plan.steps.length, 3);
assert.equal(plan.steps[0].kind, "practice");
assert.equal(plan.steps[0].drill.type, "weak-words");
assert.equal(plan.steps[1].drill.type, "accuracy-recovery");
assert.equal(plan.steps[2].kind, "retest");
assert.equal(plan.snapshot.consistency, "Stable");
assert.equal(plan.snapshot.sameTestRuns, 4);
assert.equal(plan.estimatedMinutes, 5);
assert.deepEqual(plan.focusWords, ["because", "through", "people"]);

const saved = ensureTypingCoachV7Plan(v6Plan, { now: new Date("2026-09-11T10:00:00Z") });
assert.ok(saved?.planId);
assert.equal(loadTypingCoachV7Plan()?.sourceSessionId, "source-1");
assert.equal(getTypingCoachV7Progress(saved).completed, 0);
assert.equal(isTypingCoachV7StepAvailable(saved, "focus"), true);
assert.equal(isTypingCoachV7StepAvailable(saved, "reinforce"), false);
assert.equal(isTypingCoachV7StepAvailable(saved, "verify"), false);

const started = markTypingCoachV7StepStarted("focus");
assert.equal(started.steps[0].status, "active");
const firstDone = markTypingCoachV7PracticeCompleted({
  sourceSessionId: "source-1",
  drillType: "weak-words",
  target: "because",
});
assert.equal(firstDone.steps[0].status, "complete");
assert.equal(isTypingCoachV7StepAvailable(firstDone, "reinforce"), true);
assert.equal(getTypingCoachV7Progress(firstDone).completed, 1);

const skipped = skipTypingCoachV7Step("reinforce");
assert.equal(skipped.steps[1].status, "skipped");
assert.equal(getTypingCoachV7Progress(skipped).practiceResolved, true);
assert.equal(isTypingCoachV7StepAvailable(skipped, "verify"), true);

const requested = markTypingCoachV7RetestRequested();
assert.ok(requested.retestRequestedAt);
assert.equal(requested.steps.at(-1).status, "requested");

const completed = completeTypingCoachV7Retest({
  sessionId: "retest-1",
  wpm: 88,
  accuracy: 99.1,
  modeData: { configId: "time-60", wordSetId: "english-200" },
}, {
  sourceSessionId: "source-1",
  after: { sessionId: "retest-1" },
  comparison: {
    wpmDelta: 6,
    accuracyDelta: 0.9,
    cleanDelta: 15,
    correctionsDelta: -0.12,
  },
});
assert.equal(completed.status, "completed");
assert.equal(completed.retestSessionId, "retest-1");
assert.equal(completed.steps.at(-1).status, "complete");
assert.equal(completed.comparison.wpmDelta, 6);
assert.equal(getTypingCoachV7Progress(completed).completed, 3);
assert.equal(getTypingCoachV7History().length, 1);
assert.ok(memory.has(TYPING_COACH_V7_HISTORY_KEY));

const retestV6Plan = { ...v6Plan, sourceSessionId: "retest-1" };
assert.equal(ensureTypingCoachV7Plan(retestV6Plan)?.planId, completed.planId,
  "The completed plan should remain visible on its retest result instead of immediately being replaced.");

memory.set(TYPING_COACH_V7_PLAN_KEY, "{not-json");
assert.equal(loadTypingCoachV7Plan(), null);
clearTypingCoachV7Plan();
assert.equal(memory.has(TYPING_COACH_V7_PLAN_KEY), false);

const accuracyFirst = buildTypingCoachV7({
  ...v6Plan,
  sourceSessionId: "source-2",
  primaryDrillType: "accuracy-recovery",
});
assert.equal(accuracyFirst.steps[0].drill.type, "accuracy-recovery");
assert.equal(accuracyFirst.steps[1].drill.type, "weak-words");

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const resultsFeature = readFileSync(new URL("../js/speedTestResultsFeature.js", import.meta.url), "utf8");
assert.match(index, /js\/appBootstrap\.js\?v=20260911v8/,
  "V7 should load through the semantic V8 application bootstrap");
assert.match(resultsFeature, /import "\.\/speedTestResultsV7\.js";/,
  "V7 adaptive training results must remain in the semantic results feature chain");
assert.doesNotMatch(index, /<link[^>]+typing-coach-v7\.css/,
  "V7 styling should stay lazy and not affect unrelated screens");
const submission = readFileSync(new URL("../js/leaderboardSubmissionService.js", import.meta.url), "utf8");
assert.doesNotMatch(submission, /typing_coach_v7|adaptiveTrainingPlan|retestRequestedAt/,
  "Typing Coach V7 plan state must stay outside ranked leaderboard payloads");

console.log("Typing Coach V7 adaptive plan ordering, progression, persistence, semantic bootstrap, retest completion, and ranked-data isolation passed.");
