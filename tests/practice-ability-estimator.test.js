import assert from "node:assert/strict";
import { test } from "node:test";
import { PRACTICE_ABILITY_OBSERVATION_VERSION } from "../js/practiceLab/practiceAbilityConstants.js";
import { PRACTICE_ABILITY_POLICY_V1 } from "../js/practiceLab/practiceAbilityPolicy.js";
import {
  createDefaultPracticeAbilityState,
  derivePracticeAbilityEstimate,
  mergePracticeAbilityObservation,
} from "../js/practiceLab/practiceAbilityEstimator.js";
import { comparePracticeAbilityEstimates } from "../js/practiceLab/practiceAbilityComparison.js";
import { createPracticeAbilityStateId, createPracticeId } from "../js/practiceLab/practiceIds.js";
import { validatePracticeAbilityState } from "../js/practiceLab/practiceAbilityValidation.js";

const profileId = createPracticeId("profile", { uuid: () => "pl13-estimator-profile-12345678" });
const contextId = createPracticeId("context", { uuid: () => "pl13-estimator-context-12345678" });
const base = Date.parse("2026-08-01T10:00:00.000Z");
const DAY = 86_400_000;
const approx = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(actual), Math.abs(expected)), `${actual} != ${expected}`);

function observation(index, { wpm = 100, sigma = 0.08, day = index, channel = "controlled-speed", role = "benchmark", duration = 60_000 } = {}) {
  const completedAtUtc = new Date(base + day * DAY + index * 1000).toISOString();
  const localDayKey = completedAtUtc.slice(0, 10);
  return Object.freeze({
    observationVersion: PRACTICE_ABILITY_OBSERVATION_VERSION,
    sessionId: createPracticeId("session", { uuid: () => `pl13-estimator-session-${index}-12345678` }),
    profileId,
    contextId,
    channel,
    sourceRole: role,
    completedAtUtc,
    localDayKey,
    rawWpm: wpm + 3,
    wpm,
    adjustedWpm: wpm,
    adjustedLogPerformance: Math.log(wpm),
    accuracy: 99,
    activeDurationMs: duration,
    typedCharacterCount: 200,
    difficultyIndex: 0,
    difficultyAdjustmentLog: 0,
    difficultyModelStatus: "full",
    difficultyCoverage: 1,
    measurementSigmaLog: sigma,
    measurementVarianceLog: sigma ** 2,
    reliabilityWeight: Math.max(0.05, Math.min(4, (0.08 / sigma) ** 2)),
  });
}

function seededState(count = 6, { wpm = 100, sigma = 0.05 } = {}) {
  let state = createDefaultPracticeAbilityState({ profileId, contextId, channel: "controlled-speed", now: () => new Date(base) });
  for (let index = 0; index < count; index += 1) state = mergePracticeAbilityObservation(state, observation(index, { wpm, sigma, day: index }));
  return state;
}

test("PL13 ability identity is deterministic and empty state uses null rather than zero WPM", () => {
  const expectedId = createPracticeAbilityStateId(profileId, contextId, "controlled-speed");
  assert.equal(createPracticeAbilityStateId(profileId, contextId, "controlled-speed"), expectedId);
  assert.notEqual(createPracticeAbilityStateId(profileId, contextId, "burst"), expectedId);
  const state = createDefaultPracticeAbilityState({ profileId, contextId, channel: "controlled-speed", now: () => new Date(base) });
  assert.equal(state.abilityStateId, expectedId);
  assert.equal(state.estimate.status, "unmeasured");
  assert.equal(state.estimate.meanLogWpm, null);
  assert.equal(state.estimate.estimateWpm, null);
  assert.equal(state.estimate.confidenceLevel, "none");
  assert.equal(validatePracticeAbilityState(state).valid, true);
});

test("PL13 first observation initializes at adjusted log performance with broad 0.20 sigma prior", () => {
  const empty = createDefaultPracticeAbilityState({ profileId, contextId, channel: "controlled-speed", now: () => new Date(base) });
  const next = mergePracticeAbilityObservation(empty, observation(0, { wpm: 100, sigma: 0.08 }));
  approx(next.estimate.meanLogWpm, Math.log(100));
  approx(next.estimate.varianceLogWpm, 0.20 ** 2);
  approx(next.estimate.estimateWpm, 100);
  assert.equal(next.estimate.status, "provisional");
  assert.equal(next.estimate.confidenceLevel, "low");
  assert.equal(next.evidence.observationCount, 1);
  assert.equal(next.recentObservations[0].innovationLog, null);
});

