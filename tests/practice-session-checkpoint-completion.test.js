import assert from "node:assert/strict";
import {
  createPracticeSessionEngine,
  restorePracticeSessionEngine,
} from "../js/practiceLab/practiceSessionEngine.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";
import { validateSessionSummary } from "../js/practiceLab/practiceValidation.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";

const harness = await createPracticeSessionHarness({ suffix: "complete", text: "abc" });
const events = [];
const engine = createPracticeSessionEngine({
  repository: harness.repository,
  sessionId: harness.sessionId,
  profileId: harness.profileId,
  clock: harness.time.clock,
  wallClock: harness.time.wallClock,
  scheduler: harness.time.scheduler,
});
engine.subscribe((_snapshot, event) => events.push(event));
engine.subscribe(() => { throw new Error("listener isolation"); });
await engine.prepare({
  experiment: harness.experiment,
  configuration: { timingMode: "on-start", correctionBehavior: "allow" },
  contentPlan: harness.contentPlan,
});
await engine.start();
await harness.time.advance(1000, { runTimers: false });
engine.handleInput(harness.input("character", "a"));
assert.equal(harness.time.timerCount, 1);
await harness.time.advance(14_000);
assert.equal((await harness.repository.getActiveCheckpoint()) != null, true);
assert.equal(engine.getDiagnostics().checkpointWriteCount, 1);

await engine.pause("manual");
const checkpoint = await harness.repository.getActiveCheckpoint();
assert.equal(checkpoint.metricsSnapshot.recentInputTail.length, 1);
assert.equal("rawEvents" in checkpoint, false);

const restored = await restorePracticeSessionEngine({
  checkpoint,
  experimentDescriptor: harness.experiment,
  repository: harness.repository,
  clock: harness.time.clock,
  wallClock: harness.time.wallClock,
  scheduler: harness.time.scheduler,
});
assert.equal(restored.getSnapshot().lifecycleState, "paused");
assert.equal(restored.getSnapshot().typedLength, 1);
await restored.resume();
await harness.time.advance(100);
restored.handleInput(harness.input("character", "b"));
restored.handleInput(harness.input("character", "c"));

const completedEvents = [];
restored.subscribe((_snapshot, event) => completedEvents.push(event));
const [first, second] = await Promise.all([
  restored.complete("manual-stop"),
  restored.complete("manual-stop"),
]);
assert.equal(first.summary.sessionId, second.summary.sessionId);
assert.equal(validateSessionSummary(first.summary).valid, true);
assert.equal("leaderboardEligible" in first.summary, false);
assert.equal("rawEvents" in first.summary, false);
assert.equal((await harness.repository.listSessionSummaries()).length, 1);
assert.equal(await harness.repository.getActiveCheckpoint(), null);
assert.equal((await harness.repository.getPracticeProfile()).totalCompletedSessions, 1);
assert.equal((await harness.repository.getPracticeProfile()).activeTrainingDays, 1);
assert.equal(completedEvents.filter((event) => event === "completed").length, 1);
assert.equal((await restored.complete()).summary.sessionId, first.summary.sessionId);
assert.equal((await harness.repository.getPracticeProfile()).activeTrainingDays, 1);

async function completeAnotherSession(suffix) {
  const next = createPracticeSessionEngine({
    repository: harness.repository,
    sessionId: createPracticeId("session", { uuid: () => `${suffix}-12345678` }),
    profileId: harness.profileId,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });
  await next.prepare({
    experiment: harness.experiment,
    configuration: { timingMode: "on-start", correctionBehavior: "allow" },
    contentPlan: harness.contentPlan,
  });
  await next.start();
  const [a, b] = await Promise.all([next.complete("manual-stop"), next.complete("manual-stop")]);
  assert.equal(a.summary.sessionId, b.summary.sessionId);
}

await completeAnotherSession("same-day-session");
assert.equal((await harness.repository.getPracticeProfile()).activeTrainingDays, 1);
await harness.time.advance(24 * 60 * 60 * 1000, { runTimers: false });
await completeAnotherSession("next-day-session");
const multiDayProfile = await harness.repository.getPracticeProfile();
assert.equal(multiDayProfile.activeTrainingDays, 2);
assert.equal(multiDayProfile.totalCompletedSessions, 3);
await assert.rejects(restored.resume(), (error) => error.code === "PRACTICE_SESSION_INVALID_STATE");
assert.equal((await restored.destroy()).destroyed, true);
assert.equal((await restored.destroy()).repeated, true);
assert.equal(restored.handleInput(harness.input("character", "a")).reason, "destroyed");

const mismatch = { ...checkpoint, contentHash: "wrong" };
await assert.rejects(
  restorePracticeSessionEngine({
    checkpoint: mismatch,
    experimentDescriptor: harness.experiment,
    repository: harness.repository,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  }),
  (error) => error.code === "PRACTICE_SESSION_RESTORE_FAILED",
);

console.log("Practice checkpoint cadence/payload/restore, atomic completion, concurrency, idempotence, profile update, and cleanup passed.");
