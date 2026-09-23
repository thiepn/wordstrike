import { createLeaderboardSubmissionService } from "./leaderboardSubmissionService.js";
import {
  listSubmissionOutbox,
  markSubmissionOutboxAttempt,
  removeSubmissionOutbox,
} from "./submissionOutbox.js";

function readyAccount(authState, profileState) {
  return (
    authState?.status === "signed-in" &&
    typeof authState.user?.id === "string" &&
    authState.user.id &&
    Boolean(profileState?.profile?.username)
  );
}

export function createSubmissionOutboxCoordinator({
  list = listSubmissionOutbox,
  markAttempt = markSubmissionOutboxAttempt,
  remove = removeSubmissionOutbox,
  makeService = () => createLeaderboardSubmissionService({
    enqueueOutbox: () => Object.freeze({ ok: true, error: null, entry: null }),
    markOutboxAttempt: () => true,
    removeOutbox: () => true,
  }),
} = {}) {
  let activePromise = null;
  let lastResult = Object.freeze({ status: "idle", attempted: 0, submitted: 0, remaining: 0 });

  const publish = (value) => {
    lastResult = Object.freeze(value);
    return lastResult;
  };

  const drain = (authState, profileState, { skipSessionId = null } = {}) => {
    if (activePromise) return activePromise;
    if (!readyAccount(authState, profileState)) {
      return Promise.resolve(publish({ status: "waiting", attempted: 0, submitted: 0, remaining: 0 }));
    }
    const userId = authState.user.id;
    const entries = list({ userId }).filter((entry) => entry.sessionId !== skipSessionId);
    if (!entries.length) {
      return Promise.resolve(publish({ status: "empty", attempted: 0, submitted: 0, remaining: 0 }));
    }

    activePromise = (async () => {
      const service = makeService();
      let attempted = 0;
      let submitted = 0;
      let stopped = false;

      for (const entry of entries) {
        const hydrated = service.restorePreparedSubmission(
          entry.mode,
          entry.immutablePayload,
          authState,
          profileState,
        );
        if (hydrated.status !== "ready") {
          markAttempt(entry.sessionId, userId, {
            errorCode: `RESTORE_${hydrated.reason || hydrated.status || "FAILED"}`,
          });
          continue;
        }

        attempted += 1;
        const finalState = await service.submitCurrentResult();
        if (["submitted", "already-submitted"].includes(finalState.status)) {
          remove(entry.sessionId, userId);
          submitted += 1;
          continue;
        }

        const errorCode = finalState.error?.code
          || (finalState.status === "offline" ? "OFFLINE" : finalState.reason || "SUBMISSION_FAILED");
        markAttempt(entry.sessionId, userId, { errorCode });
        if (["offline", "error"].includes(finalState.status)) {
          stopped = true;
          break;
        }
      }

      const remaining = list({ userId }).length;
      return publish({
        status: stopped ? "deferred" : remaining ? "partial" : "drained",
        attempted,
        submitted,
        remaining,
      });
    })().catch(() => publish({
      status: "deferred",
      attempted: 0,
      submitted: 0,
      remaining: list({ userId }).length,
    })).finally(() => {
      activePromise = null;
    });

    return activePromise;
  };

  return Object.freeze({
    drain,
    getState: () => lastResult,
    isActive: () => Boolean(activePromise),
  });
}
