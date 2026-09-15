import { PRACTICE_PACE_LADDER_MAIN_STAGE_IDS } from "./practicePaceLadderConstants.js";
import { PRACTICE_PACE_LADDER_POLICY_V1 } from "./practicePaceLadderPolicy.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const finiteRate = (...values) => { const available = values.filter(Number.isFinite); return available.length ? Math.min(1, Math.max(...available)) : null; };

export function mapPaceLadderStagesToPerformancePoints(result, { difficultyAdjustmentLog = 0, policy = PRACTICE_PACE_LADDER_POLICY_V1 } = {}) {
  if (result?.status !== "complete") return freezeDeep([]);
  const rungs = PRACTICE_PACE_LADDER_MAIN_STAGE_IDS.map((id) => result?.stages?.find((stage) => stage.stageId === id)).filter(Boolean);
  const valid = rungs.filter((stage) => stage.valid === true && stage.coverage === "complete" && stage.usableSeconds >= policy.minimumStageUsableSeconds && stage.acceptedForwardInsertions >= policy.minimumStageAcceptedForwardInsertions && Number.isFinite(stage.grossWpm ?? stage.rawWpm) && (stage.grossWpm ?? stage.rawWpm) > 0);
  if (valid.length < policy.minimumFrontierStages) return freezeDeep([]);
  const adjustment = Number.isFinite(difficultyAdjustmentLog) ? difficultyAdjustmentLog : 0;
  return freezeDeep(valid.map((stage) => {
    const observedGrossWpm = stage.grossWpm ?? stage.rawWpm;
    return {
      stageId: stage.stageId,
      stageOrdinal: stage.stageOrdinal,
      plannedPaceWpm: stage.targetWpm,
      observedWpm: observedGrossWpm,
      adjustedWpm: observedGrossWpm * Math.exp(adjustment),
      difficultyAdjustmentLog: adjustment,
      accuracy: stage.strictAccuracy,
      disfluencyRate: finiteRate(stage.longPauseRate, stage.unstableErrorRate),
      correctionCostRate: Number.isFinite(stage.correctionOverheadRate) ? Math.min(1, stage.correctionOverheadRate) : null,
      activeDurationMs: Math.round(stage.usableSeconds * 1000),
      typedCharacterCount: stage.acceptedForwardInsertions,
      interrupted: false,
      majorPauseCount: 0,
    };
  }));
}

export function buildPracticePaceLadderPerformanceMeasurement(result, options = {}) {
  return freezeDeep({ stages: mapPaceLadderStagesToPerformancePoints(result, options) });
}
