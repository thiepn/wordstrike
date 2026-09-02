import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  ARCADE_RUSH_BOSS_ATTACK_INTERVAL_MS,
  ARCADE_RUSH_BOSS_INTRO_MS,
  ARCADE_RUSH_BOSS_MAX_HP,
  ARCADE_RUSH_BOSS_TARGET_DURATION_MS,
  ARCADE_RUSH_RULES_STATUS,
  ARCADE_RUSH_RULES_VERSION,
  ARCADE_RUSH_TARGET_DURATION_MS,
  ARCADE_RUSH_TOTAL_PLANNED_WORDS,
  ARCADE_RUSH_WAVE_TRANSITION_MS,
  createArcadeRushVocabulary,
  generateArcadeRushBossPhraseSequence,
  generateArcadeRushPlan,
} from "../js/arcadeRush/index.js";
import { createWordTrajectory } from "../js/gameplayWorld.js";

const source = JSON.parse(await fs.readFile(
  new URL("../data/commonGameplayWords.json", import.meta.url),
  "utf8",
));
const commonWords = source.words.map((entry) => typeof entry === "string" ? entry : entry.word);
const vocabulary = createArcadeRushVocabulary({ commonWords, campaignBank: source });

const PLAYER_PROFILES = Object.freeze([
  Object.freeze({ id: "weak", wpm: 45, accuracy: 90 }),
  Object.freeze({ id: "slow-accurate", wpm: 55, accuracy: 98 }),
  Object.freeze({ id: "average", wpm: 65, accuracy: 94 }),
  Object.freeze({ id: "good", wpm: 72, accuracy: 96 }),
  Object.freeze({ id: "fast", wpm: 80, accuracy: 97 }),
  Object.freeze({ id: "inaccurate-fast", wpm: 80, accuracy: 85 }),
  Object.freeze({ id: "very-fast", wpm: 100, accuracy: 99 }),
  Object.freeze({ id: "expert", wpm: 120, accuracy: 99.5 }),
]);

const EPSILON = 1e-7;
const CERTIFICATION_SEEDS = Object.freeze(
  Array.from({ length: 96 }, (_, index) => 0x0a100000 + index),
);

function effectiveCharactersPerMs(player) {
  // Standard WPM convention is five characters per word. Accuracy is modeled
  // as throughput loss: mistakes consume typing capacity without advancing the
  // target. The production runtime is unchanged; this is a deterministic
  // certification workload, not gameplay logic.
  return (player.wpm * 5 / 60) * (player.accuracy / 100) / 1000;
}

function serviceTimeMs(text, player) {
  return String(text).length / effectiveCharactersPerMs(player);
}

function targetDeadlineMs(entry, spawnAt) {
  const trajectory = createWordTrajectory({
    edge: entry.edge,
    ratio: entry.edgeRatio,
    speed: entry.trajectoryProfile.speedPxPerSec,
  });
  assert.ok(trajectory, "generated Rush target must have a valid trajectory");
  return spawnAt + trajectory.travelDurationMs;
}

function selectMostUrgent(waiting) {
  if (!waiting.length) return null;
  let bestIndex = 0;
  for (let index = 1; index < waiting.length; index += 1) {
    if (waiting[index].deadlineMs < waiting[bestIndex].deadlineMs) bestIndex = index;
  }
  return waiting.splice(bestIndex, 1)[0];
}

