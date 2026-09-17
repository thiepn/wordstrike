import assert from "node:assert/strict";
import {
  backspaceFlowText,
  createFlowTypingRun,
  getFlowTypingSnapshot,
  insertFlowText,
} from "../js/flow/flowEngine.js";
import {
  FLOW_GAMEPLAY_RULES,
  calculateFlowScore,
  getFlowMomentumMultiplier,
} from "../js/flow/flowGameplay.js";

assert.equal(getFlowMomentumMultiplier(0), 1);
assert.equal(getFlowMomentumMultiplier(19.99), 1);
assert.equal(getFlowMomentumMultiplier(20), 1.2);
assert.equal(getFlowMomentumMultiplier(40), 1.5);
assert.equal(getFlowMomentumMultiplier(70), 2);
assert.equal(getFlowMomentumMultiplier(100), 2.5);
assert.equal(getFlowMomentumMultiplier(999), 2.5);

const perfect = createFlowTypingRun("Clean typing builds momentum. Keep going.", {
  category: "everyday",
  difficulty: "natural",
});
assert.equal(perfect.flowValue, FLOW_GAMEPLAY_RULES.startingFlow);
assert.equal(perfect.momentum, 1);
assert.equal(perfect.score, 0);
insertFlowText(perfect, perfect.passage, 1000);
const perfectSnapshot = getFlowTypingSnapshot(perfect);
assert.equal(perfectSnapshot.phase, "complete");
assert.equal(perfectSnapshot.gameplay.accuracyPercent, 100);
assert.ok(perfectSnapshot.gameplay.flowValue > FLOW_GAMEPLAY_RULES.startingFlow);
assert.ok(perfectSnapshot.gameplay.peakMomentum >= 1.2);
assert.ok(perfectSnapshot.gameplay.score > 0);
assert.equal(perfectSnapshot.gameplay.finalFlow, perfectSnapshot.gameplay.flowValue);
assert.equal(perfectSnapshot.gameplay.finalMomentum, perfectSnapshot.gameplay.momentum);

const transparent = perfectSnapshot.gameplay.scoreBreakdown;
const recomputed = Math.round(
  transparent.characterBase
  * transparent.difficultyMultiplier
  * transparent.accuracyMultiplier
  * transparent.flowMultiplier
  * transparent.averageMomentum,
);
assert.equal(perfectSnapshot.gameplay.score, recomputed, "displayed score breakdown must reproduce the score");

const recovery = createFlowTypingRun("abcdef", { difficulty: "natural" });
insertFlowText(recovery, "a", 10);
const cleanOne = getFlowTypingSnapshot(recovery).gameplay;
const wrong = recovery.passage[1] === "x" ? "z" : "x";
insertFlowText(recovery, wrong, 20);
const afterMistake = getFlowTypingSnapshot(recovery).gameplay;
assert.ok(afterMistake.flowValue < cleanOne.flowValue, "mistakes must reduce Flow");
assert.ok(afterMistake.momentumCharge < cleanOne.momentumCharge, "mistakes must reduce Momentum charge");
assert.ok(afterMistake.flowValue >= 0, "Flow is recoverable rather than a failure state");

backspaceFlowText(recovery, 30);
const afterCorrection = getFlowTypingSnapshot(recovery).gameplay;
assert.ok(afterCorrection.flowValue > afterMistake.flowValue, "correcting an error should recover some Flow");
assert.ok(afterCorrection.flowValue < cleanOne.flowValue, "correction must not erase the original mistake cost");
assert.ok(afterCorrection.momentumCharge > afterMistake.momentumCharge);

insertFlowText(recovery, "b", 40);
const afterRetype = getFlowTypingSnapshot(recovery).gameplay;
assert.equal(afterRetype.flowValue, afterCorrection.flowValue, "retyping old ground must not farm Flow");
assert.equal(afterRetype.momentumCharge, afterCorrection.momentumCharge, "retyping old ground must not farm Momentum");
assert.equal(afterRetype.furthestIndexReached, 2);
assert.equal(afterRetype.correctKeystrokes, 2);
assert.equal(afterRetype.incorrectKeystrokes, 1);
assert.ok(afterRetype.accuracyPercent < 100);

const farm = createFlowTypingRun("abc", { difficulty: "natural" });
insertFlowText(farm, "a", 10);
const firstScore = farm.score;
backspaceFlowText(farm, 20);
insertFlowText(farm, "a", 30);
assert.equal(farm.score, firstScore, "correct-character backspace/retype must not increase score");

function completedScore(difficulty, timestamps) {
  const run = createFlowTypingRun("The same text should score the same at any typing speed.", {
    category: "everyday",
    difficulty,
  });
  [...run.passage].forEach((character, index) => insertFlowText(run, character, timestamps(index)));
  return getFlowTypingSnapshot(run).gameplay;
}

const fast = completedScore("natural", (index) => index * 20);
const slow = completedScore("natural", (index) => index * 800);
assert.equal(fast.score, slow.score, "Phase 3 score must not directly reward faster timestamps");
assert.equal(fast.averageFlow, slow.averageFlow);
assert.equal(fast.averageMomentum, slow.averageMomentum);

const smooth = completedScore("smooth", (index) => index * 50);
const expert = completedScore("expert", (index) => index * 50);
assert.ok(expert.score > smooth.score, "difficulty must scale otherwise identical performance");
assert.equal(smooth.scoreBreakdown.difficultyMultiplier, 1);
assert.equal(expert.scoreBreakdown.difficultyMultiplier, 1.45);

const damaged = createFlowTypingRun("quality matters", { difficulty: "natural" });
insertFlowText(damaged, "q", 10);
insertFlowText(damaged, "x", 20);
insertFlowText(damaged, damaged.passage.slice(2), 30);
const damagedGameplay = getFlowTypingSnapshot(damaged).gameplay;
assert.ok(damagedGameplay.accuracyPercent < 100);
assert.ok(damagedGameplay.averageFlow < perfectSnapshot.gameplay.averageFlow);
assert.ok(damagedGameplay.score < calculateFlowScore({
  ...damaged,
  correctKeystrokes: damaged.correctKeystrokes + 1,
  incorrectKeystrokes: 0,
}).score, "accuracy loss should materially reduce score");

console.log("Flow Phase 3 gameplay contracts passed: Flow recovery, Momentum thresholds, anti-farming, difficulty scaling, transparent scoring, and speed independence.");
