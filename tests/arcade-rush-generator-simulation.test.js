import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  ARCADE_RUSH_TOTAL_PLANNED_WORDS,
  ARCADE_RUSH_WAVE_PROFILES,
  createArcadeRushVocabulary,
  generateArcadeRushPlan,
  isGeneratedArcadeRushPlan,
} from "../js/arcadeRush/index.js";

const source = JSON.parse(await fs.readFile(
  new URL("../data/commonGameplayWords.json", import.meta.url),
  "utf8",
));
const commonWords = source.words.map((entry) => typeof entry === "string" ? entry : entry.word);
const vocabulary = createArcadeRushVocabulary({ commonWords, campaignBank: source });

const SIMULATION_SEEDS = 1_000;
const signatures = new Set();
const lengthTotals = Array.from({ length: 6 }, () => 0);
const lengthCounts = Array.from({ length: 6 }, () => 0);
const edgeCounts = { top: 0, right: 0, bottom: 0, left: 0 };

for (let seed = 1; seed <= SIMULATION_SEEDS; seed += 1) {
  const plan = generateArcadeRushPlan({ seed, vocabulary });
  assert.ok(plan, `seed ${seed} must produce a plan`);
  assert.equal(isGeneratedArcadeRushPlan(plan), true, `seed ${seed} must satisfy the generated-plan contract`);
  const entries = plan.waves.flatMap((wave) => wave.entries);
  assert.equal(entries.length, ARCADE_RUSH_TOTAL_PLANNED_WORDS);
  assert.equal(new Set(entries.map((entry) => entry.word)).size, entries.length, `seed ${seed} repeated a word`);
  signatures.add(entries.slice(0, 24).map((entry) => `${entry.word}:${entry.edge}`).join("|"));

  for (const wave of plan.waves) {
    const profile = ARCADE_RUSH_WAVE_PROFILES[wave.wave - 1];
    assert.ok(profile.maxSimultaneousWords <= 8);
    assert.ok(profile.maxSimultaneousWords <= profile.wordCount);
    assert.ok(profile.spawnIntervalMs >= 500);
    for (let index = 0; index < wave.entries.length; index += 1) {
      const entry = wave.entries[index];
      lengthTotals[wave.wave - 1] += entry.word.length;
      lengthCounts[wave.wave - 1] += 1;
      edgeCounts[entry.edge] += 1;
      if (index >= 2) {
        const a = wave.entries[index - 2].edge;
        const b = wave.entries[index - 1].edge;
        assert.equal(a === b && b === entry.edge, false, `seed ${seed} has a three-edge run in wave ${wave.wave}`);
      }
    }
  }
}

assert.equal(signatures.size, SIMULATION_SEEDS, "the first 1,000 seeds should produce distinct run signatures");
for (const profile of ARCADE_RUSH_WAVE_PROFILES) {
  const average = lengthTotals[profile.wave - 1] / lengthCounts[profile.wave - 1];
  assert.ok(
    Math.abs(average - profile.targetAverageWordLength) <= 1,
    `wave ${profile.wave} average length ${average.toFixed(3)} drifted too far from ${profile.targetAverageWordLength}`,
  );
}
const totalEdges = Object.values(edgeCounts).reduce((sum, count) => sum + count, 0);
for (const [edge, count] of Object.entries(edgeCounts)) {
  const share = count / totalEdges;
  assert.ok(share >= 0.20 && share <= 0.30, `${edge} edge share ${share.toFixed(3)} is unexpectedly biased`);
}

console.log(`Arcade Rush AR2 simulation passed across ${SIMULATION_SEEDS} deterministic seeds.`);
