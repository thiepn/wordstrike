import { createPracticeEntityResolver } from "./practiceEntityResolver.js";
import { extractPracticeLearningPhaseOpportunities } from "./practiceLearningObservation.js";
import { buildPracticePhaseQuality } from "./practiceLearningQuality.js";
import { practiceMedian } from "./practiceRobustStats.js";
import { resolvePracticePrimaryErrorAttribution, getPracticePrimaryErrorPosition } from "./practicePrimaryErrorAttribution.js";
import { buildPracticeProblemWordsProbeMetrics } from "./practiceProblemWordsMetrics.js";
import { PRACTICE_ACCURACY_RECOVERY_POLICY_V1 } from "./practiceAccuracyRecoveryPolicy.js";

const finite = Number.isFinite;
const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const mean = (values) => { const clean = values.filter(finite); return clean.length ? clean.reduce((a, b) => a + b, 0) / clean.length : null; };
const median = (values) => { const clean = values.filter((value) => finite(value) && value >= 0); return clean.length ? practiceMedian(clean) : null; };

function timingSummary(records) {
  const timing = records.flatMap((record) => record?.timing ?? []);
  const fluent = timing.filter((entry) => entry.latencyClass === "fluent");
  const disfluent = timing.filter((entry) => entry.latencyClass === "disfluent");
  const residual = fluent.map((entry) => entry.residualLatencyMs).filter(finite);
  return freezeDeep({
    eligibleCount: fluent.length + disfluent.length,
    fluentResidualMedianMs: residual.length ? practiceMedian(residual) : null,
    fluentResidualMeanMs: mean(residual),
    disfluencyRate: fluent.length + disfluent.length ? disfluent.length / (fluent.length + disfluent.length) : null,
  });
}
function phaseRange(contentPlan, id) { return (contentPlan?.metadata?.accuracyRecovery?.phaseRanges ?? []).find((phase) => phase.id === id) ?? null; }
function targetKey(target) { return `${target.entityType}\u0000${target.entityKey}`; }

export function buildPracticeAccuracyRecoveryProbeProfile({ phaseId, profileId, contextId, contentPlan, eventTrace = [], foundationAnalysis = null, target } = {}) {
  const range = phaseRange(contentPlan, phaseId); if (!range) return null;
  const phaseMap = extractPracticeLearningPhaseOpportunities({ profileId, contextId, contentPlan, normalizedTransitions: foundationAnalysis?.normalization?.normalizedTransitions ?? [] });
  const all = phaseMap.get(targetKey(target)) ?? [];
  const records = all.filter((record) => record.textPosition >= range.startIndex && record.textPosition < range.endIndex);
  const quality = buildPracticePhaseQuality(target.entityType, records);
  const timing = timingSummary(records);
  const errorEpisodes = targetAttributedEpisodes({ profileId, contextId, contentPlan, foundationAnalysis, target, ranges: [range] });
  const base = {
    phaseId,
    opportunityCount: records.length,
    firstPassCorrectCount: records.filter((record) => record.correct === true).length,
    firstPassErrorCount: records.filter((record) => record.correct !== true).length,
    firstPassAccuracy: records.length ? records.filter((record) => record.correct === true).length / records.length : null,
    timing,
    errors: {
      primaryEpisodeCount: errorEpisodes.length,
      correctedEpisodeCount: errorEpisodes.filter((episode) => episode.corrected).length,
      uncorrectedEpisodeCount: errorEpisodes.filter((episode) => !episode.corrected).length,
    },
    quality: quality.quality,
    qualityCoverage: quality.availableQualityWeight,
  };
  if (target.entityType === "word") {
    const word = buildPracticeProblemWordsProbeMetrics({ eventTrace, foundationAnalysis, targetWordRanges: range.targetRanges ?? [], expectedEntityKey: target.entityKey });
    return freezeDeep({ ...base, word: { launch: word.launch, internal: word.internal, wholeWordFirstPassAccuracy: word.wholeWordFirstPassAccuracy } });
  }
  return freezeDeep(base);
}

export function targetAttributedEpisodes({ profileId, contextId, contentPlan, foundationAnalysis, target, ranges = null } = {}) {
  const resolver = createPracticeEntityResolver({ contentPlan, profileId, contextId, language: contentPlan?.metadata?.language ?? "en", allowWordEntities: true });
  const episodes = foundationAnalysis?.errors?.recentEpisodes ?? [];
  return Object.freeze((episodes ?? []).filter((episode) => {
    const position = getPracticePrimaryErrorPosition(episode); if (position == null) return false;
    if (Array.isArray(ranges) && ranges.length && !ranges.some((range) => position >= range.startIndex && position < range.endIndex)) return false;
    return resolvePracticePrimaryErrorAttribution({ episode, entityResolver: resolver }).some((entity) => entity.entityType === target.entityType && entity.entityKey === target.entityKey);
  }));
}

export function buildPracticeAccuracyRecoveryRecoveryProfile({ profileId, contextId, contentPlan, foundationAnalysis, target, policy = PRACTICE_ACCURACY_RECOVERY_POLICY_V1 } = {}) {
  const ranges = ["control", "repair", "mix"].map((id) => phaseRange(contentPlan, id)).filter(Boolean);
  const episodes = targetAttributedEpisodes({ profileId, contextId, contentPlan, foundationAnalysis, target, ranges });
  const corrected = episodes.filter((episode) => episode.corrected);
  const correctedCount = corrected.length;
  const coverage = correctedCount === 0 ? "none" : correctedCount >= policy.recovery.usableMinimumCorrectedEpisodes ? "usable" : "limited";
  const sum = (key) => corrected.reduce((total, episode) => total + (finite(episode?.[key]) ? episode[key] : 0), 0);
  return freezeDeep({
    errorEpisodeCount: episodes.length,
    correctedEpisodeCount: correctedCount,
    uncorrectedEpisodeCount: episodes.length - correctedCount,
    correctedRate: episodes.length ? correctedCount / episodes.length : null,
    correctionInitiationMedianMs: median(corrected.map((episode) => episode.correctionInitiationMs)),
    errorToRepairMedianMs: median(corrected.map((episode) => episode.errorToRepairMs)),
    repairToResumeMedianMs: median(corrected.map((episode) => episode.repairToResumeMs)),
    resumeToFluentMedianMs: median(corrected.map((episode) => episode.resumeToFluentMs)),
    correctCharactersRemoved: sum("correctCharactersRemoved"),
    correctCharactersRemovedPerCorrectedEpisode: correctedCount ? sum("correctCharactersRemoved") / correctedCount : null,
    correctionActionMedian: median(corrected.map((episode) => episode.correctionActionCount)),
    charactersRemovedMedian: median(corrected.map((episode) => episode.charactersRemoved)),
    coverage,
    cascadeEpisodeCount: episodes.filter((episode) => episode.cascade).length,
  });
}
