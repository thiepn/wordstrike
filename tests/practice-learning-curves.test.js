import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPracticeAcquisitionObservationDelta, buildPracticeTransferObservationDelta } from "../js/practiceLab/practiceLearningObservation.js";
import { buildPracticeAcquisitionCurve, buildPracticeTheilSenFit, buildPracticeTransferCurve } from "../js/practiceLab/practiceLearningCurve.js";
import { PRACTICE_LEARNING_POLICY_V1 } from "../js/practiceLab/practiceLearningPolicy.js";

function aggregate(count, meanMs) {
  return { count, meanMs, m2: 0, minMs: count ? meanMs : null, maxMs: count ? meanMs : null, recentSamples: [] };
}

function delta({ entityType = "bigram", role = "training", directTarget = true, opportunities = 50, errors = 1, residual = 0, disfluent = 2 } = {}) {
  const fluent = opportunities - disfluent;
  return {
    sessionId: "practice-session_pl16-learning-session-12345678",
    profileId: "practice-profile_pl16-learning-profile-12345678",
    contextId: "practice-context_pl16-learning-context-12345678",
    statId: "unused-in-unit-test",
    entityType,
    entityKey: entityType === "key" ? "a" : entityType === "bigram" ? "th" : entityType === "trigram" ? "the" : "there",
    evidenceRole: role,
    directTarget,
    observedAt: "2026-09-05T10:00:00.000Z",
    localDayKey: "2026-09-05",
    opportunities: { count: opportunities, correctCount: opportunities - errors, errorCount: errors, directTargetedCount: directTarget ? opportunities : 0, incidentalCount: directTarget ? 0 : opportunities },
    timing: {
      eligibleCount: opportunities,
      fluentCount: fluent,
      disfluentCount: disfluent,
      fluentLatency: aggregate(fluent, 100 + residual),
      fluentResidual: aggregate(fluent, residual),
      disfluentResidual: aggregate(disfluent, 35),
    },
  };
}

function acquisitionObservation(index, quality, { gain = 3, dose = index, day = index + 1 } = {}) {
  return {
    sessionId: `practice-session_curve-${index}-12345678`,
    completedAtUtc: `2026-09-${String(day).padStart(2, "0")}T10:00:00.000Z`,
    localDayKey: `2026-09-${String(day).padStart(2, "0")}`,
    cumulativeDoseBefore: dose,
    entryQuality: quality,
    exitQuality: quality + gain,
    practiceGain: gain,
  };
}

function transferObservation(index, quality, { dose = index, day = index + 1 } = {}) {
  return {
    sessionId: `practice-session_transfer-${index}-12345678`,
    completedAtUtc: `2026-09-${String(day).padStart(2, "0")}T12:00:00.000Z`,
    localDayKey: `2026-09-${String(day).padStart(2, "0")}`,
    cumulativeDoseAtObservation: dose,
    quality,
  };
}

test("PL16 acquisition dose uses exact 80/50/35/15 opportunity scales and excludes incidental evidence", () => {
  const expected = { key: 80, bigram: 50, trigram: 35, word: 15 };
  assert.deepEqual(PRACTICE_LEARNING_POLICY_V1.doseScales, expected);
  for (const [entityType, opportunities] of Object.entries(expected)) {
    const built = buildPracticeAcquisitionObservationDelta({ delta: delta({ entityType, opportunities }), experimentId: "training" });
    assert.equal(built.observation.doseUnits, 1);
  }
  assert.equal(buildPracticeAcquisitionObservationDelta({ delta: delta({ directTarget: false }), experimentId: "training" }), null);
  assert.equal(buildPracticeAcquisitionObservationDelta({ delta: delta({ role: "diagnostic" }), experimentId: "diagnostic" }), null);
  assert.equal(buildPracticeAcquisitionObservationDelta({ delta: delta({ role: "transfer" }), experimentId: "transfer" }), null);
});

test("PL16 quality reuses PL15 45/40/15 semantics and requires at least 60% original weight", () => {
  assert.deepEqual(PRACTICE_LEARNING_POLICY_V1.quality.weights, { accuracy: 0.45, speed: 0.40, disfluency: 0.15 });
  assert.equal(PRACTICE_LEARNING_POLICY_V1.quality.minimumAvailableWeight, 0.60);
  const built = buildPracticeAcquisitionObservationDelta({ delta: delta({ opportunities: 50, errors: 0, residual: 0, disfluent: 0 }), experimentId: "training" });
  assert.ok(built.observation.wholeQuality > 99);
  assert.equal(built.observation.qualityCoverage, 1);
});

