import { getSupabaseClient } from "./supabaseClient.js";
import { validateLeaderboardUsername } from "./leaderboardUsername.js";

const ERROR_MESSAGES = Object.freeze({
  NOT_AUTHENTICATED: "Sign in to manage your public username.",
  INVALID_REQUEST: "The profile request is invalid.",
  INVALID_USERNAME: "Use 3–20 letters, numbers, or underscores",
  USERNAME_TAKEN: "Username is already taken",
  PROFILE_ALREADY_EXISTS: "A public username already exists for this account.",
  PROFILE_NOT_FOUND: "No public username exists for this account.",
  CHANGE_COOLDOWN: "Your username cannot be changed yet.",
  METHOD_NOT_ALLOWED: "The profile request is not supported.",
  SERVER_ERROR: "Public profile services are temporarily unavailable.",
});

const freezeProfile = (profile) => profile ? Object.freeze({
  username: String(profile.username || ""),
  usernameChangedAt: profile.usernameChangedAt ?? null,
  canChangeAt: profile.canChangeAt ?? null,
}) : null;

const freezeAvailability = (availability) => availability ? Object.freeze({
  username: String(availability.username || ""),
  available: availability.available === true,
}) : null;

const freezeError = (error) => error ? Object.freeze({
  code: ERROR_MESSAGES[error.code] ? error.code : "SERVER_ERROR",
  message: ERROR_MESSAGES[error.code] || ERROR_MESSAGES.SERVER_ERROR,
  canChangeAt: error.canChangeAt ?? null,
}) : null;

const makeState = ({
  status = "idle",
  profile = null,
  availability = null,
  error = null,
  editing = false,
  draft = "",
  notice = "",
} = {}) => Object.freeze({
  status,
  profile: freezeProfile(profile),
  availability: freezeAvailability(availability),
  error: freezeError(error),
  editing: editing === true,
  draft: String(draft || ""),
  notice: String(notice || ""),
});

async function readFunctionError(error) {
  try {
    if (typeof error?.context?.json === "function") return await error.context.json();
  } catch {
    // Fall through to the safe generic response.
  }
  return null;
}

