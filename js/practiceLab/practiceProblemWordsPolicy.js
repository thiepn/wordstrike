import {
  PRACTICE_PROBLEM_WORDS_MAX_GRAPHEMES,
  PRACTICE_PROBLEM_WORDS_MIN_GRAPHEMES,
  PRACTICE_PROBLEM_WORDS_POLICY_VERSION,
} from "./practiceProblemWordsConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export const PRACTICE_PROBLEM_WORDS_POLICY_V1 = freezeDeep({
  version: PRACTICE_PROBLEM_WORDS_POLICY_VERSION,
  language: "en",
  target: {
    minimumGraphemes: PRACTICE_PROBLEM_WORDS_MIN_GRAPHEMES,
    maximumGraphemes: PRACTICE_PROBLEM_WORDS_MAX_GRAPHEMES,
    lowercaseAlphabeticOnly: true,
  },
  content: {
    maxTargetCandidates: 256,
    maxNeutralCandidates: 128,
    naturalTargetUnitOpportunityCap: 1,
    focusGeneratedUnitOpportunityCap: 2,
    focusMinimumNeutralWordsBetweenTargets: 2,
    generatedProbeMinimumNeutralWordsBetweenTargets: 3,
    naturalProbeMinimumNeutralWordsBetweenTargets: 5,
    naturalProbeFirstTargetBufferWords: 3,
    naturalProbeLastTargetBufferWords: 2,
    preferredFocusDistractorVariety: 8,
    preferredContextFamilyCount: 3,
    minimumContextFamilyCount: 2,
    preferredLaunchContextCount: 4,
    minimumLaunchContextCount: 2,
    preferredMixNeutralWordCount: 12,
    neutralTargetBearingRatio: 1,
    focusTypabilityPercentile: [20, 65],
    contextTypabilityPercentile: [20, 80],
    mixTypabilityPercentile: [20, 80],
  },
  probes: {
    typabilityDifferenceMaximum: 0.35,
    featureRmsMaximum: 0.75,
    launchContextTvdMaximum: 0.35,
    requireFamilyDisjoint: true,
    requireContentDisjoint: true,
  },
  recommendations: {
    maximum: 8,
    maximumExplanatoryEntities: 2,
  },
});

export function validatePracticeProblemWordsPolicy(policy = PRACTICE_PROBLEM_WORDS_POLICY_V1) {
  if (!policy || policy.version !== PRACTICE_PROBLEM_WORDS_POLICY_VERSION) return false;
  if (policy.language !== "en") return false;
  if (policy.target.minimumGraphemes !== 2 || policy.target.maximumGraphemes !== 24) return false;
  if (policy.content.maxTargetCandidates !== 256 || policy.content.maxNeutralCandidates !== 128) return false;
  if (policy.probes.typabilityDifferenceMaximum !== 0.35 || policy.probes.featureRmsMaximum !== 0.75 || policy.probes.launchContextTvdMaximum !== 0.35) return false;
  if (policy.recommendations.maximum !== 8 || policy.recommendations.maximumExplanatoryEntities !== 2) return false;
  return true;
}
