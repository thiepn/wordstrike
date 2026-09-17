import assert from "node:assert/strict";
import {
  buildFlowWeaknessProfile,
  createAdaptiveFocusSchedule,
  getAdaptivePassageFit,
  parseFlowWeaknessProfile,
  serializeFlowWeaknessProfile,
} from "../js/flow/flowAdaptive.js";
import { createFlowRunPlan } from "../js/flow/flowRunPlan.js";
import { FLOW_PASSAGE_CATALOG } from "../js/flow/flowCatalog.js";

const synthetic = {
  passageId: "adaptive-source",
  passage: `Alice didn't pause, but Alice didn't rush either. At 19:45, she wrote carefully and continued.`,
  errorTimings: [
    { index: 7, expected: "d", actual: "s" },
    { index: 31, expected: "d", actual: "s" },
    { index: 53, expected: "1", actual: "2" },
    { index: 54, expected: "9", actual: "8" },
  ],
  cadence: {
    sampleCount: 42,
    baselineIntervalMs: 150,
    featureLatencies: [
      { key: "apostrophes", sampleCount: 3, deltaMs: 180 },
      { key: "after-comma", sampleCount: 4, deltaMs: 25 },
      { key: "numbers", sampleCount: 4, deltaMs: 140 },
      { key: "capitals", sampleCount: 1, deltaMs: 500 },
    ],
  },
};

const profile = buildFlowWeaknessProfile(synthetic);
assert.ok(profile.weaknesses.length >= 3, profile);
assert.equal(profile.weaknesses.some(({ key }) => key === "apostrophes"), true);
assert.equal(profile.weaknesses.some(({ key }) => key === "numbers"), true);
assert.equal(profile.weaknesses.some(({ key }) => key === "typo-pair"), true);
assert.equal(profile.weaknesses.some(({ key }) => key === "capitals"), false, "one hesitation sample must not redirect training");

const typo = profile.weaknesses.find(({ key }) => key === "typo-pair");
assert.equal(typo.expected, "d");
assert.equal(typo.actual, "s");

const serialized = serializeFlowWeaknessProfile(profile);
const parsed = parseFlowWeaknessProfile(serialized);
assert.deepEqual(
  parsed.weaknesses.map(({ key, score, expected, actual }) => [key, score, expected, actual]),
  profile.weaknesses.map(({ key, score, expected = null, actual = null }) => [key, score, expected, actual]),
);

assert.deepEqual(createAdaptiveFocusSchedule(1, parsed).map(({ slot }) => slot), [0]);
assert.deepEqual(createAdaptiveFocusSchedule(3, parsed).map(({ slot }) => slot), [1]);
assert.deepEqual(createAdaptiveFocusSchedule(5, parsed).map(({ slot }) => slot), [2]);
assert.deepEqual(createAdaptiveFocusSchedule(24, parsed).map(({ slot }) => slot), [4, 8, 12, 16, 20]);

const standard = createFlowRunPlan({
  sessionLength: "standard",
  difficulty: "expert",
  seed: "phase10-standard",
  adaptiveProfile: parsed,
});
assert.equal(standard.passageCount, 3);
assert.equal(standard.adaptive.enabled, true);
assert.equal(standard.adaptive.targetedPassageCount, 1);
assert.equal(standard.adaptive.normalPassageCount, 2);
assert.equal(standard.segments.filter(({ adaptiveFocus }) => adaptiveFocus).length, 1);
assert.equal(standard.adaptive.targetRatio, 0.333);

const long = createFlowRunPlan({
  sessionLength: "long",
  difficulty: "expert",
  seed: "phase10-long",
  adaptiveProfile: parsed,
});
assert.equal(long.passageCount, 5);
assert.equal(long.adaptive.targetedPassageCount, 1);
assert.equal(long.adaptive.normalPassageCount, 4);
assert.equal(long.adaptive.targetRatio, 0.2);

const sprint = createFlowRunPlan({
  sessionLength: "quick",
  difficulty: "expert",
  seed: "phase10-sprint",
  modifiers: ["sprint"],
  adaptiveProfile: parsed,
});
assert.equal(sprint.passageCount, 1);
assert.equal(sprint.adaptive.targetedPassageCount, 1);

const apostrophe = parsed.weaknesses.find(({ key }) => key === "apostrophes");
const apostrophePassage = FLOW_PASSAGE_CATALOG.find(({ id }) => id === "dialogue-natural-01");
const plainPassage = FLOW_PASSAGE_CATALOG.find(({ id }) => id === "academic-smooth-01");
assert.ok(getAdaptivePassageFit(apostrophePassage, apostrophe) > getAdaptivePassageFit(plainPassage, apostrophe));

const lowConfidence = buildFlowWeaknessProfile({
  passage: "Simple text.",
  errorTimings: [{ index: 1, expected: "i", actual: "o" }],
  cadence: { sampleCount: 8, baselineIntervalMs: 150, featureLatencies: [{ key: "capitals", sampleCount: 1, deltaMs: 900 }] },
});
assert.equal(lowConfidence.weaknesses.length, 0, "one-off noise must not create an adaptive weakness");

console.log("Flow Phase 10 adaptive contracts passed: confidence gating, serialization, shorter-session focus scheduling, planner targeting, Sprint compatibility, and noise resistance.");
