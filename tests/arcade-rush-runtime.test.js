import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  ARCADE_RUSH_WAVE_COUNT,
  ARCADE_RUSH_WAVE_TRANSITION_MS,
  createArcadeRushRuntime,
  createArcadeRushVocabulary,
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
    id: `session-${plan.seed}`,
    source: "arcade-rush-test",
    createdAtEpochMs: 1_000_000,
    startedAtEpochMs: 1_000_000,
    state: "preparing",
    result: null,
  };
  const events = {
    created: 0,
    removed: 0,
    damage: 0,
    completes: 0,
    failures: 0,
    terminals: 0,
    wavesComplete: 0,
    transitions: 0,
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
      createWord() { events.created += 1; },
      updateWord() {},
      removeWord() { events.removed += 1; },
      flashDamage() { events.damage += 1; },
    },
    input: {
      handleKey(event, game, api) {
        if (event?.type === "mistype") return api.recordIncorrectCharacter(1);
        if (event?.type === "type-word") {
          const word = game.words[0];
          if (!word) return false;
          api.recordCorrectCharacter(word.id, word.text.length - word.typedIndex);
          return api.completeWord(word.id);
        }
        return false;
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
    onFailure() { events.failures += 1; },
    onTerminal() { events.terminals += 1; },
    onWavesComplete() { events.wavesComplete += 1; },
    onWaveTransition() { events.transitions += 1; },
  };
  const runtime = createArcadeRushRuntime({
    plan,
    ports,
    source: "arcade-rush-test",
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
  return { runtime, step, advance, frames, session, events };
}

function createPlan(seed) {
  const plan = generateArcadeRushPlan({ seed, vocabulary });
  assert.ok(plan);
  return plan;
}

// Full six-wave run reaches the boss handoff without completing the session.
{
  const plan = createPlan(4104);
  const h = createHarness(plan);
  assert.ok(h.runtime.start());
  assert.equal(h.runtime.getLoopActive(), true);
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
    const state = h.runtime.getSnapshot();
    assert.equal(state.wavesCompleted, wave);
    if (wave < ARCADE_RUSH_WAVE_COUNT) {
      assert.equal(state.runState, "transitioning");
      h.advance(ARCADE_RUSH_WAVE_TRANSITION_MS);
      assert.equal(h.runtime.getSnapshot().currentWave, wave + 1);
    }
  }
  const final = h.runtime.getSnapshot();
  assert.equal(final.phase, "BOSS_INTRO");
  assert.equal(final.runState, "awaiting-boss");
  assert.equal(final.integrity, 5);
  assert.equal(final.wavesCompleted, 6);
  assert.equal(final.perfectWaves, 6);
  assert.equal(final.totalResolved, 120);
  assert.equal(final.completedWordCount, 120);
  assert.equal(final.missedWordCount, 0);
  assert.equal(final.maxCombo, 120);
  assert.equal(h.events.wavesComplete, 1);
  assert.equal(h.events.transitions, 5);
  assert.equal(h.events.completes, 0, "AR4 must not complete the overall run before AR5 boss logic");
  assert.equal(h.frames.size, 0);
  h.runtime.completeWord(999999);
  assert.equal(h.events.wavesComplete, 1, "boss handoff callback must be exact-once");
}

// Five breaches fail the run exactly once and produce a canonical failed result.
{
  const plan = createPlan(4105);
  const h = createHarness(plan);
  h.runtime.start();
  h.step(0);
  for (let hit = 0; hit < 5; hit += 1) {
    let state = h.runtime.getSnapshot();
    if (!state.words.length) {
      h.advance(plan.waves[0].profile.spawnIntervalMs);
      state = h.runtime.getSnapshot();
    }
    assert.equal(h.runtime.processCoreBreach(state.words[0].id), true);
  }
  const failed = h.runtime.getSnapshot();
  assert.equal(failed.runState, "failed");
  assert.equal(failed.phase, "FAILED");
  assert.equal(failed.integrity, 0);
  assert.equal(failed.combo, 0);
  assert.equal(failed.coreBreaches, 5);
  assert.equal(h.events.damage, 5);
  assert.equal(h.events.failures, 1);
  assert.equal(h.events.terminals, 1);
  assert.equal(h.events.completes, 1);
  assert.equal(h.frames.size, 0);
  assert.ok(failed.result);
  assert.equal(validateArcadeRushCanonicalResult(failed.result).valid, true);
  h.runtime.processCoreBreach(1);
  assert.equal(h.events.failures, 1);
  assert.equal(h.events.completes, 1);
}

// A resolved word cannot breach afterward; combo scoring and mistype tracking remain ordered.
{
  const plan = createPlan(4106);
  const h = createHarness(plan);
  h.runtime.start();
  h.step(0);
  const wordId = h.runtime.getSnapshot().words[0].id;
  h.runtime.recordIncorrectCharacter(1);
  const textLength = h.runtime.getSnapshot().words[0].text.length;
  h.runtime.recordCorrectCharacter(wordId, textLength);
  assert.equal(h.runtime.completeWord(wordId), true);
  assert.equal(h.runtime.processCoreBreach(wordId), false);
  const state = h.runtime.getSnapshot();
  assert.equal(state.integrity, 5);
  assert.equal(state.combo, 1);
  assert.equal(state.waveStats[0].incorrectKeystrokes, 1);
}

// Pause/resume cancels and restores a single frame without advancing elapsed time while paused.
{
  const plan = createPlan(4107);
  const h = createHarness(plan);
  h.runtime.start();
  h.step(0);
  h.advance(500);
  const beforePause = h.runtime.getSnapshot().elapsedMs;
  assert.equal(h.runtime.pause(), true);
  assert.equal(h.frames.size, 0);
  assert.equal(h.runtime.getSnapshot().runState, "paused");
  assert.equal(h.runtime.resume(), true);
  assert.equal(h.frames.size, 1);
  h.step(10_000);
  assert.equal(h.runtime.getSnapshot().elapsedMs, beforePause, "first resumed frame resets the timestamp baseline");
  h.advance(100);
  assert.equal(h.runtime.getSnapshot().elapsedMs, beforePause + 100);
}

// Cleanup and restart do not leak RAF handles and accept an explicitly supplied new plan.
{
  const h = createHarness(createPlan(4108));
  h.runtime.start();
  assert.equal(h.frames.size, 1);
  h.runtime.cleanup();
  assert.equal(h.frames.size, 0);
  assert.equal(h.runtime.getSnapshot().runState, "stopped");
  const nextPlan = createPlan(4109);
  assert.ok(h.runtime.restart({ plan: nextPlan }));
  assert.equal(h.frames.size, 1);
  assert.equal(h.runtime.getSnapshot().seed, 4109);
  h.runtime.dispose();
  assert.equal(h.frames.size, 0);
}

console.log("Arcade Rush AR4 core runtime lifecycle tests passed.");
