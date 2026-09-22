import { getOAuthRedirectUrl } from "./supabaseConfig.js";
import { getSupabaseClient } from "./supabaseClient.js";

const freezeState = (status, session = null, error = null) => Object.freeze({
  status, session, user: session?.user ?? null, error,
});
const safeError = () => Object.freeze({ message: "Online account request failed." });

export function createAuthService({
  getClient = getSupabaseClient,
  getRedirectUrl = getOAuthRedirectUrl,
  defer = callback => setTimeout(callback, 0),
} = {}) {
  let state = freezeState("idle");
  let initializationPromise = null, reading = false, authSubscription = null;
  let authRevision = 0, notificationRevision = 0;
  const listeners = new Set();
  const notify = value => {
    for (const listener of listeners) { try { listener(value); } catch { /* A broken view cannot break auth or token refresh. */ } }
  };
  const publish = (next, delayed = false) => {
    state = next;
    const revision = ++notificationRevision;
    if (delayed) defer(() => { if (notificationRevision === revision) notify(state); });
    else notify(state);
    return state;
  };
  const stateFromSession = session => freezeState(session?.user ? "signed-in" : "signed-out", session?.user ? session : null);
  const recoverableFailure = () => publish(freezeState(state.session?.user ? "signed-in" : "error", state.session, safeError()));

  const initialize = ({ force = false } = {}) => {
    if (reading || (initializationPromise && !force)) return initializationPromise;
    if (!state.session?.user) publish(freezeState("loading"));
    reading = true;
    const request = (async () => {
      const revision = authRevision;
      try {
        const client = getClient();
        if (!client?.auth) return state.session?.user ? recoverableFailure() : publish(freezeState("unavailable"));
        if (!authSubscription) {
          const response = client.auth.onAuthStateChange?.((event, session) => {
            // A real sign-out/revocation is authoritative. Never restore an old
            // token from a home-grown backup after the SDK has cleared it.
            if (!session?.user && event !== "SIGNED_OUT" && event !== "INITIAL_SESSION") return;
            if (event === "INITIAL_SESSION" && !session?.user && state.session?.user) return;
            authRevision++;
            // Supabase invokes this callback inside its auth operation. Listeners
            // may invoke Functions/getSession; run them on a later task, not under
            // the SDK lock. Update the readable state immediately for consumers.
            publish(stateFromSession(session), true);
          });
          authSubscription = response?.data?.subscription ?? response?.subscription ?? null;
        }
        const { data, error } = await client.auth.getSession();
        if (revision !== authRevision) return state; // A newer sign-in/sign-out already won.
        if (error) return recoverableFailure();
        return publish(stateFromSession(data?.session ?? null));
      } catch {
        return revision !== authRevision ? state : recoverableFailure();
      }
    })();
    initializationPromise = request;
    void request.then(result => {
      reading = false;
      // Missing SDK, denied storage and temporary network errors are retryable.
      if (initializationPromise === request && (result.error || result.status === "unavailable")) initializationPromise = null;
    });
    return request;
  };
  const signIn = async () => {
    if (state.status === "signing-in" || state.status === "signed-in") return state;
    await initialize();
    if (state.status === "signing-in" || state.status === "signed-in") return state;
    const client = getClient();
    if (!client?.auth) return publish(freezeState("unavailable"));
    publish(freezeState("signing-in"));
    try {
      const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: getRedirectUrl() } });
      return error ? recoverableFailure() : state;
    } catch { return recoverableFailure(); }
  };
  const signOutCurrentBrowser = async () => {
    if (state.status === "signing-out") return state;
    await initialize();
    const client = getClient();
    if (!client?.auth) return publish(freezeState("unavailable"));
    const revision = authRevision;
    publish(freezeState("signing-out", state.session));
    try {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (revision !== authRevision) return state;
      if (error) return recoverableFailure();
      authRevision++;
      return publish(freezeState("signed-out"));
    } catch { return revision !== authRevision ? state : recoverableFailure(); }
  };
  return Object.freeze({
    initializeAuth: initialize,
    refreshAuth: () => initialize({ force: true }),
    getAuthState: () => state,
    subscribeToAuth(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      try { listener(state); } catch { /* View isolation. */ }
      return () => listeners.delete(listener);
    },
    signInWithGoogle: signIn,
    signOut: signOutCurrentBrowser,
  });
}
const authService = createAuthService();
export const initializeAuth = authService.initializeAuth;
export const refreshAuth = authService.refreshAuth;
export const getAuthState = authService.getAuthState;
export const subscribeToAuth = authService.subscribeToAuth;
export const signInWithGoogle = authService.signInWithGoogle;
export const signOut = authService.signOut;

let resumeTimer = null;
const recoverOnResume = () => {
  if (globalThis.document?.visibilityState === 'hidden' || resumeTimer != null) return;
  resumeTimer = setTimeout(() => { resumeTimer = null; void refreshAuth(); }, 200);
};
globalThis.addEventListener?.('online', recoverOnResume);
globalThis.addEventListener?.('pageshow', recoverOnResume);
globalThis.document?.addEventListener?.('visibilitychange', recoverOnResume);
