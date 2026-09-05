import { withPracticeLearningAnalysis } from "./practiceFoundationAnalysis.js";
import { buildPracticeLearningAnalysis } from "./practiceLearningObservation.js";
import { PRACTICE_LEARNING_POLICY_V1 } from "./practiceLearningPolicy.js";
import { getPracticeTrustedRetentionPurpose } from "./practiceSessionPurposeRegistry.js";

export async function attachPracticeLearningAnalysis({
  foundationAnalysis,
  repository,
  contentPlan,
  profileId,
  contextId,
  experimentId,
  evidenceRole,
  phaseContinuityComplete = true,
  retentionMeasurementKind = null,
  segmenter = null,
  policy = PRACTICE_LEARNING_POLICY_V1,
} = {}) {
  const trustedRetentionKind = retentionMeasurementKind ?? getPracticeTrustedRetentionPurpose(contentPlan);
  let trackedLearningStatIds = null;
  if (evidenceRole === "transfer" && trustedRetentionKind == null) {
    if (typeof repository?.listLearningStateIds !== "function") throw new TypeError("Practice transfer learning analysis requires listLearningStateIds");
    trackedLearningStatIds = new Set(await repository.listLearningStateIds(profileId, contextId));
  }
  const learning = buildPracticeLearningAnalysis({
    foundationAnalysis,
    contentPlan,
    profileId,
    contextId,
    experimentId,
    evidenceRole,
    trackedLearningStatIds,
    phaseContinuityComplete,
    retentionMeasurementKind: trustedRetentionKind,
    segmenter,
    policy,
  });
  return withPracticeLearningAnalysis(foundationAnalysis, learning);
}
