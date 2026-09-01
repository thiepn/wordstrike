import assert from "node:assert/strict";
import {
  ARCADE_RUSH_CONTRACT_VERSION,
  ARCADE_RUSH_FOUNDATION_CONFIG,
  ARCADE_RUSH_MODE_DATA_FIELDS,
  ARCADE_RUSH_MODE_ID,
  ARCADE_RUSH_SCORE_COMPONENT_FIELDS,
  ARCADE_RUSH_STARTING_INTEGRITY,
  ARCADE_RUSH_WAVE_COUNT,
  createArcadeRushBossPort,
  createArcadeRushPlanEnvelope,
  createArcadeRushRuntimePorts,
  createArcadeRushUiPort,
  createEmptyArcadeRushScoreBreakdown,
  getArcadeRushFoundationConfig,
  getMissingArcadeRushModeDataFields,
  getMissingArcadeRushResultFields,
  isArcadeRushBossPort,
  isArcadeRushFoundationConfig,
  isArcadeRushPlanEnvelope,
  isArcadeRushResultContract,
  isArcadeRushRuntimePorts,
  isArcadeRushSeed,
  isArcadeRushUiPort,
  normalizeArcadeRushScoreBreakdown,
  sumArcadeRushScoreComponents,
} from "../js/arcadeRush/index.js";

assert.equal(getArcadeRushFoundationConfig(), ARCADE_RUSH_FOUNDATION_CONFIG);
assert.equal(ARCADE_RUSH_FOUNDATION_CONFIG.contractVersion, ARCADE_RUSH_CONTRACT_VERSION);
assert.equal(ARCADE_RUSH_FOUNDATION_CONFIG.modeId, ARCADE_RUSH_MODE_ID);
assert.equal(ARCADE_RUSH_FOUNDATION_CONFIG.waveCount, ARCADE_RUSH_WAVE_COUNT);
assert.equal(ARCADE_RUSH_FOUNDATION_CONFIG.startingIntegrity, ARCADE_RUSH_STARTING_INTEGRITY);
assert.equal(isArcadeRushFoundationConfig(ARCADE_RUSH_FOUNDATION_CONFIG), true);
assert.equal(Object.isFrozen(ARCADE_RUSH_FOUNDATION_CONFIG), true);

assert.equal(isArcadeRushSeed(0), true);
assert.equal(isArcadeRushSeed(0xffffffff), true);
assert.equal(isArcadeRushSeed(-1), false);
assert.equal(isArcadeRushSeed(0x100000000), false);

const plan = createArcadeRushPlanEnvelope({
  seed: 123456,
  waves: Array.from({ length: ARCADE_RUSH_WAVE_COUNT }, (_, index) => ({
    wave: index + 1,
    entries: [],
  })),
  boss: { id: "core-breaker" },
});
assert.equal(isArcadeRushPlanEnvelope(plan), true);
assert.equal(Object.isFrozen(plan), true);
assert.equal(Object.isFrozen(plan.waves), true);
assert.equal(Object.isFrozen(plan.waves[0]), true);
assert.equal(Object.isFrozen(plan.boss), true);
assert.equal(createArcadeRushPlanEnvelope({ seed: 1, waves: [], boss: {} }), null);

const emptyBreakdown = createEmptyArcadeRushScoreBreakdown();
assert.deepEqual(Object.keys(emptyBreakdown), [...ARCADE_RUSH_SCORE_COMPONENT_FIELDS]);
assert.equal(sumArcadeRushScoreComponents(emptyBreakdown), 0);
const normalizedBreakdown = normalizeArcadeRushScoreBreakdown({
  wordPoints: 100,
  waveClearBonus: 20,
  perfectWaveBonus: 30,
  bossBonus: 40,
  integrityBonus: 50,
  accuracyBonus: 60,
  timeBonus: 70,
});
assert.equal(sumArcadeRushScoreComponents(normalizedBreakdown), 370);
assert.equal(sumArcadeRushScoreComponents({ wordPoints: -1 }), null);

const modeData = Object.fromEntries(ARCADE_RUSH_MODE_DATA_FIELDS.map((field) => [field, 0]));
modeData.contractVersion = ARCADE_RUSH_CONTRACT_VERSION;
modeData.rulesVersion = 1;
modeData.recordEligible = true;
modeData.bossDefeated = true;
const result = {
  sessionId: "session-arcaderush1234",
  modeId: ARCADE_RUSH_MODE_ID,
  variantId: "v1",
  sessionSource: "arcade-rush-ready",
  startedAt: 1,
  endedAt: 2,
  durationMs: 1,
  activeDurationMs: 1,
  seed: 123456,
  developerMode: false,
  success: true,
  failureReason: null,
  score: 0,
  accuracy: 100,
  wpm: 0,
  characters: {},
  words: {},
  combo: {},
  modeData,
};
assert.deepEqual(getMissingArcadeRushResultFields(result), []);
assert.deepEqual(getMissingArcadeRushModeDataFields(result.modeData), []);
assert.equal(isArcadeRushResultContract(result), true);
assert.equal(isArcadeRushResultContract({ ...result, modeId: "daily" }), false);
const incomplete = { ...result };
delete incomplete.score;
assert.deepEqual(getMissingArcadeRushResultFields(incomplete), ["score"]);

const noop = () => {};
const runtimePorts = {
  clock: { now: () => 0 },
  scheduler: { requestFrame: noop, cancelFrame: noop },
  renderer: {
    clearWords: noop,
    createWord: noop,
    updateWord: noop,
    removeWord: noop,
    flashDamage: noop,
  },
  input: { handleKey: noop, reconcileTargeting: noop, resetTargeting: noop },
  world: {
    createTrajectory: noop,
    projectTrajectory: noop,
    advanceTrajectory: noop,
    updateSeparation: noop,
  },
  session: {
    begin: noop,
    complete: noop,
    getCurrent: noop,
    markActive: noop,
    markResultPersisted: noop,
    setState: noop,
  },
};
assert.equal(isArcadeRushRuntimePorts(runtimePorts), true);
const frozenRuntimePorts = createArcadeRushRuntimePorts(runtimePorts);
assert.equal(Object.isFrozen(frozenRuntimePorts), true);
assert.equal(Object.isFrozen(frozenRuntimePorts.renderer), true);
assert.equal(isArcadeRushRuntimePorts({}), false);

const bossPort = Object.fromEntries([
  "createEncounter", "handleInput", "update", "getSnapshot", "finalize",
].map((method) => [method, noop]));
assert.equal(isArcadeRushBossPort(bossPort), true);
assert.equal(Object.isFrozen(createArcadeRushBossPort(bossPort)), true);

const uiPort = Object.fromEntries([
  "renderReady", "renderHud", "renderWaveTransition", "renderBossIntro", "renderResults", "clearGameplay",
].map((method) => [method, noop]));
assert.equal(isArcadeRushUiPort(uiPort), true);
assert.equal(Object.isFrozen(createArcadeRushUiPort(uiPort)), true);

console.log("Arcade Rush isolated subsystem foundation contracts passed.");
