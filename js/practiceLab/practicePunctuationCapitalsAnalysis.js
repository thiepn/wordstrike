import { PRACTICE_PUNCTUATION_CAPITALS_RESULT_VERSION } from "./practicePunctuationCapitalsConstants.js";

export function analyzePracticePunctuationCapitals({ accumulatorSnapshot, flow = "practice", sessionSnapshot = null } = {}) {
  if (!accumulatorSnapshot) return null;
  return Object.freeze({
    resultVersion: PRACTICE_PUNCTUATION_CAPITALS_RESULT_VERSION,
    flow,
    wpm: sessionSnapshot?.metrics?.wpm ?? null,
    domainFirstPassAccuracy: accumulatorSnapshot.domainFirstPassAccuracy,
    overallFirstPassAccuracy: accumulatorSnapshot.overallFirstPassAccuracy,
    categories: accumulatorSnapshot.categories,
    sentenceCapital: accumulatorSnapshot.sentenceCapital,
    postPunctuationBoundary: accumulatorSnapshot.postPunctuationBoundary,
    domainErrorEpisodeCount: accumulatorSnapshot.domainErrorEpisodeCount,
    contentErrorClasses: accumulatorSnapshot.contentErrorClasses,
    abilityMeasurementStatus: flow === "check" ? "protocol-gated" : "not-requested",
  });
}
