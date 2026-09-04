import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPracticeSessionEngine,
  restorePracticeSessionEngine,
} from "../js/practiceLab/practiceSessionEngine.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

function createEngine(harness) {
  return createPracticeSessionEngine({
    repository: harness.repository,
    sessionId: harness.sessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });
}

async function advanceAndInput(engine, harness, milliseconds, type, value = "") {
  await harness.time.advance(milliseconds, { runTimers: false });
  return engine.handleInput(harness.input(type, value));
}

test("PL9 live events carry cursor/removal metadata and generic sessions persist canonical errorSummary", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl9-live", text: "aaaaaa" });
  const engine = createEngine(harness);
  await engine.prepare({ experiment: harness.experiment, configuration: {}, contentPlan: harness.contentPlan });
  await engine.start();
  engine.handleInput(harness.input("character", "a"));
  await advanceAndInput(engine, harness, 100, "character", "x");
  await advanceAndInput(engine, harness, 100, "backspace");
  await advanceAndInput(engine, harness, 50, "character", "a");
  await advanceAndInput(engine, harness, 50, "character", "a");
  const beforeComplete = engine.getMetricsSnapshot();
  const result = await engine.complete("manual-stop");

  assert.equal(result.summary.recordVersion, 4);
  assert.equal(result.summary.errorSummary.errorEpisodeCount, 1);
  assert.equal(result.summary.errorSummary.correctedEpisodeCount, 1);
  assert.equal(result.summary.errorSummary.incorrectCharactersRemoved, 1);
  assert.equal(result.summary.errorSummary.correctCharactersRemoved, 0);
  assert.equal(result.summary.correctedErrorCount, beforeComplete.correctedIncorrectCharacters);
  assert.equal(result.summary.wpm, beforeComplete.wpm);
  assert.equal(result.summary.rawWpm, beforeComplete.rawWpm);
  assert.equal(result.summary.accuracy, beforeComplete.accuracy);

  const trace = engine.getEventTrace();
  const wrong = trace.find((event) => event.correctness === "incorrect");
  const correction = trace.find((event) => event.type === "backspace");
  assert.equal(wrong.cursorAfter, wrong.cursorBefore + 1);
  assert.equal(correction.cursorBefore, 2);
  assert.equal(correction.cursorAfter, 1);
  assert.equal(correction.removedCount, 1);
  assert.equal(correction.removedIncorrectCount, 1);
  assert.equal(correction.removedCorrectCount, 0);
  assert.equal(correction.removedStartPosition, 1);
  assert.equal(correction.eventTraceVersion, 3);
  assert.equal(Object.hasOwn(result.summary, "eventTrace"), false);
  assert.equal(Object.hasOwn(result.summary, "errorEpisodes"), false);
});

test("PL9 experiment analyzers receive frozen errors but cannot overwrite canonical errorSummary", async () => {
  let received = null;
  let mutationThrew = false;
  const harness = await createPracticeSessionHarness({
    suffix: "pl9-analyzer",
    text: "aaaaaa",
    experimentOverrides: {
      async analyzeResult(input) {
        received = input;
        try { input.foundationAnalysis.errors.sessionSummary.errorEpisodeCount = 999; } catch { mutationThrew = true; }
        return {
          errorSummary: { fake: true },
          beforeMetrics: { analyzerWorked: true },
        };
      },
    },
  });
  const engine = createEngine(harness);
  await engine.prepare({ experiment: harness.experiment, configuration: {}, contentPlan: harness.contentPlan });
  await engine.start();
  engine.handleInput(harness.input("character", "x"));
  await advanceAndInput(engine, harness, 50, "backspace");
  await advanceAndInput(engine, harness, 50, "character", "a");
  await advanceAndInput(engine, harness, 50, "character", "a");
  const result = await engine.complete("manual-stop");

  assert.ok(received?.foundationAnalysis?.errors);
  assert.equal(received.foundationAnalysis.version, 2);
  assert.equal(Object.isFrozen(received.foundationAnalysis), true);
  assert.equal(Object.isFrozen(received.foundationAnalysis.errors), true);
  assert.equal(mutationThrew, true);
  assert.equal(result.summary.beforeMetrics.analyzerWorked, true);
  assert.equal(result.summary.errorSummary.fake, undefined);
  assert.equal(result.summary.errorSummary.errorEpisodeCount, 1);
});

test("PL9 active bounded error tracker state survives checkpoint restore without cross-restore invention", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl9-restore", text: "aaaaaa" });
  const engine = createEngine(harness);
  await engine.prepare({ experiment: harness.experiment, configuration: {}, contentPlan: harness.contentPlan });
  await engine.start();
  engine.handleInput(harness.input("character", "a"));
  await advanceAndInput(engine, harness, 100, "character", "x");
  await engine.flushCheckpoint("test", { force: true });
  const checkpoint = await harness.repository.getActiveCheckpoint(harness.profileId);
  assert.equal(checkpoint.recordVersion, 2);
  assert.equal(checkpoint.metricsSnapshot.errorTrackerSnapshot.trackerVersion, 1);
  assert.ok(checkpoint.metricsSnapshot.errorTrackerSnapshot.activeEpisode);

  const restored = await restorePracticeSessionEngine({
    checkpoint,
    experimentDescriptor: harness.experiment,
    repository: harness.repository,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });
  await restored.resume();
  await advanceAndInput(restored, harness, 50, "backspace");
  await advanceAndInput(restored, harness, 50, "character", "a");
  await advanceAndInput(restored, harness, 50, "character", "a");
  const result = await restored.complete("manual-stop");
  assert.equal(result.summary.errorSummary.errorEpisodeCount, 1);
  assert.equal(result.summary.errorSummary.correctedEpisodeCount, 1);
  assert.equal(result.summary.errorSummary.coverage.aggregateScope, "complete-session");
  assert.equal(result.summary.errorSummary.incorrectCharactersRemoved, 1);
});

test("PL9 legacy checkpoint without tracker state restores with a fresh post-restore analysis boundary", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl9-legacy-restore", text: "aaaaaa" });
  const engine = createEngine(harness);
  await engine.prepare({ experiment: harness.experiment, configuration: {}, contentPlan: harness.contentPlan });
  await engine.start();
  engine.handleInput(harness.input("character", "a"));
  await engine.flushCheckpoint("legacy", { force: true });
  const checkpoint = structuredClone(await harness.repository.getActiveCheckpoint(harness.profileId));
  delete checkpoint.metricsSnapshot.errorTrackerSnapshot;

  const restored = await restorePracticeSessionEngine({
    checkpoint,
    experimentDescriptor: harness.experiment,
    repository: harness.repository,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });
  await restored.resume();
  await advanceAndInput(restored, harness, 50, "character", "a");
  const result = await restored.complete("manual-stop");
  assert.equal(result.summary.errorSummary.coverage.aggregateScope, "post-restore");
  assert.equal(result.summary.errorSummary.errorEpisodeCount, 0);
});
