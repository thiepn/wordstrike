import assert from "node:assert/strict";
import {
  backspaceFlowText,
  createFlowTypingRun,
  getFlowCharacterView,
  getFlowTypingSnapshot,
  insertFlowText,
} from "../js/flow/flowEngine.js";
import { FLOW_PHASES } from "../js/flow/flowState.js";
import { FLOW_PHASE1_PASSAGE } from "../js/flow/flowPassages.js";

assert.ok(FLOW_PHASE1_PASSAGE.text.length >= 200, "Phase 1 validation passage must exercise wrapping");
for (const token of ["7:30", '"', "don't", ";", "3", ",", ".", "-"]) {
  assert.ok(FLOW_PHASE1_PASSAGE.text.includes(token), `validation passage should exercise ${token}`);
}

const sample = `A 7:30, "don't".`;
const run = createFlowTypingRun(sample, { category: "everyday", difficulty: "natural" });
assert.equal(run.phase, FLOW_PHASES.READY);
assert.equal(run.currentIndex, 0);
assert.equal(run.passage, sample);

assert.equal(insertFlowText(run, "A", 100), true);
assert.equal(run.phase, FLOW_PHASES.RUNNING);
assert.equal(run.startedAt, 100);
assert.equal(run.correctChars, 1);
assert.equal(run.currentIndex, 1);

assert.equal(insertFlowText(run, "x", 110), true);
assert.equal(run.currentIndex, 2);
assert.equal(run.incorrectChars, 1);
assert.equal(run.uncorrectedErrors, 1);
assert.equal(run.errorTimings.length, 1);
assert.equal(getFlowCharacterView(run)[1].status, "incorrect");

assert.equal(backspaceFlowText(run, 125), true);
assert.equal(run.currentIndex, 1);
assert.equal(run.correctedErrors, 1);
assert.equal(run.uncorrectedErrors, 0);
assert.equal(run.correctionTimings.length, 1);
assert.equal(run.correctionTimings[0].correctionDelayMs, 15);

assert.equal(insertFlowText(run, sample.slice(1), 200), true);
assert.equal(run.phase, FLOW_PHASES.COMPLETE);
assert.equal(run.currentIndex, sample.length);
assert.equal(run.completedAt, 200);
assert.ok(run.wordTimings.length >= 2);
assert.equal(run.sentenceTimings.length, 1);
assert.equal(run.rawKeystrokes.some((entry) => entry.type === "backspace"), true);

const view = getFlowCharacterView(run);
assert.equal(view.length, sample.length);
assert.equal(view.every((character) => ["correct", "incorrect"].includes(character.status)), true);
assert.equal(view.some((character) => character.current), false);

const snapshot = getFlowTypingSnapshot(run);
assert.equal(snapshot.phase, FLOW_PHASES.COMPLETE);
assert.equal(snapshot.passageLength, sample.length);
assert.equal(snapshot.correctedErrors, 1);
assert.equal(snapshot.uncorrectedErrors, 0);
assert.equal(snapshot.errorTimings.length, 1);
assert.equal(snapshot.correctionTimings.length, 1);
assert.equal(snapshot.sentenceTimings.length, 1);

const unresolved = createFlowTypingRun("OK.");
insertFlowText(unresolved, "OX.", 300);
assert.equal(unresolved.phase, FLOW_PHASES.COMPLETE);
assert.equal(unresolved.uncorrectedErrors, 1, "Phase 1 must preserve unresolved mistakes at completion");
assert.equal(unresolved.incorrectChars, 1);

console.log("Flow Phase 1 engine contracts passed: complete text, punctuation, corrections, unresolved errors, and timing telemetry.");
