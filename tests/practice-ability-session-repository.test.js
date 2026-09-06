import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";
import { buildPracticeAbilityObservation } from "../js/practiceLab/practiceAbilityObservation.js";
import { createPracticeSessionEngine } from "../js/practiceLab/practiceSessionEngine.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

function engineFor(harness, sessionId = harness.sessionId) {
  return createPracticeSessionEngine({
    repository: harness.repository,
    sessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    clock: harness.time.clock,
    wallClock: harness.time.wallClock,
    scheduler: harness.time.scheduler,
  });
}

async function typeText(engine, harness, text, latencyMs = 100) {
  const chars = [...text];
  for (let index = 0; index < chars.length; index += 1) {
    if (index > 0) await harness.time.advance(latencyMs, { runTimers: false });
    const character = chars[index];
    const result = engine.handleInput(harness.input(character === " " ? "space" : "character", character));
    assert.equal(result.accepted, true);
  }
}

function foundation(contextId, { difficultyStatus = "full" } = {}) {
  return {
    normalization: {
      context: { contextId },
      sessionSummary: { textDifficulty: { status: difficultyStatus, difficultyIndex: 0, availableModelWeight: difficultyStatus === "full" ? 1 : 0 } },
    },
    latency: { sessionSummary: { fluentMedianMs: 100, fluentMadMs: 0, interruptionRate: 0, coverage: { scope: "complete-session" } } },
  };
}

function measurement({ profileId, contextId, sessionId, channel = "controlled-speed", role = "benchmark", completedAtUtc = "2026-09-05T10:00:00.000Z", duration = 60_000, chars = 200, wpm = 100 } = {}) {
  const assessment = buildPracticeAbilityObservation({
    session: {
      sessionId, profileId, contextId, status: "completed", completionReason: "time-complete",
      completedAtUtc, localDayKey: completedAtUtc.slice(0, 10), wpm, rawWpm: wpm + 3, accuracy: 99,
      activeDurationMs: duration, typedCharacterCount: chars, configuration: { correctionBehavior: "allow" },
    },
    experiment: { abilityChannel: channel },
    foundationAnalysis: foundation(contextId),
    contentPlan: { targetEntities: [] },
    evidenceRole: role,
  });
  assert.equal(assessment.status, "eligible");
  const summary = createDefaultSessionSummary({
    sessionId,
    profileId,
    contextId,
    experimentId: `pl13-${channel}`,
    now: () => new Date(completedAtUtc),
    overrides: {
      status: "completed",
      completionReason: "time-complete",
      startedAtUtc: new Date(Date.parse(completedAtUtc) - duration).toISOString(),
      completedAtUtc,
      localDayKey: completedAtUtc.slice(0, 10),
      plannedDurationMs: duration,
      activeDurationMs: duration,
      wallDurationMs: duration,
      configuration: { correctionBehavior: "allow" },
      targetEntities: [],
      typedCharacterCount: chars,
      correctCharacterCount: chars,
      wordCount: Math.max(1, Math.floor(chars / 5)),
      completedWordCount: Math.max(1, Math.floor(chars / 5)),
      wpm,
      rawWpm: wpm + 3,
      accuracy: 99,
      abilityMeasurementSummary: assessment.sessionSummary,
    },
  });
  return { assessment, summary };
}

test("PL13 ordinary non-measurement session stays ability-isolated inside PL18 foundation v9/session v11 wrappers", async () => {
  let foundationSeen = null;
  const harness = await createPracticeSessionHarness({
    suffix: "pl13-ordinary",
    text: "abcdef",
    experimentOverrides: { async analyzeResult(input) { foundationSeen = input.foundationAnalysis; return {}; } },
  });
  const engine = engineFor(harness);
  await engine.prepare({ experiment: harness.experiment, configuration: {}, contentPlan: harness.contentPlan });
  await engine.start();
  await typeText(engine, harness, "abcdef");
  const result = await engine.complete("manual-stop");
  assert.equal(foundationSeen.version, 9);
  assert.equal(foundationSeen.ability.status, "not-requested");
  assert.equal(foundationSeen.ability.observation, null);
  assert.equal(foundationSeen.performance.status, "not-requested");
  assert.equal(result.summary.recordVersion, 11);
  assert.equal(result.summary.abilityMeasurementSummary, null);
  assert.equal(result.summary.performanceMeasurementSummary, null);
  assert.equal(result.summary.retentionReviewSummary, null);
  assert.equal(result.summary.evaluationSummary, null);
  assert.deepEqual(await harness.repository.listAbilityStates(harness.profileId, harness.contextId), []);
});

