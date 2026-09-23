import assert from "node:assert/strict";

class ClassList {
  add() {}
  remove() {}
  toggle() {}
}
const phrase = { innerHTML: "" };
const progress = { style: {} };
const sequenceCount = { textContent: "" };
globalThis.document = {
  querySelector(selector) {
    if (selector === "#boss-phrase") return phrase;
    if (selector === "#boss-progress-fill") return progress;
    if (selector === "#boss-phrase-count") return sequenceCount;
    return null;
  },
};
globalThis.window = { setTimeout() {} };

let nextFrameId = 0;
const frames = new Map();
globalThis.requestAnimationFrame = (callback) => {
  const id = ++nextFrameId;
  frames.set(id, callback);
  return id;
};
globalThis.cancelAnimationFrame = (id) => frames.delete(id);

const { appState, Screens } = await import("../js/state.js");
const {
  completeBossPhrase,
  startBossLoop,
  stopBossLoop,
} = await import("../js/bossLoop.js");
const { updateBossHud } = await import("../js/ui.js");
const { startLevelLoop, stopGameLoop } = await import("../js/gameLoop.js");
const { handleBossKey } = await import("../js/input.js");

appState.screen = Screens.PLAYING;
let now = 0;
function frame(delta = 100) {
  const entry = frames.entries().next().value;
  assert.ok(entry, "expected a queued animation frame");
  frames.delete(entry[0]);
  now += delta;
  entry[1](now);
}

let outcome = null;
let game = startBossLoop(
  10,
  { timeLimitSec: 1 },
  ["a"],
  { onEnd: (_game, success) => { outcome = success; } },
);
for (let index = 0; index < 30 && game.phase === "INTRO"; index += 1) frame();
assert.equal(game.phase, "ACTIVE");
assert.equal(game.remainingMs, 1000);
updateBossHud(game);
assert.equal(sequenceCount.textContent, "SEQUENCE 1 / 1");

const remainingBeforePause = game.remainingMs;
appState.screen = Screens.PAUSED;
for (let index = 0; index < 5; index += 1) frame();
assert.equal(game.remainingMs, remainingBeforePause);
assert.equal(game.elapsedMs, 0);
appState.screen = Screens.PLAYING;
frame(100);
assert.equal(game.remainingMs, 900);

game.remainingMs = 0.1;
appState.screen = Screens.PAUSED;
frame(500);
assert.equal(game.remainingMs, 0.1);
appState.screen = Screens.PLAYING;
handleBossKey(
  { key: "a", preventDefault() {} },
  game,
  { strictMode: false },
  completeBossPhrase,
);
assert.equal(outcome, true);
assert.equal(frames.size, 0);

outcome = null;
now = 0;
game = startBossLoop(
  50,
  { timeLimitSec: 2 },
  ["a", "b"],
  { onEnd: (_game, success) => { outcome = success; } },
);
for (let index = 0; index < 30 && game.phase === "INTRO"; index += 1) frame();
updateBossHud(game);
assert.equal(sequenceCount.textContent, "SEQUENCE 1 / 2");
handleBossKey(
  { key: "a", preventDefault() {} },
  game,
  { strictMode: false },
  completeBossPhrase,
);
assert.equal(game.phase, "TRANSITION");
updateBossHud(game);
assert.equal(sequenceCount.textContent, "SEQUENCE 1 / 2");
const transitionStartTime = game.remainingMs;
appState.screen = Screens.PAUSED;
for (let index = 0; index < 3; index += 1) frame();
assert.equal(game.phase, "TRANSITION");
assert.equal(game.remainingMs, transitionStartTime);
updateBossHud(game);
assert.equal(sequenceCount.textContent, "SEQUENCE 1 / 2");
appState.screen = Screens.PLAYING;
while (game.phase === "TRANSITION") frame();
assert.equal(game.phase, "ACTIVE");
assert.equal(game.phraseIndex, 1);
updateBossHud(game);
assert.equal(sequenceCount.textContent, "SEQUENCE 2 / 2");
assert.equal(game.remainingMs, transitionStartTime - 350);
assert.equal(game.combo, 1);

