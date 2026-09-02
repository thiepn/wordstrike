import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  ARCADE_RUSH_BOSS_ATTACK_INTERVAL_MS,
  ARCADE_RUSH_BOSS_INTRO_MS,
  ARCADE_RUSH_WAVE_COUNT,
  ARCADE_RUSH_WAVE_TRANSITION_MS,
  createArcadeRushRuntime,
  createArcadeRushVocabulary,
  createCoreBreakerBossPort,
  generateArcadeRushPlan,
  validateArcadeRushCanonicalResult,
} from "../js/arcadeRush/index.js";

const source = JSON.parse(await fs.readFile(
  new URL("../data/commonGameplayWords.json", import.meta.url),
  "utf8",
));
const commonWords = source.words.map((entry) => typeof entry === "string" ? entry : entry.word);
const vocabulary = createArcadeRushVocabulary({ commonWords, campaignBank: source });

function createHarness(plan) {
  let nextFrameId = 1;
  let clock = 0;
  const frames = new Map();
  const session = {
    id: `boss-session-${plan.seed}`,
    source: "arcade-rush-boss-test",
    createdAtEpochMs: 2_000_000,
    startedAtEpochMs: 2_000_000,
    state: "preparing",
    result: null,
  };
  const events = {
    completes: 0,
    failures: 0,
    terminals: 0,
    bossStarts: 0,
    bossPhrases: 0,
    bossAttacks: 0,
    bossCompletes: 0,
    damage: 0,
  };
  const ports = {
    clock: { now: () => clock },
    scheduler: {
      requestFrame(callback) {
        const id = nextFrameId++;
        frames.set(id, callback);
        return id;
      },
      cancelFrame(id) {
        frames.delete(id);
      },
    },
    renderer: {
      clearWords() {},
      createWord() {},
      updateWord() {},
      removeWord() {},
      flashDamage() { events.damage += 1; },
    },
    input: {
      handleKey(event, game, api) {
        if (event?.type !== "type-word") return false;
        const word = game.words[0];
        if (!word) return false;
        api.recordCorrectCharacter(word.id, word.text.length - word.typedIndex);
        return api.completeWord(word.id);
      },
      reconcileTargeting() {},
      resetTargeting() {},
    },
    world: {
      createTrajectory() { return {}; },
      projectTrajectory() {},
      advanceTrajectory() { return false; },
      updateSeparation() {},
    },
    session: {
      begin(config) {
        session.state = "preparing";
        session.source = config.source;
        session.result = null;
        return { ...session };
      },
      complete(result) {
        session.state = "completed";
        session.result = result;
        events.completes += 1;
        return { ...session };
      },
      getCurrent() { return { ...session }; },
      markActive() { session.state = "active"; return true; },
      markResultPersisted() { return true; },
      setState(state) { session.state = state; return true; },
    },
  };
  const callbacks = {
    onComplete() { events.bossCompletes += 1; },
    onFailure() { events.failures += 1; },
    onTerminal() { events.terminals += 1; },
    onBossStart() { events.bossStarts += 1; },
    onBossPhraseComplete(_state, detail) { events.bossPhrases += detail.count; },
    onBossAttack(_state, detail) { events.bossAttacks += detail.count; },
  };
  const runtime = createArcadeRushRuntime({
    plan,
    ports,
    bossPort: createCoreBreakerBossPort(),
    source: "arcade-rush-boss-test",
    callbacks,
  });

  function step(delta = 0) {
    clock += delta;
    const pending = [...frames.entries()];
    assert.ok(pending.length <= 1, "runtime must never schedule more than one RAF");
    if (!pending.length) return false;
    const [id, callback] = pending[0];
    frames.delete(id);
    callback(clock);
    return true;
  }

  function advance(ms) {
    let remaining = ms;
    while (remaining > 0) {
      const delta = Math.min(100, remaining);
      assert.equal(step(delta), true, "expected an active frame while advancing time");
      remaining -= delta;
    }
  }

  function jump(ms) {
    clock += ms;
  }

  return { runtime, step, advance, jump, frames, session, events };
}

function createPlan(seed) {
  const plan = generateArcadeRushPlan({ seed, vocabulary });
  assert.ok(plan);
  return plan;
}

function clearSixWaves(h, plan) {
  assert.ok(h.runtime.start());
  h.step(0);
  for (let wave = 1; wave <= ARCADE_RUSH_WAVE_COUNT; wave += 1) {
    const wavePlan = plan.waves[wave - 1];
    for (let index = 0; index < wavePlan.entries.length; index += 1) {
      let state = h.runtime.getSnapshot();
      if (!state.words.length) {
        h.advance(wavePlan.profile.spawnIntervalMs);
        state = h.runtime.getSnapshot();
      }
      assert.equal(state.words.length, 1);
      assert.equal(h.runtime.handleKey({ type: "type-word" }), true);
    }
    if (wave < ARCADE_RUSH_WAVE_COUNT) {
      assert.equal(h.runtime.getSnapshot().runState, "transitioning");
      h.advance(ARCADE_RUSH_WAVE_TRANSITION_MS);
    }
  }
  assert.equal(h.runtime.getSnapshot().runState, "boss-intro");
  h.advance(ARCADE_RUSH_BOSS_INTRO_MS);
  assert.equal(h.runtime.getSnapshot().runState, "boss-active");
  assert.equal(h.events.bossStarts, 1);
}

