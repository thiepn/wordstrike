import { createPracticeSegmenter } from "./practiceSessionContract.js";
import { clonePracticeValue } from "./practiceStorageContract.js";

function unitAt(units, position) {
  return units.find((unit) => position >= unit.startIndex && position < unit.endIndex) || null;
}

export function createPracticeTypingState(contentPlan, { segmenter } = {}) {
  let plan = contentPlan;
  const segment = createPracticeSegmenter(segmenter);
  const expectedGraphemes = segment(contentPlan.text);
  const typed = [];
  const correctedErrors = [];
  const completedUnitIds = new Set();
  return {
    expectedGraphemes,
    typed,
    correctedErrors,
    completedUnitIds,
    firstInputTimestamp: null,
    lastAcceptedInputTimestamp: null,
    lastCorrectInputTimestamp: null,
    currentWordStart: 0,
    get cursorIndex() { return typed.length; },
    get currentUnit() { return unitAt(plan.units, typed.length); },
    setContentPlan(nextPlan) {
      plan = nextPlan;
      this.expectedGraphemes = segment(nextPlan.text);
    },
    snapshot({ windowSize = Infinity } = {}) {
      const windowStart = Number.isFinite(windowSize)
        ? Math.max(0, typed.length - Math.max(0, windowSize))
        : 0;
      return Object.freeze({
        typedGraphemes: Object.freeze(typed.slice(windowStart).map((entry) => entry.value)),
        typedWindowStart: windowStart,
        cursorIndex: typed.length,
        currentUnitId: unitAt(plan.units, typed.length)?.unitId ?? null,
        completedUnitIds: Object.freeze([...completedUnitIds]),
        errorPositions: Object.freeze(typed.flatMap((entry, index) => entry.correct || index < windowStart ? [] : [index])),
        correctedErrorHistory: Object.freeze(correctedErrors.map((entry) => Object.freeze(clonePracticeValue(entry)))),
        currentWordStart: this.currentWordStart,
        firstInputTimestamp: this.firstInputTimestamp,
        lastAcceptedInputTimestamp: this.lastAcceptedInputTimestamp,
        lastCorrectInputTimestamp: this.lastCorrectInputTimestamp,
      });
    },
  };
}

function updateCompletedUnits(state, units) {
  const completed = [];
  for (const unit of units) {
    if (unit.endIndex <= state.typed.length && !state.completedUnitIds.has(unit.unitId)) {
      state.completedUnitIds.add(unit.unitId);
      completed.push(unit.unitId);
    }
  }
  return completed;
}

export function applyPracticeInsertion(state, contentPlan, value, timestamp) {
  const position = state.typed.length;
  if (position >= state.expectedGraphemes.length) return { accepted: false, reason: "content-exhausted" };
  const expected = state.expectedGraphemes[position];
  const correct = value === expected;
  const unit = unitAt(contentPlan.units, position);
  state.typed.push({ value, expected, correct, insertedAt: timestamp, unitId: unit?.unitId ?? null });
  state.firstInputTimestamp ??= timestamp;
  state.lastAcceptedInputTimestamp = timestamp;
  if (correct) state.lastCorrectInputTimestamp = timestamp;
  const completedUnitIds = updateCompletedUnits(state, contentPlan.units);
  return {
    accepted: true,
    stateChanged: true,
    reason: value === " " ? "space-accepted" : "character-accepted",
    correctness: correct ? "correct" : "incorrect",
    position,
    expected,
    entered: value,
    unitId: unit?.unitId ?? null,
    completedUnitIds,
  };
}

export function applyPracticeCorrection(state, type, policy, timestamp) {
  if (policy === "disabled") return { accepted: false, stateChanged: false, reason: "correction-disabled", removed: [] };
  if (policy === "ignore") return { accepted: true, stateChanged: false, reason: "correction-ignored", removed: [] };
  if (!state.typed.length) return { accepted: true, stateChanged: false, reason: "nothing-to-correct", removed: [] };
  let removeCount = 1;
  if (type === "word-delete") {
    let index = state.typed.length;
    while (index > 0 && /\s/u.test(state.typed[index - 1].value)) index -= 1;
    while (index > 0 && !/\s/u.test(state.typed[index - 1].value)) index -= 1;
    removeCount = state.typed.length - index;
  }
  const start = state.typed.length - removeCount;
  const removed = state.typed.splice(start, removeCount);
  for (const entry of removed) {
    if (!entry.correct) state.correctedErrors.push({
      position: start,
      expected: entry.expected,
      entered: entry.value,
      correctedAt: timestamp,
    });
  }
  return {
    accepted: true,
    stateChanged: removed.length > 0,
    reason: type === "word-delete" ? "word-deleted" : "character-deleted",
    removed,
  };
}

export function rebuildCompletedPracticeUnits(state, contentPlan) {
  state.completedUnitIds.clear();
  updateCompletedUnits(state, contentPlan.units);
}
