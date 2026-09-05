import assert from "node:assert/strict";
import { test } from "node:test";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import { buildPracticeStateProbe } from "../js/practiceLab/practiceStateProbe.js";
import { analyzePracticeWarmup, buildPracticeWarmupModel } from "../js/practiceLab/practiceWarmupModel.js";
import { createDefaultPracticePerformanceState, getCurrentPerformanceStateFromRecord, mergePracticePerformanceStateDelta } from "../js/practiceLab/practicePerformanceState.js";
import { validatePracticePerformanceState, validatePracticeStateObservation } from "../js/practiceLab/practicePerformanceValidation.js";

const profileId = createPracticeId("profile", { uuid: () => "pl14-state-profile-12345678" });
const contextId = createPracticeId("context", { uuid: () => "pl14-state-context-12345678" });
const foundationAnalysis = Object.freeze({
  latency: { sessionSummary: { fluentMedianMs: 100, fluentMadMs: 0, interruptionRate: 0, coverage: { scope: "complete-session" } }, classifiedTransitions: [] },
  normalization: { context: { contextId }, sessionSummary: { textDifficulty: { status: "full", difficultyIndex: 0, availableModelWeight: 1 } } },
});
const experiment = Object.freeze({ performanceReferenceChannel: "controlled-speed" });
const contentPlan = Object.freeze({ targetEntities: [] });
const reference = (confidence = "high") => ({
  estimate: { status: "established", confidenceLevel: confidence, meanLogWpm: Math.log(100), varianceLogWpm: 0.0004, estimateWpm: 100 },
  recentObservations: [99, 98, 100, 99].map((accuracy, index) => ({ accuracy, sessionId: `s${index}` })),
});
function session(wpm, accuracy = 99) {
  return Object.freeze({
    sessionId: createPracticeId("session", { uuid: () => `pl14-state-${String(wpm).replace(".", "-")}-12345678` }),
    profileId, contextId, status: "completed", completionReason: "time-complete",
    completedAtUtc: "2026-09-05T12:00:00.000Z", localDayKey: "2026-09-05",
    wpm, rawWpm: wpm, accuracy, activeDurationMs: 120_000, typedCharacterCount: 500,
    configuration: { correctionBehavior: "allow" },
  });
}

for (const [name, wpm, expectedPace, expectedReadiness] of [
  ["above", 106, "above-typical", "elevated"],
  ["below", 93, "below-typical", "reduced"],
  ["typical", 101, "typical", "normal"],
]) test(`PL14 ${name} state compares current adjusted pace with established ability`, () => {
  const result = buildPracticeStateProbe({ session: session(wpm), experiment, foundationAnalysis, contentPlan, evidenceRole: "diagnostic", referenceAbilityState: reference() });
  assert.equal(result.status, "measured");
  assert.equal(result.observation.paceState, expectedPace);
  assert.equal(result.observation.readinessBand, expectedReadiness);
  assert.equal(validatePracticeStateObservation(result.observation).valid, true);
});

test("PL14 degraded control prevents elevated readiness even at higher pace", () => {
  const result = buildPracticeStateProbe({ session: session(108, 92), experiment, foundationAnalysis, contentPlan, evidenceRole: "diagnostic", referenceAbilityState: reference() });
  assert.equal(result.status, "measured");
  assert.equal(result.observation.paceState, "above-typical");
  assert.equal(result.observation.controlQuality, "degraded");
  assert.equal(result.observation.readinessBand, "reduced");
});

test("PL14 low-confidence ability yields numeric diagnostic but no persistent categorical state", () => {
  const result = buildPracticeStateProbe({ session: session(108), experiment, foundationAnalysis, contentPlan, evidenceRole: "diagnostic", referenceAbilityState: reference("low") });
  assert.equal(result.status, "not-eligible");
  assert.deepEqual(result.reasons, ["reference-confidence-low"]);
  assert.equal(result.observation, null);
  assert.equal(result.diagnostic.paceState, "uncertain");
  assert.equal(result.diagnostic.readinessBand, "unknown");
  assert.ok(Number.isFinite(result.diagnostic.relativeStateDelta));
});

