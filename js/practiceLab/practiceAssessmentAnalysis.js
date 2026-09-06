import { PRACTICE_ASSESSMENT_ANALYSIS_VERSION } from "./practiceAssessmentConstants.js";

const finiteOrNull = (value) => Number.isFinite(value) ? Number(value) : null;
const ratioOrNull = (numerator, denominator) => Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 ? numerator / denominator : null;

export function createNotRequestedPracticeAssessmentAnalysis() {
  return Object.freeze({
    version: PRACTICE_ASSESSMENT_ANALYSIS_VERSION,
    status: "not-requested",
    blockId: null,
    blockKind: null,
    blockMetrics: null,
    coverage: null,
    assessmentBlockDelta: null,
  });
}

export function buildPracticeAssessmentAnalysis({ binding = null, blockKind = null, summary = null, foundationAnalysis = null, coverage = null, evaluationSummary = null, diagnosticFormId = null, diagnosticFreshness = null } = {}) {
  if (!binding) return createNotRequestedPracticeAssessmentAnalysis();
  const fluency = foundationAnalysis?.latency ?? foundationAnalysis?.fluency ?? null;
  const errors = foundationAnalysis?.errors ?? null;
  const skills = foundationAnalysis?.skills ?? null;
  const status = summary?.status === "completed" && summary?.completionReason === "time-complete" ? "measured" : "invalid";
  const opportunityCount = finiteOrNull(skills?.summary?.opportunityCount ?? summary?.skillEvidenceSummary?.firstPassOpportunityCount);
  const correctCount = finiteOrNull(skills?.summary?.correctOpportunityCount ?? summary?.skillEvidenceSummary?.firstPassCorrectCount);
  const firstPassErrorCount = opportunityCount != null && correctCount != null ? Math.max(0, opportunityCount - correctCount) : null;
  const blockMetrics = Object.freeze({
    activeDurationMs: finiteOrNull(summary?.metrics?.activeDurationMs ?? summary?.activeDurationMs),
    typedCharacterCount: finiteOrNull(summary?.metrics?.typedCharacterCount ?? summary?.typedCharacterCount),
    wpm: finiteOrNull(summary?.metrics?.wpm ?? summary?.wpm),
    rawWpm: finiteOrNull(summary?.metrics?.rawWpm ?? summary?.rawWpm),
    accuracy: finiteOrNull(summary?.metrics?.accuracy ?? summary?.accuracy),
    firstPassOpportunityCount: opportunityCount,
    firstPassCorrectCount: correctCount,
    firstPassErrorCount,
    firstPassAccuracy: ratioOrNull(correctCount, opportunityCount),
    fluentTransitionCount: finiteOrNull(fluency?.fluentTransitionCount),
    disfluentTransitionCount: finiteOrNull(fluency?.disfluentTransitionCount),
    disfluencyRate: finiteOrNull(fluency?.disfluencyRate),
    correctionInputCount: finiteOrNull(errors?.correctionInputCount ?? summary?.metrics?.correctionInputCount),
    correctionCharactersRemoved: finiteOrNull(errors?.correctionCharactersRemoved),
    correctionCostMs: finiteOrNull(errors?.correctionCostMs),
    errorEpisodeCount: finiteOrNull(errors?.episodeCount ?? errors?.errorEpisodeCount),
    wordLaunchResidualMedianMs: finiteOrNull(foundationAnalysis?.normalization?.wordLaunchResidualMedianMs),
  });
  const delta = Object.freeze({
    deltaVersion: 1,
    assessmentRunId: binding.assessmentRunId,
    blockId: binding.blockId,
    blockOrdinal: binding.blockOrdinal,
    sessionId: summary?.sessionId ?? null,
    profileId: summary?.profileId ?? null,
    contextId: summary?.contextId ?? null,
    completedAtUtc: summary?.completedAtUtc ?? null,
    status: status === "measured" ? "completed" : "invalid",
    blockMetrics,
    coverage: coverage ?? null,
    evaluationSummary: evaluationSummary ?? summary?.evaluationSummary ?? null,
    diagnosticFormId,
    diagnosticFreshness,
  });
  return Object.freeze({
    version: PRACTICE_ASSESSMENT_ANALYSIS_VERSION,
    status,
    blockId: binding.blockId,
    blockKind,
    blockMetrics,
    coverage: coverage ?? null,
    assessmentBlockDelta: delta,
  });
}