test("PL13 repeated compatible observations reduce uncertainty without scanning history", () => {
  let state = createDefaultPracticeAbilityState({ profileId, contextId, channel: "controlled-speed", now: () => new Date(base) });
  const variances = [];
  for (let index = 0; index < 6; index += 1) {
    state = mergePracticeAbilityObservation(state, observation(index, { sigma: 0.05, day: index }));
    variances.push(state.estimate.varianceLogWpm);
  }
  for (let index = 1; index < variances.length; index += 1) assert.ok(variances[index] < variances[index - 1]);
  assert.equal(state.evidence.observationCount, 6);
  assert.equal(state.evidence.sessionCount, 6);
  assert.equal(state.evidence.dayCount, 6);
  assert.equal(validatePracticeAbilityState(state).valid, true);
});

test("PL13 process noise increases prior uncertainty, never decays the mean, and caps elapsed days at 30", () => {
  const prior = seededState(4, { sigma: 0.06 });
  const y = prior.estimate.estimateWpm;
  const thirty = mergePracticeAbilityObservation(prior, observation(90, { wpm: y, sigma: 0.08, day: 33 }));
  const fourHundred = mergePracticeAbilityObservation(prior, observation(91, { wpm: y, sigma: 0.08, day: 403 }));
  approx(thirty.estimate.meanLogWpm, prior.estimate.meanLogWpm);
  approx(fourHundred.estimate.meanLogWpm, prior.estimate.meanLogWpm);
  approx(thirty.estimate.varianceLogWpm, fourHundred.estimate.varianceLogWpm);
  assert.ok(thirty.estimate.varianceLogWpm > mergePracticeAbilityObservation(prior, observation(92, { wpm: y, sigma: 0.08, day: 4 })).estimate.varianceLogWpm);
});

test("PL13 valid low and high outliers are incorporated with exact 3-sigma innovation clipping", () => {
  const prior = seededState(8, { sigma: 0.04 });
  for (const [index, wpm, direction] of [[100, 40, -1], [101, 200, 1]]) {
    const obs = observation(index, { wpm, sigma: 0.08, day: 9 });
    const elapsedDays = Math.max(0, Math.min(PRACTICE_ABILITY_POLICY_V1.estimator.maximumProcessDays, (Date.parse(obs.completedAtUtc) - Date.parse(prior.evidence.lastObservedAt)) / DAY));
    const pPrior = prior.estimate.varianceLogWpm + PRACTICE_ABILITY_POLICY_V1.estimator.processVariancePerDay * elapsedDays;
    const rVariance = obs.measurementVarianceLog;
    const s = pPrior + rVariance;
    const innovation = Math.log(wpm) - prior.estimate.meanLogWpm;
    const clipped = Math.max(-3 * Math.sqrt(s), Math.min(3 * Math.sqrt(s), innovation));
    const gain = pPrior / (pPrior + rVariance);
    const expectedMean = prior.estimate.meanLogWpm + gain * clipped;
    const next = mergePracticeAbilityObservation(prior, obs);
    approx(next.estimate.meanLogWpm, expectedMean);
    assert.equal(next.evidence.observationCount, prior.evidence.observationCount + 1);
    assert.equal(Math.sign(next.estimate.meanLogWpm - prior.estimate.meanLogWpm), direction);
    if (wpm === 40) assert.ok(next.estimate.estimateWpm > 40);
    if (wpm === 200) assert.ok(next.estimate.estimateWpm < 200);
  }
});

test("PL13 a lower-uncertainty observation moves the same prior more for identical innovation", () => {
  const prior = seededState(5, { sigma: 0.06 });
  const lowNoise = mergePracticeAbilityObservation(prior, observation(110, { wpm: 110, sigma: 0.04, day: 6 }));
  const highNoise = mergePracticeAbilityObservation(prior, observation(111, { wpm: 110, sigma: 0.20, day: 6 }));
  const lowMove = Math.abs(lowNoise.estimate.meanLogWpm - prior.estimate.meanLogWpm);
  const highMove = Math.abs(highNoise.estimate.meanLogWpm - prior.estimate.meanLogWpm);
  assert.ok(lowMove > highMove);
});

