import assert from "node:assert/strict";
import { getAllModes, getRegisteredModes, MODE_IDS } from "../js/modes.js";
import {
  FLOW_DEFAULTS,
  FLOW_MODE_ID,
  normalizeFlowOptions,
} from "../js/flow/flowConfig.js";
import {
  createInitialFlowRun,
  FLOW_PHASES,
  isFlowRun,
  resetFlowRun,
} from "../js/flow/flowState.js";

const publicModes = getAllModes();
assert.equal(publicModes.some((mode) => mode.id === MODE_IDS.ARCADE_RUSH), false);

const flowDefinition = publicModes.find((mode) => mode.id === MODE_IDS.FLOW);
assert.ok(flowDefinition, "Flow should be visible in the public mode registry");
assert.equal(flowDefinition.name, "Flow");
assert.equal(flowDefinition.enabled, false, "Phase 0 must not launch Flow before its typing engine exists");
assert.equal(flowDefinition.route, null);

const registeredModes = getRegisteredModes();
const legacyRush = registeredModes.find((mode) => mode.id === MODE_IDS.ARCADE_RUSH);
assert.ok(legacyRush, "Arcade Rush must remain registered for legacy data compatibility");
assert.equal(legacyRush.visible, false);
assert.equal(legacyRush.enabled, false);

assert.equal(FLOW_MODE_ID, MODE_IDS.FLOW);
assert.deepEqual(normalizeFlowOptions({}), FLOW_DEFAULTS);
assert.deepEqual(normalizeFlowOptions({
  category: "dialogue",
  difficulty: "expert",
  sessionLength: "quick",
}), {
  category: "dialogue",
  difficulty: "expert",
  sessionLength: "quick",
});
assert.deepEqual(normalizeFlowOptions({
  category: "invalid",
  difficulty: "invalid",
  sessionLength: "invalid",
}), FLOW_DEFAULTS);

const run = createInitialFlowRun({ category: "quotes", difficulty: "smooth" });
assert.equal(run.mode, FLOW_MODE_ID);
assert.equal(run.phase, FLOW_PHASES.IDLE);
assert.equal(run.category, "quotes");
assert.equal(run.difficulty, "smooth");
assert.equal(run.currentIndex, 0);
assert.equal(run.correctedErrors, 0);
assert.equal(run.unCorrectedErrors, undefined);
assert.equal(run.uncorrectedErrors, 0);
assert.equal(run.flowValue, 0);
assert.equal(run.momentum, 1);
assert.equal(isFlowRun(run), true);

run.phase = FLOW_PHASES.RUNNING;
run.currentIndex = 42;
run.score = 900;
resetFlowRun(run);
assert.equal(run.phase, FLOW_PHASES.IDLE);
assert.equal(run.currentIndex, 0);
assert.equal(run.score, 0);

console.log("flow-phase0.test.js passed");
