import { PRACTICE_NUMBERS_SYMBOLS_RESULT_VERSION } from "./practiceNumbersSymbolsConstants.js";

export function analyzePracticeNumbersSymbols({ accumulatorSnapshot, flow = "practice", sessionSnapshot = null } = {}) {
  if (!accumulatorSnapshot) return null;
  return Object.freeze({
    resultVersion: PRACTICE_NUMBERS_SYMBOLS_RESULT_VERSION,
    flow,
    wpm: sessionSnapshot?.metrics?.wpm ?? null,
    domainFirstPassAccuracy: accumulatorSnapshot.domainFirstPassAccuracy,
    overallFirstPassAccuracy: accumulatorSnapshot.overallFirstPassAccuracy,
    categories: accumulatorSnapshot.categories,
    digitRuns: accumulatorSnapshot.digitRuns,
    mixedPracticalTokens: accumulatorSnapshot.mixedPracticalTokens,
    domainErrorEpisodeCount: accumulatorSnapshot.domainErrorEpisodeCount,
    contentErrorClasses: accumulatorSnapshot.contentErrorClasses,
    abilityMeasurementStatus: flow === "check" ? "protocol-gated" : "not-requested",
  });
}
