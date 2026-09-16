import { FLOW_MODE_ID, normalizeFlowOptions } from "./flowConfig.js";
import { normalizeFlowModifierIds } from "./flowModifiers.js";

export const FLOW_PHASES = Object.freeze({
  IDLE: "idle",
  READY: "ready",
  RUNNING: "running",
  PAUSED: "paused",
  COMPLETE: "complete",
});

export function createInitialFlowRun(options = {}) {
  const normalized = normalizeFlowOptions(options);
  return {
    mode: FLOW_MODE_ID,
    phase: FLOW_PHASES.IDLE,
    ...normalized,
    modifiers: normalizeFlowModifierIds(options.modifiers || options.modifierIds || []),
    passageId: null,
    startedAt: null,
    completedAt: null,
    currentIndex: 0,
    correctChars: 0,
    incorrectChars: 0,
    correctedErrors: 0,
    uncorrectedErrors: 0,
    blockedBackspaces: 0,
    pauses: [],
    rawKeystrokes: [],
    wordTimings: [],
    charTimings: [],
    flowValue: 0,
    momentum: 1,
    score: 0,
  };
}

export function resetFlowRun(run, options = {}) {
  if (!run || typeof run !== "object") return createInitialFlowRun(options);
  return Object.assign(run, createInitialFlowRun(options));
}

export function isFlowRun(value) {
  return value?.mode === FLOW_MODE_ID && Object.values(FLOW_PHASES).includes(value?.phase);
}
