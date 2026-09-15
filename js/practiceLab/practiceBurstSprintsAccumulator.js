import {
  PRACTICE_BURST_MIN_FIRST_PASS_OPPORTUNITIES,
  PRACTICE_BURST_MIN_SPRINT_ACCURACY,
  PRACTICE_BURST_MIN_SPRINT_CHARACTERS,
  PRACTICE_BURST_SPRINT_COUNT,
  PRACTICE_BURST_SPRINT_DURATION_MS,
  PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS,
  PRACTICE_BURST_WARMUP_DURATION_MS,
} from "./practiceBurstSprintsConstants.js";
import { getPracticeBurstSprintForActiveMs } from "./practiceBurstSprintsPlan.js";

const INSERT_TYPES = new Set(["character", "space"]);
const CORRECTION_TYPES = new Set(["backspace", "word-delete"]);
const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const freshSprint = (definition) => ({
  sprintId: definition.sprintId, sprintOrdinal: definition.sprintOrdinal, activeStartMs: definition.activeStartMs, activeEndMs: definition.activeEndMs, durationMs: definition.durationMs,
  acceptedInsertions: 0, firstPassOpportunityCount: 0, correctFirstPassAttempts: 0, incorrectFirstPassAttempts: 0, correctionActions: 0, removedCount: 0,
  carryoverOpenError: false, visibilityCorrupted: false, protocolCorrupted: false, contentExhausted: false, firstInsertionAtMs: null, lastInsertionAtMs: null,
});

function finalizeSprint(state, finalActiveDurationMs) {
  const completed = finalActiveDurationMs >= state.activeEndMs;
  const minutes = PRACTICE_BURST_SPRINT_DURATION_MS / 60_000;
  const grossForwardWpm = minutes > 0 ? (state.acceptedInsertions / 5) / minutes : null;
  const burstEffectiveWpm = minutes > 0 ? (state.correctFirstPassAttempts / 5) / minutes : null;
  const firstPassAccuracy = state.firstPassOpportunityCount > 0 ? clamp((state.correctFirstPassAttempts / state.firstPassOpportunityCount) * 100, 0, 100) : 0;
  const correctionOverheadRate = state.acceptedInsertions > 0 ? clamp(state.correctionActions / state.acceptedInsertions, 0, 1) : 0;
  const eligible = completed && state.acceptedInsertions >= PRACTICE_BURST_MIN_SPRINT_CHARACTERS && state.firstPassOpportunityCount >= PRACTICE_BURST_MIN_FIRST_PASS_OPPORTUNITIES && firstPassAccuracy >= PRACTICE_BURST_MIN_SPRINT_ACCURACY && !state.carryoverOpenError && !state.visibilityCorrupted && !state.protocolCorrupted && !state.contentExhausted && Number.isFinite(burstEffectiveWpm) && burstEffectiveWpm > 0;
  return freezeDeep({ ...state, grossForwardWpm, rawWpm: grossForwardWpm, burstEffectiveWpm, correctedWpm: burstEffectiveWpm, firstPassAccuracy, strictAccuracy: firstPassAccuracy, correctionOverheadRate, completed, eligible });
}

export function createPracticeBurstSprintsAccumulator({ plan } = {}) {
  if (!plan || plan.sprintCount !== PRACTICE_BURST_SPRINT_COUNT || plan.totalActiveDurationMs !== PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS || plan.warmupDurationMs !== PRACTICE_BURST_WARMUP_DURATION_MS) throw new TypeError("Burst Sprints accumulator requires a canonical plan");
  const states = plan.sprints.map(freshSprint);
  let interrupted = false, interruptionReason = null, finalResult = null, openError = false;

  const recordProcessedInput = (event) => {
    if (finalResult || interrupted || !event || !Number.isFinite(event.relativeActiveTimestampMs)) return false;
    if (event.relativeActiveTimestampMs < PRACTICE_BURST_WARMUP_DURATION_MS) return false;
    const sprint = getPracticeBurstSprintForActiveMs(plan, event.relativeActiveTimestampMs); if (!sprint) return false;
    const state = states[sprint.sprintOrdinal - 1]; if (!state) return false;
    if (state.acceptedInsertions === 0 && openError) state.carryoverOpenError = true;
    if (INSERT_TYPES.has(event.type) && event.accepted !== false) {
      state.acceptedInsertions += 1;
      if (event.isFirstAttempt === true) { state.firstPassOpportunityCount += 1; if (event.correctness === "correct" || event.correctness === true) state.correctFirstPassAttempts += 1; else { state.incorrectFirstPassAttempts += 1; openError = true; } }
      if (state.firstInsertionAtMs == null) state.firstInsertionAtMs = event.relativeActiveTimestampMs; state.lastInsertionAtMs = event.relativeActiveTimestampMs; return true;
    }
    if (CORRECTION_TYPES.has(event.type) && event.accepted !== false) { state.correctionActions += 1; state.removedCount += Number.isFinite(event.removedCount) ? Math.max(0, event.removedCount) : 0; return true; }
    return false;
  };
  const recordClosedErrorEpisode = () => { openError = false; return true; };
  const markSprintCorrupted = (sprintOrdinal, reason = "protocol") => { const state = states[sprintOrdinal - 1]; if (!state) return false; if (reason === "visibility") state.visibilityCorrupted = true; else if (reason === "content-exhausted") state.contentExhausted = true; else state.protocolCorrupted = true; return true; };
  const markSprintStart = (sprintOrdinal, { carryoverOpenError = openError } = {}) => { const state = states[sprintOrdinal - 1]; if (!state) return false; state.carryoverOpenError = state.carryoverOpenError || carryoverOpenError === true; return true; };
  const markInterrupted = (reason = "interrupted") => { if (finalResult) return false; interrupted = true; interruptionReason = String(reason || "interrupted"); return true; };
  const finalize = ({ finalActiveDurationMs = 0 } = {}) => {
    if (finalResult) return finalResult;
    const boundedActiveMs = clamp(Number(finalActiveDurationMs) || 0, 0, PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS + 1_000);
    const sprints = states.map((state) => finalizeSprint(state, boundedActiveMs));
    const completedSprintCount = sprints.filter((sprint) => sprint.completed).length, eligibleSprintCount = sprints.filter((sprint) => sprint.eligible).length;
    const complete = !interrupted && boundedActiveMs >= PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS && completedSprintCount === PRACTICE_BURST_SPRINT_COUNT;
    finalResult = freezeDeep({ resultVersion: 2, status: interrupted ? "interrupted" : complete ? "complete" : "incomplete", interrupted, interruptionReason, warmupDurationMs: PRACTICE_BURST_WARMUP_DURATION_MS, finalActiveDurationMs: boundedActiveMs, completedSprintCount, eligibleSprintCount, sprints }); return finalResult;
  };
  return Object.freeze({ recordProcessedInput, recordClosedErrorEpisode, markSprintStart, markSprintCorrupted, markInterrupted, finalize, getFinalResult: () => finalResult, getSnapshot(activeMs = 0) { return freezeDeep({ interrupted, interruptionReason, warmup: activeMs < PRACTICE_BURST_WARMUP_DURATION_MS, currentSprint: getPracticeBurstSprintForActiveMs(plan, activeMs), sprints: states.map((state) => ({ ...state })) }); } });
}
