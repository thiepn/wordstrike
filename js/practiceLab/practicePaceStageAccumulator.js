import { PRACTICE_PACE_LADDER_RESULT_VERSION, PRACTICE_PACE_LADDER_STAGE_VERSION } from "./practicePaceLadderConstants.js";
import { getPracticePaceLadderStageForActiveMs } from "./practicePaceLadderPlan.js";
import { resolvePracticePaceLadderReferenceAnchor } from "./practicePaceLadderAnchor.js";
import { PRACTICE_PACE_LADDER_POLICY_V1 } from "./practicePaceLadderPolicy.js";

const INSERT_TYPES = new Set(["character", "space"]);
const CORRECTION_TYPES = new Set(["backspace", "word-delete"]);
const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const quantile = (values, p) => { if (!values.length) return null; const a = [...values].sort((x, y) => x - y); const h = (a.length - 1) * p; const lo = Math.floor(h); const hi = Math.ceil(h); return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (h - lo); };
const roundTarget = (value, precision) => Math.round(value / precision) * precision;

function createState(definition) {
  return { definition, targetWpm: definition.targetWpm, rawInsertions: 0, netChars: 0, firstPassAttempts: 0, correctFirstPass: 0, correctionRemovals: 0, correctionEpisodeCount: 0, latencyRing: [], transitionCount: 0, longPauseCount: 0, ikiN: 0, ikiMean: 0, ikiM2: 0, unstableErrors: 0 };
}
function addIki(state, value, policy) {
  if (!Number.isFinite(value) || value < 0) return;
  state.transitionCount += 1;
  if (value >= policy.longPauseThresholdMs) state.longPauseCount += 1;
  state.latencyRing.push(value); if (state.latencyRing.length > policy.pauseSampleCapacity) state.latencyRing.shift();
  state.ikiN += 1; const delta = value - state.ikiMean; state.ikiMean += delta / state.ikiN; state.ikiM2 += delta * (value - state.ikiMean);
}

