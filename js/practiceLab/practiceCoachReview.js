import {
  PRACTICE_COACH_REVIEW_EXPERIMENT_ID,
  PRACTICE_COACH_REVIEW_EXPERIMENT_VERSION,
  PRACTICE_COACH_REVIEW_GENERATOR_VERSION,
} from "./practiceCoachConstants.js";
import { createPracticeCoachReviewContentHash } from "./practiceCoachReviewGenerator.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function createPracticeCoachReviewDescriptor() {
  return freezeDeep({
    id: PRACTICE_COACH_REVIEW_EXPERIMENT_ID,
    version: PRACTICE_COACH_REVIEW_EXPERIMENT_VERSION,
    title: "Review",
    category: "internal-retention",
    sessionSchemaVersion: 1,
    defaultCorrectionBehavior: "allow",
    supportedCompletionModes: ["content"],
    resumable: false,
    retentionMeasurementKind: "entity-review",
    abilityChannel: null,
    performanceMeasurementKind: null,
    performanceReferenceChannel: null,
    evaluationMeasurementKind: null,
    internalCoachOnly: true,
    validateConfiguration(configuration) {
      return configuration == null || (typeof configuration === "object" && !Array.isArray(configuration));
    },
    validateContentPlan(plan) {
      return plan?.completion?.mode === "content"
        && plan?.metadata?.partition === "training"
        && plan?.metadata?.coachReview?.generatorVersion === PRACTICE_COACH_REVIEW_GENERATOR_VERSION
        && Array.isArray(plan?.targetEntities)
        && plan.targetEntities.length >= 1
        && plan.targetEntities.length <= 4;
    },
  });
}

export function verifyPracticeCoachReviewRebuild({ contentPlan, reviewPlan, expectedHash } = {}) {
  return Boolean(contentPlan && reviewPlan && expectedHash && createPracticeCoachReviewContentHash(contentPlan, reviewPlan) === expectedHash);
}
