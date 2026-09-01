import assert from "node:assert/strict";
import {
  ARCADE_RUSH_CONTRACT_VERSION,
  ARCADE_RUSH_DISPLAY_NAME,
  ARCADE_RUSH_FAILURE_REASONS,
  ARCADE_RUSH_FINALE_COUNT,
  ARCADE_RUSH_GLOBAL_RANKING_POLICY,
  ARCADE_RUSH_LIFECYCLE_SEQUENCE,
  ARCADE_RUSH_MODE_DATA_FIELDS,
  ARCADE_RUSH_MODE_ID,
  ARCADE_RUSH_READY_ROUTE,
  ARCADE_RUSH_REQUIRED_RESULT_FIELDS,
  ARCADE_RUSH_RULES_STATUS,
  ARCADE_RUSH_SCORE_COMPONENT_FIELDS,
  ARCADE_RUSH_STARTING_INTEGRITY,
  ARCADE_RUSH_TARGET_DURATION_MS,
  ARCADE_RUSH_TERMINAL_STATES,
  ARCADE_RUSH_V1_NON_GOALS,
  ARCADE_RUSH_WAVE_COUNT,
  isArcadeRushTerminalState,
  isArcadeRushWaveState,
} from "../js/arcadeRush/arcadeRushContract.js";

assert.equal(ARCADE_RUSH_CONTRACT_VERSION, 1);
assert.equal(ARCADE_RUSH_MODE_ID, "arcade-rush");
assert.equal(ARCADE_RUSH_DISPLAY_NAME, "Arcade Rush");
assert.equal(ARCADE_RUSH_READY_ROUTE, "arcade-rush-ready");
assert.deepEqual(ARCADE_RUSH_TARGET_DURATION_MS, {
  minimum: 240000,
  maximum: 360000,
});
assert.equal(ARCADE_RUSH_WAVE_COUNT, 6);
assert.equal(ARCADE_RUSH_FINALE_COUNT, 1);
assert.equal(ARCADE_RUSH_STARTING_INTEGRITY, 5);
assert.equal(ARCADE_RUSH_RULES_STATUS, "UNFROZEN_UNTIL_AR10");

assert.deepEqual(ARCADE_RUSH_LIFECYCLE_SEQUENCE, [
  "READY",
  "WAVE_1",
  "WAVE_TRANSITION",
  "WAVE_2",
  "WAVE_TRANSITION",
  "WAVE_3",
  "WAVE_TRANSITION",
  "WAVE_4",
  "WAVE_TRANSITION",
  "WAVE_5",
  "WAVE_TRANSITION",
  "WAVE_6",
  "BOSS_INTRO",
  "BOSS",
  "COMPLETE",
]);
assert.deepEqual(ARCADE_RUSH_TERMINAL_STATES, ["COMPLETE", "FAILED"]);
assert.deepEqual(ARCADE_RUSH_FAILURE_REASONS, ["core-destroyed"]);

for (let wave = 1; wave <= ARCADE_RUSH_WAVE_COUNT; wave += 1) {
  assert.equal(isArcadeRushWaveState(`WAVE_${wave}`), true);
}
assert.equal(isArcadeRushWaveState("WAVE_7"), false);
assert.equal(isArcadeRushWaveState("WAVE_TRANSITION"), false);
assert.equal(isArcadeRushTerminalState("COMPLETE"), true);
assert.equal(isArcadeRushTerminalState("FAILED"), true);
assert.equal(isArcadeRushTerminalState("BOSS"), false);

assert.equal(new Set(ARCADE_RUSH_REQUIRED_RESULT_FIELDS).size, ARCADE_RUSH_REQUIRED_RESULT_FIELDS.length);
assert.equal(new Set(ARCADE_RUSH_MODE_DATA_FIELDS).size, ARCADE_RUSH_MODE_DATA_FIELDS.length);
assert.equal(new Set(ARCADE_RUSH_SCORE_COMPONENT_FIELDS).size, ARCADE_RUSH_SCORE_COMPONENT_FIELDS.length);
for (const field of ARCADE_RUSH_SCORE_COMPONENT_FIELDS) {
  assert.equal(ARCADE_RUSH_MODE_DATA_FIELDS.includes(field), true, `${field} must be part of modeData`);
}
for (const field of [
  "contractVersion",
  "rulesVersion",
  "recordEligible",
  "wavesCompleted",
  "finalWave",
  "bossDefeated",
  "integrityRemaining",
  "perfectWaves",
]) {
  assert.equal(ARCADE_RUSH_MODE_DATA_FIELDS.includes(field), true, `${field} is required by the AR0 contract`);
}

assert.equal(ARCADE_RUSH_GLOBAL_RANKING_POLICY.completedRunsOnly, true);
assert.equal(ARCADE_RUSH_GLOBAL_RANKING_POLICY.requiresFinalBossDefeat, true);
assert.equal(ARCADE_RUSH_GLOBAL_RANKING_POLICY.retryUsesNewSeed, true);
assert.equal(ARCADE_RUSH_GLOBAL_RANKING_POLICY.calendarScoped, false);
assert.equal(ARCADE_RUSH_GLOBAL_RANKING_POLICY.attemptLimited, false);
assert.deepEqual(ARCADE_RUSH_GLOBAL_RANKING_POLICY.tieBreakOrder, [
  "score:desc",
  "accuracy:desc",
  "activeDurationMs:asc",
  "endedAt:asc",
]);

for (const removedDailyConcept of ["daily-seeds", "calendar-challenges", "daily-streaks", "attempt-limits"]) {
  assert.equal(ARCADE_RUSH_V1_NON_GOALS.includes(removedDailyConcept), true);
}
assert.equal(ARCADE_RUSH_V1_NON_GOALS.includes("gameplay-attestation"), true);

for (const value of [
  ARCADE_RUSH_TARGET_DURATION_MS,
  ARCADE_RUSH_LIFECYCLE_SEQUENCE,
  ARCADE_RUSH_TERMINAL_STATES,
  ARCADE_RUSH_FAILURE_REASONS,
  ARCADE_RUSH_REQUIRED_RESULT_FIELDS,
  ARCADE_RUSH_MODE_DATA_FIELDS,
  ARCADE_RUSH_SCORE_COMPONENT_FIELDS,
  ARCADE_RUSH_GLOBAL_RANKING_POLICY,
  ARCADE_RUSH_GLOBAL_RANKING_POLICY.tieBreakOrder,
  ARCADE_RUSH_V1_NON_GOALS,
]) {
  assert.equal(Object.isFrozen(value), true);
}

console.log("Arcade Rush AR0 contract freeze tests passed.");