function simulateWave(wave, player, startingIntegrity) {
  let integrity = startingIntegrity;
  let elapsedMs = 0;
  let nextIndex = 0;
  let lastSpawnAtMs = -wave.profile.spawnIntervalMs;
  let current = null;
  const waiting = [];
  let completed = 0;
  let missed = 0;
  let guard = 0;

  function activeCount() {
    return waiting.length + (current ? 1 : 0);
  }

  function selectTargetIfNeeded() {
    if (!current && waiting.length) current = selectMostUrgent(waiting);
  }

  function spawnTarget(atMs) {
    const entry = wave.entries[nextIndex++];
    waiting.push({
      entry,
      deadlineMs: targetDeadlineMs(entry, atMs),
      remainingServiceMs: serviceTimeMs(entry.word, player),
    });
    lastSpawnAtMs = atMs;
  }

  while (nextIndex < wave.entries.length || current || waiting.length) {
    guard += 1;
    assert.ok(guard < 100_000, `balance simulator stalled in wave ${wave.wave}`);
    selectTargetIfNeeded();

    const nextSpawnAt = nextIndex < wave.entries.length && activeCount() < wave.profile.maxSimultaneousWords
      ? Math.max(elapsedMs, lastSpawnAtMs + wave.profile.spawnIntervalMs)
      : Number.POSITIVE_INFINITY;
    const completionAt = current
      ? elapsedMs + current.remainingServiceMs
      : Number.POSITIVE_INFINITY;
    const currentDeadlineAt = current?.deadlineMs ?? Number.POSITIVE_INFINITY;
    const waitingDeadlineAt = waiting.reduce(
      (minimum, target) => Math.min(minimum, target.deadlineMs),
      Number.POSITIVE_INFINITY,
    );
    const nextEventAt = Math.min(nextSpawnAt, completionAt, currentDeadlineAt, waitingDeadlineAt);
    assert.equal(Number.isFinite(nextEventAt), true, `wave ${wave.wave} must have a next event`);

    const deltaMs = Math.max(0, nextEventAt - elapsedMs);
    if (current) current.remainingServiceMs = Math.max(0, current.remainingServiceMs - deltaMs);
    elapsedMs = nextEventAt;

    // Successful completion wins an exact-time tie with the target deadline.
    if (
      current &&
      current.remainingServiceMs <= EPSILON &&
      elapsedMs <= current.deadlineMs + EPSILON
    ) {
      current = null;
      completed += 1;
    }

    if (current && current.deadlineMs <= elapsedMs + EPSILON) {
      current = null;
      integrity -= 1;
      missed += 1;
    }

    for (let index = waiting.length - 1; index >= 0; index -= 1) {
      if (waiting[index].deadlineMs <= elapsedMs + EPSILON) {
        waiting.splice(index, 1);
        integrity -= 1;
        missed += 1;
      }
    }

    if (integrity <= 0) {
      return { success: false, integrity: 0, elapsedMs, completed, missed };
    }

    if (
      nextIndex < wave.entries.length &&
      activeCount() < wave.profile.maxSimultaneousWords &&
      elapsedMs + EPSILON >= lastSpawnAtMs + wave.profile.spawnIntervalMs
    ) {
      spawnTarget(elapsedMs);
    }
    selectTargetIfNeeded();
  }

  return { success: true, integrity, elapsedMs, completed, missed };
}

function simulateBoss(plan, player, startingIntegrity) {
  const phrases = generateArcadeRushBossPhraseSequence(plan.boss.seed);
  assert.ok(phrases);
  let integrity = startingIntegrity;
  let hp = ARCADE_RUSH_BOSS_MAX_HP;
  let elapsedMs = 0;
  let phraseIndex = 0;

  while (hp > 0 && integrity > 0 && elapsedMs < ARCADE_RUSH_BOSS_TARGET_DURATION_MS) {
    const phrase = phrases[phraseIndex % phrases.length];
    const serviceMs = serviceTimeMs(phrase, player);
    const remainingRunMs = ARCADE_RUSH_BOSS_TARGET_DURATION_MS - elapsedMs;
    if (serviceMs <= ARCADE_RUSH_BOSS_ATTACK_INTERVAL_MS + EPSILON && serviceMs < remainingRunMs + EPSILON) {
      elapsedMs += serviceMs;
      hp -= 1;
      phraseIndex += 1;
      continue;
    }

    if (remainingRunMs <= ARCADE_RUSH_BOSS_ATTACK_INTERVAL_MS) {
      elapsedMs = ARCADE_RUSH_BOSS_TARGET_DURATION_MS;
      integrity = 0;
      break;
    }

    elapsedMs += ARCADE_RUSH_BOSS_ATTACK_INTERVAL_MS;
    integrity -= 1;
    phraseIndex += 1;
  }

  return {
    success: hp <= 0 && integrity > 0,
    integrity: Math.max(0, integrity),
    elapsedMs,
  };
}

function simulateRun(plan, player) {
  let integrity = 5;
  let elapsedMs = 0;
  let completedWords = 0;
  let missedWords = 0;

  for (let waveIndex = 0; waveIndex < plan.waves.length; waveIndex += 1) {
    const waveResult = simulateWave(plan.waves[waveIndex], player, integrity);
    integrity = waveResult.integrity;
    elapsedMs += waveResult.elapsedMs;
    completedWords += waveResult.completed;
    missedWords += waveResult.missed;
    if (!waveResult.success) {
      return {
        success: false,
        failureWave: waveIndex + 1,
        reachedBoss: false,
        integrity: 0,
        activeDurationMs: elapsedMs,
        completedWords,
        missedWords,
      };
    }
    if (waveIndex < plan.waves.length - 1) elapsedMs += ARCADE_RUSH_WAVE_TRANSITION_MS;
  }

  elapsedMs += ARCADE_RUSH_BOSS_INTRO_MS;
  const boss = simulateBoss(plan, player, integrity);
  elapsedMs += boss.elapsedMs;
  return {
    success: boss.success,
    failureWave: boss.success ? null : 7,
    reachedBoss: true,
    integrity: boss.integrity,
    activeDurationMs: elapsedMs,
    completedWords,
    missedWords,
  };
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction));
  return sorted[index];
}