export function createLeaderboardProfileService({ getClient = getSupabaseClient } = {}) {
  let state = makeState();
  let activeUserId = null;
  let initializationPromise = null;
  let lifecycle = 0;
  const listeners = new Set();

  const publish = (next) => {
    state = makeState(next);
    for (const listener of listeners) { try { listener(state); } catch { /* A view must not break account services. */ } }
    return state;
  };

  const invoke = async (action, username) => {
    const client = getClient();
    if (!client?.functions?.invoke) {
      return { ok: false, error: { code: "SERVER_ERROR" }, unavailable: true };
    }
    try {
      const body = username == null ? { action } : { action, username };
      const { data, error } = await client.functions.invoke("leaderboard-profile", { body });
      if (data?.ok === true || data?.ok === false) return data;
      const errorPayload = await readFunctionError(error);
      if (errorPayload?.ok === false) return errorPayload;
      return { ok: false, error: { code: "SERVER_ERROR" } };
    } catch {
      return { ok: false, error: { code: "SERVER_ERROR" } };
    }
  };

  const initialize = (user, { force = false } = {}) => {
    const userId = typeof user?.id === "string" ? user.id : null;
    if (!userId) {
      lifecycle++;
      activeUserId = null;
      initializationPromise = null;
      return Promise.resolve(publish(makeState()));
    }
    if (userId === activeUserId && initializationPromise) return initializationPromise;
    if (
      !force &&
      userId === activeUserId &&
      ["ready", "needs-username", "checking", "claiming", "changing"].includes(state.status)
    ) return Promise.resolve(state);

    const previousProfile = activeUserId === userId ? state.profile : null;
    const requestLifecycle = ++lifecycle;
    activeUserId = userId;
    publish({ status: previousProfile ? "ready" : "loading", profile: previousProfile });
    const request = (async () => {
      const result = await invoke("get");
      if (activeUserId !== userId || requestLifecycle !== lifecycle) return state;
      if (result.unavailable) return publish({ status: previousProfile ? "ready" : "unavailable", profile: previousProfile });
      if (!result.ok) return publish({ status: previousProfile ? "ready" : "error", profile: previousProfile, error: result.error });
      const profile = result.data?.profile ?? null;
      return publish({
        status: profile ? "ready" : "needs-username",
        profile,
      });
    })();
    initializationPromise = request;
    void request.finally(() => {
      if (initializationPromise === request) initializationPromise = null;
    });
    return request;
  };

  const baseState = (overrides = {}) => ({
    status: state.profile ? "ready" : "needs-username",
    profile: state.profile,
    editing: state.editing,
    draft: state.draft,
    ...overrides,
  });

  const validateOperation = (username) => {
    if (!activeUserId || ["checking", "claiming", "changing"].includes(state.status)) return null;
    const validation = validateLeaderboardUsername(username);
    if (!validation.valid) {
      publish(baseState({
        draft: validation.username,
        error: { code: "INVALID_USERNAME" },
      }));
      return null;
    }
    return validation;
  };

  const check = async (username) => {
    const validation = validateOperation(username);
    if (!validation) return state;
    publish(baseState({ status: "checking", draft: validation.username }));
    const requestLifecycle = lifecycle;
    const result = await invoke("check", validation.username);
    if (requestLifecycle !== lifecycle) return state;
    if (!result.ok) return publish(baseState({ draft: validation.username, error: result.error }));
    return publish(baseState({
      draft: validation.username,
      availability: result.data,
    }));
  };

  const claim = async (username) => {
    const validation = validateOperation(username);
    if (!validation) return state;
    publish(baseState({ status: "claiming", draft: validation.username }));
    const requestLifecycle = lifecycle;
    const result = await invoke("claim", validation.username);
    if (requestLifecycle !== lifecycle) return state;
    if (!result.ok) return publish(baseState({ draft: validation.username, error: result.error }));
    return publish({
      status: "ready",
      profile: result.data?.profile,
      notice: "Username created successfully.",
    });
  };

  const change = async (username) => {
    const validation = validateOperation(username);
    if (!validation) return state;
    publish(baseState({ status: "changing", draft: validation.username, editing: true }));
    const requestLifecycle = lifecycle;
    const result = await invoke("change", validation.username);
    if (requestLifecycle !== lifecycle) return state;
    if (!result.ok) {
      const profile = result.error?.canChangeAt
        ? { ...state.profile, canChangeAt: result.error.canChangeAt }
        : state.profile;
      return publish(baseState({
        profile,
        editing: true,
        draft: validation.username,
        error: result.error,
      }));
    }
    return publish({
      status: "ready",
      profile: result.data?.profile,
      notice: "Username changed successfully.",
    });
  };

  return Object.freeze({
    initializeLeaderboardProfile: initialize,
    getLeaderboardProfileState: () => state,
    subscribeToLeaderboardProfile(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      try { listener(state); } catch { /* View isolation. */ }
      return () => listeners.delete(listener);
    },
    checkUsernameAvailability: check,
    claimUsername: claim,
    changeUsername: change,
    startUsernameChange() {
      if (!state.profile) return state;
      return publish(baseState({ editing: true, draft: state.profile.username }));
    },
    cancelUsernameChange() {
      lifecycle++;
      if (!state.profile) return state;
      return publish(baseState({ editing: false, draft: "" }));
    },
    setUsernameDraft(value) {
      lifecycle++;
      state = makeState({ ...state, status: ["checking", "claiming", "changing"].includes(state.status) ? (state.profile ? "ready" : "needs-username") : state.status, draft: String(value || ""), availability: null, error: null });
      return state;
    },
    resetLeaderboardProfile() {
      lifecycle++;
      activeUserId = null;
      initializationPromise = null;
      return publish(makeState());
    },
  });
}

const leaderboardProfileService = createLeaderboardProfileService();

export const initializeLeaderboardProfile = leaderboardProfileService.initializeLeaderboardProfile;
export const getLeaderboardProfileState = leaderboardProfileService.getLeaderboardProfileState;
export const subscribeToLeaderboardProfile = leaderboardProfileService.subscribeToLeaderboardProfile;
export const checkUsernameAvailability = leaderboardProfileService.checkUsernameAvailability;
export const claimUsername = leaderboardProfileService.claimUsername;
export const changeUsername = leaderboardProfileService.changeUsername;
export const startUsernameChange = leaderboardProfileService.startUsernameChange;
export const cancelUsernameChange = leaderboardProfileService.cancelUsernameChange;
export const setUsernameDraft = leaderboardProfileService.setUsernameDraft;
export const resetLeaderboardProfile = leaderboardProfileService.resetLeaderboardProfile;
