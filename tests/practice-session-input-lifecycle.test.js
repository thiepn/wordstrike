import assert from "node:assert/strict";
import { createPracticeSessionEngine } from "../js/practiceLab/practiceSessionEngine.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

const harness = await createPracticeSessionHarness({ suffix: "lifecycle", text: "ab cd" });
const engine = createPracticeSessionEngine({
  repository: harness.repository,
  sessionId: harness.sessionId,
  profileId: harness.profileId,
  clock: harness.time.clock,
  wallClock: harness.time.wallClock,
  scheduler: harness.time.scheduler,
});
await assert.rejects(engine.start(), (error) => error.code === "PRACTICE_SESSION_INVALID_STATE");
await engine.prepare({
  experiment: harness.experiment,
  configuration: { timingMode: "on-first-input", correctionBehavior: "allow" },
  contentPlan: harness.contentPlan,
});
assert.equal(engine.getSnapshot().lifecycleState, "ready");
assert.equal(engine.handleInput(harness.input("character", "a")).reason, "session-not-active");
await engine.start();
await harness.time.advance(1000, { runTimers: false });
let result = engine.handleInput(harness.input("character", "a"));
assert.equal(result.accepted, true);
assert.equal(result.correctness, "correct");
assert.equal(engine.getSnapshot().timing.performanceTimingStarted, true);
assert.equal(engine.getMetricsSnapshot().firstInputLatencyMs, 1000);
await harness.time.advance(100);
result = engine.handleInput(harness.input("character", "x"));
assert.equal(result.correctness, "incorrect");
assert.deepEqual(engine.getSnapshot().errorPositions, [1]);
result = engine.handleInput(harness.input("backspace"));
assert.equal(result.reason, "character-deleted");
assert.deepEqual(engine.getSnapshot().errorPositions, []);
assert.equal(engine.getMetricsSnapshot().correctedIncorrectCharacters, 1);

await engine.pause("manual");
assert.equal(engine.getSnapshot().lifecycleState, "paused");
const pausedDuration = engine.getMetricsSnapshot().activeDurationMs;
await harness.time.advance(5000, { runTimers: false });
assert.equal(engine.getMetricsSnapshot().activeDurationMs, pausedDuration);
assert.equal((await engine.pause()).lifecycleState, "paused");
assert.equal(engine.handleInput(harness.input("character", "b")).reason, "session-not-active");
await engine.resume();
assert.equal((await engine.resume()).lifecycleState, "active");
await harness.time.advance(100);
engine.handleInput(harness.input("character", "b"));
engine.handleInput(harness.input("space"));
engine.handleInput(harness.input("character", "c"));
engine.handleInput(harness.input("character", "d"));
assert.equal(engine.getSnapshot().completedUnitCount, 2);

await engine.handleVisibilityState("hidden");
assert.equal(engine.getSnapshot().lifecycleState, "paused");
assert.equal(engine.getSnapshot().pauseReason, "visibility-hidden");
await engine.handleVisibilityState("visible");
assert.equal(engine.getSnapshot().lifecycleState, "paused");
await engine.resume();

const wordDelete = engine.handleInput(harness.input("word-delete"));
assert.equal(wordDelete.reason, "word-deleted");
assert.ok(wordDelete.removed.length >= 1);

const ignoredHarness = await createPracticeSessionHarness({ suffix: "ignore", text: "😀é" });
const ignored = createPracticeSessionEngine({
  repository: ignoredHarness.repository,
  sessionId: ignoredHarness.sessionId,
  profileId: ignoredHarness.profileId,
  clock: ignoredHarness.time.clock,
  wallClock: ignoredHarness.time.wallClock,
  scheduler: ignoredHarness.time.scheduler,
});
await ignored.prepare({ experiment: ignoredHarness.experiment, configuration: { correctionBehavior: "ignore" }, contentPlan: ignoredHarness.contentPlan });
await ignored.start();
assert.equal(ignored.handleInput(ignoredHarness.input("character", "😀")).accepted, true);
assert.equal(ignored.handleInput(ignoredHarness.input("backspace")).reason, "correction-ignored");
assert.equal(ignored.getSnapshot().typedLength, 1);

const disabledHarness = await createPracticeSessionHarness({ suffix: "disabled", text: "é" });
const disabled = createPracticeSessionEngine({
  repository: disabledHarness.repository,
  sessionId: disabledHarness.sessionId,
  profileId: disabledHarness.profileId,
  clock: disabledHarness.time.clock,
  wallClock: disabledHarness.time.wallClock,
  scheduler: disabledHarness.time.scheduler,
});
await disabled.prepare({ experiment: disabledHarness.experiment, configuration: { correctionBehavior: "disabled" }, contentPlan: disabledHarness.contentPlan });
await disabled.start();
disabled.handleInput(disabledHarness.input("character", "é"));
assert.equal(disabled.handleInput(disabledHarness.input("backspace")).reason, "correction-disabled");
assert.equal(disabled.getMetricsSnapshot().correctionInputs, 0);

console.log("Practice lifecycle, first-input timing, input comparison, Unicode, correction policies, pause/resume, words, and visibility passed.");
