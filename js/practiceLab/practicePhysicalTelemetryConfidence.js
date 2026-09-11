import { PRACTICE_PHYSICAL_CONFIDENCE_THRESHOLDS } from "./practicePhysicalTelemetryConstants.js";

function observationCount(entityType, record) {
  const observation = record?.observation ?? record ?? {};
  if (entityType === "physical-key") return Number(observation.activationCount) || 0;
  if (entityType === "physical-transition") return Number(observation.timingEligibleCount) || 0;
  if (entityType === "modifier-route") return Number(observation.opportunityCount) || 0;
  return 0;
}

export function calculatePracticePhysicalTelemetryConfidence(record) {
  const entityType = record?.entityType;
  const thresholds = PRACTICE_PHYSICAL_CONFIDENCE_THRESHOLDS[entityType];
  if (!thresholds) return "none";
  const observations = observationCount(entityType, record);
  const sessions = Number(record?.observation?.distinctSessionCount ?? record?.distinctSessionCount) || 0;
  if (observations >= thresholds.high.observations && sessions >= thresholds.high.sessions) return "high";
  if (observations >= thresholds.medium.observations && sessions >= thresholds.medium.sessions) return "medium";
  if (observations >= thresholds.low.observations && sessions >= thresholds.low.sessions) return "low";
  return "none";
}
