import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  createArcadeRushRuntime,
  createArcadeRushVocabulary,
  generateArcadeRushPlan,
} from "../js/arcadeRush/index.js";

const source = JSON.parse(await fs.readFile(
  new URL("../data/commonGameplayWords.json", import.meta.url),
  "utf8",
));
const commonWords = source.words.map((entry) => typeof entry === "string" ? entry : entry.word);
const vocabulary = createArcadeRushVocabulary({ commonWords, campaignBank: source });

for (let seed = 1; seed <= 100; seed += 1) {
  const plan = generateArcadeRushPlan({ seed, vocabulary });
  let nextFrameId = 1;
  const frames = new Map();
  const ports = {
    clock: { now: () => 0 },
    scheduler: {
      requestFrame(callback) { const id = nextFrameId++; frames.set(id, callback); return id; },
      cancelFrame(id) { frames.delete(id); },
    },
    renderer: {
      clearWords() {}, createWord() {}, updateWord() {}, removeWord() {}, flashDamage() {},
    },
    input: {
      handleKey() { return false; }, reconcileTargeting() {}, resetTargeting() {},
    },
    world: {
      createTrajectory() { return {}; },
      projectTrajectory() {},
      advanceTrajectory() { return false; },
      updateSeparation() {},
    },
    session: {
      begin() {
        return {
          id: `stress-${seed}`,
          createdAtEpochMs: 1_000,
          startedAtEpochMs: 1_000,
        };
      },
      complete() { return {}; },
      getCurrent() { return { id: `stress-${seed}`, createdAtEpochMs: 1_000, startedAtEpochMs: 1_000 }; },
      markActive() { return true; },
      markResultPersisted() { return true; },
      setState() { return true; },
    },
  };
  const runtime = createArcadeRushRuntime({ plan, ports });
  assert.ok(runtime.start());
  assert.equal(frames.size, 1);
  runtime.pause();
  assert.equal(frames.size, 0);
  runtime.resume();
  assert.equal(frames.size, 1);
  runtime.cleanup();
  assert.equal(frames.size, 0, `seed ${seed} leaked an animation frame`);
  runtime.dispose();
  assert.equal(frames.size, 0);
}

console.log("Arcade Rush AR4 cleanup/RAF stress test passed across 100 deterministic plans.");
