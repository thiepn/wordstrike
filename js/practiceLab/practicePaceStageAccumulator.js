import { PRACTICE_PACE_LADDER_RESULT_VERSION, PRACTICE_PACE_LADDER_STAGE_VERSION } from "./practicePaceLadderConstants.js";
import { getPracticePaceLadderStageForActiveMs } from "./practicePaceLadderPlan.js";
import { PRACTICE_PACE_LADDER_POLICY_V1 } from "./practicePaceLadderPolicy.js";

const INSERT_TYPES = new Set(["character", "space"]);
const CORRECTION_TYPES = new Set(["backspace", "word-delete"]);
const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const quantile = (values, p) => { if (!values.length) return null; const a = [...values].sort((x, y) => x - y); const h = (a.length - 1) * p; const lo = Math.floor(h); const hi = Math.ceil(h); return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (h - lo); };

function createState(definition) {
  return { definition, rawInsertions: 0, netChars: 0, firstPassAttempts: 0, correctFirstPass: 0, correctionRemovals: 0, latencyRing: [], transitionCount: 0, longPauseCount: 0, ikiN: 0, ikiMean: 0, ikiM2: 0, unstableErrors: 0 };
}
function addIki(state, value, policy) {
  if (!Number.isFinite(value) || value < 0) return;
  state.transitionCount += 1;
  if (value >= policy.longPauseThresholdMs) state.longPauseCount += 1;
  state.latencyRing.push(value); if (state.latencyRing.length > policy.pauseSampleCapacity) state.latencyRing.shift();
  state.ikiN += 1; const delta = value - state.ikiMean; state.ikiMean += delta / state.ikiN; state.ikiM2 += delta * (value - state.ikiMean);
}

export function createPracticePaceStageAccumulator({ plan, policy = PRACTICE_PACE_LADDER_POLICY_V1 } = {}) {
  if (!plan?.stages?.length) throw new TypeError("Pace Ladder accumulator requires a plan");
  const states = new Map(plan.stages.map((definition) => [definition.stageId, createState(definition)]));
  let protocolInterrupted = false;
  let interruptionReason = null;
  let finalResult = null;

  function recordProcessedInput(event) {
    const definition = getPracticePaceLadderStageForActiveMs(plan, event?.relativeActiveTimestampMs);
    const state = definition ? states.get(definition.stageId) : null;
    if (!state) return false;
    if (INSERT_TYPES.has(event.type)) {
      state.rawInsertions += 1; state.netChars += 1;
      if (event.isFirstAttempt === true) { state.firstPassAttempts += 1; if (event.correctness === "correct" || event.correctness === true) state.correctFirstPass += 1; else state.unstableErrors += 1; }
      addIki(state, event.latencyFromPriorInsertionMs, policy);
      return true;
    }
    if (CORRECTION_TYPES.has(event.type) && event.stateChanged !== false) {
      const removed = Math.max(0, Number(event.removedCount) || 0); state.correctionRemovals += removed; state.netChars = Math.max(0, state.netChars - removed); return true;
    }
    return false;
  }

  function markInterrupted(reason = "protocol-interruption") { protocolInterrupted = true; interruptionReason = reason; return true; }

  function finalize({ finalActiveDurationMs = 0 } = {}) {
    const stages = plan.stages.map((definition) => {
      const state = states.get(definition.stageId);
      const usableMs = Math.max(0, Math.min(definition.endMs, finalActiveDurationMs) - definition.startMs);
      const usableSeconds = usableMs / 1000;
      const coverage = !protocolInterrupted && finalActiveDurationMs >= definition.endMs ? "complete" : "partial";
      const rawWpm = usableMs > 0 ? (state.rawInsertions / 5) / (usableMs / 60_000) : null;
      const correctedWpm = usableMs > 0 ? (state.netChars / 5) / (usableMs / 60_000) : null;
      const strictAccuracy = state.firstPassAttempts ? 100 * state.correctFirstPass / state.firstPassAttempts : null;
      const correctionOverheadRate = state.rawInsertions ? clamp(state.correctionRemovals / state.rawInsertions, 0, 1) : 0;
      const pauseP95Ms = quantile(state.latencyRing, 0.95);
      const longPauseRate = state.transitionCount ? state.longPauseCount / state.transitionCount : null;
      const variance = state.ikiN > 1 ? state.ikiM2 / (state.ikiN - 1) : null;
      const ikiCv = Number.isFinite(variance) && state.ikiMean > 0 ? Math.sqrt(variance) / state.ikiMean : null;
      const unstableErrorRate = state.firstPassAttempts ? state.unstableErrors / state.firstPassAttempts : null;
      const valid = coverage === "complete" && usableSeconds >= policy.minimumStageUsableSeconds && state.netChars >= policy.minimumStageCorrectedCharacters && Number.isFinite(strictAccuracy);
      return freezeDeep({
        stageVersion: PRACTICE_PACE_LADDER_STAGE_VERSION, stageId: definition.stageId, stageOrdinal: definition.stageOrdinal, kind: definition.kind,
        targetWpm: definition.targetWpm, rawWpm, correctedWpm, strictAccuracy, correctionOverheadRate, pauseP95Ms, longPauseRate, ikiCv, unstableErrorRate,
        usableSeconds, correctedChars: state.netChars, coverage, valid, interrupted: protocolInterrupted,
      });
    });
    finalResult = freezeDeep({ resultVersion: PRACTICE_PACE_LADDER_RESULT_VERSION, status: protocolInterrupted ? "interrupted" : "complete", interruptionReason, stages, boundedDiagnostics: { stageCount: states.size, pauseSampleCapacity: policy.pauseSampleCapacity, maximumRetainedPauseSamples: states.size * policy.pauseSampleCapacity, retainsFullEventLog: false } });
    return finalResult;
  }

  return Object.freeze({
    recordProcessedInput,
    recordClosedErrorEpisode() { return false; },
    markInterrupted,
    getCurrentStage(activeMs) { const definition = getPracticePaceLadderStageForActiveMs(plan, activeMs); return definition ? freezeDeep({ stageId: definition.stageId, stageOrdinal: definition.stageOrdinal, kind: definition.kind, targetWpm: definition.targetWpm, remainingMs: Math.max(0, definition.endMs - activeMs) }) : null; },
    finalize,
    getFinalResult: () => finalResult,
    getDiagnostics: () => freezeDeep({ stageCount: states.size, protocolInterrupted, pauseSampleCapacity: policy.pauseSampleCapacity, retainsFullEventLog: false }),
  });
}
