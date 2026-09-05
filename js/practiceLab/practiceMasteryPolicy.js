import {
  PRACTICE_AUTOMATICITY_MODEL_VERSION,
  PRACTICE_CONTEXT_ROBUSTNESS_VERSION,
  PRACTICE_MASTERY_HIERARCHY_VERSION,
  PRACTICE_MASTERY_MODEL_VERSION,
  PRACTICE_MASTERY_POLICY_VERSION,
  PRACTICE_TRANSFER_MODEL_VERSION,
} from "./practiceMasteryConstants.js";

export const PRACTICE_MASTERY_POLICY_V1 = Object.freeze({
  version: PRACTICE_MASTERY_POLICY_VERSION,
  modelVersion: PRACTICE_MASTERY_MODEL_VERSION,
  automaticityVersion: PRACTICE_AUTOMATICITY_MODEL_VERSION,
  robustnessVersion: PRACTICE_CONTEXT_ROBUSTNESS_VERSION,
  transferVersion: PRACTICE_TRANSFER_MODEL_VERSION,
  hierarchyVersion: PRACTICE_MASTERY_HIERARCHY_VERSION,

  dimensionStrongThreshold: 70,

  absoluteAccuracy: Object.freeze({
    key: Object.freeze({ perfectAtOrBelow: 0.015, zeroAtOrAbove: 0.08 }),
    bigram: Object.freeze({ perfectAtOrBelow: 0.02, zeroAtOrAbove: 0.10 }),
    trigram: Object.freeze({ perfectAtOrBelow: 0.03, zeroAtOrAbove: 0.12 }),
    word: Object.freeze({ perfectAtOrBelow: 0.05, zeroAtOrAbove: 0.20 }),
  }),
  absoluteOnlyAccuracyConfidenceCap: 65,

  roleQuality: Object.freeze({
    minimumOpportunities: Object.freeze({ key: 20, bigram: 12, trigram: 8, word: 3 }),
    minimumSessions: 1,
    weights: Object.freeze({ accuracy: 0.45, speed: 0.40, disfluency: 0.15 }),
    minimumAvailableWeight: 0.60,
    speed: Object.freeze({ perfectAtOrBelow: 0.03, zeroAtOrAbove: 0.30 }),
    disfluency: Object.freeze({ perfectAtOrBelow: 0.05, zeroAtOrAbove: 0.20 }),
  }),

  contextRobustness: Object.freeze({
    breadthScale: 12,
    eligibleRoles: Object.freeze(["training", "diagnostic", "transfer", "benchmark"]),
    roleCoverage: Object.freeze({ 0: 0, 1: 40, 2: 70, 3: 90, 4: 100 }),
    multiRoleWeights: Object.freeze({ breadth: 0.55, coverage: 0.20, consistency: 0.25 }),
    singleRoleWeights: Object.freeze({ breadth: 0.75, coverage: 0.25 }),
    singleRoleCap: 70,
  }),

  automaticity: Object.freeze({
    weights: Object.freeze({ speed: 0.30, accuracy: 0.30, stability: 0.20, contextRobustness: 0.20 }),
    statusThresholds: Object.freeze({ emerging: 55, established: 75, strong: 90 }),
    accuracyHardFloor: 40,
    speedHardFloor: 35,
    hardCap: 50,
  }),

  masteryWeights: Object.freeze({
    accuracy: 25,
    speed: 20,
    stability: 15,
    contextRobustness: 15,
    transfer: 15,
    retention: 10,
  }),
  coreMasteryWeight: 75,

  transfer: Object.freeze({
    minimumOpportunities: Object.freeze({ key: 30, bigram: 20, trigram: 12, word: 5 }),
    opportunityScales: Object.freeze({ key: 30, bigram: 20, trigram: 12, word: 5 }),
    minimumSessions: 2,
    sessionScale: 2,
    confidenceWeights: Object.freeze({ opportunities: 0.65, sessions: 0.35 }),
    minimumScore: 70,
    maximumTrainingGap: 20,
  }),

  limiterGuard: Object.freeze({
    severityThreshold: 50,
    criticalDimensions: Object.freeze(["slow", "hesitant", "inaccurate", "recovery-heavy", "unstable"]),
    wordExtraCriticalDimensions: Object.freeze(["launch-limited"]),
  }),

  gates: Object.freeze({
    acquired: Object.freeze({
      acquisitionScore: 75,
      automaticityScore: 70,
      minimumGeneralConfidenceLevel: "medium",
      accuracy: 70,
      speed: 60,
      stability: 55,
      contextRobustness: 50,
    }),
    robust: Object.freeze({
      automaticityScore: 80,
      acquisitionScore: 80,
      contextRobustness: 75,
      stability: 75,
      minimumGeneralConfidenceLevel: "high",
      minimumEligibleRoles: 2,
    }),
    retained: Object.freeze({
      score: 70,
      minimumConfidenceLevel: "medium",
    }),
  }),

  anchor: Object.freeze({
    minimumAutomaticityScore: 80,
    minimumGeneralConfidenceLevel: "high",
  }),

  hierarchy: Object.freeze({
    minimumAutomaticityScore: 75,
    minimumGeneralConfidenceLevel: "medium",
    maxBlockingEntities: 3,
    strongPartialExplanationRatio: 0.50,
  }),

  snapshot: Object.freeze({
    maxEntities: 512,
    readyCoreCoverage: 0.75,
  }),
});

export function validatePracticeMasteryPolicy(policy = PRACTICE_MASTERY_POLICY_V1) {
  if (!policy || policy.version !== PRACTICE_MASTERY_POLICY_VERSION) {
    throw new TypeError("Unsupported Practice mastery policy version");
  }
  const masteryTotal = Object.values(policy.masteryWeights || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  if (masteryTotal !== 100) throw new TypeError("Practice mastery weights must sum to 100");
  const automaticityTotal = Object.values(policy.automaticity?.weights || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  if (Math.abs(automaticityTotal - 1) > 1e-12) throw new TypeError("Practice automaticity weights must sum to one");
  const roleTotal = Object.values(policy.roleQuality?.weights || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  if (Math.abs(roleTotal - 1) > 1e-12) throw new TypeError("Practice role-quality weights must sum to one");
  if (policy.coreMasteryWeight !== 75) throw new TypeError("Practice acquisition core weight must remain 75 in v1");
  return policy;
}
