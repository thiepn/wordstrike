import test from "node:test";
import assert from "node:assert/strict";
import {
  PRACTICE_PACE_LADDER_MAIN_STAGE_IDS,
  PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS,
} from "../js/practiceLab/practicePaceLadderConstants.js";
import {
  PRACTICE_PACE_LADDER_POLICY_V1,
  validatePracticePaceLadderPolicy,
} from "../js/practiceLab/practicePaceLadderPolicy.js";
import { createPracticePaceLadderExperiment } from "../js/practiceLab/practicePaceLadderExperiment.js";
import { mapPaceLadderStagesToPerformancePoints } from "../js/practiceLab/practicePaceLadderMeasurement.js";

const validStage = (stageId, stageOrdinal) => ({
  stageId,
  stageOrdinal,
  targetWpm: 80 + stageOrdinal * 10,
  correctedWpm: 78 + stageOrdinal * 10,
  strictAccuracy: 0.98,
  longPauseRate: 0.01,
  unstableErrorRate: 0.02,
  correctionOverheadRate: 0.03,
  usableSeconds: 25,
  correctedChars: 180,
  valid: true,
  coverage: "complete",
});

const completeResult = () => ({
  status: "complete",
  stages: PRACTICE_PACE_LADDER_MAIN_STAGE_IDS.map(validStage),
});

test("PL26 freezes the Pace Ladder protocol and evidence contract", () => {
  assert.equal(validatePracticePaceLadderPolicy(), true);
  assert.equal(PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS, 190_000);
  assert.deepEqual(PRACTICE_PACE_LADDER_POLICY_V1.rungRatios, [0.85, 0.95, 1.05, 1.15, 1.25]);
  assert.equal(PRACTICE_PACE_LADDER_POLICY_V1.calibrationDurationMs, 25_000);
  assert.equal(PRACTICE_PACE_LADDER_POLICY_V1.stageDurationMs, 25_000);
  assert.equal(PRACTICE_PACE_LADDER_POLICY_V1.validationDurationMs, 40_000);
  assert.equal(PRACTICE_PACE_LADDER_POLICY_V1.minimumFrontierStages, 5);
});

test("PL26 descriptor is catalog-compatible and delegates performance inference to PL14", () => {
  const descriptor = createPracticePaceLadderExperiment();
  assert.equal(descriptor.id, "pace-ladder");
  assert.equal(descriptor.category, "advanced");
  assert.equal(descriptor.performanceMeasurementKind, "control-frontier");
  assert.equal(descriptor.performanceReferenceChannel, "controlled-speed");
  assert.equal(descriptor.resumable, false);
});

test("PL26 admits only a complete five-stage ladder into the control frontier", () => {
  const points = mapPaceLadderStagesToPerformancePoints(completeResult());
  assert.equal(points.length, 5);
  assert.deepEqual(points.map(({ stageId }) => stageId), PRACTICE_PACE_LADDER_MAIN_STAGE_IDS);
  assert.equal(points.every(({ interrupted }) => interrupted === false), true);

  assert.deepEqual(mapPaceLadderStagesToPerformancePoints({ ...completeResult(), status: "interrupted" }), []);
  assert.deepEqual(mapPaceLadderStagesToPerformancePoints({ status: "complete", stages: completeResult().stages.slice(0, 4) }), []);
  const invalid = completeResult();
  invalid.stages[2] = { ...invalid.stages[2], valid: false };
  assert.deepEqual(mapPaceLadderStagesToPerformancePoints(invalid), []);
});
