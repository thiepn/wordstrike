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
  resumeBossLoop,
  startBossLoop,
  stopBossLoop,
  suspendBossLoop,
} = await import("../js/bossLoop.js");
const { updateBossHud } = await import("../js/ui.js");
const {
  resumeGameLoop,
  startLevelLoop,
  stopGameLoop,
  suspendGameLoop,
} = await import("../js/gameLoop.js");
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
frame();
assert.equal(frames.size, 0, "paused boss loop must park instead of rescheduling RAF");
assert.equal(game.remainingMs, remainingBeforePause);
assert.equal(game.elapsedMs, 0);
appState.screen = Screens.PLAYING;
assert.equal(resumeBossLoop(), undefined);
assert.equal(frames.size, 1);
frame(5_000);
assert.equal(game.remainingMs, 1000, "first resumed frame must reset the timestamp baseline");
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
frame();
assert.equal(frames.size, 0);
assert.equal(game.phase, "TRANSITION");
assert.equal(game.remainingMs, transitionStartTime);
updateBossHud(game);
assert.equal(sequenceCount.textContent, "SEQUENCE 1 / 2");
appState.screen = Screens.PLAYING;
resumeBossLoop();
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

const campaignRuntime = startLevelLoop(
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
frame(5_000);
assert.equal(campaignRuntime.elapsedMs, 0, "first campaign frame establishes the timestamp baseline");
frame(5_000);
assert.equal(campaignRuntime.elapsedMs, 100, "campaign frame jumps must be capped at 100 ms");
for (let index = 0; index < 100; index += 1) {
  suspendGameLoop();
  assert.equal(frames.size, 0, "campaign pause must cancel its RAF without clearing the runtime");
  resumeGameLoop();
  assert.equal(frames.size, 1, "campaign resume must restore exactly one RAF");
}
stopGameLoop();

startBossLoop(10, { timeLimitSec: 1 }, ["a"], {});
assert.equal(frames.size, 1);
for (let index = 0; index < 100; index += 1) {
  suspendBossLoop();
  assert.equal(frames.size, 0, "boss pause must cancel its RAF without clearing the encounter");
  resumeBossLoop();
  assert.equal(frames.size, 1, "boss resume must restore exactly one RAF");
}
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

console.log("Boss/campaign runtime contracts passed: pause parking, frame-jump caps, 100-cycle lifecycle stress, timeout priority, retry, and mode switching.");