test("PL16 transfer observation uses protected transfer role, minimum opportunities, quality and no acquisition dose", () => {
  const below = buildPracticeTransferObservationDelta({ delta: delta({ role: "transfer", opportunities: 9 }), experimentId: "transfer" });
  assert.equal(below, null);
  const valid = buildPracticeTransferObservationDelta({ delta: delta({ role: "transfer", opportunities: 10 }), experimentId: "transfer" });
  assert.equal(valid.kind, "transfer");
  assert.equal(valid.observation.cumulativeDoseAtObservation, null);
  assert.equal("doseUnits" in valid.observation, false);
  assert.ok(Number.isFinite(valid.observation.quality));
});

test("PL16 Theil-Sen detects clear learning and resists a single bizarre outlier", () => {
  const improving = [50, 60, 70, 80].map((quality, index) => acquisitionObservation(index, quality));
  const curve = buildPracticeAcquisitionCurve(improving);
  assert.equal(curve.status, "improving");
  assert.ok(curve.medianSlopePointsPerDose >= 9);

  const noisy = [50, 55, 60, 5, 70, 75, 80].map((quality, index) => acquisitionObservation(index, quality));
  const fit = buildPracticeTheilSenFit(noisy.map((observation) => ({ x: observation.cumulativeDoseBefore, y: observation.entryQuality })));
  assert.ok(fit.medianSlope > 3);
});

test("PL16 flat and worsening acquisition curves require sign/quality evidence rather than any visual flattening", () => {
  const flat = [60, 61, 60, 60, 61, 60].map((quality, index) => acquisitionObservation(index, quality));
  const flatCurve = buildPracticeAcquisitionCurve(flat);
  assert.equal(flatCurve.status, "flat");
  assert.equal(flatCurve.confidence, "medium");

  const worsening = [80, 76, 72, 68, 64, 60].map((quality, index) => acquisitionObservation(index, quality));
  const worseningCurve = buildPracticeAcquisitionCurve(worsening);
  assert.equal(worseningCurve.status, "worsening");
});

test("PL16 recent slope and marginal gain separate historical learning from current diminishing gain", () => {
  const qualities = [40, 50, 60, 70, 78, 80, 80.5, 80.7, 80.8];
  const observations = qualities.map((quality, index) => acquisitionObservation(index, quality));
  const curve = buildPracticeAcquisitionCurve(observations);
  assert.ok(curve.medianSlopePointsPerDose > 2);
  assert.ok(Math.abs(curve.recentSlopePointsPerDose) < 2);
  assert.equal(curve.marginalGainStatus, "low");
});

test("PL16 marginal-gain mapping follows high/moderate/low/negative thresholds", () => {
  const make = (slope) => {
    const observations = Array.from({ length: 6 }, (_, index) => acquisitionObservation(index, 50 + slope * index));
    return buildPracticeAcquisitionCurve(observations).marginalGainStatus;
  };
  assert.equal(make(5), "high");
  assert.equal(make(2.5), "moderate");
  assert.equal(make(0.5), "low");
  assert.equal(make(-2), "negative");
});

test("PL16 acquisition curves use entry quality, never prior-session exit quality", () => {
  const observations = [
    acquisitionObservation(0, 58, { gain: 20 }),
    acquisitionObservation(1, 60, { gain: 20 }),
    acquisitionObservation(2, 62, { gain: 20 }),
    acquisitionObservation(3, 64, { gain: 20 }),
  ];
  const curve = buildPracticeAcquisitionCurve(observations);
  assert.equal(curve.firstQuality, 58);
  assert.equal(curve.recentQuality, 64);
  assert.ok(curve.medianSlopePointsPerDose < 5);
  assert.equal(curve.medianPracticeGain, 20);
});

test("PL16 transfer curve uses cumulative acquisition dose and ignores same-dose pairs", () => {
  const observations = [
    transferObservation(0, 50, { dose: 1 }),
    transferObservation(1, 55, { dose: 1 }),
    transferObservation(2, 65, { dose: 2 }),
    transferObservation(3, 75, { dose: 3 }),
  ];
  const fit = buildPracticeTheilSenFit(observations.map((observation) => ({ x: observation.cumulativeDoseAtObservation, y: observation.quality })));
  assert.equal(fit.pairCount, 5);
  const curve = buildPracticeTransferCurve(observations);
  assert.ok(curve.medianSlopePointsPerDose > 0);
});
