import assert from "node:assert/strict";
import {
  ARCADE_RUSH_ACCURACY_BONUS_BPS,
  ARCADE_RUSH_BASE_POINTS_BY_TIER,
  ARCADE_RUSH_COMBO_MULTIPLIER_BPS,
  ARCADE_RUSH_DRAFT_RULES_VERSION,
  ARCADE_RUSH_RULES_VERSION,
  ARCADE_RUSH_SCORING_STATUS,
  ARCADE_RUSH_SCORING_VERSION,
  calculateArcadeRushAccuracyBonus,
  calculateArcadeRushFinalScore,
  calculateArcadeRushWaveClearBonus,
  calculateArcadeRushWordPoints,
  getArcadeRushAccuracyBonusBasisPoints,
  getArcadeRushComboMultiplierBasisPoints,
  sumArcadeRushScoreComponents,
} from "../js/arcadeRush/index.js";
import { ARCADE_RUSH_SCORING_GOLDEN_FIXTURES } from "./fixtures/arcadeRushScoringFixtures.js";

assert.equal(ARCADE_RUSH_SCORING_VERSION, 1);
assert.equal(ARCADE_RUSH_RULES_VERSION, 1);
assert.equal(ARCADE_RUSH_DRAFT_RULES_VERSION, ARCADE_RUSH_RULES_VERSION, "legacy draft import must resolve to frozen v1");
assert.equal(ARCADE_RUSH_SCORING_STATUS, "FROZEN_V1");
assert.equal(Object.isFrozen(ARCADE_RUSH_BASE_POINTS_BY_TIER), true);
assert.equal(Object.isFrozen(ARCADE_RUSH_COMBO_MULTIPLIER_BPS), true);
assert.equal(Object.isFrozen(ARCADE_RUSH_ACCURACY_BONUS_BPS), true);

assert.deepEqual(
  [1, 9, 10, 19, 20, 39, 40, 69, 70, 99, 100, 150]
    .map(getArcadeRushComboMultiplierBasisPoints),
  [10_000, 10_000, 11_000, 11_000, 12_500, 12_500, 15_000, 15_000, 17_500, 17_500, 20_000, 20_000],
);
assert.equal(getArcadeRushComboMultiplierBasisPoints(0), null);
assert.equal(getArcadeRushComboMultiplierBasisPoints(1.5), null);

assert.deepEqual(
  [1, 2, 3, 4, 5].map((pointTier) => calculateArcadeRushWordPoints({
    pointTier,
    comboAfterCompletion: 1,
  })),
  [100, 125, 160, 200, 250],
);
assert.equal(calculateArcadeRushWordPoints({ pointTier: 5, comboAfterCompletion: 100 }), 500);
assert.equal(calculateArcadeRushWordPoints({ pointTier: 2, comboAfterCompletion: 20 }), 156);
assert.equal(calculateArcadeRushWordPoints({ pointTier: 0, comboAfterCompletion: 10 }), null);

assert.deepEqual(
  [0, 1, 2, 3, 4, 5, 6].map(calculateArcadeRushWaveClearBonus),
  [0, 500, 1_500, 3_000, 5_000, 8_000, 12_000],
);
assert.equal(calculateArcadeRushWaveClearBonus(7), null);

assert.deepEqual(
  [89.99, 90, 94.99, 95, 97.99, 98, 99.99, 100]
    .map(getArcadeRushAccuracyBonusBasisPoints),
  [0, 500, 500, 1_000, 1_000, 2_000, 2_000, 3_000],
);
assert.equal(getArcadeRushAccuracyBonusBasisPoints(100.01), null);
assert.equal(calculateArcadeRushAccuracyBonus({ accuracy: 98, eligibleSubtotal: 10_000 }), 2_000);

for (const fixture of ARCADE_RUSH_SCORING_GOLDEN_FIXTURES) {
  const score = calculateArcadeRushFinalScore(fixture.input);
  assert.ok(score, `${fixture.id} must calculate`);
  assert.deepEqual(score.breakdown, fixture.expected.breakdown, `${fixture.id} breakdown changed`);
  assert.equal(score.total, fixture.expected.total, `${fixture.id} total changed`);
  assert.equal(sumArcadeRushScoreComponents(score.breakdown), fixture.expected.total);
  assert.equal(score.rulesVersion, ARCADE_RUSH_RULES_VERSION);
  assert.equal(score.scoringVersion, ARCADE_RUSH_SCORING_VERSION);
  assert.equal(score.scoringStatus, "FROZEN_V1");
}

assert.equal(calculateArcadeRushFinalScore({
  wordPoints: 100,
  wavesCompleted: 1,
  perfectWaves: 2,
  success: false,
  bossDefeated: false,
  integrityRemaining: 0,
  accuracy: 100,
  bossTimeRemainingMs: 0,
}), null);
assert.equal(calculateArcadeRushFinalScore({
  wordPoints: 100,
  wavesCompleted: 6,
  perfectWaves: 0,
  success: true,
  bossDefeated: false,
  integrityRemaining: 1,
  accuracy: 100,
  bossTimeRemainingMs: 0,
}), null);

console.log("Arcade Rush AR3 canonical scoring and AR10 frozen-v1 golden fixtures passed.");
