import {
  analyzePracticeLatency,
  PRACTICE_LATENCY_POLICY_V1,
} from "./practiceLatencyClassifier.js";

export const PRACTICE_FOUNDATION_ANALYSIS_VERSION = 1;

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function buildPracticeFoundationAnalysis({
  events = [],
  traceMetadata = {},
  latencyPolicy = PRACTICE_LATENCY_POLICY_V1,
} = {}) {
  return freezeDeep({
    version: PRACTICE_FOUNDATION_ANALYSIS_VERSION,
    latency: analyzePracticeLatency({ events, traceMetadata, policy: latencyPolicy }),
  });
}
