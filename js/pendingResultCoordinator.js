import {
  bindPendingResultSubmission,
  clearPendingResultSubmission,
  inspectPendingResultSubmission,
  loadPendingResultSubmission,
} from "./pendingResultSubmission.js";
import {
  getSubmissionState,
  restorePreparedSubmission,
  submitCurrentResult,
} from "./leaderboardSubmissionService.js";

const PROFILE_PENDING = new Set(["idle", "loading", "checking", "claiming"]);
const AUTH_PENDING = new Set(["idle", "loading", "signing-in"]);
const safeState = ({ status = "idle", errorCode = null, intent = null } = {}) => Object.freeze({
  status,
  errorCode,
  boardKey: intent?.boardKey ?? null,
  sessionId: intent?.sessionId ?? null,
});

export function createPendingResultCoordinator({
  loadIntent = loadPendingResultSubmission,
  inspectIntent = inspectPendingResultSubmission,
  bindIntent = bindPendingResultSubmission,
  clearIntent = clearPendingResultSubmission,
  hydrate = restorePreparedSubmission,
  submit = submitCurrentResult,
  submissionState = getSubmissionState,
  onUsernameRequired = () => {},
  onFailure = () => {},
  onSuccess = () => {},
} = {}) {
  let state = safeState();
  let automaticAttemptKey = null;
  let usernamePromptKey = null;
  let activePromise = null;
  let activeUserId = null;
  let lifecycleGeneration = 0;
  const listeners = new Set();
  const readIntent = () => inspectIntent?.() || { intent: loadIntent(), error: null };
  const publish = (next) => {
    state = safeState(next);
    for (const listener of listeners) listener(state);
    return state;
  };

  const settledContext = (authState, profileState) => {
    const inspected = readIntent();
    const intent = inspected.intent;
    if (!intent) {
      if (inspected.error === "EXPIRED") {
        const expired = publish({ status: "expired", errorCode: "EXPIRED" });
        onFailure(expired, null);
        return { state: expired, intent: null };
      }
      if (inspected.error) {
        const failed = publish({ status: "failed", errorCode: inspected.error });
        onFailure(failed, null);
        return { state: failed, intent: null };
      }
      if (state.status === "expired" || (state.status === "failed" && state.errorCode === "MALFORMED_INTENT")) {
        return { state, intent: null };
      }
      return { state: publish(), intent: null };
    }
    if (AUTH_PENDING.has(authState?.status)) {
      return { state: publish({ status: "waiting-for-auth", intent }), intent: null };
    }
    if (["error", "unavailable"].includes(authState?.status)) {
      const failed = publish({ status: "failed", errorCode: "AUTH_UNAVAILABLE", intent });
      onFailure(failed, intent);
      return { state: failed, intent: null };
    }
    if (authState?.status !== "signed-in" || !authState.user?.id) {
      return { state: publish({ status: "waiting-for-auth", errorCode: "AUTH_REQUIRED", intent }), intent: null };
    }
    const binding = bindIntent(authState.user.id);
    if (!binding.intent) {
      const failed = publish({ status: "failed", errorCode: binding.error || "INTENT_UNAVAILABLE" });
      onFailure(failed, null);
      return { state: failed, intent: null };
    }
    if (PROFILE_PENDING.has(profileState?.status)) {
      return { state: publish({ status: "waiting-for-profile", intent: binding.intent }), intent: null };
    }
    if (["error", "unavailable"].includes(profileState?.status)) {
      const failed = publish({ status: "failed", errorCode: "PROFILE_UNAVAILABLE", intent: binding.intent });
      onFailure(failed, binding.intent);
      return { state: failed, intent: null };
    }
    if (!profileState?.profile?.username) {
      const next = publish({ status: "username-required", errorCode: "USERNAME_REQUIRED", intent: binding.intent });
      const key = `${authState.user.id}:${binding.intent.sessionId}`;
      if (usernamePromptKey !== key) {
        usernamePromptKey = key;
        onUsernameRequired(next, binding.intent);
      }
      return { state: next, intent: null };
    }
    usernamePromptKey = null;
    return { state: publish({ status: "ready", intent: binding.intent }), intent: binding.intent };
  };

  const resume = (authState, profileState, { automatic = false } = {}) => {
    const requestedUserId = authState?.status === "signed-in" && typeof authState.user?.id === "string"
      ? authState.user.id
      : null;
    if (activePromise) {
      const settledAwayFromAccount = (
        !AUTH_PENDING.has(authState?.status) &&
        authState?.status !== "signed-in"
      );
      const accountChanged = Boolean(requestedUserId && requestedUserId !== activeUserId);
      if (!settledAwayFromAccount && !accountChanged) return activePromise;
      lifecycleGeneration += 1;
      activePromise = null;
      activeUserId = null;
    }
    const generation = lifecycleGeneration;
    const context = settledContext(authState, profileState);
    if (!context.intent) return Promise.resolve(context.state);
    const key = `${authState.user.id}:${context.intent.sessionId}`;
    if (automatic && automaticAttemptKey === key) return Promise.resolve(state);
    if (automatic) automaticAttemptKey = key;
    const hydrated = hydrate(
      context.intent.mode,
      context.intent.immutablePayload,
      authState,
      profileState,
    );
    if (hydrated.status !== "ready" || hydrated.sessionId !== context.intent.sessionId) {
      const failed = publish({ status: "failed", errorCode: "HYDRATION_FAILED", intent: context.intent });
      onFailure(failed, context.intent);
      return Promise.resolve(failed);
    }
    publish({ status: "submitting", intent: context.intent });
    let submission;
    try {
      submission = submit();
    } catch (error) {
      submission = Promise.reject(error);
    }
    let request = null;
    request = Promise.resolve(submission).then((result) => {
      if (generation !== lifecycleGeneration) return state;
      const finalState = result || submissionState();
      if (["submitted", "already-submitted"].includes(finalState.status)) {
        clearIntent();
        const complete = publish({
          status: finalState.status === "already-submitted" ? "duplicate" : "submitted",
          intent: context.intent,
        });
        onSuccess(complete, context.intent);
        return complete;
      }
      const code = finalState.error?.code || (finalState.status === "offline" ? "OFFLINE" : "SUBMISSION_FAILED");
      const failed = publish({ status: "failed", errorCode: code, intent: context.intent });
      onFailure(failed, context.intent);
      return failed;
    }).catch(() => {
      if (generation !== lifecycleGeneration) return state;
      const failed = publish({ status: "failed", errorCode: "SUBMISSION_FAILED", intent: context.intent });
      onFailure(failed, context.intent);
      return failed;
    }).finally(() => {
      if (activePromise === request) {
        activePromise = null;
        activeUserId = null;
      }
    });
    activeUserId = authState.user.id;
    activePromise = request;
    return request;
  };

  return Object.freeze({
    getState: () => state,
    evaluate(authState, profileState) {
      return resume(authState, profileState, { automatic: true });
    },
    resume: (authState, profileState) => resume(authState, profileState, { automatic: false }),
    discard() {
      lifecycleGeneration += 1;
      activePromise = null;
      activeUserId = null;
      clearIntent();
      automaticAttemptKey = null;
      usernamePromptKey = null;
      return publish({ status: "discarded" });
    },
    resetLifecycle() {
      lifecycleGeneration += 1;
      automaticAttemptKey = null;
      usernamePromptKey = null;
      activePromise = null;
      activeUserId = null;
      const intent = readIntent().intent;
      return publish(intent ? { status: "restoring", intent } : {});
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
  });
}
