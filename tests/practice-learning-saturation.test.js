import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPracticeAcquisitionCurve, buildPracticeTransferCurve } from "../js/practiceLab/practiceLearningCurve.js";
import { buildPracticeAbilityLearningCurve } from "../js/practiceLab/practiceAbilityLearningCurve.js";
import { computePracticeRecentContextDose, evaluatePracticeGlobalPlateau } from "../js/practiceLab/practiceGlobalPlateau.js";
import { evaluatePracticeSaturation } from "../js/practiceLab/practiceSaturationModel.js";

function acq(index, quality, gain = 2, { dose = index, day = index + 1 } = {}) {
  return {
    sessionId: `practice-session_sat-a-${index}-12345678`,
    completedAtUtc: `2026-08-${String(day).padStart(2, "0")}T10:00:00.000Z`,
    localDayKey: `2026-08-${String(day).padStart(2, "0")}`,
    cumulativeDoseBefore: dose,
    doseUnits: 1,
    entryQuality: quality,
    exitQuality: quality + gain,
    practiceGain: gain,
  };
}

function transfer(index, quality, { dose = index + 1, day = index + 10 } = {}) {
  return {
    sessionId: `practice-session_sat-t-${index}-12345678`,
    completedAtUtc: `2026-08-${String(day).padStart(2, "0")}T12:00:00.000Z`,
    localDayKey: `2026-08-${String(day).padStart(2, "0")}`,
    cumulativeDoseAtObservation: dose,
    quality,
  };
}

function learningState(acquisitionObservations, transferObservations = []) {
  return {
    acquisition: {
      observationCount: acquisitionObservations.length,
      dayCount: new Set(acquisitionObservations.map((o) => o.localDayKey)).size,
      observations: acquisitionObservations,
      curve: buildPracticeAcquisitionCurve(acquisitionObservations),
    },
    transfer: {
      observationCount: transferObservations.length,
      dayCount: new Set(transferObservations.map((o) => o.localDayKey)).size,
      observations: transferObservations,
      curve: buildPracticeTransferCurve(transferObservations),
    },
  };
}

const mastery = (stage = "learning", critical = false) => ({
  stage,
  limiterGuard: { confirmedCritical: critical, likelyCritical: critical },
});
const limiter = (status = "likely", primaryPhenotype = "slow", impactScore = 80) => ({
  status,
  primaryPhenotype,
  impactScore,
});

test("PL16 high-quality flat acquisition is resolved with Acquired+ mastery, not a plateau problem", () => {
  const observations = [91, 92, 92, 92, 93, 92].map((quality, index) => acq(index, quality, 1));
  const result = evaluatePracticeSaturation({
    learningState: learningState(observations),
    mastery: mastery("acquired"),
    limiter: limiter("not-elevated", "none"),
  });
  assert.equal(result.status, "resolved");
  assert.ok(result.reasons.includes("high-quality-ceiling"));
});

test("PL16 active recent learning overrides low current quality and yields not-detected saturation", () => {
  const observations = [45, 50, 55, 60, 65, 70].map((quality, index) => acq(index, quality, 2));
  const result = evaluatePracticeSaturation({ learningState: learningState(observations), mastery: mastery(), limiter: limiter() });
  assert.equal(result.status, "not-detected");
  assert.ok(result.reasons.includes("curve-improving"));
});

test("PL16 approaching saturation requires older improvement with low recent marginal gain below resolved quality", () => {
  const observations = [45, 55, 65, 72, 76, 77, 77.5, 77.6].map((quality, index) => acq(index, quality, 2));
  const state = learningState(observations);
  assert.equal(state.acquisition.curve.status, "improving");
  assert.ok(state.acquisition.curve.recentSlopePointsPerDose <= 2);
  const result = evaluatePracticeSaturation({ learningState: state, mastery: mastery(), limiter: limiter() });
  assert.equal(result.status, "approaching");
});

test("PL16 flat low-quality acquisition with low same-session gain becomes likely acquisition plateau when evidence is sufficient", () => {
  const observations = [60, 60.4, 60.2, 60.4, 60.3, 60.2, 60.4, 60.3].map((quality, index) => acq(index, quality, 2));
  const state = learningState(observations);
  assert.equal(state.acquisition.curve.status, "flat");
  const result = evaluatePracticeSaturation({ learningState: state, mastery: mastery(), limiter: limiter("likely", "slow") });
  assert.equal(result.status, "likely");
  assert.equal(result.type, "acquisition-plateau");
  assert.equal(result.diagnostics.plateauMechanismFamily, "motor-speed");
});