test("PL14 current-state query expires by comparison, without deleting the stored observation", () => {
  const measured = buildPracticeStateProbe({ session: session(101), experiment, foundationAnalysis, contentPlan, evidenceRole: "diagnostic", referenceAbilityState: reference() });
  let state = createDefaultPracticePerformanceState({ profileId, contextId, now: () => new Date("2026-09-05T12:00:00Z") });
  state = mergePracticePerformanceStateDelta(state, { type: "state-probe", sessionId: measured.observation.sessionId, profileId, contextId, currentStateObservation: measured.observation, warmupObservation: null });
  assert.equal(getCurrentPerformanceStateFromRecord(state, "controlled-speed", () => new Date("2026-09-05T15:59:59Z")).status, "current");
  const stale = getCurrentPerformanceStateFromRecord(state, "controlled-speed", () => new Date("2026-09-05T16:00:01Z"));
  assert.equal(stale.status, "stale");
  assert.equal(stale.readinessBand, "unknown");
  assert.ok(state.currentStates["controlled-speed"]);
  assert.equal(validatePracticePerformanceState(state).valid, true);
});

function warmupEvents(counts) {
  let eventIndex = 1;
  const events = [];
  counts.forEach((count, window) => {
    for (let index = 0; index < count; index += 1) events.push({
      eventIndex: eventIndex++, type: "character", correctness: "correct", isFirstAttempt: true,
      relativeActiveTimestampMs: window * 15_000 + (index + 0.5) * 15_000 / count,
    });
  });
  return events;
}

test("PL14 warm-up uses 15-second active-time first-pass windows, late median, and stable plateau", () => {
  const warmupSession = { sessionId: createPracticeId("session", { uuid: () => "pl14-warmup-session-12345678" }), completedAtUtc: "2026-09-05T12:00:00.000Z", localDayKey: "2026-09-05", activeDurationMs: 60_000 };
  const result = analyzePracticeWarmup({ events: warmupEvents([100, 105, 110, 110]), traceMetadata: { truncated: false }, latencyAnalysis: { classifiedTransitions: [] }, session: warmupSession, referenceChannel: "controlled-speed" });
  assert.equal(result.available, true);
  assert.equal(result.windows.length, 4);
  assert.equal(result.observation.earlyFirstPassWpm, 80);
  assert.equal(result.observation.lateFirstPassWpm, 88);
  assert.ok(Math.abs(result.observation.warmupGainRelative - 0.10) < 1e-12);
  assert.equal(result.observation.warmupDurationMs, 30_000);
  const truncated = analyzePracticeWarmup({ events: warmupEvents([100, 105, 110, 110]), traceMetadata: { truncated: true }, latencyAnalysis: { classifiedTransitions: [] }, session: warmupSession, referenceChannel: "controlled-speed" });
  assert.equal(truncated.available, false);
  assert.equal(truncated.reason, "trace-truncated");
});

test("PL14 robust warm-up model requires four observations across three days and ignores one large outlier", () => {
  const base = { version: 1, sessionId: "", completedAtUtc: "", localDayKey: "", referenceChannel: "controlled-speed", earlyFirstPassWpm: 80, lateFirstPassWpm: 84, warmupGainLog: Math.log(1.05), warmupGainRelative: 0.05, earlyAccuracy: 99, lateAccuracy: 99, fluentSpeedGainLog: null, warmupDurationMs: 15_000, controlDegraded: false, confidence: "high" };
  const observations = [0.05, 0.05, 0.05, 0.40].map((gain, index) => ({ ...base, sessionId: createPracticeId("session", { uuid: () => `pl14-warm-model-${index}-12345678` }), completedAtUtc: `2026-09-0${index + 1}T12:00:00.000Z`, localDayKey: `2026-09-0${index + 1}`, warmupGainLog: Math.log(1 + gain), warmupGainRelative: gain }));
  assert.equal(buildPracticeWarmupModel(observations.slice(0, 3)).status, "insufficient-data");
  const model = buildPracticeWarmupModel(observations);
  assert.equal(model.status, "observed");
  assert.ok(model.typicalWarmupGainRelative < 0.10);
});
