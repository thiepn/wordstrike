import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPracticeAcquisitionCurve, buildPracticeTransferCurve } from "../js/practiceLab/practiceLearningCurve.js";
import { PRACTICE_LEARNING_POLICY_V1 } from "../js/practiceLab/practiceLearningPolicy.js";
import { evaluatePracticeSaturation } from "../js/practiceLab/practiceSaturationModel.js";

function acquisition(index, quality, gain = 1) {
  return {
    sessionId: `practice-session_sat-edge-a-${index}-12345678`,
    completedAtUtc: `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
    localDayKey: `2026-08-${String(index + 1).padStart(2, "0")}`,
    cumulativeDoseBefore: index,
    doseUnits: 1,
    entryQuality: quality,
    exitQuality: quality + gain,
    practiceGain: gain,
  };
}

function transfer(index, quality) {
  return {
    sessionId: `practice-session_sat-edge-t-${index}-12345678`,
    completedAtUtc: `2026-08-${String(index + 10).padStart(2, "0")}T12:00:00.000Z`,
    localDayKey: `2026-08-${String(index + 10).padStart(2, "0")}`,
    cumulativeDoseAtObservation: index + 1,
    quality,
  };
}

function state(acquisitionObservations, transferObservations = []) {
  return {
    acquisition: {
      observationCount: acquisitionObservations.length,
      observations: acquisitionObservations,
      curve: buildPracticeAcquisitionCurve(acquisitionObservations),
    },
    transfer: {
      observationCount: transferObservations.length,
      observations: transferObservations,
      curve: buildPracticeTransferCurve(transferObservations),
    },
  };
}

const acquired = { stage: "acquired", limiterGuard: { confirmedCritical: false, likelyCritical: false } };
const learning = { stage: "learning", limiterGuard: { confirmedCritical: false, likelyCritical: false } };
const noLimiter = { status: "not-elevated", primaryPhenotype: "none" };
const limiter = { status: "likely", primaryPhenotype: "slow" };

test("PL16 treats a true zero transfer quality as severe evidence rather than a missing-value fallback", () => {
  const acquisitions = [80, 82, 84, 86, 88, 90].map((quality, index) => acquisition(index, quality, 2));
  const transfers = [0, 0, 0, 0].map((quality, index) => transfer(index, quality));
  const result = evaluatePracticeSaturation({ learningState: state(acquisitions, transfers), mastery: acquired, limiter: noLimiter });
  assert.equal(result.type, "transfer-limited");
  assert.ok(["likely", "supported"].includes(result.status));
});

test("PL16 high-quality ceiling uses the versioned policy threshold instead of a hidden hard-coded 90", () => {
  const acquisitions = [96, 96, 96, 96, 96, 96].map((quality, index) => acquisition(index, quality, 0.5));
  const policy = {
    ...PRACTICE_LEARNING_POLICY_V1,
    saturation: {
      ...PRACTICE_LEARNING_POLICY_V1.saturation,
      resolvedQuality: 99,
      highQualityCeiling: 97,
    },
  };
  const result = evaluatePracticeSaturation({ learningState: state(acquisitions), mastery: acquired, limiter: noLimiter, policy });
  assert.notEqual(result.status, "resolved");
  assert.equal(result.reasons.includes("high-quality-ceiling"), false);
});

test("PL16 quality-based mastery resolution does not falsely claim the high-quality ceiling guard fired", () => {
  const acquisitions = [84, 85, 85, 85, 85, 85].map((quality, index) => acquisition(index, quality, 1));
  const result = evaluatePracticeSaturation({ learningState: state(acquisitions), mastery: acquired, limiter: noLimiter });
  assert.equal(result.status, "resolved");
  assert.equal(result.reasons.includes("mastery-acquired"), true);
  assert.equal(result.reasons.includes("high-quality-ceiling"), false);
});

test("PL16 low-quality plateau classification remains unchanged after transfer fallback hardening", () => {
  const acquisitions = [60, 60.2, 60.1, 60.3, 60.2, 60.2, 60.3, 60.2].map((quality, index) => acquisition(index, quality, 2));
  const result = evaluatePracticeSaturation({ learningState: state(acquisitions), mastery: learning, limiter });
  assert.equal(result.status, "likely");
  assert.equal(result.type, "acquisition-plateau");
});