const plans = CERTIFICATION_SEEDS.map((seed) => {
  const plan = generateArcadeRushPlan({ seed, vocabulary });
  assert.ok(plan, `seed ${seed} must generate under frozen v1`);
  assert.equal(plan.waves.flatMap(({ entries }) => entries).length, ARCADE_RUSH_TOTAL_PLANNED_WORDS);
  return plan;
});

const matrix = new Map();
for (const player of PLAYER_PROFILES) {
  const runs = plans.map((plan) => simulateRun(plan, player));
  const successes = runs.filter(({ success }) => success);
  const failures = runs.filter(({ success }) => !success);
  matrix.set(player.id, {
    player,
    runs,
    successRate: successes.length / runs.length,
    bossReachRate: runs.filter(({ reachedBoss }) => reachedBoss).length / runs.length,
    medianFailureWave: percentile(failures.map(({ failureWave }) => failureWave), 0.5),
    successfulDurations: successes.map(({ activeDurationMs }) => activeDurationMs),
  });
}

const weak = matrix.get("weak");
const slowAccurate = matrix.get("slow-accurate");
const average = matrix.get("average");
const good = matrix.get("good");
const fast = matrix.get("fast");
const inaccurateFast = matrix.get("inaccurate-fast");
const veryFast = matrix.get("very-fast");
const expert = matrix.get("expert");

assert.equal(ARCADE_RUSH_RULES_VERSION, 1);
assert.equal(ARCADE_RUSH_RULES_STATUS, "FROZEN_V1");

assert.ok(weak.successRate <= 0.05, "weak profile should almost never complete");
assert.ok(weak.medianFailureWave >= 3 && weak.medianFailureWave <= 4, "weak profile should fail around waves 3–4");

assert.ok(slowAccurate.successRate <= 0.10, "slow accurate profile should not routinely finish");
assert.ok(slowAccurate.medianFailureWave >= 5 && slowAccurate.medianFailureWave <= 6, "slow accurate profile should reach waves 5–6");

assert.ok(average.successRate <= 0.25, "average profile should usually fail before the boss clear");
assert.ok(average.medianFailureWave >= 5 && average.medianFailureWave <= 6, "average profile should concentrate near the final normal waves");

assert.ok(good.bossReachRate >= 0.40, "good profile should reach the boss often");
assert.ok(good.successRate >= 0.30 && good.successRate <= 0.95, "good profile should have meaningful completion pressure");

assert.ok(fast.successRate >= 0.90, "fast accurate profile should usually complete");
assert.ok(inaccurateFast.successRate < fast.successRate, "accuracy loss must materially reduce survival at the same raw WPM");
assert.ok(inaccurateFast.successRate >= 0.20, "fast but inaccurate play should still be capable of reaching late game");

assert.ok(veryFast.successRate >= 0.99, "very fast profile should essentially always complete");
assert.equal(expert.successRate, 1, "expert profile must complete every certified seed");

for (const profile of [good, fast, veryFast, expert]) {
  for (const duration of profile.successfulDurations) {
    assert.ok(
      duration >= ARCADE_RUSH_TARGET_DURATION_MS.minimum &&
      duration <= ARCADE_RUSH_TARGET_DURATION_MS.maximum,
      `${profile.player.id} successful run ${Math.round(duration)}ms must stay inside the 4–6 minute contract`,
    );
  }
}

const expertMedian = percentile(expert.successfulDurations, 0.5);
assert.ok(expertMedian >= 240_000 && expertMedian <= 270_000, "expert median should remain compact but not sub-four-minute");

const summary = Object.fromEntries([...matrix].map(([id, result]) => [id, {
  successRate: Number((result.successRate * 100).toFixed(1)),
  bossReachRate: Number((result.bossReachRate * 100).toFixed(1)),
  medianFailureWave: result.medianFailureWave,
  medianSuccessMs: percentile(result.successfulDurations, 0.5),
}]));
console.log("Arcade Rush AR10 balance certification passed:", JSON.stringify(summary));
