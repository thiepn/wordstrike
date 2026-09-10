import { createPracticeLatencyStreamingClassifier } from "./practiceLatencyClassifier.js";
import { practiceMedian } from "./practiceRobustStats.js";
import {
  PRACTICE_SPECIAL_DOMAIN_ACCUMULATOR_VERSION,
  PRACTICE_SPECIAL_DOMAIN_RUN_TIMING_SAMPLE_CAP,
  PRACTICE_SPECIAL_DOMAIN_TIMING_MINIMUM,
  PRACTICE_SPECIAL_DOMAIN_TIMING_SAMPLE_CAP,
} from "./practiceSpecialDomainConstants.js";

const INSERTIONS = new Set(["character", "space"]);
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const boundedPush = (values, value, cap) => {
  if (!Number.isFinite(value)) return;
  values.push(value);
  if (values.length > cap) values.splice(0, values.length - cap);
};
const accuracy = (correct, opportunities) => opportunities > 0 ? correct / opportunities : null;

function createCategoryState() {
  return {
    opportunityCount: 0,
    firstPassCorrectCount: 0,
    timingEligibleCount: 0,
    disfluentCount: 0,
    residualSamplesMs: [],
    primaryErrorEpisodeCount: 0,
  };
}
function finalizeCategory(state) {
  const meaningful = state.timingEligibleCount >= PRACTICE_SPECIAL_DOMAIN_TIMING_MINIMUM;
  return freezeDeep({
    opportunityCount: state.opportunityCount,
    firstPassCorrectCount: state.firstPassCorrectCount,
    firstPassAccuracy: accuracy(state.firstPassCorrectCount, state.opportunityCount),
    timingEligibleCount: state.timingEligibleCount,
    fluentResidualMedianMs: meaningful && state.residualSamplesMs.length >= PRACTICE_SPECIAL_DOMAIN_TIMING_MINIMUM
      ? practiceMedian(state.residualSamplesMs)
      : null,
    disfluencyRate: meaningful ? state.disfluentCount / state.timingEligibleCount : null,
    primaryErrorEpisodeCount: state.primaryErrorEpisodeCount,
  });
}

