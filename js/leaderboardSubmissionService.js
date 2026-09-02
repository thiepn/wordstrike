import { getSupabaseClient } from "./supabaseClient.js";
import { CURRENT_GAME_VERSION } from "./gameVersion.js";
import { invalidateLeaderboardBoard, LEADERBOARD_BOARDS } from "./leaderboardService.js";
import { buildArcadeRushLeaderboardSubmissionResult } from "./arcadeRushLeaderboard.js";

const MODE_BOARDS = Object.freeze({
  campaign: LEADERBOARD_BOARDS.CAMPAIGN,
  daily: LEADERBOARD_BOARDS.DAILY,
  endless: LEADERBOARD_BOARDS.ENDLESS,
  "arcade-rush": LEADERBOARD_BOARDS.ARCADE_RUSH,
});

function boardForMode(mode, result) {
  if (mode === "typing") {
    if (result?.modeData?.durationSeconds === 60) return LEADERBOARD_BOARDS.TYPING_60;
    if (result?.modeData?.durationSeconds === 15) return LEADERBOARD_BOARDS.TYPING_15;
    return null;
  }
  return MODE_BOARDS[mode] || null;
}

const makeState = ({
  status = "idle", mode = null, boardKey = null, sessionId = null, rank = null, error = null, reason = null,
  automatic = false,
} = {}) => Object.freeze({
  status,
  mode,
  boardKey,
  sessionId,
  rank: Number.isSafeInteger(rank) && rank > 0 ? rank : null,
  error: error ? Object.freeze({ code: String(error.code || "SERVER_ERROR") }) : null,
  reason,
  automatic: automatic === true,
});

function validSessionId(value) {
  return typeof value === "string" && value.length <= 128 && (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ||
    /^session-[a-z0-9-]{8,120}$/i.test(value)
  );
}

function hasCompleteMetrics(value) {
  if (value == null) return value === null;
  if (typeof value === "number") return Number.isFinite(value);
  if (["string", "boolean"].includes(typeof value)) return true;
  if (Array.isArray(value)) return false;
  return typeof value === "object" && Object.values(value).every(hasCompleteMetrics);
}

function freezePayload(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezePayload(nested);
  return Object.freeze(value);
}

export function buildSubmissionPayload(mode, result) {
  const boardKey = boardForMode(mode, result);
  const data = result?.modeData;
  if (!boardKey || !result || !data || !validSessionId(result.sessionId)) return null;
  if (mode === "daily") {
    const normalizedResult = buildDailySubmissionResult(result);
    if (!normalizedResult) return null;
    const payload = {
      boardKey,
      sessionId: result.sessionId,
      clientVersion: CURRENT_GAME_VERSION,
      result: normalizedResult,
    };
    return hasCompleteMetrics(payload) ? payload : null;
  }
  if (mode === "arcade-rush") {
    const normalizedResult = buildArcadeRushLeaderboardSubmissionResult(result);
    if (!normalizedResult) return null;
    const payload = {
      boardKey,
      sessionId: result.sessionId,
      clientVersion: CURRENT_GAME_VERSION,
      result: normalizedResult,
    };
    return hasCompleteMetrics(payload) ? payload : null;
  }
  if (mode === "campaign") {
    if (result.success !== true) return null;
    const payload = {
      boardKey,
      sessionId: result.sessionId,
      clientVersion: CURRENT_GAME_VERSION,
      result: {
        level: data.level,
        completed: true,
        grade: result.grade,
        accuracy: result.accuracy,
        durationMs: Math.ceil(result.activeDurationMs),
        wordsCompleted: result.words.completed,
        wordsTotal: data.wordsTotal,
        variantId: result.variantId,
        correctCharacters: result.characters.correct,
        correctKeystrokes: data.correctKeystrokes,
        totalKeystrokes: data.totalKeystrokes,
        missedCharacters: data.missedCharacters,
        recordEligible: data.recordEligible === true,
        developerMode: result.developerMode === true,
        sessionSource: result.sessionSource,
      },
    };
    return hasCompleteMetrics(payload) ? payload : null;
  }
  if (mode === "typing") {
    const normalizedResult = buildTypingSubmissionResult(result, data.durationSeconds);
    if (!normalizedResult) return null;
    const payload = {
      boardKey,
      sessionId: result.sessionId,
      clientVersion: CURRENT_GAME_VERSION,
      result: normalizedResult,
    };
    return hasCompleteMetrics(payload) ? payload : null;
  }
  const payload = {
    boardKey,
    sessionId: result.sessionId,
    clientVersion: CURRENT_GAME_VERSION,
    result: {
      score: result.score,
      stage: data.highestStage,
      accuracy: result.accuracy,
      // Endless survival points use floor(duration / 10), so flooring milliseconds is exact.
      durationMs: Math.floor(result.activeDurationMs),
      wordsCompleted: data.wordsCompleted,
      completed: result.success === true,
      failureReason: result.failureReason,
      recordEligible: data.recordEligible === true,
      developerMode: result.developerMode === true,
      sessionSource: result.sessionSource,
      metricVersion: data.metricVersion,
      finalStage: data.finalStage,
      stageProgress: data.stageProgress,
      completedStages: data.completedStages,
      survivalPoints: data.survivalPoints,
      wordPoints: data.wordPoints,
      stageBonusPoints: data.stageBonusPoints,
      coreHits: data.coreHits,
      coreBreaches: data.coreBreaches,
      startStage: data.startStage,
    },
  };
  return hasCompleteMetrics(payload) ? payload : null;
}

