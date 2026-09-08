import {
  PRACTICE_REAL_TEXT_DEFAULT_DURATION_MS,
  PRACTICE_REAL_TEXT_DURATIONS_MS,
  PRACTICE_REAL_TEXT_POLICY_VERSION,
} from "./practiceRealTextConstants.js";

export const PRACTICE_REAL_TEXT_POLICY_V1 = Object.freeze({
  version: PRACTICE_REAL_TEXT_POLICY_VERSION,
  language: "en",
  durationsMs: PRACTICE_REAL_TEXT_DURATIONS_MS,
  defaultDurationMs: PRACTICE_REAL_TEXT_DEFAULT_DURATION_MS,
  capacity: Object.freeze({ wordsPerMinute: 400, graphemesPerWord: 5, bufferMultiplier: 1.10 }),
  pool: Object.freeze({
    targetUnitCount: 32,
    minimumReadyUnitCount: 16,
    minimumUnitGraphemes: 1500,
    maximumUnitGraphemes: 5000,
    minimumUnitWords: 100,
    minimumTypabilityWeight: 0.90,
    minimumDifficultyPercentile: 10,
    maximumDifficultyPercentile: 90,
    preferredDifficultyPercentileMin: 20,
    preferredDifficultyPercentileMax: 80,
    maximumDigitRatio: 0.03,
    maximumSymbolRatio: 0.02,
    eligibleContentTypes: Object.freeze(["sentence", "passage"]),
  }),
  session: Object.freeze({
    correctionBehavior: "allow",
    timingMode: "on-first-input",
    completionMode: "duration",
    resumable: false,
    pauseAllowed: false,
    appendAllowed: false,
    showLiveWpm: false,
    showLiveAccuracy: false,
    showRhythmFeedback: false,
    metronomeSoundEnabled: false,
    targetHints: false,
  }),
});

export function getPracticeRealTextRequiredGraphemes(durationMs, policy = PRACTICE_REAL_TEXT_POLICY_V1) {
  if (!policy.durationsMs.includes(durationMs)) return null;

  // Convert the engineering buffer to an exact bounded integer ratio before
  // applying ceil. This avoids floating-point representations such as
  // 6600.000000000001 producing a spurious extra grapheme for the canonical
  // 3 / 5 / 10 minute v1 durations.
  const bufferPerMille = Math.round(policy.capacity.bufferMultiplier * 1000);
  const numerator = durationMs
    * policy.capacity.wordsPerMinute
    * policy.capacity.graphemesPerWord
    * bufferPerMille;
  const denominator = 60_000 * 1000;
  return Math.ceil(numerator / denominator);
}
