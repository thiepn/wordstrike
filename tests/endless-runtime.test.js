import assert from "node:assert/strict";
import { clearSession, getCurrentSession } from "../js/sessionManager.js";
import { createEndlessVocabulary } from "../js/endlessWords.js";

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
globalThis.localStorage = {
  value: null,
  getItem() { return this.value; },
  setItem(_key, value) { this.value = value; },
};
let frameId = 0;
const frames = new Map();
globalThis.requestAnimationFrame = (callback) => {
  frames.set(++frameId, callback);
  return frameId;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);

const {
  completeEndlessRun,
  createEndlessRuntime,
  processEndlessCoreBreach,
  registerEndlessWordCompletion,
  startEndlessRun,
  clearEndlessRuntime,
} = await import("../js/endlessMode.js");
const { appState } = await import("../js/state.js");

appState.save = { settings: { screenShake: false, particles: false, strictMode: false } };
const vocabulary = createEndlessVocabulary({
  commonWords: Array.from({ length: 80 }, (_, index) => `word${index}`)
    .filter((word) => /^[a-z]+$/.test(word)),
  campaignBank: {
    tiers: {
      1: ["cat", "dog", "sun", "map", "code", "type", "word", "play"],
      2: ["apple", "river", "stone", "green", "light", "sound"],
      3: ["active", "beacon", "buffer", "charge", "control"],
      4: ["accuracy", "algorithm", "collision", "direction"],
      5: ["architecture", "coordination", "development"],
    },
  },
  bossBank: { words: [{ word: "precision" }, { word: "framework" }] },
});

let game = createEndlessRuntime({ seed: 1, vocabulary });
assert.equal(game.integrity, 3);
assert.equal(game.stage, 1);
for (let index = 0; index < 10; index += 1) {
  game.combo += 1;
  registerEndlessWordCompletion(game, { text: "word" });
}
assert.equal(game.stage, 2);
assert.equal(game.stageWordsCompleted, 0);
assert.equal(game.completedStages, 1);
assert.equal(game.accumulatedStageBonusPoints, 250);
assert.equal("transitionSpawnUntilMs" in game, false);
assert.equal(game.bannerText, "STAGE 2");

for (const [stage, target] of [[5, 10], [6, 15], [11, 20]]) {
  const transition = createEndlessRuntime({ seed: stage, vocabulary, startStage: stage });
  for (let index = 0; index < target - 1; index += 1) {
    registerEndlessWordCompletion(transition, { text: "word" });
  }
  assert.equal(transition.stage, stage);
  assert.equal(transition.stageWordsCompleted, target - 1);
  registerEndlessWordCompletion(transition, { text: "word" });
  assert.equal(transition.stage, stage + 1);
  assert.equal(transition.stageWordsCompleted, 0);
  assert.equal("transitionSpawnUntilMs" in transition, false);
}

const breach = (id) => ({
  id,
  text: "laser",
  typedIndex: 0,
  coreArrivalProcessed: false,
  missedCharactersRecorded: false,
});
game.words = [breach(1), breach(2), breach(3), breach(4)];
game.elapsedMs = 100;
processEndlessCoreBreach(game, game.words[0]);
assert.equal(game.stageWordsCompleted, 0);
assert.equal(game.integrity, 2);
assert.equal(game.coreHits, 1);
processEndlessCoreBreach(game, game.words[0]);
assert.equal(game.integrity, 2);
assert.equal(game.coreBreaches, 2);
game.elapsedMs = 800;
processEndlessCoreBreach(game, game.words[0]);
assert.equal(game.integrity, 1);
game.elapsedMs = 1500;
processEndlessCoreBreach(game, game.words[0]);
assert.equal(game.integrity, 0);
assert.equal(game.coreHits, 3);

clearSession();
game = startEndlessRun({ seed: 9, vocabulary, source: "test" });
assert.equal(getCurrentSession().modeId, "endless");
assert.equal(getCurrentSession().state, "active");
game.elapsedMs = 60000;
game.integrity = 0;
const result = completeEndlessRun(game);
assert.equal(result.modeId, "endless");
assert.equal(result.failureReason, "core-destroyed");
assert.equal(result.modeData.recordEligible, true);
assert.equal(result.modeData.survivalPoints, 6000);
assert.equal(result.localPersistence.status, "saved");
assert.equal("modifiersSurvived" in result.modeData, false);
assert.equal("activeModifier" in result.modeData, false);
assert.equal(getCurrentSession().state, "completed");
assert.equal(completeEndlessRun(game), null);
clearEndlessRuntime();

const workingStorage = globalThis.localStorage;
globalThis.localStorage = {
  getItem() { return null; },
  setItem() { throw new Error("quota"); },
};
clearSession();
game = startEndlessRun({ seed: 10, vocabulary, source: "test" });
game.elapsedMs = 30000;
game.integrity = 0;
const unsaved = completeEndlessRun(game);
assert.equal(unsaved.localPersistence.status, "failed");
assert.match(unsaved.localPersistence.warning, /could not be saved locally/i);
clearEndlessRuntime();
clearSession();
globalThis.localStorage = workingStorage;

console.log("Endless stage progression, immunity, lifecycle, normalized result, persistence failure, and exact completion tests passed.");
