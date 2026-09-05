import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validatePracticeAutomaticityResult,
  validatePracticeEntityMasteryResult,
} from "../js/practiceLab/practiceMasteryValidation.js";

function automaticity(overrides = {}) {
  return {
    score: 80,
    status: "established",
    confidenceScore: 90,
    confidenceLevel: "high",
    coreScore: 90,
    components: { speed: 90, accuracy: 90, stability: 90, contextRobustness: 90 },
    hardGuardApplied: false,
    ...overrides,
  };
}

function entity(overrides = {}) {
  return {
    stage: "acquired",
    masteryScore: 70,
    acquisitionScore: 85,
    availableWeight: 75,
    automaticity: automaticity(),
    transfer: {
      score: null,
      confidenceLevel: "none",
      minimumEvidenceMet: false,
      gapEligible: true,
    },
    retention: {
      status: "unverified",
      score: null,
      confidenceLevel: "none",
      eligibleForRetained: false,
    },
    ...overrides,
  };
}

test("PL15 automaticity validation enforces bounded scores, confidence cap and status thresholds", () => {
  assert.doesNotThrow(() => validatePracticeAutomaticityResult(automaticity()));
  assert.throws(() => validatePracticeAutomaticityResult(automaticity({ score: 101 })));
  assert.throws(() => validatePracticeAutomaticityResult(automaticity({ score: 80, status: "strong" })));
  assert.throws(() => validatePracticeAutomaticityResult(automaticity({ score: 95, confidenceScore: 80, status: "strong" })));
});

test("PL15 entity validation rejects impossible stage claims", () => {
  assert.doesNotThrow(() => validatePracticeEntityMasteryResult(entity()));
  assert.throws(() => validatePracticeEntityMasteryResult(entity({ masteryScore: -1 })));
  assert.throws(() => validatePracticeEntityMasteryResult(entity({ stage: "transferred" })));

  const transfer = {
    score: 85,
    confidenceLevel: "medium",
    minimumEvidenceMet: true,
    gapEligible: true,
  };
  assert.doesNotThrow(() => validatePracticeEntityMasteryResult(entity({ stage: "transferred", transfer })));
  assert.throws(() => validatePracticeEntityMasteryResult(entity({
    stage: "retained",
    transfer,
    retention: {
      status: "verified",
      score: 90,
      confidenceLevel: "high",
      eligibleForRetained: false,
    },
  })));
});
