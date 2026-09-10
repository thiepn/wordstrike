import {
  PRACTICE_BURST_MIN_SPRINT_ACCURACY,
  PRACTICE_BURST_MIN_SPRINT_CHARACTERS,
  PRACTICE_BURST_SPRINT_COUNT,
  PRACTICE_BURST_SPRINT_DURATION_MS,
  PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS,
} from "./practiceBurstSprintsConstants.js";
import { getPracticeBurstSprintForActiveMs } from "./practiceBurstSprintsPlan.js";

const INSERT_TYPES = new Set(["character", "space"]);
const CORRECTION_TYPES = new Set(["backspace", "word-delete"]);
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const freshSprint = (definition) => ({
  sprintId: definition.sprintId,
  sprintOrdinal: definition.sprintOrdinal,
  activeStartMs: definition.activeStartMs,
  activeEndMs: definition.activeEndMs,
  durationMs: definition.durationMs,
  acceptedInsertions: 0,
  correctInsertions: 0,
  incorrectInsertions: 0,
  correctionActions: 0,
  removedCount: 0,
  firstInsertionAtMs: null,
  lastInsertionAtMs: null,
});

function finalizeSprint(state, finalActiveDurationMs) {
  const completed = finalActiveDurationMs >= state.activeEndMs;
  const typed = state.acceptedInsertions;
  const correct = state.correctInsertions;
  const minutes = PRACTICE_BURST_SPRINT_DURATION_MS / 60_000;
  const rawWpm = minutes > 0 ? (typed / 5) / minutes : null;
  const correctedWpm = minutes > 0 ? (correct / 5) / minutes : null;
  const strictAccuracy = typed > 0 ? clamp((correct / typed) * 100, 0, 100) : 0;
  const correctionOverheadRate = typed > 0 ? clamp(state.correctionActions / typed, 0, 1) : 0;
  const eligible = completed
    && typed >= PRACTICE_BURST_MIN_SPRINT_CHARACTERS
    && strictAccuracy >= PRACTICE_BURST_MIN_SPRINT_ACCURACY
    && Number.isFinite(correctedWpm)
    && correctedWpm > 0;
  return freezeDeep({
    sprintId: state.sprintId,
    sprintOrdinal: state.sprintOrdinal,
    durationMs: state.durationMs,
    acceptedInsertions: typed,
    correctInsertions: correct,
    incorrectInsertions: state.incorrectInsertions,
    correctionActions: state.correctionActions,
    removedCount: state.removedCount,
    rawWpm,
    correctedWpm,
    strictAccuracy,
    correctionOverheadRate,
    completed,
    eligible,
    firstInsertionAtMs: state.firstInsertionAtMs,
    lastInsertionAtMs: state.lastInsertionAtMs,
  });
}

export function createPracticeBurstSprintsAccumulator({ plan } = {}) {
  if (!plan || plan.sprintCount !== PRACTICE_BURST_SPRINT_COUNT || plan.totalActiveDurationMs !== PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS) throw new TypeError("Burst Sprints accumulator requires a valid plan");
  const states = plan.sprints.map(freshSprint);
  let interrupted = false;
  let interruptionReason = null;
  let finalResult = null;

  const recordProcessedInput = (event) => {
    if (finalResult || interrupted || !event || !Number.isFinite(event.relativeActiveTimestampMs)) return false;
    const sprint = getPracticeBurstSprintForActiveMs(plan, event.relativeActiveTimestampMs);
    if (!sprint) return false;
    const state = states[sprint.sprintOrdinal - 1];
    if (!state) return false;
    if (INSERT_TYPES.has(event.type) && event.accepted !== false) {
      state.acceptedInsertions += 1;
      if (event.correctness === "correct") state.correctInsertions += 1;
      else state.incorrectInsertions += 1;
      if (state.firstInsertionAtMs == null) state.firstInsertionAtMs = event.relativeActiveTimestampMs;
      state.lastInsertionAtMs = event.relativeActiveTimestampMs;
      return true;
    }
    if (CORRECTION_TYPES.has(event.type) && event.accepted !== false) {
      state.correctionActions += 1;
      state.removedCount += Number.isFinite(event.removedCount) ? Math.max(0, event.removedCount) : 0;
      return true;
    }
    return false;
  };

  const markInterrupted = (reason = "interrupted") => {
    if (finalResult) return false;
    interrupted = true;
    interruptionReason = String(reason || "interrupted");
    return true;
  };

  const finalize = ({ finalActiveDurationMs = 0 } = {}) => {
    if (finalResult) return finalResult;
    const boundedActiveMs = clamp(Number(finalActiveDurationMs) || 0, 0, PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS + 1_000);
    const sprints = states.map((state) => finalizeSprint(state, boundedActiveMs));
    const completedSprintCount = sprints.filter((sprint) => sprint.completed).length;
    const eligibleSprintCount = sprints.filter((sprint) => sprint.eligible).length;
    const complete = !interrupted && boundedActiveMs >= PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS && completedSprintCount === PRACTICE_BURST_SPRINT_COUNT;
    finalResult = freezeDeep({
      resultVersion: 1,
      status: interrupted ? "interrupted" : complete ? "complete" : "incomplete",
      interrupted,
      interruptionReason,
      finalActiveDurationMs: boundedActiveMs,
      completedSprintCount,
      eligibleSprintCount,
      sprints,
    });
    return finalResult;
  };

  return Object.freeze({
    recordProcessedInput,
    markInterrupted,
    finalize,
    getFinalResult: () => finalResult,
    getSnapshot(activeMs = 0) {
      return freezeDeep({
        interrupted,
        interruptionReason,
        currentSprint: getPracticeBurstSprintForActiveMs(plan, activeMs),
        sprints: states.map((state) => ({ ...state })),
      });
    },
  });
}
