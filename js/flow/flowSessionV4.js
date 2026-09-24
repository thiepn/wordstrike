import { compareFlowScoreV3Results } from "./flowScoreV3.js";

export const FLOW_SESSION_V4_VERSION = 1;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value) => Math.max(0, Math.round(finite(value)));

function cloneRun(result) {
  if (!result || typeof result !== "object") return null;
  return Object.freeze({
    sessionId: String(result.sessionId || ""),
    score: integer(result.score),
    wpm: Math.max(0, finite(result.wpm)),
    accuracy: Math.max(0, Math.min(100, finite(result.accuracy))),
    consistency: Math.max(0, Math.min(100, finite(result.consistency))),
    wordsCompleted: integer(result.wordsCompleted),
    correctCharacters: integer(result.correctCharacters),
    activeDurationMs: Math.max(0, finite(result.activeDurationMs)),
    endedAt: Math.max(0, finite(result.endedAt)),
    endedReason: String(result.endedReason || "reset"),
    recordEligible: result.recordEligible === true,
  });
}

export function createFlowSessionV4({
  startedAt = Date.now(),
  personalBest = null,
} = {}) {
  const best = cloneRun(personalBest);
  return Object.freeze({
    version: FLOW_SESSION_V4_VERSION,
    startedAt: Math.max(0, finite(startedAt)),
    runCount: 0,
    eligibleRunCount: 0,
    totalScore: 0,
    totalWords: 0,
    totalCorrectCharacters: 0,
    activeDurationMs: 0,
    bestRun: null,
    lastRun: null,
    momentumStreak: 0,
    personalBestScore: best?.score || 0,
  });
}

export function recordFlowSessionRunV4(session, result, {
  isPersonalBest = false,
  previousPersonalBest = null,
} = {}) {
  const current = session || createFlowSessionV4();
  const run = cloneRun(result);
  if (!run || !run.sessionId || run.correctCharacters <= 0) {
    return Object.freeze({
      session: current,
      feedback: null,
    });
  }

  const previousRun = current.lastRun;
  const previousSessionBest = current.bestRun;
  const isSessionBest = !previousSessionBest
    || compareFlowScoreV3Results(run, previousSessionBest) < 0;
  const scoreDelta = previousRun ? run.score - previousRun.score : 0;
  const momentumStreak = previousRun && scoreDelta > 0
    ? current.momentumStreak + 1
    : 0;
  const previousPbScore = Math.max(
    0,
    integer(previousPersonalBest?.score),
    integer(current.personalBestScore),
  );
  const personalBestDelta = isPersonalBest && previousPbScore > 0
    ? run.score - previousPbScore
    : null;

  let tone = "saved";
  let title = "RUN SAVED";
  if (isPersonalBest) {
    tone = "personal-best";
    title = "NEW PERSONAL BEST";
  } else if (isSessionBest) {
    tone = "session-best";
    title = "NEW SESSION BEST";
  } else if (scoreDelta > 0) {
    tone = "momentum";
    title = "MOMENTUM UP";
  }

  const next = Object.freeze({
    version: FLOW_SESSION_V4_VERSION,
    startedAt: current.startedAt,
    runCount: current.runCount + 1,
    eligibleRunCount: current.eligibleRunCount + (run.recordEligible ? 1 : 0),
    totalScore: current.totalScore + run.score,
    totalWords: current.totalWords + run.wordsCompleted,
    totalCorrectCharacters: current.totalCorrectCharacters + run.correctCharacters,
    activeDurationMs: current.activeDurationMs + run.activeDurationMs,
    bestRun: isSessionBest ? run : previousSessionBest,
    lastRun: run,
    momentumStreak,
    personalBestScore: isPersonalBest
      ? Math.max(current.personalBestScore, run.score)
      : current.personalBestScore,
  });

  const feedback = Object.freeze({
    id: run.sessionId,
    tone,
    title,
    runNumber: next.runCount,
    score: run.score,
    wpm: run.wpm,
    accuracy: run.accuracy,
    words: run.wordsCompleted,
    durationMs: run.activeDurationMs,
    scoreDelta,
    momentumStreak,
    isSessionBest,
    isPersonalBest: isPersonalBest === true,
    personalBestDelta,
    sessionScore: next.totalScore,
    sessionWords: next.totalWords,
    sessionBestScore: next.bestRun?.score || 0,
  });

  return Object.freeze({ session: next, feedback });
}

export function getFlowSessionLiveSummaryV4(session, {
  score = 0,
  words = 0,
  correctCharacters = 0,
  durationMs = 0,
} = {}) {
  const current = session || createFlowSessionV4();
  const liveScore = integer(score);
  const liveWords = integer(words);
  const liveCharacters = integer(correctCharacters);
  const liveDuration = Math.max(0, finite(durationMs));
  return Object.freeze({
    currentRunNumber: current.runCount + 1,
    completedRuns: current.runCount,
    eligibleRuns: current.eligibleRunCount,
    totalScore: current.totalScore + liveScore,
    totalWords: current.totalWords + liveWords,
    totalCorrectCharacters: current.totalCorrectCharacters + liveCharacters,
    activeDurationMs: current.activeDurationMs + liveDuration,
    bestScore: Math.max(current.bestRun?.score || 0, liveScore),
    personalBestScore: current.personalBestScore,
    momentumStreak: current.momentumStreak,
  });
}

export function formatFlowSessionDurationV4(ms) {
  const totalSeconds = Math.max(0, Math.round(finite(ms) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return minutes + ":" + seconds;
}