test("PL13 declared ability channel with generated/unclassified content is measured as not-eligible and cannot create state", async () => {
  const generatedText = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau";
  const harness = await createPracticeSessionHarness({
    suffix: "pl13-no-spoof",
    text: generatedText,
    completion: { mode: "manual", value: null },
    experimentOverrides: { abilityChannel: "common-words" },
  });
  const engine = engineFor(harness);
  await engine.prepare({ experiment: harness.experiment, configuration: { correctionBehavior: "allow" }, contentPlan: harness.contentPlan });
  await engine.start();
  await typeText(engine, harness, harness.contentPlan.text, 160);
  const result = await engine.complete("manual-stop");
  assert.equal(result.summary.abilityMeasurementSummary.status, "not-eligible");
  assert.ok(result.summary.abilityMeasurementSummary.reasons.includes("manual-stop"));
  assert.ok(result.summary.abilityMeasurementSummary.reasons.includes("role-not-allowed"));
  assert.deepEqual(await harness.repository.listAbilityStates(harness.profileId, harness.contextId), []);
});

test("PL13 repository atomically applies one ability observation and duplicate completed session is exactly-once", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl13-atomic-once" });
  const sessionId = createPracticeId("session", { uuid: () => "pl13-atomic-session-12345678" });
  const { assessment, summary } = measurement({ profileId: harness.profileId, contextId: harness.contextId, sessionId });
  const first = await harness.repository.commitCompletedPracticeSession({ sessionSummary: summary, abilityObservation: assessment.observation });
  assert.equal(first.committed, true);
  assert.equal(first.abilityUpdated, true);
  const state = await harness.repository.getAbilityState(harness.profileId, harness.contextId, "controlled-speed");
  assert.equal(state.evidence.observationCount, 1);
  assert.equal(state.recentObservations.length, 1);

  const replay = await harness.repository.commitCompletedPracticeSession({ sessionSummary: summary, abilityObservation: assessment.observation });
  assert.equal(replay.idempotent, true);
  const after = await harness.repository.getAbilityState(harness.profileId, harness.contextId, "controlled-speed");
  assert.equal(after.evidence.observationCount, 1);
});

test("PL13 conflicting duplicate session cannot mutate ability state", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl13-conflict" });
  const sessionId = createPracticeId("session", { uuid: () => "pl13-conflict-session-12345678" });
  const { assessment, summary } = measurement({ profileId: harness.profileId, contextId: harness.contextId, sessionId });
  await harness.repository.commitCompletedPracticeSession({ sessionSummary: summary, abilityObservation: assessment.observation });
  const before = await harness.repository.getAbilityState(harness.profileId, harness.contextId, "controlled-speed");
  await assert.rejects(
    () => harness.repository.commitCompletedPracticeSession({ sessionSummary: { ...summary, recommendationIds: ["different"] }, abilityObservation: assessment.observation }),
    /different completed Practice session|duplicate/i,
  );
  const after = await harness.repository.getAbilityState(harness.profileId, harness.contextId, "controlled-speed");
  assert.deepEqual(after, before);
});

test("PL13 invalid eligible ability observation prevents every completed-session write", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl13-invalid-atomic" });
  const sessionId = createPracticeId("session", { uuid: () => "pl13-invalid-session-12345678" });
  const { assessment, summary } = measurement({ profileId: harness.profileId, contextId: harness.contextId, sessionId });
  const invalid = { ...assessment.observation, measurementVarianceLog: -1 };
  const beforeSessions = (await harness.repository.listSessionSummaries(harness.profileId)).length;
  await assert.rejects(
    () => harness.repository.commitCompletedPracticeSession({ sessionSummary: summary, abilityObservation: invalid }),
    /ability observation failed validation/i,
  );
  assert.equal((await harness.repository.listSessionSummaries(harness.profileId)).length, beforeSessions);
  assert.equal(await harness.repository.getSessionSummary(sessionId), null);
  assert.equal(await harness.repository.getAbilityState(harness.profileId, harness.contextId, "controlled-speed"), null);
});

