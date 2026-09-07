import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRACTICE_ASSESSMENT_BLOCKS,
  PRACTICE_ASSESSMENT_DEPTH_DURATION_MS,
  PRACTICE_ASSESSMENT_PROTOCOL_VERSION,
  PRACTICE_ASSESSMENT_POLICY_VERSION,
  getPracticeAssessmentBlocksForDepth,
  getPracticeAssessmentMinimumFormGraphemes,
} from "../js/practiceLab/practiceAssessmentConstants.js";

const ids = PRACTICE_ASSESSMENT_BLOCKS.map((block) => block.blockId);
const durations = PRACTICE_ASSESSMENT_BLOCKS.map((block) => block.durationMs);

test("PL19 v1 protocol locks exact ordered block IDs and timing", () => {
  assert.equal(PRACTICE_ASSESSMENT_PROTOCOL_VERSION, 1);
  assert.equal(PRACTICE_ASSESSMENT_POLICY_VERSION, 1);
  assert.deepEqual(ids, [
    "benchmark-natural",
    "diagnostic-core-keys",
    "diagnostic-word-launch",
    "diagnostic-combinations",
    "diagnostic-punctuation-capitals",
    "diagnostic-numbers-symbols",
    "diagnostic-lexical-extended",
    "diagnostic-combinations-extended",
    "diagnostic-mixed",
    "cold-transfer",
  ]);
  assert.deepEqual(durations, [60_000, 90_000, 90_000, 120_000, 60_000, 60_000, 60_000, 60_000, 60_000, 60_000]);
  assert.equal(PRACTICE_ASSESSMENT_DEPTH_DURATION_MS.quick, 240_000);
  assert.equal(PRACTICE_ASSESSMENT_DEPTH_DURATION_MS.standard, 480_000);
  assert.equal(PRACTICE_ASSESSMENT_DEPTH_DURATION_MS.deep, 720_000);
});

test("PL19 Standard is exact Quick prefix and Deep is exact Standard prefix", () => {
  const quick = getPracticeAssessmentBlocksForDepth("quick");
  const standard = getPracticeAssessmentBlocksForDepth("standard");
  const deep = getPracticeAssessmentBlocksForDepth("deep");
  assert.deepEqual(standard.slice(0, quick.length), quick);
  assert.deepEqual(deep.slice(0, standard.length), standard);
  assert.equal(quick.reduce((sum, block) => sum + block.durationMs, 0), 240_000);
  assert.equal(standard.reduce((sum, block) => sum + block.durationMs, 0), 480_000);
  assert.equal(deep.reduce((sum, block) => sum + block.durationMs, 0), 720_000);
});

test("PL19 form capacity uses 400 WPM engineering sizing with ten-percent buffer", () => {
  assert.equal(getPracticeAssessmentMinimumFormGraphemes(60_000), 2_200);
  assert.equal(getPracticeAssessmentMinimumFormGraphemes(90_000), 3_300);
  assert.equal(getPracticeAssessmentMinimumFormGraphemes(120_000), 4_400);
  assert.equal(getPracticeAssessmentMinimumFormGraphemes(0), null);
});
