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

function resolveStatus({ summary, evaluationSummary, blockKind, runtime }) {
  if (summary?.status !== "completed" || summary?.completionReason !== "time-complete") return "invalid";
  if (runtime?.pauseObserved || runtime?.contentAppendObserved || runtime?.restoredFromCheckpoint) return "invalid";
  if (["benchmark", "cold-transfer"].includes(blockKind)) {
    if (!evaluationSummary || ["invalid", "measurement-failed", "not-eligible"].includes(evaluationSummary.status)) return "measurement-failed";
    if (evaluationSummary.freshness === "repeat" || evaluationSummary.freshnessStatus === "repeat" || evaluationSummary.integrityStatus === "nonstandard") return "nonstandard";
  }
  return "measured";
}

export function buildPracticeAssessmentAnalysis({
  binding = null,
  blockKind = null,
  summary = null,
  foundationAnalysis = null,
  coverage = null,
  evaluationSummary = null,
  diagnosticFormId = null,
  diagnosticFreshness = null,
  runtime = {},
} = {}) {
  if (!binding) return createNotRequestedPracticeAssessmentAnalysis();
  const fluency = foundationAnalysis?.latency ?? foundationAnalysis?.fluency ?? null;
  const errors = foundationAnalysis?.errors ?? null;
  const skills = foundationAnalysis?.skills ?? null;
  const status = resolveStatus({ summary, evaluationSummary, blockKind, runtime });
  const opportunityCount = finiteOrNull(
    skills?.summary?.opportunityCount
      ?? skills?.summary?.firstPassOpportunityCount
      ?? summary?.skillEvidenceSummary?.firstPassOpportunityCount,
  );
  const correctCount = finiteOrNull(
    skills?.summary?.correctOpportunityCount
      ?? skills?.summary?.firstPassCorrectCount
      ?? summary?.skillEvidenceSummary?.firstPassCorrectCount,
  );
  const firstPassErrorCount = opportunityCount != null && correctCount != null ? Math.max(0, opportunityCount - correctCount) : null;
  const fluentTransitionCount = finiteOrNull(fluency?.fluentTransitionCount ?? fluency?.counts?.fluent);
  const disfluentTransitionCount = finiteOrNull(fluency?.disfluentTransitionCount ?? fluency?.counts?.disfluent);
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
    fluentTransitionCount,
    disfluentTransitionCount,
    disfluencyRate: finiteOrNull(fluency?.disfluencyRate) ?? ratioOrNull(disfluentTransitionCount, (fluentTransitionCount ?? 0) + (disfluentTransitionCount ?? 0)),
    correctionInputCount: finiteOrNull(errors?.correctionInputCount ?? errors?.counts?.correctionActions ?? summary?.metrics?.correctionInputCount),
    correctionCharactersRemoved: finiteOrNull(errors?.correctionCharactersRemoved ?? errors?.counts?.charactersRemoved),
    correctionCostMs: finiteOrNull(errors?.correctionCostMs ?? errors?.timing?.correctionCostMs),
    errorEpisodeCount: finiteOrNull(errors?.episodeCount ?? errors?.errorEpisodeCount ?? errors?.counts?.episodes),
    wordLaunchResidualMedianMs: finiteOrNull(foundationAnalysis?.normalization?.wordLaunchResidualMedianMs),
  });
  const terminalUsable = status === "measured" || status === "nonstandard";
  const delta = Object.freeze({
    deltaVersion: 1,
    assessmentRunId: binding.assessmentRunId,
    blockId: binding.blockId,
    blockOrdinal: binding.blockOrdinal,
    sessionId: summary?.sessionId ?? null,
    profileId: summary?.profileId ?? null,
    contextId: summary?.contextId ?? null,
    completedAtUtc: summary?.completedAtUtc ?? null,
    status: terminalUsable ? "completed" : "invalid",
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