test("PL13 channel isolation creates independent states and one session never updates multiple channels", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl13-channel-isolation" });
  const controlledId = createPracticeId("session", { uuid: () => "pl13-controlled-session-12345678" });
  const controlled = measurement({ profileId: harness.profileId, contextId: harness.contextId, sessionId: controlledId });
  await harness.repository.commitCompletedPracticeSession({ sessionSummary: controlled.summary, abilityObservation: controlled.assessment.observation });
  assert.equal((await harness.repository.listAbilityStates(harness.profileId, harness.contextId)).length, 1);
  assert.equal(await harness.repository.getAbilityState(harness.profileId, harness.contextId, "burst"), null);

  const burstId = createPracticeId("session", { uuid: () => "pl13-burst-session-12345678" });
  const burst = measurement({ profileId: harness.profileId, contextId: harness.contextId, sessionId: burstId, channel: "burst", role: "training", duration: 10_000, chars: 50, completedAtUtc: "2026-09-06T10:00:00.000Z", wpm: 140 });
  await harness.repository.commitCompletedPracticeSession({ sessionSummary: burst.summary, abilityObservation: burst.assessment.observation });
  const states = await harness.repository.listAbilityStates(harness.profileId, harness.contextId);
  assert.deepEqual(states.map((state) => state.channel).sort(), ["burst", "controlled-speed"]);
  assert.equal((await harness.repository.getAbilityState(harness.profileId, harness.contextId, "controlled-speed")).evidence.observationCount, 1);
  assert.equal((await harness.repository.getAbilityState(harness.profileId, harness.contextId, "burst")).evidence.observationCount, 1);
});

test("PL13 context isolation never copies or pools an ability prior", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl13-context-isolation" });
  const firstId = createPracticeId("session", { uuid: () => "pl13-context-a-session-12345678" });
  const first = measurement({ profileId: harness.profileId, contextId: harness.contextId, sessionId: firstId });
  await harness.repository.commitCompletedPracticeSession({ sessionSummary: first.summary, abilityObservation: first.assessment.observation });

  const created = await harness.repository.createPracticeContext({ profileId: harness.profileId, inputMethod: "physical" });
  const contextB = created.context.contextId;
  assert.notEqual(contextB, harness.contextId);
  assert.equal(await harness.repository.getAbilityState(harness.profileId, contextB, "controlled-speed"), null);

  const secondId = createPracticeId("session", { uuid: () => "pl13-context-b-session-12345678" });
  const second = measurement({ profileId: harness.profileId, contextId: contextB, sessionId: secondId, completedAtUtc: "2026-09-06T10:00:00.000Z", wpm: 80 });
  await harness.repository.commitCompletedPracticeSession({ sessionSummary: second.summary, abilityObservation: second.assessment.observation });
  const a = await harness.repository.getAbilityState(harness.profileId, harness.contextId, "controlled-speed");
  const b = await harness.repository.getAbilityState(harness.profileId, contextB, "controlled-speed");
  assert.equal(a.evidence.observationCount, 1);
  assert.equal(b.evidence.observationCount, 1);
  assert.notEqual(a.abilityStateId, b.abilityStateId);
  assert.ok(a.estimate.estimateWpm > b.estimate.estimateWpm);
});

test("PL13 Practice reset clears abilityStates and ordinary retention does not remove them", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl13-reset" });
  const sessionId = createPracticeId("session", { uuid: () => "pl13-reset-session-12345678" });
  const { assessment, summary } = measurement({ profileId: harness.profileId, contextId: harness.contextId, sessionId });
  await harness.repository.commitCompletedPracticeSession({ sessionSummary: summary, abilityObservation: assessment.observation });
  assert.equal((await harness.dataStore.list("abilityStates")).length, 1);
  await harness.repository.runPracticeRetention();
  assert.equal((await harness.dataStore.list("abilityStates")).length, 1);
  await harness.repository.resetPracticeData();
  assert.equal((await harness.dataStore.list("abilityStates")).length, 0);
});