export function buildDailySubmissionResult(result) {
  const data = result?.modeData;
  const wordsCompleted = Number(data?.wordsCompleted);
  const resolved = Number(data?.wordsResolved);
  const spawned = Number(data?.wordsSpawned);
  const total = Number(data?.totalWords);
  const missed = Number(result?.words?.missed);
  const breaches = Number(data?.coreBreaches);
  const validCounters = [wordsCompleted, resolved, spawned, total, missed, breaches]
    .every(Number.isSafeInteger) &&
    total === 60 &&
    wordsCompleted >= 0 && missed >= 0 && breaches >= 0 &&
    wordsCompleted <= resolved && resolved <= spawned && spawned <= total &&
    missed === breaches && wordsCompleted + missed === resolved &&
    result?.words?.completed === wordsCompleted;
  if (!validCounters) return null;
  const normalized = {
    score: result?.score,
    accuracy: result?.accuracy,
    // Daily's rounded time bonus keeps the same value when fractional frame time is ceiled.
    durationMs: Math.ceil(result?.activeDurationMs),
    wordsCompleted,
    completed: result?.success === true,
    failureReason: result?.failureReason ?? null,
    integrityRemaining: data?.integrityRemaining,
    challengeDate: data?.dateKey,
    challengeVersion: data?.challengeVersion,
    wordsResolved: resolved,
    wordsSpawned: spawned,
    totalWords: total,
    dateOverride: data?.dateOverride === true,
    recordEligible: data?.recordEligible === true,
    developerMode: result?.developerMode === true,
    sessionSource: result?.sessionSource,
    wordPoints: data?.wordPoints,
    completionBonus: data?.completionBonus,
    integrityBonus: data?.integrityBonus,
    accuracyBonus: data?.accuracyBonus,
    timeBonus: data?.timeBonus,
    coreHits: data?.coreHits,
    coreBreaches: data?.coreBreaches,
    finalWave: data?.finalWave,
  };
  return hasCompleteMetrics(normalized) ? normalized : null;
}

export function buildTypingSubmissionResult(result, durationSeconds) {
  const data = result?.modeData;
  if (![15, 60].includes(durationSeconds)) return null;
  const normalized = {
    durationSeconds,
    configId: data?.configId,
    wordSetId: data?.wordSetId,
    wordSetVersion: data?.wordSetVersion,
    metricVersion: data?.metricVersion,
    wpm: result?.wpm,
    rawWpm: data?.rawWpm,
    accuracy: result?.accuracy,
    durationMs: Math.round(result?.activeDurationMs),
    correctTestCharacters: data?.correctTestCharacters,
    rawTestCharacters: data?.rawTestCharacters,
    correctKeystrokes: data?.correctKeystrokes,
    incorrectKeystrokes: data?.incorrectKeystrokes,
    missedCharacters: data?.missedCharacters,
    wordsCompleted: data?.completedWordCount,
    exactWords: data?.exactWords,
    incorrectWords: data?.incorrectWords,
    completed: result?.success === true,
    recordEligible: data?.recordEligible === true,
    developerMode: result?.developerMode === true,
    sessionSource: result?.sessionSource,
  };
  return hasCompleteMetrics(normalized) ? normalized : null;
}