test("PL13 model interval, relative width and smallest reliable change use exact log-space formulas", () => {
  const evidence = { observationCount: 4, sessionCount: 4, dayCount: 3 };
  const mean = Math.log(100);
  const variance = 0.04 ** 2;
  const estimate = derivePracticeAbilityEstimate({ meanLogWpm: mean, varianceLogWpm: variance, evidence });
  approx(estimate.interval95LowerWpm, Math.exp(mean - 1.96 * 0.04));
  approx(estimate.interval95UpperWpm, Math.exp(mean + 1.96 * 0.04));
  approx(estimate.relativeIntervalWidth, (estimate.interval95UpperWpm - estimate.interval95LowerWpm) / 100);
  const relativeSrc = Math.exp(1.96 * Math.sqrt(2 * variance)) - 1;
  approx(estimate.smallestReliableRelativeChange, relativeSrc);
  approx(estimate.smallestReliableChangeWpm, 100 * relativeSrc);
  const wider = derivePracticeAbilityEstimate({ meanLogWpm: mean, varianceLogWpm: 0.08 ** 2, evidence });
  assert.ok(wider.smallestReliableChangeWpm > estimate.smallestReliableChangeWpm);
});

test("PL13 ability confidence requires both evidence diversity and narrow uncertainty", () => {
  const mean = Math.log(100);
  assert.equal(derivePracticeAbilityEstimate({ meanLogWpm: mean, varianceLogWpm: 0.04, evidence: { observationCount: 1, sessionCount: 1, dayCount: 1 } }).confidenceLevel, "low");
  const medium = derivePracticeAbilityEstimate({ meanLogWpm: mean, varianceLogWpm: 0.05 ** 2, evidence: { observationCount: 3, sessionCount: 3, dayCount: 2 } });
  assert.equal(medium.confidenceLevel, "medium");
  assert.equal(medium.status, "established");
  const high = derivePracticeAbilityEstimate({ meanLogWpm: mean, varianceLogWpm: 0.03 ** 2, evidence: { observationCount: 6, sessionCount: 6, dayCount: 3 } });
  assert.equal(high.confidenceLevel, "high");
  assert.equal(high.status, "established");
  const noisyMany = derivePracticeAbilityEstimate({ meanLogWpm: mean, varianceLogWpm: 0.10 ** 2, evidence: { observationCount: 20, sessionCount: 20, dayCount: 10 } });
  assert.notEqual(noisyMany.confidenceLevel, "high");
});

test("PL13 comparison reports measurement evidence, never improvement semantics", () => {
  const broadEarlier = { meanLogWpm: Math.log(100), varianceLogWpm: 0.10 ** 2 };
  const broadLater = { meanLogWpm: Math.log(105), varianceLogWpm: 0.10 ** 2 };
  const broad = comparePracticeAbilityEstimates(broadEarlier, broadLater);
  assert.equal(broad.modelReliable, false);
  assert.equal(broad.direction, "higher");
  assert.equal(Object.hasOwn(broad, "improved"), false);
  assert.equal(Object.hasOwn(broad, "regressed"), false);
  const narrow = comparePracticeAbilityEstimates({ ...broadEarlier, varianceLogWpm: 0.01 ** 2 }, { ...broadLater, varianceLogWpm: 0.01 ** 2 });
  assert.equal(narrow.modelReliable, true);
  const tiny = comparePracticeAbilityEstimates({ meanLogWpm: Math.log(100), varianceLogWpm: 0.001 ** 2 }, { meanLogWpm: Math.log(100.5), varianceLogWpm: 0.001 ** 2 });
  assert.equal(tiny.modelReliable, true);
  assert.equal(tiny.practicallyMeaningful, false);
  assert.equal(tiny.direction, "similar");
});

test("PL13 recent observation audit ring stays bounded at 32 without changing recursive state", () => {
  let state = createDefaultPracticeAbilityState({ profileId, contextId, channel: "controlled-speed", now: () => new Date(base) });
  for (let index = 0; index < 40; index += 1) state = mergePracticeAbilityObservation(state, observation(index, { wpm: 100 + (index % 2), sigma: 0.08, day: index }));
  assert.equal(state.evidence.observationCount, 40);
  assert.equal(state.recentObservations.length, 32);
  assert.equal(state.recentObservations[0].sessionId, observation(8, { day: 8 }).sessionId);
  assert.equal(validatePracticeAbilityState(state).valid, true);
});

test("PL13 rejects out-of-order ability observations rather than applying negative process time", () => {
  const state = seededState(3);
  const old = observation(200, { wpm: 100, day: 0 });
  assert.throws(() => mergePracticeAbilityObservation(state, old), (error) => error?.code === "OUT_OF_ORDER_ABILITY_OBSERVATION");
});
