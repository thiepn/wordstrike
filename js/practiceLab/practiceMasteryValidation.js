import {
  PRACTICE_AUTOMATICITY_STATUSES,
  PRACTICE_DERIVED_MASTERY_STAGES,
  PRACTICE_MASTERY_STAGE_RANK,
} from "./practiceMasteryConstants.js";
import { PRACTICE_MASTERY_POLICY_V1 } from "./practiceMasteryPolicy.js";

const CONFIDENCE_RANK = Object.freeze({ none: 0, low: 1, medium: 2, high: 3 });

function assertBounded(value, name) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new TypeError(`${name} must be within 0..100`);
  }
}

function atLeastConfidence(level, required) {
  return (CONFIDENCE_RANK[level] ?? -1) >= (CONFIDENCE_RANK[required] ?? -1);
}

function expectedAutomaticityStatus(score, policy) {
  if (score >= policy.automaticity.statusThresholds.strong) return "strong";
  if (score >= policy.automaticity.statusThresholds.established) return "established";
  if (score >= policy.automaticity.statusThresholds.emerging) return "emerging";
  return "developing";
}

export function validatePracticeAutomaticityResult(result, policy = PRACTICE_MASTERY_POLICY_V1) {
  if (!result || typeof result !== "object") throw new TypeError("Practice automaticity result is required");
  if (!PRACTICE_AUTOMATICITY_STATUSES.includes(result.status)) {
    throw new TypeError("Practice automaticity status is invalid");
  }
  assertBounded(result.confidenceScore, "Practice automaticity confidenceScore");
  if (result.score == null) {
    if (result.status !== "unmeasured") throw new TypeError("Unscored automaticity must be unmeasured");
    return result;
  }
  assertBounded(result.score, "Practice automaticity score");
  if (result.coreScore != null) assertBounded(result.coreScore, "Practice automaticity coreScore");
  if (result.status !== expectedAutomaticityStatus(result.score, policy)) {
    throw new TypeError("Practice automaticity status is inconsistent with score thresholds");
  }
  if (result.score > result.confidenceScore + 1e-9) {
    throw new TypeError("Practice automaticity score cannot exceed evidence confidence");
  }
  return result;
}

export function validatePracticeEntityMasteryResult(result, policy = PRACTICE_MASTERY_POLICY_V1) {
  if (!result || typeof result !== "object") throw new TypeError("Practice entity mastery result is required");
  if (!PRACTICE_DERIVED_MASTERY_STAGES.includes(result.stage)) {
    throw new TypeError("Practice mastery stage is invalid");
  }
  assertBounded(result.masteryScore, "Practice masteryScore");
  assertBounded(result.acquisitionScore, "Practice acquisitionScore");
  assertBounded(result.availableWeight, "Practice availableWeight");
  validatePracticeAutomaticityResult(result.automaticity, policy);

  const stageRank = PRACTICE_MASTERY_STAGE_RANK[result.stage];
  if (stageRank >= PRACTICE_MASTERY_STAGE_RANK.transferred) {
    if (!Number.isFinite(result.transfer?.score)
      || result.transfer.score < policy.transfer.minimumScore
      || result.transfer.minimumEvidenceMet !== true
      || !atLeastConfidence(result.transfer.confidenceLevel, "medium")
      || result.transfer.gapEligible !== true) {
      throw new TypeError("Transferred-or-higher mastery requires valid protected transfer evidence");
    }
  }
  if (stageRank >= PRACTICE_MASTERY_STAGE_RANK.robust
      && stageRank < PRACTICE_MASTERY_STAGE_RANK.transferred) {
    throw new TypeError("Robust mastery requires the Transferred prerequisite");
  }
  if (result.stage === "retained") {
    if (result.retention?.status !== "verified"
      || result.retention?.eligibleForRetained !== true
      || !Number.isFinite(result.retention?.score)
      || result.retention.score < policy.gates.retained.score
      || !atLeastConfidence(result.retention.confidenceLevel, policy.gates.retained.minimumConfidenceLevel)) {
      throw new TypeError("Retained mastery requires eligible delayed retention verification");
    }
  }
  return result;
}
