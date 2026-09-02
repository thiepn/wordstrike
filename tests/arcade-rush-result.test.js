import assert from "node:assert/strict";
import {
  ARCADE_RUSH_CONTRACT_VERSION,
  ARCADE_RUSH_DRAFT_RULES_VERSION,
  ARCADE_RUSH_MODE_ID,
  ARCADE_RUSH_RULES_VERSION,
  ARCADE_RUSH_TOTAL_PLANNED_WORDS,
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
  const completed = success
    ? ARCADE_RUSH_TOTAL_PLANNED_WORDS
    : Math.max(1, fixture.input.wavesCompleted * 23);
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
      completed,
      missed: success ? 0 : 3,
      total: completed + (success ? 0 : 3),
    },
    combo: { maximum: success ? 92 : 31, final: success ? 18 : 0 },
    ...fixture.input,
  };
}

assert.equal(ARCADE_RUSH_RULES_VERSION, 1);
assert.equal(ARCADE_RUSH_DRAFT_RULES_VERSION, ARCADE_RUSH_RULES_VERSION);

for (const fixture of ARCADE_RUSH_SCORING_GOLDEN_FIXTURES) {
  const input = resultInput(fixture);
  const result = buildArcadeRushSessionResult(input);
  assert.ok(result, `${fixture.id} must build a shared SessionResult`);
  assert.equal(result.modeId, ARCADE_RUSH_MODE_ID);
  assert.equal(result.modeData.contractVersion, ARCADE_RUSH_CONTRACT_VERSION);
  assert.equal(result.modeData.rulesVersion, ARCADE_RUSH_RULES_VERSION);
  assert.equal(
    result.modeData.recordEligible,
    fixture.input.success,
    "only successful non-developer rules-v1 runs may enter the future global board",
  );
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
assert.equal(canonical.modeData.recordEligible, true);
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

const developerSuccess = buildArcadeRushSessionResult({
  ...resultInput(average),
  sessionId: "developer-success",
  developerMode: true,
});
assert.ok(developerSuccess);
assert.equal(developerSuccess.modeData.recordEligible, false);

assert.equal(isArcadeRushGlobalRecordEligible({
  success: true,
  bossDefeated: true,
  developerMode: false,
  rulesVersion: ARCADE_RUSH_RULES_VERSION,
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
  rulesVersion: ARCADE_RUSH_RULES_VERSION,
}), false);

console.log("Arcade Rush AR3 canonical SessionResult and AR10 rules-v1 eligibility passed.");
