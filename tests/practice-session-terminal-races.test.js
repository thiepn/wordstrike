import assert from "node:assert/strict";
import { createPracticeSessionEngine } from "../js/practiceLab/practiceSessionEngine.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

async function engineFor(harness, options = {}) {
  const engine = createPracticeSessionEngine({
    repository: options.repository || harness.repository,
    sessionId: harness.sessionId,
    profileId: harness.profileId,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });
  await engine.prepare({
    experiment: harness.experiment,
    configuration: { timingMode: "on-start", correctionBehavior: "allow" },
    contentPlan: harness.contentPlan,
  });
  await engine.start();
  return engine;
}

const below = await createPracticeSessionHarness({ suffix: "below", text: "abcdefghijklmnopqrstuvwxyz" });
const belowEngine = await engineFor(below);
belowEngine.handleInput(below.input("character", "a"));
await belowEngine.flushCheckpoint("manual");
const belowResult = await belowEngine.abandon("manual-stop");
assert.equal(belowResult.persisted, false);
assert.equal((await below.repository.listSessionSummaries()).length, 0);
assert.equal((await below.repository.getPracticeProfile()).totalPracticeDurationMs, 0);
assert.equal(await below.repository.getActiveCheckpoint(), null);

const meaningful = await createPracticeSessionHarness({ suffix: "meaningful", text: "aaaaaaaaaaaaaaaaaaaaaaaaa" });
const meaningfulEngine = await engineFor(meaningful);
for (let index = 0; index < 20; index += 1) meaningfulEngine.handleInput(meaningful.input("character", "a"));
const abandoned = await meaningfulEngine.abandon("manual-stop");
assert.equal(abandoned.summary.status, "abandoned");
assert.equal((await meaningful.repository.getPracticeProfile()).totalCompletedSessions, 0);
assert.equal((await meaningful.repository.getPracticeProfile()).activeTrainingDays, 1);
assert.equal((await meaningful.repository.listSkillStats()).length, 0);
assert.equal((await meaningful.repository.listDueReviewItems()).length, 0);

const timed = await createPracticeSessionHarness({ suffix: "timed-abandon", text: "abc" });
const timedEngine = await engineFor(timed);
await timed.time.advance(30_000, { runTimers: false });
const timedAbandon = await timedEngine.abandon("manual-stop");
assert.equal(timedAbandon.summary.status, "abandoned");
assert.equal((await timed.repository.getPracticeProfile()).totalPracticeDurationMs, 30_000);

const interruptedHarness = await createPracticeSessionHarness({ suffix: "interrupted", text: "abc" });
const interrupted = await engineFor(interruptedHarness);
interrupted.handleInput(interruptedHarness.input("character", "a"));
await interrupted.interrupt("refresh-interruption");
assert.equal(interrupted.getSnapshot().lifecycleState, "interrupted");
assert.ok(await interruptedHarness.repository.getActiveCheckpoint());
assert.equal((await interruptedHarness.repository.listSessionSummaries()).length, 0);
assert.equal((await interruptedHarness.repository.getPracticeProfile()).totalCompletedSessions, 0);

const raceHarness = await createPracticeSessionHarness({ suffix: "race", text: "abc" });
let checkpointWrites = 0;
let releaseWrite;
const delayedRepository = {
  ...raceHarness.repository,
  async saveActiveCheckpoint(checkpoint) {
    checkpointWrites += 1;
    await new Promise((resolve) => { releaseWrite = resolve; });
    return raceHarness.repository.saveActiveCheckpoint(checkpoint);
  },
};
const race = await engineFor(raceHarness, { repository: delayedRepository });
race.handleInput(raceHarness.input("character", "a"));
const forcedA = race.flushCheckpoint("manual");
const forcedB = race.flushCheckpoint("manual");
await Promise.resolve();
assert.equal(checkpointWrites, 1);
releaseWrite();
await Promise.all([forcedA, forcedB]);
assert.ok(checkpointWrites <= 2);
const completion = race.complete("manual-stop");
await completion;
assert.equal(await raceHarness.repository.getActiveCheckpoint(), null);

const destroyHarness = await createPracticeSessionHarness({ suffix: "destroy", text: "abc" });
const destroyEngine = await engineFor(destroyHarness);
destroyEngine.handleInput(destroyHarness.input("character", "a"));
assert.equal(destroyHarness.time.timerCount, 1);
const destroyed = await destroyEngine.destroy();
assert.ok(destroyed.warning);
assert.equal(destroyHarness.time.timerCount, 0);
await destroyHarness.time.advance(20_000);
assert.equal((await destroyHarness.repository.listSessionSummaries()).length, 0);

const retryHarness = await createPracticeSessionHarness({ suffix: "retry", text: "abc" });
let commitAttempts = 0;
const retryRepository = {
  ...retryHarness.repository,
  async commitCompletedPracticeSession(payload) {
    commitAttempts += 1;
    if (commitAttempts === 1) throw new Error("recoverable commit failure");
    return retryHarness.repository.commitCompletedPracticeSession(payload);
  },
};
const retryEngine = await engineFor(retryHarness, { repository: retryRepository });
retryEngine.handleInput(retryHarness.input("character", "a"));
await assert.rejects(retryEngine.complete("manual-stop"), (error) => error.code === "PRACTICE_SESSION_COMMIT_FAILED");
assert.equal(retryEngine.getSnapshot().lifecycleState, "paused");
const retried = await retryEngine.complete("manual-stop");
assert.equal(retried.summary.status, "completed");
assert.equal(commitAttempts, 2);
assert.equal((await retryHarness.repository.getPracticeProfile()).totalCompletedSessions, 1);

for (const [mode, value, suffix] of [
  ["duration", 1000, "duration"],
  ["word-count", 1, "wordcount"],
  ["content", null, "content"],
]) {
  const completionHarness = await createPracticeSessionHarness({
    suffix,
    text: mode === "duration" ? "abc" : "a",
    completion: { mode, value },
  });
  const completionEngine = await engineFor(completionHarness);
  if (mode === "duration") {
    await completionHarness.time.advance(1000, { runTimers: false });
    assert.equal((await completionEngine.tick()).completed, true);
  } else {
    const insertion = completionEngine.handleInput(completionHarness.input("character", "a"));
    assert.equal(insertion.sessionCompleted, true);
    await completionEngine.complete(mode === "content" ? "content-complete" : "word-target-complete");
  }
  assert.equal(completionEngine.getSnapshot().lifecycleState, "completed");
}

const dirtyHarness = await createPracticeSessionHarness({ suffix: "dirty-checkpoint", text: "abc" });
let releaseCheckpoint;
const dirtyRepository = {
  ...dirtyHarness.repository,
  saveActiveCheckpoint(record) {
    return new Promise((resolve) => {
      releaseCheckpoint = async () => resolve(await dirtyHarness.repository.saveActiveCheckpoint(record));
    });
  },
};
const dirtyEngine = await engineFor(dirtyHarness, { repository: dirtyRepository });
dirtyEngine.handleInput(dirtyHarness.input("character", "a"));
const pendingCheckpoint = dirtyEngine.flushCheckpoint("manual", { force: true });
await Promise.resolve();
dirtyEngine.handleInput(dirtyHarness.input("character", "b"));
await releaseCheckpoint();
await pendingCheckpoint;
assert.equal(dirtyEngine.getSnapshot().checkpoint.dirty, true);
assert.equal(dirtyHarness.time.timerCount, 1);

console.log("Practice abandonment thresholds, interruption, forced-checkpoint coalescing, completion precedence, and destroy races passed.");
