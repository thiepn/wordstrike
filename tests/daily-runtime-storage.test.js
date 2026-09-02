import assert from "node:assert/strict";
import { DAILY_TOTAL_WORDS } from "../js/dailyConfig.js";
import { getUtcDateKey } from "../js/dailyDate.js";
import { getDailyChallengeSeed } from "../js/dailyGenerator.js";
import { clearSession, getCurrentSession } from "../js/sessionManager.js";

class Element {
  constructor() {
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.clientWidth = 800;
    this.clientHeight = 600;
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  append(child) { this.children.push(child); }
  remove() {}
  setAttribute() {}
  addEventListener() {}
  animate() {}
  set innerHTML(value) { this.html = value; }
}

const playArea = new Element();
globalThis.document = {
  querySelector(selector) {
    if (selector === "#play-area") return playArea;
    return null;
  },
  createElement() { return new Element(); },
};
globalThis.window = { setTimeout() {} };
const stored = new Map();
globalThis.localStorage = {
  getItem(key) { return stored.get(key) ?? null; },
  setItem(key, value) { stored.set(key, value); },
};
let frameId = 0;
const frames = new Map();
globalThis.requestAnimationFrame = (callback) => {
  frames.set(++frameId, callback);
  return frameId;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);

const {
  clearDailyRuntime,
  completeDailyRun,
  createDailyRuntime,
  processDailyCoreBreach,
  registerDailyWordCompletion,
  spawnDailyWord,
  startDailyRun,
} = await import("../js/dailyMode.js");
const { appState } = await import("../js/state.js");
const {
  getDailyRecord,
  getLegacyDailyModeSummary,
  loadModeData,
} = await import("../js/modeStorage.js");

appState.save = { settings: { screenShake: false, particles: false, strictMode: false } };
const dateKey = getUtcDateKey();
const entries = Array.from({ length: DAILY_TOTAL_WORDS }, (_, index) => ({
  index,
  wave: Math.floor(index / 20) + 1,
  word: `word${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}`,
  source: "common",
  edge: ["top", "right", "bottom", "left"][index % 4],
  edgeRatio: 0.1 + index / 100,
  profile: {
    spawnIntervalMs: 1000,
    wordSpeedPxPerSec: 50 + Math.floor(index / 20) * 10,
    maxSimultaneousWords: 7,
  },
}));
const plan = {
  dateKey,
  challengeVersion: 1,
  seed: getDailyChallengeSeed(dateKey),
  totalWords: DAILY_TOTAL_WORDS,
  entries,
};
let game = createDailyRuntime({ plan, currentDateKey: dateKey });
assert.equal(game.recordEligible, true);
assert.equal(game.integrity, 3);
for (let index = 0; index < 20; index += 1) {
  assert.equal(spawnDailyWord(game, { width: 800, height: 600 }), true);
  game.words.length = 0;
}
assert.equal(game.wave, 2);
assert.equal(game.spawnBlockedUntilMs, 1000);
assert.equal(game.bannerUntilMs, 1250);
assert.equal(game.plan.entries[0].profile.wordSpeedPxPerSec, 50);

const missed = {
  id: 100, text: "laser", typedIndex: 0, coreArrivalProcessed: false,
  missedCharactersRecorded: false,
};
game.words = [missed];
game.elapsedMs = 100;
processDailyCoreBreach(game, missed);
assert.equal(game.integrity, 2);
assert.equal(game.combo, 0);

clearSession();
game = startDailyRun({ plan, source: "test" });
assert.equal(getCurrentSession().modeId, "daily");
game.elapsedMs = 60000;
game.spawnedWordCount = 60;
game.resolvedWordCount = 59;
game.completedWordCount = 60;
game.score = 1000;
game.accumulatedWordPoints = 1000;
game.combo = 1;
registerDailyWordCompletion(game, { text: "word", dailyPlanEntry: { wave: 3 } });
assert.equal(game.result.success, true);
assert.equal(game.result.modeData.completionBonus, 10000);
assert.equal(getCurrentSession().state, "completed");
assert.equal(getDailyRecord(dateKey).attempts, 1);
assert.equal(getLegacyDailyModeSummary().records.days[dateKey].best.success, true);
assert.equal(Object.hasOwn(loadModeData().modes, "daily"), false, "active schema v2 must not persist Daily mode data");
assert.equal(completeDailyRun(game, true), null);
clearDailyRuntime();

const override = createDailyRuntime({
  plan: { ...plan, dateKey: "2026-01-01" },
  developerMode: true,
  dateOverride: true,
  currentDateKey: dateKey,
});
assert.equal(override.recordEligible, false);

console.log("Daily lifecycle remains compatible through the AR8 legacy sidecar while active v2 excludes Daily.");
