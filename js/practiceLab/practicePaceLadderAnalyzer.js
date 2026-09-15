import { PRACTICE_PACE_LADDER_ARTIFACT_VERSION, PRACTICE_PACE_LADDER_EVIDENCE_BOUNDARY, PRACTICE_PACE_LADDER_EXPERIMENT_ID, PRACTICE_PACE_LADDER_MAIN_STAGE_IDS } from "./practicePaceLadderConstants.js";
import { PRACTICE_PACE_LADDER_POLICY_V1 } from "./practicePaceLadderPolicy.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };

export function analyzePracticePaceLadderResult({ paceResult, plan, foundationAnalysis, startedAt = null, completedAt = null, policy = PRACTICE_PACE_LADDER_POLICY_V1 } = {}) {
  if (!paceResult || !plan) return freezeDeep({ trainingQuality: null, recommendationIds: [] });
  const reference = paceResult.stages?.find((stage) => stage.stageId === "reference") ?? null;
  const rungs = PRACTICE_PACE_LADDER_MAIN_STAGE_IDS.map((id) => paceResult.stages?.find((stage) => stage.stageId === id)).filter(Boolean);
  const validRungs = rungs.filter((stage) => stage.valid && stage.coverage === "complete");
  const performance = foundationAnalysis?.performance?.sessionSummary ?? null;
  const localStatus = paceResult.status === "interrupted" ? "interrupted" : paceResult.anchor?.status === "ready" && validRungs.length >= policy.minimumFrontierStages ? "complete" : "insufficient-measurement";
  const frontierStatus = performance?.status === "measured" ? performance.frontierStatus : "insufficient-measurement";
  const frontierWpm = frontierStatus === "insufficient-measurement" ? null : performance?.frontierWpm ?? null;
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
    anchor: paceResult.anchor ?? plan.anchor,
    reference,
    stages: rungs,
    summary: {
      status: localStatus,
      validRungCount: validRungs.length,
      frontierWpm,
      frontierStatus,
      frontierDisplay: frontierStatus === "lower-bound" && Number.isFinite(frontierWpm) ? `at least ${Math.round(frontierWpm)} WPM` : Number.isFinite(frontierWpm) ? `${Math.round(frontierWpm)} WPM` : null,
    },
    evidenceBoundary: { ...PRACTICE_PACE_LADDER_EVIDENCE_BOUNDARY },
    guidance: [
      "The reference segment anchors the controlled pace rungs when no sufficiently fresh PL14 frontier is available.",
      "The 70% reference floor is a measurement-validity rule, not a recommended typing accuracy target.",
      "The Pace Ladder contributes PL14 frontier evidence; it does not create a PL13 ability observation or PL16 learning dose.",
    ],
  };
  return freezeDeep({ trainingQuality: artifact, recommendationIds: [] });
}