export function createPracticePaceStageAccumulator({ plan, policy = PRACTICE_PACE_LADDER_POLICY_V1 } = {}) {
  if (!plan?.stages?.length || plan.stages.length > policy.maximumStages) throw new TypeError("Pace Ladder accumulator requires a canonical plan");
  const states = new Map(plan.stages.map((definition) => [definition.stageId, createState(definition)]));
  let protocolInterrupted = false;
  let interruptionReason = null;
  let finalResult = null;
  let activeAnchor = plan.anchor?.status === "ready" ? plan.anchor : null;
  let lastInsertionStageId = null;

  const applyAnchorTargets = (anchor) => {
    if (!anchor || anchor.status !== "ready" || !Number.isFinite(anchor.rawAnchorWpm)) return false;
    activeAnchor = anchor;
    for (const state of states.values()) {
      if (state.definition.kind !== "rung") continue;
      state.targetWpm = roundTarget(clamp(anchor.rawAnchorWpm * state.definition.ratio, policy.targetMinimumWpm, policy.targetMaximumWpm), policy.targetPrecisionWpm);
    }
    return true;
  };
  if (activeAnchor) applyAnchorTargets(activeAnchor);

  function recordProcessedInput(event) {
    const definition = getPracticePaceLadderStageForActiveMs(plan, event?.relativeActiveTimestampMs);
    const state = definition ? states.get(definition.stageId) : null;
    if (!state) return false;
    if (INSERT_TYPES.has(event.type) && event.accepted !== false) {
      state.rawInsertions += 1; state.netChars += 1;
      if (event.isFirstAttempt === true) { state.firstPassAttempts += 1; if (event.correctness === "correct" || event.correctness === true) state.correctFirstPass += 1; else state.unstableErrors += 1; }
      if (lastInsertionStageId === definition.stageId) addIki(state, event.latencyFromPriorInsertionMs, policy);
      lastInsertionStageId = definition.stageId;
      return true;
    }
    if (CORRECTION_TYPES.has(event.type) && event.stateChanged !== false) {
      const removed = Math.max(0, Number(event.removedCount) || 0); state.correctionRemovals += removed; state.netChars = Math.max(0, state.netChars - removed); return true;
    }
    return false;
  }

  function recordClosedErrorEpisode(value = {}) {
    const episode = value?.episode ?? value;
    const startMs = Number(episode.relativeActiveStartMs ?? episode.startedAtActiveMs);
    const endMs = Number(episode.relativeActiveEndMs ?? episode.closedAtActiveMs);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
    const startStage = getPracticePaceLadderStageForActiveMs(plan, startMs);
    const endStage = getPracticePaceLadderStageForActiveMs(plan, Math.max(startMs, endMs - 0.001));
    if (!startStage || !endStage || startStage.stageId !== endStage.stageId) return false;
    const state = states.get(startStage.stageId); if (!state) return false;
    state.correctionEpisodeCount += 1; return true;
  }

  function ensureReferenceAnchor() {
    if (activeAnchor?.status === "ready") return activeAnchor;
    const state = states.get("reference");
    if (!state) return null;
    const durationMinutes = policy.referenceDurationMs / 60_000;
    const grossWpm = durationMinutes > 0 ? (state.rawInsertions / 5) / durationMinutes : null;
    const accuracy = state.firstPassAttempts ? state.correctFirstPass / state.firstPassAttempts : null;
    const coverage = state.definition.endMs <= policy.referenceDurationMs ? "complete" : "partial";
    const anchor = resolvePracticePaceLadderReferenceAnchor({ acceptedForwardInsertions: state.rawInsertions, firstPassAccuracy: accuracy, grossWpm, coverage, interrupted: protocolInterrupted, policy });
    if (anchor.status === "ready") applyAnchorTargets(anchor);
    return anchor;
  }

  function markInterrupted(reason = "protocol-interruption") { protocolInterrupted = true; interruptionReason = reason; return true; }

  function finalize({ finalActiveDurationMs = 0 } = {}) {
    if (!activeAnchor && finalActiveDurationMs >= policy.referenceDurationMs) ensureReferenceAnchor();
    const stages = plan.stages.map((definition) => {
      const state = states.get(definition.stageId);
      const usableMs = Math.max(0, Math.min(definition.endMs, finalActiveDurationMs) - definition.startMs);
      const usableSeconds = usableMs / 1000;
      const coverage = !protocolInterrupted && finalActiveDurationMs >= definition.endMs ? "complete" : "partial";
      const grossWpm = usableMs > 0 ? (state.rawInsertions / 5) / (usableMs / 60_000) : null;
      const correctedWpm = usableMs > 0 ? (state.netChars / 5) / (usableMs / 60_000) : null;
      const strictAccuracy = state.firstPassAttempts ? 100 * state.correctFirstPass / state.firstPassAttempts : null;
      const correctionOverheadRate = state.rawInsertions ? clamp(state.correctionRemovals / state.rawInsertions, 0, 1) : 0;
      const pauseP95Ms = quantile(state.latencyRing, 0.95);
      const longPauseRate = state.transitionCount ? state.longPauseCount / state.transitionCount : null;
      const variance = state.ikiN > 1 ? state.ikiM2 / (state.ikiN - 1) : null;
      const ikiCv = Number.isFinite(variance) && state.ikiMean > 0 ? Math.sqrt(variance) / state.ikiMean : null;
      const unstableErrorRate = state.firstPassAttempts ? state.unstableErrors / state.firstPassAttempts : null;
      const minimumChars = definition.kind === "reference" ? policy.referenceMinimumAcceptedForwardInsertions : policy.minimumStageAcceptedForwardInsertions;
      const valid = coverage === "complete" && usableSeconds >= (definition.kind === "reference" ? policy.referenceMinimumUsableSeconds : policy.minimumStageUsableSeconds) && state.rawInsertions >= minimumChars && Number.isFinite(strictAccuracy) && (definition.kind !== "reference" || strictAccuracy / 100 >= policy.referenceMinimumFirstPassAccuracy);
      return freezeDeep({ stageVersion: PRACTICE_PACE_LADDER_STAGE_VERSION, stageId: definition.stageId, stageOrdinal: definition.stageOrdinal, kind: definition.kind, ratio: definition.ratio, targetWpm: state.targetWpm, rawWpm: grossWpm, grossWpm, correctedWpm, strictAccuracy, correctionOverheadRate, correctionEpisodeCount: state.correctionEpisodeCount, pauseP95Ms, longPauseRate, ikiCv, unstableErrorRate, usableSeconds, acceptedForwardInsertions: state.rawInsertions, correctedChars: state.netChars, coverage, valid, interrupted: protocolInterrupted });
    });
    finalResult = freezeDeep({ resultVersion: PRACTICE_PACE_LADDER_RESULT_VERSION, status: protocolInterrupted ? "interrupted" : activeAnchor?.status === "ready" ? "complete" : "insufficient-measurement", interruptionReason, anchor: activeAnchor, stages, boundedDiagnostics: { stageCount: states.size, pauseSampleCapacity: policy.pauseSampleCapacity, maximumRetainedPauseSamples: states.size * policy.pauseSampleCapacity, retainsFullEventLog: false } });
    return finalResult;
  }

  return Object.freeze({ recordProcessedInput, recordClosedErrorEpisode, markInterrupted, ensureReferenceAnchor, getAnchor: () => activeAnchor, getCurrentStage(activeMs) { if (!activeAnchor && activeMs >= policy.referenceDurationMs) ensureReferenceAnchor(); const definition = getPracticePaceLadderStageForActiveMs(plan, activeMs); const state = definition ? states.get(definition.stageId) : null; return definition ? freezeDeep({ stageId: definition.stageId, stageOrdinal: definition.stageOrdinal, kind: definition.kind, ratio: definition.ratio, targetWpm: state?.targetWpm ?? null, remainingMs: Math.max(0, definition.endMs - activeMs) }) : null; }, finalize, getFinalResult: () => finalResult, getDiagnostics: () => freezeDeep({ stageCount: states.size, protocolInterrupted, pauseSampleCapacity: policy.pauseSampleCapacity, retainsFullEventLog: false }) });
}
