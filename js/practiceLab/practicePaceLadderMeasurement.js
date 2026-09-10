import { PRACTICE_PACE_LADDER_MAIN_STAGE_IDS } from "./practicePaceLadderConstants.js";
import { PRACTICE_PACE_LADDER_POLICY_V1 } from "./practicePaceLadderPolicy.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const finiteRate = (...values) => { const available = values.filter(Number.isFinite); return available.length ? Math.min(1, Math.max(...available)) : null; };

export function mapPaceLadderStagesToPerformancePoints(result, { difficultyAdjustmentLog = 0, policy = PRACTICE_PACE_LADDER_POLICY_V1 } = {}) {
  const main = PRACTICE_PACE_LADDER_MAIN_STAGE_IDS.map((id) => result?.stages?.find((stage) => stage.stageId === id)).filter(Boolean);
  const admissible = result?.status === "complete" && main.length === policy.minimumFrontierStages && main.every((stage) => stage.valid === true && stage.coverage === "complete" && stage.usableSeconds >= policy.minimumStageUsableSeconds && stage.correctedChars >= policy.minimumStageCorrectedCharacters && Number.isFinite(stage.correctedWpm) && stage.correctedWpm > 0);
  if (!admissible) return freezeDeep([]);
  return freezeDeep(main.map((stage) => ({
    stageId: stage.stageId,
    stageOrdinal: stage.stageOrdinal,
    plannedPaceWpm: stage.targetWpm,
    observedWpm: stage.correctedWpm,
    adjustedWpm: stage.correctedWpm * Math.exp(Number.isFinite(difficultyAdjustmentLog) ? difficultyAdjustmentLog : 0),
    difficultyAdjustmentLog: Number.isFinite(difficultyAdjustmentLog) ? difficultyAdjustmentLog : 0,
    accuracy: stage.strictAccuracy,
    disfluencyRate: finiteRate(stage.longPauseRate, stage.unstableErrorRate),
    correctionCostRate: Number.isFinite(stage.correctionOverheadRate) ? Math.min(1, stage.correctionOverheadRate) : null,
    activeDurationMs: Math.round(stage.usableSeconds * 1000),
    typedCharacterCount: stage.correctedChars,
    interrupted: false,
    majorPauseCount: 0,
  })));
}

export function buildPracticePaceLadderPerformanceMeasurement(result, options = {}) {
  return freezeDeep({ stages: mapPaceLadderStagesToPerformancePoints(result, options) });
}
