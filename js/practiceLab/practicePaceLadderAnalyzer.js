import { PRACTICE_PACE_LADDER_RESULT_VERSION } from "./practicePaceLadderConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function compactStage(stage) {
  return {
    stageVersion: stage.stageVersion,
    stageId: stage.stageId,
    stageOrdinal: stage.stageOrdinal,
    durationMs: stage.durationMs,
    plannedPaceWpm: stage.plannedPaceWpm,
    observedPaceWpm: stage.observedPaceWpm,
    adjustedPaceWpm: stage.adjustedPaceWpm,
    firstPassAccuracy: stage.firstPassAccuracy,
    timingEligibleCount: stage.timingEligibleCount,
    disfluencyRate: stage.disfluencyRate,
    correctionCostRate: stage.correctionCostRate,
    correctionCoverage: stage.correctionCoverage,
    difficultyAdjustmentLog: stage.difficultyAdjustmentLog,
    difficultyStatus: stage.difficultyStatus,
    paceAdherence: stage.paceAdherence,
    typedCharacterCount: stage.typedCharacterCount,
    valid: stage.valid,
    invalidReasons: [...(stage.invalidReasons ?? [])],
  };
}

export function analyzePracticePaceLadderResult({ paceResult, plan, foundationAnalysis } = {}) {
  if (!paceResult || !plan) return freezeDeep({ trainingQuality: null, recommendationIds: [] });
  const observed = paceResult.stages.map((stage) => stage.observedPaceWpm).filter(Number.isFinite);
  const performance = foundationAnalysis?.performance ?? null;
  return freezeDeep({
    trainingQuality: {
      resultVersion: PRACTICE_PACE_LADDER_RESULT_VERSION,
      formSetId: plan.formSetId,
      formSetVersion: plan.formSetVersion,
      formId: plan.formId,
      formHash: plan.formHash,
      planHash: plan.planHash,
      anchorSource: plan.anchor.source,
      rawAnchorWpm: plan.anchor.rawReferenceWpm,
      validStageCount: paceResult.validStageCount,
      stageCount: paceResult.stageCount,
      paceRangeObserved: observed.length ? { minimumWpm: Math.min(...observed), maximumWpm: Math.max(...observed) } : null,
      paceRangeClipped: Boolean(plan.paceRangeClipped),
      performanceMeasurementStatus: performance?.status ?? "not-requested",
      frontier: performance?.sessionSummary ? {
        status: performance.sessionSummary.frontierStatus,
        confidence: performance.sessionSummary.frontierConfidence,
        frontierWpm: performance.sessionSummary.frontierWpm,
        frontierLowerWpm: performance.sessionSummary.frontierLowerWpm,
        frontierUpperWpm: performance.sessionSummary.frontierUpperWpm,
      } : null,
      stages: paceResult.stages.slice(0, 9).map(compactStage),
    },
    recommendationIds: [],
  });
}