function typeCurrentBossPhrase(h) {
  const phrase = h.runtime.getSnapshot().boss.currentPhrase;
  for (const key of phrase) {
    assert.equal(h.runtime.handleKey({ key }), true);
  }
}

// Full deterministic run defeats Core Breaker and emits one canonical success result.
{
  const plan = createPlan(5101);
  const h = createHarness(plan);
  clearSixWaves(h, plan);

  let safety = 0;
  while (h.runtime.getSnapshot().runState === "boss-active") {
    typeCurrentBossPhrase(h);
    safety += 1;
    assert.ok(safety <= 20);
  }

  const final = h.runtime.getSnapshot();
  assert.equal(final.phase, "COMPLETE");
  assert.equal(final.runState, "complete");
  assert.equal(final.integrity, 5);
  assert.equal(final.boss.phase, "DEFEATED");
  assert.equal(final.boss.hp, 0);
  assert.equal(final.wavesCompleted, 6);
  assert.equal(final.completedWordCount > 120, true);
  assert.equal(final.missedWordCount, 0);
  assert.equal(final.result.success, true);
  assert.equal(final.result.modeData.bossDefeated, true);
  assert.equal(final.result.modeData.bossTimeRemainingMs > 0, true);
  assert.equal(validateArcadeRushCanonicalResult(final.result).valid, true);
  assert.equal(h.events.bossPhrases, 8);
  assert.equal(h.events.bossCompletes, 1);
  assert.equal(h.events.failures, 0);
  assert.equal(h.events.terminals, 1);
  assert.equal(h.events.completes, 1);
  assert.equal(h.frames.size, 0);
  assert.equal(h.runtime.handleKey({ key: "a" }), false);
  assert.equal(h.events.bossCompletes, 1);
  assert.equal(h.events.terminals, 1);
}

// Boss attacks damage Core and failure is still canonical `core-destroyed`.
{
  const plan = createPlan(5102);
  const h = createHarness(plan);
  clearSixWaves(h, plan);

  for (let attack = 0; attack < 5; attack += 1) {
    h.advance(ARCADE_RUSH_BOSS_ATTACK_INTERVAL_MS);
    if (attack < 4) {
      assert.equal(h.runtime.getSnapshot().runState, "boss-active");
      assert.equal(h.runtime.getSnapshot().integrity, 4 - attack);
    }
  }

  const failed = h.runtime.getSnapshot();
  assert.equal(failed.runState, "failed");
  assert.equal(failed.phase, "FAILED");
  assert.equal(failed.integrity, 0);
  assert.equal(failed.boss.phase, "FAILED");
  assert.equal(failed.result.success, false);
  assert.equal(failed.result.failureReason, "core-destroyed");
  assert.equal(failed.result.modeData.wavesCompleted, 6);
  assert.equal(failed.result.modeData.bossDefeated, false);
  assert.equal(failed.result.modeData.bossTimeRemainingMs > 0, true);
  assert.equal(validateArcadeRushCanonicalResult(failed.result).valid, true);
  assert.equal(h.events.bossAttacks, 5);
  assert.equal(h.events.damage, 5);
  assert.equal(h.events.failures, 1);
  assert.equal(h.events.terminals, 1);
  assert.equal(h.events.completes, 1);
  assert.equal(h.frames.size, 0);
}

// Pausing during the boss freezes the boss timer and resets the resumed frame baseline.
{
  const plan = createPlan(5103);
  const h = createHarness(plan);
  clearSixWaves(h, plan);
  const before = h.runtime.getSnapshot().boss.durationRemainingMs;
  assert.equal(h.runtime.pause(), true);
  assert.equal(h.frames.size, 0);
  h.jump(15_000);
  assert.equal(h.runtime.resume(), true);
  assert.equal(h.frames.size, 1);
  h.step(0);
  assert.equal(h.runtime.getSnapshot().boss.durationRemainingMs, before);
  h.advance(100);
  assert.equal(h.runtime.getSnapshot().boss.durationRemainingMs, before - 100);
  h.runtime.dispose();
  assert.equal(h.frames.size, 0);
}

// Cleanup with a boss-capable runtime leaves no scheduled work behind.
{
  const plan = createPlan(5104);
  const h = createHarness(plan);
  assert.ok(h.runtime.start());
  h.runtime.cleanup();
  assert.equal(h.frames.size, 0);
  assert.equal(h.runtime.getSnapshot().runState, "stopped");
}

console.log("Arcade Rush AR5 boss/runtime integration tests passed.");
