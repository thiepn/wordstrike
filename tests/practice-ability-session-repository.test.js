import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPracticeAbilityObservation } from "../js/practiceLab/practiceAbilityObservation.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import { createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";
import { createPracticeSessionEngine } from "../js/practiceLab/practiceSessionEngine.js";
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
    const ch = chars[index];
    const outcome = engine.handleInput(harness.input(ch === " " ? "space" : "character", ch));
    assert.equal(outcome.accepted, true, `expected ${JSON.stringify(ch)} at ${index} to be accepted`);
  }
}

function canonicalFoundation(contextId, difficultyIndex = 0) {
  return Object.freeze({
    latency: Object.freeze({ sessionSummary: Object.freeze({
      fluentMedianMs: 100,
      fluentMadMs: 0,
      interruptionRate: 0,
      coverage: Object.freeze({ scope: "complete-session" }),
    }) }),
    normalization: Object.freeze({
      context: Object.freeze({ contextId }),
      sessionSummary: Object.freeze({
        textDifficulty: Object.freeze({ status: "full", difficultyIndex, availableModelWeight: 1 }),
      }),
    }),
  });
}

function abilitySession({
  sessionId,
  profileId,
  contextId,
  channel = "controlled-speed",
  wpm = 100,
  activeDurationMs = 60_000,
  chars = 400,
  localDayKey = "2026-09-05",
  completedAtUtc = "2026-09-05T12:00:00.000Z",
} = {}) {
  const assessment = buildPracticeAbilityObservation({
    session: {
      sessionId, profileId, contextId,
      status: "completed", completionReason: "time-complete", completedAtUtc, localDayKey,
      wpm, rawWpm: wpm + 3, accuracy: 99, activeDurationMs, typedCharacterCount: chars,
      configuration: { correctionBehavior: "allow" },
    },
    experiment: { abilityChannel: channel },
    foundationAnalysis: canonicalFoundation(contextId),
    contentPlan: { targetEntities: [] },
    evidenceRole: "benchmark",
  });
  assert.equal(assessment.status, "eligible");
  const summary = createDefaultSessionSummary({
    sessionId, profileId, contextId, now: () => new Date(completedAtUtc),
    overrides: {
      completionReason: "time-complete",
      activeDurationMs,
      wallDurationMs: activeDurationMs,
      plannedDurationMs: activeDurationMs,
      contentDescriptor: { type: "corpus", contentId: "fixture" },
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

test("PL13 ordinary non-measurement session stays ability-isolated inside PL14 foundation v6/session v8 wrappers", async () => {
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
  assert.equal(foundationSeen.version, 6);
  assert.equal(foundationSeen.ability.status, "not-requested");
  assert.equal(foundationSeen.ability.observation, null);
  assert.equal(foundationSeen.performance.status, "not-requested");
  assert.equal(result.summary.recordVersion, 8);
  assert.equal(result.summary.abilityMeasurementSummary, null);
  assert.equal(result.summary.performanceMeasurementSummary, null);
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
  const { assessment, summary } = abilitySession({ sessionId, profileId: harness.profileId, contextId: harness.contextId });
  const committed = await harness.repository.commitCompletedPracticeSession({
    sessionSummary: summary,
    abilityObservation: assessment.observation,
  });
  assert.equal(committed.committed, true);
  assert.equal(committed.idempotent, false);
  assert.equal(committed.abilityUpdated, true);
  const state = await harness.repository.getAbilityState(harness.profileId, harness.contextId, "controlled-speed");
  assert.equal(state.evidence.observationCount, 1);
  const replay = await harness.repository.commitCompletedPracticeSession({
    sessionSummary: summary,
    abilityObservation: assessment.observation,
  });
  assert.equal(replay.idempotent, true);
  assert.equal((await harness.repository.getAbilityState(harness.profileId, harness.contextId, "controlled-speed")).evidence.observationCount, 1);
});

test("PL13 conflicting duplicate session cannot mutate ability state", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl13-conflict" });
  const sessionId = createPracticeId("session", { uuid: () => "pl13-conflict-session-12345678" });
  const { assessment, summary } = abilitySession({ sessionId, profileId: harness.profileId, contextId: harness.contextId });
  await harness.repository.commitCompletedPracticeSession({ sessionSummary: summary, abilityObservation: assessment.observation });
  const before = await harness.repository.getAbilityState(harness.profileId, harness.contextId, "controlled-speed");
  await assert.rejects(
    () => harness.repository.commitCompletedPracticeSession({
      sessionSummary: { ...summary, recommendationIds: ["conflicting-session-payload"] },
      abilityObservation: assessment.observation,
    }),
    /different completed Practice session|duplicate/i,
  );
  assert.deepEqual(await harness.repository.getAbilityState(harness.profileId, harness.contextId, "controlled-speed"), before);
});

test("PL13 invalid eligible ability observation prevents every completed-session write", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl13-atomic-invalid" });
  const sessionId = createPracticeId("session", { uuid: () => "pl13-invalid-session-12345678" });
  const { assessment, summary } = abilitySession({ sessionId, profileId: harness.profileId, contextId: harness.contextId });
  const invalid = { ...assessment.observation, profileId: createPracticeId("profile", { uuid: () => "other-profile-12345678" }) };
  await assert.rejects(
    () => harness.repository.commitCompletedPracticeSession({ sessionSummary: summary, abilityObservation: invalid }),
    /ability observation|cross-profile|validation/i,
  );
  assert.equal(await harness.repository.getSessionSummary(sessionId), null);
  assert.equal(await harness.repository.getAbilityState(harness.profileId, harness.contextId, "controlled-speed"), null);
});

test("PL13 channel isolation creates independent states and one session never updates multiple channels", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl13-channel-isolation" });
  const controlledSession = createPracticeId("session", { uuid: () => "pl13-controlled-12345678" });
  const burstSession = createPracticeId("session", { uuid: () => "pl13-burst-12345678" });
  const controlled = abilitySession({ sessionId: controlledSession, profileId: harness.profileId, contextId: harness.contextId, channel: "controlled-speed", wpm: 100, activeDurationMs: 60_000, chars: 400 });
  const burst = abilitySession({ sessionId: burstSession, profileId: harness.profileId, contextId: harness.contextId, channel: "burst", wpm: 140, activeDurationMs: 15_000, chars: 180, completedAtUtc: "2026-09-05T12:10:00.000Z" });
  await harness.repository.commitCompletedPracticeSession({ sessionSummary: controlled.summary, abilityObservation: controlled.assessment.observation });
  await harness.repository.commitCompletedPracticeSession({ sessionSummary: burst.summary, abilityObservation: burst.assessment.observation });
  const controlledState = await harness.repository.getAbilityState(harness.profileId, harness.contextId, "controlled-speed");
  const burstState = await harness.repository.getAbilityState(harness.profileId, harness.contextId, "burst");
  assert.notEqual(controlledState.abilityStateId, burstState.abilityStateId);
  assert.equal(controlledState.evidence.observationCount, 1);
  assert.equal(burstState.evidence.observationCount, 1);
});

test("PL13 context isolation never copies or pools an ability prior", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl13-context-isolation" });
  const otherContext = await harness.repository.ensureContext({
    keyboardLayout: "qwertz",
    inputProfile: "physical-keyboard",
    language: "en",
    contentLocale: "en",
    contextSchemaVersion: 1,
  });
  const firstSession = createPracticeId("session", { uuid: () => "pl13-context-a-12345678" });
  const secondSession = createPracticeId("session", { uuid: () => "pl13-context-b-12345678" });
  const first = abilitySession({ sessionId: firstSession, profileId: harness.profileId, contextId: harness.contextId, wpm: 100 });
  const second = abilitySession({ sessionId: secondSession, profileId: harness.profileId, contextId: otherContext.contextId, wpm: 80, completedAtUtc: "2026-09-05T13:00:00.000Z" });
  await harness.repository.commitCompletedPracticeSession({ sessionSummary: first.summary, abilityObservation: first.assessment.observation });
  await harness.repository.commitCompletedPracticeSession({ sessionSummary: second.summary, abilityObservation: second.assessment.observation });
  const a = await harness.repository.getAbilityState(harness.profileId, harness.contextId, "controlled-speed");
  const b = await harness.repository.getAbilityState(harness.profileId, otherContext.contextId, "controlled-speed");
  assert.notEqual(a.abilityStateId, b.abilityStateId);
  assert.equal(a.evidence.observationCount, 1);
  assert.equal(b.evidence.observationCount, 1);
  assert.ok(a.estimate.estimateWpm > b.estimate.estimateWpm);
});

test("PL13 Practice reset clears abilityStates and ordinary retention does not remove them", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl13-reset-retention" });
  const sessionId = createPracticeId("session", { uuid: () => "pl13-reset-session-12345678" });
  const { assessment, summary } = abilitySession({ sessionId, profileId: harness.profileId, contextId: harness.contextId });
  await harness.repository.commitCompletedPracticeSession({ sessionSummary: summary, abilityObservation: assessment.observation });
  await harness.repository.runPracticeRetention();
  assert.ok(await harness.repository.getAbilityState(harness.profileId, harness.contextId, "controlled-speed"));
  await harness.repository.resetPracticeData();
  assert.equal((await harness.dataStore.list("abilityStates")).length, 0);
});