outcome = null;
now = 0;
game = startBossLoop(
  50,
  { timeLimitSec: 0.2 },
  ["alpha beta", "gamma ray"],
  { onEnd: (_game, success) => { outcome = success; } },
);
for (let index = 0; index < 30 && game.phase === "INTRO"; index += 1) frame();
while (outcome === null) frame();
assert.equal(outcome, false);
assert.equal(game.remainingMs, 0);
assert.equal(game.missedCharacters, "alpha beta".length + "gamma ray".length);
const missedOnce = game.missedCharacters;
completeBossPhrase(game);
assert.equal(game.missedCharacters, missedOnce);

outcome = null;
now = 0;
game = startBossLoop(
  10,
  { timeLimitSec: 5 },
  ["ab"],
  { onEnd: (_game, success) => { outcome = success; } },
);
for (let index = 0; index < 30 && game.phase === "INTRO"; index += 1) frame();
const remainingBeforeFrameJump = game.remainingMs;
frame(5_000);
assert.equal(game.remainingMs, remainingBeforeFrameJump - 100);
assert.equal(outcome, null);
stopBossLoop();

for (let index = 0; index < 50; index += 1) {
  startBossLoop(10, { timeLimitSec: 1 }, ["a"], {});
  assert.equal(frames.size, 1);
}
assert.equal(frames.size, 1);
updateBossHud(appState.game);
assert.equal(sequenceCount.textContent, "SEQUENCE 1 / 1");
stopBossLoop();
assert.equal(frames.size, 0);

startLevelLoop(
  9,
  {
    lives: 3,
    spawnIntervalMs: 1000,
    wordCount: 1,
    maxSimultaneousWords: 1,
    wordSpeedPxPerSec: 50,
  },
  ["cat"],
  {},
);
assert.equal(frames.size, 1);
stopGameLoop();
startBossLoop(10, { timeLimitSec: 1 }, ["a"], {});
assert.equal(frames.size, 1);
stopBossLoop();
startLevelLoop(
  11,
  {
    lives: 3,
    spawnIntervalMs: 1000,
    wordCount: 1,
    maxSimultaneousWords: 1,
    wordSpeedPxPerSec: 50,
  },
  ["cat"],
  {},
);
assert.equal(frames.size, 1);
stopGameLoop();

const threeSequenceGame = startBossLoop(
  60,
  { timeLimitSec: 10, totalWordCount: 3 },
  ["a", "b", "c"],
  {},
);
for (let index = 0; index < 30 && threeSequenceGame.phase === "INTRO"; index += 1) frame();
updateBossHud(threeSequenceGame);
assert.equal(sequenceCount.textContent, "SEQUENCE 1 / 3");
threeSequenceGame.displayedSequenceNumber = 0;
updateBossHud(threeSequenceGame);
assert.equal(sequenceCount.textContent, "SEQUENCE 1 / 3");
threeSequenceGame.displayedSequenceNumber = 99;
updateBossHud(threeSequenceGame);
assert.equal(sequenceCount.textContent, "SEQUENCE 3 / 3");
threeSequenceGame.displayedSequenceNumber = 1;
for (const [key, expected] of [["a", "SEQUENCE 2 / 3"], ["b", "SEQUENCE 3 / 3"]]) {
  handleBossKey(
    { key, preventDefault() {} },
    threeSequenceGame,
    { strictMode: false },
    completeBossPhrase,
  );
  updateBossHud(threeSequenceGame);
  assert.doesNotMatch(sequenceCount.textContent, /SEQUENCE 0|SEQUENCE 4|undefined/);
  while (threeSequenceGame.phase === "TRANSITION") frame();
  updateBossHud(threeSequenceGame);
  assert.equal(sequenceCount.textContent, expected);
}
stopBossLoop();

console.log("Boss intro, pause, final-key priority, timeout, retry, and mode-switch tests passed.");
