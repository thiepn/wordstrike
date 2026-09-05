import { withPracticeLearningAnalysis } from "./practiceFoundationAnalysis.js";
import { buildPracticeLearningAnalysis } from "./practiceLearningObservation.js";
import { PRACTICE_LEARNING_POLICY_V1 } from "./practiceLearningPolicy.js";

export async function attachPracticeLearningAnalysis({
  foundationAnalysis,
  repository,
  contentPlan,
  profileId,
  contextId,
  experimentId,
  evidenceRole,
  phaseContinuityComplete = true,
  segmenter = null,
  policy = PRACTICE_LEARNING_POLICY_V1,
} = {}) {
  let trackedLearningStatIds = null;
  if (evidenceRole === "transfer") {
    if (typeof repository?.listLearningStateIds !== "function") {
      throw new TypeError("Practice transfer learning analysis requires listLearningStateIds");
    }
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
    segmenter,
    policy,
  });
  return withPracticeLearningAnalysis(foundationAnalysis, learning);
}