async function readFunctionError(error) {
  try {
    if (typeof error?.context?.json === "function") return await error.context.json();
  } catch {
    // Use the stable generic error below.
  }
  return null;
}

export function createLeaderboardSubmissionService({
  getClient = getSupabaseClient,
  isOnline = () => globalThis.navigator?.onLine !== false,
  invalidateBoard = invalidateLeaderboardBoard,
} = {}) {
  let state = makeState();
  let payload = null;
  let activeMode = null;
  let requestSequence = 0;
  const listeners = new Set();

  const publish = (next) => {
    state = makeState(next);
    for (const listener of listeners) listener(state);
    return state;
  };

  const eligibility = (authState, profileState) => {
    if (!payload) {
      if (activeMode === "campaign") return { status: "ineligible", reason: "campaign-failed" };
      if (activeMode === "typing") return { status: "ineligible", reason: "unsupported-test" };
      return { status: "ineligible", reason: "invalid-result" };
    }
    if (
      activeMode === "typing" && (
        payload.result.completed !== true ||
        payload.result.configId !== `time-${payload.result.durationSeconds}` ||
        payload.result.wordSetId !== "english-200" ||
        payload.result.wordSetVersion !== 1 ||
        payload.result.metricVersion !== 2
      )
    ) return { status: "ineligible", reason: "unsupported-test" };
    if (activeMode === "daily" && payload.result.dateOverride !== false) {
      return { status: "ineligible", reason: "local-only" };
    }
    if (activeMode === "arcade-rush" && (
      payload.result.completed !== true ||
      payload.result.bossDefeated !== true ||
      payload.result.rulesVersion !== 1
    )) return { status: "ineligible", reason: "invalid-result" };
    if (payload.result.developerMode || !payload.result.recordEligible) {
      return { status: "ineligible", reason: "local-only" };
    }
    if (["idle", "loading"].includes(authState?.status)) {
      return { status: "checking", reason: "auth-loading" };
    }
    if (authState?.status !== "signed-in" || !authState.user?.id) {
      return { status: "ineligible", reason: "signed-out" };
    }
    if (!profileState?.profile?.username && ["idle", "loading"].includes(profileState?.status)) {
      return { status: "checking", reason: "profile-loading" };
    }
    if (!profileState?.profile?.username) {
      return { status: "ineligible", reason: "username-required" };
    }
    return { status: "ready", reason: null };
  };

  const refreshEligibility = (authState, profileState) => {
    if (!payload || ["submitting", "submitted", "already-submitted"].includes(state.status)) {
      return state;
    }
    const nextEligibility = eligibility(authState, profileState);
    return publish({
      ...state,
      ...nextEligibility,
      automatic: state.automatic && ["checking", "ready"].includes(nextEligibility.status),
      error: null,
    });
  };

  const restorePayload = (mode, restoredPayload, authState, profileState) => {
    requestSequence += 1;
    activeMode = (MODE_BOARDS[mode] || mode === "typing") ? mode : null;
    const expectedBoards = mode === "typing"
      ? [LEADERBOARD_BOARDS.TYPING_15, LEADERBOARD_BOARDS.TYPING_60]
      : [MODE_BOARDS[mode]];
    const valid = Boolean(
      activeMode &&
      restoredPayload &&
      typeof restoredPayload === "object" &&
      !Array.isArray(restoredPayload) &&
      expectedBoards.includes(restoredPayload.boardKey) &&
      validSessionId(restoredPayload.sessionId) &&
      restoredPayload.result &&
      hasCompleteMetrics(restoredPayload)
    );
    payload = valid
      ? freezePayload(JSON.parse(JSON.stringify(restoredPayload)))
      : null;
    const boardKey = payload?.boardKey ?? null;
    const sessionId = payload?.sessionId ?? null;
    return publish({ mode: activeMode, boardKey, sessionId, ...eligibility(authState, profileState) });
  };

  const submit = async () => {
    if (!payload || state.status === "submitting") return state;
    if (!isOnline()) return publish({ ...state, status: "offline", error: null });
    if (!["ready", "error", "offline"].includes(state.status)) return state;
    const client = getClient();
    if (!client?.functions?.invoke) return publish({ ...state, status: "error", error: true });
    const requestId = ++requestSequence;
    const submittedSessionId = payload.sessionId;
    const submittedBoardKey = payload.boardKey;
    publish({ ...state, status: "submitting", error: null });
    try {
      const { data, error } = await client.functions.invoke("submit-score", { body: payload });
      let response = data;
      if (!response?.ok && error) response = await readFunctionError(error);
      if (response?.ok) invalidateBoard(submittedBoardKey);
      if (requestId !== requestSequence || payload?.sessionId !== submittedSessionId) return state;
      if (!response?.ok) {
        const code = response?.error?.code || "SERVER_ERROR";
        if (code === "NOT_AUTHENTICATED") {
          return publish({ ...state, status: "ineligible", reason: "signed-out", automatic: false, error: null });
        }
        if (code === "PROFILE_REQUIRED") {
          return publish({ ...state, status: "ineligible", reason: "username-required", automatic: false, error: null });
        }
        return publish({ ...state, status: isOnline() ? "error" : "offline", error: { code } });
      }
      return publish({
        ...state,
        status: response.data?.duplicate ? "already-submitted" : "submitted",
        rank: response.data?.rank,
        error: null,
        reason: null,
      });
    } catch {
      if (requestId !== requestSequence || payload?.sessionId !== submittedSessionId) return state;
      return publish({ ...state, status: isOnline() ? "error" : "offline", error: true });
    }
  };

  return Object.freeze({
    getSubmissionState: () => state,
    subscribeToSubmissions(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    prepareResultSubmission(mode, result, authState, profileState) {
      requestSequence += 1;
      activeMode = mode;
      payload = freezePayload(buildSubmissionPayload(mode, result));
      const boardKey = boardForMode(mode, result);
      const sessionId = payload?.sessionId || result?.sessionId || null;
      return publish({ mode, boardKey, sessionId, ...eligibility(authState, profileState) });
    },
    restorePreparedSubmission: restorePayload,
    markAutomaticSubmissionPending(sessionId) {
      if (state.sessionId !== sessionId || !["checking", "ready"].includes(state.status)) return state;
      return publish({ ...state, automatic: true });
    },
    expireAutomaticSubmissionCheck(sessionId) {
      if (state.sessionId !== sessionId || state.status !== "checking" || !state.automatic) return state;
      return publish({
        ...state,
        status: "error",
        automatic: false,
        reason: null,
        error: { code: "ACCOUNT_CHECK_TIMEOUT" },
      });
    },
    refreshSubmissionEligibility: refreshEligibility,
    submitCurrentResult: submit,
    retryCurrentSubmission: submit,
    clearSubmissionState() {
      requestSequence += 1;
      payload = null;
      activeMode = null;
      return publish(makeState());
    },
  });
}

const submissionService = createLeaderboardSubmissionService();

export const getSubmissionState = submissionService.getSubmissionState;
export const subscribeToSubmissions = submissionService.subscribeToSubmissions;
export const prepareResultSubmission = submissionService.prepareResultSubmission;
export const restorePreparedSubmission = submissionService.restorePreparedSubmission;
export const markAutomaticSubmissionPending = submissionService.markAutomaticSubmissionPending;
export const expireAutomaticSubmissionCheck = submissionService.expireAutomaticSubmissionCheck;
export const refreshSubmissionEligibility = submissionService.refreshSubmissionEligibility;
export const submitCurrentResult = submissionService.submitCurrentResult;
export const retryCurrentSubmission = submissionService.retryCurrentSubmission;
export const clearSubmissionState = submissionService.clearSubmissionState;
