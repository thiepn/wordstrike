import test from "node:test";
import assert from "node:assert/strict";
import {
  createPracticeSessionEngine,
  restorePracticeSessionEngine,
} from "../js/practiceLab/practiceSessionEngine.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

async function typeCorrect(engine, harness, count, latencyMs = 100) {
  for (let index = 0; index < count; index += 1) {
    if (index > 0) await harness.time.advance(latencyMs, { runTimers: false });
    const outcome = engine.handleInput(harness.input("character", "a"));
    assert.equal(outcome.accepted, true);
  }
}

test("generic sessions persist canonical fluencySummary inside the current PL18 session v11 envelope", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl8-generic", text: "a".repeat(40) });
  const engine = createPracticeSessionEngine({
    repository: harness.repository,
    sessionId: harness.sessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });
  await engine.prepare({ experiment: harness.experiment, configuration: {}, contentPlan: harness.contentPlan });
  await engine.start();
  await typeCorrect(engine, harness, 26);
  const result = await engine.complete("manual-stop");
  assert.equal(result.summary.recordVersion, 11);
  assert.equal(result.summary.retentionReviewSummary, null);
  assert.equal(result.summary.evaluationSummary, null);
  assert.equal(result.summary.fluencySummary.calibration.status, "adaptive");
  assert.equal(result.summary.fluencySummary.fluentTransitionCount, 25);
  assert.equal(result.summary.fluencySummary.disfluentTransitionCount, 0);
  assert.equal(result.summary.fluencySummary.excludedReasons.segmentStart, 1);
  assert.equal(result.summary.fluencySummary.coverage.scope, "complete-session");
  assert.equal(Object.hasOwn(result.summary, "eventTrace"), false);
  assert.equal(Object.hasOwn(result.summary, "classifiedEventTrace"), false);
});

test("experiment analyzers receive immutable PL18 foundation v9 analysis but cannot own fluencySummary", async () => {
  let received = null;
  let mutationThrew = false;
  const harness = await createPracticeSessionHarness({
    suffix: "pl8-analyzer",
    text: "a".repeat(40),
    experimentOverrides: {
      async analyzeResult(input) {
        received = input;
        try { input.foundationAnalysis.latency.sessionSummary.thresholdMs = 999; } catch { mutationThrew = true; }
        return {
          fluencySummary: { fake: true },
          beforeMetrics: { analyzerWorked: true },
        };
      },
    },
  });
  const engine = createPracticeSessionEngine({
    repository: harness.repository,
    sessionId: harness.sessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });
  await engine.prepare({ experiment: harness.experiment, configuration: {}, contentPlan: harness.contentPlan });
  await engine.start();
  await typeCorrect(engine, harness, 26);
  const result = await engine.complete("manual-stop");
  assert.ok(received?.foundationAnalysis?.latency);
  assert.equal(received.foundationAnalysis.version, 9);
  assert.equal(received.foundationAnalysis.retention.status, "not-requested");
  assert.equal(received.foundationAnalysis.evaluation.status, "not-requested");
  assert.ok(Object.isFrozen(received.foundationAnalysis));
  assert.ok(Object.isFrozen(received.foundationAnalysis.latency));
  assert.equal(mutationThrew, true);
  assert.equal(result.summary.beforeMetrics.analyzerWorked, true);
  assert.equal(result.summary.fluencySummary.fake, undefined);
  assert.equal(result.summary.fluencySummary.thresholdMs, 250);
});

test("manual and visibility pause/resume create timing boundaries without changing WPM metrics", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl8-pause", text: "a".repeat(60) });
  const engine = createPracticeSessionEngine({
    repository: harness.repository,
    sessionId: harness.sessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });
  await engine.prepare({ experiment: harness.experiment, configuration: {}, contentPlan: harness.contentPlan });
  await engine.start();
  await typeCorrect(engine, harness, 12);
  const beforePause = engine.getMetricsSnapshot();
  await engine.pause("manual");
  await harness.time.advance(5000, { runTimers: false });
  await engine.resume();
  await harness.time.advance(100, { runTimers: false });
  engine.handleInput(harness.input("character", "a"));
  await typeCorrect(engine, harness, 14);
  await engine.handleVisibilityState("hidden");
  await harness.time.advance(3000, { runTimers: false });
  await engine.resume();
  await harness.time.advance(100, { runTimers: false });
  engine.handleInput(harness.input("character", "a"));
  const result = await engine.complete("manual-stop");
  assert.ok(result.summary.fluencySummary.excludedReasons.timingBoundary >= 2);
  assert.equal(result.summary.wpm, engine.getMetricsSnapshot().wpm);
  assert.equal(result.summary.rawWpm, engine.getMetricsSnapshot().rawWpm);
  assert.equal(beforePause.correctInsertions, 12);
});

test("correction inputs exclude the recovered insertion while subsequent timing resumes normally", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl8-correction", text: "a".repeat(50) });
  const engine = createPracticeSessionEngine({
    repository: harness.repository,
    sessionId: harness.sessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });
  await engine.prepare({ experiment: harness.experiment, configuration: {}, contentPlan: harness.contentPlan });
  await engine.start();
  await typeCorrect(engine, harness, 22);
  await harness.time.advance(100, { runTimers: false });
  engine.handleInput(harness.input("character", "x"));
  await harness.time.advance(100, { runTimers: false });
  engine.handleInput(harness.input("backspace"));
  await harness.time.advance(400, { runTimers: false });
  engine.handleInput(harness.input("character", "a"));
  await harness.time.advance(100, { runTimers: false });
  engine.handleInput(harness.input("character", "a"));
  const result = await engine.complete("manual-stop");
  assert.equal(result.summary.correctedErrorCount, 1);
  assert.ok(result.summary.fluencySummary.excludedReasons.postCorrection >= 1);
  const trace = engine.getEventTrace();
  const recovered = trace.at(-2);
  const next = trace.at(-1);
  assert.equal(recovered.type, "character");
  assert.equal(next.type, "character");
});

test("checkpoint restore preserves tail coverage but starts a fresh restore timing segment", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl8-restore", text: "a".repeat(60) });
  const engine = createPracticeSessionEngine({
    repository: harness.repository,
    sessionId: harness.sessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });
  await engine.prepare({ experiment: harness.experiment, configuration: {}, contentPlan: harness.contentPlan });
  await engine.start();
  await typeCorrect(engine, harness, 8);
  await engine.flushCheckpoint("test", { force: true });
  const checkpoint = await harness.repository.getActiveCheckpoint(harness.profileId);
  assert.ok(checkpoint.metricsSnapshot.eventTraceMetadata);

  const restored = await restorePracticeSessionEngine({
    checkpoint,
    experimentDescriptor: harness.experiment,
    repository: harness.repository,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });
  await restored.resume();
  await harness.time.advance(100, { runTimers: false });
  restored.handleInput(harness.input("character", "a"));
  const trace = restored.getEventTrace();
  const last = trace.at(-1);
  assert.equal(last.timingSegmentStartReason, "restore");
  assert.ok(last.timingSegmentId > trace.at(-2).timingSegmentId);
});
