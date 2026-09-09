import { PRACTICE_PACE_LADDER_ARTIFACT_VERSION, PRACTICE_PACE_LADDER_EVIDENCE_BOUNDARY, PRACTICE_PACE_LADDER_EXPERIMENT_ID, PRACTICE_PACE_LADDER_MAIN_STAGE_IDS } from "./practicePaceLadderConstants.js";
import { resolvePracticePaceLadderCalibration } from "./practicePaceLadderAnchor.js";
import { PRACTICE_PACE_LADDER_POLICY_V1 } from "./practicePaceLadderPolicy.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const growth = (value, baseline) => Number.isFinite(value) && Number.isFinite(baseline) && baseline > 0 ? 100 * (value / baseline - 1) : null;

function controlled(stage, baseline, policy) {
  if (!stage?.valid || stage.coverage !== "complete" || !Number.isFinite(stage.correctedWpm) || !Number.isFinite(stage.strictAccuracy)) return false;
  const paceRatio = stage.targetWpm > 0 ? stage.correctedWpm / stage.targetWpm : 0;
  const accuracyOk = stage.strictAccuracy >= policy.minimumAbsoluteAccuracy && (!Number.isFinite(baseline?.strictAccuracy) || baseline.strictAccuracy - stage.strictAccuracy <= policy.maximumAccuracyDropPp);
  const correctionOk = !Number.isFinite(baseline?.correctionOverheadRate) || stage.correctionOverheadRate - baseline.correctionOverheadRate <= policy.maximumCorrectionGrowth;
  const pauseOk = !Number.isFinite(baseline?.longPauseRate) || !Number.isFinite(stage.longPauseRate) || stage.longPauseRate - baseline.longPauseRate <= policy.maximumPauseGrowth;
  const rhythmOk = !Number.isFinite(baseline?.ikiCv) || !Number.isFinite(stage.ikiCv) || stage.ikiCv <= baseline.ikiCv * (1 + policy.maximumRhythmGrowthRatio);
  return paceRatio >= policy.paceLowerRatio && paceRatio <= policy.paceUpperRatio && accuracyOk && correctionOk && pauseOk && rhythmOk;
}

export function analyzePracticePaceLadderResult({ paceResult, plan, foundationAnalysis, startedAt = null, completedAt = null, policy = PRACTICE_PACE_LADDER_POLICY_V1 } = {}) {
  if (!paceResult || !plan) return freezeDeep({ trainingQuality: null, recommendationIds: [] });
  const calibrationStage = paceResult.stages.find((stage) => stage.stageId === "calibration") ?? null;
  const calibration = resolvePracticePaceLadderCalibration({ ...calibrationStage, interrupted: paceResult.status === "interrupted", policy });
  const main = PRACTICE_PACE_LADDER_MAIN_STAGE_IDS.map((id) => paceResult.stages.find((stage) => stage.stageId === id)).filter(Boolean);
  const controlledStages = calibration.eligible ? main.filter((stage) => controlled(stage, calibrationStage, policy)) : [];
  const sustainableStage = controlledStages.length ? controlledStages.reduce((best, stage) => stage.targetWpm > best.targetWpm ? stage : best) : null;
  const sustainableIndex = sustainableStage ? main.indexOf(sustainableStage) : -1;
  const stretchStage = sustainableIndex >= 0 ? main[sustainableIndex + 1] ?? null : null;
  const overLimitStage = main.find((stage, index) => index > sustainableIndex && !controlled(stage, calibrationStage, policy)) ?? null;
  const allMainValid = paceResult.status === "complete" && main.length === 5 && main.every((stage) => stage.valid && stage.coverage === "complete");
  const performance = foundationAnalysis?.performance?.sessionSummary ?? null;
  const localStatus = paceResult.status === "interrupted" ? "interrupted" : allMainValid && calibration.eligible ? "complete" : "insufficient-measurement";
  const frontierStatus = allMainValid && performance?.status === "measured" ? performance.frontierStatus : "insufficient-measurement";
  const observedControlled = controlledStages.map((stage) => stage.targetWpm).filter(Number.isFinite);
  const sustainableWpm = sustainableStage?.targetWpm ?? null;
  const low = sustainableWpm == null ? null : Math.max(Math.min(...observedControlled), sustainableWpm * policy.practiceBandLowRatio);
  const high = sustainableWpm == null ? null : Math.min(Math.max(...observedControlled), sustainableWpm * policy.practiceBandHighRatio);
  const artifact = {
    artifactVersion: PRACTICE_PACE_LADDER_ARTIFACT_VERSION,
    experimentId: PRACTICE_PACE_LADDER_EXPERIMENT_ID,
    profileId: plan.profileId,
    contextId: plan.contextId,
    startedAt,
    completedAt,
    formId: plan.formId,
    formFamilyId: plan.formFamilyId,
    formOrdinal: plan.formOrdinal,
    anchor: { ...plan.anchor, calibrationWpm: calibration.calibrationWpm, calibrationEligible: calibration.eligible },
    stages: paceResult.stages,
    summary: {
      status: localStatus,
      sustainableWpm,
      stretchWpm: stretchStage?.targetWpm ?? null,
      overLimitWpm: overLimitStage?.targetWpm ?? null,
      frontierWpm: frontierStatus === "insufficient-measurement" ? null : performance?.frontierWpm ?? null,
      frontierStatus,
      accuracyLossPct: sustainableStage && calibrationStage ? calibrationStage.strictAccuracy - sustainableStage.strictAccuracy : null,
      correctionGrowthPct: sustainableStage ? growth(sustainableStage.correctionOverheadRate, calibrationStage?.correctionOverheadRate) : null,
      pauseGrowthPct: sustainableStage ? growth(sustainableStage.longPauseRate, calibrationStage?.longPauseRate) : null,
      rhythmGrowthPct: sustainableStage ? growth(sustainableStage.ikiCv, calibrationStage?.ikiCv) : null,
      recommendedPracticePaceWpm: sustainableWpm,
      recommendedPracticeBandWpm: low == null || high == null ? null : [low, high],
    },
    evidenceBoundary: { ...PRACTICE_PACE_LADDER_EVIDENCE_BOUNDARY },
    guidance: [
      "This is the fastest pace you sustained under this protocol.",
      "This does not estimate your true maximum speed.",
      "For accuracy-focused practice, this band is a reasonable starting point.",
    ],
  };
  return freezeDeep({ trainingQuality: artifact, recommendationIds: [] });
}
