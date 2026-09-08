import { practiceMedian } from "./practiceRobustStats.js";
import { derivePracticeLatencyTransitionCandidate } from "./practiceLatencyClassifier.js";
import { calculatePracticePaceLadderDifficultyAdjustment, resolvePracticePaceLadderCalibration } from "./practicePaceLadderAnchor.js";
import { getPracticePaceGuide } from "./practicePaceGuide.js";
import {
  PRACTICE_PACE_LADDER_RESULT_VERSION,
  PRACTICE_PACE_LADDER_STAGE_INVALID_REASONS,
  PRACTICE_PACE_LADDER_STAGE_VERSION,
} from "./practicePaceLadderConstants.js";
import { getPracticePaceLadderStageForActiveMs } from "./practicePaceLadderPlan.js";
import { PRACTICE_PACE_LADDER_POLICY_V1 } from "./practicePaceLadderPolicy.js";

const INSERT_TYPES = new Set(["character", "space"]);
const CORRECTION_TYPES = new Set(["backspace", "word-delete"]);
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const boundedPush = (array, value, limit) => {
  if (!Number.isFinite(value)) return;
  array.push(value);
  if (array.length > limit) array.splice(0, array.length - limit);
};
const stageState = (definition) => ({
  stageId: definition.stageId,
  stageOrdinal: definition.stageOrdinal,
  acceptedForwardCharacters: 0,
  firstPassAttempts: 0,
  correctFirstPassAttempts: 0,
  firstPassMinimumIndex: null,
  firstPassMaximumIndex: null,
  paceOffsets: [],
  latencySamples: [],
  correctionIntervals: [],
  correctionCoverage: "full",
  interrupted: false,
  invalidReasons: new Set(),
});
function scheduleFor(plan) {
  return plan ? [plan.referenceStage, ...(plan.rungSchedule ?? [])] : [];
}
function unionDuration(intervals) {
  const sorted = intervals
    .filter((item) => Number.isFinite(item?.startMs) && Number.isFinite(item?.endMs) && item.endMs >= item.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  if (!sorted.length) return 0;
  let total = 0;
  let start = sorted[0].startMs;
  let end = sorted[0].endMs;
  for (const item of sorted.slice(1)) {
    if (item.startMs <= end) end = Math.max(end, item.endMs);
    else { total += end - start; start = item.startMs; end = item.endMs; }
  }
  return total + end - start;
}

export function createPracticePaceStageAccumulator({
  plan,
  policy = PRACTICE_PACE_LADDER_POLICY_V1,
  scoreStageSpan = null,
} = {}) {
  if (!plan) throw new TypeError("Pace Ladder accumulator requires a plan");
  let resolvedPlan = plan;
  let states = new Map(scheduleFor(plan).map((definition) => [definition.stageId, stageState(definition)]));
  let priorInsertion = null;
  let correctionSincePrior = false;
  let protocolInterrupted = false;
  let finalResult = null;

  const definitionForEvent = (event) => getPracticePaceLadderStageForActiveMs(resolvedPlan, event?.relativeActiveTimestampMs);
  const refreshDefinitions = () => {
    const prior = states;
    states = new Map(scheduleFor(resolvedPlan).map((definition) => [definition.stageId, prior.get(definition.stageId) ?? stageState(definition)]));
  };

  const recordProcessedInput = (event) => {
    if (!event || typeof event !== "object") return false;
    if (CORRECTION_TYPES.has(event.type)) {
      correctionSincePrior = true;
      return true;
    }
    if (!INSERT_TYPES.has(event.type)) return false;
    const definition = definitionForEvent(event);
    const state = definition ? states.get(definition.stageId) : null;
    if (!state) {
      priorInsertion = event;
      correctionSincePrior = false;
      return false;
    }
    state.acceptedForwardCharacters += 1;
    if (event.isFirstAttempt === true) {
      state.firstPassAttempts += 1;
      if (event.correctness === "correct" || event.correctness === true) state.correctFirstPassAttempts += 1;
      if (Number.isInteger(event.textPosition)) {
        state.firstPassMinimumIndex = state.firstPassMinimumIndex == null ? event.textPosition : Math.min(state.firstPassMinimumIndex, event.textPosition);
        state.firstPassMaximumIndex = state.firstPassMaximumIndex == null ? event.textPosition : Math.max(state.firstPassMaximumIndex, event.textPosition);
      }
    }
    if (Number.isFinite(definition.plannedPaceWpm) && definition.plannedPaceWpm > 0) {
      const guide = getPracticePaceGuide({
        targetWpm: definition.plannedPaceWpm,
        elapsedMs: Math.max(0, event.relativeActiveTimestampMs - definition.startMs),
        acceptedForwardCharacters: state.acceptedForwardCharacters,
        policy,
      });
      boundedPush(state.paceOffsets, guide.paceOffsetSeconds, policy.maximumPaceSamplesPerStage);
    }
    const transition = derivePracticeLatencyTransitionCandidate({ event, priorInsertion, correctionSincePrior });
    if (transition.baselineEligible && priorInsertion) {
      const priorDefinition = definitionForEvent(priorInsertion);
      if (priorDefinition?.stageId === definition.stageId) boundedPush(state.latencySamples, transition.latency, policy.maximumLatencySamplesPerStage);
    }
    priorInsertion = event;
    correctionSincePrior = false;
    return true;
  };

  const recordClosedErrorEpisode = ({ episode } = {}) => {
    if (!episode?.corrected || !Number.isFinite(episode.repairCompleteActiveMs) || !Number.isFinite(episode.errorToRepairMs)) return false;
    const endMs = episode.repairCompleteActiveMs;
    const startMs = Math.max(0, endMs - episode.errorToRepairMs);
    const startDefinition = getPracticePaceLadderStageForActiveMs(resolvedPlan, startMs);
    const endDefinition = getPracticePaceLadderStageForActiveMs(resolvedPlan, Math.max(startMs, endMs - 1e-6));
    if (!startDefinition || !endDefinition) return false;
    if (startDefinition.stageId !== endDefinition.stageId) {
      const startState = states.get(startDefinition.stageId);
      const endState = states.get(endDefinition.stageId);
      if (startState) startState.correctionCoverage = "partial";
      if (endState) endState.correctionCoverage = "partial";
      return false;
    }
    states.get(startDefinition.stageId)?.correctionIntervals.push({ startMs, endMs });
    return true;
  };

  const markInterrupted = (reason = "protocol-interruption") => {
    protocolInterrupted = true;
    const normalized = PRACTICE_PACE_LADDER_STAGE_INVALID_REASONS.includes(reason) ? reason : "protocol-interruption";
    for (const state of states.values()) {
      state.interrupted = true;
      state.invalidReasons.add(normalized);
    }
  };

  const resolvePlan = (nextPlan) => {
    if (!nextPlan || nextPlan.planHash !== plan.planHash) throw new TypeError("Resolved Pace Ladder plan must preserve the original plan hash");
    resolvedPlan = nextPlan;
    refreshDefinitions();
    return resolvedPlan;
  };

  const getCalibrationCandidate = () => {
    const reference = states.get("reference");
    return resolvePracticePaceLadderCalibration({
      acceptedForwardCharacters: reference?.acceptedForwardCharacters ?? 0,
      correctFirstPassAttempts: reference?.correctFirstPassAttempts ?? 0,
      allFirstPassAttempts: reference?.firstPassAttempts ?? 0,
      activeDurationMs: policy.referenceDurationMs,
      policy,
    });
  };

  const current = (activeMs) => {
    const definition = getPracticePaceLadderStageForActiveMs(resolvedPlan, activeMs);
    if (!definition) return null;
    const state = states.get(definition.stageId);
    const guide = Number.isFinite(definition.plannedPaceWpm) && definition.plannedPaceWpm > 0
      ? getPracticePaceGuide({
          targetWpm: definition.plannedPaceWpm,
          elapsedMs: Math.max(0, activeMs - definition.startMs),
          acceptedForwardCharacters: state?.acceptedForwardCharacters ?? 0,
          policy,
        })
      : null;
    return freezeDeep({
      stageId: definition.stageId,
      stageOrdinal: definition.stageOrdinal,
      plannedPaceWpm: definition.plannedPaceWpm,
      remainingMs: Math.max(0, definition.endMs - activeMs),
      guide,
    });
  };

  const finalize = ({ finalActiveDurationMs, latencyAnalysis = null } = {}) => {
    const thresholdMs = latencyAnalysis?.thresholdMs;
    const latencyAdaptive = latencyAnalysis?.calibration?.status === "adaptive" && Number.isFinite(thresholdMs);
    const stages = scheduleFor(resolvedPlan).map((definition) => {
      const state = states.get(definition.stageId) ?? stageState(definition);
      const durationMs = Math.max(0, Math.min(definition.endMs, finalActiveDurationMs ?? 0) - definition.startMs);
      const observedPaceWpm = durationMs > 0 ? (state.acceptedForwardCharacters / 5) / (durationMs / 60_000) : null;
      const firstPassAccuracy = state.firstPassAttempts > 0 ? 100 * state.correctFirstPassAttempts / state.firstPassAttempts : null;
      const timingEligibleCount = state.latencySamples.length;
      const disfluencyRate = latencyAdaptive && timingEligibleCount >= policy.minimumStageTimingTransitions
        ? state.latencySamples.filter((value) => value > thresholdMs).length / timingEligibleCount
        : null;
      const correctionCostMs = unionDuration(state.correctionIntervals);
      const correctionCostRate = durationMs > 0 ? clamp(correctionCostMs / durationMs, 0, 1) : null;
      const spanStart = state.firstPassMinimumIndex;
      const spanEnd = state.firstPassMaximumIndex == null ? null : state.firstPassMaximumIndex + 1;
      let spanDifficulty = null;
      try {
        if (typeof scoreStageSpan === "function" && spanStart != null && spanEnd != null && spanEnd > spanStart) spanDifficulty = scoreStageSpan(spanStart, spanEnd);
      } catch {
        spanDifficulty = null;
      }
      const difficulty = calculatePracticePaceLadderDifficultyAdjustment(spanDifficulty);
      const difficultyUsable = spanDifficulty?.availableModelWeight >= policy.formMinimumAvailableModelWeight && difficulty.status === "adjusted";
      const difficultyAdjustmentLog = difficultyUsable ? difficulty.adjustmentLog : 0;
      const adjustedPaceWpm = Number.isFinite(observedPaceWpm) ? observedPaceWpm * Math.exp(difficultyAdjustmentLog) : null;
      const reasons = new Set(state.invalidReasons);
      if (durationMs < policy.minimumStageDurationMs) reasons.add("duration");
      if (state.acceptedForwardCharacters < policy.minimumStageForwardCharacters) reasons.add("too-few-characters");
      if (!Number.isFinite(firstPassAccuracy) || firstPassAccuracy < policy.minimumStageFirstPassAccuracy) reasons.add("accuracy-floor");
      if (protocolInterrupted) reasons.add("protocol-interruption");
      const offsets = state.paceOffsets.filter(Number.isFinite);
      const onPaceSampleCount = offsets.filter((value) => Math.abs(value) <= policy.onPaceToleranceSeconds).length;
      const paceAdherence = definition.plannedPaceWpm == null ? null : {
        sampleCount: offsets.length,
        onPaceSampleCount,
        onPaceFraction: offsets.length ? onPaceSampleCount / offsets.length : null,
        medianAbsoluteOffsetSeconds: offsets.length ? practiceMedian(offsets.map(Math.abs)) : null,
        finalOffsetSeconds: offsets.length ? offsets.at(-1) : null,
      };
      return freezeDeep({
        stageVersion: PRACTICE_PACE_LADDER_STAGE_VERSION,
        stageId: definition.stageId,
        stageOrdinal: definition.stageOrdinal,
        durationMs,
        plannedPaceWpm: definition.plannedPaceWpm,
        observedPaceWpm,
        adjustedPaceWpm,
        effectiveWpm: null,
        firstPassAccuracy,
        timingEligibleCount,
        disfluencyRate,
        correctionCostRate,
        correctionCostMs,
        correctionCoverage: state.correctionCoverage,
        difficultyAdjustmentLog,
        difficultyStatus: difficultyUsable ? "adjusted" : "unadjusted",
        paceAdherence,
        typedCharacterCount: state.acceptedForwardCharacters,
        firstPassSpan: spanStart == null || spanEnd == null ? null : { startIndex: spanStart, endIndex: spanEnd },
        valid: reasons.size === 0,
        invalidReasons: [...reasons],
      });
    });
    finalResult = freezeDeep({
      resultVersion: PRACTICE_PACE_LADDER_RESULT_VERSION,
      planHash: resolvedPlan.planHash,
      anchorSource: resolvedPlan.anchor.source,
      rawAnchorWpm: resolvedPlan.anchor.rawReferenceWpm,
      paceRangeClipped: resolvedPlan.paceRangeClipped,
      stageCount: stages.length,
      validStageCount: stages.filter((stage) => stage.valid).length,
      stages,
    });
    return finalResult;
  };

  return Object.freeze({
    recordProcessedInput,
    recordClosedErrorEpisode,
    markInterrupted,
    resolvePlan,
    getCalibrationCandidate,
    getCurrentStage: current,
    getResolvedPlan: () => resolvedPlan,
    getFinalResult: () => finalResult,
    finalize,
    getDiagnostics: () => freezeDeep({
      stageCount: states.size,
      protocolInterrupted,
      retainedPaceSamples: [...states.values()].reduce((sum, state) => sum + state.paceOffsets.length, 0),
      retainedLatencySamples: [...states.values()].reduce((sum, state) => sum + state.latencySamples.length, 0),
      retainedCorrectionIntervals: [...states.values()].reduce((sum, state) => sum + state.correctionIntervals.length, 0),
    }),
  });
}
