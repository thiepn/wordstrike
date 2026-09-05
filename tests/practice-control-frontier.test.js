import assert from "node:assert/strict";
import { test } from "node:test";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import { buildPracticeControlFrontier, buildPracticeFrontierObservationBatch, validatePracticeFrontierMeasurementCandidate } from "../js/practiceLab/practiceControlFrontier.js";
import { derivePracticeBurstReserve } from "../js/practiceLab/practicePerformanceState.js";
import { validatePracticeControlFrontier, validatePracticeFrontierBatch } from "../js/practiceLab/practicePerformanceValidation.js";

const profileId = createPracticeId("profile", { uuid: () => "pl14-frontier-profile-12345678" });
const contextId = createPracticeId("context", { uuid: () => "pl14-frontier-context-12345678" });
const foundationAnalysis = { normalization: { sessionSummary: { textDifficulty: { status: "full", difficultyIndex: 0, availableModelWeight: 1 } } } };

function batch(sessionSuffix, stages) {
  const sessionId = createPracticeId("session", { uuid: () => `pl14-frontier-${sessionSuffix}-12345678` });
  return buildPracticeFrontierObservationBatch({
    measurement: { stages: stages.map((stage, index) => ({ stageId: `${sessionSuffix}-${index}`, stageOrdinal: index, plannedPaceWpm: stage.wpm, observedWpm: stage.wpm, accuracy: stage.accuracy, disfluencyRate: stage.disfluency, correctionCostRate: stage.correction, activeDurationMs: 15_000, typedCharacterCount: 60 })) },
    session: { sessionId, profileId, contextId, completedAtUtc: `2026-09-0${sessionSuffix === "a" ? 1 : 2}T12:00:00.000Z` },
    foundationAnalysis,
    evidenceRole: "diagnostic",
  });
}

const bracketStages = [
  { wpm: 90, accuracy: 99, disfluency: 0.02, correction: 0.01 },
  { wpm: 100, accuracy: 99, disfluency: 0.02, correction: 0.01 },
  { wpm: 110, accuracy: 98, disfluency: 0.03, correction: 0.02 },
  { wpm: 120, accuracy: 96, disfluency: 0.08, correction: 0.07 },
  { wpm: 130, accuracy: 95, disfluency: 0.09, correction: 0.08 },
];

test("PL14 frontier candidate enforces session-local unique stages and increasing ordinals", () => {
  assert.throws(() => validatePracticeFrontierMeasurementCandidate({ stages: [
    { stageId: "a", stageOrdinal: 1, observedWpm: 100, accuracy: 99, activeDurationMs: 10_000, typedCharacterCount: 30 },
    { stageId: "a", stageOrdinal: 2, observedWpm: 110, accuracy: 99, activeDurationMs: 10_000, typedCharacterCount: 30 },
  ] }), /unique/i);
  assert.throws(() => validatePracticeFrontierMeasurementCandidate({ stages: [
    { stageId: "a", stageOrdinal: 2, observedWpm: 100, accuracy: 99, activeDurationMs: 10_000, typedCharacterCount: 30 },
    { stageId: "b", stageOrdinal: 1, observedWpm: 110, accuracy: 99, activeDurationMs: 10_000, typedCharacterCount: 30 },
  ] }), /strictly increasing/i);
});

test("PL14 bracketed frontier uses personal baseline, sustained failure and exact loss crossing", () => {
  const first = batch("a", bracketStages);
  const second = batch("b", bracketStages);
  assert.equal(validatePracticeFrontierBatch(first).valid, true);
  const model = buildPracticeControlFrontier([...first.points, ...second.points]);
  assert.equal(model.status, "bracketed");
  assert.equal(model.confidence, "high");
  assert.equal(model.validPointCount, 10);
  assert.equal(model.sessionCount, 2);
  assert.equal(model.baselineAccuracy, 99);
  assert.ok(model.frontierLowerWpm <= model.frontierWpm && model.frontierWpm <= model.frontierUpperWpm);
  assert.ok(model.frontierWpm > 110 && model.frontierWpm < 120);
  assert.equal(validatePracticeControlFrontier(model).valid, true);
});

