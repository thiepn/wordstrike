import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  ARCADE_RUSH_BOSS_PLAN_STATUS,
  ARCADE_RUSH_BOSS_TARGET_DURATION_MS,
  ARCADE_RUSH_BOSS_VERSION,
  ARCADE_RUSH_GENERATOR_CONFIG,
  ARCADE_RUSH_GENERATOR_VERSION,
  ARCADE_RUSH_PROFILE_STATUS,
  ARCADE_RUSH_TARGET_DURATION_MS,
  ARCADE_RUSH_TARGET_RUN_DURATION_MS,
  ARCADE_RUSH_TOTAL_PLANNED_WORDS,
  ARCADE_RUSH_WAVE_COUNT,
  ARCADE_RUSH_WAVE_PROFILES,
  createArcadeRushVocabulary,
  deriveArcadeRushDomainSeed,
  generateArcadeRushPlan,
  getArcadeRushWaveProfile,
  isArcadeRushGeneratorConfig,
  isArcadeRushVocabulary,
  isArcadeRushWaveProfile,
  isGeneratedArcadeRushPlan,
} from "../js/arcadeRush/index.js";

const source = JSON.parse(await fs.readFile(
  new URL("../data/commonGameplayWords.json", import.meta.url),
  "utf8",
));
const commonWords = source.words.map((entry) => typeof entry === "string" ? entry : entry.word);
const vocabulary = createArcadeRushVocabulary({ commonWords, campaignBank: source });

assert.equal(ARCADE_RUSH_GENERATOR_VERSION, 1);
assert.equal(ARCADE_RUSH_PROFILE_STATUS, "DRAFT_UNTIL_AR10");
assert.equal(ARCADE_RUSH_WAVE_PROFILES.length, ARCADE_RUSH_WAVE_COUNT);
assert.equal(ARCADE_RUSH_TOTAL_PLANNED_WORDS, 120);
assert.equal(ARCADE_RUSH_BOSS_TARGET_DURATION_MS, 45_000);
assert.equal(ARCADE_RUSH_TARGET_RUN_DURATION_MS, 300_000);
assert.ok(ARCADE_RUSH_TARGET_RUN_DURATION_MS >= ARCADE_RUSH_TARGET_DURATION_MS.minimum);
assert.ok(ARCADE_RUSH_TARGET_RUN_DURATION_MS <= ARCADE_RUSH_TARGET_DURATION_MS.maximum);
assert.equal(isArcadeRushGeneratorConfig(ARCADE_RUSH_GENERATOR_CONFIG), true);
assert.equal(Object.isFrozen(ARCADE_RUSH_GENERATOR_CONFIG), true);
assert.equal(Object.isFrozen(ARCADE_RUSH_WAVE_PROFILES), true);
for (const [index, profile] of ARCADE_RUSH_WAVE_PROFILES.entries()) {
  assert.equal(profile.wave, index + 1);
  assert.equal(getArcadeRushWaveProfile(index + 1), profile);
  assert.equal(isArcadeRushWaveProfile(profile), true);
  assert.equal(Object.values(profile.sourceCounts).reduce((sum, count) => sum + count, 0), profile.wordCount);
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(Object.isFrozen(profile.sourceCounts), true);
}
assert.equal(getArcadeRushWaveProfile(7), null);

assert.equal(isArcadeRushVocabulary(vocabulary), true);
assert.equal(Object.isFrozen(vocabulary), true);
for (const pool of Object.values(vocabulary)) assert.equal(Object.isFrozen(pool), true);

assert.notEqual(deriveArcadeRushDomainSeed(0, "wave-1-words"), deriveArcadeRushDomainSeed(1, "wave-1-words"));
assert.equal(deriveArcadeRushDomainSeed(-1, "wave-1-words"), null);
assert.equal(deriveArcadeRushDomainSeed(1, ""), null);

const first = generateArcadeRushPlan({ seed: 0x12345678, vocabulary });
const repeated = generateArcadeRushPlan({ seed: 0x12345678, vocabulary });
const different = generateArcadeRushPlan({ seed: 0x12345679, vocabulary });
assert.equal(isGeneratedArcadeRushPlan(first), true);
assert.deepEqual(repeated, first, "same seed and vocabulary must produce an identical plan");
assert.notDeepEqual(different, first, "different seeds must produce a different plan");
assert.equal(first.generatorVersion, ARCADE_RUSH_GENERATOR_VERSION);
assert.equal(first.waves.length, 6);
assert.equal(first.waves.reduce((sum, wave) => sum + wave.entries.length, 0), 120);
assert.equal(first.boss.id, "core-breaker");
assert.equal(first.boss.bossVersion, ARCADE_RUSH_BOSS_VERSION);
assert.equal(first.boss.status, ARCADE_RUSH_BOSS_PLAN_STATUS);
assert.equal(first.boss.targetDurationMs, 45_000);
assert.equal(Object.isFrozen(first), true);
assert.equal(Object.isFrozen(first.waves), true);

const allEntries = first.waves.flatMap((wave) => wave.entries);
assert.equal(new Set(allEntries.map((entry) => entry.word)).size, allEntries.length, "AR2 plans must not repeat words");
assert.deepEqual(allEntries.map((entry) => entry.globalIndex), Array.from({ length: 120 }, (_, index) => index));
for (const wave of first.waves) {
  const profile = getArcadeRushWaveProfile(wave.wave);
  const counts = Object.fromEntries(Object.keys(profile.sourceCounts).map((key) => [key, 0]));
  for (const entry of wave.entries) {
    counts[entry.source] += 1;
    assert.ok(entry.word.length >= profile.minWordLength && entry.word.length <= profile.maxWordLength);
    assert.ok(entry.edgeRatio >= 0.08 && entry.edgeRatio <= 0.92);
    assert.ok(entry.pointTier >= 1 && entry.pointTier <= 5);
    assert.equal(entry.trajectoryProfile.speedPxPerSec, profile.wordSpeedPxPerSec);
  }
  assert.deepEqual(counts, profile.sourceCounts);
  for (let index = 2; index < wave.entries.length; index += 1) {
    const edges = wave.entries.slice(index - 2, index + 1).map((entry) => entry.edge);
    assert.equal(new Set(edges).size === 1, false, `wave ${wave.wave} must not schedule three identical edges consecutively`);
  }
}

const changedSlots = allEntries.filter((entry, index) => entry.word !== different.waves.flatMap((wave) => wave.entries)[index].word).length;
assert.ok(changedSlots >= Math.floor(ARCADE_RUSH_TOTAL_PLANNED_WORDS * 0.75), "adjacent seeds should materially change the run");

assert.equal(generateArcadeRushPlan({ seed: -1, vocabulary }), null);
assert.equal(generateArcadeRushPlan({ seed: 1, vocabulary: {} }), null);

console.log("Arcade Rush AR2 deterministic generator contracts passed.");
