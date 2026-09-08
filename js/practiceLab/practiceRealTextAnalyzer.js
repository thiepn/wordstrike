import { PRACTICE_REAL_TEXT_RESULT_VERSION } from "./practiceRealTextConstants.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const rate1000 = (count, denominator) => Number.isFinite(count) && Number.isFinite(denominator) && denominator > 0 ? (count / denominator) * 1000 : null;
const insertion = (event) => event?.type === "character" || event?.type === "space";
const correct = (event) => event?.correctness === "correct" || event?.correctness === true;

export function analyzePracticeRealTextResult({ metricsSnapshot = {}, eventTrace = [], foundationAnalysis = null } = {}) {
  const firstAttempts = eventTrace.filter((event) => insertion(event) && event.isFirstAttempt === true);
  const firstPassCorrect = firstAttempts.filter(correct).length;
  const firstPassAccuracy = firstAttempts.length ? (firstPassCorrect / firstAttempts.length) * 100 : null;
  const classified = foundationAnalysis?.latency?.classifiedTransitions ?? [];
  const eligibleTiming = classified.filter((entry) => ["fluent", "disfluent"].includes(entry.classification));
  const disfluent = eligibleTiming.filter((entry) => entry.classification === "disfluent").length;
  const disfluencyRate = eligibleTiming.length ? disfluent / eligibleTiming.length : null;
  const accepted = Number(metricsSnapshot.acceptedInsertions ?? 0);
  const errorSummary = foundationAnalysis?.errors?.sessionSummary ?? null;
  const difficulty = foundationAnalysis?.normalization?.textDifficulty ?? foundationAnalysis?.normalization?.sessionSummary?.textDifficulty ?? null;
  const afterMetrics = freezeDeep({
    resultVersion: PRACTICE_REAL_TEXT_RESULT_VERSION,
    durationMs: Number(metricsSnapshot.activeDurationMs ?? 0),
    typedCharacters: accepted,
    wpm: Number.isFinite(metricsSnapshot.wpm) ? metricsSnapshot.wpm : null,
    rawWpm: Number.isFinite(metricsSnapshot.rawWpm) ? metricsSnapshot.rawWpm : null,
    acceptedInsertionAccuracy: accepted > 0 && Number.isFinite(metricsSnapshot.accuracy) ? metricsSnapshot.accuracy : null,
    firstPassAccuracy,
    firstPassOpportunityCount: firstAttempts.length,
    disfluencyRate,
    disfluencyOpportunityCount: eligibleTiming.length,
    correctionInputsPer1000Accepted: rate1000(metricsSnapshot.correctionInputs, accepted),
    correctedCharactersPer1000Accepted: rate1000(metricsSnapshot.correctedIncorrectCharacters, accepted),
    errorEpisodesPer1000Accepted: errorSummary?.episodesPer1000Insertions ?? null,
    difficultyIndex: difficulty?.difficultyIndex ?? foundationAnalysis?.normalization?.sessionSummary?.difficultyIndex ?? null,
    difficultyCoverage: difficulty?.availableModelWeight ?? foundationAnalysis?.normalization?.sessionSummary?.difficultyCoverage ?? null,
  });
  return freezeDeep({
    resultVersion: PRACTICE_REAL_TEXT_RESULT_VERSION,
    beforeMetrics: null,
    afterMetrics,
    transferMetrics: null,
    recommendationIds: [],
    trainingQuality: {
      kind: "real-text-broad-training",
      directTargetCount: 0,
      acquisitionDoseUnits: 0,
      firstPassAccuracy,
      disfluencyRate,
    },
    reviewItemChanges: [],
    interpretation: {
      scope: "broad-training",
      wording: "This is broad training evidence from ordinary text. It is not a protected transfer measurement.",
      doesNotEstablish: ["ability", "transfer", "retention", "causal-improvement"],
    },
  });
}