test("PL14 all controlled bins produce an explicit lower bound rather than a false exact frontier", () => {
  const allControlled = [90, 100, 110, 120, 130].map((wpm) => ({ wpm, accuracy: 99, disfluency: 0.02, correction: 0.01 }));
  const model = buildPracticeControlFrontier(batch("a", allControlled).points);
  assert.equal(model.status, "lower-bound");
  assert.equal(model.frontierIsLowerBound, true);
  assert.equal(model.frontierUpperWpm, null);
  assert.equal(model.frontierWpm, model.frontierLowerWpm);
});

test("PL14 narrow speed evidence is insufficient-range and poor low-speed baseline is insufficient-control", () => {
  const narrow = [100, 101, 102, 103, 104].map((wpm) => ({ wpm, accuracy: 99, disfluency: 0.02, correction: 0.01 }));
  assert.equal(buildPracticeControlFrontier(batch("a", narrow).points).status, "insufficient-range");
  const poor = [90, 100, 110, 120, 130].map((wpm) => ({ wpm, accuracy: wpm <= 100 ? 80 : 78, disfluency: 0.10, correction: 0.10 }));
  assert.equal(buildPracticeControlFrontier(batch("a", poor).points).status, "insufficient-control");
});

test("PL14 non-monotonic pass/fail evidence without two consecutive failures remains provisional", () => {
  const stages = [
    { wpm: 90, accuracy: 99, disfluency: 0.02, correction: 0.01 },
    { wpm: 100, accuracy: 95, disfluency: 0.08, correction: 0.07 },
    { wpm: 110, accuracy: 99, disfluency: 0.02, correction: 0.01 },
    { wpm: 120, accuracy: 95, disfluency: 0.08, correction: 0.07 },
    { wpm: 130, accuracy: 99, disfluency: 0.02, correction: 0.01 },
  ];
  assert.equal(buildPracticeControlFrontier(batch("a", stages).points).status, "provisional");
});

test("PL14 absolute 90% floor and relative disfluency/correction loss can independently make a bin uncontrolled", () => {
  const accuracyFail = [...bracketStages];
  accuracyFail[3] = { wpm: 120, accuracy: 89, disfluency: 0.02, correction: 0.01 };
  const accuracyModel = buildPracticeControlFrontier([...batch("a", accuracyFail).points, ...batch("b", accuracyFail).points]);
  assert.equal(accuracyModel.status, "bracketed");
  const disfluencyFail = bracketStages.map((stage, index) => index >= 3 ? { ...stage, accuracy: 99, disfluency: 0.09, correction: 0.01 } : { ...stage, accuracy: 99, disfluency: 0.02, correction: 0.01 });
  assert.equal(buildPracticeControlFrontier([...batch("a", disfluencyFail).points, ...batch("b", disfluencyFail).points]).status, "bracketed");
  const correctionFail = bracketStages.map((stage, index) => index >= 3 ? { ...stage, accuracy: 99, disfluency: 0.02, correction: 0.08 } : { ...stage, accuracy: 99, disfluency: 0.02, correction: 0.01 });
  assert.equal(buildPracticeControlFrontier([...batch("a", correctionFail).points, ...batch("b", correctionFail).points]).status, "bracketed");
});

test("PL14 burst reserve is derived, unavailable without both models, and preserves negative inconsistency", () => {
  const frontier = { status: "bracketed", frontierWpm: 110 };
  const available = derivePracticeBurstReserve({ burstAbilityState: { estimate: { estimateWpm: 140 } }, controlFrontier: frontier });
  assert.equal(available.status, "available");
  assert.equal(available.reserveWpm, 30);
  assert.ok(Math.abs(available.reserveRatio - (140 / 110 - 1)) < 1e-12);
  assert.equal(derivePracticeBurstReserve({ burstAbilityState: null, controlFrontier: frontier }).status, "unavailable");
  const inconsistent = derivePracticeBurstReserve({ burstAbilityState: { estimate: { estimateWpm: 100 } }, controlFrontier: frontier });
  assert.equal(inconsistent.status, "inconsistent");
  assert.equal(inconsistent.reserveWpm, -10);
});
