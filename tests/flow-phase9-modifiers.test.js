import assert from "node:assert/strict";
import {
  FLOW_MODIFIERS,
  getFlowModifierGameplayScales,
  getFlowModifierScoreBreakdown,
  normalizeFlowModifierIds,
  toggleFlowModifier,
} from "../js/flow/flowModifiers.js";
import { createFlowRunPlan } from "../js/flow/flowRunPlan.js";
import {
  backspaceFlowText,
  createFlowTypingRun,
  getFlowTypingSnapshot,
  insertFlowText,
} from "../js/flow/flowEngine.js";

assert.equal(Object.keys(FLOW_MODIFIERS).length, 8);
assert.deepEqual(
  normalizeFlowModifierIds(["calm", "precision", "dialogue", "symbols", "longform", "sprint", "clean-run"]),
  ["precision", "symbols", "sprint", "clean-run"],
  "last modifier in each conflict group should win deterministically",
);
assert.deepEqual(toggleFlowModifier(["calm"], "precision"), ["precision"]);
assert.deepEqual(toggleFlowModifier(["precision"], "precision"), []);

const calm = getFlowModifierGameplayScales(["calm"]);
assert.equal(calm.incorrectLossScale, 0.6);
assert.equal(calm.correctBackspaceLossScale, 0.6);
assert.equal(calm.correctedRecoveryScale, 1.2);
const precision = getFlowModifierGameplayScales(["precision"]);
assert.equal(precision.incorrectLossScale, 1.35);
assert.equal(precision.correctedRecoveryScale, 0.5);

const cleanEligible = getFlowModifierScoreBreakdown({ modifiers: ["precision", "clean-run"], incorrectKeystrokes: 0 });
assert.equal(cleanEligible.multiplier, 1.344);
assert.equal(cleanEligible.entries.find((entry) => entry.id === "clean-run").achieved, true);
const cleanLost = getFlowModifierScoreBreakdown({ modifiers: ["precision", "clean-run"], incorrectKeystrokes: 1 });
assert.equal(cleanLost.multiplier, 1.12);
assert.equal(cleanLost.entries.find((entry) => entry.id === "clean-run").achieved, false);

const noBackspaceRun = createFlowTypingRun("abc", { modifiers: ["no-backspace"] });
insertFlowText(noBackspaceRun, "a", 100);
assert.equal(backspaceFlowText(noBackspaceRun, 120), false);
assert.equal(noBackspaceRun.currentIndex, 1);
assert.equal(noBackspaceRun.blockedBackspaces, 1);
assert.equal(noBackspaceRun.rawKeystrokes.at(-1).type, "blocked-backspace");
assert.deepEqual(getFlowTypingSnapshot(noBackspaceRun).modifiers, ["no-backspace"]);

const baseRun = createFlowTypingRun("ab", { difficulty: "natural" });
insertFlowText(baseRun, "ab", 100);
const modifierRun = createFlowTypingRun("ab", { difficulty: "natural", modifiers: ["precision", "no-backspace", "clean-run"] });
insertFlowText(modifierRun, "ab", 100);
const baseScore = getFlowTypingSnapshot(baseRun).gameplay.score;
const modifierSnapshot = getFlowTypingSnapshot(modifierRun);
assert.ok(modifierSnapshot.gameplay.score > baseScore);
assert.equal(modifierSnapshot.gameplay.scoreBreakdown.modifierMultiplier, 1.5456);

const passage = (id, category, difficulty, wordCount, tags) => Object.freeze({
  id,
  category,
  difficulty,
  wordCount,
  tags: Object.freeze(tags),
  text: `${id} sample text.`,
});
const customCatalog = Object.freeze([
  passage("plain-short", "everyday", "smooth", 8, ["common-words"]),
  passage("dialogue-long", "dialogue", "smooth", 30, ["quotes", "apostrophes", "long-sentences"]),
  passage("symbols-medium", "numbers-symbols", "smooth", 20, ["numbers", "symbols", "mixed-punctuation"]),
  passage("prose-long", "everyday", "smooth", 32, ["long-sentences"]),
]);

const dialoguePlan = createFlowRunPlan({ sessionLength: "quick", difficulty: "smooth", modifiers: ["dialogue"], catalog: customCatalog, seed: "dialogue" });
assert.equal(dialoguePlan.modifiers.includes("dialogue"), true);
assert.equal(dialoguePlan.segments[0].passageId, "dialogue-long");

const symbolsPlan = createFlowRunPlan({ sessionLength: "quick", difficulty: "smooth", modifiers: ["symbols"], catalog: customCatalog, seed: "symbols" });
assert.equal(symbolsPlan.segments[0].passageId, "symbols-medium");

const longformPlan = createFlowRunPlan({ sessionLength: "quick", difficulty: "smooth", modifiers: ["longform"], catalog: customCatalog, seed: "longform" });
assert.equal(longformPlan.segments[0].passageId, "prose-long");
assert.equal(longformPlan.segments[0].passageId === "dialogue-long", false, "longform must not imply dialogue/quote pressure");

const basePlan = createFlowRunPlan({ sessionLength: "standard", difficulty: "smooth", catalog: customCatalog, seed: "sprint" });
const sprintPlan = createFlowRunPlan({ sessionLength: "standard", difficulty: "smooth", modifiers: ["sprint"], catalog: customCatalog, seed: "sprint" });
assert.equal(basePlan.passageCount, 3);
assert.equal(sprintPlan.passageCount, 2);
assert.equal(sprintPlan.chapterCount, 2);
assert.equal(sprintPlan.targetMinutes, 3);

console.log("Flow Phase 9 modifier contracts passed: conflicts, gameplay scales, score bonuses, no-backspace, quote-safe content biases, and sprint planning.");
