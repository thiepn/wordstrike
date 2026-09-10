import { PRACTICE_COMMON_WORD_BANDS, PRACTICE_COMMON_WORD_RESULT_VERSION } from "./practiceCommonWordsConstants.js";
import { buildPracticeCommonWordBandMetrics } from "./practiceCommonWordBandAccumulator.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const finite = Number.isFinite;
const sessionMetrics = (input) => ({
  wpm: input?.metricsSnapshot?.wpm ?? input?.sessionSnapshot?.wpm ?? input?.session?.wpm ?? input?.summary?.wpm ?? null,
  rawWpm: input?.metricsSnapshot?.rawWpm ?? input?.sessionSnapshot?.rawWpm ?? input?.session?.rawWpm ?? input?.summary?.rawWpm ?? null,
  accuracy: input?.metricsSnapshot?.accuracy ?? input?.sessionSnapshot?.accuracy ?? input?.session?.accuracy ?? input?.summary?.accuracy ?? null,
});

export function analyzePracticeCommonWordsPracticeResult(input = {}) {
  const plan = input.contentPlan?.metadata?.commonWords;
  if (plan?.flow !== "practice") throw new TypeError("Common Words practice analysis requires practice content");
  const bandMetrics = buildPracticeCommonWordBandMetrics(input);
  const wordsCompleted = PRACTICE_COMMON_WORD_BANDS.reduce((sum, band) => sum + bandMetrics[band].wordOpportunityCount, 0);
  const firstPassCorrect = PRACTICE_COMMON_WORD_BANDS.reduce((sum, band) => sum + bandMetrics[band].wholeWordFirstPassCorrectCount, 0);
  const preSession = input.commonWordsPlan?.preSessionExposure ?? input.preSessionExposure ?? {};
  const encountered = (input.contentPlan?.units ?? []).filter((unit) => unit.type === "word").map((unit) => unit.metadata?.commonWords?.lexicalKey).filter(Boolean);
  const previouslyUnobservedCount = encountered.filter((key) => Number(preSession[key]?.opportunities ?? 0) === 0).length;
  const lowExposureCount = encountered.filter((key) => Number(preSession[key]?.opportunities ?? 0) > 0 && Number(preSession[key]?.opportunities ?? 0) < 3).length;
  const metrics = sessionMetrics(input);
  return freezeDeep({
    analysisVersion: 1,
    resultVersion: PRACTICE_COMMON_WORD_RESULT_VERSION,
    beforeMetrics: null,
    afterMetrics: {
      wordsCompleted,
      wpm: finite(metrics.wpm) ? metrics.wpm : null,
      firstPassWordAccuracy: wordsCompleted ? firstPassCorrect / wordsCompleted : null,
      bandCounts: Object.fromEntries(PRACTICE_COMMON_WORD_BANDS.map((band) => [band, bandMetrics[band].wordOpportunityCount])),
      previouslyUnobservedCount,
      lowExposureCount,
    },
    transferMetrics: null,
    bandMetrics,
    recommendationIds: [],
    trainingQuality: {
      kind: "common-words-practice",
      resultVersion: PRACTICE_COMMON_WORD_RESULT_VERSION,
      wordsCompleted,
      directAcquisitionDose: 0,
      abilityObservationCount: 0,
      wording: "Coverage-oriented common-word practice; not a vocabulary test and not a standardized ability measurement.",
    },
    reviewItemChanges: [],
  });
}

export function analyzePracticeCommonWordCheckResult(input = {}) {
  const plan = input.contentPlan?.metadata?.commonWords;
  if (plan?.flow !== "check") throw new TypeError("Common-word Check analysis requires diagnostic Check content");
  const bandMetrics = buildPracticeCommonWordBandMetrics(input);
  const wordsCompleted = PRACTICE_COMMON_WORD_BANDS.reduce((sum, band) => sum + bandMetrics[band].wordOpportunityCount, 0);
  const metrics = sessionMetrics(input);
  const completed = wordsCompleted === 200;
  return freezeDeep({
    analysisVersion: 1,
    resultVersion: PRACTICE_COMMON_WORD_RESULT_VERSION,
    beforeMetrics: null,
    afterMetrics: {
      wordsCompleted,
      wpm: finite(metrics.wpm) ? metrics.wpm : null,
      accuracy: finite(metrics.accuracy) ? metrics.accuracy : null,
      bandMetrics,
      abilityMeasurementStatus: completed ? "protocol-complete" : "protocol-incomplete",
    },
    transferMetrics: null,
    bandMetrics,
    recommendationIds: [],
    trainingQuality: {
      kind: "common-words-check",
      resultVersion: PRACTICE_COMMON_WORD_RESULT_VERSION,
      wordsCompleted,
      abilityChannel: "common-words",
      expectedAbilityObservationCount: completed ? 1 : 0,
      wording: "Standardized common-word typing measurement; not natural-text ability, burst ability, endurance, or linguistic vocabulary knowledge.",
    },
    reviewItemChanges: [],
  });
}