test("PL16 large practice gains plus flat next-entry curve identifies reacquisition-loop without calling it retention failure", () => {
  const observations = [60, 60.5, 60.2, 60.4, 60.3, 60.4, 60.2, 60.3].map((quality, index) => acq(index, quality, 10));
  const state = learningState(observations);
  const result = evaluatePracticeSaturation({ learningState: state, mastery: mastery(), limiter: limiter("likely", "hesitant") });
  assert.equal(result.status, "likely");
  assert.equal(result.type, "reacquisition-loop");
  assert.ok(result.reasons.includes("practice-gain-high"));
  assert.equal(JSON.stringify(result).includes("forget"), false);
});

test("PL16 overload guard caps flat repeated failure at possible", () => {
  const observations = [30, 30.5, 30.2, 30.4, 30.3, 30.4, 30.2, 30.3].map((quality, index) => acq(index, quality, 5));
  const result = evaluatePracticeSaturation({ learningState: learningState(observations), mastery: mastery(), limiter: limiter("confirmed", "inaccurate") });
  assert.equal(result.status, "possible");
  assert.ok(result.reasons.includes("possible-overload"));
});

test("PL16 supported saturation requires flat poor transfer; improving transfer blocks supported status", () => {
  const acquisition = [60, 60.4, 60.2, 60.4, 60.3, 60.2, 60.4, 60.3].map((quality, index) => acq(index, quality, 2));
  const flatTransfer = [60, 60.4, 60.2, 60.3].map((quality, index) => transfer(index, quality));
  const supported = evaluatePracticeSaturation({ learningState: learningState(acquisition, flatTransfer), mastery: mastery(), limiter: limiter("likely", "slow") });
  assert.equal(supported.status, "supported");

  const improvingTransfer = [50, 58, 66, 74].map((quality, index) => transfer(index, quality));
  const notSupported = evaluatePracticeSaturation({ learningState: learningState(acquisition, improvingTransfer), mastery: mastery(), limiter: limiter("likely", "slow") });
  assert.notEqual(notSupported.status, "supported");
});

test("PL16 no transfer evidence caps acquisition saturation at likely", () => {
  const acquisition = [60, 60.4, 60.2, 60.4, 60.3, 60.2, 60.4, 60.3].map((quality, index) => acq(index, quality, 2));
  const result = evaluatePracticeSaturation({ learningState: learningState(acquisition), mastery: mastery(), limiter: limiter() });
  assert.equal(result.status, "likely");
  assert.ok(result.reasons.includes("transfer-unverified"));
});

test("PL16 acquisition resolved/improving with low flat transfer is transfer-limited", () => {
  const acquisition = [80, 82, 84, 86, 88, 90].map((quality, index) => acq(index, quality, 2));
  const flatTransfer = [60, 60.5, 60.3, 60.4].map((quality, index) => transfer(index, quality));
  const result = evaluatePracticeSaturation({ learningState: learningState(acquisition, flatTransfer), mastery: mastery("acquired"), limiter: limiter("not-elevated", "none") });
  assert.equal(result.type, "transfer-limited");
  assert.ok(["likely", "supported"].includes(result.status));
});

function abilityObservation(index, wpm, sigma = 0.1, dayOffset = index * 2) {
  const day = 1 + dayOffset;
  return {
    sessionId: `practice-session_ability-${index}-12345678`,
    channel: "cold-natural-text",
    completedAtUtc: `2026-08-${String(day).padStart(2, "0")}T09:00:00.000Z`,
    localDayKey: `2026-08-${String(day).padStart(2, "0")}`,
    adjustedWpm: wpm,
    measurementSigmaLog: sigma,
  };
}