export function createPracticeSpecialDomainAccumulator({ annotations, primaryCategories = [] } = {}) {
  if (!annotations || !Array.isArray(annotations.primary) || !Array.isArray(primaryCategories) || !primaryCategories.length) throw new TypeError("PL30 accumulator requires static annotations and categories");
  const categories = Object.fromEntries(primaryCategories.map((category) => [category, createCategoryState()]));
  const primaryAt = new Map();
  for (const item of annotations.primary) {
    if (!categories[item.category]) throw new TypeError(`Unknown PL30 primary category: ${item.category}`);
    primaryAt.set(item.expectedIndex, item.category);
  }
  const sentenceCapitalAt = new Set((annotations.derived?.["sentence-capital"] ?? []).map((item) => item.startIndex));
  const boundaryAt = new Set((annotations.derived?.["post-punctuation-boundary"] ?? []).map((item) => item.startIndex));
  const runs = (annotations.derived?.["digit-run"] ?? []).map((item, index) => ({ ...item, id: index, seen: 0, incorrect: false, complete: false }));
  const mixedTokens = (annotations.derived?.["mixed-practical-token"] ?? []).map((item, index) => ({ ...item, id: index, seen: 0, incorrect: false, complete: false }));
  const runAt = new Map();
  const mixedAt = new Map();
  for (const run of runs) for (let position = run.startIndex; position < run.endIndex; position += 1) runAt.set(position, run.id);
  for (const token of mixedTokens) for (let position = token.startIndex; position < token.endIndex; position += 1) mixedAt.set(position, token.id);

  const sentenceCapital = { opportunityCount: 0, firstPassCorrectCount: 0 };
  const boundary = { opportunityCount: 0, firstPassCorrectCount: 0 };
  const overall = { opportunityCount: 0, firstPassCorrectCount: 0 };
  const contentErrorClasses = { capitalization: 0, punctuation: 0, numeric: 0, symbol: 0 };
  const latency = createPracticeLatencyStreamingClassifier();
  const runResidualSamples = [];
  let runTimingEligibleCount = 0;
  let runDisfluentCount = 0;
  let finalized = false;

  function markWholeItem(item, event) {
    if (!item || event.isFirstAttempt !== true || item.complete) return;
    item.seen += 1;
    if (event.correctness !== "correct") item.incorrect = true;
    if (item.seen >= item.endIndex - item.startIndex) item.complete = true;
  }

  const api = {
    recordProcessedInput(event) {
      if (finalized || !event) return false;
      const classification = latency.record(event);
      if (!INSERTIONS.has(event.type)) return classification != null;
      if (event.isFirstAttempt === true) {
        overall.opportunityCount += 1;
        if (event.correctness === "correct") overall.firstPassCorrectCount += 1;

        const category = primaryAt.get(event.textPosition);
        if (category) {
          const state = categories[category];
          state.opportunityCount += 1;
          if (event.correctness === "correct") state.firstPassCorrectCount += 1;
          if (classification && ["fluent", "disfluent"].includes(classification.classification)) {
            state.timingEligibleCount += 1;
            if (classification.classification === "disfluent") state.disfluentCount += 1;
            const normalizedResidual = Number.isFinite(event.contextNormalizedResidualMs)
              ? event.contextNormalizedResidualMs
              : Number.isFinite(event.normalizedResidualMs) ? event.normalizedResidualMs : null;
            if (classification.classification === "fluent" && Number.isFinite(normalizedResidual)) boundedPush(state.residualSamplesMs, normalizedResidual, PRACTICE_SPECIAL_DOMAIN_TIMING_SAMPLE_CAP);
          }
        }

        if (sentenceCapitalAt.has(event.textPosition)) {
          sentenceCapital.opportunityCount += 1;
          if (event.correctness === "correct") sentenceCapital.firstPassCorrectCount += 1;
        }
        if (boundaryAt.has(event.textPosition)) {
          boundary.opportunityCount += 1;
          if (event.correctness === "correct") boundary.firstPassCorrectCount += 1;
        }

        const runId = runAt.get(event.textPosition);
        const run = runId == null ? null : runs[runId];
        markWholeItem(run, event);
        if (run && event.textPosition > run.startIndex && classification && ["fluent", "disfluent"].includes(classification.classification)) {
          runTimingEligibleCount += 1;
          if (classification.classification === "disfluent") runDisfluentCount += 1;
          const residual = Number.isFinite(event.contextNormalizedResidualMs)
            ? event.contextNormalizedResidualMs
            : Number.isFinite(event.normalizedResidualMs) ? event.normalizedResidualMs : null;
          if (classification.classification === "fluent" && Number.isFinite(residual)) boundedPush(runResidualSamples, residual, PRACTICE_SPECIAL_DOMAIN_RUN_TIMING_SAMPLE_CAP);
        }

        const mixedId = mixedAt.get(event.textPosition);
        markWholeItem(mixedId == null ? null : mixedTokens[mixedId], event);
      }
      return true;
    },

    recordClosedErrorEpisode(value) {
      if (finalized) return false;
      const episode = value?.episode ?? value;
      if (!episode || !Number.isInteger(episode.primaryPosition ?? episode.startPosition)) return false;
      const position = episode.primaryPosition ?? episode.startPosition;
      const category = primaryAt.get(position);
      if (category) categories[category].primaryErrorEpisodeCount += 1;
      if (Object.hasOwn(contentErrorClasses, episode.contentClass)) contentErrorClasses[episode.contentClass] += 1;
      return Boolean(category) || Object.hasOwn(contentErrorClasses, episode.contentClass);
    },

    getSnapshot() {
      const categoryResults = Object.fromEntries(primaryCategories.map((category) => [category, finalizeCategory(categories[category])]));
      const domainOpportunityCount = primaryCategories.reduce((sum, category) => sum + categories[category].opportunityCount, 0);
      const domainCorrectCount = primaryCategories.reduce((sum, category) => sum + categories[category].firstPassCorrectCount, 0);
      const completedRuns = runs.filter((item) => item.complete);
      const completedMixed = mixedTokens.filter((item) => item.complete);
      const stableRunTiming = runTimingEligibleCount >= PRACTICE_SPECIAL_DOMAIN_TIMING_MINIMUM;
      return freezeDeep({
        version: PRACTICE_SPECIAL_DOMAIN_ACCUMULATOR_VERSION,
        domain: annotations.primary?.[0]?.domain ?? null,
        categories: categoryResults,
        domainOpportunityCount,
        domainFirstPassCorrectCount: domainCorrectCount,
        domainFirstPassAccuracy: accuracy(domainCorrectCount, domainOpportunityCount),
        overallFirstPassOpportunityCount: overall.opportunityCount,
        overallFirstPassCorrectCount: overall.firstPassCorrectCount,
        overallFirstPassAccuracy: accuracy(overall.firstPassCorrectCount, overall.opportunityCount),
        sentenceCapital: {
          opportunityCount: sentenceCapital.opportunityCount,
          firstPassCorrectCount: sentenceCapital.firstPassCorrectCount,
          firstPassAccuracy: accuracy(sentenceCapital.firstPassCorrectCount, sentenceCapital.opportunityCount),
        },
        postPunctuationBoundary: {
          opportunityCount: boundary.opportunityCount,
          firstPassCorrectCount: boundary.firstPassCorrectCount,
          firstPassAccuracy: accuracy(boundary.firstPassCorrectCount, boundary.opportunityCount),
        },
        digitRuns: {
          runCount: completedRuns.length,
          wholeRunFirstPassCorrectCount: completedRuns.filter((item) => !item.incorrect).length,
          wholeRunFirstPassAccuracy: accuracy(completedRuns.filter((item) => !item.incorrect).length, completedRuns.length),
          meanLength: completedRuns.length ? completedRuns.reduce((sum, item) => sum + (item.endIndex - item.startIndex), 0) / completedRuns.length : null,
          internalTimingEligibleCount: runTimingEligibleCount,
          internalResidualMedianMs: stableRunTiming && runResidualSamples.length >= PRACTICE_SPECIAL_DOMAIN_TIMING_MINIMUM ? practiceMedian(runResidualSamples) : null,
          internalDisfluencyRate: stableRunTiming ? runDisfluentCount / runTimingEligibleCount : null,
        },
        mixedPracticalTokens: {
          tokenCount: completedMixed.length,
          wholeTokenFirstPassCorrectCount: completedMixed.filter((item) => !item.incorrect).length,
          wholeTokenFirstPassAccuracy: accuracy(completedMixed.filter((item) => !item.incorrect).length, completedMixed.length),
        },
        domainErrorEpisodeCount: primaryCategories.reduce((sum, category) => sum + categories[category].primaryErrorEpisodeCount, 0),
        contentErrorClasses,
        latency: latency.getSnapshot(),
      });
    },
    finalize() { finalized = true; return api.getSnapshot(); },
  };
  return Object.freeze(api);
}
