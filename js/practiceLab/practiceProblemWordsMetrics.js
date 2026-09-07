import { practiceMedian } from "./practiceRobustStats.js";
import { buildPracticeSessionExecutionQuality } from "./practiceExecutionQuality.js";
import { PRACTICE_PROBLEM_WORDS_MIN_QUALITY_COVERAGE } from "./practiceProblemWordsConstants.js";

const INSERTION_TYPES = new Set(["character", "space"]);
const finite = Number.isFinite;
const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const correct = (event) => event?.correctness === "correct" || event?.correctness === true;

function firstAttemptsByPosition(eventTrace) {
  const result = new Map();
  for (const event of Array.isArray(eventTrace) ? eventTrace : []) {
    if (!INSERTION_TYPES.has(event?.type) || event?.isFirstAttempt !== true || !Number.isInteger(event?.textPosition)) continue;
    if (!result.has(event.textPosition)) result.set(event.textPosition, event);
  }
  return result;
}
function normalizedByPosition(foundationAnalysis) {
  const result = new Map();
  for (const transition of foundationAnalysis?.normalization?.normalizedTransitions ?? []) if (transition?.isFirstAttempt === true && Number.isInteger(transition?.textPosition) && !result.has(transition.textPosition)) result.set(transition.textPosition, transition);
  return result;
}
function timingProfile(positions, firstAttempts, normalized) {
  let eligibleCount = 0; let disfluentCount = 0; const residuals = []; const latencies = [];
  for (const position of positions) {
    const event = firstAttempts.get(position); const transition = normalized.get(position);
    if (!event || !transition || !["fluent", "disfluent"].includes(transition.latencyClass)) continue;
    eligibleCount += 1; if (transition.latencyClass === "disfluent") disfluentCount += 1;
    if (correct(event) && transition.latencyClass === "fluent") {
      if (finite(transition.residualLatencyMs)) residuals.push(transition.residualLatencyMs);
      if (finite(transition.observedLatencyMs)) latencies.push(transition.observedLatencyMs);
    }
  }
  return freezeDeep({ eligibleCount, fluentResidualMedianMs: residuals.length ? practiceMedian(residuals) : null, fluentResidualMeanMs: mean(residuals), fluentResidualCount: residuals.length, fluentLatencyMeanMs: mean(latencies), disfluencyRate: eligibleCount ? disfluentCount / eligibleCount : null, disfluentCount });
}

export function buildPracticeProblemWordsProbeMetrics({ eventTrace = [], foundationAnalysis = null, targetWordRanges = [], expectedEntityKey } = {}) {
  const ranges = (Array.isArray(targetWordRanges) ? targetWordRanges : []).filter((range) => Number.isInteger(range?.startIndex) && Number.isInteger(range?.endIndex) && range.endIndex > range.startIndex);
  const targetGraphemes = Array.from(String(expectedEntityKey ?? ""));
  const firstAttempts = firstAttemptsByPosition(eventTrace); const normalized = normalizedByPosition(foundationAnalysis);
  let observed = 0; let errorCount = 0; const launchPositions = []; const internalPositions = [];
  for (const range of ranges) {
    const length = range.endIndex - range.startIndex; if (length !== targetGraphemes.length) continue;
    let complete = true; let hadError = false;
    for (let offset = 0; offset < length; offset += 1) {
      const event = firstAttempts.get(range.startIndex + offset);
      if (!event || event.expected !== targetGraphemes[offset]) { complete = false; break; }
      if (!correct(event)) hadError = true;
    }
    if (!complete) continue;
    observed += 1; if (hadError) errorCount += 1;
    launchPositions.push(range.startIndex);
    for (let position = range.startIndex + 1; position < range.endIndex; position += 1) internalPositions.push(position);
  }
  const launch = timingProfile(launchPositions, firstAttempts, normalized);
  const internal = timingProfile(internalPositions, firstAttempts, normalized);
  const execution = buildPracticeSessionExecutionQuality({
    entityType: "word",
    opportunityCount: observed,
    errorCount,
    timingEligibleCount: internal.eligibleCount,
    disfluentCount: internal.disfluentCount,
    fluentLatencyMeanMs: internal.fluentLatencyMeanMs,
    fluentResidualMeanMs: internal.fluentResidualMeanMs,
    fluentResidualCount: internal.fluentResidualCount,
    minimumAvailableWeight: PRACTICE_PROBLEM_WORDS_MIN_QUALITY_COVERAGE,
  });
  const episodes = foundationAnalysis?.errors?.episodes ?? foundationAnalysis?.error?.episodes ?? [];
  const relevantEpisodes = Array.isArray(episodes) ? episodes.filter((episode) => ranges.some((range) => Number(episode?.startTextPosition ?? episode?.textPosition ?? -1) >= range.startIndex && Number(episode?.startTextPosition ?? episode?.textPosition ?? -1) < range.endIndex)) : [];
  const repairTimes = relevantEpisodes.map((episode) => Number(episode?.errorToRepairMs ?? episode?.repairMs)).filter(finite);
  return freezeDeep({
    opportunityCount: observed,
    executionQuality: execution.quality,
    executionQualityCoverage: execution.availableQualityWeight,
    wholeWordFirstPassAccuracy: observed ? (observed - errorCount) / observed : null,
    launch,
    internal,
    recovery: { primaryErrorEpisodeCount: relevantEpisodes.length || (errorCount ? errorCount : 0), errorToRepairMeanMs: mean(repairTimes) },
    launchContextCoverage: launch.eligibleCount ? launch.eligibleCount / observed : observed ? 0 : null,
    qualityComponents: execution.components,
  });
}