test("PL16 cold-natural PL13 ability curve detects improving, stable and noise-limited confidence", () => {
  const improvingState = { recentObservations: [70, 72, 74, 77, 80, 83, 86, 89].map((wpm, index) => abilityObservation(index, wpm)) };
  const improving = buildPracticeAbilityLearningCurve(improvingState);
  assert.equal(improving.status, "improving");
  assert.equal(improving.channel, "cold-natural-text");
  assert.ok(improving.weeklyRelativeGain > 0.01);

  const stableState = { recentObservations: [80, 80.1, 79.9, 80, 80.1, 80, 80.05, 80].map((wpm, index) => abilityObservation(index, wpm)) };
  const stable = buildPracticeAbilityLearningCurve(stableState);
  assert.equal(stable.status, "stable");
  assert.ok(["medium", "high"].includes(stable.confidence));

  const noisyState = { recentObservations: [80, 80.1, 79.9, 80, 80.1, 80, 80.05, 80].map((wpm, index) => abilityObservation(index, wpm, 0.3)) };
  const noisy = buildPracticeAbilityLearningCurve(noisyState);
  assert.notEqual(noisy.confidence, "high");
});

test("PL16 same-day ability pairs are ignored for time slopes and do not divide by zero", () => {
  const observations = Array.from({ length: 6 }, (_, index) => ({
    ...abilityObservation(index, 80 + index),
    completedAtUtc: "2026-08-01T09:00:00.000Z",
    localDayKey: "2026-08-01",
  }));
  const curve = buildPracticeAbilityLearningCurve({ recentObservations: observations });
  assert.equal(curve.status, "insufficient-data");
  assert.equal(curve.slopeLogPerDay, null);
});

test("PL16 recent context dose uses a 14-day window, unique sessions/days, and global plateau needs real practice", () => {
  const learningStates = [{
    acquisition: {
      observations: [
        { sessionId: "s1", completedAtUtc: "2026-09-01T10:00:00.000Z", localDayKey: "2026-09-01", doseUnits: 2 },
        { sessionId: "s2", completedAtUtc: "2026-09-03T10:00:00.000Z", localDayKey: "2026-09-03", doseUnits: 2 },
        { sessionId: "s3", completedAtUtc: "2026-09-05T10:00:00.000Z", localDayKey: "2026-09-05", doseUnits: 2 },
      ],
    },
  }];
  const dose = computePracticeRecentContextDose(learningStates, new Date("2026-09-06T10:00:00.000Z"));
  assert.equal(dose.windowDays, 14);
  assert.equal(dose.recentDoseUnits, 6);
  assert.equal(dose.recentTargetedSessions, 3);
  assert.equal(dose.recentTrainingDays, 3);

  const stableAbility = { status: "stable", confidence: "medium", spanDays: 10 };
  const unresolved = [{ limiter: limiter("likely", "slow"), mastery: mastery(), saturation: { status: "possible", type: "acquisition-plateau", diagnostics: { plateauMechanismFamily: "motor-speed" } } }];
  const possible = evaluatePracticeGlobalPlateau({ abilityCurve: stableAbility, recentDose: dose, entityResults: unresolved });
  assert.equal(possible.status, "possible");
  assert.equal(possible.type, "motor");

  const noPractice = evaluatePracticeGlobalPlateau({ abilityCurve: stableAbility, recentDose: { recentDoseUnits: 0, recentTrainingDays: 0 }, entityResults: unresolved });
  assert.equal(noPractice.status, "not-detected");
});

test("PL16 supported global plateau requires strong stable ability, substantial recent dose and multiple entity signals", () => {
  const abilityCurve = { status: "stable", confidence: "high", spanDays: 16 };
  const recentDose = { recentDoseUnits: 9, recentTrainingDays: 5 };
  const entity = (kind) => ({
    limiter: limiter("likely", kind === "motor" ? "slow" : "inaccurate"),
    mastery: mastery(),
    saturation: { status: "likely", type: "acquisition-plateau", diagnostics: { plateauMechanismFamily: kind === "motor" ? "motor-speed" : "control" } },
  });
  const supported = evaluatePracticeGlobalPlateau({ abilityCurve, recentDose, entityResults: [entity("motor"), entity("motor")] });
  assert.equal(supported.status, "supported");
  assert.equal(supported.type, "motor");

  const control = evaluatePracticeGlobalPlateau({ abilityCurve, recentDose, entityResults: [entity("control"), entity("control")] });
  assert.equal(control.type, "control");

  const transferType = evaluatePracticeGlobalPlateau({ abilityCurve, recentDose, entityResults: [
    { limiter: limiter("not-elevated", "none"), mastery: mastery("acquired"), saturation: { status: "supported", type: "transfer-limited", diagnostics: { plateauMechanismFamily: "unknown" } } },
  ] });
  assert.equal(transferType.status, "supported");
  assert.equal(transferType.type, "transfer");
});
