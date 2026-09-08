import { PRACTICE_PACE_LADDER_POLICY_V1 } from "./practicePaceLadderPolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function buildPracticePaceLadderPerformanceMeasurement(result, policy = PRACTICE_PACE_LADDER_POLICY_V1) {
  const valid = (result?.stages ?? []).filter((stage) => stage?.valid === true && Number.isFinite(stage.observedPaceWpm) && stage.observedPaceWpm > 0);
  if (valid.length < policy.minimumFrontierStages) return freezeDeep({ stages: [] });
  return freezeDeep({
    stages: valid.map((stage) => ({
      stageId: stage.stageId,
      stageOrdinal: stage.stageOrdinal,
      plannedPaceWpm: Number.isFinite(stage.plannedPaceWpm) ? stage.plannedPaceWpm : null,
      observedWpm: stage.observedPaceWpm,
      adjustedWpm: Number.isFinite(stage.adjustedPaceWpm) ? stage.adjustedPaceWpm : null,
      difficultyAdjustmentLog: Number.isFinite(stage.difficultyAdjustmentLog) ? stage.difficultyAdjustmentLog : null,
      accuracy: stage.firstPassAccuracy,
      disfluencyRate: Number.isFinite(stage.disfluencyRate) ? stage.disfluencyRate : null,
      correctionCostRate: Number.isFinite(stage.correctionCostRate) ? stage.correctionCostRate : null,
      activeDurationMs: stage.durationMs,
      typedCharacterCount: stage.typedCharacterCount,
      interrupted: stage.invalidReasons?.includes("visibility-interruption") || stage.invalidReasons?.includes("protocol-interruption"),
      majorPauseCount: 0,
    })),
  });
}
