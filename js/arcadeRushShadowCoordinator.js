import { createAttemptSeed } from "./random.js";
import {
  getArcadeRushRecordFlags,
  getArcadeRushRecords,
  recordArcadeRushRunStarted,
  recordCompletedSession,
} from "./modeStorage.js";
import {
  getAuthState,
  subscribeToAuth,
} from "./authService.js";
import {
  getLeaderboardProfileState,
  subscribeToLeaderboardProfile,
} from "./leaderboardProfileService.js";
import {
  getLeaderboardState,
  initializeLeaderboards,
  LEADERBOARD_BOARDS,
} from "./leaderboardService.js";
import {
  getSubmissionState,
  prepareResultSubmission,
  refreshSubmissionEligibility,
  submitCurrentResult,
  subscribeToSubmissions,
} from "./leaderboardSubmissionService.js";
import {
  createArcadeRushShadowCertificationSnapshot,
  getArcadeRushShadowRunPolicy,
} from "./arcadeRushShadowCertification.js";

function immutableFlags(flags) {
  return flags && typeof flags === "object" ? Object.freeze({ ...flags }) : null;
}

export function createArcadeRushShadowCoordinator({
  search = globalThis.location?.search || "",
  createSeed = createAttemptSeed,
} = {}) {
  const policy = getArcadeRushShadowRunPolicy(search);
  let latestResult = null;
  let latestRecordFlags = null;
  let runStartedPersisted = null;
  let resultPersisted = null;
  let activeSessionId = null;
  let submissionFlight = null;
  let readbackSessionId = null;
  const unsubscribe = [];

  function prepareStart({ seed, developerMode = false } = {}) {
    return Object.freeze({
      seed: policy.enabled ? createSeed() : seed,
      developerMode: policy.enabled ? false : developerMode === true,
    });
  }

  function onStarted({ developerMode = false } = {}) {
    activeSessionId = null;
    latestResult = null;
    latestRecordFlags = null;
    resultPersisted = null;
    readbackSessionId = null;
    runStartedPersisted = developerMode === false
      ? recordArcadeRushRunStarted({ developerMode: false })
      : null;
    return runStartedPersisted;
  }

  async function requestReadback(sessionId) {
    if (!policy.enabled || !sessionId || readbackSessionId === sessionId) return getLeaderboardState();
    readbackSessionId = sessionId;
    return initializeLeaderboards(LEADERBOARD_BOARDS.ARCADE_RUSH);
  }

  async function maybeSubmit() {
    if (!policy.enabled || !latestResult?.success) return getSubmissionState();
    const submission = refreshSubmissionEligibility(getAuthState(), getLeaderboardProfileState());
    if (submission.status !== "ready") return submission;
    if (submissionFlight) return submissionFlight;
    const sessionId = latestResult.sessionId;
    submissionFlight = Promise.resolve(submitCurrentResult())
      .then(async (state) => {
        if (
          state?.sessionId === sessionId &&
          ["submitted", "already-submitted"].includes(state.status)
        ) {
          await requestReadback(sessionId);
        }
        return state;
      })
      .finally(() => {
        submissionFlight = null;
      });
    return submissionFlight;
  }

  function onTerminal(result) {
    latestResult = result || null;
    activeSessionId = result?.sessionId || null;
    latestRecordFlags = null;
    resultPersisted = null;

    if (result?.developerMode === false) {
      const previous = getArcadeRushRecords();
      latestRecordFlags = immutableFlags(getArcadeRushRecordFlags(result, previous));
      resultPersisted = recordCompletedSession(result);
    }

    if (policy.enabled && result?.developerMode === false) {
      prepareResultSubmission(
        "arcade-rush",
        result,
        getAuthState(),
        getLeaderboardProfileState(),
      );
      void maybeSubmit();
    }
    return Object.freeze({
      recordFlags: latestRecordFlags,
      resultPersisted,
      submission: getSubmissionState(),
    });
  }

  function enhanceReadyOptions(options = {}) {
    const records = getArcadeRushRecords();
    return Object.freeze({
      ...options,
      personalBest: options.personalBest ?? records.highestScore ?? null,
      shadowCertification: policy.enabled,
    });
  }

  function enhanceResultOptions(options = {}) {
    return Object.freeze({
      ...options,
      isPersonalBest: options.isPersonalBest === true || latestRecordFlags?.newBest === true,
      shadowCertification: policy.enabled,
    });
  }

  function inspect() {
    return createArcadeRushShadowCertificationSnapshot({
      search,
      result: latestResult,
      runStartedPersisted,
      resultPersisted,
      recordFlags: latestRecordFlags,
      submissionState: getSubmissionState(),
      leaderboardState: getLeaderboardState(),
    });
  }

  async function verifyLeaderboard() {
    if (policy.enabled) {
      readbackSessionId = null;
      await requestReadback(activeSessionId || latestResult?.sessionId || "preflight");
    }
    return inspect();
  }

  if (policy.enabled) {
    unsubscribe.push(subscribeToAuth(() => { void maybeSubmit(); }));
    unsubscribe.push(subscribeToLeaderboardProfile(() => { void maybeSubmit(); }));
    unsubscribe.push(subscribeToSubmissions((state) => {
      if (
        latestResult?.success &&
        state?.sessionId === latestResult.sessionId &&
        ["submitted", "already-submitted"].includes(state.status)
      ) {
        void requestReadback(latestResult.sessionId);
      }
    }));
  }

  const diagnosticApi = policy.enabled ? Object.freeze({ inspect, verifyLeaderboard }) : null;
  if (diagnosticApi) globalThis.wordstrikeArcadeRushShadow = diagnosticApi;

  return Object.freeze({
    policy,
    prepareStart,
    onStarted,
    onTerminal,
    enhanceReadyOptions,
    enhanceResultOptions,
    inspect,
    verifyLeaderboard,
    destroy() {
      while (unsubscribe.length) unsubscribe.pop()?.();
      if (globalThis.wordstrikeArcadeRushShadow === diagnosticApi) {
        try {
          delete globalThis.wordstrikeArcadeRushShadow;
        } catch {
          globalThis.wordstrikeArcadeRushShadow = undefined;
        }
      }
      submissionFlight = null;
      return true;
    },
  });
}
