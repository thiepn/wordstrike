import assert from "node:assert/strict";
import {
  ARCADE_RUSH_CONTRACT_VERSION,
  ARCADE_RUSH_DRAFT_RULES_VERSION,
  ARCADE_RUSH_MODE_ID,
  buildArcadeRushSessionResult,
  createArcadeRushModeData,
  isArcadeRushGlobalRecordEligible,
  isArcadeRushResultContract,
  recomputeArcadeRushResultScore,
  validateArcadeRushCanonicalResult,
} from "../js/arcadeRush/index.js";
import { ARCADE_RUSH_SCORING_GOLDEN_FIXTURES } from "./fixtures/arcadeRushScoringFixtures.js";

function resultInput(fixture) {
  const success = fixture.input.success;
  return {
    sessionId: `session-${fixture.id}`,
    sessionSource: "arcade-rush-ready",
    startedAt: 1_000,
    endedAt: 301_000,
    durationMs: 300_000,
    activeDurationMs: 290_000,
    seed: 123_456,
    developerMode: false,
    success,
    accuracy: fixture.input.accuracy,
    wpm: 78,
    characters: {
      correct: 1_200,
      incorrect: 30,
      missed: success ? 10 : 60,
      totalKeystrokes: 1_230,
    },
    words: {
      completed: success ? 120 : Math.max(1, fixture.input.wavesCompleted * 18),
      missed: success ? 0 : 3,
      total: success ? 120 : Math.max(1, fixture.input.wavesCompleted * 18) + 3,
    },
    combo: { maximum: success ? 72 : 31, final: success ? 18 : 0 },
    ...fixture.input,
  };
}

for (const fixture of ARCADE_RUSH_SCORING_GOLDEN_FIXTURES) {
  const input = resultInput(fixture);
  const result = buildArcadeRushSessionResult(input);
  assert.ok(result, `${fixture.id} must build a shared SessionResult`);
  assert.equal(result.modeId, ARCADE_RUSH_MODE_ID);
  assert.equal(result.modeData.contractVersion, ARCADE_RUSH_CONTRACT_VERSION);
  assert.equal(result.modeData.rulesVersion, ARCADE_RUSH_DRAFT_RULES_VERSION);
  assert.equal(result.modeData.recordEligible, false, "draft AR3 results cannot enter a global board");
  assert.equal(result.score, fixture.expected.total);
  assert.equal(result.success, fixture.input.success);
  assert.equal(result.failureReason, fixture.input.success ? null : "core-destroyed");
  assert.equal(isArcadeRushResultContract(result), true);
  const validation = validateArcadeRushCanonicalResult(result);
  assert.deepEqual(validation.errors, [], `${fixture.id} validation changed`);
  assert.equal(validation.valid, true);
  assert.equal(validation.recomputedScore, fixture.expected.total);
  assert.equal(recomputeArcadeRushResultScore(result)?.total, fixture.expected.total);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.modeData), true);
}

const average = ARCADE_RUSH_SCORING_GOLDEN_FIXTURES.find(({ id }) => id === "average-success");
const canonical = buildArcadeRushSessionResult(resultInput(average));
assert.ok(canonical);
const tamperedTotal = { ...canonical, score: canonical.score + 1 };
assert.equal(validateArcadeRushCanonicalResult(tamperedTotal).valid, false);
assert.ok(validateArcadeRushCanonicalResult(tamperedTotal).errors.includes("score-total"));
const tamperedModeData = {
  ...canonical,
  modeData: { ...canonical.modeData, integrityBonus: canonical.modeData.integrityBonus + 1 },
};
assert.equal(validateArcadeRushCanonicalResult(tamperedModeData).valid, false);
assert.ok(validateArcadeRushCanonicalResult(tamperedModeData).errors.includes("score-component:integrityBonus"));

assert.equal(createArcadeRushModeData({
  success: true,
  wavesCompleted: 5,
  bossDefeated: true,
  bossTimeRemainingMs: 1_000,
  integrityRemaining: 1,
  perfectWaves: 0,
  wordPoints: 1_000,
  accuracy: 100,
}), null);
assert.equal(buildArcadeRushSessionResult({
  ...resultInput(average),
  words: { completed: 100, missed: 1, total: 100 },
}), null);

assert.equal(isArcadeRushGlobalRecordEligible({
  success: true,
  bossDefeated: true,
  developerMode: false,
  rulesVersion: 1,
}), true);
assert.equal(isArcadeRushGlobalRecordEligible({
  success: true,
  bossDefeated: true,
  developerMode: false,
  rulesVersion: 0,
}), false);
assert.equal(isArcadeRushGlobalRecordEligible({
  success: true,
  bossDefeated: true,
  developerMode: true,
  rulesVersion: 1,
}), false);

console.log("Arcade Rush AR3 canonical SessionResult construction and validation passed.");
