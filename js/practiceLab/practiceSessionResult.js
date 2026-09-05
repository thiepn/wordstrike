import { createDefaultSessionSummary } from "./practiceDefaults.js";
import { toPracticeUtcIso } from "./practiceTime.js";
import { validateSessionSummary } from "./practiceValidation.js";
import {
  PRACTICE_SESSION_ERROR_CODES,
} from "./practiceSessionConstants.js";
import { practiceSessionError } from "./practiceSessionContract.js";

export function buildPracticeSessionResult({
  sessionId,
  profileId,
  contextId,
  experiment,
  configuration,
  contentPlan,
  status,
  completionReason,
  createdAt,
  startedAtUtc,
  completedAtUtc,
  timeContext,
  metrics,
  targetEntities,
  foundationAnalysis = null,
  analysis = null,
}) {
  const summary = createDefaultSessionSummary({
    sessionId,
    profileId,
    contextId,
    experimentId: experiment.id,
    now: () => new Date(createdAt),
    overrides: {
      experimentVersion: experiment.version,
      sessionSchemaVersion: experiment.sessionSchemaVersion,
      contentGeneratorVersion: contentPlan.contentGeneratorVersion,
      status,
      completionReason,
      createdAt,
      updatedAt: completedAtUtc,
      startedAtUtc,
      completedAtUtc,
      localDayKey: timeContext.localDayKey,
      timezoneOffsetMinutesAtStart: timeContext.timezoneOffsetMinutes,
      timezoneId: timeContext.timezoneId,
      plannedDurationMs: contentPlan.completion.mode === "duration" ? contentPlan.completion.value : 0,
      activeDurationMs: metrics.activeDurationMs,
      pausedDurationMs: metrics.pausedDurationMs,
      wallDurationMs: metrics.wallDurationMs,
      configuration,
      contentDescriptor: {
        contentPlanVersion: contentPlan.contentPlanVersion,
        contentId: contentPlan.contentId,
        contentHash: contentPlan.contentHash,
        sourceType: contentPlan.metadata?.sourceType ?? "generated",
      },
      targetEntities,
      typedCharacterCount: metrics.acceptedInsertions,
      correctCharacterCount: metrics.correctInsertions,
      incorrectCharacterCount: metrics.incorrectInsertions,
      correctedErrorCount: metrics.correctedIncorrectCharacters,
      uncorrectedErrorCount: metrics.uncorrectedErrors,
      wordCount: contentPlan.units.filter((unit) => unit.type === "word").length,
      completedWordCount: metrics.completedWords,
      wpm: metrics.wpm,
      rawWpm: metrics.rawWpm,
      accuracy: metrics.accuracy,
      consistency: metrics.consistency,
      fluencySummary: foundationAnalysis?.latency?.sessionSummary ?? null,
      errorSummary: foundationAnalysis?.errors?.sessionSummary ?? null,
      normalizationSummary: foundationAnalysis?.normalization?.sessionSummary ?? null,
      skillEvidenceSummary: foundationAnalysis?.skills?.summary ?? null,
      beforeMetrics: analysis?.beforeMetrics ?? null,
      afterMetrics: analysis?.afterMetrics ?? null,
      transferMetrics: analysis?.transferMetrics ?? null,
      fatigueSummary: analysis?.fatigueSummary ?? null,
      trainingQuality: analysis?.trainingQuality ?? null,
      recommendationIds: analysis?.recommendationIds ?? [],
    },
  });
  const validation = validateSessionSummary(summary);
  if (!validation.valid) throw practiceSessionError(
    PRACTICE_SESSION_ERROR_CODES.COMMIT_FAILED,
    "Practice session result failed schema validation",
    { operation: "build-result", sessionId, lifecycleState: status, details: validation.errors },
  );
  return Object.freeze(summary);
}

export function buildPracticeProfileUpdate(profile, summary, {
  completed = true,
} = {}) {
  const newDay = profile.lastTrainingDayKey !== summary.localDayKey;
  return Object.freeze({
    ...profile,
    updatedAt: toPracticeUtcIso(summary.completedAtUtc),
    lastPracticeAt: summary.completedAtUtc,
    lastTrainingDayKey: summary.localDayKey,
    totalCompletedSessions: profile.totalCompletedSessions + (completed ? 1 : 0),
    totalPracticeDurationMs: profile.totalPracticeDurationMs + summary.activeDurationMs,
    activeTrainingDays: profile.activeTrainingDays + (newDay ? 1 : 0),
  });
}
